# PRD: CardioClaw Dashboard v2 - Terminal Aesthetic

**Feature ID:** CARDIO-004  
**Author:** Beast  
**Date:** 2026-02-14  
**Status:** Draft  
**Priority:** 4/5  
**Complexity:** M (Medium)  
**Parent:** CardioClaw Phase 3

---

## Problem Statement

Current dashboard (Phase 1) is functional but visually bland:
- Generic web UI (looks like every React admin panel)
- No personality or branding
- Limited views (week timeline only, no hourly granularity)
- Not optimized for mobile (Dave checks on phone)

**Dave's feedback:**
- "I want it to look like a hacker dashboard, not a SaaS app"
- "Give me lobster icons 🦞 everywhere"
- "Hourly view for daily heartbeats, calendar view for long-term"

---

## Design Vision: Terminal Aesthetic

**Reference UIs:**
- `htop` — process monitor (ASCII borders, monospace stats)
- `lazydocker` — Docker TUI (dark theme, box drawing chars)
- `k9s` — Kubernetes TUI (color-coded status, keyboard shortcuts)

**Core Elements:**
- **Dark theme** — near-black background (#0a0a0a), green/cyan accents
- **Monospace fonts** — `Fira Code`, `JetBrains Mono`, or `Courier New`
- **ASCII borders** — Box drawing characters (│ ─ ┌ ┐ └ ┘ ├ ┤)
- **Lobster branding** — 🦞 icon for each heartbeat, ASCII lobster art
- **Color-coded status:**
  - Green (ok): `#00ff41` (Matrix green)
  - Red (error): `#ff073a`
  - Yellow (warning): `#ffd700`
  - Cyan (info): `#00ffff`
  - Gray (disabled): `#666666`

**Typography:**
- Headings: Bold monospace, uppercase (e.g., `[ HEARTBEAT CENTRAL ]`)
- Body: Monospace, regular weight
- Status indicators: `✓` `✗` `⚠` `⏱` `🦞`

---

## UI Layout (Single Page, Three Views)

### View Switcher (Top Nav)

```
┌────────────────────────────────────────────────────────────────────────┐
│  🦞 CARDIOCLAW DASHBOARD                   [ HOURLY | CALENDAR | LIST ]│
└────────────────────────────────────────────────────────────────────────┘
```

**Three views:**
1. **Hourly** — 24-hour timeline (00:00 - 23:59), shows today's heartbeats
2. **Calendar** — 7-day week view, longer-term scheduling
3. **List** — Table of all heartbeats (current Phase 1 view, terminal-styled)

User toggles between views with buttons (or keyboard shortcuts: `1`, `2`, `3`).

---

## View 1: Hourly Timeline

**Use case:** "What's running today? When's the next heartbeat?"

### Layout

```
┌─ HOURLY VIEW ──────────────────────────────────────────────────────────┐
│  Today: Saturday, Feb 14, 2026                     [ ← Yesterday | Tomorrow → ]│
├────────────────────────────────────────────────────────────────────────┤
│  00:00 ┤                                                                │
│  01:00 ┤                                                                │
│  02:00 ┤                                                                │
│  03:00 ┤ 🦞 Monthly VPS Cleanup                                 ✓ 45s  │
│  04:00 ┤                                                                │
│  05:00 ┤ 🦞 Hourly Memory Summary                              ✓ 12s  │
│  06:00 ┤ 🦞 Hourly Memory Summary                              ✓ 11s  │
│  07:00 ┤ 🦞 Hourly Memory Summary                              ✓ 10s  │
│  08:00 ┤ 🦞 Morning Briefing v2                          ✓ 1m 26s     │
│  09:00 ┤ 🦞 Work Calendar Screenshot (Rogue)                    ✓ 32s  │
│  10:00 ┤ 🦞 Trello Sync                                         ✓ 8s   │
│        │ 🦞 Hourly Memory Summary                              ✓ 9s   │
│  11:00 ┤ 🦞 Hourly Memory Summary                              ✓ 11s  │
│  12:00 ┤ 🦞 Session Health Check                               ✓ 5s   │
│  13:00 ┤                                                                │
│  14:00 ┤ 🦞 Session Health Check                       ⏱ Next in 42m  │
│  15:00 ┤                                                                │
│  16:00 ┤ 🦞 Session Health Check                               (not run)│
│  17:00 ┤                                                                │
│  18:00 ┤                                                                │
│  19:00 ┤ 🦞 Evening Wrap-up v2                                 (not run)│
│  20:00 ┤                                                                │
│  21:00 ┤                                                                │
│  22:00 ┤ 🦞 Weekly Security Review                             (not run)│
│  23:00 ┤                                                                │
├────────────────────────────────────────────────────────────────────────┤
│  ✓ 9 completed  ⏱ 1 upcoming  ✗ 0 failed                       [REFRESH]│
└────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Hour markers** — 00:00 to 23:00 (left column)
- **Heartbeat entries** — `🦞 Job Name` + status/duration
- **Status indicators:**
  - `✓ 1m 26s` — completed successfully (green text)
  - `✗ timeout` — failed (red text)
  - `⏱ Next in 42m` — upcoming (cyan text)
  - `(not run)` — scheduled but hasn't executed (gray)
- **Multiple jobs per hour** — stacked vertically
- **Day navigation** — `← Yesterday | Tomorrow →` buttons
- **Click job** → detail modal (execution history, logs)

**Mobile responsive:**
- On small screens, show 6-hour chunks (00:00-05:59, 06:00-11:59, etc.)
- Swipe left/right to navigate hours

---

## View 2: Calendar (7-Day Week View)

**Use case:** "What's scheduled this week? Any conflicts?"

### Layout

```
┌─ CALENDAR VIEW ────────────────────────────────────────────────────────┐
│  Week of Feb 10-16, 2026                      [ ← Prev Week | Next Week → ]│
├───────┬───────┬───────┬───────┬───────┬───────┬───────────────────────┐
│  MON  │  TUE  │  WED  │  THU  │  FRI  │  SAT  │  SUN                  │
│ 02/10 │ 02/11 │ 02/12 │ 02/13 │ 02/14 │ 02/15 │ 02/16                 │
├───────┼───────┼───────┼───────┼───────┼───────┼───────────────────────┤
│       │       │       │       │       │ TODAY │                       │
│ 08:00 │ 08:00 │ 08:00 │ 08:00 │ 08:00 │ 08:00 │ 08:00                 │
│ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞                    │
│       │       │       │       │       │       │                       │
│ 09:00 │ 09:00 │ 09:00 │ 09:00 │ 09:00 │       │                       │
│ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │       │                       │
│       │       │       │       │       │       │                       │
│ 10:00 │ 10:00 │ 10:00 │ 10:00 │ 10:00 │ 10:00 │ 10:00                 │
│ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ✓  │ 🦞 ⏱  │       │                       │
│       │       │       │       │       │       │                       │
│ 19:00 │ 19:00 │ 19:00 │ 19:00 │ 19:00 │       │                       │
│ 🦞 ✓  │ 🦞 ✗  │ 🦞 ✓  │ 🦞 ✓  │ 🦞     │       │                       │
│       │       │       │       │       │       │                       │
│ 22:00 │       │       │       │       │       │ 22:00                 │
│       │       │       │       │       │       │ 🦞                    │
├───────┴───────┴───────┴───────┴───────┴───────┴───────────────────────┤
│  💚 38 ok  ❌ 1 failed  ⏱ 5 upcoming                          [REFRESH]│
└────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **7-day grid** — Mon-Sun, each day is a column
- **Hour rows** — Only show hours with heartbeats (sparse)
- **Lobster icons** — Color-coded:
  - 🦞 Green = completed ok
  - 🦞 Red = failed
  - 🦞 Cyan = upcoming
  - 🦞 Gray = scheduled (future, not run)
- **Click cell** → show all jobs for that hour in modal
- **Week navigation** — `← Prev Week | Next Week →`
- **Today highlight** — bold border around current day

**Mobile responsive:**
- Show 3 days at a time (swipe for more)
- Or stack days vertically (scrollable list)

---

## View 3: List (Enhanced Table)

**Use case:** "Show me all heartbeats with success rates."

### Layout

```
┌─ LIST VIEW ────────────────────────────────────────────────────────────┐
│  Filter: [ All | Active | Failing | One-Shots ]         Sort: [ Name ▼ ]│
├────────────────────────────────────────────────────────────────────────┤
│  NAME                          SCHEDULE         NEXT RUN      SUCCESS   │
├────────────────────────────────────────────────────────────────────────┤
│  🦞 Morning Briefing v2         0 8 * * *       Tomorrow 8AM   95% ✓    │
│  🦞 Evening Wrap-up v2          0 19 * * 1-5    Today 7PM      92% ⚠    │
│  🦞 Trello Sync                 */30 * * * *    In 12m         98% ✓    │
│  🦞 Session Health Check        0 */2 * * *     In 1h 42m      100% ✓   │
│  🦞 Hourly Memory Summary       5 * * * *       In 3m          97% ✓    │
│  🦞 Work Calendar Screenshot    0 9 * * 1-5     Monday 9AM     94% ✓    │
│  🦞 Weekly Security Review      0 22 * * 0      Tomorrow 10PM  100% ✓   │
│  🦞 Monthly VPS Cleanup         0 3 1 * *       Mar 1 3AM      100% ✓   │
│  🦞 Gym Reminder                at 2026-02-15   Tomorrow 6PM   -- (new) │
├────────────────────────────────────────────────────────────────────────┤
│  9 heartbeats  •  8 active  •  0 failing  •  1 one-shot        [REFRESH]│
└────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Table columns:**
  - Name (🦞 + job name)
  - Schedule (cron expression or "at" time)
  - Next Run (relative time: "In 12m", "Tomorrow 8AM")
  - Success Rate (last 7 days, with indicator ✓ ⚠ ✗)
- **Filters:** All | Active | Failing | One-Shots
- **Sorting:** Name, Schedule, Next Run, Success Rate
- **Click row** → detail modal (execution history)
- **Color-coded success rates:**
  - Green (>90%): ✓
  - Yellow (70-90%): ⚠
  - Red (<70%): ✗

**Mobile responsive:**
- Show 2-column layout: Name + Next Run
- Success rate shown as badge on name

---

## Health Panel (Bottom, Always Visible)

**Persistent footer across all views:**

```
┌─ SYSTEM HEALTH ────────────────────────────────────────────────────────┐
│  ✓ 7 active  •  ✗ 1 failing  •  ⏱ Next: Trello Sync in 12m  •  💚 94% │
│  [Last sync: 2m ago]                                        [SYNC NOW] │
└────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **KPIs:** Active jobs, failing jobs, next run countdown, overall success rate
- **Sync status:** "Last sync: 2m ago" (auto-refresh every 30s)
- **Manual sync:** "SYNC NOW" button (calls `/api/sync`)
- **Always visible** — sticky footer

---

## Detail Modal (Click Any Heartbeat)

**Opens when user clicks a job from any view:**

```
┌─ HEARTBEAT DETAILS ────────────────────────────────────────────────────┐
│  🦞 Morning Briefing v2                                         [ CLOSE ]│
├────────────────────────────────────────────────────────────────────────┤
│  Schedule:     0 8 * * * (Daily at 8:00 AM America/New_York)           │
│  Agent:        beast                                                   │
│  Delivery:     telegram → YOUR_CHAT_ID                                 │
│  Next Run:     Tomorrow at 8:00 AM (in 15h 14m)                        │
│  Last Run:     Today at 8:00 AM (✓ ok, 1m 26s)                         │
│  Success Rate: 95% (19/20 last 7 days)                                 │
├─ EXECUTION HISTORY ────────────────────────────────────────────────────┤
│  Feb 14, 08:00 AM   ✓ ok       1m 26s                                  │
│  Feb 13, 08:00 AM   ✓ ok       1m 42s                                  │
│  Feb 12, 08:00 AM   ✓ ok       1m 31s                                  │
│  Feb 11, 08:00 AM   ✓ ok       1m 13s                                  │
│  Feb 10, 08:00 AM   ✗ error    2m 0s   "timeout"                       │
│  Feb 09, 08:00 AM   ✓ ok       1m 18s                                  │
│  ...                                                                    │
│                                                           [SHOW MORE ▼] │
├────────────────────────────────────────────────────────────────────────┤
│  Prompt:                                                               │
│  Run the morning briefing: weather + calendar + inbox.                │
│  Keep it under 6 sentences.                                            │
├────────────────────────────────────────────────────────────────────────┤
│  [EDIT YAML]  [RUN NOW]  [DISABLE]                                     │
└────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Job metadata** (schedule, agent, delivery, next/last run)
- **Execution history** (last 20 runs, with expand button)
- **Prompt display** (read-only for Phase 3)
- **Actions:**
  - "EDIT YAML" → open `cardioclaw.yaml` in editor (future)
  - "RUN NOW" → trigger job immediately (`openclaw cron run <id>`)
  - "DISABLE" → disable job (`openclaw cron update <id> --enabled false`)

---

## ASCII Art Branding (Optional Easter Egg)

**Show on first load or 404 pages:**

```
    .-") _
   /   j '-.
  (   /  )-'         🦞 CARDIOCLAW
   )  |  _/
  /   j  ;
 (   '`-'
  ) `-'
   '`-._

  [ Heartbeat orchestration for OpenClaw ]
```

---

## Tech Stack (Frontend Only)

**No backend changes — reuse Phase 2 APIs.**

| Component | Technology | Notes |
|-----------|------------|-------|
| **Framework** | React 18 | Keep existing setup |
| **Styling** | Tailwind CSS + custom dark theme | Terminal color palette |
| **Fonts** | `Fira Code` or `JetBrains Mono` | Monospace with ligatures |
| **Icons** | 🦞 emoji + ASCII chars (│ ─ ┌ etc.) | No icon library needed |
| **State** | React hooks (useState, useEffect) | No Redux (keep simple) |
| **Routing** | None (single page, view switcher) | Client-side only |
| **Build** | Vite | Fast dev server |

**CSS Variables (Dark Theme):**
```css
:root {
  --bg-primary: #0a0a0a;      /* Near-black background */
  --bg-secondary: #1a1a1a;    /* Card backgrounds */
  --border: #333333;          /* ASCII borders */
  --text-primary: #00ff41;    /* Matrix green */
  --text-secondary: #cccccc;  /* Light gray text */
  --status-ok: #00ff41;       /* Green */
  --status-error: #ff073a;    /* Red */
  --status-warn: #ffd700;     /* Yellow */
  --status-info: #00ffff;     /* Cyan */
  --status-disabled: #666666; /* Gray */
}
```

**Font Stack:**
```css
body {
  font-family: 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
  background: var(--bg-primary);
  color: var(--text-secondary);
}
```

---

## Component Structure

```
src/ui/
├── App.tsx                     # Main container
├── components/
│   ├── ViewSwitcher.tsx        # [ HOURLY | CALENDAR | LIST ]
│   ├── HourlyView.tsx          # 24-hour timeline
│   ├── CalendarView.tsx        # 7-day grid
│   ├── ListView.tsx            # Table view
│   ├── HealthPanel.tsx         # System health footer
│   ├── DetailModal.tsx         # Job detail popup
│   └── shared/
│       ├── LobsterIcon.tsx     # 🦞 with status color
│       ├── ASCIIBox.tsx        # Terminal-style borders
│       └── StatusBadge.tsx     # ✓ ✗ ⚠ indicators
├── hooks/
│   ├── useHeartbeats.ts        # Fetch /api/heartbeats
│   ├── useRuns.ts              # Fetch /api/runs
│   └── useStatus.ts            # Fetch /api/status
├── styles/
│   └── terminal.css            # Dark theme, ASCII styles
└── utils/
    ├── formatTime.ts           # "In 12m", "Tomorrow 8AM"
    └── calculateSuccessRate.ts # 95% (19/20)
```

---

## Mobile Responsive Breakpoints

**Desktop (>1024px):**
- Show all views full-width
- Calendar: 7-day grid
- Hourly: Full 24-hour timeline

**Tablet (768px - 1024px):**
- Calendar: 5-day grid (Mon-Fri)
- Hourly: Full timeline, slightly condensed

**Mobile (<768px):**
- Calendar: 3-day view, swipe for more
- Hourly: 6-hour chunks, swipe navigation
- List: 2-column (Name + Next Run)
- Health panel: Stacked vertically

---

## Keyboard Shortcuts (Power User Feature)

**Global:**
- `1` — Switch to Hourly view
- `2` — Switch to Calendar view
- `3` — Switch to List view
- `r` — Refresh (manual sync)
- `/` — Focus search/filter
- `Esc` — Close modal

**Hourly/Calendar:**
- `←` / `→` — Navigate days/weeks
- `j` / `k` — Scroll down/up (vim-style)

**List view:**
- `Enter` — Open detail modal for selected row
- `↑` / `↓` — Navigate rows

---

## Definition of Done

### Functional Requirements
- ✅ Three views: Hourly, Calendar, List (switchable with buttons)
- ✅ Hourly view: 24-hour timeline with lobster icons, status indicators
- ✅ Calendar view: 7-day grid, color-coded jobs
- ✅ List view: Table with success rates, filters, sorting
- ✅ Health panel: KPIs, last sync time, manual sync button
- ✅ Detail modal: Execution history, job metadata, actions (Run Now, Disable)
- ✅ Mobile responsive (breakpoints for phone/tablet/desktop)
- ✅ Dark theme with terminal aesthetic (monospace, ASCII borders)
- ✅ Auto-refresh every 30 seconds

### Visual Requirements
- ✅ Monospace font (`Fira Code` or `JetBrains Mono`)
- ✅ Dark background (#0a0a0a), green/cyan accents
- ✅ ASCII box drawing characters for borders
- ✅ Lobster icons (🦞) for each heartbeat
- ✅ Color-coded status: green (ok), red (error), cyan (upcoming)
- ✅ Looks like `htop` / `lazydocker` (terminal TUI aesthetic)

### Non-Functional
- ✅ Page load < 2s
- ✅ No framework bloat (keep bundle < 500KB)
- ✅ Works on Safari iOS (Dave's mobile browser)
- ✅ Keyboard shortcuts functional (1/2/3, r, Esc)

### Out of Scope (Phase 3)
- ❌ YAML editing in UI (opens external editor for now)
- ❌ Real-time WebSocket updates (polling only)
- ❌ Notifications (use OpenClaw delivery)
- ❌ User authentication (single-user for now)

---

## Timeline

**Estimated effort:** 2-3 days

**Breakdown:**
- Day 1: Dark theme + terminal CSS, Hourly view component
- Day 2: Calendar view, List view enhancements
- Day 3: Detail modal, mobile responsive, keyboard shortcuts, polish

**Total:** ~20 hours (2.5 days)

---

## Success Metrics

**Phase 3 Success:**
- Dave opens dashboard on phone → looks slick, loads fast
- Hourly view shows today's heartbeats at a glance
- Calendar view spots scheduling conflicts (3 jobs at 8 AM)
- Terminal aesthetic feels "hacker-y", not generic
- Lobster icons make Dave smile

**Future (Phase 4):**
- In-UI YAML editing (CodeMirror with syntax highlighting)
- WebSocket real-time updates (no polling)
- Alert inbox (failed jobs highlighted on dashboard load)
- ASCII lobster animation on page load

---

## Wireframe Examples (ASCII Mockups)

**Hourly View (Mobile):**
```
┌─ HOURLY VIEW ──────────────┐
│ Sat, Feb 14     [ ← | → ]  │
├────────────────────────────┤
│ 08:00 🦞 Morning Brief  ✓  │
│ 09:00 🦞 Work Calendar  ✓  │
│ 10:00 🦞 Trello Sync    ⏱  │
│ 12:00 🦞 Health Check   ✓  │
│ 14:00 🦞 Health Check  (−) │
│ 19:00 🦞 Evening Wrap  (−) │
├────────────────────────────┤
│ ✓ 4  ⏱ 1  ✗ 0    [REFRESH]│
└────────────────────────────┘
```

**Calendar View (Desktop):**
```
┌─ CALENDAR VIEW ─────────────────────────────────────────────────────┐
│  Week of Feb 10-16, 2026               [ ← Prev Week | Next Week → ]│
├─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────────────────────┐
│ MON │ TUE │ WED │ THU │ FRI │ SAT │ SUN │                         │
│ 2/10│ 2/11│ 2/12│ 2/13│ 2/14│ 2/15│ 2/16│                         │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                         │
│ 08  │ 08  │ 08  │ 08  │ 08  │ 08  │ 08  │                         │
│ 🦞✓ │ 🦞✓ │ 🦞✓ │ 🦞✓ │ 🦞✓ │ 🦞✓ │ 🦞  │                         │
│ 09  │ 09  │ 09  │ 09  │ 09  │     │     │                         │
│ 🦞✓ │ 🦞✓ │ 🦞✓ │ 🦞✓ │ 🦞✓ │     │     │                         │
│ 19  │ 19  │ 19  │ 19  │ 19  │     │     │                         │
│ 🦞✓ │ 🦞✗ │ 🦞✓ │ 🦞✓ │ 🦞  │     │     │                         │
├─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────────────────────────┤
│  💚 38 ok  ❌ 1 failed  ⏱ 5 upcoming                     [REFRESH] │
└─────────────────────────────────────────────────────────────────────┘
```

---

*Terminal aesthetic. Lobster branding. Three views. Zero fluff. This is the way.* 🦞
