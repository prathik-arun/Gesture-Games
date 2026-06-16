/**
 * Rhythm Saber — Game Logic
 * Powered by Three.js, Web Audio API, & Gesture Zone Movement Engine
 */

// Global Error Handler for visual in-browser debugging
window.onerror = function(message, source, lineno, colno, error) {
  const errDiv = document.createElement('div');
  errDiv.style.position = 'absolute';
  errDiv.style.top = '10px';
  errDiv.style.left = '10px';
  errDiv.style.right = '10px';
  errDiv.style.padding = '15px';
  errDiv.style.background = 'rgba(255, 0, 80, 0.95)';
  errDiv.style.color = '#ffffff';
  errDiv.style.fontFamily = 'monospace';
  errDiv.style.fontSize = '12px';
  errDiv.style.zIndex = '99999';
  errDiv.style.border = '2px solid #ff007f';
  errDiv.style.borderRadius = '4px';
  errDiv.style.whiteSpace = 'pre-wrap';
  errDiv.style.boxShadow = '0 0 20px rgba(0,0,0,0.8)';
  errDiv.innerText = `[JS Runtime Error]\nMessage: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error ? error.stack : 'N/A'}`;
  document.body.appendChild(errDiv);
  return false;
};

// --- Global Variables ---
let scene, camera, renderer;
let gameActive = false;
let score = 0;
let playerHp = 100;
const maxHp = 100;
let combo = 0;
let maxCombo = 0;
let multiplier = 1;
let gameStartTime = 0;

// Entity Arrays
const cubes = [];
const particles = [];
const trails = [];
let scrollingLines = [];
let mountains = [];

// Three.js Objects
let leftSaber, rightSaber;
let leftGlow, rightGlow;

// Game Config
const lanes = [-2.25, -0.75, 0.75, 2.25];
const Z_SPAWN = -40; // Spawning far away
const Z_TARGET = 0;   // Slicing plane Z
const TRAVEL_SPEED = 14; // Three.js units per second
const HIT_WINDOW = 0.08; // +/- 80ms hit window around TargetTime
const MISS_THRESHOLD = -0.15; // >150ms late counts as a miss

// Control positions (scaled Three.js space)
const rawLeftPos = { x: -1.5, y: 1.5, z: 0 };
const rawRightPos = { x: 1.5, y: 1.5, z: 0 };
const curLeftPos = new THREE.Vector3(-1.5, 1.5, 0);
const curRightPos = new THREE.Vector3(1.5, 1.5, 0);

// Tracking calibration state
let calibrationStep = 1;
let calibrationActionsRegistered = {
  camera: false,
  calibrated: false,
  steeredLeft: false,
  steeredRight: false
};

const hoverButtons = [];
const LEADERBOARD_KEY = 'rhythm_saber_scores';

// --- Procedural Synthwave Web Audio Synthesizer ---
class SynthwaveTracker {
  constructor() {
    this.ctx = null;
    this.bpm = 120;
    this.nextNoteTime = 0.0;
    this.sequenceStep = 0;
    this.sequenceStepTotal = 0;
    this.isPlaying = false;
    this.timerId = null;
    this.fallbackStartTime = 0;
    
    // Nodes
    this.masterGain = null;
    this.lastSpawnBeat = -1;
  }
  
  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    
    this.fx = new SoundSynth(this.ctx);
  }
  
  start() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isPlaying = true;
    this.fallbackStartTime = performance.now();
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.sequenceStep = 0;
    this.sequenceStepTotal = 0;
    this.lastSpawnBeat = -1;
    this.scheduler();
  }
  
  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
  }
  
  scheduler() {
    if (!this.isPlaying) return;
    
    // Compute current reference time. 
    // Fall back to performance.now() clock if AudioContext is suspended/blocked.
    let refTime = this.ctx.currentTime;
    if (this.ctx.state === 'suspended') {
      refTime = (performance.now() - this.fallbackStartTime) / 1000;
    }
    
    while (this.nextNoteTime < refTime + 0.1) {
      this.schedulePattern(this.sequenceStep, this.nextNoteTime);
      this.advanceStep();
    }
    
    this.timerId = setTimeout(() => this.scheduler(), 25);
  }
  
  advanceStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    const stepDuration = secondsPerBeat / 4; // 16th notes
    this.nextNoteTime += stepDuration;
    this.sequenceStep = (this.sequenceStep + 1) % 16;
    this.sequenceStepTotal++;
  }
  
  schedulePattern(step, time) {
    // A. Kick on 1, 2, 3, 4 beats (steps 0, 4, 8, 12)
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      this.playKick(time);
    }
    
    // B. Snare on 2 and 4 (steps 4 and 12)
    if (step === 4 || step === 12) {
      this.playSnare(time);
    }
    
    // C. Hihat off-beats (steps 2, 6, 10, 14)
    if (step % 4 === 2) {
      this.playHihat(time);
    }
    
    // D. Bass driving 8th notes
    if (step % 2 === 0) {
      this.playBass(step, time);
    }
    
    // E. Synth Arpeggios on steps
    this.playMelody(step, time);
    
    // F. Spawning Cubes: trigger procedural note spawning exactly aligned with beat times!
    // Since cubes take (Z_TARGET - Z_SPAWN)/TRAVEL_SPEED seconds to reach the player,
    // we schedule the cube to spawn now with its TargetTime set to exactly the future beat time.
    // For single hand play: start easy (major beats step % 4 === 0), and increase density (introducing half-beat step % 4 === 2 blocks after 45 seconds) as difficulty scales.
    if (gameActive && (step % 4 === 0 || (step % 4 === 2 && (performance.now() - gameStartTime) / 1000 > 45))) {
      const beatIndex = Math.floor(this.sequenceStepTotal / 2); // track half beats
      if (beatIndex !== this.lastSpawnBeat) {
        this.lastSpawnBeat = beatIndex;
        
        const elapsedSeconds = (performance.now() - gameStartTime) / 1000;
        
        let spawnChance = 0;
        if (step % 4 === 0) {
          // Main beats scale from 0.40 to 0.85 over 2 minutes (120s)
          spawnChance = Math.min(0.85, 0.40 + (elapsedSeconds / 120) * 0.45);
        } else {
          // Off-beats start at 0 after 45s, scaling up to 0.45 by 120s
          const timeOver45 = elapsedSeconds - 45;
          spawnChance = Math.min(0.45, (timeOver45 / 75) * 0.45);
        }
        
        if (Math.random() < spawnChance) {
          // Calculate when the cube should reach the Z=0 target plane
          const travelDuration = Math.abs(Z_SPAWN - Z_TARGET) / TRAVEL_SPEED;
          const targetBeatTime = time + travelDuration;
          
          spawnProceduralNote(targetBeatTime);
        }
      }
    }
  }
  
  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    
    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    
    osc.start(time);
    osc.stop(time + 0.12);
  }
  
  playSnare(time) {
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
    filter.frequency.value = 1100;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start(time);
    noise.stop(time + 0.15);
  }
  
  playHihat(time) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.value = 9000;
    
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(time);
    osc.stop(time + 0.04);
  }
  
  playBass(step, time) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    
    // Synthwave A- progression (Amin - Gmaj - Fmaj - Emin)
    const roots = [55.00, 48.99, 43.65, 41.20]; // A1, G1, F1, E1
    const chordIndex = Math.floor(this.sequenceStepTotal / 16) % roots.length;
    const root = roots[chordIndex];
    
    // alternate octaves for driving 8th bass
    const freq = (step % 4 === 0) ? root : root * 2;
    osc.frequency.setValueAtTime(freq, time);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.exponentialRampToValueAtTime(100, time + 0.18);
    
    gain.gain.setValueAtTime(0.38, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(time);
    osc.stop(time + 0.18);
  }
  
  playMelody(step, time) {
    const melodySteps = [0, 3, 6, 8, 10, 11, 13, 14];
    if (!melodySteps.includes(step)) return;
    
    const chordIndex = Math.floor(this.sequenceStepTotal / 16) % 4;
    const scales = [
      [220.00, 261.63, 293.66, 329.63, 392.00, 440.00], // Amin
      [196.00, 246.94, 293.66, 392.00, 440.00, 493.88], // Gmaj
      [174.61, 220.00, 261.63, 349.23, 392.00, 440.00], // Fmaj
      [164.81, 220.00, 246.94, 329.63, 392.00, 493.88]  // Emin
    ];
    
    const arpPattern = [0, 3, 1, 4, 2, 5, 1, 3];
    const patIdx = melodySteps.indexOf(step);
    const noteIdx = arpPattern[patIdx % arpPattern.length];
    const freq = scales[chordIndex][noteIdx];
    
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, time);
    filter.frequency.exponentialRampToValueAtTime(280, time + 0.22);
    
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(time);
    osc.stop(time + 0.22);
  }
}

class SoundSynth {
  constructor(audioCtx) {
    this.ctx = audioCtx;
  }
  
  playHit() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
    
    // noise splash
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.05);
  }
  
  playMiss() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.linearRampToValueAtTime(45, now + 0.3);
    
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

const synth = new SynthwaveTracker();

// --- Onboarding Hover-to-Click Buttons Registry ---
class HoverButton {
  constructor(element, onClickCallback) {
    this.element = element;
    this.onClick = onClickCallback;
    this.progressFill = element.querySelector('.hover-progress');
    this.progress = 0;
    this.isHovered = false;

    // click fallback
    this.element.addEventListener('click', (e) => {
      this.reset();
      this.onClick();
    });

    hoverButtons.push(this);
  }

  update(reticleX, reticleY) {
    if (this.element.disabled) {
      this.reset();
      return;
    }

    const rect = this.element.getBoundingClientRect();
    const inside = (
      reticleX >= rect.left &&
      reticleX <= rect.right &&
      reticleY >= rect.top &&
      reticleY <= rect.bottom
    );

    if (inside) {
      this.isHovered = true;
      this.progress += 0.018; // approx 0.8s hover trigger
      if (this.progress >= 1) {
        this.progress = 0;
        this.onClick();
      }
    } else {
      this.reset();
    }

    if (this.progressFill) {
      this.progressFill.style.width = `${this.progress * 100}%`;
    }
  }

  reset() {
    this.isHovered = false;
    this.progress = 0;
    if (this.progressFill) {
      this.progressFill.style.width = '0%';
    }
  }
}

// Dom triggers
window.addEventListener('DOMContentLoaded', () => {
  setupOnboardingButtons();
  loadLeaderboard();
  
  // Continuously scan UI loop for hover controls
  uiLoop();
});

function setupOnboardingButtons() {
  const enterBtn = document.getElementById('btn-enter-calibration');
  new HoverButton(enterBtn, () => {
    synth.init(); // Warm AudioContext
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('calibration-overlay').style.display = 'flex';
    advanceCalibrationStep(1);
  });

  const cameraBtn = document.getElementById('btn-enable-camera');
  new HoverButton(cameraBtn, async () => {
    cameraBtn.disabled = true;
    const success = await initSensors();
    if (success) {
      calibrationActionsRegistered.camera = true;
      advanceCalibrationStep(2);
    } else {
      cameraBtn.disabled = false;
    }
  });

  const startBtn = document.getElementById('btn-start-game');
  new HoverButton(startBtn, () => {
    document.getElementById('calibration-overlay').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    startGame();
  });

  const restartBtn = document.getElementById('btn-restart');
  new HoverButton(restartBtn, () => {
    document.getElementById('gameover-overlay').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    resetGame();
    startGame();
  });

  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mouseleave', () => {
      const hb = hoverButtons.find(h => h.element === btn);
      if (hb) hb.reset();
    });
  });
}

// --- Movement Sensors Integration ---
async function initSensors() {
  const videoElement = document.getElementById('webcam-calibration-view');
  const previewVideo = document.getElementById('webcam-view');

  const camSuccess = await window.MovementController.initCamera(videoElement);
  if (!camSuccess) {
    alert('Failed to access webcam. Camera input will fall back to Mouse dragging.');
    
    // Bypass calibration
    document.getElementById('btn-start-game').disabled = false;
    calibrationActionsRegistered.camera = true;
    calibrationActionsRegistered.calibrated = true;
    calibrationActionsRegistered.steeredLeft = true;
    calibrationActionsRegistered.steeredRight = true;
    return false;
  }

  previewVideo.srcObject = videoElement.srcObject;
  previewVideo.play().catch(() => {});

  try {
    await window.MovementController.loadMediaPipe();
    window.MovementController.startProcessingLoop();
    return true;
  } catch (err) {
    console.error('MediaPipe initialization failed:', err);
    return false;
  }
}

function advanceCalibrationStep(stepNum) {
  calibrationStep = stepNum;
  document.querySelectorAll('.step-item').forEach((item, index) => {
    item.classList.remove('active', 'completed');
    if (index + 1 < stepNum) {
      item.classList.add('completed');
    } else if (index + 1 === stepNum) {
      item.classList.add('active');
    }
  });

  if (stepNum === 2) {
    window.MovementController.optical.startCalibration();
    let duration = 2000;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 100;
      const progressFill = document.getElementById('step-2-progress');
      if (progressFill) {
        progressFill.style.width = `${(elapsed / duration) * 100}%`;
      }
      if (elapsed >= duration) {
        clearInterval(interval);
        calibrationActionsRegistered.calibrated = true;
        advanceCalibrationStep(3);
      }
    }, 100);
  }
}

function updateCalibrationTracker() {
  const statLeft = document.getElementById('stat-left');
  const statRight = document.getElementById('stat-right');
  const statAlign = document.getElementById('stat-align');

  const list = window.MovementController && window.MovementController.handLandmarksList;
  const hasHands = list && list.length > 0;
  
  let handTracked = hasHands; // We only need one hand tracked!

  if (statLeft) {
    statLeft.innerText = 'OFFLINE';
    statLeft.className = 'status-value val-false';
  }
  
  if (statRight) {
    statRight.innerText = handTracked ? 'ALIGNED' : 'NO HAND';
    statRight.className = `status-value ${handTracked ? 'val-true' : 'val-false'}`;
  }

  if (statAlign) {
    statAlign.innerText = handTracked ? 'SYNCHRONIZED' : 'WAITING';
    statAlign.className = `status-value ${handTracked ? 'val-true' : 'val-center'}`;
  }

  if (calibrationStep === 3 && hasHands) {
    // Check if player stretched their active hand far left/right to calibrate reach
    list.forEach(hand => {
      const hx = 1 - hand[9].x;
      if (hx < 0.28) calibrationActionsRegistered.steeredLeft = true;
      if (hx > 0.72) calibrationActionsRegistered.steeredRight = true;
    });

    let progress = 0;
    if (calibrationActionsRegistered.steeredLeft) progress += 50;
    if (calibrationActionsRegistered.steeredRight) progress += 50;

    const fill = document.getElementById('step-3-progress');
    if (fill) fill.style.width = `${progress}%`;

    if (progress >= 100) {
      setTimeout(() => {
        document.getElementById('btn-start-game').disabled = false;
      }, 500);
    }
  }
}

function drawCalibrationOverlay() {
  const canvas = document.getElementById('calibration-canvas-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks) => {
      const paths = [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
        [0, 17, 18, 19, 20],
        [5, 9, 13, 17]
      ];

      const hx = 1 - landmarks[0].x;
      ctx.strokeStyle = hx < 0.5 ? 'rgba(255, 0, 127, 0.75)' : 'rgba(0, 255, 255, 0.75)';
      ctx.lineWidth = 2.5;

      paths.forEach(path => {
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
          const pt = landmarks[path[i]];
          const lx = (1 - pt.x) * canvas.width;
          const ly = pt.y * canvas.height;
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      });

      // Draw knuckles
      landmarks.forEach(pt => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc((1 - pt.x) * canvas.width, pt.y * canvas.height, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }
}

// --- Three.js Scene Setup ---
function initThree() {
  const canvas = document.getElementById('game-canvas');
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(varValue('--bg-color') || '#0b0813');
  scene.fog = new THREE.FogExp2(0x0b0813, 0.02);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.8, 8); // look down highway
  camera.lookAt(0, 1.5, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  // Lights
  const ambientLight = new THREE.AmbientLight(0x110c1c, 0.5);
  scene.add(ambientLight);

  const neonLight = new THREE.DirectionalLight(0xff00ff, 0.8);
  neonLight.position.set(0, 20, -10);
  scene.add(neonLight);

  const cyanLight = new THREE.DirectionalLight(0x00ffff, 0.8);
  cyanLight.position.set(0, -5, 10);
  scene.add(cyanLight);

  // Voxel Synthwave Highway & Mountains
  createRetroHighway();
  createHorizonSunset();

  // Create Dual Sabers
  createLaserSabers();

  window.addEventListener('resize', onWindowResize);
}

function varValue(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function createRetroHighway() {
  // Road surface plane
  const roadGeo = new THREE.PlaneGeometry(8, 60);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x050409,
    roughness: 0.8,
    metalness: 0.2
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -15);
  scene.add(road);

  // Glowing boundary rail lines
  const leftRailGeo = new THREE.BoxGeometry(0.1, 0.1, 60);
  const leftRailMat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // Magenta rail
  const leftRail = new THREE.Mesh(leftRailGeo, leftRailMat);
  leftRail.position.set(-4.0, 0.05, -15);
  scene.add(leftRail);

  const rightRailGeo = new THREE.BoxGeometry(0.1, 0.1, 60);
  const rightRailMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Cyan rail
  const rightRail = new THREE.Mesh(rightRailGeo, rightRailMat);
  rightRail.position.set(4.0, 0.05, -15);
  scene.add(rightRail);

  // Neon scrolling grid lines
  scrollingLines = [];
  const lineCount = 18;
  const gridSpacing = 4;
  for (let i = 0; i < lineCount; i++) {
    // Horizontal lines traveling towards player
    const lineGeo = new THREE.BoxGeometry(8, 0.02, 0.08);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x9d00ff });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(0, 0.01, -i * gridSpacing);
    scene.add(line);
    scrollingLines.push(line);
  }

  // 4 lane dividers
  lanes.forEach(x => {
    const laneLineGeo = new THREE.BoxGeometry(0.04, 0.01, 60);
    const laneLineMat = new THREE.MeshBasicMaterial({ color: 0x18122b });
    const laneLine = new THREE.Mesh(laneLineGeo, laneLineMat);
    laneLine.position.set(x, 0.015, -15);
    scene.add(laneLine);
  });

  // Voxel wireframe mountains
  mountains = [];
  for (let i = 0; i < 6; i++) {
    createMountainPair(-40 + i * 14);
  }
}

function createMountainPair(z) {
  // Left Mountain
  const m1Geo = new THREE.ConeGeometry(8, 12, 4);
  const m1Mat = new THREE.MeshBasicMaterial({ color: 0x560099, wireframe: true });
  const m1 = new THREE.Mesh(m1Geo, m1Mat);
  m1.position.set(-11, 4.5, z);
  scene.add(m1);
  mountains.push(m1);

  // Right Mountain
  const m2Geo = new THREE.ConeGeometry(8, 12, 4);
  const m2Mat = new THREE.MeshBasicMaterial({ color: 0x560099, wireframe: true });
  const m2 = new THREE.Mesh(m2Geo, m2Mat);
  m2.position.set(11, 4.5, z);
  scene.add(m2);
  mountains.push(m2);
}

function createHorizonSunset() {
  const sunsetGroup = new THREE.Group();

  // Halved neon sunset circle
  const sunGeo = new THREE.CircleGeometry(16, 32, 0, Math.PI);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 0, 0);
  sunsetGroup.add(sun);

  // Horizontal blind cut bars (black stripes)
  for (let i = 1; i <= 8; i++) {
    const barGeo = new THREE.PlaneGeometry(35, i * 0.22);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x0b0813 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(0, i * 1.5, 0.05); // slightly in front
    sunsetGroup.add(bar);
  }

  sunsetGroup.position.set(0, 0, -45);
  scene.add(sunsetGroup);
}

function createLaserSabers() {
  // Left Saber (Pink)
  leftSaber = new THREE.Group();
  const handleLeftGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
  const handleLeftMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 });
  const handleLeft = new THREE.Mesh(handleLeftGeo, handleLeftMat);
  handleLeft.position.y = -0.15;
  leftSaber.add(handleLeft);

  const bladeLeftGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8);
  const bladeLeftMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
  const bladeLeft = new THREE.Mesh(bladeLeftGeo, bladeLeftMat);
  bladeLeft.position.y = 0.6; // shift up
  leftSaber.add(bladeLeft);

  // Glow halo cylinder mesh
  const glowLeftGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.25, 8);
  const glowLeftMat = new THREE.MeshBasicMaterial({
    color: 0xff007f,
    transparent: true,
    opacity: 0.28
  });
  leftGlow = new THREE.Mesh(glowLeftGeo, glowLeftMat);
  leftGlow.position.y = 0.6;
  leftSaber.add(leftGlow);

  leftSaber.position.copy(curLeftPos);
  leftSaber.visible = false;
  scene.add(leftSaber);

  // Right Saber (Cyan)
  rightSaber = new THREE.Group();
  const handleRightGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
  const handleRightMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 });
  const handleRight = new THREE.Mesh(handleRightGeo, handleRightMat);
  handleRight.position.y = -0.15;
  rightSaber.add(handleRight);

  const bladeRightGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8);
  const bladeRightMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const bladeRight = new THREE.Mesh(bladeRightGeo, bladeRightMat);
  bladeRight.position.y = 0.6;
  rightSaber.add(bladeRight);

  const glowRightGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.25, 8);
  const glowRightMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.28
  });
  rightGlow = new THREE.Mesh(glowRightGeo, glowRightMat);
  rightGlow.position.y = 0.6;
  rightSaber.add(rightGlow);

  rightSaber.position.copy(curRightPos);
  scene.add(rightSaber);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Procedural Cube / Obstacles Spawner ---
function spawnProceduralNote(targetAudioTime) {
  // Choose random parameters
  const laneIdx = Math.floor(Math.random() * lanes.length);
  const laneX = lanes[laneIdx];
  
  // Calculate dynamic bad block ratio based on elapsed time
  const elapsedSeconds = (performance.now() - gameStartTime) / 1000;
  
  // Bad block (red/black warning marks) ratio scales from 0.15 up to 0.45 over 2 minutes (120s)
  const badRatio = Math.min(0.45, 0.15 + (elapsedSeconds / 120) * 0.30);
  
  const type = Math.random() < badRatio ? 'bad' : 'good';
  
  // Spawn visual note group
  const noteMesh = createNoteMesh(type);
  noteMesh.position.set(laneX, 1.4, Z_SPAWN);
  scene.add(noteMesh);
  
  cubes.push({
    targetTime: targetAudioTime,
    lane: laneIdx,
    laneX: laneX,
    type: type,
    mesh: noteMesh,
    hit: false
  });
}

function createNoteMesh(type) {
  const noteGroup = new THREE.Group();
  const geom = new THREE.BoxGeometry(0.75, 0.75, 0.75);

  if (type === 'good') {
    // Good Block: Neon Cyan
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85
    });
    const core = new THREE.Mesh(geom, mat);
    noteGroup.add(core);

    // Cyan outline trim
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    const outline = new THREE.LineSegments(edges, lineMat);
    noteGroup.add(outline);

    // Inner White Mark: glowing white sphere in center
    const innerGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const inner = new THREE.Mesh(innerGeom, innerMat);
    noteGroup.add(inner);

    // Front face white marker dot for extra visual cue
    const frontMarkGeom = new THREE.BoxGeometry(0.12, 0.12, 0.02);
    const frontMarkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const frontMark = new THREE.Mesh(frontMarkGeom, frontMarkMat);
    frontMark.position.set(0, 0, 0.385);
    noteGroup.add(frontMark);

  } else {
    // Bad Block: Charcoal/Dark Grey
    const mat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      emissive: 0xff0033,
      emissiveIntensity: 0.35,
      roughness: 0.8,
      metalness: 0.9,
      transparent: true,
      opacity: 0.95
    });
    const core = new THREE.Mesh(geom, mat);
    noteGroup.add(core);

    // Hot neon red/magenta outline trim to indicate danger
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff0033, linewidth: 2 });
    const outline = new THREE.LineSegments(edges, lineMat);
    noteGroup.add(outline);

    // Inner Black Mark: dark charcoal sphere in center
    const innerGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const inner = new THREE.Mesh(innerGeom, innerMat);
    noteGroup.add(inner);

    // Front face warning "X" mark (cross)
    const xGroup = new THREE.Group();
    const bar1Geo = new THREE.BoxGeometry(0.22, 0.05, 0.02);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    
    const bar1 = new THREE.Mesh(bar1Geo, barMat);
    bar1.rotation.z = Math.PI / 4;
    const bar2 = new THREE.Mesh(bar1Geo, barMat);
    bar2.rotation.z = -Math.PI / 4;
    
    xGroup.add(bar1);
    xGroup.add(bar2);
    xGroup.position.set(0, 0, 0.385);
    noteGroup.add(xGroup);
  }

  return noteGroup;
}

// --- Particle Debris Emitter ---
class CyberDebris {
  constructor(x, y, z, colorHex) {
    const geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1.0
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.set(x, y, z);
    scene.add(this.mesh);

    const angle = Math.random() * Math.PI * 2;
    const speed = 2.0 + Math.random() * 4.5;
    this.vx = Math.cos(angle) * speed * 0.02;
    this.vy = (Math.random() * 3.5 - 0.5) * 0.02;
    this.vz = (Math.random() - 0.5) * 4.0 * 0.02;

    this.decay = 0.015 + Math.random() * 0.02;
    this.gravity = -0.003;
  }

  update() {
    this.mesh.position.x += this.vx;
    this.mesh.position.y += this.vy;
    this.mesh.position.z += this.vz;
    
    this.vy += this.gravity; // Gravity pull

    this.mesh.material.opacity -= this.decay;
    this.mesh.scale.multiplyScalar(0.96);
  }

  isDead() {
    return this.mesh.material.opacity <= 0;
  }

  dispose() {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// --- Keyboard, Mouse & Gesture Inputs ---
let lastInputType = 'mouse';
let lastMouseX = window.innerWidth / 2;
let lastMouseY = window.innerHeight / 2;

window.addEventListener('mousemove', (e) => {
  lastInputType = 'mouse';
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

// Keyboard backup: Spacebar to slice
let keyboardSliceTrigger = false;
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.code === 'Space') {
    keyboardSliceTrigger = true;
    setTimeout(() => {
      keyboardSliceTrigger = false;
    }, 100);
  }
});

// Position updates
const leftSaberHistory = [];
const rightSaberHistory = [];
const maxHistory = 4;

function updateInputCoordinates() {
  const list = window.MovementController.handLandmarksList || [];
  
  document.getElementById('dbg-mediapipe').innerText = window.MovementController.isHandsLoaded ? 'loaded' : 'loading';
  document.getElementById('dbg-mediapipe').style.color = window.MovementController.isHandsLoaded ? 'var(--neon-cyan)' : 'var(--neon-pink)';

  let activeHandLandmark = null;

  if (list.length > 0) {
    lastInputType = 'hand';
    activeHandLandmark = list[0]; // first detected hand
  }

  // A. Hand tracking position mapping
  if (lastInputType === 'hand') {
    document.getElementById('dbg-left-saber').innerText = 'offline';

    if (activeHandLandmark) {
      const rx = (1 - activeHandLandmark[9].x);
      const ry = (1 - activeHandLandmark[9].y);
      
      // Interpolate onto Three.js coords across full width [-3.5, 3.5]
      // Bound hand movement to range [0.15, 0.85] for maximum control comfort
      const rxNorm = Math.max(0.15, Math.min(0.85, rx));
      const tx = ((rxNorm - 0.15) / 0.7) * 7.0 - 3.5;
      
      const ryNorm = Math.max(0.15, Math.min(0.85, ry));
      const ty = ((ryNorm - 0.15) / 0.7) * 2.5 + 0.5; // Y in [0.5, 3.0]
      
      rawRightPos.x = tx;
      rawRightPos.y = ty;

      orientSaberJoint(rightSaber, activeHandLandmark);
      document.getElementById('dbg-right-saber').innerText = `(${tx.toFixed(1)}, ${ty.toFixed(1)})`;
    } else {
      document.getElementById('dbg-right-saber').innerText = 'lost';
    }
  } 
  
  // B. Mouse tracking fallback mapping
  else {
    // scale coordinates
    const mx = (lastMouseX / window.innerWidth);
    const my = 1 - (lastMouseY / window.innerHeight);
    
    // Mouse directly controls right (cyan) saber across full width
    const scaleX = (mx - 0.5) * 7.0; // [-3.5, 3.5]
    const scaleY = my * 2.8 + 0.4;   // [0.4, 3.2]

    rawRightPos.x = scaleX;
    rawRightPos.y = scaleY;

    // Reset default vertical rotations
    rightSaber.rotation.set(0, 0, -0.1);

    document.getElementById('dbg-left-saber').innerText = 'offline';
    document.getElementById('dbg-right-saber').innerText = 'mouse';
  }

  // Smooth out coordinate tracking jitter via linear interpolation
  curLeftPos.x += (rawLeftPos.x - curLeftPos.x) * 0.25;
  curLeftPos.y += (rawLeftPos.y - curLeftPos.y) * 0.25;
  leftSaber.position.copy(curLeftPos);

  curRightPos.x += (rawRightPos.x - curRightPos.x) * 0.25;
  curRightPos.y += (rawRightPos.y - curRightPos.y) * 0.25;
  rightSaber.position.copy(curRightPos);

  // Capture coordinate history to calculate swing velocity vectors
  recordSaberHistory(leftSaberHistory, curLeftPos);
  recordSaberHistory(rightSaberHistory, curRightPos);

  // Calibration Steps UI check
  if (calibrationStep === 3) {
    updateCalibrationTracker();
  }
}

function orientSaberJoint(saberGroup, landmarks) {
  // calculate direction vector wrist(0) to middle-finger-knuckle(9)
  const wrist = landmarks[0];
  const knuckle = landmarks[9];
  
  // Mirror X direction
  const dir = new THREE.Vector3(
    -(knuckle.x - wrist.x),
    -(knuckle.y - wrist.y),
    -(knuckle.z - wrist.z)
  ).normalize();

  const baseAxis = new THREE.Vector3(0, 1, 0); // cylinder points up
  saberGroup.quaternion.setFromUnitVectors(baseAxis, dir);
}

function recordSaberHistory(history, position) {
  history.push(position.clone());
  if (history.length > maxHistory) {
    history.shift();
  }
}

function getSaberVelocity(history) {
  if (history.length < 2) return { speed: 0, dir: new THREE.Vector3() };
  
  const last = history[history.length - 1];
  const prev = history[0];
  
  const delta = new THREE.Vector3().subVectors(last, prev);
  const speed = delta.length() / (history.length - 1);
  return {
    speed: speed,
    dir: delta.normalize()
  };
}

// --- Gameplay Mechanics ---
function startGame() {
  score = 0;
  playerHp = maxHp;
  combo = 0;
  maxCombo = 0;
  multiplier = 1;
  gameActive = true;
  calibrationStep = 4; // Advance from step 3 so animate loop starts running gameplay updates!
  gameStartTime = performance.now(); // Record game start time for progressive difficulty scaling

  document.getElementById('hud-score').innerText = '00000';
  document.getElementById('hud-combo').innerText = 'COMBO x0';
  document.getElementById('hud-multiplier').innerText = 'MULTIPLIER: 1X';
  updateHealthBar();

  // Reset arena lines
  scrollingLines.forEach((line, idx) => {
    line.position.z = -idx * 4;
  });

  // Start sound track
  synth.start();
  
  displayAnnouncement('NEURAL BOOT!', 90);
}

function resetGame() {
  // Clear entities
  cubes.forEach(c => {
    scene.remove(c.mesh);
    disposeMesh(c.mesh);
  });
  cubes.length = 0;

  particles.forEach(p => p.dispose());
  particles.length = 0;
}

function triggerGameOver() {
  gameActive = false;
  synth.stop();

  document.getElementById('hud').style.display = 'none';
  document.getElementById('gameover-overlay').style.display = 'flex';
  
  document.getElementById('go-score').innerText = `SCORE: ${score}`;
  document.getElementById('go-combo').innerText = maxCombo;

  saveHighScore(score);
  loadLeaderboard();

  window.MovementController.stopConnection();
}

function updateHealthBar() {
  const fill = document.getElementById('health-bar-fill');
  if (fill) {
    const pct = Math.max(0, (playerHp / maxHp) * 100);
    fill.style.width = `${pct}%`;
  }
}

function triggerDamageFlash() {
  const flash = document.getElementById('damage-flash');
  flash.style.opacity = 0.55;
  setTimeout(() => {
    flash.style.opacity = 0;
  }, 100);
}

function triggerHitFlash() {
  const flash = document.getElementById('hit-flash');
  flash.style.opacity = 0.6;
  setTimeout(() => {
    flash.style.opacity = 0;
  }, 80);
}

function checkObstaclesCollision() {
  if (!gameActive || !synth.ctx) return;

  const curAudioTime = synth.ctx.currentTime;
  
  // Retrieve velocity metrics
  const rightVel = getSaberVelocity(rightSaberHistory);

  for (let i = cubes.length - 1; i >= 0; i--) {
    const cube = cubes[i];
    const delta = cube.targetTime - curAudioTime;
    
    // If cube has already passed the target plane
    if (delta < MISS_THRESHOLD && !cube.hit) {
      if (cube.type === 'good') {
        // Missing a good block is a penalty (standard miss)
        handleMiss();
      }
      // Bad blocks can be let go safely - no penalty if missed!
      scene.remove(cube.mesh);
      disposeMesh(cube.mesh);
      cubes.splice(i, 1);
      continue;
    }

    if (cube.hit) continue;

    // Check hit window bounds
    if (Math.abs(delta) < HIT_WINDOW) {
      const activeSaber = rightSaber;
      const activeVel = rightVel;
      
      const saberPos = activeSaber.position;
      
      // Distance from saber base to cube center in X & Y plane
      const dx = Math.abs(saberPos.x - cube.mesh.position.x);
      const dy = Math.abs(saberPos.y - 1.4); // cube height

      // Check distance threshold
      if (dx < 0.9 && dy < 1.0) {
        // Check slice speed (velocity threshold) to prevent static hand hits
        // Fallback: keyboard slice triggers slice immediately for mouse debugging
        const isSlashSpeed = activeVel.speed > 0.045 || lastInputType === 'mouse' || keyboardSliceTrigger;
        
        if (isSlashSpeed) {
          if (cube.type === 'good') {
            // Success hit on a good block!
            handleHit(cube, activeSaber);
            scene.remove(cube.mesh);
            disposeMesh(cube.mesh);
            cubes.splice(i, 1);
          } else {
            // Collided with a bad block! Trigger bad hit penalty
            handleBadHit(cube, activeSaber);
            scene.remove(cube.mesh);
            disposeMesh(cube.mesh);
            cubes.splice(i, 1);
          }
        }
      }
    }
  }
}

function handleHit(cube, saber) {
  cube.hit = true;
  synth.fx.playHit();
  triggerHitFlash();

  // Score Calculations
  combo++;
  if (combo > maxCombo) maxCombo = combo;
  
  // Combo triggers multipliers
  multiplier = Math.min(8, Math.floor(combo / 10) + 1);

  const basePoints = 25;
  score += basePoints * multiplier;

  // UI update
  document.getElementById('hud-score').innerText = String(score).padStart(5, '0');
  document.getElementById('hud-combo').innerText = `COMBO x${combo}`;
  document.getElementById('hud-multiplier').innerText = `MULTIPLIER: ${multiplier}X`;

  // Visual combo popups
  if (combo > 0 && combo % 10 === 0) {
    showComboPopup(`COMBO x${combo}!`);
  }

  // Regen health
  playerHp = Math.min(maxHp, playerHp + 3);
  updateHealthBar();

  // Burst Particles debris: Cyan colors
  const colorHex = 0x00ffff;
  const pos = cube.mesh.position;
  for (let idx = 0; idx < 12; idx++) {
    particles.push(new CyberDebris(pos.x, pos.y, pos.z, colorHex));
  }
}

function handleBadHit(cube, saber) {
  cube.hit = true;
  synth.fx.playMiss(); // low buzz
  triggerDamageFlash(); // flash red

  // Penalties
  combo = 0;
  multiplier = 1;
  score = Math.max(0, score - 50); // Lose 50 points
  playerHp = Math.max(0, playerHp - 15); // Lose 15 HP

  // UI update
  document.getElementById('hud-score').innerText = String(score).padStart(5, '0');
  document.getElementById('hud-combo').innerText = `COMBO x0`;
  document.getElementById('hud-multiplier').innerText = `MULTIPLIER: 1X`;
  updateHealthBar();

  showComboPopup(`DANGER: -50!`);

  // Burst red warning debris particles
  const colorHex = 0xff0033;
  const pos = cube.mesh.position;
  for (let idx = 0; idx < 12; idx++) {
    particles.push(new CyberDebris(pos.x, pos.y, pos.z, colorHex));
  }

  if (playerHp <= 0) {
    triggerGameOver();
  }
}

function handleMiss() {
  combo = 0;
  multiplier = 1;
  synth.fx.playMiss();
  triggerDamageFlash();

  document.getElementById('hud-combo').innerText = `COMBO x0`;
  document.getElementById('hud-multiplier').innerText = `MULTIPLIER: 1X`;

  playerHp -= 10;
  updateHealthBar();

  if (playerHp <= 0) {
    triggerGameOver();
  }
}

function showComboPopup(text) {
  const pop = document.getElementById('combo-popup');
  pop.innerText = text;
  pop.classList.add('active');
  setTimeout(() => {
    pop.classList.remove('active');
  }, 1000);
}

function displayAnnouncement(text, duration = 90) {
  const el = document.getElementById('announcement');
  el.innerText = text;
  el.style.opacity = 1;
  setTimeout(() => {
    el.style.opacity = 0;
  }, duration * 16.6);
}

function disposeMesh(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

// --- Leaderboard Sync ---
function saveHighScore(scoreVal) {
  try {
    const list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
    const name = localStorage.getItem('currentUserDisplayName') || 'Guest';
    list.push({ name: name, score: scoreVal, date: new Date().toLocaleDateString() });
    
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, 5);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(top));
  } catch (e) {
    console.error('Failed to log high score:', e);
  }
}

function loadLeaderboard() {
  const container = document.getElementById('gameover-leaderboard');
  if (!container) return;

  let rows = '';
  try {
    const list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [
      { name: 'System Core', score: 1200 },
      { name: 'Aesthetic Bot', score: 600 }
    ];

    list.forEach((item, idx) => {
      rows += `
        <div class="leaderboard-row ${idx === 0 ? 'high' : ''}">
          <span class="rank">${idx + 1}. ${item.name}</span>
          <span class="score">${String(item.score).padStart(5, '0')}</span>
        </div>
      `;
    });
  } catch (e) {
    rows = '<div style="font-size:0.7rem; color:#444;">Offline</div>';
  }
  container.innerHTML = rows;
}

// --- Main Continuous UI Loop (Hover click handlers) ---
function uiLoop() {
  // Update hover clicks
  const list = window.MovementController.handLandmarksList || [];
  if (list.length > 0) {
    // scale coordinates
    const mainHand = list[0];
    const palm = mainHand[9];
    const rx = (1 - palm.x) * window.innerWidth;
    const ry = palm.y * window.innerHeight;

    hoverButtons.forEach(btn => btn.update(rx, ry));
  }

  requestAnimationFrame(uiLoop);
}

// --- Main Game Render Ticks ---
let lastTime = performance.now();
let frames = 0;

function animate() {
  const now = performance.now();
  frames++;
  if (now - lastTime >= 1000) {
    document.getElementById('dbg-fps').innerText = frames;
    frames = 0;
    lastTime = now;
  }

  // 1. Process camera stream checks if calibrating
  if (calibrationStep === 3) {
    updateInputCoordinates();
    drawCalibrationOverlay();
  }

  // 2. Play game active loops
  else if (gameActive) {
    updateInputCoordinates();
    checkObstaclesCollision();

    // Use current running audio time or fallback to performance clock
    const curAudioTime = (synth.ctx && synth.ctx.state === 'running')
      ? synth.ctx.currentTime
      : ((performance.now() - synth.fallbackStartTime) / 1000);
    document.getElementById('dbg-notes').innerText = cubes.length;
    document.getElementById('dbg-status').innerText = window.MovementController.gemini.status;

    // A. Move highway grid lines back
    // scroll speed proportional to BPM
    const speed = 0.14; 
    scrollingLines.forEach(line => {
      line.position.z += speed;
      if (line.position.z > 8.0) {
        line.position.z = -18 * 4.0; // send to back
      }
    });

    // B. Scroll background mountains slowly
    mountains.forEach(mtn => {
      mtn.position.z += speed * 0.4;
      if (mtn.position.z > 15) {
        mtn.position.z = -55;
      }
    });

    // C. Move neon cubes synced to AudioContext clock!
    for (let i = cubes.length - 1; i >= 0; i--) {
      const cube = cubes[i];
      const delta = cube.targetTime - curAudioTime;
      
      // Calculate Z coordinate based on precise timestamp
      cube.mesh.position.z = -delta * TRAVEL_SPEED;

      // Add a slight rotation to notes to make them look dynamic
      cube.mesh.rotation.y += 0.008;
      cube.mesh.rotation.x += 0.005;
    }

    // D. Update physics particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      if (p.isDead()) {
        p.dispose();
        particles.splice(i, 1);
      }
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Start Three.js Canvas
initThree();
requestAnimationFrame(animate);
