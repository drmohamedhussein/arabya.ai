#!/usr/bin/env python3
from pathlib import Path

js_path = Path('/workspace/app.js')
text = js_path.read_text(encoding='utf-8')

helpers = r'''
function normalizeTimestampText(value) {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
  return String(value || "")
    .replace(/[٠-٩]/g, ch => String(arabicIndic.indexOf(ch)))
    .replace(/[۰-۹]/g, ch => String(easternArabic.indexOf(ch)))
    .trim();
}

function getResultSortTime(res, fallbackIndex = 0) {
  const parsed = parseResultTimestamp(res?.timestamp);
  if (parsed) return parsed.getTime();
  const recordId = String(res?.recordId || "");
  const match = recordId.match(/(?:result|incomplete|record)_(\d{10,})_/i);
  if (match) return parseInt(match[1], 10);
  if (Number.isFinite(res?.savedAt)) return res.savedAt;
  return fallbackIndex;
}

function compareResultsByRecency(a, b, indexMap) {
  const ta = getResultSortTime(a, indexMap.get(a) ?? 0);
  const tb = getResultSortTime(b, indexMap.get(b) ?? 0);
  if (tb !== ta) return tb - ta;
  return (indexMap.get(b) ?? 0) - (indexMap.get(a) ?? 0);
}

function refreshTeacherDashboardViews(options = {}) {
  const refreshAll = !!options.all;
  if (typeof reloadSystemStateFromLocalStorage === "function") {
    reloadSystemStateFromLocalStorage();
  }
  const statsTab = document.getElementById("teacher-tab-stats");
  const resultsTab = document.getElementById("teacher-tab-results");
  const studentsTab = document.getElementById("teacher-tab-students");
  const examsTab = document.getElementById("teacher-tab-exams");

  if (refreshAll || (statsTab && !statsTab.classList.contains("hidden"))) {
    if (typeof renderTeacherStatsDashboard === "function") renderTeacherStatsDashboard();
  }
  if (refreshAll || (resultsTab && !resultsTab.classList.contains("hidden"))) {
    if (typeof renderStudentResultsTable === "function") renderStudentResultsTable();
  }
  if (refreshAll || (studentsTab && !studentsTab.classList.contains("hidden"))) {
    if (typeof renderTeacherStudentsTable === "function") renderTeacherStudentsTable();
  }
  if (refreshAll || (examsTab && !examsTab.classList.contains("hidden"))) {
    if (typeof renderExamsList === "function") renderExamsList();
  }
}

window.refreshTeacherDashboardViews = refreshTeacherDashboardViews;
'''

if 'function refreshTeacherDashboardViews' not in text:
    anchor = 'function reloadSystemStateFromLocalStorage() {'
    if anchor not in text:
        raise SystemExit('reload anchor missing')
    text = text.replace(anchor, helpers + '\n' + anchor, 1)

parse_old = '''function parseResultTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}'''

parse_new = '''function parseResultTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = normalizeTimestampText(raw);
  let parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const dateMatch = normalized.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    let year = parseInt(dateMatch[3], 10);
    if (year < 100) year += 2000;
    const dt = new Date(year, month, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}'''

if parse_old in text:
    text = text.replace(parse_old, parse_new, 1)
else:
    raise SystemExit('parseResultTimestamp block missing')

recent_old = '''  const recentResults = [...results]
    .sort((a, b) => {
      const da = parseResultTimestamp(a.timestamp);
      const db = parseResultTimestamp(b.timestamp);
      if (da && db) return db - da;
      return String(b.timestamp || "").localeCompare(String(a.timestamp || ""), "ar");
    })
    .slice(0, 8);'''

recent_new = '''  const resultIndexMap = new Map();
  results.forEach((res, index) => resultIndexMap.set(res, index));
  const recentResults = [...results]
    .sort((a, b) => compareResultsByRecency(a, b, resultIndexMap))
    .slice(0, 8);'''

if recent_old in text:
    text = text.replace(recent_old, recent_new, 1)
else:
    raise SystemExit('recentResults block missing')

pull_old = '''  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (typeof renderTeacherStatsDashboard === "function") {
    renderTeacherStatsDashboard();
  }
  if (el) {'''

pull_new = '''  refreshTeacherDashboardViews({ all: true });
  if (el) {'''

if pull_new not in text:
    text = text.replace(pull_old, pull_new, 1)

sync_render_old = '''        if (!silent) {
          renderStudentResultsTable();
          renderTeacherStudentsTable();
          renderExamsList();
        }'''
sync_render_new = '''        if (!silent) {
          refreshTeacherDashboardViews({ all: true });
        }'''
if sync_render_new not in text:
    text = text.replace(sync_render_old, sync_render_new, 1)

live_old = '''    const resultsTab = document.getElementById("teacher-tab-results");
    const studentsTab = document.getElementById("teacher-tab-students");
    if (resultsTab && !resultsTab.classList.contains("hidden")) renderStudentResultsTable();
    if (studentsTab && !studentsTab.classList.contains("hidden")) renderTeacherStudentsTable();
  };'''
live_new = '''    refreshTeacherDashboardViews();
  };'''
if live_new not in text:
    text = text.replace(live_old, live_new, 1)

students_pull_old = '''  renderTeacherStudentsTable();
  return ok;
};

function renderTeacherStudentsTable() {'''
students_pull_new = '''  refreshTeacherDashboardViews({ all: true });
  return ok;
};

function renderTeacherStudentsTable() {'''
if students_pull_new not in text:
    text = text.replace(students_pull_old, students_pull_new, 1)

tab_students_old = '''      } else if (tabId === "students") {
        syncDatabaseFromCloud({ silent: true }).finally(() => renderTeacherStudentsTable());'''
tab_students_new = '''      } else if (tabId === "students") {
        syncDatabaseFromCloud({ silent: true }).finally(() => refreshTeacherDashboardViews({ all: true }));'''
if tab_students_new not in text:
    text = text.replace(tab_students_old, tab_students_new, 1)

refresh_stats_old = '''    renderTeacherStatsDashboard();
    if (options.silent) return true;'''
refresh_stats_new = '''    refreshTeacherDashboardViews({ all: true });
    if (options.silent) return true;'''
if refresh_stats_new not in text:
    text = text.replace(refresh_stats_old, refresh_stats_new, 1)

sync_stats_old = '''    renderTeacherStatsDashboard();
    if (ok) {'''
sync_stats_new = '''    refreshTeacherDashboardViews({ all: true });
    if (ok) {'''
if sync_stats_new not in text:
    text = text.replace(sync_stats_old, sync_stats_new, 1)

load_sync_old = '''  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced) {
      renderTeacherStatsDashboard();
      renderStudentResultsTable();
      renderTeacherStudentsTable();
      renderExamsList();
    }
  });'''
load_sync_new = '''  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced && synced.ok) {
      refreshTeacherDashboardViews({ all: true });
    }
  });'''
if load_sync_new not in text:
    text = text.replace(load_sync_old, load_sync_new, 1)

# Add savedAt on new result records for reliable sorting going forward
for needle, insert in [
    ('recordId: createRecordId("result"),\n    name:', 'recordId: createRecordId("result"),\n    savedAt: Date.now(),\n    name:'),
    ('recordId: createRecordId("incomplete"),', 'recordId: createRecordId("incomplete"),\n      savedAt: Date.now(),'),
]:
    if needle.replace('savedAt: Date.now(),\n    ', '').replace('savedAt: Date.now(),\n      ', '') == needle:
        pass
    if 'savedAt: Date.now()' not in text.split(needle)[1][:120] if needle in text else True:
        if needle in text and needle.replace('recordId', 'savedAt') not in text:
            text = text.replace(needle, insert, 1)

text = text.replace('const ARABYA_APP_VERSION = "2026.05.31.3";', 'const ARABYA_APP_VERSION = "2026.05.31.4";', 1)
js_path.write_text(text, encoding='utf-8')

html_path = Path('/workspace/index.html')
html = html_path.read_text(encoding='utf-8').replace('2026.05.31.3', '2026.05.31.4')
html_path.write_text(html, encoding='utf-8')
print('patched recent results + sync refresh')
