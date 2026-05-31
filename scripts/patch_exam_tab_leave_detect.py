#!/usr/bin/env python3
"""Detect tab/browser leave reliably; short click grace only on answer cards."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")

OLD_BLOCK = """function clearExamHiddenTabTimer() {
  if (systemState.examHiddenTabTimer) {
    clearTimeout(systemState.examHiddenTabTimer);
    systemState.examHiddenTabTimer = null;
  }
}

function markExamInteractionGrace() {
  systemState.examInteractionGraceUntil = Date.now() + 2200;
  clearExamHiddenTabTimer();
  hideExamSecurityShield();
}

function scheduleExamHiddenTabViolation(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
  if (!document.hidden) {
    clearExamHiddenTabTimer();
    hideExamSecurityShield();
    return;
  }
  showExamSecurityShield("تم إخفاء الامتحان — ارجع فوراً إلى تبويب ARABYA.NET.");
  clearExamHiddenTabTimer();
  const delayMs = getExamDeviceCategory() === "mobile" ? 1800 : 1400;
  systemState.examHiddenTabTimer = setTimeout(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!document.hidden) return;
    recordAntiCheatViolation(reason);
  }, delayMs);
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  if (systemState.examInteractionGraceUntil && Date.now() < systemState.examInteractionGraceUntil) {
    return false;
  }
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  const visibilityReasons = new Set(["visibility", "visibility-watchdog", "pagehide", "freeze"]);
  if (visibilityReasons.has(reason) && !document.hidden) return false;
  return true;
}"""

NEW_BLOCK = """function clearExamHiddenTabTimer() {
  if (systemState.examHiddenTabTimer) {
    clearTimeout(systemState.examHiddenTabTimer);
    systemState.examHiddenTabTimer = null;
  }
}

function markExamClickGrace() {
  systemState.examClickGraceUntil = Date.now() + 450;
}

function isInExamClickGrace() {
  return !!(systemState.examClickGraceUntil && Date.now() < systemState.examClickGraceUntil);
}

function getExamTabHiddenMinMs() {
  return getExamDeviceCategory() === "mobile" ? 180 : 120;
}

function handleExamTabVisibilityChange(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return;

  if (!document.hidden) {
    clearExamHiddenTabTimer();
    const hiddenAt = systemState.examTabHiddenAt;
    systemState.examTabHiddenAt = null;
    if (hiddenAt) {
      const awayMs = Date.now() - hiddenAt;
      hideExamSecurityShield();
      if (!isInExamClickGrace() && awayMs >= getExamTabHiddenMinMs()) {
        recordAntiCheatViolation(reason || "visibility");
      }
    } else {
      hideExamSecurityShield();
    }
    return;
  }

  if (!systemState.examTabHiddenAt) {
    systemState.examTabHiddenAt = Date.now();
  }
  showExamSecurityShield("تم إخفاء تبويب الامتحان — العودة فوراً! مغادرة المتصفح أو التبويب تُسجَّل كمحاولة غش.");

  clearExamHiddenTabTimer();
  const delayMs = getExamDeviceCategory() === "mobile" ? 650 : 500;
  systemState.examHiddenTabTimer = setTimeout(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!document.hidden) return;
    if (isInExamClickGrace()) return;
    recordAntiCheatViolation(reason || "visibility");
  }, delayMs);
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  if (isInExamClickGrace()) {
    const visibilityReasons = new Set(["visibility", "visibility-watchdog", "pagehide", "freeze", "blur"]);
    if (visibilityReasons.has(reason)) return false;
  }
  const visibilityReasons = new Set(["visibility", "visibility-watchdog", "pagehide", "freeze"]);
  if (visibilityReasons.has(reason) && !document.hidden && reason !== "pagehide") return false;
  return true;
}"""

OLD_WATCHDOG = """function startExamSecurityWatchdog() {
  stopExamSecurityWatchdog();
  systemState.examSecurityWatchInterval = setInterval(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    scheduleExamHiddenTabViolation("visibility-watchdog");
  }, 1000);
}"""

NEW_WATCHDOG = """function startExamSecurityWatchdog() {
  stopExamSecurityWatchdog();
  systemState.examSecurityWatchInterval = setInterval(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!document.hidden) return;
    if (!systemState.examTabHiddenAt) {
      systemState.examTabHiddenAt = Date.now();
      showExamSecurityShield("تم إخفاء تبويب الامتحان — العودة فوراً! مغادرة المتصفح أو التبويب تُسجَّل كمحاولة غش.");
      return;
    }
    const awayMs = Date.now() - systemState.examTabHiddenAt;
    const threshold = getExamDeviceCategory() === "mobile" ? 900 : 700;
    if (awayMs >= threshold && !isInExamClickGrace()) {
      recordAntiCheatViolation("visibility-watchdog");
    }
  }, 450);
}"""

OLD_HANDLERS_VIS = """  window.addEventListener("pagehide", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    scheduleExamHiddenTabViolation("pagehide");
  });

  document.addEventListener("visibilitychange", () => {
    if (!systemState.isExamActive) return;
    scheduleExamHiddenTabViolation("visibility");
  });

  document.addEventListener("freeze", () => {
    if (!systemState.isExamActive) return;
    scheduleExamHiddenTabViolation("freeze");
  });"""

NEW_HANDLERS_VIS = """  window.addEventListener("pagehide", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (isInExamClickGrace()) return;
    recordAntiCheatViolation("pagehide");
  });

  document.addEventListener("visibilitychange", () => {
    if (!systemState.isExamActive) return;
    handleExamTabVisibilityChange("visibility");
  });

  document.addEventListener("freeze", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!systemState.examTabHiddenAt) systemState.examTabHiddenAt = Date.now();
    handleExamTabVisibilityChange("freeze");
  });

  window.addEventListener("blur", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    setTimeout(() => {
      if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
      if (isInExamClickGrace()) return;
      if (document.hidden) return;
      if (!document.hasFocus()) {
        recordAntiCheatViolation("blur");
      }
    }, 400);
  });"""

REPLACEMENTS = [
    (OLD_BLOCK, NEW_BLOCK, "core block"),
    (OLD_WATCHDOG, NEW_WATCHDOG, "watchdog"),
    (OLD_HANDLERS_VIS, NEW_HANDLERS_VIS, "handlers"),
    ("      markExamInteractionGrace();\n      systemState.studentAnswers[question.id] = e.target.value;",
     "      systemState.studentAnswers[question.id] = e.target.value;", "textarea"),
    ("function selectRunnerOption(index) {\n  markExamInteractionGrace();\n  const currentQ",
     "function selectRunnerOption(index) {\n  const currentQ", "select"),
    ("function runnerNextQuestion(isAuto = false) {\n  if (!isAuto) markExamInteractionGrace();\n  const currentQ",
     "function runnerNextQuestion(isAuto = false) {\n  const currentQ", "next"),
    ('      card.addEventListener("click", () => selectRunnerOption(idx));',
     '      card.addEventListener("pointerdown", () => markExamClickGrace());\n      card.addEventListener("click", () => selectRunnerOption(idx));',
     "card pointerdown"),
]

for old, new, label in REPLACEMENTS:
    if old not in text:
        raise SystemExit(f"Missing: {label}")
    text = text.replace(old, new, 1)

if "markExamInteractionGrace" in text:
    raise SystemExit("markExamInteractionGrace still referenced")

APP.write_text(text, encoding="utf-8")
print("OK", APP)
