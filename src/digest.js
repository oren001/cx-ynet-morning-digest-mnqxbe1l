```javascript
import { MLEngine } from './ml-engine.js';

/**
 * Generates personalized digests for users
 */
export class DigestGenerator {
  constructor(mlEngine) {
    this.mlEngine = mlEngine || new MLEngine();
  }

  /**
   * Generate a personalized digest for a user
   */
  async generateDigest(articles, userPreferences, readingHistory) {
    try {
      if (!articles || articles.length === 0) {
        return {
          id: this.generateDigestId(),
          date: new Date().toISOString(),
          dateDisplay: this.formatHebrewDate(new Date()),
          articles: [],
          summary: 'אין מאמרים זמינים היום',
          totalArticles: 0,
          categoryCounts: {},
          generated: new Date().toISOString(),
          expiresAt: this.getExpirationTime(),
          stats: {
            totalRead: readingHistory ? readingHistory.length : 0,
            lastUpdate: new Date().toISOString()
          }
        };
      }

      // Filter out already read articles
      const readArticleUrls = new Set(
        (readingHistory || []).map(item => item.articleUrl || item.url)
      );

      const unreadArticles = articles.filter(article => 
        article && article.url && !readArticleUrls.has(article.url)
      );

      // Score and rank articles
      const scoredArticles = unreadArticles.map(article => {
        const score = this.mlEngine.calculateArticleScore(article, userPreferences, readingHistory);
        return {
          ...article,
          score: score,
          relevanceReason: this.generateRelevanceReason(article, userPreferences, score)
        };
      });

      // Sort by score descending
      scoredArticles.sort((a, b) => b.score - a.score);

      // Take top 10 articles
      const topArticles = scoredArticles.slice(0, 10);

      // Generate summary and stats
      const categoryCounts = this.countCategories(topArticles);
      const summary = this.generateSummary(topArticles, categoryCounts);

      return {
        id: this.generateDigestId(),
        date: new Date().toISOString(),
        dateDisplay: this.formatHebrewDate(new Date()),
        articles: topArticles,
        summary: summary,
        totalArticles: topArticles.length,
        categoryCounts: categoryCounts,
        generated: new Date().toISOString(),
        expiresAt: this.getExpirationTime(),
        stats: {
          totalRead: readingHistory ? readingHistory.length : 0,
          lastUpdate: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error generating digest:', error);
      throw error;
    }
  }

  /**
   * Generate a relevance reason for an article
   */
  generateRelevanceReason(article, userPreferences, score) {
    const reasons = [];

    // Check category preference
    if (article.category && userPreferences.categoryWeights) {
      const categoryWeight = userPreferences.categoryWeights[article.category];
      if (categoryWeight && categoryWeight > 1.0) {
        reasons.push(`קטגוריה מועדפת: ${article.category}`);
      }
    }

    // Check keyword matches
    if (userPreferences.keywordWeights && Object.keys(userPreferences.keywordWeights).length > 0) {
      const articleText = `${article.title} ${article.description || ''}`.toLowerCase();
      const matchedKeywords = Object.keys(userPreferences.keywordWeights)
        .filter(keyword => articleText.includes(keyword.toLowerCase()))
        .slice(0, 3);
      
      if (matchedKeywords.length > 0) {
        reasons.push(`מילות מפתח: ${matchedKeywords.join(', ')}`);
      }
    }

    // Check author preference
    if (article.author && userPreferences.authorWeights) {
      const authorWeight = userPreferences.authorWeights[article.author];
      if (authorWeight && authorWeight > 1.0) {
        reasons.push(`כותב מועדף: ${article.author}`);
      }
    }

    // Check recency
    if (article.publishDate) {
      const hoursSincePublished = this.getHoursSincePublished(article.publishDate);
      if (hoursSincePublished < 6) {
        reasons.push('מאמר חדש');
      }
    }

    if (reasons.length === 0) {
      if (score > 50) {
        reasons.push('התאמה גבוהה להעדפותיך');
      } else {
        reasons.push('מאמר מומלץ');
      }
    }

    return reasons.join(' • ');
  }

  /**
   * Count articles by category
   */
  countCategories(articles) {
    const counts = {};
    articles.forEach(article => {
      if (article.category) {
        counts[article.category] = (counts[article.category] || 0) + 1;
      }
    });
    return counts;
  }

  /**
   * Generate a summary of the digest
   */
  generateSummary(articles, categoryCounts) {
    if (articles.length === 0) {
      return 'אין מאמרים זמינים היום';
    }

    const categoryNames = Object.keys(categoryCounts)
      .sort((a, b) => categoryCounts[b] - categoryCounts[a])
      .slice(0, 3);

    if (categoryNames.length === 0) {
      return `${articles.length} מאמרים מותאמים אישית עבורך`;
    }

    const categoryText = categoryNames.join(', ');
    return `${articles.length} מאמרים מותאמים אישית, כולל ${categoryText}`;
  }

  /**
   * Generate a unique digest ID
   */
  generateDigestId() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `digest_${dateStr}_${random}`;
  }

  /**
   * Get expiration time (24 hours from now)
   */
  getExpirationTime() {
    const now = new Date();
    const expiration = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return expiration.toISOString();
  }

  /**
   * Format date in Hebrew
   */
  formatHebrewDate(date) {
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const months = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `יום ${dayName}, ${day} ב${month} ${year}`;
  }

  /**
   * Get hours since article was published
   */
  getHoursSincePublished(publishDate) {
    try {
      const published = new Date(publishDate);
      const now = new Date();
      const diffMs = now - published;
      return diffMs / (1000 * 60 * 60);
    } catch (error) {
      return 999; // Unknown age
    }
  }
}

/**
 * Standalone function for backward compatibility
 */
export async function generateDigest(articles, userPreferences, readingHistory) {
  const generator = new DigestGenerator();
  return generator.generateDigest(articles, userPreferences, readingHistory);
}

/**
 * Calculate article score (exported for use by other modules)
 */
export function calculateArticleScore(article, userPreferences, readingHistory) {
  const mlEngine = new MLEngine();
  return mlEngine.calculateArticleScore(article, userPreferences, readingHistory);
}

/**
 * Generate digest ID
 */
export function generateDigestId() {
  const generator = new DigestGenerator();
  return generator.generateDigestId();
}

/**
 * Generate relevance reason
 */
export function generateRelevanceReason(article, userPreferences, score) {
  const generator = new DigestGenerator();
  return generator.generateRelevanceReason(article, userPreferences, score);
}

/**
 * Count categories in articles
 */
export function countCategories(articles) {
  const generator = new DigestGenerator();
  return generator.countCategories(articles);
}

/**
 * Generate summary text
 */
export function generateSummary(articles, categoryCounts) {
  const generator = new DigestGenerator();
  return generator.generateSummary(articles, categoryCounts);
}
```