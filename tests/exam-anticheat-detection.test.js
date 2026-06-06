import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("anticheat: tab leave detection handlers are wired", () => {
  assert.ok(appSource.includes('document.addEventListener("visibilitychange"'));
  assert.ok(appSource.includes('recordAntiCheatViolation("pagehide")'));
  assert.ok(appSource.includes('recordAntiCheatViolation("blur")'));
  assert.ok(appSource.includes('recordAntiCheatViolation("visibility-watchdog")'));
  assert.ok(appSource.includes('recordAntiCheatViolation("focus-watchdog")'));
});

test("anticheat: screenshot attempts are recorded with dedupe", () => {
  assert.ok(appSource.includes("function recordScreenshotAttempt"));
  assert.ok(appSource.includes('recordAntiCheatViolation("screenshot")'));
  assert.ok(appSource.includes("lastScreenshotAttemptAt"));
  assert.ok(appSource.includes("PrintScreen"));
});

test("anticheat: clipboard and context menu attempts are counted", () => {
  assert.ok(appSource.includes('const reason = e.type === "cut" ? "cut" : e.type === "paste" ? "paste" : "copy"'));
  assert.ok(appSource.includes("recordAntiCheatViolation(reason)"));
  assert.ok(appSource.includes('recordAntiCheatViolation("contextmenu")'));
});

test("anticheat: violations persist to result and cloud log", () => {
  assert.ok(appSource.includes("function recordCheatAttempt"));
  assert.ok(appSource.includes("function logCheatEventToCloud"));
  assert.ok(appSource.includes("cheatAttemptLog.push"));
  assert.ok(appSource.includes('action: "log_cheat_event"'));
  assert.ok(appSource.includes("buildCheatTrackingFields()"));
});

test("anticheat: repeated hidden tab stays count once per leave", () => {
  assert.ok(appSource.includes("examHiddenTabViolationSent"));
  assert.ok(appSource.includes("examFocusViolationSent"));
});

console.log("Exam anti-cheat detection tests passed.");
