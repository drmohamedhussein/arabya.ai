#!/usr/bin/env python3
"""Add super-admin teachers tab and management logic."""
from pathlib import Path

INDEX = Path("/workspace/index.html")
APP = Path("/workspace/app.js")

index = INDEX.read_text(encoding="utf-8")
app = APP.read_text(encoding="utf-8")

app = app.replace(
    'const ARABYA_APP_VERSION = "2026.05.31.28";',
    'const ARABYA_APP_VERSION = "2026.05.31.29";',
    1,
)

# Tab ids: teachers + legacy admins
app = app.replace(
    'const TEACHER_TAB_IDS = ["stats", "exams", "results", "students", "integration", "profile", "admins"];',
    'const TEACHER_TAB_IDS = ["stats", "exams", "results", "students", "teachers", "integration", "profile", "admins"];',
    1,
)

old_norm = """function normalizeTeacherTabId(tabId) {
  const id = String(tabId || "").trim();
  return TEACHER_TAB_IDS.includes(id) ? id : "stats";
}"""

new_norm = """function normalizeTeacherTabId(tabId) {
  let id = String(tabId || "").trim();
  if (id === "admins") id = "teachers";
  return TEACHER_TAB_IDS.includes(id) ? id : "stats";
}"""

if old_norm in app:
    app = app.replace(old_norm, new_norm, 1)

app = app.replace(
    '  } else if (normalizedTab === "admins") {\n    renderTeacherAccountsPanel();',
    '  } else if (normalizedTab === "teachers" || normalizedTab === "admins") {\n    renderTeacherAccountsPanel();',
    1,
)

# Replace renderTeacherAccountsPanel block entirely
old_panel_start = "function renderTeacherAccountsPanel() {"
old_panel_end = "window.deleteTeacherAccount = async function(username) {"

if old_panel_start not in app:
    raise SystemExit("renderTeacherAccountsPanel not found")

idx_start = app.index(old_panel_start)
idx_end = app.index(old_panel_end)
if idx_start < 0 or idx_end < 0:
    raise SystemExit("panel bounds not found")

NEW_PANEL = r'''let superAdminEditingTeacherUsername = null;

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
      loginTeacherObject(teacherRecord, systemState.activeTeacherLoginCredential || form.autoEntryCode);
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

'''

app = app[:idx_start] + NEW_PANEL + app[idx_end:]

# Enhance deleteTeacherAccount sync message - find and patch if needed
old_del = """  systemState.teachers = systemState.teachers.filter(t => t.username !== username);
  saveTeachersToLocalStorage();
  renderTeacherAccountsPanel();
  const synced = await syncLocalDatabaseToCloud();
  alert(synced ? "تم حذف حساب المعلم ومزامنة التغيير." : "تم حذف حساب المعلم محلياً.");"""

new_del = """  const examCount = countTeacherExams(username);
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
  alert(synced ? "تم حذف حساب المعلم ومزامنة قاعدة البيانات السحابية." : "تم حذف حساب المعلم محلياً. أعد المزامنة من تبويب الربط عند توفر الاتصال.");"""

if old_del in app:
    app = app.replace(old_del, new_del, 1)

# refreshTeacherDashboardViews - teachers tab
if 'teacher-tab-teachers' not in app.split('refreshTeacherDashboardViews')[1][:800]:
    app = app.replace(
        '  const examsTab = document.getElementById("teacher-tab-exams");\n\n  if (refreshAll || (statsTab',
        '  const examsTab = document.getElementById("teacher-tab-exams");\n  const teachersTab = document.getElementById("teacher-tab-teachers");\n\n  if (refreshAll || (statsTab',
        1,
    )
    app = app.replace(
        '  if (refreshAll || (examsTab && !examsTab.classList.contains("hidden"))) {\n    if (typeof renderExamsList === "function") renderExamsList();\n  }\n}',
        '  if (refreshAll || (examsTab && !examsTab.classList.contains("hidden"))) {\n    if (typeof renderExamsList === "function") renderExamsList();\n  }\n  if (refreshAll || (teachersTab && !teachersTab.classList.contains("hidden"))) {\n    if (typeof renderTeacherAccountsPanel === "function") renderTeacherAccountsPanel();\n  }\n}',
        1,
    )

# syncTeacherCredentialsToCloud include role
old_record = """  const record = {
    username: teacher.username || teacher.name || "",
    name: teacher.name || "",
    subject: teacher.subject || "",
    password: teacher.password || "",
    autoEntryCode: teacher.autoEntryCode || teacher.password || "",
    integrationConfig: teacher.integrationConfig || {}
  };"""

new_record = """  const record = {
    username: teacher.username || teacher.name || "",
    name: teacher.name || "",
    subject: teacher.subject || "",
    password: teacher.password || "",
    autoEntryCode: teacher.autoEntryCode || teacher.password || "",
    role: inferTeacherRole(teacher),
    integrationConfig: teacher.integrationConfig || {}
  };"""

if old_record in app:
    app = app.replace(old_record, new_record, 1)

APP.write_text(app, encoding="utf-8")
print("app.js patched")

# --- index.html ---
menu_item = '''            <li class="teacher-menu-item" data-tab="teachers" data-super-admin-only role="tab" aria-selected="false">
              <span class="material-icons" aria-hidden="true">supervisor_account</span> إدارة المعلمين
            </li>
'''

if 'data-tab="teachers"' not in index:
    index = index.replace(
        '            <li class="teacher-menu-item" data-tab="students" role="tab" aria-selected="false">',
        '            <li class="teacher-menu-item" data-tab="students" role="tab" aria-selected="false">',
        1,
    )
    index = index.replace(
        '            <li class="teacher-menu-item" data-tab="integration" role="tab" aria-selected="false">',
        menu_item + '            <li class="teacher-menu-item" data-tab="integration" role="tab" aria-selected="false">',
        1,
    )

TEACHERS_TAB = '''
          <div id="teacher-tab-teachers" class="teacher-tab-panel hidden" role="tabpanel" data-super-admin-only>
            <div class="panel-header">
              <div>
                <div class="panel-title">إدارة حسابات المعلمين</div>
                <div style="font-size:0.85rem; color:var(--text-muted);">لمدير المنصة فقط — عرض، تعديل، حذف، ومزامنة بيانات كل معلم مع Google Sheets</div>
              </div>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-sm" onclick="openTeacherAccountEditor()">
                  <span class="material-icons" style="font-size:1.1rem;vertical-align:middle;">person_add</span> إضافة معلم
                </button>
                <button type="button" class="btn btn-outline btn-sm" style="border-color:var(--secondary);color:var(--secondary);" onclick="syncAllTeachersToCloudBySuperAdmin()">
                  <span class="material-icons" style="font-size:1.1rem;vertical-align:middle;">cloud_sync</span> مزامنة الكل
                </button>
                <button type="button" class="btn btn-outline btn-sm" onclick="syncDatabaseFromCloud({ silent: false }).then(() => renderTeacherAccountsPanel())">
                  <span class="material-icons" style="font-size:1.1rem;vertical-align:middle;">cloud_download</span> جلب من السحابة
                </button>
              </div>
            </div>

            <div id="teacher-accounts-sync-status" style="margin-bottom:1rem; font-size:0.9rem; min-height:1.25rem;" aria-live="polite"></div>

            <details class="config-card-box" style="margin-bottom:1.25rem; text-align:right;">
              <summary style="cursor:pointer; font-weight:700; color:var(--accent);">مقارنة صلاحيات سوبر أدمن والمعلم</summary>
              <div class="table-container" style="margin-top:1rem;">
                <table>
                  <thead>
                    <tr>
                      <th>الميزة</th>
                      <th>سوبر أدمن</th>
                      <th>معلم</th>
                    </tr>
                  </thead>
                  <tbody id="teacher-capability-matrix-body"></tbody>
                </table>
              </div>
            </details>

            <div class="table-container" style="margin-bottom:1.5rem;">
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>اسم المستخدم</th>
                    <th>الدور</th>
                    <th>رمز الدخول</th>
                    <th>الامتحانات / المزامنة</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody id="teacher-accounts-table-body"></tbody>
              </table>
            </div>

            <div id="teacher-account-editor-panel" class="exam-builder-card hidden" style="margin-bottom:2rem; border-color:rgba(245,158,11,0.35);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h4 id="teacher-account-editor-title" style="color:var(--accent); font-weight:700; margin:0;">تعديل حساب معلم</h4>
                <button type="button" class="btn btn-outline btn-sm" onclick="closeTeacherAccountEditor()">إغلاق</button>
              </div>
              <h5 style="color:var(--secondary); margin-bottom:0.75rem;">الملف الشخصي</h5>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="super-admin-teacher-name">اسم المعلم</label>
                  <input type="text" id="super-admin-teacher-name" class="form-control">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="super-admin-teacher-username">اسم المستخدم (لا يُغيّر بعد الإنشاء)</label>
                  <input type="text" id="super-admin-teacher-username" class="form-control" dir="ltr">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="super-admin-teacher-subject">المادة / التخصص</label>
                  <input type="text" id="super-admin-teacher-subject" class="form-control">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="super-admin-teacher-password">الرقم السري</label>
                  <input type="text" id="super-admin-teacher-password" class="form-control" dir="ltr">
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="super-admin-teacher-autocode">رمز الدخول السريع</label>
                  <input type="text" id="super-admin-teacher-autocode" class="form-control" dir="ltr">
                </div>
              </div>
              <h5 style="color:var(--secondary); margin-bottom:0.75rem; border-top:1px solid rgba(255,255,255,0.06); padding-top:1rem;">الربط بـ Google Sheets (ملف المعلم)</h5>
              <div class="form-group">
                <label class="form-label" for="super-admin-teacher-sync-url">رابط Web App / المزامنة</label>
                <input type="text" id="super-admin-teacher-sync-url" class="form-control" dir="ltr" placeholder="https://script.google.com/macros/s/.../exec">
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
                <div class="form-group" style="margin:0;"><label class="form-label" for="super-admin-teacher-entry-name">حقل الاسم</label><input type="text" id="super-admin-teacher-entry-name" class="form-control" dir="ltr"></div>
                <div class="form-group" style="margin:0;"><label class="form-label" for="super-admin-teacher-entry-id">حقل ID</label><input type="text" id="super-admin-teacher-entry-id" class="form-control" dir="ltr"></div>
                <div class="form-group" style="margin:0;"><label class="form-label" for="super-admin-teacher-entry-code">حقل الكود</label><input type="text" id="super-admin-teacher-entry-code" class="form-control" dir="ltr"></div>
                <div class="form-group" style="margin:0;"><label class="form-label" for="super-admin-teacher-entry-score">حقل الدرجة</label><input type="text" id="super-admin-teacher-entry-score" class="form-control" dir="ltr"></div>
                <div class="form-group" style="margin:0;"><label class="form-label" for="super-admin-teacher-entry-details">حقل التفاصيل</label><input type="text" id="super-admin-teacher-entry-details" class="form-control" dir="ltr"></div>
              </div>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:1.25rem;">
                <button type="button" class="btn btn-primary" onclick="saveTeacherAccountBySuperAdmin()">
                  <span class="material-icons" style="font-size:1.1rem;vertical-align:middle;">save</span> حفظ ومزامنة
                </button>
                <button type="button" class="btn btn-outline" onclick="closeTeacherAccountEditor()">إلغاء</button>
              </div>
            </div>
          </div>

'''

if 'id="teacher-tab-teachers"' not in index:
    index = index.replace(
        '          <div id="teacher-tab-integration" class="teacher-tab-panel hidden" role="tabpanel">',
        TEACHERS_TAB + '          <div id="teacher-tab-integration" class="teacher-tab-panel hidden" role="tabpanel">',
        1,
    )

index = index.replace("?v=2026.05.31.28", "?v=2026.05.31.29")
INDEX.write_text(index, encoding="utf-8")
print("index.html patched")
