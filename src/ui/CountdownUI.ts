import Phaser from 'phaser';

export class CountdownUI {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private tween: Phaser.Tweens.Tween | null = null;
  private active = false;

  constructor(scene: Phaser.Scene, parent?: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    if (parent) {
      parent.add(this.graphics);
    }
  }

  public setDepth(depth: number): this {
    this.graphics.setDepth(depth);
    return this;
  }

  public setScrollFactor(scrollFactor: number): this {
    this.graphics.setScrollFactor(scrollFactor);
    return this;
  }

  public isActive(): boolean {
    return this.active;
  }

  public startNodeCountdown(x: number, y: number, radius: number, duration: number, onComplete: () => void): void {
    this.stop();
    this.active = true;

    // Draw initial state
    this.drawCircle(x, y, radius, 360);

    this.tween = this.scene.tweens.addCounter({
      from: 360,
      to: 0,
      duration: duration,
      onUpdate: (tween) => {
        if (!this.active) return;
        const angle = tween.getValue();
        this.drawCircle(x, y, radius, angle);
      },
      onComplete: () => {
        if (!this.active) return;
        this.stop();
        onComplete();
      }
    });
  }

  public startButtonCountdown(x: number, y: number, width: number, height: number, duration: number, onComplete: () => void): void {
    this.stop();
    this.active = true;

    // Perimeter of the rectangle
    const perimeter = 2 * (width + height);

    this.drawRect(x, y, width, height, perimeter, perimeter);

    this.tween = this.scene.tweens.addCounter({
      from: perimeter,
      to: 0,
      duration: duration,
      onUpdate: (tween) => {
        if (!this.active) return;
        this.drawRect(x, y, width, height, tween.getValue(), perimeter);
      },
      onComplete: () => {
        if (!this.active) return;
        this.stop();
        onComplete();
      }
    });
  }

  public stop(): void {
    this.active = false;
    if (this.tween) {
      this.tween.remove();
      this.tween = null;
    }
    this.graphics.clear();
  }

  public destroy(): void {
    this.stop();
    this.graphics.destroy();
  }

  private drawCircle(x: number, y: number, radius: number, angleDeg: number): void {
    this.graphics.clear();

    if (angleDeg <= 0) return;

    // Background circle (faint)
    this.graphics.lineStyle(4, 0xffffff, 0.2);
    this.graphics.strokeCircle(x, y, radius);

    // Progress arc
    this.graphics.lineStyle(4, 0xffcc00, 1);
    this.graphics.beginPath();
    // Arc in Phaser: x, y, radius, startAngle, endAngle, anticlockwise
    // We want 360 -> 0.
    // Start at -90 (top).
    // To visualize "depleting", we draw from -90 to (-90 + angle).
    // If angle goes 360 -> 0.
    const startRad = Phaser.Math.DegToRad(-90);
    const endRad = Phaser.Math.DegToRad(-90 + angleDeg);

    this.graphics.arc(x, y, radius, startRad, endRad, false);
    this.graphics.strokePath();
  }

  private drawRect(x: number, y: number, width: number, height: number, progressLen: number, totalLen: number): void {
    this.graphics.clear();

    // Coordinates are center-based or top-left?
    // Let's assume (x, y) is Top-Left to match Phaser rectangle conventions usually,
    // OR Center if implied.
    // The prompt says "around the recommended reward button".
    // Usually buttons are positioned by center or top-left.
    // I'll assume x,y is Top-Left for now, consistent with width/height.

    // Background border
    this.graphics.lineStyle(4, 0xffffff, 0.2);
    this.graphics.strokeRect(x, y, width, height);

    if (progressLen <= 0) return;

    this.graphics.lineStyle(4, 0xffcc00, 1);

    // "Shrinks" along the perimeter.
    // Start top-left, go clockwise? Or center-top?
    // Let's start top-left, clockwise.
    // Top -> Right -> Bottom -> Left.

    const halfPerimeter = totalLen / 2;
    // Actually, let's keep it simple: just draw the path up to progressLen.
    // But we want it to *shrink*.
    // So we draw from Start to Start + ProgressLen?
    // Or Start + (Total - Progress) to End?
    // "Emptying along the perimeter".
    // A full rectangle is visible. As it shrinks, the line recedes.
    // Let's make it recede counter-clockwise towards top-left?
    // Or clockwise end recedes?
    // Let's do: Start at Top-Left. Draw clockwise up to `progressLen`.

    const path = new Phaser.Curves.Path(x, y);

    let remaining = progressLen;

    // Top edge
    if (remaining > 0) {
        const take = Math.min(remaining, width);
        path.lineTo(x + take, y);
        remaining -= take;
    }
    // Right edge
    if (remaining > 0) {
        const take = Math.min(remaining, height);
        path.lineTo(x + width, y + take);
        remaining -= take;
    }
    // Bottom edge
    if (remaining > 0) {
        const take = Math.min(remaining, width);
        path.lineTo(x + width - take, y + height);
        remaining -= take;
    }
    // Left edge
    if (remaining > 0) {
        const take = Math.min(remaining, height);
        path.lineTo(x, y + height - take);
        remaining -= take;
    }

    path.draw(this.graphics);
  }
}
