// Cyber Brick Breaker Game Logic + Hand Controller Tracking

// DOM Elements
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
const statHandSignal = document.getElementById('stat-hand-signal');
const statSlideRange = document.getElementById('stat-slide-range');

// Debug Panel Elements
const dbgMediapipe = document.getElementById('dbg-mediapipe');
const dbgHandX = document.getElementById('dbg-hand-x');
const dbgLerpX = document.getElementById('dbg-lerp-x');
const dbgBallSpeed = document.getElementById('dbg-ball-speed');
const dbgBricks = document.getElementById('dbg-bricks');
const dbgFps = document.getElementById('dbg-fps');

const indHandActive = document.getElementById('ind-hand-active');
const indHandText = document.getElementById('ind-hand-text');

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
    const raw = localStorage.getItem('cyber_breaker_scores');
    const parsed = raw ? JSON.parse(raw) : [500, 300, 150];
    highScores = parsed.map(item => {
      if (typeof item === 'number') {
        return { name: 'System', score: item };
      }
      return item;
    });
  } catch (e) {
    highScores = [
      { name: 'System', score: 500 },
      { name: 'System', score: 300 },
      { name: 'System', score: 150 }
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
  localStorage.setItem('cyber_breaker_scores', JSON.stringify(highScores));
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
  playBounce() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(440, now + 0.08);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.start();
    osc.stop(now + 0.08);
  }
  playBreak() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(750, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.06);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    osc.start();
    osc.stop(now + 0.06);

    // Short metallic noise pop
    const bufferSize = this.ctx.sampleRate * 0.03;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, now);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.03);
  }
  playOut() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(25, now + 0.4);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    osc.start();
    osc.stop(now + 0.45);
  }
  playVictory() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      
      gain.gain.setValueAtTime(0.15, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
      
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.2);
    });
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Mouse, Touch & Keydown controls
// ----------------------------------------------------
let lastInputType = 'mouse';
let currentTargetX = canvas.width / 2;
const pointer = { x: canvas.width / 2 };

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  lastInputType = 'mouse';
  currentTargetX = pointer.x;
});

window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.touches[0].clientX - rect.left;
    lastInputType = 'mouse';
    currentTargetX = pointer.x;
  }
});

// Keydown listener to toggle background mode using 'C'
window.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'c') {
    toggleBackground();
  }
});

// Setup Canvas Resize
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
  // Slide span calibration parameters
  minHandX: 1.0,
  maxHandX: 0.0
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
    
    // Load MediaPipe Hands
    window.MovementController.loadMediaPipe().catch(err => {
      console.error('[Game] Error loading MediaPipe Hands:', err);
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
    alert('Webcam permission denied or camera not found. Steering falls back to Mouse/Touch dragging.');
    
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

// Background theme mode
let backgroundMode = 'dojo'; // 'dojo' | 'camera'
function toggleBackground() {
  if (backgroundMode === 'dojo') {
    backgroundMode = 'camera';
    bgModeLabel.innerText = 'CAMERA VIEW';
  } else {
    backgroundMode = 'dojo';
    bgModeLabel.innerText = 'CYBER DOJO';
  }
}
btnToggleBg.addEventListener('click', toggleBackground);

// ----------------------------------------------------
// Particle System for Splatters
// ----------------------------------------------------
class BrickParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.0 + Math.random() * 4.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.r = 1.5 + Math.random() * 4;
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
    gCtx.shadowBlur = 8;
    gCtx.shadowColor = this.color;
    gCtx.beginPath();
    gCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.restore();
  }
}

// ----------------------------------------------------
// Game Objects and Physics Loop
// ----------------------------------------------------
let score = 0;
let lives = 3;
let level = 1;
let bricks = [];
let particles = [];

const paddle = {
  x: canvas.width / 2,
  y: canvas.height - 60,
  w: 140,
  h: 18,
  targetW: 140,
  pulseTimer: 0
};

const ball = {
  x: canvas.width / 2,
  y: canvas.height - 120,
  vx: 4,
  vy: -5,
  r: 8,
  baseSpeed: 6.5,
  speedMultiplier: 1.0
};

// Screen Shake variables
let shakeTimer = 0;
let shakeIntensity = 0;
function triggerScreenShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
}

// Spawning rows of bricks
function spawnBricks() {
  bricks = [];
  
  const cols = 9;
  const rows = 4 + Math.min(level - 1, 3);
  
  const topMargin = 100;
  const sideMargin = 60;
  const spacingX = 12;
  const spacingY = 12;
  
  const areaW = canvas.width - sideMargin * 2;
  const brickW = (areaW - (cols - 1) * spacingX) / cols;
  const brickH = 22;
  
  const colors = ['#ff0055', '#f39c12', '#00e5ff', '#9b59b6'];
  
  for (let r = 0; r < rows; r++) {
    const rowColor = colors[r % colors.length];
    for (let c = 0; c < cols; c++) {
      const bx = sideMargin + c * (brickW + spacingX);
      const by = topMargin + r * (brickH + spacingY);
      
      bricks.push({
        x: bx,
        y: by,
        w: brickW,
        h: brickH,
        active: true,
        color: rowColor
      });
    }
  }
}

// Rect-circle intersection check
function rectBallIntersect(rect, b) {
  const closestX = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
  
  const dx = b.x - closestX;
  const dy = b.y - closestY;
  
  const distanceSq = dx * dx + dy * dy;
  return distanceSq < b.r * b.r;
}

function handleBallMovement() {
  ball.x += ball.vx;
  ball.y += ball.vy;
  
  // Left/right wall bounce
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = -ball.vx;
    sounds.playBounce();
  } else if (ball.x + ball.r > canvas.width) {
    ball.x = canvas.width - ball.r;
    ball.vx = -ball.vx;
    sounds.playBounce();
  }
  
  // Top wall bounce
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = -ball.vy;
    sounds.playBounce();
  }
  
  // Out of bounds (bottom)
  if (ball.y - ball.r > canvas.height) {
    lives--;
    updateLivesUI();
    sounds.playOut();
    triggerScreenShake(20, 30);
    
    if (lives <= 0) {
      triggerGameOver();
      return;
    }
    
    // Reset ball position onto paddle
    resetBall();
  }
  
  // Paddle Collision check
  if (rectBallIntersect(paddle, ball) && ball.vy > 0) {
    // Determine contact relative point
    const relativeX = (paddle.x + paddle.w / 2) - ball.x;
    const normalizedIntersect = relativeX / (paddle.w / 2);
    
    // Max bounce angle 55 degrees
    const bounceAngle = normalizedIntersect * (Math.PI / 3.2);
    
    const speed = ball.baseSpeed * ball.speedMultiplier;
    ball.vx = -speed * Math.sin(bounceAngle);
    ball.vy = -speed * Math.cos(bounceAngle);
    
    sounds.playBounce();
    paddle.pulseTimer = 8; // trigger paddle animation pulse
  }
  
  // Brick Collisions check
  for (let i = 0; i < bricks.length; i++) {
    const bk = bricks[i];
    if (bk.active && rectBallIntersect(bk, ball)) {
      bk.active = false;
      score += 15;
      hudScore.innerText = String(score).padStart(5, '0');
      sounds.playBreak();
      
      // Spawn brick breaking splatters
      const cx = bk.x + bk.w / 2;
      const cy = bk.y + bk.h / 2;
      for (let p = 0; p < 12; p++) {
        particles.push(new BrickParticle(cx, cy, bk.color));
      }
      
      // Determine collision side to bounce ball
      const closestX = Math.max(bk.x, Math.min(ball.x, bk.x + bk.w));
      const closestY = Math.max(bk.y, Math.min(ball.y, bk.y + bk.h));
      
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
      } else {
        ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
      }
      
      // Speed up slightly
      ball.speedMultiplier = Math.min(1.4, ball.speedMultiplier + 0.008);
      break; // Only collision check one brick per frame
    }
  }
  
  // Level cleared check
  const activeBricks = bricks.filter(b => b.active);
  if (activeBricks.length === 0) {
    level++;
    sounds.playVictory();
    triggerAnnouncement(`LEVEL ${level}!`, 90);
    spawnBricks();
    resetBall();
  }
}

function resetBall() {
  ball.x = paddle.x + paddle.w / 2;
  ball.y = paddle.y - 40;
  ball.vx = (Math.random() - 0.5) * 4;
  ball.vy = -ball.baseSpeed;
  ball.speedMultiplier = 1.0;
}

function updateLivesUI() {
  if (livesDisplay) {
    let shields = '';
    for (let l = 0; l < 3; l++) {
      if (l < lives) shields += '❤️';
      else shields += '🖤';
    }
    livesDisplay.innerText = shields;
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
  
  window.MovementController.stopConnection();
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
  
  window.MovementController.startConnection('ws://localhost:8080');
  initGame();
});

function initGame() {
  score = 0;
  lives = 3;
  level = 1;
  particles = [];
  
  hudScore.innerText = '00000';
  updateLivesUI();
  
  paddle.w = 140;
  paddle.x = canvas.width / 2 - paddle.w / 2;
  
  spawnBricks();
  resetBall();
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('INIT CYCLE!', 90);
}

function triggerAnnouncement(txt, duration = 90) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  setTimeout(() => {
    announcement.style.opacity = '0';
  }, duration * 16.6);
}

// ----------------------------------------------------
// Input Hand Tracking Updates
// ----------------------------------------------------
function updateInputControls() {
  const dbg = window.MovementController.getDebugInfo();
  
  // Update MediaPipe loading state
  dbgMediapipe.innerText = dbg.mediaPipeLoaded ? 'loaded' : 'loading';
  dbgMediapipe.style.color = dbg.mediaPipeLoaded ? '#00e5ff' : '#ff0055';
  
  const handList = window.MovementController.handLandmarksList || [];
  
  // Set bottom-left sensor preview indicator lights
  indHandActive.className = `indicator-dot ${handList.length > 0 ? 'active' : ''}`;
  indHandText.innerText = handList.length > 0 ? 'HAND TRACKING ACTIVE' : 'TRACKING IDLE';
  
  if (statHandSignal) {
    const connected = dbg.mediaPipeLoaded && handList.length > 0;
    statHandSignal.innerText = connected ? 'ACTIVE' : 'WAITING';
    statHandSignal.className = `status-value ${connected ? 'val-true' : 'val-false'}`;
  }
  
  if (handList.length > 0) {
    lastInputType = 'hand';
    const mainHand = handList[0];
    
    // Landmark 9: Middle knuckle (center-palm node)
    const palmNode = mainHand[9];
    
    // Scale X-coordinate mirror layout
    currentTargetX = (1 - palmNode.x) * canvas.width;
    
    dbgHandX.innerText = currentTargetX.toFixed(1);
    
    // Calibration Step logic
    if (currentGameState === GAME_STATE.CALIBRATING && onboarding.currentStep === 3) {
      // Record range span
      onboarding.minHandX = Math.min(onboarding.minHandX, palmNode.x);
      onboarding.maxHandX = Math.max(onboarding.maxHandX, palmNode.x);
      const span = onboarding.maxHandX - onboarding.minHandX;
      
      const spanPercent = Math.min((span / 0.5) * 100, 100);
      document.getElementById('step-3-progress').style.width = `${spanPercent}%`;
      
      if (span >= 0.5) {
        onboarding.completedSteps[3] = true;
        const stepEl = document.getElementById('step-3');
        stepEl.classList.remove('active');
        stepEl.classList.add('completed');
        
        statSlideRange.innerText = 'CALIBRATED';
        statSlideRange.className = 'status-value val-true';
        
        btnStartGame.removeAttribute('disabled');
        btnStartGame.focus();
      }
    }
  } else if (lastInputType === 'mouse') {
    currentTargetX = pointer.x;
    dbgHandX.innerText = 'mouse';
  } else {
    // Hand tracking active but lost: keep currentTargetX as is!
    dbgHandX.innerText = `lost (${currentTargetX.toFixed(0)})`;
  }
  
  // Smoothly interpolate paddle position to avoid high-frequency jitter
  paddle.x += (currentTargetX - paddle.w / 2 - paddle.x) * 0.18;
  
  // Boundary bounds
  if (paddle.x < 0) paddle.x = 0;
  if (paddle.x + paddle.w > canvas.width) paddle.x = canvas.width - paddle.w;
  
  dbgLerpX.innerText = paddle.x.toFixed(1);
  dbgBallSpeed.innerText = (ball.baseSpeed * ball.speedMultiplier).toFixed(1);
  dbgBricks.innerText = bricks.filter(b => b.active).length;
}

function drawCalibrationOverlay() {
  if (!webcamCalibrationView || !calibrationCanvasOverlay || !calCtx) return;
  if (webcamCalibrationView.paused || webcamCalibrationView.ended) return;
  
  const w = calibrationCanvasOverlay.width;
  const h = calibrationCanvasOverlay.height;
  
  calCtx.save();
  // Mirrored canvas draw
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  calCtx.restore();
  
  // Outline drawing area
  calCtx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);
  
  // Corners
  const corner = 12;
  calCtx.strokeStyle = '#00e5ff';
  calCtx.lineWidth = 2;
  calCtx.beginPath();
  calCtx.moveTo(15, 15 + corner); calCtx.lineTo(15, 15); calCtx.lineTo(15 + corner, 15);
  calCtx.moveTo(w - 15, 15 + corner); calCtx.lineTo(w - 15, 15); calCtx.lineTo(w - 15 - corner, 15);
  calCtx.moveTo(15, h - 15 - corner); calCtx.lineTo(15, h - 15); calCtx.lineTo(15 + corner, h - 15);
  calCtx.moveTo(w - 15, h - 15 - corner); calCtx.lineTo(w - 15, h - 15); calCtx.lineTo(w - 15 - corner, h - 15);
  calCtx.stroke();
  
  // Render MediaPipe Hand skeletons onto preview
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks) => {
      if (landmarks && landmarks.length > 0) {
        const paths = [
          [0, 1, 2, 3, 4],
          [0, 5, 6, 7, 8],
          [9, 10, 11, 12],
          [13, 14, 15, 16],
          [0, 17, 18, 19, 20],
          [5, 9, 13, 17]
        ];
        
        calCtx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
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
        
        landmarks.forEach(pt => {
          calCtx.fillStyle = '#ff0055';
          calCtx.beginPath();
          calCtx.arc((1 - pt.x) * w, pt.y * h, 3, 0, Math.PI * 2);
          calCtx.fill();
        });
        
        // Highlight palm center
        const palm = landmarks[9];
        calCtx.fillStyle = '#00e5ff';
        calCtx.beginPath();
        calCtx.arc((1 - palm.x) * w, palm.y * h, 6, 0, Math.PI * 2);
        calCtx.fill();
      }
    });
  }
}

// ----------------------------------------------------
// Core Game Rendering Loop
// ----------------------------------------------------
let lastTime = performance.now();
let frameCount = 0;

function runLoop() {
  // Compute FPS
  const now = performance.now();
  frameCount++;
  if (now - lastTime >= 1000) {
    dbgFps.innerText = frameCount;
    frameCount = 0;
    lastTime = now;
  }
  
  // 1. Process calibration state
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateInputControls();
    drawCalibrationOverlay();
  }
  
  // 2. Play state
  else if (currentGameState === GAME_STATE.PLAYING) {
    updateInputControls();
    handleBallMovement();
    
    // Clear viewport and check screen shake
    ctx.save();
    if (shakeTimer > 0) {
      shakeTimer--;
      const dx = (Math.random() - 0.5) * shakeIntensity;
      const dy = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(dx, dy);
      shakeIntensity *= 0.94; // damp shake
    }
    
    // Draw Background
    if (backgroundMode === 'camera' && webcamView.srcObject) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.fillStyle = '#040404';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Cyber Grid
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.025)';
      ctx.lineWidth = 1;
      const spacing = 45;
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      
      // Concentric circles
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.04)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(canvas.width/2, canvas.height/2, Math.min(220, canvas.width*0.2), 0, Math.PI*2);
      ctx.stroke();
    }
    
    // Draw Bricks
    bricks.forEach(b => {
      if (b.active) {
        ctx.save();
        ctx.fillStyle = b.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        
        // Shiny bevel overlay
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(b.x, b.y, b.w, 4);
        ctx.fillRect(b.x, b.y, 4, b.h);
        ctx.restore();
      }
    });
    
    // Draw Paddle
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00e5ff';
    
    // Handle paddle contact bounce pulse
    let displayW = paddle.w;
    let displayH = paddle.h;
    if (paddle.pulseTimer > 0) {
      paddle.pulseTimer--;
      displayW += Math.sin(paddle.pulseTimer) * 12;
      displayH += Math.sin(paddle.pulseTimer) * 4;
    }
    
    const px = paddle.x + (paddle.w - displayW) / 2;
    const py = paddle.y + (paddle.h - displayH) / 2;
    
    // Rounded paddle drawing
    ctx.beginPath();
    ctx.roundRect(px, py, displayW, displayH, 6);
    ctx.fill();
    ctx.restore();
    
    // Draw Ball
    ctx.save();
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff0055';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
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

// Start game ticks
requestAnimationFrame(runLoop);
