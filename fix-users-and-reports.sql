-- ============================================================================
-- FIX: Set only korenk878@gmail.com as Basic user, delete today's failed reports
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fxonuvptbpmmvqsrqbvn/sql/new
-- ============================================================================

-- 1. Set ALL users to free_trial EXCEPT korenk878@gmail.com
UPDATE users 
SET 
  subscription_plan = 'free_trial',
  reports_enabled = false,
  updated_at = NOW()
WHERE email != 'korenk878@gmail.com';

-- 2. Ensure korenk878@gmail.com is on basic plan with reports enabled
UPDATE users 
SET 
  subscription_plan = 'basic',
  reports_enabled = true,
  updated_at = NOW()
WHERE email = 'korenk878@gmail.com';

-- 3. Ensure ChatGPT account exists and is active
UPDATE chatgpt_accounts
SET 
  status = 'active',
  error_message = NULL,
  updated_at = NOW()
WHERE email = 'kk1995current@gmail.com';

-- 4. Delete today's failed reports so they can be regenerated
DELETE FROM daily_reports 
WHERE report_date = CURRENT_DATE;

-- 5. Delete failed prompt results from today
DELETE FROM prompt_results
WHERE daily_report_id IN (
  SELECT id FROM daily_reports WHERE report_date = CURRENT_DATE
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check users (should show only korenk878@gmail.com as basic)
SELECT 
  email,
  subscription_plan,
  reports_enabled,
  created_at
FROM users
ORDER BY 
  CASE 
    WHEN subscription_plan = 'basic' THEN 1
    WHEN subscription_plan = 'free_trial' THEN 2
    ELSE 3
  END,
  created_at DESC;

-- Check ChatGPT account (should be active)
SELECT 
  email,
  display_name,
  account_type,
  status,
  updated_at
FROM chatgpt_accounts
WHERE email = 'kk1995current@gmail.com';

-- Check today's reports (should be 0)
SELECT COUNT(*) as todays_reports
FROM daily_reports
WHERE report_date = CURRENT_DATE;

