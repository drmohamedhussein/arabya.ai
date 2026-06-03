#!/usr/bin/env python3
"""Add table sort/display order for results and students tabs."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app.js"
HTML = ROOT / "index.html"

SORT_HELPERS = '''
const TABLE_SORT_OPTIONS = [
  { value: "newest", label: "الأحدث أولاً" },
  { value: "oldest", label: "الأقدم أولاً" },
  { value: "name_asc", label: "الاسم (أ → ي)" },
  { value: "name_desc", label: "الاسم (ي → أ)" }
];

function normalizeTableSortOrder(value, fallback = "newest") {
  const allowed = TABLE_SORT_OPTIONS.map(option => option.value);
  return allowed.includes(value) ? value : fallback;
}

function getStudentSortTime(student, fallbackIndex = 0) {
  const parsed = parseResultTimestamp(student?.timestamp);
  if (parsed) return parsed.getTime();
  const studentKey = String(student?.studentKey || "");
  const match = studentKey.match(/(?:student|record)_(\d{10,})_/i);
  if (match) return parseInt(match[1], 10);
  if (Number.isFinite(student?.savedAt)) return student.savedAt;
  return fallbackIndex;
}

function compareStudentsByRecency(a, b, indexMap) {
  const ta = getStudentSortTime(a, indexMap.get(a) ?? 0);
  const tb = getStudentSortTime(b, indexMap.get(b) ?? 0);
  if (tb !== ta) return tb - ta;
  return (indexMap.get(b) ?? 0) - (indexMap.get(a) ?? 0);
}

function sortStudentsForDisplay(students, sortOrder, sourceList) {
  const list = Array.isArray(students) ? [...students] : [];
  const order = normalizeTableSortOrder(sortOrder);
  const base = Array.isArray(sourceList) ? sourceList : (systemState.students || []);
  const indexMap = buildResultIndexMap(base);

  if (order === "name_asc") {
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }
  if (order === "name_desc") {
    return list.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), "ar"));
  }
  if (order === "oldest") {
    return list.sort((a, b) => compareStudentsByRecency(a, b, indexMap) * -1);
  }
  return list.sort((a, b) => compareStudentsByRecency(a, b, indexMap));
}

function sortResultsForDisplay(results, sortOrder, sourceList) {
  const list = Array.isArray(results) ? [...results] : [];
  const order = normalizeTableSortOrder(sortOrder);
  const base = Array.isArray(sourceList) ? sourceList : (systemState.results || []);
  const indexMap = buildResultIndexMap(base);

  if (order === "name_asc") {
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }
  if (order === "name_desc") {
    return list.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), "ar"));
  }
  if (order === "oldest") {
    return list.sort((a, b) => compareResultsByRecency(a, b, indexMap) * -1);
  }
  return list.sort((a, b) => compareResultsByRecency(a, b, indexMap));
}
'''

SORT_SELECT_HTML = '''              <div class="form-group" style="margin:0; min-width:165px;">
                <label class="form-label" for="{select_id}" style="font-size:0.8rem;">طريقة العرض</label>
                <select id="{select_id}" class="form-control" style="padding:0.45rem 0.75rem;" aria-label="طريقة عرض الجدول">
                  <option value="newest">الأحدث أولاً</option>
                  <option value="oldest">الأقدم أولاً</option>
                  <option value="name_asc">الاسم (أ → ي)</option>
                  <option value="name_desc">الاسم (ي → أ)</option>
                </select>
              </div>
'''


def patch_app(content: str) -> str:
    content = content.replace(
        'const ARABYA_APP_VERSION = "2026.05.31.6";',
        'const ARABYA_APP_VERSION = "2026.05.31.7";',
    )

    marker = "function sortResultsByRecency(results, sourceList) {"
    if marker not in content:
        raise SystemExit("sortResultsByRecency marker not found")
    if "function sortResultsForDisplay" not in content:
        content = content.replace(
            marker,
            SORT_HELPERS + "\n" + marker,
        )

    old_sort = """function sortResultsByRecency(results, sourceList) {
  const list = Array.isArray(results) ? [...results] : [];
  const base = Array.isArray(sourceList) ? sourceList : (systemState.results || []);
  const indexMap = buildResultIndexMap(base);
  return list.sort((a, b) => compareResultsByRecency(a, b, indexMap));
}"""
    new_sort = """function sortResultsByRecency(results, sourceList) {
  return sortResultsForDisplay(results, "newest", sourceList);
}"""
    if old_sort in content:
        content = content.replace(old_sort, new_sort)

    old_shape = """    normalizedStudent.studentKey = normalizedStudent.studentKey || getStudentLookupKey(normalizedStudent) || createRecordId("student");
    return normalizedStudent;
  });
}"""
    new_shape = """    normalizedStudent.studentKey = normalizedStudent.studentKey || getStudentLookupKey(normalizedStudent) || createRecordId("student");
    if (!Number.isFinite(normalizedStudent.savedAt)) {
      const match = String(normalizedStudent.studentKey || "").match(/(?:student|record)_(\d{10,})_/i);
      if (match) normalizedStudent.savedAt = parseInt(match[1], 10);
    }
    return normalizedStudent;
  });
}"""
    content = content.replace(old_shape, new_shape)

    old_results_export = """function getResultsForExport() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return [];
  return filterResultsForTeacherTable(sortResultsByRecency(systemState.results));
}"""
    new_results_export = """function getResultsForExport() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return [];
  const sortOrder = getResultsTableViewSettings().sortOrder || "newest";
  return filterResultsForTeacherTable(sortResultsForDisplay(systemState.results, sortOrder));
}"""
    content = content.replace(old_results_export, new_results_export)

    old_students_export = """function getStudentsForExport() {
  if (!Array.isArray(systemState.students) || !systemState.students.length) return [];
  return filterStudentsForTeacherTable([...systemState.students].reverse());
}"""
    new_students_export = """function getStudentsForExport() {
  if (!Array.isArray(systemState.students) || !systemState.students.length) return [];
  const sortOrder = getStudentsTableViewSettings().sortOrder || "newest";
  return filterStudentsForTeacherTable(sortStudentsForDisplay(systemState.students, sortOrder));
}"""
    content = content.replace(old_students_export, new_students_export)

    old_results_view = """    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.statusFilter) statusFilter = savedFilters.statusFilter;
      if (savedFilters.examFilter) examFilter = savedFilters.examFilter;
      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter };
  }
  return systemState.resultsTableView;
}"""
    new_results_view = """    let sortOrder = "newest";
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.statusFilter) statusFilter = savedFilters.statusFilter;
      if (savedFilters.examFilter) examFilter = savedFilters.examFilter;
      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_results_sort") || "newest");
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter, sortOrder };
  }
  return systemState.resultsTableView;
}"""
    content = content.replace(old_results_view, new_results_view)

    old_students_view = """    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_students_filters") || "{}");
      if (savedFilters.quickFilter) quickFilter = savedFilters.quickFilter;
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize, quickFilter };
  }
  return systemState.studentsTableView;
}"""
    new_students_view = """    let sortOrder = "newest";
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_students_filters") || "{}");
      if (savedFilters.quickFilter) quickFilter = savedFilters.quickFilter;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_students_sort") || "newest");
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize, quickFilter, sortOrder };
  }
  return systemState.studentsTableView;
}"""
    content = content.replace(old_students_view, new_students_view)

    sync_results_fn = """
function syncResultsSortControlUI() {
  const select = document.getElementById("teacher-results-sort-order");
  if (!select) return;
  select.value = normalizeTableSortOrder(getResultsTableViewSettings().sortOrder || "newest");
}

function setupResultsTableSortControl() {
  const select = document.getElementById("teacher-results-sort-order");
  if (!select) return;
  syncResultsSortControlUI();
  if (select.dataset.bound) return;
  select.dataset.bound = "1";
  select.addEventListener("change", () => {
    const view = getResultsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.page = 1;
    try { localStorage.setItem("arabya_results_sort", view.sortOrder); } catch (e) {}
    renderStudentResultsTable();
  });
}
"""
    if "function syncResultsSortControlUI" not in content:
        content = content.replace(
            "function resetResultsTableFilters() {",
            sync_results_fn + "\nfunction resetResultsTableFilters() {",
        )

    content = content.replace(
        "  populateResultsExamFilterSelect();\n  syncResultsFilterControlsUI();",
        "  populateResultsExamFilterSelect();\n  syncResultsFilterControlsUI();\n  setupResultsTableSortControl();",
    )

    content = content.replace(
        "  setupResultsTablePaginationControls();\n  setupResultsTableSearchControl();\n  setupResultsTableFilterControls();",
        "  setupResultsTablePaginationControls();\n  setupResultsTableSearchControl();\n  setupResultsTableFilterControls();\n  setupResultsTableSortControl();",
    )

    content = content.replace(
        "  const sorted = sortResultsByRecency(systemState.results);\n  const filtered = filterResultsForTeacherTable(sorted);",
        "  const view = getResultsTableViewSettings();\n  const sorted = sortResultsForDisplay(systemState.results, view.sortOrder);\n  const filtered = filterResultsForTeacherTable(sorted);",
    )

    content = content.replace(
        "  const filtered = filterResultsForTeacherTable(sorted);\n  const view = getResultsTableViewSettings();",
        "  const filtered = filterResultsForTeacherTable(sorted);",
    )

    sync_students_fn = """
function syncStudentsSortControlUI() {
  const select = document.getElementById("teacher-students-sort-order");
  if (!select) return;
  select.value = normalizeTableSortOrder(getStudentsTableViewSettings().sortOrder || "newest");
}

function setupStudentsTableSortControl() {
  const select = document.getElementById("teacher-students-sort-order");
  if (!select) return;
  syncStudentsSortControlUI();
  if (select.dataset.bound) return;
  select.dataset.bound = "1";
  select.addEventListener("change", () => {
    const view = getStudentsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.page = 1;
    try { localStorage.setItem("arabya_students_sort", view.sortOrder); } catch (e) {}
    renderTeacherStudentsTable();
  });
}
"""
    if "function syncStudentsSortControlUI" not in content:
        content = content.replace(
            "function resetStudentsTableFilters() {",
            sync_students_fn + "\nfunction resetStudentsTableFilters() {",
        )

    content = content.replace(
        "  syncStudentsFilterControlsUI();\n  if (container.dataset.bound) return;",
        "  syncStudentsFilterControlsUI();\n  setupStudentsTableSortControl();\n  if (container.dataset.bound) return;",
    )

    content = content.replace(
        "  setupStudentsTablePaginationControls();\n  setupStudentsTableSearchControl();\n  setupStudentsTableFilterControls();",
        "  setupStudentsTablePaginationControls();\n  setupStudentsTableSearchControl();\n  setupStudentsTableFilterControls();\n  setupStudentsTableSortControl();",
    )

    content = content.replace(
        "  const reversed = [...systemState.students].reverse();\n  const filtered = filterStudentsForTeacherTable(reversed);\n  const view = getStudentsTableViewSettings();",
        "  const view = getStudentsTableViewSettings();\n  const sorted = sortStudentsForDisplay(systemState.students, view.sortOrder);\n  const filtered = filterStudentsForTeacherTable(sorted);",
    )

    return content


def patch_html(content: str) -> str:
    content = content.replace(
        '  <script src="questions.js?v=2026.05.31.6"></script>\n  <script src="app.js?v=2026.05.31.6"></script>',
        '  <script src="questions.js?v=2026.05.31.7"></script>\n  <script src="app.js?v=2026.05.31.7"></script>',
    )

    results_select = SORT_SELECT_HTML.format(select_id="teacher-results-sort-order")
    if 'id="teacher-results-sort-order"' not in content:
        content = content.replace(
            '              <button type="button" id="teacher-results-clear-filters"',
            results_select + '              <button type="button" id="teacher-results-clear-filters"',
        )

    students_select = SORT_SELECT_HTML.format(select_id="teacher-students-sort-order")
    if 'id="teacher-students-sort-order"' not in content:
        content = content.replace(
            '              <button type="button" id="teacher-students-clear-filters"',
            students_select + '              <button type="button" id="teacher-students-clear-filters"',
        )

    return content


def main() -> None:
    app = APP.read_text(encoding="utf-8")
    html = HTML.read_text(encoding="utf-8")
    APP.write_text(patch_app(app), encoding="utf-8")
    HTML.write_text(patch_html(html), encoding="utf-8")
    print("Patched app.js and index.html for table sort display")


if __name__ == "__main__":
    main()
