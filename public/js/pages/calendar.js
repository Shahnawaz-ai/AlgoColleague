/* ================================================================
   Calendar Page — Visual Content Calendar
   ================================================================ */

const CalendarPage = {
  currentDate: new Date(),

  async render() {
    const container = document.getElementById('page-container');

    try {
      // Fetch posts for the current month
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const from = firstDay.toISOString();
      const to = lastDay.toISOString();

      const data = await App.api(`/api/posts?from=${from}&to=${to}&limit=200`);
      const posts = data.posts;

      // Map posts to dates
      const postsByDate = {};
      posts.forEach(p => {
        const dateStr = p.scheduled_at ? p.scheduled_at.split('T')[0] :
          p.published_at ? p.published_at.split('T')[0] :
          p.created_at.split('T')[0];
        if (!postsByDate[dateStr]) postsByDate[dateStr] = [];
        postsByDate[dateStr].push(p);
      });

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      container.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">📅 Content Calendar</h1>
          <p class="page-subtitle">Visualize and manage your posting schedule</p>
        </div>
        <div class="page-content">
          <div class="card">
            <div class="calendar-nav">
              <button class="btn btn-ghost" onclick="CalendarPage.prevMonth()">← Previous</button>
              <span class="calendar-nav-month">${monthNames[month]} ${year}</span>
              <button class="btn btn-ghost" onclick="CalendarPage.nextMonth()">Next →</button>
            </div>

            <div class="calendar-grid">
              ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                .map(d => `<div class="calendar-header-cell">${d}</div>`).join('')}
              ${this.generateCalendarCells(year, month, postsByDate)}
            </div>
          </div>

          <!-- Posts Legend -->
          <div class="flex gap-md mt-md items-center" style="flex-wrap:wrap">
            <span class="text-xs text-muted">Legend:</span>
            <span class="badge badge-draft">Draft</span>
            <span class="badge badge-queued">Scheduled</span>
            <span class="badge badge-published">Published</span>
            <span class="badge badge-failed">Failed</span>
          </div>

          <!-- Post count for month -->
          <div class="card mt-lg">
            <div class="card-header">
              <h3 class="card-title">📊 Month Overview</h3>
            </div>
            <div class="flex gap-lg" style="flex-wrap:wrap">
              <div>
                <div class="text-xs text-muted">Total Posts</div>
                <div style="font-size:1.3rem; font-weight:800">${posts.length}</div>
              </div>
              <div>
                <div class="text-xs text-muted">Published</div>
                <div style="font-size:1.3rem; font-weight:800; color:var(--accent-emerald)">${posts.filter(p => p.status === 'published').length}</div>
              </div>
              <div>
                <div class="text-xs text-muted">Scheduled</div>
                <div style="font-size:1.3rem; font-weight:800; color:var(--accent-primary-light)">${posts.filter(p => p.status === 'queued').length}</div>
              </div>
              <div>
                <div class="text-xs text-muted">Drafts</div>
                <div style="font-size:1.3rem; font-weight:800; color:var(--text-secondary)">${posts.filter(p => p.status === 'draft').length}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `
        <div class="page-header"><h1 class="page-title">📅 Calendar</h1></div>
        <div class="page-content"><div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Failed to load calendar</div><div class="empty-state-text">${error.message}</div></div></div>
      `;
    }
  },

  generateCalendarCells(year, month, postsByDate) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let cells = '';

    // Previous month padding
    const prevMonth = new Date(year, month, 0);
    for (let i = startPad - 1; i >= 0; i--) {
      const day = prevMonth.getDate() - i;
      cells += `<div class="calendar-cell other-month"><div class="calendar-date">${day}</div></div>`;
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayPosts = postsByDate[dateStr] || [];

      cells += `
        <div class="calendar-cell${isToday ? ' today' : ''}" onclick="CalendarPage.onDayClick('${dateStr}')">
          <div class="calendar-date">${day}</div>
          ${dayPosts.slice(0, 3).map(p => `
            <div class="calendar-event ${p.status}" title="${App.truncate(p.content, 80)}">
              ${App.truncate(p.content, 25)}
            </div>
          `).join('')}
          ${dayPosts.length > 3 ? `<div class="text-xs text-muted">+${dayPosts.length - 3} more</div>` : ''}
        </div>
      `;
    }

    // Next month padding
    const totalCells = startPad + totalDays;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      cells += `<div class="calendar-cell other-month"><div class="calendar-date">${i}</div></div>`;
    }

    return cells;
  },

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.render();
  },

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.render();
  },

  onDayClick(dateStr) {
    // Navigate to composer with pre-filled date
    App.navigate('composer');
    setTimeout(() => {
      const input = document.getElementById('post-schedule');
      if (input) {
        input.value = dateStr + 'T09:00';
      }
    }, 100);
  },
};
