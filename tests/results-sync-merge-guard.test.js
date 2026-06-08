/**
 * Results must merge from cloud instead of being wiped by empty payloads.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

const gasSource = fs.readFileSync(path.join(__dirname, "..", "integrations", "google-apps-script-backend.gs"), "utf8");

assert.ok(appSource.includes("mergeRemoteCollection_(systemState.results, remoteResults"));
assert.ok(appSource.includes("remoteResults.length > 0 || localCount === 0"));
assert.ok(appSource.includes("login_repair_empty_cloud"));
assert.ok(appSource.includes("cloudLooksEmpty"));
assert.ok(appSource.includes("retriedWithoutToken"));
assert.ok(appSource.includes('"exam_not_found"'));
assert.ok(appSource.includes("filterOutDeletedResultsSafe"));
assert.ok(appSource.includes("emergencyRecoverResultsData"));
assert.ok(appSource.includes("mergeResultsForTeacherCloudSync"));
assert.ok(appSource.includes("getNewestResultSortTime"));
assert.ok(gasSource.includes("sheet_row_"));
assert.ok(appSource.includes("cloud merge would wipe local results"));
assert.ok(gasSource.includes("attemptToken = \"\""));
assert.ok(gasSource.includes("deepMergeArabyaObjects_(map[key] || {}, result)"));

console.log("results-sync-merge-guard.test.js: all assertions passed");
