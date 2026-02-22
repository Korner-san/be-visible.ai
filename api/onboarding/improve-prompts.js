/**
 * Vercel Serverless Function: /api/onboarding/improve-prompts
 *
 * Runs GPT-4o-mini on each of the brand's generated prompts to refine them.
 * Updates improved_prompt field and sets status to 'improved'.
 * Must be called after generate-prompts.
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

  const { brandId, language = 'English' } = req.body || {};

  if (!brandId) {
    return res.status(400).json({ success: false, error: 'Missing brandId' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Fetch all inactive prompts for this brand
  const { data: promptRows, error: fetchError } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, category')
    .eq('brand_id', brandId)
    .eq('status', 'inactive');

  if (fetchError || !promptRows || promptRows.length === 0) {
    console.error('[improve-prompts] No prompts found for brand:', brandId, fetchError?.message);
    return res.status(404).json({ success: false, error: 'No prompts found to improve' });
  }

  console.log(`[improve-prompts] Improving ${promptRows.length} prompts in ${language}`);

  // Batch all prompts into a single GPT call for efficiency
  const promptList = promptRows.map((p, i) => `${i + 1}. [${p.category}] ${p.raw_prompt}`).join('\n');

  const systemPrompt = `You are an expert at crafting search prompts for AI visibility.

You will receive a numbered list of search prompts. For each prompt:
- Make it sound more natural and conversational
- Keep it under 15 words
- Keep it in ${language} — do NOT change the language
- Do NOT add brand names or competitor names
- Preserve the original intent and category

Return a JSON object:
{
  "improved": [
    {"index": 1, "prompt": "improved version of prompt 1"},
    {"index": 2, "prompt": "improved version of prompt 2"},
    ...
  ]
}

Return exactly the same number of prompts as input. Keep the same numbering.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Improve these ${promptRows.length} prompts (all must remain in ${language}):\n\n${promptList}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.improved)) throw new Error('Response missing improved array');

    // Build update map
    const updates = parsed.improved.map((item) => {
      const original = promptRows[item.index - 1];
      if (!original) return null;
      return {
        id: original.id,
        improved_prompt: item.prompt,
        status: 'improved',
      };
    }).filter(Boolean);

    // Update each prompt row
    const updatePromises = updates.map((u) =>
      supabase
        .from('brand_prompts')
        .update({ improved_prompt: u.improved_prompt, status: 'improved' })
        .eq('id', u.id)
    );

    await Promise.all(updatePromises);

    console.log(`[improve-prompts] Updated ${updates.length} prompts for brand:`, brandId);

    // Return the improved prompts for display
    const { data: finalPrompts } = await supabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, category, status')
      .eq('brand_id', brandId)
      .eq('status', 'improved')
      .order('source_template_code');

    return res.status(200).json({
      success: true,
      count: updates.length,
      prompts: finalPrompts || [],
    });
  } catch (err) {
    console.error('[improve-prompts] Error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to improve prompts',
    });
  }
};
