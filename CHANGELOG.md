# Changelog

All notable changes to CardioClaw are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — security-fixes branch

### Security
- **[CRIT-1]** Replace all `execSync(templateString)` calls with `spawnSync(cmd, argsArray)` in `parser.js`, `sync.js`, `remove.js`, `dedupe.js`, `archive.js`, `discovery.js`, `import.js` — eliminates shell command injection
- **[CRIT-2]** Dashboard now binds to `127.0.0.1` by default instead of `0.0.0.0`; add `--host` flag for opt-in network access
- **[CRIT-3]** HTML-escape all database-sourced values before `innerHTML` insertion in `public/app.js`; add `esc()` helper
- **[CRIT-4]** Remove personal `/Users/dave/...` paths from docs — replaced with generic `~/` paths
- **[HIGH-1]** Validate `parseInt` results are finite positive numbers for `limit` and `days` API params
- **[HIGH-2]** Replace `process.env.HOME` with `os.homedir()` in `remove.js`, `import.js`, `sync.js`, `discovery.js`
- **[HIGH-3]** Type-check `hb.schedule` before calling `.startsWith()` in `parser.js` and `archive.js`
- **[MED-4]** Rate-limit `/api/refresh` to one call per 10 seconds (in-process debounce, `Retry-After` header)
- **[MED-6]** Add CSP, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` security headers to dashboard

### Added
- `buildCronArgs()` in `parser.js` — injection-safe alternative that returns `[cmd, argsArray]` for use with `spawnSync`
- `--host` CLI flag on `cardioclaw dashboard` command
- `test/parser.test.js` — 15 unit tests for parser (node:test)
- `test/prune.test.js` — 8 unit tests for prune (node:test)
- `.npmignore` — exclude `docs/`, `assets/`, `test.yaml`, `scripts/` from npm publish
- `CHANGELOG.md` — this file

### Changed
- **[MED-1]** `.gitignore`: add `*.db`, `npm-debug.log*`, `coverage/`, `.nyc_output`, `cardioclaw.yaml`, `test.yaml`
- **[MED-3]** `scripts/install.sh`: version bumped to `0.2.0`, minimum Node.js raised to 18+
- **[MED-7]** Remove Google Fonts CDN dependency; use system monospace font stack (works offline)
- **[MED-8]** `package.json` `main` field corrected from `index.js` → `bin/cardioclaw.js`
- **[LOW]** Node.js engine requirement raised to `>=18.0.0`
- **[LOW]** `QUICKSTART.md`: remove "Built in: ~3 hours" line; document YAML comment destruction on rewrite
- **[MED-5]** `README.md` / `QUICKSTART.md`: document that YAML comments are destroyed when cardioclaw rewrites the config file

### Removed
- `test.yaml` — personal config file removed from repository **[HIGH-4]**
- Google Fonts `<link>` tags from `public/index.html`

---

## [0.2.0] — 2026-02-14

### Added
- Web dashboard (`cardioclaw dashboard`) with hourly, calendar, and list views
- SQLite state database (`~/.cardioclaw/state.db`) for job tracking
- Execution history (`cardioclaw runs`) with per-job run records
- `cardioclaw dedupe` — remove duplicate cron jobs
- `cardioclaw prune` — prune old completed one-shots from YAML
- `cardioclaw import` — import existing OpenClaw cron jobs into YAML
- ECG-themed dashboard UI (Dazzler UX v2.1)

## [0.1.0] — 2026-02-11

### Added
- Initial release
- `cardioclaw sync` — YAML → OpenClaw cron job sync
- `cardioclaw status` — health overview
- `cardioclaw remove` — remove a heartbeat
- Support for recurring cron and one-shot `at` schedules
- YAML heartbeat format
- OpenClaw skill integration
