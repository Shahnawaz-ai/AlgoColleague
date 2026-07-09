/* ================================================================
   Composer Page — Post Editor with AI Assist, Auto-Save & Preview
   ================================================================ */

const ComposerPage = {
  currentPostId: null,
  autoSaveTimer: null,
  DRAFT_KEY: 'li_manager_composer_draft',

  async render() {
    const container = document.getElementById('page-container');

    // Load templates for the selector
    let templates = [];
    try {
      const tdata = await App.api('/api/templates');
      templates = tdata.templates || [];
    } catch (e) { /* ignore */ }

    // Restore draft from localStorage
    const savedDraft = this.loadDraft();

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">✍️ Compose Post</h1>
        <p class="page-subtitle">Create, schedule, and preview your LinkedIn content</p>
      </div>
      <div class="page-content">
        <div class="grid-2" style="align-items:start">
          <!-- Editor -->
          <div>
            <div class="card mb-md">
              <div class="card-header">
                <h3 class="card-title">Content Editor</h3>
                <div class="flex gap-sm items-center">
                  <span id="autosave-indicator" class="text-xs text-muted" style="opacity:0;transition:opacity 0.5s">Saved</span>
                  <select class="form-select" id="template-selector" onchange="ComposerPage.loadTemplate(this.value)" style="width:auto; min-width:160px; padding:6px 30px 6px 10px; font-size:0.78rem">
                    <option value="">Use Template...</option>
                    ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                  </select>
                </div>
              </div>

              <!-- AI Assistant Banner -->
              <div class="ai-assist-bar" id="ai-assist-bar">
                <div class="ai-assist-icon">🤖</div>
                <div style="flex:1">
                  <input type="text" class="form-input" id="ai-topic" placeholder="Describe what you want to write about... e.g. 'lessons from failing my startup'" style="margin:0; font-size:0.85rem">
                </div>
                <div class="flex gap-sm">
                  <select class="form-select" id="ai-tone" style="width:auto; padding:6px 28px 6px 8px; font-size:0.78rem">
                    <option value="professional">Professional</option>
                    <option value="conversational">Conversational</option>
                    <option value="inspirational">Inspirational</option>
                    <option value="storytelling">Storytelling</option>
                    <option value="bold">Bold & Direct</option>
                  </select>
                  <button class="btn btn-primary btn-sm" onclick="ComposerPage.generateWithAI()" id="ai-generate-btn">
                    ✨ Generate
                  </button>
                </div>
              </div>

              <div class="form-group" style="margin-top:0">
                <textarea class="form-textarea" id="post-content" placeholder="What do you want to share with your network?" rows="10" oninput="ComposerPage.onContentInput()"
                  style="min-height: 220px; font-size: 0.9rem; line-height: 1.7">${savedDraft?.content || ''}</textarea>
                <div class="flex justify-between items-center mt-sm">
                  <div id="char-counter" class="char-counter">0 / 3,000 characters</div>
                  <div class="flex gap-sm">
                    <button class="btn btn-ghost btn-sm" onclick="ComposerPage.insertEmoji()" title="Add emoji">😊</button>
                    <button class="btn btn-ghost btn-sm" onclick="ComposerPage.suggestHashtags()" title="Suggest hashtags">#</button>
                    <button class="btn btn-ghost btn-sm" onclick="ComposerPage.clearDraft()" title="Clear draft" style="color:var(--accent-rose)">🗑️</button>
                  </div>
                </div>
              </div>

              <!-- Hashtag suggestions -->
              <div id="hashtag-suggestions" style="display:none" class="hashtag-suggestions"></div>

              <div class="grid-2" style="gap:12px">
                <div class="form-group">
                  <label class="form-label">Post Type</label>
                  <select class="form-select" id="post-type" onchange="ComposerPage.updatePreview()">
                    <option value="text">📝 Text Only</option>
                    <option value="image">🖼️ With Image</option>
                    <option value="article">📰 Article Link</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Tags (comma separated)</label>
                  <input type="text" class="form-input" id="post-tags" placeholder="e.g. leadership, tech, growth" value="${savedDraft?.tags || ''}">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Schedule Date & Time</label>
                <input type="datetime-local" class="form-input" id="post-schedule" value="${savedDraft?.scheduledAt || ''}">
                <div class="text-xs text-muted mt-sm">Leave empty to save as draft. Set a time to auto-queue for publishing.</div>
              </div>

              <!-- Best time suggestions -->
              <div id="best-time-hint" class="best-time-hint" style="display:none">
                <span class="best-time-hint-icon">💡</span>
                <span>Best posting times: <strong>Tue–Thu, 8–10am & 12–1pm</strong> — based on your analytics</span>
              </div>

              <div class="flex gap-sm mt-md" style="flex-wrap:wrap">
                <button class="btn btn-primary btn-lg" onclick="ComposerPage.savePost('queued')">
                  📅 Schedule Post
                </button>
                <button class="btn btn-secondary" onclick="ComposerPage.savePost('draft')">
                  💾 Save as Draft
                </button>
                ${App.isAuthenticated ? `
                  <button class="btn btn-success" onclick="ComposerPage.publishNow()">
                    🚀 Publish Now
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Preview & Recent Posts -->
          <div>
            <!-- Live Preview -->
            <div class="card mb-md">
              <div class="card-header">
                <h3 class="card-title">Live Preview</h3>
                <span class="text-xs text-muted badge badge-draft" id="preview-type-badge">Text</span>
              </div>
              <div class="post-preview" id="post-preview">
                <div class="post-preview-header">
                  <div class="post-preview-avatar" id="preview-avatar">
                    ${App.authStatus?.profile?.name ? App.authStatus.profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'}
                  </div>
                  <div>
                    <div class="post-preview-name">${App.authStatus?.profile?.name || 'Your Name'}</div>
                    <div class="post-preview-meta">Now · 🌐</div>
                  </div>
                </div>
                <div class="post-preview-content" id="preview-content">
                  <span class="text-muted">Start typing to see a preview of your post...</span>
                </div>
                <div class="post-preview-actions">
                  <span class="post-preview-action">👍 Like</span>
                  <span class="post-preview-action">💬 Comment</span>
                  <span class="post-preview-action">🔁 Repost</span>
                  <span class="post-preview-action">📤 Send</span>
                </div>
              </div>
            </div>

            <!-- Recent Posts -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Recent Posts</h3>
                <a class="btn btn-ghost btn-sm" onclick="App.navigate('posts')">View All →</a>
              </div>
              <div id="recent-posts-list">
                <div class="loading-overlay" style="padding:20px"><div class="spinner"></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Init
    this.updateCharCount();
    this.updatePreview();
    this.loadRecentPosts();

    // Show best time hint when schedule field is focused
    const scheduleInput = document.getElementById('post-schedule');
    scheduleInput?.addEventListener('focus', () => {
      document.getElementById('best-time-hint').style.display = 'flex';
    });
  },

  onContentInput() {
    this.updatePreview();
    this.updateCharCount();
    this.scheduleDraftSave();
  },

  scheduleDraftSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.saveDraft();
      const indicator = document.getElementById('autosave-indicator');
      if (indicator) {
        indicator.textContent = '✓ Draft saved';
        indicator.style.opacity = '1';
        setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
      }
    }, 1500);
  },

  saveDraft() {
    const content = document.getElementById('post-content')?.value || '';
    const tags = document.getElementById('post-tags')?.value || '';
    const scheduledAt = document.getElementById('post-schedule')?.value || '';
    if (!content.trim()) return;
    localStorage.setItem(this.DRAFT_KEY, JSON.stringify({ content, tags, scheduledAt, savedAt: new Date().toISOString() }));
  },

  loadDraft() {
    try {
      const raw = localStorage.getItem(this.DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  clearDraft() {
    localStorage.removeItem(this.DRAFT_KEY);
    const contentEl = document.getElementById('post-content');
    const tagsEl = document.getElementById('post-tags');
    const scheduleEl = document.getElementById('post-schedule');
    if (contentEl) contentEl.value = '';
    if (tagsEl) tagsEl.value = '';
    if (scheduleEl) scheduleEl.value = '';
    this.updatePreview();
    this.updateCharCount();
    App.toast('Draft cleared', 'info');
  },

  updatePreview() {
    const content = document.getElementById('post-content')?.value || '';
    const preview = document.getElementById('preview-content');
    const typeBadge = document.getElementById('preview-type-badge');
    const postType = document.getElementById('post-type')?.value || 'text';
    
    if (typeBadge) {
      const typeLabels = { text: 'Text', image: '🖼 Image', article: '📰 Article' };
      typeBadge.textContent = typeLabels[postType] || 'Text';
    }

    if (!preview) return;
    if (content.trim()) {
      // Format content with newlines and hashtag highlighting
      const formatted = content
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
        .replace(/(#\w+)/g, '<span style="color:var(--accent-primary-light)">$1</span>');
      preview.innerHTML = formatted;
    } else {
      preview.innerHTML = '<span class="text-muted">Start typing to see a preview of your post...</span>';
    }
  },

  updateCharCount() {
    const content = document.getElementById('post-content')?.value || '';
    const counter = document.getElementById('char-counter');
    if (!counter) return;
    const len = content.length;
    counter.textContent = `${len.toLocaleString()} / 3,000 characters`;
    counter.className = 'char-counter' + (len > 2800 ? ' warn' : '') + (len > 3000 ? ' over' : '');
  },

  async generateWithAI() {
    const topic = document.getElementById('ai-topic')?.value?.trim();
    if (!topic) {
      App.toast('Please describe what you want to write about', 'warning');
      return;
    }

    const tone = document.getElementById('ai-tone')?.value || 'professional';
    const btn = document.getElementById('ai-generate-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    try {
      // Use client-side AI generation (template-based approach with varied structures)
      const post = this.generatePostLocally(topic, tone);
      const textarea = document.getElementById('post-content');
      if (textarea) {
        textarea.value = post;
        this.updatePreview();
        this.updateCharCount();
        this.scheduleDraftSave();
        App.toast('✨ Post generated! Edit to personalize it.', 'success');
      }
    } catch (error) {
      App.toast('Generation failed: ' + error.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ Generate'; }
    }
  },

  generatePostLocally(topic, tone) {
    const templates = {
      professional: [
        `After working with ${topic} for some time, here are the key insights I've gathered:\n\n1. It requires more strategic thinking than most expect\n2. The fundamentals matter more than the tools\n3. Consistency beats intensity every time\n4. Building systems creates compounding results\n5. Feedback loops accelerate progress significantly\n\nWhat's been your experience with ${topic}?\n\n#${topic.split(' ')[0]} #ProfessionalDevelopment #LinkedIn`,
        `The real challenge with ${topic} isn't what most people think.\n\nEveryone focuses on the technical aspects.\nFew talk about the human element.\n\nAfter spending significant time in this space, I've learned:\n\n→ Trust is your most valuable asset\n→ Communication prevents most failures\n→ Patience is a competitive advantage\n\nThe best practitioners of ${topic} I know share one trait:\nThey put people before process.\n\nWhat do you think is the most underrated aspect of ${topic}?\n\n#Leadership #${topic.split(' ').join('')}`,
      ],
      conversational: [
        `Real talk about ${topic}...\n\nWhen I first started, I had no idea what I was doing.\n\nI made mistakes. Big ones.\n\nBut looking back, those failures taught me more than any success could.\n\nThe 3 things I wish someone had told me:\n\n✅ Start before you feel ready\n✅ Find mentors who've been there\n✅ Track everything from day one\n\nAnyone else feel like ${topic} is way more nuanced than it looks from the outside?\n\nDrop your thoughts below 👇\n\n#${topic.split(' ')[0]} #LessonsLearned`,
        `Hot take: Most people approach ${topic} completely wrong.\n\nHere's what I mean...\n\nThe conventional wisdom says to [do thing A].\nBut in practice, [thing B] works so much better.\n\nI learned this the hard way working on ${topic} for years.\n\nAm I the only one who sees this?\n\nLet me know your perspective in the comments 👇\n\n#${topic.split(' ')[0]} #HotTake #OpenDiscussion`,
      ],
      inspirational: [
        `${topic} changed my life. Not in the way I expected.\n\nI started with grand ambitions and unrealistic timelines.\n\nReality had other plans.\n\nBut through the setbacks, I discovered something powerful:\n\n"The obstacle is the way."\n\nEvery challenge with ${topic} made me stronger, more resilient, and more resourceful.\n\nIf you're struggling with ${topic} right now — keep going.\n\nThe breakthrough is often just one more attempt away.\n\n💪 Tag someone who needs to hear this.\n\n#Motivation #${topic.split(' ')[0]} #Growth #NeverGiveUp`,
      ],
      storytelling: [
        `Three years ago, I knew nothing about ${topic}.\n\nI was lost, overwhelmed, and questioning every decision.\n\nFast forward to today:\n\nI've built systems, learned from failure, and found my footing.\n\nHere's the moment everything clicked...\n\n[One Tuesday morning, I realized that the approach I had been taking was fundamentally flawed. Instead of trying to master everything at once, I needed to focus on just one thing at a time.]\n\nThat single insight changed everything about how I work with ${topic}.\n\nThe lesson: Simplicity scales. Complexity fails.\n\n♻️ Repost if this resonates with someone in your network.\n\n#Storytelling #${topic.split(' ')[0]} #GrowthJourney`,
      ],
      bold: [
        `Unpopular opinion about ${topic}:\n\nMost of what you've been taught is wrong.\n\nThe industry wants you to believe:\n❌ You need expensive tools\n❌ You need years of experience\n❌ You need a big team\n\nThe truth:\n✅ Resourcefulness beats resources\n✅ Action beats planning\n✅ Momentum beats perfection\n\n${topic} is simpler than the "experts" want you to believe.\n\nControversial? Yes.\nTrue? Absolutely.\n\nDisagree? Tell me why below. 👇\n\n#BoldTake #${topic.split(' ')[0]} #UnpopularOpinion`,
      ],
    };

    const toneTemplates = templates[tone] || templates.professional;
    const index = Math.floor(Math.random() * toneTemplates.length);
    return toneTemplates[index];
  },

  suggestHashtags() {
    const content = document.getElementById('post-content')?.value || '';
    const words = content.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const existing = (content.match(/#\w+/g) || []).map(h => h.toLowerCase());
    
    const popularHashtags = [
      'linkedin', 'leadership', 'growth', 'entrepreneur', 'startup', 'business',
      'technology', 'innovation', 'marketing', 'sales', 'productivity', 'success',
      'motivation', 'career', 'networking', 'mindset', 'strategy', 'learning',
    ];

    // Match based on words in content
    const suggestions = popularHashtags
      .filter(tag => !existing.includes('#' + tag))
      .filter(tag => words.some(w => tag.includes(w) || w.includes(tag)))
      .slice(0, 8);

    if (suggestions.length === 0) {
      App.toast('No additional hashtag suggestions found for this content', 'info');
      return;
    }

    const container = document.getElementById('hashtag-suggestions');
    if (!container) return;

    container.style.display = 'flex';
    container.innerHTML = `
      <span class="text-xs text-muted" style="white-space:nowrap;padding-top:4px">Suggested:</span>
      <div style="display:flex;flex-wrap:wrap;gap:6px;flex:1">
        ${suggestions.map(tag => `
          <button class="hashtag-chip" onclick="ComposerPage.insertHashtag('#${tag}')">#${tag}</button>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('hashtag-suggestions').style.display='none'" style="padding:2px 6px;font-size:0.7rem">✕</button>
    `;
  },

  insertHashtag(tag) {
    const textarea = document.getElementById('post-content');
    if (!textarea) return;
    const content = textarea.value;
    textarea.value = content.trim() + '\n' + tag;
    this.updatePreview();
    this.updateCharCount();
    this.scheduleDraftSave();
  },

  insertEmoji() {
    const emojis = ['🚀', '💡', '🔥', '✅', '💪', '🎯', '📈', '🌟', '👇', '🤝', '🙏', '💼', '🧠', '⚡', '🎉', '💬', '🔑', '📌', '→', '✨'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const textarea = document.getElementById('post-content');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const text = textarea.value;
    textarea.value = text.slice(0, start) + emoji + text.slice(textarea.selectionEnd);
    textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    textarea.focus();
    this.updatePreview();
    this.updateCharCount();
  },

  async loadTemplate(templateId) {
    if (!templateId) return;
    try {
      const data = await App.api(`/api/templates/${templateId}`);
      const textarea = document.getElementById('post-content');
      if (textarea) {
        textarea.value = data.template.content;
        this.updatePreview();
        this.updateCharCount();
        this.scheduleDraftSave();
      }
      App.api(`/api/templates/${templateId}/use`, { method: 'POST' }).catch(() => {});
      App.toast('Template loaded!', 'info');
    } catch (error) {
      App.toast('Failed to load template', 'error');
    }
  },

  async savePost(status) {
    const content = document.getElementById('post-content')?.value?.trim();
    if (!content) {
      App.toast('Post content cannot be empty', 'error');
      return;
    }

    const scheduledAt = document.getElementById('post-schedule')?.value;
    const postType = document.getElementById('post-type')?.value;
    const tagsStr = document.getElementById('post-tags')?.value || '';
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    const finalStatus = scheduledAt ? 'queued' : status;

    try {
      await App.api('/api/posts', {
        method: 'POST',
        body: {
          content,
          post_type: postType,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          tags,
          status: finalStatus,
        },
      });

      App.toast(
        finalStatus === 'queued' ? '📅 Post scheduled successfully!' : '💾 Draft saved!',
        'success'
      );

      // Clear form and draft
      localStorage.removeItem(this.DRAFT_KEY);
      const contentEl = document.getElementById('post-content');
      const scheduleEl = document.getElementById('post-schedule');
      const tagsEl = document.getElementById('post-tags');
      const selectorEl = document.getElementById('template-selector');
      if (contentEl) contentEl.value = '';
      if (scheduleEl) scheduleEl.value = '';
      if (tagsEl) tagsEl.value = '';
      if (selectorEl) selectorEl.value = '';
      this.updatePreview();
      this.updateCharCount();
      this.loadRecentPosts();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async publishNow() {
    const content = document.getElementById('post-content')?.value?.trim();
    if (!content) {
      App.toast('Post content cannot be empty', 'error');
      return;
    }

    if (!await App.confirm('Publish this post to LinkedIn right now?')) return;

    try {
      const createData = await App.api('/api/posts', {
        method: 'POST',
        body: {
          content,
          post_type: document.getElementById('post-type')?.value || 'text',
          status: 'draft',
        },
      });

      await App.api(`/api/posts/${createData.post.id}/publish-now`, { method: 'POST' });
      App.toast('🎉 Post published to LinkedIn!', 'success');

      localStorage.removeItem(this.DRAFT_KEY);
      const contentEl = document.getElementById('post-content');
      if (contentEl) contentEl.value = '';
      this.updatePreview();
      this.updateCharCount();
      this.loadRecentPosts();
    } catch (error) {
      App.toast(`Publish failed: ${error.message}`, 'error');
    }
  },

  async loadRecentPosts() {
    const list = document.getElementById('recent-posts-list');
    if (!list) return;
    try {
      const data = await App.api('/api/posts?limit=5');

      if (data.posts.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding:20px">
            <div class="empty-state-icon">📝</div>
            <div class="empty-state-title">No posts yet</div>
          </div>
        `;
        return;
      }

      list.innerHTML = `
        <div class="activity-list">
          ${data.posts.map(p => `
            <div class="activity-item">
              <div class="activity-icon post">📝</div>
              <div class="activity-text" style="flex:1">
                <div style="font-weight:500; color:var(--text-primary)">${App.truncate(p.content, 55)}</div>
                <div class="text-xs mt-sm">
                  ${App.getStatusBadge(p.status)}
                  <span class="text-muted">${p.scheduled_at ? '📅 ' + App.formatDateTime(p.scheduled_at) : App.formatRelativeTime(p.created_at)}</span>
                </div>
              </div>
              <div class="flex gap-sm">
                ${p.status === 'draft' || p.status === 'failed' ? `
                  <button class="btn btn-ghost btn-sm" onclick="ComposerPage.editPost('${p.id}')">Edit</button>
                ` : ''}
                <button class="btn btn-ghost btn-sm" onclick="ComposerPage.deletePost('${p.id}')" style="color:var(--accent-rose)">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      list.innerHTML = '<div class="text-sm text-muted text-center" style="padding:20px">Failed to load posts</div>';
    }
  },

  async editPost(id) {
    try {
      const data = await App.api(`/api/posts/${id}`);
      const post = data.post;
      const contentEl = document.getElementById('post-content');
      const typeEl = document.getElementById('post-type');
      const scheduleEl = document.getElementById('post-schedule');
      const tagsEl = document.getElementById('post-tags');

      if (contentEl) contentEl.value = post.content;
      if (typeEl) typeEl.value = post.post_type;
      if (scheduleEl && post.scheduled_at) {
        const dt = new Date(post.scheduled_at);
        const tzOffset = dt.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(dt.getTime() - tzOffset)).toISOString().slice(0, 16);
        scheduleEl.value = localISOTime;
      }
      if (tagsEl && post.tags?.length) {
        tagsEl.value = post.tags.join(', ');
      }
      this.currentPostId = id;
      this.updatePreview();
      this.updateCharCount();
      // Scroll to top of composer
      document.getElementById('post-content')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      App.toast('Post loaded for editing', 'info');
    } catch (error) {
      App.toast('Failed to load post', 'error');
    }
  },

  async deletePost(id) {
    if (!await App.confirm('Delete this post?')) return;
    try {
      await App.api(`/api/posts/${id}`, { method: 'DELETE' });
      App.toast('Post deleted', 'success');
      this.loadRecentPosts();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },
};
