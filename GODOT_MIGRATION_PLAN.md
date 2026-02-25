# Spokes Godot Migration Plan

## 1. Directory Structure (`res://`)

We will follow a modular structure separating game logic, UI, and core systems.

```
res://
├── assets/                 # Static assets (images, audio, fonts)
│   ├── images/
│   ├── audio/
│   └── fonts/
├── autoload/               # Global Singletons (Autoloads)
│   ├── RunManager.gd       # Run state (inventory, modifiers, current node)
│   ├── SessionService.gd   # Hardware connection, autoplay state, user settings
│   └── SignalBus.gd        # Centralized signal hub (optional)
├── scenes/                 # Godot Scenes (.tscn) and attached scripts
│   ├── game/               # Main riding scene
│   │   ├── Game.tscn       # The orchestrator scene
│   │   ├── Game.gd
│   │   ├── HUD.tscn        # Heads-up display (speed, power, etc.)
│   │   └── ParallaxBackground.tscn
│   ├── map/                # Roguelike map scene
│   │   ├── Map.tscn
│   │   ├── Map.gd
│   │   ├── MapNode.tscn    # Reusable node component
│   │   └── MapEdge.tscn    # Visual edge component
│   ├── menu/               # Main Menu
│   │   ├── Menu.tscn
│   │   └── Menu.gd
│   ├── ui/                 # Shared UI components
│   │   ├── Countdown.tscn  # Circular countdown timer
│   │   ├── RewardOverlay.tscn
│   │   └── Victory.tscn
├── scripts/                # Pure logic and helper classes
│   ├── core/
│   │   ├── CyclistPhysics.gd # Physics engine (RefCounted)
│   │   ├── CourseProfile.gd  # Data structure for courses
│   │   └── CourseGenerator.gd # Procedural generation logic
│   ├── bridge/
│   │   └── HardwareBridge.gd # JavaScriptBridge interface
│   └── roguelike/
│       ├── ItemRegistry.gd   # Item definitions
│       └── EliteChallenge.gd # Challenge logic
└── project.godot
```

## 2. UI Scaling Strategy

To ensure the game scales correctly across different screen sizes (mobile/desktop):

*   **Root Control Nodes**: All UI scenes (`Menu`, `HUD`, `Map`, `Overlays`) will use a root `Control` node with `Anchors Preset` set to **Full Rect** to fill the viewport.
*   **Containers**: We will rely heavily on `VBoxContainer`, `HBoxContainer`, and `GridContainer` for automatic layout management.
*   **Margins**: `MarginContainer` with theme-based constants will be used to ensure UI elements do not touch the screen edges.
*   **Responsive Scaling**:
    *   Backgrounds will use `TextureRect` with `Expand Mode` set to **Keep Aspect Covered** or **Keep Aspect Centered**.
    *   Circular elements (countdowns) will use `Aspect Ratio Container`.
    *   Fonts and element sizes will be managed via a global `Theme` resource.
*   **Layering**: UI will be placed on a `CanvasLayer` with a high index to ensure it always renders above the game world (Parallax/Path2D).

## 3. Hardware Bridge Connection

We will maintain the existing TypeScript/JS Web Bluetooth logic and bridge it to Godot.

### Interface: `scripts/bridge/HardwareBridge.gd`

*   **Initialization**:
    *   On `_ready()`, check `OS.has_feature("web")`.
    *   Create a GDScript callback using `JavaScriptBridge.create_callback(_on_js_data)`.
    *   Expose this callback to the global window scope so the existing JS code can call it.
        ```gdscript
        # HardwareBridge.gd
        var _js_callback = JavaScriptBridge.create_callback(_on_js_data)
        JavaScriptBridge.get_interface("window").godotOnData = _js_callback
        ```

### Data In (JS -> Godot)

*   The existing `TrainerService.ts` (compiled to JS) or a dedicated bridge script in `index.html` will call `window.godotOnData(data)` whenever new FTMS data arrives.
*   **`_on_js_data(args)`**: This function will parse the JS object:
    ```gdscript
    func _on_js_data(args):
        var data = args[0]
        var power = data.instantaneousPower
        var speed = data.instantaneousSpeed
        var cadence = data.instantaneousCadence
        # Emit signal to SessionService/Game
        SignalBus.hardware_data_received.emit(power, speed, cadence)
    ```

### Data Out (Godot -> JS)

*   **Simulation Parameters**: We will call the existing `setSimulationParams` method on the JS `trainerService` instance.
    ```gdscript
    func set_simulation_params(grade: float, crr: float, cwa: float):
        if OS.has_feature("web"):
            # Ensure we use the exact math required by the prompt
            var command = "if(window.trainerService) window.trainerService.setSimulationParams(%f, %f, %f);" % [grade, crr, cwa]
            JavaScriptBridge.eval(command)
    ```

### Heartbeat (Keep-Alive)

*   A `Timer` node in `SessionService` (or `HardwareBridge`) will trigger every **2 seconds**.
*   It will call `set_simulation_params` with the last known grade/physics values to prevent the FTMS hardware safety timeout.
