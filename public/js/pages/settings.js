/* ================================================================
   Settings Page — LinkedIn Auth, Preferences, Auto-Response Rules
   ================================================================ */

const SettingsPage = {
  async render() {
    const container = document.getElementById('page-container');

    let schedulerStatus = {};
    try {
      schedulerStatus = await App.api('/api/scheduler/status');
    } catch (e) { /* ignore */ }

    let autoRules = [];
    try {
      const rulesData = await App.api('/api/comments/auto-rules');
      autoRules = rulesData.rules || [];
    } catch (e) { /* ignore */ }

    const isConnected = App.isAuthenticated;
    const profile = App.authStatus?.profile;

    // Check if credentials configured
    let credentialsConfigured = false;
    try {
      const configured = await App.api('/api/auth/configured');
      credentialsConfigured = configured.configured;
    } catch (e) { /* ignore */ }

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">⚙️ Settings</h1>
        <p class="page-subtitle">Configure your LinkedIn connection and automation preferences</p>
      </div>
      <div class="page-content">
        <!-- LinkedIn Connection -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3 class="card-title">🔗 LinkedIn Account</h3>
            ${isConnected
              ? '<span class="badge badge-published">✅ Connected</span>'
              : credentialsConfigured
                ? '<span class="badge badge-queued">⚙️ Credentials Set</span>'
                : '<span class="badge badge-pending">Not Connected</span>'
            }
          </div>

          ${isConnected ? `
            <div class="flex items-center gap-md mb-md">
              <div class="sidebar-profile-avatar" style="width:56px; height:56px; font-size:1.2rem">
                ${profile?.picture ? `<img src="${profile.picture}" alt="${profile.name}">` : (profile?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?')}
              </div>
              <div>
                <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary)">${profile?.name || 'LinkedIn User'}</div>
                <div class="text-sm text-muted">${profile?.email || ''}</div>
                <div class="text-xs text-muted mt-sm">Token expires: ${App.authStatus?.tokenExpiry ? new Date(parseInt(App.authStatus.tokenExpiry)).toLocaleDateString() : 'Unknown'}</div>
              </div>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-danger btn-sm" onclick="SettingsPage.logout()">Disconnect Account</button>
              <button class="btn btn-ghost btn-sm" onclick="SettingsPage.reconnect()">Re-authorize</button>
            </div>
          ` : `
            <div class="settings-connect-section">
              <p class="text-sm text-muted mb-md">
                Connect your LinkedIn account using LinkedIn's official OAuth 2.0. 
                Your credentials are stored <strong style="color:var(--text-secondary)">locally on your machine</strong> only.
              </p>

              ${!credentialsConfigured ? `
                <div class="onboarding-info-box" style="margin-bottom:20px">
                  <div style="font-size:1.1rem">⚠️</div>
                  <div class="text-sm text-muted">
                    LinkedIn credentials not configured yet. You'll need a 
                    <a href="https://www.linkedin.com/developers/apps" target="_blank" style="color:var(--accent-primary-light)">free LinkedIn Developer App</a>
                    to get started.
                  </div>
                </div>
              ` : `
                <div class="onboarding-info-box" style="margin-bottom:20px;border-color:rgba(16,185,129,0.25);background:rgba(16,185,129,0.07)">
                  <div style="font-size:1.1rem">✅</div>
                  <div class="text-sm text-muted">
                    LinkedIn App credentials are configured. Click <strong style="color:var(--text-secondary)">Connect with LinkedIn</strong> to authorize access.
                  </div>
                </div>
              `}

              <div class="flex gap-sm" style="flex-wrap:wrap">
                <button class="btn-onboarding-linkedin" style="width:auto;padding:12px 24px;font-size:0.9rem" onclick="SettingsPage.connectLinkedIn()">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                  </svg>
                  ${credentialsConfigured ? 'Connect with LinkedIn' : 'Setup & Connect'}
                </button>
                <button class="btn btn-ghost" onclick="App.navigate('onboarding')">
                  ${credentialsConfigured ? '🔑 Change Credentials' : '📋 Setup Guide'}
                </button>
                <a href="https://www.linkedin.com/developers/" target="_blank" class="btn btn-ghost">📖 Developer Portal</a>
              </div>
            </div>
          `}
        </div>


        <!-- Scheduler Status -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3 class="card-title">📅 Scheduler</h3>
            <span class="badge ${schedulerStatus.isRunning ? 'badge-published' : 'badge-failed'}">
              ${schedulerStatus.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div class="text-sm text-muted">
            The scheduler automatically publishes queued posts at their scheduled time.
            It checks for due posts every minute.
          </div>
          <div class="mt-md text-xs text-muted">
            Next check: ${schedulerStatus.nextCheck || 'Unknown'}
          </div>
        </div>

        <!-- Auto-Response Rules -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3 class="card-title">🤖 Auto-Response Rules</h3>
            <button class="btn btn-sm btn-primary" onclick="SettingsPage.addAutoRule()">+ Add Rule</button>
          </div>
          <p class="text-sm text-muted mb-md">
            Set up automatic reply templates for comments on your posts.
          </p>

          ${autoRules.length === 0 ? `
            <div class="empty-state" style="padding:20px">
              <div class="empty-state-icon">🤖</div>
              <div class="empty-state-title">No auto-response rules</div>
              <div class="empty-state-text">Create rules to suggest quick replies to common comment types.</div>
            </div>
          ` : `
            <div class="activity-list">
              ${autoRules.map(rule => `
                <div class="activity-item">
                  <div class="activity-icon ${rule.is_active ? 'auth' : 'error'}">
                    ${rule.is_active ? '✅' : '⏸️'}
                  </div>
                  <div class="activity-text">
                    <strong>${rule.name}</strong>
                    <div class="text-xs text-muted">
                      Trigger: ${rule.trigger_type} ${rule.trigger_value ? `(${rule.trigger_value})` : ''} · Used ${rule.usage_count}x
                    </div>
                    <div class="text-xs mt-sm" style="color:var(--text-secondary)">
                      Response: "${App.truncate(rule.response_template, 80)}"
                    </div>
                  </div>
                  <button class="btn btn-ghost btn-sm" onclick="SettingsPage.deleteAutoRule('${rule.id}')" style="color:var(--accent-rose)">🗑️</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- About -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">ℹ️ About</h3>
          </div>
          <div class="text-sm text-muted">
            <p><strong>LinkedIn Automation Manager</strong> v1.0.0</p>
            <p class="mt-sm">A self-hosted LinkedIn automation dashboard for scheduling posts, managing connections, tracking analytics, and streamlining your LinkedIn presence.</p>
            <p class="mt-sm">Built with Node.js, Express, SQLite, and the official LinkedIn REST API.</p>
          </div>
        </div>
      </div>
    `;
  },

  async connectLinkedIn() {
    try {
      // Check if credentials are configured first
      const configured = await App.api('/api/auth/configured');
      if (!configured.configured) {
        // Route to onboarding to enter credentials
        App.navigate('onboarding');
        return;
      }
      const data = await App.api('/api/auth/login');
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      if (error.message?.includes('needsSetup') || error.message?.includes('not configured')) {
        App.navigate('onboarding');
      } else {
        App.toast(`Failed: ${error.message}`, 'error');
      }
    }
  },

  async reconnect() {
    try {
      const data = await App.api('/api/auth/login');
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async logout() {
    if (!await App.confirm('Disconnect your LinkedIn account? You can reconnect later.')) return;
    try {
      await App.api('/api/auth/logout', { method: 'POST' });
      App.authStatus = { authenticated: false, profile: null };
      App.updateProfileUI(App.authStatus);
      App.toast('Account disconnected', 'info');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  addAutoRule() {
    const body = `
      <div class="form-group">
        <label class="form-label">Rule Name *</label>
        <input type="text" class="form-input" id="rule-name" placeholder="e.g. Thank You Reply">
      </div>
      <div class="form-group">
        <label class="form-label">Trigger Type</label>
        <select class="form-select" id="rule-trigger-type">
          <option value="keyword">Keyword Match</option>
          <option value="all_comments">All Comments</option>
          <option value="first_comment">First Comment Only</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Trigger Keyword(s)</label>
        <input type="text" class="form-input" id="rule-trigger-value" placeholder="e.g. great, awesome, congrats">
        <div class="text-xs text-muted mt-sm">Comma-separated keywords. Leave empty for non-keyword triggers.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Response Template *</label>
        <textarea class="form-textarea" id="rule-response" placeholder="Thank you for your kind words! 🙏" rows="4"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SettingsPage.submitAutoRule()">Create Rule</button>
    `;
    App.showModal('Create Auto-Response Rule', body, footer);
  },

  async submitAutoRule() {
    const name = document.getElementById('rule-name').value.trim();
    const response_template = document.getElementById('rule-response').value.trim();
    if (!name || !response_template) { App.toast('Name and response are required', 'error'); return; }

    try {
      await App.api('/api/comments/auto-rules', {
        method: 'POST',
        body: {
          name,
          trigger_type: document.getElementById('rule-trigger-type').value,
          trigger_value: document.getElementById('rule-trigger-value').value.trim(),
          response_template,
        },
      });
      App.closeModal();
      App.toast('Auto-response rule created!', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async deleteAutoRule(id) {
    if (!await App.confirm('Delete this auto-response rule?')) return;
    try {
      await App.api(`/api/comments/auto-rules/${id}`, { method: 'DELETE' });
      App.toast('Rule deleted', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },
};
