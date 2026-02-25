extends Control

# Map.gd
# Roguelike Map Scene Controller.

@onready var scroll_container = $ScrollContainer
@onready var nodes_container = $ScrollContainer/NodesContainer
@onready var edges_container = $ScrollContainer/EdgesContainer

var active_floor: int = 0
var completed_nodes: Array = []

func _ready():
	SignalBus.node_selected.connect(_on_node_selected)

	if RunManager.run_active:
		_render_map()
	else:
		RunManager.start_new_run()
		_render_map()

	# Autoplay Check
	if SessionService.is_autoplay_enabled:
		_start_autoplay_logic()

func _render_map():
	# Procedural Generation or Load from RunManager
	# Simplified: generate a grid of nodes
	# For migration, we assume RunManager has the graph structure
	# If not, generate it here.

	# Placeholder: create 3 floors of 3 nodes
	for floor_idx in range(3):
		for node_idx in range(3):
			var node = Button.new() # Using Button for simplicity in GDScript-only creation
			node.text = "Node_%d_%d" % [floor_idx, node_idx]
			node.name = "Node_%d_%d" % [floor_idx, node_idx]
			node.position = Vector2(100 + floor_idx * 200, 100 + node_idx * 150)
			node.pressed.connect(func(): _on_node_pressed(node.name))
			nodes_container.add_child(node)

			# Draw edges
			if floor_idx > 0:
				var line = Line2D.new()
				line.add_point(Vector2(100 + (floor_idx-1) * 200, 100 + node_idx * 150))
				line.add_point(node.position)
				edges_container.add_child(line)

func _on_node_pressed(node_id: String):
	if _can_travel_to(node_id):
		RunManager.current_node_id = node_id
		# Determine Edge Type (Standard, Shop, etc.)
		# For now, start Game
		RunManager.active_edge = {
			"course_profile": CourseProfile.generate_course_profile(2.0, 0.03, "asphalt")
		}
		get_tree().change_scene_to_file("res://scenes/game/Game.tscn")

func _can_travel_to(node_id: String) -> bool:
	# Check connectivity in DAG
	return true

# Autoplay Logic
func _start_autoplay_logic():
	print("[Map] Autoplay: Analyzing next move...")
	await get_tree().create_timer(2.0).timeout

	# Logic: Find best node (avoid Elite, maximize reward)
	# Simplified: Pick first available next-floor node
	var next_node = _get_next_autoplay_node()
	if next_node:
		print("[Map] Autoplay: Selected ", next_node)
		_on_node_pressed(next_node)

func _get_next_autoplay_node() -> String:
	# In a real implementation, query the graph for valid edges from current_node_id
	# Then filter out Elite nodes if needed.
	return "Node_1_0" # Dummy return
