#!/usr/bin/env python3
"""Fix false student ID/code validation blocking exam entry."""

from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app.js"
QUESTIONS = Path(__file__).resolve().parent.parent / "questions.js"
HTML = Path(__file__).resolve().parent.parent / "index.html"

VALIDATE_FN = '''
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

function validateStudentIdentityInput(id, code, options = {}) {
  const normalizedId = normalizeStudentId(id);
  const inputCode = sanitizeStudentCodeInput(code);
  const editingStudentKey = options.editingStudentKey || "";

  if (!inputCode) return { ok: true };

  if (!isFiveDigitStudentCode(inputCode)) {
    return { ok: false, message: "كود الاشتراك يجب أن يكون مكوّناً من 5 أرقام." };
  }

  if (isPrivateStudentCode(inputCode)) {
    const owners = systemState.students.filter(student => sanitizeStudentCodeInput(student.code) === inputCode);
    if (owners.length > 1) {
      return {
        ok: false,
        message: "هذا الكود مكرر داخل قاعدة الطلاب، ولا يمكن استخدامه حتى يقوم المعلم بتخصيص كود مختلف لكل طالب."
      };
    }
    if (owners.length === 1) {
      const owner = owners[0];
      if (editingStudentKey && owner.studentKey === editingStudentKey) {
        return { ok: true };
      }
      const ownerId = normalizeStudentId(owner.id);
      if (normalizedId && ownerId && ownerId !== normalizedId) {
        return {
          ok: false,
          message: "كود الاشتراك الذي أدخلته مخصص لطالب آخر. اكتب الكود الصحيح الخاص بك أو اترك حقل ID فارغاً."
        };
      }
      return { ok: true };
    }
    if (normalizedId) {
      const idOwner = findStudentById(normalizedId);
      if (idOwner && sanitizeStudentCodeInput(idOwner.code) && sanitizeStudentCodeInput(idOwner.code) !== inputCode) {
        return {
          ok: false,
          message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. استخدم الكود الأصلي لهذا ID أو اترك ID فارغاً واكتب كودك فقط."
        };
      }
    }
    return { ok: true };
  }

  if (isSharedStudentCode(inputCode)) {
    if (!normalizedId) {
      return {
        ok: false,
        message: "مع كود 00000 المشترك يجب إدخال رقم ID المطابق لسجلك في النظام."
      };
    }
    const idOwner = findStudentById(normalizedId);
    if (idOwner && sanitizeStudentCodeInput(idOwner.code) && sanitizeStudentCodeInput(idOwner.code) !== inputCode) {
      return {
        ok: false,
        message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. استخدم الكود الأصلي الخاص بهذا الطالب."
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

window.arabyaValidateStudentIdentity = validateStudentIdentityInput;
window.normalizeStudentId = normalizeStudentId;
window.sanitizeStudentCodeInput = sanitizeStudentCodeInput;
window.isPrivateStudentCode = isPrivateStudentCode;
window.isSharedStudentCode = isSharedStudentCode;
window.isFiveDigitStudentCode = isFiveDigitStudentCode;
'''

NEW_BLOCKING = '''function findBlockingExamResult(studentLookupKey, examId, studentContext) {
  if (!examId) return null;
  const keys = studentContext
    ? getStudentLookupKeysForMatch(studentContext)
    : (studentLookupKey ? [studentLookupKey] : []);
  if (!keys.length) return null;
  if (keys.some(key => findActiveRetakeGrant(key, examId))) return null;
  return systemState.results.find(r =>
    keys.includes(r.studentLookupKey) &&
    r.examId === examId &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}'''

OLD_BLOCKING = '''function findBlockingExamResult(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  if (findActiveRetakeGrant(studentLookupKey, examId)) return null;
  return systemState.results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}'''

QUESTIONS_VALIDATE = '''function normalizeArabyaStudentCode(code) {
  var digits = String(code || "").replace(/\\D/g, "").slice(0, 5);
  if (digits && /^0+$/.test(digits)) return "00000";
  return digits;
}

function validateArabyaStudentIdentity(id, code, currentId) {
  if (typeof window.arabyaValidateStudentIdentity === "function") {
    return window.arabyaValidateStudentIdentity(id, code, {
      editingStudentKey: currentId || (window.systemState && window.systemState.editingStudentKey) || ""
    });
  }

  var cleanCode = normalizeArabyaStudentCode(code);
  if (!cleanCode) return { ok: true };

  var normalizedId = typeof window.normalizeStudentId === "function"
    ? window.normalizeStudentId(id)
    : String(id || "").trim().toUpperCase();

  var codeOwners = arabyaFindStudentsByCode(cleanCode);
  if (codeOwners.length > 1) {
    return { ok: false, message: "هذا الكود مكرر داخل قاعدة الطلاب، ولا يمكن استخدامه حتى يقوم المعلم بتخصيص كود مختلف لكل طالب." };
  }

  if (codeOwners.length === 1) {
    var owner = codeOwners[0];
    var ownerId = typeof window.normalizeStudentId === "function"
      ? window.normalizeStudentId(owner.id)
      : String(owner.id || "").trim().toUpperCase();
    if (normalizedId && ownerId && ownerId !== normalizedId) {
      return { ok: false, message: "كود الاشتراك الذي أدخلته مخصص لطالب آخر. اكتب الكود الصحيح الخاص بك أو اترك حقل ID فارغاً." };
    }
    return { ok: true };
  }

  if (normalizedId) {
    var sameIdStudent = arabyaGetStudents().find(function(student) {
      var studentId = typeof window.normalizeStudentId === "function"
        ? window.normalizeStudentId(student.id)
        : String(student.id || "").trim().toUpperCase();
      return studentId && studentId === normalizedId;
    });
    if (sameIdStudent && normalizeArabyaStudentCode(sameIdStudent.code) && normalizeArabyaStudentCode(sameIdStudent.code) !== cleanCode) {
      return { ok: false, message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. استخدم الكود الأصلي لهذا ID أو اترك ID فارغاً واكتب كودك فقط." };
    }
  }

  return { ok: true };
}'''


def patch_app(content: str) -> str:
    content = content.replace(
        'const ARABYA_APP_VERSION = "2026.05.31.10";',
        'const ARABYA_APP_VERSION = "2026.05.31.11";',
    )

    marker = "// ===== أداة التشخيص السريع - اكتب arabya_diagnose() في الكونسول ====="
    if "function validateStudentIdentityInput" not in content:
        content = content.replace(marker, VALIDATE_FN + "\n" + marker)

    content = content.replace(OLD_BLOCKING, NEW_BLOCKING)

    content = content.replace(
        "  const blockingResult = findBlockingExamResult(studentLookupKey, examId);",
        "  const blockingResult = findBlockingExamResult(studentLookupKey, examId, systemState.currentStudent);",
    )

    old_private_block = """  if (isPrivateStudentCode(inputCode)) {
    const duplicateCode = systemState.students.find(student => sanitizeStudentCodeInput(student.code) === inputCode && student !== matchedStudent);
    if (duplicateCode) {
      alert("كود الاشتراك الخاص مستخدم بالفعل لطالب آخر. اختر كوداً مختلفاً.");
      return;
    }
  }

  if (normalizedId) {
    const duplicateId = systemState.students.find(student => normalizeStudentId(student.id) === normalizedId && student !== matchedStudent);
    if (duplicateId) {
      if (isPrivateStudentCode(inputCode) && sanitizeStudentCodeInput(duplicateId.code) === inputCode) {
        matchedStudent = duplicateId;
      } else {
        alert("رقم ID مسجل بالفعل لطالب آخر. استخدم رقم معرف مختلف أو سجل بالكود الصحيح.");
        return;
      }
    }
  }

  const studentRecord = upsertStudentRecord({"""

    new_private_block = """  const identityCheck = validateStudentIdentityInput(id, rawCode);
  if (!identityCheck.ok) {
    alert(identityCheck.message);
    return;
  }

  const studentRecord = upsertStudentRecord({"""

    content = content.replace(old_private_block, new_private_block)

    return content


def patch_questions(content: str) -> str:
    content = content.replace(
        """function normalizeArabyaStudentCode(code) {
  return String(code || "").trim().toLowerCase();
}""",
        """function normalizeArabyaStudentCode(code) {
  var digits = String(code || "").replace(/\\D/g, "").slice(0, 5);
  if (digits && /^0+$/.test(digits)) return "00000";
  return digits;
}""",
    )

    old_validate = """function validateArabyaStudentIdentity(id, code, currentId) {
  var cleanCode = String(code || "").trim();
  if (!cleanCode) return { ok: true };

  var codeOwners = arabyaFindStudentsByCode(cleanCode);
  if (codeOwners.length > 1) {
    return { ok: false, message: "هذا الكود مكرر داخل قاعدة الطلاب، ولا يمكن استخدامه حتى يقوم المعلم بتخصيص كود مختلف لكل طالب." };
  }

  var effectiveId = String(currentId || id || "");
  var otherOwner = codeOwners.find(function(student) {
    return String(student.id || "") !== effectiveId;
  });
  if (otherOwner) {
    return { ok: false, message: "كود الاشتراك الذي أدخلته مخصص لطالب آخر. اكتب الكود الصحيح الخاص بك وحدك أو تواصل مع المعلم." };
  }

  var sameIdStudent = arabyaGetStudents().find(function(student) {
    return String(student.id || "") === String(id || "");
  });
  if (sameIdStudent && normalizeArabyaStudentCode(sameIdStudent.code) && normalizeArabyaStudentCode(sameIdStudent.code) !== normalizeArabyaStudentCode(cleanCode)) {
    return { ok: false, message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. لا يمكن الدخول إلا بالكود الأصلي الخاص بهذا الطالب." };
  }

  return { ok: true };
}"""

    content = content.replace(old_validate, QUESTIONS_VALIDATE.strip())

    content = content.replace(
        "window.systemState ? window.systemState.editingStudentId : \"\"",
        "window.systemState ? (window.systemState.editingStudentKey || window.systemState.editingStudentId || \"\") : \"\"",
    )

    return content


def patch_html(content: str) -> str:
    return content.replace(
        '  <script src="questions.js?v=2026.05.31.10"></script>\n  <script src="app.js?v=2026.05.31.10"></script>',
        '  <script src="questions.js?v=2026.05.31.11"></script>\n  <script src="app.js?v=2026.05.31.11"></script>',
    )


def main() -> None:
    APP.write_text(patch_app(APP.read_text(encoding="utf-8")), encoding="utf-8")
    QUESTIONS.write_text(patch_questions(QUESTIONS.read_text(encoding="utf-8")), encoding="utf-8")
    HTML.write_text(patch_html(HTML.read_text(encoding="utf-8")), encoding="utf-8")
    print("Patched student code validation")


if __name__ == "__main__":
    main()
