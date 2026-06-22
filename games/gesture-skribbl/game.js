import { auth, database } from "../../firebase-config.js";
import { 
  ref, 
  set, 
  push, 
  onValue, 
  onChildAdded, 
  onChildRemoved,
  update, 
  remove, 
  onDisconnect, 
  runTransaction, 
  get, 
  child 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ----------------------------------------------------
// Word Lists (Easy, Medium, Hard)
// ----------------------------------------------------
const WORD_LIBRARY = {
  easy: [
    "cat", "dog", "sun", "moon", "house", "car", "tree", "flower", "hat", 
    "cup", "star", "fish", "bird", "boat", "apple", "book", "cake", "ball", 
    "door", "duck", "shoe", "keys", "ring", "milk", "egg", "spoon"
  ],
  medium: [
    "sword", "shield", "cloud", "rocket", "banana", "clock", "guitar", "pizza", 
    "spider", "snowman", "castle", "superman", "dinosaur", "hamburger", 
    "umbrella", "butterfly", "computer", "football", "helicopter", "airplane"
  ],
  hard: [
    "happiness", "Justin Bieber", "Michael Jackson", "gravity", "nightmare", 
    "jazz", "internet", "wifi", "celebration", "matrix", "black hole", 
    "time travel", "metaverse", "evolution", "symphony", "gladiator", 
    "hologram", "cryptocurrency", "teleportation", "illusion"
  ]
};

// ----------------------------------------------------
// Game State & Room Variables
// ----------------------------------------------------
let roomId = null;
let myPlayerId = null;
let myName = "Guest";
let players = {};
let currentHostId = null;
let isHost = false;
let gameStatus = "lobby";
let currentArtistId = null;
let currentWord = "";
let currentWordHint = "";
let isArtist = false;
let roundNum = 1;
let maxRounds = 3;
let drawTimeLimit = 80;
let roomTimer = null;
let timerValue = 0;

// Local Drawing State
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = "#000000";
let currentBrushSize = 4;
let currentMode = "draw"; // 'draw' or 'erase'

// Mouse Drawing Fallback State
let mouseIsDown = false;

// MediaPipe Camera State
let isCameraEnabled = false;
let gestureUpdateLoopId = null;
let smoothX = 0;
let smoothY = 0;
let isFirstGestureFrame = true;

// Firebase listeners storage (for clean tear-down if needed)
let fbListeners = [];

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupPreFillName();
  setupURLRoomCode();
  attachUIEventListeners();
  
  // Set default canvas styling
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
});

// Pre-fill nickname if user is logged in
function setupPreFillName() {
  const loggedInName = localStorage.getItem('currentUserDisplayName');
  if (loggedInName) {
    myName = loggedInName;
    document.getElementById("nickname-input").value = loggedInName;
    document.getElementById("host-nickname").value = loggedInName;
  } else {
    // Generate random Guest name
    myName = "Guest_" + Math.floor(Math.random() * 900);
    document.getElementById("nickname-input").value = myName;
    document.getElementById("host-nickname").value = myName;
  }
}

// Parse '?room=1234' query parameter to join directly
function setupURLRoomCode() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    document.getElementById("room-code-input").value = roomParam;
  }
}

// Attach UI Event Listeners
function attachUIEventListeners() {
  // Navigation
  document.getElementById("btn-back-lobby").addEventListener("click", () => {
    // Leave room before exiting
    leaveCurrentRoom().then(() => {
      window.location.href = "../../index.html";
    });
  });

  // Setup buttons
  document.getElementById("btn-create-room").addEventListener("click", createRoom);
  document.getElementById("btn-join-room").addEventListener("click", joinRoom);
  document.getElementById("btn-copy-link").addEventListener("click", copyInviteLink);
  document.getElementById("btn-start-game").addEventListener("click", startGame);

  // Fallback mouse drawing events
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseout", handleMouseUp);

  // Chat submission
  document.getElementById("game-chat-form").addEventListener("submit", submitGuess);

  // Toolbar events
  setupToolbarEvents();

  // Webcam activation
  document.getElementById("btn-toggle-camera").addEventListener("click", toggleCameraControls);
}

// ----------------------------------------------------
// Setup Toolbar & Drawing Customizations
// ----------------------------------------------------
function setupToolbarEvents() {
  // Color Swatches
  const swatches = document.querySelectorAll(".color-swatch");
  swatches.forEach(swatch => {
    swatch.addEventListener("click", (e) => {
      swatches.forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");
      
      currentColor = swatch.getAttribute("data-color");
      currentMode = "draw"; // Switch to draw mode when clicking color
      
      // Update Pen/Eraser active states
      const penBtn = document.getElementById("btn-pen-tool");
      const eraserBtn = document.getElementById("btn-eraser-tool");
      if (penBtn) {
        penBtn.classList.add("active");
        penBtn.style.backgroundColor = "rgba(255, 0, 204, 0.15)";
        penBtn.style.borderColor = "var(--primary-accent)";
      }
      if (eraserBtn) {
        eraserBtn.classList.remove("active");
        eraserBtn.style.backgroundColor = "transparent";
        eraserBtn.style.borderColor = "rgba(241, 196, 15, 0.3)";
      }

      // Update cursor indicator
      const cursor = document.getElementById("brush-cursor");
      cursor.className = "brush-cursor";
      cursor.style.borderColor = currentColor;
    });
  });

  // Brush Sizes
  const sizeBtns = document.querySelectorAll(".size-btn");
  sizeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      sizeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentBrushSize = parseInt(btn.getAttribute("data-size"));
    });
  });

  // Clear Canvas Button
  document.getElementById("btn-clear-canvas").addEventListener("click", () => {
    if (!isArtist) return; // Only artist can clear
    clearCanvasOnDatabase();
  });

  // Pen Tool Button
  const penBtn = document.getElementById("btn-pen-tool");
  if (penBtn) {
    penBtn.addEventListener("click", () => {
      currentMode = "draw";
      
      const penBtn = document.getElementById("btn-pen-tool");
      const eraserBtn = document.getElementById("btn-eraser-tool");
      penBtn.classList.add("active");
      penBtn.style.backgroundColor = "rgba(255, 0, 204, 0.15)";
      penBtn.style.borderColor = "var(--primary-accent)";
      
      if (eraserBtn) {
        eraserBtn.classList.remove("active");
        eraserBtn.style.backgroundColor = "transparent";
        eraserBtn.style.borderColor = "rgba(241, 196, 15, 0.3)";
      }

      // Select active color swatch or default
      const swatches = document.querySelectorAll(".color-swatch");
      let activeSwatch = null;
      swatches.forEach(s => {
        if (s.getAttribute("data-color") === currentColor) {
          s.classList.add("active");
          activeSwatch = s;
        } else {
          s.classList.remove("active");
        }
      });
      if (!activeSwatch && swatches.length > 0) {
        swatches[0].classList.add("active");
        currentColor = swatches[0].getAttribute("data-color");
      }

      // Update cursor indicator
      const cursor = document.getElementById("brush-cursor");
      cursor.className = "brush-cursor";
      cursor.style.borderColor = currentColor;
    });
  }

  // Eraser Tool Button
  document.getElementById("btn-eraser-tool").addEventListener("click", () => {
    currentMode = "erase";
    
    const penBtn = document.getElementById("btn-pen-tool");
    const eraserBtn = document.getElementById("btn-eraser-tool");
    eraserBtn.classList.add("active");
    eraserBtn.style.backgroundColor = "rgba(241, 196, 15, 0.15)";
    eraserBtn.style.borderColor = "var(--warning)";
    
    if (penBtn) {
      penBtn.classList.remove("active");
      penBtn.style.backgroundColor = "transparent";
      penBtn.style.borderColor = "rgba(255, 0, 204, 0.3)";
    }
    
    // De-activate all color swatches
    const swatches = document.querySelectorAll(".color-swatch");
    swatches.forEach(s => s.classList.remove("active"));
    
    // Update cursor indicator
    const cursor = document.getElementById("brush-cursor");
    cursor.className = "brush-cursor erase";
    cursor.style.borderColor = "var(--warning)";
  });
}

// ----------------------------------------------------
// Mouse Fallback Drawing Implementation
// ----------------------------------------------------
function handleMouseDown(e) {
  if (!isArtist || gameStatus !== "drawing") return;
  mouseIsDown = true;
  const pos = getCanvasRelativeCoords(e);
  lastX = pos.x;
  lastY = pos.y;
}

function handleMouseMove(e) {
  if (!isArtist || !mouseIsDown || gameStatus !== "drawing") return;
  const pos = getCanvasRelativeCoords(e);
  
  // Draw locally and push to database
  drawSegment(lastX, lastY, pos.x, pos.y, currentColor, currentBrushSize, currentMode);
  pushStrokeToDatabase(lastX, lastY, pos.x, pos.y, currentColor, currentBrushSize, currentMode);
  
  lastX = pos.x;
  lastY = pos.y;
}

function handleMouseUp() {
  mouseIsDown = false;
}

function getCanvasRelativeCoords(e) {
  const rect = canvas.getBoundingClientRect();
  // Map mouse coordinates to virtual resolution 800x500
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

// Draw line segment helper
function drawSegment(x0, y0, x1, y1, color, size, mode) {
  ctx.save();
  if (mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = size * 10; // Make eraser much thicker (e.g. 40px default) to be easy to use!
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
  }
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

// Clear local canvas
function clearLocalCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ----------------------------------------------------
// Firebase Sync Methods
// ----------------------------------------------------

// Generate a random 4 digit code
function generateRoomCode() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// Create Room Action
async function createRoom() {
  const nameVal = document.getElementById("host-nickname").value.trim();
  if (!nameVal) {
    alert("Please enter a nickname first.");
    return;
  }
  myName = nameVal;
  roomId = generateRoomCode();
  myPlayerId = "player_" + Math.random().toString(36).substr(2, 9);
  
  maxRounds = parseInt(document.getElementById("select-rounds").value);
  drawTimeLimit = parseInt(document.getElementById("select-draw-time").value);

  const roomRef = ref(database, `rooms/${roomId}`);
  const initialRoomState = {
    roomCode: roomId,
    gameStatus: "lobby",
    round: 1,
    maxRounds: maxRounds,
    drawTime: drawTimeLimit,
    timeLeft: drawTimeLimit,
    artist: myPlayerId,
    selectedWord: "",
    hint: "",
    players: {
      [myPlayerId]: {
        id: myPlayerId,
        name: myName,
        score: 0,
        guessed: false,
        isHost: true,
        online: true
      }
    }
  };

  try {
    await set(roomRef, initialRoomState);
    console.log(`[Game] Created Room ${roomId}`);
    
    // Attach disconnect cleaner
    const playerOnlineRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    onDisconnect(playerOnlineRef).remove();

    transitionToScreen("screen-lobby");
    setupRoomListeners(roomId);
  } catch (err) {
    console.error("Error creating room:", err);
    alert("Failed to create room. Please try again.");
  }
}

// Join Room Action
async function joinRoom() {
  const nameVal = document.getElementById("nickname-input").value.trim();
  const codeVal = document.getElementById("room-code-input").value.trim();
  
  if (!nameVal) {
    alert("Please enter a nickname first.");
    return;
  }
  if (!codeVal) {
    alert("Please enter a 4-digit Room Code.");
    return;
  }
  
  myName = nameVal;
  roomId = codeVal;
  myPlayerId = "player_" + Math.random().toString(36).substr(2, 9);

  const roomPlayersRef = ref(database, `rooms/${roomId}/players`);
  
  try {
    // Check if room exists
    const roomSnap = await get(ref(database, `rooms/${roomId}`));
    if (!roomSnap.exists()) {
      alert(`Room ${roomId} does not exist. Please check the code.`);
      return;
    }
    
    const roomData = roomSnap.val();
    if (roomData.gameStatus !== "lobby") {
      alert("This game has already started. You cannot join mid-session.");
      return;
    }

    // Join room database
    const newPlayerRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    await set(newPlayerRef, {
      id: myPlayerId,
      name: myName,
      score: 0,
      guessed: false,
      isHost: false,
      online: true
    });
    
    // Clean up if player leaves unexpectedly
    onDisconnect(newPlayerRef).remove();
    
    console.log(`[Game] Joined Room ${roomId}`);
    transitionToScreen("screen-lobby");
    setupRoomListeners(roomId);
  } catch (err) {
    console.error("Error joining room:", err);
    alert("Failed to join room.");
  }
}

// Clean up current connection
async function leaveCurrentRoom() {
  if (roomId && myPlayerId) {
    const playerRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    try {
      await remove(playerRef);
    } catch (err) {
      console.error("Error removing player on leave:", err);
    }
  }
  // Clear lists
  roomId = null;
  fbListeners.forEach(off => off());
  fbListeners = [];
  clearInterval(roomTimer);
}

// Copy invite link
function copyInviteLink() {
  if (!roomId) return;
  const inviteUrl = window.location.origin + window.location.pathname + "?room=" + roomId;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    const btn = document.getElementById("btn-copy-link");
    const oldText = btn.innerText;
    btn.innerText = "COPIED!";
    btn.style.borderColor = "var(--success)";
    setTimeout(() => {
      btn.innerText = oldText;
      btn.style.borderColor = "var(--primary-accent)";
    }, 1500);
  });
}

// Setup listeners to sync game state
function setupRoomListeners(rId) {
  const roomRef = ref(database, `rooms/${rId}`);
  
  // Listener: Full Room Update
  const roomValListener = onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      // Room got deleted / host left
      alert("Room closed or disconnected.");
      window.location.href = "../../index.html";
      return;
    }
    
    const data = snapshot.val();
    syncLobbyView(data);
    syncGameView(data);
  });
  fbListeners.push(() => roomValListener);

  // Listener: Strokes (drawing segments) Added
  const strokesRef = ref(database, `rooms/${rId}/strokes`);
  const strokeAddedListener = onChildAdded(strokesRef, (snapshot) => {
    if (isArtist) return; // Artist already draws locally
    const stroke = snapshot.val();
    drawSegment(stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.c, stroke.s, stroke.e === 1 ? "erase" : "draw");
  });
  fbListeners.push(() => strokeAddedListener);

  // Listener: Strokes Cleared
  const strokeRemovedListener = onChildRemoved(strokesRef, () => {
    clearLocalCanvas();
  });
  fbListeners.push(() => strokeRemovedListener);

  // Listener: Chat messages synced
  const chatRef = ref(database, `rooms/${rId}/chat`);
  const chatAddedListener = onChildAdded(chatRef, (snapshot) => {
    const msg = snapshot.val();
    displayChatMessage(msg);
  });
  fbListeners.push(() => chatAddedListener);
}

// ----------------------------------------------------
// UI Syncing Loops
// ----------------------------------------------------

// Screen transitions helper
function transitionToScreen(screenId) {
  const screens = ["screen-setup", "screen-lobby", "screen-game"];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (s === screenId) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

// Sync screen-lobby
function syncLobbyView(roomData) {
  if (roomData.gameStatus !== "lobby") return;

  players = roomData.players || {};
  
  // Lobby code & Settings
  document.getElementById("lobby-room-code").innerText = roomData.roomCode;
  document.getElementById("lobby-setting-rounds").innerText = roomData.maxRounds;
  document.getElementById("lobby-setting-time").innerText = roomData.drawTime;
  
  // Players List render
  const playersListEl = document.getElementById("lobby-players-list");
  playersListEl.innerHTML = "";
  
  let pCount = 0;
  let sortedIds = Object.keys(players).sort();
  
  sortedIds.forEach(pId => {
    const p = players[pId];
    pCount++;
    const slot = document.createElement("div");
    slot.className = `player-slot ${p.isHost ? 'host' : ''}`;
    slot.innerHTML = `
      <div class="player-meta">
        <span class="user-avatar" style="background: var(--secondary-accent)">${p.name.charAt(0).toUpperCase()}</span>
        <span style="font-weight: bold;">${p.name} ${p.id === myPlayerId ? ' (You)' : ''}</span>
      </div>
      <span class="player-badge ${p.isHost ? 'artist-lbl' : 'guessed-lbl'}" style="font-size:0.65rem;">
        ${p.isHost ? 'HOST' : 'READY'}
      </span>
    `;
    playersListEl.appendChild(slot);
  });

  // Host election
  currentHostId = sortedIds[0];
  isHost = (myPlayerId === currentHostId);
  
  // Handle start button access
  const startBtn = document.getElementById("btn-start-game");
  const lobbyMsg = document.getElementById("lobby-status-msg");
  
  if (isHost) {
    startBtn.style.display = "block";
    if (pCount >= 2) {
      startBtn.removeAttribute("disabled");
      lobbyMsg.innerText = "Lobby ready! Click Start Game to begin.";
      lobbyMsg.style.color = "var(--success)";
    } else {
      startBtn.setAttribute("disabled", "true");
      lobbyMsg.innerText = "Waiting for at least 2 players...";
      lobbyMsg.style.color = "var(--warning)";
    }
  } else {
    startBtn.style.display = "none";
    lobbyMsg.innerText = "Waiting for Host to start the session...";
    lobbyMsg.style.color = "var(--info)";
  }
}

// Sync screen-game gameplay loop
function syncGameView(roomData) {
  if (roomData.gameStatus === "lobby") {
    // Transition back to room lobby if database state resets to lobby
    if (gameStatus !== "lobby") {
      gameStatus = "lobby";
      transitionToScreen("screen-lobby");
      clearLocalCanvas();
      
      // Hide all overlays
      document.getElementById("word-choice-panel").classList.add("hidden");
      document.getElementById("reveal-overlay").classList.add("hidden");
      document.getElementById("gameover-overlay").classList.add("hidden");
    }
    return;
  }
  
  // Change views on game initialization
  if (gameStatus === "lobby") {
    transitionToScreen("screen-game");
    clearLocalCanvas();
  }
  
  gameStatus = roomData.gameStatus;
  players = roomData.players || {};
  roundNum = roomData.round;
  maxRounds = roomData.maxRounds;
  drawTimeLimit = roomData.drawTime;
  currentArtistId = roomData.artist;
  currentWord = roomData.selectedWord || "";
  currentWordHint = roomData.hint || "";
  timerValue = roomData.timeLeft;

  isArtist = (myPlayerId === currentArtistId);

  // Sync general scoreboard
  syncScoreboard();

  // Sync headers
  document.getElementById("game-round-num").innerText = `${roundNum}/${maxRounds}`;
  document.getElementById("game-timer").innerText = timerValue;

  // Sync canvas toolbar visibility (only artist sees controls)
  const toolbar = document.getElementById("game-canvas-toolbar");
  if (isArtist) {
    toolbar.style.opacity = "1";
    toolbar.style.pointerEvents = "all";
  } else {
    toolbar.style.opacity = "0.4";
    toolbar.style.pointerEvents = "none";
  }

  // Handle word blanks/hint bar
  const hintEl = document.getElementById("game-word-hint");
  if (isArtist) {
    hintEl.innerText = currentWord ? `DRAW: ${currentWord}` : "CHOOSE A WORD";
    hintEl.style.letterSpacing = "2px";
  } else {
    hintEl.innerText = currentWordHint;
    hintEl.style.letterSpacing = "6px";
  }

  // Handle phase specific overlays
  handlePhaseOverlays(roomData);

  // Core Host ticking coordination
  const sortedIds = Object.keys(players).sort();
  currentHostId = sortedIds[0];
  isHost = (myPlayerId === currentHostId);
  
  if (isHost) {
    runHostTickTimer();
  } else {
    clearInterval(roomTimer);
    roomTimer = null;
  }
}

// Render scoreboard panel
function syncScoreboard() {
  const listEl = document.getElementById("game-players-list");
  listEl.innerHTML = "";
  
  // Sort players by score descending
  const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);
  
  sortedPlayers.forEach((p, idx) => {
    const isArtistItem = (p.id === currentArtistId);
    const hasGuessedItem = p.guessed;
    
    const row = document.createElement("div");
    row.className = `player-item ${isArtistItem ? 'artist' : ''} ${hasGuessedItem ? 'guessed' : ''}`;
    
    let badgeHtml = "";
    if (isArtistItem) {
      badgeHtml = `<span class="player-badge artist-lbl">Artist</span>`;
    } else if (hasGuessedItem) {
      badgeHtml = `<span class="player-badge guessed-lbl">Guessed</span>`;
    }

    const rankText = `#${idx + 1}`;
    const rankColor = (idx === 0) ? "var(--warning)" : "var(--text-muted)";

    row.innerHTML = `
      <div class="player-info">
        <span class="player-name">
          <span style="color: ${rankColor}; font-size: 0.8rem; margin-right: 6px; font-weight: bold;">${rankText}</span>
          ${p.name} ${p.id === myPlayerId ? ' (You)' : ''}
        </span>
        <span class="player-score">${p.score} points</span>
      </div>
      ${badgeHtml}
    `;
    listEl.appendChild(row);
  });
}

// Phase view overlay rendering
function handlePhaseOverlays(roomData) {
  const wordChoicePanel = document.getElementById("word-choice-panel");
  const revealOverlay = document.getElementById("reveal-overlay");
  const gameoverOverlay = document.getElementById("gameover-overlay");

  // Reset all panels by default
  wordChoicePanel.classList.add("hidden");
  revealOverlay.classList.add("hidden");
  gameoverOverlay.classList.add("hidden");

  // Word selection phase
  if (gameStatus === "word_select") {
    if (isArtist) {
      wordChoicePanel.classList.remove("hidden");
      document.getElementById("word-choice-timer").innerText = timerValue;
      
      // Load choices if empty
      const container = document.getElementById("word-choices-container");
      if (container.children.length === 0 && roomData.wordChoices) {
        container.innerHTML = "";
        roomData.wordChoices.forEach(word => {
          const btn = document.createElement("button");
          btn.className = "word-choice-btn";
          btn.innerText = word;
          btn.addEventListener("click", () => {
            selectWord(word);
          });
          container.appendChild(btn);
        });
      }
    } else {
      // Guessers see choice waiting state
      revealOverlay.classList.remove("hidden");
      document.getElementById("reveal-title").innerText = "Word Selection";
      document.getElementById("reveal-word").innerText = "Waiting for artist...";
      document.getElementById("reveal-scores-list").innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.9rem;">
          Artist ${players[currentArtistId]?.name || "Artist"} is picking a word.
        </div>
      `;
    }
  } else {
    // Clear selections list once word selection is over
    document.getElementById("word-choices-container").innerHTML = "";
  }

  // Drawing phase
  if (gameStatus === "drawing") {
    // Chat input control
    const chatInput = document.getElementById("game-chat-input");
    if (isArtist) {
      chatInput.setAttribute("disabled", "true");
      chatInput.placeholder = "You are drawing! Chat disabled.";
    } else {
      chatInput.removeAttribute("disabled");
      chatInput.placeholder = "Type your guess here...";
    }
  }

  // Reveal phase
  if (gameStatus === "reveal") {
    revealOverlay.classList.remove("hidden");
    document.getElementById("reveal-title").innerText = "Round Ended!";
    document.getElementById("reveal-word").innerText = currentWord;
    
    // Sort players and show scores
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    const scoresList = document.getElementById("reveal-scores-list");
    scoresList.innerHTML = "";
    sorted.slice(0, 3).forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "overlay-rank-row";
      row.innerHTML = `
        <span>${idx + 1}. ${p.name}</span>
        <span style="color: var(--success);">${p.score} pts</span>
      `;
      scoresList.appendChild(row);
    });
  }

  // Game completed overlay
  if (gameStatus === "game_over") {
    gameoverOverlay.classList.remove("hidden");
    const finalScoresList = document.getElementById("gameover-leaderboard-list");
    finalScoresList.innerHTML = "";
    
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    sorted.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = `overlay-rank-row ${idx === 0 ? 'winner' : ''}`;
      row.innerHTML = `
        <span>${idx === 0 ? '👑 ' : ''}${idx + 1}. ${p.name}</span>
        <span style="color: var(--primary-accent); font-weight: bold;">${p.score} pts</span>
      `;
      finalScoresList.appendChild(row);
    });
    
    // Wire return lobby button
    const returnBtn = document.getElementById("btn-return-lobby");
    if (isHost) {
      returnBtn.innerText = "Return to Lobby (Host)";
      returnBtn.removeAttribute("disabled");
      returnBtn.onclick = () => {
        resetGameToLobby();
      };
    } else {
      returnBtn.innerText = "Waiting for Host...";
      returnBtn.setAttribute("disabled", "true");
      returnBtn.onclick = null;
    }
  }
}

// ----------------------------------------------------
// Game Actions
// ----------------------------------------------------

// Host Start Game Trigger
async function startGame() {
  if (!isHost) return;
  
  // Set game status to first round word choice
  const sortedIds = Object.keys(players).sort();
  const firstArtist = sortedIds[0];
  const choices = generateWordChoices();

  const updates = {
    gameStatus: "word_select",
    round: 1,
    artist: firstArtist,
    wordChoices: choices,
    selectedWord: "",
    hint: "",
    timeLeft: 10 // 10 seconds to select a word
  };

  // Clear guessing variables for players
  Object.keys(players).forEach(pId => {
    updates[`players/${pId}/score`] = 0;
    updates[`players/${pId}/guessed`] = false;
  });

  try {
    await update(ref(database, `rooms/${roomId}`), updates);
    // Clear chat on start
    await remove(ref(database, `rooms/${roomId}/chat`));
    // Clear strokes
    await remove(ref(database, `rooms/${roomId}/strokes`));
    
    sendSystemChat(`Game started! Round 1 of ${maxRounds}`);
  } catch (err) {
    console.error("Error starting game:", err);
  }
}

// Word choosing generator (1 easy, 1 medium, 1 hard)
function generateWordChoices() {
  const easy = WORD_LIBRARY.easy[Math.floor(Math.random() * WORD_LIBRARY.easy.length)];
  const medium = WORD_LIBRARY.medium[Math.floor(Math.random() * WORD_LIBRARY.medium.length)];
  const hard = WORD_LIBRARY.hard[Math.floor(Math.random() * WORD_LIBRARY.hard.length)];
  return [easy, medium, hard];
}

// Select Word Action
async function selectWord(word) {
  if (!isArtist) return;
  
  const len = word.length;
  // Generate spacing representation: e.g. "APPLE" -> "_ _ _ _ _"
  let hint = "";
  for (let i = 0; i < len; i++) {
    if (word[i] === " ") hint += "  ";
    else hint += "_ ";
  }
  hint = hint.trim();

  const updates = {
    selectedWord: word,
    hint: hint,
    gameStatus: "drawing",
    timeLeft: drawTimeLimit
  };

  try {
    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/strokes`)); // clean canvas
    sendSystemChat(`${players[myPlayerId].name} is drawing now!`);
  } catch (err) {
    console.error("Error choosing word:", err);
  }
}

// Stroke database upload helper
function pushStrokeToDatabase(x0, y0, x1, y1, color, size, mode) {
  if (!roomId) return;
  const strokesRef = ref(database, `rooms/${roomId}/strokes`);
  
  // Keep stroke payload lightweight: round dimensions to nearest int
  push(strokesRef, {
    x0: Math.round(x0),
    y0: Math.round(y0),
    x1: Math.round(x1),
    y1: Math.round(y1),
    c: color,
    s: size,
    e: mode === "erase" ? 1 : 0
  });
}

// Clear database strokes node
function clearCanvasOnDatabase() {
  if (!roomId) return;
  remove(ref(database, `rooms/${roomId}/strokes`));
}

// ----------------------------------------------------
// Chat & Guess Processing
// ----------------------------------------------------

// Submit message or guess
async function submitGuess(e) {
  e.preventDefault();
  const inputEl = document.getElementById("game-chat-input");
  const text = inputEl.value.trim();
  if (!text || !roomId || !myPlayerId) return;
  
  inputEl.value = "";

  // If artist, block guessing (HTML should already disable but block check as safety)
  if (isArtist && gameStatus === "drawing") return;

  const cleanText = text.toLowerCase();
  const targetText = currentWord.toLowerCase().trim();

  // Correct guess logic
  if (gameStatus === "drawing" && cleanText === targetText && targetText !== "") {
    // Check if player already guessed
    if (players[myPlayerId] && players[myPlayerId].guessed) return;

    // Calculate score
    const playersArr = Object.values(players);
    const correctGuessers = playersArr.filter(p => p.guessed && p.id !== currentArtistId).length;
    
    // First guesser gets more points
    let pointsAwarded = 0;
    if (correctGuessers === 0) {
      pointsAwarded = 100 + timerValue; // Max 100 bonus
    } else {
      pointsAwarded = 50 + timerValue;
    }

    try {
      // 1. Update player status in Firebase
      await runTransaction(ref(database, `rooms/${roomId}/players/${myPlayerId}`), (playerData) => {
        if (playerData) {
          playerData.guessed = true;
          playerData.score = (playerData.score || 0) + pointsAwarded;
        }
        return playerData;
      });

      // 2. Award artist points
      await runTransaction(ref(database, `rooms/${roomId}/players/${currentArtistId}`), (artistData) => {
        if (artistData) {
          // Artist gets 30 points for every person guessing correctly
          artistData.score = (artistData.score || 0) + 30;
        }
        return artistData;
      });

      // 3. Send system message
      sendSystemChat(`${myName} guessed the word! (+${pointsAwarded} pts)`, "correct");
      
    } catch (err) {
      console.error("Correct guess update error:", err);
    }
  } else {
    // Normal chat message
    const chatRef = ref(database, `rooms/${roomId}/chat`);
    push(chatRef, {
      sender: myName,
      text: text,
      type: "chat"
    });
  }
}

// Display messages in panels
function displayChatMessage(msg) {
  if (msg.type === "system") return; // Suppress all yellow system messages in the chat panel

  const container = document.getElementById("game-chat-history");
  const msgEl = document.createElement("div");
  
  if (msg.type === "chat") {
    msgEl.className = "chat-msg";
    msgEl.innerHTML = `<span class="sender">${msg.sender}:</span> ${msg.text}`;
  } else if (msg.type === "correct") {
    msgEl.className = "chat-msg correct-guess";
    msgEl.innerText = msg.text;
  }
  
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight; // Scroll to bottom
}

// Send system alert to database
function sendSystemChat(text, type = "system") {
  if (!roomId) return;
  const chatRef = ref(database, `rooms/${roomId}/chat`);
  push(chatRef, {
    sender: "SYSTEM",
    text: text,
    type: type
  });
}

// Reset Game to Lobby
async function resetGameToLobby() {
  if (!isHost) return;
  
  const updates = {
    gameStatus: "lobby",
    round: 1,
    selectedWord: "",
    hint: "",
    timeLeft: drawTimeLimit
  };

  // Reset players guessed
  Object.keys(players).forEach(pId => {
    updates[`players/${pId}/score`] = 0;
    updates[`players/${pId}/guessed`] = false;
  });

  try {
    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/chat`));
    await remove(ref(database, `rooms/${roomId}/strokes`));
  } catch (err) {
    console.error("Error resetting game to lobby:", err);
  }
}

// Helper to calculate hint string with partially revealed letters based on time ratio
function getHintString(word, timeLeft, drawTimeLimit) {
  if (!word) return "";
  const chars = word.split('');
  const letterIndices = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== ' ' && chars[i] !== '-' && chars[i] !== '_') {
      letterIndices.push(i);
    }
  }
  
  const timeRatio = timeLeft / drawTimeLimit;
  let numToReveal = 0;
  
  // Decide reveal count based on word length and remaining time ratio
  if (timeRatio <= 0.25) {
    numToReveal = letterIndices.length >= 6 ? 3 : (letterIndices.length >= 4 ? 2 : 0);
  } else if (timeRatio <= 0.5) {
    numToReveal = letterIndices.length >= 4 ? 2 : (letterIndices.length >= 3 ? 1 : 0);
  } else if (timeRatio <= 0.75) {
    numToReveal = letterIndices.length >= 3 ? 1 : 0;
  }
  
  const revealIndices = new Set();
  if (numToReveal >= 1 && letterIndices.length > 0) {
    revealIndices.add(letterIndices[0]); // First letter
  }
  if (numToReveal >= 2 && letterIndices.length > 2) {
    const midIdx = Math.floor(letterIndices.length / 2);
    revealIndices.add(letterIndices[midIdx]); // Middle letter
  }
  if (numToReveal >= 3 && letterIndices.length > 4) {
    revealIndices.add(letterIndices[letterIndices.length - 2]); // Letter near end
  }
  
  let hint = "";
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ') {
      hint += "  ";
    } else if (chars[i] === '-' || chars[i] === '_') {
      hint += chars[i] + " ";
    } else if (revealIndices.has(i)) {
      hint += chars[i].toUpperCase() + " ";
    } else {
      hint += "_ ";
    }
  }
  return hint.trim();
}

// ----------------------------------------------------
// Host Ticking Loops & Timing Management
// ----------------------------------------------------
function runHostTickTimer() {
  if (roomTimer) return; // Already ticking

  roomTimer = setInterval(async () => {
    if (!isHost || !roomId) {
      clearInterval(roomTimer);
      roomTimer = null;
      return;
    }

    let nextTime = timerValue - 1;
    
    // Guard check: skip offline players or handle state changes
    const onlinePlayers = Object.values(players).filter(p => p.online);
    
    if (onlinePlayers.length < 2) {
      // Not enough players, abort game loop back to lobby
      clearInterval(roomTimer);
      roomTimer = null;
      resetGameToLobby();
      sendSystemChat("Game aborted: Not enough players to continue.");
      return;
    }

    // Check if everyone has guessed (excluding artist)
    const guessersCount = onlinePlayers.filter(p => p.id !== currentArtistId).length;
    const correctCount = onlinePlayers.filter(p => p.guessed && p.id !== currentArtistId).length;
    const everyoneGuessed = (guessersCount > 0 && correctCount === guessersCount);

    if (everyoneGuessed && gameStatus === "drawing") {
      nextTime = 0; // End drawing phase immediately
    }

    if (nextTime <= 0) {
      // Phase Transitions
      clearInterval(roomTimer);
      roomTimer = null;
      await transitionGamePhase();
    } else {
      // Tick time in database
      timerValue = nextTime;
      const newHint = getHintString(currentWord, nextTime, drawTimeLimit);
      update(ref(database, `rooms/${roomId}`), { 
        timeLeft: nextTime,
        hint: newHint
      });
    }
  }, 1000);
}

// Transition game modes (Host coordinates)
async function transitionGamePhase() {
  if (!isHost || !roomId) return;

  const onlinePlayers = Object.values(players).filter(p => p.online);
  const sortedIds = onlinePlayers.map(p => p.id).sort();

  if (gameStatus === "word_select") {
    // Artist failed to pick a word in 10s. Pick a random choice.
    const choices = generateWordChoices(); // fallback choice
    const fallbackWord = choices[Math.floor(Math.random() * choices.length)];
    
    let hint = "";
    for (let i = 0; i < fallbackWord.length; i++) {
      if (fallbackWord[i] === " ") hint += "  ";
      else hint += "_ ";
    }

    const updates = {
      selectedWord: fallbackWord,
      hint: hint.trim(),
      gameStatus: "drawing",
      timeLeft: drawTimeLimit
    };
    
    await update(ref(database, `rooms/${roomId}`), updates);
    sendSystemChat(`Time's up! System selected a word for the artist.`);
  } 
  
  else if (gameStatus === "drawing") {
    // Time runs out in drawing phase. Shift to reveal.
    const updates = {
      gameStatus: "reveal",
      timeLeft: 4 // 4 seconds to show scoreboard
    };
    
    await update(ref(database, `rooms/${roomId}`), updates);
    sendSystemChat(`Drawing phase finished. The word was: ${currentWord}`);
  } 
  
  else if (gameStatus === "reveal") {
    // Scoreboard reveal over. Shift to next artist or next round.
    const currentArtistIndex = sortedIds.indexOf(currentArtistId);
    let nextArtistId = null;
    let nextRoundNum = roundNum;

    if (currentArtistIndex === -1 || currentArtistIndex >= sortedIds.length - 1) {
      // End of this round cycle
      if (roundNum >= maxRounds) {
        // Game fully finished! Show final rankings.
        const updates = {
          gameStatus: "game_over",
          timeLeft: 999
        };
        await update(ref(database, `rooms/${roomId}`), updates);
        return;
      } else {
        nextRoundNum = roundNum + 1;
        nextArtistId = sortedIds[0]; // back to first player
      }
    } else {
      nextArtistId = sortedIds[currentArtistIndex + 1];
    }

    // Generate word choices for new artist
    const newChoices = generateWordChoices();
    const updates = {
      gameStatus: "word_select",
      round: nextRoundNum,
      artist: nextArtistId,
      wordChoices: newChoices,
      selectedWord: "",
      hint: "",
      timeLeft: 10 // 10s to pick
    };

    // Reset player guessed state
    onlinePlayers.forEach(p => {
      updates[`players/${p.id}/guessed`] = false;
    });

    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/strokes`)); // clear drawing strokes
    
    sendSystemChat(`Starting Round ${nextRoundNum}! New artist choosing...`);
  }
}

// ----------------------------------------------------
// MediaPipe Camera & Gesture Control Loops
// ----------------------------------------------------

// Toggle webcam and MediaPipe Hands tracking
async function toggleCameraControls() {
  const btn = document.getElementById("btn-toggle-camera");
  const camStateVal = document.getElementById("sensor-camera-state");
  const handsStateVal = document.getElementById("sensor-hands-state");
  const videoEl = document.getElementById("webcam-sensor");

  if (isCameraEnabled) {
    // Disable camera
    isCameraEnabled = false;
    btn.innerText = "Enable Cam";
    btn.style.borderColor = "var(--border-color)";
    
    // Stop loops and disconnect stream
    cancelAnimationFrame(gestureUpdateLoopId);
    gestureUpdateLoopId = null;
    isFirstGestureFrame = true;

    if (window.MovementController.stream) {
      window.MovementController.stream.getTracks().forEach(track => track.stop());
    }
    
    camStateVal.innerText = "Disabled";
    camStateVal.className = "status-val idle";
    handsStateVal.innerText = "Disabled";
    handsStateVal.className = "status-val idle";
    
    document.getElementById("sensor-pinch-val").innerText = "----";
    document.getElementById("brush-cursor").style.display = "none";
    
    // Clear skeletons canvas
    const overlay = document.getElementById("sensor-canvas-overlay");
    const oCtx = overlay.getContext("2d");
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    
    return;
  }

  // Enable Camera
  camStateVal.innerText = "Starting...";
  camStateVal.className = "status-val idle";
  
  try {
    const success = await window.MovementController.initCamera(videoEl);
    if (!success) {
      alert("Failed to access camera. Check permissions.");
      camStateVal.innerText = "Error";
      camStateVal.className = "status-val idle";
      return;
    }
    
    isCameraEnabled = true;
    btn.innerText = "Disable Cam";
    btn.style.borderColor = "var(--primary-accent)";
    camStateVal.innerText = "Connected";
    camStateVal.className = "status-val connected";

    handsStateVal.innerText = "Loading MP...";
    handsStateVal.className = "status-val idle";

    // Load hands tracking engine
    await window.MovementController.loadMediaPipe();
    handsStateVal.innerText = "Tracking Active";
    handsStateVal.className = "status-val connected";
    
    // Start local sensor frame processing loop
    window.MovementController.startProcessingLoop();
    
    // Run drawing processing
    runGestureDrawingLoop();
  } catch (err) {
    console.error("Camera gesture start error:", err);
    camStateVal.innerText = "Failed";
    camStateVal.className = "status-val idle";
    handsStateVal.innerText = "Disabled";
    handsStateVal.className = "status-val idle";
  }
}

// Draw skeleton helper
function drawSensorOverlay() {
  const sensorCanvas = document.getElementById("sensor-canvas-overlay");
  if (!sensorCanvas) return;
  const oCtx = sensorCanvas.getContext("2d");
  oCtx.clearRect(0, 0, sensorCanvas.width, sensorCanvas.height);
  
  const hands = window.MovementController.handLandmarksList || [];
  if (hands.length > 0) {
    hands.forEach(landmarks => {
      // Draw bones
      const paths = [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
        [0, 17, 18, 19, 20],
        [5, 9, 13, 17]
      ];
      
      oCtx.strokeStyle = "#ff00cc";
      oCtx.lineWidth = 1.5;
      paths.forEach(path => {
        oCtx.beginPath();
        for (let i = 0; i < path.length; i++) {
          const pt = landmarks[path[i]];
          // Mirror rendering horizontally
          const x = (1 - pt.x) * sensorCanvas.width;
          const y = pt.y * sensorCanvas.height;
          if (i === 0) oCtx.moveTo(x, y);
          else oCtx.lineTo(x, y);
        }
        oCtx.stroke();
      });
      
      // Draw joint markers
      landmarks.forEach(pt => {
        oCtx.fillStyle = "#00ff88";
        oCtx.beginPath();
        oCtx.arc((1 - pt.x) * sensorCanvas.width, pt.y * sensorCanvas.height, 1.5, 0, Math.PI * 2);
        oCtx.fill();
      });
    });
  }
}

// Local Gesture Tracking Loop (30 fps frame mapping)
function runGestureDrawingLoop() {
  const loop = () => {
    if (!isCameraEnabled) return;

    // 1. Draw camera overlays
    drawSensorOverlay();

    // 2. Fetch gesture inputs
    const hands = window.MovementController.handLandmarksList || [];

    let isDrawGesture = false;
    let isEraseGesture = false;
    let isHoverGesture = false;
    let normalizedTipDist = null;

    // 3. Process coordinate mapping if hand is active
    if (hands.length > 0) {
      const hand = hands[0];
      const indexTip = hand[8]; // Index finger tip landmark coordinates
      const wrist = hand[0];

      // Custom function to check if finger is extended (further from wrist than its middle joint)
      const isExtended = (tipIdx, jointIdx) => {
        const dTip = Math.hypot(hand[tipIdx].x - wrist.x, hand[tipIdx].y - wrist.y);
        const dJoint = Math.hypot(hand[jointIdx].x - wrist.x, hand[jointIdx].y - wrist.y);
        return dTip > dJoint;
      };

      const indexExtended = isExtended(8, 6);
      const middleExtended = isExtended(12, 10);
      const ringExtended = isExtended(16, 14);
      const pinkyExtended = isExtended(20, 18);

      const middleTip = hand[12];
      const middleBase = hand[9];
      const handSize = Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y) || 0.1;
      const tipDist = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);
      normalizedTipDist = tipDist / handSize;

      // Classify Gestures:
      const indexPointed = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

      if (indexPointed) {
        if (currentMode === "draw") {
          isDrawGesture = true;
        } else if (currentMode === "erase") {
          isEraseGesture = true;
        }
      } else {
        isHoverGesture = true;
      }

      // Select cursor tracking point: use index tip always to prevent cursor jumps
      let trackPoint = indexTip;

      // Map coordinates to virtual canvas resolution (800x500)
      const targetX = (1 - trackPoint.x) * canvas.width;
      const targetY = trackPoint.y * canvas.height;

      // Smooth coordinates using exponential moving average (EMA)
      if (isFirstGestureFrame) {
        smoothX = targetX;
        smoothY = targetY;
        isFirstGestureFrame = false;
      } else {
        smoothX = smoothX * 0.65 + targetX * 0.35;
        smoothY = smoothY * 0.65 + targetY * 0.35;
      }

      // Brush Cursor Visual Overlay
      const cursor = document.getElementById("brush-cursor");
      cursor.style.display = "block";
      
      // Rect bounding offset positioning
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + (smoothX / canvas.width) * rect.width;
      const clientY = rect.top + (smoothY / canvas.height) * rect.height;
      
      cursor.style.left = `${clientX}px`;
      cursor.style.top = `${clientY}px`;

      // Game state check before drawing
      if (isArtist && gameStatus === "drawing") {
        if (isDrawGesture) {
          // Point -> Draw Mode
          cursor.className = "brush-cursor";
          cursor.style.borderColor = currentColor;
          
          if (!isDrawing) {
            isDrawing = true;
            lastX = smoothX;
            lastY = smoothY;
          } else {
            drawSegment(lastX, lastY, smoothX, smoothY, currentColor, currentBrushSize, "draw");
            pushStrokeToDatabase(lastX, lastY, smoothX, smoothY, currentColor, currentBrushSize, "draw");
            lastX = smoothX;
            lastY = smoothY;
          }
        } 
        else if (isEraseGesture) {
          // Point -> Erase Mode
          cursor.className = "brush-cursor erase";
          cursor.style.borderColor = "var(--warning)";
          
          if (!isDrawing) {
            isDrawing = true;
            lastX = smoothX;
            lastY = smoothY;
          } else {
            drawSegment(lastX, lastY, smoothX, smoothY, currentColor, currentBrushSize, "erase");
            pushStrokeToDatabase(lastX, lastY, smoothX, smoothY, currentColor, currentBrushSize, "erase");
            lastX = smoothX;
            lastY = smoothY;
          }
        } 
        else {
          // Fist or other gesture -> Move pointer without drawing
          cursor.className = currentMode === "erase" ? "brush-cursor erase" : "brush-cursor";
          cursor.style.borderColor = currentMode === "erase" ? "var(--warning)" : currentColor;
          isDrawing = false;
        }
      }
    } else {
      // Hide cursor if hand disappears
      document.getElementById("brush-cursor").style.display = "none";
      isDrawing = false;
      isFirstGestureFrame = true; // reset smoothing
    }

    // Sync badges style active
    const isAction = isDrawGesture || isEraseGesture;
    document.getElementById("badge-hover").className = `gesture-badge ${isHoverGesture ? 'active' : ''}`;
    document.getElementById("badge-action").className = `gesture-badge ${isAction ? 'active' : ''}`;

    // Update Finger Gap value
    document.getElementById("sensor-pinch-val").innerText = normalizedTipDist !== null ? normalizedTipDist.toFixed(3) : "----";

    gestureUpdateLoopId = requestAnimationFrame(loop);
  };

  gestureUpdateLoopId = requestAnimationFrame(loop);
}
