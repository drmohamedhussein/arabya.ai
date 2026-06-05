/**
 * Legacy student-profile-view must redirect to the isolated post-exam profile.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const questionsJs = fs.readFileSync(path.join(__dirname, "..", "questions.js"), "utf8");

assert.ok(
  appJs.includes('if (viewId === "student-profile-view")') &&
    appJs.includes('viewId = "student-profile-after-exam"'),
  "navigateToView should redirect legacy student-profile-view"
);

assert.ok(
  !questionsJs.includes('data-target="student-profile-view"'),
  "questions.js must not inject legacy student profile nav link"
);

assert.ok(
  questionsJs.includes("removeLegacyArabyaStudentProfileUi"),
  "questions.js should remove any legacy profile UI on boot"
);

assert.ok(
  !questionsJs.includes("function ensureArabyaStudentProfileView"),
  "legacy ensureArabyaStudentProfileView should be removed"
);

console.log("Legacy student profile redirect tests passed.");
