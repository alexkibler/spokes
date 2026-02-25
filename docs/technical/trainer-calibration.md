# Saris H3 Trainer Calibration — Work in Progress

## The Problem

On flat ground at high speed (38+ km/h), the H3 provides only ~77% of the expected
resistance. A rider in 40:11 gear at ~90 rpm (~38 km/h) needs only ~200W when physics
says ~280W should be required. At low-to-mid speeds the trainer slightly over-resists;
at high speeds it under-resists.

**Root cause:** The H3 has a mechanical minimum-resistance floor. In simulation mode at
0% grade and high flywheel speed, it can't apply enough electromagnetic braking to match
theoretical aero drag. The grade-force simulation (+1%, +2%) is actually well-calibrated;
the problem is specifically flat/downhill aero resistance at high speeds.

## Data Collected (2026-02-23)

FIT file: `21963983033_ACTIVITY.fit` (40T chainring, 11-42T cassette, all 11 gears,
grades -2% through +2%)

Grade segments in that file:
- 0:00–3:49 → -2%
- 4:14–6:11 → -1%
- 6:21–8:05 →  0%
- 8:08–9:53 → +1%
- rest       → +2%

### Key findings

| Speed band  | Grade | Measured/Theory (median) |
|-------------|-------|--------------------------|
| ≥28 km/h   | +2%   | 1.15x (slight over)      |
| ≥28 km/h   | +1%   | 0.96x ✓ nearly perfect   |
| ≥28 km/h   |  0%   | **0.77x ← the problem**  |
| ≥28 km/h   | -1%   | 1.12x                    |
| <28 km/h   |  0%   | ~1.2–1.3x (slight over)  |

### Data gap — why calibration isn't complete yet

The 0% grade segment happened to produce data only at:
- 12–23 km/h (low-speed, trainer slightly over-resists — ok)
- 37–39 km/h (high-speed, trainer clearly under-resists — the problem)

**Missing:** 23–37 km/h at 0% grade. Without this range we can't tell whether the deficit
appears suddenly or grades in gradually, which determines whether a constant virtual
headwind fix will work or needs to be speed-dependent.

## Proposed Fix (pending calibration)

Add a virtual headwind in Op Code 0x11 (currently always sent as 0). The FTMS formula
is `F_aero = CWA × (v + v_wind)²`, so a constant headwind adds proportionally more
resistance at high speeds (where it's needed) and negligible resistance at low speeds
(where it isn't). Estimated value: **1.5–2.0 m/s**.

Code location: `src/services/TrainerService.ts:259` — `buf.setInt16(1, 0, true)` (wind speed field).
Call site: `src/scenes/GameScene.ts:572` — `setSimulationParams(grade, crr, cwa)`.

The fix will add a `trainerWindSpeedMs` parameter, exposed as a calibration slider in
MenuScene, defaulting to 0 for non-real-trainer sessions.

## Next Test Protocol

**Goal:** Clean 0% grade power-vs-speed curve across all gears.

**Setup:**
- Spokes game open, flat course, stay at 0% grade the whole time
- Garmin Edge recording via ANT+ from the H3

**Steps:**
1. Start in **40:11** (top gear), ride at ~80 rpm for **60 seconds**
2. Shift to **40:13**, hold 60s
3. Continue down through all 11 gears to **40:42**
4. Try to hold cadence roughly steady (~80–85 rpm) within each gear
5. Don't change grade — leave the game on a flat segment

This gives ~11 clean (speed, power) points at exactly 0% grade, 60s average each,
covering the full 10–42 km/h range including the missing 23–37 km/h gap.

**After the test:** paste the new FIT file path and grade-segment timestamps (there
should be none this time — entire ride is 0%).
