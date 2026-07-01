/* ================================================================
   Analytics Page — Engagement Metrics, Trends, Best Times
   ================================================================ */

const AnalyticsPage = {
  async render() {
    const container = document.getElementById('page-container');

    try {
      const [overview, bestTimes, trend] = await Promise.all([
        App.api('/api/analytics/overview'),
        App.api('/api/analytics/best-times'),
        App.api('/api/analytics/trend?days=30'),
      ]);

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">📈 Analytics</h1>
          <p class="page-subtitle">Track your LinkedIn performance and engagement trends</p>
        </div>
        <div class="page-content">
          <!-- Key Metrics -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-icon">👁️</div>
              <div class="stat-card-value">${overview.engagement.total_impressions.toLocaleString()}</div>
              <div class="stat-card-label">Total Impressions</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">❤️</div>
              <div class="stat-card-value">${overview.engagement.total_likes.toLocaleString()}</div>
              <div class="stat-card-label">Total Reactions</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">💬</div>
              <div class="stat-card-value">${overview.engagement.total_comments.toLocaleString()}</div>
              <div class="stat-card-label">Total Comments</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">🔁</div>
              <div class="stat-card-value">${overview.engagement.total_shares.toLocaleString()}</div>
              <div class="stat-card-label">Total Shares</div>
            </div>
          </div>

          <div class="grid-2">
            <!-- Best Times Heatmap -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">🕐 Best Posting Times</h3>
                <span class="text-xs text-muted">${bestTimes.totalAnalyzed} posts analyzed</span>
              </div>
              ${bestTimes.totalAnalyzed === 0 ? `
                <div class="empty-state" style="padding:20px">
                  <div class="empty-state-icon">📊</div>
                  <div class="empty-state-title">Not enough data yet</div>
                  <div class="empty-state-text">Publish more posts to see optimal posting times.</div>
                </div>
              ` : `
                <div style="margin-bottom:12px">
                  <div class="text-xs text-muted mb-sm">Engagement by Hour (24h)</div>
                  <div class="heatmap-grid">
                    ${bestTimes.hourEngagement.map((val, i) => {
                      const max = Math.max(...bestTimes.hourEngagement, 1);
                      const intensity = val / max;
                      const bg = intensity > 0.7 ? 'var(--accent-emerald)' :
                        intensity > 0.4 ? 'var(--accent-amber)' :
                        intensity > 0.1 ? 'rgba(99, 102, 241, 0.3)' : 'var(--bg-glass)';
                      return `<div class="heatmap-cell" style="background:${bg}" data-tooltip="${i}:00 — ${val} engagement"></div>`;
                    }).join('')}
                  </div>
                  <div class="heatmap-labels">
                    ${Array.from({length: 24}, (_, i) => `<div class="heatmap-label">${i}</div>`).join('')}
                  </div>
                </div>
                <div>
                  <div class="text-xs text-muted mb-sm">Posts by Day of Week</div>
                  <div class="flex gap-sm" style="align-items:end; height:60px">
                    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                      const max = Math.max(...bestTimes.dayDistribution, 1);
                      const height = (bestTimes.dayDistribution[i] / max) * 100;
                      return `
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px">
                          <div style="width:100%; height:${Math.max(height, 4)}%; background:var(--gradient-primary); border-radius:4px 4px 0 0; min-height:2px" data-tooltip="${bestTimes.dayDistribution[i]} posts"></div>
                          <div class="text-xs text-muted">${day}</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `}
            </div>

            <!-- Engagement Trend -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">📈 30-Day Trend</h3>
              </div>
              ${trend.trend.length === 0 ? `
                <div class="empty-state" style="padding:20px">
                  <div class="empty-state-icon">📈</div>
                  <div class="empty-state-title">No trend data</div>
                  <div class="empty-state-text">Publish posts to see engagement trends over time.</div>
                </div>
              ` : `
                <div style="overflow-x:auto">
                  <div style="min-width:400px">
                    <!-- Simple bar chart -->
                    <div class="flex" style="align-items:end; height:150px; gap:3px; padding-bottom:24px; position:relative">
                      ${trend.trend.map(day => {
                        const maxEngagement = Math.max(...trend.trend.map(d => d.likes + d.comments + d.shares), 1);
                        const engagement = day.likes + day.comments + day.shares;
                        const height = (engagement / maxEngagement) * 100;
                        const date = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return `
                          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px" data-tooltip="${date}: ${engagement} engagement, ${day.post_count} posts">
                            <div class="text-xs" style="color:var(--accent-primary-light); font-weight:600; font-size:0.6rem">${engagement > 0 ? engagement : ''}</div>
                            <div style="width:100%; height:${Math.max(height, 3)}%; background:var(--gradient-primary); border-radius:3px 3px 0 0; min-height:2px; transition:height 0.5s ease"></div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                </div>
              `}
            </div>
          </div>

          <!-- Post Performance Table -->
          <div class="card mt-lg">
            <div class="card-header">
              <h3 class="card-title">📋 Post Performance</h3>
            </div>
            ${overview.stats.publishedPosts === 0 ? `
              <div class="empty-state" style="padding:20px">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-title">No published posts</div>
              </div>
            ` : `
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Post</th>
                      <th>Status</th>
                      <th>Published</th>
                      <th>Engagement</th>
                    </tr>
                  </thead>
                  <tbody id="performance-table-body">
                    <tr><td colspan="4" class="text-center text-muted" style="padding:20px">Loading...</td></tr>
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      `;

      // Load post performance data
      if (overview.stats.publishedPosts > 0) {
        this.loadPostPerformance();
      }
    } catch (error) {
      container.innerHTML = `
        <div class="page-header"><h1 class="page-title">📈 Analytics</h1></div>
        <div class="page-content"><div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Failed to load analytics</div><div class="empty-state-text">${error.message}</div></div></div>
      `;
    }
  },

  async loadPostPerformance() {
    const tbody = document.getElementById('performance-table-body');
    if (!tbody) return;

    try {
      const data = await App.api('/api/posts?status=published&limit=20');

      if (data.posts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No published posts</td></tr>';
        return;
      }

      tbody.innerHTML = data.posts.map(p => `
        <tr>
          <td style="max-width:300px">
            <div style="font-weight:500; color:var(--text-primary)">${App.truncate(p.content, 60)}</div>
          </td>
          <td>${App.getStatusBadge(p.status)}</td>
          <td class="text-sm text-muted">${App.formatDateTime(p.published_at)}</td>
          <td>
            <div class="flex gap-sm text-xs">
              <span data-tooltip="Reactions">❤️ —</span>
              <span data-tooltip="Comments">💬 —</span>
              <span data-tooltip="Shares">🔁 —</span>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Failed to load</td></tr>';
    }
  },
};
