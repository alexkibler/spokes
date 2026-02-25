Here is the comprehensive Markdown document you can give to Claude Code. It maps out the entire structural overhaul, the progression scaling, the "Oregon Trail" soft-locks, and the Champion races, without any mention of Archipelago.
Save this as docs/hub-and-spoke-overhaul.md and feed it directly to your AI agent.
# Hub-and-Spoke Map & Progression Overhaul

**Context:** We are overhauling the map generation and progression loop of **Spokes** (a 2D roguelike cycling simulator built with Phaser 3, TypeScript, and Vite). We are moving away from a single semi-linear DAG (left-to-right progression) to a **Gated Hub-and-Spoke** model with Zelda/Metroidvania-style progression.

**Objective:** Implement a central "Base Camp" hub that branches into distinct thematic routes. Integrate "Oregon Trail" style soft-locks for route gating, and culminate runs in a final multi-racer "Grand Criterium" boss battle.

Please execute this overhaul in the following phases. Review the requirements for each phase carefully before modifying the codebase.

---

## Phase 1: Game State & Item Registry
Before building the map, we need the items and state variables that govern progression.

**1. Update `ItemRegistry.ts`**
Add the following progression items to the registry (they should be consumables/keys, not equipment slot items):
* `ferry_token` (Key): Bypasses the Coast route water hazard.
* `funicular_ticket` (Key): Bypasses the Mountain route climbing hazard.
* `trail_machete` (Key): Bypasses the Forest route overgrowth hazard.
* `medal_plains`, `medal_coast`, `medal_mountain`, `medal_forest` (Quest Items): Awarded for defeating specific Spoke Champions.

**2. Update `RunState.ts`**
* Ensure `RunData` can track the new `runLength` meaning (see Phase 2).
* Add a `returnToHub()` helper function on `RunStateManager` that sets `currentNodeId` back to the Base Camp's ID *without* wiping the `visitedNodeIds` array (allowing players to retreat from a spoke without losing standard node clear progress).

---

## Phase 2: Map Generator & Scaling Redesign
We need to decouple the "depth" of the map from the physical length of the workout.

**1. Scaling Variables**
* **`runLength` (Quest Size):** This no longer determines the depth of the DAG. Instead, it determines **how many Champion Medals are required to unlock the Final Boss**. (e.g., Short run = 2 Medals; Long run = 4 Medals). 
* **`totalDistanceKm` (Workout Length):** This controls the physical length generated for individual `CourseProfile` edges. A spoke always has a static number of nodes (e.g., Hub -> Standard -> Shop -> Boss), but a higher `totalDistanceKm` makes the physical distance between those nodes much longer.

**2. The New Generator Architecture (`MapScene` / `CourseGenerator`)**
Instead of left-to-right floors, generate the DAG using this topology:
* **Node 0:** `HUB` (Base Camp).
* **The Spokes:** Generate $N$ distinct linear chains of nodes radiating from the HUB. Each chain has a theme (Plains, Coast, Mountain, Forest).
* **The Final Boss Node:** Connected directly to the `HUB`, but locked.

---

## Phase 3: "Oregon Trail" Soft-Locks
Routes should be gated by the new Key Items. However, we want "soft-locks"—meaning the player *can* ride them without the key item, but the physiological penalty is brutal.

**1. Gated Edges**
The very first edge connecting the `HUB` to a Spoke is the "Hazard Edge."
* **Coast Hazard:** Checks `RunState.inventory` for `ferry_token`. If missing, the edge's `CourseProfile` is generated with a `mud_deep` surface (apply a massive 5.0x `crrMult` penalty in `CyclistPhysics.ts`).
* **Mountain Hazard:** Checks for `funicular_ticket`. If missing, the edge generates with an unrelenting 15% `grade`.
* **Forest Hazard:** Checks for `trail_machete`. If missing, generates a bumpy, high-resistance `gravel` profile.

**2. Bypassing Hazards**
If the player has the required key item in their inventory, the `CourseProfile` for that edge is overridden to a standard, easy flat asphalt ride (or simply skipped entirely to the next node).

---

## Phase 4: Spoke Champions & The Grand Criterium
We need to give players a reason to clear spokes.

**1. Spoke Bosses (1v1)**
* The final node of every spoke is a `boss` node. 
* Update `RacerProfile.ts` and `GameScene.ts` to support distinct AI opponents:
    * **Plains Sprinter:** High burst power near the finish line.
    * **Mountain Climber:** High W/kg, attacks on steep grades.
    * **Coast Rouleur:** High sustained flat power, ignores surface `crrMult` penalties.
* Defeating a Spoke Boss grants their corresponding `medal` item and teleports the player back to the `HUB`.

**2. The Grand Criterium (Final Boss)**
* The `HUB` contains a special node that requires $X$ Medals (based on `runLength`) to enter.
* This race is a chaotic battle royale against **all** the Spoke Champions the player has defeated so far, simultaneously.
* Winning this race triggers the `VictoryScene`.

---

## Phase 5: UI & UX Updates
* **`MapScene.ts` Rendering:** * Update the visual layout to clearly show the Hub and radiating spokes.
    * The UI must visually indicate the state of a Hazard Edge. If the player is missing the key item, display a hazard icon (e.g., a warning sign or water/mountain icon) over that edge so they know what they are walking into.
    * The Final Boss node should display a visual counter (e.g., "Medals: 1/3").
* **Retreat Mechanic:** Add a persistent "Return to Base Camp" UI button while on the map screen. This triggers `RunStateManager.returnToHub()`, allowing the player to back out of a spoke if a soft-lock is too physically demanding.

---
**Reference Files:**
* `src/roguelike/RunState.ts`
* `src/roguelike/ItemRegistry.ts`
* `src/physics/CyclistPhysics.ts`
* `src/scenes/MapScene.ts`
* `src/race/RacerProfile.ts`
* `src/course/CourseGenerator.ts`

