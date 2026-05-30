/**
 * Unit tests for exam security helpers (extracted logic)
 */
const assert = require("assert");

function getExamMaxCheatAttempts(exam) {
  if (!exam) return 5;
  const parsed = parseInt(exam.maxCheatAttempts, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 5;
  return parsed;
}

function shouldCancelExamForCheating(exam, violations) {
  const maxAttempts = getExamMaxCheatAttempts(exam);
  if (maxAttempts === 0) return false;
  return violations >= maxAttempts;
}

function findBlockingExamResult(results, studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  return results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}

const exam = { maxCheatAttempts: 1 };
assert.strictEqual(shouldCancelExamForCheating(exam, 1), true);
assert.strictEqual(shouldCancelExamForCheating(exam, 0), false);

const unlimitedExam = { maxCheatAttempts: 0 };
assert.strictEqual(shouldCancelExamForCheating(unlimitedExam, 99), false);

const defaultExam = {};
assert.strictEqual(getExamMaxCheatAttempts(defaultExam), 5);
assert.strictEqual(shouldCancelExamForCheating(defaultExam, 5), true);
assert.strictEqual(shouldCancelExamForCheating(defaultExam, 4), false);

const results = [
  { studentLookupKey: "code:12345", examId: "EX1", status: "completed", allowRetake: false },
  { studentLookupKey: "code:12345", examId: "EX2", status: "canceled", allowRetake: false },
  { studentLookupKey: "code:12345", examId: "EX3", status: "canceled", allowRetake: true }
];

assert.ok(findBlockingExamResult(results, "code:12345", "EX1"));
assert.ok(findBlockingExamResult(results, "code:12345", "EX2"));
assert.strictEqual(findBlockingExamResult(results, "code:12345", "EX3"), null);
assert.strictEqual(findBlockingExamResult(results, "code:99999", "EX1"), null);

console.log("All exam security tests passed.");
