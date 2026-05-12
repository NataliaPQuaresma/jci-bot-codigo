const path = require('path');
const fs = require('fs');
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
});

const axios = require('axios');

axios.get(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
).then(r => {
    r.data.models.forEach(m => console.log(m.name));
}).catch(e => console.log('ERRO:', e.response?.data));