const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

// Bot configuration
const BOT_CONFIG = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: process.env.MC_USERNAME || 'AFKBot_' + Math.floor(Math.random() * 1000),
  version: '1.20.4',
  hideErrors: true,
  checkTimeoutInterval: 60000,
  physicsEnabled: true,
  respawn: true
};

let bot = null;
let isReconnecting = false;
let chunksLoaded = false;
let positionLocked = false;
let spawnPosition = null;
let afkInterval = null;
let cameraInterval = null;

// Create bot instance with error handling
function createBot() {
  if (isReconnecting) return;
  
  bot = mineflayer.createBot(BOT_CONFIG);
  
  // Load pathfinder plugin
  bot.loadPlugin(pathfinder);
  
  setupEventHandlers();
}

function setupEventHandlers() {
  // ===== SPAWN & CHUNK LOADING HANDLERS =====
  
  bot.once('spawn', () => {
    console.log(`[SPAWN] Bot spawned at ${bot.entity.position}`);
    chunksLoaded = false;
    positionLocked = false;
    spawnPosition = bot.entity.position.clone();
    
    // CRITICAL: Override physics to prevent falling through unloaded chunks
    // This disables velocity and gravity updates until chunks are fully loaded
    lockPhysicsUntilChunksLoad();
    
    // Wait for chunks to load before enabling movement
    setTimeout(() => {
      chunksLoaded = true;
      positionLocked = false;
      console.log('[CHUNKS] Chunk loading grace period complete, enabling normal physics');
      startAFKBehavior();
    }, 15000); // 15 second delay for high-ping chunk loading
  });
  
  bot.on('chunkColumnLoad', (point) => {
    // Track chunk loading around spawn position
    if (spawnPosition && point.distanceTo(spawnPosition.offset(0, 0, 0).floored()) < 5) {
      console.log(`[CHUNK] Loaded chunk at ${point}`);
    }
  });
  
  // ===== PHYSICS OVERRIDE SYSTEM =====
  // This is the core anti-desync mechanism
  bot.on('physicsTick', () => {
    if (!chunksLoaded || positionLocked) {
      // CRITICAL FIX: Nullify all velocity to prevent movement before chunks load
      // This prevents the "invalid_player_movement" kick from falling through unloaded chunks
      if (bot.entity && bot.entity.velocity) {
        bot.entity.velocity.x = 0;
        bot.entity.velocity.y = 0;
        bot.entity.velocity.z = 0;
      }
      
      // Force position lock to spawn point
      if (spawnPosition && bot.entity && bot.entity.position) {
        const currentPos = bot.entity.position;
        const distFromSpawn = currentPos.distanceTo(spawnPosition);
        
        // If bot has moved more than 0.5 blocks during loading, teleport back
        if (distFromSpawn > 0.5) {
          bot.entity.position.x = spawnPosition.x;
          bot.entity.position.y = spawnPosition.y;
          bot.entity.position.z = spawnPosition.z;
        }
      }
    }
  });
  
  // ===== CONNECTION HANDLERS =====
  
  bot.on('login', () => {
    console.log('[LOGIN] Successfully logged into server');
  });
  
  bot.on('end', (reason) => {
    console.log(`[DISCONNECT] Bot disconnected: ${reason}`);
    cleanup();
    scheduleReconnect();
  });
  
  bot.on('kicked', (reason) => {
    console.log(`[KICKED] ${reason}`);
    cleanup();
    scheduleReconnect();
  });
  
  bot.on('error', (err) => {
    console.error(`[ERROR] ${err.message}`);
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ECONNRESET')) {
      cleanup();
      scheduleReconnect();
    }
  });
  
  bot.on('death', () => {
    console.log('[DEATH] Bot died, respawning...');
    setTimeout(() => {
      bot.respawn();
    }, 2000);
  });
  
  // ===== HEALTH & FOOD MONITORING =====
  
  bot.on('health', () => {
    if (bot.health < 10) {
      console.log(`[HEALTH] Low health: ${bot.health}/20`);
    }
  });
  
  bot.on('message', (message) => {
    const msg = message.toString();
    console.log(`[CHAT] ${msg}`);
    
    // Respond to common anti-AFK prompts
    if (msg.toLowerCase().includes('are you afk') || msg.toLowerCase().includes('type') && msg.includes('bot.username')) {
      setTimeout(() => {
        bot.chat('I\'m here!');
      }, 2000 + Math.random() * 3000);
    }
  });
}

// ===== ANTI-AFK BEHAVIOR SYSTEM =====

function startAFKBehavior() {
  console.log('[AFK] Starting human-like AFK behavior');
  
  // Clear any existing intervals
  if (afkInterval) clearInterval(afkInterval);
  if (cameraInterval) clearInterval(cameraInterval);
  
  // Periodic arm swing (every 45-90 seconds)
  afkInterval = setInterval(() => {
    if (bot && bot.entity) {
      bot.swingArm();
      console.log('[ACTION] Swinging arm');
    }
  }, 45000 + Math.random() * 45000);
  
  // Smooth camera movement (every 20-40 seconds)
  cameraInterval = setInterval(() => {
    if (bot && bot.entity) {
      smoothCameraRotation();
    }
  }, 20000 + Math.random() * 20000);
}

// Smooth, human-like camera rotation to avoid instant snapping
function smoothCameraRotation() {
  if (!bot || !bot.entity) return;
  
  const currentYaw = bot.entity.yaw;
  const currentPitch = bot.entity.pitch;
  
  // Generate small random rotation deltas (realistic human micro-movements)
  const targetYaw = currentYaw + (Math.random() - 0.5) * 0.8; // ±0.4 radians (~23 degrees)
  const targetPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, currentPitch + (Math.random() - 0.5) * 0.4));
  
  const steps = 10 + Math.floor(Math.random() * 10); // 10-20 interpolation steps
  const yawStep = (targetYaw - currentYaw) / steps;
  const pitchStep = (targetPitch - currentPitch) / steps;
  
  let currentStep = 0;
  
  const rotationInterval = setInterval(() => {
    if (!bot || !bot.entity || currentStep >= steps) {
      clearInterval(rotationInterval);
      return;
    }
    
    const newYaw = currentYaw + (yawStep * currentStep);
    const newPitch = currentPitch + (pitchStep * currentStep);
    
    bot.look(newYaw, newPitch, false);
    currentStep++;
  }, 50); // 50ms per step = 500-1000ms total rotation time
  
  console.log('[CAMERA] Performing smooth camera rotation');
}

// Lock physics during initial chunk loading
function lockPhysicsUntilChunksLoad() {
  console.log('[PHYSICS] Locking position to prevent invalid movement kick');
  positionLocked = true;
  
  // Additional safety: disable pathfinder movements during loading
  if (bot.pathfinder) {
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = false;
    bot.pathfinder.setMovements(defaultMove);
  }
}

// ===== RECONNECTION LOGIC =====

function scheduleReconnect() {
  if (isReconnecting) return;
  
  isReconnecting = true;
  cleanup();
  
  // Random delay between 30-45 seconds to avoid duplicate_login errors
  const reconnectDelay = 30000 + Math.random() * 15000;
  
  console.log(`[RECONNECT] Waiting ${Math.round(reconnectDelay / 1000)}s before reconnecting...`);
  
  setTimeout(() => {
    isReconnecting = false;
    console.log('[RECONNECT] Attempting to reconnect...');
    createBot();
  }, reconnectDelay);
}

// Cleanup intervals and listeners
function cleanup() {
  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }
  
  if (cameraInterval) {
    clearInterval(cameraInterval);
    cameraInterval = null;
  }
  
  chunksLoaded = false;
  positionLocked = false;
  spawnPosition = null;
  
  if (bot) {
    bot.removeAllListeners();
  }
}

// ===== PROCESS ERROR HANDLERS =====

process.on('uncaughtException', (err) => {
  console.error(`[UNCAUGHT EXCEPTION] ${err.message}`);
  console.error(err.stack);
  cleanup();
  scheduleReconnect();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  cleanup();
  scheduleReconnect();
});

// Graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Received SIGINT, shutting down gracefully...');
  cleanup();
  if (bot) {
    bot.quit();
  }
  process.exit(0);
});

// ===== START BOT =====

console.log('[INIT] Starting AFK bot...');
console.log(`[CONFIG] Target: ${BOT_CONFIG.host}:${BOT_CONFIG.port}`);
console.log(`[CONFIG] Version: ${BOT_CONFIG.version}`);
createBot();
