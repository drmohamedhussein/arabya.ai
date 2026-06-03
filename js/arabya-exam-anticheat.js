/**
 * منع الغش، تأمين النافذة، عقوبات المشغل
 * مستخرج من app.js — يعتمد على window.systemState بعد تحميل app.js.
 */
// ==========================================
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
  clearExamHiddenTabTimer();
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

function clearExamHiddenTabTimer() {
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
}

function getExamBlockingMessage(blockingResult) {
  if (!blockingResult) return "";
  if (blockingResult.status === "canceled") {
    return "تم إلغاء امتحانك سابقاً بسبب مخالفة قواعد الامتحان.\n\nاطلب من المعلم «السماح بإعادة الامتحان» من تبويب النتائج، ثم حاول الدخول مرة أخرى.";
  }
  return "لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً.\n\nإذا احتجت محاولة جديدة، اطلب من المعلم «السماح بإعادة الامتحان».";
}

function getCheatReasonLabel(reason) {
  const actionMap = {
    blur: "الخروج من نافذة الامتحان",
    visibility: "إخفاء تبويب الامتحان أو فتح تبويب آخر",
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
  return actionMap[reason] || "مخالفة قواعد الامتحان";
}


function buildCheatTrackingFieldsFromResult(res) {
  if (!res) return buildCheatTrackingFields();
  const log = Array.isArray(res.cheatAttemptLog) ? res.cheatAttemptLog : [];
  const violations = Number(res.cheatViolations);
  let maxAllowed = res.maxCheatAttemptsAllowed;
  if (maxAllowed === undefined || maxAllowed === null || maxAllowed === "") {
    const exam = Array.isArray(systemState.exams)
      ? systemState.exams.find(e => e && e.id === res.examId)
      : null;
    maxAllowed = getExamMaxCheatAttempts(exam || systemState.currentExam);
  }
  return {
    cheatViolations: Number.isFinite(violations) ? violations : log.length,
    cheatAttemptLog: log,
    maxCheatAttemptsAllowed: maxAllowed
  };
}

function buildCheatTrackingFields() {
  const log = Array.isArray(systemState.cheatAttemptLog) ? [...systemState.cheatAttemptLog] : [];
  const maxAllowed = systemState.examMaxCheatAttemptsAllowed ?? getExamMaxCheatAttempts(systemState.currentExam);
  return {
    cheatViolations: log.length,
    cheatAttemptLog: log,
    maxCheatAttemptsAllowed: maxAllowed
  };
}

function recordCheatAttempt(reason) {
  if (!Array.isArray(systemState.cheatAttemptLog)) {
    systemState.cheatAttemptLog = [];
  }
  systemState.cheatAttemptLog.push({
    reason: reason || "unknown",
    label: getCheatReasonLabel(reason),
    at: new Date().toISOString()
  });
  systemState.cheatViolations = systemState.cheatAttemptLog.length;
  updateLiveIncompleteResult();
  saveActiveStudentSession();
}

function formatCheatAttemptsTeacherSummary(res) {
  const count = Number(res?.cheatViolations) || 0;
  if (!count) return "";
  const max = res.maxCheatAttemptsAllowed ?? res.maxCheatAttempts ?? "—";
  return `محاولات غش: ${count} / ${max}`;
}

function formatCheatAttemptsExportText(res) {
  const log = Array.isArray(res?.cheatAttemptLog) ? res.cheatAttemptLog : [];
  if (!log.length) return "";
  return log.map((entry, idx) => `${idx + 1}. ${entry.label || entry.reason || "غش"} (${entry.at || ""})`).join(" | ");
}

function renderTeacherCheatAttemptsPanel(res) {
  const panel = document.getElementById("detail-cheat-attempts-panel");
  const listEl = document.getElementById("detail-cheat-attempts-list");
  const summaryEl = document.getElementById("detail-cheat-attempts-summary");
  if (!panel || !listEl) return;

  const count = Number(res?.cheatViolations) || 0;
  const max = res.maxCheatAttemptsAllowed ?? res.maxCheatAttempts ?? "—";
  const log = Array.isArray(res.cheatAttemptLog) ? res.cheatAttemptLog : [];
  const ip = (res?.clientIp || "").trim() || "—";
  const fp = (res?.deviceFingerprint || "").trim();
  const fpShort = fp ? `${fp.slice(0, 20)}…` : "—";
  const retakeLine = resultHasActiveRetakeGrant(res)
    ? `<span style="color:var(--secondary); font-weight:700;">مسموح بإعادة التقديم</span>`
    : isResultIpReleasedByStaff(res)
      ? `<span style="color:var(--accent); font-weight:700;">تم تحرير IP/الجهاز للمعلم</span>`
      : `<span style="color:var(--text-muted);">لا يوجد سماح بإعادة تقديم نشط</span>`;

  if (!count && !log.length && !fp && !res?.clientIp) {
    panel.classList.add("hidden");
    listEl.innerHTML = "";
    if (summaryEl) summaryEl.textContent = "";
    return;
  }

  panel.classList.remove("hidden");
  if (summaryEl) {
    summaryEl.innerHTML =
      `<div style="display:grid; gap:0.35rem;">` +
      `<div><strong style="color:var(--error);">محاولات الغش:</strong> ${count} من ${max}</div>` +
      `<div><strong>IP عند التقديم:</strong> <code>${escapeHtml(ip)}</code></div>` +
      `<div><strong>بصمة الجهاز:</strong> <code title="${escapeHtml(fp)}">${escapeHtml(fpShort)}</code></div>` +
      `<div><strong>إعادة التقديم:</strong> ${retakeLine}</div>` +
      `</div>`;
  }

  if (!log.length) {
    listEl.innerHTML = `<div style="font-size:0.85rem; color:var(--text-muted); padding:0.5rem 0;">لا يوجد سجل تفصيلي لكل محاولة — العدد الإجمالي مسجّل في النتيجة فقط.</div>`;
    return;
  }

  listEl.innerHTML = log.map((entry, idx) => {
    const when = entry.at ? formatRetakeTimestamp(entry.at) : "—";
    const detail = entry.detail || entry.meta || "";
    return `<div class="detail-cheat-attempt-item" style="padding:0.75rem 1rem; margin-bottom:0.5rem; border:1px solid rgba(239,68,68,0.25); border-radius:8px; background:rgba(239,68,68,0.05);">` +
      `<div style="font-weight:700; color:var(--error);">محاولة غش ${idx + 1}</div>` +
      `<div style="font-size:0.9rem; margin-top:0.25rem;">${escapeHtml(entry.label || entry.reason || "غش")}</div>` +
      `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">${escapeHtml(when)}</div>` +
      (detail ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.2rem;">${escapeHtml(String(detail))}</div>` : "") +
      `</div>`;
  }).join("");
}

function getCheatPenaltyMessage(reason, isExamCanceled) {
  const actionText = getCheatReasonLabel(reason);
  const deviceHint = getExamDeviceCategory() === "mobile"
    ? "على الهاتف: لا تخرج من المتصفح ولا تفتح تطبيقات أخرى أثناء الحل."
    : getExamDeviceCategory() === "tablet"
      ? "على التابلت: ابقَ داخل تبويب الامتحان فقط."
      : "على الكمبيوتر: لا تفتح نوافذ أو تبويبات أخرى أثناء الامتحان.";
  if (isExamCanceled) {
    return `<span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان</span>` +
      `تم تسجيل محاولة غش: ${actionText}.<br>` +
      `تم إنهاء الاختبار وفق قواعد المعلم.<br>` +
      `<span style="font-size:0.9rem; color:var(--text-muted);">${deviceHint}</span>`;
  }
  return `<span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تم رصد محاولة غش</span>` +
    `${actionText}.<br>` +
    `تم إلغاء السؤال الحالي وتصفير درجته والانتقال للسؤال التالي.<br>` +
    `<span style="font-size:0.9rem; color:var(--text-muted);">${deviceHint}</span>`;
}

function preventExamClipboardAction(e) {
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
}

function requestSecureExamMode() {
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

  recordCheatAttempt(reason);

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
    msg.innerHTML = getCheatPenaltyMessage(reason, true);

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
    msg.innerHTML = getCheatPenaltyMessage(reason, false);

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      runnerNextQuestion(true);
    }, 4000);
  }
}
function submitCheatedExam() {
  stopExamDeadlineWatcher();
  // تنظيف الجلسة الحية وحذف السجل غير المكتمل
  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === systemState.currentExam.id && r.status === "incomplete"));
  localStorage.removeItem("arabya_active_student_session");
  releaseSecureExamMode();

  const exam = systemState.currentExam;
  const examTotalScore = getCurrentExamTotalScore();
  const scoreString = `0 / ${examTotalScore} (ملغي - غش متكرر)`;
  const detailsFormatted = "تم إلغاء الامتحان وتصفير النتيجة نهائياً لمخالفة تعليمات الاختبار وتكرار محاولة الغش أو الخروج من الصفحة.";

  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};
  exam.questions.forEach(q => {
    questionScoresMap[q.id] = 0;
  });

  const resultObj = {
    recordId: createRecordId("result"),
    savedAt: Date.now(),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode || "",
    studentLookupKey,
    email: systemState.currentStudent.email || "",
    mobile: systemState.currentStudent.mobile || "",
    examTitle: systemState.currentExam.title,
    examId: systemState.currentExam.id,
    university: systemState.currentExam.university,
    faculty: systemState.currentExam.faculty,
    level: systemState.currentExam.level,
    examType: systemState.currentExam.examType,
    score: scoreString,
    details: detailsFormatted,
    timestamp: new Date().toLocaleString("ar-EG"),
    studentAnswers: studentAnswersMap,
    questionScores: questionScoresMap,
    maxScore: examTotalScore,
    presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions || [])),
    status: "canceled",
    allowRetake: false,
    ...buildCheatTrackingFields(),
    ...buildResultDeviceFields(systemState.examDeviceProfile)
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(false);

  navigateToView("student-result-view");
  document.getElementById("runner-res-score").innerText = "0";
  document.getElementById("runner-res-total").innerText = examTotalScore;
  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id || "--";
  document.getElementById("runner-res-title").innerText = `${systemState.currentExam.title} [${systemState.currentExam.examType}]`;

  const statusEl = document.getElementById("runner-res-status");
  statusEl.innerText = "تم إلغاء امتحانك بسبب اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تواصل مع المعلم إذا لزم الأمر.";
  statusEl.style.color = "var(--error)";

  const syncEl = document.getElementById("runner-res-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة السجل مع Google Sheets...`;
  }
  if (archivedAttempts && archivedAttempts.length) {
    syncRetakeAffectedResultsToCloud(archivedAttempts);
  }
  void sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("exam_submit_cheat");
  }
}
