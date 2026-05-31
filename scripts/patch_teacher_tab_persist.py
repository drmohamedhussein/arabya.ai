#!/usr/bin/env python3
"""Persist and restore teacher dashboard active tab across refresh."""

from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app.js"
QUESTIONS = Path(__file__).resolve().parent.parent / "questions.js"
HTML = Path(__file__).resolve().parent.parent / "index.html"

TAB_HELPERS = '''
const TEACHER_ACTIVE_TAB_KEY = "arabya_teacher_active_tab";
const TEACHER_TAB_IDS = ["stats", "exams", "results", "students", "integration", "profile"];

function normalizeTeacherTabId(tabId) {
  const id = String(tabId || "").trim();
  return TEACHER_TAB_IDS.includes(id) ? id : "stats";
}

function getSavedTeacherActiveTab() {
  try {
    return normalizeTeacherTabId(localStorage.getItem(TEACHER_ACTIVE_TAB_KEY));
  } catch (e) {
    return "stats";
  }
}

function saveTeacherActiveTab(tabId) {
  try {
    localStorage.setItem(TEACHER_ACTIVE_TAB_KEY, normalizeTeacherTabId(tabId));
  } catch (e) {}
}

function activateTeacherTab(tabId, options = {}) {
  const normalizedTab = normalizeTeacherTabId(tabId);
  if (systemState.activeView !== "teacher-dashboard-view" && !options.force) return normalizedTab;

  document.querySelectorAll(".teacher-menu-item[data-tab]").forEach(item => {
    const isActive = item.dataset.tab === normalizedTab;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.querySelectorAll(".teacher-tab-panel").forEach(panel => {
    panel.classList.add("hidden");
  });
  const targetPanel = document.getElementById(`teacher-tab-${normalizedTab}`);
  if (targetPanel) targetPanel.classList.remove("hidden");

  if (!options.skipSave) saveTeacherActiveTab(normalizedTab);
  if (options.skipRefresh) return normalizedTab;

  reloadSystemStateFromLocalStorage();
  if (normalizedTab === "stats") {
    renderTeacherStatsDashboard();
  } else if (normalizedTab === "results") {
    if (typeof pullTeacherResultsFromCloud === "function") {
      pullTeacherResultsFromCloud();
    } else {
      syncDatabaseFromCloud({ silent: true }).finally(() => renderStudentResultsTable());
    }
  } else if (normalizedTab === "students") {
    syncDatabaseFromCloud({ silent: true }).finally(() => refreshTeacherDashboardViews({ all: true }));
  } else if (normalizedTab === "exams") {
    renderExamsList();
  }
  return normalizedTab;
}

function restoreTeacherActiveTab() {
  activateTeacherTab(getSavedTeacherActiveTab(), { skipSave: true, skipRefresh: true });
}

window.activateTeacherTab = activateTeacherTab;
'''

OLD_MENU = """  const menuItems = document.querySelectorAll(".teacher-menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      menuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      const tabId = item.dataset.tab;
      document.querySelectorAll(".teacher-tab-panel").forEach(panel => {
        panel.classList.add("hidden");
      });
      const targetPanel = document.getElementById(`teacher-tab-${tabId}`);
      if (targetPanel) targetPanel.classList.remove("hidden");
      reloadSystemStateFromLocalStorage();
      if (tabId === "stats") {
        renderTeacherStatsDashboard();
      } else if (tabId === "results") {
        if (typeof pullTeacherResultsFromCloud === "function") {
          pullTeacherResultsFromCloud();
        } else {
          syncDatabaseFromCloud({ silent: true }).finally(() => renderStudentResultsTable());
        }
      } else if (tabId === "students") {
        syncDatabaseFromCloud({ silent: true }).finally(() => refreshTeacherDashboardViews({ all: true }));
      } else if (tabId === "exams") {
        renderExamsList();
      } else if (tabId === "integration" || tabId === "profile") {
        loadTeacherDashboardData();
      }
    });
  });"""

NEW_MENU = """  const menuItems = document.querySelectorAll(".teacher-menu-item[data-tab]");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      activateTeacherTab(item.dataset.tab);
    });
  });"""

OLD_OPEN_TAB = """function openTeacherDashboardTab(tabId, afterOpen) {
  const menuItem = document.querySelector(`.teacher-menu-item[data-tab="${tabId}"]`);
  if (menuItem) menuItem.click();
  if (typeof afterOpen === "function") {
    setTimeout(afterOpen, 40);
  }
}"""

NEW_OPEN_TAB = """function openTeacherDashboardTab(tabId, afterOpen) {
  activateTeacherTab(tabId, { skipRefresh: true });
  if (typeof afterOpen === "function") {
    setTimeout(afterOpen, 40);
  }
}"""

OLD_LOAD_END = """  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced && synced.ok) {
      refreshTeacherDashboardViews({ all: true });
    }
  });
}"""

NEW_LOAD_END = """  restoreTeacherActiveTab();

  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced && synced.ok) {
      refreshTeacherDashboardViews({ all: true });
    }
  });
}"""

OLD_APPS_SCRIPT_NAV = """  navigateToView("teacher-dashboard-view");
  const tabIntegration = document.getElementById("teacher-tab-integration");
  document.querySelectorAll(".teacher-menu-item").forEach(i => i.classList.remove("active"));
  document.querySelectorAll(".teacher-menu-item").forEach(i => {
    if (i.dataset.tab === "integration") i.classList.add("active");
  });
  document.querySelectorAll(".teacher-tab-panel").forEach(p => p.classList.add("hidden"));
  tabIntegration.classList.remove("hidden");"""

NEW_APPS_SCRIPT_NAV = """  navigateToView("teacher-dashboard-view");
  activateTeacherTab("integration", { force: true, skipRefresh: true });"""

OLD_SET_EXAM_FILTER = """  persistResultsTableFilters();
  const resultsTabBtn = document.querySelector('[data-teacher-tab="teacher-tab-results"]');
  if (resultsTabBtn) resultsTabBtn.click();
  else navigateToView("teacher-dashboard-view");
  setTimeout(() => {
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  }, 50);
};"""

NEW_SET_EXAM_FILTER = """  persistResultsTableFilters();
  navigateToView("teacher-dashboard-view");
  activateTeacherTab("results", { force: true, skipRefresh: true });
  setTimeout(() => {
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  }, 50);
};"""

OLD_SHOW_PANEL = """function showArabyaTeacherPanel(tabId) {
  if (!tabId) return;
  repairArabyaTeacherPanelPlacementOnly();
  document.querySelectorAll(".teacher-tab-panel").forEach(function(panel) {
    panel.classList.add("hidden");
  });
  document.querySelectorAll(".teacher-menu-item").forEach(function(item) {
    item.classList.toggle("active", item.dataset.tab === tabId);
    if (item.dataset.tab) item.setAttribute("aria-selected", item.dataset.tab === tabId ? "true" : "false");
  });
  var panel = document.getElementById("teacher-tab-" + tabId);
  if (panel) panel.classList.remove("hidden");
}"""

NEW_SHOW_PANEL = """function showArabyaTeacherPanel(tabId) {
  if (!tabId) return;
  repairArabyaTeacherPanelPlacementOnly();
  if (typeof window.activateTeacherTab === "function") {
    window.activateTeacherTab(tabId, { force: true, skipRefresh: true });
    return;
  }
  document.querySelectorAll(".teacher-tab-panel").forEach(function(panel) {
    panel.classList.add("hidden");
  });
  document.querySelectorAll(".teacher-menu-item").forEach(function(item) {
    item.classList.toggle("active", item.dataset.tab === tabId);
    if (item.dataset.tab) item.setAttribute("aria-selected", item.dataset.tab === tabId ? "true" : "false");
  });
  var panel = document.getElementById("teacher-tab-" + tabId);
  if (panel) panel.classList.remove("hidden");
}"""


def patch_app(content: str) -> str:
    content = content.replace(
        'const ARABYA_APP_VERSION = "2026.05.31.7";',
        'const ARABYA_APP_VERSION = "2026.05.31.8";',
    )

    marker = "function refreshTeacherDashboardViews(options = {}) {"
    if marker not in content:
        raise SystemExit("refreshTeacherDashboardViews marker not found")
    if "function activateTeacherTab" not in content:
        content = content.replace(marker, TAB_HELPERS + "\n" + marker)

    content = content.replace(OLD_MENU, NEW_MENU)
    content = content.replace(OLD_OPEN_TAB, NEW_OPEN_TAB)
    content = content.replace(OLD_LOAD_END, NEW_LOAD_END)
    content = content.replace(OLD_APPS_SCRIPT_NAV, NEW_APPS_SCRIPT_NAV)
    content = content.replace(OLD_SET_EXAM_FILTER, NEW_SET_EXAM_FILTER)
    return content


def patch_questions(content: str) -> str:
    return content.replace(OLD_SHOW_PANEL, NEW_SHOW_PANEL)


def patch_html(content: str) -> str:
    return content.replace(
        '  <script src="questions.js?v=2026.05.31.7"></script>\n  <script src="app.js?v=2026.05.31.7"></script>',
        '  <script src="questions.js?v=2026.05.31.8"></script>\n  <script src="app.js?v=2026.05.31.8"></script>',
    )


def main() -> None:
    app = APP.read_text(encoding="utf-8")
    questions = QUESTIONS.read_text(encoding="utf-8")
    html = HTML.read_text(encoding="utf-8")
    APP.write_text(patch_app(app), encoding="utf-8")
    QUESTIONS.write_text(patch_questions(questions), encoding="utf-8")
    HTML.write_text(patch_html(html), encoding="utf-8")
    print("Patched teacher tab persistence")


if __name__ == "__main__":
    main()
