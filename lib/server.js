const express = require('express');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { CronExpressionParser } = require('cron-parser');
const { getDatabase, getAllJobs, getManagedJobs, getFailingJobs, getRunsForJob, getRunsSummary } = require('./db');
const { discover } = require('./discovery');
const { getAllHeartbeats, getHeartbeatDetails, getHeartbeatHistory } = require('./heartbeat-api');
const { getBindAddress } = require('./bind-address');

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

  // Initial discovery
  if (!options.silent) console.log('🔍 Refreshing heartbeat data...');
  discover(options.config || 'cardioclaw.yaml');

  // Rate limiter state for /api/refresh (simple in-process debounce)
  let lastRefreshAt = 0;
  const REFRESH_INTERVAL_MS = 10 * 1000; // 10 seconds

  // API Routes
  // Returns BOTH cron jobs AND heartbeats in unified format
  app.get('/api/heartbeats', (req, res) => {
    try {
      const db = getDatabase();
      const cronJobs = getAllJobs(db);
      db.close();
      
      // Get heartbeats and convert to job-like format
      const heartbeats = getAllHeartbeats().map(hb => ({
        id: `${hb.id}-heartbeat`,
        name: `${hb.name || hb.id} Heartbeat`,
        schedule: JSON.stringify({ kind: 'every', everyMs: parseHeartbeatSchedule(hb.heartbeat?.every) }),
        agent: hb.id,
        status: hb.status,
        next_run_at: null, // Heartbeats don't have precise next run in this context
        last_run_at: null,
        last_status: null,
        type: 'heartbeat'
      }));
      
      // Mark cron jobs with type
      const jobs = cronJobs.map(j => ({ ...j, type: 'cron' }));
      
      // Merge: heartbeats first, then cron jobs
      res.json({ jobs: [...heartbeats, ...jobs] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Helper to parse heartbeat schedule like "15m" to milliseconds
  function parseHeartbeatSchedule(schedule) {
    if (!schedule) return 3600000; // default 1h
    const match = schedule.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 3600000;
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(num, 10) * (multipliers[unit] || 60000);
  }

  app.get('/api/heartbeats/:id', (req, res) => {
    try {
      const db = getDatabase();
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
      db.close();
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      res.json({ job });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/status', (req, res) => {
    try {
      const db = getDatabase();
      
      const activeCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'active'").get();
      const failingCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'failing'").get();
      const managedCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE managed = 1").get();
      const unmanagedCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE managed = 0").get();
      
      const nextJob = db.prepare(`
        SELECT * FROM jobs 
        WHERE status = 'active' AND next_run_at IS NOT NULL 
        ORDER BY next_run_at LIMIT 1
      `).get();
      
      const failingJobs = getFailingJobs(db);
      
      db.close();
      
      res.json({
        active: activeCount.count,
        failing: failingCount.count,
        managed: managedCount.count,
        unmanaged: unmanagedCount.count,
        nextJob,
        failingJobs
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get runs for specific job
  app.get('/api/runs', (req, res) => {
    try {
      const { job_id, limit: limitParam = '50' } = req.query;
      
      if (!job_id) {
        return res.status(400).json({ error: 'job_id parameter required' });
      }

      const limit = parsePositiveInt(limitParam);
      if (limit === null) {
        return res.status(400).json({ error: 'limit must be a positive integer' });
      }
      
      const db = getDatabase();
      const runs = getRunsForJob(db, job_id, limit);
      db.close();
      
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get runs summary (last 7 days)
  app.get('/api/runs/summary', (req, res) => {
    try {
      const { days: daysParam = '7' } = req.query;
      const days = parsePositiveInt(daysParam);
      if (days === null) {
        return res.status(400).json({ error: 'days must be a positive integer' });
      }
      const db = getDatabase();
      const summary = getRunsSummary(db, days);
      db.close();
      
      res.json({ summary });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get future occurrences for jobs in date range
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
      
      const db = getDatabase();
      const jobs = getAllJobs(db);
      db.close();
      
      const occurrences = [];
      
      for (const job of jobs) {
        try {
          const schedule = JSON.parse(job.schedule);
          
          // Handle cron expressions
          if (schedule.kind === 'cron') {
            const interval = CronExpressionParser.parse(schedule.expr, {
              currentDate: startDate,
              endDate: endDate,
              tz: schedule.tz || 'America/New_York'
            });
            
            // Get all occurrences in range
            while (true) {
              try {
                const next = interval.next();
                const timestamp = next.toDate().getTime();
                
                occurrences.push({
                  jobId: job.id,
                  jobName: job.name,
                  agent: job.agent,
                  timestamp: timestamp,
                  schedule: schedule.expr
                });
              } catch (e) {
                // No more occurrences in range
                break;
              }
            }
          }
          
          // Handle one-shot jobs
          if (schedule.kind === 'at') {
            const atTime = new Date(schedule.at).getTime();
            if (atTime >= startDate.getTime() && atTime <= endDate.getTime()) {
              occurrences.push({
                jobId: job.id,
                jobName: job.name,
                agent: job.agent,
                timestamp: atTime,
                schedule: 'one-shot'
              });
            }
          }
        } catch (err) {
          // Skip jobs with invalid schedules
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

  // Heartbeat detail endpoints (agent-specific)
  app.get('/api/heartbeats/:agentId', (req, res) => {
    try {
      const { agentId } = req.params;
      const heartbeat = getHeartbeatDetails(agentId);
      
      if (!heartbeat) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      res.json(heartbeat);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/heartbeats/:agentId/history', (req, res) => {
    try {
      const { agentId } = req.params;
      const limit = parsePositiveInt(req.query.limit) || 20;
      const history = getHeartbeatHistory(agentId, limit);
      
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Refresh endpoint (manual trigger) — rate limited to once per 10 seconds
  app.post('/api/refresh', (req, res) => {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_INTERVAL_MS) {
      const retryAfter = Math.ceil((REFRESH_INTERVAL_MS - (now - lastRefreshAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Rate limited. Try again in ${retryAfter}s.` });
    }
    try {
      lastRefreshAt = now;
      discover(options.config || 'cardioclaw.yaml');
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
