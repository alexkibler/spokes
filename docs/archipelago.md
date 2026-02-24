# Archipelago Integration Prompt for Claude Code

**Context:** I am building **Spokes**, a 2D roguelike cycling simulator using Phaser 3, TypeScript, and Vite. I want to integrate **Archipelago.gg** multiworld support, featuring environmental challenges, traps, and physical cycling progression.

**Core Philosophy:** "Build flexible, default rigid." We want to support "Oregon Trail" style soft-locks (you can pass without the key item, but the physiological toll is brutal), but default to traditional Archipelago hard-locks (you cannot pass without the key item). This behavior must be driven by the player's Archipelago YAML configuration.

**Objective:** Implement an `ArchipelagoService` and update the game logic to support remote items, locations, traps, and YAML-configurable route locks.

## 1. Create `ArchipelagoService.ts`
* Create a new service in `src/services/` that manages a WebSocket connection to an Archipelago server using `archipelago.js`.
* **Slot Data:** Upon connecting, parse the `slot_data` to read the configuration for `hazard_mode` (e.g., `'hard'` or `'soft'`). Store this in `RunStateManager`.
* **Items:** When an item is received, call `RunStateManager.addToInventory()` for physical items or `RunStateManager.applyModifier()` for stat-based rewards (like +5% Power).
* **Locations:** Map node completion in `MapScene` and Elite Challenge successes to Archipelago location IDs, sending checks when cleared.

## 2. Implement Flexible Route Hazards
* Modify `CourseProfile.ts`, `CyclistPhysics.ts`, and `MapScene.ts` to support YAML-configurable obstacles:
    * **The River Crossing:** Create a "River" edge type requiring a "Ferry Token" (AP Item).
    * **The Funicular:** Create a "Mountain" edge type requiring a "Funicular Ticket" (AP Item).
* **Behavior based on `hazard_mode`:**
    * **If `hard` (Default):** The player cannot traverse the edge in `MapScene` without the required item in their inventory. Attempting to click the node should display an "Access Denied: Missing [Item]" toast.
    * **If `soft`:** The player can traverse the edge without the item, but faces a brutal physiological penalty (e.g., River = `mud_deep` surface with 5.0x `crrMult`; Mountain = unrelenting 15% `grade`). 

## 3. Implement the Trap & Deathlink System
* Add a listener in `ArchipelagoService` for incoming "Traps" from the multiworld:
    * **Washout (Road Closed):** Remove an unvisited `MapEdge` from `RunData`. **Requirement:** Use a BFS pathfinding check to ensure the `finish` node remains reachable from the `currentNodeId` before deleting. If it's the only path, the trap fizzles.
    * **Mechanical Failure (Teleport):** If a player is on the map, teleport `currentNodeId` back to a random node on the *previous* floor. Progress on cleared nodes is kept.
    * **Deathlink:** If Deathlink is enabled in the YAML and the player "drowns" (cadence drops below 30 RPM for 10 seconds while soft-fording a River segment), send a Deathlink signal to the AP server. Listen for incoming Deathlinks and trigger a `VictoryScene` failure state.

## 4. UI Updates
* **MenuScene:** Add fields for Archipelago Host, Slot Name, and Password.
* **MapScene:** Display distinct visual indicators for edges based on their state: Hard-Locked (padlock icon), Soft-Locked (hazard icon), or Unlocked (standard edge).
* Add "Road Closed" animations or notifications if an edge is deleted by a trap.

## Reference Files
* `src/roguelike/RunState.ts` (Core state management)
* `src/roguelike/ItemRegistry.ts` (Item definitions)
* `src/physics/CyclistPhysics.ts` (Physics and resistance)
* `src/scenes/MapScene.ts` (Map navigation logic)