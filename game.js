// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const SKIER_VERTICAL_OFFSET = 65;
const FPS = 60;
const SERVER_URL = 'https://skiingjs.appspot.com';

// Game variables
let canvas, ctx;
let score = 0;
let worldX = 0;
let highScores = [];

// Game state management
const GameScreen = {
  START: 'start',
  PLAYING: 'playing',
  GAME_OVER: 'gameOver'
};

let currentScreen = GameScreen.START;

// Skier properties
let skier = {
    x: 100,
    y: CANVAS_HEIGHT - SKIER_VERTICAL_OFFSET,
    speed: 0,
    maxSpeed: 5,
    jumpVelocity: -12,
    gravity: 0.5,
    isJumping: false,
    isDucking: false, // For ducking under bridges
    duckTimer: 0,      // How long to stay ducked
    yVelocity: 0,
    animationFrame: 0, // 0 or 1 for diagonal stride poses
    animationProgress: 0, // For smooth animation transitions
    poleAngle: 0, // For dynamic pole movement
    bodyLean: 0, // Forward lean that increases with speed
    height: 60    // Normal skier height (reduced when ducking)
};

// Rhythm mechanics
let lastKeyTime = Date.now();
const TARGET_RHYTHM = 400; // 0.4s between taps
const BASE_RHYTHM_TOLERANCE = 200; // ±0.2s - starting tolerance
const MIN_RHYTHM_TOLERANCE = 80; // Minimum tolerance at max speed
let rhythmTolerance = BASE_RHYTHM_TOLERANCE; // Current tolerance (decreases with speed)
let lastKey = null;
let rhythmScore = 0.3; // Start with some momentum (0 to 1)
const RHYTHM_DECAY = 0.01; // Slower decay
const RHYTHM_GAIN = 0.15; // Faster gain

// Obstacles
let obstacles = [];
const SPAWN_INTERVAL = 120;
let spawnTimer = 0;

// Spectators
let spectators = [];
const SPECTATOR_SPAWN_INTERVAL = 80;
let spectatorSpawnTimer = 0;

// Initialize game
async function init() {
    console.log("Game initializing");
    
    // Make sure MIN_RHYTHM_TOLERANCE is defined
    if (typeof MIN_RHYTHM_TOLERANCE === 'undefined') {
        console.warn("MIN_RHYTHM_TOLERANCE was undefined, setting to default 80");
        window.MIN_RHYTHM_TOLERANCE = 80; // Backup definition
    }
    
    // Get canvas in a try/catch to debug any issues
    try {
        canvas = document.getElementById('gameCanvas');
        if (!canvas) {
            console.error("Canvas element not found!");
            return;
        }
        
        ctx = canvas.getContext('2d');
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        
        console.log("Canvas initialized:", canvas.width, "x", canvas.height);
        
        // Reset critical game variables
        rhythmTolerance = BASE_RHYTHM_TOLERANCE;
        feedbackActive = false;
        
        // Fetch high scores from server
        try {
            await fetchHighScores();
        } catch (error) {
            console.error("Error fetching high scores:", error);
        }
        
        // Add event listeners for both keydown and click (for mobile/touch support)
        document.addEventListener('keydown', function(e) {
            console.log("Key pressed on document:", e.key, e.code);
            try {
                handleKeyDown(e);
            } catch (error) {
                console.error("Error in document keydown handler:", error);
                gameErrors.push(error.toString());
            }
        });
        
        // Listen for clicks on the canvas
        canvas.addEventListener('click', function() {
            console.log("Canvas clicked on screen:", currentScreen);
            try {
                if (currentScreen === GameScreen.START) {
                    // On start screen, clicking the canvas starts the game
                    console.log("Canvas clicked on start screen - starting game");
                    startGame();
                    return;
                } 
                else if (currentScreen === GameScreen.GAME_OVER) {
                    // On game over screen, clicking goes back to start screen
                    console.log("Canvas clicked on game over screen - returning to start");
                    renderStartScreen();
                    return;
                }
            } catch (error) {
                console.error("Error in canvas click handler:", error);
                gameErrors.push(error.toString());
            }
        });
        
        // Try to add a fallback click handler for the whole document
        document.body.addEventListener('click', function(e) {
            console.log("Body clicked");
            try {
                // Don't handle clicks on buttons - they have their own handlers
                if (e.target.tagName === 'BUTTON') {
                    return;
                }
                
                if (currentScreen !== GameScreen.PLAYING) {
                    // Different behavior based on current screen
                    if (currentScreen === GameScreen.START) {
                        // On start screen, clicking outside the canvas starts the game
                        if (e.target.id !== 'gameCanvas') {
                            console.log("Body clicked on start screen - starting game");
                            startGame();
                        }
                        return;
                    } 
                    else if (currentScreen === GameScreen.GAME_OVER) {
                        // On game over screen, any click goes back to start screen
                        console.log("Body clicked on game over screen - returning to start");
                        renderStartScreen();
                        return;
                    }
                }
            } catch (error) {
                console.error("Error in body click handler:", error);
                gameErrors.push(error.toString());
            }
        });
        
        renderStartScreen();
        console.log("Render start screen complete");
        
    } catch (error) {
        console.error("Error initializing game:", error);
        gameErrors.push(error.toString());
        
        // Show error on screen
        if (ctx) {
            ctx.fillStyle = 'red';
            ctx.font = '16px Arial';
            ctx.fillText("Error initializing game: " + error.toString(), 50, 200);
        }
    }
}

// Handle key presses
function handleKeyDown(event) {
    const currentTime = Date.now();

    // Debug log to see what key was pressed
    console.log("Key pressed:", event.key, "Current screen:", currentScreen);

    if (currentScreen !== GameScreen.PLAYING) {
        // Space key handling (either start the game or return to main screen)
        if (event.key === ' ' || event.code === 'Space') {
            // Different behavior based on current screen
            if (currentScreen === GameScreen.START) {
                // On start screen - start the game
                console.log("Space key pressed on start screen - starting game");
                startGame();
                return;
            } 
            else if (currentScreen === GameScreen.GAME_OVER) {
                // On game over screen - return to start screen
                console.log("Space key pressed on game over screen - returning to start");
                renderStartScreen();
                return;
            }
        }
        
        // L key for leaderboard functions
        if (event.key === 'l' || event.key === 'L') {
            console.log("L key pressed - viewing leaderboard");
            showFullLeaderboard();
            return;
        }
        
        return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const timeDiff = currentTime - lastKeyTime;
        
        // Calculate rhythm tolerance based on current speed (harder at high speeds)
        rhythmTolerance = BASE_RHYTHM_TOLERANCE - (BASE_RHYTHM_TOLERANCE - MIN_RHYTHM_TOLERANCE) * rhythmScore;
        
        // Always alternate between left and right for animation
        if (lastKey !== event.key) {
            skier.animationFrame = (skier.animationFrame + 1) % 2;
            skier.animationProgress = 0; // Reset animation progress for fluid movement
            
            // Check if timing is good
            if (timeDiff >= TARGET_RHYTHM - rhythmTolerance &&
                timeDiff <= TARGET_RHYTHM + rhythmTolerance) {
                // Good rhythm - increase speed
                rhythmScore = Math.min(rhythmScore + RHYTHM_GAIN, 1);
                // Flash visual feedback
                showRhythmFeedback(true);
            } else {
                // Bad rhythm - small penalty but don't reset completely
                rhythmScore = Math.max(rhythmScore - RHYTHM_GAIN * 0.5, 0.1);
                showRhythmFeedback(false);
            }
            
            // Always move forward, just at different speeds
            skier.speed = skier.maxSpeed * Math.max(rhythmScore, 0.2); 
        }
        
        lastKey = event.key;
        lastKeyTime = currentTime;
    } else if (event.key === ' ' && !skier.isJumping) {
        // Jump over obstacles
        skier.isJumping = true;
        skier.yVelocity = skier.jumpVelocity;
    } else if (event.key === 'ArrowDown') {
        // Duck under bridges
        if (!skier.isDucking && !skier.isJumping) {
            skier.isDucking = true;
            skier.duckTimer = 45; // Duck for 40 frames (about 0.67 second) - longer duck for bridges
        }
    }
}

// Start the game
function startGame() {
    console.log("startGame function called");
    currentScreen = GameScreen.PLAYING;
    score = 0;
    worldX = 0;
    skier.y = CANVAS_HEIGHT - SKIER_VERTICAL_OFFSET;
    skier.isJumping = false;
    skier.isDucking = false;
    skier.yVelocity = 0;
    skier.speed = skier.maxSpeed * 0.2; // Start with some speed
    rhythmScore = 0.3; // Start with some rhythm
    lastKeyTime = Date.now();
    obstacles = [];
    spawnTimer = 0;
    spectators = [];
    spectatorSpawnTimer = 0;
    feedbackActive = false;
    gameLoop();
    
    // Hide the start button once the game starts
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.style.display = 'none';
    }
}

// Expose startGame to the window so it can be called from HTML
window.gameStartFunction = startGame;

// Game loop
function gameLoop() {
    if (currentScreen !== GameScreen.PLAYING) return;

    update();
    render();

    requestAnimationFrame(gameLoop);
}

// Visual feedback variables
let feedbackTimer = 0;
let feedbackActive = false;
let feedbackIsGood = false;

// Error tracking
let gameErrors = [];

// Show visual feedback for rhythm
function showRhythmFeedback(isGood) {
    feedbackActive = true;
    feedbackIsGood = isGood;
    feedbackTimer = 20; // Show feedback for 20 frames
}

// Update game state
function update() {
    updateSkier();
    updateObstacles();
    updateSpectators();
    checkCollisions();

    // Always move forward (even if slowly when no rhythm)
    worldX += Math.max(skier.speed, 0.5);
    score = Math.floor(worldX / 10);

    // Gradually decrease rhythm when not pressing keys
    if (Date.now() - lastKeyTime > TARGET_RHYTHM + rhythmTolerance) {
        rhythmScore = Math.max(rhythmScore - RHYTHM_DECAY, 0.1);
        skier.speed = skier.maxSpeed * Math.max(rhythmScore, 0.2);
    }
    
    // Update feedback timer
    if (feedbackActive) {
        feedbackTimer--;
        if (feedbackTimer <= 0) {
            feedbackActive = false;
        }
    }
}

// Update skier
function updateSkier() {
    // Handle jumping physics
    if (skier.isJumping) {
        skier.y += skier.yVelocity;
        skier.yVelocity += skier.gravity;
        if (skier.y >= CANVAS_HEIGHT - SKIER_VERTICAL_OFFSET) {
            skier.y = CANVAS_HEIGHT - SKIER_VERTICAL_OFFSET;
            skier.isJumping = false;
            skier.yVelocity = 0;
        }
    }
    
    // Handle ducking
    if (skier.isDucking) {
        // Reduce height when ducking (hockey position)
        skier.height = 25; // Even lower for better bridge clearance
        
        // Count down duck timer
        skier.duckTimer--;
        if (skier.duckTimer <= 0) {
            skier.isDucking = false;
            skier.height = 60; // Return to normal height
        }
    } else {
        skier.height = 60; // Ensure normal height when not ducking
    }
    
    // Smooth animation transitions
    skier.animationProgress += 0.05 * skier.speed;
    if (skier.animationProgress > 1) skier.animationProgress = 1;
    
    // Update pole angle based on animation frame and progress
    const targetPoleAngle = (skier.animationFrame === 0) ? 30 : -30;
    skier.poleAngle = skier.poleAngle * 0.9 + targetPoleAngle * 0.1;
    
    // Body lean increases with speed
    const targetLean = Math.min(20, skier.speed * 2);
    skier.bodyLean = skier.bodyLean * 0.95 + targetLean * 0.05;
}

// Update obstacles
function updateObstacles() {
    spawnTimer++;
    if (spawnTimer >= SPAWN_INTERVAL) {
        // Randomly choose between fallen skier and bridge obstacles
        const obstacleType = Math.random() > 0.3 ? 'bridge' : 'skier';
        
        if (obstacleType === 'skier') {
            // Create more detailed fallen skier obstacles
            obstacles.push({
                type: 'skier',
                worldX: worldX + CANVAS_WIDTH + Math.random() * 200,
                y: CANVAS_HEIGHT - 40,
                width: 50,  // Wider to account for sprawled skier
                height: 40,
                poseType: Math.floor(Math.random() * 3), // 0-2 for different fallen poses
                rotation: Math.random() * 0.5 - 0.25, // Random slight rotation
                skisAngle: Math.random() * 50 - 25,  // Random ski angle
                poleAngle: Math.random() * 40 - 20   // Random pole angle
            });
        } else {
            // Create bridge obstacles (need to duck under)
            const bridge = {
                type: 'bridge',
                worldX: worldX + CANVAS_WIDTH + Math.random() * 300,
                y: CANVAS_HEIGHT - 105, // Higher than ground but lower for hockey duck
                width: 120,  // Wide bridge
                height: 50,  // Low clearance - need to duck
                bridgeHeight: 50 + Math.random() * 10, // Variable height
                clearance: 50, // Space under bridge
                spectators: [] // People cheering on the bridge
            };
            
            // Add spectators on the bridge
            const numSpectators = 2 + Math.floor(Math.random() * 3); // 2-4 spectators
            for (let i = 0; i < numSpectators; i++) {
                bridge.spectators.push({
                    position: i / (numSpectators - 1), // 0 to 1 position along bridge
                    animationOffset: Math.random() * 100, // Varied animation timing
                    waving: Math.random() > 0.3, // Some are waving
                    color: Math.floor(Math.random() * 6) // Different colored outfits
                });
            }
            
            obstacles.push(bridge);
        }
        spawnTimer = 0;
    }

    // Move obstacles at a speed relative to player's speed
    obstacles.forEach(obstacle => obstacle.worldX -= 2 + skier.speed * 0.2);
    
    // Remove obstacles that are far behind
    obstacles = obstacles.filter(obstacle => obstacle.worldX > worldX - 150);
}

// Update spectators along the route
function updateSpectators() {
    spectatorSpawnTimer++;
    if (spectatorSpawnTimer >= SPECTATOR_SPAWN_INTERVAL) {
        // Randomly spawn spectator groups on the sides, further away from player
        const side = Math.random() > 0.5 ? 'left' : 'right';
        
        // Much greater distance from center to keep spectators in the background
        const baseDistance = side === 'left' 
            ? -150 - Math.random() * 200  // Left side, further away
            : CANVAS_WIDTH + Math.random() * 200;  // Right side, further away
            
        // Position higher in the scene to create background depth effect
        const baseY = CANVAS_HEIGHT - 90; // Higher up on the snow surface
        
        // Create a group of 3-5 spectators
        const groupSize = 3 + Math.floor(Math.random() * 3);
        const groupSpread = 40; // How spread out the group is
        
        // Add campfire or tent to some groups
        const hasCampfire = Math.random() > 0.6;
        const hasTent = !hasCampfire && Math.random() > 0.6;
        
        // Create the spectator group
        const spectatorGroup = {
            type: 'spectator_group',
            worldX: worldX + baseDistance,
            y: baseY,
            side: side,
            members: [],
            hasCampfire: hasCampfire,
            hasTent: hasTent,
            campfireAnimationOffset: Math.random() * 100
        };
        
        // Generate individual spectators in the group
        for (let i = 0; i < groupSize; i++) {
            // Position within group (circular arrangement if there's a campfire)
            let offsetX, offsetY;
            
            if (hasCampfire) {
                // Arrange in semicircle around campfire
                const angle = (i / (groupSize - 1)) * Math.PI;
                offsetX = Math.cos(angle) * 20;
                offsetY = Math.sin(angle) * 10;
                if (side === 'right') offsetX = -offsetX; // Flip for right side
            } else {
                // Arrange in loose cluster
                offsetX = (Math.random() - 0.5) * groupSpread;
                offsetY = (Math.random() - 0.5) * 20;
            }
            
            // Individual spectator properties
            spectatorGroup.members.push({
                offsetX: offsetX,
                offsetY: offsetY,
                waving: Math.random() > 0.3, // All have arms, some are waving
                jumping: Math.random() > 0.7, // Some are jumping with excitement
                animationOffset: Math.random() * 100, // Different animation timing
                color: Math.floor(Math.random() * 6), // Different colored outfits
                animationSpeed: 0.5 + Math.random() * 1, // Different animation speeds
                leftArmRaised: Math.random() > 0.5, // Which arm is raised if waving
                rightArmRaised: Math.random() > 0.5  // Both arms might be raised
            });
        }
        
        spectators.push(spectatorGroup);
        spectatorSpawnTimer = 0;
    }
    
    // Move spectators at a speed relative to player's speed
    spectators.forEach(spectator => spectator.worldX -= 2 + skier.speed * 0.2);
    
    // Remove spectators that are far behind
    spectators = spectators.filter(spectator => spectator.worldX > worldX - 600);
}

// Check collisions
function checkCollisions() {
    obstacles.forEach(obstacle => {
        const obstacleScreenX = obstacle.worldX - worldX;
        
        if (obstacle.type === 'skier') {
            // For fallen skiers - can ONLY jump over them, not duck
            if (
                skier.x < obstacleScreenX + obstacle.width &&
                skier.x + 20 > obstacleScreenX &&
                skier.y < obstacle.y + obstacle.height &&
                skier.y + skier.height > obstacle.y
            ) {
                // Must jump over fallen skiers, ducking doesn't help
                if (!skier.isJumping) gameOver();
            }
        } else if (obstacle.type === 'bridge') {
            // For bridges - need to duck under
            if (
                skier.x < obstacleScreenX + obstacle.width &&
                skier.x + 20 > obstacleScreenX
            ) {
                // Check if skier is ducking properly
                if (skier.isDucking) {
                    // Ducking skier should pass under bridge
                    // Hockey position has significantly reduced height (25px)
                    // Only collide if head actually hits bridge bottom
                    const duckingHeadY = skier.y + 12; // Head position while ducking
                    if (duckingHeadY < obstacle.y + obstacle.height && 
                        duckingHeadY > obstacle.y) {
                        gameOver();
                    }
                } else {
                    // If not ducking, collide with bridge
                    if (skier.y < obstacle.y + obstacle.height && 
                        skier.y + skier.height > obstacle.y) {
                        gameOver();
                    }
                }
            }
        }
    });
}

// Render everything
function render() {
    // Make sure canvas exists before drawing
    if (!ctx) return;
    
    try {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
        // Sky background
        const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT - 60); // Increased snow area
        skyGradient.addColorStop(0, '#87CEEB'); // Sky blue
        skyGradient.addColorStop(1, '#E0F7FA'); // Lighter near horizon
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - 60); // Increased snow area
        
        // Snow ground - increased from 20px to 60px
        ctx.fillStyle = '#FFF';
        ctx.fillRect(0, CANVAS_HEIGHT - 60, CANVAS_WIDTH, 60);
        
        // Show any errors on screen
        if (gameErrors.length > 0) {
            ctx.fillStyle = 'rgba(255,0,0,0.2)';
            ctx.fillRect(0, 0, 20, 20); // Small red indicator in corner
        }

        // Rhythm bar with visual feedback
        ctx.fillStyle = '#CCC';
        ctx.fillRect(CANVAS_WIDTH - 120, 10, 100, 10);
    
        // Bar fill color - blue normally, green for good rhythm, red for bad rhythm
        if (feedbackActive) {
            ctx.fillStyle = feedbackIsGood ? '#00FF00' : '#FF0000';
        } else {
            ctx.fillStyle = '#00F';
        }
        ctx.fillRect(CANVAS_WIDTH - 120, 10, 100 * rhythmScore, 10);
    
        // Show rhythm timing guide
        if (rhythmScore > 0.1) {
            const elapsed = Date.now() - lastKeyTime;
            const nextBeatProgress = Math.min(elapsed / TARGET_RHYTHM, 1);
            
            // Show a marker for next optimal tap
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath();
            ctx.arc(CANVAS_WIDTH - 120 + (100 * nextBeatProgress), 15, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    
        // Draw tempo text guide
        ctx.fillStyle = '#000';
        ctx.font = '14px Arial';
        ctx.fillText('Tempo: tap L/R arrows', CANVAS_WIDTH - 220, 40);
        
        // Draw current tolerance indicator (harder at higher speeds)
        ctx.fillText(`Tolerance: ${Math.floor(rhythmTolerance)}ms`, CANVAS_WIDTH - 220, 60);
        
        // Show active state indicators
        if (skier.isDucking) {
            ctx.fillStyle = '#00F';
            ctx.fillText('DUCKING', CANVAS_WIDTH - 100, 80);
        }
        if (skier.isJumping) {
            ctx.fillStyle = '#F00';
            ctx.fillText('JUMPING', CANVAS_WIDTH - 100, 100);
        }
        
        // Draw background spectators and spectator groups
        spectators.forEach(spectator => {
            try {
                const spectatorScreenX = spectator.worldX - worldX;
                // Extended visible range to prevent sudden appearance/disappearance
                if (spectatorScreenX >= -300 && spectatorScreenX <= CANVAS_WIDTH + 300) {
                    // Always update screen position for consistent rendering
                    spectator.screenX = spectatorScreenX;
                    
                    // Position spectators much higher in the background away from player's path
                    // Place them on the snow (not floating) but visually in background
                    spectator.y = CANVAS_HEIGHT - 90; // Higher up in scene (on snow, but background)
                    
                    if (spectator.type === 'spectator_group') {
                        drawSpectatorGroup(spectator);
                    } else {
                        drawSpectator(spectator);
                    }
                }
            } catch (error) {
                console.error("Error drawing spectator:", error);
            }
        });
    
        // Obstacles (behind skier)
        obstacles.forEach(obstacle => {
            try {
                // Draw obstacles that are behind the skier
                const obstacleScreenX = obstacle.worldX - worldX;
                if (obstacleScreenX + obstacle.width < skier.x) {
                    drawObstacle(obstacle);
                }
            } catch (error) {
                console.error("Error drawing obstacle:", error);
            }
        });
        
        // Skier
        try {
            drawSkier();
        } catch (error) {
            console.error("Error drawing skier:", error);
        }
        
        // Obstacles (in front of skier)
        obstacles.forEach(obstacle => {
            try {
                // Draw obstacles that are in front of or at the skier
                const obstacleScreenX = obstacle.worldX - worldX;
                if (obstacleScreenX + obstacle.width >= skier.x) {
                    drawObstacle(obstacle);
                }
            } catch (error) {
                console.error("Error drawing obstacle:", error);
            }
        });
    
        // Score and high score
        ctx.fillStyle = '#000';
        ctx.font = '24px Arial';
        ctx.fillText(`Score: ${score}`, 10, 30);
        
        // Display highest score if available
        if (highScores.length > 0) {
            const highestScore = Math.max(...highScores.map(score => score.score));
            ctx.fillText(`High Score: ${highestScore}`, 10, 60);
        }
        
        // Current speed indicator
        ctx.fillText(`Speed: ${Math.floor(skier.speed * 10)}`, 10, 90);
        
        // Controls reminder
        ctx.font = '14px Arial';
        ctx.fillText('↑↓ = Jump/Duck', 10, 120);
        
    } catch (error) {
        console.error("Error in render function:", error);
        gameErrors.push(error.toString());
        
        // Try to still show something
        if (ctx) {
            ctx.fillStyle = 'red';
            ctx.font = '16px Arial';
            ctx.fillText("Error rendering game: " + error.toString(), 50, 200);
        }
    }
}

// Draw skier with realistic diagonal stride
function drawSkier() {
    ctx.save(); // Save context for transformations
    
    // Apply jumping offset if jumping
    let drawY = skier.y;
    
    // Colors
    const skinColor = '#F5D0A9';
    const hatColor = '#D00';
    const jacketColor = '#1560BD';
    const pantsColor = '#222';
    const poleColor = '#888';
    const skiColor = '#00A';
    
    // Calculate lean based on speed and animation
    const leanAmount = skier.bodyLean;
    
    // Set up drawing context
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    
    // Smooth transition between animation frames using progress
    const progress = skier.animationProgress;
    
    // Base position with forward lean
    const baseX = skier.x;
    const baseY = drawY;
    
    // Calculate animation values for smoother transitions
    let leftArmForward, rightArmForward, leftLegForward, rightLegForward;
    
    if (skier.animationFrame === 0) {
        // Transitioning to left arm forward
        leftArmForward = progress;
        rightArmForward = 1 - progress;
        leftLegForward = progress;
        rightLegForward = 1 - progress;
    } else {
        // Transitioning to right arm forward
        leftArmForward = 1 - progress;
        rightArmForward = progress;
        leftLegForward = 1 - progress;
        rightLegForward = progress;
    }
    
    // Calculate positions with lean
    const headX = baseX + 15 + leanAmount * 0.3;
    const headY = baseY + 10;
    const shoulderX = baseX + 12 + leanAmount * 0.25;
    const shoulderY = baseY + 20;
    const hipX = baseX + 8 + leanAmount * 0.15;
    const hipY = baseY + 40;
    
    // Calculate arm positions based on animation
    let leftArmAngle, rightArmAngle;
    
    if (skier.isDucking) {
        // When ducking (hockey position), arms reach backwards
        leftArmAngle = 30;  // Arms back and up
        rightArmAngle = 30;
    } else {
        leftArmAngle = -30 * leftArmForward + 15 * (1-leftArmForward);
        rightArmAngle = -30 * rightArmForward + 15 * (1-rightArmForward);
    }
    
    // Calculate leg positions based on animation and ducking
    let leftLegExtension, rightLegExtension;
    
    if (skier.isDucking) {
        // When ducking, legs are deeply bent (hockey position)
        leftLegExtension = 8;  // Lower crouch
        rightLegExtension = 8;
    } else {
        leftLegExtension = 5 * leftLegForward;
        rightLegExtension = 5 * rightLegForward;
    }
    
    // Draw skier body
    
    // Skis first (under the body)
    const leftFootX = hipX - 5 + 10 * leftLegForward;
    const leftFootY = hipY + 15 + leftLegExtension;
    const rightFootX = hipX + 5 + 10 * rightLegForward;
    const rightFootY = hipY + 15 + rightLegExtension;
    
    // Skis (longer, under each foot)
    ctx.strokeStyle = skiColor;
    ctx.lineWidth = 3;
    
    // Left ski with angle based on leg position
    ctx.beginPath();
    ctx.moveTo(leftFootX - 20, leftFootY - leftLegForward * 2);
    ctx.lineTo(leftFootX + 25, leftFootY + leftLegForward);
    ctx.stroke();
    
    // Right ski with angle based on leg position
    ctx.beginPath();
    ctx.moveTo(rightFootX - 20, rightFootY - rightLegForward * 2);
    ctx.lineTo(rightFootX + 25, rightFootY + rightLegForward);
    ctx.stroke();
    
    // Legs
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    
    // Fill pants
    ctx.fillStyle = pantsColor;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(leftFootX, leftFootY);
    ctx.lineTo(leftFootX + 4, leftFootY);
    ctx.lineTo(hipX + 4, hipY);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(rightFootX, rightFootY);
    ctx.lineTo(rightFootX + 4, rightFootY);
    ctx.lineTo(hipX + 4, hipY);
    ctx.fill();
    
    // Outline legs
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(leftFootX, leftFootY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(rightFootX, rightFootY);
    ctx.stroke();
    
    // Torso (with jacket)
    ctx.fillStyle = jacketColor;
    
    if (skier.isDucking) {
        // Draw crouched torso when ducking (hockey position)
        // More horizontal, lower torso
        const crouchShoulderY = shoulderY + 5; // Lower shoulders
        const crouchHipY = hipY + 5; // Lower hips
        
        ctx.beginPath();
        ctx.moveTo(shoulderX - 5, crouchShoulderY);
        ctx.lineTo(shoulderX + 5, crouchShoulderY);
        ctx.lineTo(hipX + 10, crouchHipY); // More forward lean
        ctx.lineTo(hipX - 5, crouchHipY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        // Normal upright torso
        ctx.beginPath();
        ctx.moveTo(shoulderX - 5, shoulderY);
        ctx.lineTo(shoulderX + 5, shoulderY);
        ctx.lineTo(hipX + 5, hipY);
        ctx.lineTo(hipX - 5, hipY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    // Calculate arm positions
    const leftShoulderX = shoulderX - 2;
    const leftShoulderY = shoulderY + 2;
    const rightShoulderX = shoulderX + 2;
    const rightShoulderY = shoulderY + 2;
    
    // Calculate arm endpoints based on animation
    const leftArmLength = skier.isDucking ? 18 : 15;
    const leftHandX = leftShoulderX + Math.cos(leftArmAngle * Math.PI / 180) * leftArmLength;
    const leftHandY = leftShoulderY + Math.sin(leftArmAngle * Math.PI / 180) * leftArmLength;
    
    const rightArmLength = skier.isDucking ? 18 : 15;
    const rightHandX = rightShoulderX + Math.cos(rightArmAngle * Math.PI / 180) * rightArmLength;
    const rightHandY = rightShoulderY + Math.sin(rightArmAngle * Math.PI / 180) * rightArmLength;
    
    // Arms in jacket color
    ctx.fillStyle = jacketColor;
    
    // Left arm
    ctx.beginPath();
    ctx.moveTo(leftShoulderX, leftShoulderY);
    ctx.lineTo(leftHandX, leftHandY);
    ctx.lineTo(leftHandX + 3, leftHandY + 1);
    ctx.lineTo(leftShoulderX + 3, leftShoulderY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Right arm
    ctx.beginPath();
    ctx.moveTo(rightShoulderX, rightShoulderY);
    ctx.lineTo(rightHandX, rightHandY);
    ctx.lineTo(rightHandX + 3, rightHandY + 1);
    ctx.lineTo(rightShoulderX + 3, rightShoulderY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Hands (small circles)
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(leftHandX, leftHandY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(rightHandX, rightHandY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Head position changes when ducking
    let drawHeadY = headY;
    let drawHeadX = headX;
    if (skier.isDucking) {
        drawHeadY = headY + 12; // Lower head when ducking
        drawHeadX = headX + 5;  // Head forward in hockey position
    }
    
    // Head and helmet
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(drawHeadX, drawHeadY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Helmet (more like a hat)
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.arc(drawHeadX, drawHeadY - 2, 7, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Poles - dynamic angle based on animation and ducking
    ctx.strokeStyle = poleColor;
    ctx.lineWidth = 1.5;
    
    if (!skier.isDucking) {
        // Only show poles pointing forward when not ducking
        // Left pole with dynamic angle
        const leftPoleAngle = 20 - leftArmForward * 40;
        const leftPoleTipX = leftHandX + Math.cos((leftPoleAngle + 90) * Math.PI / 180) * 40;
        const leftPoleTipY = baseY + 60;
        
        ctx.beginPath();
        ctx.moveTo(leftHandX, leftHandY);
        ctx.lineTo(leftPoleTipX, leftPoleTipY);
        ctx.stroke();
        
        // Right pole with dynamic angle
        const rightPoleAngle = 20 - rightArmForward * 40;
        const rightPoleTipX = rightHandX + Math.cos((rightPoleAngle + 90) * Math.PI / 180) * 40;
        const rightPoleTipY = baseY + 60;
        
        ctx.beginPath();
        ctx.moveTo(rightHandX, rightHandY);
        ctx.lineTo(rightPoleTipX, rightPoleTipY);
        ctx.stroke();
        
        // Pole baskets (small circles at the bottom of poles)
        ctx.beginPath();
        ctx.arc(leftPoleTipX, leftPoleTipY - 3, 2, 0, Math.PI * 2);
        ctx.arc(rightPoleTipX, rightPoleTipY - 3, 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Hockey position - poles pointing backward
        // Left pole pointing backward
        const leftPoleBackX = leftHandX - 40; // Far behind
        const leftPoleBackY = leftHandY + 5;  // Slightly down
        
        ctx.beginPath();
        ctx.moveTo(leftHandX, leftHandY);
        ctx.lineTo(leftPoleBackX, leftPoleBackY);
        ctx.stroke();
        
        // Right pole pointing backward
        const rightPoleBackX = rightHandX - 40; // Far behind
        const rightPoleBackY = rightHandY + 5;  // Slightly down
        
        ctx.beginPath();
        ctx.moveTo(rightHandX, rightHandY);
        ctx.lineTo(rightPoleBackX, rightPoleBackY);
        ctx.stroke();
        
        // Pole baskets on backward poles
        ctx.beginPath();
        ctx.arc(leftPoleBackX, leftPoleBackY, 2, 0, Math.PI * 2);
        ctx.arc(rightPoleBackX, rightPoleBackY, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore(); // Restore context
}

// Function to draw bridge obstacle
function drawBridge(obstacle) {
    const screenX = obstacle.worldX - worldX;
    
    // Bridge colors
    const bridgeColor = '#8B4513'; // Brown wood
    const supportColor = '#654321'; // Darker wood for supports
    const snowColor = '#FFF';
    
    // Draw bridge structure
    ctx.fillStyle = bridgeColor;
    
    // Main bridge span
    ctx.fillRect(screenX, obstacle.y, obstacle.width, obstacle.height);
    
    // Add wooden planks texture
    ctx.strokeStyle = supportColor;
    ctx.lineWidth = 1;
    
    for (let i = 0; i < obstacle.width; i += 15) {
        ctx.beginPath();
        ctx.moveTo(screenX + i, obstacle.y);
        ctx.lineTo(screenX + i, obstacle.y + obstacle.height);
        ctx.stroke();
    }
    
    // Bridge supports
    ctx.fillStyle = supportColor;
    
    // Left support
    ctx.fillRect(screenX + 10, obstacle.y + obstacle.height, 10, obstacle.clearance);
    
    // Right support
    ctx.fillRect(screenX + obstacle.width - 20, obstacle.y + obstacle.height, 10, obstacle.clearance);
    
    // Snow on top of bridge
    ctx.fillStyle = snowColor;
    ctx.beginPath();
    ctx.moveTo(screenX, obstacle.y);
    ctx.lineTo(screenX + obstacle.width, obstacle.y);
    ctx.lineTo(screenX + obstacle.width - 5, obstacle.y - 5);
    ctx.lineTo(screenX + 5, obstacle.y - 5);
    ctx.closePath();
    ctx.fill();
    
    // Add wooden railing
    ctx.fillStyle = supportColor;
    ctx.fillRect(screenX, obstacle.y - 10, obstacle.width, 5);
    
    for (let i = 10; i < obstacle.width; i += 20) {
        ctx.fillRect(screenX + i, obstacle.y - 15, 5, 15);
    }
    
    // Draw spectators on the bridge
    if (obstacle.spectators && obstacle.spectators.length > 0) {
        obstacle.spectators.forEach(spectator => {
            // Calculate position along the bridge
            const posX = screenX + spectator.position * obstacle.width;
            const posY = obstacle.y - 20; // Stand on top of bridge
            
            // Draw the spectator
            drawBridgeSpectator(posX, posY, spectator);
        });
    }
}

// Draw spectator on bridge
function drawBridgeSpectator(x, y, spectator) {
    ctx.save();
    
    // Animation based on time and offset
    const time = Date.now() / 200 + spectator.animationOffset;
    const bobAmount = Math.sin(time * 0.3) * 2;
    const waveAmount = spectator.waving ? Math.sin(time * 0.5) * 15 : 0;
    
    // Colors based on spectator.color (0-5) with country flags
    const colors = [
        { body: '#F00', head: '#FFC107', flag: ['#FF0000', '#FFFFFF', '#0000FF'] }, // Norway
        { body: '#3F51B5', head: '#F44336', flag: ['#0000FF', '#FFFFFF', '#FF0000'] }, // France
        { body: '#4CAF50', head: '#9C27B0', flag: ['#009900', '#FFFFFF', '#FF0000'] }, // Italy
        { body: '#FF9800', head: '#2196F3', flag: ['#000000', '#FF0000', '#FFFF00'] }, // Germany
        { body: '#9C27B0', head: '#4CAF50', flag: ['#0000FF', '#FFFF00', '#FF0000'] }, // Romania
        { body: '#607D8B', head: '#FF9800', flag: ['#3C3B6E', '#FFFFFF', '#B22234'] }  // USA
    ];
    
    const color = colors[spectator.color % colors.length];
    
    // Apply bobbing animation
    y += bobAmount;
    
    // Draw body
    ctx.fillStyle = color.body;
    ctx.fillRect(x - 5, y, 10, 15);
    
    // Draw head
    ctx.fillStyle = '#FFD3B6'; // Skin tone
    ctx.beginPath();
    ctx.arc(x, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw hat
    ctx.fillStyle = color.head;
    ctx.beginPath();
    ctx.arc(x, y - 7, 4, 0, Math.PI, true);
    ctx.fill();
    
    // Draw flag for waving arm or static arms
    ctx.strokeStyle = color.body;
    ctx.lineWidth = 2;
    
    if (spectator.waving) {
        // Right arm with flag pole
        const flagPoleLength = 25; // Large flag for bridge spectators
        const flagWidth = 18;
        const flagHeight = 12;
        
        // Draw waving arm with flag pole
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 3);
        ctx.lineTo(x + 8, y - waveAmount);
        ctx.stroke();
        
        // Draw flag pole
        ctx.strokeStyle = '#8B4513'; // Brown pole
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 8, y - waveAmount);
        ctx.lineTo(x + 8 + flagPoleLength, y - waveAmount - 5);
        ctx.stroke();
        
        // Hand holding pole
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x + 8, y - waveAmount, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Flag - three colored stripes
        const flagY = y - waveAmount - 5;
        const flagX = x + 8 + 3; // Offset from pole
        
        // Draw flag horizontal stripes
        const sectionHeight = flagHeight / 3;
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = color.flag[i];
            ctx.fillRect(flagX, flagY - flagHeight + (i * sectionHeight), flagWidth, sectionHeight);
        }
        
        // Flag border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(flagX, flagY - flagHeight, flagWidth, flagHeight);
        
        // Static left arm
        ctx.strokeStyle = color.body;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 3);
        ctx.lineTo(x - 8, y + 5);
        ctx.stroke();
        
        // Left hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x - 8, y + 5, 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Static arms (no flag)
        // Right arm
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 3);
        ctx.lineTo(x + 8, y + 5);
        ctx.stroke();
        
        // Right hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x + 8, y + 5, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Left arm
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 3);
        ctx.lineTo(x - 8, y + 5);
        ctx.stroke();
        
        // Left hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x - 8, y + 5, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// Draw spectator group with campfire/tent
function drawSpectatorGroup(group) {
    ctx.save();
    
    const screenX = group.worldX - worldX;
    const baseY = group.y;
    
    // Draw campfire if present
    if (group.hasCampfire) {
        drawCampfire(screenX, baseY + 15, group.campfireAnimationOffset);
    }
    
    // Draw tent if present
    if (group.hasTent) {
        drawTent(screenX, baseY - 10, group.side);
    }
    
    // Draw all members of the group
    group.members.forEach(member => {
        const memberX = screenX + member.offsetX;
        const memberY = baseY + member.offsetY;
        
        drawGroupMember(memberX, memberY, member, group.side);
    });
    
    ctx.restore();
}

// Draw a campfire
function drawCampfire(x, y, animOffset) {
    // Log pile
    ctx.fillStyle = '#8B4513'; // Brown wood
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 5);
    ctx.lineTo(x + 8, y + 5);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
    
    // Animated flames
    const time = Date.now() / 100 + animOffset;
    
    // Base of fire
    ctx.fillStyle = '#F57F17'; // Dark orange
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Animated flames
    const flameHeight = 10 + Math.sin(time * 0.3) * 3;
    
    // Main flame
    const gradient = ctx.createLinearGradient(x, y - 5, x, y - flameHeight - 5);
    gradient.addColorStop(0, '#FF5722');   // Orange at bottom
    gradient.addColorStop(0.7, '#FFEB3B'); // Yellow in middle
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)'); // Transparent white at top
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    
    // Draw dancing flame shape
    ctx.moveTo(x - 5, y - 2);
    
    // Left curve of flame
    ctx.quadraticCurveTo(
        x - 8 + Math.sin(time * 0.5) * 2, 
        y - flameHeight * 0.5, 
        x - 2 + Math.sin(time * 0.7) * 2, 
        y - flameHeight - 3
    );
    
    // Peak of flame
    ctx.quadraticCurveTo(
        x + Math.sin(time * 0.8) * 2, 
        y - flameHeight - 6, 
        x + 2 + Math.sin(time * 0.7) * 2, 
        y - flameHeight - 3
    );
    
    // Right curve of flame
    ctx.quadraticCurveTo(
        x + 8 + Math.sin(time * 0.5) * 2, 
        y - flameHeight * 0.5, 
        x + 5, 
        y - 2
    );
    
    ctx.closePath();
    ctx.fill();
    
    // Embers (small particles rising from fire)
    ctx.fillStyle = 'rgba(255, 200, 0, 0.7)';
    for (let i = 0; i < 3; i++) {
        const emberX = x + Math.sin(time * 0.5 + i) * 5;
        const emberY = y - 5 - ((time * 0.2 + i * 20) % 15);
        const emberSize = 1 + Math.sin(time + i) * 0.5;
        
        ctx.beginPath();
        ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Smoke
    ctx.fillStyle = 'rgba(100, 100, 100, 0.2)';
    for (let i = 0; i < 2; i++) {
        const smokeX = x + Math.sin(time * 0.2 + i * 3) * 10;
        const smokeY = y - flameHeight - 5 - ((time * 0.1 + i * 30) % 20);
        const smokeSize = 4 + Math.sin(time * 0.3 + i) * 2;
        
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Draw a camping tent
function drawTent(x, y, side) {
    // Flip tent based on side
    const direction = side === 'left' ? 1 : -1;
    
    // Tent canvas/fabric
    ctx.fillStyle = '#1565C0'; // Deep blue
    ctx.beginPath();
    ctx.moveTo(x, y - 25); // Peak
    ctx.lineTo(x + 25 * direction, y); // Right bottom
    ctx.lineTo(x - 25 * direction, y); // Left bottom
    ctx.closePath();
    ctx.fill();
    
    // Tent entrance flap
    ctx.fillStyle = '#0D47A1'; // Darker blue
    ctx.beginPath();
    ctx.moveTo(x, y - 25); // Peak
    ctx.lineTo(x + 5 * direction, y - 5); // Top of entrance
    ctx.lineTo(x, y - 3); // Bottom of entrance
    ctx.lineTo(x - 5 * direction, y - 5); // Top of entrance on other side
    ctx.closePath();
    ctx.fill();
    
    // Tent pole
    ctx.strokeStyle = '#8B4513'; // Brown
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 25); // Top
    ctx.lineTo(x, y); // Bottom
    ctx.stroke();
    
    // Stakes and ropes
    ctx.strokeStyle = '#CCC';
    ctx.lineWidth = 1;
    
    // Left rope and stake
    ctx.beginPath();
    ctx.moveTo(x - 23 * direction, y);
    ctx.lineTo(x - 30 * direction, y + 5);
    ctx.stroke();
    
    // Right rope and stake
    ctx.beginPath();
    ctx.moveTo(x + 23 * direction, y);
    ctx.lineTo(x + 30 * direction, y + 5);
    ctx.stroke();
}

// Draw an individual group member
function drawGroupMember(x, y, member, side) {
    // Animation timing
    const time = Date.now() / 200 + member.animationOffset;
    
    // Jumping animation
    let jumpOffset = 0;
    if (member.jumping) {
        jumpOffset = Math.abs(Math.sin(time * member.animationSpeed)) * 10;
    }
    
    // Bobbing animation
    const bobAmount = Math.sin(time * 0.3) * 2;
    
    // Colors based on member.color (0-5) with country flags
    const colors = [
        { body: '#F00', head: '#FFC107', flag: ['#FF0000', '#FFFFFF', '#0000FF'] }, // Norway
        { body: '#3F51B5', head: '#F44336', flag: ['#0000FF', '#FFFFFF', '#FF0000'] }, // France
        { body: '#4CAF50', head: '#9C27B0', flag: ['#009900', '#FFFFFF', '#FF0000'] }, // Italy
        { body: '#FF9800', head: '#2196F3', flag: ['#000000', '#FF0000', '#FFFF00'] }, // Germany
        { body: '#9C27B0', head: '#4CAF50', flag: ['#0000FF', '#FFFF00', '#FF0000'] }, // Romania
        { body: '#607D8B', head: '#FF9800', flag: ['#3C3B6E', '#FFFFFF', '#B22234'] }  // USA
    ];
    
    const color = colors[member.color % colors.length];
    
    // Apply animations
    const drawY = y - jumpOffset + bobAmount;
    
    // Draw body
    ctx.fillStyle = color.body;
    ctx.fillRect(x - 6, drawY, 12, 20);
    
    // Draw legs
    ctx.fillStyle = '#333';
    ctx.fillRect(x - 5, drawY + 20, 4, 10);
    ctx.fillRect(x + 1, drawY + 20, 4, 10);
    
    // Draw head
    ctx.fillStyle = '#FFD3B6'; // Skin tone
    ctx.beginPath();
    ctx.arc(x, drawY - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw hat
    ctx.fillStyle = color.head;
    ctx.beginPath();
    ctx.arc(x, drawY - 8, 5, 0, Math.PI, true);
    ctx.fill();
    
    // Draw arms (both always present)
    ctx.strokeStyle = color.body;
    ctx.lineWidth = 3;
    
    // Right arm with flag if waving
    if (member.waving && member.rightArmRaised) {
        const rightWaveAmount = Math.sin((time + 50) * 0.5) * 15;
        
        // Flag pole size (smaller than bridge spectators)
        const flagPoleLength = 18;
        const flagWidth = 14;
        const flagHeight = 10;
        
        // Draw arm holding flag
        ctx.beginPath();
        ctx.moveTo(x + 6, drawY + 5);
        ctx.lineTo(x + 14, drawY - rightWaveAmount);
        ctx.stroke();
        
        // Hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x + 14, drawY - rightWaveAmount, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw flag pole
        ctx.strokeStyle = '#8B4513'; // Brown pole
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 14, drawY - rightWaveAmount);
        ctx.lineTo(x + 14 + flagPoleLength, drawY - rightWaveAmount - 3);
        ctx.stroke();
        
        // Flag - three colored stripes
        const flagY = drawY - rightWaveAmount - 3;
        const flagX = x + 14 + 2; // Offset from pole
        
        // Draw flag horizontal stripes
        const sectionHeight = flagHeight / 3;
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = color.flag[i];
            ctx.fillRect(flagX, flagY - flagHeight + (i * sectionHeight), flagWidth, sectionHeight);
        }
        
        // Flag border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(flagX, flagY - flagHeight, flagWidth, flagHeight);
    } else {
        // Static right arm (no flag)
        ctx.beginPath();
        ctx.moveTo(x + 6, drawY + 5);
        ctx.lineTo(x + 12, drawY + 8);
        ctx.stroke();
        
        // Hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x + 12, drawY + 8, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Left arm with flag if waving
    if (member.waving && member.leftArmRaised) {
        const leftWaveAmount = Math.sin(time * 0.5) * 15;
        
        // Flag pole size (smaller than bridge spectators)
        const flagPoleLength = 18;
        const flagWidth = 14;
        const flagHeight = 10;
        
        // Draw arm holding flag
        ctx.beginPath();
        ctx.moveTo(x - 6, drawY + 5);
        ctx.lineTo(x - 14, drawY - leftWaveAmount);
        ctx.stroke();
        
        // Hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x - 14, drawY - leftWaveAmount, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw flag pole
        ctx.strokeStyle = '#8B4513'; // Brown pole
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 14, drawY - leftWaveAmount);
        ctx.lineTo(x - 14 - flagPoleLength, drawY - leftWaveAmount - 3);
        ctx.stroke();
        
        // Flag - three colored stripes
        const flagY = drawY - leftWaveAmount - 3;
        const flagX = x - 14 - 2 - flagWidth; // Offset from pole
        
        // Draw flag horizontal stripes
        const sectionHeight = flagHeight / 3;
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = color.flag[i];
            ctx.fillRect(flagX, flagY - flagHeight + (i * sectionHeight), flagWidth, sectionHeight);
        }
        
        // Flag border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(flagX, flagY - flagHeight, flagWidth, flagHeight);
    } else {
        // Static left arm (no flag)
        ctx.beginPath();
        ctx.moveTo(x - 6, drawY + 5);
        ctx.lineTo(x - 12, drawY + 8);
        ctx.stroke();
        
        // Hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(x - 12, drawY + 8, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Draw individual spectator (legacy support for non-group spectators)
function drawSpectator(spectator) {
    ctx.save();
    
    const screenX = spectator.worldX - worldX;
    const y = spectator.y;
    
    // Animation timing
    const time = Date.now() / 200 + spectator.animationOffset;
    
    // Jumping animation
    let jumpOffset = 0;
    if (spectator.jumping) {
        jumpOffset = Math.abs(Math.sin(time * spectator.animationSpeed)) * 10;
    }
    
    // Bobbing animation
    const bobAmount = Math.sin(time * 0.3) * 2;
    
    // Waving animation
    const waveAmount = spectator.waving ? Math.sin(time * 0.5) * 15 : 0;
    
    // Colors based on spectator.color (0-5)
    const colors = [
        { body: '#F00', head: '#FFC107' }, // Red jacket, yellow hat
        { body: '#3F51B5', head: '#F44336' }, // Blue jacket, red hat
        { body: '#4CAF50', head: '#9C27B0' }, // Green jacket, purple hat
        { body: '#FF9800', head: '#2196F3' }, // Orange jacket, blue hat
        { body: '#9C27B0', head: '#4CAF50' }, // Purple jacket, green hat
        { body: '#607D8B', head: '#FF9800' }  // Gray jacket, orange hat
    ];
    
    const color = colors[spectator.color % colors.length];
    
    // Apply animations
    const drawY = y - jumpOffset + bobAmount;
    
    // Draw body
    ctx.fillStyle = color.body;
    ctx.fillRect(screenX - 6, drawY, 12, 20);
    
    // Draw legs
    ctx.fillStyle = '#333';
    ctx.fillRect(screenX - 5, drawY + 20, 4, 10);
    ctx.fillRect(screenX + 1, drawY + 20, 4, 10);
    
    // Draw head
    ctx.fillStyle = '#FFD3B6'; // Skin tone
    ctx.beginPath();
    ctx.arc(screenX, drawY - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw hat
    ctx.fillStyle = color.head;
    ctx.beginPath();
    ctx.arc(screenX, drawY - 8, 5, 0, Math.PI, true);
    ctx.fill();
    
    // Draw both arms (one waving, one static)
    ctx.strokeStyle = color.body;
    ctx.lineWidth = 3;
    
    if (spectator.waving) {
        // Waving arm
        ctx.beginPath();
        if (spectator.side === 'left') {
            ctx.moveTo(screenX + 6, drawY + 5);
            ctx.lineTo(screenX + 15, drawY - waveAmount);
            ctx.stroke();
            
            // Hand
            ctx.fillStyle = '#FFD3B6';
            ctx.beginPath();
            ctx.arc(screenX + 15, drawY - waveAmount, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Static arm on other side
            ctx.strokeStyle = color.body;
            ctx.beginPath();
            ctx.moveTo(screenX - 6, drawY + 5);
            ctx.lineTo(screenX - 12, drawY + 8);
            ctx.stroke();
            
            // Hand
            ctx.fillStyle = '#FFD3B6';
            ctx.beginPath();
            ctx.arc(screenX - 12, drawY + 8, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.moveTo(screenX - 6, drawY + 5);
            ctx.lineTo(screenX - 15, drawY - waveAmount);
            ctx.stroke();
            
            // Hand
            ctx.fillStyle = '#FFD3B6';
            ctx.beginPath();
            ctx.arc(screenX - 15, drawY - waveAmount, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Static arm on other side
            ctx.strokeStyle = color.body;
            ctx.beginPath();
            ctx.moveTo(screenX + 6, drawY + 5);
            ctx.lineTo(screenX + 12, drawY + 8);
            ctx.stroke();
            
            // Hand
            ctx.fillStyle = '#FFD3B6';
            ctx.beginPath();
            ctx.arc(screenX + 12, drawY + 8, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // Both arms static if not waving
        // Left arm
        ctx.beginPath();
        ctx.moveTo(screenX - 6, drawY + 5);
        ctx.lineTo(screenX - 12, drawY + 8);
        ctx.stroke();
        
        // Left hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(screenX - 12, drawY + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Right arm
        ctx.beginPath();
        ctx.moveTo(screenX + 6, drawY + 5);
        ctx.lineTo(screenX + 12, drawY + 8);
        ctx.stroke();
        
        // Right hand
        ctx.fillStyle = '#FFD3B6';
        ctx.beginPath();
        ctx.arc(screenX + 12, drawY + 8, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add a flag to the waving spectator instead of a speech bubble
    if (spectator.waving) {
        // Flag characteristics based on which side the spectator is on
        const flagSide = spectator.side;
        const flagDirection = flagSide === 'left' ? 1 : -1;
        
        // Flag pole
        const poleLength = 16;
        const flagWidth = 12;
        const flagHeight = 8;
        
        // Pole starts at the waving hand
        const poleStartX = flagSide === 'left' ? screenX + 15 : screenX - 15;
        const poleStartY = drawY - waveAmount;
        
        // Draw the pole
        ctx.strokeStyle = '#8B4513'; // Brown pole
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(poleStartX, poleStartY);
        ctx.lineTo(poleStartX + (flagDirection * poleLength), poleStartY - 2);
        ctx.stroke();
        
        // Flag position
        const flagX = flagSide === 'left' ? poleStartX + 2 : poleStartX - flagWidth - 2;
        const flagY = poleStartY - 2;
        
        // Flag colors for this spectator
        const colors = [
            { flag: ['#FF0000', '#FFFFFF', '#0000FF'] }, // Norway
            { flag: ['#0000FF', '#FFFFFF', '#FF0000'] }, // France
            { flag: ['#009900', '#FFFFFF', '#FF0000'] }, // Italy
            { flag: ['#000000', '#FF0000', '#FFFF00'] }, // Germany
            { flag: ['#0000FF', '#FFFF00', '#FF0000'] }, // Romania
            { flag: ['#3C3B6E', '#FFFFFF', '#B22234'] }  // USA
        ];
        
        const colorSet = colors[spectator.color % colors.length];
        
        // Draw the flag stripes
        const sectionHeight = flagHeight / 3;
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = colorSet.flag[i];
            ctx.fillRect(flagX, flagY - flagHeight + (i * sectionHeight), flagWidth, sectionHeight);
        }
        
        // Flag border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(flagX, flagY - flagHeight, flagWidth, flagHeight);
    }
    
    ctx.restore();
}

// Draw obstacle based on type
function drawObstacle(obstacle) {
    if (obstacle.type === 'bridge') {
        drawBridge(obstacle);
    } else {
        drawFallenSkier(obstacle);
    }
}

// Draw fallen skier (obstacle)
function drawFallenSkier(obstacle) {
    const screenX = obstacle.worldX - worldX;
    ctx.save(); // Save context for transformations
    
    // Apply slight rotation for more natural look
    ctx.translate(screenX + 25, obstacle.y + 20);
    ctx.rotate(obstacle.rotation || 0);
    ctx.translate(-(screenX + 25), -(obstacle.y + 20));
    
    // Colors for fallen skier
    const skinColor = '#F5D0A9';
    const hatColor = obstacle.poseType === 0 ? '#D00' : (obstacle.poseType === 1 ? '#00D' : '#0A0');
    const jacketColor = obstacle.poseType === 0 ? '#D82' : (obstacle.poseType === 1 ? '#48A' : '#589');
    const pantsColor = '#222';
    const poleColor = '#888';
    const skiColor = '#00A';
    
    // Different fallen poses based on type
    if (obstacle.poseType === 0) {
        // Pose 1: Fallen forward, skis crossed
        
        // Skis crossed
        ctx.strokeStyle = skiColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - 15, obstacle.y + 20);
        ctx.lineTo(screenX + 30, obstacle.y + 30 + obstacle.skisAngle/5);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(screenX - 5, obstacle.y + 30);
        ctx.lineTo(screenX + 40, obstacle.y + 15 - obstacle.skisAngle/5);
        ctx.stroke();
        
        // Body twisted
        ctx.fillStyle = jacketColor;
        ctx.beginPath();
        ctx.moveTo(screenX, obstacle.y + 15);
        ctx.lineTo(screenX + 25, obstacle.y + 10);
        ctx.lineTo(screenX + 35, obstacle.y + 20);
        ctx.lineTo(screenX + 10, obstacle.y + 25);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Legs bent
        ctx.fillStyle = pantsColor;
        ctx.beginPath();
        ctx.moveTo(screenX + 10, obstacle.y + 25);
        ctx.lineTo(screenX + 5, obstacle.y + 35);
        ctx.lineTo(screenX + 15, obstacle.y + 35);
        ctx.lineTo(screenX + 20, obstacle.y + 25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Arms splayed
        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX + 5, obstacle.y + 15);
        ctx.lineTo(screenX - 10, obstacle.y + 5);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(screenX + 25, obstacle.y + 10);
        ctx.lineTo(screenX + 40, obstacle.y + 5);
        ctx.stroke();
        
        // Hands
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(screenX - 10, obstacle.y + 5, 3, 0, Math.PI * 2);
        ctx.arc(screenX + 40, obstacle.y + 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Head
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(screenX + 30, obstacle.y + 15, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Hat
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.arc(screenX + 30, obstacle.y + 12, 5, 0, Math.PI, true);
        ctx.fill();
        ctx.stroke();
        
        // Scattered poles
        ctx.strokeStyle = poleColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenX - 20, obstacle.y + 5);
        ctx.lineTo(screenX, obstacle.y + 20);
        ctx.moveTo(screenX + 45, obstacle.y + 10);
        ctx.lineTo(screenX + 25, obstacle.y + 25);
        ctx.stroke();
        
    } else if (obstacle.type === 1) {
        // Pose 2: Sitting after fall, one ski off
        
        // One ski attached, one detached
        ctx.strokeStyle = skiColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - 5, obstacle.y + 25);
        ctx.lineTo(screenX + 35, obstacle.y + 30);
        ctx.stroke();
        
        // Detached ski at angle
        ctx.beginPath();
        ctx.moveTo(screenX + 30, obstacle.y);
        ctx.lineTo(screenX + 50, obstacle.y + 15);
        ctx.stroke();
        
        // Sitting body
        ctx.fillStyle = jacketColor;
        ctx.beginPath();
        ctx.moveTo(screenX + 10, obstacle.y + 5);
        ctx.lineTo(screenX + 20, obstacle.y + 5);
        ctx.lineTo(screenX + 25, obstacle.y + 20);
        ctx.lineTo(screenX + 5, obstacle.y + 20);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Legs out front
        ctx.fillStyle = pantsColor;
        ctx.beginPath();
        ctx.moveTo(screenX + 15, obstacle.y + 20);
        ctx.lineTo(screenX + 30, obstacle.y + 30);
        ctx.lineTo(screenX + 35, obstacle.y + 25);
        ctx.lineTo(screenX + 20, obstacle.y + 15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Arms trying to get up
        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX + 10, obstacle.y + 10);
        ctx.lineTo(screenX, obstacle.y + 15);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(screenX + 20, obstacle.y + 10);
        ctx.lineTo(screenX + 30, obstacle.y + 15);
        ctx.stroke();
        
        // Hands
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(screenX, obstacle.y + 15, 3, 0, Math.PI * 2);
        ctx.arc(screenX + 30, obstacle.y + 15, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Head
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(screenX + 15, obstacle.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Hat
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.arc(screenX + 15, obstacle.y - 3, 5, 0, Math.PI, true);
        ctx.fill();
        ctx.stroke();
        
        // Poles fallen
        ctx.strokeStyle = poleColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenX - 5, obstacle.y + 5);
        ctx.lineTo(screenX + 15, obstacle.y + 15);
        ctx.moveTo(screenX + 25, obstacle.y + 5);
        ctx.lineTo(screenX + 40, obstacle.y + 20);
        ctx.stroke();
        
    } else {
        // Pose 3: Total wipeout, limbs everywhere
        
        // Skis perpendicular
        ctx.strokeStyle = skiColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX, obstacle.y + 10);
        ctx.lineTo(screenX + 40, obstacle.y + 15);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(screenX + 20, obstacle.y - 5);
        ctx.lineTo(screenX + 25, obstacle.y + 35);
        ctx.stroke();
        
        // Sprawled body
        ctx.fillStyle = jacketColor;
        ctx.beginPath();
        ctx.ellipse(screenX + 20, obstacle.y + 20, 15, 10, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Limbs at odd angles
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        // Legs
        ctx.fillStyle = pantsColor;
        ctx.beginPath();
        ctx.moveTo(screenX + 15, obstacle.y + 15);
        ctx.lineTo(screenX, obstacle.y + 30);
        ctx.lineTo(screenX + 5, obstacle.y + 35);
        ctx.lineTo(screenX + 20, obstacle.y + 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(screenX + 25, obstacle.y + 25);
        ctx.lineTo(screenX + 40, obstacle.y + 35);
        ctx.lineTo(screenX + 45, obstacle.y + 30);
        ctx.lineTo(screenX + 30, obstacle.y + 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Arms flailing
        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX + 10, obstacle.y + 15);
        ctx.lineTo(screenX - 5, obstacle.y + 5);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(screenX + 30, obstacle.y + 15);
        ctx.lineTo(screenX + 45, obstacle.y + 5);
        ctx.stroke();
        
        // Hands
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(screenX - 5, obstacle.y + 5, 3, 0, Math.PI * 2);
        ctx.arc(screenX + 45, obstacle.y + 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Head
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(screenX + 20, obstacle.y + 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Hat falling off
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.arc(screenX + 30, obstacle.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Poles thrown
        ctx.strokeStyle = poleColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenX - 10, obstacle.y + 15);
        ctx.lineTo(screenX + 10, obstacle.y + 25);
        ctx.moveTo(screenX + 30, obstacle.y + 25);
        ctx.lineTo(screenX + 50, obstacle.y + 15);
        ctx.stroke();
    }
    
    ctx.restore(); // Restore context
}

// Render start screen with detailed instructions
function renderStartScreen() {
    // Update game state
    currentScreen = GameScreen.START;
    
    ctx.fillStyle = '#E0F7FA';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);

    // Title
    ctx.fillStyle = '#D00';
    ctx.font = 'bold 40px Arial';
    ctx.fillText('CROSS COUNTRY', CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT / 2 - 140);
    ctx.fillText('OR DIE', CANVAS_WIDTH / 2 - 60, CANVAS_HEIGHT / 2 - 100);
    
    // Simple instructions
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    ctx.fillText('← → Ski with rhythm', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 - 40);
    ctx.fillText('SPACE to jump', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 - 10);
    ctx.fillText('↓ to duck', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 20);

    ctx.font = '20px Arial';
    ctx.fillStyle = '#0066FF';
    ctx.fillText('Press SPACE to Start', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 80);

    // Draw simple examples
    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2 - 150, CANVAS_HEIGHT / 2 + 20);
    ctx.scale(0.8, 0.8);
    const fallenSkierDemo = {
        type: 'skier',
        worldX: worldX,
        y: 0,
        poseType: 0,
        rotation: 0,
        skisAngle: 0,
        poleAngle: 0
    };
    drawFallenSkier(fallenSkierDemo);
    ctx.restore();
    
    // Draw a small skull as a teaser
    drawSkull(CANVAS_WIDTH / 2 + 130, CANVAS_HEIGHT / 2 + 20, 15);
    
    // Draw leaderboard
    drawLeaderboard();
    
    // Make sure start button is visible
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.style.display = 'block';
    }
}

// Draw leaderboard
function drawLeaderboard() {
    if (highScores.length === 0) return;
    
    const leaderboardX = CANVAS_WIDTH - 200;
    const leaderboardY = 30;
    
    // Leaderboard header
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('LEADERBOARD', leaderboardX, leaderboardY);
    
    // Leaderboard entries (top 10)
    ctx.font = '14px Arial';
    
    highScores.forEach((score, index) => {
        const y = leaderboardY + 25 + (index * 20);
        ctx.fillText(`${index + 1}. ${score.name}: ${score.score}`, leaderboardX, y);
    });
}

// Draw a skull
function drawSkull(x, y, size) {
    // Save context for transformations
    ctx.save();
    
    // Skull color
    const skullColor = '#FFFFFF';
    const outlineColor = '#000000';
    
    // Head
    ctx.fillStyle = skullColor;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = size / 10;
    ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#000000';
    const eyeSize = size / 4;
    const eyeOffset = size / 3;
    
    // Left eye
    ctx.beginPath();
    ctx.arc(x - eyeOffset, y - eyeOffset/2, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Right eye
    ctx.beginPath();
    ctx.arc(x + eyeOffset, y - eyeOffset/2, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose
    ctx.beginPath();
    ctx.arc(x, y, eyeSize * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // Teeth
    ctx.fillStyle = skullColor;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = size / 20;
    
    // Jaw
    ctx.beginPath();
    ctx.arc(x, y + size/3, size/2, 0, Math.PI);
    ctx.stroke();
    
    // Teeth lines
    const teethWidth = size / 8;
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * teethWidth, y + size/3);
        ctx.lineTo(x + i * teethWidth, y + size/1.8);
        ctx.stroke();
    }
    
    // Crossbones (if large enough)
    if (size > 10) {
        ctx.lineWidth = size / 10;
        ctx.beginPath();
        ctx.moveTo(x - size, y + size);
        ctx.lineTo(x + size, y + size * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x + size, y + size);
        ctx.lineTo(x - size, y + size * 2);
        ctx.stroke();
    }
    
    ctx.restore();
}

// Fetch high scores from server
async function fetchHighScores() {
    try {
        const response = await fetch(`${SERVER_URL}/highscores`, {
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch high scores: ${response.status}`);
        }
        const data = await response.json();
        highScores = data;
        console.log('Fetched high scores:', highScores);
        return data;
    } catch (error) {
        console.error('Error fetching high scores:', error);
        return [];
    }
}

// Asynchronously load bad words from server
let badWordsCache = null;

async function loadBadWords() {
    if (badWordsCache) {
        return badWordsCache;
    }
    
    try {
        // Load English and Norwegian bad words
        const enResponse = await fetch(`${SERVER_URL}/badwords/en.txt`);
        const noResponse = await fetch(`${SERVER_URL}/badwords/no.txt`);
        
        if (!enResponse.ok || !noResponse.ok) {
            throw new Error('Failed to load bad words lists');
        }
        
        const enText = await enResponse.text();
        const noText = await noResponse.text();
        
        // Split by newlines and filter empty lines
        const enWords = enText.split('\n').filter(word => word.trim() !== '');
        const noWords = noText.split('\n').filter(word => word.trim() !== '');
        
        // Combine both lists
        badWordsCache = [...enWords, ...noWords];
        return badWordsCache;
    } catch (error) {
        console.error('Error loading bad words:', error);
        // Fallback to a minimal list if server files can't be loaded
        return [
            'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 
            'whore', 'slut', 'bastard', 'damn', 'hell', 'piss', 'crap', 'fag',
            'nazi', 'kill', 'murder', 'rape', 'terrorist', 'hitler', 'penis'
        ];
    }
}

// Function to check if name contains any bad words
async function containsBadWords(name) {
    // Get bad words list
    const badWords = await loadBadWords();
    
    // Convert to lowercase for case-insensitive check
    const lowercaseName = name.toLowerCase();
    
    // Check if any bad word is contained in the name
    return badWords.some(word => lowercaseName.includes(word.toLowerCase()));
}

// Sanitize name input to prevent injection attacks
function sanitizeName(name) {
    // Remove HTML tags, script tags, and other potentially dangerous characters
    let sanitized = name
        .replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
        .replace(/[<>'"&;]/g, "")       // Remove special characters
        .trim();                        // Remove leading/trailing whitespace
    
    // Limit to 20 characters max
    sanitized = sanitized.substring(0, 20);
    
    return sanitized;
}

// Get a valid player name with validation and sanitization
async function getValidPlayerName(promptMessage) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        const name = prompt(promptMessage, "");
        attempts++;
        
        // User clicked cancel
        if (name === null) {
            return null;
        }
        
        // Empty name
        if (!name.trim()) {
            alert("Please enter a name.");
            continue;
        }
        
        // Check name length
        if (name.length > 20) {
            alert("Name must be 20 characters or less.");
            continue;
        }
        
        // Check for bad words - now async
        if (await containsBadWords(name)) {
            alert("Please use appropriate language for your name.");
            continue;
        }
        
        // If we got here, name is valid - sanitize and return it
        return sanitizeName(name);
    }
    
    // If we reached max attempts, use a default name
    alert("Using default name due to validation issues.");
    return "Player" + Math.floor(Math.random() * 1000);
}

// Submit score to server
async function submitScore(name, score) {
    try {
        // Final sanitization before sending to server
        const sanitizedName = sanitizeName(name);
        
        const response = await fetch(`${SERVER_URL}/highscores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                name: sanitizedName, 
                score: score 
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to submit score: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Score submitted successfully:', data);
        
        // Refresh high scores
        await fetchHighScores();
        
        return true;
    } catch (error) {
        console.error('Error submitting score:', error);
        return false;
    }
}

// Open submit score dialog
function openSubmitDialog() {
    if (score > 0) {
        // Get and validate player name
        getValidPlayerName(`You scored ${score}! Enter your name for the leaderboard (max 20 chars):`).then(name => {
            if (name) {
                submitScore(name, score);
            }
        });
    } else {
        // Show full leaderboard
        showFullLeaderboard();
    }
}

// Show full leaderboard modal
function showFullLeaderboard() {
    // Clear canvas
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw leaderboard title
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('LEADERBOARD', CANVAS_WIDTH / 2 - 100, 50);
    
    // Draw scores
    ctx.font = '18px Arial';
    
    if (highScores.length === 0) {
        ctx.fillText('No scores yet. Be the first!', CANVAS_WIDTH / 2 - 100, 100);
    } else {
        // Show all 20 scores or however many exist
        highScores.forEach((score, index) => {
            // Calculate position - two columns if more than 10 scores
            let x, y;
            if (highScores.length > 10 && index >= 10) {
                // Second column (scores 11-20)
                x = CANVAS_WIDTH / 2 + 50;
                y = 100 + ((index - 10) * 30);
            } else {
                // First column (scores 1-10)
                x = CANVAS_WIDTH / 2 - 200;
                y = 100 + (index * 30);
            }
            
            const rank = index + 1;
            const rankText = rank < 10 ? ` ${rank}` : rank;
            ctx.fillText(`${rankText}. ${score.name}: ${score.score}`, x, y);
        });
    }
    
    // Draw close instructions
    ctx.fillStyle = '#0066FF';
    ctx.fillText('Press SPACE to close', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT - 50);
}

// Game over
function gameOver() {
    currentScreen = GameScreen.GAME_OVER;
    
    // Check if this score is higher than any on the leaderboard
    const isLeaderboardWorthy = highScores.length < 20 || score > highScores[highScores.length - 1]?.score;
    
    // Add a slight delay before showing game over screen
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Draw large skull
        drawSkull(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 70, 50);
        
        ctx.fillStyle = '#D00';
        ctx.font = 'bold 40px Arial';
        ctx.fillText('YOU DIED', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 20);
        
        ctx.fillStyle = '#FFF';
        ctx.font = '24px Arial';
        ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2 - 50, CANVAS_HEIGHT / 2 + 60);
        
        ctx.font = '20px Arial';
        ctx.fillText('Press SPACE to return to main menu', CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT / 2 + 100);
        
        // Always display an instruction for the leaderboard
        ctx.fillStyle = '#FFFF00';
        ctx.fillText('Press L to view leaderboard', CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT / 2 + 180);
        
        // If score is worthy of leaderboard, automatically prompt for name
        if (isLeaderboardWorthy && score > 100) {
            setTimeout(() => {
                // Get and validate player name
                getValidPlayerName(`You scored ${score}! Enter your name for the leaderboard (max 20 chars):`).then(name => {
                    if (name) {
                        submitScore(name, score);
                    }
                });
            }, 300);
        }
    }, 500);
}

// Start the game
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded - initializing game");
    init();
    window.gameInitialized = true;
});