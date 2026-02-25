# UI Design System

## Overview
Spokes uses a centralized Design System for all UI elements to ensure consistency, maintainability, and ease of development. This system is built upon three pillars:
1. **Design Tokens (`src/theme.ts`)**: The single source of truth for colors, typography, spacing, and depths.
2. **Component Library (`src/ui/components/`)**: Reusable, theme-aware components (Buttons, Panels, Typography).
3. **Localization (`src/i18n/`)**: All user-facing strings must be externalized.

## 1. Design Tokens
Import `THEME` from `src/theme.ts` to access tokens.

### Colors
- `THEME.colors.text.main` (White)
- `THEME.colors.text.muted` (Grey)
- `THEME.colors.buttons.primary` (Dark Blue)
- `THEME.colors.buttons.danger` (Red)

### Typography
- **Families**: `THEME.fonts.main` (Monospace)
- **Sizes**: `THEME.fonts.sizes.small` (9px) to `hero` (28px).

### Depths (Z-Index)
- `THEME.depths.background` (0)
- `THEME.depths.map` (10)
- `THEME.depths.ui` (50)
- `THEME.depths.overlay` (100)
- `THEME.depths.modal` (2000)

## 2. Component Library

### Button (`src/ui/Button.ts`)
A standard interactive button with variants.

```typescript
import { Button } from '../ui/Button';

const btn = new Button(this, {
  x: 100,
  y: 100,
  text: i18next.t('ui.actions.confirm'),
  variant: 'primary', // 'primary' | 'secondary' | 'danger' | 'success'
  onClick: () => console.log('Clicked!')
});
```

### Typography (`src/ui/components/Typography.ts`)
Standardized text element.

```typescript
import { Typography } from '../ui/components/Typography';

new Typography(this, {
  x: 100,
  y: 50,
  text: i18next.t('ui.title'),
  variant: 'h1', // 'hero' | 'h1' | 'h2' | 'body' | 'caption' | 'label'
  align: 'center'
});
```

### Panel (`src/ui/components/Panel.ts`)
A container with the standard dark semi-transparent background and border.

```typescript
import { Panel } from '../ui/components/Panel';

const panel = new Panel(this, {
  x: 20,
  y: 20,
  width: 300,
  height: 200,
  title: i18next.t('ui.stats.title'),
  onClose: () => this.close()
});
// Add children to panel
panel.add(someText);
```

## 3. Internationalization (i18n)
Never hardcode strings. Use `i18next`.

1. Add string to `src/i18n/locales/en.ts`:
   ```typescript
   ui: {
     shop: {
       buy: 'BUY ITEM'
     }
   }
   ```
2. Use in code:
   ```typescript
   import i18next from '../i18n';

   const label = i18next.t('ui.shop.buy');
   ```

## Workflow
1. **Identify Magic Numbers**: Check if a number (color, size, depth) belongs in `THEME`. Move it there if generic.
2. **Identify Hardcoded Strings**: Move to `en.ts`.
3. **Use Components**: Avoid `this.add.rectangle` or `this.add.text` for UI. Use `Panel`, `Button`, or `Typography`.
