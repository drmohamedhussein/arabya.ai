/**
 * Ask-mode conflict merge must keep local until user confirms.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const syncSource = fs.readFileSync(path.join(__dirname, "..", "js", "arabya-platform-sync.js"), "utf8");

assert.ok(
  syncSource.includes("map[key] = { ...local };") &&
    syncSource.includes('if (mode === "ask")'),
  "ask mode should preserve local copy before user choice"
);
assert.ok(
  syncSource.includes("} else {\n        map[c.key] = { ...c.local };"),
  "cancel must restore local record explicitly"
);

console.log("Phase 5 sync conflict guard tests passed.");
