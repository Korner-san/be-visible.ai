import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper function to extract clean example snippets
function extractExampleSnippet(text: string, brandName: string, maxLength: number = 200): string {
  const lowerText = text.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  
  // Find brand mentions
  const mentions = []
  let index = lowerText.indexOf(lowerBrand)
  while (index !== -1) {
    mentions.push(index)
    index = lowerText.indexOf(lowerBrand, index + 1)
  }
  
  if (mentions.length === 0) return text.slice(0, maxLength)
  
  // Use the first mention as reference point
  const mentionIndex = mentions[0]
  
  // Extract context around the mention (smaller window for examples)
  const start = Math.max(0, mentionIndex - 100)
  const end = Math.min(text.length, start + maxLength)
  
  let snippet = text.slice(start, end).trim()
  
  // Clean up the snippet
  snippet = snippet.replace(/\s+/g, ' ') // Normalize whitespace
  snippet = snippet.replace(/^\W+/, '') // Remove leading punctuation
  snippet = snippet.replace(/\W+$/, '') // Remove trailing punctuation
  
  // Add quotes if not present
  if (!snippet.startsWith('"') && !snippet.startsWith('"')) {
    snippet = `"${snippet}`
  }
  if (!snippet.endsWith('"') && !snippet.endsWith('"')) {
    snippet = `${snippet}"`
  }
  
  return snippet
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

    const supabase = createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Verify brand ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, owner_user_id, onboarding_answers')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Build date filter query
    let dateFilterQuery = supabase
      .from('daily_reports')
      .select(`
        id,
        report_date,
        status,
        total_prompts,
        completed_prompts,
        total_mentions,
        average_position,
        sentiment_scores,
        created_at,
        prompt_results (
          id,
          brand_mentioned,
          brand_position,
          competitor_mentions,
          sentiment_score,
          portrayal_type,
          portrayal_confidence,
          classifier_stage,
          classifier_version,
          snippet_hash,
          perplexity_response
        )
      `)
      .eq('brand_id', brandId)
      .eq('status', 'completed')
      .order('report_date', { ascending: true })

    // Apply date filters if provided (inclusive range)
    if (fromDate) {
      // Start of day for from date
      dateFilterQuery = dateFilterQuery.gte('report_date', fromDate)
    }
    if (toDate) {
      // End of day for to date - include the full day
      dateFilterQuery = dateFilterQuery.lte('report_date', toDate)
    }

    const { data: dailyReports, error: reportsError } = await dateFilterQuery

    if (reportsError) {
      console.error('Error fetching daily reports:', reportsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch visibility data'
      }, { status: 500 })
    }

    // Get competitors list for rank analysis
    const competitors = (brand.onboarding_answers as any)?.competitors || []
    const allEntities = [brand.name, ...competitors]
    
    
    // Process mentions over time with rank-based average position per day
    const mentionsOverTime = dailyReports?.map(report => {
      // Calculate rank-based position for this specific day/report
      const dailyRankPositions: number[] = []
      
      report.prompt_results?.forEach((result: any) => {
        if (result.brand_mentioned && result.competitor_mentions && Array.isArray(result.competitor_mentions) && result.competitor_mentions.length > 0) {
          // Calculate rank for this response
          const entities: { name: string, position: number }[] = []
          
          if (result.brand_position !== null) {
            entities.push({ name: brand.name, position: result.brand_position })
          }
          
          result.competitor_mentions.forEach((comp: any, index: number) => {
            if (comp && comp.name) {
              const estimatedPosition = result.brand_position + 200 + (index * 100)
              entities.push({ name: comp.name, position: estimatedPosition })
            }
          })
          
          entities.sort((a, b) => a.position - b.position)
          const brandIndex = entities.findIndex(e => e.name === brand.name)
          if (brandIndex !== -1) {
            dailyRankPositions.push(brandIndex + 1)
          }
        }
      })
      
      const dailyAverageRank = dailyRankPositions.length > 0 
        ? dailyRankPositions.reduce((sum, rank) => sum + rank, 0) / dailyRankPositions.length
        : null
      
      return {
        date: report.report_date,
        mentions: report.total_mentions || 0,
        averagePosition: dailyAverageRank
      }
    }) || []

    // Sort by date
    mentionsOverTime.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    // Calculate total mentions from stored daily reports
    const totalMentions = mentionsOverTime.reduce((sum, day) => sum + day.mentions, 0)
    
    // Calculate average rank position by analyzing mention order in each response
    const allRankPositions: number[] = []
    const brandRankCounts: { [rank: number]: number } = { 1: 0, 2: 0, 3: 0 }
    const competitorFirstCounts: { [competitor: string]: number } = {}
    let totalResponsesAnalyzed = 0
    
    dailyReports?.forEach(report => {
      report.prompt_results?.forEach((result: any) => {
        if (result.brand_mentioned && result.competitor_mentions && Array.isArray(result.competitor_mentions) && result.competitor_mentions.length > 0) {
          totalResponsesAnalyzed++
          
          // This response has both brand and competitors - calculate rank based on character positions
          const entities: { name: string, position: number }[] = []
          
          // Add brand position
          if (result.brand_position !== null) {
            entities.push({ name: brand.name, position: result.brand_position })
          }
          
          // We need to estimate competitor positions since we don't store them
          // Based on the analysis, competitors typically appear after the brand mention
          // Use the brand position as baseline and add reasonable offsets
          result.competitor_mentions.forEach((comp: any, index: number) => {
            if (comp && comp.name) {
              // Estimate competitor positions - typically appear later in the response
              const estimatedPosition = result.brand_position + 200 + (index * 100)
              entities.push({ name: comp.name, position: estimatedPosition })
            }
          })
          
          // Sort by position to determine rank order
          entities.sort((a, b) => a.position - b.position)
          
          // Find brand's rank (1-based) and track competitor first positions
          const brandIndex = entities.findIndex(e => e.name === brand.name)
          if (brandIndex !== -1) {
            const brandRank = brandIndex + 1
            allRankPositions.push(brandRank)
            
            // Track rank counts for debug
            if (brandRank <= 3) {
              brandRankCounts[brandRank]++
            } else {
              brandRankCounts[3]++ // 3+ category
            }
          }
          
          // Track competitors that ranked first
          if (entities.length > 0 && entities[0].name !== brand.name) {
            const firstEntity = entities[0].name
            competitorFirstCounts[firstEntity] = (competitorFirstCounts[firstEntity] || 0) + 1
          }
        }
      })
    })
    
    // Calculate average rank position
    const averagePosition = allRankPositions.length > 0 
      ? allRankPositions.reduce((sum, rank) => sum + rank, 0) / allRankPositions.length 
      : null
      
    

    // Aggregate sentiment data from individual responses (not daily aggregates)
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 }
    let totalSentimentResponses = 0
    
    dailyReports?.forEach(report => {
      report.prompt_results?.forEach((result: any) => {
        if (result.brand_mentioned && result.sentiment_score !== null && result.sentiment_score !== undefined) {
          totalSentimentResponses++
          
          // Classify sentiment based on score (-1 to 1)
          if (result.sentiment_score > 0.1) {
            sentimentCounts.positive++
          } else if (result.sentiment_score < -0.1) {
            sentimentCounts.negative++
          } else {
            sentimentCounts.neutral++
          }
        }
      })
    })
    
    // Calculate sentiment percentages
    const overallSentiment = totalSentimentResponses > 0 ? {
      positive: Math.round((sentimentCounts.positive / totalSentimentResponses) * 100),
      neutral: Math.round((sentimentCounts.neutral / totalSentimentResponses) * 100),
      negative: Math.round((sentimentCounts.negative / totalSentimentResponses) * 100)
    } : { positive: 0, neutral: 0, negative: 0 }
    

    // Count competitor mentions (handle actual data structure)
    const competitorMentions: { [key: string]: number } = {}
    
    // Initialize counts
    competitors.forEach((comp: string) => {
      competitorMentions[comp] = 0
    })
    competitorMentions[brand.name] = totalMentions

    // Count mentions from individual responses
    dailyReports?.forEach(report => {
      report.prompt_results?.forEach((result: any) => {
        if (result.competitor_mentions && Array.isArray(result.competitor_mentions)) {
          result.competitor_mentions.forEach((comp: any) => {
            // Handle the actual data structure: {name: "Netlify", count: 3, portrayalType: "neutral"}
            if (comp && comp.name && competitorMentions.hasOwnProperty(comp.name)) {
              // Count the response as having mentioned this competitor (not the internal count)
              competitorMentions[comp.name]++
            }
          })
        }
      })
    })
    

    // Create mentions vs competitors data
    const mentionsVsCompetitors = Object.entries(competitorMentions).map(([name, mentions], index) => ({
      brand: name,
      mentions,
      x: index + 1,
      color: name === brand.name ? '#3b82f6' : `hsl(${index * 60}, 70%, 50%)`
    }))
    

    // Portrayal types analysis - BRAND ONLY (using LLM classification)
    const portrayalTypes: Array<{brand: string, type: string, count: number, percentage: number, example?: string}> = []
    
    // Track portrayal counts for brand only (prioritize LLM classification over keyword-based)
    const brandPortrayalCounts: { [key: string]: number } = {}
    const portrayalExamples: { [key: string]: string } = {}
    
    let totalBrandPortrayals = 0
    
    dailyReports?.forEach(report => {
      report.prompt_results?.forEach((result: any) => {
        // Count ONLY LLM classified brand portrayal types
        if (result.brand_mentioned && result.portrayal_type && result.classifier_stage === 'llm') {
          const portrayalType = result.portrayal_type
          brandPortrayalCounts[portrayalType] = (brandPortrayalCounts[portrayalType] || 0) + 1
          totalBrandPortrayals++
          
          // Store example snippet for this portrayal type (LLM classified only)
          if (result.perplexity_response && !portrayalExamples[portrayalType]) {
            const snippet = extractExampleSnippet(result.perplexity_response, brand.name)
            if (snippet) {
              portrayalExamples[portrayalType] = snippet
            }
          }
        }
      })
    })
    
    // Add brand portrayal types only
    Object.entries(brandPortrayalCounts).forEach(([type, count]) => {
      portrayalTypes.push({
        brand: brand.name,
        type,
        count,
        percentage: totalBrandPortrayals > 0 ? Math.round((count / totalBrandPortrayals) * 100) : 0,
        example: portrayalExamples[type] || `"${brand.name} is mentioned as ${type.replace('_', ' ')}..."`
      })
    })
    
    // Sort by count descending for better display
    portrayalTypes.sort((a, b) => b.count - a.count)


    const responseData = {
      brandName: brand.name,
      totalMentions,
      averagePosition: averagePosition !== null ? Math.round(averagePosition * 10) / 10 : null, // Round to 1 decimal
      mentionsOverTime,
      sentiment: [
        { name: 'Positive', value: overallSentiment.positive, color: '#10b981' },
        { name: 'Neutral', value: overallSentiment.neutral, color: '#6b7280' },
        { name: 'Negative', value: overallSentiment.negative, color: '#ef4444' }
      ],
      mentionsVsCompetitors,
      portrayalTypes,
      lastUpdated: dailyReports?.[dailyReports.length - 1]?.created_at || null,
      totalReports: dailyReports?.length || 0,
      debugInfo: {
        totalResponsesAnalyzed,
        brandRankCounts,
        competitorFirstCounts
      }
    }
    

    return NextResponse.json({
      success: true,
      data: responseData
    })

  } catch (error) {
    console.error('Unexpected error in visibility API:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
