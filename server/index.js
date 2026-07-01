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
// Strict limit on auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// General API limit
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
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/comments', require('./routes/comments'));

// Scheduler status endpoint
app.get('/api/scheduler/status', (req, res) => {
  res.json(scheduler.getStatus());
});

// Activity log endpoint
app.get('/api/activity', (req, res) => {
  const { limit = 30 } = req.query;
  const logs = prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(parseInt(limit));
  res.json({ logs });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    scheduler: scheduler.getStatus(),
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

// Global error handler — hide details in production
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: isProd ? 'Internal server error' : err.message,
  });
});

// Initialize and start
async function start() {
  try {
    // Initialize database (async for sql.js)
    await initialize();

    // Seed default templates
    const templateCount = prepare('SELECT COUNT(*) as count FROM templates').get().count;
    if (templateCount === 0) {
      console.log('📝 Seeding default templates...');
      const { v4: uuidv4 } = require('uuid');
      const defaults = [
        { name: 'Engagement Hook', category: 'engagement', content: '🔥 Hot take:\n\n[Your controversial opinion here]\n\nAgree or disagree? Drop your thoughts below 👇\n\n#LinkedIn #Engagement' },
        { name: 'Value Thread', category: 'thought_leadership', content: '📌 [X] things I learned about [topic] after [Y] years:\n\n1️⃣ \n2️⃣ \n3️⃣ \n4️⃣ \n5️⃣ \n\nWhich one resonates most?\n\n#Leadership #Growth' },
        { name: 'Story Post', category: 'storytelling', content: 'Last week, something changed how I think about [topic].\n\nHere\'s what happened:\n\n[Tell your story]\n\nThe lesson?\n\n[Key takeaway]\n\n♻️ Repost if this resonates' },
        { name: 'Product Launch', category: 'announcement', content: '🎉 Exciting news!\n\nWe\'re thrilled to announce [announcement].\n\n✅ [Benefit 1]\n✅ [Benefit 2]\n✅ [Benefit 3]\n\n#Announcement #Innovation' },
        { name: 'Quick Tip', category: 'tips', content: '💡 Quick tip for [audience]:\n\n[Your actionable tip]\n\nWhy this matters:\n→ [Reason]\n\nTry it today!\n\n#Tips #Productivity' },
        { name: 'Poll Starter', category: 'engagement', content: 'I\'m curious — what\'s your take on [topic]?\n\nA: [Option]\nB: [Option]\nC: [Option]\n\nVote in the comments! 🗳️' },
      ];

      for (const t of defaults) {
        prepare('INSERT INTO templates (id, name, category, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, \'[]\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
          .run(uuidv4(), t.name, t.category, t.content);
      }
      console.log(`✅ Seeded ${defaults.length} default templates`);
    }

    // Start scheduler
    scheduler.start();

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✈️  Algo Colleague running at http://localhost:${PORT}`);
      console.log(`   Mode: ${isProd ? '🟢 production' : '🟡 development'}\n`);
    });

    // Auto-open browser (optional)
    try {
      const open = (await import('open')).default;
      open(`http://localhost:${PORT}`);
    } catch (e) {
      // open is optional
    }
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();
