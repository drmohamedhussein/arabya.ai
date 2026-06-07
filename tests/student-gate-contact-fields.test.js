/**
 * Student gate must expose optional email and mobile fields before exam start.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

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

console.log("Student gate contact field tests passed.");
