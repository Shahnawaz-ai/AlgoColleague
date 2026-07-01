require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const helmet     = require('helmet');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const { initialize, prepare } = require('./db');
const scheduler  = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Security headers (helmet) ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // disabled — we use inline scripts in frontend
  crossOriginEmbedderPolicy: false,
}));

// ── Gzip compression ──────────────────────────────────────────
app.use(compression());

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: isProd ? process.env.APP_URL : true,
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

// ── Static files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/comments', require('./routes/comments'));

// ── VERCEL CRON ENDPOINT ──────────────────────────────────────
app.get('/api/cron/process', async (req, res) => {
  try {
    const postResult = await scheduler.processPostQueue();
    const analyticsResult = await scheduler.refreshAnalytics();
    res.json({
      status: 'success',
      posts: postResult,
      analytics: analyticsResult
    });
  } catch (error) {
    console.error('Cron process failed:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Activity log endpoint
app.get('/api/activity', async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const logs = await prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(parseInt(limit));
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Landing page (marketing home)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

// Connect page — LinkedIn setup & OAuth flow
app.get('/connect', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'connect.html'));
});

// Dashboard SPA — serves app.html for /app and all other non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: isProd ? 'Internal server error' : err.message,
  });
});

// Database initialization
async function setupDb() {
  await initialize();
  try {
    const res = await prepare('SELECT COUNT(*) as count FROM templates').get();
    const templateCount = res ? res.count : 0;
    
    if (templateCount === 0) {
      console.log('📝 Seeding default templates...');
      const { v4: uuidv4 } = require('uuid');
      const defaults = [
        { name: 'Engagement Hook', category: 'engagement', content: '🔥 Hot take:\n\n[Your controversial opinion here]\n\nAgree or disagree? Drop your thoughts below 👇\n\n#LinkedIn #Engagement' },
        { name: 'Value Thread', category: 'thought_leadership', content: '📌 [X] things I learned about [topic] after [Y] years:\n\n1️⃣ \n2️⃣ \n3️⃣ \n4️⃣ \n5️⃣ \n\nWhich one resonates most?\n\n#Leadership #Growth' },
        { name: 'Story Post', category: 'storytelling', content: 'Last week, something changed how I think about [topic].\n\nHere\'s what happened:\n\n[Tell your story]\n\nThe lesson?\n\n[Key takeaway]\n\n♻️ Repost if this resonates' },
      ];

      for (const t of defaults) {
        await prepare('INSERT INTO templates (id, name, category, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, \'[]\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
          .run(uuidv4(), t.name, t.category, t.content);
      }
    }
  } catch (error) {
    console.error('DB Seed error:', error);
  }
}

// Only listen locally if not running on Vercel
if (process.env.NODE_ENV !== 'production' || process.env.RUN_LOCAL) {
  setupDb().then(() => {
    app.listen(PORT, () => {
      console.log(`✈️  Algo Colleague running at http://localhost:${PORT}`);
    });
  });
}

// Ensure DB is initialized for serverless requests
setupDb();

// Export the Express app for Vercel
module.exports = app;
