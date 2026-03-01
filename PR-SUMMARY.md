# Pull Request: Unified Heartbeat + Cron Management (v0.4.0)

**Branch:** `wolverine/unified-heartbeat-cron`  
**Target:** `main`  
**Type:** Major Feature Release  
**Breaking Changes:** None (fully backward compatible)

## Summary

Transforms CardioClaw from cron-only manager into a unified abstraction layer managing **both** OpenClaw heartbeats and cron jobs from a single YAML file.

## What Changed

### Core Features
- ✅ Gateway config integration (read/patch `agents[].heartbeat`)
- ✅ HEARTBEAT.md generation (per-agent workspace files)
- ✅ Unified sync (`--heartbeat` flag)
- ✅ Unified import (`--heartbeat` flag)
- ✅ Schema validation (`validate` command)
- ✅ Dashboard API endpoints (`/api/heartbeats/*`)

### New YAML Schema
```yaml
# NEW: Heartbeat management
agents:
  - id: main
    heartbeat:
      interval: 30m
      target: last
    checklist: |
      # Heartbeat checklist

# RENAMED: heartbeats → cron_jobs (backward compatible)
cron_jobs:
  - name: Morning Briefing
    schedule: "0 8 * * *"
```

### CLI Commands
```bash
# Unified sync
cardioclaw sync --heartbeat           # Both
cardioclaw sync --heartbeat-only      # Heartbeats only
cardioclaw sync --heartbeat --restart # With gateway restart

# Unified import
cardioclaw import --heartbeat         # Both
cardioclaw import --heartbeat-only    # Heartbeats only

# Validation
cardioclaw validate                   # Check schema
```

## Files Changed

### New Files (1,235 lines)
- `lib/gateway-config.js` (277 lines) - Gateway config read/patch
- `lib/heartbeat-md.js` (184 lines) - HEARTBEAT.md generation
- `lib/heartbeat-sync.js` (108 lines) - Unified sync orchestration
- `lib/heartbeat-api.js` (73 lines) - Dashboard API endpoints
- `lib/import-heartbeat.js` (161 lines) - Import heartbeat configs
- `lib/validate.js` (164 lines) - YAML schema validation
- `UPGRADE-GUIDE.md` (187 lines) - Migration guide
- `RELEASE-NOTES-v0.4.0.md` (260 lines) - Release notes
- `examples/unified-config.yaml` (51 lines) - Example config

### Modified Files
- `lib/sync.js` - Split into `syncCronOnly`, `syncHeartbeatOnly`, `syncUnified`
- `lib/import.js` - Split into `importCronOnly`, `importHeartbeatOnly`, `importUnified`
- `lib/server.js` - Added heartbeat API endpoints
- `bin/cardioclaw.js` - Added CLI flags + validate command
- `README.md` - Updated with unified schema examples

## Testing

### Automated Tests
```bash
npm test
# ✔ 23/23 tests passing
```

### Manual Testing (Live Environment)
- ✅ Heartbeat sync on 2 agents (wolverine, beast)
- ✅ Gateway config patched successfully
- ✅ HEARTBEAT.md files written to workspaces
- ✅ Cron jobs created via unified sync
- ✅ Import from existing config working
- ✅ Validation catching errors
- ✅ All security fixes verified

## Backward Compatibility

**✅ Zero breaking changes.**

Existing configs work unchanged:
```yaml
# Old schema still works
heartbeats:
  - name: Morning Briefing
    schedule: "0 8 * * *"
```

Migration is **optional**. Users can adopt new schema at their own pace.

## Security

All v0.3.0 security fixes included:
- ✅ No `execSync` usage (all `spawnSync` with arg arrays)
- ✅ HTML escaping (21 uses of `esc()` function)
- ✅ Network binding secured (127.0.0.1 default)
- ✅ Rate limiting on API endpoints
- ✅ Security headers (CSP, X-Frame-Options, etc.)

## Documentation

- ✅ Comprehensive upgrade guide (UPGRADE-GUIDE.md)
- ✅ Release notes (RELEASE-NOTES-v0.4.0.md)
- ✅ Example config (examples/unified-config.yaml)
- ✅ Updated README with new schema
- ✅ Inline code comments

## Known Limitations

Not included in this PR (future work):
- Dashboard UI updates (API ready, UI pending)
- `cardioclaw doctor` health check command
- HEARTBEAT.md templates
- Heartbeat execution metrics
- Status command heartbeat integration

These are **non-critical** and tracked for future releases.

## Deployment Plan

1. Merge to `main`
2. Tag as `v0.4.0`
3. Update npm package
4. Publish release notes
5. Announce in Discord #announcements

## Review Checklist

- ✅ All tests pass
- ✅ Code follows project conventions
- ✅ Documentation complete
- ✅ Backward compatible
- ✅ Security validated
- ✅ Tested on live environment
- ✅ No sensitive data in commits
- ✅ Git history clean (meaningful commits)

## Reviewer Notes

**Test the PR:**
```bash
git fetch origin
git checkout wolverine/unified-heartbeat-cron
npm install
npm test

# Try unified sync
cardioclaw sync --heartbeat --dry-run --config examples/unified-config.yaml

# Try import
cardioclaw import --heartbeat --dry-run

# Try validation
cardioclaw validate --config examples/unified-config.yaml
```

**Questions for reviewer:**
1. Should we merge this as v0.4.0 or save for v1.0.0?
2. Dashboard UI updates - include in this PR or separate?
3. Any concerns about the gateway config patching approach?

---

**Built by:** Wolverine 🐺  
**Reviewed by:** Beast 🔬  
**Tested on:** Dave's live OpenClaw (17 agents)  
**Timeline:** 6 hours (Phase 0-3 complete)
