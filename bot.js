const mineflayer = require('mineflayer');

const botConfig = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: '24/7 bot',
  version: '1.20.4',
  checkTimeoutInterval: 60000
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  // ব্যাকগ্রাউন্ড ফিজিক্স বন্ধ রাখা
  bot.on('inject_allowed', () => {
    bot.physicsEnabled = false;
  });

  bot.on('spawn', () => {
    console.log('Bot successfully joined and active!');
    bot.physicsEnabled = false;

    // ১ মিনিট পর পর হাত নাড়া
    setInterval(() => {
      bot.swingArm('right');
    }, 60000);
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot got kicked! Reason: ', JSON.stringify(reason));
  });

  // ডুপ্লিকেট লগইন সমস্যা এড়াতে ৩০ সেকেন্ড পর রিকানেক্ট করার চেষ্টা করবে
  bot.on('end', () => {
    console.log('Bot disconnected. Waiting 30 seconds before reconnecting...');
    setTimeout(createBot, 30000);
  });
}

createBot();
