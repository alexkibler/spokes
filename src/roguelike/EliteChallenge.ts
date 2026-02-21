/**
 * EliteChallenge.ts
 *
 * Data types and challenge pool for Elite nodes.
 * Challenge evaluation logic is future work — this module defines the
 * structures consumed by the map generator, dialog UI, and eventually GameScene.
 */

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
      'Complete this segment with average power above 110% of your FTP ({ftp_watts} W).',
    condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.10 },
    reward: { type: 'gold', goldAmount: 60, description: 'earn 60 gold' },
  },
  {
    id: 'sprint_peak',
    title: 'Sprint Finish',
    flavorText:
      'The road levels out and a crowd lines the barriers. A hand-painted sign reads: "Town sprint — 200m." Your legs are fresh. Your ego is not.',
    conditionText:
      'Hit a peak power above 150% of your FTP ({ftp_watts} W) at any point in this segment.',
    condition: { type: 'peak_power_above_ftp_pct', ftpMultiplier: 1.50 },
    reward: { type: 'item', item: 'tailwind', description: 'receive a Tailwind' },
  },
  {
    id: 'no_stop',
    title: 'Clean Ascent',
    flavorText:
      'A rain-slicked cobbled climb stretches ahead. A chalk message on the tarmac reads: "The old code demands you never unclip."',
    conditionText:
      'Complete this segment without coming to a full stop at any point.',
    condition: { type: 'complete_no_stop' },
    reward: { type: 'gold', goldAmount: 40, description: 'earn 40 gold' },
  },
  {
    id: 'time_trial',
    title: 'Time Trial Effort',
    flavorText:
      'Race marshals have chalked a start and finish line across the road. A stopwatch clicks. A crowd of two watches expectantly.',
    conditionText:
      'Complete this segment in under 3 minutes.',
    condition: { type: 'time_under_seconds', timeLimitSeconds: 180 },
    reward: { type: 'gold', goldAmount: 80, description: 'earn 80 gold' },
  },
  {
    id: 'vo2max_ramp',
    title: 'Red Zone Ramp',
    flavorText:
      'The gradient ticks upward with every metre. A painted line on the road reads: "VO₂ or go home." Above it, someone has added: "Please go home."',
    conditionText:
      'Complete this segment with average power above 120% of your FTP ({ftp_watts} W).',
    condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.20 },
    reward: { type: 'gold', goldAmount: 100, description: 'earn 100 gold' },
  },
];

export function getRandomChallenge(): EliteChallenge {
  return ELITE_CHALLENGES[Math.floor(Math.random() * ELITE_CHALLENGES.length)];
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
