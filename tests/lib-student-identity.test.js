/**
 * lib/student-identity.js — real module import tests.
 */
const assert = require("assert");
const { validateStudentIdentityInput } = require("../lib/student-identity");

const students = [
  { studentKey: "s1", name: "Ali", id: "A1", code: "11111" },
  { studentKey: "s2", name: "Sara", id: "A2", code: "22222" }
];

assert.strictEqual(validateStudentIdentityInput("", "22222", students, { name: "Sara", purpose: "exam_start" }).ok, true);
assert.strictEqual(validateStudentIdentityInput("WRONG", "22222", students, { name: "Sara", purpose: "exam_start" }).ok, false);
assert.strictEqual(validateStudentIdentityInput("", "22222", students, { name: "New", editingStudentKey: "s9" }).ok, false);

console.log("lib/student-identity tests passed.");
