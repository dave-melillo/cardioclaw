/**
 * Heartbeat API endpoints for dashboard
 */

const { getAgentsList } = require('./gateway-config');

/**
 * Get all agents with heartbeat status
 * @returns {array} Array of agents with heartbeat info
 */
function getAllHeartbeats() {
  try {
    const agents = getAgentsList();
    
    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      heartbeat: agent.heartbeat,
      workspace: agent.workspace,
      status: agent.heartbeat ? 'active' : 'disabled',
      type: 'heartbeat'
    }));
  } catch (err) {
    console.error('Failed to fetch heartbeats:', err.message);
    return [];
  }
}

/**
 * Get heartbeat details for a specific agent
 * @param {string} agentId - Agent ID
 * @returns {object|null} Heartbeat details
 */
function getHeartbeatDetails(agentId) {
  try {
    const agents = getAgentsList();
    const agent = agents.find(a => a.id === agentId);
    
    if (!agent) {
      return null;
    }

    return {
      id: agent.id,
      name: agent.name,
      heartbeat: agent.heartbeat,
      workspace: agent.workspace,
      status: agent.heartbeat ? 'active' : 'disabled'
    };
  } catch (err) {
    console.error(`Failed to fetch heartbeat for ${agentId}:`, err.message);
    return null;
  }
}

/**
 * Get heartbeat execution history (placeholder for future implementation)
 * @param {string} agentId - Agent ID
 * @param {number} limit - Max number of records
 * @returns {array} Array of heartbeat executions
 */
function getHeartbeatHistory(agentId, limit = 20) {
  // TODO: Parse gateway logs or session transcripts for heartbeat executions
  // For now, return empty array
  return [];
}

module.exports = {
  getAllHeartbeats,
  getHeartbeatDetails,
  getHeartbeatHistory
};
