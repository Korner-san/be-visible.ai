// @ts-nocheck
/**
 * Re-classification Script (v2)
 *
 * Re-classifies existing url_content_facts rows using the improved v2 classifier.
 * Uses stored raw_content — no Tavily re-extraction needed.
 *
 * Usage:
 *   cd worker && npx ts-node src/scripts/reclassify-urls.ts [--brand <brand_id>] [--all] [--dry-run]
 *
 * Options:
 *   --brand <id>   Only reclassify URLs associated with a specific brand
 *   --all          Reclassify ALL v1 rows, not just OTHER_LOW_CONFIDENCE/NULL
 *   --dry-run      Show what would change without writing to DB
 */

import 'dotenv/config'
import { createServiceClient } from '../lib/supabase-client'
import { classifyUrlContentBatch } from '../lib/classifiers/content-classifier'

interface ContentFactRow {
  id: string
  url_id: string
  title: string
  description: string
  raw_content: string
  content_structure_category: string | null
  classifier_version: string | null
  url_inventory: {
    url: string
  }
}

async function main() {
  const args = process.argv.slice(2)
  const brandId = args.includes('--brand') ? args[args.indexOf('--brand') + 1] : null
  const reclassifyAll = args.includes('--all')
  const dryRun = args.includes('--dry-run')

  console.log('=== URL Re-classification Script (v1 → v2) ===')
  console.log(`  Brand filter: ${brandId || 'none (all brands)'}`)
  console.log(`  Mode: ${reclassifyAll ? 'ALL v1 rows' : 'Only OTHER_LOW_CONFIDENCE / NULL / v1'}`)
  console.log(`  Dry run: ${dryRun}`)
  console.log('')

  const supabase = createServiceClient()

  // Build query for rows needing reclassification
  let query = supabase
    .from('url_content_facts')
    .select('id, url_id, title, description, raw_content, content_structure_category, classifier_version, url_inventory!inner(url)')

  if (reclassifyAll) {
    // Re-classify everything that's not already v2
    query = query.or('classifier_version.is.null,classifier_version.neq.v2')
  } else {
    // Only re-classify OTHER_LOW_CONFIDENCE, NULL categories, or v1 rows
    query = query.or('content_structure_category.is.null,content_structure_category.eq.OTHER_LOW_CONFIDENCE,classifier_version.is.null,classifier_version.eq.v1')
  }

  // If brand filter, join through url_citations → prompt_results → brand_prompts
  // For simplicity, we'll fetch all matching rows and filter if brand is specified
  const { data: rows, error } = await query

  if (error) {
    console.error('❌ Failed to fetch url_content_facts:', error)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('✅ No rows need reclassification.')
    process.exit(0)
  }

  const contentFacts = rows as unknown as ContentFactRow[]

  // If brand filter is provided, we need to filter by brand
  let filteredFacts = contentFacts
  if (brandId) {
    // Get url_ids associated with this brand through url_citations → prompt_results → brand_prompts
    const { data: brandUrlIds, error: brandError } = await supabase
      .from('url_citations')
      .select('url_id, prompt_results!inner(brand_prompts!inner(brand_id))')
      .eq('prompt_results.brand_prompts.brand_id', brandId)

    if (brandError) {
      console.error('❌ Failed to filter by brand:', brandError)
      process.exit(1)
    }

    const brandUrlIdSet = new Set((brandUrlIds || []).map((r: any) => r.url_id))
    filteredFacts = contentFacts.filter(f => brandUrlIdSet.has(f.url_id))
  }

  console.log(`📊 Found ${filteredFacts.length} rows to reclassify`)

  // Track category distribution before/after
  const beforeDistribution: Record<string, number> = {}
  const afterDistribution: Record<string, number> = {}

  filteredFacts.forEach(f => {
    const cat = f.content_structure_category || 'NULL'
    beforeDistribution[cat] = (beforeDistribution[cat] || 0) + 1
  })

  console.log('\n📊 BEFORE distribution:')
  Object.entries(beforeDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))

  // Prepare classification inputs
  const classificationInputs = filteredFacts.map(f => ({
    url: f.url_inventory.url,
    title: f.title || '',
    description: f.description || '',
    contentSnippet: f.raw_content || f.description || ''
  }))

  // Run v2 classifier
  console.log(`\n🤖 Running v2 classifier on ${classificationInputs.length} URLs...`)
  const classifications = await classifyUrlContentBatch(classificationInputs)

  // Build update records
  const updates: { id: string; category: string; confidence: number }[] = []
  filteredFacts.forEach((fact, index) => {
    const newClassification = classifications[index]
    if (!newClassification) return

    const newCategory = newClassification.content_structure_category
    const confidence = newClassification.confidence

    afterDistribution[newCategory] = (afterDistribution[newCategory] || 0) + 1
    updates.push({ id: fact.id, category: newCategory, confidence })
  })

  console.log('\n📊 AFTER distribution:')
  Object.entries(afterDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))

  // Show changes summary
  const changed = filteredFacts.filter((f, i) => {
    const newCat = classifications[i]?.content_structure_category
    return newCat && newCat !== (f.content_structure_category || 'NULL')
  }).length
  console.log(`\n📊 Changed: ${changed}/${filteredFacts.length} URLs got a new category`)

  if (dryRun) {
    console.log('\n🔍 DRY RUN — no database changes made.')
    // Show first 20 changes
    let shown = 0
    filteredFacts.forEach((f, i) => {
      const newCat = classifications[i]?.content_structure_category
      if (newCat && newCat !== (f.content_structure_category || 'NULL') && shown < 20) {
        console.log(`  ${f.url_inventory.url}`)
        console.log(`    ${f.content_structure_category || 'NULL'} → ${newCat} (${classifications[i].confidence.toFixed(2)})`)
        shown++
      }
    })
    if (changed > 20) console.log(`  ... and ${changed - 20} more`)
    process.exit(0)
  }

  // Write updates to database in batches
  console.log(`\n💾 Writing ${updates.length} updates to database...`)
  const batchSize = 50
  let written = 0

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)

    // Supabase doesn't support bulk update with different values per row,
    // so we update one at a time (or use upsert with id)
    for (const update of batch) {
      const { error: updateError } = await supabase
        .from('url_content_facts')
        .update({
          content_structure_category: update.category,
          classification_confidence: update.confidence,
          classifier_version: 'v2'
        })
        .eq('id', update.id)

      if (updateError) {
        console.error(`  ❌ Failed to update ${update.id}:`, updateError)
      } else {
        written++
      }
    }

    console.log(`  ✅ Updated ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
  }

  console.log(`\n✅ Re-classification complete. Updated ${written}/${updates.length} rows.`)
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
