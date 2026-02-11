const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB_DIR = path.join(os.homedir(), '.cardioclaw');
const DB_PATH = path.join(DB_DIR, 'state.db');

function getDatabase() {
  // Ensure directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Initialize schema if needed
  initSchema(db);
  
  return db;
}

function initSchema(db) {
  // Jobs table - all discovered OpenClaw cron jobs
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,           -- OpenClaw cron job id
      name TEXT NOT NULL,
      schedule TEXT,                 -- JSON schedule object
      agent TEXT,
      status TEXT DEFAULT 'active',  -- 'active' | 'failing' | 'disabled'
      next_run_at INTEGER,           -- Unix timestamp (ms)
      last_run_at INTEGER,
      last_status TEXT,              -- 'ok' | 'error'
      last_error TEXT,
      managed INTEGER DEFAULT 0,     -- 1 if from cardioclaw.yaml
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  // Create index on name for faster lookups
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_managed ON jobs(managed);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run_at);');

  // Runs table - historical run data
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      job_name TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      status TEXT,                   -- 'ok' | 'error'
      error TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);');
}

function upsertJob(db, job) {
  const stmt = db.prepare(`
    INSERT INTO jobs (id, name, schedule, agent, status, next_run_at, last_run_at, last_status, last_error, managed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      schedule = excluded.schedule,
      agent = excluded.agent,
      status = excluded.status,
      next_run_at = excluded.next_run_at,
      last_run_at = excluded.last_run_at,
      last_status = excluded.last_status,
      last_error = excluded.last_error,
      managed = excluded.managed,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    job.id,
    job.name,
    job.schedule,
    job.agent,
    job.status,
    job.next_run_at,
    job.last_run_at,
    job.last_status,
    job.last_error,
    job.managed ? 1 : 0,
    Date.now()
  );
}

function getAllJobs(db) {
  return db.prepare('SELECT * FROM jobs ORDER BY next_run_at').all();
}

function getManagedJobs(db) {
  return db.prepare('SELECT * FROM jobs WHERE managed = 1 ORDER BY next_run_at').all();
}

function getUnmanagedJobs(db) {
  return db.prepare('SELECT * FROM jobs WHERE managed = 0 ORDER BY next_run_at').all();
}

function getFailingJobs(db) {
  return db.prepare("SELECT * FROM jobs WHERE status = 'failing' ORDER BY name").all();
}

function getJobByName(db, name) {
  return db.prepare('SELECT * FROM jobs WHERE name = ?').get(name);
}

function recordRun(db, run) {
  const stmt = db.prepare(`
    INSERT INTO runs (job_id, job_name, started_at, ended_at, status, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    run.job_id,
    run.job_name,
    run.started_at,
    run.ended_at,
    run.status,
    run.error
  );
}

module.exports = {
  getDatabase,
  upsertJob,
  getAllJobs,
  getManagedJobs,
  getUnmanagedJobs,
  getFailingJobs,
  getJobByName,
  recordRun,
  DB_PATH
};
