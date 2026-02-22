/**
 * Vercel Serverless Function: /api/onboarding/analyze-website
 *
 * Fetches a website's HTML and uses GPT-4o-mini to extract brand information.
 * Returns extracted data in the user's chosen language.
 */

const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
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

const normalizeUrl = (url) => {
  if (!url) return '';
  url = url.trim().replace(/^@+/, '').replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
};

const fetchWebsiteContent = async (url) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BeVisibleBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const html = await response.text();
    // Strip HTML tags and collapse whitespace
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
    return text;
  } catch (err) {
    console.error('[analyze-website] Fetch error:', err.message);
    return '';
  }
};

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { url, language = 'English' } = req.body || {};

  if (!url) {
    return res.status(400).json({ success: false, error: 'Missing url' });
  }

  const normalizedUrl = normalizeUrl(url);

  try {
    const websiteContent = await fetchWebsiteContent(normalizedUrl);

    if (!websiteContent) {
      return res.status(200).json({
        success: false,
        error: 'Could not fetch website content. Please fill in the fields manually.',
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are a brand analyst. Extract brand information from the provided website content.
Return ALL extracted information in ${language}. If ${language} is not English, translate everything to ${language}.

Return a valid JSON object with EXACTLY these fields:
{
  "brandName": "company name",
  "industry": "the industry sector",
  "productCategory": "type of product or service",
  "problemSolved": "the main problem the product addresses",
  "tasksHelped": ["task 1", "task 2", "task 3", "task 4", "task 5"],
  "goalFacilitated": "the main goal users achieve",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4"],
  "useCases": ["use case 1", "use case 2", "use case 3", "use case 4"],
  "competitors": ["competitor 1", "competitor 2", "competitor 3"],
  "uniqueSellingProps": ["usp 1", "usp 2", "usp 3", "usp 4"]
}

All text values must be in ${language}. Keep each value concise (under 15 words).
If you cannot determine a value, use a reasonable placeholder in ${language}.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Website URL: ${normalizedUrl}\n\nWebsite content:\n${websiteContent}\n\nExtract brand information and return as JSON in ${language}.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('No response from OpenAI');

    const brandData = JSON.parse(raw);

    return res.status(200).json({ success: true, brandData });
  } catch (err) {
    console.error('[analyze-website] Error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to analyze website',
    });
  }
};
