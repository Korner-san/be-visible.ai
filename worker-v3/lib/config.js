const path = require('path');

const WORKER_V3_ROOT = path.resolve(__dirname, '..');
const LEGACY_WORKER_ROOT = path.resolve(WORKER_V3_ROOT, '..', 'worker');

const PROVIDERS = ['chatgpt', 'google_ai_overview', 'claude'];

const PRIORITY = {
  daily: 100,
  retry: 80,
  onboarding_phase1: 60,
  onboarding_phase2: 40,
};

const CONFIG = {
  workerV3Root: WORKER_V3_ROOT,
  legacyWorkerRoot: LEGACY_WORKER_ROOT,
  providers: PROVIDERS,
  priority: PRIORITY,
  promptsPerBatch: 5,
  dailyProtectionMinutes: 10,
  phase2LookaheadHours: 8,
  primaryWindowStartHourUtc: 0,
  primaryWindowEndHourUtc: 20,
  retryPlanningStartHourUtc: 20,
  retryPlanningMinutes: 5,
  retryWindowEndHourUtc: 23,
  retryWindowEndMinuteUtc: 59,
  leaseHeartbeatSeconds: 30,
  leaseCooldownMinutes: 5,
};

function isExecuteMode(argv = process.argv, env = process.env) {
  return argv.includes('--execute') || env.WORKER_V3_EXECUTE === 'true';
}

function modeLabel(execute) {
  return execute ? 'EXECUTE' : 'DRY-RUN';
}

module.exports = {
  CONFIG,
  isExecuteMode,
  modeLabel,
};
