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
let generatedStoryBlob = null;
let generatedStoryDataUrl = null;


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
const btnShareInstagram = document.getElementById('btn-share-instagram');
const shareModal = document.getElementById('share-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnDownloadStory = document.getElementById('btn-download-story');
const btnNativeShare = document.getElementById('btn-native-share');
const storyPreviewImg = document.getElementById('story-preview-img');
const storyLoadingSpinner = document.getElementById('story-loading-spinner');


// Off-screen canvas for capturing webcam snapshots
const captureCanvas = document.createElement('canvas');
const captureContext = captureCanvas.getContext('2d');

// Initialize event listeners
btnRequestAccess.addEventListener('click', requestMediaPermissions);
btnStartGame.addEventListener('click', enterScreamArena);
screamMicBtn.addEventListener('click', startScreamSession);
btnRetry.addEventListener('click', resetToScreamArena);
btnShareInstagram.addEventListener('click', openShareModal);
btnCloseModal.addEventListener('click', closeShareModal);
btnDownloadStory.addEventListener('click', downloadStoryImage);
btnNativeShare.addEventListener('click', triggerNativeShare);
// Close modal on background click
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) {
    closeShareModal();
  }
});


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

/**
 * Opens the sharing modal and triggers rendering of the Instagram Story card
 */
async function openShareModal() {
  shareModal.style.display = 'flex';

  // Reset UI elements to loading state
  storyLoadingSpinner.style.display = 'flex';
  storyPreviewImg.style.display = 'none';
  btnDownloadStory.disabled = true;
  btnNativeShare.disabled = true;
  btnNativeShare.style.display = 'none';

  try {
    generatedStoryDataUrl = await generateStoryImage();
    storyPreviewImg.src = generatedStoryDataUrl;

    // Convert data URL to Blob for native file sharing API
    const res = await fetch(generatedStoryDataUrl);
    generatedStoryBlob = await res.blob();

    // Show preview and enable actions
    storyLoadingSpinner.style.display = 'none';
    storyPreviewImg.style.display = 'block';
    btnDownloadStory.disabled = false;

    // Detect file sharing capabilities
    if (navigator.canShare && navigator.share) {
      const file = new File([generatedStoryBlob], 'scream_story.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        btnNativeShare.style.display = 'block';
        btnNativeShare.disabled = false;
      }
    }
  } catch (err) {
    console.error('Error during story preview generation:', err);
    alert('Something went wrong generating your story image. You can still download it normally if it appears.');
    storyLoadingSpinner.style.display = 'none';
    storyPreviewImg.style.display = 'block';
    btnDownloadStory.disabled = false;
  }
}

/**
 * Closes the sharing modal and clears memory
 */
function closeShareModal() {
  shareModal.style.display = 'none';
  storyPreviewImg.src = '';
  generatedStoryBlob = null;
  generatedStoryDataUrl = null;
}

/**
 * Downloads the generated PNG image to user's device
 */
function downloadStoryImage() {
  if (!generatedStoryDataUrl) return;

  const link = document.createElement('a');
  link.href = generatedStoryDataUrl;
  link.download = `gesturezone_scream_${peakDecibel}dB.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Triggers native system share dialog on supported browsers (mobile devices)
 */
async function triggerNativeShare() {
  if (!generatedStoryBlob) return;

  try {
    const file = new File([generatedStoryBlob], `scream_story_${peakDecibel}db.png`, { type: 'image/png' });
    await navigator.share({
      files: [file],
      title: 'Scream Detector on Gesture Zone',
      text: `I reached a peak scream level of ${peakDecibel} dB on Gesture Zone! Can you beat my score? Play at gesturezone.web.app`,
    });
  } catch (err) {
    console.log('User cancelled or browser failed to share natively:', err);
  }
}

/**
 * Helper: loads an image URL/data URL into an Image element asynchronously
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Helper: draws a rounded rectangle path on context
 */
function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Renders the story image onto an offscreen canvas and returns its data URL
 */
async function generateStoryImage() {
  const width = 1080;
  const height = 1920;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Draw solid dark gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0a0914');
  bgGrad.addColorStop(0.5, '#0e0b1c');
  bgGrad.addColorStop(1, '#1e0c24');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw ambient radial glows
  // Pink glow top left
  const pinkGlow = ctx.createRadialGradient(200, 300, 0, 200, 300, 600);
  pinkGlow.addColorStop(0, 'rgba(255, 0, 85, 0.18)');
  pinkGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = pinkGlow;
  ctx.fillRect(0, 0, width, height);

  // Cyan glow bottom right
  const cyanGlow = ctx.createRadialGradient(900, 1600, 0, 900, 1600, 700);
  cyanGlow.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
  cyanGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, width, height);

  // 3. Draw grid lines (faint)
  ctx.strokeStyle = 'rgba(255, 0, 85, 0.015)';
  ctx.lineWidth = 2;
  const gridSize = 60;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 4. Branding Header
  ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 52px "Orbitron", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GESTURE ZONE', width / 2, 120);

  ctx.shadowColor = 'rgba(255, 0, 85, 0.5)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff0055';
  ctx.font = '800 28px "Orbitron", sans-serif';
  ctx.fillText('SCREAM DETECTOR', width / 2, 180);

  // Reset shadow for standard elements
  ctx.shadowBlur = 0;

  // 5. Giant Score display circle
  ctx.fillStyle = 'rgba(24, 24, 32, 0.65)';
  ctx.strokeStyle = '#ff0055';
  ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(255, 0, 85, 0.35)';
  ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.arc(width / 2, 510, 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0; // reset

  // Score value
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 135px "Orbitron", sans-serif';
  ctx.fillText(peakDecibel, width / 2, 480);

  // Score label
  ctx.fillStyle = '#8e90a6';
  ctx.font = '800 24px "Orbitron", sans-serif';
  ctx.fillText('DECIBELS REACHED', width / 2, 580);

  // 6. Rating classification title
  ctx.fillStyle = '#00e5ff';
  ctx.font = '900 36px "Orbitron", sans-serif';
  ctx.shadowColor = 'rgba(0, 229, 255, 0.5)';
  ctx.shadowBlur = 15;
  ctx.fillText(ratingBadge.textContent, width / 2, 750);
  ctx.shadowBlur = 0; // reset

  // 7. Reaction Photos (Top 3 physical-style polaroids)
  const topPics = snapshots.slice(0, 3);

  if (topPics.length > 0) {
    try {
      const loadedImages = await Promise.all(
        topPics.map(pic => loadImage(pic.dataUrl))
      );

      if (loadedImages.length === 3) {
        // Draw three polaroids overlapping in a fan collage
        // Left polaroid (drawn first, bottom of stack)
        drawPolaroid(ctx, loadedImages[1], topPics[1].db, 280, 1180, 340, 410, -12);
        // Right polaroid (drawn second, bottom/middle of stack)
        drawPolaroid(ctx, loadedImages[2], topPics[2].db, 800, 1195, 340, 410, 14);
        // Middle polaroid (drawn last, top of stack)
        drawPolaroid(ctx, loadedImages[0], topPics[0].db, 540, 1110, 370, 440, -3);
      } else if (loadedImages.length === 2) {
        // Draw two polaroids side by side with tilt angles
        // Left polaroid
        drawPolaroid(ctx, loadedImages[0], topPics[0].db, 305, 1140, 360, 430, -5);
        // Right polaroid
        drawPolaroid(ctx, loadedImages[1], topPics[1].db, 725, 1170, 360, 430, 5);
      } else {
        // Draw one large polaroid in the middle
        drawPolaroid(ctx, loadedImages[0], topPics[0].db, width / 2, 1150, 440, 520, 3);
      }
    } catch (err) {
      console.error('Error loading reaction images for canvas:', err);
      drawNoWebcamPlaceholder(ctx, width / 2, 1150);
    }
  } else {
    // Draw placeholder for no photos
    drawNoWebcamPlaceholder(ctx, width / 2, 1150);
  }

  // 8. Footer CTA
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px "Orbitron", sans-serif';
  ctx.fillText('CAN YOU BEAT MY SCREAM?', width / 2, 1550);

  // 9. Pill Badge with URL link
  const pillWidth = 540;
  const pillHeight = 70;
  const pillX = (width - pillWidth) / 2;
  const pillY = 1630;
  const pillRadius = 35;

  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#060606';
  ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
  ctx.shadowBlur = 15;

  drawRoundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillRadius);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0; // reset

  ctx.fillStyle = '#00e5ff';
  ctx.font = '800 32px "Outfit", sans-serif';
  ctx.fillText('gesturezone.web.app', width / 2, pillY + pillHeight / 2);

  return canvas.toDataURL('image/png');
}

/**
 * Draws a beautiful physical polaroid card on the canvas with context rotation
 */
function drawPolaroid(ctx, img, db, x, y, width, height, angleDegrees) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleDegrees * Math.PI / 180);

  // Shadow for physical look
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;

  // White base polaroid card
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-width / 2, -height / 2, width, height);

  ctx.shadowBlur = 0; // disable shadow for interior components
  ctx.shadowOffsetY = 0;

  // Render Image (centered horizontally in top half)
  const imgWidth = width - 40;
  const imgHeight = imgWidth * 0.75; // aspect ratio 4:3
  const imgX = -width / 2 + 20;
  const imgY = -height / 2 + 20;

  // Draw black backdrop behind the image in case of aspect ratio issues
  ctx.fillStyle = '#000000';
  ctx.fillRect(imgX, imgY, imgWidth, imgHeight);
  ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);

  // Image border line
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = 1;
  ctx.strokeRect(imgX, imgY, imgWidth, imgHeight);

  // Caption text (decibel score of that frame)
  ctx.fillStyle = '#111111';
  ctx.font = '700 24px "Courier Prime", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${db} dB Frame`, 0, height / 2 - 35);

  ctx.restore();
}

/**
 * Draws a placeholder graphics card when webcam captures are missing
 */
function drawNoWebcamPlaceholder(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);

  const width = 450;
  const height = 400;

  // Glass card outline
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(24, 24, 32, 0.5)';
  drawRoundRect(ctx, -width / 2, -height / 2, width, height, 16);
  ctx.fill();
  ctx.stroke();

  // Emoji / Icon
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 64px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📸', 0, -50);

  // Description lines
  ctx.fillStyle = '#8e90a6';
  ctx.font = '600 22px "Outfit", sans-serif';
  ctx.fillText('No reaction snapshots taken.', 0, 30);
  ctx.fillText('Make more noise to snap photos!', 0, 75);

  ctx.restore();
}

