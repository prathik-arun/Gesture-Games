// Coordinate and combine inputs: Gemini Live proxy + Optical Flow + MediaPipe Hands
class MovementController {
  constructor() {
    this.gemini = new GeminiClient();
    this.optical = new OpticalFlow();
    
    this.videoElement = null;
    this.stream = null;
    this.hands = null;
    
    // Hand tracking state
    this.isHandsLoaded = false;
    this.pinchDistance = 1.0;
    this.isPinching = false;
    this.isOpenHand = false;
    
    // Face mesh tracking state
    this.isFaceMeshLoaded = false;
    this.faceLandmarksList = [];
    this.isMouthOpen = false;
    this.lipDistance = 0;
    
    // Voice tracking state
    this.voiceWalking = false;
    this.voiceReload = false;
    this.voiceTranscript = '';
    this.lastVoiceCommand = 'none';
    this.voiceDirection = 'none';
    this.speechActive = false;
    this.initSpeechRecognition();
    
    // Combined movement state (what the game reads)
    this.state = {
      walking: false,
      lean: 'center', // 'left' | 'right' | 'center'
      jump: false,
      shoot: false,
      reload: false,
      confidence: 'high'
    };

    // Callback when movement state updates
    this.onUpdateCallback = null;
    
    // Debug state
    this.geminiState = { walking: false, lean: 'center', jump: false, confidence: 'high' };
    
    // Flag to track whether Gemini is active
    this.isGeminiActive = false;
  }

  onUpdate(callback) {
    this.onUpdateCallback = callback;
  }

  async initCamera(videoElement) {
    this.videoElement = videoElement;
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: { ideal: 30 } },
        audio: false
      });
      this.videoElement.srcObject = this.stream;
      this.videoElement.setAttribute('playsinline', true);
      
      // Wait for metadata to load to ensure valid dimensions
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play().then(resolve).catch(resolve);
        };
        // Fallback safety timeout
        setTimeout(() => {
          this.videoElement.play().then(resolve).catch(resolve);
        }, 500);
      });
      
      console.log('[Movement] Camera initialized successfully.');
      return true;
    } catch (e) {
      console.error('[Movement] Error accessing camera:', e);
      return false;
    }
  }

  async loadMediaPipe() {
    if (this.isHandsLoaded) return true;
    
    console.log('[Movement] Loading MediaPipe Hands library...');
    return new Promise((resolve, reject) => {
      // Create script tag for MediaPipe Hands CDN
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';
      script.async = true;
      
      script.onload = () => {
        try {
          this.initializeHands();
          this.isHandsLoaded = true;
          console.log('[Movement] MediaPipe Hands loaded and initialized.');
          resolve(true);
        } catch (err) {
          console.error('[Movement] Error initializing MediaPipe:', err);
          reject(err);
        }
      };
      
      script.onerror = (err) => {
        console.error('[Movement] Failed to load MediaPipe script:', err);
        reject(err);
      };
      
      document.head.appendChild(script);
    });
  }

  async loadMediaPipeFaceMesh() {
    if (this.isFaceMeshLoaded) return true;
    
    console.log('[Movement] Loading MediaPipe Face Mesh library...');
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
      script.async = true;
      
      script.onload = () => {
        try {
          this.initializeFaceMesh();
          this.isFaceMeshLoaded = true;
          console.log('[Movement] MediaPipe Face Mesh loaded and initialized.');
          resolve(true);
        } catch (err) {
          console.error('[Movement] Error initializing MediaPipe Face Mesh:', err);
          reject(err);
        }
      };
      
      script.onerror = (err) => {
        console.error('[Movement] Failed to load MediaPipe Face Mesh script:', err);
        reject(err);
      };
      
      document.head.appendChild(script);
    });
  }

  initializeFaceMesh() {
    this.faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.faceMesh.onResults((results) => {
      this.processFaceResults(results);
    });
    
    this.faceLandmarksList = [];
    this.isMouthOpen = false;
    this.lipDistance = 0;
  }

  processFaceResults(results) {
    this.faceLandmarksList = [];
    this.isMouthOpen = false;
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      this.faceLandmarksList = results.multiFaceLandmarks[0];
      
      const lipTop = this.faceLandmarksList[13];
      const lipBottom = this.faceLandmarksList[14];
      
      if (lipTop && lipBottom) {
        const dy = Math.abs(lipTop.y - lipBottom.y);
        
        const forehead = this.faceLandmarksList[10];
        const chin = this.faceLandmarksList[152];
        let faceHeight = 0.2;
        if (forehead && chin) {
          faceHeight = Math.abs(forehead.y - chin.y) || 0.2;
        }
        
        const normDist = dy / faceHeight;
        this.lipDistance = normDist;
        
        // Threshold for mouth open state (e.g. 0.08 normalized lip-to-face height distance)
        if (normDist > 0.08) {
          this.isMouthOpen = true;
        }
      }
    }
  }

  initializeHands() {
    // MediaPipe Hands is loaded as a global class 'Hands'
    this.hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2, // Enable dual-hand tracking!
      modelComplexity: 1,
      minDetectionConfidence: 0.38, // Lowered from 0.5 to increase detection responsiveness
      minTrackingConfidence: 0.38   // Lowered from 0.5 to increase tracking stickiness
    });

    this.hands.onResults((results) => {
      this.processHandResults(results);
    });
    
    // Centroid history for hand-speed walking calculations
    this.centroidHistory = [];
    this.handWalking = false;
    this.handSpeed = 0;
    this.handLandmarksList = [];
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        console.log('[Movement] Speech recognition active.');
      };

      this.recognition.onresult = (event) => {
        const lastResult = event.results[event.results.length - 1];
        if (!lastResult) return;

        const text = lastResult[0].transcript.toLowerCase().trim();
        this.voiceTranscript = text;
        console.log('[Movement] Speech heard text:', text);

        // Regex helpers with common homophones and variants
        const walkRegex = /\b(walk|go|forward|move|run|start|step|work|war|what|on|one)\b/;
        const stopRegex = /\b(stop|halt|hold|freeze|stay|stand|still|shop|shot|dont|no)\b/;
        const reloadRegex = /\b(reload|load|ammo|bullet)\b/;
        const upRegex = /\b(up|top|above|north|hop)\b/;
        const downRegex = /\b(down|bottom|below|south|crouch|duck)\b/;
        const leftRegex = /\b(left|west|port)\b/;
        const rightRegex = /\b(right|write|east|starboard)\b/;

        // Stop commands override walk commands in the same phrase to ensure quick safety halts
        if (stopRegex.test(text)) {
          this.voiceWalking = false;
          this.lastVoiceCommand = 'stop';
        } else if (walkRegex.test(text)) {
          this.voiceWalking = true;
          this.lastVoiceCommand = 'walk';
        }

        // Check for direction commands
        if (upRegex.test(text)) {
          this.voiceDirection = 'up';
          this.lastVoiceCommand = 'up';
        } else if (downRegex.test(text)) {
          this.voiceDirection = 'down';
          this.lastVoiceCommand = 'down';
        } else if (leftRegex.test(text)) {
          this.voiceDirection = 'left';
          this.lastVoiceCommand = 'left';
        } else if (rightRegex.test(text)) {
          this.voiceDirection = 'right';
          this.lastVoiceCommand = 'right';
        }

        // Check for reload
        if (reloadRegex.test(text)) {
          this.voiceReload = true;
          this.lastVoiceCommand = 'reload';
          setTimeout(() => {
            this.voiceReload = false;
          }, 1000);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('[Movement] Speech recognition error:', event.error);
      };

      this.recognition.onend = () => {
        if (this.speechActive) {
          try {
            this.recognition.start();
          } catch (e) {
            // Already started or busy
          }
        }
      };
    } else {
      console.warn('[Movement] SpeechRecognition API not supported in this browser.');
    }
  }

  startSpeech() {
    if (this.recognition && !this.speechActive) {
      this.speechActive = true;
      try {
        this.recognition.start();
        console.log('[Movement] Speech recognition started.');
      } catch (err) {
        console.error('[Movement] Error starting speech:', err);
      }
    }
  }

  stopSpeech() {
    if (this.recognition && this.speechActive) {
      this.speechActive = false;
      try {
        this.recognition.stop();
      } catch (e) {}
      this.voiceWalking = false;
      this.voiceReload = false;
      console.log('[Movement] Speech recognition stopped.');
    }
  }

  processHandResults(results) {
    let detectedPinch = false;
    let detectedOpenHand = false;
    this.pinchDistance = 1.0;
    this.handLandmarks = null;
    this.handLandmarksList = [];
    this.handBox = null;

    let leftHandVisible = false;
    let leftHandRaised = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      this.handLandmarksList = results.multiHandLandmarks;
      this.handLandmarks = results.multiHandLandmarks[0];

      // Calculate bounding box around the main hand to mask optical flow torso-shifts
      const mainHand = results.multiHandLandmarks[0];
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (let i = 0; i < mainHand.length; i++) {
        const pt = mainHand[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      const padding = 0.08;
      this.handBox = {
        minX: Math.max(0, (minX - padding) * 160),
        maxX: Math.min(160, (maxX + padding) * 160),
        minY: Math.max(0, (minY - padding) * 120),
        maxY: Math.min(120, (maxY + padding) * 120)
      };

      // Loop through visible hands (up to 2) and process gestures
      for (let h = 0; h < results.multiHandLandmarks.length; h++) {
        const landmarks = results.multiHandLandmarks[h];

        // Pinch Check (Thumb tip 4 & Index tip 8)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dist2d = Math.sqrt(dx * dx + dy * dy);

        // Keep track of the closest raw 2D distance for debugging/visual overlays
        if (dist2d < this.pinchDistance) {
          this.pinchDistance = dist2d;
        }

        // Calculate hand size (wrist to middle finger base) to normalize distance across depths
        const wrist = landmarks[0];
        const middleBase = landmarks[9];
        const handSize = Math.sqrt((wrist.x - middleBase.x) ** 2 + (wrist.y - middleBase.y) ** 2);
        const normalizedDist = dist2d / (handSize || 0.08);

        if (normalizedDist < 0.45) {
          detectedPinch = true;
        }

        // Open Hand Check
        let extendedFingers = 0;
        if (landmarks[8].y < landmarks[6].y) extendedFingers++;
        if (landmarks[12].y < landmarks[10].y) extendedFingers++;
        if (landmarks[16].y < landmarks[14].y) extendedFingers++;
        if (landmarks[20].y < landmarks[18].y) extendedFingers++;

        if (extendedFingers >= 3 && normalizedDist >= 0.85) {
          detectedOpenHand = true;
        }
      }
    }

    this.isPinching = detectedPinch;
    this.isOpenHand = detectedOpenHand;
    this.handWalking = false; // Disabled in favor of voice walking
  }

  startConnection(proxyUrl) {
    this.gemini.connect(proxyUrl);
    
    this.gemini.onStatus((status) => {
      this.isGeminiActive = (status === 'connected');
      console.log('[Movement] Gemini connection status:', status);
    });

    this.gemini.onMovement((data) => {
      // Store latest Gemini instruction
      this.geminiState = data;
    });

    this.gemini.onError((err) => {
      console.error('[Movement] Gemini Client error:', err);
    });

    // Start streaming frames
    this.gemini.startStreaming(this.videoElement);
  }

  stopConnection() {
    this.gemini.disconnect();
    this.isGeminiActive = false;
    this.geminiState = { walking: false, lean: 'center', jump: false, confidence: 'high' };
  }

  startProcessingLoop() {
    const loop = async () => {
      if (!this.videoElement) return;

      // Ensure video is playing and has valid dimensions to prevent MediaPipe solution WASM crash
      if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
        requestAnimationFrame(loop);
        return;
      }

      // 1. Process Optical Flow (runs at animation speed, local fallback)
      // Pass the hand bounding box (if active) to mask out hand motion
      this.optical.processFrame(this.videoElement, this.handBox);

      // 2. Process MediaPipe Hands (sends image to MediaPipe webworker/SDK)
      if (this.isHandsLoaded && this.hands) {
        try {
          await this.hands.send({ image: this.videoElement });
        } catch (e) {
          // Ignore hand processing dropouts
        }
      }

      // Process MediaPipe Face Mesh (sends image to MediaPipe webworker/SDK)
      if (this.isFaceMeshLoaded && this.faceMesh) {
        try {
          await this.faceMesh.send({ image: this.videoElement });
        } catch (e) {
          // Ignore face processing dropouts
        }
      }

      // 3. Combine inputs to form current state
      this.combineInputs();

      // Trigger callback if registered
      if (this.onUpdateCallback) {
        this.onUpdateCallback(this.state);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  combineInputs() {
    // A. WALKING: Triggered if EITHER Gemini AI says walking OR Voice command says walking
    const aiWalking = this.isGeminiActive && this.geminiState.walking;
    const voiceWalking = this.voiceWalking;
    this.state.walking = aiWalking || voiceWalking;

    // B. LEANING: Local optical flow overrides Gemini when actively shifting left/right to ensure responsiveness,
    // otherwise if the user is static, rely on Gemini's state representation.
    const flowLean = this.optical.lean;
    const aiLean = this.isGeminiActive ? this.geminiState.lean : 'center';

    if (flowLean !== 'center') {
      this.state.lean = flowLean; // immediate action
    } else if (this.isGeminiActive) {
      this.state.lean = aiLean; // sustained pose
    } else {
      this.state.lean = 'center';
    }

    // C. JUMPING / CROUCHING: Rely on Gemini AI tracking
    this.state.jump = this.isGeminiActive && this.geminiState.jump;

    // D. GESTURES: From local MediaPipe Hands or Voice reload
    this.state.shoot = this.isPinching;
    this.state.reload = this.isOpenHand || this.voiceReload;
    
    // E. CONFIDENCE
    this.state.confidence = this.isGeminiActive ? this.geminiState.confidence : 'medium';
  }

  getDebugInfo() {
    return {
      geminiActive: this.isGeminiActive,
      geminiStatus: this.gemini.status,
      geminiWalking: this.geminiState.walking,
      geminiLean: this.geminiState.lean,
      geminiJump: this.geminiState.jump,
      
      opticalWalking: this.optical.walking,
      opticalLean: this.optical.lean,
      opticalWalkMotion: this.optical.debug.walkMotion,
      opticalLeftMotion: this.optical.debug.leftMotion,
      opticalRightMotion: this.optical.debug.rightMotion,
      opticalLeanIndex: this.optical.debug.leanIndex,
      opticalWalkThreshold: this.optical.debug.walkThreshold,
      opticalCalibrating: this.optical.debug.isCalibrating,
      
      mediaPipeLoaded: this.isHandsLoaded,
      pinchDistance: this.pinchDistance,
      isPinching: this.isPinching,
      isOpenHand: this.isOpenHand,
      
      voiceWalking: this.voiceWalking,
      lastVoiceCommand: this.lastVoiceCommand,
      voiceTranscript: this.voiceTranscript,
      speechActive: this.speechActive,
      
      finalState: { ...this.state }
    };
  }
}

// Export class if running in a module context, otherwise attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MovementController };
} else {
  window.MovementController = new MovementController();
}
