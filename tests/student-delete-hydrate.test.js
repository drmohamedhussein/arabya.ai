/**
 * Deleted students must not be recreated from exam results during hydrate.
 */
const assert = require("assert");

function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
}

function sanitizeStudentCodeInput(code) {
  return (code || "").toString().replace(/\D/g, "").slice(0, 5);
}

function isFiveDigitStudentCode(code) {
  return /^\d{5}$/.test((code || "").toString());
}

function isPrivateStudentCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  return isFiveDigitStudentCode(clean) && clean !== "00000";
}

function getStudentLookupKey(student) {
  const code = sanitizeStudentCodeInput(student?.code || student?.accessCode || "");
  if (isPrivateStudentCode(code)) return `code:${code}`;
  const normalizedId = normalizeStudentId(student?.id);
  if (normalizedId) return `id:${normalizedId}`;
  return "";
}

function isStudentKeyDeleted(key, deletedKeys) {
  return deletedKeys.includes(String(key));
}

function isStudentRecordDeleted(student, deletedKeys) {
  if (!student) return false;
  if (student.studentKey && isStudentKeyDeleted(student.studentKey, deletedKeys)) return true;
  const lookup = getStudentLookupKey(student);
  if (lookup && isStudentKeyDeleted(lookup, deletedKeys)) return true;
  const nid = normalizeStudentId(student.id);
  if (nid && isStudentKeyDeleted(`id:${nid}`, deletedKeys)) return true;
  const code = sanitizeStudentCodeInput(student.code);
  if (code && isStudentKeyDeleted(`code:${code}`, deletedKeys)) return true;
  return false;
}

function isResultFromDeletedStudent(res, deletedKeys) {
  return isStudentRecordDeleted({
    studentKey: res.studentLookupKey || "",
    id: res.id,
    code: res.accessCode || res.code
  }, deletedKeys);
}

function hydrateWouldAddStudent(res, deletedKeys) {
  if (!res || (!res.name && !res.id && !res.accessCode && !res.code)) return false;
  if (isResultFromDeletedStudent(res, deletedKeys)) return false;
  const draft = { name: res.name, id: res.id, code: res.accessCode || res.code };
  return !isStudentRecordDeleted(draft, deletedKeys);
}

const deletedKeys = ["code:12345", "id:STU1"];
const result = {
  name: "طالب محذوف",
  id: "STU1",
  accessCode: "12345",
  studentLookupKey: "code:12345"
};

assert.strictEqual(hydrateWouldAddStudent(result, deletedKeys), false);

console.log("Student delete hydrate tests passed.");
