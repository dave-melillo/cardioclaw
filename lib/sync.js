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

  let created = 0;
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
  console.log(`  ✓ ${created} job(s) ${options.dryRun ? 'would be created' : 'created'}`);
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
