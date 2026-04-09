```javascript
export class MLEngine {
  constructor() {
    this.INITIAL_CATEGORY_WEIGHT = 1.0;
    this.CATEGORY_INCREMENT = 0.3;
    this.CATEGORY_DECAY = 0.95;
    this.KEYWORD_WEIGHT = 0.5;
    this.AUTHOR_WEIGHT = 0.4;
    this.TIME_DECAY_DAYS = 30;
    this.MIN_WEIGHT = 0.1;
    this.MAX_WEIGHT = 10.0;
  }

  calculateArticleScore(article, userPreferences, readingHistory) {
    const categoryScore = this.calculateCategoryScore(article, userPreferences);
    const keywordScore = this.calculateKeywordScore(article, userPreferences);
    const authorScore = this.calculateAuthorScore(article, userPreferences);
    const recencyBoost = this.calculateRecencyBoost(article);
    const diversityPenalty = this.calculateDiversityPenalty(article, readingHistory);

    const baseScore = (categoryScore * 0.5) + (keywordScore * 0.3) + (authorScore * 0.2);
    const finalScore = baseScore * recencyBoost * diversityPenalty;

    return Math.max(0, Math.min(100, finalScore));
  }

  calculateCategoryScore(article, userPreferences) {
    if (!article.category || !userPreferences.categoryWeights) {
      return this.INITIAL_CATEGORY_WEIGHT;
    }

    const categoryWeight = userPreferences.categoryWeights[article.category] || this.INITIAL_CATEGORY_WEIGHT;
    return this.normalizeWeight(categoryWeight);
  }

  calculateKeywordScore(article, userPreferences) {
    if (!userPreferences.keywords || Object.keys(userPreferences.keywords).length === 0) {
      return this.INITIAL_CATEGORY_WEIGHT;
    }

    const articleText = `${article.title} ${article.description || ''} ${article.keywords?.join(' ') || ''}`.toLowerCase();
    let matchScore = 0;
    let totalWeight = 0;

    for (const [keyword, weight] of Object.entries(userPreferences.keywords)) {
      if (articleText.includes(keyword.toLowerCase())) {
        matchScore += weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      return this.INITIAL_CATEGORY_WEIGHT;
    }

    return this.normalizeWeight(matchScore / Math.max(1, Object.keys(userPreferences.keywords).length * 0.1));
  }

  calculateAuthorScore(article, userPreferences) {
    if (!article.author || !userPreferences.authorWeights) {
      return this.INITIAL_CATEGORY_WEIGHT;
    }

    const authorWeight = userPreferences.authorWeights[article.author] || this.INITIAL_CATEGORY_WEIGHT;
    return this.normalizeWeight(authorWeight);
  }

  calculateRecencyBoost(article) {
    if (!article.publishedAt) {
      return 1.0;
    }

    const articleDate = new Date(article.publishedAt);
    const now = new Date();
    const hoursOld = (now - articleDate) / (1000 * 60 * 60);

    if (hoursOld < 0) return 1.0;
    if (hoursOld <= 2) return 1.3;
    if (hoursOld <= 6) return 1.2;
    if (hoursOld <= 12) return 1.1;
    if (hoursOld <= 24) return 1.0;
    if (hoursOld <= 48) return 0.9;
    return 0.7;
  }

  calculateDiversityPenalty(article, readingHistory) {
    if (!readingHistory || readingHistory.length === 0) {
      return 1.0;
    }

    const recentReads = readingHistory.slice(-20);
    const categoryCounts = {};
    
    for (const read of recentReads) {
      if (read.category) {
        categoryCounts[read.category] = (categoryCounts[read.category] || 0) + 1;
      }
    }

    if (!article.category) {
      return 1.0;
    }

    const categoryCount = categoryCounts[article.category] || 0;
    const maxCount = Math.max(...Object.values(categoryCounts), 1);
    
    if (categoryCount === maxCount && categoryCount > 5) {
      return 0.8;
    }

    return 1.0;
  }

  updatePreferences(userPreferences, readArticle, readingDuration) {
    const updatedPreferences = JSON.parse(JSON.stringify(userPreferences));

    if (!updatedPreferences.categoryWeights) {
      updatedPreferences.categoryWeights = {};
    }
    if (!updatedPreferences.keywords) {
      updatedPreferences.keywords = {};
    }
    if (!updatedPreferences.authorWeights) {
      updatedPreferences.authorWeights = {};
    }

    const engagementMultiplier = this.calculateEngagementMultiplier(readingDuration);

    if (readArticle.category) {
      const currentWeight = updatedPreferences.categoryWeights[readArticle.category] || this.INITIAL_CATEGORY_WEIGHT;
      updatedPreferences.categoryWeights[readArticle.category] = Math.min(
        this.MAX_WEIGHT,
        currentWeight + (this.CATEGORY_INCREMENT * engagementMultiplier)
      );
    }

    if (readArticle.author) {
      const currentWeight = updatedPreferences.authorWeights[readArticle.author] || this.INITIAL_CATEGORY_WEIGHT;
      updatedPreferences.authorWeights[readArticle.author] = Math.min(
        this.MAX_WEIGHT,
        currentWeight + (this.AUTHOR_WEIGHT * engagementMultiplier)
      );
    }

    if (readArticle.keywords && Array.isArray(readArticle.keywords)) {
      for (const keyword of readArticle.keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (normalizedKeyword.length > 2) {
          const currentWeight = updatedPreferences.keywords[normalizedKeyword] || this.INITIAL_CATEGORY_WEIGHT;
          updatedPreferences.keywords[normalizedKeyword] = Math.min(
            this.MAX_WEIGHT,
            currentWeight + (this.KEYWORD_WEIGHT * engagementMultiplier)
          );
        }
      }
    }

    const titleWords = this.extractKeywords(readArticle.title);
    for (const word of titleWords) {
      const normalizedWord = word.toLowerCase().trim();
      if (normalizedWord.length > 3) {
        const currentWeight = updatedPreferences.keywords[normalizedWord] || this.INITIAL_CATEGORY_WEIGHT;
        updatedPreferences.keywords[normalizedWord] = Math.min(
          this.MAX_WEIGHT,
          currentWeight + (this.KEYWORD_WEIGHT * 0.5 * engagementMultiplier)
        );
      }
    }

    this.applyDecay(updatedPreferences);
    this.pruneWeights(updatedPreferences);

    return updatedPreferences;
  }

  calculateEngagementMultiplier(readingDuration) {
    if (!readingDuration || readingDuration < 0) {
      return 0.5;
    }

    if (readingDuration < 5) return 0.3;
    if (readingDuration < 15) return 0.6;
    if (readingDuration < 30) return 1.0;
    if (readingDuration < 60) return 1.3;
    if (readingDuration < 120) return 1.5;
    return 1.7;
  }

  applyDecay(preferences) {
    for (const category in preferences.categoryWeights) {
      preferences.categoryWeights[category] = Math.max(
        this.MIN_WEIGHT,
        preferences.categoryWeights[category] * this.CATEGORY_DECAY
      );
    }

    for (const keyword in preferences.keywords) {
      preferences.keywords[keyword] = Math.max(
        this.MIN_WEIGHT,
        preferences.keywords[keyword] * this.CATEGORY_DECAY
      );
    }

    for (const author in preferences.authorWeights) {
      preferences.authorWeights[author] = Math.max(
        this.MIN_WEIGHT,
        preferences.authorWeights[author] * this.CATEGORY_DECAY
      );
    }
  }

  pruneWeights(preferences) {
    const maxKeywords = 100;
    const maxAuthors = 50;

    if (Object.keys(preferences.keywords).length > maxKeywords) {
      const sortedKeywords = Object.entries(preferences.keywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords);
      preferences.keywords = Object.fromEntries(sortedKeywords);
    }

    if (Object.keys(preferences.authorWeights).length > maxAuthors) {
      const sortedAuthors = Object.entries(preferences.authorWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxAuthors);
      preferences.authorWeights = Object.fromEntries(sortedAuthors);
    }

    for (const category in preferences.categoryWeights) {
      if (preferences.categoryWeights[category] < this.MIN_WEIGHT) {
        delete preferences.categoryWeights[category];
      }
    }

    for (const keyword in preferences.keywords) {
      if (preferences.keywords[keyword] < this.MIN_WEIGHT) {
        delete preferences.keywords[keyword];
      }
    }

    for (const author in preferences.authorWeights) {
      if (preferences.authorWeights[author] < this.MIN_WEIGHT) {
        delete preferences.authorWeights[author];
      }
    }
  }

  normalizeWeight(weight) {
    return Math.max(this.MIN_WEIGHT, Math.min(this.MAX_WEIGHT, weight));
  }

  extractKeywords(text) {
    if (!text) return [];

    const hebrewStopWords = new Set([
      'של', 'את', 'על', 'אל', 'עם', 'זה', 'זו', 'אם', 'כי', 'או', 'גם', 'כל',
      'לא', 'רק', 'יש', 'אין', 'היה', 'הייתה', 'היו', 'להיות', 'יהיה', 'תהיה',
      'אני', 'אתה', 'את', 'הוא', 'היא', 'אנחנו', 'אתם', 'אתן', 'הם', 'הן',
      'מה', 'מי', 'איך', 'למה', 'מדוע', 'איפה', 'מתי', 'כמה', 'which', 'the',
      'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
    ]);

    const words = text.split(/[\s,.:;!?()[\]{}״"']+/)
      .filter(word => word.length > 2)
      .filter(word => !hebrewStopWords.has(word.toLowerCase()))
      .filter(word => !/^\d+$/.test(word));

    return words;
  }

  rankArticles(articles, userPreferences, readingHistory) {
    const scoredArticles = articles.map(article => ({
      ...article,
      score: this.calculateArticleScore(article, userPreferences, readingHistory)
    }));

    scoredArticles.sort((a, b) => b.score - a.score);

    return scoredArticles;
  }

  getTopArticles(articles, userPreferences, readingHistory, count = 10) {
    const ranked = this.rankArticles(articles, userPreferences, readingHistory);
    return ranked.slice(0, count);
  }

  generatePreferenceSummary(preferences) {
    const summary = {
      topCategories: [],
      topKeywords: [],
      topAuthors: [],
      totalInteractions: 0
    };

    if (preferences.categoryWeights) {
      summary.topCategories = Object.entries(preferences.categoryWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, weight]) => ({ category, weight: weight.toFixed(2) }));
    }

    if (preferences.keywords) {
      summary.topKeywords = Object.entries(preferences.keywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, weight]) => ({ keyword, weight: weight.toFixed(2) }));
    }

    if (preferences.authorWeights) {
      summary.topAuthors = Object.entries(preferences.authorWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([author, weight]) => ({ author, weight: weight.toFixed(2) }));
    }

    const categoryCount = Object.keys(preferences.categoryWeights || {}).length;
    const keywordCount = Object.keys(preferences.keywords || {}).length;
    const authorCount = Object.keys(preferences.authorWeights || {}).length;
    summary.totalInteractions = categoryCount + keywordCount + authorCount;

    return summary;
  }

  initializePreferences() {
    return {
      categoryWeights: {},
      keywords: {},
      authorWeights: {},
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }
}
```