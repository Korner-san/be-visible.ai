import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/reports/content/categories
 * Returns content structure categorization data for Content page
 */
export async function GET(request: NextRequest) {
  try {
    // Use service client to bypass RLS for aggregation queries
    const supabase = createServiceClient()
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const brandId = searchParams.get('brandId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const selectedModels = searchParams.get('selectedModels')?.split(',') || []

    if (!brandId) {
      return NextResponse.json({ error: 'Brand ID required' }, { status: 400 })
    }

    // Get all prompt results for this brand within date range
    // First get the daily report IDs that match our criteria
    let dailyReportsQuery = supabase
      .from('daily_reports')
      .select('id, report_date')
      .eq('brand_id', brandId)
      .eq('status', 'completed')

    if (from) {
      dailyReportsQuery = dailyReportsQuery.gte('report_date', from)
    }
    if (to) {
      dailyReportsQuery = dailyReportsQuery.lte('report_date', to)
    }

    const { data: dailyReports, error: reportsError } = await dailyReportsQuery

    if (reportsError) {
      console.error('❌ [CONTENT API] Error fetching daily reports:', reportsError)
      return NextResponse.json({ error: reportsError.message }, { status: 500 })
    }

    console.log(`📊 [CONTENT API] Query params:`, { brandId, from, to, selectedModels })
    console.log(`📊 [CONTENT API] Found ${dailyReports?.length || 0} daily reports for date range from=${from} to=${to}`)
    
    if (dailyReports && dailyReports.length > 0) {
      console.log(`📊 [CONTENT API] Report dates:`, dailyReports.map(r => r.report_date))
    }

    // If no daily reports in the date range, return empty instead of falling back
    if (!dailyReports || dailyReports.length === 0) {
      console.log('❌ [CONTENT API] No daily reports found in date range - returning empty')
      return NextResponse.json({ categories: [] })
    }

    // OLD FALLBACK LOGIC REMOVED - it was ignoring date filters!
    // This was causing inconsistent data when selecting specific dates
    if (false) {
      // This block is disabled - kept for reference only
      console.log('❌ [CONTENT API] No daily reports found in date range, trying to get any reports for this brand')
      
      const { data: anyReports, error: anyReportsError } = await supabase
        .from('daily_reports')
        .select('id, report_date')
        .eq('brand_id', brandId)
        .eq('status', 'completed')
        .order('report_date', { ascending: false })
        .limit(10) // Get the most recent 10 reports
      
      // Disabled fallback block
    }

    const dailyReportIds = dailyReports.map(dr => dr.id)

    // Now get prompt results for these daily reports
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        provider,
        created_at,
        daily_report_id
      `)
      .in('daily_report_id', dailyReportIds)
      .in('provider_status', ['ok'])

    if (selectedModels.length > 0) {
      query = query.in('provider', selectedModels)
    }

    const { data: promptResults, error: resultsError } = await query

    if (resultsError) {
      console.error('❌ [CONTENT API] Error fetching prompt results:', resultsError)
      return NextResponse.json({ error: resultsError.message }, { status: 500 })
    }

    console.log(`📊 [CONTENT API] Found ${promptResults?.length || 0} prompt results`)

    if (!promptResults || promptResults.length === 0) {
      console.log('⚠️ [CONTENT API] No prompt results found - this is OK if reports have no data yet')
      return NextResponse.json({ categories: [] })
    }

    // Get URL citations for these prompt results
    const promptResultIds = promptResults.map(r => r.id)
    
    console.log(`📊 [CONTENT API] Fetching citations for ${promptResultIds.length} prompt results`)
    
    // Batch the citations query to avoid "Bad Request" with large arrays
    // Supabase .in() has a limit of ~1000 items, but we'll batch at 500 to be safe
    const BATCH_SIZE = 500
    const allCitations: any[] = []
    
    for (let i = 0; i < promptResultIds.length; i += BATCH_SIZE) {
      const batch = promptResultIds.slice(i, i + BATCH_SIZE)
      console.log(`📊 [CONTENT API] Fetching citations batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(promptResultIds.length / BATCH_SIZE)} (${batch.length} IDs)`)
      
      const { data: batchCitations, error: citationsError } = await supabase
        .from('url_citations')
        .select(`
          id,
          url_id,
          provider,
          prompt_result_id
        `)
        .in('prompt_result_id', batch)

      if (citationsError) {
        console.error(`❌ [CONTENT API] Error fetching citations batch ${Math.floor(i / BATCH_SIZE) + 1}:`, citationsError)
        return NextResponse.json({ error: citationsError.message }, { status: 500 })
      }
      
      if (batchCitations && batchCitations.length > 0) {
        allCitations.push(...batchCitations)
        console.log(`✅ [CONTENT API] Batch ${Math.floor(i / BATCH_SIZE) + 1} returned ${batchCitations.length} citations`)
      }
    }
    
    const citations = allCitations

    console.log(`📊 [CONTENT API] Total citations fetched: ${citations.length}`)

    if (!citations || citations.length === 0) {
      console.log('⚠️ [CONTENT API] No citations found - reports exist but have no URL citations')
      return NextResponse.json({ categories: [] })
    }

    // Get url_inventory and url_content_facts for these citations
    const urlIds = [...new Set(citations.map((c: any) => c.url_id))] // Get unique URL IDs
    
    console.log(`📊 [CONTENT API] Fetching content data for ${urlIds.length} unique URLs`)
    
    // STEP 1: Fetch ALL URL strings from url_inventory (regardless of classification)
    const allUrlInventory: any[] = []
    
    for (let i = 0; i < urlIds.length; i += BATCH_SIZE) {
      const batch = urlIds.slice(i, i + BATCH_SIZE)
      
      const { data: batchInventory, error: inventoryError } = await supabase
        .from('url_inventory')
        .select('id, url, domain')
        .in('id', batch)

      if (inventoryError) {
        console.error(`❌ [CONTENT API] Error fetching url_inventory:`, inventoryError)
        return NextResponse.json({ error: inventoryError.message }, { status: 500 })
      }
      
      if (batchInventory && batchInventory.length > 0) {
        allUrlInventory.push(...batchInventory)
      }
    }
    
    console.log(`📊 [CONTENT API] Fetched ${allUrlInventory.length} URL inventory records`)
    
    // Create a map of url_id to URL strings (for ALL URLs, regardless of classification)
    const urlInventoryMap = new Map()
    allUrlInventory.forEach((inv: any) => {
      urlInventoryMap.set(inv.id, {
        url: inv.url,
        domain: inv.domain
      })
    })
    
    // STEP 2: Fetch URL classification data from url_content_facts
    const allUrlData: any[] = []
    
    for (let i = 0; i < urlIds.length; i += BATCH_SIZE) {
      const batch = urlIds.slice(i, i + BATCH_SIZE)
      console.log(`📊 [CONTENT API] Fetching URL data batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(urlIds.length / BATCH_SIZE)} (${batch.length} IDs)`)
      
      const { data: batchUrlData, error: urlError } = await supabase
        .from('url_content_facts')
        .select(`
          url_id,
          content_structure_category,
          extracted_at
        `)
        .in('url_id', batch)

      if (urlError) {
        console.error(`❌ [CONTENT API] Error fetching URL data batch ${Math.floor(i / BATCH_SIZE) + 1}:`, urlError)
        return NextResponse.json({ error: urlError.message }, { status: 500 })
      }
      
      if (batchUrlData && batchUrlData.length > 0) {
        allUrlData.push(...batchUrlData)
        console.log(`✅ [CONTENT API] Batch ${Math.floor(i / BATCH_SIZE) + 1} returned ${batchUrlData.length} URL records`)
      }
    }
    
    const urlData = allUrlData

    console.log(`✅ [CONTENT API] Found ${urlData.length} URLs with content data from ${dailyReports.length} reports`)
    console.log(`📊 [CONTENT API] Citations count: ${citations.length}, Unique URL IDs: ${urlIds.length}, URLs with content: ${urlData.length}, URL inventory: ${allUrlInventory.length}`)
    
    // DEBUG: Check for duplicate url_ids in urlData
    const urlDataUrlIds = urlData.map((u: any) => u.url_id)
    const uniqueUrlDataIds = new Set(urlDataUrlIds)
    if (urlDataUrlIds.length !== uniqueUrlDataIds.size) {
      console.warn(`⚠️ [CONTENT API] Found ${urlDataUrlIds.length - uniqueUrlDataIds.size} duplicate url_ids in url_content_facts!`)
      console.warn(`⚠️ [CONTENT API] This may cause incorrect unique URL counts`)
    }

    // Create a map of url_id to classification data
    // If there are duplicate url_ids (multiple classifications), use the latest one
    const urlClassificationMap = new Map()
    urlData.forEach((u: any) => {
      // Only add if not already in map, or if this one is newer
      const existing = urlClassificationMap.get(u.url_id)
      if (!existing || (u.extracted_at && existing.extracted_at && u.extracted_at > existing.extracted_at)) {
        urlClassificationMap.set(u.url_id, {
          content_structure_category: u.content_structure_category,
          extracted_at: u.extracted_at
        })
      }
    })
    
    console.log(`📊 [CONTENT API] URL classification map size: ${urlClassificationMap.size} (from ${urlData.length} records)`)
    
    // Build citation timeline for first-cited and classification timing analysis
    const citationTimeline: Record<string, {
      urlId: number
      url: string
      domain: string
      firstCited: Date | null
      classificationTimestamp: string | null
      category: string | null
      wasClassifiedInRange: boolean
      categorySource: string
    }> = {}
    
    citations.forEach((citation: any) => {
      const urlId = citation.url_id
      const inventory = urlInventoryMap.get(urlId)
      const classification = urlClassificationMap.get(urlId)
      
      if (!citationTimeline[urlId]) {
        const classificationDate = classification?.extracted_at ? new Date(classification.extracted_at) : null
        const isInRange = classificationDate && from && to
          ? classificationDate >= new Date(from) && classificationDate <= new Date(to)
          : false
        
        citationTimeline[urlId] = {
          urlId,
          url: inventory?.url || `url_id_${urlId}`,
          domain: inventory?.domain || 'unknown',
          firstCited: null,
          classificationTimestamp: classification?.extracted_at || null,
          category: classification?.content_structure_category || 'UNCLASSIFIED',
          wasClassifiedInRange: isInRange,
          categorySource: classification ? 'url_content_facts' : 'unclassified_default'
        }
      }
      
      // Track first cited date (would need to join with prompt_results to get actual date)
      // For now, we'll mark it as tracked
      const currentFirst = citationTimeline[urlId].firstCited
      // We'd need created_at from prompt_results to populate this accurately
    })
    
    console.log(`📊 [CONTENT API] Citation timeline built for ${Object.keys(citationTimeline).length} URLs`)

    // Aggregate by content structure category
    const categoryStats: Record<string, {
      count: number
      uniqueUrls: Set<string>
      citationDates: Date[]
    }> = {}

    citations.forEach((citation: any) => {
      const urlId = citation.url_id
      const inventory = urlInventoryMap.get(urlId)
      const classification = urlClassificationMap.get(urlId)
      
      // CRITICAL FIX: Use URL string from inventory (available for ALL URLs)
      // Classification is a LABEL, not a FILTER
      const category = classification?.content_structure_category || 'UNCLASSIFIED'
      const url = inventory?.url || `url_id_${urlId}` // Should always have inventory now
      const extractedAt = classification?.extracted_at

      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          uniqueUrls: new Set(),
          citationDates: []
        }
      }

      categoryStats[category].count++
      categoryStats[category].uniqueUrls.add(url) // Always add with real URL string
      if (extractedAt) categoryStats[category].citationDates.push(new Date(extractedAt))
    })

    // Calculate total citations
    const totalCitations = Object.values(categoryStats).reduce((sum, stats) => sum + stats.count, 0)

    console.log(`📊 [CONTENT API] Processing ${Object.keys(categoryStats).length} categories:`, Object.keys(categoryStats))
    console.log(`📊 [CONTENT API] Category stats:`, Object.entries(categoryStats).map(([cat, stats]) => ({
      category: cat,
      totalScans: stats.count,
      uniqueUrls: stats.uniqueUrls.size
    })))
    
    // VERIFICATION: Count citations that were skipped due to missing classification
    const citationsWithClassification = Object.values(categoryStats).reduce((sum, stats) => sum + stats.count, 0)
    const skippedCitations = citations.length - citationsWithClassification
    console.log(`🔍 [VERIFICATION] Citations: ${citations.length}, With classification: ${citationsWithClassification}, Skipped: ${skippedCitations}`)
    console.log(`🔍 [VERIFICATION] Distinct citation url_ids: ${urlIds.length}`)
    console.log(`🔍 [VERIFICATION] url_ids with content_facts: ${urlClassificationMap.size}`)
    console.log(`🔍 [VERIFICATION] Missing content_facts: ${urlIds.length - urlClassificationMap.size}`)

    // Collect basic diagnostic metrics
    const diagnostics = {
      totalCitationsRetrieved: citations.length,
      distinctUrlsCited: urlIds.length,
      urlsWithClassification: urlClassificationMap.size,
      urlsWithoutClassification: urlIds.length - urlClassificationMap.size,
      skippedCitations: 0, // Will be calculated based on UNCLASSIFIED handling
      includedCitations: citations.length // All citations are included now (even UNCLASSIFIED)
    }

    // Count citations that were assigned UNCLASSIFIED (these are the ones without classification)
    const unclassifiedStats = categoryStats['UNCLASSIFIED']
    if (unclassifiedStats) {
      diagnostics.skippedCitations = unclassifiedStats.count
    }

    console.log(`🔍 [DIAGNOSTICS]`, diagnostics)
    
    // Collect expanded diagnostic data (first 50 URLs with detailed timeline)
    const urlDetailsList = Object.values(citationTimeline)
      .slice(0, 50)
      .map(detail => ({
        urlId: detail.urlId,
        url: detail.url,
        domain: detail.domain,
        category: detail.category,
        classificationTimestamp: detail.classificationTimestamp,
        wasClassifiedInRange: detail.wasClassifiedInRange,
        categorySource: detail.categorySource
      }))
    
    // Group URLs by domain for summary view
    const domainGroups: Record<string, number> = {}
    Object.values(citationTimeline).forEach(detail => {
      domainGroups[detail.domain] = (domainGroups[detail.domain] || 0) + 1
    })
    
    const expandedDiagnostics = {
      urlDetails: urlDetailsList,
      domainGroups: Object.entries(domainGroups)
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20), // Top 20 domains
      dateRangeUsed: { from, to },
      classificationInRangeCount: Object.values(citationTimeline)
        .filter(d => d.wasClassifiedInRange).length,
      classificationOutsideRangeCount: Object.values(citationTimeline)
        .filter(d => !d.wasClassifiedInRange && d.category !== 'UNCLASSIFIED').length
    }
    
    console.log(`🔍 [EXPANDED DIAGNOSTICS] URL details: ${urlDetailsList.length}, Domain groups: ${Object.keys(domainGroups).length}`)

    // Format response
    const categories = Object.entries(categoryStats).map(([category, stats]) => {
      const uniqueUrls = stats.uniqueUrls.size
      const totalScans = stats.count // Total citation count (includes duplicates)
      const percentage = totalCitations > 0 ? ((stats.count / totalCitations) * 100).toFixed(1) : '0'
      
      // Calculate average citation longevity (days since first citation)
      let avgLongevity = 0
      if (stats.citationDates.length > 0) {
        const oldestDate = new Date(Math.min(...stats.citationDates.map(d => d.getTime())))
        const now = new Date()
        avgLongevity = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
      }

      return {
        category,
        count: uniqueUrls,
        totalScans, // NEW: Total number of URL scans in date range
        percentage: parseFloat(percentage),
        primaryIntent: 'N/A', // No longer available
        avgCitationLongevity: avgLongevity
      }
    }).sort((a, b) => b.percentage - a.percentage)

    return NextResponse.json({ 
      categories, 
      diagnostics,
      expandedDiagnostics 
    })

  } catch (error: any) {
    console.error('Error in content categories API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

