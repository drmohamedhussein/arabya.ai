import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../js/arabya-security.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("cross-browser: login form has cloud sync URL and API secret fields", () => {
  assert.ok(htmlSource.includes('id="teacher-login-sync-url"'));
  assert.ok(htmlSource.includes('id="teacher-login-api-secret"'));
});

test("cross-browser: client prefetches teacher auth from cloud before login", () => {
  assert.ok(appSource.includes("async function prefetchTeacherAccountsFromCloud"));
  assert.ok(appSource.includes('scope: "teacher_login"'));
  assert.ok(appSource.includes("persistTeacherLoginCloudSettings"));
  assert.ok(appSource.includes("ensureCloudTeacherAuthBackup"));
});

test("cross-browser: GAS exposes teacher_login scope with auth fields", () => {
  assert.ok(gasSource.includes('scope === "teacher_login"'));
  const teacherLoginBlock = gasSource.slice(
    gasSource.indexOf("function sanitizeArabyaDbForTeacherLogin_"),
    gasSource.indexOf("function slimArabyaResultForExamStart_")
  );
  assert.ok(teacherLoginBlock.includes("delete safe.password"));
  assert.ok(!teacherLoginBlock.includes("delete safe.passwordHash"));
  assert.ok(!teacherLoginBlock.includes("delete safe.autoEntryCode"));
});

test("cross-browser: teacher_login scope requires configured API secret", () => {
  const getBackupStart = gasSource.indexOf('if (action === "get_backup")');
  const getBackupBlock = gasSource.slice(
    getBackupStart,
    gasSource.indexOf("var db = readArabyaDatabase_", getBackupStart)
  );

  assert.ok(gasSource.includes("function isArabyaApiSecretConfigured_()"));
  assert.ok(gasSource.includes("return !!getArabyaApiSecret_();"));
  assert.ok(getBackupBlock.includes('scope === "teacher_login"'));
  assert.ok(getBackupBlock.includes("!isArabyaApiSecretConfigured_()"));
  assert.ok(getBackupBlock.includes('return unauthorizedArabya_("ARABYA_API_SECRET is required for teacher_login scope")'));
});

test("cross-browser: cloud backup preserves teacher auth hashes", () => {
  const cloudBlock = securitySource.slice(
    securitySource.indexOf("function sanitizeTeacherForCloud"),
    securitySource.indexOf("global.ArabyaSecurity")
  );
  assert.ok(!cloudBlock.includes("delete copy.passwordHash"));
  assert.ok(!cloudBlock.includes("delete copy.autoEntryCode"));
  assert.ok(cloudBlock.includes("delete copy.password"));
});

console.log("Cross-browser teacher login tests passed.");
