```javascript
export class RateLimiter {
  constructor(storage) {
    this.storage = storage;
    this.requestLog = new Map();
    this.robotsCache = new Map();
    
    this.config = {
      minDelayMs: 2000,
      maxRequestsPerMinute: 20,
      maxRequestsPerHour: 200,
      robotsTTL: 86400000,
      userAgent: 'PersonalDigestBot/1.0 (Privacy-focused news aggregator)',
      respectCrawlDelay: true,
      backoffMultiplier: 2,
      maxRetries: 3
    };
  }

  async canMakeRequest(url) {
    const domain = this.extractDomain(url);
    const now = Date.now();

    const robotsAllowed = await this.checkRobotsTxt(domain, url);
    if (!robotsAllowed) {
      return { allowed: false, reason: 'blocked_by_robots_txt', retryAfter: null };
    }

    const lastRequest = await this.getLastRequestTime(domain);
    const crawlDelay = await this.getCrawlDelay(domain);
    const requiredDelay = Math.max(this.config.minDelayMs, crawlDelay);

    if (lastRequest && (now - lastRequest) < requiredDelay) {
      const waitTime = requiredDelay - (now - lastRequest);
      return { allowed: false, reason: 'rate_limit_delay', retryAfter: waitTime };
    }

    const minuteCount = await this.getRequestCount(domain, 60000);
    if (minuteCount >= this.config.maxRequestsPerMinute) {
      return { allowed: false, reason: 'rate_limit_minute', retryAfter: 60000 };
    }

    const hourCount = await this.getRequestCount(domain, 3600000);
    if (hourCount >= this.config.maxRequestsPerHour) {
      return { allowed: false, reason: 'rate_limit_hour', retryAfter: 3600000 };
    }

    return { allowed: true, reason: null, retryAfter: null };
  }

  async executeWithRateLimit(url, fetchFunction, retryCount = 0) {
    const check = await this.canMakeRequest(url);
    
    if (!check.allowed) {
      if (check.reason === 'blocked_by_robots_txt') {
        throw new Error(`Request blocked by robots.txt: ${url}`);
      }

      if (retryCount >= this.config.maxRetries) {
        throw new Error(`Max retries exceeded for ${url}`);
      }

      await this.sleep(check.retryAfter);
      return this.executeWithRateLimit(url, fetchFunction, retryCount + 1);
    }

    const domain = this.extractDomain(url);
    await this.recordRequest(domain);

    try {
      const response = await fetchFunction();
      
      if (response.status === 429) {
        const retryAfter = this.parseRetryAfter(response.headers);
        await this.sleep(retryAfter);
        return this.executeWithRateLimit(url, fetchFunction, retryCount + 1);
      }

      if (response.status >= 500 && retryCount < this.config.maxRetries) {
        const backoffDelay = this.config.minDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
        await this.sleep(backoffDelay);
        return this.executeWithRateLimit(url, fetchFunction, retryCount + 1);
      }

      return response;
    } catch (error) {
      if (retryCount < this.config.maxRetries) {
        const backoffDelay = this.config.minDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
        await this.sleep(backoffDelay);
        return this.executeWithRateLimit(url, fetchFunction, retryCount + 1);
      }
      throw error;
    }
  }

  async checkRobotsTxt(domain, url) {
    const cached = this.robotsCache.get(domain);
    if (cached && (Date.now() - cached.timestamp) < this.config.robotsTTL) {
      return this.isAllowedByRobots(url, cached.rules);
    }

    const robotsUrl = `https://${domain}/robots.txt`;
    const kvKey = `robots:${domain}`;

    try {
      const cachedRobots = await this.storage.get(kvKey);
      if (cachedRobots) {
        const parsed = JSON.parse(cachedRobots);
        if (Date.now() - parsed.timestamp < this.config.robotsTTL) {
          this.robotsCache.set(domain, parsed);
          return this.isAllowedByRobots(url, parsed.rules);
        }
      }

      const response = await fetch(robotsUrl, {
        headers: { 'User-Agent': this.config.userAgent }
      });

      let rules = { disallow: [], allow: [], crawlDelay: null };

      if (response.ok) {
        const text = await response.text();
        rules = this.parseRobotsTxt(text);
      }

      const cacheData = {
        rules,
        timestamp: Date.now()
      };

      await this.storage.put(kvKey, JSON.stringify(cacheData), 86400);
      this.robotsCache.set(domain, cacheData);

      return this.isAllowedByRobots(url, rules);
    } catch (error) {
      console.warn(`Failed to fetch robots.txt for ${domain}:`, error);
      return true;
    }
  }

  parseRobotsTxt(text) {
    const rules = { disallow: [], allow: [], crawlDelay: null };
    const lines = text.split('\n');
    let relevantSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        const agent = trimmed.substring(11).trim();
        relevantSection = agent === '*' || agent.toLowerCase() === 'personaldigestbot';
        continue;
      }

      if (!relevantSection) continue;

      if (trimmed.toLowerCase().startsWith('disallow:')) {
        const path = trimmed.substring(9).trim();
        if (path) rules.disallow.push(path);
      } else if (trimmed.toLowerCase().startsWith('allow:')) {
        const path = trimmed.substring(6).trim();
        if (path) rules.allow.push(path);
      } else if (trimmed.toLowerCase().startsWith('crawl-delay:')) {
        const delay = parseInt(trimmed.substring(12).trim(), 10);
        if (!isNaN(delay) && this.config.respectCrawlDelay) {
          rules.crawlDelay = delay * 1000;
        }
      }
    }

    return rules;
  }

  isAllowedByRobots(url, rules) {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;

    for (const allowPattern of rules.allow) {
      if (this.matchesPattern(path, allowPattern)) {
        return true;
      }
    }

    for (const disallowPattern of rules.disallow) {
      if (this.matchesPattern(path, disallowPattern)) {
        return false;
      }
    }

    return true;
  }

  matchesPattern(path, pattern) {
    if (pattern === '/') return true;
    
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '\\?')
      .replace(/\$/g, '\\$');
    
    const regex = new RegExp(`^${regexPattern}`);
    return regex.test(path);
  }

  async getCrawlDelay(domain) {
    const cached = this.robotsCache.get(domain);
    if (cached && cached.rules.crawlDelay) {
      return cached.rules.crawlDelay;
    }

    const kvKey = `robots:${domain}`;
    const cachedRobots = await this.storage.get(kvKey);
    if (cachedRobots) {
      const parsed = JSON.parse(cachedRobots);
      return parsed.rules.crawlDelay || 0;
    }

    return 0;
  }

  async recordRequest(domain) {
    const now = Date.now();
    const kvKey = `rate_limit:${domain}`;

    const existing = await this.storage.get(kvKey);
    let requests = existing ? JSON.parse(existing) : [];

    requests.push(now);

    const oneHourAgo = now - 3600000;
    requests = requests.filter(timestamp => timestamp > oneHourAgo);

    await this.storage.put(kvKey, JSON.stringify(requests), 3600);

    if (!this.requestLog.has(domain)) {
      this.requestLog.set(domain, []);
    }
    this.requestLog.get(domain).push(now);
  }

  async getLastRequestTime(domain) {
    const kvKey = `rate_limit:${domain}`;
    const existing = await this.storage.get(kvKey);
    
    if (existing) {
      const requests = JSON.parse(existing);
      return requests.length > 0 ? requests[requests.length - 1] : null;
    }

    const memoryRequests = this.requestLog.get(domain);
    if (memoryRequests && memoryRequests.length > 0) {
      return memoryRequests[memoryRequests.length - 1];
    }

    return null;
  }

  async getRequestCount(domain, timeWindowMs) {
    const now = Date.now();
    const cutoff = now - timeWindowMs;

    const kvKey = `rate_limit:${domain}`;
    const existing = await this.storage.get(kvKey);
    
    if (existing) {
      const requests = JSON.parse(existing);
      return requests.filter(timestamp => timestamp > cutoff).length;
    }

    const memoryRequests = this.requestLog.get(domain);
    if (memoryRequests) {
      return memoryRequests.filter(timestamp => timestamp > cutoff).length;
    }

    return 0;
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  parseRetryAfter(headers) {
    const retryAfter = headers.get('Retry-After');
    if (!retryAfter) {
      return this.config.minDelayMs * 2;
    }

    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return this.config.minDelayMs * 2;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getStatistics(domain) {
    const kvKey = `rate_limit:${domain}`;
    const existing = await this.storage.get(kvKey);
    
    if (!existing) {
      return {
        domain,
        totalRequests: 0,
        lastHour: 0,
        lastMinute: 0,
        lastRequest: null
      };
    }

    const requests = JSON.parse(existing);
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneMinuteAgo = now - 60000;

    return {
      domain,
      totalRequests: requests.length,
      lastHour: requests.filter(t => t > oneHourAgo).length,
      lastMinute: requests.filter(t => t > oneMinuteAgo).length,
      lastRequest: requests.length > 0 ? new Date(requests[requests.length - 1]).toISOString() : null
    };
  }

  async clearCache(domain = null) {
    if (domain) {
      this.robotsCache.delete(domain);
      this.requestLog.delete(domain);
      await this.storage.delete(`robots:${domain}`);
      await this.storage.delete(`rate_limit:${domain}`);
    } else {
      this.robotsCache.clear();
      this.requestLog.clear();
    }
  }
}
```