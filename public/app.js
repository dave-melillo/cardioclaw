// CardioClaw Dashboard v2 - Terminal Aesthetic

// Token from URL (for --remote mode authentication)
const TOKEN = new URLSearchParams(window.location.search).get('token');

/**
 * HTML-escape a value before inserting into innerHTML.
 * Always call this on any untrusted/database-sourced string.
 */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// State
const state = {
  currentView: 'hourly',
  currentDate: new Date(),
  heartbeats: [],
  occurrences: [],
  status: {},
  runs: {},
  lastSync: null,
  selectedJob: null
};

// API Helpers

/** Append the token to a URL's query string if TOKEN is set. */
function withToken(url) {
  if (!TOKEN) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(TOKEN)}`;
}

async function fetchJSON(url) {
  const response = await fetch(withToken(url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function postRefresh() {
  const url = withToken('/api/refresh');
  const response = await fetch(url, { method: 'POST' });
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

async function loadOccurrences(startDate, endDate) {
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  const data = await fetchJSON(`/api/occurrences?start=${start}&end=${end}`);
  state.occurrences = data.occurrences || [];
}

async function refreshAll() {
  try {
    // Trigger server-side refresh first (fire-and-forget, ignore errors)
    postRefresh().catch(() => {});
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
  const today = new Date();
  const isToday = isSameDay(date, today);
  
  return state.heartbeats.filter(job => {
    const schedule = parseSchedule(job.schedule);
    
    // For one-shot jobs, check exact date match
    if (schedule.type === 'oneshot') {
      return isSameDay(schedule.time, date);
    }
    
    // For recurring jobs, show all active ones
    // (Without a full cron parser, we can't determine exact days)
    // Show active recurring jobs on all dates being viewed
    if (schedule.type === 'recurring' && job.status === 'active') {
      return true;
    }
    
    // Check if job ran on this date
    if (job.last_run_at) {
      const lastRun = new Date(job.last_run_at);
      if (isSameDay(lastRun, date)) return true;
    }
    
    // Check if job is scheduled to run on this date
    if (job.next_run_at) {
      const nextRun = new Date(job.next_run_at);
      if (isSameDay(nextRun, date)) return true;
    }
    
    return false;
  });
}

function getJobsForHour(date, hour) {
  const jobsInHour = new Map();
  
  // Check historical runs and immediate next runs
  for (const job of state.heartbeats) {
    // Check if job ran in this hour
    if (job.last_run_at) {
      const lastRun = new Date(job.last_run_at);
      if (isSameDay(lastRun, date) && lastRun.getHours() === hour) {
        jobsInHour.set(job.id, job);
        continue;
      }
    }
    
    // Check if job is scheduled to run in this hour
    if (job.next_run_at) {
      const nextRun = new Date(job.next_run_at);
      if (isSameDay(nextRun, date) && nextRun.getHours() === hour) {
        jobsInHour.set(job.id, job);
        continue;
      }
    }
  }
  
  // Check occurrences (for future dates)
  for (const occ of state.occurrences) {
    const occDate = new Date(occ.timestamp);
    if (isSameDay(occDate, date) && occDate.getHours() === hour) {
      // Find the job in heartbeats
      const job = state.heartbeats.find(j => j.id === occ.jobId);
      if (job) {
        jobsInHour.set(job.id, job);
      }
    }
  }
  
  return Array.from(jobsInHour.values());
}

// View Renderers
async function renderHourlyView() {
  // Load occurrences for this day
  const startOfDay = new Date(state.currentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(state.currentDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  await loadOccurrences(startOfDay, endOfDay);
  
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
      <div class="job-entry" data-job-id="${esc(job.id)}">
        <span class="bullet">▸</span>
        <span class="job-name">${esc(job.name)}</span>
        <span class="job-status ${esc(status.class)}">${esc(status.text)}</span>
      </div>
    `;
  }).join('');
}

function getJobStatus(job) {
  const now = Date.now();
  
  // Check if job ran recently (within selected day or last 24h)
  if (job.last_run_at) {
    const lastRun = new Date(job.last_run_at);
    const timeSinceRun = now - job.last_run_at;
    
    // If ran within last 24h, show completion status
    if (timeSinceRun < 86400000) {
      // last_status is null when job succeeded (only set on error)
      if (job.last_error || job.last_status === 'error') {
        // esc() applied at render time in renderHourJobs / renderCalendarDay
        return { class: 'error', text: `✗ ${job.last_error || 'error'}` };
      }
      // Show simple checkmark (duration not available on job object)
      return { class: 'ok', text: '✓ ok' };
    }
  }
  
  // Check if job is scheduled to run in future
  if (job.next_run_at && job.next_run_at > now) {
    const timeUntil = formatRelativeTime(job.next_run_at);
    return { class: 'upcoming', text: `⏱ ${timeUntil}` };
  }
  
  // Job hasn't run or is past due
  return { class: 'not-run', text: '(not run)' };
}

async function renderCalendarView() {
  const startOfWeek = new Date(state.currentDate);
  startOfWeek.setDate(state.currentDate.getDate() - state.currentDate.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  // Load occurrences for the week
  await loadOccurrences(startOfWeek, endOfWeek);
  
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
        ${jobs.slice(0, 8).map(job => {
          const status = getJobStatus(job);
          const schedule = parseSchedule(job.schedule);
          
          // Try to determine display time
          let displayTime = '';
          if (schedule.type === 'oneshot') {
            displayTime = schedule.time.getHours();
          } else if (job.next_run_at && isSameDay(new Date(job.next_run_at), date)) {
            displayTime = getHourFromTimestamp(job.next_run_at);
          } else if (job.last_run_at && isSameDay(new Date(job.last_run_at), date)) {
            displayTime = getHourFromTimestamp(job.last_run_at);
          } else {
            // Recurring job, don't show specific time
            displayTime = null;
          }
          
          return `
            <div class="calendar-job" data-job-id="${esc(job.id)}">
              ${displayTime !== null ? `<span class="time">${esc(String(displayTime).padStart(2, '0'))}:00</span>` : ''}
              <span class="${esc(status.class)} bullet">▸</span>
              <span class="text-dim" style="font-size: 0.7rem; margin-left: 0.2rem;">${esc(job.name.substring(0, 12))}</span>
            </div>
          `;
        }).join('')}
        ${jobs.length > 8 ? `<div class="text-dim" style="font-size: 0.7rem;">+${jobs.length - 8} more</div>` : ''}
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
            <tr data-job-id="${esc(job.id)}">
              <td><span class="bullet">▸</span> ${esc(job.name)}</td>
              <td>${esc(formatSchedule(job.schedule))}</td>
              <td>${esc(formatRelativeTime(job.next_run_at))}</td>
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
  // Check if job has error
  if (job.last_error || job.last_status === 'error') {
    return `<span class="text-error">✗ ${esc(job.last_error || 'error')}</span>`;
  }
  
  // If job ran recently (has last_run_at), consider it successful
  if (job.last_run_at) {
    const timeSinceRun = Date.now() - job.last_run_at;
    if (timeSinceRun < 86400000) { // Within last 24h
      return '<span class="text-ok">✓ ok</span>';
    }
  }
  
  // Check if disabled
  if (job.status === 'disabled') {
    return '<span class="text-dim">⏸ disabled</span>';
  }
  
  // Otherwise pending/scheduled
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
        <span class="modal-meta-value">${esc(formatSchedule(job.schedule))}</span>
        
        <span class="modal-meta-label">Status:</span>
        <span class="modal-meta-value">${esc(job.status)}</span>
        
        <span class="modal-meta-label">Next Run:</span>
        <span class="modal-meta-value">${esc(formatRelativeTime(job.next_run_at))}</span>
        
        <span class="modal-meta-label">Last Run:</span>
        <span class="modal-meta-value">
          ${job.last_run_at ? esc(formatTime(job.last_run_at)) + ' (' + renderStatusBadge(job) + ')' : 'Never'}
        </span>
      </div>
    </div>
    
    <div class="modal-section">
      <div class="modal-section-title">─ EXECUTION HISTORY ─</div>
      <div class="run-history">
        ${runs.length === 0 ? '<div class="text-dim">No execution history</div>' : runs.map(run => `
          <div class="run-entry">
            <span class="run-time">${esc(new Date(run.started_at).toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: 'numeric', 
              minute: '2-digit' 
            }))}</span>
            <span class="run-status ${run.status === 'ok' ? 'text-ok' : 'text-error'}">
              ${run.status === 'ok' ? '✓' : '✗'} ${esc(run.status)}
            </span>
            <span class="run-duration">${esc(formatDuration(run.duration_ms))}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.getElementById('modal-title').textContent = `🫀 ${job.name}`;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('detail-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

// Health Panel
function updateHealthPanel() {
  const now = Date.now();

  // Use live status from /api/status for accurate failing count
  const active = state.status.active ?? state.heartbeats.filter(j => j.status === 'active').length;
  const failing = state.status.failing ?? state.heartbeats.filter(j => j.status === 'failing').length;
  
  const nextJob = state.heartbeats
    .filter(j => j.next_run_at && j.next_run_at > now)
    .sort((a, b) => a.next_run_at - b.next_run_at)[0];
  
  // BPH: beats per hour — jobs scheduled to fire in the next 60 minutes
  const bph = state.heartbeats.filter(j =>
    j.next_run_at && j.next_run_at > now && j.next_run_at <= now + 3600000
  ).length;
  
  // Calculate success rate from all runs
  const allRuns = Object.values(state.runs).flat();
  const totalRuns = allRuns.length;
  const successfulRuns = allRuns.filter(r => r.status === 'ok').length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  
  // Update header BPH (always show a number; 0 when nothing upcoming)
  document.getElementById('live-bpm').textContent = bph;
  
  // Update header status — wired to actual failing count
  const statusEl = document.getElementById('header-status');
  if (failing > 0) {
    statusEl.textContent = '[DEGRADED]';
    statusEl.style.color = 'var(--status-error)';
  } else if (active > 0) {
    statusEl.textContent = '[HEALTHY]';
    statusEl.style.color = 'var(--status-ok)';
  } else {
    statusEl.textContent = '[IDLE]';
    statusEl.style.color = 'var(--text-dim)';
  }
  
  // Update health panel (◉ replaces 🦞 in stat rows; lobster lives in branding only)
  document.getElementById('health-active').textContent = `◉ ${active} active`;
  document.getElementById('health-failing').textContent = `⚠️ ${failing} failing`;
  document.getElementById('health-next').textContent = nextJob 
    ? `⏱ Next: ${nextJob.name} ${formatRelativeTime(nextJob.next_run_at)}`
    : '⏱ Next: --';
  document.getElementById('health-success').textContent = `◉ ${successRate}% uptime`;
  
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

async function renderCurrentView() {
  if (state.currentView === 'hourly') await renderHourlyView();
  else if (state.currentView === 'calendar') await renderCalendarView();
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
