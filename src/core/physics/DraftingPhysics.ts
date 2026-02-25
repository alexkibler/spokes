/**
 * DraftingPhysics.ts
 *
 * Shared constants and logic for aerodynamic drafting calculations.
 * Used by both the physics engine (for acceleration) and the renderer (for visual effects).
 */

/** Distance at which draft effect starts (DRAFT_MIN_CDA_REDUCTION at this distance) */
export const DRAFT_MAX_DISTANCE_M = 30;
/** CdA reduction at gap = 0 m (wheel-to-wheel) */
export const DRAFT_MAX_CDA_REDUCTION = 0.50;
/** CdA reduction at gap = DRAFT_MAX_DISTANCE_M (tail of the bubble) */
export const DRAFT_MIN_CDA_REDUCTION = 0.01;

/**
 * Returns the CdA reduction fraction for a trailing rider at `gapM` metres
 * behind the leading rider.  Linear from DRAFT_MAX_CDA_REDUCTION at 0 m to
 * DRAFT_MIN_CDA_REDUCTION at DRAFT_MAX_DISTANCE_M, 0 beyond that.
 */
export function draftFactor(gapM: number): number {
  if (gapM <= 0 || gapM >= DRAFT_MAX_DISTANCE_M) return 0;
  return DRAFT_MIN_CDA_REDUCTION +
    (DRAFT_MAX_CDA_REDUCTION - DRAFT_MIN_CDA_REDUCTION) *
    (1 - gapM / DRAFT_MAX_DISTANCE_M);
}
