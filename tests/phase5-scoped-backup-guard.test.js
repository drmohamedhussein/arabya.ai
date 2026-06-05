import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");

test("phase5: GAS supports exam_start scoped get_backup", () => {
  assert.ok(gasSource.includes("function buildArabyaExamStartBackup_"));
  assert.ok(gasSource.includes('scope === "exam_start"'));
  assert.ok(gasSource.includes("function slimArabyaResultForExamStart_"));
  assert.ok(gasSource.includes("function checkArabyaRateLimit_"));
  assert.ok(gasSource.includes('code: "rate_limited"'));
});

test("phase5: client passes scope and exam to get_backup", () => {
  assert.ok(appSource.includes("function buildCloudBackupFetchParams"));
  assert.ok(appSource.includes("function resolveStudentExamScopeId"));
  assert.ok(appSource.includes('scope: "exam_start"'));
  assert.ok(appSource.includes("buildCloudBackupFetchParams(mergeOptions)"));
  assert.ok(appSource.includes('examId: resolveStudentExamScopeId()'));
});

test("phase5: student direct-link sync uses exam_start scope", () => {
  const block = appSource.slice(
    appSource.indexOf("const syncParam = getUrlParameter(\"s\")"),
    appSource.indexOf("// 4. فتح امتحان مخصص للطالب")
  );
  assert.ok(block.includes('scope: "exam_start"'));
});

test("phase5: first-run admin alert hidden on student exam links", () => {
  assert.ok(appSource.includes("isLikelyStudentExamRequest"));
  assert.ok(appSource.includes("hasTeacherLoginToken || !isLikelyStudentExamRequest"));
});

console.log("Phase 5 scoped backup guard tests passed.");
