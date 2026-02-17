'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildCronCommand, buildCronArgs, DEFAULT_TIMEZONE } = require('../lib/parser');

// ─── buildCronCommand ───────────────────────────────────────────────────────

describe('buildCronCommand', () => {
  test('generates cron command for recurring job with prompt', () => {
    const hb = {
      name: 'Morning Briefing',
      schedule: '0 8 * * *',
      prompt: 'Run morning briefing',
      delivery: 'telegram',
    };
    const cmd = buildCronCommand(hb);
    assert.ok(cmd.includes('--name "Morning Briefing"'), 'should include name');
    assert.ok(cmd.includes('--cron "0 8 * * *"'), 'should include cron expr');
    assert.ok(cmd.includes('--message "Run morning briefing"'), 'should include message');
    assert.ok(cmd.includes('--announce --channel telegram'), 'should include delivery');
    assert.ok(!cmd.includes('--delete-after-run'), 'should not include delete-after-run');
  });

  test('generates one-shot command and sets --delete-after-run', () => {
    const hb = {
      name: 'Gym Reminder',
      schedule: 'at 2026-06-01 09:00',
      message: 'Gym time!',
      sessionTarget: 'main',
    };
    const cmd = buildCronCommand(hb);
    assert.ok(cmd.includes('--at "'), 'should include --at');
    assert.ok(cmd.includes('--delete-after-run'), 'should include delete-after-run for one-shot');
    assert.ok(cmd.includes('--session main'), 'should target main session');
  });

  test('throws when neither prompt nor message provided', () => {
    const hb = {
      name: 'Bad Job',
      schedule: '0 9 * * *',
    };
    assert.throws(() => buildCronCommand(hb), /Must provide either prompt or message/);
  });

  test('escapes double quotes in name and prompt', () => {
    const hb = {
      name: 'Say "hello"',
      schedule: '0 9 * * *',
      prompt: 'Ask "What\'s up?"',
    };
    const cmd = buildCronCommand(hb);
    assert.ok(cmd.includes('\\"hello\\"'), 'should escape quotes in name');
  });

  test('adds --model flag when model is specified', () => {
    const hb = {
      name: 'Smart Job',
      schedule: '0 9 * * *',
      prompt: 'Do something smart',
      model: 'claude-opus-4-5',
    };
    const cmd = buildCronCommand(hb);
    assert.ok(cmd.includes('--model "claude-opus-4-5"'), 'should include model');
  });

  test('uses --no-deliver when delivery is none', () => {
    const hb = {
      name: 'Silent Job',
      schedule: '0 9 * * *',
      prompt: 'Do silently',
      delivery: 'none',
    };
    const cmd = buildCronCommand(hb);
    assert.ok(cmd.includes('--no-deliver'), 'should include --no-deliver');
  });

  test('uses timezone from hb.tz', () => {
    const hb = {
      name: 'TZ Job',
      schedule: '0 9 * * *',
      prompt: 'Check time',
      tz: 'America/Chicago',
    };
    const cmd = buildCronCommand(hb);
    assert.ok(cmd.includes('--tz "America/Chicago"'), 'should use hb.tz');
  });

  test('uses timezone from defaults when hb.tz not set', () => {
    const hb = {
      name: 'Default TZ Job',
      schedule: '0 9 * * *',
      prompt: 'Check time',
    };
    const cmd = buildCronCommand(hb, { timezone: 'Europe/London' });
    assert.ok(cmd.includes('--tz "Europe/London"'), 'should use defaults.timezone');
  });
});

// ─── buildCronArgs ──────────────────────────────────────────────────────────

describe('buildCronArgs', () => {
  test('returns [cmd, argsArray] tuple', () => {
    const hb = {
      name: 'Test Job',
      schedule: '0 8 * * *',
      prompt: 'Run it',
    };
    const result = buildCronArgs(hb);
    assert.equal(result.length, 2, 'should return tuple of length 2');
    const [cmd, args] = result;
    assert.equal(cmd, 'openclaw', 'command should be openclaw');
    assert.ok(Array.isArray(args), 'args should be an array');
    assert.ok(args.includes('cron'), 'args should contain cron');
    assert.ok(args.includes('add'), 'args should contain add');
  });

  test('passes user data as discrete arg element (no shell interpolation)', () => {
    const maliciousName = 'bad; rm -rf /';
    const hb = {
      name: maliciousName,
      schedule: '0 8 * * *',
      prompt: 'Run it',
    };
    const [, args] = buildCronArgs(hb);
    // The name should appear as a discrete element, not shell-evaluated
    const nameIdx = args.indexOf('--name');
    assert.ok(nameIdx !== -1, 'should have --name flag');
    assert.equal(args[nameIdx + 1], maliciousName, 'name must be a separate array element, not interpolated into a shell string');
    // The args array should NOT be a single joined string (that would be the unsafe pattern)
    assert.ok(Array.isArray(args), 'args must remain an array for safe spawnSync usage');
    // Prompt should likewise be a discrete element
    const msgIdx = args.indexOf('--message');
    assert.ok(msgIdx !== -1, 'should have --message flag');
    assert.equal(args[msgIdx + 1], 'Run it', 'prompt should be a discrete arg element');
  });

  test('handles one-shot schedule with --at', () => {
    const hb = {
      name: 'One Shot',
      schedule: 'at 2026-12-25 08:00',
      prompt: 'Happy Xmas!',
    };
    const [, args] = buildCronArgs(hb);
    assert.ok(args.includes('--at'), 'should include --at flag');
    assert.ok(args.includes('--delete-after-run'), 'one-shot should have delete-after-run');
  });

  test('handles main sessionTarget without delivery flags', () => {
    const hb = {
      name: 'Main Job',
      schedule: '0 9 * * *',
      message: 'A system event',
      sessionTarget: 'main',
    };
    const [, args] = buildCronArgs(hb);
    assert.ok(args.includes('--session'), 'should have --session');
    const sessionIdx = args.indexOf('--session');
    assert.equal(args[sessionIdx + 1], 'main');
    assert.ok(!args.includes('--announce'), 'main session should not have --announce');
    assert.ok(!args.includes('--no-deliver'), 'main session should not have --no-deliver');
  });

  test('throws when neither prompt nor message provided', () => {
    const hb = { name: 'No payload', schedule: '0 9 * * *' };
    assert.throws(() => buildCronArgs(hb), /Must provide either prompt or message/);
  });

  test('type-checks schedule — non-string schedule does not throw startsWith error', () => {
    const hb = {
      name: 'Null Schedule Job',
      schedule: null,   // bad YAML value
      prompt: 'Run it',
    };
    // Should not throw a TypeError about startsWith on null
    assert.doesNotThrow(() => buildCronArgs(hb));
  });
});

// ─── DEFAULT_TIMEZONE ───────────────────────────────────────────────────────

describe('DEFAULT_TIMEZONE', () => {
  test('is a non-empty string', () => {
    assert.equal(typeof DEFAULT_TIMEZONE, 'string');
    assert.ok(DEFAULT_TIMEZONE.length > 0, 'should not be empty');
  });
});
