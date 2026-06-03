#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/workspace')
html_path = ROOT / 'index.html'
js_path = ROOT / 'app.js'

html = html_path.read_text(encoding='utf-8')
status_html = '''            <div id="teacher-stats-sync-status" style="margin:0.5rem 0 1rem; font-size:0.85rem; color:var(--text-muted); min-height:1.25rem;" aria-live="polite"></div>
            <div id="teacher-stats-updated-at"'''
if 'teacher-stats-sync-status' not in html:
    html = html.replace(
        '            <div id="teacher-stats-updated-at"',
        status_html,
        1
    )
    html_path.write_text(html, encoding='utf-8')

text = js_path.read_text(encoding='utf-8')

status_helper = r'''
function updateTeacherStatsSyncStatus(message, tone = "muted") {
  const el = document.getElementById("teacher-stats-sync-status");
  if (!el) return;
  const colors = {
    muted: "var(--text-muted)",
    loading: "var(--secondary)",
    success: "var(--success)",
    error: "var(--error)",
    warning: "var(--warning)"
  };
  el.style.color = colors[tone] || colors.muted;
  el.innerHTML = message || "";
}

async function refreshTeacherStatsDashboard(options = {}) {
  const refreshBtn = document.getElementById("teacher-stats-refresh-btn");
  if (refreshBtn) refreshBtn.disabled = true;
  updateTeacherStatsSyncStatus(
    `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">refresh</span> جاري تحديث الإحصائيات...`,
    "loading"
  );
  try {
    if (typeof reloadSystemStateFromLocalStorage === "function") {
      reloadSystemStateFromLocalStorage();
    }
    renderTeacherStatsDashboard();
    if (options.silent) return true;
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--success);">check_circle</span> تم تحديث الإحصائيات من البيانات المحلية (${systemState.results.length} نتيجة · ${systemState.students.length} طالب)`,
      "success"
    );
    return true;
  } catch (err) {
    console.error("refreshTeacherStatsDashboard:", err);
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--error);">error</span> تعذّر تحديث الإحصائيات. راجع Console للتفاصيل.`,
      "error"
    );
    return false;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function syncTeacherStatsFromCloud() {
  const syncBtn = document.getElementById("teacher-stats-sync-btn");
  const urls = typeof getArabyaWebAppUrls === "function" ? getArabyaWebAppUrls() : [];
  if (!urls.length) {
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--warning);">link_off</span> لم يتم ربط Google Sheets بعد. اذهب إلى تبويب «الربط بـ Google Sheets» وأدخل رابط /exec.`,
      "warning"
    );
    return false;
  }
  if (syncBtn) syncBtn.disabled = true;
  updateTeacherStatsSyncStatus(
    `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">cloud_sync</span> جاري المزامنة من Google Sheets...`,
    "loading"
  );
  try {
    let ok = false;
    if (typeof pullTeacherResultsFromCloud === "function") {
      ok = await pullTeacherResultsFromCloud();
    } else if (typeof syncDatabaseFromCloud === "function") {
      const result = await syncDatabaseFromCloud({ silent: false });
      ok = !!(result && result.ok);
    }
    if (typeof reloadSystemStateFromLocalStorage === "function") {
      reloadSystemStateFromLocalStorage();
    }
    renderTeacherStatsDashboard();
    if (ok) {
      updateTeacherStatsSyncStatus(
        `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تمت المزامنة: ${systemState.results.length} نتيجة · ${systemState.students.length} طالب`,
        "success"
      );
    } else {
      updateTeacherStatsSyncStatus(
        `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> تعذّرت المزامنة. تأكد من رابط /exec ونشر Apps Script كإصدار جديد (Anyone).`,
        "error"
      );
    }
    return ok;
  } catch (err) {
    console.error("syncTeacherStatsFromCloud:", err);
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> خطأ أثناء المزامنة: ${escapeHtml(err.message || "خطأ غير معروف")}`,
      "error"
    );
    return false;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

'''

old_setup = r'''function setupTeacherStatsControls() {
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
}'''

new_setup = r'''function setupTeacherStatsControls() {
  const refreshBtn = document.getElementById("teacher-stats-refresh-btn");
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", () => refreshTeacherStatsDashboard());
  }
  const syncBtn = document.getElementById("teacher-stats-sync-btn");
  if (syncBtn && !syncBtn.dataset.bound) {
    syncBtn.dataset.bound = "1";
    syncBtn.addEventListener("click", () => syncTeacherStatsFromCloud());
  }
}'''

if 'function updateTeacherStatsSyncStatus' not in text:
    anchor = 'function setupTeacherStatsControls() {'
    if anchor not in text:
        raise SystemExit('setupTeacherStatsControls not found')
    text = text.replace(anchor, status_helper + anchor, 1)

if old_setup in text:
    text = text.replace(old_setup, new_setup, 1)
else:
    raise SystemExit('old setupTeacherStatsControls block not found')

pull_old = '''  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (el) {
    if (syncResult.ok) {'''
pull_new = '''  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (typeof renderTeacherStatsDashboard === "function") {
    renderTeacherStatsDashboard();
  }
  if (el) {
    if (syncResult.ok) {'''
if pull_new not in text:
    text = text.replace(pull_old, pull_new, 1)

ui_anchor = '''  const exportResultsBtn = document.getElementById("teacher-export-results-btn");
  if (exportResultsBtn) {
    exportResultsBtn.addEventListener("click", exportTeacherResultsToCSV);
  }'''
ui_insert = '''  setupTeacherStatsControls();

  const exportResultsBtn = document.getElementById("teacher-export-results-btn");
  if (exportResultsBtn) {
    exportResultsBtn.addEventListener("click", exportTeacherResultsToCSV);
  }'''
if 'setupTeacherStatsControls();\n\n  const exportResultsBtn' not in text:
    if ui_anchor not in text:
        raise SystemExit('exportResultsBtn anchor not found')
    text = text.replace(ui_anchor, ui_insert, 1)

render_old = '''function renderTeacherStatsDashboard() {
  const overview = document.getElementById("teacher-stats-overview");
  if (!overview) return;
  setupTeacherStatsControls();

  const stats = computeTeacherStatsSnapshot();'''
render_new = '''function renderTeacherStatsDashboard() {
  const overview = document.getElementById("teacher-stats-overview");
  if (!overview) return;

  const stats = computeTeacherStatsSnapshot();'''
if render_new not in text:
    text = text.replace(render_old, render_new, 1)

text = text.replace('const ARABYA_APP_VERSION = "2026.05.31.2";', 'const ARABYA_APP_VERSION = "2026.05.31.3";', 1)

js_path.write_text(text, encoding='utf-8')

html = html_path.read_text(encoding='utf-8')
html = html.replace('2026.05.31.2', '2026.05.31.3')
html_path.write_text(html, encoding='utf-8')

print('patched stats buttons fix')
