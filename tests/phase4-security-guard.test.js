import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../js/arabya-security.js", import.meta.url), "utf8");
const cloudSyncSource = readFileSync(new URL("../js/arabya-cloud-sync.js", import.meta.url), "utf8");
const platformSyncSource = readFileSync(new URL("../js/arabya-platform-sync.js", import.meta.url), "utf8");
const offlineQueueSource = readFileSync(new URL("../js/arabya-offline-queue.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("phase4: GAS protects get_backup and POST with API secret", () => {
  assert.ok(gasSource.includes("ARABYA_API_SECRET"));
  assert.ok(gasSource.includes("function isArabyaApiAuthorized_"));
  assert.ok(gasSource.includes('code: "unauthorized"'));
  assert.ok(gasSource.includes("sanitizeArabyaDbForClient_"));
  const doGetBlock = gasSource.slice(gasSource.indexOf("function doGet"), gasSource.indexOf("function parseArabyaPayload_"));
  assert.ok(doGetBlock.includes('action === "get_backup"'));
  assert.ok(doGetBlock.includes("isArabyaGetBackupAuthorized_(e, scope)"));
  const doPostBlock = gasSource.slice(gasSource.indexOf("function doPost"), gasSource.indexOf("function doGet"));
  assert.ok(doPostBlock.includes("isArabyaPostActionAuthorized_(action, e, data)"));
  assert.ok(gasSource.includes("function isArabyaPostActionAuthorized_"));
});

test("phase4: client has API secret helpers wired to cloud calls", () => {
  assert.ok(appSource.includes("function getArabyaApiSecret"));
  assert.ok(appSource.includes("function withArabyaApiSecret"));
  assert.ok(appSource.includes("function buildArabyaCloudActionUrl"));
  assert.ok(appSource.includes('buildArabyaCloudActionUrl(rawUrl, "get_backup"'));
  assert.ok(appSource.includes('buildArabyaCloudActionUrl(rawUrl, "get_sync_meta")'));
  assert.ok(appSource.includes("withArabyaApiSecret(payload)"));
  assert.ok(appSource.includes('parsed.code === "unauthorized"'));
});

test("phase4: cloud sync modules use buildArabyaCloudActionUrl", () => {
  assert.ok(cloudSyncSource.includes("buildArabyaCloudActionUrl"));
  assert.ok(platformSyncSource.includes("buildArabyaCloudActionUrl"));
});

test("phase4: offline queue re-injects API secret on flush", () => {
  assert.ok(offlineQueueSource.includes("withArabyaApiSecret"));
});

test("phase4: api secret stripped from cloud teacher export", () => {
  assert.ok(securitySource.includes("delete copy.integrationConfig.apiSecret"));
});

test("phase4: teacher integration UI has api secret field", () => {
  assert.ok(indexHtml.includes('id="teacher-config-api-secret"'));
  const inputMatch = indexHtml.match(/<input[^>]*id="teacher-config-api-secret"[^>]*>/);
  assert.ok(inputMatch);
  assert.ok(/type="password"/.test(inputMatch[0]));
  assert.ok(indexHtml.includes("ARABYA_API_SECRET"));
});

test("phase4: saveTeacherIntegrationConfig allows saving without password when hashed", () => {
  const block = appSource.slice(
    appSource.indexOf("async function saveTeacherIntegrationConfig"),
    appSource.indexOf("// عرض الامتحانات")
  );
  assert.ok(block.includes("teacher-config-api-secret"));
  assert.ok(block.includes("!systemState.activeTeacher.passwordHash"));
  assert.ok(block.includes("if (code && window.ArabyaSecurity)"));
});

console.log("Phase 4 security guard tests passed.");
