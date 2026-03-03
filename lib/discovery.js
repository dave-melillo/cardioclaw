/**
 * CardioClaw 1.0 Discover
 * 
 * Read-only scan of OpenClaw configs. Outputs counts to stdout.
 * Does NOT modify any files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_HOME, 'openclaw.json');
const CRON_JOBS_FILE = path.join(OPENCLAW_HOME, 'cron', 'jobs.json');

/**
 * Discover all scheduled assets from OpenClaw configs
 * Returns counts and exits with appropriate code
 */
function discover(options = {}) {
  console.log('🔍 CardioClaw Discover\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  let heartbeatCount = 0;
  let cronJobCount = 0;
  let errors = [];
  
  // Scan heartbeats from openclaw.json
  console.log('📍 Heartbeats (from openclaw.json)\n');
  
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG)) {
      throw new Error(`File not found: ${OPENCLAW_CONFIG}`);
    }
    
    const configContent = fs.readFileSync(OPENCLAW_CONFIG, 'utf8');
    const config = JSON.parse(configContent);
    
    const agents = config.agents?.list || [];
    
    for (const agent of agents) {
      if (agent.heartbeat) {
        heartbeatCount++;
        const schedule = agent.heartbeat.every || 'disabled';
        console.log(`  • ${agent.id}: ${schedule}`);
      }
    }
    
    if (heartbeatCount === 0) {
      console.log('  (none configured)');
    }
    
    console.log(`\n  Total: ${heartbeatCount} heartbeat(s)\n`);
    
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}\n`);
    errors.push(`heartbeats: ${err.message}`);
  }
  
  // Scan cron jobs from jobs.json
  console.log('📍 Cron Jobs (from cron/jobs.json)\n');
  
  try {
    if (!fs.existsSync(CRON_JOBS_FILE)) {
      console.log('  (file not found - no cron jobs)\n');
    } else {
      const jobsContent = fs.readFileSync(CRON_JOBS_FILE, 'utf8');
      const jobsData = JSON.parse(jobsContent);
      const jobs = Array.isArray(jobsData) ? jobsData : (jobsData.jobs || []);
      
      cronJobCount = jobs.length;
      
      // Group by status
      const enabled = jobs.filter(j => j.enabled !== false);
      const disabled = jobs.filter(j => j.enabled === false);
      const failing = jobs.filter(j => j.state?.lastRunStatus === 'error');
      
      console.log(`  Enabled:  ${enabled.length}`);
      console.log(`  Disabled: ${disabled.length}`);
      console.log(`  Failing:  ${failing.length}`);
      
      console.log(`\n  Total: ${cronJobCount} cron job(s)\n`);
    }
    
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}\n`);
    errors.push(`cron jobs: ${err.message}`);
  }
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📊 Summary');
  console.log(`   Heartbeats: ${heartbeatCount}`);
  console.log(`   Cron Jobs:  ${cronJobCount}`);
  console.log(`   Total:      ${heartbeatCount + cronJobCount}`);
  console.log('');
  
  if (errors.length > 0) {
    console.log('⚠ Errors:');
    errors.forEach(e => console.log(`   • ${e}`));
    console.log('');
    process.exit(1);
  }
  
  // Return for programmatic use
  return {
    heartbeats: heartbeatCount,
    cronJobs: cronJobCount,
    total: heartbeatCount + cronJobCount
  };
}

module.exports = { discover };
