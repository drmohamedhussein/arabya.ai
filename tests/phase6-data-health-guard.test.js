/**
 * Data health report UI and diagnostics.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.ok(appSource.includes("function buildArabyaDataHealthReport"), "health report builder required");
assert.ok(appSource.includes("window.showArabyaDataHealthReport"), "health report UI hook required");
assert.ok(appSource.includes("TEACHER2026"), "must warn on legacy TEACHER2026 in local data");
assert.ok(indexHtml.includes("showArabyaDataHealthReport"), "index must wire health check button");

console.log("Phase 6 data health guard tests passed.");
