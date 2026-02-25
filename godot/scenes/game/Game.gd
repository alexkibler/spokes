extends Node

# Game.gd
# Main riding scene controller.

@onready var parallax_bg = $ParallaxBackground
@onready var hud = $HUD
@onready var cyclist_sprite = $CyclistSprite

var current_course: CourseProfile
var current_distance_m: float = 0.0
var current_grade: float = 0.0
var current_surface: String = "asphalt"

var velocity_ms: float = 0.0
var smooth_velocity_ms: float = 0.0
var raw_power: float = 0.0
var raw_speed_ms: float = 0.0 # From trainer
var raw_cadence: float = 0.0

var elapsed_time: float = 0.0
var is_riding: bool = false
var ride_completed: bool = false

# Autoplay Logic
var autoplay_power_target: float = 200.0
var autoplay_power_w: float = 0.0

func _ready():
	# Load course from RunManager or generate default
	if RunManager.active_edge and RunManager.active_edge.has("course_profile"):
		current_course = RunManager.active_edge.course_profile
	else:
		# Fallback to default/test course
		current_course = CourseProfile.generate_course_profile(5.0, 0.05, "asphalt")

	SignalBus.hardware_data_received.connect(_on_hardware_data)

	is_riding = true
	set_process(true)
	set_physics_process(true)

	# Initial params
	_update_environment(0.0)

func _physics_process(delta):
	if not is_riding or ride_completed:
		return

	# 1. Determine Input Power & Speed
	var input_power_w = raw_power
	var input_speed_ms = raw_speed_ms

	if SessionService.is_autoplay_enabled:
		# Autoplay Logic: Maintain steady power
		# Simple PID or linear approach
		if autoplay_power_w < autoplay_power_target:
			autoplay_power_w += 100.0 * delta
		elif autoplay_power_w > autoplay_power_target:
			autoplay_power_w -= 100.0 * delta
		input_power_w = autoplay_power_w
		input_speed_ms = 0.0 # Force virtual physics

	# 2. Update Physics
	# Get current grade & surface
	current_grade = CourseProfile.get_grade_at_distance(current_course, current_distance_m)
	current_surface = CourseProfile.get_surface_at_distance(current_course, current_distance_m)
	var crr = CourseProfile.get_crr_for_surface(current_surface)

	# Calculate Physics Config
	var physics_config = CyclistPhysics.DEFAULT_PHYSICS_CONFIG.duplicate()
	physics_config.grade = current_grade
	physics_config.crr = crr
	physics_config.mass_kg = SessionService.get_total_system_mass()

	# Calculate Acceleration
	# If strict hardware speed is available (Trainer Service), use it directly
	# But prompt says: "strictly lerp to the trainer's physical raw_trainer_speed_ms"

	if SessionService.trainer_connected and not SessionService.is_autoplay_enabled:
		# Hardware Mode: Trust the wheel speed
		# Lerp smooth velocity to raw speed
		smooth_velocity_ms = lerp(smooth_velocity_ms, input_speed_ms, 5.0 * delta)
	else:
		# Virtual Physics Mode (Autoplay or Mock)
		var accel = CyclistPhysics.calculate_acceleration(
			input_power_w,
			smooth_velocity_ms,
			physics_config,
			RunManager.modifiers
		)
		smooth_velocity_ms += accel * delta
		if smooth_velocity_ms < 0: smooth_velocity_ms = 0

	# 3. Update Position
	current_distance_m += smooth_velocity_ms * delta
	elapsed_time += delta

	# 4. Check Completion
	if current_distance_m >= current_course.total_distance_m:
		_on_ride_complete()

	# 5. Send Feedback to Trainer
	# HardwareBridge handles the math (scaling by weight, etc.)
	# We just pass raw grade/crr
	# Calculate CdA for simulation
	var cwa = 0.416 * pow(SessionService.user_weight_kg / 114.3, 0.66)
	HardwareBridge.set_simulation_params(current_grade, crr, cwa)

	# 6. Update Visuals
	_update_environment(delta)

func _update_environment(delta):
	# Parallax
	if parallax_bg:
		parallax_bg.scroll_offset.x -= smooth_velocity_ms * 100.0 * delta # visual scale

	# HUD Update
	# SignalBus.emit... or direct call if HUD is child
	pass

func _on_hardware_data(p: float, s: float, c: float):
	raw_power = p
	raw_speed_ms = s / 3.6 # km/h to m/s
	raw_cadence = c

func _on_ride_complete():
	ride_completed = true
	is_riding = false
	SignalBus.edge_completed.emit({
		"distance": current_distance_m,
		"time": elapsed_time
	})
	# Transition to Victory or Map
	get_tree().change_scene_to_file("res://scenes/ui/Victory.tscn")
