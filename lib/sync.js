const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');
const { buildCronCommand } = require('./parser');
const { discover } = require('./discovery');

function sync(options) {
  const configPath = findConfigPath(options.config);
  
  if (!configPath) {
    console.error('✗ No cardioclaw.yaml found');
    console.error('  Checked:');
    console.error(`    - ${options.config}`);
    console.error('    - ~/.cardioclaw/cardioclaw.yaml');
    process.exit(1);
  }

  console.log(`📖 Reading: ${configPath}`);
  
  let config;
  try {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(fileContent);
  } catch (err) {
    console.error(`✗ Failed to parse YAML: ${err.message}`);
    process.exit(1);
  }

  if (!config.heartbeats || !Array.isArray(config.heartbeats)) {
    console.error('✗ No heartbeats found in config');
    process.exit(1);
  }

  console.log(`\n🫀 Found ${config.heartbeats.length} heartbeat(s)\n`);

  // Get existing OpenClaw cron jobs
  const existingJobs = getExistingJobs();
  const existingNames = new Set(existingJobs.map(j => j.name));

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const hb of config.heartbeats) {
    try {
      // Validate required fields
      if (!hb.name) {
        throw new Error('Missing required field: name');
      }
      if (!hb.schedule) {
        throw new Error('Missing required field: schedule');
      }
      if (!hb.prompt && !hb.message) {
        throw new Error('Must provide either prompt or message');
      }

      // Check if job already exists
      if (existingNames.has(hb.name)) {
        if (options.force) {
          // Force mode: delete and recreate
          const existingJob = existingJobs.find(j => j.name === hb.name);
          if (existingJob) {
            if (!options.dryRun) {
              execSync(`openclaw cron remove ${existingJob.id}`, { stdio: 'pipe' });
            }
            console.log(`↻ Replacing: ${hb.name}`);
          }
        } else {
          console.log(`⊘ Exists: ${hb.name}`);
          skipped++;
          continue;
        }
      }

      const cmd = buildCronCommand(hb);
      
      if (options.dryRun) {
        console.log(`[DRY RUN] ${hb.name}`);
        console.log(`  Command: ${cmd}\n`);
      } else {
        execSync(cmd, { stdio: 'pipe' });
        console.log(`✓ Created: ${hb.name}`);
      }
      
      created++;
    } catch (err) {
      console.error(`✗ Failed: ${hb.name || 'unnamed'}`);
      console.error(`  Error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${options.dryRun ? '📋 Summary (dry run)' : '✅ Summary'}:`);
  if (created > 0) {
    console.log(`  ✓ ${created} job(s) ${options.dryRun ? 'would be created' : 'created'}`);
  }
  if (skipped > 0) {
    console.log(`  ⊘ ${skipped} job(s) skipped (already exist)`);
  }
  if (errors > 0) {
    console.log(`  ✗ ${errors} error(s)`);
    process.exit(1);
  }

  // Discover and update state after sync (unless dry run)
  if (!options.dryRun && created > 0) {
    console.log('');
    discover(configPath);
  }
}

function getExistingJobs() {
  try {
    const output = execSync('openclaw cron list --json', { 
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    // Extract JSON from output (may have warnings before it)
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) {
      return [];
    }
    const jsonStr = output.slice(jsonStart);
    const parsed = JSON.parse(jsonStr);
    const jobs = parsed.jobs || parsed;
    return Array.isArray(jobs) ? jobs : [];
  } catch (err) {
    // If cron list fails, assume no existing jobs
    return [];
  }
}

function findConfigPath(configArg) {
  // Check explicit path first
  if (fs.existsSync(configArg)) {
    return path.resolve(configArg);
  }

  // Check ~/.cardioclaw/cardioclaw.yaml
  const homeConfig = path.join(process.env.HOME, '.cardioclaw', 'cardioclaw.yaml');
  if (fs.existsSync(homeConfig)) {
    return homeConfig;
  }

  return null;
}

module.exports = { sync };
