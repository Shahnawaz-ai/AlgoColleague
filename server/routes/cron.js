const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// Self-ping tracking to avoid duplicate loops
let selfPingScheduled = false;

router.get('/', async (req, res) => {
  try {
    console.log('🤖 Cron endpoint triggered');
    const result = await processPostQueue();
    
    // We only refresh analytics occasionally to save execution time
    if (Math.random() < 0.1) {
      await refreshAnalytics();
    }

    // Self-ping: if there are upcoming queued posts, schedule another call
    // This works around Vercel Hobby's daily-only cron limitation
    const upcomingPosts = await dbAll(
      `SELECT COUNT(*) as count FROM posts WHERE status = 'queued'`
    );
    const hasUpcoming = upcomingPosts[0]?.count > 0;

    if (hasUpcoming && !selfPingScheduled) {
      scheduleSelfPing(req);
    }
    
    res.json({ 
      success: true, 
      message: 'Cron executed successfully',
      processed: result,
      upcomingQueued: upcomingPosts[0]?.count || 0
    });
  } catch (err) {
    console.error('Cron failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function scheduleSelfPing(req) {
  if (selfPingScheduled) return;
  selfPingScheduled = true;

  // Determine the base URL for self-ping
  const host = req.headers.host || process.env.VERCEL_URL || process.env.APP_URL?.replace('https://', '') || `localhost:${process.env.PORT || 3000}`;
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const pingUrl = `${protocol}://${host}/api/cron`;

  console.log(`⏰ Scheduling self-ping in 60s → ${pingUrl}`);

  setTimeout(() => {
    selfPingScheduled = false;
    const client = protocol === 'https' ? https : http;
    const pingReq = client.get(pingUrl, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`🔁 Self-ping response: ${res.statusCode}`);
      });
    });
    pingReq.on('error', (err) => {
      console.error('Self-ping failed:', err.message);
    });
    pingReq.setTimeout(8000, () => {
      pingReq.destroy();
    });
  }, 60 * 1000);
}

async function processPostQueue() {
  const now = new Date().toISOString();
  console.log(`⏱️  Checking queue at ${now}`);
  
  // Process up to 3 due posts per run
  const duePosts = await dbAll(
    `SELECT * FROM posts WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 3`,
    now
  );

  console.log(`📬 Found ${duePosts.length} due posts`);
  let processed = 0;

  for (const post of duePosts) {
    if (!(await linkedInAPI.isTokenValid(post.user_id))) {
      console.log(`Token invalid for user ${post.user_id}. Failing post ${post.id}.`);
      await dbRun("UPDATE posts SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 'LinkedIn token invalid or expired. Please reconnect your account.', post.id);
      continue;
    }
    await publishPost(post);
    processed++;
  }
  
  return processed;
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
