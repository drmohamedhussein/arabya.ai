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

function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
}

function sanitizeStudentCodeInput(code) {
  const digits = (code || "").toString().replace(/\D/g, "").slice(0, 5);
  if (digits && /^0+$/.test(digits)) return "00000";
  return digits;
}

function isPrivateStudentCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  return /^\d{5}$/.test(clean) && clean !== "00000";
}

function normalizeStudentName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function getStudentLookupKey(student) {
  const code = sanitizeStudentCodeInput(student?.code || student?.accessCode || "");
  if (isPrivateStudentCode(code)) return `code:${code}`;
  const normalizedId = normalizeStudentId(student?.id);
  if (normalizedId) return `id:${normalizedId}`;
  const normalizedName = normalizeStudentName(student?.name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function getStudentLookupKeysForMatch(student) {
  const keys = new Set();
  if (!student) return [];
  const primary = student.studentKey || getStudentLookupKey(student);
  if (primary) keys.add(primary);
  const code = sanitizeStudentCodeInput(student.code || student.accessCode || "");
  if (isPrivateStudentCode(code)) keys.add(`code:${code}`);
  const id = normalizeStudentId(student.id || "");
  if (id) keys.add(`id:${id}`);
  return [...keys];
}

function getStudentMatchKeySet(studentLookupKey, studentContext) {
  const keys = new Set();
  if (studentLookupKey) keys.add(studentLookupKey);
  getStudentLookupKeysForMatch(studentContext || {}).forEach(key => {
    if (key) keys.add(key);
  });
  return keys;
}

function resultMatchesStudentKeys(res, keys) {
  if (!res || !keys || !keys.size) return false;
  if (res.studentLookupKey && keys.has(res.studentLookupKey)) return true;
  return getStudentLookupKeysForMatch({
    studentKey: res.studentLookupKey || "",
    id: res.id,
    code: res.accessCode || res.code,
    name: res.name
  }).some(key => key && keys.has(key));
}

function findBlockingExamResult(results, studentLookupKey, examId, studentContext) {
  if (!examId) return null;
  const keys = getStudentMatchKeySet(studentLookupKey, studentContext);
  if (!keys.size) return null;
  return results.find(r =>
    r.examId === examId &&
    resultMatchesStudentKeys(r, keys) &&
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
  { studentLookupKey: "code:12345", examId: "EX3", status: "canceled", allowRetake: true },
  { examId: "EX4", id: "STU1", accessCode: "67890", status: "completed", allowRetake: false }
];

assert.ok(findBlockingExamResult(results, "code:12345", "EX1"));
assert.ok(findBlockingExamResult(results, "code:12345", "EX2"));
assert.strictEqual(findBlockingExamResult(results, "code:12345", "EX3"), null);
assert.strictEqual(findBlockingExamResult(results, "code:99999", "EX1"), null);
assert.ok(findBlockingExamResult(results, "code:67890", "EX4", { id: "STU1", code: "67890", name: "Sara" }));

console.log("All exam security tests passed.");
