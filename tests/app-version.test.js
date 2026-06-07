/**
 * Platform app version resolution from database vs build.
 */
const assert = require("assert");

function compareAppVersionStrings(a, b) {
  const partsA = String(a || "").trim().split(".").map(part => parseInt(part, 10) || 0);
  const partsB = String(b || "").trim().split(".").map(part => parseInt(part, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestAppVersion(...candidates) {
  const list = candidates.map(v => String(v || "").trim()).filter(Boolean);
  if (!list.length) return "";
  return list.reduce((best, current) => (compareAppVersionStrings(current, best) > 0 ? current : best), list[0]);
}

assert.ok(compareAppVersionStrings("2026.06.02.22", "2026.06.02.19") > 0);
assert.strictEqual(
  pickLatestAppVersion("2026.06.02.19", "2026.06.02.22", "2026.06.02.21"),
  "2026.06.02.22"
);
assert.strictEqual(
  pickLatestAppVersion("2026.06.02.24", "2026.06.02.27"),
  "2026.06.02.27"
);
assert.strictEqual(
  pickLatestAppVersion("", "2026.06.02.20"),
  "2026.06.02.20"
);

const appSource = require("fs").readFileSync(require("path").join(__dirname, "../app.js"), "utf8");
assert.ok(appSource.includes("function getStudentAnswerForQuestion"));
assert.ok(appSource.includes("function hasClientGradingKeysForExam(examId, presentedQuestions)"));
assert.ok(appSource.includes("Number(studentAns) === Number(correctAnswer)"));
assert.ok(appSource.includes("preserveSyncStatus"));
assert.ok(appSource.includes("2026.06.07.7"));

console.log("App version tests passed.");
