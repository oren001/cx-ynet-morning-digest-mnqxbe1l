```javascript
export class YnetHTMLParser {
  static parseArticleList(html) {
    const articles = [];
    
    // Ynet main page structure - looking for article containers
    const articlePatterns = [
      /<article[^>]*>(.*?)<\/article>/gs,
      /<div[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)<\/div>/gs,
      /<div[^>]*data-tb-region="[^"]*"[^>]*>(.*?)<\/div>/gs
    ];

    let matches = [];
    for (const pattern of articlePatterns) {
      const found = [...html.matchAll(pattern)];
      if (found.length > 0) {
        matches = found;
        break;
      }
    }

    for (const match of matches) {
      const articleHtml = match[0];
      const article = this.parseArticleCard(articleHtml);
      if (article && article.url && article.title) {
        articles.push(article);
      }
    }

    return articles;
  }

  static parseArticleCard(html) {
    const article = {
      url: null,
      title: null,
      category: null,
      author: null,
      preview: null,
      imageUrl: null,
      publishedAt: null
    };

    // Extract URL
    const urlMatch = html.match(/href="([^"]*(?:articles|news|sport|economy|tourism|entertainment|digital|health|fashion|food|culture)[^"]*)"/i);
    if (urlMatch) {
      article.url = this.normalizeUrl(urlMatch[1]);
    }

    // Extract title
    const titlePatterns = [
      /<h[1-6][^>]*>(.*?)<\/h[1-6]>/i,
      /<a[^>]*title="([^"]+)"/i,
      /<span[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/span>/i
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match) {
        article.title = this.cleanText(match[1]);
        break;
      }
    }

    // Extract category from URL or class
    article.category = this.extractCategory(html, article.url);

    // Extract author
    const authorPatterns = [
      /<span[^>]*class="[^"]*author[^"]*"[^>]*>(.*?)<\/span>/i,
      /<div[^>]*class="[^"]*byline[^"]*"[^>]*>(.*?)<\/div>/i,
      /מאת\s*:?\s*([א-ת\s]+)/i
    ];

    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match) {
        article.author = this.cleanText(match[1]);
        break;
      }
    }

    // Extract preview/description
    const previewPatterns = [
      /<p[^>]*class="[^"]*(?:subtitle|description|preview)[^"]*"[^>]*>(.*?)<\/p>/i,
      /<div[^>]*class="[^"]*(?:subtitle|description)[^"]*"[^>]*>(.*?)<\/div>/i,
      /<span[^>]*class="[^"]*(?:subtitle|description)[^"]*"[^>]*>(.*?)<\/span>/i
    ];

    for (const pattern of previewPatterns) {
      const match = html.match(pattern);
      if (match) {
        article.preview = this.cleanText(match[1]);
        break;
      }
    }

    // Extract image URL
    const imagePatterns = [
      /<img[^>]*src="([^"]+)"/i,
      /<img[^>]*data-src="([^"]+)"/i,
      /background-image:\s*url\(['"]([^'"]+)['"]\)/i
    ];

    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match) {
        article.imageUrl = this.normalizeUrl(match[1]);
        break;
      }
    }

    // Extract publish time
    const timePatterns = [
      /<time[^>]*datetime="([^"]+)"/i,
      /<span[^>]*class="[^"]*time[^"]*"[^>]*>([^<]+)<\/span>/i,
      /(\d{1,2}:\d{2})/
    ];

    for (const pattern of timePatterns) {
      const match = html.match(pattern);
      if (match) {
        article.publishedAt = match[1];
        break;
      }
    }

    return article;
  }

  static parseArticlePage(html) {
    const article = {
      title: null,
      author: null,
      category: null,
      content: null,
      keywords: [],
      publishedAt: null,
      imageUrl: null
    };

    // Extract title
    const titlePatterns = [
      /<h1[^>]*>(.*?)<\/h1>/i,
      /<title>([^<]+)<\/title>/i
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match) {
        article.title = this.cleanText(match[1]);
        break;
      }
    }

    // Extract author
    const authorPatterns = [
      /<span[^>]*class="[^"]*author[^"]*"[^>]*>(.*?)<\/span>/i,
      /<div[^>]*class="[^"]*author[^"]*"[^>]*>(.*?)<\/div>/i,
      /<meta\s+name="author"\s+content="([^"]+)"/i,
      /מאת\s*:?\s*<[^>]*>(.*?)<\/[^>]*>/i
    ];

    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match) {
        article.author = this.cleanText(match[1]);
        break;
      }
    }

    // Extract main content
    const contentPatterns = [
      /<div[^>]*class="[^"]*article[_-]?(?:body|content|text)[^"]*"[^>]*>(.*?)<\/div>/is,
      /<article[^>]*>(.*?)<\/article>/is,
      /<div[^>]*itemprop="articleBody"[^>]*>(.*?)<\/div>/is
    ];

    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match) {
        article.content = this.extractTextContent(match[1]);
        break;
      }
    }

    // Extract category from meta tags or URL
    const categoryPatterns = [
      /<meta\s+property="article:section"\s+content="([^"]+)"/i,
      /<meta\s+name="category"\s+content="([^"]+)"/i,
      /<span[^>]*class="[^"]*category[^"]*"[^>]*>(.*?)<\/span>/i
    ];

    for (const pattern of categoryPatterns) {
      const match = html.match(pattern);
      if (match) {
        article.category = this.cleanText(match[1]);
        break;
      }
    }

    // Extract keywords
    const keywordPatterns = [
      /<meta\s+name="keywords"\s+content="([^"]+)"/i,
      /<meta\s+property="article:tag"\s+content="([^"]+)"/gi
    ];

    const keywords = new Set();
    for (const pattern of keywordPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        const tags = match[1].split(/[,،]/).map(t => t.trim()).filter(Boolean);
        tags.forEach(tag => keywords.add(tag));
      }
    }

    article.keywords = Array.from(keywords);

    // Extract publish date
    const datePatterns = [
      /<meta\s+property="article:published_time"\s+content="([^"]+)"/i,
      /<time[^>]*datetime="([^"]+)"/i,
      /<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i
    ];

    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match) {
        article.publishedAt = match[1];
        break;
      }
    }

    // Extract main image
    const imagePatterns = [
      /<meta\s+property="og:image"\s+content="([^"]+)"/i,
      /<img[^>]*class="[^"]*main[^"]*"[^>]*src="([^"]+)"/i,
      /<img[^>]*src="([^"]+)"[^>]*class="[^"]*main[^"]*"/i
    ];

    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match) {
        article.imageUrl = this.normalizeUrl(match[1]);
        break;
      }
    }

    return article;
  }

  static extractTextContent(html) {
    let text = html;
    
    // Remove script and style tags
    text = text.replace(/<script[^>]*>.*?<\/script>/gis, '');
    text = text.replace(/<style[^>]*>.*?<\/style>/gis, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    text = this.decodeHtmlEntities(text);
    
    // Clean whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  static extractCategory(html, url) {
    const categoryMap = {
      'news': 'חדשות',
      'sport': 'ספורט',
      'economy': 'כלכלה',
      'tourism': 'תיירות',
      'entertainment': 'בידור',
      'digital': 'דיגיטל',
      'health': 'בריאות',
      'fashion': 'אופנה',
      'food': 'אוכל',
      'culture': 'תרבות',
      'articles': 'כתבות'
    };

    // Try to extract from URL
    if (url) {
      for (const [key, value] of Object.entries(categoryMap)) {
        if (url.includes(key)) {
          return value;
        }
      }
    }

    // Try to extract from class names
    const classMatch = html.match(/class="[^"]*(?:category|section)[^"]*"[^>]*>([^<]+)</i);
    if (classMatch) {
      return this.cleanText(classMatch[1]);
    }

    return 'כללי';
  }

  static normalizeUrl(url) {
    if (!url) return null;
    
    // Remove leading/trailing whitespace
    url = url.trim();
    
    // Handle relative URLs
    if (url.startsWith('/')) {
      url = 'https://www.ynet.co.il' + url;
    } else if (url.startsWith('//')) {
      url = 'https:' + url;
    }
    
    // Remove tracking parameters
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.delete('utm_source');
      urlObj.searchParams.delete('utm_medium');
      urlObj.searchParams.delete('utm_campaign');
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  static cleanText(text) {
    if (!text) return null;
    
    // Decode HTML entities
    text = this.decodeHtmlEntities(text);
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Clean whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Remove common prefixes
    text = text.replace(/^(כתבה:|מאמר:|ידיעה:)\s*/i, '');
    
    return text || null;
  }

  static decodeHtmlEntities(text) {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&#8211;': '–',
      '&#8212;': '—',
      '&#8216;': ''',
      '&#8217;': ''',
      '&#8220;': '"',
      '&#8221;': '"',
      '&hellip;': '…',
      '&mdash;': '—',
      '&ndash;': '–',
      '&laquo;': '«',
      '&raquo;': '»'
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Decode numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(dec);
    });

    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    return decoded;
  }

  static extractKeywordsFromText(text, minLength = 3) {
    if (!text) return [];

    // Split into words
    const words = text.split(/\s+/);
    
    // Hebrew stop words (common words to ignore)
    const stopWords = new Set([
      'של', 'על', 'את', 'אל', 'עם', 'כי', 'אם', 'או', 'גם', 'לא',
      'מה', 'מי', 'איך', 'למה', 'היה', 'היא', 'הוא', 'הם', 'אני',
      'אתה', 'זה', 'זאת', 'כל', 'כמו', 'יותר', 'פחות', 'רק', 'עוד',
      'שם', 'פה', 'כאן', 'היום', 'אתמול', 'מחר', 'אחד', 'שני', 'שלושה'
    ]);

    const keywords = new Set();
    
    for (const word of words) {
      const cleaned = word.replace(/[^\u0590-\u05FF\u0600-\u06FFa-zA-Z0-9]/g, '');
      if (cleaned.length >= minLength && !stopWords.has(cleaned)) {
        keywords.add(cleaned);
      }
    }

    return Array.from(keywords);
  }

  static isValidArticleUrl(url) {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Must be Ynet domain
      if (!hostname.includes('ynet.co.il')) {
        return false;
      }
      
      // Must contain article path
      const validPaths = [
        '/articles/',
        '/news/',
        '/sport/',
        '/economy/',
        '/tourism/',
        '/entertainment/',
        '/digital/',
        '/health/',
        '/fashion/',
        '/food/',
        '/culture/'
      ];
      
      return validPaths.some(path => urlObj.pathname.includes(path));
    } catch {
      return false;
    }
  }

  static extractArticleId(url) {
    if (!url) return null;
    
    // Ynet article IDs are typically numeric
    const match = url.match(/\/(\d+)(?:\.html)?$/i);
    return match ? match[1] : null;
  }

  static generateArticleHash(article) {
    const str = `${article.url || ''}|${article.title || ''}|${article.publishedAt || ''}`;
    return this.simpleHash(str);
  }

  static simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
```