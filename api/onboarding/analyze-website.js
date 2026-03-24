/**
 * Vercel Serverless Function: /api/onboarding/analyze-website
 *
 * Phase A: GPT-4o-mini extracts brand info + businessSummary/businessLabel/marketScope/marketCountry
 * Phase B: Competitor discovery pipeline
 *   Step 1 — GPT-4o-mini generates niche search queries
 *   Step 2 — Tavily runs those queries, extracts candidate domains
 *   Step 3 — GPT-4o-mini scores each candidate against the original business
 *   Step 4 — Rank by weighted score, return top 6
 */

const OpenAI = require('openai');

const DOMAIN_BLOCKLIST = new Set([
  'wikipedia.org', 'linkedin.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'youtube.com', 'tiktok.com',
  'g2.com', 'capterra.com', 'trustpilot.com', 'crunchbase.com',
  'glassdoor.com', 'indeed.com', 'yelp.com', 'tripadvisor.com',
  'amazon.com', 'google.com', 'bing.com', 'yahoo.com',
  'reddit.com', 'quora.com', 'medium.com', 'substack.com',
  'forbes.com', 'techcrunch.com', 'businessinsider.com', 'wsj.com',
]);

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

const extractDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
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
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch (err) {
    console.error('[analyze-website] Fetch error:', err.message);
    return '';
  }
};

// ─── Phase B: Step 1 — Generate search queries ────────────────────────────────

const generateSearchQueries = async (openai, businessSummary, businessLabel, marketScope, marketCountry, language) => {
  const marketLine = marketScope === 'local' && marketCountry
    ? `Market: ${marketCountry} (local/national business)`
    : 'Market: Global';

  const systemPrompt = `You are a competitive intelligence expert. Generate Google search queries to find direct competitors of a specific business. Queries should target different angles: business category, services, target audience, and geography when relevant. Return only valid JSON.`;

  const userPrompt = `Business type: ${businessLabel}
Description: ${businessSummary}
${marketLine}
Primary language of the market: ${language}

Generate up to 6 search queries optimized for finding direct competitors of this exact business — matching its niche, services, and target audience.

Rules:
- For local/national businesses: include geography in 2-3 queries, use local language for 1-2 queries
- For global businesses: focus on category, use case, and service similarity
- Vary the angle across queries (category, service, audience, problem solved)
- Do NOT generate broad industry queries — keep them niche-specific

Return ONLY valid JSON:
{"queries": ["query 1", "query 2", "query 3", "query 4", "query 5", "query 6"]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const queries = Array.isArray(parsed.queries) ? parsed.queries.filter(q => typeof q === 'string' && q.trim()) : [];
    console.log(`[analyze-website] Step 1 — generated ${queries.length} queries:`, queries);
    return queries;
  } catch (err) {
    console.error('[analyze-website] Query generation failed:', err.message);
    return [];
  }
};

// ─── Phase B: Step 2 — Search candidates via Tavily ───────────────────────────

const searchCandidates = async (queries, originalDomain) => {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    console.error('[analyze-website] TAVILY_API_KEY not set');
    return [];
  }

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query,
            search_depth: 'basic',
            max_results: 5,
            include_answer: false,
          }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
      } catch {
        return [];
      }
    })
  );

  // Flatten, extract domains, score by frequency (more queries = higher rank)
  const domainScore = {};
  const domainMeta = {};

  for (const queryResults of results) {
    for (const item of queryResults) {
      const domain = extractDomain(item.url);
      if (!domain) continue;
      if (domain === originalDomain) continue;
      if (DOMAIN_BLOCKLIST.has(domain)) continue;

      domainScore[domain] = (domainScore[domain] || 0) + 1;
      if (!domainMeta[domain]) {
        domainMeta[domain] = {
          domain,
          title: item.title || domain,
          snippet: (item.content || item.snippet || '').slice(0, 300),
        };
      }
    }
  }

  const candidates = Object.entries(domainScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([domain]) => domainMeta[domain]);

  console.log(`[analyze-website] Step 2 — ${candidates.length} unique candidates found`);
  return candidates;
};

// ─── Phase B: Step 3 — Score candidates with GPT ──────────────────────────────

const scoreCandidates = async (openai, candidates, businessSummary, businessLabel, marketScope) => {
  if (!candidates.length) return [];

  const systemPrompt = `You are a competitive intelligence analyst. Score how similar a candidate business is to a reference business. Return only valid JSON, no explanation outside the JSON.`;

  const scores = await Promise.all(
    candidates.map(async (candidate) => {
      const userPrompt = `Reference business:
Type: ${businessLabel}
Description: ${businessSummary}

Candidate:
Domain: ${candidate.domain}
Title: ${candidate.title}
Description: ${candidate.snippet}

Score the candidate as a direct competitor to the reference business (0–10 each):
- nicheSimilarity: same specific niche?
- serviceSimilarity: same or very similar services?
- audienceSimilarity: same target audience/customer segment?
- geographyFit: same geography?
- overallFit: how strong a competitor overall?

Return ONLY valid JSON:
{"nicheSimilarity":0,"serviceSimilarity":0,"audienceSimilarity":0,"geographyFit":0,"overallFit":0,"name":"inferred company name","reasoning":"one sentence"}`;

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        });

        const raw = completion.choices[0]?.message?.content?.trim();
        if (!raw) return null;
        const s = JSON.parse(raw);
        return { ...candidate, ...s };
      } catch {
        return null;
      }
    })
  );

  // Step 4 — Rank by weighted score
  const geographyWeight = marketScope === 'local' ? 1.5 : 0.5;
  const normalizer = 2 + 2 + 1.5 + geographyWeight + 2;

  return scores
    .filter(Boolean)
    .map((s) => ({
      ...s,
      weightedScore: (
        (s.nicheSimilarity || 0) * 2 +
        (s.serviceSimilarity || 0) * 2 +
        (s.audienceSimilarity || 0) * 1.5 +
        (s.geographyFit || 0) * geographyWeight +
        (s.overallFit || 0) * 2
      ) / normalizer,
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 6)
    .map((s) => ({
      name: s.name || s.title || s.domain,
      domain: s.domain,
    }));
};

// ─── Phase B: Orchestrator ────────────────────────────────────────────────────

const discoverCompetitors = async (openai, { businessSummary, businessLabel, marketScope, marketCountry, language, originalDomain }) => {
  if (!businessSummary) return [];

  const queries = await generateSearchQueries(openai, businessSummary, businessLabel, marketScope, marketCountry, language);
  if (!queries.length) return [];

  const candidates = await searchCandidates(queries, originalDomain);
  if (!candidates.length) return [];

  const competitors = await scoreCandidates(openai, candidates, businessSummary, businessLabel, marketScope);
  console.log(`[analyze-website] Phase B complete — ${competitors.length} competitors ranked`);
  return competitors;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

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
  const originalDomain = extractDomain(normalizedUrl);

  try {
    const websiteContent = await fetchWebsiteContent(normalizedUrl);

    if (!websiteContent) {
      return res.status(200).json({
        success: false,
        error: 'Could not fetch website content. Please fill in the fields manually.',
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Phase A — GPT-4o-mini brand extraction
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

    // Phase B — Competitor discovery pipeline
    const competitors = await discoverCompetitors(openai, {
      businessSummary: gptData.businessSummary,
      businessLabel: gptData.businessLabel,
      marketScope: gptData.marketScope,
      marketCountry: gptData.marketCountry,
      language,
      originalDomain,
    });

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
    return res.status(500).json({ success: false, error: errMsg });
  }
};
