```javascript
export class Storage {
  constructor(kv) {
    this.kv = kv;
  }

  // User Management
  async createUser(userId, email) {
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
  }

  async getUser(userId) {
    const data = await this.kv.get(`user:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async getUserByEmail(email) {
    const userId = await this.kv.get(`email:${email}`);
    if (!userId) return null;
    return this.getUser(userId);
  }

  async updateUserPreferences(userId, preferences) {
    const user = await this.getUser(userId);
    if (!user) return null;

    user.preferences = {
      ...user.preferences,
      ...preferences
    };

    await this.kv.put(`user:${userId}`, JSON.stringify(user));
    return user;
  }

  async updateUserSettings(userId, settings) {
    const user = await this.getUser(userId);
    if (!user) return null;

    user.settings = {
      ...user.settings,
      ...settings
    };

    await this.kv.put(`user:${userId}`, JSON.stringify(user));
    return user;
  }

  // Reading History
  async trackReading(userId, articleId, articleData) {
    const timestamp = Date.now();
    const readingKey = `reading:${userId}:${timestamp}:${articleId}`;
    
    const reading = {
      articleId,
      userId,
      timestamp,
      category: articleData.category || 'general',
      author: articleData.author || 'unknown',
      keywords: articleData.keywords || [],
      title: articleData.title || ''
    };

    await this.kv.put(readingKey, JSON.stringify(reading), {
      expirationTtl: 90 * 24 * 60 * 60 // 90 days
    });

    // Update article read count
    const articleKey = `article:${articleId}`;
    const article = await this.kv.get(articleKey);
    if (article) {
      const articleData = JSON.parse(article);
      articleData.readCount = (articleData.readCount || 0) + 1;
      await this.kv.put(articleKey, JSON.stringify(articleData), {
        expirationTtl: 7 * 24 * 60 * 60 // 7 days
      });
    }

    return reading;
  }

  async getReadingHistory(userId, limit = 100) {
    const prefix = `reading:${userId}:`;
    const list = await this.kv.list({ prefix, limit });
    
    const readings = await Promise.all(
      list.keys.map(async (key) => {
        const data = await this.kv.get(key.name);
        return data ? JSON.parse(data) : null;
      })
    );

    return readings.filter(r => r !== null).sort((a, b) => b.timestamp - a.timestamp);
  }

  async getReadingHistorySince(userId, sinceTimestamp) {
    const allReadings = await this.getReadingHistory(userId, 1000);
    return allReadings.filter(r => r.timestamp >= sinceTimestamp);
  }

  // Article Cache
  async cacheArticle(articleId, articleData) {
    const key = `article:${articleId}`;
    const article = {
      ...articleData,
      id: articleId,
      cachedAt: Date.now(),
      readCount: 0
    };

    await this.kv.put(key, JSON.stringify(article), {
      expirationTtl: 7 * 24 * 60 * 60 // 7 days
    });

    return article;
  }

  async getArticle(articleId) {
    const data = await this.kv.get(`article:${articleId}`);
    return data ? JSON.parse(data) : null;
  }

  async cacheArticles(articles) {
    const promises = articles.map(article => 
      this.cacheArticle(article.id || article.url, article)
    );
    return Promise.all(promises);
  }

  async getArticlesByIds(articleIds) {
    const promises = articleIds.map(id => this.getArticle(id));
    const articles = await Promise.all(promises);
    return articles.filter(a => a !== null);
  }

  // Daily Articles Pool
  async saveDailyArticles(date, articles) {
    const key = `daily:${date}`;
    const data = {
      date,
      articles,
      scrapedAt: Date.now(),
      count: articles.length
    };

    await this.kv.put(key, JSON.stringify(data), {
      expirationTtl: 7 * 24 * 60 * 60 // 7 days
    });

    return data;
  }

  async getDailyArticles(date) {
    const data = await this.kv.get(`daily:${date}`);
    return data ? JSON.parse(data) : null;
  }

  async getTodayArticles() {
    const today = new Date().toISOString().split('T')[0];
    return this.getDailyArticles(today);
  }

  // Digest Management
  async saveDigest(userId, date, digest) {
    const key = `digest:${userId}:${date}`;
    const data = {
      userId,
      date,
      articles: digest.articles,
      generatedAt: Date.now(),
      opened: false,
      openedAt: null
    };

    await this.kv.put(key, JSON.stringify(data), {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days
    });

    // Save reference to latest digest
    await this.kv.put(`digest:${userId}:latest`, date);

    return data;
  }

  async getDigest(userId, date) {
    const data = await this.kv.get(`digest:${userId}:${date}`);
    return data ? JSON.parse(data) : null;
  }

  async getLatestDigest(userId) {
    const latestDate = await this.kv.get(`digest:${userId}:latest`);
    if (!latestDate) return null;
    return this.getDigest(userId, latestDate);
  }

  async getTodayDigest(userId) {
    const today = new Date().toISOString().split('T')[0];
    return this.getDigest(userId, today);
  }

  async markDigestOpened(userId, date) {
    const digest = await this.getDigest(userId, date);
    if (!digest) return null;

    digest.opened = true;
    digest.openedAt = Date.now();

    await this.kv.put(`digest:${userId}:${date}`, JSON.stringify(digest), {
      expirationTtl: 30 * 24 * 60 * 60
    });

    return digest;
  }

  async getUserDigests(userId, limit = 30) {
    const prefix = `digest:${userId}:`;
    const list = await this.kv.list({ prefix, limit: limit + 1 }); // +1 for 'latest' key
    
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
  }

  // Analytics
  async getAnalytics(userId) {
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
  }

  // Cleanup utilities
  async cleanupOldReadings(userId, daysToKeep = 90) {
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
  }

  async getAllUsers() {
    const list = await this.kv.list({ prefix: 'user:' });
    const users = await Promise.all(
      list.keys.map(async (key) => {
        const data = await this.kv.get(key.name);
        return data ? JSON.parse(data) : null;
      })
    );
    return users.filter(u => u !== null);
  }
}
```