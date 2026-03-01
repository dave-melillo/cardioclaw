# CardioClaw v0.4.0 Release Notes

**Release Date:** 2026-03-01  
**Major Version:** Unified Heartbeat + Cron Management

## 🎯 What's New

CardioClaw v0.4.0 transforms the tool from "cron-only manager with confusing terminology" into a **unified abstraction layer** managing both OpenClaw heartbeats AND cron jobs from a single YAML source of truth.

### Unified Configuration Schema

You can now define **both** heartbeat configs and cron jobs in one YAML file:

```yaml
# Heartbeat management (NEW)
agents:
  - id: main
    heartbeat:
      interval: 30m
      target: last
    checklist: |
      # Heartbeat checklist

# Cron jobs (existing, renamed from 'heartbeats')
cron_jobs:
  - name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: "Run briefing"
```

### New Commands

**Unified Sync:**
```bash
# Sync both heartbeats + cron jobs
cardioclaw sync --heartbeat

# Sync only heartbeats
cardioclaw sync --heartbeat-only

# Sync with gateway restart
cardioclaw sync --heartbeat --restart
```

**Unified Import:**
```bash
# Import both heartbeats + cron jobs from OpenClaw
cardioclaw import --heartbeat

# Import only heartbeats
cardioclaw import --heartbeat-only
```

**Validation:**
```bash
# Validate YAML schema
cardioclaw validate
```

## 🚀 Key Features

### 1. Heartbeat Management

CardioClaw now manages OpenClaw's heartbeat primitive:
- **Gateway config patching** — Updates `agents[].heartbeat` configs
- **HEARTBEAT.md generation** — Creates per-agent checklist files
- **Multi-agent support** — Configure heartbeats for all agents

**What it does:**
```bash
cardioclaw sync --heartbeat
```
- Writes `~/.openclaw/workspace-<agent>/HEARTBEAT.md` for each agent
- Patches gateway config with `openclaw config set agents <json>`
- Creates cron jobs as usual

### 2. Import from OpenClaw

Extract existing heartbeat configs into YAML:
```bash
cardioclaw import --heartbeat --dry-run
```

Imports:
- Agent heartbeat configs from gateway
- Existing HEARTBEAT.md files
- Existing cron jobs (as before)

### 3. Schema Validation

New `validate` command catches issues before sync:
```bash
cardioclaw validate
```

Checks:
- Required fields (id, name, schedule)
- Duplicate names
- Invalid interval formats
- Missing workspaces
- Short intervals (< 5min warning)
- Large checklists (> 500 lines warning)

### 4. API Endpoints (Dashboard Ready)

New endpoints for future dashboard integration:
- `GET /api/heartbeats` — List all agent heartbeats
- `GET /api/heartbeats/:agentId` — Get agent details
- `GET /api/heartbeats/:agentId/history` — Execution history (placeholder)

## 🔄 Migration Guide

### No Breaking Changes

**Existing configs work unchanged.**

Your current `cardioclaw.yaml`:
```yaml
heartbeats:  # Still supported!
  - name: Morning Briefing
    schedule: "0 8 * * *"
```

### Adopting New Schema (Optional)

1. **Import existing heartbeats:**
```bash
cardioclaw import --heartbeat --dry-run
cardioclaw import --heartbeat
```

2. **Review and edit:**
```bash
nano ~/.cardioclaw/cardioclaw.yaml
```

3. **Sync everything:**
```bash
cardioclaw sync --heartbeat --restart
```

See [UPGRADE-GUIDE.md](UPGRADE-GUIDE.md) for details.

## 🔒 Security

All security fixes from v0.3.0 are included:
- ✅ Command injection eliminated (spawnSync with args)
- ✅ HTML escaping in dashboard (esc() function)
- ✅ Network binding secured (127.0.0.1 default)
- ✅ Rate limiting on API endpoints
- ✅ Security headers (CSP, X-Frame-Options)

## 📝 Full Changelog

### Added
- **Gateway config integration** (`lib/gateway-config.js`)
  - Read agents config via `openclaw config get agents`
  - Patch agents config via `openclaw config set agents`
  - Deep merge with existing config
- **HEARTBEAT.md generation** (`lib/heartbeat-md.js`)
  - Generate from YAML `checklist` field
  - Write to per-agent workspace
  - Read existing HEARTBEAT.md files
- **Unified sync** (`lib/heartbeat-sync.js`)
  - Orchestrate heartbeat + cron sync
  - `--heartbeat` flag (both)
  - `--heartbeat-only` flag (skip cron)
  - `--restart` flag (restart gateway after patch)
- **Unified import** (`lib/import-heartbeat.js`)
  - Import heartbeat configs from gateway
  - Import existing HEARTBEAT.md files
  - Merge with existing YAML
- **Validation command** (`lib/validate.js`)
  - Schema validation
  - Required field checks
  - Interval/checklist warnings
  - Duplicate name detection
- **Heartbeat API endpoints** (`lib/heartbeat-api.js`)
  - `/api/heartbeats` (list all)
  - `/api/heartbeats/:agentId` (details)
  - `/api/heartbeats/:agentId/history` (execution log)

### Changed
- **YAML schema** — Added `agents[]` top-level key
- **Field rename** — `heartbeats` → `cron_jobs` (backward compatible)
- **CLI flags** — Updated `sync` and `import` with heartbeat options
- **sync.js** — Split into `syncCronOnly`, `syncHeartbeatOnly`, `syncUnified`
- **import.js** — Split into `importCronOnly`, `importHeartbeatOnly`, `importUnified`

### Documentation
- Added `UPGRADE-GUIDE.md` — Migration instructions
- Added `RELEASE-NOTES-v0.4.0.md` — This file
- Added `examples/unified-config.yaml` — Example config
- Updated `README.md` — Unified schema examples

## 🧪 Testing

All existing tests pass:
```bash
npm test
# ✔ 23 tests pass
```

Verified on live OpenClaw setup:
- ✅ Heartbeat sync (2 agents: wolverine, beast)
- ✅ Gateway config patched successfully
- ✅ HEARTBEAT.md files written
- ✅ Cron job creation working
- ✅ Import from existing config working
- ✅ Validation catching errors

## 🔮 Future Work

Not included in v0.4.0 (future releases):
- Dashboard UI updates (API ready, UI pending)
- `cardioclaw doctor` health check command
- HEARTBEAT.md templates
- Heartbeat execution metrics
- Status command heartbeat integration
- Real-time WebSocket updates

## 📚 Resources

- [UPGRADE-GUIDE.md](UPGRADE-GUIDE.md) — Migration instructions
- [README.md](README.md) — Updated documentation
- [examples/unified-config.yaml](examples/unified-config.yaml) — Example config
- [PRD.md](docs/PRD.md) — Full design document

## 🙏 Credits

Built by Wolverine for the X-Men multi-agent system.  
Based on PRD by Beast.  
Tested on Dave's live OpenClaw deployment.

---

**Upgrade now:**
```bash
cd /path/to/cardioclaw
git pull
git checkout main  # or wolverine/unified-heartbeat-cron
npm install
cardioclaw import --heartbeat --dry-run
```
