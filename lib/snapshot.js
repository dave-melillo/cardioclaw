'use strict';

const http = require('http');
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Find a free TCP port on localhost.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Poll localhost:port until it responds, or timeout.
 */
function waitForServer(port, { timeoutMs = 15000, intervalMs = 200 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function attempt() {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        if (res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', () => retry());
      req.setTimeout(500, () => { req.destroy(); retry(); });
    }

    function retry() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Dashboard did not become ready within ${timeoutMs}ms`));
      }
      setTimeout(attempt, intervalMs);
    }

    attempt();
  });
}

/**
 * Locate the Playwright-managed Chromium executable.
 * Looks in ~/Library/Caches/ms-playwright (macOS) and ~/.cache/ms-playwright (Linux).
 */
function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  const cacheRoots = [
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
    path.join(os.homedir(), '.cache', 'ms-playwright'),              // Linux
  ];

  for (const cacheRoot of cacheRoots) {
    if (!fs.existsSync(cacheRoot)) continue;

    const dirs = fs.readdirSync(cacheRoot)
      .filter(d => d.startsWith('chromium-'))
      .sort().reverse();                         // newest first

    for (const dir of dirs) {
      const candidates = [
        path.join(cacheRoot, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(cacheRoot, dir, 'chrome-mac-x64',  'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(cacheRoot, dir, 'chrome-linux',     'chrome'),
        path.join(cacheRoot, dir, 'chrome-linux64',   'chrome'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
  }

  // macOS system Chrome
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(macChrome)) return macChrome;

  throw new Error(
    'No Chromium/Chrome found.\n' +
    'Install with: npx playwright install chromium\n' +
    'Or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to your Chrome executable.'
  );
}

/**
 * Take a screenshot of the CardioClaw dashboard.
 *
 * Starts the dashboard on a random port, waits for it, takes the screenshot,
 * and cleans up — all without touching a running dashboard if one is already
 * running on port 3333.
 *
 * @param {object} [options]
 * @param {string}  [options.output]    Output path (supports ~). Default: temp file.
 * @param {string}  [options.config]    Path to cardioclaw.yaml
 * @param {number}  [options.width]     Viewport width  (default 1400)
 * @param {number}  [options.height]    Viewport height (default 900)
 * @param {number}  [options.wait]      Extra ms after page load (default 1200)
 * @param {boolean} [options.fullPage]  Capture full scrollable page (default false)
 * @returns {Promise<string>} Absolute path to the PNG file
 */
async function takeSnapshot(options = {}) {
  const outputPath = options.output
    ? path.resolve(options.output.replace(/^~/, os.homedir()))
    : path.join(os.tmpdir(), `cardioclaw-${Date.now()}.png`);

  const configPath = options.config || 'cardioclaw.yaml';
  const width      = options.width  || 1400;
  const height     = options.height || 900;
  const settleMs   = typeof options.wait === 'number' ? options.wait : 1200;

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Pick a random available port so we don't conflict with any live dashboard
  const port = await getFreePort();

  // Spawn the dashboard as a child process (localhost only, no auth needed)
  const serverProcess = spawn(
    process.execPath,
    [
      path.join(__dirname, '..', 'bin', 'cardioclaw.js'),
      'dashboard',
      '--port', String(port),
      '--host', '127.0.0.1',
      '--config', configPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: false }
  );

  // Surface server stderr for debugging, but don't let it block
  // serverProcess.stderr.on('data', (d) => process.stderr.write(d));

  let browser;

  try {
    // Wait for the server to accept connections
    await waitForServer(port);

    // Launch Chromium headlessly
    const { chromium } = require('playwright-core');
    const executablePath = findChromiumExecutable();

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width, height });

    // Navigate and wait for network activity to settle
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    // Give client-side JS a moment to populate the UI
    if (settleMs > 0) await page.waitForTimeout(settleMs);

    // Capture
    await page.screenshot({ path: outputPath, fullPage: !!options.fullPage });

    return outputPath;

  } finally {
    // Always clean up browser and ephemeral server
    if (browser) {
      await browser.close().catch(() => {});
    }

    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          try { serverProcess.kill('SIGKILL'); } catch (_) {}
          resolve();
        }, 2500);
        serverProcess.once('exit', () => { clearTimeout(t); resolve(); });
      });
    }
  }
}

module.exports = { takeSnapshot };
