/**
 * هوية الطلاب: تطبيع، بحث، مطابقة النتائج، التحقق من الإدخال.
 */
(function (global) {
  function getState() {
    return global.systemState || { students: [] };
  }

  function normalizeStudentId(studentId) {
    return (studentId || "").toString().trim();
  }

  function normalizeStudentIdForCompare(studentId) {
    return normalizeStudentId(studentId).toUpperCase();
  }

  function normalizeStudentName(name) {
    return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeContactField(value) {
    return (value || "").toString().trim();
  }

  function normalizeStudentCodeForCompare(code) {
    return sanitizeStudentCodeInput(code).toUpperCase();
  }

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

  function isValidStudentIdFormat(studentId) {
    const id = normalizeStudentId(studentId);
    if (!id) return true;
    return /^[A-Za-z0-9]+$/i.test(id) && id.length <= 64;
  }

  function isValidStudentCodeFormat(code) {
    const clean = sanitizeStudentCodeInput(code);
    if (!clean) return true;
    return /^[A-Za-z0-9]+$/i.test(clean) && clean.length <= 32;
  }

  function isFiveDigitStudentCode(code) {
    return hasStudentCode(code);
  }

  function hasStudentCode(code) {
    return !!sanitizeStudentCodeInput(code);
  }

  function isSharedStudentCode(code) {
    return normalizeStudentCodeForCompare(code) === "00000";
  }

  function isPrivateStudentCode(code) {
    const clean = sanitizeStudentCodeInput(code);
    return !!clean && !isSharedStudentCode(clean);
  }

  function studentCodesMatch(codeA, codeB) {
    const a = normalizeStudentCodeForCompare(codeA);
    const b = normalizeStudentCodeForCompare(codeB);
    return !!(a && b && a === b);
  }

  function getStudentLookupKey(student) {
    const code = sanitizeStudentCodeInput(student?.code || student?.accessCode || "");
    if (isPrivateStudentCode(code)) {
      return `code:${normalizeStudentCodeForCompare(code)}`;
    }
    const normalizedId = normalizeStudentIdForCompare(student?.id);
    if (normalizedId) {
      return `id:${normalizedId}`;
    }
    const normalizedName = normalizeStudentName(student?.name);
    return normalizedName ? `name:${normalizedName}` : "";
  }

  function findStudentByCode(code, options = {}) {
    const students = getState().students || [];
    const clean = sanitizeStudentCodeInput(code);
    if (!clean) return null;
    if (isSharedStudentCode(clean)) {
      const normalizedId = normalizeStudentIdForCompare(options.studentId);
      const normalizedName = normalizeStudentName(options.name);
      if (normalizedId) {
        const byId = students.find(
          s =>
            studentCodesMatch(s.code, clean) &&
            normalizeStudentIdForCompare(s.id) === normalizedId
        );
        if (byId) return byId;
      }
      if (normalizedName) {
        return students.find(
          s => studentCodesMatch(s.code, clean) && normalizeStudentName(s.name) === normalizedName
        ) || null;
      }
      return null;
    }
    return students.find(s => studentCodesMatch(s.code, clean)) || null;
  }

  function findStudentById(studentId) {
    const students = getState().students || [];
    const normalized = normalizeStudentIdForCompare(studentId);
    if (!normalized) return null;
    return students.find(s => normalizeStudentIdForCompare(s.id) === normalized) || null;
  }

  function findStudentsByName(name) {
    const students = getState().students || [];
    const normalized = normalizeStudentName(name);
    if (!normalized) return [];
    return students.filter(s => normalizeStudentName(s.name) === normalized);
  }

  function findStudentByName(name) {
    const students = getState().students || [];
    const normalized = normalizeStudentName(name);
    if (!normalized) return null;
    return students.find(student => normalizeStudentName(student.name) === normalized) || null;
  }

  function findStudentByKey(studentKey) {
    const students = getState().students || [];
    if (!studentKey) return null;
    return students.find(student => student.studentKey === studentKey) || null;
  }

  function ensureStudentsDataShape(options = {}) {
    const state = getState();
    const preserveEmptyTimestamp = !!options.preserveEmptyTimestamp;
    if (!Array.isArray(state.students)) {
      state.students = [];
      return;
    }
    const createId = global.createRecordId || function (prefix) {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    };
    state.students = state.students.map((student, index) => {
      const normalizedId = normalizeStudentId(student.id || "");
      const sanitizedCode = sanitizeStudentCodeInput(student.code || "");
      const normalizedCode = hasStudentCode(sanitizedCode) ? sanitizedCode : "";
      const normalizedName = (student.name || "").toString().trim() || `طالب ${index + 1}`;
      let timestamp = String(student.timestamp || "").trim();
      if (!timestamp && !preserveEmptyTimestamp) {
        timestamp = new Date().toLocaleDateString("ar-EG");
      }
      const normalizedStudent = {
        ...student,
        name: normalizedName,
        id: normalizedId,
        code: normalizedCode,
        email: normalizeContactField(student.email),
        mobile: normalizeContactField(student.mobile),
        timestamp
      };
      normalizedStudent.studentKey = normalizedStudent.studentKey || getStudentLookupKey(normalizedStudent) || createId("student");
      if (!Number.isFinite(normalizedStudent.savedAt)) {
        const match = String(normalizedStudent.studentKey || "").match(/(?:student|record)_(\d{10,})_/i);
        if (match) normalizedStudent.savedAt = parseInt(match[1], 10);
      }
      return normalizedStudent;
    });
  }

  function buildStudentMatchContext(student) {
    if (!student) return null;
    return {
      studentKey: student.studentKey || "",
      id: student.id || "",
      name: student.name || "",
      accessCode: student.accessCode || student.code || "",
      code: student.code || student.accessCode || ""
    };
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
    const normalizedName = normalizeStudentName(student.name || "");
    if (normalizedName) keys.add(`name:${normalizedName}`);
    return [...keys];
  }

  function resultMatchesStudentIdentity(result, student) {
    if (!result || !student) return false;
    const keys = getStudentLookupKeysForMatch(student);
    if (result.studentLookupKey && keys.includes(result.studentLookupKey)) return true;
    if (result.studentKey && keys.includes(result.studentKey)) return true;

    const resultId = normalizeStudentIdForCompare(result.id || "");
    const studentId = normalizeStudentIdForCompare(student.id || "");

    if (isSharedStudentCode(student.code || student.accessCode) || isSharedStudentCode(result.accessCode || result.code)) {
      const resultName = normalizeStudentName(result.name || "");
      const studentName = normalizeStudentName(student.name || "");
      if (resultId && studentId && resultId === studentId) return true;
      if (resultName && studentName && resultName === studentName && studentCodesMatch(result.accessCode || result.code, student.code || student.accessCode)) {
        return true;
      }
      return false;
    }

    if (isPrivateStudentCode(student.code || student.accessCode) && studentCodesMatch(result.accessCode || result.code, student.code || student.accessCode)) {
      return true;
    }
    if (resultId && studentId && resultId === studentId) return true;

    const resultName = normalizeStudentName(result.name || "");
    const studentName = normalizeStudentName(student.name || "");
    if (resultName && studentName && resultName === studentName) {
      if (!resultId && !studentId) return false;
      if (resultId && studentId && resultId === studentId) return true;
    }
    return false;
  }

  function validateStudentIdentityInput(id, code, options = {}) {
    const students = getState().students || [];
    const name = (options.name || "").toString().trim();
    const normalizedName = normalizeStudentName(name);
    const normalizedId = normalizeStudentIdForCompare(id);
    const inputCode = sanitizeStudentCodeInput(code);
    const normalizedCode = normalizeStudentCodeForCompare(inputCode);
    const editingStudentKey = options.editingStudentKey || "";

    if (id && !isValidStudentIdFormat(id)) {
      return { ok: false, message: "معرف الهوية يجب أن يتكوّن من حروف أو أرقام أو كليهما (بدون رموز)." };
    }
    if (inputCode && !isValidStudentCodeFormat(inputCode)) {
      return { ok: false, message: "كود الاشتراك يجب أن يتكوّن من حروف أو أرقام أو كليهما." };
    }

    for (const student of students) {
      if (editingStudentKey && student.studentKey === editingStudentKey) continue;

      const otherId = normalizeStudentIdForCompare(student.id);
      const otherName = normalizeStudentName(student.name);
      const otherCode = normalizeStudentCodeForCompare(student.code);

      if (normalizedId && otherId === normalizedId && otherName !== normalizedName) {
        return {
          ok: false,
          message: "معرف الهوية مسجّل لطالب آخر باسم مختلف. تواصل مع المعلم أو استخدم المعرف الصحيح."
        };
      }

      if (normalizedCode && otherCode === normalizedCode && isPrivateStudentCode(inputCode)) {
        if (otherName !== normalizedName) {
          return {
            ok: false,
            message: "كود الاشتراك مستخدم لطالب آخر باسم مختلف."
          };
        }
      }

      if (isSharedStudentCode(inputCode) && otherCode === "00000") {
        const sameName = otherName === normalizedName;
        const sameId = normalizedId && otherId === normalizedId;
        if (sameName && sameId) continue;
        if (sameName && !normalizedId && !otherId) {
          return {
            ok: false,
            message: "مع كود 00000 والاسم نفسه يجب إدخال معرف هوية مختلف للتمييز."
          };
        }
      }
    }

    return { ok: true };
  }

  const api = {
    normalizeStudentId,
    normalizeStudentIdForCompare,
    normalizeStudentName,
    normalizeContactField,
    normalizeStudentCodeForCompare,
    sanitizeStudentCodeInput,
    isValidStudentIdFormat,
    isValidStudentCodeFormat,
    isFiveDigitStudentCode,
    hasStudentCode,
    isSharedStudentCode,
    isPrivateStudentCode,
    studentCodesMatch,
    getStudentLookupKey,
    findStudentByCode,
    findStudentById,
    findStudentsByName,
    findStudentByName,
    findStudentByKey,
    ensureStudentsDataShape,
    buildStudentMatchContext,
    getStudentLookupKeysForMatch,
    resultMatchesStudentIdentity,
    validateStudentIdentityInput
  };

  global.ArabyaStudents = api;
  global.normalizeStudentId = normalizeStudentId;
  global.normalizeStudentIdForCompare = normalizeStudentIdForCompare;
  global.normalizeStudentName = normalizeStudentName;
  global.normalizeContactField = normalizeContactField;
  global.sanitizeStudentCodeInput = sanitizeStudentCodeInput;
  global.isPrivateStudentCode = isPrivateStudentCode;
  global.isSharedStudentCode = isSharedStudentCode;
  global.isFiveDigitStudentCode = isFiveDigitStudentCode;
  global.hasStudentCode = hasStudentCode;
  global.getStudentLookupKey = getStudentLookupKey;
  global.findStudentByCode = findStudentByCode;
  global.findStudentById = findStudentById;
  global.findStudentsByName = findStudentsByName;
  global.findStudentByName = findStudentByName;
  global.findStudentByKey = findStudentByKey;
  global.ensureStudentsDataShape = ensureStudentsDataShape;
  global.buildStudentMatchContext = buildStudentMatchContext;
  global.getStudentLookupKeysForMatch = getStudentLookupKeysForMatch;
  global.resultMatchesStudentIdentity = resultMatchesStudentIdentity;
  global.validateStudentIdentityInput = validateStudentIdentityInput;
  global.arabyaValidateStudentIdentity = validateStudentIdentityInput;
})(window);
