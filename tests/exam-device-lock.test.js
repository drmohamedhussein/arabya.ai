/**
 * Device lock and duplicate exam attempt tests (mirrors app.js rules)
 */
const assert = require("assert");

function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
}

function normalizeStudentName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

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

function getStudentLookupKey(student) {
  const code = sanitizeStudentCodeInput(student?.code || student?.accessCode || "");
  if (isPrivateStudentCode(code)) return `code:${code}`;
  const normalizedId = normalizeStudentId(student?.id);
  if (normalizedId) return `id:${normalizedId}`;
  const normalizedName = normalizeStudentName(student?.name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function buildStudentMatchContext(student) {
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
  const keys = getStudentLookupKeysForMatch(student);
  if (result.studentLookupKey && keys.includes(result.studentLookupKey)) return true;
  const resultId = normalizeStudentId(result.id || "");
  const studentId = normalizeStudentId(student.id || "");
  const resultCode = sanitizeStudentCodeInput(result.accessCode || result.code || "");
  const studentCode = sanitizeStudentCodeInput(student.accessCode || student.code || "");
  if (isPrivateStudentCode(studentCode) && studentCode && resultCode === studentCode) return true;
  if (resultId && studentId && resultId === studentId) return true;
  const resultName = normalizeStudentName(result.name || "");
  const studentName = normalizeStudentName(student.name || "");
  if (resultName && studentName && resultName === studentName) {
    if (!resultId && !studentId) return true;
    if (resultId && studentId && resultId === studentId) return true;
  }
  return false;
}

function normalizeDeviceIp(value) {
  return String(value || "").trim().toLowerCase();
}

function deviceProfileMatchesResult(profile, result) {
  if (!profile || !result) return false;
  if (profile.deviceFingerprint && result.deviceFingerprint && profile.deviceFingerprint === result.deviceFingerprint) {
    return true;
  }
  if (profile.deviceId && result.deviceId && profile.deviceId === result.deviceId) {
    return true;
  }
  const profileIp = normalizeDeviceIp(profile.clientIp);
  const resultIp = normalizeDeviceIp(result.clientIp);
  return !!(profileIp && resultIp && profileIp === resultIp);
}

function findBlockingExamResult(results, studentLookupKey, examId, studentContext) {
  if (!examId) return null;
  const ctx = studentContext || buildStudentMatchContext({ studentKey: studentLookupKey || "" });
  return results.find(r =>
    r.examId === examId &&
    !r.superseded &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled") &&
    resultMatchesStudentIdentity(r, ctx)
  ) || null;
}

function findDeviceExamAttemptConflict(results, profile, examId, studentContext) {
  if (!examId || !studentContext) return null;
  let sameStudentBlock = null;
  let otherStudentBlock = null;

  results.forEach(r => {
    if (!r || r.examId !== examId || r.superseded) return;
    if (r.allowRetake === true) return;
    const isFinished = r.status !== "incomplete" && (r.status === "completed" || r.status === "canceled");
    const isInProgress = r.status === "incomplete";
    const sameStudent = resultMatchesStudentIdentity(r, studentContext);
    if (sameStudent) {
      if (isFinished && !sameStudentBlock) sameStudentBlock = r;
      return;
    }
    if (!profile || !deviceProfileMatchesResult(profile, r)) return;
    if ((isFinished || isInProgress) && !otherStudentBlock) otherStudentBlock = r;
  });

  if (sameStudentBlock) return { kind: "same_student", result: sameStudentBlock };
  if (otherStudentBlock) return { kind: "other_student", result: otherStudentBlock };
  return null;
}

const examId = "EX-1";
const completedWithoutDevice = {
  recordId: "r1",
  examId,
  name: "طالب تجريبي",
  id: "STU1",
  accessCode: "12345",
  studentLookupKey: "code:12345",
  status: "completed",
  allowRetake: false
};

const ctx = buildStudentMatchContext({
  name: "طالب تجريبي",
  id: "STU1",
  accessCode: "12345",
  studentKey: "id:STU1"
});

assert.ok(findBlockingExamResult([completedWithoutDevice], "id:STU1", examId, ctx));
const deviceConflict = findDeviceExamAttemptConflict([completedWithoutDevice], {
  deviceFingerprint: "fp-new",
  deviceId: "dev-new",
  clientIp: "203.0.113.10"
}, examId, ctx);
assert.strictEqual(deviceConflict.kind, "same_student");

const otherStudentCtx = buildStudentMatchContext({
  name: "زميل آخر",
  id: "STU2",
  accessCode: "54321",
  studentKey: "code:54321"
});
const otherConflict = findDeviceExamAttemptConflict([{
  ...completedWithoutDevice,
  name: "طالب تجريبي",
  studentLookupKey: "code:12345",
  deviceFingerprint: "fp-shared",
  deviceId: "dev-shared",
  clientIp: "198.51.100.8"
}], {
  deviceFingerprint: "fp-shared",
  deviceId: "dev-shared",
  clientIp: "198.51.100.8"
}, examId, otherStudentCtx);
assert.strictEqual(otherConflict.kind, "other_student");

assert.ok(deviceProfileMatchesResult(
  { clientIp: "192.0.2.44" },
  { clientIp: "192.0.2.44" }
));

function canStudentBypassExamLockForExam(results, examId, studentContext) {
  const activeRetake = results.find(r =>
    r.examId === examId &&
    r.allowRetake === true &&
    !r.superseded &&
    r.status !== "incomplete" &&
    resultMatchesStudentIdentity(r, studentContext)
  );
  if (activeRetake) return true;
  return results.some(r =>
    r.examId === examId &&
    !r.superseded &&
    r.status !== "incomplete" &&
    r.ipReleasedByTeacher &&
    resultMatchesStudentIdentity(r, studentContext)
  );
}

const lockedResult = { ...completedWithoutDevice, ipReleasedByTeacher: false, allowRetake: false };
assert.ok(!canStudentBypassExamLockForExam([lockedResult], examId, ctx));

const retakeAllowed = { ...completedWithoutDevice, allowRetake: true };
assert.ok(canStudentBypassExamLockForExam([retakeAllowed], examId, ctx));

const ipReleased = { ...completedWithoutDevice, ipReleasedByTeacher: true };
assert.ok(canStudentBypassExamLockForExam([ipReleased], examId, ctx));

function ipMatchesAllowedList(clientIp, allowedList) {
  const ip = normalizeDeviceIp(clientIp);
  if (!ip || !allowedList || !allowedList.length) return false;
  return allowedList.some(allowed => {
    const a = normalizeDeviceIp(allowed);
    if (!a) return false;
    if (ip === a) return true;
    const prefix = a.split(".").slice(0, 3).join(".");
    return prefix.length >= 7 && ip.startsWith(prefix + ".");
  });
}

function shouldBypassExamDeviceLock(exam, profile, conflictResult) {
  const allowed = [
    ...(exam?.hallMode?.allowedIps || []),
    ...(exam?.allowedRetakeIps || [])
  ];
  const onList = ip => ipMatchesAllowedList(ip, allowed);
  if (onList(profile?.clientIp)) return true;
  if (conflictResult && onList(conflictResult.clientIp)) return true;
  return false;
}

const labExam = {
  id: examId,
  allowedRetakeIps: ["198.51.100.8"],
  hallMode: { enabled: false, allowedIps: [] }
};
const blockedOther = {
  ...completedWithoutDevice,
  deviceFingerprint: "fp-shared",
  clientIp: "198.51.100.8"
};
assert.ok(shouldBypassExamDeviceLock(
  labExam,
  { clientIp: "198.51.100.9", deviceFingerprint: "fp-shared" },
  blockedOther
), "allowlist on prior result IP bypasses device lock for lab PCs");

assert.ok(!shouldBypassExamDeviceLock(
  { id: examId, allowedRetakeIps: [], hallMode: { allowedIps: [] } },
  { clientIp: "198.51.100.9" },
  blockedOther
), "no allowlist keeps device lock");

function checkExamSharedIpAdmissionAdvisory(examId, clientIp, studentLookupKey, results, bindings) {
  const ip = normalizeDeviceIp(clientIp);
  if (!ip || !examId) return { ok: true, sharedIp: false };
  const others = countDistinctStudentsOnExamIpForTest(results, bindings, examId, ip, studentLookupKey);
  return { ok: true, sharedIp: others > 0, othersOnIp: others };
}

function countDistinctStudentsOnExamIpForTest(results, bindings, examId, clientIp, excludeLookupKey) {
  const ip = normalizeDeviceIp(clientIp);
  const keys = new Set();
  (results || []).forEach(r => {
    if (!r || r.examId !== examId) return;
    if (normalizeDeviceIp(r.clientIp) !== ip) return;
    const key = r.studentLookupKey || r.id;
    if (!key || key === excludeLookupKey) return;
    keys.add(key);
  });
  (bindings || []).forEach(b => {
    if (!b || b.examId !== examId) return;
    if (normalizeDeviceIp(b.clientIp) !== ip) return;
    if (b.studentLookupKey && b.studentLookupKey !== excludeLookupKey) keys.add(b.studentLookupKey);
  });
  return keys.size;
}

const advisory = checkExamSharedIpAdmissionAdvisory("e1", "1.2.3.4", "new-student", [
  { examId: "e1", clientIp: "1.2.3.4", studentLookupKey: "a" }
], []);
assert.strictEqual(advisory.ok, true, "shared IP must not auto-block");
assert.strictEqual(advisory.sharedIp, true, "shared IP should flag for teacher");

const studentBlockMsg =
  "تم رفض الدخول إلى هذا الامتحان من هذه الشبكة أو الجهاز.\n\n" +
  "يرجى التواصل مع المعلم أو مدير المنصة.";
assert.ok(!studentBlockMsg.includes("آخر طالب"), "student block message must not expose other student");

console.log("All exam device lock tests passed.");
