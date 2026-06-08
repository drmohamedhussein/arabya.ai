/**
 * Cloud backup must scope exam-settings saves and never wipe results on merge.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const gasSource = fs.readFileSync(path.join(__dirname, "..", "integrations", "google-apps-script-backend.gs"), "utf8");

assert.ok(appSource.includes("CLOUD_BACKUP_EXAM_SETTINGS_REASONS"));
assert.ok(appSource.includes("buildExamSettingsCloudBackupData"));
assert.ok(appSource.includes("pruneEmptyCloudBackupCollections"));
assert.ok(appSource.includes('"save_exam_meta"'));

const fnStart = appSource.indexOf("function buildExamSettingsCloudBackupData");
const fnEnd = appSource.indexOf("function slimCloudBackupResultForUpload");
const block = appSource.slice(fnStart, fnEnd);
const vm = require("vm");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(block, sandbox);

const scoped = sandbox.buildExamSettingsCloudBackupData({
  schemaVersion: 2,
  exams: [{ id: "e1", questions: [{ id: 1 }] }],
  results: [{ recordId: "r1", score: "10/10" }],
  questionBanks: { teacher1: [{ id: 1 }] }
});
assert.ok(Array.isArray(scoped.exams));
assert.strictEqual(scoped.results, undefined);
assert.strictEqual(scoped.questionBanks, undefined);

assert.ok(gasSource.includes('reason === "save_backup" && (collection === "students" || collection === "results")'));
assert.ok(gasSource.includes("mergeArabyaCollection_(db[collection] || [], patch[collection], collection)"));
assert.ok(gasSource.includes("function hydrateArabyaDatabaseFromSheet_(db)"));

console.log("cloud-backup-size-guard.test.js: all assertions passed");
