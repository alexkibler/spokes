/**
 * UnitConversions.ts
 * 
 * Precise constants and helpers for cycling unit conversions.
 * Using international standard: 1 inch = 25.4 mm exactly.
 * 1 mile = 1760 yards = 1760 * 3 feet = 1760 * 3 * 12 inches 
 *        = 63360 inches = 63360 * 25.4 mm = 1609344 mm = 1.609344 km.
 */

export const MI_TO_KM = 1.609344;
export const KM_TO_MI = 1 / MI_TO_KM; // approx 0.621371192

export const LB_TO_KG = 0.45359237; // international avoirdupois pound
export const KG_TO_LB = 1 / LB_TO_KG; // approx 2.20462262

/**
 * Checks if a number is "close enough" to an integer to be displayed as one.
 * Helps prevent floating point jitter like 3.0000000000000004.
 */
export function isCloseToInteger(val: number, tolerance = 0.0001): boolean {
  return Math.abs(val - Math.round(val)) < tolerance;
}

/**
 * Formats a value for display, stripping trailing .0 for integers.
 */
export function formatFixed(val: number, decimals = 1): string {
  if (isCloseToInteger(val)) {
    return Math.round(val).toString();
  }
  return val.toFixed(decimals);
}
