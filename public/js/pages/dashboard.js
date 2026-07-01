/* ================================================================
   Dashboard Page
   ================================================================ */

const DashboardPage = {
  async render() {
    const container = document.getElementById('page-container');

    try {
      const data = await App.api('/api/analytics/overview');

      const authBanner = !App.isAuthenticated ? `
        <div class="auth-banner">
          <div class="auth-banner-icon">🔗</div>
          <div class="auth-banner-content">
            <div class="auth-banner-title">Connect Your LinkedIn Account</div>
            <div class="auth-banner-text">Link your LinkedIn account to start scheduling posts, tracking analytics, and managing connections.</div>
          </div>
          <button class="btn btn-primary" onclick="App.navigate('settings')">Connect Now</button>
        </div>
      ` : '';

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">📊 Dashboard</h1>
          <p class="page-subtitle">Overview of your LinkedIn automation hub</p>
        </div>
        <div class="page-content">
          ${authBanner}

          <!-- Stats Grid -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-icon">📤</div>
              <div class="stat-card-value">${data.stats.publishedPosts}</div>
              <div class="stat-card-label">Published Posts</div>
              <div class="stat-card-change up">↑ ${data.stats.postsThisWeek} this week</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">📅</div>
              <div class="stat-card-value">${data.stats.scheduledPosts}</div>
              <div class="stat-card-label">Scheduled</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">❤️</div>
              <div class="stat-card-value">${data.engagement.total_likes}</div>
              <div class="stat-card-label">Total Reactions</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">💬</div>
              <div class="stat-card-value">${data.engagement.total_comments}</div>
              <div class="stat-card-label">Total Comments</div>
            </div>
          </div>

          <div class="grid-2">
            <!-- Upcoming Posts -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">📅 Upcoming Posts</h3>
                <button class="btn btn-sm btn-primary" onclick="App.navigate('composer')">+ New Post</button>
              </div>
              ${data.upcomingPosts.length === 0 ? `
                <div class="empty-state" style="padding: 30px 16px">
                  <div class="empty-state-icon">📅</div>
                  <div class="empty-state-title">No scheduled posts</div>
                  <div class="empty-state-text">Create and schedule your first post to see it here.</div>
                  <button class="btn btn-primary" onclick="App.navigate('composer')">Create Post</button>
                </div>
              ` : `
                <div class="activity-list">
                  ${data.upcomingPosts.map(post => `
                    <div class="activity-item" style="cursor:pointer" onclick="App.navigate('composer')">
                      <div class="activity-icon post">📤</div>
                      <div class="activity-text">
                        <div style="color:var(--text-primary); font-weight:500">${App.truncate(post.content, 80)}</div>
                        <div class="text-xs text-muted mt-sm">
                          ${App.getStatusBadge(post.status)} · Scheduled for ${App.formatDateTime(post.scheduled_at)}
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Recent Activity -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">⚡ Recent Activity</h3>
              </div>
              ${data.recentActivity.length === 0 ? `
                <div class="empty-state" style="padding: 30px 16px">
                  <div class="empty-state-icon">⚡</div>
                  <div class="empty-state-title">No activity yet</div>
                  <div class="empty-state-text">Your actions and automation events will appear here.</div>
                </div>
              ` : `
                <div class="activity-list">
                  ${data.recentActivity.map(log => {
                    const iconClass = log.action.includes('post') ? 'post' :
                      log.action.includes('auth') ? 'auth' :
                      log.action.includes('fail') || log.action.includes('error') ? 'error' :
                      log.action.includes('comment') ? 'comment' :
                      log.action.includes('connection') ? 'connection' : 'post';
                    const icons = { post: '📤', auth: '🔑', error: '❌', comment: '💬', connection: '🤝' };
                    return `
                      <div class="activity-item">
                        <div class="activity-icon ${iconClass}">${icons[iconClass]}</div>
                        <div class="activity-text">
                          <strong>${log.action.replace(/_/g, ' ')}</strong>
                          ${log.details ? `<br><span class="text-xs text-muted">${App.truncate(log.details, 60)}</span>` : ''}
                        </div>
                        <span class="activity-time">${App.formatRelativeTime(log.created_at)}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          </div>

          <!-- Quick Stats Summary -->
          <div class="card mt-lg">
            <div class="card-header">
              <h3 class="card-title">📊 Monthly Summary</h3>
            </div>
            <div style="display:flex; gap:40px; flex-wrap:wrap; padding:8px 0">
              <div>
                <div class="text-xs text-muted mb-sm">Posts This Month</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary)">${data.stats.postsThisMonth}</div>
              </div>
              <div>
                <div class="text-xs text-muted mb-sm">Total Shares</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary)">${data.engagement.total_shares}</div>
              </div>
              <div>
                <div class="text-xs text-muted mb-sm">Avg Engagement</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary)">${(data.engagement.avg_engagement_rate * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div class="text-xs text-muted mb-sm">Drafts</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary)">${data.stats.draftPosts}</div>
              </div>
              <div>
                <div class="text-xs text-muted mb-sm">Failed</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--accent-rose)">${data.stats.failedPosts}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `
        <div class="page-header"><h1 class="page-title">📊 Dashboard</h1></div>
        <div class="page-content">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">Failed to load dashboard</div>
            <div class="empty-state-text">${error.message}</div>
            <button class="btn btn-primary mt-md" onclick="DashboardPage.render()">Retry</button>
          </div>
        </div>
      `;
    }
  },
};
