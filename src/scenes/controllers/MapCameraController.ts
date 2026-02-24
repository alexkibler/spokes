import Phaser from 'phaser';
import { type RunData } from '../../roguelike/RunManager';

export class MapCameraController {
  private scene: Phaser.Scene;

  private isDragging = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private potentialDragStartY: number | null = null;
  private readonly DRAG_THRESHOLD = 5;

  private onWheel: (ptr: unknown, objs: unknown, dx: number, dy: number) => void;
  private onPointerDown: (ptr: Phaser.Input.Pointer) => void;
  private onPointerMove: (ptr: Phaser.Input.Pointer) => void;
  private onPointerUp: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.onWheel = (_ptr, _objs, _dx, dy) => {
      if (!this.inputEnabled) return;
      const cam = this.scene.cameras.main;
      const maxScroll = Math.max(0, this.virtualHeight - this.scene.scale.height);
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY + dy * 0.8, 0, maxScroll);
    };

    this.onPointerDown = (ptr) => {
      if (!this.inputEnabled) return;
      this.potentialDragStartY = ptr.y;
      this.dragStartY = ptr.y;
      this.dragStartScrollY = this.scene.cameras.main.scrollY;
    };

    this.onPointerMove = (ptr) => {
      if (this.potentialDragStartY === null) return;
      if (!this.isDragging && Math.abs(ptr.y - this.potentialDragStartY) > this.DRAG_THRESHOLD) {
        this.isDragging = true;
      }
      if (!this.isDragging) return;

      const delta = this.dragStartY - ptr.y;
      const maxScroll = Math.max(0, this.virtualHeight - this.scene.scale.height);
      this.scene.cameras.main.scrollY = Phaser.Math.Clamp(this.dragStartScrollY + delta, 0, maxScroll);
    };

    this.onPointerUp = () => {
      this.isDragging = false;
      this.potentialDragStartY = null;
    };

    this.setupScrolling();
  }

  public get virtualHeight(): number {
    // For Hub-and-Spoke, we can just use the screen height or a fixed larger area.
    return Math.max(this.scene.scale.height, 600);
  }

  private setupScrolling(): void {
    this.scene.input.on('wheel', this.onWheel);
    this.scene.input.on('pointerdown', this.onPointerDown);
    this.scene.input.on('pointermove', this.onPointerMove);
    this.scene.input.on('pointerup', this.onPointerUp);
  }

  public scrollToCurrentNode(run: RunData | null): void {
    if (run?.currentNodeId) {
        this.scrollToNode(run.currentNodeId, run);
    } else {
        // Center view
        const vh = this.virtualHeight;
        const sh = this.scene.scale.height;
        this.scene.cameras.main.scrollY = (vh - sh) / 2;
    }
  }

  public scrollToNode(nodeId: string, run: RunData | null): void {
      if (!run) return;
      const node = run.nodes.find(n => n.id === nodeId);
      if (node) {
        const vh = this.virtualHeight;
        const sh = this.scene.scale.height;
        const maxScroll = Math.max(0, vh - sh);
        const worldY = node.y * vh;
        this.scene.cameras.main.scrollY = Phaser.Math.Clamp(worldY - sh / 2, 0, maxScroll);
      }
  }

  public setBounds(): void {
    const vh = this.virtualHeight;
    this.scene.cameras.main.setBounds(0, 0, this.scene.scale.width, vh);
  }

  public getScrollY(): number {
    return this.scene.cameras.main.scrollY;
  }

  public inputEnabled = true;

  public destroy(): void {
    this.scene.input.off('wheel', this.onWheel);
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
  }
}
