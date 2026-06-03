/**
 * Exam endsAt deadline enforcement helpers.
 */
const assert = require("assert");

function isExamPastDeadline(exam, nowMs) {
  if (!exam || !exam.endsAt) return false;
  const end = new Date(exam.endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return nowMs > end.getTime();
}

function getMsUntilExamDeadline(exam, nowMs) {
  if (!exam?.endsAt) return null;
  const end = new Date(exam.endsAt);
  if (Number.isNaN(end.getTime())) return null;
  return end.getTime() - nowMs;
}

function getEffectiveQuestionTimeSeconds(questionSeconds, exam, nowMs) {
  const baseSeconds = questionSeconds;
  const msLeft = getMsUntilExamDeadline(exam, nowMs);
  if (msLeft === null) return baseSeconds;
  if (msLeft <= 0) return 0;
  return Math.min(baseSeconds, Math.max(1, Math.ceil(msLeft / 1000)));
}

const now = Date.parse("2026-06-02T12:00:00.000Z");
const exam = { endsAt: "2026-06-02T12:00:01.000Z" };
assert.strictEqual(isExamPastDeadline(exam, now), false);
assert.strictEqual(isExamPastDeadline(exam, now + 2000), true);
assert.strictEqual(getEffectiveQuestionTimeSeconds(60, exam, now), 1);

console.log("Exam deadline tests passed.");
