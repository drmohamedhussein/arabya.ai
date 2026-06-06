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

test("student exam: direct link awaits cloud sync before showing exam", () => {
  const block = appSource.slice(
    appSource.indexOf("if (examId) {"),
    appSource.indexOf("} else if (hasStudentGateCloudContext()")
  );
  assert.ok(block.includes("await syncDatabaseFromCloud"));
  assert.ok(block.includes('scope: "exam_start"'));
  assert.ok(block.includes("forcePull: true"));
});

test("student exam: GAS allows public exam_start backup without API secret", () => {
  assert.ok(gasSource.includes("function isArabyaGetBackupAuthorized_"));
  assert.ok(gasSource.includes('if (scope === "exam_start") return true'));
});

console.log("Student exam cloud sync tests passed.");
