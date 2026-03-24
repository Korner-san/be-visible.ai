/**
 * Vercel Serverless Function: /api/onboarding/analyze-website
 *
 * Phase A: GPT-4o-mini extracts brand info + businessSummary/businessLabel/marketScope/marketCountry
 * Phase B: Perplexity uses businessSummary to find up to 6 real competitors with domains
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
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
    return text;
  } catch (err) {
    console.error('[analyze-website] Fetch error:', err.message);
    return '';
  }
};

// Phase B — Perplexity competitor search
const fetchPerplexityCompetitors = async (businessSummary, marketScope, marketCountry) => {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    console.error('[analyze-website] PERPLEXITY_API_KEY not set');
    return [];
  }

  const isLocal = marketScope === 'local' && marketCountry;

  const userPrompt = isLocal
    ? `Here is a description of the company I need competitors for:\n\n${businessSummary}\n\nFind the top competitors of this business that operate in ${marketCountry}.\nList only companies with real presence or meaningful focus in the ${marketCountry} market.\nDo not include generic category names — only real company names.\nReturn ONLY a valid JSON array of up to 6 objects with "name" and "domain" fields, nothing else.\nExample format: [{"name": "Company A", "domain": "companya.com"}, {"name": "Company B", "domain": "companyb.com"}]`
    : `Here is a description of the company I need competitors for:\n\n${businessSummary}\n\nFind the top global competitors in this space.\nList the leading companies worldwide that compete directly with this type of business.\nDo not include generic category names — only real company names.\nReturn ONLY a valid JSON array of up to 6 objects with "name" and "domain" fields, nothing else.\nExample format: [{"name": "Company A", "domain": "companya.com"}, {"name": "Company B", "domain": "companyb.com"}]`;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityApiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a market research expert. Return only valid JSON arrays as instructed, no additional text or explanation.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      console.error('[analyze-website] Perplexity API error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const competitors = parsed
      .filter((item) => item && typeof item === 'object' && item.name)
      .map((item) => ({
        name: String(item.name).trim(),
        domain: String(item.domain || '')
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, ''),
      }))
      .slice(0, 6);

    console.log(`[analyze-website] Perplexity returned ${competitors.length} competitors`);
    return competitors;
  } catch (err) {
    console.error('[analyze-website] Perplexity call failed:', err.message);
    return [];
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

  const { url, language = 'English', timezone = 'UTC' } = req.body || {};

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

    // Phase A — GPT-4o-mini extraction
    const systemPrompt = `You are a brand analyst. Extract brand information from the provided website content.
The user selected these regional settings:
- Language: ${language}
- Timezone: ${timezone}

Use these as strong hints about where this business operates and who it serves.
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
  "uniqueSellingProps": ["usp 1", "usp 2", "usp 3", "usp 4"],
  "businessSummary": "2-3 sentence paragraph in English: who this company is, exactly what they do, what problem they solve, and where they operate",
  "businessLabel": "a short 2-5 word categorical label in English for what this business is — e.g. Marketing agency, B2B HR SaaS, Plastic parts manufacturer",
  "marketScope": "local or global",
  "marketCountry": "the country name in English where this business primarily operates if local, or null if global"
}

Guidelines:
1. businessSummary and businessLabel and marketScope and marketCountry must ALWAYS be in English regardless of website language
2. All other fields should be in ${language}
3. businessLabel must be short and categorical — strip all marketing language, 2-5 words max
4. marketScope is "local" if the business clearly targets one country, "global" otherwise
5. Do NOT include a competitors field
6. Keep each value concise (under 15 words for non-summary fields)`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Website URL: ${normalizedUrl}\n\nWebsite content:\n${websiteContent}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('No response from OpenAI');

    const gptData = JSON.parse(raw);

    console.log(`[analyze-website] Phase A complete — businessLabel: "${gptData.businessLabel}", marketScope: ${gptData.marketScope}, marketCountry: ${gptData.marketCountry}`);

    // Phase B — Perplexity competitor search (sequential)
    const competitors = gptData.businessSummary
      ? await fetchPerplexityCompetitors(gptData.businessSummary, gptData.marketScope, gptData.marketCountry)
      : [];

    console.log(`[analyze-website] Phase B complete — ${competitors.length} competitors found`);

    const brandData = {
      brandName: gptData.brandName,
      industry: gptData.industry,
      productCategory: gptData.productCategory,
      problemSolved: gptData.problemSolved,
      tasksHelped: gptData.tasksHelped,
      goalFacilitated: gptData.goalFacilitated,
      keyFeatures: gptData.keyFeatures,
      useCases: gptData.useCases,
      uniqueSellingProps: gptData.uniqueSellingProps,
      businessSummary: gptData.businessSummary || '',
      businessLabel: gptData.businessLabel || '',
      marketScope: gptData.marketScope || 'global',
      marketCountry: gptData.marketCountry || null,
      competitors,
      websiteUrl: normalizedUrl,
    };

    return res.status(200).json({ success: true, brandData });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[analyze-website] Error:', errMsg);
    return res.status(500).json({
      success: false,
      error: errMsg,
    });
  }
};
