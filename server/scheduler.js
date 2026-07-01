const { prepare, logActivity } = require('./db');
const linkedInAPI = require('./linkedin-api');

class Scheduler {
  async processPostQueue() {
    if (!linkedInAPI.isTokenValid()) {
      const refreshed = await linkedInAPI.refreshAccessToken();
      if (!refreshed) {
        console.log("Scheduler: LinkedIn token invalid and refresh failed.");
        return { success: false, message: 'LinkedIn token invalid' };
      }
    }

    const now = new Date().toISOString();
    const duePosts = await prepare(
      `SELECT * FROM posts WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 5`
    ).all(now);

    const processed = [];
    for (const post of duePosts) {
      await this.publishPost(post);
      processed.push(post.id);
      
      // Delay for a second to avoid spamming the LinkedIn API if processing a batch
      if (duePosts.length > 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    return { success: true, processedCount: processed.length };
  }

  async publishPost(post) {
    try {
      await prepare("UPDATE posts SET status = 'publishing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(post.id);
      console.log(`📤 Publishing post: ${post.id} — "${String(post.content).substring(0, 50)}..."`);

      let result;
      const mediaUrls = JSON.parse(post.media_urls || '[]');

      if (mediaUrls.length > 0 && post.post_type !== 'text') {
        result = await linkedInAPI.createImagePost(post.content, mediaUrls);
      } else {
        result = await linkedInAPI.createTextPost(post.content);
      }

      if (result.success) {
        await prepare(`UPDATE posts SET status = 'published', linkedin_post_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(result.linkedinPostId || '', post.id);
        await logActivity('post_published', 'post', post.id, `Post published to LinkedIn: ${result.linkedinPostId}`);
        console.log(`✅ Post ${post.id} published successfully`);
      } else {
        throw new Error('LinkedIn API returned unsuccessful response');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      await prepare("UPDATE posts SET status = 'failed', error_message = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(errorMsg, post.id);
      await logActivity('post_failed', 'post', post.id, `Publish failed: ${errorMsg}`);
      console.error(`❌ Post ${post.id} failed:`, errorMsg);

      if ((post.retry_count || 0) < 3) {
        const retryDelay = Math.pow(2, post.retry_count || 0) * 60000;
        const retryAt = new Date(Date.now() + retryDelay).toISOString();
        await prepare("UPDATE posts SET status = 'queued', scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(retryAt, post.id);
        console.log(`🔄 Post ${post.id} re-queued for retry at ${retryAt}`);
      }
    }
  }

  async refreshAnalytics() {
    if (!linkedInAPI.isTokenValid()) return { success: false, message: 'Invalid token' };

    const publishedPosts = await prepare(
      `SELECT * FROM posts WHERE status = 'published' AND linkedin_post_id IS NOT NULL ORDER BY published_at DESC LIMIT 50`
    ).all();

    for (const post of publishedPosts) {
      const stats = await linkedInAPI.getPostAnalytics(post.linkedin_post_id);
      if (stats) {
        const analyticsId = `${post.id}_${new Date().toISOString().split('T')[0]}`;
        const existing = await prepare('SELECT id FROM analytics WHERE id = ?').get(analyticsId);
        
        if (existing) {
          await prepare('UPDATE analytics SET likes = ?, comments = ?, shares = ?, fetched_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(stats.likes, stats.comments, stats.shares, analyticsId);
        } else {
          await prepare('INSERT INTO analytics (id, post_id, likes, comments, shares, fetched_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
            .run(analyticsId, post.id, stats.likes, stats.comments, stats.shares);
        }
      }
    }
    
    return { success: true };
  }
}

module.exports = new Scheduler();
