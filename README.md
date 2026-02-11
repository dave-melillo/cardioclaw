# 🫀 CardioClaw

**YAML to OpenClaw cron sync tool.**

Define recurring tasks (heartbeats) in clean YAML, sync them to OpenClaw cron jobs with one command.

Inspired by [Antfarm](https://antfarm.cool) - simple, contained, shippable.

---

## Quick Start

### 1. Install

```bash
npm install -g cardioclaw
```

Or use without installing:
```bash
npx cardioclaw sync
```

### 2. Create config

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

### 3. Sync

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

That's it! Your heartbeats are now running as OpenClaw cron jobs.

---

## What It Does

CardioClaw reads YAML heartbeat definitions and creates OpenClaw cron jobs. Each heartbeat becomes a scheduled task that:

- **Recurring tasks** (cron expressions): Run morning briefings, evening wrap-ups, health checks, etc.
- **One-shot reminders** (absolute timestamps): "Gym at 6 PM", "Meeting tomorrow at 2 PM"
- **Prompt-based** (agentTurn): Run in isolated sessions, announce results to Telegram/Discord/etc.
- **Message-based** (systemEvent): Inject text into main session (simple reminders)

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
    sessionTarget: string     # "isolated" | "main" (default: isolated)
    model: string             # Model override (e.g., "opus", "sonnet")
    agent: string             # Agent name (future: for multi-agent)
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

(Timezone: Uses your local timezone, converted to ISO 8601 for OpenClaw)

### Payload Types

**`prompt` (agentTurn):**
- Runs in isolated session
- Agent processes the prompt
- Result can be announced via `delivery` channel
- Use for: briefings, summaries, analysis

**`message` (systemEvent):**
- Injects text into main session
- No agent processing, just delivers the text
- Use for: simple reminders, notifications

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

### Health Check (Silent)

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

## Commands

### `cardioclaw sync`

Read `cardioclaw.yaml` and create OpenClaw cron jobs.

**Options:**
- `-c, --config <path>` - Path to config file (default: `cardioclaw.yaml`)
- `--dry-run` - Show what would be created without executing

**Config search order:**
1. `--config` path (if provided)
2. `./cardioclaw.yaml` (current directory)
3. `~/.cardioclaw/cardioclaw.yaml` (home directory)

**Examples:**

```bash
# Sync with default config
cardioclaw sync

# Sync with custom config
cardioclaw sync --config my-heartbeats.yaml

# Dry run (show what would be created)
cardioclaw sync --dry-run
```

---

## How It Works

1. **Parse YAML** → CardioClaw reads your heartbeat definitions
2. **Translate** → Each heartbeat becomes an `openclaw cron add` command
3. **Execute** → Commands are executed to create cron jobs
4. **Summary** → Print results (jobs created, errors)

**Under the hood:**

```yaml
# This YAML...
- name: Morning Briefing
  schedule: "0 8 * * *"
  prompt: "Run morning briefing"
  delivery: telegram
```

```bash
# ...becomes this OpenClaw command:
openclaw cron add \
  --name "Morning Briefing" \
  --schedule.kind cron \
  --schedule.expr "0 8 * * *" \
  --schedule.tz "America/New_York" \
  --payload.kind agentTurn \
  --payload.message "Run morning briefing" \
  --sessionTarget isolated \
  --delivery.mode announce \
  --delivery.channel telegram
```

---

## Requirements

- **OpenClaw CLI** installed and configured (`openclaw --version` should work)
- **Node.js** 16+ (for running CardioClaw)

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
openclaw cron list
```

### How do I remove a job?

```bash
openclaw cron remove --jobId <id>
```

### Can I update a heartbeat without recreating it?

Not yet. For now, remove the old job and run `cardioclaw sync` again to recreate.

### What if I have duplicate job names?

OpenClaw will create multiple jobs with the same name. Make sure your `name` fields are unique.

### How do I test without creating jobs?

```bash
cardioclaw sync --dry-run
```

### What happens if sync fails?

CardioClaw prints errors for failed jobs and continues with remaining heartbeats. Exit code is 1 if any errors occurred.

---

## Roadmap (Future)

**v0.2:**
- `cardioclaw status` - List all jobs created by CardioClaw
- `cardioclaw rm <name>` - Remove job by name
- Conflict detection (warn if job already exists)

**v0.3:**
- Update support (modify existing jobs)
- Orphan detection (find jobs not in YAML)
- Interval schedules (`every: 2h`)

**v1.0:**
- Dashboard (web UI for viewing/editing heartbeats)
- Discovery service (announce heartbeats to network)
- Active hours (only run between 9 AM - 10 PM)

---

## License

MIT

---

## Credits

Built for **OpenClaw** by Dave Melillo.  
Inspired by [Antfarm](https://antfarm.cool).

---

**That's it. Simple, contained, shippable.** 🫀
