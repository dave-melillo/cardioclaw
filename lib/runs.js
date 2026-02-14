const { getDatabase, getRunsByJobName, getAllRuns, getJobByName } = require('./db');
const { discover } = require('./discovery');

function showRuns(jobName, options) {
  // Refresh first (unless --no-refresh)
  if (options.refresh !== false) {
    console.log('🔍 Refreshing run history...\n');
    discover(options.config || 'cardioclaw.yaml');
  }

  const db = getDatabase();
  const limit = parseInt(options.limit, 10) || 20;

  let runs;
  if (jobName) {
    // Show runs for specific job
    runs = getRunsByJobName(db, jobName, limit);
    
    if (runs.length === 0) {
      console.log(`\nNo execution history found for "${jobName}"\n`);
      db.close();
      return;
    }

    console.log(`\n🫀 Execution History: ${jobName}\n`);
    console.log(`Last ${runs.length} run${runs.length !== 1 ? 's' : ''}:\n`);
  } else if (options.all) {
    // Show runs for all jobs
    runs = getAllRuns(db, limit);
    
    if (runs.length === 0) {
      console.log('\nNo execution history found.\n');
      db.close();
      return;
    }

    console.log(`\n🫀 Recent Executions (All Jobs)\n`);
    console.log(`Last ${runs.length} run${runs.length !== 1 ? 's' : ''}:\n`);
  } else {
    console.error('Error: Must provide job name or use --all flag\n');
    console.log('Examples:');
    console.log('  cardioclaw runs "Morning Briefing"');
    console.log('  cardioclaw runs --all --limit 10\n');
    db.close();
    process.exit(1);
  }

  // Display runs
  for (const run of runs) {
    const date = new Date(run.started_at);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const statusIcon = run.status === 'ok' ? '✓' : run.status === 'error' ? '✗' : '⚠';
    const statusColor = run.status === 'ok' ? '' : '';
    const durationStr = formatDuration(run.duration_ms);

    let line = `  ${dateStr.padEnd(20)} ${statusIcon} ${run.status.padEnd(7)} ${durationStr}`;
    
    if (options.all) {
      line = `  ${run.job_name.substring(0, 25).padEnd(27)} ${dateStr.padEnd(20)} ${statusIcon} ${run.status.padEnd(7)} ${durationStr}`;
    }

    console.log(line);

    if (run.error && options.verbose) {
      console.log(`      Error: ${run.error.substring(0, 70)}${run.error.length > 70 ? '...' : ''}`);
    }
  }

  // Calculate stats (for specific job only)
  if (jobName && runs.length > 0) {
    const successCount = runs.filter(r => r.status === 'ok').length;
    const successRate = Math.round((successCount / runs.length) * 100);
    const avgDuration = runs
      .filter(r => r.duration_ms)
      .reduce((sum, r) => sum + r.duration_ms, 0) / runs.filter(r => r.duration_ms).length;

    console.log('\n' + '─'.repeat(60));
    console.log(`  Success rate: ${successRate}% (${successCount}/${runs.length})`);
    console.log(`  Avg duration: ${formatDuration(avgDuration)}`);
  }

  console.log('');
  db.close();
}

function formatDuration(durationMs) {
  if (!durationMs || durationMs === null) return 'N/A';
  
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

module.exports = { showRuns };
