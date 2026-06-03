/**
 * بصمة الجهاز، سجل الأجهزة، IP مشترك، قفل الجهاز
 * مستخرج من app.js — يعتمد على window.systemState بعد تحميل app.js.
 */
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
