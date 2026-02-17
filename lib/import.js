/**
 * Import existing OpenClaw cron jobs into cardioclaw.yaml
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

/**
 * Convert OpenClaw cron job to YAML heartbeat format
 */
function jobToHeartbeat(job) {
  const hb = {
    name: job.name
  };
  
  // Convert schedule
  if (job.schedule) {
    if (job.schedule.kind === 'cron') {
      hb.schedule = job.schedule.expr;
    } else if (job.schedule.kind === 'at') {
      // Convert ISO timestamp to "at YYYY-MM-DD HH:MM"
      const date = new Date(job.schedule.at);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      hb.schedule = `at ${yyyy}-${mm}-${dd} ${hh}:${min}`;
    } else if (job.schedule.kind === 'every') {
      // Convert interval to cron-ish description
      const ms = job.schedule.everyMs;
      const hours = ms / (1000 * 60 * 60);
      if (hours >= 1) {
        hb.schedule = `0 */${Math.round(hours)} * * *`;
      } else {
        const mins = ms / (1000 * 60);
        hb.schedule = `*/${Math.round(mins)} * * * *`;
      }
    }
  }
  
  // Convert payload
  if (job.payload) {
    if (job.payload.kind === 'agentTurn') {
      hb.prompt = job.payload.message;
      if (job.payload.model) {
        hb.model = job.payload.model;
      }
    } else if (job.payload.kind === 'systemEvent') {
      hb.message = job.payload.text;
      hb.sessionTarget = 'main';
    }
  }
  
  // Convert delivery
  if (job.delivery && job.delivery.mode === 'announce') {
    hb.delivery = job.delivery.channel || 'telegram';
  }
  
  // Convert sessionTarget
  if (job.sessionTarget === 'main') {
    hb.sessionTarget = 'main';
  }
  
  return hb;
}

/**
 * Import all OpenClaw cron jobs to YAML
 */
function importJobs(options) {
  const configPath = resolveConfigPath(options.config);
  const dryRun = options.dryRun || false;
  
  console.log('');
  console.log('🔍 Fetching OpenClaw cron jobs...');
  
  // 1. Fetch OpenClaw cron jobs
  let cronJobs = [];
  try {
    const result = spawnSync('openclaw', ['cron', 'list', '--json'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (result.status !== 0) {
      throw new Error(result.stderr ? result.stderr.toString().trim() : 'non-zero exit');
    }
    const output = result.stdout || '';
    // Extract JSON from output (skip any non-JSON lines)
    let jsonStr = output;
    const jsonStartIdx = output.indexOf('{');
    if (jsonStartIdx > 0) {
      jsonStr = output.substring(jsonStartIdx);
    }
    
    const parsed = JSON.parse(jsonStr);
    cronJobs = parsed.jobs || [];
  } catch (err) {
    console.error('❌ Failed to query OpenClaw cron jobs');
    console.error(`   Error: ${err.message}`);
    process.exit(1);
  }
  
  if (cronJobs.length === 0) {
    console.log('   No cron jobs found in OpenClaw.');
    console.log('');
    return;
  }
  
  console.log(`   Found ${cronJobs.length} job(s)`);
  console.log('');
  
  // 2. Load existing YAML (if any)
  let existingHeartbeats = [];
  let existingNames = new Set();
  
  if (fs.existsSync(configPath)) {
    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(fileContent);
      if (config && config.heartbeats && Array.isArray(config.heartbeats)) {
        existingHeartbeats = config.heartbeats;
        existingNames = new Set(existingHeartbeats.map(h => h.name));
        console.log(`📖 Existing config: ${existingHeartbeats.length} heartbeat(s)`);
      }
    } catch (err) {
      console.warn(`⚠ Could not parse existing config: ${err.message}`);
    }
  }
  
  // 3. Convert jobs to heartbeats
  const newHeartbeats = [];
  const skipped = [];
  
  for (const job of cronJobs) {
    // Skip if already in YAML
    if (existingNames.has(job.name)) {
      skipped.push(job.name);
      continue;
    }
    
    try {
      const hb = jobToHeartbeat(job);
      if (hb.schedule && (hb.prompt || hb.message)) {
        newHeartbeats.push(hb);
      }
    } catch (err) {
      console.warn(`⚠ Could not convert job "${job.name}": ${err.message}`);
    }
  }
  
  // 4. Report
  console.log('📊 Import summary:');
  console.log(`   → ${newHeartbeats.length} new heartbeat(s) to add`);
  if (skipped.length > 0) {
    console.log(`   → ${skipped.length} skipped (already in YAML)`);
  }
  console.log('');
  
  if (newHeartbeats.length === 0) {
    console.log('✅ Nothing to import - YAML is already up to date.');
    console.log('');
    return;
  }
  
  // 5. Preview new heartbeats
  console.log('📝 New heartbeats:');
  for (const hb of newHeartbeats) {
    const schedulePreview = hb.schedule.length > 30 
      ? hb.schedule.substring(0, 30) + '...' 
      : hb.schedule;
    console.log(`   • ${hb.name}`);
    console.log(`     Schedule: ${schedulePreview}`);
  }
  console.log('');
  
  if (dryRun) {
    console.log('🔸 Dry run - no changes made.');
    console.log(`   Would write to: ${configPath}`);
    console.log('');
    return;
  }
  
  // 6. Merge and write
  const allHeartbeats = [...existingHeartbeats, ...newHeartbeats];
  const newConfig = {
    heartbeats: allHeartbeats
  };
  
  // Ensure directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Write YAML with nice formatting
  const yamlStr = yaml.dump(newConfig, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false
  });
  
  // Add header comment
  const header = `# CardioClaw Configuration
# Docs: https://github.com/dave-melillo/cardioclaw
# Imported: ${new Date().toISOString()}

`;
  
  fs.writeFileSync(configPath, header + yamlStr);
  
  console.log(`✅ Imported ${newHeartbeats.length} heartbeat(s)`);
  console.log(`   Written to: ${configPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('   1. Review: nano ' + configPath);
  console.log('   2. Check status: cardioclaw status');
  console.log('');
}

/**
 * Resolve config path with fallbacks
 */
function resolveConfigPath(configArg) {
  // 1. Explicit arg
  if (configArg && configArg !== 'cardioclaw.yaml') {
    return configArg;
  }
  
  // 2. Current directory
  if (fs.existsSync('./cardioclaw.yaml')) {
    return './cardioclaw.yaml';
  }
  
  // 3. Home directory (default)
  const homeConfig = path.join(os.homedir(), '.cardioclaw', 'cardioclaw.yaml');
  return homeConfig;
}

module.exports = { importJobs, jobToHeartbeat };
