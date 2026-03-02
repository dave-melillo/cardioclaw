# CardioClaw Remote Access - Test Guide

## Quick Test

**On headless server (Pi, VPS, Mac mini):**
```bash
cardioclaw dashboard
```

**Expected output (Tailscale detected):**
```
✓ Dashboard running on Tailscale

→ http://server.***REMOVED***.ts.net:3333
→ http://***REMOVED***:3333

⚠️  HTTP only — traffic is unencrypted.
    For HTTPS: use Tailscale serve or a reverse proxy.

Press Ctrl+C to stop
```

**On workstation:**
- Open `http://server.***REMOVED***.ts.net:3333` in browser
- Dashboard should load without SSH tunnel

---

## Test Scenarios

### Test 1: Tailscale Auto-Detection ✅
**Setup:** Machine with Tailscale running

```bash
cardioclaw dashboard
```

**Expected:**
- Binds to Tailscale IP (e.g., ***REMOVED***)
- Shows Tailscale hostname URL
- Shows Tailscale IP URL
- Accessible from other Tailscale devices

**Verify:**
```bash
curl http://$(tailscale ip -4):3333/api/status
# Should return JSON status
```

---

### Test 2: LAN Fallback ✅
**Setup:** Machine without Tailscale (or `--localhost` override)

```bash
# Stop Tailscale temporarily
sudo tailscale down

cardioclaw dashboard
```

**Expected:**
- Binds to 0.0.0.0 (all interfaces)
- Shows LAN IP URL (e.g., 192.168.1.100:3333)
- Accessible from other devices on LAN

**Verify:**
```bash
curl http://192.168.1.100:3333/api/status
# Should return JSON status
```

---

### Test 3: Localhost Override ✅
**Setup:** Force localhost-only binding

```bash
cardioclaw dashboard --localhost
```

**Expected:**
- Binds to localhost only
- Shows `http://localhost:3333`
- NOT accessible from other devices

**Verify:**
```bash
curl http://localhost:3333/api/status
# Works locally

curl http://192.168.1.100:3333/api/status
# Fails (connection refused)
```

---

## Verification Commands

**Check bind address:**
```bash
# While dashboard is running
lsof -i :3333
# Should show which address it's bound to
```

**Test from remote:**
```bash
# From another machine on Tailscale
curl http://server.***REMOVED***.ts.net:3333/api/status

# From another machine on LAN
curl http://192.168.1.100:3333/api/status
```

---

## Auto-Detection Logic

**Priority order:**
1. **Tailscale IP** (if `tailscale ip -4` succeeds)
   - Binds to Tailscale IP (e.g., ***REMOVED***)
   - Shows Tailscale hostname + IP URLs
   
2. **LAN IP** (if no Tailscale)
   - Binds to 0.0.0.0 (all interfaces)
   - Shows first non-loopback IPv4 address
   
3. **Localhost** (with --localhost flag)
   - Binds to 127.0.0.1
   - Shows localhost URL only

---

## Common Issues

### "ERR_NAME_NOT_RESOLVED" on Tailscale hostname
**Cause:** Tailscale MagicDNS not configured

**Fix:** Use IP address instead:
```
http://***REMOVED***:3333
```

### Dashboard not accessible from LAN
**Cause:** Firewall blocking port 3333

**Fix:** Allow port in firewall:
```bash
# macOS
sudo pfctl -f /etc/pf.conf

# Linux
sudo ufw allow 3333/tcp
```

### "Address already in use"
**Cause:** Port 3333 already bound

**Fix:** Use different port:
```bash
cardioclaw dashboard --port 3344
```

---

## Security Notes

**Safe:**
- Tailscale binding (encrypted mesh network, access-controlled)
- LAN binding (trusted home/office network)
- localhost binding (same machine only)

**Warning:**
- Dashboard uses HTTP (no encryption)
- For HTTPS: use `tailscale serve` or reverse proxy
- Dashboard is read-only (no sensitive actions)

---

## For Dave

**Your setup (verified working):**
- Tailscale detected: `outrider.***REMOVED***.ts.net`
- IP: `***REMOVED***`
- Dashboard accessible at: `http://outrider.***REMOVED***.ts.net:3333`

**No changes needed** - just run `cardioclaw dashboard` and it works remotely.
