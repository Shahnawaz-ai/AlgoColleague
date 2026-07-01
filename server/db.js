const { createClient } = require('@libsql/client');
require('dotenv').config();

let client = null;

function getDb() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.warn('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.');
  }

  client = createClient({
    url: url || 'libsql://dummy.turso.io',
    authToken: authToken || 'dummy-token'
  });

  return client;
}

async function initialize() {
  const db = getDb();
  
  if (!process.env.TURSO_DATABASE_URL) {
    console.warn("Skipping DB init: Missing Turso credentials");
    return;
  }

  try {
    const batch = [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS posts (
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
      )`,
      `CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS connections (
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
      )`,
      `CREATE TABLE IF NOT EXISTS analytics (
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
      )`,
      `CREATE TABLE IF NOT EXISTS comments (
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
      )`,
      `CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS auto_response_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_type TEXT DEFAULT 'keyword',
        trigger_value TEXT,
        response_template TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    await db.batch(batch, "write");
    console.log('Turso Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

// Wrapper to mimic the old sqlite3/sql.js interface BUT asynchronously
function prepare(sql) {
  return {
    async run(...params) {
      const db = getDb();
      await db.execute({ sql, args: params });
    },
    async get(...params) {
      const db = getDb();
      const result = await db.execute({ sql, args: params });
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      const obj = {};
      result.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    },
    async all(...params) {
      const db = getDb();
      const result = await db.execute({ sql, args: params });
      return result.rows.map(row => {
        const obj = {};
        result.columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    },
  };
}

async function logActivity(action, entityType, entityId, details) {
  await prepare(
    'INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)'
  ).run(action, entityType, entityId, typeof details === 'object' ? JSON.stringify(details) : details);
}

async function getSetting(key) {
  const row = await prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  const existing = await prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (existing) {
    await prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  } else {
    await prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
  }
}

function saveDb() {
  // No-op for Turso, since it saves automatically to the cloud
}

module.exports = { getDb, initialize, prepare, logActivity, getSetting, setSetting, saveDb };
