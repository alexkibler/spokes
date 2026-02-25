import Phaser from 'phaser';
import { RunManager } from '../../roguelike/RunManager';
import { ALL_SLOTS, type EquipmentSlot } from '../../roguelike/registry/types';
import { formatModifierLines } from '../../roguelike/ModifierUtils';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';
import i18n from '../../i18n';
import { BaseOverlay } from './BaseOverlay';

interface ShopItemConfig {
  id: string;
  description: string;
  basePrice: number;
  color: number;
  hoverColor: number;
  /** false = one per run (tailwind), true = stackable with scaling price */
  stackable: boolean;
}

const CATALOG: ShopItemConfig[] = [
  { id: 'tailwind',        description: '2× power toggle during ride',     basePrice: 100, color: 0x2a2a44, hoverColor: 0x3a3a5a, stackable: false },
  { id: 'teleport',        description: 'Warp to any visited node',         basePrice: 10,  color: 0x442244, hoverColor: 0x553355, stackable: true  },
  { id: 'reroll_voucher',  description: 'Reroll reward choices once',       basePrice: 50,  color: 0x2a2a08, hoverColor: 0x3a3a10, stackable: true  },
  { id: 'aero_helmet',     description: '+3% drag reduction (stacks)',      basePrice: 60,  color: 0x1a2a3a, hoverColor: 0x2a3a4a, stackable: true  },
  { id: 'gold_crank',      description: '×1.25 permanent power (stacks)',   basePrice: 120, color: 0x3a2a00, hoverColor: 0x4a3a00, stackable: true  },
  { id: 'antigrav_pedals', description: '-8% rider weight (stacks)',         basePrice: 90,  color: 0x1a3a1a, hoverColor: 0x2a4a2a, stackable: true  },
  { id: 'dirt_tires',      description: '-35% rolling resistance (stacks)', basePrice: 70,  color: 0x1a1a0a, hoverColor: 0x2a2a14, stackable: true  },
  { id: 'carbon_frame',    description: '-12% weight, +3% aero (stacks)',   basePrice: 150, color: 0x0a1a2a, hoverColor: 0x142030, stackable: true  },
];

/** Sell price = 50% of base price (rounded down). Only items in CATALOG are sellable. */
const SELL_PRICES: Record<string, number> = Object.fromEntries(
  CATALOG.map(item => [item.id, Math.floor(item.basePrice / 2)])
);

const ITEM_H = 46;
const ITEM_GAP = 6;
const SELL_ROW_H = 36;
const SELL_ROW_GAP = 4;
const LW = 350; // left panel width
const RW = 420; // right panel width
const PANEL_GAP = 20;

export class ShopOverlay extends BaseOverlay {
  private goldTxt!: Phaser.GameObjects.Text;
  private onAction: () => void;
  // private runManager: RunManager; // Inherited from BaseOverlay

  // Groups for panels we rebuild on refresh
  private itemsGroup: Phaser.GameObjects.GameObject[] = [];
  private catalogBtns: Button[] = [];

  // Relative coordinates within panelContainer
  private lx = 0;
  private rx = 0;
  private lw = LW;

  constructor(scene: Phaser.Scene, scrollY: number, runManager: RunManager, onAction: () => void, onClose: () => void) {
    // ── Geometry ─────────────────────────────────────────────────────────────
    const rHeaderH = 80;
    const rFooterH = 48;
    const ph = rHeaderH + CATALOG.length * (ITEM_H + ITEM_GAP) + rFooterH;
    const totalW = LW + PANEL_GAP + RW;

    super({
        scene,
        width: totalW,
        height: ph,
        scrollY,
        runManager,
        onClose: undefined, // We handle close button manually to position it in right panel
        hasPanelBackground: false
    });

    this.onAction = onAction;
    this.onClose = onClose; // Store it for our custom button

    // Calculate relative X positions
    this.lx = 0;
    this.rx = LW + PANEL_GAP;

    // ── Left panel background ────────────────────────────────────────────────
    const leftBg = scene.add.graphics();
    leftBg.fillStyle(THEME.colors.ui.panelBg, 1);
    leftBg.fillRoundedRect(this.lx, 0, LW, ph, 12);
    leftBg.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    leftBg.strokeRoundedRect(this.lx, 0, LW, ph, 12);
    this.panelContainer.add(leftBg);

    // Left panel title
    const leftTitle = scene.add.text(this.lx + LW / 2, 22, 'YOUR ITEMS', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.title,
      color: '#aaddff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.panelContainer.add(leftTitle);

    // ── Right panel background ───────────────────────────────────────────────
    const rightBg = scene.add.graphics();
    rightBg.fillStyle(THEME.colors.ui.panelBg, 1);
    rightBg.fillRoundedRect(this.rx, 0, RW, ph, 12);
    rightBg.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    rightBg.strokeRoundedRect(this.rx, 0, RW, ph, 12);
    this.panelContainer.add(rightBg);

    const rightTitle = scene.add.text(this.rx + RW / 2, 22, 'TRAIL SHOP', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.title,
      color: THEME.colors.text.gold, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.panelContainer.add(rightTitle);

    const run = this.runManager.getRun();
    this.goldTxt = scene.add.text(this.rx + RW / 2, 52, `GOLD: ${run?.gold ?? 0}`, {
      fontFamily: THEME.fonts.main, fontSize: '15px', color: THEME.colors.text.main,
    }).setOrigin(0.5);
    this.panelContainer.add(this.goldTxt);

    // ── Build panels ─────────────────────────────────────────────────────────
    this.buildItemsPanel();
    this.buildCatalog();

    // ── Close button ─────────────────────────────────────────────────────────
    const closeBtn = new Button(scene, {
      x: this.rx + RW / 2,
      y: ph - rFooterH / 2,
      text: 'CLOSE',
      onClick: () => {
        this.destroy();
        onClose();
      },
      variant: 'secondary',
    });
    this.panelContainer.add(closeBtn);
  }

  // ── Items panel (left) ───────────────────────────────────────────────────

  private buildItemsPanel(): void {
    // Destroy previous content
    for (const obj of this.itemsGroup) {
      if (obj && (obj as Phaser.GameObjects.GameObject).active) {
        (obj as Phaser.GameObjects.GameObject).destroy();
      }
    }
    this.itemsGroup = [];

    const scene = this.scene;
    const run = this.runManager.getRun();
    if (!run) return;

    const lx = this.lx;
    const lw = this.lw;
    let y = 48; // relative to panel top

    // ── Equipped section ─────────────────────────────────────────────────────
    const eqHeader = scene.add.text(lx + 14, y, 'EQUIPPED', {
      fontFamily: THEME.fonts.main, fontSize: '10px',
      color: THEME.colors.text.muted, fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0, 0.5);
    this.panelContainer.add(eqHeader);
    this.itemsGroup.push(eqHeader);

    const div1 = scene.add.graphics();
    div1.lineStyle(1, 0x2a2a44, 1);
    div1.lineBetween(lx + 14, y + 12, lx + lw - 14, y + 12);
    this.panelContainer.add(div1);
    this.itemsGroup.push(div1);

    y += 24;

    for (const slot of ALL_SLOTS) {
      const equippedId = run.equipped[slot as EquipmentSlot];
      this.addSlotRow(slot as EquipmentSlot, equippedId ?? null, lx, lw, y);
      y += SELL_ROW_H + SELL_ROW_GAP;
    }

    y += 6;

    // ── Inventory section ────────────────────────────────────────────────────
    const invHeader = scene.add.text(lx + 14, y, 'INVENTORY', {
      fontFamily: THEME.fonts.main, fontSize: '10px',
      color: THEME.colors.text.muted, fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0, 0.5);
    this.panelContainer.add(invHeader);
    this.itemsGroup.push(invHeader);

    const div2 = scene.add.graphics();
    div2.lineStyle(1, 0x2a2a44, 1);
    div2.lineBetween(lx + 14, y + 12, lx + lw - 14, y + 12);
    this.panelContainer.add(div2);
    this.itemsGroup.push(div2);

    y += 24;

    // Group by id
    const invCounts = new Map<string, number>();
    for (const id of run.inventory) {
      invCounts.set(id, (invCounts.get(id) ?? 0) + 1);
    }

    if (invCounts.size === 0) {
      const empty = scene.add.text(lx + lw / 2, y + 10, '— nothing —', {
        fontFamily: THEME.fonts.main, fontSize: '11px', color: '#444466',
      }).setOrigin(0.5, 0);
      this.panelContainer.add(empty);
      this.itemsGroup.push(empty);
    } else {
      for (const [itemId, count] of invCounts) {
        this.addInventoryRow(itemId, count, lx, lw, y);
        y += SELL_ROW_H + SELL_ROW_GAP;
      }
    }
  }

  private addSlotRow(slot: EquipmentSlot, itemId: string | null, lx: number, lw: number, y: number): void {
    const scene = this.scene;
    const rowBg = scene.add.graphics();
    rowBg.fillStyle(itemId ? 0x1a2a1a : 0x111120, 1);
    rowBg.fillRoundedRect(lx + 10, y, lw - 20, SELL_ROW_H, 4);
    this.panelContainer.add(rowBg);
    this.itemsGroup.push(rowBg);

    // Slot label
    const slotTxt = scene.add.text(lx + 20, y + SELL_ROW_H / 2, i18n.t(`slots.${slot}`), {
      fontFamily: THEME.fonts.main, fontSize: '9px', color: '#555577', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.panelContainer.add(slotTxt);
    this.itemsGroup.push(slotTxt);

    if (itemId) {
      const def = this.runManager.registry.getItem(itemId);
      const label = i18n.exists(`item.${itemId}`) ? i18n.t(`item.${itemId}`) : (def?.label ?? itemId);
      const modStr = def?.modifier ? formatModifierLines(def.modifier).join('  ') : '';

      const nameCol = lx + 72;
      const nameTxt = scene.add.text(nameCol, y + (modStr ? SELL_ROW_H / 2 - 5 : SELL_ROW_H / 2), label, {
        fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ccffcc',
      }).setOrigin(0, 0.5);
      this.panelContainer.add(nameTxt);
      this.itemsGroup.push(nameTxt);

      if (modStr) {
        const modTxt = scene.add.text(nameCol, y + SELL_ROW_H / 2 + 6, modStr, {
          fontFamily: THEME.fonts.main, fontSize: '8px', color: '#7799aa',
        }).setOrigin(0, 0.5);
        this.panelContainer.add(modTxt);
        this.itemsGroup.push(modTxt);
      }

      const sellPrice = SELL_PRICES[itemId];
      if (sellPrice !== undefined) {
        this.addSellButton(lx + lw - 20, y + SELL_ROW_H / 2, sellPrice, () => {
          this.runManager.unequipItem(slot);
          this.runManager.removeFromInventory(itemId);
          this.runManager.addGold(sellPrice);
          this.refreshAll();
        });
      }
    } else {
      const emptyTxt = scene.add.text(lx + 72, y + SELL_ROW_H / 2, '— empty —', {
        fontFamily: THEME.fonts.main, fontSize: '10px', color: '#333355',
      }).setOrigin(0, 0.5);
      this.panelContainer.add(emptyTxt);
      this.itemsGroup.push(emptyTxt);
    }
  }

  private addInventoryRow(itemId: string, count: number, lx: number, lw: number, y: number): void {
    const scene = this.scene;
    const def = this.runManager.registry.getItem(itemId);
    const isEquip = !!def?.slot;

    const rowBg = scene.add.graphics();
    rowBg.fillStyle(0x111120, 1);
    rowBg.fillRoundedRect(lx + 10, y, lw - 20, SELL_ROW_H, 4);
    this.panelContainer.add(rowBg);
    this.itemsGroup.push(rowBg);

    const label = i18n.exists(`item.${itemId}`) ? i18n.t(`item.${itemId}`) : (def?.label ?? itemId);
    const countStr = count > 1 ? ` ×${count}` : '';

    const nameTxt = scene.add.text(lx + 20, y + SELL_ROW_H / 2, `${label}${countStr}`, {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: isEquip ? '#aaaacc' : '#ccccdd',
    }).setOrigin(0, 0.5);
    this.panelContainer.add(nameTxt);
    this.itemsGroup.push(nameTxt);

    const sellPrice = SELL_PRICES[itemId];
    if (sellPrice !== undefined) {
      this.addSellButton(lx + lw - 20, y + SELL_ROW_H / 2, sellPrice, () => {
        this.runManager.removeFromInventory(itemId);
        this.runManager.addGold(sellPrice);
        this.refreshAll();
      });
    }
  }

  private addSellButton(rightEdgeX: number, midY: number, price: number, onClick: () => void): void {
    const scene = this.scene;
    const BTN_W = 74;
    const BTN_H = 24;
    const bx = rightEdgeX - BTN_W / 2;

    const btnBg = scene.add.rectangle(bx, midY, BTN_W, BTN_H, 0x4a1a1a)
      .setInteractive({ useHandCursor: true });
    const btnLbl = scene.add.text(bx, midY, `SELL  ${price}g`, {
      fontFamily: THEME.fonts.main, fontSize: '9px', color: '#ffaaaa', fontStyle: 'bold',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => btnBg.setFillStyle(0x6a2a2a));
    btnBg.on('pointerout',  () => btnBg.setFillStyle(0x4a1a1a));
    btnBg.on('pointerdown', onClick);

    this.panelContainer.add(btnBg);
    this.panelContainer.add(btnLbl);
    this.itemsGroup.push(btnBg, btnLbl);
  }

  // ── Catalog panel (right) ────────────────────────────────────────────────

  private buildCatalog(): void {
    // Destroy previous catalog buttons
    for (const btn of this.catalogBtns) {
      if (btn.active) btn.destroy();
    }
    this.catalogBtns = [];

    const scene = this.scene;
    const rx = this.rx;
    const itemX = rx + RW / 2;
    const firstItemY = 80; // relative to panel top

    /** Total owned (inventory + equipped) for price scaling and sold-out checks. */
    const totalOwned = (itemId: string): number => {
      const runData = this.runManager.getRun();
      if (!runData) return 0;
      const inInv = runData.inventory.filter(i => i === itemId).length;
      const inSlot = Object.values(runData.equipped).filter(id => id === itemId).length;
      return inInv + inSlot;
    };

    const itemPrice = (item: ShopItemConfig): number =>
      Math.round(item.basePrice * Math.pow(1.5, totalOwned(item.id)));

    for (let i = 0; i < CATALOG.length; i++) {
      const itemCfg = CATALOG[i];
      const iy = firstItemY + i * (ITEM_H + ITEM_GAP);
      const price = itemPrice(itemCfg);
      const owned = totalOwned(itemCfg.id);
      const soldOut = !itemCfg.stackable && owned > 0;
      const runData = this.runManager.getRun();
      const canAfford = (runData?.gold ?? 0) >= price;

      const def = this.runManager.registry.getItem(itemCfg.id);
      const label = i18n.t(def?.label ?? itemCfg.id);

      let btnText: string;
      if (soldOut) {
        btnText = `${label}\n✓ OWNED`;
      } else {
        const ownedStr = owned > 0 ? ` (×${owned})` : '';
        btnText = `${label}${ownedStr}\n${itemCfg.description} — ${price} GOLD`;
      }

      const btn = new Button(scene, {
        x: itemX,
        y: iy + ITEM_H / 2,
        width: RW - 20,
        height: ITEM_H,
        text: btnText,
        variant: 'primary',
        onClick: () => {
          const p = itemPrice(itemCfg);
          if (!this.runManager.spendGold(p)) return;
          this.runManager.addToInventory(itemCfg.id);
          this.refreshAll();
          this.onAction();
        }
      });

      if (soldOut || !canAfford) btn.setEnabled(false);

      this.panelContainer.add(btn);
      this.catalogBtns.push(btn);
    }
  }

  private refreshAll(): void {
    const run = this.runManager.getRun();
    this.goldTxt.setText(`GOLD: ${run?.gold ?? 0}`);
    this.buildItemsPanel();
    this.buildCatalog();
  }
}
