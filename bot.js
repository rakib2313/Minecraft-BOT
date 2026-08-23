const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const { Vec3 } = require('vec3');

const BOT_CONFIG = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: process.env.MC_USERNAME || 'AI_Player_' + Math.floor(Math.random() * 999),
  version: '1.20.4',
  hideErrors: true,
  physicsEnabled: true, // 100% Real Physics
  viewDistance: 'tiny'
};

let bot = null;
let isReconnecting = false;
let isReady = false;
let isBusy = false; // Task Lock
let mcData;

// States
let isOnSafetyTower = false;
let originalYLevel = 0; 
const buildBlocks = ['dirt', 'cobblestone', 'oak_planks', 'spruce_planks', 'birch_planks'];

function createBot() {
  if (isReconnecting) return;
  bot = mineflayer.createBot(BOT_CONFIG);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[SPAWN] Player spawned at: ${bot.entity.position.floored()}`);
    
    // Chunk Loading & Server Sync Delay (High Ping Protection)
    setTimeout(() => {
      mcData = mcDataLoader(bot.version);
      
      const movements = new Movements(bot, mcData);
      movements.canDig = true; 
      movements.allowParkour = true; // পাহাড় বা বাধা লাফিয়ে পার হবে
      movements.allowSprinting = true; // বিপদে দৌড়াবে
      movements.allow1by1towers = false; // নিজে থেকে যেন হাবিজাবি টাওয়ার না বানায়
      bot.pathfinder.setMovements(movements);

      isReady = true;
      console.log('[SYSTEM] Perfect Human AI Engine Started.');
      
      aiLoop(); // Start Main Brain
    }, 10000); 
  });

  bot.on('death', () => {
    console.log('[DEATH] Player died. Respawning...');
    isOnSafetyTower = false;
    isBusy = false;
  });

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', handleDisconnect);
}

// Server-tick based sleep (More accurate than setTimeout for high ping)
const waitTicks = async (ticks) => {
  return new Promise(resolve => {
    let count = 0;
    const listener = () => {
      count++;
      if (count >= ticks) {
        bot.removeListener('physicsTick', listener);
        resolve();
      }
    };
    bot.on('physicsTick', listener);
  });
};

// ================= THE PERFECT AI LOOP =================

async function aiLoop() {
  while (isReady && !isReconnecting) {
    if (!isBusy && bot.entity) {
      isBusy = true; // Lock
      try {
        await decideNextAction();
      } catch (error) {
        console.log(`[AI RESET] Recovering from error: ${error.message}`);
        try { bot.pathfinder.stop(); } catch(e){}
      } finally {
        isBusy = false; // Unlock always, prevents freezing
      }
    }
    await waitTicks(20); // 1-second delay between brain ticks
  }
}

async function decideNextAction() {
  const danger = getNearestDanger();

  // ১. টাওয়ারে বসে থাকা অবস্থা (Defense State)
  if (isOnSafetyTower) {
    if (!danger || danger.position.distanceTo(bot.entity.position) > 15) {
      await getDownFromTower(); // নিরাপদ হলে নিচে নামবে
    } else {
      console.log('[DEFENSE] Watching danger from tower...');
      bot.lookAt(danger.position.offset(0, 1.5, 0));
      await waitTicks(60); // 3 seconds
    }
    return;
  }

  // ২. মাটিতে থাকা অবস্থায় বিপদ দেখা (Flee or Pillar)
  if (danger) {
    const dist = danger.position.distanceTo(bot.entity.position);
    if (dist < 4 && hasBuildingBlocks()) {
      await buildSafetyTower(); // খুব কাছে এলে টাওয়ার বানাবে
    } else {
      await flee(danger); // দূরে থাকলে লাফিয়ে পালাবে
    }
    return;
  }

  // ৩. ক্রাফটিং করা (Crafting)
  if (hasLogs()) {
    await craftPlanks();
    return;
  }

  // ৪. গাছ কাটা (Lumberjack)
  const tree = findReachableTree();
  if (tree) {
    await chopWood(tree);
    return;
  }

  // ৫. স্বাভাবিক ঘুরাঘুরি (Wandering)
  await naturalWander();
}

// ================= ACTIONS LOGIC =================

function getNearestDanger() {
  return bot.nearestEntity(e => 
    e.type === 'mob' && 
    ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'].includes(e.name) &&
    e.position.distanceTo(bot.entity.position) < 15
  );
}

function hasBuildingBlocks() {
  return bot.inventory.items().some(item => buildBlocks.includes(item.name));
}

// লাফিয়ে লাফিয়ে পালানো
async function flee(mob) {
  console.log(`[EVASION] Running away from ${mob.name}!`);
  const dx = bot.entity.position.x - mob.position.x;
  const dz = bot.entity.position.z - mob.position.z;
  
  // উল্টো দিকে ১৫ ব্লক
  const targetX = bot.entity.position.x + (dx > 0 ? 15 : -15);
  const targetZ = bot.entity.position.z + (dz > 0 ? 15 : -15);
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2));
    await waitTicks(80); // 4 seconds run
  } catch (e) {}
}

// মানুষের মতো লাফ দিয়ে নিচে ব্লক বসানো (Pillaring)
async function buildSafetyTower() {
  console.log('[DEFENSE] Danger close! Pillaring up...');
  const blockItem = bot.inventory.items().find(item => buildBlocks.includes(item.name));
  if (!blockItem) return;

  bot.pathfinder.stop();
  originalYLevel = bot.entity.position.y;
  await bot.equip(blockItem, 'hand');

  // ৩টি ব্লক প্লেস করে উপরে উঠবে
  for (let i = 0; i < 3; i++) {
    bot.look(0, -Math.PI / 2, true); // একদম নিচে তাকানো
    await waitTicks(5);
    
    bot.setControlState('jump', true);
    await waitTicks(6); // সার্ভারে জাম্প রেজিস্টার হওয়ার সময়
    
    const refBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
    try {
      await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
    } catch (e) {}
    
    bot.setControlState('jump', false);
    await waitTicks(10); // ফিজিক্স সেটেল হওয়ার সময়
  }
  
  isOnSafetyTower = true;
  console.log('[DEFENSE] Tower built successfully.');
}

// টাওয়ার থেকে নিচে নামা
async function getDownFromTower() {
  console.log('[DEFENSE] Coast is clear. Digging down...');
  
  while (bot.entity.position.y > originalYLevel) {
    const blockBelow = bot.blockAt(bot.entity.position.offset(0, -0.5, 0));
    if (!blockBelow || blockBelow.name === 'air' || blockBelow.name === 'bedrock') break;

    try {
      bot.lookAt(blockBelow.position);
      await bot.equip(bot.pathfinder.bestHarvestTool(blockBelow), 'hand');
      await waitTicks(10);
      await bot.dig(blockBelow);
      await waitTicks(10);
    } catch (e) { break; }
  }
  
  isOnSafetyTower = false;
  console.log('[DEFENSE] Safely back on ground.');
}

// নাগালের ভেতরের গাছ খোঁজা
function findReachableTree() {
  const logIds = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log']
        .map(name => mcData.blocksByName[name]?.id).filter(id => id);
        
  return bot.findBlock({
    matching: logIds,
    maxDistance: 15,
    useExtraInfo: (block) => {
      // শুধু সেই গাছ ধরবে যেটা পাহাড়ে অনেক উঁচুতে বা খাদের নিচে নেই
      return Math.abs(block.position.y - bot.entity.position.y) <= 3;
    }
  });
}

async function chopWood(block) {
  console.log(`[GATHER] Going to chop tree at ${block.position.floored()}`);
  try {
    bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
    
    // যাওয়ার জন্য সর্বোচ্চ ৫ সেকেন্ড অপেক্ষা করবে
    await Promise.race([
      waitTicks(100), 
      new Promise(resolve => bot.once('goal_reached', resolve))
    ]);

    if (bot.entity.position.distanceTo(block.position) <= 4.5) {
      if (bot.canDigBlock(block)) {
        bot.lookAt(block.position);
        await bot.equip(bot.pathfinder.bestHarvestTool(block), 'hand');
        await waitTicks(10);
        await bot.dig(block);
        console.log('[GATHER] Chopped wood!');
      }
    }
  } catch (e) {
    bot.pathfinder.stop();
  }
}

function hasLogs() {
  return bot.inventory.items().some(item => item.name.endsWith('_log'));
}

async function craftPlanks() {
  console.log('[CRAFTING] Making planks...');
  try {
    const logItem = bot.inventory.items().find(item => item.name.endsWith('_log'));
    if (!logItem) return;

    const plankName = logItem.name.replace('_log', '_planks');
    const plankItem = mcData.itemsByName[plankName];
    
    if (plankItem) {
      const recipe = bot.recipesFor(plankItem.id, null, 1, null)[0];
      if (recipe) {
        await bot.craft(recipe, 1, null);
      }
    }
  } catch (e) {}
  await waitTicks(20);
}

async function naturalWander() {
  console.log('[WANDER] Exploring area naturally...');
  
  if (Math.random() < 0.2) {
    bot.look(bot.entity.yaw + (Math.random() - 0.5), 0, true);
    bot.swingArm('right');
    await waitTicks(20);
    return;
  }

  const rx = bot.entity.position.x + (Math.random() - 0.5) * 10;
  const rz = bot.entity.position.z + (Math.random() - 0.5) * 10;
  
  try {
    // GoalNear 1 means it allows being 1 block away, highly stable
    bot.pathfinder.setGoal(new goals.GoalNear(rx, bot.entity.position.y, rz, 1));
    await waitTicks(60); // 3 seconds walk
  } catch (e) {
    bot.pathfinder.stop();
  }
}

// ================= RECONNECT =================

function handleDisconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;
  isReady = false;
  isBusy = false;
  isOnSafetyTower = false;
  
  console.log(`[DISCONNECT] Reason: ${typeof reason === 'object' ? JSON.stringify(reason) : reason}`);
  console.log('[RECONNECT] Retrying in 40 seconds...');
  setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, 40000);
}

createBot();
