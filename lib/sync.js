const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const { buildCronArgs } = require('./parser');
const { discover } = require('./discovery');
const { archiveCompletedOneShots } = require('./archive');
const { getDatabase, pruneRuns } = require('./db');

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

  if (!config || !config.heartbeats || !Array.isArray(config.heartbeats)) {
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
              // Use spawnSync with arg array — no shell injection
              const result = spawnSync('openclaw', ['cron', 'remove', existingJob.id], { stdio: 'pipe' });
              if (result.status !== 0) {
                throw new Error(`Failed to remove job ${existingJob.id}`);
              }
            }
            console.log(`↻ Replacing: ${hb.name}`);
          }
        } else {
          console.log(`⊘ Exists: ${hb.name}`);
          skipped++;
          continue;
        }
      }

      const [cmd, args] = buildCronArgs(hb, config.defaults || {});

      if (options.dryRun) {
        console.log(`[DRY RUN] ${hb.name}`);
        console.log(`  Command: ${cmd} ${args.join(' ')}\n`);
      } else {
        const result = spawnSync(cmd, args, { stdio: 'pipe' });
        if (result.status !== 0) {
          const errMsg = result.stderr ? result.stderr.toString().trim() : 'unknown error';
          throw new Error(errMsg);
        }
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

  // Archive completed one-shots (unless dry run)
  if (!options.dryRun) {
    const archiveResult = archiveCompletedOneShots(configPath);
    if (archiveResult.archived > 0) {
      console.log(`\n📦 Archived ${archiveResult.archived} completed one-shot(s) to heartbeats_completed`);
    }
    if (archiveResult.errors.length > 0) {
      archiveResult.errors.forEach(err => console.error(`  ⚠️  ${err}`));
    }
  }

  // Auto-prune old runs (unless dry run)
  if (!options.dryRun) {
    try {
      const db = getDatabase();
      const pruneResult = pruneRuns(db, 90, 100);
      db.close();
      // Silent unless verbose mode (PRD says auto-pruning should be silent)
    } catch (err) {
      // Ignore pruning errors
    }
  }
}

function getExistingJobs() {
  const result = spawnSync('openclaw', ['cron', 'list', '--json'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8'
  });

  if (result.error) {
    throw new Error(`Failed to run openclaw cron list: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`openclaw cron list exited ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }

  const output = result.stdout || '';
  const jsonStart = output.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('openclaw cron list returned no JSON — cannot detect existing jobs');
  }

  let parsed;
  try {
    parsed = JSON.parse(output.slice(jsonStart));
  } catch (err) {
    throw new Error(`Failed to parse openclaw cron list output: ${err.message}`);
  }

  const jobs = parsed.jobs || parsed;
  if (!Array.isArray(jobs)) {
    throw new Error('Unexpected response shape from openclaw cron list (expected array)');
  }
  return jobs;
}

function findConfigPath(configArg) {
  // Check explicit path first
  if (fs.existsSync(configArg)) {
    return path.resolve(configArg);
  }

  // Check ~/.cardioclaw/cardioclaw.yaml
  const homeConfig = path.join(os.homedir(), '.cardioclaw', 'cardioclaw.yaml');
  if (fs.existsSync(homeConfig)) {
    return homeConfig;
  }

  return null;
}

module.exports = { sync };
