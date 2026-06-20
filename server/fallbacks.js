// Offline resilient game fallback templates for Gesture Zone compiler
const dodgeBlocks = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neon Block Dodge</title>
  <style>
    body {
      margin: 0;
      background: #060606;
      color: #fff;
      font-family: 'Outfit', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
    #game-container {
      position: relative;
      width: 400px;
      height: 500px;
      border: 2px solid #ff0055;
      box-shadow: 0 0 20px rgba(255, 0, 85, 0.4);
      background: #000;
      border-radius: 8px;
    }
    canvas {
      display: block;
      background: #080808;
    }
    #hud {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      justify-content: space-between;
      font-family: monospace;
      font-size: 1rem;
      pointer-events: none;
      text-shadow: 0 0 5px #00e5ff;
    }
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 1.8rem;
      color: #ff0055;
      text-shadow: 0 0 10px rgba(255,0,85,0.6);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    p {
      color: #888;
      font-size: 0.8rem;
      margin: 0 0 20px 0;
      text-align: center;
      max-width: 80%;
    }
    .btn {
      background: transparent;
      border: 1px solid #00e5ff;
      color: #00e5ff;
      padding: 10px 20px;
      font-size: 0.9rem;
      cursor: pointer;
      border-radius: 4px;
      text-transform: uppercase;
      transition: all 0.3s ease;
      font-weight: bold;
    }
    .btn:hover {
      background: #00e5ff;
      color: #000;
      box-shadow: 0 0 15px rgba(0,229,255,0.5);
    }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="hud">
      <div>SCORE: <span id="score-val">0</span></div>
      <div>LIVES: <span id="lives-val">❤️❤️❤️</span></div>
    </div>
    <canvas id="gameCanvas" width="400" height="500"></canvas>
    
    <div id="menu-overlay" class="overlay">
      <h1>Neon Block Dodge</h1>
      <p>Move your avatar left and right to dodge falling obstacles. Map Lean Left/Right webcam gestures to steer.</p>
      <button class="btn" id="start-btn">Start Game</button>
    </div>

    <div id="gameover-overlay" class="overlay" style="display: none;">
      <h1>Game Over</h1>
      <p>You crashed too many times!</p>
      <button class="btn" id="restart-btn">Try Again</button>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreVal = document.getElementById('score-val');
    const livesVal = document.getElementById('lives-val');
    const menuOverlay = document.getElementById('menu-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    let gameActive = false;
    let score = 0;
    let lives = 3;
    
    const player = {
      x: 180,
      y: 440,
      width: 40,
      height: 20,
      speed: 6,
      targetX: 180
    };

    let obstacles = [];
    let keys = {};

    function spawnObstacle() {
      const size = Math.random() * 20 + 20;
      obstacles.push({
        x: Math.random() * (canvas.width - size),
        y: -size,
        width: size,
        height: size,
        speed: Math.random() * 2 + 3,
        color: Math.random() > 0.5 ? '#ff0055' : '#bdc581'
      });
    }

    // Controls Fallback
    window.addEventListener('keydown', (e) => keys[e.key] = true);
    window.addEventListener('keyup', (e) => keys[e.key] = false);

    // Gesture input mapping
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      if (data.lean === 'left') {
        player.targetX -= 15;
      } else if (data.lean === 'right') {
        player.targetX += 15;
      }
    });

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    function startGame() {
      menuOverlay.style.display = 'none';
      gameoverOverlay.style.display = 'none';
      score = 0;
      lives = 3;
      obstacles = [];
      player.x = 180;
      player.targetX = 180;
      scoreVal.textContent = score;
      livesVal.textContent = '❤️❤️❤️';
      gameActive = true;
      animate();
    }

    let spawnTimer = 0;

    function animate() {
      if (!gameActive) return;
      
      // Clear canvas
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Keyboard Controls
      if (keys['ArrowLeft'] || keys['a']) player.targetX -= player.speed;
      if (keys['ArrowRight'] || keys['d']) player.targetX += player.speed;
      
      // Smooth movements
      player.targetX = Math.max(0, Math.min(canvas.width - player.width, player.targetX));
      player.x += (player.targetX - player.x) * 0.25;

      // Draw player
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00e5ff';
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(player.x, player.y, player.width, player.height);

      // Spawn blocks
      spawnTimer++;
      if (spawnTimer > 40) {
        spawnObstacle();
        spawnTimer = 0;
      }

      // Draw and update blocks
      obstacles.forEach((obs, index) => {
        obs.y += obs.speed;
        
        ctx.shadowColor = obs.color;
        ctx.fillStyle = obs.color;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

        // Check crash
        if (
          obs.x < player.x + player.width &&
          obs.x + obs.width > player.x &&
          obs.y < player.y + player.height &&
          obs.y + obs.height > player.y
        ) {
          obstacles.splice(index, 1);
          lives--;
          livesVal.textContent = '❤️'.repeat(lives) || 'DEAD';
          if (lives <= 0) {
            gameActive = false;
            gameoverOverlay.style.display = 'flex';
          }
        }

        // Check off screen
        if (obs.y > canvas.height) {
          obstacles.splice(index, 1);
          score += 10;
          scoreVal.textContent = score;
        }
      });

      ctx.shadowBlur = 0;
      requestAnimationFrame(animate);
    }
  </script>
</body>
</html>`;

const paperIo = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neon Grid Capture</title>
  <style>
    body {
      margin: 0;
      background: #0a0a0a;
      color: #fff;
      font-family: 'Outfit', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
    #game-container {
      position: relative;
      width: 400px;
      height: 400px;
      border: 2px solid #00ff66;
      box-shadow: 0 0 20px rgba(0, 255, 102, 0.4);
      background: #000;
      border-radius: 8px;
    }
    canvas {
      display: block;
      background: #050505;
    }
    #score-board {
      position: absolute;
      top: 10px;
      left: 10px;
      font-family: monospace;
      font-size: 1.1rem;
      color: #00ff66;
      pointer-events: none;
      text-shadow: 0 0 8px rgba(0, 255, 102, 0.6);
    }
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 1.8rem;
      color: #00ff66;
      text-shadow: 0 0 10px rgba(0,255,102,0.6);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    p {
      color: #888;
      font-size: 0.8rem;
      margin: 0 0 20px 0;
      text-align: center;
      max-width: 80%;
    }
    .btn {
      background: transparent;
      border: 1px solid #00ff66;
      color: #00ff66;
      padding: 10px 20px;
      font-size: 0.9rem;
      cursor: pointer;
      border-radius: 4px;
      text-transform: uppercase;
      transition: all 0.3s ease;
      font-weight: bold;
    }
    .btn:hover {
      background: #00ff66;
      color: #000;
      box-shadow: 0 0 15px rgba(0,255,102,0.5);
    }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="score-board">GRID CAPTURE: <span id="score-val">10%</span></div>
    <canvas id="gameCanvas" width="400" height="400"></canvas>
    
    <div id="menu-overlay" class="overlay">
      <h1>Grid Capture</h1>
      <p>Steer outside your home territory to draw trails. Re-enter your territory to capture grid cells. Avoid hitting your trail! Map Lean Left/Right gestures to steer.</p>
      <button class="btn" id="start-btn">Start Capture</button>
    </div>

    <div id="gameover-overlay" class="overlay" style="display: none;">
      <h1>Trail Collided</h1>
      <p>You hit your own trail or bounds!</p>
      <button class="btn" id="restart-btn">Try Again</button>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreVal = document.getElementById('score-val');
    const menuOverlay = document.getElementById('menu-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    let gameActive = false;
    const gridSize = 20;
    const cells = 20; // 20x20 cells

    // Map: 0 = neutral, 1 = player base
    let grid = Array(cells).fill().map(() => Array(cells).fill(0));
    
    const player = {
      cx: 10,
      cy: 10,
      dx: 0,
      dy: -1,
      trail: [],
      speed: 8, // frames per step
      frameCounter: 0
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { player.dx = -1; player.dy = 0; }
      if (e.key === 'ArrowRight' || e.key === 'd') { player.dx = 1; player.dy = 0; }
      if (e.key === 'ArrowUp' || e.key === 'w') { player.dx = 0; player.dy = -1; }
      if (e.key === 'ArrowDown' || e.key === 's') { player.dx = 0; player.dy = 1; }
    });

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      if (data.lean === 'left') {
        // Turn left relative to current direction
        const temp = player.dx;
        player.dx = player.dy;
        player.dy = -temp;
      } else if (data.lean === 'right') {
        // Turn right relative to current direction
        const temp = player.dx;
        player.dx = -player.dy;
        player.dy = temp;
      }
    });

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    function startGame() {
      menuOverlay.style.display = 'none';
      gameoverOverlay.style.display = 'none';
      
      // Initialize grid with 5x5 starting base
      grid = Array(cells).fill().map(() => Array(cells).fill(0));
      for (let x = 8; x <= 12; x++) {
        for (let y = 8; y <= 12; y++) {
          grid[x][y] = 1;
        }
      }

      player.cx = 10;
      player.cy = 10;
      player.dx = 0;
      player.dy = -1;
      player.trail = [];
      player.frameCounter = 0;

      updateScore();
      gameActive = true;
      animate();
    }

    function updateScore() {
      let captured = 0;
      for (let x = 0; x < cells; x++) {
        for (let y = 0; y < cells; y++) {
          if (grid[x][y] === 1) captured++;
        }
      }
      const pct = Math.round((captured / (cells * cells)) * 100);
      scoreVal.textContent = pct + '%';
    }

    function animate() {
      if (!gameActive) return;

      // Draw neutral grid
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      for (let i = 0; i <= canvas.width; i += gridSize) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Draw captured base
      ctx.fillStyle = 'rgba(0, 255, 102, 0.2)';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00ff66';
      for (let x = 0; x < cells; x++) {
        for (let y = 0; y < cells; y++) {
          if (grid[x][y] === 1) {
            ctx.fillRect(x * gridSize, y * gridSize, gridSize - 1, gridSize - 1);
          }
        }
      }

      // Draw trail
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff00ff';
      ctx.beginPath();
      player.trail.forEach((pt, index) => {
        const px = pt.x * gridSize + gridSize/2;
        const py = pt.y * gridSize + gridSize/2;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Draw player head
      ctx.fillStyle = '#00ff66';
      ctx.shadowColor = '#00ff66';
      ctx.fillRect(player.cx * gridSize + 2, player.cy * gridSize + 2, gridSize - 4, gridSize - 4);

      // Move player based on speed intervals
      player.frameCounter++;
      if (player.frameCounter >= player.speed) {
        player.frameCounter = 0;
        
        const nextX = player.cx + player.dx;
        const nextY = player.cy + player.dy;

        // Bounds check
        if (nextX < 0 || nextX >= cells || nextY < 0 || nextY >= cells) {
          gameActive = false;
          gameoverOverlay.style.display = 'flex';
          return;
        }

        // Self-trail intersection check
        const inTrail = player.trail.some(pt => pt.x === nextX && pt.y === nextY);
        if (inTrail) {
          gameActive = false;
          gameoverOverlay.style.display = 'flex';
          return;
        }

        player.cx = nextX;
        player.cy = nextY;

        if (grid[player.cx][player.cy] === 0) {
          // Add to trail
          player.trail.push({ x: player.cx, y: player.cy });
        } else {
          // Re-entered home base: trigger capture fill
          if (player.trail.length > 0) {
            player.trail.forEach(pt => {
              grid[pt.x][pt.y] = 1;
            });
            
            // Simple flood capture enclosure
            floodFillCapture();
            player.trail = [];
            updateScore();
          }
        }
      }

      ctx.shadowBlur = 0;
      requestAnimationFrame(animate);
    }

    function floodFillCapture() {
      // Basic bounding box fill
      if (player.trail.length === 0) return;
      let minX = cells, maxX = 0, minY = cells, maxY = 0;
      player.trail.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
      
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          grid[x][y] = 1;
        }
      }
    }
  </script>
</body>
</html>`;

const knifeHit = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neon Knife Hit</title>
  <style>
    body {
      margin: 0;
      background: #080808;
      color: #fff;
      font-family: 'Outfit', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
    #game-container {
      position: relative;
      width: 400px;
      height: 500px;
      border: 2px solid #ff9800;
      box-shadow: 0 0 20px rgba(255, 152, 0, 0.4);
      background: #000;
      border-radius: 8px;
    }
    canvas {
      display: block;
      background: #050505;
    }
    #hud {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      justify-content: space-between;
      font-family: monospace;
      font-size: 1rem;
      pointer-events: none;
      text-shadow: 0 0 5px #ff9800;
    }
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 1.8rem;
      color: #ff9800;
      text-shadow: 0 0 10px rgba(255, 152, 0, 0.6);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    p {
      color: #888;
      font-size: 0.8rem;
      margin: 0 0 20px 0;
      text-align: center;
      max-width: 80%;
    }
    .btn {
      background: transparent;
      border: 1px solid #ff9800;
      color: #ff9800;
      padding: 10px 20px;
      font-size: 0.9rem;
      cursor: pointer;
      border-radius: 4px;
      text-transform: uppercase;
      transition: all 0.3s ease;
      font-weight: bold;
    }
    .btn:hover {
      background: #ff9800;
      color: #000;
      box-shadow: 0 0 15px rgba(255, 152, 0, 0.5);
    }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="hud">
      <div>KNIVES: <span id="knives-count">8</span></div>
      <div>SCORE: <span id="score-val">0</span></div>
    </div>
    <canvas id="gameCanvas" width="400" height="500"></canvas>
    
    <div id="menu-overlay" class="overlay">
      <h1>Neon Knife Hit</h1>
      <p>Throw all knives at the rotating target. Avoid hitting other knives! Map Open Mouth or Pinch Hand to throw.</p>
      <button class="btn" id="start-btn">Start Challenge</button>
    </div>

    <div id="gameover-overlay" class="overlay" style="display: none;">
      <h1 id="end-title">Game Over</h1>
      <p id="end-msg">You hit another knife!</p>
      <button class="btn" id="restart-btn">Try Again</button>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreVal = document.getElementById('score-val');
    const knivesCount = document.getElementById('knives-count');
    const menuOverlay = document.getElementById('menu-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    let gameActive = false;
    let score = 0;
    let targetKnives = 8;
    let knivesLeft = 8;
    
    // Rotating board properties
    const wheel = {
      x: 200,
      y: 180,
      radius: 65,
      angle: 0,
      speed: 0.035
    };

    let stuckKnives = []; // angles relative to target wheel
    
    // Active flying knife
    let flyingKnife = null;
    let readyToThrow = true;

    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp') throwKnife();
    });

    canvas.addEventListener('click', throwKnife);

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      if (data.mouthOpen || data.shoot) {
        throwKnife();
      }
    });

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    function startGame() {
      menuOverlay.style.display = 'none';
      gameoverOverlay.style.display = 'none';
      score = 0;
      knivesLeft = targetKnives;
      stuckKnives = [];
      flyingKnife = null;
      readyToThrow = true;
      wheel.angle = 0;
      wheel.speed = 0.035;
      scoreVal.textContent = score;
      knivesCount.textContent = knivesLeft;
      gameActive = true;
      animate();
    }

    function throwKnife() {
      if (!gameActive || !readyToThrow || knivesLeft <= 0) return;
      
      readyToThrow = false;
      flyingKnife = {
        x: 200,
        y: 450,
        speed: 15
      };
      knivesLeft--;
      knivesCount.textContent = knivesLeft;
    }

    function animate() {
      if (!gameActive) return;

      // Clear Canvas
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Rotate Wheel
      wheel.angle += wheel.speed;
      
      // Speed variations
      if (score >= 40) {
        wheel.speed = 0.045 * Math.sin(wheel.angle * 0.35) + 0.01;
      }

      // Draw Rotating Target Wheel
      ctx.save();
      ctx.translate(wheel.x, wheel.y);
      ctx.rotate(wheel.angle);
      
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ff9800';
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, wheel.radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Target design lines
      ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)';
      ctx.lineWidth = 2;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * wheel.radius, Math.sin(a) * wheel.radius); ctx.stroke();
      }

      // Draw stuck knives
      ctx.fillStyle = '#e0e0e0';
      stuckKnives.forEach(angle => {
        ctx.save();
        ctx.rotate(angle);
        ctx.fillRect(-4, wheel.radius - 5, 8, 45); // knife blade
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(-2, wheel.radius + 40, 4, 15); // hilt
        ctx.restore();
      });

      ctx.restore();

      // Draw available reserve knife
      if (readyToThrow && knivesLeft > 0) {
        ctx.fillStyle = '#e0e0e0';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#fff';
        ctx.fillRect(196, 440, 8, 45);
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(198, 485, 4, 15);
      }

      // Update flying knife
      if (flyingKnife) {
        flyingKnife.y -= flyingKnife.speed;
        
        ctx.fillStyle = '#e0e0e0';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffff';
        ctx.fillRect(flyingKnife.x - 4, flyingKnife.y, 8, 45);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(flyingKnife.x - 2, flyingKnife.y + 45, 4, 15);

        // Hit wheel check
        if (flyingKnife.y <= wheel.y + wheel.radius) {
          const hitY = flyingKnife.y;
          flyingKnife = null;

          // Calculate angle relative to current wheel angle
          const hitAngle = Math.PI/2 - wheel.angle; // Bottom center is PI/2 relative to coordinates
          const normalizedAngle = (hitAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

          // Check knife collision (angle overlap)
          let collided = false;
          stuckKnives.forEach(stuckAngle => {
            const diff = Math.abs(normalizedAngle - stuckAngle);
            const wrapDiff = Math.min(diff, Math.PI * 2 - diff);
            if (wrapDiff < 0.18) { // ~10 degrees
              collided = true;
            }
          });

          if (collided) {
            gameActive = false;
            document.getElementById('end-title').textContent = 'Collision!';
            document.getElementById('end-msg').textContent = 'You hit another knife!';
            gameoverOverlay.style.display = 'flex';
          } else {
            // Stick knife
            stuckKnives.push(normalizedAngle);
            score += 10;
            scoreVal.textContent = score;

            // Check level clear
            if (knivesLeft <= 0) {
              // Level Clear! Advance and speed up
              wheel.speed = Math.sign(wheel.speed) * (Math.abs(wheel.speed) + 0.015);
              knivesLeft = targetKnives;
              knivesCount.textContent = knivesLeft;
              stuckKnives = [];
              readyToThrow = true;
            } else {
              readyToThrow = true;
            }
          }
        }
      }

      ctx.shadowBlur = 0;
      requestAnimationFrame(animate);
    }
  </script>
</body>
</html>`;

const fruitNinja = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neon Ninja Slicer</title>
  <style>
    body {
      margin: 0;
      background: #050505;
      color: #fff;
      font-family: 'Outfit', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
    #game-container {
      position: relative;
      width: 400px;
      height: 500px;
      border: 2px solid #00ff66;
      box-shadow: 0 0 20px rgba(0, 255, 102, 0.4);
      background: #000;
      border-radius: 8px;
    }
    canvas {
      display: block;
      background: #080808;
    }
    #hud {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      justify-content: space-between;
      font-family: monospace;
      font-size: 1rem;
      pointer-events: none;
      text-shadow: 0 0 8px #00ff66;
    }
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 1.8rem;
      color: #00ff66;
      text-shadow: 0 0 10px rgba(0, 255, 102, 0.6);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    p {
      color: #888;
      font-size: 0.8rem;
      margin: 0 0 20px 0;
      text-align: center;
      max-width: 80%;
    }
    .btn {
      background: transparent;
      border: 1px solid #00ff66;
      color: #00ff66;
      padding: 10px 20px;
      font-size: 0.9rem;
      cursor: pointer;
      border-radius: 4px;
      text-transform: uppercase;
      transition: all 0.3s ease;
      font-weight: bold;
    }
    .btn:hover {
      background: #00ff66;
      color: #000;
      box-shadow: 0 0 15px rgba(0,255,102,0.5);
    }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="hud">
      <div>SCORE: <span id="score-val">0</span></div>
      <div>LIVES: <span id="lives-val">❤️❤️❤️</span></div>
    </div>
    <canvas id="gameCanvas" width="400" height="500"></canvas>
    
    <div id="menu-overlay" class="overlay">
      <h1>Neon Slicer</h1>
      <p>Slice flying fruits using your hands! Avoid slicing the red bombs. Fallback: Drag your mouse across the screen to slice.</p>
      <button class="btn" id="start-btn">Start Dojo</button>
    </div>

    <div id="gameover-overlay" class="overlay" style="display: none;">
      <h1 id="end-title">Game Over</h1>
      <p id="end-msg">You hit a bomb!</p>
      <button class="btn" id="restart-btn">Try Again</button>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreVal = document.getElementById('score-val');
    const livesVal = document.getElementById('lives-val');
    const menuOverlay = document.getElementById('menu-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    let gameActive = false;
    let score = 0;
    let lives = 3;
    
    let items = [];
    let sliceTrail = [];
    let isMouseDown = false;
    let lastX = 0;
    let lastY = 0;

    // Track mouse inputs
    canvas.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      const rect = canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
      sliceTrail = [{ x: lastX, y: lastY }];
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      sliceTrail.push({ x: currentX, y: currentY });
      checkSlice(lastX, lastY, currentX, currentY);
      lastX = currentX;
      lastY = currentY;
    });

    canvas.addEventListener('mouseup', () => { isMouseDown = false; });

    // Track webcam hand gesture inputs
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      if (data.hands && data.hands.length > 0) {
        const hand = data.hands[0];
        // Scale normalized x and y to canvas width and height
        const currentX = hand.x * canvas.width;
        const currentY = hand.y * canvas.height;
        
        sliceTrail.push({ x: currentX, y: currentY });
        if (sliceTrail.length > 8) sliceTrail.shift();
        
        if (lastX && lastY) {
          checkSlice(lastX, lastY, currentX, currentY);
        }
        lastX = currentX;
        lastY = currentY;
      } else {
        lastX = null;
        lastY = null;
      }
    });

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    function startGame() {
      menuOverlay.style.display = 'none';
      gameoverOverlay.style.display = 'none';
      score = 0;
      lives = 3;
      items = [];
      sliceTrail = [];
      scoreVal.textContent = score;
      livesVal.textContent = '❤️❤️❤️';
      gameActive = true;
      animate();
    }

    function spawnItem() {
      const isBomb = Math.random() < 0.22;
      items.push({
        x: Math.random() * (canvas.width - 60) + 30,
        y: canvas.height + 20,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 4 - 8,
        radius: 20,
        isBomb: isBomb,
        isCut: false,
        cutOffset: 0,
        color: isBomb ? '#ff0000' : getRandomColor()
      });
    }

    function getRandomColor() {
      const colors = ['#00ff66', '#00ffff', '#ffff00', '#ff00ff', '#ff9800'];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    function checkSlice(x1, y1, x2, y2) {
      items.forEach((item, index) => {
        if (item.isCut) return;
        
        // Simple distance check from segment to item center
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        // Projection
        const t = Math.max(0, Math.min(1, ((item.x - x1) * dx + (item.y - y1) * dy) / (len * len)));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        const dist = Math.sqrt((item.x - projX) ** 2 + (item.y - projY) ** 2);

        if (dist <= item.radius + 4) {
          // Intersection! Sliced!
          item.isCut = true;
          if (item.isBomb) {
            gameActive = false;
            document.getElementById('end-title').textContent = 'KABOOM!';
            document.getElementById('end-msg').textContent = 'You sliced a bomb!';
            gameoverOverlay.style.display = 'flex';
          } else {
            score += 15;
            scoreVal.textContent = score;
          }
        }
      });
    }

    let spawnTimer = 0;

    function animate() {
      if (!gameActive) return;

      // Clear Canvas
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Slice Trail
      if (sliceTrail.length > 1) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        sliceTrail.forEach((pt, index) => {
          if (index === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        
        // Trim trail
        sliceTrail.shift();
      }

      // Spawn items
      spawnTimer++;
      if (spawnTimer > 35) {
        spawnItem();
        spawnTimer = 0;
      }

      // Draw and update items
      items.forEach((item, index) => {
        item.x += item.vx;
        item.y += item.vy;
        item.vy += 0.22; // gravity

        ctx.shadowBlur = 10;
        ctx.shadowColor = item.color;
        ctx.fillStyle = item.color;

        if (item.isCut) {
          // Sliced fruit fly apart
          item.cutOffset += 2;
          ctx.beginPath();
          ctx.arc(item.x - item.cutOffset, item.y, item.radius, Math.PI/2, Math.PI * 1.5);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(item.x + item.cutOffset, item.y, item.radius, Math.PI * 1.5, Math.PI/2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          
          if (item.isBomb) {
            ctx.fillStyle = '#fff';
            ctx.fillText('💣', item.x - 6, item.y + 4);
          }
        }

        // Clean up out of bounds
        if (item.y > canvas.height + 40) {
          items.splice(index, 1);
          if (!item.isBomb && !item.isCut) {
            lives--;
            livesVal.textContent = '❤️'.repeat(lives) || 'DEAD';
            if (lives <= 0) {
              gameActive = false;
              document.getElementById('end-title').textContent = 'Dojo Failed';
              document.getElementById('end-msg').textContent = 'Too many missed slices!';
              gameoverOverlay.style.display = 'flex';
            }
          }
        }
      });

      ctx.shadowBlur = 0;
      requestAnimationFrame(animate);
    }
  </script>
</body>
</html>`;

module.exports = {
  dodgeBlocks,
  paperIo,
  knifeHit,
  fruitNinja
};
