class_name CourseProfile
extends RefCounted

# CourseProfile.gd
# Defines a cycling course as an ordered list of grade segments.
# Pure functions - no scene dependency.

# Types
# SurfaceType: 'asphalt', 'gravel', 'dirt', 'mud'

const CRR_BY_SURFACE = {
	"asphalt": 0.005,
	"gravel": 0.012,
	"dirt": 0.020,
	"mud": 0.040
}

# Segment: { "distance_m": float, "grade": float, "surface": String }

# Class logic to handle course data
var segments: Array = []
var total_distance_m: float = 0.0

func _init(p_segments: Array):
	segments = p_segments
	total_distance_m = 0.0
	for seg in segments:
		total_distance_m += seg.distance_m

# Static Helper Methods (mimicking the TS exports)

static func get_grade_at_distance(profile: CourseProfile, distance_m: float) -> float:
	var wrapped_dist = fmod(distance_m, profile.total_distance_m)
	var remaining = wrapped_dist

	for seg in profile.segments:
		if remaining < seg.distance_m:
			return seg.grade
		remaining -= seg.distance_m

	return 0.0

static func get_surface_at_distance(profile: CourseProfile, distance_m: float) -> String:
	var wrapped_dist = fmod(distance_m, profile.total_distance_m)
	var remaining = wrapped_dist

	for seg in profile.segments:
		if remaining < seg.distance_m:
			return seg.get("surface", "asphalt")
		remaining -= seg.distance_m

	return "asphalt"

static func get_crr_for_surface(surface: String = "asphalt") -> float:
	return CRR_BY_SURFACE.get(surface, 0.005)

static func build_elevation_samples(profile: CourseProfile, step_m: float = 100.0) -> Array:
	var samples = []
	var dist = 0.0
	while dist <= profile.total_distance_m:
		samples.append({
			"distance_m": dist,
			"elevation_m": get_elevation_at_distance(profile, dist)
		})
		dist += step_m

	# Always include final point
	if samples[-1].distance_m < profile.total_distance_m:
		samples.append({
			"distance_m": profile.total_distance_m,
			"elevation_m": get_elevation_at_distance(profile, profile.total_distance_m)
		})

	return samples

static func get_elevation_at_distance(profile: CourseProfile, distance_m: float) -> float:
	var wrapped_dist = fmod(distance_m, profile.total_distance_m)
	var remaining = wrapped_dist
	var elevation = 0.0

	for seg in profile.segments:
		var dist_in_seg = min(remaining, seg.distance_m)
		elevation += dist_in_seg * seg.grade
		if remaining <= seg.distance_m:
			break
		remaining -= seg.distance_m

	return elevation

# Procedural Generator Port

static func generate_course_profile(distance_km: float, max_grade: float, surface: String = "asphalt") -> CourseProfile:
	var total_m = distance_km * 1000.0
	var flat_end_m = max(50.0, min(1500.0, total_m * 0.05))

	var segments = []
	segments.append({ "distance_m": flat_end_m, "grade": 0.0, "surface": surface })

	var budget_m = total_m - 2 * flat_end_m
	var net_elev_m = 0.0

	var seg_max = min(2500.0, max(200.0, total_m * 0.04))
	var seg_min = max(100.0, seg_max * 0.35)

	var mags = [
		max_grade * 0.25,
		max_grade * 0.50,
		max_grade * 0.75,
		max_grade
	]

	while budget_m >= seg_min:
		var hi = min(seg_max, budget_m - seg_min)
		if hi <= 0: break

		var lo = min(seg_min, hi)
		var length = lo + randf() * max(0, hi - lo)

		var pressure = max(-1.0, min(1.0, net_elev_m / (total_m * max_grade * 1.0)))
		var r = randf()
		var sign_val = 0

		if pressure > 0.7:
			sign_val = -1
		elif pressure < -0.7:
			sign_val = 1
		elif r < 0.08:
			sign_val = 0
		else:
			if r < 0.55 - pressure * 0.2:
				sign_val = 1
			else:
				sign_val = -1

		var grade = 0.0
		if sign_val != 0:
			grade = sign_val * mags[randi() % mags.size()]

		segments.append({ "distance_m": length, "grade": grade, "surface": surface })
		net_elev_m += length * grade
		budget_m -= length

	# Bridge logic
	if budget_m > 0 and segments.size() == 1:
		var sign_val = 1 if randf() < 0.5 else -1
		var grade = sign_val * mags[randi() % mags.size()]
		segments.append({ "distance_m": budget_m, "grade": grade, "surface": surface })
		budget_m = 0

	# Absorb remainder
	if budget_m > 0 and segments.size() > 1:
		segments[segments.size() - 1].distance_m += budget_m

	segments.append({ "distance_m": flat_end_m, "grade": 0.0, "surface": surface })

	return CourseProfile.new(segments)
