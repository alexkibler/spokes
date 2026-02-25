/**
 * Centralized theme configuration for Spokes.
 * Contains color palettes, font styles, and layout constants.
 *
 * Structure:
 *   1. Color primitives — one const per unique hex value, named by appearance.
 *      A designer edits values here only.
 *   2. THEME — semantic tokens that reference the primitives above.
 *      A developer reads from here only.
 */

// ── Color Primitives ──────────────────────────────────────────────────────────
// Every hex value used in the design system, in one place.
// Numeric form (0x…) for Phaser Graphics; string form (S_…) for Text / CSS.

// Neutrals
const BLACK           = 0x000000;
const WHITE           = 0xffffff;
const S_WHITE         = '#ffffff';

// Warm paper / parchment
const PARCHMENT       = 0xe8dcc8;
const S_PARCHMENT     = '#e8dcc8';
const PARCHMENT_MID   = 0xcec0a8;
const PARCHMENT_WARM  = 0xb0a888;
const PARCHMENT_ROAD  = 0x9a8870;
const S_PARCHMENT_TXT = '#7a6850'; // subtitle text on parchment

// Dark navy / panel backgrounds
const NAVY_900        = 0x1a1a2a; // panel bg
const NAVY_800        = 0x1a1a3a; // menu input bg
const NAVY_700        = 0x2a2a44; // primary button

// Slate
const SLATE_700       = 0x444455; // separator
const SLATE_600       = 0x555566; // status off

// Grays
const GRAY_900        = 0x333333; // disabled button / start node
const GRAY_700        = 0x444444; // secondary button
const GRAY_500        = 0x666666; // secondary button hover
const S_GRAY_400      = '#aaaaaa'; // muted text
const S_GRAY_500      = '#888888'; // subtle text

// Indigo / purple-blue
const INDIGO_700      = 0x3a3a8b; // input border
const INDIGO_500      = 0x4444aa; // primary button hover
const INDIGO_400      = 0x5555cc; // input border hover

// Blues
const COBALT          = 0x0033cc; // steep descent grade
const BLUE_400        = 0x3388ff; // med descent grade
const CORNFLOWER      = 0x5588ff; // input border focus
const STEEL_BLUE      = 0x4488cc; // coast biome / champion
const DENIM           = 0x446688; // surface: asphalt map color
const SKY_BLUE        = 0x66ccff; // easy descent grade / link text
const S_SKY_BLUE      = '#66ccff';
const S_COBALT        = '#0033cc';
const S_BLUE_400      = '#3388ff';

// Deeper blues (device buttons)
const NAVY_BLUE       = 0x1a3a6b; // remote button bg
const NAVY_BLUE_DARK  = 0x0e2040; // remote button bg dark
const MEDIUM_BLUE     = 0x2a5aaa; // remote button hover

// Peloton gradient (pale blue → vivid violet, weakest → strongest)
const PELOTON_0       = 0x99ddff;
const PELOTON_2       = 0x77bbff;
const PELOTON_4       = 0x5599ee;
const PELOTON_5       = 0x6688ff;
const PELOTON_6       = 0x7777ff;
const PELOTON_7       = 0x8866ff;
const PELOTON_8       = 0x9955ff;
const PELOTON_9       = 0xaa44ff;

// Ghost / slipstream blues
const GHOST_BLUE      = 0x88ccff; // boss & peloton body color (index 1)
const S_GHOST_BLUE    = '#88ccff';
const PERIWINKLE      = 0x66aaff; // coast champion accent (same as peloton index 3)
const S_PERIWINKLE    = '#66aaff';
const POWDER_BLUE     = 0x88ccdd; // tundra biome
const ICE_BLUE        = 0xcceeff; // slipstream outer rows
const PALE_BLUE       = 0xaaddff; // slipstream mid rows
const ICE_WHITE       = 0xddeeff; // ghost skin / slipstream innermost

// Neon teal (accent — string-only, no numeric Phaser use)
const S_NEON_TEAL     = '#00f5d4';

// Teal / green
const TEAL            = 0x008872; // standard map node
const TEAL_DARK       = 0x006655; // success button
const MINT            = 0x00ff88; // status ok / success text
const S_MINT          = '#00ff88';

// Forest greens (trainer button palette)
const FOREST          = 0x1a7040;
const FOREST_DARK     = 0x0e3d20;
const FOREST_MID      = 0x25a558;

// Other greens
const DARK_GREEN      = 0x226622; // surface: mud map color
const LIME_GREEN      = 0x33cc33; // grade: flat
const S_LIME_GREEN    = '#33cc33';
const MEDIUM_GREEN    = 0x44aa44; // jungle biome
const EMERALD         = 0x228844; // forest biome / champion
const S_EMERALD       = '#228844';
const LIME            = 0x88cc44; // plains biome / champion
const S_LIME          = '#88cc44';
const LIME_BRIGHT     = 0xccff66; // plains champion accent
const S_LIME_BRIGHT   = '#ccff66';
const SPRING_GREEN    = 0x44cc66; // forest champion accent
const S_SPRING_GREEN  = '#44cc66';

// Parallax ground greens
const OLIVE           = 0x4a6e38; // near ground layer
const SAGE            = 0x7a9469; // mid hills layer

// Purples
const VIOLET          = 0x4b0082; // event map node
const PLUM            = 0x5a1a5a; // HRM button bg
const PLUM_DARK       = 0x3a1a5a; // HRM button bg dark
const PURPLE          = 0x6a2a9b; // HRM button hover

// Reds
const CRIMSON         = 0x8b0000; // danger button / hard map node
const CRIMSON_LIGHT   = 0xaa0000; // danger button hover
const RED             = 0xcc0000; // steep climb grade / boss node
const S_RED           = '#cc0000';
const CORAL           = 0xff4444; // status error / danger text
const S_CORAL         = '#ff4444';
const INDIAN_RED      = 0xcc4444; // mountain biome / champion
const S_INDIAN_RED    = '#cc4444';
const SALMON          = 0xff6666; // mountain champion accent
const S_SALMON        = '#ff6666';
const RUST            = 0xaa4411; // surface: dirt map color
const ORANGE_RED      = 0xff3300; // hard climb grade
const S_ORANGE_RED    = '#ff3300';

// Oranges
const ORANGE          = 0xff8800; // med climb grade
const S_ORANGE        = '#ff8800';
const ORANGE_DARK     = 0xff6600; // boss accent
const S_ORANGE_DARK   = '#ff6600';

// Yellows / golds
const GOLD            = 0xffcc00; // status demo / gold text
const S_GOLD          = '#ffcc00';
const GOLD_LIGHT      = 0xffcc44; // elite racer body
const S_GOLD_LIGHT    = '#ffcc44';
const MUSTARD         = 0xcccc00; // easy climb grade
const S_MUSTARD       = '#cccc00';
const AMBER           = 0xddaa44; // desert biome
const AMBER_DARK      = 0xaa8800; // surface: gravel map color
const BRONZE          = 0x8b5a00; // ui panel border / shop node
const BRONZE_LIGHT    = 0x8a6800; // elite map node
const TAN             = 0xcc8844; // canyon biome

// Browns / skin (player cyclist sprite)
const DARK_WOOD       = 0x2a2018; // bike frame
const S_DARK_WOOD     = '#2a2018'; // dark text
const WARM_BROWN      = 0x5a3a1a; // jersey
const SKIN            = 0xc49a6a; // skin tone

// Warm stone / road surface colors (parallax)
const STONE_GRAY      = 0xb8aa96; // distant mountains
const WARM_GRAY       = 0x9a8878; // asphalt road base
const WARM_GRAY_DARK  = 0x7a6858; // asphalt road edge
const SAND_LIGHT      = 0xc4a882; // gravel road base
const SAND            = 0xa88c68; // gravel road edge
const LINEN           = 0xddc8a8; // gravel stone (light)
const SAND_DARK       = 0x9a7a58; // gravel stone (dark)
const DIRT_BASE       = 0xa06030; // dirt road base
const EARTH_DARK      = 0x804818; // dirt road edge
const EARTH_DARKER    = 0x6b3810; // dirt road rut
const CLAY_LIGHT      = 0xc08040; // dirt road patch (light)
const CLAY            = 0x804020; // dirt road patch (dark)
const MUD_BASE        = 0x5a4828; // mud road base
const MUD_DARK        = 0x3a2818; // mud road edge
const MUD_DEEP        = 0x2e1e0e; // mud road deep

// ── Semantic Tokens ───────────────────────────────────────────────────────────

export const THEME = {
  colors: {
    background:    PARCHMENT,
    backgroundHex: S_PARCHMENT,

    ui: {
      hudBackground:   BLACK,
      hudAlpha:        0.55,
      separator:       SLATE_700,
      panelBg:         NAVY_900,
      panelBorder:     BRONZE,
      overlayDim:      BLACK,
      overlayDimAlpha: 0.85,
    },

    text: {
      main:    S_WHITE,
      muted:   S_GRAY_400,
      subtle:  S_GRAY_500,
      dark:    S_DARK_WOOD,
      gold:    S_GOLD,
      accent:  S_NEON_TEAL,
      danger:  S_CORAL,
      success: S_MINT,
      warning: S_GOLD,
      link:    S_SKY_BLUE,
    },

    buttons: {
      primary:        NAVY_700,
      primaryHover:   INDIGO_500,
      secondary:      GRAY_700,
      secondaryHover: GRAY_500,
      danger:         CRIMSON,
      dangerHover:    CRIMSON_LIGHT,
      success:        TEAL_DARK,
      disabled:       GRAY_900,
    },

    grades: {
      steepClimb:   RED,        // > 10%
      hardClimb:    ORANGE_RED, // 6–10%
      medClimb:     ORANGE,     // 3–6%
      easyClimb:    MUSTARD,    // 1–3%
      flat:         LIME_GREEN, // ±1%
      easyDescent:  SKY_BLUE,   // −1 to −3%
      medDescent:   BLUE_400,   // −3 to −6%
      steepDescent: COBALT,     // < −6%
    },

    // Hex string versions for Phaser Text objects
    gradeHex: {
      steepClimb:   S_RED,
      hardClimb:    S_ORANGE_RED,
      medClimb:     S_ORANGE,
      easyClimb:    S_MUSTARD,
      flat:         S_LIME_GREEN,
      easyDescent:  S_SKY_BLUE,
      medDescent:   S_BLUE_400,
      steepDescent: S_COBALT,
    },

    surfaces: {
      asphalt: DENIM,
      gravel:  AMBER_DARK,
      dirt:    RUST,
      mud:     DARK_GREEN,
    },

    nodes: {
      start:    GRAY_900,
      standard: TEAL,
      hard:     CRIMSON,
      shop:     BRONZE,
      event:    VIOLET,
      elite:    BRONZE_LIGHT,
      finish:   BLACK,
      boss:     RED,
    },

    status: {
      ok:   MINT,
      demo: GOLD,
      off:  SLATE_600,
      err:  CORAL,
    },

    // Biome/spoke colors for course map rendering
    biomes: {
      plains:   LIME,
      coast:    STEEL_BLUE,
      mountain: INDIAN_RED,
      forest:   EMERALD,
      desert:   AMBER,
      tundra:   POWDER_BLUE,
      canyon:   TAN,
      jungle:   MEDIUM_GREEN,
    },

    // Racer/ghost cyclist colors
    racers: {
      bossBody:                GHOST_BLUE,
      bossBodyHex:             S_GHOST_BLUE,
      bossAccent:              ORANGE_DARK,
      bossAccentHex:           S_ORANGE_DARK,
      eliteBody:               GOLD_LIGHT,
      eliteBodyHex:            S_GOLD_LIGHT,
      plainsChampion:          LIME,
      plainsChampionHex:       S_LIME,
      plainsChampionAccent:    LIME_BRIGHT,
      plainsChampionAccentHex: S_LIME_BRIGHT,
      mountainChampion:        INDIAN_RED,
      mountainChampionHex:     S_INDIAN_RED,
      mountainChampionAccent:  SALMON,
      mountainChampionAccentHex: S_SALMON,
      coastChampion:           STEEL_BLUE,
      coastChampionHex:        '#4488cc',
      coastChampionAccent:     PERIWINKLE,
      coastChampionAccentHex:  S_PERIWINKLE,
      forestChampion:          EMERALD,
      forestChampionHex:       S_EMERALD,
      forestChampionAccent:    SPRING_GREEN,
      forestChampionAccentHex: S_SPRING_GREEN,
      // Peloton gradient: pale blue → vivid violet (index 0 = weakest)
      peloton: [
        PELOTON_0, GHOST_BLUE, PELOTON_2, PERIWINKLE, PELOTON_4,
        PELOTON_5, PELOTON_6,  PELOTON_7, PELOTON_8,  PELOTON_9,
      ],
    },

    // Parallax background layer colors
    parallax: {
      mountainsFill:    STONE_GRAY,
      midHillsFill:     SAGE,
      nearGroundFill:   OLIVE,
      asphaltBase:      WARM_GRAY,
      asphaltEdge:      WARM_GRAY_DARK,
      asphaltDash:      WHITE,
      gravelBase:       SAND_LIGHT,
      gravelEdge:       SAND,
      gravelStoneLight: LINEN,
      gravelStoneDark:  SAND_DARK,
      dirtBase:         DIRT_BASE,
      dirtEdge:         EARTH_DARK,
      dirtRut:          EARTH_DARKER,
      dirtPatchLight:   CLAY_LIGHT,
      dirtPatchDark:    CLAY,
      mudBase:          MUD_BASE,
      mudEdge:          MUD_DARK,
      mudDeep:          MUD_DEEP,
    },

    // Cyclist sprite / slipstream colors
    cyclist: {
      playerBike:   DARK_WOOD,
      playerJersey: WARM_BROWN,
      playerSkin:   SKIN,
      ghostSkin:    ICE_WHITE,
      slipstream: [
        ICE_BLUE,   // outermost row (weakest)
        PALE_BLUE,
        GHOST_BLUE,
        GHOST_BLUE,
        PALE_BLUE,
        ICE_BLUE,
        ICE_WHITE,  // innermost row (near ground)
      ],
    },

    // Menu scene decorative / input colors
    menu: {
      mountainFar:      PARCHMENT_MID,
      hillNear:         PARCHMENT_WARM,
      road:             PARCHMENT_ROAD,
      subtitleHex:      S_PARCHMENT_TXT,
      inputBg:          NAVY_800,
      inputBorder:      INDIGO_700,
      inputBorderHover: INDIGO_400,
      inputBorderFocus: CORNFLOWER,
      // Trainer connect button palette
      trainerBg:        FOREST,
      trainerBgDark:    FOREST_DARK,
      trainerBgHover:   FOREST_MID,
      // Remote button palette
      remoteBg:         NAVY_BLUE,
      remoteBgDark:     NAVY_BLUE_DARK,
      remoteBgHover:    MEDIUM_BLUE,
      // HRM button palette
      hrmBg:            PLUM,
      hrmBgDark:        PLUM_DARK,
      hrmBgHover:       PURPLE,
    },
  },

  fonts: {
    main: 'monospace',
    sizes: {
      xsmall:  '8px',
      caption: '10px',
      small:   '9px',
      default: '11px',
      label:   '13px',
      medium:  '14px',
      large:   '18px',
      title:   '22px',
      hero:    '28px',
      hudValue:'26px',
      display: '52px',
    },
    weights: {
      normal: 'normal',
      bold:   'bold',
    }
  },

  layout: {
    hudHeight:         70,
    bottomStripHeight: 50,
    elevHeight:        75,
    overlayPad:        20,
    borderRadius:      8,
  },

  spacing: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },

  borderRadius: {
    default: 8,
    large:   12,
    round:   9999,
  },

  depths: {
    background: 0,
    map:        10,
    ui:         50,
    overlay:    100,
    modal:      2000,
    tooltip:    3000,
  }
};
