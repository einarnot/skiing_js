# CROSS COUNTRY OR DIE

**CROSS COUNTRY OR DIE** is a thrilling cross-country skiing game where you ski to a rhythm, dodge obstacles, and aim for the top of the leaderboard. Built almost entirely with **Claude Code**, with some manual tweaks via **Grok**, it’s a showcase of AI-driven game development with a human touch.

## Gameplay

- **Objective**: Ski as far as possible by maintaining rhythm and avoiding obstacles.
- **Mechanics**: Alternate left and right arrow keys to ski in rhythm. Jump over fallen skiers with the spacebar and duck under bridges with the down arrow. Speed increases with good timing, making it tougher!
- **Feedback**: A rhythm bar (green = good, red = bad) shows your timing.
- **Obstacles**: Jump over fallen skiers, duck under bridges.
- **Spectators**: Cheering crowds with campfires or tents line the route.
- **Leaderboard**: Top 20 scores are saved—submit yours if you rank!

## Controls

- **← / →**: Ski rhythmically
- **Spacebar**: Jump
- **↓**: Duck
- **L**: View leaderboard

## How to Play

1. **Start**: Press `Spacebar` on the start screen.
2. **Ski**: Keep the rhythm, avoid obstacles, rack up points.
3. **Game Over**: Hit an obstacle, then submit your score if it’s high enough.
4. **Leaderboard**: Check top scores with `L`.

## Deployment

The game is deployed and can be played at [https://einarnot.github.io/skiing_js/](https://einarnot.github.io/skiing_js/).

## Development

Created almost entirely with **Claude Code**, enhanced by **Grok** manual prompts. The game runs in any modern browser using HTML5 canvas and interacts with a backend server for high scores and content filtering.

## Server

The backend is powered by a Node.js server (`server.js`) that handles:

- **High Scores Management**: Stores and retrieves high scores using a local JSON file for development (localhost) and Google Firestore for production.
- **Bad Words Filtering**: Serves lists of bad words (English and Norwegian) for client-side filtering.
- **Access Control**: Restricts API access to requests from the allowed domain (`https://einarnot.github.io`).

The server is configured to run on port 3000 by default but can be overridden by setting the `PORT` environment variable.

The complete `server.js` code is available in the repository for reference.

## Contributing

Got ideas or found a bug? Open an [issue](https://github.com/einarnot/skiing_js/issues) or submit a pull request!
