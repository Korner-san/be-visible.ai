-- Add 'phase1_complete' to brands.first_report_status allowed values
-- Required for two-phase onboarding: wave-1 done → phase1_complete → wave-2 dispatched

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_first_report_status_check;

ALTER TABLE brands ADD CONSTRAINT brands_first_report_status_check
  CHECK (first_report_status IN ('idle', 'queued', 'running', 'phase1_complete', 'succeeded', 'failed'));
