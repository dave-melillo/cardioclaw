/**
 * Translate YAML heartbeat definition to OpenClaw cron command
 */

function buildCronCommand(hb) {
  const sessionTarget = hb.sessionTarget || (hb.prompt ? 'isolated' : 'main');
  
  const parts = [
    'openclaw cron add',
    buildName(hb.name),
    buildSchedule(hb.schedule),
    buildPayload(hb),
    buildSession(sessionTarget),
    buildDelivery(hb.delivery, sessionTarget),
  ];

  // Optional fields
  if (hb.model) {
    parts.push(`--model "${hb.model}"`);
  }

  return parts.filter(Boolean).join(' ');
}

function buildName(name) {
  return `--name "${escapeName(name)}"`;
}

function buildSchedule(schedule) {
  // Handle "at YYYY-MM-DD HH:MM" format
  if (schedule.startsWith('at ')) {
    const dateStr = schedule.replace('at ', '').trim();
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${dateStr}`);
      }
      return `--at "${date.toISOString()}"`;
    } catch (err) {
      throw new Error(`Failed to parse schedule: ${err.message}`);
    }
  }
  
  // Cron expression with timezone
  return `--cron "${schedule}" --tz "America/New_York"`;
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

module.exports = { buildCronCommand };
