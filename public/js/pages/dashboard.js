/* ================================================================
   Dashboard Page
   ================================================================ */

const DashboardPage = {
  refreshing: false,
  pollInterval: null,

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
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <h1 class="page-title" style="font-size: 2rem; background: linear-gradient(135deg, var(--text-primary), var(--text-muted)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'} 👋</h1>
            <p class="page-subtitle" style="margin-top: 4px;">Welcome to your Algo Colleague automation hub.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" id="dashboard-refresh-btn" onclick="DashboardPage.refreshData()" style="padding: 10px 20px;">
              🔄 Refresh
            </button>
            <button class="btn btn-primary" onclick="App.navigate('composer')" style="padding: 10px 20px; box-shadow: var(--shadow-glow);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M12 5v14M5 12h14"/></svg>
              New Post
            </button>
          </div>
        </div>
        
        <div class="page-content">
          ${authBanner}

          <!-- Professional Stats Grid -->
          <div class="stats-grid" style="gap: 24px; margin-bottom: 32px;">
            
            <div class="stat-card" style="display:flex; flex-direction:column; justify-content:space-between; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigate('posts'); setTimeout(() => PostsPage.setFilter('published'), 100)">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div class="stat-card-label" style="font-weight: 600; font-size: 0.9rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted);">Published</div>
                <div class="stat-card-icon" style="background: rgba(16,185,129,0.1); padding: 8px; border-radius: 8px; font-size: 1.2rem;">📤</div>
              </div>
              <div class="stat-card-value" style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary); margin-bottom:4px;">${data.stats.publishedPosts}</div>
              <div class="stat-card-change up" style="font-size: 0.85rem; color: var(--accent-emerald); display:flex; align-items:center; font-weight:600;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                ${data.stats.postsThisWeek} this week
              </div>
            </div>

            <div class="stat-card" style="display:flex; flex-direction:column; justify-content:space-between; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigate('posts'); setTimeout(() => PostsPage.setFilter('queued'), 100)">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div class="stat-card-label" style="font-weight: 600; font-size: 0.9rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted);">Scheduled</div>
                <div class="stat-card-icon" style="background: rgba(59,130,246,0.1); padding: 8px; border-radius: 8px; font-size: 1.2rem;">📅</div>
              </div>
              <div class="stat-card-value" style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary); margin-bottom:4px;">${data.stats.scheduledPosts}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">In your queue</div>
            </div>

            <div class="stat-card" style="display:flex; flex-direction:column; justify-content:space-between; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigate('posts'); setTimeout(() => PostsPage.setFilter('draft'), 100)">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div class="stat-card-label" style="font-weight: 600; font-size: 0.9rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted);">Drafts</div>
                <div class="stat-card-icon" style="background: rgba(245,158,11,0.1); padding: 8px; border-radius: 8px; font-size: 1.2rem;">📝</div>
              </div>
              <div class="stat-card-value" style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary); margin-bottom:4px;">${data.stats.draftPosts}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">Pending review</div>
            </div>

            <div class="stat-card" style="display:flex; flex-direction:column; justify-content:space-between;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div class="stat-card-label" style="font-weight: 600; font-size: 0.9rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted);">Total Posts</div>
                <div class="stat-card-icon" style="background: rgba(139,92,246,0.1); padding: 8px; border-radius: 8px; font-size: 1.2rem;">📚</div>
              </div>
              <div class="stat-card-value" style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary); margin-bottom:4px;">${data.stats.totalPosts}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">Lifetime total</div>
            </div>
          </div>

          <div class="grid-2" style="gap: 24px;">
            <!-- Upcoming Posts -->
            <div class="card" style="padding: 0; overflow: hidden; border: 1px solid var(--border-subtle);">
              <div class="card-header" style="padding: 20px; border-bottom: 1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2);">
                <h3 class="card-title" style="margin:0; font-size: 1.1rem; display:flex; align-items:center; gap:8px;">
                  <span style="background:var(--surface-hover); padding:6px; border-radius:6px;">📅</span> Upcoming Posts
                </h3>
              </div>
              ${data.upcomingPosts.length === 0 ? `
                <div class="empty-state" style="padding: 40px 20px; text-align:center;">
                  <div class="empty-state-icon" style="opacity:0.5;">✨</div>
                  <div class="empty-state-title" style="margin-top: 10px;">Queue is empty</div>
                  <div class="empty-state-text" style="max-width:250px; margin:10px auto;">Keep your audience engaged by scheduling a new post.</div>
                  <button class="btn btn-outline" style="margin-top:10px;" onclick="App.navigate('composer')">Create Post</button>
                </div>
              ` : `
                <div class="activity-list" style="padding: 10px;">
                  ${data.upcomingPosts.map(post => `
                    <div class="activity-item" style="cursor:pointer; padding:16px; border-radius:8px; transition:background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigate('composer')">
                      <div class="activity-icon post" style="background: rgba(59,130,246,0.1); color: #3b82f6;">📤</div>
                      <div class="activity-text">
                        <div style="color:var(--text-primary); font-weight:600; margin-bottom:4px; font-size:0.95rem;">${App.truncate(post.content, 70)}</div>
                        <div class="text-xs text-muted" style="display:flex; align-items:center; gap:8px;">
                          ${App.getStatusBadge(post.status)}
                          <span>Scheduled: ${App.formatDateTime(post.scheduled_at)}</span>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Recent Activity -->
            <div class="card" style="padding: 0; overflow: hidden; border: 1px solid var(--border-subtle);">
              <div class="card-header" style="padding: 20px; border-bottom: 1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.2);">
                <h3 class="card-title" style="margin:0; font-size: 1.1rem; display:flex; align-items:center; gap:8px;">
                  <span style="background:var(--surface-hover); padding:6px; border-radius:6px;">⚡</span> Activity Log
                </h3>
              </div>
              ${data.recentActivity.length === 0 ? `
                <div class="empty-state" style="padding: 40px 20px; text-align:center;">
                  <div class="empty-state-icon" style="opacity:0.5;">📝</div>
                  <div class="empty-state-title" style="margin-top: 10px;">No recent activity</div>
                  <div class="empty-state-text" style="max-width:250px; margin:10px auto;">Automation events and actions will appear here.</div>
                </div>
              ` : `
                <div class="activity-list" style="padding: 10px;">
                  ${data.recentActivity.map(log => {
                    const iconClass = log.action.includes('post') ? 'post' :
                      log.action.includes('auth') ? 'auth' :
                      log.action.includes('fail') || log.action.includes('error') ? 'error' :
                      log.action.includes('comment') ? 'comment' : 'default';
                    const iconEmoji = log.action.includes('post') ? '📤' :
                      log.action.includes('auth') ? '🔐' :
                      log.action.includes('settings') ? '⚙️' :
                      log.action.includes('comment') ? '💬' : '⚡';
                      
                    const iconColor = log.action.includes('post') ? 'rgba(59,130,246,0.1)' :
                      log.action.includes('auth') ? 'rgba(16,185,129,0.1)' :
                      log.action.includes('settings') ? 'rgba(139,92,246,0.1)' :
                      log.action.includes('comment') ? 'rgba(139,92,246,0.1)' : 'rgba(245,158,11,0.1)';
                      
                    const iconTextColor = log.action.includes('post') ? '#3b82f6' :
                      log.action.includes('auth') ? '#10b981' :
                      log.action.includes('settings') ? '#8b5cf6' :
                      log.action.includes('comment') ? '#8b5cf6' : '#f59e0b';

                    return `
                      <div class="activity-item" style="padding:16px; border-radius:8px; border-bottom:1px solid transparent; transition:background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'">
                        <div class="activity-icon ${iconClass}" style="background: ${iconColor}; color: ${iconTextColor};">${iconEmoji}</div>
                        <div class="activity-text">
                          <div style="color:var(--text-primary); font-weight:500;">${log.details}</div>
                          <div class="text-xs text-muted" style="margin-top: 4px;">${App.formatDateTime(log.created_at)}</div>
                        </div>
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
                <div class="text-xs text-muted mb-sm">Total Published</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary)">${data.stats.publishedPosts}</div>
              </div>
              <div>
                <div class="text-xs text-muted mb-sm">Total Scheduled</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary)">${data.stats.scheduledPosts}</div>
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

      if (this.pollInterval) clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => {
        if (App.currentPage !== 'dashboard') {
          clearInterval(this.pollInterval);
          return;
        }
        this.pollUpdates();
      }, 1000);
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

  async refreshData() {
    if (this.refreshing) return;
    this.refreshing = true;
    const btn = document.getElementById('dashboard-refresh-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Syncing...';
    }

    try {
      await App.api('/api/analytics/refresh', { method: 'POST' });
      App.toast('✅ Data refreshed from LinkedIn!', 'success');
      await this.render();
    } catch (error) {
      App.toast(`Refresh failed: ${error.message}`, 'error');
    } finally {
      this.refreshing = false;
    }
  },

  async pollUpdates() {
    if (this.refreshing) return;
    try {
      const data = await App.api('/api/analytics/overview');
      const vals = document.querySelectorAll('.stat-card-value');
      if (vals.length >= 4) {
        vals[0].textContent = data.stats.publishedPosts;
        vals[1].textContent = data.stats.scheduledPosts;
        vals[2].textContent = data.stats.draftPosts;
        vals[3].textContent = data.stats.totalPosts;
      }
    } catch (e) {
      // Ignore polling errors to prevent spam
    }
  }
};
