const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../db');

// Dashboard overview
router.get('/overview', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const totalPosts = (await dbGet('SELECT COUNT(*) as count FROM posts WHERE user_id = ?', userId)).count;
    const publishedPosts = (await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND user_id = ?", userId)).count;
    const scheduledPosts = (await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'queued' AND user_id = ?", userId)).count;
    const draftPosts = (await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'draft' AND user_id = ?", userId)).count;
    const failedPosts = (await dbGet("SELECT COUNT(*) as count FROM posts WHERE status = 'failed' AND user_id = ?", userId)).count;

    const engagement = await dbGet(`
      SELECT
        COALESCE(SUM(a.likes), 0) as total_likes,
        COALESCE(SUM(a.comments), 0) as total_comments,
        COALESCE(SUM(a.shares), 0) as total_shares,
        COALESCE(SUM(a.impressions), 0) as total_impressions,
        COALESCE(AVG(a.engagement_rate), 0) as avg_engagement_rate
      FROM analytics a
      JOIN posts p ON a.post_id = p.id
      WHERE p.user_id = ?
    `, userId);

    const recentActivity = await dbAll(
      'SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 15', userId
    );

    const upcomingPostsRaw = await dbAll(
      "SELECT * FROM posts WHERE status = 'queued' AND user_id = ? ORDER BY scheduled_at ASC LIMIT 10", userId
    );
    
    const upcomingPosts = upcomingPostsRaw.map(p => ({
      ...p,
      media_urls: JSON.parse(p.media_urls || '[]'),
      tags: JSON.parse(p.tags || '[]'),
    }));

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const postsThisWeekRow = await dbGet(
      "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at >= ? AND user_id = ?", weekAgo, userId
    );
    const postsThisWeek = postsThisWeekRow ? postsThisWeekRow.count : 0;

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const postsThisMonthRow = await dbGet(
      "SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at >= ? AND user_id = ?", monthAgo, userId
    );
    const postsThisMonth = postsThisMonthRow ? postsThisMonthRow.count : 0;

    res.json({
      stats: { totalPosts, publishedPosts, scheduledPosts, draftPosts, failedPosts, postsThisWeek, postsThisMonth },
      engagement,
      recentActivity,
      upcomingPosts,
    });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Per-post analytics
router.get('/posts/:id', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const post = await dbGet('SELECT id FROM posts WHERE id = ? AND user_id = ?', req.params.id, userId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    const analytics = await dbGet('SELECT * FROM analytics WHERE post_id = ?', req.params.id);
    if (!analytics) return res.status(404).json({ error: 'No analytics found for this post' });

    analytics.reactions_breakdown = JSON.parse(analytics.reactions_breakdown || '{}');
    res.json({ analytics });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Best posting times
router.get('/best-times', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const published = await dbAll(
      "SELECT published_at FROM posts WHERE status = 'published' AND published_at IS NOT NULL AND user_id = ?", userId
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
      WHERE p.status = 'published' AND p.published_at IS NOT NULL AND p.user_id = ?
    `, userId);

    postsWithAnalytics.forEach(p => {
      const hour = new Date(p.published_at).getHours();
      hourEngagement[hour] += (p.likes + (p.comments * 2) + (p.shares * 3));
    });

    res.json({ hourDistribution: hourCounts, dayDistribution: dayCounts, hourEngagement, totalAnalyzed: published.length });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Engagement trend
router.get('/trend', async (req, res) => {
  try {
    const userId = req.auth.userId;
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
      WHERE p.status = 'published' AND p.published_at >= ? AND p.user_id = ?
      GROUP BY DATE(p.published_at)
      ORDER BY date ASC
    `, since, userId);

    res.json({ trend: posts, period: parseInt(days) });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Manual full refresh — triggers analytics, comments, and reactions sync
router.post('/refresh', async (req, res) => {
  try {
    const { refreshAnalytics, syncComments, syncReactions } = require('./cron');
    
    await refreshAnalytics();
    await syncComments();
    await syncReactions();
    
    // Re-fetch the overview to return fresh data
    const userId = req.auth.userId;
    const engagement = await dbGet(`
      SELECT
        COALESCE(SUM(a.likes), 0) as total_likes,
        COALESCE(SUM(a.comments), 0) as total_comments,
        COALESCE(SUM(a.shares), 0) as total_shares,
        COALESCE(SUM(a.impressions), 0) as total_impressions
      FROM analytics a
      JOIN posts p ON a.post_id = p.id
      WHERE p.user_id = ?
    `, userId);
    
    const commentStats = {
      total: (await dbGet('SELECT COUNT(*) as c FROM comments WHERE user_id = ?', userId))?.c || 0,
      unreplied: (await dbGet('SELECT COUNT(*) as c FROM comments WHERE is_reply_sent = 0 AND user_id = ?', userId))?.c || 0,
    };
    
    res.json({ 
      success: true, 
      message: 'Analytics, comments, and reactions refreshed',
      engagement,
      commentStats,
    });
  } catch (err) {
    console.error('Manual refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh analytics: ' + err.message });
  }
});

module.exports = router;
