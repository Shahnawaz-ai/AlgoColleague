const { initialize, dbGet, dbAll } = require('./server/db');

async function test() {
  await initialize();
  const userId = 'user_test';
  
  console.log('Testing totalPosts...');
  const totalPosts = (await dbGet('SELECT COUNT(*) as count FROM posts WHERE user_id = ?', userId)).count;
  console.log('totalPosts:', totalPosts);

  console.log('Testing engagement...');
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
  console.log('engagement:', engagement);

  console.log('Testing upcomingPosts...');
  const upcomingPostsRaw = await dbAll(
    "SELECT * FROM posts WHERE status = 'queued' AND user_id = ? ORDER BY scheduled_at ASC LIMIT 10", userId
  );
  console.log('upcomingPosts:', upcomingPostsRaw.length);

  console.log('All DB queries completed successfully.');
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
