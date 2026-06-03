#!/usr/bin/env python3
"""Patch A/B/C/D: custom date range, column sort, attempts panel, mobile anti-cheat."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
INDEX = ROOT / "index.html"
STYLE = ROOT / "style.css"
VERSION = "2026.05.31.12"


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"MISSING anchor for {label}")
    return text.replace(old, new, 1)


def patch_app_js(text: str) -> str:
    text = must_replace(
        text,
        'const ARABYA_APP_VERSION = "2026.05.31.11";',
        f'const ARABYA_APP_VERSION = "{VERSION}";',
        "version",
    )

    if "function parseDateInputValue(" not in text:
        text = must_replace(
            text,
            "function parseResultTimestamp(value) {",
            """function parseDateInputValue(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const dt = new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return parseResultTimestamp(raw);
}

function resultMatchesCustomDateRange(res, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const dt = parseResultTimestamp(res.timestamp);
  if (!dt) return false;
  const fromDt = parseDateInputValue(dateFrom, false);
  const toDt = parseDateInputValue(dateTo, true);
  if (fromDt && dt < fromDt) return false;
  if (toDt && dt > toDt) return false;
  return true;
}

function parseResultTimestamp(value) {""",
            "date helpers",
        )

    text = must_replace(
        text,
        """function getResultsTableFilters() {
  const view = getResultsTableViewSettings();
  return {
    searchQuery: getResultsSearchQuery(),
    statusFilter: view.statusFilter || "all",
    examFilter: view.examFilter || "",
    dateFilter: view.dateFilter || "all"
  };
}""",
        """function getResultsTableFilters() {
  const view = getResultsTableViewSettings();
  return {
    searchQuery: getResultsSearchQuery(),
    statusFilter: view.statusFilter || "all",
    examFilter: view.examFilter || "",
    dateFilter: view.dateFilter || "all",
    dateFrom: view.dateFrom || "",
    dateTo: view.dateTo || ""
  };
}""",
        "getResultsTableFilters",
    )

    text = must_replace(
        text,
        """  if (filters.dateFilter !== "all") {
    list = list.filter(res => resultMatchesDateFilter(res, filters.dateFilter));
  }
  return list;
}""",
        """  if (filters.dateFrom || filters.dateTo) {
    list = list.filter(res => resultMatchesCustomDateRange(res, filters.dateFrom, filters.dateTo));
  } else if (filters.dateFilter !== "all") {
    list = list.filter(res => resultMatchesDateFilter(res, filters.dateFilter));
  }
  return list;
}""",
        "filterResultsForTeacherTable date",
    )

    text = must_replace(
        text,
        """    active.examFilter ||
    (active.dateFilter && active.dateFilter !== "all")
  );
}""",
        """    active.examFilter ||
    (active.dateFilter && active.dateFilter !== "all") ||
    active.dateFrom ||
    active.dateTo
  );
}""",
        "isResultsTableFiltersActive",
    )

    text = must_replace(
        text,
        """    localStorage.setItem("arabya_results_filters", JSON.stringify({
      statusFilter: view.statusFilter || "all",
      examFilter: view.examFilter || "",
      dateFilter: view.dateFilter || "all"
    }));""",
        """    localStorage.setItem("arabya_results_filters", JSON.stringify({
      statusFilter: view.statusFilter || "all",
      examFilter: view.examFilter || "",
      dateFilter: view.dateFilter || "all",
      dateFrom: view.dateFrom || "",
      dateTo: view.dateTo || ""
    }));""",
        "persistResultsTableFilters",
    )

    text = must_replace(
        text,
        """  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) dateSelect.value = view.dateFilter || "all";
}""",
        """  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) dateSelect.value = view.dateFilter || "all";
  const dateFromInput = document.getElementById("teacher-results-date-from");
  const dateToInput = document.getElementById("teacher-results-date-to");
  if (dateFromInput) dateFromInput.value = view.dateFrom || "";
  if (dateToInput) dateToInput.value = view.dateTo || "";
}""",
        "syncResultsFilterControlsUI",
    )

    text = must_replace(
        text,
        """  view.dateFilter = "all";
  view.page = 1;
  const searchInput = document.getElementById("teacher-results-search-input");""",
        """  view.dateFilter = "all";
  view.dateFrom = "";
  view.dateTo = "";
  view.page = 1;
  const searchInput = document.getElementById("teacher-results-search-input");""",
        "resetResultsTableFilters",
    )

    if "teacher-results-date-from" not in text.split("setupResultsTableFilterControls")[1][:4000]:
        text = must_replace(
            text,
            """  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      getResultsTableViewSettings().dateFilter = dateSelect.value || "all";
      getResultsTableViewSettings().page = 1;
      persistResultsTableFilters();
      renderStudentResultsTable();
    });
  }""",
            """  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      const view = getResultsTableViewSettings();
      view.dateFilter = dateSelect.value || "all";
      if (view.dateFilter !== "custom") {
        view.dateFrom = "";
        view.dateTo = "";
      }
      view.page = 1;
      persistResultsTableFilters();
      syncResultsFilterControlsUI();
      renderStudentResultsTable();
    });
  }

  const applyCustomDateRange = () => {
    const view = getResultsTableViewSettings();
    const fromInput = document.getElementById("teacher-results-date-from");
    const toInput = document.getElementById("teacher-results-date-to");
    view.dateFrom = fromInput ? fromInput.value : "";
    view.dateTo = toInput ? toInput.value : "";
    view.dateFilter = (view.dateFrom || view.dateTo) ? "custom" : (view.dateFilter === "custom" ? "all" : view.dateFilter);
    view.page = 1;
    persistResultsTableFilters();
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  };

  ["teacher-results-date-from", "teacher-results-date-to"].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.dataset.bound) {
      input.dataset.bound = "1";
      input.addEventListener("change", applyCustomDateRange);
    }
  });""",
            "setupResultsTableFilterControls dates",
        )

    text = must_replace(
        text,
        """      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_results_sort") || "newest");
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter, sortOrder };""",
        """      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
    } catch (e) {}
    let dateFrom = "";
    let dateTo = "";
    let columnSort = null;
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.dateFrom) dateFrom = savedFilters.dateFrom;
      if (savedFilters.dateTo) dateTo = savedFilters.dateTo;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_results_sort") || "newest");
    } catch (e) {}
    try {
      columnSort = JSON.parse(localStorage.getItem("arabya_results_column_sort") || "null");
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter, dateFrom, dateTo, sortOrder, columnSort };""",
        "getResultsTableViewSettings init",
    )

    if "function getStatsDateRangeSettings(" not in text:
        text = must_replace(
            text,
            "function computeTeacherStatsSnapshot() {",
            """function getStatsDateRangeSettings() {
  if (!systemState.statsDateRange) {
    let dateFrom = "";
    let dateTo = "";
    try {
      const saved = JSON.parse(localStorage.getItem("arabya_stats_date_range") || "{}");
      dateFrom = saved.dateFrom || "";
      dateTo = saved.dateTo || "";
    } catch (e) {}
    systemState.statsDateRange = { dateFrom, dateTo };
  }
  return systemState.statsDateRange;
}

function persistStatsDateRangeSettings() {
  const range = getStatsDateRangeSettings();
  try {
    localStorage.setItem("arabya_stats_date_range", JSON.stringify(range));
  } catch (e) {}
}

function syncStatsDateRangeControlsUI() {
  const range = getStatsDateRangeSettings();
  const fromInput = document.getElementById("teacher-stats-date-from");
  const toInput = document.getElementById("teacher-stats-date-to");
  if (fromInput) fromInput.value = range.dateFrom || "";
  if (toInput) toInput.value = range.dateTo || "";
}

function setupStatsDateRangeControls() {
  syncStatsDateRangeControlsUI();
  const applyBtn = document.getElementById("teacher-stats-apply-date-range");
  const clearBtn = document.getElementById("teacher-stats-clear-date-range");
  if (applyBtn && !applyBtn.dataset.bound) {
    applyBtn.dataset.bound = "1";
    applyBtn.addEventListener("click", () => {
      const range = getStatsDateRangeSettings();
      const fromInput = document.getElementById("teacher-stats-date-from");
      const toInput = document.getElementById("teacher-stats-date-to");
      range.dateFrom = fromInput ? fromInput.value : "";
      range.dateTo = toInput ? toInput.value : "";
      persistStatsDateRangeSettings();
      renderTeacherStatsDashboard();
    });
  }
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      const range = getStatsDateRangeSettings();
      range.dateFrom = "";
      range.dateTo = "";
      persistStatsDateRangeSettings();
      syncStatsDateRangeControlsUI();
      renderTeacherStatsDashboard();
    });
  }
}

function computeTeacherStatsSnapshot() {""",
            "stats date range",
        )

    text = must_replace(
        text,
        """  const results = getActiveResultsList(allResults);
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0, superseded: 0 };""",
        """  const statsRange = getStatsDateRangeSettings();
  let results = getActiveResultsList(allResults);
  if (statsRange.dateFrom || statsRange.dateTo) {
    results = results.filter(res => resultMatchesCustomDateRange(res, statsRange.dateFrom, statsRange.dateTo));
  }
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0, superseded: 0 };""",
        "computeTeacherStatsSnapshot filter",
    )

    text = must_replace(
        text,
        """function applyTeacherResultsQuickView(options = {}) {
  const view = getResultsTableViewSettings();
  view.statusFilter = options.statusFilter || "all";
  view.examFilter = options.examFilter || "";
  view.dateFilter = options.dateFilter || "all";
  view.page = 1;""",
        """function applyTeacherResultsQuickView(options = {}) {
  const view = getResultsTableViewSettings();
  view.statusFilter = options.statusFilter || "all";
  view.examFilter = options.examFilter || "";
  view.dateFilter = options.dateFilter || "all";
  view.dateFrom = options.dateFrom || "";
  view.dateTo = options.dateTo || "";
  view.page = 1;""",
        "applyTeacherResultsQuickView",
    )

    if "function compareResultsByColumn(" not in text:
        text = must_replace(
            text,
            "function sortResultsForDisplay(results, sortOrder, sourceList) {",
            """const RESULTS_TABLE_SORTABLE_COLUMNS = [
  { key: "name", label: "اسم الطالب" },
  { key: "id", label: "رقم ID" },
  { key: "accessCode", label: "كود الاشتراك" },
  { key: "examTitle", label: "الامتحان" },
  { key: "score", label: "النتيجة" },
  { key: "timestamp", label: "التاريخ والوقت" }
];

const STUDENTS_TABLE_SORTABLE_COLUMNS = [
  { key: "name", label: "اسم الطالب" },
  { key: "id", label: "رقم ID" },
  { key: "code", label: "كود الاشتراك" },
  { key: "email", label: "البريد" },
  { key: "mobile", label: "الموبايل" },
  { key: "timestamp", label: "تاريخ التسجيل" }
];

function normalizeColumnSortDirection(value) {
  return value === "asc" ? "asc" : "desc";
}

function getColumnSortValue(item, key, indexMap) {
  if (key === "timestamp") {
    return getResultSortTime(item, indexMap?.get?.(item) ?? 0);
  }
  if (key === "score") {
    const match = String(item.score || "").match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : -1;
  }
  return String(item[key] || "").toLocaleLowerCase("ar");
}

function compareResultsByColumn(a, b, key, dir, indexMap) {
  const av = getColumnSortValue(a, key, indexMap);
  const bv = getColumnSortValue(b, key, indexMap);
  let cmp = 0;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), "ar", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareStudentsByColumn(a, b, key, dir, indexMap) {
  if (key === "timestamp") {
    const ta = getStudentSortTime(a, indexMap.get(a) ?? 0);
    const tb = getStudentSortTime(b, indexMap.get(b) ?? 0);
    const cmp = ta - tb;
    return dir === "asc" ? cmp : -cmp;
  }
  const av = String(a[key] || "");
  const bv = String(b[key] || "");
  const cmp = av.localeCompare(bv, "ar", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function applyResultsColumnSort(list, columnSort, sourceList) {
  if (!columnSort || !columnSort.key) return list;
  const indexMap = buildResultIndexMap(sourceList || list);
  return [...list].sort((a, b) => compareResultsByColumn(a, b, columnSort.key, normalizeColumnSortDirection(columnSort.dir), indexMap));
}

function applyStudentsColumnSort(list, columnSort, sourceList) {
  if (!columnSort || !columnSort.key) return list;
  const base = Array.isArray(sourceList) ? sourceList : list;
  const indexMap = buildResultIndexMap(base);
  return [...list].sort((a, b) => compareStudentsByColumn(a, b, columnSort.key, normalizeColumnSortDirection(columnSort.dir), indexMap));
}

function persistResultsColumnSort(columnSort) {
  try {
    localStorage.setItem("arabya_results_column_sort", JSON.stringify(columnSort || null));
  } catch (e) {}
}

function persistStudentsColumnSort(columnSort) {
  try {
    localStorage.setItem("arabya_students_column_sort", JSON.stringify(columnSort || null));
  } catch (e) {}
}

function toggleResultsColumnSort(columnKey) {
  const view = getResultsTableViewSettings();
  const current = view.columnSort || {};
  if (current.key === columnKey) {
    view.columnSort = { key: columnKey, dir: current.dir === "asc" ? "desc" : "asc" };
  } else {
    view.columnSort = { key: columnKey, dir: columnKey === "timestamp" ? "desc" : "asc" };
  }
  view.page = 1;
  persistResultsColumnSort(view.columnSort);
  renderStudentResultsTable();
}

function toggleStudentsColumnSort(columnKey) {
  const view = getStudentsTableViewSettings();
  const current = view.columnSort || {};
  if (current.key === columnKey) {
    view.columnSort = { key: columnKey, dir: current.dir === "asc" ? "desc" : "asc" };
  } else {
    view.columnSort = { key: columnKey, dir: columnKey === "timestamp" ? "desc" : "asc" };
  }
  view.page = 1;
  persistStudentsColumnSort(view.columnSort);
  renderTeacherStudentsTable();
}

function renderSortableTableHeaders(tableSelector, columns, columnSort, toggleFn) {
  const table = document.querySelector(tableSelector);
  if (!table) return;
  const theadRow = table.querySelector("thead tr");
  if (!theadRow) return;
  theadRow.innerHTML = columns.map(col => {
    const active = columnSort && columnSort.key === col.key;
    const dir = active ? normalizeColumnSortDirection(columnSort.dir) : "";
    const indicator = active ? (dir === "asc" ? " ▲" : " ▼") : "";
    return `<th scope="col" class="teacher-sortable-th${active ? " is-sorted" : ""}" data-column-sort="${col.key}" tabindex="0" role="columnheader" aria-sort="${active ? (dir === "asc" ? "ascending" : "descending") : "none"}">${col.label}${indicator}</th>`;
  }).join("") + `<th scope="col">الإجراء</th>`;
  theadRow.querySelectorAll("[data-column-sort]").forEach(th => {
    const activate = () => toggleFn(th.dataset.columnSort);
    th.addEventListener("click", activate);
    th.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

function sortResultsForDisplay(results, sortOrder, sourceList) {""",
            "column sort helpers",
        )

    text = must_replace(
        text,
        """  select.addEventListener("change", () => {
    const view = getResultsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.page = 1;
    try { localStorage.setItem("arabya_results_sort", view.sortOrder); } catch (e) {}
    renderStudentResultsTable();
  });""",
        """  select.addEventListener("change", () => {
    const view = getResultsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.columnSort = null;
    view.page = 1;
    try { localStorage.setItem("arabya_results_sort", view.sortOrder); } catch (e) {}
    persistResultsColumnSort(null);
    renderStudentResultsTable();
  });""",
            "results sort clears column",
        )

    if "function getStudentsTableViewSettings()" in text and "columnSort" not in text.split("getStudentsTableViewSettings")[1][:1200]:
        text = must_replace(
            text,
            """    systemState.studentsTableView = { page: 1, pageSize, quickFilter, sortOrder };
  }
  return systemState.studentsTableView;
}""",
            """    let columnSort = null;
    try {
      columnSort = JSON.parse(localStorage.getItem("arabya_students_column_sort") || "null");
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize, quickFilter, sortOrder, columnSort };
  }
  return systemState.studentsTableView;
}""",
            "studentsTableView columnSort",
        )

    text = must_replace(
        text,
        """  select.addEventListener("change", () => {
    const view = getStudentsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.page = 1;
    try { localStorage.setItem("arabya_students_sort", view.sortOrder); } catch (e) {}
    renderTeacherStudentsTable();
  });""",
        """  select.addEventListener("change", () => {
    const view = getStudentsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.columnSort = null;
    view.page = 1;
    try { localStorage.setItem("arabya_students_sort", view.sortOrder); } catch (e) {}
    persistStudentsColumnSort(null);
    renderTeacherStudentsTable();
  });""",
            "students sort clears column",
        )

    text = must_replace(
        text,
        """  const view = getResultsTableViewSettings();
  const sorted = sortResultsForDisplay(systemState.results, view.sortOrder);
  const filtered = filterResultsForTeacherTable(sorted);""",
        """  const view = getResultsTableViewSettings();
  renderSortableTableHeaders("#teacher-tab-results .table-container table", RESULTS_TABLE_SORTABLE_COLUMNS, view.columnSort, toggleResultsColumnSort);
  let sorted = sortResultsForDisplay(systemState.results, view.sortOrder);
  sorted = applyResultsColumnSort(sorted, view.columnSort, systemState.results);
  const filtered = filterResultsForTeacherTable(sorted);""",
        "renderStudentResultsTable column sort",
    )

    text = must_replace(
        text,
        """  const view = getStudentsTableViewSettings();
  const sorted = sortStudentsForDisplay(systemState.students, view.sortOrder);
  const filtered = filterStudentsForTeacherTable(sorted);""",
        """  const view = getStudentsTableViewSettings();
  renderSortableTableHeaders("#teacher-tab-students .table-container table", STUDENTS_TABLE_SORTABLE_COLUMNS, view.columnSort, toggleStudentsColumnSort);
  let sorted = sortStudentsForDisplay(systemState.students, view.sortOrder);
  sorted = applyStudentsColumnSort(sorted, view.columnSort, systemState.students);
  const filtered = filterStudentsForTeacherTable(sorted);""",
        "renderTeacherStudentsTable column sort",
    )

    if "function getStudentExamAttempts(" not in text:
        text = must_replace(
            text,
            "function renderResultRetakeManagementPanel(res) {",
            """function getStudentExamAttempts(res) {
  if (!res) return [];
  const lookupKey = res.studentLookupKey || getStudentLookupKey({ id: res.id, code: res.accessCode, name: res.name });
  const examId = res.examId || "";
  if (!lookupKey || !examId) return [res];
  const keys = getStudentLookupKeysForMatch({ studentKey: lookupKey, id: res.id, code: res.accessCode, name: res.name });
  return (systemState.results || [])
    .filter(r => r.examId === examId && keys.some(key => key && (r.studentLookupKey === key || getStudentLookupKeysForMatch({ id: r.id, code: r.accessCode, name: r.name }).includes(key))))
    .sort((a, b) => {
      const na = Number(a.attemptNumber) || 0;
      const nb = Number(b.attemptNumber) || 0;
      if (na && nb && na !== nb) return nb - na;
      return compareResultsByRecency(a, b, buildResultIndexMap(systemState.results));
    });
}

function renderStudentAttemptsPanel(currentRes) {
  const panel = document.getElementById("detail-attempts-panel");
  const listEl = document.getElementById("detail-attempts-list");
  if (!panel || !listEl) return;

  const attempts = getStudentExamAttempts(currentRes);
  if (attempts.length <= 1) {
    panel.classList.add("hidden");
    listEl.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  listEl.innerHTML = attempts.map(attempt => {
    const isCurrent = attempt.recordId === currentRes.recordId;
    const status = isSupersededResult(attempt) ? "محاولة سابقة" : getResultDisplayStatus(attempt) === "canceled" ? "ملغاة" : resultHasActiveRetakeGrant(attempt) ? "مسموح بإعادة الامتحان" : "المحاولة الحالية";
    const scoreText = attempt.archivedScoreSnapshot || attempt.score || "—";
    const tone = isSupersededResult(attempt) ? "var(--text-muted)" : attempt.status === "canceled" ? "var(--error)" : "var(--secondary)";
    return `<button type="button" class="detail-attempt-item${isCurrent ? " is-current" : ""}" data-record-id="${escapeHtml(attempt.recordId || "")}" data-student-id="${escapeHtml(attempt.id || "")}" data-exam-id="${escapeHtml(attempt.examId || "")}" style="width:100%; text-align:right; border:1px solid var(--border-color); border-radius:10px; padding:0.85rem 1rem; margin-bottom:0.5rem; background:${isCurrent ? "rgba(20,184,166,0.08)" : "rgba(255,255,255,0.02)"}; color:inherit; cursor:pointer;">` +
      `<div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start; flex-wrap:wrap;">` +
      `<div><div style="font-weight:700; color:${tone};">${escapeHtml(status)}${attempt.attemptNumber ? ` • محاولة ${attempt.attemptNumber}` : ""}</div>` +
      `<div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(attempt.timestamp || "—")}</div></div>` +
      `<div style="font-weight:800; color:var(--secondary);">${escapeHtml(scoreText)}</div>` +
      `</div></button>`;
  }).join("");

  listEl.querySelectorAll(".detail-attempt-item").forEach(btn => {
    btn.addEventListener("click", () => {
      viewTeacherResultDetail(btn.dataset.recordId || "", btn.dataset.studentId || "", btn.dataset.examId || "");
    });
  });
}

function renderResultRetakeManagementPanel(res) {""",
            "attempts panel",
        )

    text = must_replace(
        text,
        "  renderResultRetakeManagementPanel(res);\n\n  if (!res.studentAnswers) res.studentAnswers = {};",
        "  renderResultRetakeManagementPanel(res);\n  renderStudentAttemptsPanel(res);\n\n  if (!res.studentAnswers) res.studentAnswers = {};",
        "viewTeacherResultDetail attempts",
    )

    text = must_replace(
        text,
        "function renderTeacherStatsDashboard() {\n  const overview = document.getElementById(\"teacher-stats-overview\");",
        "function renderTeacherStatsDashboard() {\n  setupStatsDateRangeControls();\n  const overview = document.getElementById(\"teacher-stats-overview\");",
        "renderTeacherStatsDashboard setup stats dates",
    )

    if "function isMobileExamDevice(" not in text:
        text = must_replace(
            text,
            "// ==========================================\n// 9. آليات منع الغش وتأمين النوافذ\n// ==========================================\n\nfunction setupAntiCheatHandlers() {",
            """// ==========================================
// 9. آليات منع الغش وتأمين النوافذ
// ==========================================

function isMobileExamDevice() {
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  return (coarse && touch) || (narrow && touch);
}

function getExamAntiCheatGraceMs() {
  return isMobileExamDevice() ? 12000 : 4000;
}

function markExamAntiCheatStarted() {
  systemState.examAntiCheatStartedAt = Date.now();
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  if (isMobileExamDevice() && reason === "blur") return false;
  return true;
}

function getExamBlockingMessage(blockingResult) {
  if (!blockingResult) return "";
  if (blockingResult.status === "canceled") {
    return "تم إلغاء امتحانك سابقاً بسبب مخالفة قواعد الامتحان.\\n\\nاطلب من المعلم «السماح بإعادة الامتحان» من تبويب النتائج، ثم حاول الدخول مرة أخرى.";
  }
  return "لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً.\\n\\nإذا احتجت محاولة جديدة، اطلب من المعلم «السماح بإعادة الامتحان».";
}

function getCheatPenaltyMessage(reason, violationNumber, maxViolations) {
  const actionMap = {
    blur: "الخروج من نافذة الامتحان",
    visibility: "إخفاء تبويب الامتحان أو التبديل لتطبيق آخر",
    screenshot: "محاولة التقاط لقطة شاشة",
    copy: "محاولة النسخ",
    cut: "محاولة القص",
    paste: "محاولة اللصق",
    "keyboard-shortcut": "استخدام اختصار لوحة مفاتيح محظور"
  };
  const actionText = actionMap[reason] || "مخالفة قواعد الامتحان";
  const remaining = Math.max(0, maxViolations - violationNumber);
  const mobileHint = isMobileExamDevice()
    ? "<br><span style=\\"font-size:0.9rem; color:var(--text-muted);\\">على الهاتف: ابقَ داخل صفحة الامتحان ولا تفتح تطبيقات أخرى أثناء الحل.</span>"
    : "";
  if (violationNumber >= maxViolations) {
    return `<span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان</span>` +
      `تم رصد ${actionText}. تم إنهاء الاختبار وتسجيل حالة الإلغاء.${mobileHint}`;
  }
  return `<span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير (${violationNumber} من ${maxViolations})</span>` +
    `تم رصد ${actionText}. تم إلغاء السؤال الحالي وتصفير درجته.${mobileHint}` +
    `<span style="color:var(--error); font-weight:bold; font-size:0.95rem; display:block; margin-top:0.5rem;">متبقي ${remaining} تحذير${remaining === 1 ? "" : "ات"} قبل إلغاء الامتحان.</span>`;
}

function setupAntiCheatHandlers() {""",
            "mobile anti-cheat helpers",
        )

    text = must_replace(
        text,
        """  window.addEventListener("blur", () => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      triggerRunnerCheatPenalty("blur");
    }
  });""",
        """  window.addEventListener("blur", () => {
    if (shouldTriggerFocusAntiCheat("blur")) {
      triggerRunnerCheatPenalty("blur");
    }
  });""",
        "blur handler",
    )

    text = must_replace(
        text,
        """  document.addEventListener("visibilitychange", () => {
    if (document.hidden && systemState.isExamActive && !systemState.isCheatingSuspended) {
      triggerRunnerCheatPenalty("visibility");
    }
  });""",
        """  document.addEventListener("visibilitychange", () => {
    if (document.hidden && shouldTriggerFocusAntiCheat("visibility")) {
      triggerRunnerCheatPenalty("visibility");
    }
  });""",
        "visibility handler",
    )

    text = must_replace(
        text,
        """  if (blockingResult) {
    if (blockingResult.status === "canceled") {
      alert("تم إلغاء امتحانك سابقاً بسبب تجاوز محاولات الغش المسموحة. تواصل مع المعلم لإعادة السماح بالتقديم.");
    } else {
      alert("لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً. لا يمكن الدخول إليه مرة أخرى.");
    }
    return;
  }""",
        """  if (blockingResult) {
    alert(getExamBlockingMessage(blockingResult));
    return;
  }""",
        "blocking messages",
    )

    text = must_replace(
        text,
        """  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));""",
        """  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;
  markExamAntiCheatStarted();

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));""",
        "mark anti-cheat start",
    )

    text = must_replace(
        text,
        """  if (shouldCancel) {
    msg.innerHTML = `
      <span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان!</span>
      تم اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تم إنهاء اختبارك وتسجيل حالة الإلغاء.
    `;""",
        """  const maxViolations = getMaxCheatAttemptsForExam(exam);
  if (shouldCancel) {
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);""",
        "cheat cancel message",
    )

    text = must_replace(
        text,
        """  } else {
    msg.innerHTML = `
      <span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير أمني</span>
      تم اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تم إلغاء السؤال الحالي وتصفير درجته والانتقال للسؤال التالي.
    `;""",
        """  } else {
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);""",
        "cheat warning message",
    )

    if "function getMaxCheatAttemptsForExam(" not in text:
        text = must_replace(
            text,
            "function triggerRunnerCheatPenalty(reason) {",
            """function getMaxCheatAttemptsForExam(exam) {
  const parsed = parseInt(exam?.maxCheatAttempts, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 5;
}

function triggerRunnerCheatPenalty(reason) {""",
            "getMaxCheatAttemptsForExam",
        )

    text = must_replace(
        text,
        """  const exam = systemState.currentExam;
  const shouldCancel = shouldCancelExamForCheating(exam, systemState.cheatViolations);""",
        """  const exam = systemState.currentExam;
  const maxViolations = getMaxCheatAttemptsForExam(exam);
  const shouldCancel = shouldCancelExamForCheating(exam, systemState.cheatViolations);""",
        "maxViolations in trigger",
    )

    if "runner-mobile-exam-hint" not in text:
        text = must_replace(
            text,
            "  navigateToView(\"exam-runner-view\");\n  renderRunnerQuestion();\n  startRunnerTimer();\n}",
            """  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
  showMobileExamHintIfNeeded();
}

function showMobileExamHintIfNeeded() {
  if (!isMobileExamDevice()) return;
  const hint = document.getElementById("runner-mobile-exam-hint");
  if (!hint) return;
  hint.classList.remove("hidden");
  hint.innerHTML = `<span class="material-icons" style="vertical-align:middle; font-size:1rem;">smartphone</span> على الهاتف: ابقَ داخل صفحة الامتحان. التبديل لتطبيق آخر أو إخفاء الصفحة قد يُسجَّل كمخالفة بعد ${Math.round(getExamAntiCheatGraceMs() / 1000)} ثوانٍ من البدء.`;
}""",
            "mobile exam hint",
        )

    return text


def patch_index_html(text: str) -> str:
    text = text.replace("v=2026.05.31.11", f"v={VERSION}")

    if 'id="teacher-results-date-from"' not in text:
        text = must_replace(
            text,
            """                <select id="teacher-results-date-filter" class="form-control" style="padding:0.45rem 0.75rem;">
                  <option value="all">كل الأوقات</option>
                  <option value="today">اليوم</option>
                  <option value="week">آخر 7 أيام</option>
                  <option value="month">آخر 30 يوماً</option>
                </select>
              </div>""",
            """                <select id="teacher-results-date-filter" class="form-control" style="padding:0.45rem 0.75rem;">
                  <option value="all">كل الأوقات</option>
                  <option value="today">اليوم</option>
                  <option value="week">آخر 7 أيام</option>
                  <option value="month">آخر 30 يوماً</option>
                  <option value="custom">نطاق مخصص</option>
                </select>
              </div>
              <div class="form-group" style="margin:0; min-width:140px;">
                <label class="form-label" for="teacher-results-date-from" style="font-size:0.8rem;">من تاريخ</label>
                <input type="date" id="teacher-results-date-from" class="form-control" style="padding:0.4rem 0.65rem;">
              </div>
              <div class="form-group" style="margin:0; min-width:140px;">
                <label class="form-label" for="teacher-results-date-to" style="font-size:0.8rem;">إلى تاريخ</label>
                <input type="date" id="teacher-results-date-to" class="form-control" style="padding:0.4rem 0.65rem;">
              </div>""",
            "results date range inputs",
        )

    if 'id="teacher-stats-date-from"' not in text:
        text = must_replace(
            text,
            """            <div id="teacher-stats-sync-status" style="margin:0.5rem 0 1rem; font-size:0.85rem; color:var(--text-muted); min-height:1.25rem;" aria-live="polite"></div>""",
            """            <div id="teacher-stats-sync-status" style="margin:0.5rem 0 1rem; font-size:0.85rem; color:var(--text-muted); min-height:1.25rem;" aria-live="polite"></div>
            <div id="teacher-stats-date-range" style="display:flex; flex-wrap:wrap; gap:0.75rem; align-items:flex-end; margin-bottom:1rem; padding:0.85rem; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.02);">
              <div class="form-group" style="margin:0; min-width:150px;">
                <label class="form-label" for="teacher-stats-date-from" style="font-size:0.8rem;">من تاريخ</label>
                <input type="date" id="teacher-stats-date-from" class="form-control" style="padding:0.4rem 0.65rem;">
              </div>
              <div class="form-group" style="margin:0; min-width:150px;">
                <label class="form-label" for="teacher-stats-date-to" style="font-size:0.8rem;">إلى تاريخ</label>
                <input type="date" id="teacher-stats-date-to" class="form-control" style="padding:0.4rem 0.65rem;">
              </div>
              <button type="button" id="teacher-stats-apply-date-range" class="btn btn-outline btn-sm">تطبيق على الإحصائيات</button>
              <button type="button" id="teacher-stats-clear-date-range" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح النطاق</button>
            </div>""",
            "stats date range",
        )

    if 'id="detail-attempts-panel"' not in text:
        text = must_replace(
            text,
            """                <div id="detail-retake-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap;"></div>
              </div>

              <!-- حقل تعديل النتيجة النهائية الإجمالية يدوياً -->""",
            """                <div id="detail-retake-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap;"></div>
              </div>

              <div id="detail-attempts-panel" class="hidden" style="margin-bottom: 2rem; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 12px; padding: 1.25rem; background: rgba(245, 158, 11, 0.04); text-align:right;">
                <div style="font-weight:700; color:var(--accent); margin-bottom:0.35rem;">سجل محاولات الطالب لهذا الامتحان</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.85rem;">المحاولات الحالية والمحفوظة (بما فيها المحاولات السابقة المؤرشفة).</div>
                <div id="detail-attempts-list"></div>
              </div>

              <!-- حقل تعديل النتيجة النهائية الإجمالية يدوياً -->""",
            "attempts panel html",
        )

    if 'id="runner-mobile-exam-hint"' not in text:
        text = must_replace(
            text,
            """        <!-- شريط تقدم الاختبار الخطي -->
        <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.03); border-radius:10px; overflow:hidden; margin-bottom:2rem;" aria-hidden="true">""",
            """        <div id="runner-mobile-exam-hint" class="hidden" style="margin:0 0 1rem; padding:0.75rem 1rem; border-radius:10px; border:1px solid rgba(245,158,11,0.35); background:rgba(245,158,11,0.08); color:var(--accent); font-size:0.9rem; line-height:1.6; text-align:right;" role="status" aria-live="polite"></div>

        <!-- شريط تقدم الاختبار الخطي -->
        <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.03); border-radius:10px; overflow:hidden; margin-bottom:2rem;" aria-hidden="true">""",
            "mobile hint",
        )

    return text


def patch_style_css(text: str) -> str:
    if ".teacher-sortable-th" not in text:
        text += """

.teacher-sortable-th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.teacher-sortable-th.is-sorted {
  color: var(--secondary);
}

.teacher-sortable-th:hover {
  color: var(--accent);
}

.detail-attempt-item.is-current {
  box-shadow: inset 0 0 0 1px rgba(20, 184, 166, 0.35);
}

.detail-attempt-item:hover {
  border-color: var(--secondary) !important;
}
"""
    return text


def main() -> None:
    app_lines_before = len(APP.read_text(encoding="utf-8").splitlines())
    index_lines_before = len(INDEX.read_text(encoding="utf-8").splitlines())

    app_text = patch_app_js(APP.read_text(encoding="utf-8"))
    index_text = patch_index_html(INDEX.read_text(encoding="utf-8"))
    style_text = patch_style_css(STYLE.read_text(encoding="utf-8"))

    APP.write_text(app_text, encoding="utf-8")
    INDEX.write_text(index_text, encoding="utf-8")
    STYLE.write_text(style_text, encoding="utf-8")

    app_lines_after = len(app_text.splitlines())
    index_lines_after = len(index_text.splitlines())
    print(f"app.js: {app_lines_before} -> {app_lines_after} lines")
    print(f"index.html: {index_lines_before} -> {index_lines_after} lines")
    if app_lines_after < 7000:
        raise SystemExit("app.js looks truncated")
    if index_lines_after < 1500:
        raise SystemExit("index.html looks truncated")
    print(f"Patched to version {VERSION}")


if __name__ == "__main__":
    main()
