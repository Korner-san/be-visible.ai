/**
 * Vercel Serverless Function: /api/resolve-competitor-url
 *
 * Given an entity name + brandId, fetches a context snippet from prompt_results
 * and asks Perplexity to return the most likely official website domain.
 * Returns { url: string | null }
 */

const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ url: null, error: 'Method not allowed' });
  }

  try {
    const { brandId, entityName } = req.body || {};
    console.log('[resolve-competitor-url] brandId:', brandId, '| entity:', entityName);

    if (!brandId || !entityName) {
      return res.status(400).json({ url: null, error: 'Missing brandId or entityName' });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Fetch a context snippet from a response that mentions this entity ──
    let contextSnippet = '';
    let promptText = '';

    try {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('brand_id', brandId)
        .eq('status', 'completed')
        .order('report_date', { ascending: false })
        .limit(10);

      console.log('[resolve-competitor-url] Reports found:', reports?.length ?? 0);

      if (reports && reports.length > 0) {
        const reportIds = reports.map(r => r.id);

        const { data: result, error: resultError } = await supabase
          .from('prompt_results')
          .select('chatgpt_response, prompt_text')
          .in('daily_report_id', reportIds)
          .ilike('chatgpt_response', `%${entityName}%`)
          .limit(1)
          .single();

        if (resultError) {
          console.log('[resolve-competitor-url] No matching prompt_result:', resultError.message);
        }

        if (result) {
          promptText = result.prompt_text || '';
          const responseText = result.chatgpt_response || '';
          const idx = responseText.toLowerCase().indexOf(entityName.toLowerCase());
          contextSnippet = idx >= 0
            ? responseText.substring(Math.max(0, idx - 80), idx + 220).replace(/\s+/g, ' ').trim()
            : responseText.substring(0, 300).replace(/\s+/g, ' ').trim();
          console.log('[resolve-competitor-url] Context snippet length:', contextSnippet.length);
        }
      }
    } catch (ctxErr) {
      console.warn('[resolve-competitor-url] Context fetch error:', ctxErr);
    }

    // ── Call Perplexity ────────────────────────────────────────────────────
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) {
      console.error('[resolve-competitor-url] PERPLEXITY_API_KEY not set');
      return res.status(200).json({ url: null });
    }

    const userMessage = [
      `Entity name: "${entityName}"`,
      contextSnippet ? `Context from AI response: "${contextSnippet}"` : '',
      promptText ? `Original prompt: "${promptText}"` : '',
      '',
      'Return the single most likely official website domain for this entity.',
      'Respond with JSON only: {"url": "example.com"}',
      'Rules:',
      '- Domain only (e.g. sendgrid.com), no https://, no www., no trailing slash',
      '- Always return a best-effort answer, never null or empty',
    ].filter(Boolean).join('\n');

    console.log('[resolve-competitor-url] Calling Perplexity for:', entityName);

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Return only valid JSON with no markdown, no explanation.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 60,
        temperature: 0.1,
      }),
    });

    console.log('[resolve-competitor-url] Perplexity status:', perplexityRes.status);

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text();
      console.error('[resolve-competitor-url] Perplexity error body:', errText);
      return res.status(200).json({ url: null });
    }

    const perplexityData = await perplexityRes.json();
    const rawText = perplexityData?.choices?.[0]?.message?.content || '';
    console.log('[resolve-competitor-url] Perplexity raw response:', rawText);

    let url = null;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      url = parsed?.url || null;
      if (url) {
        url = url
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split('/')[0]
          .trim()
          .toLowerCase();
      }
    } catch {
      // Perplexity returned plain text — try to extract a domain directly
      const domainMatch = rawText.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
      if (domainMatch) url = domainMatch[1].toLowerCase();
      console.warn('[resolve-competitor-url] JSON parse failed, extracted:', url, '| raw:', rawText);
    }

    console.log(`[resolve-competitor-url] Final: "${entityName}" → "${url}"`);
    return res.status(200).json({ url });

  } catch (err) {
    console.error('[resolve-competitor-url] Unexpected error:', err);
    return res.status(200).json({ url: null });
  }
};
