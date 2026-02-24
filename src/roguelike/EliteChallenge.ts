/**
 * EliteChallenge.ts
 *
 * Data types, challenge pool, and scoring helpers for Elite nodes.
 */

import { RunManager } from './RunManager';
import { buildCourseProfile, generateCourseProfile, type CourseProfile } from '../course/CourseProfile';

export type ConditionType =
  | 'avg_power_above_ftp_pct'  // Sustain average watts > ftpMultiplier × FTP
  | 'peak_power_above_ftp_pct' // Hit a peak watts > ftpMultiplier × FTP
  | 'complete_no_stop'         // Never drop to zero velocity
  | 'time_under_seconds';      // Finish segment in under timeLimitSeconds

export interface ChallengeCondition {
  type: ConditionType;
  ftpMultiplier?: number;    // e.g. 1.10 = 110% FTP
  timeLimitSeconds?: number; // used with time_under_seconds
}

export type RewardType = 'gold' | 'item';

export interface ChallengeReward {
  type: RewardType;
  goldAmount?: number;
  item?: string;       // item key, e.g. 'tailwind'
  description: string; // human-readable: "earn 60 gold", "receive a Tailwind"
}

export interface EliteChallenge {
  id: string;
  title: string;
  flavorText: string;   // Atmospheric narrative intro
  conditionText: string; // Precise mechanic; use {ftp_watts} for computed threshold
  condition: ChallengeCondition;
  reward: ChallengeReward;
}

export const ELITE_CHALLENGES: EliteChallenge[] = [
  {
    id: 'sustained_threshold',
    title: 'Threshold Push',
    flavorText:
      'A steep switchback cuts across the ridge. A local rival blocks the road and sneers: "Bet you can\'t hold threshold the whole way up."',
    conditionText:
      'Complete this ride with average power above 125% of your FTP ({ftp_watts} W).',
    condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.25 },
    reward: { type: 'gold', goldAmount: 120, description: 'earn 120 gold' },
  },
  {
    id: 'sprint_peak',
    title: 'Sprint Finish',
    flavorText:
      'The road levels out and a crowd lines the barriers. A hand-painted sign reads: "Town sprint — 200m." Your legs are fresh. Your ego is not.',
    conditionText:
      'Hit a peak power above 250% of your FTP ({ftp_watts} W) at any point during this ride.',
    condition: { type: 'peak_power_above_ftp_pct', ftpMultiplier: 2.50 },
    reward: { type: 'item', item: 'tailwind', description: 'receive a Tailwind' },
  },
  {
    id: 'no_stop',
    title: 'Clean Ascent',
    flavorText:
      'A rain-slicked cobbled climb stretches ahead. A chalk message on the tarmac reads: "The old code demands you never unclip."',
    conditionText:
      'Complete this ride without coming to a full stop at any point.',
    condition: { type: 'complete_no_stop' },
    reward: { type: 'gold', goldAmount: 40, description: 'earn 40 gold' },
  },
  {
    id: 'time_trial',
    title: 'Time Trial Effort',
    flavorText:
      'Race marshals have chalked a start and finish line across the road. A stopwatch clicks. A crowd of two watches expectantly.',
    conditionText:
      'Complete this ride in under 2 minutes.',
    condition: { type: 'time_under_seconds', timeLimitSeconds: 120 },
    reward: { type: 'gold', goldAmount: 150, description: 'earn 150 gold' },
  },
  {
    id: 'vo2max_ramp',
    title: 'Red Zone Ramp',
    flavorText:
      'The gradient ticks upward with every metre. A painted line on the road reads: "VO₂ or go home." Above it, someone has added: "Please go home."',
    conditionText:
      'Complete this ride with average power above 140% of your FTP ({ftp_watts} W).',
    condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.40 },
    reward: { type: 'gold', goldAmount: 200, description: 'earn 200 gold' },
  },
];

export function getRandomChallenge(): EliteChallenge {
  return ELITE_CHALLENGES[Math.floor(Math.random() * ELITE_CHALLENGES.length)];
}

export interface ChallengeMetrics {
  avgPowerW: number;
  peakPowerW: number;
  ftpW: number;
  everStopped: boolean;
  elapsedSeconds: number;
}

/**
 * Returns true if the rider satisfied the challenge condition.
 */
export function evaluateChallenge(
  challenge: EliteChallenge,
  metrics: ChallengeMetrics,
): boolean {
  const { type, ftpMultiplier, timeLimitSeconds } = challenge.condition;
  switch (type) {
    case 'avg_power_above_ftp_pct':
      return ftpMultiplier !== undefined &&
        metrics.avgPowerW >= metrics.ftpW * ftpMultiplier;
    case 'peak_power_above_ftp_pct':
      return ftpMultiplier !== undefined &&
        metrics.peakPowerW >= metrics.ftpW * ftpMultiplier;
    case 'complete_no_stop':
      return !metrics.everStopped;
    case 'time_under_seconds':
      return timeLimitSeconds !== undefined &&
        metrics.elapsedSeconds < timeLimitSeconds;
  }
}

/**
 * Applies the challenge reward to RunManager.
 * Call only when evaluateChallenge returns true.
 */
export function grantChallengeReward(challenge: EliteChallenge, runManager: RunManager): void {
  const { reward } = challenge;
  if (reward.type === 'gold' && reward.goldAmount !== undefined) {
    runManager.addGold(reward.goldAmount);
  } else if (reward.type === 'item' && reward.item !== undefined) {
    runManager.addToInventory(reward.item);
  }
}

/**
 * Generates a challenge-specific CourseProfile tailored to the elite challenge type.
 * Each challenge gets terrain that naturally rewards the target behavior.
 */
export function generateEliteCourseProfile(challenge: EliteChallenge): CourseProfile {
  switch (challenge.id) {
    case 'sustained_threshold':
      // Long sustained climb — forces threshold output throughout
      return buildCourseProfile([
        { distanceM: 200,  grade: 0,    surface: 'asphalt' },
        { distanceM: 600,  grade: 0.05, surface: 'asphalt' },
        { distanceM: 1000, grade: 0.07, surface: 'asphalt' },
        { distanceM: 400,  grade: 0.06, surface: 'gravel'  },
        { distanceM: 200,  grade: 0,    surface: 'asphalt' },
      ]);

    case 'sprint_peak':
      // Mostly flat with a short steep kick for the sprint — rewards explosive power
      return buildCourseProfile([
        { distanceM: 600,  grade: 0,    surface: 'asphalt' },
        { distanceM: 200,  grade: 0.02, surface: 'asphalt' },
        { distanceM: 100,  grade: 0.08, surface: 'asphalt' },  // sprint trigger point
        { distanceM: 200,  grade: 0,    surface: 'asphalt' },
      ]);

    case 'no_stop':
      // Rolling mixed terrain with descents — momentum is your friend
      return buildCourseProfile([
        { distanceM: 200,  grade: 0.03,  surface: 'asphalt' },
        { distanceM: 400,  grade: -0.04, surface: 'asphalt' },
        { distanceM: 300,  grade: 0.05,  surface: 'gravel'  },
        { distanceM: 500,  grade: -0.03, surface: 'gravel'  },
        { distanceM: 300,  grade: 0.04,  surface: 'dirt'    },
        { distanceM: 300,  grade: -0.02, surface: 'asphalt' },
        { distanceM: 200,  grade: 0,     surface: 'asphalt' },
      ]);

    case 'time_trial':
      // Short, slightly downhill TT course — go as fast as possible
      return buildCourseProfile([
        { distanceM: 150,  grade: 0,     surface: 'asphalt' },
        { distanceM: 700,  grade: -0.01, surface: 'asphalt' },
        { distanceM: 150,  grade: 0,     surface: 'asphalt' },
      ]);

    case 'vo2max_ramp':
      // Steep ramp that gets steeper — punishes anyone who starts too easy
      return buildCourseProfile([
        { distanceM: 200,  grade: 0,    surface: 'asphalt' },
        { distanceM: 500,  grade: 0.07, surface: 'asphalt' },
        { distanceM: 500,  grade: 0.10, surface: 'asphalt' },
        { distanceM: 500,  grade: 0.12, surface: 'gravel'  },
        { distanceM: 200,  grade: 0,    surface: 'asphalt' },
      ]);

    default:
      return generateCourseProfile(2, 0.06, 'asphalt');
  }
}

/**
 * Resolves the {ftp_watts} placeholder in a challenge's conditionText using
 * the rider's actual FTP. Returns the formatted string ready for display.
 */
export function formatChallengeText(challenge: EliteChallenge, ftpW: number): string {
  let text = challenge.conditionText;
  const mult = challenge.condition.ftpMultiplier;
  if (mult !== undefined) {
    const threshold = Math.round(ftpW * mult);
    text = text.replace('{ftp_watts}', String(threshold));
  }
  return text;
}
