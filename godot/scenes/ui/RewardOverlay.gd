extends Control

# RewardOverlay.gd
# Handles the "Hades-style" 3-card reward screen.

signal reward_selected(reward_id: String)

@onready var container = $RewardsContainer
# Assuming buttons are named RewardButton1, RewardButton2, RewardButton3
# In Godot, better to instance them dynamically, but for migration plan, direct refs are ok if predefined.
@onready var button1 = $RewardsContainer/RewardButton1
@onready var button2 = $RewardsContainer/RewardButton2
@onready var button3 = $RewardsContainer/RewardButton3

var offered_rewards: Array = []

func _ready():
	visible = false

	# Autoplay Check
	if SessionService.is_autoplay_enabled:
		_start_autoplay_selection()

func show_rewards(rewards: Array):
	offered_rewards = rewards
	visible = true

	# Update Button UI (simplified)
	if rewards.size() >= 1: _setup_button(button1, rewards[0])
	if rewards.size() >= 2: _setup_button(button2, rewards[1])
	if rewards.size() >= 3: _setup_button(button3, rewards[2])

	if SessionService.is_autoplay_enabled:
		_start_autoplay_selection()

func _setup_button(btn: Button, reward_data: Dictionary):
	btn.text = reward_data.get("name", "Unknown Reward")
	if btn.is_connected("pressed", _on_button_pressed):
		btn.disconnect("pressed", _on_button_pressed)
	btn.pressed.connect(func(): _on_button_pressed(reward_data))
	btn.show()

func _on_button_pressed(reward_data: Dictionary):
	print("[RewardOverlay] Selected: ", reward_data.id)
	RunManager.add_item(reward_data.id)

	# Auto-equip logic if slot available or upgrade
	if reward_data.has("slot"):
		RunManager.equip_item(reward_data.id, reward_data.slot)

	visible = false
	emit_signal("reward_selected", reward_data.id)

	# Transition back to Map
	get_tree().change_scene_to_file("res://scenes/map/Map.tscn")

# Autoplay Logic

func _start_autoplay_selection():
	if !visible or offered_rewards.is_empty(): return

	print("[RewardOverlay] Autoplay: Analyzing rewards...")
	await get_tree().create_timer(2.0).timeout

	var best_reward = _get_best_reward(offered_rewards)
	if best_reward:
		print("[RewardOverlay] Autoplay: Recommends ", best_reward.name)
		# Find the button corresponding to this reward and click it
		if best_reward == offered_rewards[0]: button1.pressed.emit()
		elif best_reward == offered_rewards[1]: button2.pressed.emit()
		elif best_reward == offered_rewards[2]: button3.pressed.emit()

func _get_best_reward(rewards: Array) -> Dictionary:
	var best_score = -9999.0
	var best_item = null

	for reward in rewards:
		var score = _calculate_reward_score(reward)
		if score > best_score:
			best_score = score
			best_item = reward

	return best_item

func _calculate_reward_score(item: Dictionary) -> float:
	var score = 0.0

	# Deprioritize duplicates
	if RunManager.inventory.has(item.id):
		score -= 1000.0

	# Evaluate Modifiers
	if item.has("modifiers"):
		var mods = item.modifiers
		if mods.has("power_mult"): score += mods.power_mult * 100.0
		if mods.has("drag_reduction"): score += mods.drag_reduction * 200.0 # Aero is king
		if mods.has("weight_mult"): score += (1.0 - mods.weight_mult) * 50.0 # Weight reduction is good
		if mods.has("crr_mult"): score += (1.0 - mods.crr_mult) * 30.0

	# Rarity Bonus
	match item.get("rarity", "common"):
		"common": score += 10.0
		"uncommon": score += 20.0
		"rare": score += 50.0

	return score
