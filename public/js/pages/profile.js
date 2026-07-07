/* ================================================================
   Profile Page — User's LinkedIn Profile & Activities
   ================================================================ */

const ProfilePage = {
  async render() {
    const container = document.getElementById('page-container');

    try {
      const authData = await App.api('/api/auth/status');
      if (!authData.authenticated) {
        container.innerHTML = `
          <div class="page-header"><h1 class="page-title">👤 My Profile</h1></div>
          <div class="page-content">
            <div class="empty-state">
              <div class="empty-state-icon">🔗</div>
              <div class="empty-state-title">Not Connected</div>
              <div class="empty-state-text">Connect your LinkedIn account to view your profile and activity.</div>
              <button class="btn btn-primary mt-md" onclick="App.navigate('settings')">Go to Settings</button>
            </div>
          </div>
        `;
        return;
      }

      const analyticsData = await App.api('/api/analytics/overview');
      const profile = authData.profile || {};
      const initials = (profile.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">👤 My Profile</h1>
          <p class="page-subtitle">Your real-time LinkedIn presence and recent activities</p>
        </div>
        <div class="page-content">
          <div class="card mb-lg" style="display:flex; gap:24px; align-items:center; background:var(--surface-hover);">
            <div style="width:100px; height:100px; border-radius:50%; background:var(--accent-primary); color:white; display:flex; align-items:center; justify-content:center; font-size:2.5rem; font-weight:bold; overflow:hidden;">
              ${profile.picture ? `<img src="${profile.picture}" style="width:100%; height:100%; object-fit:cover;" alt="${profile.name}">` : initials}
            </div>
            <div style="flex:1;">
              <h2 style="margin:0; font-size:1.8rem; color:var(--text-primary);">${profile.name || 'LinkedIn User'}</h2>
              <div style="color:var(--text-muted); font-size:1rem; margin-top:4px;">${profile.email || 'Email not available'}</div>
              <div style="margin-top:12px; display:flex; gap:12px;">
                <span class="badge badge-published">✅ Connected</span>
                <span class="badge" style="background:rgba(59,130,246,0.1); color:#3b82f6;">Token Active</span>
              </div>
            </div>
          </div>

          <div class="grid-2" style="gap:24px;">
            <div class="card">
              <div class="card-header"><h3 class="card-title">📊 Quick Stats</h3></div>
              <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between;">
                  <span class="text-muted">Total Posts</span>
                  <strong style="color:var(--text-primary)">${analyticsData.stats.publishedPosts}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span class="text-muted">Total Likes</span>
                  <strong style="color:var(--text-primary)">${analyticsData.engagement.total_likes}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span class="text-muted">Total Comments</span>
                  <strong style="color:var(--text-primary)">${analyticsData.engagement.total_comments}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span class="text-muted">Total Shares</span>
                  <strong style="color:var(--text-primary)">${analyticsData.engagement.total_shares}</strong>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3 class="card-title">⚡ Recent Activities</h3></div>
              ${analyticsData.recentActivity.length === 0 ? `
                <div class="text-muted text-sm" style="padding:20px; text-align:center;">No recent activity to show.</div>
              ` : `
                <div class="activity-list" style="max-height:250px; overflow-y:auto; padding-right:8px;">
                  ${analyticsData.recentActivity.map(log => `
                    <div class="activity-item" style="padding:12px; border-bottom:1px solid var(--border-subtle);">
                      <div class="activity-icon ${log.action.includes('post') ? 'post' : 'default'}" style="font-size:1.2rem;">
                        ${log.action.includes('post') ? '📤' : log.action.includes('auth') ? '🔐' : '⚡'}
                      </div>
                      <div class="activity-text">
                        <div style="color:var(--text-primary); font-weight:500;">${log.details}</div>
                        <div class="text-xs text-muted" style="margin-top:2px;">${App.formatRelativeTime(log.created_at)}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `
        <div class="page-header"><h1 class="page-title">👤 My Profile</h1></div>
        <div class="page-content">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">Failed to load profile</div>
            <div class="empty-state-text">${error.message}</div>
            <button class="btn btn-primary mt-md" onclick="ProfilePage.render()">Retry</button>
          </div>
        </div>
      `;
    }
  }
};

window.ProfilePage = ProfilePage;
