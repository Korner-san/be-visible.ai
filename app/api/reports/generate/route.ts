import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Background job to generate first report for a brand
export async function POST(request: NextRequest) {
  try {
    const { brandId } = await request.json()
    
    if (!brandId) {
      return NextResponse.json(
        { success: false, error: 'Brand ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    
    // Get brand details
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('id', brandId)
      .single()

    if (brandError || !brand) {
      return NextResponse.json(
        { success: false, error: 'Brand not found' },
        { status: 404 }
      )
    }

    // Update status to running
    await supabase
      .from('brands')
      .update({ first_report_status: 'running' })
      .eq('id', brandId)

    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Starting report generation for brand:', brandId)
    }

    // Simulate report generation process
    // In a real implementation, this would:
    // 1. Generate AI queries based on onboarding answers
    // 2. Run queries against AI models (GPT, Claude, etc.)
    // 3. Analyze responses and generate insights
    // 4. Create daily_reports entries
    
    // For now, simulate with a timeout
    setTimeout(async () => {
      try {
        // Create a sample daily report
        const { error: reportError } = await supabase
          .from('daily_reports')
          .insert({
            brand_id: brandId,
            report_date: new Date().toISOString().split('T')[0],
            report_score: Math.floor(Math.random() * 30) + 70, // Random score 70-100
            models_indexed: {
              gpt4: true,
              claude: true,
              perplexity: Math.random() > 0.5
            },
            bot_scans: Math.floor(Math.random() * 100) + 50,
            ai_sessions: Math.floor(Math.random() * 80) + 20,
            pages_indexed: Math.floor(Math.random() * 20) + 5,
            raw_ai_responses: {
              generated: true,
              timestamp: new Date().toISOString(),
              brand_name: brand.name,
              sample_data: true
            }
          })

        if (reportError) {
          console.error('Error creating daily report:', reportError)
          // Update status to failed
          await supabase
            .from('brands')
            .update({ first_report_status: 'failed' })
            .eq('id', brandId)
        } else {
          // Update status to succeeded
          await supabase
            .from('brands')
            .update({ first_report_status: 'succeeded' })
            .eq('id', brandId)
          
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Report generation completed for brand:', brandId)
          }
        }
      } catch (error) {
        console.error('Error in background report generation:', error)
        // Update status to failed
        await supabase
          .from('brands')
          .update({ first_report_status: 'failed' })
          .eq('id', brandId)
      }
    }, 5000) // 5 second delay to simulate processing

    return NextResponse.json({
      success: true,
      message: 'Report generation started',
      status: 'running'
    })

  } catch (error) {
    console.error('Error starting report generation:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
