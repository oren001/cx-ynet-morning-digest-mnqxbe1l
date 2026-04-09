```javascript
import { Storage } from '../storage.js';
import { MLEngine } from '../ml-engine.js';
import { DigestGenerator } from '../digest-generator.js';

export class APIRoutes {
  constructor(env) {
    this.storage = new Storage(env);
    this.mlEngine = new MLEngine();
    this.digestGenerator = new DigestGenerator(this.mlEngine);
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
      const existingUser = await this.storage.getUserPreferences(userId);

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

      await this.storage.saveUserPreferences(userId, preferences);

      return new Response(JSON.stringify({ 
        success: true, 
        userId,
        message: 'User registered successfully'
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Registration failed', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleTrackReading(request) {
    try {
      const body = await request.json();
      const { userId, articleId, timeSpent, scrollDepth, completed } = body;

      if (!userId || !articleId) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const preferences = await this.storage.getUserPreferences(userId);
      if (!preferences) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const article = await this.storage.getArticle(articleId);
      if (!article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const readingEvent = {
        articleId,
        userId,
        timestamp: new Date().toISOString(),
        timeSpent: timeSpent || 0,
        scrollDepth: scrollDepth || 0,
        completed: completed || false,
        category: article.category,
        author: article.author,
        keywords: article.keywords || []
      };

      await this.storage.saveReadingHistory(userId, readingEvent);

      const allHistory = await this.storage.getReadingHistory(userId);
      const updatedPreferences = this.mlEngine.updatePreferences(preferences, allHistory);
      updatedPreferences.totalReads = (updatedPreferences.totalReads || 0) + 1;
      updatedPreferences.lastUpdated = new Date().toISOString();

      await this.storage.saveUserPreferences(userId, updatedPreferences);

      return new Response(JSON.stringify({ 
        success: true,
        message: 'Reading tracked successfully',
        preferencesUpdated: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Tracking failed', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleGetDigest(request) {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get('userId');
      const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const preferences = await this.storage.getUserPreferences(userId);
      if (!preferences) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const digest = await this.storage.getDigest(userId, date);
      if (!digest) {
        return new Response(JSON.stringify({ 
          error: 'No digest found for this date',
          message: 'Digest will be generated at 6 AM daily'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const articlesWithDetails = await Promise.all(
        digest.articles.map(async (item) => {
          const article = await this.storage.getArticle(item.articleId);
          return {
            ...article,
            score: item.score,
            rank: item.rank
          };
        })
      );

      return new Response(JSON.stringify({
        success: true,
        digest: {
          ...digest,
          articles: articlesWithDetails
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch digest', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleGetAnalytics(request) {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const preferences = await this.storage.getUserPreferences(userId);
      if (!preferences) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const readingHistory = await this.storage.getReadingHistory(userId);
      
      const analytics = this.calculateAnalytics(preferences, readingHistory);

      return new Response(JSON.stringify({
        success: true,
        analytics
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch analytics', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleGetPreferences(request) {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const preferences = await this.storage.getUserPreferences(userId);
      if (!preferences) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        preferences
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch preferences', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleUpdatePreferences(request) {
    try {
      const body = await request.json();
      const { userId, updates } = body;

      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const preferences = await this.storage.getUserPreferences(userId);
      if (!preferences) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updatedPreferences = {
        ...preferences,
        ...updates,
        lastUpdated: new Date().toISOString()
      };

      await this.storage.saveUserPreferences(userId, updatedPreferences);

      return new Response(JSON.stringify({
        success: true,
        message: 'Preferences updated successfully',
        preferences: updatedPreferences
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to update preferences', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleGetRecentArticles(request) {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const category = url.searchParams.get('category');

      const articles = await this.storage.getRecentArticles(limit, category);

      return new Response(JSON.stringify({
        success: true,
        articles,
        count: articles.length
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch articles', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  calculateAnalytics(preferences, readingHistory) {
    const totalReads = readingHistory.length;
    
    const categoryStats = {};
    const authorStats = {};
    const keywordStats = {};
    const readingTimes = [];
    const completionRates = [];

    readingHistory.forEach(event => {
      categoryStats[event.category] = (categoryStats[event.category] || 0) + 1;
      
      if (event.author) {
        authorStats[event.author] = (authorStats[event.author] || 0) + 1;
      }
      
      if (event.keywords) {
        event.keywords.forEach(keyword => {
          keywordStats[keyword] = (keywordStats[keyword] || 0) + 1;
        });
      }
      
      if (event.timeSpent) {
        readingTimes.push(event.timeSpent);
      }
      
      if (event.scrollDepth !== undefined) {
        completionRates.push(event.scrollDepth);
      }
    });

    const topCategories = Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count, percentage: ((count / totalReads) * 100).toFixed(1) }));

    const topAuthors = Object.entries(authorStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([author, count]) => ({ author, count }));

    const topKeywords = Object.entries(keywordStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    const avgReadingTime = readingTimes.length > 0
      ? Math.round(readingTimes.reduce((a, b) => a + b, 0) / readingTimes.length)
      : 0;

    const avgCompletion = completionRates.length > 0
      ? Math.round(completionRates.reduce((a, b) => a + b, 0) / completionRates.length)
      : 0;

    const recentActivity = readingHistory
      .slice(-7)
      .map(event => ({
        date: new Date(event.timestamp).toISOString().split('T')[0],
        category: event.category,
        timeSpent: event.timeSpent
      }));

    return {
      totalReads,
      topCategories,
      topAuthors,
      topKeywords,
      avgReadingTime,
      avgCompletion,
      recentActivity,
      categoryWeights: preferences.categoryWeights || {},
      keywordWeights: preferences.keywordWeights || {},
      authorWeights: preferences.authorWeights || {},
      registeredAt: preferences.createdAt,
      lastActive: preferences.lastUpdated
    };
  }

  generateUserId(email) {
    const hash = this.simpleHash(email.toLowerCase());
    return `user_${hash}`;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async handleOptions(request) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  addCorsHeaders(response) {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  async route(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return this.handleOptions(request);
    }

    let response;

    try {
      if (path === '/api/register' && method === 'POST') {
        response = await this.handleRegister(request);
      } else if (path === '/api/track' && method === 'POST') {
        response = await this.handleTrackReading(request);
      } else if (path === '/api/digest' && method === 'GET') {
        response = await this.handleGetDigest(request);
      } else if (path === '/api/analytics' && method === 'GET') {
        response = await this.handleGetAnalytics(request);
      } else if (path === '/api/preferences' && method === 'GET') {
        response = await this.handleGetPreferences(request);
      } else if (path === '/api/preferences' && method === 'PUT') {
        response = await this.handleUpdatePreferences(request);
      } else if (path === '/api/articles' && method === 'GET') {
        response = await this.handleGetRecentArticles(request);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return this.addCorsHeaders(response);
    } catch (error) {
      response = new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
      return this.addCorsHeaders(response);
    }
  }
}
```