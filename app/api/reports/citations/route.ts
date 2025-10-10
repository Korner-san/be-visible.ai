import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const modelsParam = searchParams.get('models')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit
    
    // Parse model filter - default to all active providers if not specified
    const selectedModels = modelsParam ? modelsParam.split(',') : ['perplexity', 'google_ai_overview']
    
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
      .select('id, name, owner_user_id')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Build query with date filters and provider filter
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        prompt_text,
        provider,
        citations,
        claude_citations,
        google_ai_overview_citations,
        brand_mentioned,
        created_at,
        daily_reports!inner(
          report_date,
          status
        ),
        brand_prompts!inner(
          brand_id
        )
      `)
      .eq('brand_prompts.brand_id', brandId)
      .eq('daily_reports.status', 'completed')
      .in('provider', selectedModels)
      .order('created_at', { ascending: false })

    // Apply date filters if provided
    if (fromDate) {
      query = query.gte('daily_reports.report_date', fromDate)
    }
    if (toDate) {
      query = query.lte('daily_reports.report_date', toDate)
    }

    const { data: promptResults, error: resultsError } = await query

    if (resultsError) {
      console.error('Error fetching prompt results:', resultsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch citations data'
      }, { status: 500 })
    }

    // Flatten all citations from all prompt results
    const allCitations: any[] = []
    const domainStats = new Map()

    promptResults?.forEach(result => {
      if (result.citations && Array.isArray(result.citations)) {
        result.citations.forEach((citation: any) => {
          // Extract domain from URL
          let domain = 'unknown'
          try {
            const url = new URL(citation.url)
            domain = url.hostname.replace('www.', '')
          } catch (e) {
            // If URL parsing fails, try to extract domain manually
            const match = citation.url.match(/https?:\/\/(?:www\.)?([^\/]+)/)
            if (match) domain = match[1]
          }

          // Add citation with metadata
          allCitations.push({
            url: citation.url,
            title: citation.title || 'Untitled',
            domain: domain,
            date: citation.date,
            last_updated: citation.last_updated,
            snippet: citation.snippet || '',
            prompt_text: result.prompt_text,
            brand_mentioned: result.brand_mentioned,
            report_date: result.daily_reports.report_date,
            created_at: result.created_at
          })

          // Update domain statistics
          if (domainStats.has(domain)) {
            const stats = domainStats.get(domain)
            stats.urls += 1
            if (result.brand_mentioned) stats.brandMentions += 1
          } else {
            domainStats.set(domain, {
              domain: domain,
              urls: 1,
              brandMentions: result.brand_mentioned ? 1 : 0,
              category: categorizeWebsite(domain),
              lastSeen: result.daily_reports.report_date
            })
          }
        })
      }
    })

    // Sort citations by date (most recent first)
    allCitations.sort((a, b) => {
      const dateA = new Date(a.last_updated || a.date || a.created_at)
      const dateB = new Date(b.last_updated || b.date || b.created_at)
      return dateB.getTime() - dateA.getTime()
    })

    // Get total count for pagination
    const totalCitations = allCitations.length
    const totalPages = Math.ceil(totalCitations / limit)

    // Apply pagination
    const paginatedCitations = allCitations.slice(offset, offset + limit)

    // Convert domain stats to array and sort by URL count
    const domainStatsArray = Array.from(domainStats.values())
      .sort((a, b) => b.urls - a.urls)

    // Get pagination info for domain stats
    const totalDomains = domainStatsArray.length
    const totalDomainPages = Math.ceil(totalDomains / limit)
    const paginatedDomains = domainStatsArray.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      data: {
        citations: paginatedCitations,
        domains: paginatedDomains,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalCitations: totalCitations,
          totalDomains: totalDomains,
          totalDomainPages: totalDomainPages,
          limit: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          totalCitations: totalCitations,
          totalDomains: totalDomains,
          brandMentionCitations: allCitations.filter(c => c.brand_mentioned).length,
          categoryCounts: getCategoryCounts(domainStatsArray)
        }
      }
    })

  } catch (error) {
    console.error('Citations API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function categorizeWebsite(domain: string): string {
  // Simple categorization based on domain patterns
  if (domain.includes('github.com') || domain.includes('gitlab.com') || domain.includes('bitbucket')) {
    return 'Development'
  }
  if (domain.includes('docs.') || domain.includes('documentation') || domain.includes('developer.')) {
    return 'Documentation'
  }
  if (domain.includes('blog') || domain.includes('medium.com') || domain.includes('dev.to')) {
    return 'Blog'
  }
  if (domain.includes('news') || domain.includes('techcrunch') || domain.includes('forbes') || domain.includes('wired')) {
    return 'News'
  }
  if (domain.includes('stackoverflow') || domain.includes('reddit') || domain.includes('community')) {
    return 'Community'
  }
  if (domain.includes('edu') || domain.includes('learn') || domain.includes('tutorial')) {
    return 'Education'
  }
  if (domain.includes('commercial') || domain.includes('shop') || domain.includes('store')) {
    return 'Commercial'
  }
  
  return 'Technology'
}

function getCategoryCounts(domains: any[]): Record<string, number> {
  const counts: Record<string, number> = {}
  domains.forEach(domain => {
    const category = domain.category
    counts[category] = (counts[category] || 0) + domain.urls
  })
  return counts
}
