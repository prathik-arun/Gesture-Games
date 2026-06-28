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

// Workspace State Containers
const workspace = document.getElementById("workspace");
const workspaceTabsContainer = document.getElementById("workspace-tabs");
const chatPane = document.getElementById("chat-pane");
const previewPane = document.getElementById("preview-pane");
const chatPaneHeader = document.getElementById("chat-pane-header");

// Wizard Elements
const wizardContainer = document.getElementById("wizard-container");
const wizardProgressFill = document.getElementById("wizard-progress-fill");
const wizardStepTitle = document.getElementById("wizard-step-title");
const wizardIdeaInput = document.getElementById("wizard-idea-input");
const btnNextIdea = document.getElementById("btn-next-idea");
const wizardSuggestionsGrid = document.getElementById("wizard-suggestions-grid");

// Step Panels
const stepPanelIdea = document.getElementById("step-panel-idea");
const stepPanelEngine = document.getElementById("step-panel-engine");
const stepPanelTheme = document.getElementById("step-panel-theme");
const stepPanelGestures = document.getElementById("step-panel-gestures");
const stepPanelCharacter = document.getElementById("step-panel-character");
const stepPanelBackground = document.getElementById("step-panel-background");
const stepPanelObstacle = document.getElementById("step-panel-obstacle");

// Wizard Buttons
const btnBackEngine = document.getElementById("btn-back-engine");
const btnBackTheme = document.getElementById("btn-back-theme");
const btnBackGestures = document.getElementById("btn-back-gestures");
const btnNextGestures = document.getElementById("btn-next-gestures");
const btnBackCharacter = document.getElementById("btn-back-character");
const btnBackBackground = document.getElementById("btn-back-background");
const btnBackObstacle = document.getElementById("btn-back-obstacle");

// Plan Containers
const planContainer = document.getElementById("plan-container");
const planMarkdownContainer = document.getElementById("plan-markdown-container");
const planFeedbackInput = document.getElementById("plan-feedback-input");
const btnSuggestChanges = document.getElementById("btn-suggest-changes");
const btnProceedBuild = document.getElementById("btn-proceed-build");
const sandboxContainer = document.getElementById("sandbox-container");

// Modal Elements
const thumbnailModal = document.getElementById("thumbnail-modal");
const thumbnailCards = document.querySelectorAll(".thumbnail-card");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnConfirmPublish = document.getElementById("btn-confirm-publish");

// Game design state variables
let creatorState = {
  step: 'wizard', // 'wizard' | 'plan' | 'compiling' | 'iterative'
  wizardStep: 1,
  name: '',
  engineType: '',
  theme: '',
  gameplayDesc: '',
  gestureMapping: '',
  characterAsset: '',
  backgroundAsset: '',
  obstacleAsset: '',
  currentCode: '',
  selectedThumbnailIndex: null,
  implementationPlan: ''
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

// Submit user chat message and fetch Glitch's reply from API (Iterative/Tweak phase)
async function submitUserChatMessage(text) {
  // Clear layout selectors
  quickRepliesContainer.style.display = "none";
  if (gestureSelectorPanel) gestureSelectorPanel.style.display = "none";
  chatForm.style.display = "flex";

  appendMessage("user", text);
  typingIndicator.style.display = "flex";
  chatLog.scrollTop = chatLog.scrollHeight;

  // Handle iterative updates
  if (creatorState.step === 'iterative') {
    typingIndicator.style.display = "none";
    triggerIterativeUpdate(text);
    return;
  }

  // Handle adjustments during Plan phase
  if (creatorState.step === 'plan') {
    typingIndicator.style.display = "none";
    triggerPlanGeneration(text);
    return;
  }
}

// A simple client-side markdown compiler
function renderMarkdown(text) {
  if (!text) return "";
  let html = text;
  
  // Fenced Code blocks
  html = html.replace(/```(?:[a-zA-Z0-9]+)?([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  
  // Headings
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  
  // Inline Code tags
  html = html.replace(/`(.*?)`/g, "<code>$1</code>");
  
  // Lists
  // Checklists (- [ ] or - [x])
  html = html.replace(/^\s*-\s*\[ \] (.*$)/gim, '<li><input type="checkbox" disabled> $1</li>');
  html = html.replace(/^\s*-\s*\[x\] (.*$)/gim, '<li><input type="checkbox" checked disabled> $1</li>');
  html = html.replace(/^\s*-\s*(.*$)/gim, "<li>$1</li>");
  
  // Paragraph formatting
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  
  return html;
}

// Step Navigation for Wizard Panel
function goToWizardStep(stepNum) {
  creatorState.wizardStep = stepNum;
  
  // Update panels visibility
  stepPanelIdea.classList.remove("active");
  stepPanelEngine.classList.remove("active");
  stepPanelTheme.classList.remove("active");
  stepPanelGestures.classList.remove("active");
  stepPanelCharacter.classList.remove("active");
  stepPanelBackground.classList.remove("active");
  stepPanelObstacle.classList.remove("active");
  
  let fillPercent = 0;
  let stepTitle = "";
  
  if (stepNum === 1) {
    stepPanelIdea.classList.add("active");
    fillPercent = 10;
    stepTitle = "Describe your game idea";
  } else if (stepNum === 2) {
    stepPanelEngine.classList.add("active");
    fillPercent = 25;
    stepTitle = "Select Game Engine";
  } else if (stepNum === 3) {
    stepPanelTheme.classList.add("active");
    fillPercent = 40;
    stepTitle = "Choose Visual Theme";
  } else if (stepNum === 4) {
    stepPanelGestures.classList.add("active");
    fillPercent = 55;
    stepTitle = "Map Motion Gestures";
  } else if (stepNum === 5) {
    stepPanelCharacter.classList.add("active");
    fillPercent = 70;
    stepTitle = "Choose Character Style";
    drawWizardPreviews('character');
  } else if (stepNum === 6) {
    stepPanelBackground.classList.add("active");
    fillPercent = 85;
    stepTitle = "Choose Background Backdrop";
    drawWizardPreviews('background');
  } else if (stepNum === 7) {
    stepPanelObstacle.classList.add("active");
    fillPercent = 95;
    stepTitle = "Choose Obstacle / Enemy Hazard";
    drawWizardPreviews('obstacle');
  }
  
  wizardProgressFill.style.width = `${fillPercent}%`;
  wizardStepTitle.textContent = stepTitle;
}

// Initialize Wizard Elements and Click Listeners
function initWizard() {
  // Suggestion chips click bindings
  const suggestions = [
    "Ninja Slicing Game: slice flying items with hand movements, avoid bombs",
    "Territory Capture (Paper.io style): steer a path loop by leaning left and right",
    "Wood Target Knife Hit: pinch fingers to throw knives at a rotating wheel",
    "Cyber Block Dodge Run: slide left and right to dodge falling obstacles",
    "Classic Pong Paddle Duel: control vertical paddle steering by leaning"
  ];
  
  wizardSuggestionsGrid.innerHTML = "";
  suggestions.forEach(s => {
    const chip = document.createElement("button");
    const label = s.split(":")[0];
    chip.className = "quick-chip";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      wizardIdeaInput.value = s;
      wizardIdeaInput.focus();
    });
    wizardSuggestionsGrid.appendChild(chip);
  });
  
  // Next step click events
  btnNextIdea.addEventListener("click", () => {
    const idea = wizardIdeaInput.value.trim();
    if (!idea) {
      alert("Please describe your game idea to continue.");
      return;
    }
    creatorState.gameplayDesc = idea;
    goToWizardStep(2);
  });
  
  // Engine Cards binding
  document.querySelectorAll("#step-panel-engine .wizard-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#step-panel-engine .wizard-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      creatorState.engineType = card.getAttribute("data-value");
      setTimeout(() => goToWizardStep(3), 300);
    });
  });
  
  // Theme Cards binding
  document.querySelectorAll("#step-panel-theme .wizard-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#step-panel-theme .wizard-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      
      const themeVal = card.getAttribute("data-value");
      const customThemeRow = document.getElementById("custom-theme-row");
      const customThemeInput = document.getElementById("custom-theme-input");
      
      if (themeVal === "custom") {
        customThemeRow.style.display = "flex";
        customThemeInput.focus();
      } else {
        customThemeRow.style.display = "none";
        creatorState.theme = themeVal;
        setTimeout(() => goToWizardStep(4), 300);
      }
    });
  });

  // Custom theme confirm button event
  const btnConfirmCustomTheme = document.getElementById("btn-confirm-custom-theme");
  const customThemeInput = document.getElementById("custom-theme-input");
  btnConfirmCustomTheme.addEventListener("click", () => {
    const customThemeVal = customThemeInput.value.trim();
    if (!customThemeVal) {
      alert("Please enter a custom theme description.");
      return;
    }
    creatorState.theme = `Custom: ${customThemeVal}`;
    goToWizardStep(4);
  });
  
  customThemeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnConfirmCustomTheme.click();
    }
  });
  
  // Back buttons
  btnBackEngine.addEventListener("click", () => goToWizardStep(1));
  btnBackTheme.addEventListener("click", () => {
    // Hide custom theme row when going back
    document.getElementById("custom-theme-row").style.display = "none";
    goToWizardStep(2);
  });
  btnBackGestures.addEventListener("click", () => goToWizardStep(3));
  
  // Confirm gestures binding
  btnNextGestures.addEventListener("click", () => {
    const selected = [];
    document.querySelectorAll("#step-panel-gestures input[type='checkbox']:checked").forEach(cb => {
      selected.push(cb.value);
    });
    
    // Read custom gesture typed input
    const wizardCustomGestureInput = document.getElementById("wizard-custom-gesture-input");
    const customGesture = wizardCustomGestureInput.value.trim();
    if (customGesture) {
      selected.push(`Custom: ${customGesture}`);
    }
    
    if (selected.length === 0) {
      selected.push("Keyboard Fallbacks Only");
    }
    creatorState.gestureMapping = selected.join(", ");
    
    // Go to Step 5: Character Selector
    goToWizardStep(5);
  });

  // Step 5: Character Selection Cards
  document.querySelectorAll("#step-panel-character .asset-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#step-panel-character .asset-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      creatorState.characterAsset = card.getAttribute("data-value");
      setTimeout(() => goToWizardStep(6), 250);
    });
  });

  // Step 6: Background Selection Cards
  document.querySelectorAll("#step-panel-background .asset-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#step-panel-background .asset-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      creatorState.backgroundAsset = card.getAttribute("data-value");
      setTimeout(() => goToWizardStep(7), 250);
    });
  });

  // Step 7: Obstacle Selection Cards
  document.querySelectorAll("#step-panel-obstacle .asset-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#step-panel-obstacle .asset-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      creatorState.obstacleAsset = card.getAttribute("data-value");
      wizardProgressFill.style.width = "100%";
      setTimeout(() => triggerPlanGeneration(), 250);
    });
  });

  // Step 5-7 Back Buttons
  btnBackCharacter.addEventListener("click", () => goToWizardStep(4));
  btnBackBackground.addEventListener("click", () => goToWizardStep(5));
  btnBackObstacle.addEventListener("click", () => goToWizardStep(6));
}

// Trigger Plan generation via Gemini endpoint
async function triggerPlanGeneration(feedback = null) {
  creatorState.step = 'plan';
  
  // Smoothly slide layout to state-split!
  workspace.className = "workspace state-split";
  
  // Display chatbot items (header, input, logs)
  chatPaneHeader.style.display = "flex";
  chatLog.style.display = "flex";
  chatForm.style.display = "flex";
  
  // Hide wizard panels
  wizardContainer.style.display = "none";
  
  // Display Plan Pane on the right
  planContainer.style.display = "flex";
  sandboxContainer.style.display = "none";
  
  // Show plan spinner loader
  planMarkdownContainer.innerHTML = `
    <div class="plan-loading">
      <div class="spinner"></div>
      <p>${feedback ? "Regenerating plan based on review notes..." : "Analyzing system specs and drafting implementation plan..."}</p>
    </div>
  `;
  
  typingIndicator.style.display = "flex";
  chatLog.scrollTop = chatLog.scrollHeight;
  
  try {
    const response = await fetch("/api/generate-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: creatorState.name,
        theme: creatorState.theme,
        engineType: creatorState.engineType,
        gameplayDesc: creatorState.gameplayDesc,
        gestureMapping: creatorState.gestureMapping,
        characterAsset: creatorState.characterAsset,
        backgroundAsset: creatorState.backgroundAsset,
        obstacleAsset: creatorState.obstacleAsset,
        previousPlan: creatorState.implementationPlan,
        revisionFeedback: feedback
      })
    });
    
    if (!response.ok) {
      throw new Error(`Plan compiler returned status ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.plan) {
      throw new Error("Payload did not contain plan markdown.");
    }
    
    creatorState.implementationPlan = data.plan;
    
    // Attempt to extract title/name from markdown
    const titleMatch = data.plan.match(/# (Implementation Plan:\s*)?(.*)/i);
    if (titleMatch && titleMatch[2]) {
      creatorState.name = titleMatch[2].replace(/Implementation Plan:\s*/i, '').trim();
    }
    if (!creatorState.name) {
      creatorState.name = "Custom Gesture Game";
    }
    
    // Render markdown to pane
    planMarkdownContainer.innerHTML = renderMarkdown(data.plan);
    
    typingIndicator.style.display = "none";
    
    // Send feedback notice to chat log
    const glitchNotice = feedback 
      ? `⚡ **Plan updated successfully!** ⚡\n\nI have integrated your design notes into the revision plan. Look it over, or click **Proceed & Build Game** to compile code!`
      : `🤖 **Protocol Node online!** 🤖\n\nI have generated a structured **Implementation Plan** on the right side sandbox detailing the execution tasks.\n\nReview the input mappings and systems architecture. You can write adjustments in the feedback textarea, or click **Proceed & Build Game** to launch compilation!`;
      
    appendMessage("glitch", glitchNotice);
    chatHistory.push({ sender: 'glitch', text: glitchNotice });
    
  } catch (err) {
    console.error(err);
    typingIndicator.style.display = "none";
    planMarkdownContainer.innerHTML = `
      <div class="plan-loading" style="color: var(--primary-accent);">
        <p>⚠️ **Plan Draft Failed**: ${err.message}</p>
      </div>
    `;
    appendMessage("glitch", `⚠️ **Mainframe Plan Compilation Failed** ⚠️\n\nError details: *${err.message}*.\n\nPlease describe changes to retry!`);
  }
}

// Trigger Game Code compilation via Gemini endpoint
async function triggerGameCompilation() {
  creatorState.step = 'compiling';
  
  // Transition Plan pane away, show Sandbox pane
  planContainer.style.display = "none";
  sandboxContainer.style.display = "block";
  consoleLog.style.display = "flex";
  
  btnRunAgent.disabled = true;
  typingIndicator.style.display = "flex";
  chatLog.scrollTop = chatLog.scrollHeight;
  
  logConsole("Initiating approved implementation protocol...", "info");
  logConsole(`Target Stack: ${creatorState.engineType}`, "info");
  logConsole("Binding MediaPipe telemetry listener postMessage routes...", "info");
  logConsole("Contacting compiler nodes for code assembly...", "info");
  
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
        gestureMapping: creatorState.gestureMapping,
        characterAsset: creatorState.characterAsset,
        backgroundAsset: creatorState.backgroundAsset,
        obstacleAsset: creatorState.obstacleAsset,
        implementationPlan: creatorState.implementationPlan
      })
    });
    
    if (!response.ok) {
      throw new Error(`Compiler assembly cluster returned status ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.html) {
      throw new Error("No assembly code payload returned from endpoint.");
    }
    
    logConsole("Core assembly complete! Game code generated.", "success");
    logConsole("Mounting sandboxed iframe viewport...", "success");
    
    creatorState.currentCode = data.html;
    
    sandboxPlaceholder.style.display = "none";
    gameFrame.style.display = "block";
    gameFrame.srcdoc = data.html;
    
    // Auto-switch to Playtest Sandbox tab on mobile viewports
    switchWorkspaceTab("preview");
    
    previewGameName.textContent = creatorState.name;
    btnPublishGame.disabled = false;
    btnRunAgent.disabled = false;
    creatorState.step = 'iterative';
    
    typingIndicator.style.display = "none";
    appendMessage("glitch", `🎉 **BOOM! Mainframe online!** 🎉\n\nYour game **${creatorState.name}** has compiled successfully and is running in the sandbox on the right!\n\nYou can use keyboard **WASD / Arrow Keys / Space** to test it right now. If you want to play test body gestures, click **"Enable Camera"** in the top right.\n\n**If you want to tweak anything (e.g. 'make the speed faster', 'change colors to orange'), just tell me here!**`);
    chatHistory.push({ sender: 'glitch', text: `Game Compiled: ${creatorState.name}` });
    
  } catch (err) {
    logConsole(`Assembly Failure: ${err.message}`, "error");
    typingIndicator.style.display = "none";
    appendMessage("glitch", `❌ **Mainframe Assembly Compile Error!** ❌\n\nIt looks like my compiler hit an anomaly: *${err.message}*.\n\nPlease describe changes or type revisions to retry!`);
    creatorState.step = 'plan'; // fall back to plan phase
    sandboxContainer.style.display = "none";
    planContainer.style.display = "flex";
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

    // Auto-switch to Playtest Sandbox tab on mobile/tablet viewports
    switchWorkspaceTab("preview");

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
    /\b(ninja|fruit|slic(e|es|ed|ing)|katana|slash|blade|bomb)\b/i.test(highSignal) ||
    /\b(fruit|bomb|slic(e|es|ed|ing)|slash)\b/i.test(codeText)
  ) {
    gameType = 'slice';
  } else if (
    /\b(knif(e|es)|knives|throw|throws|throwing|wheel|target)\b/i.test(highSignal) ||
    /\b(knif(e|es)|knives|targetwheel|wheelangle|throwknife)\b/i.test(codeText)
  ) {
    gameType = 'knife';
  } else if (
    /\b(dodge|dodg(e|es|ed|ing)|block|blocks|fall|falling|falls|obstacle|obstacles|avoid|avoiding)\b/i.test(highSignal) ||
    /\b(dodge|obstacle|obstacles|falling)\b/i.test(codeText)
  ) {
    gameType = 'dodge';
  } else if (
    /\b(paper|io|captur(e|es|ed|ing)|territor(y|ies)|trail|trails|grid|grids)\b/i.test(highSignal) ||
    /\b(paper\.io|paperio|territory|trail)\b/i.test(codeText)
  ) {
    gameType = 'capture';
  } else if (
    /\b(space|spaceship|spaceships|shoot|shooter|shooting|laser|lasers|galaxy|alien|aliens|invader|invaders|raider)\b/i.test(highSignal) ||
    /\b(space|spaceship|spaceships|shoot|laser)\b/i.test(codeText)
  ) {
    gameType = 'space';
  } else if (
    /\b(dino|dinosaur|runner|run|jumping|cactus|cacti|scroller)\b/i.test(highSignal) ||
    /\b(dino|runner|cactus)\b/i.test(codeText)
  ) {
    gameType = 'runner';
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
  } else if (gameType === 'space') {
    cards[0].querySelector(".thumbnail-label").textContent = "Cosmic Fleet";
    cards[1].querySelector(".thumbnail-label").textContent = "Laser Blaster";
    cards[2].querySelector(".thumbnail-label").textContent = "Galaxy Raider";
    cards[3].querySelector(".thumbnail-label").textContent = "Starfield Defense";
  } else if (gameType === 'runner') {
    cards[0].querySelector(".thumbnail-label").textContent = "Neon Dino";
    cards[1].querySelector(".thumbnail-label").textContent = "Cyber Cactus";
    cards[2].querySelector(".thumbnail-label").textContent = "Jump Obstacle";
    cards[3].querySelector(".thumbnail-label").textContent = "Infinite Scroller";
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
  } else if (gameType === 'space') {
    // Spaceship and laser upward
    ctx0.strokeStyle = parsedColors.secondary;
    ctx0.lineWidth = 3;
    ctx0.shadowColor = parsedColors.secondary;
    ctx0.shadowBlur = 10;
    // Ship triangle
    ctx0.beginPath();
    ctx0.moveTo(canvas0.width / 2, 90);
    ctx0.lineTo(canvas0.width / 2 - 15, 125);
    ctx0.lineTo(canvas0.width / 2 + 15, 125);
    ctx0.closePath();
    ctx0.stroke();
    // Laser line
    ctx0.strokeStyle = parsedColors.primary;
    ctx0.shadowColor = parsedColors.primary;
    ctx0.lineWidth = 4;
    ctx0.beginPath();
    ctx0.moveTo(canvas0.width / 2, 80);
    ctx0.lineTo(canvas0.width / 2, 25);
    ctx0.stroke();
  } else if (gameType === 'runner') {
    // Ground line and small jumping rectangle
    ctx0.strokeStyle = '#00ff66';
    ctx0.lineWidth = 2;
    ctx0.shadowColor = '#00ff66';
    ctx0.shadowBlur = 8;
    ctx0.beginPath();
    ctx0.moveTo(10, 115);
    ctx0.lineTo(210, 115);
    ctx0.stroke();
    // Dino rect jumping
    ctx0.fillStyle = '#00e5ff';
    ctx0.shadowColor = '#00e5ff';
    ctx0.fillRect(45, 65, 20, 25);
    // Obstacle
    ctx0.fillStyle = '#ff0055';
    ctx0.shadowColor = '#ff0055';
    ctx0.fillRect(150, 95, 10, 20);
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
  } else if (gameType === 'space') {
    // Laser blaster crosshair
    ctx1.strokeStyle = parsedColors.primary;
    ctx1.lineWidth = 3;
    ctx1.shadowColor = parsedColors.primary;
    ctx1.shadowBlur = 10;
    ctx1.beginPath();
    ctx1.arc(canvas1.width / 2, canvas1.height / 2 - 15, 25, 0, Math.PI * 2);
    ctx1.stroke();
    ctx1.beginPath();
    ctx1.moveTo(canvas1.width / 2 - 35, canvas1.height / 2 - 15);
    ctx1.lineTo(canvas1.width / 2 + 35, canvas1.height / 2 - 15);
    ctx1.moveTo(canvas1.width / 2, canvas1.height / 2 - 50);
    ctx1.lineTo(canvas1.width / 2, canvas1.height / 2 + 20);
    ctx1.stroke();
  } else if (gameType === 'runner') {
    // Big Cyber Cactus
    ctx1.fillStyle = '#ff0055';
    ctx1.shadowColor = '#ff0055';
    ctx1.shadowBlur = 10;
    ctx1.fillRect(canvas1.width / 2 - 6, canvas1.height / 2 - 35, 12, 50);
    // side branches
    ctx1.fillRect(canvas1.width / 2 - 18, canvas1.height / 2 - 20, 12, 6);
    ctx1.fillRect(canvas1.width / 2 - 18, canvas1.height / 2 - 20, 6, 12);
    ctx1.fillRect(canvas1.width / 2 + 6, canvas1.height / 2 - 10, 12, 6);
    ctx1.fillRect(canvas1.width / 2 + 12, canvas1.height / 2 - 10, 6, 12);
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
  } else if (gameType === 'space') {
    // Flying enemy spaceships
    ctx2.strokeStyle = parsedColors.primary;
    ctx2.lineWidth = 2;
    ctx2.shadowColor = parsedColors.primary;
    ctx2.shadowBlur = 10;
    // Enemy ship 1 (diamond shape)
    ctx2.beginPath();
    ctx2.moveTo(70, 75);
    ctx2.lineTo(90, 90);
    ctx2.lineTo(70, 105);
    ctx2.lineTo(50, 90);
    ctx2.closePath();
    ctx2.stroke();
    // Enemy ship 2
    ctx2.beginPath();
    ctx2.moveTo(130, 75);
    ctx2.lineTo(150, 90);
    ctx2.lineTo(130, 105);
    ctx2.lineTo(110, 90);
    ctx2.closePath();
    ctx2.stroke();
  } else if (gameType === 'runner') {
    // Jump obstacle prompt visual
    ctx2.strokeStyle = parsedColors.secondary;
    ctx2.lineWidth = 2;
    ctx2.shadowColor = parsedColors.secondary;
    ctx2.shadowBlur = 10;
    ctx2.beginPath();
    ctx2.arc(canvas2.width / 2, canvas2.height / 2 - 15, 30, Math.PI, 0, false);
    ctx2.stroke();
    // Dino jumping curve arrows
    ctx2.fillStyle = parsedColors.primary;
    ctx2.shadowColor = parsedColors.primary;
    ctx2.fillRect(canvas2.width / 2 - 40, canvas2.height / 2 - 15, 10, 10);
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
  } else if (gameType === 'space') {
    // Starfield and player ship at bottom
    ctx3.fillStyle = "#fff";
    for (let i = 0; i < 15; i++) {
      ctx3.fillRect(Math.random() * canvas3.width, Math.random() * canvas3.height, 1.5, 1.5);
    }
    ctx3.strokeStyle = parsedColors.secondary;
    ctx3.lineWidth = 3;
    ctx3.shadowBlur = 10;
    ctx3.shadowColor = parsedColors.secondary;
    ctx3.beginPath();
    ctx3.moveTo(canvas3.width / 2, 100);
    ctx3.lineTo(canvas3.width / 2 - 12, 125);
    ctx3.lineTo(canvas3.width / 2 + 12, 125);
    ctx3.closePath();
    ctx3.stroke();
  } else if (gameType === 'runner') {
    // Horizontal scrolling lines
    ctx3.strokeStyle = "rgba(255,255,255,0.06)";
    ctx3.lineWidth = 1;
    for (let y = 30; y < canvas3.height - 30; y += 15) {
      ctx3.beginPath(); ctx3.moveTo(0, y); ctx3.lineTo(canvas3.width, y); ctx3.stroke();
    }
    // Ground and Dino running
    ctx3.strokeStyle = '#00ff66';
    ctx3.lineWidth = 2;
    ctx3.beginPath(); ctx3.moveTo(10, 125); ctx3.lineTo(210, 125); ctx3.stroke();
    ctx3.fillStyle = '#00e5ff';
    ctx3.fillRect(55, 100, 16, 25);
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

// Helper to switch workspace tabs programmatically on mobile/tablet
function switchWorkspaceTab(tabName) {
  const btn = document.querySelector(`.w-tab-btn[data-target="${tabName}"]`);
  if (btn) {
    btn.click();
  }
}

// Setup welcome screen bubble & wizard initialization
window.addEventListener("DOMContentLoaded", () => {
  // Mobile / Tablet Tab switching logic
  const workspaceTabs = document.querySelectorAll(".w-tab-btn");
  const chatPane = document.getElementById("chat-pane");
  const previewPane = document.getElementById("preview-pane");

  workspaceTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      workspaceTabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      
      const target = btn.getAttribute("data-target");
      if (target === "chat") {
        chatPane.classList.add("active");
        previewPane.classList.remove("active");
      } else {
        previewPane.classList.add("active");
        chatPane.classList.remove("active");
      }
    });
  });

  // Suggest Plan adjustments binding
  btnSuggestChanges.addEventListener("click", () => {
    const feedbackText = planFeedbackInput.value.trim();
    if (!feedbackText) return;
    planFeedbackInput.value = "";
    triggerPlanGeneration(feedbackText);
  });

  planFeedbackInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      btnSuggestChanges.click();
    }
  });

  // Proceed & Compile build binding
  btnProceedBuild.addEventListener("click", () => {
    triggerGameCompilation();
  });

  // Init Wizard State Machine
  initWizard();
  goToWizardStep(1);

  // Form chat handler
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    submitUserChatMessage(text);
  });

  // Pre-load welcome bubble text in the chat-log
  appendMessage("glitch", welcomeText);
  chatHistory.push({ sender: 'glitch', text: welcomeText });
  logConsole("Node workspace online. Wizard protocol loaded.");

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
      console.error("Failed to bind iframe error handlers:", err);
    }
  });
});

// Procedurally render preview shapes on card canvases in wizard panels
function drawWizardPreviews(type) {
  const desc = (creatorState.gameplayDesc || '').toLowerCase();
  const isDino = /\b(dino|dinosaur|runner|run|jumping|cactus|cacti|scroller)\b/i.test(desc);

  // Update card labels first
  if (type === 'character') {
    const labels = isDino 
      ? ["T-Rex (Default)", "Cyber Raptor", "Mecha Pterodactyl", "Plesiosaur"]
      : ["Star Fighter (Default)", "Heavy Dreadnought", "Vanguard Speeder", "Orbit Sentinel"];
    for (let i = 0; i < 4; i++) {
      const lbl = document.getElementById(`lbl-char-${i}`);
      if (lbl) lbl.textContent = labels[i];
    }
  } else if (type === 'background') {
    const labels = isDino
      ? ["Cyber Mountains", "Matrix Rain", "Grid Floor", "Nebula Clouds"]
      : ["Deep Starfield", "Asteroid Belt", "Grid Tunnel", "Nebula Storm"];
    for (let i = 0; i < 4; i++) {
      const lbl = document.getElementById(`lbl-bg-${i}`);
      if (lbl) lbl.textContent = labels[i];
    }
  } else if (type === 'obstacle') {
    const labels = isDino
      ? ["Neon Cacti", "Spike Wheel", "Laser Gate", "Flying Drone"]
      : ["Invader Octagon", "Spike Drone", "Scout Cruiser", "Warp Destroyer"];
    for (let i = 0; i < 4; i++) {
      const lbl = document.getElementById(`lbl-obs-${i}`);
      if (lbl) lbl.textContent = labels[i];
    }
  }

  // Define drawing on the canvases
  for (let i = 0; i < 4; i++) {
    let canvasId = `canvas-${type.substring(0, 4) === 'char' ? 'char' : type.substring(0, 2) === 'ba' ? 'bg' : 'obs'}-${i}`;
    let canvas = document.getElementById(canvasId);
    if (!canvas) continue;
    let ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#030305';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(canvas.width / 120, canvas.height / 90);

    // Color theme defaults
    const pColor = '#00e5ff'; // Cyan
    const aColor = '#ff0055'; // Pink

    if (type === 'character') {
      ctx.fillStyle = pColor;
      ctx.shadowColor = pColor;
      ctx.shadowBlur = 4;
      if (isDino) {
        // Dino Character Option Previews (mimicking the in-game assets, translated/centered)
        ctx.save();
        ctx.translate(45, 25);
        if (i === 0) {
          // 1. T-Rex (Default)
          ctx.fillRect(14, 0, 16, 12);
          ctx.fillRect(20, 12, 10, 3);
          ctx.fillStyle = '#030603'; ctx.fillRect(24, 3, 3, 3);
          ctx.fillStyle = pColor;
          ctx.fillRect(8, 12, 10, 18);
          ctx.fillRect(2, 16, 12, 14);
          ctx.fillRect(18, 18, 4, 3);
          ctx.fillRect(0, 20, 2, 4);
          ctx.fillRect(2, 22, 2, 4);
          ctx.fillRect(4, 24, 2, 4);
          ctx.fillRect(6, 26, 2, 4);
          ctx.fillRect(5, 30, 3, 10);
          ctx.fillRect(12, 30, 3, 10);
        } else if (i === 1) {
          // 2. Cyber Raptor (Fast, low)
          ctx.fillRect(16, 5, 14, 8);
          ctx.fillStyle = '#030603'; ctx.fillRect(24, 7, 2, 2);
          ctx.fillStyle = pColor;
          ctx.fillRect(6, 12, 16, 14);
          ctx.fillRect(0, 14, 6, 4);
          ctx.fillRect(6, 26, 3, 14);
          ctx.fillRect(14, 26, 3, 14);
        } else if (i === 2) {
          // 3. Mecha Pterodactyl (Wings)
          ctx.fillRect(10, 16, 14, 8);
          ctx.fillRect(24, 16, 6, 4);
          ctx.fillRect(6, 2, 4, 15);
          ctx.fillRect(16, 2, 4, 15);
          ctx.fillRect(12, 24, 2, 8);
          ctx.fillRect(18, 24, 2, 8);
        } else if (i === 3) {
          // 4. Plesiosaur (Sea long neck)
          ctx.fillRect(2, 20, 26, 12);
          ctx.fillRect(20, 4, 6, 18);
          ctx.fillRect(22, 2, 8, 5);
          ctx.fillStyle = '#030603'; ctx.fillRect(26, 3, 2, 2);
          ctx.fillStyle = pColor;
          ctx.fillRect(4, 32, 6, 8);
          ctx.fillRect(18, 32, 6, 8);
        }
        ctx.restore();
      } else {
        // Space Fighter Character Option Previews
        if (i === 0) {
          // 1. Star Fighter (Default)
          ctx.beginPath(); ctx.moveTo(60, 20); ctx.lineTo(80, 60); ctx.lineTo(40, 60); ctx.closePath(); ctx.fill();
        } else if (i === 1) {
          // 2. Heavy Dreadnought
          ctx.fillRect(40, 25, 40, 30);
          ctx.fillRect(52, 15, 16, 10); // dual cannons
        } else if (i === 2) {
          // 3. Speeder (Triangular wings)
          ctx.beginPath(); ctx.moveTo(60, 15); ctx.lineTo(90, 50); ctx.lineTo(75, 60); ctx.lineTo(45, 60); ctx.lineTo(30, 50); ctx.closePath(); ctx.fill();
        } else if (i === 3) {
          // 4. Sentinel (Circular saucer)
          ctx.beginPath(); ctx.arc(60, 40, 22, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(60, 40, 12, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (type === 'background') {
      if (isDino) {
        // Dino Background Options Previews
        if (i === 0) {
          // 1. Cyber Mountains
          ctx.strokeStyle = '#9900ff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 4; ctx.shadowColor = '#9900ff';
          ctx.beginPath(); ctx.moveTo(10, 65); ctx.lineTo(50, 25); ctx.lineTo(90, 65); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, 65); ctx.lineTo(120, 65); ctx.stroke();
        } else if (i === 1) {
          // 2. Matrix Rain
          ctx.fillStyle = '#00ff66'; ctx.shadowColor = '#00ff66'; ctx.shadowBlur = 3;
          for (let r = 0; r < 6; r++) {
            ctx.fillRect(20 + r * 16, 15 + (r % 3) * 15, 2, 20);
          }
        } else if (i === 2) {
          // 3. Grid Floor
          ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 1;
          for (let gx = 10; gx < 120; gx += 20) {
            ctx.beginPath(); ctx.moveTo(gx, 70); ctx.lineTo(gx - 8, 90); ctx.stroke();
          }
          ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(120, 70); ctx.stroke();
        } else if (i === 3) {
          // 4. Nebula Clouds
          let grad = ctx.createRadialGradient(60, 45, 10, 60, 45, 40);
          grad.addColorStop(0, 'rgba(179, 0, 255, 0.4)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad; ctx.fillRect(0, 0, 120, 90);
        }
      } else {
        // Space Background Options Previews
        if (i === 0) {
          // 1. Deep Starfield
          ctx.fillStyle = '#fff'; ctx.shadowBlur = 2; ctx.shadowColor = '#fff';
          for (let s = 0; s < 12; s++) {
            ctx.fillRect(15 + (s * 9) % 90, 10 + (s * 13) % 70, 2, 2);
          }
        } else if (i === 1) {
          // 2. Asteroid Belt
          ctx.fillStyle = '#888';
          ctx.beginPath(); ctx.arc(35, 40, 8, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(75, 45, 12, 0, Math.PI*2); ctx.fill();
        } else if (i === 2) {
          // 3. Grid Tunnel
          ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1;
          ctx.strokeRect(30, 20, 60, 50);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 20); ctx.moveTo(120, 0); ctx.lineTo(90, 20);
          ctx.moveTo(0, 90); ctx.lineTo(30, 70); ctx.moveTo(120, 90); ctx.lineTo(90, 70); ctx.stroke();
        } else if (i === 3) {
          // 4. Nebula Storm
          let grad = ctx.createRadialGradient(70, 30, 5, 70, 30, 45);
          grad.addColorStop(0, 'rgba(255, 0, 85, 0.3)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad; ctx.fillRect(0, 0, 120, 90);
        }
      }
    } else if (type === 'obstacle') {
      ctx.fillStyle = aColor;
      ctx.shadowColor = aColor;
      ctx.shadowBlur = 4;
      if (isDino) {
        // Dino Obstacle Options Previews
        if (i === 0) {
          // 1. Neon Cacti
          ctx.fillRect(56, 25, 8, 40);
          ctx.fillRect(45, 35, 12, 5); ctx.fillRect(45, 25, 5, 15);
        } else if (i === 1) {
          // 2. Spike Wheel
          ctx.strokeStyle = aColor; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(60, 45, 14, 0, Math.PI*2); ctx.stroke();
          ctx.fillRect(58, 25, 4, 40);
          ctx.fillRect(40, 43, 40, 4);
        } else if (i === 2) {
          // 3. Laser Gate
          ctx.fillRect(35, 20, 8, 50);
          ctx.fillRect(77, 20, 8, 50);
          ctx.fillStyle = '#ffea00'; ctx.fillRect(43, 42, 34, 4); // laser beam
        } else if (i === 3) {
          // 4. Cyber Drone
          ctx.fillRect(45, 30, 30, 12);
          ctx.fillRect(52, 42, 16, 5); // landing gear
          ctx.fillStyle = pColor; ctx.fillRect(50, 26, 20, 4); // rotor
        }
      } else {
        // Space Enemy Options Previews
        if (i === 0) {
          // 1. Invader Octagon (Classic Alien)
          ctx.fillRect(45, 30, 30, 25);
          ctx.fillStyle = '#030603'; ctx.fillRect(50, 35, 5, 5); ctx.fillRect(65, 35, 5, 5);
        } else if (i === 1) {
          // 2. Spike Drone
          ctx.beginPath(); ctx.arc(60, 40, 14, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(42, 38, 36, 4); ctx.fillRect(58, 22, 4, 36);
        } else if (i === 2) {
          // 3. Scout Cruiser
          ctx.beginPath(); ctx.moveTo(40, 30); ctx.lineTo(80, 30); ctx.lineTo(70, 50); ctx.lineTo(50, 50); ctx.closePath(); ctx.fill();
        } else if (i === 3) {
          // 4. Warp Destroyer
          ctx.beginPath(); ctx.moveTo(60, 50); ctx.lineTo(80, 20); ctx.lineTo(60, 35); ctx.lineTo(40, 20); ctx.closePath(); ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}
