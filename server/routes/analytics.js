const express = require('express');
const router = express.Router();
const { prepare } = require('../db');

// Dashboard overview
router.get('/overview', (req, res) => {
  const totalPosts = prepare('SELECT COUNT(*) as count FROM posts').get().count;
  const publishedPosts = prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'published'").get().count;
  const scheduledPosts = prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'queued'").get().count;
  const draftPosts = prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'").get().count;
  const failedPosts = prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'failed'").get().count;

  const engagement = prepare(`
    SELECT
      COALESCE(SUM(likes), 0) as total_likes,
      COALESCE(SUM(comments), 0) as total_comments,
      COALESCE(SUM(shares), 0) as total_shares,
      COALESCE(SUM(impressions), 0) as total_impressions,
      COALESCE(AVG(engagement_rate), 0) as avg_engagement_rate
    FROM analytics
  `).get();

  const recentActivity = prepare(
    'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 15'
  ).all();

  const upcomingPosts = prepare(
    "SELECT * FROM posts WHERE status = 'queued' ORDER BY scheduled_at ASC LIMIT 10"
  ).all().map(p => ({
    ...p,
    media_urls: JSON.parse(p.media_urls || '[]'),
    tags: JSON.parse(p.tags || '[]'),
  }));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const postsThisWeek = prepare(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at >= ?"
  ).get(weekAgo).count;

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const postsThisMonth = prepare(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at >= ?"
  ).get(monthAgo).count;

  res.json({
    stats: { totalPosts, publishedPosts, scheduledPosts, draftPosts, failedPosts, postsThisWeek, postsThisMonth },
    engagement,
    recentActivity,
    upcomingPosts,
  });
});

// Per-post analytics
router.get('/posts/:id', (req, res) => {
  const analytics = prepare('SELECT * FROM analytics WHERE post_id = ?').get(req.params.id);
  if (!analytics) return res.status(404).json({ error: 'No analytics found for this post' });

  analytics.reactions_breakdown = JSON.parse(analytics.reactions_breakdown || '{}');
  res.json({ analytics });
});

// Best posting times
router.get('/best-times', (req, res) => {
  const published = prepare(
    "SELECT published_at FROM posts WHERE status = 'published' AND published_at IS NOT NULL"
  ).all();

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);

  published.forEach(p => {
    const date = new Date(p.published_at);
    hourCounts[date.getHours()]++;
    dayCounts[date.getDay()]++;
  });

  const hourEngagement = new Array(24).fill(0);
  const postsWithAnalytics = prepare(`
    SELECT p.published_at, a.likes, a.comments, a.shares
    FROM posts p
    JOIN analytics a ON a.post_id = p.id
    WHERE p.status = 'published' AND p.published_at IS NOT NULL
  `).all();

  postsWithAnalytics.forEach(p => {
    const hour = new Date(p.published_at).getHours();
    hourEngagement[hour] += (p.likes + p.comments * 2 + p.shares * 3);
  });

  res.json({ hourDistribution: hourCounts, dayDistribution: dayCounts, hourEngagement, totalAnalyzed: published.length });
});

// Engagement trend
router.get('/trend', (req, res) => {
  const { days = 30 } = req.query;
  const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

  const posts = prepare(`
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
  `).all(since);

  res.json({ trend: posts, period: parseInt(days) });
});

module.exports = router;
