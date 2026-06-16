// Gesture Ninja Game Engine + Hand Tracking Integration
// Implements Fruit Ninja mechanics using MediaPipe Hands

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const livesDisplay = document.getElementById('lives-display');
const hudScore = document.getElementById('hud-score');
const hudHighscore = document.getElementById('hud-highscore');
const announcement = document.getElementById('announcement');
const comboDisplay = document.getElementById('combo-display');
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
const statHandDetected = document.getElementById('stat-hand-detected');
const statSlash = document.getElementById('stat-slash');

// Debug Panel Elements
const dbgGemini = document.getElementById('dbg-gemini');
const dbgHandCount = document.getElementById('dbg-hand-count');
const dbgLhPos = document.getElementById('dbg-lh-pos');
const dbgRhPos = document.getElementById('dbg-rh-pos');
const dbgBladeActive = document.getElementById('dbg-blade-active');
const dbgSlices = document.getElementById('dbg-slices');
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
    const raw = localStorage.getItem('gesture_ninja_scores');
    const parsed = raw ? JSON.parse(raw) : [100, 50, 20];
    highScores = parsed.map(item => {
      if (typeof item === 'number') {
        return { name: 'System', score: item };
      }
      return item;
    });
  } catch (e) {
    highScores = [
      { name: 'System', score: 100 },
      { name: 'System', score: 50 },
      { name: 'System', score: 20 }
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
  localStorage.setItem('gesture_ninja_scores', JSON.stringify(highScores));
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
  playSwoosh() {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }
  playSquish() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Sine pop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.start();
    osc.stop(now + 0.12);
    
    // Noise splatter (juicy)
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.08);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.08);
  }
  playExplode() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Low rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(25, now + 0.65);
    
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    
    osc.start();
    osc.stop(now + 0.65);
    
    // Noise blast
    const bufferSize = this.ctx.sampleRate * 0.6;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.6);
  }
  playCombo() {
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
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.start(time);
      osc.stop(time + dur);
    };
    playNote(523.25, now, 0.15);       // C5
    playNote(659.25, now + 0.06, 0.15); // E5
    playNote(783.99, now + 0.12, 0.25); // G5
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Keyboard and Mouse backup controls
// ----------------------------------------------------
const mouse = {
  x: 0,
  y: 0,
  isDown: false,
  trail: []
};

window.addEventListener('mousedown', (e) => {
  if (currentGameState === GAME_STATE.PLAYING) {
    mouse.isDown = true;
    mouse.trail = [];
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.trail.push({ x: mouse.x, y: mouse.y, time: Date.now() });
    sounds.playSwoosh();
  }
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  
  if (mouse.isDown && currentGameState === GAME_STATE.PLAYING) {
    mouse.trail.push({ x: mouse.x, y: mouse.y, time: Date.now() });
  }
});

window.addEventListener('mouseup', () => {
  mouse.isDown = false;
});

// Touch Fallbacks
window.addEventListener('touchstart', (e) => {
  if (currentGameState === GAME_STATE.PLAYING && e.touches.length > 0) {
    mouse.isDown = true;
    mouse.trail = [];
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.touches[0].clientX - rect.left;
    mouse.y = e.touches[0].clientY - rect.top;
    mouse.trail.push({ x: mouse.x, y: mouse.y, time: Date.now() });
    sounds.playSwoosh();
  }
});

window.addEventListener('touchmove', (e) => {
  if (mouse.isDown && currentGameState === GAME_STATE.PLAYING && e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.touches[0].clientX - rect.left;
    mouse.y = e.touches[0].clientY - rect.top;
    mouse.trail.push({ x: mouse.x, y: mouse.y, time: Date.now() });
  }
});

window.addEventListener('touchend', () => {
  mouse.isDown = false;
});

// Toggle Background mode via 'C' Key
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'c') {
    toggleBackground();
  }
});

// Setup Canvas Size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ----------------------------------------------------
// Hand Blades & Slashes
// ----------------------------------------------------
class HandBlade {
  constructor(color) {
    this.trail = [];
    this.active = false;
    this.color = color;
  }
  
  update(pos) {
    if (pos) {
      this.trail.push({ x: pos.x, y: pos.y, time: Date.now() });
      this.active = true;
      
      // Calculate immediate velocity
      if (this.trail.length > 1) {
        const p1 = this.trail[this.trail.length - 2];
        const p2 = this.trail[this.trail.length - 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // play swoosh sound on fast movements
        if (dist > 65 && Math.random() < 0.25) {
          sounds.playSwoosh();
        }
      }
    } else {
      this.active = false;
    }
    
    // Fade trail points older than 120ms
    const limit = Date.now() - 120;
    this.trail = this.trail.filter(pt => pt.time > limit);
  }
  
  draw(gCtx) {
    if (this.trail.length < 2) return;
    
    gCtx.save();
    gCtx.shadowBlur = 15;
    gCtx.shadowColor = this.color;
    
    // Draw glowing ribbon/blade
    for (let i = 1; i < this.trail.length; i++) {
      const p1 = this.trail[i - 1];
      const p2 = this.trail[i];
      const ageRatio = (i / this.trail.length); // gets wider/opaque towards the end
      
      gCtx.strokeStyle = this.color;
      gCtx.lineWidth = 1 + ageRatio * 9;
      gCtx.globalAlpha = ageRatio * 0.95;
      
      gCtx.beginPath();
      gCtx.moveTo(p1.x, p1.y);
      gCtx.lineTo(p2.x, p2.y);
      gCtx.stroke();
    }
    gCtx.restore();
  }
}

const leftBlade = new HandBlade('#2ecc71'); // Green blade
const rightBlade = new HandBlade('#3498db'); // Blue blade

// Background Config
let backgroundMode = 'dojo'; // 'dojo' | 'camera'
function toggleBackground() {
  if (backgroundMode === 'dojo') {
    backgroundMode = 'camera';
    bgModeLabel.innerText = 'CAMERA VIEW';
    console.log('[Game] Switched background to Camera overlay.');
  } else {
    backgroundMode = 'dojo';
    bgModeLabel.innerText = 'DOJO GRID';
    console.log('[Game] Switched background to Dojo Grid.');
  }
}
btnToggleBg.addEventListener('click', toggleBackground);

// ----------------------------------------------------
// Onboarding & Calibration Setup
// ----------------------------------------------------
const onboarding = {
  currentStep: 1,
  step2Countdown: 3,
  step3MaxSpeed: 0,
  
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
  
  const ok = await window.MovementController.initCamera(webcamCalibrationView);
  
  if (ok) {
    webcamView.srcObject = webcamCalibrationView.srcObject;
    webcamView.play();
    
    // Load MediaPipe
    window.MovementController.loadMediaPipe().catch(err => {
      console.error('[Game] Error loading MediaPipe Hands:', err);
    });
    
    onboarding.completedSteps[1] = true;
    const stepEl = document.getElementById('step-1');
    stepEl.classList.remove('active');
    stepEl.classList.add('completed');
    btnEnableCamera.innerText = 'Camera Active';
    
    window.MovementController.startProcessingLoop();
    window.MovementController.startConnection('ws://localhost:8080');
    
    activateStep(2);
    startStep2Calibration();
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable Camera';
    alert('Webcam permission denied or camera not found. Slicing falls back to Mouse/Touch dragging.');
    
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

// ----------------------------------------------------
// Game Objects and Physics Loop
// ----------------------------------------------------
let score = 0;
let lives = 5;
let fruits = [];
let particles = [];
let activeFloaters = [];
let comboList = []; // timestamps of sliced fruits
let lastSwooshTime = 0;

const FRUIT_TYPES = {
  WATERMELON: { name: 'WATERMELON', radius: 46, color: '#2ecc71', splashColor: '#e74c3c' },
  APPLE: { name: 'APPLE', radius: 32, color: '#e74c3c', splashColor: '#f1c40f' },
  BANANA: { name: 'BANANA', radius: 26, color: '#f1c40f', splashColor: '#f9e79f' },
  ORANGE: { name: 'ORANGE', radius: 34, color: '#e67e22', splashColor: '#f39c12' },
  COCONUT: { name: 'COCONUT', radius: 36, color: '#784212', splashColor: '#ffffff' },
  PINEAPPLE: { name: 'PINEAPPLE', radius: 40, color: '#f39c12', splashColor: '#27ae60' }
};

class GameFruit {
  constructor(type, isBomb = false) {
    this.isBomb = isBomb;
    this.type = type;
    
    // Physics
    this.r = isBomb ? 35 : type.radius;
    this.x = Math.random() * (canvas.width - 200) + 100;
    this.y = canvas.height + this.r;
    
    // Arch upward
    const targetX = canvas.width / 2 + (Math.random() - 0.5) * 300;
    const peakHeight = Math.random() * (canvas.height * 0.4) + canvas.height * 0.25;
    const dy = peakHeight - this.y;
    
    // gravity is ~0.15
    const gravity = 0.14;
    // time to peak: t = sqrt(-2*dy/g)
    const t = Math.sqrt(-2 * dy / gravity);
    
    this.vy = -gravity * t;
    this.vx = (targetX - this.x) / t;
    
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.08;
    
    // Splitting halves
    this.isSliced = false;
    this.half1 = null;
    this.half2 = null;
  }
  
  update() {
    const gravity = 0.14;
    
    if (!this.isSliced) {
      this.vy += gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.rotation += this.rotSpeed;
    } else {
      if (!this.half1 || !this.half2) return; // Guard against null halves (e.g. exploded bomb)
      // Update both halves
      this.half1.vy += gravity;
      this.half1.x += this.half1.vx;
      this.half1.y += this.half1.vy;
      this.half1.rotation += this.half1.rotSpeed;
      
      this.half2.vy += gravity;
      this.half2.x += this.half2.vx;
      this.half2.y += this.half2.vy;
      this.half2.rotation += this.half2.rotSpeed;
    }
  }
  
  draw(gCtx) {
    if (!this.isSliced) {
      gCtx.save();
      gCtx.translate(this.x, this.y);
      gCtx.rotate(this.rotation);
      
      if (this.isBomb) {
        drawBombCore(gCtx, this.r);
      } else {
        drawFruitCore(gCtx, this.type.name, this.r, false);
      }
      gCtx.restore();
    } else {
      if (!this.half1 || !this.half2) return; // Guard against null halves (e.g. exploded bomb)
      // Draw Half 1
      gCtx.save();
      gCtx.translate(this.half1.x, this.half1.y);
      gCtx.rotate(this.half1.rotation);
      
      gCtx.beginPath();
      gCtx.rect(-this.r * 2.5, -this.r * 2.5, this.r * 2.5, this.r * 5); // left half clip
      gCtx.clip();
      
      drawFruitCore(gCtx, this.type.name, this.r, true);
      gCtx.restore();
      
      // Draw Half 2
      gCtx.save();
      gCtx.translate(this.half2.x, this.half2.y);
      gCtx.rotate(this.half2.rotation);
      
      gCtx.beginPath();
      gCtx.rect(0, -this.r * 2.5, this.r * 2.5, this.r * 5); // right half clip
      gCtx.clip();
      
      drawFruitCore(gCtx, this.type.name, this.r, true);
      gCtx.restore();
    }
  }
  
  slice(sliceAngle) {
    this.isSliced = true;
    
    // Speed boost outwards perpendicular to cut angle
    const speed = 2.5 + Math.random() * 2;
    const angle1 = sliceAngle - Math.PI / 2;
    const angle2 = sliceAngle + Math.PI / 2;
    
    this.half1 = {
      x: this.x,
      y: this.y,
      vx: this.vx + Math.cos(angle1) * speed,
      vy: this.vy + Math.sin(angle1) * speed - 1,
      rotation: this.rotation,
      rotSpeed: -0.05 - Math.random() * 0.08
    };
    
    this.half2 = {
      x: this.x,
      y: this.y,
      vx: this.vx + Math.cos(angle2) * speed,
      vy: this.vy + Math.sin(angle2) * speed - 1,
      rotation: this.rotation,
      rotSpeed: 0.05 + Math.random() * 0.08
    };
  }
}

// ----------------------------------------------------
// Customized Canvas Fruit Render Helpers
// ----------------------------------------------------
function drawFruitCore(gCtx, name, r, isSliced) {
  gCtx.save();
  
  if (name === 'WATERMELON') {
    // Outer shell
    gCtx.fillStyle = '#1e824c';
    gCtx.beginPath();
    gCtx.arc(0, 0, r, 0, Math.PI * 2);
    gCtx.fill();
    
    // Light green layer
    gCtx.fillStyle = '#2ecc71';
    gCtx.beginPath();
    gCtx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
    gCtx.fill();
    
    // Red core
    gCtx.fillStyle = '#e74c3c';
    gCtx.beginPath();
    gCtx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    gCtx.fill();
    
    // Black seeds on sliced cut sides
    if (isSliced) {
      gCtx.fillStyle = '#000000';
      const seedPos = [
        {x: -r*0.3, y: -r*0.2}, {x: -r*0.1, y: r*0.3},
        {x: r*0.2, y: -r*0.3}, {x: r*0.3, y: r*0.1},
        {x: 0, y: -r*0.5}, {x: -r*0.4, y: r*0.2}
      ];
      seedPos.forEach(s => {
        gCtx.beginPath();
        gCtx.arc(s.x, s.y, 2, 0, Math.PI*2);
        gCtx.fill();
      });
    }
  } 
  
  else if (name === 'APPLE') {
    // Apple main shape (slightly oval)
    gCtx.fillStyle = '#c0392b';
    gCtx.beginPath();
    gCtx.arc(-r*0.15, 0, r*0.9, 0, Math.PI*2);
    gCtx.arc(r*0.15, 0, r*0.9, 0, Math.PI*2);
    gCtx.fill();
    
    // Stem
    gCtx.strokeStyle = '#795548';
    gCtx.lineWidth = 3;
    gCtx.lineCap = 'round';
    gCtx.beginPath();
    gCtx.moveTo(0, -r*0.7);
    gCtx.quadraticCurveTo(r*0.3, -r*1.1, r*0.4, -r*1.2);
    gCtx.stroke();
    
    // Green Leaf
    gCtx.fillStyle = '#2ecc71';
    gCtx.beginPath();
    gCtx.ellipse(r*0.2, -r*1.0, r*0.25, r*0.12, Math.PI/6, 0, Math.PI*2);
    gCtx.fill();
    
    if (isSliced) {
      // Yellowish apple flesh overlay
      gCtx.fillStyle = '#fdfefe';
      gCtx.beginPath();
      gCtx.arc(0, 0, r*0.6, 0, Math.PI*2);
      gCtx.fill();
      
      // Apple core seeds
      gCtx.fillStyle = '#784212';
      gCtx.beginPath();
      gCtx.ellipse(-4, 0, 2, 3.5, 0, 0, Math.PI*2);
      gCtx.ellipse(4, 0, 2, 3.5, 0, 0, Math.PI*2);
      gCtx.fill();
    }
  } 
  
  else if (name === 'BANANA') {
    // Drawn as thick crescent using arc stroke
    gCtx.strokeStyle = '#f1c40f';
    gCtx.lineWidth = r * 0.75;
    gCtx.lineCap = 'round';
    gCtx.beginPath();
    gCtx.arc(0, -r*0.3, r * 1.1, 0.15 * Math.PI, 0.85 * Math.PI);
    gCtx.stroke();
    
    // Banana tips
    gCtx.fillStyle = '#784212';
    // Tip 1
    gCtx.beginPath();
    gCtx.arc(r * 1.1 * Math.cos(0.15 * Math.PI), -r*0.3 + r * 1.1 * Math.sin(0.15 * Math.PI), 5, 0, Math.PI*2);
    gCtx.fill();
    // Tip 2
    gCtx.beginPath();
    gCtx.arc(r * 1.1 * Math.cos(0.85 * Math.PI), -r*0.3 + r * 1.1 * Math.sin(0.85 * Math.PI), 5, 0, Math.PI*2);
    gCtx.fill();
    
    if (isSliced) {
      // Light interior
      gCtx.strokeStyle = '#fef9e7';
      gCtx.lineWidth = r * 0.45;
      gCtx.beginPath();
      gCtx.arc(0, -r*0.3, r * 1.1, 0.18 * Math.PI, 0.82 * Math.PI);
      gCtx.stroke();
    }
  } 
  
  else if (name === 'ORANGE') {
    // Orange circle outer rind
    gCtx.fillStyle = '#d35400';
    gCtx.beginPath();
    gCtx.arc(0, 0, r, 0, Math.PI * 2);
    gCtx.fill();
    
    gCtx.fillStyle = '#e67e22';
    gCtx.beginPath();
    gCtx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    gCtx.fill();
    
    // Wedge Segment details
    gCtx.strokeStyle = '#ffffff';
    gCtx.lineWidth = 1.2;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      gCtx.beginPath();
      gCtx.moveTo(0, 0);
      gCtx.lineTo(Math.cos(angle) * r * 0.8, Math.sin(angle) * r * 0.8);
      gCtx.stroke();
    }
    
    if (isSliced) {
      // White inner core pulp circle
      gCtx.fillStyle = '#ffffff';
      gCtx.beginPath();
      gCtx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      gCtx.fill();
      
      gCtx.fillStyle = '#e67e22';
      gCtx.beginPath();
      gCtx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
      gCtx.fill();
    }
  } 
  
  else if (name === 'COCONUT') {
    // Brown shell
    gCtx.fillStyle = '#5c3a21';
    gCtx.beginPath();
    gCtx.arc(0, 0, r, 0, Math.PI * 2);
    gCtx.fill();
    
    // Inner white meat
    gCtx.fillStyle = '#ffffff';
    gCtx.beginPath();
    gCtx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    gCtx.fill();
    
    // Hollow center
    gCtx.fillStyle = '#21160e';
    gCtx.beginPath();
    gCtx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
    gCtx.fill();
  } 
  
  else if (name === 'PINEAPPLE') {
    // Body oval
    gCtx.fillStyle = '#f39c12';
    gCtx.beginPath();
    gCtx.ellipse(0, r*0.1, r * 0.75, r, 0, 0, Math.PI*2);
    gCtx.fill();
    
    // Pineapple spikes details (diagonal grid overlay)
    gCtx.strokeStyle = '#d35400';
    gCtx.lineWidth = 1.5;
    gCtx.save();
    gCtx.beginPath();
    gCtx.ellipse(0, r*0.1, r * 0.75, r, 0, 0, Math.PI*2);
    gCtx.clip();
    
    const spacing = 12;
    for (let i = -r * 2; i < r * 2; i += spacing) {
      gCtx.beginPath();
      gCtx.moveTo(i - r, -r);
      gCtx.lineTo(i + r, r * 2);
      gCtx.stroke();
      
      gCtx.beginPath();
      gCtx.moveTo(i + r, -r);
      gCtx.lineTo(i - r, r * 2);
      gCtx.stroke();
    }
    gCtx.restore();
    
    // Crown spiky leaves at top
    gCtx.fillStyle = '#27ae60';
    gCtx.beginPath();
    gCtx.moveTo(-r*0.3, -r*0.7);
    gCtx.lineTo(0, -r*1.5); // center spike
    gCtx.lineTo(r*0.3, -r*0.7);
    
    gCtx.moveTo(-r*0.4, -r*0.6);
    gCtx.lineTo(-r*0.6, -r*1.2); // left spike
    gCtx.lineTo(-r*0.1, -r*0.6);
    
    gCtx.moveTo(r*0.1, -r*0.6);
    gCtx.lineTo(r*0.6, -r*1.2); // right spike
    gCtx.lineTo(r*0.4, -r*0.6);
    
    gCtx.fill();
    
    if (isSliced) {
      // Pineapple yellow heart
      gCtx.fillStyle = '#fef9e7';
      gCtx.beginPath();
      gCtx.ellipse(0, r*0.1, r * 0.45, r * 0.65, 0, 0, Math.PI*2);
      gCtx.fill();
    }
  }
  
  gCtx.restore();
}

function drawBombCore(gCtx, r) {
  // Main iron body
  gCtx.fillStyle = '#2c3e50';
  gCtx.beginPath();
  gCtx.arc(0, 0, r, 0, Math.PI * 2);
  gCtx.fill();
  
  // Shading specular glow
  gCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  gCtx.beginPath();
  gCtx.arc(-r*0.25, -r*0.25, r*0.3, 0, Math.PI*2);
  gCtx.fill();
  
  // Cap
  gCtx.fillStyle = '#7f8c8d';
  gCtx.fillRect(-r*0.25, -r - 5, r*0.5, 6);
  
  // Fuse
  gCtx.strokeStyle = '#d35400';
  gCtx.lineWidth = 3.5;
  gCtx.lineCap = 'round';
  gCtx.beginPath();
  gCtx.moveTo(0, -r - 5);
  gCtx.quadraticCurveTo(r * 0.4, -r - 18, r * 0.5, -r - 12);
  gCtx.stroke();
  
  // Spark animation particles
  const sparkX = r * 0.5;
  const sparkY = -r - 12;
  const flareIdx = (Date.now() % 300) / 300;
  
  gCtx.fillStyle = '#f1c40f';
  gCtx.beginPath();
  gCtx.arc(sparkX, sparkY, 3 + flareIdx * 3, 0, Math.PI*2);
  gCtx.fill();
  
  gCtx.fillStyle = '#e67e22';
  gCtx.beginPath();
  gCtx.arc(sparkX, sparkY, 1 + flareIdx * 2, 0, Math.PI*2);
  gCtx.fill();
}

// ----------------------------------------------------
// Splatter Particle System
// ----------------------------------------------------
class JuiceParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 1.2;
    
    this.r = 2 + Math.random() * 7;
    this.color = color;
    this.alpha = 1;
    this.decay = 0.015 + Math.random() * 0.02;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.12; // gravity on juice
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

class ScreenAlert {
  constructor(txt, x, y, color = '#ffffff') {
    this.txt = txt;
    this.x = x;
    this.y = y;
    this.vy = -1.2;
    this.color = color;
    this.alpha = 1.0;
  }
  update() {
    this.y += this.vy;
    this.alpha -= 0.018;
  }
  draw(gCtx) {
    gCtx.save();
    gCtx.fillStyle = this.color;
    gCtx.globalAlpha = this.alpha;
    gCtx.font = '800 1.25rem Outfit';
    gCtx.textAlign = 'center';
    gCtx.shadowBlur = 8;
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

// Spawning variables
let spawnTimer = 0;
let spawnInterval = 100; // frames
let gameFrameCount = 0;

function spawnBatch() {
  // Wave density scaling with score
  const scoreFactor = Math.floor(score / 50);
  const count = 1 + Math.floor(Math.random() * 2) + Math.min(scoreFactor, 3);
  
  for (let i = 0; i < count; i++) {
    // 10% chance of a Bomb if score > 15
    const isBomb = score > 15 && Math.random() < 0.15;
    
    let typeKeys = Object.keys(FRUIT_TYPES);
    let chosenKey = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    let type = FRUIT_TYPES[chosenKey];
    
    fruits.push(new GameFruit(type, isBomb));
  }
  
  // Shorten spawn interval as game progresses
  spawnInterval = Math.max(50, 110 - Math.min(score, 60));
}

// ----------------------------------------------------
// Line Segment to Circle Intersection Math
// ----------------------------------------------------
function lineCircleIntersection(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq === 0) {
    const distSq = (cx - x1) * (cx - x1) + (cy - y1) * (cy - y1);
    return distSq <= r * r;
  }
  
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  
  const distSq = (cx - closestX) * (cx - closestX) + (cy - closestY) * (cy - closestY);
  return distSq <= r * r;
}

// ----------------------------------------------------
// Process Gesture Slices
// ----------------------------------------------------
function processSlices(trail) {
  if (trail.length < 2) return;
  
  // segment is the latest move
  const p1 = trail[trail.length - 2];
  const p2 = trail[trail.length - 1];
  
  // Calculate cut angle
  const sliceAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  
  fruits.forEach(f => {
    if (!f.isSliced) {
      const isHit = lineCircleIntersection(p1.x, p1.y, p2.x, p2.y, f.x, f.y, f.r);
      if (isHit) {
        if (f.isBomb) {
          // Explode!
          sounds.playExplode();
          triggerScreenShake(25, 45);
          
          // Deduct life and destroy all on-screen fruits
          lives--;
          updateLivesUI();
          
          // Flash screen in particle array
          particles.push(new JuiceParticle(f.x, f.y, '#ffffff'));
          
          // Score penalty
          score = Math.max(0, score - 5);
          activeFloaters.push(new ScreenAlert('-5 💣', f.x, f.y - 15, '#e74c3c'));
          
          // Eliminate this bomb
          f.isSliced = true;
          f.half1 = null;
          f.half2 = null;
          
          // Destroy all active fruits
          fruits.forEach(f2 => {
            if (!f2.isSliced) {
              f2.isSliced = true;
              f2.half1 = { x: f2.x, y: f2.y, vx: (Math.random()-0.5)*4, vy: -3, rotation: 0, rotSpeed: 0.1 };
              f2.half2 = { x: f2.x, y: f2.y, vx: (Math.random()-0.5)*4, vy: -3, rotation: 0, rotSpeed: -0.1 };
            }
          });
          
          if (lives <= 0) {
            triggerGameOver();
          }
        } 
        
        else {
          // Sliced a Fruit!
          f.slice(sliceAngle);
          score++;
          sounds.playSquish();
          
          // Splat particles
          for (let p = 0; p < 18; p++) {
            particles.push(new JuiceParticle(f.x, f.y, f.type.splashColor));
          }
          
          // Floater indicator
          activeFloaters.push(new ScreenAlert('+1', f.x, f.y, f.type.splashColor));
          
          // Check combo window
          comboList.push(Date.now());
          
          // Update HUD Score
          hudScore.innerText = String(score).padStart(5, '0');
        }
      }
    }
  });
}

// ----------------------------------------------------
// Combo Detector
// ----------------------------------------------------
function checkCombos() {
  const now = Date.now();
  // Filter slices in the last 280ms
  comboList = comboList.filter(time => now - time < 280);
  
  if (comboList.length >= 3) {
    const comboCount = comboList.length;
    sounds.playCombo();
    
    // Clear list to avoid continuous triggers
    comboList = [];
    
    // Bonus points
    score += comboCount;
    hudScore.innerText = String(score).padStart(5, '0');
    
    // Render combo notice
    comboDisplay.innerText = `${comboCount}x COMBO! +${comboCount}`;
    comboDisplay.classList.add('show');
    
    setTimeout(() => {
      comboDisplay.classList.remove('show');
    }, 1200);
  }
}

// Lives Display
function updateLivesUI() {
  if (livesDisplay) {
    let hearts = '';
    for (let l = 0; l < 5; l++) {
      if (l < lives) hearts += '❤️';
      else hearts += '🖤';
    }
    livesDisplay.innerText = hearts;
  }
}

// Game transitions
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
  
  // Re-establish connection
  window.MovementController.startConnection('ws://localhost:8080');
  initGame();
});

function initGame() {
  score = 0;
  lives = 5;
  fruits = [];
  particles = [];
  activeFloaters = [];
  comboList = [];
  gameFrameCount = 0;
  spawnTimer = 0;
  
  hudScore.innerText = '00000';
  updateLivesUI();
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('FIGHT!', 90);
  
  // Reset blade trails
  leftBlade.trail = [];
  rightBlade.trail = [];
}

function triggerAnnouncement(txt, duration = 90) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  setTimeout(() => {
    announcement.style.opacity = '0';
  }, duration * 16.6); // approximate frames to ms
}

// ----------------------------------------------------
// Main Calibration Update loop
// ----------------------------------------------------
function updateOnboarding() {
  const dbg = window.MovementController.getDebugInfo();
  
  // Sync Sensor labels
  dbgGemini.innerText = dbg.geminiStatus;
  dbgGemini.style.color = dbg.geminiStatus === 'connected' ? '#2ecc71' : '#e74c3c';
  
  const handList = window.MovementController.handLandmarksList || [];
  dbgHandCount.innerText = dbg.mediaPipeLoaded ? handList.length : '0';
  
  let leftHand = null;
  let rightHand = null;
  
  if (handList.length > 0) {
    leftHand = handList[0];
    if (handList.length > 1) {
      rightHand = handList[1];
    }
  }
  
  dbgLhPos.innerText = leftHand ? `X: ${(1-leftHand[8].x).toFixed(2)}, Y: ${leftHand[8].y.toFixed(2)}` : 'n/a';
  dbgRhPos.innerText = rightHand ? `X: ${(1-rightHand[8].x).toFixed(2)}, Y: ${rightHand[8].y.toFixed(2)}` : 'n/a';
  
  // Mirror coordinate scaling
  let lhX = 0, lhY = 0, rhX = 0, rhY = 0;
  if (leftHand) {
    lhX = (1 - leftHand[8].x) * canvas.width;
    lhY = leftHand[8].y * canvas.height;
  }
  if (rightHand) {
    rhX = (1 - rightHand[8].x) * canvas.width;
    rhY = rightHand[8].y * canvas.height;
  }
  
  // Update blades active debugging
  const finalState = dbg.finalState;
  const isBladeActive = leftBlade.active || rightBlade.active || mouse.isDown;
  dbgBladeActive.innerText = isBladeActive ? 'true' : 'false';
  dbgBladeActive.style.color = isBladeActive ? '#2ecc71' : '#555';
  
  const currentHandList = window.MovementController.handLandmarksList || [];
  indHandActive.className = `indicator-dot ${currentHandList.length > 0 ? 'active' : ''}`;
  indHandText.innerText = currentHandList.length > 0 ? `${currentHandList.length} HAND(S) TRACKED` : 'TRACKING IDLE';
  
  // Render live webcam calibration drawings
  drawCalibrationOverlay();
  
  // Calibration Step calculations
  if (onboarding.currentStep === 3) {
    const isHandVisible = currentHandList.length > 0;
    if (statHandDetected) {
      statHandDetected.innerText = isHandVisible ? 'YES' : 'NO';
      statHandDetected.className = `status-value ${isHandVisible ? 'val-true' : 'val-false'}`;
    }
    
    // Check speed for slash calibration
    let currentSpeed = 0;
    if (leftHand) {
      leftBlade.update({x: lhX, y: lhY});
      if (leftBlade.trail.length > 1) {
        const p1 = leftBlade.trail[leftBlade.trail.length - 2];
        const p2 = leftBlade.trail[leftBlade.trail.length - 1];
        currentSpeed = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
      }
    }
    
    onboarding.step3MaxSpeed = Math.max(onboarding.step3MaxSpeed, currentSpeed);
    const progressPercent = Math.min((onboarding.step3MaxSpeed / 60) * 100, 100);
    document.getElementById('step-3-progress').style.width = `${progressPercent}%`;
    
    const wasSlashDetected = onboarding.step3MaxSpeed > 60;
    if (statSlash) {
      statSlash.innerText = wasSlashDetected ? 'DETECTED' : 'NO';
      statSlash.className = `status-value ${wasSlashDetected ? 'val-true' : 'val-false'}`;
    }
    
    if (wasSlashDetected) {
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
  
  calCtx.save();
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  calCtx.restore();
  
  // Outline
  calCtx.strokeStyle = 'rgba(46, 204, 113, 0.25)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);
  
  // Corners
  const cornerLen = 12;
  calCtx.strokeStyle = '#2ecc71';
  calCtx.lineWidth = 2;
  calCtx.beginPath();
  calCtx.moveTo(15, 15 + cornerLen); calCtx.lineTo(15, 15); calCtx.lineTo(15 + cornerLen, 15);
  calCtx.moveTo(w - 15, 15 + cornerLen); calCtx.lineTo(w - 15, 15); calCtx.lineTo(w - 15 - cornerLen, 15);
  calCtx.moveTo(15, h - 15 - cornerLen); calCtx.lineTo(15, h - 15); calCtx.lineTo(15 + cornerLen, h - 15);
  calCtx.moveTo(w - 15, h - 15 - cornerLen); calCtx.lineTo(w - 15, h - 15); calCtx.lineTo(w - 15 - cornerLen, h - 15);
  calCtx.stroke();
  
  // Draw skeletons
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks, idx) => {
      if (landmarks && landmarks.length > 0) {
        const paths = [
          [0, 1, 2, 3, 4],
          [0, 5, 6, 7, 8],
          [9, 10, 11, 12],
          [13, 14, 15, 16],
          [0, 17, 18, 19, 20],
          [5, 9, 13, 17]
        ];
        
        calCtx.strokeStyle = idx === 0 ? 'rgba(46, 204, 113, 0.85)' : 'rgba(52, 152, 219, 0.85)';
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
          calCtx.fillStyle = idx === 0 ? '#f39c12' : '#9b59b6';
          calCtx.beginPath();
          calCtx.arc((1 - pt.x) * w, pt.y * h, 3, 0, Math.PI * 2);
          calCtx.fill();
        });
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
  
  // 1. Process inputs and calibration if in calibrating phase
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateOnboarding();
  }
  
  // 2. Play mode calculations
  else if (currentGameState === GAME_STATE.PLAYING) {
    gameFrameCount++;
    
    // Background Setup
    ctx.save();
    
    // Handle Screen Shake
    if (shakeTimer > 0) {
      shakeTimer--;
      const dx = (Math.random() - 0.5) * shakeIntensity;
      const dy = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(dx, dy);
      // Reduce intensity
      shakeIntensity *= 0.95;
    }
    
    // Draw Background theme
    if (backgroundMode === 'camera' && webcamView.srcObject) {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.28; // Translucent
      ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      // Dojo grid theme
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.025)';
      ctx.lineWidth = 1;
      const spacing = 45;
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      
      // Cyber neon circle center details
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.04)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(canvas.width/2, canvas.height/2, Math.min(220, canvas.width*0.2), 0, Math.PI*2);
      ctx.stroke();
    }
    
    // Read Hand controller data
    const dbg = window.MovementController.getDebugInfo();
    let leftHand = null;
    let rightHand = null;
    
    const activeHandList = window.MovementController.handLandmarksList || [];
    if (activeHandList.length > 0) {
      leftHand = activeHandList[0];
      if (activeHandList.length > 1) {
        rightHand = activeHandList[1];
      }
    }
    
    // Update Blades
    if (leftHand) {
      const lx = (1 - leftHand[8].x) * canvas.width;
      const ly = leftHand[8].y * canvas.height;
      leftBlade.update({x: lx, y: ly});
      processSlices(leftBlade.trail);
    } else {
      leftBlade.update(null);
    }
    
    if (rightHand) {
      const rx = (1 - rightHand[8].x) * canvas.width;
      const ry = rightHand[8].y * canvas.height;
      rightBlade.update({x: rx, y: ry});
      processSlices(rightBlade.trail);
    } else {
      rightBlade.update(null);
    }
    
    // Update Mouse Blade
    const mouseLimit = Date.now() - 120;
    mouse.trail = mouse.trail.filter(pt => pt.time > mouseLimit);
    if (mouse.isDown) {
      processSlices(mouse.trail);
    }
    
    // Draw Hand Blades
    leftBlade.draw(ctx);
    rightBlade.draw(ctx);
    
    // Draw Mouse blade fallback
    if (mouse.trail.length >= 2) {
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#e74c3c';
      for (let i = 1; i < mouse.trail.length; i++) {
        const p1 = mouse.trail[i-1];
        const p2 = mouse.trail[i];
        const age = i / mouse.trail.length;
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 1 + age * 8;
        ctx.globalAlpha = age * 0.9;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    
    // Spawning timer update
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnBatch();
    }
    
    // Update and Draw Fruits
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      f.update();
      f.draw(ctx);
      
      // Miss Check: if fruit drops off screen bottom untouched
      if (!f.isSliced && f.y > canvas.height + f.r + 20 && f.vy > 0) {
        if (!f.isBomb) {
          lives--;
          updateLivesUI();
          activeFloaters.push(new ScreenAlert('MISS 🖤', f.x, canvas.height - 30, '#95a5a6'));
          
          if (lives <= 0) {
            triggerGameOver();
          }
        }
        fruits.splice(i, 1);
      }
      
      // Clean up sliced halves that fell off screen
      else if (f.isSliced) {
        const isHalf1Off = !f.half1 || f.half1.y > canvas.height + f.r + 50;
        const isHalf2Off = !f.half2 || f.half2.y > canvas.height + f.r + 50;
        if (isHalf1Off && isHalf2Off) {
          fruits.splice(i, 1);
        }
      }
    }
    
    // Update and Draw Splatters
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
    
    // Update and Draw Float alerts
    for (let i = activeFloaters.length - 1; i >= 0; i--) {
      const f = activeFloaters[i];
      f.update();
      f.draw(ctx);
      if (f.alpha <= 0) {
        activeFloaters.splice(i, 1);
      }
    }
    
    // Detect Combo events
    checkCombos();
    
    ctx.restore();
    
    // Sync HUD status count
    dbgSlices.innerText = score;
  }
  
  requestAnimationFrame(runLoop);
}

// Start Game loop immediately
requestAnimationFrame(runLoop);
