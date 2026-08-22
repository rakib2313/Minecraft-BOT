const express = require('express');
const mineflayer = require('mineflayer');

// রেন্ডারকে জাগিয়ে রাখার জন্য ছোট ওয়েব সার্ভার
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Minecraft AFK Bot is running 24/7!');
});

app.listen(PORT, () => {
  console.log(`Web server is running on port ${PORT}`);
});

// মাইনক্রাফট বট লজিক (হিউম্যান-লাইক মুভমেন্ট)
function createBot() {
  const bot = mineflayer.createBot({
    host: 'india2.freegamehost.xyz', // আপনার সার্ভার আইপি
    port: 25987,                  // আপনার সার্ভার পোর্ট
    username: 'HelperBot',          // বটের নাম
    version: false                // অটো ভার্সন ডিটেক্ট করবে
  });

  bot.on('spawn', () => {
    console.log('Bot has spawned and acting like a human!');
    
    // প্রতি ১৫ সেকেন্ড পর পর রেন্ডম মুভমেন্ট
    setInterval(() => {
      const actions = ['forward', 'back', 'left', 'right'];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      bot.setControlState(randomAction, true);
      setTimeout(() => {
        bot.setControlState(randomAction, false);
      }, 1000);

      // মাথা ডানে-বায়ে ঘোরানো
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
      bot.look(yaw, pitch, true);
      
    }, 15000);
  });

  bot.on('respawn', () => {
    console.log('Bot died, respawning...');
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err);
  });

  bot.on('end', () => {
    console.log('Bot disconnected. Reconnecting in 5 seconds...');
    setTimeout(createBot, 5000);
  });
}

createBot();
