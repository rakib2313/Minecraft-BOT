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
  physicsEnabled: true, // গ্র্যাভিটি অন রাখা হয়েছে যাতে Fly Kick না খায়
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
  
  console.log('[INIT] Creating Bot instance...');
  bot = mineflayer.createBot(BOT_CONFIG);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[SPAWN] Bot spawned at: ${bot.entity.position.floored()}`);
    
    // ১০ সেকেন্ডের ইনিশিয়াল সেফটি পজ (Chunk Load হওয়ার জন্য)
    setTimeout(() => {
      mcData = mcDataLoader(bot.version);
      
      const movements = new Movements(bot, mcData);
      movements.canDig = true; // ব্লক ভাঙার পারমিশন
      movements.allow1by1towers = false;
      movements.allowSprinting = false; // সাধারণ গতিতে হাঁটবে
      movements.allowParkour = false;
      bot.pathfinder.setMovements(movements);
      
      // গাছের ব্লকের আইডি সংগ্রহ
      logIds = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log']
        .map(name => mcData.blocksByName[name]?.id)
        .filter(id => id !== undefined);

      isReady = true;
      console.log('[SYSTEM] Natural Physics & Smart AI Started.');
      
      // মূল কাজের লুপ শুরু
      runTaskQueue();
      
    }, 10000); 
  });

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', handleDisconnect);
  
  bot.on('death', () => {
    console.log('[DEATH] Bot died. Respawning...');
    isExecutingTask = false;
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ================= AI TASK QUEUE =================

async function runTaskQueue() {
  while (isReady && !isReconnecting) {
    if (!isExecutingTask && bot && bot.entity) {
      isExecutingTask = true;
      try {
        await processNextBestAction();
      } catch (err) {
        console.log(`[TASK ERROR] ${err.message || err}`);
      }
      isExecutingTask = false;
    }
    await sleep(2000); // কাজের মাঝে ২ সেকেন্ড বিরতি
  }
}

async function processNextBestAction() {
  // ১. বিপদ এড়িয়ে চলা (বিপদ দেখলে পালাবে)
  const dangerMob = findNearestDanger();
  if (dangerMob) {
    await fleeFromDanger(dangerMob);
    return;
  }

  // ২. ইনভেন্টরিতে গাছ থাকলে কাঠ (Planks) বানাবে
  if (hasLogs()) {
    await craftPlanks();
    return;
  }

  // ৩. গাছের কাছে গিয়ে গাছ কাটা
  const treeLog = findNearbyTree();
  if (treeLog) {
    await chopTree(treeLog);
    return;
  }

  // ৪. স্বাভাবিক হাঁটাহাঁটি (Safe Wandering)
  await wanderAround();
}

// ================= 1. DANGER EVASION =================

function findNearestDanger() {
  return bot.nearestEntity(e => 
    e.type === 'mob' && 
    ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch'].includes(e.name) &&
    e.position.distanceTo(bot.entity.position) < 12
  );
}

async function fleeFromDanger(mob) {
  console.log(`[DANGER] ${mob.name} detected! Moving to safe distance...`);
  
  const dx = bot.entity.position.x - mob.position.x;
  const dz = bot.entity.position.z - mob.position.z;
  
  const targetX = bot.entity.position.x + (dx > 0 ? 12 : -12);
  const targetZ = bot.entity.position.z + (dz > 0 ? 12 : -12);
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2));
    await sleep(3000);
  } catch (e) {}
}

// ================= 2. TREE CHOPPING =================

function findNearbyTree() {
  return bot.findBlock({
    matching: logIds,
    maxDistance: 12,
    useExtraInfo: (block) => {
      // শুধু সমতলে থাকা গাছ নির্বাচন করবে (পাহাড় এড়াতে)
      return Math.abs(block.position.y - bot.entity.position.y) <= 2;
    }
  });
}

async function chopTree(block) {
  console.log(`[TREE] Found tree at ${block.position.floored()}. Walking to it...`);
  
  try {
    // গাছের ব্লকের কাছে হেঁটে যাবে
    bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
    await sleep(4000);

    // পৌঁছানোর পর ভাঙবে
    if (bot.entity.position.distanceTo(block.position) <= 4.5) {
      if (bot.canDigBlock(block)) {
        console.log('[TREE] Chopping wood block...');
        await bot.dig(block);
        console.log('[TREE] Wood chopped successfully!');
        await sleep(1000);
      }
    }
  } catch (err) {
    console.log('[TREE] Action interrupted.');
    bot.pathfinder.stop();
  }
}

// ================= 3. CRAFTING =================

function hasLogs() {
  return bot.inventory.items().some(item => item.name.endsWith('_log'));
}

async function craftPlanks() {
  console.log('[CRAFT] Processing inventory logs...');
  try {
    const logItem = bot.inventory.items().find(item => item.name.endsWith('_log'));
    if (!logItem) return;

    const plankName = logItem.name.replace('_log', '_planks');
    const plankItem = mcData.itemsByName[plankName];
    
    if (plankItem) {
      const recipe = bot.recipesFor(plankItem.id, null, 1, null)[0];
      if (recipe) {
        await bot.craft(recipe, 1, null);
        console.log(`[CRAFT] Crafted ${plankName}!`);
      }
    }
  } catch (e) {}
  await sleep(1000);
}

// ================= 4. WANDERING =================

async function wanderAround() {
  console.log('[WALK] Wandering to a safe area...');
  
  // ডানে বা বামে ৩-৪ ব্লক হেঁটে যাবে
  const rx = bot.entity.position.x + (Math.random() - 0.5) * 8;
  const rz = bot.entity.position.z + (Math.random() - 0.5) * 8;
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(rx, bot.entity.position.y, rz, 1));
    await sleep(3500);
  } catch (e) {}
}

// ================= RECONNECT =================

function handleDisconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;
  isReady = false;
  isExecutingTask = false;
  
  const cleanReason = typeof reason === 'object' ? util.inspect(reason) : reason;
  console.log(`[DISCONNECT] ${cleanReason}`);
  console.log('[RECONNECT] Reconnecting in 35 seconds...');
  
  setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, 35000);
}

createBot();
