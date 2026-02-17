const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const CONFIG_DIR = path.join(os.homedir(), '.cardioclaw');
const CONFIG_PATH = path.join(CONFIG_DIR, 'cardioclaw.yaml');

function getOpenClawTimezone() {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return cfg.timezone || (cfg.gateway && cfg.gateway.timezone) || null;
  } catch (_) {
    return null;
  }
}

function detectTimezone() {
  return (
    getOpenClawTimezone() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC'
  );
}

function buildScaffold(timezone) {
  return `# CardioClaw Configuration
# Docs: https://github.com/dave-melillo/cardioclaw

defaults:
  timezone: ${timezone}

heartbeats:
  # Example:
  # - name: Morning Briefing
  #   schedule: "0 8 * * *"
  #   prompt: "Run morning briefing"
  #   delivery: telegram
`;
}

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function init() {
  // 1. Already exists?
  if (fs.existsSync(CONFIG_PATH)) {
    console.log(`\nConfig already exists at ${CONFIG_PATH}\n`);
    process.exit(0);
  }

  // 2. Detect timezone
  const detected = detectTimezone();

  // 3. Confirm with user
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await prompt(rl, `\nDetected timezone: ${detected}. Use this? (Y/n) `);
  let timezone = detected;

  if (answer.trim().toLowerCase() === 'n') {
    const custom = await prompt(rl, 'Enter IANA timezone (e.g. America/New_York): ');
    timezone = custom.trim() || detected;
  }

  rl.close();

  // 4. Write scaffold
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, buildScaffold(timezone));

  // 5. Done
  console.log(`\n✅ Created ${CONFIG_PATH}\n`);
  console.log('Next steps:');
  console.log('  1. Edit the file to add your heartbeats');
  console.log('  2. Run: cardioclaw sync\n');
}

module.exports = { init };
