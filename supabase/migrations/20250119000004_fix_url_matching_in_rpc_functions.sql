-- Fix URL matching in enhanced citation functions to handle www prefix variations

-- Drop and recreate get_enhanced_citation_urls_by_domain with improved URL matching
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
      normalize_url(citation->>'link') as normalized_url,
      citation->>'link' as original_url,
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
  ),
  url_stats AS (
    SELECT 
      normalized_url as url,
      COUNT(*) as times_cited,
      COUNT(DISTINCT result_id) as distinct_ai_responses,
      COUNT(DISTINCT brand_prompt_id) as prompt_coverage,
      COUNT(DISTINCT provider) as model_coverage,
      MIN(created_at) as first_seen_at,
      MAX(created_at) as last_seen_at
    FROM extracted_citations
    WHERE normalized_url IS NOT NULL
      AND extract_domain(normalized_url) = p_domain
    GROUP BY normalized_url
  )
  SELECT 
    us.url,
    us.times_cited,
    us.distinct_ai_responses,
    us.prompt_coverage,
    us.model_coverage,
    us.first_seen_at,
    us.last_seen_at,
    ucf.content_structure_category
  FROM url_stats us
  LEFT JOIN url_inventory ui ON (
    us.url = ui.url OR 
    us.url = ui.normalized_url OR
    -- Handle www prefix variations
    (us.url LIKE 'https://%' AND ui.url = REPLACE(us.url, 'https://', 'https://www.')) OR
    (us.url LIKE 'https://www.%' AND ui.url = REPLACE(us.url, 'https://www.', 'https://')) OR
    (us.url LIKE 'https://%' AND ui.normalized_url = REPLACE(us.url, 'https://', 'https://www.')) OR
    (us.url LIKE 'https://www.%' AND ui.normalized_url = REPLACE(us.url, 'https://www.', 'https://'))
  )
  LEFT JOIN url_content_facts ucf ON ui.id = ucf.url_id
  ORDER BY us.times_cited DESC, us.last_seen_at DESC;
END;
$$;
