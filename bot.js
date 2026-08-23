const mineflayer = require('mineflayer');

const botConfig = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: 'HelperBot',
  version: '1.20.4',
  checkTimeoutInterval: 60000
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  // সার্ভার বটকে স্পন/টেলিপোর্ট করা মাত্র পজিশন লক করা
  bot.on('forcedMove', () => {
    if (bot.entity) {
      bot.entity.velocity.set(0, 0, 0);
      bot.entity.onGround = true;
    }
  });

  // চ্যাঙ্ক লোড হওয়ার আগে গ্র্যাভিটির কারণে মাটির নিচে পড়ে যাওয়া আটকানো
  bot.on('physicsTick', () => {
    if (bot.entity && bot.entity.velocity) {
      if (bot.entity.velocity.y < 0) {
        bot.entity.velocity.y = 0;
        bot.entity.onGround = true;
      }
    }
  });

  bot.on('spawn', () => {
    console.log('Bot successfully spawned and position locked on ground!');
    bot.clearControlStates();

    // Anti-AFK: ১ মিনিট পর পর হাত নাড়াবে
    setInterval(() => {
      if (bot && bot.swingArm) {
        bot.swingArm('right');
      }
    }, 60000);
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err.message || err);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot got kicked! Reason: ', JSON.stringify(reason));
  });

  bot.on('end', () => {
    console.log('Bot disconnected. Reconnecting in 15 seconds...');
    setTimeout(createBot, 15000);
  });
}

createBot();
