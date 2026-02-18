'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildCronArgs, DEFAULT_TIMEZONE } = require('../lib/parser');

// buildCronCommand was a shell-string builder (deprecated / removed from exports).
// Its behaviour is superseded by the injection-safe buildCronArgs tested below.

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
