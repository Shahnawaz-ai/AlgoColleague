require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const helmet     = require('helmet');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const { initialize } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;

app.set('trust proxy', 1);

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

const { ClerkExpressRequireAuth, ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// Health check (Public)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Protect API routes
app.use('/api', ClerkExpressRequireAuth({
  // Use default options
}));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/ai', require('./routes/ai'));

// Vercel Cron Endpoint
app.use('/api/cron', require('./routes/cron'));

// Mock scheduler endpoint since we use cron
app.get('/api/scheduler/status', (req, res) => {
  res.json({
    isRunning: true,
    nextCheck: 'Triggered via Vercel Cron',
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

app.get('/connect', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'connect.html'));
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'setup.html'));
});

app.all('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

app.use((err, req, res, next) => {
  if (err.message === 'Unauthenticated' || err.statusCode === 401) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: isProd ? 'Internal server error' : err.message,
  });
});

async function start() {
  try {
    await initialize();

    // Note: Default templates are seeded per-user via POST /api/templates/seed
    // called from the onboarding flow after the user connects LinkedIn.

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
