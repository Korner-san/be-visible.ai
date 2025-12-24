/**
 * Simple Webhook Server for Triggering Session Re-initialization
 *
 * This server runs on your Hetzner server (135.181.203.202) and provides
 * an HTTP endpoint that the Vercel-deployed Next.js app can call to trigger
 * the initialization script.
 *
 * Deploy this file to your server at: /root/be-visible.ai/webhook-server.js
 * Run with PM2: pm2 start webhook-server.js --name forensic-webhook
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3001; // Use a different port than your main app
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-secret-key-here'; // Change this!

const server = http.createServer(async (req, res) => {
  // Enable CORS for requests from your Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only accept POST requests to /initialize-session
  if (req.method !== 'POST' || req.url !== '/initialize-session') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return;
  }

  // Parse request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { accountEmail, secret } = JSON.parse(body);

      // Verify secret
      if (secret !== WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
        return;
      }

      if (!accountEmail) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing accountEmail' }));
        return;
      }

      console.log(`🔄 [WEBHOOK] Re-initializing session for account: ${accountEmail}`);

      // Path to the initialization script
      const scriptPath = path.join(__dirname, 'initialize-persistent-session-INSTRUMENTED.js');

      // Spawn the initialization script
      const initProcess = spawn('node', [scriptPath], {
        env: {
          ...process.env,
          CHATGPT_ACCOUNT_EMAIL: accountEmail
        },
        cwd: __dirname
      });

      let stdout = '';
      let stderr = '';

      initProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[INIT OUTPUT] ${data.toString()}`);
      });

      initProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[INIT ERROR] ${data.toString()}`);
      });

      initProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ [WEBHOOK] Session re-initialized successfully for ${accountEmail}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: `Session re-initialized successfully for ${accountEmail}`,
            output: stdout
          }));
        } else {
          console.error(`❌ [WEBHOOK] Session re-initialization failed for ${accountEmail}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Re-initialization failed',
            message: stderr || stdout,
            exitCode: code
          }));
        }
      });

    } catch (error) {
      console.error('❌ [WEBHOOK] Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message
      }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🎣 Webhook server listening on port ${PORT}`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/initialize-session`);
  console.log(`🔐 Secret: ${WEBHOOK_SECRET}`);
  console.log('\n⚠️  Make sure to set WEBHOOK_SECRET environment variable for security!');
});
