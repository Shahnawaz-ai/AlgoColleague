const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error("❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment variables.");
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initialize() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
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

  await client.execute(`
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

  await client.execute(`
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

  await client.execute(`
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

  await client.execute(`
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

  await client.execute(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
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

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT,
      key TEXT,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, key)
    )
  `);

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)',
    'CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at)',
    'CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at)',
    'CREATE INDEX IF NOT EXISTS idx_analytics_post ON analytics(post_id)',
    'CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)',
    'CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status)',
    'CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_auto_response_rules_user ON auto_response_rules(user_id)',
  ];

  for (const idx of indexes) {
    try { await client.execute(idx); } catch (e) { /* ignore */ }
  }

  // Schema migrations to add user_id to existing tables
  const tables = ['posts', 'templates', 'connections', 'analytics', 'comments', 'auto_response_rules', 'activity_log'];
  for (const table of tables) {
    try {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`);
      console.log(`Added user_id column to ${table}`);
    } catch (e) {
      // Ignore if column already exists
    }
  }

  console.log('✅ Remote Turso Database initialized successfully');
}

async function dbRun(sql, ...params) {
  try {
    const res = await client.execute({ sql, args: params });
    // Return lastInsertRowid or rowsAffected to match standard sqlite behaviors if needed
    return res;
  } catch (err) {
    console.error('dbRun error:', err);
    throw err;
  }
}

async function dbGet(sql, ...params) {
  try {
    const res = await client.execute({ sql, args: params });
    return res.rows.length > 0 ? res.rows[0] : null;
  } catch (err) {
    console.error('dbGet error:', err);
    throw err;
  }
}

async function dbAll(sql, ...params) {
  try {
    const res = await client.execute({ sql, args: params });
    return res.rows;
  } catch (err) {
    console.error('dbAll error:', err);
    throw err;
  }
}

async function logActivity(action, entityType, entityId, details, userId = null) {
  await dbRun(
    'INSERT INTO activity_log (action, entity_type, entity_id, details, user_id) VALUES (?, ?, ?, ?, ?)',
    action, entityType, entityId, typeof details === 'object' ? JSON.stringify(details) : details, userId
  );
}

async function getSetting(key) {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  const existing = await dbGet('SELECT key FROM settings WHERE key = ?', key);
  if (existing) {
    await dbRun('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', value, key);
  } else {
    await dbRun('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', key, value);
  }
}

async function getUserSetting(userId, key) {
  const row = await dbGet('SELECT value FROM user_settings WHERE user_id = ? AND key = ?', userId, key);
  return row ? row.value : null;
}

async function setUserSetting(userId, key, value) {
  const existing = await dbGet('SELECT key FROM user_settings WHERE user_id = ? AND key = ?', userId, key);
  if (existing) {
    await dbRun('UPDATE user_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND key = ?', value, userId, key);
  } else {
    await dbRun('INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', userId, key, value);
  }
}

module.exports = { initialize, client, dbRun, dbGet, dbAll, logActivity, getSetting, setSetting, getUserSetting, setUserSetting };
