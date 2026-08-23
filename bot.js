const mineflayer = require('mineflayer');

// বটের কনফিগারেশন
const botConfig = {
  host: 'india2.freegamehost.xyz', // আপনার সার্ভার আইপি
  port: 25987,                     // আপনার সার্ভার পোর্ট
  username: 'HelperBot',           // বটের নাম
  version: '1.20.4'                // আপনার সার্ভারের সঠিক ভার্সন
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  bot.on('spawn', () => {
    console.log('Bot has spawned safely!');
    
    // সেফ অ্যান্টি-এএফকে (Anti-AFK) সিস্টেম
    // হাঁটাচলা বাদ দেওয়া হয়েছে, যেন সার্ভার 'invalid_player_movement' এরর না দেয়
    setInterval(() => {
      // মাথা ডানে-বায়ে বা ওপরে-নিচে রেন্ডম ঘোরানো
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
      bot.look(yaw, pitch, true);
      
      // হাত নাড়ানো
      bot.swingArm('right');
      
    }, 20000); // প্রতি ২০ সেকেন্ড পর পর এটি করবে
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot got kicked! Reason: ', JSON.stringify(reason));
  });

  // অটো-রিকানেক্ট (১০ সেকেন্ড পর পর চেষ্টা করবে)
  bot.on('end', () => {
    console.log('Bot disconnected. Trying to reconnect in 10 seconds...');
    setTimeout(createBot, 10000); 
  });
}

// বট চালু করা
createBot();
