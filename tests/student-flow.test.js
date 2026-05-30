/**
 * Student auth, question bank, and result search scenario tests
 */
const assert = require("assert");

function sanitizeStudentCodeInput(code) {
  return (code || "").toString().replace(/\D/g, "").slice(0, 5);
}

function isFiveDigitStudentCode(code) {
  return /^\d{5}$/.test((code || "").toString());
}

function isSharedStudentCode(code) {
  return sanitizeStudentCodeInput(code) === "00000";
}

function isPrivateStudentCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  return isFiveDigitStudentCode(clean) && clean !== "00000";
}

function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
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

function findStudentByCode(students, code, options = {}) {
  const clean = sanitizeStudentCodeInput(code);
  if (!isFiveDigitStudentCode(clean)) return null;
  if (isSharedStudentCode(clean)) {
    return findStudentByIdentity(students, options.name, options.studentId, clean);
  }
  return students.find(student => sanitizeStudentCodeInput(student.code) === clean) || null;
}

function doesStudentIdentityMatch(student, name, studentId) {
  const normalizedName = normalizeStudentName(name);
  if (!normalizedName || normalizeStudentName(student?.name) !== normalizedName) return false;
  const existingId = normalizeStudentId(student?.id);
  const normalizedId = normalizeStudentId(studentId);
  return !existingId || (normalizedId && existingId === normalizedId);
}

function findStudentByIdentity(students, name, studentId, code = "") {
  const clean = sanitizeStudentCodeInput(code);
  return students.find(student => {
    if (clean && sanitizeStudentCodeInput(student.code) !== clean) return false;
    return doesStudentIdentityMatch(student, name, studentId);
  }) || null;
}

function findStudentById(students, studentId) {
  const normalized = normalizeStudentId(studentId);
  if (!normalized) return null;
  return students.find(student => normalizeStudentId(student.id) === normalized) || null;
}

function upsertStudentRecord(students, source) {
  const normalizedId = normalizeStudentId(source.id || "");
  const normalizedCode = sanitizeStudentCodeInput(source.code || source.accessCode || "");
  const normalizedStudent = {
    name: (source.name || "").toString().trim(),
    id: normalizedId,
    code: isFiveDigitStudentCode(normalizedCode) ? normalizedCode : "",
    email: "",
    mobile: ""
  };

  let existingStudent = null;
  if (isPrivateStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByCode(students, normalizedStudent.code);
  } else if (isSharedStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByCode(students, normalizedStudent.code, {
      studentId: normalizedStudent.id,
      name: normalizedStudent.name
    });
  }
  if (!existingStudent && normalizedStudent.name && !isFiveDigitStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByIdentity(students, normalizedStudent.name, normalizedStudent.id);
  }

  if (existingStudent) {
    existingStudent.name = normalizedStudent.name || existingStudent.name;
    existingStudent.id = normalizedStudent.id || existingStudent.id || "";
    existingStudent.code = normalizedStudent.code || existingStudent.code || "";
    existingStudent.studentKey = existingStudent.studentKey || getStudentLookupKey(existingStudent);
    return existingStudent;
  }

  const newStudent = {
    ...normalizedStudent,
    studentKey: getStudentLookupKey(normalizedStudent)
  };
  students.push(newStudent);
  return newStudent;
}

function matchStudentForExamLogin(students, code, studentId, name) {
  const inputCode = sanitizeStudentCodeInput(code);
  const normalizedId = normalizeStudentId(studentId);
  let matchedStudent = null;
  if (isFiveDigitStudentCode(inputCode)) {
    matchedStudent = findStudentByCode(students, inputCode, { studentId: normalizedId, name });
  } else {
    matchedStudent = findStudentByIdentity(students, name, normalizedId);
  }
  return matchedStudent;
}

function buildRuntimeQuestionsForExam(exam) {
  const bank = Array.isArray(exam.questions) ? [...exam.questions] : [];
  const shouldShuffle = exam.shuffleQuestions !== false;
  const working = shouldShuffle ? shuffleArray(bank) : bank;
  const count = parseInt(exam.questionCount, 10);
  if (Number.isFinite(count) && count > 0) {
    return working.slice(0, Math.min(count, working.length));
  }
  return working;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function filterSearchResults(results, rawQuery) {
  const sanitizedQueryCode = sanitizeStudentCodeInput(rawQuery);
  const normalizedQueryId = normalizeStudentId(rawQuery);
  const normalizedQueryName = normalizeStudentName(rawQuery);
  return results.filter(res => {
    const resultCode = sanitizeStudentCodeInput(res.accessCode || "");
    if (isPrivateStudentCode(resultCode)) {
      return sanitizedQueryCode === resultCode;
    }
    const nameMatch = normalizeStudentName(res.name) === normalizedQueryName;
    const idMatch = normalizeStudentId(res.id) && normalizeStudentId(res.id) === normalizedQueryId;
    const sharedCodeMatch = isSharedStudentCode(resultCode) && sanitizedQueryCode === resultCode;
    const noCodeMatch = !resultCode && (nameMatch || idMatch);
    return nameMatch || idMatch || sharedCodeMatch || noCodeMatch;
  });
}

// Private code uniqueness
const students = [{ code: "12345", id: "", name: "Ali" }];
const dup = students.find(s => sanitizeStudentCodeInput(s.code) === "12345");
assert.ok(dup);
assert.strictEqual(isPrivateStudentCode("12345"), true);
assert.strictEqual(isSharedStudentCode("00000"), true);

// Shared code: knowing a victim ID is not enough to claim or overwrite that student.
const sharedStudents = [{ code: "00000", id: "STU100", name: "Victim", studentKey: "id:STU100" }];
assert.strictEqual(findStudentByCode(sharedStudents, "00000", { studentId: "STU100", name: "Attacker" }), null);
assert.strictEqual(matchStudentForExamLogin(sharedStudents, "00000", "STU100", "Attacker"), null);
assert.strictEqual(matchStudentForExamLogin(sharedStudents, "00000", "", "Victim"), null);
assert.strictEqual(matchStudentForExamLogin(sharedStudents, "", "STU100", "Attacker"), null);
assert.strictEqual(matchStudentForExamLogin(sharedStudents, "", "", "Victim"), null);
assert.strictEqual(findStudentById(sharedStudents, "STU100").name, "Victim");
const sharedInsert = upsertStudentRecord(sharedStudents, { name: "New Learner", id: "STU200", code: "00000" });
assert.strictEqual(sharedInsert.name, "New Learner");
assert.strictEqual(sharedStudents[0].name, "Victim");
assert.strictEqual(sharedStudents.length, 2);

// Shared code still reuses the same record when the submitted name and ID match.
const matchedShared = findStudentByCode(sharedStudents, "00000", { studentId: "STU100", name: "Victim" });
assert.strictEqual(matchedShared, sharedStudents[0]);
assert.strictEqual(matchStudentForExamLogin(sharedStudents, "", "STU100", "Victim"), sharedStudents[0]);

// Search: private code requires exact code
const results = [
  { name: "Ali", id: "", accessCode: "12345" },
  { name: "Sara", id: "X1", accessCode: "" }
];
assert.strictEqual(filterSearchResults(results, "12345").length, 1);
assert.strictEqual(filterSearchResults(results, "Ali").length, 0);
assert.strictEqual(filterSearchResults(results, "X1").length, 1);
assert.strictEqual(filterSearchResults(results, "99999").length, 0);

// Question bank: 300 -> 20
const bigExam = {
  shuffleQuestions: true,
  questionCount: 20,
  questions: Array.from({ length: 300 }, (_, i) => ({ id: i + 1 }))
};
const picked = buildRuntimeQuestionsForExam(bigExam);
assert.strictEqual(picked.length, 20);

const orderedExam = { shuffleQuestions: false, questionCount: 10, questions: Array.from({ length: 300 }, (_, i) => ({ id: i + 1 })) };
const ordered = buildRuntimeQuestionsForExam(orderedExam);
assert.strictEqual(ordered[0].id, 1);
assert.strictEqual(ordered.length, 10);

console.log("All student flow tests passed.");
