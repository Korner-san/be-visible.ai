// Quick connection test — run with: node test-db.js
require('dotenv').config({ path: '.env.local' });

const https = require('https');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.log('KEY NOT FOUND in .env.local');
  process.exit(1);
}

console.log('Key loaded, length:', key.length);
console.log('Making raw HTTP request to Supabase...\n');

const options = {
  hostname: 'tzfvtofjcvpddqfgxdtn.supabase.co',
  path: '/rest/v1/chatgpt_accounts?select=email&limit=1',
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Response:', data.substring(0, 500));
  });
});

req.on('error', (e) => {
  console.log('Network error:', e.message);
  console.log('This means the PC cannot reach Supabase (firewall/proxy issue)');
});

req.end();
