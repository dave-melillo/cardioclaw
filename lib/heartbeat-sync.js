/**
 * Heartbeat Sync - Orchestrate gateway config + HEARTBEAT.md updates
 */

const { buildHeartbeatPatch, applyConfigPatch } = require('./gateway-config');
const { syncAllHeartbeatMd } = require('./heartbeat-md');

/**
 * Sync heartbeat configs from YAML to OpenClaw
 * @param {object} config - Parsed YAML config
 * @param {object} options - Options { dryRun: boolean, force: boolean, restart: boolean }
 * @returns {object} Result { success: boolean, written: number, patched: boolean, errors: array }
 */
function syncHeartbeats(config, options = {}) {
  const agents = config.agents || [];
  const defaults = config.defaults || {};

  if (agents.length === 0) {
    return {
      success: false,
      message: 'No agents defined in config',
      written: 0,
      patched: false,
      errors: ['No agents[] array found in YAML']
    };
  }

  console.log(`\n🫀 Syncing heartbeats for ${agents.length} agent(s)\n`);

  // Step 1: Write HEARTBEAT.md files
  console.log('📝 Writing HEARTBEAT.md files...\n');
  const mdResult = syncAllHeartbeatMd(agents, options);

  // Step 2: Build and apply gateway config patch
  console.log(`\n⚙️  Building gateway config patch...\n`);
  const patch = buildHeartbeatPatch(agents, defaults);

  if (options.dryRun) {
    console.log('[DRY RUN] Config patch:');
    console.log(JSON.stringify(patch, null, 2));
    console.log('');
  }

  const patchResult = applyConfigPatch(patch, {
    dryRun: options.dryRun,
    restart: options.restart
  });

  if (!patchResult.success) {
    console.error(`✗ Failed to apply config patch: ${patchResult.message}`);
    return {
      success: false,
      written: mdResult.written,
      patched: false,
      errors: [...mdResult.errors, patchResult.message]
    };
  }

  console.log(`✓ Config patch ${options.dryRun ? 'validated' : 'applied'}`);

  if (options.restart && !options.dryRun) {
    console.log('\n🔄 Gateway will restart to apply heartbeat changes...');
  } else if (!options.dryRun) {
    console.log('\n⚠️  Gateway restart required. Run with --restart or restart manually.');
  }

  console.log('');
  console.log(`${options.dryRun ? '📋 Summary (dry run)' : '✅ Summary'}:`);
  console.log(`  ✓ ${mdResult.written} HEARTBEAT.md file(s) ${options.dryRun ? 'would be written' : 'written'}`);
  if (mdResult.skipped > 0) {
    console.log(`  ⊘ ${mdResult.skipped} file(s) skipped`);
  }
  if (mdResult.errors.length > 0) {
    console.log(`  ✗ ${mdResult.errors.length} error(s)`);
    mdResult.errors.forEach(err => console.error(`    - ${err}`));
  }
  console.log(`  ✓ Gateway config ${options.dryRun ? 'would be patched' : 'patched'}`);

  return {
    success: mdResult.errors.length === 0,
    written: mdResult.written,
    skipped: mdResult.skipped,
    patched: true,
    errors: mdResult.errors
  };
}

module.exports = { syncHeartbeats };
