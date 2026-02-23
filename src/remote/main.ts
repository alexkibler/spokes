import { io, Socket } from 'socket.io-client';
import i18n from '../i18n';

const socket: Socket = io();

// Theme Colors
const COLORS = {
  bg: '#e8dcc8',
  panel: '#1a1a2a',
  text: '#ffffff',
  textMuted: '#aaaaaa',
  gold: '#ffcc00',
  accent: '#00f5d4',
  btnPrimary: '#2a2a44',
  btnPrimaryHover: '#4444aa',
  btnSuccess: '#006655',
  btnDanger: '#662222',
  btnWarning: '#664400',
  border: '#8b5a00'
};

// Global Styles
const style = document.createElement('style');
style.innerHTML = `
  * { box-sizing: border-box; }
  body {
    background-color: ${COLORS.bg};
    color: ${COLORS.text};
    font-family: 'Courier New', Courier, monospace;
    user-select: none;
    -webkit-user-select: none;
  }
  .panel {
    background-color: ${COLORS.panel};
    border: 2px solid ${COLORS.border};
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    max-width: 400px;
    width: 90%;
    margin: 0 auto;
  }
  button {
    background-color: ${COLORS.btnPrimary};
    color: ${COLORS.text};
    border: 1px solid ${COLORS.textMuted};
    border-radius: 4px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.2s;
    touch-action: manipulation;
  }
  button:active {
    background-color: ${COLORS.btnPrimaryHover};
    transform: translateY(1px);
  }
  .dpad-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-top: 20px;
  }
  .dpad-btn {
    height: 70px;
    font-size: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .stat-box {
    text-align: center;
  }
  .stat-label {
    font-size: 10px;
    color: ${COLORS.textMuted};
    letter-spacing: 1px;
    margin-bottom: 4px;
  }
  .stat-val {
    font-size: 28px;
    font-weight: bold;
    color: ${COLORS.accent};
  }
  h2 {
    margin-top: 0;
    color: ${COLORS.gold};
    text-align: center;
    font-size: 18px;
    letter-spacing: 2px;
    margin-bottom: 20px;
  }
  input {
    background: #000;
    border: 1px solid ${COLORS.accent};
    color: #fff;
    padding: 10px;
    font-family: inherit;
    font-size: 24px;
    text-align: center;
    border-radius: 4px;
    width: 100%;
    outline: none;
  }
  .pause-action-btn {
    width: 100%;
    padding: 14px;
    font-size: 15px;
    font-weight: bold;
    border-radius: 6px;
    margin-bottom: 10px;
    letter-spacing: 1px;
  }
  .inv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
    margin-bottom: 6px;
  }
  .inv-row .item-label {
    font-size: 13px;
    font-weight: bold;
    color: ${COLORS.accent};
  }
  .inv-row .item-count {
    font-size: 11px;
    color: ${COLORS.textMuted};
    margin-left: 6px;
  }
  .use-btn {
    background: ${COLORS.btnSuccess};
    border: none;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: bold;
    border-radius: 4px;
    color: ${COLORS.accent};
  }
  .section-title {
    font-size: 11px;
    color: ${COLORS.textMuted};
    letter-spacing: 2px;
    margin: 14px 0 8px;
    text-transform: uppercase;
  }
  .modifier-chip {
    display: inline-block;
    background: rgba(255,255,255,0.08);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: bold;
    margin: 2px 4px 2px 0;
  }
  .equip-slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-size: 12px;
  }
  .slot-name {
    color: ${COLORS.textMuted};
    min-width: 60px;
    font-size: 10px;
    letter-spacing: 1px;
  }
  .slot-item {
    color: ${COLORS.accent};
    font-weight: bold;
  }
  .slot-empty {
    color: #444;
    font-style: italic;
  }
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
  }
  .confirm-box {
    background: ${COLORS.panel};
    border: 2px solid ${COLORS.border};
    border-radius: 8px;
    padding: 24px;
    max-width: 320px;
    width: 90%;
    text-align: center;
  }
  .confirm-box h3 {
    color: ${COLORS.gold};
    margin-top: 0;
    letter-spacing: 2px;
  }
  .confirm-box p {
    color: ${COLORS.textMuted};
    font-size: 13px;
    margin-bottom: 20px;
  }
  .confirm-btns {
    display: flex;
    gap: 10px;
  }
  .confirm-btns button {
    flex: 1;
    padding: 12px;
    font-size: 13px;
    font-weight: bold;
    border-radius: 4px;
  }
`;
document.head.appendChild(style);

let roomCode: string | null = new URLSearchParams(window.location.search).get('code');
let isConnected = false;
let gameState: any = {};
let pauseState: any = null;
let currentView: 'join' | 'map' | 'ride' | 'pause' = 'join';
let lastStateTime = 0;

const app = document.getElementById('app')!;

socket.on('connect', () => {
  console.log('Connected to server');
  if (roomCode) {
    joinRoom(roomCode);
  } else {
    render();
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected');
  isConnected = false;
  render();
});

socket.on('HOST_STATE_UPDATE', (state) => {
  gameState = state;
  if (currentView === 'pause') return; // Don't switch away from pause mid-update
  if (currentView !== 'ride') {
    currentView = 'ride';
  }
  lastStateTime = Date.now();
  render();
});

socket.on('HOST_PAUSE_STATE', (state) => {
  pauseState = state;
  currentView = 'pause';
  render();
});

socket.on('HOST_RESUME_STATE', () => {
  pauseState = null;
  currentView = 'ride';
  lastStateTime = Date.now();
  render();
});

// Watchdog to switch back to map if no updates received
setInterval(() => {
  if (isConnected && currentView === 'ride' && Date.now() - lastStateTime > 2000) {
    currentView = 'map';
    render();
  }
}, 1000);

function joinRoom(code: string) {
  code = code.toUpperCase();
  socket.emit('CLIENT_JOIN_ROOM', { roomCode: code }, (response: any) => {
    if (response.success) {
      roomCode = code;
      isConnected = true;
      currentView = 'map';
      render();
    } else {
      alert('Failed to join room: ' + response.error);
      roomCode = null;
      render();
    }
  });
}

function sendInput(type: string, payload: any = {}) {
  if (!isConnected) return;
  socket.emit('CLIENT_INPUT', { type, ...payload });
}

// Render logic
function render() {
  if (!socket.connected) {
    app.innerHTML = `<div class="panel" style="text-align:center; color:${COLORS.textMuted}">CONNECTING...</div>`;
    return;
  }

  if (!isConnected) {
    renderJoin();
    return;
  }

  if (currentView === 'pause') {
    renderPause();
  } else if (currentView === 'map') {
    renderMap();
  } else if (currentView === 'ride') {
    renderRide();
  }
}

function renderJoin() {
  app.innerHTML = `
    <div class="panel">
      <h2>${i18n.t('remote.join_title')}</h2>
      <div style="margin-bottom:20px;">
        <input type="text" id="code-input" placeholder="${i18n.t('remote.code_placeholder')}" maxlength="4" style="text-transform:uppercase;">
      </div>
      <button id="join-btn" style="width:100%; padding:15px; font-weight:bold; font-size:16px;">${i18n.t('remote.connect_btn')}</button>
    </div>
  `;

  const input = document.getElementById('code-input') as HTMLInputElement;
  if (roomCode) input.value = roomCode;

  document.getElementById('join-btn')!.onclick = () => {
    if (input.value) joinRoom(input.value);
  };
}

function renderMap() {
  app.innerHTML = `
    <div class="panel">
      <h2>${i18n.t('remote.map_control')}</h2>
      <div style="text-align:center; color:${COLORS.textMuted}; font-size:10px; margin-bottom:10px;">
        ${i18n.t('remote.navigate_select')}
      </div>
      <div class="dpad-grid">
        <div></div>
        <button id="up-btn" class="dpad-btn">▲</button>
        <div></div>

        <button id="left-btn" class="dpad-btn">◀</button>
        <button id="ok-btn" class="dpad-btn" style="color:${COLORS.gold}; border-color:${COLORS.gold};">${i18n.t('remote.ok')}</button>
        <button id="right-btn" class="dpad-btn">▶</button>

        <div></div>
        <button id="down-btn" class="dpad-btn">▼</button>
        <div></div>
      </div>
    </div>
  `;

  const bind = (id: string, dir: string) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.onclick = () => {
        sendInput('dpad', { direction: dir });
        if (navigator.vibrate) navigator.vibrate(10);
      };
    }
  };
  bind('up-btn', 'up');
  bind('down-btn', 'down');
  bind('left-btn', 'left');
  bind('right-btn', 'right');
  document.getElementById('ok-btn')!.onclick = () => {
    sendInput('action', { action: 'select' });
    if (navigator.vibrate) navigator.vibrate(20);
  };
}

function renderRide() {
  if (!gameState) return;
  app.innerHTML = `
    <div class="panel">
      <h2>${i18n.t('remote.dashboard')}</h2>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
        <div class="stat-box">
          <div class="stat-label">${i18n.t('remote.power')}</div>
          <div class="stat-val" style="color:${COLORS.gold}">${gameState.instantaneousPower ?? '--'} <span style="font-size:12px">W</span></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">${i18n.t('remote.heart_rate')}</div>
          <div class="stat-val" style="color:#ff4444">${gameState.heartRateBpm ?? '--'} <span style="font-size:12px">BPM</span></div>
        </div>
        <div class="stat-box">
          <div class="stat-label">${i18n.t('remote.speed')}</div>
          ${gameState.units === 'imperial'
            ? `<div class="stat-val">${gameState.speedMs ? (gameState.speedMs * 2.23694).toFixed(1) : '--'} <span style="font-size:12px">MPH</span></div>`
            : `<div class="stat-val">${gameState.speedMs ? (gameState.speedMs * 3.6).toFixed(1) : '--'} <span style="font-size:12px">KM/H</span></div>`
          }
        </div>
        <div class="stat-box">
          <div class="stat-label">${i18n.t('remote.grade')}</div>
          <div class="stat-val">${gameState.currentGrade ? (gameState.currentGrade * 100).toFixed(1) : '0.0'} <span style="font-size:12px">%</span></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
        <button id="pause-btn" style="
          background-color: ${COLORS.btnPrimary};
          border: 1px solid ${COLORS.textMuted};
          padding: 15px;
          font-size: 16px;
          font-weight: bold;
          border-radius: 4px;
          color: ${COLORS.text};
        ">${i18n.t('remote.pause')}</button>
        <button id="tailwind-btn" style="
          background-color: ${COLORS.gold};
          border: none;
          padding: 15px;
          font-size: 16px;
          font-weight: bold;
          border-radius: 4px;
          color: #2a2018;
          box-shadow: 0 0 10px ${COLORS.gold}44;
        ">${i18n.t('item.tailwind')}</button>
      </div>

      <div class="dpad-grid">
        <div></div>
        <button id="up-btn" class="dpad-btn">▲</button>
        <div></div>

        <button id="left-btn" class="dpad-btn">◀</button>
        <button id="ok-btn" class="dpad-btn" style="color:${COLORS.gold}; border-color:${COLORS.gold};">${i18n.t('remote.ok')}</button>
        <button id="right-btn" class="dpad-btn">▶</button>

        <div></div>
        <button id="down-btn" class="dpad-btn">▼</button>
        <div></div>
      </div>
    </div>
  `;

  document.getElementById('pause-btn')!.onclick = () => {
    sendInput('action', { action: 'pause' });
    if (navigator.vibrate) navigator.vibrate(20);
  };

  document.getElementById('tailwind-btn')!.onclick = () => {
    sendInput('item', { itemId: 'tailwind' });
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  };

  const bind = (id: string, dir: string) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.onclick = () => {
        sendInput('dpad', { direction: dir });
        if (navigator.vibrate) navigator.vibrate(10);
      };
    }
  };
  bind('up-btn', 'up');
  bind('down-btn', 'down');
  bind('left-btn', 'left');
  bind('right-btn', 'right');
  document.getElementById('ok-btn')!.onclick = () => {
    sendInput('action', { action: 'select' });
    if (navigator.vibrate) navigator.vibrate(20);
  };
}

function renderPause() {
  const ps = pauseState ?? {};
  const inventory: string[] = ps.inventory ?? [];
  const modifiers = ps.modifiers ?? { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 };
  const equipped: Record<string, string> = ps.equipped ?? {};
  const isRoguelike: boolean = ps.isRoguelike ?? false;
  const gold: number = ps.gold ?? 0;
  const ftpW: number = ps.ftpW ?? 0;

  // Count inventory items
  const invCounts = new Map<string, number>();
  for (const id of inventory) {
    invCounts.set(id, (invCounts.get(id) ?? 0) + 1);
  }

  // Consumable items (no slot) that are usable during a ride
  const rideUsableItems = ['tailwind'];
  const usableInv = [...invCounts.entries()].filter(([id]) => rideUsableItems.includes(id));
  const passiveInv = [...invCounts.entries()].filter(([id]) => !rideUsableItems.includes(id));

  // Modifier chips
  const modChips: string[] = [];
  if (modifiers.powerMult !== 1.0) {
    const pct = Math.round((modifiers.powerMult - 1) * 100);
    const val = (pct >= 0 ? '+' : '') + pct;
    modChips.push(`<span class="modifier-chip" style="color:#88ffaa;">${i18n.t('item.modifier.power', { val })}</span>`);
  }
  if (modifiers.dragReduction !== 0.0) {
    const pct = Math.round(modifiers.dragReduction * 100);
    modChips.push(`<span class="modifier-chip" style="color:#88ddff;">${i18n.t('item.modifier.aero', { val: pct })}</span>`);
  }
  if (modifiers.weightMult !== 1.0) {
    const pct = Math.round((1 - modifiers.weightMult) * 100);
    const val = (pct >= 0 ? '+' : '') + pct;
    modChips.push(`<span class="modifier-chip" style="color:#ffcc66;">${i18n.t('item.modifier.weight', { val })}</span>`);
  }
  if (modifiers.crrMult !== undefined && modifiers.crrMult !== 1.0) {
    const pct = Math.round((1 - modifiers.crrMult) * 100);
    const val = (pct >= 0 ? '+' : '') + pct;
    modChips.push(`<span class="modifier-chip" style="color:#bbff88;">${i18n.t('item.modifier.rolling', { val })}</span>`);
  }

  // Equipment slots
  const allSlots = ['helmet', 'frame', 'cranks', 'pedals', 'tires'] as const;
  const equippedSlots = allSlots.filter(slot => equipped[slot]);
  const bagItems = passiveInv;

  const backLabel = isRoguelike ? i18n.t('remote.back_to_map') : i18n.t('remote.main_menu');
  const goldStr = isRoguelike ? `<div style="text-align:center; font-size:13px; color:${COLORS.gold}; margin-bottom:16px;">${i18n.t('pause.gold', { amount: gold })}</div>` : '';

  app.innerHTML = `
    <div class="panel">
      <h2>${i18n.t('remote.pause')}</h2>
      ${goldStr}
      <div style="font-size:12px; color:${COLORS.textMuted}; text-align:center; margin-bottom:4px;">FTP: ${ftpW}W</div>

      <button class="pause-action-btn" id="resume-btn" style="background:${COLORS.btnSuccess}; border:none; color:${COLORS.accent};">
        ${i18n.t('remote.resume')}
      </button>
      <button class="pause-action-btn" id="backtomap-btn" style="background:${COLORS.btnWarning}; border:none; color:#ffcc88;">
        ${backLabel}
      </button>
      <button class="pause-action-btn" id="savequit-btn" style="background:${COLORS.btnDanger}; border:none; color:#ff8888;">
        ${i18n.t('remote.save_quit')}
      </button>

      ${modChips.length > 0 ? `
        <div class="section-title">${i18n.t('pause.modifiers')}</div>
        <div>${modChips.join('')}</div>
      ` : ''}

      ${equippedSlots.length > 0 ? `
        <div class="section-title">${i18n.t('pause.equipped')}</div>
        ${equippedSlots.map(slot => `
          <div class="equip-slot">
            <span class="slot-name">${i18n.t('slots.' + slot)}</span>
            <span class="slot-item">${getItemLabel(equipped[slot])}</span>
          </div>
        `).join('')}
      ` : ''}

      ${usableInv.length > 0 ? `
        <div class="section-title">${i18n.t('pause.inventory_usable')}</div>
        ${usableInv.map(([id, count]) => `
          <div class="inv-row">
            <div>
              <span class="item-label">${getItemLabel(id)}</span>
              <span class="item-count">×${count}</span>
            </div>
            <button class="use-btn" data-item="${id}">${i18n.t('pause.use')}</button>
          </div>
        `).join('')}
      ` : ''}

      ${bagItems.length > 0 ? `
        <div class="section-title">${i18n.t('pause.bag_map_only')}</div>
        ${bagItems.map(([id, count]) => `
          <div class="inv-row">
            <div>
              <span class="item-label">${getItemLabel(id)}</span>
              <span class="item-count">×${count}</span>
            </div>
          </div>
        `).join('')}
      ` : ''}
    </div>
  `;

  document.getElementById('resume-btn')!.onclick = () => {
    sendInput('action', { action: 'resume' });
    if (navigator.vibrate) navigator.vibrate(20);
    // Optimistically switch to ride view; HOST_RESUME_STATE will confirm
    pauseState = null;
    currentView = 'ride';
    render();
  };

  document.getElementById('backtomap-btn')!.onclick = () => {
    showConfirm(
      i18n.t('remote.abandon_title'),
      isRoguelike ? i18n.t('remote.abandon_msg_rogue') : i18n.t('remote.abandon_msg_menu'),
      i18n.t('remote.yes_abandon'),
      () => {
        sendInput('action', { action: 'backToMap' });
        if (navigator.vibrate) navigator.vibrate(30);
        pauseState = null;
        currentView = 'map';
        render();
      }
    );
  };

  document.getElementById('savequit-btn')!.onclick = () => {
    showConfirm(
      i18n.t('remote.confirm_save_title'),
      i18n.t('remote.confirm_save_msg'),
      i18n.t('remote.confirm_save_btn'),
      () => {
        sendInput('action', { action: 'saveQuit' });
        if (navigator.vibrate) navigator.vibrate(30);
        pauseState = null;
        currentView = 'map';
        render();
      }
    );
  };

  // Wire up USE buttons
  document.querySelectorAll('.use-btn').forEach(btn => {
    (btn as HTMLButtonElement).onclick = () => {
      const itemId = (btn as HTMLButtonElement).dataset.item;
      if (itemId) {
        sendInput('item', { itemId });
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        // Remove one instance from local state for feedback
        const idx = pauseState?.inventory?.indexOf(itemId);
        if (idx !== undefined && idx >= 0) pauseState.inventory.splice(idx, 1);
        renderPause();
      }
    };
  });
}

function getItemLabel(id: string): string {
  // Use translations if available, fallback to id
  if (i18n.exists(`item.${id}`)) return i18n.t(`item.${id}`);
  return id.toUpperCase().replace(/_/g, ' ');
}

function showConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <h3>${title}</h3>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <div class="confirm-btns">
        <button id="conf-cancel" style="background:${COLORS.btnPrimary}">${i18n.t('remote.cancel')}</button>
        <button id="conf-ok" style="background:${COLORS.btnDanger}; border-color:${COLORS.btnDanger};">${confirmLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('conf-cancel')!.onclick = () => overlay.remove();
  document.getElementById('conf-ok')!.onclick = () => {
    overlay.remove();
    onConfirm();
  };
}
