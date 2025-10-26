/**
 * Verification Script
 * Run this to verify your environment is configured correctly
 */

import dotenv from 'dotenv'
import { createServiceClient } from '../src/lib/supabase-client'

dotenv.config()

const verify = async () => {
  console.log('🔍 Verifying Render Worker Setup...\n')
  
  let allGood = true
  
  // Check environment variables
  console.log('📋 Checking Environment Variables...')
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PERPLEXITY_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_CSE_ID',
    'OPENAI_API_KEY',
    'TAVILY_API_KEY'
  ]
  
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`  ✅ ${varName} is set`)
    } else {
      console.log(`  ❌ ${varName} is MISSING`)
      allGood = false
    }
  })
  
  console.log('\n🗄️  Testing Supabase Connection...')
  try {
    const supabase = createServiceClient()
    
    // Test 1: Check if test user exists
    const { data: testUser, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', 'kk1995current@gmail.com')
      .single()
    
    if (userError || !testUser) {
      console.log('  ❌ Test user not found (kk1995current@gmail.com)')
      console.log('     Error:', userError?.message || 'User not found')
      allGood = false
    } else {
      console.log(`  ✅ Test user found: ${testUser.email} (${testUser.id})`)
    }
    
    // Test 2: Check if brands exist
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('owner_user_id', testUser?.id)
      .eq('onboarding_completed', true)
    
    if (brandsError) {
      console.log('  ❌ Error fetching brands:', brandsError.message)
      allGood = false
    } else if (!brands || brands.length === 0) {
      console.log('  ⚠️  No brands found with completed onboarding')
    } else {
      console.log(`  ✅ Found ${brands.length} brand(s):`)
      brands.forEach(b => console.log(`     - ${b.name} (${b.id})`))
    }
    
    // Test 3: Check if active prompts exist
    if (brands && brands.length > 0) {
      const { data: prompts, error: promptsError } = await supabase
        .from('brand_prompts')
        .select('id, brand_id')
        .eq('brand_id', brands[0].id)
        .eq('status', 'active')
      
      if (promptsError) {
        console.log('  ❌ Error fetching prompts:', promptsError.message)
        allGood = false
      } else if (!prompts || prompts.length === 0) {
        console.log(`  ⚠️  No active prompts found for brand: ${brands[0].name}`)
      } else {
        console.log(`  ✅ Found ${prompts.length} active prompt(s) for ${brands[0].name}`)
      }
    }
    
    // Test 4: Check daily_reports table structure
    const { data: latestReport, error: reportError } = await supabase
      .from('daily_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (reportError && reportError.code !== 'PGRST116') {
      console.log('  ❌ Error accessing daily_reports table:', reportError.message)
      allGood = false
    } else if (!latestReport) {
      console.log('  ℹ️  No reports in database yet (this is expected for first run)')
    } else {
      console.log(`  ✅ Latest report: ${latestReport.report_date} (${latestReport.status})`)
    }
    
  } catch (error) {
    console.log('  ❌ Supabase connection failed:', error instanceof Error ? error.message : 'Unknown error')
    allGood = false
  }
  
  console.log('\n🔑 Testing API Keys...')
  
  // Test Perplexity API
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10
      })
    })
    
    if (response.ok) {
      console.log('  ✅ Perplexity API key is valid')
    } else {
      console.log('  ❌ Perplexity API key is invalid (status:', response.status, ')')
      allGood = false
    }
  } catch (error) {
    console.log('  ❌ Perplexity API test failed:', error instanceof Error ? error.message : 'Unknown error')
    allGood = false
  }
  
  // Test Google Custom Search API
  try {
    const testQuery = 'test'
    const apiUrl = 'https://www.googleapis.com/customsearch/v1'
    const response = await fetch(
      `${apiUrl}?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${testQuery}&num=1`
    )
    
    if (response.ok) {
      console.log('  ✅ Google API key and CSE ID are valid')
    } else {
      console.log('  ❌ Google API key or CSE ID is invalid (status:', response.status, ')')
      allGood = false
    }
  } catch (error) {
    console.log('  ❌ Google API test failed:', error instanceof Error ? error.message : 'Unknown error')
    allGood = false
  }
  
  // Test OpenAI API
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    })
    
    if (response.ok) {
      console.log('  ✅ OpenAI API key is valid')
    } else {
      console.log('  ❌ OpenAI API key is invalid (status:', response.status, ')')
      allGood = false
    }
  } catch (error) {
    console.log('  ❌ OpenAI API test failed:', error instanceof Error ? error.message : 'Unknown error')
    allGood = false
  }
  
  // Test Tavily API
  try {
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        urls: ['https://example.com']
      })
    })
    
    if (response.ok) {
      console.log('  ✅ Tavily API key is valid')
    } else {
      console.log('  ❌ Tavily API key is invalid (status:', response.status, ')')
      allGood = false
    }
  } catch (error) {
    console.log('  ❌ Tavily API test failed:', error instanceof Error ? error.message : 'Unknown error')
    allGood = false
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60))
  if (allGood) {
    console.log('✅ All checks passed! Your worker is ready to deploy.')
    console.log('\nNext steps:')
    console.log('1. Deploy to Render using the instructions in WORKER_DEPLOYMENT_GUIDE.md')
    console.log('2. Test with: curl -X POST https://your-worker-url.onrender.com/trigger-daily-reports')
    console.log('3. Monitor logs in Render Dashboard')
  } else {
    console.log('❌ Some checks failed. Please fix the issues above before deploying.')
    console.log('\nCommon fixes:')
    console.log('- Double-check environment variables in .env file')
    console.log('- Verify API keys are valid and have sufficient quota')
    console.log('- Ensure Supabase database has required tables')
    process.exit(1)
  }
  console.log('='.repeat(60) + '\n')
}

verify().catch(error => {
  console.error('\n❌ Verification failed with error:', error)
  process.exit(1)
})


