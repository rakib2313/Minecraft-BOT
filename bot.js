const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');

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
let isBusy = false; // বট যখন একটি কাজ করবে তখন অন্য কাজ থেকে বিরত রাখার জন্য

let mcData;
let logIds = []; // গাছের ব্লকগুলোর আইডি

function createBot() {
  if (isReconnecting) return;
  bot = mineflayer.createBot(BOT_CONFIG);
  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[SPAWN] Bot spawned at: ${bot.entity.position.floored()}`);
    
    // Initial high-latency physics lock
    bot.entity.velocity.set(0, 0, 0);
    
    setTimeout(() => {
      mcData = mcDataLoader(bot.version);
      
      // বটের হাঁটা এবং ব্লক ভাঙার পারমিশন দেওয়া
      const defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = true; // এখন বট ব্লক ভাঙতে পারবে
      defaultMove.allow1by1towers = false;
      bot.pathfinder.setMovements(defaultMove);
      
      // গাছের গুঁড়ির (Log) আইডিগুলো চিনে রাখা
      logIds = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log']
        .map(name => mcData.blocksByName[name]?.id)
        .filter(id => id !== undefined);

      isReady = true;
      console.log('[SYSTEM] Bot is ready. Starting AI Loop...');
      
      // প্রতি ২ সেকেন্ড পরপর বট সিদ্ধান্ত নেবে সে কী করবে
      setInterval(aiLoop, 2000);
      
    }, 20000); 
  });

  bot.on('kicked', handleDisconnect);
  bot.on('end', handleDisconnect);
  bot.on('error', handleDisconnect);
  
  bot.on('death', () => {
    console.log('[DEATH] Bot died. Respawning...');
    isBusy = false;
  });
}

// ================= AI LOGIC =================

async function aiLoop() {
  if (!isReady || isBusy || !bot.entity) return;

  // ১. সবার আগে চেক করবে আশেপাশে কোনো বিপদ আছে কি না
  const danger = findDanger();
  if (danger) {
    await fleeFrom(danger);
    return;
  }

  // ২. যদি ব্যাগে গাছের গুঁড়ি থাকে, তবে কাঠ (Planks) বানাবে
  if (hasLogsInInventory()) {
    await craftPlanks();
    return;
  }

  // ৩. আশেপাশে গাছ থাকলে তা কাটতে যাবে
  const tree = findTree();
  if (tree) {
    await chopTree(tree);
    return;
  }

  // ৪. যদি কোনো কাজ না থাকে, তবে সেফ জায়গায় ঘুরে বেড়াবে
  await wanderAround();
}

// ================= ACTIONS =================

function findDanger() {
  // ১০ ব্লকের মধ্যে কোনো ক্ষতিকর মব (Zombie, Skeleton, Creeper ইত্যাদি) আছে কি না খুঁজবে
  const mob = bot.nearestEntity(e => 
    e.type === 'mob' && 
    ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch'].includes(e.name) &&
    e.position.distanceTo(bot.entity.position) < 15
  );
  return mob;
}

async function fleeFrom(mob) {
  isBusy = true;
  console.log(`[DANGER] ${mob.name} detected! Fleeing...`);
  
  // মব যেদিকে আছে, তার উল্টো দিকের পজিশন হিসাব করা
  const dx = bot.entity.position.x - mob.position.x;
  const dz = bot.entity.position.z - mob.position.z;
  
  // উল্টো দিকে ১৫ ব্লক দূরে যাওয়ার চেষ্টা করবে
  const targetX = bot.entity.position.x + (dx > 0 ? 15 : -15);
  const targetZ = bot.entity.position.z + (dz > 0 ? 15 : -15);
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2));
    // ৩ সেকেন্ড দৌড়ানোর পর ব্রেক নেবে
    await new Promise(resolve => setTimeout(resolve, 3000)); 
  } catch (err) {}
  
  isBusy = false;
}

function findTree() {
  // ২০ ব্লকের মধ্যে গাছের ব্লক খুঁজবে
  return bot.findBlock({
    matching: logIds,
    maxDistance: 20
  });
}

async function chopTree(block) {
  isBusy = true;
  console.log(`[ACTION] Found tree at ${block.position}. Going to chop it...`);
  
  try {
    // গাছের কাছে যাওয়া
    bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
    
    // পৌঁছানোর জন্য অপেক্ষা করা (সর্বোচ্চ ১০ সেকেন্ড)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 4000));
    
    // যদি কাছে পৌঁছায়, তবে ভাঙা শুরু করবে
    if (bot.entity.position.distanceTo(block.position) < 4) {
      bot.equip(bot.pathfinder.bestHarvestTool(block), 'hand');
      await bot.dig(block);
      console.log('[ACTION] Chopped block successfully.');
    }
  } catch (err) {
    console.log('[ACTION] Failed to chop tree (maybe lag or out of reach).');
  }
  
  isBusy = false;
}

function hasLogsInInventory() {
  // ইনভেন্টরিতে কোনো log আছে কি না চেক করা
  return bot.inventory.items().some(item => item.name.endsWith('_log'));
}

async function craftPlanks() {
  isBusy = true;
  console.log('[ACTION] Crafting planks from logs...');
  
  try {
    const logItem = bot.inventory.items().find(item => item.name.endsWith('_log'));
    if (!logItem) {
      isBusy = false;
      return;
    }

    // গাছের গুঁড়ি থেকে সংশ্লিষ্ট তক্তা (planks) এর রেসিপি খোঁজা
    const plankName = logItem.name.replace('_log', '_planks');
    const plankItem = mcData.itemsByName[plankName];
    
    if (plankItem) {
      const recipe = bot.recipesFor(plankItem.id, null, 1, null)[0]; // null মানে ক্রাফটিং টেবিল ছাড়াই
      if (recipe) {
        await bot.craft(recipe, 1, null);
        console.log(`[ACTION] Crafted ${plankName}!`);
      }
    }
  } catch (err) {
    console.log('[ACTION] Crafting failed due to lag or inventory issue.');
  }
  
  // ল্যাগ এড়াতে একটু অপেক্ষা
  await new Promise(resolve => setTimeout(resolve, 2000));
  isBusy = false;
}

async function wanderAround() {
  isBusy = true;
  
  // একটু মানুষের মতো মাথা ঘোরানো
  bot.look(bot.entity.yaw + (Math.random() - 0.5), 0, false);
  
  // ২০% সময় শুধু দাঁড়িয়ে থাকবে (AFK ভাব নেওয়ার জন্য)
  if (Math.random() < 0.2) {
    bot.swingArm('right');
    await new Promise(resolve => setTimeout(resolve, 2000));
    isBusy = false;
    return;
  }

  // কাছাকাছি ৫ ব্লকের মধ্যে র‍্যান্ডম হাঁটাহাঁটি
  const rx = bot.entity.position.x + (Math.random() - 0.5) * 10;
  const rz = bot.entity.position.z + (Math.random() - 0.5) * 10;
  
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(rx, bot.entity.position.y, rz, 1));
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (e) {}

  isBusy = false;
}

// ================= RECONNECT LOGIC =================

function handleDisconnect(reason) {
  if (isReconnecting) return;
  isReconnecting = true;
  isReady = false;
  isBusy = false;
  console.log(`[DISCONNECT] Reason: ${reason}. Waiting 40s to reconnect...`);
  setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, 40000);
}

createBot();
