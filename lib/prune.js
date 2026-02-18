const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

/**
 * Resolve config path with home-dir fallback (mirrors sync.js behaviour).
 */
function findConfigPath(configArg) {
  if (fs.existsSync(configArg)) return path.resolve(configArg);
  const homeConfig = path.join(os.homedir(), '.cardioclaw', 'cardioclaw.yaml');
  if (fs.existsSync(homeConfig)) return homeConfig;
  return null;
}

/**
 * Prune old completed one-shot heartbeats from YAML
 */
function prune(options) {
  const configPath = findConfigPath(options.config || 'cardioclaw.yaml');
  
  if (!configPath) {
    console.error('✗ Config file not found');
    console.error('  Checked: ' + (options.config || 'cardioclaw.yaml'));
    console.error('           ~/.cardioclaw/cardioclaw.yaml');
    process.exit(1);
  }

  // Read current YAML
  const fileContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContent);

  if (!config.heartbeats_completed || config.heartbeats_completed.length === 0) {
    console.log('No completed one-shots to prune.\n');
    return;
  }

  const originalCount = config.heartbeats_completed.length;

  // Determine cutoff date
  let cutoffDate;
  if (options.before) {
    cutoffDate = new Date(options.before);
    if (isNaN(cutoffDate.getTime())) {
      console.error('✗ Invalid date format for --before. Use YYYY-MM-DD');
      process.exit(1);
    }
  } else if (options.days) {
    const days = parseInt(options.days, 10);
    if (isNaN(days) || days < 0) {
      console.error('✗ Invalid value for --days. Must be a positive number');
      process.exit(1);
    }
    cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
  } else {
    console.error('✗ Must provide either --days or --before');
    console.log('Examples:');
    console.log('  cardioclaw prune --days 30');
    console.log('  cardioclaw prune --before 2026-01-01');
    process.exit(1);
  }

  console.log(`\n🗑️  Pruning completed one-shots older than ${cutoffDate.toLocaleDateString()}\n`);

  // Filter completed heartbeats
  const kept = [];
  const removed = [];

  for (const heartbeat of config.heartbeats_completed) {
    const executedAt = heartbeat.executed_at ? new Date(heartbeat.executed_at) : null;
    
    if (!executedAt) {
      // No execution date, keep it
      kept.push(heartbeat);
      continue;
    }

    if (executedAt < cutoffDate) {
      removed.push(heartbeat);
    } else {
      kept.push(heartbeat);
    }
  }

  if (removed.length === 0) {
    console.log('No completed one-shots older than cutoff date.\n');
    return;
  }

  // Show what will be removed
  console.log(`Found ${removed.length} completed one-shot(s) to remove:\n`);
  removed.forEach(job => {
    const executedAt = new Date(job.executed_at).toLocaleDateString();
    const statusIcon = job.status === 'error' ? '✗' : '✓';
    console.log(`  ${statusIcon} ${job.name} (executed ${executedAt})`);
  });
  console.log('');

  if (options.dryRun) {
    console.log('🏃 Dry run - no changes made\n');
    return;
  }

  // Update config
  config.heartbeats_completed = kept;

  // Write back to file
  try {
    const yamlStr = yaml.dump(config, {
      lineWidth: -1,
      noRefs: true
    });
    fs.writeFileSync(configPath, yamlStr, 'utf8');
    console.log(`✅ Removed ${removed.length} completed one-shot(s) from ${configPath}`);
    console.log(`   Remaining: ${kept.length}\n`);
  } catch (err) {
    console.error(`✗ Failed to write YAML: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { prune };
