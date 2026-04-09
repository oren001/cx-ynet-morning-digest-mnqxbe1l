```javascript
import { parseRequest, jsonResponse, errorResponse } from './api/routes.js';
import { scrapeYnetArticles } from './scraper.js';
import { generateDigest } from './digest-generator.js';
import { Storage } from './storage.js';
import { CONFIG } from './config.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const storage = new Storage(env.DIGEST_KV);

    try {
      if (path === '/' || path === '/index.html') {
        return new Response('Personal Morning Digest API', {
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      }

      if (path === '/api/register' && method === 'POST') {
        const body = await request.json();
        const { userId, email, preferences } = body;

        if (!userId || !email) {
          return errorResponse('Missing userId or email', 400, corsHeaders);
        }

        const user = {
          userId,
          email,
          preferences: preferences || {},
          createdAt: new Date().toISOString(),
          categoryWeights: {},
          keywordScores: {},
          authorPreferences: {},
        };

        await storage.saveUser(userId, user);

        return jsonResponse({ success: true, userId, message: 'User registered successfully' }, corsHeaders);
      }

      if (path === '/api/track-reading' && method === 'POST') {
        const body = await request.json();
        const { userId, articleId, duration, completed } = body;

        if (!userId || !articleId) {
          return errorResponse('Missing userId or articleId', 400, corsHeaders);
        }

        const readingEvent = {
          articleId,
          userId,
          timestamp: new Date().toISOString(),
          duration: duration || 0,
          completed: completed || false,
        };

        await storage.saveReadingHistory(userId, readingEvent);

        const article = await storage.getArticle(articleId);
        if (article) {
          const user = await storage.getUser(userId);
          if (user) {
            user.categoryWeights = user.categoryWeights || {};
            user.keywordScores = user.keywordScores || {};
            user.authorPreferences = user.authorPreferences || {};

            if (article.category) {
              user.categoryWeights[article.category] = (user.categoryWeights[article.category] || 0) + (completed ? 2 : 1);
            }

            if (article.author) {
              user.authorPreferences[article.author] = (user.authorPreferences[article.author] || 0) + (completed ? 2 : 1);
            }

            if (article.keywords && Array.isArray(article.keywords)) {
              article.keywords.forEach(keyword => {
                user.keywordScores[keyword] = (user.keywordScores[keyword] || 0) + (completed ? 1.5 : 0.5);
              });
            }

            await storage.saveUser(userId, user);
          }
        }

        return jsonResponse({ success: true, message: 'Reading tracked successfully' }, corsHeaders);
      }

      if (path === '/api/digest' && method === 'GET') {
        const userId = url.searchParams.get('userId');
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

        if (!userId) {
          return errorResponse('Missing userId', 400, corsHeaders);
        }

        const digest = await storage.getDigest(userId, date);

        if (!digest) {
          return errorResponse('Digest not found', 404, corsHeaders);
        }

        return jsonResponse(digest, corsHeaders);
      }

      if (path === '/api/analytics' && method === 'GET') {
        const userId = url.searchParams.get('userId');

        if (!userId) {
          return errorResponse('Missing userId', 400, corsHeaders);
        }

        const user = await storage.getUser(userId);
        if (!user) {
          return errorResponse('User not found', 404, corsHeaders);
        }

        const readingHistory = await storage.getReadingHistory(userId);

        const analytics = {
          userId,
          categoryWeights: user.categoryWeights || {},
          authorPreferences: user.authorPreferences || {},
          keywordScores: user.keywordScores || {},
          totalReads: readingHistory.length,
          completedReads: readingHistory.filter(r => r.completed).length,
          averageDuration: readingHistory.length > 0
            ? readingHistory.reduce((sum, r) => sum + (r.duration || 0), 0) / readingHistory.length
            : 0,
          lastRead: readingHistory.length > 0 ? readingHistory[0].timestamp : null,
        };

        return jsonResponse(analytics, corsHeaders);
      }

      if (path === '/api/articles' && method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const articles = await storage.getArticlesByDate(date);

        return jsonResponse({ articles: articles || [] }, corsHeaders);
      }

      if (path === '/api/user' && method === 'GET') {
        const userId = url.searchParams.get('userId');

        if (!userId) {
          return errorResponse('Missing userId', 400, corsHeaders);
        }

        const user = await storage.getUser(userId);
        if (!user) {
          return errorResponse('User not found', 404, corsHeaders);
        }

        return jsonResponse(user, corsHeaders);
      }

      if (path === '/api/trigger-scrape' && method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        const expectedAuth = `Bearer ${env.ADMIN_SECRET || 'change-me-in-production'}`;

        if (authHeader !== expectedAuth) {
          return errorResponse('Unauthorized', 401, corsHeaders);
        }

        ctx.waitUntil(runScrapingJob(env));

        return jsonResponse({ success: true, message: 'Scraping job triggered' }, corsHeaders);
      }

      if (path === '/api/trigger-digest' && method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        const expectedAuth = `Bearer ${env.ADMIN_SECRET || 'change-me-in-production'}`;

        if (authHeader !== expectedAuth) {
          return errorResponse('Unauthorized', 401, corsHeaders);
        }

        ctx.waitUntil(runDigestGeneration(env));

        return jsonResponse({ success: true, message: 'Digest generation triggered' }, corsHeaders);
      }

      return errorResponse('Not found', 404, corsHeaders);

    } catch (error) {
      console.error('Error handling request:', error);
      return errorResponse(error.message || 'Internal server error', 500, corsHeaders);
    }
  },

  async scheduled(event, env, ctx) {
    const cronType = event.cron;

    console.log(`Cron triggered: ${cronType} at ${new Date().toISOString()}`);

    if (cronType === CONFIG.CRON_SCRAPE_SCHEDULE) {
      ctx.waitUntil(runScrapingJob(env));
    } else if (cronType === CONFIG.CRON_DIGEST_SCHEDULE) {
      ctx.waitUntil(runDigestGeneration(env));
    }
  },
};

async function runScrapingJob(env) {
  const storage = new Storage(env.DIGEST_KV);
  const startTime = Date.now();

  try {
    console.log('Starting Ynet scraping job...');

    const articles = await scrapeYnetArticles();

    console.log(`Scraped ${articles.length} articles`);

    const today = new Date().toISOString().split('T')[0];

    for (const article of articles) {
      await storage.saveArticle(article);
    }

    await storage.saveScrapingLog({
      date: today,
      timestamp: new Date().toISOString(),
      articlesScraped: articles.length,
      duration: Date.now() - startTime,
      success: true,
    });

    console.log(`Scraping job completed in ${Date.now() - startTime}ms`);

  } catch (error) {
    console.error('Scraping job failed:', error);

    const today = new Date().toISOString().split('T')[0];
    await storage.saveScrapingLog({
      date: today,
      timestamp: new Date().toISOString(),
      articlesScraped: 0,
      duration: Date.now() - startTime,
      success: false,
      error: error.message,
    });

    throw error;
  }
}

async function runDigestGeneration(env) {
  const storage = new Storage(env.DIGEST_KV);
  const startTime = Date.now();

  try {
    console.log('Starting digest generation...');

    const allUsers = await storage.getAllUsers();

    console.log(`Generating digests for ${allUsers.length} users`);

    const today = new Date().toISOString().split('T')[0];
    const articles = await storage.getArticlesByDate(today);

    if (!articles || articles.length === 0) {
      console.log('No articles available for digest generation');
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    for (const user of allUsers) {
      try {
        const readingHistory = await storage.getReadingHistory(user.userId);

        const digest = await generateDigest(user, articles, readingHistory);

        await storage.saveDigest(user.userId, today, digest);

        successCount++;

      } catch (error) {
        console.error(`Failed to generate digest for user ${user.userId}:`, error);
        failureCount++;
      }
    }

    console.log(`Digest generation completed: ${successCount} success, ${failureCount} failures in ${Date.now() - startTime}ms`);

  } catch (error) {
    console.error('Digest generation job failed:', error);
    throw error;
  }
}
```