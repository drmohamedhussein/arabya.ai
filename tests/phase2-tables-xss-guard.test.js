/**
 * Teacher tables must escape student/result fields in innerHTML rows.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

const resultsStart = appSource.indexOf("function renderStudentResultsTable");
const resultsBlock = appSource.slice(resultsStart, appSource.indexOf("function getResultDetail", resultsStart));
const studentsStart = appSource.indexOf("function renderTeacherStudentsTable");
const studentsBlock = appSource.slice(studentsStart, appSource.indexOf("function showAddStudentModal", studentsStart));

assert.ok(resultsBlock.includes("escapeHtml(res.name"), "results table must escape student name");
assert.ok(resultsBlock.includes("escapeHtml(res.examTitle"), "results table must escape exam title");
assert.ok(studentsBlock.includes("escapeHtml(s.name"), "students table must escape student name");

console.log("Phase 2 tables XSS guard tests passed.");
