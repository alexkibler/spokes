extends Node

# SessionService.gd
# Global Autoload holding user session state and settings.

var is_autoplay_enabled: bool = false
var trainer_connected: bool = false
var current_units: String = "metric"
var user_ftp: int = 200
var user_weight_kg: float = 75.0
var bike_weight_kg: float = 8.0

# Hardware Data Cache
var last_power: float = 0.0
var last_speed: float = 0.0
var last_cadence: float = 0.0

func _ready():
	SignalBus.hardware_data_received.connect(_on_hardware_data)
	SignalBus.trainer_connection_changed.connect(_on_connection_changed)

func toggle_autoplay(enabled: bool):
	is_autoplay_enabled = enabled
	SignalBus.autoplay_triggered.emit("toggle_autoplay")

func set_user_profile(ftp: int, weight: float, units: String):
	user_ftp = ftp
	user_weight_kg = weight
	current_units = units

func get_total_system_mass() -> float:
	return user_weight_kg + bike_weight_kg

func _on_hardware_data(power: float, speed: float, cadence: float):
	last_power = power
	last_speed = speed
	last_cadence = cadence

func _on_connection_changed(connected: bool):
	trainer_connected = connected
