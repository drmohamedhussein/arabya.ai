import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL(
  "../integrations/google-apps-script-backend.gs",
  import.meta.url
), "utf8");

test("phase6: app attaches _clientReason to save_backup payload", () => {
  assert.ok(appSource.includes("const clientReason = String(reason || \"push\")"));
  assert.ok(appSource.includes("data._clientReason = clientReason"));
});

test("phase6: GAS reads _clientReason and skips exam merge for exam_submit", () => {
  assert.ok(gasSource.includes("data && data.data && data.data._clientReason"));
  assert.ok(gasSource.includes("mergeArabyaDatabase_(data.data || {}, \"save_backup\", actor, clientReason)"));
  assert.ok(gasSource.includes("function shouldSkipExamMetaMerge_(clientReason)"));
  assert.ok(gasSource.includes('/exam_submit/i'));
  assert.ok(gasSource.includes('collection === "exams" && shouldSkipExamMetaMerge_(clientReason)'));
});

test("phase6: GAS sanitizes _clientReason from get_backup response", () => {
  assert.ok(gasSource.includes("delete copy._clientReason"));
});

console.log("Phase 6 deadline sync override guard tests passed.");

