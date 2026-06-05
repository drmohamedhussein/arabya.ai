import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../js/arabya-security.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("cross-browser: login form must not expose cloud sync URL fields publicly", () => {
  assert.ok(!htmlSource.includes('id="teacher-login-sync-url"'));
  assert.ok(!htmlSource.includes('id="teacher-login-api-secret"'));
  assert.ok(htmlSource.includes("رابط دخول لمرة واحدة"));
});

test("cross-browser: client prefetches teacher auth from cloud before login", () => {
  assert.ok(appSource.includes("async function prefetchTeacherAccountsFromCloud"));
  assert.ok(appSource.includes('scope: "teacher_login"'));
  assert.ok(appSource.includes("persistTeacherLoginCloudSettings"));
  assert.ok(appSource.includes("ensureCloudTeacherAuthBackup"));
  assert.ok(appSource.includes("function getInternalTeacherLoginSyncUrl"));
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
  assert.ok(teacherLoginBlock.includes("delete safe.integrationConfig.googleFormUrl"));
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
