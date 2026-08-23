const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const mcDataLoader = require('minecraft-data')
const { Vec3 } = require('vec3')

// ===== FIXED USERNAME (একই বট সবসময়) =====
// GitHub Secret: MC_USERNAME = AFK_Host_Bot (বা আপনার পছন্দের নাম)
const BOT_NAME = process.env.MC_USERNAME || 'AFK_Host_Bot'

const CONFIG = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: BOT_NAME,
  version: '1.20.4',
  hideErrors: true,
  checkTimeoutInterval: 120000,
  physicsEnabled: true,
  viewDistance: 'tiny'
}

let bot = null
let mcData = null
let moving = null
let ready = false
let busy = false
let reconnecting = false
let onTower = false
let baseY = 0

const LOGS = [
  'oak_log', 'birch_log', 'spruce_log', 'jungle_log',
  'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log'
]
const BUILD = ['dirt', 'cobblestone', 'oak_planks', 'birch_planks', 'spruce_planks', 'cobbled_deepslate']
const HOSTILE = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'drowned', 'husk']

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function createBot () {
  if (reconnecting) return

  console.log(`[INIT] Starting single bot as "${CONFIG.username}"`)
  bot = mineflayer.createBot(CONFIG)
  bot.loadPlugin(pathfinder)

  bot.once('login', () => console.log('[LOGIN] Logged in'))

  bot.once('spawn', async () => {
    console.log(`[SPAWN] ${bot.entity.position.floored()}`)
    ready = false
    busy = false
    onTower = false

    // হাই-পিং: chunk load এর জন্য অপেক্ষা
    await sleep(12000)

    mcData = mcDataLoader(bot.version)
    moving = new Movements(bot, mcData)

    // বাধা পার হওয়ার জন্য গুরুত্বপূর্ণ সেটিংস
    moving.allowSprinting = true
    moving.allowParkour = true
    moving.canDig = true              // সামনের ব্লক খুঁড়ে পথ করবে
    moving.allow1by1towers = true     // দরকার হলে উপরে উঠবে
    moving.maxDropDown = 4
    moving.scafoldingBlocks = BUILD.map(n => mcData.blocksByName[n]?.id).filter(Boolean)

    bot.pathfinder.setMovements(moving)

    ready = true
    console.log('[SYSTEM] Ready — single bot AI running')
    loop()
  })

  bot.on('death', () => {
    console.log('[DEATH] Respawning...')
    onTower = false
    busy = false
  })

  bot.on('kicked', (r) => handleDisconnect(r))
  bot.on('end', (r) => handleDisconnect(r))
  bot.on('error', (e) => {
    console.log(`[ERROR] ${e.message || e}`)
    handleDisconnect(e)
  })
}

// ================= MAIN LOOP =================
async function loop () {
  while (ready && !reconnecting) {
    if (!busy && bot?.entity) {
      busy = true
      try {
        await think()
      } catch (e) {
        console.log(`[AI] ${e.message || e}`)
        try { bot.pathfinder.setGoal(null) } catch (_) {}
      } finally {
        busy = false
      }
    }
    await sleep(2500)
  }
}

async function think () {
  // আটকে গেলে নিজেকে মুক্ত করো
  await unstuckIfNeeded()

  const mob = nearestMob(14)

  // টাওয়ারে থাকলে
  if (onTower) {
    if (!mob || mob.position.distanceTo(bot.entity.position) > 14) {
      await climbDown()
    } else {
      bot.lookAt(mob.position.offset(0, 1.6, 0))
      await sleep(2000)
    }
    return
  }

  // বিপদ
  if (mob) {
    const d = mob.position.distanceTo(bot.entity.position)
    if (d < 4 && hasItems(BUILD)) await pillarUp()
    else await flee(mob)
    return
  }

  // ক্রাফট
  if (hasLogs()) {
    await craftPlanks()
    return
  }

  // গাছ
  const tree = findTree()
  if (tree) {
    await chop(tree)
    return
  }

  // ঘোরা
  await wander()
}

// ================= UNSTUCK / DIG PATH =================
async function unstuckIfNeeded () {
  if (!bot.entity) return

  // সামনে ব্লক আটকে রাখলে খুঁড়ে দাও বা লাফাও
  const yaw = bot.entity.yaw
  const dx = -Math.sin(yaw)
  const dz = -Math.cos(yaw)
  const front = bot.blockAt(bot.entity.position.offset(dx, 0, dz))
  const frontUp = bot.blockAt(bot.entity.position.offset(dx, 1, dz))
  const head = bot.blockAt(bot.entity.position.offset(0, 1, 0))

  // মাথায় ব্লক
  if (head && head.boundingBox === 'block' && bot.canDigBlock(head)) {
    console.log('[UNSTUCK] Digging block above head')
    await safeDig(head)
    return
  }

  // সামনে দেয়াল — খুঁড়ে পথ
  if (front && front.boundingBox === 'block' && frontUp && frontUp.boundingBox === 'block') {
    if (bot.canDigBlock(front)) {
      console.log('[UNSTUCK] Digging wall ahead')
      await safeDig(front)
      if (frontUp && bot.canDigBlock(frontUp)) await safeDig(frontUp)
    }
  } else if (front && front.boundingBox === 'block') {
    // ১ ব্লক উঁচু — লাফ
    bot.setControlState('jump', true)
    bot.setControlState('forward', true)
    await sleep(400)
    bot.clearControlStates()
  }
}

async function safeDig (block) {
  try {
    if (!block || !bot.canDigBlock(block)) return
    const tool = bot.pathfinder.bestHarvestTool(block)
    if (tool) await bot.equip(tool, 'hand')
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true)
    await bot.dig(block)
    await sleep(300)
  } catch (_) {}
}

// ================= COMBAT AVOID =================
function nearestMob (range) {
  return bot.nearestEntity(e =>
    e.type === 'mob' &&
    HOSTILE.includes(e.name) &&
    e.position.distanceTo(bot.entity.position) < range
  )
}

async function flee (mob) {
  console.log(`[FLEE] ${mob.name}`)
  const dx = bot.entity.position.x - mob.position.x
  const dz = bot.entity.position.z - mob.position.z
  const tx = bot.entity.position.x + (dx >= 0 ? 12 : -12)
  const tz = bot.entity.position.z + (dz >= 0 ? 12 : -12)
  try {
    bot.pathfinder.setGoal(new goals.GoalNear(tx, bot.entity.position.y, tz, 2))
    await sleep(4000)
  } catch (_) {}
  bot.pathfinder.setGoal(null)
}

async function pillarUp () {
  console.log('[DEFENSE] Pillaring up')
  const item = bot.inventory.items().find(i => BUILD.includes(i.name))
  if (!item) return

  bot.pathfinder.setGoal(null)
  baseY = Math.floor(bot.entity.position.y)
  await bot.equip(item, 'hand')

  for (let i = 0; i < 3; i++) {
    try {
      await bot.look(bot.entity.yaw, -Math.PI / 2, true)
      bot.setControlState('jump', true)
      await sleep(350)
      const ref = bot.blockAt(bot.entity.position.offset(0, -1, 0))
      if (ref) await bot.placeBlock(ref, new Vec3(0, 1, 0))
      bot.setControlState('jump', false)
      await sleep(700)
    } catch (_) {
      bot.setControlState('jump', false)
    }
  }
  onTower = true
}

async function climbDown () {
  console.log('[DEFENSE] Climbing down')
  while (Math.floor(bot.entity.position.y) > baseY) {
    const below = bot.blockAt(bot.entity.position.offset(0, -0.5, 0))
    if (!below || below.name === 'air') break
    await safeDig(below)
    await sleep(500)
  }
  onTower = false
}

// ================= TREE / CRAFT =================
function hasItems (names) {
  return bot.inventory.items().some(i => names.includes(i.name))
}
function hasLogs () {
  return bot.inventory.items().some(i => i.name.endsWith('_log'))
}

function findTree () {
  const ids = LOGS.map(n => mcData.blocksByName[n]?.id).filter(Boolean)
  return bot.findBlock({
    matching: ids,
    maxDistance: 16,
    useExtraInfo: (b) => Math.abs(b.position.y - bot.entity.position.y) <= 4
  })
}

async function goTo (x, y, z, range = 2, timeoutMs = 12000) {
  return new Promise(async (resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      bot.removeListener('goal_reached', onReach)
      bot.pathfinder.setGoal(null)
      resolve()
    }
    const onReach = () => finish()
    bot.once('goal_reached', onReach)
    try {
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, range))
    } catch (_) {
      finish()
      return
    }
    await sleep(timeoutMs)
    finish()
  })
}

async function chop (block) {
  console.log(`[TREE] Target ${block.position.floored()}`)
  await goTo(block.position.x, block.position.y, block.position.z, 2, 15000)

  // কাছে না এলে আর একবার চেষ্টা
  if (bot.entity.position.distanceTo(block.position) > 5) {
    console.log('[TREE] Too far / blocked, digging path...')
    await unstuckIfNeeded()
    await goTo(block.position.x, block.position.y, block.position.z, 2, 10000)
  }

  const fresh = bot.blockAt(block.position)
  if (!fresh || !LOGS.includes(fresh.name)) return

  if (bot.entity.position.distanceTo(fresh.position) <= 4.5 && bot.canDigBlock(fresh)) {
    console.log('[TREE] Chopping...')
    await safeDig(fresh)
    // উপরের লগও কাটো
    const up = bot.blockAt(fresh.position.offset(0, 1, 0))
    if (up && LOGS.includes(up.name)) await safeDig(up)
  }
}

async function craftPlanks () {
  try {
    const log = bot.inventory.items().find(i => i.name.endsWith('_log'))
    if (!log) return
    const plankName = log.name.replace('_log', '_planks')
    const plank = mcData.itemsByName[plankName]
    if (!plank) return
    const recipe = bot.recipesFor(plank.id, null, 1, null)[0]
    if (!recipe) return
    console.log(`[CRAFT] ${plankName}`)
    await bot.craft(recipe, 1, null)
    await sleep(800)
  } catch (e) {
    console.log(`[CRAFT] fail: ${e.message || e}`)
  }
}

// ================= WANDER =================
async function wander () {
  console.log('[WALK] Exploring')
  // ছোট পদক্ষেপ — হাই-পিং এ বেশি স্থিতিশীল
  const x = bot.entity.position.x + (Math.random() - 0.5) * 8
  const z = bot.entity.position.z + (Math.random() - 0.5) * 8
  await goTo(x, bot.entity.position.y, z, 1, 8000)
  if (Math.random() < 0.3) bot.swingArm('right')
}

// ================= RECONNECT (একই ইউজারনেম) =================
function handleDisconnect (reason) {
  if (reconnecting) return
  reconnecting = true
  ready = false
  busy = false
  onTower = false

  let msg = reason
  try {
    if (reason && typeof reason === 'object') msg = JSON.stringify(reason)
  } catch (_) {}
  console.log(`[DISCONNECT] ${msg}`)
  console.log('[RECONNECT] Same bot in 40s...')

  try { if (bot) bot.removeAllListeners() } catch (_) {}

  setTimeout(() => {
    reconnecting = false
    createBot() // একই CONFIG.username
  }, 40000)
}

process.on('uncaughtException', (e) => {
  console.log(`[FATAL] ${e.message}`)
  handleDisconnect(e)
})
process.on('unhandledRejection', (e) => {
  console.log(`[FATAL] ${e}`)
})

createBot()
