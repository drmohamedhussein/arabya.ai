/**
 * Results must merge from cloud instead of being wiped by empty payloads.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(appSource.includes("mergeRemoteCollection_(systemState.results, remoteResults"));
assert.ok(appSource.includes("remoteResults.length > 0 || localCount === 0"));
assert.ok(appSource.includes("login_repair_empty_cloud"));
assert.ok(appSource.includes("cloudLooksEmpty"));

console.log("results-sync-merge-guard.test.js: all assertions passed");
