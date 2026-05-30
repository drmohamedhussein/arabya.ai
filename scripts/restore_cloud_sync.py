#!/usr/bin/env python3
"""Restore Google Sheets cloud sync on top of current main app.js without removing exam security."""

from pathlib import Path

APP = Path("app.js")
app = APP.read_text(encoding="utf-8")

SYNC_INFRA = '''
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
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
}

function getArabyaWebAppUrls() {
  const urls = new Set();
  if (systemState.config && systemState.config.googleFormUrl) {
    const url = systemState.config.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) urls.add(url);
  }
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    const url = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) urls.add(url);
  }
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam.googleFormUrl) {
        const url = exam.googleFormUrl.trim();
        if (url.includes("/macros/s/") || url.endsWith("/exec")) urls.add(url);
      }
    });
  }
  if (Array.isArray(systemState.teachers)) {
    systemState.teachers.forEach(t => {
      const u = t && t.integrationConfig && t.integrationConfig.googleFormUrl ? String(t.integrationConfig.googleFormUrl).trim() : "";
      if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) urls.add(u);
    });
  }
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    const u = cfg.googleFormUrl ? String(cfg.googleFormUrl).trim() : "";
    if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) urls.add(u);
  } catch (e) {}
  return Array.from(urls);
}

function mergeRemoteCollection_(current, incoming, keyFn) {
  const map = {};
  (current || []).forEach(item => { map[keyFn(item)] = item; });
  (incoming || []).forEach(item => {
    if (!item) return;
    const key = keyFn(item);
    map[key] = { ...(map[key] || {}), ...item };
  });
  return Object.keys(map).map(key => map[key]);
}

function mergeRemoteDatabaseIntoLocal(remoteData) {
  if (!remoteData || typeof remoteData !== "object") return false;
  if (Array.isArray(remoteData.teachers)) {
    systemState.teachers = mergeRemoteCollection_(systemState.teachers, remoteData.teachers, item => String(item.username || item.name || ""));
  }
  if (Array.isArray(remoteData.students)) {
    systemState.students = mergeRemoteCollection_(systemState.students, remoteData.students, item => String(item.studentKey || item.id || item.code || item.name || ""));
  }
  if (Array.isArray(remoteData.exams)) {
    systemState.exams = mergeRemoteCollection_(systemState.exams, remoteData.exams, item => String(item.id || item.title || ""));
  }
  if (Array.isArray(remoteData.results)) {
    systemState.results = mergeRemoteCollection_(systemState.results, remoteData.results, item => String(item.recordId || [item.id, item.examId, item.timestamp].join(":")));
  }
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
  return true;
}

function postToArabyaWebApp(url, payload) {
  return fetch(url, {
    method: "POST",
    mode: "cors",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).then(async res => {
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
    if (!res.ok) throw new Error((parsed && parsed.message) || text || ("HTTP " + res.status));
    if (parsed && parsed.status === "error") throw new Error(parsed.message || "Cloud sync error");
    return parsed || { status: "success" };
  });
}

async function syncDatabaseFromCloud(options = {}) {
  const silent = !!options.silent;
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) return false;
  for (const rawUrl of urlList) {
    const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_backup";
    try {
      const res = await fetch(fetchUrl, { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const response = await res.json();
      if (response && response.status === "success" && response.data) {
        mergeRemoteDatabaseIntoLocal(response.data);
        saveSystemState(false);
        if (!silent) {
          renderStudentResultsTable();
          renderTeacherStudentsTable();
          renderExamsList();
        }
        return true;
      }
    } catch (err) {
      console.warn("syncDatabaseFromCloud failed for", fetchUrl, err);
    }
  }
  return false;
}

function setupArabyaLiveDataRefresh() {
  const refreshTeacherViews = () => {
    if (systemState.activeView !== "teacher-dashboard-view") return;
    reloadSystemStateFromLocalStorage();
    const resultsTab = document.getElementById("teacher-tab-results");
    const studentsTab = document.getElementById("teacher-tab-students");
    if (resultsTab && !resultsTab.classList.contains("hidden")) renderStudentResultsTable();
    if (studentsTab && !studentsTab.classList.contains("hidden")) renderTeacherStudentsTable();
  };
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("arabya_")) refreshTeacherViews();
  });
  window.addEventListener("arabya-data-changed", refreshTeacherViews);
}

function hydrateGoogleSheetsScriptBox() {
  fetch("integrations/google-apps-script-backend.gs", { cache: "no-store" })
    .then(res => (res.ok ? res.text() : null))
    .then(text => {
      if (!text) return;
      const box = document.getElementById("google-sheets-sync-script-code");
      if (box) box.value = text;
    })
    .catch(() => {});
}

function getEffectiveExamSyncUrl(exam) {
  const candidates = [];
  if (exam && exam.googleFormUrl) candidates.push(String(exam.googleFormUrl).trim());
  if (systemState.config && systemState.config.googleFormUrl) candidates.push(String(systemState.config.googleFormUrl).trim());
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    candidates.push(String(systemState.activeTeacher.integrationConfig.googleFormUrl).trim());
  }
  if (exam && exam.teacher && Array.isArray(systemState.teachers)) {
    const t = systemState.teachers.find(x => x.username === exam.teacher);
    if (t && t.integrationConfig && t.integrationConfig.googleFormUrl) candidates.push(String(t.integrationConfig.googleFormUrl).trim());
  }
  if (Array.isArray(systemState.teachers)) {
    systemState.teachers.forEach(t => {
      if (t && t.integrationConfig && t.integrationConfig.googleFormUrl) candidates.push(String(t.integrationConfig.googleFormUrl).trim());
    });
  }
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    if (cfg.googleFormUrl) candidates.push(String(cfg.googleFormUrl).trim());
  } catch (e) {}
  try {
    const teacherUrlInput = document.getElementById("teacher-config-url");
    if (teacherUrlInput && teacherUrlInput.value) candidates.push(String(teacherUrlInput.value).trim());
    const examUrlInput = document.getElementById("edit-meta-google-url");
    if (examUrlInput && examUrlInput.value) candidates.push(String(examUrlInput.value).trim());
  } catch (e) {}
  try {
    const s = getUrlParameter("s");
    if (s) candidates.push(String(s).trim());
  } catch (e) {}
  for (const u of candidates) {
    if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) return u;
  }
  return "";
}

window.testExamSync = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;
  const badge = document.getElementById("sync-badge-" + examId);
  const url = getEffectiveExamSyncUrl(exam);
  if (!url) {
    if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">cloud_off</span> <span style="color:var(--error); font-weight:700;">لا يوجد رابط مزامنة. أضف رابط الويب اب في تعديل الامتحان أو في تبويب الربط.</span>`;
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

'''

def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"PATCH FAILED [{label}]: anchor not found")
    return text.replace(old, new, 1)

# 1. DOMContentLoaded hooks
app = must_replace(
    app,
    "  setupStudentAutofill();\n\n  // ===== تشخيص ما تم تحميله =====",
    "  setupStudentAutofill();\n  setupArabyaLiveDataRefresh();\n  hydrateGoogleSheetsScriptBox();\n\n  // ===== تشخيص ما تم تحميله =====",
    "dom-ready-hooks",
)

# 2. Insert sync infrastructure before autoSyncToCloud
if "function reloadSystemStateFromLocalStorage()" not in app:
    app = must_replace(
        app,
        "// المزامنة التلقائية مع جوجل شيت\nfunction autoSyncToCloud() {",
        SYNC_INFRA + "\n// المزامنة التلقائية مع جوجل شيت\nfunction autoSyncToCloud() {",
        "sync-infra",
    )

# 3. autoSyncToCloud uses postToArabyaWebApp
OLD_AUTO = '''function autoSyncToCloud() {
  const urls = new Set();
  
  if (systemState.config && systemState.config.googleFormUrl) {
    const url = systemState.config.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    const url = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam.googleFormUrl) {
        const url = exam.googleFormUrl.trim();
        if (url.includes("/macros/s/") || url.endsWith("/exec")) {
          urls.add(url);
        }
      }
    });
  }

  const urlList = Array.from(urls);'''

NEW_AUTO = '''function autoSyncToCloud() {
  const urlList = getArabyaWebAppUrls();'''

if "const urlList = getArabyaWebAppUrls();" not in app:
    app = must_replace(app, OLD_AUTO, NEW_AUTO, "auto-sync-urls")

OLD_FETCH = '''  urlList.forEach(url => {
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(() => {
      successCount++;
      updateIndicator();
    })
    .catch(err => {
      console.error("Auto-sync to cloud failed for url:", url, err);
      failCount++;
      updateIndicator();
    });
  });'''

NEW_FETCH = '''  urlList.forEach(url => {
    postToArabyaWebApp(url, payload).then(() => {
      successCount++;
      updateIndicator();
    }).catch(err => {
      console.error("Auto-sync to cloud failed for url:", url, err);
      failCount++;
      updateIndicator();
    });
  });'''

if "postToArabyaWebApp(url, payload).then(() => {\n      successCount++;\n      updateIndicator();" not in app:
    app = must_replace(app, OLD_FETCH, NEW_FETCH, "auto-sync-post")

# 4. getExamDirectLink s param
app = must_replace(
    app,
    '''  if (systemState.activeTeacher) {
    params.set("teacher", systemState.activeTeacher.username);
  }
  return `${getAppBaseUrl()}?${params.toString()}`;
}''',
    '''  if (systemState.activeTeacher) {
    params.set("teacher", systemState.activeTeacher.username);
  }
  const syncUrl = getEffectiveExamSyncUrl(exam);
  if (syncUrl) params.set("s", syncUrl);
  return `${getAppBaseUrl()}?${params.toString()}`;
}''',
    "exam-direct-link-s",
)

# 5. checkUrlParameters s param
SYNC_PARAM = '''
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

'''
if "3.b رابط المزامنة" not in app:
    app = must_replace(
        app,
        "      systemState.targetTeacherUsername = matchedTeacher.username;\n    }\n  }\n\n  // 4. فتح امتحان مخصص",
        "      systemState.targetTeacherUsername = matchedTeacher.username;\n    }\n  }\n" + SYNC_PARAM + "  // 4. فتح امتحان مخصص",
        "check-url-s-param",
    )

# 6. loadTeacherDashboardData cloud pull
if "syncDatabaseFromCloud({ silent: true }).then(synced =>" not in app:
    app = must_replace(
        app,
        '''  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();
}

function saveTeacherProfile() {''',
        '''  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();

  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced) {
      renderStudentResultsTable();
      renderTeacherStudentsTable();
      renderExamsList();
    }
  });
}

function saveTeacherProfile() {''',
        "dashboard-cloud-sync",
    )

# 7. renderExamsList badges
app = must_replace(
    app,
    '''    const questionMode = exam.shuffleQuestions === false ? "ترتيبي" : "عشوائي";

    card.innerHTML = `
      <div>
        <div class="exam-info-title">${exam.title}</div>
        <div style="font-size:0.8rem; color:var(--secondary); font-weight:600; margin-bottom:0.5rem;">
          المادة: ${exam.subject} | الفرقة: ${exam.level || 'غير محددة'}
        </div>
        <div class="exam-info-details">
          <span>الكلية: ${exam.faculty || 'عام'} | الجامعة: ${exam.university || 'عام'}</span>
          <span>المجموع النهائي الكلي: <code style="color:var(--accent); font-weight:700;">${totalExamScore} درجة</code></span>
          <span>النوع: ${exam.examType || 'أعمال فصلية'} | بنك الأسئلة: ${bankCount}</span>\\n          <span>المعروض للطالب: ${displayedCount} | النمط: ${questionMode}</span>
        </div>
      </div>
      <div>
        <div class="exam-actions-row">
          <button class="btn btn-primary btn-sm" onclick="editExamQuestions('${exam.id}')">تعديل الامتحان والأسئلة</button>
          <button class="btn btn-outline btn-sm" onclick="copyExamLink('${examUrl}')">نسخ الرابط</button>''',
    '''    const questionMode = exam.shuffleQuestions === false ? "ترتيبي" : "عشوائي";
    const syncUrl = getEffectiveExamSyncUrl(exam);
    const badge = syncUrl
      ? `<span id="sync-badge-${exam.id}" style="display:inline-flex; align-items:center; gap:0.25rem; color:var(--secondary); font-weight:700;"><span class="material-icons" style="font-size:1rem;">cloud_queue</span> رابط المزامنة مهيأ — اضغط (اختبار المزامنة) للتأكد</span>`
      : `<span id="sync-badge-${exam.id}" style="display:inline-flex; align-items:center; gap:0.25rem; color:var(--error); font-weight:700;"><span class="material-icons" style="font-size:1rem;">cloud_off</span> لا يوجد رابط مزامنة لهذا الامتحان (يُحفظ محلياً فقط)</span>`;

    card.innerHTML = `
      <div>
        <div class="exam-info-title">${exam.title}</div>
        <div style="font-size:0.8rem; color:var(--secondary); font-weight:600; margin-bottom:0.5rem;">
          المادة: ${exam.subject} | الفرقة: ${exam.level || 'غير محددة'}
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
          <button class="btn btn-outline btn-sm" onclick="copyExamLink('${examUrl}')">نسخ الرابط</button>''',
    "render-exams-sync",
)

# 8. Tab menu sync
app = must_replace(
    app,
    '''  const menuItems = document.querySelectorAll(".teacher-menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      menuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      const tabId = item.dataset.tab;
      document.querySelectorAll(".teacher-tab-panel").forEach(panel => {
        panel.classList.add("hidden");
      });
      document.getElementById(`teacher-tab-${tabId}`).classList.remove("hidden");
    });
  });''',
    '''  const menuItems = document.querySelectorAll(".teacher-menu-item");
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
      if (tabId === "results") {
        syncDatabaseFromCloud({ silent: true }).finally(() => renderStudentResultsTable());
      } else if (tabId === "students") {
        syncDatabaseFromCloud({ silent: true }).finally(() => renderTeacherStudentsTable());
      } else if (tabId === "exams") {
        renderExamsList();
      } else if (tabId === "integration" || tabId === "profile") {
        loadTeacherDashboardData();
      }
    });
  });''',
    "tab-menu-sync",
)

# 9. sendResultToGoogleSheets full version
NEW_SEND = '''function sendResultToGoogleSheets(scoreString, details, resultRecordId = "", resultObj = null) {
  const exam = systemState.currentExam;
  const statusEl = document.getElementById("runner-res-sync-status");
  const urlList = Array.from(getArabyaWebAppUrls());

  if (urlList.length === 0) {
    const traditionalUrl = (exam && exam.googleFormUrl) ? exam.googleFormUrl : (systemState.config ? systemState.config.googleFormUrl || "" : "");
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

  if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة نتيجتك مع Google Sheets...`;

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
    presentedQuestions: resultObj?.presentedQuestions || [],
    studentAnswers: resultObj?.studentAnswers || systemState.studentAnswers || {},
    questionScores: resultObj?.questionScores || {}
  };

  let successCount = 0, failCount = 0;
  const total = urlList.length;
  urlList.forEach(url => {
    postToArabyaWebApp(url, payload).then(() => {
      successCount++;
      if (successCount + failCount === total && statusEl) {
        statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تمت مزامنة النتيجة مع Google Sheets بنجاح ✓`;
      }
    }).catch(err => {
      failCount++;
      console.error("Google Sheets sync error:", url, err);
      if (successCount + failCount === total && statusEl) {
        statusEl.innerHTML = failCount === total
          ? `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> فشلت المزامنة. تأكد من نشر Apps Script كـ Web App لـ Anyone.`
          : `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> مزامنة جزئية (${successCount}/${total} شيت نجح).`;
      }
    });
  });
}'''

OLD_SEND_START = "function sendResultToGoogleSheets(scoreString, details, resultRecordId = \"\", resultObj = null) {"
if OLD_SEND_START in app and "postToArabyaWebApp(url, payload).then(() => {\n      successCount++;" not in app.split(OLD_SEND_START)[1].split("// مزامنة نتيجة")[0]:
    start = app.index(OLD_SEND_START)
    end = app.index("// مزامنة نتيجة معدّلة يدوياً", start)
    app = app[:start] + NEW_SEND + "\n\n" + app[end:]

# 10. sendUpdatedResultToCloud uses postToArabyaWebApp
app = must_replace(
    app,
    '''  urls.forEach(url => {
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle; font-size:1rem;">cloud_done</span> تمت مزامنة التصحيح مع Google Sheets بنجاح!`;
      }
    })
    .catch(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle; font-size:1rem;">cloud_off</span> فشلت المزامنة — تم الحفظ محلياً.`;
      }
    });
  });''',
    '''  urls.forEach(url => {
    postToArabyaWebApp(url, payload).then(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle; font-size:1rem;">cloud_done</span> تمت مزامنة التصحيح مع Google Sheets بنجاح!`;
      }
    }).catch(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle; font-size:1rem;">cloud_off</span> فشلت المزامنة — تم الحفظ محلياً.`;
      }
    });
  });''',
    "send-updated-post",
)

# 11. restoreDatabaseFromCloud simplified
if "window.restoreDatabaseFromCloud = async function()" not in app:
    # Replace old restore function - find from window.restoreDatabaseFromCloud to closing };
    marker = "window.restoreDatabaseFromCloud = function()"
    if marker in app:
        start = app.index(marker)
        end = app.index("};", start) + 3
        new_restore = '''window.restoreDatabaseFromCloud = async function() {
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) {
    alert("يرجى إدخال رابط ويب اب (Web App URL) أولاً لتمكين استعادة النسخة الاحتياطية!");
    return;
  }
  if (!confirm("تحذير: سيقوم هذا باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستعادة من جوجل شيت. هل ترغب في الاستمرار؟")) return;
  const btnRestore = document.getElementById("btn-cloud-restore");
  const originalText = btnRestore ? btnRestore.innerHTML : "";
  if (btnRestore) { btnRestore.disabled = true; btnRestore.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري جلب البيانات...`; }
  const ok = await syncDatabaseFromCloud({ silent: false });
  if (btnRestore) { btnRestore.disabled = false; btnRestore.innerHTML = originalText; }
  if (ok) { alert("تم استعادة قاعدة البيانات بنجاح من جوجل شيت! سيتم إعادة تحميل الصفحة."); location.reload(); }
  else alert("فشل استعادة قاعدة البيانات. تأكد من رفع نسخة احتياطية أولاً ونشر Apps Script للجميع (Anyone).");
};'''
        app = app[:start] + new_restore + app[end:]

APP.write_text(app, encoding="utf-8")
print("Cloud sync restoration complete")
