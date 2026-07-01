const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'linkedin_manager.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 30 seconds
setInterval(() => {
  if (db) saveDb();
}, 30000);

// Save on process exit
process.on('exit', () => { if (db) saveDb(); });
process.on('SIGINT', () => { if (db) saveDb(); process.exit(0); });
process.on('SIGTERM', () => { if (db) saveDb(); process.exit(0); });

async function initialize() {
  const database = await getDb();

  database.run(`
    -- OAuth tokens and user profile
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      post_type TEXT DEFAULT 'text',
      media_urls TEXT DEFAULT '[]',
      linkedin_post_id TEXT,
      linkedin_post_url TEXT,
      status TEXT DEFAULT 'draft',
      scheduled_at DATETIME,
      published_at DATETIME,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      template_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      linkedin_id TEXT,
      name TEXT,
      headline TEXT,
      profile_url TEXT,
      profile_image TEXT,
      message TEXT,
      status TEXT DEFAULT 'pending',
      action_note TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      acted_at DATETIME
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS analytics (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      impressions INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      reactions_breakdown TEXT DEFAULT '{}',
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      linkedin_comment_id TEXT,
      author_name TEXT,
      author_headline TEXT,
      author_image TEXT,
      content TEXT NOT NULL,
      parent_comment_id TEXT,
      is_reply_sent INTEGER DEFAULT 0,
      reply_content TEXT,
      replied_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS auto_response_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_type TEXT DEFAULT 'keyword',
      trigger_value TEXT,
      response_template TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes (ignore errors if they exist)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)',
    'CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at)',
    'CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at)',
    'CREATE INDEX IF NOT EXISTS idx_analytics_post ON analytics(post_id)',
    'CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)',
    'CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status)',
    'CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at)',
  ];

  for (const idx of indexes) {
    try { database.run(idx); } catch (e) { /* index may already exist */ }
  }

  saveDb();
  console.log('✅ Database initialized successfully');
}

// --- Helper functions wrapping sql.js API ---

function prepare(sql) {
  return {
    // Run with params, return changes info
    run(...params) {
      db.run(sql, params);
      saveDb();
    },
    // Get single row
    get(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      let row = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();
      return row;
    },
    // Get all rows
    all(...params) {
      const results = [];
      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
  };
}

function logActivity(action, entityType, entityId, details) {
  prepare(
    'INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)'
  ).run(action, entityType, entityId, typeof details === 'object' ? JSON.stringify(details) : details);
}

function getSetting(key) {
  const row = prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  // Check if exists
  const existing = prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (existing) {
    prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  } else {
    prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
  }
}

module.exports = { getDb, initialize, prepare, logActivity, getSetting, setSetting, saveDb };
