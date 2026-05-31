#!/usr/bin/env python3
"""Device fingerprint/IP capture, teacher UI, binding, session persistence."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")

MARKER = "// 8b. بصمة الجهاز ومنع مشاركة الجهاز بين الطلاب"
if MARKER not in text:
    raise SystemExit("device section marker not found")

DEVICE_SECTION = r'''// ==========================================
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
  return registry;
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
  if (profile.deviceFingerprint && entry.deviceFingerprint && profile.deviceFingerprint === entry.deviceFingerprint) {
    return true;
  }
  return !!(profile.deviceId && entry.deviceId && profile.deviceId === entry.deviceId);
}

function findDeviceBindingConflict(profile, examId, studentLookupKey) {
  if (!profile || !studentLookupKey) return null;
  if (!profile.deviceFingerprint && !profile.deviceId) return null;
  const registry = pruneExamDeviceRegistry(loadExamDeviceRegistry());
  const bindings = registry.bindings || [];
  const globalConflict = bindings.find(entry =>
    entry.studentLookupKey &&
    entry.studentLookupKey !== studentLookupKey &&
    deviceBindingMatchesEntry(profile, entry)
  );
  if (globalConflict) return globalConflict;
  if (!examId) return null;
  return bindings.find(entry =>
    entry.examId === examId &&
    entry.studentLookupKey &&
    entry.studentLookupKey !== studentLookupKey &&
    deviceBindingMatchesEntry(profile, entry)
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

async function enforceExamDeviceBinding(studentLookupKey, studentName, examId) {
  const profile = await collectExamDeviceProfile();
  if (!profile.deviceFingerprint) {
    return {
      ok: false,
      message: "تعذر إنشاء بصمة الجهاز في هذا المتصفح. جرّب متصفحاً حديثاً (Chrome / Edge / Firefox) ثم أعد المحاولة.",
      profile
    };
  }
  const conflict = findDeviceBindingConflict(profile, examId, studentLookupKey);
  if (conflict) {
    return {
      ok: false,
      message:
        "تم رفض الدخول: هذا الجهاز/المتصفح مرتبط بطالب آخر في المنصة.\n\n" +
        `الطالب المسجّل سابقاً على الجهاز: ${conflict.studentName || "غير معروف"}.\n` +
        "يجب أن يؤدي كل طالب الامتحان من جهازه الشخصي فقط — لا يمكن أداء الامتحان لصالح زميل على نفس الجهاز.",
      profile
    };
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
'''

# Replace from marker until window.arabyaCollectExamDeviceProfile line (old end)
start = text.index(MARKER)
end_marker = "window.arabyaCollectExamDeviceProfile = collectExamDeviceProfile;"
end = text.index(end_marker, start)
end = text.index("\n", end) + 1
# skip to after next section comment
next_sec = text.index("// ==========================================\n// 9.", end)
text = text[:start] + DEVICE_SECTION + "\n" + text[next_sec:]

# Session save: examDeviceProfile
old_session = """    examMaxCheatAttemptsAllowed: systemState.examMaxCheatAttemptsAllowed,
    currentExamRuntime: systemState.currentExamRuntime,
    timeRemaining: systemState.timer.timeRemaining
  };"""
new_session = """    examMaxCheatAttemptsAllowed: systemState.examMaxCheatAttemptsAllowed,
    currentExamRuntime: systemState.currentExamRuntime,
    timeRemaining: systemState.timer.timeRemaining,
    examDeviceProfile: systemState.examDeviceProfile || null
  };"""
if old_session in text:
    text = text.replace(old_session, new_session, 1)

# Session resume
old_resume = """              systemState.examMaxCheatAttemptsAllowed = session.examMaxCheatAttemptsAllowed ?? getExamMaxCheatAttempts(matchedExam);
              systemState.isExamActive = true;"""
new_resume = """              systemState.examMaxCheatAttemptsAllowed = session.examMaxCheatAttemptsAllowed ?? getExamMaxCheatAttempts(matchedExam);
              systemState.examDeviceProfile = session.examDeviceProfile || examDeviceProfileFromStudent(session.student);
              systemState.isExamActive = true;"""
if old_resume in text:
    text = text.replace(old_resume, new_resume, 1)

# updateLiveIncompleteResult
old_inc = """  Object.assign(res, buildCheatTrackingFields());
  res.maxScore = getCurrentExamTotalScore();"""
new_inc = """  Object.assign(res, buildCheatTrackingFields());
  attachDeviceFieldsToResult(res);
  res.email = systemState.currentStudent.email || res.email || "";
  res.mobile = systemState.currentStudent.mobile || res.mobile || "";
  res.maxScore = getCurrentExamTotalScore();"""
if old_inc in text:
    text = text.replace(old_inc, new_inc, 1)

# viewTeacherResultDetail device block
old_view = """  const deviceInfoEl = document.getElementById("detail-device-info");
  if (deviceInfoEl) {
    const ip = res.clientIp || "—";
    const dev = res.deviceId ? `${String(res.deviceId).slice(0, 12)}…` : "—";
    deviceInfoEl.innerHTML = `<div><strong>بصمة الجهاز:</strong> <code>${escapeHtml(dev)}</code></div><div style="margin-top:0.35rem;"><strong>IP عند التقديم:</strong> <code>${escapeHtml(ip)}</code></div>`;
  }"""
new_view = """  renderTeacherDeviceInfo(res);"""
if old_view in text:
    text = text.replace(old_view, new_view, 1)

# Results table row
old_row = """      <td>${escapeHtml(res.examTitle || "")} (${escapeHtml(res.level || "عام")})</td>
      <td style="font-weight:700; color:var(--secondary);">${escapeHtml(res.score || "")}</td>
      <td>${escapeHtml(res.timestamp || "")}</td>"""
new_row = """      <td>${escapeHtml(res.examTitle || "")} (${escapeHtml(res.level || "عام")})</td>
      <td style="font-weight:700; color:var(--secondary);">${escapeHtml(res.score || "")}</td>
      <td><code style="font-size:0.78rem;">${escapeHtml(formatResultDeviceSummary(res))}</code></td>
      <td>${escapeHtml(res.timestamp || "")}</td>"""
if old_row in text:
    text = text.replace(old_row, new_row, 1)

# colspan 7 -> 8
text = text.replace('colspan="7"', 'colspan="8"', 2)

# SORTABLE columns
old_cols = """  { key: "score", label: "النتيجة" },
  { key: "timestamp", label: "التاريخ والوقت" }
];"""
new_cols = """  { key: "score", label: "النتيجة" },
  { key: "clientIp", label: "IP / الجهاز" },
  { key: "timestamp", label: "التاريخ والوقت" }
];"""
if old_cols in text:
    text = text.replace(old_cols, new_cols, 1)

# getColumnSortValue for clientIp
old_sort = """  if (key === "score") {
    const match = String(item.score || "").match(/(\\d+(?:\\.\\d+)?)/);
    return match ? parseFloat(match[1]) : -1;
  }
  return String(item[key] || "").toLocaleLowerCase("ar");"""
new_sort = """  if (key === "score") {
    const match = String(item.score || "").match(/(\\d+(?:\\.\\d+)?)/);
    return match ? parseFloat(match[1]) : -1;
  }
  if (key === "clientIp") {
    return formatResultDeviceSummary(item).toLocaleLowerCase("ar");
  }
  return String(item[key] || "").toLocaleLowerCase("ar");"""
if old_sort in text:
    text = text.replace(old_sort, new_sort, 1)

# CSV header and row
old_csv_h = 'اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,محاولات غش,حد الغش,تفاصيل محاولات الغش,النتيجة,التاريخ والوقت\\n";'
new_csv_h = 'اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,محاولات غش,حد الغش,تفاصيل محاولات الغش,معرف الجهاز,بصمة الجهاز,IP,النتيجة,التاريخ والوقت\\n";'
if old_csv_h in text:
    text = text.replace(old_csv_h, new_csv_h, 1)

old_csv_row = """      formatCheatAttemptsExportText(res),
      res.score || "",
      res.timestamp || ""
    ]);"""
new_csv_row = """      formatCheatAttemptsExportText(res),
      res.deviceId || "",
      res.deviceFingerprint || "",
      res.clientIp || "",
      res.score || "",
      res.timestamp || ""
    ]);"""
if old_csv_row in text:
    text = text.replace(old_csv_row, new_csv_row, 1)

APP.write_text(text, encoding="utf-8")
print("Patched", APP)
