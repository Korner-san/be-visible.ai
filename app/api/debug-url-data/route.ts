import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    // Test the exact URL that should have categorization data
    const testUrl = 'https://qovery.com/product/observe'
    
    console.log(`🧪 [DEBUG API] Testing database data for: ${testUrl}`)
    
    // Check if the URL exists in url_inventory at all
    const { data: urlInventory, error: inventoryError } = await supabase
      .from('url_inventory')
      .select('id, url, normalized_url, domain, content_extracted')
      .eq('normalized_url', 'https://www.qovery.com/product/observe')
      .limit(1)
    
    console.log('🧪 [DEBUG API] URL Inventory:', { urlInventory, inventoryError })
    
    if (!urlInventory || urlInventory.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'URL not found in url_inventory',
        testUrl
      })
    }
    
    const urlId = urlInventory[0].id
    
    // Check if url_content_facts exists for this URL
    const { data: contentFacts, error: factsError } = await supabase
      .from('url_content_facts')
      .select('*')
      .eq('url_id', urlId)
      .limit(1)
    
    console.log('🧪 [DEBUG API] Content Facts:', { contentFacts, factsError })
    
    // Test the exact query that's failing in the main API
    const { data: innerJoinTest, error: innerJoinError } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url,
        normalized_url,
        url_content_facts!inner(domain_role_category, content_structure_category)
      `)
      .eq('normalized_url', 'https://www.qovery.com/product/observe')
      .limit(1)
    
    console.log('🧪 [DEBUG API] Inner Join Test:', { innerJoinTest, innerJoinError })
    
    // Test without inner join
    const { data: leftJoinTest, error: leftJoinError } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url,
        normalized_url,
        url_content_facts(domain_role_category, content_structure_category)
      `)
      .eq('normalized_url', 'https://www.qovery.com/product/observe')
      .limit(1)
    
    console.log('🧪 [DEBUG API] Left Join Test:', { leftJoinTest, leftJoinError })
    
    return NextResponse.json({
      success: true,
      testUrl,
      urlInventory: urlInventory[0],
      contentFacts: contentFacts?.[0] || null,
      innerJoinTest: innerJoinTest?.[0] || null,
      leftJoinTest: leftJoinTest?.[0] || null,
      hasContentFacts: !!contentFacts?.[0],
      innerJoinWorks: !!innerJoinTest?.[0],
      leftJoinWorks: !!leftJoinTest?.[0]
    })
    
  } catch (error) {
    console.error('❌ [DEBUG API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
