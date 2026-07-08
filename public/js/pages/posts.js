/* ================================================================
   Posts Page — Full Post Queue & Management
   ================================================================ */

const PostsPage = {
  currentFilter: 'all',
  currentPage: 1,
  pageSize: 15,

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">📋 Post Queue</h1>
        <p class="page-subtitle">Manage all your scheduled, draft, and published posts</p>
      </div>
      <div class="page-content">
        <div class="flex justify-between items-center mb-md" style="flex-wrap:wrap;gap:12px">
          <div class="tabs" style="margin-bottom:0">
            <button class="tab active" id="filter-all" onclick="PostsPage.setFilter('all')">All</button>
            <button class="tab" id="filter-draft" onclick="PostsPage.setFilter('draft')">📝 Drafts</button>
            <button class="tab" id="filter-queued" onclick="PostsPage.setFilter('queued')">📅 Scheduled</button>
            <button class="tab" id="filter-published" onclick="PostsPage.setFilter('published')">✅ Published</button>
            <button class="tab" id="filter-failed" onclick="PostsPage.setFilter('failed')">❌ Failed</button>
          </div>
          <div class="flex gap-sm">
            <input type="text" class="form-input" id="posts-search" placeholder="🔍 Search posts..." style="width:200px;font-size:0.82rem" oninput="PostsPage.handleSearch()">
            <button class="btn btn-primary btn-sm" onclick="App.navigate('composer')">+ New Post</button>
          </div>
        </div>

        <div id="posts-list-container">
          <div class="loading-overlay" style="padding:40px"><div class="spinner"></div></div>
        </div>
      </div>
    `;

    this.loadPosts();
  },

  async handleSearch() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadPosts(), 300);
  },

  setFilter(filter) {
    this.currentFilter = filter;
    this.currentPage = 1;
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`filter-${filter}`);
    if (tab) tab.classList.add('active');
    this.loadPosts();
  },

  async loadPosts() {
    const container = document.getElementById('posts-list-container');
    if (!container) return;

    const searchVal = document.getElementById('posts-search')?.value?.trim() || '';
    let url = `/api/posts?limit=${this.pageSize}&offset=${(this.currentPage - 1) * this.pageSize}`;
    if (this.currentFilter !== 'all') url += `&status=${this.currentFilter}`;
    if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;

    try {
      const data = await App.api(url);
      const posts = data.posts || [];
      const total = data.total || posts.length;

      if (posts.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">📋</div>
              <div class="empty-state-title">No posts found</div>
              <div class="empty-state-text">${searchVal ? 'Try a different search term.' : 'Create your first post to get started.'}</div>
              <button class="btn btn-primary mt-md" onclick="App.navigate('composer')">Create Post</button>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="card">
          <div style="display:flex;flex-direction:column;gap:0">
            ${posts.map((p, i) => `
              <div class="post-row ${i < posts.length - 1 ? 'post-row-border' : ''}" id="post-row-${p.id}">
                <div class="post-row-indicator ${p.status}"></div>
                <div class="post-row-content">
                  <div class="post-row-text">${App.truncate(p.content, 120)}</div>
                  <div class="post-row-meta">
                    ${App.getStatusBadge(p.status)}
                    ${p.post_type !== 'text' ? `<span class="badge badge-draft">${p.post_type}</span>` : ''}
                    ${p.scheduled_at ? `<span class="text-xs text-muted">📅 ${App.formatDateTime(p.scheduled_at)}</span>` : ''}
                    ${p.published_at ? `<span class="text-xs text-muted">✅ ${App.formatDateTime(p.published_at)}</span>` : ''}
                    ${!p.scheduled_at && !p.published_at ? `<span class="text-xs text-muted">${App.formatRelativeTime(p.created_at)}</span>` : ''}
                    ${p.tags && p.tags.length > 0 ? (Array.isArray(p.tags) ? p.tags : JSON.parse(p.tags || '[]')).slice(0, 3).map(tag => `<span class="text-xs" style="color:var(--accent-primary-light)">#${tag}</span>`).join('') : ''}
                  </div>
                  ${p.error_message ? `<div class="text-xs" style="color:var(--accent-rose);margin-top:4px">⚠️ ${App.truncate(p.error_message, 80)}</div>` : ''}
                </div>
                <div class="post-row-actions">
                  ${p.status === 'failed' || p.status === 'draft' ? `
                    <button class="btn btn-ghost btn-sm" onclick="PostsPage.editPost('${p.id}')" title="Edit">✏️</button>
                  ` : ''}
                  ${p.status === 'queued' ? `
                    <button class="btn btn-ghost btn-sm" onclick="PostsPage.editPost('${p.id}')" title="Edit schedule">📅</button>
                  ` : ''}
                  ${App.isAuthenticated && (p.status === 'draft' || p.status === 'failed') ? `
                    <button class="btn btn-ghost btn-sm" onclick="PostsPage.publishNow('${p.id}')" title="Publish now" style="color:var(--accent-emerald)">🚀</button>
                  ` : ''}
                  <button class="btn btn-ghost btn-sm" onclick="PostsPage.duplicatePost('${p.id}')" title="Duplicate">📋</button>
                  <button class="btn btn-ghost btn-sm" onclick="PostsPage.deletePost('${p.id}')" title="Delete" style="color:var(--accent-rose)">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        ${total > this.pageSize ? `
          <div class="flex justify-between items-center mt-md">
            <span class="text-sm text-muted">Showing ${(this.currentPage - 1) * this.pageSize + 1}–${Math.min(this.currentPage * this.pageSize, total)} of ${total} posts</span>
            <div class="flex gap-sm">
              <button class="btn btn-secondary btn-sm" onclick="PostsPage.prevPage()" ${this.currentPage === 1 ? 'disabled' : ''}>← Prev</button>
              <button class="btn btn-secondary btn-sm" onclick="PostsPage.nextPage()" ${this.currentPage * this.pageSize >= total ? 'disabled' : ''}>Next →</button>
            </div>
          </div>
        ` : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Failed to load posts</div><div class="empty-state-text">${err.message}</div></div>`;
    }
  },

  prevPage() {
    if (this.currentPage > 1) { this.currentPage--; this.loadPosts(); }
  },

  nextPage() {
    this.currentPage++;
    this.loadPosts();
  },

  editPost(id) {
    App.navigate('composer');
    setTimeout(async () => {
      try {
        await ComposerPage.editPost(id);
      } catch (e) { /* retry once */ }
    }, 200);
  },

  async publishNow(id) {
    if (!await App.confirm('Publish this post to LinkedIn right now?')) return;
    try {
      await App.api(`/api/posts/${id}/publish-now`, { method: 'POST' });
      App.toast('🎉 Published to LinkedIn!', 'success');
      this.loadPosts();
    } catch (err) {
      App.toast(`Publish failed: ${err.message}`, 'error');
    }
  },

  async duplicatePost(id) {
    try {
      const data = await App.api(`/api/posts/${id}`);
      const p = data.post;
      await App.api('/api/posts', {
        method: 'POST',
        body: {
          content: p.content,
          post_type: p.post_type,
          tags: p.tags ? JSON.parse(p.tags) : [],
          status: 'draft',
        },
      });
      App.toast('Post duplicated as draft!', 'success');
      this.loadPosts();
    } catch (err) {
      App.toast(`Failed: ${err.message}`, 'error');
    }
  },

  async deletePost(id) {
    if (!await App.confirm('Delete this post permanently?')) return;
    try {
      // Animate removal
      const row = document.getElementById(`post-row-${id}`);
      if (row) {
        row.style.transition = 'all 0.3s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(30px)';
        await new Promise(r => setTimeout(r, 300));
      }
      await App.api(`/api/posts/${id}`, { method: 'DELETE' });
      App.toast('Post deleted', 'success');
      this.loadPosts();
    } catch (err) {
      App.toast(`Failed: ${err.message}`, 'error');
    }
  },
};
