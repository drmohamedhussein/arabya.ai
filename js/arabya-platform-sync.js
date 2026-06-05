/**
 * صحة المزامنة، تعارضات، بنك أسئلة، اختبار اتصال، أمان أجهزة إضافي.
 */
(function (global) {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const QB_SYNC_KEY = "arabya_question_bank_last_sync";
  const CONFLICT_MODE_KEY = "arabya_conflict_merge_mode";
  const MAX_STUDENT_DEVICES = 3;

  function getConflictMode() {
    try {
      return localStorage.getItem(CONFLICT_MODE_KEY) || "newest";
    } catch (e) {
      return "newest";
    }
  }

  function setConflictMode(mode) {
    try {
      localStorage.setItem(CONFLICT_MODE_KEY, mode === "ask" ? "ask" : "newest");
    } catch (e) {}
  }

  function recordTs(item) {
    const t = item?.updatedAt || item?.syncedAt || item?.timestamp || item?.savedAt || item?.boundAt;
    const n = Date.parse(t) || Number(t) || 0;
    return n;
  }

  function examContentTs(item) {
    const edited = Date.parse(item?.questionsUpdatedAt || "") || Number(item?.localRevision) || 0;
    if (edited) return edited;
    return recordTs(item);
  }

  function shouldKeepLocalExamQuestions(local, remote) {
    const localTs = examContentTs(local);
    const remoteTs = examContentTs(remote);
    if (localTs > remoteTs) return true;
    const localCount = Array.isArray(local?.questions) ? local.questions.length : 0;
    const remoteCount = Array.isArray(remote?.questions) ? remote.questions.length : 0;
    if (localCount !== remoteCount && localTs >= remoteTs) return localCount > remoteCount;
    return false;
  }

  function mergeRemoteCollectionWithConflicts(current, incoming, keyFn, label) {
    const isExamMerge = label === "امتحان";
    const map = {};
    (current || []).forEach(item => {
      map[keyFn(item)] = item;
    });
    const conflicts = [];
    (incoming || []).forEach(remote => {
      if (!remote) return;
      const key = keyFn(remote);
      const local = map[key];
      if (!local) {
        map[key] = { ...remote, syncedAt: remote.syncedAt || new Date().toISOString() };
        return;
      }
      const localTs = isExamMerge ? examContentTs(local) : recordTs(local);
      const remoteTs = isExamMerge ? examContentTs(remote) : recordTs(remote);
      if (localTs === remoteTs || JSON.stringify(local) === JSON.stringify(remote)) {
        const merged = { ...local, ...remote };
        if (isExamMerge && shouldKeepLocalExamQuestions(local, remote)) {
          merged.questions = local.questions;
          merged.questionsUpdatedAt = local.questionsUpdatedAt || merged.questionsUpdatedAt;
          merged.localRevision = local.localRevision || merged.localRevision;
        }
        map[key] = merged;
        return;
      }
      const mode = getConflictMode();
      if (mode === "ask") {
        conflicts.push({ key, label: label || key, local, remote, localTs, remoteTs });
        if (remoteTs >= localTs) {
          const merged = { ...local, ...remote };
          if (isExamMerge && shouldKeepLocalExamQuestions(local, remote)) {
            merged.questions = local.questions;
            merged.questionsUpdatedAt = local.questionsUpdatedAt || merged.questionsUpdatedAt;
            merged.localRevision = local.localRevision || merged.localRevision;
          }
          map[key] = merged;
        } else map[key] = { ...local };
      } else if (remoteTs >= localTs) {
        const merged = { ...local, ...remote };
        if (isExamMerge && shouldKeepLocalExamQuestions(local, remote)) {
          merged.questions = local.questions;
          merged.questionsUpdatedAt = local.questionsUpdatedAt || merged.questionsUpdatedAt;
          merged.localRevision = local.localRevision || merged.localRevision;
        }
        map[key] = merged;
      } else {
        map[key] = { ...local };
      }
    });
    if (conflicts.length && getConflictMode() === "ask") {
      promptConflictResolution_(conflicts, map, keyFn);
    }
    return Object.keys(map).map(k => map[k]);
  }

  function promptConflictResolution_(conflicts, map, keyFn) {
    const lines = conflicts.slice(0, 5).map(c => {
      const loc = c.local?.name || c.local?.title || c.key;
      return `• ${loc}`;
    }).join("\n");
    const useRemote = confirm(
      `وُجد تعارض بين نسختك المحلية والسحابة لـ ${conflicts.length} سجل(اً):\n${lines}\n\nموافق = اعتماد السحابة (الأحدث)\nإلغاء = الإبقاء على المحلي`
    );
    if (useRemote) {
      conflicts.forEach(c => {
        map[c.key] = { ...c.local, ...c.remote };
      });
    }
  }

  function recordQuestionBankSync(ok, detail) {
    const entry = { at: new Date().toISOString(), ok: !!ok, detail: detail || "" };
    try {
      localStorage.setItem(QB_SYNC_KEY, JSON.stringify(entry));
    } catch (e) {}
    renderQuestionBankSyncIndicator();
    if (global.ArabyaToast) {
      global.ArabyaToast.showToast(
        ok ? (detail || "تم رفع بنك الأسئلة") : (detail || "فشل رفع بنك الأسئلة"),
        ok ? "success" : "error"
      );
    }
  }

  function renderQuestionBankSyncIndicator() {
    const el = document.getElementById("question-bank-sync-status");
    if (!el) return;
    let meta = null;
    try {
      meta = JSON.parse(localStorage.getItem(QB_SYNC_KEY) || "null");
    } catch (e) {}
    if (!meta?.at) {
      el.innerHTML = `<span style="color:var(--text-muted);">آخر رفع بنك: —</span>`;
      return;
    }
    const dt = new Date(meta.at);
    const when = Number.isNaN(dt.getTime()) ? meta.at : dt.toLocaleString("ar-EG", { timeStyle: "short", dateStyle: "short" });
    const color = meta.ok ? "var(--success)" : "var(--error)";
    const icon = meta.ok ? "cloud_done" : "cloud_off";
    el.innerHTML = `<span class="material-icons" style="font-size:1rem;vertical-align:middle;color:${color};">${icon}</span> آخر رفع بنك: <strong style="color:${color};">${escapeHtml(when)}</strong>${meta.detail ? ` · ${escapeHtml(meta.detail)}` : ""}`;
  }

  function getCloudUrls() {
    if (typeof global.getArabyaWebAppUrls !== "function") return [];
    return global.getArabyaWebAppUrls()
      .map(u => (typeof global.normalizeArabyaWebAppUrl === "function" ? global.normalizeArabyaWebAppUrl(u) : u))
      .filter(Boolean);
  }

  async function fetchSyncMeta() {
    const urls = getCloudUrls();
    for (const rawUrl of urls) {
      const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_sync_meta";
      try {
        const res = await fetch(fetchUrl, { method: "GET", headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const body = await res.json();
        if (body && body.status === "success") return body;
      } catch (e) {}
    }
    return null;
  }

  async function testCloudConnection() {
    const outEl = document.getElementById("cloud-connection-test-result");
    if (outEl) outEl.innerHTML = `<span style="color:var(--secondary);">جاري الاختبار...</span>`;
    const meta = await fetchSyncMeta();
    if (!meta) {
      const msg = "تعذّر الاتصال — تحقق من رابط /exec والنشر (Anyone).";
      if (outEl) outEl.innerHTML = `<span style="color:var(--error);">${escapeHtml(msg)}</span>`;
      if (global.ArabyaToast) global.ArabyaToast.showToast(msg, "error");
      return { ok: false };
    }
    const html =
      `<div style="font-size:0.85rem;line-height:1.6;">` +
      `<div><strong>cloudRevision:</strong> <code>${escapeHtml(meta.cloudRevision || "—")}</code></div>` +
      `<div><strong>بنوك أسئلة (معلمون):</strong> ${escapeHtml(String(meta.questionBankTeachers ?? "—"))} · <strong>بنوك:</strong> ${escapeHtml(String(meta.questionBankItems ?? "—"))}</div>` +
      `<div><strong>حجم JSON الاحتياطي:</strong> ${meta.backupJsonChars != null ? escapeHtml(meta.backupJsonChars.toLocaleString("ar-EG") + " حرف") : "—"}</div>` +
      `<div><strong>سجلات:</strong> معلمون ${escapeHtml(String(meta.teachers ?? 0))} · طلاب ${escapeHtml(String(meta.students ?? 0))} · امتحانات ${escapeHtml(String(meta.exams ?? 0))} · نتائج ${escapeHtml(String(meta.results ?? 0))}</div>` +
      `</div>`;
    if (outEl) outEl.innerHTML = html;
    if (global.ArabyaToast) global.ArabyaToast.showToast("اتصال السحابة ناجح", "success");
    renderSyncHealthPanel(meta);
    return { ok: true, meta };
  }

  function renderSyncHealthPanel(meta) {
    const panel = document.getElementById("sync-health-panel-body");
    if (!panel) return;
    if (!meta) {
      panel.innerHTML = `<span style="color:var(--text-muted);">اضغط «اختبار الاتصال» لعرض البيانات.</span>`;
      return;
    }
    let localBanks = 0;
    let localBankItems = 0;
    if (global.ArabyaQuestionBank && global.ArabyaCloudSync) {
      const banks = global.ArabyaCloudSync.collectAllQuestionBanksForCloud();
      localBanks = Object.keys(banks).length;
      Object.keys(banks).forEach(k => {
        if (Array.isArray(banks[k])) localBankItems += banks[k].length;
      });
    }
    panel.innerHTML =
      `<div class="sync-health-grid">` +
      `<div><span>آخر revision</span><code>${escapeHtml(meta.cloudRevision || "—")}</code></div>` +
      `<div><span>بنوك محلية</span><strong>${escapeHtml(String(localBanks))}</strong> (${escapeHtml(String(localBankItems))} بنك)</div>` +
      `<div><span>بنوك سحابية</span><strong>${escapeHtml(String(meta.questionBankTeachers ?? "—"))}</strong> معلم</div>` +
      `<div><span>حجم ARABYA_BACKUP</span><strong>${meta.backupJsonChars != null ? escapeHtml(meta.backupJsonChars.toLocaleString("ar-EG")) : "—"}</strong> حرف</div>` +
      `<div><span>نتائج / طلاب</span>${escapeHtml(String(meta.results ?? 0))} / ${escapeHtml(String(meta.students ?? 0))}</div>` +
      `</div>`;
  }

  async function fixQuestionBankSyncNow() {
    if (global.ArabyaQuestionBank?.consolidateQuestionBankStorage) {
      global.ArabyaQuestionBank.consolidateQuestionBankStorage();
    }
    if (global.ArabyaCloudSync?.pushNow) {
      const ok = await global.ArabyaCloudSync.pushNow("fix-question-bank");
      recordQuestionBankSync(!!ok, ok ? "إصلاح ورفع بنك الأسئلة" : "فشل الرفع");
      return ok;
    }
    recordQuestionBankSync(false, "وحدة المزامنة غير محمّلة");
    return false;
  }

  function exportAllPlatformQuestionBanks() {
    if (!global.isSuperAdminTeacher || !global.isSuperAdminTeacher()) {
      alert("تصدير كل بنوك المنصة متاح لسوبر أدمن فقط.");
      return;
    }
    if (!global.ArabyaCloudSync) return;
    const banks = global.ArabyaCloudSync.collectAllQuestionBanksForCloud();
    const payload = {
      exportedAt: new Date().toISOString(),
      type: "arabya_all_question_banks",
      appVersion: global.ARABYA_APP_VERSION || "",
      questionBanks: banks
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `كل_بنوك_الأسئلة_arabya_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (global.ArabyaToast) global.ArabyaToast.showToast("تم تصدير كل بنوك الأسئلة", "success");
  }

  function importAllPlatformQuestionBanks(event) {
    if (!global.isSuperAdminTeacher || !global.isSuperAdminTeacher()) {
      alert("استيراد كل بنوك المنصة متاح لسوبر أدمن فقط.");
      return;
    }
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        const banks = parsed.questionBanks || parsed;
        if (!banks || typeof banks !== "object") throw new Error("invalid");
        if (global.ArabyaCloudSync) global.ArabyaCloudSync.applyQuestionBanksFromCloud(banks);
        if (typeof global.scheduleCloudBackupPush === "function") {
          global.scheduleCloudBackupPush("import-all-banks", { immediate: true });
        }
        if (global.ArabyaToast) global.ArabyaToast.showToast("تم استيراد بنوك الأسئلة ومزامنتها", "success");
      } catch (err) {
        alert("ملف غير صالح.");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function getCloudSyncActor() {
    const t = global.systemState?.activeTeacher;
    return {
      username: t?.username || "",
      name: t?.name || "",
      role: typeof global.inferTeacherRole === "function" ? global.inferTeacherRole(t) : (t?.role || ""),
      at: new Date().toISOString()
    };
  }

  async function logDeviceRejectToCloud(entry) {
    const urls = getCloudUrls();
    if (!urls.length) return false;
    const payload = {
      action: "log_device_reject",
      ...entry,
      at: new Date().toISOString()
    };
    for (const url of urls) {
      try {
        if (typeof global.postToArabyaWebApp === "function") {
          await global.postToArabyaWebApp(url, payload);
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function parseIpLines(text) {
    return String(text || "")
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function ipMatchesAllowedList(clientIp, allowedList) {
    const ip = String(clientIp || "").trim();
    if (!ip || !allowedList || !allowedList.length) return false;
    return allowedList.some(allowed => {
      const a = String(allowed || "").trim();
      if (!a) return false;
      if (ip === a) return true;
      const prefix = a.split(".").slice(0, 3).join(".");
      return prefix.length >= 7 && ip.startsWith(prefix + ".");
    });
  }

  function countStudentDevices(studentLookupKey) {
    if (!studentLookupKey || typeof global.loadExamDeviceRegistry !== "function") return 0;
    const reg = global.loadExamDeviceRegistry();
    const fps = new Set();
    (reg.bindings || []).forEach(b => {
      if (b.studentLookupKey !== studentLookupKey) return;
      if (b.deviceFingerprint) fps.add(b.deviceFingerprint);
      else if (b.deviceId) fps.add(b.deviceId);
    });
    return fps.size;
  }

  function checkMaxStudentDevices(studentLookupKey) {
    const n = countStudentDevices(studentLookupKey);
    if (n >= MAX_STUDENT_DEVICES) {
      return {
        ok: false,
        message: `تم تسجيل ${MAX_STUDENT_DEVICES} أجهزة كحد أقصى لهذا الحساب. تواصل مع المعلم لإعادة التعيين.`
      };
    }
    return { ok: true };
  }

  function getExamHallAllowedIps(exam) {
    const hall = exam?.hallMode || {};
    if (Array.isArray(hall.allowedIps) && hall.allowedIps.length) return hall.allowedIps;
    if (hall.allowedIp) return [hall.allowedIp];
    return [];
  }

  function isExamHallIpLockActive(exam) {
    const hall = exam?.hallMode;
    if (!hall || !hall.enabled) return false;
    const until = Date.parse(hall.untilIso || "");
    if (until && Date.now() > until) return false;
    return getExamHallAllowedIps(exam).length > 0;
  }

  function checkExamHallIp(exam, clientIp) {
    if (!isExamHallIpLockActive(exam)) return { ok: true };
    const allowedList = [
      ...getExamHallAllowedIps(exam),
      ...((exam && exam.allowedRetakeIps) || [])
    ];
    const ip = String(clientIp || "").trim();
    if (!ip) {
      return { ok: false, message: "وضع قاعة الامتحان مفعّل — تعذّر التحقق من عنوان IP." };
    }
    if (!ipMatchesAllowedList(ip, allowedList)) {
      return {
        ok: false,
        message: `الامتحان مقفول على عناوين IP محددة فقط. المسموح: ${allowedList.join(" ، ")} — عنوانك: ${ip}`
      };
    }
    return { ok: true };
  }

  function readHallModeFromEditor() {
    const enabled = !!document.getElementById("edit-meta-hall-mode")?.checked;
    const hallIpsEl = document.getElementById("edit-meta-hall-ips");
    const retakeIpsEl = document.getElementById("edit-meta-allowed-retake-ips");
    const allowedIps = parseIpLines(hallIpsEl ? hallIpsEl.value : "");
    const allowedRetakeIps = parseIpLines(retakeIpsEl ? retakeIpsEl.value : "");
    const hours = parseFloat(document.getElementById("edit-meta-hall-hours")?.value) || 2;
    const untilIso = enabled ? new Date(Date.now() + hours * 3600000).toISOString() : "";
    return { enabled, allowedIps, allowedRetakeIps, untilIso, hours };
  }

  function applyHallModeToEditor(exam) {
    const hall = exam?.hallMode || {};
    const retakeIps = exam?.allowedRetakeIps || [];
    const en = document.getElementById("edit-meta-hall-mode");
    const ipsEl = document.getElementById("edit-meta-hall-ips");
    const retakeEl = document.getElementById("edit-meta-allowed-retake-ips");
    const hrs = document.getElementById("edit-meta-hall-hours");
    const maxSharedEl = document.getElementById("edit-meta-max-shared-ip");
    const allowedIps = getExamHallAllowedIps(exam);
    if (en) en.checked = !!hall.enabled;
    if (ipsEl) ipsEl.value = allowedIps.join("\n");
    if (retakeEl) retakeEl.value = (retakeIps || []).join("\n");
    if (hrs) hrs.value = hall.hours != null ? hall.hours : 2;
    if (maxSharedEl) {
      const maxShared = parseInt(exam?.ipAccessPolicy?.maxStudentsPerSharedIp, 10);
      maxSharedEl.value = Number.isFinite(maxShared) && maxShared >= 1 ? maxShared : 15;
    }
  }

  function saveHallModeToExam(exam) {
    if (!exam) return;
    const hall = readHallModeFromEditor();
    exam.allowedRetakeIps = hall.allowedRetakeIps || [];
    exam.hallMode = hall.enabled
      ? {
        enabled: true,
        allowedIps: hall.allowedIps || [],
        allowedIp: (hall.allowedIps && hall.allowedIps[0]) || "",
        untilIso: hall.untilIso,
        hours: hall.hours
      }
      : { enabled: false, allowedIps: [] };
  }

  global.ArabyaPlatformSync = {
    MAX_STUDENT_DEVICES,
    getConflictMode,
    setConflictMode,
    mergeRemoteCollectionWithConflicts,
    examContentTs,
    shouldKeepLocalExamQuestions,
    recordQuestionBankSync,
    renderQuestionBankSyncIndicator,
    testCloudConnection,
    renderSyncHealthPanel,
    fixQuestionBankSyncNow,
    exportAllPlatformQuestionBanks,
    importAllPlatformQuestionBanks,
    getCloudSyncActor,
    logDeviceRejectToCloud,
    parseIpLines,
    ipMatchesAllowedList,
    countStudentDevices,
    checkMaxStudentDevices,
    isExamHallIpLockActive,
    checkExamHallIp,
    readHallModeFromEditor,
    applyHallModeToEditor,
    saveHallModeToExam
  };

  global.testArabyaCloudConnection = () => testCloudConnection();
  global.fixQuestionBankCloudSync = () => fixQuestionBankSyncNow();
  global.exportAllPlatformQuestionBanks = () => exportAllPlatformQuestionBanks();
  global.importAllPlatformQuestionBanks = importAllPlatformQuestionBanks;
})(window);
