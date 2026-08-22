const mineflayer = require('mineflayer');

const bot = mineflayer.createBot({
  host: 'india2.freegamehost.xyz', // আপনার সার্ভার আইপি
  port: 25987,                  // আপনার সার্ভার পোর্ট
  username: 'HelperBot',          // বটের নাম (স্বাভাবিক কোনো নাম দিতে পারেন)
  version: false                // অটো ভার্সন ডিটেক্ট করবে
});

bot.on('spawn', () => {
  console.log('Bot has spawned and acting like a human!');
  
  // প্রতি ১০ সেকেন্ড পর পর রেন্ডম মুভমেন্ট ও চ্যাট এড়ানোর লজিক
  setInterval(() => {
    const actions = ['forward', 'back', 'left', 'right'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    
    // একটু হাঁটাচলা করা
    bot.setControlState(randomAction, true);
    setTimeout(() => {
      bot.setControlState(randomAction, false);
    }, 1000);

    // মাথা ডানে-বায়ে ঘোরানো (লুক লাইক রিয়েল প্লেয়ার)
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
    bot.look(yaw, pitch, true);
    
  }, 15000); // ১৫ সেকেন্ড পরপর মুভ করবে
});

// মারা গেলে অটো রেসপন
bot.on('respawn', () => {
  console.log('Bot died, respawning...');
});

bot.on('error', (err) => {
  console.log('Error encountered: ', err);
});

bot.on('end', () => {
  console.log('Bot disconnected. Reconnecting in 5 seconds...');
  setTimeout(() => {
    // রিকানেক্ট লজিক
  }, 5000);
});
