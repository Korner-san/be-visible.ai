-- ========================================
-- VERIFICATION QUERY FOR OCTOBER 26 REPORT
-- ========================================
-- Run this in Supabase SQL Editor after triggering the report

-- 1. Check if October 26 report exists and is complete
SELECT 
  id,
  brand_id,
  report_date,
  status,
  generated,
  perplexity_status,
  google_ai_overview_status,
  url_processing_status,
  perplexity_attempted,
  perplexity_ok,
  perplexity_no_result,
  google_ai_overview_attempted,
  google_ai_overview_ok,
  google_ai_overview_no_result,
  urls_total,
  urls_extracted,
  urls_classified,
  created_at,
  completed_at
FROM daily_reports
WHERE report_date = '2025-10-26'
ORDER BY created_at DESC
LIMIT 1;

-- ✅ SUCCESS INDICATORS:
-- generated = true
-- status = 'completed'
-- perplexity_status = 'complete'
-- google_ai_overview_status = 'complete'
-- url_processing_status = 'complete'
-- perplexity_ok > 0 (ideally 15)
-- google_ai_overview_ok > 0 (ideally 14)
-- urls_classified > 0

-- ========================================

-- 2. Check prompt results count
SELECT 
  provider,
  provider_status,
  COUNT(*) as count
FROM prompt_results pr
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date = '2025-10-26'
GROUP BY provider, provider_status
ORDER BY provider, provider_status;

-- ✅ SHOULD SEE:
-- perplexity | ok | 15
-- google_ai_overview | ok | 14-15

-- ========================================

-- 3. Check URL processing results
SELECT 
  COUNT(DISTINCT ui.id) as total_urls,
  COUNT(DISTINCT CASE WHEN ui.content_extracted = true THEN ui.id END) as extracted_urls,
  COUNT(DISTINCT ucf.id) as classified_urls
FROM url_citations uc
JOIN url_inventory ui ON uc.url_id = ui.id
LEFT JOIN url_content_facts ucf ON ucf.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date = '2025-10-26';

-- ✅ SHOULD SEE:
-- total_urls > 0
-- extracted_urls > 0 (close to total_urls)
-- classified_urls > 0 (close to total_urls)

-- ========================================

-- 4. Check content structure classifications
SELECT 
  ucf.content_structure_category,
  COUNT(*) as count
FROM url_content_facts ucf
JOIN url_inventory ui ON ucf.url_id = ui.id
JOIN url_citations uc ON uc.url_id = ui.id
JOIN prompt_results pr ON uc.prompt_result_id = pr.id
JOIN daily_reports dr ON pr.daily_report_id = dr.id
WHERE dr.report_date = '2025-10-26'
  AND ucf.content_structure_category IS NOT NULL
GROUP BY ucf.content_structure_category
ORDER BY count DESC;

-- ✅ SHOULD SEE:
-- Various categories like:
-- - Blog Post
-- - Product Page
-- - Documentation
-- - News Article
-- etc.

-- ========================================

-- 5. Quick health check - Last 3 reports
SELECT 
  report_date,
  generated,
  status,
  perplexity_ok,
  google_ai_overview_ok,
  urls_classified,
  completed_at
FROM daily_reports
ORDER BY report_date DESC
LIMIT 3;

-- ========================================

