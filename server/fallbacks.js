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

const spaceShooter = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neon Space Raider</title>
  <style>
    body {
      margin: 0;
      background: #050508;
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
      border: 2px solid #00e5ff;
      box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
      background: #000;
      border-radius: 8px;
    }
    canvas {
      display: block;
      background: #030306;
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
      z-index: 5;
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
      color: #00e5ff;
      text-shadow: 0 0 10px rgba(0,229,255,0.6);
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
      <div>SHIELDS: <span id="lives-val">❤️❤️❤️</span></div>
    </div>
    <canvas id="gameCanvas" width="400" height="500"></canvas>
    
    <div id="menu-overlay" class="overlay">
      <h1>Neon Space Raider</h1>
      <p>Steer your spaceship left and right to shoot oncoming alien fleets. Avoid getting hit! Map Lean Left/Right to move, Pinch fingers or Open Mouth to fire lasers.</p>
      <button class="btn" id="start-btn">Launch Raider</button>
    </div>

    <div id="gameover-overlay" class="overlay" style="display: none;">
      <h1>Shields Breached</h1>
      <p>Your ship was destroyed by the cosmic fleet!</p>
      <button class="btn" id="restart-btn">Launch Cycle Again</button>
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
    
    const chosenCharacter = "__CHOSEN_CHARACTER__";
    const chosenBackground = "__CHOSEN_BACKGROUND__";
    const chosenObstacle = "__CHOSEN_OBSTACLE__";
    let runTick = 0;

    const player = {
      x: 180,
      y: 440,
      width: 40,
      height: 30,
      speed: 8,
      targetX: 180
    };

    let lasers = [];
    let enemies = [];
    let particles = [];
    let keys = {};
    let stars = [];

    // Initialize stars background
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: Math.random() * 1.5 + 0.5,
        size: Math.random() * 1.5 + 0.5
      });
    }

    function spawnEnemy() {
      const size = Math.random() * 15 + 15;
      enemies.push({
        x: Math.random() * (canvas.width - size),
        y: -size,
        width: size,
        height: size,
        speed: Math.random() * 1.5 + 1.5,
        color: '#ff0055'
      });
    }

    function fireLaser() {
      if (!gameActive) return;
      lasers.push({
        x: player.x + player.width / 2 - 2,
        y: player.y,
        width: 4,
        height: 12,
        speed: 8
      });
    }

    function spawnExplosion(x, y, color) {
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: x,
          y: y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          size: Math.random() * 3 + 1,
          life: 30,
          color: color
        });
      }
    }

    // Keyboard Fallback
    window.addEventListener('keydown', (e) => {
      keys[e.key] = true;
      if (e.key === ' ' || e.key === 'ArrowUp') {
        fireLaser();
      }
    });
    window.addEventListener('keyup', (e) => keys[e.key] = false);

    // Mouse Fallback
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      player.targetX = mouseX - player.width / 2;
    });
    canvas.addEventListener('click', fireLaser);

    // Gesture input mapping
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      
      // Horizontal movement: Lean left/right
      if (data.lean === 'left') {
        player.targetX -= 18;
      } else if (data.lean === 'right') {
        player.targetX += 18;
      }
      
      // Auto alignment with hands array
      if (data.hands && data.hands.length > 0) {
        const hand = data.hands[0];
        if (hand.visible) {
          player.targetX = hand.x * canvas.width - player.width / 2;
        }
      }

      // Fire actions: Pinch fingers or open mouth
      if (data.shoot || data.mouthOpen) {
        fireLaser();
      }
    });

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    function startGame() {
      menuOverlay.style.display = 'none';
      gameoverOverlay.style.display = 'none';
      score = 0;
      lives = 3;
      lasers = [];
      enemies = [];
      particles = [];
      player.x = 180;
      player.targetX = 180;
      scoreVal.textContent = score;
      livesVal.textContent = '❤️❤️❤️';
      gameActive = true;
      animate();
    }

    let spawnTimer = 0;
    let autoShootTimer = 0;

    function animate() {
      if (!gameActive) return;
      
      runTick++;
      
      // Clear canvas
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw background depending on chosen option
      if (chosenBackground === 'bg_option_2') {
        // Asteroid Belt
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        stars.forEach(star => {
          star.y += star.speed;
          if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
          }
          ctx.fillRect(star.x, star.y, star.size, star.size);
        });

        ctx.fillStyle = '#3c3c42';
        ctx.strokeStyle = '#5a5a62';
        ctx.lineWidth = 1.5;
        for (let a = 0; a < 3; a++) {
          const astSpeed = 1.2;
          const astX = (a * 140 + runTick * 0.4) % (canvas.width + 100) - 50;
          const astY = (a * 170 + runTick * astSpeed) % (canvas.height + 100) - 50;
          ctx.beginPath();
          ctx.arc(astX, astY, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (chosenBackground === 'bg_option_3') {
        // Hypergrid Tunnel
        ctx.save();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        ctx.shadowBlur = 0;
        
        ctx.beginPath();
        ctx.moveTo(80, 0); ctx.lineTo(20, canvas.height);
        ctx.moveTo(canvas.width - 80, 0); ctx.lineTo(canvas.width - 20, canvas.height);
        ctx.stroke();
        
        const gridOffset = (runTick * 2.0) % 30;
        for (let gy = -30; gy < canvas.height; gy += 30) {
          const yPos = gy + gridOffset;
          ctx.beginPath();
          ctx.moveTo(80 - (60 * yPos / canvas.height), yPos);
          ctx.lineTo(canvas.width - 80 + (60 * yPos / canvas.height), yPos);
          ctx.stroke();
        }
        ctx.restore();
      } else if (chosenBackground === 'bg_option_4') {
        // Nebula Storm
        ctx.save();
        const nebY1 = (runTick * 0.22) % (canvas.height + 400) - 200;
        let grad1 = ctx.createRadialGradient(100, nebY1, 10, 100, nebY1, 140);
        grad1.addColorStop(0, 'rgba(255, 0, 85, 0.25)');
        grad1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const nebY2 = (runTick * 0.14 + 250) % (canvas.height + 400) - 200;
        let grad2 = ctx.createRadialGradient(300, nebY2, 20, 300, nebY2, 160);
        grad2.addColorStop(0, 'rgba(0, 229, 255, 0.2)');
        grad2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        // Option 1: Deep Starfield (Default)
        ctx.fillStyle = '#fff';
        stars.forEach(star => {
          star.y += star.speed;
          if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
          }
          ctx.fillRect(star.x, star.y, star.size, star.size);
        });
      }

      // Keyboard Controls
      if (keys['ArrowLeft'] || keys['a']) player.targetX -= player.speed;
      if (keys['ArrowRight'] || keys['d']) player.targetX += player.speed;
      
      // Smooth movements
      player.targetX = Math.max(0, Math.min(canvas.width - player.width, player.targetX));
      player.x += (player.targetX - player.x) * 0.25;

      // Draw Player Ship (Custom option support)
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00e5ff';
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#002233';

      if (chosenCharacter === 'char_option_2') {
        // Heavy Dreadnought
        ctx.fillRect(player.x + 8, player.y + 6, 24, 24);
        ctx.fillRect(player.x, player.y + 14, 8, 12);
        ctx.fillRect(player.x + 32, player.y + 14, 8, 12);
        ctx.fillRect(player.x + 12, player.y, 4, 10);
        ctx.fillRect(player.x + 24, player.y, 4, 10);
        ctx.strokeRect(player.x + 8, player.y + 6, 24, 24);
      } else if (chosenCharacter === 'char_option_3') {
        // Vanguard Speeder
        ctx.beginPath();
        ctx.moveTo(player.x + player.width / 2, player.y);
        ctx.lineTo(player.x + player.width, player.y + player.height - 6);
        ctx.lineTo(player.x + player.width - 6, player.y + player.height);
        ctx.lineTo(player.x + 6, player.y + player.height);
        ctx.lineTo(player.x, player.y + player.height - 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (chosenCharacter === 'char_option_4') {
        // Orbit Sentinel
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.height / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, player.y + player.height / 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Option 1 (Default): Star Fighter Triangle
        ctx.beginPath();
        ctx.moveTo(player.x + player.width / 2, player.y);
        ctx.lineTo(player.x, player.y + player.height);
        ctx.lineTo(player.x + player.width, player.y + player.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Spawning Enemies
      spawnTimer++;
      if (spawnTimer > 35) {
        spawnEnemy();
        spawnTimer = 0;
      }

      // Auto shoot sometimes if user keeps finger there
      autoShootTimer++;
      if (autoShootTimer > 18) {
        fireLaser();
        autoShootTimer = 0;
      }

      // Update and Draw Lasers
      lasers.forEach((laser, lIdx) => {
        laser.y -= laser.speed;
        ctx.shadowColor = '#00e5ff';
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(laser.x, laser.y, laser.width, laser.height);

        // Delete off-screen lasers
        if (laser.y < 0) {
          lasers.splice(lIdx, 1);
        }
      });

      // Update and Draw Enemies
      enemies.forEach((enemy, eIdx) => {
        enemy.y += enemy.speed;
        
        ctx.shadowColor = enemy.color;
        ctx.strokeStyle = enemy.color;
        ctx.fillStyle = '#220011';
        ctx.lineWidth = 2;

        if (chosenObstacle === 'obs_option_2') {
          // Spike Drone (Rotating spiked mine)
          ctx.save();
          ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
          ctx.rotate(Date.now() / 250);
          ctx.beginPath();
          ctx.arc(0, 0, enemy.width / 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          for (let s = 0; s < 4; s++) {
            const angle = s * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * (enemy.width / 2), Math.sin(angle) * (enemy.height / 2));
            ctx.stroke();
          }
          ctx.restore();
        } else if (chosenObstacle === 'obs_option_3') {
          // Scout Cruiser
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width / 2, enemy.y + enemy.height);
          ctx.lineTo(enemy.x + enemy.width, enemy.y + 4);
          ctx.lineTo(enemy.x + enemy.width - 4, enemy.y);
          ctx.lineTo(enemy.x + 4, enemy.y);
          ctx.lineTo(enemy.x, enemy.y + 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (chosenObstacle === 'obs_option_4') {
          // Warp Destroyer
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width / 2, enemy.y + enemy.height);
          ctx.lineTo(enemy.x + enemy.width, enemy.y);
          ctx.lineTo(enemy.x + enemy.width / 2, enemy.y + enemy.height / 3.5);
          ctx.lineTo(enemy.x, enemy.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Option 1 (Default): Invader Octagon
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width / 2, enemy.y);
          ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height / 3);
          ctx.lineTo(enemy.x + enemy.width, enemy.y + (2 * enemy.height) / 3);
          ctx.lineTo(enemy.x + enemy.width / 2, enemy.y + enemy.height);
          ctx.lineTo(enemy.x, enemy.y + (2 * enemy.height) / 3);
          ctx.lineTo(enemy.x, enemy.y + enemy.height / 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Check laser hits
        lasers.forEach((laser, lIdx) => {
          if (
            laser.x < enemy.x + enemy.width &&
            laser.x + laser.width > enemy.x &&
            laser.y < enemy.y + enemy.height &&
            laser.y + laser.height > enemy.y
          ) {
            spawnExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0055');
            enemies.splice(eIdx, 1);
            lasers.splice(lIdx, 1);
            score += 15;
            scoreVal.textContent = score;
          }
        });

        // Player crash check
        if (
          enemy.x < player.x + player.width &&
          enemy.x + enemy.width > player.x &&
          enemy.y < player.y + player.height &&
          enemy.y + enemy.height > player.y
        ) {
          spawnExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0055');
          enemies.splice(eIdx, 1);
          lives--;
          livesVal.textContent = '❤️'.repeat(lives) || 'DEAD';
          if (lives <= 0) {
            gameActive = false;
            gameoverOverlay.style.display = 'flex';
          }
        }

        // Reached bottom
        if (enemy.y > canvas.height) {
          enemies.splice(eIdx, 1);
          lives--;
          livesVal.textContent = '❤️'.repeat(lives) || 'DEAD';
          if (lives <= 0) {
            gameActive = false;
            gameoverOverlay.style.display = 'flex';
          }
        }
      });

      // Update and Draw Particles
      particles.forEach((part, pIdx) => {
        part.x += part.vx;
        part.y += part.vy;
        part.life--;
        ctx.shadowColor = part.color;
        ctx.fillStyle = part.color;
        ctx.fillRect(part.x, part.y, part.size, part.size);

        if (part.life <= 0) {
          particles.splice(pIdx, 1);
        }
      });

      ctx.shadowBlur = 0;
      requestAnimationFrame(animate);
    }
  </script>
</body>
</html>`;

const dinoRunner = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neon Dino Runner</title>
  <style>
    :root {
      --primary-color: #00e5ff;
      --accent-color: #ff0055;
      --border-color: #00ff66;
      --bg-color-dark: #050508;
      --mountain-color-1: #160028;
      --mountain-color-2: #0d001a;
      --mountain-outline: #7700cc;
    }
    body {
      margin: 0;
      background: var(--bg-color-dark);
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
      width: 450px;
      height: 350px;
      border: 2px solid var(--border-color);
      box-shadow: 0 0 20px var(--border-color);
      background: #000;
      border-radius: 8px;
    }
    canvas {
      display: block;
      background: #000;
    }
    #hud {
      position: absolute;
      top: 10px;
      left: 15px;
      right: 15px;
      display: flex;
      justify-content: space-between;
      font-family: monospace;
      font-size: 1.1rem;
      pointer-events: none;
      text-shadow: 0 0 5px var(--border-color);
      z-index: 5;
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
      color: var(--border-color);
      text-shadow: 0 0 10px var(--border-color);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    p {
      color: #888;
      font-size: 0.8rem;
      margin: 0 0 20px 0;
      text-align: center;
      max-width: 85%;
    }
    .btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--border-color);
      padding: 10px 20px;
      font-size: 0.9rem;
      cursor: pointer;
      border-radius: 4px;
      text-transform: uppercase;
      transition: all 0.3s ease;
      font-weight: bold;
    }
    .btn:hover {
      background: var(--border-color);
      color: #000;
      box-shadow: 0 0 15px var(--border-color);
    }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="hud">
      <div>SCORE: <span id="score-val">0</span></div>
      <div>HIGH SCORE: <span id="highscore-val">0</span></div>
    </div>
    <canvas id="gameCanvas" width="450" height="350"></canvas>
    
    <div id="menu-overlay" class="overlay">
      <h1>Neon Dino Runner</h1>
      <p>Jump over incoming obstacles and survive. Map Open Mouth or Jump webcam gestures to jump. Keyboard: Space or ArrowUp. Mouse: Click.</p>
      <button class="btn" id="start-btn">Start Running</button>
    </div>
 
    <div id="gameover-overlay" class="overlay" style="display: none;">
      <h1>System Crash</h1>
      <p>Your Dino collided with a cyber-cactus!</p>
      <button class="btn" id="restart-btn">Restart Cycle</button>
    </div>
  </div>
 
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreVal = document.getElementById('score-val');
    const highscoreVal = document.getElementById('highscore-val');
    const menuOverlay = document.getElementById('menu-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    // Dynamic style colors from CSS properties
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#00e5ff';
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ff0055';
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#00ff66';
    const mtnColor1 = getComputedStyle(document.documentElement).getPropertyValue('--mountain-color-1').trim() || '#160028';
    const mtnColor2 = getComputedStyle(document.documentElement).getPropertyValue('--mountain-color-2').trim() || '#0d001a';
    const mtnOutlineColor = getComputedStyle(document.documentElement).getPropertyValue('--mountain-outline').trim() || '#7700cc';
    
    const chosenCharacter = "__CHOSEN_CHARACTER__";
    const chosenBackground = "__CHOSEN_BACKGROUND__";
    const chosenObstacle = "__CHOSEN_OBSTACLE__";

    let gameActive = false;
    let score = 0;
    let highscore = 0;
    
    const groundY = 280;
    
    const dino = {
      x: 50,
      y: groundY - 40,
      width: 30,
      height: 40,
      vy: 0,
      gravity: 0.6,
      jumpForce: -11,
      isGrounded: true
    };

    let obstacles = [];
    let particles = [];
    let speed = 4.5;
    let distanceCount = 0;
    
    // Background parallax elements
    let stars = [];
    let mountains = [];
    let runTick = 0;

    function initBackground() {
      stars = [];
      for (let i = 0; i < 20; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * (groundY - 100),
          size: Math.random() * 2 + 0.5,
          speed: Math.random() * 0.15 + 0.05
        });
      }
      
      mountains = [
        { x: 40, width: 110, height: 50, speed: 0.2, color: '#160028', outline: '#7700cc' },
        { x: 190, width: 150, height: 80, speed: 0.15, color: '#0d001a', outline: '#6600bb' },
        { x: 360, width: 120, height: 45, speed: 0.2, color: '#160028', outline: '#7700cc' }
      ];
    }

    function spawnObstacle() {
      const h = Math.random() * 25 + 25;
      const w = Math.random() * 10 + 15;
      obstacles.push({
        x: canvas.width + 10,
        y: groundY - h,
        width: w,
        height: h,
        color: '#ff0055'
      });
    }

    function jump() {
      if (!gameActive) return;
      if (dino.isGrounded) {
        dino.vy = dino.jumpForce;
        dino.isGrounded = false;
      }
    }

    function spawnExplosion(x, y, color) {
      for (let i = 0; i < 12; i++) {
        particles.push({
          x: x,
          y: y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          size: Math.random() * 3 + 1,
          life: 25,
          color: color
        });
      }
    }

    // Custom drawing routines for premium aesthetics
    function drawDino(ctx, x, y, width, height, isGrounded, tick) {
      ctx.save();
      ctx.translate(x, y);
      
      ctx.fillStyle = primaryColor;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 10;
      
      if (chosenCharacter === 'char_option_2') {
        // Cyber Raptor (Sleek, low runner)
        ctx.fillRect(16, 5, 14, 8);
        ctx.fillStyle = '#030603';
        ctx.fillRect(24, 7, 2, 2);
        ctx.fillStyle = primaryColor;
        ctx.fillRect(6, 12, 16, 14);
        ctx.fillRect(0, 14, 6, 4);
        
        const anim = Math.floor(tick / 5) % 2;
        if (anim === 0) {
          ctx.fillRect(6, 26, 3, 14);
          ctx.fillRect(14, 26, 3, 8);
        } else {
          ctx.fillRect(6, 26, 3, 8);
          ctx.fillRect(14, 26, 3, 14);
        }
      } else if (chosenCharacter === 'char_option_3') {
        // Mecha Pterodactyl (Flapping wings)
        ctx.fillRect(10, 16, 14, 8);
        ctx.fillRect(24, 16, 6, 4);
        
        const wingFlap = Math.floor(tick / 6) % 2;
        if (wingFlap === 0) {
          ctx.fillRect(6, 2, 4, 15);
          ctx.fillRect(16, 2, 4, 15);
        } else {
          ctx.fillRect(6, 23, 4, 15);
          ctx.fillRect(16, 23, 4, 15);
        }
        ctx.fillRect(12, 24, 2, 8);
        ctx.fillRect(18, 24, 2, 8);
      } else if (chosenCharacter === 'char_option_4') {
        // Plesiosaur (Long neck)
        ctx.fillRect(2, 20, 26, 12);
        ctx.fillRect(20, 4, 6, 18);
        ctx.fillRect(22, 2, 8, 5);
        ctx.fillStyle = '#030603';
        ctx.fillRect(26, 3, 2, 2);
        ctx.fillStyle = primaryColor;
        
        const anim = Math.floor(tick / 6) % 2;
        if (anim === 0) {
          ctx.fillRect(4, 32, 6, 6);
          ctx.fillRect(18, 32, 4, 8);
        } else {
          ctx.fillRect(4, 32, 4, 8);
          ctx.fillRect(18, 32, 6, 6);
        }
      } else {
        // T-Rex (Default)
        ctx.fillRect(14, 0, 16, 12);
        ctx.fillRect(20, 12, 10, 3);
        ctx.fillStyle = '#030603';
        ctx.fillRect(24, 3, 3, 3);
        
        ctx.fillStyle = primaryColor;
        ctx.fillRect(8, 12, 10, 18);
        ctx.fillRect(2, 16, 12, 14);
        
        ctx.fillRect(18, 18, 4, 3);
        
        ctx.fillRect(0, 20, 2, 4);
        ctx.fillRect(2, 22, 2, 4);
        ctx.fillRect(4, 24, 2, 4);
        ctx.fillRect(6, 26, 2, 4);
        
        const anim = Math.floor(tick / 5) % 2;
        if (!isGrounded) {
          ctx.fillRect(4, 30, 4, 6);
          ctx.fillRect(12, 30, 4, 6);
        } else {
          if (anim === 0) {
            ctx.fillRect(5, 30, 3, 10);
            ctx.fillRect(12, 30, 3, 6);
            ctx.fillRect(15, 33, 3, 3);
          } else {
            ctx.fillRect(5, 30, 3, 6);
            ctx.fillRect(2, 33, 3, 3);
            ctx.fillRect(12, 30, 3, 10);
          }
        }
      }
      ctx.restore();
    }

    function drawCactus(ctx, x, y, width, height) {
      ctx.save();
      ctx.translate(x, y);
      
      ctx.fillStyle = accentColor;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 10;
      
      if (chosenObstacle === 'obs_option_2') {
        // Spike Wheel
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - 2;
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Date.now() / 200);
        
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = accentColor;
        for (let a = 0; a < 8; a++) {
          const angle = (a * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          ctx.stroke();
        }
        ctx.restore();
      } else if (chosenObstacle === 'obs_option_3') {
        // Laser Gate
        ctx.fillRect(0, 0, 5, height);
        ctx.fillRect(width - 5, 0, 5, height);
        if (Math.random() > 0.15) {
          ctx.fillStyle = '#ffea00';
          ctx.shadowColor = '#ffea00';
          ctx.fillRect(5, height / 2 - 2, width - 10, 4);
        }
      } else if (chosenObstacle === 'obs_option_4') {
        // Cyber Drone
        const hover = Math.sin(Date.now() / 150) * 4;
        ctx.translate(0, hover);
        
        ctx.fillRect(2, height / 2 - 6, width - 4, 12);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(width / 2 - 3, height / 2 + 6, 6, 4);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4, height / 2 - 10, width - 8, 2);
      } else {
        // Default Cactus
        const trunkWidth = Math.max(6, Math.floor(width * 0.3));
        const cx = Math.floor(width / 2);
        
        ctx.fillRect(cx - trunkWidth / 2, 0, trunkWidth, height);
        
        const lBranchY = Math.floor(height * 0.5);
        const branchH = Math.floor(height * 0.35);
        const branchW = Math.max(4, Math.floor(width * 0.25));
        ctx.fillRect(0, lBranchY, cx - trunkWidth / 2, branchW);
        ctx.fillRect(0, lBranchY - branchH, branchW, branchH + branchW);
        
        const rBranchY = Math.floor(height * 0.35);
        const rBranchH = Math.floor(height * 0.3);
        ctx.fillRect(cx + trunkWidth / 2, rBranchY, width - (cx + trunkWidth / 2), branchW);
        ctx.fillRect(width - branchW, rBranchY - rBranchH, branchW, rBranchH + branchW);
      }
      
      ctx.restore();
    }

    // Controls
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
        jump();
      }
    });
    canvas.addEventListener('click', jump);

    // Gesture input mapping
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      
      // Jump trigger: jump parameter or mouth open or shoot pinch
      if (data.jump || data.mouthOpen || data.shoot) {
        jump();
      }
    });

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    function startGame() {
      menuOverlay.style.display = 'none';
      gameoverOverlay.style.display = 'none';
      score = 0;
      speed = 4.5;
      distanceCount = 0;
      runTick = 0;
      obstacles = [];
      particles = [];
      initBackground();
      dino.y = groundY - dino.height;
      dino.vy = 0;
      dino.isGrounded = true;
      scoreVal.textContent = score;
      gameActive = true;
      animate();
    }

    let spawnTimer = 0;

    function animate() {
      if (!gameActive) return;
      
      // Clear canvas
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      runTick++;

      // Draw background depending on chosen option
      if (chosenBackground === 'bg_option_2') {
        // Matrix Rain
        ctx.save();
        ctx.shadowBlur = 4;
        for (let c = 0; c < 25; c++) {
          const colX = (c * 32) % canvas.width;
          const colSpeed = 1.2 + (c % 3) * 0.4;
          const colY = ((runTick * colSpeed) % (groundY + 80)) - 40;
          
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.fillRect(colX, colY, 3, 6);
          
          ctx.fillStyle = 'rgba(0, 255, 102, 0.4)';
          ctx.shadowColor = '#00ff66';
          ctx.fillRect(colX, colY - 15, 3, 15);
          ctx.fillStyle = 'rgba(0, 255, 102, 0.15)';
          ctx.fillRect(colX, colY - 30, 3, 15);
        }
        ctx.restore();
      } else if (chosenBackground === 'bg_option_3') {
        // Retrowave Grid
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        ctx.shadowBlur = 0;
        
        const horizonY = groundY - 120;
        const horizonX = canvas.width / 2;
        
        for (let gx = -200; gx <= canvas.width + 200; gx += 50) {
          ctx.beginPath();
          ctx.moveTo(gx, groundY);
          ctx.lineTo(horizonX + (gx - horizonX) * 0.15, horizonY);
          ctx.stroke();
        }
        
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(canvas.width, horizonY);
        ctx.stroke();
        
        const gridOffset = (runTick * 0.6) % 25;
        for (let gy = horizonY; gy < groundY; gy += 25) {
          const yPos = gy + gridOffset;
          if (yPos < groundY) {
            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(canvas.width, yPos);
            ctx.stroke();
          }
        }
        ctx.restore();
      } else if (chosenBackground === 'bg_option_4') {
        // Space Nebula
        ctx.save();
        const nebX = ((runTick * 0.15) % (canvas.width + 400)) - 200;
        let grad1 = ctx.createRadialGradient(nebX, 80, 20, nebX, 80, 160);
        grad1.addColorStop(0, 'rgba(179, 0, 255, 0.35)');
        grad1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, canvas.width, groundY);

        const neb2X = (((runTick * 0.08) + 320) % (canvas.width + 400)) - 200;
        let grad2 = ctx.createRadialGradient(neb2X, 140, 10, neb2X, 140, 110);
        grad2.addColorStop(0, 'rgba(255, 0, 85, 0.25)');
        grad2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, canvas.width, groundY);
        ctx.restore();
      } else {
        // Option 1 (Default): Twinkling Stars + Parallax Mountains
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffffff';
        stars.forEach(star => {
          star.x -= star.speed;
          if (star.x < 0) {
            star.x = canvas.width;
            star.y = Math.random() * (groundY - 100);
          }
          ctx.fillRect(star.x, star.y, star.size, star.size);
        });
        
        mountains.forEach(mtn => {
          mtn.x -= mtn.speed;
          if (mtn.x + mtn.width < 0) {
            mtn.x = canvas.width + Math.random() * 50;
          }
          
          ctx.fillStyle = mtn.color;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.moveTo(mtn.x, groundY);
          ctx.lineTo(mtn.x + mtn.width / 2, groundY - mtn.height);
          ctx.lineTo(mtn.x + mtn.width, groundY);
          ctx.closePath();
          ctx.fill();
          
          ctx.strokeStyle = mtn.outline;
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 6;
          ctx.shadowColor = mtn.outline;
          ctx.beginPath();
          ctx.moveTo(mtn.x, groundY);
          ctx.lineTo(mtn.x + mtn.width / 2, groundY - mtn.height);
          ctx.lineTo(mtn.x + mtn.width, groundY);
          ctx.stroke();
        });
      }

      // 3. Draw Neon Ground Line
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = borderColor;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(canvas.width, groundY);
      ctx.stroke();

      // Draw scrolling ground grid speed-marks
      ctx.save();
      ctx.strokeStyle = borderColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      const groundOffset = (runTick * speed) % 40;
      for (let gx = -groundOffset; gx < canvas.width + 40; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, groundY);
        ctx.lineTo(gx - 12, groundY + 14);
        ctx.stroke();
      }
      ctx.restore();

      // Update Dino physics
      dino.y += dino.vy;
      dino.vy += dino.gravity;

      if (dino.y >= groundY - dino.height) {
        dino.y = groundY - dino.height;
        dino.vy = 0;
        dino.isGrounded = true;
      }

      // 4. Draw Pixelated Cyber Dino
      drawDino(ctx, dino.x, dino.y, dino.width, dino.height, dino.isGrounded, runTick);

      // Obstacles Spawning
      spawnTimer++;
      const nextSpawn = Math.random() * 45 + 75; // variable intervals
      if (spawnTimer > nextSpawn) {
        spawnObstacle();
        spawnTimer = 0;
      }

      // Update and Draw Obstacles
      obstacles.forEach((obs, index) => {
        obs.x -= speed;
        
        // 5. Draw Cyber Cactus
        drawCactus(ctx, obs.x, obs.y, obs.width, obs.height);

        // Check collision
        if (
          dino.x < obs.x + obs.width &&
          dino.x + dino.width > obs.x &&
          dino.y < obs.y + obs.height &&
          dino.y + dino.height > obs.y
        ) {
          spawnExplosion(dino.x + dino.width / 2, dino.y + dino.height / 2, '#00e5ff');
          spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color);
          gameActive = false;
          if (score > highscore) {
            highscore = score;
            highscoreVal.textContent = highscore;
          }
          gameoverOverlay.style.display = 'flex';
        }

        // Off screen delete
        if (obs.x < -obs.width) {
          obstacles.splice(index, 1);
        }
      });

      // Update score over time
      distanceCount++;
      if (distanceCount > 10) {
        score++;
        scoreVal.textContent = score;
        distanceCount = 0;
        
        // speed increases slightly
        if (score % 100 === 0) {
          speed += 0.5;
        }
      }

      // Draw and Update Explosion Particles
      particles.forEach((part, pIdx) => {
        part.x += part.vx;
        part.y += part.vy;
        part.life--;
        ctx.fillStyle = part.color;
        ctx.shadowColor = part.color;
        ctx.shadowBlur = 5;
        ctx.fillRect(part.x, part.y, part.size, part.size);

        if (part.life <= 0) {
          particles.splice(pIdx, 1);
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
  fruitNinja,
  spaceShooter,
  dinoRunner
};
