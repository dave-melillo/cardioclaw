# PRD: One-Shot Heartbeat Lifecycle Management

**Feature ID:** CARDIO-002  
**Author:** Beast  
**Date:** 2026-02-14  
**Status:** Draft  
**Priority:** 3/5  
**Complexity:** S (Small)  
**Parent:** CardioClaw Phase 1

---

## Problem Statement

One-shot heartbeats (scheduled with `at YYYY-MM-DD HH:MM`) remain in both OpenClaw cron jobs **and** `cardioclaw.yaml` indefinitely after execution. This creates clutter:

- Old reminders accumulate in YAML (e.g., "Gym Reminder" from last week)
- `cardioclaw status` shows completed one-shots as "past due" or "inactive"
- Users must manually delete from YAML and run `cardioclaw sync --prune`

**Example:**
```yaml
heartbeats:
  - name: Gym Reminder
    schedule: at 2026-02-10 18:00  # <-- Executed 4 days ago, still here
    message: "Reminder: Gym at 6 PM!"
    delivery: telegram
```

**User experience:** "I have 10 old reminders in my YAML. Do I delete them manually? What if I want to keep a record?"

---

## Proposed Solution: Auto-Archive with Manual Cleanup

### Behavior

**After a one-shot executes:**
1. OpenClaw automatically disables the cron job (built-in behavior)
2. On next `cardioclaw sync`, CardioClaw detects completed one-shots
3. Moves them from `heartbeats:` to `heartbeats_completed:` section in YAML
4. User can manually delete old entries from `heartbeats_completed:` or leave as history

**YAML transformation:**

**Before execution:**
```yaml
heartbeats:
  - name: Gym Reminder
    schedule: at 2026-02-10 18:00
    message: "Reminder: Gym at 6 PM!"
```

**After execution + next sync:**
```yaml
heartbeats:
  # (empty — moved below)

heartbeats_completed:
  - name: Gym Reminder
    schedule: at 2026-02-10 18:00
    executed_at: 2026-02-10T18:00:15-05:00
    status: ok  # or "error"
    message: "Reminder: Gym at 6 PM!"
```

### Why This Approach?

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Auto-delete from YAML** | Clean, no clutter | Lose history, can't re-run | ❌ Too aggressive |
| **Leave in place** | Simple, no code change | Clutter, confusing status | ❌ Current broken state |
| **Auto-archive to `completed:`** | Clean active list, preserve history | Slightly more complex | ✅ **Recommended** |
| **Manual cleanup command** | User control | Extra step, easy to forget | ⚠️ Secondary option |

**Recommendation:** Auto-archive + manual pruning command (`cardioclaw prune --before 2026-01-01`)

---

## Implementation

### Detection Logic

**On `cardioclaw sync`:**
1. Query OpenClaw cron jobs via `openclaw cron list`
2. For each job with `schedule.kind = "at"`:
   - If `schedule.at` timestamp is in the past AND job is disabled → **completed**
   - If `schedule.at` is in the past AND job is enabled → **pending** (never ran)
   - If `schedule.at` is in the future → **upcoming**
3. Move completed entries to `heartbeats_completed:` section

### YAML Schema Update

**New top-level section:**
```yaml
heartbeats_completed:
  - name: string
    schedule: string          # original "at" timestamp
    executed_at: string       # ISO timestamp of actual execution
    status: string            # "ok" | "error"
    error: string             # optional: error message if failed
    # ... original heartbeat fields preserved
```

### Status Display

**`cardioclaw status` output:**
```
🫀 CardioClaw Status

Upcoming One-Shots (2):
  Gym Reminder             Next: Mon 2/17 at 6:00 PM
  Meeting Prep             Next: Tue 2/18 at 8:30 AM

Recurring (5):
  Morning Briefing         Next: Tomorrow at 8:00 AM   ✓
  Evening Wrap-up          Next: Today at 7:00 PM      ✓
  ...

Completed One-Shots (3):
  DC Ticket Reminder       Executed: Wed 2/14 at 10:00 AM   ✓
  Valentine's Day Note     Executed: Wed 2/14 at 9:00 AM    ✓
  Gym Reminder (old)       Executed: Mon 2/10 at 6:00 PM    ✗ Failed

Run 'cardioclaw prune --help' to clean up old completed jobs.
```

### Cleanup Command

**New command:**
```bash
# Remove completed jobs older than 30 days
cardioclaw prune --days 30

# Remove completed jobs before specific date
cardioclaw prune --before 2026-01-01

# Dry-run (show what would be deleted)
cardioclaw prune --days 30 --dry-run
```

**What it does:**
1. Filters `heartbeats_completed:` by `executed_at` timestamp
2. Removes entries older than threshold
3. Writes updated YAML
4. Optionally removes from OpenClaw (`openclaw cron remove <id>`)

---

## Edge Cases

### 1. One-Shot Scheduled in the Past (Never Executed)

**Scenario:** User writes YAML with `at 2026-02-01 10:00` but it's already Feb 14.

**Behavior:**
- OpenClaw creates the job but immediately marks it as "missed"
- `cardioclaw status` shows it under "Past Due (Not Executed)"
- User must manually remove or reschedule

**Output:**
```
⚠️  Past Due (Not Executed) (1):
  Old Reminder             Scheduled: Feb 1 at 10:00 AM (13 days ago)
```

### 2. Failed One-Shot

**Scenario:** One-shot executes but job fails (timeout, error).

**Behavior:**
- Archive to `heartbeats_completed:` with `status: error`
- Include error message in YAML
- Flag in `cardioclaw status` output

**YAML:**
```yaml
heartbeats_completed:
  - name: Broken Reminder
    schedule: at 2026-02-14 10:00
    executed_at: 2026-02-14T10:00:03-05:00
    status: error
    error: "cron: job execution timed out after 120s"
```

### 3. Re-Using a Completed One-Shot

**Scenario:** User wants to re-run "Gym Reminder" next week.

**Manual process:**
1. Copy from `heartbeats_completed:` back to `heartbeats:`
2. Update `schedule: at 2026-02-21 18:00`
3. Remove old `executed_at`, `status`, `error` fields
4. Run `cardioclaw sync`

**Future enhancement (out of scope):** CLI command `cardioclaw reschedule "Gym Reminder" --at "2026-02-21 18:00"`

---

## Definition of Done

### Functional Requirements
- ✅ `cardioclaw sync` detects completed one-shots (past timestamp + disabled)
- ✅ Moves completed one-shots to `heartbeats_completed:` in YAML
- ✅ Adds `executed_at`, `status`, `error` metadata
- ✅ `cardioclaw status` shows completed one-shots separately
- ✅ `cardioclaw prune` command removes old completed entries
- ✅ Handles edge cases: past-due (never executed), failed one-shots

### Non-Functional
- ✅ Does NOT affect recurring heartbeats
- ✅ YAML remains valid (schema backward-compatible)
- ✅ No data loss (completed entries preserved until pruned)

### Out of Scope (Phase 1)
- ❌ Auto-pruning (e.g., auto-delete after 30 days) — manual only
- ❌ `cardioclaw reschedule` command — copy/paste for now
- ❌ Dashboard UI for completed jobs — CLI only

---

## Testing Checklist

**Test scenarios:**
1. Create one-shot for tomorrow → verify shows under "Upcoming"
2. Wait for execution → verify moves to `heartbeats_completed:`
3. Create one-shot for yesterday → verify shows under "Past Due"
4. Simulate failed one-shot → verify `status: error` and error message
5. Run `cardioclaw prune --days 7` → verify old entries removed
6. Run `cardioclaw prune --dry-run` → verify no changes made

---

## Timeline

**Estimated effort:** 4-6 hours

**Breakdown:**
- Detection logic (completed vs pending): 2 hours
- YAML archiving: 1 hour
- `cardioclaw prune` command: 2 hours
- Testing + edge cases: 1 hour

**Can be built alongside Phase 1 dashboard or as a follow-up.**

---

## Success Metrics

**Phase 1 Success:**
- User sets 5 reminders over a week → all auto-archive after execution
- `cardioclaw status` clearly separates upcoming vs completed one-shots
- User runs `cardioclaw prune --days 30` once a month to clean up history

**Future (Phase 2):**
- Dashboard shows completed one-shots in a separate tab
- One-click "reschedule" button in UI
- Auto-prune option (configurable in YAML: `auto_prune_days: 30`)

---

*Keep it simple: archive completed one-shots, let users prune manually. Build on this in Phase 2 if needed.* 🫀
