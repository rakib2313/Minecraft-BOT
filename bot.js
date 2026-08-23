const mineflayer = require('mineflayer');

const botConfig = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: 'HelperBot',
  version: '1.20.4',
  // গিটহাবের হাই পিং ও ডিসকানেক্ট সমস্যা এড়ানোর জন্য টাইমআউট বাড়ানো হলো
  checkTimeoutInterval: 60000 
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  bot.on('spawn', () => {
    console.log('Bot successfully connected to server via GitHub Actions!');
    console.log('Staying still to prevent any anti-cheat movement kicks.');
  });

  bot.on('error', (err) => {
    console.log('Bot error encountered: ', err);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot kicked by server: ', JSON.stringify(reason));
  });

  // ডিসকানেক্ট হলে ১৫ সেকেন্ড পর আবার রি-কানেক্ট করার চেষ্টা করবে
  bot.on('end', () => {
    console.log('Bot disconnected. Reconnecting in 15 seconds...');
    setTimeout(createBot, 15000); 
  });
}

createBot();
