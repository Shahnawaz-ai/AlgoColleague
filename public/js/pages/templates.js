/* ================================================================
   Templates Page — Reusable Content Template Library
   ================================================================ */

const TemplatesPage = {
  async render() {
    const container = document.getElementById('page-container');

    try {
      const data = await App.api('/api/templates');
      const templates = data.templates || [];

      const categories = ['all', 'general', 'engagement', 'promotional', 'thought_leadership', 'storytelling', 'tips', 'announcement'];
      const categoryLabels = {
        all: 'All',
        general: '📋 General',
        engagement: '🔥 Engagement',
        promotional: '📣 Promotional',
        thought_leadership: '🧠 Thought Leadership',
        storytelling: '📖 Storytelling',
        tips: '💡 Tips',
        announcement: '🎉 Announcement',
      };

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">📝 Template Library</h1>
          <p class="page-subtitle">Pre-built post templates to speed up your content creation</p>
        </div>
        <div class="page-content">
          <div class="flex justify-between items-center mb-md" style="flex-wrap:wrap; gap:12px">
            <div class="tabs" style="margin-bottom:0">
              ${categories.map(c => `
                <button class="tab" onclick="TemplatesPage.filterCategory('${c}')" id="tab-${c}">${categoryLabels[c]}</button>
              `).join('')}
            </div>
            <button class="btn btn-primary" onclick="TemplatesPage.createNew()">+ New Template</button>
          </div>

          ${templates.length === 0 ? `
            <div class="card">
              <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-title">No templates yet</div>
                <div class="empty-state-text">Create your first template or seed the defaults to get started.</div>
                <div class="flex gap-sm justify-center mt-md">
                  <button class="btn btn-primary" onclick="TemplatesPage.createNew()">Create Template</button>
                  <button class="btn btn-secondary" onclick="TemplatesPage.seedDefaults()">Load Defaults</button>
                </div>
              </div>
            </div>
          ` : `
            <div class="grid-3" id="templates-grid">
              ${templates.map(t => this.renderTemplateCard(t)).join('')}
            </div>
          `}
        </div>
      `;

      // Set first tab active
      const firstTab = document.getElementById('tab-all');
      if (firstTab) firstTab.classList.add('active');
    } catch (error) {
      container.innerHTML = `
        <div class="page-header"><h1 class="page-title">📝 Templates</h1></div>
        <div class="page-content"><div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Failed to load templates</div><div class="empty-state-text">${error.message}</div></div></div>
      `;
    }
  },

  renderTemplateCard(t) {
    const categoryLabels = {
      general: '📋', engagement: '🔥', promotional: '📣',
      thought_leadership: '🧠', storytelling: '📖', tips: '💡', announcement: '🎉',
    };
    return `
      <div class="template-card" data-category="${t.category}" onclick="TemplatesPage.useTemplate('${t.id}')">
        <div class="template-card-header">
          <div class="template-card-name">${categoryLabels[t.category] || '📋'} ${t.name}</div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); TemplatesPage.deleteTemplate('${t.id}')" style="color:var(--accent-rose)">🗑️</button>
        </div>
        <div class="template-card-preview">${App.truncate(t.content, 120)}</div>
        <div class="template-card-footer">
          <span class="badge badge-${t.category === 'engagement' ? 'queued' : 'draft'}">${t.category.replace('_', ' ')}</span>
          <span>Used ${t.usage_count}x</span>
        </div>
      </div>
    `;
  },

  filterCategory(category) {
    // Update active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`tab-${category}`);
    if (tab) tab.classList.add('active');

    // Filter cards
    const cards = document.querySelectorAll('.template-card');
    cards.forEach(card => {
      if (category === 'all' || card.dataset.category === category) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  },

  useTemplate(id) {
    App.navigate('composer');
    setTimeout(async () => {
      try {
        const data = await App.api(`/api/templates/${id}`);
        const textarea = document.getElementById('post-content');
        if (textarea) {
          textarea.value = data.template.content;
          ComposerPage.updatePreview();
          ComposerPage.updateCharCount();
        }
        App.api(`/api/templates/${id}/use`, { method: 'POST' }).catch(() => {});
        App.toast('Template loaded into composer!', 'info');
      } catch (e) {
        App.toast('Failed to load template', 'error');
      }
    }, 200);
  },

  createNew() {
    const body = `
      <div class="form-group">
        <label class="form-label">Template Name *</label>
        <input type="text" class="form-input" id="tmpl-name" placeholder="My Template">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="tmpl-category">
          <option value="general">General</option>
          <option value="engagement">Engagement</option>
          <option value="promotional">Promotional</option>
          <option value="thought_leadership">Thought Leadership</option>
          <option value="storytelling">Storytelling</option>
          <option value="tips">Tips</option>
          <option value="announcement">Announcement</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Content *</label>
        <textarea class="form-textarea" id="tmpl-content" placeholder="Write your template content..." rows="8"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="TemplatesPage.submitNew()">Create Template</button>
    `;
    App.showModal('Create Template', body, footer);
  },

  async submitNew() {
    const name = document.getElementById('tmpl-name').value.trim();
    const content = document.getElementById('tmpl-content').value.trim();
    if (!name || !content) { App.toast('Name and content are required', 'error'); return; }

    try {
      await App.api('/api/templates', {
        method: 'POST',
        body: {
          name,
          category: document.getElementById('tmpl-category').value,
          content,
        },
      });
      App.closeModal();
      App.toast('Template created!', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async deleteTemplate(id) {
    if (!await App.confirm('Delete this template?')) return;
    try {
      await App.api(`/api/templates/${id}`, { method: 'DELETE' });
      App.toast('Template deleted', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async seedDefaults() {
    try {
      await App.api('/api/templates/seed', { method: 'POST' });
      App.toast('Default templates loaded!', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },
};
