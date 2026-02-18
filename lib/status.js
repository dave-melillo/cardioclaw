const { getDatabase, getAllJobs, getManagedJobs, getUnmanagedJobs, getFailingJobs } = require('./db');
const { discover } = require('./discovery');
const fs = require('fs');
const yaml = require('js-yaml');

function status(options) {
  // Refresh state first (unless --no-refresh)
  if (options.refresh !== false) {
    discover(options.config || 'cardioclaw.yaml');
  }

  const db = getDatabase();
  
  const allJobs = getAllJobs(db);
  const managedJobs = getManagedJobs(db);
  const unmanagedJobs = getUnmanagedJobs(db);
  const failingJobs = getFailingJobs(db);
  
  // Load completed one-shots from YAML
  let completedOneShots = [];
  const configPath = options.config || 'cardioclaw.yaml';
  if (fs.existsSync(configPath)) {
    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(fileContent);
      completedOneShots = config.heartbeats_completed || [];
    } catch (err) {
      // Ignore errors reading completed section
    }
  }
  
  console.log('\n🫀 CardioClaw Status\n');
  
  if (allJobs.length === 0 && completedOneShots.length === 0) {
    console.log('  No heartbeats found. Run `cardioclaw sync` to create some!\n');
    db.close();
    return;
  }
  
  // Separate one-shots from recurring
  const oneShots = allJobs.filter(j => {
    try {
      const schedule = JSON.parse(j.schedule);
      return schedule.kind === 'at';
    } catch {
      return false;
    }
  });
  
  const recurringJobs = allJobs.filter(j => {
    try {
      const schedule = JSON.parse(j.schedule);
      return schedule.kind !== 'at';
    } catch {
      return true;
    }
  });
  
  // Upcoming one-shots (future + active)
  const upcomingOneShots = oneShots.filter(j => j.status === 'active' && j.next_run_at > Date.now());
  
  // Past-due one-shots (past + still enabled = never executed)
  const pastDueOneShots = oneShots.filter(j => j.status === 'active' && j.next_run_at <= Date.now());
  
  const showAll = !!options.full;

  // Show upcoming one-shots
  if (upcomingOneShots.length > 0) {
    const LIMIT = 5;
    console.log(`⏰ Upcoming One-Shots (${upcomingOneShots.length}):\n`);
    const visible = showAll ? upcomingOneShots : upcomingOneShots.slice(0, LIMIT);
    for (const job of visible) {
      const nextRun = formatNextRun(job.next_run_at);
      const managed = job.managed ? '📋' : '  ';
      console.log(`  ${managed} ${job.name}`);
      console.log(`      Next: ${nextRun}`);
    }
    if (!showAll && upcomingOneShots.length > LIMIT) {
      console.log(`  ... and ${upcomingOneShots.length - LIMIT} more (use --full to see all)`);
    }
    console.log('');
  }
  
  // Show past-due one-shots (never executed)
  if (pastDueOneShots.length > 0) {
    const LIMIT = 3;
    console.log(`⚠️  Past-Due One-Shots (Not Executed) (${pastDueOneShots.length}):\n`);
    const visible = showAll ? pastDueOneShots : pastDueOneShots.slice(0, LIMIT);
    for (const job of visible) {
      const scheduled = formatNextRun(job.next_run_at);
      console.log(`  ⚠️  ${job.name}`);
      console.log(`      Scheduled: ${scheduled} (missed)`);
    }
    if (!showAll && pastDueOneShots.length > LIMIT) {
      console.log(`  ... and ${pastDueOneShots.length - LIMIT} more (use --full to see all)`);
    }
    console.log('');
  }
  
  // Active jobs (recurring only)
  const activeJobs = recurringJobs.filter(j => j.status === 'active');
  console.log(`📊 Active (${activeJobs.length} job${activeJobs.length !== 1 ? 's' : ''}):\n`);
  
  const ACTIVE_LIMIT = 10;
  const visibleActive = showAll ? activeJobs : activeJobs.slice(0, ACTIVE_LIMIT);
  for (const job of visibleActive) {
    const statusIcon = job.status === 'failing' ? '✗' : '✓';
    const nextRun = formatNextRun(job.next_run_at);
    const agent = job.agent ? ` (${job.agent})` : '';
    const managed = job.managed ? '📋' : '  ';
    
    console.log(`  ${managed} ${statusIcon} ${job.name}${agent}`);
    console.log(`      Next: ${nextRun}`);
  }
  
  if (!showAll && activeJobs.length > ACTIVE_LIMIT) {
    console.log(`  ... and ${activeJobs.length - ACTIVE_LIMIT} more (use --full to see all)`);
  }
  
  // Failing jobs
  if (failingJobs.length > 0) {
    console.log(`\n⚠️  Failing (${failingJobs.length} job${failingJobs.length !== 1 ? 's' : ''}):\n`);
    for (const job of failingJobs) {
      console.log(`  ✗ ${job.name}`);
      if (job.last_error) {
        console.log(`    Error: ${job.last_error.substring(0, 80)}${job.last_error.length > 80 ? '...' : ''}`);
      }
    }
  }
  
  // Completed one-shots
  if (completedOneShots.length > 0) {
    const COMPLETED_LIMIT = 5;
    console.log(`✅ Completed One-Shots (${completedOneShots.length}):\n`);
    const visibleCompleted = showAll ? completedOneShots : completedOneShots.slice(0, COMPLETED_LIMIT);
    for (const job of visibleCompleted) {
      const statusIcon = job.status === 'error' ? '✗' : '✓';
      const executedAt = job.executed_at ? new Date(job.executed_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }) : 'Unknown';
      
      console.log(`  ${statusIcon} ${job.name}`);
      console.log(`      Executed: ${executedAt}`);
      if (job.error) {
        console.log(`      Error: ${job.error.substring(0, 60)}${job.error.length > 60 ? '...' : ''}`);
      }
    }
    if (!showAll && completedOneShots.length > COMPLETED_LIMIT) {
      console.log(`  ... and ${completedOneShots.length - COMPLETED_LIMIT} more (use --full to see all)`);
    }
    console.log('');
    console.log(`  💡 Run 'cardioclaw prune --days 30' to clean up old completed jobs`);
    console.log('');
  }
  
  // Summary
  console.log('─'.repeat(60));
  console.log(`  Managed: ${managedJobs.length} | Unmanaged: ${unmanagedJobs.length} | Failing: ${failingJobs.length}`);
  
  // Next run
  const nextJob = allJobs.find(j => j.next_run_at && j.status === 'active' && j.next_run_at > Date.now());
  if (nextJob) {
    const timeUntil = formatTimeUntil(nextJob.next_run_at);
    console.log(`  Next run: ${nextJob.name} in ${timeUntil}`);
  }
  
  console.log('');
  
  db.close();
}

function formatNextRun(timestamp) {
  if (!timestamp) return 'Not scheduled';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = date - now;
  
  if (diffMs < 0) {
    return 'Overdue';
  }
  
  // If today, show time only
  if (date.toDateString() === now.toDateString()) {
    return 'Today ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  
  // If tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  
  // Otherwise show full date
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatTimeUntil(timestamp) {
  const now = Date.now();
  const diffMs = timestamp - now;
  
  if (diffMs < 0) return 'overdue';
  
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

module.exports = { status };
