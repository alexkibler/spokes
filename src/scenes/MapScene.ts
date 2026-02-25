/**
 * MapScene.ts
 * 
 * Roguelike map traversal scene.
 * Procedurally generates a DAG of nodes (rides, shops, etc.).
 */

import Phaser from 'phaser';
import type { RunManager, MapNode } from '../core/roguelike/RunManager';
import { generateCourseProfile, invertCourseProfile, type CourseProfile } from '../core/course/CourseProfile';
import { generateHubAndSpokeMap } from '../core/course/CourseGenerator';
import type { EliteChallenge } from '../core/roguelike/EliteChallenge';
import { createBossRacers, createSpokeBoss, type RacerProfile } from '../core/race/RacerProfile';
import { THEME } from '../theme';
import { ShopOverlay } from '../ui/overlay/ShopOverlay';
import { EventOverlay } from '../ui/overlay/EventOverlay';
import { EliteChallengeOverlay } from '../ui/overlay/EliteChallengeOverlay';
import { EquipmentOverlay } from '../ui/overlay/EquipmentOverlay';
import { RemotePairingOverlay } from '../ui/overlay/RemotePairingOverlay';
import { ConfirmationModal } from '../components/ConfirmationModal';

import { MapRenderer } from '../rendering/MapRenderer';
import { MapStatsPanel } from '../ui/MapStatsPanel';
import { MapModifiersBar } from '../ui/MapModifiersBar';
import { MapHUD } from '../ui/MapHUD';
import { MapCameraController } from './controllers/MapCameraController';
import type { SaveManager } from '../services/SaveManager';
import type { GameServices } from '../services/ServiceLocator';
import i18n from '../i18n';

export class MapScene extends Phaser.Scene {
  private mapRenderer!: MapRenderer;
  private statsPanel!: MapStatsPanel;
  private modifiersBar!: MapModifiersBar;
  private hud!: MapHUD;
  private cameraController!: MapCameraController;
  private runManager!: RunManager;
  private saveManager!: SaveManager;
  private services!: GameServices;

  private isTeleportMode = false;
  private overlayActive = false;
  private focusedNodeId: string | null = null;
  private onRemoteCursorMoveBound = this.onRemoteCursorMove.bind(this);
  private onRemoteCursorSelectBound = this.onRemoteCursorSelect.bind(this);

  constructor() {
    super({ key: 'MapScene' });
  }

  init(): void {
    this.services = this.registry.get('services') as GameServices;
    if (!this.services) {
        throw new Error('GameServices not found in registry!');
    }
    this.runManager = this.services.runManager;
    this.saveManager = this.services.saveManager;

    const run = this.runManager.getRun();
    if (run && run.nodes.length === 0) {
      this.generateMap(run);
      const startNode = run.nodes.find((n: MapNode) => n.type === 'start');
      if (startNode) this.runManager.setCurrentNode(startNode.id);

      // Save initial map generation
      if (this.saveManager) {
          this.saveManager.saveRun(this.runManager.exportData());
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor(THEME.colors.backgroundHex);

    // Initialize focus
    const run = this.runManager.getRun();
    if (run) {
        if (run.currentNodeId) {
            this.focusedNodeId = run.currentNodeId;
        } else {
            const start = run.nodes.find(n => n.type === 'start');
            this.focusedNodeId = start ? start.id : (run.nodes[0]?.id ?? null);
        }
    }

    // Initialize Components
    const mapContainer = this.add.container(0, 0);
    const graphics = this.add.graphics();
    mapContainer.add(graphics);

    this.mapRenderer = new MapRenderer(this, mapContainer, graphics, (node) => this.onNodeClick(node));
    this.statsPanel = new MapStatsPanel(this);
    this.modifiersBar = new MapModifiersBar(this);

    this.hud = new MapHUD(this, this.services.remoteService, {
        onGearClick: () => this.openEquipmentOverlay(),
        onRemoteClick: () => this.handleRemoteClick(),
        onReturnClick: () => {
            this.runManager.returnToHub();
            if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
            this.scene.restart();
        },
        onTeleportClick: () => {
            this.isTeleportMode = !this.isTeleportMode;
            this.refresh();
        }
    });

    this.cameraController = new MapCameraController(this);
    this.cameraController.setBounds();

    this.scale.on('resize', this.onResize, this);

    // Initial Draw
    this.refresh();

    // Scroll to current
    this.cameraController.scrollToCurrentNode(run);

    this.checkPendingNodeAction();

    this.services.remoteService.onCursorMove(this.onRemoteCursorMoveBound);
    this.services.remoteService.onCursorSelect(this.onRemoteCursorSelectBound);
  }

  private refresh(): void {
    const run = this.runManager.getRun();
    if (!run) return;

    this.mapRenderer.render(run, this.focusedNodeId, this.isTeleportMode, this.cameraController.virtualHeight);
    this.statsPanel.render(run);
    this.modifiersBar.render(run);
    this.hud.update(run, this.isTeleportMode);
  }

  private onResize(): void {
    if (!this.sys.isActive()) return;
    this.cameraController.setBounds();
    this.refresh();
    this.cameraController.scrollToCurrentNode(this.runManager.getRun());
  }

  private generateMap(run: any): void {
    generateHubAndSpokeMap(run);
  }

  private openEquipmentOverlay(): void {
      if (this.overlayActive) return;
      this.overlayActive = true;
      this.cameraController.inputEnabled = false;
      const overlay = new EquipmentOverlay(this, this.cameraController.getScrollY(), this.runManager, () => {
        this.overlayActive = false;
        this.cameraController.inputEnabled = true;
        this.refresh();
        if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
      });
      overlay.setDepth(2100);
  }

  private handleRemoteClick(): void {
      if (this.overlayActive) return;

      const currentCode = this.services.remoteService.getRoomCode();
      if (currentCode) {
        this.overlayActive = true;
        this.cameraController.inputEnabled = false;
        new RemotePairingOverlay(this, currentCode, () => {
            this.overlayActive = false;
            this.cameraController.inputEnabled = true;
        });
        return;
      }

      this.hud.setRemoteButtonText('CONNECTING...');
      
      // We perform the async operation here
      this.services.remoteService.initHost().then(newCode => {
          this.hud.setRemoteButtonText(`REMOTE: ${newCode}`, THEME.colors.text.success); // Handled by HUD update too, but instant feedback
          this.overlayActive = true;
          this.cameraController.inputEnabled = false;
          new RemotePairingOverlay(this, newCode, () => {
              this.overlayActive = false;
              this.cameraController.inputEnabled = true;
          });
      }).catch(e => {
          console.error('Remote init failed', e);
          this.hud.setRemoteButtonText('ERR', THEME.colors.text.danger);
          this.time.delayedCall(2000, () => this.refresh());
      });
  }

  private onRemoteCursorMove(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.overlayActive) return;
    const run = this.runManager.getRun();
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
    this.refresh();
    this.cameraController.scrollToNode(this.focusedNodeId, run);
  }

  private onRemoteCursorSelect(): void {
      if (this.overlayActive) return;
      if (!this.focusedNodeId) return;
      const run = this.runManager.getRun();
      const node = run?.nodes.find(n => n.id === this.focusedNodeId);
      if (node) {
        if (this.isNodeReachable(node.id)) {
             this.onNodeClick(node);
        }
      }
  }

  private isNodeReachable(nodeId: string): boolean {
    const run = this.runManager.getRun();
    if (!run) return false;

    if (nodeId === run.currentNodeId) return false;

    if (this.isTeleportMode) {
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

  private onNodeClick(node: MapNode): void {
    const run = this.runManager.getRun();
    if (!run) return;

    if (this.isTeleportMode) {
      if (run.visitedNodeIds.includes(node.id)) {
        if (this.runManager.removeFromInventory('teleport')) {
          this.runManager.setCurrentNode(node.id);
          this.isTeleportMode = false;
          this.refresh();
          if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
        }
      }
      return;
    }

    const connectingEdge = run.edges.find(e =>
      (e.from === run.currentNodeId && e.to === node.id) ||
      (e.from === node.id && e.to === run.currentNodeId)
    );
    console.log(`[SPOKES] onNodeClick: node=${node.id} type=${node.type} floor=${node.floor} currentNode=${run.currentNodeId} connectingEdge=${connectingEdge ? `${connectingEdge.from}→${connectingEdge.to} cleared=${connectingEdge.isCleared}` : 'none'}`);

    // Hazard Confirmation Check
    if (run.currentNodeId === 'node_hub' && connectingEdge?.to === node.id && node.metadata?.spokeId) {
      const key = this.getRequiredKeyForSpoke(node.metadata.spokeId);
      if (key && !run.inventory.includes(key)) {
        this.openOverlay(() => new ConfirmationModal(this, {
          title: '⚠ HAZARD WARNING ⚠',
          message: `This path is blocked by a hazard! Without the ${key.replace('_', ' ').toUpperCase()}, you must brute-force your way through with a BRUTAL Zone 5+ effort. Are you sure?`,
          confirmLabel: 'PUSH THROUGH',
          cancelLabel: 'RETREAT',
          confirmColor: THEME.colors.buttons.danger,
          onConfirm: () => {
            this.closeOverlay();
            this.proceedWithNodeTransition(node, connectingEdge);
          },
          onCancel: () => {
            this.closeOverlay();
          }
        }));
        return;
      }
    }

    // Final Boss Lock Check
    if (node.type === 'finish' && connectingEdge) {
      const medals = run.inventory.filter(i => i.startsWith('medal_'));
      const needed = run.runLength;
      if (medals.length < needed) {
        console.log('LOCKED: Need more medals');
        return;
      }
    }

    if (node.type === 'elite') {
      this.openEliteChallenge(node);
      return;
    }

    this.proceedWithNodeTransition(node, connectingEdge);
  }

  private getRequiredKeyForSpoke(spokeId: string): string | null {
    if (spokeId === 'coast') return 'ferry_token';
    if (spokeId === 'mountain') return 'funicular_ticket';
    if (spokeId === 'forest') return 'trail_machete';
    return null;
  }

  private proceedWithNodeTransition(node: MapNode, edge?: any): void {
    const run = this.runManager.getRun();
    if (!run) return;

    if (!edge && node.floor !== 0) return;

    let course: any = generateCourseProfile(5, 0.05, 'asphalt');
    let isBackwards = false;

    if (edge) {
      let profileToUse = edge.profile;

      // Hazard Override Logic
      if (run.currentNodeId === 'node_hub' && edge.to === node.id && node.metadata?.spokeId) {
           const key = this.getRequiredKeyForSpoke(node.metadata.spokeId);
           if (key) {
               if (run.inventory.includes(key)) {
                   // Bypass hazard!
                   const distKm = edge.profile.totalDistanceM / 1000;
                   profileToUse = generateCourseProfile(distKm, 0.00, 'asphalt');
               } else {
                   // BRUTE FORCE HAZARD!
                   profileToUse = {
                       ...edge.profile,
                       segments: [
                           { distanceM: 1000, grade: 0.12, surface: 'mud' }, // Brutal mud climb
                           ...edge.profile.segments
                       ],
                       totalDistanceM: edge.profile.totalDistanceM + 1000
                   };
               }
           }
      }

      if (edge.to === run.currentNodeId) {
        course = invertCourseProfile(profileToUse);
        isBackwards = true;
      } else {
        course = profileToUse;
      }
      this.runManager.setActiveEdge(edge);
    }

    const destNodeId = edge
      ? (edge.to === run.currentNodeId ? edge.from : edge.to)
      : node.id;
    const destNode = run.nodes.find(n => n.id === destNodeId);
    let racers: RacerProfile[] = [];
    const ftpW = run.ftpW ?? 200;

    if (destNode?.type === 'finish') {
      racers = createBossRacers(ftpW);
    } else if (destNode?.type === 'boss') {
      const spokeId = destNode.metadata?.spokeId as 'plains' | 'mountain' | 'coast' | 'forest' | undefined;
      if (spokeId) racers = [createSpokeBoss(spokeId, ftpW)];
    }
    console.log(`[SPOKES] proceedWithNodeTransition → destNode=${destNodeId} type=${destNode?.type} racers=${racers.length} edge=${edge ? `${edge.from}→${edge.to}` : 'none'}`);

    const splashRacer = destNode?.type === 'boss' ? racers[0] : racers[4];
    if (racers.length > 0 && splashRacer) {
      const spokeId = destNode?.metadata?.spokeId;
      this.showBossEncounterSplash(splashRacer, () => {
        this.scene.start('GameScene', {
          course, isBackwards,
          isRoguelike: true, activeChallenge: null, racers,
        });
      }, spokeId);
    } else {
      this.scene.start('GameScene', {
        course, isBackwards,
        isRoguelike: true, activeChallenge: null,
      });
    }
  }

  private checkPendingNodeAction(): void {
    const run = this.runManager.getRun();
    if (!run?.pendingNodeAction) return;

    const action = run.pendingNodeAction;
    this.runManager.setPendingNodeAction(null);
    if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());

    if (action === 'shop') {
      this.openShop();
    } else if (action === 'event') {
      this.openEvent();
    }
  }

  // Helper to manage overlay state and camera input
  private openOverlay(factory: () => Phaser.GameObjects.GameObject): void {
      this.overlayActive = true;
      this.cameraController.inputEnabled = false;
      const obj = factory();
      this.add.existing(obj);
  }

  private closeOverlay(): void {
      this.overlayActive = false;
      this.cameraController.inputEnabled = true;
  }

  private openShop(): void {
    this.openOverlay(() => new ShopOverlay(
      this,
      this.cameraController.getScrollY(),
      this.runManager,
      () => {
          this.refresh(); // Update Gold
          if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
      },
      () => {
          this.closeOverlay();
          if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
      }
    ));
  }

  private openEvent(onComplete?: () => void): void {
    this.openOverlay(() => new EventOverlay(
      this,
      this.cameraController.getScrollY(),
      this.runManager,
      () => {
        onComplete?.();
        this.refresh();
        if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
      },
      () => this.closeOverlay()
    ));
  }

  private openEliteChallenge(node: MapNode): void {
    const run = this.runManager.getRun();
    const ftpW = run?.ftpW ?? 200;
    const powerMult = this.runManager.getModifiers().powerMult;

    this.openOverlay(() => new EliteChallengeOverlay(
      this,
      this.cameraController.getScrollY(),
      this.runManager,
      node,
      ftpW * powerMult,
      (course, challenge) => {
        this.closeOverlay();
        this.startGameWithEliteChallenge(node, course, challenge);
      },
      () => this.closeOverlay()
    ));
  }

  private startGameWithEliteChallenge(node: MapNode, course: CourseProfile, challenge: EliteChallenge): void {
    const run = this.runManager.getRun();
    if (!run) return;
    const fromNodeId = run.currentNodeId;
    const edge = run.edges.find(e =>
      (e.from === fromNodeId && e.to === node.id) ||
      (e.from === node.id && e.to === fromNodeId)
    );

    console.log(`[SPOKES] startGameWithEliteChallenge: challenge=${challenge.id} node=${node.id} fromNodeId=${fromNodeId} edge=${edge ? `${edge.from}→${edge.to} cleared=${edge.isCleared}` : 'NOT FOUND'}`);

    if (edge) {
      this.runManager.setActiveEdge(edge);
    } else {
      const fallbackEdge = run.edges.find(e => e.from === node.id || e.to === node.id);
      if (fallbackEdge) {
        const sourceId = fallbackEdge.to === node.id ? fallbackEdge.from : fallbackEdge.to;
        console.log(`[SPOKES] startGameWithEliteChallenge: using fallback edge ${fallbackEdge.from}→${fallbackEdge.to}, srcId=${sourceId}`);
        this.runManager.setCurrentNode(sourceId);
        this.runManager.setActiveEdge(fallbackEdge);
      } else {
        console.warn(`[SPOKES] startGameWithEliteChallenge: no edge found at all — isFirstClear will be false`);
        this.runManager.setCurrentNode(node.id);
        this.runManager.setActiveEdge(null);
      }
    }

    this.scene.start('GameScene', {
      course,
      isBackwards: false,
      isRoguelike: true,
      activeChallenge: challenge,
    });
  }

  private showBossEncounterSplash(racer: RacerProfile, onProceed: () => void, spokeId?: string): void {
    const w  = this.scale.width;
    const h  = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const mono = THEME.fonts.main;
    const depth = 2100; // Above everything

    this.overlayActive = true;
    this.cameraController.inputEnabled = false;

    const dim = this.add.graphics().setDepth(depth).setScrollFactor(0);
    dim.fillStyle(THEME.colors.ui.hudBackground, 0.88);
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

    const titleText = spokeId ? '⚠ ' + i18n.t(`biomes.${spokeId}.name`) + ' BOSS' : '⚠ FINAL BOSS';

    this.add.text(cx, py + 22, titleText, {
      fontFamily: mono, fontSize: THEME.fonts.sizes.default, color: racer.accentHex, letterSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);

    this.add.text(cx, py + 44, racer.displayName, {
      fontFamily: mono, fontSize: '30px', fontStyle: 'bold', color: racer.hexColor, letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(depth + 2).setScrollFactor(0);

    this.add.text(cx, py + 88, racer.flavorText, {
      fontFamily: mono, fontSize: '12px', color: THEME.colors.text.muted, align: 'center',
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
        fontFamily: mono, fontSize: THEME.fonts.sizes.small, color: '#666677', letterSpacing: 2,
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
      fontFamily: mono, fontSize: THEME.fonts.sizes.large, fontStyle: 'bold', color: racer.hexColor, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth + 3).setScrollFactor(0);

    const btnHit = this.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(depth + 4);

    btnHit
      .on('pointerover',  () => { drawBtn(true);  btnLabel.setColor('#000000'); })
      .on('pointerout',   () => { drawBtn(false); btnLabel.setColor(racer.hexColor); })
      .on('pointerdown',  () => {
        this.closeOverlay();
        onProceed();
      });
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    this.mapRenderer.destroy();
    this.statsPanel.destroy();
    this.modifiersBar.destroy();
    this.hud.destroy();
    this.cameraController.destroy();

    this.services.remoteService.offCursorMove(this.onRemoteCursorMoveBound);
    this.services.remoteService.offCursorSelect(this.onRemoteCursorSelectBound);
  }
}
