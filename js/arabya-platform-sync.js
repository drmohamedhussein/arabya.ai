/**
 * صحة المزامنة، تعارضات، بنك أسئلة، اختبار اتصال، أمان أجهزة إضافي.
 */
(function (global) {
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

  function mergeRemoteCollectionWithConflicts(current, incoming, keyFn, label) {
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
      const localTs = recordTs(local);
      const remoteTs = recordTs(remote);
      if (localTs === remoteTs || JSON.stringify(local) === JSON.stringify(remote)) {
        map[key] = { ...local, ...remote };
        return;
      }
      const mode = getConflictMode();
      if (mode === "ask") {
        conflicts.push({ key, label: label || key, local, remote, localTs, remoteTs });
        if (remoteTs >= localTs) map[key] = { ...local, ...remote };
        else map[key] = { ...local };
      } else {
        map[key] = remoteTs >= localTs ? { ...local, ...remote } : { ...local };
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
    el.innerHTML = `<span class="material-icons" style="font-size:1rem;vertical-align:middle;color:${color};">${icon}</span> آخر رفع بنك: <strong style="color:${color};">${when}</strong>${meta.detail ? ` · ${meta.detail}` : ""}`;
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
      if (outEl) outEl.innerHTML = `<span style="color:var(--error);">${msg}</span>`;
      if (global.ArabyaToast) global.ArabyaToast.showToast(msg, "error");
      return { ok: false };
    }
    const html =
      `<div style="font-size:0.85rem;line-height:1.6;">` +
      `<div><strong>cloudRevision:</strong> <code>${meta.cloudRevision || "—"}</code></div>` +
      `<div><strong>بنوك أسئلة (معلمون):</strong> ${meta.questionBankTeachers ?? "—"} · <strong>بنوك:</strong> ${meta.questionBankItems ?? "—"}</div>` +
      `<div><strong>حجم JSON الاحتياطي:</strong> ${meta.backupJsonChars != null ? meta.backupJsonChars.toLocaleString("ar-EG") + " حرف" : "—"}</div>` +
      `<div><strong>سجلات:</strong> معلمون ${meta.teachers ?? 0} · طلاب ${meta.students ?? 0} · امتحانات ${meta.exams ?? 0} · نتائج ${meta.results ?? 0}</div>` +
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
      `<div><span>آخر revision</span><code>${meta.cloudRevision || "—"}</code></div>` +
      `<div><span>بنوك محلية</span><strong>${localBanks}</strong> (${localBankItems} بنك)</div>` +
      `<div><span>بنوك سحابية</span><strong>${meta.questionBankTeachers ?? "—"}</strong> معلم</div>` +
      `<div><span>حجم ARABYA_BACKUP</span><strong>${meta.backupJsonChars != null ? meta.backupJsonChars.toLocaleString("ar-EG") : "—"}</strong> حرف</div>` +
      `<div><span>نتائج / طلاب</span>${meta.results ?? 0} / ${meta.students ?? 0}</div>` +
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

  function ensureStudentDeviceBindToken(student) {
    if (!student) return "";
    if (student.deviceBindToken) return student.deviceBindToken;
    const token = `bind_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    student.deviceBindToken = token;
    return token;
  }

  function buildStudentBindQrUrl(student) {
    const key = student?.studentKey || student?.id || "";
    const token = ensureStudentDeviceBindToken(student);
    const base = String(global.location?.origin || "https://arabya.net").replace(/\/$/, "");
    return `${base}/#student-login-view?bind=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
  }

  function getStudentBindQrImageUrl(student) {
    const url = buildStudentBindQrUrl(student);
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
  }

  function validateStudentDeviceBinding(student, bindTokenInput, deviceProfile) {
    if (!student || !deviceProfile) return { ok: true };
    const token = String(bindTokenInput || "").trim();
    const expected = student.deviceBindToken || "";
    const boundFp = student.deviceFingerprint || "";
    const currentFp = deviceProfile.deviceFingerprint || "";

    if (boundFp && currentFp && boundFp === currentFp) return { ok: true };
    if (!expected) {
      if (currentFp) student.deviceFingerprint = currentFp;
      if (deviceProfile.deviceId) student.deviceId = deviceProfile.deviceId;
      return { ok: true };
    }
    if (token && token === expected) {
      student.deviceFingerprint = currentFp;
      student.deviceId = deviceProfile.deviceId || "";
      student.deviceBoundAt = new Date().toISOString();
      return { ok: true };
    }
    if (!boundFp) {
      return {
        ok: false,
        message: "أدخل رمز ربط الجهاز من QR الخاص بك (مرة واحدة) قبل بدء الامتحان."
      };
    }
    return {
      ok: false,
      message: "هذا الجهاز غير مطابق لجهازك المسجّل. استخدم جهازك أو اطلب من المعلم إعادة ربط الجهاز."
    };
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

  function isExamHallIpLockActive(exam) {
    const hall = exam?.hallMode;
    if (!hall || !hall.enabled) return false;
    const until = Date.parse(hall.untilIso || "");
    if (until && Date.now() > until) return false;
    return !!hall.allowedIp;
  }

  function checkExamHallIp(exam, clientIp) {
    if (!isExamHallIpLockActive(exam)) return { ok: true };
    const allowed = String(exam.hallMode.allowedIp || "").trim();
    const ip = String(clientIp || "").trim();
    if (!ip) {
      return { ok: false, message: "وضع قاعة الامتحان مفعّل — تعذّر التحقق من عنوان IP." };
    }
    if (ip !== allowed && !ip.startsWith(allowed.split(".").slice(0, 3).join("."))) {
      return {
        ok: false,
        message: `الامتحان مقفول على IP القاعة (${allowed}). عنوانك الحالي: ${ip}`
      };
    }
    return { ok: true };
  }

  function readHallModeFromEditor() {
    const enabled = !!document.getElementById("edit-meta-hall-mode")?.checked;
    const allowedIp = document.getElementById("edit-meta-hall-ip")?.value?.trim() || "";
    const hours = parseFloat(document.getElementById("edit-meta-hall-hours")?.value) || 2;
    const untilIso = enabled ? new Date(Date.now() + hours * 3600000).toISOString() : "";
    return { enabled, allowedIp, untilIso, hours };
  }

  function applyHallModeToEditor(exam) {
    const hall = exam?.hallMode || {};
    const en = document.getElementById("edit-meta-hall-mode");
    const ip = document.getElementById("edit-meta-hall-ip");
    const hrs = document.getElementById("edit-meta-hall-hours");
    if (en) en.checked = !!hall.enabled;
    if (ip) ip.value = hall.allowedIp || "";
    if (hrs) hrs.value = hall.hours != null ? hall.hours : 2;
  }

  function saveHallModeToExam(exam) {
    if (!exam) return;
    const hall = readHallModeFromEditor();
    exam.hallMode = hall.enabled
      ? { enabled: true, allowedIp: hall.allowedIp, untilIso: hall.untilIso, hours: hall.hours }
      : { enabled: false };
  }

  global.ArabyaPlatformSync = {
    MAX_STUDENT_DEVICES,
    getConflictMode,
    setConflictMode,
    mergeRemoteCollectionWithConflicts,
    recordQuestionBankSync,
    renderQuestionBankSyncIndicator,
    testCloudConnection,
    renderSyncHealthPanel,
    fixQuestionBankSyncNow,
    exportAllPlatformQuestionBanks,
    importAllPlatformQuestionBanks,
    getCloudSyncActor,
    logDeviceRejectToCloud,
    ensureStudentDeviceBindToken,
    buildStudentBindQrUrl,
    getStudentBindQrImageUrl,
    validateStudentDeviceBinding,
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
