# CardioClaw Dashboard - Design Changelog

## v2.1 - Dazzler UX Update (2026-02-14)

**Designer:** Dazzler ✨  
**Spec:** `/Users/dave/.openclaw/workspace-dazzler/cardioclaw-ux-direction.md`

### Phase 1 Changes Implemented

#### Icon Strategy
- **Hearts (❤️)** → Primary health metrics (active jobs, health status)
- **Lobsters (🦞)** → Branding (logo) and uptime metric
- **Broken Heart (💔)** → Failing jobs indicator

**Rationale:** Hearts represent system health (universal), lobsters represent brand personality (unique to CardioClaw).

#### Color Palette Updates

**New Colors:**
```css
--bg-primary: #0a0e0d;        /* Deep black-green (was pure black) */
--text-secondary: #a8f5a0;    /* Pale green (was gray) */
--text-dim: #3d4f47;          /* Green-gray (was pure gray) */
--grid-subtle: #1a3a2e;       /* ECG paper grid */

--heart-red: #ff3366;         /* Heart/BPM accent */
--heart-pulse: #ff6b9d;       /* Pulse animation */
--ecg-cyan: #00ffcc;          /* ECG waveform (was pure cyan) */
--status-error: #ff1744;      /* Danger red (was #ff073a) */
--status-warn: #ffb300;       /* Warning amber (was #ffd700) */
```

**Visual Impact:** More cohesive green-tinted palette (ECG/medical aesthetic) while maintaining Matrix terminal vibe.

#### Header Enhancements

**Added:**
- Live BPM display: `❤️ -- BPM` (jobs executed per minute)
- Status indicator: `[HEALTHY]` / `[ALERT]` / `[IDLE]`
- Pulse animation on BPM number (1.2s ease-in-out loop)

**Layout:**
```
🦞 CARDIOCLAW    ❤️ 12 BPM [HEALTHY]    [HOURLY|CALENDAR|LIST]
```

#### Health Panel (Footer) Updates

**Before:**
```
✓ 7 active • ✗ 1 failing • ⏱ Next: Job in 12m • 💚 --%
```

**After:**
```
❤️ 7 active • 💔 1 failing • ⏱ Next: Job in 12m • 🦞 94% uptime
```

**Changes:**
- Hearts for active jobs (positive health indicator)
- Broken heart for failing jobs (medical urgency)
- Lobster for uptime metric (brand personality)
- Success rate calculated from all runs (not just placeholder)

#### Background Grid

**Added:** Subtle ECG-style grid overlay
- Grid color: `#1a3a2e` (very subtle green)
- 20px × 20px squares
- Medical chart paper aesthetic
- Low visual weight (doesn't distract from content)

#### Status Colors

**Updated:**
- Upcoming jobs: Matrix green → ECG cyan (`#00ffcc`)
- Error state: Brighter danger red (`#ff1744`)
- Disabled state: Green-gray instead of pure gray

#### BPM Calculation

**Logic:**
```javascript
// Count jobs that ran in last 60 seconds
const recentRuns = jobs.filter(j => 
  j.last_run_at && (now - j.last_run_at < 60000)
).length;
```

**Display:** Updates in header as `❤️ {count} BPM`

#### Success Rate Calculation

**Logic:**
```javascript
const successRate = totalRuns > 0 
  ? Math.round((successfulRuns / totalRuns) * 100) 
  : 0;
```

**Display:** Shows as `🦞 {rate}% uptime` in footer

### Phase 2 (Future)

**Deferred for later:**
- ECG waveform panel (full-width scrolling visualization)
- Lobster Index™ composite score
- Easter egg animations (click lobster logo)
- Achievement badges
- Trend graphs sidebar

**Rationale:** Phase 1 focuses on core health metrics and visual polish. Phase 2 adds advanced monitoring features.

### Files Modified

- `public/terminal.css` (+60 lines) - Color palette, header styles, grid background
- `public/index.html` (+10 lines) - Header structure, health panel icons
- `public/app.js` (+20 lines) - BPM calculation, success rate, header updates
- `docs/DESIGN-CHANGELOG.md` (new) - This file

### Design Goals Achieved

✅ Clear icon hierarchy (hearts = health, lobsters = brand)  
✅ Medical aesthetic (ECG grid, cardiogram colors)  
✅ Maintained Matrix terminal vibe (green, monospace, dark)  
✅ Live health metrics (BPM, uptime, status)  
✅ Personality without clutter (lobster in logo + uptime)

### Visual Comparison

**Before (v2.0):**
- Generic terminal UI
- Lobsters everywhere
- Pure Matrix green
- No live health indicators

**After (v2.1):**
- Medical terminal hybrid
- Hearts for health, lobsters for brand
- Green + red + cyan palette
- Live BPM + status in header
- ECG grid background

### Mobile Responsive

**Header layout on mobile:**
```
🦞 CARDIOCLAW
❤️ 12 BPM [HEALTHY]
[HOURLY] [CALENDAR] [LIST]
```

All new elements adapt to narrow screens (stacked layout).

---

**Next Steps (Phase 2):**
1. ECG waveform visualization panel
2. Lobster Index™ (composite health score)
3. Interactive easter eggs (click logo)
4. Achievement system (unlockable lobsters)
5. Trend graphs in sidebar

**Design Status:** Phase 1 complete ✅  
**Ready for:** User testing and feedback
