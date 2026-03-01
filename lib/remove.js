const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');

function remove(name, options) {
  if (!name) {
    console.error('✗ Please provide a heartbeat name to remove');
    process.exit(1);
  }

  console.log(`\n🗑️  Removing: "${name}"\n`);

  // 1. Find and remove from OpenClaw
  const jobs = getExistingJobs();
  const matchingJobs = jobs.filter(j => j.name === name);

  if (matchingJobs.length === 0) {
    console.log('  ⊘ Not found in OpenClaw cron jobs');
  } else {
    for (const job of matchingJobs) {
      if (options.dryRun) {
        console.log(`  [DRY RUN] Would remove from OpenClaw: ${job.id}`);
      } else {
        try {
          // Use spawnSync with arg array — no shell injection
          const result = spawnSync('openclaw', ['cron', 'remove', job.id], { stdio: 'pipe' });
          if (result.status !== 0) {
            throw new Error(result.stderr ? result.stderr.toString().trim() : 'non-zero exit');
          }
          console.log(`  ✓ Removed from OpenClaw: ${job.id}`);
        } catch (err) {
          console.log(`  ✗ Failed to remove from OpenClaw: ${job.id}`);
        }
      }
    }
  }

  // 2. Remove from YAML
  const configPath = findConfigPath(options.config);
  if (!configPath) {
    console.log('  ⊘ No cardioclaw.yaml found');
  } else {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(content);

      if (!config.heartbeats || !Array.isArray(config.heartbeats)) {
        console.log('  ⊘ No heartbeats in YAML');
      } else {
        const before = config.heartbeats.length;
        config.heartbeats = config.heartbeats.filter(hb => hb.name !== name);
        const after = config.heartbeats.length;

        if (before === after) {
          console.log('  ⊘ Not found in YAML');
        } else {
          if (options.dryRun) {
            console.log(`  [DRY RUN] Would remove from YAML`);
          } else {
            fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }));
            console.log(`  ✓ Removed from YAML`);
          }
        }
      }
    } catch (err) {
      console.log(`  ✗ Failed to update YAML: ${err.message}`);
    }
  }

  console.log('');
}

function removeHeartbeatFromYaml(content, name) {
  // Split into lines and find the heartbeat block to remove
  const lines = content.split('\n');
  const result = [];
  let inTargetBlock = false;
  let blockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is the start of our target heartbeat
    if (line.match(/^\s*-\s*name:\s*/) && line.includes(name)) {
      // Check for exact match (handle quotes)
      const nameMatch = line.match(/name:\s*["']?([^"'\n]+)["']?/);
      if (nameMatch && nameMatch[1].trim() === name) {
        inTargetBlock = true;
        blockIndent = line.match(/^(\s*)/)[1].length;
        continue; // Skip this line
      }
    }

    if (inTargetBlock) {
      // Check if we've left the block (new item at same or lower indent, or new section)
      const currentIndent = line.match(/^(\s*)/)[1].length;
      const isNewItem = line.match(/^\s*-\s*name:/);
      const isEmpty = line.trim() === '';
      
      if (isNewItem || (currentIndent <= blockIndent && !isEmpty && line.trim() !== '')) {
        inTargetBlock = false;
        result.push(line);
      }
      // Skip lines in the target block
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

function getExistingJobs() {
  try {
    const result = spawnSync('openclaw', ['cron', 'list', '--json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    if (result.status !== 0) return [];
    const output = result.stdout || '';
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) return [];
    const jsonStr = output.slice(jsonStart);
    const parsed = JSON.parse(jsonStr);
    return parsed.jobs || [];
  } catch (err) {
    return [];
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

module.exports = { remove };
