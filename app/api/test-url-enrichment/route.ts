import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    // Test the exact URL that should have categorization data
    const testUrl = 'https://qovery.com/product/observe'
    
    console.log(`🧪 [TEST API] Testing URL enrichment for: ${testUrl}`)
    
    // Try the URL variations
    const urlVariations = [
      testUrl.replace('://', '://www.'), // Add www. prefix
      testUrl, // Original URL
      testUrl.replace('://www.', '://') // Remove www. prefix
    ]
    
    let categoryData = null
    let matchedVariation = null
    
    for (const urlVariation of urlVariations) {
      console.log(`🧪 [TEST API] Trying variation: ${urlVariation}`)
      
      // Try normalized_url match
      const { data: normalizedMatches, error: normalizedError } = await supabase
        .from('url_inventory')
        .select(`
          id,
          url,
          normalized_url,
          url_content_facts!inner(domain_role_category, content_structure_category)
        `)
        .eq('normalized_url', urlVariation)
        .limit(1)
      
      if (normalizedError) {
        console.error(`❌ [TEST API] Normalized query error:`, normalizedError)
      }
      
      if (normalizedMatches && normalizedMatches.length > 0) {
        categoryData = normalizedMatches[0]
        matchedVariation = `normalized:${urlVariation}`
        console.log(`✅ [TEST API] Found match via normalized_url: ${urlVariation}`)
        break
      }
      
      // Try exact url match
      const { data: exactMatches, error: exactError } = await supabase
        .from('url_inventory')
        .select(`
          id,
          url,
          normalized_url,
          url_content_facts!inner(domain_role_category, content_structure_category)
        `)
        .eq('url', urlVariation)
        .limit(1)
      
      if (exactError) {
        console.error(`❌ [TEST API] Exact query error:`, exactError)
      }
      
      if (exactMatches && exactMatches.length > 0) {
        categoryData = exactMatches[0]
        matchedVariation = `exact:${urlVariation}`
        console.log(`✅ [TEST API] Found match via exact url: ${urlVariation}`)
        break
      }
    }
    
    return NextResponse.json({
      success: true,
      testUrl,
      urlVariations,
      categoryData,
      matchedVariation,
      hasCategorization: !!categoryData?.url_content_facts,
      domainRole: categoryData?.url_content_facts?.domain_role_category,
      contentType: categoryData?.url_content_facts?.content_structure_category
    })
    
  } catch (error) {
    console.error('❌ [TEST API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
