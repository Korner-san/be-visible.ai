import express, { Request, Response } from 'express'
import cron from 'node-cron'
import dotenv from 'dotenv'
import { generateDailyReports } from './services/report-generator'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(express.json())

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// Manual trigger endpoint for daily report generation
app.post('/trigger-daily-reports', async (req: Request, res: Response) => {
  try {
    console.log('🚀 [WORKER] Manual trigger received for daily report generation')
    
    // Start the report generation process (non-blocking)
    generateDailyReports()
      .then(result => {
        console.log('✅ [WORKER] Daily reports completed:', result)
      })
      .catch(error => {
        console.error('❌ [WORKER] Daily reports failed:', error)
      })
    
    // Return immediately so the caller doesn't have to wait
    res.json({
      success: true,
      message: 'Daily report generation started',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ [WORKER] Error triggering daily reports:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to trigger daily reports',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Status endpoint to check current job status
app.get('/status', async (req: Request, res: Response) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    cronSchedule: process.env.CRON_SCHEDULE || '0 1 * * *'
  })
})

// Start the server
app.listen(PORT, () => {
  console.log(`✅ [WORKER] Server started on port ${PORT}`)
  console.log(`✅ [WORKER] Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`✅ [WORKER] Health check: http://localhost:${PORT}/health`)
  console.log(`✅ [WORKER] Manual trigger: POST http://localhost:${PORT}/trigger-daily-reports`)
  
  // Set up cron job for automatic daily report generation
  const cronSchedule = process.env.CRON_SCHEDULE || '0 1 * * *'
  console.log(`⏰ [WORKER] Setting up cron job with schedule: ${cronSchedule}`)
  
  cron.schedule(cronSchedule, async () => {
    console.log('⏰ [WORKER] Cron job triggered - Starting daily report generation')
    try {
      const result = await generateDailyReports()
      console.log('✅ [WORKER] Cron job completed:', result)
    } catch (error) {
      console.error('❌ [WORKER] Cron job failed:', error)
    }
  }, {
    timezone: 'UTC'
  })
  
  console.log('✅ [WORKER] Cron job scheduled successfully')
  
  // 🔥 AUTO-TRIGGER REPORT GENERATION ON STARTUP (for immediate testing)
  // This will run report generation automatically after deployment
  console.log('🚀 [WORKER] Starting immediate report generation in 5 seconds...')
  setTimeout(async () => {
    try {
      console.log('🔥 [WORKER] Triggering startup report generation NOW')
      const result = await generateDailyReports()
      console.log('✅ [WORKER] Startup report generation completed:', result)
    } catch (error) {
      console.error('❌ [WORKER] Startup report generation failed:', error)
    }
  }, 5000) // Wait 5 seconds after startup to ensure everything is ready
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ [WORKER] SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('⚠️ [WORKER] SIGINT received, shutting down gracefully')
  process.exit(0)
})


