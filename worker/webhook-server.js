const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-secret-key-here';

const ALLOWED_URLS = [
  '/initialize-session',
  '/run-onboarding-prompts',   // legacy
  '/run-onboarding-batch',     // legacy
  '/run-queue-checker',        // legacy alias → same as run-queue-organizer
  '/run-queue-organizer',      // new
  '/chunk-complete',           // new: called by run-onboarding-chunk.js when a chunk finishes
];

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method !== 'POST' || !ALLOWED_URLS.includes(req.url)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body);

      if (payload.secret !== WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
        return;
      }

      // ── /run-queue-organizer (and legacy /run-queue-checker) ──────────────
      // Triggered by complete-final when a user finishes onboarding.
      // Immediately runs the queue-organizer to start processing pending prompts.
      if (req.url === '/run-queue-organizer' || req.url === '/run-queue-checker') {
        console.log('[WEBHOOK]', req.url, 'triggered');
        const orgLogPath2 = `/tmp/queue-org-${Date.now()}.log`;
        const orgLogFd2 = fs.openSync(orgLogPath2, 'w');
        const proc = spawn('node', [path.join(__dirname, 'worker/queue-organizer.js')], {
          env: { ...process.env },
          cwd: path.join(__dirname, 'worker'),
          detached: true,
          stdio: ['ignore', orgLogFd2, orgLogFd2],
        });
        try { fs.closeSync(orgLogFd2); } catch (e) {}
        proc.unref();
        console.log('[WEBHOOK] Queue organizer log →', orgLogPath2);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Queue organizer triggered' }));
        return;
      }

      // ── /chunk-complete ───────────────────────────────────────────────────
      // Called by run-onboarding-chunk.js when a chunk finishes (success or failure).
      // Immediately re-triggers queue-organizer to dispatch next wave or finalize.
      if (req.url === '/chunk-complete') {
        const { brandId, wave } = payload;
        console.log('[WEBHOOK] /chunk-complete for brand:', brandId, 'wave:', wave);
        const orgLogPath = `/tmp/queue-org-${Date.now()}.log`;
        const orgLogFd = fs.openSync(orgLogPath, 'w');
        const proc = spawn('node', [path.join(__dirname, 'worker/queue-organizer.js')], {
          env: { ...process.env },
          cwd: path.join(__dirname, 'worker'),
          detached: true,
          stdio: ['ignore', orgLogFd, orgLogFd],
        });
        try { fs.closeSync(orgLogFd); } catch (e) {}
        proc.unref();
        console.log('[WEBHOOK] Queue organizer log →', orgLogPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Queue organizer triggered by chunk-complete' }));
        return;
      }

      // ── /run-onboarding-batch (legacy — kept for backwards compatibility) ─
      if (req.url === '/run-onboarding-batch') {
        const { brandId } = payload;
        if (!brandId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing brandId' }));
          return;
        }
        console.log('[WEBHOOK] /run-onboarding-batch (legacy) for brand:', brandId);
        const proc = spawn('node', [path.join(__dirname, 'worker/run-onboarding-batch.js')], {
          env: { ...process.env, BRAND_ID: brandId },
          cwd: path.join(__dirname, 'worker'),
          detached: true,
          stdio: 'ignore',
        });
        proc.unref();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Onboarding batch started for brand ' + brandId }));
        return;
      }

      // ── /run-onboarding-prompts (legacy) ──────────────────────────────────
      if (req.url === '/run-onboarding-prompts') {
        const { brandId } = payload;
        if (!brandId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing brandId' }));
          return;
        }
        console.log('[WEBHOOK] /run-onboarding-prompts (legacy) for brand:', brandId);
        const proc = spawn('node', [path.join(__dirname, 'run-onboarding-prompts.js')], {
          env: { ...process.env, BRAND_ID: brandId },
          cwd: __dirname,
          detached: true,
          stdio: 'ignore',
        });
        proc.unref();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Onboarding prompts started for brand ' + brandId }));
        return;
      }

      // ── /initialize-session ───────────────────────────────────────────────
      if (req.url === '/initialize-session') {
        const { accountEmail } = payload;
        if (!accountEmail) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing accountEmail' }));
          return;
        }
        console.log('[WEBHOOK] /initialize-session for:', accountEmail);
        const scriptPath = path.join(__dirname, 'worker/initialize-persistent-session-db-driven.js');
        const initProcess = spawn('node', [scriptPath], {
          env: { ...process.env, CHATGPT_EMAIL: accountEmail },
          cwd: __dirname,
        });
        let stdout = '', stderr = '';
        initProcess.stdout.on('data', d => { stdout += d; console.log('[INIT]', d.toString()); });
        initProcess.stderr.on('data', d => { stderr += d; console.error('[INIT ERR]', d.toString()); });
        initProcess.on('close', code => {
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Session initialized for ' + accountEmail, output: stdout }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Init failed', message: stderr || stdout, exitCode: code }));
          }
        });
      }

    } catch (error) {
      console.error('[WEBHOOK] Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log('Webhook server listening on port', PORT);
  console.log('Endpoints:', ALLOWED_URLS.join(', '));
});
