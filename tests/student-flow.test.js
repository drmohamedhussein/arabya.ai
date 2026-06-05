/**
 * Student identity and result search scenario tests
 */
const assert = require("assert");
const { validateStudentIdentityInput } = require("../lib/student-identity");
const {
  sanitizeStudentCodeInput,
  normalizeStudentCodeForCompare,
  isSharedStudentCode,
  isPrivateStudentCode,
  normalizeStudentIdForCompare,
  normalizeStudentName
} = require("../lib/student-codes");

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
