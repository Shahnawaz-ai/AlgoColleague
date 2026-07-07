const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// List comments
router.get('/', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { post_id, unreplied, limit = 50 } = req.query;
    let query = `
      SELECT c.*, p.content as post_content, p.linkedin_post_id
      FROM comments c
      JOIN posts p ON p.id = c.post_id
      WHERE c.user_id = ?
    `;
    const params = [userId];

    if (post_id) {
      query += ' AND c.post_id = ?';
      params.push(post_id);
    }
    if (unreplied === 'true') {
      query += ' AND c.is_reply_sent = 0';
    }

    query += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const comments = await dbAll(query, ...params);

    const stats = {
      total: (await dbGet('SELECT COUNT(*) as c FROM comments WHERE user_id = ?', userId)).c,
      unreplied: (await dbGet('SELECT COUNT(*) as c FROM comments WHERE is_reply_sent = 0 AND user_id = ?', userId)).c,
      replied: (await dbGet('SELECT COUNT(*) as c FROM comments WHERE is_reply_sent = 1 AND user_id = ?', userId)).c,
    };

    res.json({ comments, stats });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add comment
router.post('/', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { post_id, author_name, author_headline, content, linkedin_comment_id } = req.body;
    if (!post_id || !content) {
      return res.status(400).json({ error: 'post_id and content are required' });
    }

    const id = uuidv4();
    await dbRun(`
      INSERT INTO comments (id, post_id, linkedin_comment_id, author_name, author_headline, content, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `, id, post_id, linkedin_comment_id || null, author_name || 'Unknown', author_headline || '', content, userId);

    await logActivity('comment_received', 'comment', id, `New comment from ${author_name}`, userId);

    const comment = await dbGet('SELECT * FROM comments WHERE id = ? AND user_id = ?', id, userId);
    res.status(201).json({ comment });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Reply to a comment
router.post('/:id/reply', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const comment = await dbGet('SELECT * FROM comments WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const { reply_content } = req.body;
    if (!reply_content) return res.status(400).json({ error: 'Reply content is required' });

    let sentViaApi = false;
    if (await linkedInAPI.isTokenValid(userId) && comment.linkedin_comment_id) {
      try {
        const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', comment.post_id, userId);
        if (post && post.linkedin_post_id) {
          await linkedInAPI.replyToComment(userId, post.linkedin_post_id, comment.linkedin_comment_id, reply_content);
          sentViaApi = true;
        }
      } catch (error) {
        console.error('API reply failed, saving locally:', error.message);
      }
    }

    await dbRun(`UPDATE comments SET is_reply_sent = 1, reply_content = ?, replied_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
      reply_content, req.params.id, userId);

    await logActivity('comment_replied', 'comment', req.params.id, `Replied to ${comment.author_name}`, userId);
    res.json({ success: true, sentViaApi });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get auto-response rules
router.get('/auto-rules', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const rules = await dbAll('SELECT * FROM auto_response_rules WHERE user_id = ? ORDER BY created_at DESC', userId);
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Create auto-response rule
router.post('/auto-rules', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { name, trigger_type = 'keyword', trigger_value, response_template } = req.body;
    if (!name || !response_template) {
      return res.status(400).json({ error: 'Name and response_template are required' });
    }

    const id = uuidv4();
    await dbRun(`
      INSERT INTO auto_response_rules (id, name, trigger_type, trigger_value, response_template, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `, id, name, trigger_type, trigger_value || '', response_template, userId);

    await logActivity('auto_rule_created', 'auto_rule', id, `Created rule: ${name}`, userId);

    const rule = await dbGet('SELECT * FROM auto_response_rules WHERE id = ? AND user_id = ?', id, userId);
    res.status(201).json({ rule });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Update auto-response rule
router.put('/auto-rules/:id', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const rule = await dbGet('SELECT * FROM auto_response_rules WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const { name, trigger_type, trigger_value, response_template, is_active } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (trigger_type !== undefined) { updates.push('trigger_type = ?'); params.push(trigger_type); }
    if (trigger_value !== undefined) { updates.push('trigger_value = ?'); params.push(trigger_value); }
    if (response_template !== undefined) { updates.push('response_template = ?'); params.push(response_template); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id, userId);
    await dbRun(`UPDATE auto_response_rules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, ...params);

    const updated = await dbGet('SELECT * FROM auto_response_rules WHERE id = ? AND user_id = ?', req.params.id, userId);
    res.json({ rule: updated });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete auto-response rule
router.delete('/auto-rules/:id', async (req, res) => {
  try {
    const userId = req.auth.userId;
    await dbRun('DELETE FROM auto_response_rules WHERE id = ? AND user_id = ?', req.params.id, userId);
    await logActivity('auto_rule_deleted', 'auto_rule', req.params.id, 'Rule deleted', userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
