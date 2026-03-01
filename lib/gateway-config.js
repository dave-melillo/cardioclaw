/**
 * OpenClaw Gateway Config Integration
 * Read and patch gateway config for heartbeat management
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Get agents config from gateway
 * @returns {object} Agents config object
 */
function getAgentsConfig() {
  const result = spawnSync('openclaw', ['config', 'get', 'agents'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8'
  });

  if (result.error) {
    throw new Error(`Failed to run openclaw config get agents: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`openclaw config get agents exited ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }

  const output = result.stdout || '';
  try {
    return JSON.parse(output);
  } catch (err) {
    throw new Error(`Failed to parse agents config: ${err.message}`);
  }
}

/**
 * Get agents list from gateway config
 * @returns {array} Array of agent objects with id, workspace, heartbeat config
 */
function getAgentsList() {
  const agentsConfig = getAgentsConfig();
  const agentsList = agentsConfig.list || [];
  const defaults = agentsConfig.defaults || {};
  
  return agentsList.map(agent => ({
    id: agent.id,
    name: agent.name || agent.id,
    workspace: agent.workspace,
    agentDir: agent.agentDir,
    heartbeat: agent.heartbeat || defaults.heartbeat || null
  }));
}

/**
 * Build a config patch for heartbeat settings
 * @param {array} agents - Array of agent configs from YAML
 * @param {object} defaults - Default heartbeat config
 * @returns {object} Config patch object for openclaw gateway config.patch
 */
function buildHeartbeatPatch(agents, defaults = {}) {
  const patch = {
    agents: {
      list: []
    }
  };

  // Add defaults if provided
  if (defaults.heartbeat && Object.keys(defaults.heartbeat).length > 0) {
    patch.agents.defaults = {
      heartbeat: defaults.heartbeat
    };
  }

  // Build per-agent heartbeat configs
  for (const agent of agents) {
    if (agent.heartbeat && agent.heartbeat.enabled !== false) {
      const agentPatch = {
        id: agent.id,
        heartbeat: buildHeartbeatConfig(agent.heartbeat)
      };
      patch.agents.list.push(agentPatch);
    }
  }

  return patch;
}

/**
 * Convert YAML heartbeat config to OpenClaw format
 * @param {object} hbConfig - Heartbeat config from YAML
 * @returns {object} OpenClaw heartbeat config
 */
function buildHeartbeatConfig(hbConfig) {
  const config = {};

  // Interval (required)
  if (hbConfig.interval) {
    config.every = hbConfig.interval;
  }

  // Target (where to deliver alerts)
  if (hbConfig.target) {
    config.target = hbConfig.target;
  }

  // Recipient (channel-specific target)
  if (hbConfig.to) {
    config.to = hbConfig.to;
  }

  // Account ID (for multi-account channels)
  if (hbConfig.accountId) {
    config.accountId = hbConfig.accountId;
  }

  // Active hours
  if (hbConfig.activeHours) {
    config.activeHours = {
      start: hbConfig.activeHours.start,
      end: hbConfig.activeHours.end
    };
    if (hbConfig.activeHours.timezone) {
      config.activeHours.timezone = hbConfig.activeHours.timezone;
    }
  }

  // Model override
  if (hbConfig.model) {
    config.model = hbConfig.model;
  }

  // Include reasoning
  if (hbConfig.includeReasoning !== undefined) {
    config.includeReasoning = hbConfig.includeReasoning;
  }

  // Ack max chars
  if (hbConfig.ackMaxChars) {
    config.ackMaxChars = hbConfig.ackMaxChars;
  }

  // Custom prompt (overrides default heartbeat prompt)
  if (hbConfig.prompt) {
    config.prompt = hbConfig.prompt;
  }

  return config;
}

/**
 * Apply a config patch to the gateway
 * @param {object} patch - Config patch object
 * @param {object} options - Options { dryRun: boolean, restart: boolean }
 * @returns {object} Result { success: boolean, message: string }
 */
function applyConfigPatch(patch, options = {}) {
  if (options.dryRun) {
    return {
      success: true,
      message: 'Dry run - patch not applied',
      patch: patch
    };
  }

  try {
    // Get current agents config
    const currentAgentsConfig = getAgentsConfig();

    // Deep merge patch into current agents config
    const mergedConfig = deepMerge(currentAgentsConfig, patch.agents || patch);

    // Write merged config to temp file
    const tempFile = path.join(os.tmpdir(), `cardioclaw-config-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(mergedConfig, null, 2));

    // Apply using openclaw config set (set entire agents config)
    const agentsJson = JSON.stringify(mergedConfig);
    const result = spawnSync('openclaw', ['config', 'set', 'agents', agentsJson], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });

    // Clean up temp file
    fs.unlinkSync(tempFile);

    if (result.error) {
      throw new Error(`Failed to run openclaw config set: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim();
      throw new Error(`openclaw config set exited ${result.status}${stderr ? `: ${stderr}` : ''}`);
    }

    // Restart gateway if requested
    if (options.restart) {
      console.log('\n🔄 Restarting gateway...');
      const restartResult = spawnSync('openclaw', ['gateway', 'restart'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8'
      });

      if (restartResult.status !== 0) {
        console.warn('⚠️  Gateway restart failed - you may need to restart manually');
      }
    }

    return {
      success: true,
      message: 'Config patch applied successfully',
      output: result.stdout
    };
  } catch (err) {
    return {
      success: false,
      message: err.message,
      error: err
    };
  }
}

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const output = Object.assign({}, target);
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else if (Array.isArray(source[key])) {
        // For arrays, replace entirely (don't merge)
        output[key] = source[key];
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

module.exports = {
  getAgentsConfig,
  getAgentsList,
  buildHeartbeatPatch,
  buildHeartbeatConfig,
  applyConfigPatch
};
