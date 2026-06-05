import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("phase7: GAS strips correctAnswer from exam_start backup", () => {
  assert.ok(gasSource.includes("stripCorrectAnswersFromExams_"));
  assert.ok(gasSource.includes("exams = stripCorrectAnswersFromExams_(exams)"));
});

test("phase7: GAS grades add_result server-side", () => {
  assert.ok(gasSource.includes("processArabyaAddResult_"));
  assert.ok(gasSource.includes("gradeArabyaExamResult_"));
  assert.ok(gasSource.includes("graded:"));
});

test("phase7: GAS supports register_exam_attempt and log_cheat_event", () => {
  assert.ok(gasSource.includes('action === "register_exam_attempt"'));
  assert.ok(gasSource.includes('action === "log_cheat_event"'));
  assert.ok(gasSource.includes("registerArabyaExamAttempt_"));
  assert.ok(gasSource.includes("logArabyaCheatEvent_"));
});

test("phase7: client hides answer keys from student runtime", () => {
  assert.ok(appSource.includes("stripAnswerKeysFromQuestion"));
  assert.ok(appSource.includes("registerExamAttemptWithCloud"));
  assert.ok(appSource.includes("logCheatEventToCloud"));
  assert.ok(appSource.includes("applyServerGradedResult"));
});

console.log("Phase 7 server grading guard tests passed.");
