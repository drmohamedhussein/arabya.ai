import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../js/arabya-security.js", import.meta.url), "utf8");
const cloudSyncSource = readFileSync(new URL("../js/arabya-cloud-sync.js", import.meta.url), "utf8");
const questionsSource = readFileSync(new URL("../questions.js", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("../database/arabya-db.json", import.meta.url), "utf8");

test("phase3: syncActiveTeacherCredentials does not force password = autoEntryCode", () => {
  const block = appSource.slice(
    appSource.indexOf("function syncActiveTeacherCredentials"),
    appSource.indexOf("function getTeachersForLocalStorage")
  );
  assert.ok(!block.includes("systemState.activeTeacher.password ="));
  assert.ok(!block.includes("teacherCode: code"));
  assert.ok(block.includes("autoEntryCode: autoCode"));
});

test("phase3: teacher login uses separate password and quick-code matchers", () => {
  assert.ok(appSource.includes("async function teacherPasswordMatches"));
  assert.ok(appSource.includes("async function teacherAutoEntryCodeMatches"));
  assert.ok(appSource.includes("findTeachersMatchingPassword"));
  assert.ok(appSource.includes("findTeachersMatchingQuickCode"));
  assert.ok(appSource.includes("viaQuickCode: true"));
});

test("phase3: saveTeacherProfile does not overwrite password with auto code", () => {
  const block = appSource.slice(
    appSource.indexOf("async function saveTeacherProfile"),
    appSource.indexOf("async function saveTeacherIntegrationConfig")
  );
  assert.ok(!block.includes("systemState.activeTeacher.password = autoCode"));
  assert.ok(!block.includes("ensureTeacherPasswordHashed(systemState.activeTeacher, autoCode)"));
});

test("phase3: security module strips plain password after hash", () => {
  assert.ok(securitySource.includes("function stripTeacherPlainPassword"));
  assert.ok(securitySource.includes("function sanitizeTeacherForLocalStorage"));
  assert.ok(securitySource.includes("teacherPasswordMatches"));
  assert.ok(securitySource.includes("teacherAutoEntryCodeMatches"));
  const exportBlock = securitySource.slice(
    securitySource.indexOf("function sanitizeTeacherForExport"),
    securitySource.indexOf("function sanitizeTeacherForCloud")
  );
  assert.ok(exportBlock.includes("delete copy.passwordHash"));
  assert.ok(exportBlock.includes("delete copy.loginTokens"));
  const cloudBlock = securitySource.slice(
    securitySource.indexOf("function sanitizeTeacherForCloud"),
    securitySource.indexOf("global.ArabyaSecurity")
  );
  assert.ok(cloudBlock.includes("delete copy.password"));
  assert.ok(cloudBlock.includes("delete copy.loginTokens"));
});

test("phase3: cloud sync delegates to security sanitizer", () => {
  assert.ok(cloudSyncSource.includes("global.ArabyaSecurity.sanitizeTeacherForCloud"));
});

test("phase3: questions.js has single unified student code normalizer", () => {
  const matches = questionsSource.match(/function normalizeArabyaStudentCode/g) || [];
  assert.equal(matches.length, 1);
  assert.ok(questionsSource.includes("sanitizeStudentCodeInput"));
});

test("phase3: database seed has no TEACHER2026 or exposed GAS exec URL", () => {
  const db = JSON.parse(dbSource);
  assert.equal(db.schemaVersion, 2);
  assert.ok(!dbSource.includes("TEACHER2026"));
  assert.ok(!dbSource.includes("/macros/s/"));
  assert.ok(!dbSource.includes("test-agent-001"));
});

test("phase3: local storage save sanitizes teacher passwords", () => {
  assert.ok(appSource.includes("function getTeachersForLocalStorage"));
  assert.ok(appSource.includes("function migrateAllTeacherPasswordsToHash"));
  assert.ok(appSource.includes("migrateAllTeacherPasswordsToHash()"));
});

console.log("Phase 3 security guard tests passed.");
