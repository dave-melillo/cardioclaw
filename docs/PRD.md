# PRD: CardioClaw - YAML Heartbeat Orchestration for OpenClaw

**Mission ID:** CARDIO-001  
**Author:** Beast  
**Date:** 2026-02-11 (REVISED - Full Phase 1)  
**Status:** Ready for Build  
**Priority:** 5/5  
**Complexity:** M (Medium)  
**Timeline:** 2-3 days  
**Repo:** https://github.com/dave-melillo/cardioclaw  
**Inspiration:** https://antfarm.cool (simple implementation of complete features)

---

## Executive Summary

CardioClaw brings **Antfarm-style simplicity** to OpenClaw heartbeat management. Write heartbeats in YAML, visualize them on a timeline, and monitor system health—all without touching JSON config files.

**What it solves:**
- Managing OpenClaw cron jobs is tedious (manual JSON or CLI commands)
- No visual way to see **what's scheduled when**
- Hard to spot failing jobs or dead heartbeats

**What CardioClaw provides (Phase 1):**
1. **YAML → Cron Translation** — Write clean YAML, run `cardioclaw sync`
2. **Heartbeat Discovery** — Auto-discover all heartbeats across OpenClaw
3. **Visual Dashboard** — Timeline showing all scheduled tasks

**Implementation Philosophy:** Simple, self-contained, like Antfarm. TypeScript + SQLite + React. No Docker, no Redis, no complexity.

---

## Feature 1: YAML → Cron Translation

### User Experience

**User writes YAML:**
```yaml
# cardioclaw.yaml
heartbeats:
  - name: Morning Briefing
    agent: beast
    schedule: "0 8 * * *"
    prompt: "Run morning briefing: weather + calendar + inbox"
    delivery: telegram

  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Reminder: Gym at 6 PM! 🏋️"
    sessionTarget: main
```

**One command:**
```bash
cardioclaw sync
# ✓ Created 2 OpenClaw cron jobs
```

### YAML Schema (Simple)

```yaml
heartbeats:
  - name: string           # Required: Unique job name
    schedule: string       # Required: "0 8 * * *" OR "at 2026-02-15 18:00"
    prompt: string         # For agentTurn (isolated session)
    message: string        # For systemEvent (main session)
    agent: string          # Optional: agent name
    delivery: string       # Optional: "telegram" | "none"
    sessionTarget: string  # Optional: "main" | "isolated"
    model: string          # Optional: model override
```

### Implementation

**Core logic:**
1. Parse YAML with `js-yaml`
2. Translate each heartbeat to OpenClaw cron format
3. Execute `openclaw cron add` for each entry
4. Store mapping in local SQLite (job name → OpenClaw cron id)

**Schedule translation:**
- Cron expression: `"0 8 * * *"` → `{ kind: "cron", expr: "0 8 * * *", tz: "America/New_York" }`
- One-shot: `at 2026-02-15 18:00` → `{ kind: "at", at: "2026-02-15T18:00:00-05:00" }`

**Definition of Done (F1):**
- ✅ `cardioclaw sync` reads `cardioclaw.yaml`
- ✅ Creates OpenClaw cron jobs via `openclaw cron add`
- ✅ Supports cron expressions and `at` timestamps
- ✅ Handles both `prompt` (agentTurn) and `message` (systemEvent)
- ✅ Stores job mappings in SQLite (`~/.cardioclaw/state.db`)
- ✅ Validates YAML schema, reports errors

---

## Feature 2: Heartbeat Discovery & Consolidation

### User Experience

**Check system health:**
```bash
cardioclaw status

# OUTPUT:
# 🫀 CardioClaw Status
# 
# Active (8 jobs):
#   Morning Briefing (beast)       Next: Tomorrow 8:00 AM    ✓
#   Evening Wrap-up (beast)        Next: Today 7:00 PM       ✗ Failed
#   Trello Sync                    Next: In 12 minutes       ✓
#   ...
#
# Failing (1):
#   Evening Wrap-up - Last error: timeout
#
# Managed by YAML (3) | Unmanaged (5)
```

### Architecture

**Discovery sources:**
1. **OpenClaw cron jobs** — Query `openclaw cron list --json`
2. **cardioclaw.yaml** — Local heartbeat definitions (source of truth)

**State storage:**
- SQLite database: `~/.cardioclaw/state.db`
- Tables:
  - `jobs` — All discovered OpenClaw cron jobs
  - `managed` — Jobs created by CardioClaw (from YAML)
  - `runs` — Historical run data (for timeline)

**Schema:**
```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,           -- OpenClaw cron job id
  name TEXT,
  schedule TEXT,
  agent TEXT,
  status TEXT,                   -- 'active' | 'failing' | 'disabled'
  next_run_at INTEGER,           -- Unix timestamp
  last_run_at INTEGER,
  last_status TEXT,              -- 'ok' | 'error'
  last_error TEXT,
  managed INTEGER DEFAULT 0      -- 1 if from cardioclaw.yaml
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  status TEXT,
  error TEXT
);
```

### Implementation

**Discovery process (runs on `sync` or `status`):**
```typescript
async function discover() {
  // 1. Fetch OpenClaw cron jobs
  const result = execSync('openclaw cron list --json', { encoding: 'utf-8' });
  const cronJobs = JSON.parse(result).jobs || [];

  // 2. Parse cardioclaw.yaml
  const yaml = YAML.parse(fs.readFileSync('cardioclaw.yaml', 'utf8'));
  const managedNames = new Set(yaml.heartbeats.map(h => h.name));

  // 3. Update SQLite
  const db = new Database('~/.cardioclaw/state.db');
  for (const job of cronJobs) {
    db.run(`
      INSERT OR REPLACE INTO jobs (id, name, schedule, status, next_run_at, managed)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      job.id,
      job.name,
      JSON.stringify(job.schedule),
      job.enabled ? 'active' : 'disabled',
      job.state?.nextRunAtMs,
      managedNames.has(job.name) ? 1 : 0
    ]);
  }
}
```

**CLI Commands:**
- `cardioclaw status` — Show consolidated view
- `cardioclaw discover` — Force refresh (usually automatic on sync)

### Definition of Done (F2)

- ✅ Discovers all OpenClaw cron jobs via `openclaw cron list`
- ✅ Consolidates with `cardioclaw.yaml` definitions
- ✅ Stores state in SQLite (`~/.cardioclaw/state.db`)
- ✅ Marks jobs as managed (from YAML) vs unmanaged
- ✅ `cardioclaw status` shows summary with next run times
- ✅ Flags failing jobs (last status = error)

---

## Feature 3: Visual Dashboard

### User Experience

**Start dashboard:**
```bash
cardioclaw dashboard
# Dashboard running at http://localhost:3333
```

**Browser shows:**
- Week-view timeline (Monday-Sunday)
- Each job appears as a bar on the timeline
- Color-coded by agent (Beast = blue, Gambit = purple, etc.)
- Click job → detail modal (last run, next run, logs)
- System health panel (jobs active, failing, next run)

### UI Design (Simple)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  🫀 CardioClaw Dashboard       [Refresh] Last: 1m ago   │
├─────────────────────────────────────────────────────────┤
│  ← Mon 2/10  |  Tue 2/11  |  Wed 2/12  |  Thu 2/13 →   │
│                                                          │
│  08:00  ━━━ Morning Briefing (beast) ✓                  │
│  09:00  ━━━ Work Calendar (rogue) ✓                     │
│  10:00  ┊┊┊ Trello Sync (every 30m) ✓✓✓                 │
│  12:00                                                   │
│  14:00  ━━━ Session Health ✓                            │
│  19:00  ━━━ Evening Wrap (beast) ✗ FAILED               │
│  22:00  ━━━ Security Review ✓                           │
│                                                          │
│  ┌─ System Health ─────────────────────────────────┐    │
│  │ ✓ 7 active  ✗ 1 failing  ⏱ Next: Trello (8m)  │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack (Antfarm-Style)

**Backend:**
- Express.js server (simple, no framework)
- Reads from SQLite (`state.db`)
- API routes:
  - `GET /api/heartbeats` — List all jobs
  - `GET /api/heartbeats/:id` — Job details
  - `GET /api/status` — System health summary

**Frontend:**
- React (or Preact for smaller bundle)
- Tailwind CSS for styling
- No complex state management (just fetch on mount + auto-refresh)
- Timeline component (CSS Grid)

**Deployment:**
- Single command: `cardioclaw dashboard`
- Starts Express server on port 3333
- Serves bundled React app from `/public`

### Implementation (Minimal)

**Backend (Express):**
```typescript
// server.ts
import express from 'express';
import Database from 'better-sqlite3';

const app = express();
const db = new Database('~/.cardioclaw/state.db');

app.get('/api/heartbeats', (req, res) => {
  const jobs = db.prepare('SELECT * FROM jobs ORDER BY next_run_at').all();
  res.json({ jobs });
});

app.get('/api/status', (req, res) => {
  const active = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'active'").get();
  const failing = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'failing'").get();
  const nextJob = db.prepare('SELECT * FROM jobs ORDER BY next_run_at LIMIT 1').get();
  res.json({ active: active.count, failing: failing.count, nextJob });
});

app.use(express.static('public'));
app.listen(3333, () => console.log('Dashboard: http://localhost:3333'));
```

**Frontend (React):**
```tsx
// Dashboard.tsx
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState({});

  useEffect(() => {
    fetch('/api/heartbeats').then(r => r.json()).then(d => setJobs(d.jobs));
    fetch('/api/status').then(r => r.json()).then(setStatus);
    const interval = setInterval(() => {
      // Auto-refresh every 30s
      fetch('/api/heartbeats').then(r => r.json()).then(d => setJobs(d.jobs));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl">🫀 CardioClaw Dashboard</h1>
      <StatusPanel status={status} />
      <Timeline jobs={jobs} />
    </div>
  );
}
```

**Timeline Component (Simple):**
- Group jobs by day
- Display as horizontal bars (CSS)
- Color by agent (map agent name → color)
- Click → show modal with details

### Definition of Done (F3)

- ✅ `cardioclaw dashboard` starts web server on localhost:3333
- ✅ Shows week-view timeline with all jobs
- ✅ Color-coded by agent
- ✅ Status indicators (✓ ok, ✗ failed)
- ✅ Click job → detail modal (schedule, last run, next run)
- ✅ System health panel (active/failing counts, next run countdown)
- ✅ Auto-refresh every 30 seconds
- ✅ Mobile-responsive (basic)

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|------------|-----|
| CLI | TypeScript + Commander.js | Clean CLI framework |
| Config | YAML (js-yaml) | Human-friendly |
| State | SQLite (better-sqlite3) | Simple, self-contained |
| Backend | Express.js | Lightweight, no framework bloat |
| Frontend | React + Tailwind | Fast to build, familiar |
| Integration | `child_process` exec | Call `openclaw cron` CLI |

**Dependencies:**
- `js-yaml` — YAML parsing
- `commander` — CLI framework
- `better-sqlite3` — SQLite driver
- `express` — Web server
- `react` / `react-dom` — UI
- `tailwindcss` — Styling

---

## Project Structure

```
cardioclaw/
├── bin/
│   └── cardioclaw.ts          # CLI entry point
├── src/
│   ├── commands/
│   │   ├── sync.ts            # cardioclaw sync
│   │   ├── status.ts          # cardioclaw status
│   │   └── dashboard.ts       # cardioclaw dashboard
│   ├── core/
│   │   ├── parser.ts          # YAML → OpenClaw translation
│   │   ├── discovery.ts       # Discover cron jobs
│   │   └── db.ts              # SQLite helpers
│   ├── server/
│   │   ├── index.ts           # Express app
│   │   └── routes.ts          # API endpoints
│   └── ui/
│       ├── components/
│       │   ├── Timeline.tsx
│       │   ├── JobCard.tsx
│       │   └── StatusPanel.tsx
│       ├── App.tsx
│       └── index.tsx
├── public/                    # Built React app
├── tests/
│   ├── parser.test.ts
│   └── discovery.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Timeline (2-3 Days)

### Day 1: Sync + Discovery
**Morning (4 hours):**
- Set up TypeScript project
- Implement YAML parser (`parser.ts`)
- Implement `cardioclaw sync` command
- Translate schedule formats (cron, at)
- Test with OpenClaw CLI

**Afternoon (4 hours):**
- Set up SQLite database (`db.ts`)
- Implement discovery (`discovery.ts`)
- Implement `cardioclaw status` command
- Test consolidation logic

### Day 2: Dashboard Backend + Frontend
**Morning (4 hours):**
- Set up Express server (`server/index.ts`)
- Implement API routes (`/api/heartbeats`, `/api/status`)
- Test API with curl

**Afternoon (4 hours):**
- Set up React app (`ui/`)
- Build Timeline component (CSS Grid layout)
- Build StatusPanel component
- Test rendering with mock data

### Day 3: Polish + Integration
**Morning (4 hours):**
- Integrate frontend with backend API
- Add auto-refresh (30s polling)
- Add click → detail modal
- Color-code by agent

**Afternoon (4 hours):**
- Mobile-responsive styling
- Error handling (YAML validation, CLI failures)
- Write README with examples
- Final testing (create 5+ test jobs, verify timeline)

**Total:** ~24 hours (3 days)

---

## Definition of Done (All Features)

### Feature 1: Sync
- ✅ `cardioclaw sync` reads YAML and creates cron jobs
- ✅ Supports cron expressions and `at` timestamps
- ✅ Validates YAML, reports errors

### Feature 2: Discovery
- ✅ `cardioclaw status` shows all jobs (managed + unmanaged)
- ✅ Flags failing jobs
- ✅ Stores state in SQLite

### Feature 3: Dashboard
- ✅ `cardioclaw dashboard` runs web server
- ✅ Timeline view with week schedule
- ✅ System health panel
- ✅ Auto-refresh every 30s

### Non-Functional
- ✅ Works on macOS and Linux
- ✅ TypeScript with strict mode
- ✅ Unit tests for parser and discovery
- ✅ README with installation + examples
- ✅ Installable via npm

---

## Out of Scope (Phase 1)

❌ Update/delete via YAML (must use `openclaw cron remove` manually)  
❌ Conflict detection (warns on duplicate names but doesn't prevent)  
❌ Historical analytics / charts  
❌ Edit jobs via dashboard UI (read-only for v1)  
❌ Multi-user / authentication  
❌ Notifications (use OpenClaw's built-in delivery)

*These can come in Phase 2 if needed.*

---

## Example YAML

```yaml
# cardioclaw.yaml - Dave's Heartbeats

heartbeats:
  # Morning briefing
  - name: Morning Briefing v3
    agent: beast
    schedule: "0 8 * * *"
    prompt: |
      Run morning briefing: weather + calendar + inbox.
      Keep it under 6 sentences.
    delivery: telegram

  # Evening wrap
  - name: Evening Wrap-up v3
    agent: beast
    schedule: "0 19 * * 1-5"  # Weekdays at 7 PM
    prompt: "Evening wrap: what got done today, what's tomorrow"
    delivery: telegram

  # Trello sync
  - name: Trello Sync
    schedule: "*/30 * * * *"  # Every 30 minutes
    prompt: "Sync Trello cards to mission-state.md"
    delivery: none

  # One-shot reminder
  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Reminder: Gym at 6 PM! 🏋️"
    sessionTarget: main
    delivery: telegram
```

---

## Success Metrics

**Phase 1 Success:** Can Dave:
1. Define heartbeats in YAML? ✅
2. Run `cardioclaw sync` and see jobs created? ✅
3. Open dashboard and see timeline? ✅
4. Spot failing jobs at a glance? ✅

**Phase 2 Goals:**
- Edit jobs via dashboard UI
- Conflict resolution on sync
- Historical run analytics
- Bulk operations (disable all, export)

---

*Antfarm-style simplicity: complete features, simple implementation. 3 days, 3 features, zero bloat.* 🫀
