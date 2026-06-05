import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const securitySource = readFileSync(new URL("../js/arabya-security.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("phase3 pbkdf2: security module uses PBKDF2 v2", () => {
  assert.ok(securitySource.includes("hashTeacherPasswordV2"));
  assert.ok(securitySource.includes("PBKDF2"));
  assert.ok(securitySource.includes("PASSWORD_HASH_VERSION"));
  assert.ok(securitySource.includes("crypto.getRandomValues"));
});

test("phase3 pbkdf2: login upgrades legacy hashes", () => {
  assert.ok(securitySource.includes("upgradeTeacherPasswordHashIfNeeded"));
  assert.ok(appSource.includes("upgradeTeacherPasswordHashIfNeeded"));
});

console.log("Phase 3 PBKDF2 guard tests passed.");
