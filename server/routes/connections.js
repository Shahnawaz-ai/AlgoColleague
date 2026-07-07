const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');

// List connections with filter
router.get('/', async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM connections';
    const params = [];

    if (status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY received_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const connections = await dbAll(query, ...params);

    const counts = {
      pending: (await dbGet("SELECT COUNT(*) as c FROM connections WHERE status = 'pending'")).c,
      accepted: (await dbGet("SELECT COUNT(*) as c FROM connections WHERE status = 'accepted'")).c,
      declined: (await dbGet("SELECT COUNT(*) as c FROM connections WHERE status = 'declined'")).c,
      total: (await dbGet('SELECT COUNT(*) as c FROM connections')).c,
    };

    res.json({ connections, counts });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add a connection request
router.post('/', async (req, res) => {
  try {
    const { name, headline, profile_url, profile_image, message } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const id = uuidv4();
    await dbRun(`
      INSERT INTO connections (id, name, headline, profile_url, profile_image, message, status, received_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `, id, name, headline || '', profile_url || '', profile_image || '', message || '');

    await logActivity('connection_received', 'connection', id, `Connection request from ${name}`);

    const conn = await dbGet('SELECT * FROM connections WHERE id = ?', id);
    res.status(201).json({ connection: conn });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Accept connection
router.post('/:id/accept', async (req, res) => {
  try {
    const conn = await dbGet('SELECT * FROM connections WHERE id = ?', req.params.id);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    const { note } = req.body;
    await dbRun(`UPDATE connections SET status = 'accepted', action_note = ?, acted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      note || '', req.params.id);

    await logActivity('connection_accepted', 'connection', req.params.id, `Accepted: ${conn.name}`);
    res.json({ success: true, message: `Accepted connection from ${conn.name}` });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Decline connection
router.post('/:id/decline', async (req, res) => {
  try {
    const conn = await dbGet('SELECT * FROM connections WHERE id = ?', req.params.id);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    await dbRun(`UPDATE connections SET status = 'declined', acted_at = CURRENT_TIMESTAMP WHERE id = ?`, req.params.id);

    await logActivity('connection_declined', 'connection', req.params.id, `Declined: ${conn.name}`);
    res.json({ success: true, message: `Declined connection from ${conn.name}` });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk action
router.post('/bulk-action', async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!ids || !Array.isArray(ids) || !['accept', 'decline', 'ignore'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request. Provide ids array and action.' });
    }

    const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'ignored';

    for (const id of ids) {
      await dbRun(`UPDATE connections SET status = ?, acted_at = CURRENT_TIMESTAMP WHERE id = ?`, status, id);
    }

    await logActivity('connections_bulk_action', 'connection', null, `Bulk ${action}: ${ids.length} connections`);
    res.json({ success: true, affected: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Bulk CSV import: POST /api/connections/import
// Accepts { rows: [{ name, headline, profile_url, message }] }
router.post('/import', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Provide a rows array' });
    }

    let imported = 0;
    const errors = [];

    for (const row of rows) {
      const name = (row.name || row.Name || '').trim();
      if (!name) { errors.push(`Skipped empty name row`); continue; }

      try {
        const id = uuidv4();
        await dbRun(`
          INSERT INTO connections (id, name, headline, profile_url, message, status, received_at)
          VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        `, 
          id, name,
          (row.headline || row.Headline || '').trim(),
          (row.profile_url || row.URL || row.url || '').trim(),
          (row.message || row.Message || '').trim()
        );
        imported++;
      } catch (e) {
        errors.push(`Failed to import ${name}: ${e.message}`);
      }
    }

    await logActivity('connections_csv_import', 'connection', null, `Imported ${imported} connections from CSV`);
    res.json({ success: true, imported, errors });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
