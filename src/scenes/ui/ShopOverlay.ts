import Phaser from 'phaser';
import { RunStateManager } from '../../roguelike/RunState';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';
import { EQUIPMENT_DATABASE } from '../../roguelike/Equipment';

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
      type: 'passive' | 'equipment';
    }
    const CATALOG: ShopItem[] = [
      { id: 'tailwind',        label: 'TAILWIND',          description: '2× power toggle during ride',     basePrice: 100, color: 0x2a2a44, hoverColor: 0x3a3a5a, type: 'passive' },
      { id: 'teleport',        label: 'TELEPORT SCROLL',   description: 'Warp to any visited node',         basePrice: 10,  color: 0x442244, hoverColor: 0x553355, type: 'passive' },
      { id: 'reroll_voucher',  label: 'REROLL VOUCHER',    description: 'Reroll reward choices once',       basePrice: 50,  color: 0x2a2a08, hoverColor: 0x3a3a10, type: 'passive' },
      { id: 'aero_helmet',     label: 'AERO HELMET',       description: 'Sleek design to cut wind',         basePrice: 60,  color: 0x1a2a3a, hoverColor: 0x2a3a4a, type: 'equipment' },
      { id: 'carbon_shoes',    label: 'CARBON SHOES',      description: 'Ultra-stiff carbon soles',         basePrice: 120, color: 0x3a2a00, hoverColor: 0x4a3a00, type: 'equipment' },
      { id: 'gravel_knobbies', label: 'GRAVEL TIRES',      description: 'Roubaix Gravel Knobbies',          basePrice: 70,  color: 0x1a1a0a, hoverColor: 0x2a2a14, type: 'equipment' },
      { id: 'carbon_frame',    label: 'CARBON FRAME',      description: 'Lightweight and aerodynamic',      basePrice: 150, color: 0x0a1a2a, hoverColor: 0x142030, type: 'equipment' },
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

    const itemPrice = (item: ShopItem): number => {
      const runData = RunStateManager.getRun();
      if (!runData) return item.basePrice;
      if (item.type === 'passive') {
        const count = runData.passiveItems.filter(i => i === item.id).length;
        return Math.round(item.basePrice * Math.pow(1.5, count));
      } else {
        return item.basePrice;
      }
    };

    const refreshShop = () => {
      const runData = RunStateManager.getRun();
      if (!runData) return;

      this.goldTxt.setText(`GOLD: ${runData.gold}`);

      for (let i = 0; i < CATALOG.length; i++) {
        const item = CATALOG[i];
        const btn  = btns[i];
        const price = itemPrice(item);

        let owned = false;
        let count = 0;
        if (item.type === 'passive') {
            count = runData.passiveItems.filter(i => i === item.id).length;
        } else {
            const eqItem = EQUIPMENT_DATABASE[item.id];
            if (eqItem) {
                owned = runData.equipment[eqItem.slot] === item.id;
            }
        }

        const canAfford = runData.gold >= price;

        if (item.type === 'equipment' && owned) {
          btn.setText(`${item.label}\n✓ EQUIPPED`);
          btn.setEnabled(false);
        } else if (!canAfford) {
          const countStr = count > 0 ? ` (×${count})` : '';
          btn.setText(`${item.label}${countStr}\n${item.description} — ${price} GOLD`);
          btn.setEnabled(false);
        } else {
          const countStr = count > 0 ? ` (×${count})` : '';
          btn.setText(`${item.label}${countStr}\n${item.description} — ${price} GOLD`);
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

          if (item.type === 'passive') {
              RunStateManager.addPassiveItem(item.id);
          } else {
              RunStateManager.equipItem(item.id);
          }

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
