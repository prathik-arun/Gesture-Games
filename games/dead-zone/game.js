// Dead Zone Game Engine + Sensor Onboarding/Calibration Setup

// References to DOM elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const healthBarFill = document.getElementById('health-bar-fill');
const hudWave = document.getElementById('hud-wave');
const hudAmmo = document.getElementById('hud-ammo');
const hudScore = document.getElementById('hud-score');
const announcement = document.getElementById('announcement');
const reloadIndicator = document.getElementById('reload-indicator');
const menuOverlay = document.getElementById('menu-overlay');
const calibrationOverlay = document.getElementById('calibration-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const btnEnterCalibration = document.getElementById('btn-enter-calibration');
const btnEnableCamera = document.getElementById('btn-enable-camera');
const btnStartGame = document.getElementById('btn-start-game');
const btnRestart = document.getElementById('btn-restart');
const webcamView = document.getElementById('webcam-view');

// Calibration Specific DOM Elements
const webcamCalibrationView = document.getElementById('webcam-calibration-view');
const calibrationCanvasOverlay = document.getElementById('calibration-canvas-overlay');
const calCtx = calibrationCanvasOverlay ? calibrationCanvasOverlay.getContext('2d') : null;
const statWalk = document.getElementById('stat-walk');
const statLean = document.getElementById('stat-lean');
const statGesture = document.getElementById('stat-gesture');

// Indicators
const indLeft = document.getElementById('ind-left');
const indWalk = document.getElementById('ind-walk');
const indRight = document.getElementById('ind-right');

// Debug UI labels
const dbgGemini = document.getElementById('dbg-gemini');
const dbgAiWalk = document.getElementById('dbg-ai-walk');
const dbgFlowMotion = document.getElementById('dbg-flow-motion');
const dbgFlowLean = document.getElementById('dbg-flow-lean');
const dbgPinch = document.getElementById('dbg-pinch');
const dbgLean = document.getElementById('dbg-lean');
const dbgWalk = document.getElementById('dbg-walk');
const dbgVoiceCmd = document.getElementById('dbg-voice-cmd');
const dbgVoiceHeard = document.getElementById('dbg-voice-heard');
const calSpeechTranscript = document.getElementById('cal-speech-transcript');

// Global Game State
const GAME_STATE = {
  MENU: 'MENU',
  CALIBRATING: 'CALIBRATING',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER'
};
let currentGameState = GAME_STATE.MENU;

// High scores
let highScores = [];
function loadHighScores() {
  try {
    const raw = localStorage.getItem('deadzone_scores');
    const parsed = raw ? JSON.parse(raw) : [1500, 800, 300];
    highScores = parsed.map(item => {
      if (typeof item === 'number') {
        return { name: 'System', score: item };
      }
      return item;
    });
  } catch (e) {
    highScores = [
      { name: 'System', score: 1500 },
      { name: 'System', score: 800 },
      { name: 'System', score: 300 }
    ];
  }
  highScores.sort((a, b) => b.score - a.score);
}
function saveHighScore(score) {
  const name = localStorage.getItem('currentUserDisplayName') || 'Guest';
  highScores.push({ name: name, score: score });
  highScores.sort((a, b) => b.score - a.score);
  highScores = highScores.slice(0, 5); // Keep top 5
  localStorage.setItem('deadzone_scores', JSON.stringify(highScores));
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

// Keyboard Fallback Input Handler
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Mouse coordinates
const mouse = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

let mouseClicked = false;
window.addEventListener('mousedown', () => {
  mouseClicked = true;
});
window.addEventListener('mouseup', () => {
  mouseClicked = false;
});

// Resize Canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Onboarding State
const onboarding = {
  currentStep: 1,
  
  // Progress values
  step2Countdown: 3,
  step3Progress: 0, // walking progress (0-100)
  step4ProgressLeft: 0, // lean left (0-50)
  step4ProgressRight: 0, // lean right (0-50)
  step5ProgressPinch: 0, // pinch gesture (0-50)
  step5ProgressOpen: 0, // open hand gesture (0-50)
  
  completedSteps: {
    1: false,
    2: false,
    3: false,
    4: false,
    5: false
  }
};

// Movement state read from controller
let movementState = {
  walking: false,
  lean: 'center',
  jump: false,
  shoot: false,
  reload: false,
  confidence: 'high'
};

// Game entities and metrics
let player = {
  x: 0,
  y: 0,
  r: 18,
  hp: 100,
  maxHp: 100,
  speed: 3,
  angle: 0,
  ammo: 30,
  maxAmmo: 30,
  reloading: false,
  reloadTimer: 0,
  reloadDuration: 90, // frames (~1.5s)
  shootCooldown: 0,
  shootRate: 10, // frames between shots (~6/sec)
  invincibilityFrames: 0,
  score: 0,
  bulletsFired: 0
};

let zombies = [];
let bullets = [];
let particles = [];
let wave = 1;
let waveTimer = 0;
let timeBetweenWaves = 1800; // frames (~30 seconds)
let isWaveActive = false;
let waveTextOpacity = 0;
let waveTextTimer = 0;

// Screen shake offset
let shakeX = 0;
let shakeY = 0;
let shakeIntensity = 0;

// Step 1: Enable camera click handler
btnEnterCalibration.addEventListener('click', () => {
  menuOverlay.style.display = 'none';
  calibrationOverlay.style.display = 'flex';
  currentGameState = GAME_STATE.CALIBRATING;
});

btnEnableCamera.addEventListener('click', async () => {
  btnEnableCamera.disabled = true;
  btnEnableCamera.innerText = 'Initializing...';
  
  // Call shared movement engine to init camera on the calibration view
  const ok = await window.MovementController.initCamera(webcamCalibrationView);
  
  if (ok) {
    // Clone camera stream to the mini gameplay preview video
    webcamView.srcObject = webcamCalibrationView.srcObject;
    webcamView.play();

    // Dynamically load MediaPipe Hands library in the background immediately
    window.MovementController.loadMediaPipe().catch(err => {
      console.error('[Game] Error loading MediaPipe Hands:', err);
    });

    onboarding.completedSteps[1] = true;
    const stepEl = document.getElementById('step-1');
    stepEl.classList.remove('active');
    stepEl.classList.add('completed');
    btnEnableCamera.innerText = 'Camera Active';
    
    // Start calibration processing loop
    window.MovementController.startProcessingLoop();
    window.MovementController.startSpeech();
    
    // Connect to proxy WebSocket server
    window.MovementController.startConnection('ws://localhost:8080');

    // Proceed to Step 2
    activateStep(2);
    startStep2Calibration();
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable Camera';
    alert('Webcam permission was denied or camera not found. You can still play with Keyboard/Mouse, but calibration is bypassed. Close calibration to play.');
    // Allow bypassing calibration
    btnStartGame.removeAttribute('disabled');
    onboarding.completedSteps[1] = true;
    onboarding.completedSteps[2] = true;
    onboarding.completedSteps[3] = true;
    onboarding.completedSteps[4] = true;
    onboarding.completedSteps[5] = true;
  }
});

function activateStep(stepNum) {
  onboarding.currentStep = stepNum;
  // Set element active
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step-${i}`);
    if (i === stepNum) {
      el.classList.add('active');
    } else if (!onboarding.completedSteps[i]) {
      el.classList.remove('active');
    }
  }
}

// Step 2 Calibration countdown
function startStep2Calibration() {
  console.log('[Game] Starting stand-still calibration...');
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
      
      console.log('[Game] Calibration done.');
      activateStep(3); // Start Walking test
    }
  }, 1000);
}

// Check onboarding goals in animation frames and render visual overlays
function updateOnboarding() {
  const dbg = window.MovementController.getDebugInfo();
  
  // Update Debug monitor values
  dbgGemini.innerText = dbg.geminiStatus;
  dbgGemini.style.color = dbg.geminiStatus === 'connected' ? '#27ae60' : '#c0392b';
  dbgAiWalk.innerText = dbg.geminiWalking;
  dbgFlowMotion.innerText = `${dbg.opticalWalkMotion.toFixed(2)} / ${dbg.opticalWalkThreshold.toFixed(2)}`;
  dbgFlowLean.innerText = `${dbg.opticalLeanIndex.toFixed(2)} (${dbg.opticalLean})`;
  dbgPinch.innerText = dbg.pinchDistance.toFixed(2);
  dbgLean.innerText = dbg.finalState.lean;
  dbgWalk.innerText = dbg.finalState.walking;
  if (dbgVoiceCmd) dbgVoiceCmd.innerText = dbg.lastVoiceCommand;
  if (dbgVoiceHeard) dbgVoiceHeard.innerText = `"${dbg.voiceTranscript}"`;
  if (calSpeechTranscript) calSpeechTranscript.innerText = `Heard: "${dbg.voiceTranscript || '-'}"`;

  // Render direction arrows on preview overlay
  indLeft.className = `dir-indicator ${dbg.finalState.lean === 'left' ? 'active' : ''}`;
  indWalk.className = `dir-indicator ${dbg.finalState.walking ? 'active' : ''}`;
  indRight.className = `dir-indicator ${dbg.finalState.lean === 'right' ? 'active' : ''}`;

  movementState = dbg.finalState;

  // Update Status Display Boxes in the Calibration Box
  if (statWalk) {
    statWalk.innerText = movementState.walking ? 'WALKING' : 'STANDSTILL';
    statWalk.className = `status-value ${movementState.walking ? 'val-true' : 'val-false'}`;
  }
  
  if (statLean) {
    statLean.innerText = movementState.lean;
    statLean.className = `status-value val-${movementState.lean}`;
  }

  if (statGesture) {
    if (movementState.shoot) {
      statGesture.innerText = 'SHOOT';
      statGesture.className = 'status-value val-pinch';
    } else if (movementState.reload) {
      statGesture.innerText = 'RELOAD';
      statGesture.className = 'status-value val-open';
    } else {
      statGesture.innerText = 'NONE';
      statGesture.className = 'status-value val-none';
    }
  }

  // Draw Live Webcam Feed and Motion overlays on calibration canvas
  drawCalibrationOverlay();

  if (onboarding.currentStep === 3) {
    // Fill walking progress if player walks in place / voice walking is active
    if (movementState.walking) {
      onboarding.step3Progress += 2.0;
      document.getElementById('step-3-progress').style.width = `${Math.min(onboarding.step3Progress, 100)}%`;
    }
    if (onboarding.step3Progress >= 100) {
      onboarding.completedSteps[3] = true;
      const stepEl = document.getElementById('step-3');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      activateStep(4); // Start leaning test
    }
  }
  
  else if (onboarding.currentStep === 4) {
    if (movementState.lean === 'left') {
      onboarding.step4ProgressLeft = Math.min(onboarding.step4ProgressLeft + 1.5, 50);
    } else if (movementState.lean === 'right') {
      onboarding.step4ProgressRight = Math.min(onboarding.step4ProgressRight + 1.5, 50);
    }
    const totalLeanProgress = onboarding.step4ProgressLeft + onboarding.step4ProgressRight;
    document.getElementById('step-4-progress').style.width = `${totalLeanProgress}%`;

    if (totalLeanProgress >= 100) {
      onboarding.completedSteps[4] = true;
      const stepEl = document.getElementById('step-4');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      activateStep(5); // Start gesture test
    }
  }

  else if (onboarding.currentStep === 5) {
    if (movementState.shoot) {
      onboarding.step5ProgressPinch = Math.min(onboarding.step5ProgressPinch + 2, 50);
    }
    if (movementState.reload) {
      onboarding.step5ProgressOpen = Math.min(onboarding.step5ProgressOpen + 2, 50);
    }
    const totalGestureProgress = onboarding.step5ProgressPinch + onboarding.step5ProgressOpen;
    document.getElementById('step-5-progress').style.width = `${totalGestureProgress}%`;

    if (totalGestureProgress >= 100) {
      onboarding.completedSteps[5] = true;
      const stepEl = document.getElementById('step-5');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      
      // All steps done!
      btnStartGame.removeAttribute('disabled');
      btnStartGame.focus();
    }
  }
}

// Draw Mirrored video, motion grid, and hand joints skeleton
function drawCalibrationOverlay() {
  if (!webcamCalibrationView || !calibrationCanvasOverlay || !calCtx) return;
  if (webcamCalibrationView.paused || webcamCalibrationView.ended) return;

  const w = calibrationCanvasOverlay.width;
  const h = calibrationCanvasOverlay.height;

  // 1. Draw mirrored webcam frame
  calCtx.save();
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  calCtx.restore();

  // 2. Draw target grid frame (holographic cyber-HUD outline)
  calCtx.strokeStyle = 'rgba(52, 152, 219, 0.25)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);

  // Corners
  const cornerLen = 12;
  calCtx.strokeStyle = '#3498db';
  calCtx.lineWidth = 2;
  
  // TL
  calCtx.beginPath(); calCtx.moveTo(15, 15 + cornerLen); calCtx.lineTo(15, 15); calCtx.lineTo(15 + cornerLen, 15); calCtx.stroke();
  // TR
  calCtx.beginPath(); calCtx.moveTo(w - 15, 15 + cornerLen); calCtx.lineTo(w - 15, 15); calCtx.lineTo(w - 15 - cornerLen, 15); calCtx.stroke();
  // BL
  calCtx.beginPath(); calCtx.moveTo(15, h - 15 - cornerLen); calCtx.lineTo(15, h - 15); calCtx.lineTo(15 + cornerLen, h - 15); calCtx.stroke();
  // BR
  calCtx.beginPath(); calCtx.moveTo(w - 15, h - 15 - cornerLen); calCtx.lineTo(w - 15, h - 15); calCtx.lineTo(w - 15 - cornerLen, h - 15); calCtx.stroke();

  // 3. Draw Optical Flow grid vectors (Motion sensing visual grid)
  const motionGrid = window.MovementController.optical.motionGrid;
  const gridCols = 8;
  const gridRows = 6;
  const cellW = w / gridCols;
  const cellH = h / gridRows;

  if (motionGrid) {
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const val = motionGrid[r * gridCols + c];
        const cx = c * cellW + cellW / 2;
        const cy = r * cellH + cellH / 2;

        if (val > 1.0) {
          // Active motion in this block
          calCtx.fillStyle = 'rgba(231, 76, 60, 0.6)'; // red heat dots
          calCtx.beginPath();
          calCtx.arc(cx, cy, Math.min(val * 2.0, 10), 0, Math.PI * 2);
          calCtx.fill();

          calCtx.strokeStyle = 'rgba(231, 76, 60, 0.3)';
          calCtx.beginPath();
          calCtx.arc(cx, cy, Math.min(val * 4.0, 20), 0, Math.PI * 2);
          calCtx.stroke();
        } else {
          // Standard tracking node
          calCtx.fillStyle = 'rgba(46, 204, 113, 0.2)'; // tiny green dots
          calCtx.beginPath();
          calCtx.arc(cx, cy, 1.5, 0, Math.PI * 2);
          calCtx.fill();
        }
      }
    }
  }

  // 5. Draw skeletal tracking lines from MediaPipe Hands (Supports Dual Hands!)
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks, idx) => {
      if (landmarks && landmarks.length > 0) {
        // MediaPipe Hand connections (finger pipelines)
        const paths = [
          [0, 1, 2, 3, 4],       // thumb
          [0, 5, 6, 7, 8],       // index
          [9, 10, 11, 12],       // middle
          [13, 14, 15, 16],      // ring
          [0, 17, 18, 19, 20],   // pinky
          [5, 9, 13, 17]         // palm base
        ];

        calCtx.strokeStyle = idx === 0 
          ? 'rgba(46, 204, 113, 0.85)' // First hand: green
          : 'rgba(52, 152, 219, 0.85)'; // Second hand: blue
        calCtx.lineWidth = 2.5;

        paths.forEach(path => {
          calCtx.beginPath();
          for (let i = 0; i < path.length; i++) {
            const pt = landmarks[path[i]];
            // Mirror the normalized landmarks coordinates to align with mirrored feed!
            const lx = (1 - pt.x) * w;
            const ly = pt.y * h;
            if (i === 0) calCtx.moveTo(lx, ly);
            else calCtx.lineTo(lx, ly);
          }
          calCtx.stroke();
        });

        // Draw skeletal joint nodes
        landmarks.forEach((pt) => {
          const lx = (1 - pt.x) * w;
          const ly = pt.y * h;
          calCtx.fillStyle = idx === 0 ? '#f39c12' : '#9b59b6'; // orange or purple joints
          calCtx.beginPath();
          calCtx.arc(lx, ly, 3.5, 0, Math.PI * 2);
          calCtx.fill();
        });

        // Draw individual hand pinch crosshair targets
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dz = thumbTip.z - indexTip.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < 0.11) {
          const px = (1 - (thumbTip.x + indexTip.x) / 2) * w;
          const py = ((thumbTip.y + indexTip.y) / 2) * h;
          
          calCtx.strokeStyle = '#f39c12';
          calCtx.lineWidth = 1.5;
          calCtx.beginPath();
          calCtx.arc(px, py, 14, 0, Math.PI * 2);
          calCtx.stroke();
          
          calCtx.beginPath();
          calCtx.moveTo(px - 18, py); calCtx.lineTo(px + 18, py);
          calCtx.moveTo(px, py - 18); calCtx.lineTo(px, py + 18);
          calCtx.stroke();
        }
      }
    });
  }

  // 6. Draw sensor scanning sweep line
  const scanY = (Date.now() % 2500) / 2500 * h;
  calCtx.strokeStyle = 'rgba(52, 152, 219, 0.2)';
  calCtx.lineWidth = 1.5;
  calCtx.beginPath();
  calCtx.moveTo(15, scanY);
  calCtx.lineTo(w - 15, scanY);
  calCtx.stroke();
}

// Start Game loop from calibration
btnStartGame.addEventListener('click', () => {
  calibrationOverlay.style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  initGame();
});

btnRestart.addEventListener('click', () => {
  gameoverOverlay.style.display = 'none';
  initGame();
});

// Initialize / Reset Game Entities
function initGame() {
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.hp = 100;
  player.ammo = 30;
  player.reloading = false;
  player.reloadTimer = 0;
  player.score = 0;
  player.invincibilityFrames = 0;
  
  zombies = [];
  bullets = [];
  particles = [];
  wave = 1;
  waveTimer = 0;
  isWaveActive = false;
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('Wave 1', 120);
  spawnWave();
}

// Trigger HUD alert overlays
function triggerAnnouncement(txt, duration = 90) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  waveTextTimer = duration;
}

// Spawning rules
function spawnWave() {
  isWaveActive = true;
  hudWave.innerText = wave;
  
  // Wave formula: 4 + 2 * (wave - 1)
  const spawnCount = 4 + 2 * (wave - 1);
  
  // Every 5th wave is a boss wave!
  const isBossWave = (wave % 5 === 0);
  
  if (isBossWave) {
    triggerAnnouncement(`BOSS CRITICAL WAVE`, 150);
    spawnBossZombie();
  }
  
  for (let i = 0; i < spawnCount; i++) {
    spawnZombie(isBossWave);
  }
}

function spawnZombie(isBossWave = false) {
  // Spawn just outside the viewport boundaries
  let x, y;
  const padding = 50;
  
  if (Math.random() < 0.5) {
    x = Math.random() < 0.5 ? -padding : canvas.width + padding;
    y = Math.random() * canvas.height;
  } else {
    x = Math.random() * canvas.width;
    y = Math.random() < 0.5 ? -padding : canvas.height + padding;
  }

  // Zombie speeds scale with wave slightly
  const baseSpeed = 0.8 + Math.random() * 0.6;
  const waveSpeedBonus = Math.min((wave - 1) * 0.1, 1.2);
  const hpMultiplier = isBossWave ? 2.0 : 1.0;
  
  zombies.push({
    x: x,
    y: y,
    r: 14 + Math.random() * 4,
    hp: (25 + (wave * 5)) * hpMultiplier,
    maxHp: (25 + (wave * 5)) * hpMultiplier,
    speed: baseSpeed + waveSpeedBonus,
    color: `hsl(${100 + Math.random() * 30}, 60%, ${25 + Math.random() * 10}%)`,
    wobbleOffset: Math.random() * Math.PI * 2,
    isBoss: false
  });
}

function spawnBossZombie() {
  let x, y;
  const padding = 80;
  
  if (Math.random() < 0.5) {
    x = Math.random() < 0.5 ? -padding : canvas.width + padding;
    y = Math.random() * canvas.height;
  } else {
    x = Math.random() * canvas.width;
    y = Math.random() < 0.5 ? -padding : canvas.height + padding;
  }

  zombies.push({
    x: x,
    y: y,
    r: 36, // much larger
    hp: 150 + (wave * 50),
    maxHp: 150 + (wave * 50),
    speed: 1.0 + Math.min(wave * 0.05, 0.5),
    color: '#800000', // Dark blood red
    wobbleOffset: 0,
    isBoss: true,
    spikeAngle: 0
  });
}

// Particle System
function spawnSplatter(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 1 + Math.random() * 3,
      color: color,
      alpha: 1,
      decay: 0.02 + Math.random() * 0.03
    });
  }
}

function spawnMuzzleFlash(x, y, angle) {
  // Spawn orange/yellow sparks
  for (let i = 0; i < 5; i++) {
    const spreadAngle = angle + (Math.random() - 0.5) * 0.4;
    const speed = 3 + Math.random() * 5;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(spreadAngle) * speed,
      vy: Math.sin(spreadAngle) * speed,
      r: 1 + Math.random() * 2,
      color: Math.random() < 0.5 ? '#f39c12' : '#f1c40f',
      alpha: 1,
      decay: 0.08
    });
  }
}

// Core Game Loop Calculations
function updateGame() {
  // 1. Invincibility frame timers
  if (player.invincibilityFrames > 0) {
    player.invincibilityFrames--;
  }

  // 2. Gun Angle Calculation (always facing crosshair)
  player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  // 3. Movement input resolution: Combine Gesture states and Keyboard Fallbacks
  let vx = 0;
  let vy = 0;

  // A. Keyboard controls (Fallback)
  if (keys['w'] || keys['arrowup']) {
    vy = -1;
  }
  if (keys['s'] || keys['arrowdown']) {
    vy = 1;
  }
  if (keys['a'] || keys['arrowleft']) {
    vx = -1;
  }
  if (keys['d'] || keys['arrowright']) {
    vx = 1;
  }

  // B. Gesture inputs
  // Walk forward maps directly to moving towards the crosshair angle
  if (movementState.walking) {
    vx += Math.cos(player.angle);
    vy += Math.sin(player.angle);
  }
  
  // Leaning maps to strafing sideways (perpendicular to player angle)
  if (movementState.lean === 'left') {
    // Strafe Left (-90 degrees)
    vx += Math.cos(player.angle - Math.PI / 2);
    vy += Math.sin(player.angle - Math.PI / 2);
  } else if (movementState.lean === 'right') {
    // Strafe Right (+90 degrees)
    vx += Math.cos(player.angle + Math.PI / 2);
    vy += Math.sin(player.angle + Math.PI / 2);
  }

  // Apply velocity to player position with diagonal normalize
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len > 0) {
    player.x += (vx / len) * player.speed;
    player.y += (vy / len) * player.speed;
    
    // Bounds clamping
    player.x = Math.max(player.r, Math.min(canvas.width - player.r, player.x));
    player.y = Math.max(player.r, Math.min(canvas.height - player.r, player.y));
  }

  // 4. Weapon Actions: Shoot and Reload timer checks
  if (player.shootCooldown > 0) {
    player.shootCooldown--;
  }

  // Reload action logic
  const triggerReload = keys['r'] || movementState.reload;
  if (triggerReload && player.ammo < player.maxAmmo && !player.reloading) {
    player.reloading = true;
    player.reloadTimer = player.reloadDuration;
    reloadIndicator.style.opacity = '1';
  }

  if (player.reloading) {
    player.reloadTimer--;
    if (player.reloadTimer <= 0) {
      player.ammo = player.maxAmmo;
      player.reloading = false;
      reloadIndicator.style.opacity = '0';
    }
  }

  // Shooting action logic
  const triggerShoot = mouseClicked || movementState.shoot;
  if (triggerShoot && !player.reloading && player.shootCooldown === 0) {
    if (player.ammo > 0) {
      shootWeapon();
    } else {
      // Auto reload if empty
      player.reloading = true;
      player.reloadTimer = player.reloadDuration;
      reloadIndicator.style.opacity = '1';
    }
  }

  // 5. Update Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    
    // Out of bounds cleanup
    if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
      bullets.splice(i, 1);
    }
  }

  // 6. Update Zombies (Shamble AI)
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    
    // Calculate direction vectors pointing to the player
    const dx = player.x - z.x;
    const dy = player.y - z.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      z.x += (dx / dist) * z.speed;
      z.y += (dy / dist) * z.speed;
    }

    // Spin spikes if boss
    if (z.isBoss) {
      z.spikeAngle += 0.04;
    }

    // Check collision with bullets
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      const bdx = b.x - z.x;
      const bdy = b.y - z.y;
      const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
      
      if (bdist < z.r) {
        // Impact! Remove bullet
        bullets.splice(j, 1);
        
        // Damage zombie
        z.hp -= 10;
        
        // Splash zombie green/red blood particles
        spawnSplatter(b.x, b.y, z.isBoss ? '#c0392b' : '#3d5a28', 5);
        
        if (z.hp <= 0) {
          // Splat and die
          spawnSplatter(z.x, z.y, z.isBoss ? '#c0392b' : '#2d4a18', z.isBoss ? 40 : 20);
          player.score += z.isBoss ? 500 : 100;
          zombies.splice(i, 1);
          
          // Trigger screen shake for kills
          triggerShake(z.isBoss ? 8 : 2);
          break;
        }
      }
    }

    // Collision check: Zombie contacts Player
    if (zombies[i]) { // check still exists
      const pdx = player.x - z.x;
      const pdy = player.y - z.y;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      
      if (pdist < z.r + player.r) {
        damagePlayer(z.isBoss ? 35 : 15);
      }
    }
  }

  // 7. Update Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;
    
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }

  // 8. Screen shake decay
  if (shakeIntensity > 0) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.85;
    if (shakeIntensity < 0.2) {
      shakeIntensity = 0;
      shakeX = 0;
      shakeY = 0;
    }
  }

  // 9. Wave management
  if (zombies.length === 0 && isWaveActive) {
    isWaveActive = false;
    waveTimer = timeBetweenWaves;
    triggerAnnouncement(`WAVE ${wave} COMPLETED`, 120);
  }

  if (!isWaveActive) {
    waveTimer--;
    if (waveTimer <= 0) {
      wave++;
      spawnWave();
      triggerAnnouncement(`WAVE ${wave}`, 120);
    }
  }

  // Announcement timer
  if (waveTextTimer > 0) {
    waveTextTimer--;
    if (waveTextTimer < 20) {
      announcement.style.opacity = `${waveTextTimer / 20}`;
    }
  }

  // 10. Update HUD visuals
  healthBarFill.style.width = `${Math.max(player.hp, 0)}%`;
  
  if (player.hp <= 30) {
    healthBarFill.style.backgroundColor = '#c0392b'; // warning red
  } else {
    healthBarFill.style.backgroundColor = '#27ae60'; // normal green
  }
  
  hudAmmo.innerText = player.reloading 
    ? 'RELOADING' 
    : `${player.ammo} / ${player.maxAmmo}`;
  hudScore.innerText = String(player.score).padStart(5, '0');
}

function shootWeapon() {
  player.ammo--;
  player.shootCooldown = player.shootRate;
  
  // Calculate muzzle tip position
  const muzzleX = player.x + Math.cos(player.angle) * player.r;
  const muzzleY = player.y + Math.sin(player.angle) * player.r;
  
  // Slight spray angle offset (spread)
  const sprayOffset = (Math.random() - 0.5) * 0.1;
  const bulletAngle = player.angle + sprayOffset;
  const bulletSpeed = 12;

  bullets.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(bulletAngle) * bulletSpeed,
    vy: Math.sin(bulletAngle) * bulletSpeed,
    r: 2.5
  });

  spawnMuzzleFlash(muzzleX, muzzleY, player.angle);
  triggerShake(1.5); // shoot recoil
}

function damagePlayer(dmg) {
  if (player.invincibilityFrames > 0) return;
  
  player.hp -= dmg;
  player.invincibilityFrames = 45; // ~0.75s protection
  triggerShake(7.0); // take damage shake
  
  // splat red player blood
  spawnSplatter(player.x, player.y, '#e74c3c', 15);
  
  if (player.hp <= 0) {
    endGame();
  }
}

function triggerShake(intensity) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

function endGame() {
  currentGameState = GAME_STATE.GAMEOVER;
  document.getElementById('hud').style.display = 'none';
  gameoverOverlay.style.display = 'flex';
  document.getElementById('go-score').innerText = `SCORE: ${String(player.score).padStart(5, '0')}`;
  document.getElementById('go-wave').innerText = wave;
  saveHighScore(player.score);
  renderLeaderboards();
  
  // Disconnect proxy
  window.MovementController.stopConnection();
  window.MovementController.stopSpeech();
}

// ----------------------------------------------------
// Rendering Functions
// ----------------------------------------------------
function draw() {
  ctx.save();
  
  // Apply screen shake offsets
  ctx.translate(shakeX, shakeY);
  
  // Clear layout
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw floor grid pattern
  ctx.strokeStyle = '#0e0e0e';
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw Splatter Splats (Static floor markings)
  // We just let the active particles fade, but let's draw particles
  particles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;

  // Draw Bullets
  ctx.fillStyle = '#f1c40f'; // bright yellow
  ctx.shadowColor = '#f1c40f';
  ctx.shadowBlur = 8;
  bullets.forEach((b) => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0; // reset shadow

  // Draw Zombies
  zombies.forEach((z) => {
    ctx.save();
    ctx.translate(z.x, z.y);
    
    // wobble shambler animation
    if (!z.isBoss) {
      const wobble = Math.sin(Date.now() * 0.01 + z.wobbleOffset) * 0.15;
      ctx.rotate(wobble);
    }
    
    // Render Boss Zombie with rotating spikes
    if (z.isBoss) {
      ctx.save();
      ctx.rotate(z.spikeAngle);
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'miter';
      
      // Draw 8 spikes
      for (let s = 0; s < 8; s++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(z.r - 5, 0);
        ctx.lineTo(z.r + 15, 0);
        ctx.lineTo(z.r - 5, 10);
        ctx.closePath();
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Zombie Body Circle
    ctx.fillStyle = z.color;
    ctx.strokeStyle = z.isBoss ? '#c0392b' : '#111';
    ctx.lineWidth = z.isBoss ? 3 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Zombie eyes
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(z.r * 0.4, -z.r * 0.3, 2.5, 0, Math.PI * 2);
    ctx.arc(z.r * 0.4, z.r * 0.3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Text labels for Boss
    if (z.isBoss) {
      ctx.fillStyle = '#eee';
      ctx.font = 'bold 10px "Courier New"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BOSS', 0, 0);
    }

    ctx.restore();

    // Zombie health bar above head
    const barW = z.r * 2;
    const barH = 4;
    const barX = z.x - z.r;
    const barY = z.y - z.r - 8;
    
    ctx.fillStyle = '#111';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = z.isBoss ? '#c0392b' : '#27ae60';
    ctx.fillRect(barX, barY, barW * (z.hp / z.maxHp), barH);
  });

  // Draw Player
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  // Player Flash during invincibility frames
  let drawPlayer = true;
  if (player.invincibilityFrames > 0 && Math.floor(player.invincibilityFrames / 3) % 2 === 0) {
    drawPlayer = false;
  }

  if (drawPlayer) {
    // Weapon Barrel arm pointing right (towards angle)
    ctx.fillStyle = '#333';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.fillRect(0, -5, player.r + 10, 10);
    ctx.strokeRect(0, -5, player.r + 10, 10);
    
    // Player Body
    ctx.fillStyle = '#222';
    ctx.strokeStyle = player.invincibilityFrames > 0 ? '#e74c3c' : '#c0392b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Red glowing eyes facing right
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(player.r * 0.4, -5, 3, 0, Math.PI * 2);
    ctx.arc(player.r * 0.4, 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Draw reload circle progress if reloading
  if (player.reloading) {
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const reloadPercent = (player.reloadDuration - player.reloadTimer) / player.reloadDuration;
    ctx.arc(player.x, player.y, player.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reloadPercent);
    ctx.stroke();
  }

  // Draw Mouse crosshair target
  ctx.strokeStyle = 'rgba(192, 57, 43, 0.5)';
  ctx.lineWidth = 1;
  
  ctx.beginPath();
  // Draw circle
  ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.beginPath();
  // Draw cross hairs
  ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y + 15);
  ctx.stroke();

  ctx.restore();
}

// ----------------------------------------------------
// Master Animation Frames Loop
// ----------------------------------------------------
function loop() {
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateOnboarding();
  } else if (currentGameState === GAME_STATE.PLAYING) {
    // Read final movements
    movementState = window.MovementController.state;
    
    // Update labels inside debug monitor
    const dbg = window.MovementController.getDebugInfo();
    dbgGemini.innerText = dbg.geminiStatus;
    dbgGemini.style.color = dbg.geminiStatus === 'connected' ? '#27ae60' : '#c0392b';
    dbgAiWalk.innerText = dbg.geminiWalking;
    dbgFlowMotion.innerText = `${dbg.opticalWalkMotion.toFixed(2)} / ${dbg.opticalWalkThreshold.toFixed(2)}`;
    dbgFlowLean.innerText = `${dbg.opticalLeanIndex.toFixed(2)} (${dbg.opticalLean})`;
    dbgPinch.innerText = dbg.pinchDistance.toFixed(2);
    dbgLean.innerText = dbg.finalState.lean;
    dbgWalk.innerText = dbg.finalState.walking;
    if (dbgVoiceCmd) dbgVoiceCmd.innerText = dbg.lastVoiceCommand;
    if (dbgVoiceHeard) dbgVoiceHeard.innerText = `"${dbg.voiceTranscript}"`;

    // Render direction indicator lights
    indLeft.className = `dir-indicator ${movementState.lean === 'left' ? 'active' : ''}`;
    indWalk.className = `dir-indicator ${movementState.walking ? 'active' : ''}`;
    indRight.className = `dir-indicator ${movementState.lean === 'right' ? 'active' : ''}`;

    updateGame();
    draw();
  }
  
  requestAnimationFrame(loop);
}

// Start looping
requestAnimationFrame(loop);
