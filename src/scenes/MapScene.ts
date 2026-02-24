/**
 * MapScene.ts
 * 
 * Roguelike map traversal scene.
 * Procedurally generates a DAG of nodes (rides, shops, etc.).
 */

import Phaser from 'phaser';
import { RunStateManager, type MapNode, type MapEdge, type NodeType, type ModifierLogEntry } from '../roguelike/RunState';
import { generateCourseProfile, invertCourseProfile, type SurfaceType, type CourseProfile } from '../course/CourseProfile';
import { generateHubAndSpokeMap, type SpokeId } from '../course/CourseGenerator';
import { getRandomChallenge, generateEliteCourseProfile, type EliteChallenge } from '../roguelike/EliteChallenge';
import type { Units } from './MenuScene';
import { RemoteService } from '../services/RemoteService';
import { SessionService } from '../services/SessionService';
import { createBossRacers, type RacerProfile } from '../race/RacerProfile';
import { THEME } from '../theme';
import { ShopOverlay } from './ui/ShopOverlay';
import { EventOverlay } from './ui/EventOverlay';
import { EliteChallengeOverlay } from './ui/EliteChallengeOverlay';
import { EquipmentOverlay } from './ui/EquipmentOverlay';
import { RemotePairingOverlay } from './ui/RemotePairingOverlay';

const SURFACE_LABELS: Record<SurfaceType, string> = {
  asphalt: 'ASPHALT',
  gravel:  'GRAVEL',
  dirt:    'DIRT',
  mud:     'MUD',
};

const NODE_ICONS: Record<NodeType, string> = {
  start:    '⌂', // Hub
  standard: 'R',
  hard:     'H',
  shop:     '$',
  event:    '?',
  elite:    '★',
  finish:   '☠', // Final Boss
  boss:     '⚔', // Spoke Boss
};

const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  start:    'BASE CAMP',
  standard: 'RIDE',
  hard:     'HARD RIDE',
  shop:     'SHOP',
  event:    'EVENT',
  elite:    'ELITE CHALLENGE',
  finish:   'GRAND CRITERIUM',
  boss:     'SPOKE CHAMPION',
};

export class MapScene extends Phaser.Scene {
  private units: Units = 'imperial';
  private isDevMode = false;

  private ftpW = 200;

  private mapContainer!: Phaser.GameObjects.Container;
  private graphics!: Phaser.GameObjects.Graphics;
  private nodeObjects = new Map<string, Phaser.GameObjects.Container>();
  private edgeObjects = new Map<string, Phaser.GameObjects.Rectangle>();

  private tooltipContainer!: Phaser.GameObjects.Container;
  private tooltipText!: Phaser.GameObjects.Text;
  private statsContainer!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;

  private isTeleportMode = false;
  private teleportBg:  Phaser.GameObjects.Rectangle | null = null;
  private teleportTxt: Phaser.GameObjects.Text | null = null;
  private devToggleBg:  Phaser.GameObjects.Rectangle | null = null;
  private devToggleTxt: Phaser.GameObjects.Text | null = null;
  private gearBtnBg:   Phaser.GameObjects.Rectangle | null = null;
  private gearBtnTxt:  Phaser.GameObjects.Text | null = null;
  private remoteBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private remoteBtnTxt: Phaser.GameObjects.Text | null = null;
  private returnBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private returnBtnTxt: Phaser.GameObjects.Text | null = null;

  private static readonly FLOOR_SPACING = 80;
  private isDragging = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private overlayActive = false;

  private focusedNodeId: string | null = null;
  private onRemoteCursorMoveBound = this.onRemoteCursorMove.bind(this);
  private onRemoteCursorSelectBound = this.onRemoteCursorSelect.bind(this);

  constructor() {
    super({ key: 'MapScene' });
  }

  init(): void {
    this.units    = SessionService.units;
    this.isDevMode = RunStateManager.getDevMode();
    this.ftpW = RunStateManager.getRun()?.ftpW ?? 200;

    const run = RunStateManager.getRun();
    if (run && run.nodes.length === 0) {
      this.generateMap(run);
      const startNode = run.nodes.find((n: MapNode) => n.type === 'start');
      if (startNode) RunStateManager.setCurrentNode(startNode.id);
    }
  }

  private get virtualHeight(): number {
    // For Hub-and-Spoke, we can just use the screen height or a fixed larger area.
    // Since coordinates are 0-1, let's map them to a square area that fits.
    // Or just 1.2x screen height to allow a little scrolling if needed?
    // Actually, let's just use screen height for now, or slightly larger to avoid cramping.
    return Math.max(this.scale.height, 600);
  }

  create(): void {
    this.nodeObjects.clear();
    this.edgeObjects.clear();
    this.cameras.main.setBackgroundColor(THEME.colors.backgroundHex);

    this.mapContainer = this.add.container(0, 0);
    this.graphics = this.add.graphics();
    this.mapContainer.add(this.graphics);

    // Initialize focus
    const run = RunStateManager.getRun();
    if (run) {
        if (run.currentNodeId) {
            this.focusedNodeId = run.currentNodeId;
        } else {
            const start = run.nodes.find(n => n.type === 'start');
            this.focusedNodeId = start ? start.id : (run.nodes[0]?.id ?? null);
        }
    }

    this.drawMap();

    this.add.text(this.scale.width / 2, 30, 'ROGUELIKE RUN', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.hero,
      color: THEME.colors.text.dark,
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    this.goldText = this.add.text(this.scale.width - 20, 20, `GOLD: ${run?.gold ?? 0}`, {
      fontFamily: THEME.fonts.main, fontSize: '20px', color: THEME.colors.text.gold, fontStyle: 'bold',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);

    this.buildStatsPanel();
    this.buildStatsBar();
    this.createTooltip();
    this.setupScrolling();

    this.buildDevToggle();
    this.buildGearButton();
    this.buildRemoteButton();
    this.buildReturnButton();

    this.scale.on('resize', this.onResize, this);

    const vh = this.virtualHeight;
    this.cameras.main.setBounds(0, 0, this.scale.width, vh);
    this.scrollToCurrentNode();

    this.checkPendingNodeAction();

    RemoteService.getInstance().onCursorMove(this.onRemoteCursorMoveBound);
    RemoteService.getInstance().onCursorSelect(this.onRemoteCursorSelectBound);
  }

  private setupScrolling(): void {
    const cam = this.cameras.main;
    // Track where the pointer went down without committing to drag until a
    // threshold is exceeded.  This prevents a node click from accidentally
    // scrolling the map when the pointer drifts a pixel on release.
    let potentialDragStartY: number | null = null;
    const DRAG_THRESHOLD = 5;

    this.input.on('wheel', (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
      if (this.overlayActive) return;
      const maxScroll = Math.max(0, this.virtualHeight - this.scale.height);
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + dy * 0.8, 0, maxScroll);
    });

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.overlayActive) return;
      potentialDragStartY = ptr.y;
      this.dragStartY = ptr.y;
      this.dragStartScrollY = cam.scrollY;
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (potentialDragStartY === null) return;
      if (!this.isDragging && Math.abs(ptr.y - potentialDragStartY) > DRAG_THRESHOLD) {
        this.isDragging = true;
      }
      if (!this.isDragging) return;
      const delta = this.dragStartY - ptr.y;
      const maxScroll = Math.max(0, this.virtualHeight - this.scale.height);
      cam.scrollY = Phaser.Math.Clamp(this.dragStartScrollY + delta, 0, maxScroll);
    });
    this.input.on('pointerup', () => {
      this.isDragging = false;
      potentialDragStartY = null;
    });
  }

  private scrollToCurrentNode(): void {
    const run = RunStateManager.getRun();
    if (run?.currentNodeId) {
        this.scrollToNode(run.currentNodeId);
    } else {
        // Center view
        const vh = this.virtualHeight;
        const sh = this.scale.height;
        this.cameras.main.scrollY = (vh - sh) / 2;
    }
  }

  private scrollToNode(nodeId: string): void {
      const run = RunStateManager.getRun();
      const node = run?.nodes.find(n => n.id === nodeId);
      if (node) {
        const vh = this.virtualHeight;
        const sh = this.scale.height;
        const maxScroll = Math.max(0, vh - sh);
        const worldY = node.y * vh;
        this.cameras.main.scrollY = Phaser.Math.Clamp(worldY - sh / 2, 0, maxScroll);
      }
  }

  private updateGoldUI(): void {
    const run = RunStateManager.getRun();
    if (!run || !this.sys.isActive()) return;

    this.goldText.setText(`GOLD: ${run.gold}`);
    this.goldText.setX(this.scale.width - 20);

    const teleCount = run.inventory.filter(i => i === 'teleport').length;
    const teleX = this.scale.width - 90;

    if (teleCount > 0) {
      if (!this.teleportBg) {
        this.teleportBg = this.add.rectangle(teleX, 60, 160, 30, THEME.colors.buttons.primary)
          .setScrollFactor(0).setDepth(20)
          .setInteractive({ useHandCursor: true });
        this.teleportTxt = this.add.text(teleX, 60, `TELEPORT (${teleCount})`, {
          fontFamily: THEME.fonts.main, fontSize: '12px', color: '#ff88ff', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(21);

        this.teleportBg.on('pointerdown', () => {
          this.isTeleportMode = !this.isTeleportMode;
          this.teleportBg!.setFillStyle(this.isTeleportMode ? 0x884488 : THEME.colors.buttons.primary);
          this.drawMap();
        });
        this.teleportBg.on('pointerover', () =>
          this.teleportBg!.setFillStyle(this.isTeleportMode ? 0x995599 : THEME.colors.buttons.primaryHover));
        this.teleportBg.on('pointerout', () =>
          this.teleportBg!.setFillStyle(this.isTeleportMode ? 0x884488 : THEME.colors.buttons.primary));
      } else {
        this.teleportBg.setVisible(true).setX(teleX);
        this.teleportTxt!.setVisible(true).setX(teleX);
        this.teleportTxt!.setText(this.isTeleportMode ? 'CANCEL TELEPORT' : `TELEPORT (${teleCount})`);
        this.teleportBg.setFillStyle(this.isTeleportMode ? 0x884488 : THEME.colors.buttons.primary);
      }
    } else {
      this.teleportBg?.setVisible(false);
      this.teleportTxt?.setVisible(false);
      if (this.isTeleportMode) {
        this.isTeleportMode = false;
        this.drawMap();
      }
    }
  }

  private onResize(): void {
    if (!this.sys.isActive()) return;
    this.mapContainer.setPosition(0, 0);
    const vh = this.virtualHeight;
    this.cameras.main.setBounds(0, 0, this.scale.width, vh);
    this.drawMap();
    this.updateGoldUI();
    this.buildStatsPanel();
    this.buildReturnButton();
    this.scrollToCurrentNode();
  }

  private generateMap(run: any): void {
    generateHubAndSpokeMap(run);
  }

  private drawMap(): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    this.graphics.clear();
    const w = this.scale.width;
    const h = this.virtualHeight;

    for (const [id, container] of this.nodeObjects.entries()) {
      if (!run.nodes.find(n => n.id === id)) {
        container.destroy();
        this.nodeObjects.delete(id);
      }
    }
    for (const [id, rect] of this.edgeObjects.entries()) {
      const parts = id.split('_to_');
      if (!run.edges.find(e => e.from === parts[0] && e.to === parts[1])) {
        rect.destroy();
        this.edgeObjects.delete(id);
      }
    }

    run.edges.forEach(edge => {
      const fromNode = run.nodes.find(n => n.id === edge.from)!;
      const toNode = run.nodes.find(n => n.id === edge.to)!;
      
      const fx = fromNode.x * w;
      const fy = fromNode.y * h;
      const tx = toNode.x * w;
      const ty = toNode.y * h;

      const surface = edge.profile.segments[0]?.surface ?? 'asphalt';
      const color = THEME.colors.surfaces[surface];
      
      const isConnected = run.currentNodeId === fromNode.id || run.currentNodeId === toNode.id;
      const alpha = isConnected ? 1.0 : 0.4;

      const distKm = edge.profile.totalDistanceM / 1000;
      const baseDot = Math.max(3, Math.min(12, distKm * 1.5));
      const dotSize = isConnected ? baseDot + 2 : baseDot;
      const gap = dotSize * 1.8;
      
      this.graphics.fillStyle(color, alpha);
      if (isConnected) {
        this.graphics.lineStyle(2, 0xffffff, 0.5);
      }
      
      this.drawDottedLine(fx, fy, tx, ty, gap, dotSize);

      const edgeId = `${edge.from}_to_${edge.to}`;
      const dist = Phaser.Math.Distance.Between(fx, fy, tx, ty);
      const angle = Phaser.Math.Angle.Between(fx, fy, tx, ty);
      let rect = this.edgeObjects.get(edgeId);
      if (!rect) {
        rect = this.add.rectangle((fx + tx) / 2, (fy + ty) / 2, dist, 24, 0x000000, 0);
        rect.setRotation(angle);
        rect.setInteractive();
        this.edgeObjects.set(edgeId, rect);
        this.mapContainer.add(rect);
      } else {
        rect.setPosition((fx + tx) / 2, (fy + ty) / 2);
        rect.setSize(dist, 24);
        rect.setRotation(angle);
      }

      const distM = edge.profile.totalDistanceM;
      const distStr = this.units === 'imperial'
        ? `${(distM / 1609.344).toFixed(1)} mi`
        : `${(distM / 1000).toFixed(1)} km`;
      let tipText = `${SURFACE_LABELS[surface]}\n${distStr}`;

      // Hazard Check for Tooltip
      if (fromNode.id === 'node_hub' && toNode.metadata?.spokeId) {
        const spoke = toNode.metadata.spokeId;
        const needsKey = this.getRequiredKeyForSpoke(spoke);
        if (needsKey && !run.inventory.includes(needsKey)) {
          tipText = `⚠ HAZARD ⚠\n${tipText}\nNeed: ${needsKey.replace('_', ' ').toUpperCase()}`;
          // Visual indicator on edge
          this.graphics.fillStyle(0xff0000, 1);
          this.graphics.fillTriangle(
            (fx + tx) / 2, (fy + ty) / 2 - 10,
            (fx + tx) / 2 - 8, (fy + ty) / 2 + 6,
            (fx + tx) / 2 + 8, (fy + ty) / 2 + 6
          );
        }
      }

      rect.off('pointerover').on('pointerover', () => {
        this.showTooltip((fx + tx) / 2, (fy + ty) / 2, tipText);
      });
      rect.off('pointerout').on('pointerout', () => this.hideTooltip());
    });

    run.nodes.forEach(node => {
      let container = this.nodeObjects.get(node.id);
      if (!container) {
        container = this.createNodeUI(node);
        this.nodeObjects.set(node.id, container);
        this.mapContainer.add(container);
      }
      container.setPosition(node.x * w, node.y * h);
      
      const isReachable = this.isNodeReachable(node.id);
      const isCurrent = run.currentNodeId === node.id;
      const isCompleted = node.floor < (run.nodes.find(n => n.id === run.currentNodeId)?.floor ?? -1);
      const isFocused = this.focusedNodeId === node.id;

      const circle = container.getAt(0) as Phaser.GameObjects.Arc;
      
      if (isCurrent) {
        circle.setStrokeStyle(isFocused ? 4 : 4, isFocused ? 0x00ff00 : 0xffffff, 1);
        circle.setScale(1.2);
        circle.setAlpha(1.0);
        circle.disableInteractive();
      } else if (isReachable) {
        const outlineColor = this.isTeleportMode ? 0xff88ff : 0xffd700;
        circle.setStrokeStyle(isFocused ? 4 : 3, isFocused ? 0x00ff88 : outlineColor, 1);
        circle.setScale(isFocused ? 1.3 : 1.1);
        circle.setAlpha(1.0);
        circle.setInteractive({ useHandCursor: true });
      } else if (isCompleted) {
        circle.setStrokeStyle(1, 0x000000, 0.5);
        circle.setScale(0.9);
        circle.setAlpha(0.6);
        circle.disableInteractive();
        if (isFocused) {
            circle.setStrokeStyle(3, 0xaaaaaa, 0.8);
        }
      } else {
        circle.setStrokeStyle(1, 0x000000, 0.3);
        circle.setScale(0.9);
        circle.setAlpha(0.5);
        circle.disableInteractive();
        if (isFocused) {
            circle.setStrokeStyle(3, 0xffaa00, 0.8);
        }
      }
    });
  }

  private drawDottedLine(x1: number, y1: number, x2: number, y2: number, gap: number, size: number): void {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    
    for (let d = 0; d < dist; d += gap) {
      const px = x1 + Math.cos(angle) * d;
      const py = y1 + Math.sin(angle) * d;
      this.graphics.fillCircle(px, py, size / 2);
    }
  }

  private onRemoteCursorMove(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.overlayActive) return;
    const run = RunStateManager.getRun();
    if (!run || !this.focusedNodeId) return;

    const current = run.nodes.find(n => n.id === this.focusedNodeId);
    if (!current) return;

    // Filter candidates
    let candidates = run.nodes.filter(n => n.id !== current.id);

    if (direction === 'up') {
        candidates = candidates.filter(n => n.floor > current.floor);
    } else if (direction === 'down') {
        candidates = candidates.filter(n => n.floor < current.floor);
    } else if (direction === 'left') {
        candidates = candidates.filter(n => n.col < current.col);
    } else if (direction === 'right') {
        candidates = candidates.filter(n => n.col > current.col);
    }

    if (candidates.length === 0) return;

    let closest = candidates[0];
    let minDist = Number.MAX_VALUE;

    candidates.forEach(n => {
        const dx = n.x - current.x;
        const dy = n.y - current.y;
        let score = dx*dx + dy*dy;

        // Bias towards same "lane" for vertical moves, same "floor" for horizontal
        if (direction === 'left' || direction === 'right') {
            score += Math.abs(n.floor - current.floor) * 0.5;
        } else {
            score += Math.abs(n.col - current.col) * 0.1;
        }

        if (score < minDist) {
            minDist = score;
            closest = n;
        }
    });

    this.focusedNodeId = closest.id;
    this.drawMap();
    this.scrollToNode(this.focusedNodeId);
  }

  private onRemoteCursorSelect(): void {
      if (this.overlayActive) return;
      if (!this.focusedNodeId) return;
      const run = RunStateManager.getRun();
      const node = run?.nodes.find(n => n.id === this.focusedNodeId);
      if (node) {
        // Allow clicking even if not reachable? The original onNodeClick handles logic,
        // but typically we only click reachable nodes.
        // However, onNodeClick checks isDevMode etc.
        // Let's call onNodeClick directly, but we should verify reachability if we want to simulate a click.
        // Or just let onNodeClick decide.

        // Wait, onNodeClick is:
        // if (this.isTeleportMode) ...
        // const connectingEdge = ...
        // if (this.isDevMode ...)

        // But the original CLICK handler `circle.on('pointerdown')` checked `isNodeReachable`.
        if (this.isNodeReachable(node.id)) {
             this.onNodeClick(node);
        } else if (this.isDevMode) {
             // In dev mode we can click anything if we want, but logic inside onNodeClick handles it?
             // onNodeClick handles dev mode warp.
             this.onNodeClick(node);
        }
      }
  }

  private buildStatsPanel(): void {
    if (this.statsContainer) this.statsContainer.destroy();

    const run = RunStateManager.getRun();
    const stats = run?.stats;

    const recs = stats?.totalRecordCount ?? 0;
    const avgPowW = recs > 0 ? Math.round(stats!.totalPowerSum / recs) : 0;
    const avgCadRpm = recs > 0 ? Math.round(stats!.totalCadenceSum / recs) : 0;
    const distM = stats?.totalRiddenDistanceM ?? 0;
    const distStr = this.units === 'imperial'
      ? `${(distM / 1609.344).toFixed(2)} mi`
      : `${(distM / 1000).toFixed(2)} km`;

    const currentFloor = run?.nodes.find(n => n.id === run.currentNodeId)?.floor ?? 0;
    const totalFloors = run?.runLength ?? 0;

    const clearedEdges = run?.edges.filter(e => e.isCleared) ?? [];
    const totalElevM = clearedEdges.reduce((sum, edge) =>
      sum + edge.profile.segments.reduce((s, seg) =>
        s + (seg.grade > 0 ? seg.distanceM * seg.grade : 0), 0), 0);
    const elevStr = totalElevM > 0
      ? (this.units === 'imperial'
        ? `${Math.round(totalElevM * 3.28084)} ft`
        : `${Math.round(totalElevM)} m`)
      : '—';

    const rows: [string, string][] = [
      ['DISTANCE',   distM > 0 ? distStr : '—'],
      ['ELEVATION',  elevStr],
      ['AVG POWER',  avgPowW > 0 ? `${avgPowW} W` : '—'],
      ['AVG CADENCE', avgCadRpm > 0 ? `${avgCadRpm} rpm` : '—'],
      ['FLOOR', totalFloors > 0 ? `${currentFloor} / ${totalFloors}` : '—'],
    ];

    const panW = 190;
    const rowH = 26;
    const padV = 12;
    const padH = 10;
    const titleH = 22;
    const panH = padV + titleH + rows.length * rowH + padV;
    const x = 20;
    const y = this.scale.height - panH - 20;

    this.statsContainer = this.add.container(x, y).setScrollFactor(0).setDepth(10);

    const bg = this.add.graphics();
    bg.fillStyle(THEME.colors.ui.hudBackground, 0.7);
    bg.fillRoundedRect(0, 0, panW, panH, 8);
    bg.lineStyle(1, 0x2a2018, 1);
    bg.strokeRoundedRect(0, 0, panW, panH, 8);
    this.statsContainer.add(bg);

    this.statsContainer.add(this.add.text(panW / 2, padV - 2, 'RUN STATS', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.muted, fontStyle: 'bold',
    }).setOrigin(0.5, 0));

    rows.forEach(([label, value], i) => {
      const ry = padV + titleH + i * rowH;
      this.statsContainer.add(this.add.text(padH, ry, label, {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.subtle,
      }).setOrigin(0, 0));
      this.statsContainer.add(this.add.text(panW - padH, ry, value, {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.main, fontStyle: 'bold',
      }).setOrigin(1, 0));
    });
  }

  private createTooltip(): void {
    this.tooltipContainer = this.add.container(0, 0).setDepth(1000).setAlpha(0);
    
    const bg = this.add.graphics();
    this.tooltipContainer.add(bg);
    
    this.tooltipText = this.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.medium, color: THEME.colors.text.main, align: 'center', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.tooltipContainer.add(this.tooltipText);
  }

  private showTooltip(x: number, y: number, text: string): void {
    if (!this.tooltipContainer) return;

    this.tooltipText.setText(text);
    const bounds = this.tooltipText.getBounds();
    const w = bounds.width + 20;
    const h = bounds.height + 12;
    
    const bg = this.tooltipContainer.getAt(0) as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.fillStyle(0x000000, 0.9);
    bg.lineStyle(1, 0xffffff, 0.5);
    bg.fillRoundedRect(-w/2, -h/2, w, h, 6);
    bg.strokeRoundedRect(-w/2, -h/2, w, h, 6);
    
    this.tooltipContainer.setPosition(x, y - 40);
    this.tooltipContainer.setAlpha(1);
  }

  private hideTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.setAlpha(0);
    }
  }

  private createNodeUI(node: MapNode): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    
    const color = THEME.colors.nodes[node.type];
    const circle = this.add.arc(0, 0, 20, 0, 360, false, color);
    circle.setInteractive();

    const label = this.add.text(0, 0, NODE_ICONS[node.type], {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.large,
      color: THEME.colors.text.main,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    container.add([circle, label]);

    circle.on('pointerdown', () => {
      if (this.isNodeReachable(node.id)) {
        this.onNodeClick(node);
      }
    });

    circle.on('pointerover', () => {
      this.showTooltip(container.x, container.y, NODE_DESCRIPTIONS[node.type]);
      if (this.isNodeReachable(node.id)) {
        circle.setStrokeStyle(3, 0xffffff, 1);
      }
    });

    circle.on('pointerout', () => {
      this.hideTooltip();
      const isReachable = this.isNodeReachable(node.id);
      if (isReachable) {
         circle.setStrokeStyle(3, 0xffd700, 1);
      } else {
         circle.setStrokeStyle(1, 0x000000, 0.3);
      }
    });

    return container;
  }

  private isNodeReachable(nodeId: string): boolean {
    const run = RunStateManager.getRun();
    if (!run) return false;

    if (nodeId === run.currentNodeId) return false;

    if (this.isTeleportMode) {
      return run.visitedNodeIds.includes(nodeId);
    }

    if (this.isDevMode) return true;

    if (!run.currentNodeId) {
      const targetNode = run.nodes.find(n => n.id === nodeId);
      return targetNode?.floor === 0;
    }

    const currentNode = run.nodes.find(n => n.id === run.currentNodeId);
    if (!currentNode) return false;

    const edge = run.edges.find(e =>
      (e.from === currentNode.id && e.to === nodeId) ||
      (e.from === nodeId && e.to === currentNode.id)
    );

    return !!edge;
  }

  private onNodeClick(node: MapNode): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    if (this.isTeleportMode) {
      if (run.visitedNodeIds.includes(node.id)) {
        if (RunStateManager.removeFromInventory('teleport')) {
          RunStateManager.setCurrentNode(node.id);
          this.isTeleportMode = false;
          this.drawMap();
          this.updateGoldUI();
        }
      }
      return;
    }

    const connectingEdge = run.edges.find(e =>
      (e.from === run.currentNodeId && e.to === node.id) ||
      (e.from === node.id && e.to === run.currentNodeId)
    );

    // Final Boss Lock Check
    if (node.type === 'finish' && connectingEdge) {
      const medals = run.inventory.filter(i => i.startsWith('medal_'));
      const needed = run.runLength;
      if (medals.length < needed) {
        // Locked
        this.showTooltip(node.x * this.scale.width, node.y * this.virtualHeight, `LOCKED\nNeed ${needed} Medals\nHave: ${medals.length}`);
        this.time.delayedCall(2000, () => this.hideTooltip());
        return;
      }
    }

    if (this.isDevMode && !connectingEdge && node.floor !== 0) {
      RunStateManager.setCurrentNode(node.id);
      this.drawMap();
      this.buildStatsPanel();
      this.updateGoldUI();
      if (node.type === 'shop') {
        this.openShop();
      } else if (node.type === 'event') {
        this.openEvent();
      } else if (node.type === 'elite') {
        this.openEliteChallenge(node);
      }
      return;
    }

    if (node.type === 'elite') {
      this.openEliteChallenge(node);
      return;
    }

    {
      const edge = connectingEdge;
      if (!edge && node.floor !== 0) return;

      let course: any = generateCourseProfile(5, 0.05, 'asphalt');
      let isBackwards = false;

      if (edge) {
        let profileToUse = edge.profile;

        // Hazard Override Logic
        // If traversing FROM Hub TO Spoke Start
        if (run.currentNodeId === 'node_hub' && edge.to === node.id && node.metadata?.spokeId) {
             const key = this.getRequiredKeyForSpoke(node.metadata.spokeId);
             if (key && run.inventory.includes(key)) {
                 // Bypass hazard!
                 // Generate a nice flat asphalt ride of the same distance
                 const distKm = edge.profile.totalDistanceM / 1000;
                 profileToUse = generateCourseProfile(distKm, 0.00, 'asphalt');
             }
        }

        if (edge.to === run.currentNodeId) {
          course = invertCourseProfile(profileToUse);
          isBackwards = true;
        } else {
          course = profileToUse;
        }
        RunStateManager.setActiveEdge(edge);
      }

      const destNodeId = edge
        ? (edge.to === run.currentNodeId ? edge.from : edge.to)
        : node.id;
      const destNode = run.nodes.find(n => n.id === destNodeId);
      const racers: RacerProfile[] = destNode?.type === 'finish'
        ? createBossRacers(this.ftpW)
        : [];

      if (racers.length > 0) {
        this.showBossEncounterSplash(racers[4], () => {
          this.scene.start('GameScene', {
            course, isBackwards,
            isRoguelike: true, activeChallenge: null, racers,
          });
        });
      } else {
        this.scene.start('GameScene', {
          course, isBackwards,
          isRoguelike: true, activeChallenge: null,
        });
      }
    }
  }

  private getRequiredKeyForSpoke(spokeId: string): string | null {
    if (spokeId === 'coast') return 'ferry_token';
    if (spokeId === 'mountain') return 'funicular_ticket';
    if (spokeId === 'forest') return 'trail_machete';
    return null;
  }

  private checkPendingNodeAction(): void {
    const run = RunStateManager.getRun();
    if (!run?.pendingNodeAction) return;

    const action = run.pendingNodeAction;
    RunStateManager.setPendingNodeAction(null);

    if (action === 'shop') {
      this.openShop();
    } else if (action === 'event') {
      this.openEvent();
    }
  }

  private openShop(): void {
    this.overlayActive = true;
    const overlay = new ShopOverlay(
      this,
      this.cameras.main.scrollY,
      () => this.updateGoldUI(),
      () => { this.overlayActive = false; }
    );
    this.add.existing(overlay);
  }

  private openEvent(onComplete?: () => void): void {
    this.overlayActive = true;
    const overlay = new EventOverlay(
      this,
      this.cameras.main.scrollY,
      () => {
        onComplete?.();
        this.updateGoldUI();
      },
      () => { this.overlayActive = false; }
    );
    this.add.existing(overlay);
  }

  private openEliteChallenge(node: MapNode): void {
    this.overlayActive = true;
    const overlay = new EliteChallengeOverlay(
      this,
      this.cameras.main.scrollY,
      node,
      this.ftpW * RunStateManager.getModifiers().powerMult,
      (course, challenge) => {
        this.overlayActive = false;
        this.startGameWithEliteChallenge(node, course, challenge);
      },
      () => { this.overlayActive = false; }
    );
    this.add.existing(overlay);
  }

  private startGameWithEliteChallenge(node: MapNode, course: CourseProfile, challenge: EliteChallenge): void {
    const run = RunStateManager.getRun();
    if (!run) return;
    const fromNodeId = run.currentNodeId;
    const edge = run.edges.find(e =>
      (e.from === fromNodeId && e.to === node.id) ||
      (e.from === node.id && e.to === fromNodeId)
    );

    if (edge) {
      RunStateManager.setActiveEdge(edge);
    } else {
      RunStateManager.setCurrentNode(node.id);
      RunStateManager.setActiveEdge(null);
    }

    this.scene.start('GameScene', {
      course,
      isBackwards: false,
      isRoguelike: true,
      activeChallenge: challenge,
    });
  }

  private buildStatsBar(): void {
    const run = RunStateManager.getRun();
    if (!run) return;
    const { modifiers, modifierLog } = run;

    interface ChipDef {
      text: string;
      bgColor: number;
      textColor: string;
      tooltipLines: string[];
    }

    const chips: ChipDef[] = [];

    if (modifiers.powerMult !== 1.0) {
      const pct = Math.round((modifiers.powerMult - 1) * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.powerMult !== undefined);
      chips.push({
        text: `+${pct}% POWER`,
        bgColor: 0x0f2a10,
        textColor: '#88ffaa',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: +${Math.round((e.powerMult! - 1) * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (modifiers.dragReduction !== 0.0) {
      const pct = Math.round(modifiers.dragReduction * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.dragReduction !== undefined);
      chips.push({
        text: `${pct}% AERO`,
        bgColor: 0x061828,
        textColor: '#88ddff',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: +${Math.round(e.dragReduction! * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (modifiers.weightMult !== 1.0) {
      const pct = Math.round((1 - modifiers.weightMult) * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.weightMult !== undefined);
      chips.push({
        text: `-${pct}% WEIGHT`,
        bgColor: 0x221400,
        textColor: '#ffcc66',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: -${Math.round((1 - e.weightMult!) * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (modifiers.crrMult !== undefined && modifiers.crrMult !== 1.0) {
      const pct = Math.round((1 - modifiers.crrMult) * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.crrMult !== undefined);
      chips.push({
        text: `-${pct}% ROLL`,
        bgColor: 0x14220a,
        textColor: '#bbff88',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: -${Math.round((1 - e.crrMult!) * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (chips.length === 0) return;

    const chipW = 96;
    const chipH = 20;
    const gap = 6;
    const totalW = chips.length * chipW + (chips.length - 1) * gap;
    const startX = this.scale.width / 2 - totalW / 2;
    const barY = 56;

    // Screen-fixed tooltip elements (created once, shared across all chips)
    const tipBg = this.add.graphics().setScrollFactor(0).setDepth(210).setAlpha(0);
    const tipText = this.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main,
      fontSize: '11px',
      color: '#ffffff',
      align: 'left',
    }).setScrollFactor(0).setDepth(211).setAlpha(0);

    const showTip = (chipCx: number, lines: string[]) => {
      tipText.setText(lines.join('\n'));
      const tw = Math.max(tipText.width + 16, 80);
      const th = tipText.height + 10;
      const tx = Math.min(Math.max(chipCx - tw / 2, 4), this.scale.width - tw - 4);
      const ty = barY + chipH / 2 + 4;
      tipText.setPosition(tx + 8, ty + 5);
      tipBg.clear()
        .fillStyle(0x000000, 0.92)
        .lineStyle(1, 0x888888, 0.8)
        .fillRoundedRect(tx, ty, tw, th, 4)
        .strokeRoundedRect(tx, ty, tw, th, 4);
      tipBg.setAlpha(1);
      tipText.setAlpha(1);
    };
    const hideTip = () => { tipBg.setAlpha(0); tipText.setAlpha(0); };

    chips.forEach((chip, i) => {
      const cx = startX + i * (chipW + gap) + chipW / 2;

      this.add.rectangle(cx, barY, chipW, chipH, chip.bgColor)
        .setScrollFactor(0).setDepth(22)
        .setInteractive({ useHandCursor: false })
        .on('pointerover', () => showTip(cx, chip.tooltipLines))
        .on('pointerout', hideTip);

      this.add.text(cx, barY, chip.text, {
        fontFamily: THEME.fonts.main,
        fontSize: '10px',
        color: chip.textColor,
        fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(23);
    });
  }

  private buildDevToggle(): void {
    this.devToggleBg?.destroy();
    this.devToggleTxt?.destroy();

    const on = this.isDevMode;
    this.devToggleBg = this.add.rectangle(70, 20, 130, 26, on ? 0x224422 : 0x333333)
      .setScrollFactor(0).setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.devToggleTxt = this.add.text(70, 20, on ? 'DEV MODE: ON' : 'DEV MODE: OFF', {
      fontFamily: THEME.fonts.main, fontSize: '11px',
      color: on ? '#00ff00' : '#aaaaaa', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.devToggleBg.on('pointerdown', () => {
      this.isDevMode = !this.isDevMode;
      RunStateManager.setDevMode(this.isDevMode);
      this.devToggleBg!.setFillStyle(this.isDevMode ? 0x224422 : 0x333333);
      this.devToggleTxt!.setText(this.isDevMode ? 'DEV MODE: ON' : 'DEV MODE: OFF');
      this.devToggleTxt!.setColor(this.isDevMode ? '#00ff00' : '#aaaaaa');
      this.drawMap();
    });
    this.devToggleBg.on('pointerover', () =>
      this.devToggleBg!.setFillStyle(this.isDevMode ? 0x336633 : 0x555555));
    this.devToggleBg.on('pointerout', () =>
      this.devToggleBg!.setFillStyle(this.isDevMode ? 0x224422 : 0x333333));
  }

  private buildGearButton(): void {
    this.gearBtnBg?.destroy();
    this.gearBtnTxt?.destroy();

    // Position at top-left, below the dev-mode toggle.
    this.gearBtnBg = this.add.rectangle(70, 52, 130, 26, THEME.colors.buttons.primary)
      .setScrollFactor(0).setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.gearBtnTxt = this.add.text(70, 52, '⚙ EQUIPMENT', {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: '#ccccff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.gearBtnBg.on('pointerover', () => this.gearBtnBg!.setFillStyle(THEME.colors.buttons.primaryHover));
    this.gearBtnBg.on('pointerout',  () => this.gearBtnBg!.setFillStyle(THEME.colors.buttons.primary));
    this.gearBtnBg.on('pointerdown', () => {
      if (this.overlayActive) return;
      this.overlayActive = true;
      const overlay = new EquipmentOverlay(this, this.cameras.main.scrollY, () => {
        this.overlayActive = false;
        this.updateGoldUI();
      });
      // Ensure depth above the map (which is at depth 0-20ish).
      overlay.setDepth(2100);
    });
  }

  private buildRemoteButton(): void {
    this.remoteBtnBg?.destroy();
    this.remoteBtnTxt?.destroy();

    const code = RemoteService.getInstance().getRoomCode();
    const isConnected = !!code;

    // Position at top-left, below the gear button (y=52 + 26/2 + padding -> ~84).
    // Gear button is 26px high, centered at 52. Bottom is 65. Gap 6px -> 71 (top of next).
    // Next button height 26. Center at 71 + 13 = 84.
    const y = 84;

    this.remoteBtnBg = this.add.rectangle(70, y, 130, 26, THEME.colors.buttons.primary)
      .setScrollFactor(0).setDepth(30)
      .setInteractive({ useHandCursor: true });

    const label = isConnected ? `REMOTE: ${code}` : '📡 REMOTE';
    const color = isConnected ? '#00ff88' : '#ccccff';

    this.remoteBtnTxt = this.add.text(70, y, label, {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: color, fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.remoteBtnBg.on('pointerover', () => this.remoteBtnBg!.setFillStyle(THEME.colors.buttons.primaryHover));
    this.remoteBtnBg.on('pointerout',  () => this.remoteBtnBg!.setFillStyle(THEME.colors.buttons.primary));
    this.remoteBtnBg.on('pointerdown', async () => {
      if (this.overlayActive) return;

      const currentCode = RemoteService.getInstance().getRoomCode();
      if (currentCode) {
        this.overlayActive = true;
        new RemotePairingOverlay(this, currentCode, () => { this.overlayActive = false; });
        return;
      }

      this.remoteBtnTxt?.setText('CONNECTING...');
      try {
        const newCode = await RemoteService.getInstance().initHost();
        // Rebuild button to show code
        this.buildRemoteButton();
        // Open overlay
        this.overlayActive = true;
        new RemotePairingOverlay(this, newCode, () => { this.overlayActive = false; });
      } catch (e) {
        console.error('Remote init failed', e);
        this.remoteBtnTxt?.setText('ERR').setColor('#ff4444');
        this.time.delayedCall(2000, () => this.buildRemoteButton());
      }
    });
  }

  private buildReturnButton(): void {
    this.returnBtnBg?.destroy();
    this.returnBtnTxt?.destroy();

    const run = RunStateManager.getRun();
    // Show only if not at Hub and not in overlay
    if (!run || run.currentNodeId === 'node_hub') return;

    const x = this.scale.width - 20;
    const y = this.scale.height - 180; // Above stats panel

    this.returnBtnBg = this.add.rectangle(x, y, 160, 40, THEME.colors.buttons.danger)
        .setOrigin(1, 1).setScrollFactor(0).setDepth(30).setInteractive({ useHandCursor: true });

    this.returnBtnTxt = this.add.text(x - 80, y - 20, 'RETURN TO BASE', {
        fontFamily: THEME.fonts.main, fontSize: '14px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.returnBtnBg.on('pointerdown', () => {
        RunStateManager.returnToHub();
        this.scene.restart(); // Reload map scene to refresh state
    });
    this.returnBtnBg.on('pointerover', () => this.returnBtnBg!.setFillStyle(THEME.colors.buttons.dangerHover));
    this.returnBtnBg.on('pointerout', () => this.returnBtnBg!.setFillStyle(THEME.colors.buttons.danger));
  }

  private showBossEncounterSplash(racer: RacerProfile, onProceed: () => void): void {
    const w  = this.scale.width;
    const h  = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const mono = 'monospace';
    const depth = 100;

    this.overlayActive = true;

    const dim = this.add.graphics().setDepth(depth).setScrollFactor(0);
    dim.fillStyle(0x000000, 0.88);
    dim.fillRect(0, 0, w, h);

    const panW = Math.min(520, w - 40);
    const panH = 300;
    const px = cx - panW / 2;
    const py = cy - panH / 2;

    const panel = this.add.graphics().setDepth(depth + 1).setScrollFactor(0);
    panel.fillStyle(0x080818, 1);
    panel.fillRect(px, py, panW, panH);
    panel.lineStyle(2, racer.accentColor, 1);
    panel.strokeRect(px, py, panW, panH);

    panel.fillStyle(racer.accentColor, 1);
    panel.fillRect(px, py, panW, 6);

    this.add.text(cx, py + 22, '⚠ FINAL BOSS', {
      fontFamily: mono, fontSize: '11px', color: racer.accentHex, letterSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);

    this.add.text(cx, py + 44, racer.displayName, {
      fontFamily: mono, fontSize: '30px', fontStyle: 'bold', color: racer.hexColor, letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);

    this.add.text(cx, py + 88, racer.flavorText, {
      fontFamily: mono, fontSize: '12px', color: '#aaaaaa', align: 'center',
      wordWrap: { width: panW - 40 },
    }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);

    const statsY = py + 140;
    const stats = [
      { label: 'POWER',  value: `${racer.powerW} W` },
      { label: 'MASS',   value: `${racer.massKg} kg` },
      { label: 'CdA',    value: racer.cdA.toFixed(2) },
      { label: 'Crr',    value: racer.crr.toFixed(3) },
    ];
    stats.forEach((s, i) => {
      const x = px + 30 + i * (panW - 60) / (stats.length - 1);
      this.add.text(x, statsY, s.label, {
        fontFamily: mono, fontSize: '9px', color: '#666677', letterSpacing: 2,
      }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);
      this.add.text(x, statsY + 14, s.value, {
        fontFamily: mono, fontSize: '16px', fontStyle: 'bold', color: '#ddddee',
      }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);
    });

    const btnW = 160;
    const btnH = 42;
    const btnX = cx - btnW / 2;
    const btnY = py + panH - 60;

    const btnBg = this.add.graphics().setDepth(depth + 2).setScrollFactor(0);
    const drawBtn = (hover: boolean) => {
      btnBg.clear();
      btnBg.fillStyle(hover ? racer.accentColor : 0x1a1a2e, 1);
      btnBg.fillRect(btnX, btnY, btnW, btnH);
      btnBg.lineStyle(2, racer.accentColor, 1);
      btnBg.strokeRect(btnX, btnY, btnW, btnH);
    };
    drawBtn(false);
    const btnLabel = this.add.text(cx, btnY + btnH / 2, 'RACE!', {
      fontFamily: mono, fontSize: '18px', fontStyle: 'bold', color: racer.hexColor, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth + 3).setScrollFactor(0);

    const btnHit = this.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(depth + 4);

    btnHit
      .on('pointerover',  () => { drawBtn(true);  btnLabel.setColor('#000000'); })
      .on('pointerout',   () => { drawBtn(false); btnLabel.setColor(racer.hexColor); })
      .on('pointerdown',  () => {
        this.overlayActive = false;
        onProceed();
      });
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    this.teleportBg = null;
    this.teleportTxt = null;
    this.devToggleBg = null;
    this.devToggleTxt = null;
    this.remoteBtnBg = null;
    this.remoteBtnTxt = null;
    this.returnBtnBg = null;
    this.returnBtnTxt = null;
    this.isTeleportMode = false;
    this.overlayActive = false;
    this.nodeObjects.clear();
    this.edgeObjects.clear();
    if (this.statsContainer) this.statsContainer.destroy();
    if (this.tooltipContainer) this.tooltipContainer.destroy();

    RemoteService.getInstance().offCursorMove(this.onRemoteCursorMoveBound);
    RemoteService.getInstance().offCursorSelect(this.onRemoteCursorSelectBound);
  }
}
