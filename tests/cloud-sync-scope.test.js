/**
 * Unified teacher cloud sync (option 2): one Web App URL per account.
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

function resolveCloudBackupTargetUrls(scope, generalUrls, allUrls) {
  const general = [...new Set((generalUrls || []).map(u => normalizeArabyaWebAppUrl(u)).filter(Boolean))];
  const all = [...new Set((allUrls || []).map(u => normalizeArabyaWebAppUrl(u)).filter(Boolean))];
  if (scope === ARABYA_CLOUD_BACKUP_SCOPE_ALL) return all.length ? all : general;
  return general.length ? general : all;
}

const teacherUrl = "https://script.google.com/macros/s/TEACHER/exec";
const legacyExamUrl = "https://script.google.com/macros/s/EXAM/exec";

assert.deepStrictEqual(
  resolveCloudBackupTargetUrls(ARABYA_CLOUD_BACKUP_SCOPE_GENERAL, [teacherUrl], [teacherUrl, legacyExamUrl]),
  [teacherUrl],
  "unified backup uses teacher URL only"
);

assert.deepStrictEqual(
  resolveCloudBackupTargetUrls(ARABYA_CLOUD_BACKUP_SCOPE_GENERAL, [teacherUrl], [teacherUrl, legacyExamUrl]),
  [teacherUrl]
);

function pickSyncUrlsForUnifiedModel(generalUrls, examUrls) {
  return [...new Set((generalUrls || []).map(normalizeArabyaWebAppUrl).filter(Boolean))];
}

assert.deepStrictEqual(
  pickSyncUrlsForUnifiedModel([teacherUrl], [legacyExamUrl]),
  [teacherUrl],
  "exam-specific URLs are ignored in unified model"
);

console.log("Unified cloud sync tests passed.");
