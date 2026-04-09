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
      throw new Error('Rate limit exceeded for Ynet scraping');
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
        throw new Error(`Failed to fetch Ynet: ${response.status}`);
      }

      const html = await response.text();
      const articles = this.parseMainPage(html);
      
      return articles;
    } catch (error) {
      console.error('Error scraping Ynet main page:', error);
      throw error;
    }
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
      throw new Error('Rate limit exceeded for article scraping');
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
```