const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const util = require('util');

const BOT_CONFIG = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: process.env.MC_USERNAME || 'AI_Bot_' + Math.floor(Math.random() * 999),
  version: '1.20.4',
  hideErrors: true,
  physicsEnabled: false,
  viewDistance: 'tiny'
};

let bot = null;
let isReconnecting = false;
let isReady = false;
let isExecutingTask = false;

let mcData;
let logIds = [];

function createBot() {
  if (isReconnecting) return;
  bot = mineflayer.createBot(BOT_CONFIG);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[SPAWN] Bot spawned at: ${bot.entity.position.floored()}`);
    
    // High latency stability lock
    bot.entity.velocity.set(0, 0, 0);
    
    setTimeout(() => {
      mcData = mcDataLoader(bot.version);
      
      // ANTI-CHEAT SAFE MOVEMENTS
      const movements = new Movements(bot, mcData);
      movements.canDig = false; // হাঁটার সময় ব্লক ভাঙবে না (অ্যান্টি-চিট সেফটি)
      movements.allowParkour = false; // লাফিয়ে লাফিয়ে রিস্কি মুভমেন্ট করবে না
      movements.allowSprinting = false; // ধীরে সুস্থে হাঁটবে
      bot.pathfinder.setMovements(movements);
      
      logIds = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log']
        .map(name => mcData.blocksByName[name]?.id)
        .filter(id => id !== undefined);

      isReady = true;
      console.log('[SYSTEM] Anti-Cheat Safe AI Loop Started.');
      
      // Sequential async task runner (No overlapping setInterval)
      runTaskQueue();
      
    }, 20000); 
  });

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', handleDisconnect);
  
  bot.on('death', () => {
    console.log('[DEATH] Bot died. Respawning cleanly...');
    isExecutingTask = false;
  });
}

// Helper sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= SEQUENTIAL TASK QUEUE =================

async function runTaskQueue() {
  while (isReady && !isReconnecting) {
    if (!isExecutingTask && bot && bot.entity) {
      isExecutingTask = true;
      try {
        await processNextBestAction();
      } catch (err) {
        console.log(`[TASK EXCEPTION] ${err.message || err}`);
      }
      isExecutingTask = false;
    }
    await sleep(3000); // 3-second delay between tasks for server-sync
  }
}

async function processNextBestAction() {
  // 1. DANGER CHECK (Highest Priority)
  const mob = findNearestDanger();
  if (mob) {
    await fleeFromDanger(mob);
    return;
  }

  // 2. CRAFTING CHECK
  if (hasLogs()) {
    await craftPlanksSafely();
    return;
  }

  // 3. SAFE TREE CHOPPING
  const safeLog = findSafeTreeLog();
  if (safeLog) {
    await chopTreeSafely(safeLog);
    return;
  }

  // 4. SAFE WANDERING (Fallback)
  await wanderSafely();
}

// ================= DANGER & FLEE =================

function findNearestDanger() {
  return bot.nearestEntity(e => 
    e.type === 'mob' && 
    ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch'].includes(e.name) &&
    e.position.distanceTo(bot.entity.position) < 12
  );
}

async function fleeFromDanger(mob) {
  console.log(`[SAFE-AI] Danger detected (${mob.name}). Walking away...`);
  
  const dx = bot.entity.position.x - mob.position.x;
  const dz = bot.entity.position.z - mob.position.z;
  
  const targetX = bot.entity.position.x + (dx > 0 ? 10 : -10);
  const targetZ = bot.entity.position.z + (dz > 0 ? 10 : -10);
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2));
    await sleep(4000);
  } catch (e) {}
}

// ================= TREE CHOPPING =================

function findSafeTreeLog() {
  // ২০ ব্লকের মধ্যে এমন গাছ খুঁজবে যা বটের সমতলে (Y-level difference max 3)
  return bot.findBlock({
    matching: logIds,
    maxDistance: 15,
    useExtraInfo: (block) => {
      const heightDiff = Math.abs(block.position.y - bot.entity.position.y);
      return heightDiff <= 3; // পাহাড়ে উঠে আত্মহত্যার হাত থেকে বাঁচাতে
    }
  });
}

async function chopTreeSafely(block) {
  console.log(`[ACTION] Safe tree found at ${block.position.floored()}. Approaching...`);
  
  try {
    // Walk next to the tree block
    bot.pathfinder.setGoal(new goals.GoalLookAtBlock(block.position, bot.world));
    await sleep(3000);

    const dist = bot.entity.position.distanceTo(block.position);
    if (dist <= 4.5) {
      if (bot.canDigBlock(block)) {
        console.log('[ACTION] Digging log...');
        bot.lookAt(block.position);
        await sleep(500); // Human reaction simulation
        await bot.dig(block);
        console.log('[ACTION] Log chopped successfully!');
        await sleep(1000);
      }
    } else {
      console.log('[ACTION] Could not reach tree safely (Too far/Lag). Skipping.');
    }
  } catch (err) {
    console.log(`[ACTION] Chop attempt failed cleanly: ${err.message || 'Desync'}`);
    bot.pathfinder.stop();
  }
}

// ================= CRAFTING =================

function hasLogs() {
  return bot.inventory.items().some(item => item.name.endsWith('_log'));
}

async function craftPlanksSafely() {
  console.log('[CRAFT] Converting logs into planks...');
  try {
    const logItem = bot.inventory.items().find(item => item.name.endsWith('_log'));
    if (!logItem) return;

    const plankName = logItem.name.replace('_log', '_planks');
    const plankItem = mcData.itemsByName[plankName];
    
    if (plankItem) {
      const recipe = bot.recipesFor(plankItem.id, null, 1, null)[0];
      if (recipe) {
        await bot.craft(recipe, 1, null);
        console.log(`[CRAFT] Successfully crafted ${plankName}!`);
      }
    }
  } catch (e) {
    console.log('[CRAFT] Crafting postponed due to inventory sync.');
  }
  await sleep(1500);
}

// ================= WANDERING =================

async function wanderSafely() {
  console.log('[IDLE] Wandering around safely...');
  
  // Head look animation
  const yaw = bot.entity.yaw + (Math.random() - 0.5) * 1.5;
  bot.look(yaw, 0, false);
  
  if (Math.random() < 0.3) {
    bot.swingArm('right');
    await sleep(1000);
    return;
  }

  // Small random walk (within 4 blocks)
  const rx = bot.entity.position.x + (Math.random() - 0.5) * 8;
  const rz = bot.entity.position.z + (Math.random() - 0.5) * 8;
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(rx, bot.entity.position.y, rz, 1));
    await sleep(3000);
  } catch (e) {}
}

// ================= RECONNECT HANDLER =================

function handleDisconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;
  isReady = false;
  isExecutingTask = false;
  
  const cleanReason = typeof reason === 'object' ? util.inspect(reason) : reason;
  console.log(`[DISCONNECT] Reason: ${cleanReason}`);
  console.log('[RECONNECT] Waiting 40 seconds to prevent duplicate login...');
  
  setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, 40000);
}

createBot();
