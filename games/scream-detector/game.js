// Scream Detector - Game Logic

// Game State
let stream = null;
let audioContext = null;
let analyser = null;
let micSource = null;
let animationFrameId = null;

let isMediaGranted = false;
let isScreamingSession = false;
let screamStartTime = 0;
const screamDuration = 3000; // 3 seconds scream time
let peakDecibel = 0;
let snapshots = [];
let lastSnapshotTime = 0;
const snapshotInterval = 300; // capture frame every 300ms

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const setupWebcam = document.getElementById('setup-webcam');
const cameraStatusOverlay = document.getElementById('camera-status-overlay');
const micStatusBadge = document.getElementById('mic-status-badge');
const micLevelBar = document.getElementById('mic-level-bar');
const indicatorCamera = document.getElementById('indicator-camera');
const indicatorMic = document.getElementById('indicator-mic');
const btnRequestAccess = document.getElementById('btn-request-access');
const btnStartGame = document.getElementById('btn-start-game');

const screamScreen = document.getElementById('scream-screen');
const gameWebcam = document.getElementById('game-webcam');
const screamMicBtn = document.getElementById('scream-mic-btn');
const instructionsBox = document.getElementById('instructions-box');
const liveDecibels = document.getElementById('live-decibels');
const peakDecibels = document.getElementById('peak-decibels');
const leftVolumeBar = document.getElementById('left-volume-bar');
const rightVolumeBar = document.getElementById('right-volume-bar');
const screamTimerContainer = document.getElementById('scream-timer-container');
const screamTimerFill = document.getElementById('scream-timer-fill');
const screamTimerText = document.getElementById('scream-timer-text');

const resultsScreen = document.getElementById('results-screen');
const finalScore = document.getElementById('final-score');
const ratingBadge = document.getElementById('rating-badge');
const ratingDesc = document.getElementById('rating-desc');
const photoGallery = document.getElementById('photo-gallery');
const btnRetry = document.getElementById('btn-retry');

// Off-screen canvas for capturing webcam snapshots
const captureCanvas = document.createElement('canvas');
const captureContext = captureCanvas.getContext('2d');

// Initialize event listeners
btnRequestAccess.addEventListener('click', requestMediaPermissions);
btnStartGame.addEventListener('click', enterScreamArena);
screamMicBtn.addEventListener('click', startScreamSession);
btnRetry.addEventListener('click', resetToScreamArena);

// Clean up audio context on window unload
window.addEventListener('beforeunload', () => {
  stopAudioProcessing();
  stopMediaStream();
});

/**
 * Requests Webcam and Microphone access
 */
async function requestMediaPermissions() {
  btnRequestAccess.disabled = true;
  btnRequestAccess.textContent = 'Requesting access...';

  try {
    // Request both camera and audio stream
    stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 640 }, 
        height: { ideal: 480 },
        facingMode: "user" 
      },
      audio: true
    });

    isMediaGranted = true;
    handleMediaSuccess();
  } catch (err) {
    console.error('Error acquiring media stream:', err);
    handleMediaError(err);
  } finally {
    btnRequestAccess.textContent = 'Media Access Configured';
  }
}

/**
 * Handles successful camera and microphone access
 */
function handleMediaSuccess() {
  // Update Indicators & Badges
  indicatorCamera.className = 'step-status-indicator success';
  indicatorCamera.textContent = '✓';
  indicatorMic.className = 'step-status-indicator success';
  indicatorMic.textContent = '✓';

  micStatusBadge.className = 'status-value val-true';
  micStatusBadge.textContent = 'CONNECTED';

  cameraStatusOverlay.style.opacity = 0;
  setTimeout(() => {
    cameraStatusOverlay.style.display = 'none';
  }, 300);

  // Bind stream to Setup Webcam element
  setupWebcam.srcObject = stream;
  setupWebcam.setAttribute('playsinline', true);
  setupWebcam.play().catch(e => console.log("Webcam play failed on setup:", e));

  // Initialize Web Audio Analyzer
  initAudioAnalyzer(stream);

  // Enable Start Game Button
  btnStartGame.disabled = false;
  btnRequestAccess.style.display = 'none';

  // Run continuous update loops
  startProcessingLoop();
}

/**
 * Handles media stream errors
 */
function handleMediaError(err) {
  indicatorCamera.className = 'step-status-indicator error';
  indicatorCamera.textContent = '✗';
  indicatorMic.className = 'step-status-indicator error';
  indicatorMic.textContent = '✗';

  micStatusBadge.className = 'status-value val-false';
  micStatusBadge.textContent = 'DENIED / FAILED';

  alert('Could not access microphone or camera. Please check your browser permission settings and try again.');
  btnRequestAccess.disabled = false;
  btnRequestAccess.textContent = 'Retry Permissions Request';
}

/**
 * Sets up Audio Analysis nodes
 */
function initAudioAnalyzer(mediaStream) {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    micSource = audioContext.createMediaStreamSource(mediaStream);
    micSource.connect(analyser);
    console.log('Audio analysis initialized.');
  } catch (e) {
    console.error('Failed to initialize AudioContext:', e);
  }
}

/**
 * Stops Web Audio nodes
 */
function stopAudioProcessing() {
  if (micSource) {
    micSource.disconnect();
    micSource = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  analyser = null;
}

/**
 * Stops webcam video tracks
 */
function stopMediaStream() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

/**
 * Starts execution loops
 */
function startProcessingLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  const bufferLength = analyser ? analyser.frequencyBinCount : 0;
  const dataArray = new Uint8Array(bufferLength);

  function loop() {
    animationFrameId = requestAnimationFrame(loop);

    let averageVolume = 0;
    let currentDb = 30;

    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      averageVolume = sum / bufferLength;
      
      // Convert mapping to dB (linear scaled between 30dB and 120dB for visual effect)
      currentDb = Math.round(30 + (averageVolume / 255) * 90);
      if (currentDb > 120) currentDb = 120;
    }

    // View-specific logic
    if (setupScreen.style.display !== 'none') {
      // 1. Setup Screen Audio Indicator
      const fillPercentage = (averageVolume / 255) * 100;
      micLevelBar.style.width = `${fillPercentage}%`;
    } 
    else if (screamScreen.style.display !== 'none') {
      // 2. Scream Screen level meters
      const fillHeight = ((currentDb - 30) / 90) * 100;
      leftVolumeBar.style.height = `${fillHeight}%`;
      rightVolumeBar.style.height = `${fillHeight}%`;
      
      // Update displays
      liveDecibels.innerHTML = `${currentDb} <span class="unit">dB</span>`;

      // Scream session recording logic
      if (isScreamingSession) {
        // Track peak levels
        if (currentDb > peakDecibel) {
          peakDecibel = currentDb;
          peakDecibels.innerHTML = `${peakDecibel} <span class="unit">dB</span>`;
        }

        // Periodically capture photos from webcam
        const now = Date.now();
        if (now - lastSnapshotTime > snapshotInterval) {
          takeWebcamSnapshot(currentDb);
          lastSnapshotTime = now;
        }

        // Update timer
        const elapsed = now - screamStartTime;
        const remaining = Math.max(0, (screamDuration - elapsed) / 1000);
        screamTimerFill.style.width = `${(remaining / (screamDuration / 1000)) * 100}%`;
        screamTimerText.textContent = `SCREAM FOR: ${remaining.toFixed(1)}s`;

        // Check for session completion
        if (elapsed >= screamDuration) {
          endScreamSession();
        }
      }
    }
  }

  loop();
}

/**
 * Capture frame from active video element and save to memory
 */
function takeWebcamSnapshot(dbLevel) {
  const activeVideo = gameWebcam;
  if (!activeVideo || activeVideo.videoWidth === 0) return;

  // Set canvas dimensions to match active stream frame
  if (captureCanvas.width !== activeVideo.videoWidth) {
    captureCanvas.width = activeVideo.videoWidth;
    captureCanvas.height = activeVideo.videoHeight;
  }

  // Clear previous transformation matrix
  captureContext.setTransform(1, 0, 0, 1, 0, 0);

  // Mirror the picture horizontally to match mirror preview
  captureContext.translate(captureCanvas.width, 0);
  captureContext.scale(-1, 1);

  // Draw current video frame
  captureContext.drawImage(activeVideo, 0, 0, captureCanvas.width, captureCanvas.height);

  // Save base64 image data string
  try {
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.8);
    snapshots.push({
      db: dbLevel,
      dataUrl: dataUrl
    });
  } catch (e) {
    console.error("Failed to capture snapshot frame:", e);
  }
}

/**
 * Transitions from Setup to Scream Screen
 */
function enterScreamArena() {
  // Resume AudioContext if suspended (browser security restrictions)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  setupScreen.style.display = 'none';
  screamScreen.style.display = 'flex';

  // Bind camera stream to the screen video inset
  gameWebcam.srcObject = stream;
  gameWebcam.setAttribute('playsinline', true);
  gameWebcam.play().catch(e => console.log("Webcam play failed on arena:", e));
}

/**
 * Starts a 3-second recording scream session
 */
function startScreamSession() {
  if (isScreamingSession) return; // avoid double triggers

  isScreamingSession = true;
  screamStartTime = Date.now();
  lastSnapshotTime = 0;
  peakDecibel = 0;
  snapshots = [];

  // Reset UI elements
  peakDecibels.innerHTML = `-- <span class="unit">dB</span>`;
  screamMicBtn.classList.add('active');
  screamTimerContainer.style.visibility = 'visible';
  screamTimerFill.style.width = '100%';
  screamTimerText.textContent = `SCREAM FOR: 3.0s`;
  instructionsBox.textContent = '📢 SCREAM NOW!!! 📢';
  instructionsBox.style.color = 'var(--neon-pink)';
  instructionsBox.style.textShadow = '0 0 15px rgba(255, 0, 85, 0.4)';
}

/**
 * Finalizes recording session and displays results
 */
function endScreamSession() {
  isScreamingSession = false;
  screamMicBtn.classList.remove('active');
  screamTimerContainer.style.visibility = 'hidden';
  instructionsBox.textContent = 'PROCESSING SCREAM...';
  instructionsBox.style.color = 'var(--neon-cyan)';
  instructionsBox.style.textShadow = '0 0 15px rgba(0, 229, 255, 0.4)';

  // Transition to results page after a brief freeze delay (800ms)
  setTimeout(() => {
    showResultsPage();
  }, 800);
}

/**
 * Renders the results and gallery grid
 */
function showResultsPage() {
  screamScreen.style.display = 'none';
  resultsScreen.style.display = 'flex';

  // Save score locally
  saveHighscore(peakDecibel);

  // Set giant score text
  finalScore.textContent = peakDecibel;

  // Classify score details
  let ratingText = '';
  let ratingDescription = '';

  if (peakDecibel < 60) {
    ratingText = 'MUTED WHISPER 🤫';
    ratingDescription = "Did you make any sound at all? Don't be shy, take a deep breath and let it rip!";
  } else if (peakDecibel < 80) {
    ratingText = 'PLAYFUL SQUEAK 🐱';
    ratingDescription = "That was a decent attempt, but you sound like a startled kitten. Open wide and scream louder!";
  } else if (peakDecibel < 95) {
    ratingText = 'ROCK STAR 🎤';
    ratingDescription = "Awesome! You've got the lungs of a lead heavy metal vocalist. Keep rocking!";
  } else if (peakDecibel < 105) {
    ratingText = 'SONIC BOOM 🚀';
    ratingDescription = "WOW! That was powerful enough to rattle windows. You absolutely blew the meters away!";
  } else {
    ratingText = 'EXTINCTION EVENT 🦖';
    ratingDescription = "OH MY GOD! A legendary primal roar that would wake up sleeping dinosaurs. Absolutely epic!";
  }

  ratingBadge.textContent = ratingText;
  ratingDesc.textContent = ratingDescription;

  // Clear previous gallery items
  photoGallery.innerHTML = '';

  // Sort pictures by decibel levels descending
  snapshots.sort((a, b) => b.db - a.db);

  // Keep top 3 images
  const topPics = snapshots.slice(0, 3);

  if (topPics.length > 0) {
    topPics.forEach((snap, idx) => {
      const card = document.createElement('div');
      card.className = 'polaroid-card';
      
      // Inject image and caption
      card.innerHTML = `
        <img src="${snap.dataUrl}" alt="Scream Reaction ${idx+1}">
        <div class="polaroid-caption">${snap.db} dB</div>
      `;
      
      photoGallery.appendChild(card);
    });
  } else {
    // Fallback if no images were snapped (e.g. webcam error)
    photoGallery.innerHTML = `
      <div class="photo-placeholder-card">
        <span class="placeholder-icon">📸</span>
        <span>No snapshots were captured. Verify camera feed is active.</span>
      </div>
    `;
  }
}

/**
 * Resets state back to the scream screen
 */
function resetToScreamArena() {
  resultsScreen.style.display = 'none';
  screamScreen.style.display = 'flex';

  // Reset center texts
  instructionsBox.textContent = 'CLICK MICROPHONE TO SCREAM';
  instructionsBox.style.color = 'var(--text-muted)';
  instructionsBox.style.textShadow = '0 0 10px rgba(255, 255, 255, 0.1)';

  liveDecibels.innerHTML = `30 <span class="unit">dB</span>`;
  peakDecibels.innerHTML = `-- <span class="unit">dB</span>`;
  leftVolumeBar.style.height = '0%';
  rightVolumeBar.style.height = '0%';
  
  peakDecibel = 0;
  snapshots = [];
}

/**
 * Saves game score to localStorage
 */
function saveHighscore(score) {
  try {
    const scoresKey = 'scream_detector_scores';
    let highscores = JSON.parse(localStorage.getItem(scoresKey)) || [];
    const displayName = localStorage.getItem('currentUserDisplayName') || 'Guest';

    highscores.push({
      name: displayName,
      score: score,
      date: new Date().toISOString()
    });

    // Sort descending and keep top 5
    highscores.sort((a, b) => b.score - a.score);
    highscores = highscores.slice(0, 5);

    localStorage.setItem(scoresKey, JSON.stringify(highscores));
  } catch (e) {
    console.error("Failed to write highscore to localstorage:", e);
  }
}
