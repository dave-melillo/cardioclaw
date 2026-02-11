# PRD: CardioClaw MVP - YAML to Cron Sync

**Mission ID:** CARDIO-001  
**Author:** Beast  
**Date:** 2026-02-11 (REVISED)  
**Status:** Ready for Build  
**Priority:** 5/5  
**Complexity:** S (Small - build today)  
**Timeline:** 4-6 hours  
**Repo:** https://github.com/dave-melillo/cardioclaw  
**Inspiration:** https://antfarm.cool (simplicity, not features)

---

## What We're Building (End of Day)

A minimal CLI tool that reads **YAML heartbeat definitions** and creates **OpenClaw cron jobs**. That's it.

**Deliverable:** Single Node.js script with one command: `cardioclaw sync`

---

## Core Feature (MVP Only)

### YAML → OpenClaw Cron Translation

**User writes clean YAML:**
```yaml
# cardioclaw.yaml
heartbeats:
  - name: Morning Briefing
    agent: beast
    schedule: "0 8 * * *"
    prompt: "Run morning briefing: weather + calendar + inbox"
    delivery: telegram

  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Reminder: Gym at 6 PM! 🏋️"
    sessionTarget: main
```

**One command:**
```bash
cardioclaw sync
# ✓ Created 2 OpenClaw cron jobs
```

**What it does:**
1. Parse `cardioclaw.yaml` (in current dir or `~/.cardioclaw/`)
2. For each heartbeat, call:
   ```bash
   openclaw cron add \
     --name "Morning Briefing" \
     --schedule.kind cron \
     --schedule.expr "0 8 * * *" \
     --schedule.tz "America/New_York" \
     --payload.kind agentTurn \
     --payload.message "Run morning briefing..." \
     --sessionTarget isolated \
     --delivery.mode announce \
     --delivery.channel telegram
   ```
3. Print summary (jobs created, errors)

---

## YAML Schema (Minimal)

```yaml
heartbeats:
  - name: string           # Required: Job name (must be unique)
    schedule: string       # Required: "0 8 * * *" OR "at 2026-02-15 18:00"
    prompt: string         # Either prompt (agentTurn) OR message (systemEvent)
    message: string        # Use for systemEvent one-shots
    agent: string          # Optional: agent name (default: current agent)
    delivery: string       # Optional: "telegram" | "none" (default: none)
    sessionTarget: string  # Optional: "main" | "isolated" (default: isolated)
    model: string          # Optional: model override
```

**Schedule formats supported:**
- Cron expression: `"0 8 * * *"` (daily at 8 AM)
- One-shot: `at 2026-02-15 18:00` (absolute time in local timezone)

---

## What's OUT OF SCOPE (v1)

❌ Dashboard  
❌ Discovery service  
❌ Daemon/background process  
❌ Conflict detection (just create jobs)  
❌ Orphan detection  
❌ Update/delete via YAML  
❌ Interval schedules (`every 2h`)  
❌ Active hours  
❌ Status checks  

*These can come in v2 if Dave wants to expand.*

---

## Technical Spec

### Option 1: Single Node.js Script (Recommended)
```
cardioclaw/
├── bin/cardioclaw.js        # CLI entry point
├── sync.js                  # Core sync logic
├── parser.js                # YAML → OpenClaw translation
├── package.json             # Dependencies: js-yaml, commander
└── README.md
```

**How it works:**
1. Read YAML with `js-yaml`
2. Parse each heartbeat entry
3. Build `openclaw cron add` command string
4. Execute with `child_process.exec()`
5. Print results

**Install:**
```bash
npm install -g cardioclaw
# OR: npx cardioclaw sync
```

### Option 2: Bash Script (Even Simpler)
Pure bash with `yq` for YAML parsing. No dependencies beyond OpenClaw CLI.

**Recommendation:** Start with Node.js (Option 1) for easier YAML parsing and error handling.

---

## Implementation Pseudocode

```javascript
// sync.js
const yaml = require('js-yaml');
const { execSync } = require('child_process');
const fs = require('fs');

function sync() {
  // 1. Find cardioclaw.yaml
  const yamlPath = findYaml(); // check ./cardioclaw.yaml, ~/.cardioclaw/cardioclaw.yaml
  const config = yaml.load(fs.readFileSync(yamlPath, 'utf8'));

  // 2. Parse each heartbeat
  const heartbeats = config.heartbeats || [];
  let created = 0;
  let errors = 0;

  for (const hb of heartbeats) {
    try {
      const cmd = buildCronCommand(hb);
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✓ Created: ${hb.name}`);
      created++;
    } catch (err) {
      console.error(`✗ Failed: ${hb.name} - ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✓ ${created} jobs created`);
  if (errors > 0) console.log(`✗ ${errors} errors`);
}

function buildCronCommand(hb) {
  const args = [
    'openclaw cron add',
    `--name "${hb.name}"`,
    parseSchedule(hb.schedule),
    parsePayload(hb),
    `--sessionTarget ${hb.sessionTarget || 'isolated'}`,
    parseDelivery(hb.delivery),
  ];
  return args.filter(Boolean).join(' ');
}

function parseSchedule(schedule) {
  if (schedule.startsWith('at ')) {
    const dateStr = schedule.replace('at ', '');
    return `--schedule.kind at --schedule.at "${new Date(dateStr).toISOString()}"`;
  } else {
    // Assume cron expression
    return `--schedule.kind cron --schedule.expr "${schedule}" --schedule.tz "America/New_York"`;
  }
}

function parsePayload(hb) {
  if (hb.prompt) {
    return `--payload.kind agentTurn --payload.message "${hb.prompt}"`;
  } else if (hb.message) {
    return `--payload.kind systemEvent --payload.text "${hb.message}"`;
  }
  throw new Error(`Missing prompt or message for ${hb.name}`);
}

function parseDelivery(delivery) {
  if (!delivery || delivery === 'none') return '--delivery.mode none';
  return `--delivery.mode announce --delivery.channel ${delivery}`;
}
```

---

## Definition of Done

✅ User can write `cardioclaw.yaml` with heartbeat definitions  
✅ `cardioclaw sync` reads YAML and creates OpenClaw cron jobs  
✅ Supports cron expressions (`"0 8 * * *"`)  
✅ Supports one-shot schedules (`at 2026-02-15 18:00`)  
✅ Handles `prompt` (agentTurn) and `message` (systemEvent)  
✅ Supports `delivery: telegram` or `delivery: none`  
✅ Prints summary (jobs created, errors)  
✅ Works on macOS and Linux  
✅ Installable via npm or runs with npx  
✅ README with examples  

---

## Example YAML File

```yaml
# cardioclaw.yaml - Dave's Heartbeats

heartbeats:
  # Morning briefing (recurring)
  - name: Morning Briefing v3
    agent: beast
    schedule: "0 8 * * *"
    prompt: |
      Run morning briefing: weather + calendar + inbox.
      Keep it under 6 sentences.
    delivery: telegram

  # Evening wrap (recurring)
  - name: Evening Wrap-up v3
    agent: beast
    schedule: "0 19 * * 1-5"  # Weekdays at 7 PM
    prompt: "Evening wrap: what got done today, what's tomorrow"
    delivery: telegram

  # One-shot reminder
  - name: Gym Reminder
    schedule: at 2026-02-15 18:00
    message: "Reminder: Gym at 6 PM! 🏋️"
    sessionTarget: main
    delivery: telegram

  # Health check (no delivery)
  - name: Session Health Check
    schedule: "0 */2 * * *"  # Every 2 hours
    prompt: "Check session health. Only alert if context over 80%."
    delivery: none
```

---

## Success Metrics

**For v1:** Does it work? Can you define heartbeats in YAML and they get created in OpenClaw?

**Next steps (v2):**
- Add `cardioclaw status` (list all jobs)
- Add conflict detection (warn if job already exists)
- Add `cardioclaw rm <name>` (delete job)
- Add dashboard (separate phase)

---

## Build Checklist (for Wolverine)

1. Create Node.js project with `package.json`
2. Add dependencies: `js-yaml`, `commander`
3. Implement YAML parser (`parser.js`)
4. Implement schedule translation (cron expr, at timestamp)
5. Implement payload translation (agentTurn vs systemEvent)
6. Implement `cardioclaw sync` command
7. Add error handling (YAML syntax errors, missing fields)
8. Test with example YAML (create 3-4 test jobs)
9. Write README with installation + usage
10. Push to GitHub, publish to npm

---

**Estimated Build Time:** 4-6 hours  
**Deployment:** npm package or standalone script

---

*This is the Antfarm way: simple, contained, shippable. Build it today, add features tomorrow.* 🫀
