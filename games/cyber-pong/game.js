// Cyber Pong Game Logic + Gesture Controller Tracking

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const p1ScoreVal = document.getElementById('p1-score-val');
const p2ScoreVal = document.getElementById('p2-score-val');
const hudHighscore = document.getElementById('hud-highscore');
const announcement = document.getElementById('announcement');
const btnToggleBg = document.getElementById('btn-toggle-bg');
const modeLabel = document.getElementById('mode-label');

const menuOverlay = document.getElementById('menu-overlay');
const calibrationOverlay = document.getElementById('calibration-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const btnEnterCalibration = document.getElementById('btn-enter-calibration');
const btnEnableCamera = document.getElementById('btn-enable-camera');
const btnStartGame = document.getElementById('btn-start-game');
const btnRestart = document.getElementById('btn-restart');
const webcamView = document.getElementById('webcam-view');

// Mode Selection Buttons
const btnModeSingle = document.getElementById('btn-pong-single');
const btnModeDouble = document.getElementById('btn-pong-double');
const explSingle = document.getElementById('expl-single');
const explDouble = document.getElementById('expl-double');
const p1Label = document.getElementById('p1-label');
const p2Label = document.getElementById('p2-label');

// Calibration Elements
const webcamCalibrationView = document.getElementById('webcam-calibration-view');
const calibrationCanvasOverlay = document.getElementById('calibration-canvas-overlay');
const calCtx = calibrationCanvasOverlay ? calibrationCanvasOverlay.getContext('2d') : null;
const statHandSignal = document.getElementById('stat-hand-signal');
const statSlideRange = document.getElementById('stat-slide-range');

// Debug Panel Elements
const dbgMediapipe = document.getElementById('dbg-mediapipe');
const dbgHandsCount = document.getElementById('dbg-hands-count');
const dbgHand1Y = document.getElementById('dbg-hand1-y');
const dbgHand2Y = document.getElementById('dbg-hand2-y');
const dbgBallSpeed = document.getElementById('dbg-ball-speed');
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

// Game Mode
let is2PlayerMode = false; // false = vs AI, true = Local 2-Player

// High Score Manager
let highScores = [];
function loadHighScores() {
  try {
    const raw = localStorage.getItem('cyber_pong_scores');
    highScores = raw ? JSON.parse(raw) : [{ name: 'System', score: 11 }];
  } catch (e) {
    highScores = [{ name: 'System', score: 11 }];
  }
  highScores.sort((a, b) => b.score - a.score);
  if (hudHighscore && highScores.length > 0) {
    hudHighscore.innerText = String(highScores[0].score).padStart(3, '0');
  }
}
function saveHighScore(score) {
  const name = localStorage.getItem('currentUserDisplayName') || 'Guest';
  highScores.push({ name: name, score: score });
  highScores.sort((a, b) => b.score - a.score);
  highScores = highScores.slice(0, 5); // Keep top 5
  localStorage.setItem('cyber_pong_scores', JSON.stringify(highScores));
  loadHighScores();
}
function renderLeaderboards() {
  loadHighScores();
  const el = document.getElementById('lobby-leaderboard');
  const goEl = document.getElementById('gameover-leaderboard');
  const makeList = (targetEl) => {
    if (!targetEl) return;
    targetEl.innerHTML = '';
    highScores.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${idx === 0 ? 'high' : ''}`;
      row.innerHTML = `<span class="rank">${idx + 1}. ${s.name || 'Player'}</span> <span class="score">${String(s.score).padStart(3, '0')} pts</span>`;
      targetEl.appendChild(row);
    });
  };
  makeList(el);
  makeList(goEl);
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
  playPaddleBounce() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    osc.start();
    osc.stop(now + 0.1);
  }
  playWallBounce() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, now);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.start();
    osc.stop(now + 0.08);
  }
  playScorePoint() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.12); // A5
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.start();
    osc.stop(now + 0.3);
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
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
      
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.35);
    });
  }
  playDefeat() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.5);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    
    osc.start();
    osc.stop(now + 0.55);
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Mouse, Touch & Keydown controls
// ----------------------------------------------------
let lastInputType = 'mouse';
const pointer = { y1: canvas.height / 2, y2: canvas.height / 2 };

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseY = e.clientY - rect.top;
  const mouseX = e.clientX - rect.left;
  lastInputType = 'mouse';
  
  if (!is2PlayerMode) {
    pointer.y1 = mouseY;
  } else {
    // Left half controls Left Paddle, Right half controls Right paddle
    if (mouseX < canvas.width / 2) {
      pointer.y1 = mouseY;
    } else {
      pointer.y2 = mouseY;
    }
  }
});

window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    lastInputType = 'mouse';
    for (let i = 0; i < e.touches.length; i++) {
      const touchY = e.touches[i].clientY - rect.top;
      const touchX = e.touches[i].clientX - rect.left;
      if (!is2PlayerMode) {
        pointer.y1 = touchY;
      } else {
        if (touchX < canvas.width / 2) {
          pointer.y1 = touchY;
        } else {
          pointer.y2 = touchY;
        }
      }
    }
  }
});

// Keydown listener to toggle background mode using 'C'
window.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'c') {
    toggleBackground();
  }
});

// Mode Buttons Bindings
btnModeSingle.addEventListener('click', () => {
  is2PlayerMode = false;
  btnModeSingle.classList.add('active');
  btnModeDouble.classList.remove('active');
  explSingle.style.display = 'block';
  explDouble.style.display = 'none';
  modeLabel.innerText = 'SINGLE PLAYER';
  p1Label.innerText = 'PLAYER 1:';
  p2Label.innerText = 'CYBER AI:';
});

btnModeDouble.addEventListener('click', () => {
  is2PlayerMode = true;
  btnModeSingle.classList.remove('active');
  btnModeDouble.classList.add('active');
  explSingle.style.display = 'none';
  explDouble.style.display = 'block';
  modeLabel.innerText = 'LOCAL 2-PLAYER';
  p1Label.innerText = 'PLAYER 1 (L):';
  p2Label.innerText = 'PLAYER 2 (R):';
});

// Setup Canvas Resize
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Readjust paddles positions
  paddle1.x = 40;
  paddle2.x = canvas.width - 40 - paddle2.w;
}
window.addEventListener('resize', resizeCanvas);

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
  // Sweep span vertical calibration parameters
  minHandY: 1.0,
  maxHandY: 0.0
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
    alert('Webcam permission denied or camera not found. Steering falls back to Mouse/Touch vertical controls.');
    
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
let backgroundMode = 'arena'; // 'arena' | 'camera'
let bgModeLabel = { innerText: '' }; // Mock label if not in Pong html, but we bind it
function toggleBackground() {
  if (backgroundMode === 'arena') {
    backgroundMode = 'camera';
  } else {
    backgroundMode = 'arena';
  }
}
btnToggleBg.addEventListener('click', toggleBackground);

// ----------------------------------------------------
// Particle System for Splatters
// ----------------------------------------------------
class SparkParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = (Math.random() * Math.PI / 2) - Math.PI / 4; // directed horizontal spread
    const speed = 2.0 + Math.random() * 6.0;
    this.vx = Math.cos(angle) * speed;
    this.vy = (Math.random() - 0.5) * 4.0;
    
    this.r = 1.0 + Math.random() * 3.5;
    this.alpha = 1.0;
    this.decay = 0.02 + Math.random() * 0.03;
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
    gCtx.shadowBlur = 10;
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
let scoreP1 = 0;
let scoreP2 = 0;
let particles = [];

const paddle1 = {
  x: 40,
  y: 0,
  w: 16,
  h: 120,
  pulseTimer: 0,
  color: '#ff00cc'
};

const paddle2 = {
  x: 0, // reassigned in resize
  y: 0,
  w: 16,
  h: 120,
  pulseTimer: 0,
  color: '#00e5ff'
};

const ball = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  r: 10,
  baseSpeed: 7.5,
  speedMultiplier: 1.0,
  trail: []
};

// Screen Shake variables
let shakeTimer = 0;
let shakeIntensity = 0;
function triggerScreenShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
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

function handleBallPhysics() {
  ball.x += ball.vx;
  ball.y += ball.vy;
  
  // Keep trail coordinates
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 10) ball.trail.shift();
  
  // Top/bottom wall bounce
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = -ball.vy;
    sounds.playWallBounce();
    triggerScreenShake(3, 8);
  } else if (ball.y + ball.r > canvas.height) {
    ball.y = canvas.height - ball.r;
    ball.vy = -ball.vy;
    sounds.playWallBounce();
    triggerScreenShake(3, 8);
  }
  
  // Left side out of bounds (P2 Scores)
  if (ball.x - ball.r < 0) {
    scoreP2++;
    updateScoreUI();
    sounds.playScorePoint();
    triggerScreenShake(12, 20);
    
    if (scoreP2 >= 11) {
      triggerGameOver();
      return;
    }
    
    triggerAnnouncement(is2PlayerMode ? 'P2 SCORE!' : 'AI SCORE!', 60);
    resetBall(1); // Serve towards P1
  } 
  // Right side out of bounds (P1 Scores)
  else if (ball.x + ball.r > canvas.width) {
    scoreP1++;
    updateScoreUI();
    sounds.playScorePoint();
    triggerScreenShake(12, 20);
    
    if (scoreP1 >= 11) {
      triggerGameOver();
      return;
    }
    
    triggerAnnouncement('P1 SCORE!', 60);
    resetBall(-1); // Serve towards P2
  }
  
  // Paddle 1 (Left) Collision Check
  if (rectBallIntersect(paddle1, ball) && ball.vx < 0) {
    const relativeY = (paddle1.y + paddle1.h / 2) - ball.y;
    const normalizedIntersect = relativeY / (paddle1.h / 2);
    const bounceAngle = normalizedIntersect * (Math.PI / 3); // Max 60 deg angle
    
    const speed = ball.baseSpeed * ball.speedMultiplier;
    ball.vx = speed * Math.cos(bounceAngle);
    ball.vy = -speed * Math.sin(bounceAngle);
    
    // Position ball outside paddle bounds to avoid sticky frames
    ball.x = paddle1.x + paddle1.w + ball.r;
    
    sounds.playPaddleBounce();
    paddle1.pulseTimer = 8;
    triggerScreenShake(6, 12);
    
    // Spawn spark particles directed rightward
    for (let p = 0; p < 10; p++) {
      const spark = new SparkParticle(ball.x, ball.y, paddle1.color);
      particles.push(spark);
    }
    
    ball.speedMultiplier = Math.min(2.0, ball.speedMultiplier + 0.06);
  }
  
  // Paddle 2 (Right) Collision Check
  if (rectBallIntersect(paddle2, ball) && ball.vx > 0) {
    const relativeY = (paddle2.y + paddle2.h / 2) - ball.y;
    const normalizedIntersect = relativeY / (paddle2.h / 2);
    const bounceAngle = normalizedIntersect * (Math.PI / 3);
    
    const speed = ball.baseSpeed * ball.speedMultiplier;
    ball.vx = -speed * Math.cos(bounceAngle);
    ball.vy = -speed * Math.sin(bounceAngle);
    
    ball.x = paddle2.x - ball.r;
    
    sounds.playPaddleBounce();
    paddle2.pulseTimer = 8;
    triggerScreenShake(6, 12);
    
    // Spawn spark particles directed leftward
    for (let p = 0; p < 10; p++) {
      const spark = new SparkParticle(ball.x, ball.y, paddle2.color);
      spark.vx *= -1; // flip direction to fly leftwards
      particles.push(spark);
    }
    
    ball.speedMultiplier = Math.min(2.0, ball.speedMultiplier + 0.06);
  }
}

function handleAI() {
  if (is2PlayerMode) return;
  
  // AI controls Paddle 2 (Smooth vertical tracking of the ball)
  const targetY = ball.y - paddle2.h / 2;
  const dy = targetY - paddle2.y;
  
  // Limit AI movement speed slightly to keep game play balanced
  const aiSpeedLimit = 5.2 + Math.min(ball.speedMultiplier * 2.0, 7.0);
  paddle2.y += Math.max(-aiSpeedLimit, Math.min(aiSpeedLimit, dy * 0.12));
  
  // Boundaries
  if (paddle2.y < 0) paddle2.y = 0;
  if (paddle2.y + paddle2.h > canvas.height) paddle2.y = canvas.height - paddle2.h;
}

function resetBall(direction = 1) {
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  ball.trail = [];
  
  const angle = (Math.random() - 0.5) * (Math.PI / 4); // narrow launch cone
  ball.vx = direction * ball.baseSpeed * Math.cos(angle);
  ball.vy = ball.baseSpeed * Math.sin(angle);
  ball.speedMultiplier = 1.0;
}

function updateScoreUI() {
  p1ScoreVal.innerText = scoreP1;
  p2ScoreVal.innerText = scoreP2;
}

function triggerGameOver() {
  currentGameState = GAME_STATE.GAMEOVER;
  gameoverOverlay.style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  btnToggleBg.style.display = 'none';
  
  const title = document.getElementById('go-title');
  const desc = document.getElementById('go-desc');
  const scoreText = document.getElementById('go-score');
  
  scoreText.innerText = `FINAL SCORE: ${scoreP1} - ${scoreP2}`;
  
  if (!is2PlayerMode) {
    if (scoreP1 > scoreP2) {
      title.innerText = 'VICTORY';
      title.style.color = '#ff00cc';
      title.style.textShadow = '0 0 25px rgba(255, 0, 204, 0.7)';
      desc.innerText = 'You dominated the AI and claimed the cyber grid.';
      sounds.playVictory();
      saveHighScore(scoreP1);
    } else {
      title.innerText = 'DEFEATED';
      title.style.color = '#00e5ff';
      title.style.textShadow = '0 0 25px rgba(0, 229, 255, 0.7)';
      desc.innerText = 'The cybernetic intelligence outplayed you this cycles.';
      sounds.playDefeat();
    }
  } else {
    const winner = scoreP1 > scoreP2 ? 'PLAYER 1' : 'PLAYER 2';
    title.innerText = `${winner} WINS`;
    title.style.color = scoreP1 > scoreP2 ? '#ff00cc' : '#00e5ff';
    title.style.textShadow = scoreP1 > scoreP2 ? '0 0 25px rgba(255, 0, 204, 0.7)' : '0 0 25px rgba(0, 229, 255, 0.7)';
    desc.innerText = `Local split-arena match concluded. Winner: ${winner}.`;
    sounds.playVictory();
    saveHighScore(Math.max(scoreP1, scoreP2));
  }
  
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
  scoreP1 = 0;
  scoreP2 = 0;
  particles = [];
  
  updateScoreUI();
  resizeCanvas();
  
  paddle1.y = canvas.height / 2 - paddle1.h / 2;
  paddle2.y = canvas.height / 2 - paddle2.h / 2;
  
  resetBall(Math.random() > 0.5 ? 1 : -1);
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('ARENA INITIATED!', 80);
}

function triggerAnnouncement(txt, duration = 80) {
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
  dbgMediapipe.style.color = dbg.mediaPipeLoaded ? '#ff00cc' : '#00e5ff';
  
  const handList = window.MovementController.handLandmarksList || [];
  dbgHandsCount.innerText = handList.length;
  
  // Set bottom-left sensor indicator light
  indHandActive.className = `indicator-dot ${handList.length > 0 ? 'active' : ''}`;
  indHandText.innerText = handList.length > 0 ? `${handList.length} HAND(S) DETECTED` : 'TRACKING IDLE';
  
  if (statHandSignal) {
    const connected = dbg.mediaPipeLoaded && handList.length > 0;
    statHandSignal.innerText = connected ? 'ACTIVE' : 'WAITING';
    statHandSignal.className = `status-value ${connected ? 'val-true' : 'val-false'}`;
  }
  
  let targetY1 = null;
  let targetY2 = null;
  
  if (handList.length > 0) {
    lastInputType = 'hand';
    
    // Sort hands by X coordinate: Leftmost hand first
    // In mirrored webcam: palmNode.x is larger for left of webcam (which matches right of screen)
    // Let's sort based on screen coordinates: (1.0 - palmNode.x)
    const sortedHands = [...handList].sort((a, b) => {
      return (1.0 - a[9].x) - (1.0 - b[9].x);
    });
    
    if (!is2PlayerMode) {
      // Single Player: leftmost tracked hand governs Left Paddle
      const mainHand = sortedHands[0];
      targetY1 = mainHand[9].y * canvas.height;
      dbgHand1Y.innerText = targetY1.toFixed(0);
      dbgHand2Y.innerText = 'n/a';
    } else {
      // 2-Player: sorted[0] controls Left paddle, sorted[1] controls Right paddle (if present)
      const leftHand = sortedHands[0];
      targetY1 = leftHand[9].y * canvas.height;
      dbgHand1Y.innerText = targetY1.toFixed(0);
      
      if (sortedHands.length >= 2) {
        const rightHand = sortedHands[1];
        targetY2 = rightHand[9].y * canvas.height;
        dbgHand2Y.innerText = targetY2.toFixed(0);
      } else {
        dbgHand2Y.innerText = 'lost';
      }
    }
    
    // Calibration Step logic
    if (currentGameState === GAME_STATE.CALIBRATING && onboarding.currentStep === 3) {
      // Record vertical sweep span
      const mainHand = handList[0];
      onboarding.minHandY = Math.min(onboarding.minHandY, mainHand[9].y);
      onboarding.maxHandY = Math.max(onboarding.maxHandY, mainHand[9].y);
      const span = onboarding.maxHandY - onboarding.minHandY;
      
      const spanPercent = Math.min((span / 0.4) * 100, 100);
      document.getElementById('step-3-progress').style.width = `${spanPercent}%`;
      
      if (span >= 0.4) {
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
    targetY1 = pointer.y1;
    targetY2 = pointer.y2;
    dbgHand1Y.innerText = 'mouse';
    dbgHand2Y.innerText = is2PlayerMode ? 'mouse' : 'n/a';
  } else {
    dbgHand1Y.innerText = 'lost';
    dbgHand2Y.innerText = 'lost';
  }
  
  // Smoothly interpolate paddles locations
  if (targetY1 !== null) {
    paddle1.y += (targetY1 - paddle1.h / 2 - paddle1.y) * 0.22;
  }
  if (is2PlayerMode && targetY2 !== null) {
    paddle2.y += (targetY2 - paddle2.h / 2 - paddle2.y) * 0.22;
  }
  
  // Boundary constraints
  if (paddle1.y < 0) paddle1.y = 0;
  if (paddle1.y + paddle1.h > canvas.height) paddle1.y = canvas.height - paddle1.h;
  
  if (paddle2.y < 0) paddle2.y = 0;
  if (paddle2.y + paddle2.h > canvas.height) paddle2.y = canvas.height - paddle2.h;
  
  dbgBallSpeed.innerText = (ball.baseSpeed * ball.speedMultiplier).toFixed(1);
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
  calCtx.strokeStyle = 'rgba(255, 0, 204, 0.2)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);
  
  // Corners
  const corner = 12;
  calCtx.strokeStyle = '#ff00cc';
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
        
        calCtx.strokeStyle = 'rgba(255, 0, 204, 0.8)';
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
        
        // Draw key knuckle node
        const knuckle = landmarks[9];
        calCtx.fillStyle = '#00e5ff';
        calCtx.beginPath();
        calCtx.arc((1 - knuckle.x) * w, knuckle.y * h, 5, 0, Math.PI * 2);
        calCtx.fill();
      }
    });
  }
}

// ----------------------------------------------------
// Main Render loop
// ----------------------------------------------------
let lastTime = performance.now();
let frames = 0;
let fps = 60;

function drawGameArena() {
  ctx.save();
  
  // Handle Screen Shake
  if (shakeTimer > 0) {
    const dx = (Math.random() - 0.5) * shakeIntensity;
    const dy = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(dx, dy);
    shakeTimer--;
  }
  
  // Background Mode Rendering
  if (backgroundMode === 'camera' && webcamView.srcObject) {
    // Render camera overlay back-stretched
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    ctx.fillStyle = 'rgba(5, 5, 5, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // Solid retro black arena
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Draw Center Net Dash Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 4;
  ctx.setLineDash([15, 15]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]); // reset
  
  // Draw Ball Trail (glowing tails)
  if (ball.trail.length > 1) {
    for (let i = 0; i < ball.trail.length - 1; i++) {
      const p1 = ball.trail[i];
      const p2 = ball.trail[i + 1];
      const alpha = (i / ball.trail.length) * 0.35;
      
      ctx.save();
      ctx.strokeStyle = `rgba(255, 0, 204, ${alpha})`;
      ctx.lineWidth = ball.r * (i / ball.trail.length) * 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  
  // Draw Ball
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#ff00cc';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  // Draw Paddle 1 (Left Player)
  ctx.save();
  let p1W = paddle1.w;
  if (paddle1.pulseTimer > 0) {
    p1W += paddle1.pulseTimer * 1.2;
    paddle1.pulseTimer--;
  }
  ctx.fillStyle = paddle1.color;
  ctx.shadowBlur = 20;
  ctx.shadowColor = paddle1.color;
  ctx.fillRect(paddle1.x, paddle1.y, p1W, paddle1.h);
  
  // Paddle border details
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(paddle1.x, paddle1.y, p1W, paddle1.h);
  ctx.restore();
  
  // Draw Paddle 2 (Right Player/AI)
  ctx.save();
  let p2W = paddle2.w;
  if (paddle2.pulseTimer > 0) {
    p2W += paddle2.pulseTimer * 1.2;
    paddle2.pulseTimer--;
  }
  ctx.fillStyle = paddle2.color;
  ctx.shadowBlur = 20;
  ctx.shadowColor = paddle2.color;
  // Offset position if pulsed to scale outwards from right edge
  const pulseOffset = p2W - paddle2.w;
  ctx.fillRect(paddle2.x - pulseOffset, paddle2.y, p2W, paddle2.h);
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(paddle2.x - pulseOffset, paddle2.y, p2W, paddle2.h);
  ctx.restore();
  
  // Draw particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    } else {
      p.draw(ctx);
    }
  }
  
  ctx.restore();
}

function gameLoop() {
  frames++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = frames;
    frames = 0;
    lastTime = now;
    dbgFps.innerText = fps;
  }
  
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateInputControls();
    drawCalibrationOverlay();
  } else if (currentGameState === GAME_STATE.PLAYING) {
    updateInputControls();
    handleBallPhysics();
    handleAI();
    drawGameArena();
  }
  
  requestAnimationFrame(gameLoop);
}

// Start Loop
requestAnimationFrame(gameLoop);
