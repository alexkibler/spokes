import Phaser from 'phaser';
import type { RacerProfile } from '../../race/RacerProfile';
import {
  draftFactor,
  DRAFT_MAX_CDA_REDUCTION,
  DRAFT_MIN_CDA_REDUCTION,
} from '../../physics/DraftingPhysics';

function computeKnee(
  hipX: number, hipY: number,
  footX: number, footY: number,
  upperLen: number, lowerLen: number,
  kneeSide: 1 | -1,
): [number, number] {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const dist = Math.hypot(dx, dy);
  const total = upperLen + lowerLen;

  if (dist >= total - 0.01) {
    const t = upperLen / total;
    return [hipX + dx * t, hipY + dy * t];
  }

  const cosA = (dist * dist + upperLen * upperLen - lowerLen * lowerLen)
    / (2 * dist * upperLen);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const kneeAngle = Math.atan2(dy, dx) + kneeSide * angleA;

  return [
    hipX + Math.cos(kneeAngle) * upperLen,
    hipY + Math.sin(kneeAngle) * upperLen,
  ];
}

export interface RenderableGhost {
  distanceM: number;
  crankAngle: number;
  racer: RacerProfile;
  graphics: Phaser.GameObjects.Graphics;
}

export interface PlayerState {
  distanceM: number;
  crankAngle: number;
  draftAnimOffset: number;
  isBackwards: boolean;
}

export class CyclistRenderer {
  private scene: Phaser.Scene;
  private worldContainer: Phaser.GameObjects.Container;
  private cyclistGraphics: Phaser.GameObjects.Graphics;
  private slipstreamGraphics: Phaser.GameObjects.Graphics;

  private static readonly WHEEL_R = 18;

  constructor(scene: Phaser.Scene, worldContainer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.worldContainer = worldContainer;

    // Create graphics for the main cyclist
    this.cyclistGraphics = this.scene.add.graphics();
    this.worldContainer.add(this.cyclistGraphics);

    // Create graphics for slipstream
    this.slipstreamGraphics = this.scene.add.graphics();
    this.worldContainer.add(this.slipstreamGraphics);
  }

  public render(player: PlayerState, ghosts: RenderableGhost[], cycGroundY: number): void {
    if (player.isBackwards) {
      this.cyclistGraphics.setScale(-1, 1);
    } else {
      this.cyclistGraphics.setScale(1, 1);
    }

    this.drawCyclist(player.crankAngle, cycGroundY);

    if (ghosts.length > 0) {
      this.drawAllGhosts(player, ghosts, cycGroundY);
      this.drawSlipstream(player, ghosts, cycGroundY);
    } else {
        this.slipstreamGraphics.clear();
    }
  }

  private drawCyclist(crankAngle: number, cycGroundY: number): void {
    this.cyclistGraphics.clear();
    this.drawCyclistShape(this.cyclistGraphics, crankAngle, cycGroundY, 0x2a2018, 0x5a3a1a, 0xc49a6a);
  }

  private drawAllGhosts(player: PlayerState, ghosts: RenderableGhost[], cycGroundY: number): void {
    for (const ghost of ghosts) {
      const gapM = ghost.distanceM - player.distanceM;
      const alpha = Math.abs(gapM) < 80 ? 0.72 : Math.max(0, 0.72 * (1 - (Math.abs(gapM) - 80) / 170));
      ghost.graphics.setAlpha(alpha);
      if (alpha < 0.01) { ghost.graphics.clear(); continue; }
      const offsetX = Math.tanh(gapM / 120) * 280;
      ghost.graphics.setPosition(offsetX, 0).clear();
      this.drawCyclistShape(ghost.graphics, ghost.crankAngle, cycGroundY, ghost.racer.color, ghost.racer.color & 0xaaaaaa, 0xddeeff);
    }
  }

  private drawSlipstream(player: PlayerState, ghosts: RenderableGhost[], gY: number): void {
    const g = this.slipstreamGraphics.clear();

    // All visible riders: player at offsetX=0, each ghost at its visual offset
    const riders = [
      { distanceM: player.distanceM, offsetX: 0 },
      ...ghosts.map(gh => ({
        distanceM: gh.distanceM,
        offsetX: Math.tanh((gh.distanceM - player.distanceM) / 120) * 280,
      })),
    ];

    for (let i = 0; i < riders.length; i++) {
      for (let j = 0; j < riders.length; j++) {
        if (i === j) continue;
        const trail = riders[i];
        const lead  = riders[j];
        const gap   = lead.distanceM - trail.distanceM;
        const df    = draftFactor(gap); // 0 if out of range
        if (df <= 0) continue;

        const trailX = trail.offsetX;
        const leadX  = lead.offsetX;
        if (leadX <= trailX + 4) continue; // no visual room

        // Normalised intensity 0→1 across the draft range
        const intensity = (df - DRAFT_MIN_CDA_REDUCTION) /
          (DRAFT_MAX_CDA_REDUCTION - DRAFT_MIN_CDA_REDUCTION);

        const span   = leadX - trailX;
        // Lines scroll from lead toward trail at ~road speed
        const scroll = player.draftAnimOffset % span;

        // 7 speed-line rows at different heights through the rider silhouette
        const rows: Array<{ y: number; thick: number; color: number; alphaMult: number }> = [
          { y: gY - 38, thick: 1.0, color: 0xcceeff, alphaMult: 0.40 },
          { y: gY - 32, thick: 1.5, color: 0xaaddff, alphaMult: 0.70 },
          { y: gY - 26, thick: 2.0, color: 0x88ccff, alphaMult: 1.00 },
          { y: gY - 20, thick: 2.5, color: 0x88ccff, alphaMult: 1.00 },
          { y: gY - 14, thick: 2.0, color: 0xaaddff, alphaMult: 0.80 },
          { y: gY -  8, thick: 1.5, color: 0xcceeff, alphaMult: 0.55 },
          { y: gY -  2, thick: 1.0, color: 0xddeeFF, alphaMult: 0.30 },
        ];

        // Number of lines scales with intensity (2 at minimum, 6 at full draft)
        const numLines = Math.round(2 + intensity * 4);
        const lineLen  = 12 + intensity * 20; // longer lines = stronger draft
        const spacing  = span / numLines;

        for (const row of rows) {
          const baseAlpha = 0.08 + 0.42 * intensity * row.alphaMult;
          for (let k = 0; k < numLines; k++) {
            // Position animated so lines stream from lead to trail
            const rawX = leadX - scroll - k * spacing;
            // Clamp to the gap zone
            if (rawX - lineLen < trailX - 4 || rawX > leadX + 4) continue;
            const x0 = Math.max(trailX, rawX - lineLen);
            const x1 = Math.min(leadX,  rawX);
            if (x1 <= x0) continue;
            // Taper: brighter near the leader, fading toward the trailer
            const t = (rawX - trailX) / span; // 0=near trailer, 1=near lead
            const lineAlpha = baseAlpha * (0.3 + 0.7 * t);
            g.lineStyle(row.thick, row.color, lineAlpha);
            g.beginPath().moveTo(x0, row.y).lineTo(x1, row.y).strokePath();
          }
        }
      }
    }
  }

  private drawCyclistShape(g: Phaser.GameObjects.Graphics, crankAngle: number, gY: number, BIKE: number, JERSEY: number, SKIN: number): void {
    const wR = CyclistRenderer.WHEEL_R, axleY = gY - wR;
    const rearX = -22, frontX = 26, crankX = 0, crankY = axleY, crankLen = 9;
    const seatX = -5, seatY = axleY - 35, hbarX = 22, hbarY = axleY - 33;
    const hipX = -2, hipY = axleY - 30, shoulderX = 14, shoulderY = axleY - 43;
    const headX = 22, headY = axleY - 53, headR = 7;
    const upperLen = 22, lowerLen = 19;
    const rA = crankAngle, lA = crankAngle + Math.PI;
    const rFX = crankX + Math.cos(rA) * crankLen, rFY = crankY + Math.sin(rA) * crankLen;
    const lFX = crankX + Math.cos(lA) * crankLen, lFY = crankY + Math.sin(lA) * crankLen;
    const [rKX, rKY] = computeKnee(hipX, hipY, rFX, rFY, upperLen, lowerLen, -1);
    const [lKX, lKY] = computeKnee(hipX, hipY, lFX, lFY, upperLen, lowerLen, -1);

    g.lineStyle(4, BIKE, 0.38); g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(lKX, lKY); g.lineTo(lFX, lFY); g.strokePath();
    g.fillStyle(BIKE, 0.38); g.fillRect(lFX - 5, lFY - 1.5, 10, 3);
    g.lineStyle(3, BIKE, 1); g.strokeCircle(rearX, axleY, wR);
    g.lineStyle(1.5, BIKE, 0.45); g.strokeCircle(rearX, axleY, wR * 0.55); g.fillStyle(BIKE, 1); g.fillCircle(rearX, axleY, 2.5);
    g.lineStyle(3, BIKE, 1); g.beginPath(); g.moveTo(rearX, axleY); g.lineTo(crankX, crankY + 2); g.strokePath();
    g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(seatX, seatY); g.strokePath();
    g.beginPath(); g.moveTo(seatX, seatY); g.lineTo(hbarX, hbarY); g.strokePath();
    g.beginPath(); g.moveTo(hbarX - 2, hbarY + 8); g.lineTo(crankX, crankY); g.strokePath();
    g.beginPath(); g.moveTo(hbarX, hbarY); g.lineTo(frontX, axleY); g.strokePath();
    g.lineStyle(4, BIKE, 1); g.beginPath(); g.moveTo(seatX - 6, seatY); g.lineTo(seatX + 8, seatY); g.strokePath();
    g.lineStyle(3, BIKE, 1); g.strokeCircle(frontX, axleY, wR);
    g.lineStyle(1.5, BIKE, 0.45); g.strokeCircle(frontX, axleY, wR * 0.55); g.fillStyle(BIKE, 1); g.fillCircle(frontX, axleY, 2.5);
    g.lineStyle(3, BIKE, 1); g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(rFX, rFY); g.strokePath();
    g.lineStyle(2.5, BIKE, 0.5); g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(lFX, lFY); g.strokePath();
    g.lineStyle(2, BIKE, 0.7); g.strokeCircle(crankX, crankY, 6);
    g.lineStyle(5, BIKE, 1); g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(rKX, rKY); g.lineTo(rFX, rFY); g.strokePath();
    g.fillStyle(BIKE, 1); g.fillRect(rFX - 5, rFY - 1.5, 10, 3);
    g.fillStyle(JERSEY, 1); g.fillPoints([{ x: hipX - 2, y: hipY }, { x: hipX + 5, y: hipY - 2 }, { x: shoulderX, y: shoulderY }, { x: shoulderX - 5, y: shoulderY + 4 }], true);
    g.lineStyle(3, SKIN, 1); g.beginPath(); g.moveTo(shoulderX - 1, shoulderY + 2); g.lineTo(hbarX, hbarY + 1); g.strokePath();
    g.fillStyle(SKIN, 1); g.fillCircle(headX, headY, headR);
    g.fillStyle(JERSEY, 1); g.fillPoints([{ x: headX - headR + 1, y: headY }, { x: headX - headR + 1, y: headY - headR * 0.5 }, { x: headX, y: headY - headR - 2 }, { x: headX + headR, y: headY - headR * 0.5 }, { x: headX + headR, y: headY }], true);
  }
}
