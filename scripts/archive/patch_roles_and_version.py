#!/usr/bin/env python3
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")

ROLE_BLOCK = '''
const ARABYA_ACCOUNT_ROLES = {
  SUPER_ADMIN: "super_admin",
  TEACHER: "teacher",
  STUDENT: "student"
};
const ARABYA_SUPER_ADMIN_SEEDS = new Set(["TEACHER2026"]);

function inferTeacherRole(teacher) {
  if (!teacher) return ARABYA_ACCOUNT_ROLES.TEACHER;
  if (teacher.role === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) return ARABYA_ACCOUNT_ROLES.SUPER_ADMIN;
  const username = String(teacher.username || "").trim();
  const password = String(teacher.password || "").trim();
  const autoCode = String(teacher.autoEntryCode || "").trim();
  if (ARABYA_SUPER_ADMIN_SEEDS.has(username) || ARABYA_SUPER_ADMIN_SEEDS.has(password) || ARABYA_SUPER_ADMIN_SEEDS.has(autoCode)) {
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

function getTeacherRoleLabel(teacher) {
  return isSuperAdminTeacher(teacher) ? "مدير المنصة (سوبر أدمن)" : "حساب معلم";
}

function updateTeacherAppVersionLabel() {
  const versionEl = document.getElementById("teacher-app-version-label");
  if (versionEl) versionEl.textContent = `إصدار التطبيق: ${ARABYA_APP_VERSION}`;
}

function updateTeacherDashboardAccessUI() {
  updateTeacherAppVersionLabel();
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

function renderTeacherAccountsPanel() {
  const tbody = document.getElementById("teacher-accounts-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!isSuperAdminTeacher()) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted);">عرض حسابات المعلمين متاح لمدير المنصة فقط.</td></tr>';
    return;
  }
  if (!systemState.teachers.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted);">لا توجد حسابات معلمين.</td></tr>';
    return;
  }
  systemState.teachers.forEach(teacher => {
    const isSelf = systemState.activeTeacher && teacher.username === systemState.activeTeacher.username;
    const roleLabel = inferTeacherRole(teacher) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN ? "سوبر أدمن" : "معلم";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(teacher.name || "")}</td>
      <td><code>${escapeHtml(teacher.username || "")}</code></td>
      <td>${escapeHtml(roleLabel)}</td>
      <td><code>${escapeHtml(teacher.autoEntryCode || "—")}</code></td>
      <td class="teacher-accounts-actions" style="display:flex;gap:0.35rem;flex-wrap:wrap;"></td>
    `;
    const actions = row.querySelector(".teacher-accounts-actions");
    if (isSelf) {
      actions.textContent = "حسابك الحالي";
    } else if (inferTeacherRole(teacher) === ARABYA_ACCOUNT_ROLES.SUPER_ADMIN) {
      actions.textContent = "—";
    } else if (canDeleteTeachers()) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-outline btn-sm";
      delBtn.style.cssText = "border-color:var(--error);color:var(--error);";
      delBtn.textContent = "حذف";
      delBtn.addEventListener("click", () => deleteTeacherAccount(teacher.username));
      actions.appendChild(delBtn);
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
  systemState.teachers = systemState.teachers.filter(t => t.username !== username);
  saveTeachersToLocalStorage();
  renderTeacherAccountsPanel();
  const synced = await syncLocalDatabaseToCloud();
  alert(synced ? "تم حذف حساب المعلم ومزامنة التغيير." : "تم حذف حساب المعلم محلياً.");
};

function ensureStudentAccountType(student) {
  if (!student) return student;
  if (!student.accountType) student.accountType = ARABYA_ACCOUNT_ROLES.STUDENT;
  return student;
}

'''

if "ARABYA_ACCOUNT_ROLES" not in text:
    needle = "window.ARABYA_APP_VERSION = ARABYA_APP_VERSION;"
    if needle not in text:
        raise SystemExit("version marker missing")
    text = text.replace(needle, needle + ROLE_BLOCK, 1)

replacements = [
    (
        """    const defaultTeacher = {
      name: "معلم اللغة العربية",
      username: "معلم اللغة العربية",
      subject: "اللغة العربية وآدابها",
      password: "TEACHER2026",
      autoEntryCode: "TEACHER2026",
      integrationConfig: {
        googleFormUrl: "",
        entryName: "",
        entryId: "",
        entryCode: "",
        entryScore: "",
        entryDetails: ""
      }
    };
    systemState.teachers.push(defaultTeacher);
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
  }""",
        """    const defaultTeacher = {
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

  normalizeAllTeacherAccounts();""",
        "default teacher",
    ),
    (
        """  console.log(`[ARABYA] إصدار المنصة: ${ARABYA_APP_VERSION}`);""",
        """  console.log(`[ARABYA] إصدار المنصة: ${ARABYA_APP_VERSION}`);
  updateTeacherAppVersionLabel();""",
        "dom version label",
    ),
    (
        'const TEACHER_TAB_IDS = ["stats", "exams", "results", "students", "integration", "profile"];',
        'const TEACHER_TAB_IDS = ["stats", "exams", "results", "students", "integration", "profile", "admins"];',
        "tab ids",
    ),
    (
        """function loginTeacherObject(teacher) {
  systemState.activeTeacher = teacher;
  localStorage.setItem("arabya_active_teacher_username", teacher.username);""",
        """function loginTeacherObject(teacher) {
  systemState.activeTeacher = normalizeTeacherAccount(teacher);
  localStorage.setItem("arabya_active_teacher_username", teacher.username);""",
        "login normalize",
    ),
    (
        """    autoEntryCode: teacher.autoEntryCode || teacher.password
  };
}""",
        """    autoEntryCode: teacher.autoEntryCode || teacher.password
  };
  updateTeacherDashboardAccessUI();
}""",
        "login ui",
    ),
    (
        """function loadTeacherDashboardData() {
  if (!systemState.activeTeacher) return;
  
  // تحديث عنوان التسمية الجانبية
  document.getElementById("teacher-sidebar-subtitle").innerText = `المعلم: ${systemState.activeTeacher.name}`;""",
        """function loadTeacherDashboardData() {
  if (!systemState.activeTeacher) return;
  normalizeTeacherAccount(systemState.activeTeacher);
  updateTeacherDashboardAccessUI();""",
        "load dashboard ui",
    ),
    (
        """  } else if (normalizedTab === "exams") {
    renderExamsList();
  }
  return normalizedTab;""",
        """  } else if (normalizedTab === "exams") {
    renderExamsList();
  } else if (normalizedTab === "admins") {
    renderTeacherAccountsPanel();
  }
  return normalizedTab;""",
        "admins tab",
    ),
    (
        """function handleTeacherRegister() {
  const name = document.getElementById("teacher-reg-name").value.trim();""",
        """function handleTeacherRegister() {
  if (!canUsePublicTeacherRegistration() && (!systemState.activeTeacher || !isTeacherStaffAccount())) {
    alert("إنشاء حساب معلم جديد من الصفحة العامة متاح لمدير المنصة (سوبر أدمن) فقط. سجّل دخولك كمدير ثم أضف المعلم من تبويب «حسابات المعلمين».");
    navigateToView("teacher-login-view");
    return;
  }

  const name = document.getElementById("teacher-reg-name").value.trim();""",
        "register guard",
    ),
    (
        """  const newTeacher = {
    name,
    username,
    subject,
    password,
    autoEntryCode: autoCode,
    integrationConfig: {""",
        """  const newTeacher = normalizeTeacherAccount({
    name,
    username,
    subject,
    password,
    autoEntryCode: autoCode,
    role: ARABYA_ACCOUNT_ROLES.TEACHER,
    integrationConfig: {""",
        "new teacher role",
    ),
    (
        """      entryDetails: ""
    }
  };

  systemState.teachers.push(newTeacher);""",
        """      entryDetails: ""
    }
  });

  systemState.teachers.push(newTeacher);""",
        "new teacher close",
    ),
    (
        """window.deleteStudentByTeacher = async function(studentKey) {
  const student = findStudentByKey(studentKey);""",
        """window.deleteStudentByTeacher = async function(studentKey) {
  if (!canDeleteStudents()) {
    alert("حذف حسابات الطلاب متاح لمدير المنصة (سوبر أدمن) فقط.");
    return;
  }
  const student = findStudentByKey(studentKey);""",
        "delete student guard",
    ),
    (
        """    deleteBtn.textContent = "حذف";
    deleteBtn.addEventListener("click", () => deleteStudentByTeacher(studentKey));
    actionsCell.appendChild(deleteBtn);

    tbody.appendChild(row);""",
        """    if (canDeleteStudents()) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-outline btn-sm";
      deleteBtn.style.cssText = "border-color:var(--error); color:var(--error); padding:0.25rem 0.5rem;";
      deleteBtn.textContent = "حذف";
      deleteBtn.addEventListener("click", () => deleteStudentByTeacher(studentKey));
      actionsCell.appendChild(deleteBtn);
    }

    tbody.appendChild(row);""",
        "hide delete btn",
    ),
    (
        """    existingStudent.studentKey = existingStudent.studentKey || getStudentLookupKey(existingStudent) || fallbackKey || createRecordId("student");
    return existingStudent;""",
        """    existingStudent.studentKey = existingStudent.studentKey || getStudentLookupKey(existingStudent) || fallbackKey || createRecordId("student");
    return ensureStudentAccountType(existingStudent);""",
        "student type existing",
    ),
    (
        """    studentKey: fallbackKey || getStudentLookupKey(normalizedStudent) || createRecordId("student")
  };
  systemState.students.push(newStudent);
  return newStudent;""",
        """    studentKey: fallbackKey || getStudentLookupKey(normalizedStudent) || createRecordId("student"),
    accountType: ARABYA_ACCOUNT_ROLES.STUDENT
  };
  systemState.students.push(newStudent);
  return ensureStudentAccountType(newStudent);""",
        "student type new",
    ),
]

for old, new, label in replacements:
    if old not in text:
        raise SystemExit(f"Missing block: {label}")
    text = text.replace(old, new, 1)

# After init teachers load block - add normalize if not in default branch only
if "normalizeAllTeacherAccounts();" in text and text.count("normalizeAllTeacherAccounts();") == 1:
    text = text.replace(
        "  // محاولة تحميل المعلم النشط من الجلسة السابقة",
        "  normalizeAllTeacherAccounts();\n\n  // محاولة تحميل المعلم النشط من الجلسة السابقة",
        1,
    )

APP.write_text(text, encoding="utf-8")
print("OK", APP)
