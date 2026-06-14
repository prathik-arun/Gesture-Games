const express = require('express');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();
const { initGeminiProxy } = require('./gemini-proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets from the project root directory
app.use(express.static(path.join(__dirname, '..')));

// Route for health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
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
