const express = require('express');
const bodyParser = require('body-parser');
const { Firestore } = require('@google-cloud/firestore');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Firestore
const firestore = new Firestore({
  databaseId: 'highscores'
});
const highScoresCollection = firestore.collection('highscores');

app.use(bodyParser.json());

// Middleware to restrict access to einarnot.github.io
const restrictToDomain = (req, res, next) => {
  const allowedOrigin = 'https://einarnot.github.io';
  const origin = req.headers.origin || req.headers.referer;

  // Normalize referer by removing trailing slashes or paths if present
  const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';

  if (!normalizedOrigin || normalizedOrigin !== allowedOrigin) {
    return res.status(403).json({ error: 'Access denied: Unauthorized origin' });
  }
  next();
};

// Apply the middleware to all routes (or specific ones)
app.use(restrictToDomain);

app.get('/highscores', async (req, res) => {
  try {
    const snapshot = await highScoresCollection.orderBy('score', 'desc').limit(10).get();
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
  try {
    const docRef = await highScoresCollection.add({ name, score });
    res.status(201).json({ message: 'Score added successfully', id: docRef.id });
  } catch (error) {
    console.error('Error adding score:', error.code, error.message);
    res.status(500).json({ error: 'Failed to add score', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});