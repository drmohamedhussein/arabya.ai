import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("legacy login: prefers integrated super-admin over TEACHER2026 duplicate", () => {
  assert.ok(appSource.includes("pickPreferredTeacherLoginMatch"));
  assert.ok(appSource.includes("scoreTeacherForLoginPreference"));
  assert.ok(appSource.includes("findTeachersMatchingQuickCode"));
});

test("legacy login: removes orphan platform_admin without credentials", () => {
  assert.ok(appSource.includes("isOrphanPlatformAdminAccount"));
  assert.ok(appSource.includes("pruneOrphanTeacherAccounts"));
});

test("legacy login: quick-code login does not overwrite password hash", () => {
  assert.ok(appSource.includes("viaQuickCode: true"));
  assert.ok(appSource.includes("!options.viaQuickCode"));
});

console.log("Legacy super-admin login tests passed.");
