import Phaser from 'phaser';

export interface Focusable {
  object: Phaser.GameObjects.GameObject;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelect?: () => void;
  priority?: number; // Higher is better (e.g. for overlays)
}

export class FocusManager {
  private items: Focusable[] = [];
  private currentFocus: Focusable | null = null;

  constructor(_scene: Phaser.Scene) {
    // Scene reference kept for future use (e.g. sound effects)
  }

  public add(item: Focusable): void {
    this.items.push(item);
  }

  public remove(object: Phaser.GameObjects.GameObject): void {
    this.items = this.items.filter(i => i.object !== object);
    if (this.currentFocus?.object === object) {
      this.currentFocus = null;
    }
  }

  public clear(): void {
    this.items = [];
    this.currentFocus = null;
  }

  public focus(item: Focusable): void {
    if (this.currentFocus && this.currentFocus !== item) {
      this.currentFocus.onBlur?.();
    }
    this.currentFocus = item;
    this.currentFocus.onFocus?.();
  }

  public getFocusedItem(): Focusable | null {
    return this.currentFocus;
  }

  public handleSelect(): void {
    this.currentFocus?.onSelect?.();
  }

  public handleInput(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.items.length === 0) return;

    // If nothing focused, focus the first item (or highest priority)
    if (!this.currentFocus) {
      // Sort by priority desc, then y, then x
      const sorted = [...this.items].sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pa !== pb) return pb - pa;

        const ba = this.getBounds(a.object);
        const bb = this.getBounds(b.object);
        if (Math.abs(ba.centerY - bb.centerY) > 10) return ba.centerY - bb.centerY;
        return ba.centerX - bb.centerX;
      });
      this.focus(sorted[0]);
      return;
    }

    const currentBounds = this.getBounds(this.currentFocus.object);
    let candidates = this.items.filter(i => i !== this.currentFocus);

    // Filter by general direction
    candidates = candidates.filter(item => {
      const b = this.getBounds(item.object);
      // Ensure we are comparing center points
      const dx = b.centerX - currentBounds.centerX;
      const dy = b.centerY - currentBounds.centerY;

      switch (direction) {
        case 'up':    return dy < -5; // Small buffer
        case 'down':  return dy > 5;
        case 'left':  return dx < -5;
        case 'right': return dx > 5;
      }
    });

    if (candidates.length === 0) return;

    // Find closest
    let bestCandidate = candidates[0];
    let bestScore = Number.MAX_VALUE;

    candidates.forEach(item => {
      const b = this.getBounds(item.object);
      const dx = b.centerX - currentBounds.centerX;
      const dy = b.centerY - currentBounds.centerY;

      // Euclidean distance squared
      const distSq = dx * dx + dy * dy;

      // Penalize misalignment to prefer orthogonal moves
      // e.g. if moving Up/Down, penalize X distance
      let alignmentPenalty = 0;
      if (direction === 'up' || direction === 'down') {
        alignmentPenalty = Math.abs(dx) * 2;
      } else {
        alignmentPenalty = Math.abs(dy) * 2;
      }

      // Weight the score
      const score = distSq + alignmentPenalty * alignmentPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = item;
      }
    });

    this.focus(bestCandidate);
  }

  private getBounds(obj: Phaser.GameObjects.GameObject): Phaser.Geom.Rectangle {
    // getBounds() returns global coordinates for Containers/Sprites
    if ('getBounds' in obj) {
        return (obj as any).getBounds();
    }
    // Fallback
    return new Phaser.Geom.Rectangle(0, 0, 0, 0);
  }
}
