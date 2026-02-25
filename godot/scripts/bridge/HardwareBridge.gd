extends Node

# HardwareBridge.gd
# Interfaces with the existing TypeScript/JS Web Bluetooth stack.

var _js_callback: JavaScriptObject = null
var _last_grade: float = 0.0
var _last_crr: float = 0.005
var _last_cwa: float = 0.0

func _ready():
	if OS.has_feature("web"):
		_js_callback = JavaScriptBridge.create_callback(_on_js_data)
		# Expose to window so TS can call window.godotOnData({...})
		var window = JavaScriptBridge.get_interface("window")
		if window:
			window.godotOnData = _js_callback
			print("[HardwareBridge] Bound window.godotOnData callback")

		# Start Keep-Alive Heartbeat
		var timer = Timer.new()
		timer.wait_time = 2.0
		timer.autostart = true
		timer.timeout.connect(_on_heartbeat)
		add_child(timer)
	else:
		print("[HardwareBridge] Not running in Web environment. Mocking data?")

func connect_trainer():
	if OS.has_feature("web"):
		# Calls window.trainerService.connect() which returns a Promise
		# We can't await JS Promises directly easily in GDScript 4.x without callbacks
		# Just fire and forget, relying on status updates or data flow
		JavaScriptBridge.eval("if(window.trainerService) window.trainerService.connect();")

func _on_js_data(args):
	# args[0] is the JS object passed to callback
	var data = args[0]
	if data:
		var power = float(data.instantaneousPower) if "instantaneousPower" in data else 0.0
		var speed = float(data.instantaneousSpeed) if "instantaneousSpeed" in data else 0.0 # km/h from FTMS?
		var cadence = float(data.instantaneousCadence) if "instantaneousCadence" in data else 0.0

		# Emit signal to Godot world
		# Note: speed from FTMS is usually km/h * 100 or something, but let's assume the TS service normalizes it
		# The prompt says "instantaneousSpeed", assuming normalized float.
		SignalBus.hardware_data_received.emit(power, speed, cadence)

		# If we receive data, we are connected
		if !SessionService.trainer_connected:
			SignalBus.trainer_connection_changed.emit(true)

func set_simulation_params(grade: float, crr: float, cwa: float):
	_last_grade = grade
	_last_crr = crr
	_last_cwa = cwa

	if OS.has_feature("web"):
		# Send raw command to window.trainerService
		# Grade is usually percentage (0.05 = 5%). FTMS wants it as is?
		# Prompt Requirement: Grade & Crr scaled by weight/83.0
		# Prompt Requirement: CWA raw.

		# Retrieve weight from SessionService (Autoload)
		var user_weight = SessionService.user_weight_kg
		var weight_scale = user_weight / 83.0

		var scaled_grade = grade * weight_scale
		var scaled_crr = crr * weight_scale

		# FTMS command construction in JS
		var command = "if(window.trainerService && window.trainerService.setSimulationParams) window.trainerService.setSimulationParams(%f, %f, %f);" % [scaled_grade, scaled_crr, cwa]
		JavaScriptBridge.eval(command)

func _on_heartbeat():
	# Re-send last parameters to prevent timeout
	set_simulation_params(_last_grade, _last_crr, _last_cwa)
