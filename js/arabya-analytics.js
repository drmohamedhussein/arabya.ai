/**
 * تقارير وتحليلات لوحة المعلم.
 */
(function (global) {
  function parseScoreRatio(scoreText, maxScore) {
    const raw = String(scoreText || "").trim();
    const slash = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (slash) {
      const earned = parseFloat(slash[1]);
      const max = parseFloat(slash[2]) || maxScore || 100;
      return max > 0 ? earned / max : null;
    }
    const num = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(num) && maxScore > 0) return num / maxScore;
    if (Number.isFinite(num) && num <= 1) return num;
    return null;
  }

  function computeTeacherAnalytics(state, helpers) {
    const getTeacherScopedResults = helpers.getTeacherScopedResults;
    const getTeacherScopedExams = helpers.getTeacherScopedExams;
    const getActiveResultsList = helpers.getActiveResultsList;
    const getResultDisplayStatus = helpers.getResultDisplayStatus;
    const isSupersededResult = helpers.isSupersededResult;

    const exams = getTeacherScopedExams();
    const allResults = getTeacherScopedResults();
    const results = getActiveResultsList(allResults).filter(r => getResultDisplayStatus(r) === "completed");

    const examStats = exams.map(exam => {
      const examResults = results.filter(r => r.examId === exam.id || r.examTitle === exam.title);
      const ratios = examResults.map(r => parseScoreRatio(r.score, exam.totalScore || 100)).filter(v => v != null);
      const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
      const cheatCount = examResults.filter(r => Number(r.cheatViolations) > 0).length;
      return {
        examId: exam.id,
        title: exam.title || exam.id,
        attempts: examResults.length,
        avgPercent: avg != null ? Math.round(avg * 1000) / 10 : null,
        cheatRate: examResults.length ? Math.round((cheatCount / examResults.length) * 1000) / 10 : 0
      };
    }).filter(e => e.attempts > 0).sort((a, b) => b.attempts - a.attempts);

    const questionMap = new Map();
    results.forEach(res => {
      if (!res.questionScores || !res.studentAnswers) return;
      Object.keys(res.questionScores).forEach(qId => {
        if (!questionMap.has(qId)) questionMap.set(qId, { correct: 0, total: 0, titles: new Set() });
        const entry = questionMap.get(qId);
        entry.total += 1;
        const pts = Number(res.questionScores[qId]) || 0;
        if (pts > 0) entry.correct += 1;
        entry.titles.add(res.examTitle || "");
      });
    });

    const hardest = [...questionMap.entries()]
      .map(([qId, data]) => ({
        qId,
        exams: [...data.titles].filter(Boolean).slice(0, 2).join(" · "),
        successRate: data.total ? Math.round((data.correct / data.total) * 1000) / 10 : 0,
        attempts: data.total
      }))
      .filter(q => q.attempts >= 3)
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 8);

    const totalActive = allResults.filter(r => !isSupersededResult(r)).length;
    const cheatResults = allResults.filter(r => Number(r.cheatViolations) > 0).length;
    const platformCheatRate = totalActive ? Math.round((cheatResults / totalActive) * 1000) / 10 : 0;

    return { examStats, hardest, platformCheatRate, completedCount: results.length };
  }

  function renderTeacherAnalyticsPanel(state, helpers) {
    const container = document.getElementById("teacher-stats-analytics");
    if (!container) return;
    const data = computeTeacherAnalytics(state, helpers);
    const esc = helpers.escapeHtml || (t => String(t || ""));

    let examHtml = "";
    if (!data.examStats.length) {
      examHtml = `<div style="color:var(--text-muted); font-size:0.9rem;">لا توجد نتائج مكتملة لحساب المتوسطات بعد.</div>`;
    } else {
      examHtml = `<div class="table-container table-container--compact" tabindex="0"><table><thead><tr><th>الامتحان</th><th>محاولات</th><th>متوسط %</th><th>معدل غش %</th></tr></thead><tbody>` +
        data.examStats.map(row =>
          `<tr><td>${esc(row.title)}</td><td>${row.attempts}</td><td>${row.avgPercent != null ? row.avgPercent + "%" : "—"}</td><td>${row.cheatRate}%</td></tr>`
        ).join("") +
        `</tbody></table></div>`;
    }

    let hardHtml = "";
    if (!data.hardest.length) {
      hardHtml = `<div style="color:var(--text-muted); font-size:0.9rem;">تحتاج 3+ إجابات لكل سؤال لإظهار الأصعب.</div>`;
    } else {
      hardHtml = `<ul style="margin:0; padding-right:1.1rem; font-size:0.9rem;">` +
        data.hardest.map(q =>
          `<li style="margin-bottom:0.35rem;"><strong>سؤال #${esc(q.qId)}</strong> — نجاح ${q.successRate}% (${q.attempts} محاولة) <span style="color:var(--text-muted);">${esc(q.exams)}</span></li>`
        ).join("") +
        `</ul>`;
    }

    container.innerHTML =
      `<div class="teacher-stats-two-col">` +
      `<div class="exam-builder-card teacher-stats-card"><h4 class="teacher-stats-card-title">متوسط الدرجات لكل امتحان</h4>${examHtml}</div>` +
      `<div class="exam-builder-card teacher-stats-card"><h4 class="teacher-stats-card-title">أصعب الأسئلة (أقل نجاح)</h4>${hardHtml}</div>` +
      `</div>` +
      `<div style="margin-top:0.75rem; font-size:0.9rem; color:var(--text-muted);">معدل مخالفات الغش على المنصة (لحسابك): <strong style="color:var(--error);">${data.platformCheatRate}%</strong> من ${data.completedCount} نتيجة مكتملة.</div>`;
  }

  function exportAnalyticsCsv(state, helpers) {
    const data = computeTeacherAnalytics(state, helpers);
    const rows = [["exam", "attempts", "avg_percent", "cheat_rate_percent"]];
    data.examStats.forEach(r => rows.push([r.title, r.attempts, r.avgPercent ?? "", r.cheatRate]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `تحليلات_arabya_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  global.ArabyaAnalytics = {
    computeTeacherAnalytics,
    renderTeacherAnalyticsPanel,
    exportAnalyticsCsv
  };

  global.exportTeacherAnalyticsCsv = function () {
    if (!global.systemState || !global.ArabyaAnalytics) return;
    global.ArabyaAnalytics.exportAnalyticsCsv(global.systemState, global.getTeacherAnalyticsHelpers());
  };
})(window);
