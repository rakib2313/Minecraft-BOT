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

  bot.on('spawn', () => {
    console.log('Bot successfully joined and active in server!');

    // Anti-AFK: ২ মিনিট পর পর শুধু হাত নাড়াবে (কোনো মুভমেন্ট বা লুক প্যাকেট পাঠাবে না)
    setInterval(() => {
      bot.swingArm('right');
    }, 120000);
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err.message);
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
