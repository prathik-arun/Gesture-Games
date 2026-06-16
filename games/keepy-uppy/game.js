// Neon Keepy-Uppy Game Engine
// Coordinates circle physics with webcam hand/face tracking and mouth wind detection

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
const statAiConnected = document.getElementById('stat-ai-connected');
const statMouth = document.getElementById('stat-mouth');

// Debug UI labels
const dbgGemini = document.getElementById('dbg-gemini');
const dbgMouthState = document.getElementById('dbg-mouth-state');
const dbgHandsCount = document.getElementById('dbg-hands-count');
const dbgBalloons = document.getElementById('dbg-balloons');
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

// Leaderboard Manager
let highScores = [];
function loadHighScores() {
  try {
    const raw = localStorage.getItem('keepy_uppy_scores');
    const parsed = raw ? JSON.parse(raw) : [25, 15, 5];
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
      { name: 'System', score: 5 }
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
  localStorage.setItem('keepy_uppy_scores', JSON.stringify(highScores));
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
// Web Audio API Sound Synthesizer
// ----------------------------------------------------
class SoundSynth {
  constructor() {
    this.ctx = null;
    this.windOsc = null;
    this.windGain = null;
    this.windNoiseNode = null;
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
    
    osc.type = 'sine';
    // Frequency slide up to simulate bounce
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.1);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    osc.start();
    osc.stop(now + 0.1);
  }

  playPop() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Low frequency thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.start();
    osc.stop(now + 0.2);
    
    // Noise burst
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
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(now + 0.15);
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const notes = [293.66, 277.18, 261.63, 220.00]; // D4, C#4, C4, A3 slide down
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.15);
      
      gain.gain.setValueAtTime(0.15, now + idx * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.3);
      
      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 0.3);
    });
  }

  startWindSound() {
    this.init();
    if (!this.ctx || this.windNoiseNode) return;
    
    const now = this.ctx.currentTime;
    
    // Create pinkish/white noise buffer for continuous wind
    const bufferSize = this.ctx.sampleRate * 2.0; // 2 seconds loopable
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Filter white noise to make it sound like low wind
      lastOut = 0.93 * lastOut + 0.07 * white;
      data[i] = lastOut * 1.5;
    }
    
    this.windNoiseNode = this.ctx.createBufferSource();
    this.windNoiseNode.buffer = buffer;
    this.windNoiseNode.loop = true;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, now);
    
    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0, now);
    
    this.windNoiseNode.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    
    this.windNoiseNode.start();
  }

  setWindVolume(normVol) {
    if (!this.windGain) return;
    const now = this.ctx.currentTime;
    // Cap wind volume to 0.15 max to avoid blowing player ears
    this.windGain.gain.setTargetAtTime(normVol * 0.15, now, 0.05);
  }

  stopWindSound() {
    if (this.windNoiseNode) {
      try {
        this.windNoiseNode.stop();
      } catch (e) {}
      this.windNoiseNode = null;
      this.windGain = null;
    }
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Fallback controls & Mouse Paddle
// ----------------------------------------------------
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight - 80;
let isMousePaddleActive = true;
let keyboardWindBlast = false;

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Touch support
window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouseX = e.touches[0].clientX;
    mouseY = e.touches[0].clientY;
  }
});

// Wind blowing triggers
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    keyboardWindBlast = true;
    sounds.playBounce();
    createWindBlast(mouseX, canvas.height - 10, 150);
  }
  if (e.key.toLowerCase() === 'c') {
    toggleBackground();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    keyboardWindBlast = false;
  }
});

window.addEventListener('mousedown', () => {
  if (currentGameState === GAME_STATE.PLAYING) {
    keyboardWindBlast = true;
    sounds.playBounce();
    createWindBlast(mouseX, canvas.height - 10, 150);
  }
});

window.addEventListener('mouseup', () => {
  keyboardWindBlast = false;
});

// Toggle Background Mode
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

// Resize Canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ----------------------------------------------------
// Onboarding & Calibration Loop
// ----------------------------------------------------
const onboarding = {
  currentStep: 1,
  completedSteps: {
    1: false,
    2: false,
    3: false
  },
  step2StartTime: 0,
  step3TestedMouth: false,
  step3TestedHand: false,
  step3Progress: 0
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
    
    // Load Hands & FaceMesh
    Promise.all([
      window.MovementController.loadMediaPipe(),
      window.MovementController.loadMediaPipeFaceMesh()
    ]).then(() => {
      console.log('[Game] Hands & FaceMesh loaded successfully.');
    }).catch(err => {
      console.error('[Game] Error loading MediaPipe libraries:', err);
    });
    
    onboarding.completedSteps[1] = true;
    const stepEl = document.getElementById('step-1');
    stepEl.classList.remove('active');
    stepEl.classList.add('completed');
    btnEnableCamera.innerText = 'Camera Active';
    
    window.MovementController.startProcessingLoop();
    
    activateStep(2);
    onboarding.step2StartTime = Date.now();
    window.MovementController.optical.startCalibration();
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable Camera';
    alert('Webcam permission denied. Falling back to mouse/keyboard controls.');
    
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

// ----------------------------------------------------
// Game Entities & Particle Definitions
// ----------------------------------------------------
class Balloon {
  constructor(x, y, color = '#ff00ff') {
    this.x = x;
    this.y = y;
    this.r = 40;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = -3;
    
    // Slow drift physics parameters
    this.gravity = 0.06; 
    this.drag = 0.988;
    this.color = color;
    
    // String wave parameters
    this.stringLength = 80;
    this.stringOffset = Math.random() * Math.PI * 2;
  }
  
  update(mouthWindIntensity, mouthX) {
    // Apply gravity
    this.vy += this.gravity;
    
    // Apply air drag
    this.vx *= this.drag;
    this.vy *= this.drag;
    
    // Apply wind forces
    // A. Webcam Mouth wind (if mouth is open and balloon is somewhat above the mouth column)
    if (mouthWindIntensity > 0) {
      const dx = this.x - mouthX;
      // Wind cone width: 360px (dx < 180)
      if (Math.abs(dx) < 180 && this.y < canvas.height - 50) {
        // Force fades out with horizontal distance and altitude
        const horizontalFactor = 1.0 - (Math.abs(dx) / 180);
        const distanceFactor = Math.max(0.1, 1.0 - (this.y / (canvas.height * 0.85)));
        const liftForce = -0.5 * mouthWindIntensity * distanceFactor * horizontalFactor;
        this.vy += liftForce;
        
        // Pushes balloon slightly away from mouth center column
        this.vx += (dx / 180) * 0.35 * mouthWindIntensity;
        
        // Visual wind particles
        if (Math.random() < 0.25) {
          createWindParticle(mouthX + (Math.random() - 0.5) * 45, canvas.height * 0.9);
        }
      }
    }
    
    // B. Keyboard Space / Click wind blast force
    if (keyboardWindBlast) {
      const dx = this.x - mouseX;
      if (Math.abs(dx) < 150) {
        const liftForce = -0.45 * (1.0 - Math.abs(dx) / 150);
        this.vy += liftForce;
        this.vx += (dx / 150) * 0.3;
      }
    }
    
    // Move balloon
    this.x += this.vx;
    this.y += this.vy;
    
    // Wall collisions
    if (this.x < this.r) {
      this.x = this.r;
      this.vx = Math.abs(this.vx) * 0.8;
      sounds.playBounce();
    }
    if (this.x > canvas.width - this.r) {
      this.x = canvas.width - this.r;
      this.vx = -Math.abs(this.vx) * 0.8;
      sounds.playBounce();
    }
    
    // Ceiling bounce
    if (this.y < this.r) {
      this.y = this.r;
      this.vy = Math.abs(this.vy) * 0.6;
      sounds.playBounce();
    }
  }
  
  draw(gCtx) {
    gCtx.save();
    gCtx.translate(this.x, this.y);
    
    // Neon glow blur
    gCtx.shadowBlur = 18;
    gCtx.shadowColor = this.color;
    
    // Draw balloon shape (oval egg)
    gCtx.fillStyle = 'rgba(5, 5, 5, 0.95)';
    gCtx.strokeStyle = this.color;
    gCtx.lineWidth = 3;
    
    gCtx.beginPath();
    gCtx.ellipse(0, 0, this.r * 0.85, this.r, 0, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.stroke();
    
    // Highlight glossy reflection
    gCtx.strokeStyle = '#ffffff';
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.arc(-this.r * 0.3, -this.r * 0.4, 8, Math.PI, Math.PI * 1.5);
    gCtx.stroke();
    
    // Knot at balloon bottom
    gCtx.fillStyle = this.color;
    gCtx.beginPath();
    gCtx.moveTo(-5, this.r);
    gCtx.lineTo(5, this.r);
    gCtx.lineTo(0, this.r + 6);
    gCtx.closePath();
    gCtx.fill();
    
    // Dangling String physics (wavy line)
    gCtx.restore();
    gCtx.save();
    gCtx.shadowBlur = 0; // turn off shadow for performance on thin line
    gCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    gCtx.lineWidth = 1.5;
    gCtx.beginPath();
    gCtx.moveTo(this.x, this.y + this.r + 6);
    
    // Wavy curve
    let prevX = this.x;
    let prevY = this.y + this.r + 6;
    for (let i = 1; i <= 6; i++) {
      const segmentY = this.y + this.r + 6 + (i * (this.stringLength / 6));
      const segmentX = this.x + Math.sin(this.stringOffset + i * 0.8 + (Date.now() / 200)) * 8 * (i / 6);
      gCtx.lineTo(segmentX, segmentY);
    }
    gCtx.stroke();
    gCtx.restore();
  }
}

// Particle Systems
class Spark {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.0 + Math.random() * 5.0;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 0.5;
    this.r = 2 + Math.random() * 4;
    this.alpha = 1.0;
    this.decay = 0.02 + Math.random() * 0.02;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.05; // gravity gravity
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

class WindParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vy = -1.5 - Math.random() * 3.5;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.r = 3 + Math.random() * 4;
    this.alpha = 0.6;
    this.decay = 0.015 + Math.random() * 0.015;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
  }
  draw(gCtx) {
    gCtx.save();
    gCtx.globalAlpha = this.alpha;
    gCtx.fillStyle = 'rgba(255, 0, 255, 0.4)';
    gCtx.shadowBlur = 6;
    gCtx.shadowColor = '#ff00ff';
    gCtx.beginPath();
    gCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.restore();
  }
}

// Global Entities Lists
let balloons = [];
let sparks = [];
let windParticles = [];
let score = 0;
let lives = 3;
let screenShake = 0;

function createWindParticle(x, y) {
  windParticles.push(new WindParticle(x, y));
}

function createWindBlast(x, y, width) {
  for (let i = 0; i < 15; i++) {
    const px = x + (Math.random() - 0.5) * width;
    const py = y - Math.random() * 30;
    windParticles.push(new WindParticle(px, py));
  }
}

function createSparks(x, y, color) {
  for (let i = 0; i < 20; i++) {
    sparks.push(new Spark(x, y, color));
  }
}

// ----------------------------------------------------
// UI HUD & Overlays
// ----------------------------------------------------
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
  sounds.stopWindSound();
  
  document.getElementById('go-score').innerText = `SCORE: ${score}`;
  saveHighScore(score);
  renderLeaderboards();
  sounds.playGameOver();
}

btnStartGame.addEventListener('click', () => {
  calibrationOverlay.style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  btnToggleBg.style.display = 'block';
  sounds.startWindSound();
  if (webcamView) {
    window.MovementController.videoElement = webcamView;
  }
  initGame();
});

btnRestart.addEventListener('click', () => {
  gameoverOverlay.style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  btnToggleBg.style.display = 'block';
  sounds.startWindSound();
  if (webcamView) {
    window.MovementController.videoElement = webcamView;
  }
  initGame();
});

function initGame() {
  score = 0;
  lives = 3;
  balloons = [];
  sparks = [];
  windParticles = [];
  screenShake = 0;
  
  hudScore.innerText = '00000';
  updateLivesUI();
  
  // Spawn initial balloon in the middle
  const neonColors = ['#ff00ff', '#e040fb', '#00ff88', '#00e5ff'];
  balloons.push(new Balloon(canvas.width / 2, canvas.height * 0.4, neonColors[0]));
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('START KEEPY!', 90);
}

function triggerAnnouncement(txt, duration = 90) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  setTimeout(() => {
    announcement.style.opacity = '0';
  }, duration * 16.6);
}

// ----------------------------------------------------
// Sensor Calibration Loop (Step Tracking)
// ----------------------------------------------------
function updateCalibration() {
  const active = window.MovementController.isFaceMeshLoaded && window.MovementController.isHandsLoaded;
  if (statAiConnected) {
    statAiConnected.innerText = active ? 'ACTIVE' : 'WAITING...';
    statAiConnected.className = `status-value ${active ? 'val-true' : 'val-false'}`;
  }
  
  const mouthOpen = window.MovementController.isMouthOpen;
  const mouthX = calculateMouthX();
  
  if (statMouth) {
    statMouth.innerText = mouthOpen ? 'WIND ON' : 'STILL';
    statMouth.className = `status-value ${mouthOpen ? 'val-true' : 'val-false'}`;
  }
  
  // Mirror and draw outlines
  drawCalibrationOverlay();
  
  // Steps progress
  if (onboarding.currentStep === 2) {
    const elapsed = Date.now() - onboarding.step2StartTime;
    const progress = Math.min(100, (elapsed / 3000) * 100);
    document.getElementById('step-2-progress').style.width = `${progress}%`;
    
    if (elapsed >= 3000) {
      onboarding.completedSteps[2] = true;
      const stepEl = document.getElementById('step-2');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      activateStep(3);
    }
  } else if (onboarding.currentStep === 3) {
    // Needs user to show mouth open OR raise hand to progress
    const handsDetected = window.MovementController.handLandmarksList && window.MovementController.handLandmarksList.length > 0;
    if (mouthOpen) onboarding.step3TestedMouth = true;
    if (handsDetected) onboarding.step3TestedHand = true;
    
    let targetProg = 0;
    if (onboarding.step3TestedMouth) targetProg += 50;
    if (onboarding.step3TestedHand) targetProg += 50;
    
    onboarding.step3Progress = Math.min(100, targetProg);
    document.getElementById('step-3-progress').style.width = `${onboarding.step3Progress}%`;
    
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

function calculateMouthX() {
  const landmarks = window.MovementController.faceLandmarksList;
  if (landmarks && landmarks.length > 0) {
    // average lip center coordinate (mirroring: canvas width - x)
    const lipCenter = landmarks[13];
    if (lipCenter) {
      return (1.0 - lipCenter.x) * canvas.width;
    }
  }
  return canvas.width / 2;
}

function drawCalibrationOverlay() {
  if (!webcamCalibrationView || !calibrationCanvasOverlay || !calCtx) return;
  if (webcamCalibrationView.paused || webcamCalibrationView.ended) return;
  
  const w = calibrationCanvasOverlay.width;
  const h = calibrationCanvasOverlay.height;
  
  // Mirror webcam render
  calCtx.save();
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  
  // Draw Face Mesh lines
  const landmarks = window.MovementController.faceLandmarksList;
  if (landmarks && landmarks.length > 0) {
    calCtx.strokeStyle = window.MovementController.isMouthOpen ? '#ff00ff' : 'rgba(255, 0, 255, 0.4)';
    calCtx.lineWidth = 1.5;
    
    // Draw lips contour
    const outerLips = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 95, 88, 61];
    calCtx.beginPath();
    outerLips.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (pt) {
        if (i === 0) calCtx.moveTo(pt.x * w, pt.y * h);
        else calCtx.lineTo(pt.x * w, pt.y * h);
      }
    });
    calCtx.stroke();
    
    // Draw jaw outline
    const jawOutline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
    calCtx.strokeStyle = 'rgba(255, 0, 255, 0.2)';
    calCtx.beginPath();
    jawOutline.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (pt) {
        if (i === 0) calCtx.moveTo(pt.x * w, pt.y * h);
        else calCtx.lineTo(pt.x * w, pt.y * h);
      }
    });
    calCtx.stroke();
  }
  
  // Draw Hand skeletons
  const handLandmarks = window.MovementController.handLandmarksList;
  if (handLandmarks && handLandmarks.length > 0) {
    calCtx.fillStyle = '#00ff88';
    calCtx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
    calCtx.lineWidth = 2;
    
    handLandmarks.forEach(hand => {
      // Draw joints
      hand.forEach(pt => {
        calCtx.beginPath();
        calCtx.arc(pt.x * w, pt.y * h, 3, 0, Math.PI * 2);
        calCtx.fill();
      });
      // Draw wrist connection lines
      const joints = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20]];
      joints.forEach(path => {
        calCtx.beginPath();
        path.forEach((idx, i) => {
          const pt = hand[idx];
          if (pt) {
            if (i === 0) calCtx.moveTo(pt.x * w, pt.y * h);
            else calCtx.lineTo(pt.x * w, pt.y * h);
          }
        });
        calCtx.stroke();
      });
    });
  }
  
  calCtx.restore();
  
  // Overlay bounding circle target box
  calCtx.strokeStyle = 'rgba(255, 0, 255, 0.15)';
  calCtx.strokeRect(60, 40, w - 120, h - 80);
}

// ----------------------------------------------------
// Main Game Update and Render Loop
// ----------------------------------------------------
let lastTime = performance.now();
const neonColors = ['#ff00ff', '#e040fb', '#00ff88', '#00e5ff'];

function gameLoop(time) {
  const dt = time - lastTime;
  lastTime = time;
  
  // Limit max step to avoid freezing frame lag pop-through
  const step = Math.min(dt / 16.66, 4.0);
  
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateCalibration();
  } else if (currentGameState === GAME_STATE.PLAYING) {
    updateGame(step);
    renderGame();
  }
  
  // Maintain FPS counter in debug
  if (dbgFps && Math.random() < 0.05) {
    const fps = Math.round(1000 / (dt || 1));
    dbgFps.innerText = String(fps);
  }
  
  requestAnimationFrame(gameLoop);
}

function updateGame(step) {
  // Screen shake decay
  if (screenShake > 0) {
    screenShake -= 0.15 * step;
  }
  
  // 1. Fetch sensor inputs
  const aiConnected = window.MovementController.isHandsLoaded || window.MovementController.isFaceMeshLoaded;
  const mouthOpen = window.MovementController.isMouthOpen;
  const mouthWindIntensity = mouthOpen ? window.MovementController.lipDistance * 6.5 : 0;
  const mouthX = calculateMouthX();
  
  const handsList = window.MovementController.handLandmarksList || [];
  const faceList = window.MovementController.faceLandmarksList || [];
  const isWebcamActive = (handsList.length > 0 || faceList.length > 0);
  
  // Toggle fallback mouse paddle & cursor based on active sensor tracking
  if (isWebcamActive) {
    isMousePaddleActive = false;
    canvas.style.cursor = 'none';
  } else {
    isMousePaddleActive = true;
    canvas.style.cursor = 'default';
  }
  
  // Set wind sound synthesizer volume
  sounds.setWindVolume(mouthOpen ? Math.min(1.0, window.MovementController.lipDistance * 8) : (keyboardWindBlast ? 0.4 : 0));
  
  // Dynamic debug panel updates
  dbgGemini.innerText = aiConnected ? 'connected' : 'mouse-mode';
  dbgGemini.style.color = aiConnected ? '#ff00ff' : '#666';
  dbgMouthState.innerText = (mouthWindIntensity || (keyboardWindBlast ? 1.0 : 0.0)).toFixed(1);
  
  dbgHandsCount.innerText = String(handsList.length);
  dbgBalloons.innerText = String(balloons.length);
  dbgScore.innerText = String(score);
  
  // Bottom mini view indicator sync
  indMouthActive.className = `indicator-dot ${aiConnected ? 'active' : ''}`;
  indMouthText.innerText = aiConnected ? 'LOCAL SENSORS ACTIVE' : 'KEYBOARD & MOUSEFALLBACK';
  
  // 2. Spawn wind visual ripples
  if (mouthOpen && Math.random() < 0.4) {
    createWindParticle(mouthX + (Math.random() - 0.5) * 60, canvas.height - 30);
  }
  if (keyboardWindBlast && Math.random() < 0.4) {
    createWindParticle(mouseX + (Math.random() - 0.5) * 60, canvas.height - 30);
  }
  
  // 3. Update wind particles
  windParticles.forEach(wp => wp.update());
  windParticles = windParticles.filter(wp => wp.alpha > 0);
  
  // 4. Update spark particles
  sparks.forEach(s => s.update());
  sparks = sparks.filter(s => s.alpha > 0);
  
  // 5. Update balloons and resolve collisions
  balloons.forEach((b, bIdx) => {
    b.update(mouthWindIntensity, mouthX);
    
    // Check collisions with bottom laser danger line
    if (b.y > canvas.height - b.r - 20) {
      // Pop! Balloon touches ground laser grid
      createSparks(b.x, canvas.height - 25, b.color);
      sounds.playPop();
      balloons.splice(bIdx, 1);
      screenShake = 3.0;
      
      lives--;
      updateLivesUI();
      
      if (lives <= 0) {
        triggerGameOver();
      } else {
        // Respawn replacement balloon in the center
        setTimeout(() => {
          if (currentGameState === GAME_STATE.PLAYING && balloons.length === 0) {
            const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];
            balloons.push(new Balloon(canvas.width / 2, canvas.height * 0.3, randomColor));
          }
        }, 1000);
      }
      return;
    }
    
    // Resolve collisions with player's head (webcam FaceMesh)
    const landmarks = window.MovementController.faceLandmarksList;
    if (landmarks && landmarks.length > 0) {
      // Head coordinates
      const forehead = landmarks[10];
      const chin = landmarks[152];
      if (forehead && chin) {
        // FaceMesh coordinates are normalized (0 to 1), mirrored x-axis
        const headX = (1.0 - (forehead.x + chin.x) / 2) * canvas.width;
        const headY = ((forehead.y + chin.y) / 2) * canvas.height;
        const headR = Math.max(25, Math.abs(forehead.y - chin.y) * 0.7 * canvas.height); // dynamic head radius
        
        const dx = b.x - headX;
        const dy = b.y - headY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < b.r + headR) {
          // Elastic collision resolution (bounce balloon off head)
          const angle = Math.atan2(dy, dx);
          
          // Reposition to prevent sticking inside head
          b.x = headX + Math.cos(angle) * (b.r + headR);
          b.y = headY + Math.sin(angle) * (b.r + headR);
          
          // Set velocity: launch up/outward
          b.vx = Math.cos(angle) * 5 + (b.x - headX) * 0.05;
          b.vy = Math.min(-3.5, Math.sin(angle) * 6.0); // always bounce upwards
          
          score++;
          hudScore.innerText = String(score).padStart(5, '0');
          createSparks(b.x, b.y + b.r * 0.5, b.color);
          sounds.playBounce();
          
          // Check balloon spawning rate difficulty
          checkDifficultyProgression();
        }
      }
    }
    
    // Resolve collisions with player's hands (webcam MediaPipe Hands)
    const hands = window.MovementController.handLandmarksList;
    if (hands && hands.length > 0) {
      hands.forEach(hand => {
        // Collide with index tip (8) and palm center (9)
        const collisionPoints = [8, 9];
        collisionPoints.forEach(ptIdx => {
          const pt = hand[ptIdx];
          if (pt) {
            const hx = (1.0 - pt.x) * canvas.width;
            const hy = pt.y * canvas.height;
            const handR = 25; // collider radius
            
            const dx = b.x - hx;
            const dy = b.y - hy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < b.r + handR) {
              const angle = Math.atan2(dy, dx);
              
              // Push out of hand bounding circle
              b.x = hx + Math.cos(angle) * (b.r + handR);
              b.y = hy + Math.sin(angle) * (b.r + handR);
              
              // Bounce upward/outward
              b.vx = Math.cos(angle) * 6.5;
              b.vy = Math.min(-3.5, Math.sin(angle) * 7.5);
              
              score++;
              hudScore.innerText = String(score).padStart(5, '0');
              createSparks(hx, hy, b.color);
              sounds.playBounce();
              
              checkDifficultyProgression();
            }
          }
        });
      });
    }
    
    // Resolve collisions with fallback mouse safety paddle
    if (isMousePaddleActive) {
      const paddleW = 150;
      const paddleH = 14;
      const px = mouseX - paddleW / 2;
      const py = mouseY;
      
      // Box circle collision check
      if (b.x + b.r > px && b.x - b.r < px + paddleW && b.y + b.r > py && b.y - b.r < py + paddleH) {
        // Bounce off paddle
        b.y = py - b.r - 2;
        b.vy = -Math.abs(b.vy) * 0.75 - 3.8; // launch up
        
        // Tilt direction based on landing spot relative to center
        const offset = (b.x - mouseX) / (paddleW / 2);
        b.vx += offset * 2.5;
        
        score++;
        hudScore.innerText = String(score).padStart(5, '0');
        createSparks(b.x, py, b.color);
        sounds.playBounce();
        
        checkDifficultyProgression();
      }
    }
  });
}

function checkDifficultyProgression() {
  // Spawn 2nd balloon at score 10
  if (score >= 10 && balloons.length === 1) {
    const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];
    balloons.push(new Balloon(canvas.width * 0.3, canvas.height * 0.25, randomColor));
    triggerAnnouncement('DOUBLE BALLOONS!', 60);
  }
  // Spawn 3rd balloon at score 20
  if (score >= 20 && balloons.length === 2) {
    const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];
    balloons.push(new Balloon(canvas.width * 0.7, canvas.height * 0.3, randomColor));
    triggerAnnouncement('TRIPLE HEAT!', 60);
  }
  // Spawn 4th balloon at score 40
  if (score >= 40 && balloons.length === 3) {
    const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];
    balloons.push(new Balloon(canvas.width * 0.5, canvas.height * 0.25, randomColor));
    triggerAnnouncement('BALLOON MAYHEM!', 60);
  }
}

function renderGame() {
  ctx.save();
  
  // Camera shake effect on impact
  if (screenShake > 0) {
    const dx = (Math.random() - 0.5) * screenShake * 5;
    const dy = (Math.random() - 0.5) * screenShake * 5;
    ctx.translate(dx, dy);
  }
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 1. Draw Background
  if (backgroundMode === 'camera' && webcamView.srcObject) {
    // Mirror webcam backdrop
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.3; // faded background
    ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    // Cyber Dojo grid animation backdrop
    drawCyberDojoBackdrop();
  }
  
  // 2. Draw lasers floor danger line
  drawLasersFloor();
  
  // 3. Draw wind visuals
  windParticles.forEach(wp => wp.draw(ctx));
  
  // 4. Draw spark particles
  sparks.forEach(s => s.draw(ctx));
  
  // 5. Draw interactive safety fallback paddle
  if (isMousePaddleActive) {
    drawSafetyPaddle();
  }
  
  // 6. Draw balloons
  balloons.forEach(b => b.draw(ctx));
  
  // 7. Render webcam overlays (head outlines and hands) directly on canvas!
  drawSkeletalOverlays();
  
  ctx.restore();
}

function drawCyberDojoBackdrop() {
  const gridSpacing = 45;
  const timeOffset = (Date.now() / 45) % gridSpacing;
  
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 0, 255, 0.05)';
  ctx.lineWidth = 1.0;
  
  // Vertical lines
  for (let x = 0; x < canvas.width; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  
  // Moving horizontal grid lines
  for (let y = timeOffset; y < canvas.height; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  // Glowing ambient floor horizon line
  ctx.strokeStyle = 'rgba(255, 0, 255, 0.12)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height * 0.75);
  ctx.lineTo(canvas.width, canvas.height * 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawLasersFloor() {
  ctx.save();
  const y = canvas.height - 20;
  
  // Glow line
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ff003c';
  ctx.strokeStyle = '#ff003c';
  ctx.lineWidth = 4;
  
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  
  // Strobe pattern dots
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 20]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  
  ctx.restore();
}

function drawSafetyPaddle() {
  ctx.save();
  const paddleW = 150;
  const paddleH = 14;
  const px = mouseX - paddleW / 2;
  const py = mouseY;
  
  // Bounding glassmorphism body
  ctx.fillStyle = 'rgba(8, 8, 8, 0.8)';
  ctx.strokeStyle = '#ff00ff';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ff00ff';
  
  // Draw capsule paddle
  ctx.beginPath();
  ctx.roundRect(px, py, paddleW, paddleH, 7);
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

function drawSkeletalOverlays() {
  // A. Draw head visual ellipse (FaceMesh)
  const landmarks = window.MovementController.faceLandmarksList;
  if (landmarks && landmarks.length > 0) {
    const forehead = landmarks[10];
    const chin = landmarks[152];
    if (forehead && chin) {
      const hx = (1.0 - (forehead.x + chin.x) / 2) * canvas.width;
      const hy = ((forehead.y + chin.y) / 2) * canvas.height;
      const headR = Math.max(25, Math.abs(forehead.y - chin.y) * 0.75 * canvas.height);
      
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.28)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff00ff';
      ctx.fillStyle = 'rgba(255, 0, 255, 0.02)';
      
      ctx.beginPath();
      ctx.ellipse(hx, hy, headR * 0.8, headR, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw eyes target circles
      ctx.fillStyle = 'rgba(255, 0, 255, 0.4)';
      const eyeL = landmarks[130];
      const eyeR = landmarks[359];
      if (eyeL && eyeR) {
        const lx = (1.0 - eyeL.x) * canvas.width;
        const ly = eyeL.y * canvas.height;
        const rx = (1.0 - eyeR.x) * canvas.width;
        const ry = eyeR.y * canvas.height;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  
  // B. Draw hand skeleton outlines (MediaPipe Hands)
  const hands = window.MovementController.handLandmarksList;
  if (hands && hands.length > 0) {
    ctx.save();
    ctx.fillStyle = '#00ff88';
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ff88';
    
    hands.forEach(hand => {
      // Draw palm/wrist skeleton
      const connections = [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [5, 9, 13, 17, 0],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
        [17, 18, 19, 20]
      ];
      
      connections.forEach(line => {
        ctx.beginPath();
        line.forEach((idx, i) => {
          const pt = hand[idx];
          if (pt) {
            const hx = (1.0 - pt.x) * canvas.width;
            const hy = pt.y * canvas.height;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
        });
        ctx.stroke();
      });
      
      // Draw key circles (wrist index pinky)
      [0, 8, 12, 16, 20].forEach(idx => {
        const pt = hand[idx];
        if (pt) {
          const hx = (1.0 - pt.x) * canvas.width;
          const hy = pt.y * canvas.height;
          ctx.beginPath();
          ctx.arc(hx, hy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
    ctx.restore();
  }
}

// ----------------------------------------------------
// Start loop initialization
// ----------------------------------------------------
requestAnimationFrame(gameLoop);
