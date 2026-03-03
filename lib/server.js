const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { CronExpressionParser } = require('cron-parser');
const { sync } = require('./sync');
const { getBindAddress } = require('./bind-address');

// Cache for cardioclaw.yml data
let cardioCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5000; // 5 second cache

/**
 * Load cardios from cardioclaw.yml
 */
function loadCardios(configPath) {
  const now = Date.now();
  if (cardioCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cardioCache;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const data = yaml.load(content);
    cardioCache = data;
    cacheTimestamp = now;
    return data;
  } catch (err) {
    console.error('Failed to load cardioclaw.yml:', err.message);
    return { cardios: [], summary: {} };
  }
}

/**
 * Generate a cryptographically random 32-char hex token.
 */
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Always compares both buffers even when lengths differ (dummy op on mismatch).
 */
function safeTokenCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.byteLength !== bufB.byteLength) {
    // Perform a dummy comparison to avoid leaking length information via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Build token auth middleware. If token is null, allows all requests (localhost mode).
 * Checks: ?token= query param OR Authorization: Bearer <token> header.
 */
function tokenAuthMiddleware(token) {
  if (!token) return (req, res, next) => next();

  return (req, res, next) => {
    const queryToken = req.query.token;
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (safeTokenCompare(queryToken, token) || safeTokenCompare(bearerToken, token)) {
      return next();
    }

    // For API routes return JSON; for dashboard return plain 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized: valid token required' });
    }

    res.status(401).send('401 Unauthorized: add ?token=<token> to the URL');
  };
}

/**
 * Get all accessible network addresses
 */
function getNetworkAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets) {
      // Skip internal/loopback
      if (net.internal) continue;
      // IPv4 only for simplicity
      if (net.family !== 'IPv4') continue;
      
      addresses.push({
        name: name,
        address: net.address,
        // Detect Tailscale (100.x.x.x range)
        isTailscale: net.address.startsWith('100.')
      });
    }
  }
  
  return addresses;
}

/**
 * Simple Content-Security-Policy middleware (helmet-lite)
 */
function cspMiddleware(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",   // inline styles used by the terminal CSS
      "font-src 'self' data:",               // allow data: fonts / local system fonts
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
}

/**
 * Parse and validate a positive finite integer from a query string value.
 * Returns the integer on success, or null if invalid.
 */
function parsePositiveInt(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Build and return the Express app without starting the HTTP server.
 * Useful for programmatic use (e.g. snapshot command) where the caller
 * controls the server lifecycle.
 *
 * @param {object} options
 * @param {string} [options.config]  Path to cardioclaw.yaml
 * @param {boolean} [options.remote] Enable remote/token mode
 * @param {string} [options.token]   Pre-set token (remote mode only)
 * @param {boolean} [options.silent] Suppress console output during discovery
 * @returns {{ app: import('express').Express, token: string|null }}
 */
function createDashboardApp(options = {}) {
  const app = express();

  // --remote: bind to all interfaces and require a token
  const remote = !!options.remote;
  const token = remote ? (options.token || generateToken()) : null;

  // Security headers
  app.use(cspMiddleware);

  // Middleware
  app.use(express.json());

  // Static files — served BEFORE token auth (CSS/JS don't need protection)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Token auth — only for API routes
  app.use('/api', tokenAuthMiddleware(token));

  // Config path for cardioclaw.yml
  const configPath = path.resolve(options.config || 'cardioclaw.yml');
  
  // Initial sync to generate/update cardioclaw.yml
  if (!options.silent) console.log('🔍 Syncing OpenClaw data...');
  try {
    sync({ output: configPath, silent: true });
  } catch (err) {
    console.warn('Initial sync failed:', err.message);
  }

  // Rate limiter state for /api/refresh
  let lastRefreshAt = 0;
  const REFRESH_INTERVAL_MS = 10 * 1000; // 10 seconds

  // ============================================
  // API Routes - All read from cardioclaw.yml
  // ============================================
  
  // GET /api/heartbeats - Returns all cardios (heartbeats + cron jobs unified)
  app.get('/api/heartbeats', (req, res) => {
    try {
      const data = loadCardios(configPath);
      const cardios = data.cardios || [];
      
      // Transform to dashboard-expected format
      const jobs = cardios.map(c => ({
        id: c.id,
        name: c.name,
        schedule: formatScheduleForDashboard(c.schedule, c.type),
        agent: c.agentId,
        status: c.enabled ? 'active' : 'disabled',
        next_run_at: c.state?.nextRunAt || null,
        last_run_at: c.state?.lastRunAt || null,
        last_status: c.state?.lastStatus === 'unknown' ? null : c.state?.lastStatus,
        last_error: c.state?.lastError || null,
        type: c.type,
        managed: 1
      }));
      
      res.json({ jobs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Helper to format schedule for dashboard
  function formatScheduleForDashboard(schedule, type) {
    if (type === 'heartbeat') {
      // Convert "15m" to { kind: 'every', everyMs: 900000 }
      const ms = parseIntervalToMs(schedule);
      return JSON.stringify({ kind: 'every', everyMs: ms });
    } else {
      // Cron expression - wrap in object
      return JSON.stringify({ kind: 'cron', expr: schedule });
    }
  }
  
  function parseIntervalToMs(interval) {
    if (!interval) return 3600000;
    const match = String(interval).match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 3600000;
    const [, num, unit] = match;
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(num, 10) * (mult[unit] || 60000);
  }

  // GET /api/heartbeats/:id - Get single cardio by ID
  app.get('/api/heartbeats/:id', (req, res) => {
    try {
      const data = loadCardios(configPath);
      const cardio = (data.cardios || []).find(c => c.id === req.params.id);
      
      if (!cardio) {
        return res.status(404).json({ error: 'Cardio not found' });
      }
      
      res.json({ job: cardio });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/status - Summary stats from cardioclaw.yml
  app.get('/api/status', (req, res) => {
    try {
      const data = loadCardios(configPath);
      const cardios = data.cardios || [];
      const summary = data.summary || {};
      
      const activeCount = cardios.filter(c => c.enabled).length;
      const failingCount = cardios.filter(c => c.state?.lastStatus === 'error').length;
      const heartbeatCount = cardios.filter(c => c.type === 'heartbeat').length;
      const cronCount = cardios.filter(c => c.type === 'cron').length;
      
      // Find next scheduled job
      const now = Date.now();
      const nextJob = cardios
        .filter(c => c.enabled && c.state?.nextRunAt)
        .sort((a, b) => (a.state.nextRunAt || 0) - (b.state.nextRunAt || 0))[0] || null;
      
      // Find failing jobs
      const failingJobs = cardios.filter(c => c.state?.lastStatus === 'error');
      
      res.json({
        active: activeCount,
        failing: failingCount,
        heartbeats: heartbeatCount,
        cronJobs: cronCount,
        total: cardios.length,
        warnings: summary.warnings || 0,
        nextJob: nextJob ? {
          id: nextJob.id,
          name: nextJob.name,
          next_run_at: nextJob.state?.nextRunAt
        } : null,
        failingJobs: failingJobs.map(j => ({
          id: j.id,
          name: j.name,
          last_error: j.state?.lastError
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/runs - Run history (placeholder - would need to integrate with OpenClaw logs)
  app.get('/api/runs', (req, res) => {
    try {
      const { job_id, limit: limitParam = '50' } = req.query;
      
      if (!job_id) {
        return res.status(400).json({ error: 'job_id parameter required' });
      }

      // TODO: Integrate with OpenClaw cron run history
      // For now, return empty - run history is in OpenClaw's domain
      res.json({ runs: [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/runs/summary - Run stats (placeholder)
  app.get('/api/runs/summary', (req, res) => {
    try {
      // TODO: Integrate with OpenClaw run history
      res.json({ summary: { total: 0, success: 0, failed: 0 } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/occurrences - Future scheduled occurrences
  app.get('/api/occurrences', (req, res) => {
    try {
      const { start, end } = req.query;
      
      if (!start || !end) {
        return res.status(400).json({ error: 'start and end parameters required (ISO timestamps)' });
      }
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      
      const data = loadCardios(configPath);
      const cardios = data.cardios || [];
      
      const occurrences = [];
      
      for (const cardio of cardios) {
        if (!cardio.enabled) continue;
        
        try {
          if (cardio.type === 'cron') {
            // Parse cron expression
            const interval = CronExpressionParser.parse(cardio.schedule, {
              currentDate: startDate,
              endDate: endDate,
              tz: cardio.timezone || 'America/New_York'
            });
            
            // Get all occurrences in range
            while (true) {
              try {
                const next = interval.next();
                const timestamp = next.toDate().getTime();
                
                occurrences.push({
                  jobId: cardio.id,
                  jobName: cardio.name,
                  agent: cardio.agentId,
                  timestamp: timestamp,
                  schedule: cardio.schedule,
                  type: 'cron'
                });
              } catch (e) {
                // No more occurrences in range
                break;
              }
            }
          } else if (cardio.type === 'heartbeat') {
            // Heartbeats run at intervals - calculate occurrences
            const intervalMs = parseIntervalToMs(cardio.schedule);
            let current = cardio.state?.nextRunAt || startDate.getTime();
            
            while (current <= endDate.getTime()) {
              if (current >= startDate.getTime()) {
                occurrences.push({
                  jobId: cardio.id,
                  jobName: cardio.name,
                  agent: cardio.agentId,
                  timestamp: current,
                  schedule: cardio.schedule,
                  type: 'heartbeat'
                });
              }
              current += intervalMs;
            }
          }
        } catch (err) {
          // Skip cardios with invalid schedules
          continue;
        }
      }
      
      // Sort by timestamp
      occurrences.sort((a, b) => a.timestamp - b.timestamp);
      
      res.json({ occurrences });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/refresh - Re-sync from OpenClaw and reload
  app.post('/api/refresh', (req, res) => {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_INTERVAL_MS) {
      const retryAfter = Math.ceil((REFRESH_INTERVAL_MS - (now - lastRefreshAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Rate limited. Try again in ${retryAfter}s.` });
    }
    try {
      lastRefreshAt = now;
      // Re-sync from OpenClaw configs
      sync({ output: configPath, silent: true });
      // Clear cache to force reload
      cardioCache = null;
      cacheTimestamp = 0;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return { app, token };
}

function startDashboard(options) {
  const port = options.port || 3333;
  
  // Auto-detect bind address (Tailscale → LAN → localhost)
  const bindConfig = getBindAddress(options);

  // SECURITY FIX (F1): Enable auth when binding to network
  const needsAuth = bindConfig.mode !== 'localhost';
  const { app, token } = createDashboardApp({
    ...options,
    remote: needsAuth
  });

  // Start server
  app.listen(port, bindConfig.address, () => {
    console.log('');
    console.log('🫀 CardioClaw Dashboard');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Show mode
    if (bindConfig.mode === 'tailscale') {
      console.log('  ✓ Dashboard running on Tailscale');
    } else if (bindConfig.mode === 'lan') {
      console.log('  ✓ Dashboard running on LAN');
    } else {
      console.log('  ✓ Dashboard running locally');
    }
    console.log('');

    // Show access URLs
    bindConfig.displayUrls.forEach((url, index) => {
      if (index === 0) {
        console.log(`  → ${url}`);
      } else {
        console.log(`  → ${url}`);
      }
    });

    // Show token if auth is enabled (SECURITY FIX C2: explicit auth status)
    if (token) {
      console.log('');
      console.log(`  🔐 Auth Token: ${token}`);
      console.log(`      Add ?token=${token} to URLs or use Authorization: Bearer ${token}`);
    }

    // SECURITY FIX (C2): Explicit warning for network access
    if (bindConfig.mode !== 'localhost') {
      console.log('');
      console.log('  ⚠️  NETWORK ACCESS ENABLED');
      console.log(`      • Dashboard accessible on ${bindConfig.mode}`);
      console.log('      • Anyone on this network can view cron jobs and run history');
      console.log(`      • Authentication ${token ? 'REQUIRED' : 'DISABLED'}`);
      console.log('      • Traffic is unencrypted HTTP');
      console.log('      For HTTPS: use Tailscale serve or a reverse proxy');
    }

    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
  });
}

module.exports = { startDashboard, createDashboardApp };
