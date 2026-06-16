/**
 * Cyber Strike 3D — Game Logic
 * Powered by Three.js & Gesture Zone Movement Engine
 */

// Global Error Handler for visual in-browser debugging
window.onerror = function(message, source, lineno, colno, error) {
  const errDiv = document.createElement('div');
  errDiv.style.position = 'absolute';
  errDiv.style.top = '10px';
  errDiv.style.left = '10px';
  errDiv.style.right = '10px';
  errDiv.style.padding = '15px';
  errDiv.style.background = 'rgba(255, 0, 50, 0.95)';
  errDiv.style.color = '#ffffff';
  errDiv.style.fontFamily = 'monospace';
  errDiv.style.fontSize = '12px';
  errDiv.style.zIndex = '99999';
  errDiv.style.border = '2px solid #ff0055';
  errDiv.style.borderRadius = '4px';
  errDiv.style.whiteSpace = 'pre-wrap';
  errDiv.style.boxShadow = '0 0 20px rgba(0,0,0,0.8)';
  errDiv.innerText = `[JS Runtime Error]\nMessage: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error ? error.stack : 'N/A'}`;
  document.body.appendChild(errDiv);
  return false;
};

// --- Global Variables & Constants ---
let scene, camera, renderer;
let gameActive = false;
let currentWave = 1;
let score = 0;
let playerHp = 100;
let ammo = 30;
const maxAmmo = 30;
let isReloading = false;
let reloadOffsetRot = { x: 0, y: 0 };
let lastFireTime = 0;
let isRapidFire = false;
let rapidFireTimer = null;
const fireRateMs = 150; // Increased fire rate: ~6.6 shots per sec

// Player Position & Physics
const player = {
  position: new THREE.Vector3(0, 1.6, 0), // head height
  velocity: new THREE.Vector3(0, 0, 0),
  radius: 1.0,
  speed: 0.14,
  strafeSpeed: 0.10,
  yaw: 0,
  pitch: 0,
  isJumping: false,
  jumpVelocity: 0,
  gravity: -0.012
};

// Controls State (Air Gamepad + Fallbacks)
let mouseAimActive = false;
let isHandTracked = false;

// Dual Reticle Coordinates
const handLeftPos = { x: window.innerWidth * 0.25, y: window.innerHeight * 0.75 };
const handRightPos = { x: window.innerWidth * 0.75, y: window.innerHeight * 0.5 };

// Steering configurations for right-side aiming
const maxAimRotationSpeed = 0.035;
const rightAimCenter = { x: 0.75, y: 0.5 }; // center of right screen half
const rightSteerDeadzone = 0.03; // 3% radius around center of right screen (highly responsive)

// Entities Arrays
const enemies = [];
const bullets = [];
const particles = [];
const clouds = [];

// Game Assets & Meshes
let weaponMesh;
let muzzleFlashLight;
const arenaSize = 80;

// Leaderboard LocalStorage Key
const LEADERBOARD_KEY = 'cyberstrike_3d_leaderboard';

// Calibration Onboarding State
let calibrationStep = 1;
let calibrationActionsRegistered = {
  camera: false,
  calibrated: false,
  steeredLeft: false,
  steeredRight: false,
  reloaded: false
};

// Hover-to-Click Buttons Registry (For Menu Screens)
const hoverButtons = [];

// --- Onboarding & Hover Click System ---

class HoverButton {
  constructor(element, onClickCallback) {
    this.element = element;
    this.onClick = onClickCallback;
    this.progressFill = element.querySelector('.hover-progress');
    this.progress = 0;
    this.isHovered = false;

    // Fallback: standard click listener
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
      this.progress += 0.015; // Charges in approx 1 second
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

// Initialize buttons on page load
window.addEventListener('DOMContentLoaded', () => {
  setupOnboardingButtons();
  loadLeaderboard();
  
  // Start continuous UI Reticle & Gamepad check loop
  uiLoop();
});

function setupOnboardingButtons() {
  const enterBtn = document.getElementById('btn-enter-calibration');
  new HoverButton(enterBtn, () => {
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
    document.getElementById('air-gamepad').style.display = 'block';
    startGame();
  });

  const restartBtn = document.getElementById('btn-restart');
  new HoverButton(restartBtn, () => {
    document.getElementById('gameover-overlay').style.display = 'none';
    document.getElementById('air-gamepad').style.display = 'block';
    resetGame();
    startGame();
  });

  // Reset hover states on mouseout
  document.querySelectorAll('.hover-btn').forEach(btn => {
    btn.addEventListener('mouseleave', () => {
      const hb = hoverButtons.find(h => h.element === btn);
      if (hb) hb.reset();
    });
  });

  // Mouse reload fallback: allow clicking reload button directly
  const btnReload = document.getElementById('btn-reload');
  if (btnReload) {
    btnReload.addEventListener('click', () => {
      triggerReload();
    });
  }
}

// --- Movement Engine & Sensors Integration ---

async function initSensors() {
  const videoElement = document.getElementById('webcam-calibration-view');
  const previewVideo = document.getElementById('webcam-view');

  // Initialize camera
  const camSuccess = await window.MovementController.initCamera(videoElement);
  if (!camSuccess) {
    alert('Failed to access webcam. Please check permissions.');
    return false;
  }

  // Bind video stream to preview
  previewVideo.srcObject = videoElement.srcObject;
  previewVideo.play().catch(() => {});

  // Load MediaPipe Hands locally
  try {
    await window.MovementController.loadMediaPipe();
    window.MovementController.startProcessingLoop();
    window.MovementController.startSpeech();
    
    // Connect WebSocket proxy to allow voice commands / pose fallback
    window.MovementController.startConnection('ws://localhost:8080');
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
    // Start optical noise calibration
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
  } else if (stepNum === 4) {
    // Set ammo less than max so they can test reloading during Step 4
    ammo = 15;
    updateHud();
    // Show the D-pad/reload overlay temporarily during step 4 calibration so they can test reloading
    document.getElementById('air-gamepad').style.display = 'block';
  } else {
    // Hide D-pad overlay for other steps
    document.getElementById('air-gamepad').style.display = 'none';
  }
}

function updateCalibrationTracker() {
  // Sync the calibration screen status boxes with hand tracking info
  const statWalk = document.getElementById('stat-walk');
  const statLean = document.getElementById('stat-lean');
  const statGesture = document.getElementById('stat-gesture');

  // We assign Left Hand status to stat-walk, Right Hand status to stat-lean
  const list = window.MovementController && window.MovementController.handLandmarksList;
  const hasLandmarks = list && list.length > 0;
  const isLeftDetected = hasLandmarks && (list.length > 1 || (list[0] && list[0][0] && list[0][0].x > 0.5)); // x is inverted on canvas
  const isRightDetected = hasLandmarks && (list.length > 1 || (list[0] && list[0][0] && list[0][0].x <= 0.5));

  if (statWalk) {
    statWalk.innerText = isLeftDetected ? 'TRACKED' : 'NO HAND';
    statWalk.className = `status-value ${isLeftDetected ? 'val-true' : 'val-false'}`;
  }
  
  if (statLean) {
    statLean.innerText = isRightDetected ? 'TRACKED' : 'NO HAND';
    statLean.className = `status-value val-left`; // uses styling color
  }

  if (calibrationStep === 3) {
    // Check if player has steered both left and right using the right hand
    const rx = handRightPos.x / window.innerWidth;
    if (rx < rightAimCenter.x - rightSteerDeadzone) calibrationActionsRegistered.steeredLeft = true;
    if (rx > rightAimCenter.x + rightSteerDeadzone) calibrationActionsRegistered.steeredRight = true;

    let progress = 0;
    if (calibrationActionsRegistered.steeredLeft) progress += 50;
    if (calibrationActionsRegistered.steeredRight) progress += 50;

    const fill = document.getElementById('step-3-progress');
    if (fill) fill.style.width = `${progress}%`;

    if (progress >= 100) {
      advanceCalibrationStep(4);
    }
  } else if (calibrationStep === 4) {
    // Check if player has triggered a reload by hovering over the Reload button
    if (isReloading) {
      calibrationActionsRegistered.reloaded = true;
    }
    const fill = document.getElementById('step-4-progress');
    if (fill) fill.style.width = calibrationActionsRegistered.reloaded ? '100%' : '0%';

    if (calibrationActionsRegistered.reloaded) {
      setTimeout(() => {
        document.getElementById('btn-start-game').disabled = false;
      }, 800);
    }
  }
}

// Draw calibration tracking details on overlay canvas
function drawCalibrationOverlay() {
  const canvas = document.getElementById('calibration-canvas-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw target areas for step 3 steering test (Left/Right zones)
  if (calibrationStep === 3) {
    ctx.strokeStyle = calibrationActionsRegistered.steeredLeft ? 'rgba(0,255,85,0.6)' : 'rgba(255,0,255,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 40, 60, 160);
    ctx.fillStyle = calibrationActionsRegistered.steeredLeft ? 'rgba(0,255,85,0.1)' : 'transparent';
    ctx.fillRect(5, 40, 60, 160);

    ctx.strokeStyle = calibrationActionsRegistered.steeredRight ? 'rgba(0,255,85,0.6)' : 'rgba(255,0,255,0.3)';
    ctx.strokeRect(255, 40, 60, 160);
    ctx.fillStyle = calibrationActionsRegistered.steeredRight ? 'rgba(0,255,85,0.1)' : 'transparent';
    ctx.fillRect(255, 40, 60, 160);
  }

  // Draw hand skeleton details
  const handList = window.MovementController.handLandmarksList;
  if (handList && handList.length > 0) {
    handList.forEach((landmarks, idx) => {
      // Connect joints
      const paths = [
        [0, 1, 2, 3, 4],       // thumb
        [0, 5, 6, 7, 8],       // index
        [9, 10, 11, 12],       // middle
        [13, 14, 15, 16],      // ring
        [0, 17, 18, 19, 20],   // pinky
        [5, 9, 13, 17]         // palm
      ];

      // Mirror the hand coordinates
      ctx.strokeStyle = landmarks[0].x > 0.5 ? 'rgba(0,255,85,0.7)' : 'rgba(255,0,255,0.7)';
      ctx.lineWidth = 2;

      paths.forEach(path => {
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
          const pt = landmarks[path[i]];
          const lx = (1 - pt.x) * 320;
          const ly = pt.y * 240;
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      });

      // Draw index tips
      const tip = landmarks[8];
      ctx.fillStyle = landmarks[0].x > 0.5 ? '#00ff55' : '#ff00ff';
      ctx.beginPath();
      ctx.arc((1 - tip.x) * 320, tip.y * 240, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// --- 3D Scene Initialization (Three.js Voxel Minecraft-Style) ---

function initThree() {
  const canvas = document.getElementById('game-canvas');
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x78a7ff); // daytime light blue sky
  scene.fog = new THREE.FogExp2(0x78a7ff, 0.015);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.copy(player.position);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Daytime lighting (Bright Sun)
  const ambientLight = new THREE.AmbientLight(0xfff8ee, 0.85); // warm daylight ambient
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(40, 80, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // Procedural 3D Voxel Level
  createVoxelWorld();

  // Blocky AWP Sniper Weapon model
  createVoxelWeaponMesh();

  window.addEventListener('resize', onWindowResize);
}

function createVoxelWorld() {
  // 1. Grassy Terrain Floor (Green)
  const floorGeo = new THREE.PlaneGeometry(arenaSize, arenaSize);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x5a9e32, // Grass green
    roughness: 0.95,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Scatter brown voxel dirt blocks around the grass
  const dirtGeo = new THREE.BoxGeometry(4, 0.02, 4);
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x866043, roughness: 0.9 });
  
  const dirtPositions = [
    [-10, -8], [8, 12], [-22, 14], [16, -20], [-8, 25], [20, 6], [-4, -26]
  ];
  dirtPositions.forEach(pos => {
    const dirtPatch = new THREE.Mesh(dirtGeo, dirtMat);
    dirtPatch.position.set(pos[0], 0.01, pos[1]);
    dirtPatch.receiveShadow = true;
    scene.add(dirtPatch);
  });

  // 2. Outer Voxel walls (Blocky wooden fences/walls)
  const wallSegmentGeo = new THREE.BoxGeometry(4, 3, 1);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }); // wood brown
  
  // Build boundary segment loops
  for (let x = -arenaSize / 2; x <= arenaSize / 2; x += 4) {
    // North wall
    const wN = new THREE.Mesh(wallSegmentGeo, wallMat);
    wN.position.set(x, 1.5, -arenaSize / 2);
    wN.castShadow = true;
    wN.receiveShadow = true;
    scene.add(wN);

    // South wall
    const wS = new THREE.Mesh(wallSegmentGeo, wallMat);
    wS.position.set(x, 1.5, arenaSize / 2);
    wS.castShadow = true;
    wS.receiveShadow = true;
    scene.add(wS);
  }

  for (let z = -arenaSize / 2 + 4; z < arenaSize / 2; z += 4) {
    // West wall
    const wW = new THREE.Mesh(wallSegmentGeo, wallMat);
    wW.position.set(-arenaSize / 2, 1.5, z);
    wW.rotation.y = Math.PI / 2;
    wW.castShadow = true;
    wW.receiveShadow = true;
    scene.add(wW);

    // East wall
    const wE = new THREE.Mesh(wallSegmentGeo, wallMat);
    wE.position.set(arenaSize / 2, 1.5, z);
    wE.rotation.y = Math.PI / 2;
    wE.castShadow = true;
    wE.receiveShadow = true;
    scene.add(wE);
  }

  // 3. Shipping Cargo Containers (exactly like the video!)
  // Red container
  createCargoContainer(-16, 2, -18, 0xd32f2f, 0);
  // Blue container
  createCargoContainer(18, 2, -10, 0x1976d2, Math.PI / 4);
  // Green container (Legion Platforms!)
  createCargoContainer(-6, 2, 20, 0x2e7d32, -Math.PI / 2);

  // 4. Voxel Trees
  const treePositions = [
    [-24, -24], [-26, 8], [28, -25], [26, 26], [-30, 20], [12, -28], [24, -8]
  ];
  treePositions.forEach(pos => {
    createVoxelTree(pos[0], pos[1]);
  });

  // 5. Blocky Wooden Hut
  createVoxelHut(0, -26);

  // 6. Voxel Clouds (inspired by Minecraft/Kour.io floating blocks)
  const cloudGeo = new THREE.BoxGeometry(16, 1.5, 24);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });

  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.position.set(
      (Math.random() - 0.5) * arenaSize,
      25 + Math.random() * 5, // height
      (Math.random() - 0.5) * arenaSize
    );
    scene.add(cloud);
    clouds.push(cloud);
  }

  // 7. Voxel Bunker Platform (Slate grey circular barrier around player)
  const bunkerGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
  const bunkerMat = new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.8 }); // slate grey concrete
  const blockCount = 18;
  const radius = 2.2;
  for (let i = 0; i < blockCount; i++) {
    const angle = (i / blockCount) * Math.PI * 2;
    const bx = Math.sin(angle) * radius;
    const bz = Math.cos(angle) * radius;
    const block = new THREE.Mesh(bunkerGeo, bunkerMat);
    block.position.set(bx, 0.3, bz);
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
  }
}

function createCargoContainer(x, y, z, colorHex, rotY) {
  const containerGroup = new THREE.Group();

  // Main container body box
  const mainGeo = new THREE.BoxGeometry(8, 4, 4);
  const mainMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
  const main = new THREE.Mesh(mainGeo, mainMat);
  main.castShadow = true;
  main.receiveShadow = true;
  containerGroup.add(main);

  // Black edge trims
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.9 });
  const trimGeo1 = new THREE.BoxGeometry(8.1, 0.15, 0.15);
  const trimGeo2 = new THREE.BoxGeometry(0.15, 4.1, 0.15);

  const t1 = new THREE.Mesh(trimGeo1, trimMat); t1.position.set(0, 2, 2); containerGroup.add(t1);
  const t2 = new THREE.Mesh(trimGeo1, trimMat); t2.position.set(0, -2, 2); containerGroup.add(t2);
  const t3 = new THREE.Mesh(trimGeo1, trimMat); t3.position.set(0, 2, -2); containerGroup.add(t3);
  const t4 = new THREE.Mesh(trimGeo1, trimMat); t4.position.set(0, -2, -2); containerGroup.add(t4);

  const t5 = new THREE.Mesh(trimGeo2, trimMat); t5.position.set(4, 0, 2); containerGroup.add(t5);
  const t6 = new THREE.Mesh(trimGeo2, trimMat); t6.position.set(-4, 0, 2); containerGroup.add(t6);
  const t7 = new THREE.Mesh(trimGeo2, trimMat); t7.position.set(4, 0, -2); containerGroup.add(t7);
  const t8 = new THREE.Mesh(trimGeo2, trimMat); t8.position.set(-4, 0, -2); containerGroup.add(t8);

  containerGroup.position.set(x, y, z);
  containerGroup.rotation.y = rotY;
  scene.add(containerGroup);
}

function createVoxelTree(x, z) {
  const treeGroup = new THREE.Group();

  // Trunk (brown wood box)
  const trunkGeo = new THREE.BoxGeometry(0.8, 5, 0.8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.5;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  treeGroup.add(trunk);

  // Foliage (layers of green boxes)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.95 });
  
  const leafGeo1 = new THREE.BoxGeometry(3.6, 2, 3.6);
  const leaf1 = new THREE.Mesh(leafGeo1, leafMat);
  leaf1.position.y = 4.5;
  leaf1.castShadow = true;
  treeGroup.add(leaf1);

  const leafGeo2 = new THREE.BoxGeometry(2.4, 1.5, 2.4);
  const leaf2 = new THREE.Mesh(leafGeo2, leafMat);
  leaf2.position.y = 6;
  leaf2.castShadow = true;
  treeGroup.add(leaf2);

  treeGroup.position.set(x, 0, z);
  scene.add(treeGroup);
}

function createVoxelHut(x, z) {
  const hutGroup = new THREE.Group();

  // Wood walls box
  const wallGeo = new THREE.BoxGeometry(6, 4, 6);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.95 });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  hutGroup.add(wall);

  // Slanted blocky roof box (dark wood)
  const roofGeo = new THREE.BoxGeometry(7, 1.2, 7);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 4.2;
  roof.castShadow = true;
  hutGroup.add(roof);

  hutGroup.position.set(x, 0, z);
  scene.add(hutGroup);
}

function createVoxelWeaponMesh() {
  // Create group for blocky AWP sniper rifle
  weaponMesh = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.5, metalness: 0.8 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 }); // AWP olive green

  // Stock box
  const stockGeo = new THREE.BoxGeometry(0.06, 0.15, 0.45);
  const stock = new THREE.Mesh(stockGeo, greenMat);
  stock.position.set(0, -0.05, 0.15);
  weaponMesh.add(stock);

  // Gun Body main box
  const bodyGeo = new THREE.BoxGeometry(0.08, 0.1, 0.5);
  const body = new THREE.Mesh(bodyGeo, greenMat);
  body.position.set(0, 0, -0.15);
  weaponMesh.add(body);

  // Barrel long box
  const barrelGeo = new THREE.BoxGeometry(0.04, 0.04, 0.8);
  const barrel = new THREE.Mesh(barrelGeo, metalMat);
  barrel.position.set(0, 0.02, -0.7);
  weaponMesh.add(barrel);

  // Sniper Scope
  const scopeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.35);
  const scope = new THREE.Mesh(scopeGeo, metalMat);
  scope.position.set(0, 0.09, -0.2);
  weaponMesh.add(scope);

  // Scope lens (magenta neon glow)
  const lensGeo = new THREE.BoxGeometry(0.045, 0.045, 0.01);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(0, 0.09, -0.376);
  weaponMesh.add(lens);

  // Muzzle muzzle brake
  const muzzleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.15);
  const muzzle = new THREE.Mesh(muzzleGeo, metalMat);
  muzzle.position.set(0, 0.02, -1.1);
  weaponMesh.add(muzzle);

  scene.add(weaponMesh);

  // Muzzle flash warm light
  muzzleFlashLight = new THREE.PointLight(0xffaa00, 0, 10);
  muzzleFlashLight.position.set(0, 0.02, -1.25);
  weaponMesh.add(muzzleFlashLight);

  resetWeaponTransform();
}

function resetWeaponTransform() {
  // Anchor sniper rifle in bottom right viewport
  weaponMesh.position.set(0.25, -0.28, -0.45);
  weaponMesh.rotation.set(0, 0, 0);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Bullet & Weapon Actions ---

function checkAutoFire() {
  if (!gameActive || isReloading || ammo <= 0) return;

  const raycaster = new THREE.Raycaster();
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  raycaster.set(camera.position, viewDir);

  const enemyMeshes = enemies.map(e => e.mesh);
  const intersects = raycaster.intersectObjects(enemyMeshes, true);

  if (intersects.length > 0) {
    const closest = intersects[0];
    if (closest.distance < 60) {
      fireLaser();
    }
  }
}

function fireLaser() {
  if (ammo <= 0 || isReloading) {
    if (ammo <= 0 && !isReloading) {
      triggerReload();
    }
    return;
  }

  const now = Date.now();
  const currentFireRate = isRapidFire ? 175 : fireRateMs;
  if (now - lastFireTime < currentFireRate) return;
  lastFireTime = now;

  ammo--;
  updateHud();

  // Weapon recoil kickback animation
  weaponMesh.position.z += 0.18; // kick back
  weaponMesh.position.y += 0.04; // muzzle flip
  muzzleFlashLight.intensity = 6.0;
  setTimeout(() => {
    muzzleFlashLight.intensity = 0;
  }, 40);

  // Spawn AWP Sniper Tracer bullet (yellow/orange voxel line)
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 0.8);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd54f }); // bright amber tracer
  const bullet = new THREE.Mesh(tracerGeo, tracerMat);

  // Start bullet at muzzle brake global position
  const tipLocal = new THREE.Vector3(0.25, -0.26, -1.2);
  const tipGlobal = tipLocal.clone().applyMatrix4(camera.matrixWorld);
  bullet.position.copy(tipGlobal);

  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  bullet.velocity = viewDir.clone().multiplyScalar(1.2); // high speed bullet

  bullet.lookAt(bullet.position.clone().add(viewDir));
  scene.add(bullet);
  bullets.push(bullet);

  // Dynamic Camera recoil shake
  camera.position.x += (Math.random() - 0.5) * 0.06;
  camera.position.y += (Math.random() - 0.5) * 0.06;
}

function triggerReload() {
  if (isReloading || ammo === maxAmmo) return;
  isReloading = true;
  document.getElementById('reload-indicator').style.opacity = 1;
  
  reloadOffsetRot.x = 0;
  reloadOffsetRot.y = 0;

  // AWP reload rotation dip
  const reloadInterval = setInterval(() => {
    reloadOffsetRot.x -= 0.08;
    reloadOffsetRot.y += 0.03;
    if (reloadOffsetRot.x <= -Math.PI / 4) {
      clearInterval(reloadInterval);
      
      setTimeout(() => {
        ammo = maxAmmo;
        updateHud();
        document.getElementById('reload-indicator').style.opacity = 0;
        
        const recoverInterval = setInterval(() => {
          reloadOffsetRot.x += 0.08;
          reloadOffsetRot.y -= 0.03;
          if (reloadOffsetRot.x >= 0) {
            reloadOffsetRot.x = 0;
            reloadOffsetRot.y = 0;
            clearInterval(recoverInterval);
            isReloading = false;
          }
        }, 30);
      }, 1200);
    }
  }, 30);
}

// --- Enemy Spawning & Logic (Humanoid Voxel Bots) ---

class EnemyBot {
  constructor(x, z, type = 'standard') {
    this.type = type;
    this.isGolden = type === 'golden';
    this.hp = this.isGolden ? 2 : 3; // sniper takes 1-2 shots to kill
    this.speed = (0.024 + (currentWave * 0.003)) * (this.isGolden ? 1.6 : 1.0); // golden is 60% faster
    this.radius = 1.0;
    this.damage = this.isGolden ? 10 : 20;

    // Voxel Character Mesh group
    this.mesh = new THREE.Group();

    // Voxel torso block (red or gold armor)
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const torsoColor = this.isGolden ? 0xffd700 : 0xd32f2f;
    const torsoMat = new THREE.MeshStandardMaterial({ 
      color: torsoColor, 
      roughness: this.isGolden ? 0.25 : 0.6,
      metalness: this.isGolden ? 0.8 : 0.05,
      emissive: this.isGolden ? 0xffa000 : 0x000000,
      emissiveIntensity: this.isGolden ? 0.35 : 0.0
    });
    this.torso = new THREE.Mesh(torsoGeo, torsoMat);
    this.torso.position.y = 0.45;
    this.torso.castShadow = true;
    this.mesh.add(this.torso);

    // Voxel head block (grey or yellow helmet, glowing red or cyan eyes)
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headColor = this.isGolden ? 0xffea00 : 0x424242;
    const headMat = new THREE.MeshStandardMaterial({ 
      color: headColor, 
      roughness: this.isGolden ? 0.25 : 0.5,
      metalness: this.isGolden ? 0.8 : 0.05,
      emissive: this.isGolden ? 0xffd700 : 0x000000,
      emissiveIntensity: this.isGolden ? 0.25 : 0.0
    });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.1;
    this.head.castShadow = true;
    this.mesh.add(this.head);

    const eyeGeo = new THREE.BoxGeometry(0.32, 0.08, 0.05);
    const eyeColor = this.isGolden ? 0x00e5ff : 0xff0000;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 1.12, -0.21);
    this.mesh.add(eye);

    // Left and Right legs (dark grey or gold legs)
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    const legColor = this.isGolden ? 0xb59500 : 0x212121;
    const legMat = new THREE.MeshStandardMaterial({ 
      color: legColor, 
      roughness: this.isGolden ? 0.3 : 0.9,
      metalness: this.isGolden ? 0.8 : 0.05
    });
    
    this.leftLeg = new THREE.Mesh(legGeo, legMat);
    this.leftLeg.position.set(-0.18, -0.32, 0);
    this.leftLeg.castShadow = true;
    this.mesh.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, legMat);
    this.rightLeg.position.set(0.18, -0.32, 0);
    this.rightLeg.castShadow = true;
    this.mesh.add(this.rightLeg);

    // Set elevation so feet stand on ground
    this.mesh.position.set(x, 0.65, z);
    scene.add(this.mesh);
    enemies.push(this);
  }

  update() {
    const toPlayer = new THREE.Vector3().copy(player.position).sub(this.mesh.position);
    toPlayer.y = 0; // lock floor height
    
    // Face player
    this.mesh.lookAt(player.position.x, this.mesh.position.y, player.position.z);

    const dist = toPlayer.length();
    
    if (dist < 1.3) {
      damagePlayer(this.damage);
      this.explode();
      this.destroy();
    } else {
      toPlayer.normalize().multiplyScalar(this.speed);
      this.mesh.position.add(toPlayer);

      // Shambling Leg Walk Animation!
      const time = Date.now() * 0.012;
      this.leftLeg.rotation.x = Math.sin(time) * 0.6;
      this.rightLeg.rotation.x = -Math.sin(time) * 0.6;
    }
  }

  takeDamage(amount) {
    this.hp -= amount;

    // Flash white on hit
    this.torso.material.color.setHex(0xffffff);
    this.head.material.color.setHex(0xffffff);
    setTimeout(() => {
      if (this.torso && this.torso.material) {
        this.torso.material.color.setHex(this.isGolden ? 0xffd700 : 0xd32f2f);
      }
      if (this.head && this.head.material) {
        this.head.material.color.setHex(this.isGolden ? 0xffea00 : 0x424242);
      }
    }, 80);

    if (this.hp <= 0) {
      this.explode();
      this.destroy();
      score += this.isGolden ? 300 : 150; // double score for golden snipes
      
      if (this.isGolden) {
        triggerPowerUp();
      }
      
      updateHud();
      checkWaveStatus();
    }
  }

  explode() {
    spawnBotShatterDebris(this.mesh.position, this.isGolden);
  }

  destroy() {
    scene.remove(this.mesh);
    const idx = enemies.indexOf(this);
    if (idx !== -1) {
      enemies.splice(idx, 1);
    }
  }
}

// --- Voxel Debris & Power-up Systems ---

function spawnBotShatterDebris(pos, isGolden = false) {
  const colors = isGolden 
    ? [0xffd700, 0xffea00, 0xfffa65, 0xffb300] 
    : [0xd32f2f, 0x424242, 0x212121, 0xff0000];

  for (let i = 0; i < 24; i++) {
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const size = 0.08 + Math.random() * 0.18;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({ 
      color: randomColor, 
      roughness: isGolden ? 0.25 : 0.6,
      metalness: isGolden ? 0.8 : 0.05
    });
    const chunk = new THREE.Mesh(geo, mat);
    
    chunk.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      Math.random() * 1.0,
      (Math.random() - 0.5) * 0.5
    ));
    chunk.castShadow = true;
    
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.25,
      (Math.random() - 0.15) * 0.3,
      (Math.random() - 0.5) * 0.25
    );
    
    const decay = 0.015 + Math.random() * 0.015;
    
    const p = {
      mesh: chunk,
      velocity: vel,
      life: 1.0,
      decay: decay,
      update() {
        this.mesh.position.add(this.velocity);
        this.velocity.y -= 0.008; // gravity
        this.life -= this.decay;
        this.mesh.scale.multiplyScalar(0.96);
        if (this.life <= 0) {
          scene.remove(this.mesh);
          const idx = particles.indexOf(this);
          if (idx !== -1) particles.splice(idx, 1);
        }
      }
    };
    
    scene.add(chunk);
    particles.push(p);
  }
}

function triggerCritAnnouncement() {
  const el = document.getElementById('crit-announcement');
  if (!el) return;
  el.classList.add('active');
  setTimeout(() => {
    el.classList.remove('active');
  }, 600);
}

function triggerPowerUp() {
  const roll = Math.random();
  const hud = document.getElementById('powerup-hud');
  
  if (roll < 0.5) {
    isRapidFire = true;
    if (hud) {
      hud.innerText = "RAPID FIRE ENABLED!";
      hud.style.color = "#ffaa00";
      hud.style.textShadow = "0 0 10px rgba(255, 170, 0, 0.7)";
      hud.classList.add('active');
    }
    
    if (rapidFireTimer) clearTimeout(rapidFireTimer);
    rapidFireTimer = setTimeout(() => {
      isRapidFire = false;
      if (hud) hud.classList.remove('active');
    }, 8000);
  } else {
    playerHp = Math.min(100, playerHp + 40);
    updateHud();
    if (hud) {
      hud.innerText = "SHIELD RESTORED +40!";
      hud.style.color = "#00ff55";
      hud.style.textShadow = "0 0 10px rgba(0, 255, 85, 0.7)";
      hud.classList.add('active');
    }
    setTimeout(() => {
      if (hud) hud.classList.remove('active');
    }, 3000);
  }
}

function spawnEnemyWave() {
  const spawnCount = 4 + (currentWave * 2);
  displayAnnouncement(`WAVE ${currentWave}`);

  for (let i = 0; i < spawnCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 15;
    const x = player.position.x + Math.sin(angle) * dist;
    const z = player.position.z + Math.cos(angle) * dist;
    
    const clampedX = Math.max(-arenaSize/2 + 3, Math.min(arenaSize/2 - 3, x));
    const clampedZ = Math.max(-arenaSize/2 + 3, Math.min(arenaSize/2 - 3, z));

    const botType = Math.random() < 0.15 ? 'golden' : 'standard';
    new EnemyBot(clampedX, clampedZ, botType);
  }
}

function checkWaveStatus() {
  if (enemies.length === 0 && gameActive) {
    currentWave++;
    setTimeout(() => {
      if (gameActive) spawnEnemyWave();
    }, 2500);
  }
}

// --- Particle Explosion System ---

class ExplodeParticle {
  constructor(pos, color) {
    const size = 0.08 + Math.random() * 0.15;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(pos);
    
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.22,
      (Math.random() - 0.1) * 0.22,
      (Math.random() - 0.5) * 0.22
    );
    this.life = 1.0;
    this.decay = 0.02 + Math.random() * 0.02;

    scene.add(this.mesh);
    particles.push(this);
  }

  update() {
    this.mesh.position.add(this.velocity);
    this.velocity.y -= 0.005; // gravity fall
    this.life -= this.decay;
    this.mesh.scale.multiplyScalar(0.95);

    if (this.life <= 0) {
      scene.remove(this.mesh);
      const idx = particles.indexOf(this);
      if (idx !== -1) particles.splice(idx, 1);
    }
  }
}

function spawnExplosionParticles(pos) {
  const colors = [0xd32f2f, 0xffaa00, 0x5a9e32]; // blood, sparks, grass bits
  for (let i = 0; i < 15; i++) {
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    new ExplodeParticle(pos, randomColor);
  }
}

// --- Player Health & Game State Manager ---

function damagePlayer(amount) {
  if (!gameActive) return;
  playerHp = Math.max(0, playerHp - amount);
  updateHud();

  const flash = document.getElementById('damage-flash');
  if (flash) {
    flash.style.opacity = 1;
    setTimeout(() => {
      flash.style.opacity = 0;
    }, 120);
  }

  const shakeInterval = setInterval(() => {
    camera.position.x += (Math.random() - 0.5) * 0.22;
    camera.position.y += (Math.random() - 0.5) * 0.22;
  }, 20);

  setTimeout(() => {
    clearInterval(shakeInterval);
    camera.position.copy(player.position);
  }, 100);

  if (playerHp <= 0) {
    gameOver();
  }
}

function gameOver() {
  gameActive = false;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('air-gamepad').style.display = 'none';
  document.getElementById('gameover-overlay').style.display = 'flex';
  document.getElementById('go-score').innerText = `SCORE: ${score}`;
  document.getElementById('go-wave').innerText = `${currentWave - 1}`;
  
  document.getElementById('reticle-left').style.display = 'none';
  document.getElementById('reticle-right').style.display = 'none';

  saveScore(score);
  loadLeaderboard();
  
  bullets.forEach(b => scene.remove(b));
  enemies.forEach(e => scene.remove(e.mesh));
  particles.forEach(p => scene.remove(p.mesh));
  bullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
}

function startGame() {
  initThree();
  gameActive = true;
  playerHp = 100;
  score = 0;
  ammo = 30;
  currentWave = 1;
  updateHud();
  
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('air-gamepad').style.display = 'block';

  // Spawn initial enemy wave
  setTimeout(() => {
    if (gameActive) spawnEnemyWave();
  }, 1000);

  animate();
}

function resetGame() {
  player.position.set(0, 1.6, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.velocity.set(0, 0, 0);
}

// --- Keyboard & Mouse Controls Fallback ---

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyR' && gameActive) {
    triggerReload();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

window.addEventListener('mousemove', (e) => {
  if (gameActive && !isHandTracked) {
    // Standard mouse aiming fallback (rotate camera)
    const sensitivity = 0.0022;
    player.yaw -= e.movementX * sensitivity;
    player.pitch -= e.movementY * sensitivity;
    player.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, player.pitch));
    
    // Position reticles at mouse coordinates
    handLeftPos.x = e.clientX;
    handLeftPos.y = e.clientY;
    handRightPos.x = e.clientX;
    handRightPos.y = e.clientY;
  }
});

window.addEventListener('mousedown', (e) => {
  if (gameActive && !isHandTracked && e.button === 0) {
    fireLaser();
  }
});

// --- Core Game Update Loops (WebGL & UI Interaction) ---

function animate() {
  if (!gameActive) return;

  requestAnimationFrame(animate);

  // 1. Process Voxel Cloud Drift
  clouds.forEach(cloud => {
    cloud.position.z += 0.008;
    if (cloud.position.z > (arenaSize / 2 + 10)) {
      cloud.position.z = -arenaSize / 2 - 10;
    }
  });

  // 2. Process Player Physics (Movement)
  updatePlayerMovement();

  // Auto-fire if pointing at an enemy bot
  checkAutoFire();

  // 3. Process Bullets Position & Collision checks
  updateBullets();

  // 4. Update Enemy Bots
  enemies.forEach(enemy => enemy.update());

  // 5. Update Particle Explosion Systems
  particles.forEach(p => p.update());

  // 6. Smooth weapon recoil recovery
  weaponMesh.position.lerp(new THREE.Vector3(0.25, -0.28, -0.45), 0.15);

  // 7. Sync weapon transformation to player camera positioning
  syncWeaponToCamera();

  // 8. Render Scene
  renderer.render(scene, camera);
}

function uiLoop() {
  requestAnimationFrame(uiLoop);

  // Update hover click timer on overlay menu buttons
  hoverButtons.forEach(btn => btn.update(handRightPos.x, handRightPos.y));

  // Sync calibration screen trackers
  if (document.getElementById('calibration-overlay').style.display === 'flex') {
    updateCalibrationTracker();
    drawCalibrationOverlay();
  }

  // Check if hand landmarks are captured
  const list = window.MovementController.handLandmarksList;
  isHandTracked = list && list.length > 0;
  
  const retLeftEl = document.getElementById('reticle-left');
  const retRightEl = document.getElementById('reticle-right');

  // Reset all gamepad buttons class overlays
  document.querySelectorAll('.gamepad-btn').forEach(btn => btn.classList.remove('active'));

  // MovementGamepad D-pad buttons DOM reference caches
  const btnFwd = document.getElementById('btn-forward');
  const btnBack = document.getElementById('btn-backward');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnShoot = document.getElementById('btn-shoot');
  const btnReload = document.getElementById('btn-reload');

  // Joystick state variables
  let joyForward = false;
  let joyBackward = false;
  let joyLeft = false;
  let joyRight = false;
  let joyShoot = false;
  let joyReload = false;

  if (isHandTracked) {
    let rawLeftHand = null;
    let rawRightHand = null;

    if (list.length === 1) {
      // Whichever side of the screen screen width the hand is on
      const pt = list[0][0]; // wrist coordinates
      const isLeft = (1 - pt.x) < 0.5; // webcam mirror flip

      if (isLeft) {
        rawLeftHand = list[0];
      } else {
        rawRightHand = list[0];
      }
    } else {
      // 2 hands: sort by X axis coordinates to establish Left vs Right
      const sorted = [...list].sort((a, b) => a[0].x - b[0].x); // x is mirror flipped in MP
      rawLeftHand = sorted[1]; // larger original X -> further left in mirrored screen
      rawRightHand = sorted[0]; // smaller original X -> further right in mirrored screen
    }

    // A. Left Hand: Movement Gamepad processing (Directional relative to center)
    if (rawLeftHand) {
      retLeftEl.style.display = 'block';
      const pt = rawLeftHand[9]; // knuckle
      const targetX = (1 - pt.x) * window.innerWidth;
      const targetY = pt.y * window.innerHeight;

      // Smooth coordinates
      handLeftPos.x += (targetX - handLeftPos.x) * 0.22;
      handLeftPos.y += (targetY - handLeftPos.y) * 0.22;

      retLeftEl.style.left = `${handLeftPos.x}px`;
      retLeftEl.style.top = `${handLeftPos.y}px`;

      // Check directional offsets relative to left-gamepad center
      const leftGamepadEl = document.getElementById('left-gamepad');
      if (leftGamepadEl) {
        const rect = leftGamepadEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = handLeftPos.x - centerX;
        const dy = handLeftPos.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Activates movement if hand is pushed in a direction away from center (deadzone of 25px, max distance limit of 115px)
        if (dist > 25 && dist < 115) {
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
              if (btnRight) btnRight.classList.add('active');
              joyRight = true;
            } else {
              if (btnLeft) btnLeft.classList.add('active');
              joyLeft = true;
            }
          } else {
            if (dy > 0) {
              if (btnBack) btnBack.classList.add('active');
              joyBackward = true;
            } else {
              if (btnFwd) btnFwd.classList.add('active');
              joyForward = true;
            }
          }
        }
      }
    } else {
      retLeftEl.style.display = 'none';
    }

    // B. Right Hand: Aiming & Shooting processing
    if (rawRightHand) {
      retRightEl.style.display = 'block';
      const pt = rawRightHand[9];
      const targetX = (1 - pt.x) * window.innerWidth;
      const targetY = pt.y * window.innerHeight;

      handRightPos.x += (targetX - handRightPos.x) * 0.22;
      handRightPos.y += (targetY - handRightPos.y) * 0.22;

      retRightEl.style.left = `${handRightPos.x}px`;
      retRightEl.style.top = `${handRightPos.y}px`;

      const checkBtnOverlap = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return (
          handRightPos.x >= rect.left &&
          handRightPos.x <= rect.right &&
          handRightPos.y >= rect.top &&
          handRightPos.y <= rect.bottom
        );
      };

      // Check Action buttons intersections (Reload only, Firing is auto-targeted or pinch-triggered)
      if (checkBtnOverlap(btnReload)) { btnReload.classList.add('active'); joyReload = true; }

      // Reload if hovering over RELOAD button
      if (joyReload) {
        triggerReload();
      }

      // Camera Steering: steering proportional to offset from right-hand screen center
      if (gameActive && !mouseAimActive) {
        // Calculate offset relative to right-hand screen center
        const rx = handRightPos.x / window.innerWidth;
        const ry = handRightPos.y / window.innerHeight;

        const dx = rx - rightAimCenter.x;
        const dy = ry - rightAimCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > rightSteerDeadzone) {
          // Immediately start turning with a baseline steering speed, scaling up with offset distance
          const baselineSpeed = 0.008;
          const proportionalSpeed = 0.035;
          const factor = (dist - rightSteerDeadzone) / 0.2;
          const steerSpeed = baselineSpeed + Math.min(factor * proportionalSpeed, proportionalSpeed);

          player.yaw -= (dx / dist) * steerSpeed;
          player.pitch -= (dy / dist) * steerSpeed * 0.6;
          player.pitch = Math.max(-0.2, Math.min(0.2, player.pitch)); // narrow range to prevent sky/ground flipping
        } else {
          // Slowly auto-center player camera pitch when not actively steering
          player.pitch += (0 - player.pitch) * 0.08;
        }
      }
    } else {
      retRightEl.style.display = 'none';
    }

    // Global Pinch Firing (Right or Left hand pinches)
    if (window.MovementController.isPinching) {
      retRightEl.classList.add('pinching');
      if (gameActive) fireLaser();
    } else {
      retRightEl.classList.remove('pinching');
    }
  } else {
    // Mouse fallback: reposition reticles and hide labels if mouse takes steering focus
    if (gameActive) {
      if (mouseAimActive) {
        retLeftEl.style.display = 'none';
        retRightEl.style.display = 'none';
      } else {
        retLeftEl.style.display = 'block';
        retRightEl.style.display = 'block';
        
        retLeftEl.style.left = `${handLeftPos.x}px`;
        retLeftEl.style.top = `${handLeftPos.y}px`;
        retRightEl.style.left = `${handRightPos.x}px`;
        retRightEl.style.top = `${handRightPos.y}px`;
      }
    }
  }

  // Map Air Gamepad signals to physics movement variables
  player.joyForward = joyForward;
  player.joyBackward = joyBackward;
  player.joyLeft = joyLeft;
  player.joyRight = joyRight;

  updateDebugPanel();
}

function updatePlayerMovement() {
  // Lock player position to center of the arena (stationary turret defender)
  player.position.set(0, 1.6, 0);
  player.velocity.set(0, 0, 0);

  // Sync camera position and look rotation
  camera.position.copy(player.position);
  
  camera.rotation.set(0, 0, 0);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // Update Mini Preview Indicators (no-op since we are a stationary turret)
  updatePreviewIndicators(false, 0);
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.add(b.velocity);

    const distFromOrigin = b.position.length();
    let hitWall = distFromOrigin > (arenaSize / 2 + 10);

    let hitEnemy = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dist = b.position.distanceTo(e.mesh.position);
      if (dist < e.radius) {
        // Headshot detection: e.mesh.position.y is at 0.65, head is centered at y = 1.1 relative to mesh center
        // If the bullet hit is vertically above 0.85 relative to the mesh center, it's a headshot!
        const relativeY = b.position.y - e.mesh.position.y;
        const isHeadshot = relativeY > 0.85;

        if (isHeadshot) {
          e.takeDamage(3.0); // instant critical kill
          triggerCritAnnouncement();
        } else {
          e.takeDamage(1.5); // body shot
        }
        hitEnemy = true;
        break;
      }
    }

    if (hitWall || hitEnemy) {
      scene.remove(b);
      bullets.splice(i, 1);
    }
  }
}

function syncWeaponToCamera() {
  // AWP muzzle offset relative to viewport camera orientation matrix
  const offset = new THREE.Vector3(0.25, -0.28, -0.45);
  offset.applyMatrix4(camera.matrixWorld);
  weaponMesh.position.copy(offset);
  weaponMesh.rotation.copy(camera.rotation);
  
  // Apply visual offset during reload animation
  if (isReloading) {
    weaponMesh.rotation.x += reloadOffsetRot.x;
    weaponMesh.rotation.y += reloadOffsetRot.y;
  }
}

// --- HUD & Overlay UI Helpers ---

function updateHud() {
  document.getElementById('health-bar-fill').style.width = `${playerHp}%`;
  document.getElementById('hud-wave').innerText = currentWave;
  document.getElementById('hud-ammo').innerText = `${ammo} / ${maxAmmo}`;
  document.getElementById('hud-score').innerText = String(score).padStart(5, '0');

  const fill = document.getElementById('health-bar-fill');
  if (playerHp > 50) {
    fill.style.backgroundColor = '#00ff55';
  } else if (playerHp > 25) {
    fill.style.backgroundColor = '#ffc107';
  } else {
    fill.style.backgroundColor = '#ff3366';
  }
}

function updatePreviewIndicators(walking, strafe) {
  const wEl = document.getElementById('ind-walk');
  const lEl = document.getElementById('ind-left');
  const rEl = document.getElementById('ind-right');

  if (walking) wEl.classList.add('active'); else wEl.classList.remove('active');
  if (strafe < 0) lEl.classList.add('active'); else lEl.classList.remove('active');
  if (strafe > 0) rEl.classList.add('active'); else rEl.classList.remove('active');
}

function updateDebugPanel() {
  document.getElementById('dbg-gemini').innerText = window.MovementController.gemini.status;
  document.getElementById('dbg-ai-walk').innerText = window.MovementController.isGeminiActive ? window.MovementController.geminiState.walking : 'off';
  
  const flow = window.MovementController.optical.debug;
  document.getElementById('dbg-flow-motion').innerText = `${flow.walkMotion.toFixed(2)} / ${flow.walkThreshold.toFixed(2)}`;
  document.getElementById('dbg-flow-lean').innerText = `${flow.leanIndex.toFixed(2)} (${window.MovementController.optical.lean})`;
  
  document.getElementById('dbg-hand').innerText = isHandTracked ? 'yes' : 'no';
  
  // Display Left hand coordinate reticle or offline
  const list = window.MovementController && window.MovementController.handLandmarksList;
  const hasLandmarks = list && list.length > 0;
  const leftHandPresent = hasLandmarks && (list.length > 1 || (list[0] && list[0][0] && list[0][0].x > 0.5));
  document.getElementById('dbg-hand').innerText = leftHandPresent 
    ? `(${ (handLeftPos.x / window.innerWidth).toFixed(2) }, ${ (handLeftPos.y / window.innerHeight).toFixed(2) })` 
    : 'offline';

  // Display Right hand coordinate reticle
  const rightHandPresent = hasLandmarks && (list.length > 1 || (list[0] && list[0][0] && list[0][0].x <= 0.5));
  document.getElementById('dbg-reticle').innerText = rightHandPresent 
    ? `(${ (handRightPos.x / window.innerWidth).toFixed(2) }, ${ (handRightPos.y / window.innerHeight).toFixed(2) })` 
    : 'offline';

  document.getElementById('dbg-pinch').innerText = window.MovementController.pinchDistance.toFixed(2);
  document.getElementById('dbg-voice-cmd').innerText = window.MovementController.lastVoiceCommand;
}

function displayAnnouncement(text) {
  const el = document.getElementById('announcement');
  el.innerText = text;
  el.style.opacity = 1;
  setTimeout(() => {
    el.style.opacity = 0;
  }, 1800);
}

// --- Leaderboard Scoring Persistence ---

function saveScore(scoreVal) {
  try {
    const list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
    const name = localStorage.getItem('currentUserDisplayName') || 'Guest';
    list.push({ name: name, score: scoreVal, date: new Date().toLocaleDateString() });
    
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, 5);
    
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(top));
  } catch (e) {
    console.error('Failed to save highscore:', e);
  }
}

function loadLeaderboard() {
  const box1 = document.getElementById('lobby-leaderboard');
  const box2 = document.getElementById('gameover-leaderboard');
  
  let rowsHtml = '';
  try {
    const list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [
      { score: 3200, date: '10/24/2025' },
      { score: 1800, date: '10/25/2025' }
    ];

    const normalizedList = list.map(item => {
      if (typeof item === 'number') {
        return { name: 'System', score: item };
      }
      return {
        name: item.name || item.date || 'Guest',
        score: item.score
      };
    });

    normalizedList.forEach((item, idx) => {
      rowsHtml += `
        <div class="leaderboard-row ${idx === 0 ? 'high' : ''}">
          <span class="rank">${idx + 1}. ${item.name}</span>
          <span class="score">${String(item.score).padStart(5, '0')}</span>
        </div>
      `;
    });
  } catch (e) {
    rowsHtml = '<div style="font-size:0.7rem; color:#444;">Offline</div>';
  }

  if (box1) box1.innerHTML = rowsHtml;
  if (box2) box2.innerHTML = rowsHtml;
}
