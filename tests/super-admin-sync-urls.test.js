/**
 * Super admin must collect sync URLs from every registered teacher database.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(appSource.includes("function collectRegisteredTeacherIntegrationUrls()"));
assert.ok(appSource.includes("if (isSuperAdminTeacher())"));
assert.ok(appSource.includes("collectRegisteredTeacherIntegrationUrls().forEach(url => urls.add(url))"));
assert.ok(appSource.includes("mergeAll: isSuperAdminTeacher() && urls.length > 1"));
assert.ok(appSource.includes("window.collectRegisteredTeacherIntegrationUrls = collectRegisteredTeacherIntegrationUrls"));

console.log("super-admin-sync-urls.test.js: all assertions passed");
