/* ================================================================
   Connections Page — Connection Request Management
   ================================================================ */

const ConnectionsPage = {
  currentFilter: 'pending',

  async render() {
    const container = document.getElementById('page-container');

    try {
      const data = await App.api(`/api/connections?status=${this.currentFilter}`);

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">🤝 Connections</h1>
          <p class="page-subtitle">Manage connection requests and track your network growth</p>
        </div>
        <div class="page-content">
          <!-- Stats -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-icon">⏳</div>
              <div class="stat-card-value">${data.counts.pending}</div>
              <div class="stat-card-label">Pending</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">✅</div>
              <div class="stat-card-value">${data.counts.accepted}</div>
              <div class="stat-card-label">Accepted</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">❌</div>
              <div class="stat-card-value">${data.counts.declined}</div>
              <div class="stat-card-label">Declined</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">👥</div>
              <div class="stat-card-value">${data.counts.total}</div>
              <div class="stat-card-label">Total Tracked</div>
            </div>
          </div>

          <!-- Filters & Actions -->
          <div class="card">
            <div class="card-header">
              <div class="tabs" style="margin-bottom:0">
                <button class="tab ${this.currentFilter === 'pending' ? 'active' : ''}" onclick="ConnectionsPage.setFilter('pending')">Pending</button>
                <button class="tab ${this.currentFilter === 'accepted' ? 'active' : ''}" onclick="ConnectionsPage.setFilter('accepted')">Accepted</button>
                <button class="tab ${this.currentFilter === 'declined' ? 'active' : ''}" onclick="ConnectionsPage.setFilter('declined')">Declined</button>
                <button class="tab ${this.currentFilter === 'all' ? 'active' : ''}" onclick="ConnectionsPage.setFilter('all')">All</button>
              </div>
              <div class="flex gap-sm">
                <button class="btn btn-sm btn-secondary" onclick="ConnectionsPage.addManual()">+ Add Manually</button>
                <button class="btn btn-sm btn-ghost" onclick="ConnectionsPage.importCSV()" title="Import from CSV">📥 Import CSV</button>
                ${data.counts.pending > 0 ? `
                  <button class="btn btn-sm btn-success" onclick="ConnectionsPage.bulkAccept()">Accept All</button>
                ` : ''}
              </div>
            </div>

            ${data.connections.length === 0 ? `
              <div class="empty-state" style="padding: 40px 16px">
                <div class="empty-state-icon">🤝</div>
                <div class="empty-state-title">No ${this.currentFilter} connections</div>
                <div class="empty-state-text">
                  ${this.currentFilter === 'pending' ? 'Add connection requests manually or sync from LinkedIn to manage them here.' : 'No connections in this category yet.'}
                </div>
                <button class="btn btn-primary mt-md" onclick="ConnectionsPage.addManual()">Add Connection</button>
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px">
                ${data.connections.map(conn => `
                  <div class="connection-card" id="conn-${conn.id}">
                    <div class="connection-avatar">${(conn.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
                    <div class="connection-info">
                      <div class="connection-name">${conn.name}</div>
                      <div class="connection-headline">${conn.headline || 'No headline'}</div>
                      ${conn.message ? `<div class="connection-message">"${App.truncate(conn.message, 80)}"</div>` : ''}
                      <div class="text-xs text-muted mt-sm">${App.formatRelativeTime(conn.received_at)}</div>
                    </div>
                    <div class="connection-actions">
                      ${conn.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="ConnectionsPage.accept('${conn.id}')">✓ Accept</button>
                        <button class="btn btn-sm btn-ghost" onclick="ConnectionsPage.decline('${conn.id}')" style="color:var(--accent-rose)">✗ Decline</button>
                      ` : `
                        ${App.getStatusBadge(conn.status)}
                      `}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `
        <div class="page-header"><h1 class="page-title">🤝 Connections</h1></div>
        <div class="page-content"><div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Failed to load connections</div><div class="empty-state-text">${error.message}</div></div></div>
      `;
    }
  },

  setFilter(filter) {
    this.currentFilter = filter;
    this.render();
  },

  async accept(id) {
    try {
      await App.api(`/api/connections/${id}/accept`, {
        method: 'POST',
        body: { note: '' },
      });
      App.toast('Connection accepted!', 'success');
      // Animate removal
      const el = document.getElementById(`conn-${id}`);
      if (el) {
        el.style.transition = 'all 0.3s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateX(50px)';
        setTimeout(() => this.render(), 300);
      } else {
        this.render();
      }
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async decline(id) {
    if (!await App.confirm('Decline this connection request?')) return;
    try {
      await App.api(`/api/connections/${id}/decline`, { method: 'POST' });
      App.toast('Connection declined', 'info');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  async bulkAccept() {
    if (!await App.confirm('Accept all pending connection requests?')) return;
    try {
      const data = await App.api('/api/connections?status=pending&limit=200');
      const ids = data.connections.map(c => c.id);
      await App.api('/api/connections/bulk-action', {
        method: 'POST',
        body: { ids, action: 'accept' },
      });
      App.toast(`Accepted ${ids.length} connections!`, 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  addManual() {
    const body = `
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" class="form-input" id="conn-name" placeholder="John Doe">
      </div>
      <div class="form-group">
        <label class="form-label">Headline</label>
        <input type="text" class="form-input" id="conn-headline" placeholder="Software Engineer at Google">
      </div>
      <div class="form-group">
        <label class="form-label">Profile URL</label>
        <input type="text" class="form-input" id="conn-url" placeholder="https://linkedin.com/in/johndoe">
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="conn-message" placeholder="Their connection message..." rows="3"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ConnectionsPage.submitManual()">Add Connection</button>
    `;
    App.showModal('Add Connection Request', body, footer);
  },

  async submitManual() {
    const name = document.getElementById('conn-name').value.trim();
    if (!name) { App.toast('Name is required', 'error'); return; }

    try {
      await App.api('/api/connections', {
        method: 'POST',
        body: {
          name,
          headline: document.getElementById('conn-headline').value.trim(),
          profile_url: document.getElementById('conn-url').value.trim(),
          message: document.getElementById('conn-message').value.trim(),
        },
      });
      App.closeModal();
      App.toast('Connection request added!', 'success');
      this.render();
    } catch (error) {
      App.toast(`Failed: ${error.message}`, 'error');
    }
  },

  importCSV() {
    const body = `
      <p class="text-sm text-muted mb-md">
        Upload a CSV file with columns: <code>Name</code>, <code>Headline</code>, <code>URL</code>, <code>Message</code><br>
        (First row should be header row)
      </p>
      <div class="import-drop-zone" id="csv-drop-zone" onclick="document.getElementById('csv-file-input').click()">
        <div class="import-drop-zone-icon">📥</div>
        <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);margin-bottom:6px">Click to select CSV file</div>
        <div class="text-xs text-muted">or drag & drop here</div>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="ConnectionsPage.handleCSVFile(this.files[0])">
      </div>
      <div id="csv-preview" style="display:none;margin-top:16px"></div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="csv-import-btn" onclick="ConnectionsPage.submitCSVImport()" disabled>Import Connections</button>
    `;
    App.showModal('Import Connections from CSV', body, footer);

    // Drag and drop
    setTimeout(() => {
      const zone = document.getElementById('csv-drop-zone');
      if (!zone) return;
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) this.handleCSVFile(file);
      });
    }, 100);
  },

  handleCSVFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = this.parseCSV(text);
      this._csvRows = rows;

      const preview = document.getElementById('csv-preview');
      const importBtn = document.getElementById('csv-import-btn');
      if (!preview) return;

      if (rows.length === 0) {
        preview.style.display = 'block';
        preview.innerHTML = '<div class="text-sm" style="color:var(--accent-rose)">⚠️ No valid rows found in CSV</div>';
        return;
      }

      preview.style.display = 'block';
      preview.innerHTML = `
        <div class="text-sm text-muted mb-sm">📋 Found <strong style="color:var(--text-primary)">${rows.length}</strong> connection(s) to import:</div>
        <div style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
          ${rows.slice(0, 8).map(r => `
            <div class="text-xs" style="padding:6px 8px;background:var(--bg-glass);border-radius:var(--radius-sm)">
              <strong>${r.name || r.Name || '?'}</strong>
              ${(r.headline || r.Headline) ? ` · ${r.headline || r.Headline}` : ''}
            </div>
          `).join('')}
          ${rows.length > 8 ? `<div class="text-xs text-muted" style="padding:4px 8px">...and ${rows.length - 8} more</div>` : ''}
        </div>
      `;
      if (importBtn) importBtn.disabled = false;
    };
    reader.readAsText(file);
  },

  parseCSV(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const values = line.match(/(".*?"|[^,]+)/g) || [];
      const row = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] || '').trim().replace(/^"|"$/g, '');
      });
      return row;
    }).filter(row => Object.values(row).some(v => v));
  },

  async submitCSVImport() {
    const rows = this._csvRows;
    if (!rows || rows.length === 0) { App.toast('No rows to import', 'error'); return; }

    const importBtn = document.getElementById('csv-import-btn');
    if (importBtn) { importBtn.disabled = true; importBtn.textContent = `Importing ${rows.length}...`; }

    try {
      const result = await App.api('/api/connections/import', {
        method: 'POST',
        body: { rows },
      });
      App.closeModal();
      App.toast(`✅ Imported ${result.imported} connections!${result.errors.length > 0 ? ` (${result.errors.length} skipped)` : ''}`, 'success');
      this._csvRows = null;
      this.render();
    } catch (error) {
      App.toast(`Import failed: ${error.message}`, 'error');
      if (importBtn) { importBtn.disabled = false; importBtn.textContent = 'Import Connections'; }
    }
  },
};

