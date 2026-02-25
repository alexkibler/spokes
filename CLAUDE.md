# CLAUDE.md - Spokes (formerly Paper Peloton)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server at http://localhost:3200 (auto-opens browser)
npm run build      # tsc + vite build → dist/
npm run preview    # Serve production build locally
npm test           # Vitest single run
npm run test:watch # Vitest in watch mode
```

Run a single test file:
```bash
npx vitest run src/services/__tests__/TrainerService.test.ts
```

**Browser requirement:** Web Bluetooth only works in Chromium-based browsers (Chrome, Edge, Brave). Firefox/Safari are unsupported.

## Architecture

### Scene Flow

Phaser scenes manage app state. Scenes are registered in `src/main.ts` and transition via `scene.start('Key', data)`:

1. **`MenuScene`** – Entry point. Collects rider weight, run distance, difficulty, units. Handles BT pairing. Launches either `MapScene` (roguelike) or `GameScene` (quick demo).
2. **`MapScene`** – Procedurally generates a DAG of `MapNode`s across floors. Player navigates by clicking reachable nodes. Shop nodes allow item purchases. Transitions to `GameScene` with the selected edge's `CourseProfile`.
3. **`GameScene`** – Main riding view. Drives physics loop, parallax background, HUD, elevation graph, and sends grade back to trainer via FTMS 0x2AD9.
4. **`VictoryScene`** – End-of-run screen. Offers `.fit` file download via `FitWriter`.

### Hardware Abstraction (`src/services/`)

All scenes interact with the trainer only through `ITrainerService`. Swapping mock vs. real is transparent to game logic:

- `ITrainerService.ts` – Interface: `connect()`, `disconnect()`, `onData(cb)`, `isConnected()`, `setSimulationParams(grade, crr)`
- `TrainerService.ts` – Real FTMS Bluetooth; parses `0x2AD2` Indoor Bike Data frames by walking the flags field
- `MockTrainerService.ts` – In-memory timer emitting fake power/speed/cadence (~200 W)
- `HeartRateService.ts` – Separate BT GATT service for heart rate monitors

### Roguelike State (`src/roguelike/RunState.ts`)

`RunStateManager` is a static singleton holding the entire run's state (`RunData`): gold, inventory, current node, the full node/edge graph, and a `FitWriter` instance. Scenes read/mutate it directly via static methods (`getRun()`, `setCurrentNode()`, `addGold()`, etc.).

### Physics & Course (`src/physics/`, `src/course/`)

- `CyclistPhysics.ts` – `calculateAcceleration(watts, velocityMs, grade, config)` uses rider weight, Crr, CdA, and grade to compute Δv per tick. Works in SI units (m/s, kg).
- `CourseProfile.ts` – A course is an array of `Segment` objects (distanceM, grade, surface). `getGradeAtDistance()` and `getSurfaceAtDistance()` are called each physics tick. `generateCourseProfile()` builds procedural courses. Surface types (`asphalt | gravel | dirt | mud`) determine Crr.

### FIT Recording (`src/fit/FitWriter.ts`)

Dependency-free binary encoder for Garmin `.fit` files. Records power, speed, cadence, HR, and elevation each second. `VictoryScene` calls `fitWriter.finish()` and triggers a browser download.

## Conventions

- **Units:** Internal calculations use metric (m/s, meters, kg). `UnitConversions.ts` handles display conversion. Unit preference (`'imperial' | 'metric'`) is threaded through scenes as a `Units` type from `MenuScene.ts`.
- **Dev Mode:** Visible only in `import.meta.env.DEV` builds. Sets `MockTrainerService` to 10,000 W to speed through courses. Toggle in `MenuScene`.
- **Mock Mode:** Standard offline simulation at ~200 W. Available in all builds.
- **TypeScript strictness:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are all enabled.
- **Internationalization (i18n):** Every user-visible string must go through the i18n system. Never hardcode display text — use `i18n.t('key')` in code and add the corresponding key/value to `src/i18n/locales/en.ts` (and any other locale files). When adding or changing any string that will be shown to the user, check that the translation key exists and is accurate.
- **HUD buttons in scrollable scenes:** Never place interactive (`setInteractive`) game objects inside a `Container` that uses `setScrollFactor(0)` in a scene with a scrollable camera (e.g. MapScene). Phaser's input system calculates hit areas in world space; objects inside a Container are not correctly fixed to screen space when the camera scrolls, making the button only clickable at the camera's initial position. **Fix:** add each interactive HUD element directly to the scene (not to any Container) and call `setScrollFactor(0)` on the element itself.
