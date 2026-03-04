# CardioClaw Remote Access - Test Guide

## Quick Test

**On headless server (Pi, VPS, Mac mini):**
```bash
cardioclaw dashboard --remote
```

**Expected output (Tailscale detected):**
```
✓ Dashboard running on Tailscale

→ http://your-server.tailnet.ts.net:3333
→ http://100.x.x.x:3333

🔐 Auth Token: abc123def456

⚠️  HTTP only — traffic is unencrypted.
    For HTTPS: use Tailscale serve or a reverse proxy.

Press Ctrl+C to stop
```

**On workstation:**
- Open `http://your-server.tailnet.ts.net:3333?token=abc123def456` in browser
- Dashboard should load

---

## Test Scenarios

### Test 1: Tailscale Auto-Detection ✅
**Setup:** Machine with Tailscale running

```bash
cardioclaw dashboard --remote
```

**Expected:**
- Binds to Tailscale IP (e.g., 100.x.x.x)
- Shows Tailscale hostname URL
- Shows Tailscale IP URL
- Requires token authentication
- Accessible from other Tailscale devices

**Verify:**
```bash
curl "http://$(tailscale ip -4):3333/api/status?token=YOUR_TOKEN"
# Should return JSON status
```

---

### Test 2: LAN Fallback ✅
**Setup:** Machine without Tailscale (using --remote)

```bash
cardioclaw dashboard --remote
```

**Expected:**
- Binds to 0.0.0.0 (all interfaces)
- Shows LAN IP URL (e.g., 192.168.1.100:3333)
- Requires token authentication
- Accessible from other devices on LAN

**Verify:**
```bash
curl "http://192.168.1.100:3333/api/status?token=YOUR_TOKEN"
# Should return JSON status
```

---

### Test 3: Localhost Default ✅
**Setup:** Default behavior (no --remote flag)

```bash
cardioclaw dashboard
```

**Expected:**
- Binds to localhost only
- Shows `http://localhost:3333`
- No authentication required (localhost is trusted)
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
curl "http://your-server.tailnet.ts.net:3333/api/status?token=YOUR_TOKEN"

# From another machine on LAN
curl "http://192.168.1.100:3333/api/status?token=YOUR_TOKEN"
```

---

## Auto-Detection Logic

**Priority order:**
1. **Localhost** (default, no --remote flag)
   - Binds to 127.0.0.1
   - No authentication required
   - Safe default

2. **Tailscale IP** (with --remote, if Tailscale running)
   - Binds to Tailscale IP (e.g., 100.x.x.x)
   - Shows Tailscale hostname + IP URLs
   - Token authentication required
   
3. **LAN IP** (with --remote, no Tailscale)
   - Binds to 0.0.0.0 (all interfaces)
   - Shows first non-loopback IPv4 address
   - Token authentication required

---

## Common Issues

### "ERR_NAME_NOT_RESOLVED" on Tailscale hostname
**Cause:** Tailscale MagicDNS not configured

**Fix:** Use IP address instead:
```
http://100.x.x.x:3333?token=YOUR_TOKEN
```

### Dashboard not accessible from LAN
**Cause:** Firewall blocking port 3333

**Fix:** Allow port in firewall:
```bash
# macOS
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/node

# Linux
sudo ufw allow 3333/tcp
```

### "Address already in use"
**Cause:** Port 3333 already bound

**Fix:** Use different port:
```bash
cardioclaw dashboard --port 3344
```

### "401 Unauthorized"
**Cause:** Missing or invalid token

**Fix:** Add token to URL:
```
http://your-server:3333?token=YOUR_TOKEN
```

Or use Authorization header:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://your-server:3333/api/status
```

---

## Security Notes

**Safe:**
- Localhost binding (default) — same machine only, no auth needed
- Remote + token auth — network access with authentication

**Warning:**
- Dashboard uses HTTP (no encryption)
- For HTTPS: use `tailscale serve` or reverse proxy
- Dashboard is read-only (no sensitive actions)

---

## Example Setup

**Your setup:**
1. Run dashboard with remote access:
   ```bash
   cardioclaw dashboard --remote
   ```
2. Note the token from output
3. Access from browser:
   ```
   http://your-server.tailnet.ts.net:3333?token=YOUR_TOKEN
   ```

**No changes needed** - just run `cardioclaw dashboard --remote` and it works.
