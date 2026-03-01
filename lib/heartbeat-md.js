/**
 * HEARTBEAT.md file generation and management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Generate HEARTBEAT.md content from checklist string
 * @param {string} checklist - Multi-line checklist markdown
 * @returns {string} Formatted HEARTBEAT.md content
 */
function generateHeartbeatMd(checklist) {
  if (!checklist || checklist.trim() === '') {
    // Default minimal checklist
    return `# Heartbeat Checklist

- Quick scan: anything urgent?
- Check for blocked tasks
- Monitor system health
`;
  }

  // Ensure it starts with a header if it doesn't have one
  const lines = checklist.trim().split('\n');
  if (!lines[0].startsWith('#')) {
    return `# Heartbeat Checklist

${checklist.trim()}
`;
  }

  return checklist.trim() + '\n';
}

/**
 * Write HEARTBEAT.md file to agent workspace
 * @param {string} agentId - Agent ID
 * @param {string} content - HEARTBEAT.md content
 * @param {object} options - Options { dryRun: boolean, force: boolean }
 * @returns {object} Result { success: boolean, path: string, message: string }
 */
function writeHeartbeatMd(agentId, content, options = {}) {
  const workspacePath = path.join(os.homedir(), '.openclaw', `workspace-${agentId}`);
  const heartbeatPath = path.join(workspacePath, 'HEARTBEAT.md');

  // Check if workspace exists
  if (!fs.existsSync(workspacePath)) {
    return {
      success: false,
      path: heartbeatPath,
      message: `Workspace not found: ${workspacePath}`
    };
  }

  // Check if file exists and warn (unless force)
  if (fs.existsSync(heartbeatPath) && !options.force && !options.dryRun) {
    return {
      success: false,
      path: heartbeatPath,
      message: `HEARTBEAT.md already exists. Use --force to overwrite.`,
      existing: true
    };
  }

  if (options.dryRun) {
    return {
      success: true,
      path: heartbeatPath,
      message: 'Dry run - file not written',
      content: content
    };
  }

  try {
    fs.writeFileSync(heartbeatPath, content, 'utf8');
    return {
      success: true,
      path: heartbeatPath,
      message: 'HEARTBEAT.md written successfully'
    };
  } catch (err) {
    return {
      success: false,
      path: heartbeatPath,
      message: `Failed to write HEARTBEAT.md: ${err.message}`,
      error: err
    };
  }
}

/**
 * Read HEARTBEAT.md file from agent workspace
 * @param {string} agentId - Agent ID
 * @returns {object} Result { success: boolean, content: string|null, message: string }
 */
function readHeartbeatMd(agentId) {
  const workspacePath = path.join(os.homedir(), '.openclaw', `workspace-${agentId}`);
  const heartbeatPath = path.join(workspacePath, 'HEARTBEAT.md');

  if (!fs.existsSync(heartbeatPath)) {
    return {
      success: false,
      content: null,
      message: `HEARTBEAT.md not found: ${heartbeatPath}`
    };
  }

  try {
    const content = fs.readFileSync(heartbeatPath, 'utf8');
    return {
      success: true,
      content: content,
      path: heartbeatPath,
      message: 'HEARTBEAT.md read successfully'
    };
  } catch (err) {
    return {
      success: false,
      content: null,
      message: `Failed to read HEARTBEAT.md: ${err.message}`,
      error: err
    };
  }
}

/**
 * Sync all HEARTBEAT.md files from YAML config
 * @param {array} agents - Array of agent configs with checklist field
 * @param {object} options - Options { dryRun: boolean, force: boolean }
 * @returns {object} Result { written: number, skipped: number, errors: array }
 */
function syncAllHeartbeatMd(agents, options = {}) {
  const results = {
    written: 0,
    skipped: 0,
    errors: []
  };

  for (const agent of agents) {
    // Skip if no checklist defined
    if (!agent.checklist || agent.checklist.trim() === '') {
      results.skipped++;
      continue;
    }

    // Skip if heartbeat is explicitly disabled
    if (agent.heartbeat && agent.heartbeat.enabled === false) {
      results.skipped++;
      continue;
    }

    const content = generateHeartbeatMd(agent.checklist);
    const result = writeHeartbeatMd(agent.id, content, options);

    if (result.success) {
      results.written++;
      if (!options.dryRun) {
        console.log(`✓ Written: ${agent.id} → ${result.path}`);
      } else {
        console.log(`[DRY RUN] Would write: ${agent.id} → ${result.path}`);
      }
    } else if (result.existing) {
      results.skipped++;
      console.log(`⊘ Exists: ${agent.id} (use --force to overwrite)`);
    } else {
      results.errors.push(`${agent.id}: ${result.message}`);
      console.error(`✗ Failed: ${agent.id} - ${result.message}`);
    }
  }

  return results;
}

module.exports = {
  generateHeartbeatMd,
  writeHeartbeatMd,
  readHeartbeatMd,
  syncAllHeartbeatMd
};
