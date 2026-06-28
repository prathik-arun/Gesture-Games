const express = require('express');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();
const { initGeminiProxy } = require('./gemini-proxy');
const fallbacks = require('./fallbacks');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON request body parsing with larger size limit for code transfers
app.use(express.json({ limit: '10mb' }));

// Serve static assets from the project root directory
app.use(express.static(path.join(__dirname, '..')));

// Route for health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Helper for wordlist fallbacks
function getFallbackWords(topic) {
  const t = (topic || '').toLowerCase();
  const movies = [
    "Titanic", "Harry Potter", "Spider-Man", "Jurassic Park", "Home Alone",
    "The Lion King", "Avatar", "Batman", "Iron Man", "Toy Story",
    "Finding Nemo", "The Matrix", "Star Wars", "Frozen", "Shrek",
    "Jaws", "Ghostbusters", "Pirates of the Caribbean"
  ];
  const animals = [
    "Kangaroo", "Elephant", "Giraffe", "Monkey", "Penguin",
    "Lion", "Crocodile", "Frog", "Shark", "Snake",
    "Crab", "Rabbit", "Dinosaur", "Dog", "Cat",
    "Eagle", "Spider", "Bee"
  ];
  const sports = [
    "Soccer", "Basketball", "Tennis", "Baseball", "Cricket",
    "Swimming", "Boxing", "Golf", "Volleyball", "Skating",
    "Bowling", "Archery", "Karate", "Running", "Gymnastics",
    "Surfing", "Skiing", "Cycling"
  ];
  const defaultList = [
    "Drinking water", "Brushing teeth", "Cooking", "Driving a car", "Sleeping",
    "Taking a selfie", "Crying", "Laughing", "Dancing", "Playing guitar",
    "Flying a kite", "Fishing", "Reading a book", "Walking a dog", "Typing on computer",
    "Painting", "Sweeping the floor", "Shopping"
  ];

  if (t.includes('movie') || t.includes('film') || t.includes('show')) {
    return movies;
  }
  if (t.includes('animal') || t.includes('pet') || t.includes('bird') || t.includes('fish')) {
    return animals;
  }
  if (t.includes('sport') || t.includes('game') || t.includes('play')) {
    return sports;
  }
  return defaultList;
}

function applyThemeToTemplate(html, theme, name, characterAsset, backgroundAsset, obstacleAsset) {
  let primary = '#00e5ff'; // Cyan
  let accent = '#ff0055'; // Pink
  let border = '#00ff66'; // Green
  let bg = '#050508'; // Dark bg
  let mtn1 = '#160028';
  let mtn2 = '#0d001a';
  let mtnOutline = '#7700cc';

  const t = (theme || '').toLowerCase();

  if (t.includes('matrix') || t.includes('acid') || t.includes('green')) {
    primary = '#00ff22';
    accent = '#00cc11';
    border = '#00ff66';
    bg = '#020d02';
    mtn1 = '#021802';
    mtn2 = '#010c01';
    mtnOutline = '#00ff22';
  } else if (t.includes('steel') || t.includes('industrial') || t.includes('orange') || t.includes('gray')) {
    primary = '#ff9800';
    accent = '#ffc107';
    border = '#ff5722';
    bg = '#111315';
    mtn1 = '#202326';
    mtn2 = '#15171a';
    mtnOutline = '#ff9800';
  } else if (t.includes('ocean') || t.includes('breeze') || t.includes('blue') || t.includes('teal')) {
    primary = '#00e5ff';
    accent = '#2196f3';
    border = '#009688';
    bg = '#020b14';
    mtn1 = '#04172a';
    mtn2 = '#020e1a';
    mtnOutline = '#00e5ff';
  } else {
    // Check for color words in custom theme inputs
    const colors = {
      red: '#ff003c',
      blue: '#0066ff',
      green: '#00ff66',
      yellow: '#ffea00',
      orange: '#ff9800',
      purple: '#b300ff',
      violet: '#b300ff',
      pink: '#ff0077',
      cyan: '#00e5ff',
      teal: '#00e1d9',
      white: '#ffffff',
      gold: '#ffd700',
      reddish: '#ff003c',
      bluish: '#0066ff',
      greenish: '#00ff66',
      yellowish: '#ffea00'
    };

    const matchedColors = [];
    Object.keys(colors).forEach(cName => {
      if (t.includes(cName)) {
        matchedColors.push(colors[cName]);
      }
    });

    if (matchedColors.length >= 1) {
      primary = matchedColors[0];
      accent = matchedColors[1] || matchedColors[0];
      border = matchedColors[2] || matchedColors[0];

      // Simple dark shade conversion for background
      if (primary.startsWith('#')) {
        const r = parseInt(primary.slice(1,3), 16);
        const g = parseInt(primary.slice(3,5), 16);
        const b = parseInt(primary.slice(5,7), 16);
        bg = `rgb(${Math.max(2, Math.floor(r * 0.05))}, ${Math.max(2, Math.floor(g * 0.05))}, ${Math.max(2, Math.floor(b * 0.05))})`;
        mtn1 = `rgb(${Math.max(5, Math.floor(r * 0.15))}, ${Math.max(5, Math.floor(g * 0.15))}, ${Math.max(5, Math.floor(b * 0.15))})`;
        mtn2 = `rgb(${Math.max(3, Math.floor(r * 0.1))}, ${Math.max(3, Math.floor(g * 0.1))}, ${Math.max(3, Math.floor(b * 0.1))})`;
        mtnOutline = primary;
      }
    }
  }

  let customizedHtml = html;

  // Replace Title/Header texts with the actual user's custom game name
  if (name) {
    customizedHtml = customizedHtml.replace(/<title>.*?<\/title>/g, `<title>${name}</title>`);
    customizedHtml = customizedHtml.replace(/<h1>Neon Dino Runner<\/h1>/g, `<h1>${name}</h1>`);
    customizedHtml = customizedHtml.replace(/<h1>Neon Space Raider<\/h1>/g, `<h1>${name}</h1>`);
    customizedHtml = customizedHtml.replace(/<h1>Neon Block Dodge<\/h1>/g, `<h1>${name}</h1>`);
    customizedHtml = customizedHtml.replace(/<h1>Neon Grid Capture<\/h1>/g, `<h1>${name}</h1>`);
    customizedHtml = customizedHtml.replace(/<h1>Neon Knife Hit<\/h1>/g, `<h1>${name}</h1>`);
    customizedHtml = customizedHtml.replace(/<h1>Gesture Ninja Slicer<\/h1>/g, `<h1>${name}</h1>`);
    customizedHtml = customizedHtml.replace(/<h1>Grid Capture<\/h1>/g, `<h1>${name}</h1>`);
  }

  // Replace CSS variables declarations inside style block
  customizedHtml = customizedHtml.replace(/--primary-color:\s*[^;]+;/g, `--primary-color: ${primary};`);
  customizedHtml = customizedHtml.replace(/--accent-color:\s*[^;]+;/g, `--accent-color: ${accent};`);
  customizedHtml = customizedHtml.replace(/--border-color:\s*[^;]+;/g, `--border-color: ${border};`);
  customizedHtml = customizedHtml.replace(/--bg-color-dark:\s*[^;]+;/g, `--bg-color-dark: ${bg};`);
  customizedHtml = customizedHtml.replace(/--mountain-color-1:\s*[^;]+;/g, `--mountain-color-1: ${mtn1};`);
  customizedHtml = customizedHtml.replace(/--mountain-color-2:\s*[^;]+;/g, `--mountain-color-2: ${mtn2};`);
  customizedHtml = customizedHtml.replace(/--mountain-outline:\s*[^;]+;/g, `--mountain-outline: ${mtnOutline};`);

  // Inject user selected assets templates strings replacements
  customizedHtml = customizedHtml.replace(/__CHOSEN_CHARACTER__/g, characterAsset || 'char_option_1');
  customizedHtml = customizedHtml.replace(/__CHOSEN_BACKGROUND__/g, backgroundAsset || 'bg_option_1');
  customizedHtml = customizedHtml.replace(/__CHOSEN_OBSTACLE__/g, obstacleAsset || 'obs_option_1');

  return customizedHtml;
}

// Resilient fallback chatbot simulation
function getFallbackChatResponse(message, history) {
  const msg = (message || '').toLowerCase();
  
  let name = "Custom Gesture Game";
  let engineType = "2D Canvas";
  let theme = "Neon Cyberpunk (pink/cyan)";
  let gameplayDesc = "A fun action game controlled with body movements and webcam gestures.";
  let gestureMapping = "Pinch to shoot/action, Lean to move";
  
  if (/\b(ninja|fruit|slic(e|es|ed|ing))\b/i.test(msg)) {
    name = "Gesture Ninja Slicer";
    gameplayDesc = "A fast-paced fruit slicing game where you wave your hands to slice flying fruits and avoid bombs.";
    gestureMapping = "Hands movements to slice";
  } else if (/\b(paper|io|territor(y|ies)|captur(e|es|ed|ing))\b/i.test(msg)) {
    name = "Paper.io Capture";
    gameplayDesc = "Capture cells on a 2D grid by drawing trails and returning to your home base, while avoiding colliding with trails.";
    gestureMapping = "Lean Left/Right/Center to steer";
  } else if (/\b(knif(e|es)|knives|throw|throws|throwing)\b/i.test(msg)) {
    name = "Neon Knife Hit";
    gameplayDesc = "Throw knives at a rotating target wheel in the center, sticking them safely without hitting existing knives.";
    gestureMapping = "Open mouth or pinch hand to throw knife";
  } else if (/\b(dodge|dodging|dodges|block|blocks|fall|falling|falls)\b/i.test(msg)) {
    name = "Neon Block Dodge";
    gameplayDesc = "Dodge falling blocks by moving your avatar left and right.";
    gestureMapping = "Lean left and right to dodge";
  } else if (/\b(pong|ping)\b/i.test(msg)) {
    name = "Gesture Pong";
    gameplayDesc = "A classic arcade pong game with a vertical layout, where you move your paddle to bounce the ball.";
    gestureMapping = "Lean left and right to steer paddle";
  } else if (/\b(space|spaceship|spaceships|shoot|shooter|shooting|laser|lasers|galaxy|alien|aliens|invader|invaders|raider)\b/i.test(msg)) {
    name = "Neon Space Raider";
    gameplayDesc = "Shoot laser beams at incoming alien spaceship waves.";
    gestureMapping = "Pinch fingers to shoot, move hand to steer";
  } else if (/\b(dino|dinosaur|runner|run|jumping|cactus|cacti|scroller)\b/i.test(msg)) {
    name = "Neon Dino Runner";
    gameplayDesc = "Jump over incoming obstacles and survive.";
    gestureMapping = "Open Mouth or Jump to jump";
  }


  // Count prior messages to check what stage we are in
  const welcomeCount = history ? history.filter(h => h.sender === 'glitch' || h.role === 'model').length : 0;
  
  if (welcomeCount <= 1) {
    return {
      reply: `⚡ **Neural Mainframe Standby Protocol** ⚡\n\nI'm currently experiencing network lag with my main cluster, but I can draft your design specs locally!\n\nWould you like your custom game **${name}** to use **2D Canvas** or **3D Three.js**?`,
      options: ["2D Canvas", "3D Three.js"],
      showGestureSelector: false,
      readyToCompile: false
    };
  } else if (welcomeCount === 2) {
    return {
      reply: `Got it, we will compile it in 2D Canvas. Next, pick a neon visual theme for your game covers:`,
      options: ["Neon Cyberpunk (pink/cyan)", "Acid Matrix (black/green)", "Industrial Steel (gray/orange)", "Oceanic Breeze (blue/teal)"],
      showGestureSelector: false,
      readyToCompile: false
    };
  } else if (welcomeCount === 3) {
    return {
      reply: `Theme locks complete! Let's map your physical gestures checklist panel now:`,
      options: [],
      showGestureSelector: true,
      readyToCompile: false
    };
  }

  return {
    reply: `🎉 **Mainframe offline design compiled!** 🎉\n\nI have locked the specs for **${name}** using local cache protocols. Slicing/Steering rules are now mounted. Let's initiate the compiler!`,
    options: [],
    showGestureSelector: false,
    readyToCompile: true,
    gameSpecs: {
      name: name,
      engineType: engineType,
      theme: theme,
      gameplayDesc: gameplayDesc,
      gestureMapping: gestureMapping
    }
  };
}

// Helper: Call Gemini with automatic retries for transient errors and fallback to alternative models
async function callGeminiWithRetryAndFallback(bodyData, apiKey) {
  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash'
  ];

  let lastError = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2.0s timeout per request
    
    try {
      console.log(`[Gemini] Contacting model ${model}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No content returned from Gemini API response');
      }

      // Return parsed text
      return text;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error(`[Gemini] Error with model ${model}: Request timed out (2.0s limit)`);
        lastError = new Error(`Request to model ${model} timed out`);
      } else {
        console.error(`[Gemini] Error with model ${model}:`, err.message);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('All Gemini models failed.');
}

// Endpoint to generate words using Gemini API
app.get('/api/generate-words', async (req, res) => {
  const topic = req.query.topic;
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Server] GEMINI_API_KEY is not defined. Falling back to local words.');
    return res.json({ words: getFallbackWords(topic) });
  }
  try {
    const text = await callGeminiWithRetryAndFallback({
      contents: [{
        parts: [{
          text: `Generate a list of 18 simple, highly recognizable, and guessable words or phrases for the game Dumb Charades matching the topic "${topic}". The items should be easy to act out physically without speaking. Return ONLY a JSON array of strings, for example: ["Titanic", "Iron Man", "Home Alone"]`
        }]
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, apiKey);

    const words = JSON.parse(text.trim());
    if (Array.isArray(words) && words.length > 0) {
      return res.json({ words });
    } else {
      throw new Error('Response is not a non-empty JSON array');
    }
  } catch (err) {
    console.error('[Server] Gemini word generation error:', err);
    return res.json({ words: getFallbackWords(topic) });
  }
});

// Endpoint to chat with Glitch to coordinate game specifications
app.post('/api/chat-glitch', async (req, res) => {
  const { message, history } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[Server] GEMINI_API_KEY is not defined. Falling back to local offline chat simulation...');
    const fallbackReply = getFallbackChatResponse(message, history);
    return res.json(fallbackReply);
  }

  // Convert history array to Gemini content array
  const formattedContents = [];
  if (history && Array.isArray(history)) {
    history.forEach(item => {
      formattedContents.push({
        role: item.sender === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }]
      });
    });
  }
  
  // Append current user message
  formattedContents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const systemInstruction = `You are Glitch, a friendly and highly capable AI Game Design assistant for Gesture Zone.
Your job is to chat with the user and help them design a custom gesture-controlled HTML5 game.
You must guide them through defining the following specifications:
1. Game Name (what is the game called?)
2. Engine Type (2D Canvas or 3D Three.js)
3. Visual Theme / Colors (e.g. Neon Cyberpunk, Acid Matrix, etc.)
4. Gameplay Description / Mechanics (e.g. a territory-capture game like paper.io, or dodging objects, or slicing items)
5. Gesture Mapping (which hand movements or body motions translate to game actions)

Rules:
- Be encouraging, creative, and suggest game ideas if the user mentions games like 'paper.io', 'pacman', or 'pong'. Explain how they can be modified to work with body gestures!
- Offer quick-reply options as suggestion chips by putting them in the 'options' array. For example:
  - When asking for engine type, provide options: ["2D Canvas", "3D Three.js"]
  - When asking for visual themes, provide options: ["Neon Cyberpunk (pink/cyan)", "Acid Matrix (black/green)", "Industrial Steel (gray/orange)", "Oceanic Breeze (blue/teal)", "Custom Theme..."]
- When you are ready to collect the gesture mappings, set "showGestureSelector": true. The client will render a checklist of native trackers.
- If the user selects gestures or describes them, and you have all 5 specs completed, set "readyToCompile": true and fill out the "gameSpecs" object with:
  - "name": String
  - "engineType": "2D Canvas" or "3D Three.js"
  - "theme": String
  - "gameplayDesc": String
  - "gestureMapping": String
  (Ensure gameSpecs contains all these keys so the compiler has full context!)
- If you are NOT ready to compile, set "readyToCompile": false, do not include "gameSpecs", and continue conversing.

Return ONLY a valid JSON object matching this schema:
{
  "reply": "Glitch's conversational text response (markdown formatting is supported)",
  "options": ["Option 1", "Option 2"], // Optional, list of string options to display as quick replies
  "showGestureSelector": true/false, // Optional, set to true if asking the user to map gestures
  "readyToCompile": true/false, // Set to true only when all specs are finalized
  "gameSpecs": { // Required only when readyToCompile is true
    "name": "...",
    "engineType": "...",
    "theme": "...",
    "gameplayDesc": "...",
    "gestureMapping": "..."
  }
}`;

  try {
    const text = await callGeminiWithRetryAndFallback({
      contents: formattedContents,
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    }, apiKey);

    const result = JSON.parse(text.trim());
    return res.json(result);
  } catch (err) {
    console.error('[Server] Chat-Glitch error:', err);
    try {
      console.log('[Server] Falling back to local offline chat simulation...');
      const fallbackReply = getFallbackChatResponse(message, history);
      return res.json(fallbackReply);
    } catch (fallbackErr) {
      return res.status(500).json({ error: 'Failed to communicate with Glitch: ' + err.message });
    }
  }
});

// Endpoint to generate/modify Implementation Plan using Gemini API
app.post('/api/generate-plan', async (req, res) => {
  const { name, theme, engineType, gestureMapping, gameplayDesc, previousPlan, revisionFeedback } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[Server] GEMINI_API_KEY is not defined. Deploying local fallback implementation plan...');
    const planText = `
# Implementation Plan: ${name || 'Custom Gesture Game'}

## 🎯 Executive Game Design
- **Theme**: ${theme || 'Neon Retro'}
- **Engine**: ${engineType || '2D Canvas'}
- **Gameplay**: ${gameplayDesc || 'Dodge obstacles using lean and other movements.'}

## 🕹️ Input Mapping Matrix
- **Gestures**: ${gestureMapping || 'Lean Left/Right to slide, Pinch to shoot/interact'}
- **Keyboard Fallback**: WASD / Arrow Keys, Space

## 📦 Core Systems Architecture
- **Game Loop**: requestAnimationFrame delta-time updates
- **Physics**: Basic AABB 2D collision detection
- **Audio**: Web Audio API synth sounds

## 🛠️ Development & Compile Tasks
1. Initialize Canvas and fit viewport dimensions
2. Load asset templates and configure theme color palette
3. Bind keyboard event listeners and postMessage tracking stream
4. Implement player spawn, movement limits, and score ticks
5. Deploy automated game over and restart game logic
    `.trim();
    return res.json({ plan: planText });
  }

  let prompt = '';
  if (previousPlan && revisionFeedback) {
    prompt = `You are a professional lead game systems architect.
You previously generated the following Implementation Plan for the gesture-controlled web game "${name}":

---
${previousPlan}
---

The user has the following revision comments/feedback on the plan:
"${revisionFeedback}"

Generate a revised, highly detailed, and professional Implementation Plan in Markdown incorporating this feedback. 
Ensure the plan is comprehensive, details exactly how each system component will be written, what CSS styling matching the theme will look like, and list sequential, step-by-step tasks. Do NOT output JSON. Return ONLY the raw Markdown text.`;
  } else {
    prompt = `You are a professional lead game systems architect.
Create a highly detailed, professional, and comprehensive Implementation Plan for a custom web-based gesture game with the following specifications:
- Game Name: "${name}"
- Visual Theme / Colors: "${theme}"
- Technology: "${engineType}" (2D Canvas, 3D Three.js, etc.)
- Gameplay Description: "${gameplayDesc}"
- Gesture Mapping: "${gestureMapping}"

The plan must be formatted in clean, professional Markdown (use headings, bullet points, checklists). It must contain:
1. 🎯 Executive Game Design
   - Visual Style, color palette hex codes, and detailed HUD layout.
   - Gameplay loops, speed dynamics, spawning rates, score systems, and game-over states.
2. 🕹️ Input Mapping Matrix
   - Detailed mapping of physical webcam gestures (e.g. tracking index fingers for coordinates, mouth scaling for actions, leaning offsets for steer velocity).
   - Responsive Keyboard fallback controls (WASD, Arrow Keys, Space, R to restart).
3. 📦 Core Systems Architecture
   - Detailed specifications for each code module:
     * Game Loop & Delta-Time Physics (FPS stabilization)
     * Physics Engine & Collisions (AABB boundary checking, coordinate scaling)
     * Rendering & Visual Effects (Canvas context draw, glowing shadow blurs, particles particle arrays, explosions)
     * Audio Synthesizer (Web Audio API synthesis: oscillator types, frequency shifts for laser shoot, beep, and boom explosion sounds)
     * Game State Manager (Menu, Play, GameOver states, and local storage highscores)
4. 🛠️ Sequential Compile Tasks
   - A step-by-step checklist of how the compiler will assemble the file from index setup to loops and gesture tracking binds.

Make the plan extremely detailed, verbose, and clear—just like a professional technical spec. Do NOT wrap the output in JSON or code blocks. Return ONLY the raw Markdown text.`;
  }

  try {
    const text = await callGeminiWithRetryAndFallback({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        responseMimeType: 'text/plain',
        temperature: 0.2
      }
    }, apiKey);

    return res.json({ plan: text });
  } catch (err) {
    console.error('[Server] Plan generation error:', err);
    const planText = `
# Implementation Plan: ${name || 'Custom Gesture Game'}

## 🎯 Executive Game Design
- **Theme**: ${theme || 'Neon Cyberpunk (pink/cyan)'}
- **Engine**: ${engineType || '2D Canvas'}
- **Gameplay**: ${gameplayDesc || 'Spaceship shooting game.'}

## 🕹️ Input Mapping Matrix
- **Gestures**: ${gestureMapping || 'Lean Left/Right, Pinch Fingers'}
- **Keyboard Fallback**: WASD / Arrow Keys, Space

## 📦 Core Systems Architecture
- **Game Loop**: requestAnimationFrame delta-time updates
- **Physics**: Basic AABB 2D collision detection
- **Audio**: Web Audio API synth sounds
- **Rendering**: HTML5 2D Canvas context rendering with neon bloom filters

## 🛠️ Development & Compile Tasks
1. Initialize Canvas and fit viewport dimensions
2. Load asset templates and configure theme color palette
3. Bind keyboard event listeners and postMessage tracking stream
4. Implement player spawn, movement limits, and score ticks
5. Deploy automated game over and restart game logic
    `.trim();
    return res.json({ plan: planText });
  }
});

// Endpoint to generate/modify HTML5 games using Gemini API
app.post('/api/generate-game', async (req, res) => {
  const { name, theme, engineType, gestureMapping, gameplayDesc, previousCode, revisionPrompt, implementationPlan, characterAsset, backgroundAsset, obstacleAsset } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[Server] GEMINI_API_KEY is not defined. Deploying local fallback game template...');
    const desc = ((gameplayDesc || '') + ' ' + (name || '') + ' ' + (revisionPrompt || '')).toLowerCase();
    let html = fallbacks.dodgeBlocks;
    
    if (/\b(ninja|fruit|slic(e|es|ed|ing))\b/i.test(desc)) {
      html = fallbacks.fruitNinja;
    } else if (/\b(paper|io|territor(y|ies)|captur(e|es|ed|ing))\b/i.test(desc)) {
      html = fallbacks.paperIo;
    } else if (/\b(knif(e|es)|knives|throw|throws|throwing)\b/i.test(desc)) {
      html = fallbacks.knifeHit;
    } else if (/\b(space|spaceship|spaceships|shoot|shooter|shooting|laser|lasers|galaxy|alien|aliens|invader|invaders|raider)\b/i.test(desc)) {
      html = fallbacks.spaceShooter;
    } else if (/\b(dino|dinosaur|runner|run|jumping|cactus|cacti|scroller)\b/i.test(desc)) {
      html = fallbacks.dinoRunner;
    }
    return res.json({ html: applyThemeToTemplate(html, theme, name, characterAsset, backgroundAsset, obstacleAsset) });
  }

  let prompt = '';
  if (previousCode && revisionPrompt) {
    prompt = `You are a professional HTML5 game developer. 
Your task is to modify the existing game code based on the user's revision prompt.

Existing Game Code:
\`\`\`html
${previousCode}
\`\`\`

User's Revision Request: "${revisionPrompt}"

Requirements:
1. Implement the user's request. Modify features, visual styles, colors, or core logic as requested.
2. Ensure you return the FULL, complete, working HTML code (including all styles, scripts, and libraries).
3. Do NOT omit any parts of the code. Return a single self-contained HTML file.
4. Output ONLY the raw HTML code inside a JSON object. Do not include markdown code block syntax (like \`\`\`html) in the text itself. The output format MUST be a valid JSON object matching this schema:
{
  "html": "full HTML string here"
}`;
  } else {
    prompt = `You are a professional HTML5 game developer. 
Generate a complete, self-contained, highly polished HTML5/JS game based on the following specifications and approved Implementation Plan:
- Game Name: "${name}"
- Visual Theme / Colors: "${theme}"
- Technology: "${engineType}" (e.g. "2D Canvas" or "3D Three.js" or "Phaser")
- Gameplay Description: "${gameplayDesc}"
- Gesture Mapping: "${gestureMapping}"
- Chosen Character Sprite Option: "${characterAsset || 'char_option_1'}" (Option 1: T-Rex/Fighter, Option 2: Raptor/Dreadnought, Option 3: Pterodactyl/Speeder, Option 4: Plesiosaur/Sentinel)
- Chosen Background Scene Option: "${backgroundAsset || 'bg_option_1'}" (Option 1: Hills/Stars, Option 2: Matrix/Asteroids, Option 3: Grid Floor/Tunnel, Option 4: Nebula)
- Chosen Obstacle/Enemy Option: "${obstacleAsset || 'obs_option_1'}" (Option 1: Cactus/Octagon, Option 2: Spike Wheel/Drone, Option 3: Laser Gate/Cruiser, Option 4: Cyber Drone/Warp Destroyer)

Approved Implementation Plan:
${implementationPlan || "Build the game according to standard gesture game rules."}

Requirements:
1. Provide a single, complete, copy-pasteable HTML file containing all HTML, CSS (in a <style> block), and JS (in a <script> block).
2. For 3D games, load Three.js via CDN: <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>.
3. **MUST support webcam gestures** by listening to postMessage events from the parent window. The parent broadcasts the following message payload structure:
   \`\`\`json
   {
     "walking": true/false,
     "lean": "left" | "right" | "center",
     "jump": true/false,
     "shoot": true/false,
     "mouthOpen": true/false,
     "hands": [
       { "visible": true, "x": 0.5, "y": 0.4, "isPinching": true }
     ]
   }
   \`\`\`
   Your script must listen to this event:
   \`\`\`javascript
   window.addEventListener('message', (event) => {
     const data = event.data;
     if (!data) return;
     // Map these fields to game controls (e.g. data.walking to move forward, data.lean to steer/slide, data.shoot/pinch/mouthOpen to action/shoot)
   });
   \`\`\`
4. **MUST include keyboard fallback controls** (WASD / Arrow keys, Space, R, etc.) so it can be played with or without a webcam.
5. Create a highly polished HUD displaying Score, Lives/Health, and a "Restart" button when the game ends.
6. The styling must be modern, beautiful, and theme-appropriate (e.g., using dark mode, clean typography, glow effects, nice animations).

SPECIAL GAME IMPLEMENTATION RULES:
- If building a **territory-capturing game (like paper.io style)**:
  - Do NOT draw arbitrary 3D perspective grids. Draw a clear top-down 2D canvas representing a grid of cells (e.g., 60x60 cells).
  - The player owns a starting home base of cells (e.g. a 5x5 block) of their color.
  - When moving outside home territory, draw a trail (list of coordinates).
  - When the player re-enters their home territory, convert the trail and all enclosed cells inside the trail boundary into home territory (use a simple flood-fill, cell-mapping, or polygon enclosure math).
  - If a player collides with their own trail, they die.
  - If they cross another player's or AI bot's trail, that bot dies.
  - Add 2-3 simple AI opponent bots that run around doing the same trail-drawing and territory-capturing.
  - Make trails and bases glow brightly using \`ctx.shadowBlur = 12; ctx.shadowColor = '...';\`
- If building a **Knife Hit style game**:
  - Draw a large central rotating target wheel in the upper middle of the screen.
  - Keep track of all knives currently stuck on the target wheel. Draw them rotated along with the wheel's angle.
  - Knives are thrown upwards from the bottom center. When throwing (via Space/Click/Pinch/MouthOpen), spawn a knife moving up.
  - Upon hit, calculate the collision angle relative to the wheel. Check if it overlaps within a close angle (e.g., 8-10 degrees) of any already stuck knife.
  - If it hits a stuck knife, play a crash sound and trigger game over/life lost.
  - If it hits the wood wheel safely, stick it at that relative angle, increment score, and check if all knives for the level have been thrown.
  - Implement progressive level speeds and rotating direction changes.
- If building a **Fruit Slicing game (like Gesture Ninja style)**:
  - Slicing MUST be performed by moving the hand cursor across the canvas.
  - Listen to the window \`message\` events for the \`hands\` array: if \`data.hands && data.hands.length > 0\`, use the normalized coordinates of the first hand (scale \`x * canvas.width\` and \`y * canvas.height\`) as the active slice point. Maintain a fallback checking the mouse position.
  - Maintain a history of recent coordinate points (e.g. last 5-8 points) and draw a glowing neon trail (slice line) connecting them.
  - Spawn fruits flying up from the bottom with random initial x-positions, vertical velocity, and gravity.
  - On each frame, check if the slice line segment (connecting the previous hand position to the current hand position) intersects any active fruit's circle boundary.
  - If a collision occurs, split the fruit into two half-images/drawings that fall apart dynamically, spawn glowing juice/splash particle effects, and increment score.
  - Spawn occasional bombs; if sliced, trigger a bomb explosion effect, play a boom sound, and end the game.
- **Arcade polish**:
  - Implement basic synthetic sound effects using Web Audio API (\`AudioContext\`) to play beeps, laser sounds, and boom sounds on actions (capture, crash, start).
  - Use smooth physics updates (requestAnimationFrame) and delta-time mapping so actions look silky smooth.
  - Return ONLY a valid JSON object with the generated HTML. Do not include markdown code block wrapping. The output format MUST be:
{
  "html": "full HTML string here"
}`;
  }

  try {
    const text = await callGeminiWithRetryAndFallback({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    }, apiKey);

    const result = JSON.parse(text.trim());
    return res.json(result);
  } catch (err) {
    console.error('[Server] Game generation error:', err);
    try {
      console.log('[Server] Falling back to local offline resilient game template...');
      const desc = ((gameplayDesc || '') + ' ' + (name || '') + ' ' + (revisionPrompt || '')).toLowerCase();
      let html = fallbacks.dodgeBlocks;
      
      if (/\b(ninja|fruit|slic(e|es|ed|ing))\b/i.test(desc)) {
        html = fallbacks.fruitNinja;
      } else if (/\b(paper|io|territor(y|ies)|captur(e|es|ed|ing))\b/i.test(desc)) {
        html = fallbacks.paperIo;
      } else if (/\b(knif(e|es)|knives|throw|throws|throwing)\b/i.test(desc)) {
        html = fallbacks.knifeHit;
      } else if (/\b(space|spaceship|spaceships|shoot|shooter|shooting|laser|lasers|galaxy|alien|aliens|invader|invaders|raider)\b/i.test(desc)) {
        html = fallbacks.spaceShooter;
      } else if (/\b(dino|dinosaur|runner|run|jumping|cactus|cacti|scroller)\b/i.test(desc)) {
        html = fallbacks.dinoRunner;
      }
      return res.json({ html: applyThemeToTemplate(html, theme, name, characterAsset, backgroundAsset, obstacleAsset) });
    } catch (fallbackErr) {
      return res.status(500).json({ error: 'Failed to generate game code: ' + err.message });
    }
  }
});

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`[Server] Web portal running at http://localhost:${PORT}`);
});

// Start the WebSocket proxy server on port 8080
const wss = new WebSocket.Server({ port: 8080 }, () => {
  console.log('[Server] WebSocket proxy running at ws://localhost:8080');
});

initGeminiProxy(wss);
