const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// Secure the cron endpoint in production so only Vercel can trigger it
// Vercel sends a specific header for cron jobs if configured, or we can use a secret token
// For this MVP, we will just allow it, or secure it with an env var CRON_SECRET if desired.

router.get('/', async (req, res) => {
  try {
    console.log('🤖 Cron endpoint triggered');
    await processPostQueue();
    // We only refresh analytics occasionally to save Vercel execution time
    if (Math.random() < 0.1) { // 10% chance to refresh analytics on any given minute
      await refreshAnalytics();
    }
    
    res.json({ success: true, message: 'Cron executed successfully' });
  } catch (err) {
    console.error('Cron failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function processPostQueue() {
  const now = new Date().toISOString();
  // Vercel Free Serverless Functions have a 10-second timeout!
  // To avoid timeouts, we process exactly ONE post per minute.
  const duePosts = await dbAll(
    `SELECT * FROM posts WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 1`,
    now
  );

  for (const post of duePosts) {
    if (!(await linkedInAPI.isTokenValid(post.user_id))) {
      console.log(`Token invalid for user ${post.user_id}. Failing post ${post.id}.`);
      await dbRun("UPDATE posts SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 'LinkedIn token invalid or expired. Please reconnect your account.', post.id);
      continue;
    }
    await publishPost(post);
  }
}

async function publishPost(post) {
  try {
    await dbRun("UPDATE posts SET status = 'publishing', updated_at = CURRENT_TIMESTAMP WHERE id = ?", post.id);
    console.log(`📤 Publishing post: ${post.id} — "${String(post.content).substring(0, 50)}..."`);

    let result;
    const mediaUrls = JSON.parse(post.media_urls || '[]');

    if (mediaUrls.length > 0 && post.post_type !== 'text') {
      result = await linkedInAPI.createImagePost(post.user_id, post.content, mediaUrls);
    } else {
      result = await linkedInAPI.createTextPost(post.user_id, post.content);
    }

    if (result.success) {
      await dbRun(`UPDATE posts SET status = 'published', linkedin_post_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        result.linkedinPostId || '', post.id);
      await logActivity('post_published', 'post', post.id, `Post published to LinkedIn: ${result.linkedinPostId}`);
      console.log(`✅ Post ${post.id} published successfully`);
    } else {
      throw new Error('LinkedIn API returned unsuccessful response');
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    await dbRun("UPDATE posts SET status = 'failed', error_message = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", errorMsg, post.id);
    await logActivity('post_failed', 'post', post.id, `Publish failed: ${errorMsg}`);
    console.error(`❌ Post ${post.id} failed:`, errorMsg);

    // Retry logic: re-queue if under 3 retries
    if ((post.retry_count || 0) < 3) {
      const retryDelay = Math.pow(2, post.retry_count || 0) * 60000;
      const retryAt = new Date(Date.now() + retryDelay).toISOString();
      await dbRun("UPDATE posts SET status = 'queued', scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", retryAt, post.id);
      console.log(`🔄 Post ${post.id} re-queued for retry at ${retryAt}`);
    }
  }
}

async function refreshAnalytics() {
  const publishedPosts = await dbAll(
    `SELECT * FROM posts WHERE status = 'published' AND linkedin_post_id IS NOT NULL ORDER BY published_at DESC LIMIT 5`
  );

  console.log(`📊 Refreshing analytics for ${publishedPosts.length} posts...`);

  for (const post of publishedPosts) {
    if (!(await linkedInAPI.isTokenValid(post.user_id))) {
      continue;
    }
    try {
      const analytics = await linkedInAPI.getPostAnalytics(post.user_id, post.linkedin_post_id);
      if (analytics) {
        const analyticsId = `analytics_${post.id}`;
        const likes = analytics.likesSummary?.totalLikes || 0;
        const comments = analytics.commentsSummary?.totalFirstLevelComments || 0;
        const shares = analytics.sharesSummary?.totalShares || 0;

        const existing = await dbGet('SELECT id FROM analytics WHERE id = ?', analyticsId);
        if (existing) {
          await dbRun('UPDATE analytics SET likes = ?, comments = ?, shares = ?, fetched_at = CURRENT_TIMESTAMP WHERE id = ?', likes, comments, shares, analyticsId);
        } else {
          await dbRun('INSERT INTO analytics (id, post_id, likes, comments, shares, fetched_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)', analyticsId, post.id, likes, comments, shares);
        }
      }
    } catch (error) {
      console.error(`Failed to refresh analytics for post ${post.id}:`, error.message);
    }
  }
}

module.exports = router;
module.exports.processPostQueue = processPostQueue;
