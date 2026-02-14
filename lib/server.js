const express = require('express');
const path = require('path');
const os = require('os');
const { CronExpressionParser } = require('cron-parser');
const { getDatabase, getAllJobs, getManagedJobs, getFailingJobs, getRunsForJob, getRunsSummary } = require('./db');
const { discover } = require('./discovery');

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

function startDashboard(options) {
  const app = express();
  const port = options.port || 3333;
  const host = '0.0.0.0'; // Bind to all interfaces

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Initial discovery
  console.log('🔍 Refreshing heartbeat data...');
  discover(options.config || 'cardioclaw.yaml');

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
      const { job_id, limit = 50 } = req.query;
      
      if (!job_id) {
        return res.status(400).json({ error: 'job_id parameter required' });
      }
      
      const db = getDatabase();
      const runs = getRunsForJob(db, job_id, parseInt(limit, 10));
      db.close();
      
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get runs summary (last 7 days)
  app.get('/api/runs/summary', (req, res) => {
    try {
      const { days = 7 } = req.query;
      const db = getDatabase();
      const summary = getRunsSummary(db, parseInt(days, 10));
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

  // Refresh endpoint (manual trigger)
  app.post('/api/refresh', (req, res) => {
    try {
      discover(options.config || 'cardioclaw.yaml');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start server on all interfaces
  app.listen(port, host, () => {
    console.log('');
    console.log('🫀 CardioClaw Dashboard');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('  Local:        http://localhost:' + port);
    
    // Print network addresses
    const addresses = getNetworkAddresses();
    let hasTailscale = false;
    
    for (const addr of addresses) {
      if (addr.isTailscale) {
        console.log(`  Tailscale:    http://${addr.address}:${port}`);
        hasTailscale = true;
      } else {
        console.log(`  Network:      http://${addr.address}:${port}`);
      }
    }
    
    console.log('');
    
    // Tip for Tailscale users
    if (hasTailscale) {
      console.log('  💡 For HTTPS, run: tailscale serve ' + port);
      console.log('');
    }
    
    console.log('Press Ctrl+C to stop');
    console.log('');
  });
}

module.exports = { startDashboard };
