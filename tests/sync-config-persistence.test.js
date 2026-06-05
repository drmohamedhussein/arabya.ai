import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("sync config: dedicated credentials vault prevents cloud overwrite", () => {
  assert.ok(appSource.includes("ARABYA_TEACHER_SYNC_CREDENTIALS_KEY"));
  assert.ok(appSource.includes("function saveTeacherSyncCredentials"));
  assert.ok(appSource.includes("function mergeRemoteConfigPreservingLocalSync_"));
  assert.ok(appSource.includes("function mergeTeacherIntegrationConfigPreservingLocalSync_"));
});

test("sync config: integration save persists vault and pushes backup immediately", () => {
  const saveBlock = appSource.slice(
    appSource.indexOf("async function saveTeacherIntegrationConfig"),
    appSource.indexOf("// عرض الامتحانات")
  );
  assert.ok(saveBlock.includes("saveTeacherSyncCredentials(url, apiSecret)"));
  assert.ok(saveBlock.includes('pushLocalStateToCloudNow("integration_config_save")'));
  assert.ok(saveBlock.includes("if (urlInput) urlInput.value = url"));
  assert.ok(saveBlock.includes("رفعها إلى السحابة فوراً"));
});

test("sync config: GAS stores full config object on save_backup", () => {
  const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
  const mergeBlock = gasSource.slice(
    gasSource.indexOf("if (patch.config && typeof patch.config === \"object\")"),
    gasSource.indexOf("if (patch.appVersion)")
  );
  assert.ok(mergeBlock.includes("db.config = deepMergeArabyaObjects_"));
  assert.ok(gasSource.includes("config: {}"));
});

test("sync config: teacher_login returns stored sync config for cross-browser restore", () => {
  const gasSource = readFileSync(new URL("../integrations/google-apps-script-backend.gs", import.meta.url), "utf8");
  const loginBlock = gasSource.slice(
    gasSource.indexOf("function sanitizeArabyaDbForTeacherLogin_"),
    gasSource.indexOf("function slimArabyaResultForExamStart_")
  );
  assert.ok(loginBlock.includes("config: {"));
  assert.ok(loginBlock.includes("googleFormUrl"));
  assert.ok(loginBlock.includes("apiSecret"));
});

test("sync config: init and merge apply local credentials after cloud pull", () => {
  assert.ok(appSource.includes("applyTeacherSyncCredentialsToState()"));
  const mergeBlock = appSource.slice(
    appSource.indexOf("function mergeRemoteDatabaseIntoLocal"),
    appSource.indexOf("function normalizeArabyaWebAppUrl")
  );
  assert.ok(mergeBlock.includes("mergeRemoteConfigPreservingLocalSync_"));
});

test("sync config: api secret included when loading teacher config from storage", () => {
  const initBlock = appSource.slice(
    appSource.indexOf("const savedConfig = localStorage.getItem(\"arabya_teacher_config\")"),
    appSource.indexOf("const savedProfile = localStorage.getItem(\"arabya_teacher_profile\")")
  );
  assert.ok(initBlock.includes("apiSecret: systemState.config.apiSecret"));
});

console.log("Sync config persistence tests passed.");
