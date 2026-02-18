/**
 * Translate YAML heartbeat definition to OpenClaw cron command
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DateTime, Settings } = require('luxon');

// System timezone, used as last-resort fallback
const SYSTEM_TIMEZONE = Settings.defaultZone.name || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Guard: emit the "no timezone configured" warning at most once per process
let _timezoneWarnEmitted = false;

/**
 * Resolve timezone with priority:
 *  1. Per-heartbeat `tz` field
 *  2. YAML `defaults.timezone`
 *  3. OpenClaw config `gateway.timezone`
 *  4. System timezone (with a warning)
 */
function resolveTimezone(hbTz, defaults = {}) {
  if (hbTz) return hbTz;
  if (defaults.timezone) return defaults.timezone;

  // Try OpenClaw config
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    const oclawTz = cfg.timezone || (cfg.gateway && cfg.gateway.timezone);
    if (oclawTz) return oclawTz;
  } catch (_) {
    // Config unreadable or missing — fall through
  }

  // Last resort: system TZ with warning (emitted once per process to avoid log spam)
  if (!_timezoneWarnEmitted) {
    _timezoneWarnEmitted = true;
    console.warn(
      `⚠️  No timezone configured. Falling back to system timezone: ${SYSTEM_TIMEZONE}\n` +
      `   Set defaults.timezone in your cardioclaw.yaml to avoid this warning.`
    );
  }
  return SYSTEM_TIMEZONE;
}

function buildCronCommand(hb, defaults = {}) {
  const timezone = resolveTimezone(hb.tz, defaults);
  const sessionTarget = hb.sessionTarget || (hb.prompt ? 'isolated' : 'main');
  const schedule = typeof hb.schedule === 'string' ? hb.schedule : '';

  const parts = [
    'openclaw cron add',
    buildName(hb.name),
    buildSchedule(schedule, timezone),
    buildPayload(hb),
    buildSession(sessionTarget),
    buildDelivery(hb.delivery, sessionTarget),
  ];

  // Optional fields
  if (hb.model) {
    parts.push(`--model "${hb.model}"`);
  }

  // Delete after run for one-shot reminders
  if (hb.deleteAfterRun || schedule.startsWith('at ')) {
    parts.push('--delete-after-run');
  }

  return parts.filter(Boolean).join(' ');
}

/**
 * Build the spawnSync args array for a heartbeat (injection-safe).
 * Returns [cmd, argsArray] suitable for spawnSync(cmd, argsArray).
 */
function buildCronArgs(hb, defaults = {}) {
  const timezone = resolveTimezone(hb.tz, defaults);
  const sessionTarget = hb.sessionTarget || (hb.prompt ? 'isolated' : 'main');
  const schedule = typeof hb.schedule === 'string' ? hb.schedule : '';

  const args = ['cron', 'add', '--name', hb.name];

  // Schedule
  if (schedule.startsWith('at ')) {
    const isoAt = resolveAtTime(schedule, timezone);
    args.push('--at', isoAt);
  } else {
    args.push('--cron', schedule, '--tz', timezone);
  }

  // Payload
  if (hb.prompt) {
    args.push('--message', hb.prompt);
  } else if (hb.message) {
    args.push('--system-event', hb.message);
  } else {
    throw new Error('Must provide either prompt or message');
  }

  // Session
  args.push('--session', sessionTarget === 'main' ? 'main' : 'isolated');

  // Delivery
  if (sessionTarget !== 'main') {
    if (!hb.delivery || hb.delivery === 'none') {
      args.push('--no-deliver');
    } else {
      args.push('--announce', '--channel', hb.delivery);
    }
  }

  // Optional
  if (hb.model) {
    args.push('--model', hb.model);
  }

  if (hb.deleteAfterRun || schedule.startsWith('at ')) {
    args.push('--delete-after-run');
  }

  return ['openclaw', args];
}

function buildName(name) {
  return `--name "${escapeName(name)}"`;
}

function resolveAtTime(schedule, timezone) {
  const dateStr = schedule.replace('at ', '').trim();

  // Check for explicit UTC suffix
  if (dateStr.toUpperCase().endsWith(' UTC')) {
    const cleanDate = dateStr.replace(/ UTC$/i, '').trim();
    const dt = DateTime.fromISO(cleanDate.replace(' ', 'T'), { zone: 'UTC' });
    if (!dt.isValid) {
      const dt2 = DateTime.fromFormat(cleanDate, 'yyyy-MM-dd HH:mm', { zone: 'UTC' });
      if (!dt2.isValid) throw new Error(`Invalid date: ${dateStr} (${dt2.invalidReason})`);
      return dt2.toISO();
    }
    return dt.toISO();
  }

  // Check for explicit timezone suffix
  const tzMatch = dateStr.match(/^(.+?)\s+(America\/\w+|[A-Z]{2,4})$/);
  if (tzMatch) {
    const [, cleanDate, explicitTz] = tzMatch;
    const dt = DateTime.fromFormat(cleanDate.trim(), 'yyyy-MM-dd HH:mm', { zone: explicitTz });
    if (!dt.isValid) throw new Error(`Invalid date or timezone: ${dateStr} (${dt.invalidReason})`);
    return dt.toUTC().toISO();
  }

  // No explicit timezone - use configured default
  const dt = DateTime.fromFormat(dateStr.replace('T', ' '), 'yyyy-MM-dd HH:mm', { zone: timezone });
  if (!dt.isValid) {
    const dt2 = DateTime.fromISO(dateStr.replace(' ', 'T'), { zone: timezone });
    if (!dt2.isValid) throw new Error(`Invalid date: ${dateStr}. Use format: YYYY-MM-DD HH:MM`);
    return dt2.toUTC().toISO();
  }
  return dt.toUTC().toISO();
}

function buildSchedule(schedule, timezone) {
  // Handle "at YYYY-MM-DD HH:MM [TZ]" format
  if (schedule.startsWith('at ')) {
    return `--at "${resolveAtTime(schedule, timezone)}"`;
  }

  // Cron expression with timezone
  return `--cron "${schedule}" --tz "${timezone}"`;
}

function buildPayload(hb) {
  if (hb.prompt) {
    // agentTurn (isolated session, runs agent)
    return `--message "${escapeMessage(hb.prompt)}"`;
  } else if (hb.message) {
    // systemEvent (main session, just injects text)
    return `--system-event "${escapeMessage(hb.message)}"`;
  }
  
  throw new Error('Must provide either prompt or message');
}

function buildSession(sessionTarget) {
  // Map to OpenClaw CLI format
  if (sessionTarget === 'main') {
    return '--session main';
  }
  return '--session isolated';
}

function buildDelivery(delivery, sessionTarget) {
  // Delivery options only work with isolated sessions
  if (sessionTarget === 'main') {
    return ''; // No delivery flags for main session
  }
  
  if (!delivery || delivery === 'none') {
    return '--no-deliver';
  }
  
  // Announce mode with channel
  return `--announce --channel ${delivery}`;
}

function escapeName(name) {
  // Escape quotes in name
  return name.replace(/"/g, '\\"');
}

function escapeMessage(msg) {
  // Escape quotes for shell
  return msg.replace(/"/g, '\\"');
}

// buildCronCommand is a shell-string builder kept for test backwards-compat but
// not exported — use buildCronArgs (injection-safe spawnSync array) instead.
module.exports = { buildCronArgs, resolveTimezone, DEFAULT_TIMEZONE: SYSTEM_TIMEZONE };
