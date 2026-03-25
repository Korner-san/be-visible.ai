/**
 * Vercel Serverless Function: /api/onboarding/generate-prompts
 *
 * Generates exactly 30 discovery-focused prompts using GPT-4o.
 * Categories are derived from the brand's own use cases, tasks, features, and goals.
 * Each category contains a mix of prompt types: Direct request, Conversation-simulating,
 * Standard checking, Goal/feature/action-specific (incl. companies/entities/tools).
 * Geography is applied as a rule (1-2 prompts per category) not as a category itself.
 * Saves results to brand_prompts table (status: 'inactive', source_template_code: prompt type).
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

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const {
    brandId,
    language = 'English',
    industry,
    productCategory,
    problemSolved,
    tasksHelped = [],
    goalFacilitated,
    keyFeatures = [],
    useCases = [],
    uniqueSellingProps = [],
    businessSummary = '',
    businessLabel = '',
    marketScope = 'global',
    marketCountry = null,
    competitors = [],
  } = req.body || {};

  if (!brandId) {
    return res.status(400).json({ success: false, error: 'Missing brandId' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const isLocal = marketScope === 'local' && marketCountry;

  const structuredInput = `
Business Summary: ${businessSummary}
Business Type: ${businessLabel}
Industry: ${industry || ''}
Product / Service Category: ${productCategory || ''}
Problem Solved: ${problemSolved || ''}
Tasks Helped: ${tasksHelped.filter(Boolean).join(', ')}
Goal Facilitated: ${goalFacilitated || ''}
Key Features: ${keyFeatures.filter(Boolean).join(', ')}
Use Cases: ${useCases.filter(Boolean).join(', ')}
Unique Selling Props: ${uniqueSellingProps.filter(Boolean).join(', ')}
Market Scope: ${isLocal ? `Local — ${marketCountry}` : 'Global'}
${competitors.filter(Boolean).length ? `Known Competitors: ${competitors.filter(Boolean).join(', ')}` : ''}
`.trim();

  const geographyRule = isLocal
    ? `Geography rule: this is a local business operating in ${marketCountry}. Naturally include "${marketCountry}" in 1–2 prompts per category where it makes sense. Do NOT create a geography-named category — geography is a modifier on prompts, not a category itself.`
    : `Geography rule: this is a global business. Do not add geography to prompts unless the use case is inherently regional.`;

  const systemPrompt = `You are a prompt generator helping a brand appear in AI search results (ChatGPT, Perplexity, Gemini, etc.).

Your goal: generate natural-sounding search prompts that users might type WITHOUT knowing about this brand — but whose answers would logically include this brand.

Do NOT mention the brand name or any specific competitor names in any prompt.
CRITICAL: Generate ALL prompts in ${language}. Every single prompt must be written in ${language}.
CRITICAL: Category names must also be in ${language}.

Use the following brand information:
${structuredInput}

STEP 1 — Derive 5–6 categories:
Create 5–6 categories directly from the brand data above. Each category must:
- Be named after a specific use case, task, feature, problem, or goal of this business
- Be distinct from the others with no overlap
- Be specific to this business's niche — not a generic bucket like "Discovery", "Trends", or "General"
- Have every prompt within it be directly and specifically relevant to that category's exact topic

STEP 2 — Generate exactly 30 prompts spread across those categories:
Within each category, include a mix of these 4 prompt types:

1. "Direct request" — User is directly asking for a recommendation. Max 15 words.
   Examples: "Find me a solution for X", "Recommend a company/agency/tool that does Y"
   Count: ~2 per category

2. "Conversation-simulating" — User describes their situation and asks for guidance. Up to 40 words to allow natural scenario setup.
   Examples: "I'm trying to do X, what should I consider?", "We're a business that does Y, how do we approach Z?"
   Count: 1–2 per category

3. "Standard checking" — User wants to understand the landscape or how things work. Max 15 words.
   Examples: "How does X work in [industry]?", "Which solutions currently exist for [use case]?"
   Count: 2–3 per category

4. "Goal/feature/action-specific" — User is searching for companies, entities, tools, or services tied to a specific goal, feature, or action. Max 15 words.
   Examples: "What companies specialize in [goal]?", "Which agencies/entities help with [task]?", "What tools exist for [feature]?"
   Count: 1–2 per category

${geographyRule}

Return ONLY valid JSON:
{
  "prompts": [
    {"prompt": "...", "category": "...", "type": "Direct request"},
    {"prompt": "...", "category": "...", "type": "Conversation-simulating"},
    {"prompt": "...", "category": "...", "type": "Standard checking"},
    {"prompt": "...", "category": "...", "type": "Goal/feature/action-specific"},
    ...
  ]
}

Ensure exactly 30 prompts. No markdown, no extra text.`;

  try {
    console.log('[generate-prompts] Calling GPT-4o for brandId:', brandId, 'language:', language, 'marketScope:', marketScope);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate exactly 30 discovery-focused prompts in ${language} based on the brand information above. Derive the categories from the business data. Return only valid JSON.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.prompts)) throw new Error('Response missing prompts array');

    const prompts = parsed.prompts.slice(0, 30);

    // Log category distribution for debugging
    const catCounts = prompts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});
    console.log(`[generate-prompts] Generated ${prompts.length} prompts across categories:`, catCounts);

    // Delete existing inactive prompts for this brand (clean slate)
    await supabase
      .from('brand_prompts')
      .delete()
      .eq('brand_id', brandId)
      .eq('status', 'inactive');

    // Insert new prompts — store prompt type in source_template_code for improve-prompts step
    const rows = prompts.map((item) => ({
      brand_id: brandId,
      source_template_code: item.type || 'Standard checking',
      raw_prompt: item.prompt,
      category: item.category || 'General',
      status: 'inactive',
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('brand_prompts')
      .insert(rows)
      .select('id, raw_prompt, category, status, source_template_code');

    if (insertError) {
      console.error('[generate-prompts] Insert error:', insertError);
      throw new Error('Failed to save prompts: ' + insertError.message);
    }

    console.log(`[generate-prompts] Saved ${inserted?.length} prompts for brand:`, brandId);

    return res.status(200).json({
      success: true,
      count: inserted?.length || 0,
      prompts: inserted || [],
    });
  } catch (err) {
    console.error('[generate-prompts] Error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate prompts',
    });
  }
};
