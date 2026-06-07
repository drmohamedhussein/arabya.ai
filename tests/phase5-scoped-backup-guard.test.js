import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

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
  assert.ok(
    appSource.includes('resolveStudentExamScopeId(mergeOptions.examId || "")') ||
    appSource.includes('examId: options.examId || resolveStudentExamScopeId()')
  );
});

test("phase5: student direct-link sync uses exam_start scope", () => {
  const block = appSource.slice(
    appSource.indexOf("const syncParam = getUrlParameter(\"s\")"),
    appSource.indexOf("// 4. فتح امتحان مخصص للطالب")
  );
  assert.ok(block.includes('scope: "exam_start"'));
});

test("phase5: exam_start backup strips correctAnswer on server", () => {
  const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
  assert.ok(gasSource.includes("stripCorrectAnswersFromExams_"));
});

test("phase5: public exam_start backup does not expose peer results", () => {
  const start = gasSource.indexOf("function normalizeArabyaExamIdForMatch_");
  const end = gasSource.indexOf("function getExamMaxCheatAttempts_");
  assert.ok(start > 0 && end > start);

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(gasSource.slice(start, end), sandbox);

  const payload = sandbox.buildArabyaExamStartBackup_({
    schemaVersion: "1",
    appVersion: "test",
    exams: [{
      id: "exam_a",
      questions: [{ id: 1, correctAnswer: 0 }]
    }],
    results: [{
      examId: "exam_a",
      name: "Student A",
      score: "100 / 100",
      clientIp: "198.51.100.10"
    }],
    examDeviceRegistry: {
      bindings: [{ examId: "exam_a", studentLookupKey: "code:A" }]
    }
  }, "EXAM_A");

  assert.strictEqual(payload.exams.length, 1, "exam lookup should be case-insensitive");
  assert.strictEqual(payload.exams[0].questions[0].correctAnswer, undefined);
  assert.strictEqual(payload.results.length, 0, "public exam_start must not leak peer result rows");
  assert.strictEqual(payload.examDeviceRegistry.bindings.length, 1);
  assert.strictEqual(sandbox.findArabyaExamInDb_({ exams: payload.exams }, "EXAM_A").id, "exam_a");
});

test("phase5: no first-run admin credential alert on public site", () => {
  assert.ok(!appSource.includes("_pendingFirstRunCredentials"));
  assert.ok(!appSource.includes("تم إنشاء حساب مدير المنصة لأول مرة"));
});

console.log("Phase 5 scoped backup guard tests passed.");
