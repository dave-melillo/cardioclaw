const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getDatabase, upsertJob, removeStaleJobs, recordRun } = require('./db');

/**
 * Resolve config path with fallbacks
 */
function resolveConfigPath(configArg) {
  // 1. Explicit arg (not default)
  if (configArg && configArg !== 'cardioclaw.yaml' && fs.existsSync(configArg)) {
    return configArg;
  }
  
  // 2. Current directory
  if (fs.existsSync('./cardioclaw.yaml')) {
    return './cardioclaw.yaml';
  }
  
  // 3. Home directory (default)
  const homeConfig = path.join(process.env.HOME, '.cardioclaw', 'cardioclaw.yaml');
  if (fs.existsSync(homeConfig)) {
    return homeConfig;
  }
  
  return null;
}

/**
 * Discover all OpenClaw cron jobs and consolidate with cardioclaw.yaml
 */
function discover(configPath) {
  console.log('🔍 Discovering heartbeats...');
  
  // Resolve actual config path
  const resolvedConfig = resolveConfigPath(configPath);
  
  // 1. Fetch OpenClaw cron jobs
  let cronJobs = [];
  try {
    const result = execSync('openclaw cron list --json 2>/dev/null', { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Extract JSON from output (skip any non-JSON lines)
    let jsonStr = result;
    const jsonStartIdx = result.indexOf('{');
    if (jsonStartIdx > 0) {
      jsonStr = result.substring(jsonStartIdx);
    }
    
    const parsed = JSON.parse(jsonStr);
    cronJobs = parsed.jobs || [];
    console.log(`  Found ${cronJobs.length} OpenClaw cron job(s)`);
  } catch (err) {
    console.error('  ✗ Failed to query OpenClaw cron jobs');
    console.error(`    Error: ${err.message}`);
    return;
  }

  // 2. Parse cardioclaw.yaml to identify managed jobs
  let managedNames = new Set();
  if (resolvedConfig) {
    try {
      const fileContent = fs.readFileSync(resolvedConfig, 'utf8');
      const config = yaml.load(fileContent);
      if (config.heartbeats && Array.isArray(config.heartbeats)) {
        managedNames = new Set(config.heartbeats.map(h => h.name));
        console.log(`  Found ${managedNames.size} managed heartbeat(s) in YAML`);
      }
    } catch (err) {
      console.warn(`  ⚠ Could not parse ${resolvedConfig}`);
    }
  }

  // 3. Update SQLite
  const db = getDatabase();
  const currentJobIds = [];
  
  for (const job of cronJobs) {
    currentJobIds.push(job.id);
    // Determine if managed
    const isManaged = managedNames.has(job.name);
    
    // Determine status
    let status = 'active';
    if (!job.enabled) {
      status = 'disabled';
    } else if (job.state?.lastRunStatus === 'error') {
      status = 'failing';
    }
    
    // Extract schedule info
    const scheduleStr = JSON.stringify(job.schedule || {});
    
    // Extract next/last run times
    const nextRunAt = job.state?.nextRunAtMs || null;
    const lastRunAt = job.state?.lastRunAtMs || null;
    const lastStatus = job.state?.lastRunStatus || null;
    const lastError = job.state?.lastRunError || null;
    
    // Extract agent (if available)
    let agent = null;
    if (job.payload?.agentId) {
      agent = job.payload.agentId;
    }
    
    // Check if this is a new run (capture execution history)
    const existingJob = db.prepare('SELECT last_run_at FROM jobs WHERE id = ?').get(job.id);
    if (existingJob && lastRunAt && lastRunAt > existingJob.last_run_at) {
      // New execution detected! Record it
      recordRun(db, {
        job_id: job.id,
        job_name: job.name,
        started_at: lastRunAt,
        ended_at: lastRunAt + (job.state?.lastDurationMs || 0),
        duration_ms: job.state?.lastDurationMs || null,
        status: lastStatus || 'ok',
        error: lastError || null,
        session_id: job.state?.lastSessionId || null
      });
    }
    
    upsertJob(db, {
      id: job.id,
      name: job.name,
      schedule: scheduleStr,
      agent,
      status,
      next_run_at: nextRunAt,
      last_run_at: lastRunAt,
      last_status: lastStatus,
      last_error: lastError,
      managed: isManaged
    });
  }
  
  // 4. Remove jobs no longer in OpenClaw
  const removed = removeStaleJobs(db, currentJobIds);
  if (removed > 0) {
    console.log(`  ✓ Removed ${removed} stale job(s)`);
  }
  
  db.close();
  console.log('  ✓ Updated state database\n');
}

module.exports = { discover };
