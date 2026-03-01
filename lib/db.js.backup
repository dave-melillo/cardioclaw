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
      started_at INTEGER NOT NULL,   -- Unix timestamp (ms)
      ended_at INTEGER,              -- NULL if still running
      duration_ms INTEGER,           -- ended_at - started_at
      status TEXT,                   -- 'ok' | 'error' | 'timeout'
      error TEXT,                    -- Error message (if any)
      session_id TEXT,               -- OpenClaw session id (if available)
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);');

  // Migrate runs table (add duration_ms and session_id if missing)
  try {
    const columns = db.prepare("PRAGMA table_info(runs)").all();
    const columnNames = columns.map(c => c.name);
    
    if (!columnNames.includes('duration_ms')) {
      db.exec('ALTER TABLE runs ADD COLUMN duration_ms INTEGER');
    }
    if (!columnNames.includes('session_id')) {
      db.exec('ALTER TABLE runs ADD COLUMN session_id TEXT');
    }
  } catch (err) {
    // Ignore migration errors (table might not exist yet)
  }
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

function clearAllJobs(db) {
  db.prepare('DELETE FROM jobs').run();
}

function removeStaleJobs(db, currentJobIds) {
  if (!currentJobIds || currentJobIds.length === 0) {
    return 0;
  }
  const placeholders = currentJobIds.map(() => '?').join(',');
  const stmt = db.prepare(`DELETE FROM jobs WHERE id NOT IN (${placeholders})`);
  const result = stmt.run(...currentJobIds);
  return result.changes;
}

function recordRun(db, run) {
  const stmt = db.prepare(`
    INSERT INTO runs (job_id, job_name, started_at, ended_at, duration_ms, status, error, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    run.job_id,
    run.job_name,
    run.started_at,
    run.ended_at,
    run.duration_ms,
    run.status,
    run.error,
    run.session_id
  );
}

function getRunsForJob(db, jobId, limit = 20) {
  return db.prepare(`
    SELECT * FROM runs 
    WHERE job_id = ? 
    ORDER BY started_at DESC 
    LIMIT ?
  `).all(jobId, limit);
}

function getRunsByJobName(db, jobName, limit = 20) {
  return db.prepare(`
    SELECT * FROM runs 
    WHERE job_name = ? 
    ORDER BY started_at DESC 
    LIMIT ?
  `).all(jobName, limit);
}

function getAllRuns(db, limit = 50) {
  return db.prepare(`
    SELECT * FROM runs 
    ORDER BY started_at DESC 
    LIMIT ?
  `).all(limit);
}

function getRunsSummary(db, daysBack = 7) {
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  return db.prepare(`
    SELECT 
      job_name,
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful_runs,
      AVG(duration_ms) as avg_duration_ms
    FROM runs
    WHERE started_at > ?
    GROUP BY job_name
  `).all(cutoff);
}

function pruneRuns(db, daysBack = 90, keepPerJob = 100) {
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  
  // Delete old runs
  const deletedOld = db.prepare('DELETE FROM runs WHERE started_at < ?').run(cutoff);
  
  // Keep only last N per job
  const jobIds = db.prepare('SELECT DISTINCT job_id FROM jobs').all();
  let deletedExcess = 0;
  
  for (const { job_id } of jobIds) {
    const toDelete = db.prepare(`
      SELECT id FROM runs
      WHERE job_id = ?
      ORDER BY started_at DESC
      LIMIT -1 OFFSET ?
    `).all(job_id, keepPerJob);
    
    for (const row of toDelete) {
      db.prepare('DELETE FROM runs WHERE id = ?').run(row.id);
      deletedExcess++;
    }
  }
  
  return {
    deletedOld: deletedOld.changes,
    deletedExcess
  };
}

module.exports = {
  getDatabase,
  upsertJob,
  getAllJobs,
  getManagedJobs,
  getUnmanagedJobs,
  getFailingJobs,
  getJobByName,
  clearAllJobs,
  removeStaleJobs,
  recordRun,
  getRunsForJob,
  getRunsByJobName,
  getAllRuns,
  getRunsSummary,
  pruneRuns,
  DB_PATH
};
