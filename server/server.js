const express = require('express');
const bodyParser = require('body-parser');
const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// API key for authentication (this would normally be in environment variables)
const API_KEY = 'API_KEY_PLACEHOLDER'; // REPLACE with your actual key in production

// Path to the JSON file for storing high scores locally
const highScoresFilePath = path.join(__dirname, 'highscores.json');

// Initialize high scores file if it doesn't exist
if (!fs.existsSync(highScoresFilePath)) {
  // Create initial data with some example scores
  const initialData = [
    { "name": "Player1", "score": 1005 },
    { "name": "Player2", "score": 950 },
    { "name": "Player3", "score": 900 },
    { "name": "Player4", "score": 850 },
    { "name": "Player5", "score": 800 }
  ];
  fs.writeFileSync(highScoresFilePath, JSON.stringify(initialData, null, 2));
  console.log('Created initial high scores file');
}

// Helper functions for file-based storage (used in localhost)
function readHighScoresFromFile() {
  try {
    const data = fs.readFileSync(highScoresFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading high scores file:', error);
    return [];
  }
}

function writeHighScoresToFile(highScores) {
  try {
    fs.writeFileSync(highScoresFilePath, JSON.stringify(highScores, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing high scores file:', error);
    return false;
  }
}

// Initialize Firestore (used in production)
const firestore = new Firestore({
  databaseId: 'highscores'
});
const highScoresCollection = firestore.collection('highscores');

app.use(bodyParser.json());

// Middleware to verify API key
const verifyApiKey = (req, res, next) => {
  // Check API key in headers or query params
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
};

// Serve bad words lists with authentication
app.get('/badwords/:file', verifyApiKey, (req, res) => {
  const fileName = req.params.file;
  
  // Only allow specific files
  if (fileName !== 'en.txt' && fileName !== 'no.txt') {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const filePath = path.join(__dirname, 'badwords', fileName);
  
  try {
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/plain');
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

// Apply API key verification to all routes
app.use(verifyApiKey);

// For CORS preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.sendStatus(200);
});

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  next();
});

app.get('/highscores', async (req, res) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // When running locally, read from file
    try {
      const highScores = readHighScoresFromFile();
      // Sort by score in descending order
      highScores.sort((a, b) => b.score - a.score);
      return res.json(highScores);
    } catch (error) {
      console.error('Error reading high scores from file:', error);
      return res.status(500).json({ error: 'Failed to retrieve high scores' });
    }
  }

  // In production, use Firestore
  try {
    // Get up to 20 high scores
    const snapshot = await highScoresCollection.orderBy('score', 'desc').limit(20).get();
    const highScores = snapshot.docs.map(doc => doc.data());
    res.json(highScores);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve high scores' });
  }
});

app.post('/highscores', async (req, res) => {
  const { name, score } = req.body;
  if (!name || !score) {
    return res.status(400).json({ error: 'Name and score are required' });
  }

  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // When running locally, save to file
    try {
      const highScores = readHighScoresFromFile();
      
      // Add the new score
      const newScore = {
        name,
        score: Number(score), // Ensure score is stored as a number
        id: Date.now().toString() // Create a unique ID
      };
      
      highScores.push(newScore);
      
      // Sort by score (highest first)
      highScores.sort((a, b) => b.score - a.score);
      
      // Keep only the top 20 scores
      const topHighScores = highScores.slice(0, 20);
      
      const success = writeHighScoresToFile(topHighScores);
      
      if (success) {
        res.status(201).json({ message: 'Score added successfully', id: newScore.id });
      } else {
        res.status(500).json({ error: 'Failed to save score to file' });
      }
    } catch (error) {
      console.error('Error adding score to file:', error);
      res.status(500).json({ error: 'Failed to add score', details: error.message });
    }
  } else {
    // In production, use Firestore
    try {
      // Get current scores to determine if we need to add this one
      const snapshot = await highScoresCollection.orderBy('score', 'desc').get();
      const highScores = snapshot.docs.map(doc => ({ 
        id: doc.id,
        ...doc.data()
      }));
      
      // If we have less than 20 scores or this score is higher than the lowest one
      if (highScores.length < 20 || Number(score) > highScores[highScores.length - 1].score) {
        // Add the new score
        const docRef = await highScoresCollection.add({ name, score: Number(score) });
        
        // If we have more than 20 scores now, delete the lowest one
        if (highScores.length >= 20) {
          // Find the document with the lowest score
          const lowestScore = highScores[highScores.length - 1];
          await highScoresCollection.doc(lowestScore.id).delete();
        }
        
        res.status(201).json({ message: 'Score added successfully', id: docRef.id });
      } else {
        // Score not high enough for the leaderboard
        res.status(200).json({ message: 'Score not high enough for leaderboard' });
      }
    } catch (error) {
      console.error('Error adding score to Firestore:', error.code, error.message);
      res.status(500).json({ error: 'Failed to add score', details: error.message });
    }
  }
});

// Route to reset high scores (only available on localhost for testing)
app.post('/reset-highscores', (req, res) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  if (!isLocalhost) {
    return res.status(403).json({ error: 'This operation is only allowed on localhost' });
  }
  
  try {
    // Initial data with some example scores
    const initialData = [
      { "name": "Player1", "score": 1005 },
      { "name": "Player2", "score": 950 },
      { "name": "Player3", "score": 900 },
      { "name": "Player4", "score": 850 },
      { "name": "Player5", "score": 800 }
    ];
    
    const success = writeHighScoresToFile(initialData);
    
    if (success) {
      res.json({ message: 'High scores reset successfully' });
    } else {
      res.status(500).json({ error: 'Failed to reset high scores' });
    }
  } catch (error) {
    console.error('Error resetting high scores:', error);
    res.status(500).json({ error: 'Failed to reset high scores', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Using ${port === 3000 ? 'file-based storage' : 'Firestore'} for high scores`);
});