#!/usr/bin/env node
/**
 * Phase 4: Universal Batch Executor
 *
 * Called by cron with a schedule ID parameter
 * Routes to appropriate batch-size script based on database
 * Centralizes error handling and status updates
 *
 * Usage: node execute-batch.js <schedule_id>
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Log directory setup
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Get schedule ID from command line
const scheduleId = process.argv[2];

if (!scheduleId) {
  console.error('❌ Usage: node execute-batch.js <schedule_id>');
  process.exit(1);
}

const aioScript = path.join(__dirname, 'run-google-aio-prompts.js');
const claudeScript = path.join(__dirname, 'run-claude-prompts.js');

/**
 * Upsert a batch_model_executions row. Returns the row id.
 */
async function upsertBME(scheduleId, model, data) {
  const { data: row, error } = await supabase
    .from('batch_model_executions')
    .upsert({ schedule_id: scheduleId, model, ...data }, { onConflict: 'schedule_id,model' })
    .select('id')
    .single();
  if (error) console.warn(`[BME] Failed to upsert ${model}:`, error.message);
  return row?.id || null;
}

/**
 * After a batch completes, check if all batches for this brand+date are done.
 * If so, spawn end-of-day-processor after a 5-minute delay (to let AIO/Claude finish).
 * Uses a lockfile to prevent multiple concurrent batches from each spawning their own EOD.
 */
async function triggerEODIfAllBatchesDone(brandId, scheduleDate, dailyReportId) {
  try {
    const { data: remaining } = await supabase
      .from('daily_schedules')
      .select('id')
      .eq('brand_id', brandId)
      .eq('schedule_date', scheduleDate)
      .in('status', ['pending', 'running']);

    if (remaining && remaining.length > 0) {
      console.log(`[EOD] ${remaining.length} batch(es) still pending/running — EOD deferred`);
      return;
    }

    // Lockfile prevents multiple finishing batches from each spawning EOD
    const lockFile = `/tmp/eod-trigger-${dailyReportId}.lock`;
    if (fs.existsSync(lockFile)) {
      console.log('[EOD] Lock file exists — EOD already queued by another batch');
      return;
    }
    try { fs.writeFileSync(lockFile, String(process.pid)); } catch (e) {
      console.warn('[EOD] Could not write lock file:', e.message);
      return;
    }
    // Race check: verify our PID won the write
    const lockContent = fs.readFileSync(lockFile, 'utf8').trim();
    if (lockContent !== String(process.pid)) {
      console.log('[EOD] Lost lock race — another batch will trigger EOD');
      return;
    }

    console.log('[EOD] All batches done — EOD will fire in 5 minutes (allowing AIO/Claude to finish)...');
    const eodScript = path.join(__dirname, 'end-of-day-processor.js');
    const logPath = `/tmp/eod-daily-${brandId.substring(0, 8)}-${scheduleDate}.log`;
    let logFd;
    try { logFd = fs.openSync(logPath, 'w'); } catch (e) { logFd = null; }

    const child = spawn('bash', [
      '-c',
      `sleep 300 && node "${eodScript}" "${dailyReportId}" && rm -f "${lockFile}"`
    ], {
      stdio: ['ignore', logFd || 'ignore', logFd || 'ignore'],
      cwd: __dirname,
      detached: true,
      env: { ...process.env, EOD_PROVIDERS: 'chatgpt,google_ai_overview,claude' },
    });
    try { if (logFd !== null) fs.closeSync(logFd); } catch (e) {}
    child.unref();
    console.log(`[EOD] EOD scheduled in 5 min — log: ${logPath}`);
  } catch (err) {
    console.warn('[EOD] Failed to check/trigger EOD:', err.message);
  }
}

/**
 * Fire-and-forget spawn of AIO or Claude script for a batch's prompts.
 * Logs to /tmp/<label>-<brandSlug>-batch<num>.log
 * bmeId: the batch_model_executions row id for this model (passed to child as MODEL_EXECUTION_ID)
 */
function spawnExtraModel(script, envKey, label, brandId, batchNumber, dailyReportId, promptIds, bmeId) {
  if (!process.env[envKey]) {
    console.log(`[BATCH] Skipping ${label} — ${envKey} not set`);
    return;
  }
  const logPath = `/tmp/${label}-${brandId.substring(0, 8)}-batch${batchNumber}.log`;
  let logFd;
  try { logFd = fs.openSync(logPath, 'w'); } catch (e) { logFd = null; }
  const child = spawn('node', [script], {
    stdio: ['ignore', logFd || 'ignore', logFd || 'ignore'],
    cwd: __dirname,
    detached: true,
    env: {
      ...process.env,
      BRAND_ID: brandId,
      DAILY_REPORT_ID: dailyReportId,
      PROMPT_IDS_JSON: JSON.stringify(promptIds),
      MODEL_EXECUTION_ID: bmeId || '',
    },
  });
  try { if (logFd !== null) fs.closeSync(logFd); } catch (e) {}
  child.unref();
  console.log(`[BATCH] Spawned ${label} for ${promptIds.length} prompts → log: ${logPath}`);
}

async function executeBatch() {
  const startTime = new Date();

  console.log('\n' + '='.repeat(70));
  console.log('🚀 UNIVERSAL BATCH EXECUTOR');
  console.log('='.repeat(70));
  console.log(`Schedule ID: ${scheduleId}`);
  console.log(`Timestamp: ${startTime.toISOString()}`);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Fetch schedule from database
    console.log('📊 Loading schedule from database...');
    const { data: schedule, error } = await supabase
      .from('daily_schedules')
      .select('*')
      .eq('id', scheduleId)
      .single();

    if (error || !schedule) {
      throw new Error(`Schedule not found: ${error?.message || 'No data'}`);
    }

    console.log('✅ Schedule loaded:');
    console.log(`   Date: ${schedule.schedule_date}`);
    console.log(`   Batch Number: ${schedule.batch_number}`);
    console.log(`   Batch Size: ${schedule.batch_size}`);
    console.log(`   User ID: ${schedule.user_id}`);
    console.log(`   Status: ${schedule.status}`);

    // 2. Check if already running/completed
    if (schedule.status === 'running') {
      console.log('⚠️  Batch already running - skipping');
      process.exit(0);
    }

    if (schedule.status === 'completed') {
      console.log('⚠️  Batch already completed - skipping');
      process.exit(0);
    }

    // 2.5. Guard against concurrent daily-vs-daily execution on the same Browserless session.
    // Browserless only allows one active CDP connection per session (429 if violated).
    // If another daily batch for this account is already running, kill it and take over —
    // overlapping batches mean something overran or was double-triggered by mistake.
    // 30-min zombie cutoff: ignore stale 'running' rows with no live process behind them.
    if (schedule.chatgpt_account_id) {
      const zombieCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: concurrentBatches } = await supabase
        .from('daily_schedules')
        .select('id, batch_number, started_at')
        .eq('chatgpt_account_id', schedule.chatgpt_account_id)
        .eq('status', 'running')
        .gt('started_at', zombieCutoff)
        .neq('id', scheduleId);

      if (concurrentBatches && concurrentBatches.length > 0) {
        const other = concurrentBatches[0];
        console.log(`⚠️  Account already in use by daily batch ${other.batch_number} (started ${other.started_at})`);
        console.log('   Killing conflicting process to free the Browserless session...');

        // Find all processes referencing the conflicting schedule ID and kill them
        try {
          const { execSync } = require('child_process');
          const psOut = execSync(`ps aux | grep "${other.id}" | grep -v grep`, { encoding: 'utf8' });
          const pids = psOut.trim().split('\n')
            .map(line => parseInt(line.trim().split(/\s+/)[1]))
            .filter(pid => !isNaN(pid) && pid !== process.pid);

          if (pids.length > 0) {
            console.log(`   Killing PIDs: ${pids.join(', ')}`);
            for (const pid of pids) {
              try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already dead */ }
            }
          } else {
            console.log('   No live processes found for conflicting batch (already exited)');
          }
        } catch (e) {
          console.log('   No live processes found for conflicting batch (already exited)');
        }

        // Mark the killed batch as failed
        await supabase
          .from('daily_schedules')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: `Killed: concurrent session conflict — preempted by batch ${schedule.batch_number}`
          })
          .eq('id', other.id);

        console.log(`   Daily batch ${other.batch_number} marked as failed`);

        // Brief pause so the Browserless WebSocket fully closes before we connect
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('   Proceeding with current batch...');
      }
    }

    // 2.6. Guard against onboarding-vs-daily conflict on the same Browserless session.
    if (schedule.chatgpt_account_id) {
      const { data: activeOnboarding } = await supabase
        .from('brand_prompts')
        .select('id, brand_id')
        .eq('onboarding_claimed_account_id', schedule.chatgpt_account_id)
        .eq('onboarding_status', 'claimed');

      if (activeOnboarding && activeOnboarding.length > 0) {
        console.log(`⚠️  Onboarding chunk is using this account (${activeOnboarding.length} claimed prompt(s))`);
        console.log('   Killing onboarding process to free the Browserless session...');

        try {
          const { execSync } = require('child_process');
          const accountId = schedule.chatgpt_account_id;
          const procFiles = execSync(
            `grep -rl "CHATGPT_ACCOUNT_ID=${accountId}" /proc/*/environ 2>/dev/null || true`,
            { encoding: 'utf8' }
          );
          const pids = procFiles.trim().split('\n')
            .map(f => parseInt((f.match(/\/proc\/(\d+)\//) || [])[1]))
            .filter(pid => !isNaN(pid) && pid !== process.pid);

          if (pids.length > 0) {
            console.log(`   Killing onboarding PIDs: ${pids.join(', ')}`);
            for (const pid of pids) {
              try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already dead */ }
            }
          } else {
            console.log('   No live onboarding process found (already exited)');
          }
        } catch (e) {
          console.log('   Could not search for onboarding process:', e.message);
        }

        const promptIds = activeOnboarding.map(p => p.id);
        await supabase
          .from('brand_prompts')
          .update({
            onboarding_status: 'failed',
            onboarding_claimed_account_id: null,
            onboarding_claimed_at: null,
          })
          .in('id', promptIds);

        console.log(`   Reset ${promptIds.length} prompt(s) to 'failed' — organizer will retry after batch completes`);

        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('   Proceeding with daily batch...');
      }
    }

    // 3. Update status to 'running'
    console.log('\n🔄 Updating status to "running"...');
    const { error: updateError } = await supabase
      .from('daily_schedules')
      .update({
        status: 'running',
        started_at: startTime.toISOString()
      })
      .eq('id', scheduleId);

    if (updateError) {
      console.error('⚠️  Failed to update status:', updateError);
    } else {
      console.log('✅ Status updated to "running"');
    }

    // 3b. Mark chatgpt model execution as running
    await upsertBME(scheduleId, 'chatgpt', {
      status: 'running',
      started_at: startTime.toISOString(),
      prompts_attempted: schedule.batch_size,
    });

    // 4. Determine which script to run based on batch size
    const scriptMap = {
      1: 'run-1-prompts-persistent.js',
      2: 'run-2-prompts-persistent.js',
      3: 'run-3-prompts-persistent.js',
      4: 'run-4-prompts-persistent.js',
      5: 'run-5-prompts-persistent.js',
      6: 'run-6-prompts-persistent.js'
    };

    const scriptToRun = scriptMap[schedule.batch_size];

    if (!scriptToRun) {
      throw new Error(`Invalid batch size: ${schedule.batch_size}`);
    }

    console.log(`\n📝 Executing: ${scriptToRun}`);
    console.log('─'.repeat(70) + '\n');

    // 5. Execute the batch script
    const result = await executeScript(scriptToRun, scheduleId);

    // 6. Update final status
    const endTime = new Date();
    const executionTime = Math.round((endTime - startTime) / 1000);

    if (result.success) {
      console.log('\n✅ Batch completed successfully!');
      console.log(`   Execution time: ${executionTime}s`);

      await supabase
        .from('daily_schedules')
        .update({ status: 'completed', completed_at: endTime.toISOString() })
        .eq('id', scheduleId);
      console.log('✅ Status updated to "completed"');

      await upsertBME(scheduleId, 'chatgpt', {
        status: 'completed',
        completed_at: endTime.toISOString(),
        prompts_attempted: schedule.batch_size,
        prompts_ok: schedule.batch_size,
      });

    } else {
      console.error('\n❌ Batch execution failed!');
      console.error(`   Error: ${result.error}`);
      if (result.detailedError) console.error(`   Details: ${result.detailedError}`);
      if (result.logFile) console.error(`   Log file: ${result.logFile}`);

      await supabase
        .from('daily_schedules')
        .update({
          status: 'failed',
          completed_at: endTime.toISOString(),
          error_message: result.error,
          error_details: JSON.stringify({
            detailedError: result.detailedError || result.error,
            exitCode: result.exitCode,
            logFile: result.logFile,
            timestamp: endTime.toISOString(),
            stderr: result.stderr ? result.stderr.slice(0, 500) : null,
            stdout: result.stdout ? result.stdout.slice(0, 500) : null
          })
        })
        .eq('id', scheduleId);
      console.log('✅ Status updated to "failed" with detailed error info');

      await upsertBME(scheduleId, 'chatgpt', {
        status: 'failed',
        completed_at: endTime.toISOString(),
        prompts_attempted: schedule.batch_size,
        prompts_failed: schedule.batch_size,
        error_message: result.error,
      });
    }

    // 7. Spawn Google AIO and Claude — always, regardless of ChatGPT result.
    //    They are independent API calls (SerpAPI / Anthropic) and don't depend on Browserless.
    if (schedule.brand_id && schedule.prompt_ids && schedule.prompt_ids.length > 0) {
      const { data: dailyReport } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('brand_id', schedule.brand_id)
        .eq('report_date', schedule.schedule_date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dailyReport?.id) {
        const nowIso = new Date().toISOString();
        const aioBmeId = await upsertBME(scheduleId, 'google_ai_overview', {
          status: 'running',
          started_at: nowIso,
          prompts_attempted: schedule.prompt_ids.length,
        });
        const claudeBmeId = await upsertBME(scheduleId, 'claude', {
          status: 'running',
          started_at: nowIso,
          prompts_attempted: schedule.prompt_ids.length,
        });
        spawnExtraModel(aioScript,    'SERPAPI_KEY',       'aio',    schedule.brand_id, schedule.batch_number, dailyReport.id, schedule.prompt_ids, aioBmeId);
        spawnExtraModel(claudeScript, 'ANTHROPIC_API_KEY', 'claude', schedule.brand_id, schedule.batch_number, dailyReport.id, schedule.prompt_ids, claudeBmeId);

        // 8. If this is the last batch for today, trigger EOD after AIO/Claude finish
        await triggerEODIfAllBatchesDone(schedule.brand_id, schedule.schedule_date, dailyReport.id);
      } else {
        console.log('[BATCH] No daily_report found for brand', schedule.brand_id, 'date', schedule.schedule_date, '— marking AIO/Claude as skipped');
        await upsertBME(scheduleId, 'google_ai_overview', { status: 'skipped', error_message: 'No daily report found' });
        await upsertBME(scheduleId, 'claude', { status: 'skipped', error_message: 'No daily report found' });
      }
    }

    if (!result.success) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);

    try {
      await supabase
        .from('daily_schedules')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('id', scheduleId);
      await upsertBME(scheduleId, 'chatgpt', {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
      });
    } catch (updateErr) {
      console.error('Failed to update error status:', updateErr);
    }

    process.exit(1);
  }
}

/**
 * Execute a batch script and capture output
 */
function executeScript(scriptName, scheduleId) {
  return new Promise((resolve) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `batch-${scheduleId}-${timestamp}.log`;
    const logFilePath = path.join(LOG_DIR, logFileName);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    logStream.write(`\n${'='.repeat(70)}\n`);
    logStream.write(`📋 BATCH EXECUTION LOG\n`);
    logStream.write(`Schedule ID: ${scheduleId}\n`);
    logStream.write(`Script: ${scriptName}\n`);
    logStream.write(`Started: ${new Date().toISOString()}\n`);
    logStream.write(`${'='.repeat(70)}\n\n`);

    const child = spawn('node', [scriptName], {
      env: {
        ...process.env,
        SCHEDULE_ID: scheduleId
      },
      cwd: __dirname
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      process.stdout.write(data);
      logStream.write(`[STDOUT] ${output}`);
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderrBuffer += output;
      process.stderr.write(data);
      logStream.write(`[STDERR] ${output}`);
    });

    child.on('close', (code) => {
      logStream.write(`\n${'='.repeat(70)}\n`);
      logStream.write(`Exit Code: ${code}\n`);
      logStream.write(`Completed: ${new Date().toISOString()}\n`);
      logStream.write(`${'='.repeat(70)}\n`);
      logStream.end();

      if (code === 0) {
        resolve({
          success: true,
          logFile: logFilePath
        });
      } else {
        const errorLines = stderrBuffer.split('\n').filter(line =>
          line.includes('Error') ||
          line.includes('error') ||
          line.includes('failed') ||
          line.includes('Failed') ||
          line.includes('ECONNREFUSED') ||
          line.includes('ETIMEDOUT') ||
          line.includes('WebSocket') ||
          line.includes('Session')
        );

        const detailedError = errorLines.length > 0
          ? errorLines.slice(0, 3).join(' | ')
          : stderrBuffer.slice(-500) || stdoutBuffer.slice(-500) || 'Unknown error';

        resolve({
          success: false,
          error: `Script exited with code ${code}`,
          detailedError: detailedError.trim(),
          exitCode: code,
          logFile: logFilePath,
          stderr: stderrBuffer.slice(-1000),
          stdout: stdoutBuffer.slice(-1000)
        });
      }
    });

    child.on('error', (err) => {
      logStream.write(`\n❌ SPAWN ERROR: ${err.message}\n`);
      logStream.write(`Stack: ${err.stack}\n`);
      logStream.end();

      resolve({
        success: false,
        error: `Failed to spawn script: ${err.message}`,
        detailedError: err.stack,
        logFile: logFilePath
      });
    });
  });
}

// Execute
executeBatch();
