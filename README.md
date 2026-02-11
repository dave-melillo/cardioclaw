# 🫀 CardioClaw

**YAML-based heartbeat orchestration for OpenClaw.**

Define recurring tasks in clean YAML, visualize them on a timeline dashboard, and monitor system health—all without touching JSON config files.

Inspired by [Antfarm](https://antfarm.cool) - simple, self-contained, shippable.

---

## Features

### 1. YAML → Cron Translation ✅
Write heartbeats in YAML, sync to OpenClaw cron jobs with one command.

### 2. Heartbeat Discovery ✅
Auto-discover all OpenClaw cron jobs, consolidate with YAML, track managed vs unmanaged.

### 3. Visual Dashboard ✅
Timeline view showing all scheduled tasks, color-coded by agent, with system health monitoring.

---

## Quick Start

### Install

```bash
cd /Users/dave/clawd/cardioclaw
npm install
npm link
```

### 1. Create config

Create `cardioclaw.yaml`:

```yaml
heartbeats:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run morning briefing: weather + calendar + inbox"
    delivery: telegram

  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Reminder: Gym at 6 PM! 🏋️"
    sessionTarget: main
    delivery: telegram
```

### 2. Sync

```bash
cardioclaw sync
```

```
📖 Reading: cardioclaw.yaml
🫀 Found 2 heartbeat(s)

✓ Created: Morning Briefing
✓ Created: Gym Reminder

✅ Summary:
  ✓ 2 job(s) created

🔍 Discovering heartbeats...
  Found 14 OpenClaw cron job(s)
  ✓ Updated state database
```

### 3. Check status

```bash
cardioclaw status
```

```
🫀 CardioClaw Status

📊 Active (14 jobs):

  📋 ✓ Morning Briefing (beast)
      Next: Tomorrow 8:00 AM
  📋 ✓ Gym Reminder
      Next: Today 6:00 PM
  ...

────────────────────────────────────────────────────────────
  Managed: 2 | Unmanaged: 12 | Failing: 0
  Next run: Gym Reminder in 3h 12m
```

### 4. Start dashboard

```bash
cardioclaw dashboard
```

```
🔍 Refreshing heartbeat data...
🫀 CardioClaw Dashboard
   → http://localhost:3333

Press Ctrl+C to stop
```

Open http://localhost:3333 to see the timeline!

---

## Commands

### `cardioclaw sync`

Read `cardioclaw.yaml` and create OpenClaw cron jobs.

**Options:**
- `-c, --config <path>` - Path to config file (default: `cardioclaw.yaml`)
- `--dry-run` - Show what would be created without executing

**Examples:**

```bash
# Sync with default config
cardioclaw sync

# Sync with custom config
cardioclaw sync --config my-heartbeats.yaml

# Dry run (preview without creating)
cardioclaw sync --dry-run
```

### `cardioclaw status`

Show all heartbeats and system health summary.

**Options:**
- `-c, --config <path>` - Path to config file (default: `cardioclaw.yaml`)
- `--no-refresh` - Skip discovery refresh

**Examples:**

```bash
# Show status (auto-refreshes)
cardioclaw status

# Show status without refreshing
cardioclaw status --no-refresh
```

### `cardioclaw discover`

Discover and refresh all OpenClaw cron jobs (updates state database).

**Options:**
- `-c, --config <path>` - Path to config file (default: `cardioclaw.yaml`)

**Example:**

```bash
cardioclaw discover
```

### `cardioclaw dashboard`

Start web dashboard at localhost:3333.

**Options:**
- `-c, --config <path>` - Path to config file (default: `cardioclaw.yaml`)
- `-p, --port <port>` - Port number (default: `3333`)

**Examples:**

```bash
# Start dashboard on default port
cardioclaw dashboard

# Start on custom port
cardioclaw dashboard --port 8080
```

---

## YAML Schema

```yaml
heartbeats:
  - name: string              # Required: Unique job name
    schedule: string          # Required: Cron expr OR "at YYYY-MM-DD HH:MM"
    
    # Payload (choose one):
    prompt: string            # For agentTurn (isolated session, runs agent)
    message: string           # For systemEvent (main session, text only)
    
    # Optional fields:
    delivery: string          # "telegram" | "discord" | "none" (default: none)
    sessionTarget: string     # "isolated" | "main" (default: isolated for prompt, main for message)
    model: string             # Model override (e.g., "opus", "sonnet")
    agent: string             # Agent name (for future multi-agent support)
```

### Schedule Formats

**Cron expressions:**
```yaml
schedule: "0 8 * * *"        # Daily at 8 AM
schedule: "0 19 * * 1-5"     # Weekdays at 7 PM
schedule: "0 */2 * * *"      # Every 2 hours
schedule: "0 9 * * MON"      # Mondays at 9 AM
```

**One-shot (absolute time):**
```yaml
schedule: at 2026-02-15 18:00   # Feb 15, 2026 at 6 PM
schedule: at 2026-02-20 09:30   # Feb 20, 2026 at 9:30 AM
```

(Timezone: America/New_York)

### Payload Types

**`prompt` (agentTurn):**
- Runs in isolated session
- Agent processes the prompt
- Result announced via `delivery` channel
- Use for: briefings, summaries, analysis

**`message` (systemEvent):**
- Injects text into main session
- No agent processing, just delivers text
- Use for: simple reminders, notifications

---

## Examples

See `examples/cardioclaw.yaml` for complete examples.

### Morning Briefing (Recurring)

```yaml
- name: Morning Briefing v3
  schedule: "0 8 * * *"
  prompt: |
    Run morning briefing:
    - Weather for today
    - Calendar events
    - Inbox summary
    Keep it under 6 sentences.
  delivery: telegram
```

### Evening Wrap-up (Weekdays Only)

```yaml
- name: Evening Wrap-up v3
  schedule: "0 19 * * 1-5"  # Mon-Fri at 7 PM
  prompt: "Evening wrap: what got done today, what's tomorrow"
  delivery: telegram
```

### One-Shot Reminder

```yaml
- name: Gym Reminder
  schedule: at 2026-02-15 18:00
  message: "Reminder: Gym at 6 PM! 🏋️"
  sessionTarget: main
  delivery: telegram
```

### Silent Health Check

```yaml
- name: Session Health Check
  schedule: "0 */2 * * *"
  prompt: "Check session health. Only alert if context over 80%."
  delivery: none
  sessionTarget: isolated
```

### Weekly Review

```yaml
- name: Weekly Review
  schedule: "0 17 * * 5"  # Fridays at 5 PM
  prompt: |
    Weekly review:
    - What got done this week?
    - What's priority for next week?
    - Any blockers or risks?
  delivery: telegram
  model: opus
```

---

## Dashboard

The dashboard provides a visual timeline of all heartbeats.

**Features:**
- Week-view timeline (sortable by agent)
- Color-coded by agent (Beast=blue, Gambit=purple, etc.)
- System health panel (active, failing, managed counts)
- Next run countdown
- Failing jobs alert
- Auto-refresh every 30 seconds
- Mobile responsive

**How to use:**

1. Start dashboard: `cardioclaw dashboard`
2. Open http://localhost:3333
3. View timeline, click jobs for details
4. Manual refresh button available

**API Endpoints:**
- `GET /api/heartbeats` - List all jobs
- `GET /api/heartbeats/:id` - Job details
- `GET /api/status` - System health summary
- `POST /api/refresh` - Trigger discovery refresh

---

## How It Works

### Architecture

**State Storage:** SQLite database at `~/.cardioclaw/state.db`

**Tables:**
- `jobs` - All discovered OpenClaw cron jobs
- `runs` - Historical run data (future)

**Discovery Process:**
1. Query `openclaw cron list --json`
2. Parse `cardioclaw.yaml` to identify managed jobs
3. Update SQLite with job data (status, next run, errors)
4. Mark managed vs unmanaged jobs

**Sync Process:**
1. Parse `cardioclaw.yaml`
2. For each heartbeat, build OpenClaw cron command
3. Execute `openclaw cron add` to create job
4. Run discovery to update state

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| CLI | Node.js + Commander | Clean CLI framework |
| Config | YAML (js-yaml) | Human-friendly |
| State | SQLite (better-sqlite3) | Simple, self-contained |
| Backend | Express.js | Lightweight, no bloat |
| Frontend | HTML + Tailwind + Vanilla JS | No build step, fast |
| Integration | child_process | Call OpenClaw CLI |

---

## Requirements

- **OpenClaw CLI** installed and configured (`openclaw --version`)
- **Node.js** 16+

---

## Installation

### Global (recommended)

```bash
npm install -g cardioclaw
cardioclaw sync
```

### Local (project-specific)

```bash
npm install cardioclaw
npx cardioclaw sync
```

### From source

```bash
git clone https://github.com/dave-melillo/cardioclaw
cd cardioclaw
npm install
npm link
cardioclaw sync
```

---

## Configuration

### Default locations

CardioClaw looks for config in this order:

1. `--config <path>` (if provided)
2. `./cardioclaw.yaml` (current directory)
3. `~/.cardioclaw/cardioclaw.yaml` (home directory)

### Recommended setup

Create `~/.cardioclaw/cardioclaw.yaml` with your heartbeats:

```bash
mkdir -p ~/.cardioclaw
cat > ~/.cardioclaw/cardioclaw.yaml <<EOF
heartbeats:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run morning briefing"
    delivery: telegram
EOF
```

Then run `cardioclaw sync` from anywhere.

---

## FAQ

### How do I see what jobs are running?

```bash
cardioclaw status
# or
openclaw cron list
```

### How do I remove a job?

```bash
openclaw cron remove --jobId <id>
```

Or remove from `cardioclaw.yaml` and manually delete via OpenClaw CLI.

### Can I update a heartbeat?

Not yet. For now, remove the old job and run `cardioclaw sync` again.

### What if I have duplicate job names?

OpenClaw allows multiple jobs with the same name. Make sure your `name` fields in YAML are unique.

### How do I test without creating jobs?

```bash
cardioclaw sync --dry-run
```

### What happens if sync fails?

CardioClaw prints errors for failed jobs and continues with remaining heartbeats. Exit code is 1 if any errors occurred.

### Can I run the dashboard in the background?

```bash
cardioclaw dashboard > dashboard.log 2>&1 &
```

Or use a process manager like `pm2`.

---

## Roadmap

**Phase 1 (Complete):**
- ✅ YAML → Cron translation
- ✅ Discovery & consolidation
- ✅ Visual dashboard

**Phase 2 (Future):**
- Update support (modify existing jobs from YAML)
- Delete orphaned jobs (in OpenClaw but not YAML)
- Dashboard: week navigation, job detail modal
- Dashboard: click to disable/enable jobs

**Phase 3 (Future):**
- Multi-agent support (route to specific agents)
- Interval schedules (`every: 2h`)
- Active hours (only run 9 AM - 10 PM)
- Conflict detection (warn if schedule overlap)

---

## License

MIT

---

## Credits

Built for **OpenClaw** by Dave Melillo.  
Inspired by [Antfarm](https://antfarm.cool).

---

**Simple, self-contained, shippable.** 🫀
