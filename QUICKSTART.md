# 🫀 CardioClaw Quick Start

## 1. Install

```bash
cd /Users/dave/clawd/cardioclaw
npm install
npm link
```

## 2. Create Config

Create `cardioclaw.yaml`:

```yaml
heartbeats:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run morning briefing"
    delivery: telegram
```

## 3. Sync

```bash
cardioclaw sync
```

That's it! Your heartbeat is now a cron job.

## Test It

```bash
# Dry run (see what would be created)
cardioclaw sync --dry-run

# With custom config
cardioclaw sync --config my-heartbeats.yaml
```

## Examples

See `examples/cardioclaw.yaml` for 5 example heartbeats:
- Morning briefing (recurring)
- Evening wrap (weekdays only)
- One-shot reminder
- Silent health check
- Weekly review

## Verify

```bash
openclaw cron list
```

---

**Built in:** ~3 hours  
**Status:** MVP complete ✓
