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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Generate a list of 18 simple, highly recognizable, and guessable words or phrases for the game Dumb Charades matching the topic "${topic}". The items should be easy to act out physically without speaking. Return ONLY a JSON array of strings, for example: ["Titanic", "Iron Man", "Home Alone"]`
          }]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No content returned from Gemini API');
    }

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

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`[Server] Web portal running at http://localhost:${PORT}`);
});

// Start the WebSocket proxy server on port 8080
const wss = new WebSocket.Server({ port: 8080 }, () => {
  console.log('[Server] WebSocket proxy running at ws://localhost:8080');
});

initGeminiProxy(wss);
