const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../db');

// Dashboard overview
router.get('/overview', async (req, res) => {
  const totalPosts = await dbGet('SELECT COUNT(*) as count FROM posts').count;
  const publishedPosts = await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'published'").count;
  const scheduledPosts = await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'queued'").count;
  const draftPosts = await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'").count;
  const failedPosts = await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'failed'").count;

  const engagement = await dbGet(`
    SELECT
      COALESCE(SUM(likes), 0) as total_likes,
      COALESCE(SUM(comments), 0) as total_comments,
      COALESCE(SUM(shares), 0) as total_shares,
      COALESCE(SUM(impressions), 0) as total_impressions,
      COALESCE(AVG(engagement_rate), 0) as avg_engagement_rate
    FROM analytics
  `);

  const recentActivity = await dbGet(
    'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 15'
  ).all();

  const upcomingPosts = await dbAll(
    "SELECT * FROM posts WHERE status = 'queued' ORDER BY scheduled_at ASC LIMIT 10"
  ).map(p => ({
    ...p,
    media_urls: JSON.parse(p.media_urls || '[]'),
    tags: JSON.parse(p.tags || '[]'),
  }));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const postsThisWeek = await dbAll(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at >= ?"
  , weekAgo).count;

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const postsThisMonth = await dbGet(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at >= ?"
  , monthAgo).count;

  res.json({
    stats: { totalPosts, publishedPosts, scheduledPosts, draftPosts, failedPosts, postsThisWeek, postsThisMonth },
    engagement,
    recentActivity,
    upcomingPosts,
  });
});

// Per-post analytics
router.get('/posts/:id', async (req, res) => {
  const analytics = await dbGet('SELECT * FROM analytics WHERE post_id = ?', req.params.id);
  if (!analytics) return res.status(404).json({ error: 'No analytics found for this post' });

  analytics.reactions_breakdown = JSON.parse(analytics.reactions_breakdown || '{}');
  res.json({ analytics });
});

// Best posting times
router.get('/best-times', async (req, res) => {
  const published = prepare(
    "SELECT published_at FROM posts WHERE status = 'published' AND published_at IS NOT NULL"
  );

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);

  published.forEach(p => {
    const date = new Date(p.published_at);
    hourCounts[date.getHours()]++;
    dayCounts[date.getDay()]++;
  });

  const hourEngagement = new Array(24).fill(0);
  const postsWithAnalytics = await dbAll(`
    SELECT p.published_at, a.likes, a.comments, a.shares
    FROM posts p
    JOIN analytics a ON a.post_id = p.id
    WHERE p.status = 'published' AND p.published_at IS NOT NULL
  `);

  postsWithAnalytics.forEach(p => {
    const hour = new Date(p.published_at).getHours();
    hourEngagement[hour] += (p.likes + p.comments * 2 + p.shares * 3);
  });

  res.json({ hourDistribution: hourCounts, dayDistribution: dayCounts, hourEngagement, totalAnalyzed: published.length });
});

// Engagement trend
router.get('/trend', async (req, res) => {
  const { days = 30 } = req.query;
  const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

  const posts = await dbAll(`
    SELECT
      DATE(p.published_at) as date,
      COUNT(*) as post_count,
      COALESCE(SUM(a.likes), 0) as likes,
      COALESCE(SUM(a.comments), 0) as comments,
      COALESCE(SUM(a.shares), 0) as shares
    FROM posts p
    LEFT JOIN analytics a ON a.post_id = p.id
    WHERE p.status = 'published' AND p.published_at >= ?
    GROUP BY DATE(p.published_at)
    ORDER BY date ASC
  `, since);

  res.json({ trend: posts, period: parseInt(days) });
});

module.exports = router;
