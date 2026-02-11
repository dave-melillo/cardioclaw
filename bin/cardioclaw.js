#!/usr/bin/env node

const { Command } = require('commander');
const { sync } = require('../lib/sync');
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
  .action((options) => {
    sync(options);
  });

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
