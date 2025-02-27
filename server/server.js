const express = require('express');
const bodyParser = require('body-parser');
const { Firestore } = require('@google-cloud/firestore');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Firestore
const firestore = new Firestore({
  projectId: 'skiingjs', // Replace with your GCP project ID
  keyFilename: './skiingjs-893ba64abde3.json', // Path to your key file
});
const highScoresCollection = firestore.collection('highscores');

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Route to get the top 10 high scores
app.get('/highscores', async (req, res) => {
  try {
    const snapshot = await highScoresCollection.orderBy('score', 'desc').limit(10).get();
    const highScores = snapshot.docs.map(doc => doc.data());
    res.json(highScores);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve high scores' });
  }
});

// Route to post a new high score
app.post('/highscores', async (req, res) => {
  const { name, score } = req.body;
  if (!name || !score) {
    return res.status(400).json({ error: 'Name and score are required' });
  }
  try {
    await highScoresCollection.add({ name, score });
    res.status(201).json({ message: 'Score added successfully' });
  } catch (error) {
    console.error('Error adding score:', error);
    res.status(500).json({ error: 'Failed to add score', details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});