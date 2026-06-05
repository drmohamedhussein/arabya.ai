#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/workspace')
html_path = ROOT / 'index.html'
js_path = ROOT / 'app.js'

html = html_path.read_text(encoding='utf-8')
results_filters_html = '''
            <div id="teacher-results-quick-filters" style="display:flex; flex-wrap:wrap; gap:0.85rem; align-items:flex-end; margin-bottom:1rem; padding:0.9rem; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.02);">
              <div>
                <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.4rem;">فلتر الحالة</span>
                <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
                  <button type="button" class="btn btn-primary btn-sm" data-results-status-filter="all">الكل</button>
                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="completed">مكتمل</button>
                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="incomplete">جاري</button>
                  <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="canceled">ملغى</button>
                </div>
              </div>
              <div class="form-group" style="margin:0; min-width:190px; flex:1;">
                <label class="form-label" for="teacher-results-exam-filter" style="font-size:0.8rem;">الامتحان</label>
                <select id="teacher-results-exam-filter" class="form-control" style="padding:0.45rem 0.75rem;">
                  <option value="">كل الامتحانات</option>
                </select>
              </div>
              <div class="form-group" style="margin:0; min-width:150px;">
                <label class="form-label" for="teacher-results-date-filter" style="font-size:0.8rem;">التاريخ</label>
                <select id="teacher-results-date-filter" class="form-control" style="padding:0.45rem 0.75rem;">
                  <option value="all">كل الأوقات</option>
                  <option value="today">اليوم</option>
                  <option value="week">آخر 7 أيام</option>
                  <option value="month">آخر 30 يوماً</option>
                </select>
              </div>
              <button type="button" id="teacher-results-clear-filters" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح الفلاتر</button>
            </div>
'''
html_anchor = '              <small id="teacher-results-search-hint"'
html_insert = '              <small id="teacher-results-search-hint"'
if 'teacher-results-quick-filters' not in html:
    idx = html.find(html_anchor)
    if idx == -1:
        raise SystemExit('results search hint not found')
    # insert before closing </div> of search form-group - after search hint block
    hint_end = html.find('</div>\n\n            <div class="table-container">', idx)
    if hint_end == -1:
        raise SystemExit('results table anchor not found')
    html = html[:hint_end] + '\n            </div>\n' + results_filters_html + html[hint_end + len('\n            </div>\n'):]
    html_path.write_text(html, encoding='utf-8')

students_filters_html = '''
            <div id="teacher-students-quick-filters" style="display:flex; flex-wrap:wrap; gap:0.85rem; align-items:flex-end; margin-bottom:1rem; padding:0.9rem; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.02);">
              <div>
                <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.4rem;">فلتر سريع</span>
                <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
                  <button type="button" class="btn btn-primary btn-sm" data-students-quick-filter="all">الكل</button>
                  <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="has_results">لديهم نتائج</button>
                  <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="no_results">بدون نتائج</button>
                  <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="multi_exams">أكثر من امتحان</button>
                  <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="canceled">امتحان ملغى</button>
                </div>
              </div>
              <button type="button" id="teacher-students-clear-filters" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح الفلاتر</button>
            </div>
'''
html = html_path.read_text(encoding='utf-8')
if 'teacher-students-quick-filters' not in html:
    anchor = '              <small id="teacher-students-search-hint"'
    idx = html.find(anchor)
    if idx == -1:
        raise SystemExit('students search hint not found')
    hint_end = html.find('</div>\n\n            <!-- فورم إضافة طالب', idx)
    if hint_end == -1:
        raise SystemExit('students form anchor not found')
    html = html[:hint_end] + '\n            </div>\n' + students_filters_html + html[hint_end + len('\n            </div>\n'):]
    html_path.write_text(html, encoding='utf-8')

text = js_path.read_text(encoding='utf-8')

filter_helpers = r'''
function getResultsTableFilters() {
  const view = getResultsTableViewSettings();
  return {
    searchQuery: getResultsSearchQuery(),
    statusFilter: view.statusFilter || "all",
    examFilter: view.examFilter || "",
    dateFilter: view.dateFilter || "all"
  };
}

function getResultDisplayStatus(res) {
  if (res?.status === "canceled") return "canceled";
  if (res?.status === "incomplete") return "incomplete";
  const scoreText = String(res?.score || "");
  if (/جاري|غير مكتمل|incomplete/i.test(scoreText)) return "incomplete";
  return "completed";
}

function parseResultTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function resultMatchesStatusFilter(res, statusFilter) {
  if (!statusFilter || statusFilter === "all") return true;
  return getResultDisplayStatus(res) === statusFilter;
}

function resultMatchesExamFilter(res, examFilter) {
  if (!examFilter) return true;
  return String(res.examId || "") === examFilter || String(res.examTitle || "") === examFilter;
}

function resultMatchesDateFilter(res, dateFilter) {
  if (!dateFilter || dateFilter === "all") return true;
  const dt = parseResultTimestamp(res.timestamp);
  if (!dt) return true;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dateFilter === "today") return dt >= startOfToday;
  if (dateFilter === "week") {
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return dt >= weekAgo;
  }
  if (dateFilter === "month") {
    const monthAgo = new Date(startOfToday);
    monthAgo.setDate(monthAgo.getDate() - 30);
    return dt >= monthAgo;
  }
  return true;
}

function getResultsExamFilterOptions() {
  const map = new Map();
  (systemState.results || []).forEach(res => {
    const key = res.examId || res.examTitle;
    if (!key) return;
    map.set(String(key), res.examTitle || res.examId || String(key));
  });
  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  (systemState.exams || []).forEach(exam => {
    if (activeUsername && exam.teacher && exam.teacher !== activeUsername) return;
    if (exam.id) map.set(String(exam.id), exam.title || exam.id);
  });
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

function filterResultsForTeacherTable(results) {
  const filters = getResultsTableFilters();
  let list = Array.isArray(results) ? [...results] : [];
  list = filterResultsForSearch(list, filters.searchQuery);
  if (filters.statusFilter !== "all") {
    list = list.filter(res => resultMatchesStatusFilter(res, filters.statusFilter));
  }
  if (filters.examFilter) {
    list = list.filter(res => resultMatchesExamFilter(res, filters.examFilter));
  }
  if (filters.dateFilter !== "all") {
    list = list.filter(res => resultMatchesDateFilter(res, filters.dateFilter));
  }
  return list;
}

function isResultsTableFiltersActive(filters) {
  const active = filters || getResultsTableFilters();
  return !!(
    active.searchQuery ||
    (active.statusFilter && active.statusFilter !== "all") ||
    active.examFilter ||
    (active.dateFilter && active.dateFilter !== "all")
  );
}

function persistResultsTableFilters() {
  const view = getResultsTableViewSettings();
  try {
    localStorage.setItem("arabya_results_filters", JSON.stringify({
      statusFilter: view.statusFilter || "all",
      examFilter: view.examFilter || "",
      dateFilter: view.dateFilter || "all"
    }));
  } catch (e) {}
}

function populateResultsExamFilterSelect() {
  const select = document.getElementById("teacher-results-exam-filter");
  if (!select) return;
  const current = getResultsTableViewSettings().examFilter || "";
  const options = getResultsExamFilterOptions();
  select.innerHTML = '<option value="">كل الامتحانات</option>' +
    options.map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join("");
  if ([...select.options].some(opt => opt.value === current)) {
    select.value = current;
  }
}

function syncResultsFilterControlsUI() {
  const view = getResultsTableViewSettings();
  document.querySelectorAll("[data-results-status-filter]").forEach(btn => {
    const isActive = (btn.dataset.resultsStatusFilter || "all") === (view.statusFilter || "all");
    btn.className = isActive ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
  });
  const examSelect = document.getElementById("teacher-results-exam-filter");
  if (examSelect) examSelect.value = view.examFilter || "";
  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) dateSelect.value = view.dateFilter || "all";
}

function resetResultsTableFilters() {
  const view = getResultsTableViewSettings();
  view.statusFilter = "all";
  view.examFilter = "";
  view.dateFilter = "all";
  view.page = 1;
  const searchInput = document.getElementById("teacher-results-search-input");
  if (searchInput) searchInput.value = "";
  persistResultsTableFilters();
  syncResultsFilterControlsUI();
  renderStudentResultsTable();
}

function setupResultsTableFilterControls() {
  const container = document.getElementById("teacher-results-quick-filters");
  if (!container) return;
  populateResultsExamFilterSelect();
  syncResultsFilterControlsUI();
  if (container.dataset.bound) return;
  container.dataset.bound = "1";

  container.querySelectorAll("[data-results-status-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      getResultsTableViewSettings().statusFilter = btn.dataset.resultsStatusFilter || "all";
      getResultsTableViewSettings().page = 1;
      persistResultsTableFilters();
      syncResultsFilterControlsUI();
      renderStudentResultsTable();
    });
  });

  const examSelect = document.getElementById("teacher-results-exam-filter");
  if (examSelect) {
    examSelect.addEventListener("change", () => {
      getResultsTableViewSettings().examFilter = examSelect.value;
      getResultsTableViewSettings().page = 1;
      persistResultsTableFilters();
      renderStudentResultsTable();
    });
  }

  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      getResultsTableViewSettings().dateFilter = dateSelect.value || "all";
      getResultsTableViewSettings().page = 1;
      persistResultsTableFilters();
      renderStudentResultsTable();
    });
  }

  const clearBtn = document.getElementById("teacher-results-clear-filters");
  if (clearBtn) {
    clearBtn.addEventListener("click", resetResultsTableFilters);
  }
}

window.setTeacherResultsExamFilter = function(examIdOrTitle) {
  if (!examIdOrTitle) return;
  getResultsTableViewSettings().examFilter = String(examIdOrTitle);
  getResultsTableViewSettings().page = 1;
  persistResultsTableFilters();
  const resultsTabBtn = document.querySelector('[data-teacher-tab="teacher-tab-results"]');
  if (resultsTabBtn) resultsTabBtn.click();
  else navigateToView("teacher-dashboard-view");
  setTimeout(() => {
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  }, 50);
};

function countStudentResults(student) {
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
}

function studentMatchesQuickFilter(student, quickFilter) {
  if (!quickFilter || quickFilter === "all") return true;
  const studentKey = student.studentKey || getStudentLookupKey(student);
  const resultCount = countStudentResults(student);
  const canceled = getStudentCanceledExamIds(studentKey).length > 0;
  if (quickFilter === "has_results") return resultCount > 0;
  if (quickFilter === "no_results") return resultCount === 0;
  if (quickFilter === "multi_exams") return resultCount > 1;
  if (quickFilter === "canceled") return canceled;
  return true;
}

function getStudentsTableFilters() {
  const view = getStudentsTableViewSettings();
  return {
    searchQuery: getStudentsSearchQuery(),
    quickFilter: view.quickFilter || "all"
  };
}

function filterStudentsForTeacherTable(students) {
  const filters = getStudentsTableFilters();
  let list = Array.isArray(students) ? [...students] : [];
  list = filterStudentsForSearch(list, filters.searchQuery);
  if (filters.quickFilter !== "all") {
    list = list.filter(student => studentMatchesQuickFilter(student, filters.quickFilter));
  }
  return list;
}

function isStudentsTableFiltersActive(filters) {
  const active = filters || getStudentsTableFilters();
  return !!(active.searchQuery || (active.quickFilter && active.quickFilter !== "all"));
}

function persistStudentsTableFilters() {
  const view = getStudentsTableViewSettings();
  try {
    localStorage.setItem("arabya_students_filters", JSON.stringify({
      quickFilter: view.quickFilter || "all"
    }));
  } catch (e) {}
}

function syncStudentsFilterControlsUI() {
  const view = getStudentsTableViewSettings();
  document.querySelectorAll("[data-students-quick-filter]").forEach(btn => {
    const isActive = (btn.dataset.studentsQuickFilter || "all") === (view.quickFilter || "all");
    btn.className = isActive ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
  });
}

function resetStudentsTableFilters() {
  const view = getStudentsTableViewSettings();
  view.quickFilter = "all";
  view.page = 1;
  const searchInput = document.getElementById("teacher-students-search-input");
  if (searchInput) searchInput.value = "";
  persistStudentsTableFilters();
  syncStudentsFilterControlsUI();
  renderTeacherStudentsTable();
}

function setupStudentsTableFilterControls() {
  const container = document.getElementById("teacher-students-quick-filters");
  if (!container) return;
  syncStudentsFilterControlsUI();
  if (container.dataset.bound) return;
  container.dataset.bound = "1";

  container.querySelectorAll("[data-students-quick-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      getStudentsTableViewSettings().quickFilter = btn.dataset.studentsQuickFilter || "all";
      getStudentsTableViewSettings().page = 1;
      persistStudentsTableFilters();
      syncStudentsFilterControlsUI();
      renderTeacherStudentsTable();
    });
  });

  const clearBtn = document.getElementById("teacher-students-clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", resetStudentsTableFilters);
}

'''

if 'function getResultsTableFilters()' not in text:
    text = text.replace('function normalizeResultsSearchText(value) {', filter_helpers + 'function normalizeResultsSearchText(value) {', 1)

old_get_view = '''function getResultsTableViewSettings() {
  if (!systemState.resultsTableView) {
    let pageSize = 50;
    try {
      const saved = parseInt(localStorage.getItem("arabya_results_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize };
  }
  return systemState.resultsTableView;
}'''

new_get_view = '''function getResultsTableViewSettings() {
  if (!systemState.resultsTableView) {
    let pageSize = 50;
    let statusFilter = "all";
    let examFilter = "";
    let dateFilter = "all";
    try {
      const saved = parseInt(localStorage.getItem("arabya_results_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.statusFilter) statusFilter = savedFilters.statusFilter;
      if (savedFilters.examFilter) examFilter = savedFilters.examFilter;
      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter };
  }
  return systemState.resultsTableView;
}'''
text = text.replace(old_get_view, new_get_view, 1)

old_pag = '''function updateResultsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, searchQuery = "") {
  const info = document.getElementById("teacher-results-page-info");
  const pageNum = document.getElementById("teacher-results-page-number");
  const prevBtn = document.getElementById("teacher-results-prev-page");
  const nextBtn = document.getElementById("teacher-results-next-page");
  const sizeSelect = document.getElementById("teacher-results-page-size");
  const isFiltered = !!searchQuery && totalAll !== totalItems;

  if (sizeSelect && String(sizeSelect.value) !== String(pageSize)) {
    sizeSelect.value = String(pageSize);
  }

  if (totalItems === 0) {
    if (info) {
      info.textContent = searchQuery
        ? `وُجد 0 من ${totalAll} سجلاً`
        : "";
    }'''
new_pag = '''function updateResultsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, filtersActive = false) {
  const info = document.getElementById("teacher-results-page-info");
  const pageNum = document.getElementById("teacher-results-page-number");
  const prevBtn = document.getElementById("teacher-results-prev-page");
  const nextBtn = document.getElementById("teacher-results-next-page");
  const sizeSelect = document.getElementById("teacher-results-page-size");
  const isFiltered = filtersActive || totalAll !== totalItems;

  if (sizeSelect && String(sizeSelect.value) !== String(pageSize)) {
    sizeSelect.value = String(pageSize);
  }

  if (totalItems === 0) {
    if (info) {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} سجلاً`
        : "";
    }'''
text = text.replace(old_pag, new_pag, 1)

old_render = '''  setupResultsTablePaginationControls();
  setupResultsTableSearchControl();

  const searchQuery = getResultsSearchQuery();
  const totalAll = systemState.results.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد سجلات محلية.${hasCloud ? " اضغط «مزامنة من السحابة» أعلاه لجلب نتائج الطلاب من Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateResultsPaginationUI(0, 1, getResultsTableViewSettings().pageSize, 0, searchQuery);
    return;
  }

  const sorted = [...systemState.results].reverse();
  const filtered = filterResultsForSearch(sorted, searchQuery);
  const view = getResultsTableViewSettings();
  const totalItems = filtered.length;
  view.page = clampResultsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد نتائج تطابق «${escapeHtml(searchQuery)}» من ${totalAll} سجل.</td></tr>`;
    updateResultsPaginationUI(0, 1, view.pageSize, totalAll, searchQuery);
    return;
  }'''

new_render = '''  setupResultsTablePaginationControls();
  setupResultsTableSearchControl();
  setupResultsTableFilterControls();

  const filters = getResultsTableFilters();
  const filtersActive = isResultsTableFiltersActive(filters);
  const totalAll = systemState.results.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد سجلات محلية.${hasCloud ? " اضغط «مزامنة من السحابة» أعلاه لجلب نتائج الطلاب من Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateResultsPaginationUI(0, 1, getResultsTableViewSettings().pageSize, 0, filtersActive);
    return;
  }

  const sorted = [...systemState.results].reverse();
  const filtered = filterResultsForTeacherTable(sorted);
  const view = getResultsTableViewSettings();
  const totalItems = filtered.length;
  view.page = clampResultsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    const emptyMsg = filters.searchQuery
      ? `لا توجد نتائج تطابق «${escapeHtml(filters.searchQuery)}»`
      : "لا توجد نتائج تطابق الفلاتر المحددة";
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} سجل.</td></tr>`;
    updateResultsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }'''
text = text.replace(old_render, new_render, 1)

text = text.replace(
    '  pageItems.forEach(res => {\n    const row = document.createElement("tr");\n    const statusBadge = formatResultStatusBadge(res);',
    '  pageItems.forEach(res => {\n    const row = document.createElement("tr");\n    const displayStatus = getResultDisplayStatus(res);\n    if (displayStatus === "canceled") row.style.borderRight = "3px solid var(--error)";\n    else if (displayStatus === "incomplete") row.style.borderRight = "3px solid var(--warning)";\n    const statusBadge = formatResultStatusBadge(res);',
    1
)

text = text.replace(
    '  updateResultsPaginationUI(totalItems, view.page, view.pageSize, totalAll, searchQuery);\n}\n\nwindow.viewTeacherResultDetail',
    '  updateResultsPaginationUI(totalItems, view.page, view.pageSize, totalAll, filtersActive);\n}\n\nwindow.viewTeacherResultDetail',
    1
)

old_students_view = '''function getStudentsTableViewSettings() {
  if (!systemState.studentsTableView) {
    let pageSize = 50;
    try {
      const saved = parseInt(localStorage.getItem("arabya_students_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize };
  }
  return systemState.studentsTableView;
}'''

new_students_view = '''function getStudentsTableViewSettings() {
  if (!systemState.studentsTableView) {
    let pageSize = 50;
    let quickFilter = "all";
    try {
      const saved = parseInt(localStorage.getItem("arabya_students_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_students_filters") || "{}");
      if (savedFilters.quickFilter) quickFilter = savedFilters.quickFilter;
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize, quickFilter };
  }
  return systemState.studentsTableView;
}'''
text = text.replace(old_students_view, new_students_view, 1)

old_students_pag = '''function updateStudentsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, searchQuery = "") {
  const info = document.getElementById("teacher-students-page-info");
  const pageNum = document.getElementById("teacher-students-page-number");
  const prevBtn = document.getElementById("teacher-students-prev-page");
  const nextBtn = document.getElementById("teacher-students-next-page");
  const sizeSelect = document.getElementById("teacher-students-page-size");
  const isFiltered = !!searchQuery && totalAll !== totalItems;

  if (sizeSelect && String(sizeSelect.value) !== String(pageSize)) {
    sizeSelect.value = String(pageSize);
  }

  if (totalItems === 0) {
    if (info) {
      info.textContent = searchQuery
        ? `وُجد 0 من ${totalAll} طالب`
        : "";
    }'''
new_students_pag = '''function updateStudentsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, filtersActive = false) {
  const info = document.getElementById("teacher-students-page-info");
  const pageNum = document.getElementById("teacher-students-page-number");
  const prevBtn = document.getElementById("teacher-students-prev-page");
  const nextBtn = document.getElementById("teacher-students-next-page");
  const sizeSelect = document.getElementById("teacher-students-page-size");
  const isFiltered = filtersActive || totalAll !== totalItems;

  if (sizeSelect && String(sizeSelect.value) !== String(pageSize)) {
    sizeSelect.value = String(pageSize);
  }

  if (totalItems === 0) {
    if (info) {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} طالب`
        : "";
    }'''
text = text.replace(old_students_pag, new_students_pag, 1)

old_students_render = '''  setupStudentsTablePaginationControls();
  setupStudentsTableSearchControl();

  const searchQuery = getStudentsSearchQuery();
  const totalAll = systemState.students.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا يوجد طلاب محلياً.${hasCloud ? " اضغط «مزامنة من السحابة» لجلب الطلاب من نتائج Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateStudentsPaginationUI(0, 1, getStudentsTableViewSettings().pageSize, 0, searchQuery);
    return;
  }

  const reversed = [...systemState.students].reverse();
  const filtered = filterStudentsForSearch(reversed, searchQuery);
  const view = getStudentsTableViewSettings();
  const totalItems = filtered.length;
  view.page = clampStudentsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا يوجد طلاب يطابقون «${escapeHtml(searchQuery)}» من ${totalAll} طالب.</td></tr>`;
    updateStudentsPaginationUI(0, 1, view.pageSize, totalAll, searchQuery);
    return;
  }'''

new_students_render = '''  setupStudentsTablePaginationControls();
  setupStudentsTableSearchControl();
  setupStudentsTableFilterControls();

  const filters = getStudentsTableFilters();
  const filtersActive = isStudentsTableFiltersActive(filters);
  const totalAll = systemState.students.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا يوجد طلاب محلياً.${hasCloud ? " اضغط «مزامنة من السحابة» لجلب الطلاب من نتائج Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateStudentsPaginationUI(0, 1, getStudentsTableViewSettings().pageSize, 0, filtersActive);
    return;
  }

  const reversed = [...systemState.students].reverse();
  const filtered = filterStudentsForTeacherTable(reversed);
  const view = getStudentsTableViewSettings();
  const totalItems = filtered.length;
  view.page = clampStudentsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    const emptyMsg = filters.searchQuery
      ? `لا يوجد طلاب يطابقون «${escapeHtml(filters.searchQuery)}»`
      : "لا يوجد طلاب يطابقون الفلاتر المحددة";
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} طالب.</td></tr>`;
    updateStudentsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }'''
text = text.replace(old_students_render, new_students_render, 1)

text = text.replace(
    '  updateStudentsPaginationUI(totalItems, view.page, view.pageSize, totalAll, searchQuery);\n}\n\n// إظهار بطاقة إضافة طالب جديد',
    '  updateStudentsPaginationUI(totalItems, view.page, view.pageSize, totalAll, filtersActive);\n}\n\n// إظهار بطاقة إضافة طالب جديد',
    1
)

old_csv = '''function exportTeacherResultsToCSV() {
  if (systemState.results.length === 0) {
    alert("لا توجد سجلات لتصديرها!");
    return;
  }

  let csvContent = "\\ufeffsep=,\\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,النتيجة,التاريخ والوقت\\n";

  systemState.results.forEach(res => {
    csvContent += `"${res.name}","${res.id}","${res.accessCode || 'لا يوجد'}","${res.university || 'عام'}","${res.faculty || 'عام'}","${res.level || 'عام'}","${res.examTitle}","${res.examType || 'أعمال سنة'}","${res.score}","${res.timestamp}"\\n`;
  });'''

new_csv = '''function exportTeacherResultsToCSV() {
  if (systemState.results.length === 0) {
    alert("لا توجد سجلات لتصديرها!");
    return;
  }

  const exportRows = filterResultsForTeacherTable([...systemState.results].reverse());
  if (!exportRows.length) {
    alert("لا توجد نتائج مطابقة للفلاتر الحالية للتصدير!");
    return;
  }

  let csvContent = "\\ufeffsep=,\\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,النتيجة,التاريخ والوقت\\n";

  exportRows.forEach(res => {
    csvContent += `"${res.name}","${res.id}","${res.accessCode || 'لا يوجد'}","${res.university || 'عام'}","${res.faculty || 'عام'}","${res.level || 'عام'}","${res.examTitle}","${res.examType || 'أعمال سنة'}","${res.score}","${res.timestamp}"\\n`;
  });'''
text = text.replace(old_csv, new_csv, 1)

# Add "View results" button on exam cards - find renderExamsList
old_exam_actions = '''    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
        <div>
          <h3 style="color:white; margin-bottom:0.5rem; font-size:1.1rem;">${exam.title}</h3>'''

# Need to read actual renderExamsList structure
if 'setTeacherResultsExamFilter' in text and 'عرض النتائج' not in text:
    pass

text = text.replace('const ARABYA_APP_VERSION = "2026.05.30.9";', 'const ARABYA_APP_VERSION = "2026.05.31.1";', 1)

js_path.write_text(text, encoding='utf-8')
print('patched')
