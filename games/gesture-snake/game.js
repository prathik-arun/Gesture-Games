// Gesture Snake Game Engine + Hand/Voice Tracking Integration

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const hudScore = document.getElementById('hud-score');
const hudHighscore = document.getElementById('hud-highscore');
const announcement = document.getElementById('announcement');
const btnToggleBg = document.getElementById('btn-toggle-bg');
const controlModeLabel = document.getElementById('control-mode-label');
const lastCmdLabel = document.getElementById('last-cmd-label');

const menuOverlay = document.getElementById('menu-overlay');
const calibrationOverlay = document.getElementById('calibration-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const btnEnterCalibration = document.getElementById('btn-enter-calibration');
const btnEnableCamera = document.getElementById('btn-enable-camera');
const btnStartGame = document.getElementById('btn-start-game');
const btnRestart = document.getElementById('btn-restart');
const webcamView = document.getElementById('webcam-view');

// Calibration Elements
const webcamCalibrationView = document.getElementById('webcam-calibration-view');
const calibrationCanvasOverlay = document.getElementById('calibration-canvas-overlay');
const calCtx = calibrationCanvasOverlay ? calibrationCanvasOverlay.getContext('2d') : null;
const statHand = document.getElementById('stat-hand');
const statVoice = document.getElementById('stat-voice');

// Calibration step arrow feedback items
const calibArrows = {
  up: document.getElementById('arrow-up-calib'),
  down: document.getElementById('arrow-down-calib'),
  left: document.getElementById('arrow-left-calib'),
  right: document.getElementById('arrow-right-calib')
};

// Debug Panel Elements
const dbgAudio = document.getElementById('dbg-audio');
const dbgWords = document.getElementById('dbg-words');
const dbgHand = document.getElementById('dbg-hand');
const dbgVector = document.getElementById('dbg-vector');
const dbgPointDir = document.getElementById('dbg-point-dir');
const dbgHead = document.getElementById('dbg-head');
const dbgFps = document.getElementById('dbg-fps');

const indSensorActive = document.getElementById('ind-sensor-active');
const indSensorText = document.getElementById('ind-sensor-text');

// Game States
const GAME_STATE = {
  MENU: 'MENU',
  CALIBRATING: 'CALIBRATING',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER'
};
let currentGameState = GAME_STATE.MENU;

// High Score Manager
let highScores = [];
function loadHighScores() {
  try {
    const raw = localStorage.getItem('gesture_snake_scores');
    const parsed = raw ? JSON.parse(raw) : [25, 15, 8];
    highScores = parsed.map(item => {
      if (typeof item === 'number') {
        return { name: 'System', score: item };
      }
      return item;
    });
  } catch (e) {
    highScores = [
      { name: 'System', score: 25 },
      { name: 'System', score: 15 },
      { name: 'System', score: 8 }
    ];
  }
  highScores.sort((a, b) => b.score - a.score);
  if (hudHighscore && highScores.length > 0) {
    hudHighscore.innerText = String(highScores[0].score).padStart(5, '0');
  }
}
function saveHighScore(score) {
  const name = localStorage.getItem('currentUserDisplayName') || 'Guest';
  highScores.push({ name: name, score: score });
  highScores.sort((a, b) => b.score - a.score);
  highScores = highScores.slice(0, 5); // Keep top 5
  localStorage.setItem('gesture_snake_scores', JSON.stringify(highScores));
  loadHighScores();
}
function renderLeaderboards() {
  loadHighScores();
  const makeList = (el) => {
    if (!el) return;
    el.innerHTML = '';
    highScores.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${idx === 0 ? 'high' : ''}`;
      row.innerHTML = `<span class="rank">${idx + 1}. ${s.name || 'Guest'}</span> <span class="score">${String(s.score).padStart(5, '0')}</span>`;
      el.appendChild(row);
    });
  };
  makeList(document.getElementById('lobby-leaderboard'));
  makeList(document.getElementById('gameover-leaderboard'));
}
renderLeaderboards();

// ----------------------------------------------------
// Sound Synthesizer Engine (Web Audio API)
// ----------------------------------------------------
class SoundSynth {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  playEat() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    // Arpeggiating chirpy sweep
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.1); // C6
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.start();
    osc.stop(now + 0.12);
  }
  playDeath() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Noise blast
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + 0.35);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noiseSource.start();
    noiseSource.stop(now + 0.4);

    // Rumble sine sweep
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(20, now + 0.45);
    
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    osc.start();
    osc.stop(now + 0.45);
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Keyboard Fallback Control Handling
// ----------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (currentGameState === GAME_STATE.PLAYING) {
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
      tryChangeDirection('up');
    } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
      tryChangeDirection('down');
    } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
      tryChangeDirection('left');
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
      tryChangeDirection('right');
    }
  }
  
  if (e.key.toLowerCase() === 'c') {
    toggleBackground();
  }
});

// Setup Canvas size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ----------------------------------------------------
// Onboarding & Calibration Setup
// ----------------------------------------------------
const onboarding = {
  currentStep: 1,
  completedSteps: {
    1: false,
    2: false,
    3: false
  },
  testedDirections: new Set() // Tracks user inputs tested in step 3
};

btnEnterCalibration.addEventListener('click', () => {
  menuOverlay.style.display = 'none';
  calibrationOverlay.style.display = 'flex';
  currentGameState = GAME_STATE.CALIBRATING;
});

btnEnableCamera.addEventListener('click', async () => {
  btnEnableCamera.disabled = true;
  btnEnableCamera.innerText = 'Initializing...';
  
  const ok = await window.MovementController.initCamera(webcamCalibrationView);
  
  if (ok) {
    webcamView.srcObject = webcamCalibrationView.srcObject;
    webcamView.play();
    
    // Start MediaPipe
    window.MovementController.loadMediaPipe().catch(err => {
      console.error('[Game] Error loading MediaPipe Hands:', err);
    });
    
    // Initialize speech recognition
    window.MovementController.startSpeech();
    
    onboarding.completedSteps[1] = true;
    const stepEl = document.getElementById('step-1');
    stepEl.classList.remove('active');
    stepEl.classList.add('completed');
    btnEnableCamera.innerText = 'Sensors Active';
    
    window.MovementController.startProcessingLoop();
    
    activateStep(2);
    startStep2Calibration();
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable Camera';
    alert('Webcam permission denied or camera not found. Slicing falls back to keyboard commands.');
    
    // Bypass calibration
    btnStartGame.removeAttribute('disabled');
    onboarding.completedSteps[1] = true;
    onboarding.completedSteps[2] = true;
    onboarding.completedSteps[3] = true;
  }
});

function activateStep(stepNum) {
  onboarding.currentStep = stepNum;
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}`);
    if (i === stepNum) {
      el.classList.add('active');
    } else if (!onboarding.completedSteps[i]) {
      el.classList.remove('active');
    }
  }
}

function startStep2Calibration() {
  console.log('[Game] Stand-still noise level calibration...');
  window.MovementController.optical.startCalibration();
  
  let count = 3;
  const progressFill = document.getElementById('step-2-progress');
  
  const timer = setInterval(() => {
    count--;
    progressFill.style.width = `${((3 - count) / 3) * 100}%`;
    if (count <= 0) {
      clearInterval(timer);
      onboarding.completedSteps[2] = true;
      const stepEl = document.getElementById('step-2');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      activateStep(3);
    }
  }, 1000);
}

// Background Configuration
let backgroundMode = 'dojo'; // 'dojo' | 'camera'
function toggleBackground() {
  if (backgroundMode === 'dojo') {
    backgroundMode = 'camera';
    console.log('[Game] Switched background to camera stream.');
  } else {
    backgroundMode = 'dojo';
    console.log('[Game] Switched background to neon grid.');
  }
}
btnToggleBg.addEventListener('click', toggleBackground);

// ----------------------------------------------------
// Particle System for Eats
// ----------------------------------------------------
class GlowParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.0 + Math.random() * 4;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.r = 1.5 + Math.random() * 4.5;
    this.alpha = 1.0;
    this.decay = 0.02 + Math.random() * 0.02;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
  }
  draw(gCtx) {
    gCtx.save();
    gCtx.globalAlpha = this.alpha;
    gCtx.fillStyle = this.color;
    gCtx.shadowBlur = 6;
    gCtx.shadowColor = this.color;
    gCtx.beginPath();
    gCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.restore();
  }
}

// ----------------------------------------------------
// Game Settings & Snake State
// ----------------------------------------------------
const gridCellSize = 25; // pixel size per grid node
let snake = [];
let direction = 'right';
let nextDirection = 'right';
let food = { x: 0, y: 0 };
let particles = [];
let score = 0;
let lastMoveTime = 0;
let moveInterval = 140; // ms per movement tick

function spawnFood() {
  const cols = Math.floor(canvas.width / gridCellSize);
  const rows = Math.floor(canvas.height / gridCellSize);
  
  let attempts = 0;
  while (attempts < 200) {
    const rx = Math.floor(Math.random() * (cols - 4)) + 2;
    const ry = Math.floor(Math.random() * (rows - 4)) + 2;
    
    // Check collision with snake nodes
    const onSnake = snake.some(node => node.x === rx && node.y === ry);
    if (!onSnake) {
      food.x = rx;
      food.y = ry;
      break;
    }
    attempts++;
  }
}

function tryChangeDirection(newDir) {
  // Prevent immediate reversal to avoid self-collision
  if (newDir === 'up' && direction !== 'down') nextDirection = 'up';
  if (newDir === 'down' && direction !== 'up') nextDirection = 'down';
  if (newDir === 'left' && direction !== 'right') nextDirection = 'left';
  if (newDir === 'right' && direction !== 'left') nextDirection = 'right';
}

function moveSnake() {
  direction = nextDirection;
  
  const head = { ...snake[0] };
  if (direction === 'up') head.y--;
  else if (direction === 'down') head.y++;
  else if (direction === 'left') head.x--;
  else if (direction === 'right') head.x++;
  
  // Wall collision check
  const cols = Math.floor(canvas.width / gridCellSize);
  const rows = Math.floor(canvas.height / gridCellSize);
  
  if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) {
    triggerGameOver();
    return;
  }
  
  // Tail collision check
  const selfCollide = snake.some(node => node.x === head.x && node.y === head.y);
  if (selfCollide) {
    triggerGameOver();
    return;
  }
  
  // Insert head node
  snake.unshift(head);
  
  // Eat check
  if (head.x === food.x && head.y === food.y) {
    score++;
    sounds.playEat();
    
    const centerFoodX = food.x * gridCellSize + gridCellSize / 2;
    const centerFoodY = food.y * gridCellSize + gridCellSize / 2;
    // Emit neon particles
    for (let p = 0; p < 15; p++) {
      particles.push(new GlowParticle(centerFoodX, centerFoodY, '#ff0055'));
    }
    
    hudScore.innerText = String(score).padStart(5, '0');
    
    // Speed scaling
    moveInterval = Math.max(75, 140 - Math.min(score * 2, 65));
    
    spawnFood();
  } else {
    snake.pop(); // Standard move
  }
}

function triggerGameOver() {
  currentGameState = GAME_STATE.GAMEOVER;
  gameoverOverlay.style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  btnToggleBg.style.display = 'none';
  
  document.getElementById('go-score').innerText = `SCORE: ${score}`;
  sounds.playDeath();
  saveHighScore(score);
  renderLeaderboards();
  
  // Deactivate audio synthesis loop internally, stops recognitions
  window.MovementController.stopSpeech();
}

btnStartGame.addEventListener('click', () => {
  calibrationOverlay.style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  btnToggleBg.style.display = 'block';
  initGame();
});

btnRestart.addEventListener('click', () => {
  gameoverOverlay.style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  btnToggleBg.style.display = 'block';
  
  window.MovementController.startSpeech();
  initGame();
});

function initGame() {
  score = 0;
  direction = 'right';
  nextDirection = 'right';
  hudScore.innerText = '00000';
  particles = [];
  moveInterval = 140;
  
  // Start size 4
  const startX = 12;
  const startY = 12;
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
    { x: startX - 3, y: startY }
  ];
  
  spawnFood();
  
  currentGameState = GAME_STATE.PLAYING;
  lastMoveTime = performance.now();
  triggerAnnouncement('START GRID!', 90);
}

function triggerAnnouncement(txt, duration = 90) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  setTimeout(() => {
    announcement.style.opacity = '0';
  }, duration * 16.6);
}

// ----------------------------------------------------
// Hand/Voice Tracking Analysis & Step Calibration
// ----------------------------------------------------
function updateInputControls() {
  const dbg = window.MovementController.getDebugInfo();
  
  // Audio support
  dbgAudio.innerText = dbg.speechActive ? 'ACTIVE' : 'INACTIVE';
  dbgAudio.style.color = dbg.speechActive ? '#00ff88' : '#ff0055';
  
  if (statVoice) {
    statVoice.innerText = dbg.speechActive ? 'ACTIVE' : 'INACTIVE';
    statVoice.className = `status-value ${dbg.speechActive ? 'val-true' : 'val-false'}`;
  }
  
  dbgWords.innerText = dbg.voiceTranscript || 'none';
  
  // Check for Spoken Directions
  const spokenDir = window.MovementController.voiceDirection;
  if (spokenDir && spokenDir !== 'none') {
    console.log('[Game] Voice change to:', spokenDir);
    tryChangeDirection(spokenDir);
    lastCmdLabel.innerText = spokenDir.toUpperCase() + ' (VOICE)';
    
    // Register direction for Calibration step 3
    if (currentGameState === GAME_STATE.CALIBRATING) {
      onboarding.testedDirections.add(spokenDir);
      lightUpCalibArrow(spokenDir);
    }
    
    window.MovementController.voiceDirection = 'none'; // Consume
  }
  
  // Hand tracking analysis
  const handList = window.MovementController.handLandmarksList || [];
  dbgHand.innerText = dbg.mediaPipeLoaded ? (handList.length > 0 ? 'TRUE' : 'FALSE') : 'loading';
  dbgHand.style.color = handList.length > 0 ? '#00ff88' : '#555';
  
  if (statHand) {
    const trackerOk = dbg.mediaPipeLoaded && handList.length > 0;
    statHand.innerText = trackerOk ? 'CONNECTED' : 'WAITING';
    statHand.className = `status-value ${trackerOk ? 'val-true' : 'val-false'}`;
  }
  
  let pointDirection = 'none';
  let dxNorm = 0;
  let dyNorm = 0;
  
  if (handList.length > 0) {
    const primaryHand = handList[0];
    
    // Index finger nodes: MCP is index 5, Tip is index 8
    const mcp = primaryHand[5];
    const tip = primaryHand[8];
    
    // Mirror standard X values since we mirror the camera canvas
    const baseMirroredX = 1 - mcp.x;
    const tipMirroredX = 1 - tip.x;
    
    dxNorm = tipMirroredX - baseMirroredX;
    dyNorm = tip.y - mcp.y; // MediaPipe y axis goes down
    
    dbgVector.innerText = `${dxNorm.toFixed(2)}, ${dyNorm.toFixed(2)}`;
    
    // Analyze direction vector
    const pointingLength = Math.sqrt(dxNorm * dxNorm + dyNorm * dyNorm);
    const pointThreshold = 0.055; // Magnitude threshold to count as intentional point
    
    if (pointingLength > pointThreshold) {
      if (Math.abs(dxNorm) > Math.abs(dyNorm)) {
        pointDirection = dxNorm > 0 ? 'right' : 'left';
      } else {
        pointDirection = dyNorm > 0 ? 'down' : 'up'; // positive y is down
      }
      
      tryChangeDirection(pointDirection);
      lastCmdLabel.innerText = pointDirection.toUpperCase() + ' (POINT)';
      
      if (currentGameState === GAME_STATE.CALIBRATING) {
        onboarding.testedDirections.add(pointDirection);
        lightUpCalibArrow(pointDirection);
      }
    }
  } else {
    dbgVector.innerText = '0, 0';
  }
  
  dbgPointDir.innerText = pointDirection.toUpperCase();
  
  // Sync Sensor labels bottom-left
  const sensorState = handList.length > 0 || dbg.speechActive;
  indSensorActive.className = `indicator-dot ${sensorState ? 'active' : ''}`;
  
  let sensorText = 'TRACKERS IDLE';
  if (handList.length > 0 && dbg.speechActive) {
    sensorText = 'HAND + VOICE OK';
  } else if (handList.length > 0) {
    sensorText = 'HAND ACTIVE';
  } else if (dbg.speechActive) {
    sensorText = 'VOICE ACTIVE';
  }
  indSensorText.innerText = sensorText;
  
  // Handle Calibration Step 3 completion check
  if (currentGameState === GAME_STATE.CALIBRATING && onboarding.currentStep === 3) {
    // Requires testing at least two directions (e.g. up/down, or left/right) to confirm
    const testedCount = onboarding.testedDirections.size;
    const step3Indicator = document.getElementById('step-3-indicator');
    
    if (testedCount >= 2) {
      onboarding.completedSteps[3] = true;
      const stepEl = document.getElementById('step-3');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      
      if (step3Indicator) {
        step3Indicator.innerText = '✔';
        step3Indicator.style.background = '#27ae60';
        step3Indicator.style.color = '#fff';
      }
      
      btnStartGame.removeAttribute('disabled');
      btnStartGame.focus();
    }
  }
}

function lightUpCalibArrow(dir) {
  if (calibArrows[dir]) {
    calibArrows[dir].classList.add('active');
  }
}

function drawCalibrationOverlay() {
  if (!webcamCalibrationView || !calibrationCanvasOverlay || !calCtx) return;
  if (webcamCalibrationView.paused || webcamCalibrationView.ended) return;
  
  const w = calibrationCanvasOverlay.width;
  const h = calibrationCanvasOverlay.height;
  
  calCtx.save();
  // Draw mirrored video stream context
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  calCtx.restore();
  
  // Outline drawing area
  calCtx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);
  
  // Draw corners
  const corner = 12;
  calCtx.strokeStyle = '#00ff88';
  calCtx.lineWidth = 2;
  calCtx.beginPath();
  calCtx.moveTo(15, 15 + corner); calCtx.lineTo(15, 15); calCtx.lineTo(15 + corner, 15);
  calCtx.moveTo(w - 15, 15 + corner); calCtx.lineTo(w - 15, 15); calCtx.lineTo(w - 15 - corner, 15);
  calCtx.moveTo(15, h - 15 - corner); calCtx.lineTo(15, h - 15); calCtx.lineTo(15 + corner, h - 15);
  calCtx.moveTo(w - 15, h - 15 - corner); calCtx.lineTo(w - 15, h - 15); calCtx.lineTo(w - 15 - corner, h - 15);
  calCtx.stroke();
  
  // Draw MediaPipe Hand landmarks onto canvas
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks) => {
      if (landmarks && landmarks.length > 0) {
        // Draw bones structure paths
        const paths = [
          [0, 1, 2, 3, 4], // Thumb
          [0, 5, 6, 7, 8], // Index
          [9, 10, 11, 12], // Middle
          [13, 14, 15, 16], // Ring
          [0, 17, 18, 19, 20], // Pinky
          [5, 9, 13, 17] // Palm bridge
        ];
        
        calCtx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
        calCtx.lineWidth = 2;
        paths.forEach(path => {
          calCtx.beginPath();
          for (let i = 0; i < path.length; i++) {
            const pt = landmarks[path[i]];
            const lx = (1 - pt.x) * w;
            const ly = pt.y * h;
            if (i === 0) calCtx.moveTo(lx, ly);
            else calCtx.lineTo(lx, ly);
          }
          calCtx.stroke();
        });
        
        // Draw joints
        landmarks.forEach(pt => {
          calCtx.fillStyle = '#ff0055';
          calCtx.beginPath();
          calCtx.arc((1 - pt.x) * w, pt.y * h, 3, 0, Math.PI * 2);
          calCtx.fill();
        });
        
        // Draw directional pointing vector arrow overlay in calibration preview
        const mcp = landmarks[5];
        const tip = landmarks[8];
        const sx = (1 - mcp.x) * w;
        const sy = mcp.y * h;
        const ex = (1 - tip.x) * w;
        const ey = tip.y * h;
        
        calCtx.strokeStyle = '#00ff88';
        calCtx.lineWidth = 3.5;
        calCtx.beginPath();
        calCtx.moveTo(sx, sy);
        calCtx.lineTo(ex, ey);
        calCtx.stroke();
        
        // Arrow head draw
        const angle = Math.atan2(ey - sy, ex - sx);
        calCtx.fillStyle = '#00ff88';
        calCtx.beginPath();
        calCtx.moveTo(ex, ey);
        calCtx.lineTo(ex - 8 * Math.cos(angle - Math.PI/6), ey - 8 * Math.sin(angle - Math.PI/6));
        calCtx.lineTo(ex - 8 * Math.cos(angle + Math.PI/6), ey - 8 * Math.sin(angle + Math.PI/6));
        calCtx.fill();
      }
    });
  }
}

// ----------------------------------------------------
// Core Canvas Rendering Loop
// ----------------------------------------------------
let lastFpsTime = performance.now();
let fpsCounter = 0;

function runLoop() {
  // Sync frame count/FPS
  const now = performance.now();
  fpsCounter++;
  if (now - lastFpsTime >= 1000) {
    dbgFps.innerText = fpsCounter;
    fpsCounter = 0;
    lastFpsTime = now;
  }
  
  // 1. Inputs tracking analysis update
  if (currentGameState === GAME_STATE.CALIBRATING || currentGameState === GAME_STATE.PLAYING) {
    updateInputControls();
  }
  
  // 2. Calibrating rendering
  if (currentGameState === GAME_STATE.CALIBRATING) {
    drawCalibrationOverlay();
  }
  
  // 3. Main play loop rendering
  else if (currentGameState === GAME_STATE.PLAYING) {
    // Process snake movements according to intervals
    if (now - lastMoveTime >= moveInterval) {
      moveSnake();
      lastMoveTime = now;
    }
    
    // Clear screen or draw camera feed background
    ctx.save();
    
    if (backgroundMode === 'camera' && webcamView.srcObject) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.25;
      ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      // Draw cyber dojo grid
      ctx.fillStyle = '#030303';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.025)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += gridCellSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridCellSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
    }
    
    // Draw grid border bounds
    const cols = Math.floor(canvas.width / gridCellSize);
    const rows = Math.floor(canvas.height / gridCellSize);
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, cols * gridCellSize, rows * gridCellSize);
    
    // Draw neon food (pulsing circle)
    const scalePulse = 1 + 0.15 * Math.sin(now * 0.008);
    const fx = food.x * gridCellSize + gridCellSize / 2;
    const fy = food.y * gridCellSize + gridCellSize / 2;
    
    ctx.save();
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0055';
    ctx.beginPath();
    ctx.arc(fx, fy, (gridCellSize / 2 - 3) * scalePulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Draw cyber snake
    snake.forEach((node, idx) => {
      const nx = node.x * gridCellSize + 2;
      const ny = node.y * gridCellSize + 2;
      const sz = gridCellSize - 4;
      
      ctx.save();
      if (idx === 0) {
        // Snake Head: Glowing Neon Green with custom shapes
        ctx.fillStyle = '#00ff88';
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00ff88';
        ctx.fillRect(nx, ny, sz, sz);
        
        // Draw eyes
        ctx.fillStyle = '#000000';
        ctx.shadowBlur = 0;
        if (direction === 'right' || direction === 'left') {
          ctx.fillRect(nx + sz/2 - 2, ny + 3, 4, 4);
          ctx.fillRect(nx + sz/2 - 2, ny + sz - 7, 4, 4);
        } else {
          ctx.fillRect(nx + 3, ny + sz/2 - 2, 4, 4);
          ctx.fillRect(nx + sz - 7, ny + sz/2 - 2, 4, 4);
        }
      } else {
        // Tail nodes: Fades slightly along the body size/opacity
        const depthFactor = idx / snake.length;
        ctx.fillStyle = '#00cc6c';
        ctx.globalAlpha = 1.0 - 0.65 * depthFactor;
        
        const pad = 2 + 3 * depthFactor;
        ctx.fillRect(node.x * gridCellSize + pad, node.y * gridCellSize + pad, gridCellSize - 2 * pad, gridCellSize - 2 * pad);
      }
      ctx.restore();
    });
    
    // Draw Eat Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
    
    ctx.restore();
    
    // Update head debug variables
    if (snake.length > 0) {
      dbgHead.innerText = `${snake[0].x}, ${snake[0].y}`;
    }
  }
  
  requestAnimationFrame(runLoop);
}

// Start visual tick loops
requestAnimationFrame(runLoop);
