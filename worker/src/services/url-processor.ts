/**
 * URL Processing Service
 * Handles URL extraction, content fetching, and classification
 * Built with resilience - individual URL failures won't fail the entire job
 */

import { createServiceClient } from '../lib/supabase-client'
import { extractUrlContentBatch, extractDomain, normalizeUrl } from '../lib/providers/tavily'
import { classifyUrlContentBatch } from '../lib/classifiers/content-classifier'

interface UrlProcessingResult {
  totalUrls: number
  newUrls: number
  extractedUrls: number
  classifiedUrls: number
  errors: number
}

/**
 * Extract all unique URLs from prompt results
 */
const extractUrlsFromResults = (results: any[]): string[] => {
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
 * Process URLs for a daily report with enhanced error resilience
 */
export const processUrlsForReport = async (
  dailyReportId: string
): Promise<UrlProcessingResult> => {
  console.log(`🔍 [URL PROCESSOR] Starting URL processing for daily report ${dailyReportId}`)
  
  const supabase = createServiceClient()
  
  try {
    // Mark URL processing as started
    await supabase
      .from('daily_reports')
      .update({ url_processing_status: 'running' })
      .eq('id', dailyReportId)
    
    // Step 1: Get all prompt results for this daily report
    const { data: promptResults, error: resultsError } = await supabase
      .from('prompt_results')
      .select('id, brand_prompt_id, prompt_text, provider, citations, google_ai_overview_citations')
      .eq('daily_report_id', dailyReportId)
      .in('provider_status', ['ok'])
    
    if (resultsError) {
      console.error('❌ [URL PROCESSOR] Error fetching prompt results:', resultsError)
      throw new Error(`Failed to fetch prompt results: ${resultsError.message}`)
    }
    
    if (!promptResults || promptResults.length === 0) {
      console.log('ℹ️ [URL PROCESSOR] No prompt results found')
      await markUrlProcessingComplete(dailyReportId, { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0, errors: 0 })
      return { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0, errors: 0 }
    }
    
    // Step 2: Extract all unique URLs
    const allUrls = extractUrlsFromResults(promptResults)
    console.log(`📊 [URL PROCESSOR] Found ${allUrls.length} unique URLs`)
    
    if (allUrls.length === 0) {
      await markUrlProcessingComplete(dailyReportId, { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0, errors: 0 })
      return { totalUrls: 0, newUrls: 0, extractedUrls: 0, classifiedUrls: 0, errors: 0 }
    }
    
    // Step 3: Check which URLs already exist
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
      // Continue anyway, treat all URLs as new
    }
    
    const existingUrlMap = new Map(
      (existingUrls || []).map(u => [u.url, { 
        id: u.id, 
        content_extracted: u.content_extracted,
        has_categorization: u.url_content_facts && u.url_content_facts.length > 0 && u.url_content_facts[0].content_structure_category
      }])
    )
    
    // Step 4: Identify URLs needing processing
    const newUrls = allUrls.filter(url => !existingUrlMap.has(url))
    const urlsNeedingProcessing = allUrls.filter(url => {
      const existing = existingUrlMap.get(url)
      if (!existing) return true
      if (!existing.content_extracted) return true
      if (!existing.has_categorization) return true
      return false
    })
    
    console.log(`📊 [URL PROCESSOR] New URLs: ${newUrls.length}, Need processing: ${urlsNeedingProcessing.length}`)
    
    // Step 5: Insert new URLs (with error resilience)
    if (newUrls.length > 0) {
      const urlInventoryRecords = newUrls.map(url => ({
        url,
        normalized_url: normalizeUrl(url),
        domain: extractDomain(url),
        content_extracted: false
      }))
      
      try {
        const { data: insertedUrls, error: insertError } = await supabase
          .from('url_inventory')
          .upsert(urlInventoryRecords, { onConflict: 'url' })
          .select('id, url')
        
        if (insertError) {
          console.error('❌ [URL PROCESSOR] Error inserting URLs:', insertError)
        } else {
          console.log(`✅ [URL PROCESSOR] Inserted ${insertedUrls?.length || 0} new URLs`)
          
          // Update existingUrlMap
          insertedUrls?.forEach(u => {
            existingUrlMap.set(u.url, { id: u.id, content_extracted: false, has_categorization: false })
          })
        }
      } catch (error) {
        console.error('❌ [URL PROCESSOR] Error during URL insertion:', error)
        // Continue anyway
      }
    }
    
    // Step 6: Create url_citations records (with error resilience)
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
      try {
        const { error: citationError } = await supabase
          .from('url_citations')
          .upsert(citationRecords, { onConflict: 'url_id,prompt_result_id,provider' })
        
        if (citationError) {
          console.error('❌ [URL PROCESSOR] Error inserting citations:', citationError)
        } else {
          console.log(`✅ [URL PROCESSOR] Inserted ${citationRecords.length} citation records`)
        }
      } catch (error) {
        console.error('❌ [URL PROCESSOR] Error during citation insertion:', error)
      }
    }
    
    // Step 7: Extract content from URLs needing processing (with resilience)
    if (urlsNeedingProcessing.length === 0) {
      console.log('ℹ️ [URL PROCESSOR] No URLs need content extraction')
      await markUrlProcessingComplete(dailyReportId, {
        totalUrls: allUrls.length,
        newUrls: newUrls.length,
        extractedUrls: 0,
        classifiedUrls: 0,
        errors: 0
      })
      return {
        totalUrls: allUrls.length,
        newUrls: newUrls.length,
        extractedUrls: 0,
        classifiedUrls: 0,
        errors: 0
      }
    }
    
    console.log(`🔍 [URL PROCESSOR] Extracting content from ${urlsNeedingProcessing.length} URLs using Tavily (batches of 20)...`)
    
    let extractedContent: any[] = []
    try {
      extractedContent = await extractUrlContentBatch(urlsNeedingProcessing)
    } catch (error) {
      console.error('❌ [URL PROCESSOR] Error during batch extraction:', error)
      // Mark as failed but don't throw - we'll continue with empty results
      await supabase
        .from('daily_reports')
        .update({ 
          url_processing_status: 'failed',
          urls_total: allUrls.length,
          urls_extracted: 0,
          urls_classified: 0
        })
        .eq('id', dailyReportId)
      
      return {
        totalUrls: allUrls.length,
        newUrls: newUrls.length,
        extractedUrls: 0,
        classifiedUrls: 0,
        errors: urlsNeedingProcessing.length
      }
    }
    
    // Filter successful extractions
    const successfulExtractions = extractedContent.filter(e => !e.failed && e.raw_content)
    const failedExtractions = extractedContent.length - successfulExtractions.length
    console.log(`✅ [URL PROCESSOR] Successfully extracted ${successfulExtractions.length}/${urlsNeedingProcessing.length} URLs (${failedExtractions} failed)`)
    
    if (successfulExtractions.length === 0) {
      console.warn('⚠️ [URL PROCESSOR] No successful extractions, marking as failed')
      await supabase
        .from('daily_reports')
        .update({ 
          url_processing_status: 'failed',
          urls_total: allUrls.length,
          urls_extracted: 0,
          urls_classified: 0
        })
        .eq('id', dailyReportId)
      
      return {
        totalUrls: allUrls.length,
        newUrls: newUrls.length,
        extractedUrls: 0,
        classifiedUrls: 0,
        errors: urlsNeedingProcessing.length
      }
    }
    
    // Step 8: Classify content using ChatGPT (with resilience)
    console.log(`🤖 [URL PROCESSOR] Classifying ${successfulExtractions.length} URLs using ChatGPT...`)
    const classificationsInput = successfulExtractions.map(e => ({
      url: e.url,
      title: e.title || '',
      description: e.content || '',
      contentSnippet: e.raw_content || e.content || ''
    }))
    
    let classifications: any[] = []
    try {
      classifications = await classifyUrlContentBatch(classificationsInput)
      console.log(`✅ [URL PROCESSOR] Classified ${classifications.length} URLs`)
    } catch (error) {
      console.error('❌ [URL PROCESSOR] Error during classification:', error)
      // Continue with empty classifications - we'll use defaults
      classifications = classificationsInput.map(() => ({ content_structure_category: 'OFFICIAL_DOCUMENTATION' }))
    }
    
    // Step 9: Store content and classifications (with resilience)
    const contentFactsRecords = successfulExtractions.map((extraction, index) => {
      const classification = classifications[index] || { content_structure_category: 'OFFICIAL_DOCUMENTATION' }
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
    
    let storedCount = 0
    if (contentFactsRecords.length > 0) {
      try {
        const { error: factsError } = await supabase
          .from('url_content_facts')
          .upsert(contentFactsRecords, { onConflict: 'url_id' })
        
        if (factsError) {
          console.error('❌ [URL PROCESSOR] Error inserting content facts:', factsError)
        } else {
          storedCount = contentFactsRecords.length
          console.log(`✅ [URL PROCESSOR] Stored ${storedCount} content facts`)
        }
      } catch (error) {
        console.error('❌ [URL PROCESSOR] Error during content facts storage:', error)
      }
    }
    
    // Step 10: Mark URLs as content_extracted (with resilience)
    const extractedUrlIds = successfulExtractions
      .map(e => existingUrlMap.get(e.url)?.id)
      .filter(Boolean)
    
    if (extractedUrlIds.length > 0) {
      try {
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
      } catch (error) {
        console.error('❌ [URL PROCESSOR] Error during content_extracted update:', error)
      }
    }
    
    const result: UrlProcessingResult = {
      totalUrls: allUrls.length,
      newUrls: newUrls.length,
      extractedUrls: successfulExtractions.length,
      classifiedUrls: classifications.length,
      errors: failedExtractions
    }
    
    // Step 11: Process domain homepages (non-blocking)
    try {
      console.log(`🌐 [URL PROCESSOR] Starting domain homepage processing...`)
      const domainStats = await processDomainHomepages(dailyReportId)
      console.log(`✅ [URL PROCESSOR] Domain homepage processing complete:`, domainStats)
    } catch (error) {
      console.error('❌ [URL PROCESSOR] Error during domain homepage processing:', error)
      // Don't fail the entire job for homepage processing
    }
    
    // Mark URL processing as complete
    await markUrlProcessingComplete(dailyReportId, result)
    
    console.log(`✅ [URL PROCESSOR] URL processing complete for daily report ${dailyReportId}`)
    return result
    
  } catch (error: any) {
    console.error('❌ [URL PROCESSOR] Fatal error:', error)
    
    // Mark URL processing as failed
    await supabase
      .from('daily_reports')
      .update({ 
        url_processing_status: 'failed',
        urls_total: 0,
        urls_classified: 0
      })
      .eq('id', dailyReportId)
    
    throw error
  }
}

/**
 * Mark URL processing as complete in the database
 */
const markUrlProcessingComplete = async (dailyReportId: string, result: UrlProcessingResult) => {
  const supabase = createServiceClient()
  
  await supabase
    .from('daily_reports')
    .update({
      urls_total: result.totalUrls,
      urls_extracted: result.extractedUrls,
      urls_classified: result.classifiedUrls,
      url_processing_status: 'complete'
    })
    .eq('id', dailyReportId)
}

/**
 * Process domain homepages for cited domains (with resilience)
 */
const processDomainHomepages = async (dailyReportId: string): Promise<{ processed: number; categorized: number }> => {
  const supabase = createServiceClient()
  
  try {
    // Get all unique domains from citations
    const { data: promptResults, error: resultsError } = await supabase
      .from('prompt_results')
      .select('citations, google_ai_overview_citations')
      .eq('daily_report_id', dailyReportId)
      .in('provider_status', ['ok'])
    
    if (resultsError || !promptResults || promptResults.length === 0) {
      return { processed: 0, categorized: 0 }
    }
    
    // Extract unique domains
    const domainSet = new Set<string>()
    promptResults.forEach(result => {
      const allCitations = [...(result.citations || []), ...(result.google_ai_overview_citations || [])]
      allCitations.forEach((citation: any) => {
        if (citation.url) {
          const domain = extractDomain(citation.url)
          if (domain) domainSet.add(domain)
        }
      })
    })
    
    const uniqueDomains = Array.from(domainSet)
    console.log(`🌐 [DOMAIN HOMEPAGE] Found ${uniqueDomains.length} unique domains`)
    
    if (uniqueDomains.length === 0) {
      return { processed: 0, categorized: 0 }
    }
    
    // Generate homepage URLs
    const homepageUrls = uniqueDomains.map(domain => `https://${domain}`)
    
    // Check existing homepages
    const { data: existingHomepages } = await supabase
      .from('url_inventory')
      .select(`url, id, content_extracted, url_content_facts!left(content_structure_category)`)
      .in('url', homepageUrls)
    
    const existingMap = new Map(
      (existingHomepages || []).map(h => [h.url, { 
        id: h.id, 
        content_extracted: h.content_extracted,
        has_categorization: h.url_content_facts && h.url_content_facts.length > 0
      }])
    )
    
    // Identify homepages needing processing
    const homepagesNeedingProcessing = homepageUrls.filter(url => {
      const existing = existingMap.get(url)
      return !existing || !existing.content_extracted || !existing.has_categorization
    })
    
    if (homepagesNeedingProcessing.length === 0) {
      return { processed: 0, categorized: 0 }
    }
    
    console.log(`🌐 [DOMAIN HOMEPAGE] Processing ${homepagesNeedingProcessing.length} homepages...`)
    
    // Insert new homepages
    const newHomepages = homepagesNeedingProcessing.filter(url => !existingMap.has(url))
    if (newHomepages.length > 0) {
      await supabase
        .from('url_inventory')
        .upsert(newHomepages.map(url => ({
          url,
          normalized_url: normalizeUrl(url),
          domain: extractDomain(url),
          content_extracted: false
        })), { onConflict: 'url' })
        .select('id, url')
        .then(({ data }) => {
          data?.forEach(h => existingMap.set(h.url, { id: h.id, content_extracted: false, has_categorization: false }))
        })
    }
    
    // Extract and classify homepages (with resilience)
    const extractedContent = await extractUrlContentBatch(homepagesNeedingProcessing)
    const successfulExtractions = extractedContent.filter(e => !e.failed && e.raw_content)
    
    if (successfulExtractions.length === 0) {
      return { processed: 0, categorized: 0 }
    }
    
    const classifications = await classifyUrlContentBatch(
      successfulExtractions.map(e => ({
        url: e.url,
        title: e.title || '',
        description: e.content || '',
        contentSnippet: e.raw_content || e.content || ''
      }))
    )
    
    // Store homepage content
    const contentRecords = successfulExtractions.map((e, i) => ({
      url_id: existingMap.get(e.url)?.id,
      title: e.title || '',
      description: e.content || '',
      raw_content: e.raw_content || e.content || '',
      content_snippet: (e.raw_content || e.content || '').substring(0, 2000),
      content_structure_category: classifications[i]?.content_structure_category || 'OFFICIAL_DOCUMENTATION',
      classification_confidence: 0.8,
      classifier_version: 'v1'
    })).filter(r => r.url_id)
    
    if (contentRecords.length > 0) {
      await supabase
        .from('url_content_facts')
        .upsert(contentRecords, { onConflict: 'url_id' })
      
      await supabase
        .from('url_inventory')
        .update({ 
          content_extracted: true,
          content_extracted_at: new Date().toISOString()
        })
        .in('id', contentRecords.map(r => r.url_id))
    }
    
    return {
      processed: successfulExtractions.length,
      categorized: classifications.length
    }
    
  } catch (error) {
    console.error('❌ [DOMAIN HOMEPAGE] Error:', error)
    return { processed: 0, categorized: 0 }
  }
}


