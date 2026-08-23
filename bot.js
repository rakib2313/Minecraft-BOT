const mineflayer = require('mineflayer');

const botConfig = {
  host: 'india2.freegamehost.xyz',
  port: 25987,
  username: 'AL HELAL BOT',
  version: '1.20.4',
  checkTimeoutInterval: 60000
};

function createBot() {
  const bot = mineflayer.createBot(botConfig);

  // মাইনফ্লেয়ারের ভেতরের ব্যাকগ্রাউন্ড ফিজিক্স ও গ্র্যাভিটি প্যাকেট পাঠানো বন্ধ করা
  bot.on('inject_allowed', () => {
    bot.physicsEnabled = false;
  });

  bot.on('spawn', () => {
    console.log('Bot spawned successfully! Internal physics completely disabled.');
    bot.physicsEnabled = false; // কনফার্মেশনের জন্য নিশ্চিত করা হলো

    // ১ মিনিট পর পর হাত নাড়াবে যেন AFK প্লাগিন কিক না দেয়
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

  // কিক খেলে বা ডিসকানেক্ট হলে ১৫ সেকেন্ড পর অটো রিকানেক্ট করবে
  bot.on('end', () => {
    console.log('Bot disconnected. Reconnecting in 15 seconds...');
    setTimeout(createBot, 15000);
  });
}

createBot();
