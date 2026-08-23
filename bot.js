const mineflayer = require('mineflayer');

// বটের কনফিগারেশন
const botConfig = {
  host: 'india2.freegamehost.xyz', // আপনার সার্ভার আইপি
  port: 25987,                     // আপনার সার্ভার পোর্ট
  username: 'HelperBot',           // বটের নাম
  version: '1.20.4'                // ফিক্সড ভার্সন (যেন 26.2 এরর না আসে)
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  bot.on('spawn', () => {
    console.log('Bot has spawned and acting like a human!');
    
    // প্রতি ১৫ সেকেন্ড পর পর রেন্ডম মুভমেন্ট এবং অ্যাকশন
    setInterval(() => {
      const actions = ['forward', 'back', 'left', 'right', 'jump'];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      
      // লাফ দেওয়া বা হাঁটা
      if (randomAction === 'jump') {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      } else {
        bot.setControlState(randomAction, true);
        setTimeout(() => bot.setControlState(randomAction, false), 1000);
      }

      // মাথা ডানে-বায়ে ঘোরানো
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
      bot.look(yaw, pitch, true);
      
      // হাত নাড়ানো (Anti-AFK এর জন্য)
      if (Math.random() > 0.5) {
        bot.swingArm('right');
      }
      
    }, 15000);
  });

  bot.on('respawn', () => {
    console.log('Bot died, respawning...');
  });

  bot.on('error', (err) => {
    console.log('Error encountered: ', err);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot got kicked! Reason: ', reason);
  });

  // অটো-রিকানেক্ট (সার্ভার অফলাইন হলে বা কিক খেলে আবার চেষ্টা করবে)
  bot.on('end', () => {
    console.log('Bot disconnected. Trying to reconnect in 5 seconds...');
    setTimeout(createBot, 5000); 
  });
}

// বট চালু করা
createBot();
