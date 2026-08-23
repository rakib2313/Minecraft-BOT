const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

// ===== CONFIGURATION =====

const BOT_CONFIG = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: process.env.MC_USERNAME || 'GH_AFK_' + Math.floor(Math.random() * 9999),
  version: '1.20.4',
  hideErrors: true,
  checkTimeoutInterval: 90000,
  physicsEnabled: false, // CRITICAL: Start with physics disabled
  respawn: true,
  viewDistance: 'tiny'
};

// ===== STATE MANAGEMENT =====

let bot = null;
let isReconnecting = false;
let chunksFullyLoaded = false;
let physicsLocked = true;
let groundPosition = null;
let afkBehaviorActive = false;

// Intervals
let afkActionInterval = null;
let cameraMovementInterval = null;
let healthCheckInterval = null;

// ===== BOT INITIALIZATION =====

function createBot() {
  if (isReconnecting) {
    console.log('[INIT] Already reconnecting, skipping duplicate creation');
    return;
  }
  
  console.log('[INIT] Creating new bot instance...');
  
  bot = mineflayer.createBot(BOT_CONFIG);
  bot.loadPlugin(pathfinder);
  
  registerEventHandlers();
}

// ===== EVENT HANDLERS =====

function registerEventHandlers() {
  
  // ===== SPAWN HANDLER =====
  bot.once('spawn', () => {
    console.log(`[SPAWN] Bot spawned at position: ${bot.entity.position}`);
    
    // Reset state
    chunksFullyLoaded = false;
    physicsLocked = true;
    groundPosition = null;
    afkBehaviorActive = false;
    
    // CRITICAL DESYNC FIX: Apply physics lock immediately
    applyPhysicsLock();
    
    // Wait for chunk loading with extended delay due to high ping
    console.log('[CHUNKS] Waiting 20 seconds for chunks to load (high-latency protection)...');
    
    setTimeout(() => {
      detectGroundAndUnlock();
    }, 20000); // 20 second grace period for GitHub Actions -> Asia server latency
  });
  
  // ===== PHYSICS TICK OVERRIDE (ANTI-DESYNC CORE) =====
  bot.on('physicsTick', () => {
    if (physicsLocked && bot.entity) {
      // CRITICAL FIX: Nullify all velocity components to prevent falling through unloaded chunks
      // This is the PRIMARY fix for "invalid_player_movement" kicks on high-ping connections
      if (bot.entity.velocity) {
        bot.entity.velocity.x = 0;
        bot.entity.velocity.y = 0;
        bot.entity.velocity.z = 0;
      }
      
      // Additional safety: Lock position to last known ground position
      if (groundPosition && bot.entity.position) {
        const drift = bot.entity.position.distanceTo(groundPosition);
        
        if (drift > 0.3) {
          // Force position back to ground if drift detected
          bot.entity.position.x = groundPosition.x;
          bot.entity.position.y = groundPosition.y;
          bot.entity.position.z = groundPosition.z;
          console.log('[PHYSICS] Position drift detected and corrected');
        }
      }
    }
  });
  
  // ===== CHUNK LOADING TRACKING =====
  bot.on('chunkColumnLoad', (point) => {
    if (!chunksFullyLoaded) {
      console.log(`[CHUNK] Loaded chunk column at ${point.x}, ${point.z}`);
    }
  });
  
  // ===== CONNECTION HANDLERS =====
  bot.on('login', () => {
    console.log('[LOGIN] Successfully authenticated with server');
  });
  
  bot.on('end', (reason) => {
    console.log(`[DISCONNECT] Connection ended: ${reason}`);
    handleDisconnection();
  });
  
  bot.on('kicked', (reason) => {
    console.log(`[KICKED] ${reason}`);
    handleDisconnection();
  });
  
  bot.on('error', (err) => {
    console.error(`[ERROR] ${err.code || err.message}`);
    
    // Handle common network errors gracefully
    if (err.code === 'ECONNREFUSED' || 
        err.code === 'ECONNRESET' || 
        err.code === 'ETIMEDOUT' ||
        err.message.includes('Connection')) {
      handleDisconnection();
    }
  });
  
  bot.on('death', () => {
    console.log('[DEATH] Bot died, attempting respawn...');
    setTimeout(() => {
      if (bot) {
        bot.respawn();
        physicsLocked = true;
        chunksFullyLoaded = false;
        
        setTimeout(() => {
          detectGroundAndUnlock();
        }, 15000);
      }
    }, 3000);
  });
  
  // ===== HEALTH MONITORING =====
  bot.on('health', () => {
    if (bot.health <= 5) {
      console.log(`[HEALTH] CRITICAL: ${bot.health}/20 HP`);
    }
  });
  
  // ===== CHAT MONITORING =====
  bot.on('message', (message) => {
    const msg = message.toString();
    console.log(`[CHAT] ${msg}`);
    
    // Respond to anti-AFK verification prompts
    if (msg.toLowerCase().includes('afk') || 
        (msg.toLowerCase().includes('type') && msg.includes(bot.username))) {
      
      setTimeout(() => {
        if (bot && afkBehaviorActive) {
          bot.chat('Active!');
          console.log('[CHAT] Responded to AFK check');
        }
      }, 2500 + Math.random() * 2500); // Human-like delay
    }
  });
}

// ===== PHYSICS LOCK SYSTEM =====

function applyPhysicsLock() {
  console.log('[PHYSICS] LOCKING position - Velocity disabled to prevent void fall');
  physicsLocked = true;
  
  // Store initial position
  if (bot.entity && bot.entity.position) {
    groundPosition = bot.entity.position.clone();
    console.log(`[PHYSICS] Ground position locked at: ${groundPosition}`);
  }
  
  // Disable pathfinder movements during lock
  if (bot.pathfinder) {
    try {
      const mcData = require('minecraft-data')(bot.version);
      const restrictedMovement = new Movements(bot, mcData);
      restrictedMovement.canDig = false;
      restrictedMovement.allow1by1towers = false;
      restrictedMovement.maxDropDown = 0;
      bot.pathfinder.setMovements(restrictedMovement);
    } catch (err) {
      console.log('[PHYSICS] Could not restrict pathfinder movements');
    }
  }
}

function detectGroundAndUnlock() {
  if (!bot || !bot.entity) {
    console.log('[PHYSICS] Bot entity not available, cannot unlock');
    return;
  }
  
  console.log('[PHYSICS] Attempting to detect ground and unlock physics...');
  
  // Check if bot is on ground
  const position = bot.entity.position;
  const blockBelow = bot.blockAt(position.offset(0, -1, 0));
  
  if (blockBelow && blockBelow.name !== 'air') {
    console.log(`[PHYSICS] Ground detected: ${blockBelow.name} at Y=${position.y}`);
    groundPosition = position.clone();
    unlockPhysics();
  } else {
    console.log('[PHYSICS] No ground detected yet, extending lock by 10 seconds');
    
    // Extended safety delay
    setTimeout(() => {
      if (bot && bot.entity) {
        groundPosition = bot.entity.position.clone();
        unlockPhysics();
      }
    }, 10000);
  }
}

function unlockPhysics() {
  console.log('[PHYSICS] UNLOCKING - Normal physics and movement enabled');
  physicsLocked = false;
  chunksFullyLoaded = true;
  
  // Start AFK behavior after physics are safe
  setTimeout(() => {
    startAFKBehavior();
  }, 2000);
}

// ===== AFK BEHAVIOR SYSTEM =====

function startAFKBehavior() {
  if (afkBehaviorActive) {
    console.log('[AFK] Behavior already active');
    return;
  }
  
  console.log('[AFK] Starting human-like anti-AFK behavior');
  afkBehaviorActive = true;
  
  // Clear any existing intervals
  stopAFKBehavior();
  
  // Periodic arm swing (every 50-100 seconds)
  afkActionInterval = setInterval(() => {
    if (bot && bot.entity && afkBehaviorActive) {
      bot.swingArm('right');
      console.log('[AFK] Arm swing executed');
    }
  }, 50000 + Math.random() * 50000);
  
  // Smooth camera movements (every 25-50 seconds)
  cameraMovementInterval = setInterval(() => {
    if (bot && bot.entity && afkBehaviorActive && chunksFullyLoaded) {
      performSmoothCameraMovement();
    }
  }, 25000 + Math.random() * 25000);
  
  // Health monitoring (every 30 seconds)
  healthCheckInterval = setInterval(() => {
    if (bot && bot.health !== undefined) {
      console.log(`[STATUS] Health: ${bot.health}/20 | Food: ${bot.food}/20 | Position: ${bot.entity.position.floored()}`);
    }
  }, 30000);
}

function stopAFKBehavior() {
  if (afkActionInterval) clearInterval(afkActionInterval);
  if (cameraMovementInterval) clearInterval(cameraMovementInterval);
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  
  afkActionInterval = null;
  cameraMovementInterval = null;
  healthCheckInterval = null;
  afkBehaviorActive = false;
}

// ===== SMOOTH CAMERA MOVEMENT (ANTI-CHEAT SAFE) =====

function performSmoothCameraMovement() {
  if (!bot || !bot.entity) return;
  
  const currentYaw = bot.entity.yaw;
  const currentPitch = bot.entity.pitch;
  
  // Generate small, natural rotation deltas
  const yawDelta = (Math.random() - 0.5) * 1.0; // ±0.5 radians (~28 degrees)
  const pitchDelta = (Math.random() - 0.5) * 0.5; // ±0.25 radians (~14 degrees)
  
  const targetYaw = currentYaw + yawDelta;
  const targetPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, currentPitch + pitchDelta));
  
  // Smooth interpolation over multiple steps
  const steps = 15 + Math.floor(Math.random() * 15); // 15-30 steps
  const stepDuration = 40 + Math.floor(Math.random() * 30); // 40-70ms per step
  
  let step = 0;
  
  const smoothRotation = setInterval(() => {
    if (!bot || !bot.entity || step >= steps) {
      clearInterval(smoothRotation);
      return;
    }
    
    const progress = step / steps;
    
    // Ease-in-out interpolation for natural movement
    const eased = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    const interpolatedYaw = currentYaw + (yawDelta * eased);
    const interpolatedPitch = currentPitch + ((targetPitch - currentPitch) * eased);
    
    bot.look(interpolatedYaw, interpolatedPitch, false);
    
    step++;
  }, stepDuration);
  
  console.log('[CAMERA] Executing smooth rotation');
}

// ===== RECONNECTION LOGIC =====

function handleDisconnection() {
  if (isReconnecting) {
    console.log('[RECONNECT] Already scheduled');
    return;
  }
  
  console.log('[RECONNECT] Handling disconnection...');
  isReconnecting = true;
  
  // Cleanup
  stopAFKBehavior();
  chunksFullyLoaded = false;
  physicsLocked = true;
  groundPosition = null;
  
  if (bot) {
    bot.removeAllListeners();
  }
  
  // Random delay between 30-45 seconds to prevent duplicate_login
  const reconnectDelay = 30000 + Math.random() * 15000;
  
  console.log(`[RECONNECT] Waiting ${Math.round(reconnectDelay / 1000)} seconds before reconnecting...`);
  
  setTimeout(() => {
    isReconnecting = false;
    console.log('[RECONNECT] Initiating reconnection...');
    createBot();
  }, reconnectDelay);
}

// ===== PROCESS ERROR HANDLERS =====

process.on('uncaughtException', (err) => {
  console.error(`[FATAL] Uncaught Exception: ${err.message}`);
  console.error(err.stack);
  
  if (!isReconnecting) {
    handleDisconnection();
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  
  if (!isReconnecting) {
    handleDisconnection();
  }
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Received SIGINT, gracefully shutting down...');
  stopAFKBehavior();
  
  if (bot) {
    bot.quit('Shutdown');
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Received SIGTERM, gracefully shutting down...');
  stopAFKBehavior();
  
  if (bot) {
    bot.quit('Shutdown');
  }
  
  process.exit(0);
});

// ===== STARTUP =====

console.log('========================================');
console.log('  Minecraft 24/7 AFK Bot - GitHub Actions');
console.log('========================================');
console.log(`Server: ${BOT_CONFIG.host}:${BOT_CONFIG.port}`);
console.log(`Version: ${BOT_CONFIG.version}`);
console.log(`Username: ${BOT_CONFIG.username}`);
console.log('========================================\n');

createBot();
