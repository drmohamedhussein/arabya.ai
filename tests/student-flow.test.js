/**
 * Student identity and result search scenario tests
 */
const assert = require("assert");

function sanitizeStudentCodeInput(code) {
  const raw = (code || "").toString().trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  if (digitsOnly && /^0+$/.test(digitsOnly) && digitsOnly.length >= 5) return "00000";
  return compact;
}

function normalizeStudentCodeForCompare(code) {
  return sanitizeStudentCodeInput(code).toUpperCase();
}

function isSharedStudentCode(code) {
  return normalizeStudentCodeForCompare(code) === "00000";
}

function isPrivateStudentCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  return !!clean && !isSharedStudentCode(clean);
}

function normalizeStudentIdForCompare(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
}

function normalizeStudentName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function classifyResultSearchQuery(results, rawQuery) {
  const trimmed = (rawQuery || "").trim();
  const codeNorm = normalizeStudentCodeForCompare(trimmed);
  const idNorm = normalizeStudentIdForCompare(trimmed);
  const nameNorm = normalizeStudentName(trimmed);
  const codeHits = results.filter(res => {
    const rc = normalizeStudentCodeForCompare(res.accessCode || "");
    return rc && isPrivateStudentCode(rc) && rc === codeNorm;
  });
  if (codeHits.length) return { mode: "code", code: codeNorm };
  const idHits = results.filter(res => idNorm && normalizeStudentIdForCompare(res.id) === idNorm);
  if (idHits.length) return { mode: "id", id: idNorm };
  return { mode: "name", name: nameNorm };
}

function filterResultsForStudentSearch(results, queryInfo) {
  if (queryInfo.mode === "code") {
    return results.filter(res => normalizeStudentCodeForCompare(res.accessCode || "") === queryInfo.code);
  }
  if (queryInfo.mode === "id") {
    return results.filter(res => normalizeStudentIdForCompare(res.id) === queryInfo.id);
  }
  if (queryInfo.mode === "name") {
    return results.filter(res => normalizeStudentName(res.name) === queryInfo.name);
  }
  return [];
}

function validateStudentIdentityInput(id, code, students, options = {}) {
  const name = (options.name || "").toString().trim();
  const normalizedName = normalizeStudentName(name);
  const normalizedId = normalizeStudentIdForCompare(id);
  const inputCode = sanitizeStudentCodeInput(code);
  const normalizedCode = normalizeStudentCodeForCompare(inputCode);
  const editingStudentKey = options.editingStudentKey || "";

  for (const student of students) {
    if (editingStudentKey && student.studentKey === editingStudentKey) continue;
    const otherId = normalizeStudentIdForCompare(student.id);
    const otherName = normalizeStudentName(student.name);
    const otherCode = normalizeStudentCodeForCompare(student.code);
    if (normalizedId && otherId === normalizedId && otherName !== normalizedName) {
      return { ok: false };
    }
    if (normalizedCode && otherCode === normalizedCode && isPrivateStudentCode(inputCode)) {
      if (options.purpose === "exam_start") {
        if (normalizedId && otherId && otherId !== normalizedId) return { ok: false };
        continue;
      }
      if (otherName !== normalizedName) return { ok: false };
    }
  }
  return { ok: true };
}

const results = [
  { name: "Ali", id: "A1", accessCode: "ABC12" },
  { name: "Sara", id: "X1", accessCode: "" },
  { name: "Ali", id: "B2", accessCode: "" }
];

assert.strictEqual(classifyResultSearchQuery(results, "ABC12").mode, "code");
assert.strictEqual(filterResultsForStudentSearch(results, { mode: "code", code: "ABC12" }).length, 1);
assert.strictEqual(classifyResultSearchQuery(results, "X1").mode, "id");
assert.strictEqual(filterResultsForStudentSearch(results, { mode: "name", name: "ali" }).length, 2);

const students = [
  { studentKey: "s1", name: "Ali", id: "A1", code: "11111" },
  { studentKey: "s2", name: "Sara", id: "A2", code: "22222" }
];
assert.strictEqual(validateStudentIdentityInput("A1", "99999", students, { name: "Other" }).ok, false);
assert.strictEqual(validateStudentIdentityInput("", "22222", students, { name: "New", editingStudentKey: "s3" }).ok, false);
assert.strictEqual(validateStudentIdentityInput("", "", students, { name: "Ali" }).ok, true);
assert.strictEqual(validateStudentIdentityInput("", "22222", students, { name: "Sara", purpose: "exam_start" }).ok, true);
assert.strictEqual(validateStudentIdentityInput("", "22222", students, { name: "Different Name", purpose: "exam_start" }).ok, true);
assert.strictEqual(validateStudentIdentityInput("WRONG", "22222", students, { name: "Sara", purpose: "exam_start" }).ok, false);
assert.strictEqual(validateStudentIdentityInput("A2", "22222", students, { name: "Sara", purpose: "exam_start" }).ok, true);

console.log("All student flow tests passed.");
