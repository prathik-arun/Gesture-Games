// Flappy Mouth Game Engine
// Controls a flying bird using webcam mouth open/close detection

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const livesDisplay = document.getElementById('lives-display');
const hudScore = document.getElementById('hud-score');
const hudHighscore = document.getElementById('hud-highscore');
const announcement = document.getElementById('announcement');
const btnToggleBg = document.getElementById('btn-toggle-bg');
const bgModeLabel = document.getElementById('bg-mode-label');

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
const statAiConnected = document.getElementById('stat-ai-connected');
const statMouth = document.getElementById('stat-mouth');

// Debug UI labels
const dbgGemini = document.getElementById('dbg-gemini');
const dbgMouthState = document.getElementById('dbg-mouth-state');
const dbgBirdY = document.getElementById('dbg-bird-y');
const dbgBirdVy = document.getElementById('dbg-bird-vy');
const dbgInvincible = document.getElementById('dbg-invincible');
const dbgScore = document.getElementById('dbg-score');
const dbgFps = document.getElementById('dbg-fps');

const indMouthActive = document.getElementById('ind-mouth-active');
const indMouthText = document.getElementById('ind-mouth-text');

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
    const raw = localStorage.getItem('flappy_mouth_scores');
    highScores = raw ? JSON.parse(raw) : [20, 10, 5];
  } catch (e) {
    highScores = [20, 10, 5];
  }
  highScores.sort((a, b) => b - a);
  if (hudHighscore) {
    hudHighscore.innerText = String(highScores[0]).padStart(5, '0');
  }
}
function saveHighScore(score) {
  highScores.push(score);
  highScores.sort((a, b) => b - a);
  highScores = highScores.slice(0, 5); // Keep top 5
  localStorage.setItem('flappy_mouth_scores', JSON.stringify(highScores));
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
      row.innerHTML = `<span class="rank">${idx + 1}.</span> <span class="score">${String(s).padStart(5, '0')}</span>`;
      el.appendChild(row);
    });
  };
  makeList(document.getElementById('lobby-leaderboard'));
  makeList(document.getElementById('gameover-leaderboard'));
}
renderLeaderboards();

// ----------------------------------------------------
// Web Audio API Sound Synthesizer
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
  playFlap() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
    
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.start();
    osc.stop(now + 0.12);
  }
  playScore() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const playNote = (freq, time, dur) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      
      osc.start(time);
      osc.stop(time + dur);
    };
    
    playNote(587.33, now, 0.1);       // D5
    playNote(880.00, now + 0.08, 0.2); // A5
  }
  playCrash() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Low rumble slide down
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);
    
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    osc.start();
    osc.stop(now + 0.45);
    
    // Noise explosion burst
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 0.4);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.4);
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Fallback manual controls
// ----------------------------------------------------
let keyboardFlap = false;
let isMouseDown = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    keyboardFlap = true;
  }
  if (e.key.toLowerCase() === 'c') {
    toggleBackground();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    keyboardFlap = false;
  }
});

window.addEventListener('mousedown', () => {
  if (currentGameState === GAME_STATE.PLAYING) {
    isMouseDown = true;
  }
});
window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

// Touch controls
window.addEventListener('touchstart', (e) => {
  if (currentGameState === GAME_STATE.PLAYING && e.touches.length > 0) {
    isMouseDown = true;
  }
});
window.addEventListener('touchend', () => {
  isMouseDown = false;
});

// Toggle Background Mode
let backgroundMode = 'dojo'; // 'dojo' | 'camera'
function toggleBackground() {
  if (backgroundMode === 'dojo') {
    backgroundMode = 'camera';
    bgModeLabel.innerText = 'CAMERA VIEW';
  } else {
    backgroundMode = 'dojo';
    bgModeLabel.innerText = 'CYBER CITY';
  }
}
btnToggleBg.addEventListener('click', toggleBackground);

// Resize Canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ----------------------------------------------------
// Onboarding & Calibration
// ----------------------------------------------------
const onboarding = {
  currentStep: 1,
  step2Countdown: 3,
  step3Progress: 0,
  
  completedSteps: {
    1: false,
    2: false,
    3: false
  }
};

btnEnterCalibration.addEventListener('click', () => {
  menuOverlay.style.display = 'none';
  calibrationOverlay.style.display = 'flex';
  currentGameState = GAME_STATE.CALIBRATING;
});

btnEnableCamera.addEventListener('click', async () => {
  btnEnableCamera.disabled = true;
  btnEnableCamera.innerText = 'Initializing...';
  
  // Upgrade WebSocket to /mouth path
  const ok = await window.MovementController.initCamera(webcamCalibrationView);
  
  if (ok) {
    webcamView.srcObject = webcamCalibrationView.srcObject;
    webcamView.play();
    
    // Load MediaPipe Face Mesh for local processing
    window.MovementController.loadMediaPipeFaceMesh().then(() => {
      console.log('[Game] Face Mesh loaded successfully.');
    }).catch(err => {
      console.error('[Game] Error loading MediaPipe Face Mesh:', err);
    });
    
    onboarding.completedSteps[1] = true;
    const stepEl = document.getElementById('step-1');
    stepEl.classList.remove('active');
    stepEl.classList.add('completed');
    btnEnableCamera.innerText = 'Camera Active';
    
    window.MovementController.startProcessingLoop();
    
    activateStep(2);
    startStep2Calibration();
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable Camera';
    alert('Webcam permission was denied. Slicing/flapping falls back to Keyboard Spacebar or Mouse Clicks.');
    
    // Bypassing calibration
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
  console.log('[Game] Face centering calibration...');
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

// ----------------------------------------------------
// Game Entities & Metrics
// ----------------------------------------------------
let score = 0;
let lives = 3;
let invincibilityFrames = 0;
let currentMouthOpen = false;

// Physics coefficients
const PHYSICS = {
  gravity: 0.38,
  lift: 0.8,
  maxFall: 8.5,
  maxRise: -5.5
};

class CyberBird {
  constructor() {
    this.x = 180;
    this.y = canvas.height / 2;
    this.r = 16;
    this.vy = 0;
    this.angle = 0;
    this.wingAngle = 0;
  }
  
  update(mouthOpen) {
    // Apply forces
    const isLifting = mouthOpen || keyboardFlap || isMouseDown;
    
    if (isLifting) {
      // Accelerate upward
      this.vy = Math.max(PHYSICS.maxRise, this.vy - PHYSICS.lift);
      // Play flap audio occasionally
      if (Math.random() < 0.12) {
        sounds.playFlap();
      }
    } else {
      // Accelerate downward
      this.vy = Math.min(PHYSICS.maxFall, this.vy + PHYSICS.gravity);
    }
    
    this.y += this.vy;
    
    // Bounds clamping
    if (this.y < this.r + 10) {
      this.y = this.r + 10;
      this.vy = 0;
    }
    if (this.y > canvas.height - this.r - 20) {
      this.y = canvas.height - this.r - 20;
      this.vy = 0;
    }
    
    // Angle rotation based on velocity
    this.angle = Math.max(-Math.PI/6, Math.min(Math.PI/3, this.vy * 0.08));
    
    // Flapping wings animation speed scales with velocity
    this.wingAngle += isLifting ? 0.35 : 0.12;
  }
  
  draw(gCtx) {
    const isFlashing = invincibilityFrames > 0 && Math.floor(Date.now() / 60) % 2 === 0;
    if (isFlashing) return; // Flash effect during invincibility shield
    
    gCtx.save();
    gCtx.translate(this.x, this.y);
    gCtx.rotate(this.angle);
    
    // Holographic shadow
    gCtx.shadowBlur = 12;
    gCtx.shadowColor = '#00e5ff';
    
    // Draw neon bird body (glowing cyber sphere/triangle)
    gCtx.fillStyle = '#050505';
    gCtx.strokeStyle = '#00e5ff';
    gCtx.lineWidth = 2.5;
    
    // Body Circle
    gCtx.beginPath();
    gCtx.arc(0, 0, this.r, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.stroke();
    
    // Cyan visor (Eye)
    gCtx.fillStyle = '#00e5ff';
    gCtx.beginPath();
    gCtx.ellipse(this.r * 0.3, -this.r * 0.2, 5, 2.5, Math.PI / 8, 0, Math.PI * 2);
    gCtx.fill();
    
    // Beak that opens when mouth is open
    gCtx.strokeStyle = '#00e5ff';
    gCtx.fillStyle = '#050505';
    gCtx.lineWidth = 2;
    
    const beakOpenOffset = currentMouthOpen ? 5 : 0;
    gCtx.beginPath();
    gCtx.moveTo(this.r * 0.9, -3);
    gCtx.lineTo(this.r * 1.4, -beakOpenOffset);
    gCtx.lineTo(this.r * 0.9, 3);
    gCtx.closePath();
    gCtx.fill();
    gCtx.stroke();
    
    // Cyber wings flapping (neon curves)
    gCtx.save();
    gCtx.translate(-this.r * 0.4, 0);
    gCtx.rotate(Math.sin(this.wingAngle) * 0.7);
    
    gCtx.strokeStyle = '#ff007f'; // Hot pink wings!
    gCtx.shadowColor = '#ff007f';
    gCtx.lineWidth = 2.5;
    gCtx.beginPath();
    gCtx.moveTo(0, 0);
    gCtx.quadraticCurveTo(-this.r, -this.r * 1.2, -this.r * 1.5, -this.r * 0.5);
    gCtx.stroke();
    gCtx.restore();
    
    gCtx.restore();
  }
}

class ObstaclePipe {
  constructor() {
    this.w = 65;
    this.x = canvas.width + this.w;
    
    this.gap = 160; // gap height
    // min gap top edge is 100, max is height - gap - 100
    this.gapTop = Math.random() * (canvas.height - this.gap - 200) + 100;
    
    this.passed = false;
    this.speed = 3.2;
  }
  
  update() {
    this.x -= this.speed;
  }
  
  draw(gCtx) {
    gCtx.save();
    gCtx.fillStyle = '#070707';
    gCtx.strokeStyle = '#00e5ff'; // glowing cyan pipes
    gCtx.lineWidth = 2.5;
    
    gCtx.shadowBlur = 10;
    gCtx.shadowColor = '#00e5ff';
    
    // 1. Draw top pipe
    gCtx.beginPath();
    gCtx.rect(this.x, 0, this.w, this.gapTop);
    gCtx.fill();
    gCtx.stroke();
    
    // Top Lip
    gCtx.beginPath();
    gCtx.rect(this.x - 5, this.gapTop - 25, this.w + 10, 25);
    gCtx.fill();
    gCtx.stroke();
    
    // 2. Draw bottom pipe
    const bottomPipeY = this.gapTop + this.gap;
    const bottomPipeHeight = canvas.height - bottomPipeY;
    gCtx.beginPath();
    gCtx.rect(this.x, bottomPipeY, this.w, bottomPipeHeight);
    gCtx.fill();
    gCtx.stroke();
    
    // Bottom Lip
    gCtx.beginPath();
    gCtx.rect(this.x - 5, bottomPipeY, this.w + 10, 25);
    gCtx.fill();
    gCtx.stroke();
    
    gCtx.restore();
  }
  
  checkCollision(bird) {
    // Invincibility shield bypasses checking
    if (invincibilityFrames > 0) return false;
    
    // Check horizontal overlap
    if (bird.x + bird.r > this.x && bird.x - bird.r < this.x + this.w) {
      // Check vertical intersection
      if (bird.y - bird.r < this.gapTop || bird.y + bird.r > this.gapTop + this.gap) {
        return true;
      }
    }
    return false;
  }
}

// Particle System
class DustParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 3;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.r = 1.5 + Math.random() * 3;
    this.color = color;
    this.alpha = 1;
    this.decay = 0.015 + Math.random() * 0.02;
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
    gCtx.beginPath();
    gCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.restore();
  }
}

// Game Objects
let bird = new CyberBird();
let pipes = [];
let particles = [];
let spawnTimer = 0;
let screenShakeTimer = 0;
let screenShakeIntensity = 0;

function triggerShake(intensity, duration) {
  screenShakeIntensity = intensity;
  screenShakeTimer = duration;
}

function updateLivesUI() {
  if (livesDisplay) {
    let hearts = '';
    for (let l = 0; l < 3; l++) {
      if (l < lives) hearts += '❤️';
      else hearts += '🖤';
    }
    livesDisplay.innerText = hearts;
  }
}

function triggerGameOver() {
  currentGameState = GAME_STATE.GAMEOVER;
  gameoverOverlay.style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  btnToggleBg.style.display = 'none';
  
  document.getElementById('go-score').innerText = `SCORE: ${score}`;
  saveHighScore(score);
  renderLeaderboards();
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
  
  initGame();
});

function initGame() {
  score = 0;
  lives = 3;
  invincibilityFrames = 0;
  pipes = [];
  particles = [];
  spawnTimer = 0;
  
  bird = new CyberBird();
  hudScore.innerText = '00000';
  updateLivesUI();
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('GO!', 90);
}

function triggerAnnouncement(txt, duration = 90) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  setTimeout(() => {
    announcement.style.opacity = '0';
  }, duration * 16.6);
}

// ----------------------------------------------------
// Sensor Validation Calibration Loop
// ----------------------------------------------------
function updateOnboarding() {
  const active = window.MovementController.isFaceMeshLoaded;
  if (statAiConnected) {
    statAiConnected.innerText = active ? 'CONNECTED' : 'WAITING...';
    statAiConnected.className = `status-value ${active ? 'val-true' : 'val-false'}`;
  }
  
  // Look at mouth state locally
  const mouthOpen = window.MovementController.isMouthOpen;
  currentMouthOpen = mouthOpen;
  
  if (statMouth) {
    statMouth.innerText = mouthOpen ? 'OPEN' : 'CLOSED';
    statMouth.className = `status-value ${mouthOpen ? 'val-true' : 'val-false'}`;
  }
  
  // Update Debug monitor values
  dbgGemini.innerText = active ? 'connected' : 'disconnected';
  dbgGemini.style.color = active ? '#00e5ff' : '#e74c3c';
  dbgMouthState.innerText = mouthOpen ? 'true' : 'false';
  dbgMouthState.style.color = mouthOpen ? '#00e5ff' : '#555';
  
  indMouthActive.className = `indicator-dot ${active ? 'active' : ''}`;
  indMouthText.innerText = active ? 'LOCAL AI ACTIVE' : 'INITIALIZING...';
  
  // Render live webcam skeleton and overlay helper box
  drawCalibrationOverlay();
  
  // Calibration Step calculations
  if (onboarding.currentStep === 3) {
    if (mouthOpen) {
      onboarding.step3Progress = Math.min(onboarding.step3Progress + 2.0, 100);
      document.getElementById('step-3-progress').style.width = `${onboarding.step3Progress}%`;
    }
    
    if (onboarding.step3Progress >= 100) {
      onboarding.completedSteps[3] = true;
      const stepEl = document.getElementById('step-3');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      
      btnStartGame.removeAttribute('disabled');
      btnStartGame.focus();
    }
  }
}

function drawCalibrationOverlay() {
  if (!webcamCalibrationView || !calibrationCanvasOverlay || !calCtx) return;
  if (webcamCalibrationView.paused || webcamCalibrationView.ended) return;
  
  const w = calibrationCanvasOverlay.width;
  const h = calibrationCanvasOverlay.height;
  
  // Draw mirrored webcam
  calCtx.save();
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  
  // Draw face landmarks outlines under the mirror matrix!
  const landmarks = window.MovementController.faceLandmarksList;
  if (landmarks && landmarks.length > 0) {
    // 1. Draw outer lip contour
    const outerLips = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 95, 88, 61];
    calCtx.strokeStyle = currentMouthOpen ? '#ff007f' : '#00e5ff';
    calCtx.lineWidth = 1.5;
    calCtx.beginPath();
    for (let i = 0; i < outerLips.length; i++) {
      const pt = landmarks[outerLips[i]];
      if (pt) {
        const cx = pt.x * w;
        const cy = pt.y * h;
        if (i === 0) calCtx.moveTo(cx, cy);
        else calCtx.lineTo(cx, cy);
      }
    }
    calCtx.stroke();
    
    // 2. Draw inner lip contour
    const innerLips = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
    calCtx.strokeStyle = '#ffff00'; // neon yellow inner lips
    calCtx.lineWidth = 1.5;
    calCtx.beginPath();
    for (let i = 0; i < innerLips.length; i++) {
      const pt = landmarks[innerLips[i]];
      if (pt) {
        const cx = pt.x * w;
        const cy = pt.y * h;
        if (i === 0) calCtx.moveTo(cx, cy);
        else calCtx.lineTo(cx, cy);
      }
    }
    calCtx.stroke();

    // 3. Draw face contour silhouette (jaw line)
    const jawOutline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
    calCtx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    calCtx.lineWidth = 1;
    calCtx.beginPath();
    for (let i = 0; i < jawOutline.length; i++) {
      const pt = landmarks[jawOutline[i]];
      if (pt) {
        const cx = pt.x * w;
        const cy = pt.y * h;
        if (i === 0) calCtx.moveTo(cx, cy);
        else calCtx.lineTo(cx, cy);
      }
    }
    calCtx.stroke();
  }
  calCtx.restore();
  
  // Holographic facial centering target box
  calCtx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(80, 50, w - 160, h - 100);
  
  // Center face silhouette helper guide
  calCtx.strokeStyle = currentMouthOpen ? '#ff007f' : '#00e5ff';
  calCtx.lineWidth = 2;
  
  // Draw an oval outline representing mouth target zone
  calCtx.beginPath();
  calCtx.ellipse(w / 2, h / 2 + 10, 35, 45, 0, 0, Math.PI * 2);
  calCtx.stroke();
  
  calCtx.fillStyle = currentMouthOpen ? 'rgba(255, 0, 127, 0.15)' : 'rgba(0, 229, 255, 0.05)';
  calCtx.beginPath();
  calCtx.ellipse(w / 2, h / 2 + 10, 25, currentMouthOpen ? 22 : 12, 0, 0, Math.PI * 2);
  calCtx.fill();
  calCtx.stroke();
  
  // Text label
  calCtx.fillStyle = '#00e5ff';
  calCtx.font = '800 0.65rem Outfit';
  calCtx.textAlign = 'center';
  calCtx.fillText("CENTER MOUTH HERE", w / 2, h / 2 - 45);
}

// ----------------------------------------------------
// Main Game Update and Render Loop
// ----------------------------------------------------
let lastTime = performance.now();
let frameCount = 0;

function runLoop() {
  const now = performance.now();
  frameCount++;
  if (now - lastTime >= 1000) {
    dbgFps.innerText = frameCount;
    frameCount = 0;
    lastTime = now;
  }
  
  // 1. Calibration phase
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateOnboarding();
  }
  
  // 2. Play phase
  else if (currentGameState === GAME_STATE.PLAYING) {
    // Read mouth open state locally
    const mouthOpen = window.MovementController.isMouthOpen;
    currentMouthOpen = mouthOpen;
    
    // Invincibility frame updates
    if (invincibilityFrames > 0) {
      invincibilityFrames--;
    }
    
    // Sync monitor panel
    const active = window.MovementController.isFaceMeshLoaded;
    dbgGemini.innerText = active ? 'connected' : 'disconnected';
    dbgMouthState.innerText = mouthOpen ? 'true' : 'false';
    dbgMouthState.style.color = mouthOpen ? '#00e5ff' : '#555';
    dbgBirdY.innerText = Math.round(bird.y);
    dbgBirdVy.innerText = bird.vy.toFixed(2);
    dbgInvincible.innerText = invincibilityFrames > 0 ? 'true' : 'false';
    dbgScore.innerText = score;
    
    indMouthActive.className = `indicator-dot ${active ? 'active' : ''}`;
    indMouthText.innerText = active 
      ? (mouthOpen ? 'MOUTH OPEN - LIFT ON' : 'MOUTH CLOSED - GLIDE')
      : 'FALLBACK KEYS ACTIVE';
    
    // Canvas setup
    ctx.save();
    
    // Screen Shake
    if (screenShakeTimer > 0) {
      screenShakeTimer--;
      const dx = (Math.random() - 0.5) * screenShakeIntensity;
      const dy = (Math.random() - 0.5) * screenShakeIntensity;
      ctx.translate(dx, dy);
      screenShakeIntensity *= 0.92;
    }
    
    // Draw Background
    if (backgroundMode === 'camera' && webcamView.srcObject) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.22;
      ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      // Cyber Arcade city backdrop
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Grid lines
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.02)';
      ctx.lineWidth = 1;
      const spacing = 50;
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      
      // Stylized retro mountains
      ctx.fillStyle = 'rgba(255, 0, 127, 0.02)';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      ctx.lineTo(canvas.width * 0.2, canvas.height * 0.6);
      ctx.lineTo(canvas.width * 0.4, canvas.height);
      ctx.lineTo(canvas.width * 0.7, canvas.height * 0.55);
      ctx.lineTo(canvas.width * 0.9, canvas.height);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
    }
    
    // Update and Draw Bird
    bird.update(mouthOpen);
    bird.draw(ctx);
    
    // Spawning pipes
    spawnTimer++;
    if (spawnTimer >= 105) { // Spawn pipe every 105 frames
      spawnTimer = 0;
      pipes.push(new ObstaclePipe());
    }
    
    // Update and Draw Pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.update();
      p.draw(ctx);
      
      // Collision checking
      if (p.checkCollision(bird)) {
        // Crash!
        sounds.playCrash();
        triggerShake(18, 30);
        
        lives--;
        updateLivesUI();
        
        // Spawn crash debris particles
        for (let pt = 0; pt < 25; pt++) {
          particles.push(new DustParticle(bird.x, bird.y, '#ff007f'));
        }
        
        if (lives <= 0) {
          triggerGameOver();
        } else {
          // Invincibility recovery window
          invincibilityFrames = 90; // 1.5 seconds
          
          // Clear immediate pipes in front to give space
          pipes = pipes.filter(p2 => p2.x < bird.x - 100 || p2.x > bird.x + 300);
        }
      }
      
      // Score checking
      if (!p.passed && p.x + p.w < bird.x) {
        p.passed = true;
        score++;
        sounds.playScore();
        
        // Float alert
        hudScore.innerText = String(score).padStart(5, '0');
        
        // Score blast particles
        for (let pt = 0; pt < 8; pt++) {
          particles.push(new DustParticle(bird.x, bird.y, '#00e5ff'));
        }
      }
      
      // Clean up offscreen pipes
      if (p.x < -p.w - 10) {
        pipes.splice(i, 1);
      }
    }
    
    // Update and Draw Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
    
    ctx.restore();
  }
  
  requestAnimationFrame(runLoop);
}

// Start immediately
requestAnimationFrame(runLoop);
