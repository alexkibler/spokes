# Spokes

2D roguelike cycling simulator built with **Phaser 3**, **TypeScript**, and **Vite**.
Connects to FTMS-compatible smart trainers over Web Bluetooth, with a built-in Mock Mode for development without hardware.

---

## Requirements

- **Node.js** 18 or later
- A Chromium-based browser (Chrome, Edge, Brave) — Web Bluetooth is not supported in Firefox or Safari.

---

## Installation

```bash
npm install
```

---

## Running the app

```bash
npm run dev
```

Opens at `http://localhost:3200`. The app starts in **Mock Mode** by default — no trainer required.

---

## Commands

```bash
npm run dev          # Dev server at http://localhost:3200 (auto-opens browser)
npm run build        # tsc + vite build → dist/
npm run preview      # Serve production build locally
npm test             # Vitest single run
npm run test:watch   # Vitest in watch mode
```

Run a single test file:

```bash
npx vitest run src/services/__tests__/TrainerService.test.ts
```

One-liner to deploy new build:
```
docker pull ghcr.io/alexkibler/spokes:main && docker rm -f spokes && docker run -d -p 6969:80 --name spokes ghcr.io/alexkibler/spokes:main
```
---

## Modes

| Mode | How to activate | What happens |
|------|----------------|--------------|
| **Mock Mode** | Default on launch | Emits simulated power / speed / cadence (~200 W) from an in-memory timer |
| **Bluetooth** | Click **BT CONNECT** in the menu | Opens the browser device picker; pair your FTMS trainer |

---

## Scene flow

```
MenuScene → MapScene → GameScene → VictoryScene
                ↑___________↓  (back to map after each edge)
```

1. **MenuScene** — Collects rider weight, run distance, difficulty, and units. Handles Bluetooth pairing.
2. **MapScene** — Procedurally generates a DAG of nodes across floors. Player navigates by clicking reachable nodes. Shop nodes allow item purchases. Elite nodes present a challenge dialog before the ride begins.
3. **GameScene** — Main riding view. Drives the physics loop, parallax background, HUD, elevation graph, and sends grade to the trainer via FTMS `0x2AD9`. Evaluates any active elite challenge at ride completion.
4. **VictoryScene** — End-of-run screen. Offers a `.fit` file download.

---

## Game Mechanics

### The Roguelike Map

Each run generates a **directed acyclic graph (DAG)** of nodes across a configurable number of floors (run length). 3–4 paths branch from the start node and reconnect at a single finish node. The player navigates by clicking any node connected to their current position.

**Node types:**

| Icon | Type | What happens |
|------|------|-------------|
| `S` | **Start** | Where the run begins |
| `·` | **Standard** | A regular ride segment; rewards on first clear |
| `!` | **Hard** | A steeper ride segment with tougher grades |
| `$` | **Shop** | Open the Trail Shop; spend gold on items |
| `?` | **Event** | A gamble: attempt it for a chance at an equipment item, or leave |
| `★` | **Elite** | A special challenge ride with a specific performance condition |
| `F` | **Finish** | The boss encounter; a 5-mile ride against a peloton of ghost racers |

The **edge** between two nodes carries a procedurally generated `CourseProfile`. Boss edges are always 5 miles; standard edges are 1–2 km. Node type weights shift as the run progresses: elite nodes become more likely on later floors, hard nodes replace standard nodes as the map deepens.

---

### Riding & Physics

The game simulates road cycling using real physics equations. Each game tick:

1. Power from the trainer (or mock service) is read in watts.
2. `calculateAcceleration()` computes net force: **propulsion minus aerodynamic drag, rolling resistance, and gravitational grade force**.
3. Velocity updates via `v += a × dt`, clamped to zero.
4. Distance accumulates each tick.
5. The current grade is sent back to the trainer via FTMS (`0x2AD9`) for resistance feedback.

**Physics formula:**

```
P = (½ρCdA·v² + Crr·m·g·cosθ + m·g·sinθ) × v
```

Parameters at baseline: 83 kg system mass (75 kg rider + 8 kg bike), CdA 0.325, Crr 0.005, sea-level air density.

**Surface types** affect rolling resistance (Crr):

| Surface | Crr | Relative resistance |
|---------|-----|---------------------|
| Asphalt | 0.005 | 1× (baseline) |
| Gravel | 0.012 | ~2.4× |
| Dirt | 0.020 | ~4× |
| Mud | 0.040 | ~8× |

---

### Run Modifiers

Every item, reward, and upgrade the player picks up changes one or more **run modifiers** that are applied multiplicatively or additively every physics tick:

| Modifier | Stacking | Effect |
|----------|----------|--------|
| `powerMult` | Multiplicative | Scales raw watt output |
| `dragReduction` | Additive (cap 0.99) | Reduces effective CdA |
| `weightMult` | Multiplicative (floor 0.01) | Scales system mass |
| `crrMult` | Multiplicative (floor 0.01) | Scales rolling resistance |

The **stats bar** at the top of the MapScene shows chips for any non-baseline modifier; hovering a chip shows a per-source breakdown of everything stacking into that value.

---

### Rewards (Post-Ride)

After completing any edge for the **first time** in roguelike mode, a **Hades-style 3-card reward screen** appears. The player picks one of three offers drawn from a weighted pool:

| Rarity | Weight | Examples |
|--------|--------|---------|
| Common (60%) | · | +4% power, +2% aero, −3% weight, 20 gold, Teleport Scroll |
| Uncommon (30%) | · | +7% power, +3% aero, −6% weight, 40 gold, Aero Helmet |
| Rare (10%) | · | +12% power, Carbon Frame, Anti-Grav Pedals, Tailwind, 75 gold |

If the player holds a **Reroll Voucher**, a reroll button appears; using it consumes one voucher and draws a new set of three.

Re-riding a cleared edge grants no reward.

---

### Equipment

Equipment items occupy a named **slot** (helmet, frame, cranks, pedals, tires). Only one item can be in each slot at a time — equipping a second item into an occupied slot automatically unequips the first, reversing its modifier.

| Item | Slot | Effect |
|------|------|--------|
| Aero Helmet | Helmet | −3% drag |
| Carbon Frame | Frame | −12% weight, −3% drag |
| Solid Gold Crank | Cranks | ×1.25 power |
| Anti-Grav Pedals | Pedals | −8% weight |
| Dirt Tires | Tires | −35% rolling resistance |

Equipment is managed via the **Equipment panel** (accessible from the pause screen or MapScene HUD).

---

### Gold & the Shop

Gold is the run's currency. It is earned by completing elite challenges and through rewards. Shop nodes open the **Trail Shop**, where gold buys consumables and equipment:

| Item | Base price | Notes |
|------|-----------|-------|
| Tailwind | 100g | One per run; toggles 2× power during a ride |
| Teleport Scroll | 10g | Warp to any previously visited node |
| Reroll Voucher | 50g | Reroll reward card choices; stackable |
| Aero Helmet | 60g | Equipment; stacks with reward copies |
| Solid Gold Crank | 120g | Equipment; buying duplicates stacks power |
| Anti-Grav Pedals | 90g | Equipment |
| Dirt Tires | 70g | Equipment |
| Carbon Frame | 150g | Equipment |

Repeated purchases of the same equipment item scale in price with quantity owned.

---

### Elite Challenges

Elite nodes present a performance condition before the ride starts. Meet the condition to earn the bonus reward; fail it and you complete the ride normally but receive nothing extra.

| Challenge | Condition | Reward |
|-----------|-----------|--------|
| Threshold Push | Average power ≥ 110% FTP | 60 gold |
| Sprint Finish | Peak power ≥ 150% FTP at any point | Tailwind item |
| Clean Ascent | Never come to a full stop | 40 gold |
| Time Trial Effort | Finish in under 3 minutes | 80 gold |
| Red Zone Ramp | Average power ≥ 120% FTP | 100 gold |

Each challenge has a **custom course** designed to reward the target behavior (e.g., a sustained climb for Threshold Push; a short flat with a steep sprint kick for Sprint Finish).

---

### Event Nodes

Event nodes present a **gamble**: the game offers an equipment item and shows a success percentage based on rarity (common items succeed more often than rare ones). The player can attempt it or leave. Success adds the item to inventory; failure gives nothing. Later floors offer rarer items.

---

### Boss Encounter

The finish node triggers a 5-mile race against **LE FANTÔME** — a peloton of 10 ghost racers whose power ranges from 1.75× to 2.25× the player's FTP. Each ghost is simulated independently using the same physics engine as the player (constant power, no run modifiers). Ghost positions are shown relative to the player:

- Ghost **behind** the player: player is winning that head-to-head.
- Ghost **ahead** of the player: that ghost has beaten you.

A race gap panel in the top-right corner shows the nearest ghost's name and distance gap in metres.

---

### FIT File Export

Every ride is recorded to a binary **Garmin FIT file** using `FitWriter`, capturing power, speed, cadence, heart rate, and elevation at 1-second intervals. At VictoryScene, the file can be downloaded and uploaded to Strava, Garmin Connect, or similar platforms. FIT export is only offered for runs involving a real Bluetooth trainer (not mock simulation).

---

## Project structure

```
spokes/
├── index.html
├── src/
│   ├── main.ts                          Phaser game bootstrap + scene registration
│   ├── scenes/
│   │   ├── MenuScene.ts                 Entry point; weight, distance, difficulty, BT pairing
│   │   ├── MapScene.ts                  Roguelike map; node/edge DAG generation and navigation
│   │   ├── GameScene.ts                 Main ride; physics loop, HUD, elevation graph
│   │   └── VictoryScene.ts             End screen; .fit file download
│   ├── services/
│   │   ├── ITrainerService.ts           Shared interface (connect, disconnect, onData, setSimulationParams)
│   │   ├── TrainerService.ts            Real FTMS Bluetooth; parses 0x2AD2 Indoor Bike Data frames
│   │   ├── MockTrainerService.ts        In-memory stub for offline dev
│   │   └── HeartRateService.ts         Separate BT GATT service for heart rate monitors
│   ├── roguelike/
│   │   ├── RunManager.ts                RunManager state; gold, inventory, node/edge graph
│   │   └── EliteChallenge.ts            Challenge types, pool, evaluate/grant helpers
│   ├── course/
│   │   └── CourseProfile.ts             Segment-based course definition; procedural generator
│   ├── physics/
│   │   └── CyclistPhysics.ts            calculateAcceleration(); rider weight, Crr, CdA, grade
│   ├── fit/
│   │   └── FitWriter.ts                 Dependency-free binary encoder for Garmin .fit files
│   └── utils/
│       └── UnitConversions.ts           Metric ↔ imperial display conversion
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Glossary

| Term | Meaning |
|------|---------|
| **Run** | A full roguelike playthrough, from start to finish node |
| **Floor** | A layer/depth in the map DAG; nodes are grouped by floor number |
| **Node** | A stop on the map (`start`, `standard`, `hard`, `shop`, `event`, `elite`, `finish`) |
| **Edge** | The rideable connection between two nodes; carries a `CourseProfile` |
| **Course / CourseProfile** | The actual ride on an edge — an ordered list of segments with grade, distance, and surface |
| **Segment** | One continuous stretch within a course with a fixed grade and surface type |
| **Surface** | Road type for a segment: `asphalt`, `gravel`, `dirt`, or `mud` (affects rolling resistance) |
| **Grade** | Slope of a segment as a decimal (0.05 = 5% climb, −0.03 = 3% descent) |
| **FTP** | Functional Threshold Power — the rider's sustainable 1-hour power in watts; set in `MenuScene` |
| **Gold** | In-run currency, earned by clearing edges and completing elite challenges |
| **Inventory** | Items the player has purchased at shop nodes |
| **Active edge** | The edge currently being ridden (stored in `RunState`) |
| **Cleared** | An edge that has been successfully traversed at least once (`isCleared`) |
| **Elite challenge** | An optional performance condition attached to an elite node; passing it grants a bonus reward |

---

## Hardware abstraction

All scenes interact with the trainer only through `ITrainerService`. Swapping mock vs. real is transparent to game logic:

```typescript
interface ITrainerService {
  connect(): Promise<void>;
  disconnect(): void;
  onData(cb: (data: Partial<TrainerData>) => void): void;
  isConnected(): boolean;
  setSimulationParams(grade: number, crr: number): void;
}
```

To add a custom data source, implement this interface and pass it to `GameScene`.

---

## FTMS byte layout (0x2AD2 Indoor Bike Data)

The parser handles any valid FTMS frame by walking the flags field. The Saris H3 emits a 10-byte frame with flags `0x0046`:

| Bytes | Field | Unit |
|-------|-------|------|
| 0–1 | Flags (`0x0046`) | — |
| 2–3 | Instantaneous Speed | 0.01 km/h per LSB |
| 4–5 | Average Speed | 0.01 km/h per LSB |
| 6–7 | Instantaneous Cadence | 0.5 rpm per LSB |
| **8–9** | **Instantaneous Power** | **1 W per LSB (sint16)** |

---

## FIT recording

`FitWriter` is a dependency-free binary encoder for Garmin `.fit` files. It records power, speed, cadence, HR, and elevation each second. `VictoryScene` calls `fitWriter.finish()` and triggers a browser download.

---

## Units

Internal calculations use metric (m/s, metres, kg). `UnitConversions.ts` handles display conversion. Unit preference (`'imperial' | 'metric'`) is collected in `MenuScene` and threaded through all scenes.
