'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// We test prune() by creating temp YAML files and calling prune() with options
const { prune } = require('../lib/prune');

let tmpDir;
let configPath;

function writeTmpYaml(content) {
  fs.writeFileSync(configPath, content, 'utf8');
}

function readTmpYaml() {
  return fs.readFileSync(configPath, 'utf8');
}

// Helper: capture console output
function captureConsole(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return logs;
}

describe('prune', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardioclaw-test-'));
    configPath = path.join(tmpDir, 'cardioclaw.yaml');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('does nothing when file does not exist', () => {
    const options = { config: path.join(tmpDir, 'nonexistent.yaml'), days: '30' };
    // Should call process.exit(1) — we mock that
    const origExit = process.exit;
    let exitCode;
    process.exit = (code) => { exitCode = code; throw new Error('exit:' + code); };
    try {
      prune(options);
    } catch (e) {
      assert.ok(e.message.startsWith('exit:'), 'should have called process.exit');
      assert.equal(exitCode, 1);
    } finally {
      process.exit = origExit;
    }
  });

  test('reports nothing to prune when heartbeats_completed is empty', () => {
    writeTmpYaml(`
heartbeats:
  - name: Active Job
    schedule: "0 8 * * *"
    prompt: Do something
heartbeats_completed: []
`);
    const options = { config: configPath, days: '30' };
    const logs = captureConsole(() => prune(options));
    assert.ok(logs.some(l => l.includes('No completed one-shots')), 'should report nothing to prune');
  });

  test('dry-run does not modify the file', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const yaml = `
heartbeats: []
heartbeats_completed:
  - name: Old Job
    schedule: at 2025-01-01 09:00
    prompt: Do it
    executed_at: "${oldDate.toISOString()}"
    status: ok
`;
    writeTmpYaml(yaml);
    const before = readTmpYaml();
    const options = { config: configPath, days: '30', dryRun: true };
    captureConsole(() => prune(options));
    const after = readTmpYaml();
    assert.equal(before, after, 'file should be unchanged after dry run');
  });

  test('removes completed one-shots older than --days', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);  // 60 days ago
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);  // 5 days ago

    writeTmpYaml(`
heartbeats: []
heartbeats_completed:
  - name: Old Job
    schedule: at 2025-01-01 09:00
    prompt: Old
    executed_at: "${oldDate.toISOString()}"
    status: ok
  - name: Recent Job
    schedule: at 2025-06-01 09:00
    prompt: Recent
    executed_at: "${recentDate.toISOString()}"
    status: ok
`);
    const options = { config: configPath, days: '30' };
    captureConsole(() => prune(options));
    const content = readTmpYaml();
    assert.ok(!content.includes('Old Job'), 'old job should be removed');
    assert.ok(content.includes('Recent Job'), 'recent job should be kept');
  });

  test('removes completed one-shots before --before date', () => {
    const oldDate = new Date('2025-01-15');
    const recentDate = new Date('2025-03-15');

    writeTmpYaml(`
heartbeats: []
heartbeats_completed:
  - name: Jan Job
    schedule: at 2025-01-15 09:00
    prompt: Jan
    executed_at: "${oldDate.toISOString()}"
    status: ok
  - name: Mar Job
    schedule: at 2025-03-15 09:00
    prompt: Mar
    executed_at: "${recentDate.toISOString()}"
    status: ok
`);
    const options = { config: configPath, before: '2025-02-01' };
    captureConsole(() => prune(options));
    const content = readTmpYaml();
    assert.ok(!content.includes('Jan Job'), 'jan job should be removed');
    assert.ok(content.includes('Mar Job'), 'mar job should be kept');
  });

  test('exits with error for invalid --days value', () => {
    writeTmpYaml('heartbeats: []\nheartbeats_completed: []\n');
    const options = { config: configPath, days: 'banana' };
    const origExit = process.exit;
    let exitCode;
    process.exit = (code) => { exitCode = code; throw new Error('exit:' + code); };
    try {
      prune(options);
    } catch (e) {
      assert.equal(exitCode, 1, 'should exit with code 1');
    } finally {
      process.exit = origExit;
    }
  });

  test('exits with error when neither --days nor --before provided', () => {
    writeTmpYaml('heartbeats: []\nheartbeats_completed: []\n');
    const options = { config: configPath };
    const origExit = process.exit;
    let exitCode;
    process.exit = (code) => { exitCode = code; throw new Error('exit:' + code); };
    try {
      prune(options);
    } catch (e) {
      assert.equal(exitCode, 1, 'should exit with code 1');
    } finally {
      process.exit = origExit;
    }
  });

  test('preserves active heartbeats untouched', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    writeTmpYaml(`
heartbeats:
  - name: Live Job
    schedule: "0 8 * * *"
    prompt: Still running
heartbeats_completed:
  - name: Dead Job
    schedule: at 2025-01-01 09:00
    prompt: Done
    executed_at: "${oldDate.toISOString()}"
    status: ok
`);
    const options = { config: configPath, days: '30' };
    captureConsole(() => prune(options));
    const content = readTmpYaml();
    assert.ok(content.includes('Live Job'), 'active heartbeat should be preserved');
    assert.ok(!content.includes('Dead Job'), 'old completed job should be removed');
  });
});
