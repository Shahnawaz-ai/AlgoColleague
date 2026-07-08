const RoadmapPage = {
  render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🚀 AI Auto-Pilot Roadmap</h1>
        <p class="text-secondary" style="margin-top: 8px;">Paste your 1-month strategy below and let our AI generate 30 highly engaging LinkedIn posts automatically scheduled for you.</p>
      </div>

      <div class="page-content">
        <div class="card" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 16px;">Your Content Strategy</h3>
          <textarea id="roadmap-input" class="input" style="width: 100%; height: 200px; resize: vertical; padding: 16px; font-family: inherit; margin-bottom: 16px;" placeholder="Example: I want to focus on 3 pillars: Leadership, Engineering Culture, and Startup Growth. Week 1 should be about building teams. Week 2..."></textarea>
          
          <div style="display: flex; gap: 16px; align-items: center;">
            <button id="btn-generate-roadmap" class="btn btn-primary" onclick="RoadmapPage.generate()">
              ✨ Generate & Schedule 30 Posts
            </button>
            <span id="roadmap-status" style="color: var(--text-secondary); font-size: 14px; font-weight: 500;"></span>
          </div>
        </div>

        <div id="roadmap-results" style="display: none;">
          <h3 style="margin-bottom: 16px;">Scheduled Posts</h3>
          <div id="roadmap-posts-list" style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Generated posts will appear here -->
          </div>
          <div style="margin-top: 24px;">
            <button class="btn btn-secondary" onclick="App.navigate('calendar')">Go to Calendar 📅</button>
          </div>
        </div>
      </div>
    `;
  },

  async generate() {
    const input = document.getElementById('roadmap-input').value.trim();
    if (!input) {
      App.toast('Please enter a roadmap strategy first', 'warning');
      return;
    }

    const btn = document.getElementById('btn-generate-roadmap');
    const statusText = document.getElementById('roadmap-status');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin:0"></span> Generating... (This may take up to 30 seconds)';
    statusText.textContent = 'Calling Gemini 1.5 AI...';
    document.getElementById('roadmap-results').style.display = 'none';

    try {
      const res = await App.api('/api/ai/roadmap', {
        method: 'POST',
        body: { roadmap: input }
      });

      App.toast(`Successfully generated and scheduled ${res.count} posts!`, 'success', 5000);
      statusText.textContent = `✅ ${res.count} posts scheduled!`;
      
      const list = document.getElementById('roadmap-posts-list');
      list.innerHTML = res.posts.map(p => `
        <div class="card" style="padding: 16px; border-left: 4px solid var(--accent-indigo);">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            🗓️ Scheduled for: ${App.formatDateTime(p.scheduled_at)}
          </div>
          <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.5; color: var(--text-primary);">
            ${p.content}
          </div>
        </div>
      `).join('');

      document.getElementById('roadmap-results').style.display = 'block';

    } catch (err) {
      App.toast(err.message, 'error');
      statusText.textContent = '❌ Generation failed';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Generate & Schedule 30 Posts';
    }
  }
};

window.RoadmapPage = RoadmapPage;
