# Paper Peloton

**Paper Peloton** is a 2D cycling simulator and roguelike game built with **Phaser 3**, **TypeScript**, and **Vite**. It connects to smart trainers (like the Saris H3) via Web Bluetooth (FTMS protocol) to drive the gameplay using real-world power, speed, and cadence data.

## Project Overview

*   **Core Framework:** Phaser 3 (Game engine), TypeScript (Language), Vite (Build tool).
*   **Connectivity:** Web Bluetooth API for FTMS (Fitness Machine Service) integration.
*   **Gameplay:**
    *   **Roguelike Mode:** Traverse a procedurally generated map of nodes (rides, shops, events). Earn gold, buy upgrades, and reach the finish.
    *   **Quick Demo:** Instant access to a curated course for testing.
*   **Physics:** Custom cycling physics engine accounting for rider weight, road grade, rolling resistance (Crr), and air resistance (CdA).

## Getting Started

### Prerequisites
*   **Node.js** (v18+)
*   **Browser:** Chromium-based (Chrome, Edge, Brave) for Web Bluetooth support. (Firefox/Safari do not support it).

### Commands

| Action | Command | Description |
| :--- | :--- | :--- |
| **Install** | `npm install` | Install dependencies. |
| **Run Dev** | `npm run dev` | Start the local dev server at `http://localhost:3000`. |
| **Build** | `npm run build` | Compile for production to `dist/`. |
| **Test** | `npm test` | Run Vitest unit tests. |
| **Preview** | `npm run preview` | Serve the production build locally. |

## Architecture & Key Components

### 1. Scene Flow
The application uses Phaser Scenes to manage application states:
1.  **`MenuScene.ts`**: Entry point. Configuration of rider weight, distance, and difficulty. Bluetooth pairing.
2.  **`MapScene.ts`**: (Roguelike only) Displays the node map. Handles navigation and shop interactions.
3.  **`GameScene.ts`**: The main riding view. Renders the cyclist, scrolling background, HUD, and handles physics/input loop.
4.  **`VictoryScene.ts`**: End-of-run celebration screen.

### 2. Hardware Abstraction (`src/services/`)
The game is agnostic to the data source, using the `ITrainerService` interface:
*   **`ITrainerService.ts`**: Interface defining `connect()`, `disconnect()`, `onData()`, and `setSimulationParams()`.
*   **`TrainerService.ts`**: Implementation for real FTMS Bluetooth devices. Handles byte parsing.
*   **`MockTrainerService.ts`**: In-memory simulator for development. Emits fake power/speed/cadence.

### 3. Roguelike State (`src/roguelike/`)
*   **`RunState.ts`**: Singleton `RunStateManager` holds the global state of the current run (Inventory, Gold, Current Node, Map Graph).
*   **Map Generation:** `MapScene` procedurally generates a DAG (Directed Acyclic Graph) of nodes.

### 4. Course & Physics (`src/course/`, `src/physics/`)
*   **`CourseProfile.ts`**: Defines a course as a sequence of segments (distance, grade, surface type). Includes procedural generation logic.
*   **`CyclistPhysics.ts`**: Calculates acceleration and velocity based on power input and environmental factors.
*   **Surfaces:** Different surfaces (Asphalt, Gravel, Dirt, Mud) affect rolling resistance (Crr).

### 5. Data Recording (`src/fit/`)
*   **`FitWriter.ts`**: A custom, dependency-free binary encoder for `.fit` files. Records ride data (Power, Speed, Cadence, HR, Elevation) for export to Strava/Garmin.

## Development Features

### Dev Mode
A "DEV MODE" toggle exists in the `MenuScene` (visible only in development builds via `import.meta.env.DEV`).
*   **Effect:** Bypasses hardware requirements.
*   **Simulation:** Sets the `MockTrainerService` to **10000W** for rapid traversing of courses to test game flow and transitions.

### Mock Mode
Standard simulation mode available to users without hardware. Simulates a steady ~200W effort.

## Conventions

*   **Styling:** Visuals use a "paper-cutout" aesthetic.
*   **Units:** The codebase generally works in **Metric** (meters, m/s, kg) internally. UI handles conversion to Imperial if selected.
*   **State Management:** `RunStateManager` acts as a global store for the session. Scene data passing is done via `scene.start('Key', data)`.
