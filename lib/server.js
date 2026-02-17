const express = require('express');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { CronExpressionParser } = require('cron-parser');
const { getDatabase, getAllJobs, getManagedJobs, getFailingJobs, getRunsForJob, getRunsSummary } = require('./db');
const { discover } = require('./discovery');

/**
 * Generate a cryptographically random 32-char hex token.
 */
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
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

    if (queryToken === token || bearerToken === token) {
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

function startDashboard(options) {
  const app = express();
  const port = options.port || 3333;

  // --remote: bind to all interfaces and require a token
  const remote = !!options.remote;
  const host = options.host || (remote ? '0.0.0.0' : '127.0.0.1');
  const token = remote ? (options.token || generateToken()) : null;

  // Security headers
  app.use(cspMiddleware);

  // Token auth — applied before all routes
  app.use(tokenAuthMiddleware(token));

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Initial discovery
  console.log('🔍 Refreshing heartbeat data...');
  discover(options.config || 'cardioclaw.yaml');

  // Rate limiter state for /api/refresh (simple in-process debounce)
  let lastRefreshAt = 0;
  const REFRESH_INTERVAL_MS = 10 * 1000; // 10 seconds

  // API Routes
  app.get('/api/heartbeats', (req, res) => {
    try {
      const db = getDatabase();
      const jobs = getAllJobs(db);
      db.close();
      res.json({ jobs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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

  // Start server
  app.listen(port, host, () => {
    console.log('');
    console.log('🫀 CardioClaw Dashboard');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (!remote) {
      // Localhost-only mode (default)
      console.log('  Local:        http://localhost:' + port);
    } else {
      // Remote mode — print all access URLs with token
      console.log('  Mode:         🌐 Remote (network access enabled)');
      console.log('  Token:        ' + token);
      console.log('');

      // Always print localhost URL first
      console.log(`  Local:        http://localhost:${port}?token=${token}`);

      const addresses = getNetworkAddresses();
      let hasTailscale = false;

      for (const addr of addresses) {
        if (addr.isTailscale) {
          console.log(`  Tailscale:    http://${addr.address}:${port}?token=${token}`);
          hasTailscale = true;
        } else {
          console.log(`  Network:      http://${addr.address}:${port}?token=${token}`);
        }
      }

      if (hasTailscale) {
        console.log('');
        console.log('  💡 For HTTPS, run: tailscale serve ' + port);
      }

      console.log('');
      console.log('  ⚠️  Keep this token secret — it grants full dashboard access');
    }

    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
  });
}

module.exports = { startDashboard };
