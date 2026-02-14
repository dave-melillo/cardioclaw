# 🫀 CardioClaw

**YAML-based heartbeat orchestration for OpenClaw.**

Define recurring tasks in clean YAML, sync to OpenClaw cron jobs with one command, and visualize everything on a timeline dashboard.

Inspired by [Antfarm](https://antfarm.cool) — simple, self-contained, shippable.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/dave-melillo/cardioclaw/main/scripts/install.sh | bash
```

v0.1.0

Paste in your terminal, or ask your OpenClaw to run it.

**Requirements:** Node.js 16+ and OpenClaw CLI installed.

<details>
<summary>Manual install</summary>

```bash
git clone https://github.com/dave-melillo/cardioclaw
cd cardioclaw
npm install
npm link
```

</details>

---

## Quick Start

### Already have OpenClaw cron jobs?

Import them into your YAML with one command:

```bash
cardioclaw import
```

```
🔍 Fetching OpenClaw cron jobs...
   Found 12 job(s)

📊 Import summary:
   → 12 new heartbeat(s) to add

✅ Imported 12 heartbeat(s)
   Written to: /Users/dave/.cardioclaw/cardioclaw.yaml
```

Now all your existing heartbeats are in one YAML file. Edit, review, and manage from there.

---

### Starting fresh? Create your heartbeats

```bash
nano ~/.cardioclaw/cardioclaw.yaml
```

```yaml
heartbeats:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run morning briefing: weather, calendar, inbox"
    delivery: telegram

  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Reminder: Gym at 6 PM! 🏋️"
    sessionTarget: main
    delivery: telegram
```

### 2. Sync to OpenClaw

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

### 4. Launch dashboard

```bash
cardioclaw dashboard
```

```
🫀 CardioClaw Dashboard
   → http://localhost:3333

Press Ctrl+C to stop
```

Open http://localhost:3333 to see the timeline.

---

## YAML Schema

```yaml
heartbeats:
  - name: string              # Required: Unique job name
    schedule: string          # Required: Cron expr OR "at YYYY-MM-DD HH:MM"
    
    # Payload (choose one):
    prompt: string            # For agentTurn — runs agent in isolated session
    message: string           # For systemEvent — injects text into main session
    
    # Optional:
    delivery: string          # "telegram" | "discord" | "none" (default: none)
    sessionTarget: string     # "isolated" | "main" (auto-detected from payload)
    model: string             # Model override (e.g., "opus", "sonnet")
    agent: string             # Agent name (for multi-agent setups)
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
```

Timezone: America/New_York

---

## Commands

| Command | Description |
|---------|-------------|
| `cardioclaw import` | Import existing OpenClaw cron jobs into YAML |
| `cardioclaw sync` | Read YAML, create OpenClaw cron jobs |
| `cardioclaw status` | Show all heartbeats and system health |
| `cardioclaw discover` | Refresh all OpenClaw cron jobs |
| `cardioclaw dashboard` | Start web dashboard at localhost:3333 |
| `cardioclaw prune` | Remove old completed one-shot heartbeats from YAML |

**Options:**
- `-c, --config <path>` — Path to config file (default: `cardioclaw.yaml`)
- `--dry-run` — Preview without making changes (import/sync/prune)
- `-p, --port <port>` — Dashboard port (default: 3333)
- `--days <n>` — Remove completed jobs older than N days (prune)
- `--before <date>` — Remove completed jobs before date YYYY-MM-DD (prune)

---

## Examples

### Morning Briefing (Recurring)

```yaml
- name: Morning Briefing
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
- name: Evening Wrap-up
  schedule: "0 19 * * 1-5"
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

**One-Shot Lifecycle:**
1. **Before execution:** Shows in `cardioclaw status` under "Upcoming One-Shots"
2. **After execution:** Automatically moved to `heartbeats_completed:` section in YAML
3. **Cleanup:** Run `cardioclaw prune --days 30` to remove old completed entries

**Example of auto-archived one-shot:**
```yaml
heartbeats_completed:
  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    executed_at: 2026-02-15T18:00:05-05:00
    status: ok
    message: "Reminder: Gym at 6 PM! 🏋️"
```

### Weekly Review

```yaml
- name: Weekly Review
  schedule: "0 17 * * 5"
  prompt: |
    Weekly review:
    - What got done this week?
    - What's priority for next week?
    - Any blockers?
  delivery: telegram
  model: opus
```

---

## Dashboard

Timeline view of all scheduled heartbeats with system health monitoring.

**Features:**
- Week-view timeline, color-coded by agent
- System health panel (active, failing, managed counts)
- Next run countdown
- Auto-refresh every 30 seconds
- Mobile responsive

**API Endpoints:**
- `GET /api/heartbeats` — List all jobs
- `GET /api/status` — System health summary
- `POST /api/refresh` — Trigger discovery refresh

---

## How It Works

**State Storage:** SQLite at `~/.cardioclaw/state.db`

**Sync:** Parse YAML → call `openclaw cron add` for each heartbeat

**Discovery:** Query `openclaw cron list` → update SQLite → mark managed vs unmanaged

**Tech Stack:** Node.js, Commander, SQLite (better-sqlite3), Express, Tailwind

---

## Uninstall

```bash
npm unlink -g cardioclaw
rm -rf ~/.cardioclaw
```

---

## License

MIT

---

Built for **OpenClaw** by Dave Melillo.

**Simple, self-contained, shippable.** 🫀
