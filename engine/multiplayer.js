import { auth, database } from "../firebase-config.js";
import { 
  ref, 
  set, 
  get, 
  update, 
  remove, 
  onValue, 
  onDisconnect, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Global variables for multiplayer state
let isMultiplayerMode = false;
let roomId = null;
let myPlayerId = null;
let myName = "Guest";
let players = {};
let isHost = false;
let currentHostId = null;
let roomStatus = "lobby"; // lobby | playing | gameover
let scoreCheckInterval = null;
let currentScore = 0;
let dbListeners = [];
let gameId = "";
let localPlaying = false; // Guard flag to prevent repeated match launches during score sync updates
let pendingRoomCode = null; // Stored if user navigated via a room link

// Auto-detect game ID from URL path
function detectGameId() {
  const pathParts = window.location.pathname.split('/');
  const gamesIdx = pathParts.indexOf('games');
  if (gamesIdx !== -1 && gamesIdx < pathParts.length - 1) {
    return pathParts[gamesIdx + 1];
  }
  return "generic-game";
}

gameId = detectGameId();

// Setup Name and Nickname
function initName() {
  try {
    const loggedInName = localStorage.getItem('currentUserDisplayName');
    if (loggedInName) {
      myName = loggedInName;
    } else {
      myName = "Player_" + Math.floor(100 + Math.random() * 900);
    }
  } catch (e) {
    console.warn("Could not read localStorage name, using fallback:", e);
    myName = "Player_" + Math.floor(100 + Math.random() * 900);
  }
  myPlayerId = "mp_player_" + Math.random().toString(36).substr(2, 9);
}

// Set multiplayer active state helper
function setMpActive(active) {
  isMultiplayerMode = active;
  if (active) {
    document.body.classList.add('mp-active');
  } else {
    document.body.classList.remove('mp-active');
  }
}

// ----------------------------------------------------
// UI Styles Injection
// ----------------------------------------------------
function injectStyles() {
  const css = `
    body.mp-active #gameover-overlay {
      display: none !important;
    }
    body.mp-active #menu-overlay {
      display: none !important;
    }

    .mp-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(8, 8, 8, 0.88);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      z-index: 99999;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: 'Courier Prime', 'Courier', monospace;
      color: #eee;
      box-sizing: border-box;
    }

    .mp-card {
      background: rgba(15, 15, 15, 0.95);
      border: 1px solid rgba(157, 0, 255, 0.35);
      box-shadow: 0 0 35px rgba(157, 0, 255, 0.25), inset 0 0 15px rgba(157, 0, 255, 0.05);
      border-radius: 12px;
      padding: 2.2rem;
      max-width: 480px;
      width: 90%;
      text-align: center;
      position: relative;
      box-sizing: border-box;
    }

    .mp-card h2 {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.8rem;
      letter-spacing: 4px;
      color: #fff;
      text-transform: uppercase;
      margin-top: 0;
      margin-bottom: 1.2rem;
      text-shadow: 0 0 10px rgba(157, 0, 255, 0.6);
    }

    .mp-card p.mp-desc {
      color: #888;
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
      line-height: 1.5;
      text-transform: none;
    }

    .mp-tabs {
      display: flex;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .mp-tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: #666;
      padding: 12px;
      font-family: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 2px;
      transition: all 0.3s ease;
    }

    .mp-tab-btn.active {
      color: #9d00ff;
      border-bottom: 2px solid #9d00ff;
      font-weight: bold;
      text-shadow: 0 0 8px rgba(157, 0, 255, 0.4);
    }

    .mp-tab-content {
      display: none;
      text-align: left;
    }

    .mp-tab-content.active {
      display: block;
    }

    .mp-input-group {
      margin-bottom: 1.2rem;
    }

    .mp-input-group label {
      display: block;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #aaa;
      margin-bottom: 0.5rem;
    }

    .mp-input {
      width: 100%;
      background: rgba(22, 22, 22, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #fff;
      padding: 12px 14px;
      font-family: inherit;
      font-size: 0.9rem;
      border-radius: 6px;
      box-sizing: border-box;
      letter-spacing: 1px;
      transition: all 0.3s ease;
    }

    .mp-input:focus {
      outline: none;
      border-color: #9d00ff;
      box-shadow: 0 0 10px rgba(157, 0, 255, 0.3);
    }

    .mp-btn {
      width: 100%;
      background: transparent;
      border: 1px solid #9d00ff;
      color: #fff;
      padding: 12px;
      font-family: inherit;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 3px;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.3s ease;
      margin-top: 5px;
    }

    .mp-btn:hover:not(:disabled) {
      background: #9d00ff;
      box-shadow: 0 0 15px rgba(157, 0, 255, 0.5);
      transform: translateY(-1px);
    }

    .mp-btn:disabled {
      border-color: #444;
      color: #666;
      cursor: not-allowed;
    }

    .mp-btn-secondary {
      border-color: #555;
    }

    .mp-btn-secondary:hover {
      background: #333;
      border-color: #777;
      box-shadow: none !important;
    }

    .mp-room-code-display {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.2rem;
      font-weight: 900;
      color: #9d00ff;
      letter-spacing: 6px;
      text-shadow: 0 0 12px rgba(157, 0, 255, 0.8);
      margin: 1.2rem 0;
      background: rgba(157, 0, 255, 0.05);
      padding: 8px;
      border-radius: 6px;
      border: 1px dashed rgba(157, 0, 255, 0.2);
    }

    .mp-players-list {
      background: rgba(5, 5, 5, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 6px;
      max-height: 180px;
      overflow-y: auto;
      margin: 1.2rem 0;
    }

    .mp-player-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .mp-player-row:last-child {
      border-bottom: none;
    }

    .mp-player-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .mp-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(157, 0, 255, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 0.8rem;
      font-weight: bold;
      color: #fff;
      text-shadow: none;
      box-shadow: 0 0 8px rgba(157, 0, 255, 0.3);
    }

    .mp-badge {
      font-size: 0.62rem;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: bold;
      letter-spacing: 1px;
    }

    .mp-badge.host {
      background: rgba(157, 0, 255, 0.15);
      color: #b76eff;
      border: 1px solid rgba(157, 0, 255, 0.3);
    }

    .mp-badge.ready {
      background: rgba(46, 204, 113, 0.15);
      color: #2ecc71;
      border: 1px solid rgba(46, 204, 113, 0.3);
    }

    .mp-badge.calibrating {
      background: rgba(241, 196, 15, 0.15);
      color: #f1c40f;
      border: 1px solid rgba(241, 196, 15, 0.3);
    }

    .mp-badge.lobby {
      background: rgba(255, 255, 255, 0.05);
      color: #aaa;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .mp-badge.playing {
      background: rgba(0, 229, 255, 0.15);
      color: #00e5ff;
      border: 1px solid rgba(0, 229, 255, 0.3);
      animation: pulse 1s infinite alternate;
    }

    .mp-badge.finished {
      background: rgba(155, 89, 182, 0.2);
      color: #d896ff;
      border: 1px solid rgba(155, 89, 182, 0.4);
    }

    .mp-winner-banner {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.6rem;
      font-weight: bold;
      color: #f1c40f;
      text-shadow: 0 0 15px rgba(241, 196, 15, 0.7);
      margin-bottom: 1.5rem;
      padding: 10px;
      background: rgba(241, 196, 15, 0.05);
      border: 1px solid rgba(241, 196, 15, 0.2);
      border-radius: 6px;
    }

    .mp-score-item {
      font-weight: bold;
      color: #00ff88;
      font-size: 0.95rem;
      text-shadow: 0 0 5px rgba(0, 255, 136, 0.2);
    }

    .mp-status-msg {
      font-size: 0.78rem;
      color: #f1c40f;
      margin-top: 10px;
      text-shadow: none;
    }

    @keyframes pulse {
      0% { opacity: 0.6; }
      100% { opacity: 1; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.innerHTML = css;
  document.head.appendChild(styleEl);
}

// Extract room parameter from URL and clean address bar
function checkUrlRoomCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      pendingRoomCode = roomParam;
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({path: cleanUrl}, '', cleanUrl);
    }
  } catch (e) {
    console.error("Failed to parse room code URL parameter:", e);
  }
}

// ----------------------------------------------------
// Modals Injection (Mode Select / Join Prompt)
// ----------------------------------------------------
let activeOverlay = null;

function createBaseOverlay() {
  if (activeOverlay) {
    activeOverlay.remove();
  }

  activeOverlay = document.createElement('div');
  activeOverlay.className = 'mp-overlay';
  document.body.appendChild(activeOverlay);
  return activeOverlay;
}

// Intercepts the end of calibration
function showModeSelectOverlay(onSinglePlayer) {
  const overlay = createBaseOverlay();
  
  overlay.innerHTML = `
    <div class="mp-card">
      <h2>SELECT GAME MODE</h2>
      <p class="mp-desc">You are fully calibrated! Choose whether to play on your own or invite friends.</p>
      
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-mode-single" class="mp-btn">Play Individually</button>
        <button id="btn-mode-multi" class="mp-btn mp-btn-secondary" style="border-color: #9d00ff; color: #b76eff;">Play Multiplayer (with Friends)</button>
      </div>
    </div>
  `;

  document.getElementById('btn-mode-single').addEventListener('click', () => {
    overlay.remove();
    activeOverlay = null;
    onSinglePlayer(); // Let the single player game start
  });

  document.getElementById('btn-mode-multi').addEventListener('click', () => {
    setMpActive(true);
    showSetupScreen();
  });
}

function showJoinPromptOverlay(code, onCancel) {
  const overlay = createBaseOverlay();

  overlay.innerHTML = `
    <div class="mp-card">
      <h2>JOIN ROOM: <span style="color: #00e5ff;">${code}</span></h2>
      <p class="mp-desc">Enter your nickname to join your friend's multiplayer match.</p>

      <div class="mp-input-group" style="text-align: left;">
        <label for="mp-join-nickname-direct">Nickname</label>
        <input type="text" id="mp-join-nickname-direct" class="mp-input" maxlength="12" value="${myName}">
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-join-direct-action" class="mp-btn">Join Match</button>
        <button id="btn-join-direct-cancel" class="mp-btn mp-btn-secondary">Cancel</button>
      </div>
    </div>
  `;

  document.getElementById('btn-join-direct-action').addEventListener('click', () => {
    const nick = document.getElementById('mp-join-nickname-direct').value.trim();
    if (!nick) {
      alert("Please enter a nickname.");
      return;
    }
    overlay.remove();
    activeOverlay = null;
    setMpActive(true);
    joinRoomActionDirect(nick, code);
  });

  document.getElementById('btn-join-direct-cancel').addEventListener('click', () => {
    overlay.remove();
    activeOverlay = null;
    onCancel(); // Fall back to regular flow options
  });
}

function showSetupScreen() {
  const overlay = createBaseOverlay();

  overlay.innerHTML = `
    <div class="mp-card">
      <h2>MULTIPLAYER PORTAL</h2>
      <p class="mp-desc">Compete with friends in real-time. Highest score wins the match!</p>
      
      <div class="mp-tabs">
        <button id="tab-join" class="mp-tab-btn active">Join Room</button>
        <button id="tab-host" class="mp-tab-btn">Host Room</button>
      </div>

      <!-- Join Room Tab -->
      <div id="content-join" class="mp-tab-content active">
        <div class="mp-input-group">
          <label for="mp-join-name">Your Nickname</label>
          <input type="text" id="mp-join-name" class="mp-input" maxlength="12" value="${myName}">
        </div>
        <div class="mp-input-group">
          <label for="mp-join-code">4-Digit Room Code</label>
          <input type="text" id="mp-join-code" class="mp-input" placeholder="e.g. 8421" maxlength="6" style="text-transform: uppercase;">
        </div>
        <button id="btn-action-join" class="mp-btn">Join Room</button>
      </div>

      <!-- Host Room Tab -->
      <div id="content-host" class="mp-tab-content">
        <div class="mp-input-group">
          <label for="mp-host-name">Your Nickname</label>
          <input type="text" id="mp-host-name" class="mp-input" maxlength="12" value="${myName}">
        </div>
        <button id="btn-action-host" class="mp-btn">Host Room</button>
      </div>

      <button id="btn-action-back" class="mp-btn mp-btn-secondary" style="margin-top: 15px;">Back to Menu</button>
    </div>
  `;

  // Tab Switching
  const tabJoin = document.getElementById('tab-join');
  const tabHost = document.getElementById('tab-host');
  const contentJoin = document.getElementById('content-join');
  const contentHost = document.getElementById('content-host');

  tabJoin.addEventListener('click', () => {
    tabJoin.classList.add('active');
    tabHost.classList.remove('active');
    contentJoin.classList.add('active');
    contentHost.classList.remove('active');
  });

  tabHost.addEventListener('click', () => {
    tabHost.classList.add('active');
    tabJoin.classList.remove('active');
    contentHost.classList.add('active');
    contentJoin.classList.remove('active');
  });

  // Buttons actions
  document.getElementById('btn-action-back').addEventListener('click', () => {
    setMpActive(false);
    overlay.remove();
    activeOverlay = null;
    // Restore original game menu
    const originalMenu = document.getElementById('menu-overlay');
    if (originalMenu) originalMenu.style.display = 'flex';
  });

  document.getElementById('btn-action-host').addEventListener('click', hostRoomAction);
  document.getElementById('btn-action-join').addEventListener('click', joinRoomAction);
}

function generateRoomCode() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// ----------------------------------------------------
// Room Join / Host Action Handlers
// ----------------------------------------------------
async function hostRoomAction() {
  try {
    const nameVal = document.getElementById('mp-host-name').value.trim();
    if (!nameVal) {
      alert("Please enter a nickname.");
      return;
    }
    myName = nameVal;
    
    try {
      localStorage.setItem('currentUserDisplayName', myName);
    } catch (e) {
      console.warn("Storage blocked:", e);
    }

    roomId = generateRoomCode();
    isHost = true;

    if (!database) {
      throw new Error("Firebase Database instance is not loaded.");
    }

    const roomRef = ref(database, `rooms/${roomId}`);
    const initialRoomState = {
      gameId: gameId,
      roomCode: roomId,
      status: "lobby",
      hostId: myPlayerId,
      players: {
        [myPlayerId]: {
          id: myPlayerId,
          name: myName,
          score: 0,
          status: "ready", // Automatically ready since calibration is already completed!
          isHost: true,
          online: true
        }
      }
    };

    console.log("Setting initial room state for room:", roomId);
    await set(roomRef, initialRoomState);
    
    const playerOnlineRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    onDisconnect(playerOnlineRef).remove();

    showLobbyScreen();
    setupRoomObservers(roomId);
  } catch (err) {
    console.error("Error hosting room:", err);
    alert("Failed to host room: " + err.message);
  }
}

async function joinRoomAction() {
  try {
    const nameVal = document.getElementById('mp-join-name').value.trim();
    const codeVal = document.getElementById('mp-join-code').value.trim();

    if (!nameVal) {
      alert("Please enter a nickname.");
      return;
    }
    if (!codeVal) {
      alert("Please enter the 4-digit room code.");
      return;
    }
    myName = nameVal;
    
    try {
      localStorage.setItem('currentUserDisplayName', myName);
    } catch (e) {
      console.warn("Storage blocked:", e);
    }
    
    roomId = codeVal;
    isHost = false;

    if (!database) {
      throw new Error("Firebase Database instance is not loaded.");
    }

    const roomSnap = await get(ref(database, `rooms/${roomId}`));
    if (!roomSnap.exists()) {
      alert(`Room ${roomId} does not exist.`);
      return;
    }

    const roomData = roomSnap.val();
    if (roomData.gameId !== gameId) {
      alert(`This room is for a different game: ${roomData.gameId.toUpperCase()}`);
      return;
    }

    if (roomData.status !== "lobby") {
      alert("This game has already started or completed.");
      return;
    }

    const newPlayerRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    await set(newPlayerRef, {
      id: myPlayerId,
      name: myName,
      score: 0,
      status: "ready", // Automatically ready since calibration is already completed!
      isHost: false,
      online: true
    });

    onDisconnect(newPlayerRef).remove();

    showLobbyScreen();
    setupRoomObservers(roomId);
  } catch (err) {
    console.error("Error joining room:", err);
    alert("Failed to join room: " + err.message);
  }
}

async function joinRoomActionDirect(nameVal, codeVal) {
  try {
    myName = nameVal;
    try {
      localStorage.setItem('currentUserDisplayName', myName);
    } catch (e) {
      console.warn("Storage blocked:", e);
    }
    roomId = codeVal;
    isHost = false;

    if (!database) {
      throw new Error("Firebase Database instance is not loaded.");
    }

    const roomSnap = await get(ref(database, `rooms/${roomId}`));
    if (!roomSnap.exists()) {
      alert(`Room ${roomId} does not exist.`);
      return;
    }

    const roomData = roomSnap.val();
    if (roomData.gameId !== gameId) {
      alert(`This room is for a different game: ${roomData.gameId.toUpperCase()}`);
      return;
    }

    if (roomData.status !== "lobby") {
      alert("This game has already started or completed.");
      return;
    }

    const newPlayerRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    await set(newPlayerRef, {
      id: myPlayerId,
      name: myName,
      score: 0,
      status: "ready", // Already calibrated ready
      isHost: false,
      online: true
    });

    onDisconnect(newPlayerRef).remove();

    showLobbyScreen();
    setupRoomObservers(roomId);
  } catch (err) {
    console.error("Error joining room direct:", err);
    alert("Failed to join room: " + err.message);
  }
}

// Leave room cleanup
async function leaveRoom() {
  cleanupObservers();
  clearInterval(scoreCheckInterval);
  if (roomId && myPlayerId) {
    try {
      await remove(ref(database, `rooms/${roomId}/players/${myPlayerId}`));
    } catch (err) {
      console.error(err);
    }
  }
  setMpActive(false);
  roomId = null;
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  // Reload page to reset all states cleanly!
  window.location.reload();
}

function cleanupObservers() {
  dbListeners.forEach(off => off());
  dbListeners = [];
}

// ----------------------------------------------------
// Lobby View Syncing
// ----------------------------------------------------
function showLobbyScreen() {
  const overlay = createBaseOverlay();
  
  overlay.innerHTML = `
    <div class="mp-card">
      <h2>LOBBY: <span id="lobby-code-val" style="color: #00e5ff;">${roomId}</span></h2>
      <p class="mp-desc">Invite friends by sharing this room code or the direct link below.</p>
      
      <button id="btn-mp-copy-link" class="mp-btn mp-btn-secondary" style="font-size: 0.72rem; padding: 6px; margin-bottom: 12px;">Copy Invite Link</button>
      
      <div class="mp-input-group" style="margin-bottom: 5px;">
        <label>Connected Players</label>
      </div>

      <div class="mp-players-list" id="mp-players-container">
        <!-- Dynamic list -->
      </div>

      <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
        <button id="btn-mp-start" class="mp-btn" style="display: none;" disabled>Start Match</button>
        <div id="mp-lobby-msg" class="mp-status-msg">All players must calibrate to launch match.</div>
        <button id="btn-mp-leave" class="mp-btn mp-btn-secondary">Leave Room</button>
      </div>
    </div>
  `;

  // Copy link handler
  document.getElementById('btn-mp-copy-link').addEventListener('click', () => {
    const inviteUrl = window.location.origin + window.location.pathname + "?room=" + roomId;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      const btn = document.getElementById('btn-mp-copy-link');
      btn.innerText = "COPIED URL!";
      btn.style.borderColor = "#2ecc71";
      setTimeout(() => {
        btn.innerText = "Copy Invite Link";
        btn.style.borderColor = "#555";
      }, 1500);
    });
  });

  // Action buttons
  document.getElementById('btn-mp-leave').addEventListener('click', leaveRoom);
  
  const startBtn = document.getElementById('btn-mp-start');
  startBtn.addEventListener('click', () => {
    // Start game
    update(ref(database, `rooms/${roomId}`), { status: "playing" });
  });
}

// Sync lobby UI with database data
function syncLobbyView(roomData) {
  const container = document.getElementById('mp-players-container');
  if (!container) return;

  players = roomData.players || {};
  container.innerHTML = "";

  const ids = Object.keys(players).sort();
  let pCount = 0;
  let readyCount = 0;

  ids.forEach(pId => {
    const p = players[pId];
    pCount++;
    if (p.status === "ready") readyCount++;

    const row = document.createElement('div');
    row.className = 'mp-player-row';

    let statusText = p.status.toUpperCase();
    let statusClass = p.status;
    if (p.isHost && p.status === "lobby") {
      statusText = "HOST (NOT READY)";
      statusClass = "calibrating";
    } else if (p.isHost && p.status === "ready") {
      statusText = "HOST (READY)";
      statusClass = "ready";
    }

    row.innerHTML = `
      <div class="mp-player-info">
        <div class="mp-avatar">${p.name.charAt(0).toUpperCase()}</div>
        <span style="font-weight: bold;">${p.name} ${p.id === myPlayerId ? ' (You)' : ''}</span>
      </div>
      <span class="mp-badge ${statusClass}">${statusText}</span>
    `;
    container.appendChild(row);
  });

  // Host starting controls
  currentHostId = roomData.hostId;
  isHost = (myPlayerId === currentHostId);
  
  const startBtn = document.getElementById('btn-mp-start');
  const msgEl = document.getElementById('mp-lobby-msg');

  if (isHost) {
    if (startBtn) {
      startBtn.style.display = 'block';
      const allReady = Object.values(players).every(p => p.status === "ready");

      if (pCount >= 2 && allReady) {
        startBtn.removeAttribute('disabled');
        msgEl.innerText = "All players ready! Start the match.";
        msgEl.style.color = "#2ecc71";
      } else if (pCount < 2) {
        startBtn.setAttribute('disabled', 'true');
        msgEl.innerText = "Waiting for at least 2 players...";
        msgEl.style.color = "#f1c40f";
      } else {
        startBtn.setAttribute('disabled', 'true');
        msgEl.innerText = "Waiting for all players to calibrate...";
        msgEl.style.color = "#f1c40f";
      }
    }
  } else {
    if (startBtn) startBtn.style.display = 'none';
    const myState = players[myPlayerId]?.status;
    if (myState === "ready") {
      msgEl.innerText = "You are Ready! Waiting for Host to start...";
      msgEl.style.color = "#2ecc71";
    } else {
      msgEl.innerText = "Please calibrate your sensors to mark yourself as ready.";
      msgEl.style.color = "#f1c40f";
    }
  }
}

// ----------------------------------------------------
// Room Observers
// ----------------------------------------------------
function setupRoomObservers(rId) {
  cleanupObservers();
  const roomRef = ref(database, `rooms/${rId}`);

  const roomListener = onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      alert("Room was closed or dismissed.");
      leaveRoom();
      return;
    }

    const roomData = snapshot.val();
    roomStatus = roomData.status;

    // Check if host disconnected and reassign host
    const playerList = roomData.players || {};
    const sortedIds = Object.keys(playerList).sort();
    if (sortedIds.length > 0 && roomData.hostId !== sortedIds[0]) {
      update(roomRef, { hostId: sortedIds[0] });
      // If I became the new host, notify
      if (myPlayerId === sortedIds[0]) {
        isHost = true;
        update(ref(database, `rooms/${rId}/players/${myPlayerId}`), { isHost: true });
      }
    }

    if (roomStatus === "lobby") {
      localPlaying = false; // Reset local playing state when returning to lobby
      if (activeOverlay && activeOverlay.style.display === 'none') {
        // If we were calibrating and room was reset
      } else {
        if (!document.getElementById('mp-players-container')) {
          showLobbyScreen();
        }
        syncLobbyView(roomData);
      }
    } else if (roomStatus === "playing") {
      // Guard gate ensures launchMatch is only triggered once at the transition to playing status
      if (!localPlaying) {
        localPlaying = true;
        launchMatch();
      }
      // If we are currently showing the gameover/waiting scoreboard, sync it in real-time!
      if (document.getElementById('mp-gameover-container')) {
        syncGameoverView(roomData);
      }
    } else if (roomStatus === "gameover") {
      localPlaying = false; // Reset local playing state on gameover
      syncGameoverView(roomData);
    }
  });

  dbListeners.push(() => roomListener);
}

// ----------------------------------------------------
// Launch Gameplay Sync
// ----------------------------------------------------
function launchMatch() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  // Set my player status to playing
  update(ref(database, `rooms/${roomId}/players/${myPlayerId}`), { status: "playing", score: 0 });

  // Hide calibration overlays if active
  const calOverlay = document.getElementById('calibration-overlay');
  if (calOverlay) calOverlay.style.display = 'none';

  const originalMenu = document.getElementById('menu-overlay');
  if (originalMenu) originalMenu.style.display = 'none';

  // Make sure HUD is visible
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'flex';

  const toggleBg = document.getElementById('btn-toggle-bg');
  if (toggleBg) toggleBg.style.display = 'block';

  // Trigger game start
  if (typeof window.initGame === 'function') {
    window.initGame();
  } else if (typeof window.startGame === 'function') {
    window.startGame();
  }

  // Start checking score
  currentScore = 0;
  clearInterval(scoreCheckInterval);
  scoreCheckInterval = setInterval(syncLiveScoreToDatabase, 200);
}

// Get live score from DOM or variables
function getLiveScore() {
  let scoreVal = 0;
  if (typeof window.score === 'number') {
    scoreVal = window.score;
  } else if (window.player && typeof window.player.score === 'number') {
    scoreVal = window.player.score;
  } else {
    const hudScore = document.getElementById('hud-score');
    if (hudScore) {
      const txt = hudScore.innerText.trim();
      const parsed = parseInt(txt, 10);
      if (!isNaN(parsed)) {
        scoreVal = parsed;
      }
    }
  }
  return scoreVal;
}

function syncLiveScoreToDatabase() {
  const score = getLiveScore();
  if (score !== currentScore) {
    currentScore = score;
    update(ref(database, `rooms/${roomId}/players/${myPlayerId}`), { score: currentScore });
  }
}

// ----------------------------------------------------
// Gameover Integration Hooks
// ----------------------------------------------------
function handleMultiplayerGameOver(finalScore) {
  clearInterval(scoreCheckInterval);

  // Sync final score and mark as finished
  update(ref(database, `rooms/${roomId}/players/${myPlayerId}`), { 
    status: "finished", 
    score: finalScore 
  });

  // Hide game's internal offline gameover overlay
  const originalGameOver = document.getElementById('gameover-overlay');
  if (originalGameOver) {
    originalGameOver.style.display = 'none';
  }

  // Deactivate audio processing internally in game if applicable
  if (window.MovementController && typeof window.MovementController.stopSpeech === 'function') {
    window.MovementController.stopSpeech();
  }

  // Show our dynamic multiplayer gameover scoreboard overlay
  showGameoverScreen();
}

function showGameoverScreen() {
  const overlay = createBaseOverlay();
  
  overlay.innerHTML = `
    <div class="mp-card">
      <h2 style="color: #ff0055; text-shadow: 0 0 10px rgba(255, 0, 85, 0.6);">MATCH OVER</h2>
      
      <div id="mp-winner-announcement" style="display: none;"></div>

      <div class="mp-input-group" style="margin-bottom: 5px;">
        <label>Final Standings</label>
      </div>

      <div class="mp-players-list" id="mp-gameover-container">
        <!-- Live rank listings -->
      </div>

      <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
        <button id="btn-mp-replay" class="mp-btn" style="display: none;" disabled>Play Again (Host)</button>
        <div id="mp-replay-msg" class="mp-status-msg">Waiting for all players to finish...</div>
        <button id="btn-mp-go-lobby" class="mp-btn mp-btn-secondary">Return to Main Menu</button>
      </div>
    </div>
  `;

  document.getElementById('btn-mp-go-lobby').addEventListener('click', leaveRoom);
  
  const replayBtn = document.getElementById('btn-mp-replay');
  replayBtn.addEventListener('click', async () => {
    // Reset all players scores and mark them as ready (calibrated) so they can start immediately!
    const roomRef = ref(database, `rooms/${roomId}`);
    const updates = {
      status: "lobby"
    };

    // Keep players calibrated ready
    Object.keys(players).forEach(pId => {
      updates[`players/${pId}/score`] = 0;
      updates[`players/${pId}/status`] = "ready";
    });

    await update(roomRef, updates);
  });

  // Retrieve current room snapshot and draw it
  get(ref(database, `rooms/${roomId}`)).then(snap => {
    if (snap.exists()) {
      syncGameoverView(snap.val());
    }
  });
}

function syncGameoverView(roomData) {
  const container = document.getElementById('mp-gameover-container');
  if (!container) return;

  players = roomData.players || {};
  container.innerHTML = "";

  // Sort players by score descending
  const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);
  
  let allFinished = true;
  sortedPlayers.forEach((p, idx) => {
    if (p.status !== "finished") {
      allFinished = false;
    }

    const row = document.createElement('div');
    row.className = 'mp-player-row';

    let badgeText = p.status.toUpperCase();
    let badgeClass = p.status;
    if (p.status === "finished") {
      badgeText = `${p.score} PTS`;
    }

    row.innerHTML = `
      <div class="mp-player-info">
        <div class="mp-avatar">${p.name.charAt(0).toUpperCase()}</div>
        <span style="font-weight: bold;">#${idx + 1} ${p.name} ${p.id === myPlayerId ? ' (You)' : ''}</span>
      </div>
      <span class="mp-badge ${badgeClass}">${badgeText}</span>
    `;
    container.appendChild(row);
  });

  const winnerEl = document.getElementById('mp-winner-announcement');
  const replayBtn = document.getElementById('btn-mp-replay');
  const msgEl = document.getElementById('mp-replay-msg');

  if (allFinished) {
    const winner = sortedPlayers[0];
    if (winnerEl) {
      winnerEl.innerHTML = `🏆 WINNER: <span style="color: #fff;">${winner.name}</span> with ${winner.score} pts!`;
      winnerEl.className = 'mp-winner-banner';
      winnerEl.style.display = 'block';
    }

    if (isHost && replayBtn) {
      replayBtn.style.display = 'block';
      replayBtn.removeAttribute('disabled');
      msgEl.innerText = "Ready to start a new match?";
      msgEl.style.color = "#2ecc71";
    } else {
      if (replayBtn) replayBtn.style.display = 'none';
      msgEl.innerText = "Waiting for Host to start another match...";
      msgEl.style.color = "#00e5ff";
    }
  } else {
    if (winnerEl) winnerEl.style.display = 'none';
    if (replayBtn) replayBtn.style.display = 'none';
    msgEl.innerText = "Waiting for other players to finish...";
    msgEl.style.color = "#f1c40f";
  }
}

// ----------------------------------------------------
// Initialization Hooking & Overriding
// ----------------------------------------------------
function hookGameLifecycle() {
  // 1. Hook initGame / startGame (Interception point after calibration)
  if (typeof window.initGame === 'function') {
    const originalInitGame = window.initGame;
    window.initGame = function() {
      // Intercept if in lobby/setup stage
      if (!isMultiplayerMode && roomStatus === 'lobby') {
        if (pendingRoomCode) {
          showJoinPromptOverlay(pendingRoomCode, () => {
            pendingRoomCode = null; // Clear room code
            // Show standard mode selection modal
            showModeSelectOverlay(() => {
              originalInitGame.apply(this, arguments);
            });
          });
        } else {
          showModeSelectOverlay(() => {
            originalInitGame.apply(this, arguments);
          });
        }
        return;
      }
      originalInitGame.apply(this, arguments);
    };
  }

  if (typeof window.startGame === 'function') {
    const originalStartGame = window.startGame;
    window.startGame = function() {
      // Intercept if in lobby/setup stage
      if (!isMultiplayerMode && roomStatus === 'lobby') {
        if (pendingRoomCode) {
          showJoinPromptOverlay(pendingRoomCode, () => {
            pendingRoomCode = null; // Clear room code
            // Show standard mode selection modal
            showModeSelectOverlay(() => {
              originalStartGame.apply(this, arguments);
            });
          });
        } else {
          showModeSelectOverlay(() => {
            originalStartGame.apply(this, arguments);
          });
        }
        return;
      }
      originalStartGame.apply(this, arguments);
    };
  }

  // 2. Intercept saveHighScore & saveScore
  if (typeof window.saveHighScore === 'function') {
    const originalSaveHighScore = window.saveHighScore;
    window.saveHighScore = function(score) {
      if (isMultiplayerMode) {
        handleMultiplayerGameOver(score);
      } else {
        originalSaveHighScore.apply(this, arguments);
      }
    };
  }

  if (typeof window.saveScore === 'function') {
    const originalSaveScore = window.saveScore;
    window.saveScore = function(score) {
      if (isMultiplayerMode) {
        handleMultiplayerGameOver(score);
      } else {
        originalSaveScore.apply(this, arguments);
      }
    };
  }

  // 3. Inject "Play Again" button click handlers
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    const originalRestartClick = restartBtn.onclick;
    restartBtn.addEventListener('click', (e) => {
      if (isMultiplayerMode) {
        e.stopPropagation();
        e.preventDefault();
        showGameoverScreen();
      }
    }, true);
  }
}

// Setup execution
document.addEventListener("DOMContentLoaded", () => {
  initName();
  injectStyles();
  checkUrlRoomCode();
  
  // Set up hooks after a slight delay to allow game scripts to finish loading and define globals
  setTimeout(hookGameLifecycle, 100);
});
