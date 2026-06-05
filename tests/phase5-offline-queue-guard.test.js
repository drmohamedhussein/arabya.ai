/**
 * Offline queue responses must not count as cloud sync success.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(appSource.includes("function isArabyaCloudPostQueued"), "queued response helper required");
assert.ok(
  appSource.includes('response.status === "queued"'),
  "must detect queued status from postToArabyaWebApp"
);
assert.ok(
  appSource.includes("queued: true"),
  "postSaveBackupToCloudUrl must return queued flag"
);
assert.ok(
  appSource.includes("سيُرفع عند عودة الشبكة"),
  "pushCloudBackupNow must show offline queue message"
);

console.log("Phase 5 offline queue guard tests passed.");
