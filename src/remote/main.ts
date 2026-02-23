import { io, Socket } from 'socket.io-client';

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
`;
document.head.appendChild(style);

let roomCode: string | null = new URLSearchParams(window.location.search).get('code');
let isConnected = false;
let gameState: any = {};
let currentView: 'join' | 'map' | 'ride' = 'join';
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
  if (currentView !== 'ride') {
      currentView = 'ride';
  }
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

    if (currentView === 'map') {
        renderMap();
    } else if (currentView === 'ride') {
        renderRide();
    }
}

function renderJoin() {
    app.innerHTML = `
        <div class="panel">
            <h2>JOIN GAME</h2>
            <div style="margin-bottom:20px;">
                <input type="text" id="code-input" placeholder="CODE" maxlength="4" style="text-transform:uppercase;">
            </div>
            <button id="join-btn" style="width:100%; padding:15px; font-weight:bold; font-size:16px;">CONNECT</button>
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
            <h2>MAP CONTROL</h2>
            <div style="text-align:center; color:${COLORS.textMuted}; font-size:10px; margin-bottom:10px;">
                NAVIGATE & SELECT
            </div>
            <div class="dpad-grid">
                <div></div>
                <button id="up-btn" class="dpad-btn">▲</button>
                <div></div>

                <button id="left-btn" class="dpad-btn">◀</button>
                <button id="ok-btn" class="dpad-btn" style="color:${COLORS.gold}; border-color:${COLORS.gold};">OK</button>
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
            <h2>RIDE DASHBOARD</h2>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                <div class="stat-box">
                    <div class="stat-label">POWER</div>
                    <div class="stat-val" style="color:${COLORS.gold}">${gameState.instantaneousPower ?? '--'} <span style="font-size:12px">W</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">HEART RATE</div>
                    <div class="stat-val" style="color:#ff4444">${gameState.heartRateBpm ?? '--'} <span style="font-size:12px">BPM</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">SPEED</div>
                    <div class="stat-val">${gameState.speedMs ? (gameState.speedMs * 3.6).toFixed(1) : '--'} <span style="font-size:12px">KM/H</span></div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">GRADE</div>
                    <div class="stat-val">${gameState.currentGrade ? (gameState.currentGrade * 100).toFixed(1) : '0.0'} <span style="font-size:12px">%</span></div>
                </div>
            </div>

            <button id="tailwind-btn" style="
                background-color: ${COLORS.gold};
                border: none;
                padding: 15px;
                width: 100%;
                font-size: 16px;
                font-weight: bold;
                border-radius: 4px;
                color: #2a2018;
                box-shadow: 0 0 10px ${COLORS.gold}44;
            ">ACTIVATE TAILWIND</button>
        </div>
    `;

    document.getElementById('tailwind-btn')!.onclick = () => {
        sendInput('item', { itemId: 'tailwind' });
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    };
}
