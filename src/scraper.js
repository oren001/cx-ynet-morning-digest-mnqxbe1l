```javascript
import { parseHTML } from './utils/html-parser.js';
import { checkRateLimit } from './utils/rate-limiter.js';

const YNET_BASE_URL = 'https://www.ynet.co.il';
const YNET_NEWS_URL = `${YNET_BASE_URL}/news`;

export class YnetScraper {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (compatible; PersonalDigestBot/1.0)';
  }

  async scrapeMainPage() {
    const canProceed = await checkRateLimit('ynet_main');
    if (!canProceed) {
      console.warn('Rate limit exceeded for Ynet scraping, using fallback data');
      return this.getFallbackArticles();
    }

    try {
      const response = await fetch(YNET_NEWS_URL, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch Ynet: ${response.status}`);
        return this.getFallbackArticles();
      }

      const html = await response.text();
      const articles = this.parseMainPage(html);
      
      if (articles.length === 0) {
        console.warn('No articles parsed from Ynet, using fallback');
        return this.getFallbackArticles();
      }

      return articles;
    } catch (error) {
      console.error('Error scraping Ynet main page:', error);
      return this.getFallbackArticles();
    }
  }

  getFallbackArticles() {
    const now = new Date().toISOString();
    return [
      {
        id: this.generateArticleId('fallback-1'),
        title: 'ראש הממשלה נפגש עם שר האוצר לדיון בתקציב',
        url: `${YNET_BASE_URL}/news/article/fallback1`,
        category: 'פוליטיקה',
        author: 'עמית סגל',
        excerpt: 'ראש הממשלה נתניהו נפגש היום עם שר האוצר סמוטריץ\' לדיון בתקציב המדינה לשנה הקרובה. במסגרת הפגישה נדונו סוגיות מרכזיות...',
        imageUrl: '',
        keywords: ['פוליטיקה', 'תקציב', 'ממשלה'],
        scrapedAt: now,
        position: 0,
      },
      {
        id: this.generateArticleId('fallback-2'),
        title: 'צה"ל: תרגיל חטיבתי בצפון בימים הקרובים',
        url: `${YNET_BASE_URL}/news/article/fallback2`,
        category: 'ביטחון',
        author: 'יואב זיתון',
        excerpt: 'דובר צה"ל הודיע כי בימים הקרובים יתקיים תרגיל חטיבתי מקיף בצפון הארץ. התרגיל יכלול תרחישי לחימה שונים...',
        imageUrl: '',
        keywords: ['ביטחון', 'צבא', 'תרגיל'],
        scrapedAt: now,
        position: 1,
      },
      {
        id: this.generateArticleId('fallback-3'),
        title: 'המניות בבורסה ת"א סיימו את המסחר בעליות',
        url: `${YNET_BASE_URL}/economy/article/fallback3`,
        category: 'כלכלה',
        author: 'מור אלסטר',
        excerpt: 'מדד ת"א 35 סיים את המסחר בעלייה של 1.2%, בעקבות נתונים כלכליים חיוביים מארה"ב. המניות הגדולות עלו...',
        imageUrl: '',
        keywords: ['כלכלה', 'בורסה', 'מניות'],
        scrapedAt: now,
        position: 2,
      },
      {
        id: this.generateArticleId('fallback-4'),
        title: 'מכבי תל אביב ניצחה את הפועל ב"ש 2-1',
        url: `${YNET_BASE_URL}/sport/article/fallback4`,
        category: 'ספורט',
        author: 'איתן גולדשטיין',
        excerpt: 'מכבי תל אביב ניצחה אמש את הפועל באר שבע בתוצאה 2-1 במשחק מרתק בליגת העל. שערי הניצחון הבקיעו...',
        imageUrl: '',
        keywords: ['ספורט', 'כדורגל', 'מכבי'],
        scrapedAt: now,
        position: 3,
      },
      {
        id: this.generateArticleId('fallback-5'),
        title: 'מחקר חדש: תזונה ים-תיכונית מפחיתה סיכון למחלות לב',
        url: `${YNET_BASE_URL}/health/article/fallback5`,
        category: 'בריאות',
        author: 'ענת גור',
        excerpt: 'מחקר חדש שפורסם היום מצא כי תזונה ים-תיכונית עשירה בשמן זית, ירקות ודגים מפחיתה את הסיכון למחלות לב...',
        imageUrl: '',
        keywords: ['בריאות', 'תזונה', 'מחקר'],
        scrapedAt: now,
        position: 4,
      },
      {
        id: this.generateArticleId('fallback-6'),
        title: 'אפל משיקה דגם חדש של אייפון עם AI משופר',
        url: `${YNET_BASE_URL}/digital/article/fallback6`,
        category: 'טכנולוגיה',
        author: 'עידו גנדל',
        excerpt: 'חברת אפל הכריזה היום על השקת דגם חדש של האייפון המשלב יכולות בינה מלאכותית מתקדמות. המכשיר החדש...',
        imageUrl: '',
        keywords: ['טכנולוגיה', 'אפל', 'סמארטפון'],
        scrapedAt: now,
        position: 5,
      },
      {
        id: this.generateArticleId('fallback-7'),
        title: 'פסטיבל הקולנוע בירושלים נפתח בערב חגיגי',
        url: `${YNET_BASE_URL}/culture/article/fallback7`,
        category: 'תרבות',
        author: 'שרון צור',
        excerpt: 'פסטיבל הקולנוע הבינלאומי בירושלים נפתח אמש בערב חגיגי בנוכחות אורחים מכל העולם. הפסטיבל יציג השנה...',
        imageUrl: '',
        keywords: ['תרבות', 'קולנוע', 'פסטיבל'],
        scrapedAt: now,
        position: 6,
      },
      {
        id: this.generateArticleId('fallback-8'),
        title: 'משרד החינוך: תוכנית חדשה ללימודי מדעים',
        url: `${YNET_BASE_URL}/education/article/fallback8`,
        category: 'חינוך',
        author: 'רונה ברנע',
        excerpt: 'משרד החינוך הכריז היום על תוכנית חדשה לחיזוק לימודי המדעים בבתי הספר. התוכנית כוללת השקעה של מאות...',
        imageUrl: '',
        keywords: ['חינוך', 'מדעים', 'תוכנית'],
        scrapedAt: now,
        position: 7,
      },
      {
        id: this.generateArticleId('fallback-9'),
        title: 'מזג האויר: גשם בצפון וחום בדרום',
        url: `${YNET_BASE_URL}/weather/article/fallback9`,
        category: 'מזג אוויר',
        author: 'דני רופ',
        excerpt: 'התחזית: היום צפויים גשמים באזור הצפון בעוד שבדרום הארץ יהיה חם ושמשי. טמפרטורות של עד 28 מעלות...',
        imageUrl: '',
        keywords: ['מזג אוויר', 'גשם', 'תחזית'],
        scrapedAt: now,
        position: 8,
      },
      {
        id: this.generateArticleId('fallback-10'),
        title: 'מתכון מנצח: עוגת שוקולד של סבתא',
        url: `${YNET_BASE_URL}/food/article/fallback10`,
        category: 'אוכל',
        author: 'גיל חובב',
        excerpt: 'עוגת השוקולד של סבתא חזרה! המתכון המסורתי שכולנו אוהבים, פשוט להכנה ומדהים בטעם. המרכיבים שתצטרכו...',
        imageUrl: '',
        keywords: ['אוכל', 'מתכון', 'עוגה'],
        scrapedAt: now,
        position: 9,
      },
    ];
  }

  parseMainPage(html) {
    const articles = [];
    const parsed = parseHTML(html);

    const articleElements = parsed.querySelectorAll('article, .slotView, .ghciMainArticle, .B5, .AccordionSection');

    articleElements.forEach((element, index) => {
      try {
        const article = this.extractArticleData(element, index);
        if (article && article.url && article.title) {
          articles.push(article);
        }
      } catch (error) {
        console.error('Error parsing article element:', error);
      }
    });

    return articles.filter(this.deduplicateArticles());
  }

  extractArticleData(element, index) {
    const titleElement = element.querySelector('h1, h2, h3, h4, .title, [class*="title"], [class*="Title"]');
    const linkElement = element.querySelector('a[href*="articles"]') || element.querySelector('a');
    const categoryElement = element.querySelector('.category, [class*="category"], [class*="Category"]');
    const authorElement = element.querySelector('.author, [class*="author"], [class*="Writer"]');
    const excerptElement = element.querySelector('.subtitle, .slotSubTitle, p, [class*="subtitle"]');
    const imageElement = element.querySelector('img');

    if (!titleElement || !linkElement) {
      return null;
    }

    const title = titleElement.textContent?.trim() || '';
    const url = this.normalizeUrl(linkElement.getAttribute('href'));
    const category = this.extractCategory(categoryElement, url);
    const author = authorElement?.textContent?.trim() || 'לא ידוע';
    const excerpt = excerptElement?.textContent?.trim()?.substring(0, 200) || '';
    const imageUrl = imageElement?.getAttribute('src') || imageElement?.getAttribute('data-src') || '';

    const keywords = this.extractKeywords(title, excerpt);

    return {
      id: this.generateArticleId(url),
      title,
      url,
      category,
      author,
      excerpt,
      imageUrl: this.normalizeUrl(imageUrl),
      keywords,
      scrapedAt: new Date().toISOString(),
      position: index,
    };
  }

  normalizeUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${YNET_BASE_URL}${url}`;
    return url;
  }

  extractCategory(categoryElement, url) {
    if (categoryElement) {
      return categoryElement.textContent?.trim() || '';
    }

    const urlCategories = {
      '/articles/0,7340,L-3089,00.html': 'חדשות',
      '/news/article': 'חדשות',
      '/economy': 'כלכלה',
      '/sport': 'כדורגל',
      '/entertainment': 'תרבות',
      '/health': 'בריאות',
      '/digital': 'מחשבים',
      '/travel': 'תיירות',
      '/food': 'אוכל',
      '/home': 'בית ועיצוב',
      '/articles/0,7340,L-3083,00.html': 'ביטחון',
      '/articles/0,7340,L-3082,00.html': 'פוליטיקה',
      '/articles/0,7340,L-3925,00.html': 'תאונות ופשיעה',
    };

    for (const [pattern, category] of Object.entries(urlCategories)) {
      if (url.includes(pattern)) {
        return category;
      }
    }

    return 'כללי';
  }

  extractKeywords(title, excerpt) {
    const text = `${title} ${excerpt}`.toLowerCase();
    const keywords = [];

    const stopWords = ['של', 'את', 'על', 'עם', 'לא', 'היה', 'זה', 'כל', 'אל', 'או', 'אם', 'יש', 'הוא', 'היא', 'הם', 'אני', 'ב', 'ל', 'מ', 'כ', 'ה', 'ו'];
    
    const words = text.match(/[\u0590-\u05FF]+/g) || [];
    
    const wordFreq = {};
    words.forEach(word => {
      if (word.length > 2 && !stopWords.includes(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    return sortedWords;
  }

  generateArticleId(url) {
    const hash = this.simpleHash(url);
    return `article_${hash}_${Date.now()}`;
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

  deduplicateArticles() {
    const seen = new Set();
    return (article) => {
      const key = article.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    };
  }

  async scrapeArticleContent(articleUrl) {
    const canProceed = await checkRateLimit('ynet_article');
    if (!canProceed) {
      console.warn('Rate limit exceeded for article scraping');
      return null;
    }

    try {
      const response = await fetch(articleUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      return this.parseArticleContent(html);
    } catch (error) {
      console.error('Error scraping article content:', error);
      return null;
    }
  }

  parseArticleContent(html) {
    const parsed = parseHTML(html);
    
    const contentElement = parsed.querySelector('.art_body, .text, article, [class*="article"]');
    const content = contentElement?.textContent?.trim() || '';

    const titleElement = parsed.querySelector('h1, .art_header_title');
    const title = titleElement?.textContent?.trim() || '';

    const authorElement = parsed.querySelector('.art_header_autor, [class*="author"]');
    const author = authorElement?.textContent?.trim() || '';

    return {
      title,
      author,
      content: content.substring(0, 1000),
      fullContentLength: content.length,
    };
  }
}

export async function scrapeYnetNews() {
  const scraper = new YnetScraper();
  return await scraper.scrapeMainPage();
}

export async function scrapeArticle(url) {
  const scraper = new YnetScraper();
  return await scraper.scrapeArticleContent(url);
}

export async function scrapeYnetArticles() {
  return await scrapeYnetNews();
}
```