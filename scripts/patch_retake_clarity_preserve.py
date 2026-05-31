#!/usr/bin/env python3
"""Clarify retake UX, preserve first attempts, fix stats/sync."""

from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app.js"
HTML = Path(__file__).resolve().parent.parent / "index.html"

HELPERS = """

function getActiveResultsList(results) {
  return (Array.isArray(results) ? results : []).filter(res => !isSupersededResult(res));
}

function getRetakeGrantButtonLabel(res) {
  if (!res) return "السماح بإعادة الامتحان";
  if (res.status === "canceled") return "السماح بإعادة الامتحان بعد الإلغاء";
  return "السماح بإعادة الامتحان";
}

function getRetakeGrantConfirmMessage(res) {
  const examTitle = res?.examTitle || "الامتحان";
  if (res?.status === "canceled") {
    return `هل تريد السماح للطالب "${res.name}" بإعادة أداء "${examTitle}" بعد الإلغاء؟\\n\\nلن تُحذف المحاولة الأولى — تبقى محفوظة في السجل حتى ينهي الطالب المحاولة الجديدة.`;
  }
  return `هل تريد السماح للطالب "${res.name}" بإعادة أداء "${examTitle}"؟\\n\\nلن تُحذف المحاولة الأولى (الدرجة: ${res.score || "—"}) — ستُؤرشف كـ «محاولة سابقة» فقط بعد إكمال الطالب للمحاولة الجديدة.`;
}

function getNextAttemptNumber(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return 1;
  const attempts = (systemState.results || []).filter(res =>
    res.studentLookupKey === studentLookupKey && res.examId === examId
  );
  return attempts.length + 1;
}

function syncRetakeAffectedResultsToCloud(results, syncStatusEl) {
  const rows = Array.isArray(results) ? results.filter(Boolean) : [];
  if (!rows.length) return;
  rows.forEach(res => sendUpdatedResultToCloud(res, syncStatusEl));
  pushCloudBackupNow().catch(() => {});
}
"""

DETAIL_HELP = """                <div style="font-size:0.82rem; color:var(--text-muted); line-height:1.7; margin-bottom:0.85rem; padding:0.75rem; border-radius:8px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.08);">
                  <strong style="color:var(--secondary);">الفرق بين الخيارات:</strong>
                  <div style="margin-top:0.35rem;"><strong>السماح بإعادة الامتحان</strong> — يتيح للطالب محاولة جديدة. المحاولة الأولى <u>لا تُحذف</u>؛ تبقى في السجل وتُوسَم «محاولة سابقة» بعد إكمال المحاولة الجديدة فقط.</div>
                  <div style="margin-top:0.35rem;"><strong>تعديل الدرجة/الإجابات بالأسفل</strong> — تصحيح أو إعادة تقييم <u>نفس المحاولة</u> دون امتحان جديد.</div>
                </div>
"""


def patch_app(content: str) -> str:
    content = content.replace(
        'const ARABYA_APP_VERSION = "2026.05.31.9";',
        'const ARABYA_APP_VERSION = "2026.05.31.10";',
    )

    marker = "function isSupersededResult(res) {\n  return !!(res && res.superseded);\n}"
    if "function getRetakeGrantButtonLabel" not in content:
        content = content.replace(marker, marker + HELPERS)

    content = content.replace(
        """function markPriorResultsSuperseded(studentLookupKey, examId, newRecordId) {
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
}""",
        """function markPriorResultsSuperseded(studentLookupKey, examId, newRecordId) {
  if (!studentLookupKey || !examId || !newRecordId) return [];
  const now = new Date().toISOString();
  const archived = [];
  systemState.results.forEach(res => {
    if (!res || res.recordId === newRecordId || isSupersededResult(res)) return;
    if (res.studentLookupKey !== studentLookupKey || res.examId !== examId) return;
    if (res.status === "incomplete") return;
    res.superseded = true;
    res.supersededAt = now;
    res.supersededByRecordId = newRecordId;
    res.allowRetake = false;
    res.archivedScoreSnapshot = res.score || "";
    res.archivedStatusSnapshot = res.status || "completed";
    archived.push(res);
  });
  return archived;
}""",
    )

    content = content.replace(
        """  const promptText = res.status === "canceled"
    ? `هل تريد السماح للطالب "${res.name}" بإعادة أداء الامتحان بعد الإلغاء؟`
    : `هل تريد السماح للطالب "${res.name}" بإعادة أداء امتحان "${res.examTitle || "الامتحان"}"؟`;
  if (!confirm(promptText)) return;""",
        """  if (!confirm(getRetakeGrantConfirmMessage(res))) return;""",
    )

    content = content.replace(
        """    allowBtn.textContent = res.status === "canceled" ? "السماح بإعادة التقديم" : "إعادة الامتحان";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));""",
        """    allowBtn.textContent = getRetakeGrantButtonLabel(res);
    allowBtn.title = "المحاولة الأولى تبقى محفوظة — تُؤرشف فقط بعد إكمال محاولة جديدة";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));""",
    )

    content = content.replace(
        """    allowBtn.textContent = res.status === "canceled" ? "السماح بإعادة التقديم" : "السماح بإعادة الامتحان";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));""",
        """    allowBtn.textContent = getRetakeGrantButtonLabel(res);
    allowBtn.title = "المحاولة الأولى تبقى محفوظة — تُؤرشف فقط بعد إكمال محاولة جديدة";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));""",
    )

    content = content.replace(
        """function getResultDisplayStatus(res) {
  if (res?.status === "canceled") return "canceled";
  if (res?.status === "incomplete") return "incomplete";""",
        """function getResultDisplayStatus(res) {
  if (isSupersededResult(res)) return "superseded";
  if (res?.status === "canceled") return "canceled";
  if (res?.status === "incomplete") return "incomplete";""",
    )

    content = content.replace(
        """  const results = getTeacherScopedResults();
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0 };
  const periodCounts = { today: 0, week: 0, month: 0 };
  const examCounts = new Map();

  results.forEach(res => {""",
        """  const allResults = getTeacherScopedResults();
  const results = getActiveResultsList(allResults);
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0, superseded: 0 };
  const periodCounts = { today: 0, week: 0, month: 0 };
  const examCounts = new Map();

  allResults.forEach(res => {
    if (isSupersededResult(res)) statusCounts.superseded += 1;
  });

  results.forEach(res => {""",
    )

    content = content.replace(
        "    resultsCount: results.length,",
        "    resultsCount: results.length,\n    archivedResultsCount: allResults.length - results.length,",
    )

    content = content.replace(
        """  markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  saveSystemState(true);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
}""",
        """  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
}""",
    )

    content = content.replace(
        """  markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);""",
        """  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);""",
    )

    content = content.replace(
        """  alert(`تم السماح للطالب "${res.name}" بإعادة أداء الامتحان.`);""",
        """  alert(`تم السماح للطالب "${res.name}" بإعادة أداء الامتحان.\\n\\nالمحاولة الأولى ما زالت محفوظة — لن تُؤرشف إلا بعد إكمال الطالب لمحاولة جديدة.`);""",
    )

    content = content.replace(
        """function getResultRetakeStatusText(res) {
  if (!res) return "—";
  if (isSupersededResult(res)) return "محاولة سابقة (استُبدلت بمحاولة أحدث)";
  if (resultHasActiveRetakeGrant(res)) return "مسموح بإعادة التقديم";
  if (res.status === "canceled") return "ملغى — بانتظار قرار المعلم";
  if (res.status === "completed") return "مكتمل — لا يُسمح بإعادة التقديم";
  return "—";
}""",
        """function getResultRetakeStatusText(res) {
  if (!res) return "—";
  if (isSupersededResult(res)) {
    const scoreHint = res.archivedScoreSnapshot || res.score || "—";
    return `محاولة سابقة محفوظة (الدرجة: ${scoreHint})`;
  }
  if (resultHasActiveRetakeGrant(res)) return "مسموح بإعادة الامتحان — المحاولة الأولى محفوظة";
  if (res.status === "canceled") return "ملغى — بانتظار السماح بإعادة الامتحان";
  if (res.status === "completed") return "مكتمل — المحاولة محفوظة";
  return "—";
}""",
    )

    return content


def patch_html(content: str) -> str:
    content = content.replace(
        '  <script src="questions.js?v=2026.05.31.9"></script>\n  <script src="app.js?v=2026.05.31.9"></script>',
        '  <script src="questions.js?v=2026.05.31.10"></script>\n  <script src="app.js?v=2026.05.31.10"></script>',
    )

    if "الفرق بين الخيارات" not in content:
        content = content.replace(
            '                    <div style="font-size:0.85rem; color:var(--text-muted);">اسمح للطالب بإعادة التقديم بعد الإكمال أو الإلغاء، أو ألغِ السماح في أي وقت.</div>',
            '                    <div style="font-size:0.85rem; color:var(--text-muted);">اسمح للطالب بمحاولة جديدة — المحاولة الأولى تبقى محفوظة ولا تُحذف.</div>',
        )
        content = content.replace(
            '                <div id="detail-retake-status" style="margin-bottom:0.85rem;"></div>',
            DETAIL_HELP + '\n                <div id="detail-retake-status" style="margin-bottom:0.85rem;"></div>',
        )

    if 'data-results-status-filter="superseded"' not in content:
        content = content.replace(
            '                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="retake_allowed">مسموح بإعادة التقديم</button>',
            '                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="retake_allowed">مسموح بإعادة الامتحان</button>\n'
            '                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="superseded">محاولات سابقة</button>',
        )

    return content


def main() -> None:
    APP.write_text(patch_app(APP.read_text(encoding="utf-8")), encoding="utf-8")
    HTML.write_text(patch_html(HTML.read_text(encoding="utf-8")), encoding="utf-8")
    print("Patched retake clarity and preservation")


if __name__ == "__main__":
    main()
