/**
 * MapScene.ts
 * 
 * Roguelike map traversal scene.
 * Procedurally generates a DAG of nodes (rides, shops, etc.).
 */

import Phaser from 'phaser';
import { RunStateManager, type MapNode, type MapEdge, type NodeType } from '../roguelike/RunState';
import { generateCourseProfile, type CourseProfile, type SurfaceType } from '../course/CourseProfile';
import type { Units } from './MenuScene';
import type { ITrainerService } from '../services/ITrainerService';
import { HeartRateService } from '../services/HeartRateService';

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
  finish:   0x000000,
};

const NODE_ICONS: Record<NodeType, string> = {
  start:    'S',
  standard: 'R',
  hard:     'H',
  shop:     '$',
  finish:   'F',
};

const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  start:    'START',
  standard: 'RIDE',
  hard:     'HARD RIDE',
  shop:     'SHOP',
  finish:   'FINISH',
};

export class MapScene extends Phaser.Scene {
  private units: Units = 'imperial';
  private weightKg = 75;
  private trainer: ITrainerService | null = null;
  private hrm: HeartRateService | null = null;
  private isDevMode = false;

  private mapContainer!: Phaser.GameObjects.Container;
  private graphics!: Phaser.GameObjects.Graphics;
  private nodeObjects = new Map<string, Phaser.GameObjects.Container>();
  
  private tooltipContainer!: Phaser.GameObjects.Container;
  private tooltipText!: Phaser.GameObjects.Text;
  private legendContainer!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MapScene' });
  }

  init(data: {
    weightKg: number;
    units: Units;
    trainer: ITrainerService | null;
    hrm: HeartRateService | null;
    isDevMode?: boolean;
  }): void {
    this.weightKg = data.weightKg;
    this.units = data.units;
    this.trainer = data.trainer;
    this.hrm = data.hrm;
    this.isDevMode = data.isDevMode ?? false;

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

    this.updateGoldUI();
    this.buildLegend();
    this.createTooltip();

    this.scale.on('resize', this.onResize, this);
    this.onResize();
  }

  private updateGoldUI(): void {
    const run = RunStateManager.getRun();
    if (!run || !this.sys.isActive()) return;

    if (!this.goldText) {
      this.goldText = this.add.text(this.scale.width - 20, 20, `GOLD: ${run.gold}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#8b5a00',
        fontStyle: 'bold',
      }).setOrigin(1, 0);
    } else {
      this.goldText.setText(`GOLD: ${run.gold}`);
      this.goldText.setX(this.scale.width - 20);
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
      else node.type = this.getRandomNodeType(node.floor, totalFloors);
    });

    nodes.forEach(fromNode => {
      fromNode.connectedTo.forEach(toId => {
        const toNode = nodes.find(n => n.id === toId)!;
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          segment: generateCourseProfile(5, this.getMaxGrade(run.difficulty, toNode.type)).segments[0]
        });
      });
    });

    run.nodes = nodes;
    run.edges = edges;
  }

  private getRandomNodeType(floor: number, total: number): NodeType {
    const r = Math.random();
    // Shops appear more frequently as we progress, but never on the first few floors
    if (floor > 2 && r < 0.15) return 'shop';
    // Hard rides become more likely later on
    if (r < 0.2 + (floor / total) * 0.3) return 'hard';
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

      const color = SURFACE_FILL_COLORS[edge.segment.surface ?? 'asphalt'];
      
      // Highlight paths connected to the current node
      const isFromCurrent = run.currentNodeId === fromNode.id;
      // High contrast: 1.0 alpha for active, 0.4 for inactive (was 0.25)
      const alpha = isFromCurrent ? 1.0 : 0.4;
      const dotSize = isFromCurrent ? 8 : 5;
      const gap = dotSize * 1.8;
      
      this.graphics.fillStyle(color, alpha);
      // Add a slight stroke/glow if active?
      if (isFromCurrent) {
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
        circle.setStrokeStyle(3, 0xffd700, 1); // Gold outline
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
    
    const targetNode = run.nodes.find(n => n.id === nodeId);
    if (!targetNode) return false;

    // 1. Initial Choice
    if (!run.currentNodeId) {
      return targetNode.floor === 0;
    }

    const currentNode = run.nodes.find(n => n.id === run.currentNodeId);
    if (!currentNode) return false;

    // 2. Strict Forward Movement
    return targetNode.floor > currentNode.floor && currentNode.connectedTo.includes(nodeId);
  }

  private onNodeClick(node: MapNode): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    // Handle Start Node (no edge to traverse)
    if (node.floor === 0 && !run.currentNodeId) {
        RunStateManager.setCurrentNode(node.id);
        this.drawMap();
        return;
    }

    if (node.type === 'shop') {
      RunStateManager.setCurrentNode(node.id);
      this.openShop();
      this.drawMap();
      this.updateGoldUI();
    } else {
      const edge = run.edges.find(e => e.from === run.currentNodeId && e.to === node.id);
      if (!edge && node.floor !== 0) return; // Should not happen if reachable

      // Create course from edge segment
      const segment = edge ? edge.segment : generateCourseProfile(5, 0.05).segments[0];
      const course: CourseProfile = {
        segments: [segment],
        totalDistanceM: segment.distanceM
      };

      RunStateManager.setCurrentNode(node.id);

      this.scene.start('GameScene', {
        course,
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
    const itemY = py + 150;
    const price = 100;

    const buyBtn = this.add.rectangle(itemX, itemY, 320, 60, 0x2a2a44).setInteractive({ useHandCursor: true });
    const buyTxt = this.add.text(itemX, itemY, `TAILWIND (2x POWER)\nPrice: ${price} GOLD`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5);
    overlay.add([buyBtn, buyTxt]);

    const refreshShop = () => {
      goldTxt.setText(`GOLD: ${run.gold}`);
      if (run.inventory.includes('tailwind')) {
        buyTxt.setText('TAILWIND - OWNED');
        buyBtn.setFillStyle(0x1a5a3a);
        buyBtn.disableInteractive();
      } else if (run.gold < price) {
        buyBtn.setFillStyle(0x442222);
        buyBtn.disableInteractive();
        buyTxt.setAlpha(0.5);
      } else {
        buyBtn.setFillStyle(0x2a2a44);
        buyBtn.setInteractive();
        buyTxt.setAlpha(1);
      }
    };

    buyBtn.on('pointerdown', () => {
      if (RunStateManager.spendGold(price)) {
        RunStateManager.addToInventory('tailwind');
        refreshShop();
        this.updateGoldUI();
      }
    });

    buyBtn.on('pointerover', () => {
      if (!run.inventory.includes('tailwind') && run.gold >= price) buyBtn.setFillStyle(0x3a3a5a);
    });
    buyBtn.on('pointerout', () => {
      if (!run.inventory.includes('tailwind') && run.gold >= price) buyBtn.setFillStyle(0x2a2a44);
    });

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

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
  }
}
