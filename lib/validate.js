/**
 * CardioClaw 1.0 Validate
 * 
 * Detect and report config issues WITHOUT modifying files.
 * Read-only validation of OpenClaw configs.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_HOME, 'openclaw.json');
const CRON_JOBS_FILE = path.join(OPENCLAW_HOME, 'cron', 'jobs.json');

/**
 * Validate cron expression (basic check)
 */
function isValidCronExpression(expr) {
  if (!expr || typeof expr !== 'string') return false;
  
  // Support 5-field (standard) and 6-field (with seconds) cron
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;
  
  // Basic validation - each field should be valid
  const validField = /^(\*|[\d,\-\/\*]+|\d+)$/;
  return parts.every(p => validField.test(p));
}

/**
 * Read HEARTBEAT.md content for an agent
 */
function findHeartbeatFile(agentId) {
  const paths = [
    path.join(OPENCLAW_HOME, `workspace-${agentId}`, 'HEARTBEAT.md'),
    path.join(OPENCLAW_HOME, 'agents', agentId, 'HEARTBEAT.md'),
    path.join(os.homedir(), 'clawd', 'HEARTBEAT.md')
  ];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

/**
 * Validate OpenClaw configs and report issues
 */
function validate(options = {}) {
  console.log('🔍 CardioClaw Validate\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  const warnings = [];
  const errors = [];
  
  // Track schedules for duplicate detection
  const scheduleMap = new Map(); // schedule -> [job names]
  
  // Validate heartbeats
  console.log('📍 Validating Heartbeats\n');
  
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG)) {
      errors.push({
        type: 'error',
        file: OPENCLAW_CONFIG,
        message: 'OpenClaw config file not found'
      });
    } else {
      const configContent = fs.readFileSync(OPENCLAW_CONFIG, 'utf8');
      const config = JSON.parse(configContent);
      
      const agents = config.agents?.list || [];
      
      for (const agent of agents) {
        if (agent.heartbeat) {
          // Check for missing HEARTBEAT.md
          const heartbeatPath = findHeartbeatFile(agent.id);
          if (!heartbeatPath) {
            warnings.push({
              type: 'warning',
              file: OPENCLAW_CONFIG,
              agent: agent.id,
              message: `Missing HEARTBEAT.md for agent '${agent.id}'`,
              suggestion: `Create ~/.openclaw/workspace-${agent.id}/HEARTBEAT.md`
            });
            console.log(`  ⚠ ${agent.id}: Missing HEARTBEAT.md`);
          } else {
            console.log(`  ✓ ${agent.id}: OK`);
          }
          
          // Track schedule for duplicate detection
          const schedule = agent.heartbeat.every;
          if (schedule) {
            const key = `heartbeat:${schedule}`;
            if (!scheduleMap.has(key)) {
              scheduleMap.set(key, []);
            }
            scheduleMap.get(key).push(`${agent.id} (heartbeat)`);
          }
        }
      }
      
      console.log('');
    }
  } catch (err) {
    errors.push({
      type: 'error',
      file: OPENCLAW_CONFIG,
      message: `Failed to parse config: ${err.message}`
    });
    console.error(`  ✗ Error: ${err.message}\n`);
  }
  
  // Validate cron jobs
  console.log('📍 Validating Cron Jobs\n');
  
  try {
    if (!fs.existsSync(CRON_JOBS_FILE)) {
      console.log('  (no cron jobs file)\n');
    } else {
      const jobsContent = fs.readFileSync(CRON_JOBS_FILE, 'utf8');
      const jobsData = JSON.parse(jobsContent);
      const jobs = Array.isArray(jobsData) ? jobsData : (jobsData.jobs || []);
      
      for (const job of jobs) {
        const jobIssues = [];
        
        // Check: announce mode without accountId
        if (job.delivery?.mode === 'announce' && !job.delivery?.accountId) {
          jobIssues.push({
            type: 'warning',
            message: 'announce mode without accountId',
            suggestion: 'Add delivery.accountId or change delivery.mode'
          });
        }
        
        // Check: message() in prompt with announce mode (potential double-send)
        const prompt = job.payload?.message || '';
        if (prompt.includes('message(') && job.delivery?.mode === 'announce') {
          jobIssues.push({
            type: 'warning',
            message: 'Potential double-send: prompt contains message() with announce mode',
            suggestion: 'Remove message() from prompt or set delivery.mode to "none"'
          });
        }
        
        // Check: invalid cron expression
        const cronExpr = job.schedule?.expr;
        if (cronExpr && !isValidCronExpression(cronExpr)) {
          jobIssues.push({
            type: 'error',
            message: `Invalid cron expression: ${cronExpr}`,
            suggestion: 'Use standard 5-field or 6-field cron format'
          });
        }
        
        // Track schedule for duplicate detection
        if (cronExpr) {
          const tz = job.schedule?.tz || 'default';
          const key = `cron:${cronExpr}:${tz}`;
          if (!scheduleMap.has(key)) {
            scheduleMap.set(key, []);
          }
          scheduleMap.get(key).push(job.name || job.id);
        }
        
        // Report job issues
        if (jobIssues.length > 0) {
          console.log(`  ⚠ ${job.name || job.id}:`);
          for (const issue of jobIssues) {
            console.log(`    • ${issue.message}`);
            if (issue.type === 'error') {
              errors.push({ ...issue, file: CRON_JOBS_FILE, job: job.name });
            } else {
              warnings.push({ ...issue, file: CRON_JOBS_FILE, job: job.name });
            }
          }
        } else {
          console.log(`  ✓ ${job.name || job.id}`);
        }
      }
      
      console.log('');
    }
  } catch (err) {
    errors.push({
      type: 'error',
      file: CRON_JOBS_FILE,
      message: `Failed to parse jobs: ${err.message}`
    });
    console.error(`  ✗ Error: ${err.message}\n`);
  }
  
  // Check for duplicate schedules
  console.log('📍 Checking for Duplicates\n');
  
  let duplicateCount = 0;
  for (const [schedule, names] of scheduleMap) {
    if (names.length > 1) {
      duplicateCount++;
      warnings.push({
        type: 'warning',
        message: `Duplicate schedule: ${names.join(', ')} all run at ${schedule}`,
        suggestion: 'Consider consolidating or staggering these jobs'
      });
      console.log(`  ⚠ ${schedule.split(':').slice(1).join(':')}`);
      console.log(`    Jobs: ${names.join(', ')}`);
    }
  }
  
  if (duplicateCount === 0) {
    console.log('  ✓ No duplicate schedules found');
  }
  
  console.log('');
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📊 Validation Summary');
  console.log(`   Errors:   ${errors.length}`);
  console.log(`   Warnings: ${warnings.length}`);
  console.log('');
  
  if (errors.length > 0) {
    console.log('❌ Errors (must fix):');
    for (const err of errors) {
      console.log(`   • ${err.message}`);
      if (err.file) console.log(`     File: ${err.file}`);
      if (err.suggestion) console.log(`     Fix: ${err.suggestion}`);
    }
    console.log('');
  }
  
  if (warnings.length > 0 && options.verbose) {
    console.log('⚠ Warnings:');
    for (const warn of warnings) {
      console.log(`   • ${warn.message}`);
      if (warn.job) console.log(`     Job: ${warn.job}`);
      if (warn.suggestion) console.log(`     Fix: ${warn.suggestion}`);
    }
    console.log('');
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All checks passed!\n');
  } else if (errors.length === 0) {
    console.log('✅ No errors (run with --verbose for warning details)\n');
  } else {
    process.exit(1);
  }
  
  return { errors, warnings };
}

module.exports = { validate };
