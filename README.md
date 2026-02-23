# Paper Peloton

2D roguelike cycling simulator built with **Phaser 3**, **TypeScript**, and **Vite**.
Connects to FTMS-compatible smart trainers over Web Bluetooth, with a built-in Mock Mode for development without hardware.

---

## Requirements

- **Node.js** 18 or later
- A Chromium-based browser (Chrome, Edge, Brave) — Web Bluetooth is not supported in Firefox or Safari

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
docker pull ghcr.io/alexkibler/paper-peloton:main && docker rm -f paper-peloton && docker run -d -p 6969:3000 --name paper-peloton ghcr.io/alexkibler/paper-peloton:main
```
---

## Modes

| Mode | How to activate | What happens |
|------|----------------|--------------|
| **Mock Mode** | Default on launch | Emits simulated power / speed / cadence (~200 W) from an in-memory timer |
| **Dev Mode** | `import.meta.env.DEV` builds only | Sets mock output to 10,000 W to speed through courses |
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

## Project structure

```
paper-peloton/
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
│   │   ├── RunState.ts                  RunStateManager singleton; gold, inventory, node/edge graph
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
