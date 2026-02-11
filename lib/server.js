const express = require('express');
const path = require('path');
const { getDatabase, getAllJobs, getManagedJobs, getFailingJobs } = require('./db');
const { discover } = require('./discovery');

function startDashboard(options) {
  const app = express();
  const port = options.port || 3333;

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

  // Refresh endpoint (manual trigger)
  app.post('/api/refresh', (req, res) => {
    try {
      discover(options.config || 'cardioclaw.yaml');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start server
  app.listen(port, () => {
    console.log(`\n🫀 CardioClaw Dashboard`);
    console.log(`   → http://localhost:${port}\n`);
    console.log('Press Ctrl+C to stop\n');
  });
}

module.exports = { startDashboard };
