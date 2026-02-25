// src/i18n/locales/en.ts

export const en = {
  menu: {
    title: 'SPOKES',
    subtitle: 'CHOOSE YOUR RIDE',
    distance: 'DISTANCE',
    weight: 'RIDER WEIGHT',
    units: 'UNITS',
    difficulty: 'DIFFICULTY',
    ftp: 'FTP',
    ftp_unit: 'W',
    autoplay_delay: 'AUTOPLAY DELAY',
    autoplay_delay_unit: 'ms',
    edit_hint: 'click to edit · enter to confirm',

    diff: {
      easy: 'EASY',
      normal: 'NORMAL',
      hard: 'HARD',
      hint: {
        easy: 'max 3%',
        normal: 'max 7%',
        hard: 'max 12%'
      }
    },

    units_label: {
      imperial: 'IMPERIAL',
      metric: 'METRIC'
    },

    device: {
      trainer: 'TRAINER',
      remote: 'REMOTE',
      hrm: 'HEART RATE',
      connect_bt: 'CONNECT BT',
      connecting: 'CONNECTING…',
      connected: 'CONNECTED',
      disconnected: 'DISCONNECTED',
      failed: 'FAILED',
      reconnect_bt: 'RECONNECT BT',
      connect_hrm: 'CONNECT HRM',
      reconnect_hrm: 'RECONNECT HRM',
      err: 'ERR'
    },

    start: {
      continue: '▶  CONTINUE RUN',
      new_run: '▶  START NEW RUN',
      start_run: '▶  START RUN',
      erase_confirm: 'ERASE SAVE? CONFIRM',
      no_trainer_title: 'NO TRAINER?',
      no_trainer_msg: 'Playing without a trainer just means you\'re playing a crappy roguelike without getting exercise. Are you sure?',
      play_anyway: 'PLAY ANYWAY',
      trainer_required_title: 'TRAINER REQUIRED',
      trainer_required_msg: 'This run was started with a real trainer.\nPlease connect your trainer before continuing.',
      ok: 'OK'
    },

    save_banner: {
      saved_run: 'SAVED RUN',
      floor: 'Floor',
      gain: 'gain',
      saved: '▲ SAVED',
      incompatible: 'SAVE INCOMPATIBLE  ·  Game was updated  ·  Previous run discarded  ·  Start a fresh run'
    },

    dev_mode: {
      on: 'DEV MODE: ON',
      off: 'DEV MODE: OFF'
    }
  },

  pause: {
    title: '⏸ PAUSED',
    resume: '▶ RESUME',
    back_to_map: '← BACK TO MAP',
    main_menu: 'MAIN MENU',
    save_quit: '✕ SAVE & QUIT',
    abandon_title: 'ABANDON RIDE?',
    abandon_msg_rogue: 'Return to map?\nRide progress will be lost.',
    abandon_msg_menu: 'Return to main menu?\nRide progress will be lost.',
    yes_abandon: 'YES, ABANDON',
    save_quit_title: 'SAVE & QUIT?',
    save_quit_msg: 'Your run progress will be saved.\nReturn to main menu?',
    confirm_save: 'SAVE & QUIT',
    ftp_setting: 'FTP SETTING',
    modifiers: 'ACTIVE MODIFIERS',
    equipped: 'EQUIPPED',
    inventory_usable: 'INVENTORY — USABLE NOW',
    bag_map_only: 'BAG (MAP USE ONLY)',
    use: 'USE',
    gold: 'GOLD: {{amount}}',
    equipment: {
      title: 'EQUIPMENT',
      empty: 'EMPTY',
      inventory_title: 'INVENTORY',
      inventory_empty: 'Inventory is empty.',
      equip_btn: 'EQUIP',
      replace_title: 'REPLACE {{slot}}?',
      unequipping: 'UNEQUIPPING:',
      equipping: 'EQUIPPING:',
      confirm_swap: 'CONFIRM SWAP',
      cancel: 'CANCEL'
    }
  },

  event: {
    title: 'MYSTERIOUS CACHE',
    description: 'You spot a weathered crate hidden in the brush. Inside, you see a glimpse of... {{item}}.\n\nIt looks risky to retrieve.',
    attempt: 'ATTEMPT RETRIEVAL ({{chance}}%)',
    leave: 'LEAVE IT',
    success_title: 'SUCCESS!',
    success_msg: 'You retrieved the {{item}}!',
    failure_title: 'FAILURE!',
    failure_msg_gold: 'The crate was trapped! You dropped {{amount}} gold while escaping.',
    failure_msg_injury: 'The crate collapsed on you! You suffered a minor injury (-5% Power).',
    continue: 'CONTINUE'
  },

  reward: {
    title: 'CHOOSE YOUR REWARD',
    subtitle: 'Select one to keep',
    ride_complete: 'RIDE COMPLETE',
    challenge_complete: '★ CHALLENGE COMPLETE — {{reward}}',
    challenge_failed: '✗ CHALLENGE FAILED',
    reroll: 'REROLL  ({{count}} left)',
    equip_now: 'EQUIP NOW',
    equip_later: 'EQUIP LATER',
    equip_prompt: 'EQUIP {{item}}?',
    slot_label: 'Slot: {{slot}}',
    slot_empty: 'Slot: {{slot}}  (empty)',
    currently_equipped: 'Currently equipped: {{item}}',
    unequip_warning: 'This will be unequipped and returned to inventory.',

    pool: {
      power_boost: { label: 'POWER BOOST', desc: '+4% permanent power\n(stacks)' },
      aero_tweak: { label: 'AERO TWEAK', desc: '+2% drag reduction\n(stacks)' },
      lighter_load: { label: 'LIGHTER LOAD', desc: '-3% rider weight\n(stacks)' },
      coin_cache: { label: 'COIN CACHE', desc: '+20 gold' },
      teleport: { desc: 'Warp to any\nvisited node' },
      dirt_tires: { desc: '-35% rolling resistance\n(equip to activate)' },
      power_surge: { label: 'POWER SURGE', desc: '+7% permanent power\n(stacks)' },
      aero_upgrade: { label: 'AERO UPGRADE', desc: '+3% drag reduction\n(stacks)' },
      weight_shed: { label: 'WEIGHT SHED', desc: '-6% rider weight\n(stacks)' },
      gold_cache: { label: 'GOLD CACHE', desc: '+40 gold' },
      aero_helmet: { desc: '+3% drag reduction\n(equip to activate)' },
      carbon_frame: { desc: '-12% rider weight\n+3% drag reduction\n(equip to activate)' },
      overdrive: { label: 'OVERDRIVE', desc: '+12% permanent power\n(stacks)' },
      antigrav_pedals: { desc: '-8% rider weight\n(equip to activate)' },
      tailwind: { desc: '2× power toggle\nduring next ride' },
      treasure_trove: { label: 'TREASURE TROVE', desc: '+75 gold' }
    }
  },

  item: {
    tailwind: 'TAILWIND',
    teleport: 'TELEPORT SCROLL',
    reroll_voucher: 'REROLL VOUCHER',
    aero_helmet: 'AERO HELMET',
    gold_crank: 'SOLID GOLD CRANK',
    antigrav_pedals: 'ANTIGRAV PEDALS',
    dirt_tires: 'DIRT TIRES',
    carbon_frame: 'CARBON FRAME',
    modifier: {
      power: 'Power: {{val}}%',
      aero: 'Aero: +{{val}}%',
      weight: 'Weight: {{val}}%',
      rolling: 'Rolling resistance: {{val}}%'
    }
  },

  slots: {
    helmet: 'HELMET',
    frame: 'FRAME',
    cranks: 'CRANKS',
    pedals: 'PEDALS',
    tires: 'TIRES'
  },

  remote: {
    join_title: 'JOIN GAME',
    code_placeholder: 'CODE',
    connect_btn: 'CONNECT',
    connecting: 'CONNECTING...',
    map_control: 'MAP CONTROL',
    navigate_select: 'NAVIGATE & SELECT',
    ok: 'OK',
    dashboard: 'RIDE DASHBOARD',
    power: 'POWER',
    heart_rate: 'HEART RATE',
    speed: 'SPEED',
    grade: 'GRADE',
    pause: 'PAUSE',
    resume: '▶ RESUME',
    back_to_map: '← BACK TO MAP',
    main_menu: 'MAIN MENU',
    save_quit: '✕ SAVE & QUIT',
    abandon_title: 'ABANDON RIDE?',
    abandon_msg_rogue: 'Return to map?\\nRide progress will be lost.',
    abandon_msg_menu: 'Return to main menu?\\nRide progress will be lost.',
    yes_abandon: 'YES, ABANDON',
    confirm_save_title: 'SAVE & QUIT?',
    confirm_save_msg: 'Your run progress will be saved.\\nReturn to main menu?',
    confirm_save_btn: 'SAVE & QUIT',
    cancel: 'CANCEL'
  },

  biomes: {
    plains: { name: 'PLAINS' },
    coast: { name: 'COAST' },
    mountain: { name: 'MOUNTAIN' },
    forest: { name: 'FOREST' },
    desert: { name: 'DESERT' },
    tundra: { name: 'TUNDRA' },
    canyon: { name: 'CANYON' },
    jungle: { name: 'JUNGLE' },
  },

  ui: {
    stats: {
      title: 'RUN STATS',
      distance: 'DISTANCE',
      elevation: 'ELEVATION',
      avg_power: 'AVG POWER',
      avg_cadence: 'AVG CADENCE',
      floor: 'FLOOR',
      total_map: 'TOTAL MAP'
    },
    hud: {
      title: 'ROGUELIKE RUN',
      gold: 'GOLD: {{amount}}',
      equipment: '⚙ EQUIPMENT',
      remote: '📡 REMOTE',
      return_to_base: 'RETURN TO BASE',
      teleport: 'TELEPORT ({{count}})',
      cancel_teleport: 'CANCEL TELEPORT'
    },
    boss: {
      title: '⚠ FINAL BOSS',
      race_btn: 'RACE!',
      stats: {
        power: 'POWER',
        mass: 'MASS',
        cda: 'CdA',
        crr: 'Crr'
      }
    }
  }
};
