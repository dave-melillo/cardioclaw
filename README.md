<p align="center">
  <img src="assets/logo.png" alt="CardioClaw" width="300">
</p>

<h1 align="center">🫀 CardioClaw</h1>

<p align="center">
  <strong>Sync and visualization tool for OpenClaw scheduled assets.</strong>
</p>

CardioClaw is a **read-only lens** into OpenClaw's scheduling infrastructure. It reads from OpenClaw's native config files and presents a unified dashboard of all scheduled assets—heartbeats and cron jobs together.

**v1.0:** Read-only sync model. OpenClaw is the source of truth.

---

## What Changed in 1.0

CardioClaw no longer creates or modifies OpenClaw configs. Instead:

- **DISCOVER** — Scan OpenClaw configs, report counts
- **SYNC** — Transform heartbeats + cron jobs into unified `cardioclaw.yml`
- **DASHBOARD** — Web UI showing all scheduled assets
- **VALIDATE** — Detect config issues without modifying files

**Why?** The previous approach (managing jobs in parallel) caused sync drift, duplicate job creation, and config corruption. The new architecture treats OpenClaw as the single source of truth.

---

## Install

```bash
npm install -g cardioclaw
```

**Requirements:** Node.js 18+ and OpenClaw CLI installed.

---

## Quick Start

```bash
# 1. Discover what's scheduled
cardioclaw discover

# 2. Generate unified cardioclaw.yml
cardioclaw sync

# 3. Launch the dashboard
cardioclaw dashboard
```

---

## Commands

### `cardioclaw discover`

Read-only scan of OpenClaw configs. Reports counts of heartbeats and cron jobs.

```bash
$ cardioclaw discover

🔍 CardioClaw Discover

📍 Heartbeats (from openclaw.json)
  • wolverine: 15m
  • beast: 30m
  Total: 2 heartbeat(s)

📍 Cron Jobs (from cron/jobs.json)
  Enabled:  47
  Disabled: 1
  Failing:  2
  Total: 48 cron job(s)

📊 Summary
   Heartbeats: 2
   Cron Jobs:  48
   Total:      50
```

### `cardioclaw sync`

Read OpenClaw configs and write a unified `cardioclaw.yml` file.

```bash
cardioclaw sync                        # Write to ./cardioclaw.yml
cardioclaw sync --output ~/status.yml  # Custom output path
```

**Data Sources:**
- Heartbeats: `~/.openclaw/openclaw.json`
- Cron jobs: `~/.openclaw/cron/jobs.json`

**Output:** Unified YAML with:
- All heartbeats and cron jobs in one format
- Schedule, timezone, model, agent info
- State (next run, last run, status)
- Validation warnings

### `cardioclaw dashboard`

Launch a web-based dashboard showing all scheduled assets.

```bash
cardioclaw dashboard              # Local only (port 3333)
cardioclaw dashboard --port 8080  # Custom port
cardioclaw dashboard --remote     # Enable network access
cardioclaw dashboard --daemon     # Run in background
```

**Features:**
- List view of all heartbeats and cron jobs
- Filter by type (heartbeat/cron)
- Sort by next run time
- Visual indicators for enabled/disabled/failing

### `cardioclaw validate`

Detect and report config issues without modifying files.

```bash
cardioclaw validate          # Basic check
cardioclaw validate --verbose  # Show all warnings
```

**Validation Rules:**
- `announce` mode without `accountId` → warning
- Prompt contains `message()` with announce mode → warning (double-send)
- Duplicate schedules → warning
- Missing HEARTBEAT.md → warning
- Invalid cron expressions → error

---

## Unified Data Model

CardioClaw transforms heartbeats and cron jobs into a unified "Cardio" format:

```yaml
cardios:
  - id: wolverine-heartbeat
    name: Wolverine Heartbeat
    type: heartbeat
    enabled: true
    schedule: 15m
    timezone: America/New_York
    model: claude-sonnet-4-5
    agentId: wolverine
    state:
      nextRunAt: 1772559600000
      lastStatus: ok
    
  - id: abc123-def456
    name: Daily Standup
    type: cron
    enabled: true
    schedule: "0 9 * * 1-5"
    timezone: America/New_York
    model: claude-sonnet-4-5
    agentId: main
    delivery:
      mode: announce
      channel: discord
      to: channel:123456
    state:
      nextRunAt: 1772559600000
      lastRunAt: 1772473200000
      lastStatus: ok
```

---

## Managing Jobs

CardioClaw is **read-only**. To create, modify, or delete scheduled jobs, use OpenClaw's native tools:

```bash
# Create a cron job
openclaw cron add --name "My Job" --schedule "0 9 * * *" --message "Hello"

# Edit a cron job
openclaw cron edit <job-id> --enabled false

# Remove a cron job
openclaw cron rm <job-id>

# Configure heartbeats (in openclaw.json)
# agents.list[].heartbeat.every = "15m"
```

Then run `cardioclaw sync` to update your unified view.

---

## Removed Commands (from v0.x)

The following commands have been removed in v1.0:

- `cardioclaw import` — Use OpenClaw native tools
- `cardioclaw export` — No longer needed
- `cardioclaw dedupe` — Use OpenClaw cron management
- `cardioclaw remove` — Use `openclaw cron rm <id>`
- `cardioclaw prune` — No longer writing to OpenClaw

---

## Configuration

CardioClaw reads from standard OpenClaw paths:

| File | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Agent configs with heartbeat settings |
| `~/.openclaw/cron/jobs.json` | Cron job definitions and state |

Override with `$OPENCLAW_HOME` environment variable.

---

## License

MIT
