/* ================================================================
   Onboarding / Welcome Page
   Shows when the app is not connected to LinkedIn
   ================================================================ */

const OnboardingPage = {
  step: 1, // 1=welcome, 2=credentials, 3=connecting

  async render() {
    const container = document.getElementById('page-container');
    const isConfigured = await this.checkConfigured();

    if (isConfigured) {
      // Credentials are set — go straight to OAuth
      this.renderConnectStep(container);
    } else {
      // Need to enter credentials first
      this.renderWelcomeStep(container);
    }
  },

  async checkConfigured() {
    try {
      const data = await App.api('/api/auth/configured');
      return data.configured;
    } catch (e) {
      return false;
    }
  },

  renderWelcomeStep(container) {
    container.innerHTML = `
      <div class="onboarding-overlay">
        <div class="onboarding-card">
          <!-- Logo / Brand -->
          <div class="onboarding-logo">
            <div class="onboarding-logo-ring">
              <div class="onboarding-logo-icon" style="background:none;font-size:0">
                <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="44" height="44">
                  <rect width="36" height="36" rx="10" fill="url(#obg)"/>
                  <path d="M9 26V10h3.5v13h8V26H9z" fill="white" opacity="0.95"/>
                  <path d="M23 10h3.5v7.5l3-7.5h4L30 17.5l3.5 8.5H29.5l-3-6V26H23V10z" fill="white" opacity="0.95"/>
                  <defs><linearGradient id="obg" x1="0" y1="0" x2="36" y2="36"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
                </svg>
              </div>
            </div>
          </div>

          <h1 class="onboarding-title">Welcome to Algo Colleague</h1>
          <p class="onboarding-subtitle">Your all-in-one LinkedIn automation suite for scheduling posts, managing connections, and tracking analytics.</p>

          <!-- Feature pills -->
          <div class="onboarding-features">
            <div class="onboarding-feature-pill">📅 Scheduled Posting</div>
            <div class="onboarding-feature-pill">📊 Analytics</div>
            <div class="onboarding-feature-pill">🤖 AI Content</div>
            <div class="onboarding-feature-pill">🤝 Connections</div>
            <div class="onboarding-feature-pill">💬 Comments</div>
          </div>

          <!-- How it works note -->
          <div class="onboarding-info-box">
            <div class="onboarding-info-icon">ℹ️</div>
            <div>
              <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;font-size:0.88rem">How the connection works</div>
              <div class="text-sm text-muted" style="line-height:1.6">
                This app uses <strong style="color:var(--text-secondary)">LinkedIn's official OAuth 2.0</strong> to securely connect your account. You'll need a free LinkedIn Developer App (takes ~2 minutes to create). Your credentials are stored locally on your machine — never on any external server.
              </div>
            </div>
          </div>

          <!-- Primary CTA -->
          <button class="btn-onboarding-primary" onclick="OnboardingPage.renderCredentialsStep(document.getElementById('page-container'))">
            <span class="btn-onboarding-primary-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
            </span>
            Connect with LinkedIn
          </button>

          <!-- Alternative: already have credentials -->
          <div class="onboarding-divider">
            <span>already have credentials?</span>
          </div>

          <button class="btn-onboarding-secondary" onclick="OnboardingPage.renderCredentialsStep(document.getElementById('page-container'), true)">
            Enter API Credentials
          </button>

          <p class="onboarding-footer-note">
            <a href="https://www.linkedin.com/developers/" target="_blank" style="color:var(--accent-primary-light);text-decoration:none">Create a free LinkedIn Developer App →</a>
          </p>
        </div>
      </div>
    `;
  },

  renderCredentialsStep(container, skipIntro = false) {
    container.innerHTML = `
      <div class="onboarding-overlay">
        <div class="onboarding-card" style="max-width:520px">
          <button class="onboarding-back-btn" onclick="OnboardingPage.renderWelcomeStep(document.getElementById('page-container'))">
            ← Back
          </button>

          <div class="onboarding-step-badge">Step 1 of 2</div>
          <h2 class="onboarding-title" style="font-size:1.6rem;margin-top:12px">Enter your LinkedIn App credentials</h2>
          <p class="onboarding-subtitle" style="margin-top:8px">Takes less than 2 minutes. Your credentials are stored locally.</p>

          <!-- Guide steps -->
          <div class="credentials-guide">
            <div class="credentials-guide-step">
              <div class="credentials-guide-num">1</div>
              <div>Go to <a href="https://www.linkedin.com/developers/apps" target="_blank" style="color:var(--accent-primary-light)">linkedin.com/developers/apps</a> → <strong>Create App</strong></div>
            </div>
            <div class="credentials-guide-step">
              <div class="credentials-guide-num">2</div>
              <div>Under <strong>Products</strong> tab → Request access to <strong>"Share on LinkedIn"</strong></div>
            </div>
            <div class="credentials-guide-step">
              <div class="credentials-guide-num">3</div>
              <div>In <strong>Auth</strong> tab → Add redirect URL: <code class="inline-code" id="onboarding-redirect-url">loading...</code></div>
              <script>
                (function() {
                  var el = document.getElementById('onboarding-redirect-url');
                  if (el) el.textContent = window.location.origin + '/api/auth/callback';
                })();
              </script>
            </div>
            <div class="credentials-guide-step">
              <div class="credentials-guide-num">4</div>
              <div>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> below</div>
            </div>
          </div>

          <!-- Credentials form -->
          <div class="form-group" style="margin-top:20px">
            <label class="form-label">LinkedIn Client ID</label>
            <input type="text" class="form-input" id="cred-client-id" placeholder="86xxxxxxxxxxxxxxxx" autocomplete="off" spellcheck="false">
          </div>
          <div class="form-group">
            <label class="form-label">LinkedIn Client Secret</label>
            <div style="position:relative">
              <input type="password" class="form-input" id="cred-client-secret" placeholder="••••••••••••••••" autocomplete="new-password" style="padding-right:44px">
              <button onclick="OnboardingPage.toggleSecretVisibility()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem" title="Show/hide">👁</button>
            </div>
          </div>

          <div class="onboarding-info-box" style="margin-top:4px;margin-bottom:20px">
            <div style="font-size:1rem">🔒</div>
            <div class="text-xs text-muted">Your credentials are saved to your local <code>.env</code> file only. They are never transmitted to any external server.</div>
          </div>

          <button class="btn-onboarding-primary" onclick="OnboardingPage.saveCredentials()" id="save-creds-btn">
            Save & Continue →
          </button>
        </div>
      </div>
    `;

    // Load existing credentials if any
    setTimeout(async () => {
      try {
        const data = await App.api('/api/auth/credentials');
        if (data.clientId && data.clientId !== 'your_client_id_here') {
          const idEl = document.getElementById('cred-client-id');
          if (idEl) idEl.value = data.clientId;
        }
      } catch (e) { /* ignore */ }
    }, 100);
  },

  toggleSecretVisibility() {
    const input = document.getElementById('cred-client-secret');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  },

  async saveCredentials() {
    const clientId = document.getElementById('cred-client-id')?.value?.trim();
    const clientSecret = document.getElementById('cred-client-secret')?.value?.trim();

    if (!clientId || !clientSecret) {
      App.toast('Please enter both Client ID and Client Secret', 'error');
      return;
    }

    const btn = document.getElementById('save-creds-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      await App.api('/api/auth/credentials', {
        method: 'POST',
        body: { clientId, clientSecret },
      });
      App.toast('Credentials saved!', 'success');
      // Proceed to connect step
      this.renderConnectStep(document.getElementById('page-container'));
    } catch (error) {
      App.toast(`Failed to save: ${error.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Save & Continue →'; }
    }
  },

  renderConnectStep(container) {
    container.innerHTML = `
      <div class="onboarding-overlay">
        <div class="onboarding-card">
          <button class="onboarding-back-btn" onclick="OnboardingPage.renderCredentialsStep(document.getElementById('page-container'))">
            ← Change Credentials
          </button>

          <div class="onboarding-step-badge">Step 2 of 2</div>

          <div class="onboarding-connect-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--accent-primary-light)">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
            </svg>
          </div>

          <h2 class="onboarding-title" style="font-size:1.6rem;margin-top:16px">Authorize LinkedIn Access</h2>
          <p class="onboarding-subtitle" style="margin-top:8px">
            Click the button below to open LinkedIn's official authorization page in your browser. 
            After you approve the permissions, you'll be redirected back here automatically.
          </p>

          <!-- Permissions list -->
          <div class="permissions-list">
            <div class="permission-item">
              <div class="permission-check">✓</div>
              <div>
                <div class="permission-name">Post on your behalf</div>
                <div class="permission-desc">Schedule and publish content to your LinkedIn profile</div>
              </div>
            </div>
            <div class="permission-item">
              <div class="permission-check">✓</div>
              <div>
                <div class="permission-name">Read your profile</div>
                <div class="permission-desc">Display your name and profile photo in the dashboard</div>
              </div>
            </div>
            <div class="permission-item">
              <div class="permission-check">✓</div>
              <div>
                <div class="permission-name">Read analytics</div>
                <div class="permission-desc">Track post engagement and performance metrics</div>
              </div>
            </div>
          </div>

          <!-- Big LinkedIn OAuth Button -->
          <button class="btn-onboarding-linkedin" onclick="OnboardingPage.startOAuth()" id="oauth-btn">
            <span class="btn-onboarding-primary-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
            </span>
            Continue with LinkedIn
          </button>

          <p class="onboarding-footer-note">
            You can disconnect your account at any time from Settings.
          </p>
        </div>
      </div>
    `;
  },

  async startOAuth() {
    const btn = document.getElementById('oauth-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block">⏳</span> Opening LinkedIn...'; }

    try {
      const data = await App.api('/api/auth/login');
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Continue with LinkedIn'; }
    }
  },
};
