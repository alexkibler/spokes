extends Node

# RunManager.gd
# Global Autoload holding the current run state.

var run_active: bool = false
var gold: int = 0
var inventory: Array = []
var equipment: Dictionary = {} # slot -> item_id
var current_node_id: String = ""
var cleared_edges: Array = []
var active_edge: Dictionary = {}
var modifiers: Dictionary = {
	"power_mult": 1.0,
	"drag_reduction": 0.0,
	"weight_mult": 1.0,
	"crr_mult": 1.0
}

# Run Config
var difficulty: String = "normal"
var run_seed: int = 0

func start_new_run(p_seed: int = 0):
	run_active = true
	gold = 0
	inventory = []
	equipment = {}
	current_node_id = "start"
	cleared_edges = []
	modifiers = {
		"power_mult": 1.0,
		"drag_reduction": 0.0,
		"weight_mult": 1.0,
		"crr_mult": 1.0
	}
	if p_seed == 0:
		run_seed = randi()
	else:
		run_seed = p_seed
	seed(run_seed)
	SignalBus.run_started.emit()

func end_run(success: bool):
	run_active = false
	SignalBus.run_ended.emit(success)

func add_gold(amount: int):
	gold += amount
	SignalBus.gold_changed.emit(gold)

func spend_gold(amount: int) -> bool:
	if gold >= amount:
		gold -= amount
		SignalBus.gold_changed.emit(gold)
		return true
	return false

func add_item(item_id: String):
	inventory.append(item_id)
	_recalculate_modifiers()
	SignalBus.inventory_updated.emit()

func equip_item(item_id: String, slot: String):
	if equipment.has(slot):
		# Unequip old item logic if needed
		pass
	equipment[slot] = item_id
	_recalculate_modifiers()
	SignalBus.inventory_updated.emit()

func _recalculate_modifiers():
	# Reset base modifiers
	modifiers = {
		"power_mult": 1.0,
		"drag_reduction": 0.0,
		"weight_mult": 1.0,
		"crr_mult": 1.0
	}

	# Apply equipment modifiers
	# This would normally query ItemRegistry for stats
	# For now, just a placeholder structure
	pass

func get_run_data() -> Dictionary:
	return {
		"gold": gold,
		"inventory": inventory,
		"equipment": equipment,
		"current_node_id": current_node_id,
		"seed": run_seed
	}
