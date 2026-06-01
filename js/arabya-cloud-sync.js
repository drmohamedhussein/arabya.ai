/**
 * مزامنة سحابية موحّدة: رفع فوري (مع تأخير قصير) وجلب دوري.
 */
(function (global) {
  const QB_PREFIX = "arabya_question_banks_teacher_";
  let pushTimer = null;
  let pushInFlight = false;
  let pendingPush = false;

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
        global.ArabyaQuestionBank.saveSharedBanks(rows, username);
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

  let pullTimer = null;

  function startPullLoop(intervalMs) {
    stopPullLoop();
    const ms = intervalMs || 90000;
    pullTimer = setInterval(() => {
      if (global.systemState?.activeView !== "teacher-dashboard-view") return;
      if (typeof global.syncDatabaseFromCloud !== "function") return;
      global.syncDatabaseFromCloud({ silent: true }).then(res => {
        if (res && res.ok && typeof global.refreshTeacherDashboardViews === "function") {
          global.refreshTeacherDashboardViews({ all: true });
        }
      });
    }, ms);
    document.addEventListener("visibilitychange", onVisibilityPull);
  }

  function stopPullLoop() {
    if (pullTimer) clearInterval(pullTimer);
    pullTimer = null;
    document.removeEventListener("visibilitychange", onVisibilityPull);
  }

  function onVisibilityPull() {
    if (document.visibilityState !== "visible") return;
    if (global.systemState?.activeView !== "teacher-dashboard-view") return;
    if (typeof global.syncDatabaseFromCloud === "function") {
      global.syncDatabaseFromCloud({ silent: true }).then(res => {
        if (res && res.ok && typeof global.refreshTeacherDashboardViews === "function") {
          global.refreshTeacherDashboardViews({ all: true });
        }
      });
    }
  }

  global.ArabyaCloudSync = {
    collectAllQuestionBanksForCloud,
    applyQuestionBanksFromCloud,
    sanitizeTeacherForCloud,
    sanitizeTeachersForCloud,
    buildFullCloudBackupData,
    schedulePush,
    pushNow,
    applyRemoteDatabase,
    startPullLoop,
    stopPullLoop
  };

  global.buildFullCloudBackupData = buildFullCloudBackupData;
  global.scheduleCloudBackupPush = schedulePush;
})(window);
