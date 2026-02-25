extends Control

# Menu.gd
# Main Menu Scene Controller.

@onready var start_button = $VBoxContainer/StartButton
@onready var connect_button = $VBoxContainer/ConnectButton
@onready var weight_input = $VBoxContainer/WeightInput
@onready var ftp_input = $VBoxContainer/FTPInput
@onready var difficulty_option = $VBoxContainer/DifficultyOption
@onready var units_option = $VBoxContainer/UnitsOption

func _ready():
	start_button.pressed.connect(_on_start_pressed)
	connect_button.pressed.connect(_on_connect_pressed)
	SignalBus.trainer_connection_changed.connect(_on_trainer_connected)

	# Default values
	weight_input.text = str(SessionService.user_weight_kg)
	ftp_input.text = str(SessionService.user_ftp)

	start_button.disabled = false # Allow mock mode immediately

func _on_connect_pressed():
	print("[Menu] Requesting Trainer Connection...")
	connect_button.text = "Connecting..."
	connect_button.disabled = true
	HardwareBridge.connect_trainer()

func _on_trainer_connected(connected: bool):
	if connected:
		print("[Menu] Trainer Connected!")
		connect_button.text = "Connected"
		connect_button.disabled = true
		SessionService.trainer_connected = true

func _on_start_pressed():
	# Save User Profile
	var weight = float(weight_input.text)
	var ftp = int(ftp_input.text)
	var difficulty = difficulty_option.get_item_text(difficulty_option.selected)
	var units = units_option.get_item_text(units_option.selected)

	SessionService.set_user_profile(ftp, weight, units)
	RunManager.difficulty = difficulty

	print("[Menu] Starting Run with Profile: ", SessionService.user_ftp, "W / ", SessionService.user_weight_kg, "kg")

	# Transition to Map Scene
	get_tree().change_scene_to_file("res://scenes/map/Map.tscn")
