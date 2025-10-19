import { NextRequest, NextResponse } from 'next/server'
import { classifyUrlContent } from '@/lib/classifiers/content-classifier'

export async function POST(request: NextRequest) {
  try {
    const { url, title, description, contentSnippet } = await request.json()
    
    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 })
    }
    
    console.log(`🧪 [TEST NEW CLASSIFICATION] Testing new 8-category system with URL: ${url}`)
    
    const result = await classifyUrlContent(
      url,
      title || 'Test Title',
      description || 'Test Description',
      contentSnippet || 'Test content snippet for classification testing.'
    )
    
    return NextResponse.json({
      success: true,
      result,
      url,
      newCategories: [
        'QA_BLOCK',
        'DATA_DRIVEN_REPORT', 
        'COMPARISON_TABLE',
        'CASE_STUDY',
        'DOCS_PAGE',
        'FORUM_THREAD',
        'TUTORIAL_STEP_BY_STEP',
        'LONG_FORM_ARTICLE'
      ]
    })
    
  } catch (error) {
    console.error('❌ [TEST NEW CLASSIFICATION] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Classification test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
