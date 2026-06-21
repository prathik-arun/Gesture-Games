// game.js - Doors: The Castle - 3D Gesture-Controlled Roguelite Horror Game

// ==========================================
// 1. PROCEDURAL SOUND SYNTHESIZER
// ==========================================
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.windNode = null;
    this.warningOscs = [];
    this.warningGain = null;
    this.heartbeatTimer = null;
    this.scaryGain = null;
    this.scaryNodes = null;
  }
  
  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.ctx = new AudioContext();
      console.log("[Audio] Procedural Audio Context initialized.");
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  
  playFootstep(isCrouching) {
    if (!this.ctx) return;
    this.resume();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    const baseFreq = isCrouching ? 45 : 75;
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.12);
    
    const vol = isCrouching ? 0.04 : 0.22;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }
  
  playWind() {
    if (!this.ctx || this.windNode) return;
    this.resume();
    
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.5;
    filter.frequency.value = 250;
    
    const gain = this.ctx.createGain();
    gain.gain.value = 0.06;
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start();
    this.windNode = { noise, filter, gain };
    
    let windTime = 0;
    const modulateWind = () => {
      if (!this.windNode) return;
      windTime += 0.02;
      const targetFreq = 250 + Math.sin(windTime) * 80 + Math.sin(windTime * 0.35) * 40;
      filter.frequency.setValueAtTime(targetFreq, this.ctx.currentTime);
      setTimeout(modulateWind, 50);
    };
    modulateWind();
  }
  
  stopWind() {
    if (this.windNode) {
      try {
        this.windNode.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
        const node = this.windNode;
        setTimeout(() => {
          node.noise.stop();
        }, 400);
      } catch (e) {}
      this.windNode = null;
    }
  }
  
  playCreak() {
    if (!this.ctx) return;
    this.resume();
    const duration = 0.9;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(145, this.ctx.currentTime + duration * 0.4);
    osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + duration);
    
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, this.ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  
  playChest() {
    if (!this.ctx) return;
    this.resume();
    const time = this.ctx.currentTime;
    
    // Part 1: Wooden drawer sliding friction sound (noise + triangle low frequency sweep)
    const slideOsc = this.ctx.createOscillator();
    const slideFilter = this.ctx.createBiquadFilter();
    const slideGain = this.ctx.createGain();
    
    slideOsc.type = 'triangle';
    slideOsc.frequency.setValueAtTime(80, time);
    slideOsc.frequency.linearRampToValueAtTime(140, time + 0.35);
    
    slideFilter.type = 'lowpass';
    slideFilter.frequency.setValueAtTime(250, time);
    
    slideGain.gain.setValueAtTime(0.09, time);
    slideGain.gain.linearRampToValueAtTime(0.001, time + 0.38);
    
    slideOsc.connect(slideFilter);
    slideFilter.connect(slideGain);
    slideGain.connect(this.ctx.destination);
    
    slideOsc.start(time);
    slideOsc.stop(time + 0.4);
    
    // Part 2: Hollow thud impact sound (at time + 0.35s)
    setTimeout(() => {
      if (!this.ctx) return;
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      const thudFilter = this.ctx.createBiquadFilter();
      
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(75, this.ctx.currentTime);
      thudOsc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.12);
      
      thudFilter.type = 'lowpass';
      thudFilter.frequency.setValueAtTime(90, this.ctx.currentTime);
      
      thudGain.gain.setValueAtTime(0.24, this.ctx.currentTime);
      thudGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
      
      thudOsc.connect(thudFilter);
      thudFilter.connect(thudGain);
      thudGain.connect(this.ctx.destination);
      
      thudOsc.start();
      thudOsc.stop(this.ctx.currentTime + 0.18);
    }, 350);
  }
  
  playChime() {
    if (!this.ctx) return;
    this.resume();
    const time = this.ctx.currentTime;
    const freqs = [550, 770, 990, 1200];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(freq, time + idx * 0.05);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + idx * 0.05 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + idx * 0.05 + 0.22);
      
      osc.start(time + idx * 0.05);
      osc.stop(time + idx * 0.05 + 0.25);
    });
  }
  
  playLighter(on) {
    if (!this.ctx) return;
    this.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(on ? 380 : 220, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (on ? 0.05 : 0.03));
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }
  
  playDamage() {
    if (!this.ctx) return;
    this.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(35, this.ctx.currentTime + 0.28);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
  
  playScreech() {
    if (!this.ctx) return;
    this.resume();
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2200, time);
    osc.frequency.linearRampToValueAtTime(700, time + 0.35);
    
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(time + 0.35);
  }
  
  playJumpscare() {
    if (!this.ctx) return;
    this.resume();
    const time = this.ctx.currentTime;
    
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(110, time);
    osc1.frequency.linearRampToValueAtTime(280, time + 0.2);
    osc1.frequency.exponentialRampToValueAtTime(50, time + 1.1);
    
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(1800, time);
    osc2.frequency.exponentialRampToValueAtTime(180, time + 1.1);
    
    const bufferSize = this.ctx.sampleRate * 1.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    
    const dist = this.ctx.createWaveShaper();
    const curve = new Float32Array(44100);
    const k = 80;
    const deg = Math.PI / 180;
    for (let i = 0; i < 44100; ++i) {
      const x = (i * 2) / 44100 - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    dist.curve = curve;
    dist.oversample = '4x';
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.3);
    
    osc1.connect(dist);
    osc2.connect(dist);
    noise.connect(filter);
    filter.connect(dist);
    
    dist.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc1.start();
    osc2.start();
    noise.start();
    
    osc1.stop(time + 1.3);
    osc2.stop(time + 1.3);
    noise.stop(time + 1.3);
  }
  
  startWarning() {
    if (!this.ctx || this.warningGain) return;
    this.resume();
    this.warningGain = this.ctx.createGain();
    this.warningGain.gain.value = 0;
    this.warningGain.connect(this.ctx.destination);
    
    const freqs = [32, 42, 52];
    this.warningOscs = freqs.map(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(90, this.ctx.currentTime);
      
      osc.connect(filter);
      filter.connect(this.warningGain);
      osc.start();
      return osc;
    });
  }
  
  updateWarning(intensity) {
    if (!this.warningGain || !this.ctx) return;
    const targetVol = intensity * 0.4;
    this.warningGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    
    this.warningOscs.forEach((osc, idx) => {
      const baseFreq = [32, 42, 52][idx];
      const jitter = (Math.random() - 0.5) * 4 * intensity;
      osc.frequency.setValueAtTime(baseFreq + jitter, this.ctx.currentTime);
    });
  }
  
  stopWarning() {
    if (this.warningGain) {
      try {
        this.warningGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
        const oscs = this.warningOscs;
        setTimeout(() => {
          oscs.forEach(osc => osc.stop());
        }, 250);
      } catch (e) {}
      this.warningOscs = [];
      this.warningGain = null;
    }
  }
  
  startScaryMusic() {
    if (!this.ctx || this.scaryGain) return;
    this.resume();
    this.scaryGain = this.ctx.createGain();
    this.scaryGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this.scaryGain.gain.exponentialRampToValueAtTime(0.3, this.ctx.currentTime + 2.5);
    this.scaryGain.connect(this.ctx.destination);
    
    // Deep low horror drone at 55Hz (A1)
    const drone1 = this.ctx.createOscillator();
    drone1.type = 'sawtooth';
    drone1.frequency.setValueAtTime(55, this.ctx.currentTime);
    
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
    
    drone1.connect(droneFilter);
    droneFilter.connect(this.scaryGain);
    drone1.start();
    
    // Eerie detuned high choir/vibe sines with randomized LFO vibratos
    const choirGain = this.ctx.createGain();
    choirGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    choirGain.connect(this.scaryGain);
    
    const oscs = [110, 115, 165, 172].map((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, this.ctx.currentTime);
      
      const vibrato = this.ctx.createOscillator();
      vibrato.frequency.setValueAtTime(3.8 + Math.random() * 2.5, this.ctx.currentTime);
      
      const vibratoGain = this.ctx.createGain();
      vibratoGain.gain.setValueAtTime(5 + Math.random() * 3, this.ctx.currentTime);
      
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      
      vibrato.start();
      osc.connect(choirGain);
      osc.start();
      
      return { osc, vibrato };
    });
    
    this.scaryNodes = { drone1, oscs, droneFilter, choirGain };
  }
  
  stopScaryMusic() {
    if (this.scaryGain) {
      try {
        const gainNode = this.scaryGain;
        gainNode.gain.setValueAtTime(gainNode.gain.value, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
        const nodes = this.scaryNodes;
        setTimeout(() => {
          if (nodes) {
            try { nodes.drone1.stop(); } catch(e){}
            nodes.oscs.forEach(o => {
              try { o.osc.stop(); } catch(e){}
              try { o.vibrato.stop(); } catch(e){}
            });
          }
          try { gainNode.disconnect(); } catch(e){}
        }, 1000);
      } catch (e) {}
      this.scaryGain = null;
      this.scaryNodes = null;
    }
  }
  
  playHeartbeat(rate) {
    if (!this.ctx) return;
    this.resume();
    const time = this.ctx.currentTime;
    
    const playThud = (delay) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(55, time + delay);
      osc.frequency.exponentialRampToValueAtTime(10, time + delay + 0.08);
      
      gain.gain.setValueAtTime(0.25, time + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, time + delay + 0.1);
      
      osc.start(time + delay);
      osc.stop(time + delay + 0.12);
    };
    
    playThud(0);
    playThud(0.16);
  }
  
  startHeartbeat(bpm) {
    this.stopHeartbeat();
    const interval = 60000 / bpm;
    this.heartbeatTimer = setInterval(() => {
      this.playHeartbeat(0);
    }, interval);
  }
  
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  playRandomAmbience() {
    if (!this.ctx) return;
    this.resume();
    const time = this.ctx.currentTime;
    const type = Math.random() < 0.35 ? 'drip' : (Math.random() < 0.7 ? 'chain' : 'creak');
    
    if (type === 'drip') {
      // Water droplet falling echo
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(1200 + Math.random() * 400, time);
      osc.frequency.exponentialRampToValueAtTime(800, time + 0.08);
      
      gain.gain.setValueAtTime(0.015, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      
      osc.start(time);
      osc.stop(time + 0.2);
    } else if (type === 'chain') {
      // Iron chain rattle
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150 + Math.random() * 100, time);
      osc.frequency.setValueAtTime(280 + Math.random() * 100, time + 0.08);
      osc.frequency.setValueAtTime(90 + Math.random() * 50, time + 0.16);
      
      gain.gain.setValueAtTime(0.012, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      
      osc.start(time);
      osc.stop(time + 0.35);
    } else {
      // Dungeon creak
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(180, time);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, time);
      osc.frequency.linearRampToValueAtTime(45, time + 0.6);
      
      gain.gain.setValueAtTime(0.012, time);
      gain.gain.linearRampToValueAtTime(0.001, time + 0.6);
      
      osc.start(time);
      osc.stop(time + 0.65);
    }
  }
}

// ==========================================
// 2. CUSTOM CAMERA GESTURE TRACKER
// ==========================================
class GestureTracker {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.faceMesh = null;
    this.hands = null;
    this.camera = null;
    
    this.isInitialized = false;
    this.stream = null;
    
    // Calibration parameters
    this.isCalibrating = false;
    this.calibrationSamples = [];
    this.calibrationStartTime = 0;
    this.calibrationDuration = 3000; // 3 seconds
    
    // Baseline constants
    this.baselineNoseY = 0.5;
    this.baselineFaceHeight = 0.18;
    this.baselineYaw = 0.0;
    
    // Thresholds
    this.walkThreshold = 0.010; // stddev threshold of head Y oscillation (tuned down for responsiveness)
    this.yawThreshold = 0.11;   // horizontal cheek distance ratio threshold (tuned down for ergonomic comfort)
    this.crouchThreshold = 0.38; // vertical nose drop ratio threshold (lowered from 0.55 for comfortable crouching)
    this.pinchThreshold = 0.52;  // normalized index to thumb distance (increased from 0.46 for more lenient/easier pinching)
    
    // Tracking history
    this.yHistory = [];
    this.smoothedYaw = 0.0; // Smoothed yaw value to prevent over-sensitive jittery rotations
    
    // Computed states
    this.states = {
      walking: false,
      steering: 'center', // 'left' | 'right' | 'center'
      heightState: 'standing', // 'standing' | 'crouching'
      pinching: false,
      cursorX: 0.5,
      cursorY: 0.5,
      bones: [],
      faceLandmarks: null,
      rawBob: 0,
      rawYaw: 0,
      rawCrouch: 0,
      rawPinch: 0
    };
  }
  
  async initCamera(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;
    this.canvasCtx = canvasEl ? canvasEl.getContext('2d') : null;
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: "user"
        },
        audio: false
      });
      this.videoElement.srcObject = this.stream;
      this.videoElement.setAttribute('playsinline', true);
      
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play().then(resolve).catch(resolve);
        };
      });
      return true;
    } catch (e) {
      console.error("[GestureTracker] Webcam access denied:", e);
      return false;
    }
  }
  
  start() {
    if (this.isInitialized) return;
    
    // Initialize MediaPipe Solutions
    if (window.FaceMesh && window.Hands) {
      // 1. Face Mesh setup
      this.faceMesh = new window.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      this.faceMesh.onResults((results) => this.processFaceResults(results));
      
      // 2. Hands setup
      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.45,
        minTrackingConfidence: 0.45
      });
      this.hands.onResults((results) => this.processHandResults(results));
      
      // 3. Camera utility frame pump
      const cameraFramePump = async () => {
        if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
          requestAnimationFrame(cameraFramePump);
          return;
        }
        if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
          try {
            await this.faceMesh.send({ image: this.videoElement });
            await this.hands.send({ image: this.videoElement });
          } catch (e) {}
        }
        requestAnimationFrame(cameraFramePump);
      };
      requestAnimationFrame(cameraFramePump);
      
      this.isInitialized = true;
      console.log("[GestureTracker] MediaPipe engines started.");
    } else {
      console.error("[GestureTracker] MediaPipe scripts missing in index.html.");
    }
  }
  
  startCalibration() {
    this.isCalibrating = true;
    this.calibrationStartTime = Date.now();
    this.calibrationSamples = [];
    console.log("[GestureTracker] Calibration started...");
  }
  
  processFaceResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.states.faceLandmarks = null;
      return;
    }
    
    const face = results.multiFaceLandmarks[0];
    
    // Key landmarks:
    // 1: Nose tip
    // 10: Forehead
    // 152: Chin
    // 234: Left cheek boundary (image perspective)
    // 454: Right cheek boundary (image perspective)
    const nose = face[1];
    const forehead = face[10];
    const chin = face[152];
    const leftCheek = face[234];
    const rightCheek = face[454];
    
    if (!nose || !forehead || !chin || !leftCheek || !rightCheek) return;
    
    const faceHeight = Math.abs(forehead.y - chin.y) || 0.18;
    
    // Accumulate samples for calibration
    if (this.isCalibrating) {
      const elapsed = Date.now() - this.calibrationStartTime;
      if (elapsed < this.calibrationDuration) {
        // Record nose y position, face height, and cheek ratio
        const d_left = Math.abs(nose.x - leftCheek.x);
        const d_right = Math.abs(rightCheek.x - nose.x);
        const yaw = (d_right - d_left) / (d_right + d_left);
        
        this.calibrationSamples.push({ y: nose.y, h: faceHeight, yaw: yaw });
      } else {
        this.isCalibrating = false;
        // Calculate baselines
        const len = this.calibrationSamples.length || 1;
        let sumY = 0, sumH = 0, sumYaw = 0;
        this.calibrationSamples.forEach(s => {
          sumY += s.y;
          sumH += s.h;
          sumYaw += s.yaw;
        });
        
        this.baselineNoseY = sumY / len;
        this.baselineFaceHeight = sumH / len;
        this.baselineYaw = sumYaw / len;
        console.log(`[GestureTracker] Baseline Calibrated! BaselineY: ${this.baselineNoseY.toFixed(3)}, FaceHeight: ${this.baselineFaceHeight.toFixed(3)}, Yaw: ${this.baselineYaw.toFixed(3)}`);
      }
    }
    
    // --- 1. CROUCH DETECTION ---
    const rawCrouch = (nose.y - this.baselineNoseY) / faceHeight;
    this.states.rawCrouch = rawCrouch;
    if (rawCrouch > this.crouchThreshold) {
      this.states.heightState = 'crouching';
    } else {
      this.states.heightState = 'standing';
    }
    
    // --- 2. STEERING (YAW) DETECTION ---
    const d_left = Math.abs(nose.x - leftCheek.x);
    const d_right = Math.abs(rightCheek.x - nose.x);
    const yaw = (d_right - d_left) / (d_right + d_left);
    const relYaw = yaw - this.baselineYaw;
    
    if (this.smoothedYaw === undefined) {
      this.smoothedYaw = 0.0;
    }
    // Smooth the relative yaw to prevent over-sensitive, jittery head steering
    this.smoothedYaw = this.smoothedYaw * 0.85 + relYaw * 0.15;
    this.states.rawYaw = this.smoothedYaw;
    
    if (this.smoothedYaw > this.yawThreshold) {
      this.states.steering = 'right'; // turned right in mirror
    } else if (this.smoothedYaw < -this.yawThreshold) {
      this.states.steering = 'left'; // turned left in mirror
    } else {
      this.states.steering = 'center';
    }
    
    // --- 3. WALK IN PLACE (BOBBING) DETECTION ---
    this.yHistory.push(nose.y);
    if (this.yHistory.length > 30) this.yHistory.shift();
    
    if (this.yHistory.length >= 25) {
      // Calculate standard deviation of Y history to measure vertical jitter / shake amplitude
      let sum = 0;
      this.yHistory.forEach(y => sum += y);
      const mean = sum / this.yHistory.length;
      
      let varianceSum = 0;
      this.yHistory.forEach(y => varianceSum += Math.pow(y - mean, 2));
      const stdDev = Math.sqrt(varianceSum / this.yHistory.length) / faceHeight;
      this.states.rawBob = stdDev;
      
      // If stdDev is high, they are bobbing up and down (jogging)
      this.states.walking = stdDev > this.walkThreshold;
    } else {
      this.states.walking = false;
    }
    
    // Store Face landmarks on states for calibration overlay render
    this.states.faceLandmarks = results.multiFaceLandmarks[0];
  }
  
  processHandResults(results) {
    this.states.bones = [];
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.states.pinching = false;
      return;
    }
    
    const hand = results.multiHandLandmarks[0];
    this.states.bones = hand;
    
    // 0: Wrist
    // 4: Thumb Tip
    // 8: Index Tip
    // 9: Middle Base
    const wrist = hand[0];
    const thumbTip = hand[4];
    const indexTip = hand[8];
    const middleBase = hand[9];
    
    if (!wrist || !thumbTip || !indexTip || !middleBase) return;
    
    // Map dominant hand index tip to screen space cursor
    // Mirror the X coordinate for natural mouse alignment
    this.states.cursorX = 1 - indexTip.x;
    this.states.cursorY = indexTip.y;
    
    // Calculate hand scale (depth independent)
    const handSize = Math.sqrt(Math.pow(wrist.x - middleBase.x, 2) + Math.pow(wrist.y - middleBase.y, 2)) || 0.08;
    const pinchDist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)) / handSize;
    this.states.rawPinch = pinchDist;
    
    this.states.pinching = pinchDist < this.pinchThreshold;
    
    // Draw Hand skeleton will be drawn in the calibrationPumpLoop
  }
  
  drawFaceMeshSkeleton(landmarks) {
    if (!this.canvasCtx || !this.canvasElement) return;
    
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;
    
    // We will clear canvas in draw loop, here we only draw facial bounding guide box
    this.canvasCtx.strokeStyle = 'rgba(212, 175, 55, 0.15)';
    this.canvasCtx.lineWidth = 1;
    
    // Draw horizontal lines across eyes
    const forehead = landmarks[10];
    const chin = landmarks[152];
    if (forehead && chin) {
      const fy = forehead.y * h;
      const cy = chin.y * h;
      this.canvasCtx.beginPath();
      this.canvasCtx.moveTo(20, fy); this.canvasCtx.lineTo(w - 20, fy);
      this.canvasCtx.moveTo(20, cy); this.canvasCtx.lineTo(w - 20, cy);
      this.canvasCtx.stroke();
    }
  }
  
  drawHandSkeleton(landmarks) {
    if (!this.canvasCtx || !this.canvasElement) return;
    
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;
    
    const paths = [
      [0, 1, 2, 3, 4],       // thumb
      [0, 5, 6, 7, 8],       // index
      [9, 10, 11, 12],       // middle
      [13, 14, 15, 16],      // ring
      [0, 17, 18, 19, 20],   // pinky
      [5, 9, 13, 17]         // palm base
    ];
    
    this.canvasCtx.strokeStyle = 'rgba(192, 57, 43, 0.7)';
    this.canvasCtx.lineWidth = 2;
    
    paths.forEach(path => {
      this.canvasCtx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const pt = landmarks[path[i]];
        const lx = (1 - pt.x) * w;
        const ly = pt.y * h;
        if (i === 0) this.canvasCtx.moveTo(lx, ly);
        else this.canvasCtx.lineTo(lx, ly);
      }
      this.canvasCtx.stroke();
    });
    
    // Draw joints
    landmarks.forEach(pt => {
      const lx = (1 - pt.x) * w;
      const ly = pt.y * h;
      this.canvasCtx.fillStyle = '#d4af37';
      this.canvasCtx.beginPath();
      this.canvasCtx.arc(lx, ly, 3, 0, Math.PI * 2);
      this.canvasCtx.fill();
    });
  }
  
  clearOverlay() {
    if (!this.canvasCtx || !this.canvasElement || !this.videoElement) return;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;
    
    this.canvasCtx.save();
    this.canvasCtx.translate(w, 0);
    this.canvasCtx.scale(-1, 1);
    this.canvasCtx.drawImage(this.videoElement, 0, 0, w, h);
    this.canvasCtx.restore();
  }
}

// ==========================================
// 3. MAIN HORROR GAME ENGINE (Three.js & Loops)
// ==========================================
class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.audio = new SoundEffects();
    this.tracker = new GestureTracker();
    
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.playerGroup = null;
    this.playerLight = null;
    
    this.textures = {};
    this.materials = {};
    
    // Gameplay stats
    this.state = {
      health: 100,
      gold: 0,
      keys: 0,
      lighterFuel: 1.0,
      lighterActive: true,
      currentRoom: 1,
      isHiding: false,
      isGameOver: false,
      isWinner: false,
      hasKeyInRoom: false
    };
    
    // Keyboard inputs state
    this.keysPressed = {};
    this.mouseYaw = 0;
    this.mousePitch = 0;
    
    // Active procedurally generated rooms array
    this.rooms = [];
    this.currentRoomNode = null;
    
    // Interactive targets lists
    this.chests = []; // items like chests, keys, cupboards
    this.raycaster = new THREE.Raycaster();
    this.mouseVec = new THREE.Vector2();
    this.pinchCooldown = 0;
    this.wasPinching = false;
    this.wasEKeyPressed = false;
    
    // Monster timers and active states
    this.activeMonsters = {
      charger: null,
      gazer: null,
      stalker: null
    };
    this.lightsFlickerTimer = 0;
    this.monsterSpawns = [4, 11, 18, 25, 33, 42]; // Rooms where charger triggers
    this.gazerSpawns = [7, 15, 23, 31, 39]; // Rooms where eyes trigger
    this.decoySpawns = [5, 13, 22, 35, 44]; // Rooms with fake doors
    this.darkRooms = [3, 9, 14, 20, 27, 34, 40, 47]; // unlit rooms
    
    // Room 50 Library puzzle variables
    this.libraryCode = "3829";
    this.libraryInput = "";
    this.scrollsFound = 0;
    this.warden = null;
    this.wardenAlert = 0; // 0 to 1
    
    // Game loop timers
    this.lastTime = 0;
    this.clock = new THREE.Clock();
    
    // Setup bindings
    this.setupKeyboardFallback();
    this.setupButtons();
  }
  
  setupButtons() {
    const btnEnterCal = document.getElementById('btn-enter-calibration');
    const btnEnableCamera = document.getElementById('btn-enable-camera');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnRestart = document.getElementById('btn-btn-restart') || document.getElementById('btn-restart');
    const btnWinRestart = document.getElementById('btn-win-restart');
    
    btnEnterCal.addEventListener('click', () => {
      document.getElementById('menu-overlay').style.display = 'none';
      document.getElementById('calibration-overlay').style.display = 'flex';
      this.audio.init();
      this.audio.playWind();
    });

    const btnSkipCal = document.getElementById('btn-skip-calibration');
    if (btnSkipCal) {
      btnSkipCal.addEventListener('click', () => {
        document.getElementById('menu-overlay').style.display = 'none';
        document.getElementById('calibration-overlay').style.display = 'none';
        document.getElementById('hud').style.display = 'flex';
        this.audio.init();
        this.audio.playWind();
        this.bypassCalibration();
        this.initThreeEngine();
        setTimeout(() => {
          this.canvas.requestPointerLock();
        }, 100);
      });
    }
    
    btnEnableCamera.addEventListener('click', async () => {
      btnEnableCamera.disabled = true;
      btnEnableCamera.innerText = "Connecting...";
      
      const webcamCal = document.getElementById('webcam-calibration-view');
      const webcamCalOverlay = document.getElementById('calibration-canvas-overlay');
      const ok = await this.tracker.initCamera(webcamCal, webcamCalOverlay);
      
      if (ok) {
        // Clone camera stream to gameplay preview
        const mainWebcam = document.getElementById('webcam-view');
        mainWebcam.srcObject = webcamCal.srcObject;
        mainWebcam.play();
        
        btnEnableCamera.innerText = "Camera Active";
        
        // Start MediaPipe solution loops
        this.tracker.start();
        
        // Run Step 2 Calibration
        this.runStep2Calibration();
      } else {
        btnEnableCamera.innerText = "Enable";
        btnEnableCamera.disabled = false;
        alert("Webcam permission denied or camera not found. Keyboard controls activated by default.");
        // Bypassing calibration
        btnStartGame.disabled = false;
        this.bypassCalibration();
      }
    });
    
    btnStartGame.addEventListener('click', () => {
      document.getElementById('calibration-overlay').style.display = 'none';
      document.getElementById('hud').style.display = 'flex';
      this.initThreeEngine();
      setTimeout(() => {
        this.canvas.requestPointerLock();
      }, 100);
    });
    
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        document.getElementById('gameover-overlay').style.display = 'none';
        this.resetGame();
      });
    }
    
    if (btnWinRestart) {
      btnWinRestart.addEventListener('click', () => {
        document.getElementById('win-overlay').style.display = 'none';
        this.resetGame();
      });
    }
  }
  
  setupKeyboardFallback() {
    window.addEventListener('keydown', (e) => {
      if (!e.key) return;
      const key = e.key.toLowerCase();
      this.keysPressed[key] = true;
      
      // F to toggle lighter
      if (key === 'f') {
        this.toggleLighter();
      }
      
      // E to interact
      if (key === 'e') {
        this.interactByRaycast(0.5, 0.5); // Center crosshair click
      }
    });
    
    window.addEventListener('keyup', (e) => {
      if (!e.key) return;
      this.keysPressed[e.key.toLowerCase()] = false;
    });
    
    // Mouse steer look fallback
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas || this.keysPressed['mouseheld']) {
        const factor = 0.0025;
        this.mouseYaw -= e.movementX * factor;
        this.mousePitch -= e.movementY * factor;
        this.mousePitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, this.mousePitch));
      }
    });
    
    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      this.canvas.requestPointerLock();
      this.interactByRaycast(0.5, 0.5);
    });
  }
  
  toggleLighter() {
    if (this.state.isGameOver || this.state.isWinner) return;
    this.state.lighterActive = !this.state.lighterActive;
    this.audio.playLighter(this.state.lighterActive);
    
    const visible = this.state.lighterActive && this.state.lighterFuel > 0;
    if (this.playerLight) {
      this.playerLight.visible = visible;
    }
    if (this.lighterMesh) {
      this.lighterMesh.visible = visible;
    }
  }
  
  // Calibration countdown steps
  runStep2Calibration() {
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    step1.classList.remove('active');
    step1.classList.add('completed');
    step2.classList.add('active');
    
    this.tracker.startCalibration();
    let countdown = 3;
    const progress = document.getElementById('step-2-progress');
    const timer = setInterval(() => {
      countdown--;
      progress.style.width = `${((3 - countdown) / 3) * 100}%`;
      
      if (countdown <= 0) {
        clearInterval(timer);
        step2.classList.remove('active');
        step2.classList.add('completed');
        this.runStep3Calibration();
      }
    }, 1000);
  }
  
  runStep3Calibration() {
    const step3 = document.getElementById('step-3');
    step3.classList.add('active');
    
    let walkAccumulator = 0;
    const progress = document.getElementById('step-3-progress');
    
    const checkLoop = setInterval(() => {
      const stats = this.tracker.states;
      // Allow physical walking tracking OR pressing keyboard controls
      if (stats.walking || this.keysPressed['w'] || this.keysPressed['arrowup']) {
        walkAccumulator += 3.5;
        progress.style.width = `${Math.min(walkAccumulator, 100)}%`;
      }
      
      if (walkAccumulator >= 100) {
        clearInterval(checkLoop);
        step3.classList.remove('active');
        step3.classList.add('completed');
        this.runStep4Calibration();
      }
    }, 100);
  }
  
  runStep4Calibration() {
    const step4 = document.getElementById('step-4');
    step4.classList.add('active');
    
    let leftDone = 0;
    let rightDone = 0;
    const progress = document.getElementById('step-4-progress');
    
    const checkLoop = setInterval(() => {
      const stats = this.tracker.states;
      // Allow physical steering L/R OR steering using keyboard A/D or Left/Right keys
      if (stats.steering === 'left' || this.keysPressed['a'] || this.keysPressed['arrowleft']) leftDone = 50;
      if (stats.steering === 'right' || this.keysPressed['d'] || this.keysPressed['arrowright']) rightDone = 50;
      
      progress.style.width = `${leftDone + rightDone}%`;
      
      if (leftDone + rightDone >= 100) {
        clearInterval(checkLoop);
        step4.classList.remove('active');
        step4.classList.add('completed');
        this.runStep5Calibration();
      }
    }, 100);
  }
  
  runStep5Calibration() {
    const step5 = document.getElementById('step-5');
    step5.classList.add('active');
    
    let crouchDone = 0;
    let pinchDone = 0;
    const progress = document.getElementById('step-5-progress');
    
    // Add click handler as fallback to complete pinch step on mouse clicks during calibration
    const clickHandler = () => {
      pinchDone = 50;
    };
    window.addEventListener('click', clickHandler);
    
    const checkLoop = setInterval(() => {
      const stats = this.tracker.states;
      // Allow physical crouching/pinching OR using keyboard C / E / Mouse click
      if (stats.heightState === 'crouching' || this.keysPressed['c']) crouchDone = 50;
      if (stats.pinching || this.keysPressed['e']) pinchDone = 50;
      
      progress.style.width = `${crouchDone + pinchDone}%`;
      
      if (crouchDone + pinchDone >= 100) {
        clearInterval(checkLoop);
        window.removeEventListener('click', clickHandler);
        step5.classList.remove('active');
        step5.classList.add('completed');
        
        // Calibration fully finished
        const btnStart = document.getElementById('btn-start-game');
        btnStart.disabled = false;
        btnStart.focus();
      }
    }, 100);
  }
  
  bypassCalibration() {
    const steps = [1, 2, 3, 4, 5];
    steps.forEach(i => {
      const el = document.getElementById(`step-${i}`);
      if (el) {
        el.classList.remove('active');
        el.classList.add('completed');
      }
    });
  }
  
  // ==========================================
  // 4. PROCEDURAL GRAPHICS ENGINE SETUP
  // ==========================================
  initThreeEngine() {
    // 1. Create Scene, Renderer and Camera
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020202, 0.08);
    
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Group representing the player node containing the camera and lighter
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.set(0, 1.8, 0); // start height
    this.scene.add(this.playerGroup);
    this.playerGroup.add(this.camera);
    
    // Player lighter light
    this.playerLight = new THREE.PointLight(0xffa54f, 1.5, 12);
    this.playerLight.position.set(0.3, -0.4, -0.5); // lower-right light position
    this.playerLight.castShadow = true;
    this.playerLight.shadow.mapSize.width = 512;
    this.playerLight.shadow.mapSize.height = 512;
    this.playerGroup.add(this.playerLight);
    
    // Very dim ambient light for dark outline visible guides
    const ambientLight = new THREE.AmbientLight(0x08080c, 0.4);
    this.scene.add(ambientLight);
    
    // Generate materials
    this.generateProceduralMaterials();
    
    // Build initial rooms 1 and 2
    this.buildRoom(1);
    this.buildRoom(2);
    this.currentRoomNode = this.rooms[0];
    
    // Resize handler
    window.addEventListener('resize', () => this.onWindowResize());
    
    // Begin gameplay loop
    this.lastTime = performance.now();
    this.clock.start();
    this.audio.playWind();
    this.audio.startHeartbeat(72);
    this.initLighterMesh();
    
    // Run calibration frame loop pump
    this.calibrationPumpLoop();
    
    // Run main render loop
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  
  initLighterMesh() {
    if (this.lighterMesh) {
      try { this.camera.remove(this.lighterMesh); } catch(e){}
    }
    
    this.lighterMesh = new THREE.Group();
    this.lighterMesh.position.set(0.18, -0.22, -0.4); // bottom right relative to camera view
    this.lighterMesh.rotation.set(0, -Math.PI / 6, 0); // angled slightly inwards
    
    // Brass lighter casing
    const casing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0xb5a642, metalness: 0.8, roughness: 0.2 })
    );
    casing.position.set(0, 0, 0);
    this.lighterMesh.add(casing);
    
    // Tiny teardrop flame mesh
    this.flameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa500 })
    );
    this.flameMesh.scale.set(1, 2.5, 1); // elongate into flame shape
    this.flameMesh.position.set(0, 0.045, 0);
    this.lighterMesh.add(this.flameMesh);
    
    this.camera.add(this.lighterMesh);
    
    // Set initial visibility
    this.lighterMesh.visible = this.state.lighterActive && this.state.lighterFuel > 0;
  }
  
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  // Custom camera calibration pump loop
  calibrationPumpLoop() {
    if (!this.tracker.isInitialized) return;
    
    // Optimize performance: only render and update DOM stats when calibration overlay is visible
    const overlay = document.getElementById('calibration-overlay');
    if (overlay && overlay.style.display !== 'none') {
      this.tracker.clearOverlay();
      
      // Render skeletons on top of the webcam feed cleanly inside the frame pump loop to prevent flickering
      if (this.tracker.states.faceLandmarks) {
        this.tracker.drawFaceMeshSkeleton(this.tracker.states.faceLandmarks);
      }
      if (this.tracker.states.bones && this.tracker.states.bones.length > 0) {
        this.tracker.drawHandSkeleton(this.tracker.states.bones);
      }
      
      // Update calibration DOM stats
      const stats = this.tracker.states;
      const statWalk = document.getElementById('stat-walk');
      const statSteer = document.getElementById('stat-steer');
      const statHeight = document.getElementById('stat-height');
      const statPinch = document.getElementById('stat-pinch');
      
      if (statWalk) {
        statWalk.innerText = stats.walking ? "YES" : "NO";
        statWalk.className = `status-value ${stats.walking ? 'val-true' : 'val-false'}`;
      }
      if (statSteer) {
        statSteer.innerText = stats.steering.toUpperCase();
        statSteer.className = `status-value val-${stats.steering}`;
      }
      if (statHeight) {
        statHeight.innerText = stats.heightState.toUpperCase();
        statHeight.className = `status-value val-${stats.heightState === 'crouching' ? 'crouch' : 'normal'}`;
      }
      if (statPinch) {
        statPinch.innerText = stats.pinching ? "YES" : "NO";
        statPinch.className = `status-value ${stats.pinching ? 'val-true' : 'val-false'}`;
      }
    }
    
    setTimeout(() => this.calibrationPumpLoop(), 33);
  }
  
  // ==========================================
  // 5. PROCEDURAL TEXTURES GENERATION
  // ==========================================
  generateProceduralMaterials() {
    // Helper: draw noise
    const addNoise = (ctx, w, h, opacity, size = 1) => {
      for (let i = 0; i < (w*h*0.3); i++) {
        const val = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${val}, ${val}, ${val}, ${opacity})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
      }
    };
    
    // 1. COBBLESTONE TEXTURE (Walls)
    const canvasWall = document.createElement('canvas');
    canvasWall.width = 512;
    canvasWall.height = 512;
    const ctxWall = canvasWall.getContext('2d');
    
    ctxWall.fillStyle = '#1c1a18'; // mortar
    ctxWall.fillRect(0, 0, 512, 512);
    
    const rows = 12;
    const cols = 6;
    const rowH = 512 / rows;
    const colW = 512 / cols;
    ctxWall.lineWidth = 3;
    ctxWall.strokeStyle = '#0d0c0a';
    
    for (let r = 0; r < rows; r++) {
      const shift = (r % 2) * (colW / 2);
      for (let c = -1; c <= cols; c++) {
        const bx = c * colW + shift;
        const by = r * rowH;
        
        // Random gray cobblestone color tint
        const lightness = 45 + Math.random() * 25;
        const saturation = 10 + Math.random() * 10;
        ctxWall.fillStyle = `hsl(30, ${saturation}%, ${lightness}%)`;
        ctxWall.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);
        
        // Highlights and cracks
        ctxWall.fillStyle = 'rgba(255,255,255,0.06)';
        ctxWall.fillRect(bx + 2, by + 2, colW - 4, 3);
        ctxWall.fillRect(bx + 2, by + 2, 3, rowH - 4);
        
        ctxWall.fillStyle = 'rgba(0,0,0,0.18)';
        ctxWall.fillRect(bx + 2, by + rowH - 5, colW - 4, 3);
        ctxWall.fillRect(bx + colW - 5, by + 2, 3, rowH - 4);
        
        ctxWall.strokeRect(bx, by, colW, rowH);
      }
    }
    addNoise(ctxWall, 512, 512, 0.08, 2);
    
    const wallTex = new THREE.CanvasTexture(canvasWall);
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    
    // Create wall bump texture from grayscale values
    const canvasWallBump = document.createElement('canvas');
    canvasWallBump.width = 512;
    canvasWallBump.height = 512;
    const ctxWallBump = canvasWallBump.getContext('2d');
    ctxWallBump.drawImage(canvasWall, 0, 0);
    const imgData = ctxWallBump.getImageData(0, 0, 512, 512);
    const pixels = imgData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const val = 0.3 * pixels[i] + 0.59 * pixels[i+1] + 0.11 * pixels[i+2];
      pixels[i] = val;
      pixels[i+1] = val;
      pixels[i+2] = val;
    }
    ctxWallBump.putImageData(imgData, 0, 0);
    const wallBumpTex = new THREE.CanvasTexture(canvasWallBump);
    wallBumpTex.wrapS = THREE.RepeatWrapping;
    wallBumpTex.wrapT = THREE.RepeatWrapping;
    
    this.materials.wall = new THREE.MeshStandardMaterial({
      map: wallTex,
      bumpMap: wallBumpTex,
      bumpScale: 0.06,
      roughness: 0.85,
      metalness: 0.05
    });
    
    // 2. WOOD PLANK TEXTURE (Doors, chests, wardrobes)
    const canvasWood = document.createElement('canvas');
    canvasWood.width = 256;
    canvasWood.height = 256;
    const ctxWood = canvasWood.getContext('2d');
    
    ctxWood.fillStyle = '#4a2f13';
    ctxWood.fillRect(0, 0, 256, 256);
    
    // Draw wood lines
    ctxWood.strokeStyle = '#2d1c0b';
    ctxWood.lineWidth = 1;
    for (let y = 0; y < 256; y += 12) {
      ctxWood.beginPath();
      ctxWood.moveTo(0, y);
      ctxWood.bezierCurveTo(80, y + (Math.random() - 0.5) * 8, 170, y + (Math.random() - 0.5) * 8, 256, y);
      ctxWood.stroke();
      
      // Plank splits
      if (y % 48 === 0) {
        ctxWood.strokeStyle = '#1b1006';
        ctxWood.lineWidth = 3.5;
        ctxWood.beginPath();
        ctxWood.moveTo(0, y);
        ctxWood.lineTo(256, y);
        ctxWood.stroke();
        ctxWood.strokeStyle = '#2d1c0b';
        ctxWood.lineWidth = 1;
      }
    }
    // Add knots
    ctxWood.fillStyle = '#2d1c0b';
    for (let i = 0; i < 4; i++) {
      ctxWood.beginPath();
      ctxWood.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 10, 0, Math.PI * 2);
      ctxWood.fill();
    }
    addNoise(ctxWood, 256, 256, 0.05, 1);
    
    const woodTex = new THREE.CanvasTexture(canvasWood);
    this.materials.wood = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.78,
      metalness: 0.05
    });
    
    // 3. IRON TEXTURE (Locks, wardrobe reinforcement, chests hinges)
    const canvasIron = document.createElement('canvas');
    canvasIron.width = 128;
    canvasIron.height = 128;
    const ctxIron = canvasIron.getContext('2d');
    ctxIron.fillStyle = '#3c3e42';
    ctxIron.fillRect(0, 0, 128, 128);
    
    // Grunge / Scratch marks
    ctxIron.strokeStyle = '#202124';
    ctxIron.lineWidth = 1.5;
    for (let i = 0; i < 15; i++) {
      ctxIron.beginPath();
      ctxIron.moveTo(Math.random() * 128, Math.random() * 128);
      ctxIron.lineTo(Math.random() * 128, Math.random() * 128);
      ctxIron.stroke();
    }
    // Rust patches
    ctxIron.fillStyle = 'rgba(100, 50, 20, 0.25)';
    for (let i = 0; i < 6; i++) {
      ctxIron.beginPath();
      ctxIron.arc(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 15, 0, Math.PI * 2);
      ctxIron.fill();
    }
    addNoise(ctxIron, 128, 128, 0.12, 1);
    const ironTex = new THREE.CanvasTexture(canvasIron);
    this.materials.iron = new THREE.MeshStandardMaterial({
      map: ironTex,
      roughness: 0.5,
      metalness: 0.8
    });
    
    // 4. GOLD COIN TEXTURE
    const canvasGold = document.createElement('canvas');
    canvasGold.width = 64;
    canvasGold.height = 64;
    const ctxGold = canvasGold.getContext('2d');
    ctxGold.fillStyle = '#c5a018';
    ctxGold.fillRect(0, 0, 64, 64);
    ctxGold.strokeStyle = '#856b0d';
    ctxGold.lineWidth = 4;
    ctxGold.strokeRect(0, 0, 64, 64);
    addNoise(ctxGold, 64, 64, 0.08, 1);
    
    const goldTex = new THREE.CanvasTexture(canvasGold);
    this.materials.gold = new THREE.MeshStandardMaterial({
      map: goldTex,
      roughness: 0.25,
      metalness: 0.95
    });
    
    // Floor Tile Texture
    const canvasFloor = document.createElement('canvas');
    canvasFloor.width = 256;
    canvasFloor.height = 256;
    const ctxFloor = canvasFloor.getContext('2d');
    ctxFloor.fillStyle = '#141416';
    ctxFloor.fillRect(0, 0, 256, 256);
    ctxFloor.strokeStyle = '#08080a';
    ctxFloor.lineWidth = 5;
    ctxFloor.strokeRect(0, 0, 128, 128);
    ctxFloor.strokeRect(128, 0, 128, 128);
    ctxFloor.strokeRect(0, 128, 128, 128);
    ctxFloor.strokeRect(128, 128, 128, 128);
    
    // Floor dirt
    ctxFloor.fillStyle = 'rgba(0,0,0,0.4)';
    for(let i=0; i<10; i++) {
      ctxFloor.fillRect(Math.random()*256, Math.random()*256, 10+Math.random()*20, 10+Math.random()*20);
    }
    
    const floorTex = new THREE.CanvasTexture(canvasFloor);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    
    this.materials.floor = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Simple black shadow material
    this.materials.shadow = new THREE.MeshBasicMaterial({ color: 0x010101 });
  }
  
  // ==========================================
  // 6. PROCEDURAL CASTLE ROOM GENERATION
  // ==========================================
  buildRoom(num) {
    const roomLength = 30; // Length along Z axis
    const roomWidth = 10;   // Width along X axis
    const roomHeight = 6;   // Height along Y axis
    
    const roomGroup = new THREE.Group();
    roomGroup.position.set(0, 0, -(num - 1) * roomLength);
    this.scene.add(roomGroup);
    
    // Room properties
    const isDark = this.darkRooms.includes(num);
    const hasCharger = this.monsterSpawns.includes(num);
    const hasGazer = this.gazerSpawns.includes(num);
    const hasDecoy = this.decoySpawns.includes(num);
    const isLibrary = (num === 50); // Final Boss Library Room
    const isLocked = (num % 3 === 0); // Lock exit door every 3 rooms
    
    roomGroup.userData = {
      roomNumber: num,
      isDark: isDark,
      hasCharger: hasCharger,
      hasGazer: hasGazer,
      isLibrary: isLibrary,
      length: roomLength
    };
    
    // 1. FLOOR & CEILING
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, this.materials.floor);
    floorMesh.position.set(0, 0, -roomLength / 2);
    floorMesh.receiveShadow = true;
    roomGroup.add(floorMesh);
    
    const ceilingGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    ceilingGeo.rotateX(Math.PI / 2);
    const ceilingMesh = new THREE.Mesh(ceilingGeo, this.materials.floor);
    ceilingMesh.position.set(0, roomHeight, -roomLength / 2);
    roomGroup.add(ceilingMesh);
    
    // Ceiling wood support beams
    for (let z = -5; z >= -roomLength; z -= 10) {
      const beamGeo = new THREE.BoxGeometry(roomWidth, 0.4, 0.4);
      const beam = new THREE.Mesh(beamGeo, this.materials.wood);
      beam.position.set(0, roomHeight - 0.2, z);
      roomGroup.add(beam);
    }
    
    // 2. LEFT & RIGHT WALLS (Cobblestone)
    const wallGeo = new THREE.PlaneGeometry(roomLength, roomHeight);
    
    // Left Wall
    wallGeo.rotateY(Math.PI / 2);
    const leftWall = new THREE.Mesh(wallGeo, this.materials.wall);
    leftWall.position.set(-roomWidth / 2, roomHeight / 2, -roomLength / 2);
    leftWall.receiveShadow = true;
    roomGroup.add(leftWall);
    
    // Right Wall
    const rightWallGeo = new THREE.PlaneGeometry(roomLength, roomHeight);
    rightWallGeo.rotateY(-Math.PI / 2);
    const rightWall = new THREE.Mesh(rightWallGeo, this.materials.wall);
    rightWall.position.set(roomWidth / 2, roomHeight / 2, -roomLength / 2);
    rightWall.receiveShadow = true;
    roomGroup.add(rightWall);
    
    // Wall Pillars / Arches
    for (let z = 0; z >= -roomLength; z -= 15) {
      // Left pillar
      const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.8, roomHeight, 0.8), this.materials.wall);
      pillarL.position.set(-roomWidth / 2 + 0.4, roomHeight / 2, z);
      pillarL.castShadow = true;
      roomGroup.add(pillarL);
      
      // Right pillar
      const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.8, roomHeight, 0.8), this.materials.wall);
      pillarR.position.set(roomWidth / 2 - 0.4, roomHeight / 2, z);
      pillarR.castShadow = true;
      roomGroup.add(pillarR);
    }
    
    // 3. WALL LIGHTS (TORCHES) - Skip if Dark room
    const torchLights = [];
    if (!isDark && !isLibrary) {
      // Spawn 2 torches per room along the walls
      const spawnTorch = (xSide, zPos) => {
        const torch = new THREE.Group();
        torch.position.set(xSide * (roomWidth / 2 - 0.2), 3.2, zPos);
        
        // Bracket
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.2), this.materials.iron);
        torch.add(bracket);
        
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.6), this.materials.wood);
        stick.rotation.z = xSide * 0.3;
        stick.position.set(-xSide * 0.1, 0, 0.1);
        torch.add(stick);
        
        // Flame glow particle mesh
        const flameGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(-xSide * 0.22, 0.3, 0.15);
        torch.add(flame);
        
        // Point Light source
        const light = new THREE.PointLight(0xff5500, 1.4, 15);
        light.position.set(-xSide * 0.22, 0.4, 0.2);
        light.castShadow = true;
        light.shadow.bias = -0.002;
        torch.add(light);
        
        torchLights.push({ light, baseIntensity: 1.4, timeOffset: Math.random() * 100 });
        
        roomGroup.add(torch);
      };
      
      spawnTorch(1, -7.5);
      spawnTorch(-1, -22.5);
    }
    roomGroup.userData.torchLights = torchLights;
    
    // 4. FURNITURE & SCATTERED LOOT CONTAINER CHESTS
    if (!isLibrary) {
      // Force at least 1 chest if the room's door is locked, ensuring a chest spawns to contain the key
      const minChests = isLocked ? 1 : 0;
      const numChests = Math.floor(Math.random() * (3 - minChests)) + minChests; // 1 to 2 chests if locked, 0 to 2 if not
      for (let i = 0; i < numChests; i++) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const zOff = -(10 + Math.random() * 15);
        
        // Wooden chest assembly
        const chestGroup = new THREE.Group();
        chestGroup.position.set(side * (roomWidth / 2 - 1.2), 0.4, zOff);
        chestGroup.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
        
        const boxGeo = new THREE.BoxGeometry(1.2, 0.7, 0.8);
        const base = new THREE.Mesh(boxGeo, this.materials.wood);
        base.castShadow = true;
        chestGroup.add(base);
        
        // Lid
        const lidGroup = new THREE.Group();
        lidGroup.position.set(0, 0.35, -0.4); // hinge pivot
        
        const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.8), this.materials.wood);
        lidMesh.position.set(0, 0.1, 0.4);
        lidMesh.castShadow = true;
        lidGroup.add(lidMesh);
        
        // Iron latch
        const lockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.05), this.materials.iron);
        lockMesh.position.set(0, 0.05, 0.82);
        lidGroup.add(lockMesh);
        
        chestGroup.add(lidGroup);
        
        // Loot payload inside chest
        const lootType = Math.random() < 0.35 ? 'lighter' : (Math.random() < 0.7 ? 'gold' : 'key');
        
        chestGroup.userData = {
          type: 'chest',
          isOpen: false,
          loot: lootType,
          lid: lidGroup
        };
        chestGroup.name = "chest";
        
        roomGroup.add(chestGroup);
        this.chests.push(chestGroup);
      }
      
      // Spawn Hiding Wardrobes along side walls
      const numWardrobes = Math.random() > 0.4 ? 1 : 0;
      if (numWardrobes > 0) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const zOff = -5 - Math.random() * 20;
        
        const wardrobe = new THREE.Group();
        wardrobe.position.set(side * (roomWidth / 2 - 0.8), 1.75, zOff);
        wardrobe.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
        
        // Tall cabinet body
        const bodyGeo = new THREE.BoxGeometry(1.8, 3.2, 1.2);
        const bodyMesh = new THREE.Mesh(bodyGeo, this.materials.wood);
        bodyMesh.castShadow = true;
        wardrobe.add(bodyMesh);
        
        // Doors
        const leftDoor = new THREE.Group();
        leftDoor.position.set(-0.85, 0, 0.6); // left hinge pivot
        const ldMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 3.1, 0.1), this.materials.wood);
        ldMesh.position.set(0.42, 0, 0);
        ldMesh.castShadow = true;
        leftDoor.add(ldMesh);
        wardrobe.add(leftDoor);
        
        const rightDoor = new THREE.Group();
        rightDoor.position.set(0.85, 0, 0.6); // right hinge pivot
        const rdMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 3.1, 0.1), this.materials.wood);
        rdMesh.position.set(-0.42, 0, 0);
        rdMesh.castShadow = true;
        rightDoor.add(rdMesh);
        wardrobe.add(rightDoor);
        
        wardrobe.userData = {
          type: 'wardrobe',
          isOpen: false,
          leftDoor: leftDoor,
          rightDoor: rightDoor,
          worldPos: new THREE.Vector3(side * (roomWidth/2 - 2.5), 0, -(num - 1) * roomLength + zOff)
        };
        wardrobe.name = "wardrobe";
        
        roomGroup.add(wardrobe);
        this.chests.push(wardrobe);
      }
    }
    
    // 5. EXIT DOORS AND KEYS LOCK-AND-KEY BOTTLENECK
    const exitDoorGroup = new THREE.Group();
    exitDoorGroup.name = "door";
    exitDoorGroup.position.set(0, 0, -roomLength);
    
    // Thick wooden door mesh
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 0.25), this.materials.wood);
    doorMesh.position.set(0, 1.7, 0);
    doorMesh.castShadow = true;
    exitDoorGroup.add(doorMesh);
    
    // Large heavy iron handle latch
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.08), this.materials.iron);
    handle.position.set(0.8, 1.6, 0.18);
    exitDoorGroup.add(handle);
    
    // Archway frame around door
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 0.5), this.materials.wall);
    frameL.position.set(-1.3, 1.9, 0);
    exitDoorGroup.add(frameL);
    
    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 0.5), this.materials.wall);
    frameR.position.set(1.3, 1.9, 0);
    exitDoorGroup.add(frameR);
    
    const frameT = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 0.5), this.materials.wall);
    frameT.position.set(0, 3.9, 0);
    exitDoorGroup.add(frameT);
    
    // Exit door properties
    // In Decoy rooms, we spawn a separate split door set. Otherwise standard door.
    let correctDoorNum = num + 1;
    
    exitDoorGroup.userData = {
      type: 'door',
      isOpen: false,
      isLocked: isLocked,
      mesh: doorMesh,
      roomIndex: num
    };
    
    if (isLocked) {
      // Force spawn a key in this current room's chests (exclude wardrobes/doors)
      const roomChests = this.chests.filter(c => c.parent === roomGroup && c.name === "chest");
      if (roomChests.length > 0) {
        // Change one chest to contain key
        const luckyChest = roomChests[Math.floor(Math.random() * roomChests.length)];
        luckyChest.userData.loot = 'key';
      } else {
        // Spawn key directly floating on table
        const keyItem = this.createProceduralKeyMesh();
        keyItem.position.set(0, 1.0, -15);
        roomGroup.add(keyItem);
        this.chests.push(keyItem);
      }
      
      // Show padlock mesh on locked door
      const lockGeo = new THREE.BoxGeometry(0.4, 0.5, 0.15);
      const padlock = new THREE.Mesh(lockGeo, this.materials.iron);
      padlock.position.set(0, 1.6, 0.2);
      exitDoorGroup.add(padlock);
      exitDoorGroup.userData.padlock = padlock;
    }
    
    // Door labels / number meshes
    // Render room number text on top of exit frame
    const canvasText = document.createElement('canvas');
    canvasText.width = 128;
    canvasText.height = 64;
    const ctxText = canvasText.getContext('2d');
    ctxText.fillStyle = '#0a0a0c';
    ctxText.fillRect(0,0,128,64);
    ctxText.strokeStyle = '#c5a018';
    ctxText.lineWidth = 2;
    ctxText.strokeRect(4,4,120,56);
    ctxText.fillStyle = '#d4af37';
    ctxText.font = 'bold 36px Outfit';
    ctxText.textAlign = 'center';
    ctxText.textBaseline = 'middle';
    ctxText.fillText(correctDoorNum, 64, 32);
    
    const textTex = new THREE.CanvasTexture(canvasText);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshBasicMaterial({ map: textTex })
    );
    plaque.position.set(0, 3.4, 0.18);
    exitDoorGroup.add(plaque);
    
    // Solid end walls enclosing standard exit door frame
    if (!hasDecoy && !isLibrary) {
      const endWallL = new THREE.Mesh(new THREE.BoxGeometry(3.5, roomHeight, 0.5), this.materials.wall);
      endWallL.position.set(-3.25, roomHeight / 2, 0);
      exitDoorGroup.add(endWallL);
      
      const endWallR = new THREE.Mesh(new THREE.BoxGeometry(3.5, roomHeight, 0.5), this.materials.wall);
      endWallR.position.set(3.25, roomHeight / 2, 0);
      exitDoorGroup.add(endWallR);
      
      const endWallT = new THREE.Mesh(new THREE.BoxGeometry(3.0, roomHeight - 4.1, 0.5), this.materials.wall);
      endWallT.position.set(0, 4.1 + (roomHeight - 4.1) / 2, 0);
      exitDoorGroup.add(endWallT);
    }
    
    roomGroup.add(exitDoorGroup);
    this.chests.push(exitDoorGroup); // Add exit door to interactibles
    
    // If Decoy Room, build fake duplicate door on left and correct door on right
    if (hasDecoy && !isLibrary) {
      exitDoorGroup.position.set(2, 0, -roomLength); // Correct door on right
      
      // Top wall above correct exit door frame
      const endWallT = new THREE.Mesh(new THREE.BoxGeometry(3.0, roomHeight - 4.1, 0.5), this.materials.wall);
      endWallT.position.set(0, 4.1 + (roomHeight - 4.1) / 2, 0);
      exitDoorGroup.add(endWallT);
      
      // Make a fake duplicate decoy door group
      const decoyDoorGroup = new THREE.Group();
      decoyDoorGroup.name = "decoy-door";
      decoyDoorGroup.position.set(-2, 0, -roomLength);
      
      const decoyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 0.25), this.materials.wood);
      decoyMesh.position.set(0, 1.7, 0);
      decoyMesh.castShadow = true;
      decoyDoorGroup.add(decoyMesh);
      
      // Decoy lock handle
      const decoyHandle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.08), this.materials.iron);
      decoyHandle.position.set(0.8, 1.6, 0.18);
      decoyDoorGroup.add(decoyHandle);
      
      // Decoy frame
      const dfL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 0.5), this.materials.wall);
      dfL.position.set(-1.3, 1.9, 0);
      decoyDoorGroup.add(dfL);
      const dfR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.8, 0.5), this.materials.wall);
      dfR.position.set(1.3, 1.9, 0);
      decoyDoorGroup.add(dfR);
      
      // Top wall above decoy door frame
      const decoyEndWallT = new THREE.Mesh(new THREE.BoxGeometry(3.0, roomHeight - 4.1, 0.5), this.materials.wall);
      decoyEndWallT.position.set(0, 4.1 + (roomHeight - 4.1) / 2, 0);
      decoyDoorGroup.add(decoyEndWallT);
      
      // Fake wrong room number label on decoy door (e.g. incorrect Room 7 instead of 6)
      const fakeNum = correctDoorNum + 1;
      const canvasDecoyText = document.createElement('canvas');
      canvasDecoyText.width = 128;
      canvasDecoyText.height = 64;
      const ctxD = canvasDecoyText.getContext('2d');
      ctxD.fillStyle = '#0a0a0c';
      ctxD.fillRect(0,0,128,64);
      ctxD.fillStyle = '#d4af37';
      ctxD.font = 'bold 36px Outfit';
      ctxD.textAlign = 'center';
      ctxD.textBaseline = 'middle';
      ctxD.fillText(fakeNum, 64, 32);
      
      const decoyTextTex = new THREE.CanvasTexture(canvasDecoyText);
      const decoyPlaque = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.4),
        new THREE.MeshBasicMaterial({ map: decoyTextTex })
      );
      decoyPlaque.position.set(0, 3.4, 0.18);
      decoyDoorGroup.add(decoyPlaque);
      
      decoyDoorGroup.userData = {
        type: 'decoy-door',
        mesh: decoyMesh
      };
      
      roomGroup.add(decoyDoorGroup);
      this.chests.push(decoyDoorGroup);
      
      // Add gap-filling end walls to the roomGroup itself
      const outerWallL = new THREE.Mesh(new THREE.BoxGeometry(1.5, roomHeight, 0.5), this.materials.wall);
      outerWallL.position.set(-4.25, roomHeight / 2, -roomLength);
      roomGroup.add(outerWallL);
      
      const middleWall = new THREE.Mesh(new THREE.BoxGeometry(1.0, roomHeight, 0.5), this.materials.wall);
      middleWall.position.set(0.0, roomHeight / 2, -roomLength);
      roomGroup.add(middleWall);
      
      const outerWallR = new THREE.Mesh(new THREE.BoxGeometry(1.5, roomHeight, 0.5), this.materials.wall);
      outerWallR.position.set(4.25, roomHeight / 2, -roomLength);
      roomGroup.add(outerWallR);
    }
    
    // 6. BUILD FINAL LIBRARY MIDPOINT Milestone Puzzle (Room 50)
    if (isLibrary) {
      this.setupLibraryRoom(roomGroup, roomWidth, roomLength, roomHeight);
    }
    
    this.rooms.push(roomGroup);
  }
  
  createProceduralKeyMesh() {
    const keyGroup = new THREE.Group();
    keyGroup.userData = { type: 'key', pickedUp: false };
    keyGroup.name = "key";
    
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), this.materials.gold);
    keyGroup.add(ring);
    
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35), this.materials.gold);
    shaft.position.set(0, -0.2, 0);
    shaft.rotation.x = Math.PI / 2;
    keyGroup.add(shaft);
    
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), this.materials.gold);
    teeth.position.set(0.03, -0.32, 0);
    keyGroup.add(teeth);
    
    // Warm gold point light glow so it is prominent in dark rooms
    const glow = new THREE.PointLight(0xffd700, 1.2, 3.5);
    glow.position.set(0, 0, 0);
    keyGroup.add(glow);
    
    return keyGroup;
  }
  
  // Library Milestone Setup
  setupLibraryRoom(group, w, l, h) {
    // Massive tall hall
    const libHeight = 12;
    const libLength = 50;
    
    // Scale existing floor ceiling mesh
    group.children.forEach(c => {
      if (c.geometry && c.geometry.type === 'PlaneGeometry') {
        c.scale.set(2, 2, 2.5); // make it massive
      }
    });
    
    // Bookshelves columns layout
    const numShelves = 8;
    for (let i = 0; i < numShelves; i++) {
      const zOffset = -8 - i * 5.2;
      const xSide = i % 2 === 0 ? 1 : -1;
      
      const shelf = new THREE.Group();
      shelf.position.set(xSide * 3.5, 0, zOffset);
      
      // Large wooden bookcase
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6.5, 0.8), this.materials.wood);
      frame.position.set(0, 3.25, 0);
      frame.castShadow = true;
      shelf.add(frame);
      
      // Glowing colorful book meshes
      for (let sh = 0; sh < 5; sh++) {
        const bookH = 0.5 + sh * 1.1;
        for (let b = 0; b < 10; b++) {
          const bookColor = Math.random() < 0.3 ? 0xb22222 : (Math.random() < 0.6 ? 0xd4af37 : 0x4682b4);
          const bookMat = new THREE.MeshBasicMaterial({ color: bookColor });
          const book = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.5), bookMat);
          book.position.set(-1.0 + b * 0.22, bookH, 0.42);
          shelf.add(book);
        }
      }
      group.add(shelf);
    }
    
    // Keypad combination lock door
    const keypadDoor = new THREE.Group();
    keypadDoor.position.set(0, 0, -libLength);
    
    const dMesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.2, 0.3), this.materials.iron);
    dMesh.position.set(0, 2.1, 0);
    keypadDoor.add(dMesh);
    
    // Digital key box plaque
    const canvasKeypad = document.createElement('canvas');
    canvasKeypad.width = 128;
    canvasKeypad.height = 128;
    const ctxK = canvasKeypad.getContext('2d');
    ctxK.fillStyle = '#101015';
    ctxK.fillRect(0,0,128,128);
    ctxK.fillStyle = '#00ffcc';
    ctxK.font = 'bold 24px Courier';
    ctxK.fillText("CODE:", 10, 30);
    ctxK.fillText("----", 10, 70);
    const keypadTex = new THREE.CanvasTexture(canvasKeypad);
    const keyBox = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ map: keypadTex })
    );
    keyBox.position.set(0.9, 1.8, 0.2);
    keypadDoor.add(keyBox);
    
    keypadDoor.userData = {
      type: 'keypad-door',
      isOpen: false,
      codeScreen: keyBox,
      screenCtx: ctxK,
      screenTex: keypadTex
    };
    keypadDoor.name = "keypadDoor";
    
    // Solid end walls for library Room 50 combination gate (Library is 20 wide, 12 high)
    const endWallL = new THREE.Mesh(new THREE.BoxGeometry(8.75, libHeight, 0.5), this.materials.wall);
    endWallL.position.set(-5.625, libHeight / 2, 0);
    keypadDoor.add(endWallL);
    
    const endWallR = new THREE.Mesh(new THREE.BoxGeometry(8.75, libHeight, 0.5), this.materials.wall);
    endWallR.position.set(5.625, libHeight / 2, 0);
    keypadDoor.add(endWallR);
    
    const endWallT = new THREE.Mesh(new THREE.BoxGeometry(2.5, libHeight - 4.2, 0.5), this.materials.wall);
    endWallT.position.set(0, 4.2 + (libHeight - 4.2) / 2, 0);
    keypadDoor.add(endWallT);
    
    group.add(keypadDoor);
    this.chests.push(keypadDoor);
    
    // Spawn 4 scrolls randomly on desks
    for (let i = 0; i < 4; i++) {
      const scroll = new THREE.Group();
      scroll.position.set((Math.random() - 0.5) * 6, 0.2, -10 - i * 9);
      
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4), this.materials.gold);
      paper.rotation.z = Math.PI / 2;
      scroll.add(paper);
      
      scroll.userData = {
        type: 'scroll',
        digit: this.libraryCode[i],
        index: i + 1,
        pickedUp: false
      };
      
      group.add(scroll);
      this.chests.push(scroll);
    }
    
    // SPAWN THE WARDEN BOSS!
    this.spawnWarden(group, libLength);
  }
  
  spawnWarden(roomGroup, libLength) {
    this.warden = new THREE.Group();
    this.warden.position.set(0, 2.0, -15);
    
    // Large, blind multi-limb humanoid horror
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 12), this.materials.iron);
    this.warden.add(head);
    
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.9), this.materials.wood);
    jaw.position.set(0, -0.6, 0.2);
    this.warden.add(jaw);
    
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 2.2), this.materials.wall);
    body.position.set(0, -1.5, 0);
    this.warden.add(body);
    
    // Long arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), this.materials.iron);
    armL.position.set(-1.0, -1.0, 0.5);
    armL.rotation.z = 0.4;
    this.warden.add(armL);
    
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.2), this.materials.iron);
    armR.position.set(1.0, -1.0, 0.5);
    armR.rotation.z = -0.4;
    this.warden.add(armR);
    
    // Glowing blind red eyes guide indicator
    const light = new THREE.PointLight(0xff0033, 1.2, 8);
    light.position.set(0, 0.2, 0.9);
    this.warden.add(light);
    
    this.warden.userData = {
      velocityZ: 0.05,
      targetZ: -15,
      patrolPoints: [-10, -20, -32, -45],
      currentPoint: 0,
      chasing: false,
      speed: 0.04
    };
    
    roomGroup.add(this.warden);
  }
  
  // ==========================================
  // 7. INTERACTIVE RAYCAST ACTION
  // ==========================================
  interactByRaycast(screenX, screenY) {
    if (this.state.health <= 0 || this.state.isHiding) return;
    
    // Cast ray from pointer position
    this.mouseVec.set(screenX * 2 - 1, -(screenY * 2 - 1));
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    
    // Ray intersect list of interactive targets
    const hits = this.raycaster.intersectObjects(this.chests, true);
    
    if (hits.length > 0) {
      // Find top interactive group ancestor in hierarchy
      let target = hits[0].object;
      while (target.parent && target.name !== "chest" && target.name !== "wardrobe" && target.name !== "key" && target.name !== "keypadDoor" && target.userData.type !== "door" && target.userData.type !== "decoy-door" && target.userData.type !== "scroll") {
        target = target.parent;
      }
      
      // Distance check: must be near (< 5 units)
      const dist = hits[0].distance;
      if (dist > 5.2) {
        this.triggerCenterNotification("TOO FAR AWAY", "Move closer to search.");
        return;
      }
      
      // Perform actions based on node type
      const data = target.userData;
      
      if (target.name === "chest" && !data.isOpen) {
        this.audio.playChest();
        data.isOpen = true;
        
        // Rotate Lid Open Tween
        let rotateAngle = 0;
        const animateLid = () => {
          rotateAngle -= 0.08;
          data.lid.rotation.x = rotateAngle;
          if (rotateAngle > -Math.PI / 2.2) {
            requestAnimationFrame(animateLid);
          } else {
            // Reward loot
            this.giveLoot(data.loot);
          }
        };
        animateLid();
      }
      
      else if (target.name === "wardrobe") {
        if (!this.state.isHiding) {
          // STEP INSIDE
          this.audio.playCreak();
          this.state.isHiding = true;
          this.currentWardrobe = target;
          this.lastHideTime = Date.now();
          this.keysPressed['e'] = false;
          this.wasPinching = true;
          this.wasEKeyPressed = true; // Guard keyboard auto-repeat or same-frame keydown
          
          // Animate wardrobe doors open, slide player group inside, close doors
          let angle = 0;
          const openDoors = () => {
            angle += 0.08;
            data.leftDoor.rotation.y = angle;
            data.rightDoor.rotation.y = -angle;
            
            if (angle < Math.PI / 2.2) {
              requestAnimationFrame(openDoors);
            } else {
              // Doors fully open: slide camera inside
              const targetWorldPos = data.worldPos;
              this.playerGroup.position.copy(targetWorldPos);
              
              // Fade screen to Hiding vignette
              const hidingOverlay = document.getElementById('hiding-overlay');
              hidingOverlay.classList.add('visible');
              
              // Close doors behind
              let closeAngle = Math.PI / 2.2;
              const closeDoors = () => {
                closeAngle -= 0.1;
                data.leftDoor.rotation.y = closeAngle;
                data.rightDoor.rotation.y = -closeAngle;
                if (closeAngle > 0) {
                  requestAnimationFrame(closeDoors);
                }
              };
              closeDoors();
            }
          };
          openDoors();
        }
      }
      
      else if (data.type === 'door' && !data.isOpen) {
        if (data.isLocked) {
          if (this.state.keys > 0) {
            // Unlock!
            this.state.keys--;
            data.isLocked = false;
            this.audio.playChime();
            if (data.padlock) {
              // Delete padlock from 3D scene
              data.padlock.parent.remove(data.padlock);
            }
            this.triggerCenterNotification("UNLOCKED DOOR", "The lock falls open.");
          } else {
            this.audio.playLighter(false); // metallic click fail noise
            this.triggerCenterNotification("LOCKED DOOR", "Search chest/drawer for the key.");
          }
        } else {
          // Open Exit Door!
          this.audio.playCreak();
          data.isOpen = true;
          
          let angle = 0;
          const openDoor = () => {
            angle += 0.08;
            data.mesh.rotation.y = angle;
            data.mesh.position.x = angle * 0.55;
            data.mesh.position.z = angle * 0.5;
            if (angle < Math.PI / 2.2) {
              requestAnimationFrame(openDoor);
            }
          };
          openDoor();
        }
      }
      
      else if (data.type === 'decoy-door') {
        // Trigger Dupe Bite jumpscare and damage
        this.audio.playJumpscare();
        this.state.health -= 40;
        this.flashRedDamage();
        this.triggerCenterNotification("DUPE ATTACK", "You opened the trick decoy door!");
        
        // Remove fake door
        target.parent.remove(target);
      }
      
      else if (target.name === "key") {
        // Float key pickup
        this.audio.playChime();
        this.state.keys++;
        target.parent.remove(target);
        this.triggerCenterNotification("KEY ACQUIRED", "Used to unlock exit doors.");
      }
      
      else if (data.type === 'scroll') {
        this.audio.playChime();
        this.scrollsFound++;
        
        // Display found puzzle info
        this.triggerCenterNotification(`SCROLL FOUND (${this.scrollsFound}/4)`, `Code index ${data.index} is: "${data.digit}"`);
        
        target.parent.remove(target);
      }
      
      else if (data.type === 'keypad-door') {
        // Trigger combination digits check
        const digitCode = prompt(`Enter 4-Digit Exit Lock Code (You found ${this.scrollsFound}/4 scrolls):`);
        if (digitCode === this.libraryCode) {
          this.audio.playChime();
          this.triggerCenterNotification("CODE CRACKED", "The final security gate opens!");
          this.state.isWinner = true;
          
          setTimeout(() => this.triggerGameVictory(), 1500);
        } else {
          this.audio.playLighter(false);
          this.triggerCenterNotification("ACCESS DENIED", "Incorrect combination.");
          
          // Sound Alert triggers Warden!
          this.wardenAlert = 1.0;
          if (this.warden) {
            this.warden.userData.chasing = true;
            this.warden.userData.targetZ = this.playerGroup.position.z;
          }
        }
      }
    }
  }
  
  exitWardrobe() {
    if (!this.state.isHiding) return;
    this.audio.playCreak();
    
    // Fade overlay out
    const hidingOverlay = document.getElementById('hiding-overlay');
    hidingOverlay.classList.remove('visible');
    
    const data = this.currentWardrobe ? this.currentWardrobe.userData : null;
    if (data) {
      // Swing doors open
      let angle = 0;
      const openDoors = () => {
        angle += 0.08;
        data.leftDoor.rotation.y = angle;
        data.rightDoor.rotation.y = -angle;
        if (angle < Math.PI / 2.2) {
          requestAnimationFrame(openDoors);
        } else {
          // Teleport/move player out
          this.playerGroup.position.x += this.playerGroup.position.x > 0 ? -1.5 : 1.5;
          this.playerGroup.position.z += 1.5;
          
          // Close doors
          let closeAngle = Math.PI / 2.2;
          const closeDoors = () => {
            closeAngle -= 0.1;
            data.leftDoor.rotation.y = closeAngle;
            data.rightDoor.rotation.y = -closeAngle;
            if (closeAngle > 0) {
              requestAnimationFrame(closeDoors);
            } else {
              data.leftDoor.rotation.y = 0;
              data.rightDoor.rotation.y = 0;
            }
          };
          closeDoors();
        }
      };
      openDoors();
    } else {
      // Fallback
      this.playerGroup.position.x += this.playerGroup.position.x > 0 ? -1.5 : 1.5;
      this.playerGroup.position.z += 1.5;
    }
    
    this.state.isHiding = false;
  }
  
  giveLoot(lootType) {
    if (lootType === 'gold') {
      const g = 10 + Math.floor(Math.random() * 25);
      this.state.gold += g;
      this.audio.playChime();
      this.triggerCenterNotification(`FOUND GOLD (+${g}g)`, "Coins added to pouch.");
    } else if (lootType === 'key') {
      this.state.keys++;
      this.audio.playChime();
      this.triggerCenterNotification("FOUND DOOR KEY", "Used to unlock exiting barrier gates.");
    } else if (lootType === 'lighter') {
      this.state.lighterFuel = Math.min(1.0, this.state.lighterFuel + 0.5);
      this.audio.playChime();
      this.triggerCenterNotification("LIGHTER FLUID REPLENISHED", "Lighter fuel increased.");
    }
  }
  
  // ==========================================
  // 8. HORROR THREAT CYCLES (Monsters)
  // ==========================================
  triggerChargerWarningSequence(roomNum) {
    console.log(`[Horror] Charger warning sequence started for Room ${roomNum}`);
    
    // Start scary music and drone warning
    this.audio.startScaryMusic();
    this.audio.startWarning();
    
    // Flicker lights violently (approx 8 seconds warning at 60fps)
    this.lightsFlickerTimer = 480; 
    
    // Show scary overlay text announcement after 3.5 seconds of initial rattle/music build-up
    setTimeout(() => {
      if (this.state.isGameOver || this.state.isWinner) return;
      this.triggerCenterNotification("HIDE IN THE CLOSET!", "The ghost is coming...");
    }, 3500);
    
    // Start screen shaking warning effect
    let warningTime = 0;
    const shakeInterval = setInterval(() => {
      if (this.state.isGameOver || this.state.isWinner || !this.lightsFlickerTimer) {
        clearInterval(shakeInterval);
        return;
      }
      warningTime += 0.05;
      // Progressive intensity up to 0.28 (highly visible rattle)
      const intensity = Math.min(1.0, warningTime / 8.0);
      const shake = intensity * 0.28;
      this.camera.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
      
      // Update audio warning intensity during pre-spawn phase
      this.audio.updateWarning(intensity);
    }, 50);
    
    // Spawn and trigger the actual Charger rush after 8 seconds
    setTimeout(() => {
      this.triggerActualChargerRush(roomNum);
    }, 8000);
  }
  
  triggerActualChargerRush(roomNum) {
    if (this.state.isGameOver || this.state.isWinner) return;
    
    console.log(`[Horror] Charger Rush actually spawning at Room ${roomNum}!`);
    
    // Spawn Charger 3D mesh (creepy glowing face with red eyes)
    const charger = new THREE.Group();
    
    // Face skull
    const skull = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.4), new THREE.MeshBasicMaterial({ color: 0x990000 }));
    charger.add(skull);
    // Glowing eye indicators
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    eyeL.position.set(-0.35, 0.25, 0.22);
    charger.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.35;
    charger.add(eyeR);
    
    // Position Charger far behind room Z bounds
    const roomLength = 30;
    const startZ = -(roomNum - 3) * roomLength; // 2 rooms behind
    const endZ = -(roomNum + 1.5) * roomLength; // 1.5 rooms ahead
    
    charger.position.set(0, 1.8, startZ);
    this.scene.add(charger);
    
    // Spawn pool of 20 mist particles for the trail
    const trail = [];
    for (let i = 0; i < 20; i++) {
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 4, 4),
        new THREE.MeshBasicMaterial({
          color: Math.random() > 0.4 ? 0xb30000 : 0x1a0000,
          transparent: true,
          opacity: 0
        })
      );
      this.scene.add(pMesh);
      trail.push({
        mesh: pMesh,
        age: 0,
        lifetime: 35 + Math.random() * 25,
        active: false
      });
    }
    
    this.activeMonsters.charger = {
      mesh: charger,
      startZ: startZ,
      endZ: endZ,
      currentZ: startZ,
      speed: 0.9, // units per tick (approx 54 units/sec)
      roomNum: roomNum,
      trail: trail
    };
  }
  
  triggerStalkerScreech() {
    if (this.activeMonsters.stalker || this.state.isHiding) return;
    
    console.log("[Horror] Stalker Psst cue triggered!");
    this.audio.playScreech(); // Play low click/screech
    
    // Spawn stalker right behind camera position
    const stalker = new THREE.Group();
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    stalker.add(face);
    
    const glowEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glowEye.position.set(-0.15, 0.15, 0.45);
    stalker.add(glowEye);
    const glowEye2 = glowEye.clone();
    glowEye2.position.x = 0.15;
    stalker.add(glowEye2);
    
    // Position it attached to camera view, just outside immediate focus
    stalker.position.set(0.6, -0.2, -1.8);
    this.playerGroup.add(stalker);
    
    this.activeMonsters.stalker = {
      mesh: stalker,
      spawnTime: Date.now(),
      lifetime: 2500, // 2.5 seconds to look at it
      attacked: false
    };
  }
  
  triggerGazerEyes(roomGroup, roomNum) {
    console.log(`[Horror] Gazer Eyes spawned at Room ${roomNum}!`);
    
    const eyeCluster = new THREE.Group();
    eyeCluster.position.set(0, 3.0, -15); // center of room
    
    // Big central eyeball
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 16), new THREE.MeshBasicMaterial({ color: 0x2e0854 }));
    eyeCluster.add(eyeball);
    
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0x8a2be2 }));
    pupil.position.set(0, 0, 0.95);
    eyeCluster.add(pupil);
    
    // Purple Pointlight glow source
    const glow = new THREE.PointLight(0x7a00ff, 2.5, 12);
    glow.position.set(0, 0, 1.2);
    eyeCluster.add(glow);
    
    roomGroup.add(eyeCluster);
    
    this.activeMonsters.gazer = {
      mesh: eyeCluster,
      roomNum: roomNum,
      worldPos: new THREE.Vector3(0, 3.0, -(roomNum - 1) * 30 - 15)
    };
  }
  
  // ==========================================
  // 9. GAME LOOPS & RENDERING
  // ==========================================
  gameLoop(timestamp) {
    if (this.state.isGameOver || this.state.isWinner) return;
    
    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();
    
    // 1. Process Gestures / Inputs
    this.resolveMovementAndInputs(delta);
    
    // Flame flicker and point-light dance animation
    if (this.state.lighterActive && this.state.lighterFuel > 0) {
      if (this.lighterMesh) this.lighterMesh.visible = true;
      if (this.flameMesh) {
        const scaleFlicker = 1.0 + Math.sin(time * 25) * 0.15 + (Math.random() - 0.5) * 0.1;
        this.flameMesh.scale.set(scaleFlicker, scaleFlicker * 2.5, scaleFlicker);
        if (this.flameMesh.material && this.flameMesh.material.color) {
          this.flameMesh.material.color.setRGB(1.0, 0.55 + Math.random() * 0.15, 0.0);
        }
      }
      if (this.playerLight) {
        this.playerLight.intensity = 1.5 + Math.sin(time * 30) * 0.18 + (Math.random() - 0.5) * 0.08;
      }
    } else {
      if (this.lighterMesh) this.lighterMesh.visible = false;
      if (this.playerLight) this.playerLight.intensity = 0;
    }
    
    // Rotate and hover floating keys
    this.chests.forEach(c => {
      if (c.name === "key") {
        c.rotation.y = time * 2.0;
        c.position.y = 1.0 + Math.sin(time * 4.0) * 0.08;
      }
    });
    
    // Trigger random atmospheric ambient sounds (chains, creaks, drips)
    if (Math.random() < 0.0007) {
      this.audio.playRandomAmbience();
    }
    
    // Wardrobe hiding screen pulse
    if (this.state.isHiding) {
      const hidingOverlay = document.getElementById('hiding-overlay');
      if (hidingOverlay) {
        let intensity = 0;
        if (this.activeMonsters.charger) {
          const distance = Math.abs(this.playerGroup.position.z - this.activeMonsters.charger.currentZ);
          const rumbleRange = 85;
          intensity = Math.max(0, 1.0 - (distance / rumbleRange));
        }
        
        if (intensity > 0) {
          // Pulsate red glow in sync with heartbeat speed (using Math.sin)
          const beat = Math.sin(time * 12) * 0.5 + 0.5;
          hidingOverlay.style.boxShadow = `inset 0 0 ${40 + beat * 60}px rgba(180, 0, 0, ${intensity * (0.3 + beat * 0.4)})`;
        } else {
          hidingOverlay.style.boxShadow = '';
        }
      }
    }
    
    // 2. Flicker torches if Charger approaching
    this.flickerTorches(time);
    
    // 3. Process Monster attacks
    this.updateMonsters(delta);
    
    // 4. Room progression checks
    this.checkRoomProgression();
    
    // 5. Render Scene
    this.renderer.render(this.scene, this.camera);
    
    // Update active HUD details
    this.updateHUD();
    
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  
  resolveMovementAndInputs(delta) {
    if (this.state.isHiding) {
      // hidden wardrobe controls
      const stats = this.tracker.states;
      const triggerExit = stats.pinching || this.keysPressed['e'];
      
      // We check if they released the pinch / E key before allowing exit to prevent immediate/accidental exit
      if (triggerExit && !this.wasPinching && !this.wasEKeyPressed && Date.now() - this.lastHideTime > 800) {
        this.exitWardrobe();
      }
      this.wasPinching = stats.pinching;
      this.wasEKeyPressed = this.keysPressed['e'];
      return;
    }
    
    const stats = this.tracker.states;
    const currentRoomIndex = Math.floor(Math.abs(this.playerGroup.position.z) / 30) + 1;
    
    // --- 1. VIEW STEERING ROTATION ---
    let yawSpeed = 0;
    
    // Keyboard fallback steer
    if (this.keysPressed['a'] || this.keysPressed['arrowleft']) {
      this.mouseYaw += 1.5 * delta;
    }
    if (this.keysPressed['d'] || this.keysPressed['arrowright']) {
      this.mouseYaw -= 1.5 * delta;
    }
    
    // Camera gesture steering (Joystick-style continuous rotation scaled by relative head tilt excess)
    const rawYaw = stats.rawYaw || 0;
    const absYaw = Math.abs(rawYaw);
    if (absYaw > this.tracker.yawThreshold) {
      const excess = absYaw - this.tracker.yawThreshold;
      // Use quadratic scaling for fine steering adjustments (gentler small turns, faster large turns)
      const steerFactor = Math.pow(Math.min(1.0, excess / 0.18), 2.0);
      const direction = rawYaw > 0 ? -1 : 1; // negative yaw values are left turns (image perspective)
      yawSpeed = direction * 1.3 * steerFactor * delta; // slightly reduced max speed for smoother camera turns
    }
    this.mouseYaw += yawSpeed;
    
    // Apply combined rotations
    this.camera.rotation.set(this.mousePitch, 0, 0);
    this.playerGroup.rotation.set(0, this.mouseYaw, 0);
    
    // Render direction indicator icons in mini camera preview
    document.getElementById('ind-left').className = `dir-indicator ${stats.steering === 'left' ? 'active' : ''}`;
    document.getElementById('ind-right').className = `dir-indicator ${stats.steering === 'right' ? 'active' : ''}`;
    document.getElementById('ind-walk').className = `dir-indicator ${stats.walking ? 'active' : ''}`;
    document.getElementById('ind-crouch').className = `dir-indicator ${stats.heightState === 'crouching' ? 'active' : ''}`;
    
    // --- 2. WALK POSITION COLLISION BOUNDS RESOLUTION ---
    let isMoving = false;
    let speed = 2.2 * delta; // units per second forward velocity
    let moveDir = 1; // 1 for forward, -1 for backward
    
    // Keyboard fallback walk
    if (this.keysPressed['w'] || this.keysPressed['arrowup'] || stats.walking) {
      isMoving = true;
      moveDir = 1;
    } else if (this.keysPressed['s'] || this.keysPressed['arrowdown']) {
      isMoving = true;
      moveDir = -1;
    }
    
    // Lower speed if crouching
    const isCrouching = (stats.heightState === 'crouching' || this.keysPressed['c']);
    if (isCrouching) {
      speed *= 0.5;
    }
    
    if (isMoving) {
      // Calculate move vector based on direction
      const dx = -Math.sin(this.mouseYaw) * speed * moveDir;
      const dz = -Math.cos(this.mouseYaw) * speed * moveDir;
      
      // Store next position
      const nextX = this.playerGroup.position.x + dx;
      const nextZ = this.playerGroup.position.z + dz;
      
      // Check collision for proposed X and Z separately for smooth sliding
      let testX = nextX;
      let testZ = this.playerGroup.position.z;
      let collidesX = false;
      let collidesZ = false;
      
      const playerRadius = 0.6;
      
      for (const obj of this.chests) {
        if (obj.name === "chest" || obj.name === "wardrobe") {
          const roomZ = obj.parent ? obj.parent.position.z : 0;
          const worldX = obj.position.x;
          const worldZ = roomZ + obj.position.z;
          
          let halfW = obj.name === "chest" ? 0.95 : 1.15;
          let halfD = obj.name === "chest" ? 0.75 : 0.95;
          
          // Test X movement
          if (Math.abs(testX - worldX) < (halfW + playerRadius) && Math.abs(testZ - worldZ) < (halfD + playerRadius)) {
            collidesX = true;
          }
          // Test Z movement
          if (Math.abs(this.playerGroup.position.x - worldX) < (halfW + playerRadius) && Math.abs(nextZ - worldZ) < (halfD + playerRadius)) {
            collidesZ = true;
          }
        }
      }
      
      if (!collidesX && Math.abs(nextX) < 4.15) {
        this.playerGroup.position.x = nextX;
      }
      
      if (!collidesZ) {
        let allowedZ = nextZ;
        const proposedRoomLocalZ = Math.abs(nextZ) % 30;
        
        if (proposedRoomLocalZ > 28.5) {
          const exitDoor = this.chests.find(c => c.userData.type === 'door' && c.userData.roomIndex === currentRoomIndex);
          if (exitDoor && !exitDoor.userData.isOpen) {
            // Clamp nextZ to the boundary to eliminate jitter
            allowedZ = -(currentRoomIndex - 1) * 30 - 28.5;
          }
        }
        this.playerGroup.position.z = allowedZ;
      }
      
      // Play walking footstep sound intervals
      const stepFreq = isCrouching ? 0.8 : 0.45; // seconds per step
      if (!this.lastStepTime) this.lastStepTime = 0;
      const now = this.clock.getElapsedTime();
      if (now - this.lastStepTime > stepFreq) {
        this.audio.playFootstep(isCrouching);
        this.lastStepTime = now;
      }
      
      // Calculate noise level based on walking movement
      let targetNoise = isCrouching ? 0.15 : 0.75;
      if (this.state.noiseLevel === undefined) this.state.noiseLevel = 0;
      this.state.noiseLevel += (targetNoise - this.state.noiseLevel) * 0.15;
    } else {
      // Decay noise level when not moving
      if (this.state.noiseLevel === undefined) this.state.noiseLevel = 0;
      this.state.noiseLevel += (0.0 - this.state.noiseLevel) * 0.15;
    }
    
    // Blind Warden hunt tracking in Room 50 Library (Warden is alerted dynamically based on noise Level)
    if (currentRoomIndex === 50 && this.warden) {
      if (this.state.noiseLevel > 0.3) {
        this.wardenAlert = Math.min(1.0, this.wardenAlert + this.state.noiseLevel * 0.08 * delta * 60);
        this.warden.userData.chasing = true;
        this.warden.userData.targetZ = this.playerGroup.position.z;
      }
    }
    
    // --- 3. STANCE CAMERA HEIGHT OFFSET ---
    const targetY = isCrouching ? 1.0 : 1.8;
    this.playerGroup.position.y += (targetY - this.playerGroup.position.y) * 0.15;
    
    // --- 4. LIGHTER FUEL CONSUMPTION ---
    if (this.state.lighterActive) {
      this.state.lighterFuel = Math.max(0, this.state.lighterFuel - 0.00035 * delta); // drains slowly
      if (this.state.lighterFuel <= 0) {
        this.playerLight.visible = false;
      }
    }
    
    // --- 5. AIR RETICLE CURSOR UPDATES ---
    const handCursor = document.getElementById('hand-cursor');
    if (stats.bones && stats.bones.length > 0) {
      handCursor.style.display = 'block';
      handCursor.style.left = `${stats.cursorX * window.innerWidth}px`;
      handCursor.style.top = `${stats.cursorY * window.innerHeight}px`;
      
      if (stats.pinching) {
        handCursor.classList.add('pinching');
      } else {
        handCursor.classList.remove('pinching');
      }
      
      // Raycast pinch interaction trigger checks
      if (stats.pinching && !this.wasPinching) {
        this.interactByRaycast(stats.cursorX, stats.cursorY);
      }
    } else {
      handCursor.style.display = 'none';
    }
    this.wasPinching = stats.pinching;
    
    // Hover interactions prompt labels updates
    this.updateInteractionPrompts();
    
    // Update Debug monitor overlay values
    const dbgTracking = document.getElementById('dbg-tracking');
    if (dbgTracking) {
      dbgTracking.innerText = this.tracker.isInitialized ? "active" : "inactive";
      document.getElementById('dbg-y-bob').innerText = `X: ${this.playerGroup.position.x.toFixed(2)} Z: ${this.playerGroup.position.z.toFixed(2)}`;
      document.getElementById('dbg-yaw').innerText = `Yaw: ${this.mouseYaw.toFixed(2)}`;
      document.getElementById('dbg-height').innerText = `Crouch: ${isCrouching ? 'YES' : 'NO'}`;
      document.getElementById('dbg-pinch').innerText = `Delta: ${delta.toFixed(4)}`;
      document.getElementById('dbg-action').innerText = `Keys: ${Object.keys(this.keysPressed).filter(k => this.keysPressed[k]).join(',')}`;
    }
  }
  
  updateInteractionPrompts() {
    const promptEl = document.getElementById('interaction-prompt');
    
    // Raycast from camera center
    this.mouseVec.set(0, 0); // Center crosshair
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    
    const hits = this.raycaster.intersectObjects(this.chests, true);
    if (hits.length > 0 && hits[0].distance <= 5.2 && !this.state.isHiding) {
      let target = hits[0].object;
      while (target.parent && target.name !== "chest" && target.name !== "wardrobe" && target.name !== "key" && target.name !== "keypadDoor" && target.userData.type !== "door" && target.userData.type !== "decoy-door" && target.userData.type !== "scroll") {
        target = target.parent;
      }
      
      const type = target.userData.type || target.name;
      
      if (type === 'chest' && !target.userData.isOpen) {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = "Open Chest";
      } else if (type === 'wardrobe') {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = "Hide in Wardrobe";
      } else if (type === 'door' && !target.userData.isOpen) {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = target.userData.isLocked ? "Unlock Exit Door" : "Open Exit Door";
      } else if (type === 'decoy-door') {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = "Open Exit Door";
      } else if (type === 'key') {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = "Pickup Key";
      } else if (type === 'scroll') {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = "Read Parchment Scroll";
      } else if (type === 'keypad-door') {
        promptEl.style.display = 'flex';
        promptEl.querySelector('.prompt-text').innerText = "Unlock Combo Keypad";
      } else {
        promptEl.style.display = 'none';
      }
    } else {
      promptEl.style.display = 'none';
    }
  }
  
  flickerTorches(time) {
    const currentRoom = this.rooms.find(r => r.userData.roomNumber === this.state.currentRoom);
    if (!currentRoom || !currentRoom.userData.torchLights) return;
    
    let isFlickering = false;
    if (this.lightsFlickerTimer > 0) {
      this.lightsFlickerTimer--;
      isFlickering = true;
    }
    
    // Ripple flicker wall torchesPointLights
    currentRoom.userData.torchLights.forEach(t => {
      let flicker = Math.sin(time * 30 + t.timeOffset) * 0.15 + (Math.random() - 0.5) * 0.08;
      
      // If lightsFlickerTimer is active (Charger incoming), lower light intensity to blackouts
      if (isFlickering) {
        const cycle = Math.floor(time * 15) % 2;
        flicker = cycle === 0 ? -t.baseIntensity * 0.95 : -t.baseIntensity * 0.8;
      }
      
      t.light.intensity = Math.max(0.01, t.baseIntensity + flicker);
    });
  }
  
  // ==========================================
  // 10. ACTIVE MONSTERS BEHAVIOR CYCLES
  // ==========================================
  updateMonsters(delta) {
    const now = Date.now();
    
    // --- 1. THE CHARGER (RUSH) ---
    if (this.activeMonsters.charger) {
      const charger = this.activeMonsters.charger;
      charger.currentZ -= charger.speed * 60 * delta; // speed factor
      charger.mesh.position.z = charger.currentZ;
      
      // Add red lights pulsing glow
      charger.mesh.children.forEach(c => {
        if (c.material) c.material.color.setHSL(0, 1.0, 0.3 + Math.sin(now * 0.05) * 0.2);
      });
      
      // Rumble roar warn volume scales with proximity
      const distance = Math.abs(this.playerGroup.position.z - charger.currentZ);
      const rumbleRange = 85;
      if (distance < rumbleRange) {
        const intensity = 1.0 - (distance / rumbleRange);
        this.audio.updateWarning(intensity);
        
        // Shake screen
        const shake = intensity * 0.25;
        this.camera.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
      }
      
      // Check collision
      if (charger.currentZ <= this.playerGroup.position.z && !this.state.isHiding && distance < 2.0) {
        // KILL PLAYER JUMPSCARE!
        this.triggerJumpscareDeath("Captured by the Charger");
      }
      
      // Spawn trail particle
      if (charger.trail) {
        const inactive = charger.trail.find(p => !p.active);
        if (inactive) {
          inactive.active = true;
          inactive.age = 0;
          inactive.mesh.position.set(
            charger.mesh.position.x + (Math.random() - 0.5) * 0.8,
            charger.mesh.position.y + (Math.random() - 0.5) * 0.8,
            charger.mesh.position.z + (Math.random() - 0.5) * 0.5
          );
          inactive.mesh.scale.set(1, 1, 1);
          inactive.mesh.material.opacity = 0.8;
        }
        
        // Update all trail particles
        charger.trail.forEach(p => {
          if (p.active) {
            p.age += 1;
            p.mesh.position.y += 0.005; // float up slightly
            p.mesh.scale.multiplyScalar(0.96); // shrink
            p.mesh.material.opacity = 0.8 * (1.0 - (p.age / p.lifetime));
            if (p.age >= p.lifetime) {
              p.active = false;
              p.mesh.material.opacity = 0;
            }
          }
        });
      }
      
      // Clean up past room Z bounds
      if (charger.currentZ < charger.endZ) {
        if (charger.trail) {
          charger.trail.forEach(p => this.scene.remove(p.mesh));
        }
        this.audio.stopWarning();
        this.audio.stopScaryMusic();
        this.scene.remove(charger.mesh);
        this.activeMonsters.charger = null;
        this.camera.position.set(0, 0, 0); // reset camera position
      }
    }
    
    // --- 2. THE GAZER (EYES VARIANT) ---
    if (this.activeMonsters.gazer) {
      const gazer = this.activeMonsters.gazer;
      if (this.state.currentRoom === gazer.roomNum && !this.state.isHiding) {
        // Check line of sight inside camera frustum view
        // Raycast from player camera to eyeball
        const playerVec = new THREE.Vector3();
        this.camera.getWorldDirection(playerVec);
        
        const toGazer = new THREE.Vector3().subVectors(gazer.worldPos, this.playerGroup.position).normalize();
        const dot = playerVec.dot(toGazer);
        
        // If player is looking directly at eyeball (dot product > 0.85 is roughly center view field)
        if (dot > 0.82) {
          // DRAIN HEALTH!
          this.state.health = Math.max(0, this.state.health - 25 * delta);
          this.audio.playDamage();
          this.flashRedDamage();
          
          if (this.state.health <= 0) {
            this.triggerJumpscareDeath("Stared into the eyes of the Gazer");
          }
        }
      }
    }
    
    // --- 3. THE STALKER (SCREECH VARIANT) ---
    if (this.activeMonsters.stalker) {
      const stalker = this.activeMonsters.stalker;
      const elapsed = now - stalker.spawnTime;
      
      if (!stalker.attacked) {
        // Check if player rotated camera to center stalker inside field of view
        const playerVec = new THREE.Vector3();
        this.camera.getWorldDirection(playerVec);
        
        // Stalker is attached to camera group, we check camera rotation values
        // If mouse looking or turning registers Stalker in viewport
        const yawAngle = Math.abs(this.camera.rotation.y);
        
        // Stalker is spawned at X=0.6 (right cheek). If player rotates camera right
        const screenLooking = (this.keysPressed['a'] || this.keysPressed['d'] || this.tracker.states.steering !== 'center');
        
        if (elapsed > 400 && screenLooking) {
          // Scared away!
          this.audio.playScreech();
          this.playerGroup.remove(stalker.mesh);
          this.activeMonsters.stalker = null;
          this.triggerCenterNotification("STALKER BANISHED", "You looked directly at the Screech.");
        }
        
        else if (elapsed > stalker.lifetime) {
          // BITE DAMAGE!
          stalker.attacked = true;
          this.audio.playJumpscare();
          this.state.health = Math.max(0, this.state.health - 40);
          this.flashRedDamage();
          this.triggerCenterNotification("BITTEN", "A Screech attacked you in the dark!");
          
          if (this.state.health <= 0) {
            this.triggerJumpscareDeath("Bitten by a Screech");
          }
          
          // Remove Stalker mesh
          this.playerGroup.remove(stalker.mesh);
          this.activeMonsters.stalker = null;
        }
      }
    }
    
    // --- 4. THE WARDEN BOSS BEHAVIOR (ROOM 50 LIBRARY) ---
    if (this.warden && !this.state.isHiding) {
      const warden = this.warden;
      const wData = warden.userData;
      
      // Alert level decay
      this.wardenAlert = Math.max(0, this.wardenAlert - 0.05 * delta);
      
      // Patrol or chase Z target
      const currentZ = warden.position.z;
      const speed = wData.chasing ? wData.speed * 2.0 : wData.speed;
      
      const diffZ = wData.targetZ - currentZ;
      if (Math.abs(diffZ) > 0.5) {
        warden.position.z += Math.sign(diffZ) * speed * 60 * delta;
        // Warden body wiggles when moving
        warden.rotation.y = Math.sin(now * 0.005) * 0.3;
      } else if (wData.chasing) {
        // Lost trace, return to patrol
        wData.chasing = false;
        wData.targetZ = wData.patrolPoints[wData.currentPoint];
      } else {
        // Select next patrol point
        wData.currentPoint = (wData.currentPoint + 1) % wData.patrolPoints.length;
        wData.targetZ = wData.patrolPoints[wData.currentPoint];
      }
      
      // Collision with player check
      const playerDist = warden.position.distanceTo(this.playerGroup.position);
      if (playerDist < 2.5) {
        this.triggerJumpscareDeath("Caught by the blind Warden");
      }
      
      // Speed up heartbeat warning if Warden gets close
      const heartRate = playerDist < 10 ? 120 : (playerDist < 20 ? 95 : 72);
      this.audio.startHeartbeat(heartRate);
    }
  }
  
  flashRedDamage() {
    const flash = document.getElementById('damage-flash');
    flash.style.opacity = '1';
    setTimeout(() => {
      flash.style.opacity = '0';
    }, 200);
  }
  
  // ==========================================
  // 10. ROOM PROGRESSION AND MONSTER TRIGGERS
  // ==========================================
  checkRoomProgression() {
    const playerZ = this.playerGroup.position.z;
    const roomIndex = Math.floor(Math.abs(playerZ) / 30) + 1;
    
    if (roomIndex !== this.state.currentRoom && roomIndex <= 50) {
      // Transition Room!
      const previousRoomNum = this.state.currentRoom;
      this.state.currentRoom = roomIndex;
      
      this.triggerCenterNotification(`ROOM ${roomIndex}`, this.darkRooms.includes(roomIndex) ? "Dark corridors ahead..." : "Uncover the exit.");
      
      // Generate Room N + 1
      if (roomIndex < 50) {
        this.buildRoom(roomIndex + 1);
      }
      
      // Delete Room N - 2 to save WebGL memory
      const oldRoom = this.rooms.find(r => r.userData.roomNumber === previousRoomNum - 1);
      if (oldRoom) {
        this.scene.remove(oldRoom);
        // Remove old chests/wardrobes from raycast list
        this.chests = this.chests.filter(c => c.parent !== oldRoom);
        this.rooms = this.rooms.filter(r => r !== oldRoom);
      }
      
      // Trigger Charger Rush warning sequence immediately
      if (this.monsterSpawns.includes(roomIndex)) {
        this.triggerChargerWarningSequence(roomIndex);
      }
      
      // Trigger Gazer Eyes check
      if (this.gazerSpawns.includes(roomIndex)) {
        const nextRoomGroup = this.rooms.find(r => r.userData.roomNumber === roomIndex);
        if (nextRoomGroup) {
          this.triggerGazerEyes(nextRoomGroup, roomIndex);
        }
      }
      
      // Trigger Dark room Stalker screech spawn chance
      if (this.darkRooms.includes(roomIndex)) {
        setTimeout(() => this.triggerStalkerScreech(), 6000);
      }
    }
  }
  
  // ==========================================
  // 11. HUD STATE AND DEATH / WIN SCREENS
  // ==========================================
  updateHUD() {
    document.getElementById('health-bar-fill').style.width = `${this.state.health}%`;
    document.getElementById('health-val').innerText = Math.round(this.state.health);
    
    document.getElementById('lighter-bar-fill').style.width = `${this.state.lighterFuel * 100}%`;
    document.getElementById('lighter-val').innerText = `${Math.round(this.state.lighterFuel * 100)}%`;
    
    const stanceVal = document.getElementById('stance-val');
    const isCrouching = this.tracker.states.heightState === 'crouching' || this.keysPressed['c'];
    if (isCrouching) {
      stanceVal.innerText = "CROUCHED";
      stanceVal.className = "stance-state crouched";
    } else {
      stanceVal.innerText = "STANDING";
      stanceVal.className = "stance-state standing";
    }
    
    // Update Noise level UI indicator
    const noiseLevel = this.state.noiseLevel || 0;
    const noiseBar = document.getElementById('noise-bar-fill');
    const noiseVal = document.getElementById('noise-val');
    if (noiseBar && noiseVal) {
      noiseBar.style.width = `${noiseLevel * 100}%`;
      if (noiseLevel < 0.12) {
        noiseVal.innerText = "SILENT";
        noiseVal.className = "stat-num text-gray";
      } else if (noiseLevel < 0.3) {
        noiseVal.innerText = "QUIET";
        noiseVal.className = "stat-num text-green";
      } else if (noiseLevel < 0.55) {
        noiseVal.innerText = "HEARD";
        noiseVal.className = "stat-num text-yellow";
      } else {
        noiseVal.innerText = "LOUD!";
        noiseVal.className = "stat-num text-red pulsate-text";
      }
    }
    
    document.getElementById('hud-room').innerText = this.convertToRoman(this.state.currentRoom);
    document.getElementById('hud-gold').innerText = this.state.gold;
    document.getElementById('hud-keys').innerText = this.state.keys;
    
    const keyInd = document.getElementById('key-indicator');
    keyInd.style.opacity = this.state.keys > 0 ? '1' : '0.3';
  }
  
  convertToRoman(num) {
    const map = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let roman = '';
    for (let i in map) {
      while (num >= map[i]) {
        roman += i;
        num -= map[i];
      }
    }
    return roman;
  }
  
  triggerCenterNotification(header, sub) {
    const headEl = document.getElementById('announcement');
    const subEl = document.getElementById('sub-announcement');
    
    headEl.innerText = header;
    subEl.innerText = sub;
    
    headEl.classList.add('visible');
    subEl.classList.add('visible');
    
    // Clear after 3.5 seconds
    if (this.notifTimeout) clearTimeout(this.notifTimeout);
    this.notifTimeout = setTimeout(() => {
      headEl.classList.remove('visible');
      subEl.classList.remove('visible');
    }, 3500);
  }
  
  // Game Over death trigger
  triggerJumpscareDeath(reason) {
    this.state.isGameOver = true;
    this.audio.stopHeartbeat();
    this.audio.stopWind();
    this.audio.stopWarning();
    this.audio.stopScaryMusic();
    this.audio.playJumpscare();
    
    // Create random scary texture onto Jumpscare face overlay
    const container = document.getElementById('jumpscare-container');
    const monster = document.getElementById('jumpscare-monster');
    
    // Clean up active charger trail particles if active
    if (this.activeMonsters.charger && this.activeMonsters.charger.trail) {
      this.activeMonsters.charger.trail.forEach(p => this.scene.remove(p.mesh));
    }
    
    // Generate a red glitchy face canvas texture
    const canvasJumpscare = document.createElement('canvas');
    canvasJumpscare.width = 512;
    canvasJumpscare.height = 512;
    const ctx = canvasJumpscare.getContext('2d');
    ctx.fillStyle = '#030303';
    ctx.fillRect(0,0,512,512);
    
    // Draw hollow triangular nose cavity
    ctx.fillStyle = '#0a0000';
    ctx.beginPath();
    ctx.moveTo(256, 250);
    ctx.lineTo(236, 290);
    ctx.lineTo(276, 290);
    ctx.closePath();
    ctx.fill();

    // Spooky blood veins radiating out of eyes
    ctx.strokeStyle = '#600';
    ctx.lineWidth = 1.5;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
      ctx.beginPath();
      ctx.moveTo(170 + Math.cos(angle) * 70, 200 + Math.sin(angle) * 70);
      ctx.lineTo(170 + Math.cos(angle) * (80 + Math.random() * 45), 200 + Math.sin(angle) * (80 + Math.random() * 45));
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(342 + Math.cos(angle) * 70, 200 + Math.sin(angle) * 70);
      ctx.lineTo(342 + Math.cos(angle) * (80 + Math.random() * 45), 200 + Math.sin(angle) * (80 + Math.random() * 45));
      ctx.stroke();
    }

    // Black tear stains running down the cheeks
    ctx.fillStyle = '#000';
    ctx.fillRect(160, 260, 20, 100);
    ctx.fillRect(332, 260, 20, 100);

    // Draw two giant red hollow eye sockets and sharp bloody teeth
    ctx.fillStyle = '#900';
    ctx.beginPath();
    ctx.arc(170, 200, 70, 0, Math.PI*2);
    ctx.arc(342, 200, 70, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(170, 200, 15, 0, Math.PI*2);
    ctx.arc(342, 200, 15, 0, Math.PI*2);
    ctx.fill();
    
    // Gaping bloody mouth background
    ctx.fillStyle = '#400';
    ctx.beginPath();
    ctx.ellipse(256, 380, 170, 50, 0, 0, Math.PI*2);
    ctx.fill();
    
    // Upper Teeth
    ctx.fillStyle = '#eee';
    for (let i = 0; i < 14; i++) {
      const tx = 110 + i * 21;
      ctx.beginPath();
      ctx.moveTo(tx, 350);
      ctx.lineTo(tx + 10, 390);
      ctx.lineTo(tx + 20, 350);
      ctx.fill();
    }
    // Lower Teeth
    for (let i = 0; i < 14; i++) {
      const tx = 110 + i * 21;
      ctx.beginPath();
      ctx.moveTo(tx, 410);
      ctx.lineTo(tx + 10, 370);
      ctx.lineTo(tx + 20, 410);
      ctx.fill();
    }
    
    monster.style.backgroundImage = `url(${canvasJumpscare.toDataURL()})`;
    container.style.display = 'flex';
    
    // Open Death HUD after jumpscare
    setTimeout(() => {
      container.style.display = 'none';
      document.getElementById('hud').style.display = 'none';
      document.getElementById('gameover-overlay').style.display = 'flex';
      document.getElementById('game-over-text').innerText = `${reason} in Room ${this.state.currentRoom}.`;
      document.getElementById('go-rooms').innerText = this.state.currentRoom;
      document.getElementById('go-gold').innerText = this.state.gold;
      
      document.exitPointerLock();
    }, 1500);
  }
  
  // Winner escape trigger
  triggerGameVictory() {
    this.state.isWinner = true;
    this.audio.stopHeartbeat();
    this.audio.stopWind();
    this.audio.stopWarning();
    
    document.getElementById('hud').style.display = 'none';
    document.getElementById('win-overlay').style.display = 'flex';
    document.getElementById('win-gold').innerText = this.state.gold;
    
    // Time format
    const duration = Math.floor(this.clock.getElapsedTime());
    const min = Math.floor(duration / 60);
    const sec = String(duration % 60).padStart(2, '0');
    document.getElementById('win-time').innerText = `${min}:${sec}`;
    
    document.exitPointerLock();
  }
  
  resetGame() {
    // Reset data
    this.state.health = 100;
    this.state.gold = 0;
    this.state.keys = 0;
    this.state.lighterFuel = 1.0;
    this.state.lighterActive = true;
    this.state.currentRoom = 1;
    this.state.isHiding = false;
    this.state.isGameOver = false;
    this.state.isWinner = false;
    this.lightsFlickerTimer = 0; // Reset warning flickering state
    
    // Clean WebGL scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    
    // Reset collections
    this.rooms = [];
    this.chests = [];
    this.activeMonsters = { charger: null, gazer: null, stalker: null };
    
    // Re-initialize Engine
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.set(0, 1.8, 0);
    this.scene.add(this.playerGroup);
    this.playerGroup.add(this.camera);
    
    this.playerLight = new THREE.PointLight(0xffa54f, 1.5, 12);
    this.playerLight.position.set(0.3, -0.4, -0.5);
    this.playerLight.castShadow = true;
    this.playerLight.shadow.mapSize.width = 512;
    this.playerLight.shadow.mapSize.height = 512;
    this.playerGroup.add(this.playerLight);
    
    const ambientLight = new THREE.AmbientLight(0x08080c, 0.4);
    this.scene.add(ambientLight);
    
    this.buildRoom(1);
    this.buildRoom(2);
    this.currentRoomNode = this.rooms[0];
    
    this.clock.start();
    this.audio.stopWarning();
    this.audio.stopScaryMusic();
    this.audio.playWind();
    this.audio.startHeartbeat(72);
    
    this.initLighterMesh();
    
    document.getElementById('hud').style.display = 'flex';
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Window init
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.Game = new GameEngine();
  });
} else {
  window.Game = new GameEngine();
}
