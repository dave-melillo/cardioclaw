const { execSync } = require('child_process');
const fs = require('fs');
const yaml = require('js-yaml');
const { getDatabase, upsertJob } = require('./db');

/**
 * Discover all OpenClaw cron jobs and consolidate with cardioclaw.yaml
 */
function discover(configPath) {
  console.log('🔍 Discovering heartbeats...');
  
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
  if (configPath && fs.existsSync(configPath)) {
    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(fileContent);
      if (config.heartbeats && Array.isArray(config.heartbeats)) {
        managedNames = new Set(config.heartbeats.map(h => h.name));
        console.log(`  Found ${managedNames.size} managed heartbeat(s) in YAML`);
      }
    } catch (err) {
      console.warn('  ⚠ Could not parse cardioclaw.yaml');
    }
  }

  // 3. Update SQLite
  const db = getDatabase();
  
  for (const job of cronJobs) {
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
    
    upsertJob(db, {
      id: job.jobId,
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
  
  db.close();
  console.log('  ✓ Updated state database\n');
}

module.exports = { discover };
