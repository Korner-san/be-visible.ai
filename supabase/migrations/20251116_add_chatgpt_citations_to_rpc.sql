-- Add ChatGPT citations support to get_enhanced_citations_by_domain RPC function

DROP FUNCTION IF EXISTS public.get_enhanced_citations_by_domain(uuid,date,date,text[]);

CREATE OR REPLACE FUNCTION public.get_enhanced_citations_by_domain(
  p_brand_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_providers TEXT[] DEFAULT ARRAY['chatgpt']  -- Changed default to match ACTIVE_PROVIDERS
)
RETURNS TABLE(
  domain TEXT,
  urls_count BIGINT,
  mentions_count BIGINT,
  distinct_ai_responses BIGINT,
  prompt_coverage BIGINT,
  model_coverage BIGINT,
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
    
    UNION ALL
    
    -- Extract citations from ChatGPT (NEW)
    SELECT 
      pr.id as result_id,
      pr.brand_prompt_id,
      pr.provider,
      pr.created_at,
      -- ChatGPT citations are stored as plain URL strings or objects with 'url' field
      CASE 
        WHEN jsonb_typeof(citation) = 'string' THEN normalize_url(citation#>>'{}')
        ELSE normalize_url(citation->>'url')
      END as normalized_url,
      CASE 
        WHEN jsonb_typeof(citation) = 'string' THEN citation#>>'{}'
        ELSE citation->>'url'
      END as original_url,
      CASE 
        WHEN jsonb_typeof(citation) = 'object' THEN citation->>'title'
        ELSE NULL
      END as title
    FROM prompt_results pr
    CROSS JOIN jsonb_array_elements(pr.chatgpt_citations) AS citation
    WHERE pr.provider = 'chatgpt'
      AND pr.chatgpt_citations IS NOT NULL
      AND jsonb_array_length(pr.chatgpt_citations) > 0
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
  domain_stats AS (
    SELECT 
      extract_domain(ec.normalized_url) as domain_name,
      COUNT(DISTINCT ec.normalized_url) as urls_count,
      COUNT(*) as mentions_count,
      COUNT(DISTINCT ec.result_id) as distinct_ai_responses,
      COUNT(DISTINCT ec.brand_prompt_id) as prompt_coverage,
      COUNT(DISTINCT ec.provider) as model_coverage,
      MAX(ec.created_at) as last_seen_at
    FROM extracted_citations ec
    WHERE ec.normalized_url IS NOT NULL
    GROUP BY extract_domain(ec.normalized_url)
  ),
  domain_categories AS (
    SELECT 
      ui.domain as domain_name,
      ucf.content_structure_category,
      COUNT(*) as category_count
    FROM url_inventory ui
    JOIN url_content_facts ucf ON ui.id = ucf.url_id
    WHERE ucf.content_structure_category IS NOT NULL
    GROUP BY ui.domain, ucf.content_structure_category
  ),
  domain_most_common_category AS (
    SELECT 
      dc.domain_name,
      dc.content_structure_category,
      ROW_NUMBER() OVER (PARTITION BY dc.domain_name ORDER BY dc.category_count DESC) as rn
    FROM domain_categories dc
  )
  SELECT 
    ds.domain_name,
    ds.urls_count,
    ds.mentions_count,
    ds.distinct_ai_responses,
    ds.prompt_coverage,
    ds.model_coverage,
    ds.last_seen_at,
    dmcc.content_structure_category
  FROM domain_stats ds
  LEFT JOIN domain_most_common_category dmcc ON ds.domain_name = dmcc.domain_name AND dmcc.rn = 1
  WHERE ds.domain_name IS NOT NULL
  ORDER BY ds.urls_count DESC, ds.mentions_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_enhanced_citations_by_domain IS 'Returns citation domains with counts, supports ChatGPT, Perplexity, and Google AI Overview';

