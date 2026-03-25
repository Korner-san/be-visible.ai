/**
 * Vercel Serverless Function: /api/onboarding/analyze-website
 *
 * Phase A: GPT-4o-mini extracts brand info including businessType classification
 * Phase B: Business-type-aware competitor discovery pipeline
 *   Step 1 — GPT-4o-mini generates type-specific search queries (6–10 depending on type)
 *   Step 2 — Tavily runs queries in parallel, extracts candidate domains
 *   Step 3 — GPT-4o-mini scores each candidate (incl. businessModelFit dimension)
 *   Step 4 — Weighted ranking (geography weight varies by marketScope), return top 6
 */

const OpenAI = require('openai');

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

// ─── Phase B: Step 1 — Generate search queries (type-aware) ───────────────────

const generateSearchQueries = async (openai, {
  businessSummary, businessLabel, businessType, coreFunction, industryKeywords,
  marketScope, marketCountry, language,
  keyFeatures, useCases, tasksHelped, uniqueSellingProps, problemSolved,
}) => {
  const isLocal = marketScope === 'local' && marketCountry;

  // Language rule
  let languageRule;
  if (language !== 'English' && isLocal) {
    languageRule = `Generate ALL queries in ${language}. Do not use English.`;
  } else if (language !== 'English' && !isLocal) {
    languageRule = `Generate all queries in English (global search landscape is English-dominant). You may add 1 query in ${language} if highly relevant.`;
  } else {
    languageRule = `Generate all queries in English.`;
  }

  const featuresLine = keyFeatures?.filter(Boolean).length
    ? `Key features: ${keyFeatures.filter(Boolean).join(', ')}`
    : '';
  const useCasesLine = useCases?.filter(Boolean).length
    ? `Use cases: ${useCases.filter(Boolean).join(', ')}`
    : '';
  const tasksLine = tasksHelped?.filter(Boolean).length
    ? `Tasks helped: ${tasksHelped.filter(Boolean).join(', ')}`
    : '';
  const uspLine = uniqueSellingProps?.filter(Boolean).length
    ? `Unique selling props: ${uniqueSellingProps.filter(Boolean).join(', ')}`
    : '';
  const problemLine = problemSolved ? `Problem solved: ${problemSolved}` : '';

  let strategyPrompt;

  const keywordList = (industryKeywords || []).filter(Boolean);
  const keywordsLine = keywordList.length ? keywordList.join(', ') : null;

  if (businessType === 'saas_platform') {
    strategyPrompt = `This is a SaaS/platform/tool business. Generate EXACTLY 10 queries covering these mandatory angles (one query per angle):
1. Industry keyword #1: a query built around "${keywordList[0] || keyFeatures?.[0] || businessLabel}" as the core search term
2. Industry keyword #2: a query built around "${keywordList[1] || keyFeatures?.[1] || businessLabel}" as the core search term
3. Industry keyword #3: a query built around "${keywordList[2] || keyFeatures?.[2] || businessLabel}" as the core search term
4. Core function: a query derived directly from the exact mechanism: "${coreFunction || businessSummary}"
5. Use-case: a query around "${useCases?.[0] || businessLabel}"
6. Use-case: a query around "${useCases?.[1] || businessLabel}"
7. Problem-solving: a query around "${problemSolved || businessLabel} tool"
8. Best-in-class: "best [industry keyword or product category] tools/platforms/software" style query using the most specific keyword
9. Task-based: a query around how to accomplish "${tasksHelped?.[0] || 'the main task'}" with a tool
10. Audience + goal: a query for the target audience trying to achieve the main goal

Do NOT include geography in any query — this is a global product.
Do NOT use "[businessLabel] alternatives" or "[businessLabel] competitors" — focus on what the product does mechanically.`;

  } else if (businessType === 'agency_service') {
    strategyPrompt = `This is an agency or service business. Generate EXACTLY 8 queries covering these angles:
1. businessLabel direct: a clean query built around "${businessLabel}"
2. businessLabel + geography: "${businessLabel} in ${marketCountry || 'relevant market'}"${isLocal ? ' (include geography)' : ' (skip geography if global)'}
3. Specific service #1: a query around the first key service or feature
4. Specific service #2: a query around another key service or feature
5. Service + target audience: "${businessLabel} for [target industry/audience]"
6. Problem-solving: "who provides [the main problem this business solves]"
7. USP-based: a query combining a unique selling point with the business type
8. Task-based: a query around a specific task this business helps clients with

${isLocal ? `Include geography (${marketCountry}) in queries 2 and 5.` : 'Do not include geography — this is a global business.'}`;

  } else if (businessType === 'local_service') {
    strategyPrompt = `This is a local service business. Generate EXACTLY 6 queries:
- Include "${marketCountry}" geography in most queries
- Focus on what specific service they provide and who they serve
- Vary angles: service type, target audience, problem solved, specific niche`;

  } else {
    // ecommerce / other
    strategyPrompt = `Generate EXACTLY 6 queries focusing on product/service category, target audience, and use cases.
${isLocal ? `Include "${marketCountry}" geography in 2–3 queries.` : 'Do not include geography.'}`;
  }

  const coreFunctionLine = coreFunction ? `Core function: ${coreFunction}` : '';
  const keywordsLine2 = keywordsLine ? `Industry keywords: ${keywordsLine}` : '';

  const userPrompt = `Business type: ${businessLabel} (${businessType})
Description: ${businessSummary}
${coreFunctionLine}
${keywordsLine2}
${featuresLine}
${useCasesLine}
${tasksLine}
${uspLine}
${problemLine}
Market: ${isLocal ? `${marketCountry} (local)` : 'Global'}

${strategyPrompt}

${languageRule}
Do NOT generate broad generic industry queries — keep every query niche-specific.

Return ONLY valid JSON:
{"queries": ["query 1", "query 2", ...]}`;

  try {
    const maxTokens = businessType === 'saas_platform' ? 600 : 500;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a competitive intelligence expert. Generate Google search queries to find direct competitors of a specific business. Return only valid JSON.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.filter(q => typeof q === 'string' && q.trim())
      : [];
    console.log(`[analyze-website] Step 1 (${businessType}) — generated ${queries.length} queries:`, queries);
    return queries;
  } catch (err) {
    console.error('[analyze-website] Query generation failed:', err.message);
    return [];
  }
};

// ─── Phase B: Step 2 — Search candidates via Tavily ───────────────────────────

const searchCandidates = async (queries, originalDomain, businessType) => {
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

  const domainScore = {};
  const domainMeta = {};

  for (const queryResults of results) {
    for (const item of queryResults) {
      const domain = extractDomain(item.url);
      if (!domain) continue;
      if (domain === originalDomain) continue;

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

  // Larger pool for saas_platform/agency since we run more queries
  const poolSize = businessType === 'saas_platform' ? 20 : 15;

  const candidates = Object.entries(domainScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, poolSize)
    .map(([domain]) => domainMeta[domain]);

  console.log(`[analyze-website] Step 2 — ${candidates.length} unique candidates found`);
  return candidates;
};

// ─── Phase B: Step 3 — Score candidates with GPT ──────────────────────────────

const scoreCandidates = async (openai, candidates, {
  businessSummary, businessLabel, businessType, marketScope, keyFeatures, coreFunction,
}) => {
  if (!candidates.length) return [];

  const topFeatures = (keyFeatures || []).filter(Boolean).slice(0, 4).join(', ');

  const systemPrompt = `You are a competitive intelligence analyst. Score how similar a candidate business is to a reference business. Return only valid JSON, no explanation outside the JSON.`;

  const scores = await Promise.all(
    candidates.map(async (candidate) => {
      const userPrompt = `Reference business:
Type: ${businessLabel} (${businessType})
Description: ${businessSummary}
${coreFunction ? `Core function: ${coreFunction}` : ''}
${topFeatures ? `Key features: ${topFeatures}` : ''}

Candidate:
Domain: ${candidate.domain}
Title: ${candidate.title}
Description: ${candidate.snippet}

Score the candidate as a direct competitor (0–10 each):
- nicheSimilarity: same specific niche?
- serviceSimilarity: same or very similar services/features?
- audienceSimilarity: same target audience/customer segment?
- geographyFit: same geography?
- businessModelFit: same type of business? (SaaS platform vs agency/service vs local business vs data provider — score 0 if completely different model, 10 if identical)
- overallFit: how strong a direct competitor overall?

Return ONLY valid JSON:
{"nicheSimilarity":0,"serviceSimilarity":0,"audienceSimilarity":0,"geographyFit":0,"businessModelFit":0,"overallFit":0,"name":"inferred company name","reasoning":"one sentence"}`;

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 220,
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

  // Step 4 — Weighted ranking
  const geographyWeight = marketScope === 'local' ? 1.5 : 0.3;
  const normalizer = 2 + 2 + 1.5 + geographyWeight + 2 + 2;

  return scores
    .filter(Boolean)
    .map((s) => ({
      ...s,
      weightedScore: (
        (s.nicheSimilarity || 0) * 2 +
        (s.serviceSimilarity || 0) * 2 +
        (s.audienceSimilarity || 0) * 1.5 +
        (s.geographyFit || 0) * geographyWeight +
        (s.businessModelFit || 0) * 2 +
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

const discoverCompetitors = async (openai, {
  businessSummary, businessLabel, businessType, coreFunction, industryKeywords,
  marketScope, marketCountry, language, originalDomain,
  keyFeatures, useCases, tasksHelped, uniqueSellingProps, problemSolved,
}) => {
  if (!businessSummary) return [];

  const queries = await generateSearchQueries(openai, {
    businessSummary, businessLabel, businessType, coreFunction, industryKeywords,
    marketScope, marketCountry, language,
    keyFeatures, useCases, tasksHelped, uniqueSellingProps, problemSolved,
  });
  if (!queries.length) return [];

  const candidates = await searchCandidates(queries, originalDomain, businessType);
  if (!candidates.length) return [];

  const competitors = await scoreCandidates(openai, candidates, {
    businessSummary, businessLabel, businessType, marketScope, keyFeatures, coreFunction,
  });
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
  "coreFunction": "one precise sentence in English describing exactly what the product or service mechanically does — the technical action, not the business outcome. E.g. 'Monitors how a brand is mentioned inside AI-generated answers from ChatGPT, Perplexity, and Gemini' or 'Manufactures custom injection-molded plastic components for industrial clients'",
  "industryKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "businessLabel": "a short 2-5 word categorical label in English for what this business is — e.g. Marketing agency, B2B HR SaaS, Plastic parts manufacturer",
  "businessType": "saas_platform or agency_service or local_service or ecommerce or other",
  "marketScope": "local or global",
  "marketCountry": "the country name in English where this business primarily operates if local, or null if global"
}

Guidelines:
1. businessSummary, coreFunction, industryKeywords, businessLabel, businessType, marketScope and marketCountry must ALWAYS be in English
2. All other fields should be in ${language}
3. coreFunction must describe the exact technical mechanism — "what does this product literally do?" not "what does it achieve for the customer?"
4. industryKeywords: 3-5 specific technical terms, acronyms, or professional vocabulary that experts would Google to find this type of product/service. Not marketing language. Examples for an AI visibility monitoring tool: ["AEO", "GEO", "answer engine optimization", "AI search visibility", "generative engine optimization"]. Examples for a plastics manufacturer: ["injection molding", "CNC machining", "plastic fabrication"].
5. businessLabel must be short and categorical — strip all marketing language, 2-5 words max
6. businessType rules:
   - "saas_platform": has a dashboard, subscription model, users self-serve (software, tools, platforms)
   - "agency_service": humans deliver the service to clients (agencies, consultancies, studios, manufacturers)
   - "local_service": requires physical presence or exclusively serves one local area (restaurants, salons, contractors)
   - "ecommerce": primarily sells products online
   - "other": anything that doesn't clearly fit
   - IMPORTANT: saas_platform defaults to "global" marketScope unless the product is language-locked or legally restricted to one country. A US-based SaaS accessible worldwide is "global", not "local"
5. marketScope is "local" only if the business clearly targets one country exclusively — not just because it is based there
8. Do NOT include a competitors field
9. Keep each value concise (under 15 words for non-summary/coreFunction fields)`;

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

    console.log(`[analyze-website] Phase A complete — businessLabel: "${gptData.businessLabel}", businessType: ${gptData.businessType}, marketScope: ${gptData.marketScope}, marketCountry: ${gptData.marketCountry}`);

    // Phase B — Competitor discovery pipeline
    const competitors = await discoverCompetitors(openai, {
      businessSummary: gptData.businessSummary,
      businessLabel: gptData.businessLabel,
      businessType: gptData.businessType || 'other',
      coreFunction: gptData.coreFunction || '',
      industryKeywords: gptData.industryKeywords || [],
      marketScope: gptData.marketScope,
      marketCountry: gptData.marketCountry,
      language,
      originalDomain,
      keyFeatures: gptData.keyFeatures,
      useCases: gptData.useCases,
      tasksHelped: gptData.tasksHelped,
      uniqueSellingProps: gptData.uniqueSellingProps,
      problemSolved: gptData.problemSolved,
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
      coreFunction: gptData.coreFunction || '',
      industryKeywords: gptData.industryKeywords || [],
      businessLabel: gptData.businessLabel || '',
      businessType: gptData.businessType || 'other',
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
