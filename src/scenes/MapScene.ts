/**
 * MapScene.ts
 * 
 * Roguelike map traversal scene.
 * Procedurally generates a DAG of nodes (rides, shops, etc.).
 */

import Phaser from 'phaser';
import { RunStateManager, type MapNode, type MapEdge, type NodeType } from '../roguelike/RunState';
import { generateCourseProfile, invertCourseProfile, type SurfaceType } from '../course/CourseProfile';
import { getRandomChallenge, formatChallengeText } from '../roguelike/EliteChallenge';
import type { Units } from './MenuScene';
import type { ITrainerService } from '../services/ITrainerService';
import { HeartRateService } from '../services/HeartRateService';

// Node types that are freely accessible in dev mode regardless of traversal
const DEV_ACCESSIBLE_TYPES: NodeType[] = ['shop', 'event', 'elite'];

// Darker colors for better contrast against #e8dcc8 background
const SURFACE_FILL_COLORS: Record<SurfaceType, number> = {
  asphalt: 0x446688, // Darker blue
  gravel:  0xaa8800, // Darker yellow/gold
  dirt:    0xaa4411, // Darker orange
  mud:     0x226622, // Darker green
};

const NODE_COLORS: Record<NodeType, number> = {
  start:    0x333333,
  standard: 0x008872,
  hard:     0x8b0000,
  shop:     0x8b5a00,
  event:    0x4b0082,
  elite:    0x8a6800,
  finish:   0x000000,
};

const NODE_ICONS: Record<NodeType, string> = {
  start:    'S',
  standard: 'R',
  hard:     'H',
  shop:     '$',
  event:    '?',
  elite:    '★',
  finish:   'F',
};

const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  start:    'START',
  standard: 'RIDE',
  hard:     'HARD RIDE',
  shop:     'SHOP',
  event:    'EVENT',
  elite:    'ELITE CHALLENGE',
  finish:   'FINISH',
};

export class MapScene extends Phaser.Scene {
  private units: Units = 'imperial';
  private weightKg = 75;
  private trainer: ITrainerService | null = null;
  private hrm: HeartRateService | null = null;
  private isDevMode = false;

  private ftpW = 200;

  private mapContainer!: Phaser.GameObjects.Container;
  private graphics!: Phaser.GameObjects.Graphics;
  private nodeObjects = new Map<string, Phaser.GameObjects.Container>();
  
  private tooltipContainer!: Phaser.GameObjects.Container;
  private tooltipText!: Phaser.GameObjects.Text;
  private legendContainer!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;

  private isTeleportMode = false;
  private teleportBtn: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'MapScene' });
  }

  init(data: {
    weightKg: number;
    units: Units;
    trainer: ITrainerService | null;
    hrm: HeartRateService | null;
    isDevMode?: boolean;
    ftpW?: number;
  }): void {
    console.log('[MapScene] init data:', data);
    this.weightKg = data.weightKg;
    this.units = data.units;
    this.trainer = data.trainer;
    this.hrm = data.hrm;
    this.isDevMode = data.isDevMode ?? false;
    this.ftpW = data.ftpW ?? RunStateManager.getRun()?.ftpW ?? 200;

    const run = RunStateManager.getRun();
    if (run && run.nodes.length === 0) {
      this.generateMap(run);
      // We no longer auto-pick a start node; the player must choose one.
      run.currentNodeId = ''; 
    }
  }

  create(): void {
    this.nodeObjects.clear();
    this.cameras.main.setBackgroundColor('#e8dcc8');
    
    // Main container for map elements
    this.mapContainer = this.add.container(0, 0);
    this.graphics = this.add.graphics();
    this.mapContainer.add(this.graphics);

    this.drawMap();

    // UI Elements
    this.add.text(this.scale.width / 2, 30, 'ROGUELIKE RUN', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#2a2018',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const run = RunStateManager.getRun();
    this.goldText = this.add.text(this.scale.width - 20, 20, `GOLD: ${run?.gold ?? 0}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#8b5a00', fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.buildLegend();
    this.createTooltip();

    this.scale.on('resize', this.onResize, this);
    this.onResize();
  }

  private updateGoldUI(): void {
    const run = RunStateManager.getRun();
    if (!run || !this.sys.isActive()) return;

    this.goldText.setText(`GOLD: ${run.gold}`);
    this.goldText.setX(this.scale.width - 20);

    // ── Teleport Button ──
    const teleCount = run.inventory.filter(i => i === 'teleport').length;
    
    if (teleCount > 0) {
      if (!this.teleportBtn) {
        this.teleportBtn = this.add.container(this.scale.width - 20, 60);
        
        const bg = this.add.rectangle(0, 0, 140, 30, 0x442244)
          .setInteractive({ useHandCursor: true });
        const txt = this.add.text(0, 0, `TELEPORT (${teleCount})`, {
          fontFamily: 'monospace', fontSize: '12px', color: '#ff88ff', fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.teleportBtn.add([bg, txt]);

        bg.on('pointerdown', () => {
          this.isTeleportMode = !this.isTeleportMode;
          // Update button appearance
          bg.setFillStyle(this.isTeleportMode ? 0x884488 : 0x442244);
          this.drawMap();
        });
        
        bg.on('pointerover', () => bg.setFillStyle(this.isTeleportMode ? 0x995599 : 0x553355));
        bg.on('pointerout', () => bg.setFillStyle(this.isTeleportMode ? 0x884488 : 0x442244));
      } else {
        this.teleportBtn.setVisible(true);
        this.teleportBtn.setX(this.scale.width - 20); // Resize handling
        const txt = this.teleportBtn.getAt(1) as Phaser.GameObjects.Text;
        txt.setText(this.isTeleportMode ? 'CANCEL TELEPORT' : `TELEPORT (${teleCount})`);
        
        const bg = this.teleportBtn.getAt(0) as Phaser.GameObjects.Rectangle;
        bg.setFillStyle(this.isTeleportMode ? 0x884488 : 0x442244);
      }
    } else {
      if (this.teleportBtn) this.teleportBtn.setVisible(false);
      if (this.isTeleportMode) {
        this.isTeleportMode = false;
        this.drawMap();
      }
    }
  }

  private onResize(): void {
    if (!this.sys.isActive()) return;
    this.mapContainer.setPosition(0, 0);
    this.drawMap();
    this.updateGoldUI();
    // Rebuild legend to position correctly
    this.buildLegend();
  }

  private generateMap(run: any): void {
    const totalFloors = run.runLength;
    const segmentKm = Math.max(0.2, run.totalDistanceKm / totalFloors); // Minimum 200m per segment
    const numCols = 7;
    const nodes: MapNode[] = [];
    const edges: MapEdge[] = [];

    const getOrCreateNode = (f: number, c: number): MapNode => {
      const id = `node_${f}_${c}`;
      let node = nodes.find(n => n.id === id);
      if (!node) {
        node = {
          id,
          type: 'standard', 
          floor: f,
          col: c,
          x: (c + 1) / (numCols + 1),
          y: 0.9 - (f / (totalFloors + 1)) * 0.8,
          connectedTo: []
        };
        nodes.push(node);
      }
      return node;
    };

    // 1. Generate paths using a jittered grid approach
    const numPaths = 3 + Math.floor(Math.random() * 2); // 3-4 starting paths
    for (let p = 0; p < numPaths; p++) {
      let curCol = Math.floor(Math.random() * numCols);
      let prevNode = getOrCreateNode(0, curCol);

      for (let f = 1; f < totalFloors; f++) {
        // Next column must be within [-1, 1] of the previous column
        const offset = Math.floor(Math.random() * 3) - 1;
        curCol = Math.max(0, Math.min(numCols - 1, curCol + offset));
        const curNode = getOrCreateNode(f, curCol);
        
        if (!prevNode.connectedTo.includes(curNode.id)) {
          prevNode.connectedTo.push(curNode.id);
        }
        prevNode = curNode;
      }
      
      const finishNode = getOrCreateNode(totalFloors, Math.floor(numCols / 2));
      if (!prevNode.connectedTo.includes(finishNode.id)) {
        prevNode.connectedTo.push(finishNode.id);
      }
    }

    // 2. Resolve Line Crossings (Basic Sort)
    nodes.forEach(node => {
      node.connectedTo.sort((a, b) => {
        const nodeA = nodes.find(n => n.id === a)!;
        const nodeB = nodes.find(n => n.id === b)!;
        return nodeA.col - nodeB.col;
      });
    });

    // 3. Finalize types and create edges
    nodes.forEach(node => {
      if (node.floor === 0) node.type = 'start';
      else if (node.floor === totalFloors) node.type = 'finish';
      else {
        node.type = this.getRandomNodeType(node.floor, totalFloors);
        if (node.type === 'elite') {
          node.eliteChallenge = getRandomChallenge();
        }
      }
    });

    nodes.forEach(fromNode => {
      fromNode.connectedTo.forEach(toId => {
        const toNode = nodes.find(n => n.id === toId)!;
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          profile: generateCourseProfile(segmentKm, this.getMaxGrade(run.difficulty, toNode.type))
        });
      });
    });

    run.nodes = nodes;
    run.edges = edges;
  }

  private getRandomNodeType(floor: number, total: number): NodeType {
    const progress = floor / total; // 0 → 1 across the run

    const weights: Record<NodeType, number> = {
      start:    0,
      finish:   0,
      standard: 0.55 - progress * 0.15, // 55% early → 40% late
      hard:     0.15 + progress * 0.10, // 15% early → 25% late
      shop:     0.12,                   // flat 12% throughout
      event:    0.10,                   // flat 10% throughout
      elite:    progress * progress * 0.40, // ~0% early → ~40% weight late (quadratic ramp)
    };

    const total_weight = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total_weight;

    for (const [type, weight] of Object.entries(weights) as [NodeType, number][]) {
      r -= weight;
      if (r <= 0) return type;
    }

    return 'standard';
  }

  private getMaxGrade(diff: string, type: NodeType): number {
    let base = diff === 'easy' ? 0.05 : diff === 'medium' ? 0.10 : 0.15;
    if (type === 'hard') base += 0.05;
    return base;
  }

  private drawMap(): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    this.graphics.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    // Remove any containers that aren't in the run anymore (cleanup)
    for (const [id, container] of this.nodeObjects.entries()) {
      if (!run.nodes.find(n => n.id === id)) {
        container.destroy();
        this.nodeObjects.delete(id);
      }
    }

    // Draw Edges first (so they are behind nodes)
    run.edges.forEach(edge => {
      const fromNode = run.nodes.find(n => n.id === edge.from)!;
      const toNode = run.nodes.find(n => n.id === edge.to)!;
      
      const fx = fromNode.x * w;
      const fy = fromNode.y * h;
      const tx = toNode.x * w;
      const ty = toNode.y * h;

      const surface = edge.profile.segments[0]?.surface ?? 'asphalt';
      const color = SURFACE_FILL_COLORS[surface];
      
      // Highlight paths connected to the current node (bidirectional)
      const isConnected = run.currentNodeId === fromNode.id || run.currentNodeId === toNode.id;
      // High contrast: 1.0 alpha for active, 0.4 for inactive (was 0.25)
      const alpha = isConnected ? 1.0 : 0.4;
      const dotSize = isConnected ? 8 : 5;
      const gap = dotSize * 1.8;
      
      this.graphics.fillStyle(color, alpha);
      // Add a slight stroke/glow if active?
      if (isConnected) {
        this.graphics.lineStyle(2, 0xffffff, 0.5);
      }
      
      this.drawDottedLine(fx, fy, tx, ty, gap, dotSize);
    });

    // Draw Nodes
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

      const circle = container.getAt(0) as Phaser.GameObjects.Arc;
      
      if (isCurrent) {
        // Current Node: Glowing, Big
        circle.setStrokeStyle(4, 0xffffff, 1);
        circle.setScale(1.2);
        circle.setAlpha(1.0);
        circle.disableInteractive();
      } else if (isReachable) {
        // Reachable: Bright, Interactive
        const outlineColor = this.isTeleportMode ? 0xff88ff : 0xffd700; // Purple for teleport, Gold for travel
        circle.setStrokeStyle(3, outlineColor, 1);
        circle.setScale(1.1);
        circle.setAlpha(1.0);
        circle.setInteractive({ useHandCursor: true });
      } else if (isCompleted) {
        // Completed: Dimmed
        circle.setStrokeStyle(1, 0x000000, 0.5);
        circle.setScale(0.9);
        circle.setAlpha(0.6);
        circle.disableInteractive();
      } else {
        // Future/Unreachable: Dimmed
        circle.setStrokeStyle(1, 0x000000, 0.3);
        circle.setScale(0.9);
        circle.setAlpha(0.5);
        circle.disableInteractive();
      }
    });
  }

  private drawDottedLine(x1: number, y1: number, x2: number, y2: number, gap: number, size: number): void {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    
    // Draw dots
    for (let d = 0; d < dist; d += gap) {
      const px = x1 + Math.cos(angle) * d;
      const py = y1 + Math.sin(angle) * d;
      this.graphics.fillCircle(px, py, size / 2); // Use circles for smoother look
    }
  }

  private buildLegend(): void {
    if (this.legendContainer) this.legendContainer.destroy();

    const w = 150;
    const h = Object.keys(NODE_ICONS).length * 28 + 20;
    const x = 20;
    const y = this.scale.height - h - 20;

    this.legendContainer = this.add.container(x, y).setScrollFactor(0);
    
    // Legend Background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(0, 0, w, h, 8);
    bg.lineStyle(2, 0x2a2018, 1);
    bg.strokeRoundedRect(0, 0, w, h, 8);
    this.legendContainer.add(bg);

    // Title
    this.legendContainer.add(this.add.text(w/2, 10, "LEGEND", {
        fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa', fontStyle: 'bold'
    }).setOrigin(0.5, 0));

    let yOff = 35;
    (Object.keys(NODE_ICONS) as NodeType[]).forEach(type => {
      const color = NODE_COLORS[type];
      
      // Node Circle
      const circle = this.add.arc(25, yOff, 10, 0, 360, false, color);
      
      // Icon
      const icon = this.add.text(25, yOff, NODE_ICONS[type], {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);

      // Label
      const label = this.add.text(45, yOff, NODE_DESCRIPTIONS[type], {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff'
      }).setOrigin(0, 0.5);
      
      this.legendContainer.add([circle, icon, label]);
      yOff += 28;
    });
  }

  private createTooltip(): void {
    // Create tooltip container once
    this.tooltipContainer = this.add.container(0, 0).setDepth(1000).setAlpha(0);
    
    const bg = this.add.graphics();
    this.tooltipContainer.add(bg); // index 0
    
    this.tooltipText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.tooltipContainer.add(this.tooltipText); // index 1
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
    
    // Circle base
    const color = NODE_COLORS[node.type];
    const circle = this.add.arc(0, 0, 20, 0, 360, false, color);
    // Note: We don't set interactive here, we do it in drawMap based on reachability
    // actually, we should set basic interactivity for hover here, and click separately?
    // Let's set interactive for hover on all nodes, but only cursor/click on reachable.
    circle.setInteractive();

    // Icon
    const label = this.add.text(0, 0, NODE_ICONS[node.type], {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    container.add([circle, label]);

    // Events
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
      // Restore state handled by drawMap loop usually, but quick fix here:
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
    
    // Teleport Mode: Any visited node is reachable (except current, arguably, but allowing it is harmless)
    if (this.isTeleportMode) {
      return run.visitedNodeIds.includes(nodeId) && nodeId !== run.currentNodeId;
    }
    
    const targetNode = run.nodes.find(n => n.id === nodeId);
    if (!targetNode) return false;

    // Dev mode: shops (and future event nodes) are always reachable
    if (this.isDevMode && DEV_ACCESSIBLE_TYPES.includes(targetNode.type)) {
      return nodeId !== run.currentNodeId;
    }

    // 1. Initial Choice
    if (!run.currentNodeId) {
      return targetNode.floor === 0;
    }

    const currentNode = run.nodes.find(n => n.id === run.currentNodeId);
    if (!currentNode) return false;

    // 2. Bidirectional Movement: Check for ANY edge connecting current <-> target
    const edge = run.edges.find(e => 
      (e.from === currentNode.id && e.to === targetNode.id) || 
      (e.from === targetNode.id && e.to === currentNode.id)
    );

    return !!edge;
  }

  private onNodeClick(node: MapNode): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    // ── Teleport Mode Handling ──
    if (this.isTeleportMode) {
      if (run.visitedNodeIds.includes(node.id)) {
        // Deduct item
        if (RunStateManager.removeFromInventory('teleport')) {
          RunStateManager.setCurrentNode(node.id);
          this.isTeleportMode = false;
          this.drawMap();
          this.updateGoldUI(); // Refresh UI to update teleport button count/state
        }
      }
      return;
    }

    // Handle Start Node (no edge to traverse)
    if (node.floor === 0 && !run.currentNodeId) {
        RunStateManager.setCurrentNode(node.id);
        this.drawMap();
        return;
    }

    if (node.type === 'elite') {
      // Show challenge dialog before committing movement
      this.openEliteChallenge(node);
      return;
    }

    if (node.type === 'shop' || node.type === 'event') {
      // Find edge if we traveled to it
      const edge = run.edges.find(e =>
        (e.from === run.currentNodeId && e.to === node.id) ||
        (e.from === node.id && e.to === run.currentNodeId)
      );
      if (edge) RunStateManager.setActiveEdge(edge);

      RunStateManager.setCurrentNode(node.id);
      if (node.type === 'shop') {
        this.openShop();
      } else {
        this.openEvent();
      }
      this.drawMap();
      this.updateGoldUI();
    } else {
      // Find edge connecting current <-> target
      const edge = run.edges.find(e => 
        (e.from === run.currentNodeId && e.to === node.id) || 
        (e.from === node.id && e.to === run.currentNodeId)
      );

      if (!edge && node.floor !== 0) return; // Should not happen if reachable

      // Create course from edge profile
      let course: any = generateCourseProfile(5, 0.05, 'asphalt'); // Default fallback
      let isBackwards = false;
      
      if (edge) {
        // Check direction
        if (edge.to === run.currentNodeId) {
          // Backward travel: Invert profile
          course = invertCourseProfile(edge.profile);
          isBackwards = true;
        } else {
          // Forward travel
          course = edge.profile;
        }
        RunStateManager.setActiveEdge(edge);
      }

      console.log('[MapScene] Starting GameScene. isDevMode:', this.isDevMode);
      this.scene.start('GameScene', {
        course,
        isBackwards,
        weightKg: this.weightKg,
        units: this.units,
        trainer: this.trainer,
        hrm: this.hrm,
        isRoguelike: true,
        isDevMode: this.isDevMode
      });
    }
  }

  private openShop(): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.container(0, 0).setDepth(2000); // Top of everything

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    overlay.add(bg);

    const pw = 400, ph = 300;
    const px = (w - pw) / 2, py = (h - ph) / 2;
    
    const panel = this.add.graphics();
    panel.fillStyle(0x1a1a2a, 1);
    panel.fillRoundedRect(px, py, pw, ph, 12);
    panel.lineStyle(2, 0x8b5a00, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 12);
    overlay.add(panel);

    overlay.add(this.add.text(w / 2, py + 30, 'TRAIL SHOP', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffcc00', fontStyle: 'bold'
    }).setOrigin(0.5));

    const goldTxt = this.add.text(w / 2, py + 70, `GOLD: ${run.gold}`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff'
    }).setOrigin(0.5);
    overlay.add(goldTxt);

    const itemX = w / 2;
    const itemY = py + 120; // Moved up slightly
    const priceTailwind = 100;
    const priceTeleport = 10;

    // ── Item 1: Tailwind ──
    const btnTailwind = this.add.rectangle(itemX, itemY, 320, 50, 0x2a2a44).setInteractive({ useHandCursor: true });
    const txtTailwind = this.add.text(itemX, itemY, `TAILWIND (2x POWER)\nPrice: ${priceTailwind} GOLD`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5);
    overlay.add([btnTailwind, txtTailwind]);

    // ── Item 2: Teleport ──
    const itemY2 = itemY + 60;
    const btnTeleport = this.add.rectangle(itemX, itemY2, 320, 50, 0x442244).setInteractive({ useHandCursor: true });
    const txtTeleport = this.add.text(itemX, itemY2, `TELEPORT SCROLL\nPrice: ${priceTeleport} GOLD`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff88ff', align: 'center'
    }).setOrigin(0.5);
    overlay.add([btnTeleport, txtTeleport]);

    const refreshShop = () => {
      goldTxt.setText(`GOLD: ${run.gold}`);

      // Update Tailwind
      if (run.inventory.includes('tailwind')) {
        txtTailwind.setText('TAILWIND - OWNED');
        btnTailwind.setFillStyle(0x1a5a3a);
        btnTailwind.disableInteractive();
      } else if (run.gold < priceTailwind) {
        btnTailwind.setFillStyle(0x442222);
        btnTailwind.disableInteractive();
        txtTailwind.setAlpha(0.5);
      } else {
        btnTailwind.setFillStyle(0x2a2a44);
        btnTailwind.setInteractive();
        txtTailwind.setAlpha(1);
      }

      // Update Teleport (Consumable, so always buyable if afforded)
      if (run.gold < priceTeleport) {
        btnTeleport.setFillStyle(0x332222);
        btnTeleport.disableInteractive();
        txtTeleport.setAlpha(0.5);
      } else {
        btnTeleport.setFillStyle(0x442244);
        btnTeleport.setInteractive();
        txtTeleport.setAlpha(1);
      }
    };

    btnTailwind.on('pointerdown', () => {
      if (RunStateManager.spendGold(priceTailwind)) {
        RunStateManager.addToInventory('tailwind');
        refreshShop();
        this.updateGoldUI();
      }
    });
    
    btnTeleport.on('pointerdown', () => {
      if (RunStateManager.spendGold(priceTeleport)) {
        RunStateManager.addToInventory('teleport');
        refreshShop();
        this.updateGoldUI();
      }
    });

    // Hover effects
    btnTailwind.on('pointerover', () => { if (btnTailwind.input!.enabled) btnTailwind.setFillStyle(0x3a3a5a); });
    btnTailwind.on('pointerout', () => { if (btnTailwind.input!.enabled) btnTailwind.setFillStyle(0x2a2a44); });
    
    btnTeleport.on('pointerover', () => { if (btnTeleport.input!.enabled) btnTeleport.setFillStyle(0x553355); });
    btnTeleport.on('pointerout', () => { if (btnTeleport.input!.enabled) btnTeleport.setFillStyle(0x442244); });

    refreshShop();

    const closeBtn = this.add.rectangle(w / 2, py + ph - 40, 120, 36, 0x444444).setInteractive({ useHandCursor: true });
    overlay.add(closeBtn);
    overlay.add(this.add.text(w / 2, py + ph - 40, 'CLOSE', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5));

    closeBtn.on('pointerdown', () => overlay.destroy());
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x666666));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(0x444444));
  }

  private openEliteChallenge(node: MapNode): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    const challenge = node.eliteChallenge;
    if (!challenge) return;

    const fromNodeId = run.currentNodeId;
    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.container(0, 0).setDepth(2000);

    // Dim background
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.82);
    dimBg.fillRect(0, 0, w, h);
    dimBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    overlay.add(dimBg);

    // Panel layout
    const btnWidth = Math.min(520, w - 80);
    const padH = 40;
    const padV = 32;
    const titleFontSize = 22;
    const flavorFontSize = 15;
    const condFontSize = 15;
    const btnHeight = 54;
    const btnGap = 14;

    const charsPerLine = Math.floor(btnWidth / (flavorFontSize * 0.58));
    const flavorLines = Math.ceil(challenge.flavorText.length / charsPerLine) + 1;
    const flavorHeight = flavorLines * (flavorFontSize * 1.55);

    const condText = formatChallengeText(challenge, this.ftpW);
    const condLines = Math.ceil(condText.length / charsPerLine) + 1;
    const condHeight = condLines * (condFontSize * 1.55);

    const rewardLineH = condFontSize * 1.8;
    const ph = padV + titleFontSize + 16 + flavorHeight + 16 + condHeight + rewardLineH + 28 + btnHeight * 2 + btnGap + padV;
    const pw = btnWidth + padH * 2;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    // Panel background
    const panel = this.add.graphics();
    panel.fillStyle(0x0d0d0a, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, 0x3a2800, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);
    overlay.add(panel);

    // Gold banner strip
    const bannerH = titleFontSize + 24;
    const banner = this.add.graphics();
    banner.fillStyle(0x1a1200, 1);
    banner.fillRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    // Thin gold top border
    banner.lineStyle(2, 0xcc9900, 0.8);
    banner.strokeRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    overlay.add(banner);

    // ★ ELITE CHALLENGE title
    overlay.add(this.add.text(w / 2, py + bannerH / 2 - 4, `★  ${challenge.title.toUpperCase()}  ★`, {
      fontFamily: 'monospace',
      fontSize: `${titleFontSize}px`,
      color: '#f0c030',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    let cursorY = py + bannerH + 16;

    // Flavor text (italic-style, muted)
    overlay.add(this.add.text(px + padH, cursorY, challenge.flavorText, {
      fontFamily: 'monospace',
      fontSize: `${flavorFontSize}px`,
      color: '#a09888',
      wordWrap: { width: btnWidth },
      lineSpacing: 3,
      fontStyle: 'italic',
    }).setOrigin(0, 0));
    cursorY += flavorHeight + 16;

    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x3a2800, 0.8);
    divider.lineBetween(px + padH, cursorY - 8, px + pw - padH, cursorY - 8);
    overlay.add(divider);

    // Condition text (white, clear)
    overlay.add(this.add.text(px + padH, cursorY, condText, {
      fontFamily: 'monospace',
      fontSize: `${condFontSize}px`,
      color: '#e8e0d0',
      wordWrap: { width: btnWidth },
      lineSpacing: 3,
    }).setOrigin(0, 0));
    cursorY += condHeight;

    // Reward line
    overlay.add(this.add.text(px + padH, cursorY, `Reward: ${challenge.reward.description}`, {
      fontFamily: 'monospace',
      fontSize: `${condFontSize}px`,
      color: '#f0c030',
      fontStyle: 'bold',
    }).setOrigin(0, 0));
    cursorY += rewardLineH + 18;

    // ── Accept button ──
    const acceptBg = this.add.graphics();
    const drawAccept = (hover: boolean) => {
      acceptBg.clear();
      acceptBg.fillStyle(hover ? 0x6b4e00 : 0x4a3600, 1);
      acceptBg.fillRoundedRect(px + padH, cursorY, btnWidth, btnHeight, 6);
      acceptBg.lineStyle(2, hover ? 0xf0c030 : 0xaa8800, 1);
      acceptBg.strokeRoundedRect(px + padH, cursorY, btnWidth, btnHeight, 6);
    };
    drawAccept(false);
    overlay.add(acceptBg);

    const acceptHit = this.add
      .rectangle(w / 2, cursorY + btnHeight / 2, btnWidth, btnHeight, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    overlay.add(acceptHit);
    overlay.add(this.add.text(w / 2, cursorY + btnHeight / 2, 'ACCEPT CHALLENGE', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f0c030', fontStyle: 'bold',
    }).setOrigin(0.5));

    acceptHit.on('pointerover', () => drawAccept(true));
    acceptHit.on('pointerout',  () => drawAccept(false));
    acceptHit.on('pointerdown', () => {
      const edge = run.edges.find(e =>
        (e.from === fromNodeId && e.to === node.id) ||
        (e.from === node.id && e.to === fromNodeId)
      );

      RunStateManager.setCurrentNode(node.id);
      if (edge) RunStateManager.setActiveEdge(edge);
      overlay.destroy();

      let course = generateCourseProfile(5, 0.05, 'asphalt');
      let isBackwards = false;
      if (edge) {
        if (edge.to === fromNodeId) {
          course = invertCourseProfile(edge.profile);
          isBackwards = true;
        } else {
          course = edge.profile;
        }
      }

      this.scene.start('GameScene', {
        course,
        isBackwards,
        weightKg: this.weightKg,
        units: this.units,
        trainer: this.trainer,
        hrm: this.hrm,
        isRoguelike: true,
        isDevMode: this.isDevMode,
      });
    });

    cursorY += btnHeight + btnGap;

    // ── Retreat button ──
    const retreatBg = this.add.graphics();
    const drawRetreat = (hover: boolean) => {
      retreatBg.clear();
      retreatBg.fillStyle(hover ? 0x2a2a2a : 0x1a1a1a, 1);
      retreatBg.fillRoundedRect(px + padH, cursorY, btnWidth, btnHeight, 6);
      retreatBg.lineStyle(1, hover ? 0x666666 : 0x444444, 1);
      retreatBg.strokeRoundedRect(px + padH, cursorY, btnWidth, btnHeight, 6);
    };
    drawRetreat(false);
    overlay.add(retreatBg);

    const retreatHit = this.add
      .rectangle(w / 2, cursorY + btnHeight / 2, btnWidth, btnHeight, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    overlay.add(retreatHit);
    overlay.add(this.add.text(w / 2, cursorY + btnHeight / 2, 'RETREAT', {
      fontFamily: 'monospace', fontSize: '14px', color: '#888888',
    }).setOrigin(0.5));

    retreatHit.on('pointerover', () => drawRetreat(true));
    retreatHit.on('pointerout',  () => drawRetreat(false));
    retreatHit.on('pointerdown', () => overlay.destroy());
  }

  private openEvent(): void {
    const EVENTS = [
      {
        title: 'Roadside Vendor',
        description: 'A weathered cart sits at the side of the trail. The vendor grins and offers you a choice.',
        options: [
          { label: 'Buy an energy bar for 10 gold — recover your legs for the next climb.', action: () => { RunStateManager.spendGold(10); } },
          { label: 'Trade your fastest segment for a mystery bag of gear.', action: () => {} },
          { label: 'Keep riding and ignore the vendor entirely.', action: () => {} },
        ],
      },
      {
        title: 'Fallen Tree',
        description: 'A massive oak has collapsed across the trail, blocking your path. You assess your options.',
        options: [
          { label: 'Lift your bike over the trunk and scramble through — costs time but no gold.', action: () => {} },
          { label: 'Find a narrow gap under the roots — risky, but you might gain 20 gold from the effort.', action: () => { RunStateManager.addGold(20); } },
          { label: 'Turn back and take the long way around, arriving with fresh legs.', action: () => {} },
        ],
      },
      {
        title: 'Rival Cyclist',
        description: 'A rival in flashy kit challenges you to a quick sprint. The crowd on the roadside cheers.',
        options: [
          { label: 'Accept the challenge — if you win, earn 30 gold and bragging rights.', action: () => { RunStateManager.addGold(30); } },
          { label: 'Decline politely and draft behind them for a free energy boost.', action: () => {} },
          { label: 'Heckle them loudly and ride off while they\'re distracted.', action: () => {} },
        ],
      },
      {
        title: 'Mysterious Fog',
        description: 'A thick fog rolls in from the valley. Shapes move at the edge of your vision and whispers fill the air.',
        options: [
          { label: 'Push through the fog as fast as you can and emerge stronger.', action: () => {} },
          { label: 'Stop and listen — the whispers reveal a hidden shortcut worth 25 gold.', action: () => { RunStateManager.addGold(25); } },
          { label: 'Turn on your lights and proceed carefully, conserving energy.', action: () => {} },
        ],
      },
      {
        title: 'Abandoned Café',
        description: 'A shuttered café with a flickering sign. The door is unlocked and smells of coffee.',
        options: [
          { label: 'Brew a quick espresso — spend 5 gold and ride the next segment with extra focus.', action: () => { RunStateManager.spendGold(5); } },
          { label: 'Raid the pantry and stuff your jersey pockets with whatever you find.', action: () => { RunStateManager.addGold(15); } },
          { label: 'Leave it undisturbed and carry on with what you have.', action: () => {} },
        ],
      },
    ];

    const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    const numOptions = 2 + Math.floor(Math.random() * (event.options.length - 1)); // 2 or 3 options
    const options = event.options.slice(0, numOptions);

    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.container(0, 0).setDepth(2000);

    // Dim background
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.80);
    dimBg.fillRect(0, 0, w, h);
    dimBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    overlay.add(dimBg);

    // Panel dimensions
    const btnWidth = Math.min(520, w - 80);
    const btnHeight = 58;
    const btnGap = 14;
    const descWidth = btnWidth;
    const descFontSize = 16;
    const titleFontSize = 24;
    const padV = 36;
    const padH = 40;

    // Measure description text height (approx 1.4 line-height)
    const charsPerLine = Math.floor(descWidth / (descFontSize * 0.6));
    const descLines = Math.ceil(event.description.length / charsPerLine) + 1;
    const descHeight = descLines * (descFontSize * 1.55);

    const totalBtnsHeight = options.length * (btnHeight + btnGap) - btnGap;
    const ph = padV + titleFontSize + 20 + descHeight + 28 + totalBtnsHeight + padV;
    const pw = btnWidth + padH * 2;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    // Panel background
    const panel = this.add.graphics();
    panel.fillStyle(0x0d0d12, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, 0x2a1a4a, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);
    overlay.add(panel);

    // Title banner strip
    const bannerH = titleFontSize + 24;
    const banner = this.add.graphics();
    banner.fillStyle(0x1a0a2a, 1);
    banner.fillRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    overlay.add(banner);

    // Title text
    overlay.add(this.add.text(w / 2, py + bannerH / 2, event.title, {
      fontFamily: 'monospace',
      fontSize: `${titleFontSize}px`,
      color: '#e8c87a',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    // Description text
    const descY = py + bannerH + 20;
    overlay.add(this.add.text(px + padH, descY, event.description, {
      fontFamily: 'monospace',
      fontSize: `${descFontSize}px`,
      color: '#d0c8b8',
      wordWrap: { width: descWidth },
      lineSpacing: 4,
    }).setOrigin(0, 0));

    // Option buttons
    const btnsStartY = descY + descHeight + 18;
    options.forEach((opt, i) => {
      const bx = px + padH;
      const by = btnsStartY + i * (btnHeight + btnGap);
      const cx = w / 2;
      const cy = by + btnHeight / 2;

      // Button background
      const btn = this.add.graphics();
      const drawBtn = (hover: boolean) => {
        btn.clear();
        btn.fillStyle(hover ? 0x0e5560 : 0x093d46, 1);
        btn.fillRoundedRect(bx, by, btnWidth, btnHeight, 6);
        btn.lineStyle(2, hover ? 0x3dcce0 : 0x1a8a9a, 1);
        btn.strokeRoundedRect(bx, by, btnWidth, btnHeight, 6);
      };
      drawBtn(false);
      overlay.add(btn);

      // Hit area
      const hitRect = this.add.rectangle(cx, cy, btnWidth, btnHeight, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      overlay.add(hitRect);

      // Button text
      const btnTxt = this.add.text(bx + 16, cy, opt.label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        wordWrap: { width: btnWidth - 32 },
        lineSpacing: 2,
      }).setOrigin(0, 0.5);
      overlay.add(btnTxt);

      hitRect.on('pointerover', () => drawBtn(true));
      hitRect.on('pointerout', () => drawBtn(false));
      hitRect.on('pointerdown', () => {
        opt.action();
        overlay.destroy();
        this.updateGoldUI();
      });
    });
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    this.teleportBtn = null;
    this.isTeleportMode = false;
    this.nodeObjects.clear();
    if (this.legendContainer) this.legendContainer.destroy();
    if (this.tooltipContainer) this.tooltipContainer.destroy();
  }
}
