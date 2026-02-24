# Spokes – Developer Guide

> For experienced JS/TS developers with no prior Phaser or game dev experience.

---

## Table of Contents

1. [What This App Is](#1-what-this-app-is)
2. [Tech Stack at a Glance](#2-tech-stack-at-a-glance)
3. [Phaser 101 – What You Need to Know](#3-phaser-101--what-you-need-to-know)
4. [Core Architecture](#4-core-architecture)
5. [Dependency Injection & State Management](#5-dependency-injection--state-management)
6. [Project Structure](#6-project-structure)
7. [The Scene Lifecycle (Your New Request/Response Cycle)](#7-the-scene-lifecycle-your-new-requestresponse-cycle)
8. [Scene Flow & Data Passing](#8-scene-flow--data-passing)
9. [The Physics Loop (GameScene.update)](#9-the-physics-loop-gamesceneupdate)
10. [The Trainer Service Abstraction](#10-the-trainer-service-abstraction)
11. [Mobile Remote Control](#11-mobile-remote-control)
12. [Course Profiles & Elevation](#12-course-profiles--elevation)
13. [The Roguelike Map (MapScene)](#13-the-roguelike-map-mapscene)
14. [FIT File Export](#14-fit-file-export)
15. [Units & Display Conventions](#15-units--display-conventions)
16. [Testing](#16-testing)
17. [Common Tasks & Where to Look](#17-common-tasks--where-to-look)
18. [Quick Reference: Extending the Game](#18-quick-reference-extending-the-game)

---

## 1. What This App Is

Spokes is a browser-based cycling simulator that:

- Connects to a real smart bike trainer over **Web Bluetooth** (FTMS protocol)
- Simulates road cycling physics (power → speed → grade resistance feedback loop)
- Presents a **roguelike progression map** of procedurally generated routes
- Records the ride as a binary **Garmin FIT file** for upload to Strava/Garmin/etc.

There are two play modes:

| Mode | What happens |
|------|-------------|
| **Quick Demo** | Straight to riding, fixed course, mock 200W trainer |
| **Start Run** | Roguelike map → choose edges → ride edges → collect gold → finish |

---

## 2. Tech Stack at a Glance

```
Phaser 3.88     — game engine (canvas/WebGL renderer + scene management)
TypeScript       — strict mode, ES2020
Vite             — dev server + bundler
Vitest           — unit tests
Web Bluetooth    — FTMS trainer + heart rate monitor
Node.js + Socket.io — Backend server for mobile remote control
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

---

## 4. Core Architecture

We have refactored the codebase to decouple logic from presentation.

### Controllers
`GameScene.ts` and `MapScene.ts` act as **Controllers**. They handle:
- Input interpretation
- Orchestrating game loop updates
- Delegating rendering to sub-modules
- Managing scene transitions

### Visuals
Rendering logic is moved out of scenes into dedicated classes in `src/scenes/visuals/` (e.g., `MapRenderer`, `CyclistRenderer`). These classes receive a container and data, and purely handle drawing.

### UI Overlays
UI complexity is managed by `BaseOverlay` and its subclasses in `src/scenes/ui/`. These encapsulate specific UI flows (Shop, Inventory, Pause) and block input to the underlying game while active.

---

## 5. Dependency Injection & State Management

Global static state (formerly `RunStateManager`) has been replaced by `RunManager`, an instantiable class extending `Phaser.Events.EventEmitter`.

### RunManager
- Holds all roguelike state (gold, inventory, graph traversal).
- Decouples persistence: it emits a `'save'` event rather than calling storage services directly.
- Must be passed to any component that needs access to run state.

### Injection Pattern
`RunManager` is instantiated in `MenuScene` (or `main.ts`) and passed down:

1. **Via Phaser Registry**: Shared across scenes using `this.registry.set('runManager', manager)`.
2. **Via Constructor Injection**: Passed into UI Overlays and Helper classes.

```typescript
// In MapScene.ts
const overlay = new ShopOverlay(this, scrollY, this.runManager, ...);
```

---

## 6. Project Structure

```
src/
├── main.ts                  # Phaser game config + scene registration
├── remote/                  # Mobile remote client (remote.html logic)
│   └── main.ts              # Socket.io client + Remote UI
├── scenes/
│   ├── MenuScene.ts         # Form UI, BT pairing, mode selection
│   ├── MapScene.ts          # Roguelike node map (Controller)
│   ├── GameScene.ts         # Riding controller; physics loop
│   ├── visuals/             # Rendering logic (MapRenderer, CyclistRenderer)
│   └── ui/                  # UI Overlays (BaseOverlay, ShopOverlay, etc.)
├── services/
│   ├── ITrainerService.ts   # Interface (what scenes depend on)
│   ├── TrainerService.ts    # Real FTMS BLE implementation
│   └── MockTrainerService.ts # Fake 200W emitter for offline use
├── physics/
│   └── CyclistPhysics.ts    # Pure function: watts + velocity + config → acceleration
├── course/
│   └── CourseProfile.ts     # Segment data structure + query helpers + generator
├── roguelike/
│   └── RunManager.ts        # Roguelike state manager (Gold, Nodes, Modifiers)
├── fit/
│   └── FitWriter.ts         # Binary FIT encoder, no external deps
└── utils/
    └── UnitConversions.ts   # Metric ↔ imperial helpers
server.js                    # Node.js backend for socket.io + serving dist
```

---

## 7. The Scene Lifecycle (Your New Request/Response Cycle)

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

## 8. Scene Flow & Data Passing

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

---

## 9. The Physics Loop (GameScene.update)

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

---

## 10. The Trainer Service Abstraction

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

---

## 11. Mobile Remote Control

The game supports a "Jackbox-style" mobile controller.

### Architecture
- **Backend (`server.js`)**: A Node.js Express + Socket.io server. Handles room creation (`HOST_CREATE_ROOM`) and input relaying.
- **Frontend Game (`RemoteService.ts`)**: Connects as HOST. Displays a 4-letter room code.
- **Mobile Web (`remote.html`)**: Connects as CLIENT. Sends D-Pad inputs and Item triggers.

### Running in Development
Because the remote feature requires a backend server, you must run two processes:

1. **Frontend (Vite):** `npm run dev` (runs on port 3200)
2. **Backend (Server):** `npm run server` (runs on port 3000)

Access the game at `http://localhost:3200`.
Access the remote at `http://localhost:3000/remote.html`.

Vite proxies `/socket.io` requests to port 3000, so the game client can connect seamlessly during development.

---

## 12. Course Profiles & Elevation

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

---

## 13. The Roguelike Map (MapScene)

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

---

## 14. FIT File Export

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

---

## 15. Units & Display Conventions

**Golden rule:** All internal calculations use SI (metric) units. Convert only for display.

```
Velocity: m/s internally  → km/h or mph for display
Distance: meters          → km or miles for display
Mass:     kg              → stays kg or shows lb for display
```

---

## 16. Testing

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

---

## 17. Common Tasks & Where to Look

### Change how the course is generated
→ `src/course/CourseProfile.ts` → `generateCourseProfile()`

### Change physics constants (drag, weight, etc.)
→ `src/physics/CyclistPhysics.ts` → `DEFAULT_PHYSICS`

### Add a new HUD element
→ `src/scenes/GameScene.ts` → `create()` section, alongside existing HUD setup. Also update `onResize()` to reposition it.

### Change what gets written to the FIT file
→ `src/fit/FitWriter.ts` → `recordData()` method

### Add a new scene
1. Create `src/scenes/NewScene.ts` extending `Phaser.Scene`
2. Register it in `src/main.ts` in `config.scene`
3. Transition to it with `this.scene.start('NewScene', data)`

### Understand a Bluetooth FTMS command
→ `src/services/TrainerService.ts` — the `setSimulationParams()` method shows the exact byte layout for Op Code 0x11

---

## 18. Quick Reference: Extending the Game

### Adding a New Item
1. Open `src/roguelike/ItemRegistry.ts`.
2. Add your item definition to `ITEM_REGISTRY`.
   ```typescript
   my_new_item: {
     id: 'my_new_item',
     label: 'Super Drink',
     description: 'Doubles power for 10s.',
     price: 150,
     slot: undefined, // or 'helmet', etc.
   }
   ```
3. Implement effect logic in `RunManager` or `GameScene` if needed.

### Adding a New Elite Challenge
1. Open `src/roguelike/EliteChallenge.ts`.
2. Add a new object to the `ELITE_CHALLENGES` array.
   ```typescript
   {
     id: 'new_challenge',
     title: 'Leg Burner',
     condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.5 },
     reward: { type: 'gold', goldAmount: 100, description: 'earn 100 gold' }
   }
   ```
3. Update `evaluateChallenge()` if a new condition type is needed.

### Adding a New Surface Type
1. Open `src/course/CourseProfile.ts`.
2. Add the type to `SurfaceType` union.
3. Update `CRR_BY_SURFACE` with the rolling resistance coefficient.
4. Update `CourseGenerator.ts` if you want it to appear in procedural maps.
