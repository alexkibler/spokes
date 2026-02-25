import Phaser from 'phaser';
import { THEME } from '../theme';

export type TypographyVariant = 'hero' | 'h1' | 'h2' | 'body' | 'caption' | 'label' | 'hudValue';

export interface TypographyConfig {
  x: number;
  y: number;
  text: string;
  variant?: TypographyVariant;
  color?: string; // Hex string or mapped color key
  align?: 'left' | 'center' | 'right';
  fontSize?: string; // Override
  fontStyle?: string; // Override
  scrollFactor?: number;
}

export class Typography extends Phaser.GameObjects.Text {
  constructor(scene: Phaser.Scene, config: TypographyConfig) {
    const style = Typography.getStyleForVariant(config.variant || 'body');

    // Allow overrides
    if (config.color) style.color = config.color;
    if (config.fontSize) style.fontSize = config.fontSize;
    if (config.fontStyle) style.fontStyle = config.fontStyle;
    if (config.align) style.align = config.align;

    super(scene, config.x, config.y, config.text, style);

    if (config.align === 'center') {
      this.setOrigin(0.5);
    } else if (config.align === 'right') {
      this.setOrigin(1, 0);
    } else {
      this.setOrigin(0, 0);
    }

    if (config.scrollFactor !== undefined) {
      this.setScrollFactor(config.scrollFactor);
    }

    scene.add.existing(this);
  }

  private static getStyleForVariant(variant: TypographyVariant): Phaser.Types.GameObjects.Text.TextStyle {
    const base = {
      fontFamily: THEME.fonts.main,
    };

    switch (variant) {
      case 'hero':
        return { ...base, fontSize: THEME.fonts.sizes.hero, fontStyle: 'bold', color: THEME.colors.text.main };
      case 'h1':
        return { ...base, fontSize: THEME.fonts.sizes.title, fontStyle: 'bold', color: THEME.colors.text.main };
      case 'h2':
        return { ...base, fontSize: THEME.fonts.sizes.large, fontStyle: 'bold', color: THEME.colors.text.main };
      case 'body':
        return { ...base, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.main };
      case 'caption':
        return { ...base, fontSize: THEME.fonts.sizes.small, color: THEME.colors.text.subtle };
      case 'label':
        return { ...base, fontSize: THEME.fonts.sizes.small, fontStyle: 'bold', letterSpacing: 1, color: THEME.colors.text.muted };
      case 'hudValue':
        return { ...base, fontSize: THEME.fonts.sizes.hudValue, fontStyle: 'bold', color: THEME.colors.text.gold };
      default:
        return { ...base, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.main };
    }
  }
}
