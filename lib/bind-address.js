/**
 * Auto-detect best bind address for dashboard
 * Priority: Tailscale IP → LAN IP → localhost
 */

const { spawnSync } = require('child_process');
const os = require('os');

/**
 * Auto-detect best bind address for dashboard
 * @param {Object} options - CLI options
 * @returns {Object} { address, displayUrls, mode }
 */
function getBindAddress(options = {}) {
  const port = options.port || 3333;

  // Override: force localhost if requested
  if (options.localhost) {
    return {
      address: 'localhost',
      displayUrls: [`http://localhost:${port}`],
      mode: 'localhost'
    };
  }

  // Try Tailscale first (most secure for remote access)
  const tailscaleIP = detectTailscaleIP();
  if (tailscaleIP) {
    const hostname = getTailscaleHostname();
    const urls = hostname
      ? [`http://${hostname}:${port}`, `http://${tailscaleIP}:${port}`]
      : [`http://${tailscaleIP}:${port}`];
    
    return {
      address: tailscaleIP,
      displayUrls: urls,
      mode: 'tailscale'
    };
  }

  // Fallback: bind to all interfaces (LAN access)
  const lanIP = getLANIP();
  const urls = lanIP
    ? [`http://${lanIP}:${port}`, `http://localhost:${port}`]
    : [`http://localhost:${port}`];

  return {
    address: '0.0.0.0',
    displayUrls: urls,
    mode: 'lan'
  };
}

/**
 * Detect Tailscale IPv4 address
 * @returns {string|null} Tailscale IP or null
 */
function detectTailscaleIP() {
  try {
    const result = spawnSync('tailscale', ['ip', '-4'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (result.status === 0 && result.stdout) {
      const ip = result.stdout.trim();
      // Validate IP format
      if (ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        return ip;
      }
    }
  } catch (err) {
    // Tailscale CLI not available
  }
  return null;
}

/**
 * Get Tailscale hostname (DNS name)
 * @returns {string|null} Tailscale hostname or null
 */
function getTailscaleHostname() {
  try {
    const result = spawnSync('tailscale', ['status', '--json'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (result.status === 0 && result.stdout) {
      const status = JSON.parse(result.stdout);
      const dnsName = status.Self?.DNSName;
      // Remove trailing dot from DNS name
      return dnsName ? dnsName.replace(/\.$/, '') : null;
    }
  } catch (err) {
    // Can't get hostname, just use IP
  }
  return null;
}

/**
 * Get first non-loopback, non-Tailscale LAN IPv4 address
 * @returns {string|null} LAN IP or null
 */
function getLANIP() {
  const interfaces = os.networkInterfaces();
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    // Skip loopback, Tailscale, and VPN interfaces
    if (name === 'lo' || 
        name === 'lo0' ||
        name.includes('tailscale') || 
        name.includes('utun') ||
        name.includes('tun')) {
      continue;
    }

    if (!addrs) continue;

    for (const addr of addrs) {
      // Find first non-internal IPv4 address
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  
  return null;
}

module.exports = {
  getBindAddress,
  detectTailscaleIP,
  getTailscaleHostname,
  getLANIP
};
