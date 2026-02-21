# Challenge Scoring Implementation

## Status

Phase 1 complete. `avg_power_above_ftp_pct` is fully wired end-to-end.

---

## Data Flow

```
MapScene
  → openEliteChallenge(node)        ← dialog shown; player accepts/declines
  → scene.start('GameScene', {
      ...,
      ftpW: this.ftpW,
      activeChallenge: challenge,   ← EliteChallenge | null
    })

GameScene
  → init(): stores ftpW + activeChallenge
  → ride runs, recordedPowerSum / fitWriter.recordCount accumulates avg power
  → showRideEndOverlay(completed=true)
      → completeActiveEdge() → isFirstClear
      → evaluateChallenge(activeChallenge, { avgPowerW, ftpW })
      → if passed: grantChallengeReward() + show "★ CHALLENGE COMPLETE" banner
      → if failed: show "✗ CHALLENGE FAILED" text
```

Non-elite edges pass `activeChallenge: null`; evaluation block is skipped.
Challenge reward is only granted on `isFirstClear` (first traversal of the edge).

---

## Files

| File | Role |
|---|---|
| `src/roguelike/EliteChallenge.ts` | `ChallengeMetrics`, `evaluateChallenge()`, `grantChallengeReward()` |
| `src/scenes/MapScene.ts` | Passes `ftpW` + `activeChallenge` in both `scene.start('GameScene', …)` calls |
| `src/scenes/GameScene.ts` | Accepts fields in `InitData`/`init()`; evaluates + displays result in `showRideEndOverlay()` |

---

## Condition Support

| Condition | Status | Notes |
|---|---|---|
| `avg_power_above_ftp_pct` | ✅ Phase 1 | Uses `recordedPowerSum / fitWriter.recordCount` |
| `peak_power_above_ftp_pct` | ⬜ Phase 2 | Needs per-tick peak tracker |
| `complete_no_stop` | ⬜ Phase 2 | Needs zero-velocity flag during ride |
| `time_under_seconds` | ⬜ Phase 2 | Uses existing `elapsedS` at ride end |

---

## Phase 2 Notes

**`peak_power_above_ftp_pct`**: Add `private peakPowerW = 0` to GameScene; update it each physics tick with `this.peakPowerW = Math.max(this.peakPowerW, this.rawPower)`. Reset in `init()`. Pass as `peakPowerW` in `ChallengeMetrics`.

**`complete_no_stop`**: Add `private stoppedDuringRide = false`; set to `true` whenever `this.smoothVelocityMs < 0.1` after ride start. Pass as `stoppedAtAnyPoint` in `ChallengeMetrics`.

**`time_under_seconds`**: `elapsedS` is already computed in `showRideEndOverlay`. Pass it as `elapsedSeconds` in `ChallengeMetrics`.
