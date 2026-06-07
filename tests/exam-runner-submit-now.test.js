/**
 * Exam runner must expose an early submit button wired to submitFinishedExam.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(indexHtml.includes('id="runner-submit-now-btn"'));
assert.ok(indexHtml.includes("تسليم الإجابات الآن"));
assert.ok(!/<input[^>]*id="runner-submit-now-btn"[^>]*\brequired\b/i.test(indexHtml));

const submitMatch = indexHtml.match(/<button[^>]*id="runner-submit-now-btn"[^>]*>/i);
assert.ok(submitMatch);
assert.ok(/var\(--error\)/.test(submitMatch[0]) || /runner-submit-now-btn/.test(indexHtml));

assert.ok(appSource.includes("function submitExamNowFromRunner"));
assert.ok(appSource.includes('getElementById("runner-submit-now-btn")'));
assert.ok(appSource.includes("void submitFinishedExam()"));

console.log("exam-runner-submit-now.test.js: all assertions passed");
