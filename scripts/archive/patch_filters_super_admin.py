#!/usr/bin/env python3
"""Restore teacher filters UI and super-admin session fixes."""
from pathlib import Path

APP = Path("/workspace/app.js")
text = APP.read_text(encoding="utf-8")

text = text.replace(
    'const ARABYA_APP_VERSION = "2026.05.31.27";',
    'const ARABYA_APP_VERSION = "2026.05.31.28";',
    1,
)

old_login = """function loginTeacherObject(teacher) {
  systemState.activeTeacher = normalizeTeacherAccount(teacher);
  localStorage.setItem("arabya_active_teacher_username", teacher.username);"""

new_login = """function loginTeacherObject(teacher, loginCredential) {
  const normalized = normalizeTeacherAccount(teacher);
  const credential = String(loginCredential or "").strip()
  if credential and credential in {"TEACHER2026"}:
    pass
"""

# Fix - use proper JS not python set
new_login = """function loginTeacherObject(teacher, loginCredential) {
  const normalized = normalizeTeacherAccount(teacher);
  const credential = String(loginCredential || "").trim();
  if (credential && ARABYA_SUPER_ADMIN_SEEDS.has(credential)) {
    normalized.role = ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
  }
  systemState.activeTeacher = normalized;
  systemState.activeTeacherLoginCredential = credential || "";
  localStorage.setItem("arabya_active_teacher_username", teacher.username);"""

if "activeTeacherLoginCredential" not in text and old_login in text:
    text = text.replace(old_login, new_login, 1)

text = text.replace(
    "    loginTeacherObject(matched);\n    const extraSyncUrl = document.getElementById(\"teacher-login-sync-url\")",
    "    loginTeacherObject(matched, passwordInput);\n    const extraSyncUrl = document.getElementById(\"teacher-login-sync-url\")",
    1,
)

if "loginTeacherObject(matched, codeVal)" not in text:
    text = text.replace(
        "    loginTeacherObject(matched);\n    const extraSyncUrl = document.getElementById(\"teacher-login-sync-url\")?.value.trim() || \"\";\n    syncTeacherDataOnLogin({\n      extraSyncUrl,\n      message:",
        "    loginTeacherObject(matched, codeVal);\n    const extraSyncUrl = document.getElementById(\"teacher-login-sync-url\")?.value.trim() || \"\";\n    syncTeacherDataOnLogin({\n      extraSyncUrl,\n      message:",
        1,
    )

text = text.replace(
    "      loginTeacherObject(matched);\n      navigateToView(\"teacher-dashboard-view\");\n      alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول تلقائياً عبر رمز الدخول السريع.`);",
    "      loginTeacherObject(matched, autoCode);\n      navigateToView(\"teacher-dashboard-view\");\n      alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول تلقائياً عبر رمز الدخول السريع.`);",
    1,
)

text = text.replace(
    "      loginTeacherObject(matched);\n      navigateToView(\"teacher-dashboard-view\");\n      alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول تلقائياً.`);",
    "      loginTeacherObject(matched, pass);\n      navigateToView(\"teacher-dashboard-view\");\n      alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول تلقائياً.`);",
    1,
)

old_infer = """  const username = String(teacher.username || "").trim();
  const password = String(teacher.password || "").trim();
  const autoCode = String(teacher.autoEntryCode || "").trim();
  if (ARABYA_SUPER_ADMIN_SEEDS.has(username) || ARABYA_SUPER_ADMIN_SEEDS.has(password) || ARABYA_SUPER_ADMIN_SEEDS.has(autoCode)) {"""

new_infer = """  const username = String(teacher.username || "").trim();
  const password = String(teacher.password || "").trim();
  const autoCode = String(teacher.autoEntryCode || "").trim();
  const sessionCredential = (teacher === systemState.activeTeacher && systemState.activeTeacherLoginCredential)
    ? String(systemState.activeTeacherLoginCredential).trim()
    : "";
  if (
    ARABYA_SUPER_ADMIN_SEEDS.has(username) ||
    ARABYA_SUPER_ADMIN_SEEDS.has(password) ||
    ARABYA_SUPER_ADMIN_SEEDS.has(autoCode) ||
    (sessionCredential && ARABYA_SUPER_ADMIN_SEEDS.has(sessionCredential))
  ) {"""

if "sessionCredential" not in text and old_infer in text:
    text = text.replace(old_infer, new_infer, 1)

old_opts = """  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  (systemState.exams || []).forEach(exam => {
    if (activeUsername && exam.teacher && exam.teacher !== activeUsername) return;
    if (exam.id) map.set(String(exam.id), exam.title || exam.id);
  });"""

new_opts = """  getTeacherScopedExams().forEach(exam => {
    if (exam.id) map.set(String(exam.id), exam.title || exam.id);
  });"""

if old_opts in text:
    text = text.replace(old_opts, new_opts, 1)

MARKUP = r'''
function ensureResultsQuickFiltersMarkup() {
  const container = document.getElementById("teacher-results-quick-filters");
  if (!container || document.getElementById("teacher-results-exam-filter")) return;
  container.classList.remove("hidden");
  container.removeAttribute("aria-hidden");
  container.style.cssText = "display:flex; flex-wrap:wrap; gap:0.85rem; align-items:flex-end; margin-bottom:1rem; padding:0.9rem; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.02);";
  delete container.dataset.bound;
  container.innerHTML = `
    <div>
      <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.4rem;">فلتر الحالة</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
        <button type="button" class="btn btn-primary btn-sm" data-results-status-filter="all">الكل</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="completed">مكتمل</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="incomplete">جاري</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="canceled">ملغى</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="retake_allowed">مسموح بإعادة الامتحان</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="superseded">محاولات سابقة</button>
      </div>
    </div>
    <div class="form-group" style="margin:0; min-width:190px; flex:1;">
      <label class="form-label" for="teacher-results-exam-filter" style="font-size:0.8rem;">الامتحان</label>
      <select id="teacher-results-exam-filter" class="form-control" style="padding:0.45rem 0.75rem;"><option value="">كل الامتحانات</option></select>
    </div>
    <div class="form-group" style="margin:0; min-width:150px;">
      <label class="form-label" for="teacher-results-date-filter" style="font-size:0.8rem;">التاريخ</label>
      <select id="teacher-results-date-filter" class="form-control" style="padding:0.45rem 0.75rem;">
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
    </div>
    <div class="form-group" style="margin:0; min-width:165px;">
      <label class="form-label" for="teacher-results-sort-order" style="font-size:0.8rem;">طريقة العرض</label>
      <select id="teacher-results-sort-order" class="form-control" style="padding:0.45rem 0.75rem;" aria-label="طريقة عرض الجدول">
        <option value="newest">الأحدث أولاً</option>
        <option value="oldest">الأقدم أولاً</option>
        <option value="name_asc">الاسم (أ → ي)</option>
        <option value="name_desc">الاسم (ي → أ)</option>
      </select>
    </div>
    <button type="button" id="teacher-results-clear-filters" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح الفلاتر</button>
  `;
  const legacySort = document.querySelector("#teacher-results-toolbar #teacher-results-sort-order");
  if (legacySort) legacySort.remove();
}

function ensureStudentsQuickFiltersMarkup() {
  const container = document.getElementById("teacher-students-quick-filters");
  if (!container || document.getElementById("teacher-students-sort-order")) return;
  container.classList.remove("hidden");
  container.removeAttribute("aria-hidden");
  container.style.cssText = "display:flex; flex-wrap:wrap; gap:0.85rem; align-items:flex-end; margin-bottom:1rem; padding:0.9rem; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.02);";
  delete container.dataset.bound;
  container.innerHTML = `
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
    <div class="form-group" style="margin:0; min-width:165px;">
      <label class="form-label" for="teacher-students-sort-order" style="font-size:0.8rem;">طريقة العرض</label>
      <select id="teacher-students-sort-order" class="form-control" style="padding:0.45rem 0.75rem;" aria-label="طريقة عرض الجدول">
        <option value="newest">الأحدث أولاً</option>
        <option value="oldest">الأقدم أولاً</option>
        <option value="name_asc">الاسم (أ → ي)</option>
        <option value="name_desc">الاسم (ي → أ)</option>
      </select>
    </div>
    <button type="button" id="teacher-students-clear-filters" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح الفلاتر</button>
  `;
  const legacySort = document.querySelector("#teacher-students-toolbar #teacher-students-sort-order");
  if (legacySort) legacySort.remove();
}

function ensureTeacherStatsTabMarkup() {
  if (document.getElementById("teacher-tab-stats")) return;
  const panel = document.querySelector(".teacher-main-panel");
  const examsTab = document.getElementById("teacher-tab-exams");
  if (!panel || !examsTab) return;
  const statsTab = document.createElement("div");
  statsTab.id = "teacher-tab-stats";
  statsTab.className = "teacher-tab-panel hidden";
  statsTab.setAttribute("role", "tabpanel");
  statsTab.innerHTML = document.getElementById("teacher-tab-stats-fallback")?.innerHTML || "";
}

'''

# Remove broken ensureTeacherStatsTabMarkup fallback - stats is in index.html now
MARKUP = MARKUP.split("function ensureTeacherStatsTabMarkup")[0]

if "function ensureResultsQuickFiltersMarkup()" not in text:
    text = text.replace("function populateResultsExamFilterSelect() {", MARKUP + "\nfunction populateResultsExamFilterSelect() {", 1)

text = text.replace(
    "function setupResultsTableFilterControls() {\n  const container = document.getElementById(\"teacher-results-quick-filters\");\n  if (!container) return;\n  populateResultsExamFilterSelect();",
    "function setupResultsTableFilterControls() {\n  ensureResultsQuickFiltersMarkup();\n  const container = document.getElementById(\"teacher-results-quick-filters\");\n  if (!container) return;\n  populateResultsExamFilterSelect();",
    1,
)

text = text.replace(
    "function setupStudentsTableFilterControls() {\n  const container = document.getElementById(\"teacher-students-quick-filters\");",
    "function setupStudentsTableFilterControls() {\n  ensureStudentsQuickFiltersMarkup();\n  const container = document.getElementById(\"teacher-students-quick-filters\");",
    1,
)

if "ensureResultsQuickFiltersMarkup();" not in text.split("setupUIEventListeners")[0][-500:]:
    text = text.replace(
        "  setupUIEventListeners();",
        "  ensureResultsQuickFiltersMarkup();\n  ensureStudentsQuickFiltersMarkup();\n  setupUIEventListeners();",
        1,
    )

APP.write_text(text, encoding="utf-8")
print("patched app.js", APP.stat().st_size)
