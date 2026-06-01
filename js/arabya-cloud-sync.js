/**
 * مزامنة سحابية موحّدة: رفع فوري (مع تأخير قصير) وجلب دوري + مراقبة تعديلات الشيت.
 */
(function (global) {
  const QB_PREFIX = "arabya_question_banks_teacher_";
  const PULL_INTERVAL_MS = 30000;
  const WATCH_INTERVAL_MS = 12000;
  const REVISION_STORAGE_KEY = "arabya_cloud_revision";
  const MIN_PULL_GAP_MS = 8000;

  let pushTimer = null;
  let pushInFlight = false;
  let pendingPush = false;
  let pullTimer = null;
  let watchTimer = null;
  let pullInFlight = false;
  let lastFullPullAt = 0;

  function collectAllQuestionBanksForCloud() {
    const banks = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(QB_PREFIX)) continue;
        const username = key.slice(QB_PREFIX.length);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) banks[username] = parsed;
      }
    } catch (e) {}
    if (global.systemState?.activeTeacher?.username && global.ArabyaQuestionBank) {
      const u = global.systemState.activeTeacher.username;
      const active = global.ArabyaQuestionBank.loadSharedBanks(u);
      if (active.length) banks[u] = active;
    }
    return banks;
  }

  function applyQuestionBanksFromCloud(cloudBanks) {
    if (!cloudBanks || typeof cloudBanks !== "object" || !global.ArabyaQuestionBank) return;
    Object.keys(cloudBanks).forEach(username => {
      const rows = cloudBanks[username];
      if (Array.isArray(rows) && rows.length) {
        global.ArabyaQuestionBank.saveSharedBanks(rows, username, { skipCloudPush: true });
      }
    });
    if (global.systemState?.activeTeacher?.username) {
      global.ArabyaQuestionBank.refreshSharedBankSelect(global.systemState.activeTeacher.username);
    }
  }

  function sanitizeTeacherForCloud(teacher) {
    if (!teacher) return teacher;
    const copy = JSON.parse(JSON.stringify(teacher));
    delete copy.password;
    if (copy.integrationConfig && copy.integrationConfig.teacherCode) {
      delete copy.integrationConfig.teacherCode;
    }
    return copy;
  }

  function sanitizeTeachersForCloud(teachers) {
    return (teachers || []).map(sanitizeTeacherForCloud);
  }

  function buildFullCloudBackupData() {
    const state = global.systemState || {};
    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      appVersion: global.ARABYA_APP_VERSION || "",
      teachers: sanitizeTeachersForCloud(state.teachers),
      students: state.students || [],
      exams: state.exams || [],
      results: state.results || [],
      examDeviceRegistry: typeof global.loadExamDeviceRegistry === "function"
        ? global.loadExamDeviceRegistry()
        : { bindings: [] },
      questionBanks: collectAllQuestionBanksForCloud(),
      config: state.config ? { ...state.config, teacherCode: undefined } : {}
    };
  }

  function getCloudWebAppUrls() {
    if (typeof global.getArabyaWebAppUrls !== "function") return [];
    return global.getArabyaWebAppUrls()
      .map(u => (typeof global.normalizeArabyaWebAppUrl === "function" ? global.normalizeArabyaWebAppUrl(u) : String(u || "").trim()))
      .filter(Boolean);
  }

  function getStoredCloudRevision() {
    try {
      return localStorage.getItem(REVISION_STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setStoredCloudRevision(revision) {
    if (!revision) return;
    try {
      localStorage.setItem(REVISION_STORAGE_KEY, String(revision));
    } catch (e) {}
  }

  function rememberCloudRevisionFromResponse(response) {
    if (response && response.cloudRevision) {
      setStoredCloudRevision(response.cloudRevision);
    }
  }

  async function fetchRemoteCloudRevision() {
    const urls = getCloudWebAppUrls();
    for (const rawUrl of urls) {
      const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_sync_meta";
      try {
        const res = await fetch(fetchUrl, { method: "GET", headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const body = await res.json();
        if (body && body.status === "success" && body.cloudRevision) {
          return String(body.cloudRevision);
        }
      } catch (e) {}
    }
    return null;
  }

  function runPullFromCloud(reason) {
    if (global.systemState?.activeView !== "teacher-dashboard-view") {
      return Promise.resolve(null);
    }
    if (typeof global.syncDatabaseFromCloud !== "function") {
      return Promise.resolve(null);
    }
    const now = Date.now();
    if (pullInFlight) return Promise.resolve(null);
    if (now - lastFullPullAt < MIN_PULL_GAP_MS && reason !== "sheet-edit") {
      return Promise.resolve(null);
    }
    pullInFlight = true;
    return global.syncDatabaseFromCloud({ silent: true })
      .then(res => {
        lastFullPullAt = Date.now();
        if (res && res.cloudRevision) setStoredCloudRevision(res.cloudRevision);
        if (res && res.ok && typeof global.refreshTeacherDashboardViews === "function") {
          global.refreshTeacherDashboardViews({ all: true });
        }
        return res;
      })
      .finally(() => {
        pullInFlight = false;
      });
  }

  async function watchCloudRevision() {
    if (global.systemState?.activeView !== "teacher-dashboard-view") return;
    if (!getCloudWebAppUrls().length) return;
    const remoteRevision = await fetchRemoteCloudRevision();
    if (!remoteRevision) return;
    const localRevision = getStoredCloudRevision();
    if (!localRevision) {
      setStoredCloudRevision(remoteRevision);
      return;
    }
    if (remoteRevision !== localRevision) {
      setStoredCloudRevision(remoteRevision);
      await runPullFromCloud("sheet-edit");
    }
  }

  async function pushNow(reason) {
    if (typeof global.pushCloudBackupNow !== "function") return false;
    if (pushInFlight) {
      pendingPush = true;
      return false;
    }
    pushInFlight = true;
    try {
      const ok = await global.pushCloudBackupNow(reason);
      return ok;
    } finally {
      pushInFlight = false;
      if (pendingPush) {
        pendingPush = false;
        schedulePush("follow-up");
      }
    }
  }

  function schedulePush(reason) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushNow(reason || "auto").catch(() => {});
    }, 700);
  }

  function applyRemoteDatabase(remoteData) {
    if (!remoteData || typeof remoteData !== "object") return false;
    if (typeof global.mergeRemoteDatabaseIntoLocal === "function") {
      global.mergeRemoteDatabaseIntoLocal(remoteData);
    }
    applyQuestionBanksFromCloud(remoteData.questionBanks);
    if (typeof global.saveSystemState === "function") {
      global.saveSystemState(false);
    }
    return true;
  }

  function startPullLoop(intervalMs) {
    stopPullLoop();
    const ms = intervalMs || PULL_INTERVAL_MS;
    pullTimer = setInterval(() => {
      runPullFromCloud("interval").catch(() => {});
    }, ms);
    watchTimer = setInterval(() => {
      watchCloudRevision().catch(() => {});
    }, WATCH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityPull);
    watchCloudRevision().catch(() => {});
  }

  function stopPullLoop() {
    if (pullTimer) clearInterval(pullTimer);
    if (watchTimer) clearInterval(watchTimer);
    pullTimer = null;
    watchTimer = null;
    document.removeEventListener("visibilitychange", onVisibilityPull);
  }

  function onVisibilityPull() {
    if (document.visibilityState !== "visible") return;
    watchCloudRevision().catch(() => {});
    runPullFromCloud("visibility").catch(() => {});
  }

  global.ArabyaCloudSync = {
    PULL_INTERVAL_MS,
    WATCH_INTERVAL_MS,
    collectAllQuestionBanksForCloud,
    applyQuestionBanksFromCloud,
    sanitizeTeacherForCloud,
    sanitizeTeachersForCloud,
    buildFullCloudBackupData,
    schedulePush,
    pushNow,
    applyRemoteDatabase,
    startPullLoop,
    stopPullLoop,
    fetchRemoteCloudRevision,
    rememberCloudRevisionFromResponse,
    setStoredCloudRevision,
    getStoredCloudRevision
  };

  global.buildFullCloudBackupData = buildFullCloudBackupData;
  global.scheduleCloudBackupPush = schedulePush;
})(window);
