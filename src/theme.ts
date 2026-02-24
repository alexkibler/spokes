/**
 * Centralized theme configuration for Spokes.
 * Contains color palettes, font styles, and layout constants.
 */

export const THEME = {
  colors: {
    background: 0xe8dcc8, // Main paper background
    backgroundHex: '#e8dcc8',

    ui: {
      hudBackground: 0x000000,
      hudAlpha: 0.55,
      separator: 0x444455,
      panelBg: 0x1a1a2a,
      panelBorder: 0x8b5a00,
      overlayDim: 0x000000,
      overlayDimAlpha: 0.85,
    },

    text: {
      main: '#ffffff',
      muted: '#aaaaaa',
      subtle: '#888888',
      dark: '#2a2018',
      gold: '#ffcc00',
      accent: '#00f5d4', // Teal
      danger: '#ff4444',
      success: '#00ff88',
      warning: '#ffcc00',
      link: '#66ccff',
    },

    buttons: {
      primary: 0x2a2a44,
      primaryHover: 0x4444aa,
      secondary: 0x444444,
      secondaryHover: 0x666666,
      danger: 0x8b0000,
      success: 0x006655,
      disabled: 0x333333,
    },

    grades: {
      steepClimb: 0xcc0000, // > 10%
      hardClimb: 0xff3300,  // 6-10%
      medClimb: 0xff8800,   // 3-6%
      easyClimb: 0xcccc00,  // 1-3%
      flat: 0x33cc33,       // ±1%
      easyDescent: 0x66ccff, // -1 to -3%
      medDescent: 0x3388ff,  // -3 to -6%
      steepDescent: 0x0033cc, // < -6%
    },

    // Hex string versions for Phaser Text objects
    gradeHex: {
      steepClimb: '#cc0000',
      hardClimb: '#ff3300',
      medClimb: '#ff8800',
      easyClimb: '#cccc00',
      flat: '#33cc33',
      easyDescent: '#66ccff',
      medDescent: '#3388ff',
      steepDescent: '#0033cc',
    },

    surfaces: {
      asphalt: 0x446688,
      gravel: 0xaa8800,
      dirt: 0xaa4411,
      mud: 0x226622,
    },

    nodes: {
      start: 0x333333,
      standard: 0x008872,
      hard: 0x8b0000,
      shop: 0x8b5a00,
      event: 0x4b0082,
      elite: 0x8a6800,
      finish: 0x000000,
    },

    status: {
      ok: 0x00ff88,
      demo: 0xffcc00,
      off: 0x555566,
      err: 0xff4444,
    }
  },

  fonts: {
    main: 'monospace',
    sizes: {
      small: '9px',
      default: '11px',
      medium: '14px',
      large: '18px',
      title: '22px',
      hero: '28px',
      hudValue: '26px',
    },
  },

  layout: {
    hudHeight: 70,
    bottomStripHeight: 50,
    elevHeight: 75,
    overlayPad: 20,
    borderRadius: 8,
  }
};
