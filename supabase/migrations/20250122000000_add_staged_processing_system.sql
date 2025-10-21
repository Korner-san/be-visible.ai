-- Add staged processing system for reliable report generation
-- This migration adds job queue and processing stages

-- Add processing stage and job queue to daily_reports
ALTER TABLE daily_reports 
ADD COLUMN processing_stage TEXT DEFAULT 'initialized' CHECK (processing_stage IN ('initialized', 'perplexity', 'google_ai_overview', 'url_processing', 'completed', 'failed')),
ADD COLUMN next_processing_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN current_job_id UUID;

-- Create job queue table for staged processing
CREATE TABLE report_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_report_id UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('perplexity', 'google_ai_overview', 'url_processing')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  processing_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient job processing
CREATE INDEX idx_report_processing_jobs_status_scheduled ON report_processing_jobs(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_report_processing_jobs_daily_report_id ON report_processing_jobs(daily_report_id);
CREATE INDEX idx_report_processing_jobs_stage ON report_processing_jobs(stage);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_report_processing_jobs_updated_at 
    BEFORE UPDATE ON report_processing_jobs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up old completed jobs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_processing_jobs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM report_processing_jobs 
    WHERE status = 'completed' 
    AND completed_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for report_processing_jobs
ALTER TABLE report_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Policy for service role (cron jobs and background processing)
CREATE POLICY "Service role can manage all processing jobs" ON report_processing_jobs
    FOR ALL USING (true);

-- Policy for users to view their own brand's processing jobs
CREATE POLICY "Users can view their brand's processing jobs" ON report_processing_jobs
    FOR SELECT USING (
        daily_report_id IN (
            SELECT dr.id FROM daily_reports dr
            JOIN brands b ON dr.brand_id = b.id
            WHERE b.owner_user_id = auth.uid()
        )
    );

-- Add comment explaining the new system
COMMENT ON TABLE report_processing_jobs IS 'Job queue for staged report processing. Each report goes through: perplexity -> google_ai_overview -> url_processing stages.';
COMMENT ON COLUMN daily_reports.processing_stage IS 'Current stage of report processing: initialized, perplexity, google_ai_overview, url_processing, completed, failed';
COMMENT ON COLUMN daily_reports.next_processing_at IS 'When the next processing stage should be attempted (for retry logic)';
COMMENT ON COLUMN daily_reports.current_job_id IS 'ID of the currently running job for this report';
