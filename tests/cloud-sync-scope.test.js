/**
 * Per-exam result sync URL vs cloud backup scope targets.
 */
const assert = require("assert");

const ARABYA_CLOUD_BACKUP_SCOPE_GENERAL = "general";
const ARABYA_CLOUD_BACKUP_SCOPE_ALL = "all";

function normalizeArabyaWebAppUrl(rawUrl) {
  let url = String(rawUrl || "").trim();
  if (!url) return "";
  if (url.endsWith("/dev")) url = url.slice(0, -3) + "exec";
  return url;
}

function isValidCloudSyncUrl(url) {
  const clean = (url || "").trim();
  return !!(clean && (clean.includes("/macros/s/") || clean.endsWith("/exec")));
}

function resolveCloudBackupTargetUrls(scope, generalUrls, allUrls) {
  const general = [...new Set((generalUrls || []).map(u => normalizeArabyaWebAppUrl(u)).filter(Boolean))];
  const all = [...new Set((allUrls || []).map(u => normalizeArabyaWebAppUrl(u)).filter(Boolean))];
  if (scope === ARABYA_CLOUD_BACKUP_SCOPE_ALL) return all.length ? all : general;
  return general.length ? general : all;
}

const generalOnly = ["https://script.google.com/macros/s/AAA/exec"];
const examUrl = "https://script.google.com/macros/s/BBB/exec";
const allUrls = [...generalOnly, examUrl];

assert.deepStrictEqual(
  resolveCloudBackupTargetUrls(ARABYA_CLOUD_BACKUP_SCOPE_GENERAL, generalOnly, allUrls),
  generalOnly
);

assert.deepStrictEqual(
  resolveCloudBackupTargetUrls(ARABYA_CLOUD_BACKUP_SCOPE_ALL, generalOnly, allUrls),
  allUrls
);

assert.deepStrictEqual(
  resolveCloudBackupTargetUrls(ARABYA_CLOUD_BACKUP_SCOPE_GENERAL, [], allUrls),
  allUrls,
  "falls back to all when general empty"
);

assert.ok(isValidCloudSyncUrl("https://script.google.com/macros/s/x/exec"));
assert.ok(!isValidCloudSyncUrl("https://docs.google.com/forms/"));

console.log("Cloud sync scope tests passed.");
