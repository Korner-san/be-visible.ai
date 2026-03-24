/**
 * Vercel Serverless Function: POST /api/admin/reinit-session
 *
 * Proxies a session re-initialization request to the Hetzner webhook server.
 * Runs server-side so there is no mixed-content or CORS issue.
 */

const WEBHOOK_URL = process.env.WEBHOOK_SERVER_URL || 'http://135.181.203.202:3001/initialize-session';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'forensic-reinit-secret-2024';

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-forensic-password');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accountEmail } = req.body || {};
  if (!accountEmail) {
    return res.status(400).json({ success: false, error: 'Missing accountEmail' });
  }

  try {
    console.log('[REINIT] Re-initializing session for:', accountEmail);

    const webhookRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountEmail, secret: WEBHOOK_SECRET }),
    });

    const result = await webhookRes.json().catch(() => ({ success: false, error: 'Invalid JSON from webhook' }));

    if (!webhookRes.ok || !result.success) {
      console.error('[REINIT] Webhook failed:', result);
      return res.status(webhookRes.status).json({ success: false, error: result.error || result.message || 'Webhook failed' });
    }

    console.log('[REINIT] Success for:', accountEmail);
    return res.status(200).json({ success: true, message: result.message });

  } catch (err) {
    console.error('[REINIT] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
