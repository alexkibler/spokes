/**
 * EquipmentOverlay.ts
 *
 * Full-screen equipment management panel accessible from the map.
 *
 * Layout:
 *  ┌─────────────────────────────────────────┐
 *  │  EQUIPMENT                         [×]  │
 *  │  ┌──────┐┌──────┐┌──────┐┌──────┐┌─────┐ │
 *  │  │HELMET││FRAME ││CRANKS││PEDALS││TIRES│ │
 *  │  │ name ││ name ││ name ││ name ││name │ │
 *  │  └──────┘└──────┘└──────┘└──────┘└─────┘ │
 *  │  INVENTORY ─────────────────────────────  │
 *  │  [item row]  [EQUIP]                      │
 *  │  [item row]  (consumable — no button)     │
 *  └─────────────────────────────────────────┘
 *
 * Clicking an occupied slot unequips the item → inventory.
 * Clicking EQUIP on an inventory equipment item:
 *   • Slot empty → equip immediately.
 *   • Slot occupied → show inline swap-warning modal, then equip on confirm.
 */

import Phaser from 'phaser';
import { RunStateManager } from '../../roguelike/RunState';
import { ITEM_REGISTRY, ALL_SLOTS, SLOT_LABELS, formatModifierLines, type EquipmentSlot } from '../../roguelike/ItemRegistry';
import { THEME } from '../../theme';

// ─── layout ────────────────────────────────────────────────────────────────
const PANEL_W = 520;
const SLOT_W  = 88;
const SLOT_H  = 70;
const SLOT_GAP = 6;
const ROW_H   = 38;
const ROW_GAP = 6;

export class EquipmentOverlay extends Phaser.GameObjects.Container {
  private onClose: () => void;
  private contentGroup: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, scrollY: number, onClose: () => void) {
    super(scene, 0, scrollY);
    this.setDepth(2100);
    this.onClose = onClose;

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim background — blocks all input beneath the overlay.
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

    this.buildContent();
    scene.add.existing(this);
  }

  // ── Public rebuild (called after equip/unequip to refresh state) ──────────

  private buildContent(): void {
    const scene = this.scene;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;

    // Remove previous dynamic content.
    for (const obj of this.contentGroup) {
      if (obj && (obj as Phaser.GameObjects.GameObject).active) {
        (obj as Phaser.GameObjects.GameObject).destroy();
      }
    }
    this.contentGroup = [];

    const run = RunStateManager.getRun();
    if (!run) return;

    // ── Measure panel height dynamically ─────────────────────────────────────
    // Count unique inventory rows (deduplicated by id).
    const invCounts = new Map<string, number>();
    for (const id of run.inventory) {
      invCounts.set(id, (invCounts.get(id) ?? 0) + 1);
    }
    const invIds = [...invCounts.keys()];

    const HEADER_H    = 52;
    const SLOTS_H     = 16 + SLOT_H + 16;
    const INV_TITLE_H = 28;
    const INV_H       = invIds.length > 0
      ? invIds.length * (ROW_H + ROW_GAP) + ROW_GAP
      : 32;
    const CLOSE_H     = 52;
    const PANEL_H     = HEADER_H + SLOTS_H + INV_TITLE_H + INV_H + CLOSE_H;

    const px = cx - PANEL_W / 2;
    const py = Math.max(10, (h - PANEL_H) / 2);

    // ── Panel background ──────────────────────────────────────────────────────
    const panel = scene.add.graphics();
    panel.fillStyle(THEME.colors.ui.panelBg, 1);
    panel.fillRoundedRect(px, py, PANEL_W, PANEL_H, 12);
    panel.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    panel.strokeRoundedRect(px, py, PANEL_W, PANEL_H, 12);
    this.add(panel);
    this.contentGroup.push(panel);

    // ── Title ─────────────────────────────────────────────────────────────────
    const title = scene.add.text(cx, py + 24, 'EQUIPMENT', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.title,
      color: THEME.colors.text.gold,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(title);
    this.contentGroup.push(title);

    // Close ×
    const closeHit = scene.add.text(px + PANEL_W - 20, py + 18, '×', {
      fontFamily: THEME.fonts.main, fontSize: '24px', color: THEME.colors.text.muted,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => closeHit.setColor(THEME.colors.text.main));
    closeHit.on('pointerout',  () => closeHit.setColor(THEME.colors.text.muted));
    closeHit.on('pointerdown', () => { this.destroy(); this.onClose(); });
    this.add(closeHit);
    this.contentGroup.push(closeHit);

    // ── Equipment slots ───────────────────────────────────────────────────────
    let slotsY = py + HEADER_H + 8;
    const totalSlotsW = ALL_SLOTS.length * SLOT_W + (ALL_SLOTS.length - 1) * SLOT_GAP;
    const slotsLeft   = cx - totalSlotsW / 2;

    ALL_SLOTS.forEach((slot, i) => {
      const sx   = slotsLeft + i * (SLOT_W + SLOT_GAP);
      const equippedId = run.equipped[slot];

      const slotBg = scene.add.graphics();
      const isEmpty = !equippedId;
      slotBg.fillStyle(isEmpty ? 0x111122 : 0x1e2a1e, 1);
      slotBg.fillRoundedRect(sx, slotsY, SLOT_W, SLOT_H, 6);
      slotBg.lineStyle(1, isEmpty ? 0x333355 : 0x336633, 1);
      slotBg.strokeRoundedRect(sx, slotsY, SLOT_W, SLOT_H, 6);
      this.add(slotBg);
      this.contentGroup.push(slotBg);

      const slotLabel = scene.add.text(sx + SLOT_W / 2, slotsY + 8, SLOT_LABELS[slot], {
        fontFamily: THEME.fonts.main, fontSize: '9px',
        color: isEmpty ? '#555577' : '#66aa66', fontStyle: 'bold', letterSpacing: 1,
      }).setOrigin(0.5, 0);
      this.add(slotLabel);
      this.contentGroup.push(slotLabel);

      if (equippedId) {
        const def = ITEM_REGISTRY[equippedId];
        const nameLines = this.wrapText(def?.label ?? equippedId, 9);

        const nameText = scene.add.text(sx + SLOT_W / 2, slotsY + 22, nameLines.join('\n'), {
          fontFamily: THEME.fonts.main, fontSize: '9px', color: '#ccffcc',
          align: 'center', wordWrap: { width: SLOT_W - 8 },
        }).setOrigin(0.5, 0);
        this.add(nameText);
        this.contentGroup.push(nameText);

        // Stat line(s)
        if (def?.modifier) {
          const statLines = formatModifierLines(def.modifier);
          const statText = scene.add.text(sx + SLOT_W / 2, slotsY + SLOT_H - 6, statLines.join(' '), {
            fontFamily: THEME.fonts.main, fontSize: '8px', color: '#aaddaa',
            align: 'center', wordWrap: { width: SLOT_W - 4 },
          }).setOrigin(0.5, 1);
          this.add(statText);
          this.contentGroup.push(statText);
        }

        // Click to unequip
        const hitZone = scene.add.rectangle(sx + SLOT_W / 2, slotsY + SLOT_H / 2, SLOT_W, SLOT_H, 0xffffff, 0)
          .setInteractive({ useHandCursor: true });
        hitZone.on('pointerover', () => {
          slotBg.clear();
          slotBg.fillStyle(0x2a3a2a, 1);
          slotBg.fillRoundedRect(sx, slotsY, SLOT_W, SLOT_H, 6);
          slotBg.lineStyle(1, 0x44aa44, 1);
          slotBg.strokeRoundedRect(sx, slotsY, SLOT_W, SLOT_H, 6);
        });
        hitZone.on('pointerout', () => {
          slotBg.clear();
          slotBg.fillStyle(0x1e2a1e, 1);
          slotBg.fillRoundedRect(sx, slotsY, SLOT_W, SLOT_H, 6);
          slotBg.lineStyle(1, 0x336633, 1);
          slotBg.strokeRoundedRect(sx, slotsY, SLOT_W, SLOT_H, 6);
        });
        hitZone.on('pointerdown', () => {
          RunStateManager.unequipItem(slot);
          this.buildContent();
        });
        this.add(hitZone);
        this.contentGroup.push(hitZone);
      } else {
        const emptyText = scene.add.text(sx + SLOT_W / 2, slotsY + SLOT_H / 2, 'EMPTY', {
          fontFamily: THEME.fonts.main, fontSize: '9px', color: '#333355',
        }).setOrigin(0.5);
        this.add(emptyText);
        this.contentGroup.push(emptyText);
      }
    });

    // ── Inventory section ─────────────────────────────────────────────────────
    const invTitleY = slotsY + SLOT_H + 16;
    const invTitle = scene.add.text(px + 16, invTitleY, 'INVENTORY', {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: THEME.colors.text.muted,
      fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0, 0.5);
    this.add(invTitle);
    this.contentGroup.push(invTitle);

    // Divider
    const divider = scene.add.graphics();
    divider.lineStyle(1, 0x2a2a44, 1);
    divider.lineBetween(px + 16, invTitleY + 14, px + PANEL_W - 16, invTitleY + 14);
    this.add(divider);
    this.contentGroup.push(divider);

    const rowsStartY = invTitleY + INV_TITLE_H;

    if (invIds.length === 0) {
      const empty = scene.add.text(cx, rowsStartY + 12, 'Inventory is empty.', {
        fontFamily: THEME.fonts.main, fontSize: '11px', color: '#444466',
      }).setOrigin(0.5, 0);
      this.add(empty);
      this.contentGroup.push(empty);
    } else {
      invIds.forEach((itemId, rowIdx) => {
        const count = invCounts.get(itemId) ?? 1;
        const def   = ITEM_REGISTRY[itemId];
        const isEquipment = !!def?.slot;
        const ry    = rowsStartY + rowIdx * (ROW_H + ROW_GAP);

        // Row background
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(0x13131f, 1);
        rowBg.fillRoundedRect(px + 12, ry, PANEL_W - 24, ROW_H, 4);
        this.add(rowBg);
        this.contentGroup.push(rowBg);

        // Item name + count
        const countStr = count > 1 ? ` ×${count}` : '';
        const nameText = scene.add.text(px + 22, ry + ROW_H / 2, `${def?.label ?? itemId}${countStr}`, {
          fontFamily: THEME.fonts.main, fontSize: '11px', color: '#ccccdd',
        }).setOrigin(0, 0.5);
        this.add(nameText);
        this.contentGroup.push(nameText);

        // Modifier summary for equipment
        if (isEquipment && def?.modifier) {
          const statStr = formatModifierLines(def.modifier).join('  ');
          const statText = scene.add.text(px + 22, ry + ROW_H / 2 + 1, statStr, {
            fontFamily: THEME.fonts.main, fontSize: '9px', color: '#7777aa',
          }).setOrigin(0, -0.7);
          this.add(statText);
          this.contentGroup.push(statText);
        }

        // EQUIP button for equipment items only
        if (isEquipment) {
          const btnW = 66;
          const btnH = 24;
          const btnX = px + PANEL_W - 12 - btnW / 2;
          const btnY = ry + ROW_H / 2;

          const btnBg = scene.add.rectangle(btnX, btnY, btnW, btnH, THEME.colors.buttons.primary)
            .setInteractive({ useHandCursor: true });
          const btnLabel = scene.add.text(btnX, btnY, 'EQUIP', {
            fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
          }).setOrigin(0.5);

          btnBg.on('pointerover', () => btnBg.setFillStyle(THEME.colors.buttons.primaryHover));
          btnBg.on('pointerout',  () => btnBg.setFillStyle(THEME.colors.buttons.primary));
          btnBg.on('pointerdown', () => {
            this.handleEquip(itemId, def!.slot!);
          });

          this.add(btnBg);
          this.add(btnLabel);
          this.contentGroup.push(btnBg);
          this.contentGroup.push(btnLabel);
        }
      });
    }

    // ── Close button ──────────────────────────────────────────────────────────
    const closeBtnY = py + PANEL_H - 28;
    const closeBg = scene.add.rectangle(cx, closeBtnY, 120, 30, THEME.colors.buttons.secondary)
      .setInteractive({ useHandCursor: true });
    const closeLbl = scene.add.text(cx, closeBtnY, 'CLOSE', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    closeBg.on('pointerover', () => closeBg.setFillStyle(THEME.colors.buttons.secondaryHover));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(THEME.colors.buttons.secondary));
    closeBg.on('pointerdown', () => { this.destroy(); this.onClose(); });
    this.add(closeBg);
    this.add(closeLbl);
    this.contentGroup.push(closeBg);
    this.contentGroup.push(closeLbl);
  }

  // ── Equip flow ────────────────────────────────────────────────────────────

  private handleEquip(itemId: string, slot: EquipmentSlot): void {
    const run = RunStateManager.getRun();
    if (!run) return;

    const occupant = run.equipped[slot];
    if (!occupant) {
      // Slot is free — equip directly.
      RunStateManager.equipItem(itemId);
      this.buildContent();
    } else {
      // Slot occupied — show swap warning.
      this.showSwapWarning(itemId, slot, occupant);
    }
  }

  private showSwapWarning(incomingId: string, slot: EquipmentSlot, currentId: string): void {
    const scene = this.scene;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;

    const incomingDef = ITEM_REGISTRY[incomingId];
    const currentDef  = ITEM_REGISTRY[currentId];

    const MODAL_W = 360;
    const MODAL_H = 220;
    const mx = cx - MODAL_W / 2;
    const my = (h - MODAL_H) / 2;

    const modal: Phaser.GameObjects.GameObject[] = [];

    // Dim behind modal
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, 0.7);
    dim.fillRect(0, 0, w, h);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(dim);
    modal.push(dim);

    // Modal panel
    const mpanel = scene.add.graphics();
    mpanel.fillStyle(0x0d0d1e, 1);
    mpanel.fillRoundedRect(mx, my, MODAL_W, MODAL_H, 10);
    mpanel.lineStyle(2, 0xcc6600, 1);
    mpanel.strokeRoundedRect(mx, my, MODAL_W, MODAL_H, 10);
    this.add(mpanel);
    modal.push(mpanel);

    // Warning header
    const headerTxt = scene.add.text(cx, my + 18, `REPLACE ${SLOT_LABELS[slot]}?`, {
      fontFamily: THEME.fonts.main, fontSize: '14px', color: '#ffaa44', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add(headerTxt);
    modal.push(headerTxt);

    // Current (red)
    const curLines = currentDef?.modifier ? formatModifierLines(currentDef.modifier) : [];
    const curBlock = [
      `UNEQUIPPING: ${currentDef?.label ?? currentId}`,
      ...curLines.map(l => `  − ${l}`),
    ].join('\n');
    const curTxt = scene.add.text(cx - 80, my + 50, curBlock, {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ff8888',
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.add(curTxt);
    modal.push(curTxt);

    // Incoming (green)
    const incLines = incomingDef?.modifier ? formatModifierLines(incomingDef.modifier) : [];
    const incBlock = [
      `EQUIPPING: ${incomingDef?.label ?? incomingId}`,
      ...incLines.map(l => `  + ${l}`),
    ].join('\n');
    const incTxt = scene.add.text(cx - 80, my + 50 + 16 + curLines.length * 14, incBlock, {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#88ff88',
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.add(incTxt);
    modal.push(incTxt);

    const destroyModal = () => {
      for (const obj of modal) {
        if (obj && (obj as Phaser.GameObjects.GameObject).active) {
          (obj as Phaser.GameObjects.GameObject).destroy();
        }
      }
    };

    // Confirm button
    const confirmBg = scene.add.rectangle(cx - 70, my + MODAL_H - 28, 120, 30, 0x1a4a1a)
      .setInteractive({ useHandCursor: true });
    const confirmLbl = scene.add.text(cx - 70, my + MODAL_H - 28, 'CONFIRM SWAP', {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#88ff88', fontStyle: 'bold',
    }).setOrigin(0.5);
    confirmBg.on('pointerover', () => confirmBg.setFillStyle(0x2a6a2a));
    confirmBg.on('pointerout',  () => confirmBg.setFillStyle(0x1a4a1a));
    confirmBg.on('pointerdown', () => {
      destroyModal();
      RunStateManager.equipItem(incomingId);
      this.buildContent();
    });
    this.add(confirmBg);
    this.add(confirmLbl);
    modal.push(confirmBg);
    modal.push(confirmLbl);

    // Cancel button
    const cancelBg = scene.add.rectangle(cx + 70, my + MODAL_H - 28, 100, 30, 0x3a2a2a)
      .setInteractive({ useHandCursor: true });
    const cancelLbl = scene.add.text(cx + 70, my + MODAL_H - 28, 'CANCEL', {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ff8888', fontStyle: 'bold',
    }).setOrigin(0.5);
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0x5a3a3a));
    cancelBg.on('pointerout',  () => cancelBg.setFillStyle(0x3a2a2a));
    cancelBg.on('pointerdown', () => destroyModal());
    this.add(cancelBg);
    this.add(cancelLbl);
    modal.push(cancelBg);
    modal.push(cancelLbl);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private wrapText(text: string, maxLen: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxLen) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
