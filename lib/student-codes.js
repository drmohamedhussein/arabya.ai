/**
 * تطبيع أكواد الطلاب — نسخة Node للاختبارات (تطابق js/arabya-student-codes.js).
 */
function sanitizeStudentCodeInput(code) {
  const raw = (code || "").toString().trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  if (digitsOnly && /^0+$/.test(digitsOnly) && digitsOnly.length >= 5) {
    return "00000";
  }
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

function isValidStudentCodeFormat(code) {
  const clean = sanitizeStudentCodeInput(code);
  if (!clean) return true;
  return /^[A-Za-z0-9]+$/i.test(clean) && clean.length <= 32;
}

function normalizeStudentIdForCompare(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
}

function normalizeStudentName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

module.exports = {
  sanitizeStudentCodeInput,
  normalizeStudentCodeForCompare,
  isSharedStudentCode,
  isPrivateStudentCode,
  isValidStudentCodeFormat,
  normalizeStudentIdForCompare,
  normalizeStudentName
};
