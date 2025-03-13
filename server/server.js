const express = require('express');
const bodyParser = require('body-parser');
const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Path to the JSON file for storing high scores locally
const highScoresFilePath = path.join(__dirname, 'highscores.json');

// Initialize high scores file if it doesn't exist
if (!fs.existsSync(highScoresFilePath)) {
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

// Helper functions for file-based storage
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

// Initialize Firestore
const firestore = new Firestore({
  databaseId: 'highscores'
});
const highScoresCollection = firestore.collection('highscores');


// Middleware to restrict access to einarnot.github.io
const restrictToDomain = (req, res, next) => {
  const allowedOrigin = 'https://einarnot.github.io';
  const origin = req.headers.origin || req.headers.referer;

  // Normalize referer by removing trailing slashes or paths if present
  const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';

  if (!normalizedOrigin || normalizedOrigin !== allowedOrigin) {
    return res.status(403).json({ error: 'Access denied: Unauthorized' });
  }
  next();
};

// Apply the middleware to all routes (or specific ones)
app.use(restrictToDomain);
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

app.use(bodyParser.json());

// Serve bad words lists
app.get('/badwords/:file', (req, res) => {
  const fileName = req.params.file;
  
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

app.get('/highscores', async (req, res) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    try {
      const highScores = readHighScoresFromFile();
      highScores.sort((a, b) => b.score - a.score);
      return res.json(highScores);
    } catch (error) {
      console.error('Error reading high scores from file:', error);
      return res.status(500).json({ error: 'Failed to retrieve high scores' });
    }
  }

  try {
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
    try {
      const highScores = readHighScoresFromFile();
      const newScore = {
        name,
        score: Number(score),
        id: Date.now().toString()
      };
      
      highScores.push(newScore);
      highScores.sort((a, b) => b.score - a.score);
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
    try {
      const snapshot = await highScoresCollection.orderBy('score', 'desc').get();
      const highScores = snapshot.docs.map(doc => ({ 
        id: doc.id,
        ...doc.data()
      }));
      
      if (highScores.length < 20 || Number(score) > highScores[highScores.length - 1].score) {
        const docRef = await highScoresCollection.add({ name, score: Number(score) });
        
        if (highScores.length >= 20) {
          const lowestScore = highScores[highScores.length - 1];
          await highScoresCollection.doc(lowestScore.id).delete();
        }
        
        res.status(201).json({ message: 'Score added successfully', id: docRef.id });
      } else {
        res.status(200).json({ message: 'Score not high enough for leaderboard' });
      }
    } catch (error) {
      console.error('Error adding score to Firestore:', error.code, error.message);
      res.status(500).json({ error: 'Failed to add score', details: error.message });
    }
  }
});

app.post('/reset-highscores', (req, res) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  if (!isLocalhost) {
    return res.status(403).json({ error: 'This operation is only allowed on localhost' });
  }
  
  try {
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