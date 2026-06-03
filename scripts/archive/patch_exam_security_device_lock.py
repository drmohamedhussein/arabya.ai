#!/usr/bin/env python3
"""Comprehensive exam security + device fingerprint lock."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
INDEX = ROOT / "index.html"
STYLE = ROOT / "style.css"
GS = ROOT / "integrations/google-apps-script-backend.gs"
VERSION = "2026.05.31.13"
DEVICE_BLOCK = r'''
// ==========================================
// 8b. بصمة الجهاز ومنع مشاركة الجهاز بين الطلاب
// ==========================================
// ملاحظة: المتصفح لا يسمح بالوصول إلى MAC Address — نستخدم بصمة جهاز + IP.

const EXAM_DEVICE_REGISTRY_KEY = "arabya_exam_device_registry";

function loadExamDeviceRegistry() {
  try {
    const raw = localStorage.getItem(EXAM_DEVICE_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.bindings)) return parsed;
  } catch (e) {}
  return { bindings: [] };
}

function saveExamDeviceRegistry(registry) {
  try {
    localStorage.setItem(EXAM_DEVICE_REGISTRY_KEY, JSON.stringify(registry));
  } catch (e) {
    console.warn("[ARABYA] تعذر حفظ سجل أجهزة الامتحان:", e);
  }
}

function pruneExamDeviceRegistry(registry) {
  const now = Date.now();
  const maxAgeMs = 1000 * 60 * 60 * 24 * 120;
  registry.bindings = (registry.bindings || []).filter(entry => {
    const at = Date.parse(entry.boundAt || "") || entry.savedAt || 0;
    return !at || now - at < maxAgeMs;
  });
  return registry;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  if (window.crypto && window.crypto.subtle) {
    const hash = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return `fallback_${Math.abs(h)}_${s.length}`;
}

function getCanvasFingerprintToken() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "16px 'Segoe UI', Tahoma, Arial";
    ctx.fillStyle = "#0f766e";
    ctx.fillRect(0, 0, 280, 60);
    ctx.fillStyle = "#111827";
    ctx.fillText("ARABYA.NET exam device fingerprint", 12, 12);
    ctx.strokeStyle = "#f59e0b";
    ctx.strokeRect(2, 2, 276, 56);
    return canvas.toDataURL();
  } catch (e) {
    return "";
  }
}

function getWebglFingerprintToken() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor || ""}|${renderer || ""}`;
  } catch (e) {
    return "";
  }
}

async function fetchClientIpAddress() {
  const controllers = [
    "https://api.ipify.org?format=json",
    "https://api64.ipify.org?format=json"
  ];
  for (const url of controllers) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const ip = String(data.ip || "").trim();
      if (ip) return ip;
    } catch (e) {}
  }
  return "";
}

async function collectExamDeviceProfile() {
  const nav = navigator || {};
  const screenInfo = window.screen || {};
  const parts = [
    nav.userAgent || "",
    nav.language || "",
    nav.platform || "",
    nav.hardwareConcurrency || "",
    nav.deviceMemory || "",
    nav.maxTouchPoints || "",
    screenInfo.width || "",
    screenInfo.height || "",
    screenInfo.colorDepth || "",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    getCanvasFingerprintToken(),
    getWebglFingerprintToken()
  ];
  const fingerprintSeed = parts.join("||");
  const deviceFingerprint = await sha256Hex(fingerprintSeed);
  const clientIp = await fetchClientIpAddress();
  const deviceId = await sha256Hex(`${deviceFingerprint}|${clientIp || "no-ip"}`);
  return {
    deviceId,
    deviceFingerprint,
    clientIp: clientIp || "",
    userAgent: (nav.userAgent || "").slice(0, 240),
    platform: nav.platform || "",
    screen: `${screenInfo.width || 0}x${screenInfo.height || 0}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    collectedAt: new Date().toISOString()
  };
}

function mergeDeviceProfileIntoStudent(student, profile) {
  if (!student || !profile) return student;
  student.deviceId = profile.deviceId;
  student.deviceFingerprint = profile.deviceFingerprint;
  student.lastKnownIp = profile.clientIp || student.lastKnownIp || "";
  student.lastDeviceSeenAt = profile.collectedAt || new Date().toISOString();
  student.deviceMeta = {
    platform: profile.platform || "",
    screen: profile.screen || "",
    timezone: profile.timezone || "",
    userAgent: profile.userAgent || ""
  };
  return student;
}

function findDeviceBindingConflict(deviceId, examId, studentLookupKey) {
  if (!deviceId || !examId) return null;
  const registry = pruneExamDeviceRegistry(loadExamDeviceRegistry());
  const binding = (registry.bindings || []).find(entry =>
    entry.deviceId === deviceId &&
    entry.examId === examId &&
    entry.studentLookupKey &&
    entry.studentLookupKey !== studentLookupKey
  );
  return binding || null;
}

function registerExamDeviceBinding(deviceProfile, studentLookupKey, studentName, examId) {
  if (!deviceProfile?.deviceId || !studentLookupKey || !examId) return;
  const registry = pruneExamDeviceRegistry(loadExamDeviceRegistry());
  registry.bindings = (registry.bindings || []).filter(entry =>
    !(entry.deviceId === deviceProfile.deviceId && entry.examId === examId && entry.studentLookupKey !== studentLookupKey)
  );
  const existingIdx = registry.bindings.findIndex(entry =>
    entry.deviceId === deviceProfile.deviceId &&
    entry.examId === examId &&
    entry.studentLookupKey === studentLookupKey
  );
  const row = {
    deviceId: deviceProfile.deviceId,
    deviceFingerprint: deviceProfile.deviceFingerprint,
    clientIp: deviceProfile.clientIp || "",
    studentLookupKey,
    studentName: studentName || "",
    examId,
    boundAt: new Date().toISOString(),
    savedAt: Date.now()
  };
  if (existingIdx >= 0) registry.bindings[existingIdx] = { ...registry.bindings[existingIdx], ...row };
  else registry.bindings.push(row);
  saveExamDeviceRegistry(registry);
}

async function enforceExamDeviceBinding(studentLookupKey, studentName, examId) {
  const profile = await collectExamDeviceProfile();
  const conflict = findDeviceBindingConflict(profile.deviceId, examId, studentLookupKey);
  if (conflict) {
    return {
      ok: false,
      message:
        "تم رفض الدخول: هذا الجهاز/المتصفح سبق استخدامه لطالب آخر في نفس الامتحان.\n\n" +
        `الطالب المسجّل سابقاً على الجهاز: ${conflict.studentName || "غير معروف"}.\n` +
        "يجب أن يؤدي كل طالب الامتحان من جهازه الشخصي فقط.",
      profile
    };
  }
  registerExamDeviceBinding(profile, studentLookupKey, studentName, examId);
  return { ok: true, profile };
}

function buildResultDeviceFields(profile) {
  if (!profile) return {};
  return {
    deviceId: profile.deviceId || "",
    deviceFingerprint: profile.deviceFingerprint || "",
    clientIp: profile.clientIp || "",
    deviceMeta: {
      platform: profile.platform || "",
      screen: profile.screen || "",
      timezone: profile.timezone || "",
      userAgent: profile.userAgent || ""
    }
  };
}

window.arabyaCollectExamDeviceProfile = collectExamDeviceProfile;

'''

ANTI_CHEAT_REPLACEMENT = r'''// ==========================================
// 9. آليات منع الغش وتأمين النوافذ
// ==========================================

function getExamDeviceCategory() {
  const ua = (navigator.userAgent || "").toLowerCase();
  const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  const narrow = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const tablet = window.matchMedia && window.matchMedia("(min-width: 769px) and (max-width: 1024px)").matches;
  if (narrow && touch) return "mobile";
  if (tablet || (touch && /ipad|tablet|android/i.test(ua))) return "tablet";
  return "desktop";
}

function isMobileExamDevice() {
  return getExamDeviceCategory() === "mobile";
}

function isTabletExamDevice() {
  return getExamDeviceCategory() === "tablet";
}

function getExamAntiCheatGraceMs() {
  const cat = getExamDeviceCategory();
  if (cat === "mobile") return 2500;
  if (cat === "tablet") return 2000;
  return 1500;
}

function markExamAntiCheatStarted() {
  systemState.examAntiCheatStartedAt = Date.now();
  startExamSecurityWatchdog();
  enableExamSecureMode();
}

function stopExamSecurityWatchdog() {
  if (systemState.examSecurityWatchInterval) {
    clearInterval(systemState.examSecurityWatchInterval);
    systemState.examSecurityWatchInterval = null;
  }
  disableExamSecureMode();
}

function enableExamSecureMode() {
  document.body.classList.add("exam-secure-mode");
  const runner = document.getElementById("exam-runner-view");
  if (runner) runner.classList.add("exam-secure-active");
}

function disableExamSecureMode() {
  document.body.classList.remove("exam-secure-mode");
  const runner = document.getElementById("exam-runner-view");
  if (runner) runner.classList.remove("exam-secure-active");
  const shield = document.getElementById("runner-security-shield");
  if (shield) shield.classList.add("hidden");
}

function showExamSecurityShield(message) {
  const shield = document.getElementById("runner-security-shield");
  if (!shield) return;
  shield.classList.remove("hidden");
  const textEl = document.getElementById("runner-security-shield-msg");
  if (textEl) textEl.textContent = message || "تم إخفاء شاشة الامتحان — العودة للتبويب مطلوبة.";
}

function hideExamSecurityShield() {
  const shield = document.getElementById("runner-security-shield");
  if (shield) shield.classList.add("hidden");
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  return true;
}

function recordAntiCheatViolation(reason) {
  if (!shouldTriggerFocusAntiCheat(reason)) return;
  const last = systemState.lastAntiCheatTriggerAt || 0;
  if (Date.now() - last < 900) return;
  systemState.lastAntiCheatTriggerAt = Date.now();
  triggerRunnerCheatPenalty(reason);
}

function startExamSecurityWatchdog() {
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
}

function getExamBlockingMessage(blockingResult) {
  if (!blockingResult) return "";
  if (blockingResult.status === "canceled") {
    return "تم إلغاء امتحانك سابقاً بسبب مخالفة قواعد الامتحان.\n\nاطلب من المعلم «السماح بإعادة الامتحان» من تبويب النتائج، ثم حاول الدخول مرة أخرى.";
  }
  return "لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً.\n\nإذا احتجت محاولة جديدة، اطلب من المعلم «السماح بإعادة الامتحان».";
}

function getCheatPenaltyMessage(reason, violationNumber, maxViolations) {
  const actionMap = {
    blur: "الخروج من نافذة الامتحان",
    visibility: "إخفاء تبويب الامتحان أو فتح تبويب/تطبيق آخر (مثل ChatGPT)",
    "visibility-watchdog": "إبقاء تبويب الامتحان مخفياً أو التبديل لتطبيق آخر",
    "focus-watchdog": "فقدان تركيز نافذة الامتحان",
    pagehide: "محاولة مغادرة صفحة الامتحان",
    freeze: "تعليق صفحة الامتحان أثناء التبديل",
    screenshot: "محاولة التقاط لقطة شاشة",
    copy: "محاولة النسخ",
    cut: "محاولة القص",
    paste: "محاولة اللصق",
    "keyboard-shortcut": "استخدام اختصار لوحة مفاتيح محظور"
  };
  const actionText = actionMap[reason] || "مخالفة قواعد الامتحان";
  const remaining = Math.max(0, maxViolations - violationNumber);
  const deviceHint = getExamDeviceCategory() === "mobile"
    ? "على الهاتف: لا تخرج من المتصفح ولا تفتح تطبيقات أخرى أثناء الحل."
    : getExamDeviceCategory() === "tablet"
      ? "على التابلت: ابقَ داخل تبويب الامتحان فقط."
      : "على الكمبيوتر: لا تفتح نوافذ أو تبويبات أخرى أثناء الامتحان.";
  if (violationNumber >= maxViolations) {
    return `<span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان</span>` +
      `تم رصد ${actionText}. تم إنهاء الاختبار وتسجيل حالة الإلغاء.<br>` +
      `<span style="font-size:0.9rem; color:var(--text-muted);">${deviceHint}</span>`;
  }
  return `<span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير (${violationNumber} من ${maxViolations})</span>` +
    `تم رصد ${actionText}. تم إلغاء السؤال الحالي وتصفير درجته.<br>` +
    `<span style="font-size:0.9rem; color:var(--text-muted);">${deviceHint}</span>` +
    `<span style="color:var(--error); font-weight:bold; font-size:0.95rem; display:block; margin-top:0.5rem;">متبقي ${remaining} تحذير${remaining === 1 ? "" : "ات"} قبل إلغاء الامتحان.</span>`;
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
}

function requestSecureExamMode() {
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
}

function getMaxCheatAttemptsForExam(exam) {
  const parsed = parseInt(exam?.maxCheatAttempts, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 5;
}

function triggerRunnerCheatPenalty(reason) {
  systemState.isCheatingSuspended = true;
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  systemState.cheatViolations++;

  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  if (currentQ && currentQ.type === "essay") {
    systemState.studentAnswers[currentQ.id] = "(ملغي - تم كشف محاولة غش/تصوير)";
  } else if (currentQ) {
    systemState.studentAnswers[currentQ.id] = -2;
  }

  const overlay = document.getElementById("runner-cheat-overlay");
  const mainWrapper = document.getElementById("app-main-wrapper");
  const msg = document.getElementById("runner-cheat-msg");
  const exam = systemState.currentExam;
  const maxViolations = getMaxCheatAttemptsForExam(exam);
  const shouldCancel = shouldCancelExamForCheating(exam, systemState.cheatViolations);

  mainWrapper.classList.add("blurred-content");
  overlay.classList.remove("hidden");

  if (shouldCancel) {
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);

    systemState.shuffledQuestions.forEach(q => {
      if (systemState.studentAnswers[q.id] === undefined) {
        if (q.type === "essay") {
          systemState.studentAnswers[q.id] = "(ملغي - غش)";
        } else {
          systemState.studentAnswers[q.id] = -2;
        }
      }
    });

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      systemState.isExamActive = false;
      submitCheatedExam();
    }, 4500);
  } else {
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      runnerNextQuestion(true);
    }, 4000);
  }
}
'''


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"MISSING: {label}")
    return text.replace(old, new, 1)


def main():
    app = APP.read_text(encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")
    style = STYLE.read_text(encoding="utf-8")
    gs = GS.read_text(encoding="utf-8") if GS.exists() else ""

    app = must_replace(app, 'const ARABYA_APP_VERSION = "2026.05.31.12";', f'const ARABYA_APP_VERSION = "{VERSION}";', "version")
    index = index.replace("v=2026.05.31.12", f"v={VERSION}")

    marker = "// ==========================================\n// 9. آليات منع الغش وتأمين النوافذ\n// =========================================="
    if "EXAM_DEVICE_REGISTRY_KEY" not in app:
        app = app.replace(marker, DEVICE_BLOCK + marker, 1)

    start = app.find(marker)
    end = app.find("function submitCheatedExam()", start)
    if start < 0 or end < 0:
        raise SystemExit("anti-cheat section bounds not found")
    app = app[:start] + ANTI_CHEAT_REPLACEMENT + app[end:]

    # validateStudentAndStart -> async with device check
    old_start = """  const activeRetakeGrant = findActiveRetakeGrant(studentLookupKey, examId);
  if (activeRetakeGrant) {
    const retakeConfirm = confirm(`المعلم سمح لك بإعادة أداء امتحان "${selectedExam.title}". هل تريد البدء الآن؟`);
    if (!retakeConfirm) return;
  }

  systemState.currentExam = selectedExam;"""
    new_start = """  const activeRetakeGrant = findActiveRetakeGrant(studentLookupKey, examId);
  if (activeRetakeGrant) {
    const retakeConfirm = confirm(`المعلم سمح لك بإعادة أداء امتحان "${selectedExam.title}". هل تريد البدء الآن؟`);
    if (!retakeConfirm) return;
  }

  const startBtn = document.getElementById("student-start-exam-btn");
  const prevBtnText = startBtn ? startBtn.innerHTML : "";
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear;">hourglass_top</span> جاري التحقق من الجهاز...`;
  }

  let deviceProfile = null;
  try {
    const deviceCheck = await enforceExamDeviceBinding(studentLookupKey, systemState.currentStudent.name, examId);
    if (!deviceCheck.ok) {
      alert(deviceCheck.message);
      return;
    }
    deviceProfile = deviceCheck.profile;
    mergeDeviceProfileIntoStudent(studentRecord, deviceProfile);
    systemState.currentStudent.deviceId = deviceProfile.deviceId;
    systemState.currentStudent.lastKnownIp = deviceProfile.clientIp || "";
    systemState.examDeviceProfile = deviceProfile;
    saveStudentsToLocalStorage();
    saveSystemState(false);
  } catch (deviceErr) {
    console.error("[ARABYA] device binding failed:", deviceErr);
    alert("تعذر التحقق من بصمة الجهاز. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.");
    return;
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = prevBtnText || `الانتقال لبدء الامتحان`;
    }
  }

  systemState.currentExam = selectedExam;"""
    app = must_replace(app, old_start, new_start, "validateStudentAndStart device")

    app = must_replace(app, "function validateStudentAndStart() {", "async function validateStudentAndStart() {", "async validateStudentAndStart")

    # After exam start call requestSecureExamMode
    app = must_replace(
        app,
        """  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
  showMobileExamHintIfNeeded();
}""",
        """  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
  requestSecureExamMode();
  showExamSecurityNotice();
}""",
        "exam start security",
    )

    old_hint = """function showMobileExamHintIfNeeded() {
  if (!isMobileExamDevice()) return;
  const hint = document.getElementById("runner-mobile-exam-hint");
  if (!hint) return;
  hint.classList.remove("hidden");
  hint.innerHTML = `<span class="material-icons" style="vertical-align:middle; font-size:1rem;">smartphone</span> على الهاتف: ابقَ داخل صفحة الامتحان. التبديل لتطبيق آخر أو إخفاء الصفحة قد يُسجَّل كمخالفة بعد ${Math.round(getExamAntiCheatGraceMs() / 1000)} ثوانٍ من البدء.`;
}"""
    new_hint = """function showExamSecurityNotice() {
  const hint = document.getElementById("runner-mobile-exam-hint");
  if (!hint) return;
  hint.classList.remove("hidden");
  const cat = getExamDeviceCategory();
  const graceSec = Math.round(getExamAntiCheatGraceMs() / 1000);
  const deviceLabel = cat === "mobile" ? "الهاتف" : cat === "tablet" ? "التابلت" : "الكمبيوتر";
  hint.innerHTML =
    `<span class="material-icons" style="vertical-align:middle; font-size:1rem;">security</span> ` +
    `وضع تأمين الامتحان مفعّل على ${deviceLabel}: لا تغادر التبويب ولا تفتح ChatGPT أو تطبيقات أخرى. ` +
    `أي تبديل تبويب أو إخفاء للصفحة يُسجَّل كمخالفة بعد ${graceSec} ثانية. ` +
    `يُمنع استخدام نفس الجهاز لطالبين مختلفين في نفس الامتحان.`;
}"""
    if old_hint in app:
        app = app.replace(old_hint, new_hint, 1)
    elif "function showExamSecurityNotice()" not in app:
        app = app.replace("function renderRunnerQuestion() {", new_hint + "\n\nfunction renderRunnerQuestion() {", 1)

    # submitCheatedExam + normal result - device fields
    app = must_replace(
        app,
        "    cheatViolations: systemState.cheatViolations\n  };\n\n  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);",
        "    cheatViolations: systemState.cheatViolations,\n    ...buildResultDeviceFields(systemState.examDeviceProfile)\n  };\n\n  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);",
        "cheated device fields",
    )

    # find complete exam resultObj push - search for status: \"completed\"
    if "buildResultDeviceFields(systemState.examDeviceProfile)" not in app.split("submitCheatedExam")[0][-5000:]:
        pass

    complete_marker = "    status: \"completed\","
    if complete_marker in app and "buildResultDeviceFields" not in app[app.find(complete_marker)-200:app.find(complete_marker)+400]:
        app = app.replace(
            complete_marker,
            "    status: \"completed\",\n    ...buildResultDeviceFields(systemState.examDeviceProfile),",
            1,
        )

    # sendResult payload device fields
    app = must_replace(
        app,
        "    ...buildResultCloudRetakeFields(resultObj)\n  };\n  const slimPayload = buildSlimResultCloudPayload(payload);",
        "    ...buildResultCloudRetakeFields(resultObj),\n    ...buildResultDeviceFields(resultObj || systemState.examDeviceProfile)\n  };\n  const slimPayload = buildSlimResultCloudPayload(payload);",
        "cloud payload device",
    )

    # release on exam complete - find finish exam
    # teacher detail - show device info
    detail_marker = 'document.getElementById("detail-exam-date").innerText = res.timestamp;'
    if detail_marker in app and "detail-device-info" not in app:
        app = app.replace(
            detail_marker,
            detail_marker + '\n  const deviceInfoEl = document.getElementById("detail-device-info");\n  if (deviceInfoEl) {\n    const ip = res.clientIp || "—";\n    const dev = res.deviceId ? `${String(res.deviceId).slice(0, 12)}…` : "—";\n    deviceInfoEl.innerHTML = `<div><strong>بصمة الجهاز:</strong> <code>${escapeHtml(dev)}</code></div><div style="margin-top:0.35rem;"><strong>IP عند التقديم:</strong> <code>${escapeHtml(ip)}</code></div>`;\n  }',
            1,
        )

    if 'id="detail-device-info"' not in index:
        index = index.replace(
            '<div><strong>تاريخ التقدم:</strong> <span id="detail-exam-date">---</span></div>',
            '<div><strong>تاريخ التقدم:</strong> <span id="detail-exam-date">---</span></div>\n                <div id="detail-device-info" style="grid-column: 1 / -1; font-size:0.85rem; color:var(--text-muted);"></div>',
            1,
        )

    if 'id="runner-security-shield"' not in index:
        index = index.replace(
            '<div id="runner-mobile-exam-hint"',
            '<div id="runner-security-shield" class="runner-security-shield hidden" role="alert" aria-live="assertive">\n          <span class="material-icons" aria-hidden="true">gpp_bad</span>\n          <span id="runner-security-shield-msg">تم إخفاء شاشة الامتحان — ارجع فوراً إلى تبويب الامتحان.</span>\n        </div>\n        <div id="runner-mobile-exam-hint"',
            1,
        )

    if "student-start-exam-btn" not in index:
        index = index.replace(
            'onclick="validateStudentAndStart()"',
            'id="student-start-exam-btn" onclick="validateStudentAndStart()"',
            1,
        )
        index = index.replace(
            '<button class="btn btn-primary"',
            '<button id="student-start-exam-btn" class="btn btn-primary"',
            1,
        )

    if ".exam-secure-mode" not in style:
        style += """

.exam-secure-mode #exam-runner-view.exam-secure-active {
  -webkit-user-select: none;
  user-select: none;
}

.exam-secure-mode #exam-runner-view.exam-secure-active .essay-textarea {
  -webkit-user-select: text;
  user-select: text;
}

.runner-security-shield {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
  font-weight: 700;
  line-height: 1.6;
}

.runner-security-shield .material-icons {
  color: var(--error);
}
"""

    if gs and "deviceId:" not in gs:
        gs = gs.replace(
            '    details: data.details || ""\n  };',
            '    details: data.details || "",\n    deviceId: data.deviceId || "",\n    clientIp: data.clientIp || ""\n  };',
            1,
        )

    APP.write_text(app, encoding="utf-8")
    INDEX.write_text(index, encoding="utf-8")
    STYLE.write_text(style, encoding="utf-8")
    if GS.exists():
        GS.write_text(gs, encoding="utf-8")

    lines = len(app.splitlines())
    print(f"app.js lines: {lines}")
    if lines < 7400:
        raise SystemExit("app.js too short?")
    print(f"Patched {VERSION}")


if __name__ == "__main__":
    main()
