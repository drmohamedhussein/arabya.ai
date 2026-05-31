#!/usr/bin/env python3
"""Cheat attempts: teacher-visible log, student messages without counts."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
INDEX = ROOT / "index.html"
VERSION = "2026.05.31.14"


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"MISSING: {label}")
    return text.replace(old, new, 1)


def main():
    app = APP.read_text(encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")

    app = must_replace(
        app,
        'const ARABYA_APP_VERSION = "2026.05.31.13";',
        f'const ARABYA_APP_VERSION = "{VERSION}";',
        "version",
    )
    index = index.replace("v=2026.05.31.13", f"v={VERSION}")

    if "function getCheatReasonLabel(" not in app:
        app = must_replace(
            app,
            "function getCheatPenaltyMessage(reason, violationNumber, maxViolations) {",
            """function getCheatReasonLabel(reason) {
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
  if (!count) {
    panel.classList.add("hidden");
    listEl.innerHTML = "";
    if (summaryEl) summaryEl.textContent = "";
    return;
  }

  panel.classList.remove("hidden");
  if (summaryEl) {
    summaryEl.innerHTML = `<strong style="color:var(--error);">إجمالي محاولات الغش المسجلة:</strong> ${count} من ${max} (الحد الذي حدده المعلم)`;
  }

  const log = Array.isArray(res.cheatAttemptLog) ? res.cheatAttemptLog : [];
  listEl.innerHTML = log.map((entry, idx) => {
    const when = entry.at ? formatRetakeTimestamp(entry.at) : "—";
    return `<div class="detail-cheat-attempt-item" style="padding:0.75rem 1rem; margin-bottom:0.5rem; border:1px solid rgba(239,68,68,0.25); border-radius:8px; background:rgba(239,68,68,0.05);">` +
      `<div style="font-weight:700; color:var(--error);">محاولة ${idx + 1}</div>` +
      `<div style="font-size:0.9rem; margin-top:0.25rem;">${escapeHtml(entry.label || entry.reason || "غش")}</div>` +
      `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">${escapeHtml(when)}</div>` +
      `</div>`;
  }).join("");
}

function getCheatPenaltyMessage(reason, isExamCanceled) {""",
            "cheat helpers",
        )

    app = must_replace(
        app,
        """  const actionMap = {
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
}""",
        """  const actionText = getCheatReasonLabel(reason);
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
}""",
        "getCheatPenaltyMessage body",
    )

    app = must_replace(
        app,
        """  systemState.cheatViolations++;

  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];""",
        """  recordCheatAttempt(reason);

  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];""",
        "recordCheatAttempt in trigger",
    )

    app = must_replace(
        app,
        """    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);

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
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);""",
        """    msg.innerHTML = getCheatPenaltyMessage(reason, true);

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
    msg.innerHTML = getCheatPenaltyMessage(reason, false);""",
        "cheat message calls",
    )

    app = must_replace(
        app,
        """  systemState.cheatViolations = 0;
  markExamAntiCheatStarted();

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));""",
        """  systemState.cheatViolations = 0;
  systemState.cheatAttemptLog = [];
  systemState.examMaxCheatAttemptsAllowed = getExamMaxCheatAttempts(selectedExam);
  markExamAntiCheatStarted();

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));""",
        "exam start cheat init",
    )

    app = must_replace(
        app,
        """              systemState.cheatViolations = session.cheatViolations || 0;
              systemState.isExamActive = true;""",
        """              systemState.cheatViolations = session.cheatViolations || 0;
              systemState.cheatAttemptLog = Array.isArray(session.cheatAttemptLog) ? session.cheatAttemptLog : [];
              systemState.examMaxCheatAttemptsAllowed = session.examMaxCheatAttemptsAllowed ?? getExamMaxCheatAttempts(matchedExam);
              systemState.isExamActive = true;""",
        "resume cheat log",
    )

    app = must_replace(
        app,
        """    cheatViolations: systemState.cheatViolations,
    currentExamRuntime: systemState.currentExamRuntime,""",
        """    cheatViolations: systemState.cheatViolations,
    cheatAttemptLog: systemState.cheatAttemptLog || [],
    examMaxCheatAttemptsAllowed: systemState.examMaxCheatAttemptsAllowed,
    currentExamRuntime: systemState.currentExamRuntime,""",
        "session save cheat",
    )

    if "Object.assign(res, buildCheatTrackingFields())" not in app:
        app = must_replace(
            app,
            """  res.studentAnswers = { ...systemState.studentAnswers };
  res.questionScores = questionScoresMap;
  res.maxScore = getCurrentExamTotalScore();
  res.presentedQuestions = JSON.parse(JSON.stringify(systemState.shuffledQuestions));
  res.timestamp = new Date().toLocaleString("ar-EG");

  saveSystemState(false);
}""",
            """  res.studentAnswers = { ...systemState.studentAnswers };
  res.questionScores = questionScoresMap;
  Object.assign(res, buildCheatTrackingFields());
  res.maxScore = getCurrentExamTotalScore();
  res.presentedQuestions = JSON.parse(JSON.stringify(systemState.shuffledQuestions));
  res.timestamp = new Date().toLocaleString("ar-EG");

  saveSystemState(false);
}""",
            "incomplete cheat sync",
        )

    app = must_replace(
        app,
        """    ...buildResultDeviceFields(systemState.examDeviceProfile),
    allowRetake: false
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);""",
        """    ...buildResultDeviceFields(systemState.examDeviceProfile),
    ...buildCheatTrackingFields(),
    allowRetake: false
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);""",
        "completed cheat fields",
    )

    app = must_replace(
        app,
        """    cheatViolations: systemState.cheatViolations,
    ...buildResultDeviceFields(systemState.examDeviceProfile)
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);""",
        """    ...buildCheatTrackingFields(),
    ...buildResultDeviceFields(systemState.examDeviceProfile)
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);""",
        "canceled cheat fields",
    )

    app = must_replace(
        app,
        """  if (res.status === "incomplete") {
    return '<span style="color:var(--warning); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[جاري]</span>';
  }
  return "";
}""",
        """  if (res.status === "incomplete") {
    return '<span style="color:var(--warning); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[جاري]</span>';
  }
  const cheatCount = Number(res.cheatViolations) || 0;
  if (cheatCount > 0) {
    const max = res.maxCheatAttemptsAllowed ?? res.maxCheatAttempts ?? "؟";
    return `<span style="color:var(--error); font-weight:700; font-size:0.75rem; margin-right:0.35rem; display:inline-block;">[غش ${cheatCount}/${max}]</span>`;
  }
  return "";
}""",
        "formatResultStatusBadge cheat",
    )

    app = must_replace(
        app,
        """  renderResultRetakeManagementPanel(res);
  renderStudentAttemptsPanel(res);

  if (!res.studentAnswers) res.studentAnswers = {};""",
        """  renderResultRetakeManagementPanel(res);
  renderStudentAttemptsPanel(res);
  renderTeacherCheatAttemptsPanel(res);

  if (!res.studentAnswers) res.studentAnswers = {};""",
        "detail cheat panel call",
    )

    app = must_replace(
        app,
        """    `أي تبديل تبويب أو إخفاء للصفحة يُسجَّل كمخالفة بعد ${graceSec} ثانية. ` +
    `يُمنع استخدام نفس الجهاز لطالبين مختلفين في نفس الامتحان.`;""",
        """    `أي تبديل تبويب أو مغادرة الصفحة يُسجَّل كمحاولة غش (حسب حد المعلم) بعد ${graceSec} ثانية. ` +
    `لن يظهر لك عدد المحاولات — تظهر للمعلم فقط في سجل النتائج. ` +
    `يُمنع استخدام نفس الجهاز لطالبين مختلفين.`;""",
        "security notice text",
    )

    app = must_replace(
        app,
        """  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,النتيجة,التاريخ والوقت\\n";""",
        """  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,محاولات غش,حد الغش,تفاصيل محاولات الغش,النتيجة,التاريخ والوقت\\n";""",
        "csv header",
    )

    app = must_replace(
        app,
        """      getResultRetakeStatusText(res),
      res.score || "",
      res.timestamp || ""
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `نتائج_arabya_${getExportDateStamp()}.csv`""",
        """      getResultRetakeStatusText(res),
      formatCheatAttemptsTeacherSummary(res),
      res.maxCheatAttemptsAllowed ?? "",
      formatCheatAttemptsExportText(res),
      res.score || "",
      res.timestamp || ""
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `نتائج_arabya_${getExportDateStamp()}.csv`""",
        "csv cheat columns",
    )

    if 'id="detail-cheat-attempts-panel"' not in index:
        index = index.replace(
            """              <div id="detail-retake-management" style="margin-bottom: 2rem; border: 1px solid rgba(20, 184, 166, 0.25); border-radius: 12px; padding: 1.25rem; background: rgba(20, 184, 166, 0.04); text-align:right;">""",
            """              <div id="detail-cheat-attempts-panel" class="hidden" style="margin-bottom: 2rem; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 1.25rem; background: rgba(239, 68, 68, 0.04); text-align:right;">
                <div style="font-weight:700; color:var(--error); margin-bottom:0.5rem;">سجل محاولات الغش (للمعلم فقط)</div>
                <div id="detail-cheat-attempts-summary" style="font-size:0.9rem; color:var(--text-muted); margin-bottom:0.75rem;"></div>
                <div id="detail-cheat-attempts-list"></div>
              </div>

              <div id="detail-retake-management" style="margin-bottom: 2rem; border: 1px solid rgba(20, 184, 166, 0.25); border-radius: 12px; padding: 1.25rem; background: rgba(20, 184, 166, 0.04); text-align:right;">""",
            1,
        )

    APP.write_text(app, encoding="utf-8")
    INDEX.write_text(index, encoding="utf-8")
    print(f"Patched {VERSION}, app.js lines:", len(app.splitlines()))


if __name__ == "__main__":
    main()
