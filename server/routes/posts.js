const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// Fire-and-forget ping to wake up the cron scheduler
function triggerCronPing() {
  try {
    const host = process.env.VERCEL_URL || process.env.APP_URL?.replace('https://', '') || `localhost:${process.env.PORT || 3000}`;
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const client = protocol === 'https' ? https : http;
    const pingReq = client.get(`${protocol}://${host}/api/cron`, () => {});
    pingReq.on('error', () => {}); // Ignore errors
    pingReq.setTimeout(5000, () => pingReq.destroy());
  } catch (e) { /* ignore */ }
}

// Configure multer for image uploads
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '..', '..', 'data', 'uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn('Could not create upload dir:', e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// List posts with filters
router.get('/', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const from = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
    const to = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
    const search = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
    const limit = req.query.limit ? (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) : 50;
    const offset = req.query.offset ? (Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset) : 0;
    let query = 'SELECT * FROM posts WHERE user_id = ?';
    let countQuery = 'SELECT COUNT(*) as count FROM posts WHERE user_id = ?';
    const params = [userId];
    const countParams = [userId];

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
      countParams.push(status);
    }
    if (search) {
      query += ' AND content LIKE ?';
      countQuery += ' AND content LIKE ?';
      const searchVal = `%${search}%`;
      params.push(searchVal);
      countParams.push(searchVal);
    }
    if (from) {
      query += ' AND (scheduled_at >= ? OR published_at >= ?)';
      countQuery += ' AND (scheduled_at >= ? OR published_at >= ?)';
      params.push(from, from);
      countParams.push(from, from);
    }
    if (to) {
      query += ' AND (scheduled_at <= ? OR published_at <= ?)';
      countQuery += ' AND (scheduled_at <= ? OR published_at <= ?)';
      params.push(to, to);
      countParams.push(to, to);
    }

    query += ' ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const posts = await dbAll(query, ...params);
    const countResult = await dbGet(countQuery, ...countParams);
    const total = countResult ? countResult.count : 0;

    const parsed = posts.map(p => ({
      ...p,
      media_urls: JSON.parse(p.media_urls || '[]'),
      tags: JSON.parse(p.tags || '[]'),
    }));

    res.json({ posts: parsed, total });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single post
router.get('/:id', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.media_urls = JSON.parse(post.media_urls || '[]');
    post.tags = JSON.parse(post.tags || '[]');

    const analytics = await dbGet('SELECT * FROM analytics WHERE post_id = ?', post.id);
    res.json({ post, analytics });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new post
router.post('/', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { content, post_type = 'text', scheduled_at, tags = [], status = 'draft', template_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const id = uuidv4();
    const finalStatus = scheduled_at ? 'queued' : status;

    // --- FREE PLAN LIMITS REMOVED ---
    // (Limits removed as per request)

    await dbRun(`
      INSERT INTO posts (id, content, post_type, scheduled_at, status, tags, template_id, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `, id, content.trim(), post_type, scheduled_at || null, finalStatus, JSON.stringify(tags), template_id || null, userId);

    await logActivity('post_created', 'post', id, `Created ${finalStatus} post`, userId);

    const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', id, userId);
    post.media_urls = JSON.parse(post.media_urls || '[]');
    post.tags = JSON.parse(post.tags || '[]');

    // If the post is queued, wake up the cron scheduler
    if (finalStatus === 'queued') {
      triggerCronPing();
    }

    res.status(201).json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Update post
router.put('/:id', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'published' || post.status === 'publishing') {
      return res.status(400).json({ error: 'Cannot edit a published or publishing post' });
    }

    const { content, post_type, scheduled_at, tags, status } = req.body;

    const updates = [];
    const params = [];

    if (content !== undefined) { updates.push('content = ?'); params.push(content.trim()); }
    if (post_type !== undefined) { updates.push('post_type = ?'); params.push(post_type); }
    if (scheduled_at !== undefined) { updates.push('scheduled_at = ?'); params.push(scheduled_at); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id, userId);

    await dbRun(`UPDATE posts SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, ...params);
    await logActivity('post_updated', 'post', req.params.id, 'Post updated', userId);

    const updated = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    updated.media_urls = JSON.parse(updated.media_urls || '[]');
    updated.tags = JSON.parse(updated.tags || '[]');

    res.json({ post: updated });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete post
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'publishing') {
      return res.status(400).json({ error: 'Cannot delete a post that is currently publishing' });
    }

    await dbRun('DELETE FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    await logActivity('post_deleted', 'post', req.params.id, 'Post deleted', userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Publish immediately
router.post('/:id/publish-now', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Post already published' });
    }

    if (!(await linkedInAPI.isTokenValid(userId))) {
      return res.status(401).json({ error: 'Not authenticated with LinkedIn' });
    }

    await dbRun("UPDATE posts SET status = 'publishing', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", post.id, userId);

    const mediaUrls = JSON.parse(post.media_urls || '[]');
    let result;

    if (mediaUrls.length > 0 && post.post_type !== 'text') {
      result = await linkedInAPI.createImagePost(userId, post.content, mediaUrls);
    } else {
      result = await linkedInAPI.createTextPost(userId, post.content);
    }

    await dbRun(`UPDATE posts SET status = 'published', linkedin_post_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
      result.linkedinPostId || '', post.id, userId);

    await logActivity('post_published', 'post', post.id, 'Published immediately', userId);
    res.json({ success: true, linkedinPostId: result.linkedinPostId });
  } catch (error) {
    await dbRun("UPDATE posts SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      error.message, req.params.id, req.auth.userId);
    res.status(500).json({ error: error.message });
  }
});

// Upload image for a post
router.post('/:id/upload-image', upload.single('image'), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const post = await dbGet('SELECT * FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const mediaUrls = JSON.parse(post.media_urls || '[]');
    mediaUrls.push(req.file.path);

    await dbRun("UPDATE posts SET media_urls = ?, post_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      JSON.stringify(mediaUrls), mediaUrls.length > 1 ? 'multi_image' : 'image', post.id, userId);

    await logActivity('image_uploaded', 'post', post.id, `Image uploaded: ${req.file.filename}`, userId);

    res.json({ success: true, filename: req.file.filename, path: req.file.path, mediaUrls });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
