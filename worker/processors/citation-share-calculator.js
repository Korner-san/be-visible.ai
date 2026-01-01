/**
 * Citation Share Calculator
 *
 * Calculates citation share percentage for brand and competitors for each daily report
 *
 * Process:
 * 1. Get all citations for the daily report
 * 2. Extract domains from citation URLs
 * 3. Count citations per domain (brand + competitors)
 * 4. Calculate share percentage for each
 * 5. Rank domains by citation share
 * 6. Save to citation_share_stats table
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    // Remove www. prefix and get hostname
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch (error) {
    return null;
  }
}

/**
 * Calculate citation share for a daily report
 */
async function calculateCitationShare(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 CITATION SHARE CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Get daily report info (brand_id, report_date)
    console.log('📋 Loading daily report info...');
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date')
      .eq('id', dailyReportId)
      .single();

    if (reportError || !report) {
      throw new Error('Failed to fetch daily report: ' + (reportError?.message || 'Not found'));
    }

    console.log('✅ Report loaded');
    console.log('   Brand ID: ' + report.brand_id);
    console.log('   Report Date: ' + report.report_date);

    // 2. Get brand domain
    console.log('\n🏢 Loading brand domain...');
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, domain')
      .eq('id', report.brand_id)
      .single();

    if (brandError || !brand || !brand.domain) {
      console.log('⚠️  Brand domain not found, skipping citation share calculation');
      return { success: false, message: 'Brand domain not configured' };
    }

    console.log('✅ Brand: ' + brand.name);
    console.log('   Domain: ' + brand.domain);

    // 3. Get competitor domains
    console.log('\n🎯 Loading competitor domains...');
    const { data: competitors, error: competitorsError } = await supabase
      .from('brand_competitors')
      .select('id, competitor_name, competitor_domain')
      .eq('brand_id', report.brand_id)
      .eq('is_active', true);

    if (competitorsError) {
      console.log('⚠️  Error loading competitors:', competitorsError.message);
    }

    const validCompetitors = (competitors || []).filter(c => c.competitor_domain);
    console.log('✅ Found ' + validCompetitors.length + ' competitors with domains');
    validCompetitors.forEach(c => {
      console.log('   - ' + c.competitor_name + ': ' + c.competitor_domain);
    });

    // 4. Get all citations for this daily report
    console.log('\n🔗 Loading citations...');
    const { data: citations, error: citationsError } = await supabase
      .from('url_citations')
      .select(`
        id,
        url_id,
        url_inventory!inner(url)
      `)
      .eq('prompt_result_id',
        supabase.from('prompt_results')
          .select('id')
          .eq('daily_report_id', dailyReportId)
      );

    // Better query: get citations through prompt_results
    const { data: promptResults, error: promptError } = await supabase
      .from('prompt_results')
      .select('id')
      .eq('daily_report_id', dailyReportId);

    if (promptError || !promptResults) {
      throw new Error('Failed to fetch prompt results: ' + (promptError?.message || 'Not found'));
    }

    const promptResultIds = promptResults.map(pr => pr.id);

    const { data: allCitations, error: allCitationsError } = await supabase
      .from('url_citations')
      .select(`
        id,
        url_id,
        url_inventory!inner(url)
      `)
      .in('prompt_result_id', promptResultIds);

    if (allCitationsError) {
      console.log('⚠️  Error loading citations:', allCitationsError.message);
      return { success: false, message: 'Failed to load citations' };
    }

    const totalCitations = (allCitations || []).length;
    console.log('✅ Found ' + totalCitations + ' total citations');

    if (totalCitations === 0) {
      console.log('⚠️  No citations to analyze');
      return { success: true, message: 'No citations found', totalCitations: 0 };
    }

    // 5. Count citations per domain
    console.log('\n📊 Counting citations per domain...');
    const domainCounts = {};

    allCitations.forEach(citation => {
      const url = citation.url_inventory?.url;
      if (!url) return;

      const domain = extractDomain(url);
      if (!domain) return;

      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });

    console.log('✅ Citation counts:');
    Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([domain, count]) => {
        console.log('   ' + domain + ': ' + count);
      });

    // 6. Build citation share data for brand and competitors
    console.log('\n📈 Calculating citation shares...');
    const citationShareData = [];

    // Brand domain
    const brandCitationCount = domainCounts[brand.domain.toLowerCase()] || 0;
    const brandShare = totalCitations > 0 ? (brandCitationCount / totalCitations) * 100 : 0;

    citationShareData.push({
      domain: brand.domain.toLowerCase(),
      domain_type: 'brand',
      competitor_id: null,
      citation_count: brandCitationCount,
      citation_share: brandShare
    });

    console.log('   Brand (' + brand.domain + '): ' + brandCitationCount + ' citations (' + brandShare.toFixed(2) + '%)');

    // Competitor domains
    validCompetitors.forEach(competitor => {
      const competitorDomain = competitor.competitor_domain.toLowerCase();
      const competitorCitationCount = domainCounts[competitorDomain] || 0;
      const competitorShare = totalCitations > 0 ? (competitorCitationCount / totalCitations) * 100 : 0;

      citationShareData.push({
        domain: competitorDomain,
        domain_type: 'competitor',
        competitor_id: competitor.id,
        citation_count: competitorCitationCount,
        citation_share: competitorShare
      });

      console.log('   ' + competitor.competitor_name + ' (' + competitorDomain + '): ' +
                  competitorCitationCount + ' citations (' + competitorShare.toFixed(2) + '%)');
    });

    // 7. Calculate rankings
    console.log('\n🏆 Calculating rankings...');
    citationShareData.sort((a, b) => b.citation_share - a.citation_share);
    citationShareData.forEach((data, index) => {
      data.rank = index + 1;
    });

    // 8. Save to database
    console.log('\n💾 Saving citation share stats...');

    // Delete existing stats for this daily report (in case of recalculation)
    await supabase
      .from('citation_share_stats')
      .delete()
      .eq('daily_report_id', dailyReportId);

    // Insert new stats
    const records = citationShareData.map(data => ({
      daily_report_id: dailyReportId,
      brand_id: report.brand_id,
      report_date: report.report_date,
      domain: data.domain,
      domain_type: data.domain_type,
      competitor_id: data.competitor_id,
      citation_count: data.citation_count,
      total_citations: totalCitations,
      citation_share: data.citation_share,
      rank: data.rank
    }));

    const { error: insertError } = await supabase
      .from('citation_share_stats')
      .insert(records);

    if (insertError) {
      throw new Error('Failed to save citation share stats: ' + insertError.message);
    }

    console.log('✅ Saved ' + records.length + ' citation share records');

    // 9. Display final rankings
    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL CITATION SHARE RANKINGS');
    console.log('='.repeat(70));
    citationShareData.forEach(data => {
      const isBrand = data.domain_type === 'brand';
      const label = isBrand ? '(YOUR BRAND)' : '';
      console.log(data.rank + '. ' + data.domain + ' ' + label);
      console.log('   Share: ' + data.citation_share.toFixed(2) + '% (' + data.citation_count + '/' + totalCitations + ' citations)');
    });
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      totalCitations,
      brandRank: citationShareData.find(d => d.domain_type === 'brand')?.rank || 0,
      brandShare: brandShare.toFixed(2),
      totalDomains: citationShareData.length
    };

  } catch (error) {
    console.error('\n❌ CITATION SHARE CALCULATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  calculateCitationShare
};
