# Paper Peloton

2D cycling simulator built with **Phaser 3**, **TypeScript**, and **Vite**.
Connects to FTMS-compatible smart trainers (e.g. Saris H3) over Web Bluetooth,
with a built-in Mock Mode for development without hardware.

---

## Requirements

- **Node.js** 18 or later
- A Chromium-based browser (Chrome, Edge, Brave) for Web Bluetooth support
  Firefox and Safari do not support Web Bluetooth

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

Opens at `http://localhost:3000`.  The app starts in **Mock Mode** by default — no trainer required.

---

## Mock Mode vs. real Bluetooth

| Mode | How to activate | What happens |
|------|----------------|--------------|
| **Mock Mode** | Default on launch, or click **MOCK MODE** button | Emits simulated power / speed / cadence from an in-memory timer |
| **Bluetooth** | Click **BT CONNECT** (or toggle Mock Mode off, then connect) | Opens the browser device picker; pair your FTMS trainer |

Toggling **MOCK MODE: ON/OFF** hot-swaps the data source without reloading the page.

---

## Running tests

```bash
npm test          # single run
npm run test:watch  # re-runs on file changes
```

Tests cover the FTMS `0x2AD2` Indoor Bike Data byte parser, including the
10-byte Saris H3 frame where **bytes 8–9 carry instantaneous power** (e.g. 250 W).

---

## Building for production

```bash
npm run build
```

Output is written to `dist/`.  Serve it with any static file host.

```bash
npm run preview   # local preview of the production build
```

---

## Project structure

```
paper-peloton/
├── index.html                      Entry HTML
├── src/
│   ├── main.ts                     Phaser game bootstrap
│   ├── scenes/
│   │   └── GameScene.ts            HUD: power display, speed, cadence, buttons
│   └── services/
│       ├── ITrainerService.ts      Shared interface (TrainerData + ITrainerService)
│       ├── TrainerService.ts       Real FTMS Bluetooth service + byte parser
│       ├── MockTrainerService.ts   In-memory stub for testing / offline dev
│       └── __tests__/
│           └── TrainerService.test.ts  Vitest unit tests
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## FTMS byte layout (0x2AD2 Indoor Bike Data)

The parser handles any valid FTMS frame by walking the flags field.
The Saris H3 emits a 10-byte frame with flags `0x0046`:

| Bytes | Field | Unit |
|-------|-------|------|
| 0–1 | Flags (`0x0046`) | — |
| 2–3 | Instantaneous Speed | 0.01 km/h per LSB |
| 4–5 | Average Speed | 0.01 km/h per LSB |
| 6–7 | Instantaneous Cadence | 0.5 rpm per LSB |
| **8–9** | **Instantaneous Power** | **1 W per LSB (sint16)** |

---

## Adding a new trainer data source

Implement `ITrainerService` from `src/services/ITrainerService.ts`:

```typescript
import type { ITrainerService, TrainerData } from './ITrainerService';

export class MyCustomService implements ITrainerService {
  async connect(): Promise<void> { /* ... */ }
  disconnect(): void { /* ... */ }
  onData(cb: (data: Partial<TrainerData>) => void): void { /* ... */ }
  isConnected(): boolean { /* ... */ }
}
```

Pass an instance to `GameScene` or swap it via the toggle button — no other code needs to change.
