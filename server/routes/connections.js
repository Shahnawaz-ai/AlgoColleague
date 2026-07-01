const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { prepare, logActivity } = require('../db');

// List connections with filter
router.get('/', (req, res) => {
  const { status = 'pending', limit = 50, offset = 0 } = req.query;

  let query = 'SELECT * FROM connections';
  const params = [];

  if (status !== 'all') {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY received_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const connections = prepare(query).all(...params);

  const counts = {
    pending: prepare("SELECT COUNT(*) as c FROM connections WHERE status = 'pending'").get().c,
    accepted: prepare("SELECT COUNT(*) as c FROM connections WHERE status = 'accepted'").get().c,
    declined: prepare("SELECT COUNT(*) as c FROM connections WHERE status = 'declined'").get().c,
    total: prepare('SELECT COUNT(*) as c FROM connections').get().c,
  };

  res.json({ connections, counts });
});

// Add a connection request
router.post('/', (req, res) => {
  const { name, headline, profile_url, profile_image, message } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = uuidv4();
  prepare(`
    INSERT INTO connections (id, name, headline, profile_url, profile_image, message, status, received_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
  `).run(id, name, headline || '', profile_url || '', profile_image || '', message || '');

  logActivity('connection_received', 'connection', id, `Connection request from ${name}`);

  const conn = prepare('SELECT * FROM connections WHERE id = ?').get(id);
  res.status(201).json({ connection: conn });
});

// Accept connection
router.post('/:id/accept', (req, res) => {
  const conn = prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  const { note } = req.body;
  prepare(`UPDATE connections SET status = 'accepted', action_note = ?, acted_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(note || '', req.params.id);

  logActivity('connection_accepted', 'connection', req.params.id, `Accepted: ${conn.name}`);
  res.json({ success: true, message: `Accepted connection from ${conn.name}` });
});

// Decline connection
router.post('/:id/decline', (req, res) => {
  const conn = prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  prepare(`UPDATE connections SET status = 'declined', acted_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(req.params.id);

  logActivity('connection_declined', 'connection', req.params.id, `Declined: ${conn.name}`);
  res.json({ success: true, message: `Declined connection from ${conn.name}` });
});

// Bulk action
router.post('/bulk-action', (req, res) => {
  const { ids, action } = req.body;
  if (!ids || !Array.isArray(ids) || !['accept', 'decline', 'ignore'].includes(action)) {
    return res.status(400).json({ error: 'Invalid request. Provide ids array and action.' });
  }

  const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'ignored';

  for (const id of ids) {
    prepare(`UPDATE connections SET status = ?, acted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id);
  }

  logActivity('connections_bulk_action', 'connection', null, `Bulk ${action}: ${ids.length} connections`);
  res.json({ success: true, affected: ids.length });
});

// Bulk CSV import: POST /api/connections/import
// Accepts { rows: [{ name, headline, profile_url, message }] }
router.post('/import', (req, res) => {
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
      prepare(`
        INSERT INTO connections (id, name, headline, profile_url, message, status, received_at)
        VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      `).run(
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

  logActivity('connections_csv_import', 'connection', null, `Imported ${imported} connections from CSV`);
  res.json({ success: true, imported, errors });
});

module.exports = router;

