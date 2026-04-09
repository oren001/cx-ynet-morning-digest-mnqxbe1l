```javascript
import { generateDigest } from './digest-generator.js';
import { Storage } from './storage.js';
import { MLEngine } from './ml-engine.js';
import { YnetScraper } from './scraper.js';

export class APIRoutes {
  constructor(env) {
    this.storage = new Storage(env);
    this.mlEngine = new MLEngine();
    this.scraper = new YnetScraper();
  }

  generateUserId(email) {
    return Buffer.from(email).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  }

  async handleRegister(request) {
    try {
      const body = await request.json();
      const { email, name, categories } = body;

      if (!email || !email.includes('@')) {
        return new Response(JSON.stringify({ error: 'Invalid email' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const userId = this.generateUserId(email);
      const existingUser = await this.storage.getUser(userId);

      if (existingUser) {
        return new Response(JSON.stringify({ error: 'User already exists', userId }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const preferences = {
        userId,
        email,
        name: name || email.split('@')[0],
        categories: categories || [],
        categoryWeights: {},
        keywordWeights: {},
        authorWeights: {},
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        totalReads: 0,
        digestEnabled: true
      };

      await this.storage.saveUser(userId, preferences);

      return new Response(JSON.stringify({ 
        success: true, 
        userId,
        message: 'User registered successfully'
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Registration error:', error);
      return new Response(JSON.stringify({ error: 'Registration failed', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleGetDigest(userId) {
    try {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const user = await this.storage.getUser(userId);
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const today = new Date().toISOString().split('T')[0];
      const digestKey = `digest:${userId}:${today}`;
      let digest = await this.storage.getDigest(digestKey);

      if (!digest) {
        const articles = await this.storage.getRecentArticles(50);
        const readingHistory = await this.storage.getReadingHistory(userId);
        
        digest = await generateDigest(articles, user, readingHistory);
        await this.storage.saveDigest(digestKey, digest);
      }

      const formattedDigest = {
        id: digest.id,
        date: digest.date,
        dateFormatted: new Date(digest.date).toLocaleDateString('he-IL', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        }),
        articles: digest.articles.map(article => ({
          id: article.id,
          title: article.title,
          description: article.description || '',
          url: article.url,
          category: article.category || 'כללי',
          publishedAt: article.publishedAt,
          score: Math.round(article.score * 100) / 100,
          imageUrl: article.imageUrl || '',
          author: article.author || '',
          relevanceReason: article.relevanceReason || 'מאמר מומלץ'
        })),
        summary: digest.summary,
        totalArticles: digest.articles.length,
        categoryCounts: digest.categoryCounts || {},
        generated: digest.generated
      };

      return new Response(JSON.stringify(formattedDigest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Get digest error:', error);
      return new Response(JSON.stringify({ error: 'Failed to get digest', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleTrackReading(request) {
    try {
      const body = await request.json();
      const { userId, articleId, articleUrl, duration, completed } = body;

      if (!userId || !articleId) {
        return new Response(JSON.stringify({ error: 'Missing userId or articleId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const user = await this.storage.getUser(userId);
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const readEvent = {
        userId,
        articleId,
        articleUrl: articleUrl || '',
        duration: duration || 0,
        completed: completed || false,
        timestamp: new Date().toISOString()
      };

      await this.storage.trackReading(userId, readEvent);

      const article = await this.storage.getArticle(articleId);
      if (article) {
        await this.mlEngine.updatePreferences(user, article, readEvent);
        user.totalReads = (user.totalReads || 0) + 1;
        user.lastUpdated = new Date().toISOString();
        await this.storage.saveUser(userId, user);
      }

      return new Response(JSON.stringify({ 
        success: true,
        message: 'Reading tracked successfully'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Track reading error:', error);
      return new Response(JSON.stringify({ error: 'Failed to track reading', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleGetAnalytics(userId) {
    try {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const user = await this.storage.getUser(userId);
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const readingHistory = await this.storage.getReadingHistory(userId);
      
      const totalReads = readingHistory.length;
      const completedReads = readingHistory.filter(r => r.completed).length;
      const avgDuration = readingHistory.length > 0 
        ? Math.round(readingHistory.reduce((sum, r) => sum + (r.duration || 0), 0) / readingHistory.length)
        : 0;

      const categoryCounts = {};
      readingHistory.forEach(read => {
        const category = read.category || 'אחר';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });

      const last7Days = readingHistory.filter(r => {
        const date = new Date(r.timestamp);
        const now = new Date();
        const diff = now - date;
        return diff < 7 * 24 * 60 * 60 * 1000;
      }).length;

      const last30Days = readingHistory.filter(r => {
        const date = new Date(r.timestamp);
        const now = new Date();
        const diff = now - date;
        return diff < 30 * 24 * 60 * 60 * 1000;
      }).length;

      const analytics = {
        userId,
        totalReads,
        completedReads,
        completionRate: totalReads > 0 ? Math.round((completedReads / totalReads) * 100) : 0,
        averageDuration: avgDuration,
        categoryCounts,
        topCategories: Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([category, count]) => ({ category, count })),
        readingStreak: {
          last7Days,
          last30Days
        },
        categoryWeights: user.categoryWeights || {},
        topKeywords: Object.entries(user.keywordWeights || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([keyword, weight]) => ({ keyword, weight: Math.round(weight * 100) / 100 })),
        lastUpdated: user.lastUpdated || user.createdAt
      };

      return new Response(JSON.stringify(analytics), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      return new Response(JSON.stringify({ error: 'Failed to get analytics', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleRefreshDigest(userId) {
    try {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const user = await this.storage.getUser(userId);
      if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const articles = await this.storage.getRecentArticles(50);
      const readingHistory = await this.storage.getReadingHistory(userId);
      
      const digest = await generateDigest(articles, user, readingHistory);
      
      const today = new Date().toISOString().split('T')[0];
      const digestKey = `digest:${userId}:${today}`;
      await this.storage.saveDigest(digestKey, digest);

      const formattedDigest = {
        id: digest.id,
        date: digest.date,
        dateFormatted: new Date(digest.date).toLocaleDateString('he-IL', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        }),
        articles: digest.articles.map(article => ({
          id: article.id,
          title: article.title,
          description: article.description || '',
          url: article.url,
          category: article.category || 'כללי',
          publishedAt: article.publishedAt,
          score: Math.round(article.score * 100) / 100,
          imageUrl: article.imageUrl || '',
          author: article.author || '',
          relevanceReason: article.relevanceReason || 'מאמר מומלץ'
        })),
        summary: digest.summary,
        totalArticles: digest.articles.length,
        categoryCounts: digest.categoryCounts || {},
        generated: digest.generated
      };

      return new Response(JSON.stringify(formattedDigest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Refresh digest error:', error);
      return new Response(JSON.stringify({ error: 'Failed to refresh digest', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}

export function parseRequest(request) {
  const url = new URL(request.url);
  return {
    path: url.pathname,
    method: request.method,
    query: Object.fromEntries(url.searchParams)
  };
}

export function jsonResponse(data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

export function errorResponse(message, status = 500, headers = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}
```