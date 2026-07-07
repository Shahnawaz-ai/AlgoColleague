require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const helmet     = require('helmet');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const { initialize, dbGet, dbRun } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use(cors({
  origin: isProd ? process.env.APP_URL || true : true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/comments', require('./routes/comments'));

// Vercel Cron Endpoint
app.use('/api/cron', require('./routes/cron'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

app.get('/connect', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'connect.html'));
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: isProd ? 'Internal server error' : err.message,
  });
});

async function start() {
  try {
    await initialize();

    // Seed default templates
    const templateCountRow = await dbGet('SELECT COUNT(*) as count FROM templates');
    if (templateCountRow && templateCountRow.count === 0) {
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
        await dbRun('INSERT INTO templates (id, name, category, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, \'[]\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          uuidv4(), t.name, t.category, t.content);
      }
      console.log(`✅ Seeded ${defaults.length} default templates`);
    }

    // Only start listen server if not running on Vercel
    if (!process.env.VERCEL) {
      app.listen(PORT, '0.0.0.0', async () => {
        console.log(`\n✈️  Algo Colleague running at http://127.0.0.1:${PORT}`);
        console.log(`   Mode: ${process.env.NODE_ENV === 'production' ? '🟢 production' : '🟡 development'}\n`);
      });
    }

  } catch (error) {
    console.error('Failed to start:', error);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

// In serverless environments, we still want to initialize the DB connection
start();

// Export the app for Vercel
module.exports = app;
