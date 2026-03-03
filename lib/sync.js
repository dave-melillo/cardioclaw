/**
 * CardioClaw 1.0 Sync
 * 
 * Reads from OpenClaw configs, writes unified Cardio format to cardioclaw.yml
 * This is READ-ONLY relative to OpenClaw - we only write to cardioclaw.yml
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_HOME, 'openclaw.json');
const CRON_JOBS_FILE = path.join(OPENCLAW_HOME, 'cron', 'jobs.json');

/**
 * Parse heartbeat interval string to milliseconds
 * Supports: "15m", "1h", "30s", "2h30m"
 */
function parseInterval(intervalStr) {
  if (!intervalStr) return null;
  
  let totalMs = 0;
  const regex = /(\d+)(s|m|h|d)/g;
  let match;
  
  while ((match = regex.exec(intervalStr)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': totalMs += value * 1000; break;
      case 'm': totalMs += value * 60 * 1000; break;
      case 'h': totalMs += value * 60 * 60 * 1000; break;
      case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
    }
  }
  
  return totalMs || null;
}

/**
 * Calculate next run time for heartbeat based on interval
 */
function calculateNextRun(intervalStr) {
  const intervalMs = parseInterval(intervalStr);
  if (!intervalMs) return null;
  return Date.now() + intervalMs;
}

/**
 * Read HEARTBEAT.md content for an agent
 */
function readHeartbeatContent(agentId) {
  const paths = [
    path.join(OPENCLAW_HOME, `workspace-${agentId}`, 'HEARTBEAT.md'),
    path.join(OPENCLAW_HOME, 'agents', agentId, 'HEARTBEAT.md'),
    path.join(os.homedir(), 'clawd', 'HEARTBEAT.md') // shared workspace
  ];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        return { content: fs.readFileSync(p, 'utf8'), path: p };
      } catch (err) {
        // Continue to next path
      }
    }
  }
  
  return { content: null, path: null };
}

/**
 * Transform agent heartbeat config to Cardio format
 */
function transformHeartbeat(agent, defaults, openclawConfig) {
  const agentId = agent.id;
  const heartbeat = agent.heartbeat || {};
  
  // Get heartbeat content
  const { content, path: contentPath } = readHeartbeatContent(agentId);
  
  // Determine model
  const model = heartbeat.model || 
                agent.model?.primary || 
                defaults.model?.primary || 
                'unknown';
  
  // Build warnings
  const warnings = [];
  if (!content) {
    warnings.push(`Missing HEARTBEAT.md for agent ${agentId}`);
  }
  
  return {
    id: `${agentId}-heartbeat`,
    name: `${capitalize(agentId)} Heartbeat`,
    type: 'heartbeat',
    enabled: !!heartbeat.every,
    
    schedule: heartbeat.every || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    
    model: model,
    content: content || '',
    agentId: agentId,
    
    delivery: {
      mode: 'auto',
      channel: heartbeat.target === 'last' ? 'last-channel' : (heartbeat.target || 'auto'),
      to: heartbeat.to || null,
      accountId: agentId
    },
    
    state: {
      nextRunAt: calculateNextRun(heartbeat.every),
      lastRunAt: null, // Would need gateway API
      lastStatus: 'unknown',
      consecutiveErrors: 0
    },
    
    source: {
      config: OPENCLAW_CONFIG,
      content: contentPath
    },
    
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Transform cron job to Cardio format
 */
function transformCronJob(job) {
  const warnings = [];
  
  // Detect potential issues
  if (job.delivery?.mode === 'announce' && !job.delivery?.accountId) {
    warnings.push('announce mode without accountId');
  }
  
  // Check for message() in prompt with announce mode
  const message = job.payload?.message || '';
  if (message.includes('message(') && job.delivery?.mode === 'announce') {
    warnings.push('Potential double-send: prompt contains message() with announce mode');
  }
  
  return {
    id: job.id,
    name: job.name || 'Unnamed Job',
    type: 'cron',
    enabled: job.enabled !== false,
    
    schedule: job.schedule?.expr || null,
    timezone: job.schedule?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
    
    model: job.payload?.model || null,
    content: job.payload?.message || '',
    agentId: job.payload?.agentId || parseAgentFromName(job.name),
    
    delivery: {
      mode: job.delivery?.mode || 'none',
      channel: job.delivery?.channel || null,
      to: job.delivery?.to || null,
      accountId: job.delivery?.accountId || null
    },
    
    state: {
      nextRunAt: job.state?.nextRunAtMs || null,
      lastRunAt: job.state?.lastRunAtMs || null,
      lastStatus: job.state?.lastRunStatus || 'unknown',
      consecutiveErrors: job.state?.consecutiveErrors || 0
    },
    
    source: {
      config: CRON_JOBS_FILE
    },
    
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Try to parse agent ID from job name
 */
function parseAgentFromName(name) {
  if (!name) return null;
  
  // Common patterns: "Agent - Task", "agent: task", "agent/task"
  const patterns = [
    /^(\w+)\s*[-:\/]/,
    /agent[:\s]+(\w+)/i
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  
  return null;
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Main sync function - reads from OpenClaw, writes to cardioclaw.yml
 */
function sync(options = {}) {
  const outputPath = options.output || path.join(process.cwd(), 'cardioclaw.yml');
  
  console.log('🫀 CardioClaw 1.0 Sync\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  const cardios = [];
  const warnings = [];
  
  // Phase 1: Read heartbeats from openclaw.json
  console.log('📍 Phase 1: Reading Heartbeats\n');
  
  let openclawConfig = null;
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG)) {
      throw new Error(`Config not found: ${OPENCLAW_CONFIG}`);
    }
    
    const configContent = fs.readFileSync(OPENCLAW_CONFIG, 'utf8');
    openclawConfig = JSON.parse(configContent);
    
    const agents = openclawConfig.agents?.list || [];
    const defaults = openclawConfig.agents?.defaults || {};
    
    let heartbeatCount = 0;
    for (const agent of agents) {
      if (agent.heartbeat) {
        const cardio = transformHeartbeat(agent, defaults, openclawConfig);
        cardios.push(cardio);
        heartbeatCount++;
        
        if (cardio.warnings) {
          warnings.push(...cardio.warnings.map(w => `[${agent.id}] ${w}`));
        }
        
        console.log(`  ✓ ${cardio.name} (${cardio.schedule || 'disabled'})`);
      }
    }
    
    console.log(`\n  Found ${heartbeatCount} heartbeat(s)\n`);
    
  } catch (err) {
    console.error(`  ✗ Failed to read heartbeats: ${err.message}\n`);
    warnings.push(`Heartbeat read error: ${err.message}`);
  }
  
  // Phase 2: Read cron jobs from jobs.json
  console.log('📍 Phase 2: Reading Cron Jobs\n');
  
  try {
    if (!fs.existsSync(CRON_JOBS_FILE)) {
      console.log(`  ⚠ No cron jobs file found: ${CRON_JOBS_FILE}\n`);
    } else {
      const jobsContent = fs.readFileSync(CRON_JOBS_FILE, 'utf8');
      const jobsData = JSON.parse(jobsContent);
      const jobs = jobsData.jobs || jobsData || [];
      
      if (!Array.isArray(jobs)) {
        throw new Error('Invalid jobs.json format');
      }
      
      for (const job of jobs) {
        const cardio = transformCronJob(job);
        cardios.push(cardio);
        
        if (cardio.warnings) {
          warnings.push(...cardio.warnings.map(w => `[${job.name}] ${w}`));
        }
        
        const status = cardio.enabled ? '✓' : '⊘';
        console.log(`  ${status} ${cardio.name}`);
      }
      
      console.log(`\n  Found ${jobs.length} cron job(s)\n`);
    }
    
  } catch (err) {
    console.error(`  ✗ Failed to read cron jobs: ${err.message}\n`);
    warnings.push(`Cron jobs read error: ${err.message}`);
  }
  
  // Phase 3: Write cardioclaw.yml
  console.log('📍 Phase 3: Writing cardioclaw.yml\n');
  
  const output = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    source: {
      openclaw_config: OPENCLAW_CONFIG,
      cron_jobs: CRON_JOBS_FILE
    },
    summary: {
      total: cardios.length,
      heartbeats: cardios.filter(c => c.type === 'heartbeat').length,
      cron_jobs: cardios.filter(c => c.type === 'cron').length,
      enabled: cardios.filter(c => c.enabled).length,
      disabled: cardios.filter(c => !c.enabled).length,
      warnings: warnings.length
    },
    cardios: cardios
  };
  
  if (warnings.length > 0) {
    output.warnings = warnings;
  }
  
  try {
    const yamlContent = yaml.dump(output, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
    
    fs.writeFileSync(outputPath, yamlContent, 'utf8');
    console.log(`  ✓ Wrote ${outputPath}\n`);
    
  } catch (err) {
    console.error(`  ✗ Failed to write output: ${err.message}`);
    process.exit(1);
  }
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`✅ Sync complete`);
  console.log(`   ${output.summary.heartbeats} heartbeat(s), ${output.summary.cron_jobs} cron job(s)`);
  console.log(`   ${output.summary.enabled} enabled, ${output.summary.disabled} disabled`);
  
  if (warnings.length > 0) {
    console.log(`   ⚠ ${warnings.length} warning(s) - run 'cardioclaw validate' for details`);
  }
  
  console.log('');
}

module.exports = { sync };
