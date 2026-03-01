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

  // Delivery (v0.3.0 structured support)
  if (sessionTarget !== 'main') {
    const deliveryArgs = buildDeliveryArgs(hb.delivery);
    args.push(...deliveryArgs);
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

/**
 * Build delivery arguments for OpenClaw CLI (v0.3.0)
 * Supports both legacy string format and new structured format
 */
function buildDeliveryArgs(delivery) {
  if (!delivery || delivery === 'none') {
    return ['--no-deliver'];
  }
  
  // Legacy string format: delivery: "telegram"
  if (typeof delivery === 'string') {
    return ['--announce', '--channel', delivery];
  }
  
  // New structured format (v0.3.0)
  if (typeof delivery === 'object') {
    const args = [];
    
    // Delivery condition: on (success | failure | always | none)
    const on = delivery.on || 'success';
    if (on === 'none') {
      return ['--no-deliver'];
    }
    args.push('--deliver-on', on);
    
    // Delivery channel: telegram | discord | webhook
    const channel = delivery.channel || 'telegram';
    args.push('--deliver-channel', channel);
    
    // Delivery target: chat_id | channel:id | webhook URL
    if (delivery.target) {
      args.push('--deliver-target', delivery.target);
    }
    
    // Delivery metadata (optional)
    if (delivery.delivery_meta) {
      if (delivery.delivery_meta.format) {
        args.push('--deliver-format', delivery.delivery_meta.format);
      }
      if (delivery.delivery_meta.title) {
        args.push('--deliver-title', delivery.delivery_meta.title);
      }
      if (delivery.delivery_meta.priority) {
        args.push('--deliver-priority', delivery.delivery_meta.priority);
      }
    }
    
    return args;
  }
  
  // Fallback: no delivery
  return ['--no-deliver'];
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

function escapeName(name) {
  // Escape quotes in name
  return name.replace(/"/g, '\\"');
}

function escapeMessage(msg) {
  // Escape quotes for shell
  return msg.replace(/"/g, '\\"');
}

module.exports = { buildCronArgs, resolveTimezone, buildDeliveryArgs, DEFAULT_TIMEZONE: SYSTEM_TIMEZONE };
