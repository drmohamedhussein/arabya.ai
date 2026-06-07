/**
 * تطبيع أكواد الطلاب — مصدر واحد للمتصفح (app.js + questions.js).
 */
(function (global) {
  function sanitizeStudentCodeInput(code) {
    const raw = (code || "").toString().trim();
    if (!raw) return "";
    const compact = raw.replace(/\s+/g, "");
    const clean = compact.replace(/[-_]/g, "");
    if (/^0{5,}$/.test(clean)) {
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

  function hasStudentCode(code) {
    return !!sanitizeStudentCodeInput(code);
  }

  function isFiveDigitStudentCode(code) {
    return hasStudentCode(code);
  }

  function isValidStudentCodeFormat(code) {
    const clean = sanitizeStudentCodeInput(code);
    if (!clean) return true;
    return /^[A-Za-z0-9]+$/i.test(clean) && clean.length <= 32;
  }

  function studentCodesMatch(codeA, codeB) {
    const a = normalizeStudentCodeForCompare(codeA);
    const b = normalizeStudentCodeForCompare(codeB);
    return !!(a && b && a === b);
  }

  global.ArabyaStudentCodes = {
    sanitizeStudentCodeInput,
    normalizeStudentCodeForCompare,
    isSharedStudentCode,
    isPrivateStudentCode,
    hasStudentCode,
    isFiveDigitStudentCode,
    isValidStudentCodeFormat,
    studentCodesMatch
  };
})(typeof window !== "undefined" ? window : global);
