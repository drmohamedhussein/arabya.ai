/**
 * Unified student code module exists and matches lib implementation.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const browser = fs.readFileSync(path.join(__dirname, "..", "js", "arabya-student-codes.js"), "utf8");
const lib = require("../lib/student-codes");

assert.ok(browser.includes("global.ArabyaStudentCodes"), "browser module must export ArabyaStudentCodes");
assert.strictEqual(lib.sanitizeStudentCodeInput("000000"), "00000");
assert.strictEqual(lib.sanitizeStudentCodeInput("ARABYA_FREE"), "ARABYA_FREE");
assert.strictEqual(lib.isSharedStudentCode("00000"), true);
assert.strictEqual(lib.isPrivateStudentCode("ABC12"), true);

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(indexHtml.includes("arabya-student-codes.js"), "index must load student codes module before app.js");

console.log("Phase 3 student codes module tests passed.");
