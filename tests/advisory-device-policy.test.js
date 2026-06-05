import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");

test("advisory policy: students are not auto-blocked on shared device/IP repeat", () => {
  const enforceStart = appSource.indexOf("async function enforceExamDeviceBinding");
  const enforceBlock = appSource.slice(
    enforceStart,
    appSource.indexOf("function buildResultDeviceFields(profile)", enforceStart)
  );
  assert.ok(!enforceBlock.includes('getStudentDeviceBlockMessage("other_student")'));
  assert.ok(!enforceBlock.includes('getStudentDeviceBlockMessage("registry_conflict")'));
  assert.ok(!enforceBlock.includes("return { ok: false, message: ipSlot.message"));
  assert.ok(enforceBlock.includes("مشترك"));
  assert.ok(enforceBlock.includes("isIpBlockedForExam"));
  assert.ok(enforceBlock.includes("isDeviceBlockedForExam"));
});

test("advisory policy: teacher can block IP/device from result badges", () => {
  assert.ok(appSource.includes("window.arabyaTeacherBlockExamIp"));
  assert.ok(appSource.includes("window.arabyaTeacherBlockExamDevice"));
  assert.ok(appSource.includes("blockedIps"));
  assert.ok(appSource.includes("blockedDeviceFingerprints"));
});

test("advisory policy: GAS only blocks explicit teacher blocklists", () => {
  const registerBlock = gasSource.slice(
    gasSource.indexOf("function registerArabyaExamAttempt_"),
    gasSource.indexOf("function logArabyaCheatEvent_")
  );
  assert.ok(registerBlock.includes("isIpBlockedOnArabyaExam_"));
  assert.ok(registerBlock.includes("isDeviceBlockedOnArabyaExam_"));
  assert.ok(!registerBlock.includes('code: "device_conflict"'));
  assert.ok(!registerBlock.includes('code: "device_registry_conflict"'));
});

test("advisory policy: student block message is generic", () => {
  assert.ok(appSource.includes("STUDENT_EXPLICIT_ACCESS_BLOCK_MESSAGE"));
  assert.ok(!appSource.includes("سبق استخدام هذا الجهاز أو المتصفح لمحاولة أخرى"));
});

console.log("Advisory device policy tests passed.");
