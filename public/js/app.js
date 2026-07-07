/* ================================================================
   App.js — Main Application Controller
   SPA Router, API Client, State Management, Notifications
   ================================================================ */

const App = {
  currentPage: 'dashboard',
  authStatus: null,

  // --- Initialization ---
  async init() {
    // Check for auth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_success')) {
      this.toast('\uD83C\uDF89 Successfully connected to LinkedIn!', 'success', 6000);
      window.history.replaceState({}, '', '/');
    }
    if (params.get('auth_error')) {
      this.toast(`Auth error: ${params.get('auth_error')}`, 'error', 8000);
      window.history.replaceState({}, '', '/');
    }

    // Check auth status
    await this.checkAuth();

    // If not authenticated, redirect to /connect
    if (!this.authStatus?.authenticated) {
      window.location.href = '/connect';
      return;
    }

    // Navigate to initial page
    this.navigate('dashboard');

    // Refresh auth status periodically
    setInterval(() => this.checkAuth(), 60000);
  },

  // --- Auth ---
  async checkAuth() {
    try {
      const data = await this.api('/api/auth/status');
      this.authStatus = data;
      this.updateProfileUI(data);
    } catch (e) {
      console.error('Auth check failed:', e);
    }
  },

  updateProfileUI(data) {
    const avatar = document.getElementById('profile-avatar');
    const name = document.getElementById('profile-name');
    const status = document.getElementById('profile-status');

    if (avatar && name && status) {
      if (data.authenticated && data.profile) {
        const initials = (data.profile.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        if (data.profile.picture) {
          avatar.innerHTML = `<img src="${data.profile.picture}" alt="${data.profile.name}">`;
        } else {
          avatar.textContent = initials;
        }
        name.textContent = data.profile.name || 'LinkedIn User';
        status.innerHTML = '<span class="status-dot"></span><span>Connected</span>';
      } else {
        avatar.textContent = '?';
        name.textContent = 'Not Connected';
        status.innerHTML = '<span class="status-dot" style="background: var(--accent-amber)"></span><span>Setup Required</span>';
      }
    }
  },

  get isAuthenticated() {
    return this.authStatus?.authenticated === true;
  },

  // --- Navigation ---
  navigate(page) {
    this.currentPage = page;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update page title
    document.title = `Algo Colleague — ${page.charAt(0).toUpperCase() + page.slice(1)}`;

    // Render page
    const container = document.getElementById('page-container');
    container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

    // Small delay for smooth transition feel
    requestAnimationFrame(() => {
      this.renderPage(page);
    });
  },

  renderPage(page) {
    const pages = {
      dashboard: DashboardPage,
      composer: ComposerPage,
      posts: PostsPage,
      calendar: CalendarPage,
      analytics: AnalyticsPage,
      connections: ConnectionsPage,
      templates: TemplatesPage,
      settings: SettingsPage,
      comments: CommentsPage,
      onboarding: OnboardingPage,
      profile: window.ProfilePage || { render: () => {
        document.getElementById('page-container').innerHTML = `
          <div class="page-header"><h1 class="page-title">👤 My Profile</h1></div>
          <div class="page-content"><div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-title">Loading profile...</div></div></div>
        `;
        if (!document.querySelector('script[src="/js/pages/profile.js"]')) {
          const script = document.createElement('script');
          script.src = '/js/pages/profile.js';
          script.onload = () => window.ProfilePage && window.ProfilePage.render();
          document.body.appendChild(script);
        } else if (window.ProfilePage) {
          window.ProfilePage.render();
        }
      }},
    };

    const PageModule = pages[page];
    if (PageModule && PageModule.render) {
      PageModule.render();
    } else {
      document.getElementById('page-container').innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Page Not Found</h1>
        </div>
        <div class="page-content">
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">Page "${page}" not found</div>
          </div>
        </div>
      `;
    }
  },

  // --- API Client ---
  async api(url, options = {}) {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };

    if (window.Clerk && window.Clerk.session) {
      const token = await window.Clerk.session.getToken();
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || 'API request failed');
    }

    return response.json();
  },

  // --- Toast Notifications ---
  toast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML = `
      <span>${icons[type] || 'ℹ️'}</span>
      <span style="flex:1">${message}</span>
      <button onclick="this.parentElement.classList.add('toast-out'); setTimeout(() => this.parentElement.remove(), 300)" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:1rem;">×</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  },

  // --- Utility Functions ---
  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  },

  formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return this.formatDate(dateStr);
  },

  truncate(text, len = 100) {
    if (!text || text.length <= len) return text || '';
    return text.substring(0, len) + '...';
  },

  getStatusBadge(status) {
    return `<span class="badge badge-${status}">${status}</span>`;
  },

  // --- Modal ---
  showModal(title, bodyHtml, footerHtml = '') {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  },

  closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
  },

  // --- Confirm Dialog ---
  confirm(message) {
    return new Promise((resolve) => {
      const footer = `
        <button class="btn btn-secondary" onclick="App.closeModal(); window._confirmResolve(false)">Cancel</button>
        <button class="btn btn-primary" onclick="App.closeModal(); window._confirmResolve(true)">Confirm</button>
      `;
      window._confirmResolve = resolve;
      this.showModal('Confirm', `<p style="color: var(--text-secondary)">${message}</p>`, footer);
    });
  },
};

// End of app.js
