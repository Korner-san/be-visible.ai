-- Create get_citation_sources RPC function
-- Returns citation domain stats for the Citation Sources table
-- Uses SECURITY DEFINER to bypass RLS (validates brand ownership internally)
-- Uses url_citations table for accurate URL matching

CREATE OR REPLACE FUNCTION public.get_citation_sources(
  p_brand_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE(
  domain TEXT,
  urls_count BIGINT,
  mentions_count BIGINT,
  prompt_coverage BIGINT,
  total_active_prompts BIGINT,
  top_urls JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller owns this brand (or it's a demo brand)
  IF NOT EXISTS (
    SELECT 1 FROM brands
    WHERE id = p_brand_id
      AND (owner_user_id = auth.uid() OR is_demo = true)
  ) THEN
    RAISE EXCEPTION 'Access denied: you do not own this brand';
  END IF;

  RETURN QUERY
  WITH brand_reports AS (
    SELECT dr.id
    FROM daily_reports dr
    WHERE dr.brand_id = p_brand_id
      AND dr.status = 'completed'
      AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
      AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
  ),
  brand_prompt_results AS (
    SELECT pr.id, pr.brand_prompt_id
    FROM prompt_results pr
    WHERE pr.daily_report_id IN (SELECT id FROM brand_reports)
      AND pr.provider_status = 'ok'
  ),
  -- Count total distinct active prompts that had results in this period
  active_prompts AS (
    SELECT COUNT(DISTINCT brand_prompt_id) AS cnt
    FROM brand_prompt_results
  ),
  -- Get all citations with their URLs
  brand_citations AS (
    SELECT
      uc.url_id,
      uc.prompt_result_id
    FROM url_citations uc
    WHERE uc.prompt_result_id IN (SELECT id FROM brand_prompt_results)
  ),
  -- Join citations to prompt_results for brand_prompt_id
  citation_with_prompt AS (
    SELECT
      bc.url_id,
      ui.url AS original_url,
      ui.domain AS url_domain,
      bpr.brand_prompt_id
    FROM brand_citations bc
    JOIN url_inventory ui ON ui.id = bc.url_id
    JOIN brand_prompt_results bpr ON bpr.id = bc.prompt_result_id
  ),
  -- Aggregate by domain
  domain_stats AS (
    SELECT
      cwp.url_domain AS domain_name,
      COUNT(DISTINCT cwp.url_id) AS unique_urls,
      COUNT(*) AS total_mentions,
      COUNT(DISTINCT cwp.brand_prompt_id) AS prompts_covered
    FROM citation_with_prompt cwp
    WHERE cwp.url_domain IS NOT NULL
    GROUP BY cwp.url_domain
  ),
  -- Get top 3 URLs per domain
  url_counts AS (
    SELECT
      cwp.url_domain,
      cwp.original_url,
      COUNT(*) AS url_citation_count,
      ROW_NUMBER() OVER (PARTITION BY cwp.url_domain ORDER BY COUNT(*) DESC) AS rn
    FROM citation_with_prompt cwp
    WHERE cwp.original_url IS NOT NULL
    GROUP BY cwp.url_domain, cwp.original_url
  )
  SELECT
    ds.domain_name,
    ds.unique_urls,
    ds.total_mentions,
    ds.prompts_covered,
    ap.cnt,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('url', uc.original_url, 'citations', uc.url_citation_count))
       FROM url_counts uc
       WHERE uc.url_domain = ds.domain_name AND uc.rn <= 3),
      '[]'::jsonb
    ) AS top_urls_json
  FROM domain_stats ds
  CROSS JOIN active_prompts ap
  ORDER BY ds.total_mentions DESC;
END;
$$;

COMMENT ON FUNCTION public.get_citation_sources IS 'Returns citation domain stats with prompt coverage for the Citation Sources table. SECURITY DEFINER to bypass RLS.';
