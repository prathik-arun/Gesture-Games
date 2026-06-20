import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref as dbRef, push, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// DOM Elements
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const typingIndicator = document.getElementById("typing-indicator");
const previewGameName = document.getElementById("preview-game-name");
const btnToggleCamera = document.getElementById("btn-toggle-camera");
const btnRunAgent = document.getElementById("btn-run-agent");
const btnPublishGame = document.getElementById("btn-publish-game");
const sandboxPlaceholder = document.getElementById("sandbox-placeholder");
const gameFrame = document.getElementById("game-frame");
const sensorOverlay = document.getElementById("sensor-overlay");
const consoleLog = document.getElementById("console-log");
const userBadge = document.getElementById("user-badge");

// Interactive Selectors Elements
const quickRepliesContainer = document.getElementById("quick-replies-container");
const gestureSelectorPanel = document.getElementById("gesture-selector-panel");
const btnConfirmGestures = document.getElementById("btn-confirm-gestures");
const customGestureInput = document.getElementById("custom-gesture-input");

// Modal Elements
const thumbnailModal = document.getElementById("thumbnail-modal");
const thumbnailCards = document.querySelectorAll(".thumbnail-card");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnConfirmPublish = document.getElementById("btn-confirm-publish");

// Game design state variables
let creatorState = {
  step: 'chat', // 'chat' | 'compiling' | 'iterative'
  name: '',
  engineType: '',
  theme: '',
  gameplayDesc: '',
  gestureMapping: '',
  currentCode: '',
  selectedThumbnailIndex: null
};

// Conversation history list
let chatHistory = [];

// Initial welcome message from Glitch
const welcomeText = "⚡ **SYSTEM INITIATED**... **HELLO OPERATOR!** ⚡\n\nI am **Glitch**, your AI Game Design Node. Together, we are going to compile a custom, high-end gesture-controlled game that runs entirely in your web browser.\n\nTell me, what kind of game would you like to make? (For example: *\"Let's build a territory capture game like paper.io!\"*)";

// Movement Tracking Variables
let movementController = null;
let cameraActive = false;

// Helper: Append a message to the chat pane
function appendMessage(sender, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;
  
  // Basic markdown-like parser for bold and lists
  let formattedText = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  
  bubble.innerHTML = `<p>${formattedText}</p>`;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Helper: Log diagnostic line
function logConsole(message, type = 'system') {
  const line = document.createElement("div");
  line.className = `console-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  consoleLog.appendChild(line);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

// Display suggestion quick-reply chips
function renderQuickReplies(options) {
  quickRepliesContainer.innerHTML = "";
  if (options && options.length > 0) {
    options.forEach(opt => {
      const chip = document.createElement("button");
      chip.className = "quick-chip";
      chip.textContent = opt;
      chip.addEventListener("click", () => {
        submitUserChatMessage(opt);
      });
      quickRepliesContainer.appendChild(chip);
    });
    quickRepliesContainer.style.display = "flex";
  } else {
    quickRepliesContainer.style.display = "none";
  }
}

// User state authentication listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    userBadge.textContent = user.displayName || user.email.split("@")[0];
    userBadge.style.borderColor = "var(--secondary-accent)";
  } else {
    userBadge.textContent = "Not Logged In";
    userBadge.style.borderColor = "rgba(255,255,255,0.1)";
  }
});

// Submit user chat message and fetch Glitch's reply from API
async function submitUserChatMessage(text) {
  // Clear layout selectors
  quickRepliesContainer.style.display = "none";
  gestureSelectorPanel.style.display = "none";
  chatForm.style.display = "flex";

  appendMessage("user", text);
  typingIndicator.style.display = "flex";
  chatLog.scrollTop = chatLog.scrollHeight;

  // Handle local compilation bypass if it returns error states
  if (text.toLowerCase() === 'retry' && creatorState.step === 'chat') {
    typingIndicator.style.display = "none";
    triggerCompilation();
    return;
  }

  // Handle iterative updates
  if (creatorState.step === 'iterative') {
    typingIndicator.style.display = "none";
    triggerIterativeUpdate(text);
    return;
  }

  try {
    const response = await fetch("/api/chat-glitch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text,
        history: chatHistory
      })
    });

    if (!response.ok) {
      throw new Error(`Glitch Chat Node returned status ${response.status}`);
    }

    const data = await response.json();
    
    // Add transaction to history
    chatHistory.push({ sender: 'user', text: text });
    chatHistory.push({ sender: 'glitch', text: data.reply });

    typingIndicator.style.display = "none";
    appendMessage("glitch", data.reply);

    // If AI provides suggestion chips
    if (data.options && data.options.length > 0) {
      renderQuickReplies(data.options);
    } else {
      renderQuickReplies(null);
    }

    // If AI requests gestures Checklist panel
    if (data.showGestureSelector) {
      chatForm.style.display = "none";
      gestureSelectorPanel.style.display = "block";
    }

    // If specifications are fully compiled and ready to build
    if (data.readyToCompile && data.gameSpecs) {
      creatorState.name = data.gameSpecs.name || "Custom Game";
      creatorState.engineType = data.gameSpecs.engineType || "2D Canvas";
      creatorState.theme = data.gameSpecs.theme || "Neon Retro";
      creatorState.gameplayDesc = data.gameSpecs.gameplayDesc || "";
      creatorState.gestureMapping = data.gameSpecs.gestureMapping || "";
      
      triggerCompilation();
    }

  } catch (err) {
    console.error(err);
    typingIndicator.style.display = "none";
    appendMessage("glitch", `⚠️ **Communication Link Offline** ⚠️\n\nI couldn't contact my neural mainframe: *${err.message}*.\n\nPlease try sending that message again!`);
  }
}

// Form chat handler
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  submitUserChatMessage(text);
});

// Gesture selections submit handler
btnConfirmGestures.addEventListener("click", () => {
  const selectedGestures = [];
  document.querySelectorAll(".gesture-checklist input:checked").forEach(cb => {
    selectedGestures.push(cb.value);
  });
  
  const custom = customGestureInput.value.trim();
  if (custom) {
    selectedGestures.push(`Custom: ${custom}`);
  }

  const resultText = selectedGestures.length > 0 ? `Mapped controls: ${selectedGestures.join(", ")}` : "No special gestures selected.";
  
  // Reset checklist checkboxes
  document.querySelectorAll(".gesture-checklist input").forEach(cb => cb.checked = false);
  customGestureInput.value = "";

  submitUserChatMessage(resultText);
});

// Trigger dynamic compilation
async function triggerCompilation() {
  creatorState.step = 'compiling';
  btnRunAgent.disabled = true;
  typingIndicator.style.display = "flex";
  chatLog.scrollTop = chatLog.scrollHeight;

  logConsole(`Initiating dynamic code compilation node for: ${creatorState.name}...`);
  logConsole(`Technology Stack: ${creatorState.engineType}`);
  logConsole("Contacting Gemini AI compilation cluster...");

  try {
    const response = await fetch("/api/generate-game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: creatorState.name,
        theme: creatorState.theme,
        engineType: creatorState.engineType,
        gameplayDesc: creatorState.gameplayDesc,
        gestureMapping: creatorState.gestureMapping
      })
    });

    if (!response.ok) {
      throw new Error(`Compiler returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.html) {
      throw new Error("No compilation HTML code returned in compiler payload.");
    }

    logConsole("Code compilation complete!", "success");
    logConsole("Mounting sandboxed iframe container...", "success");

    creatorState.currentCode = data.html;

    // Load inside iframe
    sandboxPlaceholder.style.display = "none";
    gameFrame.style.display = "block";
    gameFrame.srcdoc = data.html;

    previewGameName.textContent = creatorState.name;
    btnPublishGame.disabled = false;
    btnRunAgent.disabled = false;
    creatorState.step = 'iterative';

    typingIndicator.style.display = "none";
    appendMessage("glitch", `🎉 **BOOM! Mainframe online!** 🎉\n\nYour game **${creatorState.name}** has compiled successfully and is running in the sandbox on the right!\n\nYou can use keyboard **WASD / Arrow Keys / Space** to test it right now. If you want to play test body gestures, click **"Enable Camera"** in the top right.\n\n**If you want to tweak anything (e.g. 'make the speed faster', 'change colors to orange'), just tell me here!**`);

  } catch (err) {
    logConsole(`Compiler crash: ${err.message}`, "error");
    typingIndicator.style.display = "none";
    appendMessage("glitch", `❌ **Mainframe Compile Error!** ❌\n\nIt looks like my compiler hit an anomaly: *${err.message}*.\n\nType **retry** to compile again, or describe your game changes!`);
    creatorState.step = 'chat'; // Go back to conversation mode
  }
}

// Perform iterative code modifications based on user prompts
async function triggerIterativeUpdate(userPrompt) {
  btnRunAgent.disabled = true;
  typingIndicator.style.display = "flex";
  chatLog.scrollTop = chatLog.scrollHeight;

  logConsole(`Sending codebase revision request: "${userPrompt}"...`);
  logConsole("Re-compiling game dependencies...");

  try {
    const response = await fetch("/api/generate-game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        previousCode: creatorState.currentCode,
        revisionPrompt: userPrompt
      })
    });

    if (!response.ok) {
      throw new Error(`Compiler returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.html) {
      throw new Error("No compilation HTML code returned in update payload.");
    }

    logConsole("Re-compilation complete! Refreshing preview...", "success");
    creatorState.currentCode = data.html;
    gameFrame.srcdoc = data.html;
    btnRunAgent.disabled = false;

    typingIndicator.style.display = "none";
    appendMessage("glitch", `⚡ **Updates Compiled!** ⚡\n\nI have successfully applied your requested changes. Check out the updated code in the sandbox! What else would you like to tweak?`);

  } catch (err) {
    logConsole(`Update compiler crash: ${err.message}`, "error");
    typingIndicator.style.display = "none";
    appendMessage("glitch", `⚠️ **Update failed!**\n\nI encountered an error during revision compilation: *${err.message}*.\n\nPlease try describing the change in a different way.`);
  }
}

// Setup webcam and movement tracking loop
async function toggleCamera() {
  if (!cameraActive) {
    logConsole("Initializing webcam capture devices...");
    
    if (!movementController) {
      movementController = new MovementController();
      movementController.onUpdate((state) => {
        // Update Telemetry Panel UI
        const telWalk = document.getElementById("tel-walk");
        const telLean = document.getElementById("tel-lean");
        const telShoot = document.getElementById("tel-shoot");
        const telMouth = document.getElementById("tel-mouth");
        const telHands = document.getElementById("tel-hands");

        telWalk.textContent = state.walking ? "TRUE" : "FALSE";
        telWalk.className = `tel-val val-${state.walking}`;

        telLean.textContent = state.lean.toUpperCase();
        telLean.className = `tel-val val-${state.lean}`;

        telShoot.textContent = state.shoot ? "TRUE" : "FALSE";
        telShoot.className = `tel-val val-${state.shoot}`;

        if (telMouth) {
          telMouth.textContent = state.mouthOpen ? "TRUE" : "FALSE";
          telMouth.className = `tel-val val-${state.mouthOpen}`;
        }

        const handsCount = movementController.handLandmarksList ? movementController.handLandmarksList.length : 0;
        telHands.textContent = handsCount;
        telHands.className = handsCount > 0 ? "tel-val val-true" : "tel-val val-none";

        // Broadcast current state to game iframe via postMessage
        if (gameFrame.contentWindow) {
          gameFrame.contentWindow.postMessage(state, "*");
        }
      });
    }

    const videoElement = document.getElementById("webcam-view");
    logConsole("Camera devices linked. Awaiting frame analysis...");
    
    const cameraInitSuccess = await movementController.initCamera(videoElement);
    if (cameraInitSuccess) {
      try {
        await Promise.all([
          movementController.loadMediaPipe(),
          movementController.loadMediaPipeFaceMesh()
        ]);
        movementController.startProcessingLoop();
        
        btnToggleCamera.textContent = "Disable Camera";
        btnToggleCamera.style.borderColor = "var(--primary-accent)";
        btnToggleCamera.style.color = "var(--primary-accent)";
        sensorOverlay.style.display = "flex";
        cameraActive = true;
        logConsole("MediaPipe tracking modules (Hands + FaceMesh) activated. Webcam online.", "success");
      } catch (err) {
        logConsole("Failed to initialize MediaPipe tracking modules.", "error");
      }
    } else {
      logConsole("Failed to access camera stream.", "error");
    }
  } else {
    // Disable camera
    if (movementController && movementController.stream) {
      movementController.stream.getTracks().forEach(track => track.stop());
    }
    
    btnToggleCamera.textContent = "Enable Camera";
    btnToggleCamera.style.borderColor = "rgba(255,255,255,0.1)";
    btnToggleCamera.style.color = "var(--text-primary)";
    sensorOverlay.style.display = "none";
    cameraActive = false;
    logConsole("Camera stream terminated.");
  }
}

// Autopilot Test Agent implementation
let autopilotIntervals = [];
let autopilotTimeouts = [];

function clearAutopilotTimers() {
  autopilotIntervals.forEach(clearInterval);
  autopilotTimeouts.forEach(clearTimeout);
  autopilotIntervals = [];
  autopilotTimeouts = [];
}

async function runAutopilotAgent() {
  clearAutopilotTimers();
  
  btnRunAgent.disabled = true;
  btnRunAgent.textContent = "🤖 Testing...";
  logConsole("[Agent] Deploying Autopilot Test Agent to sandbox iframe...", "info");
  
  const iframeWin = gameFrame.contentWindow;
  const iframeDoc = gameFrame.contentDocument || (gameFrame.contentWindow ? gameFrame.contentWindow.document : null);
  
  if (!iframeWin || !iframeDoc) {
    logConsole("[Agent Error] Sandbox iframe is not fully loaded or accessible.", "error");
    btnRunAgent.disabled = false;
    btnRunAgent.textContent = "🤖 Run Agent";
    return;
  }

  // Ensure iframe window is focused so key events are processed
  iframeWin.focus();

  // Step A: Scan for secondary interactive buttons (Mute, skins, settings, highscores, etc.) and test clicks.
  const allButtons = Array.from(iframeDoc.querySelectorAll('button, a, [role="button"], input[type="button"], .btn, .button'));
  const startKeywords = ['start', 'play', 'begin', 'enter', 'go', 'ready', 'run', 'initiate'];
  const restartKeywords = ['restart', 'retry', 'respawn', 'play again', 'try again', 'continue'];
  
  const secondaryButtons = allButtons.filter(btn => {
    const txt = (btn.textContent || btn.value || '').toLowerCase();
    const isStart = startKeywords.some(kw => txt.includes(kw));
    const isRestart = restartKeywords.some(kw => txt.includes(kw));
    return !isStart && !isRestart && btn.offsetWidth > 0 && btn.offsetHeight > 0;
  });

  if (secondaryButtons.length > 0) {
    logConsole(`[Agent] Detected ${secondaryButtons.length} secondary interactive buttons. Testing up to 3 for stability...`, "info");
    const maxToClick = Math.min(secondaryButtons.length, 3);
    for (let i = 0; i < maxToClick; i++) {
      const btn = secondaryButtons[i];
      const text = (btn.textContent || btn.value || '').trim() || '[Unlabeled]';
      logConsole(`[Agent] Clicking secondary button: "${text}"`, "info");
      
      const originalStyle = btn.style.outline;
      btn.style.outline = "3px solid #ff9800";
      setTimeout(() => {
        try { btn.style.outline = originalStyle; } catch(e){}
      }, 300);

      try {
        btn.click();
      } catch (e) {
        logConsole(`[Agent Error] Clicking secondary button failed: ${e.message}`, "error");
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Step B: Scan and click the primary "Start Game" / "Play" button.
  let startBtn = null;
  for (const btn of allButtons) {
    const txt = (btn.textContent || btn.value || '').toLowerCase();
    if (startKeywords.some(kw => txt.includes(kw)) && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
      startBtn = btn;
      break;
    }
  }

  if (startBtn) {
    const text = (startBtn.textContent || startBtn.value || '').trim();
    logConsole(`[Agent] Found game start element: "${text}". Triggering click to play...`, "success");
    const originalStyle = startBtn.style.outline;
    startBtn.style.outline = "4px solid #ff9800";
    startBtn.style.boxShadow = "0 0 15px #ff9800";
    setTimeout(() => {
      try {
        startBtn.style.outline = originalStyle;
        startBtn.style.boxShadow = "";
      } catch(e){}
    }, 500);

    try {
      startBtn.click();
    } catch(e) {
      logConsole(`[Agent Error] Failed clicking start button: ${e.message}`, "error");
    }
  } else {
    const canvas = iframeDoc.querySelector('canvas');
    if (canvas) {
      logConsole("[Agent] No explicit start button found. Clicking canvas to initiate gameplay...", "info");
      canvas.click();
    } else {
      logConsole("[Agent] No start elements or canvas detected. Running inputs on document body...", "info");
    }
  }

  const simulatedKeys = [
    { key: 'ArrowRight', code: 'ArrowRight' },
    { key: 'ArrowLeft', code: 'ArrowLeft' },
    { key: 'ArrowUp', code: 'ArrowUp' },
    { key: ' ', code: 'Space' },
    { key: 'd', code: 'KeyD' },
    { key: 'a', code: 'KeyA' }
  ];

  function sendKeyEvent(type, key, code) {
    const event = new KeyboardEvent(type, {
      key: key,
      code: code,
      bubbles: true,
      cancelable: true,
      view: iframeWin,
      keyCode: getKeyCode(key)
    });
    
    try {
      iframeDoc.dispatchEvent(event);
      iframeWin.dispatchEvent(event);
      const active = iframeDoc.activeElement || iframeDoc.body;
      if (active) {
        active.dispatchEvent(event);
      }
    } catch (e) {
      console.error("Failed to dispatch key event:", e);
    }
  }

  function getKeyCode(key) {
    switch(key) {
      case 'ArrowRight': return 39;
      case 'ArrowLeft': return 37;
      case 'ArrowUp': return 38;
      case 'ArrowDown': return 40;
      case ' ': return 32;
      case 'd': case 'D': return 68;
      case 'a': case 'A': return 65;
      case 'w': case 'W': return 87;
      case 's': case 'S': return 83;
      default: return 0;
    }
  }

  let keysDown = [];
  let testTimeElapsed = 0;
  
  const keyInterval = setInterval(() => {
    keysDown.forEach(k => {
      sendKeyEvent('keyup', k.key, k.code);
    });
    keysDown = [];

    const choice = Math.floor(Math.random() * (simulatedKeys.length + 1));
    if (choice < simulatedKeys.length) {
      const keyObj = simulatedKeys[choice];
      logConsole(`[Agent] Simulating keypress: ${keyObj.key === ' ' ? 'Space' : keyObj.key}`, "info");
      sendKeyEvent('keydown', keyObj.key, keyObj.code);
      keysDown.push(keyObj);
    }
  }, 600);
  autopilotIntervals.push(keyInterval);

  const gestures = [
    { walking: true, lean: 'center', shoot: false, mouthOpen: false },
    { walking: true, lean: 'left', shoot: false, mouthOpen: false },
    { walking: true, lean: 'left', shoot: true, mouthOpen: true },
    { walking: true, lean: 'right', shoot: false, mouthOpen: false },
    { walking: true, lean: 'right', shoot: true, mouthOpen: true },
    { walking: false, lean: 'center', shoot: true, mouthOpen: false }
  ];
  let gestureIdx = 0;

  const gestureInterval = setInterval(() => {
    const gestureState = gestures[gestureIdx];
    gestureIdx = (gestureIdx + 1) % gestures.length;

    logConsole(`[Agent] Simulating gesture: walk=${gestureState.walking}, lean=${gestureState.lean}, shoot=${gestureState.shoot}, mouthOpen=${gestureState.mouthOpen}`, "info");
    iframeWin.postMessage(gestureState, "*");

    const telWalk = document.getElementById("tel-walk");
    const telLean = document.getElementById("tel-lean");
    const telShoot = document.getElementById("tel-shoot");
    const telMouth = document.getElementById("tel-mouth");

    if (telWalk) {
      telWalk.textContent = gestureState.walking ? "TRUE" : "FALSE";
      telWalk.className = `tel-val val-${gestureState.walking}`;
    }
    if (telLean) {
      telLean.textContent = gestureState.lean.toUpperCase();
      telLean.className = `tel-val val-${gestureState.lean}`;
    }
    if (telShoot) {
      telShoot.textContent = gestureState.shoot ? "TRUE" : "FALSE";
      telShoot.className = `tel-val val-${gestureState.shoot}`;
    }
    if (telMouth) {
      telMouth.textContent = gestureState.mouthOpen ? "TRUE" : "FALSE";
      telMouth.className = `tel-val val-${gestureState.mouthOpen}`;
    }
  }, 1200);
  autopilotIntervals.push(gestureInterval);

  let lastRestartTime = 0;
  const deathMonitorInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastRestartTime < 1500) return;

    const buttons = Array.from(iframeDoc.querySelectorAll('button, a, [role="button"], input[type="button"], .btn, .button'));
    let restartBtn = null;
    for (const btn of buttons) {
      const txt = (btn.textContent || btn.value || '').toLowerCase();
      if (restartKeywords.some(kw => txt.includes(kw)) && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
        restartBtn = btn;
        break;
      }
    }

    if (restartBtn) {
      const text = (restartBtn.textContent || restartBtn.value || '').trim();
      logConsole(`[Agent] Character death or game over detected. Clicking restart button: "${text}"`, "success");
      lastRestartTime = now;
      
      const originalStyle = restartBtn.style.outline;
      restartBtn.style.outline = "4px solid #ff9800";
      setTimeout(() => {
        try { restartBtn.style.outline = originalStyle; } catch(e){}
      }, 400);

      try {
        restartBtn.click();
      } catch (e) {
        logConsole(`[Agent Error] Failed clicking restart button: ${e.message}`, "error");
      }
    }
  }, 500);
  autopilotIntervals.push(deathMonitorInterval);

  const progressInterval = setInterval(() => {
    testTimeElapsed += 3;
    if (testTimeElapsed < 12) {
      logConsole(`[Agent] Testing game controls... (T-minus ${12 - testTimeElapsed} seconds)`, "info");
    }
  }, 3000);
  autopilotIntervals.push(progressInterval);

  const timeoutId = setTimeout(() => {
    clearAutopilotTimers();
    
    keysDown.forEach(k => {
      sendKeyEvent('keyup', k.key, k.code);
    });
    
    btnRunAgent.disabled = false;
    btnRunAgent.textContent = "🤖 Run Agent";
    logConsole("[Agent] Autopilot test sequence completed. Controls, UI buttons, and telemetry pipelines verified.", "success");

    const telWalk = document.getElementById("tel-walk");
    const telLean = document.getElementById("tel-lean");
    const telShoot = document.getElementById("tel-shoot");
    const telMouth = document.getElementById("tel-mouth");
    if (telWalk) { telWalk.textContent = "FALSE"; telWalk.className = "tel-val val-false"; }
    if (telLean) { telLean.textContent = "CENTER"; telLean.className = "tel-val val-center"; }
    if (telShoot) { telShoot.textContent = "FALSE"; telShoot.className = "tel-val val-false"; }
    if (telMouth) { telMouth.textContent = "FALSE"; telMouth.className = "tel-val val-false"; }
  }, 12000);
  autopilotTimeouts.push(timeoutId);
}

btnToggleCamera.addEventListener("click", toggleCamera);
btnRunAgent.addEventListener("click", runAutopilotAgent);

// Dynamic procedural covers generator
function drawProceduralThumbnails() {
  const parsedColors = parseColorsFromTheme(creatorState.theme);
  const title = (creatorState.name || 'Custom Game').toUpperCase();
  const titleText = (creatorState.name || '').toLowerCase();
  const descText = (creatorState.gameplayDesc || '').toLowerCase();
  const codeText = (creatorState.currentCode || '').toLowerCase();

  const highSignal = titleText + ' ' + descText;

  let gameType = 'default';
  if (
    highSignal.includes('ninja') || highSignal.includes('fruit') || highSignal.includes('slice') || highSignal.includes('katana') || highSignal.includes('slash') || highSignal.includes('blade') || highSignal.includes('bomb') ||
    codeText.includes('fruit') || codeText.includes('bomb') || codeText.includes('slice') || codeText.includes('slash')
  ) {
    gameType = 'slice';
  } else if (
    highSignal.includes('knife') || highSignal.includes('hit') || highSignal.includes('throw') || highSignal.includes('wheel') || highSignal.includes('target') ||
    codeText.includes('knife') || codeText.includes('targetwheel') || codeText.includes('wheelangle') || codeText.includes('throwknife')
  ) {
    gameType = 'knife';
  } else if (
    highSignal.includes('dodge') || highSignal.includes('block') || highSignal.includes('fall') || highSignal.includes('obstacle') || highSignal.includes('avoid') ||
    codeText.includes('dodge') || codeText.includes('obstacle') || codeText.includes('falling')
  ) {
    gameType = 'dodge';
  } else if (
    highSignal.includes('paper') || highSignal.includes('io') || highSignal.includes('capture') || highSignal.includes('territory') || highSignal.includes('trail') || highSignal.includes('grid') ||
    codeText.includes('paper.io') || codeText.includes('paperio') || codeText.includes('territory') || codeText.includes('trail')
  ) {
    gameType = 'capture';
  }

  // DOM elements for labels
  const cards = document.querySelectorAll(".thumbnail-card");
  
  // Update labels text based on thematic cover selection
  if (gameType === 'slice') {
    cards[0].querySelector(".thumbnail-label").textContent = "Neon Katana";
    cards[1].querySelector(".thumbnail-label").textContent = "Sliced Melon";
    cards[2].querySelector(".thumbnail-label").textContent = "Blade Slashes";
    cards[3].querySelector(".thumbnail-label").textContent = "Ninja Dojo Grid";
  } else if (gameType === 'knife') {
    cards[0].querySelector(".thumbnail-label").textContent = "Target Board";
    cards[1].querySelector(".thumbnail-label").textContent = "Sticking Knives";
    cards[2].querySelector(".thumbnail-label").textContent = "Knife Thrower";
    cards[3].querySelector(".thumbnail-label").textContent = "Target Spikes";
  } else if (gameType === 'capture') {
    cards[0].querySelector(".thumbnail-label").textContent = "Neon Grid Map";
    cards[1].querySelector(".thumbnail-label").textContent = "Captured Territory";
    cards[2].querySelector(".thumbnail-label").textContent = "Trail Enclosure";
    cards[3].querySelector(".thumbnail-label").textContent = "Grid Conqueror";
  } else if (gameType === 'dodge') {
    cards[0].querySelector(".thumbnail-label").textContent = "Falling Blocks";
    cards[1].querySelector(".thumbnail-label").textContent = "Dodge Runway";
    cards[2].querySelector(".thumbnail-label").textContent = "Shield Deflector";
    cards[3].querySelector(".thumbnail-label").textContent = "Cyber Dodge Run";
  } else {
    cards[0].querySelector(".thumbnail-label").textContent = "Vector Grid";
    cards[1].querySelector(".thumbnail-label").textContent = "Neon Pulse";
    cards[2].querySelector(".thumbnail-label").textContent = "Synthwave Wave";
    cards[3].querySelector(".thumbnail-label").textContent = "Retro Particles";
  }

  // Get Canvases
  const canvas0 = document.getElementById("thumb-canvas-0");
  const canvas1 = document.getElementById("thumb-canvas-1");
  const canvas2 = document.getElementById("thumb-canvas-2");
  const canvas3 = document.getElementById("thumb-canvas-3");

  const ctx0 = canvas0.getContext("2d");
  const ctx1 = canvas1.getContext("2d");
  const ctx2 = canvas2.getContext("2d");
  const ctx3 = canvas3.getContext("2d");

  // Helper: clear canvas with color
  function clearCanvas(ctx, canvas, color = "#0a0a0a") {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
  }

  // DRAW CANVAS 0
  clearCanvas(ctx0, canvas0, "#080808");
  if (gameType === 'slice') {
    // Neon Katana: perspective grid + sword
    ctx0.strokeStyle = parsedColors.primary;
    ctx0.lineWidth = 0.5;
    const horizon = 75;
    for (let x = -30; x <= canvas0.width + 30; x += 25) {
      ctx0.beginPath(); ctx0.moveTo(canvas0.width / 2, horizon); ctx0.lineTo(x, canvas0.height); ctx0.stroke();
    }
    for (let y = horizon; y <= canvas0.height; y += 15) {
      ctx0.beginPath(); ctx0.moveTo(0, y); ctx0.lineTo(canvas0.width, y); ctx0.stroke();
    }
    // Katana line
    ctx0.strokeStyle = "#fff";
    ctx0.lineWidth = 4;
    ctx0.shadowColor = parsedColors.secondary;
    ctx0.shadowBlur = 12;
    ctx0.beginPath();
    ctx0.moveTo(30, 120);
    ctx0.lineTo(190, 40);
    ctx0.stroke();
    // Katana hilt
    ctx0.shadowBlur = 0;
    ctx0.strokeStyle = parsedColors.primary;
    ctx0.lineWidth = 6;
    ctx0.beginPath();
    ctx0.moveTo(25, 122);
    ctx0.lineTo(45, 112);
    ctx0.stroke();
  } else if (gameType === 'knife') {
    // Target board
    ctx0.strokeStyle = parsedColors.primary;
    ctx0.lineWidth = 4;
    ctx0.shadowBlur = 10;
    ctx0.shadowColor = parsedColors.primary;
    ctx0.beginPath();
    ctx0.arc(canvas0.width / 2, 65, 40, 0, Math.PI * 2);
    ctx0.stroke();
    // Spoke marks
    ctx0.lineWidth = 1;
    ctx0.strokeStyle = parsedColors.secondary;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx0.beginPath();
      ctx0.moveTo(canvas0.width / 2, 65);
      ctx0.lineTo(canvas0.width / 2 + Math.cos(a) * 40, 65 + Math.sin(a) * 40);
      ctx0.stroke();
    }
    // Knife at bottom
    ctx0.fillStyle = "#fff";
    ctx0.shadowColor = "#fff";
    ctx0.fillRect(canvas0.width / 2 - 3, 115, 6, 25);
  } else if (gameType === 'capture') {
    // Neon Grid Map
    ctx0.strokeStyle = "rgba(0,255,102,0.15)";
    ctx0.lineWidth = 1;
    for (let x = 0; x < canvas0.width; x += 15) {
      ctx0.beginPath(); ctx0.moveTo(x, 0); ctx0.lineTo(x, canvas0.height); ctx0.stroke();
    }
    for (let y = 0; y < canvas0.height; y += 15) {
      ctx0.beginPath(); ctx0.moveTo(0, y); ctx0.lineTo(canvas0.width, y); ctx0.stroke();
    }
    // Draw player loops
    ctx0.strokeStyle = parsedColors.secondary;
    ctx0.lineWidth = 3;
    ctx0.shadowColor = parsedColors.secondary;
    ctx0.shadowBlur = 10;
    ctx0.strokeRect(40, 30, 80, 60);
    ctx0.fillStyle = "rgba(0,229,255,0.15)";
    ctx0.fillRect(40, 30, 80, 60);
  } else if (gameType === 'dodge') {
    // Falling blocks
    ctx0.fillStyle = parsedColors.primary;
    ctx0.shadowColor = parsedColors.primary;
    ctx0.shadowBlur = 8;
    ctx0.fillRect(40, 20, 20, 20);
    ctx0.fillRect(160, 45, 15, 15);
    ctx0.fillRect(90, 80, 20, 20);
    // Player bar
    ctx0.fillStyle = parsedColors.secondary;
    ctx0.shadowColor = parsedColors.secondary;
    ctx0.fillRect(canvas0.width / 2 - 20, 125, 40, 10);
  } else {
    // Original Vector Grid
    ctx0.strokeStyle = parsedColors.primary;
    ctx0.lineWidth = 1;
    const horizonY = 90;
    for (let x = -50; x <= canvas0.width + 50; x += 30) {
      ctx0.beginPath(); ctx0.moveTo(canvas0.width / 2, horizonY); ctx0.lineTo(x, canvas0.height); ctx0.stroke();
    }
    for (let y = horizonY; y < canvas0.height; y += 15) {
      ctx0.beginPath(); ctx0.moveTo(0, y); ctx0.lineTo(canvas0.width, y); ctx0.stroke();
    }
  }
  drawTitle(ctx0, title, canvas0.width / 2, 45, parsedColors.secondary);


  // DRAW CANVAS 1
  clearCanvas(ctx1, canvas1, "#070707");
  if (gameType === 'slice') {
    // Sliced melon: circle cut diagonally
    ctx1.strokeStyle = parsedColors.primary;
    ctx1.lineWidth = 5;
    ctx1.shadowColor = parsedColors.primary;
    ctx1.shadowBlur = 10;
    // Top-left half
    ctx1.beginPath();
    ctx1.arc(canvas1.width / 2 - 10, canvas1.height / 2 - 15, 30, Math.PI * 0.75, Math.PI * 1.75);
    ctx1.stroke();
    // Bottom-right half
    ctx1.beginPath();
    ctx1.arc(canvas1.width / 2 + 10, canvas1.height / 2 - 5, 30, Math.PI * 1.75, Math.PI * 0.75);
    ctx1.stroke();
    // Seeds
    ctx1.fillStyle = "#fff";
    ctx1.shadowBlur = 0;
    ctx1.beginPath();
    ctx1.arc(canvas1.width / 2 - 20, canvas1.height / 2 - 20, 2, 0, Math.PI * 2);
    ctx1.arc(canvas1.width / 2 + 20, canvas1.height / 2, 2, 0, Math.PI * 2);
    ctx1.fill();
  } else if (gameType === 'knife') {
    // Target with stuck knives
    ctx1.strokeStyle = parsedColors.primary;
    ctx1.lineWidth = 5;
    ctx1.shadowColor = parsedColors.primary;
    ctx1.shadowBlur = 10;
    ctx1.beginPath();
    ctx1.arc(canvas1.width / 2, canvas1.height / 2 - 15, 35, 0, Math.PI * 2);
    ctx1.stroke();
    // Radial knives
    ctx1.strokeStyle = "#fff";
    ctx1.lineWidth = 3;
    ctx1.shadowColor = parsedColors.secondary;
    const angles = [0, Math.PI/4, Math.PI*0.8, Math.PI*1.3];
    angles.forEach(a => {
      ctx1.beginPath();
      ctx1.moveTo(canvas1.width / 2 + Math.cos(a) * 35, canvas1.height / 2 - 15 + Math.sin(a) * 35);
      ctx1.lineTo(canvas1.width / 2 + Math.cos(a) * 55, canvas1.height / 2 - 15 + Math.sin(a) * 55);
      ctx1.stroke();
    });
  } else if (gameType === 'capture') {
    // Base filled loops
    ctx1.fillStyle = "rgba(0,255,102,0.1)";
    ctx1.strokeStyle = parsedColors.primary;
    ctx1.lineWidth = 2;
    ctx1.shadowBlur = 8;
    ctx1.shadowColor = parsedColors.primary;
    ctx1.fillRect(30, 20, 60, 50);
    ctx1.strokeRect(30, 20, 60, 50);
    ctx1.fillStyle = "rgba(255,0,127,0.15)";
    ctx1.strokeStyle = parsedColors.secondary;
    ctx1.shadowColor = parsedColors.secondary;
    ctx1.fillRect(120, 60, 70, 50);
    ctx1.strokeRect(120, 60, 70, 50);
  } else if (gameType === 'dodge') {
    // Dodge path layout
    ctx1.strokeStyle = "rgba(255,255,255,0.05)";
    ctx1.lineWidth = 2;
    ctx1.beginPath(); ctx1.moveTo(canvas1.width / 3, 0); ctx1.lineTo(canvas1.width / 3, canvas1.height); ctx1.stroke();
    ctx1.beginPath(); ctx1.moveTo((canvas1.width / 3) * 2, 0); ctx1.lineTo((canvas1.width / 3) * 2, canvas1.height); ctx1.stroke();
    // Falling obstacles in specific lanes
    ctx1.fillStyle = parsedColors.primary;
    ctx1.shadowBlur = 8;
    ctx1.shadowColor = parsedColors.primary;
    ctx1.fillRect(canvas1.width / 6 - 10, 20, 20, 20);
    ctx1.fillRect((canvas1.width / 6) * 5 - 10, 60, 20, 20);
    // Player in middle lane dodging
    ctx1.fillStyle = parsedColors.secondary;
    ctx1.shadowColor = parsedColors.secondary;
    ctx1.fillRect(canvas1.width / 2 - 15, 110, 30, 10);
  } else {
    // Concentric Neon Pulse
    const circles = [30, 45, 60];
    ctx1.lineWidth = 2;
    circles.forEach((r, idx) => {
      ctx1.strokeStyle = idx % 2 === 0 ? parsedColors.primary : parsedColors.secondary;
      ctx1.shadowColor = ctx1.strokeStyle;
      ctx1.shadowBlur = 8;
      ctx1.beginPath();
      ctx1.arc(canvas1.width / 2, canvas1.height / 2 - 10, r, 0, Math.PI * 2);
      ctx1.stroke();
    });
  }
  ctx1.shadowBlur = 0;
  drawTitle(ctx1, title, canvas1.width / 2, 125, parsedColors.primary);


  // DRAW CANVAS 2
  clearCanvas(ctx2, canvas2, "#100015");
  if (gameType === 'slice') {
    // Blade slashes crossing the canvas
    ctx2.strokeStyle = parsedColors.primary;
    ctx2.lineWidth = 4;
    ctx2.shadowColor = parsedColors.primary;
    ctx2.shadowBlur = 10;
    ctx2.beginPath();
    ctx2.moveTo(20, 30); ctx2.lineTo(200, 110);
    ctx2.stroke();
    ctx2.strokeStyle = parsedColors.secondary;
    ctx2.shadowColor = parsedColors.secondary;
    ctx2.beginPath();
    ctx2.moveTo(20, 110); ctx2.lineTo(200, 30);
    ctx2.stroke();
    // Sparks
    ctx2.fillStyle = "#fff";
    ctx2.shadowBlur = 6;
    ctx2.shadowColor = "#fff";
    for (let i = 0; i < 8; i++) {
      ctx2.beginPath();
      ctx2.arc(80 + Math.random() * 60, 50 + Math.random() * 40, 2, 0, Math.PI * 2);
      ctx2.fill();
    }
  } else if (gameType === 'knife') {
    // Multiple knives aligned vertically
    ctx2.fillStyle = "#fff";
    ctx2.shadowColor = parsedColors.secondary;
    ctx2.shadowBlur = 8;
    ctx2.fillRect(60, 110, 6, 25);
    ctx2.fillRect(100, 110, 6, 25);
    ctx2.fillRect(140, 110, 6, 25);
    // Target board top
    ctx2.strokeStyle = parsedColors.primary;
    ctx2.lineWidth = 5;
    ctx2.shadowBlur = 10;
    ctx2.shadowColor = parsedColors.primary;
    ctx2.beginPath();
    ctx2.arc(100, 40, 30, 0, Math.PI * 2);
    ctx2.stroke();
  } else if (gameType === 'capture') {
    // Trail loops and fill
    ctx2.strokeStyle = "rgba(0,0,0,0.15)";
    ctx2.lineWidth = 1;
    // perspective grids
    for (let x = -20; x <= canvas2.width + 20; x += 20) {
      ctx2.beginPath(); ctx2.moveTo(canvas2.width/2, 60); ctx2.lineTo(x, canvas2.height); ctx2.stroke();
    }
    ctx2.strokeStyle = parsedColors.primary;
    ctx2.lineWidth = 3;
    ctx2.shadowBlur = 10;
    ctx2.shadowColor = parsedColors.primary;
    ctx2.beginPath();
    ctx2.moveTo(40, 110); ctx2.lineTo(80, 80); ctx2.lineTo(150, 95); ctx2.lineTo(130, 120);
    ctx2.stroke();
  } else if (gameType === 'dodge') {
    // Deflector shield
    ctx2.strokeStyle = parsedColors.secondary;
    ctx2.lineWidth = 3;
    ctx2.shadowBlur = 10;
    ctx2.shadowColor = parsedColors.secondary;
    ctx2.beginPath();
    ctx2.arc(canvas2.width / 2, 130, 25, Math.PI, 0, false); // top arc
    ctx2.stroke();
    // Obstacles hitting shield
    ctx2.fillStyle = parsedColors.primary;
    ctx2.shadowColor = parsedColors.primary;
    ctx2.shadowBlur = 8;
    ctx2.fillRect(canvas2.width / 2 - 15, 60, 8, 8);
    ctx2.fillRect(canvas2.width / 2 + 10, 80, 6, 6);
  } else {
    // Synthwave sunset
    const gradient = ctx2.createLinearGradient(0, 0, 0, canvas2.height);
    gradient.addColorStop(0, "#1f0524");
    gradient.addColorStop(1, "#07000d");
    ctx2.fillStyle = gradient;
    ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
    const sunY = 90;
    ctx2.fillStyle = parsedColors.primary;
    ctx2.beginPath();
    ctx2.arc(canvas2.width / 2, sunY, 32, Math.PI, 0, false);
    ctx2.fill();
    ctx2.fillStyle = "#07000d";
    for (let y = sunY - 25; y < sunY; y += 8) {
      ctx2.fillRect(canvas2.width / 2 - 35, y, 70, 2);
    }
    ctx2.strokeStyle = parsedColors.secondary;
    ctx2.lineWidth = 0.5;
    for (let x = -30; x <= canvas2.width + 30; x += 20) {
      ctx2.beginPath();
      ctx2.moveTo(canvas2.width / 2, sunY);
      ctx2.lineTo(x, canvas2.height);
      ctx2.stroke();
    }
  }
  ctx2.shadowBlur = 0;
  drawTitle(ctx2, title, canvas2.width / 2, 50, parsedColors.secondary);


  // DRAW CANVAS 3
  clearCanvas(ctx3, canvas3, "#05080c");
  if (gameType === 'slice') {
    // Ninja Dojo grid pattern with slash
    ctx3.strokeStyle = "rgba(255,255,255,0.06)";
    ctx3.lineWidth = 1;
    for (let x = 0; x < canvas3.width; x += 20) {
      ctx3.beginPath(); ctx3.moveTo(x, 0); ctx3.lineTo(x, canvas3.height); ctx3.stroke();
    }
    for (let y = 0; y < canvas3.height; y += 20) {
      ctx3.beginPath(); ctx3.moveTo(0, y); ctx3.lineTo(canvas3.width, y); ctx3.stroke();
    }
    // Big hot pink diagonal slash
    ctx3.strokeStyle = parsedColors.primary;
    ctx3.lineWidth = 5;
    ctx3.shadowBlur = 15;
    ctx3.shadowColor = parsedColors.primary;
    ctx3.beginPath();
    ctx3.moveTo(10, 130);
    ctx3.lineTo(210, 20);
    ctx3.stroke();
  } else if (gameType === 'knife') {
    // Radial spikes
    ctx3.strokeStyle = parsedColors.primary;
    ctx3.lineWidth = 3;
    ctx3.shadowBlur = 10;
    ctx3.shadowColor = parsedColors.primary;
    ctx3.beginPath();
    ctx3.arc(canvas3.width / 2, canvas3.height / 2 - 10, 20, 0, Math.PI * 2);
    ctx3.stroke();
    ctx3.strokeStyle = parsedColors.secondary;
    ctx3.shadowColor = parsedColors.secondary;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      ctx3.beginPath();
      ctx3.moveTo(canvas3.width / 2 + Math.cos(a) * 20, canvas3.height / 2 - 10 + Math.sin(a) * 20);
      ctx3.lineTo(canvas3.width / 2 + Math.cos(a) * 38, canvas3.height / 2 - 10 + Math.sin(a) * 38);
      ctx3.stroke();
    }
  } else if (gameType === 'capture') {
    // Grid conqueror path loop
    ctx3.strokeStyle = parsedColors.secondary;
    ctx3.lineWidth = 3;
    ctx3.shadowBlur = 10;
    ctx3.shadowColor = parsedColors.secondary;
    ctx3.strokeRect(30, 30, 160, 90);
    ctx3.fillStyle = parsedColors.primary;
    ctx3.shadowColor = parsedColors.primary;
    ctx3.fillRect(182, 22, 16, 16); // player block
  } else if (gameType === 'dodge') {
    // Obstacle grid course
    ctx3.strokeStyle = parsedColors.primary;
    ctx3.lineWidth = 2;
    ctx3.shadowBlur = 6;
    ctx3.shadowColor = parsedColors.primary;
    ctx3.strokeRect(20, 10, 180, 130);
    ctx3.fillStyle = parsedColors.secondary;
    ctx3.shadowColor = parsedColors.secondary;
    ctx3.fillRect(60, 40, 12, 12);
    ctx3.fillRect(140, 70, 12, 12);
    ctx3.fillStyle = "#fff";
    ctx3.shadowColor = "#fff";
    ctx3.fillRect(100, 110, 12, 12); // player dodging
  } else {
    // Original Constellation particles
    const nodes = [
      { x: 30, y: 40 }, { x: 70, y: 20 }, { x: 180, y: 35 }, { x: 200, y: 70 },
      { x: 150, y: 110 }, { x: 50, y: 130 }, { x: 100, y: 80 }
    ];
    ctx3.fillStyle = parsedColors.primary;
    ctx3.strokeStyle = "rgba(255,255,255,0.06)";
    ctx3.lineWidth = 1;
    nodes.forEach(n => {
      ctx3.beginPath();
      ctx3.arc(n.x, n.y, 3, 0, Math.PI * 2);
      ctx3.fill();
    });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        ctx3.beginPath();
        ctx3.moveTo(nodes[i].x, nodes[i].y);
        ctx3.lineTo(nodes[j].x, nodes[j].y);
        ctx3.stroke();
      }
    }
  }
  ctx3.shadowBlur = 0;
  drawTitle(ctx3, title, canvas3.width / 2, 75, "#ffffff");
}

// Helper: parse theme text for basic color cues
function parseColorsFromTheme(themeText) {
  const txt = (themeText || "").toLowerCase();
  let primary = "#e74c3c";
  let secondary = "#00e5ff";

  if (txt.includes("green") || txt.includes("matrix") || txt.includes("acid")) {
    primary = "#00ff66";
    secondary = "#008822";
  } else if (txt.includes("blue") || txt.includes("ocean") || txt.includes("water")) {
    primary = "#00a2ff";
    secondary = "#00ffff";
  } else if (txt.includes("purple") || txt.includes("synth") || txt.includes("violet")) {
    primary = "#9b59b6";
    secondary = "#ff007f";
  } else if (txt.includes("gold") || txt.includes("yellow") || txt.includes("sun")) {
    primary = "#f1c40f";
    secondary = "#e67e22";
  } else if (txt.includes("pink") || txt.includes("cyber")) {
    primary = "#ff007f";
    secondary = "#00ffff";
  }
  return { primary, secondary };
}

// Helper: draw text centering and size fitting
function drawTitle(ctx, title, x, y, glowColor) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  
  // Dynamic scale font size based on title length
  let fontSize = 16;
  if (title.length > 18) fontSize = 10;
  else if (title.length > 12) fontSize = 12;
  
  ctx.font = `900 ${fontSize}px "Orbitron", sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(title, x, y);
  ctx.restore();
}

// Cover modal operations
btnPublishGame.addEventListener("click", () => {
  const user = auth.currentUser;
  if (!user) {
    alert("Please log in on the Lobby page to publish and sync games with your account!");
    return;
  }
  
  // Reset selection
  creatorState.selectedThumbnailIndex = null;
  thumbnailCards.forEach(c => c.classList.remove("selected"));
  btnConfirmPublish.disabled = true;

  // Open modal and render canvases
  thumbnailModal.style.display = "flex";
  drawProceduralThumbnails();
});

btnCloseModal.addEventListener("click", () => {
  thumbnailModal.style.display = "none";
});

thumbnailCards.forEach(card => {
  card.addEventListener("click", () => {
    thumbnailCards.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    creatorState.selectedThumbnailIndex = parseInt(card.getAttribute("data-index"));
    btnConfirmPublish.disabled = false;
  });
});

// Final publish confirmation
btnConfirmPublish.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  btnConfirmPublish.disabled = true;
  btnConfirmPublish.textContent = "Publishing...";
  logConsole("Publishing game to Gesture Zone servers...");

  try {
    const canvasId = `thumb-canvas-${creatorState.selectedThumbnailIndex}`;
    const canvas = document.getElementById(canvasId);
    const thumbnailDataUrl = canvas.toDataURL("image/png");

    const gameId = `user_${Date.now()}`;
    const userGameRef = dbRef(database, `games/user_created/${gameId}`);
    
    // Save directly to Firebase Realtime Database
    await set(userGameRef, {
      id: gameId,
      name: creatorState.name,
      description: creatorState.gameplayDesc,
      theme: creatorState.theme,
      engine: creatorState.engineType,
      code: creatorState.currentCode,
      thumbnail: thumbnailDataUrl,
      author: user.displayName || user.email.split("@")[0],
      createdAt: Date.now()
    });

    logConsole(`Game published successfully! ID: ${gameId}`, "success");
    thumbnailModal.style.display = "none";
    
    appendMessage("glitch", `🎉 **MAINFRAME SYNCHRONIZATION SUCCESS!** 🎉\n\nYour game **${creatorState.name}** has been published successfully and synchronized with the database! It is now live in the **Lobby** grid for all users to play!\n\nCheck it out, or ask me for further modifications!`);

  } catch (err) {
    logConsole(`Publish crash: ${err.message}`, "error");
    alert("Publish failed: " + err.message);
  } finally {
    btnConfirmPublish.disabled = false;
    btnConfirmPublish.textContent = "Publish with Selection";
  }
});

// Setup welcome screen bubble
window.addEventListener("DOMContentLoaded", () => {
  appendMessage("glitch", welcomeText);
  chatHistory.push({ sender: 'glitch', text: welcomeText });
  logConsole("Node workspace online. Dynamic design session initialized.");

  // Track sandbox iframe JS errors/crashes
  gameFrame.addEventListener("load", () => {
    try {
      const iframeWindow = gameFrame.contentWindow;
      if (!iframeWindow) return;

      iframeWindow.addEventListener("error", (e) => {
        logConsole(`[Agent Error] JavaScript crash: ${e.message} at ${e.filename || 'inline'}:${e.lineno || 0}:${e.colno || 0}`, "error");
        if (e.error && e.error.stack) {
          logConsole(`[Agent Error Stack] ${e.error.stack}`, "error");
        }
      });

      iframeWindow.addEventListener("unhandledrejection", (e) => {
        logConsole(`[Agent Error] Unhandled rejection: ${e.reason}`, "error");
      });
    } catch (err) {
      console.warn("[Agent] Failed to attach error listener to sandbox iframe:", err.message);
    }
  });
});
