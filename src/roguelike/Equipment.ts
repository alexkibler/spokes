/**
 * Equipment.ts
 *
 * Defines the equipment slots, stats, and database of items.
 */

export type EquipmentSlot =
  | 'head'
  | 'body'
  | 'shoes'
  | 'frame'
  | 'wheels'
  | 'tires'
  | 'driveset'
  | 'cockpit';

export interface EquipmentStats {
  /** Additive mass modifier (kg) */
  mass_add?: number;
  /** Additive CdA modifier (m²) */
  cdA_add?: number;
  /** Additive Crr modifier */
  crr_add?: number;
  /** Multiplicative power modifier (1.0 = baseline) */
  powerMult?: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  description: string;
  stats: EquipmentStats;
}

export const EQUIPMENT_DATABASE: Record<string, EquipmentItem> = {
  // ── Head (Aerodynamics vs. Weight) ─────────────────────────────────────────
  'foam_helmet': {
    id: 'foam_helmet',
    name: 'Foam Commuter Helmet',
    slot: 'head',
    description: 'Basic protection. Not very aero.',
    stats: { mass_add: 0.2, cdA_add: 0.00 },
  },
  'vented_helmet': {
    id: 'vented_helmet',
    name: 'Vented Road Helmet',
    slot: 'head',
    description: 'Better airflow, slightly more aero.',
    stats: { mass_add: 0.2, cdA_add: -0.01 },
  },
  'aero_helmet': {
    id: 'aero_helmet',
    name: 'Aero Helmet',
    slot: 'head',
    description: 'Sleek design to cut through the wind.',
    stats: { mass_add: 0.3, cdA_add: -0.02 },
  },
  'teardrop_helmet': {
    id: 'teardrop_helmet',
    name: 'Teardrop TT Helmet',
    slot: 'head',
    description: 'Maximum aerodynamics, but heavier.',
    stats: { mass_add: 0.4, cdA_add: -0.04 },
  },

  // ── Body (Aerodynamics) ────────────────────────────────────────────────────
  'jeans_tshirt': {
    id: 'jeans_tshirt',
    name: 'Jeans and T-Shirt',
    slot: 'body',
    description: 'Casual wear. Acts like a parachute.',
    stats: { mass_add: 0.5, cdA_add: 0.04 },
  },
  'basic_kit': {
    id: 'basic_kit',
    name: 'Basic Cycling Kit',
    slot: 'body',
    description: 'Standard lycra kit.',
    stats: { mass_add: 0.2, cdA_add: 0.00 },
  },
  'elite_skinsuit': {
    id: 'elite_skinsuit',
    name: 'Elite Skinsuit',
    slot: 'body',
    description: 'Skin-tight for minimal drag.',
    stats: { mass_add: 0.1, cdA_add: -0.03 },
  },

  // ── Shoes (Power Transfer Efficiency) ──────────────────────────────────────
  'flip_flops': {
    id: 'flip_flops',
    name: 'Flip Flops',
    slot: 'shoes',
    description: 'Terrible for cycling.',
    stats: { mass_add: 0.1, powerMult: 0.85 },
  },
  'sneakers': {
    id: 'sneakers',
    name: 'Sneakers',
    slot: 'shoes',
    description: 'Comfortable, but soft soles absorb power.',
    stats: { mass_add: 0.4, powerMult: 0.95 },
  },
  'cycling_shoes': {
    id: 'cycling_shoes',
    name: 'Cycling Shoes',
    slot: 'shoes',
    description: 'Stiff soles for good power transfer.',
    stats: { mass_add: 0.3, powerMult: 1.00 },
  },
  'carbon_shoes': {
    id: 'carbon_shoes',
    name: 'Carbon Cycling Shoes',
    slot: 'shoes',
    description: 'Ultra-stiff carbon soles.',
    stats: { mass_add: 0.2, powerMult: 1.05 },
  },

  // ── Frame (Base Weight & Stiffness) ────────────────────────────────────────
  'rusty_frame': {
    id: 'rusty_frame',
    name: 'Rusty Scrapyard Frame',
    slot: 'frame',
    description: 'Heavy and flexible.',
    stats: { mass_add: 4.0, powerMult: 0.98 },
  },
  'steel_frame': {
    id: 'steel_frame',
    name: 'Steel Frame',
    slot: 'frame',
    description: 'Reliable and repairable, but heavy.',
    stats: { mass_add: 2.0, cdA_add: 0.01 },
  },
  'aluminum_crit_frame': {
    id: 'aluminum_crit_frame',
    name: 'Aluminum Crit Frame',
    slot: 'frame',
    description: 'Stiff and reasonably light.',
    stats: { mass_add: 1.0, cdA_add: 0.00 },
  },
  'carbon_frame': {
    id: 'carbon_frame',
    name: 'Carbon Frame',
    slot: 'frame',
    description: 'Lightweight and aerodynamic.',
    stats: { mass_add: -1.5, cdA_add: -0.01 },
  },
  'titanium_frame': {
    id: 'titanium_frame',
    name: 'Bespoke Titanium',
    slot: 'frame',
    description: 'Magic metal ride quality.',
    stats: { mass_add: -1.0, powerMult: 1.02 },
  },

  // ── Wheels (Rotating Mass & Aero) ──────────────────────────────────────────
  'bent_steel_wheels': {
    id: 'bent_steel_wheels',
    name: 'Bent Steel Hoops',
    slot: 'wheels',
    description: 'Heavy and out of true.',
    stats: { mass_add: 1.5, cdA_add: 0.01, crr_add: 0.001 },
  },
  'aluminum_box_wheels': {
    id: 'aluminum_box_wheels',
    name: 'Aluminum Box',
    slot: 'wheels',
    description: 'Standard training wheels.',
    stats: { mass_add: 0.0, cdA_add: 0.00 },
  },
  'shallow_carbon_rims': {
    id: 'shallow_carbon_rims',
    name: 'Shallow Carbon Rims',
    slot: 'wheels',
    description: 'Lightweight climbing wheels.',
    stats: { mass_add: -0.8, cdA_add: -0.01 },
  },
  'deep_aero_wheels': {
    id: 'deep_aero_wheels',
    name: 'Deep-Section Aero',
    slot: 'wheels',
    description: 'Fast on the flats.',
    stats: { mass_add: -0.2, cdA_add: -0.03 },
  },

  // ── Tires (Rolling Resistance) ─────────────────────────────────────────────
  'puncture_proof_tires': {
    id: 'puncture_proof_tires',
    name: 'Puncture-Proof Commuters',
    slot: 'tires',
    description: 'Thick rubber, high resistance.',
    stats: { mass_add: 0.4, crr_add: 0.002 },
  },
  'slicks': {
    id: 'slicks',
    name: '28mm Slicks',
    slot: 'tires',
    description: 'Standard road tires.',
    stats: { mass_add: 0.0, crr_add: 0.000 },
  },
  'race_tubeless': {
    id: 'race_tubeless',
    name: 'Race-Day Tubeless',
    slot: 'tires',
    description: 'Supple and fast.',
    stats: { mass_add: -0.1, crr_add: -0.0015 },
  },
  'gravel_knobbies': {
    id: 'gravel_knobbies',
    name: 'Roubaix Gravel Knobbies',
    slot: 'tires',
    description: 'Good for rough roads, slower on smooth tarmac.',
    stats: { mass_add: 0.2, crr_add: 0.0015 },
  },

  // ── Driveset (Power Transfer) ──────────────────────────────────────────────
  'rusted_fixie': {
    id: 'rusted_fixie',
    name: 'Rusted Fixie',
    slot: 'driveset',
    description: 'Inefficient and limited.',
    stats: { mass_add: 0.5, powerMult: 0.90 },
  },
  'budget_3x7': {
    id: 'budget_3x7',
    name: 'Budget 3x7',
    slot: 'driveset',
    description: 'Heavy and clunky shifting.',
    stats: { mass_add: 0.8, powerMult: 0.95 },
  },
  'road_2x11': {
    id: 'road_2x11',
    name: '2x11 Road',
    slot: 'driveset',
    description: 'Standard road groupset.',
    stats: { mass_add: 0.0, powerMult: 1.00 },
  },
  'electronic_2x12': {
    id: 'electronic_2x12',
    name: '2x12 Electronic',
    slot: 'driveset',
    description: 'Precise shifting, slight efficiency gain.',
    stats: { mass_add: -0.2, powerMult: 1.04 },
  },

  // ── Cockpit (Posture Profile) ──────────────────────────────────────────────
  'beach_cruiser_bars': {
    id: 'beach_cruiser_bars',
    name: 'Beach Cruiser Bars',
    slot: 'cockpit',
    description: 'Upright and comfortable, but very draggy.',
    stats: { mass_add: 0.5, cdA_add: 0.06 },
  },
  'flat_bar_mtb': {
    id: 'flat_bar_mtb',
    name: 'Flat Bar MTB',
    slot: 'cockpit',
    description: 'Wide grip, poor aerodynamics.',
    stats: { mass_add: 0.2, cdA_add: 0.03 },
  },
  'drop_bars': {
    id: 'drop_bars',
    name: 'Standard Drop Bars',
    slot: 'cockpit',
    description: 'Allows for a lower position.',
    stats: { mass_add: 0.0, cdA_add: 0.00 },
  },
  'integrated_carbon': {
    id: 'integrated_carbon',
    name: 'Integrated Carbon',
    slot: 'cockpit',
    description: 'Aero-shaped bars and stem.',
    stats: { mass_add: -0.2, cdA_add: -0.015 },
  },
  'tt_extensions': {
    id: 'tt_extensions',
    name: 'TT Aero Extensions',
    slot: 'cockpit',
    description: 'Extreme aero position.',
    stats: { mass_add: 0.3, cdA_add: -0.04 },
  },
};
