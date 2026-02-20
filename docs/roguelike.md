Refined Prompt for Roguelike Map Generation

Context: We are building a roguelike progression system into our Phaser 3 cycling simulator. Instead of a single static course, the player will traverse a procedurally generated map similar to Slay the Spire.

Phase 1: Data Architecture & Run Configuration

    Run Configuration: Add a "Run Length" or "Node Count" configuration to MenuScene.ts (e.g., Short = 5 floors, Normal = 10 floors).

    Data Structures: Define the interfaces for the map graph. We need a MapNode (representing a waypoint/stop) and a MapEdge (representing the cycling segment connecting two nodes).

    Node Types: Define node types: Start, Standard Ride, Hard Ride (higher max grade), Shop, and Finish.

    Edge Data: Each MapEdge must hold a CourseSegment object (distance, grade, surface). Ensure edge generation uses the existing generateCourseProfile logic to assign grades and surface types (asphalt, gravel, dirt, mud).

Phase 2: The Map UI (Directed Acyclic Graph)

    New Scene: Create a MapScene.ts that sits between the Menu and the Game.

    Generation Logic: Generate a layered DAG where nodes are organized into "floors". Connect nodes from floor N to floor N+1. Ensure paths occasionally branch and converge, but lines must never cross visually. The final floor should converge to a single Finish node.

    Visuals: Render nodes as clickable icons. Render edges as dotted lines using Phaser.GameObjects.Graphics. Color-code the dotted lines based on the edge's surface type (using the existing SURFACE_FILL_COLORS palette from GameScene.ts).

    Interaction: Track the currentNode. Highlight reachable next nodes. When the player clicks a valid target node, build a CourseProfile from the connecting edge and transition to GameScene.ts passing that specific course.

Phase 3: Economy & Shop Integration

    Persistent State: Create a RunState manager to track the player's current Gold, Inventory, and current Node across scene transitions.

    Earning Currency: When GameScene.ts completes a segment, calculate a gold reward. Factor in the edge's difficulty (e.g., higher resistance surfaces like gravel/mud or steeper grades yield more gold) and add it to RunState.

    Shop UI: When traversing to a Shop node, bypass GameScene.ts and open a Shop UI overlay in MapScene.ts.

    Purchasing: Populate the shop with purchasable items. Hook this into the existing EffectType system so the player can spend gold to permanently add the tailwind effect (or buy single-use consumables) for upcoming nodes.