const fs = require('fs');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');

/**
 * Archive completed one-shot heartbeats to heartbeats_completed section
 */
function archiveCompletedOneShots(configPath) {
  if (!fs.existsSync(configPath)) {
    return { archived: 0, errors: [] };
  }

  // Read current YAML
  const fileContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContent);

  if (!config.heartbeats || !Array.isArray(config.heartbeats)) {
    return { archived: 0, errors: [] };
  }

  // Get all OpenClaw cron jobs to check status
  let cronJobs = [];
  try {
    const result = spawnSync('openclaw', ['cron', 'list', '--json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });
    if (result.status !== 0) {
      throw new Error(result.stderr ? result.stderr.toString().trim() : 'non-zero exit');
    }
    const output = result.stdout || '';
    const jsonStartIdx = output.indexOf('{');
    const jsonStr = jsonStartIdx > 0 ? output.substring(jsonStartIdx) : output;
    const parsed = JSON.parse(jsonStr);
    cronJobs = parsed.jobs || [];
  } catch (err) {
    return { archived: 0, errors: [`Failed to query OpenClaw: ${err.message}`] };
  }

  // Build lookup map by job name
  const jobsByName = {};
  cronJobs.forEach(job => {
    jobsByName[job.name] = job;
  });

  // Separate completed from active heartbeats
  const activeHeartbeats = [];
  const completedHeartbeats = config.heartbeats_completed || [];
  let archivedCount = 0;
  const errors = [];

  for (const heartbeat of config.heartbeats) {
    // Only process one-shots (schedule starts with "at ")
    // Type-check schedule before calling .startsWith()
    const schedule = typeof heartbeat.schedule === 'string' ? heartbeat.schedule : '';
    if (!schedule.startsWith('at ')) {
      activeHeartbeats.push(heartbeat);
      continue;
    }

    // Check if this one-shot is completed
    const job = jobsByName[heartbeat.name];
    
    if (!job) {
      // Job not found in OpenClaw - might have been deleted
      activeHeartbeats.push(heartbeat);
      continue;
    }

    // Parse the scheduled time
    const scheduledTime = new Date(schedule.replace('at ', '').trim());
    const isPast = scheduledTime < new Date();
    
    // Check if job is disabled (OpenClaw disables after one-shot execution)
    const isDisabled = !job.enabled;

    if (isPast && isDisabled) {
      // This one-shot has executed
      const completedEntry = {
        ...heartbeat,
        executed_at: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : scheduledTime.toISOString(),
        status: job.state?.lastRunStatus === 'error' ? 'error' : 'ok'
      };

      if (job.state?.lastRunError) {
        completedEntry.error = job.state.lastRunError;
      }

      completedHeartbeats.push(completedEntry);
      archivedCount++;
    } else {
      // Still active (upcoming or past-due but never ran)
      activeHeartbeats.push(heartbeat);
    }
  }

  if (archivedCount === 0) {
    return { archived: 0, errors: [] };
  }

  // Update config
  config.heartbeats = activeHeartbeats;
  config.heartbeats_completed = completedHeartbeats;

  // Write back to file
  try {
    const yamlStr = yaml.dump(config, {
      lineWidth: -1,
      noRefs: true
    });
    fs.writeFileSync(configPath, yamlStr, 'utf8');
  } catch (err) {
    errors.push(`Failed to write YAML: ${err.message}`);
    return { archived: 0, errors };
  }

  return { archived: archivedCount, errors };
}

module.exports = { archiveCompletedOneShots };
