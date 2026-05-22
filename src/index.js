// arquivo principal q inicia tudo
require('dotenv').config({ path: '../.env' });
const { iniciarBot } = require('./bot.js');

//inicia o bot
iniciarBot();