# CardioClaw v0.4.0 Upgrade Guide

## What's New

CardioClaw v0.4.0 adds **unified heartbeat + cron management**. You can now manage both OpenClaw heartbeats AND cron jobs from a single YAML file.

## Breaking Changes

**None.** Existing configs continue to work unchanged.

## New Schema (Optional)

If you want to manage OpenClaw heartbeats via CardioClaw, add an `agents[]` section:

```yaml
# New: Heartbeat management
agents:
  - id: main
    heartbeat:
      enabled: true
      interval: 30m
      target: last
    checklist: |
      # Main Heartbeat Checklist
      - Check inbox
      - Review calendar

  - id: ops
    heartbeat:
      enabled: true
      interval: 1h
      target: telegram
      to: "+15551234567"
    checklist: |
      # Ops Heartbeat Checklist
      - System health
      - Failed jobs

# Existing: Cron jobs (renamed from 'heartbeats')
cron_jobs:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run morning briefing"
    delivery:
      mode: announce
      channel: telegram
```

**Field Name Change:**
- Old: `heartbeats:` (confusing name for cron jobs)
- New: `cron_jobs:` (clearer name)

Both field names work for backward compatibility.

## Migration Steps

### Option 1: Keep Existing Config (No Changes Needed)

Your existing `cardioclaw.yaml` continues to work as-is:

```yaml
heartbeats:  # Still supported!
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run briefing"
```

### Option 2: Adopt New Schema

Rename `heartbeats:` to `cron_jobs:` and add `agents:` if you want heartbeat management:

```bash
# 1. Import existing heartbeat configs from OpenClaw
cardioclaw import --heartbeat --dry-run

# 2. Review the output, then import for real
cardioclaw import --heartbeat

# 3. Edit cardioclaw.yaml as needed
nano ~/.cardioclaw/cardioclaw.yaml

# 4. Sync everything
cardioclaw sync --heartbeat --restart
```

## New CLI Commands

### Sync

```bash
# Sync cron jobs only (existing behavior)
cardioclaw sync

# Sync both heartbeats + cron jobs
cardioclaw sync --heartbeat

# Sync only heartbeats (skip cron jobs)
cardioclaw sync --heartbeat-only

# Sync and restart gateway
cardioclaw sync --heartbeat --restart
```

### Import

```bash
# Import cron jobs only (existing behavior)
cardioclaw import

# Import both heartbeats + cron jobs
cardioclaw import --heartbeat

# Import only heartbeats
cardioclaw import --heartbeat-only
```

## What Gets Synced

When you run `cardioclaw sync --heartbeat`:

1. **HEARTBEAT.md files** written to each agent workspace
   - `~/.openclaw/workspace-<agent>/HEARTBEAT.md`
   - Generated from `agents[].checklist` field in YAML

2. **Gateway config patched** with heartbeat settings
   - Uses `openclaw config set agents <json>`
   - Merges your YAML agents[] into existing config
   - Preserves other agent settings

3. **Cron jobs created** as usual
   - Same behavior as existing `cardioclaw sync`

## Troubleshooting

### "Gateway restart required"

After syncing heartbeats, the gateway must restart to apply changes:

```bash
# Option 1: Sync with auto-restart
cardioclaw sync --heartbeat --restart

# Option 2: Manual restart
openclaw gateway restart
```

### "HEARTBEAT.md already exists"

Use `--force` to overwrite existing files:

```bash
cardioclaw sync --heartbeat --force
```

### Agent Not Found

If you reference an agent ID that doesn't exist in your OpenClaw config:

```bash
# Check available agents
openclaw config get agents.list | jq '.[].id'

# Fix: Use only IDs that exist in your config
```

## FAQs

**Q: Do I have to use the new `agents[]` schema?**  
A: No. It's optional. Existing configs work unchanged.

**Q: Can I mix `heartbeats:` and `cron_jobs:` fields?**  
A: Yes. `cron_jobs` takes precedence if both exist, but `heartbeats` still works.

**Q: Will this break my existing workflow?**  
A: No. All existing commands work exactly as before.

**Q: How do I disable heartbeat management?**  
A: Don't add `agents[]` to your YAML, or set `heartbeat.enabled: false` per agent.

**Q: Do heartbeat configs affect cron jobs?**  
A: No. They're separate primitives. Heartbeats run in agent main sessions; cron jobs are scheduler-based.

---

For more details, see:
- README.md (updated with new schema examples)
- docs/PRD.md (full design document)
