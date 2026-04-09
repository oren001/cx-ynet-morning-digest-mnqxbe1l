# עיתון אישי - התקציר הבוקר

Personal morning digest that scrapes Ynet news, learns your preferences based on reading behavior, and delivers one personalized summary link every morning.

## Features

- **Daily Ynet News Scraping**: Automated cron job fetches latest articles
- **Machine Learning Preferences**: Learns what you like based on reading behavior
- **Personalized Scoring**: Categories, keywords, and author preferences
- **Morning Digest**: Single link with your top personalized articles
- **Reading Analytics**: Track your reading patterns and preferences
- **Hebrew RTL Support**: Full Hebrew interface with right-to-left layout

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Cloudflare Account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd personal-morning-digest
npm install
```

### 2. Create KV Namespaces

Create three KV namespaces for the application:

```bash
# Create production namespaces
wrangler kv:namespace create "ARTICLES"
wrangler kv:namespace create "USERS"
wrangler kv:namespace create "DIGESTS"

# Create preview namespaces for development
wrangler kv:namespace create "ARTICLES" --preview
wrangler kv:namespace create "USERS" --preview
wrangler kv:namespace create "DIGESTS" --preview
```

Take note of the namespace IDs returned by each command.

### 3. Configure wrangler.toml

Update `wrangler.toml` with your KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "ARTICLES"
id = "your-articles-namespace-id"
preview_id = "your-articles-preview-namespace-id"

[[kv_namespaces]]
binding = "USERS"
id = "your-users-namespace-id"
preview_id = "your-users-preview-namespace-id"

[[kv_namespaces]]
binding = "DIGESTS"
id = "your-digests-namespace-id"
preview_id = "your-digests-preview-namespace-id"
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings:

```env
SCRAPING_USER_AGENT=PersonalDigest/1.0
SCRAPING_DELAY_MS=2000
MAX_ARTICLES_PER_DAY=50
DIGEST_GENERATION_HOUR=6
```

### 5. Deploy to Cloudflare

```bash
# Deploy to production
wrangler deploy

# Or deploy with a specific name
wrangler deploy --name personal-morning-digest
```

### 6. Verify Deployment

After deployment, you'll receive a Worker URL like:
```
https://personal-morning-digest.your-subdomain.workers.dev
```

Test the API:
```bash
curl https://your-worker-url.workers.dev/api/health
```

## API Documentation

### Base URL
```
https://your-worker-url.workers.dev
```

### Endpoints

#### 1. Register User
**POST** `/api/register`

Register a new user and create their preference profile.

```bash
curl -X POST https://your-worker-url.workers.dev/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "שם המשתמש"
  }'
```

**Response:**
```json
{
  "success": true,
  "userId": "uuid-here",
  "message": "User registered successfully"
}
```

#### 2. Get Today's Digest
**GET** `/api/digest/:userId`

Retrieve today's personalized digest for a user.

```bash
curl https://your-worker-url.workers.dev/api/digest/your-user-id
```

**Response:**
```json
{
  "success": true,
  "digest": {
    "date": "2024-01-15",
    "articles": [
      {
        "id": "article-id",
        "title": "כותרת הכתבה",
        "category": "כלכלה",
        "author": "שם הכתב",
        "url": "https://ynet.co.il/article/...",
        "summary": "תקציר הכתבה...",
        "score": 0.95,
        "publishedAt": "2024-01-15T08:30:00Z"
      }
    ],
    "totalArticles": 10
  }
}
```

#### 3. Track Reading
**POST** `/api/track`

Track when a user reads an article to improve personalization.

```bash
curl -X POST https://your-worker-url.workers.dev/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "articleId": "article-id",
    "timeSpent": 45,
    "scrollDepth": 0.8
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Reading tracked successfully"
}
```

#### 4. Get User Analytics
**GET** `/api/analytics/:userId`

Get reading analytics and preference scores for a user.

```bash
curl https://your-worker-url.workers.dev/api/analytics/your-user-id
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalArticlesRead": 127,
    "averageTimeSpent": 38,
    "categoryPreferences": {
      "חדשות": 0.85,
      "כלכלה": 0.72,
      "ספורט": 0.45
    },
    "topKeywords": [
      { "word": "טכנולוגיה", "score": 0.92 },
      { "word": "בינה מלאכותית", "score": 0.87 }
    ],
    "readingHistory": []
  }
}
```

#### 5. Update Preferences
**POST** `/api/preferences/:userId`

Manually update user preferences.

```bash
curl -X POST https://your-worker-url.workers.dev/api/preferences/your-user-id \
  -H "Content-Type: application/json" \
  -d '{
    "categories": {
      "חדשות": 0.9,
      "כלכלה": 0.7
    },
    "excludeKeywords": ["פוליטיקה", "בחירות"]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

#### 6. Health Check
**GET** `/api/health`

Check if the Worker is running properly.

```bash
curl https://your-worker-url.workers.dev/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "version": "1.0.0"
}
```

## Cron Configuration

The Worker includes scheduled cron triggers defined in `wrangler.toml`:

### Daily Scraping (Every 2 hours)
```
0 */2 * * *
```
Scrapes Ynet for new articles and stores them in KV.

### Digest Generation (Daily at 6 AM Israel Time)
```
0 3 * * *
```
Generates personalized digests for all users (3 AM UTC = 6 AM Israel).

### Cleanup Old Data (Daily at midnight)
```
0 0 * * *
```
Removes articles and digests older than 30 days.

To modify cron schedules, edit `wrangler.toml`:

```toml
[triggers]
crons = ["0 */2 * * *", "0 3 * * *", "0 0 * * *"]
```

## Development

### Local Development

Run the Worker locally with Wrangler:

```bash
npm run dev
```

This starts a local server at `http://localhost:8787`

### Testing

```bash
# Run tests (if configured)
npm test

# Test specific endpoints locally
curl http://localhost:8787/api/health
```

### Viewing Logs

```bash
# Tail production logs
wrangler tail

# Tail with filtering
wrangler tail --status error
```

## User Interface

### Landing Page
Access the main interface at:
```
https://your-worker-url.workers.dev/
```

Features:
- User registration form
- Today's digest viewer
- Article reading interface with tracking

### Dashboard
Access the analytics dashboard at:
```
https://your-worker-url.workers.dev/dashboard.html?userId=your-user-id
```

Features:
- Reading statistics
- Category preference visualization
- Personalization settings
- Reading history

## Storage Structure

### KV Namespace: ARTICLES
```
Key: article:{articleId}
Value: {
  id, title, category, author, url, content, summary,
  publishedAt, scrapedAt, keywords
}

Key: articles:index:{date}
Value: [articleId1, articleId2, ...]
```

### KV Namespace: USERS
```
Key: user:{userId}
Value: {
  id, email, name, createdAt, preferences
}

Key: user:email:{email}
Value: userId

Key: preferences:{userId}
Value: {
  categoryWeights, keywordWeights, authorWeights,
  excludeKeywords, minScore
}
```

### KV Namespace: DIGESTS
```
Key: digest:{userId}:{date}
Value: {
  userId, date, articles, generatedAt, version
}

Key: reading:{userId}:{articleId}
Value: {
  readAt, timeSpent, scrollDepth, fromDigest
}
```

## Troubleshooting

### KV Namespace Not Found
Ensure all three KV namespaces are created and properly configured in `wrangler.toml`.

### Scraping Fails
- Check rate limiting settings in `src/config.js`
- Verify Ynet is accessible from your region
- Review HTML parsing logic if Ynet structure changed

### Cron Jobs Not Running
- Verify triggers are defined in `wrangler.toml`
- Check Worker logs: `wrangler tail`
- Ensure Worker is deployed (not just in dev mode)

### Empty Digests
- Check if articles are being scraped successfully
- Verify user has reading history for ML to learn from
- Review preference scores in analytics endpoint

### Performance Issues
- Monitor KV read/write operations
- Check Worker CPU time in Cloudflare dashboard
- Consider caching frequently accessed data

## Privacy & Ethics

- **Respects robots.txt**: Scraper checks and follows Ynet's robots.txt
- **Rate limiting**: 2-second delay between requests by default
- **Privacy-first**: All user data stored in isolated KV namespaces
- **No external sharing**: Reading data never leaves Cloudflare
- **User control**: Full preference management and opt-out available

## Rate Limits

Default configuration:
- **Max requests per minute**: 30
- **Delay between requests**: 2000ms
- **Max articles per scrape**: 50
- **Cache duration**: 2 hours

Modify in `src/config.js` if needed.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm run dev`
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Open an issue on GitHub
- Check Cloudflare Workers documentation
- Review KV storage limits and quotas

## Roadmap

- [ ] Multi-source scraping (Haaretz, Maariv)
- [ ] Email delivery integration
- [ ] Mobile app
- [ ] Advanced ML models (sentiment analysis, topic clustering)
- [ ] Social sharing features
- [ ] Collaborative filtering (similar users)

---

**Built with ❤️ for Hebrew news readers**