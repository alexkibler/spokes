/**
 * RacerProfile.ts
 *
 * Defines the physics profile for an AI-controlled racer (ghost rider).
 * Used for the final boss encounter and reusable for Elite race events.
 *
 * Physics assumptions:
 *   - Racer outputs constant power (no fatigue model — they're robots/ghosts)
 *   - Same CyclistPhysics equations as the player
 *   - No run modifiers applied (boss doesn't benefit from shop items)
 */

export interface RacerProfile {
  /** Unique identifier */
  id: string;
  /** Display name shown in HUD */
  displayName: string;
  /** Flavour quote shown in the pre-ride encounter screen (future) */
  flavorText: string;
  /** Constant power output in watts */
  powerW: number;
  /** Total system mass: rider + bike (kg) */
  massKg: number;
  /** Drag area coefficient (m²) — lower = more aero */
  cdA: number;
  /** Rolling resistance coefficient */
  crr: number;
  /** Phaser hex colour integer for the ghost cyclist body */
  color: number;
  /** CSS hex string for text labels */
  hexColor: string;
  /** Accent colour for elevation graph marker */
  accentColor: number;
  /** Accent CSS hex for text */
  accentHex: string;
}

// ─── Known parody pro profiles ────────────────────────────────────────────────

/**
 * Final boss: Tadej Pogazcar (parody of Tadej Pogačar).
 * Power = 2× the player's FTP.
 *
 * Stats based on elite pro road racing benchmarks:
 *   ~6.4 W/kg, CdA ~0.20 in race position, 66 kg rider + 8 kg frame
 *
 * Boss version: power is scaled from player FTP so the race is always
 * relevant regardless of how weak or strong the player is.
 */
export function createBossProfile(playerFtpW: number): RacerProfile {
  return {
    id: 'le_fantome',
    displayName: 'LE FANTÔME',
    flavorText: '"You cannot outrun what has no shadow." — The Phantom',
    powerW: Math.round(playerFtpW * 2),
    massKg: 74,   // 66 kg rider + 8 kg carbon race bike
    cdA: 0.20,    // exceptional TT-style race position
    crr: 0.003,   // pro race tyre compound (half of default asphalt)
    color:       0x88ccff,  // ghost-blue cyclist body
    hexColor:    '#88ccff',
    accentColor: 0xff6600,  // orange accent for elevation marker
    accentHex:   '#ff6600',
  };
}

/**
 * Generic ghost racer for Elite events: a local rival who pushes at
 * a specific FTP fraction, with default road-bike aero.
 */
export function createEliteRacer(name: string, powerW: number): RacerProfile {
  return {
    id: `elite_${name.toLowerCase().replace(/\s+/g, '_')}`,
    displayName: name,
    flavorText: '"Beat me if you can."',
    powerW,
    massKg: 78,   // 70 kg rider + 8 kg bike
    cdA: 0.30,    // road-race position
    crr: 0.005,   // standard asphalt
    color:       0xffcc44,  // golden rival
    hexColor:    '#ffcc44',
    accentColor: 0xffcc44,
    accentHex:   '#ffcc44',
  };
}
