import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("phase1: no public first-run admin credential alert", () => {
  assert.ok(!appSource.includes("_pendingFirstRunCredentials"));
  assert.ok(!appSource.includes("تم إنشاء حساب مدير المنصة لأول مرة"));
});

test("phase1: no auto platform_admin seed on empty teachers", () => {
  const initBlock = appSource.slice(
    appSource.indexOf("function initDatabase"),
    appSource.indexOf("function initDatabase") + 2200
  );
  assert.ok(!initBlock.includes("_pendingFirstRunCredentials"));
  assert.ok(!initBlock.includes("systemState.teachers.push(normalizeTeacherAccount(defaultTeacher))"));
});

console.log("Phase 1 no public admin leak tests passed.");
