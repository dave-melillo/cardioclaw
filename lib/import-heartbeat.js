/**
 * Import existing heartbeat configs from OpenClaw into YAML
 */

const fs = require('fs');
const yaml = require('js-yaml');
const { getAgentsConfig, getAgentsList } = require('./gateway-config');
const { readHeartbeatMd } = require('./heartbeat-md');

/**
 * Import heartbeat configs from OpenClaw gateway
 * @param {string} configPath - Path to cardioclaw.yaml
 * @param {object} options - Options { dryRun: boolean }
 * @returns {object} Result { success: boolean, imported: number, errors: array }
 */
function importHeartbeats(configPath, options = {}) {
  console.log('\n🔍 Fetching OpenClaw agent heartbeat configs...\n');

  try {
    // Get agents list from gateway
    const gatewayAgents = getAgentsList();
    console.log(`   Found ${gatewayAgents.length} agent(s)\n`);

    // Filter agents with heartbeat configs
    const agentsWithHeartbeats = gatewayAgents.filter(agent => agent.heartbeat);
    console.log(`   ${agentsWithHeartbeats.length} agent(s) have heartbeat configs\n`);

    if (agentsWithHeartbeats.length === 0) {
      console.log('⊘ No heartbeat configs found to import\n');
      return {
        success: true,
        imported: 0,
        errors: []
      };
    }

    // Build agents[] array for YAML
    const yamlAgents = [];
    for (const agent of agentsWithHeartbeats) {
      const yamlAgent = {
        id: agent.id,
        heartbeat: convertHeartbeatToYaml(agent.heartbeat)
      };

      // Try to read existing HEARTBEAT.md
      const mdResult = readHeartbeatMd(agent.id);
      if (mdResult.success && mdResult.content) {
        yamlAgent.checklist = mdResult.content.trim();
      }

      yamlAgents.push(yamlAgent);
    }

    // Read existing YAML config (if exists)
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        existingConfig = yaml.load(fileContent) || {};
      } catch (err) {
        console.warn(`⚠️  Could not parse existing config: ${err.message}`);
      }
    }

    // Merge with existing config
    const mergedConfig = {
      ...existingConfig,
      agents: yamlAgents
    };

    // Preserve cron_jobs if they exist
    if (existingConfig.cron_jobs) {
      mergedConfig.cron_jobs = existingConfig.cron_jobs;
    } else if (existingConfig.heartbeats) {
      // Migrate old 'heartbeats' field to 'cron_jobs'
      mergedConfig.cron_jobs = existingConfig.heartbeats;
    }

    if (options.dryRun) {
      console.log('[DRY RUN] Would write to config:\n');
      console.log(yaml.dump(mergedConfig, { lineWidth: -1 }));
      console.log('');
      return {
        success: true,
        imported: yamlAgents.length,
        dryRun: true,
        errors: []
      };
    }

    // Write merged config
    fs.writeFileSync(configPath, yaml.dump(mergedConfig, { lineWidth: -1 }), 'utf8');

    console.log('✅ Import summary:\n');
    console.log(`   → ${yamlAgents.length} agent(s) imported`);
    console.log(`   → Written to: ${configPath}\n`);

    return {
      success: true,
      imported: yamlAgents.length,
      errors: []
    };
  } catch (err) {
    return {
      success: false,
      imported: 0,
      errors: [err.message]
    };
  }
}

/**
 * Convert OpenClaw heartbeat config to YAML format
 * @param {object} hbConfig - OpenClaw heartbeat config
 * @returns {object} YAML heartbeat config
 */
function convertHeartbeatToYaml(hbConfig) {
  const yaml = {
    enabled: true
  };

  if (hbConfig.every) {
    yaml.interval = hbConfig.every;
  }

  if (hbConfig.target) {
    yaml.target = hbConfig.target;
  }

  if (hbConfig.to) {
    yaml.to = hbConfig.to;
  }

  if (hbConfig.accountId) {
    yaml.accountId = hbConfig.accountId;
  }

  if (hbConfig.activeHours) {
    yaml.activeHours = {
      start: hbConfig.activeHours.start,
      end: hbConfig.activeHours.end
    };
    if (hbConfig.activeHours.timezone) {
      yaml.activeHours.timezone = hbConfig.activeHours.timezone;
    }
  }

  if (hbConfig.model) {
    yaml.model = hbConfig.model;
  }

  if (hbConfig.includeReasoning !== undefined) {
    yaml.includeReasoning = hbConfig.includeReasoning;
  }

  if (hbConfig.ackMaxChars) {
    yaml.ackMaxChars = hbConfig.ackMaxChars;
  }

  if (hbConfig.prompt) {
    yaml.prompt = hbConfig.prompt;
  }

  return yaml;
}

module.exports = { importHeartbeats };
