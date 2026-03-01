/**
 * Validation for CardioClaw YAML configs
 */

const fs = require('fs');
const yaml = require('js-yaml');
const os = require('os');
const path = require('path');

function validate(options) {
  const configPath = findConfigPath(options.config);
  
  if (!configPath) {
    console.error('✗ No cardioclaw.yaml found');
    process.exit(1);
  }

  console.log(`\n🔍 Validating: ${configPath}\n`);

  let config;
  try {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(fileContent);
  } catch (err) {
    console.error(`✗ YAML parse error: ${err.message}\n`);
    process.exit(1);
  }

  const errors = [];
  const warnings = [];

  // Validate agents[] section
  if (config.agents && Array.isArray(config.agents)) {
    console.log(`📋 Validating ${config.agents.length} agent(s)...\n`);

    for (const agent of config.agents) {
      // Check required fields
      if (!agent.id) {
        errors.push(`Agent missing required field: id`);
        continue;
      }

      // Check workspace exists
      const workspacePath = path.join(os.homedir(), '.openclaw', `workspace-${agent.id}`);
      if (!fs.existsSync(workspacePath)) {
        warnings.push(`Agent ${agent.id}: workspace not found at ${workspacePath}`);
      }

      // Validate heartbeat config
      if (agent.heartbeat) {
        if (!agent.heartbeat.interval && agent.heartbeat.enabled !== false) {
          warnings.push(`Agent ${agent.id}: heartbeat enabled but no interval specified`);
        }

        // Check interval format
        if (agent.heartbeat.interval && !agent.heartbeat.interval.match(/^\d+(s|m|h|d)$/)) {
          warnings.push(`Agent ${agent.id}: invalid interval format "${agent.heartbeat.interval}" (use: 30s, 5m, 1h, etc.)`);
        }

        // Warn on very short intervals
        if (agent.heartbeat.interval) {
          const match = agent.heartbeat.interval.match(/^(\d+)(s|m|h|d)$/);
          if (match) {
            const [, value, unit] = match;
            const minutes = unit === 's' ? parseInt(value) / 60 :
                           unit === 'm' ? parseInt(value) :
                           unit === 'h' ? parseInt(value) * 60 :
                           parseInt(value) * 1440;
            
            if (minutes < 5) {
              warnings.push(`Agent ${agent.id}: very short interval (${agent.heartbeat.interval}) may cause spam`);
            }
          }
        }
      }

      // Check checklist size
      if (agent.checklist) {
        const lines = agent.checklist.split('\n').length;
        if (lines > 500) {
          warnings.push(`Agent ${agent.id}: very large checklist (${lines} lines) may cause token bloat`);
        }
      }
    }
  }

  // Validate cron_jobs[] section
  const jobs = config.cron_jobs || config.heartbeats || [];
  if (jobs.length > 0) {
    console.log(`📋 Validating ${jobs.length} cron job(s)...\n`);

    for (const job of jobs) {
      if (!job.name) {
        errors.push(`Cron job missing required field: name`);
        continue;
      }

      if (!job.schedule) {
        errors.push(`Cron job "${job.name}": missing required field: schedule`);
      }

      if (!job.prompt && !job.message) {
        errors.push(`Cron job "${job.name}": must provide either prompt or message`);
      }

      // Check for duplicate names
      const duplicates = jobs.filter(j => j.name === job.name);
      if (duplicates.length > 1) {
        warnings.push(`Duplicate cron job name: "${job.name}"`);
      }
    }
  }

  // Results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Validation passed - no issues found\n');
    return;
  }

  if (errors.length > 0) {
    console.log(`❌ Errors (${errors.length}):\n`);
    errors.forEach(err => console.log(`   • ${err}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️  Warnings (${warnings.length}):\n`);
    warnings.forEach(warn => console.log(`   • ${warn}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('✗ Validation failed\n');
    process.exit(1);
  } else {
    console.log('✓ Validation passed with warnings\n');
  }
}

function findConfigPath(configArg) {
  if (fs.existsSync(configArg)) {
    return path.resolve(configArg);
  }

  const homeConfig = path.join(os.homedir(), '.cardioclaw', 'cardioclaw.yaml');
  if (fs.existsSync(homeConfig)) {
    return homeConfig;
  }

  return null;
}

module.exports = { validate };
