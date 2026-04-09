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
      // Serve static HTML files
      if (path === '/' || path === '/index.html') {
        const htmlContent = await env.ASSETS.fetch(request);
        return htmlContent;
      }

      if (path === '/dashboard.html') {
        const htmlContent = await env.ASSETS.fetch(request);
        return htmlContent;
      }

      if (path === '/digest.html' || path === '/digest') {
        const userId = url.searchParams.get('userId') || 'demo-user';
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

        let digest = await storage.getDigest(userId, date);
        
        if (!digest || !digest.articles || digest.articles.length === 0) {
          console.log(`No digest found for ${userId} on ${date}, generating now...`);
          
          const user = await storage.getUser(userId);
          if (!user) {
            const demoUser = {
              userId: 'demo-user',
              email: 'demo@example.com',
              preferences: {},
              createdAt: new Date().toISOString(),
              categoryWeights: {
                'חדשות': 1.5,
                'פוליטיקה': 1.2,
                'כלכלה': 1.0,
                'ספורט': 0.8,
                'בריאות': 1.3
              },
              keywordScores: {},
              authorPreferences: {},
            };
            await storage.saveUser('demo-user', demoUser);
          }

          const articles = await storage.getArticlesByDate(date);
          
          if (!articles || articles.length === 0) {
            console.log('No articles found, scraping now...');
            await runScrapingJob(env);
            const freshArticles = await storage.getArticlesByDate(date);
            if (freshArticles && freshArticles.length > 0) {
              const readingHistory = await storage.getReadingHistory(userId);
              const currentUser = await storage.getUser(userId);
              digest = await generateDigest(currentUser || demoUser, freshArticles, readingHistory);
              await storage.saveDigest(userId, date, digest);
            }
          } else {
            const readingHistory = await storage.getReadingHistory(userId);
            const currentUser = await storage.getUser(userId);
            digest = await generateDigest(currentUser || {
              userId: 'demo-user',
              categoryWeights: {},
              keywordScores: {},
              authorPreferences: {},
            }, articles, readingHistory);
            await storage.saveDigest(userId, date, digest);
          }
        }

        const html = generateDigestHTML(digest, userId);
        return new Response(html, {
          headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            ...corsHeaders 
          },
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
        const userId = url.searchParams.get('userId') || 'demo-user';
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

        let digest = await storage.getDigest(userId, date);

        if (!digest || !digest.articles || digest.articles.length === 0) {
          const user = await storage.getUser(userId);
          const articles = await storage.getArticlesByDate(date);
          
          if (!articles || articles.length === 0) {
            return errorResponse('No articles available', 404, corsHeaders);
          }

          const readingHistory = await storage.getReadingHistory(userId);
          digest = await generateDigest(user || { userId, categoryWeights: {}, keywordScores: {}, authorPreferences: {} }, articles, readingHistory);
          await storage.saveDigest(userId, date, digest);
        }

        return jsonResponse(digest, corsHeaders);
      }

      if (path === '/api/analytics' && method === 'GET') {
        const userId = url.searchParams.get('userId') || 'demo-user';

        const user = await storage.getUser(userId);
        if (!user) {
          return jsonResponse({
            userId,
            categoryWeights: {},
            authorPreferences: {},
            keywordScores: {},
            totalReads: 0,
            completedReads: 0,
            averageDuration: 0,
            lastRead: null,
          }, corsHeaders);
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
        const userId = url.searchParams.get('userId') || 'demo-user';

        let user = await storage.getUser(userId);
        if (!user) {
          user = {
            userId: 'demo-user',
            email: 'demo@example.com',
            preferences: {},
            createdAt: new Date().toISOString(),
            categoryWeights: {},
            keywordScores: {},
            authorPreferences: {},
          };
          await storage.saveUser('demo-user', user);
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

    if (cronType === CONFIG.CRON_SCRAPE_SCHEDULE || cronType === '0 */6 * * *') {
      ctx.waitUntil(runScrapingJob(env));
    } else if (cronType === CONFIG.CRON_DIGEST_SCHEDULE || cronType === '0 6 * * *') {
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

function generateDigestHTML(digest, userId) {
  const today = new Date();
  const dateFormatted = `${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
  const hebrewDate = formatHebrewDate(today);
  
  const articles = digest?.articles || [];
  const totalReads = articles.length;

  const articlesHTML = articles.map((article, index) => `
    <div class="article-item" data-article-id="${article.id || article.url}">
      <div class="article-number">${index + 1}</div>
      <div class="article-content">
        <h3 class="article-title">${escapeHTML(article.title)}</h3>
        ${article.description ? `<p class="article-description">${escapeHTML(article.description)}</p>` : ''}
        <div class="article-meta">
          ${article.category ? `<span class="article-category">${escapeHTML(article.category)}</span>` : ''}
          ${article.author ? `<span class="article-author">${escapeHTML(article.author)}</span>` : ''}
          ${article.publishedAt ? `<span class="article-time">${formatTime(article.publishedAt)}</span>` : ''}
        </div>
      </div>
      ${article.imageUrl ? `<img src="${escapeHTML(article.imageUrl)}" alt="${escapeHTML(article.title)}" class="article-image">` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>התקציר היומי שלך - ${dateFormatted}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            direction: rtl;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
            padding-top: 20px;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .header .date {
            font-size: 1.2em;
            opacity: 0.9;
            margin-bottom: 5px;
        }

        .header .hebrew-date {
            font-size: 1em;
            opacity: 0.8;
        }

        .stats-section {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
        }

        .stats-section h2 {
            color: #667eea;
            font-size: 1.3em;
            margin-bottom: 10px;
        }

        .stats-count {
            font-size: 2em;
            font-weight: bold;
            color: #333;
        }

        .refresh-button {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 1em;
            cursor: pointer;
            margin-top: 10px;
            transition: all 0.3s ease;
        }

        .refresh-button:hover {
            background: #5568d3;
            transform: translateY(-2px);
        }

        .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: white;
        }

        .loading.active {
            display: block;
        }

        .loading-spinner {
            display: inline-block;
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .digest-card {
            background: white;
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        }

        .article-item {
            display: flex;
            gap: 20px;
            padding: 20px;
            margin-bottom: 15px;
            border-radius: 12px;
            background: #f8f9fa;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }

        .article-item:hover {
            background: #e9ecef;
            transform: translateX(-5px);
            border-color: #667eea;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .article-number {
            flex-shrink: 0;
            width: 40px;
            height: 40px;
            background: #667eea;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.2em;
        }

        .article-content {
            flex: 1;
        }

        .article-title {
            font-size: 1.3em;
            color: #333;
            margin-bottom: 10px;
            line-height: 1.4;
        }

        .article-description {
            color: #666;
            margin-bottom: 10px;
            line-height: 1.6;
        }

        .article-meta {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            font-size: 0.9em;
            color: #888;
        }

        .article-category,
        .article-author,
        .article-time {
            display: inline-block;
        }

        .article-category {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
        }

        .article-image {
            width: 150px;
            height: 100px;
            object-fit: cover;
            border-radius: 8px;
            flex-shrink: 0;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }

        .empty-state h3 {
            font-size: 1.5em;
            margin-bottom: 10px;
            color: #667eea;
        }

        @media (max-width: 768px) {
            .article-item {
                flex-direction: column;
            }

            .article-image {
                width: 100%;
                height: 200px;
            }

            .header h1 {
                font-size: 2em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📰 התקציר היומי שלך</h1>
            <div class="date">${dateFormatted}</div>
            <div class="hebrew-date">${hebrewDate}</div>
        </div>

        <div class="stats-section">
            <h2>מאמרים שנקראו היום</h2>
            <div class="stats-count">${totalReads}</div>
            <button class="refresh-button" onclick="refreshDigest()">🔄 רענן תקציר</button>
        </div>

        <div class="loading">
            <div class="loading-spinner"></div>
            <p>טוען תקציר...</p>
        </div>

        <div class="digest-card">
            ${articles.length > 0 ? articlesHTML : `
                <div class="empty-state">
                    <h3>אין מאמרים זמינים</h3>
                    <p>נסה לרענן את התקציר או חזור מאוחר יותר</p>
                </div>
            `}
        </div>
    </div>

    <script>
        const userId = '${userId}';

        document.querySelectorAll('.article-item').forEach(item => {
            const articleId = item.dataset.articleId;
            let startTime = null;

            item.addEventListener('mouseenter', () => {
                startTime = Date.now();
            });

            item.addEventListener('mouseleave', () => {
                if (startTime) {
                    const duration = Date.now() - startTime;
                    startTime = null;
                }
            });

            item.addEventListener('click', async () => {
                const duration = startTime ? Date.now() - startTime : 0;
                const completed = duration > 3000;

                try {
                    await fetch('/api/track-reading', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, articleId, duration, completed })
                    });

                    item.style.opacity = '0.6';
                    
                    const statsCount = document.querySelector('.stats-count');
                    if (statsCount) {
                        const currentCount = parseInt(statsCount.textContent) || 0;
                        statsCount.textContent = currentCount + 1;
                    }
                } catch (error) {
                    console.error('Failed to track reading:', error);
                }
            });
        });

        async function refreshDigest() {
            const loading = document.querySelector('.loading');
            loading.classList.add('active');

            try {
                const response = await fetch('/api/digest?userId=' + userId);
                if (response.ok) {
                    window.location.reload();
                }
            } catch (error) {
                console.error('Failed to refresh digest:', error);
            } finally {
                loading.classList.remove('active');
            }
        }
    </script>
</body>
</html>`;
}

function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

function formatHebrewDate(date) {
  const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  
  const dayName = hebrewDays[date.getDay()];
  const day = date.getDate();
  const month = hebrewMonths[date.getMonth()];
  const year = date.getFullYear();
  
  return `יום ${dayName}, ${day} ב${month} ${year}`;
}