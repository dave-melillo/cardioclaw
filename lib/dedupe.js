const { spawnSync } = require('child_process');

function dedupe(options) {
  console.log('🔍 Scanning for duplicate heartbeats...\n');

  // Get all OpenClaw cron jobs
  let jobs;
  try {
    const result = spawnSync('openclaw', ['cron', 'list', '--json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      throw new Error(result.stderr ? result.stderr.toString().trim() : 'non-zero exit from openclaw');
    }
    const output = result.stdout || '';
    // Extract JSON from output (may have warnings before it)
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('No JSON found in output');
    }
    const jsonStr = output.slice(jsonStart);
    const parsed = JSON.parse(jsonStr);
    jobs = parsed.jobs || parsed;
  } catch (err) {
    console.error('✗ Failed to list cron jobs:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.log('No cron jobs found.\n');
    return;
  }

  // Group jobs by name
  const byName = {};
  for (const job of jobs) {
    const name = job.name || 'unnamed';
    if (!byName[name]) {
      byName[name] = [];
    }
    byName[name].push(job);
  }

  // Find duplicates (names with more than one job)
  const duplicates = Object.entries(byName).filter(([name, jobList]) => jobList.length > 1);

  if (duplicates.length === 0) {
    console.log('✓ No duplicates found!\n');
    return;
  }

  console.log(`Found ${duplicates.length} name(s) with duplicates:\n`);

  let removed = 0;
  let kept = 0;

  for (const [name, jobList] of duplicates) {
    console.log(`  "${name}" (${jobList.length} copies)`);
    
    // Sort by creation time (newest first) - keep the newest one
    jobList.sort((a, b) => {
      const timeA = a.createdAtMs || a.createdAt || a.updatedAt || 0;
      const timeB = b.createdAtMs || b.createdAt || b.updatedAt || 0;
      return timeB - timeA;
    });

    const keep = jobList[0];
    const toRemove = jobList.slice(1);

    console.log(`    Keeping: ${keep.id} (newest)`);

    for (const job of toRemove) {
      if (options.dryRun) {
        console.log(`    [DRY RUN] Would remove: ${job.id}`);
        removed++;
      } else {
        try {
          // Use spawnSync with arg array — no shell injection
          const result = spawnSync('openclaw', ['cron', 'remove', job.id], { stdio: 'pipe' });
          if (result.status !== 0) {
            throw new Error(result.stderr ? result.stderr.toString().trim() : 'non-zero exit');
          }
          console.log(`    ✓ Removed: ${job.id}`);
          removed++;
        } catch (err) {
          console.log(`    ✗ Failed to remove: ${job.id}`);
        }
      }
    }
    kept++;
  }

  console.log(`\n${options.dryRun ? '📋 Summary (dry run)' : '✅ Summary'}:`);
  console.log(`  ✓ ${kept} unique name(s) kept`);
  console.log(`  ✗ ${removed} duplicate(s) ${options.dryRun ? 'would be removed' : 'removed'}`);
  console.log('');
}

module.exports = { dedupe };
