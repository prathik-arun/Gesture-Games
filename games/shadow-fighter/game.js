// Shadow Fighter Game Logic + Full-Body Shadow Boxing Controls

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const shieldFill = document.getElementById('shield-fill');
const opponentFill = document.getElementById('opponent-fill');
const hudScore = document.getElementById('hud-score');
const announcement = document.getElementById('announcement');
const combatWarning = document.getElementById('combat-warning');
const playerActionLabel = document.getElementById('player-action-label');
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
const statVoiceSignal = document.getElementById('stat-voice-signal');

const indCalibPunch = document.getElementById('ind-calib-punch');
const indCalibBlock = document.getElementById('ind-calib-block');

// Debug Panels
const dbgAudio = document.getElementById('dbg-audio');
const dbgSpeech = document.getElementById('dbg-speech');
const dbgLhSpeed = document.getElementById('dbg-lh-speed');
const dbgRhSpeed = document.getElementById('dbg-rh-speed');
const dbgLean = document.getElementById('dbg-lean');
const dbgAction = document.getElementById('dbg-action');
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
    const raw = localStorage.getItem('shadow_fighter_scores');
    highScores = raw ? JSON.parse(raw) : [2000, 1000, 500];
  } catch (e) {
    highScores = [2000, 1000, 500];
  }
  highScores.sort((a, b) => b - a);
}
function saveHighScore(score) {
  highScores.push(score);
  highScores.sort((a, b) => b - a);
  highScores = highScores.slice(0, 5);
  localStorage.setItem('shadow_fighter_scores', JSON.stringify(highScores));
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
  playWhoosh() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.start();
    osc.stop(now + 0.15);
  }
  playHit() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Sawtooth impact rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(30, now + 0.2);
    
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.start();
    osc.stop(now + 0.2);

    // Thumping noise splash
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.08);
  }
  playBlock() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.linearRampToValueAtTime(523.25, now + 0.2); // C5 ring
    
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    osc.start();
    osc.stop(now + 0.25);
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
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      
      gain.gain.setValueAtTime(0.15, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Keyboard Controls (Fallback)
// ----------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  
  if (currentGameState === GAME_STATE.PLAYING) {
    if (k === ' ') { // Punch trigger
      triggerPlayerPunch('left');
    }
    if (k === 'b') { // Block trigger
      playerStance = 'BLOCKING';
    }
    if (k === 'k') { // Kick trigger
      triggerPlayerKick();
    }
  }
  
  if (k === 'c') {
    toggleBackground();
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (currentGameState === GAME_STATE.PLAYING && k === 'b') {
    playerStance = 'STANCE';
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
  testedPunch: false,
  testedBlock: false
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
    alert('Webcam permission denied. Falling back to keyboard handles.');
    
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
  console.log('[Game] Stand-still optical flow noise calibration...');
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
  } else {
    backgroundMode = 'dojo';
  }
}
btnToggleBg.addEventListener('click', toggleBackground);

// ----------------------------------------------------
// Splatter Particle System
// ----------------------------------------------------
class SparkParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.0 + Math.random() * 6.0;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 1.0;
    
    this.r = 2 + Math.random() * 5;
    this.alpha = 1.0;
    this.decay = 0.02 + Math.random() * 0.02;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.08; // slight gravity
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

class FloaterText {
  constructor(txt, x, y, color = '#ffffff') {
    this.txt = txt;
    this.x = x;
    this.y = y;
    this.vy = -1.5;
    this.color = color;
    this.alpha = 1.0;
  }
  update() {
    this.y += this.vy;
    this.alpha -= 0.02;
  }
  draw(gCtx) {
    gCtx.save();
    gCtx.fillStyle = this.color;
    gCtx.globalAlpha = this.alpha;
    gCtx.font = '800 1.5rem Outfit';
    gCtx.textAlign = 'center';
    gCtx.shadowBlur = 10;
    gCtx.shadowColor = this.color;
    gCtx.fillText(this.txt, this.x, this.y);
    gCtx.restore();
  }
}

// Screen Shake variables
let shakeTimer = 0;
let shakeIntensity = 0;
function triggerScreenShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
}

// ----------------------------------------------------
// Opponent Sackboy Puppet Definition (Spring physics)
// ----------------------------------------------------
const puppet = {
  // Base coordinates
  baseX: 0,
  baseY: 0,
  
  // Pivot angular properties for spring physics
  angle: 0,
  angularVelocity: 0,
  springK: 0.07,
  damping: 0.88,
  
  // Translation offsets (jostle physics)
  offsetX: 0,
  offsetY: 0,
  vx: 0,
  vy: 0,
  
  // Segment details
  headR: 60,
  torsoW: 85,
  torsoH: 110,
  
  // Hit damage properties
  health: 100,
  maxHealth: 100,
  
  // Combat AI properties
  isFlashing: false,
  flashTimer: 0,
  attackState: 'idle', // 'idle' | 'warning' | 'striking' | 'recovering'
  attackTimer: 0,
  attackTargetSide: 'left', // 'left' | 'right' (dodge side target)
  fistExtend: 0, // 0 to 1.0 extend
  
  update() {
    // 1. Angular Spring Physics
    const restoringForce = -this.angle * this.springK;
    this.angularVelocity += restoringForce;
    this.angle += this.angularVelocity;
    this.angularVelocity *= this.damping;
    
    // 2. Linear Spring Physics (transational displacements)
    const restoringForceX = -this.offsetX * 0.1;
    const restoringForceY = -this.offsetY * 0.1;
    this.vx += restoringForceX;
    this.vy += restoringForceY;
    this.offsetX += this.vx;
    this.offsetY += this.vy;
    this.vx *= 0.85;
    this.vy *= 0.85;
    
    // Attack timers
    if (this.attackState === 'warning') {
      this.attackTimer--;
      this.isFlashing = (Math.floor(Date.now() / 150) % 2 === 0);
      if (this.attackTimer <= 0) {
        this.attackState = 'striking';
        this.attackTimer = 22; // frames to execute hook strike
        sounds.playWhoosh();
      }
    } else if (this.attackState === 'striking') {
      this.attackTimer--;
      // Fist extends forward (reaches peak at mid timer)
      const strikeProgress = (22 - this.attackTimer) / 22;
      this.fistExtend = Math.sin(strikeProgress * Math.PI);
      
      // Hook Check: deal damage at peak extend
      if (this.attackTimer === 11) {
        checkPuppetPunchDamage();
      }
      
      if (this.attackTimer <= 0) {
        this.attackState = 'recovering';
        this.attackTimer = 30; // block cooldown
        this.fistExtend = 0;
        this.isFlashing = false;
        combatWarning.classList.remove('warning-active');
      }
    } else if (this.attackState === 'recovering') {
      this.attackTimer--;
      if (this.attackTimer <= 0) {
        this.attackState = 'idle';
        this.attackTimer = 180 + Math.random() * 120; // 3-5s cooldown till next hook
      }
    } else if (this.attackState === 'idle') {
      this.attackTimer--;
      if (this.attackTimer <= 0) {
        triggerOpponentAttack();
      }
    }
  },
  
  applyHitForce(fx, fy, magnitude) {
    // Angular bounce
    this.angularVelocity += fx * magnitude * 0.05;
    // Linear thud
    this.vx += fx * magnitude * 0.8;
    this.vy += fy * magnitude * 0.8;
  },
  
  draw(gCtx) {
    gCtx.save();
    
    // Puppet base positioning
    const px = this.baseX + this.offsetX;
    const py = this.baseY + this.offsetY;
    
    gCtx.translate(px, py);
    gCtx.rotate(this.angle);
    
    // Red Flashing on warning states
    if (this.isFlashing) {
      gCtx.shadowBlur = 25;
      gCtx.shadowColor = '#e74c3c';
    }
    
    // ----------------------------------------------------
    // Draw Torso Segment (Egg-shaped blue burlap star)
    // ----------------------------------------------------
    gCtx.save();
    // Torso outline
    gCtx.strokeStyle = '#6f503c';
    gCtx.lineWidth = 4;
    gCtx.fillStyle = '#a17a5e'; // stitched brown burlap base
    gCtx.beginPath();
    gCtx.ellipse(0, 45, this.torsoW, this.torsoH, 0, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.stroke();
    
    // Blue shirt top overlay
    gCtx.fillStyle = '#3498db';
    gCtx.beginPath();
    // Clips top half of egg torso
    gCtx.ellipse(0, 45, this.torsoW - 2, this.torsoH - 2, 0, Math.PI, Math.PI * 2);
    gCtx.lineTo(this.torsoW, 45);
    gCtx.quadraticCurveTo(0, 70, -this.torsoW, 45);
    gCtx.closePath();
    gCtx.fill();
    
    // Draw stitches along blue shirt boundary
    gCtx.strokeStyle = '#ffffff';
    gCtx.lineWidth = 2.5;
    gCtx.setLineDash([4, 6]);
    gCtx.beginPath();
    gCtx.ellipse(0, 45, this.torsoW - 4, this.torsoH - 4, 0, Math.PI, Math.PI * 2);
    gCtx.stroke();
    
    gCtx.beginPath();
    gCtx.moveTo(-this.torsoW + 4, 45);
    gCtx.quadraticCurveTo(0, 70, this.torsoW - 4, 45);
    gCtx.stroke();
    gCtx.restore();
    
    // Draw Stitched White Star inside blue shirt
    gCtx.save();
    gCtx.translate(0, -10);
    gCtx.fillStyle = '#ffffff';
    gCtx.shadowBlur = 10;
    gCtx.shadowColor = '#ffffff';
    drawStar(gCtx, 0, 0, 5, 26, 12);
    gCtx.restore();
    
    // ----------------------------------------------------
    // Draw Head Segment (Round brown stitched bag)
    // ----------------------------------------------------
    gCtx.save();
    gCtx.translate(0, -this.torsoH + 25);
    
    // Head burlap outline
    gCtx.strokeStyle = '#6f503c';
    gCtx.lineWidth = 4;
    gCtx.fillStyle = '#a98263';
    gCtx.beginPath();
    gCtx.arc(0, 0, this.headR, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.stroke();
    
    // Bevel stitching line
    gCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    gCtx.lineWidth = 2;
    gCtx.setLineDash([4, 5]);
    gCtx.beginPath();
    gCtx.arc(0, 0, this.headR - 8, 0, Math.PI * 2);
    gCtx.stroke();
    gCtx.setLineDash([]);
    
    // Stitched mouth
    gCtx.strokeStyle = '#4e3321';
    gCtx.lineWidth = 3.5;
    gCtx.lineCap = 'round';
    gCtx.setLineDash([2, 4]);
    gCtx.beginPath();
    gCtx.arc(0, 15, 22, 0.1 * Math.PI, 0.9 * Math.PI);
    gCtx.stroke();
    gCtx.setLineDash([]);
    
    // Button eyes
    gCtx.fillStyle = '#111111';
    // Left eye
    gCtx.beginPath(); gCtx.arc(-22, -10, 10, 0, Math.PI * 2); gCtx.fill();
    gCtx.fillStyle = '#fff';
    gCtx.beginPath(); gCtx.arc(-25, -13, 3, 0, Math.PI * 2); gCtx.fill();
    // Right eye
    gCtx.fillStyle = '#111111';
    gCtx.beginPath(); gCtx.arc(22, -10, 10, 0, Math.PI * 2); gCtx.fill();
    gCtx.fillStyle = '#fff';
    gCtx.beginPath(); gCtx.arc(19, -13, 3, 0, Math.PI * 2); gCtx.fill();
    gCtx.restore();
    
    // ----------------------------------------------------
    // Draw Neck Rope
    // ----------------------------------------------------
    gCtx.save();
    gCtx.translate(0, -this.torsoH + 35);
    gCtx.strokeStyle = '#7c6451';
    gCtx.lineWidth = 6;
    gCtx.fillStyle = '#9b8069';
    // Rope coils
    for (let i = -25; i <= 25; i += 12) {
      gCtx.beginPath();
      gCtx.arc(i, 0, 8, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.stroke();
    }
    gCtx.restore();
    
    // ----------------------------------------------------
    // Draw Legs & Shoes
    // ----------------------------------------------------
    // Left Leg
    gCtx.strokeStyle = '#6f503c';
    gCtx.lineWidth = 8;
    gCtx.beginPath();
    gCtx.moveTo(-35, 140);
    gCtx.lineTo(-45, 190);
    gCtx.stroke();
    
    // Left Foot
    gCtx.save();
    gCtx.translate(-45, 195);
    gCtx.fillStyle = '#7a5a41';
    gCtx.beginPath();
    gCtx.ellipse(0, 0, 24, 14, 0, 0, Math.PI*2);
    gCtx.fill();
    gCtx.stroke();
    gCtx.restore();
    
    // Right Leg
    gCtx.beginPath();
    gCtx.moveTo(35, 140);
    gCtx.lineTo(45, 190);
    gCtx.stroke();
    
    // Right Foot
    gCtx.save();
    gCtx.translate(45, 195);
    gCtx.fillStyle = '#7a5a41';
    gCtx.beginPath();
    gCtx.ellipse(0, 0, 24, 14, 0, 0, Math.PI*2);
    gCtx.fill();
    gCtx.stroke();
    gCtx.restore();
    
    // ----------------------------------------------------
    // Draw Normal Arms and Hands
    // ----------------------------------------------------
    // Draw Left hand
    if (this.attackState !== 'striking' || this.attackTargetSide !== 'left') {
      gCtx.strokeStyle = '#6f503c';
      gCtx.lineWidth = 6;
      gCtx.beginPath();
      gCtx.moveTo(-this.torsoW + 8, 20);
      gCtx.lineTo(-this.torsoW - 22, 50);
      gCtx.stroke();
      
      gCtx.fillStyle = '#a17a5e';
      gCtx.beginPath();
      gCtx.arc(-this.torsoW - 25, 55, 18, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.stroke();
    }
    
    // Draw Right hand
    if (this.attackState !== 'striking' || this.attackTargetSide !== 'right') {
      gCtx.strokeStyle = '#6f503c';
      gCtx.lineWidth = 6;
      gCtx.beginPath();
      gCtx.moveTo(this.torsoW - 8, 20);
      gCtx.lineTo(this.torsoW + 22, 50);
      gCtx.stroke();
      
      gCtx.fillStyle = '#a17a5e';
      gCtx.beginPath();
      gCtx.arc(this.torsoW + 25, 55, 18, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.stroke();
    }
    
    gCtx.restore(); // Restore base transform
    
    // ----------------------------------------------------
    // Draw Punch Attack Fist (reaches overlay on screen!)
    // ----------------------------------------------------
    if (this.attackState === 'striking' && this.fistExtend > 0) {
      gCtx.save();
      const startX = this.attackTargetSide === 'left' 
        ? px - this.torsoW 
        : px + this.torsoW;
      const startY = py + 20;
      
      const targetScreenX = this.attackTargetSide === 'left'
        ? canvas.width * 0.25
        : canvas.width * 0.75;
      const targetScreenY = canvas.height * 0.45;
      
      // Interpolate coordinates based on extend
      const fxCoord = startX + (targetScreenX - startX) * this.fistExtend;
      const fyCoord = startY + (targetScreenY - startY) * this.fistExtend;
      
      // Giant boxing glove style fist
      const scaleFist = 20 + 70 * this.fistExtend; // gets huge on screen!
      
      gCtx.save();
      gCtx.translate(fxCoord, fyCoord);
      gCtx.shadowBlur = 15;
      gCtx.shadowColor = '#e74c3c';
      gCtx.fillStyle = '#e74c3c'; // red boxing hook
      gCtx.strokeStyle = '#ffffff';
      gCtx.lineWidth = 3.5;
      gCtx.beginPath();
      gCtx.arc(0, 0, scaleFist, 0, Math.PI*2);
      gCtx.fill();
      gCtx.stroke();
      gCtx.restore();
      
      gCtx.restore();
    }
  }
};

// Help helper to draw clean 5 pointed star
function drawStar(gCtx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  gCtx.beginPath();
  gCtx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    gCtx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    gCtx.lineTo(x, y);
    rot += step;
  }
  gCtx.lineTo(cx, cy - outerRadius);
  gCtx.closePath();
  gCtx.fill();
}

// ----------------------------------------------------
// Opponent Attack Mechanics
// ----------------------------------------------------
function triggerOpponentAttack() {
  puppet.attackState = 'warning';
  puppet.attackTimer = 65; // reaction window frames
  puppet.attackTargetSide = Math.random() < 0.5 ? 'left' : 'right';
  
  combatWarning.innerText = 'BLOCK!';
  combatWarning.classList.add('warning-active');
  triggerAnnouncement('INCOMING HOOK!', 60);
}

function checkPuppetPunchDamage() {
  // Check if player evaded the punch hook
  let hitPlayer = true;
  
  if (playerStance === 'BLOCKING') {
    hitPlayer = false;
    sounds.playBlock();
    activeFloaters.push(new FloaterText('BLOCKED! 🛡️', canvas.width / 2, canvas.height * 0.4, '#00ffcc'));
  }
  
  if (hitPlayer) {
    playerShield = Math.max(0, playerShield - 25);
    shieldFill.style.width = `${playerShield}%`;
    triggerScreenShake(24, 32);
    sounds.playOut();
    activeFloaters.push(new FloaterText('-25 SHIELD 💥', canvas.width / 2, canvas.height * 0.4, '#ff0055'));
    
    if (playerShield <= 0) {
      triggerGameOver(false);
    }
  }
}

// ----------------------------------------------------
// Player Stances and Combat Gestures
// ----------------------------------------------------
let playerShield = 100;
let playerStance = 'STANCE'; // 'STANCE' | 'BLOCKING' | 'DODGE_LEFT' | 'DODGE_RIGHT'
let activeFloaters = [];
let score = 0;

// Coordinate speed histories to track quick punch thrusts
const handsTracker = {
  left: { history: [], lastPunchTime: 0 },
  right: { history: [], lastPunchTime: 0 }
};

function processCombatGestures(handList, dbgLean) {
  playerStance = 'STANCE';
  
  // Keyboard Block Fallback
  if (keys['b']) {
    playerStance = 'BLOCKING';
  }
  
  if (handList.length > 0) {
    const isDual = handList.length >= 2;
    
    // Left Hand (normally index 0 or classified left/right)
    const lh = handList[0];
    const rh = isDual ? handList[1] : null;
    
    // B. DEFENSIVE BLOCK: Raise both hands near face
    if (lh && rh) {
      // Calculate hand sizes to ignore small background false positives
      const lhSize = Math.sqrt((lh[0].x - lh[9].x)**2 + (lh[0].y - lh[9].y)**2);
      const rhSize = Math.sqrt((rh[0].x - rh[9].x)**2 + (rh[0].y - rh[9].y)**2);
      
      if (lhSize > 0.04 && rhSize > 0.04) {
        const dy = Math.abs(lh[9].y - rh[9].y);
        const dx = Math.abs((1 - lh[9].x) - (1 - rh[9].x));
        // Raised high, close together
        if (lh[9].y < 0.38 && rh[9].y < 0.38 && dx < 0.16) {
          playerStance = 'BLOCKING';
          
          if (currentGameState === GAME_STATE.CALIBRATING) {
            onboarding.testedBlock = true;
            indCalibBlock.classList.add('active');
          }
        }
      }
    }
    
    // C. OFFENSIVE PUNCH: Track quick speed thrusts
    trackHandPunchSpeed('left', lh);
    if (rh) {
      trackHandPunchSpeed('right', rh);
    }
  }
  
  // D. SPEECH / VOICE COMMANDS
  const spoken = window.MovementController.voiceDirection;
  if (spoken && spoken !== 'none') {
    if (spoken === 'up' || spoken === 'down') { // "kick" / "crouch" mapped commands
      triggerPlayerKick();
    }
    window.MovementController.voiceDirection = 'none'; // Consume
  }
  
  // Fallback voice commands (kick)
  const transcript = window.MovementController.voiceTranscript;
  if (transcript && transcript.includes('kick')) {
    triggerPlayerKick();
    window.MovementController.voiceTranscript = ''; // reset
  }
  
  playerActionLabel.innerText = playerStance.toUpperCase();
}

function trackHandPunchSpeed(side, hand) {
  if (!hand) return;
  const tracker = handsTracker[side];
  
  const now = Date.now();
  const indexTip = hand[8];
  
  // Mirrored screen space coordinates
  const screenX = (1 - indexTip.x) * canvas.width;
  const screenY = indexTip.y * canvas.height;
  
  tracker.history.push({ x: screenX, y: screenY, time: now });
  if (tracker.history.length > 5) {
    tracker.history.shift();
  }
  
  if (tracker.history.length < 2) return;
  
  const p1 = tracker.history[0];
  const p2 = tracker.history[tracker.history.length - 1];
  
  const dt = (p2.time - p1.time) / 1000;
  if (dt <= 0) return;
  
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  
  const speed = dist / dt; // pixels per sec
  
  if (side === 'left') {
    dbgLhSpeed.innerText = speed.toFixed(0);
  } else {
    dbgRhSpeed.innerText = speed.toFixed(0);
  }
  
  // Thrust speed threshold (e.g. 1500 pixels/sec) to register punch
  if (speed > 1650 && (now - tracker.lastPunchTime > 350)) {
    tracker.lastPunchTime = now;
    triggerPlayerPunch(side, p2.x, p2.y);
  }
}

function triggerPlayerPunch(side, hitX = null, hitY = null) {
  sounds.playWhoosh();
  
  if (currentGameState === GAME_STATE.CALIBRATING) {
    onboarding.testedPunch = true;
    indCalibPunch.classList.add('active');
    return;
  }
  
  // Resolve hit coordinate projection onto opponent puppet
  const targetX = hitX || (side === 'left' ? canvas.width*0.4 : canvas.width*0.6);
  const targetY = hitY || canvas.height*0.5;
  
  // Draw glowing gloves on active coordinates
  for (let i = 0; i < 10; i++) {
    particles.push(new SparkParticle(targetX, targetY, '#ffcc00'));
  }
  
  // Puppet bounds collision check
  const puppetX = puppet.baseX + puppet.offsetX;
  const puppetY = puppet.baseY + puppet.offsetY;
  
  const distance = Math.sqrt((targetX - puppetX)**2 + (targetY - puppetY)**2);
  // Collision radius check
  if (distance < puppet.torsoH * 1.25) {
    // Deal standard punch damage
    puppet.health = Math.max(0, puppet.health - 6);
    opponentFill.style.width = `${puppet.health}%`;
    
    score += 50;
    hudScore.innerText = String(score).padStart(5, '0');
    
    sounds.playHit();
    triggerScreenShake(5, 8);
    activeFloaters.push(new FloaterText('+50 HIT! 💥', targetX, targetY - 20, '#ffcc00'));
    
    // Apply spring push force
    const fx = targetX > puppetX ? -1 : 1;
    puppet.applyHitForce(fx, -0.6, 12);
    
    if (puppet.health <= 0) {
      triggerLevelVictory();
    }
  }
}

function triggerPlayerKick() {
  if (currentGameState !== GAME_STATE.PLAYING) return;
  sounds.playWhoosh();
  
  const puppetX = puppet.baseX + puppet.offsetX;
  const puppetY = puppet.baseY + puppet.offsetY;
  
  // Kick deals massive double damage and blows the puppet back
  puppet.health = Math.max(0, puppet.health - 16);
  opponentFill.style.width = `${puppet.health}%`;
  
  score += 150;
  hudScore.innerText = String(score).padStart(5, '0');
  
  sounds.playHit();
  triggerScreenShake(15, 20);
  activeFloaters.push(new FloaterText('+150 KICK! 🦵', puppetX, puppetY - 60, '#ff5500'));
  
  // Blast puppet backward
  puppet.applyHitForce(0, -2.5, 45);
  
  // Emit giant blast ring sparks
  for (let i = 0; i < 25; i++) {
    particles.push(new SparkParticle(puppetX, puppetY + 50, '#ff5500'));
  }
  
  if (puppet.health <= 0) {
    triggerLevelVictory();
  }
}

function triggerLevelVictory() {
  level++;
  score += 500;
  hudScore.innerText = String(score).padStart(5, '0');
  
  sounds.playVictory();
  triggerAnnouncement(`LEVEL CLEARED!`, 100);
  
  // Spawn a fresh boss puppet with scaling health
  puppet.maxHealth = 100 + (level - 1) * 30;
  puppet.health = puppet.maxHealth;
  opponentFill.style.width = '100%';
  
  resetOpponentStance();
}

function resetOpponentStance() {
  puppet.offsetX = 0;
  puppet.offsetY = 0;
  puppet.angle = 0;
  puppet.attackState = 'idle';
  puppet.attackTimer = 120;
  combatWarning.classList.remove('warning-active');
}

function triggerGameOver(victory = false) {
  currentGameState = GAME_STATE.GAMEOVER;
  gameoverOverlay.style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  btnToggleBg.style.display = 'none';
  
  const title = document.getElementById('gameover-title');
  const msg = document.getElementById('gameover-message');
  
  if (victory) {
    title.innerText = 'CHAMPION';
    msg.innerText = 'You cleared all tiers and defeated Buddy!';
  } else {
    title.innerText = 'KNOCK OUT';
    msg.innerText = `Knocked out in Wave ${level}. Better luck next round!`;
  }
  
  document.getElementById('go-score').innerText = `SCORE: ${score}`;
  saveHighScore(score);
  renderLeaderboards();
  
  window.MovementController.stopConnection();
}

function triggerAnnouncement(txt, duration = 90) {
  if (!announcement) return;
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  
  // Clear any existing timer
  if (window.announcementTimer) {
    clearTimeout(window.announcementTimer);
  }
  
  window.announcementTimer = setTimeout(() => {
    announcement.style.opacity = '0';
  }, (duration / 60) * 1000);
}

// ----------------------------------------------------
// Core Initialization & Calibration Event Handlers
// ----------------------------------------------------
let level = 1;
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
  level = 1;
  playerShield = 100;
  shieldFill.style.width = '100%';
  
  puppet.maxHealth = 100;
  puppet.health = 100;
  opponentFill.style.width = '100%';
  
  puppet.baseX = canvas.width / 2;
  puppet.baseY = canvas.height / 2 - 20;
  
  resetOpponentStance();
  
  particles = [];
  activeFloaters = [];
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('ROUND 1', 90);
}

// ----------------------------------------------------
// Main rendering and game loop
// ----------------------------------------------------
let lastFpsTime = performance.now();
let fpsCounter = 0;

function runLoop() {
  const now = performance.now();
  fpsCounter++;
  if (now - lastFpsTime >= 1000) {
    dbgFps.innerText = fpsCounter;
    fpsCounter = 0;
    lastFpsTime = now;
  }
  
  const dbg = window.MovementController.getDebugInfo();
  
  // 1. Process inputs in calibrating or playing modes
  if (currentGameState === GAME_STATE.CALIBRATING || currentGameState === GAME_STATE.PLAYING) {
    dbgAudio.innerText = dbg.speechActive ? 'ACTIVE' : 'INACTIVE';
    dbgAudio.style.color = dbg.speechActive ? '#ff5500' : '#444';
    dbgSpeech.innerText = dbg.voiceTranscript || 'none';
    dbgLean.innerText = dbg.finalState.lean;
    dbgAction.innerText = playerStance;
    
    if (statVoiceSignal) {
      statVoiceSignal.innerText = dbg.speechActive ? 'ACTIVE' : 'WAITING';
      statVoiceSignal.className = `status-value ${dbg.speechActive ? 'val-true' : 'val-false'}`;
    }
    
    // Process punch and block thresholds
    const handList = window.MovementController.handLandmarksList || [];
    
    // Set sensor light preview indicators
    indHandActive.className = `indicator-dot ${handList.length > 0 ? 'active' : ''}`;
    indHandText.innerText = handList.length > 0 ? 'HAND TRACKING ACTIVE' : 'TRACKING IDLE';
    
    if (statHandSignal) {
      const connected = dbg.mediaPipeLoaded && handList.length > 0;
      statHandSignal.innerText = connected ? 'CONNECTED' : 'WAITING';
      statHandSignal.className = `status-value ${connected ? 'val-true' : 'val-false'}`;
    }
    
    // Evaluate velocities and stances
    processCombatGestures(handList, dbg.finalState.lean);
    
    // Calibration Step 3 completion check
    if (currentGameState === GAME_STATE.CALIBRATING && onboarding.currentStep === 3) {
      const step3Indicator = document.getElementById('step-3-indicator');
      if (onboarding.testedPunch && onboarding.testedBlock) {
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
  
  // 2. Render Calibration Modal overlays
  if (currentGameState === GAME_STATE.CALIBRATING) {
    drawCalibrationOverlay();
  }
  
  // 3. Render core Boxing Ring playing state
  else if (currentGameState === GAME_STATE.PLAYING) {
    puppet.update();
    
    // Draw viewport and handle screen shake
    ctx.save();
    if (shakeTimer > 0) {
      shakeTimer--;
      const dx = (Math.random() - 0.5) * shakeIntensity;
      const dy = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(dx, dy);
      shakeIntensity *= 0.94;
    }
    
    // Background Setup
    if (backgroundMode === 'camera' && webcamView.srcObject) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.fillStyle = '#050302';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Cyber arena ring grid
      ctx.strokeStyle = 'rgba(255, 85, 0, 0.02)';
      ctx.lineWidth = 1;
      const spacing = 45;
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      
      // Concentric background circle rings
      ctx.strokeStyle = 'rgba(255, 85, 0, 0.035)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(canvas.width/2, canvas.height/2, Math.min(220, canvas.width*0.2), 0, Math.PI*2);
      ctx.stroke();
    }
    
    // Draw Puppet Buddy
    puppet.draw(ctx);
    
    // Draw Player Gloves/Shield on screen
    drawPlayerDefenseOverlays();
    
    // Particles update
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
    
    // Float texts update
    for (let i = activeFloaters.length - 1; i >= 0; i--) {
      const f = activeFloaters[i];
      f.update();
      f.draw(ctx);
      if (f.alpha <= 0) {
        activeFloaters.splice(i, 1);
      }
    }
    
    ctx.restore();
  }
  
  requestAnimationFrame(runLoop);
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
  calCtx.strokeStyle = 'rgba(255, 85, 0, 0.2)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);
  
  // Corners
  const corner = 12;
  calCtx.strokeStyle = '#ff5500';
  calCtx.lineWidth = 2;
  calCtx.beginPath();
  calCtx.moveTo(15, 15 + corner); calCtx.lineTo(15, 15); calCtx.lineTo(15 + corner, 15);
  calCtx.moveTo(w - 15, 15 + corner); calCtx.lineTo(w - 15, 15); calCtx.lineTo(w - 15 - corner, 15);
  calCtx.moveTo(15, h - 15 - corner); calCtx.lineTo(15, h - 15); calCtx.lineTo(15 + corner, h - 15);
  calCtx.moveTo(w - 15, h - 15 - corner); calCtx.lineTo(w - 15, h - 15); calCtx.lineTo(w - 15 - corner, h - 15);
  calCtx.stroke();
  
  // Render MediaPipe Hand skeletons onto preview
  const handList = window.MovementController.handLandmarksList || [];
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
        
        calCtx.strokeStyle = 'rgba(255, 85, 0, 0.8)';
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
          calCtx.fillStyle = '#ffcc00';
          calCtx.beginPath();
          calCtx.arc((1 - pt.x) * w, pt.y * h, 3, 0, Math.PI * 2);
          calCtx.fill();
        });
        
        // Highlight palm center
        const palm = landmarks[9];
        calCtx.fillStyle = '#ff5500';
        calCtx.beginPath();
        calCtx.arc((1 - palm.x) * w, palm.y * h, 6, 0, Math.PI * 2);
        calCtx.fill();
      }
    });
  }
}

function drawPlayerDefenseOverlays() {
  const handList = window.MovementController.handLandmarksList || [];
  
  // 1. Draw glowing shields forcefield if blocking
  if (playerStance === 'BLOCKING') {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#00e5ff';
    
    ctx.beginPath();
    // Force field ellipse covering screen center
    ctx.ellipse(canvas.width/2, canvas.height/2, canvas.width*0.35, canvas.height*0.35, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  
  // 2. Draw gloves on screen matching player hand positions
  if (handList.length > 0) {
    handList.forEach((hand, idx) => {
      const indexTip = hand[8];
      const lx = (1 - indexTip.x) * canvas.width;
      const ly = indexTip.y * canvas.height;
      
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = idx === 0 ? '#ff5500' : '#ffcc00';
      ctx.fillStyle = idx === 0 ? '#ff5500' : '#ffcc00'; // red and orange glove targets
      ctx.beginPath();
      ctx.arc(lx, ly, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

// Start game tick loop
requestAnimationFrame(runLoop);
