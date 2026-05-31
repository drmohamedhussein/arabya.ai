#!/usr/bin/env python3
"""Stronger anti-cheat: no fullscreen exit-on-start, interaction grace, delayed tab-hidden."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")

INSERT_AFTER_SHIELD = """function hideExamSecurityShield() {
  const shield = document.getElementById("runner-security-shield");
  if (shield) shield.classList.add("hidden");
}

function clearExamHiddenTabTimer() {
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

"""

OLD_HIDE = """function hideExamSecurityShield() {
  const shield = document.getElementById("runner-security-shield");
  if (shield) shield.classList.add("hidden");
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  return true;
}"""

NEW_SHOULD = """function shouldTriggerFocusAntiCheat(reason) {
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

if "function markExamInteractionGrace" not in text:
    if OLD_HIDE not in text:
        raise SystemExit("hideExamSecurityShield block not found")
    text = text.replace(OLD_HIDE, INSERT_AFTER_SHIELD + NEW_SHOULD, 1)
else:
    if OLD_HIDE.split("function shouldTrigger")[1] in text:
        text = text.replace(
            """function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  return true;
}""",
            NEW_SHOULD,
            1,
        )

OLD_WATCHDOG = """function startExamSecurityWatchdog() {
  stopExamSecurityWatchdog();
  systemState.examSecurityWatchInterval = setInterval(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (document.hidden) {
      showExamSecurityShield("تم رصد إخفاء تبويب الامتحان أو التبديل لتطبيق آخر.");
      recordAntiCheatViolation("visibility-watchdog");
    } else {
      hideExamSecurityShield();
    }
  }, 900);
}"""

NEW_WATCHDOG = """function startExamSecurityWatchdog() {
  stopExamSecurityWatchdog();
  systemState.examSecurityWatchInterval = setInterval(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    scheduleExamHiddenTabViolation("visibility-watchdog");
  }, 1000);
}"""

OLD_VIS = """  document.addEventListener("visibilitychange", () => {
    if (!systemState.isExamActive) return;
    if (document.hidden) {
      showExamSecurityShield("تم إخفاء الامتحان — ارجع فوراً إلى تبويب ARABYA.NET.");
      recordAntiCheatViolation("visibility");
    } else {
      hideExamSecurityShield();
    }
  });

  document.addEventListener("freeze", () => {
    recordAntiCheatViolation("freeze");
  });"""

NEW_VIS = """  document.addEventListener("visibilitychange", () => {
    if (!systemState.isExamActive) return;
    scheduleExamHiddenTabViolation("visibility");
  });

  document.addEventListener("freeze", () => {
    if (!systemState.isExamActive) return;
    scheduleExamHiddenTabViolation("freeze");
  });"""

OLD_PAGEHIDE = """  window.addEventListener("pagehide", () => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      recordAntiCheatViolation("pagehide");
    }
  });"""

NEW_PAGEHIDE = """  window.addEventListener("pagehide", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    scheduleExamHiddenTabViolation("pagehide");
  });"""

OLD_SECURE = """function requestSecureExamMode() {
  // لا نستخدم ملء الشاشة — غير متوافق مع كل الأجهزة؛ التأمين عبر التبويب والنسخ فقط.
}

function releaseSecureExamMode() {
  stopExamSecurityWatchdog();
  disableExamSecureMode();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}"""

NEW_SECURE = """function requestSecureExamMode() {
  clearExamHiddenTabTimer();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function releaseSecureExamMode() {
  clearExamHiddenTabTimer();
  stopExamSecurityWatchdog();
  disableExamSecureMode();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}"""

OLD_SELECT = """function selectRunnerOption(index) {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  systemState.studentAnswers[currentQ.id] = index;"""

NEW_SELECT = """function selectRunnerOption(index) {
  markExamInteractionGrace();
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  systemState.studentAnswers[currentQ.id] = index;"""

for old, new, label in [
    (OLD_WATCHDOG, NEW_WATCHDOG, "watchdog"),
    (OLD_VIS, NEW_VIS, "visibility"),
    (OLD_PAGEHIDE, NEW_PAGEHIDE, "pagehide"),
    (OLD_SECURE, NEW_SECURE, "secure"),
    (OLD_SELECT, NEW_SELECT, "select"),
]:
    if old not in text:
        raise SystemExit(f"Missing: {label}")
    text = text.replace(old, new, 1)

OLD_STOP = """function stopExamSecurityWatchdog() {
  if (systemState.examSecurityWatchInterval) {
    clearInterval(systemState.examSecurityWatchInterval);
    systemState.examSecurityWatchInterval = null;
  }
  disableExamSecureMode();
}"""

NEW_STOP = """function stopExamSecurityWatchdog() {
  clearExamHiddenTabTimer();
  if (systemState.examSecurityWatchInterval) {
    clearInterval(systemState.examSecurityWatchInterval);
    systemState.examSecurityWatchInterval = null;
  }
  disableExamSecureMode();
}"""

if OLD_STOP in text:
    text = text.replace(OLD_STOP, NEW_STOP, 1)

APP.write_text(text, encoding="utf-8")
print("Patched", APP)
