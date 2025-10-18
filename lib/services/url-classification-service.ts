/**
 * URL Classification Service
 * Handles URL extraction, Tavily content extraction, and ChatGPT classification
 */

import { createServiceClient } from '@/lib/supabase/service'
import { extractUrlContentBatch, extractDomain, normalizeUrl } from '@/lib/providers/tavily'
import { classifyUrlContentBatch } from '@/lib/classifiers/content-classifier'

interface PromptResult {
  id: string
  brand_prompt_id: string
  prompt_text: string
  provider: string
  citations?: any[]
  google_ai_overview_citations?: any[]
}

/**
 * Extract all unique URLs from prompt results
 */
const extractUrlsFromResults = (results: PromptResult[]): string[] => {
  const urlSet = new Set<string>()
  
  results.forEach(result => {
    // Extract from Perplexity citations
    if (result.citations && Array.isArray(result.citations)) {
      result.citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
    
    // Extract from Google AI Overview citations
    if (result.google_ai_overview_citations && Array.isArray(result.google_ai_overview_citations)) {
      result.google_ai_overview_citations.forEach((citation: any) => {
        if (citation.url) urlSet.add(citation.url)
      })
    }
  })
  
  return Array.from(urlSet)
}

/**
 * Process URLs for a daily report:
 * 1. Extract URLs from all prompt results
 * 2. Check which URLs are new
 * 3. Extract content from new URLs using Tavily
 * 4. Classify content using ChatGPT
 * 5. Store everything in database
 */
export const processUrlsForDailyReport = async (
  dailyReportId: string
): Promise<{
  totalUrls: number
  newUrls: number
  extractedUrls: number
  classifiedUrls: number
}> => {
  console.log(`🔍 [URL PROCESSOR] Starting URL processing for daily report ${dailyReportId}`)
  
  const supabase = createServiceClient()
  
  try {
    // Step 1: Get all prompt results for this daily report
    const { data: promptResults, error: resultsError } = await supabase
      .from('prompt_results')
      .select('id, brand_prompt_id, prompt_text, provider, citations, google_ai_overview_citations')
      .eq('daily_report_id', dailyReportId)
      .in('provider_status', ['ok'])
    
    if (resultsError) {
      console.error('❌ [URL PROCESSOR] Error fetching prompt results:', resultsError)
      return { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0 }
    }
    
    if (!promptResults || promptResults.length === 0) {
      console.log('ℹ️ [URL PROCESSOR] No prompt results found')
      return { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0 }
    }
    
    // Step 2: Extract all unique URLs
    const allUrls = extractUrlsFromResults(promptResults)
    console.log(`📊 [URL PROCESSOR] Found ${allUrls.length} unique URLs`)
    
    if (allUrls.length === 0) {
      return { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0 }
    }
    
    // Step 3: Check which URLs already exist in url_inventory and their content status
    const { data: existingUrls, error: existingError } = await supabase
      .from('url_inventory')
      .select(`
        url, 
        id, 
        content_extracted,
        url_content_facts!left(content_structure_category)
      `)
      .in('url', allUrls)
    
    if (existingError) {
      console.error('❌ [URL PROCESSOR] Error checking existing URLs:', existingError)
    }
    
    const existingUrlMap = new Map(
      (existingUrls || []).map(u => [u.url, { 
        id: u.id, 
        content_extracted: u.content_extracted,
        has_categorization: u.url_content_facts && u.url_content_facts.length > 0 && u.url_content_facts[0].content_structure_category
      }])
    )
    
    // Step 4: Identify new URLs and URLs needing processing
    const newUrls = allUrls.filter(url => !existingUrlMap.has(url))
    const urlsNeedingProcessing = allUrls.filter(url => {
      const existing = existingUrlMap.get(url)
      if (!existing) return true // New URL
      if (!existing.content_extracted) return true // Missing content extraction
      if (!existing.has_categorization) return true // Missing content categorization
      return false // Has both content extraction and categorization
    })
    
    console.log(`📊 [URL PROCESSOR] New URLs: ${newUrls.length}, Need processing: ${urlsNeedingProcessing.length}`)
    
    // Step 5: Insert new URLs into url_inventory
    if (newUrls.length > 0) {
      const urlInventoryRecords = newUrls.map(url => ({
        url,
        normalized_url: normalizeUrl(url),
        domain: extractDomain(url),
        content_extracted: false
      }))
      
      const { data: insertedUrls, error: insertError } = await supabase
        .from('url_inventory')
        .upsert(urlInventoryRecords, { onConflict: 'url' })
        .select('id, url')
      
      if (insertError) {
        console.error('❌ [URL PROCESSOR] Error inserting URLs:', insertError)
      } else {
        console.log(`✅ [URL PROCESSOR] Inserted ${insertedUrls?.length || 0} new URLs`)
        
        // Update existingUrlMap with newly inserted URLs
        insertedUrls?.forEach(u => {
          existingUrlMap.set(u.url, { id: u.id, content_extracted: false })
        })
      }
    }
    
    // Step 6: Create url_citations records (link URLs to prompt results)
    const citationRecords: any[] = []
    promptResults.forEach(result => {
      const citations = result.citations || result.google_ai_overview_citations || []
      citations.forEach((citation: any) => {
        if (citation.url && existingUrlMap.has(citation.url)) {
          citationRecords.push({
            url_id: existingUrlMap.get(citation.url)!.id,
            prompt_result_id: result.id,
            provider: result.provider
          })
        }
      })
    })
    
    if (citationRecords.length > 0) {
      const { error: citationError } = await supabase
        .from('url_citations')
        .upsert(citationRecords, { onConflict: 'url_id,prompt_result_id,provider' })
      
      if (citationError) {
        console.error('❌ [URL PROCESSOR] Error inserting citations:', citationError)
      } else {
        console.log(`✅ [URL PROCESSOR] Inserted ${citationRecords.length} citation records`)
      }
    }
    
    // Step 7: Extract content from ALL URLs needing processing
    const urlsToExtract = urlsNeedingProcessing // Process ALL URLs that need content extraction or categorization
    
    if (urlsToExtract.length === 0) {
      console.log('ℹ️ [URL PROCESSOR] No URLs need content extraction')
      return {
        totalUrls: allUrls.length,
        newUrls: newUrls.length,
        extractedUrls: 0,
        classifiedUrls: 0
      }
    }
    
    console.log(`🔍 [URL PROCESSOR] Extracting content from ${urlsToExtract.length} URLs using Tavily (batches of 20)...`)
    const extractedContent = await extractUrlContentBatch(urlsToExtract)
    
    // Filter successful extractions
    const successfulExtractions = extractedContent.filter(e => !e.failed && e.raw_content)
    console.log(`✅ [URL PROCESSOR] Successfully extracted ${successfulExtractions.length}/${urlsToExtract.length} URLs`)
    
    if (successfulExtractions.length === 0) {
      return {
        totalUrls: allUrls.length,
        newUrls: newUrls.length,
        extractedUrls: 0,
        classifiedUrls: 0
      }
    }
    
    // Step 8: Classify content using ChatGPT
    console.log(`🤖 [URL PROCESSOR] Classifying ${successfulExtractions.length} URLs using ChatGPT...`)
    const classificationsInput = successfulExtractions.map(e => ({
      url: e.url,
      title: e.title || '',
      description: e.content || '',
      contentSnippet: e.raw_content || e.content || ''
    }))
    
    const classifications = await classifyUrlContentBatch(classificationsInput)
    console.log(`✅ [URL PROCESSOR] Classified ${classifications.length} URLs`)
    
    // Step 9: Store content and classifications
    const contentFactsRecords = successfulExtractions.map((extraction, index) => {
      const classification = classifications[index]
      const urlId = existingUrlMap.get(extraction.url)?.id
      
      if (!urlId) return null
      
      return {
        url_id: urlId,
        title: extraction.title || '',
        description: extraction.content || '',
        raw_content: extraction.raw_content || extraction.content || '',
        content_snippet: (extraction.raw_content || extraction.content || '').substring(0, 2000),
        content_structure_category: classification?.content_structure_category || 'OFFICIAL_DOCUMENTATION',
        classification_confidence: 0.8,
        classifier_version: 'v1'
      }
    }).filter(Boolean)
    
    if (contentFactsRecords.length > 0) {
      const { error: factsError } = await supabase
        .from('url_content_facts')
        .upsert(contentFactsRecords, { onConflict: 'url_id' })
      
      if (factsError) {
        console.error('❌ [URL PROCESSOR] Error inserting content facts:', factsError)
      } else {
        console.log(`✅ [URL PROCESSOR] Stored ${contentFactsRecords.length} content facts`)
      }
    }
    
    // Step 10: Mark URLs as content_extracted
    const extractedUrlIds = successfulExtractions
      .map(e => existingUrlMap.get(e.url)?.id)
      .filter(Boolean)
    
    if (extractedUrlIds.length > 0) {
      const { error: updateError } = await supabase
        .from('url_inventory')
        .update({ 
          content_extracted: true,
          content_extracted_at: new Date().toISOString()
        })
        .in('id', extractedUrlIds)
      
      if (updateError) {
        console.error('❌ [URL PROCESSOR] Error updating content_extracted:', updateError)
      }
    }
    
    const result = {
      totalUrls: allUrls.length,
      newUrls: newUrls.length,
      extractedUrls: successfulExtractions.length,
      classifiedUrls: classifications.length
    }
    
    // Update daily_reports with URL processing statistics and mark as complete
    await supabase
      .from('daily_reports')
      .update({
        urls_total: result.totalUrls,
        urls_extracted: result.extractedUrls,
        urls_classified: result.classifiedUrls,
        url_processing_status: 'complete'
      })
      .eq('id', dailyReportId)
    
    console.log(`✅ [URL PROCESSOR] URL processing complete for daily report ${dailyReportId}`)
    
    // Step 11: Process domain homepages for cited domains
    console.log(`🌐 [URL PROCESSOR] Starting domain homepage processing...`)
    const domainHomepageStats = await processDomainHomepages(dailyReportId, supabase)
    console.log(`✅ [URL PROCESSOR] Domain homepage processing complete:`, domainHomepageStats)
    
    return {
      ...result,
      domainHomepagesProcessed: domainHomepageStats.processed,
      domainHomepagesCategorized: domainHomepageStats.categorized
    }
    
  } catch (error: any) {
    console.error('❌ [URL PROCESSOR] Fatal error:', error)
    
    // Mark URL processing as failed
    await supabase
      .from('daily_reports')
      .update({ url_processing_status: 'failed' })
      .eq('id', dailyReportId)
    
    return { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0 }
  }
}

/**
 * Process domain homepages for all cited domains in a daily report
 */
const processDomainHomepages = async (
  dailyReportId: string,
  supabase: any
): Promise<{
  processed: number
  categorized: number
}> => {
  try {
    // Step 1: Get all unique domains from cited URLs
    const { data: promptResults, error: resultsError } = await supabase
      .from('prompt_results')
      .select('citations, google_ai_overview_citations')
      .eq('daily_report_id', dailyReportId)
      .in('provider_status', ['ok'])
    
    if (resultsError) {
      console.error('❌ [DOMAIN HOMEPAGE PROCESSOR] Error fetching prompt results:', resultsError)
      return { processed: 0, categorized: 0 }
    }
    
    if (!promptResults || promptResults.length === 0) {
      console.log('ℹ️ [DOMAIN HOMEPAGE PROCESSOR] No prompt results found')
      return { processed: 0, categorized: 0 }
    }
    
    // Extract all unique domains from citations
    const domainSet = new Set<string>()
    promptResults.forEach(result => {
      // Extract from Perplexity citations
      if (result.citations && Array.isArray(result.citations)) {
        result.citations.forEach((citation: any) => {
          if (citation.url) {
            const domain = extractDomain(citation.url)
            if (domain) domainSet.add(domain)
          }
        })
      }
      
      // Extract from Google AI Overview citations
      if (result.google_ai_overview_citations && Array.isArray(result.google_ai_overview_citations)) {
        result.google_ai_overview_citations.forEach((citation: any) => {
          if (citation.url) {
            const domain = extractDomain(citation.url)
            if (domain) domainSet.add(domain)
          }
        })
      }
    })
    
    const uniqueDomains = Array.from(domainSet)
    console.log(`🌐 [DOMAIN HOMEPAGE PROCESSOR] Found ${uniqueDomains.length} unique domains:`, uniqueDomains)
    
    if (uniqueDomains.length === 0) {
      return { processed: 0, categorized: 0 }
    }
    
    // Step 2: Generate homepage URLs and check their status
    const homepageUrls = uniqueDomains.map(domain => `https://${domain}`)
    
    const { data: existingHomepages, error: existingError } = await supabase
      .from('url_inventory')
      .select(`
        url, 
        id, 
        content_extracted,
        url_content_facts!left(content_structure_category)
      `)
      .in('url', homepageUrls)
    
    if (existingError) {
      console.error('❌ [DOMAIN HOMEPAGE PROCESSOR] Error checking existing homepages:', existingError)
      return { processed: 0, categorized: 0 }
    }
    
    const existingHomepageMap = new Map(
      (existingHomepages || []).map(h => [h.url, { 
        id: h.id, 
        content_extracted: h.content_extracted,
        has_categorization: h.url_content_facts && h.url_content_facts.length > 0 && h.url_content_facts[0].content_structure_category
      }])
    )
    
    // Step 3: Identify homepages needing processing
    const newHomepages = homepageUrls.filter(url => !existingHomepageMap.has(url))
    const homepagesNeedingProcessing = homepageUrls.filter(url => {
      const existing = existingHomepageMap.get(url)
      if (!existing) return true // New homepage
      if (!existing.content_extracted) return true // Missing content extraction
      if (!existing.has_categorization) return true // Missing content categorization
      return false // Has both content extraction and categorization
    })
    
    console.log(`🌐 [DOMAIN HOMEPAGE PROCESSOR] New homepages: ${newHomepages.length}, Need processing: ${homepagesNeedingProcessing.length}`)
    
    // Step 4: Insert new homepages into url_inventory
    if (newHomepages.length > 0) {
      const homepageInventoryRecords = newHomepages.map(url => ({
        url,
        normalized_url: normalizeUrl(url),
        domain: extractDomain(url),
        content_extracted: false
      }))
      
      const { data: insertedHomepages, error: insertError } = await supabase
        .from('url_inventory')
        .upsert(homepageInventoryRecords, { onConflict: 'url' })
        .select('id, url')
      
      if (insertError) {
        console.error('❌ [DOMAIN HOMEPAGE PROCESSOR] Error inserting homepages:', insertError)
      } else {
        console.log(`✅ [DOMAIN HOMEPAGE PROCESSOR] Inserted ${insertedHomepages?.length || 0} new homepages`)
        
        // Update existingHomepageMap with newly inserted homepages
        insertedHomepages?.forEach(h => {
          existingHomepageMap.set(h.url, { id: h.id, content_extracted: false, has_categorization: false })
        })
      }
    }
    
    // Step 5: Process homepages that need content extraction or categorization
    if (homepagesNeedingProcessing.length === 0) {
      console.log('ℹ️ [DOMAIN HOMEPAGE PROCESSOR] No homepages need processing')
      return { processed: 0, categorized: 0 }
    }
    
    console.log(`🔍 [DOMAIN HOMEPAGE PROCESSOR] Processing ${homepagesNeedingProcessing.length} homepages using Tavily...`)
    const extractedContent = await extractUrlContentBatch(homepagesNeedingProcessing)
    
    // Filter successful extractions
    const successfulExtractions = extractedContent.filter(e => !e.failed && e.raw_content)
    console.log(`✅ [DOMAIN HOMEPAGE PROCESSOR] Successfully extracted ${successfulExtractions.length}/${homepagesNeedingProcessing.length} homepages`)
    
    if (successfulExtractions.length === 0) {
      return { processed: 0, categorized: 0 }
    }
    
    // Step 6: Classify homepage content using ChatGPT
    console.log(`🤖 [DOMAIN HOMEPAGE PROCESSOR] Classifying ${successfulExtractions.length} homepages using ChatGPT...`)
    const classificationsInput = successfulExtractions.map(e => ({
      url: e.url,
      title: e.title || '',
      description: e.content || '',
      contentSnippet: e.raw_content || e.content || ''
    }))
    
    const classifications = await classifyUrlContentBatch(classificationsInput)
    console.log(`✅ [DOMAIN HOMEPAGE PROCESSOR] Classified ${classifications.length} homepages`)
    
    // Step 7: Store homepage content and classifications
    const homepageContentFactsRecords = successfulExtractions.map((extraction, index) => {
      const classification = classifications[index]
      const homepageId = existingHomepageMap.get(extraction.url)?.id
      
      if (!homepageId) return null
      
      return {
        url_id: homepageId,
        title: extraction.title || '',
        description: extraction.content || '',
        raw_content: extraction.raw_content || extraction.content || '',
        content_snippet: (extraction.raw_content || extraction.content || '').substring(0, 2000),
        content_structure_category: classification?.content_structure_category || 'OFFICIAL_DOCUMENTATION',
        classification_confidence: 0.8,
        classifier_version: 'v1'
      }
    }).filter(Boolean)
    
    if (homepageContentFactsRecords.length > 0) {
      const { error: contentFactsError } = await supabase
        .from('url_content_facts')
        .upsert(homepageContentFactsRecords, { onConflict: 'url_id' })
      
      if (contentFactsError) {
        console.error('❌ [DOMAIN HOMEPAGE PROCESSOR] Error storing content facts:', contentFactsError)
      } else {
        console.log(`✅ [DOMAIN HOMEPAGE PROCESSOR] Stored ${homepageContentFactsRecords.length} homepage content facts`)
      }
    }
    
    // Step 8: Mark homepages as content_extracted
    const extractedHomepageIds = successfulExtractions
      .map(e => existingHomepageMap.get(e.url)?.id)
      .filter(Boolean)
    
    if (extractedHomepageIds.length > 0) {
      const { error: updateError } = await supabase
        .from('url_inventory')
        .update({ 
          content_extracted: true,
          content_extracted_at: new Date().toISOString()
        })
        .in('id', extractedHomepageIds)
      
      if (updateError) {
        console.error('❌ [DOMAIN HOMEPAGE PROCESSOR] Error updating content_extracted:', updateError)
      }
    }
    
    return {
      processed: successfulExtractions.length,
      categorized: classifications.length
    }
    
  } catch (error: any) {
    console.error('❌ [DOMAIN HOMEPAGE PROCESSOR] Fatal error:', error)
    return { processed: 0, categorized: 0 }
  }
}


