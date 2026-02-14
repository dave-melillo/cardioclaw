#!/usr/bin/env node

const { Command } = require('commander');
const { sync } = require('../lib/sync');
const { status } = require('../lib/status');
const { discover } = require('../lib/discovery');
const { importJobs } = require('../lib/import');
const { startDashboard } = require('../lib/server');
const { dedupe } = require('../lib/dedupe');
const packageJson = require('../package.json');

const program = new Command();

program
  .name('cardioclaw')
  .description('YAML to OpenClaw cron sync tool')
  .version(packageJson.version);

program
  .command('sync')
  .description('Read cardioclaw.yaml and create OpenClaw cron jobs')
  .option('-c, --config <path>', 'Path to cardioclaw.yaml', 'cardioclaw.yaml')
  .option('--dry-run', 'Show what would be created without executing')
  .option('-f, --force', 'Replace existing jobs instead of skipping')
  .action((options) => {
    sync(options);
  });

program
  .command('status')
  .description('Show all heartbeats and system health')
  .option('-c, --config <path>', 'Path to cardioclaw.yaml', 'cardioclaw.yaml')
  .option('--no-refresh', 'Skip discovery refresh')
  .action((options) => {
    status(options);
  });

program
  .command('discover')
  .description('Discover and refresh all OpenClaw cron jobs')
  .option('-c, --config <path>', 'Path to cardioclaw.yaml', 'cardioclaw.yaml')
  .action((options) => {
    const configPath = options.config;
    console.log('');
    discover(configPath);
    console.log('✓ Discovery complete\n');
  });

program
  .command('dashboard')
  .description('Start web dashboard at localhost:3333')
  .option('-c, --config <path>', 'Path to cardioclaw.yaml', 'cardioclaw.yaml')
  .option('-p, --port <port>', 'Port number', '3333')
  .action((options) => {
    startDashboard(options);
  });

program
  .command('import')
  .description('Import existing OpenClaw cron jobs into cardioclaw.yaml')
  .option('-c, --config <path>', 'Path to cardioclaw.yaml', 'cardioclaw.yaml')
  .option('--dry-run', 'Preview without writing changes')
  .action((options) => {
    importJobs(options);
  });

program
  .command('dedupe')
  .description('Remove duplicate cron jobs (keeps newest of each name)')
  .option('--dry-run', 'Preview without removing')
  .action((options) => {
    dedupe(options);
  });

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
