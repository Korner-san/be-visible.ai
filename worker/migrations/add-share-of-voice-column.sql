-- Add share_of_voice_data column to daily_reports
-- Run this on Supabase SQL Editor before deploying

ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS share_of_voice_data jsonb;

-- Stored format:
-- {
--   "entities": [
--     {"name": "Incredibuild", "mentions": 15, "type": "brand"},
--     {"name": "GitLab CI", "mentions": 12, "type": "competitor"},
--     {"name": "CircleCI", "mentions": 8, "type": "competitor"},
--     {"name": "Bazel", "mentions": 4, "type": "other"}
--   ],
--   "total_mentions": 47,
--   "calculated_at": "2025-01-15T12:00:00Z"
-- }
