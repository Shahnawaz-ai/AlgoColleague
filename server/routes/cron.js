const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');
const linkedInAPI = require('../linkedin-api');

// Self-ping tracking to avoid duplicate loops
let selfPingScheduled = false;

router.get('/', async (req, res) => {
  try {
    console.log('🤖 Cron endpoint triggered');
    const result = await processPostQueue();
    
    // Always refresh analytics, comments, and reactions — no more random gate
    await refreshAnalytics();
    await syncComments();
    await syncReactions();

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
  const publishedPosts = await dbAll(`
    SELECT p.* 
    FROM posts p
    LEFT JOIN analytics a ON p.id = a.post_id
    WHERE p.status = 'published' AND p.linkedin_post_id IS NOT NULL AND p.linkedin_post_id != '' 
    ORDER BY a.fetched_at ASC NULLS FIRST 
    LIMIT 5
  `);

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
        const reactionsBreakdown = JSON.stringify(analytics.reactionsBreakdown || {});

        const existing = await dbGet('SELECT id FROM analytics WHERE id = ?', analyticsId);
        if (existing) {
          await dbRun(
            'UPDATE analytics SET likes = ?, comments = ?, shares = ?, reactions_breakdown = ?, fetched_at = CURRENT_TIMESTAMP WHERE id = ?',
            likes, comments, shares, reactionsBreakdown, analyticsId
          );
        } else {
          await dbRun(
            'INSERT INTO analytics (id, post_id, likes, comments, shares, reactions_breakdown, fetched_at, user_id) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
            analyticsId, post.id, likes, comments, shares, reactionsBreakdown, post.user_id
          );
        }
        console.log(`  ✅ Analytics updated for post ${post.id}: ${likes} likes, ${comments} comments, ${shares} shares`);
      }
    } catch (error) {
      console.error(`Failed to refresh analytics for post ${post.id}:`, error.message);
    }
  }
}

async function syncComments() {
  const publishedPosts = await dbAll(`
    SELECT p.* 
    FROM posts p
    LEFT JOIN analytics a ON p.id = a.post_id
    WHERE p.status = 'published' AND p.linkedin_post_id IS NOT NULL AND p.linkedin_post_id != '' 
    ORDER BY a.fetched_at ASC NULLS FIRST 
    LIMIT 5
  `);

  console.log(`💬 Syncing comments for ${publishedPosts.length} posts...`);

  for (const post of publishedPosts) {
    if (!(await linkedInAPI.isTokenValid(post.user_id))) {
      continue;
    }
    try {
      const comments = await linkedInAPI.getPostComments(post.user_id, post.linkedin_post_id);
      if (!comments || comments.length === 0) continue;

      let newCount = 0;
      for (const comment of comments) {
        // Skip if we already have this comment (de-duplicate by linkedin_comment_id)
        if (comment.linkedin_comment_id) {
          const existing = await dbGet(
            'SELECT id FROM comments WHERE linkedin_comment_id = ? AND user_id = ?',
            comment.linkedin_comment_id, post.user_id
          );
          if (existing) continue;
        }

        const id = uuidv4();
        await dbRun(
          `INSERT INTO comments (id, post_id, linkedin_comment_id, author_name, author_headline, content, created_at, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id, post.id,
          comment.linkedin_comment_id || null,
          comment.author_name || 'LinkedIn User',
          '',
          comment.content || '',
          comment.created_at || new Date().toISOString(),
          post.user_id
        );
        newCount++;
      }

      if (newCount > 0) {
        await logActivity('comments_synced', 'post', post.id, `Synced ${newCount} new comments from LinkedIn`, post.user_id);
        console.log(`  💬 Synced ${newCount} new comments for post ${post.id}`);
      }
    } catch (error) {
      console.error(`Failed to sync comments for post ${post.id}:`, error.message);
    }
  }
}

async function syncReactions() {
  const publishedPosts = await dbAll(`
    SELECT p.* 
    FROM posts p
    LEFT JOIN analytics a ON p.id = a.post_id
    WHERE p.status = 'published' AND p.linkedin_post_id IS NOT NULL AND p.linkedin_post_id != '' 
    ORDER BY a.fetched_at ASC NULLS FIRST 
    LIMIT 5
  `);

  console.log(`❤️ Syncing reactions for ${publishedPosts.length} posts...`);

  for (const post of publishedPosts) {
    if (!(await linkedInAPI.isTokenValid(post.user_id))) {
      continue;
    }
    try {
      const reactions = await linkedInAPI.getPostReactions(post.user_id, post.linkedin_post_id);
      if (!reactions || reactions.length === 0) continue;

      // Build breakdown
      const breakdown = {};
      reactions.forEach(r => {
        const type = r.type || 'LIKE';
        breakdown[type] = (breakdown[type] || 0) + 1;
      });

      const analyticsId = `analytics_${post.id}`;
      const existing = await dbGet('SELECT id FROM analytics WHERE id = ?', analyticsId);
      if (existing) {
        await dbRun(
          'UPDATE analytics SET reactions_breakdown = ?, likes = ?, fetched_at = CURRENT_TIMESTAMP WHERE id = ?',
          JSON.stringify(breakdown), reactions.length, analyticsId
        );
      } else {
        await dbRun(
          'INSERT INTO analytics (id, post_id, likes, reactions_breakdown, fetched_at, user_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
          analyticsId, post.id, reactions.length, JSON.stringify(breakdown), post.user_id
        );
      }
      console.log(`  ❤️ Synced ${reactions.length} reactions for post ${post.id}`);
    } catch (error) {
      console.error(`Failed to sync reactions for post ${post.id}:`, error.message);
    }
  }
}

module.exports = router;
module.exports.processPostQueue = processPostQueue;
module.exports.refreshAnalytics = refreshAnalytics;
module.exports.syncComments = syncComments;
module.exports.syncReactions = syncReactions;
