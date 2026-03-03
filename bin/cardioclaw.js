#!/usr/bin/env node

/**
 * CardioClaw 1.0 CLI
 * 
 * Sync and visualization tool for OpenClaw scheduled assets.
 * READ-ONLY relative to OpenClaw configs - we only write to cardioclaw.yml
 */

const { Command } = require('commander');
const { sync } = require('../lib/sync');
const { discover } = require('../lib/discovery');
const { validate } = require('../lib/validate');
const { status } = require('../lib/status');
const { startDashboard } = require('../lib/server');
const { showRuns } = require('../lib/runs');
const { takeSnapshot: snapshot } = require('../lib/snapshot');
const { init } = require('../lib/init');
const packageJson = require('../package.json');

const program = new Command();

program
  .name('cardioclaw')
  .description('Sync and visualization tool for OpenClaw scheduled assets')
  .version(packageJson.version);

// ============================================
// Core Commands (1.0)
// ============================================

program
  .command('discover')
  .description('Scan OpenClaw configs and report counts (read-only)')
  .action(() => {
    discover();
  });

program
  .command('sync')
  .description('Read OpenClaw configs and write unified cardioclaw.yml')
  .option('-o, --output <path>', 'Output path for cardioclaw.yml', 'cardioclaw.yml')
  .action((options) => {
    sync(options);
  });

program
  .command('dashboard')
  .description('Launch web dashboard showing all scheduled assets')
  .option('-c, --config <path>', 'Path to cardioclaw.yml (run sync first)', 'cardioclaw.yml')
  .option('-p, --port <port>', 'Port number', '3333')
  .option('--remote', 'Enable network access (auto-detects Tailscale/LAN, requires token)')
  .option('--daemon', 'Run in background (prints token and exits)')
  .action((options) => {
    if (options.daemon) {
      // Daemon mode: spawn detached child and exit
      const { spawn, execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const net = require('net');
      
      const port = parseInt(options.port, 10) || 3333;
      const logFile = path.join(os.tmpdir(), 'cardioclaw-dashboard.log');
      const pidFile = path.join(os.tmpdir(), 'cardioclaw-dashboard.pid');
      
      // Check if port is already in use by trying to connect
      const portCheck = new Promise((resolve) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' });
        socket.setTimeout(500);
        socket.once('connect', () => {
          socket.destroy();
          resolve(true); // port in use - something is listening
        });
        socket.once('error', () => {
          socket.destroy();
          resolve(false); // port available - connection refused
        });
        socket.once('timeout', () => {
          socket.destroy();
          resolve(false); // port available - no response
        });
      });
      
      portCheck.then((inUse) => {
        if (inUse) {
          // Check if it's a cardioclaw process
          let existingPid = null;
          try {
            existingPid = fs.readFileSync(pidFile, 'utf8').trim();
          } catch {}
          
          console.log('');
          console.log('⚠️  Port ' + port + ' is already in use.');
          if (existingPid) {
            console.log('');
            console.log('   A CardioClaw dashboard may already be running (PID: ' + existingPid + ')');
            console.log('');
            console.log('   To get the current token, check the log:');
            console.log('     cat ' + logFile + ' | grep "Auth Token"');
            console.log('');
            console.log('   To restart with a new token:');
            console.log('     kill ' + existingPid + ' && cardioclaw dashboard --remote --daemon');
          } else {
            console.log('   Another process is using this port.');
            console.log('   Try: cardioclaw dashboard --remote --daemon --port ' + (port + 1));
          }
          console.log('');
          process.exit(1);
        }
        
        // Port is free, start the daemon
        const args = ['dashboard'];
        if (options.config !== 'cardioclaw.yml') args.push('-c', options.config);
        if (options.port !== '3333') args.push('-p', options.port);
        if (options.remote) args.push('--remote');
        
        const out = fs.openSync(logFile, 'w');
        const child = spawn(process.execPath, [__filename, ...args], {
          detached: true,
          stdio: ['ignore', out, out],
          cwd: process.cwd()
        });
        
        fs.writeFileSync(pidFile, String(child.pid));
        child.unref();
        
        console.log('');
        console.log('🫀 CardioClaw Dashboard (daemon mode)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log(`  ✓ Started in background (PID: ${child.pid})`);
        console.log(`  📄 Log: ${logFile}`);
        console.log(`  🔑 PID: ${pidFile}`);
        console.log('');
        
        // Wait a moment for server to start, then show URLs/token from log
        setTimeout(() => {
          // Verify process is still alive
          try {
            process.kill(child.pid, 0); // signal 0 = check if alive
          } catch {
            console.log('  ❌ Dashboard failed to start. Check log:');
            console.log(`     cat ${logFile}`);
            console.log('');
            process.exit(1);
          }
          
          try {
            const log = fs.readFileSync(logFile, 'utf8');
            const urlMatch = log.match(/→ (http:\/\/[^\s]+)/g);
            const tokenMatch = log.match(/Auth Token: ([a-f0-9]+)/);
            
            if (urlMatch) {
              console.log('  Access URLs:');
              urlMatch.forEach(u => console.log(`  ${u}`));
            }
            if (tokenMatch) {
              console.log('');
              console.log(`  🔐 Token: ${tokenMatch[1]}`);
              if (urlMatch && urlMatch[0]) {
                const baseUrl = urlMatch[0].replace('→ ', '');
                console.log(`  📋 Full URL: ${baseUrl}?token=${tokenMatch[1]}`);
              }
            }
            console.log('');
            console.log('  Stop: kill $(cat /tmp/cardioclaw-dashboard.pid)');
            console.log('');
          } catch (e) {
            console.log('  Check log for URLs and token:', logFile);
            console.log('');
          }
          process.exit(0);
        }, 2000);
      });
    } else {
      startDashboard(options);
    }
  });

program
  .command('validate')
  .description('Detect and report config issues (read-only)')
  .option('-v, --verbose', 'Show detailed warnings')
  .action((options) => {
    validate(options);
  });

// ============================================
// Utility Commands (kept from v0.x)
// ============================================

program
  .command('init')
  .description('Create a starter cardioclaw.yml with detected timezone')
  .action(() => init());

program
  .command('status')
  .description('Show all heartbeats and system health')
  .option('-c, --config <path>', 'Path to cardioclaw.yml', 'cardioclaw.yml')
  .option('--no-refresh', 'Skip discovery refresh')
  .option('--full', 'Show all jobs without truncating')
  .action((options) => {
    status(options);
  });

program
  .command('runs [job-name]')
  .description('Show execution history for a heartbeat')
  .option('-c, --config <path>', 'Path to cardioclaw.yml', 'cardioclaw.yml')
  .option('--all', 'Show runs for all jobs')
  .option('--limit <n>', 'Number of runs to show', '20')
  .option('--no-refresh', 'Skip discovery refresh')
  .option('-v, --verbose', 'Show error messages')
  .action((jobName, options) => {
    showRuns(jobName, options);
  });

program
  .command('snapshot')
  .description('Take a screenshot of the dashboard')
  .option('-c, --config <path>', 'Path to cardioclaw.yml', 'cardioclaw.yml')
  .option('-o, --output <path>', 'Output PNG path (default: temp file)')
  .option('-v, --view <view>', 'View to capture: hourly, calendar, or list', 'list')
  .option('--width <px>', 'Viewport width', '1400')
  .option('--height <px>', 'Viewport height', '900')
  .option('--wait <ms>', 'Extra ms to wait after page load', '1200')
  .action(async (options) => {
    try {
      const outputPath = await snapshot({
        config: options.config,
        output: options.output,
        view: options.view,
        width: parseInt(options.width, 10),
        height: parseInt(options.height, 10),
        wait: parseInt(options.wait, 10),
      });
      console.log(outputPath);
    } catch (err) {
      console.error('snapshot error:', err.message);
      process.exit(1);
    }
  });

// ============================================
// Removed Commands (1.0)
// ============================================
// The following commands have been removed in 1.0:
// - import: Use OpenClaw native tools to create cron jobs
// - export: No longer needed (sync generates cardioclaw.yml)
// - dedupe: Use OpenClaw cron management directly
// - remove: Use `openclaw cron rm <id>`
// - prune: No longer writing to OpenClaw configs
//
// CardioClaw 1.0 is a READ-ONLY lens into OpenClaw scheduling.
// For job management, use:
//   openclaw cron add ...
//   openclaw cron rm <id>
//   openclaw cron edit <id> ...

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
