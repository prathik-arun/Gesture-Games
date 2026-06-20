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
// Word Library Definition
// ----------------------------------------------------
const WORD_LIBRARY = {
  animals: [
    "Kangaroo", "Elephant", "Giraffe", "Monkey", "Penguin", "Lion",
    "Crocodile", "Frog", "Shark", "Snake", "Crab", "Rabbit", "Dinosaur",
    "Dog", "Cat", "Eagle", "Spider", "Bee", "Dolphin", "Panda", "Gorilla"
  ],
  movies: [
    "Titanic", "Harry Potter", "Spider-Man", "Jurassic Park", "Home Alone",
    "The Lion King", "Avatar", "Batman", "Iron Man", "Toy Story",
    "Finding Nemo", "The Matrix", "Star Wars", "Frozen", "Shrek", "Jaws",
    "Ghostbusters", "Pirates of the Caribbean", "Terminator", "Gladiator"
  ],
  sports: [
    "Soccer", "Basketball", "Tennis", "Baseball", "Cricket", "Swimming",
    "Boxing", "Golf", "Volleyball", "Skating", "Bowling", "Archery",
    "Karate", "Running", "Gymnastics", "Surfing", "Skiing", "Cycling"
  ],
  random: []
};
WORD_LIBRARY.random = [...WORD_LIBRARY.animals, ...WORD_LIBRARY.movies, ...WORD_LIBRARY.sports];

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
let currentArtistId = null; // Wait: "Artist" refers to the Actor in Charades context to match naming conventions
let currentWord = "";
let currentWordHint = "";
let isArtist = false; // Actor role check
let roundNum = 1;
let maxRounds = 3;
let drawTimeLimit = 80; // Guess limit
let roomTimer = null;
let timerValue = 0;
let roomTopic = "Animals";
let roomCustomTopicText = "";

// WebRTC State variables
let peerConnections = {}; // For the actor: { guesserId: RTCPeerConnection }
let actorPc = null; // For the guesser: peer connection to the active actor
let localStream = null;
let isCameraEnabled = false;
let webrtcListeners = []; // Cache listeners for clean tear-down

// Firebase listeners storage
let fbListeners = [];

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupPreFillName();
  setupURLRoomCode();
  attachUIEventListeners();
  setupTopicToggle();
  injectMobileStylesAndWarning();
});

function injectMobileStylesAndWarning() {
  if (document.getElementById('mobile-styles-injected')) return;

  // 1. Create and inject style tag
  const style = document.createElement('style');
  style.id = 'mobile-styles-injected';
  style.textContent = `
    /* Landscape warning layout */
    #gesture-orientation-warning {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(6, 6, 6, 0.98);
      z-index: 99999;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 20px;
      box-sizing: border-box;
      color: #eee;
      font-family: 'Outfit', 'Courier Prime', sans-serif;
    }
    @media (max-width: 900px) and (orientation: portrait) {
      body:not(.bypass-orientation-warning) #gesture-orientation-warning {
        display: flex !important;
      }
    }
  `;
  document.head.appendChild(style);

  // 2. Create and inject landscape warning overlay
  const warning = document.createElement('div');
  warning.id = 'gesture-orientation-warning';
  warning.innerHTML = `
    <div style="font-size: 3.5rem; margin-bottom: 20px; animation: rotatePhone 2.5s ease-in-out infinite;">📱🔄</div>
    <h2 style="font-family: 'Orbitron', 'Outfit', sans-serif; color: #ff0055; text-shadow: 0 0 10px rgba(255,0,85,0.4); margin-bottom: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">Landscape Recommended</h2>
    <p style="max-width: 420px; font-size: 0.85rem; line-height: 1.5; color: #888; margin-bottom: 25px; font-family: inherit;">Please rotate your device to landscape, then prop it up (e.g., against a wall or on a stand) so your upper body is clearly visible to the camera for optimal hand and gesture tracking.</p>
    <button id="btn-bypass-orientation" style="background: transparent; border: 1px solid #ff0055; color: #ff0055; padding: 10px 25px; border-radius: 4px; font-family: inherit; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; text-transform: uppercase; transition: all 0.3s ease;">Play Anyway</button>
    <style>
      @keyframes rotatePhone {
        0% { transform: rotate(0deg); }
        50% { transform: rotate(-90deg); }
        100% { transform: rotate(0deg); }
      }
      #btn-bypass-orientation:hover {
        background: #ff0055;
        color: #fff;
        box-shadow: 0 0 15px rgba(255,0,85,0.5);
      }
    </style>
  `;
  document.body.appendChild(warning);

  document.getElementById('btn-bypass-orientation').addEventListener('click', () => {
    document.body.classList.add('bypass-orientation-warning');
  });
}

// Pre-fill nickname
function setupPreFillName() {
  const loggedInName = localStorage.getItem('currentUserDisplayName');
  if (loggedInName) {
    myName = loggedInName;
    document.getElementById("nickname-input").value = loggedInName;
    document.getElementById("host-nickname").value = loggedInName;
  } else {
    myName = "Actor_" + Math.floor(Math.random() * 900);
    document.getElementById("nickname-input").value = myName;
    document.getElementById("host-nickname").value = myName;
  }
}

// Parse '?room=1234' URL parameter
function setupURLRoomCode() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    document.getElementById("room-code-input").value = roomParam;
  }
}

// Show/hide custom topic input field
function setupTopicToggle() {
  const selectTopic = document.getElementById("select-topic");
  const customContainer = document.getElementById("custom-topic-container");
  
  selectTopic.addEventListener("change", () => {
    if (selectTopic.value === "Custom") {
      customContainer.classList.remove("hidden");
    } else {
      customContainer.classList.add("hidden");
    }
  });
}

// Attach UI Event Listeners
function attachUIEventListeners() {
  // Navigation back to portal
  document.getElementById("btn-back-lobby").addEventListener("click", () => {
    leaveCurrentRoom().then(() => {
      window.location.href = "../../index.html";
    });
  });

  // Setup screen
  document.getElementById("btn-create-room").addEventListener("click", createRoom);
  document.getElementById("btn-join-room").addEventListener("click", joinRoom);
  document.getElementById("btn-copy-link").addEventListener("click", copyInviteLink);
  document.getElementById("btn-start-game").addEventListener("click", startGame);

  // Chat/Guesses
  document.getElementById("game-chat-form").addEventListener("submit", submitGuess);

  // Camera activation manual button
  document.getElementById("btn-toggle-camera").addEventListener("click", toggleCameraManual);
}

// ----------------------------------------------------
// Room Creation & Joining Actions
// ----------------------------------------------------

// Generate random room code
function generateRoomCode() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// Host creates room
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
  roomTopic = document.getElementById("select-topic").value;
  
  let customWords = [];
  if (roomTopic === "Custom") {
    roomCustomTopicText = document.getElementById("custom-topic-input").value.trim();
    if (!roomCustomTopicText) {
      alert("Please enter a custom topic or choose a predefined one.");
      return;
    }
    // Set status text during fetch
    document.getElementById("btn-create-room").innerText = "Generating words...";
    document.getElementById("btn-create-room").setAttribute("disabled", "true");
    
    customWords = await fetchCustomWords(roomCustomTopicText);
    
    document.getElementById("btn-create-room").innerText = "Create Room";
    document.getElementById("btn-create-room").removeAttribute("disabled");
  }

  const roomRef = ref(database, `rooms/${roomId}`);
  const initialRoomState = {
    roomCode: roomId,
    gameStatus: "lobby",
    round: 1,
    maxRounds: maxRounds,
    drawTime: drawTimeLimit,
    timeLeft: drawTimeLimit,
    topic: roomTopic === "Custom" ? `Custom: ${roomCustomTopicText}` : roomTopic,
    customWords: customWords,
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
    console.log(`[Charades] Room ${roomId} created.`);
    
    const playerOnlineRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    onDisconnect(playerOnlineRef).remove();

    transitionToScreen("screen-lobby");
    setupRoomListeners(roomId);
  } catch (err) {
    console.error("Error creating room:", err);
    alert("Failed to create room.");
  }
}

// Join room
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

  try {
    const roomSnap = await get(ref(database, `rooms/${roomId}`));
    if (!roomSnap.exists()) {
      alert(`Room ${roomId} does not exist.`);
      return;
    }
    
    const roomData = roomSnap.val();
    if (roomData.gameStatus !== "lobby") {
      alert("This game has already started.");
      return;
    }

    const newPlayerRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    await set(newPlayerRef, {
      id: myPlayerId,
      name: myName,
      score: 0,
      guessed: false,
      isHost: false,
      online: true
    });
    
    onDisconnect(newPlayerRef).remove();
    
    console.log(`[Charades] Room ${roomId} joined.`);
    transitionToScreen("screen-lobby");
    setupRoomListeners(roomId);
  } catch (err) {
    console.error("Error joining room:", err);
    alert("Failed to join room.");
  }
}

// Leave room
async function leaveCurrentRoom() {
  cleanupWebRTC();
  if (roomId && myPlayerId) {
    const playerRef = ref(database, `rooms/${roomId}/players/${myPlayerId}`);
    try {
      await remove(playerRef);
    } catch (err) {
      console.error(err);
    }
  }
  roomId = null;
  fbListeners.forEach(off => off());
  fbListeners = [];
  clearInterval(roomTimer);
}

// Copy link
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

// Fetch custom topic words from local proxy API
async function fetchCustomWords(topic) {
  try {
    const res = await fetch(`/api/generate-words?topic=${encodeURIComponent(topic)}`);
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    return data.words;
  } catch (e) {
    console.error("[Charades] Custom word generation error, using fallback list:", e);
    // Generic funny charades acting fallback
    return [
      "Drinking water", "Brushing teeth", "Cooking", "Driving a car", "Sleeping",
      "Taking a selfie", "Crying", "Laughing", "Dancing", "Playing guitar",
      "Flying a kite", "Fishing", "Reading a book", "Walking a dog", "Typing on computer",
      "Painting", "Sweeping the floor", "Shopping"
    ];
  }
}

// ----------------------------------------------------
// State Syncing & Lobby Setup
// ----------------------------------------------------

function transitionToScreen(screenId) {
  const screens = ["screen-setup", "screen-lobby", "screen-game"];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (s === screenId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

// Sync room lobby state
function syncLobbyView(roomData) {
  if (roomData.gameStatus !== "lobby") return;

  players = roomData.players || {};
  document.getElementById("lobby-room-code").innerText = roomData.roomCode;
  document.getElementById("lobby-setting-rounds").innerText = roomData.maxRounds;
  document.getElementById("lobby-setting-time").innerText = roomData.drawTime;
  document.getElementById("lobby-setting-topic").innerText = roomData.topic || "Animals";
  
  const listEl = document.getElementById("lobby-players-list");
  listEl.innerHTML = "";
  
  let pCount = 0;
  let sortedIds = Object.keys(players).sort();
  
  sortedIds.forEach(pId => {
    const p = players[pId];
    pCount++;
    const slot = document.createElement("div");
    slot.className = `player-slot ${p.isHost ? 'host' : ''}`;
    slot.innerHTML = `
      <div class="player-meta">
        <span class="user-avatar" style="background: var(--secondary-accent); color: #fff;">${p.name.charAt(0).toUpperCase()}</span>
        <span style="font-weight: bold;">${p.name} ${p.id === myPlayerId ? ' (You)' : ''}</span>
      </div>
      <span class="player-badge ${p.isHost ? 'artist-lbl' : 'guessed-lbl'}" style="font-size:0.65rem;">
        ${p.isHost ? 'HOST' : 'READY'}
      </span>
    `;
    listEl.appendChild(slot);
  });

  currentHostId = sortedIds[0];
  isHost = (myPlayerId === currentHostId);
  
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

// Sync room game state loop
function syncGameView(roomData) {
  if (roomData.gameStatus === "lobby") {
    if (gameStatus !== "lobby") {
      gameStatus = "lobby";
      transitionToScreen("screen-lobby");
      cleanupWebRTC();
      document.getElementById("word-choice-panel").classList.add("hidden");
      document.getElementById("reveal-overlay").classList.add("hidden");
      document.getElementById("gameover-overlay").classList.add("hidden");
    }
    return;
  }
  
  const prevGameStatus = gameStatus;
  const prevArtistId = currentArtistId;

  if (gameStatus === "lobby") {
    transitionToScreen("screen-game");
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
  roomTopic = roomData.topic || "Animals";

  isArtist = (myPlayerId === currentArtistId);

  // Sync basic scoreboard
  syncScoreboard();

  // Sync indicators
  document.getElementById("game-round-num").innerText = `${roundNum}/${maxRounds}`;
  document.getElementById("game-timer").innerText = timerValue;

  // Hint styling
  const hintEl = document.getElementById("game-word-hint");
  if (isArtist) {
    hintEl.innerText = currentWord ? `ACT: ${currentWord}` : "CHOOSE A WORD";
    hintEl.style.letterSpacing = "2px";
  } else {
    hintEl.innerText = currentWordHint;
    hintEl.style.letterSpacing = "6px";
  }

  // Handle phase transition WebRTC setup
  if (gameStatus === "drawing") { // acting phase
    if (prevGameStatus !== "drawing" || prevArtistId !== currentArtistId) {
      console.log("[Charades] Game entered Acting phase! Initializing WebRTC stream...");
      setupWebRTCStream();
    }
  } else {
    // If not in acting phase, close connections
    if (prevGameStatus === "drawing") {
      console.log("[Charades] Leaving Acting phase. Cleaning WebRTC connections.");
      cleanupWebRTC();
    }
  }

  // Handle phase specific overlays
  handlePhaseOverlays(roomData);

  // Host ticking loop coordination
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

// Scoreboard render
function syncScoreboard() {
  const listEl = document.getElementById("game-players-list");
  listEl.innerHTML = "";
  
  const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);
  
  sortedPlayers.forEach((p, idx) => {
    const isArtistItem = (p.id === currentArtistId);
    const hasGuessedItem = p.guessed;
    
    const row = document.createElement("div");
    row.className = `player-item ${isArtistItem ? 'artist' : ''} ${hasGuessedItem ? 'guessed' : ''}`;
    
    let badgeHtml = "";
    if (isArtistItem) {
      badgeHtml = `<span class="player-badge artist-lbl">Actor</span>`;
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

// Overlay states
function handlePhaseOverlays(roomData) {
  const wordChoicePanel = document.getElementById("word-choice-panel");
  const revealOverlay = document.getElementById("reveal-overlay");
  const gameoverOverlay = document.getElementById("gameover-overlay");

  wordChoicePanel.classList.add("hidden");
  revealOverlay.classList.add("hidden");
  gameoverOverlay.classList.add("hidden");

  if (gameStatus === "word_select") {
    if (isArtist) {
      wordChoicePanel.classList.remove("hidden");
      document.getElementById("word-choice-timer").innerText = timerValue;
      
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
      revealOverlay.classList.remove("hidden");
      document.getElementById("reveal-title").innerText = "Word Selection";
      document.getElementById("reveal-word").innerText = "Choosing topic word...";
      document.getElementById("reveal-scores-list").innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.9rem;">
          Actor ${players[currentArtistId]?.name || "Actor"} is picking a word.
        </div>
      `;
    }
  } else {
    document.getElementById("word-choices-container").innerHTML = "";
  }

  if (gameStatus === "drawing") { // acting phase
    const chatInput = document.getElementById("game-chat-input");
    if (isArtist) {
      chatInput.setAttribute("disabled", "true");
      chatInput.placeholder = "You are acting! Chat disabled.";
    } else {
      chatInput.removeAttribute("disabled");
      chatInput.placeholder = "Type your guess here...";
    }
  }

  if (gameStatus === "reveal") {
    revealOverlay.classList.remove("hidden");
    document.getElementById("reveal-title").innerText = "Round Ended!";
    document.getElementById("reveal-word").innerText = currentWord;
    
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
// Setup Room & Realtime Observers
// ----------------------------------------------------
function setupRoomListeners(rId) {
  const roomRef = ref(database, `rooms/${rId}`);
  
  // Lobby state changes
  const roomValListener = onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      alert("Room closed.");
      window.location.href = "../../index.html";
      return;
    }
    const data = snapshot.val();
    syncLobbyView(data);
    syncGameView(data);
  });
  fbListeners.push(() => roomValListener);

  // Chat/Guesses Sync
  const chatRef = ref(database, `rooms/${rId}/chat`);
  const chatAddedListener = onChildAdded(chatRef, (snapshot) => {
    const msg = snapshot.val();
    displayChatMessage(msg);
  });
  fbListeners.push(() => chatAddedListener);
}

// ----------------------------------------------------
// WebRTC Signaling System
// ----------------------------------------------------

// Enable local camera manually via bottom button
async function toggleCameraManual() {
  const camStateVal = document.getElementById("sensor-camera-state");
  const btn = document.getElementById("btn-toggle-camera");

  if (isCameraEnabled) {
    // Disable camera
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    isCameraEnabled = false;
    btn.innerText = "Enable Cam";
    btn.style.borderColor = "var(--border-color)";
    camStateVal.innerText = "Disabled";
    camStateVal.className = "status-val idle";
    return;
  }

  camStateVal.innerText = "Requesting...";
  camStateVal.className = "status-val idle";
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640, max: 1280 }, 
        height: { ideal: 480, max: 720 }, 
        facingMode: "user" 
      }, 
      audio: false 
    });
    localStream = stream;
    isCameraEnabled = true;
    btn.innerText = "Disable Cam";
    btn.style.borderColor = "var(--primary-accent)";
    camStateVal.innerText = "Connected";
    camStateVal.className = "status-val connected";

    // If I'm currently the actor, show it locally
    if (isArtist && gameStatus === "drawing") {
      const localVideo = document.getElementById("local-video");
      localVideo.srcObject = localStream;
      localVideo.classList.remove("hidden");
      document.getElementById("remote-video").classList.add("hidden");
      document.getElementById("video-placeholder").classList.add("hidden");
    }
  } catch (err) {
    console.error("Camera access failed:", err);
    camStateVal.innerText = "Error";
    alert("Could not access camera. Please check browser permissions.");
  }
}

// Establish WebRTC connection when actor phase begins
async function setupWebRTCStream() {
  cleanupWebRTCListeners();
  
  const rtcStateEl = document.getElementById("sensor-webrtc-state");
  rtcStateEl.innerText = "Negotiating...";
  rtcStateEl.className = "status-val idle";

  if (isArtist) {
    // I am the actor!
    document.getElementById("local-video").classList.remove("hidden");
    document.getElementById("remote-video").classList.add("hidden");
    document.getElementById("video-placeholder").classList.add("hidden");

    // Force enable camera if not already active
    if (!isCameraEnabled || !localStream) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640, max: 1280 }, 
            height: { ideal: 480, max: 720 }, 
            facingMode: "user" 
          }, 
          audio: false 
        });
        isCameraEnabled = true;
        document.getElementById("sensor-camera-state").innerText = "Connected";
        document.getElementById("sensor-camera-state").className = "status-val connected";
        document.getElementById("btn-toggle-camera").innerText = "Disable Cam";
      } catch (err) {
        console.error("WebRTC camera prompt failed:", err);
        alert("Please enable camera access to stream your charades actions!");
        return;
      }
    }

    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = localStream;

    // Negotiate connection to every other player in lobby
    const onlineGuessers = Object.keys(players).filter(pId => pId !== myPlayerId && players[pId].online);

    for (const guesserId of onlineGuessers) {
      console.log(`[WebRTC] Initiating connection to guesser ${guesserId}`);
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      peerConnections[guesserId] = pc;

      // Add camera tracks
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Handle candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candRef = push(ref(database, `rooms/${roomId}/signals/${guesserId}/actorCandidates`));
          set(candRef, { candidate: JSON.stringify(event.candidate) });
        }
      };

      // Handle ICE state logs
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state with ${guesserId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          rtcStateEl.innerText = "Streaming";
          rtcStateEl.className = "status-val connected";
        }
      };

      // Create offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await set(ref(database, `rooms/${roomId}/signals/${guesserId}/offer`), {
          sdp: offer.sdp,
          type: offer.type
        });

        // Listen for remote answer
        const ansRef = ref(database, `rooms/${roomId}/signals/${guesserId}/answer`);
        const ansListener = onValue(ansRef, async (snapshot) => {
          const answer = snapshot.val();
          if (answer && pc.signalingState === "have-local-offer") {
            console.log(`[WebRTC] Received answer from guesser ${guesserId}`);
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });
        webrtcListeners.push(() => ansListener);

        // Listen for remote candidates
        const candRef = ref(database, `rooms/${roomId}/signals/${guesserId}/guesserCandidates`);
        const candListener = onChildAdded(candRef, async (snapshot) => {
          const val = snapshot.val();
          if (val && val.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(val.candidate)));
            } catch (e) {
              console.error(e);
            }
          }
        });
        webrtcListeners.push(() => candListener);

      } catch (err) {
        console.error("Error creating WebRTC offer:", err);
      }
    }
  } else {
    // I am a guesser!
    document.getElementById("local-video").classList.add("hidden");
    document.getElementById("remote-video").classList.remove("hidden");
    document.getElementById("video-placeholder").classList.remove("hidden");

    // Listen for actor signal node
    const myOfferRef = ref(database, `rooms/${roomId}/signals/${myPlayerId}/offer`);
    const offerListener = onValue(myOfferRef, async (snapshot) => {
      const offer = snapshot.val();
      if (!offer) return;

      console.log(`[WebRTC] Received offer from actor ${currentArtistId}`);
      
      if (actorPc) {
        actorPc.close();
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      actorPc = pc;

      // Handle incoming stream tracks
      pc.ontrack = (event) => {
        console.log("[WebRTC] Received remote stream track!");
        const remoteVideo = document.getElementById("remote-video");
        remoteVideo.srcObject = event.streams[0];
        document.getElementById("video-placeholder").classList.add("hidden");
        
        rtcStateEl.innerText = "Receiving";
        rtcStateEl.className = "status-val connected";
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candRef = push(ref(database, `rooms/${roomId}/signals/${myPlayerId}/guesserCandidates`));
          set(candRef, { candidate: JSON.stringify(event.candidate) });
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await set(ref(database, `rooms/${roomId}/signals/${myPlayerId}/answer`), {
          sdp: answer.sdp,
          type: answer.type
        });

        // Listen for actor candidate entries
        const actCandRef = ref(database, `rooms/${roomId}/signals/${myPlayerId}/actorCandidates`);
        const actCandListener = onChildAdded(actCandRef, async (snap) => {
          const val = snap.val();
          if (val && val.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(val.candidate)));
            } catch (e) {
              console.error(e);
            }
          }
        });
        webrtcListeners.push(() => actCandListener);

      } catch (err) {
        console.error("WebRTC answering error:", err);
      }
    });
    webrtcListeners.push(() => offerListener);
  }
}

function cleanupWebRTCListeners() {
  webrtcListeners.forEach(off => off());
  webrtcListeners = [];
}

function cleanupWebRTC() {
  cleanupWebRTCListeners();
  
  // Close active RTCPeerConnections
  for (const id in peerConnections) {
    peerConnections[id].close();
  }
  peerConnections = {};

  if (actorPc) {
    actorPc.close();
    actorPc = null;
  }

  // Release camera if I'm not playing
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  isCameraEnabled = false;

  document.getElementById("remote-video").srcObject = null;
  document.getElementById("local-video").srcObject = null;
  
  document.getElementById("local-video").classList.add("hidden");
  document.getElementById("remote-video").classList.remove("hidden");
  document.getElementById("video-placeholder").classList.remove("hidden");
  
  document.getElementById("sensor-camera-state").innerText = "Not initialized";
  document.getElementById("sensor-camera-state").className = "status-val idle";
  document.getElementById("btn-toggle-camera").innerText = "Enable Cam";
  
  document.getElementById("sensor-webrtc-state").innerText = "Disconnected";
  document.getElementById("sensor-webrtc-state").className = "status-val idle";
}

// ----------------------------------------------------
// Game State Mechanics
// ----------------------------------------------------

// Generate 3 words choices (1 easy, 1 medium, 1 hard) based on chosen category or Custom
function generateWordChoices(roomData) {
  if (roomData.customWords && roomData.customWords.length > 0) {
    // Shuffle custom words and choose 3
    const list = [...roomData.customWords].sort(() => Math.random() - 0.5);
    return list.slice(0, 3);
  }

  // Predefined
  const category = (roomTopic || "Animals").toLowerCase();
  let lib = WORD_LIBRARY.animals;
  if (category === "movies") lib = WORD_LIBRARY.movies;
  else if (category === "sports") lib = WORD_LIBRARY.sports;
  else if (category === "random") lib = WORD_LIBRARY.random;

  const shuffled = [...lib].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// Start game trigger (Host only)
async function startGame() {
  if (!isHost) return;

  const snap = await get(ref(database, `rooms/${roomId}`));
  if (!snap.exists()) return;
  const roomData = snap.val();

  const sortedIds = Object.keys(players).sort();
  const firstArtist = sortedIds[0];
  const choices = generateWordChoices(roomData);

  const updates = {
    gameStatus: "word_select",
    round: 1,
    artist: firstArtist,
    wordChoices: choices,
    selectedWord: "",
    hint: "",
    timeLeft: 10
  };

  Object.keys(players).forEach(pId => {
    updates[`players/${pId}/score`] = 0;
    updates[`players/${pId}/guessed`] = false;
  });

  try {
    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/chat`));
    await remove(ref(database, `rooms/${roomId}/signals`)); // Clean signals
    
    sendSystemChat(`Game started! Round 1 of ${maxRounds}`);
  } catch (err) {
    console.error(err);
  }
}

// Actor selects word to act out
async function selectWord(word) {
  if (!isArtist) return;

  let hint = "";
  for (let i = 0; i < word.length; i++) {
    if (word[i] === " ") hint += "  ";
    else hint += "_ ";
  }
  hint = hint.trim();

  const updates = {
    selectedWord: word,
    hint: hint,
    gameStatus: "drawing", // "drawing" acts as "acting" phase status key
    timeLeft: drawTimeLimit
  };

  try {
    await update(ref(database, `rooms/${roomId}`), updates);
    sendSystemChat(`${players[myPlayerId].name} is acting now!`);
  } catch (err) {
    console.error(err);
  }
}

// Submit message or guess
async function submitGuess(e) {
  e.preventDefault();
  const inputEl = document.getElementById("game-chat-input");
  const text = inputEl.value.trim();
  if (!text || !roomId || !myPlayerId) return;

  inputEl.value = "";

  if (isArtist && gameStatus === "drawing") return;

  const cleanText = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const targetText = currentWord.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  if (gameStatus === "drawing" && cleanText === targetText && targetText !== "") {
    if (players[myPlayerId] && players[myPlayerId].guessed) return;

    // Award score
    const playersArr = Object.values(players);
    const correctGuessers = playersArr.filter(p => p.guessed && p.id !== currentArtistId).length;
    
    let pointsAwarded = 0;
    if (correctGuessers === 0) {
      pointsAwarded = 100 + timerValue;
    } else {
      pointsAwarded = 50 + timerValue;
    }

    try {
      await runTransaction(ref(database, `rooms/${roomId}/players/${myPlayerId}`), (playerData) => {
        if (playerData) {
          playerData.guessed = true;
          playerData.score = (playerData.score || 0) + pointsAwarded;
        }
        return playerData;
      });

      await runTransaction(ref(database, `rooms/${roomId}/players/${currentArtistId}`), (artistData) => {
        if (artistData) {
          artistData.score = (artistData.score || 0) + 30; // Actor bonus
        }
        return artistData;
      });

      sendSystemChat(`${myName} guessed the word! (+${pointsAwarded} pts)`, "correct");
    } catch (err) {
      console.error(err);
    }
  } else {
    // Standard chat message
    const chatRef = ref(database, `rooms/${roomId}/chat`);
    push(chatRef, {
      sender: myName,
      text: text,
      type: "chat"
    });
  }
}

function displayChatMessage(msg) {
  if (msg.type === "system") return;

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
  container.scrollTop = container.scrollHeight;
}

function sendSystemChat(text, type = "system") {
  if (!roomId) return;
  const chatRef = ref(database, `rooms/${roomId}/chat`);
  push(chatRef, {
    sender: "SYSTEM",
    text: text,
    type: type
  });
}

// Return to lobby
async function resetGameToLobby() {
  if (!isHost) return;
  
  const updates = {
    gameStatus: "lobby",
    round: 1,
    selectedWord: "",
    hint: "",
    timeLeft: drawTimeLimit
  };

  Object.keys(players).forEach(pId => {
    updates[`players/${pId}/score`] = 0;
    updates[`players/${pId}/guessed`] = false;
  });

  try {
    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/chat`));
    await remove(ref(database, `rooms/${roomId}/signals`));
  } catch (err) {
    console.error(err);
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
// Host Game Tick loop
// ----------------------------------------------------
function runHostTickTimer() {
  if (roomTimer) return;
 
  roomTimer = setInterval(async () => {
    if (!isHost || !roomId) {
      clearInterval(roomTimer);
      roomTimer = null;
      return;
    }
 
    let nextTime = timerValue - 1;
    const onlinePlayers = Object.values(players).filter(p => p.online);
    
    if (onlinePlayers.length < 2) {
      clearInterval(roomTimer);
      roomTimer = null;
      resetGameToLobby();
      sendSystemChat("Game aborted: Not enough players.");
      return;
    }
 
    // End drawing/acting phase early if everyone guessed
    const guessersCount = onlinePlayers.filter(p => p.id !== currentArtistId).length;
    const correctCount = onlinePlayers.filter(p => p.guessed && p.id !== currentArtistId).length;
    const everyoneGuessed = (guessersCount > 0 && correctCount === guessersCount);
 
    if (everyoneGuessed && gameStatus === "drawing") {
      nextTime = 0;
    }
 
    if (nextTime <= 0) {
      clearInterval(roomTimer);
      roomTimer = null;
      await transitionGamePhase();
    } else {
      timerValue = nextTime;
      const newHint = getHintString(currentWord, nextTime, drawTimeLimit);
      update(ref(database, `rooms/${roomId}`), { 
        timeLeft: nextTime,
        hint: newHint
      });
    }
  }, 1000);
}

// Transition game phases
async function transitionGamePhase() {
  if (!isHost || !roomId) return;

  const onlinePlayers = Object.values(players).filter(p => p.online);
  const sortedIds = onlinePlayers.map(p => p.id).sort();

  const snap = await get(ref(database, `rooms/${roomId}`));
  if (!snap.exists()) return;
  const roomData = snap.val();

  if (gameStatus === "word_select") {
    // Pick fallback word list
    const choices = generateWordChoices(roomData);
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
    sendSystemChat(`Time's up! Selected word for actor.`);
  } 
  
  else if (gameStatus === "drawing") {
    const updates = {
      gameStatus: "reveal",
      timeLeft: 5
    };
    
    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/signals`)); // Clear WebRTC signaling nodes
    sendSystemChat(`Acting phase finished. The word was: ${currentWord}`);
  } 
  
  else if (gameStatus === "reveal") {
    const currentArtistIndex = sortedIds.indexOf(currentArtistId);
    let nextArtistId = null;
    let nextRoundNum = roundNum;

    if (currentArtistIndex === -1 || currentArtistIndex >= sortedIds.length - 1) {
      if (roundNum >= maxRounds) {
        const updates = {
          gameStatus: "game_over",
          timeLeft: 999
        };
        await update(ref(database, `rooms/${roomId}`), updates);
        return;
      } else {
        nextRoundNum = roundNum + 1;
        nextArtistId = sortedIds[0];
      }
    } else {
      nextArtistId = sortedIds[currentArtistIndex + 1];
    }

    const newChoices = generateWordChoices(roomData);
    const updates = {
      gameStatus: "word_select",
      round: nextRoundNum,
      artist: nextArtistId,
      wordChoices: newChoices,
      selectedWord: "",
      hint: "",
      timeLeft: 10
    };

    onlinePlayers.forEach(p => {
      updates[`players/${p.id}/guessed`] = false;
    });

    await update(ref(database, `rooms/${roomId}`), updates);
    await remove(ref(database, `rooms/${roomId}/signals`));

    sendSystemChat(`Starting Round ${nextRoundNum}! New actor choosing...`);
  }
}
