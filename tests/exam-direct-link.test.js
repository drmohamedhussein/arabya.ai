/**
 * Direct exam link resolution (student opens ?exam= from teacher link)
 */
const assert = require("assert");

function findExamByDirectId(exams, requestedId) {
  return (exams || []).find(
    e => String(e.id).toLowerCase() === String(requestedId).toLowerCase()
  ) || null;
}

function filterExamsForDirectLock(exams, lockedExamId, targetTeacherUsername) {
  let filtered = exams || [];
  if (targetTeacherUsername) {
    filtered = filtered.filter(
      exam => exam.teacher === targetTeacherUsername || !exam.teacher
    );
  }
  if (lockedExamId) {
    filtered = filtered.filter(exam => exam.id === lockedExamId);
  }
  return filtered;
}

const defaults = [{ id: "arabic_grammar", title: "افتراضي", teacher: "معلم اللغة العربية" }];
const teacherExam = { id: "a1b2c3", title: "امتحان المعلم", teacher: "TEACHER2026" };
const all = [...defaults, teacherExam];

assert.strictEqual(findExamByDirectId(all, "A1B2C3").id, "a1b2c3");
assert.strictEqual(findExamByDirectId(all, "missing"), null);

const lockedOnly = filterExamsForDirectLock(all, "a1b2c3", "TEACHER2026");
assert.strictEqual(lockedOnly.length, 1);
assert.strictEqual(lockedOnly[0].id, "a1b2c3");

const lockedPending = filterExamsForDirectLock(defaults, "a1b2c3", "");
assert.strictEqual(lockedPending.length, 0);

console.log("All exam direct link tests passed.");
