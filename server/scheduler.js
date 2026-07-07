const cron = require('node-cron');
const { prepare, logActivity, saveDb } = require('./db');
const linkedInAPI = require('./linkedin-api');

class Scheduler {
  constructor() {
    this.publishJob = null;
    this.analyticsJob = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check for posts to publish every minute
    this.publishJob = cron.schedule('* * * * *', () => {
      this.processPostQueue();
    });

    // Refresh analytics every hour
    this.analyticsJob = cron.schedule('0 * * * *', () => {
      this.refreshAnalytics();
    });

    console.log('📅 Scheduler started — checking posts every minute, analytics every hour');
    logActivity('scheduler_start', 'system', null, 'Scheduler started');
  }

  stop() {
    if (this.publishJob) this.publishJob.stop();
    if (this.analyticsJob) this.analyticsJob.stop();
    this.isRunning = false;
    console.log('⏹️  Scheduler stopped');
  }

  async processPostQueue() {
    if (!linkedInAPI.isTokenValid()) {
      console.log('Token invalid. Cannot process queue.');
      return;
    }

    const now = new Date().toISOString();
    const duePosts = prepare(
      `SELECT * FROM posts WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 5`
    ).all(now);

    for (const post of duePosts) {
      await this.publishPost(post);
      // Randomized delay between posts (30s to 120s)
      const delay = 30000 + Math.random() * 90000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  async publishPost(post) {
    try {
      prepare("UPDATE posts SET status = 'publishing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(post.id);
      console.log(`📤 Publishing post: ${post.id} — "${String(post.content).substring(0, 50)}..."`);

      let result;
      const mediaUrls = JSON.parse(post.media_urls || '[]');

      if (mediaUrls.length > 0 && post.post_type !== 'text') {
        result = await linkedInAPI.createImagePost(post.content, mediaUrls);
      } else {
        result = await linkedInAPI.createTextPost(post.content);
      }

      if (result.success) {
        prepare(`UPDATE posts SET status = 'published', linkedin_post_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(result.linkedinPostId || '', post.id);
        logActivity('post_published', 'post', post.id, `Post published to LinkedIn: ${result.linkedinPostId}`);
        console.log(`✅ Post ${post.id} published successfully`);
      } else {
        throw new Error('LinkedIn API returned unsuccessful response');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      prepare("UPDATE posts SET status = 'failed', error_message = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(errorMsg, post.id);
      logActivity('post_failed', 'post', post.id, `Publish failed: ${errorMsg}`);
      console.error(`❌ Post ${post.id} failed:`, errorMsg);

      // Retry logic: re-queue if under 3 retries
      if ((post.retry_count || 0) < 3) {
        const retryDelay = Math.pow(2, post.retry_count || 0) * 60000;
        const retryAt = new Date(Date.now() + retryDelay).toISOString();
        prepare("UPDATE posts SET status = 'queued', scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(retryAt, post.id);
        console.log(`🔄 Post ${post.id} re-queued for retry at ${retryAt}`);
      }
    }
  }

  async refreshAnalytics() {
    if (!linkedInAPI.isTokenValid()) return;

    const publishedPosts = prepare(
      `SELECT * FROM posts WHERE status = 'published' AND linkedin_post_id IS NOT NULL ORDER BY published_at DESC LIMIT 50`
    ).all();

    console.log(`📊 Refreshing analytics for ${publishedPosts.length} posts...`);

    for (const post of publishedPosts) {
      try {
        const analytics = await linkedInAPI.getPostAnalytics(post.linkedin_post_id);
        if (analytics) {
          const analyticsId = `analytics_${post.id}`;
          const likes = analytics.likesSummary?.totalLikes || 0;
          const comments = analytics.commentsSummary?.totalFirstLevelComments || 0;
          const shares = analytics.sharesSummary?.totalShares || 0;

          const existing = prepare('SELECT id FROM analytics WHERE id = ?').get(analyticsId);
          if (existing) {
            prepare('UPDATE analytics SET likes = ?, comments = ?, shares = ?, fetched_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(likes, comments, shares, analyticsId);
          } else {
            prepare('INSERT INTO analytics (id, post_id, likes, comments, shares, fetched_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
              .run(analyticsId, post.id, likes, comments, shares);
          }
        }
      } catch (error) {
        console.error(`Failed to refresh analytics for post ${post.id}:`, error.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      nextCheck: this.publishJob ? 'Within 1 minute' : 'Not scheduled',
    };
  }
}

module.exports = new Scheduler();
