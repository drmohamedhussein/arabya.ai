/**
 * Student code should act as login username when starting exams.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const questionsJs = fs.readFileSync(path.join(__dirname, "..", "questions.js"), "utf8");

assert.ok(
  appJs.includes('purpose: "exam_start"') &&
    appJs.includes('options.purpose === "exam_start"'),
  "app.js should support exam_start identity validation purpose"
);

assert.ok(
  questionsJs.includes('purpose: "exam_start"') &&
    questionsJs.includes("student-fullname-input"),
  "questions.js exam-start click guard should pass student name and exam_start purpose"
);

console.log("Student code exam login tests passed.");
