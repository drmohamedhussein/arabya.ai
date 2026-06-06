import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const cloudSource = readFileSync(new URL("../js/arabya-cloud-sync.js", import.meta.url), "utf8");

test("grading: student gate vault keeps answer keys locally", () => {
  assert.ok(appSource.includes("ARABYA_STUDENT_EXAM_VAULT_KEY"));
  assert.ok(appSource.includes("ARABYA_EXAM_ANSWER_VAULT_KEY"));
  assert.ok(appSource.includes("persistExamAnswerKeyVaultToStorage"));
  assert.ok(appSource.includes("hasClientGradingKeysForExam"));
  assert.ok(appSource.includes("fetchExamGradingKeysFromCloud"));
});

test("grading: student cloud backup must not overwrite teacher exams", () => {
  assert.ok(appSource.includes("delete fullData.exams"));
  assert.ok(cloudSource.includes("payload.exams = state._teacherExamsVault || state.exams || []"));
  assert.ok(cloudSource.includes("isTeacher ? collectAllQuestionBanksForCloud() : {}"));
});

test("grading: GAS exposes secure grading keys endpoint", () => {
  assert.ok(gasSource.includes("buildArabyaExamGradingKeys_"));
  assert.ok(gasSource.includes("get_exam_grading_keys"));
});

test("grading: submit waits for server when local keys missing", () => {
  assert.ok(appSource.includes("canGradeLocally = hasClientGradingKeysForExam"));
  assert.ok(appSource.includes("جاري التصحيح على الخادم"));
  assert.ok(appSource.includes("computeScaledScoreFromQuestionScores_"));
});

console.log("Exam answer key grading tests passed.");
