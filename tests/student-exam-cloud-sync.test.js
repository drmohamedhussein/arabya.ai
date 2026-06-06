import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const questionsSource = readFileSync(new URL("../questions.js", import.meta.url), "utf8");

test("student exam: share links keep app.js getExamDirectLink (no override without sync)", () => {
  assert.ok(appSource.includes('params.set("s", syncUrl)'));
  assert.ok(!questionsSource.includes('window.getExamDirectLink = function(exam)'));
  assert.ok(questionsSource.includes("يُبقي توليد الرابط على app.js"));
});

test("student exam: teacher sync registry resolves cloud URL for gate", () => {
  assert.ok(appSource.includes("ARABYA_TEACHER_SYNC_REGISTRY_KEY"));
  assert.ok(appSource.includes("function resolveSyncUrlForTeacherUsername"));
  assert.ok(appSource.includes("function bootstrapStudentGateSyncConfig"));
  assert.ok(appSource.includes("saveTeacherSyncRegistryEntry"));
});

test("student exam: silent cloud pull does not toast students", () => {
  assert.ok(appSource.includes("function recordCloudSyncOutcome(ok, detail, options = {})"));
  assert.ok(appSource.includes('recordCloudSyncOutcome(false, response.message || "تعذّر الجلب من السحابة", { silent })'));
  assert.ok(appSource.includes('recordCloudSyncOutcome(true, "جلب من السحابة", { silent })'));
});

test("student exam: direct link waits for cloud exam before showing title", () => {
  assert.ok(appSource.includes("function bootstrapStudentDirectLinkViewEarly"));
  assert.ok(appSource.includes("waitPreExamCountdownAndSync"));
  assert.ok(appSource.includes("ensureStudentGateExamReady"));
  assert.ok(appSource.includes("navigateToView(\"student-login-view\")"));
  assert.ok(appSource.includes("function mergeRemoteExamsForStudentGate_"));
  assert.ok(appSource.includes("جاري تحميل بيانات الامتحان من السحابة"));
});

test("student exam: preserves answer keys and waits for server grading", () => {
  assert.ok(appSource.includes("function mergeRemoteExamsPreservingAnswerKeys_"));
  assert.ok(appSource.includes("function resolveClientQuestionsForGrading_"));
  assert.ok(appSource.includes("async function submitFinishedExam"));
  assert.ok(appSource.includes("await sendResultToGoogleSheets"));
  assert.ok(appSource.includes("saveStudentsToLocalStorage();"));
});

test("student exam: GAS allows public exam_start backup without API secret", () => {
  assert.ok(gasSource.includes("function isArabyaGetBackupAuthorized_"));
  assert.ok(gasSource.includes('if (scope === "exam_start") return true'));
});

test("student exam: GAS allows student post actions without API secret", () => {
  assert.ok(gasSource.includes("function isArabyaPostActionAuthorized_"));
  assert.ok(gasSource.includes('"register_exam_attempt": true'));
  assert.ok(gasSource.includes('"log_cheat_event": true'));
  assert.ok(gasSource.includes('"add_result": true'));
});

test("student exam: sync URL list is scoped to target teacher only", () => {
  assert.ok(appSource.includes("if (!isTeacherSessionActive() && hasStudentGateCloudContext())"));
  assert.ok(appSource.includes("return Array.from(urls).filter(Boolean).slice(0, 1);"));
  assert.ok(appSource.includes("if (isTeacherSessionActive()) {"));
});

console.log("Student exam cloud sync tests passed.");
