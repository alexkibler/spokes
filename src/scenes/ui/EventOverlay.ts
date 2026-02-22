import Phaser from 'phaser';
import { RunStateManager } from '../../roguelike/RunState';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';

export class EventOverlay extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, scrollY: number, onAction: () => void, onClose: () => void) {
    super(scene, 0, scrollY);
    this.setDepth(2000);

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Events Data
    const EVENTS = [
      {
        title: 'Roadside Vendor',
        description: 'A weathered cart sits at the side of the trail. The vendor grins and offers you a choice.',
        options: [
          { label: 'Buy an energy bar for 10 gold — recover your legs for the next climb.', action: () => { RunStateManager.spendGold(10); } },
          { label: 'Trade your fastest segment for a mystery bag of gear.', action: () => {} },
          { label: 'Keep riding and ignore the vendor entirely.', action: () => {} },
        ],
      },
      {
        title: 'Fallen Tree',
        description: 'A massive oak has collapsed across the trail, blocking your path. You assess your options.',
        options: [
          { label: 'Lift your bike over the trunk and scramble through — costs time but no gold.', action: () => {} },
          { label: 'Find a narrow gap under the roots — risky, but you might gain 20 gold from the effort.', action: () => { RunStateManager.addGold(20); } },
          { label: 'Turn back and take the long way around, arriving with fresh legs.', action: () => {} },
        ],
      },
      {
        title: 'Rival Cyclist',
        description: 'A rival in flashy kit challenges you to a quick sprint. The crowd on the roadside cheers.',
        options: [
          { label: 'Accept the challenge — if you win, earn 30 gold and bragging rights.', action: () => { RunStateManager.addGold(30); } },
          { label: 'Decline politely and draft behind them for a free energy boost.', action: () => {} },
          { label: 'Heckle them loudly and ride off while they\'re distracted.', action: () => {} },
        ],
      },
      {
        title: 'Mysterious Fog',
        description: 'A thick fog rolls in from the valley. Shapes move at the edge of your vision and whispers fill the air.',
        options: [
          { label: 'Push through the fog as fast as you can and emerge stronger.', action: () => {} },
          { label: 'Stop and listen — the whispers reveal a hidden shortcut worth 25 gold.', action: () => { RunStateManager.addGold(25); } },
          { label: 'Turn on your lights and proceed carefully, conserving energy.', action: () => {} },
        ],
      },
      {
        title: 'Abandoned Café',
        description: 'A shuttered café with a flickering sign. The door is unlocked and smells of coffee.',
        options: [
          { label: 'Brew a quick espresso — spend 5 gold and ride the next segment with extra focus.', action: () => { RunStateManager.spendGold(5); } },
          { label: 'Raid the pantry and stuff your jersey pockets with whatever you find.', action: () => { RunStateManager.addGold(15); } },
          { label: 'Leave it undisturbed and carry on with what you have.', action: () => {} },
        ],
      },
    ];

    const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    const numOptions = 2 + Math.floor(Math.random() * (event.options.length - 1)); // 2 or 3 options
    const options = event.options.slice(0, numOptions);

    // Dim background
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

    // Panel dimensions
    const btnWidth = Math.min(520, w - 80);
    const btnHeight = 58;
    const btnGap = 14;
    const descWidth = btnWidth;
    const descFontSize = 16;
    const titleFontSize = 24;
    const padV = 36;
    const padH = 40;

    // Measure description text height
    const charsPerLine = Math.floor(descWidth / (descFontSize * 0.6));
    const descLines = Math.ceil(event.description.length / charsPerLine) + 1;
    const descHeight = descLines * (descFontSize * 1.55);

    const totalBtnsHeight = options.length * (btnHeight + btnGap) - btnGap;
    const ph = padV + titleFontSize + 20 + descHeight + 28 + totalBtnsHeight + padV;
    const pw = btnWidth + padH * 2;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    // Panel background
    const panel = scene.add.graphics();
    panel.fillStyle(0x0d0d12, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, 0x2a1a4a, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);
    this.add(panel);

    // Title banner strip
    const bannerH = titleFontSize + 24;
    const banner = scene.add.graphics();
    banner.fillStyle(0x1a0a2a, 1);
    banner.fillRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.add(banner);

    // Title text
    this.add(scene.add.text(w / 2, py + bannerH / 2, event.title, {
      fontFamily: THEME.fonts.main,
      fontSize: `${titleFontSize}px`,
      color: '#e8c87a',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    // Description text
    const descY = py + bannerH + 20;
    this.add(scene.add.text(px + padH, descY, event.description, {
      fontFamily: THEME.fonts.main,
      fontSize: `${descFontSize}px`,
      color: '#d0c8b8',
      wordWrap: { width: descWidth },
      lineSpacing: 4,
    }).setOrigin(0, 0));

    // Option buttons
    const btnsStartY = descY + descHeight + 18;
    options.forEach((opt, i) => {
      const by = btnsStartY + i * (btnHeight + btnGap);
      const cx = w / 2;
      const cy = by + btnHeight / 2;

      const btn = new Button(scene, {
        x: cx,
        y: cy,
        width: btnWidth,
        height: btnHeight,
        text: opt.label,
        color: 0x093d46,
        hoverColor: 0x0e5560,
        onClick: () => {
          opt.action();
          this.destroy();
          onAction();
          onClose();
        }
      });
      this.add(btn);
    });

    scene.add.existing(this);
  }
}
