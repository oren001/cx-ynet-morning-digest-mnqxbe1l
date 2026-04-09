```javascript
export const CONFIG = {
  scraping: {
    baseUrl: 'https://www.ynet.co.il',
    maxArticlesPerRun: 50,
    requestTimeout: 10000,
    userAgent: 'PersonalDigestBot/1.0 (News Aggregator; Educational Purpose)',
    retryAttempts: 3,
    retryDelay: 2000,
    respectRobotsTxt: true,
    crawlDelay: 1000,
    sections: [
      '/news',
      '/news/category/184',
      '/news/category/185',
      '/news/category/186',
      '/economy',
      '/sport',
      '/entertainment',
      '/digital',
      '/health',
      '/food',
      '/travel',
      '/culture'
    ]
  },

  cron: {
    scrapeSchedule: '0 */6 * * *',
    digestSchedule: '0 6 * * *',
    cleanupSchedule: '0 2 * * 0'
  },

  digest: {
    articlesPerDigest: 10,
    minArticleScore: 0.3,
    freshnessPenaltyDays: 3,
    maxDigestAge: 24 * 60 * 60,
    includeCategories: true,
    includeSummary: true
  },

  ml: {
    initialCategoryWeights: {
      'חדשות': 0.5,
      'פוליטיקה': 0.5,
      'צבא וביטחון': 0.5,
      'כלכלה': 0.5,
      'ספורט': 0.5,
      'בריאות': 0.5,
      'תרבות': 0.5,
      'בידור': 0.5,
      'טכנולוגיה': 0.5,
      'אוכל': 0.5,
      'תיירות': 0.5,
      'רכב': 0.5,
      'נדל"ן': 0.5,
      'חינוך': 0.5,
      'סביבה': 0.5
    },
    learningRate: 0.1,
    minReadTime: 10000,
    fullReadTime: 60000,
    clickWeight: 0.3,
    readWeight: 0.7,
    timeDecayFactor: 0.95,
    minDataPoints: 5,
    maxHistoryDays: 90
  },

  categories: {
    'חדשות': ['news', 'חדשות', 'ידיעות'],
    'פוליטיקה': ['politics', 'פוליטיקה', 'פוליטי', 'ממשלה', 'כנסת'],
    'צבא וביטחון': ['military', 'security', 'צבא', 'ביטחון', 'צה"ל', 'משטרה'],
    'כלכלה': ['economy', 'business', 'כלכלה', 'עסקים', 'פיננסים', 'בורסה'],
    'ספורט': ['sport', 'sports', 'ספורט', 'כדורגל', 'כדורסל', 'טניס'],
    'בריאות': ['health', 'medical', 'בריאות', 'רפואה', 'רופא'],
    'תרבות': ['culture', 'תרבות', 'אמנות', 'ספרות', 'מוזיקה'],
    'בידור': ['entertainment', 'בידור', 'סלבס', 'קולנוע', 'טלוויזיה'],
    'טכנולוגיה': ['technology', 'tech', 'digital', 'טכנולוגיה', 'דיגיטל', 'היי-טק'],
    'אוכל': ['food', 'אוכל', 'מתכונים', 'גסטרונומיה', 'מסעדות'],
    'תיירות': ['travel', 'tourism', 'תיירות', 'טיולים', 'נסיעות'],
    'רכב': ['cars', 'automotive', 'רכב', 'מכוניות', 'אוטו'],
    'נדל"ן': ['realestate', 'property', 'נדל"ן', 'דיור', 'דירות'],
    'חינוך': ['education', 'חינוך', 'בית ספר', 'אוניברסיטה'],
    'סביבה': ['environment', 'סביבה', 'אקולוגיה', 'אקלים']
  },

  keywords: {
    highPriority: [
      'דחוף',
      'בלעדי',
      'חדש',
      'עכשיו',
      'שעה האחרונה',
      'ראשון',
      'מיוחד'
    ],
    categories: {
      'פוליטיקה': [
        'ביבי',
        'נתניהו',
        'בנט',
        'לפיד',
        'גנץ',
        'ממשלה',
        'קואליציה',
        'אופוזיציה',
        'כנסת',
        'חוק',
        'בחירות',
        'מפלגה'
      ],
      'צבא וביטחון': [
        'צה"ל',
        'גבול',
        'עזה',
        'חמאס',
        'חיזבאללה',
        'איראן',
        'סוריה',
        'טרור',
        'פיגוע',
        'מבצע',
        'תקיפה',
        'רקטה'
      ],
      'כלכלה': [
        'בנק ישראל',
        'ריבית',
        'אינפלציה',
        'דולר',
        'שקל',
        'בורסה',
        'מניות',
        'משכנתא',
        'מיסים',
        'שכר',
        'יוקר המחיה'
      ],
      'ספורט': [
        'מכבי',
        'הפועל',
        'בית"ר',
        'ליגה',
        'אלוף',
        'גביע',
        'אליפות',
        'נבחרת',
        'מונדיאל',
        'יורו',
        'אולימפיאדה'
      ],
      'טכנולוגיה': [
        'סטארט-אפ',
        'היי-טק',
        'גוגל',
        'אפל',
        'מיקרוסופט',
        'בינה מלאכותית',
        'AI',
        'קריפטו',
        'ביטקוין',
        'סייבר'
      ]
    }
  },

  storage: {
    namespaces: {
      users: 'USERS',
      preferences: 'PREFERENCES',
      history: 'HISTORY',
      articles: 'ARTICLES',
      digests: 'DIGESTS',
      analytics: 'ANALYTICS'
    },
    ttl: {
      articles: 7 * 24 * 60 * 60,
      digests: 30 * 24 * 60 * 60,
      history: 90 * 24 * 60 * 60,
      preferences: null,
      analytics: 365 * 24 * 60 * 60
    },
    cacheExpiration: 3600
  },

  api: {
    endpoints: {
      register: '/api/register',
      track: '/api/track',
      digest: '/api/digest',
      analytics: '/api/analytics',
      preferences: '/api/preferences',
      updatePreferences: '/api/preferences/update',
      articles: '/api/articles',
      health: '/api/health'
    },
    cors: {
      allowedOrigins: ['*'],
      allowedMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    },
    rateLimit: {
      maxRequests: 100,
      windowMs: 60000,
      enabled: true
    }
  },

  analytics: {
    metricsToTrack: [
      'articleViews',
      'readTime',
      'clickThrough',
      'digestOpens',
      'categoryEngagement',
      'timeOfDayActivity',
      'deviceType'
    ],
    aggregationPeriods: ['daily', 'weekly', 'monthly'],
    retentionDays: 365
  },

  errors: {
    codes: {
      SCRAPING_FAILED: 'SCRAPING_FAILED',
      INVALID_USER: 'INVALID_USER',
      INVALID_REQUEST: 'INVALID_REQUEST',
      STORAGE_ERROR: 'STORAGE_ERROR',
      RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
      DIGEST_NOT_FOUND: 'DIGEST_NOT_FOUND',
      INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
    },
    messages: {
      SCRAPING_FAILED: 'כשל בסריקת חדשות',
      INVALID_USER: 'משתמש לא תקין',
      INVALID_REQUEST: 'בקשה לא תקינה',
      STORAGE_ERROR: 'שגיאת אחסון',
      RATE_LIMIT_EXCEEDED: 'חרגת ממכסת הבקשות',
      DIGEST_NOT_FOUND: 'תקציר לא נמצא',
      INSUFFICIENT_DATA: 'אין מספיק נתונים ללמידה'
    }
  },

  security: {
    maxRequestSize: 1024 * 100,
    sanitizeInput: true,
    validateOrigin: false,
    requireAuth: false,
    userIdFormat: /^[a-zA-Z0-9-]{8,64}$/
  },

  localization: {
    defaultLanguage: 'he',
    supportedLanguages: ['he'],
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY HH:mm',
    timezone: 'Asia/Jerusalem'
  },

  features: {
    enableMachineLearning: true,
    enableAnalytics: true,
    enableCaching: true,
    enableRateLimiting: true,
    enableErrorReporting: true,
    experimentalFeatures: false
  },

  version: '1.0.0',
  environment: globalThis.ENVIRONMENT || 'production'
};

export const getConfig = (path) => {
  const keys = path.split('.');
  let value = CONFIG;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  return value;
};

export const getCategoryFromKeywords = (text) => {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CONFIG.categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'חדשות';
};

export const isHighPriority = (text) => {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  return CONFIG.keywords.highPriority.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
};

export const extractKeywords = (text, category) => {
  if (!text) return [];
  
  const lowerText = text.toLowerCase();
  const keywords = [];
  
  if (category && CONFIG.keywords.categories[category]) {
    for (const keyword of CONFIG.keywords.categories[category]) {
      if (lowerText.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    }
  }
  
  for (const [cat, catKeywords] of Object.entries(CONFIG.keywords.categories)) {
    for (const keyword of catKeywords) {
      if (lowerText.includes(keyword.toLowerCase()) && !keywords.includes(keyword)) {
        keywords.push(keyword);
      }
    }
  }
  
  return keywords;
};

export default CONFIG;
```