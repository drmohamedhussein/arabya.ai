/**
 * arabya.ai - ملف المنطق البرمجي الموحد المطور (app.js)
 * يتحكم في التوجيه، وإدارة الامتحانات، وتصميم الأسئلة اللانهائية والمقالية والموضوعية ذات الأوزان المخصصة،
 * والتكامل السحابي الثنائي، مع تطبيق معايير إتاحة الوصول (WAI-ARIA) الكاملة للطلاب المكفوفين.
 * الوحدات المستخرجة: js/arabya-utils.js, js/arabya-students.js, js/arabya-exam-config.js,
 *   js/arabya-cloud-api.js, js/arabya-exam-device.js, js/arabya-exam-anticheat.js, js/arabya-exam-runner.js
 */

// كائن الحالة العامة للنظام
const ARABYA_APP_BUILD_VERSION = "2026.06.02.29";
const MAX_CLOUD_BACKUP_JSON_BYTES = 4500000;
const ARABYA_CLOUD_BACKUP_SCOPE_GENERAL = "general";
const ARABYA_CLOUD_BACKUP_SCOPE_ALL = "all";
const ARABYA_UNIFIED_CLOUD_SYNC_FLAG = "arabya_unified_cloud_sync_v1";
window.ARABYA_APP_BUILD_VERSION = ARABYA_APP_BUILD_VERSION;
window.ARABYA_APP_VERSION = ARABYA_APP_BUILD_VERSION;


function readAppVersionFromLocalStorageConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    return cfg.appVersion ? String(cfg.appVersion).trim() : "";
  } catch (e) {
    return "";
  }
}

function resolvePlatformAppVersionDisplay() {
  // إصدار الكود المحمّل هو مصدر الحقيقة للعرض — لا يُعرض إصدار أقدم من localStorage أو السحابة
  return pickLatestAppVersion(
    ARABYA_APP_BUILD_VERSION,
    systemState.config?.appVersion,
    readAppVersionFromLocalStorageConfig()
  ) || ARABYA_APP_BUILD_VERSION;
}

function getRunningAppBuildVersion() {
  const fromHtml = document.documentElement?.getAttribute("data-arabya-build")
    || document.querySelector('meta[name="arabya-app-version"]')?.content
    || "";
  return pickLatestAppVersion(
    ARABYA_APP_BUILD_VERSION,
    window.ARABYA_APP_BUILD_VERSION,
    fromHtml
  ) || ARABYA_APP_BUILD_VERSION;
}

function getPlatformAppVersion() {
  return resolvePlatformAppVersionDisplay();
}

function applyPlatformAppVersion(version, options = {}) {
  const next = pickLatestAppVersion(
    ARABYA_APP_BUILD_VERSION,
    version,
    systemState.config?.appVersion,
    readAppVersionFromLocalStorageConfig()
  );
  if (!next) return;
  systemState.config = systemState.config || {};
  systemState.config.appVersion = next;
  window.ARABYA_APP_VERSION = next;
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    cfg.appVersion = next;
    localStorage.setItem("arabya_teacher_config", JSON.stringify(cfg));
  } catch (e) {}
  if (options.persistState !== false && typeof saveSystemState === "function") {
    saveSystemState(false);
  }
  updateTeacherAppVersionLabel();
}

function bootstrapPlatformAppVersionFromLocal() {
  applyPlatformAppVersion(ARABYA_APP_BUILD_VERSION, { persistState: false });
}

function syncPlatformAppVersionFromDatabase(data) {
  const remote = data && typeof data === "object"
    ? String(data.appVersion || data.config?.appVersion || "").trim()
    : "";
  const next = pickLatestAppVersion(
    ARABYA_APP_BUILD_VERSION,
    remote,
    systemState.config?.appVersion,
    readAppVersionFromLocalStorageConfig()
  );
  applyPlatformAppVersion(next, { persistState: false });
}

function ensurePlatformAppVersionBeforeCloudPush() {
  const next = pickLatestAppVersion(
    ARABYA_APP_BUILD_VERSION,
    getPlatformAppVersion(),
    readAppVersionFromLocalStorageConfig()
  );
  applyPlatformAppVersion(next, { persistState: false });
  return next;
}

async function refreshPlatformAppVersionFromCloud(options = {}) {
  bootstrapPlatformAppVersionFromLocal();
  await fetchPlatformAppVersionFromCloudMeta();
  updateTeacherAppVersionLabel();
  const buildIsAhead = compareAppVersionStrings(ARABYA_APP_BUILD_VERSION, readAppVersionFromLocalStorageConfig()) > 0
    || compareAppVersionStrings(ARABYA_APP_BUILD_VERSION, String(systemState.config?.appVersion || "")) > 0;
  if (options.pushIfBuildAhead !== false && buildIsAhead && typeof scheduleCloudBackupPush === "function") {
    ensurePlatformAppVersionBeforeCloudPush();
    scheduleCloudBackupPush("app_version_sync", { immediate: true });
  }
  return getPlatformAppVersion();
}

const ARABYA_ACCOUNT_ROLES = {
  SUPER_ADMIN: "super_admin",
  TEACHER: "teacher",
  STUDENT: "student"
};
const ARABYA_SUPER_ADMIN_SEEDS = new Set(["TEACHER2026"]);

function inferTeacherRole(teacher) {
  if (!teacher) return ARABYA_ACCOUNT_ROLES.TEACHER;
  if (teacher.role === ARABYA_ACCOUNT_ROLES.STUDENT) return ARABYA_ACCOUNT_ROLES.STUDENT;
  if (teacher.role === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) return ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
  const username = String(teacher.username || "").trim();
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
  ) {
    return ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
  }
  return teacher.role === ARABYA_ACCOUNT_ROLES.TEACHER ? ARABYA_ACCOUNT_ROLES.TEACHER : ARABYA_ACCOUNT_ROLES.TEACHER;
}

function normalizeTeacherAccount(teacher) {
  if (!teacher) return teacher;
  teacher.role = inferTeacherRole(teacher);
  return teacher;
}

function normalizeAllTeacherAccounts() {
  systemState.teachers = (systemState.teachers || []).map(t => normalizeTeacherAccount(t));
  try {
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
  } catch (e) {}
  if (systemState.activeTeacher) {
    const refreshed = systemState.teachers.find(t => t.username === systemState.activeTeacher.username);
    if (refreshed) systemState.activeTeacher = refreshed;
  }
}

function isSuperAdminTeacher(teacher) {
  return inferTeacherRole(teacher || systemState.activeTeacher) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
}

function isTeacherStaffAccount(teacher) {
  const role = inferTeacherRole(teacher || systemState.activeTeacher);
  return role === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN || role === ARABYA_ACCOUNT_ROLES.TEACHER;
}

function canDeleteStudents() {
  return isSuperAdminTeacher();
}

function canDeleteTeachers() {
  return isSuperAdminTeacher();
}

function canDeleteResults() {
  return !!systemState.activeTeacher && isTeacherStaffAccount();
}

function canManageTeacherRoles() {
  return isSuperAdminTeacher();
}

function canRegisterNewTeacherAccounts() {
  return isTeacherStaffAccount();
}

function canUsePublicTeacherRegistration() {
  if (!systemState.teachers || systemState.teachers.length === 0) return true;
  return isSuperAdminTeacher();
}
function canManageExamSettings() {
  return isTeacherStaffAccount();
}

function canTeacherManageExam(exam) {
  if (!canManageExamSettings()) return false;
  if (isSuperAdminTeacher()) return true;
  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  return !exam || !exam.teacher || exam.teacher === activeUsername;
}


function getTeacherRoleLabel(teacher) {
  const role = getActiveDashboardAccountRole(teacher);
  if (role === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) return "مدير المنصة (سوبر أدمن)";
  if (role === ARABYA_ACCOUNT_ROLES.STUDENT) return "حساب طالب";
  return "حساب معلم";
}

function getActiveDashboardAccountRole(account) {
  const teacher = account || systemState.activeTeacher;
  if (teacher) {
    if (teacher.role === ARABYA_ACCOUNT_ROLES.STUDENT || teacher.accountType === ARABYA_ACCOUNT_ROLES.STUDENT) {
      return ARABYA_ACCOUNT_ROLES.STUDENT;
    }
    const inferred = inferTeacherRole(teacher);
    if (inferred === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) return ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
    if (inferred === ARABYA_ACCOUNT_ROLES.STUDENT) return ARABYA_ACCOUNT_ROLES.STUDENT;
    return ARABYA_ACCOUNT_ROLES.TEACHER;
  }
  const student = systemState.currentStudent;
  if (student && (student.name || student.id)) return ARABYA_ACCOUNT_ROLES.STUDENT;
  return ARABYA_ACCOUNT_ROLES.TEACHER;
}

function getProfileTabLabelForRole(role) {
  if (role === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) return "الملف الشخصي للمدير";
  if (role === ARABYA_ACCOUNT_ROLES.STUDENT) return "الملف الشخصي للطالب";
  return "الملف الشخصي للمعلم";
}

function updateTeacherProfileTabLabels() {
  const role = getActiveDashboardAccountRole();
  const label = getProfileTabLabelForRole(role);
  const menuLabel = document.getElementById("teacher-profile-tab-menu-label");
  if (menuLabel) menuLabel.textContent = label;
  const menuItem = document.getElementById("teacher-profile-tab-menu-item");
  if (menuItem) menuItem.setAttribute("aria-label", label);
  const panelTitle = document.getElementById("teacher-profile-panel-title");
  if (panelTitle) panelTitle.textContent = label;
  const panelSubtitle = document.getElementById("teacher-profile-panel-subtitle");
  if (panelSubtitle) {
    if (role === ARABYA_ACCOUNT_ROLES.STUDENT) {
      panelSubtitle.textContent = "بيانات الطالب المسجل والاشتراك في الامتحانات";
    } else if (role === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) {
      panelSubtitle.textContent = "بيانات مدير المنصة، المادة التعليمية، ورابط الدخول المباشر";
    } else {
      panelSubtitle.textContent = "الملف الشخصي واسم المادة التعليمية المخصصة للطلاب ورابط الدخول المباشر";
    }
  }
  const saveBtnLabel = document.getElementById("save-teacher-profile-btn-label");
  if (saveBtnLabel) {
    saveBtnLabel.textContent = role === ARABYA_ACCOUNT_ROLES.STUDENT ? "حفظ بيانات الطالب" : "حفظ الملف الشخصي";
  }
  renderTeacherProfilePanel();
}

function getStudentDashboardAccount() {
  const role = getActiveDashboardAccountRole();
  if (role !== ARABYA_ACCOUNT_ROLES.STUDENT || !systemState.activeTeacher) return null;
  const teacher = systemState.activeTeacher;
  const code = sanitizeStudentCodeInput(teacher.autoEntryCode || teacher.password || "");
  let student = (systemState.students || []).find(s =>
    sanitizeStudentCodeInput(s.code) === code ||
    normalizeStudentId(s.id) === normalizeStudentId(teacher.username)
  );
  if (!student) {
    student = {
      name: teacher.name || "",
      id: teacher.integrationConfig?.entryId || teacher.username || "",
      code: code || "",
      studentKey: getStudentLookupKey({ name: teacher.name, id: teacher.username, code })
    };
  }
  return student;
}

function renderStudentDashboardProfile() {
  const student = getStudentDashboardAccount();
  const nameEl = document.getElementById("student-dashboard-profile-name");
  const idEl = document.getElementById("student-dashboard-profile-id");
  const codeEl = document.getElementById("student-dashboard-profile-code");
  const historyEl = document.getElementById("student-dashboard-exam-history");
  if (!student || !historyEl) return;

  if (nameEl) nameEl.textContent = student.name || "—";
  if (idEl) idEl.textContent = student.id || "—";
  if (codeEl) codeEl.textContent = student.code || "—";

  const keys = new Set(getStudentLookupKeysForMatch(student).filter(Boolean));
  const rows = (systemState.results || [])
    .filter(res => keys.has(res.studentLookupKey) || normalizeStudentId(res.id) === normalizeStudentId(student.id))
    .sort((a, b) => compareResultsByRecency(a, b, buildResultIndexMap(systemState.results)));

  if (!rows.length) {
    historyEl.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">لا توجد نتائج مسجلة لهذا الحساب بعد.</div>';
    return;
  }

  historyEl.innerHTML = rows.map(res => {
    const status = isSupersededResult(res) ? "محاولة سابقة" : res.status === "canceled" ? "ملغاة" : getResultDisplayStatus(res) === "incomplete" ? "غير مكتملة" : "مكتملة";
    const tone = res.status === "canceled" ? "var(--error)" : isSupersededResult(res) ? "var(--text-muted)" : "var(--secondary)";
    return `<div class="result-query-card" style="text-align:right; margin-bottom:0.5rem;">` +
      `<div class="result-query-title">${escapeHtml(res.examTitle || "امتحان")}</div>` +
      `<div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(res.timestamp || "—")} · <span style="color:${tone}; font-weight:700;">${escapeHtml(status)}</span></div>` +
      `<div style="font-weight:800; color:var(--secondary); margin-top:0.35rem;">${escapeHtml(formatResultGradeCell(res))}</div>` +
      `</div>`;
  }).join("");
}

function renderTeacherProfilePanel() {
  const role = getActiveDashboardAccountRole();
  const staffPanel = document.getElementById("teacher-profile-staff-panel");
  const studentPanel = document.getElementById("teacher-profile-student-panel");
  const isStudent = role === ARABYA_ACCOUNT_ROLES.STUDENT;
  if (staffPanel) staffPanel.classList.toggle("hidden", isStudent);
  if (studentPanel) studentPanel.classList.toggle("hidden", !isStudent);
  if (isStudent) {
    renderStudentDashboardProfile();
    return;
  }
  const sheetsBox = document.getElementById("teacher-profile-sheets-box");
  const sheetsInput = document.getElementById("teacher-profile-sheets-url");
  const sheetsUrl = (systemState.activeTeacher?.integrationConfig?.googleFormUrl || systemState.config?.googleFormUrl || "").trim();
  if (sheetsBox && sheetsInput) {
    const hasUrl = !!(sheetsUrl && (sheetsUrl.includes("/macros/s/") || sheetsUrl.endsWith("/exec")));
    sheetsBox.classList.toggle("hidden", !hasUrl);
    sheetsInput.value = sheetsUrl;
  }
}

function updateTeacherAppVersionLabel() {
  let versionEl = document.getElementById("teacher-app-version-label");
  if (!versionEl) {
    const sidebar = document.querySelector(".teacher-sidebar");
    if (sidebar) {
      versionEl = document.createElement("div");
      versionEl.id = "teacher-app-version-label";
      versionEl.className = "teacher-app-version-label";
      versionEl.setAttribute("aria-live", "polite");
      versionEl.setAttribute("aria-label", "إصدار التطبيق الحالي");
      sidebar.appendChild(versionEl);
    }
  }
  const runningBuild = getRunningAppBuildVersion();
  const platformVersion = pickLatestAppVersion(runningBuild, resolvePlatformAppVersionDisplay());
  const label = compareAppVersionStrings(platformVersion, runningBuild) > 0
    ? `إصدار التطبيق: ${platformVersion} (بناء ${runningBuild})`
    : `إصدار التطبيق: ${runningBuild}`;
  if (versionEl) versionEl.textContent = label;
  try {
    document.documentElement.setAttribute("data-arabya-build", runningBuild);
  } catch (e) {}
  if (typeof window.enforceArabyaBuildVersion === "function") {
    window.enforceArabyaBuildVersion();
  }
}

function updateTeacherDashboardAccessUI() {
  updateTeacherAppVersionLabel();
  updateTeacherProfileTabLabels();
  const subtitle = document.getElementById("teacher-sidebar-subtitle");
  if (subtitle && systemState.activeTeacher) {
    subtitle.textContent = `${getTeacherRoleLabel()} · ${systemState.activeTeacher.name || ""}`;
  }
  const roleBadge = document.getElementById("teacher-account-role-badge");
  if (roleBadge) {
    const superAdmin = isSuperAdminTeacher();
    roleBadge.textContent = superAdmin ? "سوبر أدمن" : "معلم";
    roleBadge.className = superAdmin ? "teacher-role-badge is-super-admin" : "teacher-role-badge is-teacher";
  }
  document.querySelectorAll("[data-super-admin-only]").forEach(el => {
    el.classList.toggle("hidden", !isSuperAdminTeacher());
  });
  const regLink = document.getElementById("teacher-public-register-link");
  if (regLink) regLink.classList.toggle("hidden", !canUsePublicTeacherRegistration());
}

let superAdminEditingTeacherUsername = null;

function getTeacherStaffCapabilitySummary() {
  return [
    { feature: "كل الامتحانات والنتائج", superAdmin: true, teacher: false },
    { feature: "إعدادات تشغيل الامتحان (وقت، عشوائي، عدد الأسئلة)", superAdmin: true, teacher: true },
    { feature: "فلاتر النتائج والطلاب والإحصائيات", superAdmin: true, teacher: true },
    { feature: "حذف/تعديل نتائج الطلاب", superAdmin: true, teacher: true },
    { feature: "حذف الطلاب", superAdmin: true, teacher: false },
    { feature: "إدارة حسابات المعلمين (تبويب المعلمين)", superAdmin: true, teacher: false },
    { feature: "حذف حسابات المعلمين", superAdmin: true, teacher: false },
    { feature: "تعديل ملفات المعلمين والربط السحابي", superAdmin: true, teacher: "حسابه فقط" }
  ];
}

function renderTeacherCapabilityMatrix() {
  const tbody = document.getElementById("teacher-capability-matrix-body");
  if (!tbody) return;
  tbody.innerHTML = getTeacherStaffCapabilitySummary().map(row => `
    <tr>
      <td>${escapeHtml(row.feature)}</td>
      <td style="text-align:center; color:var(--secondary); font-weight:700;">${row.superAdmin === true ? "✓" : escapeHtml(String(row.superAdmin))}</td>
      <td style="text-align:center;">${row.teacher === true ? "✓" : row.teacher === false ? "—" : escapeHtml(String(row.teacher))}</td>
    </tr>
  `).join("");
}

function countTeacherExams(username) {
  return (systemState.exams || []).filter(exam => exam.teacher === username).length;
}

function fillSuperAdminTeacherEditorForm(teacher) {
  const isNew = !teacher;
  const panel = document.getElementById("teacher-account-editor-panel");
  if (panel) panel.classList.toggle("hidden", false);
  const titleEl = document.getElementById("teacher-account-editor-title");
  if (titleEl) titleEl.textContent = isNew ? "إضافة معلم جديد" : `تعديل حساب: ${teacher.name || teacher.username}`;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  setVal("super-admin-teacher-name", teacher?.name || "");
  setVal("super-admin-teacher-username", teacher?.username || "");
  setVal("super-admin-teacher-subject", teacher?.subject || "");
  setVal("super-admin-teacher-password", teacher?.password || teacher?.autoEntryCode || "");
  setVal("super-admin-teacher-autocode", teacher?.autoEntryCode || teacher?.password || "");
  const cfg = teacher?.integrationConfig || {};
  setVal("super-admin-teacher-sync-url", cfg.googleFormUrl || "");
  setVal("super-admin-teacher-entry-name", cfg.entryName || "");
  setVal("super-admin-teacher-entry-id", cfg.entryId || "");
  setVal("super-admin-teacher-entry-code", cfg.entryCode || "");
  setVal("super-admin-teacher-entry-score", cfg.entryScore || "");
  setVal("super-admin-teacher-entry-details", cfg.entryDetails || "");

  const usernameInput = document.getElementById("super-admin-teacher-username");
  if (usernameInput) usernameInput.readOnly = !isNew;
}

window.openTeacherAccountEditor = function(username) {
  if (!isSuperAdminTeacher()) {
    alert("إدارة المعلمين متاحة لمدير المنصة (سوبر أدمن) فقط.");
    return;
  }
  if (!username) {
    superAdminEditingTeacherUsername = null;
    fillSuperAdminTeacherEditorForm(null);
    return;
  }
  const teacher = systemState.teachers.find(t => t.username === username);
  if (!teacher) {
    alert("لم يتم العثور على حساب المعلم.");
    return;
  }
  superAdminEditingTeacherUsername = teacher.username;
  fillSuperAdminTeacherEditorForm(teacher);
  document.getElementById("teacher-account-editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.closeTeacherAccountEditor = function() {
  superAdminEditingTeacherUsername = null;
  document.getElementById("teacher-account-editor-panel")?.classList.add("hidden");
};

function readSuperAdminTeacherEditorForm() {
  const get = (id) => document.getElementById(id)?.value.trim() || "";
  return {
    name: get("super-admin-teacher-name"),
    username: get("super-admin-teacher-username"),
    subject: get("super-admin-teacher-subject"),
    password: get("super-admin-teacher-password"),
    autoEntryCode: get("super-admin-teacher-autocode"),
    integrationConfig: {
      googleFormUrl: get("super-admin-teacher-sync-url"),
      entryName: get("super-admin-teacher-entry-name"),
      entryId: get("super-admin-teacher-entry-id"),
      entryCode: get("super-admin-teacher-entry-code"),
      entryScore: get("super-admin-teacher-entry-score"),
      entryDetails: get("super-admin-teacher-entry-details")
    }
  };
}

window.saveTeacherAccountBySuperAdmin = async function() {
  if (!isSuperAdminTeacher()) {
    alert("حفظ بيانات المعلمين متاح لمدير المنصة فقط.");
    return;
  }
  const form = readSuperAdminTeacherEditorForm();
  if (!form.name || !form.username || !form.subject || !form.password || !form.autoEntryCode) {
    alert("يرجى ملء جميع الحقول الإلزامية (الاسم، اسم المستخدم، المادة، الرقم السري، رمز الدخول).");
    return;
  }

  const duplicateCode = systemState.teachers.some(t => {
    if (superAdminEditingTeacherUsername && t.username === superAdminEditingTeacherUsername) return false;
    return t.autoEntryCode === form.autoEntryCode || t.password === form.autoEntryCode;
  });
  if (duplicateCode) {
    alert("رمز الدخول مستخدم من قبل معلم آخر. اختر رمزاً فريداً.");
    return;
  }

  let teacherRecord = null;
  if (superAdminEditingTeacherUsername) {
    const idx = systemState.teachers.findIndex(t => t.username === superAdminEditingTeacherUsername);
    if (idx === -1) {
      alert("تعذّر العثور على حساب المعلم للتعديل.");
      return;
    }
    if (inferTeacherRole(systemState.teachers[idx]) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN && form.username !== superAdminEditingTeacherUsername) {
      alert("لا يمكن تغيير اسم مستخدم سوبر أدمن.");
      return;
    }
    teacherRecord = {
      ...systemState.teachers[idx],
      name: form.name,
      username: systemState.teachers[idx].username,
      subject: form.subject,
      password: form.password,
      autoEntryCode: form.autoEntryCode,
      integrationConfig: { ...(systemState.teachers[idx].integrationConfig || {}), ...form.integrationConfig },
      role: systemState.teachers[idx].role || ARABYA_ACCOUNT_ROLES.TEACHER
    };
    systemState.teachers[idx] = normalizeTeacherAccount(teacherRecord);
    teacherRecord = systemState.teachers[idx];
    if (systemState.activeTeacher && systemState.activeTeacher.username === teacherRecord.username) {
      await loginTeacherObject(teacherRecord, systemState.activeTeacherLoginCredential || form.autoEntryCode);
    }
  } else {
    const exists = systemState.teachers.some(t => t.username.toLowerCase() === form.username.toLowerCase());
    if (exists) {
      alert("اسم المستخدم مسجل مسبقاً.");
      return;
    }
    teacherRecord = normalizeTeacherAccount({
      name: form.name,
      username: form.username,
      subject: form.subject,
      password: form.password,
      autoEntryCode: form.autoEntryCode,
      integrationConfig: form.integrationConfig,
      role: ARABYA_ACCOUNT_ROLES.TEACHER
    });
    systemState.teachers.push(teacherRecord);
  }

  if (window.ArabyaSecurity) {
    await window.ArabyaSecurity.ensureTeacherPasswordHashed(teacherRecord, form.password);
    const idx = systemState.teachers.findIndex(t => t.username === teacherRecord.username);
    if (idx !== -1) systemState.teachers[idx] = teacherRecord;
  }

  saveTeachersToLocalStorage();
  saveSystemState(false);
  const syncResult = await syncTeacherCredentialsToCloud(teacherRecord);
  await syncLocalDatabaseToCloud();
  renderTeacherAccountsPanel();
  closeTeacherAccountEditor();
  const statusEl = document.getElementById("teacher-accounts-sync-status");
  if (statusEl) {
    statusEl.innerHTML = syncResult.ok
      ? `<span class="material-icons" style="vertical-align:middle;color:var(--success);">cloud_done</span> تم الحفظ والمزامنة السحابية لحساب ${escapeHtml(teacherRecord.name)}.`
      : `<span class="material-icons" style="vertical-align:middle;color:var(--warning);">cloud_queue</span> تم الحفظ محلياً — تحقق من رابط Google Sheets للمزامنة.`;
  }
  alert(formatTeacherCredentialSyncMessage(syncResult));
};

window.syncTeacherAccountBySuperAdmin = async function(username) {
  if (!isSuperAdminTeacher()) return;
  const teacher = systemState.teachers.find(t => t.username === username);
  if (!teacher) return;
  const statusEl = document.getElementById("teacher-accounts-sync-status");
  if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري مزامنة ${escapeHtml(teacher.name || username)}...`;
  const syncResult = await syncTeacherCredentialsToCloud(teacher);
  await syncLocalDatabaseToCloud();
  if (statusEl) {
    statusEl.innerHTML = syncResult.ok
      ? `<span class="material-icons" style="vertical-align:middle;color:var(--success);">cloud_done</span> تمت مزامنة ${escapeHtml(teacher.name || username)}.`
      : `<span class="material-icons" style="vertical-align:middle;color:var(--error);">cloud_off</span> فشلت المزامنة — تحقق من إعدادات الربط.`;
  }
};

window.syncAllTeachersToCloudBySuperAdmin = async function() {
  if (!isSuperAdminTeacher()) return;
  const statusEl = document.getElementById("teacher-accounts-sync-status");
  if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري مزامنة جميع المعلمين...`;
  let okCount = 0;
  for (const teacher of systemState.teachers) {
    const res = await syncTeacherCredentialsToCloud(teacher);
    if (res.ok) okCount += 1;
  }
  const backupOk = await syncLocalDatabaseToCloud();
  if (statusEl) {
    statusEl.innerHTML = `<span class="material-icons" style="vertical-align:middle;color:var(--${backupOk ? "success" : "warning"});">cloud_done</span> تمت مزامنة ${okCount} من ${systemState.teachers.length} معلم${backupOk ? " + نسخة احتياطية كاملة." : "."}`;
  }
};

function renderTeacherAccountsPanel() {
  renderTeacherCapabilityMatrix();
  const tbody = document.getElementById("teacher-accounts-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!isSuperAdminTeacher()) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted);">عرض وإدارة حسابات المعلمين متاح لمدير المنصة (سوبر أدمن) فقط.</td></tr>';
    return;
  }
  if (!systemState.teachers.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted);">لا توجد حسابات معلمين.</td></tr>';
    return;
  }
  systemState.teachers.forEach(teacher => {
    const isSelf = systemState.activeTeacher && teacher.username === systemState.activeTeacher.username;
    const roleLabel = inferTeacherRole(teacher) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN ? "سوبر أدمن" : "معلم";
    const examCount = countTeacherExams(teacher.username);
    const syncConfigured = !!(teacher.integrationConfig && teacher.integrationConfig.googleFormUrl);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(teacher.name || "")}</td>
      <td><code>${escapeHtml(teacher.username || "")}</code></td>
      <td>${escapeHtml(roleLabel)}</td>
      <td><code>${escapeHtml(teacher.autoEntryCode || "—")}</code></td>
      <td>${examCount} امتحان · ${syncConfigured ? '<span style="color:var(--secondary);">مزامنة مهيأة</span>' : '<span style="color:var(--text-muted);">بدون رابط</span>'}</td>
      <td class="teacher-accounts-actions" style="display:flex;gap:0.35rem;flex-wrap:wrap;"></td>
    `;
    const actions = row.querySelector(".teacher-accounts-actions");
    if (isSelf) {
      actions.textContent = "حسابك الحالي";
    } else if (inferTeacherRole(teacher) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-outline btn-sm";
      editBtn.textContent = "تعديل";
      editBtn.addEventListener("click", () => openTeacherAccountEditor(teacher.username));
      actions.appendChild(editBtn);
    } else {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-primary btn-sm";
      editBtn.textContent = "تعديل";
      editBtn.addEventListener("click", () => openTeacherAccountEditor(teacher.username));
      actions.appendChild(editBtn);
      const syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "btn btn-outline btn-sm";
      syncBtn.style.cssText = "border-color:var(--secondary);color:var(--secondary);";
      syncBtn.textContent = "مزامنة";
      syncBtn.addEventListener("click", () => syncTeacherAccountBySuperAdmin(teacher.username));
      actions.appendChild(syncBtn);
      if (canDeleteTeachers()) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-outline btn-sm";
        delBtn.style.cssText = "border-color:var(--error);color:var(--error);";
        delBtn.textContent = "حذف";
        delBtn.addEventListener("click", () => deleteTeacherAccount(teacher.username));
        actions.appendChild(delBtn);
      }
    }
    tbody.appendChild(row);
  });
}

window.deleteTeacherAccount = async function(username) {
  if (!canDeleteTeachers()) {
    alert("حذف حسابات المعلمين متاح لمدير المنصة (سوبر أدمن) فقط.");
    return;
  }
  const teacher = systemState.teachers.find(t => t.username === username);
  if (!teacher) {
    alert("لم يتم العثور على حساب المعلم.");
    return;
  }
  if (inferTeacherRole(teacher) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) {
    alert("لا يمكن حذف حساب سوبر أدمن.");
    return;
  }
  if (!confirm(`هل تريد حذف حساب المعلم "${teacher.name}"؟`)) return;
  const examCount = countTeacherExams(username);
  if (examCount > 0) {
    const proceed = confirm(`هذا المعلم لديه ${examCount} امتحاناً مسجلاً. حذف الحساب يبقي الامتحانات في النظام (يمكن لسوبر الأدمن إدارتها). هل تريد المتابعة؟`);
    if (!proceed) return;
  }
  systemState.teachers = systemState.teachers.filter(t => t.username !== username);
  if (superAdminEditingTeacherUsername === username) closeTeacherAccountEditor();
  saveTeachersToLocalStorage();
  saveSystemState(false);
  renderTeacherAccountsPanel();
  const synced = await syncLocalDatabaseToCloud();
  alert(synced ? "تم حذف حساب المعلم ومزامنة قاعدة البيانات السحابية." : "تم حذف حساب المعلم محلياً. أعد المزامنة من تبويب الربط عند توفر الاتصال.");
};

function ensureStudentAccountType(student) {
  if (!student) return student;
  if (!student.accountType) student.accountType = ARABYA_ACCOUNT_ROLES.STUDENT;
  return student;
}



let systemState = {
  activeView: "welcome-view",
  
  // المعلم النشط حالياً وقائمة المعلمين
  activeTeacher: null,
  teachers: [],
  
  // بيانات المعلم والملف الشخصي الافتراضية
  teacherProfile: {
    name: "معلم اللغة العربية",
    subject: "اللغة العربية وآدابها"
  },
  
  // قاعدة بيانات الامتحانات (محملة من LocalStorage أو الافتراضية)
  exams: [],
  
  // قاعدة بيانات نتائج الطلاب المخزنة
  results: [],
  
  // قاعدة بيانات الطلاب وأكواد اشتراكاتهم
  students: [],
  /** مفاتيح طلاب محذوفين — لا يُعاد إنشاؤهم من النتائج أو السحابة */
  deletedStudentKeys: [],
  /** معرفات نتائج محذوفة — لا تُعاد من السحابة أو ورقة الشيت */
  deletedResultKeys: [],
  /** إيقاف جلب السحابة مؤقتاً بعد حذف طالب حتى لا يعود السجل */
  cloudPullSuspendedUntil: 0,
  
  // حالة الطالب والاختبار الحالي
  currentStudent: {
    name: "",
    id: "",
    accessCode: "",
    studentKey: "",
    email: "",
    mobile: ""
  },
  currentExam: null,
  currentExamRuntime: null,
  shuffledQuestions: [],
  currentQuestionIndex: 0,
  studentAnswers: {}, // { questionId: selectedIndex_or_essayText }
  
  // المؤقت
  timer: {
    intervalId: null,
    timeLimit: 60,
    timeRemaining: 60
  },
  
  isExamActive: false,
  isCheatingSuspended: false,
  cheatViolations: 0,
  examDeadlineTimerId: null,
  
  // إعدادات التكامل مع جوجل شيت
  config: {
    teacherCode: "TEACHER2026",
    appVersion: ARABYA_APP_BUILD_VERSION,
    googleFormUrl: "",
    entryName: "",
    entryId: "",
    entryCode: "",
    entryScore: "",
    entryDetails: "",
    autoEntryCode: "TEACHER2026"
  }
};

window.systemState = systemState;

// ==========================================
// 1. تهيئة النظام عند التحميل
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // ===== فحص localStorage قبل أي شيء =====
  try {
    localStorage.setItem("arabya_test", "ok");
    const t = localStorage.getItem("arabya_test");
    localStorage.removeItem("arabya_test");
    if (t !== "ok") throw new Error("localStorage read/write mismatch");
  } catch(lsErr) {
    alert("⚠️ تحذير: لا يمكن الوصول إلى ذاكرة التخزين المحلي (localStorage). قد يكون المتصفح في وضع التصفح الخاص أو تم تعطيل التخزين. لن يتم حفظ أي بيانات!");
    console.error("localStorage unavailable:", lsErr);
  }

  initDatabase();
  bootstrapPlatformAppVersionFromLocal();
  applyUnifiedCloudSyncModel();
  stripEmptyHashFromUrl();
  setupNavigation();
  ensureResultsQuickFiltersMarkup();
  ensureStudentsQuickFiltersMarkup();
  setupUIEventListeners();
  setupAntiCheatHandlers();
  setupStudentAutofill();
  loadDeletedStudentKeysFromStorage();
  setupArabyaLiveDataRefresh();
  setupMobileSiteNavigation();
  hydrateGoogleSheetsScriptBox();
  refreshCloudSyncStatusUI();
  if (window.ArabyaSecurity) {
    window.ArabyaSecurity.setupTeacherIdleSessionGuard(window.logoutTeacher);
  }
  window.systemState = systemState;
  window.loadExamDeviceRegistry = loadExamDeviceRegistry;
  window.getArabyaWebAppUrls = getArabyaWebAppUrls;
  window.getGeneralTeacherSyncUrls = getGeneralTeacherSyncUrls;
  window.getCloudBackupTargetUrls = getCloudBackupTargetUrls;
  window.getCloudBackupScope = getCloudBackupScope;
  window.getEffectiveExamSyncUrl = getEffectiveExamSyncUrl;
  window.getUnifiedTeacherSyncUrl = getUnifiedTeacherSyncUrl;
  window.applyUnifiedCloudSyncModel = applyUnifiedCloudSyncModel;
  window.getPlatformAppVersion = getPlatformAppVersion;
  window.getRunningAppBuildVersion = getRunningAppBuildVersion;
  window.applyPlatformAppVersion = applyPlatformAppVersion;
  window.refreshPlatformAppVersionFromCloud = refreshPlatformAppVersionFromCloud;
  window.compareAppVersionStrings = compareAppVersionStrings;
  window.pickLatestAppVersion = pickLatestAppVersion;
  window.resolveCloudBackupTargetUrls = resolveCloudBackupTargetUrls;
  window.ARABYA_CLOUD_BACKUP_SCOPE_GENERAL = ARABYA_CLOUD_BACKUP_SCOPE_GENERAL;
  window.ARABYA_CLOUD_BACKUP_SCOPE_ALL = ARABYA_CLOUD_BACKUP_SCOPE_ALL;
  window.normalizeArabyaWebAppUrl = normalizeArabyaWebAppUrl;
  window.isSuperAdminTeacher = isSuperAdminTeacher;
  window.inferTeacherRole = inferTeacherRole;
  window.isTeacherStaffAccount = isTeacherStaffAccount;
  if (window.ArabyaOfflineQueue) window.ArabyaOfflineQueue.installListeners();
  if (window.ArabyaRealtimeBridge) window.ArabyaRealtimeBridge.startRealtimeSync();

  // ===== تشخيص ما تم تحميله =====
  console.log(`[ARABYA] إصدار المنصة: ${getPlatformAppVersion()} (بناء ${ARABYA_APP_BUILD_VERSION})`);
  updateTeacherAppVersionLabel();
  console.log(`[ARABYA] تم تحميل قاعدة البيانات:`,
    `معلمون=${systemState.teachers.length}`,
    `امتحانات=${systemState.exams.length}`,
    `طلاب=${systemState.students.length}`,
    `نتائج=${systemState.results.length}`
  );

  // استعادة جلسة الطالب النشطة إن وجدت ومنع ضياع الإجابات
  const savedSession = localStorage.getItem("arabya_active_student_session");
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session && session.student && session.examId) {
        const answered = Object.keys(session.studentAnswers || {}).length;
        const totalQ = (session.shuffledQuestions || []).length;
        const qIndex = (session.currentQuestionIndex || 0) + 1;
        const resume = confirm(
          `وجدنا جلسة امتحان محفوظة لـ "${session.student.name}".\n\n` +
          `التقدم: السؤال ${qIndex} من ${totalQ || "؟"} · إجابات محفوظة: ${answered}\n` +
          `مخالفات غش مسجلة: ${session.cheatViolations || 0}\n\n` +
          `هل تريد استكمال الامتحان من حيث توقفت؟ (اختر «إلغاء» لبدء جلسة جديدة لاحقاً)`
        );
        if (resume) {
          systemState.currentStudent = session.student;
          const matchedExam = systemState.exams.find(e => e.id === session.examId);
          const resumeKey = session.student?.studentKey || getStudentLookupKey(session.student || {});
          const resumeContext = buildStudentMatchContext(session.student || { studentKey: resumeKey });
          const blocking = findBlockingExamResult(resumeKey, session.examId, resumeContext);
          if (blocking) {
            localStorage.removeItem("arabya_active_student_session");
            alert(blocking.status === "canceled"
              ? "لا يمكن استكمال هذا الامتحان لأنه مُلغى. تواصل مع المعلم."
              : "لا يمكن استكمال هذا الامتحان لأنه مُسلَّم مسبقاً.");
          } else if (matchedExam) {
            if (isExamPastDeadline(matchedExam)) {
              alert(getExamDeadlineBlockMessage(matchedExam));
              localStorage.removeItem("arabya_active_student_session");
            } else {
              systemState.currentExam = matchedExam;
              systemState.shuffledQuestions = session.shuffledQuestions || buildRuntimeQuestionsForExam(matchedExam);
              systemState.currentExamRuntime = session.currentExamRuntime || calculateRuntimeExamMeta(systemState.shuffledQuestions);
              systemState.currentQuestionIndex = session.currentQuestionIndex || 0;
              systemState.studentAnswers = session.studentAnswers || {};
              systemState.cheatViolations = session.cheatViolations || 0;
              systemState.cheatAttemptLog = Array.isArray(session.cheatAttemptLog) ? session.cheatAttemptLog : [];
              systemState.examMaxCheatAttemptsAllowed = session.examMaxCheatAttemptsAllowed ?? getExamMaxCheatAttempts(matchedExam);
              systemState.examDeviceProfile = session.examDeviceProfile || examDeviceProfileFromStudent(session.student);
              systemState.isExamActive = true;
              systemState.isCheatingSuspended = false;
              markExamAntiCheatStarted();
              navigateToView("exam-runner-view");
              renderRunnerQuestion();
              showMobileExamHintIfNeeded();
              const resumeQuestion = systemState.shuffledQuestions[systemState.currentQuestionIndex];
              startRunnerTimerWithTime(session.timeRemaining || getEffectiveQuestionTimeSeconds(resumeQuestion, matchedExam));
              startExamDeadlineWatcher();
              return;
            }
          }
        } else {
          localStorage.removeItem("arabya_active_student_session");
        }
      }
    } catch(e) {
      localStorage.removeItem("arabya_active_student_session");
    }
  }
  
  void (async () => {
  const wasRedirected = await checkUrlParameters();
  if (!wasRedirected) {
    const savedView = localStorage.getItem("arabya_active_view");
    if (savedView && savedView !== "exam-runner-view") {
      if (savedView === "teacher-dashboard-view") {
        const activeTeacherUsername = localStorage.getItem("arabya_active_teacher_username");
        if (activeTeacherUsername) {
          const matched = systemState.teachers.find(t => t.username === activeTeacherUsername);
          if (matched) {
            await loginTeacherObject(matched);
            navigateToView("teacher-dashboard-view");
          } else {
            navigateToView("teacher-login-view");
          }
        } else {
          navigateToView("teacher-login-view");
        }
      } else {
        navigateToView(savedView);
      }
    } else {
      navigateToView("welcome-view");
    }
  }
  })();
});

// تهيئة قواعد البيانات المحلية
function initDatabase() {
  // 1. تهيئة قاعدة بيانات المعلمين
  let savedTeachers = localStorage.getItem("arabya_teachers_db");
  if (savedTeachers) {
    try {
      systemState.teachers = JSON.parse(savedTeachers);
    } catch(e) {
      systemState.teachers = [];
    }
  }
  
  // إذا لم يكن هناك معلمون، نقوم بإنشاء المعلم الافتراضي
  if (systemState.teachers.length === 0) {
    const defaultTeacher = {
      name: "مدير المنصة ARABYA",
      username: "TEACHER2026",
      subject: "إدارة المنصة الشاملة",
      password: "TEACHER2026",
      autoEntryCode: "TEACHER2026",
      role: ARABYA_ACCOUNT_ROLES.SUPER_ADMIN,
      integrationConfig: {
        googleFormUrl: "",
        entryName: "",
        entryId: "",
        entryCode: "",
        entryScore: "",
        entryDetails: ""
      }
    };
    systemState.teachers.push(normalizeTeacherAccount(defaultTeacher));
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
  }

  normalizeAllTeacherAccounts();
  systemState.students = (systemState.students || []).map(s => ensureStudentAccountType(s));

  // محاولة تحميل المعلم النشط من الجلسة السابقة
  const activeTeacherUsername = localStorage.getItem("arabya_active_teacher_username");
  if (activeTeacherUsername) {
    const matched = systemState.teachers.find(t => t.username === activeTeacherUsername);
    if (matched) {
      systemState.activeTeacher = matched;
      systemState.teacherProfile = { name: matched.name, subject: matched.subject };
      systemState.config = {
        ...(systemState.config || {}),
        teacherCode: matched.password,
        appVersion: systemState.config?.appVersion || ARABYA_APP_BUILD_VERSION,
        googleFormUrl: matched.integrationConfig?.googleFormUrl || "",
        entryName: matched.integrationConfig?.entryName || "",
        entryId: matched.integrationConfig?.entryId || "",
        entryCode: matched.integrationConfig?.entryCode || "",
        entryScore: matched.integrationConfig?.entryScore || "",
        entryDetails: matched.integrationConfig?.entryDetails || "",
        autoEntryCode: matched.autoEntryCode || matched.password
      };
    }
  } else {
    // كباك وورد للمحافظة على التوافق
    systemState.activeTeacher = systemState.teachers[0];
  }
  
  const savedConfig = localStorage.getItem("arabya_teacher_config");
  if (savedConfig && systemState.activeTeacher) {
    try { 
      const parsedConfig = JSON.parse(savedConfig);
      systemState.config = { ...systemState.config, ...parsedConfig }; 
      systemState.activeTeacher.integrationConfig = {
        googleFormUrl: systemState.config.googleFormUrl,
        entryName: systemState.config.entryName,
        entryId: systemState.config.entryId,
        entryCode: systemState.config.entryCode,
        entryScore: systemState.config.entryScore,
        entryDetails: systemState.config.entryDetails
      };
      const configCode = parsedConfig.teacherCode || parsedConfig.autoEntryCode;
      if (configCode) {
        syncActiveTeacherCredentials(String(configCode).trim());
      }
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    } catch(e){}
  }

  const savedProfile = localStorage.getItem("arabya_teacher_profile");
  if (savedProfile && systemState.activeTeacher) {
    try {
      const parsedProfile = JSON.parse(savedProfile);
      systemState.teacherProfile = parsedProfile;
      if (parsedProfile.name) systemState.activeTeacher.name = parsedProfile.name;
      if (parsedProfile.subject) systemState.activeTeacher.subject = parsedProfile.subject;
      const storedCode = systemState.activeTeacher.autoEntryCode || systemState.activeTeacher.password || systemState.config?.teacherCode || systemState.config?.autoEntryCode;
      if (storedCode) {
        systemState.teacherProfile.autoEntryCode = storedCode;
      } else if (parsedProfile.autoEntryCode) {
        syncActiveTeacherCredentials(parsedProfile.autoEntryCode);
      }
      localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    } catch(e){}
  }

  if (systemState.activeTeacher) {
    syncActiveTeacherCredentials();
  }
  
  // 2. تهيئة قاعدة بيانات الامتحانات
  const savedExams = localStorage.getItem("arabya_exams_db");
  if (savedExams) {
    try {
      systemState.exams = JSON.parse(savedExams);
    } catch (e) {
      systemState.exams = []; // نبدأ بقائمة فارغة عند تلف البيانات
    }
  } else {
    systemState.exams = [];
  }

  // تحميل بنك الأسئلة الافتراضي مرة واحدة فقط حتى لا تظهر بوابة الطالب فارغة في أول تشغيل.
  const defaultsSeeded = localStorage.getItem("arabya_default_exams_seeded") === "yes";
  const sourceDefaults = typeof defaultExams !== "undefined" ? defaultExams : window.defaultExams;
  if (systemState.exams.length === 0 && !defaultsSeeded && Array.isArray(sourceDefaults)) {
    systemState.exams = sourceDefaults.map(exam => ({
      ...JSON.parse(JSON.stringify(exam)),
      teacher: exam.teacher || (systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية"),
      timeLimit: exam.timeLimit || 60,
      shuffleQuestions: exam.shuffleQuestions !== false,
      questionCount: exam.questionCount || ""
    }));
    localStorage.setItem("arabya_default_exams_seeded", "yes");
  }
  ensureExamsDataShape();

  localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  
  // 3. تهيئة نتائج الطلاب
  const savedResults = localStorage.getItem("arabya_results_db");
  if (savedResults) {
    try { systemState.results = JSON.parse(savedResults); } catch(e){}
  }
  ensureResultRecordIds();
  hydratePresentedQuestionsForResults();
  hydrateResultAnswerDataForResults();

  // 4. تهيئة قاعدة بيانات الطلاب وأكوادهم
  const savedStudents = localStorage.getItem("arabya_students_db");
  if (savedStudents) {
    try {
      systemState.students = JSON.parse(savedStudents);
    } catch(e) {
      systemState.students = [];
    }
  } else {
    // إنشاء كود اشتراك افتراضي تجريبي
    systemState.students = [
      { name: "طالب تجريبي", id: "STU100", code: "00000", email: "", mobile: "", timestamp: new Date().toLocaleDateString("ar-EG") }
    ];
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  }
  loadDeletedStudentKeysFromStorage();
  loadDeletedResultKeysFromStorage();
  systemState.students = filterOutDeletedStudents(systemState.students);
  systemState.results = filterOutDeletedResults(systemState.results);
  bootstrapPlatformAppVersionFromLocal();
}

async function fetchPlatformAppVersionFromCloudMeta() {
  const urls = getGeneralTeacherSyncUrls();
  for (const rawUrl of urls) {
    const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_sync_meta";
    try {
      const res = await fetch(fetchUrl, { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const body = await res.json();
      if (body && body.appVersion) {
        syncPlatformAppVersionFromDatabase({ appVersion: body.appVersion });
        return true;
      }
    } catch (e) {}
  }
  return false;
}

// حفظ قاعدة بيانات المعلمين محلياً (دون مزامنة سحابية)

function syncActiveTeacherCredentials(preferredCode = "") {
  if (!systemState.activeTeacher) return;
  const code = String(
    preferredCode ||
    systemState.activeTeacher.autoEntryCode ||
    systemState.activeTeacher.password ||
    systemState.config?.autoEntryCode ||
    systemState.config?.teacherCode ||
    ""
  ).trim();
  if (!code) return;
  systemState.activeTeacher.autoEntryCode = code;
  systemState.activeTeacher.password = code;
  systemState.config = {
    ...(systemState.config || {}),
    autoEntryCode: code,
    teacherCode: code
  };
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx].autoEntryCode = code;
    systemState.teachers[idx].password = code;
  }
  try {
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  } catch (e) {}
}

function saveTeachersToLocalStorage() {
  localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
}

// حفظ قاعدة بيانات الطلاب محلياً (دون مزامنة سحابية)
function saveStudentsToLocalStorage() {
  localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
}

// دالة موحدة لحفظ حالة النظام بالكامل ومزامنتها سحابياً
function isCloudPullSuspended() {
  return !!(systemState.cloudPullSuspendedUntil && Date.now() < systemState.cloudPullSuspendedUntil);
}

function suspendCloudPullForMs(ms) {
  const duration = Number(ms) > 0 ? Number(ms) : 60000;
  systemState.cloudPullSuspendedUntil = Date.now() + duration;
}

function touchExamContentRevision(exam) {
  if (!exam) return;
  exam.questionsUpdatedAt = new Date().toISOString();
  exam.localRevision = Date.now();
}

function beginCriticalCloudPush(reason) {
  systemState.lastCloudPushError = "";
  systemState.cloudPushInProgress = true;
  systemState.ignoreCloudRevisionUntil = Date.now() + 60000;
  suspendCloudPullForMs(60000);
  systemState.lastCloudPushReason = reason || "";
}

function endCriticalCloudPush(ok) {
  systemState.cloudPushInProgress = false;
  if (ok) {
    systemState.lastSuccessfulLocalPushAt = Date.now();
    systemState.ignoreCloudRevisionUntil = Date.now() + 25000;
  } else {
    systemState.ignoreCloudRevisionUntil = Date.now() + 5000;
  }
}

async function pushLocalStateToCloudNow(reason) {
  const urls = getCloudBackupTargetUrls();
  if (!urls.length) {
    systemState.lastCloudPushError = "لم يُضبط رابط Web App في تبويب «الربط بـ Google Sheets».";
    return false;
  }
  if (window.ArabyaCloudSync && typeof window.ArabyaCloudSync.waitForPushSlot === "function") {
    await window.ArabyaCloudSync.waitForPushSlot(15000);
  }
  if (window.ArabyaCloudSync && typeof window.ArabyaCloudSync.pushNow === "function") {
    return window.ArabyaCloudSync.pushNow(reason || "push");
  }
  beginCriticalCloudPush(reason);
  try {
    return await pushCloudBackupNow(reason || "push");
  } finally {
    if (systemState.cloudPushInProgress) {
      endCriticalCloudPush(false);
    }
  }
}

function saveSystemState(syncToCloud = true) {
  try {
    applyDeletionTombstonesToLocalState();
    persistDeletedStudentKeys();
    persistDeletedResultKeys();
    if (Array.isArray(systemState.teachers)) {
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    }
    if (Array.isArray(systemState.exams)) {
      localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
    }
    if (Array.isArray(systemState.students)) {
      localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
    }
    if (Array.isArray(systemState.results)) {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    }
  } catch(e) {
    console.error("saveSystemState: خطأ في حفظ البيانات محلياً:", e);
  }
  
  if (syncToCloud) {
    suspendCloudPullForMs(20000);
    if (typeof scheduleCloudBackupPush === "function") {
      scheduleCloudBackupPush("saveSystemState", { immediate: true });
    } else {
      autoSyncToCloud();
    }
  }
}


function ensureResultRecordIds() {
  let changed = false;
  systemState.results.forEach(res => {
    if (!res.recordId) {
      res.recordId = createRecordId("result");
      changed = true;
    }
    if (!res.studentLookupKey) {
      const inferredKey = getStudentLookupKey({
        id: res.id,
        name: res.name,
        code: res.accessCode || res.code || ""
      });
      if (inferredKey) {
        res.studentLookupKey = inferredKey;
        changed = true;
      }
    }
    if (!Number.isFinite(res.savedAt)) {
      const match = String(res.recordId || "").match(/(?:result|incomplete|record)_(\d{10,})_/i);
      if (match) {
        res.savedAt = parseInt(match[1], 10);
        changed = true;
      }
    }
  });
  if (changed) {
    try {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    } catch(e) {
      console.error("تعذر تحديث معرفات النتائج:", e);
    }
  }
}




function isSupersededResult(res) {
  return !!(res && res.superseded);
}

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
    return `هل تريد السماح للطالب "${res.name}" بإعادة أداء "${examTitle}" بعد الإلغاء؟\n\nلن تُحذف المحاولة الأولى — تبقى محفوظة في السجل حتى ينهي الطالب المحاولة الجديدة.`;
  }
  return `هل تريد السماح للطالب "${res.name}" بإعادة أداء "${examTitle}"؟\n\nلن تُحذف المحاولة الأولى (الدرجة: ${res.score || "—"}) — ستُؤرشف كـ «محاولة سابقة» فقط بعد إكمال الطالب للمحاولة الجديدة.`;
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


function findActiveRetakeGrant(studentLookupKey, examId, studentContext) {
  if (!examId) return null;
  const ctx = studentContext || buildStudentMatchContext({ studentKey: studentLookupKey || "" });
  if (!ctx || (!ctx.studentKey && !ctx.id && !ctx.name && !ctx.accessCode)) return null;
  return systemState.results.find(r =>
    r.examId === examId &&
    r.allowRetake === true &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    resultMatchesStudentIdentity(r, ctx)
  ) || null;
}

/** يفتح إعادة الامتحان إذا سمح المعلم صراحةً أو حرّر/غيّر IP للسجل السابق */
function canStudentBypassExamLockForExam(examId, studentContext) {
  if (!examId || !studentContext) return false;
  if (findActiveRetakeGrant(null, examId, studentContext)) return true;
  return (systemState.results || []).some(r =>
    r.examId === examId &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    isResultIpReleasedByStaff(r) &&
    resultMatchesStudentIdentity(r, studentContext)
  );
}

function resultCanGrantRetake(res) {
  if (!res || isSupersededResult(res) || res.status === "incomplete") return false;
  return res.allowRetake !== true;
}

function resultHasActiveRetakeGrant(res) {
  return !!(res && res.allowRetake === true && !isSupersededResult(res) && res.status !== "incomplete");
}

function getResultRetakeStatusText(res) {
  if (isSupersededResult(res)) return "محاولة سابقة مؤرشفة";
  if (isResultIpReleasedByStaff(res)) return "تم تحرير IP — يمكن للطالب إعادة الامتحان ببيانات مختلفة";
  if (resultHasActiveRetakeGrant(res)) return "مسموح بإعادة الامتحان — المحاولة الأولى محفوظة";
  if (res.status === "canceled") return "ملغى — بانتظار السماح بإعادة الامتحان";
  return "مكتمل — لا إعادة تقديم نشطة";
}

function markPriorResultsSuperseded(studentLookupKey, examId, newRecordId) {
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
}

function appendResultRetakeActions(res, actionsCell) {
  if (!actionsCell || !res || isSupersededResult(res)) return;

  if (resultCanGrantRetake(res)) {
    const allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.className = "btn btn-outline btn-sm";
    allowBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary);";
    allowBtn.textContent = getRetakeGrantButtonLabel(res);
    allowBtn.title = "المحاولة الأولى تبقى محفوظة — تُؤرشف فقط بعد إكمال محاولة جديدة";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));
    actionsCell.appendChild(allowBtn);
  }

  if (resultHasActiveRetakeGrant(res)) {
    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn btn-outline btn-sm";
    revokeBtn.style.cssText = "border-color:var(--warning); color:var(--warning);";
    revokeBtn.textContent = "إلغاء السماح";
    revokeBtn.addEventListener("click", () => revokeStudentExamRetake(res.recordId || ""));
    actionsCell.appendChild(revokeBtn);
  }
}

function getStudentExamAttempts(res) {
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

function renderResultRetakeManagementPanel(res) {
  const statusEl = document.getElementById("detail-retake-status");
  const actionsEl = document.getElementById("detail-retake-actions");
  if (!statusEl || !actionsEl) return;

  const statusText = getResultRetakeStatusText(res);
  const tone = isSupersededResult(res)
    ? "var(--text-muted)"
    : resultHasActiveRetakeGrant(res)
      ? "var(--secondary)"
      : res.status === "canceled"
        ? "var(--error)"
        : "var(--text-muted)";

  statusEl.innerHTML = `<strong style="color:${tone};">${escapeHtml(statusText)}</strong>` +
    (res.retakeGrantedAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">تاريخ السماح: ${escapeHtml(formatRetakeTimestamp(res.retakeGrantedAt))}</div>` : "") +
    (res.supersededAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">استُبدلت بتاريخ: ${escapeHtml(formatRetakeTimestamp(res.supersededAt))}</div>` : "");

  actionsEl.innerHTML = "";
  if (isSupersededResult(res)) {
    actionsEl.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">هذه محاولة سابقة محفوظة للأرشفة فقط.</span>`;
    return;
  }

  if (resultCanGrantRetake(res)) {
    const allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.className = "btn btn-outline btn-sm";
    allowBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary);";
    allowBtn.textContent = getRetakeGrantButtonLabel(res);
    allowBtn.title = "المحاولة الأولى تبقى محفوظة — تُؤرشف فقط بعد إكمال محاولة جديدة";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));
    actionsEl.appendChild(allowBtn);
  }

  if (resultHasActiveRetakeGrant(res)) {
    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn btn-outline btn-sm";
    revokeBtn.style.cssText = "border-color:var(--warning); color:var(--warning);";
    revokeBtn.textContent = "إلغاء السماح بإعادة التقديم";
    revokeBtn.addEventListener("click", () => revokeStudentExamRetake(res.recordId || ""));
    actionsEl.appendChild(revokeBtn);
  }
}

function formatRetakeTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  }
  return String(value);
}

function canManageResultDeviceIp() {
  return !!systemState.activeTeacher && isTeacherStaffAccount();
}

function isResultIpReleasedByStaff(res) {
  return !!(res && res.ipReleasedByTeacher);
}

function isValidIpv4OrV6(value) {
  const ip = String(value || "").trim();
  if (!ip) return true;
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6 = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
  return ipv4.test(ip) || ipv6.test(ip);
}

function buildResultCloudIpReleaseFields(res) {
  return {
    ipReleasedByTeacher: !!res?.ipReleasedByTeacher,
    ipReleasedAt: res?.ipReleasedAt || "",
    ipReleasedBy: res?.ipReleasedBy || ""
  };
}


async function persistResultRecordWithCloudSync(res, syncStatusEl) {
  if (!res) return false;
  saveSystemState(true);
  if (syncStatusEl) {
    syncStatusEl.innerHTML = '<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري حفظ البيانات ومزامنتها مع Google Sheets...';
  }
  sendUpdatedResultToCloud(res, syncStatusEl);
  let cloudOk = false;
  try {
    cloudOk = await syncLocalDatabaseToCloud();
  } catch (e) {
    console.error("[ARABYA] syncLocalDatabaseToCloud after result edit:", e);
  }
  renderStudentResultsTable();
  if (typeof renderTeacherStudentsTable === "function") {
    try { renderTeacherStudentsTable(); } catch (e) {}
  }
  return cloudOk;
}

function applyResultIpReleaseByStaff(res, newIpValue, syncStatusEl) {
  if (!canManageResultDeviceIp()) {
    alert("صلاحية تعديل أو حذف IP متاحة للمعلم ومدير المنصة (سوبر أدمن) فقط.");
    return Promise.resolve(false);
  }
  if (!res || !res.recordId) {
    alert("لم يتم العثور على سجل النتيجة.");
    return Promise.resolve(false);
  }
  const ip = String(newIpValue ?? "").trim();
  if (ip && !isValidIpv4OrV6(ip)) {
    alert("صيغة عنوان IP غير صالحة. اترك الحقل فارغاً للحذف أو أدخل IPv4/IPv6 صحيحاً.");
    return Promise.resolve(false);
  }
  const teacher = systemState.activeTeacher || {};
  res.clientIp = ip;
  res.ipReleasedByTeacher = true;
  res.ipReleasedAt = new Date().toISOString();
  res.ipReleasedBy = teacher.name || teacher.username || "معلم";
  const lookupKey = res.studentLookupKey || getStudentLookupKey({ id: res.id, name: res.name, code: res.accessCode });
  if (lookupKey && res.examId) {
    clearExamDeviceRegistryForStudentExam(lookupKey, res.examId);
  }
  if (ip && res.examId) {
    addAllowedRetakeIpToExam(res.examId, ip);
  }
  return persistResultRecordWithCloudSync(res, syncStatusEl).then(() => {
    renderTeacherResultDeviceIpPanel(res);
    renderDetailExamAllowedIpsList(res.examId || "");
    if (res.examId && currentEditingExamId === res.examId) {
      const exam = systemState.exams.find(e => e.id === res.examId);
      if (exam) renderExamAllowedIpsList(exam);
    }
    if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
      renderResultRetakeManagementPanel(res);
    }
    return true;
  });
}

function buildResultCloudRetakeFields(res) {
  return {
    allowRetake: !!res?.allowRetake,
    superseded: !!res?.superseded,
    retakeGrantedAt: res?.retakeGrantedAt || "",
    retakeGrantedBy: res?.retakeGrantedBy || "",
    retakeRevokedAt: res?.retakeRevokedAt || "",
    supersededAt: res?.supersededAt || "",
    supersededByRecordId: res?.supersededByRecordId || ""
  };
}

window.allowStudentExamRetake = async function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (!resultCanGrantRetake(res)) {
    alert("لا يمكن منح إعادة التقديم لهذا السجل حالياً.");
    return;
  }
  if (!confirm(getRetakeGrantConfirmMessage(res))) return;

  res.allowRetake = true;
  res.retakeGrantedAt = new Date().toISOString();
  res.retakeGrantedBy = systemState.activeTeacher?.username || "teacher";
  delete res.retakeRevokedAt;
  const lookupKey = res.studentLookupKey || getStudentLookupKey({ id: res.id, name: res.name, code: res.accessCode });
  if (lookupKey && res.examId) {
    clearExamDeviceRegistryForStudentExam(lookupKey, res.examId);
  }
  const syncEl = document.getElementById("grading-sync-status");
  const cloudOk = await persistResultRecordWithCloudSync(res, syncEl);
  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
    renderResultRetakeManagementPanel(res);
  }
  alert(
    `تم السماح للطالب "${res.name}" بإعادة أداء الامتحان.\n\n` +
    `المحاولة الأولى ما زالت محفوظة — لن تُؤرشف إلا بعد إكمال الطالب لمحاولة جديدة.` +
    (cloudOk ? "\n\nتمت مزامنة التحديث مع Google Sheets." : "\n\nتم الحفظ محلياً — تحقق من ربط Google Sheets إن لم تظهر التحديثات في الشيت.")
  );
};

window.revokeStudentExamRetake = async function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (!resultHasActiveRetakeGrant(res)) {
    alert("لا يوجد سماح نشط بإعادة التقديم على هذا السجل.");
    return;
  }
  if (!confirm(`هل تريد إلغاء السماح بإعادة التقديم للطالب "${res.name}"؟`)) return;

  res.allowRetake = false;
  res.retakeRevokedAt = new Date().toISOString();
  const syncEl = document.getElementById("grading-sync-status");
  const cloudOk = await persistResultRecordWithCloudSync(res, syncEl);
  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
    renderResultRetakeManagementPanel(res);
  }
  alert(cloudOk ? "تم إلغاء السماح بإعادة التقديم ومزامنة التحديث مع Google Sheets." : "تم إلغاء السماح بإعادة التقديم محلياً — تحقق من ربط Google Sheets.");
};

function findBlockingExamResult(studentLookupKey, examId, studentContext) {
  if (!examId) return null;
  const ctx = studentContext || buildStudentMatchContext({ studentKey: studentLookupKey || "" });
  if (!ctx || (!ctx.studentKey && !ctx.id && !ctx.name && !ctx.accessCode)) return null;
  if (findActiveRetakeGrant(studentLookupKey, examId, ctx)) return null;
  return systemState.results.find(r =>
    r.examId === examId &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled") &&
    !isResultIpReleasedByStaff(r) &&
    resultMatchesStudentIdentity(r, ctx)
  ) || null;
}

function getStudentCanceledExamIds(studentLookupKey) {
  if (!studentLookupKey) return [];
  const ids = new Set();
  systemState.results.forEach(r => {
    if (isSupersededResult(r)) return;
    if (r.studentLookupKey === studentLookupKey && r.status === "canceled" && r.allowRetake !== true && r.examId) {
      ids.add(r.examId);
    }
  });
  return [...ids];
}

function formatResultStatusBadge(res) {
  if (isSupersededResult(res)) {
    return '<span style="color:var(--text-muted); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[محاولة سابقة]</span>';
  }
  if (resultHasActiveRetakeGrant(res)) {
    return '<span style="color:var(--secondary); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[مسموح بإعادة التقديم]</span>';
  }
  if (res.status === "canceled" && res.allowRetake !== true) {
    return '<span style="color:var(--error); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[تم إلغاء الامتحان]</span>';
  }
  if (res.status === "incomplete") {
    return '<span style="color:var(--warning); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[جاري]</span>';
  }
  const cheatCount = Number(res.cheatViolations) || 0;
  if (cheatCount > 0) {
    const max = res.maxCheatAttemptsAllowed ?? res.maxCheatAttempts ?? "؟";
    return `<span style="color:var(--error); font-weight:700; font-size:0.75rem; margin-right:0.35rem; display:inline-block;">[غش ${cheatCount}/${max}]</span>`;
  }
  return "";
}

/** درجة مختصرة لجدول النتائج — بدون نص الأسئلة (التفاصيل من «عرض / تعديل») */
function parseGradeFromScoreText_(text, maxFallback) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (/جاري الأداء/i.test(raw)) return "جاري الأداء…";
  let m = raw.match(/تعادل\s*([\d.,]+)\s*من\s*([\d.,]+)/i);
  if (m) return `${m[1]} / ${m[2]}`;
  m = raw.match(/([\d.,]+)\s*من\s*([\d.,]+)\s*درج/i);
  if (m) return `${m[1]} / ${m[2]}`;
  m = raw.match(/^([\d.,]+)\s*\/\s*([\d.,]+)(?:\s*\(|$|\s)/);
  if (m) return `${m[1]} / ${m[2]}`;
  m = raw.match(/([\d.]+)\s*\/\s*([\d.]+)\s*أسئلة\s*موضوعية/i);
  if (m) {
    const max = Number(maxFallback);
    if (Number.isFinite(max) && max > 0 && Number(m[2]) > 0) {
      const scaled = Math.round((Number(m[1]) / Number(m[2])) * max * 100) / 100;
      return `${scaled} / ${max}`;
    }
    return `${m[1]} / ${m[2]}`;
  }
  if (raw.length <= 48 && !/س\s*\(|إجابة الطالب|سؤال\s*\(/i.test(raw)) return raw;
  return "";
}

function formatResultGradeCell(res) {
  if (!res) return "—";
  const status = getResultDisplayStatus(res);
  if (status === "canceled") return "ملغي";
  if (status === "incomplete") return "غير مكتمل";

  const max = Number(res.maxScore);
  const hasMax = Number.isFinite(max) && max > 0;

  if (res.questionScores && typeof res.questionScores === "object") {
    const earned = Object.values(res.questionScores).reduce((sum, val) => sum + (Number(val) || 0), 0);
    if (Number.isFinite(earned) && (earned > 0 || hasMax)) {
      return hasMax ? `${earned} / ${max}` : String(earned);
    }
  }

  const parsed = parseGradeFromScoreText_(res.score, hasMax ? max : null);
  if (parsed) return parsed;

  const raw = String(res.score || "").trim();
  if (!raw) return hasMax ? `— / ${max}` : "—";
  if (raw.length > 80 || /س\s*\(|إجابة الطالب|الصحيحة:/i.test(raw)) {
    return hasMax ? `— / ${max}` : "—";
  }
  return raw.length <= 48 ? raw : "—";
}

function getResultNumericGrade(res) {
  const cell = formatResultGradeCell(res);
  if (cell === "—" || cell === "ملغي" || cell === "غير مكتمل" || /جاري/i.test(cell)) return -1;
  const pair = cell.match(/([\d.,]+)\s*\/\s*([\d.,]+)/);
  if (pair) return parseFloat(String(pair[1]).replace(",", "."));
  const single = parseFloat(String(cell).replace(",", "."));
  return Number.isFinite(single) ? single : -1;
}

function ensureExamsDataShape() {
  if (!Array.isArray(systemState.exams)) {
    systemState.exams = [];
    return;
  }
  systemState.exams.forEach(exam => sanitizeQuestionConfig(exam));
}

function getConfiguredQuestionCount(exam) {
  if (!exam) return null;
  const parsed = parseInt(exam.questionCount, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, Array.isArray(exam.questions) ? exam.questions.length : 0);
}

function buildRuntimeQuestionsForExam(exam) {
  const sourceQuestions = Array.isArray(exam?.questions) ? [...exam.questions] : [];
  if (!sourceQuestions.length) return [];
  const shouldShuffle = exam.shuffleQuestions !== false;
  const questionCount = getConfiguredQuestionCount(exam);
  const runtime = shouldShuffle ? shuffle([...sourceQuestions]) : sourceQuestions;
  if (questionCount) {
    return runtime.slice(0, questionCount);
  }
  return runtime;
}



function normalizeQuestionMatchText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractQuestionTextsFromResultDetails(details) {
  if (!details || typeof details !== "string") return [];
  const texts = [];
  const chunks = details.split(/\n-{3,}\n?/);
  chunks.forEach(chunk => {
    const lines = chunk.split("\n").map(line => line.trim()).filter(Boolean);
    lines.forEach(line => {
      const objectiveMatch = line.match(/^س\s*\(وزنها\s*\d+\s*نق(?:طة|اط)?\)\s*:\s*(.+?)\s*\|\s*إجابة/i);
      if (objectiveMatch) {
        texts.push(objectiveMatch[1].trim());
        return;
      }
      const essayMatch = line.match(/^س\s*مقالي\s*\(وزنها\s*\d+\s*نق(?:طة|اط)?\)\s*:\s*(.+)$/i);
      if (essayMatch) {
        texts.push(essayMatch[1].trim());
      }
    });
  });
  return texts;
}

function matchPresentedQuestionsFromDetails(res, exam) {
  if (!exam || !Array.isArray(exam.questions) || !res?.details) return [];
  const texts = extractQuestionTextsFromResultDetails(res.details);
  if (!texts.length) return [];
  return matchExamQuestionsByTexts(exam, texts);
}

function matchExamQuestionsByTexts(exam, texts) {
  if (!exam || !Array.isArray(exam.questions) || !Array.isArray(texts)) return [];
  const usedIds = new Set();
  const matched = [];
  texts.forEach(text => {
    const normalizedText = normalizeQuestionMatchText(text);
    if (!normalizedText) return;
    const question = exam.questions.find(item => {
      if (usedIds.has(item.id)) return false;
      const normalizedQuestion = normalizeQuestionMatchText(item.question);
      return normalizedQuestion === normalizedText
        || normalizedQuestion.includes(normalizedText)
        || normalizedText.includes(normalizedQuestion);
    });
    if (question) {
      usedIds.add(question.id);
      matched.push(question);
    }
  });
  return matched;
}

function getResultAnswerForQuestion(res, questionId) {
  const answers = res?.studentAnswers;
  if (!answers || typeof answers !== "object") return undefined;
  if (answers[questionId] !== undefined) return answers[questionId];
  const key = String(questionId);
  if (answers[key] !== undefined) return answers[key];
  const num = parseInt(key, 10);
  if (Number.isFinite(num) && answers[num] !== undefined) return answers[num];
  return undefined;
}

function getResultQuestionScore(res, questionId) {
  const scores = res?.questionScores;
  if (!scores || typeof scores !== "object") return undefined;
  if (scores[questionId] !== undefined) return scores[questionId];
  const key = String(questionId);
  if (scores[key] !== undefined) return scores[key];
  const num = parseInt(key, 10);
  if (Number.isFinite(num) && scores[num] !== undefined) return scores[num];
  return undefined;
}

function resultHasStructuredAnswers(res) {
  const answers = res?.studentAnswers;
  return !!(answers && typeof answers === "object" && Object.keys(answers).length > 0);
}

function resolveStudentOptionIndexFromText(question, answerText) {
  const text = String(answerText || "").trim();
  if (!text || /لم\s*تتم\s*الإجابة/i.test(text)) return -1;
  if (/انته(?:ى|ي)\s*الوقت/i.test(text)) return -1;
  if (/ملغي|غش/i.test(text)) return -2;
  const options = Array.isArray(question?.options) ? question.options : [];
  const exactIdx = options.findIndex(opt => String(opt).trim() === text);
  if (exactIdx >= 0) return exactIdx;
  const letterMatch = text.match(/^([A-Da-d])$/);
  if (letterMatch) {
    const letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (letterIdx >= 0 && letterIdx < options.length) return letterIdx;
  }
  return undefined;
}

function parseManualQuestionScoreFromBracket(bracketText, fallbackPoints, isCorrect) {
  const manual = String(bracketText || "").match(/درجة\s*السؤال\s*المعدلة\s*:\s*([\d.]+)/i);
  if (manual) return parseFloat(manual[1]) || 0;
  if (/✓|صح/i.test(bracketText || "")) return fallbackPoints;
  if (/✗|خط/i.test(bracketText || "")) return 0;
  if (isCorrect) return fallbackPoints;
  return 0;
}

/** يستخرج إجابات الطالب ودرجات الأسئلة من حقل details للنتائج القديمة */
function parseResultDetailsIntoAnswerMaps(res, exam) {
  if (!res?.details || typeof res.details !== "string") {
    return { studentAnswers: {}, questionScores: {}, presentedQuestions: [] };
  }
  const studentAnswers = {};
  const questionScores = {};
  const presentedQuestions = [];
  const details = res.details;

  const essayRegex = /س\s*مقالي\s*\(وزنها\s*([\d.]+)\s*نق(?:طة|اط)?\)\s*:\s*([\s\S]+?)\n\s*إجابة\s*الطالب:\s*([\s\S]*?)(?:\n\s*\[(.+?)\])?(?=\n-{3,}|\nس\s*\(|\n*$)/gi;
  let essayMatch;
  while ((essayMatch = essayRegex.exec(details)) !== null) {
    const qPoints = parseFloat(essayMatch[1]) || 10;
    const questionText = essayMatch[2].trim();
    let answerText = essayMatch[3].trim();
    const bracket = essayMatch[4] || "";
    if (/^\(لم\s*يكتب/i.test(answerText)) answerText = "";
    const matched = exam ? matchExamQuestionsByTexts(exam, [questionText]) : [];
    const question = matched[0] || {
      id: presentedQuestions.length + 1,
      type: "essay",
      question: questionText,
      options: [],
      correctAnswer: "",
      points: qPoints
    };
    studentAnswers[question.id] = answerText;
    questionScores[question.id] = parseManualQuestionScoreFromBracket(bracket, qPoints, false);
    presentedQuestions.push(question);
  }

  details.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || /^س\s*مقالي/i.test(trimmed)) return;
    const objectiveMatch = trimmed.match(/^س\s*\(وزنها\s*([\d.]+)\s*نق(?:طة|اط)?\)\s*:\s*(.+?)\s*\|\s*إجابة\s*الطالب:\s*(.+?)\s*\|\s*الصحيحة:\s*(.+?)(?:\s*\[(.+?)\])?\s*$/i);
    if (!objectiveMatch) return;
    const qPoints = parseFloat(objectiveMatch[1]) || 10;
    const questionText = objectiveMatch[2].trim();
    const studentAnsText = objectiveMatch[3].trim();
    const correctText = objectiveMatch[4].trim();
    const bracket = objectiveMatch[5] || "";
    const matched = exam ? matchExamQuestionsByTexts(exam, [questionText]) : [];
    const question = matched[0] || {
      id: presentedQuestions.length + 1000,
      type: "multiple",
      question: questionText,
      options: [correctText, studentAnsText].filter((v, i, arr) => v && arr.indexOf(v) === i),
      correctAnswer: 0,
      points: qPoints
    };
    const studentIdx = resolveStudentOptionIndexFromText(question, studentAnsText);
    const correctIdx = resolveStudentOptionIndexFromText(question, correctText);
    if (correctIdx !== undefined && correctIdx >= 0 && question.correctAnswer !== correctIdx) {
      question.correctAnswer = correctIdx;
    }
    studentAnswers[question.id] = studentIdx !== undefined ? studentIdx : studentAnsText;
    const isCorrect = studentIdx !== undefined && studentIdx === question.correctAnswer;
    questionScores[question.id] = parseManualQuestionScoreFromBracket(bracket, qPoints, isCorrect);
    if (!presentedQuestions.some(q => q.id === question.id)) {
      presentedQuestions.push(question);
    }
  });

  return { studentAnswers, questionScores, presentedQuestions };
}

function ensureResultAnswerData(res, exam) {
  if (!res) return false;
  if (!res.studentAnswers || typeof res.studentAnswers !== "object") res.studentAnswers = {};
  if (!res.questionScores || typeof res.questionScores !== "object") res.questionScores = {};
  if (resultHasStructuredAnswers(res)) return false;
  const parsed = parseResultDetailsIntoAnswerMaps(res, exam);
  if (!parsed || !Object.keys(parsed.studentAnswers).length) return false;
  res.studentAnswers = parsed.studentAnswers;
  res.questionScores = { ...res.questionScores, ...parsed.questionScores };
  if ((!Array.isArray(res.presentedQuestions) || !res.presentedQuestions.length) && parsed.presentedQuestions.length) {
    res.presentedQuestions = JSON.parse(JSON.stringify(parsed.presentedQuestions));
  }
  return true;
}

function hydrateResultAnswerDataForResults() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return false;
  let changed = false;
  systemState.results.forEach(res => {
    const exam = systemState.exams.find(item => item.id === res.examId);
    if (ensureResultAnswerData(res, exam)) changed = true;
  });
  if (changed) {
    try {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    } catch (e) {
      console.error("hydrateResultAnswerDataForResults:", e);
    }
  }
  return changed;
}

function compactPresentedQuestionsForCloud(questions) {
  return (Array.isArray(questions) ? questions : []).map(q => ({
    id: q.id,
    type: q.type,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    points: q.points
  }));
}

/** الأسئلة التي ظهرت للطالب فعلاً (وليس بنك الأسئلة كاملاً) */
function getPresentedQuestionsForResult(res, exam) {
  ensureResultAnswerData(res, exam);

  if (Array.isArray(res?.presentedQuestions) && res.presentedQuestions.length > 0) {
    return res.presentedQuestions;
  }

  const answerKeys = new Set([
    ...Object.keys(res?.studentAnswers || {}),
    ...Object.keys(res?.questionScores || {})
  ].filter(key => key !== "undefined" && key !== "null"));

  if (exam && Array.isArray(exam.questions) && answerKeys.size > 0) {
    const filtered = exam.questions.filter(q => answerKeys.has(String(q.id)));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  if (answerKeys.size > 0) {
    return [...answerKeys]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((qId, idx) => ({
        id: parseInt(qId, 10),
        type: "multiple",
        question: `سؤال ${idx + 1}`,
        options: ["لا يوجد"],
        correctAnswer: 0,
        points: (res.questionScores || {})[qId] ?? 10
      }));
  }

  if (exam && res?.details) {
    const fromDetails = matchPresentedQuestionsFromDetails(res, exam);
    if (fromDetails.length > 0) {
      return fromDetails;
    }
  }

  const configuredCount = getConfiguredQuestionCount(exam);
  if (exam && Array.isArray(exam.questions)) {
    if (configuredCount && configuredCount < exam.questions.length) {
      return [];
    }
    return exam.questions;
  }

  return [];
}


function hydratePresentedQuestionsForResults() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return false;
  let changed = false;
  systemState.results.forEach(res => {
    if (Array.isArray(res.presentedQuestions) && res.presentedQuestions.length > 0) return;
    const exam = systemState.exams.find(item => item.id === res.examId);
    ensureResultAnswerData(res, exam);
    const resolved = getPresentedQuestionsForResult(res, exam);
    const bankSize = Array.isArray(exam?.questions) ? exam.questions.length : 0;
    const configuredCount = getConfiguredQuestionCount(exam);
    const shouldPersist = resolved.length > 0 && (
      (configuredCount && resolved.length <= configuredCount)
      || (bankSize && resolved.length < bankSize)
    );
    if (shouldPersist) {
      res.presentedQuestions = JSON.parse(JSON.stringify(resolved));
      changed = true;
    }
  });
  if (changed) {
    try {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    } catch (e) {
      console.error("hydratePresentedQuestionsForResults:", e);
    }
  }
  hydrateResultAnswerDataForResults();
  return changed;
}


function calculateRuntimeExamMeta(questions) {
  const questionList = Array.isArray(questions) ? questions : [];
  const maxScore = questionList.reduce((sum, question) => {
    const points = parseFloat(question?.points);
    return sum + (Number.isFinite(points) ? points : 10);
  }, 0);
  return { maxScore };
}

async function teacherCredentialMatches(teacher, credential) {
  if (!teacher || credential === undefined || credential === null) return false;
  if (window.ArabyaSecurity) return window.ArabyaSecurity.teacherCredentialMatches(teacher, credential);
  const val = String(credential).trim();
  if (!val) return false;
  return teacher.password === val || teacher.autoEntryCode === val;
}

function getTeacherAnalyticsHelpers() {
  return {
    getTeacherScopedResults,
    getTeacherScopedExams,
    getActiveResultsList,
    getResultDisplayStatus,
    isSupersededResult,
    escapeHtml
  };
}
window.getTeacherAnalyticsHelpers = getTeacherAnalyticsHelpers;

function parseExamEndsAtInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function formatExamEndsAtForInput(isoValue) {
  if (!isoValue) return "";
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function isExamPastDeadline(exam) {
  if (!exam || !exam.endsAt) return false;
  const end = new Date(exam.endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return Date.now() > end.getTime();
}

function getExamDeadlineBlockMessage(exam) {
  if (!exam || !exam.endsAt) return "";
  const end = new Date(exam.endsAt);
  const when = Number.isNaN(end.getTime())
    ? exam.endsAt
    : end.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  return `انتهى موعد هذا الامتحان في ${when}. لا يمكن الدخول أو أداء الأسئلة. يمكن للمعلم تمديد الموعد من إعدادات الامتحان.`;
}

function syncCurrentExamDeadlineFromCatalog() {
  if (!systemState.currentExam?.id) return;
  const fresh = (systemState.exams || []).find(e => e.id === systemState.currentExam.id);
  if (fresh && fresh.endsAt !== undefined) {
    systemState.currentExam.endsAt = fresh.endsAt;
  }
}

function getMsUntilExamDeadline(exam) {
  const target = exam || systemState.currentExam;
  if (!target?.endsAt) return null;
  const end = new Date(target.endsAt);
  if (Number.isNaN(end.getTime())) return null;
  return end.getTime() - Date.now();
}

function isCurrentExamPastDeadline() {
  syncCurrentExamDeadlineFromCatalog();
  return isExamPastDeadline(systemState.currentExam);
}

function stopExamDeadlineWatcher() {
  if (systemState.examDeadlineTimerId) {
    clearInterval(systemState.examDeadlineTimerId);
    systemState.examDeadlineTimerId = null;
  }
}

function markUnansweredQuestionsForExamDeadline() {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  if (currentQ && systemState.studentAnswers[currentQ.id] === undefined) {
    if (currentQ.type === "essay") {
      systemState.studentAnswers[currentQ.id] = "(لم يتم كتابة إجابة - انتهى موعد الامتحان)";
    } else {
      systemState.studentAnswers[currentQ.id] = -1;
    }
  }
  systemState.shuffledQuestions.forEach((q, idx) => {
    if (idx <= systemState.currentQuestionIndex) return;
    if (systemState.studentAnswers[q.id] !== undefined) return;
    if (q.type === "essay") {
      systemState.studentAnswers[q.id] = "(لم يتم كتابة إجابة - انتهى موعد الامتحان)";
    } else {
      systemState.studentAnswers[q.id] = -1;
    }
  });
}

function forceSubmitExamBecauseDeadline() {
  if (!systemState.isExamActive) return;
  stopExamDeadlineWatcher();
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
    systemState.timer.intervalId = null;
  }
  markUnansweredQuestionsForExamDeadline();
  saveActiveStudentSession();
  const message = getExamDeadlineBlockMessage(systemState.currentExam) ||
    "انتهى موعد هذا الامتحان. تم تسليم إجاباتك تلقائياً.";
  announceExamAccessibility("انتهى موعد الامتحان المحدد. جاري تسليم إجاباتك تلقائياً.");
  alert(message);
  submitFinishedExam();
}

function checkExamDeadlineDuringSession() {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  if (!isCurrentExamPastDeadline()) return false;
  forceSubmitExamBecauseDeadline();
  return true;
}

function startExamDeadlineWatcher() {
  stopExamDeadlineWatcher();
  syncCurrentExamDeadlineFromCatalog();
  if (!systemState.currentExam?.endsAt) return;
  checkExamDeadlineDuringSession();
  if (!systemState.isExamActive) return;
  systemState.examDeadlineTimerId = setInterval(checkExamDeadlineDuringSession, 1000);
}

function getEffectiveQuestionTimeSeconds(question, exam) {
  const baseSeconds = getQuestionTimeSeconds(question, exam);
  const msLeft = getMsUntilExamDeadline(exam);
  if (msLeft === null) return baseSeconds;
  if (msLeft <= 0) return 0;
  return Math.min(baseSeconds, Math.max(1, Math.ceil(msLeft / 1000)));
}

function getQuestionTimeSeconds(question, exam) {
  if (question && question.timeSeconds !== undefined && question.timeSeconds !== null) {
    const perQ = parseInt(question.timeSeconds, 10);
    if (Number.isFinite(perQ) && perQ > 0) {
      return Math.max(5, perQ);
    }
  }
  const examTimeLimitMinutes = (exam && exam.timeLimit) || 60;
  const questionsCount = (exam && exam.questions && exam.questions.length) || 1;
  return Math.max(30, Math.floor((examTimeLimitMinutes * 60) / questionsCount));
}

function getCurrentExamTotalScore() {
  if (systemState.currentExamRuntime && Number.isFinite(systemState.currentExamRuntime.maxScore)) {
    return systemState.currentExamRuntime.maxScore;
  }
  return systemState.currentExam?.totalScore || 100;
}

function upsertStudentRecord(source, fallbackKey = "") {
  if (isStudentRecordDeleted(source)) return null;
  const previewKey = fallbackKey || getStudentLookupKey(source) || "";
  if (previewKey && isStudentKeyDeleted(previewKey)) return null;
  const normalizedId = normalizeStudentId(source.id || "");
  const normalizedCode = sanitizeStudentCodeInput(source.code || source.accessCode || "");
  const normalizedStudent = {
    name: (source.name || "").toString().trim(),
    id: normalizedId,
    code: hasStudentCode(normalizedCode) ? normalizedCode : "",
    email: normalizeContactField(source.email),
    mobile: normalizeContactField(source.mobile)
  };

  let existingStudent = null;
  if (isPrivateStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByCode(normalizedStudent.code);
  } else if (isSharedStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByCode(normalizedStudent.code, {
      studentId: normalizedStudent.id,
      name: normalizedStudent.name
    });
  }
  if (!existingStudent && normalizedStudent.id) {
    existingStudent = findStudentById(normalizedStudent.id);
  }
  if (!existingStudent && normalizedStudent.name && !hasStudentCode(normalizedStudent.code) && !normalizedStudent.id) {
    const byName = findStudentsByName(normalizedStudent.name);
    if (byName.length === 1) existingStudent = byName[0];
  }

  if (existingStudent) {
    existingStudent.name = normalizedStudent.name || existingStudent.name;
    existingStudent.id = normalizedStudent.id || existingStudent.id || "";
    existingStudent.code = normalizedStudent.code || existingStudent.code || "";
    existingStudent.email = normalizedStudent.email;
    existingStudent.mobile = normalizedStudent.mobile;
    if (source.timestamp) {
      existingStudent.timestamp = pickEarlierStudentTimestamp(existingStudent.timestamp, source.timestamp);
    }
    existingStudent.studentKey = existingStudent.studentKey || getStudentLookupKey(existingStudent) || fallbackKey || createRecordId("student");
    return ensureStudentAccountType(existingStudent);
  }

  const newStudent = {
    name: normalizedStudent.name,
    id: normalizedStudent.id,
    code: normalizedStudent.code,
    email: normalizedStudent.email,
    mobile: normalizedStudent.mobile,
    timestamp: String(source.timestamp || "").trim() || new Date().toLocaleDateString("ar-EG"),
    studentKey: fallbackKey || getStudentLookupKey(normalizedStudent) || createRecordId("student"),
    accountType: ARABYA_ACCOUNT_ROLES.STUDENT
  };
  systemState.students.push(newStudent);
  return ensureStudentAccountType(newStudent);
}



// ===== أداة التشخيص السريع - اكتب arabya_diagnose() في الكونسول =====
window.arabya_diagnose = function() {
  const teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
  const exams    = JSON.parse(localStorage.getItem("arabya_exams_db") || "[]");
  const students = JSON.parse(localStorage.getItem("arabya_students_db") || "[]");
  const results  = JSON.parse(localStorage.getItem("arabya_results_db") || "[]");
  const report = {
    "💾 localStorage": {
      "معلمون (arabya_teachers_db)": teachers.length,
      "امتحانات (arabya_exams_db)": exams.length,
      "طلاب (arabya_students_db)": students.length,
      "نتائج (arabya_results_db)": results.length,
    },
    "🧠 systemState (RAM)": {
      "معلمون": systemState.teachers.length,
      "امتحانات": systemState.exams.length,
      "طلاب": systemState.students.length,
      "نتائج": systemState.results.length,
    },
    "🔗 رابط المزامنة": systemState.config?.googleFormUrl || "(غير مُعيَّن)",
    "📦 بيانات المعلم النشط": systemState.activeTeacher?.username || "(لا يوجد)"
  };
  console.table(report["💾 localStorage"]);
  console.table(report["🧠 systemState (RAM)"]);
  console.log("🔗 رابط المزامنة:", report["🔗 رابط المزامنة"]);
  console.log("👤 المعلم النشط:", report["📦 بيانات المعلم النشط"]);
  alert(`✅ التشخيص:\n\nمحلي: معلمون=${teachers.length} | امتحانات=${exams.length} | طلاب=${students.length} | نتائج=${results.length}\n\nذاكرة: معلمون=${systemState.teachers.length} | امتحانات=${systemState.exams.length} | طلاب=${systemState.students.length} | نتائج=${systemState.results.length}\n\nالمزامنة: ${systemState.config?.googleFormUrl || "(غير مُعيَّنة)"}`);
  return report;
};



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


function buildResultIndexMap(sourceList) {
  const indexMap = new Map();
  (sourceList || []).forEach((res, index) => indexMap.set(res, index));
  return indexMap;
}


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

const RESULTS_TABLE_SORTABLE_COLUMNS = [
  { key: "name", label: "اسم الطالب" },
  { key: "id", label: "رقم ID" },
  { key: "accessCode", label: "كود الاشتراك" },
  { key: "examTitle", label: "الامتحان" },
  { key: "score", label: "النتيجة" },
  { key: "clientIp", label: "IP / الجهاز" },
  { key: "timestamp", label: "التاريخ والوقت" }
];

const STUDENTS_TABLE_SORTABLE_COLUMNS = [
  { key: "name", label: "اسم الطالب" },
  { key: "id", label: "رقم ID" },
  { key: "code", label: "كود الاشتراك" },
  { key: "lastKnownIp", label: "آخر IP" },
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
    return getResultNumericGrade(item);
  }
  if (key === "clientIp") {
    return formatResultDeviceSummary(item).toLocaleLowerCase("ar");
  }
  if (key === "lastKnownIp") {
    return String(getStudentDisplayIp(item) || "").toLocaleLowerCase("ar");
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

function sortResultsByRecency(results, sourceList) {
  return sortResultsForDisplay(results, "newest", sourceList);
}


const TEACHER_ACTIVE_TAB_KEY = "arabya_teacher_active_tab";
const TEACHER_TAB_IDS = ["home", "stats", "exams", "results", "students", "teachers", "integration", "profile", "admins"];
const CLOUD_SYNC_LAST_OK_KEY = "arabya_last_cloud_sync_ok";
const CLOUD_SYNC_LAST_FAIL_KEY = "arabya_last_cloud_sync_fail";
const CLOUD_SYNC_LOCAL_ONLY_KEY = "arabya_cloud_sync_local_only";

function normalizeTeacherTabId(tabId) {
  let id = String(tabId || "").trim();
  if (id === "dashboard") id = "home";
  if (id === "admins") id = "teachers";
  return TEACHER_TAB_IDS.includes(id) ? id : "home";
}

function getSavedTeacherActiveTab() {
  try {
    return normalizeTeacherTabId(localStorage.getItem(TEACHER_ACTIVE_TAB_KEY));
  } catch (e) {
    return "home";
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
    const isTarget = panel.id === `teacher-tab-${normalizedTab}`;
    panel.classList.toggle("hidden", !isTarget);
    panel.toggleAttribute("hidden", !isTarget);
    panel.setAttribute("aria-hidden", isTarget ? "false" : "true");
  });

  if (!options.skipSave) saveTeacherActiveTab(normalizedTab);
  if (options.skipRefresh) return normalizedTab;

  reloadSystemStateFromLocalStorage();
  if (normalizedTab === "home") {
    renderTeacherHomeDashboard();
  } else if (normalizedTab === "stats") {
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
  } else if (normalizedTab === "teachers" || normalizedTab === "admins") {
    renderTeacherAccountsPanel();
  } else if (normalizedTab === "profile") {
    renderTeacherProfilePanel();
  } else if (normalizedTab === "integration") {
    refreshCloudSyncStatusUI();
  }
  return normalizedTab;
}

function restoreTeacherActiveTab() {
  activateTeacherTab(getSavedTeacherActiveTab(), { skipSave: true, skipRefresh: true });
}

window.activateTeacherTab = activateTeacherTab;

function refreshTeacherDashboardViews(options = {}) {
  const refreshAll = !!options.all;
  if (typeof reloadSystemStateFromLocalStorage === "function") {
    reloadSystemStateFromLocalStorage();
  }
  const statsTab = document.getElementById("teacher-tab-stats");
  const resultsTab = document.getElementById("teacher-tab-results");
  const studentsTab = document.getElementById("teacher-tab-students");
  const examsTab = document.getElementById("teacher-tab-exams");
  const teachersTab = document.getElementById("teacher-tab-teachers");

  const homeTab = document.getElementById("teacher-tab-home");
  if (refreshAll || (homeTab && !homeTab.classList.contains("hidden"))) {
    if (typeof renderTeacherHomeDashboard === "function") renderTeacherHomeDashboard();
  }
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
  if (refreshAll || (teachersTab && !teachersTab.classList.contains("hidden"))) {
    if (typeof renderTeacherAccountsPanel === "function") renderTeacherAccountsPanel();
  }
}

window.refreshTeacherDashboardViews = refreshTeacherDashboardViews;

function reloadSystemStateFromLocalStorage() {
  try {
    const teachers = localStorage.getItem("arabya_teachers_db");
    if (teachers) systemState.teachers = JSON.parse(teachers);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: teachers", e); }
  try {
    const exams = localStorage.getItem("arabya_exams_db");
    if (exams) systemState.exams = JSON.parse(exams);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: exams", e); }
  try {
    const students = localStorage.getItem("arabya_students_db");
    if (students) systemState.students = JSON.parse(students);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: students", e); }
  try {
    const results = localStorage.getItem("arabya_results_db");
    if (results) systemState.results = JSON.parse(results);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: results", e); }
  loadDeletedStudentKeysFromStorage();
  loadDeletedResultKeysFromStorage();
  ensureResultRecordIds();
  applyDeletionTombstonesToLocalState();
  ensureStudentsDataShape();
  ensureExamsDataShape();
}


function getCleanSiteUrl() {
  return (window.location.pathname || "/") + (window.location.search || "");
}

function stripEmptyHashFromUrl() {
  const hash = window.location.hash || "";
  if (!hash || hash === "#") {
    const cleanUrl = getCleanSiteUrl();
    if (window.location.href !== window.location.origin + cleanUrl && window.location.href !== cleanUrl) {
      history.replaceState(null, "", cleanUrl);
    }
  }
}

function cleanBrowserUrlForView(viewId) {
  if (viewId === "welcome-view") {
    history.replaceState(null, "", getCleanSiteUrl());
  }
}

window.goToHomePage = function(event) {
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  navigateToView("welcome-view");
  history.replaceState(null, "", getCleanSiteUrl());
};

// إعداد نظام التوجيه والتنقل بين الصفحات
function setupNavigation() {
  const navLinks = document.querySelectorAll("[data-target]");
  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.dataset.target;
      navigateToView(targetView);
      closeMobileSiteNav();
    });
  });
}

function setupMobileSiteNavigation() {
  const toggle = document.getElementById("site-nav-toggle");
  const drawer = document.getElementById("site-nav-drawer");
  if (!toggle || !drawer) return;
  toggle.addEventListener("click", () => {
    const open = drawer.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل");
  });
  document.addEventListener("click", e => {
    if (!drawer.classList.contains("is-open")) return;
    if (drawer.contains(e.target) || toggle.contains(e.target)) return;
    closeMobileSiteNav();
  });
}

function closeMobileSiteNav() {
  const toggle = document.getElementById("site-nav-toggle");
  const drawer = document.getElementById("site-nav-drawer");
  if (drawer) drawer.classList.remove("is-open");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "فتح قائمة التنقل");
  }
}

function navigateToView(viewId) {
  document.querySelectorAll(".view-section").forEach(v => {
    v.classList.add("hidden");
  });
  
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove("hidden");
    systemState.activeView = viewId;
    localStorage.setItem("arabya_active_view", viewId);
  }
  
  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.dataset.target === viewId) {
      link.classList.add("active-link");
    } else {
      link.classList.remove("active-link");
    }
  });

  if (viewId === "student-login-view") {
    populateExamSelectionList();
    prefetchStudentExamGateData();
  } else if (viewId === "teacher-login-view") {
    const pendingSyncUrl = localStorage.getItem("arabya_pending_cloud_sync_url") || "";
    const syncInput = document.getElementById("teacher-login-sync-url");
    if (syncInput && pendingSyncUrl && !syncInput.value.trim()) {
      syncInput.value = pendingSyncUrl;
    }
    updateTeacherAppVersionLabel();
  } else if (viewId === "teacher-register-view") {
    if (!canUsePublicTeacherRegistration()) {
      alert("إنشاء حساب معلم جديد من الصفحة العامة متاح لمدير المنصة (سوبر أدمن) فقط.");
      navigateToView("teacher-login-view");
      return;
    }
  } else if (viewId === "teacher-dashboard-view") {
    loadTeacherDashboardData();
    refreshCloudSyncStatusUI();
  }
}

// دالة مساعدة للحصول على المعاملات من الرابط (تدعم معاملات البحث بعد ? ومعاملات الهاش بعد #)
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has(name)) {
    return urlParams.get(name);
  }
  
  // فحص معاملات الرابط بعد علامة # إذا تم كتابة الرابط بصيغة hash
  const hash = window.location.hash;
  if (hash.includes('?')) {
    const hashParams = new URLSearchParams(hash.split('?')[1]);
    if (hashParams.has(name)) {
      return hashParams.get(name);
    }
  }
  return null;
}


// دالة موحدة لتوليد الرابط المباشر للامتحان (تدعم المسارات الحقيقية بدون هاش على خوادم الويب)
function getExamDirectLink(exam) {
  const params = new URLSearchParams();
  params.set("exam", exam.id);
  if (systemState.activeTeacher) {
    params.set("teacher", systemState.activeTeacher.username);
  }
  const syncUrl = getEffectiveExamSyncUrl(exam);
  if (syncUrl) params.set("s", syncUrl);
  return `${getAppBaseUrl()}?${params.toString()}`;
}

// فحص معاملات الرابط لفتح امتحان مخصص أو الدخول التلقائي للمعلم
async function checkUrlParameters() {
  let redirected = false;

  // 1. الدخول التلقائي للمعلم عبر رمز الدخول التلقائي
  const autoCode = getUrlParameter("teacher_autocode");
  if (autoCode) {
    for (const t of systemState.teachers) {
      if (!(await teacherCredentialMatches(t, autoCode))) continue;
      await loginTeacherObject(t, autoCode);
      navigateToView("teacher-dashboard-view");
      alert(`مرحباً بك يا أستاذ ${t.name}! تم تسجيل الدخول تلقائياً عبر رمز الدخول السريع.`);
      return true;
    }
  }
  
  // 2. الدخول التلقائي للمعلم عبر اسم المستخدم وكلمة المرور
  const user = getUrlParameter("teacher_username");
  const pass = getUrlParameter("teacher_pass");
  if (user && pass) {
    for (const t of systemState.teachers) {
      if (t.username.toLowerCase() !== user.toLowerCase()) continue;
      if (!(await teacherCredentialMatches(t, pass))) continue;
      await loginTeacherObject(t, pass);
      navigateToView("teacher-dashboard-view");
      alert(`مرحباً بك يا أستاذ ${t.name}! تم تسجيل الدخول تلقائياً.`);
      return true;
    }
  }

  // 3. التحقق من وجود المعلم وتجهيز الإعدادات لتصفية الامتحانات ومزامنة الدرجات
  const teacherUser = getUrlParameter("teacher");
  if (teacherUser) {
    const teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
    const matchedTeacher = teachers.find(t => t.username === teacherUser || t.name === teacherUser);
    if (matchedTeacher) {
      systemState.config = {
        teacherCode: matchedTeacher.password,
        googleFormUrl: matchedTeacher.integrationConfig?.googleFormUrl || "",
        entryName: matchedTeacher.integrationConfig?.entryName || "",
        entryId: matchedTeacher.integrationConfig?.entryId || "",
        entryCode: matchedTeacher.integrationConfig?.entryCode || "",
        entryScore: matchedTeacher.integrationConfig?.entryScore || "",
        entryDetails: matchedTeacher.integrationConfig?.entryDetails || "",
        autoEntryCode: matchedTeacher.autoEntryCode || matchedTeacher.password
      };
      systemState.targetTeacherUsername = matchedTeacher.username;
    }
  }

  // 3.b رابط المزامنة المضمّن في الرابط المباشر (يعمل عبر الأجهزة المختلفة)
  const syncParam = getUrlParameter("s");
  if (syncParam && (syncParam.includes("/macros/s/") || syncParam.endsWith("/exec"))) {
    systemState.config = systemState.config || {};
    systemState.config.googleFormUrl = syncParam;
    try { localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config)); } catch (e) {}
    setTimeout(function() {
      if (typeof syncDatabaseFromCloud === "function") {
        syncDatabaseFromCloud({ silent: true }).then(function(ok) {
          if (ok) {
            try { populateExamSelectionList(); } catch (e) {}
            if (systemState.lockedExamId) {
              const sel = document.getElementById("student-exam-select");
              if (sel) { sel.value = systemState.lockedExamId; sel.disabled = true; }
            }
          }
        });
      }
    }, 50);
  }

  // 4. فتح امتحان مخصص للطالب (عبر البارامتر ?exam=... أو عبر المسار الفرعي الحقيقي في pathname)
  let examId = getUrlParameter("exam");
  
  // التحقق من المسار الحقيقي في pathname (مثال: /876KHK أو /online_exam_portal/876KHK)
  if (!examId) {
    const pathName = window.location.pathname;
    const pathSegments = pathName.split('/').filter(s => s.length > 0 && s !== "index.html" && s !== "online_exam_portal");
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      const matchedExam = systemState.exams.find(e => e.id.toLowerCase() === lastSegment.toLowerCase());
      if (matchedExam) {
        examId = matchedExam.id;
      }
    }
  }
  
  // 5. التحقق من وجود مسار هاش مخصص للامتحان (مثال: #/876KHK)
  const hash = window.location.hash;
  if (!examId && hash && hash.startsWith("#/")) {
    const route = hash.substring(2); // ما بعد "#/"
    let cleanRoute = route;
    let queryInHash = "";
    if (route.includes("?")) {
      const parts = route.split("?");
      cleanRoute = parts[0];
      queryInHash = parts[1];
    }
    
    // البحث عن الامتحان المطابق للرمز العشوائي المولد
    const targetExam = systemState.exams.find(e => e.id.toLowerCase() === cleanRoute.toLowerCase());
    if (targetExam) {
      examId = targetExam.id;
      
      // تحليل معامل المعلم من داخل الهاش إن وجد
      if (queryInHash) {
        const hashParams = new URLSearchParams(queryInHash);
        const teacherVal = hashParams.get("teacher");
        if (teacherVal) {
          const teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
          const matchedTeacher = teachers.find(t => t.username === teacherVal || t.name === teacherVal);
          if (matchedTeacher) {
            systemState.config = {
              teacherCode: matchedTeacher.password,
              googleFormUrl: matchedTeacher.integrationConfig?.googleFormUrl || "",
              entryName: matchedTeacher.integrationConfig?.entryName || "",
              entryId: matchedTeacher.integrationConfig?.entryId || "",
              entryCode: matchedTeacher.integrationConfig?.entryCode || "",
              entryScore: matchedTeacher.integrationConfig?.entryScore || "",
              entryDetails: matchedTeacher.integrationConfig?.entryDetails || "",
              autoEntryCode: matchedTeacher.autoEntryCode || matchedTeacher.password
            };
            systemState.targetTeacherUsername = matchedTeacher.username;
          }
        }
      }
    }
  }

  if (examId) {
    const targetExam = systemState.exams.find(e => String(e.id).toLowerCase() === String(examId).toLowerCase());
    if (targetExam) {
      if (isExamPastDeadline(targetExam)) {
        alert(getExamDeadlineBlockMessage(targetExam));
        return redirected;
      }
      systemState.lockedExamId = targetExam.id;
      navigateToView("student-login-view");
      setTimeout(() => {
        const select = document.getElementById("student-exam-select");
        if (select) {
          select.value = targetExam.id;
          select.disabled = true;
          select.setAttribute("aria-describedby", "direct-exam-lock-note");
        }
      }, 100);
      redirected = true;
    }
  }

  return redirected;
}

// تسجيل دخول كائن معلم محدد وتطبيق إعداداته
async function loginTeacherObject(teacher, loginCredential) {
  const normalized = normalizeTeacherAccount(teacher);
  const credential = String(loginCredential || "").trim();
  if (credential && ARABYA_SUPER_ADMIN_SEEDS.has(credential)) {
    normalized.role = ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
  }
  if (credential && window.ArabyaSecurity) {
    await window.ArabyaSecurity.ensureTeacherPasswordHashed(normalized, credential);
    const idx = systemState.teachers.findIndex(t => t.username === normalized.username);
    if (idx !== -1) {
      systemState.teachers[idx] = { ...systemState.teachers[idx], passwordHash: normalized.passwordHash, passwordSalt: normalized.passwordSalt };
      saveTeachersToLocalStorage();
    }
  }
  if (window.ArabyaSecurity) window.ArabyaSecurity.touchTeacherActivity();
  systemState.activeTeacher = normalized;
  systemState.activeTeacherLoginCredential = credential || "";
  localStorage.setItem("arabya_active_teacher_username", normalized.username || teacher.username);
  
  systemState.teacherProfile = { name: teacher.name, subject: teacher.subject };
  systemState.config = {
    teacherCode: teacher.password,
    googleFormUrl: teacher.integrationConfig?.googleFormUrl || "",
    entryName: teacher.integrationConfig?.entryName || "",
    entryId: teacher.integrationConfig?.entryId || "",
    entryCode: teacher.integrationConfig?.entryCode || "",
    entryScore: teacher.integrationConfig?.entryScore || "",
    entryDetails: teacher.integrationConfig?.entryDetails || "",
    autoEntryCode: teacher.autoEntryCode || teacher.password
  };
  updateTeacherDashboardAccessUI();
}

// ==========================================
// 2. إدارة أحداث واجهة المستخدم
// ==========================================
function setupUIEventListeners() {
  const startExamBtn = document.getElementById("student-start-exam-btn");
  if (startExamBtn) {
    startExamBtn.addEventListener("click", validateStudentAndStart);
  }

  const studentRegisterBtn = document.getElementById("student-register-submit-btn");
  if (studentRegisterBtn) {
    studentRegisterBtn.addEventListener("click", handleStudentRegister);
  }

  const teacherRegisterBtn = document.getElementById("teacher-register-submit-btn");
  if (teacherRegisterBtn) {
    teacherRegisterBtn.addEventListener("click", handleTeacherRegister);
  }

  const teacherLoginBtn = document.getElementById("teacher-submit-login");
  if (teacherLoginBtn) {
    teacherLoginBtn.addEventListener("click", handleTeacherLogin);
  }

  const teacherQuickLoginBtn = document.getElementById("teacher-submit-quick-login");
  if (teacherQuickLoginBtn) {
    teacherQuickLoginBtn.addEventListener("click", handleTeacherQuickLogin);
  }

  const menuItems = document.querySelectorAll(".teacher-menu-item[data-tab]");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      activateTeacherTab(item.dataset.tab);
    });
  });

  const saveProfileBtn = document.getElementById("save-teacher-profile-btn");
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", saveTeacherProfile);
  }

  const saveIntegrationBtn = document.getElementById("save-teacher-integration-btn");
  if (saveIntegrationBtn) {
    saveIntegrationBtn.addEventListener("click", saveTeacherIntegrationConfig);
  }

  const createExamBtn = document.getElementById("create-new-exam-btn");
  if (createExamBtn) {
    createExamBtn.addEventListener("click", createNewExam);
  }

  setupTeacherStatsControls();

  const exportResultsBtn = document.getElementById("teacher-export-results-btn");
  if (exportResultsBtn) {
    exportResultsBtn.addEventListener("click", exportTeacherResultsToCSV);
  }
  
  const exportResultsJsonBtn = document.getElementById("teacher-export-results-json");
  if (exportResultsJsonBtn) {
    exportResultsJsonBtn.addEventListener("click", exportResultsToJSON);
  }
  
  const importResultsBtn = document.getElementById("teacher-import-results-btn");
  if (importResultsBtn) {
    importResultsBtn.addEventListener("click", () => document.getElementById("teacher-results-file-input").click());
  }
  
  const resultsFileInput = document.getElementById("teacher-results-file-input");
  if (resultsFileInput) {
    resultsFileInput.addEventListener("change", importResultsFromJSON);
  }

  const clearResultsBtn = document.getElementById("teacher-clear-results-btn");
  if (clearResultsBtn) {
    clearResultsBtn.addEventListener("click", clearTeacherResults);
  }

  const importExamBtn = document.getElementById("teacher-import-exam-btn");
  if (importExamBtn) {
    importExamBtn.addEventListener("click", importExamFromGoogleForm);
  }

  const nextQBtn = document.getElementById("runner-next-btn");
  if (nextQBtn) {
    nextQBtn.addEventListener("click", () => runnerNextQuestion(false));
  }

  const restartBtn = document.getElementById("runner-restart-btn");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => navigateToView("welcome-view"));
  }

  const searchResultBtn = document.getElementById("student-search-submit");
  if (searchResultBtn) {
    searchResultBtn.addEventListener("click", searchStudentResults);
  }
  const searchDetailClose = document.getElementById("student-search-detail-close");
  if (searchDetailClose && !searchDetailClose.dataset.bound) {
    searchDetailClose.dataset.bound = "1";
    searchDetailClose.addEventListener("click", hideStudentSearchDetailPanel);
  }
}

// ==========================================
// 3. بوابة وبناء الامتحانات الأكاديمية (Teacher)
// ==========================================

async function handleTeacherLogin() {
  const usernameInput = document.getElementById("teacher-login-username").value.trim();
  const passwordInput = document.getElementById("teacher-password").value;

  if (!usernameInput || !passwordInput) {
    alert("يرجى إدخال اسم المعلم والرقم السري!");
    return;
  }

  let matched = null;
  for (const t of systemState.teachers) {
    const identityOk = t.username.toLowerCase() === usernameInput.toLowerCase() || t.name === usernameInput;
    if (identityOk && await teacherCredentialMatches(t, passwordInput)) {
      matched = t;
      break;
    }
  }

  if (matched) {
    await loginTeacherObject(matched, passwordInput);
    const extraSyncUrl = document.getElementById("teacher-login-sync-url")?.value.trim() || "";
    syncTeacherDataOnLogin({ extraSyncUrl });
    document.getElementById("teacher-password").value = "";
  } else {
    alert("بيانات المعلم غير صحيحة أو الحساب غير موجود!");
  }
}

async function handleTeacherQuickLogin() {
  const codeInput = document.getElementById("teacher-quick-code");
  const codeVal = codeInput ? codeInput.value.trim() : "";

  if (!codeVal) {
    alert("يرجى إدخال رمز الدخول السريع!");
    return;
  }

  let matched = null;
  for (const t of systemState.teachers) {
    if (await teacherCredentialMatches(t, codeVal)) {
      matched = t;
      break;
    }
  }

  if (matched) {
    await loginTeacherObject(matched, codeVal);
    const extraSyncUrl = document.getElementById("teacher-login-sync-url")?.value.trim() || "";
    syncTeacherDataOnLogin({
      extraSyncUrl,
      message: `مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول بنجاح عبر رمز الدخول السريع.`
    });
    if (codeInput) codeInput.value = "";
  } else {
    alert("رمز الدخول السريع غير صحيح أو الحساب غير موجود!");
  }
}

async function handleTeacherRegister() {
  if (!canUsePublicTeacherRegistration() && (!systemState.activeTeacher || !isTeacherStaffAccount())) {
    alert("إنشاء حساب معلم جديد من الصفحة العامة متاح لمدير المنصة (سوبر أدمن) فقط. سجّل دخولك كمدير ثم أضف المعلم من تبويب «إدارة المعلمين» في لوحة التحكم.");
    navigateToView("teacher-login-view");
    return;
  }

  const name = document.getElementById("teacher-reg-name").value.trim();
  const username = document.getElementById("teacher-reg-username").value.trim();
  const subject = document.getElementById("teacher-reg-subject").value.trim();
  const password = document.getElementById("teacher-reg-password").value.trim();
  const autoCode = document.getElementById("teacher-reg-autocode").value.trim();

  if (!name || !username || !subject || !password || !autoCode) {
    alert("يرجى ملء جميع الحقول الإلزامية لتسجيل الحساب!");
    return;
  }

  // فحص عدم تكرار اسم المستخدم
  const isDuplicate = systemState.teachers.some(t => t.username.toLowerCase() === username.toLowerCase());
  if (isDuplicate) {
    alert("اسم المستخدم هذا مسجل بالفعل كمعلم! يرجى اختيار اسم مستخدم آخر.");
    return;
  }

  const newTeacher = normalizeTeacherAccount({
    name,
    username,
    subject,
    password,
    autoEntryCode: autoCode,
    role: ARABYA_ACCOUNT_ROLES.TEACHER,
    integrationConfig: {
      googleFormUrl: "",
      entryName: "",
      entryId: "",
      entryCode: "",
      entryScore: "",
      entryDetails: ""
    }
  });

  systemState.teachers.push(newTeacher);
  saveTeachersToLocalStorage();
  if (isSuperAdminTeacher()) {
    const syncResult = await syncTeacherCredentialsToCloud(newTeacher);
    await syncLocalDatabaseToCloud();
    alert(`تم إنشاء حساب المعلم "${name}" ومزامنته.${syncResult.ok ? "" : " تحقق من رابط Google Sheets."}`);
    activateTeacherTab("teachers", { force: true });
    renderTeacherAccountsPanel();
    return;
  }

  alert(`تم تسجيل حسابك كمعلم بنجاح يا أستاذ ${name}! يمكنك الدخول الآن.`);
  navigateToView("teacher-login-view");
  
  // تعبئة البيانات تلقائياً
  document.getElementById("teacher-login-username").value = username;
  document.getElementById("teacher-password").value = "";
}


function getTeacherScopedExams() {
  const exams = systemState.exams || [];
  if (isSuperAdminTeacher()) return exams.slice();
  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  return exams.filter(exam => !exam.teacher || exam.teacher === activeUsername);
}

function getTeacherScopedResults() {
  const examIds = new Set(getTeacherScopedExams().map(exam => String(exam.id)));
  return (systemState.results || []).filter(res => {
    if (!res.examId) return true;
    if (!examIds.size) return true;
    return examIds.has(String(res.examId));
  });
}

function getStatsDateRangeSettings() {
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

function computeTeacherStatsSnapshot() {
  const exams = getTeacherScopedExams();
  const students = systemState.students || [];
  const allResults = getTeacherScopedResults();
  const statsRange = getStatsDateRangeSettings();
  let results = getActiveResultsList(allResults);
  if (statsRange.dateFrom || statsRange.dateTo) {
    results = results.filter(res => resultMatchesCustomDateRange(res, statsRange.dateFrom, statsRange.dateTo));
  }
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0, superseded: 0 };
  const periodCounts = { today: 0, week: 0, month: 0 };
  const examCounts = new Map();

  allResults.forEach(res => {
    if (isSupersededResult(res)) statusCounts.superseded += 1;
  });

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

  const recentResults = sortResultsByRecency(results, systemState.results).slice(0, 8);

  const urls = typeof getArabyaWebAppUrls === "function" ? getArabyaWebAppUrls() : [];
  return {
    examsCount: exams.length,
    studentsCount: students.length,
    resultsCount: results.length,
    archivedResultsCount: allResults.length - results.length,
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
  activateTeacherTab(tabId, { skipRefresh: true });
  if (typeof afterOpen === "function") {
    setTimeout(afterOpen, 40);
  }
}

function applyTeacherResultsQuickView(options = {}) {
  const view = getResultsTableViewSettings();
  view.statusFilter = options.statusFilter || "all";
  view.examFilter = options.examFilter || "";
  view.dateFilter = options.dateFilter || "all";
  view.dateFrom = options.dateFrom || "";
  view.dateTo = options.dateTo || "";
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
    refreshTeacherDashboardViews({ all: true });
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
    refreshTeacherDashboardViews({ all: true });
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

function setupTeacherStatsControls() {
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
}

function setupTeacherHomeControls() {
  const refreshBtn = document.getElementById("teacher-home-refresh-btn");
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", () => {
      reloadSystemStateFromLocalStorage();
      renderTeacherHomeDashboard();
    });
  }
  const statsBtn = document.getElementById("teacher-home-open-stats-btn");
  if (statsBtn && !statsBtn.dataset.bound) {
    statsBtn.dataset.bound = "1";
    statsBtn.addEventListener("click", () => activateTeacherTab("stats"));
  }
}

function renderTeacherHomeDashboard() {
  setupTeacherHomeControls();
  const container = document.getElementById("teacher-home-summary");
  if (!container) return;
  const stats = typeof computeTeacherStatsSnapshot === "function"
    ? computeTeacherStatsSnapshot()
    : {
        examsCount: (systemState.exams || []).length,
        studentsCount: filterOutDeletedStudents(systemState.students || []).length,
        resultsCount: (systemState.results || []).length,
        cloudConnected: getArabyaWebAppUrls().length > 0
      };
  const teacher = systemState.activeTeacher || {};
  const updatedEl = document.getElementById("teacher-home-updated-at");
  if (updatedEl) {
    updatedEl.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}`;
  }
  container.innerHTML =
    `<div class="profile-stat-card"><div class="profile-stat-label">اسم المعلم</div><div class="profile-stat-value">${escapeHtml(teacher.name || "معلم اللغة العربية")}</div></div>` +
    `<div class="profile-stat-card"><div class="profile-stat-label">اسم المستخدم</div><div class="profile-stat-value">${escapeHtml(teacher.username || "—")}</div></div>` +
    `<div class="profile-stat-card"><div class="profile-stat-label">التخصص</div><div class="profile-stat-value">${escapeHtml(teacher.subject || "اللغة العربية")}</div></div>` +
    `<div class="profile-stat-card"><div class="profile-stat-label">الامتحانات</div><div class="profile-stat-value">${stats.examsCount}</div></div>` +
    `<div class="profile-stat-card"><div class="profile-stat-label">الطلاب</div><div class="profile-stat-value">${stats.studentsCount}</div></div>` +
    `<div class="profile-stat-card"><div class="profile-stat-label">النتائج</div><div class="profile-stat-value">${stats.resultsCount}</div></div>` +
    `<div class="profile-stat-card"><div class="profile-stat-label">Google Sheets</div><div class="profile-stat-value" style="color:${stats.cloudConnected ? "var(--secondary)" : "var(--warning)"};">${stats.cloudConnected ? "متصل" : "غير متصل"}</div></div>`;
}

window.renderTeacherHomeDashboard = renderTeacherHomeDashboard;

function renderTeacherStatsDashboard() {
  setupStatsDateRangeControls();
  const overview = document.getElementById("teacher-stats-overview");
  if (!overview) return;

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
          `<span style="color:${statusColor}; font-weight:800;">${escapeHtml(formatResultGradeCell(res))}</span>` +
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

  if (window.ArabyaAnalytics) {
    window.ArabyaAnalytics.renderTeacherAnalyticsPanel(systemState, getTeacherAnalyticsHelpers());
  }
}

window.renderTeacherStatsDashboard = renderTeacherStatsDashboard;

function loadTeacherDashboardData() {
  if (window.ArabyaQuestionBank && window.ArabyaQuestionBank.consolidateQuestionBankStorage) {
    window.ArabyaQuestionBank.consolidateQuestionBankStorage();
  }
  if (systemState.activeTeacher) {
    normalizeTeacherAccount(systemState.activeTeacher);
    const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
    if (idx !== -1) systemState.teachers[idx] = systemState.activeTeacher;
  }
  if (!systemState.activeTeacher) return;
  normalizeTeacherAccount(systemState.activeTeacher);
  updateTeacherDashboardAccessUI();
  applyUnifiedCloudSyncModel();

  document.getElementById("teacher-profile-name").value = systemState.activeTeacher.name;
  document.getElementById("teacher-profile-subject").value = systemState.activeTeacher.subject;
  document.getElementById("teacher-profile-autocode").value = systemState.activeTeacher.autoEntryCode || "";
  document.getElementById("teacher-config-code").value = systemState.activeTeacher.password;
  document.getElementById("teacher-config-url").value = systemState.activeTeacher.integrationConfig?.googleFormUrl || "";
  document.getElementById("teacher-config-name").value = systemState.activeTeacher.integrationConfig?.entryName || "";
  document.getElementById("teacher-config-id").value = systemState.activeTeacher.integrationConfig?.entryId || "";
  document.getElementById("teacher-config-code-id").value = systemState.activeTeacher.integrationConfig?.entryCode || "";
  document.getElementById("teacher-config-score").value = systemState.activeTeacher.integrationConfig?.entryScore || "";
  document.getElementById("teacher-config-details").value = systemState.activeTeacher.integrationConfig?.entryDetails || "";

  // توليد وعرض رابط الدخول التلقائي للمعلم
  const baseUrl = getAppBaseUrl();
  const autoUrl = `${baseUrl}?teacher_autocode=${systemState.activeTeacher.autoEntryCode}`;
  document.getElementById("teacher-auto-login-url").value = autoUrl;

  renderTeacherProfilePanel();
  renderTeacherHomeDashboard();
  renderTeacherStatsDashboard();
  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  refreshCloudSyncStatusUI();
  if (window.ArabyaQuestionBank) {
    window.ArabyaQuestionBank.refreshSharedBankSelect(systemState.activeTeacher?.username);
  }

  restoreTeacherActiveTab();

  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced && synced.ok) {
      refreshTeacherDashboardViews({ all: true });
    }
  });
  void refreshPlatformAppVersionFromCloud({ pushIfBuildAhead: true });

  if (window.ArabyaCloudSync) {
    window.ArabyaCloudSync.startPullLoop();
  }
  if (window.ArabyaPlatformSync) {
    window.ArabyaPlatformSync.renderQuestionBankSyncIndicator();
    if (isSuperAdminTeacher()) window.ArabyaPlatformSync.renderSyncHealthPanel(null);
  }
}

async function saveTeacherProfile() {
  if (!systemState.activeTeacher) return;

  if (getActiveDashboardAccountRole() === ARABYA_ACCOUNT_ROLES.STUDENT) {
    const student = getStudentDashboardAccount();
    if (!student) {
      alert("تعذّر تحديد حساب الطالب.");
      return;
    }
    const idx = systemState.students.findIndex(s => getStudentLookupKey(s) === getStudentLookupKey(student));
    if (idx !== -1) {
      systemState.students[idx].name = student.name;
      systemState.students[idx].id = student.id;
      systemState.students[idx].code = student.code;
      saveSystemState(true);
      renderStudentDashboardProfile();
      alert("تم حفظ بيانات الطالب محلياً.");
    } else {
      alert("هذا الحساب للعرض فقط — لا يوجد سجل طالب مطابق في قاعدة البيانات.");
    }
    return;
  }

  const name = document.getElementById("teacher-profile-name").value.trim();
  const subject = document.getElementById("teacher-profile-subject").value.trim();
  const autoCode = document.getElementById("teacher-profile-autocode").value.trim();

  if (!name || !subject || !autoCode) {
    alert("يرجى ملء جميع الحقول المطلوبة وحقل رمز الدخول التلقائي!");
    return;
  }

  const isCodeDuplicate = systemState.teachers.some(t => t.username !== systemState.activeTeacher.username && t.autoEntryCode === autoCode);
  if (isCodeDuplicate) {
    alert("رمز الدخول التلقائي هذا مستخدم بالفعل من قبل معلم آخر! اختر رمزاً فريداً.");
    return;
  }

  systemState.activeTeacher.name = name;
  systemState.activeTeacher.subject = subject;
  systemState.activeTeacher.autoEntryCode = autoCode;
  systemState.activeTeacher.password = autoCode;
  if (systemState.config) {
    systemState.config.autoEntryCode = autoCode;
    systemState.config.teacherCode = autoCode;
  }

  systemState.teacherProfile = { name, subject, autoEntryCode: autoCode };

  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }

  syncActiveTeacherCredentials(autoCode);
  if (window.ArabyaSecurity) {
    await window.ArabyaSecurity.ensureTeacherPasswordHashed(systemState.activeTeacher, autoCode);
    if (idx !== -1) systemState.teachers[idx] = systemState.activeTeacher;
    saveTeachersToLocalStorage();
  }
  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  saveSystemState(false);
  loadTeacherDashboardData();

  updateTeacherCredentialSyncIndicator(null, true);
  const syncResult = await syncTeacherCredentialsToCloud();
  updateTeacherCredentialSyncIndicator(syncResult, false);
  alert(formatTeacherCredentialSyncMessage(syncResult));
}

async function saveTeacherIntegrationConfig() {
  if (!systemState.activeTeacher) return;

  const code = document.getElementById("teacher-config-code").value.trim();
  const url = document.getElementById("teacher-config-url").value.trim();
  const entryName = document.getElementById("teacher-config-name").value.trim();
  const entryId = document.getElementById("teacher-config-id").value.trim();
  const entryCode = document.getElementById("teacher-config-code-id").value.trim();
  const entryScore = document.getElementById("teacher-config-score").value.trim();
  const entryDetails = document.getElementById("teacher-config-details").value.trim();
  const cloudBackupScope = ARABYA_CLOUD_BACKUP_SCOPE_GENERAL;

  if (!code) {
    alert("الرقم السري لا يمكن أن يكون فارغاً!");
    return;
  }

  systemState.activeTeacher.password = code;
  systemState.activeTeacher.autoEntryCode = code;
  systemState.activeTeacher.integrationConfig = {
    ...(systemState.activeTeacher.integrationConfig || {}),
    googleFormUrl: url,
    entryName,
    entryId,
    entryCode,
    entryScore,
    entryDetails,
    cloudBackupScope
  };

  systemState.config = {
    teacherCode: code,
    googleFormUrl: url,
    entryName,
    entryId,
    entryCode,
    entryScore,
    entryDetails,
    cloudBackupScope,
    autoEntryCode: systemState.activeTeacher.autoEntryCode || code
  };

  // تحديث القائمة العامة والـ local storage
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }

  systemState.teacherProfile = {
    name: systemState.activeTeacher.name,
    subject: systemState.activeTeacher.subject,
    autoEntryCode: code
  };
  syncActiveTeacherCredentials(code);
  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  saveSystemState(false);

  updateTeacherCredentialSyncIndicator(null, true);
  const syncResult = await syncTeacherCredentialsToCloud();
  updateTeacherCredentialSyncIndicator(syncResult, false);
  alert(formatTeacherCredentialSyncMessage(syncResult));
}

// عرض الامتحانات
function renderExamsList() {
  const container = document.getElementById("teacher-exams-list");
  container.innerHTML = "";

  const teacherExams = getTeacherScopedExams();
  const showOwner = isSuperAdminTeacher();

  if (teacherExams.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 2rem;">لا توجد امتحانات مضافة بعد. أنشئ امتحاناً بالأسفل!</div>`;
    return;
  }

  teacherExams.forEach(exam => {
    sanitizeQuestionConfig(exam);
    const card = document.createElement("div");
    card.className = "exam-info-card";
    
    // ربط المعلم النشط بالرابط تلقائياً
    const examUrl = getExamDirectLink(exam);
    const totalExamScore = exam.totalScore || 100;
    const bankCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
    const configuredCount = getConfiguredQuestionCount(exam);
    const displayedCount = configuredCount || bankCount;
    const questionMode = exam.shuffleQuestions === false ? "ترتيبي" : "عشوائي";
    const syncUrl = getUnifiedTeacherSyncUrl(exam);
    const badge = syncUrl
      ? `<span id="sync-badge-${exam.id}" style="display:inline-flex; align-items:center; gap:0.25rem; color:var(--secondary); font-weight:700;"><span class="material-icons" style="font-size:1rem;">cloud_queue</span> مزامنة موحّدة (رابط المعلم) — اختبر الاتصال</span>`
      : `<span id="sync-badge-${exam.id}" style="display:inline-flex; align-items:center; gap:0.25rem; color:var(--error); font-weight:700;"><span class="material-icons" style="font-size:1rem;">cloud_off</span> لا يوجد رابط موحّد في تبويب الربط (محلي فقط)</span>`;

    card.innerHTML = `
      <div>
        <div class="exam-info-title">${exam.title}</div>
        <div style="font-size:0.8rem; color:var(--secondary); font-weight:600; margin-bottom:0.5rem;">
          المادة: ${exam.subject} | الفرقة: ${exam.level || 'غير محددة'}${showOwner && exam.teacher ? ` | المعلم: ${exam.teacher}` : ""}
        </div>
        <div class="exam-info-details">
          <span>الكلية: ${exam.faculty || 'عام'} | الجامعة: ${exam.university || 'عام'}</span>
          <span>المجموع النهائي الكلي: <code style="color:var(--accent); font-weight:700;">${totalExamScore} درجة</code></span>
          <span>النوع: ${exam.examType || 'أعمال فصلية'} | بنك الأسئلة: ${bankCount}</span>
          <span>المعروض للطالب: ${displayedCount} | النمط: ${questionMode}</span>
          <span style="margin-top:0.35rem; font-size:0.82rem;">${badge}</span>
        </div>
      </div>
      <div>
        <div class="exam-actions-row">
          <button class="btn btn-primary btn-sm" onclick="editExamQuestions('${exam.id}')">تعديل الامتحان والأسئلة</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary);" onclick="testExamSync('${exam.id}')">اختبار المزامنة</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--accent); color:var(--accent);" onclick="setTeacherResultsExamFilter('${exam.id}')">عرض النتائج</button>
          <button class="btn btn-outline btn-sm" onclick="copyExamLink('${examUrl}')">نسخ الرابط</button>
          <button class="btn btn-outline btn-sm" onclick="generateGoogleFormScript('${exam.id}')">تصدير لجوجل فورم</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error);" onclick="deleteExam('${exam.id}')">حذف</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}


function readNewExamTotalScore() {
  const el = document.getElementById("new-exam-totalscore");
  const parsed = parseFloat(el?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function readNewExamTimeLimitMinutes() {
  const el = document.getElementById("new-exam-timelimit");
  const parsed = parseFloat(el?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

function readNewExamShuffleQuestions() {
  const el = document.getElementById("new-exam-randomize");
  return el ? el.checked !== false : true;
}

function readNewExamQuestionCountRaw() {
  return String(document.getElementById("new-exam-question-count")?.value || "").trim();
}

function readNewExamMaxCheatAttempts() {
  const raw = document.getElementById("new-exam-max-cheat-attempts")?.value ?? "5";
  const parsed = parseInt(String(raw).trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
}

function readNewExamEndsAtIso() {
  return parseExamEndsAtInput(document.getElementById("new-exam-ends-at")?.value || "");
}

// إنشاء امتحان جديد
function createNewExam() {
  const title = document.getElementById("new-exam-title").value.trim();
  const subject = document.getElementById("new-exam-subject").value.trim();
  const level = document.getElementById("new-exam-level").value.trim();
  const faculty = document.getElementById("new-exam-faculty").value.trim();
  const university = document.getElementById("new-exam-university").value.trim();
  const examType = document.getElementById("new-exam-type").value;

  if (!title || !subject || !level || !faculty || !university) {
    alert("يرجى ملء كافة تفاصيل بيانات الامتحان الأكاديمية الجديدة!");
    return;
  }

  const examId = Math.random().toString(36).substr(2, 6).toUpperCase();

  const newExam = {
    id: examId,
    teacher: systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية",
    title,
    subject,
    level,
    faculty,
    university,
    examType,
    totalScore: readNewExamTotalScore(),
    timeLimit: readNewExamTimeLimitMinutes(),
    shuffleQuestions: readNewExamShuffleQuestions(),
    questionCount: readNewExamQuestionCountRaw(),
    maxCheatAttempts: readNewExamMaxCheatAttempts(),
    endsAt: readNewExamEndsAtIso(),
    questions: []
  };

  systemState.exams.push(newExam);
  saveSystemState(true);
  
  document.getElementById("new-exam-title").value = "";
  document.getElementById("new-exam-subject").value = "";
  document.getElementById("new-exam-level").value = "";
  document.getElementById("new-exam-faculty").value = "";
  document.getElementById("new-exam-university").value = "";
  const newTotal = document.getElementById("new-exam-totalscore");
  if (newTotal) newTotal.value = "100";
  const newTime = document.getElementById("new-exam-timelimit");
  if (newTime) newTime.value = "60";
  const newCount = document.getElementById("new-exam-question-count");
  if (newCount) newCount.value = "";
  const newCheat = document.getElementById("new-exam-max-cheat-attempts");
  if (newCheat) newCheat.value = "5";
  const newEnds = document.getElementById("new-exam-ends-at");
  if (newEnds) newEnds.value = "";
  const newRand = document.getElementById("new-exam-randomize");
  if (newRand) newRand.checked = true;
  
  renderExamsList();

  const examUrl = getExamDirectLink(newExam);
  
  const directLinkBox = document.getElementById("new-exam-direct-link-box");
  const directLinkInput = document.getElementById("new-exam-direct-link-input");
  
  directLinkInput.value = examUrl;
  directLinkBox.classList.remove("hidden");

  alert(`تم إنشاء الامتحان "${title}" بنجاح! يمكنك الآن نسخ رابط الدخول للطلاب بالأسفل أو البدء في تعديل وإضافة الأسئلة.`);
}

window.deleteExam = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (exam && !canTeacherManageExam(exam)) {
    alert("ليس لديك صلاحية حذف هذا الامتحان.");
    return;
  }
  if (confirm("هل أنت متأكد من حذف هذا الامتحان بالكامل؟ ستفقد جميع الأسئلة المرتبطة به.")) {
    systemState.exams = systemState.exams.filter(e => e.id !== examId);
    saveSystemState(true);
    renderExamsList();
  }
};

// ==========================================
// 4. محرر الأسئلة والبيانات المطور
// ==========================================
let currentEditingExamId = null;
window.currentEditingExamId = null;

window.editExamQuestions = function(examId) {
  currentEditingExamId = examId;
  window.currentEditingExamId = examId;
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;
  sanitizeQuestionConfig(exam);

  document.getElementById("teacher-exams-list-view").classList.add("hidden");
  
  const editorPanel = document.getElementById("teacher-questions-editor-panel");
  editorPanel.classList.remove("hidden");
  
  document.getElementById("editor-exam-title").innerText = exam.title;

  // تعبئة حقول تعديل الميتا داتا للأمتحان
  document.getElementById("edit-meta-title").value = exam.title;
  document.getElementById("edit-meta-subject").value = exam.subject;
  document.getElementById("edit-meta-level").value = exam.level || "";
  document.getElementById("edit-meta-faculty").value = exam.faculty || "";
  document.getElementById("edit-meta-university").value = exam.university || "";
  document.getElementById("edit-meta-type").value = exam.examType || "أعمال فصلية";
  document.getElementById("edit-meta-totalscore").value = exam.totalScore || 100;
  const timeLimitEl = document.getElementById("edit-meta-timelimit");
  if (timeLimitEl) timeLimitEl.value = exam.timeLimit || 60;
  const randomizeEl = document.getElementById("edit-meta-randomize");
  if (randomizeEl) randomizeEl.checked = exam.shuffleQuestions !== false;
  const questionCountEl = document.getElementById("edit-meta-question-count");
  if (questionCountEl) questionCountEl.value = exam.questionCount || "";
  const maxCheatEl = document.getElementById("edit-meta-max-cheat-attempts");
  if (maxCheatEl) maxCheatEl.value = exam.maxCheatAttempts ?? 5;
  const endsAtEl = document.getElementById("edit-meta-ends-at");
  if (endsAtEl) endsAtEl.value = formatExamEndsAtForInput(exam.endsAt || "");
  document.getElementById("edit-meta-entry-name").value = exam.entryName || "";
  document.getElementById("edit-meta-entry-id").value = exam.entryId || "";
  document.getElementById("edit-meta-entry-code").value = exam.entryCode || "";
  document.getElementById("edit-meta-entry-score").value = exam.entryScore || "";
  document.getElementById("edit-meta-entry-details").value = exam.entryDetails || "";
  if (window.ArabyaPlatformSync) window.ArabyaPlatformSync.applyHallModeToEditor(exam);
  renderExamAllowedIpsList(exam);

  // توليد وعرض الرابط المباشر للاختبار المرتبط بالمعلم
  const examUrl = getExamDirectLink(exam);
  const linkInput = document.getElementById("edit-exam-direct-link");
  if (linkInput) {
    linkInput.value = examUrl;
  }

  renderQuestionsForEdit(exam);
  if (window.ArabyaQuestionBank) {
    window.ArabyaQuestionBank.refreshSharedBankSelect(systemState.activeTeacher?.username);
  }
};

window.closeQuestionsEditor = function() {
  document.getElementById("teacher-questions-editor-panel").classList.add("hidden");
  document.getElementById("teacher-exams-list-view").classList.remove("hidden");
  currentEditingExamId = null;
  window.currentEditingExamId = null;
  renderExamsList();
};

function renderQuestionsForEdit(exam) {
  const container = document.getElementById("editor-questions-list");
  container.innerHTML = "";

  if (exam.questions.length === 0) {
    container.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">لا توجد أسئلة مضافة في هذا الامتحان بعد. أضف سؤالاً بالأسفل!</div>`;
    return;
  }

  exam.questions.forEach((q, index) => {
    const card = document.createElement("div");
    card.className = "exam-builder-card";
    
    let typeName = "اختيار من متعدد";
    if (q.type === "boolean") typeName = "صواب وخطأ";
    if (q.type === "essay") typeName = "سؤال مقالي كتابي";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
        <span style="font-weight:700; color:white;">سؤال ${index + 1} (${typeName})</span>
        <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error);" onclick="deleteQuestion(${index})">حذف السؤال</button>
      </div>
      
      <div style="display: grid; grid-template-columns: minmax(0, 2fr) minmax(90px, 1fr) minmax(110px, 1fr); gap: 1rem; margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">نص السؤال:</label>
          <textarea class="form-control edit-q-text" data-index="${index}" rows="3" dir="auto" style="resize:vertical; min-height:3.5rem;"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">درجة السؤال:</label>
          <input type="number" class="form-control edit-q-points" value="${q.points !== undefined ? q.points : 10}" min="1" data-index="${index}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">مدة الإجابة (ثانية):</label>
          <input type="number" class="form-control edit-q-time" value="${q.timeSeconds !== undefined ? q.timeSeconds : 60}" min="5" data-index="${index}">
        </div>
      </div>
    `;

    const questionTextInput = card.querySelector(".edit-q-text");
    if (questionTextInput) {
      questionTextInput.value = q.question == null ? "" : String(q.question);
    }

    const optionsWrapper = document.createElement("div");
    optionsWrapper.style.marginTop = "0.75rem";
    optionsWrapper.className = "edit-options-wrapper";
    optionsWrapper.dataset.qIndex = index;

    if (q.type === "essay") {
      optionsWrapper.innerHTML = `
        <div style="background:rgba(255,255,255,0.01); border:1px dashed var(--border-color); padding:1rem; border-radius:8px; color:var(--accent); font-size:0.85rem;">
          <span class="material-icons" style="vertical-align:middle; font-size:1.1rem;">article</span> سؤال مقالي: سيظهر للطالب مساحة نصية حرة للإجابة والكتابة بالتفصيل. يتم تقييم النتيجة يدوياً.
        </div>
      `;
    } else if (q.type === "boolean") {
      q.options.forEach((opt, optIdx) => {
        const isCorrect = optIdx === q.correctAnswer;
        const optGroup = document.createElement("div");
        optGroup.className = "form-group";
        optGroup.style.display = "flex";
        optGroup.style.alignItems = "center";
        optGroup.style.gap = "0.5rem";
        optGroup.style.marginBottom = "0.5rem";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `edit-correct-${index}`;
        radio.value = String(optIdx);
        if (isCorrect) radio.checked = true;
        const optInput = document.createElement("input");
        optInput.type = "text";
        optInput.className = "form-control edit-q-option";
        optInput.style.padding = "0.5rem 1rem";
        optInput.dataset.questionIndex = String(index);
        optInput.dataset.optionIndex = String(optIdx);
        optInput.readOnly = true;
        optInput.value = opt == null ? "" : String(opt);
        optGroup.appendChild(radio);
        optGroup.appendChild(optInput);
        optionsWrapper.appendChild(optGroup);
      });
    } else {
      q.options.forEach((opt, optIdx) => {
        const isCorrect = optIdx === q.correctAnswer;
        const optGroup = document.createElement("div");
        optGroup.className = "form-group";
        optGroup.style.display = "flex";
        optGroup.style.alignItems = "center";
        optGroup.style.gap = "0.5rem";
        optGroup.style.marginBottom = "0.5rem";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `edit-correct-${index}`;
        radio.value = String(optIdx);
        if (isCorrect) radio.checked = true;
        const optInput = document.createElement("input");
        optInput.type = "text";
        optInput.className = "form-control edit-q-option";
        optInput.style.padding = "0.5rem 1rem";
        optInput.dataset.questionIndex = String(index);
        optInput.dataset.optionIndex = String(optIdx);
        optInput.value = opt == null ? "" : String(opt);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-outline btn-sm";
        removeBtn.style.borderColor = "var(--error)";
        removeBtn.style.color = "var(--error)";
        removeBtn.style.padding = "0.4rem";
        removeBtn.title = "حذف البديل";
        removeBtn.innerHTML = "&times;";
        removeBtn.addEventListener("click", () => removeOptionFromQuestion(index, optIdx));
        optGroup.appendChild(radio);
        optGroup.appendChild(optInput);
        optGroup.appendChild(removeBtn);
        optionsWrapper.appendChild(optGroup);
      });

      const actionRow = document.createElement("div");
      actionRow.style.marginTop = "0.5rem";
      actionRow.style.display = "flex";
      actionRow.style.gap = "0.5rem";
      
      actionRow.innerHTML = `
        <button class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary);" onclick="addOptionToQuestion(${index})">+ إضافة خيار إضافي</button>
      `;
      optionsWrapper.appendChild(actionRow);
    }

    card.appendChild(optionsWrapper);
    container.appendChild(card);
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary";
  saveBtn.style.marginTop = "1rem";
  saveBtn.innerHTML = `<span class="material-icons">save</span> حفظ جميع التعديلات الحالية`;
  saveBtn.addEventListener("click", saveAllEditedQuestions);
  container.appendChild(saveBtn);
}

// حفظ الأسئلة والبيانات الأكاديمية لاحقاً (تعديل كامل)

function applyExamMetaFromEditor(exam, options = {}) {
  const requireAcademic = options.requireAcademic !== false;
  const editTitle = document.getElementById("edit-meta-title")?.value.trim() || "";
  const editSubject = document.getElementById("edit-meta-subject")?.value.trim() || "";
  const editLevel = document.getElementById("edit-meta-level")?.value.trim() || "";
  const editFaculty = document.getElementById("edit-meta-faculty")?.value.trim() || "";
  const editUniversity = document.getElementById("edit-meta-university")?.value.trim() || "";
  const editType = document.getElementById("edit-meta-type")?.value || exam.examType || "أعمال فصلية";
  const editTotalScore = parseFloat(document.getElementById("edit-meta-totalscore")?.value) || 100;
  const editRandomizeQuestions = document.getElementById("edit-meta-randomize")?.checked !== false;
  const rawQuestionCount = document.getElementById("edit-meta-question-count")?.value.trim() || "";
  const rawMaxCheatAttempts = document.getElementById("edit-meta-max-cheat-attempts")?.value ?? "5";
  const editEntryName = document.getElementById("edit-meta-entry-name")?.value.trim() || "";
  const editEntryId = document.getElementById("edit-meta-entry-id")?.value.trim() || "";
  const editEntryCode = document.getElementById("edit-meta-entry-code")?.value.trim() || "";
  const editEntryScore = document.getElementById("edit-meta-entry-score")?.value.trim() || "";
  const editEntryDetails = document.getElementById("edit-meta-entry-details")?.value.trim() || "";

  if (requireAcademic && (!editTitle || !editSubject || !editLevel || !editFaculty || !editUniversity)) {
    alert("يرجى ملء جميع حقول بيانات الامتحان الأكاديمية المطلوبة!");
    return false;
  }

  if (rawQuestionCount) {
    const questionCountNumber = parseInt(rawQuestionCount, 10);
    if (!Number.isFinite(questionCountNumber) || questionCountNumber <= 0) {
      alert("عدد الأسئلة المعروضة يجب أن يكون رقماً صحيحاً أكبر من صفر.");
      return false;
    }
    const bankSize = Array.isArray(exam.questions) ? exam.questions.length : 0;
    if (bankSize && questionCountNumber > bankSize) {
      alert(`عدد الأسئلة المعروضة (${questionCountNumber}) لا يمكن أن يتجاوز حجم بنك الأسئلة الحالي (${bankSize}).`);
      return false;
    }
  }

  const maxCheatAttemptsNumber = parseInt(String(rawMaxCheatAttempts).trim(), 10);
  if (!Number.isFinite(maxCheatAttemptsNumber) || maxCheatAttemptsNumber < 0) {
    alert("عدد محاولات الغش المسموحة يجب أن يكون 0 أو أكبر.");
    return false;
  }

  exam.title = editTitle || exam.title;
  exam.subject = editSubject || exam.subject;
  exam.level = editLevel || exam.level;
  exam.faculty = editFaculty || exam.faculty;
  exam.university = editUniversity || exam.university;
  exam.examType = editType;
  exam.totalScore = editTotalScore;
  exam.timeLimit = parseFloat(document.getElementById("edit-meta-timelimit")?.value) || 60;
  exam.endsAt = parseExamEndsAtInput(document.getElementById("edit-meta-ends-at")?.value || "");
  exam.shuffleQuestions = editRandomizeQuestions;
  exam.questionCount = rawQuestionCount;
  exam.maxCheatAttempts = maxCheatAttemptsNumber;
  if (exam.googleFormUrl) delete exam.googleFormUrl;
  exam.entryName = editEntryName;
  exam.entryId = editEntryId;
  exam.entryCode = editEntryCode;
  exam.entryScore = editEntryScore;
  exam.entryDetails = editEntryDetails;
  const rawMaxSharedIp = document.getElementById("edit-meta-max-shared-ip")?.value ?? "15";
  const maxSharedIp = parseInt(String(rawMaxSharedIp).trim(), 10);
  if (!Number.isFinite(maxSharedIp) || maxSharedIp < 1) {
    alert("حد الطلاب المسموح لهم بنفس عنوان IP يجب أن يكون 1 أو أكثر.");
    return false;
  }
  exam.ipAccessPolicy = { ...(exam.ipAccessPolicy || {}), maxStudentsPerSharedIp: maxSharedIp };
  if (window.ArabyaPlatformSync) window.ArabyaPlatformSync.saveHallModeToExam(exam);
  sanitizeQuestionConfig(exam);
  return true;
}

window.saveExamMetaSettingsOnly = async function() {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;
  if (!canTeacherManageExam(exam)) {
    alert("ليس لديك صلاحية تعديل إعدادات هذا الامتحان.");
    return;
  }
  if (!applyExamMetaFromEditor(exam, { requireAcademic: true })) return;
  touchExamContentRevision(exam);
  saveSystemState(false);
  const cloudOk = await pushLocalStateToCloudNow("save_exam_meta");
  document.getElementById("editor-exam-title").innerText = exam.title;
  renderExamAllowedIpsList(exam);
  const pushHint = (systemState.lastCloudPushError || "").trim();
  alert(cloudOk
    ? "تم حفظ إعدادات الامتحان ورفعها إلى السحابة بنجاح."
    : `تم الحفظ محلياً.\n\nتعذّر الرفع السحابي${pushHint ? `:\n${pushHint}` : ""}`);
  renderExamsList();
};

async function saveAllEditedQuestions() {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;
  if (!canTeacherManageExam(exam)) {
    alert("ليس لديك صلاحية تعديل هذا الامتحان.");
    return;
  }

  const rawQuestionCount = document.getElementById("edit-meta-question-count")?.value.trim() || "";
  if (!applyExamMetaFromEditor(exam, { requireAcademic: true })) return;

  // 2. تحديث وحفظ الأسئلة وأوزان درجاتها
  const cards = document.querySelectorAll("#editor-questions-list .exam-builder-card");
  const updatedQuestions = [];

  cards.forEach((card, index) => {
    const textInput = card.querySelector(".edit-q-text");
    const questionText = textInput ? textInput.value.trim() : "";

    const pointsInput = card.querySelector(".edit-q-points");
    const questionPoints = pointsInput ? parseFloat(pointsInput.value) || 10 : 10;

    const timeInput = card.querySelector(".edit-q-time");
    const questionTimeSeconds = timeInput ? parseInt(timeInput.value, 10) || 60 : 60;

    const typeInput = exam.questions[index].type;

    let options = [];
    let correctAnswer = 0;

    if (typeInput === "essay") {
      options = [];
      correctAnswer = "";
    } else {
      const optionInputs = card.querySelectorAll(".edit-q-option");
      optionInputs.forEach(input => {
        options.push(input.value.trim());
      });

      const checkedRadio = card.querySelector(`input[name="edit-correct-${index}"]:checked`);
      correctAnswer = checkedRadio ? parseInt(checkedRadio.value) : 0;
    }

    updatedQuestions.push({
      id: index + 1,
      type: typeInput,
      question: questionText,
      options,
      correctAnswer,
      points: questionPoints,
      timeSeconds: Math.max(5, questionTimeSeconds)
    });
  });

  exam.questions = updatedQuestions;
  if (rawQuestionCount) {
    const questionCountNumber = parseInt(rawQuestionCount, 10);
    if (!Number.isFinite(questionCountNumber) || questionCountNumber <= 0) {
      alert("عدد الأسئلة المعروضة يجب أن يكون رقماً صحيحاً أكبر من صفر.");
      return;
    }
    if (questionCountNumber > updatedQuestions.length) {
      alert(`عدد الأسئلة المعروضة (${questionCountNumber}) لا يمكن أن يتجاوز حجم بنك الأسئلة الحالي (${updatedQuestions.length}).`);
      return;
    }
  }
  sanitizeQuestionConfig(exam);
  touchExamContentRevision(exam);
  saveSystemState(false);

  let cloudOk = false;
  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (indicator) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري رفع التعديلات إلى السحابة...`;
  }
  try {
    cloudOk = await pushLocalStateToCloudNow("save_exam_questions");
  } catch (pushErr) {
    console.warn("[ARABYA] save exam cloud push:", pushErr);
  }
  saveSystemState(false);
  if (indicator) {
    if (cloudOk) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--success); font-size:1.1rem; vertical-align:middle;">cloud_done</span> تم حفظ الامتحان ورفعه إلى السحابة`;
    } else if (getCloudBackupTargetUrls().length) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_off</span> حُفظ محلياً — تعذّر الرفع السحابي، سيتم إعادة المحاولة`;
    }
  }

  const pushHint = (systemState.lastCloudPushError || "").trim();
  alert(cloudOk
    ? "تم تعديل وحفظ بيانات الامتحان وكافة الأسئلة ورفعها إلى السحابة بنجاح!"
    : `تم الحفظ على هذا الجهاز.\n\nتعذّر الرفع إلى السحابة${pushHint ? `:\n${pushHint}` : ""}\n\nتحقق من:\n• رابط /exec في تبويب الربط\n• نشر Apps Script للجميع (Anyone)\n• ثم اضغط «نسخة احتياطية سحابية»`);
  
  // إعادة عرض
  document.getElementById("editor-exam-title").innerText = exam.title;
  renderQuestionsForEdit(exam);
}

window.addOptionToQuestion = function(qIndex) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  exam.questions[qIndex].options.push(`خيار جديد ${exam.questions[qIndex].options.length + 1}`);
  renderQuestionsForEdit(exam);
};

window.removeOptionFromQuestion = function(qIndex, optIndex) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  if (exam.questions[qIndex].options.length <= 2) {
    alert("لا يمكن أن يحتوي سؤال الاختيار على أقل من بديلين!");
    return;
  }

  exam.questions[qIndex].options.splice(optIndex, 1);
  if (exam.questions[qIndex].correctAnswer >= exam.questions[qIndex].options.length) {
    exam.questions[qIndex].correctAnswer = 0;
  }
  
  renderQuestionsForEdit(exam);
};

window.addNewQuestionToExam = function(type) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  let newQ = null;
  if (type === 'multiple') {
    newQ = {
      id: exam.questions.length + 1,
      type: "multiple",
      question: "اكتب سؤال الاختيار من متعدد الجديد هنا...",
      options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث"],
      correctAnswer: 0,
      points: 10,
      timeSeconds: 60
    };
  } else if (type === 'boolean') {
    newQ = {
      id: exam.questions.length + 1,
      type: "boolean",
      question: "اكتب سؤال الصواب والخطأ هنا...",
      options: ["صواب", "خطأ"],
      correctAnswer: 0,
      points: 10,
      timeSeconds: 60
    };
  } else {
    newQ = {
      id: exam.questions.length + 1,
      type: "essay",
      question: "اكتب نص السؤال المقالي الجديد هنا...",
      options: [],
      correctAnswer: "",
      points: 10,
      timeSeconds: 60
    };
  }

  exam.questions.push(newQ);
  saveSystemState(true);
  renderQuestionsForEdit(exam);
};

window.deleteQuestion = function(index) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  if (confirm("هل أنت متأكد من حذف هذا السؤال؟")) {
    exam.questions.splice(index, 1);
    exam.questions.forEach((q, idx) => { q.id = idx + 1; });
    saveSystemState(true);
    renderQuestionsForEdit(exam);
  }
};

// ==========================================
// 5. التصدير والاستيراد لـ Google Forms
// ==========================================


/** تهريب نصوص HTML (محتوى أو سمات) لعرض آمن دون حذف علامات الاقتباس أو الرموز */

window.generateGoogleFormScript = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;

  let script = `/**
 * Google Apps Script لتوليد امتحان "${escapeAppsScriptString(exam.title)}" تلقائياً
 * تم إنشاؤه بواسطة منصة arabya.ai
 */
function createArabyaExamForm() {
  var form = FormApp.create('${escapeAppsScriptString(exam.title)}');
  form.setDescription('المادة: ${escapeAppsScriptString(exam.subject)} | الكلية: ${escapeAppsScriptString(exam.faculty)} | الجامعة: ${escapeAppsScriptString(exam.university)} \\n تم إنشاء النموذج تلقائياً عبر arabya.ai');
  form.setIsQuiz(true);
  
  var studentName = form.addTextItem();
  studentName.setTitle('اسم الطالب بالكامل').setRequired(true);
  
  var studentId = form.addTextItem();
  studentId.setTitle('رقم المعرف (ID)').setRequired(true);
  
  var accessCode = form.addTextItem();
  accessCode.setTitle('كود الاشتراك بموقع الامتحان (اختياري)').setRequired(false);
  
  var scorePlaceholder = form.addTextItem();
  scorePlaceholder.setTitle('النتيجة (حقل مزامنة للـ API)').setRequired(false);
  
  var detailsPlaceholder = form.addParagraphTextItem();
  detailsPlaceholder.setTitle('تقرير الإجابات التفصيلي (حقل مزامنة للـ API)').setRequired(false);
`;

  exam.questions.forEach((q, idx) => {
    const points = q.points !== undefined ? q.points : 10;
    if (q.type === 'essay') {
      script += `
  var item${idx} = form.addParagraphTextItem();
  item${idx}.setTitle('${escapeAppsScriptString(q.question)}');
  item${idx}.setRequired(true);
`;
    } else {
      script += `
  var item${idx} = form.addMultipleChoiceItem();
  item${idx}.setTitle('${escapeAppsScriptString(q.question)}');
  item${idx}.setChoices([
    ${q.options.map((opt, oIdx) => `item${idx}.createChoice('${escapeAppsScriptString(opt)}', ${oIdx === q.correctAnswer})`).join(",\n    ")}
  ]);
  item${idx}.setPoints(${points});
  item${idx}.setRequired(true);
`;
    }
  });

  script += `
  Logger.log('تم إنشاء النموذج بنجاح: ' + form.getEditUrl());
  Browser.msgBox('تم إنشاء الامتحان بنجاح في Google Drive الخاص بك! رابط التعديل هو: ' + form.getEditUrl());
}
`;

  navigateToView("teacher-dashboard-view");
  activateTeacherTab("integration", { force: true, skipRefresh: true });

  const oldTextarea = document.getElementById("google-apps-script-code");
  if (oldTextarea) {
    oldTextarea.value = script;
  } else {
    const box = document.createElement("div");
    box.className = "config-card-box";
    box.id = "apps-script-output-container";
    box.innerHTML = `
      <h4 style="color:var(--secondary); margin-bottom:0.5rem; font-weight:700;">كود Google Apps Script للامتحان الحالي:</h4>
      <textarea id="google-apps-script-code" class="essay-textarea" style="font-family:monospace; font-size:0.8rem;" readonly>${script}</textarea>
      <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="copyAppsScriptCode()">نسخ الكود البرمجي</button>
    `;
    tabIntegration.appendChild(box);
  }
  
  alert("تم توليد كود Google Apps Script بنجاح بالأسفل! يرجى الذهاب لتبويب (الربط بـ Google Sheets) لنسخ الكود.");
};

window.copyAppsScriptCode = function() {
  const code = document.getElementById("google-apps-script-code");
  if (code) {
    navigator.clipboard.writeText(code.value).then(() => {
      alert("تم نسخ الكود البرمجي بنجاح! افتح script.google.com لإنشاء الامتحان.");
    });
  }
};

function importExamFromGoogleForm() {
  const sourceText = document.getElementById("teacher-import-exam-source").value.trim();
  if (!sourceText) {
    alert("يرجى لصق الكود المصدري للنموذج أو كود الـ JSON للاستيراد!");
    return;
  }

  let importedExam = null;

  try {
    const parsed = JSON.parse(sourceText);
    if (parsed && parsed.title && parsed.questions) {
      importedExam = parsed;
    }
  } catch (e) {
    importedExam = parseGoogleFormHTML(sourceText);
  }

  if (importedExam) {
    importedExam.id = "EXAM_" + Math.random().toString(36).substr(2, 6).toUpperCase();
    importedExam.teacher = systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية";
    if (!importedExam.subject) importedExam.subject = "لغة عربية (مستورد)";
    if (!importedExam.level) importedExam.level = "الفرقة الأولى";
    if (!importedExam.faculty) importedExam.faculty = "كلية اللغة العربية";
    if (!importedExam.university) importedExam.university = "جامعة ARABYA.NET";
    if (!importedExam.examType) importedExam.examType = "أعمال فصلية";
    if (!importedExam.totalScore) importedExam.totalScore = 100;

    systemState.exams.push(importedExam);
    saveSystemState(true);
    
    document.getElementById("teacher-import-exam-source").value = "";
    renderExamsList();
    alert(`تم استيراد امتحان "${importedExam.title}" بنجاح مع عدد ${importedExam.questions.length} أسئلة!`);
  } else {
    alert("فشل استيراد الامتحان! تأكد من أنك قمت بلصق كود JSON صحيح، أو كود مصدر HTML كامل لصفحة معاينة النموذج.");
  }
}

function parseGoogleFormHTML(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let title = "امتحان مستورد من جوجل";
    const titleEl = doc.querySelector("[role='heading']") || doc.querySelector("title");
    if (titleEl) title = titleEl.innerText.trim();

    const questions = [];
    let qId = 1;

    const scripts = doc.querySelectorAll("script");
    let loadDataFound = false;

    scripts.forEach(script => {
      const text = script.innerText;
      if (text.includes("FB_PUBLIC_LOAD_DATA_")) {
        const match = text.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);/);
        if (match && match[1]) {
          try {
            const rawData = eval(match[1]);
            const items = rawData[1][1];
            
            items.forEach(item => {
              const qText = item[1];
              const qTypeNum = item[3];
              
              if (qText && qTypeNum !== undefined) {
                let type = "essay";
                let options = [];
                let correctAnswer = 0;

                if ((qTypeNum === 2 || qTypeNum === 3 || qTypeNum === 4) && item[4] && item[4][0] && item[4][0][1]) {
                  const rawOpts = item[4][0][1];
                  options = rawOpts.map(o => o && o[0] ? o[0] : "").filter(o => o !== "");
                  type = options.length === 2 && (options.includes("صواب") || options.includes("صح") || options.includes("نعم")) ? "boolean" : "multiple";
                } else {
                  type = "essay";
                  options = [];
                }

                questions.push({
                  id: qId++,
                  type,
                  question: qText,
                  options,
                  correctAnswer: correctAnswer,
                  points: 10 // الوزن التلقائي المستورد
                });
              }
            });
            loadDataFound = true;
          } catch (e) {
            console.error("خطأ تفكيك FB_PUBLIC_LOAD_DATA_:", e);
          }
        }
      }
    });

    if (loadDataFound && questions.length > 0) {
      return { title, questions };
    }

    const listItems = doc.querySelectorAll("[role='listitem']");
    if (listItems.length > 0) {
      listItems.forEach(card => {
        const qTitleEl = card.querySelector("[role='heading']") || card.querySelector("div[class*='M26nFb']");
        if (!qTitleEl) return;
        const qText = qTitleEl.innerText.trim();

        const optionsEl = card.querySelectorAll("[role='radio']");
        let type = "essay";
        let options = [];

        if (optionsEl.length > 0) {
          optionsEl.forEach(opt => {
            options.push(opt.innerText.trim() || opt.nextSibling?.textContent?.trim() || "بديل");
          });
          type = options.length === 2 ? "boolean" : "multiple";
        }

        questions.push({
          id: qId++,
          type,
          question: qText,
          options,
          correctAnswer: 0,
          points: 10
        });
      });
    }

    if (questions.length > 0) {
      return { title, questions };
    }
  } catch (err) {
    console.error("خطأ تحليل HTML جوجل فورم:", err);
  }
  return null;
}

// ==========================================

function escapeCsvField(value) {
  return String(value == null ? "" : value).replace(/"/g, '""');
}

function buildCsvLine(fields) {
  return fields.map(field => `"${escapeCsvField(field)}"`).join(",") + "\n";
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getExportDateStamp() {
  return new Date().toLocaleDateString("ar-EG").replace(/\//g, "-");
}

function getResultsForExport() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return [];
  const sortOrder = getResultsTableViewSettings().sortOrder || "newest";
  return filterResultsForTeacherTable(sortResultsForDisplay(systemState.results, sortOrder));
}

function getStudentsForExport() {
  if (!Array.isArray(systemState.students) || !systemState.students.length) return [];
  const sortOrder = getStudentsTableViewSettings().sortOrder || "newest";
  return filterStudentsForTeacherTable(sortStudentsForDisplay(systemState.students, sortOrder));
}

function resultExistsInDatabase(res) {
  if (!res) return true;
  if (res.recordId) {
    return systemState.results.some(r => r.recordId === res.recordId);
  }
  return systemState.results.some(r =>
    r.id === res.id &&
    r.examId === res.examId &&
    String(r.timestamp || "") === String(res.timestamp || "")
  );
}

function normalizeImportedResult(res) {
  if (!res || typeof res !== "object") return null;
  if (!res.id && !res.name) return null;
  const normalized = { ...res };
  if (!normalized.recordId) normalized.recordId = createRecordId("result");
  if (!Number.isFinite(normalized.savedAt)) {
    const match = String(normalized.recordId).match(/(?:result|incomplete|record)_(\d{10,})_/i);
    if (match) normalized.savedAt = parseInt(match[1], 10);
  }
  return normalized;
}

function finalizeDatabaseImportMessage(counts) {
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
  hydratePresentedQuestionsForResults();
  saveSystemState(false);
}

// 6. استيراد وتصدير نتائج الطلاب (JSON/CSV)
// ==========================================

function exportResultsToJSON() {
  if (systemState.results.length === 0) {
    alert("لا توجد نتائج لتصديرها!");
    return;
  }
  const exportRows = getResultsForExport();
  if (!exportRows.length) {
    alert("لا توجد نتائج مطابقة للفلاتر الحالية للتصدير!");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: getPlatformAppVersion(),
    filtered: isResultsTableFiltersActive(),
    count: exportRows.length,
    results: exportRows
  };
  downloadBlobFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `نتائج_الطلاب_arabya_${getExportDateStamp()}.json`
  );
}

function importResultsFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.results) ? parsed.results : null);
      if (!rows) {
        alert("تنسيق الملف غير صحيح! يجب أن يكون مصفوفة نتائج أو كائن يحتوي results.");
        return;
      }
      let addedCount = 0;
      rows.forEach(raw => {
        const res = normalizeImportedResult(raw);
        if (!res || resultExistsInDatabase(res)) return;
        systemState.results.push(res);
        addedCount++;
      });
      finalizeDatabaseImportMessage();
      refreshTeacherDashboardViews({ all: true });
      alert(`تم استيراد ${addedCount} سجل نتائج جديد من ${rows.length} صف في الملف.`);
    } catch (err) {
      alert("خطأ في قراءة ملف النتائج!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}





function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// تسجيل حساب طالب جديد من قبل الطالب
function handleStudentRegister() {
  const fullname = document.getElementById("student-reg-fullname").value.trim();
  const id = normalizeStudentId(document.getElementById("student-reg-id").value.trim());
  const rawCode = document.getElementById("student-reg-code").value.trim();
  const code = sanitizeStudentCodeInput(rawCode);

  if (!fullname) {
    alert("يرجى إدخال الاسم للتسجيل!");
    return;
  }
  if (rawCode && !isValidStudentCodeFormat(rawCode)) {
    alert("كود الاشتراك غير صالح.");
    return;
  }
  if (id && !isValidStudentIdFormat(id)) {
    alert("معرف الهوية غير صالح.");
    return;
  }

  const identityCheck = validateStudentIdentityInput(id, rawCode, { name: fullname });
  if (!identityCheck.ok) {
    alert(identityCheck.message);
    return;
  }

  const newStudent = upsertStudentRecord({ name: fullname, id, code });
  saveSystemState(true);

  alert(`تم تسجيل حسابك بنجاح يا ${fullname}! يمكنك الآن تسجيل الدخول مباشرة للبدء.`);
  navigateToView("student-login-view");

  // تعبئة البيانات تلقائياً
  document.getElementById("student-fullname-input").value = newStudent.name;
  document.getElementById("student-id-input").value = newStudent.id || "";
  document.getElementById("student-access-code").value = newStudent.code || "";
}

// إعداد الإكمال والتعبئة التلقائية لبيانات الطالب
function setupStudentAutofill() {
  const codeInput = document.getElementById("student-access-code");
  const idInput = document.getElementById("student-id-input");
  const nameInput = document.getElementById("student-fullname-input");
  const emailInput = document.getElementById("student-email-input");
  const mobileInput = document.getElementById("student-mobile-input");

  if (!idInput || !codeInput || !nameInput) return;

  function autofillIfMatched() {
    const idVal = normalizeStudentId(idInput.value.trim());
    const codeVal = sanitizeStudentCodeInput(codeInput.value.trim());

    let matched = null;
    if (hasStudentCode(codeVal) && isPrivateStudentCode(codeVal)) {
      matched = findStudentByCode(codeVal);
    }
    if (!matched && idVal) {
      matched = findStudentById(idVal);
    }
    if (!matched) return;

    if (!idInput.value) idInput.value = matched.id || "";
    if (!codeInput.value) codeInput.value = matched.code || "";
    if (!nameInput.value) nameInput.value = matched.name || "";
    if (emailInput && !emailInput.value) emailInput.value = matched.email || "";
    if (mobileInput && !mobileInput.value) mobileInput.value = matched.mobile || "";
  }

  idInput.addEventListener("blur", autofillIfMatched);
  codeInput.addEventListener("blur", autofillIfMatched);
}

// عرض قائمة الطلاب وأكوادهم في لوحة المعلم

window.uncancelStudentExam = function(recordId) {
  allowStudentExamRetake(recordId);
};



function getStudentsSearchQuery() {
  const input = document.getElementById("teacher-students-search-input");
  return input ? input.value.trim() : "";
}

function studentMatchesSearchQuery(student, query) {
  const normalizedQuery = normalizeResultsSearchText(query);
  if (!normalizedQuery) return true;
  const ipToken = normalizeIpSearchToken(query);
  const fields = [
    student.name,
    student.id,
    student.code,
    student.email,
    student.mobile,
    student.timestamp,
    student.studentKey,
    student.lastKnownIp,
    student.clientIp
  ];
  if (fields.some(field => normalizeResultsSearchText(field).includes(normalizedQuery))) {
    return true;
  }
  if (ipToken && collectStudentIpAddresses(student).some(ip => ip.includes(ipToken))) return true;
  const queryId = normalizeStudentId(query);
  if (queryId && normalizeStudentId(student.id).includes(queryId)) return true;
  const queryCode = sanitizeStudentCodeInput(query);
  if (queryCode && sanitizeStudentCodeInput(student.code || "") === queryCode) return true;
  return false;
}

function filterStudentsForSearch(students, query) {
  const list = Array.isArray(students) ? students : [];
  const activeQuery = query != null ? String(query).trim() : getStudentsSearchQuery();
  if (!activeQuery) return list;
  return list.filter(student => studentMatchesSearchQuery(student, activeQuery));
}

function setupStudentsTableSearchControl() {
  const input = document.getElementById("teacher-students-search-input");
  const clearBtn = document.getElementById("teacher-students-search-clear");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      getStudentsTableViewSettings().page = 1;
      renderTeacherStudentsTable();
    }, 180);
  });
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      getStudentsTableViewSettings().page = 1;
      renderTeacherStudentsTable();
      input.focus();
    });
  }
}

function getStudentsTableViewSettings() {
  if (!systemState.studentsTableView) {
    let pageSize = 50;
    let quickFilter = "all";
    try {
      const saved = parseInt(localStorage.getItem("arabya_students_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    let sortOrder = "newest";
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_students_filters") || "{}");
      if (savedFilters.quickFilter) quickFilter = savedFilters.quickFilter;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_students_sort") || "newest");
    } catch (e) {}
    let columnSort = null;
    try {
      columnSort = JSON.parse(localStorage.getItem("arabya_students_column_sort") || "null");
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize, quickFilter, sortOrder, columnSort };
  }
  return systemState.studentsTableView;
}

function setStudentsTablePageSize(size) {
  const view = getStudentsTableViewSettings();
  view.pageSize = [25, 50, 100, 200, 500, 0].includes(size) ? size : 50;
  view.page = 1;
  try { localStorage.setItem("arabya_students_page_size", String(view.pageSize)); } catch (e) {}
}

function clampStudentsTablePage(totalItems, pageSize, page) {
  if (!pageSize || pageSize <= 0) return 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function updateStudentsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, filtersActive = false) {
  const infoEls = ["teacher-students-page-info", "teacher-students-page-info-bottom"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const pageNumEls = ["teacher-students-page-number", "teacher-students-page-number-bottom"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const prevBtns = document.querySelectorAll("[data-students-prev-page]");
  const nextBtns = document.querySelectorAll("[data-students-next-page]");
  const sizeSelects = document.querySelectorAll("[data-students-page-size]");
  const isFiltered = filtersActive || totalAll !== totalItems;

  sizeSelects.forEach(sizeSelect => {
    if (String(sizeSelect.value) !== String(pageSize)) {
      sizeSelect.value = String(pageSize);
    }
  });

  if (totalItems === 0) {
    infoEls.forEach(info => {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} طالب`
        : "";
    });
    pageNumEls.forEach(pageNum => { pageNum.textContent = ""; });
    prevBtns.forEach(prevBtn => { prevBtn.disabled = true; });
    nextBtns.forEach(nextBtn => { nextBtn.disabled = true; });
    return;
  }

  const countPrefix = isFiltered ? `وُجد ${totalItems} من ${totalAll} طالب — ` : "";

  if (!pageSize || pageSize <= 0) {
    infoEls.forEach(info => {
      info.textContent = isFiltered
        ? `${countPrefix}عرض الكل`
        : `إجمالي ${totalItems} طالب — عرض الكل`;
    });
    pageNumEls.forEach(pageNum => { pageNum.textContent = ""; });
    prevBtns.forEach(prevBtn => { prevBtn.disabled = true; });
    nextBtns.forEach(nextBtn => { nextBtn.disabled = true; });
    return;
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  infoEls.forEach(info => { info.textContent = `${countPrefix}عرض ${start}–${end} من ${totalItems} طالب`; });
  pageNumEls.forEach(pageNum => { pageNum.textContent = `${page} / ${totalPages}`; });
  prevBtns.forEach(prevBtn => { prevBtn.disabled = page <= 1; });
  nextBtns.forEach(nextBtn => { nextBtn.disabled = page >= totalPages; });
}

function setupStudentsTablePaginationControls() {
  document.querySelectorAll("[data-students-page-size]").forEach(sizeSelect => {
    if (sizeSelect.dataset.bound) return;
    sizeSelect.dataset.bound = "1";
    sizeSelect.value = String(getStudentsTableViewSettings().pageSize);
    sizeSelect.addEventListener("change", () => {
      setStudentsTablePageSize(parseInt(sizeSelect.value, 10));
      renderTeacherStudentsTable();
    });
  });
  document.querySelectorAll("[data-students-prev-page]").forEach(prevBtn => {
    if (prevBtn.dataset.bound) return;
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => {
      const view = getStudentsTableViewSettings();
      if (view.page > 1) {
        view.page -= 1;
        renderTeacherStudentsTable();
      }
    });
  });
  document.querySelectorAll("[data-students-next-page]").forEach(nextBtn => {
    if (nextBtn.dataset.bound) return;
    nextBtn.dataset.bound = "1";
    nextBtn.addEventListener("click", () => {
      const view = getStudentsTableViewSettings();
      view.page += 1;
      renderTeacherStudentsTable();
    });
  });
}

function parseIpLinesText(text) {
  return String(text || "")
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeExamIpLists(exam) {
  if (!exam) return;
  if (!exam.hallMode) exam.hallMode = { enabled: false };
  if (!Array.isArray(exam.hallMode.allowedIps)) {
    const legacy = exam.hallMode.allowedIp ? [exam.hallMode.allowedIp] : [];
    exam.hallMode.allowedIps = legacy;
  }
  if (!Array.isArray(exam.allowedRetakeIps)) exam.allowedRetakeIps = [];
}

function collectExamAllowedIps(exam) {
  if (!exam) return [];
  normalizeExamIpLists(exam);
  const set = new Set();
  (exam.hallMode.allowedIps || []).forEach(ip => { if (ip) set.add(String(ip).trim()); });
  (exam.allowedRetakeIps || []).forEach(ip => { if (ip) set.add(String(ip).trim()); });
  (systemState.results || []).forEach(res => {
    if (res.examId !== exam.id && res.examTitle !== exam.title) return;
    if (res.ipReleasedByTeacher && res.clientIp) set.add(String(res.clientIp).trim());
  });
  return [...set].filter(Boolean);
}

function renderExamAllowedIpsHtml(ips, emptyMessage) {
  if (!ips.length) {
    return `<span style="color:var(--text-muted);">${emptyMessage}</span>`;
  }
  return (
    `<ul style="margin:0; padding-right:1.2rem; font-size:0.88rem;">` +
    ips.map(ip => `<li style="margin-bottom:0.25rem;"><code dir="ltr">${escapeHtml(ip)}</code></li>`).join("") +
    `</ul>`
  );
}

function renderExamAllowedIpsList(exam) {
  const el = document.getElementById("exam-allowed-ips-list");
  if (!el || !exam) return;
  const ips = collectExamAllowedIps(exam);
  el.innerHTML = renderExamAllowedIpsHtml(
    ips,
    "لا توجد عناوين IP مسجّلة بعد. أضفها في الحقول أعلاه أو حرّر/احذف IP من نتيجة طالب لفتح إعادة الدخول."
  );
}

function renderDetailExamAllowedIpsList(examId) {
  const el = document.getElementById("detail-exam-allowed-ips-list");
  const wrap = document.getElementById("detail-exam-allowed-ips-wrap");
  if (!el) return;
  const exam = examId ? systemState.exams.find(e => e.id === examId) : null;
  if (wrap) wrap.classList.toggle("hidden", !exam);
  if (!exam) {
    el.innerHTML = '<span style="color:var(--text-muted);">—</span>';
    return;
  }
  const ips = collectExamAllowedIps(exam);
  el.innerHTML = renderExamAllowedIpsHtml(
    ips,
    "لا توجد عناوين IP بعد. احفظ أو عدّل IP أعلاه، أو أضف عناوين في إعدادات الامتحان (قاعة IP)."
  );
}

function addAllowedRetakeIpToExam(examId, ip) {
  const clean = String(ip || "").trim();
  if (!clean || !examId) return;
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;
  normalizeExamIpLists(exam);
  if (!exam.allowedRetakeIps.includes(clean)) {
    exam.allowedRetakeIps.push(clean);
    saveSystemState(true);
  }
}

window.pullTeacherStudentsFromCloud = async function() {
  const el = document.getElementById("teacher-students-sync-status");
  if (el) {
    el.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري جلب الطلاب والنتائج من Google Sheets...`;
  }
  const ok = await pullTeacherResultsFromCloud();
  if (el) {
    if (ok) {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تمت المزامنة: ${systemState.students.length} طالب و ${systemState.results.length} نتيجة`;
    } else if (!document.getElementById("teacher-results-sync-status")?.textContent?.includes("cloud_done")) {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> تعذّر الجلب. تأكد من رابط /exec ونشر Apps Script كإصدار جديد.`;
    } else {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> ${systemState.students.length} طالب`;
    }
  }
  refreshTeacherDashboardViews({ all: true });
  return ok;
};

function renderTeacherStudentsTable() {
  const tbody = document.getElementById("teacher-students-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  setupStudentsTablePaginationControls();
  setupStudentsTableSearchControl();
  setupStudentsTableFilterControls();
  setupStudentsTableSortControl();

  const filters = getStudentsTableFilters();
  const filtersActive = isStudentsTableFiltersActive(filters);
  const visibleStudents = filterOutDeletedStudents(systemState.students);
  const totalAll = visibleStudents.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">لا يوجد طلاب محلياً.${hasCloud ? " اضغط «مزامنة من السحابة» لجلب الطلاب من نتائج Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateStudentsPaginationUI(0, 1, getStudentsTableViewSettings().pageSize, 0, filtersActive);
    return;
  }

  const view = getStudentsTableViewSettings();
  renderSortableTableHeaders("#teacher-tab-students .table-container table", STUDENTS_TABLE_SORTABLE_COLUMNS, view.columnSort, toggleStudentsColumnSort);
  let sorted = sortStudentsForDisplay(visibleStudents, view.sortOrder);
  sorted = applyStudentsColumnSort(sorted, view.columnSort, visibleStudents);
  const filtered = filterStudentsForTeacherTable(sorted);
  const totalItems = filtered.length;
  view.page = clampStudentsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    const emptyMsg = filters.searchQuery
      ? `لا يوجد طلاب يطابقون «${escapeHtml(filters.searchQuery)}»`
      : "لا يوجد طلاب يطابقون الفلاتر المحددة";
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} طالب.</td></tr>`;
    updateStudentsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }

  let pageItems = filtered;
  if (view.pageSize > 0) {
    const start = (view.page - 1) * view.pageSize;
    pageItems = filtered.slice(start, start + view.pageSize);
  }

  pageItems.forEach(s => {
    const studentKey = s.studentKey || getStudentLookupKey(s);
    const canceledExamIds = getStudentCanceledExamIds(studentKey);
    const canceledBadge = canceledExamIds.length
      ? `<span style="color:var(--error); font-weight:700; font-size:0.75rem; display:block; margin-top:0.15rem;">تم إلغاء الامتحان</span>`
      : "";
    const row = document.createElement("tr");
    const studentIp = getStudentDisplayIp(s);
    row.innerHTML = `
      <td>${escapeHtml(s.name || "")}${canceledBadge}</td>
      <td><code>${escapeHtml(s.id || "--")}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${escapeHtml(s.code || "لا يوجد")}</span></td>
      <td><code style="font-size:0.78rem;">${escapeHtml(studentIp)}</code></td>
      <td>${escapeHtml(s.email || "--")}</td>
      <td>${escapeHtml(s.mobile || "--")}</td>
      <td>${escapeHtml(s.timestamp || "—")}</td>
      <td class="teacher-students-actions teacher-table-actions"></td>
    `;

    const actionsCell = row.querySelector(".teacher-students-actions");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-outline btn-sm";
    editBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary); padding:0.25rem 0.5rem;";
    editBtn.textContent = "تعديل";
    editBtn.addEventListener("click", () => editStudentByTeacher(studentKey));
    actionsCell.appendChild(editBtn);

    if (canDeleteStudents()) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-outline btn-sm";
      deleteBtn.style.cssText = "border-color:var(--error); color:var(--error); padding:0.25rem 0.5rem;";
      deleteBtn.textContent = "حذف";
      deleteBtn.addEventListener("click", () => deleteStudentByTeacher(studentKey));
      actionsCell.appendChild(deleteBtn);
    }

    tbody.appendChild(row);
  });

  updateStudentsPaginationUI(totalItems, view.page, view.pageSize, totalAll, filtersActive);
}

// إظهار بطاقة إضافة طالب جديد
window.showAddStudentModal = function() {
  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.remove("hidden");
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تسجيل حساب طالب جديد في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ الطالب والرمز";
  }
  systemState.editingStudentKey = null;
};

// إخفاء بطاقة إضافة طالب جديد
window.hideAddStudentModal = function() {
  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.add("hidden");
    document.getElementById("new-student-name").value = "";
    document.getElementById("new-student-id").value = "";
    document.getElementById("new-student-code").value = "";
    
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تسجيل حساب طالب جديد في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ الطالب والرمز";
  }
  systemState.editingStudentKey = null;
};

// حفظ طالب جديد أو تعديل بياناته من قبل المعلم
window.saveNewStudentByTeacher = async function() {
  const name = document.getElementById("new-student-name").value.trim();
  const id = normalizeStudentId(document.getElementById("new-student-id").value.trim());
  const rawCode = document.getElementById("new-student-code").value.trim();
  const code = sanitizeStudentCodeInput(rawCode);

  if (!name) {
    alert("يرجى إدخال اسم الطالب!");
    return;
  }
  if (rawCode && !isValidStudentCodeFormat(rawCode)) {
    alert("كود الاشتراك غير صالح (حروف أو أرقام أو كليهما).");
    return;
  }
  if (id && !isValidStudentIdFormat(id)) {
    alert("معرف الهوية غير صالح (حروف أو أرقام أو كليهما).");
    return;
  }

  const identityCheck = validateStudentIdentityInput(id, rawCode, {
    name,
    editingStudentKey: systemState.editingStudentKey || ""
  });
  if (!identityCheck.ok) {
    alert(identityCheck.message);
    return;
  }

  if (systemState.editingStudentKey) {
    const previousKey = systemState.editingStudentKey;
    const existing = findStudentByKey(previousKey);
    if (!existing) {
      alert("لم يتم العثور على الطالب للتعديل!");
      return;
    }
    existing.name = name;
    existing.id = id;
    existing.code = code;
    existing.studentKey = getStudentLookupKey(existing) || existing.studentKey;
    propagateStudentEditsToResults(existing, previousKey);
    saveSystemState(false);
    renderTeacherStudentsTable();
    renderStudentResultsTable();
    hideAddStudentModal();
    const synced = await syncStudentRecordToCloud(existing);
    systemState.results
      .filter(r => r.studentLookupKey === existing.studentKey)
      .forEach(res => sendUpdatedResultToCloud(res));
    alert(`تم تعديل بيانات الطالب "${name}" بنجاح!${synced ? " وتمت المزامنة مع Google Sheets." : " (محفوظ محلياً — تحقق من رابط المزامنة)"}`);
    return;
  }

  const created = upsertStudentRecord({ name, id, code });
  saveSystemState(false);
  renderTeacherStudentsTable();
  hideAddStudentModal();
  const synced = await syncStudentRecordToCloud(created);
  alert(`تم تسجيل الطالب "${name}" بنجاح!${synced ? " وتمت المزامنة مع Google Sheets." : " (محفوظ محلياً — تحقق من رابط المزامنة)"}`);
};

window.editStudentByTeacher = function(studentKey) {
  const student = findStudentByKey(studentKey);
  if (!student) {
    alert("لم يتم العثور على الطالب!");
    return;
  }

  systemState.editingStudentKey = student.studentKey;

  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.remove("hidden");
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تعديل بيانات حساب الطالب في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ التعديلات";
  }

  document.getElementById("new-student-name").value = student.name || "";
  document.getElementById("new-student-id").value = student.id || "";
  document.getElementById("new-student-code").value = student.code || "";
};

window.deleteStudentByTeacher = async function(studentKey) {
  if (!canDeleteStudents()) {
    alert("حذف حسابات الطلاب متاح لمدير المنصة (سوبر أدمن) فقط.");
    return;
  }
  const student = findStudentByKey(studentKey);
  if (!student) {
    alert("لم يتم العثور على الطالب!");
    return;
  }
  if (!confirm(`هل أنت متأكد من حذف الطالب "${student.name}"؟\n\nلن يُعاد من السحابة أو من نتائج الامتحانات بعد المزامنة.`)) return;
  addDeletedStudentKey(student);
  tombstoneResultsForDeletedStudent(student);
  purgeExamDeviceRegistryForStudent(student);
  const deleteCtx = buildStudentMatchContext(student);
  systemState.results = (systemState.results || []).filter(r => !resultMatchesStudentIdentity(r, deleteCtx));
  systemState.students = systemState.students.filter(s => {
    const key = s.studentKey || getStudentLookupKey(s);
    return key !== studentKey && !isStudentRecordDeleted(s);
  });
  applyDeletionTombstonesToLocalState();
  persistDeletedStudentKeys();
  persistDeletedResultKeys();
  suspendCloudPullForMs(90000);
  saveSystemState(false);
  renderTeacherStudentsTable();
  renderStudentResultsTable();
  let synced = false;
  try {
    synced = await pushCloudBackupNow("delete_student");
  } catch (e) {}
  if (!synced) {
    try { synced = await syncLocalDatabaseToCloud(); } catch (e2) {}
  }
  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("delete_student");
  }
  if (window.ArabyaToast) {
    window.ArabyaToast.showToast(
      synced ? `تم حذف «${student.name}» ومزامنة الحذف مع السحابة` : `تم حذف «${student.name}» محلياً — تحقق من الربط`,
      synced ? "success" : "warning"
    );
  } else {
    alert(synced ? `تم حذف الطالب "${student.name}" ومزامنة التغيير مع Google Sheets.` : `تم حذف الطالب "${student.name}" محلياً.`);
  }
};

// تصدير الطلاب كملف JSON (الصفوف المفلترة)
window.exportStudentsToJSON = function() {
  if (systemState.students.length === 0) {
    alert("لا يوجد طلاب لتصديرهم!");
    return;
  }
  const exportRows = getStudentsForExport();
  if (!exportRows.length) {
    alert("لا يوجد طلاب يطابقون الفلاتر الحالية للتصدير!");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: getPlatformAppVersion(),
    filtered: isStudentsTableFiltersActive(),
    count: exportRows.length,
    students: exportRows
  };
  downloadBlobFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `طلاب_arabya_${getExportDateStamp()}.json`
  );
};

window.exportStudentsToCSV = function() {
  if (systemState.students.length === 0) {
    alert("لا يوجد طلاب لتصديرهم!");
    return;
  }
  const exportRows = getStudentsForExport();
  if (!exportRows.length) {
    alert("لا يوجد طلاب يطابقون الفلاتر الحالية للتصدير!");
    return;
  }

  let csvContent = "\ufeffsep=,\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,البريد,الموبايل,تاريخ التسجيل,عدد النتائج\n";

  exportRows.forEach(stu => {
    csvContent += buildCsvLine([
      stu.name || "",
      stu.id || "",
      stu.code || "",
      stu.email || "",
      stu.mobile || "",
      stu.timestamp || "",
      countStudentResults(stu)
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `طلاب_arabya_${getExportDateStamp()}.csv`
  );
};

// استيراد الطلاب من ملف JSON
window.importStudentsFromJSON = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.students) ? parsed.students : null);
      if (!rows) {
        alert("تنسيق ملف الطلاب غير صحيح! يجب أن يكون مصفوفة طلاب أو كائن يحتوي students.");
        return;
      }
      let addedCount = 0;
      let updatedCount = 0;
      rows.forEach(stu => {
        if (!stu || !stu.id || !stu.name) return;
        const existing = findStudentById(stu.id) || (stu.studentKey ? findStudentByKey(stu.studentKey) : null);
        upsertStudentRecord({
          name: stu.name,
          id: stu.id,
          code: stu.code || stu.accessCode || "",
          email: stu.email || "",
          mobile: stu.mobile || ""
        }, stu.studentKey || "");
        if (existing) updatedCount++;
        else addedCount++;
      });
      finalizeDatabaseImportMessage();
      refreshTeacherDashboardViews({ all: true });
      alert(`تم استيراد ${addedCount} طالب جديد وتحديث ${updatedCount} سجل من ${rows.length} صف.`);
    } catch (err) {
      alert("خطأ في قراءة ملف الطلاب المرفوع!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

// ==========================================
// 10. وظيفة نسخ رابط الامتحان بنجاح وتوافقية
// ==========================================
function buildExamShareLink(rawUrl) {
  try {
    const url = new URL(rawUrl, getAppBaseUrl());
    let examId = url.searchParams.get("exam") || "";

    if (!examId) {
      const segs = url.pathname.split('/').filter(Boolean);
      const last = segs.length ? segs[segs.length - 1] : "";
      const ex = (systemState.exams || []).find(e => String(e.id).toLowerCase() === String(last).toLowerCase());
      if (ex) examId = ex.id;
    }

    let exam = null;
    if (examId) {
      exam = (systemState.exams || []).find(e => String(e.id).toLowerCase() === String(examId).toLowerCase()) || null;
      url.searchParams.set("exam", examId);
    }

    if (!url.searchParams.get("teacher") && systemState.activeTeacher && systemState.activeTeacher.username) {
      url.searchParams.set("teacher", systemState.activeTeacher.username);
    }

    let syncUrl = getEffectiveExamSyncUrl(exam || {});

    if (!syncUrl) {
      const teacherUser = url.searchParams.get("teacher") || "";
      if (teacherUser && Array.isArray(systemState.teachers)) {
        const t = systemState.teachers.find(x => x.username === teacherUser || x.name === teacherUser);
        if (t && t.integrationConfig && t.integrationConfig.googleFormUrl) {
          const u = String(t.integrationConfig.googleFormUrl).trim();
          if (u.includes("/macros/s/") || u.endsWith("/exec")) syncUrl = u;
        }
      }
    }

    if (!syncUrl) {
      try {
        const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
        const u = cfg.googleFormUrl ? String(cfg.googleFormUrl).trim() : "";
        if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) syncUrl = u;
      } catch (e) {}
    }

    if (syncUrl) {
      url.searchParams.set("s", syncUrl);
    }

    return url.toString();
  } catch (e) {
    return rawUrl;
  }
}

window.copyExamLink = function(url) {
  if (!url) {
    alert("رابط الامتحان غير صالح!");
    return;
  }
  const normalizedUrl = buildExamShareLink(url);
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(normalizedUrl)
      .then(() => {
        alert("تم نسخ رابط الامتحان بنجاح!");
      })
      .catch(err => {
        fallbackCopyTextToClipboard(normalizedUrl);
      });
  } else {
    fallbackCopyTextToClipboard(normalizedUrl);
  }
};


function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      alert("تم نسخ رابط الامتحان بنجاح!");
    } else {
      alert("فشل نسخ الرابط تلقائياً، يرجى نسخه يدوياً.");
    }
  } catch (err) {
    alert("حدث خطأ أثناء نسخ الرابط، يرجى نسخه يدوياً.");
  }

  document.body.removeChild(textArea);
}

function applyCompleteDatabaseReplace(data) {
  if (data.teachers && Array.isArray(data.teachers)) {
    systemState.teachers = data.teachers;
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
  }
  if (data.students && Array.isArray(data.students)) {
    systemState.students = data.students;
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  }
  if (data.exams && Array.isArray(data.exams)) {
    systemState.exams = data.exams;
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  }
  if (data.results && Array.isArray(data.results)) {
    systemState.results = data.results;
    localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
  }
  if (data.config && typeof data.config === "object") {
    systemState.config = { ...systemState.config, ...data.config };
    localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  }
  if (data.examDeviceRegistry) {
    saveExamDeviceRegistry(data.examDeviceRegistry);
  }
  if (data.questionBanks && window.ArabyaCloudSync) {
    window.ArabyaCloudSync.applyQuestionBanksFromCloud(data.questionBanks);
  }
}

function mergeCompleteDatabaseImport(data) {
  const summary = { teachers: 0, students: 0, exams: 0, results: 0 };
  if (Array.isArray(data.teachers)) {
    const map = new Map((systemState.teachers || []).map(t => [String(t.username || "").toLowerCase(), t]));
    data.teachers.forEach(t => {
      const key = String(t.username || "").toLowerCase();
      if (!key || map.has(key)) return;
      map.set(key, t);
      summary.teachers++;
    });
    systemState.teachers = [...map.values()];
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
  }
  if (Array.isArray(data.students)) {
    ensureStudentsDataShape();
    const map = new Map((systemState.students || []).map(s => [getStudentLookupKey(s), s]));
    data.students.forEach(raw => {
      const s = { ...raw };
      if (!s.studentKey) s.studentKey = getStudentLookupKey(s);
      const key = getStudentLookupKey(s);
      if (!key || map.has(key)) return;
      map.set(key, s);
      summary.students++;
    });
    systemState.students = [...map.values()];
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  }
  if (Array.isArray(data.exams)) {
    const map = new Map((systemState.exams || []).map(e => [String(e.id), e]));
    data.exams.forEach(e => {
      const key = String(e.id || "");
      if (!key || map.has(key)) return;
      map.set(key, e);
      summary.exams++;
    });
    systemState.exams = [...map.values()];
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  }
  if (Array.isArray(data.results)) {
    ensureResultRecordIds();
    const keys = new Set((systemState.results || []).map(r => r.recordId || `${r.id}|${r.examId}|${r.timestamp}`));
    data.results.forEach(raw => {
      const res = normalizeImportedResult(raw);
      if (!res) return;
      const key = res.recordId || `${res.id}|${res.examId}|${res.timestamp}`;
      if (keys.has(key)) return;
      keys.add(key);
      systemState.results.push(res);
      summary.results++;
    });
    localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
  }
  if (data.config && typeof data.config === "object") {
    systemState.config = { ...(systemState.config || {}), ...data.config };
    localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  }
  if (data.examDeviceRegistry) {
    saveExamDeviceRegistry(mergeRemoteExamDeviceRegistry_(loadExamDeviceRegistry(), data.examDeviceRegistry));
  }
  if (data.questionBanks && window.ArabyaCloudSync) {
    window.ArabyaCloudSync.applyQuestionBanksFromCloud(data.questionBanks);
  }
  return summary;
}

// تصدير قاعدة البيانات كاملة كملف JSON
window.exportCompleteDatabase = function() {
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
  const dbBackup = typeof buildFullCloudBackupData === "function"
    ? { exportedAt: new Date().toISOString(), appVersion: getPlatformAppVersion(), ...buildFullCloudBackupData() }
    : {
      exportedAt: new Date().toISOString(),
      appVersion: getPlatformAppVersion(),
      teachers: systemState.teachers,
      students: systemState.students,
      exams: systemState.exams,
      results: systemState.results,
      config: systemState.config || {},
      examDeviceRegistry: loadExamDeviceRegistry()
    };

  downloadBlobFile(
    new Blob([JSON.stringify(dbBackup, null, 2)], { type: "application/json" }),
    `نسخة_احتياطية_كاملة_arabya_${getExportDateStamp()}.json`
  );
  alert(`تم تصدير نسخة احتياطية كاملة: ${systemState.students.length} طالب · ${systemState.results.length} نتيجة · ${systemState.exams.length} امتحان · ${systemState.teachers.length} معلم.`);
};

// استعادة قاعدة البيانات بالكامل من ملف JSON
window.importCompleteDatabase = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const mode = (document.getElementById("db-restore-mode") || {}).value || "replace";

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data && (data.teachers || data.students || data.exams || data.results)) {
        if (mode === "merge") {
          if (!confirm("الدمج الآمن: ستُضاف السجلات الجديدة فقط دون حذف البيانات الحالية. هل تريد المتابعة؟")) {
            event.target.value = "";
            return;
          }
          const summary = mergeCompleteDatabaseImport(data);
          finalizeDatabaseImportMessage();
          alert(`تم الدمج: +${summary.teachers} معلم · +${summary.students} طالب · +${summary.exams} امتحان · +${summary.results} نتيجة. سيتم إعادة تحميل الصفحة.`);
          location.reload();
        } else if (confirm("تحذير: سيقوم هذا باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستوردة. هل ترغب في الاستمرار؟")) {
          applyCompleteDatabaseReplace(data);
          finalizeDatabaseImportMessage();
          alert(`تم استعادة قاعدة البيانات: ${systemState.students.length} طالب · ${systemState.results.length} نتيجة · ${systemState.exams.length} امتحان. سيتم إعادة تحميل الصفحة.`);
          location.reload();
        }
      } else {
        alert("تنسيق الملف الاحتياطي غير صحيح!");
      }
    } catch (err) {
      alert("خطأ في قراءة ملف النسخة الاحتياطية!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

// تسجيل خروج المعلم نهائياً وتنظيف الجلسة
window.logoutTeacher = function() {
  if (window.ArabyaCloudSync) window.ArabyaCloudSync.stopPullLoop();
  localStorage.removeItem("arabya_active_teacher_username");
  localStorage.removeItem("arabya_active_view");
  systemState.activeTeacher = null;
  location.reload();
};

// حفظ الجلسة الجارية للطالب لمنع فقدان البيانات عند التحديث
function saveActiveStudentSession() {
  if (!systemState.isExamActive || !systemState.currentStudent || !systemState.currentExam) return;
  const session = {
    student: systemState.currentStudent,
    examId: systemState.currentExam.id,
    shuffledQuestions: systemState.shuffledQuestions,
    currentExamRuntime: systemState.currentExamRuntime,
    currentQuestionIndex: systemState.currentQuestionIndex,
    studentAnswers: systemState.studentAnswers,
    cheatViolations: systemState.cheatViolations,
    cheatAttemptLog: systemState.cheatAttemptLog || [],
    examMaxCheatAttemptsAllowed: systemState.examMaxCheatAttemptsAllowed,
    currentExamRuntime: systemState.currentExamRuntime,
    timeRemaining: systemState.timer.timeRemaining,
    examDeviceProfile: systemState.examDeviceProfile || null
  };
  localStorage.setItem("arabya_active_student_session", JSON.stringify(session));
}

// تحديث نتيجة غير مكتملة سحابياً ومحلياً أثناء تقدم الطالب
function updateLiveIncompleteResult() {
  if (!systemState.currentExam || !systemState.currentStudent) return;
  const id = systemState.currentStudent.id || "";
  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  const examId = systemState.currentExam.id;
  let res = systemState.results.find(r => r.studentLookupKey === studentLookupKey && r.examId === examId && r.status === "incomplete");

  if (!res) {
    res = {
      recordId: createRecordId("incomplete"),
      savedAt: Date.now(),
      name: systemState.currentStudent.name,
      id,
      accessCode: systemState.currentStudent.accessCode || "",
      studentLookupKey,
      email: systemState.currentStudent.email || "",
      mobile: systemState.currentStudent.mobile || "",
      examTitle: systemState.currentExam.title,
      examId,
      university: systemState.currentExam.university,
      faculty: systemState.currentExam.faculty,
      level: systemState.currentExam.level,
      examType: systemState.currentExam.examType,
      score: "جاري أداء الامتحان (غير مكتمل)",
      details: "بدأ الطالب الامتحان ولم يسلم بعد.",
      timestamp: new Date().toLocaleString("ar-EG"),
      studentAnswers: {},
      questionScores: {},
      maxScore: getCurrentExamTotalScore(),
      presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions)),
      status: "incomplete"
    };
    systemState.results.push(res);
  }

  let correctObjectiveCount = 0;
  let objectiveQuestionsCount = 0;
  let detailsLog = [];
  const questionScoresMap = {};

  systemState.shuffledQuestions.forEach(q => {
    const studentAns = systemState.studentAnswers[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;

    if (q.type === "essay") {
      const ansText = studentAns || "(لم يكتب إجابة بعد)";
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} 
 إجابة الطالب: ${ansText}
-----------------`);
      questionScoresMap[q.id] = 0;
    } else {
      objectiveQuestionsCount++;
      const isCorrect = studentAns === q.correctAnswer;
      if (studentAns !== undefined && studentAns !== -1 && studentAns !== -2 && isCorrect) {
        correctObjectiveCount++;
        questionScoresMap[q.id] = qPoints;
      } else {
        questionScoresMap[q.id] = 0;
      }

      let studentAnsText = "لم تتم الإجابة بعد";
      if (studentAns === -1) studentAnsText = "انتهى الوقت";
      else if (studentAns === -2) studentAnsText = "ملغي (غش)";
      else if (studentAns !== undefined) studentAnsText = q.options[studentAns];
      detailsLog.push(`س (وزنها ${qPoints} نقاط): ${q.question} | إجابة الطالب: ${studentAnsText}`);
    }
  });

  const currentProgress = systemState.currentQuestionIndex + 1;
  res.score = `جاري الأداء (${correctObjectiveCount}/${objectiveQuestionsCount} موضوعي، تقدم: ${currentProgress}/${systemState.shuffledQuestions.length})`;
  res.details = detailsLog.join("\n");
  res.studentAnswers = { ...systemState.studentAnswers };
  res.questionScores = questionScoresMap;
  Object.assign(res, buildCheatTrackingFields());
  attachDeviceFieldsToResult(res);
  res.email = systemState.currentStudent.email || res.email || "";
  res.mobile = systemState.currentStudent.mobile || res.mobile || "";
  res.maxScore = getCurrentExamTotalScore();
  res.presentedQuestions = JSON.parse(JSON.stringify(systemState.shuffledQuestions));
  res.timestamp = new Date().toLocaleString("ar-EG");

  if (systemState.examDeviceProfile && studentLookupKey && examId) {
    registerExamDeviceBinding(
      systemState.examDeviceProfile,
      studentLookupKey,
      systemState.currentStudent.name,
      examId
    );
  }

  saveSystemState(false);
}
