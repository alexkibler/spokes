# Paper Peloton – Developer Guide

> For experienced JS/TS developers with no prior Phaser or game dev experience.

---

## Table of Contents

1. [What This App Is](#1-what-this-app-is)
2. [Tech Stack at a Glance](#2-tech-stack-at-a-glance)
3. [Phaser 101 – What You Need to Know](#3-phaser-101--what-you-need-to-know)
4. [Project Structure](#4-project-structure)
5. [The Scene Lifecycle (Your New Request/Response Cycle)](#5-the-scene-lifecycle-your-new-requestresponse-cycle)
6. [Scene Flow & Data Passing](#6-scene-flow--data-passing)
7. [The Physics Loop (GameScene.update)](#7-the-physics-loop-gamesceneupdate)
8. [The Trainer Service Abstraction](#8-the-trainer-service-abstraction)
9. [Course Profiles & Elevation](#9-course-profiles--elevation)
10. [The Roguelike Map (MapScene)](#10-the-roguelike-map-mapscene)
11. [Roguelike State (RunStateManager)](#11-roguelike-state-runstatemanager)
12. [FIT File Export](#12-fit-file-export)
13. [Units & Display Conventions](#13-units--display-conventions)
14. [Dev Mode & Mock Mode](#14-dev-mode--mock-mode)
15. [Testing](#15-testing)
16. [Common Tasks & Where to Look](#16-common-tasks--where-to-look)
17. [Gotchas & Things That Will Bite You](#17-gotchas--things-that-will-bite-you)

---

## 1. What This App Is

Paper Peloton is a browser-based cycling simulator that:

- Connects to a real smart bike trainer over **Web Bluetooth** (FTMS protocol)
- Simulates road cycling physics (power → speed → grade resistance feedback loop)
- Presents a **roguelike progression map** of procedurally generated routes
- Records the ride as a binary **Garmin FIT file** for upload to Strava/Garmin/etc.

There are two play modes:

| Mode | What happens |
|------|-------------|
| **Quick Demo** | Straight to riding, fixed course, mock 200W trainer |
| **Start Run** | Roguelike map → choose edges → ride segments → collect gold → finish |

---

## 2. Tech Stack at a Glance

```
Phaser 3.88     — game engine (canvas/WebGL renderer + scene management)
TypeScript       — strict mode, ES2020
Vite             — dev server + bundler
Vitest           — unit tests
Web Bluetooth    — FTMS trainer + heart rate monitor
```

There is no React, no DOM manipulation beyond Phaser's own canvas, and no external physics engine. Everything visual is drawn with Phaser's built-in drawing primitives (Graphics, Text, TileSprite, etc.) onto a canvas element.

---

## 3. Phaser 101 – What You Need to Know

### Phaser is not a UI framework

Forget `<div>` and CSS. Phaser draws everything onto a `<canvas>`. Buttons are rectangles with click listeners. Text is rendered pixels. There is no DOM tree to inspect.

### Scenes are like pages/routes

Phaser has "Scenes" — think of them as pages in an SPA. Only one (or a few) are active at a time. You transition between them with:

```typescript
this.scene.start('SceneKey', dataObject);
```

The `dataObject` is how you pass data between scenes (like route params).

### The game loop

Phaser calls `update(time, delta)` on the active scene ~60 times per second. This is where all physics, animation, and state mutation happens. Think of it as `setInterval` at 60fps, but managed by the engine.

```typescript
// delta is milliseconds since last frame (~16.7ms at 60fps)
update(time: number, delta: number) {
  this.velocityMs += acceleration * (delta / 1000);
}
```

### Phaser coordinate system

- Origin `(0, 0)` is **top-left**
- Y increases **downward** (opposite of math/CSS expectations)
- Depths (z-ordering): higher depth = drawn on top

### Game objects

The main primitives you'll encounter in this codebase:

| Class | What it is |
|-------|-----------|
| `Phaser.GameObjects.Text` | Rendered text (not DOM) |
| `Phaser.GameObjects.Graphics` | Drawing shapes, lines, fills |
| `Phaser.GameObjects.TileSprite` | Repeating tiled texture (used for parallax layers) |
| `Phaser.GameObjects.Container` | Group of objects that move/rotate together |
| `Phaser.GameObjects.Rectangle` | Simple rectangle shape |

All of these are created with `this.add.*()`:

```typescript
const label = this.add.text(x, y, 'Hello', { fontSize: '24px' });
const box = this.add.graphics();
box.fillStyle(0xff0000, 1);
box.fillRect(10, 10, 100, 50);
```

### Events

Phaser input events use `on()`, similar to EventEmitter:

```typescript
this.input.on('pointerdown', (pointer) => { ... });
someGameObject.on('pointerdown', () => { ... });
```

---

## 4. Project Structure

```
src/
├── main.ts                  # Phaser game config + scene registration
├── scenes/
│   ├── MenuScene.ts         # Form UI, BT pairing, mode selection
│   ├── MapScene.ts          # Roguelike node map, shop
│   ├── GameScene.ts         # Riding: physics loop, HUD, parallax
│   └── VictoryScene.ts      # End screen, FIT download
├── services/
│   ├── ITrainerService.ts   # Interface (what scenes depend on)
│   ├── TrainerService.ts    # Real FTMS BLE implementation
│   ├── MockTrainerService.ts # Fake 200W emitter for offline use
│   └── HeartRateService.ts  # Standard BLE heart rate monitor
├── physics/
│   └── CyclistPhysics.ts    # Pure function: watts + velocity + config → acceleration
├── course/
│   └── CourseProfile.ts     # Segment data structure + query helpers + generator
├── roguelike/
│   └── RunState.ts          # Static singleton: all roguelike run state
├── fit/
│   └── FitWriter.ts         # Binary FIT encoder, no external deps
└── utils/
    └── UnitConversions.ts   # Metric ↔ imperial helpers
```

---

## 5. The Scene Lifecycle (Your New Request/Response Cycle)

Every Phaser scene has these lifecycle methods. You'll implement all of them:

```typescript
class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });  // register key
  }

  // Called once when scene starts — receive data from previous scene here
  init(data: { someValue: string }) {
    this.someValue = data.someValue;
  }

  // Called once after init — build all UI/objects here (like componentDidMount)
  create() {
    this.add.text(100, 100, this.someValue);
    this.scale.on('resize', this.onResize, this);
  }

  // Called every frame (~60fps) — run physics, animate, update displays
  update(time: number, delta: number) {
    this.doPhysics(delta / 1000);  // delta is ms, physics wants seconds
  }

  // Called when scene stops — clean up listeners, disconnect services
  shutdown() {
    this.scale.off('resize', this.onResize, this);
  }
}
```

**Key rule:** Never do UI construction in `update()`. Never do physics in `create()`.

---

## 6. Scene Flow & Data Passing

```
MenuScene
  │
  ├─ Quick Demo ──────────────────────────────► GameScene
  │                                               (DEFAULT_COURSE, MockTrainerService)
  │
  ├─ Start Run ──► MapScene ──► GameScene ──► VictoryScene
  │                (node selected) (edge ridden)
  │
  └─ Start Ride ─────────────────────────────► GameScene
                                                (generated CourseProfile)
```

### How data flows between scenes

Data is passed as a plain object to `scene.start()`:

```typescript
// In MenuScene:
this.scene.start('GameScene', {
  course: courseProfile,
  weightKg: 75,
  units: 'metric',
  trainer: trainerInstance,  // implements ITrainerService
  hrm: hrmInstance,          // or null
  isDevMode: false,
  isQuickDemo: true,
});

// In GameScene:
init(data: GameSceneData) {
  this.course = data.course;
  this.weightKg = data.weightKg;
  this.trainer = data.trainer ?? new MockTrainerService();
}
```

### Roguelike state is shared via singleton

For the map → ride → map cycle, data that needs to persist across scenes lives in `RunStateManager`:

```typescript
// MapScene writes:
RunStateManager.setActiveEdge(selectedEdge);
RunStateManager.setCurrentNode(targetNodeId);

// GameScene reads:
const run = RunStateManager.getRun();
const edge = run.activeEdge;
const course = edge.profile;

// GameScene writes back:
RunStateManager.completeActiveEdge();
RunStateManager.addGold(rewardAmount);
```

---

## 7. The Physics Loop (GameScene.update)

This is the core of the app. Every frame (~60fps):

```
1. Read latest power from trainer (via onData callback)
2. Get current grade from course profile at current distance
3. Get surface type → derive rolling resistance (Crr)
4. Call calculateAcceleration(power, velocity, { grade, crr, ... })
5. Integrate: velocity += acceleration * deltaSeconds
6. Clamp: velocity = max(0, velocity)
7. Update distance: distanceM += velocity * deltaSeconds
8. Scroll parallax layers by velocity
9. Update HUD displays
10. Send grade back to trainer via setSimulationParams()
11. Record to FIT file every second
12. Check if course is complete → transition to next scene
```

### The physics function

```typescript
// src/physics/CyclistPhysics.ts
calculateAcceleration(
  watts: number,
  velocityMs: number,
  config: PhysicsConfig  // { massKg, cdA, crr, rhoAir, grade }
): number  // m/s²
```

This is a pure function — no side effects, easy to test. It models:
- **Propulsion force:** `watts / velocity`
- **Air drag:** `0.5 × ρ × CdA × v²`
- **Rolling resistance:** `Crr × mass × g × cos(θ)`
- **Gravity component:** `mass × g × sin(θ)` (positive = uphill resistance)

### Grade smoothing

Raw grade from the course profile is not applied directly — it's smoothed with exponential interpolation to avoid jarring transitions:

```typescript
// Lerp toward target grade each frame
this.displayedGrade = lerp(this.displayedGrade, targetGrade, smoothingFactor);
```

---

## 8. The Trainer Service Abstraction

This is a clean dependency injection pattern you'll recognize from backend dev.

### The interface

```typescript
// src/services/ITrainerService.ts
interface ITrainerService {
  connect(): Promise<void>;
  disconnect(): void;
  onData(callback: (data: Partial<TrainerData>) => void): void;
  isConnected(): boolean;
  setSimulationParams?(grade: number, crr: number, cwa: number): Promise<void>;
}

interface TrainerData {
  instantaneousPower: number;   // watts
  instantaneousSpeed: number;   // km/h
  instantaneousCadence: number; // rpm
  timestamp: number;            // unix ms
}
```

### Two implementations

**`MockTrainerService`** — used offline, in demos, and in tests:
```typescript
const mock = new MockTrainerService({ power: 200, cadence: 90 });
mock.onData(frame => { /* frame arrives every 1000ms */ });
await mock.connect();
mock.setPower(350);  // update what gets emitted
```

**`TrainerService`** — real Bluetooth FTMS trainer:
- Calls `navigator.bluetooth.requestDevice()` (requires user gesture)
- Subscribes to GATT characteristic `0x2AD2` (Indoor Bike Data) for notifications
- Writes to `0x2AD9` (Control Point) to send grade/resistance commands

### The data flow

```
[Trainer hardware]
      │  BLE notification (0x2AD2)
      ▼
TrainerService.parseIndoorBikeData()
      │  TrainerData object
      ▼
GameScene onData callback
      │  stores latestPower, latestCadence
      ▼
GameScene.update() reads values each frame
      │  calculates new grade
      ▼
trainer.setSimulationParams(grade, crr, cwa)
      │  writes Op Code 0x11 to 0x2AD9
      ▼
[Trainer hardware adjusts resistance]
```

The game loop sends grade to the trainer every frame; the trainer adjusts its magnetic brake to create the appropriate resistance.

---

## 9. Course Profiles & Elevation

### The data structure

```typescript
interface CourseSegment {
  distanceM: number;   // length of this segment in meters
  grade: number;       // slope as decimal: 0.05 = 5% climb, -0.03 = 3% descent
  surface?: 'asphalt' | 'gravel' | 'dirt' | 'mud';
}

interface CourseProfile {
  segments: CourseSegment[];
  totalDistanceM: number;
}
```

A course is just an ordered array of segments. No GPS, no coordinates — purely distance + grade.

### Querying a course

```typescript
import { getGradeAtDistance, getSurfaceAtDistance } from '../course/CourseProfile';

// In the physics loop:
const grade = getGradeAtDistance(course, this.distanceM);     // → 0.08 (8%)
const surface = getSurfaceAtDistance(course, this.distanceM); // → 'gravel'
const crr = getCrrForSurface(surface);                        // → 0.012
```

These functions walk the segment array to find which segment contains the given distance. When distance exceeds `totalDistanceM`, the course loops (wraps around).

### Rolling resistance by surface

```
asphalt: 0.005  (fast, baseline)
gravel:  0.012  (2.4× slower)
dirt:    0.020  (4× slower)
mud:     0.040  (8× slower — very hard riding)
```

### Procedural generation

```typescript
generateCourseProfile(distanceKm: number, maxGrade: number, surface?: SurfaceType): CourseProfile
```

Algorithm:
1. Add flat bookend segments (easy start/finish)
2. Fill middle with random-length segments (100m–2,500m each)
3. Bias grade choices based on cumulative elevation (too high → add descents; too low → add climbs)
4. Fix any elevation imbalance at the end with a corrective segment

The elevation is "balanced" — what goes up must come down, approximately.

---

## 10. The Roguelike Map (MapScene)

### Structure

The map is a **DAG (directed acyclic graph)** drawn as a node-and-edge diagram:

```
Floor 0:  [start]  [start]  [start]
           /  \      |      /   \
Floor 1: [std] [std] [shop] [hard] [std]
           \    |    /        |    /
Floor 2:  [std] [std]       [std]
                  ...
Floor N:  [finish]
```

- **Nodes** are circles or squares colored by type
- **Edges** are lines connecting them, colored by surface type
- Player can click any reachable adjacent node to traverse that edge

### Node types

| Type | Visual | Effect |
|------|--------|--------|
| `start` | Green circle | Entry points |
| `standard` | Teal circle | Normal ride |
| `hard` | Dark red circle | Higher max grade |
| `shop` | Gold square | Buy items |
| `finish` | Black circle | End of run → VictoryScene |

### Traversal

- **Forward:** Click a node in `connectedTo` of current node
- **Backward:** Click a previously visited node (uses `invertCourseProfile()` to reverse grades)
- **Teleport:** Consume teleport scroll from inventory → pick any visited node

When you traverse an edge, MapScene calls:
```typescript
RunStateManager.setActiveEdge(edge);
RunStateManager.setCurrentNode(targetNodeId);
this.scene.start('GameScene', { ...rideData });
```

GameScene completes the ride, then returns to MapScene.

---

## 11. Roguelike State (RunStateManager)

A static singleton that holds all run state. Any scene can read/write it.

```typescript
// Starting a run
RunStateManager.startNewRun(runLength, totalDistanceKm, difficulty);

// Reading state
const run = RunStateManager.getRun();
run.gold;         // current gold balance
run.inventory;    // string[] of items
run.nodes;        // MapNode[]
run.edges;        // MapEdge[] with isCleared status
run.fitWriter;    // shared FitWriter instance (continues recording across segments)

// Writing state
RunStateManager.addGold(50);
RunStateManager.spendGold(100);
RunStateManager.addToInventory('tailwind');
RunStateManager.removeFromInventory('teleport');
RunStateManager.setCurrentNode('node-3-2');
RunStateManager.setActiveEdge(edge);
RunStateManager.completeActiveEdge();  // marks edge cleared, returns true if first clear
```

The `fitWriter` is shared across all segments of a run so the exported FIT file is one continuous activity.

---

## 12. FIT File Export

The `FitWriter` class encodes a Garmin-compatible binary `.fit` file from scratch — no external library.

```typescript
// Create at run start
const fitWriter = new FitWriter();

// Call every second during riding
fitWriter.recordData({
  timestamp: Date.now(),
  powerW: 250,
  cadenceRpm: 90,
  speedKmh: 32,
  distanceM: 1500,
  heartRateBpm: 145,  // optional
  altitudeM: 120,     // optional
});

// At the end
const bytes: Uint8Array = fitWriter.export();
// bytes is the complete binary FIT file
// download it with a Blob + anchor click
```

FIT is a binary format with a custom header, message definitions, and a CRC. The class handles all of this internally. You don't need to know the format.

---

## 13. Units & Display Conventions

**Golden rule:** All internal calculations use SI (metric) units. Convert only for display.

```
Velocity: m/s internally  → km/h or mph for display
Distance: meters          → km or miles for display
Mass:     kg              → stays kg or shows lb for display
```

```typescript
import { KM_TO_MI, KG_TO_LB } from '../utils/UnitConversions';

// Display speed
const displaySpeed = units === 'imperial'
  ? (velocityMs * 3.6 * KM_TO_MI).toFixed(1) + ' mph'
  : (velocityMs * 3.6).toFixed(1) + ' km/h';
```

The `units` preference is a `'imperial' | 'metric'` string threaded through scene data from MenuScene.

---

## 14. Dev Mode & Mock Mode

### Mock Mode (offline simulation)
- Available in all builds
- Uses `MockTrainerService` emitting ~200W, 90rpm, 30km/h
- Toggled from MenuScene with "Start Ride" or "Quick Demo" options (no real BT needed)

### Dev Mode (fast testing)
- Only available in `import.meta.env.DEV` builds
- Sets mock power to **100,000 W** so you fly through courses instantly
- Toggle button visible in MenuScene dev builds

### Demo Mode (Quick Demo flag)
- Uses `MockTrainerService` with **randomized power** (150–350W) and cadence (70–110rpm) that change per segment
- Simulates a realistic-looking ride without a real trainer

### How to check in code

```typescript
// In GameScene.create():
if (data.isDevMode) {
  (this.trainer as MockTrainerService).setPower(100_000);
}
if (data.isQuickDemo) {
  // randomize power per segment
}
```

The `false` on line 147 of `GameScene.ts` that was selected when you started this session is likely a debug flag or feature toggle — check what it's guarding.

---

## 15. Testing

All tests use **Vitest** (same API as Jest).

```bash
npm test                    # run all tests once
npm run test:watch          # watch mode
npx vitest run src/physics/__tests__/CyclistPhysics.test.ts  # single file
```

Test files live next to the code they test in `__tests__/` folders.

What's tested:
- `CyclistPhysics.test.ts` — physics math (pure functions, easy to test)
- `CourseProfile.test.ts` — elevation/grade queries
- `CourseGenerator.test.ts` — procedural generation properties
- `TrainerService.test.ts` — FTMS byte parsing
- `UnitConversions.test.ts` — conversion accuracy

Nothing about Phaser rendering is unit-tested (that's typical — visual output is hard to unit test).

---

## 16. Common Tasks & Where to Look

### Change how the course is generated
→ `src/course/CourseProfile.ts` → `generateCourseProfile()`

### Change physics constants (drag, weight, etc.)
→ `src/physics/CyclistPhysics.ts` → `DEFAULT_PHYSICS`

### Add a new HUD element
→ `src/scenes/GameScene.ts` → `create()` section, alongside existing HUD setup. Also update `onResize()` to reposition it.

### Add a new roguelike item
→ `src/roguelike/RunState.ts` (add to inventory type), `src/scenes/MapScene.ts` (shop UI), `src/scenes/GameScene.ts` (apply effect)

### Add a new node type to the map
→ `src/roguelike/RunState.ts` (add to `NodeType`), `src/scenes/MapScene.ts` (drawing + behavior)

### Change what gets written to the FIT file
→ `src/fit/FitWriter.ts` → `recordData()` method

### Add a new scene
1. Create `src/scenes/NewScene.ts` extending `Phaser.Scene`
2. Register it in `src/main.ts` in `config.scene`
3. Transition to it with `this.scene.start('NewScene', data)`

### Understand a Bluetooth FTMS command
→ `src/services/TrainerService.ts` — the `setSimulationParams()` method shows the exact byte layout for Op Code 0x11

---

## 17. Gotchas & Things That Will Bite You

### delta is in milliseconds, not seconds
```typescript
update(time: number, delta: number) {
  // delta ≈ 16.7 at 60fps — it's milliseconds
  this.velocity += accel * (delta / 1000);  // divide by 1000!
}
```

### Y axis is inverted
Drawing at `y: 0` is the **top** of the screen. `y: 540` is the bottom. This catches everyone coming from CSS.

### Phaser objects are destroyed when a scene stops
If you cache a reference to a Phaser game object and the scene restarts, it's gone. Re-create everything in `create()`.

### Web Bluetooth requires a user gesture
`navigator.bluetooth.requestDevice()` must be called from a click handler — not on page load, not in an async callback. The browser will throw otherwise.

### Web Bluetooth only works in Chromium
Chrome, Edge, Brave. Not Firefox, not Safari, not mobile (mostly). Don't waste time trying to debug BT issues in the wrong browser.

### Grade is a decimal, not a percentage
Throughout the codebase: `grade = 0.05` means 5%. Display it as `(grade * 100).toFixed(1) + '%'`.

### Phaser's `this` context in callbacks
Arrow functions inside scene methods preserve `this` correctly. But if you pass a method as a callback, bind it:

```typescript
// Works (arrow function):
this.scale.on('resize', () => this.onResize());

// Also works (Phaser's 3-arg form with context):
this.scale.on('resize', this.onResize, this);

// Breaks (loses 'this'):
this.scale.on('resize', this.onResize);
```

### The course "wraps" if you exceed totalDistanceM
`getGradeAtDistance()` uses modulo arithmetic. If you need to detect "end of course", compare `this.distanceM >= course.totalDistanceM` explicitly.

### RunStateManager is global state
It persists until `startNewRun()` is called again. If a player returns to MenuScene without completing a run, old state is still there. Check `getRun()` for null before reading.

### TypeScript is strict — read the tsconfig
`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are all enabled. You'll get compile errors for things you'd normally ignore. This is intentional.

---

## Quick Reference: Key Files

| What you want to change | File |
|------------------------|------|
| App startup, scene list | `src/main.ts` |
| Menu form, BT pairing | `src/scenes/MenuScene.ts` |
| Node map, shop | `src/scenes/MapScene.ts` |
| Physics loop, HUD, parallax | `src/scenes/GameScene.ts` |
| End screen | `src/scenes/VictoryScene.ts` |
| Real trainer BT | `src/services/TrainerService.ts` |
| Fake trainer | `src/services/MockTrainerService.ts` |
| Physics math | `src/physics/CyclistPhysics.ts` |
| Course generation, queries | `src/course/CourseProfile.ts` |
| Run state (roguelike) | `src/roguelike/RunState.ts` |
| FIT file encoding | `src/fit/FitWriter.ts` |
| Unit conversions | `src/utils/UnitConversions.ts` |
