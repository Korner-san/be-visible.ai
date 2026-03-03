-- Two-Phase Onboarding Schema Changes
-- Adds columns for wave-based prompt dispatch, phase tracking, report anchoring, and partial flag

-- 1. brand_prompts: wave assignment (1 = Phase 1 first 6 prompts, 2 = Phase 2 remaining 24)
ALTER TABLE brand_prompts ADD COLUMN IF NOT EXISTS onboarding_wave INT DEFAULT 1;

-- 2. brands: current onboarding phase tracker (1 or 2)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS onboarding_phase INT DEFAULT 1;

-- 3. brands: anchor to Phase 1 daily_report (survives midnight crossover — Phase 2 uses same report)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS onboarding_daily_report_id UUID REFERENCES daily_reports(id);

-- 4. daily_reports: partial flag — true while Phase 2 still running (drives dashboard banner)
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT false;
