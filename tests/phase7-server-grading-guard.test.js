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

test("phase7: cloud attempt registration failures block exam start", () => {
  const registerBlock = appSource.slice(
    appSource.indexOf("async function registerExamAttemptWithCloud"),
    appSource.indexOf("async function logCheatEventToCloud")
  );
  assert.ok(registerBlock.includes("code: \"network_error\""));
  assert.ok(registerBlock.includes("code: \"queued\""));
  assert.ok(registerBlock.includes("تعذر تسجيل محاولة الامتحان"));
  assert.ok(registerBlock.includes("تعذر تأكيد تسجيل محاولة الامتحان"));
});

test("phase7: GAS blocks duplicate results even without attempt token", () => {
  const processBlock = gasSource.slice(
    gasSource.indexOf("function processArabyaAddResult_"),
    gasSource.indexOf("function checkArabyaRateLimit_")
  );
  assert.ok(processBlock.includes("var blockingResult = findBlockingArabyaResult_(db, studentLookupKey, examId);"));
  assert.ok(processBlock.indexOf("var blockingResult = findBlockingArabyaResult_") < processBlock.indexOf("if (attemptToken)"));
  assert.ok(processBlock.includes('code: "blocked_attempt"'));
});

console.log("Phase 7 server grading guard tests passed.");
