/**
 * مزامنة سحابية: Google Apps Script، نسخ احتياطي، دمج البيانات
 * مستخرج من app.js — يعتمد على window.systemState بعد تحميل app.js.
 */
const MAX_CLOUD_BACKUP_JSON_BYTES = 4500000;
const ARABYA_CLOUD_BACKUP_SCOPE_GENERAL = "general";
const ARABYA_CLOUD_BACKUP_SCOPE_ALL = "all";
const ARABYA_UNIFIED_CLOUD_SYNC_FLAG = "arabya_unified_cloud_sync_v1";

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
    hydrateResultAnswerDataForResults();
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
    const remoteAppVersion = remoteData.config.appVersion;
    systemState.config = { ...(systemState.config || {}), ...remoteData.config };
    systemState.config.appVersion = pickLatestAppVersion(
      ARABYA_APP_BUILD_VERSION,
      remoteAppVersion,
      systemState.config.appVersion
    );
    try {
      localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
    } catch (e) {}
  }
  syncPlatformAppVersionFromDatabase(remoteData);
  updateTeacherAppVersionLabel();
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
  if (Array.isArray(slim.presentedQuestions) && slim.presentedQuestions.length) {
    slim.presentedQuestions = compactPresentedQuestionsForCloud(slim.presentedQuestions);
  }
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


async function fetchCloudRevisionForUrl(rawUrl) {
  const url = normalizeArabyaWebAppUrl(rawUrl);
  if (!url) return "";
  const fetchUrl = url + (url.includes("?") ? "&" : "?") + "action=get_sync_meta";
  try {
    const res = await fetch(fetchUrl, { method: "GET", headers: { Accept: "application/json" } });
    if (!res.ok) return "";
    const body = await res.json();
    return body && body.cloudRevision ? String(body.cloudRevision) : "";
  } catch (e) {
    return "";
  }
}

function slimCloudBackupDataForSize(data) {
  const slim = {
    ...data,
    questionBanks: {},
    auditLog: []
  };
  if (Array.isArray(slim.results)) {
    slim.results = slim.results.map(res => {
      const copy = { ...res };
      if (copy.details && String(copy.details).length > 1500) {
        copy.details = String(copy.details).slice(0, 1500);
      }
      if (Array.isArray(copy.presentedQuestions) && copy.presentedQuestions.length) {
        copy.presentedQuestions = compactPresentedQuestionsForCloud(copy.presentedQuestions);
      }
      return copy;
    });
  }
  return slim;
}

function buildSaveBackupPayload(reason) {
  const actor = window.ArabyaPlatformSync ? window.ArabyaPlatformSync.getCloudSyncActor() : { username: systemState.activeTeacher?.username || "" };
  const fullData = typeof buildFullCloudBackupData === "function"
    ? buildFullCloudBackupData()
    : {
      teachers: systemState.teachers,
      students: systemState.students,
      exams: systemState.exams,
      results: systemState.results,
      examDeviceRegistry: loadExamDeviceRegistry()
    };
  let data = fullData;
  let payload = { action: "save_backup", data, actor };
  let json = JSON.stringify(payload);
  if (json.length > MAX_CLOUD_BACKUP_JSON_BYTES) {
    data = slimCloudBackupDataForSize(fullData);
    payload = { action: "save_backup", data, actor };
    json = JSON.stringify(payload);
  }
  if (json.length > MAX_CLOUD_BACKUP_JSON_BYTES) {
    throw new Error(`حجم البيانات كبير جداً للرفع (${Math.round(json.length / 1024)} كيلوبايت). قلّل عدد النتائج أو صدّر قاعدة البيانات يدوياً.`);
  }
  return payload;
}

async function postSaveBackupToCloudUrl(url, payload) {
  const revisionBefore = await fetchCloudRevisionForUrl(url);
  try {
    const response = await postToArabyaWebApp(url, payload);
    return { ok: true, response, mode: "cors" };
  } catch (corsErr) {
    const message = corsErr && corsErr.message ? corsErr.message : String(corsErr);
    const sent = await postToArabyaWebAppNoCors(url, payload);
    if (!sent) {
      return { ok: false, error: message };
    }
    await delayMs(1500);
    const revisionAfter = await fetchCloudRevisionForUrl(url);
    if (revisionAfter && revisionAfter !== revisionBefore) {
      return { ok: true, response: { status: "success", cloudRevision: revisionAfter }, mode: "no-cors-verified" };
    }
    if (navigator.onLine) {
      return { ok: true, response: { status: "success", cloudRevision: revisionAfter || revisionBefore }, mode: "no-cors-optimistic" };
    }
    return { ok: false, error: message || "تعذّر الاتصال بالسحابة" };
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
  if (!systemState.cloudPushInProgress) {
    beginCriticalCloudPush(reason);
  }
  ensurePlatformAppVersionBeforeCloudPush();
  const urlList = getCloudBackupTargetUrls();
  if (urlList.length === 0) {
    systemState.lastCloudPushError = "لم يُضبط رابط Web App في تبويب «الربط بـ Google Sheets».";
    markCloudSyncLocalOnly("لا يوجد رابط Web App");
    endCriticalCloudPush(false);
    return false;
  }
  refreshCloudSyncStatusUI("جاري رفع النسخة الاحتياطية إلى Google Sheets...", "syncing");
  let payload;
  try {
    payload = buildSaveBackupPayload(reason);
  } catch (buildErr) {
    systemState.lastCloudPushError = buildErr.message || String(buildErr);
    recordCloudSyncOutcome(false, systemState.lastCloudPushError);
    endCriticalCloudPush(false);
    return false;
  }
  let ok = false;
  let lastError = "";
  for (const url of urlList) {
    const result = await postSaveBackupToCloudUrl(url, payload);
    if (result.ok) {
      ok = true;
      if (result.response && result.response.cloudRevision && window.ArabyaCloudSync) {
        window.ArabyaCloudSync.setStoredCloudRevision(result.response.cloudRevision);
      }
      systemState.lastCloudPushError = "";
      break;
    }
    lastError = result.error || lastError;
    console.warn("pushCloudBackupNow:", url, result.error);
  }
  if (!ok && lastError) {
    systemState.lastCloudPushError = lastError;
  }
  endCriticalCloudPush(ok);
  if (ok) {
    recordCloudSyncOutcome(true, reason && /question|بنك/i.test(String(reason)) ? "مزامنة بنك الأسئلة والنسخة الاحتياطية" : "نسخة احتياطية سحابية");
    if (/question|بنك/i.test(String(reason)) && window.ArabyaPlatformSync) {
      window.ArabyaPlatformSync.recordQuestionBankSync(true, "رفع بنك الأسئلة");
    }
  } else {
    recordCloudSyncOutcome(false, systemState.lastCloudPushError || "فشل رفع النسخة الاحتياطية");
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
  if (!options.forcePull && systemState.cloudPushInProgress) {
    return { ok: false, skipped: true, reason: "push_in_progress" };
  }
  if (!options.forcePull && systemState.ignoreCloudRevisionUntil && Date.now() < systemState.ignoreCloudRevisionUntil) {
    return { ok: false, skipped: true, reason: "local_push_guard" };
  }
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
    const remoteAppVersion = data.config.appVersion;
    systemState.config = { ...(systemState.config || {}), ...data.config };
    systemState.config.appVersion = pickLatestAppVersion(
      ARABYA_APP_BUILD_VERSION,
      remoteAppVersion,
      systemState.config.appVersion
    );
    try {
      localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
    } catch (e) {}
  }
  syncPlatformAppVersionFromDatabase(data);
  updateTeacherAppVersionLabel();
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
    studentAnswers: res.studentAnswers || {},
    questionScores: res.questionScores || {},
    presentedQuestions: compactPresentedQuestionsForCloud(res.presentedQuestions || []),
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
