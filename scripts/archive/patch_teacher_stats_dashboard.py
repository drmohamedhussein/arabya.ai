#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/workspace')
html_path = ROOT / 'index.html'
js_path = ROOT / 'app.js'
css_path = ROOT / 'style.css'
questions_path = ROOT / 'questions.js'

html = html_path.read_text(encoding='utf-8')

menu_old = '''          <ul class="teacher-menu" role="tablist" aria-label="خيارات المعلم الجانبية">
            <li class="teacher-menu-item active" data-tab="exams" role="tab" aria-selected="true">
              <span class="material-icons" aria-hidden="true">assignment</span> الامتحانات والأسئلة
            </li>'''

menu_new = '''          <ul class="teacher-menu" role="tablist" aria-label="خيارات المعلم الجانبية">
            <li class="teacher-menu-item active" data-tab="stats" role="tab" aria-selected="true">
              <span class="material-icons" aria-hidden="true">insights</span> الإحصائيات
            </li>
            <li class="teacher-menu-item" data-tab="exams" role="tab" aria-selected="false">
              <span class="material-icons" aria-hidden="true">assignment</span> الامتحانات والأسئلة
            </li>'''

stats_panel = '''
          <!-- تبويب الإحصائيات -->
          <div id="teacher-tab-stats" class="teacher-tab-panel" role="tabpanel">
            <div class="panel-header">
              <div>
                <div class="panel-title">لوحة الإحصائيات</div>
                <div style="font-size:0.85rem; color:var(--text-muted);">ملخص فوري للامتحانات والطلاب والنتائج — انقر على أي بطاقة للانتقال للتفاصيل</div>
              </div>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <button type="button" id="teacher-stats-refresh-btn" class="btn btn-outline btn-sm">
                  <span class="material-icons" style="font-size:1.1rem;vertical-align:middle;" aria-hidden="true">refresh</span> تحديث
                </button>
                <button type="button" id="teacher-stats-sync-btn" class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary);">
                  <span class="material-icons" style="font-size:1.1rem;vertical-align:middle;" aria-hidden="true">cloud_sync</span> مزامنة
                </button>
              </div>
            </div>
            <div id="teacher-stats-updated-at" style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem;"></div>
            <div id="teacher-stats-overview" class="profile-summary-grid" aria-live="polite"></div>
            <div id="teacher-stats-status-grid" class="profile-summary-grid teacher-stats-status-grid"></div>
            <div class="teacher-stats-two-col">
              <div class="exam-builder-card teacher-stats-card">
                <h4 class="teacher-stats-card-title teacher-stats-card-title--secondary">أكثر الامتحانات نشاطاً</h4>
                <div id="teacher-stats-top-exams"></div>
              </div>
              <div class="exam-builder-card teacher-stats-card">
                <h4 class="teacher-stats-card-title teacher-stats-card-title--accent">آخر النتائج المسجلة</h4>
                <div id="teacher-stats-recent-results"></div>
              </div>
            </div>
            <div class="exam-builder-card teacher-stats-card teacher-stats-card--wide">
              <h4 class="teacher-stats-card-title">ملخص الطلاب</h4>
              <div id="teacher-stats-students-summary" class="profile-summary-grid"></div>
            </div>
          </div>

'''

if 'teacher-tab-stats' not in html:
    if menu_old not in html:
        raise SystemExit('menu anchor not found')
    html = html.replace(menu_old, menu_new, 1)
    exams_panel_old = '          <div id="teacher-tab-exams" class="teacher-tab-panel" role="tabpanel">'
    exams_panel_new = '          <div id="teacher-tab-exams" class="teacher-tab-panel hidden" role="tabpanel">'
    if exams_panel_old not in html:
        raise SystemExit('exams panel anchor not found')
    html = html.replace(exams_panel_old, stats_panel + exams_panel_new, 1)
    html_path.write_text(html, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
css_block = '''
.teacher-stats-status-grid {
  margin-top: 1rem;
}

.teacher-stats-two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.teacher-stats-card {
  padding: 1.25rem;
}

.teacher-stats-card--wide {
  margin-top: 1rem;
}

.teacher-stats-card-title {
  color: white;
  margin-bottom: 0.75rem;
  font-weight: 700;
}

.teacher-stats-card-title--secondary {
  color: var(--secondary);
}

.teacher-stats-card-title--accent {
  color: var(--accent);
}

.teacher-stats-clickable {
  cursor: pointer;
  transition: var(--transition-smooth);
}

.teacher-stats-clickable:hover {
  transform: translateY(-2px);
  border-color: rgba(20, 184, 166, 0.35);
}

.teacher-stats-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 0.9rem;
}

.teacher-stats-list-item:last-child {
  border-bottom: none;
}

.teacher-stats-bar-row {
  margin-bottom: 0.85rem;
}

.teacher-stats-bar-label {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}

.teacher-stats-bar-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.teacher-stats-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--secondary), var(--accent));
}
'''
if '.teacher-stats-status-grid' not in css:
    css_path.write_text(css.rstrip() + css_block, encoding='utf-8')

questions = questions_path.read_text(encoding='utf-8')
questions_old = '  if (!menu || !panelHost || document.getElementById("teacher-tab-dashboard")) return;'
questions_new = '  if (!menu || !panelHost || document.getElementById("teacher-tab-dashboard") || document.getElementById("teacher-tab-stats")) return;'
if questions_old in questions:
    questions_path.write_text(questions.replace(questions_old, questions_new, 1), encoding='utf-8')

text = js_path.read_text(encoding='utf-8')

stats_js = r'''
function getTeacherScopedExams() {
  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  return (systemState.exams || []).filter(exam => !exam.teacher || exam.teacher === activeUsername);
}

function getTeacherScopedResults() {
  const examIds = new Set(getTeacherScopedExams().map(exam => String(exam.id)));
  return (systemState.results || []).filter(res => {
    if (!res.examId) return true;
    if (!examIds.size) return true;
    return examIds.has(String(res.examId));
  });
}

function computeTeacherStatsSnapshot() {
  const exams = getTeacherScopedExams();
  const students = systemState.students || [];
  const results = getTeacherScopedResults();
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0 };
  const periodCounts = { today: 0, week: 0, month: 0 };
  const examCounts = new Map();

  results.forEach(res => {
    const status = getResultDisplayStatus(res);
    if (statusCounts[status] !== undefined) statusCounts[status] += 1;
    if (resultMatchesDateFilter(res, "today")) periodCounts.today += 1;
    if (resultMatchesDateFilter(res, "week")) periodCounts.week += 1;
    if (resultMatchesDateFilter(res, "month")) periodCounts.month += 1;
    const examKey = String(res.examId || res.examTitle || "unknown");
    examCounts.set(examKey, (examCounts.get(examKey) || 0) + 1);
  });

  let studentsWithResults = 0;
  let studentsWithoutResults = 0;
  let studentsMultiExams = 0;
  let studentsCanceled = 0;
  students.forEach(student => {
    const count = countStudentResults(student);
    if (count > 0) studentsWithResults += 1;
    else studentsWithoutResults += 1;
    if (count > 1) studentsMultiExams += 1;
    const studentKey = student.studentKey || getStudentLookupKey(student);
    if (getStudentCanceledExamIds(studentKey).length > 0) studentsCanceled += 1;
  });

  const topExams = [...examCounts.entries()]
    .map(([key, count]) => {
      const exam = exams.find(item => String(item.id) === key);
      return {
        key,
        label: exam?.title || results.find(r => String(r.examId || r.examTitle) === key)?.examTitle || key,
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recentResults = [...results]
    .sort((a, b) => {
      const da = parseResultTimestamp(a.timestamp);
      const db = parseResultTimestamp(b.timestamp);
      if (da && db) return db - da;
      return String(b.timestamp || "").localeCompare(String(a.timestamp || ""), "ar");
    })
    .slice(0, 8);

  const urls = typeof getArabyaWebAppUrls === "function" ? getArabyaWebAppUrls() : [];
  return {
    examsCount: exams.length,
    studentsCount: students.length,
    resultsCount: results.length,
    statusCounts,
    periodCounts,
    studentsWithResults,
    studentsWithoutResults,
    studentsMultiExams,
    studentsCanceled,
    topExams,
    recentResults,
    cloudConnected: urls.length > 0
  };
}

function openTeacherDashboardTab(tabId, afterOpen) {
  const menuItem = document.querySelector(`.teacher-menu-item[data-tab="${tabId}"]`);
  if (menuItem) menuItem.click();
  if (typeof afterOpen === "function") {
    setTimeout(afterOpen, 40);
  }
}

function applyTeacherResultsQuickView(options = {}) {
  const view = getResultsTableViewSettings();
  view.statusFilter = options.statusFilter || "all";
  view.examFilter = options.examFilter || "";
  view.dateFilter = options.dateFilter || "all";
  view.page = 1;
  persistResultsTableFilters();
  syncResultsFilterControlsUI();
  renderStudentResultsTable();
}

function applyTeacherStudentsQuickView(quickFilter = "all") {
  const view = getStudentsTableViewSettings();
  view.quickFilter = quickFilter || "all";
  view.page = 1;
  persistStudentsTableFilters();
  syncStudentsFilterControlsUI();
  renderTeacherStudentsTable();
}

window.openTeacherStatsResultsView = function(options) {
  openTeacherDashboardTab("results", () => applyTeacherResultsQuickView(options || {}));
};

window.openTeacherStatsStudentsView = function(quickFilter) {
  openTeacherDashboardTab("students", () => applyTeacherStudentsQuickView(quickFilter || "all"));
};

function renderTeacherStatsStatCard(label, value, options = {}) {
  const clickable = options.onClick ? " teacher-stats-clickable" : "";
  const tone = options.tone ? ` style="border-color:${options.tone};"` : "";
  const valueStyle = options.valueColor ? ` style="color:${options.valueColor};"` : "";
  return `<div class="profile-stat-card${clickable}" data-stat-action="${escapeHtml(options.action || "")}"${tone}>` +
    `<div class="profile-stat-label">${escapeHtml(label)}</div>` +
    `<div class="profile-stat-value"${valueStyle}>${escapeHtml(String(value))}</div>` +
    (options.hint ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">${escapeHtml(options.hint)}</div>` : "") +
    `</div>`;
}

function renderTeacherStatsBar(label, value, maxValue) {
  const safeMax = Math.max(maxValue, 1);
  const width = Math.max(4, Math.round((value / safeMax) * 100));
  return `<div class="teacher-stats-bar-row">` +
    `<div class="teacher-stats-bar-label"><span>${escapeHtml(label)}</span><span>${value}</span></div>` +
    `<div class="teacher-stats-bar-track"><div class="teacher-stats-bar-fill" style="width:${width}%;"></div></div>` +
    `</div>`;
}

function bindTeacherStatsCardActions(container, actions) {
  if (!container) return;
  container.querySelectorAll("[data-stat-action]").forEach(card => {
    const action = card.dataset.statAction;
    if (!action || !actions[action]) return;
    card.addEventListener("click", actions[action]);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        actions[action]();
      }
    });
  });
}

function setupTeacherStatsControls() {
  const refreshBtn = document.getElementById("teacher-stats-refresh-btn");
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", renderTeacherStatsDashboard);
  }
  const syncBtn = document.getElementById("teacher-stats-sync-btn");
  if (syncBtn && !syncBtn.dataset.bound) {
    syncBtn.dataset.bound = "1";
    syncBtn.addEventListener("click", async () => {
      syncBtn.disabled = true;
      try {
        if (typeof pullTeacherResultsFromCloud === "function") {
          await pullTeacherResultsFromCloud();
        }
      } finally {
        syncBtn.disabled = false;
        renderTeacherStatsDashboard();
      }
    });
  }
}

function renderTeacherStatsDashboard() {
  const overview = document.getElementById("teacher-stats-overview");
  if (!overview) return;
  setupTeacherStatsControls();

  const stats = computeTeacherStatsSnapshot();
  const updatedEl = document.getElementById("teacher-stats-updated-at");
  if (updatedEl) {
    updatedEl.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}`;
  }

  const cardActions = {
    "results-all": () => openTeacherStatsResultsView({}),
    "results-today": () => openTeacherStatsResultsView({ dateFilter: "today" }),
    "results-week": () => openTeacherStatsResultsView({ dateFilter: "week" }),
    "results-month": () => openTeacherStatsResultsView({ dateFilter: "month" }),
    "results-completed": () => openTeacherStatsResultsView({ statusFilter: "completed" }),
    "results-incomplete": () => openTeacherStatsResultsView({ statusFilter: "incomplete" }),
    "results-canceled": () => openTeacherStatsResultsView({ statusFilter: "canceled" }),
    "students-all": () => openTeacherStatsStudentsView("all"),
    "students-has-results": () => openTeacherStatsStudentsView("has_results"),
    "students-no-results": () => openTeacherStatsStudentsView("no_results"),
    "students-multi": () => openTeacherStatsStudentsView("multi_exams"),
    "students-canceled": () => openTeacherStatsStudentsView("canceled"),
    "tab-exams": () => openTeacherDashboardTab("exams"),
    "tab-integration": () => openTeacherDashboardTab("integration")
  };

  overview.innerHTML =
    renderTeacherStatsStatCard("الامتحانات", stats.examsCount, { action: "tab-exams", onClick: true, hint: "عرض قائمة الامتحانات" }) +
    renderTeacherStatsStatCard("الطلاب المسجلون", stats.studentsCount, { action: "students-all", onClick: true, hint: "فتح تبويب الطلاب" }) +
    renderTeacherStatsStatCard("إجمالي النتائج", stats.resultsCount, { action: "results-all", onClick: true, hint: "فتح سجل النتائج" }) +
    renderTeacherStatsStatCard("نتائج اليوم", stats.periodCounts.today, { action: "results-today", onClick: true, valueColor: "var(--secondary)" }) +
    renderTeacherStatsStatCard("Google Sheets", stats.cloudConnected ? "متصل" : "غير متصل", {
      action: "tab-integration",
      onClick: true,
      valueColor: stats.cloudConnected ? "var(--secondary)" : "var(--warning)",
      hint: stats.cloudConnected ? "المزامنة السحابية مهيأة" : "اربط Google Sheets"
    });
  bindTeacherStatsCardActions(overview, cardActions);

  const statusGrid = document.getElementById("teacher-stats-status-grid");
  if (statusGrid) {
    const maxStatus = Math.max(stats.statusCounts.completed, stats.statusCounts.incomplete, stats.statusCounts.canceled, 1);
    statusGrid.innerHTML =
      renderTeacherStatsStatCard("مكتمل", stats.statusCounts.completed, { action: "results-completed", onClick: true, valueColor: "var(--secondary)" }) +
      renderTeacherStatsStatCard("جاري", stats.statusCounts.incomplete, { action: "results-incomplete", onClick: true, valueColor: "var(--warning)" }) +
      renderTeacherStatsStatCard("ملغى", stats.statusCounts.canceled, { action: "results-canceled", onClick: true, valueColor: "var(--error)" }) +
      `<div class="profile-stat-card"><div class="profile-stat-label">النشاط الزمني</div>` +
      renderTeacherStatsBar("آخر 7 أيام", stats.periodCounts.week, stats.resultsCount) +
      renderTeacherStatsBar("آخر 30 يوماً", stats.periodCounts.month, stats.resultsCount) +
      `</div>`;
    bindTeacherStatsCardActions(statusGrid, cardActions);
  }

  const topExamsEl = document.getElementById("teacher-stats-top-exams");
  if (topExamsEl) {
    if (!stats.topExams.length) {
      topExamsEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">لا توجد نتائج مسجلة بعد.</div>`;
    } else {
      topExamsEl.innerHTML = stats.topExams.map(item => {
        const pct = stats.resultsCount ? Math.round((item.count / stats.resultsCount) * 100) : 0;
        return `<button type="button" class="teacher-stats-list-item" style="width:100%; background:none; border:none; color:inherit; text-align:right; cursor:pointer;" data-exam-key="${escapeHtml(item.key)}">` +
          `<span>${escapeHtml(item.label)}</span>` +
          `<span style="color:var(--secondary); font-weight:700;">${item.count} <small style="color:var(--text-muted);">(${pct}%)</small></span>` +
          `</button>`;
      }).join("");
      topExamsEl.querySelectorAll("[data-exam-key]").forEach(btn => {
        btn.addEventListener("click", () => {
          openTeacherStatsResultsView({ examFilter: btn.dataset.examKey || "" });
        });
      });
    }
  }

  const recentEl = document.getElementById("teacher-stats-recent-results");
  if (recentEl) {
    if (!stats.recentResults.length) {
      recentEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">لا توجد نتائج حديثة.</div>`;
    } else {
      recentEl.innerHTML = stats.recentResults.map(res => {
        const status = getResultDisplayStatus(res);
        const statusColor = status === "canceled" ? "var(--error)" : status === "incomplete" ? "var(--warning)" : "var(--secondary)";
        return `<div class="teacher-stats-list-item">` +
          `<div><div style="font-weight:700;">${escapeHtml(res.name || "طالب")}</div>` +
          `<div style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(res.examTitle || "امتحان")} • ${escapeHtml(res.timestamp || "")}</div></div>` +
          `<span style="color:${statusColor}; font-weight:800;">${escapeHtml(res.score || "--")}</span>` +
          `</div>`;
      }).join("");
    }
  }

  const studentsSummary = document.getElementById("teacher-stats-students-summary");
  if (studentsSummary) {
    studentsSummary.innerHTML =
      renderTeacherStatsStatCard("لديهم نتائج", stats.studentsWithResults, { action: "students-has-results", onClick: true, valueColor: "var(--secondary)" }) +
      renderTeacherStatsStatCard("بدون نتائج", stats.studentsWithoutResults, { action: "students-no-results", onClick: true, valueColor: "var(--warning)" }) +
      renderTeacherStatsStatCard("أكثر من امتحان", stats.studentsMultiExams, { action: "students-multi", onClick: true }) +
      renderTeacherStatsStatCard("امتحان ملغى", stats.studentsCanceled, { action: "students-canceled", onClick: true, valueColor: "var(--error)" });
    bindTeacherStatsCardActions(studentsSummary, cardActions);
  }
}

window.renderTeacherStatsDashboard = renderTeacherStatsDashboard;
'''

anchor = 'function loadTeacherDashboardData() {'
if 'function renderTeacherStatsDashboard()' not in text:
    if anchor not in text:
        raise SystemExit('loadTeacherDashboardData anchor not found')
    text = text.replace(anchor, stats_js + '\n' + anchor, 1)

load_old = '''  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();
}'''
load_new = '''  renderTeacherStatsDashboard();
  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();
}'''
if load_old in text:
    text = text.replace(load_old, load_new, 1)

menu_handler_old = '''      document.getElementById(`teacher-tab-${tabId}`).classList.remove("hidden");
    });
  });'''
menu_handler_new = '''      document.getElementById(`teacher-tab-${tabId}`).classList.remove("hidden");
      if (tabId === "stats") renderTeacherStatsDashboard();
      else if (tabId === "results") renderStudentResultsTable();
      else if (tabId === "students") renderTeacherStudentsTable();
      else if (tabId === "exams") renderExamsList();
    });
  });'''
if menu_handler_old in text:
    text = text.replace(menu_handler_old, menu_handler_new, 1)

text = text.replace('const ARABYA_APP_VERSION = "2026.05.31.1";', 'const ARABYA_APP_VERSION = "2026.05.31.2";', 1)

js_path.write_text(text, encoding='utf-8')

html = html_path.read_text(encoding='utf-8')
html = html.replace('questions.js?v=2026.05.31.1', 'questions.js?v=2026.05.31.2')
html = html.replace('app.js?v=2026.05.31.1', 'app.js?v=2026.05.31.2')
html_path.write_text(html, encoding='utf-8')

print('patched teacher stats dashboard')
