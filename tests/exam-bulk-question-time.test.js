/**
 * Bulk apply per-question timeSeconds in exam editor settings.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(indexHtml.includes('id="edit-meta-bulk-q-time"'));
assert.ok(indexHtml.includes('id="edit-meta-bulk-q-time-apply-btn"'));
assert.ok(indexHtml.includes("تحديد مدة الإجابة لكل نقطة بالثواني"));
assert.ok(appSource.includes("function applyBulkQuestionTimeToAll"));
assert.ok(appSource.includes("resolveBulkQuestionTimeSeconds_"));
assert.ok(appSource.includes("#editor-questions-list .edit-q-time"));

const fnStart = appSource.indexOf("function resolveBulkQuestionTimeSeconds_");
const fnEnd = appSource.indexOf("window.applyBulkQuestionTimeToAll");
const block = appSource.slice(fnStart, fnEnd);
const sandbox = { parseInt, Math, String };
vm.createContext(sandbox);
vm.runInContext(block, sandbox);
assert.strictEqual(sandbox.resolveBulkQuestionTimeSeconds_("45"), 45);
assert.strictEqual(sandbox.resolveBulkQuestionTimeSeconds_("4"), null);
assert.strictEqual(sandbox.resolveBulkQuestionTimeSeconds_(""), null);

console.log("exam-bulk-question-time.test.js: all assertions passed");
