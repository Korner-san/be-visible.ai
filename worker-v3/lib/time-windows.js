const { CONFIG } = require('./config');

function utcDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function atUtc(dateString, hour, minute = 0) {
  return new Date(`${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
}

function getDailyWindows(date = new Date()) {
  const day = utcDateString(date);
  return {
    day,
    primaryStart: atUtc(day, CONFIG.primaryWindowStartHourUtc),
    primaryEnd: atUtc(day, CONFIG.primaryWindowEndHourUtc),
    retryPlanningStart: atUtc(day, CONFIG.retryPlanningStartHourUtc),
    retryPlanningEnd: new Date(atUtc(day, CONFIG.retryPlanningStartHourUtc).getTime() + CONFIG.retryPlanningMinutes * 60 * 1000),
    retryEnd: atUtc(day, CONFIG.retryWindowEndHourUtc, CONFIG.retryWindowEndMinuteUtc),
    eodAt: atUtc(day, 23, 59),
  };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

module.exports = {
  utcDateString,
  atUtc,
  getDailyWindows,
  addMinutes,
  addHours,
};
