const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// Configure multer for image uploads
const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

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
  const { status, from, to, limit = 50, offset = 0, search } = req.query;
  let query = 'SELECT * FROM posts WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM posts WHERE 1=1';
  const params = [];
  const countParams = [];

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
    params.push(from, from);
  }
  if (to) {
    query += ' AND (scheduled_at <= ? OR published_at <= ?)';
    params.push(to, to);
  }

  query += ' ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const posts = await dbGet(query).all(...params);
  const total = await dbRun(countQuery, ...countParams).count;

  const parsed = posts.map(p => ({
    ...p,
    media_urls: JSON.parse(p.media_urls || '[]'),
    tags: JSON.parse(p.tags || '[]'),
  }));

  res.json({ posts: parsed, total });
});

// Get single post
router.get('/:id', async (req, res) => {
  const post = await dbGet('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.media_urls = JSON.parse(post.media_urls || '[]');
  post.tags = JSON.parse(post.tags || '[]');

  const analytics = await dbGet('SELECT * FROM analytics WHERE post_id = ?', post.id);
  res.json({ post, analytics });
});

// Create new post
router.post('/', async (req, res) => {
  const { content, post_type = 'text', scheduled_at, tags = [], status = 'draft', template_id } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Post content is required' });
  }

  const id = uuidv4();
  const finalStatus = scheduled_at ? 'queued' : status;

  // --- FREE PLAN LIMITS ---
  const { getSetting } = require('../db');
  const plan = getSetting('subscription_plan') || 'starter';
  if (plan === 'starter') {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const count = await dbGet('SELECT COUNT(*) as count FROM posts WHERE created_at LIKE ? AND status != ?', `${currentMonth}%`, 'failed').count;
    if (count >= 6) {
      return res.status(403).json({ 
        error: 'You have reached your free limit of 6 posts this month. To schedule more posts, please upgrade to the Pro plan.' 
      });
    }
  }
  // -------------------------

  await dbGet(`
    INSERT INTO posts (id, content, post_type, scheduled_at, status, tags, template_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, id, content.trim(), post_type, scheduled_at || null, finalStatus, JSON.stringify(tags), template_id || null);

  logActivity('post_created', 'post', id, `Created ${finalStatus} post`);

  const post = await dbRun('SELECT * FROM posts WHERE id = ?', id);
  post.media_urls = JSON.parse(post.media_urls || '[]');
  post.tags = JSON.parse(post.tags || '[]');

  res.status(201).json({ post });
});

// Update post
router.put('/:id', async (req, res) => {
  const post = await dbGet('SELECT * FROM posts WHERE id = ?', req.params.id);
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
  params.push(req.params.id);

  await dbGet(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`, ...params);
  logActivity('post_updated', 'post', req.params.id, 'Post updated');

  const updated = await dbRun('SELECT * FROM posts WHERE id = ?', req.params.id);
  updated.media_urls = JSON.parse(updated.media_urls || '[]');
  updated.tags = JSON.parse(updated.tags || '[]');

  res.json({ post: updated });
});

// Delete post
router.delete('/:id', async (req, res) => {
  const post = await dbGet('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'publishing') {
    return res.status(400).json({ error: 'Cannot delete a post that is currently publishing' });
  }

  await dbGet('DELETE FROM posts WHERE id = ?', req.params.id);
  logActivity('post_deleted', 'post', req.params.id, 'Post deleted');
  res.json({ success: true });
});

// Publish immediately
router.post('/:id/publish-now', async (req, res) => {
  const post = await dbRun('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'published') {
    return res.status(400).json({ error: 'Post already published' });
  }

  if (!linkedInAPI.isTokenValid()) {
    return res.status(401).json({ error: 'Not authenticated with LinkedIn' });
  }

  try {
    await dbGet("UPDATE posts SET status = 'publishing', updated_at = CURRENT_TIMESTAMP WHERE id = ?", post.id);

    const mediaUrls = JSON.parse(post.media_urls || '[]');
    let result;

    if (mediaUrls.length > 0 && post.post_type !== 'text') {
      result = await linkedInAPI.createImagePost(post.content, mediaUrls);
    } else {
      result = await linkedInAPI.createTextPost(post.content);
    }

    prepare(`UPDATE posts SET status = 'published', linkedin_post_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(result.linkedinPostId || '', post.id);

    logActivity('post_published', 'post', post.id, 'Published immediately');
    res.json({ success: true, linkedinPostId: result.linkedinPostId });
  } catch (error) {
    prepare("UPDATE posts SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(error.message, post.id);
    res.status(500).json({ error: error.message });
  }
});

// Upload image for a post
router.post('/:id/upload-image', upload.single('image'), (req, res) => {
  const post = prepare('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const mediaUrls = JSON.parse(post.media_urls || '[]');
  mediaUrls.push(req.file.path);

  prepare("UPDATE posts SET media_urls = ?, post_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(JSON.stringify(mediaUrls), mediaUrls.length > 1 ? 'multi_image' : 'image', post.id);

  logActivity('image_uploaded', 'post', post.id, `Image uploaded: ${req.file.filename}`);

  res.json({ success: true, filename: req.file.filename, path: req.file.path, mediaUrls });
});

module.exports = router;
