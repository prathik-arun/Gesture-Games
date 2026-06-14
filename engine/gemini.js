class GeminiClient {
  constructor() {
    this.ws = null;
    this.streamInterval = null;
    this.videoElement = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    
    // Handlers
    this.onMovementCallback = null;
    this.onStatusCallback = null;
    this.onErrorCallback = null;
    
    // Config
    this.frameRateMs = 1000; // send frame every 1000ms (1 FPS to match Gemini Live API limits and prevent quota errors)
    
    // Hidden canvas for frame extraction
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');
  }

  connect(url = 'ws://localhost:8080') {
    if (this.ws) {
      this.disconnect();
    }

    this.status = 'connecting';
    this.triggerStatus(this.status);

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('[GeminiClient] Failed to create WebSocket connection:', e);
      this.status = 'disconnected';
      this.triggerStatus(this.status);
      this.triggerError('Failed to connect to proxy server.');
      return;
    }

    this.ws.onopen = () => {
      console.log('[GeminiClient] Connected to local WebSocket proxy.');
      // Wait for status 'connected' from proxy (indicating Gemini itself is ready)
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'status') {
          this.status = msg.status;
          this.triggerStatus(this.status);
          console.log(`[GeminiClient] Server status: ${msg.status}`);
        } else if (msg.type === 'movement') {
          if (this.onMovementCallback) {
            this.onMovementCallback(msg.data);
          }
        } else if (msg.type === 'error') {
          console.error('[GeminiClient] Server error:', msg.message);
          this.triggerError(msg.message);
        }
      } catch (err) {
        console.error('[GeminiClient] Error parsing message:', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[GeminiClient] Connection closed.');
      this.status = 'disconnected';
      this.triggerStatus(this.status);
      this.stopStreaming();
    };

    this.ws.onerror = (err) => {
      console.error('[GeminiClient] WebSocket error:', err);
      this.triggerError('WebSocket connection error.');
    };
  }

  disconnect() {
    this.stopStreaming();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    this.triggerStatus(this.status);
  }

  startStreaming(videoElement) {
    if (!videoElement) {
      console.error('[GeminiClient] Video element required for streaming.');
      return;
    }

    this.videoElement = videoElement;
    this.stopStreaming(); // Clear any existing stream loop

    console.log('[GeminiClient] Starting frame stream to Gemini Live API...');
    this.streamInterval = setInterval(() => {
      this.sendFrame();
    }, this.frameRateMs);
  }

  stopStreaming() {
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
      console.log('[GeminiClient] Frame stream stopped.');
    }
  }

  sendFrame() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.status !== 'connected') {
      return; // Only send if WebSocket is open and Gemini is connected
    }

    if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
      return;
    }

    try {
      // Draw frame to hidden canvas
      this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
      
      // Convert to base64 JPEG
      const dataUrl = this.canvas.toDataURL('image/jpeg', 0.6); // 0.6 compression quality
      const base64Image = dataUrl.split(',')[1];
      
      // Send to proxy
      this.ws.send(JSON.stringify({
        type: 'frame',
        image: base64Image
      }));
    } catch (e) {
      console.error('[GeminiClient] Error capturing or sending frame:', e);
    }
  }

  // Register events
  onMovement(callback) {
    this.onMovementCallback = callback;
  }

  onStatus(callback) {
    this.onStatusCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  triggerStatus(status) {
    if (this.onStatusCallback) {
      this.onStatusCallback(status);
    }
  }

  triggerError(message) {
    if (this.onErrorCallback) {
      this.onErrorCallback(message);
    }
  }
}

// Export class if running in a module context, otherwise attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GeminiClient };
} else {
  window.GeminiClient = GeminiClient;
}
