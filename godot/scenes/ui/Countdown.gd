extends Control

# Countdown.gd
# Circular Node Countdown UI.

@onready var progress_bar = $TextureProgressBar
@onready var label = $Label

var total_time: float = 3.0
var time_left: float = 0.0
var is_active: bool = false

signal completed
signal cancelled

func start_countdown(duration: float):
	total_time = duration
	time_left = duration
	is_active = true
	progress_bar.max_value = 100
	progress_bar.value = 100
	label.text = str(ceil(time_left))
	visible = true
	set_process(true)

func cancel_countdown():
	is_active = false
	visible = false
	set_process(false)
	emit_signal("cancelled")

func _process(delta):
	if !is_active: return

	time_left -= delta
	progress_bar.value = (time_left / total_time) * 100
	label.text = str(ceil(time_left))

	if time_left <= 0:
		is_active = false
		emit_signal("completed")
		visible = false
