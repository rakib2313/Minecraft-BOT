const mineflayer = require('mineflayer');

const botConfig = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: 'HelperBot',
  version: '1.20.4' // আপনার সার্ভারের আসল ভার্সন
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  bot.on('spawn', () => {
    console.log('Bot has spawned safely! No movement, perfectly still.');
    
    // সব নড়াচড়া বাদ! অ্যান্টি-এএফকে (Anti-AFK) এর জন্য শুধু হাত নাড়বে
    setInterval(() => {
      bot.swingArm('right');
    }, 60000); // প্রতি ৬০ সেকেন্ড (১ মিনিট) পর পর 
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot got kicked! Reason: ', JSON.stringify(reason));
  });

  bot.on('end', () => {
    console.log('Bot disconnected. Trying to reconnect in 10 seconds...');
    setTimeout(createBot, 10000); 
  });
}

createBot();
