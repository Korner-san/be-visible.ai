/**
 * Vercel Serverless Function: /api/onboarding/generate-prompts
 *
 * Generates exactly 30 discovery-focused prompts using GPT-4o.
 * All prompts are in the user's chosen language.
 * Saves results to brand_prompts table (status: 'inactive').
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
  } = req.body || {};

  if (!brandId) {
    return res.status(400).json({ success: false, error: 'Missing brandId' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const structuredInput = `
Industry: ${industry || ''}
Product Category: ${productCategory || ''}
Problem Solved: ${problemSolved || ''}
Tasks Helped: ${tasksHelped.filter(Boolean).join(', ')}
Goal Facilitated: ${goalFacilitated || ''}
Key Features: ${keyFeatures.filter(Boolean).join(', ')}
Use Cases: ${useCases.filter(Boolean).join(', ')}
Unique Selling Props: ${uniqueSellingProps.filter(Boolean).join(', ')}
`.trim();

  const systemPrompt = `You are a prompt generator helping a brand appear in AI search results (e.g. ChatGPT or Perplexity).

Your goal is to come up with natural-sounding, curiosity-driven search questions that users might type *without knowing about the brand* — but whose answers would logically include this brand.

Do NOT include brand names or specific competitors in any prompt.

CRITICAL: Generate ALL prompts in ${language}. Every single prompt must be written in ${language}.
CRITICAL: Category names must also be in ${language}.

Use the following brand information:
${structuredInput}

Generate EXACTLY 30 unique, realistic search prompts.

They should simulate questions a user might ask if they were trying to solve these problems or find tools in this category.

Distribute prompts across 4–6 categories that reflect the brand's use cases, industry, key features, and target problems. Example categories (translate to ${language}): Discovery, Problem Solving, Technical How-To, Competitive Comparison, Industry Trends, Use Case Application.

Return ONLY a valid JSON object:
{
  "prompts": [
    {"prompt": "...", "category": "..."},
    ...
  ]
}

Ensure exactly 30 prompts. No markdown, no extra text.`;

  try {
    console.log('[generate-prompts] Calling GPT-4o for brandId:', brandId, 'language:', language);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate exactly 30 discovery-focused prompts in ${language} based on the brand information. Return only valid JSON.`,
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
    console.log(`[generate-prompts] Generated ${prompts.length} prompts`);

    // Delete existing inactive prompts for this brand (clean slate)
    await supabase
      .from('brand_prompts')
      .delete()
      .eq('brand_id', brandId)
      .eq('status', 'inactive');

    // Insert new prompts
    const rows = prompts.map((item, i) => ({
      brand_id: brandId,
      source_template_code: `gpt_${i + 1}`,
      raw_prompt: item.prompt,
      category: item.category || 'Discovery',
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
