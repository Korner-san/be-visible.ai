require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUT_DIR = path.join(process.cwd(), 'tmp');
const OUT_FILE = path.join(OUT_DIR, 'real-estate-content-type-research.json');

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function fetchAll(query, label) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchInBatches(table, select, column, values, label, extra = q => q) {
  const out = [];
  for (let i = 0; i < values.length; i += 500) {
    const batch = values.slice(i, i + 500);
    if (batch.length === 0) continue;
    out.push(...await fetchAll(extra(supabase.from(table).select(select).in(column, batch)), label));
  }
  return out;
}

async function loadUrls() {
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, domain')
    .eq('user_business_type', 'real_estate_israel')
    .limit(1)
    .single();
  if (brandError) throw brandError;

  const reports = await fetchAll(
    supabase.from('daily_reports').select('id').eq('brand_id', brand.id),
    'daily_reports'
  );
  const promptResults = await fetchInBatches(
    'prompt_results',
    'id',
    'daily_report_id',
    reports.map(r => r.id),
    'prompt_results',
    q => q.in('provider_status', ['ok'])
  );
  const citations = await fetchInBatches(
    'url_citations',
    'url_id',
    'prompt_result_id',
    promptResults.map(r => r.id),
    'url_citations'
  );

  const urlIds = [...new Set(citations.map(c => c.url_id).filter(Boolean))];
  const inventory = await fetchInBatches(
    'url_inventory',
    'id,url,domain',
    'id',
    urlIds,
    'url_inventory'
  );
  const facts = await fetchInBatches(
    'url_content_facts',
    'url_id,title,description,content_snippet,raw_content,content_structure_category',
    'url_id',
    urlIds,
    'url_content_facts'
  );

  const factByUrl = new Map(facts.map(f => [f.url_id, f]));
  const urls = inventory
    .map(row => ({ ...row, fact: factByUrl.get(row.id) }))
    .filter(row => row.fact && (row.fact.content_snippet || row.fact.raw_content))
    .sort((a, b) => (a.domain || '').localeCompare(b.domain || '') || a.url.localeCompare(b.url))
    .map((row, index) => ({
      index: index + 1,
      urlId: row.id,
      url: row.url,
      domain: row.domain,
      title: compact(row.fact.title).slice(0, 220),
      description: compact(row.fact.description).slice(0, 300),
      currentGlobalCategory: row.fact.content_structure_category || null,
      snippet: compact(row.fact.content_snippet || row.fact.raw_content).slice(0, 1800)
    }));

  return { brand, urls };
}

function buildPrompt(batch) {
  return `You are designing content/page type labels for Israeli real estate citation analysis.

Classify each URL by WEB PAGE FORMAT, editorial structure, and user intent. Do NOT classify by real estate topic.

Good category examples:
- News article
- Market analysis article
- Long-form guide / explainer
- Search/listings platform
- Filtered search results page
- Professional directory
- Official PDF report
- Official publication index
- Social media post
- Community group / gated social page
- Data table / benchmark index
- Homepage / commercial gateway
- Opinion column
- Encyclopedia/reference entry
- Branded blog article

Bad category examples:
- New residential project page
- Apartment investment page
- Tel Aviv prices
- Neighborhood page

For each URL, return:
- url
- hebrewCategoryName: short natural Hebrew label
- englishKey: UPPER_SNAKE_CASE
- categoryDescriptionHebrew: which kinds of pages belong in this category
- whyThisPageFitsHebrew: short reason based on the evidence
- confidence: 0.00 to 1.00

Use granular labels. Similar labels are allowed. We will merge later.
The "index" value in your response must exactly match the numeric index shown before each URL.

URLs:
${batch.map(item => `
${item.index}. URL: ${item.url}
Domain: ${item.domain}
Title: ${item.title}
Description: ${item.description}
Existing general category: ${item.currentGlobalCategory || 'none'}
Extracted content: ${item.snippet}
`).join('\n')}

Respond with valid JSON only:
{
  "classifications": [
    {
      "index": 1,
      "url": "...",
      "hebrewCategoryName": "...",
      "englishKey": "...",
      "categoryDescriptionHebrew": "...",
      "whyThisPageFitsHebrew": "...",
      "confidence": 0.00
    }
  ]
}`;
}

async function classifyBatch(batch, batchNumber, totalBatches) {
  console.log(`[CLASSIFY] Batch ${batchNumber}/${totalBatches}: ${batch.length} URLs`);
  let parsed = { classifications: [] };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You classify web pages by content/page format. You are careful to avoid topical labels. Always return valid JSON.'
          },
          { role: 'user', content: buildPrompt(batch) }
        ],
        temperature: 0.1,
        max_tokens: attempt === 1 ? 9000 : 14000,
        response_format: { type: 'json_object' }
      });

      parsed = JSON.parse(response.choices[0]?.message?.content || '{"classifications":[]}');
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`[CLASSIFY] Batch ${batchNumber} parse failed, retrying with larger response budget: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const byIndex = new Map((parsed.classifications || []).map(item => [Number(item.index), item]));
  const byUrl = new Map((parsed.classifications || []).map(item => [item.url, item]));
  return batch.map(item => ({
    ...item,
    classification: byIndex.get(item.index) || byUrl.get(item.url) || {
      index: item.index,
      url: item.url,
      hebrewCategoryName: 'לא סווג',
      englishKey: 'UNCLASSIFIED',
      categoryDescriptionHebrew: 'לא התקבל סיווג תקין עבור העמוד.',
      whyThisPageFitsHebrew: 'תשובת הסיווג לא כללה רשומה תואמת.',
      confidence: 0
    }
  }));
}

function summarize(classified) {
  const groups = new Map();
  for (const item of classified) {
    const key = item.classification.hebrewCategoryName || 'לא סווג';
    if (!groups.has(key)) {
      groups.set(key, {
        hebrewCategoryName: key,
        englishKeys: new Set(),
        count: 0,
        examples: []
      });
    }
    const group = groups.get(key);
    group.count++;
    group.englishKeys.add(item.classification.englishKey);
    if (group.examples.length < 5) {
      group.examples.push({
        domain: item.domain,
        url: item.url,
        why: item.classification.whyThisPageFitsHebrew
      });
    }
  }

  return [...groups.values()]
    .map(group => ({
      ...group,
      englishKeys: [...group.englishKeys]
    }))
    .sort((a, b) => b.count - a.count || a.hebrewCategoryName.localeCompare(b.hebrewCategoryName));
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY');
  }

  const { brand, urls } = await loadUrls();
  const batchSize = Number(process.env.RE_CONTENT_BATCH_SIZE || 8);
  const limit = process.env.RE_CONTENT_LIMIT ? Number(process.env.RE_CONTENT_LIMIT) : urls.length;
  const selected = urls.slice(0, limit);
  let classified = [];
  if (fs.existsSync(OUT_FILE) && process.env.RE_CONTENT_RESTART !== '1') {
    const previous = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    classified = (previous.classifications || [])
      .filter(item => item.classification?.englishKey && item.classification.englishKey !== 'UNCLASSIFIED');
    if (classified.length > 0) {
      console.log(`[RESUME] Loaded ${classified.length} existing classifications from ${OUT_FILE}`);
    }
  }
  const classifiedIndexes = new Set(classified.map(item => item.index));
  const totalBatches = Math.ceil(selected.length / batchSize);

  for (let i = 0; i < selected.length; i += batchSize) {
    const batch = selected.slice(i, i + batchSize).filter(item => !classifiedIndexes.has(item.index));
    if (batch.length === 0) continue;
    const batchResult = await classifyBatch(batch, Math.floor(i / batchSize) + 1, totalBatches);
    classified.push(...batchResult);
    batchResult.forEach(item => classifiedIndexes.add(item.index));
    classified.sort((a, b) => a.index - b.index);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({
      brand,
      generatedAt: new Date().toISOString(),
      totalEligibleUrls: urls.length,
      classifiedUrls: classified.length,
      classifications: classified,
      granularSummary: summarize(classified)
    }, null, 2));
  }

  const finalOutput = {
    brand,
    generatedAt: new Date().toISOString(),
    totalEligibleUrls: urls.length,
    classifiedUrls: classified.length,
    outputFile: OUT_FILE,
    granularSummary: summarize(classified)
  };

  console.log(JSON.stringify(finalOutput, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
