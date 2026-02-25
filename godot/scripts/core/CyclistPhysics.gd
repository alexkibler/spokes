class_name CyclistPhysics
extends RefCounted

# CyclistPhysics.gd
# Pure physics module - no scene dependency.
#
# Steady-state power equation:
#   P = (0.5 * rho * CdA * v^2 + Crr * m * g * cos(theta) + m * g * sin(theta)) * v

const DEFAULT_MASS_KG: float = 83.0 # 75kg rider + 8kg bike (FTMS standard)
const DEFAULT_CDA: float = 0.325    # Calibrated baseline
const DEFAULT_CRR: float = 0.005    # Asphalt baseline
const DEFAULT_RHO_AIR: float = 1.225 # Sea level, 15C
const G: float = 9.80665

# Configuration Dictionary
# {
#   "mass_kg": float,
#   "cda": float,
#   "crr": float,
#   "rho_air": float,
#   "grade": float
# }

const DEFAULT_PHYSICS_CONFIG = {
	"mass_kg": DEFAULT_MASS_KG,
	"cda": DEFAULT_CDA,
	"crr": DEFAULT_CRR,
	"rho_air": DEFAULT_RHO_AIR,
	"grade": 0.0
}

# Modifiers Dictionary
# {
#   "power_mult": float,     # e.g. 1.05 for +5%
#   "drag_reduction": float, # e.g. 0.03 for -3% CdA
#   "weight_mult": float     # e.g. 0.95 for -5% Mass
# }

static func calculate_acceleration(
	power_w: float,
	current_velocity_ms: float,
	config: Dictionary = DEFAULT_PHYSICS_CONFIG,
	modifiers: Dictionary = {}
) -> float:

	var cda: float = config.get("cda", DEFAULT_CDA)
	var rho_air: float = config.get("rho_air", DEFAULT_RHO_AIR)
	var crr: float = config.get("crr", DEFAULT_CRR)
	var grade: float = config.get("grade", 0.0)
	var base_mass: float = config.get("mass_kg", DEFAULT_MASS_KG)

	var power_mult: float = modifiers.get("power_mult", 1.0)
	var drag_reduction: float = modifiers.get("drag_reduction", 0.0)
	var weight_mult: float = modifiers.get("weight_mult", 1.0)

	var effective_power: float = power_w * power_mult
	var effective_cda: float = cda * (1.0 - drag_reduction)
	var effective_mass: float = base_mass * weight_mult

	var theta: float = atan(grade)
	var cos_theta: float = cos(theta)
	var sin_theta: float = sin(theta)

	# F_propulsion = P / v
	# Avoid division by zero
	var v: float = max(current_velocity_ms, 0.1)
	var propulsion_force: float = effective_power / v

	# Resistance forces
	# Drag = 0.5 * rho * CdA * v^2
	var aero_force: float = 0.5 * rho_air * effective_cda * current_velocity_ms * current_velocity_ms

	# Rolling resistance = Crr * m * g * cos(theta)
	var rolling_force: float = crr * effective_mass * G * cos_theta

	# Gravity = m * g * sin(theta)
	var grade_force: float = effective_mass * G * sin_theta

	# F_net = F_propulsion - (F_aero + F_rolling + F_grade)
	var net_force: float = propulsion_force - (aero_force + rolling_force + grade_force)

	return net_force / effective_mass

static func ms_to_kmh(ms: float) -> float:
	return ms * 3.6

static func ms_to_mph(ms: float) -> float:
	return ms * 2.23694
