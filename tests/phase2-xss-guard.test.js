import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const platformSyncSource = readFileSync(new URL("../js/arabya-platform-sync.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("phase2: renderExamsList escapes exam title", () => {
  const block = appSource.slice(
    appSource.indexOf("function renderExamsList"),
    appSource.indexOf("function readNewExamTotalScore")
  );
  assert.ok(block.includes("escapeHtml(exam.title"));
  assert.ok(!block.includes("onclick=\"editExamQuestions('${exam.id}')\""));
  assert.ok(block.includes("bindExamCardActions(card, exam, examUrl)"));
});

test("phase2: runner exam title uses escapeHtml", () => {
  const block = appSource.slice(
    appSource.indexOf('document.getElementById("runner-exam-title")'),
    appSource.indexOf('document.getElementById("runner-exam-title")') + 500
  );
  assert.ok(block.includes("escapeHtml(exam.title"));
});

test("phase2: escapeAttr helper exists", () => {
  assert.ok(appSource.includes("function escapeAttr(value)"));
});

test("phase2: platform sync escapes cloud meta detail", () => {
  assert.ok(platformSyncSource.includes("escapeHtml(meta.detail)"));
  assert.ok(platformSyncSource.includes("escapeHtml(meta.cloudRevision"));
});

test("phase2: super admin password field is type password", () => {
  const match = indexHtml.match(/<input[^>]*id="super-admin-teacher-password"[^>]*>/);
  assert.ok(match);
  assert.ok(/type="password"/.test(match[0]));
});

test("phase2: external links use noopener", () => {
  const blankLinks = indexHtml.match(/target="_blank"/g) || [];
  const noopenerLinks = indexHtml.match(/rel="noopener noreferrer"/g) || [];
  assert.ok(blankLinks.length > 0);
  assert.equal(blankLinks.length, noopenerLinks.length);
});

console.log("Phase 2 XSS guard tests passed.");
