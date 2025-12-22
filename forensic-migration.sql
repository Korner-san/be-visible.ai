-- ============================================================================
-- FORENSIC VISIBILITY PANEL - DATABASE MIGRATION
-- ============================================================================
-- Purpose: Add forensic tracking for Browserless session states and citation extraction
-- No health scores - just raw operational data

-- ============================================================================
-- 1. CREATE automation_forensics TABLE
-- ============================================================================
-- Logs every session connection attempt with raw state data

CREATE TABLE IF NOT EXISTS automation_forensics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Session Identity
  chatgpt_account_id UUID REFERENCES chatgpt_accounts(id),
  chatgpt_account_email TEXT NOT NULL,
  browserless_session_id TEXT,
  proxy_used TEXT, -- Format: "IP:PORT"

  -- Connection State (Raw Browserless/Playwright response)
  connection_status TEXT NOT NULL, -- 'Connected' | 'Locked' | 'Terminated' | 'Timeout' | 'Error'
  connection_error_raw TEXT, -- Raw error string from Playwright

  -- Visual State (What we see in the browser DOM)
  visual_state TEXT, -- 'Logged_In' | 'Sign_In_Button' | 'Captcha' | 'Blank' | 'Unknown'
  visual_state_details JSONB, -- { hasTextarea: bool, hasLoginButton: bool, hasUserMenu: bool, url: string }

  -- Context
  operation_type TEXT NOT NULL, -- 'initialization' | 'batch_execution' | 'health_check'
  batch_id UUID, -- Links to daily_schedules.id if this was during batch execution

  -- Diagnostics
  playwright_cdp_url TEXT, -- The WebSocket URL used
  response_time_ms INT, -- How long connection took

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX idx_automation_forensics_timestamp ON automation_forensics(timestamp DESC);
CREATE INDEX idx_automation_forensics_account ON automation_forensics(chatgpt_account_id);
CREATE INDEX idx_automation_forensics_session ON automation_forensics(browserless_session_id);

-- ============================================================================
-- 2. UPDATE chatgpt_accounts TABLE
-- ============================================================================
-- Add forensic tracking columns

ALTER TABLE chatgpt_accounts
ADD COLUMN IF NOT EXISTS last_visual_state TEXT, -- Most recent DOM state
ADD COLUMN IF NOT EXISTS last_visual_state_at TIMESTAMPTZ, -- When we last checked
ADD COLUMN IF NOT EXISTS cookies_created_at TIMESTAMPTZ, -- When cookies were first uploaded (NOT session_created_at)
ADD COLUMN IF NOT EXISTS last_initialization_attempt TIMESTAMPTZ, -- Last time initialize script ran
ADD COLUMN IF NOT EXISTS last_initialization_result TEXT; -- 'success' | 'failed' | 'partial'

-- Backfill cookies_created_at from session_created_at for existing data
UPDATE chatgpt_accounts
SET cookies_created_at = session_created_at
WHERE cookies_created_at IS NULL AND session_created_at IS NOT NULL;

-- ============================================================================
-- 3. UPDATE prompt_results TABLE
-- ============================================================================
-- Add session tracking for citation forensics

ALTER TABLE prompt_results
ADD COLUMN IF NOT EXISTS browserless_session_id_used TEXT, -- Which session executed this prompt
ADD COLUMN IF NOT EXISTS execution_visual_state TEXT; -- Visual state when this prompt was executed

-- ============================================================================
-- 4. CREATE FORENSIC VIEWS (Convenience)
-- ============================================================================

-- View: Last 24 hours of session attempts per account
CREATE OR REPLACE VIEW v_forensic_session_attempts_24h AS
SELECT
  af.chatgpt_account_email,
  af.browserless_session_id,
  af.proxy_used,
  af.timestamp,
  af.connection_status,
  af.visual_state,
  af.operation_type,
  af.connection_error_raw
FROM automation_forensics af
WHERE af.timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY af.timestamp DESC;

-- View: Citation extraction rate by account (last 7 days)
CREATE OR REPLACE VIEW v_forensic_citation_rates AS
SELECT
  ca.email,
  ca.browserless_session_id,
  COUNT(pr.id) as total_prompts,
  COUNT(pr.id) FILTER (WHERE array_length(pr.chatgpt_citations, 1) > 0) as prompts_with_citations,
  COUNT(pr.id) FILTER (WHERE array_length(pr.chatgpt_citations, 1) IS NULL OR array_length(pr.chatgpt_citations, 1) = 0) as prompts_without_citations,
  ROUND(
    (COUNT(pr.id) FILTER (WHERE array_length(pr.chatgpt_citations, 1) > 0)::numeric / NULLIF(COUNT(pr.id), 0)) * 100,
    1
  ) as citation_rate_pct,
  MAX(pr.created_at) as last_prompt_at
FROM chatgpt_accounts ca
LEFT JOIN prompt_results pr ON pr.browserless_session_id_used = ca.browserless_session_id
WHERE pr.created_at >= NOW() - INTERVAL '7 days'
  AND pr.provider = 'chatgpt'
GROUP BY ca.email, ca.browserless_session_id;

-- View: Today's and tomorrow's schedule with forensic data
CREATE OR REPLACE VIEW v_forensic_schedule_queue AS
SELECT
  ds.id,
  ds.schedule_date,
  ds.batch_number,
  ds.execution_time,
  ds.status,
  ds.batch_size,
  ca.email as account_assigned,
  ca.proxy_host || ':' || ca.proxy_port as proxy_assigned,
  ca.last_visual_state as account_last_visual_state,
  ca.browserless_session_id as session_id_assigned,
  b.name as brand_name,
  u.email as user_email
FROM daily_schedules ds
LEFT JOIN chatgpt_accounts ca ON ds.chatgpt_account_id = ca.id
LEFT JOIN brands b ON ds.brand_id = b.id
LEFT JOIN users u ON ds.user_id = u.id
WHERE ds.schedule_date >= CURRENT_DATE
  AND ds.schedule_date <= CURRENT_DATE + INTERVAL '1 day'
ORDER BY ds.execution_time ASC;

-- ============================================================================
-- 5. GRANT PERMISSIONS (if using RLS)
-- ============================================================================

-- Allow service role to read/write forensics
GRANT ALL ON automation_forensics TO service_role;
GRANT ALL ON v_forensic_session_attempts_24h TO service_role;
GRANT ALL ON v_forensic_citation_rates TO service_role;
GRANT ALL ON v_forensic_schedule_queue TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Instrument initialize-persistent-session-db-driven.js
-- 3. Instrument executors/chatgpt-executor.js
-- 4. Create /app/forensic/page.tsx
