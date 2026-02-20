Context: We are building a roguelike progression mode for our Phaser 3 indoor cycling simulator. The procedural map (a Directed Acyclic Graph) and node-traversal UI are already built. The game uses a custom physics engine (CyclistPhysics.ts) that converts real-time Bluetooth FTMS trainer wattage into in-game speed.

We now need to implement the player stats, the economy, the shop, and the specific node encounters. Please architect and implement the following systems in phases. Do not build everything at once; wait for my approval after each phase.
Phase 1: Foundation & Scaling (RunState & FTP)

    FTP Input & Scaling Setup: To ensure the game is balanced for all body types, we must separate Speed (driven by physics) from Effort (driven by cardiovascular fitness). In MenuScene.ts, add a number input for the player's FTP (Functional Threshold Power). If left blank, default to weightKg * 2.2.

    RunState Manager: Create a global or scene-persistent RunState object to track: Current Gold, Player FTP, and current Stat Modifiers (e.g., base CdA, mass, Crr multiplier, wattage multiplier).

Phase 2: Economy, Shop, & Upgrades

    Earning Gold: When GameScene.ts completes a node, calculate a gold reward. Factor in the edge's difficulty (higher resistance surfaces or steeper grades yield more gold) and add it to RunState.

    Shop UI: When traversing to a Shop node, bypass GameScene.ts and open a Shop UI overlay.

    The Upgrades (Stats): Upgrades should directly modify variables in the physics engine or run state:

        Aerodynamics (CdA): Aero Helmet, Deep Section Wheels. Excellent for flat routes.

        Weight (Mass): Titanium Bolts, Carbon Frame. Reduces gravity penalty on climbs.

        Rolling Resistance (Crr): Wider tires, supple casings. Reduces penalties on gravel/mud routes.

        Mechanical Efficiency: Ceramic Bearings, Waxed Chain. Applies a flat percentage multiplier to the watts sent to the physics engine (speeding up the player without changing their base FTP requirements).

Phase 3: The Nodes & Boss Encounters

Populate the map nodes with the following encounters. Crucially, all physical challenges must scale using percentages of player.ftp rather than raw wattage.

    Act Bosses (End of floor tests):

        The Final Boss (Speedrun/Time Trial): A pure race against a "Ghost" pacing vehicle to beat a par time over a complex course.

        The HC Climb: A brutal, sustained 10-15% grade. If speed drops below a threshold for too long, a "Broom Wagon" catches the player and ends the run.

        The Peloton: The player must hold a steady output within a specific band (e.g., 70% to 85% of FTP). Pushing too hard triggers a headwind debuff; dropping too low loses the draft.

    Elite Nodes (High risk/reward):

        The Rhythm Section: The player must match shifting cadence (RPM) targets. Missing the target cadence applies a heavy speed penalty.

        The Interval Block: Grade fluctuates wildly every 30 seconds, testing shifting and power adaptation.

        Cobbled Sector: The entire edge is forced to Mud/Heavy Dirt surface type (highest rolling resistance).

    "?" Event Nodes: Text-based choices that pause the physical exertion. Examples:

        Sketchy Shortcut: Skip the next node, but take a permanent +5% Crr debuff (rubbing brake).

        Broken Derailleur: Pay 50 gold to fix it (gain +5% power efficiency) or play a pedaling minigame to fix it for free.

Output Request for Phase 1:

Please provide the updated code for MenuScene.ts to include the FTP input UI, and provide the initial TypeScript interfaces/classes for the RunState to track the player's gold, FTP, and stat modifiers.