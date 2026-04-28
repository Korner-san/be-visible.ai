const { CONFIG } = require('./config');

function minutes(value) {
  return value * 60 * 1000;
}

function calculateChatGptTiming(promptCount = CONFIG.promptsPerBatch, startedAt = new Date()) {
  const count = Math.max(1, Number(promptCount) || CONFIG.promptsPerBatch);

  // V3 product decision: 5-prompt ChatGPT/browser batch should not exceed 10 minutes.
  const hardTimeoutMinutes = count === 5
    ? 10
    : Math.ceil(2 + count * 1 + 3);

  const expectedMinutes = Math.min(hardTimeoutMinutes, Math.ceil(2 + count * 1));
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);

  return {
    promptCount: count,
    expectedMinutes,
    hardTimeoutMinutes,
    expectedDoneAt: new Date(start.getTime() + minutes(expectedMinutes)),
    hardTimeoutAt: new Date(start.getTime() + minutes(hardTimeoutMinutes)),
  };
}

function isPastHardTimeout(startedAt, promptCount, now = new Date()) {
  if (!startedAt) return false;
  const timing = calculateChatGptTiming(promptCount, new Date(startedAt));
  return now.getTime() >= timing.hardTimeoutAt.getTime();
}

module.exports = {
  calculateChatGptTiming,
  isPastHardTimeout,
};
