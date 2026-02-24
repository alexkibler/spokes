// src/i18n/locales/fr-CA.ts

export const frCA = {
  menu: {
    title: 'SPOKES',
    subtitle: 'CHOISISSEZ VOTRE PARCOURS',
    distance: 'DISTANCE',
    weight: 'POIDS DU CYCLISTE',
    units: 'UNITÉS',
    difficulty: 'DIFFICULTÉ',
    ftp: 'FTP',
    ftp_unit: 'W',
    edit_hint: 'cliquer pour éditer · entrée pour confirmer',

    diff: {
      easy: 'FACILE',
      normal: 'NORMAL',
      hard: 'DIFFICILE',
      hint: {
        easy: 'max 3%',
        normal: 'max 7%',
        hard: 'max 12%'
      }
    },

    units_label: {
      imperial: 'IMPÉRIAL',
      metric: 'MÉTRIQUE'
    },

    device: {
      trainer: 'BASE D\'ENTRAÎNEMENT',
      remote: 'TÉLÉCOMMANDE',
      hrm: 'FRÉQUENCE CARDIAQUE',
      connect_bt: 'CONNECTER BT',
      connecting: 'CONNEXION…',
      connected: 'CONNECTÉ',
      disconnected: 'DÉCONNECTÉ',
      failed: 'ÉCHEC',
      reconnect_bt: 'RECONNECTER BT',
      connect_hrm: 'CONNECTER HRM',
      reconnect_hrm: 'RECONNECTER HRM',
      err: 'ERR'
    },

    start: {
      continue: '▶  CONTINUER',
      new_run: '▶  NOUVELLE COURSE',
      start_run: '▶  DÉMARRER',
      erase_confirm: 'EFFACER SAUVEGARDE ?',
      no_trainer_title: 'PAS DE BASE D\'ENTRAÎNEMENT ?',
      no_trainer_msg: 'Jouer sans base connectée signifie aucune résistance et aucun exercice. Êtes-vous sûr ?',
      play_anyway: 'JOUER QUAND MÊME',
      trainer_required_title: 'BASE REQUISE',
      trainer_required_msg: 'Cette course a commencé avec une vraie base.\nVeuillez connecter votre base avant de continuer.',
      ok: 'OK'
    },

    save_banner: {
      saved_run: 'PARTIE SAUVEGARDÉE',
      floor: 'Étage',
      gain: 'gain',
      saved: '▲ SAUVEGARDÉ',
      incompatible: 'SAUVEGARDE INCOMPATIBLE  ·  Jeu mis à jour  ·  Partie précédente effacée  ·  Commencez une nouvelle course'
    },

    dev_mode: {
      on: 'MODE DEV : ON',
      off: 'MODE DEV : OFF'
    }
  },

  pause: {
    title: '⏸ PAUSE',
    resume: '▶ REPRENDRE',
    back_to_map: '← RETOUR CARTE',
    main_menu: 'MENU PRINCIPAL',
    save_quit: '✕ SAUVEGARDER & QUITTER',
    abandon_title: 'ABANDONNER ?',
    abandon_msg_rogue: 'Retourner à la carte ?\nLa progression de la course sera perdue.',
    abandon_msg_menu: 'Retourner au menu principal ?\nLa progression de la course sera perdue.',
    yes_abandon: 'OUI, ABANDONNER',
    save_quit_title: 'SAUVEGARDER & QUITTER ?',
    save_quit_msg: 'Votre progression sera sauvegardée.\nRetourner au menu principal ?',
    confirm_save: 'SAUVEGARDER & QUITTER',
    ftp_setting: 'RÉGLAGE FTP',
    modifiers: 'MODIFICATEURS ACTIFS',
    equipped: 'ÉQUIPEMENT',
    inventory_usable: 'INVENTAIRE — UTILISABLE MAINTENANT',
    bag_map_only: 'SAC (CARTE SEULEMENT)',
    use: 'UTILISER',
    gold: 'OR : {{amount}}',
    equipment: {
      title: 'ÉQUIPEMENT',
      empty: 'VIDE',
      inventory_title: 'INVENTAIRE',
      inventory_empty: 'L\'inventaire est vide.',
      equip_btn: 'ÉQUIPER',
      replace_title: 'REMPLACER {{slot}} ?',
      unequipping: 'DÉSÉQUIPER :',
      equipping: 'ÉQUIPER :',
      confirm_swap: 'CONFIRMER',
      cancel: 'ANNULER'
    },

    event: {
      title: 'CACHE MYSTÉRIEUSE',
      description: 'Vous apercevez une caisse usée cachée dans les broussailles. À l\'intérieur, vous entrevoyez... {{item}}.\n\nCela semble risqué à récupérer.',
      attempt: 'TENTER DE RÉCUPÉRER ({{chance}}%)',
      leave: 'LAISSER TOMBER',
      success_title: 'SUCCÈS !',
      success_msg: 'Vous avez récupéré : {{item}} !',
      failure_title: 'ÉCHEC !',
      failure_msg_gold: 'La caisse était piégée ! Vous avez perdu {{amount}} or en vous échappant.',
      failure_msg_injury: 'La caisse s\'est effondrée sur vous ! Vous avez subi une blessure mineure (-5% Puissance).',
      continue: 'CONTINUER'
    }
  },

  reward: {
    title: 'CHOISISSEZ VOTRE RÉCOMPENSE',
    subtitle: 'Sélectionnez-en une à garder',
    ride_complete: 'COURSE TERMINÉE',
    challenge_complete: '★ DÉFI TERMINÉ — {{reward}}',
    challenge_failed: '✗ DÉFI ÉCHOUÉ',
    reroll: 'RELANCER  ({{count}} restants)',
    equip_now: 'ÉQUIPER MAINTENANT',
    equip_later: 'ÉQUIPER PLUS TARD',
    equip_prompt: 'ÉQUIPER {{item}} ?',
    slot_label: 'Emplacement : {{slot}}',
    slot_empty: 'Emplacement : {{slot}}  (vide)',
    currently_equipped: 'Actuellement équipé : {{item}}',
    unequip_warning: 'Ceci sera déséquipé et renvoyé dans l\'inventaire.',

    pool: {
      power_boost: { label: 'BOOST PUISSANCE', desc: '+4% puissance permanente\n(cumulable)' },
      aero_tweak: { label: 'AJUSTEMENT AÉRO', desc: '+2% réduction traînée\n(cumulable)' },
      lighter_load: { label: 'CHARGE ALLÉGÉE', desc: '-3% poids cycliste\n(cumulable)' },
      coin_cache: { label: 'CACHE DE PIÈCES', desc: '+20 or' },
      teleport: { desc: 'Se téléporter à un nœud visité' },
      dirt_tires: { desc: '-35% résistance roulement\n(équiper pour activer)' },
      power_surge: { label: 'SURTENSION', desc: '+7% puissance permanente\n(cumulable)' },
      aero_upgrade: { label: 'AMÉLIORATION AÉRO', desc: '+3% réduction traînée\n(cumulable)' },
      weight_shed: { label: 'PERTE DE POIDS', desc: '-6% poids cycliste\n(cumulable)' },
      gold_cache: { label: 'CACHE D\'OR', desc: '+40 or' },
      aero_helmet: { desc: '+3% réduction traînée\n(équiper pour activer)' },
      carbon_frame: { desc: '-12% poids cycliste\n+3% réduction traînée\n(équiper pour activer)' },
      overdrive: { label: 'OVERDRIVE', desc: '+12% puissance permanente\n(cumulable)' },
      antigrav_pedals: { desc: '-8% poids cycliste\n(équiper pour activer)' },
      tailwind: { desc: '2× puissance\npendant la prochaine course' },
      treasure_trove: { label: 'TRÉSOR', desc: '+75 or' }
    }
  },

  item: {
    tailwind: 'VENT DE DOS',
    teleport: 'PARCHEMIN DE TÉLÉPORTATION',
    reroll_voucher: 'BON DE RELANCE',
    aero_helmet: 'CASQUE AÉRO',
    gold_crank: 'PÉDALIER EN OR MASSIF',
    antigrav_pedals: 'PÉDALES ANTIGRAVITÉ',
    dirt_tires: 'PNEUS TERRE',
    carbon_frame: 'CADRE CARBONE',
    modifier: {
      power: 'Puissance : {{val}}%',
      aero: 'Aéro : +{{val}}%',
      weight: 'Poids : {{val}}%',
      rolling: 'Résistance au roulement : {{val}}%'
    }
  },

  slots: {
    helmet: 'CASQUE',
    frame: 'CADRE',
    cranks: 'PÉDALIER',
    pedals: 'PÉDALES',
    tires: 'PNEUS'
  },

  remote: {
    join_title: 'REJOINDRE',
    code_placeholder: 'CODE',
    connect_btn: 'CONNECTER',
    connecting: 'CONNEXION...',
    map_control: 'CONTRÔLE CARTE',
    navigate_select: 'NAVIGUER & SÉLECTIONNER',
    ok: 'OK',
    dashboard: 'TABLEAU DE BORD',
    power: 'PUISSANCE',
    heart_rate: 'FRÉQUENCE CARDIAQUE',
    speed: 'VITESSE',
    grade: 'PENTE',
    pause: 'PAUSE',
    resume: '▶ REPRENDRE',
    back_to_map: '← RETOUR CARTE',
    main_menu: 'MENU PRINCIPAL',
    save_quit: '✕ SAUVEGARDER & QUITTER',
    abandon_title: 'ABANDONNER ?',
    abandon_msg_rogue: 'Retourner à la carte ?\\nLa progression de la course sera perdue.',
    abandon_msg_menu: 'Retourner au menu principal ?\\nLa progression de la course sera perdue.',
    yes_abandon: 'OUI, ABANDONNER',
    confirm_save_title: 'SAUVEGARDER & QUITTER ?',
    confirm_save_msg: 'Votre progression sera sauvegardée.\\nRetourner au menu principal ?',
    confirm_save_btn: 'SAUVEGARDER & QUITTER',
    cancel: 'ANNULER'
  }
};
