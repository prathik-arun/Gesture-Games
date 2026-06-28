// Gesture Luffy — Web Game Controller

const GAME_STATE = {
  MENU: 'menu',
  CALIBRATING: 'calibrating',
  PLAYING: 'playing',
  GAMEOVER: 'gameover'
};

const PLAY_MODE = {
  SANDBOX: 'sandbox',
  BATTLE: 'battle'
};

// Canvas & Contexts
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const webcamView = document.getElementById('webcam-view');
const webcamCalibrationView = document.getElementById('webcam-calibration-view');
const calibrationCanvasOverlay = document.getElementById('calibration-canvas-overlay');
const calCtx = calibrationCanvasOverlay.getContext('2d');

// DOM Overlays
const menuOverlay = document.getElementById('menu-overlay');
const calibrationOverlay = document.getElementById('calibration-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const hud = document.getElementById('hud');

// Buttons
const btnEnterCalibration = document.getElementById('btn-enter-calibration');
const btnEnableCamera = document.getElementById('btn-enable-camera');
const btnStartGame = document.getElementById('btn-start-game');
const btnRestart = document.getElementById('btn-restart');

// HUD Values
const hudModeVal = document.getElementById('hud-mode-val');
const hudGestureVal = document.getElementById('hud-gesture-val');
const sandboxLabel = document.getElementById('hud-sandbox-label');

// Debug Monitor Values
const dbgHandsCount = document.getElementById('dbg-hands-count');
const dbgFaceOk = document.getElementById('dbg-face-ok');
const dbgPinchVal = document.getElementById('dbg-pinch-val');
const dbgPinchDist = document.getElementById('dbg-pinch-dist');
const dbgStretch = document.getElementById('dbg-stretch');
const dbgMouth = document.getElementById('dbg-mouth');
const dbgFps = document.getElementById('dbg-fps');

// State Variables
let currentGameState = GAME_STATE.MENU;
let currentPlayMode = PLAY_MODE.SANDBOX;
let score = 0;
let comboCount = 0;
let lastHitTime = 0;
let health = 100;
let highscore = 0;
let calibrationStep = 1;
let backgroundMode = 'camera'; // 'camera' | 'grid'
let screenShake = 0;
let activeFingerRelease = null;

// Frame rate variables
let lastFrameTime = performance.now();
let lastFpsTime = performance.now();
let fpsCount = 0;

// Onboarding State
const onboardingStatus = {
  camera: false,
  calibrated: false,
  pinched: false,
  pinchProgress: 0
};

// ----------------------------------------------------
// Web Audio API Sound Synthesizer
// ----------------------------------------------------
class SoundSynth {
  constructor() {
    this.ctx = null;
    this.stretchOsc = null;
    this.stretchGain = null;
  }
  
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  playStretch(amount) {
    this.init();
    if (!this.ctx) return;
    
    if (!this.stretchOsc) {
      this.stretchOsc = this.ctx.createOscillator();
      this.stretchGain = this.ctx.createGain();
      this.stretchOsc.type = 'triangle';
      
      this.stretchOsc.connect(this.stretchGain);
      this.stretchGain.connect(this.ctx.destination);
      this.stretchOsc.start();
    }
    
    // Map stretch amount to rubbery creak frequency (120Hz to 400Hz)
    const targetFreq = 110 + amount * 300;
    const now = this.ctx.currentTime;
    
    this.stretchOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
    this.stretchGain.gain.setTargetAtTime(Math.min(0.06, amount * 0.12), now, 0.05);
  }
  
  stopStretch() {
    if (this.stretchOsc) {
      try {
        this.stretchOsc.stop();
      } catch (e) {}
      this.stretchOsc = null;
      this.stretchGain = null;
    }
  }
  
  playSnap() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    // Classic sproing pitch envelope
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.12);
    osc.frequency.linearRampToValueAtTime(160, now + 0.22);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.35);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.35);
  }
  
  playPunch() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);
    
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }
  
  playExplosion() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const bufferSize = this.ctx.sampleRate * 0.35;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + 0.3);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start(now);
    noise.stop(now + 0.35);
  }

  playModeSwitch() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(440, now + 0.1);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}
const sounds = new SoundSynth();

// ----------------------------------------------------
// Face Stretching Anchor Definitions
// ----------------------------------------------------
// Useful MediaPipe Face Mesh indexes for stretch zones
const FACE_ANCHORS = {
  LEFT_CHEEK: { index: 234, name: 'Left Cheek', isRightSide: false },
  RIGHT_CHEEK: { index: 454, name: 'Right Cheek', isRightSide: true },
  NOSE_TIP: { index: 4, name: 'Nose Tip', isRightSide: false },
  CHIN: { index: 152, name: 'Chin', isRightSide: false }
};

// Physics offsets for face landmarks (spring recoil wiggling)
const faceOffsets = {};
Object.keys(FACE_ANCHORS).forEach(key => {
  faceOffsets[FACE_ANCHORS[key].index] = { x: 0, y: 0, vx: 0, vy: 0 };
});

// Active stretching state
let activeStretch = null; // { anchorIndex, handIndex, startHandPos, currentHandPos, cropCanvas }

// ----------------------------------------------------
// Attack Elements (Gomu Gomu attacks)
// ----------------------------------------------------
class LuffyArm {
  constructor(shoulderX, shoulderY, targetX, targetY, isGatling = false, isBazooka = false) {
    this.startX = shoulderX;
    this.startY = shoulderY;
    this.targetX = targetX;
    this.targetY = targetY;
    
    this.progress = 0; // 0 to 1 (extend), 1 to 0 (retract)
    this.direction = 1; // 1 = extending, -1 = retracting
    this.speed = isGatling ? 0.16 : 0.08;
    this.isDead = false;
    
    this.isGatling = isGatling;
    this.isBazooka = isBazooka;
    
    // Wave animation along arm
    this.waveOffset = Math.random() * Math.PI * 2;
    sounds.playPunch();
  }
  
  update() {
    this.progress += this.direction * this.speed;
    if (this.progress >= 1) {
      this.progress = 1;
      this.direction = -1;
      // Trigger collision at peak stretch
      this.checkCollisions();
    } else if (this.progress <= 0) {
      this.progress = 0;
      this.isDead = true;
    }
  }
  
  checkCollisions() {
    let hitSomething = false;
    
    targets.forEach(target => {
      if (target.isHit) return;
      const dx = target.x - this.targetX;
      const dy = target.y - this.targetY;
      const dist = Math.hypot(dx, dy);
      
      const collisionDist = this.isBazooka ? 100 : 65;
      if (dist < collisionDist) {
        target.hit();
        hitSomething = true;
      }
    });
    
    if (hitSomething) {
      sounds.playExplosion();
      triggerScreenShake(this.isBazooka ? 24 : 12);
      
      // Update score and combo
      comboCount++;
      lastHitTime = Date.now();
      score += 100 * comboCount;
      hudScore.innerText = String(score).padStart(5, '0');
      hudCombo.innerText = `x${comboCount}`;
      hudCombo.style.transform = 'scale(1.3)';
      setTimeout(() => { hudCombo.style.transform = 'scale(1)'; }, 150);
    }
  }
  
  draw(gCtx) {
    gCtx.save();
    
    // Interpolate punch head position
    const curX = this.startX + (this.targetX - this.startX) * this.progress;
    const curY = this.startY + (this.targetY - this.startY) * this.progress;
    
    // 1. Draw rubber arm connector (One piece style red tube with wavy outline)
    gCtx.lineWidth = this.isBazooka ? 28 : (this.isGatling ? 12 : 20);
    gCtx.lineCap = 'round';
    gCtx.lineJoin = 'round';
    gCtx.strokeStyle = '#c0392b'; // deep crimson red sleeve
    
    // Draw wavy bezier arm path
    gCtx.beginPath();
    gCtx.moveTo(this.startX, this.startY);
    
    const midX = (this.startX + curX) / 2;
    const midY = (this.startY + curY) / 2;
    const dx = curX - this.startX;
    const dy = curY - this.startY;
    const len = Math.hypot(dx, dy);
    
    // Calculate normal vector for wave displacement
    const nx = -dy / len;
    const ny = dx / len;
    
    const waveAmp = Math.sin(this.progress * Math.PI + this.waveOffset) * (len * 0.08);
    const ctrlX = midX + nx * waveAmp;
    const ctrlY = midY + ny * waveAmp;
    
    gCtx.quadraticCurveTo(ctrlX, ctrlY, curX, curY);
    gCtx.stroke();
    
    // Inner skin layer of arm for detail
    gCtx.lineWidth = this.isBazooka ? 18 : (this.isGatling ? 6 : 12);
    gCtx.strokeStyle = '#f5c6a5'; // skin color rubber center
    gCtx.stroke();
    
    // 2. Yellow cuff at wrist
    gCtx.save();
    gCtx.translate(curX, curY);
    const angle = Math.atan2(curY - ctrlY, curX - ctrlX);
    gCtx.rotate(angle);
    
    gCtx.fillStyle = '#ffd700'; // Straw Hat Gold Cuff
    gCtx.fillRect(-15, -15, 8, 30);
    gCtx.restore();
    
    // 3. Draw giant fist (Foreshortening makes fist huge at peak progress)
    const fistBaseSize = this.isBazooka ? 45 : (this.isGatling ? 20 : 32);
    const fistSize = fistBaseSize * (0.8 + this.progress * 0.6);
    
    gCtx.shadowBlur = 15;
    gCtx.shadowColor = 'rgba(255, 59, 48, 0.4)';
    
    gCtx.fillStyle = '#e8a87c'; // skin tone fist
    gCtx.strokeStyle = '#331a00';
    gCtx.lineWidth = 3;
    
    gCtx.beginPath();
    gCtx.arc(curX, curY, fistSize, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.stroke();
    
    // Draw knuckles lines inside fist
    gCtx.strokeStyle = 'rgba(51, 26, 0, 0.5)';
    gCtx.lineWidth = 2.5;
    gCtx.beginPath();
    gCtx.arc(curX - fistSize*0.2, curY, fistSize*0.4, -Math.PI/2, Math.PI/2);
    gCtx.stroke();
    
    gCtx.restore();
  }
}

// ----------------------------------------------------
// Battle Targets (Cannonballs and Warships)
// ----------------------------------------------------
class BattleTarget {
  constructor() {
    this.w = 55;
    this.h = 55;
    this.x = canvas.width + this.w;
    this.y = Math.random() * (canvas.height - 240) + 100;
    
    this.isShip = Math.random() < 0.35;
    this.speed = (2.2 + Math.random() * 2.8);
    this.isHit = false;
    this.hitProgress = 0;
    
    // Custom neon colors
    this.color = this.isShip ? '#e67e22' : '#9d00ff';
  }
  
  update() {
    if (this.isHit) {
      this.hitProgress += 0.08;
      if (this.hitProgress >= 1) {
        this.hitProgress = 1;
      }
    } else {
      this.x -= this.speed;
    }
  }
  
  hit() {
    this.isHit = true;
    // Spawn debris particles
    for (let i = 0; i < 15; i++) {
      particles.push(new TargetParticle(this.x, this.y, this.color));
    }
  }
  
  draw(gCtx) {
    if (this.isHit) {
      // Draw expanding impact shockwave ring
      gCtx.save();
      gCtx.strokeStyle = this.color;
      gCtx.globalAlpha = 1.0 - this.hitProgress;
      gCtx.lineWidth = 3;
      gCtx.beginPath();
      gCtx.arc(this.x, this.y, this.hitProgress * 65, 0, Math.PI * 2);
      gCtx.stroke();
      gCtx.restore();
      return;
    }
    
    gCtx.save();
    gCtx.shadowBlur = 10;
    gCtx.shadowColor = this.color;
    
    if (this.isShip) {
      // Draw Marine Warship (floating neon sails)
      gCtx.fillStyle = '#060608';
      gCtx.strokeStyle = this.color;
      gCtx.lineWidth = 2.5;
      
      // Hull
      gCtx.beginPath();
      gCtx.moveTo(this.x - 25, this.y + 10);
      gCtx.lineTo(this.x + 25, this.y + 10);
      gCtx.lineTo(this.x + 15, this.y + 25);
      gCtx.lineTo(this.x - 15, this.y + 25);
      gCtx.closePath();
      gCtx.fill();
      gCtx.stroke();
      
      // Sails
      gCtx.beginPath();
      gCtx.moveTo(this.x - 15, this.y + 5);
      gCtx.lineTo(this.x, this.y - 20);
      gCtx.lineTo(this.x + 15, this.y + 5);
      gCtx.stroke();
      
      // Flag
      gCtx.fillStyle = '#e74c3c';
      gCtx.fillRect(this.x, this.y - 25, 10, 6);
    } else {
      // Draw Cannonball (spiky neon sphere)
      gCtx.fillStyle = '#060608';
      gCtx.strokeStyle = this.color;
      gCtx.lineWidth = 2.5;
      
      gCtx.beginPath();
      gCtx.arc(this.x, this.y, 22, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.stroke();
      
      // Spikes
      gCtx.strokeStyle = '#fff';
      gCtx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        gCtx.beginPath();
        gCtx.moveTo(this.x + Math.cos(angle)*18, this.y + Math.sin(angle)*18);
        gCtx.lineTo(this.x + Math.cos(angle)*26, this.y + Math.sin(angle)*26);
        gCtx.stroke();
      }
    }
    
    gCtx.restore();
  }
}

// Particle class for hits
class TargetParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = Math.random() * 2.5 + 1.5;
    this.color = color;
    this.alpha = 1;
    this.decay = 0.02 + Math.random() * 0.02;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.08; // subtle gravity drift
    this.alpha -= this.decay;
  }
  
  draw(gCtx) {
    gCtx.save();
    gCtx.globalAlpha = this.alpha;
    gCtx.fillStyle = this.color;
    gCtx.beginPath();
    gCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.restore();
  }
}

// Global Game Object arrays
let arms = [];
let targets = [];
let particles = [];
let targetSpawnTimer = 0;

// Recoil/Spring Physics Constants
const springK = 0.18;   // stiffness
const springDamp = 0.22; // damping coefficient

// Track hand positions over last few frames to detect rapid motion (punches)
const handHistory = [
  { x: 0.5, y: 0.5, vx: 0, vy: 0 }, // Hand 0 (usually active right)
  { x: 0.5, y: 0.5, vx: 0, vy: 0 }  // Hand 1 (left)
];

// Helper to shake screen
function triggerScreenShake(intensity) {
  screenShake = intensity;
}

// ----------------------------------------------------
// Fallback controls (Mouse & Keyboard)
// ----------------------------------------------------
let isMouseDown = false;
let mouseX = 0;
let mouseY = 0;

window.addEventListener('mousedown', (e) => {
  if (currentGameState !== GAME_STATE.PLAYING) return;
  isMouseDown = true;
  
  // Update mouse position mapped to canvas
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  
  // If not pinching in camera mode, mouse acts as a manual pinch
  // Find closest anchor to mouse
  let closestZone = null;
  let closestDist = 80; // trigger radius
  
  const landmarks = window.MovementController.faceLandmarksList;
  if (landmarks && landmarks.length > 0) {
    Object.keys(FACE_ANCHORS).forEach(key => {
      const anchor = FACE_ANCHORS[key];
      const pt = landmarks[anchor.index];
      if (pt) {
        const ax = (1.0 - pt.x) * canvas.width;
        const ay = pt.y * canvas.height;
        const dist = Math.hypot(mouseX - ax, mouseY - ay);
        if (dist < closestDist) {
          closestDist = dist;
          closestZone = anchor.index;
        }
      }
    });
    
    if (closestZone !== null) {
      // Start mouse sandbox stretch
      startSandboxStretch(closestZone, 0, mouseX, mouseY);
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (!isMouseDown) return;
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  
  if (activeStretch) {
    activeStretch.currentHandPos = { x: mouseX, y: mouseY };
  }
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
  if (activeStretch) {
    releaseSandboxStretch();
  }
});

// Resize Canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Load High Score
function loadHighScore() {
  const saved = localStorage.getItem('gesture_luffy_highscore');
  if (saved) {
    highscore = parseInt(saved, 10);
  }
}
loadHighScore();

// ----------------------------------------------------
// Onboarding & Calibration Loops
// ----------------------------------------------------
btnEnterCalibration.addEventListener('click', () => {
  menuOverlay.style.display = 'none';
  calibrationOverlay.style.display = 'flex';
  currentGameState = GAME_STATE.CALIBRATING;
});

btnEnableCamera.addEventListener('click', async () => {
  btnEnableCamera.disabled = true;
  btnEnableCamera.innerText = 'Starting...';
  
  const ok = await window.MovementController.initCamera(webcamCalibrationView);
  if (ok) {
    webcamView.srcObject = window.MovementController.stream;
    webcamView.play().catch(() => {});
    
    // Load Hands and Face Mesh together!
    Promise.all([
      window.MovementController.loadMediaPipe(),
      window.MovementController.loadMediaPipeFaceMesh()
    ]).then(() => {
      console.log('[Luffy] Face Mesh & Hands loaded.');
      onboardingStatus.camera = true;
      
      const stepEl = document.getElementById('step-1');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      btnEnableCamera.innerText = 'Camera Active';
      
      window.MovementController.startProcessingLoop();
      
      activateStep(2);
      startFaceCenteringCalibration();
    }).catch(err => {
      console.error('[Luffy] Error loading MediaPipe solution:', err);
      alert('MediaPipe failed to load. Falling back to mouse controls.');
      bypassCalibration();
    });
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable';
    alert('Webcam permission denied. Falling back to mouse controls.');
    bypassCalibration();
  }
});

function activateStep(stepNum) {
  calibrationStep = stepNum;
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}`);
    if (i === stepNum) {
      el.classList.add('active');
    } else if (i < stepNum) {
      el.classList.remove('active');
      el.classList.add('completed');
    } else {
      el.classList.remove('active', 'completed');
    }
  }
}

function startFaceCenteringCalibration() {
  window.MovementController.optical.startCalibration();
  let count = 0;
  const progressFill = document.getElementById('step-2-progress');
  
  const timer = setInterval(() => {
    count += 5;
    progressFill.style.width = `${count}%`;
    if (count >= 100) {
      clearInterval(timer);
      onboardingStatus.calibrated = true;
      activateStep(3);
    }
  }, 100);
}

function bypassCalibration() {
  onboardingStatus.camera = true;
  onboardingStatus.calibrated = true;
  onboardingStatus.pinched = true;
  document.getElementById('btn-start-game').removeAttribute('disabled');
}

btnStartGame.addEventListener('click', () => {
  calibrationOverlay.style.display = 'none';
  hud.style.display = 'flex';
  startGame();
});

function startGame() {
  score = 0;
  comboCount = 0;
  health = 100;
  arms = [];
  targets = [];
  particles = [];
  
  currentGameState = GAME_STATE.PLAYING;
  triggerAnnouncement('AWAKEN!', 90);
  
  // Set starting play mode to Sandbox
  currentPlayMode = PLAY_MODE.SANDBOX;
  hudModeVal.innerText = 'SANDBOX';
  hudModeVal.style.color = '#ff3b30';
  hudModeVal.style.textShadow = '0 0 10px rgba(255, 59, 48, 0.5)';
  sandboxLabel.style.display = 'block';
  scorePanel.style.display = 'none';
}

function triggerAnnouncement(txt, duration = 90) {
  const banner = document.getElementById('announcement');
  banner.innerText = txt;
  banner.style.opacity = '1';
  setTimeout(() => {
    banner.style.opacity = '0';
  }, duration * 16.6);
}

// ----------------------------------------------------
// Interactive Face Stretching Logics
// ----------------------------------------------------
function startSandboxStretch(anchorIndex, handIndex, startX, startY, isFinger = false, targetHandIndex = -1) {
  const cropSize = isFinger ? 24 : 60;
  const radius = cropSize / 2;
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropSize;
  cropCanvas.height = cropSize;
  const cCtx = cropCanvas.getContext('2d');
  
  // Default fallback capture pattern
  cCtx.fillStyle = '#ff66cc';
  cCtx.beginPath();
  cCtx.arc(radius, radius, radius, 0, Math.PI * 2);
  cCtx.fill();
  
  // Check if camera stream is active to sample texture
  if (webcamView.srcObject) {
    const videoW = webcamView.videoWidth;
    const videoH = webcamView.videoHeight;
    let pt = null;
    
    if (isFinger) {
      const handList = window.MovementController.handLandmarksList || [];
      const targetHand = handList[targetHandIndex];
      if (targetHand) {
        pt = targetHand[anchorIndex];
      }
    } else {
      const landmarks = window.MovementController.faceLandmarksList;
      if (landmarks && landmarks[anchorIndex]) {
        pt = landmarks[anchorIndex];
      }
    }
    
    if (pt) {
      const vx = pt.x * videoW;
      const vy = pt.y * videoH;
      
      // Clamp crop region within the video bounds
      const cropX = Math.max(0, Math.min(videoW - cropSize, vx - radius));
      const cropY = Math.max(0, Math.min(videoH - cropSize, vy - radius));
      
      cCtx.clearRect(0, 0, cropSize, cropSize);
      cCtx.save();
      
      // Mirror the slice horizontally to align with the mirrored canvas background
      cCtx.translate(cropSize, 0);
      cCtx.scale(-1, 1);
      
      // Draw square webcam slice onto crop canvas
      cCtx.drawImage(
        webcamView, 
        cropX, cropY, cropSize, cropSize, // crop source
        0, 0, cropSize, cropSize          // draw destination
      );
      cCtx.restore();
    }
  }
  
  activeStretch = {
    isFinger: isFinger,
    targetHandIndex: targetHandIndex,
    anchorIndex: anchorIndex,
    handIndex: handIndex,
    startHandPos: { x: startX, y: startY },
    currentHandPos: { x: startX, y: startY },
    cropCanvas: cropCanvas
  };
  
  if (!isFinger) {
    // Set velocity of offset to zero while dragging
    const offset = faceOffsets[anchorIndex];
    if (offset) {
      offset.vx = 0;
      offset.vy = 0;
    }
  }
}

function updateSandboxStretch(currX, currY) {
  if (!activeStretch) return;
  activeStretch.currentHandPos = { x: currX, y: currY };
  
  // Calculate drag length
  const anchor = activeStretch.anchorIndex;
  const landmarks = window.MovementController.faceLandmarksList;
  
  let ax = activeStretch.startHandPos.x;
  let ay = activeStretch.startHandPos.y;
  
  if (landmarks && landmarks[anchor]) {
    ax = (1.0 - landmarks[anchor].x) * canvas.width;
    ay = landmarks[anchor].y * canvas.height;
  }
  
  const dx = currX - ax;
  const dy = currY - ay;
  const dist = Math.hypot(dx, dy);
  
  sounds.playStretch(Math.min(1.0, dist / 400));
}

function releaseSandboxStretch() {
  if (!activeStretch) return;
  
  const anchor = activeStretch.anchorIndex;
  const currentPos = activeStretch.currentHandPos;
  
  if (activeStretch.isFinger) {
    const handList = window.MovementController.handLandmarksList || [];
    const targetHand = handList[activeStretch.targetHandIndex];
    if (targetHand) {
      const jointPt = targetHand[anchor - 1];
      if (jointPt) {
        const ax = (1.0 - jointPt.x) * canvas.width;
        const ay = jointPt.y * canvas.height;
        
        activeFingerRelease = {
          targetHandIndex: activeStretch.targetHandIndex,
          fingerIndex: anchor,
          x: currentPos.x - ax,
          y: currentPos.y - ay,
          vx: -(currentPos.x - ax) * 0.45,
          vy: -(currentPos.y - ay) * 0.45,
          cropCanvas: activeStretch.cropCanvas
        };
      }
    }
  } else {
    const landmarks = window.MovementController.faceLandmarksList;
    let ax = activeStretch.startHandPos.x;
    let ay = activeStretch.startHandPos.y;
    
    if (landmarks && landmarks[anchor]) {
      ax = (1.0 - landmarks[anchor].x) * canvas.width;
      ay = landmarks[anchor].y * canvas.height;
    }
    
    // Snapback velocity proportional to offset distance
    const offset = faceOffsets[anchor];
    if (offset) {
      offset.x = currentPos.x - ax;
      offset.y = currentPos.y - ay;
      offset.vx = -offset.x * 0.45;
      offset.vy = -offset.y * 0.45;
    }
  }
  
  activeStretch = null;
  sounds.stopStretch();
  sounds.playSnap();
  triggerScreenShake(8);
}

// ----------------------------------------------------
// Onboarding Calibration Tick
// ----------------------------------------------------
function updateOnboarding(dt) {
  const isHandsLoaded = window.MovementController.isHandsLoaded;
  const handsList = window.MovementController.handLandmarksList || [];
  
  const handsConnected = document.getElementById('stat-hands-connected');
  if (handsConnected) {
    handsConnected.innerText = isHandsLoaded ? 'LOADED' : 'INITIALIZING...';
    handsConnected.className = `status-value ${isHandsLoaded ? 'val-true' : 'val-false'}`;
  }
  
  const isPinching = window.MovementController.isPinching;
  const pinchStatus = document.getElementById('stat-pinch');
  if (pinchStatus) {
    pinchStatus.innerText = isPinching ? 'YES' : 'NO';
    pinchStatus.className = `status-value ${isPinching ? 'val-true' : 'val-false'}`;
  }
  
  drawCalibrationOverlay();
  
  // Calibration Step calculations
  if (calibrationStep === 3) {
    const progressFill = document.getElementById('step-3-progress');
    if (isPinching) {
      onboardingStatus.pinchProgress = Math.min(onboardingStatus.pinchProgress + 1.8 * dt, 100);
      progressFill.style.width = `${onboardingStatus.pinchProgress}%`;
    }
    
    if (onboardingStatus.pinchProgress >= 100) {
      onboardingStatus.pinched = true;
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
  
  if (webcamCalibrationView.paused) {
    webcamCalibrationView.play().catch(() => {});
  }
  
  const w = calibrationCanvasOverlay.width;
  const h = calibrationCanvasOverlay.height;
  
  // Draw mirrored video frame to calibration overlay
  calCtx.save();
  calCtx.translate(w, 0);
  calCtx.scale(-1, 1);
  calCtx.drawImage(webcamCalibrationView, 0, 0, w, h);
  
  // Draw face contours
  const landmarks = window.MovementController.faceLandmarksList;
  if (landmarks && landmarks.length > 0) {
    calCtx.strokeStyle = 'rgba(255, 59, 48, 0.4)';
    calCtx.lineWidth = 1;
    
    // Jaw outline index coordinates
    const jawIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    calCtx.beginPath();
    for (let i = 0; i < jawIndices.length; i++) {
      const pt = landmarks[jawIndices[i]];
      if (pt) {
        const lx = pt.x * w;
        const ly = pt.y * h;
        if (i === 0) calCtx.moveTo(lx, ly);
        else calCtx.lineTo(lx, ly);
      }
    }
    calCtx.stroke();
    
    // Draw target anchor locations as gold dots
    Object.keys(FACE_ANCHORS).forEach(key => {
      const anchorIdx = FACE_ANCHORS[key].index;
      const pt = landmarks[anchorIdx];
      if (pt) {
        calCtx.fillStyle = '#ffd700';
        calCtx.shadowBlur = 5;
        calCtx.shadowColor = '#ffd700';
        calCtx.beginPath();
        calCtx.arc(pt.x * w, pt.y * h, 3.5, 0, Math.PI * 2);
        calCtx.fill();
      }
    });
  }
  
  // Render hands skeleton
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    calCtx.lineWidth = 1.8;
    
    handList.forEach(hand => {
      calCtx.strokeStyle = '#ffd700';
      calCtx.beginPath();
      // Draw wrist to index tip
      const wrist = hand[0];
      const indexKnuckle = hand[5];
      const indexTip = hand[8];
      if (wrist && indexTip) {
        calCtx.moveTo(wrist.x * w, wrist.y * h);
        calCtx.lineTo(indexKnuckle.x * w, indexKnuckle.y * h);
        calCtx.lineTo(indexTip.x * w, indexTip.y * h);
      }
      // Draw wrist to thumb tip
      const thumbKnuckle = hand[2];
      const thumbTip = hand[4];
      if (wrist && thumbTip) {
        calCtx.moveTo(wrist.x * w, wrist.y * h);
        calCtx.lineTo(thumbKnuckle.x * w, thumbKnuckle.y * h);
        calCtx.lineTo(thumbTip.x * w, thumbTip.y * h);
      }
      calCtx.stroke();
    });
  }
  
  calCtx.restore();
}

// ----------------------------------------------------
// Main Game Update and Render Loop
// ----------------------------------------------------
function runLoop() {
  const now = performance.now();
  const deltaTime = (now - lastFrameTime) / 16.67; // normalize to 60fps
  lastFrameTime = now;
  
  const dt = Math.min(deltaTime, 4.0); // cap lag anomaly
  
  // Update FPS count
  fpsCount++;
  if (now - lastFpsTime >= 1000) {
    dbgFps.innerText = fpsCount;
    fpsCount = 0;
    lastFpsTime = now;
  }
  
  // 1. Calibration phase
  if (currentGameState === GAME_STATE.CALIBRATING) {
    updateOnboarding(dt);
  }
  
  // 2. Play phase
  else if (currentGameState === GAME_STATE.PLAYING) {
    updateGameLogic(dt);
    renderGameCanvas();
  }
  
  requestAnimationFrame(runLoop);
}

function updateGameLogic(dt) {
  const isHandsLoaded = window.MovementController.isHandsLoaded;
  const isFaceLoaded = window.MovementController.isFaceMeshLoaded;
  const isPinching = window.MovementController.isPinching;
  const handList = window.MovementController.handLandmarksList || [];
  const faceLandmarks = window.MovementController.faceLandmarksList || [];
  
  // Update Debug monitor values
  dbgHandsCount.innerText = handList.length;
  dbgFaceOk.innerText = faceLandmarks.length > 0 ? 'true' : 'false';
  dbgPinchVal.innerText = isPinching ? 'true' : 'false';
  dbgPinchDist.innerText = window.MovementController.pinchDistance.toFixed(2);
  dbgMouth.innerText = window.MovementController.isMouthOpen ? 'true' : 'false';
  
  const hasHands = handList.length > 0;
  const indLuffy = document.getElementById('ind-luffy-active');
  const indLuffyText = document.getElementById('ind-luffy-text');
  
  if (indLuffy) {
    indLuffy.className = `indicator-dot ${hasHands ? 'active' : ''}`;
    indLuffyText.innerText = hasHands ? 'LUFFY POWERED' : 'CAMERA ACTIVE';
  }
  
  // Trigger recoil physics on all face offsets (spring damping)
  Object.keys(faceOffsets).forEach(indexKey => {
    const offset = faceOffsets[indexKey];
    
    // Spring physics formula
    const forceX = -springK * offset.x - springDamp * offset.vx;
    const forceY = -springK * offset.y - springDamp * offset.vy;
    
    offset.vx += forceX * dt;
    offset.vy += forceY * dt;
    
    offset.x += offset.vx * dt;
    offset.y += offset.vy * dt;
  });
  
  // Update finger release wobbly recoil physics
  if (activeFingerRelease) {
    const forceX = -springK * activeFingerRelease.x - springDamp * activeFingerRelease.vx;
    const forceY = -springK * activeFingerRelease.y - springDamp * activeFingerRelease.vy;
    
    activeFingerRelease.vx += forceX * dt;
    activeFingerRelease.vy += forceY * dt;
    
    activeFingerRelease.x += activeFingerRelease.vx * dt;
    activeFingerRelease.y += activeFingerRelease.vy * dt;
    
    if (Math.hypot(activeFingerRelease.x, activeFingerRelease.y) < 1.0 && Math.hypot(activeFingerRelease.vx, activeFingerRelease.vy) < 1.0) {
      activeFingerRelease = null;
    }
  }
  
  // ----------------------------------------------------
  // GESTURE GAME MODES: LOCKED TO SANDBOX MODE
  // ----------------------------------------------------
  dbgStretch.innerText = activeStretch ? (activeStretch.isFinger ? `Finger ${activeStretch.anchorIndex}` : FACE_ANCHORS[Object.keys(FACE_ANCHORS).find(k => FACE_ANCHORS[k].index === activeStretch.anchorIndex)].name) : 'none';
  hudGestureVal.innerText = activeStretch ? 'STRETCHING' : (window.MovementController.isMouthOpen ? 'LAUGHING' : 'IDLE');
  
  if (hasHands) {
    // Loop through hands
    for (let h = 0; h < handList.length; h++) {
      const hand = handList[h];
      // Calculate mirroring hand coordinates
      const hx = (1.0 - hand[8].x) * canvas.width;
      const hy = hand[8].y * canvas.height;
      
      // Check if hand is pinching
      const thumbTip = hand[4];
      const indexTip = hand[8];
      const dx = thumbTip.x - indexTip.x;
      const dy = thumbTip.y - indexTip.y;
      const dist2d = Math.sqrt(dx*dx + dy*dy);
      
      // Calculate hand scale
      const wrist = hand[0];
      const middleBase = hand[9];
      const handSize = Math.sqrt((wrist.x - middleBase.x)**2 + (wrist.y - middleBase.y)**2);
      const normDist = dist2d / (handSize || 0.08);
      const handPinching = normDist < 0.45;
      
      if (handPinching) {
        if (!activeStretch) {
          // Find closest anchor within reach
          let closestAnchor = null;
          let closestDist = 120; // range in pixels
          let isFingerAnchor = false;
          let targetHandIdx = -1;
          
          // Check Face Anchors first
          if (faceLandmarks.length > 0) {
            Object.keys(FACE_ANCHORS).forEach(key => {
              const anchor = FACE_ANCHORS[key];
              const pt = faceLandmarks[anchor.index];
              if (pt) {
                const ax = (1.0 - pt.x) * canvas.width;
                const ay = pt.y * canvas.height;
                const d = Math.hypot(hx - ax, hy - ay);
                if (d < closestDist) {
                  closestDist = d;
                  closestAnchor = anchor.index;
                  isFingerAnchor = false;
                }
              }
            });
          }
          
          // Check Finger Anchors of the other hand
          if (handList.length === 2) {
            const otherHandIdx = 1 - h;
            const otherHand = handList[otherHandIdx];
            const FINGER_ANCHORS = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky tips
            
            FINGER_ANCHORS.forEach(fingerIdx => {
              const pt = otherHand[fingerIdx];
              if (pt) {
                const fx = (1.0 - pt.x) * canvas.width;
                const fy = pt.y * canvas.height;
                const d = Math.hypot(hx - fx, hy - fy);
                if (d < closestDist) {
                  closestDist = d;
                  closestAnchor = fingerIdx;
                  isFingerAnchor = true;
                  targetHandIdx = otherHandIdx;
                }
              }
            });
          }
          
          if (closestAnchor !== null) {
            startSandboxStretch(closestAnchor, h, hx, hy, isFingerAnchor, targetHandIdx);
          }
        } else if (activeStretch.handIndex === h) {
          // Update stretch coordinate
          updateSandboxStretch(hx, hy);
        }
      } else if (activeStretch && activeStretch.handIndex === h) {
        releaseSandboxStretch();
      }
    }
  } else if (activeStretch && !isMouseDown) {
    // Fallback release if hand is lost
    releaseSandboxStretch();
  }
  
  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

function renderGameCanvas() {
  ctx.save();
  
  // Screen shake translation
  if (screenShake > 0) {
    const dx = (Math.random() - 0.5) * screenShake;
    const dy = (Math.random() - 0.5) * screenShake;
    ctx.translate(dx, dy);
    screenShake *= 0.88; // decay
    if (screenShake < 0.5) screenShake = 0;
  }
  
  // 1. Draw Background
  if (backgroundMode === 'camera' && webcamView.srcObject) {
    if (webcamView.paused) {
      webcamView.play().catch(() => {});
    }
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.55; // Blend camera feed with theme colors
    ctx.drawImage(webcamView, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Add crimson vignette tint
    ctx.fillStyle = 'rgba(255, 59, 48, 0.03)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // Synthwave grid backdrop
    ctx.fillStyle = '#060408';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(255, 59, 48, 0.03)';
    ctx.lineWidth = 1;
    const size = 60;
    for (let x = 0; x < canvas.width; x += size) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += size) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }
  
  const faceLandmarks = window.MovementController.faceLandmarksList || [];
  const handList = window.MovementController.handLandmarksList || [];
  const isPinching = window.MovementController.isPinching;
  
  // 2. Draw Face Mesh skeleton if in Sandbox Mode
  if (currentPlayMode === PLAY_MODE.SANDBOX && faceLandmarks.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)'; // faint gold wireframe
    ctx.lineWidth = 1.0;
    
    // Render jaw and face connections
    const jawIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
    
    ctx.beginPath();
    jawIndices.forEach((idx, i) => {
      const pt = faceLandmarks[idx];
      if (pt) {
        // Apply spring recoil physics offsets to landmarks!
        const offset = faceOffsets[idx] || { x: 0, y: 0 };
        const lx = (1.0 - pt.x) * canvas.width + offset.x;
        const ly = pt.y * canvas.height + offset.y;
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
    });
    ctx.stroke();
    
    // Draw gold glowing node circles on target anchor points
    Object.keys(FACE_ANCHORS).forEach(key => {
      const idx = FACE_ANCHORS[key].index;
      const pt = faceLandmarks[idx];
      if (pt) {
        const offset = faceOffsets[idx] || { x: 0, y: 0 };
        const lx = (1.0 - pt.x) * canvas.width + offset.x;
        const ly = pt.y * canvas.height + offset.y;
        
        ctx.fillStyle = '#ffd700';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Target label name
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.font = '800 0.65rem Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(FACE_ANCHORS[key].name, lx, ly - 10);
      }
    });
    
    ctx.restore();
  }
  
  // 3. Draw Battle Mode Entities (Targets, Arms, Health bar)
  if (currentPlayMode === PLAY_MODE.BATTLE) {
    targets.forEach(t => t.draw(ctx));
    arms.forEach(a => a.draw(ctx));
    
    // Draw Health HUD bar at bottom
    ctx.save();
    const barW = 300;
    const barH = 15;
    const bx = (canvas.width - barW) / 2;
    const by = canvas.height - 40;
    
    ctx.fillStyle = 'rgba(16, 8, 12, 0.8)';
    ctx.strokeStyle = 'rgba(255, 59, 48, 0.4)';
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, barW, barH);
    ctx.strokeRect(bx, by, barW, barH);
    
    // Health fill (green transitioning to red)
    const fillW = (health / 100) * barW;
    const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
    grad.addColorStop(0, '#ff3b30');
    grad.addColorStop(1, '#ffd700');
    
    ctx.fillStyle = grad;
    ctx.fillRect(bx + 1, by + 1, Math.max(0, fillW - 2), barH - 2);
    
    ctx.fillStyle = '#fff';
    ctx.font = '800 0.6rem Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText(`GEAR STATUS: ${health}%`, canvas.width / 2, by - 6);
    ctx.restore();
  }
  
  // 4. Draw Active Sandbox face/finger stretch graphic
  if (currentPlayMode === PLAY_MODE.SANDBOX && activeStretch) {
    const anchorIdx = activeStretch.anchorIndex;
    let ax = activeStretch.startHandPos.x;
    let ay = activeStretch.startHandPos.y;
    
    if (activeStretch.isFinger) {
      const targetHand = handList[activeStretch.targetHandIndex];
      if (targetHand) {
        // DIP joint is at anchorIndex - 1
        const jointPt = targetHand[anchorIdx - 1];
        if (jointPt) {
          ax = (1.0 - jointPt.x) * canvas.width;
          ay = jointPt.y * canvas.height;
        }
      }
    } else {
      const pt = faceLandmarks[anchorIdx];
      if (pt) {
        ax = (1.0 - pt.x) * canvas.width;
        ay = pt.y * canvas.height;
      }
    }
    
    const hx = activeStretch.currentHandPos.x;
    const hy = activeStretch.currentHandPos.y;
    
    ctx.save();
    
    // Calculate tapered cylinder values
    const dx = hx - ax;
    const dy = hy - ay;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const normalAngle = angle + Math.PI / 2;
    
    const baseW = activeStretch.isFinger ? 12 : 30;
    const tipW = activeStretch.isFinger ? 8 : 15;
    
    // Normal offset points
    const p1x = ax + Math.cos(normalAngle) * baseW;
    const p1y = ay + Math.sin(normalAngle) * baseW;
    const p2x = ax - Math.cos(normalAngle) * baseW;
    const p2y = ay - Math.sin(normalAngle) * baseW;
    
    const p3x = hx - Math.cos(normalAngle) * tipW;
    const p3y = hy - Math.sin(normalAngle) * tipW;
    const p4x = hx + Math.cos(normalAngle) * tipW;
    const p4y = hy + Math.sin(normalAngle) * tipW;
    
    // Clip the drawing context to the tapered band path
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p4x, p4y);
    ctx.lineTo(p3x, p3y);
    ctx.lineTo(p2x, p2y);
    ctx.closePath();
    ctx.clip();
    
    // Draw the cropped webcam texture stretched horizontally from anchor to hand
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.drawImage(activeStretch.cropCanvas, 0, -baseW, len, baseW * 2);
    ctx.restore();
    
    // Apply 3D cylindrical shading to make the stretched finger look round
    if (activeStretch.isFinger) {
      const grad = ctx.createLinearGradient(p1x, p1y, p2x, p2y);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
      grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.15)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p4x, p4y);
      ctx.lineTo(p3x, p3y);
      ctx.lineTo(p2x, p2y);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore(); // Restore from clipping
    
    // Draw the red boundary outline around the tapered polygon
    ctx.strokeStyle = '#c0392b'; // red boundary edge
    ctx.lineWidth = activeStretch.isFinger ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p4x, p4y);
    ctx.lineTo(p3x, p3y);
    ctx.lineTo(p2x, p2y);
    ctx.closePath();
    ctx.stroke();
    
    // Draw dashed white comic speed/tension lines inside the band
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = activeStretch.isFinger ? 1.0 : 1.5;
    ctx.setLineDash(activeStretch.isFinger ? [5, 8] : [8, 12]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(hx, hy);
    if (!activeStretch.isFinger) {
      ctx.moveTo((p1x + ax) / 2, (p1y + ay) / 2);
      ctx.lineTo((p4x + hx) / 2, (p4y + hy) / 2);
      ctx.moveTo((p2x + ax) / 2, (p2y + ay) / 2);
      ctx.lineTo((p3x + hx) / 2, (p3y + hy) / 2);
    }
    ctx.stroke();
    ctx.restore();
    
    // 5. Draw cropped circle patch overlay on top of the player's hand cursor
    if (activeStretch.cropCanvas) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      
      const patchRadius = activeStretch.isFinger ? 12 : 30;
      
      ctx.beginPath();
      ctx.arc(hx, hy, patchRadius, 0, Math.PI * 2);
      ctx.clip();
      
      ctx.drawImage(activeStretch.cropCanvas, hx - patchRadius, hy - patchRadius, patchRadius * 2, patchRadius * 2);
      ctx.restore();
      
      ctx.save();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = activeStretch.isFinger ? 2.0 : 3.5;
      ctx.beginPath();
      ctx.arc(hx, hy, patchRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    
    // Draw COMIC "BOING!" labels if stretched far
    if (len > 180) {
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.font = '900 1.5rem Orbitron';
      ctx.textAlign = 'center';
      
      const mx = (ax + hx) / 2;
      const my = (ay + hy) / 2 - 30;
      
      ctx.strokeText("SPROING!", mx, my);
      ctx.fillText("SPROING!", mx, my);
    }
    
    ctx.restore();
  }
  
  // 4b. Draw wobbly snapback recoil for finger stretches
  if (activeFingerRelease) {
    const targetHand = handList[activeFingerRelease.targetHandIndex];
    if (targetHand) {
      const jointPt = targetHand[activeFingerRelease.fingerIndex - 1];
      if (jointPt) {
        const ax = (1.0 - jointPt.x) * canvas.width;
        const ay = jointPt.y * canvas.height;
        
        const hx = ax + activeFingerRelease.x;
        const hy = ay + activeFingerRelease.y;
        
        ctx.save();
        
        const dx = hx - ax;
        const dy = hy - ay;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const normalAngle = angle + Math.PI / 2;
        
        const baseW = 12;
        const tipW = 8;
        
        const p1x = ax + Math.cos(normalAngle) * baseW;
        const p1y = ay + Math.sin(normalAngle) * baseW;
        const p2x = ax - Math.cos(normalAngle) * baseW;
        const p2y = ay - Math.sin(normalAngle) * baseW;
        
        const p3x = hx - Math.cos(normalAngle) * tipW;
        const p3y = hy - Math.sin(normalAngle) * tipW;
        const p4x = hx + Math.cos(normalAngle) * tipW;
        const p4y = hy + Math.sin(normalAngle) * tipW;
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p4x, p4y);
        ctx.lineTo(p3x, p3y);
        ctx.lineTo(p2x, p2y);
        ctx.closePath();
        ctx.clip();
        
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.drawImage(activeFingerRelease.cropCanvas, 0, -baseW, len, baseW * 2);
        ctx.restore();
        
        // Apply 3D cylindrical shading to wobbly recoil finger
        const grad = ctx.createLinearGradient(p1x, p1y, p2x, p2y);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
        grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.15)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p4x, p4y);
        ctx.lineTo(p3x, p3y);
        ctx.lineTo(p2x, p2y);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore(); // Restore from clipping
        
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p4x, p4y);
        ctx.lineTo(p3x, p3y);
        ctx.lineTo(p2x, p2y);
        ctx.closePath();
        ctx.stroke();
        
        if (activeFingerRelease.cropCanvas) {
          ctx.save();
          const patchRadius = 12;
          ctx.beginPath();
          ctx.arc(hx, hy, patchRadius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(activeFingerRelease.cropCanvas, hx - patchRadius, hy - patchRadius, patchRadius * 2, patchRadius * 2);
          ctx.restore();
          
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(hx, hy, patchRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        ctx.restore();
      }
    }
  }
  
  // 6. Draw hand tracking skeletons on preview (Bottom-Left)
  if (handList.length > 0) {
    ctx.save();
    handList.forEach(hand => {
      // Index Tip cursor circle
      const ix = (1.0 - hand[8].x) * canvas.width;
      const iy = hand[8].y * canvas.height;
      
      ctx.fillStyle = isPinching ? '#ffd700' : 'rgba(255, 255, 255, 0.6)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = isPinching ? '#ffd700' : '#fff';
      
      ctx.beginPath();
      ctx.arc(ix, iy, isPinching ? 8 : 12, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  
  // Update particles
  particles.forEach(p => p.draw(ctx));
  
  ctx.restore();
}



// Start loop animation
requestAnimationFrame(runLoop);
