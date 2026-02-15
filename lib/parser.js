/**
 * Translate YAML heartbeat definition to OpenClaw cron command
 */

const { DateTime } = require('luxon');

const DEFAULT_TIMEZONE = 'America/New_York';

function buildCronCommand(hb, defaults = {}) {
  const timezone = hb.tz || defaults.timezone || DEFAULT_TIMEZONE;
  const sessionTarget = hb.sessionTarget || (hb.prompt ? 'isolated' : 'main');
  
  const parts = [
    'openclaw cron add',
    buildName(hb.name),
    buildSchedule(hb.schedule, timezone),
    buildPayload(hb),
    buildSession(sessionTarget),
    buildDelivery(hb.delivery, sessionTarget),
  ];

  // Optional fields
  if (hb.model) {
    parts.push(`--model "${hb.model}"`);
  }

  // Delete after run for one-shot reminders
  if (hb.deleteAfterRun || hb.schedule.startsWith('at ')) {
    parts.push('--delete-after-run');
  }

  return parts.filter(Boolean).join(' ');
}

function buildName(name) {
  return `--name "${escapeName(name)}"`;
}

function buildSchedule(schedule, timezone) {
  // Handle "at YYYY-MM-DD HH:MM [TZ]" format
  if (schedule.startsWith('at ')) {
    const dateStr = schedule.replace('at ', '').trim();
    
    // Check for explicit UTC suffix
    if (dateStr.toUpperCase().endsWith(' UTC')) {
      const cleanDate = dateStr.replace(/ UTC$/i, '').trim();
      const dt = DateTime.fromISO(cleanDate.replace(' ', 'T'), { zone: 'UTC' });
      if (!dt.isValid) {
        // Try more flexible parsing
        const dt2 = DateTime.fromFormat(cleanDate, 'yyyy-MM-dd HH:mm', { zone: 'UTC' });
        if (!dt2.isValid) {
          throw new Error(`Invalid date: ${dateStr} (${dt2.invalidReason})`);
        }
        return `--at "${dt2.toISO()}"`;
      }
      return `--at "${dt.toISO()}"`;
    }
    
    // Check for explicit timezone suffix (e.g., "EST", "PST", "America/New_York")
    const tzMatch = dateStr.match(/^(.+?)\s+(America\/\w+|[A-Z]{2,4})$/);
    if (tzMatch) {
      const [, cleanDate, explicitTz] = tzMatch;
      const dt = DateTime.fromFormat(cleanDate.trim(), 'yyyy-MM-dd HH:mm', { zone: explicitTz });
      if (!dt.isValid) {
        throw new Error(`Invalid date or timezone: ${dateStr} (${dt.invalidReason})`);
      }
      return `--at "${dt.toUTC().toISO()}"`;
    }
    
    // No explicit timezone - use configured default
    const dt = DateTime.fromFormat(dateStr.replace('T', ' '), 'yyyy-MM-dd HH:mm', { zone: timezone });
    if (!dt.isValid) {
      // Try ISO format
      const dt2 = DateTime.fromISO(dateStr.replace(' ', 'T'), { zone: timezone });
      if (!dt2.isValid) {
        throw new Error(`Invalid date: ${dateStr}. Use format: YYYY-MM-DD HH:MM`);
      }
      return `--at "${dt2.toUTC().toISO()}"`;
    }
    return `--at "${dt.toUTC().toISO()}"`;
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

module.exports = { buildCronCommand, DEFAULT_TIMEZONE };
