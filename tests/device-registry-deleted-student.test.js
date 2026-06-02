/**
 * Device registry must not block after student deletion.
 */
const assert = require("assert");

const deletedKeys = ["code:11111", "name:ةة"];

function isStudentKeyDeleted(key) {
  return deletedKeys.includes(String(key));
}

function isStudentRecordDeleted(student) {
  if (!student) return false;
  if (student.studentKey && isStudentKeyDeleted(student.studentKey)) return true;
  const code = String(student.code || "").replace(/\D/g, "").slice(0, 5);
  if (code && isStudentKeyDeleted(`code:${code}`)) return true;
  const name = String(student.name || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (name && isStudentKeyDeleted(`name:${name}`)) return true;
  return false;
}

function isRegistryBindingForDeletedStudent(entry) {
  if (!entry) return false;
  const key = String(entry.studentLookupKey || "").trim();
  if (key && isStudentKeyDeleted(key)) return true;
  return isStudentRecordDeleted({
    studentKey: key,
    name: entry.studentName || "",
    code: ""
  });
}

function deviceBindingMatchesEntry(profile, entry) {
  return !!(
    profile.deviceFingerprint &&
    entry.deviceFingerprint &&
    profile.deviceFingerprint === entry.deviceFingerprint
  );
}

const profile = { deviceFingerprint: "fp-lab-1", deviceId: "dev-1" };
const bindings = [
  {
    examId: "e1",
    studentLookupKey: "code:11111",
    studentName: "ةة",
    deviceFingerprint: "fp-lab-1"
  }
];

const active = bindings.filter(b => !isRegistryBindingForDeletedStudent(b));
assert.strictEqual(active.length, 0);

const conflict = active.find(
  b => b.studentLookupKey !== "code:22222" && deviceBindingMatchesEntry(profile, b)
);
assert.strictEqual(conflict, undefined);

console.log("Device registry deleted-student tests passed.");
