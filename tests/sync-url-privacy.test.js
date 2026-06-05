import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("privacy: public teacher login must not expose sync URL or API secret fields", () => {
  assert.ok(!htmlSource.includes('id="teacher-login-sync-url"'));
  assert.ok(!htmlSource.includes('id="teacher-login-api-secret"'));
  assert.ok(!htmlSource.includes("script.google.com/macros/s/"));
});

test("privacy: share links must not embed s= sync parameter", () => {
  const getExamDirectLinkBlock = appSource.slice(
    appSource.indexOf("function getExamDirectLink"),
    appSource.indexOf("async function checkUrlParameters")
  );
  assert.ok(!getExamDirectLinkBlock.includes('params.set("s"'));

  const buildShareBlock = appSource.slice(
    appSource.indexOf("function buildExamShareLink"),
    appSource.indexOf("window.copyExamLink")
  );
  assert.ok(buildShareBlock.includes('url.searchParams.delete("s")'));
  assert.ok(!buildShareBlock.includes('url.searchParams.set("s"'));
});

test("privacy: GAS client responses strip googleFormUrl", () => {
  const clientSanitize = gasSource.slice(
    gasSource.indexOf("function sanitizeArabyaDbForClient_"),
    gasSource.indexOf("function sanitizeArabyaDbForTeacherLogin_")
  );
  assert.ok(clientSanitize.includes("delete safe.integrationConfig.googleFormUrl"));

  const teacherLoginSanitize = gasSource.slice(
    gasSource.indexOf("function sanitizeArabyaDbForTeacherLogin_"),
    gasSource.indexOf("function slimArabyaResultForExamStart_")
  );
  assert.ok(teacherLoginSanitize.includes("delete safe.integrationConfig.googleFormUrl"));
});

test("privacy: health report does not expose raw sync URL", () => {
  assert.ok(appSource.includes("syncUrlConfigured"));
  assert.ok(!appSource.includes("رابط المزامنة: ${r.syncUrl"));
});

test("privacy: legacy s= param is stripped from browser URL", () => {
  assert.ok(appSource.includes("function stripSensitiveUrlParamsFromBrowser"));
  assert.ok(appSource.includes('url.searchParams.delete(param)'));
});

console.log("Sync URL privacy tests passed.");
