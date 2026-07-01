const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { prepare, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// List comments
router.get('/', (req, res) => {
  const { post_id, unreplied, limit = 50 } = req.query;
  let query = `
    SELECT c.*, p.content as post_content, p.linkedin_post_id
    FROM comments c
    JOIN posts p ON p.id = c.post_id
    WHERE 1=1
  `;
  const params = [];

  if (post_id) {
    query += ' AND c.post_id = ?';
    params.push(post_id);
  }
  if (unreplied === 'true') {
    query += ' AND c.is_reply_sent = 0';
  }

  query += ' ORDER BY c.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const comments = prepare(query).all(...params);

  const stats = {
    total: prepare('SELECT COUNT(*) as c FROM comments').get().c,
    unreplied: prepare('SELECT COUNT(*) as c FROM comments WHERE is_reply_sent = 0').get().c,
    replied: prepare('SELECT COUNT(*) as c FROM comments WHERE is_reply_sent = 1').get().c,
  };

  res.json({ comments, stats });
});

// Add comment
router.post('/', (req, res) => {
  const { post_id, author_name, author_headline, content, linkedin_comment_id } = req.body;
  if (!post_id || !content) {
    return res.status(400).json({ error: 'post_id and content are required' });
  }

  const id = uuidv4();
  prepare(`
    INSERT INTO comments (id, post_id, linkedin_comment_id, author_name, author_headline, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, post_id, linkedin_comment_id || null, author_name || 'Unknown', author_headline || '', content);

  logActivity('comment_received', 'comment', id, `New comment from ${author_name}`);

  const comment = prepare('SELECT * FROM comments WHERE id = ?').get(id);
  res.status(201).json({ comment });
});

// Reply to a comment
router.post('/:id/reply', async (req, res) => {
  const comment = prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const { reply_content } = req.body;
  if (!reply_content) return res.status(400).json({ error: 'Reply content is required' });

  let sentViaApi = false;
  if (linkedInAPI.isTokenValid() && comment.linkedin_comment_id) {
    try {
      const post = prepare('SELECT * FROM posts WHERE id = ?').get(comment.post_id);
      if (post && post.linkedin_post_id) {
        await linkedInAPI.replyToComment(post.linkedin_post_id, comment.linkedin_comment_id, reply_content);
        sentViaApi = true;
      }
    } catch (error) {
      console.error('API reply failed, saving locally:', error.message);
    }
  }

  prepare(`UPDATE comments SET is_reply_sent = 1, reply_content = ?, replied_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(reply_content, req.params.id);

  logActivity('comment_replied', 'comment', req.params.id, `Replied to ${comment.author_name}`);
  res.json({ success: true, sentViaApi });
});

// Get auto-response rules
router.get('/auto-rules', (req, res) => {
  const rules = prepare('SELECT * FROM auto_response_rules ORDER BY created_at DESC').all();
  res.json({ rules });
});

// Create auto-response rule
router.post('/auto-rules', (req, res) => {
  const { name, trigger_type = 'keyword', trigger_value, response_template } = req.body;
  if (!name || !response_template) {
    return res.status(400).json({ error: 'Name and response_template are required' });
  }

  const id = uuidv4();
  prepare(`
    INSERT INTO auto_response_rules (id, name, trigger_type, trigger_value, response_template, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, name, trigger_type, trigger_value || '', response_template);

  logActivity('auto_rule_created', 'auto_rule', id, `Created rule: ${name}`);

  const rule = prepare('SELECT * FROM auto_response_rules WHERE id = ?').get(id);
  res.status(201).json({ rule });
});

// Update auto-response rule
router.put('/auto-rules/:id', (req, res) => {
  const rule = prepare('SELECT * FROM auto_response_rules WHERE id = ?').get(req.params.id);
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

  params.push(req.params.id);
  prepare(`UPDATE auto_response_rules SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = prepare('SELECT * FROM auto_response_rules WHERE id = ?').get(req.params.id);
  res.json({ rule: updated });
});

// Delete auto-response rule
router.delete('/auto-rules/:id', (req, res) => {
  prepare('DELETE FROM auto_response_rules WHERE id = ?').run(req.params.id);
  logActivity('auto_rule_deleted', 'auto_rule', req.params.id, 'Rule deleted');
  res.json({ success: true });
});

module.exports = router;
