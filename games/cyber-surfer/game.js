// ----------------------------------------------------
// Cyber Surfer (Subway Skate) — Core Game Logic
// ----------------------------------------------------

// Game State Enum
const GAME_STATE = {
  MENU: 'MENU',
  CALIBRATING: 'CALIBRATING',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER'
};

let currentGameState = GAME_STATE.MENU;

// Configuration and State
const Config = {
  laneWidth: 4,
  lanePositions: [-4, 0, 4], // Left, Center, Right tracks
  playerBaseY: 0,
  gravity: 24,
  jumpInitialVelocity: 11.5,
  obstacleBaseSpeed: 30, // units per second
  coinBaseSpeed: 30,
  spawnIntervalBase: 1.8, // seconds between obstacle spawns
  maxLives: 3,
  swipeTimeWindow: 250, // ms for swipe velocity tracking
  swipeThreshold: 0.12, // normalized screen distance required for swipe
  slideDuration: 0.8, // seconds for sliding duration
};

let state = {
  score: 0,
  coins: 0,
  lives: Config.maxLives,
  speedMultiplier: 1.0,
  currentLane: 1, // Start in center lane (lane 1)
  isJumping: false,
  jumpVelocity: 0,
  isSliding: false,
  slideTimer: 0,
  isInvincible: false,
  invincibleTimer: 0,
  controlMode: 'SWIPE', // 'SWIPE' | 'LEAN'
  swipeHistory: [] // History of hand points for swipe velocity detection
};

// ----------------------------------------------------
// Sound Synthesizer (Web Audio API)
// ----------------------------------------------------
class SoundEngine {
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

  playCoin() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    // Cheerful high-pitched chime
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1320, now + 0.08); // E6
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    
    osc.start();
    osc.stop(now + 0.22);
  }

  playJump() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    // Warm slide up
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.22);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    osc.start();
    osc.stop(now + 0.25);
  }

  playSlide() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    // Quick swoosh/whoosh sound
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.28);
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.start();
    osc.stop(now + 0.3);
  }

  playCrash() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    // Deep noise burst for crunch/crash
    const bufferSize = this.ctx.sampleRate * 0.32;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, now);
    filter.frequency.exponentialRampToValueAtTime(20, now + 0.28);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start();
    noise.stop(now + 0.32);

    // Dynamic thud sweep oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(20, now + 0.35);
    
    oscGain.gain.setValueAtTime(0.25, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    
    osc.start();
    osc.stop(now + 0.38);
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    // Cartoonish descending chime
    osc.frequency.setValueAtTime(392.00, now); // G4
    osc.frequency.setValueAtTime(311.13, now + 0.15); // Eb4
    osc.frequency.setValueAtTime(246.94, now + 0.32); // B3
    osc.frequency.setValueAtTime(196.00, now + 0.5); // G3
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    osc.start();
    osc.stop(now + 0.7);
  }
}
const Sounds = new SoundEngine();

// ----------------------------------------------------
// Three.js 3D Setup & Engine variables
// ----------------------------------------------------
let renderer, scene, camera;
let roadSegments = [];
let sceneryElements = []; // trees, bushes, walls
let obstacles = [];
let coins = [];
let particles = [];
let playerGroup;
let cloudGroup;
let clock;

// Spawn Timer details
let timeSinceLastSpawn = 0;

// DOM Elements
const menuOverlay = document.getElementById('menu-overlay');
const calibrationOverlay = document.getElementById('calibration-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const hudContainer = document.getElementById('hud');
const btnEnterCalibration = document.getElementById('btn-enter-calibration');
const btnEnableCamera = document.getElementById('btn-enable-camera');
const btnStartGame = document.getElementById('btn-start-game');
const btnRestart = document.getElementById('btn-restart');
const webcamCalibrationView = document.getElementById('webcam-calibration-view');
const calibrationCanvasOverlay = document.getElementById('calibration-canvas-overlay');
const webcamView = document.getElementById('webcam-view');
const announcement = document.getElementById('announcement');
const damageFlash = document.getElementById('damage-flash');

const calCtx = calibrationCanvasOverlay.getContext('2d');

// Onboarding steps tracker
const onboarding = {
  currentStep: 1,
  completedSteps: { 1: false, 2: false, 3: false },
  testedGestures: new Set()
};

// ----------------------------------------------------
// UI Logic & Event Handlers
// ----------------------------------------------------

// Hover-to-Click execution setup
function makeHoverSelectable(btn, callback) {
  let hoverTimer = null;
  btn.addEventListener('mouseenter', () => {
    if (btn.disabled) return;
    btn.classList.add('hovering');
    hoverTimer = setTimeout(() => {
      btn.classList.remove('hovering');
      callback();
    }, 1500); // 1.5 seconds hover selection
  });

  btn.addEventListener('mouseleave', () => {
    btn.classList.remove('hovering');
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  });

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    btn.classList.remove('hovering');
    callback();
  });
}

document.getElementById('mode-opt-swipe').addEventListener('click', () => {
  state.controlMode = 'SWIPE';
  document.getElementById('mode-opt-swipe').classList.add('active');
  document.getElementById('mode-opt-lean').classList.remove('active');
});

document.getElementById('mode-opt-lean').addEventListener('click', () => {
  state.controlMode = 'LEAN';
  document.getElementById('mode-opt-lean').classList.add('active');
  document.getElementById('mode-opt-swipe').classList.remove('active');
});

makeHoverSelectable(btnEnterCalibration, () => {
  menuOverlay.style.display = 'none';
  calibrationOverlay.style.display = 'flex';
  currentGameState = GAME_STATE.CALIBRATING;
});

makeHoverSelectable(btnEnableCamera, async () => {
  btnEnableCamera.disabled = true;
  btnEnableCamera.innerText = 'Connecting...';
  
  const ok = await window.MovementController.initCamera(webcamCalibrationView);
  
  if (ok) {
    webcamView.srcObject = webcamCalibrationView.srcObject;
    webcamView.play();
    
    window.MovementController.loadMediaPipe().catch(err => {
      console.error('[Game] MediaPipe load error:', err);
    });
    
    window.MovementController.startSpeech();
    
    onboarding.completedSteps[1] = true;
    const stepEl = document.getElementById('step-1');
    stepEl.classList.remove('active');
    stepEl.classList.add('completed');
    document.getElementById('step-1-indicator').innerText = '✔';
    document.getElementById('step-1-indicator').style.background = '#00ff88';
    document.getElementById('step-1-indicator').style.color = '#000';
    btnEnableCamera.innerText = 'Camera OK';

    window.MovementController.startProcessingLoop();
    
    activateStep(2);
    startNoiseCalibration();
  } else {
    btnEnableCamera.disabled = false;
    btnEnableCamera.innerText = 'Enable Camera';
    alert('Webcam authorization failed. Skater controls roll back to Keyboard mode.');
    bypassCalibration();
  }
});

function bypassCalibration() {
  onboarding.completedSteps[1] = true;
  onboarding.completedSteps[2] = true;
  onboarding.completedSteps[3] = true;
  btnStartGame.removeAttribute('disabled');
}

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

function startNoiseCalibration() {
  window.MovementController.optical.startCalibration();
  let timeRemaining = 3;
  const progressFill = document.getElementById('step-2-progress');
  
  const timer = setInterval(() => {
    timeRemaining--;
    progressFill.style.width = `${((3 - timeRemaining) / 3) * 100}%`;
    
    if (timeRemaining <= 0) {
      clearInterval(timer);
      onboarding.completedSteps[2] = true;
      const stepEl = document.getElementById('step-2');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      document.getElementById('step-2-indicator').innerText = '✔';
      document.getElementById('step-2-indicator').style.background = '#00ff88';
      document.getElementById('step-2-indicator').style.color = '#000';
      activateStep(3);
    }
  }, 1000);
}

makeHoverSelectable(btnStartGame, () => {
  calibrationOverlay.style.display = 'none';
  hudContainer.style.display = 'flex';
  document.getElementById('hud-control-mode').innerText = state.controlMode;
  startGame();
});

makeHoverSelectable(btnRestart, () => {
  gameoverOverlay.style.display = 'none';
  hudContainer.style.display = 'flex';
  window.MovementController.startSpeech();
  startGame();
});

// ----------------------------------------------------
// Three.js 3D Setup (Subway Surfers Theme)
// ----------------------------------------------------
function init3D() {
  const container = document.getElementById('game-container');
  clock = new THREE.Clock();
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Bright Sky Blue
  scene.fog = new THREE.FogExp2(0xd0e8f2, 0.0065); // Soft blue horizon fog
  
  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 4.8, 8.8);
  camera.lookAt(0, 1.5, -15);
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Bright daylight lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); // Bright white sunlight fill
  scene.add(ambientLight);
  
  const sunLight = new THREE.DirectionalLight(0xfffdf0, 1.3); // Warm sun directional beam
  sunLight.position.set(30, 60, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 150;
  sunLight.shadow.camera.left = -15;
  sunLight.shadow.camera.right = 15;
  sunLight.shadow.camera.top = 15;
  sunLight.shadow.camera.bottom = -15;
  scene.add(sunLight);

  // 1. Build Cloud Layers
  createClouds();

  // 2. Build Railway Track Lanes
  createRailwayTracks();

  // 3. Build City Scenery (trees, green banks, brick walls)
  createScenicCityElements();

  // 4. Build Skater Boy Player Model
  createPlayerSkater();
  
  window.addEventListener('resize', onWindowResize);
}

// ----------------------------------------------------
// 3D Subway Asset Builders
// ----------------------------------------------------
function createClouds() {
  cloudGroup = new THREE.Group();
  scene.add(cloudGroup);
  
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  
  for (let i = 0; i < 8; i++) {
    const singleCloud = new THREE.Group();
    
    // Group multiple overlapping spheres to form a fluffy cartoon cloud
    const partCount = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < partCount; j++) {
      const radius = 3 + Math.random() * 4;
      const sphereGeom = new THREE.SphereGeometry(radius, 8, 8);
      const sphere = new THREE.Mesh(sphereGeom, cloudMat);
      sphere.position.set(
        (j - partCount/2) * 3,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 2
      );
      singleCloud.add(sphere);
    }
    
    // Position floating high in the sky
    singleCloud.position.set(
      (Math.random() - 0.5) * 140,
      25 + Math.random() * 15,
      -50 - Math.random() * 100
    );
    cloudGroup.add(singleCloud);
  }
}

function createRailwayTracks() {
  const segmentLength = 40;
  const numSegments = 6;
  const trackWidth = 14;
  
  for (let i = 0; i < numSegments; i++) {
    // 1. Gravel road bed plane
    const geom = new THREE.PlaneGeometry(trackWidth, segmentLength);
    const gravelMat = new THREE.MeshStandardMaterial({ 
      color: 0x7f8c8d, // Gravel gray
      roughness: 0.9, 
      metalness: 0.1 
    });
    
    const segment = new THREE.Mesh(geom, gravelMat);
    segment.rotation.x = -Math.PI / 2;
    segment.position.set(0, 0, -i * segmentLength + 10);
    segment.receiveShadow = true;
    scene.add(segment);
    roadSegments.push(segment);

    // 2. Lay wooden sleepers (ties) and steel tracks for each lane
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2712, roughness: 0.8 }); // Dark brown wood
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 }); // Silver rails

    Config.lanePositions.forEach(laneX => {
      // Wooden ties spaced along the segment Z
      const numTies = 10;
      const tieSpacing = segmentLength / numTies;
      
      for (let t = 0; t < numTies; t++) {
        const tieGeom = new THREE.BoxGeometry(2.4, 0.12, 0.45);
        const tie = new THREE.Mesh(tieGeom, woodMat);
        
        // Translate to relative segment space coordinates
        const relativeZ = -segmentLength/2 + t * tieSpacing + tieSpacing/2;
        tie.position.set(laneX, relativeZ, 0.06);
        tie.rotation.x = Math.PI / 2; // match mirrored plane rotation
        tie.receiveShadow = true;
        segment.add(tie);
      }

      // Parallel steel rails running along Z
      const railGeom = new THREE.BoxGeometry(0.08, segmentLength, 0.16);
      
      const leftRail = new THREE.Mesh(railGeom, metalMat);
      leftRail.position.set(laneX - 0.78, 0, 0.16);
      leftRail.castShadow = true;
      leftRail.receiveShadow = true;
      segment.add(leftRail);

      const rightRail = new THREE.Mesh(railGeom, metalMat);
      rightRail.position.set(laneX + 0.78, 0, 0.16);
      rightRail.castShadow = true;
      rightRail.receiveShadow = true;
      segment.add(rightRail);
    });
  }
}

function createScenicCityElements() {
  const elementCount = 25;
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.9 }); // Bright Green grass bank
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }); // Brown wood
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.9 }); // Bright leaves
  const brickMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }); // Red brick walls

  for (let i = 0; i < elementCount; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const zOffset = -20 - (i * 14);
    const itemType = Math.random();

    if (itemType < 0.45) {
      // 1. Draw a cartoon City tree
      const treeGroup = new THREE.Group();
      
      const trunkGeom = new THREE.CylinderGeometry(0.3, 0.45, 4, 8);
      const trunk = new THREE.Mesh(trunkGeom, trunkMat);
      trunk.position.y = 2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      // Fluffy leaves sphere layers
      const leavesGeom = new THREE.SphereGeometry(1.6, 8, 8);
      const leaves = new THREE.Mesh(leavesGeom, leavesMat);
      leaves.position.y = 4.2;
      leaves.castShadow = true;
      treeGroup.add(leaves);

      const leavesTop = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), leavesMat);
      leavesTop.position.y = 5.3;
      leavesTop.castShadow = true;
      treeGroup.add(leavesTop);

      treeGroup.position.set(side * (9 + Math.random() * 4), 0, zOffset);
      scene.add(treeGroup);
      sceneryElements.push(treeGroup);
    } 
    else if (itemType < 0.75) {
      // 2. Draw grass bank blocks on the outer borders
      const bankGeom = new THREE.BoxGeometry(6, 1.5, 12);
      const bank = new THREE.Mesh(bankGeom, grassMat);
      bank.position.set(side * (10.5 + Math.random() * 2), 0.75, zOffset);
      bank.receiveShadow = true;
      scene.add(bank);
      sceneryElements.push(bank);
    }
    else {
      // 3. Draw colorful brick/concrete wall panels (ideal for subway tunnels or sides)
      const wallGeom = new THREE.BoxGeometry(0.4, 4.5, 14);
      const wall = new THREE.Mesh(wallGeom, brickMat);
      wall.position.set(side * 8, 2.25, zOffset);
      wall.castShadow = true;
      wall.receiveShadow = true;

      // Add a simple colorful splash or block representing graffiti art
      const grafGeom = new THREE.BoxGeometry(0.02, 1.8, 4);
      const grafMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff00ff : 0x00ffff });
      const graf = new THREE.Mesh(grafGeom, grafMat);
      graf.position.set(-side * 0.21, 0, 0); // mount on inside facing track
      wall.add(graf);

      scene.add(wall);
      sceneryElements.push(wall);
    }
  }
}

function createPlayerSkater() {
  playerGroup = new THREE.Group();
  playerGroup.position.set(0, 0, 0);
  scene.add(playerGroup);
  
  // 1. Skateboard Model
  const boardGeom = new THREE.BoxGeometry(1.4, 0.12, 2.8);
  const boardMat = new THREE.MeshStandardMaterial({ 
    color: 0xf1c40f, // Bright Yellow Skateboard
    roughness: 0.3,
    metalness: 0.1
  });
  const skateboard = new THREE.Mesh(boardGeom, boardMat);
  skateboard.position.set(0, 0.24, 0);
  skateboard.castShadow = true;
  skateboard.receiveShadow = true;
  playerGroup.add(skateboard);

  // Four small wheels
  const wheelGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c }); // Bright Red wheels
  const wheelPositions = [
    [-0.55, 0.12, 0.9],
    [0.55, 0.12, 0.9],
    [-0.55, 0.12, -0.9],
    [0.55, 0.12, -0.9]
  ];

  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    playerGroup.add(wheel);
  });

  // 2. Cartoon Skater Boy Character Body
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd8b1, roughness: 0.6 }); // Peach Skin
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.7 }); // Blue Jeans
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 }); // Red hoodie/shirt
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.5 }); // Blue cap

  // Legs
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.65, 0.25), pantsMat);
  leftLeg.position.set(-0.24, 0.52, 0.1);
  leftLeg.castShadow = true;
  playerGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.65, 0.25), pantsMat);
  rightLeg.position.set(0.24, 0.52, -0.1); // slightly offset for surfing stance
  rightLeg.castShadow = true;
  playerGroup.add(rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.45), shirtMat);
  torso.position.set(0, 1.25, 0);
  torso.castShadow = true;
  playerGroup.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), skinMat);
  head.position.set(0, 1.95, 0.02);
  head.castShadow = true;
  playerGroup.add(head);

  // Cap (Backward Baseball Cap)
  const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), capMat);
  capDome.position.set(0, 2.0, -0.02);
  playerGroup.add(capDome);

  // Cap Visor pointing backward
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.28), capMat);
  visor.position.set(0, 1.96, -0.38);
  visor.rotation.x = 0.08;
  playerGroup.add(visor);
  
  // Arms
  const armGeom = new THREE.BoxGeometry(0.18, 0.6, 0.18);
  
  const leftArm = new THREE.Mesh(armGeom, shirtMat);
  leftArm.position.set(-0.48, 1.25, 0);
  leftArm.rotation.z = 0.2; // slightly spread out for balance
  leftArm.castShadow = true;
  playerGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeom, shirtMat);
  rightArm.position.set(0.48, 1.25, 0);
  rightArm.rotation.z = -0.2;
  rightArm.castShadow = true;
  playerGroup.add(rightArm);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------------------------------
// Obstacle and Pickups Procedural Spawner
// ----------------------------------------------------
function spawnEntity() {
  const laneIndex = Math.floor(Math.random() * 3);
  const laneX = Config.lanePositions[laneIndex];
  const farZ = -160;

  const rand = Math.random();
  
  if (rand < 0.22) {
    // 1. Gold Coins
    spawnCoinRow(laneX, farZ);
  } 
  else if (rand < 0.50) {
    // 2. Yellow & Black Construction Barrier -> Player must Jump
    const width = 3.2;
    const height = 1.35;
    const gateGroup = new THREE.Group();
    gateGroup.position.set(laneX, 0, farZ);

    const postGeom = new THREE.BoxGeometry(0.2, height, 0.2);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Dark posts
    
    const lp = new THREE.Mesh(postGeom, postMat);
    lp.position.set(-width/2 + 0.1, height/2, 0);
    lp.castShadow = true;
    gateGroup.add(lp);

    const rp = new THREE.Mesh(postGeom, postMat);
    rp.position.set(width/2 - 0.1, height/2, 0);
    rp.castShadow = true;
    gateGroup.add(rp);

    // Striped crossbar
    const barGeom = new THREE.BoxGeometry(width, 0.35, 0.12);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f }); // Yellow base
    const bar = new THREE.Mesh(barGeom, barMat);
    bar.position.set(0, height - 0.2, 0);
    bar.castShadow = true;
    gateGroup.add(bar);

    // Add black stripe details
    for (let s = 0; s < 5; s++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.14), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      stripe.position.set(-width/2 + (s + 0.5) * (width/5), height - 0.2, 0);
      stripe.rotation.z = 0.4; // diagonal stripe
      gateGroup.add(stripe);
    }

    scene.add(gateGroup);
    obstacles.push({
      mesh: gateGroup,
      type: 'LOW_BARRIER',
      lane: laneIndex,
      width: width,
      height: height,
      depth: 0.4
    });
  } 
  else if (rand < 0.74) {
    // 3. Red & White Railway Overhead Arch -> Player must Slide/Duck
    const archHeight = 3.6;
    const archWidth = 3.6;
    const crossbarHeight = 0.35;
    
    const archGroup = new THREE.Group();
    archGroup.position.set(laneX, 0, farZ);
    
    // Striped posts
    const postGeom = new THREE.CylinderGeometry(0.12, 0.12, archHeight, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff }); // White post
    
    const lp = new THREE.Mesh(postGeom, postMat);
    lp.position.set(-archWidth / 2, archHeight / 2, 0);
    lp.castShadow = true;
    archGroup.add(lp);
    
    const rp = new THREE.Mesh(postGeom, postMat);
    rp.position.set(archWidth / 2, archHeight / 2, 0);
    rp.castShadow = true;
    archGroup.add(rp);

    // Red stripes wrapper loops
    for (let s = 0; s < 4; s++) {
      const ringGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.4, 8);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c }); // Red stripes
      
      const leftRing = new THREE.Mesh(ringGeom, ringMat);
      leftRing.position.set(-archWidth/2, 0.5 + s * 0.9, 0);
      archGroup.add(leftRing);
      
      const rightRing = new THREE.Mesh(ringGeom, ringMat);
      rightRing.position.set(archWidth/2, 0.5 + s * 0.9, 0);
      archGroup.add(rightRing);
    }

    // Overhead warning bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(archWidth, crossbarHeight, 0.25), postMat);
    bar.position.set(0, 2.5, 0);
    archGroup.add(bar);

    // Red stripes on the crossbar
    for (let s = 0; s < 4; s++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, crossbarHeight + 0.02, 0.28), new THREE.MeshBasicMaterial({ color: 0xe74c3c }));
      stripe.position.set(-archWidth/2 + (s + 0.5) * (archWidth/4), 2.5, 0);
      stripe.rotation.y = 0.15;
      archGroup.add(stripe);
    }
    
    scene.add(archGroup);
    obstacles.push({
      mesh: archGroup,
      type: 'HIGH_BARRIER',
      lane: laneIndex,
      width: archWidth,
      height: crossbarHeight,
      depth: 0.3,
      beamY: 2.5
    });
  } 
  else {
    // 4. Colorful Subway Train Passenger Car
    const width = 3.4;
    const height = 4.2;
    const depth = 28;
    
    const trainGroup = new THREE.Group();
    trainGroup.position.set(laneX, height/2, farZ - depth/2);
    
    // Choose bright passenger car color: Bold Red, Bold Blue, or Bold Yellow
    const colorChoices = [0xe74c3c, 0x2980b9, 0xf1c40f];
    const trainColor = colorChoices[Math.floor(Math.random() * colorChoices.length)];
    
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: trainColor, 
      roughness: 0.2, 
      metalness: 0.6 
    });
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    trainGroup.add(body);

    // Front/Back grill bumpers
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 });
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.3, 0.5), metalMat);
    bumperF.position.set(0, -height/2 + 0.2, depth/2 + 0.15);
    trainGroup.add(bumperF);
    
    const bumperB = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.3, 0.5), metalMat);
    bumperB.position.set(0, -height/2 + 0.2, -depth/2 - 0.15);
    trainGroup.add(bumperB);

    // Side passenger windows (small dark rectangles)
    const windowGeom = new THREE.BoxGeometry(0.04, 0.8, 1.4);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const numWindows = 6;
    const windowSpacing = depth / (numWindows + 1);

    for (let w = 0; w < numWindows; w++) {
      const zPos = -depth/2 + (w + 1) * windowSpacing;
      
      const leftWin = new THREE.Mesh(windowGeom, windowMat);
      leftWin.position.set(-width/2 - 0.01, 0.6, zPos);
      trainGroup.add(leftWin);

      const rightWin = new THREE.Mesh(windowGeom, windowMat);
      rightWin.position.set(width/2 + 0.01, 0.6, zPos);
      trainGroup.add(rightWin);
    }
    
    scene.add(trainGroup);
    obstacles.push({
      mesh: trainGroup,
      type: 'TRAIN',
      lane: laneIndex,
      width: width,
      height: height,
      depth: depth
    });
  }
}

function spawnCoinRow(laneX, startZ) {
  const rowCount = 4;
  const spacing = 4.2;
  
  for (let i = 0; i < rowCount; i++) {
    // Collectible golden coins cylinder geometries
    const geom = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16);
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0xffd700, 
      emissive: 0x443300, 
      roughness: 0.15, 
      metalness: 0.95 
    });
    
    const coin = new THREE.Mesh(geom, mat);
    // Face track so cylinder sides align vertically
    coin.rotation.z = Math.PI / 2;
    coin.rotation.x = Math.PI / 2;
    coin.position.set(laneX, 1.1, startZ - i * spacing);
    coin.castShadow = true;
    scene.add(coin);
    coins.push(coin);
  }
}

// ----------------------------------------------------
// Collision Checks
// ----------------------------------------------------
function checkCollisions() {
  if (currentGameState !== GAME_STATE.PLAYING) return;

  let playerHeight = 1.95;
  let playerMinY = playerGroup.position.y;
  let playerMaxY = playerMinY + playerHeight;
  
  if (state.isSliding) {
    playerHeight = 0.97; // 50% height scale
    playerMaxY = playerMinY + playerHeight;
  }

  const pMinX = playerGroup.position.x - 0.75;
  const pMaxX = playerGroup.position.x + 0.75;
  const pMinZ = playerGroup.position.z - 1.4;
  const pMaxZ = playerGroup.position.z + 1.4;

  // 1. Check Gold Coins
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    const cSize = 0.42;
    const cMinX = coin.position.x - cSize;
    const cMaxX = coin.position.x + cSize;
    const cMinY = coin.position.y - cSize;
    const cMaxY = coin.position.y + cSize;
    const cMinZ = coin.position.z - cSize;
    const cMaxZ = coin.position.z + cSize;

    const intersect = (pMinX <= cMaxX && pMaxX >= cMinX) &&
                      (playerMinY <= cMaxY && playerMaxY >= cMinY) &&
                      (pMinZ <= cMaxZ && pMaxZ >= cMinZ);

    if (intersect) {
      scene.remove(coin);
      coins.splice(i, 1);
      state.coins++;
      state.score += 50;
      
      document.getElementById('hud-coins').innerText = String(state.coins).padStart(3, '0');
      document.getElementById('hud-score').innerText = String(state.score).padStart(5, '0');
      
      Sounds.playCoin();
      spawnSparkBurst(coin.position.x, coin.position.y, coin.position.z, 0xffd700, 8);
    }
  }

  // 2. Check Obstacles
  if (state.isInvincible) return;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    const pos = obs.mesh.position;
    
    let obsMinX, obsMaxX, obsMinY, obsMaxY, obsMinZ, obsMaxZ;

    if (obs.type === 'LOW_BARRIER' || obs.type === 'TRAIN') {
      obsMinX = pos.x - obs.width / 2;
      obsMaxX = pos.x + obs.width / 2;
      obsMinY = pos.y - obs.height / 2;
      obsMaxY = pos.y + obs.height / 2;
      obsMinZ = pos.z - obs.depth / 2;
      obsMaxZ = pos.z + obs.depth / 2;
    } else if (obs.type === 'HIGH_BARRIER') {
      obsMinX = pos.x - obs.width / 2;
      obsMaxX = pos.x + obs.width / 2;
      obsMinY = obs.beamY - obs.height / 2;
      obsMaxY = obs.beamY + obs.height / 2;
      obsMinZ = pos.z - obs.depth / 2;
      obsMaxZ = pos.z + obs.depth / 2;
    }

    const intersect = (pMinX <= obsMaxX && pMaxX >= obsMinX) &&
                      (playerMinY <= obsMaxY && playerMaxY >= obsMinY) &&
                      (pMinZ <= obsMaxZ && pMaxZ >= obsMinZ);

    if (intersect) {
      triggerCrash();
      break;
    }
  }
}

function triggerCrash() {
  state.lives--;
  updateLivesDisplay();
  Sounds.playCrash();
  
  damageFlash.classList.add('flash');
  setTimeout(() => {
    damageFlash.classList.remove('flash');
  }, 180);

  // Camera shake effect
  const origPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  let shakeTime = 0;
  const shakeDuration = 250;
  
  const shakeInterval = setInterval(() => {
    shakeTime += 30;
    camera.position.x = origPos.x + (Math.random() - 0.5) * 0.45;
    camera.position.y = origPos.y + (Math.random() - 0.5) * 0.45;
    
    if (shakeTime >= shakeDuration) {
      clearInterval(shakeInterval);
      camera.position.set(0, 4.8, 8.8); // Reset camera
    }
  }, 30);

  // Spark burst debris
  spawnSparkBurst(playerGroup.position.x, playerGroup.position.y + 1, playerGroup.position.z, 0xffaa00, 20);

  if (state.lives <= 0) {
    triggerGameOver();
  } else {
    state.isInvincible = true;
    state.invincibleTimer = 1.6;
  }
}

function updateLivesDisplay() {
  const display = document.getElementById('lives-display');
  let fill = '';
  for (let i = 0; i < Config.maxLives; i++) {
    if (i < state.lives) fill += '█';
    else fill += '░';
  }
  display.innerText = fill;
}

function triggerGameOver() {
  currentGameState = GAME_STATE.GAMEOVER;
  gameoverOverlay.style.display = 'flex';
  hudContainer.style.display = 'none';
  
  document.getElementById('go-score').innerText = String(state.score).padStart(5, '0');
  document.getElementById('go-coins').innerText = state.coins;

  Sounds.playGameOver();
  saveHighScore(state.score);
  renderLeaderboards();

  window.MovementController.stopSpeech();
}

// ----------------------------------------------------
// Visual Particles Effects
// ----------------------------------------------------
function spawnSparkBurst(x, y, z, colorCode, count) {
  for (let i = 0; i < count; i++) {
    const size = 0.12 + Math.random() * 0.15;
    const geom = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ color: colorCode });
    const p = new THREE.Mesh(geom, mat);
    
    p.position.set(x, y, z);
    scene.add(p);
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 4.0 + Math.random() * 8.0;
    particles.push({
      mesh: p,
      vx: Math.cos(angle) * speed * 0.03,
      vy: (Math.random() * 2 + 1) * speed * 0.03,
      vz: (Math.random() - 0.5) * speed * 0.03,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.04
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    
    p.vy -= 0.015;
    p.life -= p.decay;
    p.mesh.scale.set(p.life, p.life, p.life);

    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

// ----------------------------------------------------
// Hand Swipes & Gesture Tracking Interpretation
// ----------------------------------------------------
function updateGestureInput(dt) {
  const dbg = window.MovementController.getDebugInfo();
  
  document.getElementById('dbg-status').innerText = dbg.mediaPipeLoaded ? (dbg.geminiActive ? 'AI LINKED' : 'LOCAL OK') : 'loading solution';
  document.getElementById('dbg-audio').innerText = dbg.speechActive ? 'ACTIVE' : 'INACTIVE';
  document.getElementById('dbg-audio').style.color = dbg.speechActive ? '#00ff88' : '#ff9f43';
  
  if (document.getElementById('stat-voice')) {
    document.getElementById('stat-voice').innerText = dbg.speechActive ? 'ACTIVE' : 'INACTIVE';
    document.getElementById('stat-voice').className = `status-value ${dbg.speechActive ? 'val-true' : 'val-false'}`;
  }

  // A. Check voice commands
  const spokenDir = window.MovementController.voiceDirection;
  if (spokenDir && spokenDir !== 'none') {
    console.log('[Game] Voice trigger lane move:', spokenDir);
    document.getElementById('dbg-voice-cmd').innerText = spokenDir;
    
    if (spokenDir === 'left') triggerLaneChange(-1);
    else if (spokenDir === 'right') triggerLaneChange(1);
    else if (spokenDir === 'up') triggerJump();
    else if (spokenDir === 'down') triggerSlide();

    window.MovementController.voiceDirection = 'none';
  }

  document.getElementById('dbg-words').innerText = dbg.voiceTranscript || 'none';

  // B. Hand landmarks analysis
  const handList = window.MovementController.handLandmarksList || [];
  document.getElementById('dbg-hand').innerText = handList.length > 0 ? 'ACTIVE' : 'NO HAND';
  document.getElementById('dbg-hand').style.color = handList.length > 0 ? '#00ff88' : '#888';
  
  if (document.getElementById('stat-hand')) {
    const isDetected = handList.length > 0;
    document.getElementById('stat-hand').innerText = isDetected ? 'DETECTED' : 'WAITING';
    document.getElementById('stat-hand').className = `status-value ${isDetected ? 'val-true' : 'val-false'}`;
  }

  if (handList.length > 0) {
    const primaryHand = handList[0];
    const indexTip = primaryHand[8];
    const mirroredX = 1 - indexTip.x;
    const yCoord = indexTip.y;
    
    document.getElementById('dbg-vector').innerText = `${mirroredX.toFixed(2)}, ${yCoord.toFixed(2)}`;

    // C. Swipe Mode vs Lean Mode execution
    if (state.controlMode === 'SWIPE') {
      const now = performance.now();
      
      state.swipeHistory = state.swipeHistory.filter(pt => now - pt.time < Config.swipeTimeWindow);
      state.swipeHistory.push({ x: mirroredX, y: yCoord, time: now });

      if (state.swipeHistory.length >= 3) {
        const oldest = state.swipeHistory[0];
        const newest = state.swipeHistory[state.swipeHistory.length - 1];
        
        const dx = newest.x - oldest.x;
        const dy = newest.y - oldest.y;
        
        if (Math.abs(dx) > Config.swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
          const swipeDir = dx > 0 ? 'right' : 'left';
          console.log('[Game] Swiped direction:', swipeDir);
          document.getElementById('dbg-gesture').innerText = `SWIPE ${swipeDir.toUpperCase()}`;
          
          if (swipeDir === 'left') triggerLaneChange(-1);
          else triggerLaneChange(1);

          state.swipeHistory = [];
          
          if (currentGameState === GAME_STATE.CALIBRATING) {
            onboarding.testedGestures.add(swipeDir);
            lightUpCalibrationArrow(swipeDir);
          }
        }
        else if (Math.abs(dy) > Config.swipeThreshold && Math.abs(dy) > Math.abs(dx)) {
          const swipeDir = dy > 0 ? 'down' : 'up';
          console.log('[Game] Swiped direction:', swipeDir);
          document.getElementById('dbg-gesture').innerText = `SWIPE ${swipeDir.toUpperCase()}`;

          if (swipeDir === 'up') triggerJump();
          else triggerSlide();

          state.swipeHistory = [];
          
          if (currentGameState === GAME_STATE.CALIBRATING) {
            onboarding.testedGestures.add(swipeDir);
            lightUpCalibrationArrow(swipeDir);
          }
        }
      }
    } 
    else if (state.controlMode === 'LEAN') {
      // Lean torso Left/Right horizontal mapping
      let targetLane = 1;
      if (mirroredX < 0.36) {
        targetLane = 0; // Left track
        document.getElementById('dbg-gesture').innerText = 'LEAN LEFT';
      } else if (mirroredX > 0.64) {
        targetLane = 2; // Right track
        document.getElementById('dbg-gesture').innerText = 'LEAN RIGHT';
      } else {
        document.getElementById('dbg-gesture').innerText = 'CENTERED';
      }

      if (targetLane !== state.currentLane) {
        state.currentLane = targetLane;
        
        if (currentGameState === GAME_STATE.CALIBRATING) {
          const leanLabel = targetLane === 0 ? 'left' : (targetLane === 2 ? 'right' : 'center');
          onboarding.testedGestures.add(leanLabel);
          if (leanLabel !== 'center') lightUpCalibrationArrow(leanLabel);
        }
      }
      
      // Vertical check
      if (yCoord < 0.2 && !state.isJumping) {
        triggerJump();
        if (currentGameState === GAME_STATE.CALIBRATING) {
          onboarding.testedGestures.add('up');
          lightUpCalibrationArrow('up');
        }
      } else if (yCoord > 0.85 && !state.isSliding) {
        triggerSlide();
        if (currentGameState === GAME_STATE.CALIBRATING) {
          onboarding.testedGestures.add('down');
          lightUpCalibrationArrow('down');
        }
      }
    }
  } else {
    document.getElementById('dbg-vector').innerText = '0, 0';
    document.getElementById('dbg-gesture').innerText = 'none';
  }

  // D. Optical Flow leaning details
  const flowLean = window.MovementController.optical.lean;
  const flowIndex = window.MovementController.optical.debug.leanIndex;
  document.getElementById('dbg-flow-lean').innerText = `${flowIndex.toFixed(2)} (${flowLean})`;
  
  if (document.getElementById('stat-lean')) {
    document.getElementById('stat-lean').innerText = flowLean.toUpperCase();
    document.getElementById('stat-lean').className = `status-value val-${flowLean === 'center' ? 'center' : (flowLean === 'left' ? 'false' : 'true')}`;
  }

  if (state.controlMode === 'LEAN' && handList.length === 0) {
    if (flowLean === 'left') {
      state.currentLane = 0;
    } else if (flowLean === 'right') {
      state.currentLane = 2;
    } else if (flowLean === 'center') {
      state.currentLane = 1;
    }
  }

  const sensorActive = handList.length > 0 || dbg.speechActive;
  document.getElementById('ind-sensor-dot').className = `indicator-dot ${sensorActive ? 'active' : ''}`;
  
  let labelText = 'SENSOR STANDBY';
  if (handList.length > 0 && dbg.speechActive) labelText = 'HAND + SPEECH ACTIVE';
  else if (handList.length > 0) labelText = 'HAND SENSOR ACTIVE';
  else if (dbg.speechActive) labelText = 'SPEECH RECOG ACTIVE';
  document.getElementById('ind-sensor-text').innerText = labelText;

  // E. Calibration complete checks
  if (currentGameState === GAME_STATE.CALIBRATING && onboarding.currentStep === 3) {
    const testedCount = onboarding.testedGestures.size;
    
    if (testedCount >= 2) {
      onboarding.completedSteps[3] = true;
      const stepEl = document.getElementById('step-3');
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      
      const indicator = document.getElementById('step-3-indicator');
      indicator.innerText = '✔';
      indicator.style.background = '#00ff88';
      indicator.style.color = '#000';
      
      btnStartGame.removeAttribute('disabled');
      btnStartGame.focus();
    }
  }
}

function lightUpCalibrationArrow(dir) {
  const el = document.getElementById(`test-arrow-${dir}`);
  if (el) {
    el.classList.add('active');
    setTimeout(() => {
      el.classList.remove('active');
    }, 450);
  }
}

// ----------------------------------------------------
// Player Movement Triggers
// ----------------------------------------------------
function triggerLaneChange(dir) {
  if (currentGameState !== GAME_STATE.PLAYING) return;
  
  const newLane = state.currentLane + dir;
  if (newLane >= 0 && newLane <= 2) {
    state.currentLane = newLane;
    
    // Tilt the skater skateboard group for cornering aesthetics
    const bankDir = dir > 0 ? -1 : 1;
    playerGroup.rotation.z = bankDir * 0.2;
    
    setTimeout(() => {
      if (currentGameState === GAME_STATE.PLAYING) {
        playerGroup.rotation.z = 0;
      }
    }, 280);
  }
}

function triggerJump() {
  if (currentGameState !== GAME_STATE.PLAYING || state.isJumping || state.isSliding) return;
  state.isJumping = true;
  state.jumpVelocity = Config.jumpInitialVelocity;
  Sounds.playJump();
}

function triggerSlide() {
  if (currentGameState !== GAME_STATE.PLAYING || state.isSliding || state.isJumping) return;
  state.isSliding = true;
  state.slideTimer = Config.slideDuration;
  Sounds.playSlide();
  
  // Squash player height
  playerGroup.scale.y = 0.5;
  playerGroup.rotation.x = -0.15; // pitch board forward
}

// ----------------------------------------------------
// Core Gameplay Execution
// ----------------------------------------------------
function startGame() {
  state.score = 0;
  state.coins = 0;
  state.lives = Config.maxLives;
  state.speedMultiplier = 1.0;
  state.currentLane = 1; // Center lane
  state.isJumping = false;
  state.isSliding = false;
  state.isInvincible = false;
  state.invincibleTimer = 0;
  state.swipeHistory = [];
  timeSinceLastSpawn = 0;

  // Clear previous active meshes
  obstacles.forEach(o => scene.remove(o.mesh));
  coins.forEach(c => scene.remove(c));
  particles.forEach(p => scene.remove(p.mesh));
  
  obstacles = [];
  coins = [];
  particles = [];

  playerGroup.position.set(0, 0, 0);
  playerGroup.scale.set(1, 1, 1);
  playerGroup.rotation.set(0, 0, 0);
  
  updateLivesDisplay();
  document.getElementById('hud-coins').innerText = '000';
  document.getElementById('hud-score').innerText = '00000';
  document.getElementById('hud-speed').innerText = '1.0x';

  currentGameState = GAME_STATE.PLAYING;
  clock.getDelta();

  triggerAnnouncement('RUN!', 1200);
}

function triggerAnnouncement(txt, durationMs) {
  announcement.innerText = txt;
  announcement.style.opacity = '1';
  announcement.style.transform = 'translate(-50%, -50%) scale(1.15)';
  
  setTimeout(() => {
    announcement.style.opacity = '0';
    announcement.style.transform = 'translate(-50%, -50%) scale(0.95)';
  }, durationMs);
}

// ----------------------------------------------------
// Main Render and Update Frame Loop
// ----------------------------------------------------
let lastFpsTime = performance.now();
let frameCount = 0;

function animateFrame() {
  requestAnimationFrame(animateFrame);

  const timeNow = performance.now();
  frameCount++;
  if (timeNow - lastFpsTime >= 1000) {
    document.getElementById('dbg-fps').innerText = frameCount;
    frameCount = 0;
    lastFpsTime = timeNow;
  }

  const dt = Math.min(clock.getDelta(), 0.1);

  if (currentGameState === GAME_STATE.CALIBRATING) {
    drawCalibrationOverlay();
  }

  if (currentGameState === GAME_STATE.PLAYING) {
    // Speed progression multiplier
    state.speedMultiplier = 1.0 + (state.score / 5500);
    document.getElementById('hud-speed').innerText = `${state.speedMultiplier.toFixed(1)}x`;

    state.score += Math.floor(dt * 15 * state.speedMultiplier);
    document.getElementById('hud-score').innerText = String(state.score).padStart(5, '0');

    // Handle i-frames blinking opacity
    if (state.isInvincible) {
      state.invincibleTimer -= dt;
      const flash = Math.sin(timeNow * 0.05) * 0.45 + 0.55;
      playerGroup.traverse((node) => {
        if (node.isMesh && node.material) {
          node.material.transparent = true;
          node.material.opacity = flash;
        }
      });

      if (state.invincibleTimer <= 0) {
        state.isInvincible = false;
        playerGroup.traverse((node) => {
          if (node.isMesh && node.material) {
            node.material.opacity = 1.0;
            node.material.transparent = false;
          }
        });
      }
    }

    // A. Player Lerped Lane Transition
    const targetX = Config.lanePositions[state.currentLane];
    playerGroup.position.x += (targetX - playerGroup.position.x) * 11 * dt;

    // B. Player Jump arc kinematics
    if (state.isJumping) {
      playerGroup.position.y += state.jumpVelocity * dt;
      state.jumpVelocity -= Config.gravity * dt;
      
      if (playerGroup.position.y <= Config.playerBaseY) {
        playerGroup.position.y = Config.playerBaseY;
        state.isJumping = false;
        state.jumpVelocity = 0;
      }
    }

    // C. Player Slide / crouch countdown
    if (state.isSliding) {
      state.slideTimer -= dt;
      if (state.slideTimer <= 0) {
        state.isSliding = false;
        playerGroup.scale.y = 1.0;
        playerGroup.rotation.x = 0;
      }
    }

    // D. Procedural Spawner spawn entities
    timeSinceLastSpawn += dt;
    const currentSpawnInterval = Config.spawnIntervalBase / state.speedMultiplier;
    if (timeSinceLastSpawn >= currentSpawnInterval) {
      spawnEntity();
      timeSinceLastSpawn = 0;
    }

    // E. Move obstacles
    const runSpeed = Config.obstacleBaseSpeed * state.speedMultiplier;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.mesh.position.z += runSpeed * dt;
      
      if (obs.mesh.position.z > 15) {
        scene.remove(obs.mesh);
        obstacles.splice(i, 1);
      }
    }

    // F. Move gold coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const coin = coins[i];
      coin.position.z += runSpeed * dt;
      
      // Keep coins spinning on edge
      coin.rotation.y += 3.2 * dt;

      if (coin.position.z > 15) {
        scene.remove(coin);
        coins.splice(i, 1);
      }
    }

    // G. Endless scrolling tracks
    roadSegments.forEach(segment => {
      segment.position.z += runSpeed * dt;
      if (segment.position.z > 25) {
        segment.position.z -= 40 * roadSegments.length;
      }
    });

    // H. Scrolling background trees/banks
    sceneryElements.forEach(item => {
      item.position.z += runSpeed * 0.45 * dt; // parallax slower scroll
      if (item.position.z > 15) {
        item.position.z -= 180 + Math.random() * 20;
      }
    });

    // Drift sky clouds slowly
    cloudGroup.children.forEach(cloud => {
      cloud.position.z += 1.5 * dt; // drift along z
      cloud.position.x += 0.8 * dt; // drift along x
      if (cloud.position.z > 50) {
        cloud.position.z = -180;
        cloud.position.x = (Math.random() - 0.5) * 140;
      }
    });

    // Particles update
    updateParticles(dt);

    // Collision Check
    checkCollisions();
  }

  if (currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.CALIBRATING) {
    updateGestureInput(dt);
  }

  renderer.render(scene, camera);
}

// ----------------------------------------------------
// Step-by-Step Camera Calibration Drawing overlay
// ----------------------------------------------------
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

  // Grid bounds outline
  calCtx.strokeStyle = 'rgba(255, 159, 67, 0.25)';
  calCtx.lineWidth = 1;
  calCtx.strokeRect(15, 15, w - 30, h - 30);

  // Calibration bounds corners
  const cLength = 12;
  calCtx.strokeStyle = '#ff9f43';
  calCtx.lineWidth = 2;
  calCtx.beginPath();
  calCtx.moveTo(15, 15 + cLength); calCtx.lineTo(15, 15); calCtx.lineTo(15 + cLength, 15);
  calCtx.moveTo(w - 15, 15 + cLength); calCtx.lineTo(w - 15, 15); calCtx.lineTo(w - 15 - cLength, 15);
  calCtx.moveTo(15, h - 15 - cLength); calCtx.lineTo(15, h - 15); calCtx.lineTo(15 + cLength, h - 15);
  calCtx.moveTo(w - 15, h - 15 - cLength); calCtx.lineTo(w - 15, h - 15); calCtx.lineTo(w - 15 - cLength, h - 15);
  calCtx.stroke();

  // Draw hand bones skeleton
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks) => {
      if (landmarks && landmarks.length > 0) {
        const bones = [
          [0, 1, 2, 3, 4], // Thumb
          [0, 5, 6, 7, 8], // Index
          [9, 10, 11, 12], // Middle
          [13, 14, 15, 16], // Ring
          [0, 17, 18, 19, 20], // Pinky
          [5, 9, 13, 17] // Palm
        ];
        
        calCtx.strokeStyle = 'rgba(72, 219, 251, 0.8)';
        calCtx.lineWidth = 1.5;
        
        bones.forEach(bonePath => {
          calCtx.beginPath();
          for (let i = 0; i < bonePath.length; i++) {
            const pt = landmarks[bonePath[i]];
            const lx = (1 - pt.x) * w;
            const ly = pt.y * h;
            if (i === 0) calCtx.moveTo(lx, ly);
            else calCtx.lineTo(lx, ly);
          }
          calCtx.stroke();
        });
        
        landmarks.forEach(pt => {
          calCtx.fillStyle = '#ff9f43';
          calCtx.beginPath();
          calCtx.arc((1 - pt.x) * w, pt.y * h, 2.5, 0, Math.PI * 2);
          calCtx.fill();
        });

        // Swipe arrow vector outline
        const mcp = landmarks[5];
        const tip = landmarks[8];
        const sx = (1 - mcp.x) * w;
        const sy = mcp.y * h;
        const ex = (1 - tip.x) * w;
        const ey = tip.y * h;

        calCtx.strokeStyle = '#1dd1a1';
        calCtx.lineWidth = 2.5;
        calCtx.beginPath();
        calCtx.moveTo(sx, sy);
        calCtx.lineTo(ex, ey);
        calCtx.stroke();
      }
    });
  }
}

// ----------------------------------------------------
// Keyboard Controls Fallbacks
// ----------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (currentGameState !== GAME_STATE.PLAYING) return;
  
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
    triggerLaneChange(-1);
  } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
    triggerLaneChange(1);
  } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w' || e.key === ' ') {
    triggerJump();
  } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
    triggerSlide();
  }
});

// ----------------------------------------------------
// Leaderboards & Storage
// ----------------------------------------------------
let leaderboards = [];

function loadHighScores() {
  const localScores = localStorage.getItem('cyber_surfer_high_scores');
  if (localScores) {
    leaderboards = JSON.parse(localScores);
  } else {
    leaderboards = [
      { name: 'SubwayKing', score: 12000 },
      { name: 'SkatePro', score: 8500 },
      { name: 'CoinCollector', score: 6200 },
      { name: 'BoardSurfer', score: 4500 },
      { name: 'RailsRunner', score: 2000 }
    ];
    localStorage.setItem('cyber_surfer_high_scores', JSON.stringify(leaderboards));
  }
}

function saveHighScore(newScore) {
  let name = localStorage.getItem('currentUserDisplayName');
  if (!name) {
    name = prompt('NEW HIGH SCORE! Enter your Subway Skater Codename:') || 'Player';
  }
  leaderboards.push({ name: name, score: newScore });
  
  leaderboards.sort((a, b) => b.score - a.score);
  leaderboards = leaderboards.slice(0, 5);
  localStorage.setItem('cyber_surfer_high_scores', JSON.stringify(leaderboards));
}

function renderLeaderboards() {
  loadHighScores();
  const box = document.getElementById('gameover-leaderboard');
  if (!box) return;
  
  box.innerHTML = '';
  leaderboards.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = `leaderboard-row ${idx === 0 ? 'high' : ''}`;
    row.innerHTML = `<span class="rank">${idx + 1}. ${item.name}</span> <span class="score">${String(item.score).padStart(5, '0')}</span>`;
    box.appendChild(row);
  });
}

// ----------------------------------------------------
// Setup
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  init3D();
  loadHighScores();
  requestAnimationFrame(animateFrame);
});
