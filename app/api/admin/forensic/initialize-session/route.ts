import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

/**
 * POST /api/admin/forensic/initialize-session
 *
 * Triggers re-initialization of a Browserless session for a specific ChatGPT account
 * The account's proxy, cookies, and session ID are already stored in the database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountEmail } = body

    if (!accountEmail) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: accountEmail'
      }, { status: 400 })
    }

    console.log(`🔄 [FORENSIC] Re-initializing session for account: ${accountEmail}`)

    // Path to the initialization script
    const scriptPath = path.join(process.cwd(), 'initialize-persistent-session-INSTRUMENTED.js')

    // Spawn the initialization script as a child process
    const initProcess = spawn('node', [scriptPath], {
      env: {
        ...process.env,
        CHATGPT_ACCOUNT_EMAIL: accountEmail
      },
      cwd: process.cwd()
    })

    let stdout = ''
    let stderr = ''

    // Collect output
    initProcess.stdout.on('data', (data) => {
      stdout += data.toString()
      console.log(`[INIT OUTPUT] ${data.toString()}`)
    })

    initProcess.stderr.on('data', (data) => {
      stderr += data.toString()
      console.error(`[INIT ERROR] ${data.toString()}`)
    })

    // Wait for process to complete
    const exitCode = await new Promise<number>((resolve) => {
      initProcess.on('close', (code) => {
        resolve(code || 0)
      })
    })

    if (exitCode === 0) {
      console.log(`✅ [FORENSIC] Session re-initialized successfully for ${accountEmail}`)
      return NextResponse.json({
        success: true,
        message: `Session re-initialized successfully for ${accountEmail}`,
        output: stdout
      })
    } else {
      console.error(`❌ [FORENSIC] Session re-initialization failed for ${accountEmail}`)
      return NextResponse.json({
        success: false,
        error: 'Re-initialization failed',
        message: stderr || stdout,
        exitCode
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ [FORENSIC] Unexpected error during re-initialization:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
