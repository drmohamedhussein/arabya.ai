/**
 * arabya.ai - ملف المنطق البرمجي الموحد المطور (app.js)
 * يتحكم في التوجيه، وإدارة الامتحانات، وتصميم الأسئلة اللانهائية والمقالية والموضوعية ذات الأوزان المخصصة،
 * والتكامل السحابي الثنائي، مع تطبيق معايير إتاحة الوصول (WAI-ARIA) الكاملة للطلاب المكفوفين.
 */

// كائن الحالة العامة للنظام
const ARABYA_APP_BUILD_VERSION = "2026.06.02.26";
const ARABYA_CLOUD_BACKUP_SCOPE_GENERAL = "general";
const ARABYA_CLOUD_BACKUP_SCOPE_ALL = "all";
const ARABYA_UNIFIED_CLOUD_SYNC_FLAG = "arabya_unified_cloud_sync_v1";
window.ARABYA_APP_BUILD_VERSION = ARABYA_APP_BUILD_VERSION;
window.ARABYA_APP_VERSION = ARABYA_APP_BUILD_VERSION;

function compareAppVersionStrings(a, b) {
  const partsA = String(a || "").trim().split(".").map(part => parseInt(part, 10) || 0);
  const partsB = String(b || "").trim().split(".").map(part => parseInt(part, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestAppVersion(...candidates) {
  const list = candidates.map(v => String(v || "").trim()).filter(Boolean);
  if (!list.length) return "";
  return list.reduce((best, current) => (compareAppVersionStrings(current, best) > 0 ? current : best), list[0]);
}

function readAppVersionFromLocalStorageConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    return cfg.appVersion ? String(cfg.appVersion).trim() : "";
  } catch (e) {
    return "";
  }
}

function getPlatformAppVersion() {
  return pickLatestAppVersion(
    systemState.config?.appVersion,
    readAppVersionFromLocalStorageConfig(),
    window.ARABYA_APP_BUILD_VERSION,
    ARABYA_APP_BUILD_VERSION
  ) || ARABYA_APP_BUILD_VERSION;
}

function applyPlatformAppVersion(version, options = {}) {
  const next = String(version || "").trim();
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
  const initial = pickLatestAppVersion(
    readAppVersionFromLocalStorageConfig(),
    systemState.config?.appVersion,
    ARABYA_APP_BUILD_VERSION
  );
  applyPlatformAppVersion(initial, { persistState: false });
}

function syncPlatformAppVersionFromDatabase(data) {
  if (!data || typeof data !== "object") return;
  const remote = String(data.appVersion || data.config?.appVersion || "").trim();
  if (!remote) return;
  const next = pickLatestAppVersion(remote, getPlatformAppVersion(), ARABYA_APP_BUILD_VERSION);
  applyPlatformAppVersion(next, { persistState: false });
}

function ensurePlatformAppVersionBeforeCloudPush() {
  const next = pickLatestAppVersion(ARABYA_APP_BUILD_VERSION, getPlatformAppVersion());
  applyPlatformAppVersion(next, { persistState: false });
  return next;
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
  const label = `إصدار التطبيق: ${getPlatformAppVersion()}`;
  if (versionEl) versionEl.textContent = label;
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
  window.applyPlatformAppVersion = applyPlatformAppVersion;
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
              startRunnerTimerWithTime(session.timeRemaining || getQuestionTimeSeconds(resumeQuestion, matchedExam));
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
        teacherCode: matched.password,
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
    if (typeof scheduleCloudBackupPush === "function") {
      scheduleCloudBackupPush("saveSystemState", { immediate: true });
    } else {
      autoSyncToCloud();
    }
  }
}

function createRecordId(prefix = "record") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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


function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim();
}

function normalizeStudentIdForCompare(studentId) {
  return normalizeStudentId(studentId).toUpperCase();
}

function normalizeStudentName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeContactField(value) {
  return (value || "").toString().trim();
}

function normalizeStudentCodeForCompare(code) {
  return sanitizeStudentCodeInput(code).toUpperCase();
}

function sanitizeStudentCodeInput(code) {
  const raw = (code || "").toString().trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  if (digitsOnly && /^0+$/.test(digitsOnly) && digitsOnly.length >= 5) {
    return "00000";
  }
  return compact;
}

function isValidStudentIdFormat(studentId) {
  const id = normalizeStudentId(studentId);
  if (!id) return true;
  return /^[A-Za-z0-9]+$/i.test(id) && id.length <= 64;
}

function isValidStudentCodeFormat(code) {
  const clean = sanitizeStudentCodeInput(code);
  if (!clean) return true;
  return /^[A-Za-z0-9]+$/i.test(clean) && clean.length <= 32;
}

function isFiveDigitStudentCode(code) {
  return hasStudentCode(code);
}

function hasStudentCode(code) {
  return !!sanitizeStudentCodeInput(code);
}

function isSharedStudentCode(code) {
  return normalizeStudentCodeForCompare(code) === "00000";
}

function isPrivateStudentCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  return !!clean && !isSharedStudentCode(clean);
}

function studentCodesMatch(codeA, codeB) {
  const a = normalizeStudentCodeForCompare(codeA);
  const b = normalizeStudentCodeForCompare(codeB);
  return !!(a && b && a === b);
}

function getStudentLookupKey(student) {
  const code = sanitizeStudentCodeInput(student?.code || student?.accessCode || "");
  if (isPrivateStudentCode(code)) {
    return `code:${normalizeStudentCodeForCompare(code)}`;
  }
  const normalizedId = normalizeStudentIdForCompare(student?.id);
  if (normalizedId) {
    return `id:${normalizedId}`;
  }
  const normalizedName = normalizeStudentName(student?.name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function findStudentByCode(code, options = {}) {
  const clean = sanitizeStudentCodeInput(code);
  if (!clean) return null;
  const compare = normalizeStudentCodeForCompare(clean);
  if (isSharedStudentCode(clean)) {
    const normalizedId = normalizeStudentIdForCompare(options.studentId);
    const normalizedName = normalizeStudentName(options.name);
    if (normalizedId) {
      const byId = systemState.students.find(
        s =>
          studentCodesMatch(s.code, clean) &&
          normalizeStudentIdForCompare(s.id) === normalizedId
      );
      if (byId) return byId;
    }
    if (normalizedName) {
      return systemState.students.find(
        s => studentCodesMatch(s.code, clean) && normalizeStudentName(s.name) === normalizedName
      ) || null;
    }
    return null;
  }
  return systemState.students.find(s => studentCodesMatch(s.code, clean)) || null;
}

function findStudentById(studentId) {
  const normalized = normalizeStudentIdForCompare(studentId);
  if (!normalized) return null;
  return systemState.students.find(s => normalizeStudentIdForCompare(s.id) === normalized) || null;
}

function findStudentsByName(name) {
  const normalized = normalizeStudentName(name);
  if (!normalized) return [];
  return (systemState.students || []).filter(s => normalizeStudentName(s.name) === normalized);
}

function findStudentByName(name) {
  const normalized = normalizeStudentName(name);
  if (!normalized) return null;
  return systemState.students.find(student => normalizeStudentName(student.name) === normalized) || null;
}

function findStudentByKey(studentKey) {
  if (!studentKey) return null;
  return systemState.students.find(student => student.studentKey === studentKey) || null;
}

function ensureStudentsDataShape(options = {}) {
  const preserveEmptyTimestamp = !!options.preserveEmptyTimestamp;
  if (!Array.isArray(systemState.students)) {
    systemState.students = [];
    return;
  }
  systemState.students = systemState.students.map((student, index) => {
    const normalizedId = normalizeStudentId(student.id || "");
    const sanitizedCode = sanitizeStudentCodeInput(student.code || "");
    const normalizedCode = hasStudentCode(sanitizedCode) ? sanitizedCode : "";
    const normalizedName = (student.name || "").toString().trim() || `طالب ${index + 1}`;
    let timestamp = String(student.timestamp || "").trim();
    if (!timestamp && !preserveEmptyTimestamp) {
      timestamp = new Date().toLocaleDateString("ar-EG");
    }
    const normalizedStudent = {
      ...student,
      name: normalizedName,
      id: normalizedId,
      code: normalizedCode,
      email: normalizeContactField(student.email),
      mobile: normalizeContactField(student.mobile),
      timestamp
    };
    normalizedStudent.studentKey = normalizedStudent.studentKey || getStudentLookupKey(normalizedStudent) || createRecordId("student");
    if (!Number.isFinite(normalizedStudent.savedAt)) {
      const match = String(normalizedStudent.studentKey || "").match(/(?:student|record)_(\d{10,})_/i);
      if (match) normalizedStudent.savedAt = parseInt(match[1], 10);
    }
    return normalizedStudent;
  });
}

function sanitizeQuestionConfig(exam) {
  if (!exam || typeof exam !== "object") return;
  if (!Array.isArray(exam.questions)) {
    exam.questions = [];
  }
  if (typeof exam.shuffleQuestions !== "boolean") {
    exam.shuffleQuestions = true;
  }
  const parsedMaxCheat = parseInt(exam.maxCheatAttempts, 10);
  if (!Number.isFinite(parsedMaxCheat) || parsedMaxCheat < 0) {
    exam.maxCheatAttempts = 5;
  } else {
    exam.maxCheatAttempts = parsedMaxCheat;
  }
  const parsedCount = parseInt(exam.questionCount, 10);
  if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
    exam.questionCount = "";
  } else {
    exam.questionCount = parsedCount;
  }
  if (exam.endsAt) {
    const parsedEnd = new Date(exam.endsAt);
    if (Number.isNaN(parsedEnd.getTime())) {
      exam.endsAt = "";
    } else {
      exam.endsAt = parsedEnd.toISOString();
    }
  }
  exam.questions.forEach((question) => {
    const parsedTime = parseInt(question.timeSeconds, 10);
    if (!Number.isFinite(parsedTime) || parsedTime <= 0) {
      question.timeSeconds = 60;
    } else {
      question.timeSeconds = Math.max(5, parsedTime);
    }
  });
}


function getExamMaxCheatAttempts(exam) {
  if (!exam) return 5;
  const parsed = parseInt(exam.maxCheatAttempts, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 5;
  return parsed;
}

function shouldCancelExamForCheating(exam, violations) {
  const maxAttempts = getExamMaxCheatAttempts(exam);
  if (maxAttempts === 0) return false;
  return violations >= maxAttempts;
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

function clearExamDeviceRegistryForStudentExam(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return;
  const registry = pruneExamDeviceRegistry(loadExamDeviceRegistry());
  registry.bindings = (registry.bindings || []).filter(entry =>
    !(entry.examId === examId && entry.studentLookupKey === studentLookupKey)
  );
  saveExamDeviceRegistry(registry);
}

function isRegistryBindingForDeletedStudent(entry) {
  if (!entry) return false;
  loadDeletedStudentKeysFromStorage();
  const key = String(entry.studentLookupKey || "").trim();
  if (key && isStudentKeyDeleted(key)) return true;
  return isStudentRecordDeleted({
    studentKey: key,
    name: entry.studentName || "",
    id: "",
    code: ""
  });
}

function releaseDeviceBindingsForDeletedStudents(registry) {
  if (!registry || !Array.isArray(registry.bindings)) return registry;
  registry.bindings = registry.bindings.filter(entry => !isRegistryBindingForDeletedStudent(entry));
  return registry;
}

function purgeExamDeviceRegistryForStudent(studentOrKey) {
  const keys = new Set();
  if (typeof studentOrKey === "string") {
    if (studentOrKey) keys.add(studentOrKey);
  } else if (studentOrKey) {
    getStudentLookupKeysForMatch(studentOrKey).forEach(k => keys.add(k));
    if (studentOrKey.studentKey) keys.add(String(studentOrKey.studentKey));
  }
  if (!keys.size) return;
  const registry = releaseDeviceBindingsForDeletedStudents(pruneExamDeviceRegistry(loadExamDeviceRegistry()));
  registry.bindings = (registry.bindings || []).filter(entry => !keys.has(entry.studentLookupKey));
  saveExamDeviceRegistry(registry);
}

function clearExamDeviceRegistryForStudentAllExams(studentLookupKey) {
  purgeExamDeviceRegistryForStudent(studentLookupKey);
}

function purgeStaleDeviceBindingsForProfile(profile) {
  if (!profile?.deviceFingerprint) return;
  const registry = releaseDeviceBindingsForDeletedStudents(pruneExamDeviceRegistry(loadExamDeviceRegistry()));
  const before = (registry.bindings || []).length;
  registry.bindings = (registry.bindings || []).filter(entry => {
    if (!deviceBindingMatchesEntry(profile, entry)) return true;
    return !isRegistryBindingForDeletedStudent(entry);
  });
  if (registry.bindings.length !== before) saveExamDeviceRegistry(registry);
}

function buildResultDeviceFieldsFromResult(res) {
  if (!res) return {};
  return {
    deviceId: res.deviceId || "",
    deviceFingerprint: res.deviceFingerprint || "",
    clientIp: res.clientIp || "",
    deviceMeta: res.deviceMeta || {}
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
  const bankSize = Array.isArray(exam.questions) ? exam.questions.length : 0;
  if (!bankSize) return null;
  return Math.min(parsed, bankSize);
}

function parseDisplayedQuestionCountInput(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { ok: true, value: "" };
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, message: "عدد الأسئلة المعروضة يجب أن يكون رقماً صحيحاً أكبر من صفر، أو اترك الحقل فارغاً لعرض كل البنك." };
  }
  return { ok: true, value: String(parsed) };
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

/** الأسئلة التي ظهرت للطالب فعلاً (وليس بنك الأسئلة كاملاً) */
function getPresentedQuestionsForResult(res, exam) {
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


function buildStudentMatchContext(student) {
  if (!student) return null;
  return {
    studentKey: student.studentKey || "",
    id: student.id || "",
    name: student.name || "",
    accessCode: student.accessCode || student.code || "",
    code: student.code || student.accessCode || ""
  };
}

function getStudentLookupKeysForMatch(student) {
  const keys = new Set();
  if (!student) return [];
  const primary = student.studentKey || getStudentLookupKey(student);
  if (primary) keys.add(primary);
  const code = sanitizeStudentCodeInput(student.code || student.accessCode || "");
  if (isPrivateStudentCode(code)) keys.add(`code:${code}`);
  const id = normalizeStudentId(student.id || "");
  if (id) keys.add(`id:${id}`);
  const normalizedName = normalizeStudentName(student.name || "");
  if (normalizedName) keys.add(`name:${normalizedName}`);
  return [...keys];
}

function normalizeDeviceIp(value) {
  return String(value || "").trim().toLowerCase();
}

function deviceHardwareMatchesResult(profile, result) {
  if (!profile || !result) return false;
  if (profile.deviceFingerprint && result.deviceFingerprint && profile.deviceFingerprint === result.deviceFingerprint) {
    return true;
  }
  return !!(profile.deviceId && result.deviceId && profile.deviceId === result.deviceId);
}

function deviceProfileMatchesResult(profile, result) {
  if (deviceHardwareMatchesResult(profile, result)) return true;
  const profileIp = normalizeDeviceIp(profile.clientIp);
  const resultIp = normalizeDeviceIp(result.clientIp);
  return !!(profileIp && resultIp && profileIp === resultIp);
}

function getExamMaxStudentsPerSharedIp(exam) {
  const fromExam = parseInt(exam?.ipAccessPolicy?.maxStudentsPerSharedIp, 10);
  if (Number.isFinite(fromExam) && fromExam >= 1) return fromExam;
  const fromCfg = parseInt(systemState.config?.maxStudentsPerSharedIp, 10);
  if (Number.isFinite(fromCfg) && fromCfg >= 1) return fromCfg;
  return 15;
}

function isIpOnExamAllowlist(exam, clientIp) {
  if (!exam || !clientIp) return false;
  normalizeExamIpLists(exam);
  const allowed = [
    ...(exam.hallMode?.allowedIps || []),
    ...(exam.allowedRetakeIps || [])
  ];
  if (window.ArabyaPlatformSync && window.ArabyaPlatformSync.ipMatchesAllowedList) {
    return window.ArabyaPlatformSync.ipMatchesAllowedList(clientIp, allowed);
  }
  const ip = normalizeDeviceIp(clientIp);
  return allowed.some(a => normalizeDeviceIp(a) === ip);
}

function countDistinctStudentsOnExamIp(examId, clientIp, excludeLookupKey) {
  const ip = normalizeDeviceIp(clientIp);
  if (!ip || !examId) return 0;
  const keys = new Set();
  (systemState.results || []).forEach(r => {
    if (!r || r.examId !== examId || isSupersededResult(r)) return;
    if (normalizeDeviceIp(r.clientIp) !== ip) return;
    const key = r.studentLookupKey || getStudentLookupKey({
      id: r.id,
      name: r.name,
      code: r.accessCode || r.code || ""
    });
    if (!key || key === excludeLookupKey) return;
    keys.add(key);
  });
  (loadExamDeviceRegistry().bindings || []).forEach(b => {
    if (!b || b.examId !== examId) return;
    if (normalizeDeviceIp(b.clientIp) !== ip) return;
    if (b.studentLookupKey && b.studentLookupKey !== excludeLookupKey) keys.add(b.studentLookupKey);
  });
  return keys.size;
}

function studentAlreadyUsesExamIp(examId, clientIp, studentLookupKey, studentContext) {
  const ip = normalizeDeviceIp(clientIp);
  if (!ip || !examId || !studentLookupKey) return false;
  const ctx = studentContext || buildStudentMatchContext({ studentKey: studentLookupKey });
  return (systemState.results || []).some(r =>
    r.examId === examId &&
    !isSupersededResult(r) &&
    normalizeDeviceIp(r.clientIp) === ip &&
    resultMatchesStudentIdentity(r, ctx)
  );
}

function checkExamSharedIpAdmission(exam, clientIp, studentLookupKey, studentContext) {
  if (!exam) return { ok: true };
  const ip = String(clientIp || "").trim();
  if (!ip) return { ok: true };
  if (studentContext && canStudentBypassExamLockForExam(exam.id, studentContext)) return { ok: true };
  if (isIpOnExamAllowlist(exam, ip)) return { ok: true };
  if (studentAlreadyUsesExamIp(exam.id, ip, studentLookupKey, studentContext)) return { ok: true };
  const max = getExamMaxStudentsPerSharedIp(exam);
  const others = countDistinctStudentsOnExamIp(exam.id, ip, studentLookupKey);
  if (others >= max) {
    return {
      ok: false,
      message:
        `تم رفض الدخول: وصل عدد الحسابات على نفس عنوان IP (${ip}) إلى الحد (${max}) لهذا الامتحان.\n\n` +
        `يمكنك زيادة «حد الطلاب لنفس IP» في إعدادات الامتحان، أو إضافة عنوانك إلى IP الاستثناء / إعادة الدخول.`
    };
  }
  return { ok: true, othersOnIp: others, max };
}

function buildExamSharedIpStudentMap() {
  const map = {};
  (systemState.results || []).forEach(res => {
    if (!res || isSupersededResult(res)) return;
    const ip = normalizeDeviceIp(res.clientIp);
    const examId = res.examId || "";
    if (!ip || !examId) return;
    if (!map[examId]) map[examId] = {};
    if (!map[examId][ip]) map[examId][ip] = new Set();
    const key = res.studentLookupKey || getStudentLookupKey({
      id: res.id,
      name: res.name,
      code: res.accessCode || res.code || ""
    });
    if (key) map[examId][ip].add(key);
  });
  return map;
}

function formatResultSharedIpBadgeHtml(res, sharedMap) {
  const ip = normalizeDeviceIp(res?.clientIp);
  const examId = res?.examId || "";
  if (!ip || !examId) return "";
  const set = sharedMap[examId]?.[ip];
  if (!set || set.size <= 1) return "";
  return (
    `<span class="shared-ip-badge" title="عنوان IP مشترك مع ${set.size} حساب/طالب على هذا الامتحان" ` +
    `style="display:inline-block;margin-inline-start:0.35rem;padding:0.12rem 0.45rem;border-radius:999px;` +
    `font-size:0.68rem;font-weight:800;background:rgba(245,158,11,0.18);color:var(--accent);` +
    `border:1px solid rgba(245,158,11,0.4);vertical-align:middle;">IP مشترك · ${set.size}</span>`
  );
}

function resultMatchesStudentIdentity(result, student) {
  if (!result || !student) return false;
  const keys = getStudentLookupKeysForMatch(student);
  if (result.studentLookupKey && keys.includes(result.studentLookupKey)) return true;
  if (result.studentKey && keys.includes(result.studentKey)) return true;

  const resultId = normalizeStudentIdForCompare(result.id || "");
  const studentId = normalizeStudentIdForCompare(student.id || "");

  if (isSharedStudentCode(student.code || student.accessCode) || isSharedStudentCode(result.accessCode || result.code)) {
    const resultName = normalizeStudentName(result.name || "");
    const studentName = normalizeStudentName(student.name || "");
    if (resultId && studentId && resultId === studentId) return true;
    if (resultName && studentName && resultName === studentName && studentCodesMatch(result.accessCode || result.code, student.code || student.accessCode)) {
      return true;
    }
    return false;
  }

  if (isPrivateStudentCode(student.code || student.accessCode) && studentCodesMatch(result.accessCode || result.code, student.code || student.accessCode)) {
    return true;
  }
  if (resultId && studentId && resultId === studentId) return true;

  const resultName = normalizeStudentName(result.name || "");
  const studentName = normalizeStudentName(student.name || "");
  if (resultName && studentName && resultName === studentName) {
    if (!resultId && !studentId) return false;
    if (resultId && studentId && resultId === studentId) return true;
  }
  return false;
}

function validateStudentIdentityInput(id, code, options = {}) {
  const name = (options.name || "").toString().trim();
  const normalizedName = normalizeStudentName(name);
  const normalizedId = normalizeStudentIdForCompare(id);
  const inputCode = sanitizeStudentCodeInput(code);
  const normalizedCode = normalizeStudentCodeForCompare(inputCode);
  const editingStudentKey = options.editingStudentKey || "";

  if (id && !isValidStudentIdFormat(id)) {
    return { ok: false, message: "معرف الهوية يجب أن يتكوّن من حروف أو أرقام أو كليهما (بدون رموز)." };
  }
  if (inputCode && !isValidStudentCodeFormat(inputCode)) {
    return { ok: false, message: "كود الاشتراك يجب أن يتكوّن من حروف أو أرقام أو كليهما." };
  }

  for (const student of systemState.students || []) {
    if (editingStudentKey && student.studentKey === editingStudentKey) continue;

    const otherId = normalizeStudentIdForCompare(student.id);
    const otherName = normalizeStudentName(student.name);
    const otherCode = normalizeStudentCodeForCompare(student.code);

    if (normalizedId && otherId === normalizedId && otherName !== normalizedName) {
      return {
        ok: false,
        message: "معرف الهوية مسجّل لطالب آخر باسم مختلف. تواصل مع المعلم أو استخدم المعرف الصحيح."
      };
    }

    if (normalizedCode && otherCode === normalizedCode && isPrivateStudentCode(inputCode)) {
      if (otherName !== normalizedName) {
        return {
          ok: false,
          message: "كود الاشتراك مستخدم لطالب آخر باسم مختلف."
        };
      }
    }

    if (isSharedStudentCode(inputCode) && otherCode === "00000") {
      const sameName = otherName === normalizedName;
      const sameId = normalizedId && otherId === normalizedId;
      if (sameName && sameId) continue;
      if (sameName && !normalizedId && !otherId) {
        return {
          ok: false,
          message: "مع كود 00000 والاسم نفسه يجب إدخال معرف هوية مختلف للتمييز."
        };
      }
    }
  }

  return { ok: true };
}

window.arabyaValidateStudentIdentity = validateStudentIdentityInput;
window.normalizeStudentId = normalizeStudentId;
window.normalizeStudentIdForCompare = normalizeStudentIdForCompare;
window.sanitizeStudentCodeInput = sanitizeStudentCodeInput;
window.isPrivateStudentCode = isPrivateStudentCode;
window.isSharedStudentCode = isSharedStudentCode;
window.isFiveDigitStudentCode = isFiveDigitStudentCode;
window.hasStudentCode = hasStudentCode;

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
const TEACHER_TAB_IDS = ["home", "stats", "exams", "question-bank", "results", "students", "teachers", "integration", "profile", "admins"];
const CLOUD_SYNC_LAST_OK_KEY = "arabya_last_cloud_sync_ok";
const CLOUD_SYNC_LAST_FAIL_KEY = "arabya_last_cloud_sync_fail";
const CLOUD_SYNC_LOCAL_ONLY_KEY = "arabya_cloud_sync_local_only";

function normalizeTeacherTabId(tabId) {
  let id = String(tabId || "").trim();
  if (id === "dashboard") id = "home";
  if (id === "admins") id = "teachers";
  return TEACHER_TAB_IDS.includes(id) ? id : "home";
}

function recordCloudSyncOutcome(ok, detail) {
  const now = new Date().toISOString();
  try {
    if (ok) {
      localStorage.setItem(CLOUD_SYNC_LAST_OK_KEY, JSON.stringify({ at: now, detail: detail || "" }));
      localStorage.removeItem(CLOUD_SYNC_LAST_FAIL_KEY);
      localStorage.removeItem(CLOUD_SYNC_LOCAL_ONLY_KEY);
    } else {
      localStorage.setItem(CLOUD_SYNC_LAST_FAIL_KEY, JSON.stringify({ at: now, detail: detail || "" }));
    }
  } catch (e) {}
  refreshCloudSyncStatusUI(detail, ok ? "ok" : "fail");
  if (window.ArabyaToast && detail) {
    const msg = String(detail);
    if (/بنك|question/i.test(msg) && window.ArabyaPlatformSync) {
      window.ArabyaPlatformSync.recordQuestionBankSync(ok, msg);
    } else {
      window.ArabyaToast.showToast(msg, ok ? "success" : "error");
    }
  }
}

function markCloudSyncLocalOnly(reason) {
  try {
    localStorage.setItem(CLOUD_SYNC_LOCAL_ONLY_KEY, JSON.stringify({ at: new Date().toISOString(), reason: reason || "" }));
  } catch (e) {}
  refreshCloudSyncStatusUI(reason, "local");
}

function formatCloudSyncTimestamp(iso) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(iso);
  return dt.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function refreshCloudSyncStatusUI(liveMessage, state) {
  const indicator = document.getElementById("cloud-sync-status-indicator");
  const lastLine = document.getElementById("cloud-sync-last-sync-line");
  const globalBar = document.getElementById("teacher-global-sync-bar");
  const urlConfigured = getArabyaWebAppUrls().length > 0;

  let okMeta = null;
  let failMeta = null;
  let localMeta = null;
  try { okMeta = JSON.parse(localStorage.getItem(CLOUD_SYNC_LAST_OK_KEY) || "null"); } catch (e) {}
  try { failMeta = JSON.parse(localStorage.getItem(CLOUD_SYNC_LAST_FAIL_KEY) || "null"); } catch (e) {}
  try { localMeta = JSON.parse(localStorage.getItem(CLOUD_SYNC_LOCAL_ONLY_KEY) || "null"); } catch (e) {}

  if (state === "syncing" && indicator) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; animation:spin 1s infinite linear;">sync</span> ${escapeHtml(liveMessage || "جاري المزامنة مع Google Sheets...")}`;
  } else if (state === "ok" && indicator) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--success); font-size:1.1rem;">cloud_done</span> ${escapeHtml(liveMessage || "تمت المزامنة السحابية بنجاح")}`;
  } else if (state === "fail" && indicator) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--error); font-size:1.1rem;">cloud_off</span> ${escapeHtml(liveMessage || "فشل الاتصال بالسحابة — البيانات محفوظة محلياً فقط")}`;
  } else if (state === "local" && indicator) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem;">save</span> ${escapeHtml(liveMessage || "تم الحفظ محلياً فقط — أضف رابط Web App من تبويب الربط")}`;
  } else if (indicator && !urlConfigured) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem;">cloud_queue</span> المزامنة غير مهيأة — أدخل رابط <code>/exec</code> في تبويب الربط`;
  }

  if (lastLine) {
    const parts = [];
    if (okMeta?.at) parts.push(`<span style="color:var(--success);">آخر مزامنة ناجحة: ${escapeHtml(formatCloudSyncTimestamp(okMeta.at))}</span>`);
    if (urlConfigured) {
      parts.push(`<span style="color:var(--text-muted);">جلب تلقائي كل 20 ث · مراقبة الشيت كل 10 ث · رفع فوري بعد الحفظ</span>`);
    }
    if (failMeta?.at) parts.push(`<span style="color:var(--error);">آخر فشل: ${escapeHtml(formatCloudSyncTimestamp(failMeta.at))}${failMeta.detail ? ` (${escapeHtml(failMeta.detail)})` : ""}</span>`);
    if (localMeta?.at && !okMeta?.at) parts.push(`<span style="color:var(--warning);">محلي فقط منذ: ${escapeHtml(formatCloudSyncTimestamp(localMeta.at))}</span>`);
    lastLine.innerHTML = parts.join(" · ") || "";
  }

  if (globalBar) {
    if (systemState.activeView !== "teacher-dashboard-view") {
      globalBar.classList.add("hidden");
      return;
    }
    globalBar.classList.remove("hidden");
    globalBar.classList.remove("is-syncing", "is-local-only", "is-error");
    if (state === "syncing") {
      globalBar.classList.add("is-syncing");
      globalBar.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; color:var(--secondary);">sync</span> ${escapeHtml(liveMessage || "جاري المزامنة...")}`;
    } else if (state === "fail" || failMeta?.at && (!okMeta?.at || new Date(failMeta.at) > new Date(okMeta.at))) {
      globalBar.classList.add("is-error");
      globalBar.innerHTML = `<span class="material-icons" style="color:var(--error);">cloud_off</span> فشل الاتصال — تحقق من النشر والرابط. البيانات محفوظة على هذا الجهاز.`;
    } else if (state === "local" || localMeta?.at || !urlConfigured) {
      globalBar.classList.add("is-local-only");
      globalBar.innerHTML = `<span class="material-icons" style="color:var(--warning);">save</span> تم الحفظ محلياً فقط${urlConfigured ? "" : " — أضف رابط Web App للمزامنة"}`;
    } else {
      globalBar.innerHTML = `<span class="material-icons" style="color:var(--success);">cloud_done</span> متصل بالسحابة${okMeta?.at ? ` · آخر نجاح: ${escapeHtml(formatCloudSyncTimestamp(okMeta.at))}` : ""}`;
    }
  }
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
  } else if (normalizedTab === "question-bank") {
    if (typeof window.renderQuestionBankTab === "function") window.renderQuestionBankTab();
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
  const questionBankTab = document.getElementById("teacher-tab-question-bank");
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
  if (refreshAll || (questionBankTab && !questionBankTab.classList.contains("hidden"))) {
    if (typeof window.renderQuestionBankTab === "function") window.renderQuestionBankTab();
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

/** كل عمليات السحابة للمعلم الحالي تستخدم رابطاً موحّداً واحداً (الخيار 2). */
function getArabyaWebAppUrls() {
  return getGeneralTeacherSyncUrls();
}

function getGeneralTeacherSyncUrls() {
  const urls = new Set();
  if (systemState.config && isValidCloudSyncUrl(systemState.config.googleFormUrl)) {
    urls.add(normalizeArabyaWebAppUrl(systemState.config.googleFormUrl.trim()));
  }
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && isValidCloudSyncUrl(systemState.activeTeacher.integrationConfig.googleFormUrl)) {
    urls.add(normalizeArabyaWebAppUrl(systemState.activeTeacher.integrationConfig.googleFormUrl.trim()));
  }
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    if (isValidCloudSyncUrl(cfg.googleFormUrl)) urls.add(normalizeArabyaWebAppUrl(cfg.googleFormUrl.trim()));
  } catch (e) {}
  try {
    const teacherUrlInput = document.getElementById("teacher-config-url");
    if (teacherUrlInput && isValidCloudSyncUrl(teacherUrlInput.value)) {
      urls.add(normalizeArabyaWebAppUrl(teacherUrlInput.value.trim()));
    }
  } catch (e) {}
  return Array.from(urls).filter(Boolean);
}

function getCloudBackupScope() {
  return ARABYA_CLOUD_BACKUP_SCOPE_GENERAL;
}

function resolveCloudBackupTargetUrls(scope, generalUrls, allUrls) {
  const general = [...new Set((generalUrls || []).map(u => normalizeArabyaWebAppUrl(u)).filter(Boolean))];
  const all = [...new Set((allUrls || []).map(u => normalizeArabyaWebAppUrl(u)).filter(Boolean))];
  if (scope === ARABYA_CLOUD_BACKUP_SCOPE_ALL) return all.length ? all : general;
  return general.length ? general : all;
}

function getCloudBackupTargetUrls() {
  return getGeneralTeacherSyncUrls();
}

function getUnifiedTeacherSyncUrl(exam) {
  const candidates = [];
  if (exam && exam.teacher && Array.isArray(systemState.teachers)) {
    const owner = systemState.teachers.find(x => x.username === exam.teacher);
    if (owner && owner.integrationConfig && owner.integrationConfig.googleFormUrl) {
      candidates.push(String(owner.integrationConfig.googleFormUrl).trim());
    }
  }
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    candidates.push(String(systemState.activeTeacher.integrationConfig.googleFormUrl).trim());
  }
  if (systemState.config && systemState.config.googleFormUrl) candidates.push(String(systemState.config.googleFormUrl).trim());
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    if (cfg.googleFormUrl) candidates.push(String(cfg.googleFormUrl).trim());
  } catch (e) {}
  try {
    const teacherUrlInput = document.getElementById("teacher-config-url");
    if (teacherUrlInput && teacherUrlInput.value) candidates.push(String(teacherUrlInput.value).trim());
  } catch (e) {}
  try {
    const s = getUrlParameter("s");
    if (s) candidates.push(String(s).trim());
  } catch (e) {}
  for (const u of candidates) {
    if (isValidCloudSyncUrl(u)) return normalizeArabyaWebAppUrl(u);
  }
  return "";
}

function getExamResultSyncUrl(exam) {
  return getUnifiedTeacherSyncUrl(exam || systemState.currentExam || null);
}

function applyUnifiedCloudSyncModel(options = {}) {
  if (!options.force) {
    try {
      if (localStorage.getItem(ARABYA_UNIFIED_CLOUD_SYNC_FLAG) === "done") return false;
    } catch (e) {}
  }
  let changed = false;
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam && exam.googleFormUrl) {
        delete exam.googleFormUrl;
        changed = true;
      }
    });
  }
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig) {
    if (systemState.activeTeacher.integrationConfig.cloudBackupScope === ARABYA_CLOUD_BACKUP_SCOPE_ALL) {
      systemState.activeTeacher.integrationConfig.cloudBackupScope = ARABYA_CLOUD_BACKUP_SCOPE_GENERAL;
      changed = true;
    }
  }
  if (systemState.config && systemState.config.cloudBackupScope === ARABYA_CLOUD_BACKUP_SCOPE_ALL) {
    systemState.config.cloudBackupScope = ARABYA_CLOUD_BACKUP_SCOPE_GENERAL;
    changed = true;
  }
  if (changed && typeof saveSystemState === "function") saveSystemState(false);
  try {
    localStorage.setItem(ARABYA_UNIFIED_CLOUD_SYNC_FLAG, "done");
  } catch (e) {}
  return changed;
}

function mergeRemoteCollection_(current, incoming, keyFn, label) {
  if (window.ArabyaPlatformSync && window.ArabyaPlatformSync.mergeRemoteCollectionWithConflicts) {
    return window.ArabyaPlatformSync.mergeRemoteCollectionWithConflicts(current, incoming, keyFn, label);
  }
  const map = {};
  (current || []).forEach(item => { map[keyFn(item)] = item; });
  (incoming || []).forEach(item => {
    if (!item) return;
    const key = keyFn(item);
    map[key] = { ...(map[key] || {}), ...item };
  });
  return Object.keys(map).map(key => map[key]);
}



function mergeTeachersPreservingLocalAuth_(localTeachers, remoteTeachers) {
  const keyFn = item => String(item.username || item.name || "");
  const map = {};
  (remoteTeachers || []).forEach(item => {
    if (!item) return;
    map[keyFn(item)] = { ...item };
  });
  (localTeachers || []).forEach(local => {
    if (!local) return;
    const key = keyFn(local);
    const remote = map[key] || {};
    map[key] = {
      ...remote,
      ...local,
      passwordHash: local.passwordHash || remote.passwordHash,
      passwordSalt: local.passwordSalt || remote.passwordSalt,
      password: local.password || (local.passwordHash ? "" : remote.password),
      autoEntryCode: local.autoEntryCode || remote.autoEntryCode || remote.password,
      integrationConfig: {
        ...(remote.integrationConfig || {}),
        ...(local.integrationConfig || {})
      }
    };
    if (map[key].passwordHash) delete map[key].password;
  });
  return Object.keys(map).map(key => {
    const t = map[key];
    if (t && t.passwordHash) delete t.password;
    return t;
  });
}

const DELETED_STUDENT_KEYS_STORAGE = "arabya_deleted_student_keys";

function loadDeletedStudentKeysFromStorage() {
  if (!Array.isArray(systemState.deletedStudentKeys)) systemState.deletedStudentKeys = [];
  const inMemory = [...systemState.deletedStudentKeys];
  try {
    const raw = JSON.parse(localStorage.getItem(DELETED_STUDENT_KEYS_STORAGE) || "[]");
    if (Array.isArray(raw)) {
      systemState.deletedStudentKeys = [...new Set([...inMemory, ...raw.map(String).filter(Boolean)])];
    }
  } catch (e) {}
  return systemState.deletedStudentKeys;
}

function persistDeletedStudentKeys() {
  loadDeletedStudentKeysFromStorage();
  try {
    localStorage.setItem(DELETED_STUDENT_KEYS_STORAGE, JSON.stringify(systemState.deletedStudentKeys));
  } catch (e) {}
}

function isStudentKeyDeleted(key) {
  if (!key) return false;
  const k = String(key).trim();
  return loadDeletedStudentKeysFromStorage().includes(k);
}

function isStudentRecordDeleted(student) {
  if (!student) return false;
  if (isStudentKeyDeleted(student.studentKey)) return true;
  const lookup = getStudentLookupKey(student);
  if (lookup && isStudentKeyDeleted(lookup)) return true;
  const nid = normalizeStudentIdForCompare(student.id);
  if (nid && isStudentKeyDeleted(`id:${nid}`)) return true;
  const code = normalizeStudentCodeForCompare(student.code);
  if (code && isStudentKeyDeleted(`code:${code}`)) return true;
  return false;
}

function isResultFromDeletedStudent(res) {
  if (!res) return false;
  loadDeletedStudentKeysFromStorage();
  if (res.studentLookupKey && isStudentKeyDeleted(res.studentLookupKey)) return true;
  const lookup = getStudentLookupKey({
    id: res.id,
    name: res.name,
    code: res.accessCode || res.code || ""
  });
  if (lookup && isStudentKeyDeleted(lookup)) return true;
  const nid = normalizeStudentIdForCompare(res.id);
  if (nid && isStudentKeyDeleted(`id:${nid}`)) return true;
  const code = normalizeStudentCodeForCompare(res.accessCode || res.code);
  if (code && isStudentKeyDeleted(`code:${code}`)) return true;
  return false;
}

function addDeletedStudentKey(student) {
  loadDeletedStudentKeysFromStorage();
  const keys = new Set(systemState.deletedStudentKeys);
  const primary = student.studentKey || getStudentLookupKey(student);
  if (primary) keys.add(String(primary));
  if (student.id) keys.add(`id:${normalizeStudentIdForCompare(student.id)}`);
  if (student.code) keys.add(`code:${normalizeStudentCodeForCompare(student.code)}`);
  const normalizedName = normalizeStudentName(student.name);
  if (normalizedName) keys.add(`name:${normalizedName}`);
  systemState.deletedStudentKeys = [...keys];
  persistDeletedStudentKeys();
}

function filterOutDeletedStudents(students) {
  return (students || []).filter(s => !isStudentRecordDeleted(s));
}

function mergeDeletedStudentKeysFromRemote(remoteKeys) {
  loadDeletedStudentKeysFromStorage();
  if (!Array.isArray(remoteKeys)) return;
  const set = new Set([...systemState.deletedStudentKeys, ...remoteKeys.map(String).filter(Boolean)]);
  systemState.deletedStudentKeys = [...set];
  persistDeletedStudentKeys();
}

const DELETED_RESULT_KEYS_STORAGE = "arabya_deleted_result_keys";

function getResultTombstoneKey(res) {
  if (!res) return "";
  if (res.recordId) return String(res.recordId);
  return `legacy:${[res.id || "", res.examId || res.examTitle || "", res.timestamp || ""].join(":")}`;
}

function loadDeletedResultKeysFromStorage() {
  if (!Array.isArray(systemState.deletedResultKeys)) systemState.deletedResultKeys = [];
  const inMemory = [...systemState.deletedResultKeys];
  try {
    const raw = JSON.parse(localStorage.getItem(DELETED_RESULT_KEYS_STORAGE) || "[]");
    if (Array.isArray(raw)) {
      systemState.deletedResultKeys = [...new Set([...inMemory, ...raw.map(String).filter(Boolean)])];
    }
  } catch (e) {}
  return systemState.deletedResultKeys;
}

function persistDeletedResultKeys() {
  loadDeletedResultKeysFromStorage();
  try {
    localStorage.setItem(DELETED_RESULT_KEYS_STORAGE, JSON.stringify(systemState.deletedResultKeys));
  } catch (e) {}
}

function isResultKeyDeleted(key) {
  if (!key) return false;
  return loadDeletedResultKeysFromStorage().includes(String(key).trim());
}

function isResultRecordDeleted(res) {
  if (!res) return false;
  return isResultKeyDeleted(getResultTombstoneKey(res));
}

function addDeletedResultKey(resOrKey) {
  loadDeletedResultKeysFromStorage();
  const keys = new Set(systemState.deletedResultKeys);
  if (typeof resOrKey === "string") {
    if (resOrKey) keys.add(String(resOrKey));
  } else if (resOrKey) {
    const primary = getResultTombstoneKey(resOrKey);
    if (primary) keys.add(primary);
    if (resOrKey.recordId) keys.add(String(resOrKey.recordId));
  }
  systemState.deletedResultKeys = [...keys];
  persistDeletedResultKeys();
}

function mergeDeletedResultKeysFromRemote(remoteKeys) {
  loadDeletedResultKeysFromStorage();
  if (!Array.isArray(remoteKeys)) return;
  const set = new Set([...systemState.deletedResultKeys, ...remoteKeys.map(String).filter(Boolean)]);
  systemState.deletedResultKeys = [...set];
  persistDeletedResultKeys();
}

function filterOutDeletedResults(results) {
  return (results || []).filter(r => !isResultRecordDeleted(r));
}

function tombstoneResultsForDeletedStudent(student) {
  if (!student) return;
  const ctx = buildStudentMatchContext(student);
  (systemState.results || []).forEach(res => {
    if (resultMatchesStudentIdentity(res, ctx)) {
      addDeletedResultKey(res);
    }
  });
  systemState.results = filterOutDeletedResults(systemState.results);
}

function applyDeletionTombstonesToLocalState() {
  loadDeletedStudentKeysFromStorage();
  loadDeletedResultKeysFromStorage();
  systemState.students = filterOutDeletedStudents(systemState.students);
  systemState.results = filterOutDeletedResults(systemState.results);
  persistDeletedStudentKeys();
  persistDeletedResultKeys();
}

function getStudentAggregateKeyFromResult(res) {
  if (!res) return "";
  if (res.studentLookupKey) return String(res.studentLookupKey);
  return getStudentLookupKey({
    id: res.id,
    name: res.name,
    code: res.accessCode || res.code || ""
  });
}

function pickEarlierStudentTimestamp(currentTs, candidateTs) {
  const current = String(currentTs || "").trim();
  const candidate = String(candidateTs || "").trim();
  if (!current) return candidate;
  if (!candidate) return current;
  const currentDt = parseResultTimestamp(current);
  const candidateDt = parseResultTimestamp(candidate);
  if (currentDt && candidateDt) {
    return candidateDt.getTime() < currentDt.getTime() ? candidate : current;
  }
  return current.length <= candidate.length ? current : candidate;
}

function findBackupStudentForDraft(draft, backupStudents) {
  if (!draft || !Array.isArray(backupStudents)) return null;
  const primaryKey = draft.studentLookupKey || getStudentLookupKey(draft);
  if (primaryKey) {
    const byKey = backupStudents.find(s => (s.studentKey || getStudentLookupKey(s)) === primaryKey);
    if (byKey) return byKey;
  }
  const id = normalizeStudentIdForCompare(draft.id);
  const name = normalizeStudentName(draft.name);
  const code = normalizeStudentCodeForCompare(draft.code);
  return backupStudents.find(s => {
    if (id && normalizeStudentIdForCompare(s.id) === id) return true;
    if (code && isPrivateStudentCode(code) && studentCodesMatch(s.code, code)) return true;
    if (name && normalizeStudentName(s.name) === name && !id && !hasStudentCode(s.code)) return true;
    return false;
  }) || null;
}

/** يبني قائمة الطلاب من نتائج الشيت (مصدر الحقيقة) ويدمج بيانات النسخة الاحتياطية */
function buildStudentsFromSheetResults(results, backupStudents = []) {
  loadDeletedStudentKeysFromStorage();
  const backup = filterOutDeletedStudents(backupStudents || []);
  const map = new Map();

  (results || []).forEach(res => {
    if (!res || isResultRecordDeleted(res) || isResultFromDeletedStudent(res)) return;
    if (!res.name && !res.id && !res.accessCode && !res.code) return;
    const key = getStudentAggregateKeyFromResult(res);
    if (!key) return;
    const draft = {
      studentLookupKey: res.studentLookupKey || key,
      name: (res.name || "").trim(),
      id: normalizeStudentId(res.id || ""),
      code: sanitizeStudentCodeInput(res.accessCode || res.code || ""),
      email: normalizeContactField(res.email),
      mobile: normalizeContactField(res.mobile),
      timestamp: String(res.timestamp || "").trim(),
      lastKnownIp: res.clientIp || "",
      clientIp: res.clientIp || "",
      deviceFingerprint: res.deviceFingerprint || "",
      deviceId: res.deviceId || ""
    };
    if (isStudentRecordDeleted(draft)) return;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, draft);
      return;
    }
    existing.timestamp = pickEarlierStudentTimestamp(existing.timestamp, draft.timestamp);
    if (draft.email) existing.email = draft.email;
    if (draft.mobile) existing.mobile = draft.mobile;
    if (draft.lastKnownIp) {
      existing.lastKnownIp = draft.lastKnownIp;
      existing.clientIp = draft.clientIp;
    }
    if (draft.deviceFingerprint) existing.deviceFingerprint = draft.deviceFingerprint;
    if (draft.deviceId) existing.deviceId = draft.deviceId;
    if (!existing.name && draft.name) existing.name = draft.name;
    if (!existing.id && draft.id) existing.id = draft.id;
    if (!existing.code && draft.code) existing.code = draft.code;
  });

  const merged = [];
  const usedBackupKeys = new Set();

  map.forEach(draft => {
    const backupRow = findBackupStudentForDraft(draft, backup);
    const studentKey = backupRow?.studentKey || draft.studentLookupKey || getStudentLookupKey(draft) || createRecordId("student");
    if (backupRow?.studentKey) usedBackupKeys.add(backupRow.studentKey);
    const sheetTimestamp = draft.timestamp || "";
    const backupTimestamp = String(backupRow?.timestamp || "").trim();
    const timestamp = sheetTimestamp
      ? pickEarlierStudentTimestamp(sheetTimestamp, backupTimestamp)
      : backupTimestamp;
    merged.push({
      ...(backupRow || {}),
      ...draft,
      studentKey,
      timestamp: timestamp || sheetTimestamp || backupTimestamp || "",
      accountType: backupRow?.accountType || ARABYA_ACCOUNT_ROLES.STUDENT
    });
  });

  backup.forEach(student => {
    if (!student || isStudentRecordDeleted(student)) return;
    const key = student.studentKey || getStudentLookupKey(student);
    if (key && usedBackupKeys.has(key)) return;
    if (key && map.has(key)) return;
    const already = merged.some(row => {
      if (key && (row.studentKey === key || row.studentLookupKey === key)) return true;
      return findBackupStudentForDraft(row, [student]) === student;
    });
    if (!already) merged.push({ ...student });
  });

  return merged;
}

function reconcileStudentsFromCloudData(results, backupStudents) {
  systemState.students = buildStudentsFromSheetResults(results, backupStudents);
  ensureStudentsDataShape({ preserveEmptyTimestamp: true });
}

function hydrateStudentsFromResults(results) {
  reconcileStudentsFromCloudData(results, systemState.students);
}

function mergeRemoteDatabaseIntoLocal(remoteData, mergeOptions = {}) {
  if (!remoteData || typeof remoteData !== "object") return false;
  const examStartOnly = mergeOptions.scope === "exam_start";
  loadDeletedStudentKeysFromStorage();
  loadDeletedResultKeysFromStorage();
  const preserveDeletedStudents = [...systemState.deletedStudentKeys];
  const preserveDeletedResults = [...systemState.deletedResultKeys];
  if (!examStartOnly && Array.isArray(remoteData.teachers)) {
    systemState.teachers = mergeTeachersPreservingLocalAuth_(systemState.teachers, remoteData.teachers);
    if (systemState.activeTeacher) {
      const refreshedTeacher = systemState.teachers.find(t => t.username === systemState.activeTeacher.username);
      if (refreshedTeacher) {
        systemState.activeTeacher = refreshedTeacher;
        syncActiveTeacherCredentials();
      }
    }
  }
  if (Array.isArray(remoteData.deletedStudentKeys)) {
    mergeDeletedStudentKeysFromRemote(remoteData.deletedStudentKeys);
  }
  if (Array.isArray(remoteData.deletedResultKeys)) {
    mergeDeletedResultKeysFromRemote(remoteData.deletedResultKeys);
  }
  systemState.deletedStudentKeys = [...new Set([...preserveDeletedStudents, ...systemState.deletedStudentKeys])];
  systemState.deletedResultKeys = [...new Set([...preserveDeletedResults, ...systemState.deletedResultKeys])];
  persistDeletedStudentKeys();
  persistDeletedResultKeys();
  const remoteStudentsBackup = filterOutDeletedStudents(
    Array.isArray(remoteData.students) ? remoteData.students : []
  );
  if (!examStartOnly) {
    systemState.students = filterOutDeletedStudents(systemState.students);
  }
  if (Array.isArray(remoteData.exams)) {
    systemState.exams = mergeRemoteCollection_(systemState.exams, remoteData.exams, item => String(item.id || item.title || ""), "امتحان");
  }
  if (Array.isArray(remoteData.results)) {
    const remoteResults = remoteData.results.filter(
      r => r && !isResultRecordDeleted(r) && !isResultFromDeletedStudent(r)
    );
    const mergedResults = mergeRemoteCollection_(systemState.results, remoteResults, item => {
      if (item.recordId) return String(item.recordId);
      return String([item.id, item.examId || item.examTitle, item.timestamp, item.score].join(":"));
    }, "نتيجة");
    systemState.results = filterOutDeletedResults(mergedResults);
  } else {
    systemState.results = filterOutDeletedResults(systemState.results);
  }
  if (!examStartOnly) {
    reconcileStudentsFromCloudData(systemState.results, remoteStudentsBackup);
    systemState.students = filterOutDeletedStudents(systemState.students);
    ensureResultRecordIds();
    hydratePresentedQuestionsForResults();
  } else {
    ensureResultRecordIds();
  }
  if (remoteData.examDeviceRegistry) {
    saveExamDeviceRegistry(mergeRemoteExamDeviceRegistry_(loadExamDeviceRegistry(), remoteData.examDeviceRegistry));
  }
  if (!examStartOnly && remoteData.questionBanks && typeof remoteData.questionBanks === "object" && window.ArabyaCloudSync) {
    const banks = window.ArabyaCloudSync.normalizeCloudQuestionBanks
      ? window.ArabyaCloudSync.normalizeCloudQuestionBanks(remoteData.questionBanks)
      : remoteData.questionBanks;
    window.ArabyaCloudSync.applyQuestionBanksFromCloud(banks);
  }
  ensureStudentsDataShape();
  ensureExamsDataShape();
  if (!examStartOnly && remoteData.config && typeof remoteData.config === "object") {
    systemState.config = { ...(systemState.config || {}), ...remoteData.config };
    try {
      localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
    } catch (e) {}
  }
  syncPlatformAppVersionFromDatabase(remoteData);
  applyDeletionTombstonesToLocalState();
  return true;
}


function normalizeArabyaWebAppUrl(rawUrl) {
  let url = String(rawUrl || "").trim();
  if (!url) return "";
  if (url.includes("/macros/s/") || url.endsWith("/exec")) {
    if (url.includes("/dev")) {
      url = url.replace(/\/dev(\?|$)/, "/exec$1");
    }
    return url;
  }
  return url;
}

function buildSlimResultCloudPayload(payload) {
  const slim = { ...payload };
  if (slim.details && String(slim.details).length > 12000) {
    slim.details = String(slim.details).slice(0, 12000) + "\n...[مختصر للمزامنة السحابية]";
  }
  delete slim.studentAnswers;
  delete slim.questionScores;
  delete slim.presentedQuestions;
  return slim;
}

async function postToArabyaWebAppNoCors(url, payload) {
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (e) {
    return false;
  }
}

function postToArabyaWebApp(url, payload) {
  const targetUrl = normalizeArabyaWebAppUrl(url);
  if (!targetUrl) return Promise.reject(new Error("رابط Web App غير صالح"));

  if (!navigator.onLine && window.ArabyaOfflineQueue) {
    window.ArabyaOfflineQueue.enqueue(targetUrl, payload);
    return Promise.resolve({ status: "queued" });
  }

  const attempt = () => fetch(targetUrl, {
    method: "POST",
    mode: "cors",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).then(async res => {
    const text = (await res.text()) || "";
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { parsed = null; }
      }
    }
    if (!res.ok) {
      throw new Error((parsed && parsed.message) || text.slice(0, 200) || ("HTTP " + res.status));
    }
    if (parsed && parsed.status === "error") {
      throw new Error(parsed.message || "Cloud sync error");
    }
    if (!parsed && text && !/success|تم/i.test(text)) {
      throw new Error("استجابة غير متوقعة من الخادم. تأكد من نشر Apps Script كـ Web App للجميع (Anyone) واستخدام رابط /exec");
    }
    return parsed || { status: "success" };
  });

  return attempt().catch(err => {
    console.warn("postToArabyaWebApp retry:", targetUrl, err);
    return attempt();
  });
}

function mergeRemoteExamDeviceRegistry_(localRegistry, remoteRegistry) {
  const local = localRegistry && Array.isArray(localRegistry.bindings) ? localRegistry : { bindings: [] };
  const remote = remoteRegistry && Array.isArray(remoteRegistry.bindings) ? remoteRegistry : { bindings: [] };
  const merged = new Map();
  [...local.bindings, ...remote.bindings].forEach(entry => {
    if (!entry || !entry.examId || !entry.studentLookupKey) return;
    if (isRegistryBindingForDeletedStudent(entry)) return;
    const key = [
      entry.examId,
      entry.studentLookupKey,
      entry.deviceId || "",
      entry.deviceFingerprint || ""
    ].join("::");
    const existing = merged.get(key);
    const entrySavedAt = Number(entry.savedAt) || Date.parse(entry.boundAt || "") || 0;
    const existingSavedAt = existing ? (Number(existing.savedAt) || Date.parse(existing.boundAt || "") || 0) : 0;
    if (!existing || entrySavedAt >= existingSavedAt) merged.set(key, { ...entry });
  });
  return pruneExamDeviceRegistry({ bindings: [...merged.values()] });
}

async function pushCloudBackupNow(reason) {
  ensurePlatformAppVersionBeforeCloudPush();
  const urlList = getCloudBackupTargetUrls();
  if (urlList.length === 0) {
    markCloudSyncLocalOnly("لا يوجد رابط Web App");
    return false;
  }
  refreshCloudSyncStatusUI("جاري رفع النسخة الاحتياطية إلى Google Sheets...", "syncing");
  const backupData = typeof buildFullCloudBackupData === "function"
    ? buildFullCloudBackupData()
    : {
      teachers: systemState.teachers,
      students: systemState.students,
      exams: systemState.exams,
      results: systemState.results,
      examDeviceRegistry: loadExamDeviceRegistry()
    };
  const actor = window.ArabyaPlatformSync ? window.ArabyaPlatformSync.getCloudSyncActor() : { username: systemState.activeTeacher?.username || "" };
  const payload = {
    action: "save_backup",
    data: backupData,
    actor
  };
  let ok = false;
  for (const url of urlList) {
    try {
      await postToArabyaWebApp(url, payload);
      ok = true;
    } catch (e) {
      const sent = await postToArabyaWebAppNoCors(url, payload);
      if (sent) ok = true;
      console.warn("pushCloudBackupNow:", url, e);
    }
  }
  if (ok) {
    recordCloudSyncOutcome(true, reason && /question|بنك/i.test(String(reason)) ? "مزامنة بنك الأسئلة والنسخة الاحتياطية" : "نسخة احتياطية سحابية");
    if (/question|بنك/i.test(String(reason)) && window.ArabyaPlatformSync) {
      window.ArabyaPlatformSync.recordQuestionBankSync(true, "رفع بنك الأسئلة");
    }
  } else {
    recordCloudSyncOutcome(false, "فشل رفع النسخة الاحتياطية");
  }
  return ok;
}

function propagateStudentEditsToResults(student, previousKey = "") {
  if (!student) return;
  const keys = new Set([previousKey, student.studentKey, getStudentLookupKey(student)].filter(Boolean));
  systemState.results.forEach(res => {
    const matches = keys.has(res.studentLookupKey) ||
      (student.id && normalizeStudentId(res.id) === normalizeStudentId(student.id)) ||
      (
        student.name &&
        normalizeStudentName(res.name) === normalizeStudentName(student.name) &&
        sanitizeStudentCodeInput(res.accessCode || res.code) === sanitizeStudentCodeInput(student.code)
      );
    if (!matches) return;
    res.name = student.name;
    res.id = student.id;
    res.accessCode = student.code;
    res.studentLookupKey = student.studentKey;
  });
}


async function syncTeacherCredentialsToCloud(teacher = systemState.activeTeacher) {
  if (!teacher) return { ok: false, reason: "no_teacher" };
  const urlList = getGeneralTeacherSyncUrls();
  if (urlList.length === 0) return { ok: false, reason: "no_url" };

  const record = window.ArabyaCloudSync
    ? window.ArabyaCloudSync.sanitizeTeacherForCloud({
      username: teacher.username || teacher.name || "",
      name: teacher.name || "",
      subject: teacher.subject || "",
      password: teacher.password || "",
      autoEntryCode: teacher.autoEntryCode || teacher.password || "",
      passwordHash: teacher.passwordHash || "",
      passwordSalt: teacher.passwordSalt || "",
      role: inferTeacherRole(teacher),
      integrationConfig: teacher.integrationConfig || {}
    })
    : {
      username: teacher.username || teacher.name || "",
      name: teacher.name || "",
      subject: teacher.subject || "",
      autoEntryCode: teacher.autoEntryCode || "",
      role: inferTeacherRole(teacher),
      integrationConfig: teacher.integrationConfig || {}
    };

  const payload = {
    action: "save_entity",
    collection: "teachers",
    record
  };

  let entityOk = false;
  for (const url of urlList) {
    try {
      await postToArabyaWebApp(url, payload);
      entityOk = true;
    } catch (e) {
      try {
        if (await postToArabyaWebAppNoCors(url, payload)) entityOk = true;
      } catch (e2) {}
    }
  }

  let backupOk = false;
  try {
    backupOk = await pushCloudBackupNow();
  } catch (e) {}

  return {
    ok: entityOk || backupOk,
    entityOk,
    backupOk,
    reason: (entityOk || backupOk) ? "synced" : "failed"
  };
}

function formatTeacherCredentialSyncMessage(syncResult) {
  if (!syncResult) return "تم الحفظ محلياً.";
  if (syncResult.ok) return "تم حفظ الرمز ومزامنته مع Google Sheets بنجاح!";
  if (syncResult.reason === "no_url") return "تم الحفظ محلياً. اربط Google Sheets من تبويب الربط لمزامنة الرمز على جميع الأجهزة.";
  return "تم الحفظ محلياً، لكن فشلت المزامنة السحابية. تحقق من الرابط ونشر Apps Script ثم أعد الحفظ.";
}

function updateTeacherCredentialSyncIndicator(syncResult, syncing = false) {
  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (!indicator) return;
  if (syncing) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة رمز الدخول مع Google Sheets...`;
    return;
  }
  if (syncResult && syncResult.ok) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--success); font-size:1.1rem; vertical-align:middle;">cloud_done</span> تم تحديث رمز الدخول في Google Sheets`;
    return;
  }
  if (syncResult && syncResult.reason === "no_url") {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> الرمز محفوظ محلياً — أضف رابط Web App للمزامنة`;
    return;
  }
  indicator.innerHTML = `<span class="material-icons" style="color:var(--error); font-size:1.1rem; vertical-align:middle;">cloud_off</span> فشلت مزامنة الرمز — تم الحفظ محلياً فقط`;
}

async function syncStudentRecordToCloud(student) {
  if (!student) return false;
  const urlList = getGeneralTeacherSyncUrls();
  if (urlList.length === 0) return false;

  const payload = {
    action: "save_entity",
    collection: "students",
    record: {
      name: student.name || "",
      id: student.id || "",
      code: student.code || "",
      email: student.email || "",
      mobile: student.mobile || "",
      studentKey: student.studentKey || getStudentLookupKey(student),
      timestamp: student.timestamp || new Date().toLocaleDateString("ar-EG")
    }
  };

  let ok = false;
  for (const url of urlList) {
    try {
      await postToArabyaWebApp(url, payload);
      ok = true;
    } catch (e) {
      const sent = await postToArabyaWebAppNoCors(url, payload);
      if (sent) ok = true;
    }
  }
  if (ok) {
    try { await pushCloudBackupNow(); } catch (e) {}
  }
  return ok;
}

async function syncLocalDatabaseToCloud() {
  const urlList = getCloudBackupTargetUrls();
  if (urlList.length === 0) return false;
  return pushCloudBackupNow();
}


function formatSheetSyncNote(syncResult) {
  if (!syncResult || syncResult.sheetResultRows == null) return "";
  const imported = syncResult.sheetResultRows;
  const total = syncResult.sheetTotalRows != null ? syncResult.sheetTotalRows : imported;
  if (total > imported) {
    const skipped = syncResult.sheetSkippedRows != null ? syncResult.sheetSkippedRows : (total - imported);
    const skippedNote = skipped === 1 ? "صف فارغ واحد متروك" : `${skipped} صفوف فارغة متروكة`;
    return ` — ${total} صفاً في ورقة «نتائج الطلاب» (${imported} مستورد، ${skippedNote})`;
  }
  return ` — ${imported} صفاً في ورقة «نتائج الطلاب»`;
}

window.pullTeacherResultsFromCloud = async function() {
  const el = document.getElementById("teacher-results-sync-status");
  if (el) {
    el.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري جلب النتائج من Google Sheets...`;
  }
  const syncResult = await syncDatabaseFromCloud({ silent: false });
  if (syncResult.ok) {
    getResultsTableViewSettings().page = 1;
    getStudentsTableViewSettings().page = 1;
  }
  refreshTeacherDashboardViews({ all: true });
  if (el) {
    if (syncResult.ok) {
      const sheetNote = formatSheetSyncNote(syncResult);
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تمت المزامنة: ${systemState.results.length} سجلاً نتائج · ${systemState.students.length} طالب${sheetNote}`;
    } else {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> تعذّر الجلب. تأكد من رابط /exec ونشر Web App للجميع (Anyone)، ثم انسخ الكود الذي يحتوي readArabyaSheetResults_ من تبويب الربط وأعد النشر كإصدار جديد.`;
    }
  }
  return syncResult.ok;
};

const PRE_EXAM_SYNC_ESTIMATE_KEY = "arabya_pre_exam_sync_estimate_ms";
const PRE_EXAM_SYNC_AT_KEY = "arabya_pre_exam_sync_at";
const DEFAULT_PRE_EXAM_SYNC_MS = 6000;
const MIN_PRE_EXAM_SYNC_MS = 3000;
const MAX_PRE_EXAM_SYNC_MS = 15000;
const PRE_EXAM_SYNC_PREFETCH_MAX_AGE_MS = 25000;
let studentExamGatePrefetchPromise = null;

function getPreExamSyncEstimateMs() {
  try {
    const stored = parseInt(localStorage.getItem(PRE_EXAM_SYNC_ESTIMATE_KEY) || "", 10);
    if (Number.isFinite(stored) && stored >= MIN_PRE_EXAM_SYNC_MS) {
      return Math.min(MAX_PRE_EXAM_SYNC_MS, stored);
    }
  } catch (e) {}
  return DEFAULT_PRE_EXAM_SYNC_MS;
}

function recordPreExamSyncDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const prev = getPreExamSyncEstimateMs();
  const blended = Math.round(prev * 0.65 + durationMs * 0.35);
  const clamped = Math.max(MIN_PRE_EXAM_SYNC_MS, Math.min(MAX_PRE_EXAM_SYNC_MS, blended));
  try {
    localStorage.setItem(PRE_EXAM_SYNC_ESTIMATE_KEY, String(clamped));
    localStorage.setItem(PRE_EXAM_SYNC_AT_KEY, String(Date.now()));
  } catch (e) {}
}

async function fetchCloudBackupJson_(rawUrl, timeoutMs) {
  const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_backup";
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const res = await fetch(fetchUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined
    });
    if (!res.ok) return null;
    const response = await res.json();
    if (response && response.status === "success" && response.data) return response;
  } catch (err) {
    if (err && err.name === "AbortError") {
      console.warn("[ARABYA] cloud backup fetch timed out", timeoutMs, "ms", rawUrl);
    } else {
      console.warn("fetchCloudBackupJson_ failed for", fetchUrl, err);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
  return null;
}

async function fetchAndMergeAllCloudBackups(mergeOptions = {}, timeoutMs = 0) {
  const urlList = getArabyaWebAppUrls();
  if (!urlList.length) return { ok: false, lastResponse: null };
  let lastResponse = null;
  let anyMerged = false;
  if (timeoutMs > 0) {
    const settled = await Promise.all(urlList.map(url => fetchCloudBackupJson_(url, timeoutMs)));
    settled.forEach(response => {
      if (!response || !response.data) return;
      mergeRemoteDatabaseIntoLocal(response.data, mergeOptions);
      anyMerged = true;
      lastResponse = response;
    });
  } else {
    for (const rawUrl of urlList) {
      const response = await fetchCloudBackupJson_(rawUrl, 0);
      if (!response || !response.data) continue;
      mergeRemoteDatabaseIntoLocal(response.data, mergeOptions);
      anyMerged = true;
      lastResponse = response;
    }
  }
  return { ok: anyMerged, lastResponse };
}

function prefetchStudentExamGateData() {
  if (getArabyaWebAppUrls().length === 0) return;
  try {
    const lastAt = parseInt(localStorage.getItem(PRE_EXAM_SYNC_AT_KEY) || "0", 10);
    if (Date.now() - lastAt < PRE_EXAM_SYNC_PREFETCH_MAX_AGE_MS) return;
  } catch (e) {}
  if (studentExamGatePrefetchPromise) return;
  const started = performance.now();
  studentExamGatePrefetchPromise = syncDatabaseFromCloud({
    silent: true,
    scope: "exam_start",
    timeoutMs: 8000
  }).then(result => {
    recordPreExamSyncDuration(performance.now() - started);
    return result;
  }).finally(() => {
    studentExamGatePrefetchPromise = null;
  });
}

function getStudentExamPrepareOverlay() {
  return document.getElementById("student-exam-prepare-overlay");
}

function showStudentExamPrepareOverlay(estimatedMs) {
  const overlay = getStudentExamPrepareOverlay();
  if (!overlay) return { close() {} };
  const countdownEl = document.getElementById("student-exam-prepare-countdown");
  const messageEl = document.getElementById("student-exam-prepare-message");
  const progressEl = document.getElementById("student-exam-prepare-progress-bar");
  const totalMs = Math.max(MIN_PRE_EXAM_SYNC_MS, estimatedMs || DEFAULT_PRE_EXAM_SYNC_MS);
  const initialSecs = Math.max(1, Math.ceil(totalMs / 1000));
  if (countdownEl) countdownEl.textContent = String(initialSecs);
  if (messageEl) {
    messageEl.textContent = "جاري تجهيز الامتحان، يرجى الانتظار...";
  }
  if (progressEl) progressEl.style.width = "0%";
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  return {
    update(remainingSeconds, progressPercent, message) {
      if (countdownEl) countdownEl.textContent = String(Math.max(0, remainingSeconds));
      if (progressEl && Number.isFinite(progressPercent)) {
        progressEl.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
      }
      if (message && messageEl) messageEl.textContent = message;
    },
    close() {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
  };
}

function waitPreExamCountdownAndSync(overlay, syncPromise, estimateMs) {
  const totalMs = Math.max(MIN_PRE_EXAM_SYNC_MS, estimateMs || DEFAULT_PRE_EXAM_SYNC_MS);
  const startedAt = performance.now();
  let syncFinished = false;
  let syncOk = false;
  syncPromise.then(result => {
    syncFinished = true;
    syncOk = !!(result && result.ok);
  }).catch(() => {
    syncFinished = true;
    syncOk = false;
  });

  return new Promise(resolve => {
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      let remainingMs = Math.max(0, totalMs - elapsed);
      if (syncFinished && remainingMs > 1200) {
        remainingMs = Math.max(0, remainingMs - 900);
      }
      const remainingSecs = Math.ceil(remainingMs / 1000);
      const progress = Math.min(100, (elapsed / totalMs) * 100);
      overlay.update(
        remainingSecs,
        progress,
        syncFinished && remainingSecs <= 1
          ? "اكتملت المزامنة — جاري فتح الامتحان..."
          : remainingSecs <= 0 && !syncFinished
            ? "جاري إنهاء المزامنة..."
            : undefined
      );

      if (remainingSecs <= 0) {
        const finalize = () => {
          overlay.close();
          resolve(syncOk);
        };
        if (syncFinished) {
          finalize();
          return;
        }
        Promise.race([
          syncPromise,
          new Promise(r => setTimeout(() => r({ ok: false }), 1200))
        ]).finally(finalize);
        return;
      }
      setTimeout(tick, syncFinished ? 280 : 1000);
    };
    tick();
  });
}

async function syncDatabaseFromCloud(options = {}) {
  if (!options.forcePull && isCloudPullSuspended()) {
    return { ok: false, skipped: true, reason: "pull_suspended_after_delete" };
  }
  const silent = !!options.silent;
  const scope = options.scope || "full";
  const timeoutMs = options.timeoutMs > 0 ? options.timeoutMs : 0;
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) {
    markCloudSyncLocalOnly("لا يوجد رابط Web App");
    return { ok: false };
  }
  if (!silent) refreshCloudSyncStatusUI("جاري جلب البيانات من Google Sheets...", "syncing");

  const mergeOpts = scope === "exam_start" ? { scope: "exam_start" } : {};
  const pullResult = await fetchAndMergeAllCloudBackups(mergeOpts, timeoutMs);
  const response = pullResult.lastResponse;

  if (pullResult.ok && response && response.data) {
    try {
      applyDeletionTombstonesToLocalState();
      try {
        localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
        localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
      } catch (storageErr) {
        console.warn("[ARABYA] syncDatabaseFromCloud localStorage:", storageErr);
      }
      saveSystemState(false);
      recordCloudSyncOutcome(true, "جلب من السحابة");
      if (systemState.activeView === "teacher-dashboard-view" && typeof refreshTeacherDashboardViews === "function") {
        refreshTeacherDashboardViews({ all: true });
      }
      try {
        window.dispatchEvent(new CustomEvent("arabya-data-changed"));
      } catch (evtErr) {}
      if (response.cloudRevision && window.ArabyaCloudSync) {
        window.ArabyaCloudSync.setStoredCloudRevision(response.cloudRevision);
      }
      updateTeacherAppVersionLabel();
      return {
        ok: true,
        cloudRevision: response.cloudRevision ?? null,
        sheetResultRows: response.sheetResultRows ?? null,
        sheetTotalRows: response.sheetTotalRows ?? null,
        sheetSkippedRows: response.sheetSkippedRows ?? null,
        backupResultRows: response.backupResultRows ?? null,
        totalResults: systemState.results.length
      };
    } catch (err) {
      console.warn("syncDatabaseFromCloud merge failed:", err);
    }
  }
  recordCloudSyncOutcome(false, "تعذّر الجلب من السحابة");
  return { ok: false };
}

function setupArabyaLiveDataRefresh() {
  const refreshTeacherViews = () => {
    if (systemState.activeView !== "teacher-dashboard-view") return;
    reloadSystemStateFromLocalStorage();
    refreshTeacherDashboardViews();
  };
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("arabya_")) refreshTeacherViews();
  });
  window.addEventListener("arabya-data-changed", refreshTeacherViews);
}

function hydrateGoogleSheetsScriptBox() {
  const box = document.getElementById("google-sheets-sync-script-code");
  const hint = document.getElementById("google-sheets-script-load-hint");
  fetch("integrations/google-apps-script-backend.gs", { cache: "no-store" })
    .then(res => (res.ok ? res.text() : null))
    .then(text => {
      if (!text || !box) return;
      box.value = text;
      if (hint) {
        hint.innerHTML = `<span style="color:var(--success);">تم تحميل أحدث كود Apps Script (بناء ${ARABYA_APP_BUILD_VERSION} · قاعدة البيانات ${getPlatformAppVersion()}) من المستودع.</span> انسخه ثم انشر <strong>إصداراً جديداً</strong> في Google Apps Script.`;
      }
    })
    .catch(() => {
      if (hint) {
        hint.innerHTML = `<span style="color:var(--error);">تعذّر تحميل الكود تلقائياً.</span> افتح الملف <code>integrations/google-apps-script-backend.gs</code> من GitHub والصقه يدوياً.`;
      }
    });
}

function getEffectiveExamSyncUrl(exam) {
  return getUnifiedTeacherSyncUrl(exam);
}

window.testExamSync = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;
  const badge = document.getElementById("sync-badge-" + examId);
  const url = getEffectiveExamSyncUrl(exam);
  if (!url) {
    if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">cloud_off</span> <span style="color:var(--error); font-weight:700;">لا يوجد رابط مزامنة موحّد. أضف رابط Web App في تبويب (الربط بـ Google Sheets).</span>`;
    return;
  }
  if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--secondary); animation:spin 1s infinite linear;">sync</span> <span style="color:var(--secondary); font-weight:700;">جاري اختبار الاتصال بجوجل شيت...</span>`;
  const testUrl = url + (url.includes("?") ? "&" : "?") + "action=get_backup";
  fetch(testUrl, { method: "GET", headers: { Accept: "application/json" } })
    .then(res => res.json())
    .then(data => {
      if (data && (data.status === "success" || data.status === "active")) {
        if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--success);">cloud_done</span> <span style="color:var(--success); font-weight:700;">المزامنة تعمل بنجاح ✓</span>`;
      } else if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">error</span> <span style="color:var(--error); font-weight:700;">استجابة غير متوقعة. تأكد من نشر Apps Script كـ Web App للجميع (Anyone).</span>`;
    })
    .catch(() => {
      if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">cloud_off</span> <span style="color:var(--error); font-weight:700;">فشل الاتصال. تحقق من الرابط ومن نشر Apps Script للجميع (Anyone).</span>`;
    });
};


// المزامنة التلقائية مع جوجل شيت (نسخة احتياطية كاملة مع تأخير قصير لتجميع التعديلات)
function autoSyncToCloud() {
  if (typeof scheduleCloudBackupPush === "function") {
    scheduleCloudBackupPush("autoSync");
    return;
  }
  pushCloudBackupNow("autoSync").catch(() => {});
}

function isValidCloudSyncUrl(url) {
  const clean = (url || "").trim();
  return !!(clean && (clean.includes("/macros/s/") || clean.endsWith("/exec")));
}

function collectCloudSyncUrls(extraUrl) {
  const urls = new Set();
  [extraUrl, systemState.config?.googleFormUrl, systemState.activeTeacher?.integrationConfig?.googleFormUrl].forEach(url => {
    if (isValidCloudSyncUrl(url)) urls.add(normalizeArabyaWebAppUrl(url.trim()));
  });
  getGeneralTeacherSyncUrls().forEach(u => urls.add(u));
  return Array.from(urls).filter(Boolean);
}

function countLocalTeacherData() {
  return {
    exams: Array.isArray(systemState.exams) ? systemState.exams.length : 0,
    results: Array.isArray(systemState.results) ? systemState.results.length : 0,
    students: Array.isArray(systemState.students) ? systemState.students.length : 0
  };
}

function countCloudBackupData(data) {
  return {
    exams: Array.isArray(data?.exams) ? data.exams.length : 0,
    results: Array.isArray(data?.results) ? data.results.length : 0,
    students: Array.isArray(data?.students) ? data.students.length : 0
  };
}

function isLikelyFreshLocalDatabase() {
  if (localStorage.getItem("arabya_teacher_has_custom_data") === "yes") return false;
  const activeUsername = systemState.activeTeacher?.username || "";
  const teacherExams = (systemState.exams || []).filter(exam => !exam.teacher || exam.teacher === activeUsername);
  const hasResults = (systemState.results || []).length > 0;
  const hasStudents = (systemState.students || []).length > 1;
  const defaultExamIds = new Set(["arabic_grammar", "arabic_rhetoric", "arabic_literature"]);
  const hasCustomExams = teacherExams.some(exam => !defaultExamIds.has(exam.id));
  return !hasResults && !hasStudents && !hasCustomExams;
}

function markTeacherHasCustomData() {
  try {
    localStorage.setItem("arabya_teacher_has_custom_data", "yes");
  } catch (e) {}
}

function persistCloudSyncUrlForTeacher(url) {
  if (!isValidCloudSyncUrl(url) || !systemState.activeTeacher) return;
  const clean = url.trim();
  systemState.activeTeacher.integrationConfig = systemState.activeTeacher.integrationConfig || {};
  systemState.activeTeacher.integrationConfig.googleFormUrl = clean;
  systemState.config = systemState.config || {};
  systemState.config.googleFormUrl = clean;
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }
  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  localStorage.setItem("arabya_pending_cloud_sync_url", clean);
}

function applyCloudBackupData(data) {
  if (data.teachers && Array.isArray(data.teachers)) {
    const localTeachers = systemState.teachers || [];
    systemState.teachers = mergeTeachersPreservingLocalAuth_(localTeachers, data.teachers);
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    if (systemState.activeTeacher) {
      const restoredTeacher = systemState.teachers.find(t => t.username === systemState.activeTeacher.username)
        || systemState.teachers[0];
      if (restoredTeacher) void loginTeacherObject(restoredTeacher);
    }
  }
  if (data.deletedStudentKeys && Array.isArray(data.deletedStudentKeys)) {
    mergeDeletedStudentKeysFromRemote(data.deletedStudentKeys);
  }
  if (data.deletedResultKeys && Array.isArray(data.deletedResultKeys)) {
    mergeDeletedResultKeysFromRemote(data.deletedResultKeys);
  }
  if (data.exams && Array.isArray(data.exams)) {
    systemState.exams = data.exams;
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  }
  if (data.results && Array.isArray(data.results)) {
    systemState.results = filterOutDeletedResults(
      data.results.filter(r => r && !isResultFromDeletedStudent(r))
    );
    localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    ensureResultRecordIds();
    reconcileStudentsFromCloudData(
      systemState.results,
      Array.isArray(data.students) ? data.students : systemState.students
    );
    systemState.students = filterOutDeletedStudents(systemState.students);
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  } else if (data.students && Array.isArray(data.students)) {
    systemState.students = filterOutDeletedStudents(data.students);
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  }
  if (data.examDeviceRegistry) {
    saveExamDeviceRegistry(mergeRemoteExamDeviceRegistry_(loadExamDeviceRegistry(), data.examDeviceRegistry));
  }
  if (data.questionBanks && window.ArabyaCloudSync) {
    window.ArabyaCloudSync.applyQuestionBanksFromCloud(data.questionBanks);
  }
  if (data.config && typeof data.config === "object") {
    systemState.config = { ...(systemState.config || {}), ...data.config };
    try {
      localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
    } catch (e) {}
  }
  syncPlatformAppVersionFromDatabase(data);
  applyDeletionTombstonesToLocalState();
  markTeacherHasCustomData();
}

function fetchCloudBackupFromUrls(urlList) {
  return new Promise((resolve, reject) => {
    let index = 0;
    function tryFetchNext() {
      if (index >= urlList.length) {
        reject(new Error("No cloud backup found"));
        return;
      }
      const rawUrl = urlList[index++];
      const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_backup";
      fetch(fetchUrl, { method: "GET", headers: { "Accept": "application/json" } })
        .then(res => (res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status))))
        .then(response => {
          if (response && response.status === "success" && response.data) resolve(response.data);
          else tryFetchNext();
        })
        .catch(() => tryFetchNext());
    }
    tryFetchNext();
  });
}

function finishTeacherLoginNavigation(options = {}) {
  navigateToView("teacher-dashboard-view");
  renderExamsList();
  renderTeacherStudentsTable();
  if (options.message) alert(options.message);
}

function syncTeacherDataOnLogin(options = {}) {
  const extraSyncUrl = (options.extraSyncUrl || "").trim();
  if (extraSyncUrl) persistCloudSyncUrlForTeacher(extraSyncUrl);

  const urls = collectCloudSyncUrls(extraSyncUrl);
  if (!urls.length) {
    finishTeacherLoginNavigation(options);
    return Promise.resolve({ synced: false, reason: "no_url" });
  }

  return fetchCloudBackupFromUrls(urls)
    .then(data => {
      const local = countLocalTeacherData();
      const cloud = countCloudBackupData(data);
      const fresh = isLikelyFreshLocalDatabase();
      const cloudHasMore = cloud.exams > local.exams || cloud.results > local.results || cloud.students > local.students;

      if (!fresh && !cloudHasMore) {
        finishTeacherLoginNavigation(options);
        return { synced: false, reason: "local_current" };
      }

      if (!fresh && cloudHasMore && !options.skipConfirm) {
        if (!confirm("وُجدت نسخة أحدث في السحابة. هل تريد استبدال البيانات المحلية على هذا المتصفح بالنسخة السحابية؟")) {
          finishTeacherLoginNavigation(options);
          return { synced: false, reason: "declined" };
        }
      }

      applyCloudBackupData(data);
      finishTeacherLoginNavigation({
        message: options.message || "تم جلب بياناتك من السحابة بنجاح! ستجد امتحاناتك ونتائجك كما على جهازك الآخر."
      });
      return { synced: true };
    })
    .catch(err => {
      console.error("syncTeacherDataOnLogin failed:", err);
      finishTeacherLoginNavigation(options);
      if (isLikelyFreshLocalDatabase()) {
        alert("تعذر جلب البيانات من السحابة.\n\nتأكد من:\n- إدخال رابط Web App الصحيح (ينتهي بـ /exec)\n- رفع نسخة احتياطية سحابية من المتصفح الأصلي\n- نشر Apps Script للوصول Anyone");
      }
      return { synced: false, reason: "fetch_failed" };
    });
}


// حفظ نسخة احتياطية سحابية يدوياً
window.backupDatabaseToCloud = function() {
  const urlList = getCloudBackupTargetUrls();
  if (urlList.length === 0) {
    alert("يرجى إدخال رابط ويب اب (Web App URL) في إعدادات التكامل أو في إعدادات الامتحان أولاً لتمكين النسخ الاحتياطي السحابي!");
    return;
  }

  const dbBackup = typeof buildFullCloudBackupData === "function"
    ? buildFullCloudBackupData()
    : {
      teachers: systemState.teachers,
      students: systemState.students,
      exams: systemState.exams,
      results: systemState.results,
      examDeviceRegistry: typeof loadExamDeviceRegistry === "function" ? loadExamDeviceRegistry() : undefined
    };

  const payload = {
    action: "save_backup",
    data: dbBackup,
    actor: window.ArabyaPlatformSync ? window.ArabyaPlatformSync.getCloudSyncActor() : { username: systemState.activeTeacher?.username || "" }
  };

  let successCount = 0;
  let failCount = 0;
  const total = urlList.length;

  const btnBackup = document.getElementById("btn-cloud-backup");
  const originalText = btnBackup ? btnBackup.innerHTML : "";
  if (btnBackup) {
    btnBackup.disabled = true;
    btnBackup.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري الرفع السحابي...`;
  }

  let completed = 0;
  urlList.forEach(url => {
    postToArabyaWebApp(url, payload).then(() => {
      successCount++;
      checkCompletion();
    }).catch(err => {
      console.error("Manual backup failed for URL:", url, err);
      failCount++;
      checkCompletion();
    });
  });

  function checkCompletion() {
    completed++;
    if (completed === total) {
      if (btnBackup) {
        btnBackup.disabled = false;
        btnBackup.innerHTML = originalText;
      }
      
      autoSyncToCloud();

      if (failCount === 0) {
        alert(`تم حفظ النسخة الاحتياطية سحابياً بنجاح على جميع جداول جوجل شيتس (${successCount}/${total})!`);
      } else if (successCount > 0) {
        alert(`تم حفظ النسخة الاحتياطية على (${successCount}/${total}) من الجداول وفشل الرفع على البعض الآخر.`);
      } else {
        alert("فشل حفظ النسخة الاحتياطية سحابياً. يرجى التحقق من اتصالك بالإنترنت وصلاحيات تطبيق الويب (نشر لـ Anyone).");
      }
    }
  }
};

// استعادة النسخة الاحتياطية سحابياً يدوياً
window.restoreDatabaseFromCloud = async function() {
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) {
    alert("يرجى إدخال رابط ويب اب (Web App URL) أولاً لتمكين استعادة النسخة الاحتياطية!");
    return;
  }
  if (!confirm("تحذير: سيقوم هذا باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستعادة من جوجل شيت. هل ترغب في الاستمرار؟")) return;
  const btnRestore = document.getElementById("btn-cloud-restore");
  const originalText = btnRestore ? btnRestore.innerHTML : "";
  if (btnRestore) { btnRestore.disabled = true; btnRestore.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري جلب البيانات...`; }
  const syncResult = await syncDatabaseFromCloud({ silent: false });
  if (btnRestore) { btnRestore.disabled = false; btnRestore.innerHTML = originalText; }
  if (syncResult && syncResult.ok) {
    finalizeDatabaseImportMessage();
    alert(`تم استعادة قاعدة البيانات: ${systemState.students.length} طالب · ${systemState.results.length} نتيجة · ${systemState.exams.length} امتحان. سيتم إعادة تحميل الصفحة.`);
    location.reload();
  } else {
    alert("فشل استعادة قاعدة البيانات. تأكد من رفع نسخة احتياطية أولاً ونشر Apps Script للجميع (Anyone).");
  }
};
// نسخ كود الربط السحابي (Apps Script)
window.copyGoogleSheetsSyncScript = function() {
  const code = document.getElementById("google-sheets-sync-script-code");
  if (code) {
    navigator.clipboard.writeText(code.value).then(() => {
      alert("تم نسخ كود الربط السحابي بنجاح! اتبع الخطوات الموضحة بالصفحة للصقه في Apps Script ونشره.");
    }).catch(err => {
      code.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          alert("تم نسخ كود الربط السحابي بنجاح!");
        } else {
          alert("فشل نسخ الكود تلقائياً، يرجى نسخه يدوياً.");
        }
      } catch (e) {
        alert("فشل نسخ الكود تلقائياً، يرجى نسخه يدوياً.");
      }
    });
  }
};

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

function getAppBaseUrl() {
  const cleanHref = window.location.href.split('?')[0].split('#')[0];
  if (window.location.protocol === "file:") {
    return cleanHref;
  }

  let origin = window.location.origin;
  let pathname = window.location.pathname;

  if (pathname.endsWith("index.html")) {
    pathname = pathname.replace("index.html", "");
  }

  const pathParts = pathname.split('/').filter(Boolean);
  const knownExamIds = new Set((systemState.exams || []).map(exam => String(exam.id).toLowerCase()));
  while (pathParts.length && knownExamIds.has(pathParts[pathParts.length - 1].toLowerCase())) {
    pathParts.pop();
  }

  const basePath = pathParts.length ? `/${pathParts.join('/')}/` : "/";
  return `${origin}${basePath}`;
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
  if (typeof window.renderQuestionBankTab === "function") window.renderQuestionBankTab();
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
  void fetchPlatformAppVersionFromCloudMeta();

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

  const bankCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
  const configuredCount = getConfiguredQuestionCount(exam);
  const requestedCount = parseInt(exam.questionCount, 10);
  const displayMode = exam.shuffleQuestions === false ? "ترتيبي" : "عشوائي";
  const summary = document.createElement("div");
  summary.className = "question-bank-editor-summary";
  summary.style.marginBottom = "1rem";
  summary.style.padding = "0.85rem 1rem";
  summary.style.borderColor = "rgba(20,184,166,0.25)";
  summary.style.background = "rgba(20,184,166,0.04)";
  summary.innerHTML =
    `<div style="font-size:0.88rem; line-height:1.7; color:var(--text-muted);">` +
    `<strong style="color:var(--secondary);">بنك الأسئلة:</strong> ${bankCount} سؤالاً — يمكنك إضافة أي عدد من الأسئلة بلا حد أقصى.` +
    `<br><strong style="color:var(--accent);">المعروض للطالب:</strong> ` +
    (Number.isFinite(requestedCount) && requestedCount > 0
      ? `${requestedCount} سؤالاً (${displayMode}${bankCount && requestedCount > bankCount ? ` — سيُعرض ${configuredCount || bankCount} حتى يكتمل البنك` : ""})`
      : `كل البنك (${bankCount} سؤال — ${displayMode})`) +
    `</div>`;
  container.appendChild(summary);

  if (exam.questions.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "text-align:center; color: var(--text-muted); padding: 2rem;";
    empty.textContent = "لا توجد أسئلة مضافة في هذا الامتحان بعد. أضف سؤالاً بالأسفل!";
    container.appendChild(empty);
    return;
  }

  exam.questions.forEach((q, index) => {
    const card = document.createElement("div");
    card.className = "exam-builder-card exam-question-edit-card";
    card.dataset.questionType = q.type || "multiple";
    card.dataset.questionIndex = String(index);
    
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

function syncExamQuestionsFromEditorDom(exam) {
  if (!exam) return [];
  const cards = document.querySelectorAll("#editor-questions-list .exam-question-edit-card");
  const updatedQuestions = [];

  cards.forEach((card, index) => {
    const textInput = card.querySelector(".edit-q-text");
    if (!textInput) return;

    const questionText = textInput.value.trim();
    const pointsInput = card.querySelector(".edit-q-points");
    const questionPoints = pointsInput ? parseFloat(pointsInput.value) || 10 : 10;
    const timeInput = card.querySelector(".edit-q-time");
    const questionTimeSeconds = timeInput ? parseInt(timeInput.value, 10) || 60 : 60;
    const typeInput = card.dataset.questionType || exam.questions[index]?.type || "multiple";

    let options = [];
    let correctAnswer = 0;

    if (typeInput === "essay") {
      options = [];
      correctAnswer = "";
    } else {
      card.querySelectorAll(".edit-q-option").forEach(input => {
        options.push(input.value.trim());
      });
      const qIndex = card.dataset.questionIndex ?? String(index);
      const checkedRadio = card.querySelector(`input[name="edit-correct-${qIndex}"]:checked`);
      correctAnswer = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;
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

  updatedQuestions.forEach((q, idx) => { q.id = idx + 1; });
  exam.questions = updatedQuestions;
  return updatedQuestions;
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
    const countCheck = parseDisplayedQuestionCountInput(rawQuestionCount);
    if (!countCheck.ok) {
      alert(countCheck.message);
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

window.saveExamMetaSettingsOnly = function() {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;
  if (!canTeacherManageExam(exam)) {
    alert("ليس لديك صلاحية تعديل إعدادات هذا الامتحان.");
    return;
  }
  if (!applyExamMetaFromEditor(exam, { requireAcademic: true })) return;
  saveSystemState(true);
  document.getElementById("editor-exam-title").innerText = exam.title;
  renderExamAllowedIpsList(exam);
  alert("تم حفظ إعدادات الامتحان بنجاح.");
  renderExamsList();
};

function saveAllEditedQuestions() {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;
  if (!canTeacherManageExam(exam)) {
    alert("ليس لديك صلاحية تعديل هذا الامتحان.");
    return;
  }

  if (!applyExamMetaFromEditor(exam, { requireAcademic: true })) return;

  syncExamQuestionsFromEditorDom(exam);
  sanitizeQuestionConfig(exam);
  saveSystemState(true);
  
  // تحديث مؤشر حالة المزامنة بعد حفظ رابط الامتحان المخصص
  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (indicator) {
    const urls = new Set();
    if (systemState.config && systemState.config.googleFormUrl) {
      const u = systemState.config.googleFormUrl.trim();
      if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
    }
    if (Array.isArray(systemState.exams)) {
      systemState.exams.forEach(ex => {
        if (ex.googleFormUrl) {
          const u = ex.googleFormUrl.trim();
          if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
        }
      });
    }
    if (urls.size > 0) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مهيأة وجاهزة للاتصال (${urls.size} من الجداول)`;
    }
  }
  
  alert("تم تعديل وحفظ بيانات الامتحان وكافة الأسئلة بنجاح!");
  
  // إعادة عرض
  document.getElementById("editor-exam-title").innerText = exam.title;
  renderQuestionsForEdit(exam);
}

window.addOptionToQuestion = function(qIndex) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  syncExamQuestionsFromEditorDom(exam);
  exam.questions[qIndex].options.push(`خيار جديد ${exam.questions[qIndex].options.length + 1}`);
  renderQuestionsForEdit(exam);
};

window.removeOptionFromQuestion = function(qIndex, optIndex) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  syncExamQuestionsFromEditorDom(exam);

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

  syncExamQuestionsFromEditorDom(exam);

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
    syncExamQuestionsFromEditorDom(exam);
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
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAppsScriptString(str) {
  if (!str) return "";
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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

// ==========================================
// 7. بوابة الطالب والامتحان الفعلي مع إتاحة الوصول (Accessibility)
// ==========================================

function populateExamSelectionList() {
  const select = document.getElementById("student-exam-select");
  if (!select) return;

  select.disabled = false;
  select.innerHTML = `<option value="" disabled selected>-- اختر الامتحان الذي ترغب في أدائه --</option>`;
  
  // تصفية الامتحانات لتظهر فقط امتحانات المعلم المرتبط بالرابط إن وجد
  let filteredExams = systemState.exams;
  if (systemState.targetTeacherUsername) {
    filteredExams = systemState.exams.filter(exam => exam.teacher === systemState.targetTeacherUsername || !exam.teacher);
  }
  if (systemState.lockedExamId) {
    filteredExams = filteredExams.filter(exam => exam.id === systemState.lockedExamId);
  }

  if (filteredExams.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    opt.innerText = "لا توجد امتحانات متاحة حالياً. يرجى الرجوع للمعلم.";
    select.appendChild(opt);
    select.disabled = true;
    select.removeAttribute("aria-describedby");
    return;
  }

  filteredExams.forEach(exam => {
    const opt = document.createElement("option");
    opt.value = exam.id;
    const expired = isExamPastDeadline(exam);
    opt.innerText = expired
      ? `${exam.title} (${exam.subject}) — منتهي الموعد`
      : `${exam.title} (${exam.subject})`;
    if (expired) {
      opt.disabled = true;
    }
    select.appendChild(opt);
  });

  if (systemState.lockedExamId) {
    select.value = systemState.lockedExamId;
    select.disabled = true;
    select.setAttribute("aria-describedby", "direct-exam-lock-note");
  }
}

async function validateStudentAndStart() {
  reloadSystemStateFromLocalStorage();
  const startBtn = document.getElementById("student-start-exam-btn");
  const prevBtnText = startBtn ? startBtn.innerHTML : "";

  const name = document.getElementById("student-fullname-input").value.trim();
  const id = document.getElementById("student-id-input").value.trim();
  const rawCode = document.getElementById("student-access-code").value.trim();
  const email = document.getElementById("student-email-input")?.value.trim() || "";
  const mobile = document.getElementById("student-mobile-input")?.value.trim() || "";
  const examId = document.getElementById("student-exam-select").value;
  const normalizedId = normalizeStudentId(id);
  const inputCode = sanitizeStudentCodeInput(rawCode);
  const hasCodeInput = rawCode !== "";

  if (!name) {
    alert("يرجى إدخال اسمك بالكامل للبدء!");
    return;
  }
  if (hasCodeInput && !isValidStudentCodeFormat(rawCode)) {
    alert("كود الاشتراك غير صالح. استخدم حروفاً أو أرقاماً أو كليهما.");
    return;
  }
  if (id && !isValidStudentIdFormat(id)) {
    alert("معرف الهوية غير صالح. استخدم حروفاً أو أرقاماً أو كليهما.");
    return;
  }
  if (!examId) {
    alert("يرجى اختيار الامتحان المستهدف!");
    return;
  }

  let selectedExam = systemState.exams.find(e => e.id === examId);
  if (!selectedExam) {
    alert("الامتحان المختار غير متوفر!");
    return;
  }
  sanitizeQuestionConfig(selectedExam);

  if (selectedExam.questions.length === 0) {
    alert("عذراً، هذا الامتحان لا يحتوي على أي أسئلة مضافة بعد!");
    return;
  }

  if (isExamPastDeadline(selectedExam)) {
    alert(getExamDeadlineBlockMessage(selectedExam));
    return;
  }

  let matchedStudent = null;
  if (hasStudentCode(inputCode)) {
    matchedStudent = findStudentByCode(inputCode, { studentId: normalizedId, name });
  }
  if (!matchedStudent && normalizedId) {
    matchedStudent = findStudentById(normalizedId);
  }
  if (!matchedStudent && !hasStudentCode(inputCode) && !normalizedId) {
    const byName = findStudentsByName(name);
    if (byName.length === 1) {
      matchedStudent = byName[0];
    } else if (byName.length > 1) {
      alert("يوجد أكثر من طالب بنفس الاسم. يرجى إدخال معرف الهوية أو كود الاشتراك للتمييز.");
      return;
    }
  }

  const identityCheck = validateStudentIdentityInput(id, rawCode, { name });
  if (!identityCheck.ok) {
    alert(identityCheck.message);
    return;
  }

  const studentRecord = upsertStudentRecord({
    name,
    id: normalizedId,
    code: inputCode,
    email,
    mobile
  });

  systemState.currentStudent = {
    name: studentRecord.name,
    id: studentRecord.id || "",
    accessCode: studentRecord.code || "",
    studentKey: studentRecord.studentKey || getStudentLookupKey(studentRecord),
    email: studentRecord.email || "",
    mobile: studentRecord.mobile || ""
  };

  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  const studentMatchContext = buildStudentMatchContext(systemState.currentStudent);
  const blockingResult = findBlockingExamResult(studentLookupKey, examId, studentMatchContext);
  if (blockingResult) {
    alert(getExamBlockingMessage(blockingResult));
    return;
  }

  const activeRetakeGrant = findActiveRetakeGrant(studentLookupKey, examId, studentMatchContext);
  if (activeRetakeGrant) {
    const retakeConfirm = confirm(`المعلم سمح لك بإعادة أداء امتحان "${selectedExam.title}". هل تريد البدء الآن؟`);
    if (!retakeConfirm) return;
  }

  if (getArabyaWebAppUrls().length > 0) {
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري التجهيز...`;
    }
    const estimateMs = getPreExamSyncEstimateMs();
    const overlay = showStudentExamPrepareOverlay(estimateMs);
    const syncStarted = performance.now();
    const syncPromise = studentExamGatePrefetchPromise || syncDatabaseFromCloud({
      silent: true,
      scope: "exam_start",
      timeoutMs: 8000
    });
    try {
      await waitPreExamCountdownAndSync(overlay, syncPromise, estimateMs);
    } catch (prepErr) {
      console.warn("[ARABYA] pre-exam prepare failed:", prepErr);
      overlay.close();
    }
    recordPreExamSyncDuration(performance.now() - syncStarted);
    studentExamGatePrefetchPromise = null;
    reloadSystemStateFromLocalStorage();

    selectedExam = systemState.exams.find(e => e.id === examId);
    if (!selectedExam) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert("الامتحان المختار غير متوفر بعد المزامنة!");
      return;
    }
    sanitizeQuestionConfig(selectedExam);
    if (selectedExam.questions.length === 0) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert("عذراً، هذا الامتحان لا يحتوي على أي أسئلة مضافة بعد!");
      return;
    }
    if (isExamPastDeadline(selectedExam)) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert(getExamDeadlineBlockMessage(selectedExam));
      return;
    }
    const blockingAfterSync = findBlockingExamResult(studentLookupKey, examId, studentMatchContext);
    if (blockingAfterSync) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert(getExamBlockingMessage(blockingAfterSync));
      return;
    }
  }

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear;">hourglass_top</span> جاري التحقق من الجهاز...`;
  }

  let deviceProfile = null;
  try {
    const deviceCheck = await enforceExamDeviceBinding(studentLookupKey, systemState.currentStudent.name, examId, studentMatchContext);
    if (!deviceCheck.ok) {
      alert(deviceCheck.message);
      return;
    }
    deviceProfile = deviceCheck.profile;
    mergeDeviceProfileIntoStudent(studentRecord, deviceProfile);
    systemState.currentStudent.deviceId = deviceProfile.deviceId;
    systemState.currentStudent.lastKnownIp = deviceProfile.clientIp || "";
    systemState.examDeviceProfile = deviceProfile;
    saveStudentsToLocalStorage();
    saveSystemState(false);
  } catch (deviceErr) {
    console.error("[ARABYA] device binding failed:", deviceErr);
    alert("تعذر التحقق من بصمة الجهاز. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.");
    return;
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = prevBtnText || `الانتقال لبدء الامتحان`;
    }
  }

  systemState.currentExam = selectedExam;

  systemState.shuffledQuestions = buildRuntimeQuestionsForExam(selectedExam);
  systemState.currentExamRuntime = calculateRuntimeExamMeta(systemState.shuffledQuestions);

  systemState.currentQuestionIndex = 0;
  systemState.studentAnswers = {};
  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;
  systemState.cheatAttemptLog = [];
  systemState.examMaxCheatAttemptsAllowed = getExamMaxCheatAttempts(selectedExam);
  markExamAntiCheatStarted();

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));
  saveActiveStudentSession();
  updateLiveIncompleteResult();

  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
  requestSecureExamMode();
  showExamSecurityNotice();
}

function showExamSecurityNotice() {
  const hint = document.getElementById("runner-mobile-exam-hint");
  if (!hint) return;
  hint.classList.remove("hidden");
  const cat = getExamDeviceCategory();
  const graceSec = Math.round(getExamAntiCheatGraceMs() / 1000);
  const deviceLabel = cat === "mobile" ? "الهاتف" : cat === "tablet" ? "التابلت" : "الكمبيوتر";
  hint.innerHTML =
    `<span class="material-icons" style="vertical-align:middle; font-size:1rem;">security</span> ` +
    `وضع تأمين الامتحان مفعّل على ${deviceLabel}: لا تغادر التبويب ولا تفتح ChatGPT أو تطبيقات أخرى. ` +
    `أي تبديل تبويب أو مغادرة الصفحة يُسجَّل كمحاولة غش (حسب حد المعلم) بعد ${graceSec} ثانية. ` +
    `لن يظهر لك عدد المحاولات — تظهر للمعلم فقط في سجل النتائج. ` +
    `يُمنع استخدام نفس الجهاز لطالبين مختلفين.`;
}

function renderRunnerQuestion() {
  const question = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  
  document.getElementById("runner-current-num").innerText = systemState.currentQuestionIndex + 1;
  document.getElementById("runner-total-num").innerText = systemState.shuffledQuestions.length;
  
  const progress = ((systemState.currentQuestionIndex + 1) / systemState.shuffledQuestions.length) * 100;
  document.getElementById("runner-progress-fill").style.width = `${progress}%`;

  const exam = systemState.currentExam;
  const examTotalScore = getCurrentExamTotalScore();
  const qPoints = question.points !== undefined ? question.points : 10;

  document.getElementById("runner-exam-title").innerHTML = `
    ${exam.title} 
    <div style="font-size:0.75rem; color:var(--accent); font-weight:normal; margin-top:0.25rem;">
      الجامعة: ${exam.university} | الكلية: ${exam.faculty} | الفرقة: ${exam.level} | النوع: ${exam.examType || 'أعمال سنة'} | المجموع: ${examTotalScore} درجة
    </div>
  `;

  // عرض نص السؤال مع نقاط السؤال الفردي وتفعيل التركيز من أجل قارئ الشاشة (Blind Students Focus Management)
  const qTextEl = document.getElementById("runner-question-text");
  qTextEl.innerText = `${question.question} (${qPoints} درجات)`;
  qTextEl.setAttribute("tabindex", "-1");
  if (getExamDeviceCategory() === "desktop") {
    qTextEl.focus();
  }

  const optionsWrapper = document.getElementById("runner-options-list");
  optionsWrapper.innerHTML = "";

  if (question.type === "essay") {
    const container = document.createElement("div");
    container.style.width = "100%";

    const textarea = document.createElement("textarea");
    textarea.className = "essay-textarea";
    textarea.placeholder = "اكتب إجابتك النصية الكاملة والتفصيلية هنا...";
    textarea.setAttribute("aria-label", `إجابة السؤال المقالي: ${question.question}`);
    
    if (systemState.studentAnswers[question.id] !== undefined) {
      textarea.value = systemState.studentAnswers[question.id];
    }

    const counter = document.createElement("div");
    counter.className = "char-counter";
    counter.innerText = "عدد الحروف المكتوبة: 0";

    textarea.addEventListener("input", (e) => {
      systemState.studentAnswers[question.id] = e.target.value;
      counter.innerText = `عدد الحروف المكتوبة: ${e.target.value.length}`;
      saveActiveStudentSession();
      updateLiveIncompleteResult();
    });

    textarea.addEventListener("paste", e => e.preventDefault());
    textarea.addEventListener("copy", e => e.preventDefault());

    container.appendChild(textarea);
    container.appendChild(counter);
    optionsWrapper.appendChild(container);
  } else {
    // أسئلة الاختيارات المتعددة (تدعم التنقل باللوحة وقارئ الشاشة بـ WAI-ARIA)
    question.options.forEach((optText, idx) => {
      const card = document.createElement("div");
      card.className = "option-card";
      card.dataset.index = idx;
      
      // تهيئة للإتاحة للطلاب المكفوفين
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `خيار ${idx+1}: ${optText}`);

      const marker = document.createElement("div");
      marker.className = "option-marker";
      const letterMarkers = ["أ", "ب", "ج", "د", "هـ", "و", "ز"];
      marker.innerText = letterMarkers[idx] || (idx + 1);

      const text = document.createElement("div");
      text.className = "option-text";
      text.innerText = optText;

      card.appendChild(marker);
      card.appendChild(text);

      if (systemState.studentAnswers[question.id] === idx) {
        card.classList.add("selected");
        card.setAttribute("aria-pressed", "true");
      } else {
        card.setAttribute("aria-pressed", "false");
      }

      // اختيار عبر الضغط بالفأرة
      card.addEventListener("pointerdown", () => markExamClickGrace());
      card.addEventListener("click", () => selectRunnerOption(idx));
      
      // اختيار عبر لوحة المفاتيح (Enter أو المسافة) للطلاب المكفوفين
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectRunnerOption(idx);
          card.focus(); // إعادة تركيز الكارت لتنطق قارئة الشاشة التحديد
        }
      });

      optionsWrapper.appendChild(card);
    });
  }

  const nextBtn = document.getElementById("runner-next-btn");
  if (systemState.currentQuestionIndex === systemState.shuffledQuestions.length - 1) {
    nextBtn.innerHTML = `إنهاء الامتحان وتسليم النتيجة <span class="material-icons">send</span>`;
    nextBtn.setAttribute("aria-label", "إنهاء الامتحان وتسليم النتيجة");
  } else {
    nextBtn.innerHTML = `السؤال التالي <span class="material-icons">arrow_back</span>`;
    nextBtn.setAttribute("aria-label", "الانتقال للسؤال التالي");
  }

  systemState.timer.timeLimit = getQuestionTimeSeconds(question, exam);
}

function selectRunnerOption(index) {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  systemState.studentAnswers[currentQ.id] = index;

  const cards = document.querySelectorAll("#runner-options-list .option-card");
  cards.forEach(card => {
    if (parseInt(card.dataset.index) === index) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    } else {
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
    }
  });

  saveActiveStudentSession();
  updateLiveIncompleteResult();
}

function startRunnerTimer() {
  startRunnerTimerWithTime(systemState.timer.timeLimit);
}

function startRunnerTimerWithTime(seconds) {
  systemState.timer.timeRemaining = seconds;
  updateRunnerTimerUI();

  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const fillCircle = document.getElementById("runner-timer-circle");
  const container = document.getElementById("runner-timer-container");
  
  if (fillCircle) fillCircle.style.strokeDashoffset = 0;
  if (container) container.classList.remove("timer-warning");

  systemState.timer.intervalId = setInterval(() => {
    systemState.timer.timeRemaining--;
    updateRunnerTimerUI();
    saveActiveStudentSession(); // حفظ التقدم مع التوقيت المتبقي

    if (systemState.timer.timeRemaining <= 10) {
      if (container) container.classList.add("timer-warning");
    }

    if (systemState.timer.timeRemaining <= 0) {
      clearInterval(systemState.timer.intervalId);
      const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
      if (systemState.studentAnswers[currentQ.id] === undefined) {
        if (currentQ.type === "essay") {
          systemState.studentAnswers[currentQ.id] = "(لم يتم كتابة إجابة - انتهى الوقت)";
        } else {
          systemState.studentAnswers[currentQ.id] = -1;
        }
      }
      runnerNextQuestion(true);
    }
  }, 1000);
}

function updateRunnerTimerUI() {
  document.getElementById("runner-timer-text").innerText = systemState.timer.timeRemaining;
  const fillCircle = document.getElementById("runner-timer-circle");
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = systemState.timer.timeRemaining / systemState.timer.timeLimit;
  fillCircle.style.strokeDashoffset = circumference - (progress * circumference);

  // إعلانات صوتية للمكفوفين عبر Aria-Live Assertive لتفادي التحديث المتكرر
  const announcementEl = document.getElementById("runner-voice-announcement");
  if (announcementEl) {
    if (systemState.timer.timeRemaining === 30) {
      announcementEl.innerText = "انتبه، متبقي ثلاثون ثانية فقط للإجابة.";
    } else if (systemState.timer.timeRemaining === 10) {
      announcementEl.innerText = "تحذير، متبقي عشر ثوانٍ وينتقل الامتحان تلقائياً.";
    } else if (systemState.timer.timeRemaining === 5) {
      announcementEl.innerText = "خمس ثوانٍ متبقية.";
    }
  }
}

function announceExamAccessibility(message) {
  const live = document.getElementById("runner-voice-announcement");
  if (live) {
    live.textContent = "";
    setTimeout(() => { live.textContent = message; }, 30);
  }
}

function runnerNextQuestion(isAuto = false) {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  
  if (!isAuto && systemState.studentAnswers[currentQ.id] === undefined) {
    alert("يرجى اختيار إجابة أو كتابة النص المطلوب قبل الانتقال!");
    announceExamAccessibility("يرجى اختيار إجابة قبل الانتقال للسؤال التالي.");
    return;
  }

  clearInterval(systemState.timer.intervalId);
  
  // ترحيل البيانات الحية غير المكتملة إلى قاعدة البيانات وجداول جوجل شيتس
  saveActiveStudentSession();
  updateLiveIncompleteResult();

  if (systemState.currentQuestionIndex < systemState.shuffledQuestions.length - 1) {
    systemState.currentQuestionIndex++;
    renderRunnerQuestion();
    startRunnerTimer();
    announceExamAccessibility(`السؤال ${systemState.currentQuestionIndex + 1} من ${systemState.shuffledQuestions.length}`);
  } else {
    announceExamAccessibility("جاري تسليم الامتحان وحساب النتيجة.");
    submitFinishedExam();
  }
}

// حساب وتوثيق النتيجة مع هيكل الدرجات النسبية المطور
function submitFinishedExam() {
  systemState.isExamActive = false;
  releaseSecureExamMode();
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  const submitContext = buildStudentMatchContext(systemState.currentStudent);
  const blockingOnSubmit = findBlockingExamResult(studentLookupKey, systemState.currentExam.id, submitContext);
  if (blockingOnSubmit) {
    localStorage.removeItem("arabya_active_student_session");
    alert(getExamBlockingMessage(blockingOnSubmit));
    navigateToView("student-login-view");
    return;
  }
  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === systemState.currentExam.id && r.status === "incomplete"));
  localStorage.removeItem("arabya_active_student_session");

  let totalEarnedPoints = 0;
  let totalObjectivePoints = 0;
  let totalEssayPoints = 0;
  let objectiveQuestionsCount = 0;
  let correctObjectiveCount = 0;
  let hasEssay = false;
  let detailsLog = [];

  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};

  systemState.shuffledQuestions.forEach(q => {
    const studentAns = studentAnswersMap[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;

    if (q.type === "essay") {
      hasEssay = true;
      totalEssayPoints += qPoints;
      const ansText = studentAns || "(لم يكتب الطالب إجابة)";
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} \n إجابة الطالب: ${ansText}\n-----------------`);
      questionScoresMap[q.id] = 0;
    } else {
      objectiveQuestionsCount++;
      totalObjectivePoints += qPoints;
      const isCorrect = studentAns === q.correctAnswer;
      if (isCorrect) {
        correctObjectiveCount++;
        totalEarnedPoints += qPoints;
        questionScoresMap[q.id] = qPoints;
      } else {
        questionScoresMap[q.id] = 0;
      }
      let studentAnsText = "لم تتم الإجابة";
      if (studentAns === -1) studentAnsText = "انتهى الوقت";
      else if (studentAns === -2) studentAnsText = "ملغي (غش)";
      else if (studentAns !== undefined) studentAnsText = q.options[studentAns];
      detailsLog.push(`س (وزنها ${qPoints} نقاط): ${q.question} | إجابة الطالب: ${studentAnsText} | الصحيحة: ${q.options[q.correctAnswer]} [${isCorrect ? '✓' : '✗'}]`);
    }
  });

  const examTotalScore = getCurrentExamTotalScore();
  let scaledScore = 0;
  if (totalObjectivePoints > 0) {
    scaledScore = (totalEarnedPoints / totalObjectivePoints) * examTotalScore;
    scaledScore = Math.round(scaledScore * 100) / 100;
  }

  let scoreString = `${correctObjectiveCount}/${objectiveQuestionsCount} أسئلة موضوعية (تعادل ${scaledScore} من ${examTotalScore} كحد أقصى)`;
  if (hasEssay) {
    scoreString += ` + أسئلة مقالية بقيمة ${totalEssayPoints} نقاط بانتظار تصحيح المعلم`;
  }

  const detailsFormatted = detailsLog.join("\n");
  const resultObj = {
    recordId: createRecordId("result"),
    savedAt: Date.now(),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode || "",
    studentLookupKey,
    email: systemState.currentStudent.email || "",
    mobile: systemState.currentStudent.mobile || "",
    examTitle: systemState.currentExam.title,
    examId: systemState.currentExam.id,
    university: systemState.currentExam.university,
    faculty: systemState.currentExam.faculty,
    level: systemState.currentExam.level,
    examType: systemState.currentExam.examType,
    score: scoreString,
    details: detailsFormatted,
    timestamp: new Date().toLocaleString("ar-EG"),
    studentAnswers: studentAnswersMap,
    questionScores: questionScoresMap,
    maxScore: examTotalScore,
    presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions)),
    status: "completed",
    ...buildResultDeviceFields(systemState.examDeviceProfile),
    ...buildCheatTrackingFields(),
    allowRetake: false
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  if (systemState.examDeviceProfile && studentLookupKey && systemState.currentExam?.id) {
    registerExamDeviceBinding(
      systemState.examDeviceProfile,
      studentLookupKey,
      systemState.currentStudent.name,
      systemState.currentExam.id
    );
  }
  saveSystemState(false);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
  if (archivedAttempts && archivedAttempts.length) {
    syncRetakeAffectedResultsToCloud(archivedAttempts);
  }
  void sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("exam_submit");
  }
}

function showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore) {
  navigateToView("student-result-view");

  const syncEl = document.getElementById("runner-res-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري حفظ ومزامنة نتيجتك مع Google Sheets...`;
  }
  
  const scoreNumEl = document.getElementById("runner-res-score");
  const totalEl = document.getElementById("runner-res-total");
  
  scoreNumEl.innerText = scaledScore;
  totalEl.innerText = examTotalScore;

  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id || "--";
  document.getElementById("runner-res-title").innerText = `${systemState.currentExam.title} [${systemState.currentExam.examType}]`;

  const statusEl = document.getElementById("runner-res-status");
  if (hasEssay) {
    statusEl.innerText = `تم حفظ إجابتك بنجاح! نتيجتك في الأسئلة الموضوعية هي: ${scaledScore} من ${examTotalScore}. بانتظار مراجعة وتصحيح المعلم للأسئلة المقالية المتبقية.`;
    statusEl.style.color = "var(--accent)";
  } else {
    if (scaledScore >= (examTotalScore / 2)) {
      statusEl.innerText = `تهانينا، لقد اجتزت الامتحان بنجاح وحققت: ${scaledScore} من المجموع النهائي البالغ ${examTotalScore} درجات.`;
      statusEl.style.color = "var(--secondary)";
    } else {
      statusEl.innerText = `للأسف، لم تجتز النسبة المطلوبة. درجتك هي: ${scaledScore} من ${examTotalScore} درجات.`;
      statusEl.style.color = "var(--error)";
    }
  }
}

function buildAddResultCloudPayload(scoreString, details, resultRecordId = "", resultObj = null) {
  const exam = systemState.currentExam;
  const payload = {
    action: "add_result",
    recordId: resultRecordId,
    timestamp: resultObj?.timestamp || new Date().toLocaleString("ar-EG"),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    subscriptionCode: systemState.currentStudent.accessCode,
    studentLookupKey: resultObj?.studentLookupKey || getStudentLookupKey(systemState.currentStudent),
    email: resultObj?.email || systemState.currentStudent.email || "",
    mobile: resultObj?.mobile || systemState.currentStudent.mobile || "",
    examTitle: exam ? exam.title : "امتحان",
    examId: exam ? exam.id : "",
    university: exam ? (exam.university || "") : (resultObj?.university || ""),
    faculty: exam ? (exam.faculty || "") : (resultObj?.faculty || ""),
    level: exam ? (exam.level || "") : (resultObj?.level || ""),
    examType: exam ? (exam.examType || "") : (resultObj?.examType || ""),
    status: resultObj?.status || "completed",
    score: scoreString,
    details: details,
    maxScore: resultObj?.maxScore || getCurrentExamTotalScore(),
    attemptNumber: resultObj?.attemptNumber ?? "",
    ...buildResultCloudRetakeFields(resultObj),
    ...buildResultDeviceFields(resultObj || systemState.examDeviceProfile),
    ...(resultObj ? buildResultCloudIpReleaseFields(resultObj) : {}),
    ...(resultObj ? buildCheatTrackingFieldsFromResult(resultObj) : buildCheatTrackingFields())
  };
  return buildSlimResultCloudPayload(payload);
}

async function postAddResultToCloudUrls(urlList, slimPayload) {
  const targets = [...new Set((urlList || []).map(normalizeArabyaWebAppUrl).filter(Boolean))];
  if (!targets.length) return { ok: false, successCount: 0, total: 0 };
  const outcomes = await Promise.all(targets.map(async url => {
    try {
      await postToArabyaWebApp(url, slimPayload);
      return true;
    } catch (err) {
      console.warn("[ARABYA] add_result failed, retry no-cors:", url, err);
      try {
        return await postToArabyaWebAppNoCors(url, slimPayload);
      } catch (e2) {
        return false;
      }
    }
  }));
  const successCount = outcomes.filter(Boolean).length;
  return { ok: successCount > 0, successCount, total: targets.length };
}

// المزامنة مع جوجل شيتس - ترسل نتيجة الطالب فور الانتهاء من الامتحان
async function sendResultToGoogleSheets(scoreString, details, resultRecordId = "", resultObj = null) {
  const exam = systemState.currentExam;
  const statusEl = document.getElementById("runner-res-sync-status");
  const syncUrl = getExamResultSyncUrl(exam);
  const urlList = syncUrl ? [syncUrl] : [];

  if (urlList.length === 0) {
    const traditionalUrl = getUnifiedTeacherSyncUrl(exam) || (systemState.config ? systemState.config.googleFormUrl || "" : "");
    const isTraditional = traditionalUrl && traditionalUrl.includes("docs.google.com");
    if (isTraditional) {
      if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري الإرسال إلى Google Form...`;
      const entryName = (exam && exam.entryName) || systemState.config.entryName || "";
      const entryId   = (exam && exam.entryId) || systemState.config.entryId || "";
      const entryCode = (exam && exam.entryCode) || systemState.config.entryCode || "";
      const entryScore = (exam && exam.entryScore) || systemState.config.entryScore || "";
      const entryDetails = (exam && exam.entryDetails) || systemState.config.entryDetails || "";
      const formData = new URLSearchParams();
      if (entryName) formData.append(entryName, systemState.currentStudent.name);
      if (entryId)   formData.append(entryId, systemState.currentStudent.id);
      if (entryCode) formData.append(entryCode, `${exam ? exam.title : ""} | كود: ${systemState.currentStudent.accessCode}`);
      if (entryScore) formData.append(entryScore, scoreString);
      if (entryDetails) formData.append(entryDetails, details);
      fetch(traditionalUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formData.toString() })
        .then(() => { if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تم إرسال النتيجة إلى Google Form بنجاح!`; })
        .catch(() => { if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> فشل الإرسال. تم حفظ النتيجة محلياً.`; });
    } else if (statusEl) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> تم حفظ النتيجة محلياً ✓ (لم يتم ربط Google Sheets بعد)`;
    }
    return;
  }

  if (statusEl) {
    statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة نتيجتك مع Google Sheets...`;
  }

  const slimPayload = buildAddResultCloudPayload(scoreString, details, resultRecordId, resultObj);

  try {
    const [postResult, backupOk] = await Promise.all([
      postAddResultToCloudUrls(urlList, slimPayload),
      pushCloudBackupNow("exam_submit")
    ]);
    if (!statusEl) return;
    if (postResult.ok || backupOk) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تم حفظ نتيجتك ومزامنتها مع Google Sheets بنجاح ✓`;
    } else if (postResult.successCount > 0) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> مزامنة جزئية (${postResult.successCount}/${postResult.total}). تم الحفظ محلياً.`;
    } else {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> تعذّرت المزامنة السحابية. نتيجتك محفوظة على هذا الجهاز — سيتم إعادة المحاولة عند عودة الاتصال.`;
      if (window.ArabyaOfflineQueue) {
        urlList.forEach(url => window.ArabyaOfflineQueue.enqueue(normalizeArabyaWebAppUrl(url), slimPayload));
      }
    }
  } catch (syncErr) {
    console.error("[ARABYA] sendResultToGoogleSheets:", syncErr);
    if (statusEl) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">cloud_off</span> تم حفظ النتيجة محلياً. جاري إعادة محاولة المزامنة...`;
    }
    if (window.ArabyaOfflineQueue) {
      urlList.forEach(url => window.ArabyaOfflineQueue.enqueue(normalizeArabyaWebAppUrl(url), slimPayload));
    }
    if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
      scheduleCloudBackupPush.immediate("exam_submit_retry");
    }
  }
}

// مزامنة نتيجة معدّلة يدوياً (من قبل المعلم) مع Google Sheets
function sendUpdatedResultToCloud(res, syncStatusEl = null) {
  const linkedExam = res && res.examId
    ? systemState.exams.find(e => e.id === res.examId)
    : systemState.exams.find(e => e.title === res.examTitle);
  const syncUrl = getUnifiedTeacherSyncUrl(linkedExam || null);
  const urlList = syncUrl ? [syncUrl] : [];

  if (urlList.length === 0) {
    if (syncStatusEl) syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle; font-size:1rem;">cloud_queue</span> لم يتم ربط Google Sheets بعد — تم الحفظ محلياً فقط.`;
    return;
  }

  if (syncStatusEl) syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; font-size:1rem; animation:spin 1s infinite linear;">sync</span> جاري مزامنة الدرجات مع Google Sheets...`;

  const payload = {
    action: "add_result",
    recordId: res.recordId || createRecordId("result"),
    timestamp: res.timestamp || new Date().toLocaleString("ar-EG"),
    name: res.name,
    id: res.id,
    subscriptionCode: res.accessCode || "",
    studentLookupKey: res.studentLookupKey || "",
    email: res.email || "",
    mobile: res.mobile || "",
    examTitle: res.examTitle || "",
    examId: res.examId || "",
    university: res.university || "",
    faculty: res.faculty || "",
    level: res.level || "",
    examType: res.examType || "",
    status: res.status || "updated",
    score: res.score || "",
    details: res.details || "",
    maxScore: res.maxScore || "",
    isManualGradeUpdate: true,
    attemptNumber: res.attemptNumber ?? "",
    ...buildResultCloudRetakeFields(res),
    ...buildResultDeviceFieldsFromResult(res),
    ...buildResultCloudIpReleaseFields(res),
    ...buildCheatTrackingFieldsFromResult(res)
  };
  const slimPayload = buildSlimResultCloudPayload(payload);

  let done = 0;
  const total = urlList.length;
  urlList.forEach(url => {
    postToArabyaWebApp(url, slimPayload).then(() => {
      done++;
      if (done === total) {
        pushCloudBackupNow().catch(() => {});
        if (syncStatusEl) {
          syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle; font-size:1rem;">cloud_done</span> تمت مزامنة التصحيح مع Google Sheets بنجاح!`;
        }
      }
    }).catch(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle; font-size:1rem;">cloud_off</span> فشلت المزامنة — تم الحفظ محلياً.`;
      }
    });
  });
}

function classifyResultSearchQuery(rawQuery) {
  const trimmed = (rawQuery || "").trim();
  if (!trimmed) return { mode: "none" };
  const codeNorm = normalizeStudentCodeForCompare(trimmed);
  const idNorm = normalizeStudentIdForCompare(trimmed);
  const nameNorm = normalizeStudentName(trimmed);
  const results = systemState.results || [];

  const codeHits = results.filter(res => {
    const rc = normalizeStudentCodeForCompare(res.accessCode || res.code || "");
    return rc && isPrivateStudentCode(rc) && rc === codeNorm;
  });
  if (codeHits.length) return { mode: "code", code: codeNorm };

  const idHits = results.filter(res => idNorm && normalizeStudentIdForCompare(res.id) === idNorm);
  if (idHits.length) return { mode: "id", id: idNorm };

  return { mode: "name", name: nameNorm };
}

function filterResultsForStudentSearch(queryInfo) {
  const results = systemState.results || [];
  if (queryInfo.mode === "code") {
    return results.filter(res =>
      normalizeStudentCodeForCompare(res.accessCode || res.code || "") === queryInfo.code
    );
  }
  if (queryInfo.mode === "id") {
    return results.filter(res => normalizeStudentIdForCompare(res.id) === queryInfo.id);
  }
  if (queryInfo.mode === "name") {
    return results.filter(res => normalizeStudentName(res.name) === queryInfo.name);
  }
  return [];
}

function hideStudentSearchDetailPanel() {
  const panel = document.getElementById("student-search-detail-panel");
  if (panel) panel.classList.add("hidden");
}

function renderStudentSearchDetailReadOnly(res) {
  const panel = document.getElementById("student-search-detail-panel");
  const titleEl = document.getElementById("student-search-detail-title");
  const metaEl = document.getElementById("student-search-detail-meta");
  const questionsEl = document.getElementById("student-search-detail-questions");
  if (!panel || !questionsEl) return;

  const exam = (systemState.exams || []).find(e => e.id === res.examId || e.title === res.examTitle);
  const presentedQuestions = getPresentedQuestionsForResult(res, exam);
  if (titleEl) titleEl.textContent = res.examTitle || "تفاصيل الامتحان";
  if (metaEl) {
    metaEl.innerHTML =
      `<div><strong>الطالب:</strong> ${escapeHtml(res.name || "")}</div>` +
      `<div><strong>المعرف:</strong> <code>${escapeHtml(res.id || "—")}</code></div>` +
      `<div><strong>النتيجة النهائية:</strong> <span style="color:var(--secondary); font-weight:800;">${escapeHtml(res.score || "")}</span></div>` +
      `<div><strong>التاريخ:</strong> ${escapeHtml(res.timestamp || "")}</div>`;
  }

  questionsEl.innerHTML = "";
  if (!presentedQuestions.length) {
    questionsEl.innerHTML =
      `<div style="padding:1rem; color:var(--text-muted); border:1px solid var(--border-color); border-radius:8px;">` +
      `${escapeHtml(res.details || "لا تتوفر تفاصيل الأسئلة لهذا السجل.")}` +
      `</div>`;
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  if (!res.studentAnswers) res.studentAnswers = {};
  presentedQuestions.forEach((q, index) => {
    const studentAns = res.studentAnswers[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;
    let typeName = "اختيار من متعدد";
    if (q.type === "boolean") typeName = "صواب وخطأ";
    if (q.type === "essay") typeName = "سؤال مقالي";

    const card = document.createElement("div");
    card.className = "exam-builder-card";
    card.style.cssText = "margin-bottom:1rem; padding:1rem; border:1px solid var(--border-color); border-radius:8px;";

    let bodyHtml = "";
    if (q.type === "essay") {
      bodyHtml =
        `<div style="margin:0.5rem 0;"><strong>إجابتك:</strong><div style="margin-top:0.35rem; padding:0.75rem; background:rgba(255,255,255,0.03); border-radius:6px;">${escapeHtml(studentAns || "—")}</div></div>`;
    } else {
      const options = Array.isArray(q.options) ? q.options : [];
      bodyHtml = options.map((opt, optIdx) => {
        const letter = String.fromCharCode(65 + optIdx);
        const chosen = studentAns === opt || studentAns === letter || studentAns === optIdx;
        const correct = q.correctAnswer === opt || q.correctAnswer === letter || q.correctAnswer === optIdx;
        let mark = "";
        if (chosen && correct) mark = ' <span style="color:var(--secondary);">✓ صحيح</span>';
        else if (chosen && !correct) mark = ' <span style="color:var(--error);">✗ خطأ</span>';
        else if (!chosen && correct) mark = ' <span style="color:var(--text-muted);">(الإجابة الصحيحة)</span>';
        return `<div style="margin:0.35rem 0; padding:0.35rem 0.5rem; ${chosen ? "background:rgba(56,189,248,0.08);" : ""} border-radius:4px;">${letter}) ${escapeHtml(String(opt))}${mark}</div>`;
      }).join("");
    }

    card.innerHTML =
      `<div style="font-weight:700; color:var(--secondary); margin-bottom:0.5rem;">سؤال ${index + 1} (${typeName}) · ${qPoints} درجة</div>` +
      `<div style="font-weight:600; margin-bottom:0.75rem; line-height:1.6;">${escapeHtml(q.question || "")}</div>` +
      bodyHtml;
    questionsEl.appendChild(card);
  });

  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

window.openStudentSearchResultDetail = function(recordId) {
  const res = (systemState.results || []).find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على تفاصيل هذه النتيجة.");
    return;
  }
  renderStudentSearchDetailReadOnly(res);
};

// الاستعلام عن نتائج الطلاب بالاسم، المعرف، أو كود الاشتراك
function searchStudentResults() {
  reloadSystemStateFromLocalStorage();
  const rawQuery = document.getElementById("search-student-query").value.trim();
  hideStudentSearchDetailPanel();

  if (!rawQuery) {
    alert("يرجى إدخال الاسم أو معرف الهوية أو كود الاشتراك للبحث!");
    return;
  }

  const queryInfo = classifyResultSearchQuery(rawQuery);
  const matched = filterResultsForStudentSearch(queryInfo);
  const listContainer = document.getElementById("student-search-results-list");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  if (!matched.length) {
    listContainer.innerHTML =
      `<div style="text-align:center; padding:2rem; color:var(--text-muted);">لم يتم العثور على نتائج تطابق بيانات البحث.</div>`;
    return;
  }

  const summaryOnly = queryInfo.mode === "name" || queryInfo.mode === "id";
  const modeHint = summaryOnly
    ? `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">عرض الملخص النهائي فقط — للتفاصيل الكاملة استخدم كود الاشتراك.</div>`
    : `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">يمكنك فتح تفاصيل كل امتحان (أسئلة وإجابات) للقراءة فقط.</div>`;
  listContainer.insertAdjacentHTML("afterbegin", modeHint);

  matched.forEach(res => {
    const card = document.createElement("div");
    card.className = "result-query-card";
    const scoreHtml = `<span style="font-size:1.1rem; font-weight:800; color:var(--secondary);">${escapeHtml(res.score || "")}</span>`;
    const metaHtml =
      `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(res.timestamp || "")}</div>`;
    let actionsHtml = "";
    if (!summaryOnly && res.recordId) {
      actionsHtml =
        `<button type="button" class="btn btn-outline btn-sm" data-result-id="${escapeHtml(res.recordId)}">عرض التفاصيل</button>`;
    }
    card.innerHTML =
      `<div><div class="result-query-title">${escapeHtml(res.examTitle || "")} (${escapeHtml(res.examType || "")})</div>${metaHtml}</div>` +
      `<div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">${scoreHtml}${actionsHtml}</div>`;
    const btn = card.querySelector("button[data-result-id]");
    if (btn) {
      btn.addEventListener("click", () => openStudentSearchResultDetail(btn.getAttribute("data-result-id")));
    }
    listContainer.appendChild(card);
  });
}

window.viewResultDetailQuery = function(recordId, studentId, examId) {
  if (recordId && systemState.results.some(r => r.recordId === recordId)) {
    openStudentSearchResultDetail(recordId);
    return;
  }
  if (examId === undefined) {
    examId = studentId;
    studentId = recordId;
    recordId = "";
  }
  const result = systemState.results.find(r => r.recordId === recordId) ||
    systemState.results.find(r => r.id === studentId && r.examId === examId);
  if (result && result.recordId) {
    openStudentSearchResultDetail(result.recordId);
  } else if (result) {
    alert(`النتيجة النهائية [${result.examTitle}]: ${result.score}`);
  }
};




function getResultsTableFilters() {
  const view = getResultsTableViewSettings();
  return {
    searchQuery: getResultsSearchQuery(),
    statusFilter: view.statusFilter || "all",
    examFilter: view.examFilter || "",
    dateFilter: view.dateFilter || "all",
    dateFrom: view.dateFrom || "",
    dateTo: view.dateTo || ""
  };
}

function getResultDisplayStatus(res) {
  if (isSupersededResult(res)) return "superseded";
  if (res?.status === "canceled") return "canceled";
  if (res?.status === "incomplete") return "incomplete";
  const scoreText = String(res?.score || "");
  if (/جاري|غير مكتمل|incomplete/i.test(scoreText)) return "incomplete";
  return "completed";
}

function parseDateInputValue(value, endOfDay = false) {
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

function parseResultTimestamp(value) {
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
}

function resultMatchesStatusFilter(res, statusFilter) {
  if (!statusFilter || statusFilter === "all") return true;
  if (statusFilter === "retake_allowed") return resultHasActiveRetakeGrant(res);
  if (statusFilter === "superseded") return isSupersededResult(res);
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
  getTeacherScopedExams().forEach(exam => {
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
  if (filters.dateFrom || filters.dateTo) {
    list = list.filter(res => resultMatchesCustomDateRange(res, filters.dateFrom, filters.dateTo));
  } else if (filters.dateFilter !== "all") {
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
    (active.dateFilter && active.dateFilter !== "all") ||
    active.dateFrom ||
    active.dateTo
  );
}

function persistResultsTableFilters() {
  const view = getResultsTableViewSettings();
  try {
    localStorage.setItem("arabya_results_filters", JSON.stringify({
      statusFilter: view.statusFilter || "all",
      examFilter: view.examFilter || "",
      dateFilter: view.dateFilter || "all",
      dateFrom: view.dateFrom || "",
      dateTo: view.dateTo || ""
    }));
  } catch (e) {}
}


function ensureResultsQuickFiltersMarkup() {
  const container = document.getElementById("teacher-results-quick-filters");
  if (!container) return;
  if (container.querySelector("#teacher-results-exam-filter")) return;
  container.classList.remove("hidden");
  container.classList.add("teacher-filter-toolbar");
  container.removeAttribute("aria-hidden");
  container.removeAttribute("style");
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
  const legacySort = document.querySelector("#teacher-results-toolbar .teacher-pagination-controls > #teacher-results-sort-order");
  if (legacySort) legacySort.remove();
}

function ensureStudentsQuickFiltersMarkup() {
  const container = document.getElementById("teacher-students-quick-filters");
  if (!container) return;
  if (container.querySelector("#teacher-students-sort-order")) return;
  container.classList.remove("hidden");
  container.classList.add("teacher-filter-toolbar");
  container.removeAttribute("aria-hidden");
  container.removeAttribute("style");
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
  const legacySort = document.querySelector("#teacher-students-toolbar .teacher-pagination-controls > #teacher-students-sort-order");
  if (legacySort) legacySort.remove();
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
  const dateFromInput = document.getElementById("teacher-results-date-from");
  const dateToInput = document.getElementById("teacher-results-date-to");
  if (dateFromInput) dateFromInput.value = view.dateFrom || "";
  if (dateToInput) dateToInput.value = view.dateTo || "";
}


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
    view.columnSort = null;
    view.page = 1;
    try { localStorage.setItem("arabya_results_sort", view.sortOrder); } catch (e) {}
    persistResultsColumnSort(null);
    renderStudentResultsTable();
  });
}

function resetResultsTableFilters() {
  const view = getResultsTableViewSettings();
  view.statusFilter = "all";
  view.examFilter = "";
  view.dateFilter = "all";
  view.dateFrom = "";
  view.dateTo = "";
  view.page = 1;
  const searchInput = document.getElementById("teacher-results-search-input");
  if (searchInput) searchInput.value = "";
  persistResultsTableFilters();
  syncResultsFilterControlsUI();
  renderStudentResultsTable();
}

function setupResultsTableFilterControls() {
  ensureResultsQuickFiltersMarkup();
  const container = document.getElementById("teacher-results-quick-filters");
  if (!container) return;
  populateResultsExamFilterSelect();
  syncResultsFilterControlsUI();
  setupResultsTableSortControl();
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
  });

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
  navigateToView("teacher-dashboard-view");
  activateTeacherTab("results", { force: true, skipRefresh: true });
  setTimeout(() => {
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  }, 50);
};

function countStudentResults(student) {
  const studentKey = student.studentKey || getStudentLookupKey(student);
  return (systemState.results || []).filter(res => {
    if (isSupersededResult(res)) return false;
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
    view.columnSort = null;
    view.page = 1;
    try { localStorage.setItem("arabya_students_sort", view.sortOrder); } catch (e) {}
    persistStudentsColumnSort(null);
    renderTeacherStudentsTable();
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
  ensureStudentsQuickFiltersMarkup();
  const container = document.getElementById("teacher-students-quick-filters");
  if (!container) return;
  syncStudentsFilterControlsUI();
  setupStudentsTableSortControl();
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

function normalizeIpSearchToken(value) {
  return String(value || "").trim().toLowerCase();
}

function ipMatchesSearchQuery(ipValue, query) {
  const token = normalizeIpSearchToken(query);
  const ip = normalizeIpSearchToken(ipValue);
  if (!token || !ip) return false;
  return ip.includes(token);
}

function getStudentDisplayIp(student) {
  const ips = collectStudentIpAddresses(student);
  if (!ips.length) return "—";
  const preferred = String(student?.lastKnownIp || student?.clientIp || "").trim();
  if (preferred) return preferred;
  return ips[0];
}

function collectStudentIpAddresses(student) {
  const ips = new Set();
  const addIp = (value) => {
    const ip = String(value || "").trim();
    if (ip) ips.add(ip.toLowerCase());
  };
  if (!student) return [];
  addIp(student.lastKnownIp);
  addIp(student.clientIp);
  const ctx = buildStudentMatchContext(student);
  (systemState.results || []).forEach(res => {
    if (resultMatchesStudentIdentity(res, ctx)) addIp(res.clientIp);
  });
  return [...ips];
}

function normalizeResultsSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getResultsSearchQuery() {
  const input = document.getElementById("teacher-results-search-input");
  return input ? input.value.trim() : "";
}

function resultMatchesSearchQuery(res, query) {
  const normalizedQuery = normalizeResultsSearchText(query);
  if (!normalizedQuery) return true;
  const ipToken = normalizeIpSearchToken(query);
  const fields = [
    res.name,
    res.id,
    res.accessCode,
    res.examTitle,
    res.score,
    res.level,
    res.examType,
    res.status,
    res.timestamp,
    res.clientIp,
    res.deviceId,
    res.deviceFingerprint
  ];
  if (fields.some(field => normalizeResultsSearchText(field).includes(normalizedQuery))) {
    return true;
  }
  if (ipToken && ipMatchesSearchQuery(res.clientIp, ipToken)) return true;
  const queryId = normalizeStudentId(query);
  if (queryId && normalizeStudentId(res.id).includes(queryId)) return true;
  const queryCode = sanitizeStudentCodeInput(query);
  if (queryCode && sanitizeStudentCodeInput(res.accessCode || "") === queryCode) return true;
  return false;
}

function filterResultsForSearch(results, query) {
  const list = Array.isArray(results) ? results : [];
  if (!getResultsSearchQuery() && !query) return list;
  const activeQuery = query != null ? String(query).trim() : getResultsSearchQuery();
  if (!activeQuery) return list;
  return list.filter(res => resultMatchesSearchQuery(res, activeQuery));
}

function setupResultsTableSearchControl() {
  const input = document.getElementById("teacher-results-search-input");
  const clearBtn = document.getElementById("teacher-results-search-clear");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      getResultsTableViewSettings().page = 1;
      renderStudentResultsTable();
    }, 180);
  });
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      getResultsTableViewSettings().page = 1;
      renderStudentResultsTable();
      input.focus();
    });
  }
}

function getResultsTableViewSettings() {
  if (!systemState.resultsTableView) {
    let pageSize = 50;
    let statusFilter = "all";
    let examFilter = "";
    let dateFilter = "all";
    try {
      const saved = parseInt(localStorage.getItem("arabya_results_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    let sortOrder = "newest";
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.statusFilter) statusFilter = savedFilters.statusFilter;
      if (savedFilters.examFilter) examFilter = savedFilters.examFilter;
      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
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
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter, dateFrom, dateTo, sortOrder, columnSort };
  }
  return systemState.resultsTableView;
}

function setResultsTablePageSize(size) {
  const view = getResultsTableViewSettings();
  view.pageSize = [25, 50, 100, 200, 500, 0].includes(size) ? size : 50;
  view.page = 1;
  try { localStorage.setItem("arabya_results_page_size", String(view.pageSize)); } catch (e) {}
}

function clampResultsTablePage(totalItems, pageSize, page) {
  if (!pageSize || pageSize <= 0) return 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function updateResultsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, filtersActive = false) {
  const infoEls = ["teacher-results-page-info", "teacher-results-page-info-bottom"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const pageNumEls = ["teacher-results-page-number", "teacher-results-page-number-bottom"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const prevBtns = document.querySelectorAll("[data-results-prev-page]");
  const nextBtns = document.querySelectorAll("[data-results-next-page]");
  const sizeSelects = document.querySelectorAll("[data-results-page-size]");
  const isFiltered = filtersActive || totalAll !== totalItems;

  sizeSelects.forEach(sizeSelect => {
    if (String(sizeSelect.value) !== String(pageSize)) {
      sizeSelect.value = String(pageSize);
    }
  });

  if (totalItems === 0) {
    infoEls.forEach(info => {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} سجلاً`
        : "";
    });
    pageNumEls.forEach(pageNum => { pageNum.textContent = ""; });
    prevBtns.forEach(prevBtn => { prevBtn.disabled = true; });
    nextBtns.forEach(nextBtn => { nextBtn.disabled = true; });
    return;
  }

  const countPrefix = isFiltered ? `وُجد ${totalItems} من ${totalAll} سجل — ` : "";

  if (!pageSize || pageSize <= 0) {
    infoEls.forEach(info => {
      info.textContent = isFiltered
        ? `${countPrefix}عرض الكل`
        : `إجمالي ${totalItems} سجلاً — عرض الكل`;
    });
    pageNumEls.forEach(pageNum => { pageNum.textContent = ""; });
    prevBtns.forEach(prevBtn => { prevBtn.disabled = true; });
    nextBtns.forEach(nextBtn => { nextBtn.disabled = true; });
    return;
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  infoEls.forEach(info => { info.textContent = `${countPrefix}عرض ${start}–${end} من ${totalItems} سجلاً`; });
  pageNumEls.forEach(pageNum => { pageNum.textContent = `${page} / ${totalPages}`; });
  prevBtns.forEach(prevBtn => { prevBtn.disabled = page <= 1; });
  nextBtns.forEach(nextBtn => { nextBtn.disabled = page >= totalPages; });
}

function setupResultsTablePaginationControls() {
  document.querySelectorAll("[data-results-page-size]").forEach(sizeSelect => {
    if (sizeSelect.dataset.bound) return;
    sizeSelect.dataset.bound = "1";
    sizeSelect.value = String(getResultsTableViewSettings().pageSize);
    sizeSelect.addEventListener("change", () => {
      setResultsTablePageSize(parseInt(sizeSelect.value, 10));
      renderStudentResultsTable();
    });
  });
  document.querySelectorAll("[data-results-prev-page]").forEach(prevBtn => {
    if (prevBtn.dataset.bound) return;
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => {
      const view = getResultsTableViewSettings();
      if (view.page > 1) {
        view.page -= 1;
        renderStudentResultsTable();
      }
    });
  });
  document.querySelectorAll("[data-results-next-page]").forEach(nextBtn => {
    if (nextBtn.dataset.bound) return;
    nextBtn.dataset.bound = "1";
    nextBtn.addEventListener("click", () => {
      const view = getResultsTableViewSettings();
      view.page += 1;
      renderStudentResultsTable();
    });
  });
}

function renderStudentResultsTable() {
  const tbody = document.getElementById("teacher-results-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  setupResultsTablePaginationControls();
  setupResultsTableSearchControl();
  setupResultsTableFilterControls();
  setupResultsTableSortControl();

  const filters = getResultsTableFilters();
  const filtersActive = isResultsTableFiltersActive(filters);
  const totalAll = systemState.results.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد سجلات محلية.${hasCloud ? " اضغط «مزامنة من السحابة» أعلاه لجلب نتائج الطلاب من Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateResultsPaginationUI(0, 1, getResultsTableViewSettings().pageSize, 0, filtersActive);
    return;
  }

  const view = getResultsTableViewSettings();
  renderSortableTableHeaders("#teacher-tab-results .table-container table", RESULTS_TABLE_SORTABLE_COLUMNS, view.columnSort, toggleResultsColumnSort);
  let sorted = sortResultsForDisplay(systemState.results, view.sortOrder);
  sorted = applyResultsColumnSort(sorted, view.columnSort, systemState.results);
  const filtered = filterResultsForTeacherTable(sorted);
  const totalItems = filtered.length;
  view.page = clampResultsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    const emptyMsg = filters.searchQuery
      ? `لا توجد نتائج تطابق «${escapeHtml(filters.searchQuery)}»`
      : "لا توجد نتائج تطابق الفلاتر المحددة";
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} سجل.</td></tr>`;
    updateResultsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }

  let pageItems = filtered;
  if (view.pageSize > 0) {
    const start = (view.page - 1) * view.pageSize;
    pageItems = filtered.slice(start, start + view.pageSize);
  }

  const sharedIpMap = buildExamSharedIpStudentMap();

  pageItems.forEach(res => {
    const row = document.createElement("tr");
    const displayStatus = getResultDisplayStatus(res);
    if (displayStatus === "canceled") row.style.borderRight = "3px solid var(--error)";
    else if (displayStatus === "incomplete") row.style.borderRight = "3px solid var(--warning)";
    const statusBadge = formatResultStatusBadge(res);
    const sharedIpBadge = formatResultSharedIpBadgeHtml(res, sharedIpMap);
    row.innerHTML = `
      <td>${statusBadge}${escapeHtml(res.name || "")}${sharedIpBadge}</td>
      <td><code>${escapeHtml(res.id || "--")}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${escapeHtml(res.accessCode || "لا يوجد")}</span></td>
      <td>${escapeHtml(res.examTitle || "")} (${escapeHtml(res.level || "عام")})</td>
      <td style="font-weight:700; color:var(--secondary);">${escapeHtml(formatResultGradeCell(res))}</td>
      <td><code style="font-size:0.78rem;">${escapeHtml(formatResultDeviceSummary(res))}</code></td>
      <td>${escapeHtml(res.timestamp || "")}</td>
      <td class="teacher-results-actions teacher-table-actions"></td>
    `;

    const actionsCell = row.querySelector(".teacher-results-actions");
    appendResultRetakeActions(res, actionsCell);

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-outline btn-sm";
    viewBtn.textContent = "عرض / تعديل";
    viewBtn.addEventListener("click", () => viewTeacherResultDetail(res.recordId || "", res.id || "", res.examId || ""));
    actionsCell.appendChild(viewBtn);

    if (canDeleteResults() && res.recordId) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-outline btn-sm";
      deleteBtn.style.borderColor = "var(--error)";
      deleteBtn.style.color = "var(--error)";
      deleteBtn.textContent = "حذف";
      deleteBtn.setAttribute("aria-label", `حذف نتيجة ${res.name || ""}`);
      deleteBtn.addEventListener("click", () => deleteTeacherResultByRecordId(res.recordId));
      actionsCell.appendChild(deleteBtn);
    }

    tbody.appendChild(row);
  });

  updateResultsPaginationUI(totalItems, view.page, view.pageSize, totalAll, filtersActive);
}

window.viewTeacherResultDetail = function(recordId, studentId, examId) {
  if (examId === undefined) {
    examId = studentId;
    studentId = recordId;
    recordId = "";
  }
  // البحث بمعيار id + examId (أو id فقط كحالة بديلة)
  const res = systemState.results.find(r => r.recordId === recordId) ||
  systemState.results.find(r =>
    (r.id === studentId && r.examId === examId) ||
    (r.id === studentId && !r.examId && examId === "")
  );
  if (!res) {
    alert("لم يتم العثور على سجل هذا الطالب!");
    return;
  }

  const exam = systemState.exams.find(e => e.id === (res.examId || examId));
  const presentedQuestions = getPresentedQuestionsForResult(res, exam);
  const presentedMeta = calculateRuntimeExamMeta(presentedQuestions);
  const examForDisplay = {
    ...(exam || {
      title: res.examTitle || "امتحان محذوف",
      totalScore: res.maxScore || 100
    }),
    questions: presentedQuestions,
    totalScore: presentedMeta.maxScore || res.maxScore || exam?.totalScore || 100
  };

  systemState.currentGradingResult = res;
  systemState.currentGradingExam = examForDisplay

  const panel = document.getElementById("teacher-result-detail-panel");
  if (panel) {
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById("detail-student-name").innerText = res.name;
  document.getElementById("detail-stu-name").innerText = res.name;
  document.getElementById("detail-stu-id").innerText = res.id;
  document.getElementById("detail-stu-code").innerText = res.accessCode || "لا يوجد";
  document.getElementById("detail-exam-title").innerText = res.examTitle || examForDisplay.title;
  document.getElementById("detail-exam-date").innerText = res.timestamp;
  renderTeacherResultDeviceIpPanel(res);
  document.getElementById("detail-total-score-input").value = res.score;
  renderResultRetakeManagementPanel(res);
  renderStudentAttemptsPanel(res);
  renderTeacherCheatAttemptsPanel(res);

  if (!res.studentAnswers) res.studentAnswers = {};
  if (!res.questionScores) res.questionScores = {};

  const container = document.getElementById("detail-questions-container");
  if (!container) return;
  container.innerHTML = "";

  const questionsToRender = examForDisplay.questions || [];
  if (!questionsToRender.length) {
    container.innerHTML = `<div style="padding:1rem; color:var(--warning); border:1px solid var(--warning); border-radius:8px;">تعذّر تحديد الأسئلة التي ظهرت لهذا الطالب من البيانات المحفوظة. إذا كانت النتيجة قديماً، جرّب مزامنة سحابية أو افتح النتيجة من نفس الجهاز الذي أُجري عليه الامتحان.</div>`;
    return;
  }

  questionsToRender.forEach((q, index) => {
    const studentAns = res.studentAnswers[q.id];
    
    // تهيئة الدرجة إذا كانت فارغة للموضوعي
    if (q.type !== "essay" && res.questionScores[q.id] === undefined) {
      res.questionScores[q.id] = (studentAns === q.correctAnswer) ? (q.points || 10) : 0;
    }

    const qPoints = q.points !== undefined ? q.points : 10;
    const currentScore = res.questionScores[q.id] !== undefined ? res.questionScores[q.id] : 0;

    const qCard = document.createElement("div");
    qCard.className = "exam-builder-card";
    qCard.style.background = "rgba(255,255,255,0.01)";
    qCard.style.border = "1px solid var(--border-color)";
    qCard.style.padding = "1.25rem";
    qCard.style.borderRadius = "8px";

    let questionTypeName = "اختيار من متعدد";
    if (q.type === "boolean") questionTypeName = "صواب وخطأ";
    if (q.type === "essay") questionTypeName = "سؤال مقالي";

    qCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:0.5rem;">
        <span style="font-weight:700; color:var(--secondary);">سؤال ${index + 1} (${questionTypeName})</span>
        <span style="font-size:0.85rem; color:var(--text-muted);">وزن السؤال: ${qPoints} درجة</span>
      </div>
      <div style="font-size:1.1rem; color:white; margin-bottom:1rem; font-weight:600; line-height:1.6;">${escapeHtml(q.question)}</div>
    `;

    const body = document.createElement("div");

    if (q.type === "essay") {
      const textarea = document.createElement("textarea");
      textarea.className = "essay-textarea edit-student-ans";
      textarea.style.minHeight = "80px";
      textarea.style.marginBottom = "0.75rem";
      textarea.value = studentAns || "";
      textarea.dataset.qId = q.id;

      const scoreRow = document.createElement("div");
      scoreRow.style.display = "flex";
      scoreRow.style.alignItems = "center";
      scoreRow.style.gap = "0.5rem";
      scoreRow.innerHTML = `
        <label style="color:var(--text-muted); font-size:0.9rem;">الدرجة المستحقة للطالب:</label>
        <input type="number" class="form-control edit-student-q-score" data-q-id="${q.id}" value="${currentScore}" max="${qPoints}" min="0" style="width:100px; padding:0.4rem 0.8rem;">
        <span style="font-size:0.85rem; color:var(--text-muted);">من ${qPoints} درجات كحد أقصى</span>
      `;

      body.appendChild(textarea);
      body.appendChild(scoreRow);
    } else {
      const select = document.createElement("select");
      select.className = "form-control edit-student-ans";
      select.style.marginBottom = "0.75rem";
      select.style.appearance = "none";
      select.dataset.qId = q.id;

      const optUnanswered = document.createElement("option");
      optUnanswered.value = "-1";
      optUnanswered.innerText = "لم يتم الإجابة (انتهى الوقت)";
      if (studentAns === -1 || studentAns === undefined) optUnanswered.selected = true;
      select.appendChild(optUnanswered);

      const optCheated = document.createElement("option");
      optCheated.value = "-2";
      optCheated.innerText = "ملغي (محاولة غش)";
      if (studentAns === -2) optCheated.selected = true;
      select.appendChild(optCheated);

      q.options.forEach((optText, oIdx) => {
        const option = document.createElement("option");
        option.value = oIdx;
        option.innerText = optText;
        if (studentAns === oIdx) option.selected = true;
        select.appendChild(option);
      });

      const indicator = document.createElement("div");
      indicator.style.fontSize = "0.9rem";
      indicator.style.marginBottom = "0.75rem";
      
      const isCorrect = (studentAns === q.correctAnswer);
      if (isCorrect) {
        indicator.innerHTML = `<span style="color:var(--secondary); font-weight:700;"><span class="material-icons" style="font-size:1.1rem; vertical-align:middle;">check_circle</span> إجابة الطالب صحيحة</span>`;
      } else {
        const correctText = q.options[q.correctAnswer] || "";
        indicator.innerHTML = `<span style="color:var(--error); font-weight:700;"><span class="material-icons" style="font-size:1.1rem; vertical-align:middle;">cancel</span> إجابة الطالب خاطئة</span> (الإجابة النموذجية: ${escapeHtml(correctText)})`;
      }

      const scoreRow = document.createElement("div");
      scoreRow.style.display = "flex";
      scoreRow.style.alignItems = "center";
      scoreRow.style.gap = "0.5rem";
      scoreRow.innerHTML = `
        <label style="color:var(--text-muted); font-size:0.9rem;">الدرجة المستحقة للطالب:</label>
        <input type="number" class="form-control edit-student-q-score" data-q-id="${q.id}" value="${currentScore}" max="${qPoints}" min="0" style="width:100px; padding:0.4rem 0.8rem;">
        <span style="font-size:0.85rem; color:var(--text-muted);">من ${qPoints} درجات</span>
      `;

      select.addEventListener("change", (e) => {
        const val = parseInt(e.target.value);
        const scoreInput = scoreRow.querySelector(".edit-student-q-score");
        if (scoreInput) {
          if (val === q.correctAnswer) {
            scoreInput.value = qPoints;
          } else {
            scoreInput.value = 0;
          }
        }
      });

      body.appendChild(select);
      body.appendChild(indicator);
      body.appendChild(scoreRow);
    }

    qCard.appendChild(body);
    container.appendChild(qCard);
  });
};

window.closeResultDetailPanel = function() {
  const panel = document.getElementById("teacher-result-detail-panel");
  if (panel) panel.classList.add("hidden");
  systemState.currentGradingResult = null;
  systemState.currentGradingExam = null;
};

window.saveTotalScoreManual = function() {
  const res = systemState.currentGradingResult;
  if (!res) return;

  const inputVal = document.getElementById("detail-total-score-input").value.trim();
  if (!inputVal) {
    alert("يرجى إدخال قيمة النتيجة أولاً!");
    return;
  }

  res.score = inputVal;
  saveSystemState(true);
  renderStudentResultsTable();
  // Sync to cloud
  const syncEl = document.getElementById("grading-sync-status");
  sendUpdatedResultToCloud(res, syncEl);
  alert("تم تعديل النتيجة الإجمالية بنجاح! تجري المزامنة في الخلفية.");
};

window.saveResultDetailsManual = function() {
  const res = systemState.currentGradingResult;
  const exam = systemState.currentGradingExam;
  if (!res || !exam) return;

  const ansInputs = document.querySelectorAll("#detail-questions-container .edit-student-ans");
  const scoreInputs = document.querySelectorAll("#detail-questions-container .edit-student-q-score");

  const newAnswers = {};
  const newScores = {};
  let totalEarnedPoints = 0;
  let detailsLog = [];

  ansInputs.forEach(input => {
    const qId = parseInt(input.dataset.qId);
    const q = exam.questions.find(quest => quest.id === qId);
    if (q.type === "essay") {
      newAnswers[qId] = input.value;
    } else {
      newAnswers[qId] = parseInt(input.value);
    }
  });

  scoreInputs.forEach(input => {
    const qId = parseInt(input.dataset.qId);
    const val = parseFloat(input.value) || 0;
    newScores[qId] = val;
    totalEarnedPoints += val;
  });

  res.studentAnswers = newAnswers;
  res.questionScores = newScores;

  if (!Array.isArray(res.presentedQuestions) || !res.presentedQuestions.length) {
    res.presentedQuestions = JSON.parse(JSON.stringify(exam.questions));
  }
  res.maxScore = calculateRuntimeExamMeta(exam.questions).maxScore;

  exam.questions.forEach(q => {
    const ans = newAnswers[q.id];
    const score = newScores[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;

    if (q.type === "essay") {
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} \n إجابة الطالب: ${ans || "(لم يكتب الطالب إجابة)"}\n [درجة السؤال المعدلة: ${score} من ${qPoints}]\n-----------------`);
    } else {
      let studentAnsText = "لم تتم الإجابة";
      if (ans === -1) studentAnsText = "انتهى الوقت";
      else if (ans === -2) studentAnsText = "ملغي (غش)";
      else if (ans !== undefined && q.options[ans]) studentAnsText = q.options[ans];

      const isCorrect = (ans === q.correctAnswer);
      detailsLog.push(`س (وزنها ${qPoints} نقاط): ${q.question} | إجابة الطالب: ${studentAnsText} | الصحيحة: ${q.options[q.correctAnswer]} [درجة السؤال المعدلة: ${score} من ${qPoints}]`);
    }
  });

  res.details = detailsLog.join("\n");

  const manualTotalInput = document.getElementById("detail-total-score-input").value.trim();
  res.score = manualTotalInput || `${totalEarnedPoints}/${exam.totalScore || 100} (درجة كلية)`;

  saveSystemState(true);
  renderStudentResultsTable();
  // Sync to cloud immediately
  const syncEl = document.getElementById("grading-sync-status");
  if (syncEl) syncEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; font-size:1rem; animation:spin 1s infinite linear;">sync</span> جاري مزامنة الدرجات المعدّلة...`;
  sendUpdatedResultToCloud(res, syncEl);
  // Close after 3s so user sees sync status
  setTimeout(() => { closeResultDetailPanel(); }, 3000);
  alert("تم حفظ كافة التعديلات، إجابات الطالب، والدرجات يدوياً بنجاح! جارٍ المزامنة مع Google Sheets.");
};

function exportTeacherResultsToCSV() {
  if (systemState.results.length === 0) {
    alert("لا توجد سجلات لتصديرها!");
    return;
  }

  const exportRows = getResultsForExport();
  if (!exportRows.length) {
    alert("لا توجد نتائج مطابقة للفلاتر الحالية للتصدير!");
    return;
  }

  let csvContent = "\ufeffsep=,\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,محاولات غش,حد الغش,تفاصيل محاولات الغش,معرف الجهاز,بصمة الجهاز,IP,النتيجة,التاريخ والوقت\n";

  exportRows.forEach(res => {
    csvContent += buildCsvLine([
      res.name || "",
      res.id || "",
      res.accessCode || "لا يوجد",
      res.university || "عام",
      res.faculty || "عام",
      res.level || "عام",
      res.examTitle || "",
      res.examType || "أعمال سنة",
      getResultDisplayStatus(res),
      getResultRetakeStatusText(res),
      formatCheatAttemptsTeacherSummary(res),
      res.maxCheatAttemptsAllowed ?? "",
      formatCheatAttemptsExportText(res),
      res.deviceId || "",
      res.deviceFingerprint || "",
      res.clientIp || "",
      res.score || "",
      res.timestamp || ""
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `نتائج_arabya_${getExportDateStamp()}.csv`
  );
}

function findTeacherResultByRecordId(recordId) {
  const rid = String(recordId || "").trim();
  if (!rid) return null;
  return systemState.results.find(r => String(r.recordId || "") === rid) || null;
}

async function postDeleteResultToCloud(res) {
  if (!res) return { ok: false, successCount: 0, total: 0 };
  const linkedExam = res.examId
    ? systemState.exams.find(e => e.id === res.examId)
    : systemState.exams.find(e => e.title === res.examTitle);
  const syncUrl = getUnifiedTeacherSyncUrl(linkedExam || null);
  const urlList = syncUrl ? [syncUrl] : [];
  if (!urlList.length) return { ok: false, successCount: 0, total: 0 };
  const actor = window.ArabyaPlatformSync && window.ArabyaPlatformSync.getCloudSyncActor
    ? window.ArabyaPlatformSync.getCloudSyncActor()
    : { username: systemState.activeTeacher?.username || "", name: systemState.activeTeacher?.name || "" };
  const payload = {
    action: "delete_result",
    recordId: res.recordId || "",
    id: res.id || "",
    examId: res.examId || "",
    examTitle: res.examTitle || "",
    timestamp: res.timestamp || "",
    studentLookupKey: res.studentLookupKey || "",
    actor
  };
  const outcomes = await Promise.all(urlList.map(async url => {
    try {
      await postToArabyaWebApp(url, payload);
      return true;
    } catch (err) {
      console.warn("[ARABYA] delete_result failed:", url, err);
      try {
        return await postToArabyaWebAppNoCors(url, payload);
      } catch (e2) {
        return false;
      }
    }
  }));
  const successCount = outcomes.filter(Boolean).length;
  return { ok: successCount > 0, successCount, total: urlList.length };
}

window.deleteTeacherResultByRecordId = async function(recordId) {
  if (!canDeleteResults()) {
    alert("حذف سجلات النتائج متاح للمعلم ومدير المنصة (سوبر أدمن) فقط.");
    return;
  }
  const res = findTeacherResultByRecordId(recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  const label = `${res.name || "طالب"} — ${res.examTitle || "امتحان"} (${res.timestamp || ""})`;
  if (!confirm(`هل تريد حذف نتيجة:\n${label}\n\nسيُحذف السجل من الجهاز ومن ورقة Google Sheets فوراً.`)) {
    return;
  }

  const syncEl = document.getElementById("teacher-results-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري حذف السجل ومزامنته مع Google Sheets...`;
  }

  addDeletedResultKey(res);
  systemState.results = filterOutDeletedResults(
    systemState.results.filter(r => String(r.recordId || "") !== String(recordId))
  );
  persistDeletedResultKeys();
  localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));

  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === recordId) {
    systemState.currentGradingResult = null;
    systemState.currentGradingExam = null;
    const panel = document.getElementById("teacher-result-detail-panel");
    if (panel) panel.classList.add("hidden");
  }

  let cloudOk = false;
  try {
    const [deleteOutcome, backupOk] = await Promise.all([
      postDeleteResultToCloud(res),
      pushCloudBackupNow("delete_result")
    ]);
    cloudOk = deleteOutcome.ok || backupOk;
  } catch (syncErr) {
    console.error("[ARABYA] deleteTeacherResultByRecordId:", syncErr);
  }

  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("delete_result");
  }

  if (cloudOk && typeof syncDatabaseFromCloud === "function") {
    try {
      await syncDatabaseFromCloud({ silent: true });
    } catch (pullErr) {
      console.warn("[ARABYA] post-delete pull:", pullErr);
    }
  }

  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (typeof renderTeacherStatsDashboard === "function") {
    try { renderTeacherStatsDashboard(); } catch (e) {}
  }

  if (syncEl) {
    syncEl.innerHTML = cloudOk
      ? `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تم حذف السجل من Google Sheets والنسخة الاحتياطية`
      : `<span class="material-icons" style="vertical-align:middle; color:var(--warning);">cloud_off</span> تم الحذف محلياً — تحقق من رابط /exec ونشر Apps Script`;
  }
  if (window.ArabyaToast) {
    window.ArabyaToast.showToast(
      cloudOk ? "تم حذف النتيجة ومزامنتها مع السحابة" : "تم الحذف محلياً — راجع إعدادات المزامنة",
      cloudOk ? "success" : "warning"
    );
  }
};

async function clearTeacherResults() {
  if (!confirm("هل أنت متأكد من رغبتك في حذف جميع نتائج وسجلات الطلاب نهائياً؟ (لا يمكن التراجع عن ذلك)")) {
    return;
  }
  systemState.results = [];
  localStorage.setItem("arabya_results_db", "[]");
  renderStudentResultsTable();
  const synced = await syncLocalDatabaseToCloud();
  alert(synced ? "تم مسح السجلات ومزامنة التغيير مع Google Sheets." : "تم مسح السجلات محلياً.");
}


// ==========================================
// ==========================================
// 8b. بصمة الجهاز ومنع مشاركة الجهاز بين الطلاب
// ==========================================
// ملاحظة: المتصفح لا يسمح بالوصول إلى MAC Address — نستخدم بصمة جهاز + IP.

const EXAM_DEVICE_REGISTRY_KEY = "arabya_exam_device_registry";

function loadExamDeviceRegistry() {
  try {
    const raw = localStorage.getItem(EXAM_DEVICE_REGISTRY_KEY);
    if (!raw) return { bindings: [] };
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.bindings) ? parsed : { bindings: [] };
  } catch (e) {
    return { bindings: [] };
  }
}

function saveExamDeviceRegistry(registry) {
  try {
    localStorage.setItem(EXAM_DEVICE_REGISTRY_KEY, JSON.stringify(registry));
  } catch (e) {}
}

function pruneExamDeviceRegistry(registry) {
  const maxAgeMs = 1000 * 60 * 60 * 24 * 400;
  const now = Date.now();
  registry.bindings = (registry.bindings || []).filter(entry => {
    const savedAt = Number(entry.savedAt) || 0;
    return savedAt && now - savedAt < maxAgeMs;
  });
  return releaseDeviceBindingsForDeletedStudents(registry);
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCanvasFingerprintToken() {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = "#069";
    ctx.fillText("ARABYA.NET", 2, 2);
    return canvas.toDataURL();
  } catch (e) {
    return "";
  }
}

function getWebglFingerprintToken() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor || ""}|${renderer || ""}`;
  } catch (e) {
    return "";
  }
}

async function fetchClientIpAddress() {
  const providers = [
    {
      url: "https://api.ipify.org?format=json",
      parse: async res => {
        const data = await res.json();
        return String(data.ip || "").trim();
      }
    },
    {
      url: "https://api64.ipify.org?format=json",
      parse: async res => {
        const data = await res.json();
        return String(data.ip || "").trim();
      }
    },
    {
      url: "https://ipwho.is/",
      parse: async res => {
        const data = await res.json();
        return String(data.ip || "").trim();
      }
    },
    {
      url: "https://www.cloudflare.com/cdn-cgi/trace",
      parse: async res => {
        const text = await res.text();
        const match = text.match(/ip=([^\n]+)/);
        return match ? String(match[1]).trim() : "";
      }
    }
  ];

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(provider.url, {
        signal: controller.signal,
        cache: "no-store",
        mode: "cors"
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ip = await provider.parse(res);
      if (ip) return ip;
    } catch (e) {}
  }
  return "";
}

async function collectExamDeviceProfile() {
  const nav = navigator || {};
  const screenInfo = window.screen || {};
  const parts = [
    nav.userAgent || "",
    nav.language || "",
    nav.platform || "",
    nav.hardwareConcurrency || "",
    nav.deviceMemory || "",
    nav.maxTouchPoints || "",
    screenInfo.width || "",
    screenInfo.height || "",
    screenInfo.colorDepth || "",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    getCanvasFingerprintToken(),
    getWebglFingerprintToken()
  ];
  const fingerprintSeed = parts.join("||");
  const deviceFingerprint = await sha256Hex(fingerprintSeed);
  const clientIp = await fetchClientIpAddress();
  const deviceId = await sha256Hex(`${deviceFingerprint}|${clientIp || "no-ip"}`);
  return {
    deviceId,
    deviceFingerprint,
    clientIp: clientIp || "",
    userAgent: (nav.userAgent || "").slice(0, 240),
    platform: nav.platform || "",
    screen: `${screenInfo.width || 0}x${screenInfo.height || 0}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    collectedAt: new Date().toISOString()
  };
}

function examDeviceProfileFromStudent(student) {
  if (!student) return null;
  if (!student.deviceId && !student.deviceFingerprint) return null;
  return {
    deviceId: student.deviceId || "",
    deviceFingerprint: student.deviceFingerprint || "",
    clientIp: student.lastKnownIp || student.clientIp || "",
    userAgent: student.deviceMeta?.userAgent || "",
    platform: student.deviceMeta?.platform || "",
    screen: student.deviceMeta?.screen || "",
    timezone: student.deviceMeta?.timezone || "",
    collectedAt: student.lastDeviceSeenAt || ""
  };
}

function attachDeviceFieldsToResult(res) {
  if (!res) return res;
  const profile = systemState.examDeviceProfile || examDeviceProfileFromStudent(systemState.currentStudent);
  if (profile) Object.assign(res, buildResultDeviceFields(profile));
  return res;
}

function mergeDeviceProfileIntoStudent(student, profile) {
  if (!student || !profile) return student;
  student.deviceId = profile.deviceId;
  student.deviceFingerprint = profile.deviceFingerprint;
  student.lastKnownIp = profile.clientIp || student.lastKnownIp || "";
  student.lastDeviceSeenAt = profile.collectedAt || new Date().toISOString();
  student.deviceMeta = {
    platform: profile.platform || "",
    screen: profile.screen || "",
    timezone: profile.timezone || "",
    userAgent: profile.userAgent || ""
  };
  return student;
}

function deviceBindingMatchesEntry(profile, entry) {
  if (!profile || !entry) return false;
  return !!(profile.deviceFingerprint && entry.deviceFingerprint && profile.deviceFingerprint === entry.deviceFingerprint);
}

function findDeviceExamAttemptConflict(profile, examId, studentContext) {
  if (!examId || !studentContext) return null;
  if (findActiveRetakeGrant(null, examId, studentContext)) return null;

  let sameStudentBlock = null;
  let otherStudentBlock = null;

  (systemState.results || []).forEach(r => {
    if (!r || r.examId !== examId || isSupersededResult(r)) return;
    if (isResultIpReleasedByStaff(r)) return;
    if (r.allowRetake === true) return;

    const isFinished = r.status !== "incomplete" && (r.status === "completed" || r.status === "canceled");
    const isInProgress = r.status === "incomplete";
    const sameStudent = resultMatchesStudentIdentity(r, studentContext);

    if (sameStudent) {
      if (isFinished && !sameStudentBlock) sameStudentBlock = r;
      return;
    }

    if (isResultFromDeletedStudent(r)) return;
    if (!profile || !deviceHardwareMatchesResult(profile, r)) return;
    if ((isFinished || isInProgress) && !otherStudentBlock) otherStudentBlock = r;
  });

  if (sameStudentBlock) return { kind: "same_student", result: sameStudentBlock };
  if (otherStudentBlock) return { kind: "other_student", result: otherStudentBlock };
  return null;
}

function findDeviceBindingConflict(profile, examId, studentLookupKey, studentContext) {
  if (studentContext && canStudentBypassExamLockForExam(examId, studentContext)) return null;
  if (!profile || !studentLookupKey) return null;
  if (!profile.deviceFingerprint && !profile.deviceId) return null;
  const registry = releaseDeviceBindingsForDeletedStudents(pruneExamDeviceRegistry(loadExamDeviceRegistry()));
  saveExamDeviceRegistry(registry);
  const bindings = registry.bindings || [];
  const isActiveConflict = entry =>
    entry.studentLookupKey &&
    entry.studentLookupKey !== studentLookupKey &&
    !isRegistryBindingForDeletedStudent(entry) &&
    deviceBindingMatchesEntry(profile, entry);
  const globalConflict = bindings.find(isActiveConflict);
  if (globalConflict) return globalConflict;
  if (!examId) return null;
  return bindings.find(entry =>
    entry.examId === examId && isActiveConflict(entry)
  ) || null;
}

function registerExamDeviceBinding(deviceProfile, studentLookupKey, studentName, examId) {
  if (!deviceProfile?.deviceFingerprint && !deviceProfile?.deviceId) return;
  if (!studentLookupKey || !examId) return;
  const registry = pruneExamDeviceRegistry(loadExamDeviceRegistry());
  registry.bindings = (registry.bindings || []).filter(entry =>
    !deviceBindingMatchesEntry(deviceProfile, entry) ||
    (entry.examId === examId && entry.studentLookupKey === studentLookupKey)
  );
  const existingIdx = registry.bindings.findIndex(entry =>
    entry.examId === examId && entry.studentLookupKey === studentLookupKey
  );
  const row = {
    deviceId: deviceProfile.deviceId,
    deviceFingerprint: deviceProfile.deviceFingerprint,
    clientIp: deviceProfile.clientIp || "",
    studentLookupKey,
    studentName: studentName || "",
    examId,
    boundAt: new Date().toISOString(),
    savedAt: Date.now()
  };
  if (existingIdx >= 0) registry.bindings[existingIdx] = { ...registry.bindings[existingIdx], ...row };
  else registry.bindings.push(row);
  saveExamDeviceRegistry(registry);
}

async function logExamDeviceReject_(entry) {
  if (!window.ArabyaPlatformSync) return;
  try {
    await window.ArabyaPlatformSync.logDeviceRejectToCloud({
      ...entry,
      actor: window.ArabyaPlatformSync.getCloudSyncActor()
    });
  } catch (e) {}
}

async function enforceExamDeviceBinding(studentLookupKey, studentName, examId, studentContext) {
  const profile = await collectExamDeviceProfile();
  purgeStaleDeviceBindingsForProfile(profile);
  if (!profile.deviceFingerprint) {
    const fail = {
      ok: false,
      message: "تعذر إنشاء بصمة الجهاز في هذا المتصفح. جرّب متصفحاً حديثاً (Chrome / Edge / Firefox) ثم أعد المحاولة.",
      profile
    };
    void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: fail.message, deviceFingerprint: "", clientIp: profile?.clientIp || "" });
    return fail;
  }
  const exam = (systemState.exams || []).find(e => e.id === examId) || systemState.currentExam;
  if (window.ArabyaPlatformSync) {
    const hallCheck = window.ArabyaPlatformSync.checkExamHallIp(exam, profile.clientIp);
    if (!hallCheck.ok) {
      void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: hallCheck.message, deviceFingerprint: profile.deviceFingerprint, clientIp: profile.clientIp });
      return { ok: false, message: hallCheck.message, profile };
    }
    const maxDev = window.ArabyaPlatformSync.checkMaxStudentDevices(studentLookupKey);
    if (!maxDev.ok) {
      void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: maxDev.message, deviceFingerprint: profile.deviceFingerprint, clientIp: profile.clientIp });
      return { ok: false, message: maxDev.message, profile };
    }
  }
  const ctx = studentContext || buildStudentMatchContext({
    studentKey: studentLookupKey,
    name: studentName || ""
  });
  const ipAllowlisted = isIpOnExamAllowlist(exam, profile.clientIp);
  const ipSlot = checkExamSharedIpAdmission(exam, profile.clientIp, studentLookupKey, ctx);
  if (!ipSlot.ok) {
    void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: ipSlot.message, deviceFingerprint: profile.deviceFingerprint, clientIp: profile.clientIp });
    return { ok: false, message: ipSlot.message, profile };
  }
  if (!ipAllowlisted) {
    const attemptConflict = findDeviceExamAttemptConflict(profile, examId, ctx);
    if (attemptConflict?.kind === "same_student") {
      const msg = getExamBlockingMessage(attemptConflict.result);
      void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: msg, deviceFingerprint: profile.deviceFingerprint, clientIp: profile.clientIp });
      return { ok: false, message: msg, profile };
    }
    if (attemptConflict?.kind === "other_student") {
      const other = attemptConflict.result || {};
      const msg =
        "تم رفض الدخول: هذا الجهاز/المتصفح استُخدم مسبقاً لامتحان آخر على نفس الحساب أو لطالب آخر.\n\n" +
        `آخر طالب مسجّل على الجهاز: ${other.name || other.studentName || "غير معروف"}.\n` +
        "يجب أن يؤدي كل طالب الامتحان من جهازه الشخصي فقط — لا يمكن أداء الامتحان لصالح زميل على نفس الجهاز.";
      void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: msg, deviceFingerprint: profile.deviceFingerprint, clientIp: profile.clientIp });
      return { ok: false, message: msg, profile };
    }
    const conflict = findDeviceBindingConflict(profile, examId, studentLookupKey, ctx);
    if (conflict) {
      const msg =
        "تم رفض الدخول: هذا الجهاز/المتصفح مرتبط بطالب آخر في المنصة.\n\n" +
        `الطالب المسجّل سابقاً على الجهاز: ${conflict.studentName || "غير معروف"}.\n` +
        "يجب أن يؤدي كل طالب الامتحان من جهازه الشخصي فقط — لا يمكن أداء الامتحان لصالح زميل على نفس الجهاز.";
      void logExamDeviceReject_({ studentLookupKey, studentName, examId, message: msg, deviceFingerprint: profile.deviceFingerprint, clientIp: profile.clientIp });
      return { ok: false, message: msg, profile };
    }
  }
  registerExamDeviceBinding(profile, studentLookupKey, studentName, examId);
  return { ok: true, profile };
}

function buildResultDeviceFields(profile) {
  if (!profile) return {};
  return {
    deviceId: profile.deviceId || "",
    deviceFingerprint: profile.deviceFingerprint || "",
    clientIp: profile.clientIp || "",
    deviceMeta: {
      platform: profile.platform || "",
      screen: profile.screen || "",
      timezone: profile.timezone || "",
      userAgent: profile.userAgent || ""
    }
  };
}

function renderTeacherResultDeviceIpPanel(res) {
  const infoEl = document.getElementById("detail-device-info");
  const staffBox = document.getElementById("detail-ip-staff-controls");
  const ipInput = document.getElementById("detail-result-ip-input");
  const releaseStatus = document.getElementById("detail-ip-release-status");
  if (!infoEl) return;

  const hasData = !!(res?.deviceFingerprint || res?.deviceId || res?.clientIp);
  if (!hasData && !canManageResultDeviceIp()) {
    infoEl.innerHTML = '<span style="color:var(--warning);">لم تُسجَّل بصمة جهاز أو IP لهذا السجل.</span>';
  } else if (hasData) {
    infoEl.innerHTML = formatTeacherDeviceInfoHtml(res);
  } else {
    infoEl.innerHTML = '<span style="color:var(--text-muted);">لا توجد بيانات جهاز مسجّلة — يمكنك تسجيل أو حذف IP بالأسفل.</span>';
  }

  if (staffBox) {
    staffBox.classList.toggle("hidden", !canManageResultDeviceIp());
  }
  if (ipInput) {
    ipInput.value = (res?.clientIp || "").trim();
    ipInput.disabled = isSupersededResult(res);
  }
  if (releaseStatus) {
    if (isResultIpReleasedByStaff(res)) {
      releaseStatus.innerHTML = `<span style="color:var(--secondary); font-weight:700;">تم تحرير قفل IP/الجهاز — يمكن للطالب إعادة الامتحان ببيانات مختلفة.</span>` +
        `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">بواسطة: ${escapeHtml(res.ipReleasedBy || "—")} · ${escapeHtml(formatRetakeTimestamp(res.ipReleasedAt))}</div>`;
    } else {
      releaseStatus.innerHTML = '<span style="color:var(--text-muted);">لم يُحرَّر IP بعد. الحذف أو التعديل يفتح إعادة الدخول للامتحان نفسه.</span>';
    }
  }
  renderDetailExamAllowedIpsList(res?.examId || "");
}

window.saveResultIpByTeacher = async function() {
  const res = systemState.currentGradingResult;
  if (!res) return;
  const ipInput = document.getElementById("detail-result-ip-input");
  const newIp = ipInput ? ipInput.value.trim() : "";
  const msg = newIp
    ? `تأكيد تعديل IP إلى "${newIp}"؟\n\nسيتمكن الطالب من إعادة أداء نفس الامتحان ببيانات مختلفة.`
  : "تأكيد حذف IP؟ سيتمكن الطالب من إعادة أداء نفس الامتحان ببيانات مختلفة.";
  if (!confirm(msg)) return;
  const syncEl = document.getElementById("grading-sync-status");
  await applyResultIpReleaseByStaff(res, newIp, syncEl);
  alert(newIp ? "تم تحديث IP ومزامنة السجل." : "تم حذف IP وفتح إعادة الدخول للامتحان — تمت المزامنة.");
};

window.deleteResultIpByTeacher = async function() {
  const res = systemState.currentGradingResult;
  if (!res) return;
  if (!confirm("هل تريد حذف عنوان IP لهذا السجل؟\n\nسيتمكن الطالب من إعادة أداء نفس الامتحان من نفس الجهاز ببيانات مختلفة (اسم/معرف/كود جديد).")) return;
  const syncEl = document.getElementById("grading-sync-status");
  if (document.getElementById("detail-result-ip-input")) {
    document.getElementById("detail-result-ip-input").value = "";
  }
  await applyResultIpReleaseByStaff(res, "", syncEl);
  alert("تم حذف IP وتحرير القفل — تم حفظ البيانات ومزامنتها مع Google Sheets.");
};

function formatTeacherDeviceInfoHtml(res) {
  const ip = (res?.clientIp || "").trim() || "غير متاح (حظر الشبكة أو بدون اتصال)";
  const fp = (res?.deviceFingerprint || "").trim();
  const deviceId = (res?.deviceId || "").trim();
  const meta = res?.deviceMeta || {};
  const fpShort = fp ? `${fp.slice(0, 16)}…` : "—";
  const idShort = deviceId ? `${deviceId.slice(0, 16)}…` : "—";
  return (
    `<div style="display:grid; gap:0.5rem; font-size:0.9rem;">` +
    `<div><strong>معرف الجهاز:</strong> <code title="${escapeHtml(deviceId)}">${escapeHtml(idShort)}</code></div>` +
    `<div><strong>بصمة الجهاز (SHA-256):</strong> <code title="${escapeHtml(fp)}">${escapeHtml(fpShort)}</code></div>` +
    `<div><strong>عنوان IP عند التقديم:</strong> <code>${escapeHtml(ip)}</code></div>` +
    `<div><strong>المنصة / الشاشة:</strong> ${escapeHtml(meta.platform || "—")} · ${escapeHtml(meta.screen || "—")}</div>` +
    `<div><strong>المنطقة الزمنية:</strong> ${escapeHtml(meta.timezone || "—")}</div>` +
    `<div style="font-size:0.78rem; color:var(--text-muted); word-break:break-all;"><strong>المتصفح:</strong> ${escapeHtml((meta.userAgent || "").slice(0, 120))}</div>` +
    `</div>`
  );
}

function renderTeacherDeviceInfo(res) {
  const el = document.getElementById("detail-device-info");
  if (!el) return;
  const hasData = !!(res?.deviceFingerprint || res?.deviceId || res?.clientIp);
  if (!hasData) {
    el.innerHTML = `<span style="color:var(--warning);">لم تُسجَّل بصمة جهاز أو IP لهذا السجل (نتيجة قديمة أو امتحان قبل التحديث).</span>`;
    return;
  }
  el.innerHTML = formatTeacherDeviceInfoHtml(res);
}

function formatResultDeviceSummary(res) {
  const ip = (res?.clientIp || "").trim();
  if (ip) return ip;
  if (res?.deviceFingerprint) return `جهاز ${String(res.deviceFingerprint).slice(0, 8)}…`;
  return "—";
}

window.arabyaCollectExamDeviceProfile = collectExamDeviceProfile;

// ==========================================
// 9. آليات منع الغش وتأمين النوافذ
// ==========================================

function getExamDeviceCategory() {
  const ua = (navigator.userAgent || "").toLowerCase();
  const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  const narrow = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const tablet = window.matchMedia && window.matchMedia("(min-width: 769px) and (max-width: 1024px)").matches;
  if (narrow && touch) return "mobile";
  if (tablet || (touch && /ipad|tablet|android/i.test(ua))) return "tablet";
  return "desktop";
}

function isMobileExamDevice() {
  return getExamDeviceCategory() === "mobile";
}

function isTabletExamDevice() {
  return getExamDeviceCategory() === "tablet";
}

function getExamAntiCheatGraceMs() {
  const cat = getExamDeviceCategory();
  if (cat === "mobile") return 2500;
  if (cat === "tablet") return 2000;
  return 1500;
}

function markExamAntiCheatStarted() {
  systemState.examAntiCheatStartedAt = Date.now();
  startExamSecurityWatchdog();
  enableExamSecureMode();
}

function stopExamSecurityWatchdog() {
  clearExamHiddenTabTimer();
  if (systemState.examSecurityWatchInterval) {
    clearInterval(systemState.examSecurityWatchInterval);
    systemState.examSecurityWatchInterval = null;
  }
  disableExamSecureMode();
}

function enableExamSecureMode() {
  document.body.classList.add("exam-secure-mode");
  const runner = document.getElementById("exam-runner-view");
  if (runner) runner.classList.add("exam-secure-active");
}

function disableExamSecureMode() {
  document.body.classList.remove("exam-secure-mode");
  const runner = document.getElementById("exam-runner-view");
  if (runner) runner.classList.remove("exam-secure-active");
  const shield = document.getElementById("runner-security-shield");
  if (shield) shield.classList.add("hidden");
}

function showExamSecurityShield(message) {
  const shield = document.getElementById("runner-security-shield");
  if (!shield) return;
  shield.classList.remove("hidden");
  const textEl = document.getElementById("runner-security-shield-msg");
  if (textEl) textEl.textContent = message || "تم إخفاء شاشة الامتحان — العودة للتبويب مطلوبة.";
}

function hideExamSecurityShield() {
  const shield = document.getElementById("runner-security-shield");
  if (shield) shield.classList.add("hidden");
}

function clearExamHiddenTabTimer() {
  if (systemState.examHiddenTabTimer) {
    clearTimeout(systemState.examHiddenTabTimer);
    systemState.examHiddenTabTimer = null;
  }
}

function markExamClickGrace() {
  systemState.examClickGraceUntil = Date.now() + 450;
}

function isInExamClickGrace() {
  return !!(systemState.examClickGraceUntil && Date.now() < systemState.examClickGraceUntil);
}

function getExamTabHiddenMinMs() {
  return getExamDeviceCategory() === "mobile" ? 180 : 120;
}

function handleExamTabVisibilityChange(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return;

  if (!document.hidden) {
    clearExamHiddenTabTimer();
    const hiddenAt = systemState.examTabHiddenAt;
    systemState.examTabHiddenAt = null;
    if (hiddenAt) {
      const awayMs = Date.now() - hiddenAt;
      hideExamSecurityShield();
      if (!isInExamClickGrace() && awayMs >= getExamTabHiddenMinMs()) {
        recordAntiCheatViolation(reason || "visibility");
      }
    } else {
      hideExamSecurityShield();
    }
    return;
  }

  if (!systemState.examTabHiddenAt) {
    systemState.examTabHiddenAt = Date.now();
  }
  showExamSecurityShield("تم إخفاء تبويب الامتحان — العودة فوراً! مغادرة المتصفح أو التبويب تُسجَّل كمحاولة غش.");

  clearExamHiddenTabTimer();
  const delayMs = getExamDeviceCategory() === "mobile" ? 650 : 500;
  systemState.examHiddenTabTimer = setTimeout(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!document.hidden) return;
    if (isInExamClickGrace()) return;
    recordAntiCheatViolation(reason || "visibility");
  }, delayMs);
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  if (isInExamClickGrace()) {
    const visibilityReasons = new Set(["visibility", "visibility-watchdog", "pagehide", "freeze", "blur"]);
    if (visibilityReasons.has(reason)) return false;
  }
  const visibilityReasons = new Set(["visibility", "visibility-watchdog", "pagehide", "freeze"]);
  if (visibilityReasons.has(reason) && !document.hidden && reason !== "pagehide") return false;
  return true;
}

function recordAntiCheatViolation(reason) {
  if (!shouldTriggerFocusAntiCheat(reason)) return;
  const last = systemState.lastAntiCheatTriggerAt || 0;
  if (Date.now() - last < 900) return;
  systemState.lastAntiCheatTriggerAt = Date.now();
  triggerRunnerCheatPenalty(reason);
}

function startExamSecurityWatchdog() {
  stopExamSecurityWatchdog();
  systemState.examSecurityWatchInterval = setInterval(() => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!document.hidden) return;
    if (!systemState.examTabHiddenAt) {
      systemState.examTabHiddenAt = Date.now();
      showExamSecurityShield("تم إخفاء تبويب الامتحان — العودة فوراً! مغادرة المتصفح أو التبويب تُسجَّل كمحاولة غش.");
      return;
    }
    const awayMs = Date.now() - systemState.examTabHiddenAt;
    const threshold = getExamDeviceCategory() === "mobile" ? 900 : 700;
    if (awayMs >= threshold && !isInExamClickGrace()) {
      recordAntiCheatViolation("visibility-watchdog");
    }
  }, 450);
}

function getExamBlockingMessage(blockingResult) {
  if (!blockingResult) return "";
  if (blockingResult.status === "canceled") {
    return "تم إلغاء امتحانك سابقاً بسبب مخالفة قواعد الامتحان.\n\nاطلب من المعلم «السماح بإعادة الامتحان» من تبويب النتائج، ثم حاول الدخول مرة أخرى.";
  }
  return "لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً.\n\nإذا احتجت محاولة جديدة، اطلب من المعلم «السماح بإعادة الامتحان».";
}

function getCheatReasonLabel(reason) {
  const actionMap = {
    blur: "الخروج من نافذة الامتحان",
    visibility: "إخفاء تبويب الامتحان أو فتح تبويب آخر",
    "visibility-watchdog": "إبقاء تبويب الامتحان مخفياً أو التبديل لتطبيق آخر",
    "focus-watchdog": "فقدان تركيز نافذة الامتحان",
    pagehide: "محاولة مغادرة صفحة الامتحان",
    freeze: "تعليق صفحة الامتحان أثناء التبديل",
    screenshot: "محاولة التقاط لقطة شاشة",
    copy: "محاولة النسخ",
    cut: "محاولة القص",
    paste: "محاولة اللصق",
    "keyboard-shortcut": "استخدام اختصار لوحة مفاتيح محظور"
  };
  return actionMap[reason] || "مخالفة قواعد الامتحان";
}


function buildCheatTrackingFieldsFromResult(res) {
  if (!res) return buildCheatTrackingFields();
  const log = Array.isArray(res.cheatAttemptLog) ? res.cheatAttemptLog : [];
  const violations = Number(res.cheatViolations);
  let maxAllowed = res.maxCheatAttemptsAllowed;
  if (maxAllowed === undefined || maxAllowed === null || maxAllowed === "") {
    const exam = Array.isArray(systemState.exams)
      ? systemState.exams.find(e => e && e.id === res.examId)
      : null;
    maxAllowed = getExamMaxCheatAttempts(exam || systemState.currentExam);
  }
  return {
    cheatViolations: Number.isFinite(violations) ? violations : log.length,
    cheatAttemptLog: log,
    maxCheatAttemptsAllowed: maxAllowed
  };
}

function buildCheatTrackingFields() {
  const log = Array.isArray(systemState.cheatAttemptLog) ? [...systemState.cheatAttemptLog] : [];
  const maxAllowed = systemState.examMaxCheatAttemptsAllowed ?? getExamMaxCheatAttempts(systemState.currentExam);
  return {
    cheatViolations: log.length,
    cheatAttemptLog: log,
    maxCheatAttemptsAllowed: maxAllowed
  };
}

function recordCheatAttempt(reason) {
  if (!Array.isArray(systemState.cheatAttemptLog)) {
    systemState.cheatAttemptLog = [];
  }
  systemState.cheatAttemptLog.push({
    reason: reason || "unknown",
    label: getCheatReasonLabel(reason),
    at: new Date().toISOString()
  });
  systemState.cheatViolations = systemState.cheatAttemptLog.length;
  updateLiveIncompleteResult();
  saveActiveStudentSession();
}

function formatCheatAttemptsTeacherSummary(res) {
  const count = Number(res?.cheatViolations) || 0;
  if (!count) return "";
  const max = res.maxCheatAttemptsAllowed ?? res.maxCheatAttempts ?? "—";
  return `محاولات غش: ${count} / ${max}`;
}

function formatCheatAttemptsExportText(res) {
  const log = Array.isArray(res?.cheatAttemptLog) ? res.cheatAttemptLog : [];
  if (!log.length) return "";
  return log.map((entry, idx) => `${idx + 1}. ${entry.label || entry.reason || "غش"} (${entry.at || ""})`).join(" | ");
}

function renderTeacherCheatAttemptsPanel(res) {
  const panel = document.getElementById("detail-cheat-attempts-panel");
  const listEl = document.getElementById("detail-cheat-attempts-list");
  const summaryEl = document.getElementById("detail-cheat-attempts-summary");
  if (!panel || !listEl) return;

  const count = Number(res?.cheatViolations) || 0;
  const max = res.maxCheatAttemptsAllowed ?? res.maxCheatAttempts ?? "—";
  const log = Array.isArray(res.cheatAttemptLog) ? res.cheatAttemptLog : [];
  const ip = (res?.clientIp || "").trim() || "—";
  const fp = (res?.deviceFingerprint || "").trim();
  const fpShort = fp ? `${fp.slice(0, 20)}…` : "—";
  const retakeLine = resultHasActiveRetakeGrant(res)
    ? `<span style="color:var(--secondary); font-weight:700;">مسموح بإعادة التقديم</span>`
    : isResultIpReleasedByStaff(res)
      ? `<span style="color:var(--accent); font-weight:700;">تم تحرير IP/الجهاز للمعلم</span>`
      : `<span style="color:var(--text-muted);">لا يوجد سماح بإعادة تقديم نشط</span>`;

  if (!count && !log.length && !fp && !res?.clientIp) {
    panel.classList.add("hidden");
    listEl.innerHTML = "";
    if (summaryEl) summaryEl.textContent = "";
    return;
  }

  panel.classList.remove("hidden");
  if (summaryEl) {
    summaryEl.innerHTML =
      `<div style="display:grid; gap:0.35rem;">` +
      `<div><strong style="color:var(--error);">محاولات الغش:</strong> ${count} من ${max}</div>` +
      `<div><strong>IP عند التقديم:</strong> <code>${escapeHtml(ip)}</code></div>` +
      `<div><strong>بصمة الجهاز:</strong> <code title="${escapeHtml(fp)}">${escapeHtml(fpShort)}</code></div>` +
      `<div><strong>إعادة التقديم:</strong> ${retakeLine}</div>` +
      `</div>`;
  }

  if (!log.length) {
    listEl.innerHTML = `<div style="font-size:0.85rem; color:var(--text-muted); padding:0.5rem 0;">لا يوجد سجل تفصيلي لكل محاولة — العدد الإجمالي مسجّل في النتيجة فقط.</div>`;
    return;
  }

  listEl.innerHTML = log.map((entry, idx) => {
    const when = entry.at ? formatRetakeTimestamp(entry.at) : "—";
    const detail = entry.detail || entry.meta || "";
    return `<div class="detail-cheat-attempt-item" style="padding:0.75rem 1rem; margin-bottom:0.5rem; border:1px solid rgba(239,68,68,0.25); border-radius:8px; background:rgba(239,68,68,0.05);">` +
      `<div style="font-weight:700; color:var(--error);">محاولة غش ${idx + 1}</div>` +
      `<div style="font-size:0.9rem; margin-top:0.25rem;">${escapeHtml(entry.label || entry.reason || "غش")}</div>` +
      `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">${escapeHtml(when)}</div>` +
      (detail ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.2rem;">${escapeHtml(String(detail))}</div>` : "") +
      `</div>`;
  }).join("");
}

function getCheatPenaltyMessage(reason, isExamCanceled) {
  const actionText = getCheatReasonLabel(reason);
  const deviceHint = getExamDeviceCategory() === "mobile"
    ? "على الهاتف: لا تخرج من المتصفح ولا تفتح تطبيقات أخرى أثناء الحل."
    : getExamDeviceCategory() === "tablet"
      ? "على التابلت: ابقَ داخل تبويب الامتحان فقط."
      : "على الكمبيوتر: لا تفتح نوافذ أو تبويبات أخرى أثناء الامتحان.";
  if (isExamCanceled) {
    return `<span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان</span>` +
      `تم تسجيل محاولة غش: ${actionText}.<br>` +
      `تم إنهاء الاختبار وفق قواعد المعلم.<br>` +
      `<span style="font-size:0.9rem; color:var(--text-muted);">${deviceHint}</span>`;
  }
  return `<span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تم رصد محاولة غش</span>` +
    `${actionText}.<br>` +
    `تم إلغاء السؤال الحالي وتصفير درجته والانتقال للسؤال التالي.<br>` +
    `<span style="font-size:0.9rem; color:var(--text-muted);">${deviceHint}</span>`;
}

function preventExamClipboardAction(e) {
  if (!systemState.isExamActive) return;
  e.preventDefault();
}

function blockExamRightClick(e) {
  if (!systemState.isExamActive) return;
  if (e.button === 2) e.preventDefault();
}

function setupAntiCheatHandlers() {
  window.addEventListener("beforeunload", e => {
    if (systemState.isExamActive) {
      saveActiveStudentSession();
      updateLiveIncompleteResult();
      e.preventDefault();
      e.returnValue = "امتحانك نشط الآن. مغادرة الصفحة تُسجَّل كمخالفة أمنية.";
      return e.returnValue;
    }
  });

  window.addEventListener("pagehide", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (isInExamClickGrace()) return;
    recordAntiCheatViolation("pagehide");
  });

  document.addEventListener("visibilitychange", () => {
    if (!systemState.isExamActive) return;
    handleExamTabVisibilityChange("visibility");
  });

  document.addEventListener("freeze", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (!systemState.examTabHiddenAt) systemState.examTabHiddenAt = Date.now();
    handleExamTabVisibilityChange("freeze");
  });

  window.addEventListener("blur", () => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    setTimeout(() => {
      if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
      if (isInExamClickGrace()) return;
      if (document.hidden) return;
      if (!document.hasFocus()) {
        recordAntiCheatViolation("blur");
      }
    }, 400);
  });

  document.addEventListener("contextmenu", e => {
    if (systemState.isExamActive) e.preventDefault();
  });
  document.addEventListener("mousedown", blockExamRightClick);
  document.addEventListener("auxclick", blockExamRightClick);

  document.addEventListener("copy", preventExamClipboardAction);
  document.addEventListener("cut", preventExamClipboardAction);
  document.addEventListener("paste", preventExamClipboardAction);

  document.addEventListener("selectstart", e => {
    if (!systemState.isExamActive) return;
    const t = e.target;
    if (t && (t.closest(".option-card, button, textarea, input, select, a, label") || t.isContentEditable)) {
      return;
    }
    e.preventDefault();
  });

  document.addEventListener("dragstart", e => {
    if (systemState.isExamActive) e.preventDefault();
  });

  document.addEventListener("keydown", e => {
    if (!systemState.isExamActive) return;
    const commandKey = e.ctrlKey || e.metaKey;
    if (
      e.key === "F12" ||
      (commandKey && e.shiftKey && /[icjcek]/i.test(e.key)) ||
      (commandKey && /[us]/i.test(e.key))
    ) {
      e.preventDefault();
      alert("حظر: غير مسموح بفتح أدوات المطور أو حفظ الصفحة أثناء الامتحان!");
      return false;
    }
    if (commandKey && /[cvxa]/i.test(e.key)) {
      e.preventDefault();
      return false;
    }
    if (commandKey && /p/i.test(e.key)) {
      e.preventDefault();
      alert("حظر: غير مسموح بالطباعة لحماية سرية الأسئلة!");
      return false;
    }
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      if (!systemState.isCheatingSuspended) recordAntiCheatViolation("screenshot");
      return false;
    }
    if (e.key === "Meta" || e.key === "OS") {
      e.preventDefault();
      if (!systemState.isCheatingSuspended) recordAntiCheatViolation("keyboard-shortcut");
    }
  });

  document.addEventListener("keyup", e => {
    if (!systemState.isExamActive || systemState.isCheatingSuspended) return;
    if (e.key === "PrintScreen" || e.keyCode === 44) {
      recordAntiCheatViolation("screenshot");
    }
  });
}

function requestSecureExamMode() {
  clearExamHiddenTabTimer();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function releaseSecureExamMode() {
  clearExamHiddenTabTimer();
  stopExamSecurityWatchdog();
  disableExamSecureMode();
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function getMaxCheatAttemptsForExam(exam) {
  const parsed = parseInt(exam?.maxCheatAttempts, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 5;
}

function triggerRunnerCheatPenalty(reason) {
  systemState.isCheatingSuspended = true;
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  recordCheatAttempt(reason);

  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  if (currentQ && currentQ.type === "essay") {
    systemState.studentAnswers[currentQ.id] = "(ملغي - تم كشف محاولة غش/تصوير)";
  } else if (currentQ) {
    systemState.studentAnswers[currentQ.id] = -2;
  }

  const overlay = document.getElementById("runner-cheat-overlay");
  const mainWrapper = document.getElementById("app-main-wrapper");
  const msg = document.getElementById("runner-cheat-msg");
  const exam = systemState.currentExam;
  const maxViolations = getMaxCheatAttemptsForExam(exam);
  const shouldCancel = shouldCancelExamForCheating(exam, systemState.cheatViolations);

  mainWrapper.classList.add("blurred-content");
  overlay.classList.remove("hidden");

  if (shouldCancel) {
    msg.innerHTML = getCheatPenaltyMessage(reason, true);

    systemState.shuffledQuestions.forEach(q => {
      if (systemState.studentAnswers[q.id] === undefined) {
        if (q.type === "essay") {
          systemState.studentAnswers[q.id] = "(ملغي - غش)";
        } else {
          systemState.studentAnswers[q.id] = -2;
        }
      }
    });

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      systemState.isExamActive = false;
      submitCheatedExam();
    }, 4500);
  } else {
    msg.innerHTML = getCheatPenaltyMessage(reason, false);

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      runnerNextQuestion(true);
    }, 4000);
  }
}
function submitCheatedExam() {
  // تنظيف الجلسة الحية وحذف السجل غير المكتمل
  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === systemState.currentExam.id && r.status === "incomplete"));
  localStorage.removeItem("arabya_active_student_session");
  releaseSecureExamMode();

  const exam = systemState.currentExam;
  const examTotalScore = getCurrentExamTotalScore();
  const scoreString = `0 / ${examTotalScore} (ملغي - غش متكرر)`;
  const detailsFormatted = "تم إلغاء الامتحان وتصفير النتيجة نهائياً لمخالفة تعليمات الاختبار وتكرار محاولة الغش أو الخروج من الصفحة.";

  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};
  exam.questions.forEach(q => {
    questionScoresMap[q.id] = 0;
  });

  const resultObj = {
    recordId: createRecordId("result"),
    savedAt: Date.now(),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode || "",
    studentLookupKey,
    email: systemState.currentStudent.email || "",
    mobile: systemState.currentStudent.mobile || "",
    examTitle: systemState.currentExam.title,
    examId: systemState.currentExam.id,
    university: systemState.currentExam.university,
    faculty: systemState.currentExam.faculty,
    level: systemState.currentExam.level,
    examType: systemState.currentExam.examType,
    score: scoreString,
    details: detailsFormatted,
    timestamp: new Date().toLocaleString("ar-EG"),
    studentAnswers: studentAnswersMap,
    questionScores: questionScoresMap,
    maxScore: examTotalScore,
    presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions || [])),
    status: "canceled",
    allowRetake: false,
    ...buildCheatTrackingFields(),
    ...buildResultDeviceFields(systemState.examDeviceProfile)
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(false);

  navigateToView("student-result-view");
  document.getElementById("runner-res-score").innerText = "0";
  document.getElementById("runner-res-total").innerText = examTotalScore;
  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id || "--";
  document.getElementById("runner-res-title").innerText = `${systemState.currentExam.title} [${systemState.currentExam.examType}]`;

  const statusEl = document.getElementById("runner-res-status");
  statusEl.innerText = "تم إلغاء امتحانك بسبب اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تواصل مع المعلم إذا لزم الأمر.";
  statusEl.style.color = "var(--error)";

  const syncEl = document.getElementById("runner-res-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة السجل مع Google Sheets...`;
  }
  if (archivedAttempts && archivedAttempts.length) {
    syncRetakeAffectedResultsToCloud(archivedAttempts);
  }
  void sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("exam_submit_cheat");
  }
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
