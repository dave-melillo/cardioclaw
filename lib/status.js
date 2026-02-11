const { getDatabase, getAllJobs, getManagedJobs, getUnmanagedJobs, getFailingJobs } = require('./db');
const { discover } = require('./discovery');

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
  
  console.log('\n🫀 CardioClaw Status\n');
  
  if (allJobs.length === 0) {
    console.log('  No heartbeats found. Run `cardioclaw sync` to create some!\n');
    db.close();
    return;
  }
  
  // Active jobs
  const activeJobs = allJobs.filter(j => j.status === 'active');
  console.log(`📊 Active (${activeJobs.length} job${activeJobs.length !== 1 ? 's' : ''}):\n`);
  
  for (const job of activeJobs.slice(0, 10)) {
    const statusIcon = job.status === 'failing' ? '✗' : '✓';
    const nextRun = formatNextRun(job.next_run_at);
    const agent = job.agent ? ` (${job.agent})` : '';
    const managed = job.managed ? '📋' : '  ';
    
    console.log(`  ${managed} ${statusIcon} ${job.name}${agent}`);
    console.log(`      Next: ${nextRun}`);
  }
  
  if (activeJobs.length > 10) {
    console.log(`  ... and ${activeJobs.length - 10} more`);
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
  
  // Summary
  console.log('\n' + '─'.repeat(60));
  console.log(`  Managed: ${managedJobs.length} | Unmanaged: ${unmanagedJobs.length} | Failing: ${failingJobs.length}`);
  
  // Next run
  const nextJob = allJobs.find(j => j.next_run_at && j.status === 'active');
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
