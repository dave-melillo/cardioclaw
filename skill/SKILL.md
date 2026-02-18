---
name: cardioclaw
description: Manage OpenClaw heartbeats (cron jobs) via YAML. Use when user wants to create, edit, list, or manage recurring tasks, reminders, scheduled prompts, or heartbeats. Trigger on "heartbeat", "recurring task", "schedule", "cron job", "reminder at", "every morning", "daily briefing", or any request to set up automated agent tasks.
---

# CardioClaw

YAML-based heartbeat orchestration for OpenClaw.

## When to Use

- User wants to **create** a recurring task or one-shot reminder
- User wants to **list** or **check** their scheduled heartbeats
- User wants to **edit** or **delete** a heartbeat
- User mentions "heartbeat", "cron", "scheduled task", or "reminder"

## Quick Reference

```bash
cardioclaw init                # Create starter config with timezone detection
cardioclaw status              # List all heartbeats + health
cardioclaw sync                # Push YAML changes to OpenClaw
cardioclaw sync --force        # Replace existing jobs
cardioclaw discover            # Refresh job state from OpenClaw cron list
cardioclaw import              # Pull existing cron jobs into YAML
cardioclaw snapshot            # Save current state to snapshot file
cardioclaw runs "Name"         # Show execution history for a heartbeat
cardioclaw runs --all          # Show runs for all jobs
cardioclaw prune               # Remove old completed one-shots from YAML
cardioclaw prune --days 30     # Prune completed jobs older than 30 days
cardioclaw remove "Name"       # Delete heartbeat from OpenClaw + YAML
cardioclaw dedupe              # Remove duplicate jobs
cardioclaw dashboard           # Web UI at localhost:3333
```

**Config location:** `~/.cardioclaw/cardioclaw.yaml`

## Creating Heartbeats

### Option 1: Edit YAML Directly

```yaml
# ~/.cardioclaw/cardioclaw.yaml
heartbeats:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Weather, calendar, inbox summary"
    delivery: telegram

  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Gym time! 🏋️"
    sessionTarget: main
```

Then run `cardioclaw sync` to apply.

### Option 2: Conversational (via this skill)

When user asks for a heartbeat, I should:

1. **Parse** their request into YAML format
2. **Read** current `~/.cardioclaw/cardioclaw.yaml`
3. **Append** the new heartbeat
4. **Run** `cardioclaw sync`
5. **Confirm** with `cardioclaw status`

## YAML Schema

```yaml
- name: string              # Required: Unique name
  schedule: string          # Required: Cron OR "at YYYY-MM-DD HH:MM"
  
  # Payload (choose one):
  prompt: string            # Agent runs this in isolated session
  message: string           # Inject text into main session
  
  # Optional:
  delivery: string          # telegram | discord | none
  sessionTarget: string     # isolated | main (auto-detected)
  model: string             # opus | sonnet | etc.
  agent: string             # For multi-agent setups
```

## Schedule Formats

| Pattern | Meaning |
|---------|---------|
| `"0 8 * * *"` | Daily at 8 AM |
| `"0 19 * * 1-5"` | Weekdays at 7 PM |
| `"0 */2 * * *"` | Every 2 hours |
| `"0 9 * * MON"` | Mondays at 9 AM |
| `at 2026-02-15 18:00` | One-shot at specific time |

Timezone: User's configured timezone (default: America/New_York)

## Common Workflows

### "Create a daily briefing"
```bash
# 1. Append to YAML
# 2. Run:
cardioclaw sync
```

### "What heartbeats do I have?"
```bash
cardioclaw status
```

### "Delete the gym reminder"
```bash
cardioclaw remove "Gym Reminder"
```
Removes from both OpenClaw and YAML in one command.

### "Import my existing cron jobs"
```bash
cardioclaw import
```

## Error Handling

- **"cardioclaw: command not found"** → Run install script
- **Sync fails** → Check YAML syntax, ensure OpenClaw gateway running
- **Job not firing** → Check `cardioclaw status` for next run time

## Best Practices

1. Use `prompt:` for agent tasks (isolated session, agent does work)
2. Use `message:` for simple reminders (main session, just notification)
3. Always run `cardioclaw sync` after editing YAML
4. Use `--dry-run` to preview changes: `cardioclaw sync --dry-run`
