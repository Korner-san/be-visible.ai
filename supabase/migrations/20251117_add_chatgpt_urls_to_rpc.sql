-- Add ChatGPT URL extraction to get_enhanced_citation_urls_by_domain RPC
-- This fixes the "No URLs found" issue when clicking on ChatGPT citation domains

DROP FUNCTION IF EXISTS public.get_enhanced_citation_urls_by_domain(uuid,text,date,date,text[]);

CREATE OR REPLACE FUNCTION public.get_enhanced_citation_urls_by_domain(
  p_brand_id UUID,
  p_domain TEXT,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_providers TEXT[] DEFAULT ARRAY['perplexity', 'google_ai_overview']
)
RETURNS TABLE(
  url TEXT,
  times_cited BIGINT,
  distinct_ai_responses BIGINT,
  prompt_coverage BIGINT,
  model_coverage BIGINT,
  first_seen_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  content_structure_category TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH extracted_citations AS (
    -- Extract citations from Perplexity
    SELECT 
      pr.id as result_id,
      pr.brand_prompt_id,
      pr.provider,
      pr.created_at,
      normalize_url(citation->>'url') as normalized_url,
      citation->>'url' as original_url,
      citation->>'title' as title
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.citations) AS citation
    WHERE pr.provider = 'perplexity'
      AND pr.citations IS NOT NULL
      AND jsonb_array_length(pr.citations) > 0
      AND pr.daily_report_id IN (
        SELECT dr.id 
        FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
      AND pr.provider = ANY(p_providers)
    
    UNION ALL
    
    -- Extract citations from Google AI Overview
    SELECT 
      pr.id as result_id,
      pr.brand_prompt_id,
      pr.provider,
      pr.created_at,
      normalize_url(citation->>'url') as normalized_url,
      citation->>'url' as original_url,
      citation->>'title' as title
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.google_ai_overview_citations) AS citation
    WHERE pr.provider = 'google_ai_overview'
      AND pr.google_ai_overview_citations IS NOT NULL
      AND jsonb_array_length(pr.google_ai_overview_citations) > 0
      AND pr.daily_report_id IN (
        SELECT dr.id 
        FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
      AND pr.provider = ANY(p_providers)
    
    UNION ALL
    
    -- Extract citations from ChatGPT (NEW)
    -- Note: chatgpt_citations is stored as text[] array, not jsonb
    SELECT 
      pr.id as result_id,
      pr.brand_prompt_id,
      pr.provider,
      pr.created_at,
      normalize_url(citation_url) as normalized_url,
      citation_url as original_url,
      NULL::text as title -- ChatGPT citations are plain URLs, no title
    FROM prompt_results pr
    CROSS JOIN unnest(pr.chatgpt_citations) AS citation_url -- Use unnest for text[] array
    WHERE pr.provider = 'chatgpt'
      AND pr.chatgpt_citations IS NOT NULL
      AND array_length(pr.chatgpt_citations, 1) > 0
      AND pr.daily_report_id IN (
        SELECT dr.id 
        FROM daily_reports dr
        WHERE dr.brand_id = p_brand_id
          AND dr.status = 'completed'
          AND (p_from_date IS NULL OR dr.report_date >= p_from_date)
          AND (p_to_date IS NULL OR dr.report_date <= p_to_date)
      )
      AND pr.provider = ANY(p_providers)
  ),
  domain_urls AS (
    SELECT 
      normalized_url,
      original_url,
      title,
      result_id,
      brand_prompt_id,
      provider,
      created_at
    FROM extracted_citations
    WHERE extract_domain(normalized_url) = p_domain
  ),
  url_aggregates AS (
    SELECT 
      du.normalized_url,
      du.original_url as sample_original_url,
      COUNT(*) as times_cited,
      COUNT(DISTINCT du.result_id) as distinct_ai_responses,
      COUNT(DISTINCT du.brand_prompt_id) as prompt_coverage,
      COUNT(DISTINCT du.provider) as model_coverage,
      MIN(du.created_at) as first_seen_at,
      MAX(du.created_at) as last_seen_at
    FROM domain_urls du
    GROUP BY du.normalized_url, du.original_url
  )
  SELECT 
    ua.sample_original_url as url,
    ua.times_cited,
    ua.distinct_ai_responses,
    ua.prompt_coverage,
    ua.model_coverage,
    ua.first_seen_at,
    ua.last_seen_at,
    ucf.content_structure_category
  FROM url_aggregates ua
  LEFT JOIN url_inventory ui ON ui.normalized_url = ua.normalized_url
  LEFT JOIN url_content_facts ucf ON ucf.url_id = ui.id
  ORDER BY ua.times_cited DESC, ua.last_seen_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_enhanced_citation_urls_by_domain IS 'Returns URLs for a specific domain with ChatGPT support. Used by the citations dashboard expandable rows.';

