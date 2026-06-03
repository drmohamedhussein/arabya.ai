#!/usr/bin/env python3
"""Fix false cheat triggers, right-click only, copy without cheat penalty, no fullscreen."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")

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
    if (!document.hasFocus()) {
      recordAntiCheatViolation("focus-watchdog");
    }
  }, 450);
}"""

NEW_WATCHDOG = """function startExamSecurityWatchdog() {
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

OLD_HANDLERS = """function setupAntiCheatHandlers() {
  window.addEventListener("beforeunload", e => {
    if (systemState.isExamActive) {
      saveActiveStudentSession();
      updateLiveIncompleteResult();
      e.preventDefault();
      e.returnValue = "امتحانك نشط الآن. مغادرة الصفحة تُسجَّل كمخالفة أمنية.";
      return e.returnValue;
    }
  });

  window.addEventListener("pagehide", () => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      recordAntiCheatViolation("pagehide");
    }
  });

  window.addEventListener("blur", () => {
    recordAntiCheatViolation("blur");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      showExamSecurityShield("تم إخفاء الامتحان — ارجع فوراً إلى تبويب ARABYA.NET.");
      recordAntiCheatViolation("visibility");
    } else {
      hideExamSecurityShield();
    }
  });

  window.addEventListener("focusout", () => {
    recordAntiCheatViolation("blur");
  });

  document.addEventListener("freeze", () => {
    recordAntiCheatViolation("freeze");
  });

  document.addEventListener("contextmenu", e => {
    if (systemState.isExamActive) e.preventDefault();
  });

  document.addEventListener("copy", e => {
    if (!systemState.isExamActive) return;
    e.preventDefault();
    if (!systemState.isCheatingSuspended) recordAntiCheatViolation("copy");
  });

  document.addEventListener("cut", e => {
    if (!systemState.isExamActive) return;
    e.preventDefault();
    if (!systemState.isCheatingSuspended) recordAntiCheatViolation("cut");
  });

  document.addEventListener("paste", e => {
    if (!systemState.isExamActive) return;
    e.preventDefault();
    if (!systemState.isCheatingSuspended) recordAntiCheatViolation("paste");
  });

  document.addEventListener("selectstart", e => {
    if (systemState.isExamActive) e.preventDefault();
  });

  document.addEventListener("dragstart", e => {
    if (systemState.isExamActive) e.preventDefault();
  });

  document.addEventListener("keydown", e => {
    if (!systemState.isExamActive) return;
    const commandKey = e.ctrlKey || e.metaKey;
    if (
      e.key === "F12" ||
      (commandKey && e.shiftKey && /[icjcek]/i.test(e.key)) ||
      (commandKey && /[us]/i.test(e.key))
    ) {
      e.preventDefault();
      alert("حظر: غير مسموح بفتح أدوات المطور أو حفظ الصفحة أثناء الامتحان!");
      return false;
    }
    if (!systemState.isCheatingSuspended && commandKey && /[cvxa]/i.test(e.key)) {
      e.preventDefault();
      recordAntiCheatViolation("keyboard-shortcut");
      return false;
    }
    if (commandKey && /p/i.test(e.key)) {
      e.preventDefault();
      alert("حظر: غير مسموح بالطباعة لحماية سرية الأسئلة!");
      return false;
    }
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      if (!systemState.isCheatingSuspended) recordAntiCheatViolation("screenshot");
      return false;
    }
    if (e.key === "Meta" || e.key === "OS") {
      e.preventDefault();
      recordAntiCheatViolation("keyboard-shortcut");
    }
  });

  document.addEventListener("keyup", e => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      recordAntiCheatViolation("screenshot");
    }
  });
}"""

NEW_HANDLERS = """function preventExamClipboardAction(e) {
  if (!systemState.isExamActive) return;
  e.preventDefault();
}

function blockExamRightClick(e) {
  if (!systemState.isExamActive) return;
  if (e.button === 2) e.preventDefault();
}

function setupAntiCheatHandlers() {
  window.addEventListener("beforeunload", e => {
    if (systemState.isExamActive) {
      saveActiveStudentSession();
      updateLiveIncompleteResult();
      e.preventDefault();
      e.returnValue = "امتحانك نشط الآن. مغادرة الصفحة تُسجَّل كمخالفة أمنية.";
      return e.returnValue;
    }
  });

  window.addEventListener("pagehide", () => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      recordAntiCheatViolation("pagehide");
    }
  });

  document.addEventListener("visibilitychange", () => {
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
  });

  document.addEventListener("contextmenu", e => {
    if (systemState.isExamActive) e.preventDefault();
  });
  document.addEventListener("mousedown", blockExamRightClick);
  document.addEventListener("auxclick", blockExamRightClick);

  document.addEventListener("copy", preventExamClipboardAction);
  document.addEventListener("cut", preventExamClipboardAction);
  document.addEventListener("paste", preventExamClipboardAction);

  document.addEventListener("selectstart", e => {
    if (!systemState.isExamActive) return;
    const t = e.target;
    if (t && (t.closest(".option-card, button, textarea, input, select, a, label") || t.isContentEditable)) {
      return;
    }
    e.preventDefault();
  });

  document.addEventListener("dragstart", e => {
    if (systemState.isExamActive) e.preventDefault();
  });

  document.addEventListener("keydown", e => {
    if (!systemState.isExamActive) return;
    const commandKey = e.ctrlKey || e.metaKey;
    if (
      e.key === "F12" ||
      (commandKey && e.shiftKey && /[icjcek]/i.test(e.key)) ||
      (commandKey && /[us]/i.test(e.key))
    ) {
      e.preventDefault();
      alert("حظر: غير مسموح بفتح أدوات المطور أو حفظ الصفحة أثناء الامتحان!");
      return false;
    }
    if (commandKey && /[cvxa]/i.test(e.key)) {
      e.preventDefault();
      return false;
    }
    if (commandKey && /p/i.test(e.key)) {
      e.preventDefault();
      alert("حظر: غير مسموح بالطباعة لحماية سرية الأسئلة!");
      return false;
    }
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      if (!systemState.isCheatingSuspended) recordAntiCheatViolation("screenshot");
      return false;
    }
    if (e.key === "Meta" || e.key === "OS") {
      e.preventDefault();
      if (!systemState.isCheatingSuspended) recordAntiCheatViolation("keyboard-shortcut");
    }
  });

  document.addEventListener("keyup", e => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      recordAntiCheatViolation("screenshot");
    }
  });
}"""

OLD_SECURE = """function requestSecureExamMode() {
  const cat = getExamDeviceCategory();
  if (cat === "desktop" || cat === "tablet") {
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => {});
    }
  }
}

function releaseSecureExamMode() {
  stopExamSecurityWatchdog();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}"""

NEW_SECURE = """function requestSecureExamMode() {
  // لا نستخدم ملء الشاشة — غير متوافق مع كل الأجهزة؛ التأمين عبر التبويب والنسخ فقط.
}

function releaseSecureExamMode() {
  stopExamSecurityWatchdog();
  disableExamSecureMode();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}"""

OLD_FOCUS = """  qTextEl.setAttribute("tabindex", "-1");
  qTextEl.focus(); // نقل التركيز فوراً ليقرأه قارئ الشاشة كفيف الحركة تلقائياً!
"""

NEW_FOCUS = """  qTextEl.setAttribute("tabindex", "-1");
  if (getExamDeviceCategory() === "desktop") {
    qTextEl.focus();
  }
"""

replacements = [
    (OLD_WATCHDOG, NEW_WATCHDOG, "watchdog"),
    (OLD_HANDLERS, NEW_HANDLERS, "handlers"),
    (OLD_SECURE, NEW_SECURE, "secure mode"),
    (OLD_FOCUS, NEW_FOCUS, "question focus"),
]

for old, new, label in replacements:
    if old not in text:
        raise SystemExit(f"Missing block: {label}")
    text = text.replace(old, new, 1)

APP.write_text(text, encoding="utf-8")
print("Patched", APP)
