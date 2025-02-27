// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const SKIER_VERTICAL_OFFSET = 65;
const FPS = 60;

// Game variables
let canvas, ctx;
let gameRunning = false;
let score = 0;
let highScore = localStorage.getItem('highScore') ? parseInt(localStorage.getItem('highScore')) : 0;
let worldX = 0;

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

// Initialize game
function init() {
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
        
        // Listen for clicks on the canvas to start the game too
        canvas.addEventListener('click', function() {
            console.log("Canvas clicked");
            try {
                if (!gameRunning) {
                    startGame();
                }
            } catch (error) {
                console.error("Error in canvas click handler:", error);
                gameErrors.push(error.toString());
            }
        });
        
        // Special handler for the Space key
        window.addEventListener('keydown', function(e) {
            console.log("Key pressed on window:", e.key, e.code);
            try {
                if (!gameRunning && (e.key === ' ' || e.code === 'Space')) {
                    console.log("Space key detected - starting game");
                    startGame();
                }
            } catch (error) {
                console.error("Error in keydown handler:", error);
                gameErrors.push(error.toString());
            }
        });
        
        // Try to add a fallback click handler for the whole document
        document.body.addEventListener('click', function(e) {
            console.log("Body clicked");
            try {
                if (!gameRunning && e.target.id !== 'startButton') {
                    // Only trigger if not clicking the start button (which has its own handler)
                    startGame();
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
    console.log("Key pressed:", event.key, "Game running:", gameRunning);

    if (!gameRunning && (event.key === ' ' || event.code === 'Space')) {
        startGame();
        return;
    }

    if (!gameRunning) return;

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
    gameRunning = true;
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
    if (!gameRunning) return;

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
            obstacles.push({
                type: 'bridge',
                worldX: worldX + CANVAS_WIDTH + Math.random() * 300,
                y: CANVAS_HEIGHT - 105, // Higher than ground but lower for hockey duck
                width: 120,  // Wide bridge
                height: 50,  // Low clearance - need to duck
                bridgeHeight: 50 + Math.random() * 10, // Variable height
                clearance: 50 // Space under bridge
            });
        }
        spawnTimer = 0;
    }

    // Move obstacles at a speed relative to player's speed
    obstacles.forEach(obstacle => obstacle.worldX -= 2 + skier.speed * 0.2);
    
    // Remove obstacles that are far behind
    obstacles = obstacles.filter(obstacle => obstacle.worldX > worldX - 150);
}

// Check collisions
function checkCollisions() {
    obstacles.forEach(obstacle => {
        const obstacleScreenX = obstacle.worldX - worldX;
        
        if (obstacle.type === 'skier') {
            // For fallen skiers - can jump over them
            if (
                skier.x < obstacleScreenX + obstacle.width &&
                skier.x + 20 > obstacleScreenX &&
                skier.y < obstacle.y + obstacle.height &&
                skier.y + skier.height > obstacle.y
            ) {
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
    
        // Background
        ctx.fillStyle = '#E0F7FA';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);
        
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
        ctx.fillText(`High Score: ${highScore}`, 10, 60);
        
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
    ctx.fillStyle = '#E0F7FA';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);

    ctx.fillStyle = '#000';
    ctx.font = '28px Arial';
    ctx.fillText('Cross-Country Skier Challenge', CANVAS_WIDTH / 2 - 170, CANVAS_HEIGHT / 2 - 140);
    ctx.font = '18px Arial';
    ctx.fillText('How to Play:', CANVAS_WIDTH / 2 - 50, CANVAS_HEIGHT / 2 - 100);
    
    // Better instructions with more detail
    ctx.font = '16px Arial';
    ctx.fillText('1. Alternate Left and Right arrow keys to ski forward', CANVAS_WIDTH / 2 - 190, CANVAS_HEIGHT / 2 - 70);
    ctx.fillText('2. Follow the rhythm guide (black dot) for best speed', CANVAS_WIDTH / 2 - 190, CANVAS_HEIGHT / 2 - 40);
    ctx.fillText('3. Watch the blue bar - it shows your rhythm quality', CANVAS_WIDTH / 2 - 190, CANVAS_HEIGHT / 2 - 10);
    ctx.fillText('4. Press SPACE to jump over fallen skiers', CANVAS_WIDTH / 2 - 190, CANVAS_HEIGHT / 2 + 20);
    ctx.fillText('5. Press DOWN ARROW to duck under bridges', CANVAS_WIDTH / 2 - 190, CANVAS_HEIGHT / 2 + 50);
    ctx.fillText('6. Going faster makes timing more difficult!', CANVAS_WIDTH / 2 - 190, CANVAS_HEIGHT / 2 + 80);

    ctx.font = '20px Arial';
    ctx.fillStyle = '#0066FF';
    ctx.fillText('Press SPACE to Start', CANVAS_WIDTH / 2 - 90, CANVAS_HEIGHT / 2 + 120);
    
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH / 2 - 50, CANVAS_HEIGHT / 2 + 150);
    
    // Draw demo rhythm guide
    ctx.fillStyle = '#666';
    ctx.fillText('Rhythm guide:', 100, 300);
    ctx.fillRect(100, 310, 200, 10);
    
    // Simulate the rhythm marker
    const time = Date.now() / 1000;
    const marker = 100 + (Math.sin(time * 1.5) * 100 + 100) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.arc(marker, 315, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#666';
    ctx.fillText('← Tap when dot is here', 100, 340);
    ctx.fillText('Tap opposite arrow when dot reaches other side →', 100, 360);
    
    // Draw the obstacle types
    // Fallen skier
    ctx.save();
    ctx.translate(600, 300);
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
    ctx.fillText('Jump over fallen skiers (SPACE)', 550, 340);
    
    // Bridge
    ctx.save();
    ctx.translate(600, 380);
    ctx.scale(0.8, 0.8);
    const bridgeDemo = {
        type: 'bridge',
        worldX: worldX,
        y: 0,
        width: 80,
        height: 20,
        bridgeHeight: 20,
        clearance: 30
    };
    drawBridge(bridgeDemo);
    ctx.restore();
    ctx.fillText('Duck under bridges (DOWN ARROW)', 550, 420);
}

// Game over
function gameOver() {
    gameRunning = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
    }
    
    // Add a slight delay before showing game over screen
    setTimeout(() => {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(CANVAS_WIDTH / 2 - 200, CANVAS_HEIGHT / 2 - 70, 400, 140);
        
        ctx.fillStyle = '#FFF';
        ctx.font = '36px Arial';
        ctx.fillText(`Game Over! Score: ${score}`, CANVAS_WIDTH / 2 - 150, CANVAS_HEIGHT / 2 - 20);
        ctx.font = '24px Arial';
        ctx.fillText('Press SPACE or Click to Restart', CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT / 2 + 20);
        
        if (score > highScore - 1) {
            ctx.fillStyle = '#FFFF00';
            ctx.fillText('NEW HIGH SCORE!', CANVAS_WIDTH / 2 - 110, CANVAS_HEIGHT / 2 + 60);
        }
    }, 500);
}

// Start the game
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded - initializing game");
    init();
    window.gameInitialized = true;
});