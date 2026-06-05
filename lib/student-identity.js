/**
 * تحقق هوية الطالب — نسخة Node للاختبارات.
 */
const {
  sanitizeStudentCodeInput,
  normalizeStudentCodeForCompare,
  isSharedStudentCode,
  isPrivateStudentCode,
  isValidStudentCodeFormat,
  normalizeStudentIdForCompare,
  normalizeStudentName
} = require("./student-codes");

function isValidStudentIdFormat(studentId) {
  const id = (studentId || "").toString().trim();
  if (!id) return true;
  return /^[A-Za-z0-9]+$/i.test(id) && id.length <= 64;
}

function validateStudentIdentityInput(id, code, students, options = {}) {
  const name = (options.name || "").toString().trim();
  const normalizedName = normalizeStudentName(name);
  const normalizedId = normalizeStudentIdForCompare(id);
  const inputCode = sanitizeStudentCodeInput(code);
  const normalizedCode = normalizeStudentCodeForCompare(inputCode);
  const editingStudentKey = options.editingStudentKey || "";

  if (id && !isValidStudentIdFormat(id)) {
    return { ok: false, message: "معرف الهوية غير صالح." };
  }
  if (inputCode && !isValidStudentCodeFormat(inputCode)) {
    return { ok: false, message: "كود الاشتراك غير صالح." };
  }

  for (const student of students || []) {
    if (editingStudentKey && student.studentKey === editingStudentKey) continue;

    const otherId = normalizeStudentIdForCompare(student.id);
    const otherName = normalizeStudentName(student.name);
    const otherCode = normalizeStudentCodeForCompare(student.code);

    if (normalizedId && otherId === normalizedId && otherName !== normalizedName) {
      return { ok: false, message: "معرف الهوية مسجّل لطالب آخر باسم مختلف." };
    }

    if (normalizedCode && otherCode === normalizedCode && isPrivateStudentCode(inputCode)) {
      if (options.purpose === "exam_start") {
        if (normalizedId && otherId && otherId !== normalizedId) {
          return { ok: false, message: "كود الاشتراك لا يطابق معرف الهوية." };
        }
        continue;
      }
      if (otherName !== normalizedName) {
        return { ok: false, message: "كود الاشتراك مستخدم لطالب آخر باسم مختلف." };
      }
    }

    if (isSharedStudentCode(inputCode) && otherCode === "00000") {
      const sameName = otherName === normalizedName;
      const sameId = normalizedId && otherId === normalizedId;
      if (sameName && sameId) continue;
      if (sameName && !normalizedId && !otherId) {
        return { ok: false, message: "مع كود 00000 والاسم نفسه يجب إدخال معرف هوية مختلف." };
      }
    }
  }

  return { ok: true };
}

module.exports = {
  validateStudentIdentityInput,
  isValidStudentIdFormat,
  isValidStudentCodeFormat
};
