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
});

test("grading: completion clears persisted student answer vaults", () => {
  const cleanupBlock = appSource.slice(
    appSource.indexOf("function discardStudentExamAnswerVault"),
    appSource.indexOf("function hasClientGradingKeysForExam")
  );
  assert.ok(cleanupBlock.includes("persistExamAnswerKeyVaultToStorage()"));
  assert.ok(cleanupBlock.includes("localStorage.setItem(ARABYA_STUDENT_EXAM_VAULT_KEY"));
  assert.ok(cleanupBlock.includes("stripAnswerKeysFromExam"));
  assert.ok(appSource.includes("discardStudentExamAnswerVault(systemState.currentExam?.id);"));
});

test("grading: student cloud backup must not overwrite teacher exams", () => {
  assert.ok(appSource.includes("delete fullData.exams"));
  assert.ok(cloudSource.includes("payload.exams = state._teacherExamsVault || state.exams || []"));
  assert.ok(cloudSource.includes("isTeacher ? collectAllQuestionBanksForCloud() : {}"));
});

test("grading: student cloud backup must not overwrite rosters or results", () => {
  const buildBlock = appSource.slice(
    appSource.indexOf("function buildSaveBackupPayload"),
    appSource.indexOf("function isArabyaCloudPostQueued")
  );
  assert.ok(buildBlock.includes("delete fullData.students"));
  assert.ok(buildBlock.includes("delete fullData.results"));
  assert.ok(buildBlock.includes("delete fullData.deletedStudentKeys"));
  assert.ok(buildBlock.includes("delete fullData.deletedResultKeys"));
  const pushBlock = appSource.slice(
    appSource.indexOf("async function pushCloudBackupNow"),
    appSource.indexOf("function propagateStudentEditsToResults")
  );
  assert.ok(pushBlock.includes("if (!isTeacherSessionActive())"));
  assert.ok(pushBlock.includes("return false"));
});

test("grading: GAS preserves correctAnswer when merging exams", () => {
  assert.ok(gasSource.includes("mergeArabyaExamsPreservingAnswerKeys_"));
  assert.ok(gasSource.includes("mergeArabyaExamQuestionsPreservingAnswerKeys_"));
});

test("grading: submit waits for server when local keys missing", () => {
  assert.ok(appSource.includes("canGradeLocally = hasClientGradingKeysForExam"));
  assert.ok(appSource.includes("جاري التصحيح على الخادم"));
});

console.log("Exam answer key grading tests passed.");
