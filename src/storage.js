```javascript
export class Storage {
  constructor(env) {
    if (env && env.DIGEST_KV) {
      this.kv = env.DIGEST_KV;
    } else if (env && typeof env.get === 'function') {
      this.kv = env;
    } else {
      throw new Error('Storage requires a valid KV namespace');
    }
  }

  // User Management
  async createUser(userId, email) {
    try {
      const user = {
        id: userId,
        email,
        createdAt: Date.now(),
        preferences: {
          categories: {},
          keywords: {},
          authors: {}
        },
        settings: {
          digestTime: '06:00',
          maxArticles: 10,
          enabled: true
        }
      };
      
      await this.kv.put(`user:${userId}`, JSON.stringify(user));
      await this.kv.put(`email:${email}`, userId);
      
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async getUser(userId) {
    try {
      const data = await this.kv.get(`user:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async getUserByEmail(email) {
    try {
      const userId = await this.kv.get(`email:${email}`);
      if (!userId) return null;
      return this.getUser(userId);
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  async updateUserPreferences(userId, preferences) {
    try {
      const user = await this.getUser(userId);
      if (!user) return null;

      user.preferences = {
        ...user.preferences,
        ...preferences
      };

      await this.kv.put(`user:${userId}`, JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  async updateUserSettings(userId, settings) {
    try {
      const user = await this.getUser(userId);
      if (!user) return null;

      user.settings = {
        ...user.settings,
        ...settings
      };

      await this.kv.put(`user:${userId}`, JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Error updating user settings:', error);
      throw error;
    }
  }

  // Reading History
  async trackReading(userId, articleId, articleData) {
    try {
      const timestamp = Date.now();
      const readingKey = `reading:${userId}:${timestamp}:${articleId}`;
      
      const reading = {
        articleId,
        userId,
        timestamp,
        category: articleData.category || 'general',
        author: articleData.author || 'unknown',
        keywords: articleData.keywords || [],
        title: articleData.title || '',
        articleUrl: articleData.url || articleData.articleUrl || ''
      };

      await this.kv.put(readingKey, JSON.stringify(reading), {
        expirationTtl: 90 * 24 * 60 * 60
      });

      const articleKey = `article:${articleId}`;
      const article = await this.kv.get(articleKey);
      if (article) {
        const articleData = JSON.parse(article);
        articleData.readCount = (articleData.readCount || 0) + 1;
        await this.kv.put(articleKey, JSON.stringify(articleData), {
          expirationTtl: 7 * 24 * 60 * 60
        });
      }

      return reading;
    } catch (error) {
      console.error('Error tracking reading:', error);
      throw error;
    }
  }

  async getReadingHistory(userId, limit = 100) {
    try {
      const prefix = `reading:${userId}:`;
      const list = await this.kv.list({ prefix, limit });
      
      const readings = await Promise.all(
        list.keys.map(async (key) => {
          const data = await this.kv.get(key.name);
          return data ? JSON.parse(data) : null;
        })
      );

      return readings.filter(r => r !== null).sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error getting reading history:', error);
      return [];
    }
  }

  async getReadingHistorySince(userId, sinceTimestamp) {
    try {
      const allReadings = await this.getReadingHistory(userId, 1000);
      return allReadings.filter(r => r.timestamp >= sinceTimestamp);
    } catch (error) {
      console.error('Error getting reading history since:', error);
      return [];
    }
  }

  async getReadingCount(userId) {
    try {
      const readings = await this.getReadingHistory(userId, 10000);
      return readings.length;
    } catch (error) {
      console.error('Error getting reading count:', error);
      return 0;
    }
  }

  // Article Cache
  async cacheArticle(articleId, articleData) {
    try {
      const key = `article:${articleId}`;
      const article = {
        ...articleData,
        id: articleId,
        cachedAt: Date.now(),
        readCount: 0
      };

      await this.kv.put(key, JSON.stringify(article), {
        expirationTtl: 7 * 24 * 60 * 60
      });

      return article;
    } catch (error) {
      console.error('Error caching article:', error);
      throw error;
    }
  }

  async getArticle(articleId) {
    try {
      const data = await this.kv.get(`article:${articleId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting article:', error);
      return null;
    }
  }

  async cacheArticles(articles) {
    try {
      const promises = articles.map(article => 
        this.cacheArticle(article.id || article.url, article)
      );
      return Promise.all(promises);
    } catch (error) {
      console.error('Error caching articles:', error);
      throw error;
    }
  }

  async getArticlesByIds(articleIds) {
    try {
      const promises = articleIds.map(id => this.getArticle(id));
      const articles = await Promise.all(promises);
      return articles.filter(a => a !== null);
    } catch (error) {
      console.error('Error getting articles by ids:', error);
      return [];
    }
  }

  // Daily Articles Pool
  async saveDailyArticles(date, articles) {
    try {
      const key = `daily:${date}`;
      const data = {
        date,
        articles,
        scrapedAt: Date.now(),
        count: articles.length
      };

      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: 7 * 24 * 60 * 60
      });

      return data;
    } catch (error) {
      console.error('Error saving daily articles:', error);
      throw error;
    }
  }

  async getDailyArticles(date) {
    try {
      const data = await this.kv.get(`daily:${date}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting daily articles:', error);
      return null;
    }
  }

  async getTodayArticles() {
    try {
      const today = new Date().toISOString().split('T')[0];
      return this.getDailyArticles(today);
    } catch (error) {
      console.error('Error getting today articles:', error);
      return null;
    }
  }

  // Digest Management
  async saveDigest(userId, date, digest) {
    try {
      const key = `digest:${userId}:${date}`;
      const data = {
        userId,
        date,
        articles: digest.articles || [],
        generatedAt: Date.now(),
        opened: false,
        openedAt: null
      };

      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: 30 * 24 * 60 * 60
      });

      await this.kv.put(`digest:${userId}:latest`, date);

      return data;
    } catch (error) {
      console.error('Error saving digest:', error);
      throw error;
    }
  }

  async getDigest(userId, date) {
    try {
      const data = await this.kv.get(`digest:${userId}:${date}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting digest:', error);
      return null;
    }
  }

  async getLatestDigest(userId) {
    try {
      const latestDate = await this.kv.get(`digest:${userId}:latest`);
      if (!latestDate) return null;
      return this.getDigest(userId, latestDate);
    } catch (error) {
      console.error('Error getting latest digest:', error);
      return null;
    }
  }

  async getTodayDigest(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      return this.getDigest(userId, today);
    } catch (error) {
      console.error('Error getting today digest:', error);
      return null;
    }
  }

  async markDigestOpened(userId, date) {
    try {
      const digest = await this.getDigest(userId, date);
      if (!digest) return null;

      digest.opened = true;
      digest.openedAt = Date.now();

      await this.kv.put(`digest:${userId}:${date}`, JSON.stringify(digest), {
        expirationTtl: 30 * 24 * 60 * 60
      });

      return digest;
    } catch (error) {
      console.error('Error marking digest opened:', error);
      throw error;
    }
  }

  async getUserDigests(userId, limit = 30) {
    try {
      const prefix = `digest:${userId}:`;
      const list = await this.kv.list({ prefix, limit: limit + 1 });
      
      const digests = await Promise.all(
        list.keys
          .filter(key => !key.name.endsWith(':latest'))
          .map(async (key) => {
            const data = await this.kv.get(key.name);
            return data ? JSON.parse(data) : null;
          })
      );

      return digests
        .filter(d => d !== null)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error('Error getting user digests:', error);
      return [];
    }
  }

  // User Preferences (alias methods)
  async getUserPreferences(userId) {
    try {
      const user = await this.getUser(userId);
      if (!user) return null;
      return {
        userId: user.id,
        email: user.email,
        categoryWeights: user.preferences?.categories || {},
        keywords: user.preferences?.keywords || {},
        authors: user.preferences?.authors || {},
        settings: user.settings || {}
      };
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return null;
    }
  }

  async saveUserPreferences(userId, preferences) {
    try {
      const user = await this.getUser(userId);
      if (user) {
        user.preferences = {
          categories: preferences.categoryWeights || {},
          keywords: preferences.keywords || {},
          authors: preferences.authors || {}
        };
        if (preferences.settings) {
          user.settings = preferences.settings;
        }
        await this.kv.put(`user:${userId}`, JSON.stringify(user));
        return user;
      } else {
        const newUser = await this.createUser(userId, preferences.email || 'unknown@example.com');
        return newUser;
      }
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  }

  async saveUser(userId, userData) {
    try {
      const user = {
        id: userId,
        email: userData.email,
        createdAt: userData.createdAt || Date.now(),
        preferences: {
          categories: userData.categoryWeights || {},
          keywords: userData.keywordScores || {},
          authors: userData.authorPreferences || {}
        },
        settings: userData.preferences || {
          digestTime: '06:00',
          maxArticles: 10,
          enabled: true
        }
      };
      
      await this.kv.put(`user:${userId}`, JSON.stringify(user));
      if (userData.email) {
        await this.kv.put(`email:${userData.email}`, userId);
      }
      
      return user;
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  // Analytics
  async getAnalytics(userId) {
    try {
      const [user, readingHistory, digests] = await Promise.all([
        this.getUser(userId),
        this.getReadingHistory(userId, 500),
        this.getUserDigests(userId)
      ]);

      if (!user) return null;

      const last30Days = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const recentReadings = readingHistory.filter(r => r.timestamp >= last30Days);

      const categoryCounts = {};
      const authorCounts = {};
      const keywordCounts = {};

      recentReadings.forEach(reading => {
        categoryCounts[reading.category] = (categoryCounts[reading.category] || 0) + 1;
        authorCounts[reading.author] = (authorCounts[reading.author] || 0) + 1;
        reading.keywords.forEach(keyword => {
          keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
        });
      });

      const digestStats = {
        total: digests.length,
        opened: digests.filter(d => d.opened).length,
        openRate: digests.length > 0 
          ? (digests.filter(d => d.opened).length / digests.length * 100).toFixed(1)
          : 0
      };

      return {
        userId,
        totalReadings: readingHistory.length,
        recentReadings: recentReadings.length,
        categoryCounts,
        authorCounts,
        keywordCounts,
        topCategories: Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([category, count]) => ({ category, count })),
        topAuthors: Object.entries(authorCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([author, count]) => ({ author, count })),
        topKeywords: Object.entries(keywordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([keyword, count]) => ({ keyword, count })),
        digestStats,
        preferences: user.preferences
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      return null;
    }
  }

  // Cleanup utilities
  async cleanupOldReadings(userId, daysToKeep = 90) {
    try {
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      const prefix = `reading:${userId}:`;
      const list = await this.kv.list({ prefix });
      
      let deletedCount = 0;
      for (const key of list.keys) {
        const parts = key.name.split(':');
        const timestamp = parseInt(parts[2]);
        if (timestamp < cutoffTime) {
          await this.kv.delete(key.name);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old readings:', error);
      return 0;
    }
  }

  async getAllUsers() {
    try {
      const list = await this.kv.list({ prefix: 'user:' });
      const users = await Promise.all(
        list.keys.map(async (key) => {
          const data = await this.kv.get(key.name);
          return data ? JSON.parse(data) : null;
        })
      );
      return users.filter(u => u !== null);
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }
}