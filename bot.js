const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const { Vec3 } = require('vec3');

const BOT_CONFIG = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: process.env.MC_USERNAME || 'AI_Bot_' + Math.floor(Math.random() * 999),
  version: '1.20.4',
  hideErrors: true,
  physicsEnabled: true, 
  viewDistance: 'tiny'
};

let bot = null;
let isReconnecting = false;
let isReady = false;
let isExecutingTask = false;

// Tower Defenses State
let isOnTower = false;
let towerBlocks = []; 

let mcData;
let logIds = [];
let buildBlockNames = ['dirt', 'cobblestone', 'oak_planks', 'spruce_planks', 'birch_planks']; // এই ব্লকগুলো দিয়ে সে টাওয়ার বানাবে

function createBot() {
  if (isReconnecting) return;
  bot = mineflayer.createBot(BOT_CONFIG);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[SPAWN] Bot spawned at: ${bot.entity.position.floored()}`);
    
    setTimeout(() => {
      mcData = mcDataLoader(bot.version);
      
      const movements = new Movements(bot, mcData);
      movements.canDig = true; 
      movements.allowParkour = true; // এখন সে পাহাড়ে লাফিয়ে উঠতে পারবে
      movements.allowSprinting = true; // বিপদে দৌড়াতে পারবে
      bot.pathfinder.setMovements(movements);
      
      logIds = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log']
        .map(name => mcData.blocksByName[name]?.id)
        .filter(id => id !== undefined);

      isReady = true;
      console.log('[SYSTEM] Advanced Survival & Defensive AI Started.');
      
      runTaskQueue();
    }, 8000); 
  });

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', handleDisconnect);
  bot.on('death', () => {
    console.log('[DEATH] Bot died.');
    isOnTower = false;
    towerBlocks = [];
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
    await sleep(2000); 
  }
}

async function processNextBestAction() {
  const dangerMob = findNearestDanger();

  // ১. টাওয়ারে থাকা অবস্থায় বিপদের চেক
  if (isOnTower) {
    if (!dangerMob || dangerMob.position.distanceTo(bot.entity.position) > 15) {
      await descendFromTower(); // বিপদ চলে গেলে নিচে নামবে
    } else {
      console.log('[DEFENSE] Danger is still near. Waiting on tower...');
      bot.lookAt(dangerMob.position);
      await sleep(3000);
    }
    return;
  }

  // ২. মাটিতে থাকা অবস্থায় বিপদের চেক
  if (dangerMob) {
    const dist = dangerMob.position.distanceTo(bot.entity.position);
    if (dist <= 5 && hasBuildingBlocks()) {
      await buildSafetyTower(); // খুব কাছে হলে ব্লক প্লেস করে উপরে উঠবে
    } else {
      await fleeFromDanger(dangerMob); // দূরে থাকলে উল্টোদিকে দৌড়াবে
    }
    return;
  }

  // ৩. ইনভেন্টরিতে লগ থাকলে তক্তা (Planks) বানাবে
  if (hasLogs()) {
    await craftPlanks();
    return;
  }

  // ৪. স্বাভাবিক গাছ কাটা
  const treeLog = findNearbyTree();
  if (treeLog) {
    await chopTree(treeLog);
    return;
  }

  // ৫. স্বাভাবিক ঘুরাঘুরি (পাহাড়-টিলা পার হয়ে)
  await wanderAround();
}

// ================= DANGER EVASION & TOWERING =================

function findNearestDanger() {
  return bot.nearestEntity(e => 
    e.type === 'mob' && 
    ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'vindicator'].includes(e.name) &&
    e.position.distanceTo(bot.entity.position) < 16
  );
}

function hasBuildingBlocks() {
  return bot.inventory.items().some(item => buildBlockNames.includes(item.name));
}

async function fleeFromDanger(mob) {
  console.log(`[DANGER] ${mob.name} approaching! Fleeing...`);
  const dx = bot.entity.position.x - mob.position.x;
  const dz = bot.entity.position.z - mob.position.z;
  const targetX = bot.entity.position.x + (dx > 0 ? 15 : -15);
  const targetZ = bot.entity.position.z + (dz > 0 ? 15 : -15);
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2));
    await sleep(4000);
  } catch (e) {}
}

async function buildSafetyTower() {
  console.log('[DEFENSE] DANGER TOO CLOSE! Building safety pillar...');
  
  const blockItem = bot.inventory.items().find(item => buildBlockNames.includes(item.name));
  if (!blockItem) return;

  bot.pathfinder.stop();
  bot.equip(blockItem, 'hand');
  towerBlocks = [];

  // ৩ ব্লক উপরে উঠবে (High ping safety delays added)
  for (let i = 0; i < 3; i++) {
    try {
      const refBlock = bot.blockAt(bot.entity.position.offset(0, -0.5, 0));
      bot.setControlState('jump', true);
      await sleep(400); // ল্যাগের জন্য জাম্প পিক টাইম
      await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
      bot.setControlState('jump', false);
      
      const placedPos = bot.entity.position.offset(0, -1, 0).floored();
      towerBlocks.push(placedPos);
      console.log(`[DEFENSE] Placed block at ${placedPos}`);
      await sleep(1000);
    } catch (e) {
      bot.setControlState('jump', false);
    }
  }
  
  if (towerBlocks.length > 0) {
    isOnTower = true;
    console.log('[DEFENSE] Successfully towered up. Safe now.');
  }
}

async function descendFromTower() {
  console.log('[DEFENSE] Coast is clear. Breaking pillar to descend...');
  bot.equip(bot.pathfinder.bestHarvestTool(bot.blockAt(towerBlocks[0])), 'hand');

  // নিজের পায়ের নিচের ব্লকগুলো ভেঙে নিচে নামবে
  for (let i = towerBlocks.length - 1; i >= 0; i--) {
    try {
      const blockToBreak = bot.blockAt(towerBlocks[i]);
      if (blockToBreak && blockToBreak.name !== 'air') {
        bot.lookAt(blockToBreak.position);
        await sleep(500);
        await bot.dig(blockToBreak);
        console.log(`[DEFENSE] Broke tower block at ${blockToBreak.position}`);
        await sleep(800);
      }
    } catch (e) {}
  }
  
  isOnTower = false;
  towerBlocks = [];
  console.log('[DEFENSE] Back on the ground. Resuming normal tasks.');
}

// ================= TREE CHOPPING & CRAFTING =================

function findNearbyTree() {
  return bot.findBlock({ matching: logIds, maxDistance: 15 });
}

async function chopTree(block) {
  console.log(`[ACTION] Found tree at ${block.position.floored()}. Chopping...`);
  try {
    bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
    await sleep(4000);

    if (bot.entity.position.distanceTo(block.position) <= 4.5) {
      if (bot.canDigBlock(block)) {
        await bot.dig(block);
        await sleep(1000);
      }
    }
  } catch (err) { bot.pathfinder.stop(); }
}

function hasLogs() {
  return bot.inventory.items().some(item => item.name.endsWith('_log'));
}

async function craftPlanks() {
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
}

// ================= WANDERING =================

async function wanderAround() {
  console.log('[WALK] Exploring area...');
  const rx = bot.entity.position.x + (Math.random() - 0.5) * 12;
  const rz = bot.entity.position.z + (Math.random() - 0.5) * 12;
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(rx, bot.entity.position.y, rz, 1));
    await sleep(4000);
  } catch (e) {}
}

// ================= RECONNECT =================

function handleDisconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;
  isReady = false;
  isExecutingTask = false;
  isOnTower = false;
  
  console.log(`[DISCONNECT] ${typeof reason === 'object' ? 'Kicked from server' : reason}`);
  console.log('[RECONNECT] Retrying in 35 seconds...');
  setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, 35000);
}

createBot();
