/**
 * Report Aggregator Processor
 *
 * RESPONSIBILITY: Update daily_reports with aggregate counts
 *
 * DOES:
 * - Count successful/failed/no_result prompts per provider
 * - Update daily_reports aggregates (chatgpt_ok, perplexity_ok, google_ok, etc.)
 * - Set completion status for each provider
 *
 * DOES NOT:
 * - Execute prompts (executor's job)
 * - Analyze content (brand-analyzer's job)
 * - Fetch URLs (citation-fetcher's job)
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Update daily_reports with aggregate counts for all providers
 * @param {string} dailyReportId
 * @param {Array<string>} providers - Which providers to aggregate (default: all 3)
 */
async function updateAggregates(dailyReportId, providers = ['chatgpt', 'perplexity', 'google_ai_overview']) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 REPORT AGGREGATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('Providers: ' + providers.join(', '));
  console.log('='.repeat(70) + '\n');

  try {
    // Count results by provider and status
    console.log('🔍 Counting results...');

    const updateData = {};
    const statusResults = {};

    // Process each provider
    for (const provider of providers) {
      const { data: results, error } = await supabase
        .from('prompt_results')
        .select('provider_status')
        .eq('daily_report_id', dailyReportId)
        .eq('provider', provider);

      if (error) {
        throw new Error(`Failed to count ${provider} results: ` + error.message);
      }

      const attempted = results?.length || 0;
      const ok = results?.filter(r => r.provider_status === 'ok').length || 0;
      const no_result = results?.filter(r => r.provider_status === 'no_result').length || 0;

      console.log(`✅ ${provider}: ${ok}/${attempted} successful`);

      // Determine completion status
      let status = 'complete';
      if (ok === 0 && attempted > 0) {
        status = 'failed';
      } else if (attempted === 0) {
        status = 'not_started';
      }

      // Map provider names to database column names
      const providerKey = provider === 'google_ai_overview' ? 'google_ai_overview' : provider;

      updateData[`${providerKey}_attempted`] = attempted;
      updateData[`${providerKey}_ok`] = ok;
      updateData[`${providerKey}_no_result`] = no_result;
      updateData[`${providerKey}_status`] = status;

      statusResults[provider] = {
        attempted,
        ok,
        no_result,
        status
      };
    }

    // NOTE: Status update removed - end-of-day processor Phase 5 handles final status
    // This aggregator only updates provider-specific stats, not overall status

    // Update daily_reports
    console.log('\n💾 Updating daily_reports...');
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update(updateData)
      .eq('id', dailyReportId);

    if (updateError) {
      throw new Error('Failed to update daily_reports: ' + updateError.message);
    }

    console.log('✅ Aggregates updated (status will be set by Phase 5)');

    providers.forEach(provider => {
      const result = statusResults[provider];
      console.log(`   ${provider}: ${result.status}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('📊 AGGREGATION COMPLETE');
    console.log('='.repeat(70) + '\n');

    return statusResults;

  } catch (error) {
    console.error('\n❌ Aggregation failed:', error.message);
    throw error;
  }
}

module.exports = {
  updateAggregates
};
