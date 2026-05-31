#!/usr/bin/env python3
"""Implement teacher retake management for completed/canceled exam results."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app.js"
HTML = ROOT / "index.html"
GS = ROOT / "integrations" / "google-apps-script-backend.gs"

RETAKE_HELPERS = '''
function isSupersededResult(res) {
  return !!(res && res.superseded);
}

function findActiveRetakeGrant(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  return systemState.results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    r.allowRetake === true &&
    !r.superseded &&
    r.status !== "incomplete"
  ) || null;
}

function resultCanGrantRetake(res) {
  if (!res || isSupersededResult(res) || res.status === "incomplete") return false;
  return res.allowRetake !== true;
}

function resultHasActiveRetakeGrant(res) {
  return !!(res && res.allowRetake === true && !isSupersededResult(res) && res.status !== "incomplete");
}

function getResultRetakeStatusText(res) {
  if (!res) return "—";
  if (isSupersededResult(res)) return "محاولة سابقة (استُبدلت بمحاولة أحدث)";
  if (resultHasActiveRetakeGrant(res)) return "مسموح بإعادة التقديم";
  if (res.status === "canceled") return "ملغى — بانتظار قرار المعلم";
  if (res.status === "completed") return "مكتمل — لا يُسمح بإعادة التقديم";
  return "—";
}

function markPriorResultsSuperseded(studentLookupKey, examId, newRecordId) {
  if (!studentLookupKey || !examId || !newRecordId) return;
  const now = new Date().toISOString();
  systemState.results.forEach(res => {
    if (!res || res.recordId === newRecordId || isSupersededResult(res)) return;
    if (res.studentLookupKey !== studentLookupKey || res.examId !== examId) return;
    if (res.status === "incomplete") return;
    res.superseded = true;
    res.supersededAt = now;
    res.supersededByRecordId = newRecordId;
    res.allowRetake = false;
  });
}

function appendResultRetakeActions(res, actionsCell) {
  if (!actionsCell || !res || isSupersededResult(res)) return;

  if (resultCanGrantRetake(res)) {
    const allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.className = "btn btn-outline btn-sm";
    allowBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary);";
    allowBtn.textContent = res.status === "canceled" ? "السماح بإعادة التقديم" : "إعادة الامتحان";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));
    actionsCell.appendChild(allowBtn);
  }

  if (resultHasActiveRetakeGrant(res)) {
    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn btn-outline btn-sm";
    revokeBtn.style.cssText = "border-color:var(--warning); color:var(--warning);";
    revokeBtn.textContent = "إلغاء السماح";
    revokeBtn.addEventListener("click", () => revokeStudentExamRetake(res.recordId || ""));
    actionsCell.appendChild(revokeBtn);
  }
}

function renderResultRetakeManagementPanel(res) {
  const statusEl = document.getElementById("detail-retake-status");
  const actionsEl = document.getElementById("detail-retake-actions");
  if (!statusEl || !actionsEl) return;

  const statusText = getResultRetakeStatusText(res);
  const tone = isSupersededResult(res)
    ? "var(--text-muted)"
    : resultHasActiveRetakeGrant(res)
      ? "var(--secondary)"
      : res.status === "canceled"
        ? "var(--error)"
        : "var(--text-muted)";

  statusEl.innerHTML = `<strong style="color:${tone};">${escapeHtml(statusText)}</strong>` +
    (res.retakeGrantedAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">تاريخ السماح: ${escapeHtml(formatRetakeTimestamp(res.retakeGrantedAt))}</div>` : "") +
    (res.supersededAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">استُبدلت بتاريخ: ${escapeHtml(formatRetakeTimestamp(res.supersededAt))}</div>` : "");

  actionsEl.innerHTML = "";
  if (isSupersededResult(res)) {
    actionsEl.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">هذه محاولة سابقة محفوظة للأرشفة فقط.</span>`;
    return;
  }

  if (resultCanGrantRetake(res)) {
    const allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.className = "btn btn-outline btn-sm";
    allowBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary);";
    allowBtn.textContent = res.status === "canceled" ? "السماح بإعادة التقديم" : "السماح بإعادة الامتحان";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));
    actionsEl.appendChild(allowBtn);
  }

  if (resultHasActiveRetakeGrant(res)) {
    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn btn-outline btn-sm";
    revokeBtn.style.cssText = "border-color:var(--warning); color:var(--warning);";
    revokeBtn.textContent = "إلغاء السماح بإعادة التقديم";
    revokeBtn.addEventListener("click", () => revokeStudentExamRetake(res.recordId || ""));
    actionsEl.appendChild(revokeBtn);
  }
}

function formatRetakeTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  }
  return String(value);
}

function buildResultCloudRetakeFields(res) {
  return {
    allowRetake: !!res?.allowRetake,
    superseded: !!res?.superseded,
    retakeGrantedAt: res?.retakeGrantedAt || "",
    retakeRevokedAt: res?.retakeRevokedAt || "",
    supersededAt: res?.supersededAt || "",
    supersededByRecordId: res?.supersededByRecordId || ""
  };
}

window.allowStudentExamRetake = function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (!resultCanGrantRetake(res)) {
    alert("لا يمكن منح إعادة التقديم لهذا السجل حالياً.");
    return;
  }
  const promptText = res.status === "canceled"
    ? `هل تريد السماح للطالب "${res.name}" بإعادة أداء الامتحان بعد الإلغاء؟`
    : `هل تريد السماح للطالب "${res.name}" بإعادة أداء امتحان "${res.examTitle || "الامتحان"}"؟`;
  if (!confirm(promptText)) return;

  res.allowRetake = true;
  res.retakeGrantedAt = new Date().toISOString();
  res.retakeGrantedBy = systemState.activeTeacher?.username || "teacher";
  delete res.retakeRevokedAt;
  saveSystemState(true);
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
    renderResultRetakeManagementPanel(res);
  }
  const syncEl = document.getElementById("grading-sync-status");
  sendUpdatedResultToCloud(res, syncEl);
  alert(`تم السماح للطالب "${res.name}" بإعادة أداء الامتحان.`);
};

window.revokeStudentExamRetake = function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (!resultHasActiveRetakeGrant(res)) {
    alert("لا يوجد سماح نشط بإعادة التقديم على هذا السجل.");
    return;
  }
  if (!confirm(`هل تريد إلغاء السماح بإعادة التقديم للطالب "${res.name}"؟`)) return;

  res.allowRetake = false;
  res.retakeRevokedAt = new Date().toISOString();
  saveSystemState(true);
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
    renderResultRetakeManagementPanel(res);
  }
  const syncEl = document.getElementById("grading-sync-status");
  sendUpdatedResultToCloud(res, syncEl);
  alert("تم إلغاء السماح بإعادة التقديم.");
};
'''

DETAIL_PANEL_HTML = '''
              <div id="detail-retake-management" style="margin-bottom: 2rem; border: 1px solid rgba(20, 184, 166, 0.25); border-radius: 12px; padding: 1.25rem; background: rgba(20, 184, 166, 0.04); text-align:right;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; margin-bottom:0.75rem;">
                  <div>
                    <div style="font-weight:700; color:var(--secondary); margin-bottom:0.35rem;">إدارة إعادة الامتحان</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">اسمح للطالب بإعادة التقديم بعد الإكمال أو الإلغاء، أو ألغِ السماح في أي وقت.</div>
                  </div>
                </div>
                <div id="detail-retake-status" style="margin-bottom:0.85rem;"></div>
                <div id="detail-retake-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap;"></div>
              </div>
'''


def patch_app(content: str) -> str:
    content = content.replace(
        'const ARABYA_APP_VERSION = "2026.05.31.8";',
        'const ARABYA_APP_VERSION = "2026.05.31.9";',
    )

    marker = "function findBlockingExamResult(studentLookupKey, examId) {"
    if marker not in content:
        raise SystemExit("findBlockingExamResult not found")
    if "function allowStudentExamRetake" not in content:
        content = content.replace(marker, RETAKE_HELPERS + "\n" + marker)

    content = content.replace(
        """function findBlockingExamResult(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  return systemState.results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}""",
        """function findBlockingExamResult(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  return systemState.results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}""",
    )

    content = content.replace(
        """  systemState.results.forEach(r => {
    if (r.studentLookupKey === studentLookupKey && r.status === "canceled" && r.allowRetake !== true && r.examId) {
      ids.add(r.examId);
    }
  });""",
        """  systemState.results.forEach(r => {
    if (isSupersededResult(r)) return;
    if (r.studentLookupKey === studentLookupKey && r.status === "canceled" && r.allowRetake !== true && r.examId) {
      ids.add(r.examId);
    }
  });""",
    )

    content = content.replace(
        """function formatResultStatusBadge(res) {
  if (res.status === "canceled" && res.allowRetake !== true) {
    return '<span style="color:var(--error); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[تم إلغاء الامتحان]</span>';
  }
  if (res.status === "incomplete") {
    return '<span style="color:var(--warning); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[جاري]</span>';
  }
  return "";
}""",
        """function formatResultStatusBadge(res) {
  if (isSupersededResult(res)) {
    return '<span style="color:var(--text-muted); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[محاولة سابقة]</span>';
  }
  if (resultHasActiveRetakeGrant(res)) {
    return '<span style="color:var(--secondary); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[مسموح بإعادة التقديم]</span>';
  }
  if (res.status === "canceled" && res.allowRetake !== true) {
    return '<span style="color:var(--error); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[تم إلغاء الامتحان]</span>';
  }
  if (res.status === "incomplete") {
    return '<span style="color:var(--warning); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[جاري]</span>';
  }
  return "";
}""",
    )

    content = content.replace(
        """function resultMatchesStatusFilter(res, statusFilter) {
  if (!statusFilter || statusFilter === "all") return true;
  return getResultDisplayStatus(res) === statusFilter;
}""",
        """function resultMatchesStatusFilter(res, statusFilter) {
  if (!statusFilter || statusFilter === "all") return true;
  if (statusFilter === "retake_allowed") return resultHasActiveRetakeGrant(res);
  if (statusFilter === "superseded") return isSupersededResult(res);
  return getResultDisplayStatus(res) === statusFilter;
}""",
    )

    content = content.replace(
        """function countStudentResults(student) {
  const studentKey = student.studentKey || getStudentLookupKey(student);
  return (systemState.results || []).filter(res => {
    const resultKey = res.studentLookupKey || getStudentLookupKey({
      id: res.id,
      code: res.accessCode,
      name: res.name
    });
    if (studentKey && resultKey && studentKey === resultKey) return true;
    return normalizeStudentId(student.id) && normalizeStudentId(res.id) === normalizeStudentId(student.id);
  }).length;
}""",
        """function countStudentResults(student) {
  const studentKey = student.studentKey || getStudentLookupKey(student);
  return (systemState.results || []).filter(res => {
    if (isSupersededResult(res)) return false;
    const resultKey = res.studentLookupKey || getStudentLookupKey({
      id: res.id,
      code: res.accessCode,
      name: res.name
    });
    if (studentKey && resultKey && studentKey === resultKey) return true;
    return normalizeStudentId(student.id) && normalizeStudentId(res.id) === normalizeStudentId(student.id);
  }).length;
}""",
    )

    content = content.replace(
        """  const blockingResult = findBlockingExamResult(studentLookupKey, examId);
  if (blockingResult) {
    if (blockingResult.status === "canceled") {
      alert("تم إلغاء امتحانك سابقاً بسبب تجاوز محاولات الغش المسموحة. تواصل مع المعلم لإعادة السماح بالتقديم.");
    } else {
      alert("لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً. لا يمكن الدخول إليه مرة أخرى.");
    }
    return;
  }

  systemState.currentExam = selectedExam;""",
        """  const blockingResult = findBlockingExamResult(studentLookupKey, examId);
  if (blockingResult) {
    if (blockingResult.status === "canceled") {
      alert("تم إلغاء امتحانك سابقاً بسبب تجاوز محاولات الغش المسموحة. تواصل مع المعلم لإعادة السماح بالتقديم.");
    } else {
      alert("لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً. لا يمكن الدخول إليه مرة أخرى.");
    }
    return;
  }

  const activeRetakeGrant = findActiveRetakeGrant(studentLookupKey, examId);
  if (activeRetakeGrant) {
    const retakeConfirm = confirm(`المعلم سمح لك بإعادة أداء امتحان "${selectedExam.title}". هل تريد البدء الآن؟`);
    if (!retakeConfirm) return;
  }

  systemState.currentExam = selectedExam;""",
    )

    content = content.replace(
        """  systemState.results.push(resultObj);
  saveSystemState(true);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
}""",
        """  markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  saveSystemState(true);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
}""",
    )

    content = content.replace(
        """  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);

  navigateToView("student-result-view");""",
        """  markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);

  navigateToView("student-result-view");""",
    )

    content = content.replace(
        """    status: res.status || "updated",
    score: res.score || "",
    details: res.details || "",
    maxScore: res.maxScore || "",
    isManualGradeUpdate: true
  };""",
        """    status: res.status || "updated",
    score: res.score || "",
    details: res.details || "",
    maxScore: res.maxScore || "",
    isManualGradeUpdate: true,
    ...buildResultCloudRetakeFields(res)
  };""",
    )

    content = content.replace(
        """    status: resultObj?.status || "completed",
    score: scoreString,
    details: details,
    maxScore: resultObj?.maxScore || getCurrentExamTotalScore()
  };""",
        """    status: resultObj?.status || "completed",
    score: scoreString,
    details: details,
    maxScore: resultObj?.maxScore || getCurrentExamTotalScore(),
    ...buildResultCloudRetakeFields(resultObj)
  };""",
    )

    content = content.replace(
        """    const actionsCell = row.querySelector(".teacher-results-actions");
    if (res.status === "canceled" && res.allowRetake !== true) {
      const uncancelBtn = document.createElement("button");
      uncancelBtn.type = "button";
      uncancelBtn.className = "btn btn-outline btn-sm";
      uncancelBtn.style.cssText = "border-color:var(--warning); color:var(--warning); margin-right:0.25rem;";
      uncancelBtn.textContent = "إلغاء علامة الإلغاء";
      uncancelBtn.addEventListener("click", () => uncancelStudentExam(res.recordId || ""));
      actionsCell.appendChild(uncancelBtn);
    }

    const viewBtn = document.createElement("button");""",
        """    const actionsCell = row.querySelector(".teacher-results-actions");
    appendResultRetakeActions(res, actionsCell);

    const viewBtn = document.createElement("button");""",
    )

    content = content.replace(
        """  document.getElementById("detail-exam-date").innerText = res.timestamp;
  document.getElementById("detail-total-score-input").value = res.score;

  if (!res.studentAnswers) res.studentAnswers = {};""",
        """  document.getElementById("detail-exam-date").innerText = res.timestamp;
  document.getElementById("detail-total-score-input").value = res.score;
  renderResultRetakeManagementPanel(res);

  if (!res.studentAnswers) res.studentAnswers = {};""",
    )

    content = content.replace(
        """window.uncancelStudentExam = function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (res.status !== "canceled") {
    alert("هذا السجل ليس بحالة إلغاء.");
    return;
  }
  if (!confirm(`هل تريد إلغاء علامة "تم إلغاء الامتحان" للطالب ${res.name} والسماح له بإعادة التقديم؟`)) {
    return;
  }
  res.allowRetake = true;
  res.uncanceledAt = new Date().toLocaleString("ar-EG");
  saveSystemState(true);
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  alert("تم السماح للطالب بإعادة أداء الامتحان.");
};""",
        """window.uncancelStudentExam = function(recordId) {
  allowStudentExamRetake(recordId);
};""",
    )

    content = content.replace(
        '  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,النتيجة,التاريخ والوقت\\n";',
        '  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,النتيجة,التاريخ والوقت\\n";',
    )

    content = content.replace(
        """      getResultDisplayStatus(res),
      res.score || "",
      res.timestamp || ""
    ]);""",
        """      getResultDisplayStatus(res),
      getResultRetakeStatusText(res),
      res.score || "",
      res.timestamp || ""
    ]);""",
    )

    return content


def patch_html(content: str) -> str:
    content = content.replace(
        '  <script src="questions.js?v=2026.05.31.8"></script>\n  <script src="app.js?v=2026.05.31.8"></script>',
        '  <script src="questions.js?v=2026.05.31.9"></script>\n  <script src="app.js?v=2026.05.31.9"></script>',
    )

    if 'data-results-status-filter="retake_allowed"' not in content:
        content = content.replace(
            '                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="canceled">ملغى</button>',
            '                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="canceled">ملغى</button>\n'
            '                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="retake_allowed">مسموح بإعادة التقديم</button>',
        )

    if 'id="detail-retake-management"' not in content:
        content = content.replace(
            '              <!-- حقل تعديل النتيجة النهائية الإجمالية يدوياً -->',
            DETAIL_PANEL_HTML + '\n              <!-- حقل تعديل النتيجة النهائية الإجمالية يدوياً -->',
        )

    return content


def patch_gs(content: str) -> str:
    content = content.replace(
        """function normaliseArabyaResult_(data) {
  return {
    recordId: data.recordId || "",
    timestamp: data.timestamp || new Date().toISOString(),
    name: data.name || "",
    id: data.id || "",
    accessCode: data.subscriptionCode || data.accessCode || "",
    examTitle: data.examTitle || "",
    examId: data.examId || "",
    university: data.university || "",
    faculty: data.faculty || "",
    level: data.level || "",
    examType: data.examType || "",
    score: data.score || "",
    details: data.details || ""
  };
}""",
        """function normaliseArabyaResult_(data) {
  return {
    recordId: data.recordId || "",
    timestamp: data.timestamp || new Date().toISOString(),
    name: data.name || "",
    id: data.id || "",
    accessCode: data.subscriptionCode || data.accessCode || "",
    studentLookupKey: data.studentLookupKey || "",
    examTitle: data.examTitle || "",
    examId: data.examId || "",
    university: data.university || "",
    faculty: data.faculty || "",
    level: data.level || "",
    examType: data.examType || "",
    status: data.status || "completed",
    score: data.score || "",
    details: data.details || "",
    allowRetake: data.allowRetake === true,
    superseded: data.superseded === true,
    retakeGrantedAt: data.retakeGrantedAt || "",
    retakeRevokedAt: data.retakeRevokedAt || "",
    supersededAt: data.supersededAt || "",
    supersededByRecordId: data.supersededByRecordId || ""
  };
}""",
    )
    return content


def main() -> None:
    APP.write_text(patch_app(APP.read_text(encoding="utf-8")), encoding="utf-8")
    HTML.write_text(patch_html(HTML.read_text(encoding="utf-8")), encoding="utf-8")
    GS.write_text(patch_gs(GS.read_text(encoding="utf-8")), encoding="utf-8")
    print("Patched retake management")


if __name__ == "__main__":
    main()
