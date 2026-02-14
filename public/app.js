// CardioClaw Dashboard v2 - Terminal Aesthetic
// State
const state = {
  currentView: 'hourly',
  currentDate: new Date(),
  heartbeats: [],
  status: {},
  runs: {},
  lastSync: null,
  selectedJob: null
};

// API Helpers
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadHeartbeats() {
  const data = await fetchJSON('/api/heartbeats');
  state.heartbeats = data.jobs || [];
}

async function loadStatus() {
  const data = await fetchJSON('/api/status');
  state.status = data;
}

async function loadRuns(jobId) {
  if (state.runs[jobId]) return state.runs[jobId];
  const data = await fetchJSON(`/api/runs?job_id=${jobId}&limit=20`);
  state.runs[jobId] = data.runs || [];
  return state.runs[jobId];
}

async function refreshAll() {
  try {
    await Promise.all([loadHeartbeats(), loadStatus()]);
    state.lastSync = new Date();
    renderCurrentView();
    updateHealthPanel();
  } catch (err) {
    console.error('Refresh failed:', err);
  }
}

// Date Helpers
function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '--';
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff < 0) return 'Past due';
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 1) return `In ${days} days`;
  if (days === 1) return 'Tomorrow';
  if (hours > 0) return `In ${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `In ${minutes}m`;
  return 'Soon';
}

function formatDuration(ms) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${seconds}s`;
}

function getHourFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.getHours();
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

// Schedule Parser
function parseSchedule(scheduleStr) {
  try {
    const schedule = JSON.parse(scheduleStr);
    if (schedule.kind === 'at') {
      return { type: 'oneshot', time: new Date(schedule.at) };
    }
    if (schedule.kind === 'cron') {
      return { type: 'recurring', expr: schedule.expr, tz: schedule.tz };
    }
    return { type: 'unknown' };
  } catch {
    return { type: 'unknown' };
  }
}

function getJobsForDate(date) {
  return state.heartbeats.filter(job => {
    if (!job.next_run_at) return false;
    const nextRun = new Date(job.next_run_at);
    return isSameDay(nextRun, date);
  });
}

function getJobsForHour(date, hour) {
  return state.heartbeats.filter(job => {
    if (!job.next_run_at) return false;
    const nextRun = new Date(job.next_run_at);
    return isSameDay(nextRun, date) && nextRun.getHours() === hour;
  });
}

// View Renderers
function renderHourlyView() {
  const jobs = getJobsForDate(state.currentDate);
  const jobsByHour = {};
  
  // Group jobs by hour
  for (let hour = 0; hour < 24; hour++) {
    jobsByHour[hour] = getJobsForHour(state.currentDate, hour);
  }
  
  const html = `
    <div class="ascii-box">
      <div class="ascii-box-header">─ HOURLY VIEW ────────────────────────────────────────────</div>
      <div class="hourly-header">
        <div class="hourly-date">${formatDate(state.currentDate)}</div>
        <div class="day-nav">
          <button class="btn-nav" id="prev-day">← Yesterday</button>
          <button class="btn-nav" id="next-day">Tomorrow →</button>
        </div>
      </div>
      <div class="hourly-timeline">
        ${Array.from({ length: 24 }, (_, hour) => `
          <div class="hour-row">
            <div class="hour-label">${String(hour).padStart(2, '0')}:00 ┤</div>
            <div class="hour-jobs">
              ${renderHourJobs(hour, jobsByHour[hour])}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.getElementById('content').innerHTML = html;
  
  // Attach event listeners
  document.getElementById('prev-day')?.addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() - 1);
    renderHourlyView();
  });
  
  document.getElementById('next-day')?.addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() + 1);
    renderHourlyView();
  });
  
  attachJobClickListeners();
}

function renderHourJobs(hour, jobs) {
  if (!jobs || jobs.length === 0) {
    return '<span class="text-dim" style="font-size: 0.85rem;"></span>';
  }
  
  return jobs.map(job => {
    const status = getJobStatus(job);
    return `
      <div class="job-entry" data-job-id="${job.id}">
        <span>🦞</span>
        <span class="job-name">${job.name}</span>
        <span class="job-status ${status.class}">${status.text}</span>
      </div>
    `;
  }).join('');
}

function getJobStatus(job) {
  const now = Date.now();
  
  if (job.last_run_at && job.last_run_at > now - 86400000) {
    // Ran in last 24h
    if (job.last_status === 'ok') {
      return { class: 'ok', text: `✓ ${formatDuration(job.last_run_at - (job.last_run_at - 10000))}` };
    }
    return { class: 'error', text: `✗ ${job.last_error || 'error'}` };
  }
  
  if (job.next_run_at && job.next_run_at > now) {
    const timeUntil = formatRelativeTime(job.next_run_at);
    return { class: 'upcoming', text: `⏱ ${timeUntil}` };
  }
  
  return { class: 'not-run', text: '(not run)' };
}

function renderCalendarView() {
  const startOfWeek = new Date(state.currentDate);
  startOfWeek.setDate(state.currentDate.getDate() - state.currentDate.getDay());
  
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date;
  });
  
  const html = `
    <div class="ascii-box">
      <div class="ascii-box-header">─ CALENDAR VIEW ──────────────────────────────────────────</div>
      <div class="calendar-header">
        <div class="calendar-week">
          Week of ${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
          ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, 
          ${weekDays[0].getFullYear()}
        </div>
        <div class="day-nav">
          <button class="btn-nav" id="prev-week">← Prev Week</button>
          <button class="btn-nav" id="next-week">Next Week →</button>
        </div>
      </div>
      <div class="calendar-grid">
        ${weekDays.map(date => renderCalendarDay(date)).join('')}
      </div>
    </div>
  `;
  
  document.getElementById('content').innerHTML = html;
  
  document.getElementById('prev-week')?.addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() - 7);
    renderCalendarView();
  });
  
  document.getElementById('next-week')?.addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() + 7);
    renderCalendarView();
  });
  
  attachJobClickListeners();
}

function renderCalendarDay(date) {
  const today = new Date();
  const isToday = isSameDay(date, today);
  const jobs = getJobsForDate(date);
  
  return `
    <div class="calendar-day ${isToday ? 'today' : ''}">
      <div class="day-header">
        ${date.toLocaleDateString('en-US', { weekday: 'short' })}
      </div>
      <div class="day-date">
        ${date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
      </div>
      <div class="day-jobs">
        ${jobs.slice(0, 5).map(job => {
          const hour = getHourFromTimestamp(job.next_run_at);
          const status = getJobStatus(job);
          return `
            <div class="calendar-job" data-job-id="${job.id}">
              <span class="time">${String(hour).padStart(2, '0')}:00</span>
              <span class="${status.class}">🦞</span>
            </div>
          `;
        }).join('')}
        ${jobs.length > 5 ? `<div class="text-dim" style="font-size: 0.75rem;">+${jobs.length - 5} more</div>` : ''}
      </div>
    </div>
  `;
}

function renderListView() {
  const html = `
    <div class="ascii-box">
      <div class="ascii-box-header">─ LIST VIEW ──────────────────────────────────────────────</div>
      <div class="list-controls">
        <div class="list-filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="active">Active</button>
          <button class="filter-btn" data-filter="failing">Failing</button>
        </div>
        <div class="list-sort">
          Sort:
          <select id="sort-select">
            <option value="name">Name</option>
            <option value="next_run">Next Run</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>
      <table class="list-table">
        <thead>
          <tr>
            <th>NAME</th>
            <th>SCHEDULE</th>
            <th>NEXT RUN</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          ${state.heartbeats.map(job => `
            <tr data-job-id="${job.id}">
              <td>🦞 ${job.name}</td>
              <td>${formatSchedule(job.schedule)}</td>
              <td>${formatRelativeTime(job.next_run_at)}</td>
              <td>${renderStatusBadge(job)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  document.getElementById('content').innerHTML = html;
  attachJobClickListeners();
}

function formatSchedule(scheduleStr) {
  const schedule = parseSchedule(scheduleStr);
  if (schedule.type === 'oneshot') {
    return `at ${schedule.time.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;
  }
  if (schedule.type === 'recurring') {
    return schedule.expr;
  }
  return 'unknown';
}

function renderStatusBadge(job) {
  if (job.last_status === 'ok') {
    return '<span class="text-ok">✓ ok</span>';
  }
  if (job.last_status === 'error') {
    return '<span class="text-error">✗ error</span>';
  }
  if (job.status === 'disabled') {
    return '<span class="text-dim">⏸ disabled</span>';
  }
  return '<span class="text-dim">⏱ pending</span>';
}

// Modal
async function showJobDetail(jobId) {
  const job = state.heartbeats.find(j => j.id === jobId);
  if (!job) return;
  
  const runs = await loadRuns(jobId);
  const schedule = parseSchedule(job.schedule);
  
  const html = `
    <div class="modal-section">
      <div class="modal-meta">
        <span class="modal-meta-label">Schedule:</span>
        <span class="modal-meta-value">${formatSchedule(job.schedule)}</span>
        
        <span class="modal-meta-label">Status:</span>
        <span class="modal-meta-value">${job.status}</span>
        
        <span class="modal-meta-label">Next Run:</span>
        <span class="modal-meta-value">${formatRelativeTime(job.next_run_at)}</span>
        
        <span class="modal-meta-label">Last Run:</span>
        <span class="modal-meta-value">
          ${job.last_run_at ? formatTime(job.last_run_at) + ' (' + renderStatusBadge(job) + ')' : 'Never'}
        </span>
      </div>
    </div>
    
    <div class="modal-section">
      <div class="modal-section-title">─ EXECUTION HISTORY ─</div>
      <div class="run-history">
        ${runs.length === 0 ? '<div class="text-dim">No execution history</div>' : runs.map(run => `
          <div class="run-entry">
            <span class="run-time">${new Date(run.started_at).toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: 'numeric', 
              minute: '2-digit' 
            })}</span>
            <span class="run-status ${run.status === 'ok' ? 'text-ok' : 'text-error'}">
              ${run.status === 'ok' ? '✓' : '✗'} ${run.status}
            </span>
            <span class="run-duration">${formatDuration(run.duration_ms)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.getElementById('modal-title').textContent = `🦞 ${job.name}`;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('detail-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

// Health Panel
function updateHealthPanel() {
  const active = state.heartbeats.filter(j => j.status === 'active').length;
  const failing = state.heartbeats.filter(j => j.status === 'failing').length;
  
  const nextJob = state.heartbeats
    .filter(j => j.next_run_at && j.next_run_at > Date.now())
    .sort((a, b) => a.next_run_at - b.next_run_at)[0];
  
  document.getElementById('health-active').textContent = `✓ ${active} active`;
  document.getElementById('health-failing').textContent = `✗ ${failing} failing`;
  document.getElementById('health-next').textContent = nextJob 
    ? `⏱ Next: ${nextJob.name} ${formatRelativeTime(nextJob.next_run_at)}`
    : '⏱ Next: --';
  document.getElementById('health-success').textContent = '💚 --'; // TODO: Calculate from runs
  
  if (state.lastSync) {
    const ago = Math.floor((Date.now() - state.lastSync) / 1000);
    const agoText = ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
    document.getElementById('last-sync').textContent = `Last sync: ${agoText}`;
  }
}

// View Switching
function switchView(view) {
  state.currentView = view;
  
  // Update buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  renderCurrentView();
}

function renderCurrentView() {
  if (state.currentView === 'hourly') renderHourlyView();
  else if (state.currentView === 'calendar') renderCalendarView();
  else if (state.currentView === 'list') renderListView();
}

function attachJobClickListeners() {
  document.querySelectorAll('[data-job-id]').forEach(el => {
    el.addEventListener('click', () => {
      showJobDetail(el.dataset.jobId);
    });
  });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // View switcher
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  
  // Sync button
  document.getElementById('sync-btn').addEventListener('click', refreshAll);
  
  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') closeModal();
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    if (e.key === '1') switchView('hourly');
    else if (e.key === '2') switchView('calendar');
    else if (e.key === '3') switchView('list');
    else if (e.key === 'r') refreshAll();
    else if (e.key === 'Escape') closeModal();
  });
  
  // Initial load
  refreshAll();
  
  // Auto-refresh every 30s
  setInterval(() => {
    refreshAll();
  }, 30000);
});
