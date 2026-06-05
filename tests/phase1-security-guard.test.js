import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("phase1: no hardcoded TEACHER2026 super-admin seed set", () => {
  assert.ok(!appSource.includes('ARABYA_SUPER_ADMIN_SEEDS = new Set(["TEACHER2026"])'));
  assert.ok(!appSource.includes('username: "TEACHER2026"'));
});

test("phase1: no eval in Google Form import path", () => {
  const parseBlock = appSource.slice(
    appSource.indexOf("function parseGoogleFormHTML"),
    appSource.indexOf("function parseGoogleFormHTML") + 2500
  );
  assert.ok(!parseBlock.includes("eval("));
});

test("phase1: one-time login token params present", () => {
  assert.ok(appSource.includes('TEACHER_LOGIN_TOKEN_PARAM_ID = "tlt"'));
  assert.ok(appSource.includes("teacherMustChangePassword"));
  assert.ok(appSource.includes("verifyTeacherSessionToken"));
});

console.log("Phase 1 security guard tests passed.");
