import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import PromptDetailClient from './prompt-detail-client'

export default async function PromptDetail({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params
  
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/signin')
  }
  
  // Fetch the specific prompt
  console.log('🔍 [PROMPT DETAIL] Fetching prompt:', promptId, 'for user:', user.id)
  
  const { data: prompt, error } = await supabase
    .from('brand_prompts')
    .select(`
      id,
      source_template_code,
      raw_prompt,
      improved_prompt,
      status,
      category,
      created_at,
      brands!inner(
        id,
        name,
        domain,
        is_demo,
        owner_user_id
      )
    `)
    .eq('id', promptId)
    .single()
  
  console.log('📊 [PROMPT DETAIL] Query result:', { 
    prompt: !!prompt, 
    error: error?.message,
    promptId,
    userId: user.id,
    userEmail: user.email,
    fullError: error 
  })
  
  // Fetch prompt results (Perplexity responses)
  let promptResults: any[] = []
  let citations: any[] = []
  let totalMentions = 0
  let totalRuns = 0
  
  if (prompt) {
    const { data: results } = await supabase
      .from('prompt_results')
      .select(`
        id,
        prompt_text,
        perplexity_response,
        brand_mentioned,
        brand_position,
        competitor_mentions,
        citations,
        sentiment_score,
        portrayal_type,
        created_at,
        daily_reports!inner(
          report_date,
          status
        )
      `)
      .eq('brand_prompt_id', promptId)
      .eq('daily_reports.status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10)
    
    promptResults = results || []
    totalRuns = promptResults.length
    totalMentions = promptResults.filter(r => r.brand_mentioned).length
    
    // Flatten all citations
    citations = promptResults.flatMap(result => 
      (result.citations || []).map((citation: any) => ({
        ...citation,
        result_date: result.daily_reports.report_date
      }))
    )
  }
  
  if (error || !prompt) {
    console.error('❌ [PROMPT DETAIL] Prompt not found or access denied:', {
      promptId,
      userId: user.id,
      error: error?.message
    })
    
    // Show error page instead of immediate redirect
    return (
      <div className="p-8">
        <div className="mb-6">
          <Link href="/reports/prompts">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Prompts
            </Button>
          </Link>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Prompt Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              The prompt you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link href="/reports/prompts">
              <Button>
                View All Prompts
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <PromptDetailClient prompt={prompt} initialResults={promptResults} initialCitations={citations} />
}