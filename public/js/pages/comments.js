/* ================================================================
   Comments Page — Track & Reply to LinkedIn Comments
   ================================================================ */

const CommentsPage = {
  currentFilter: 'unreplied',
  syncing: false,

  async render() {
    const container = document.getElementById('page-container');

    try {
      const [commentsData, autoRules] = await Promise.all([
        App.api('/api/comments'),
        App.api('/api/comments/auto-rules').catch(() => ({ rules: [] })),
      ]);

      const { comments, stats } = commentsData;

      container.innerHTML = `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <h1 class="page-title">💬 Comment Manager</h1>
            <p class="page-subtitle">Track and respond to comments across your LinkedIn posts</p>
          </div>
          <button class="btn btn-primary" id="sync-comments-btn" onclick="CommentsPage.syncFromLinkedIn()" style="padding:10px 20px;">
            🔄 Sync from LinkedIn
          </button>
        </div>
        <div class="page-content">

          <!-- Stats -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-icon">💬</div>
              <div class="stat-card-value">${stats.total}</div>
              <div class="stat-card-label">Total Comments</div>
            </div>
            <div class="stat-card" style="border-color: rgba(251,191,36,0.3)">
              <div class="stat-card-icon">⏳</div>
              <div class="stat-card-value" style="color:var(--accent-amber)">${stats.unreplied}</div>
              <div class="stat-card-label">Needs Reply</div>
            </div>
            <div class="stat-card" style="border-color: rgba(52,211,153,0.3)">
              <div class="stat-card-icon">✅</div>
              <div class="stat-card-value" style="color:var(--accent-emerald)">${stats.replied}</div>
              <div class="stat-card-label">Replied</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">🤖</div>
              <div class="stat-card-value">${(autoRules.rules || []).length}</div>
              <div class="stat-card-label">Auto-Rules</div>
            </div>
          </div>

          <div class="grid-2" style="align-items:start">
            <!-- Comments List -->
            <div class="card" style="grid-column: 1">
              <div class="card-header">
                <h3 class="card-title">Recent Comments</h3>
                <div class="tabs" style="margin-bottom:0">
                  <button class="tab ${this.currentFilter === 'unreplied' ? 'active' : ''}" onclick="CommentsPage.setFilter('unreplied')">Needs Reply (${stats.unreplied})</button>
                  <button class="tab ${this.currentFilter === 'all' ? 'active' : ''}" onclick="CommentsPage.setFilter('all')">All (${stats.total})</button>
                  <button class="tab ${this.currentFilter === 'replied' ? 'active' : ''}" onclick="CommentsPage.setFilter('replied')">Replied (${stats.replied})</button>
                </div>
              </div>

              ${stats.total === 0 ? `
                <div class="empty-state">
                  <div class="empty-state-icon">💬</div>
                  <div class="empty-state-title">No comments yet</div>
                  <div class="empty-state-text">Comments from your LinkedIn posts will appear here once synced.<br>Click "Sync from LinkedIn" to pull the latest comments, or add a test comment manually.</div>
                  <div style="display:flex; gap:10px; margin-top:16px; justify-content:center; flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="CommentsPage.syncFromLinkedIn()">🔄 Sync from LinkedIn</button>
                    <button class="btn btn-secondary" onclick="CommentsPage.addTestComment()">Add Test Comment</button>
                  </div>
                </div>
              ` : `
                <div id="comments-list">
                  ${this.renderCommentsList(comments)}
                </div>
              `}
            </div>

            <!-- Auto-Response Rules Panel -->
            <div>
              <div class="card mb-md">
                <div class="card-header">
                  <h3 class="card-title">🤖 Auto-Response Rules</h3>
                  <button class="btn btn-sm btn-primary" onclick="CommentsPage.addAutoRule()">+ Add Rule</button>
                </div>
                <p class="text-sm text-muted mb-md">Auto-suggest replies based on comment content.</p>
                ${(autoRules.rules || []).length === 0 ? `
                  <div class="empty-state" style="padding:20px">
                    <div class="empty-state-icon">🤖</div>
                    <div class="empty-state-title">No rules yet</div>
                    <div class="empty-state-text">Create rules to get smart reply suggestions.</div>
                  </div>
                ` : `
                  <div style="display:flex;flex-direction:column;gap:10px">
                    ${(autoRules.rules || []).map(rule => `
                      <div class="auto-rule-card">
                        <div class="auto-rule-header">
                          <div>
                            <div class="auto-rule-name">${rule.is_active ? '✅' : '⏸️'} ${rule.name}</div>
                            <div class="text-xs text-muted">Trigger: ${rule.trigger_type}${rule.trigger_value ? ` → "${rule.trigger_value}"` : ''} · Used ${rule.usage_count}×</div>
                          </div>
                          <div class="flex gap-sm">
                            <button class="btn btn-ghost btn-sm" onclick="CommentsPage.toggleRule('${rule.id}', ${rule.is_active})">${rule.is_active ? '⏸' : '▶'}</button>
                            <button class="btn btn-ghost btn-sm" onclick="CommentsPage.deleteAutoRule('${rule.id}')" style="color:var(--accent-rose)">🗑️</button>
                          </div>
                        </div>
                        <div class="auto-rule-preview">"${App.truncate(rule.response_template, 80)}"</div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- Quick Reply Templates -->
              <div class="card">
                <div class="card-header">
                  <h3 class="card-title">⚡ Quick Replies</h3>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${[
                    { label: 'Thank You', text: 'Thank you so much for your kind words! 🙏 Really means a lot.' },
                    { label: 'Great Point', text: 'That\'s a great point! I completely agree with your perspective.' },
                    { label: 'Let\'s Connect', text: 'Thanks for engaging! Would love to connect and continue this conversation.' },
                    { label: 'Appreciate It', text: 'I really appreciate you taking the time to share your thoughts! 💙' },
                  ].map(qr => `
                    <button class="quick-reply-btn" onclick="CommentsPage.copyQuickReply('${qr.text.replace(/'/g, "\\'")}')">
                      <span>${qr.label}</span>
                      <span class="text-xs text-muted">${App.truncate(qr.text, 45)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

        </div>
      `;

    } catch (error) {
      document.getElementById('page-container').innerHTML = `
        <div class="page-header"><h1 class="page-title">💬 Comments</h1></div>
        <div class="page-content"><div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Failed to load comments</div><div class="empty-state-text">${error.message}</div><button class="btn btn-primary mt-md" onclick="CommentsPage.render()">Retry</button></div></div>
      `;
    }
  },

  renderCommentsList(comments) {
    const filtered = this.currentFilter === 'unreplied'
      ? comments.filter(c => !c.is_reply_sent)
      : this.currentFilter === 'replied'
      ? comments.filter(c => c.is_reply_sent)
      : comments;

    if (filtered.length === 0) {
      return `<div class="empty-state" style="padding:30px"><div class="empty-state-icon">✅</div><div class="empty-state-title">All caught up!</div><div class="empty-state-text">No ${this.currentFilter === 'unreplied' ? 'unreplied' : ''} comments.</div></div>`;
    }

    return `
      <div style="display:flex;flex-direction:column;gap:0">
        ${filtered.map((c, i) => `
          <div class="comment-item ${i < filtered.length - 1 ? 'comment-item-border' : ''}" id="comment-${c.id}">
            <div class="comment-author-avatar">${(c.author_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
            <div class="comment-body">
              <div class="comment-header">
                <strong class="comment-author-name">${c.author_name || 'Unknown'}</strong>
                ${c.author_headline ? `<span class="comment-author-headline">${App.truncate(c.author_headline, 40)}</span>` : ''}
                <span class="comment-time">${App.formatRelativeTime(c.created_at)}</span>
                ${c.is_reply_sent ? '<span class="badge badge-published" style="font-size:0.65rem">Replied</span>' : '<span class="badge badge-pending" style="font-size:0.65rem">Needs Reply</span>'}
              </div>
              <div class="comment-text">"${c.content}"</div>
              ${c.post_content ? `<div class="text-xs text-muted mt-sm">On: ${App.truncate(c.post_content, 50)}</div>` : ''}
              ${c.reply_content ? `<div class="comment-reply-preview">✉️ Your reply: "${App.truncate(c.reply_content, 60)}"</div>` : ''}
            </div>
            ${!c.is_reply_sent ? `
              <div class="comment-actions">
                <button class="btn btn-sm btn-primary" onclick="CommentsPage.replyToComment('${c.id}', '${(c.author_name || '').replace(/'/g, "\\'")}')">Reply</button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  },

  async setFilter(filter) {
    this.currentFilter = filter;
    // Re-render just the list section
    try {
      const data = await App.api('/api/comments');
      const listEl = document.getElementById('comments-list');
      if (listEl) {
        listEl.innerHTML = this.renderCommentsList(data.comments);
      }
      // Update tab active states correctly
      document.querySelectorAll('.tabs .tab').forEach(t => {
        t.classList.remove('active');
      });
      // Find and activate the correct tab
      const tabs = document.querySelectorAll('.tabs .tab');
      const filterMap = { 'unreplied': 0, 'all': 1, 'replied': 2 };
      const idx = filterMap[filter];
      if (tabs[idx]) tabs[idx].classList.add('active');
    } catch (e) {
      App.toast('Failed to refresh comments list', 'error');
    }
  },

  async syncFromLinkedIn() {
    if (this.syncing) return;
    this.syncing = true;
    const btn = document.getElementById('sync-comments-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Syncing...';
    }

    try {
      const result = await App.api('/api/analytics/refresh', { method: 'POST' });
      const newComments = result.commentStats?.total || 0;
      App.toast(`✅ Sync complete! ${newComments} total comments in your inbox.`, 'success', 5000);
      // Re-render to show new comments
      await this.render();
    } catch (error) {
      App.toast(`Sync failed: ${error.message}`, 'error');
    } finally {
      this.syncing = false;
    }
  },

  replyToComment(commentId, authorName) {
    const body = `
      <div class="form-group">
        <label class="form-label">Reply to <strong>${authorName}</strong></label>
        <textarea class="form-textarea" id="reply-content" placeholder="Write your thoughtful reply..." rows="5" style="min-height:120px"></textarea>
        <div class="flex justify-between mt-sm">
          <span class="text-xs text-muted" id="reply-char-count">0 characters</span>
          <div class="flex gap-sm">
            <button class="btn btn-ghost btn-sm" onclick="CommentsPage.pasteQuickReply()">Quick Replies ⚡</button>
          </div>
        </div>
      </div>
      <div id="quick-reply-dropdown" style="display:none;margin-bottom:12px">
        <div class="card" style="padding:12px">
          ${[
            'Thank you so much for your kind words! 🙏 Really means a lot.',
            'That\'s a great point! I completely agree with your perspective.',
            'Thanks for engaging! Would love to connect and continue this conversation.',
            'I really appreciate you taking the time to share your thoughts! 💙',
          ].map(t => `<div class="quick-reply-option" onclick="CommentsPage.selectQuickReply('${t.replace(/'/g, "\\'")}')">${t}</div>`).join('')}
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="CommentsPage.submitReply('${commentId}')">Send Reply ✉️</button>
    `;
    App.showModal(`Reply to Comment`, body, footer);

    // Add char counter
    setTimeout(() => {
      const textarea = document.getElementById('reply-content');
      if (textarea) {
        textarea.addEventListener('input', () => {
          const counter = document.getElementById('reply-char-count');
          if (counter) counter.textContent = `${textarea.value.length} characters`;
        });
        textarea.focus();
      }
    }, 100);
  },

  pasteQuickReply() {
    const dropdown = document.getElementById('quick-reply-dropdown');
    if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  },

  selectQuickReply(text) {
    const textarea = document.getElementById('reply-content');
    if (textarea) textarea.value = text;
    const dropdown = document.getElementById('quick-reply-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  },

  async submitReply(commentId) {
    const content = document.getElementById('reply-content')?.value?.trim();
    if (!content) { App.toast('Reply cannot be empty', 'error'); return; }

    try {
      await App.api(`/api/comments/${commentId}/reply`, {
        method: 'POST',
        body: { reply_content: content },
      });
      App.closeModal();
      App.toast('✅ Reply sent!', 'success');

      // Update the comment item in the DOM
      const commentEl = document.getElementById(`comment-${commentId}`);
      if (commentEl) {
        commentEl.style.opacity = '0.5';
        setTimeout(() => this.render(), 500);
      } else {
        this.render();
      }
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  copyQuickReply(text) {
    navigator.clipboard.writeText(text).catch(() => {});
    App.toast('Quick reply copied to clipboard!', 'info');
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
        <div class="text-xs text-muted mt-sm">Comma-separated. Leave empty for non-keyword triggers.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Auto-Response Template *</label>
        <textarea class="form-textarea" id="rule-response" placeholder="Thank you for your kind words! 🙏" rows="4"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="CommentsPage.submitAutoRule()">Create Rule</button>
    `;
    App.showModal('Create Auto-Response Rule', body, footer);
  },

  async submitAutoRule() {
    const name = document.getElementById('rule-name')?.value?.trim();
    const response_template = document.getElementById('rule-response')?.value?.trim();
    if (!name || !response_template) { App.toast('Name and response are required', 'error'); return; }

    try {
      await App.api('/api/comments/auto-rules', {
        method: 'POST',
        body: {
          name,
          trigger_type: document.getElementById('rule-trigger-type')?.value,
          trigger_value: document.getElementById('rule-trigger-value')?.value?.trim() || '',
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

  async toggleRule(id, isActive) {
    try {
      await App.api(`/api/comments/auto-rules/${id}`, {
        method: 'PUT',
        body: { is_active: !isActive },
      });
      App.toast(`Rule ${isActive ? 'paused' : 'activated'}`, 'success');
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

  addTestComment() {
    const body = `
      <p class="text-sm text-muted mb-md">Add a sample comment to test your reply workflow.</p>
      <div class="form-group">
        <label class="form-label">Author Name</label>
        <input type="text" class="form-input" id="tc-author" placeholder="Jane Doe" value="Sarah Chen">
      </div>
      <div class="form-group">
        <label class="form-label">Comment</label>
        <textarea class="form-textarea" id="tc-content" rows="3" placeholder="Great post!">This is incredibly insightful! Thank you for sharing. 🙌</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Post ID (optional)</label>
        <input type="text" class="form-input" id="tc-post-id" placeholder="Leave empty to use latest post">
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="CommentsPage.submitTestComment()">Add Comment</button>
    `;
    App.showModal('Add Test Comment', body, footer);
  },

  async submitTestComment() {
    const author_name = document.getElementById('tc-author')?.value?.trim() || 'Test User';
    const content = document.getElementById('tc-content')?.value?.trim();
    let post_id = document.getElementById('tc-post-id')?.value?.trim();

    if (!content) { App.toast('Comment text is required', 'error'); return; }

    // If no post ID, get the latest post
    if (!post_id) {
      try {
        const postsData = await App.api('/api/posts?limit=1');
        if (postsData.posts.length > 0) {
          post_id = postsData.posts[0].id;
        } else {
          App.toast('Create a post first before adding comments', 'warning');
          App.closeModal();
          return;
        }
      } catch (e) {
        App.toast('Failed to find a post', 'error');
        return;
      }
    }

    try {
      await App.api('/api/comments', {
        method: 'POST',
        body: { post_id, author_name, content },
      });
      App.closeModal();
      App.toast('Test comment added!', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },
};
