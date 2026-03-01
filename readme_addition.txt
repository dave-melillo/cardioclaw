---

## Discovery & Reconciliation (v0.3.0)

### The Gap Problem

CardioClaw tracks two types of cron jobs:

1. **Managed** — Jobs defined in your `cardioclaw.yaml` (marked with 🟢)
2. **Unmanaged** — Jobs created via OpenClaw CLI or other agents (marked with 🟡)

When these fall out of sync, you get a "gap" — jobs running without YAML definitions.

### Detecting Gaps

```bash
cardioclaw status
```
```
🫀 CardioClaw Status

📊 Active (27 jobs):
  🟢 ✓ Morning Briefing (beast)
      Next: Tomorrow 8:00 AM
  🟡 ✓ Security Alert (main)
      Next: Today 3:00 AM
  ...

🟡 Unmanaged Jobs (3):
  Not defined in cardioclaw.yaml. Run 'cardioclaw import' to bring under management.

  🟡 Security Alert
  🟡 External Sync
  🟡 Manual Check

────────────────────────────────────────────────────────────
  Managed: 27 | Unmanaged: 3 | Failing: 0
  ⚠️  Gap: 3 (run 'cardioclaw import' to reconcile)
```

### Reconciling the Gap

**Option 1:** Import unmanaged jobs into YAML
```bash
cardioclaw import --all
```
```
🔍 Found 3 unmanaged job(s)
  → Security Alert
  → External Sync
  → Manual Check

✓ Imported 3 new heartbeat(s) to cardioclaw.yaml

New Summary:
  → 30 total jobs
  → 30 managed
  → 0 unmanaged
  → Gap closed! ✅
```

**Option 2:** Remove orphaned YAML entries
```bash
cardioclaw status --orphans
```
```
🔴 Orphaned YAML Entries (1):
  Defined in YAML but not running in OpenClaw.

  🔴 Deprecated Backup

Remove them? (y/N) y

✓ Removed 1 orphaned entry
```

**Option 3:** Auto-Sync Heartbeat

Add this to your YAML to keep managed/unmanaged in sync automatically:
```yaml
- name: CardioClaw Auto-Sync
  schedule: "*/30 * * * *"
  prompt: "Run cardioclaw import to sync any new OpenClaw cron jobs into the YAML file. No need to report back unless there are errors."
  delivery: none
```

### Dashboard Indicators

- 🟢 **Managed** — YAML-defined, under CardioClaw control
- 🟡 **Unmanaged** — Exists in OpenClaw, needs YAML import
- 🔴 **Orphaned** — In YAML, not running (maybe deleted or disabled)

---

## Delivery Routing (v0.3.0)

By default, CardioClaw delivers notifications on job completion. You can customize when and where:

### Configuration

```yaml
heartbeats:
  - name: Custom Alerts
    schedule: "0 9 * * *"
    prompt: "Daily check"
    
    delivery:
      on: success | failure | always | none
      channel: telegram | discord | webhook
      target: "***REMOVED***" | "channel:123" | "https://webhook.url"
```

### Delivery Conditions

- `on: success` — Notify only when job succeeds (default)
- `on: failure` — Notify only when job fails
- `on: always` — Notify on every execution
- `on: none` — Silent execution (log only)

### Channels

**Telegram** (default)
```yaml
delivery:
  channel: telegram
  target: ***REMOVED***  # Your chat ID
```

**Discord**
```yaml
delivery:
  channel: discord
  target: channel:743234234234234  # Discord channel ID
  # OR
  target: https://discord.com/api/webhooks/...  # Webhook URL
```

**Webhook** (Slack, Teams, etc.)
```yaml
delivery:
  channel: webhook
  target: https://hooks.slack.com/services/TXXXX/BXXXX/XXXX
  delivery_meta:
    format: json  # Send JSON payload
    title: "System Alert"  # Custom title
```

### Examples

**Security Alerts (failure only):**
```yaml
- name: Security Check
  schedule: "0 3 * * *"
  prompt: "Run security scan"
  delivery:
    on: failure
    channel: discord
    target: channel:743234234234234
```

**Daily Briefing (success only):**
```yaml
- name: Morning Briefing
  schedule: "0 8 * * *"
  prompt: "Send daily briefing"
  delivery:
    on: success
    channel: telegram
    target: ***REMOVED***
```

**Background Task (silent):**
```yaml
- name: Cache Sync
  schedule: "*/30 * * * *"
  prompt: "Sync cache"
  delivery:
    on: none
```

**Legacy Format (still supported):**
```yaml
- name: Old Style
  schedule: "0 8 * * *"
  prompt: "Daily check"
  delivery: telegram
```
