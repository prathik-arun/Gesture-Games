// Laser Pinch Game Logic + Hand Controller Tracking

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const livesDisplay = document.getElementById('lives-display');
const hudScore = document.getElementById('hud-score');
const hudHighscore = document.getElementById('hud-highscore');
const announcement = document.getElementById('announcement');
const btnToggleBg = document.getElementById('btn-toggle-bg');

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
const statPinch = document.getElementById('stat-pinch');

// Debug Panel Elements
const dbgMediapipe = document.getElementById('dbg-mediapipe');
const dbgHandCenter = document.getElementById('dbg-hand-center');
const dbgPinchDist = document.getElementById('dbg-pinch-dist');
const dbgPinching = document.getElementById('dbg-pinching');
const dbgDebris = document.getElementById('dbg-debris');
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
    const raw = localStorage.getItem('laser_pinch_scores');
    highScores = raw ? JSON.parse(raw) : [{ name: 'System', score: 1000 }];
  } catch (e) {
    highScores = [{ name: 'System', score: 1000 }];
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
  localStorage.setItem('laser_pinch_scores', JSON.stringify(highScores));
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
      row.innerHTML = `<span class="rank">${idx + 1}. ${s.name || 'Zapper'}</span> <span class="score">${String(s.score).padStart(5, '0')}</span>`;
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
  playLaser() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.start();
    osc.stop(now + 0.15);
  }
  playExplosion() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    // Low frequency sine rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    osc.start();
    osc.stop(now + 0.25);

    // Noise buffer for blast hiss
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.15);
  }
  playBreach() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(120, now + 0.12);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc.start();
    osc.stop(now + 0.35);
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
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(20, now + 0.5);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    
    osc.start();
    osc.stop(now + 0.55);
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Mouse, Touch & Click controls
// ----------------------------------------------------
let lastInputType = 'mouse';
const pointer = { x: canvas.width / 2, y: canvas.height / 2, fireRequested: false };

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
  lastInputType = 'mouse';
});

window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.touches[0].clientX - rect.left;
    pointer.y = e.touches[0].clientY - rect.top;
    lastInputType = 'mouse';
  }
});

window.addEventListener('mousedown', () => {
  if (currentGameState === GAME_STATE.PLAYING) {
    pointer.fireRequested = true;
    lastInputType = 'mouse';
  }
});

window.addEventListener('touchstart', (e) => {
  if (currentGameState === GAME_STATE.PLAYING && e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.touches[0].clientX - rect.left;
    pointer.y = e.touches[0].clientY - rect.top;
    pointer.fireRequested = true;
    lastInputType = 'mouse';
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
  pinchCount: 0,
  lastPinchState: false
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
    alert('Webcam permission denied or camera not found. Firing lasers falls back to Click / Tap.');
    
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
let backgroundMode = 'space'; // 'space' | 'camera'
function toggleBackground() {
  if (backgroundMode === 'space') {
    backgroundMode = 'camera';
  } else {
    backgroundMode = 'space';
  }
}

// ----------------------------------------------------
// Space Backdrop & Star Systems
// ----------------------------------------------------
const stars = [];
const starCount = 120;
for (let i = 0; i < starCount; i++) {
  stars.push({
    x: Math.random(), // normalized coords
    y: Math.random(),
    size: Math.random() * 1.8 + 0.5,
    speed: Math.random() * 0.4 + 0.1,
    pulse: Math.random() * Math.PI,
    pulseSpeed: 0.01 + Math.random() * 0.02
  });
}

function updateStars() {
  stars.forEach(s => {
    s.y += s.speed * 0.002;
    s.pulse += s.pulseSpeed;
    if (s.y > 1.0) {
      s.y = 0;
      s.x = Math.random();
    }
  });
}

// ----------------------------------------------------
// Particle Systems (Explosions & Lasers)
// ----------------------------------------------------
class DebrisParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5.0;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.r = 1.2 + Math.random() * 3.5;
    this.alpha = 1.0;
    this.decay = 0.025 + Math.random() * 0.025;
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
let shields = 3;
let level = 1;
let comboMultiplier = 1;
let laserCooldown = 0;
let lastLaserBeam = null; // Store visual frame of laser beam

const crosshair = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  r: 18,
  glow: 0
};

let debrisList = [];
let particles = [];

// Screen Shake variables
let shakeTimer = 0;
let shakeIntensity = 0;
function triggerScreenShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
}

// Target Spawning
let nextSpawnTimer = 0;
function spawnDebris() {
  const minRadius = 15;
  const maxRadius = 38;
  const radius = minRadius + Math.random() * (maxRadius - minRadius);
  const x = radius + Math.random() * (canvas.width - radius * 2);
  
  // Point scale by size (smaller targets = more points)
  const pointsVal = Math.round((maxRadius - radius) * 1.5) + 15;
  
  // Speed escalates with levels
  const speed = 1.5 + Math.random() * 2.2 + (level - 1) * 0.4;
  
  // Retro vaporwave colors
  const colors = ['#ff0055', '#f39c12', '#ffd700', '#9b59b6', '#ff00ff'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  debrisList.push({
    x: x,
    y: -radius,
    r: radius,
    vx: (Math.random() - 0.5) * 0.8,
    vy: speed,
    color: color,
    points: pointsVal,
    pulse: Math.random() * Math.PI
  });
}

function handleDebrisPhysics() {
  // Spawning logic
  nextSpawnTimer--;
  if (nextSpawnTimer <= 0) {
    spawnDebris();
    // Decrease spawn intervals as level advances
    const baseInterval = Math.max(35, 90 - level * 10);
    nextSpawnTimer = baseInterval + Math.random() * 40;
  }
  
  // Update targets position
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const deb = debrisList[i];
    deb.x += deb.vx;
    deb.y += deb.vy;
    deb.pulse += 0.05;
    
    // Wall bounce horizontally
    if (deb.x - deb.r < 0) {
      deb.x = deb.r;
      deb.vx = -deb.vx;
    } else if (deb.x + deb.r > canvas.width) {
      deb.x = canvas.width - deb.r;
      deb.vx = -deb.vx;
    }
    
    // Bottom breach check
    if (deb.y - deb.r > canvas.height) {
      debrisList.splice(i, 1);
      shields--;
      comboMultiplier = 1;
      updateShieldsUI();
      sounds.playBreach();
      triggerScreenShake(18, 25);
      
      // Flash red alert overlay (triggered via canvas draw)
      redAlertFlash = 12;
      
      if (shields <= 0) {
        triggerGameOver();
        return;
      }
    }
  }
}

let redAlertFlash = 0;

function fireLaser(tx, ty) {
  sounds.playLaser();
  crosshair.glow = 12;
  
  // Visual representation of the laser line
  lastLaserBeam = {
    x1: canvas.width / 2, // originates bottom center turret
    y1: canvas.height - 10,
    x2: tx,
    y2: ty,
    life: 6 // active frame count
  };
  
  // Check targeting collisions
  let hit = false;
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const deb = debrisList[i];
    const dx = tx - deb.x;
    const dy = ty - deb.y;
    const distSq = dx * dx + dy * dy;
    
    // Direct hit check (inside radius)
    if (distSq < (deb.r + 12) * (deb.r + 12)) {
      hit = true;
      
      // Calculate score with combo multiplier
      const earned = deb.points * comboMultiplier;
      score += earned;
      hudScore.innerText = String(score).padStart(5, '0');
      
      sounds.playExplosion();
      triggerScreenShake(8, 14);
      
      // Create splatter particles
      for (let p = 0; p < 15; p++) {
        particles.push(new DebrisParticle(deb.x, deb.y, deb.color));
      }
      
      debrisList.splice(i, 1);
      comboMultiplier = Math.min(5, comboMultiplier + 1);
      
      // Level progression check
      if (score > level * 1000) {
        level++;
        triggerAnnouncement(`LEVEL ${level}!`, 80);
      }
      break; // Single blast zaps single object
    }
  }
  
  if (!hit) {
    comboMultiplier = 1; // Miss breaks combo chain
  }
}

function updateShieldsUI() {
  if (livesDisplay) {
    let text = '';
    for (let i = 0; i < 3; i++) {
      if (i < shields) text += '❤️';
      else text += '🖤';
    }
    livesDisplay.innerText = text;
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
  
  sounds.playOut();
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
  shields = 3;
  level = 1;
  comboMultiplier = 1;
  debrisList = [];
  particles = [];
  redAlertFlash = 0;
  
  hudScore.innerText = '00000';
  updateShieldsUI();
  resizeCanvas();
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('DEBRIS GRID ACTIVE!', 90);
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
let lastRawPinch = false;

function updateInputControls() {
  const dbg = window.MovementController.getDebugInfo();
  
  // Update MediaPipe loading state
  dbgMediapipe.innerText = dbg.mediaPipeLoaded ? 'loaded' : 'loading';
  dbgMediapipe.style.color = dbg.mediaPipeLoaded ? '#00e5ff' : '#ff0055';
  
  const handList = window.MovementController.handLandmarksList || [];
  
  // Set bottom-left sensor preview indicator lights
  indHandActive.className = `indicator-dot ${handList.length > 0 ? 'active' : ''}`;
  indHandText.innerText = handList.length > 0 ? 'HAND SENSOR ACTIVE' : 'TRACKING IDLE';
  
  if (statHandSignal) {
    const connected = dbg.mediaPipeLoaded && handList.length > 0;
    statHandSignal.innerText = connected ? 'ACTIVE' : 'WAITING';
    statHandSignal.className = `status-value ${connected ? 'val-true' : 'val-false'}`;
  }
  
  let targetX = null;
  let targetY = null;
  let isPinching = false;
  
  if (handList.length > 0) {
    lastInputType = 'hand';
    const mainHand = handList[0];
    
    // Landmark 9: Middle knuckle (center palm node)
    const palmNode = mainHand[9];
    
    // Scale X mirror layout
    targetX = (1 - palmNode.x) * canvas.width;
    targetY = palmNode.y * canvas.height;
    
    dbgHandCenter.innerText = `${targetX.toFixed(0)}, ${targetY.toFixed(0)}`;
    
    // Get pinch state
    isPinching = window.MovementController.isPinching;
    dbgPinchDist.innerText = window.MovementController.pinchDistance.toFixed(2);
    dbgPinching.innerText = isPinching ? 'true' : 'false';
    dbgPinching.style.color = isPinching ? '#00e5ff' : '#666';
    
    // Calibration Step logic
    if (currentGameState === GAME_STATE.CALIBRATING && onboarding.currentStep === 3) {
      statPinch.innerText = isPinching ? 'PINCHED!' : 'NO PINCH';
      statPinch.className = `status-value ${isPinching ? 'val-true' : 'val-false'}`;
      
      // Check edge transition
      if (isPinching && !onboarding.lastPinchState) {
        onboarding.pinchCount++;
        const percent = Math.min((onboarding.pinchCount / 3) * 100, 100);
        document.getElementById('step-3-progress').style.width = `${percent}%`;
        
        if (onboarding.pinchCount >= 3) {
          onboarding.completedSteps[3] = true;
          const stepEl = document.getElementById('step-3');
          stepEl.classList.remove('active');
          stepEl.classList.add('completed');
          
          btnStartGame.removeAttribute('disabled');
          btnStartGame.focus();
        }
      }
      onboarding.lastPinchState = isPinching;
    }
  } else if (lastInputType === 'mouse') {
    targetX = pointer.x;
    targetY = pointer.y;
    isPinching = pointer.fireRequested;
    pointer.fireRequested = false; // consume trigger
    dbgHandCenter.innerText = 'mouse';
    dbgPinchDist.innerText = 'n/a';
    dbgPinching.innerText = isPinching ? 'CLICKED' : 'false';
  } else {
    dbgHandCenter.innerText = 'lost';
    dbgPinchDist.innerText = 'n/a';
    dbgPinching.innerText = 'lost';
  }
  
  // Smoothly interpolate crosshair
  if (targetX !== null && targetY !== null) {
    crosshair.x += (targetX - crosshair.x) * 0.22;
    crosshair.y += (targetY - crosshair.y) * 0.22;
  }
  
  // Cooldown decrement
  if (laserCooldown > 0) laserCooldown--;
  
  // Laser triggers
  if (currentGameState === GAME_STATE.PLAYING) {
    if (lastInputType === 'hand') {
      // Trigger laser on pinch edge transition (or rate-limited hold)
      if (isPinching && (!lastRawPinch || laserCooldown === 0)) {
        if (laserCooldown === 0) {
          fireLaser(crosshair.x, crosshair.y);
          laserCooldown = 12; // 200ms at 60fps
        }
      }
      lastRawPinch = isPinching;
    } else if (lastInputType === 'mouse' && isPinching) {
      if (laserCooldown === 0) {
        fireLaser(crosshair.x, crosshair.y);
        laserCooldown = 10;
      }
    }
  }
  
  dbgDebris.innerText = debrisList.length;
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
        
        // Highlight index & thumb tips to help user see pinch alignment
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        if (thumbTip && indexTip) {
          calCtx.fillStyle = '#ff0055';
          calCtx.beginPath();
          calCtx.arc((1 - thumbTip.x) * w, thumbTip.y * h, 4, 0, Math.PI * 2);
          calCtx.arc((1 - indexTip.x) * w, indexTip.y * h, 4, 0, Math.PI * 2);
          calCtx.fill();
        }
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
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    ctx.fillStyle = 'rgba(2, 2, 5, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // Solid retro stars space
    ctx.fillStyle = '#030307';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw pulsing backdrop stars
    stars.forEach(s => {
      const alpha = 0.35 + Math.sin(s.pulse) * 0.25;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x * canvas.width, s.y * canvas.height, s.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw space vector grid lines converging at bottom center
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.03)';
    ctx.lineWidth = 0.5;
    const gridLines = 20;
    const turretX = canvas.width / 2;
    const turretY = canvas.height - 10;
    for (let i = 0; i <= gridLines; i++) {
      const startX = (i / gridLines) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(turretX, turretY);
      ctx.stroke();
    }
  }
  
  // Red Alert Flash (on shield damage)
  if (redAlertFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 85, ${redAlertFlash * 0.025})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    redAlertFlash--;
  }
  
  // Draw Falling Debris
  debrisList.forEach(deb => {
    ctx.save();
    ctx.fillStyle = deb.color;
    ctx.shadowBlur = 10 + Math.sin(deb.pulse) * 4;
    ctx.shadowColor = deb.color;
    
    // Draw as retro wireframe decagons
    ctx.beginPath();
    const sides = 10;
    for (let side = 0; side <= sides; side++) {
      const angle = (side / sides) * Math.PI * 2 + deb.pulse * 0.2;
      const lx = deb.x + deb.r * Math.cos(angle);
      const ly = deb.y + deb.r * Math.sin(angle);
      if (side === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.closePath();
    ctx.fill();
    
    // Draw central neon cores
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(deb.x, deb.y, deb.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
  
  // Draw Active Laser Beam lines
  if (lastLaserBeam && lastLaserBeam.life > 0) {
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00e5ff';
    
    // Thick inner laser core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5 * (lastLaserBeam.life / 6);
    ctx.beginPath();
    ctx.moveTo(lastLaserBeam.x1, lastLaserBeam.y1);
    ctx.lineTo(lastLaserBeam.x2, lastLaserBeam.y2);
    ctx.stroke();
    
    // Outer glowing border
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.lineWidth = 10.0 * (lastLaserBeam.life / 6);
    ctx.stroke();
    
    // Impact spark circles at target
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lastLaserBeam.x2, lastLaserBeam.y2, 12 * (lastLaserBeam.life / 6), 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    lastLaserBeam.life--;
  }
  
  // Draw Bottom Weapon Turret
  ctx.save();
  ctx.fillStyle = '#0a0a14';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00e5ff';
  
  // Semi-circle console base
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height, 42, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  
  // Directed gun barrel pointing to crosshair
  const dx = crosshair.x - canvas.width / 2;
  const dy = crosshair.y - canvas.height;
  const angle = Math.atan2(dy, dx);
  
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height);
  ctx.rotate(angle);
  ctx.fillStyle = '#121224';
  ctx.fillRect(0, -6, 50, 12);
  ctx.strokeRect(0, -6, 50, 12);
  ctx.restore();
  
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
  
  // Draw Retro targeting Crosshair
  ctx.save();
  ctx.strokeStyle = '#ff0055';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 10 + crosshair.glow * 1.5;
  ctx.shadowColor = '#ff0055';
  if (crosshair.glow > 0) {
    crosshair.glow--;
  }
  
  // Ring
  ctx.beginPath();
  ctx.arc(crosshair.x, crosshair.y, crosshair.r, 0, Math.PI * 2);
  ctx.stroke();
  
  // Center dot
  ctx.fillStyle = '#ff0055';
  ctx.beginPath();
  ctx.arc(crosshair.x, crosshair.y, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Outer pointer lines
  const len = 6;
  const gap = 8;
  ctx.beginPath();
  ctx.moveTo(crosshair.x, crosshair.y - gap); ctx.lineTo(crosshair.x, crosshair.y - gap - len);
  ctx.moveTo(crosshair.x, crosshair.y + gap); ctx.lineTo(crosshair.x, crosshair.y + gap + len);
  ctx.moveTo(crosshair.x - gap, crosshair.y); ctx.lineTo(crosshair.x - gap - len, crosshair.y);
  ctx.moveTo(crosshair.x + gap, crosshair.y); ctx.lineTo(crosshair.x + gap + len, crosshair.y);
  ctx.stroke();
  
  // Draw Combo Streak Badge if multiplier > 1
  if (comboMultiplier > 1) {
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffd700';
    ctx.fillText(`${comboMultiplier}X COMBO`, crosshair.x - 30, crosshair.y - 25);
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
    updateStars();
    updateInputControls();
    handleDebrisPhysics();
    drawGameArena();
  }
  
  requestAnimationFrame(gameLoop);
}

// Start Loop
requestAnimationFrame(gameLoop);
