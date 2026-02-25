import Phaser from 'phaser';
import { type RunData, type MapNode, type NodeType } from '../core/roguelike/RunManager';
import { THEME } from '../theme';

const SURFACE_LABELS: Record<string, string> = {
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

export class MapRenderer {
  private scene: Phaser.Scene;
  private mapContainer: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;
  private nodeObjects = new Map<string, Phaser.GameObjects.Container>();
  private edgeObjects = new Map<string, Phaser.GameObjects.Rectangle>();

  private tooltipContainer!: Phaser.GameObjects.Container;
  private tooltipText!: Phaser.GameObjects.Text;

  private onNodeClick: (node: MapNode) => void;

  constructor(
    scene: Phaser.Scene,
    mapContainer: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    onNodeClick: (node: MapNode) => void
  ) {
    this.scene = scene;
    this.mapContainer = mapContainer;
    this.graphics = graphics;
    this.onNodeClick = onNodeClick;

    this.createTooltip();
  }

  public render(
    run: RunData,
    focusedNodeId: string | null,
    isTeleportMode: boolean,
    virtualHeight: number
  ): void {
    this.currentRunData = run;
    this.currentIsTeleportMode = isTeleportMode;

    this.graphics.clear();
    const w = this.scene.scale.width;
    const h = virtualHeight;

    // Clean up stale objects
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

    // Draw Edges
    run.edges.forEach(edge => {
      const fromNode = run.nodes.find(n => n.id === edge.from)!;
      const toNode = run.nodes.find(n => n.id === edge.to)!;

      const fx = fromNode.x * w;
      const fy = fromNode.y * h;
      const tx = toNode.x * w;
      const ty = toNode.y * h;

      const surface = edge.profile.segments[0]?.surface ?? 'asphalt';
      const color = THEME.colors.surfaces[surface as keyof typeof THEME.colors.surfaces] ?? 0x888888;

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
        rect = this.scene.add.rectangle((fx + tx) / 2, (fy + ty) / 2, dist, 24, 0x000000, 0);
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
      const isImperial = (run.units === 'imperial'); // Assuming run has units, or pass it in.
      // Actually run.units is available in RunData.
      const distStr = isImperial
        ? `${(distM / 1609.344).toFixed(1)} mi`
        : `${(distM / 1000).toFixed(1)} km`;
      let tipText = `${SURFACE_LABELS[surface] ?? surface.toUpperCase()}\n${distStr}`;

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

    // Draw Nodes
    run.nodes.forEach(node => {
      let container = this.nodeObjects.get(node.id);
      if (!container) {
        container = this.createNodeUI(node);
        this.nodeObjects.set(node.id, container);
        this.mapContainer.add(container);
      }
      container.setPosition(node.x * w, node.y * h);

      const isReachable = this.isNodeReachable(node.id, run, isTeleportMode);
      const isCurrent = run.currentNodeId === node.id;
      const isCompleted = node.floor < (run.nodes.find(n => n.id === run.currentNodeId)?.floor ?? -1);
      const isFocused = focusedNodeId === node.id;

      const circle = container.getAt(0) as Phaser.GameObjects.Arc;

      // Refresh interactive state and styles (since mode might change)
      // We might need to re-bind listeners if mode changes drastically,
      // but isNodeReachable check inside the click handler handles the logic.
      // However, creating the node UI binds the click handler once.
      // We should update the visual style here.

      if (isCurrent) {
        circle.setStrokeStyle(isFocused ? 4 : 4, isFocused ? 0x00ff00 : 0xffffff, 1);
        circle.setScale(1.2);
        circle.setAlpha(1.0);
        circle.disableInteractive();
      } else if (isReachable) {
        const outlineColor = isTeleportMode ? 0xff88ff : 0xffd700;
        circle.setStrokeStyle(isFocused ? 4 : 3, isFocused ? THEME.colors.status.ok : outlineColor, 1);
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

      // Override visuals for a locked Grand Criterium (finish without all medals)
      if (node.type === 'finish') {
        const medalsHeld = run.inventory.filter(i => i.startsWith('medal_')).length;
        const medalsNeeded = run.runLength;
        if (medalsHeld < medalsNeeded) {
          circle.setStrokeStyle(3, 0xff4444, 1);
          circle.setAlpha(0.5);
        }
      }

      // Re-bind hover logic to update reachability styling if needed?
      // Actually, the pointerout handler resets style based on current reachability.
      // But the reachability depends on isTeleportMode which changes.
      // So we need to ensure the pointerout handler uses the LATEST isTeleportMode.
      // Since isNodeReachable passed here is calculated, but inside the event handler?
      // The event handler needs access to the *current* state.
      // I'll update the event handlers on every render or make them reference a state getter.
      // Or just update the style here, which I did.
      // The pointerout might revert to stale style if not careful.
      // Let's attach metadata to container or use a closure that references the latest run data?
      // Ideally, pass `() => this.isTeleportMode`?
      // For now, I'll just re-bind the pointerout to ensure it captures the current context if I were redefining it,
      // but defining it once in createNodeUI is cleaner if it calls a method.

      // I'll leave createNodeUI to bind once, but make sure it calls a helper that checks current state.
      // But `createNodeUI` is called once. The callbacks need to access `isTeleportMode`.
      // `isTeleportMode` is passed to `render`.
      // I should probably store `isTeleportMode` on the class instance during render, or pass a getter.
    });
  }

  // State tracked for event handlers
  private currentIsTeleportMode = false;
  private currentRunData: RunData | null = null;

  private drawDottedLine(x1: number, y1: number, x2: number, y2: number, gap: number, size: number): void {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);

    for (let d = 0; d < dist; d += gap) {
      const px = x1 + Math.cos(angle) * d;
      const py = y1 + Math.sin(angle) * d;
      this.graphics.fillCircle(px, py, size / 2);
    }
  }

  private createNodeUI(node: MapNode): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);

    const color = THEME.colors.nodes[node.type];
    const circle = this.scene.add.arc(0, 0, 20, 0, 360, false, color);
    circle.setInteractive();

    const label = this.scene.add.text(0, 0, NODE_ICONS[node.type], {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.large,
      color: THEME.colors.text.main,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    container.add([circle, label]);

    circle.on('pointerdown', () => {
      // Use current state
      if (this.currentRunData && this.isNodeReachable(node.id, this.currentRunData, this.currentIsTeleportMode)) {
        this.onNodeClick(node);
      }
    });

    circle.on('pointerover', () => {
      let tipText = NODE_DESCRIPTIONS[node.type];
      if (node.type === 'finish' && this.currentRunData) {
        const medalsHeld = this.currentRunData.inventory.filter(i => i.startsWith('medal_')).length;
        const medalsNeeded = this.currentRunData.runLength;
        if (medalsHeld < medalsNeeded) {
          tipText = `LOCKED: NEED ${medalsNeeded} MEDALS (HAVE ${medalsHeld})`;
        }
      }
      this.showTooltip(container.x, container.y, tipText);
      if (this.currentRunData && this.isNodeReachable(node.id, this.currentRunData, this.currentIsTeleportMode)) {
        circle.setStrokeStyle(3, 0xffffff, 1);
      }
    });

    circle.on('pointerout', () => {
      this.hideTooltip();
      // Need to re-apply the correct style for "idle" state
      if (this.currentRunData) {
          const isReachable = this.isNodeReachable(node.id, this.currentRunData, this.currentIsTeleportMode);
          const isCurrent = this.currentRunData.currentNodeId === node.id;
          // We don't have isFocused here easily without storing it or passing it.
          // But typically pointerout returns to "base" state.
          // Let's roughly match render logic, minus focus highlight (since mouse left).

          if (isCurrent) {
               circle.setStrokeStyle(4, 0xffffff, 1);
          } else if (isReachable) {
               const outlineColor = this.currentIsTeleportMode ? 0xff88ff : 0xffd700;
               circle.setStrokeStyle(3, outlineColor, 1);
          } else {
               const isCompleted = node.floor < (this.currentRunData.nodes.find(n => n.id === this.currentRunData?.currentNodeId)?.floor ?? -1);
               if (isCompleted) {
                   circle.setStrokeStyle(1, 0x000000, 0.5);
               } else {
                   circle.setStrokeStyle(1, 0x000000, 0.3);
               }
          }
      }
    });

    return container;
  }

  private isNodeReachable(nodeId: string, run: RunData, isTeleportMode: boolean): boolean {
    if (!run) return false;

    if (nodeId === run.currentNodeId) return false;

    if (isTeleportMode) {
      return run.visitedNodeIds.includes(nodeId);
    }

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

  private getRequiredKeyForSpoke(spokeId: string): string | null {
    if (spokeId === 'coast') return 'ferry_token';
    if (spokeId === 'mountain') return 'funicular_ticket';
    if (spokeId === 'forest') return 'trail_machete';
    return null;
  }

  private createTooltip(): void {
    this.tooltipContainer = this.scene.add.container(0, 0).setDepth(1000).setAlpha(0);

    const bg = this.scene.add.graphics();
    this.tooltipContainer.add(bg);

    this.tooltipText = this.scene.add.text(0, 0, '', {
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
    bg.fillStyle(THEME.colors.ui.hudBackground, 0.9);
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

  public destroy(): void {
    this.tooltipContainer?.destroy();
    this.nodeObjects.clear();
    this.edgeObjects.clear();
  }
}
