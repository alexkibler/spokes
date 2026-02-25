class_name ItemRegistry
extends Node

# ItemRegistry.gd
# Central database for all Items and Rewards.
# Acts as a singleton dictionary for looking up item stats/effects.

const ITEMS = {
	"aero_helmet": {
		"id": "aero_helmet",
		"name": "Aero Helmet",
		"description": "Reduces aerodynamic drag by 3%.",
		"price": 60,
		"rarity": "uncommon",
		"slot": "helmet",
		"modifiers": { "drag_reduction": 0.03 }
	},
	"carbon_frame": {
		"id": "carbon_frame",
		"name": "Carbon Frame",
		"description": "Lightweight frame. -12% Weight, -3% Drag.",
		"price": 150,
		"rarity": "rare",
		"slot": "frame",
		"modifiers": { "weight_mult": 0.88, "drag_reduction": 0.03 }
	},
	"gold_crank": {
		"id": "gold_crank",
		"name": "Solid Gold Crank",
		"description": "Increases power output by 25%. Heavy.",
		"price": 120,
		"rarity": "rare",
		"slot": "cranks",
		"modifiers": { "power_mult": 1.25 }
	},
	"antigrav_pedals": {
		"id": "antigrav_pedals",
		"name": "Anti-Grav Pedals",
		"description": "Reduces system weight by 8%.",
		"price": 90,
		"rarity": "rare",
		"slot": "pedals",
		"modifiers": { "weight_mult": 0.92 }
	},
	"dirt_tires": {
		"id": "dirt_tires",
		"name": "Dirt Tires",
		"description": "Greatly reduces rolling resistance on rough terrain.",
		"price": 70,
		"rarity": "uncommon",
		"slot": "tires",
		"modifiers": { "crr_mult": 0.65 } # Approximate effect
	},
	"tailwind": {
		"id": "tailwind",
		"name": "Tailwind",
		"description": "Consumable. Toggles 2x power for a short duration.",
		"price": 100,
		"rarity": "rare",
		"type": "consumable"
	},
	"teleport_scroll": {
		"id": "teleport_scroll",
		"name": "Teleport Scroll",
		"description": "Warp to any previously visited node.",
		"price": 10,
		"rarity": "common",
		"type": "consumable"
	},
	"reroll_voucher": {
		"id": "reroll_voucher",
		"name": "Reroll Voucher",
		"description": "Reroll reward choices.",
		"price": 50,
		"rarity": "common",
		"type": "consumable"
	}
}

static func get_item(id: String) -> Dictionary:
	return ITEMS.get(id, {})

static func get_all_items() -> Array:
	return ITEMS.values()
