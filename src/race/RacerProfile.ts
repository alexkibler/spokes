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
 * Creates a peloton of 10 ghost racers for the final boss fight.
 * Each has slightly different power, mass, and CdA so they spread out
 * rather than clumping together.  Power ranges from 1.75× to 2.25× FTP.
 */
export function createBossRacers(playerFtpW: number): RacerProfile[] {
  const variants: Array<{ suffix: string; powerMult: number; massKg: number; cdA: number }> = [
    { suffix: 'I',    powerMult: 1.75, massKg: 72, cdA: 0.21 },
    { suffix: 'II',   powerMult: 1.85, massKg: 74, cdA: 0.20 },
    { suffix: 'III',  powerMult: 1.90, massKg: 71, cdA: 0.21 },
    { suffix: 'IV',   powerMult: 1.95, massKg: 76, cdA: 0.20 },
    { suffix: 'V',    powerMult: 2.00, massKg: 74, cdA: 0.20 },
    { suffix: 'VI',   powerMult: 2.05, massKg: 73, cdA: 0.19 },
    { suffix: 'VII',  powerMult: 2.10, massKg: 77, cdA: 0.20 },
    { suffix: 'VIII', powerMult: 2.15, massKg: 72, cdA: 0.21 },
    { suffix: 'IX',   powerMult: 2.20, massKg: 75, cdA: 0.19 },
    { suffix: 'X',    powerMult: 2.25, massKg: 73, cdA: 0.20 },
  ];
  // Gradient from pale sky-blue (weakest) to vivid violet (strongest)
  const colors = [
    0x99ddff, 0x88ccff, 0x77bbff, 0x66aaff, 0x5599ee,
    0x6688ff, 0x7777ff, 0x8866ff, 0x9955ff, 0xaa44ff,
  ];
  return variants.map((v, i) => ({
    id: `le_fantome_${v.suffix.toLowerCase()}`,
    displayName: `LE FANTÔME ${v.suffix}`,
    flavorText: '"You cannot outrun what has no shadow." — The Phantom',
    powerW:      Math.round(playerFtpW * v.powerMult),
    massKg:      v.massKg,
    cdA:         v.cdA,
    crr:         0.003,
    color:       colors[i],
    hexColor:    `#${colors[i].toString(16).padStart(6, '0')}`,
    accentColor: 0xff6600,
    accentHex:   '#ff6600',
  }));
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

export function createSpokeBoss(type: 'plains' | 'mountain' | 'coast' | 'forest', playerFtpW: number): RacerProfile {
  const base = {
    id: `boss_${type}`,
    displayName: `${type.toUpperCase()} CHAMPION`,
    flavorText: '',
    powerW: playerFtpW,
    massKg: 75,
    cdA: 0.25,
    crr: 0.005,
    color: 0xffffff,
    hexColor: '#ffffff',
    accentColor: 0xffffff,
    accentHex: '#ffffff',
  };

  switch (type) {
    case 'plains': // Sprinter: Aero + Power
      base.displayName = 'THE SPRINTER';
      base.flavorText = '"Catch me if you can."';
      base.powerW = Math.round(playerFtpW * 1.5); // High power
      base.cdA = 0.22; // Good aero
      base.color = 0x88cc44;
      base.hexColor = '#88cc44';
      base.accentColor = 0xccff66;
      base.accentHex = '#ccff66';
      break;
    case 'mountain': // Climber: Lightweight
      base.displayName = 'THE CLIMBER';
      base.flavorText = '"The summit is my home."';
      base.powerW = Math.round(playerFtpW * 1.3);
      base.massKg = 60; // Light
      base.cdA = 0.30; // Not very aero
      base.color = 0xcc4444;
      base.hexColor = '#cc4444';
      base.accentColor = 0xff6666;
      base.accentHex = '#xff6666';
      break;
    case 'coast': // Rouleur: High sustained, low Crr (ignores mud penalty somewhat)
      base.displayName = 'THE ROULEUR';
      base.flavorText = '"Nothing slows me down."';
      base.powerW = Math.round(playerFtpW * 1.4);
      base.massKg = 80; // Heavy
      base.crr = 0.003; // Very low rolling resistance
      base.color = 0x4488cc;
      base.hexColor = '#4488cc';
      base.accentColor = 0x66aaff;
      base.accentHex = '#66aaff';
      break;
    case 'forest': // Gravel/MTB: Balanced, handles bumps
      base.displayName = 'THE RANGER';
      base.flavorText = '"I know every root and rock."';
      base.powerW = Math.round(playerFtpW * 1.35);
      base.crr = 0.004; // Good tires
      base.color = 0x228844;
      base.hexColor = '#228844';
      base.accentColor = 0x44cc66;
      base.accentHex = '#44cc66';
      break;
  }
  return base;
}

export function createGrandCriteriumRacers(playerFtpW: number): RacerProfile[] {
  // Combine all spoke bosses into one race
  return [
    createSpokeBoss('plains', playerFtpW),
    createSpokeBoss('mountain', playerFtpW),
    createSpokeBoss('coast', playerFtpW),
    createSpokeBoss('forest', playerFtpW),
    // Add the Phantom as the ultimate leader? Or just the 4 champs.
    // Let's add Le Fantome as a wildcard.
    createBossProfile(playerFtpW)
  ];
}
