/**
 * Student gate must expose optional email and mobile fields before exam start.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function assertOptionalInput(id) {
  const match = indexHtml.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, "i"));
  assert.ok(match, `missing #${id} in index.html`);
  assert.ok(!/\brequired\b/i.test(match[0]), `#${id} must be optional`);
}

assertOptionalInput("student-email-input");
assertOptionalInput("student-mobile-input");
assertOptionalInput("student-reg-email");
assertOptionalInput("student-reg-mobile");

assert.ok(indexHtml.includes("البريد الإلكتروني (اختياري)"));
assert.ok(indexHtml.includes("رقم الموبايل (اختياري)"));

const upsertBlock = appSource.slice(
  appSource.indexOf("function upsertStudentRecord"),
  appSource.indexOf("function buildStudentMatchContext")
);
assert.ok(upsertBlock.includes("function upsertStudentRecord"));

const studentState = {
  students: [{
    name: "Ali",
    id: "S1",
    code: "ABC123",
    email: "old@example.com",
    mobile: "01000000000",
    studentKey: "code:ABC123"
  }]
};
const sandbox = {
  systemState: studentState,
  isStudentRecordDeleted: () => false,
  getStudentLookupKey: student => student?.studentKey || (student?.code ? `code:${String(student.code).toUpperCase()}` : ""),
  isStudentKeyDeleted: () => false,
  normalizeStudentId: value => String(value || "").trim(),
  sanitizeStudentCodeInput: value => String(value || "").trim().toUpperCase(),
  hasStudentCode: value => String(value || "").trim() !== "",
  normalizeContactField: value => String(value || "").trim(),
  isPrivateStudentCode: value => String(value || "").trim() !== "00000",
  isSharedStudentCode: value => String(value || "").trim() === "00000",
  findStudentByCode(code) {
    return studentState.students.find(student => student.code === code) || null;
  },
  findStudentById(id) {
    return studentState.students.find(student => student.id === id) || null;
  },
  findStudentsByName(name) {
    return studentState.students.filter(student => student.name === name);
  },
  pickEarlierStudentTimestamp: (existing, incoming) => existing || incoming,
  createRecordId: prefix => `${prefix}_1`,
  ensureStudentAccountType: student => student
};
vm.createContext(sandbox);
vm.runInContext(upsertBlock, sandbox);

let student = sandbox.upsertStudentRecord({
  name: "Ali",
  id: "S1",
  code: "ABC123",
  email: "",
  mobile: ""
});
assert.strictEqual(student.email, "old@example.com", "blank optional email must not wipe stored email");
assert.strictEqual(student.mobile, "01000000000", "blank optional mobile must not wipe stored mobile");

student = sandbox.upsertStudentRecord({
  name: "Ali",
  id: "S1",
  code: "ABC123",
  email: "new@example.com",
  mobile: "01111111111"
});
assert.strictEqual(student.email, "new@example.com", "non-empty email should update stored email");
assert.strictEqual(student.mobile, "01111111111", "non-empty mobile should update stored mobile");

console.log("Student gate contact field tests passed.");
