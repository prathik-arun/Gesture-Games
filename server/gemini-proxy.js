const WebSocket = require('ws');

function initGeminiProxy(wss) {
  wss.on('connection', (clientWs, req) => {
    const isMouthGame = req && req.url && req.url.includes('mouth');
    console.log(`[Proxy] Client connected. Game mode: ${isMouthGame ? 'Mouth Detection (Flappy Mouth)' : 'Body Motion (Dead Zone/Gesture Ninja)'}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Proxy] GEMINI_API_KEY is not defined in environment.');
      clientWs.send(JSON.stringify({ type: 'error', message: 'API Key not configured on server.' }));
      clientWs.close(1008, 'API Key not configured');
      return;
    }

    // Connect to Gemini 2.0 Live WebSocket API (v1beta)
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    
    console.log('[Proxy] Connecting to Gemini Live API...');
    const geminiWs = new WebSocket(geminiUrl);

    let accumulatedText = '';

    geminiWs.on('open', () => {
      console.log('[Proxy] Connected to Gemini Live API.');

      let instructionText = '';
      if (isMouthGame) {
        instructionText = `You are a real-time face and mouth detector for a video game. 
Analyze each video frame and respond ONLY with a valid JSON object — no other text, no markdown, no explanation.

The JSON must always have this exact structure:
{
  "mouthOpen": true/false
}

Rules:
- "mouthOpen" is true when the person's mouth is visibly open (lips parted, teeth showing, or jaw dropped). Even a slight opening counts. It is false when their mouth is closed.
- Never respond with anything except the JSON object.`;
      } else {
        instructionText = `You are a real-time body movement detector for a video game. 
Analyze each video frame and respond ONLY with a valid JSON object — no other text, no markdown, no explanation.

The JSON must always have this exact structure:
{
  "walking": true/false,
  "lean": "left" | "right" | "center",
  "jump": true/false,
  "confidence": "low" | "medium" | "high"
}

Rules:
- "walking" is true when the person is visibly lifting their knees alternately (marching in place). Even small knee lifts should count. If legs are moving at all, walking = true.
- "lean" is "left" when the person's shoulders or torso shift clearly to their left side. "right" when shifted to the right. "center" when upright.
- "jump" is true when the person's body visibly rises or they crouch and spring up.
- Always respond even if the image is unclear — make your best guess and set confidence to "low".
- Never respond with anything except the JSON object.`;
      }

      // Send initial setup configurations
      const setupMessage = {
        setup: {
          model: 'models/gemini-3.1-flash-live-preview',
          generationConfig: {
            responseModalities: ['AUDIO']
          },
          systemInstruction: {
            parts: [
              {
                text: instructionText
              }
            ]
          }
        }
      };

      geminiWs.send(JSON.stringify(setupMessage));
      clientWs.send(JSON.stringify({ type: 'status', status: 'connected' }));
    });

    geminiWs.on('message', (data) => {
      try {
        const rawStr = data.toString();
        // Log a snippet of the message to console to check format
        console.log('[Proxy] Received message from Gemini:', rawStr.substring(0, 250));
        const response = JSON.parse(rawStr);
        
        if (response.serverContent) {
          // Extract text from outputTranscription (Gemini 3.1 Live API)
          if (response.serverContent.outputTranscription && response.serverContent.outputTranscription.text) {
            console.log('[Proxy] Gemini outputTranscription text:', response.serverContent.outputTranscription.text);
            accumulatedText += response.serverContent.outputTranscription.text;
          }

          // Fallback/standard extraction from parts text
          const parts = response.serverContent.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                console.log('[Proxy] Gemini part text:', part.text);
                accumulatedText += part.text;
              }
            }
          }

          // Check if we can parse the JSON or if turn is complete
          let isComplete = response.serverContent.turnComplete || response.serverContent.generationComplete;
          
          // Try to extract and validate JSON if we have some text
          if (accumulatedText.trim().length > 0) {
            let parsedJson = null;
            let rawText = accumulatedText.trim();
            
            // Clean markdown syntax if Gemini accidentally includes it
            if (rawText.startsWith('```')) {
              rawText = rawText.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
            }

            try {
              parsedJson = JSON.parse(rawText);
              console.log('[Proxy] Successfully parsed JSON:', parsedJson);
            } catch (e) {
              // Not fully received yet, wait if turn isn't complete
            }

            if (parsedJson || isComplete) {
              if (parsedJson) {
                console.log('[Proxy] Sending movement data to client:', parsedJson);
                clientWs.send(JSON.stringify({
                  type: 'movement',
                  data: parsedJson
                }));
              } else {
                console.warn('[Proxy] Gemini sent non-JSON or incomplete response:', rawText);
                clientWs.send(JSON.stringify({
                  type: 'error',
                  message: 'Invalid response format from AI.'
                }));
              }
              accumulatedText = ''; // reset for next response
            }
          }
        }
      } catch (err) {
        console.error('[Proxy] Error parsing Gemini message:', err);
      }
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`[Proxy] Gemini connection closed. Code: ${code}, Reason: ${reason}`);
      clientWs.send(JSON.stringify({ type: 'status', status: 'disconnected', reason: reason.toString() }));
      clientWs.close();
    });

    geminiWs.on('error', (error) => {
      console.error('[Proxy] Gemini WebSocket error:', error);
      clientWs.send(JSON.stringify({ type: 'error', message: 'Gemini connection error.' }));
    });

    // Handle incoming frames from client
    clientWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'frame' && parsed.image) {
          console.log(`[Proxy] Client sent image frame (base64 length: ${parsed.image.length})`);
          // If gemini is ready, send the frame
          if (geminiWs.readyState === WebSocket.OPEN) {
            const frameMessage = {
              realtimeInput: {
                video: {
                  mimeType: 'image/jpeg',
                  data: parsed.image // base64 JPEG string
                }
              }
            };
            geminiWs.send(JSON.stringify(frameMessage));
            console.log('[Proxy] Sent frame to Gemini Live API');
          } else {
            console.log(`[Proxy] Cannot send frame: Gemini WebSocket state is ${geminiWs.readyState}`);
          }
        }
      } catch (err) {
        console.error('[Proxy] Error handling client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('[Proxy] Client disconnected.');
      if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
        geminiWs.close();
      }
    });
  });
}

module.exports = { initGeminiProxy };
