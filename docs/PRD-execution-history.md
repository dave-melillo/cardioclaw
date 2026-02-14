# PRD: Execution History Tracking

**Feature ID:** CARDIO-003  
**Author:** Beast  
**Date:** 2026-02-14  
**Status:** Draft  
**Priority:** 4/5  
**Complexity:** M (Medium)  
**Parent:** CardioClaw Phase 2

---

## Problem Statement

CardioClaw shows **what's scheduled** but not **what actually ran**. Users have no visibility into:

- When heartbeats executed (actual run times vs scheduled times)
- Success/failure rate per heartbeat
- Run duration or error messages
- Execution trends (is Morning Briefing failing every Tuesday?)

**Current state:** `cardioclaw status` shows next run time and last status (ok/error), but no historical record.

**Desired state:** `cardioclaw runs "Morning Briefing"` shows last 30 executions with timestamps, status, duration.

---

## Proposed Solution: SQLite Run History

### Architecture

**Data capture:**
1. Poll OpenClaw cron jobs via `openclaw cron list` (already happens on `sync`/`status`)
2. Detect state changes:
   - `lastRunAtMs` increased → new execution detected
   - Record: timestamp, status, duration, error (if any)
3. Store in SQLite `runs` table

**Storage:**
- Extend existing `~/.cardioclaw/state.db`
- New table: `runs` (see schema below)
- Retention: Last 100 runs per job OR 90 days, whichever is shorter

**Access:**
- CLI: `cardioclaw runs [job_name]` — show recent runs
- API: `GET /api/runs?job_id=<id>` — for dashboard timeline

---

## Data Model

### SQLite Schema

```sql
-- Existing jobs table (already in Phase 1)
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,           -- OpenClaw cron job id
  name TEXT,
  schedule TEXT,
  agent TEXT,
  status TEXT,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  managed INTEGER DEFAULT 0
);

-- NEW: Runs table
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,          -- FK to jobs.id
  job_name TEXT,                 -- Cached for fast queries
  started_at INTEGER NOT NULL,   -- Unix timestamp (ms)
  ended_at INTEGER,              -- NULL if still running
  duration_ms INTEGER,           -- ended_at - started_at
  status TEXT,                   -- 'ok' | 'error' | 'timeout'
  error TEXT,                    -- Error message (if any)
  session_id TEXT,               -- OpenClaw session id (if available)
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_runs_job_id ON runs(job_id);
CREATE INDEX idx_runs_started_at ON runs(started_at);
```

### Example Data

| id | job_id | job_name | started_at | duration_ms | status | error |
|----|--------|----------|------------|-------------|--------|-------|
| 1 | 98123dc5 | Morning Briefing | 1707825600000 | 90371 | ok | NULL |
| 2 | 98123dc5 | Morning Briefing | 1707912000000 | 73214 | ok | NULL |
| 3 | 2873c92c | Evening Wrap-up | 1707854400000 | 65102 | ok | NULL |
| 4 | 2873c92c | Evening Wrap-up | 1707940800000 | 120000 | error | "timeout" |

---

## Implementation

### 1. Capture Mechanism

**When to poll:**
- **Option A:** On every `cardioclaw sync` / `status` (passive)
- **Option B:** Background daemon polls every 5 minutes (active)
- **Option C:** Hybrid: sync/status updates + optional daemon

**Recommendation:** Start with **Option A** (passive). Poll on `sync`/`status`, which users run frequently. Add daemon in Phase 3 if needed.

**Detection logic:**
```typescript
async function captureRuns(db: Database) {
  const result = execSync('openclaw cron list --json', { encoding: 'utf-8' });
  const cronJobs = JSON.parse(result).jobs || [];

  for (const job of cronJobs) {
    const existing = db.prepare('SELECT last_run_at FROM jobs WHERE id = ?').get(job.id);
    
    if (existing && job.state?.lastRunAtMs > existing.last_run_at) {
      // New execution detected!
      db.prepare(`
        INSERT INTO runs (job_id, job_name, started_at, duration_ms, status, error)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        job.id,
        job.name,
        job.state.lastRunAtMs,
        job.state.lastDurationMs,
        job.state.lastStatus,
        job.state.lastError
      );
    }

    // Update jobs table
    db.prepare(`
      UPDATE jobs SET last_run_at = ?, last_status = ?, last_error = ?
      WHERE id = ?
    `).run(job.state?.lastRunAtMs, job.state?.lastStatus, job.state?.lastError, job.id);
  }
}
```

**Limitation:** This only captures **most recent** execution. If a job runs twice between polls, we miss the first run. Acceptable for Phase 2.

### 2. CLI Command

**New command:**
```bash
# Show last 20 runs for specific job
cardioclaw runs "Morning Briefing"

# Show last 10 runs for all jobs
cardioclaw runs --all --limit 10

# Show runs since yesterday
cardioclaw runs "Evening Wrap-up" --since yesterday
```

**Output example:**
```
🫀 Execution History: Morning Briefing

Last 20 runs:

  Feb 14, 08:00 AM   ✓ ok       1m 30s
  Feb 13, 08:00 AM   ✓ ok       1m 42s
  Feb 12, 08:00 AM   ✓ ok       1m 31s
  Feb 11, 08:00 AM   ✓ ok       1m 13s
  Feb 10, 08:00 AM   ✗ error    2m 0s   "timeout"
  Feb 09, 08:00 AM   ✓ ok       1m 18s
  ...

Success rate: 95% (19/20)
Avg duration: 1m 26s
```

### 3. API Endpoint

**New route (for dashboard):**
```typescript
// GET /api/runs?job_id=<id>&limit=50
app.get('/api/runs', (req, res) => {
  const { job_id, limit = 50 } = req.query;
  
  const runs = db.prepare(`
    SELECT * FROM runs
    WHERE job_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(job_id, limit);
  
  res.json({ runs });
});

// GET /api/runs/summary (for dashboard overview)
app.get('/api/runs/summary', (req, res) => {
  const summary = db.prepare(`
    SELECT 
      job_name,
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful_runs,
      AVG(duration_ms) as avg_duration_ms
    FROM runs
    WHERE started_at > ?
    GROUP BY job_name
  `).all(Date.now() - (7 * 24 * 60 * 60 * 1000)); // Last 7 days
  
  res.json({ summary });
});
```

### 4. Dashboard Integration

**Add to Timeline view:**
- Clicking a job card shows "Last 10 Runs" modal
- Color-code runs: green (ok), red (error), yellow (timeout)
- Mini sparkline chart showing success rate over time

**Add to Health Panel:**
- "Success rate (last 24h): 94% (17/18)"
- "Most failed job: Evening Wrap-up (3 errors)"

---

## Retention Policy

**Storage limits:**
- Keep last **100 runs per job**
- OR keep runs from last **90 days**
- Whichever is shorter

**Pruning command:**
```bash
# Prune runs older than 90 days
cardioclaw prune-runs --days 90

# Prune runs, keep last 50 per job
cardioclaw prune-runs --keep 50
```

**Auto-pruning:**
- Run on every `cardioclaw sync` (after capture)
- Silent (no output unless verbose mode)

**Implementation:**
```typescript
function pruneRuns(db: Database, days = 90, keepPerJob = 100) {
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  // Delete old runs
  db.prepare('DELETE FROM runs WHERE started_at < ?').run(cutoff);
  
  // Keep only last N per job
  db.prepare(`
    DELETE FROM runs
    WHERE id NOT IN (
      SELECT id FROM runs
      ORDER BY started_at DESC
      LIMIT ?
    )
  `).run(keepPerJob);
}
```

---

## Edge Cases

### 1. Job Runs Between Polls (Missed Execution)

**Scenario:** Morning Briefing runs at 8:00 AM and 8:05 AM. User runs `cardioclaw status` at 8:10 AM.

**Current design:** Only captures 8:05 AM run (most recent `lastRunAtMs`).

**Workaround (Phase 3):** Background daemon polls every 1-2 minutes to catch all runs. For now, acceptable loss.

### 2. Output Capture (Session Logs)

**Question:** Can we capture job output (e.g., "Briefing delivered successfully")?

**Answer:** Not easily. OpenClaw cron jobs run in isolated sessions. Session transcripts are saved to:
```
/Users/dave/.openclaw/agents/beast/sessions/{sessionId}.jsonl
```

**Phase 2 approach:** Store `session_id` in `runs` table (if available from `openclaw cron list`). User can manually inspect transcript.

**Phase 3 enhancement:** Parse session transcript, extract final message, store as `output` column.

### 3. Long-Running Jobs

**Scenario:** Job starts at 8:00 AM but takes 10 minutes. Poll at 8:05 AM shows job still running.

**OpenClaw behavior:** `lastRunAtMs` updates when job **starts**, not when it ends.

**Phase 2 approach:** Record `started_at`, leave `ended_at` NULL until next poll. Calculate `duration_ms` retroactively.

**Limitation:** If job is still running when we poll, duration is unknown until next poll.

---

## Testing Checklist

**Test scenarios:**
1. Run `cardioclaw sync` → verify new runs captured in SQLite
2. Job fails (simulated timeout) → verify `status: error` and error message
3. Run `cardioclaw runs "Morning Briefing"` → verify last 20 runs displayed
4. Run `cardioclaw prune-runs --days 30` → verify old runs deleted
5. Dashboard: click job card → verify "Last 10 Runs" modal shows
6. Dashboard health panel → verify success rate calculated correctly

---

## Definition of Done

### Functional Requirements
- ✅ SQLite `runs` table stores execution history
- ✅ `cardioclaw sync` / `status` captures new runs automatically
- ✅ `cardioclaw runs [name]` displays last 20 runs
- ✅ `GET /api/runs?job_id=<id>` returns run history
- ✅ Dashboard shows run history in job detail modal
- ✅ Auto-pruning keeps last 100 runs per job or 90 days
- ✅ Success rate displayed in dashboard health panel

### Non-Functional
- ✅ Polling adds < 1s overhead to `sync`/`status`
- ✅ SQLite queries optimized with indexes
- ✅ Handles jobs that run between polls gracefully (missed runs = acceptable)

### Out of Scope (Phase 2)
- ❌ Background daemon (continuous polling) — use passive polling for now
- ❌ Output capture (session transcript parsing) — store session_id only
- ❌ Real-time notifications on failures — just store history
- ❌ Sparkline charts in dashboard — simple list for now

---

## Timeline

**Estimated effort:** 1-2 days

**Breakdown:**
- SQLite schema + migration: 2 hours
- Capture logic (poll + detect changes): 3 hours
- CLI `runs` command: 2 hours
- API endpoints: 2 hours
- Dashboard integration (modal + health panel): 4 hours
- Testing + edge cases: 3 hours

**Total:** ~16 hours (2 days)

---

## Success Metrics

**Phase 2 Success:**
- User runs `cardioclaw runs "Morning Briefing"` → sees last 30 executions
- Dashboard health panel shows "Success rate: 95% (38/40)"
- User identifies failing job at a glance (red bars in timeline)

**Future (Phase 3):**
- Background daemon polls every 1 minute (catches all runs)
- Output capture (extract final message from session transcript)
- Alert on repeated failures (3+ consecutive errors → notify Dave)
- Sparkline charts showing success rate trends

---

*Simple passive polling for Phase 2. Store what OpenClaw gives us, display it cleanly. Build real-time monitoring in Phase 3.* 🫀
