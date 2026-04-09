```javascript
import { calculateArticleScore } from './ml-engine.js';

/**
 * Generates a personalized daily digest for a user
 * @param {Array} articles - Array of article objects from scraper
 * @param {Object} userPreferences - User's preference data from storage
 * @param {Array} readingHistory - User's reading history
 * @returns {Object} Digest object with ranked articles and metadata
 */
export async function generateDigest(articles, userPreferences, readingHistory) {
  if (!articles || articles.length === 0) {
    return {
      id: generateDigestId(),
      date: new Date().toISOString(),
      articles: [],
      summary: 'אין מאמרים זמינים היום',
      totalArticles: 0,
      generated: new Date().toISOString()
    };
  }

  const readArticleUrls = new Set(
    (readingHistory || []).map(item => item.articleUrl)
  );

  const unreadArticles = articles.filter(article => 
    !readArticleUrls.has(article.url)
  );

  const scoredArticles = unreadArticles.map(article => {
    const score = calculateArticleScore(article, userPreferences, readingHistory);
    return {
      ...article,
      score: score,
      relevanceReason: generateRelevanceReason(article, userPreferences, score)
    };
  });

  scoredArticles.sort((a, b) => b.score - a.score);

  const topArticles = scoredArticles.slice(0, 10);

  const categoryCounts = countCategories(topArticles);
  const summary = generateSummary(topArticles, categoryCounts);

  return {
    id: generateDigestId(),
    date: new Date().toISOString(),
    articles: topArticles,
    summary: summary,
    totalArticles: topArticles.length,
    categoryCounts: categoryCounts,
    generated: new Date().toISOString(),
    expiresAt: getExpirationTime()
  };
}

/**
 * Generates a unique digest ID
 * @returns {string} Unique digest identifier
 */
function generateDigestId() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8);
  return `digest_${dateStr}_${random}`;
}

/**
 * Counts articles by category
 * @param {Array} articles - Array of articles
 * @returns {Object} Category counts
 */
function countCategories(articles) {
  const counts = {};
  articles.forEach(article => {
    const category = article.category || 'אחר';
    counts[category] = (counts[category] || 0) + 1;
  });
  return counts;
}

/**
 * Generates a human-readable summary of the digest
 * @param {Array} articles - Top articles
 * @param {Object} categoryCounts - Category distribution
 * @returns {string} Summary text in Hebrew
 */
function generateSummary(articles, categoryCounts) {
  if (articles.length === 0) {
    return 'אין מאמרים מותאמים אישית זמינים היום';
  }

  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${cat} (${count})`)
    .join(', ');

  const totalArticles = articles.length;
  const avgScore = (articles.reduce((sum, a) => sum + a.score, 0) / totalArticles).toFixed(1);

  return `${totalArticles} מאמרים מותאמים אישית עבורך היום. קטגוריות מובילות: ${topCategories}. ציון רלוונטיות ממוצע: ${avgScore}`;
}

/**
 * Generates a reason why an article is relevant to the user
 * @param {Object} article - Article object
 * @param {Object} preferences - User preferences
 * @param {number} score - Article score
 * @returns {string} Reason in Hebrew
 */
function generateRelevanceReason(article, preferences, score) {
  if (!preferences || !preferences.categoryWeights) {
    return 'מאמר פופולרי';
  }

  const reasons = [];

  const categoryWeight = preferences.categoryWeights[article.category];
  if (categoryWeight && categoryWeight > 0.3) {
    reasons.push(`אתה קורא הרבה ${article.category}`);
  }

  if (preferences.favoriteAuthors && preferences.favoriteAuthors.includes(article.author)) {
    reasons.push(`מאת ${article.author} שאתה אוהב`);
  }

  if (preferences.keywords && article.keywords) {
    const matchedKeywords = article.keywords.filter(kw => 
      preferences.keywords.some(userKw => userKw.toLowerCase().includes(kw.toLowerCase()))
    );
    if (matchedKeywords.length > 0) {
      reasons.push(`מכיל נושאים שמעניינים אותך`);
    }
  }

  if (reasons.length === 0) {
    if (score > 70) {
      return 'התאמה גבוהה להעדפותיך';
    } else if (score > 50) {
      return 'מומלץ על סמך דפוסי הקריאה שלך';
    } else {
      return 'נושא שעשוי לעניין אותך';
    }
  }

  return reasons.slice(0, 2).join(' ו');
}

/**
 * Gets expiration time for digest (24 hours from now)
 * @returns {string} ISO timestamp
 */
function getExpirationTime() {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 24);
  return expiration.toISOString();
}

/**
 * Formats digest for email/notification delivery
 * @param {Object} digest - Digest object
 * @returns {string} Formatted text
 */
export function formatDigestForDelivery(digest) {
  if (!digest || !digest.articles || digest.articles.length === 0) {
    return 'אין מאמרים מותאמים אישית זמינים היום';
  }

  let text = `📰 התקציר האישי שלך - ${new Date().toLocaleDateString('he-IL')}\n\n`;
  text += `${digest.summary}\n\n`;
  text += `המאמרים המובילים עבורך:\n\n`;

  digest.articles.slice(0, 5).forEach((article, index) => {
    text += `${index + 1}. ${article.title}\n`;
    text += `   ${article.category} | ${article.relevanceReason}\n`;
    if (article.preview) {
      text += `   ${article.preview.substring(0, 100)}...\n`;
    }
    text += `   קישור: ${article.url}\n\n`;
  });

  return text;
}

/**
 * Creates a shareable digest link
 * @param {string} userId - User ID
 * @param {string} digestId - Digest ID
 * @returns {string} Shareable URL
 */
export function createDigestLink(userId, digestId) {
  return `/digest/${userId}/${digestId}`;
}

/**
 * Validates if a digest is still valid (not expired)
 * @param {Object} digest - Digest object
 * @returns {boolean} True if valid
 */
export function isDigestValid(digest) {
  if (!digest || !digest.expiresAt) {
    return false;
  }

  const expirationTime = new Date(digest.expiresAt);
  const now = new Date();

  return now < expirationTime;
}

/**
 * Merges multiple digest versions (for updates during the day)
 * @param {Object} oldDigest - Previous digest
 * @param {Object} newDigest - New digest
 * @returns {Object} Merged digest
 */
export function mergeDigests(oldDigest, newDigest) {
  if (!oldDigest) {
    return newDigest;
  }

  const existingUrls = new Set(oldDigest.articles.map(a => a.url));
  
  const newArticles = newDigest.articles.filter(article => 
    !existingUrls.has(article.url)
  );

  const allArticles = [...oldDigest.articles, ...newArticles];
  
  allArticles.sort((a, b) => b.score - a.score);

  const topArticles = allArticles.slice(0, 10);
  const categoryCounts = countCategories(topArticles);

  return {
    ...newDigest,
    articles: topArticles,
    categoryCounts: categoryCounts,
    summary: generateSummary(topArticles, categoryCounts),
    totalArticles: topArticles.length
  };
}

/**
 * Generates digest statistics for analytics
 * @param {Object} digest - Digest object
 * @param {Array} clickedArticles - Articles that were clicked
 * @returns {Object} Statistics
 */
export function generateDigestStats(digest, clickedArticles = []) {
  const clickedUrls = new Set(clickedArticles.map(a => a.url));
  
  const clickedCount = digest.articles.filter(article => 
    clickedUrls.has(article.url)
  ).length;

  const clickRate = digest.articles.length > 0 
    ? (clickedCount / digest.articles.length) * 100 
    : 0;

  const avgScore = digest.articles.length > 0
    ? digest.articles.reduce((sum, a) => sum + a.score, 0) / digest.articles.length
    : 0;

  const topCategory = Object.entries(digest.categoryCounts || {})
    .sort((a, b) => b[1] - a[1])[0];

  return {
    totalArticles: digest.articles.length,
    clickedArticles: clickedCount,
    clickRate: clickRate.toFixed(1),
    averageScore: avgScore.toFixed(1),
    topCategory: topCategory ? topCategory[0] : 'אין',
    categoryDistribution: digest.categoryCounts,
    generated: digest.generated
  };
}
```