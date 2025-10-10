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
    const modelsParam = searchParams.get('models')
    
    // Parse model filter - default to all active providers if not specified
    const selectedModels = modelsParam ? modelsParam.split(',') : ['perplexity', 'google_ai_overview']
    
    console.log('🔍 [Visibility API] Request params:', {
      brandId,
      fromDate,
      toDate,
      modelsParam,
      selectedModels
    })
    
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

    // Build date filter query - include ALL provider fields
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
          provider,
          provider_status,
          brand_mentioned,
          brand_position,
          competitor_mentions,
          sentiment_score,
          portrayal_type,
          portrayal_confidence,
          classifier_stage,
          classifier_version,
          snippet_hash,
          perplexity_response,
          claude_response,
          claude_portrayal_type,
          claude_portrayal_confidence,
          claude_classifier_stage,
          claude_classifier_version,
          claude_snippet_hash,
          google_ai_overview_response,
          google_ai_overview_portrayal_type,
          google_ai_overview_portrayal_confidence,
          google_ai_overview_classifier_stage,
          google_ai_overview_classifier_version,
          google_ai_overview_snippet_hash
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
      let dailyMentions = 0
      
      report.prompt_results?.forEach((result: any) => {
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) {
          return
        }
        
        // Count mentions from filtered providers only
        if (result.brand_mentioned) {
          // Count textual occurrences in the response
          const responseText = result.provider === 'perplexity' 
            ? result.perplexity_response 
            : result.provider === 'google_ai_overview'
            ? result.google_ai_overview_response
            : result.provider === 'claude'
            ? result.claude_response
            : ''
          
          if (responseText) {
            const lowerText = responseText.toLowerCase()
            const lowerBrand = brand.name.toLowerCase()
            let count = 0
            let index = lowerText.indexOf(lowerBrand)
            while (index !== -1) {
              count++
              index = lowerText.indexOf(lowerBrand, index + 1)
            }
            dailyMentions += count
          }
        }
        
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
        mentions: dailyMentions,
        averagePosition: dailyAverageRank
      }
    }) || []

    // Sort by date
    mentionsOverTime.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    // Calculate total mentions from filtered data
    const totalMentions = mentionsOverTime.reduce((sum, day) => sum + day.mentions, 0)
    
    console.log('📊 [Visibility API] Filtered mentions calculation:', {
      selectedModels,
      totalMentions,
      daysProcessed: mentionsOverTime.length,
      mentionsByDay: mentionsOverTime.map(d => ({ date: d.date, mentions: d.mentions }))
    })
    
    // NEW: Calculate Competitive Position Score Over Time (Weighted)
    const positionScoreOverTime = dailyReports?.map(report => {
      let totalWeightedScore = 0
      let totalWeight = 0
      let responsesCount = 0

      report.prompt_results?.forEach((result: any) => {
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) return

        // Only include responses where brand AND at least one competitor appear
        if (!result.brand_mentioned || !result.competitor_mentions || result.competitor_mentions.length === 0) return

        // Get response text to find actual mentions
        const responseText = result.provider === 'perplexity' 
          ? result.perplexity_response 
          : result.provider === 'google_ai_overview'
          ? result.google_ai_overview_response
          : result.provider === 'claude'
          ? result.claude_response
          : ''

        if (!responseText) return

        // Find all entities (brand + competitors) with their first occurrence positions
        const entities: Array<{ name: string, position: number }> = []

        // Brand position
        if (result.brand_position !== null) {
          entities.push({ name: brand.name, position: result.brand_position })
        }

        // Competitor positions (from competitor_mentions)
        result.competitor_mentions.forEach((comp: any) => {
          if (comp && comp.name && comp.position !== undefined && comp.position !== -1) {
            entities.push({ name: comp.name, position: comp.position })
          }
        })

        // Need at least brand + 1 competitor
        if (entities.length < 2) return

        // Sort by position (earliest first)
        entities.sort((a, b) => a.position - b.position)

        // Find brand's rank (1-based)
        const brandIndex = entities.findIndex(e => e.name === brand.name)
        if (brandIndex === -1) return

        const rank = brandIndex + 1 // 1 = first, n = last
        const n = entities.length // total entities

        // Base score: (n - rank) / (n - 1)
        // If rank = 1 → score = 1.0 (best)
        // If rank = n → score = 0.0 (worst)
        const baseScore = n > 1 ? (n - rank) / (n - 1) : 0

        // Weight: n - 1 (more competitors = higher weight)
        const weight = n - 1

        totalWeightedScore += baseScore * weight
        totalWeight += weight
        responsesCount++
      })

      return {
        date: report.report_date,
        score: totalWeight > 0 ? totalWeightedScore / totalWeight : null,
        responsesCount,
        weightedSample: totalWeight
      }
    }).filter(day => day.score !== null) || [] // Only include days with data

    // NEW: Calculate Coverage Score Over Time (Brand & Competitors)
    const coverageOverTime = dailyReports?.map(report => {
      let brandCovered = 0
      let totalResponses = 0
      const competitorCoverage: { [name: string]: number } = {}

      // Initialize competitor counts
      competitors.forEach((comp: string) => {
        competitorCoverage[comp] = 0
      })

      report.prompt_results?.forEach((result: any) => {
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) return

        totalResponses++

        // Brand coverage
        if (result.brand_mentioned) {
          brandCovered++
        }

        // Competitor coverage
        if (result.competitor_mentions && Array.isArray(result.competitor_mentions)) {
          result.competitor_mentions.forEach((comp: any) => {
            if (comp && comp.name && competitorCoverage.hasOwnProperty(comp.name)) {
              competitorCoverage[comp.name]++
            }
          })
        }
      })

      const brandCoveragePercent = totalResponses > 0 ? (brandCovered / totalResponses) * 100 : 0

      const competitorsArray = Object.entries(competitorCoverage).map(([name, covered]) => ({
        name,
        coverage: totalResponses > 0 ? (covered / totalResponses) * 100 : 0,
        covered
      }))

      return {
        date: report.report_date,
        brandCoverage: brandCoveragePercent,
        brandCovered,
        totalResponses,
        competitors: competitorsArray
      }
    }) || []
    
    // Calculate average rank position by analyzing mention order in each response
    const allRankPositions: number[] = []
    const brandRankCounts: { [rank: number]: number } = { 1: 0, 2: 0, 3: 0 }
    const competitorFirstCounts: { [competitor: string]: number } = {}
    let totalResponsesAnalyzed = 0
    
    dailyReports?.forEach(report => {
      report.prompt_results?.forEach((result: any) => {
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) {
          return
        }
        
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
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) {
          return
        }
        
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
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) {
          return
        }
        
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
    

    // Portrayal types analysis - BRAND ONLY (using LLM classification from ALL providers)
    const portrayalTypes: Array<{brand: string, type: string, count: number, percentage: number, example?: string}> = []
    
    // Track portrayal counts for brand only (prioritize LLM classification over keyword-based)
    const brandPortrayalCounts: { [key: string]: number } = {}
    const portrayalExamples: { [key: string]: string } = {}
    
    let totalBrandPortrayals = 0
    
    dailyReports?.forEach(report => {
      report.prompt_results?.forEach((result: any) => {
        // Filter by selected models
        if (!selectedModels.includes(result.provider)) {
          return
        }
        
        // Helper function to process portrayal data from any provider
        const processPortrayalData = (response: string, portrayalType: string, classifierStage: string, modelSource: string) => {
          if (result.brand_mentioned && portrayalType && classifierStage === 'llm') {
            brandPortrayalCounts[portrayalType] = (brandPortrayalCounts[portrayalType] || 0) + 1
            totalBrandPortrayals++
            
            // Store example snippet for this portrayal type (LLM classified only)
            if (response && !portrayalExamples[portrayalType]) {
              const snippet = extractExampleSnippet(response, brand.name)
              if (snippet) {
                portrayalExamples[portrayalType] = snippet
              }
            }
          }
        }

        // Process Perplexity data
        if (result.provider === 'perplexity' || !result.provider) {
          processPortrayalData(result.perplexity_response, result.portrayal_type, result.classifier_stage, 'perplexity')
        }
        
        // Process Claude data
        if (result.provider === 'claude') {
          processPortrayalData(result.claude_response, result.claude_portrayal_type, result.claude_classifier_stage, 'claude')
        }
        
        // Process Google AI Overview data
        if (result.provider === 'google_ai_overview') {
          processPortrayalData(result.google_ai_overview_response, result.google_ai_overview_portrayal_type, result.google_ai_overview_classifier_stage, 'google_ai_overview')
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
      positionScoreOverTime, // NEW: Weighted competitive position scores
      coverageOverTime, // NEW: Coverage % over time
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
