import Phaser from 'phaser';
import { RunStateManager } from '../../roguelike/RunState';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';

export class ShopOverlay extends Phaser.GameObjects.Container {
  private goldTxt: Phaser.GameObjects.Text;
  private onAction: () => void;

  constructor(scene: Phaser.Scene, scrollY: number, onAction: () => void, onClose: () => void) {
    super(scene, 0, scrollY);
    this.setDepth(2000);
    this.onAction = onAction;

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim background
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

    // ── Item catalog ────────────────────────────────────────────────────────
    interface ShopItem {
      id: string;
      label: string;
      description: string;
      basePrice: number;
      color: number;
      hoverColor: number;
      /** false = one per run (tailwind), true = stackable with scaling price */
      stackable: boolean;
    }
    const CATALOG: ShopItem[] = [
      { id: 'tailwind',        label: 'TAILWIND',          description: '2× power toggle during ride',     basePrice: 100, color: 0x2a2a44, hoverColor: 0x3a3a5a, stackable: false },
      { id: 'teleport',        label: 'TELEPORT SCROLL',   description: 'Warp to any visited node',         basePrice: 10,  color: 0x442244, hoverColor: 0x553355, stackable: true  },
      { id: 'reroll_voucher',  label: 'REROLL VOUCHER',    description: 'Reroll reward choices once',       basePrice: 50,  color: 0x2a2a08, hoverColor: 0x3a3a10, stackable: true  },
      { id: 'aero_helmet',     label: 'AERO HELMET',       description: '+3% drag reduction (stacks)',      basePrice: 60,  color: 0x1a2a3a, hoverColor: 0x2a3a4a, stackable: true  },
      { id: 'gold_crank',      label: 'SOLID GOLD CRANK',  description: '×1.25 permanent power (stacks)',   basePrice: 120, color: 0x3a2a00, hoverColor: 0x4a3a00, stackable: true  },
      { id: 'antigrav_pedals', label: 'ANTIGRAV PEDALS',   description: '-8% rider weight (stacks)',         basePrice: 90,  color: 0x1a3a1a, hoverColor: 0x2a4a2a, stackable: true  },
      { id: 'dirt_tires',      label: 'DIRT TIRES',        description: '-35% rolling resistance (stacks)', basePrice: 70,  color: 0x1a1a0a, hoverColor: 0x2a2a14, stackable: true  },
      { id: 'carbon_frame',    label: 'CARBON FRAME',      description: '-12% weight, +3% aero (stacks)',   basePrice: 150, color: 0x0a1a2a, hoverColor: 0x142030, stackable: true  },
    ];

    const ITEM_H = 52;
    const pw = 420;
    const ph = 90 + CATALOG.length * (ITEM_H + 8) + 50;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(THEME.colors.ui.panelBg, 1);
    panel.fillRoundedRect(px, py, pw, ph, 12);
    panel.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 12);
    this.add(panel);

    this.add(scene.add.text(w / 2, py + 24, 'TRAIL SHOP', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.title, color: THEME.colors.text.gold, fontStyle: 'bold',
    }).setOrigin(0.5));

    const run = RunStateManager.getRun();
    this.goldTxt = scene.add.text(w / 2, py + 58, `GOLD: ${run?.gold ?? 0}`, {
      fontFamily: THEME.fonts.main, fontSize: '15px', color: THEME.colors.text.main,
    }).setOrigin(0.5);
    this.add(this.goldTxt);

    const itemX = w / 2;
    let firstItemY = py + 82;

    // ── Build rows ──────────────────────────────────────────────────────────
    const btns: Button[] = [];

    /** Total owned (inventory + equipped) for price scaling and sold-out checks. */
    const totalOwned = (itemId: string): number => {
      const runData = RunStateManager.getRun();
      if (!runData) return 0;
      const inInv = runData.inventory.filter(i => i === itemId).length;
      const inSlot = Object.values(runData.equipped).filter(id => id === itemId).length;
      return inInv + inSlot;
    };

    const itemPrice = (item: ShopItem): number => {
      return Math.round(item.basePrice * Math.pow(1.5, totalOwned(item.id)));
    };

    const refreshShop = () => {
      const runData = RunStateManager.getRun();
      if (!runData) return;

      this.goldTxt.setText(`GOLD: ${runData.gold}`);

      for (let i = 0; i < CATALOG.length; i++) {
        const item = CATALOG[i];
        const btn  = btns[i];
        const price = itemPrice(item);
        const owned = totalOwned(item.id);
        const soldOut = !item.stackable && owned > 0;
        const canAfford = runData.gold >= price;

        if (soldOut) {
          btn.setText(`${item.label}\n✓ OWNED`);
          btn.setEnabled(false);
        } else if (!canAfford) {
          const ownedStr = owned > 0 ? ` (×${owned})` : '';
          btn.setText(`${item.label}${ownedStr}\n${item.description} — ${price} GOLD`);
          btn.setEnabled(false);
        } else {
          const ownedStr = owned > 0 ? ` (×${owned})` : '';
          btn.setText(`${item.label}${ownedStr}\n${item.description} — ${price} GOLD`);
          btn.setEnabled(true);
        }
      }
    };

    for (let i = 0; i < CATALOG.length; i++) {
      const item = CATALOG[i];
      const iy = firstItemY + i * (ITEM_H + 8);

      const btn = new Button(scene, {
        x: itemX,
        y: iy + ITEM_H/2,
        width: pw - 20,
        height: ITEM_H,
        text: '',
        color: item.color,
        hoverColor: item.hoverColor,
        onClick: () => {
          const price = itemPrice(item);
          if (!RunStateManager.spendGold(price)) return;

          // All items (equipment and consumable alike) go into inventory unequipped.
          // Equipment items are activated via the Equipment overlay.
          RunStateManager.addToInventory(item.id);
          refreshShop();
          this.onAction();
        }
      });

      this.add(btn);
      btns.push(btn);
    }

    refreshShop();

    // ── Close button ────────────────────────────────────────────────────────
    const closeBtnY = py + ph - 28;
    const closeBtn = new Button(scene, {
      x: w / 2,
      y: closeBtnY,
      text: 'CLOSE',
      onClick: () => {
        this.destroy();
        onClose();
      },
      color: THEME.colors.buttons.secondary,
      hoverColor: THEME.colors.buttons.secondaryHover,
    });
    this.add(closeBtn);

    scene.add.existing(this);
  }
}
