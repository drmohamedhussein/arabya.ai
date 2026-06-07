/**
 * حقن امتحانات قوالب جاهزة دون المساس بالامتحانات المحفوظة.
 * يُضاف الامتحان فقط إذا لم يكن معرّفه (id) موجوداً مسبقاً.
 */
(function (global) {
  const INJECT_FLAG = "arabya_template_exams_injected_v1";

  function getTemplateExams() {
    const list = global.arabyaTemplateExams;
    return Array.isArray(list) ? list : [];
  }

  function normalizeInjectedExam(template, activeTeacherUsername) {
    const copy = JSON.parse(JSON.stringify(template));
    copy.teacher = copy.teacher || activeTeacherUsername || "";
    copy.timeLimit = copy.timeLimit || 60;
    copy.shuffleQuestions = copy.shuffleQuestions !== false;
    copy.questionCount = copy.questionCount || "";
    copy.maxCheatAttempts = Number.isFinite(parseInt(copy.maxCheatAttempts, 10))
      ? parseInt(copy.maxCheatAttempts, 10)
      : 5;
    if (typeof global.sanitizeQuestionConfig === "function") {
      global.sanitizeQuestionConfig(copy);
    }
    return copy;
  }

  function injectTemplateExamsIntoState(state, options) {
    if (!state || !Array.isArray(state.exams)) return { added: 0, skipped: 0 };
    const templates = getTemplateExams();
    if (!templates.length) return { added: 0, skipped: 0 };

    const existingIds = new Set(state.exams.map(exam => String(exam && exam.id || "")));
    const activeTeacherUsername = state.activeTeacher && state.activeTeacher.username
      ? state.activeTeacher.username
      : "";
    let added = 0;
    let skipped = 0;

    templates.forEach(template => {
      if (!template || !template.id) return;
      const id = String(template.id);
      if (existingIds.has(id)) {
        skipped++;
        return;
      }
      state.exams.push(normalizeInjectedExam(template, activeTeacherUsername));
      existingIds.add(id);
      added++;
    });

    if (added > 0 && (!options || !options.deferPersist)) {
      persistInjectedExams(state, added);
    }

    return { added, skipped };
  }

  function persistInjectedExams(state, addedCount) {
    try {
      if (typeof global.syncTeacherExamsVaultFromState === "function") {
        global.syncTeacherExamsVaultFromState();
      }
      const payload = state._teacherExamsVault || state.exams;
      localStorage.setItem("arabya_exams_db", JSON.stringify(payload));
      const injected = JSON.parse(localStorage.getItem(INJECT_FLAG) || "[]");
      const ids = getTemplateExams().map(t => t.id).filter(Boolean);
      ids.forEach(id => {
        if (!injected.includes(id)) injected.push(id);
      });
      localStorage.setItem(INJECT_FLAG, JSON.stringify(injected));
      if (typeof global.scheduleCloudBackupPush === "function") {
        global.scheduleCloudBackupPush("template-exam-inject", { immediate: true });
      }
      console.info(`[ARABYA] تم حقن ${addedCount} امتحان قالب جاهز دون المساس بالامتحانات الحالية.`);
    } catch (err) {
      console.warn("[ARABYA] template exam persist:", err);
    }
  }

  global.ArabyaTemplateExams = {
    INJECT_FLAG,
    getTemplateExams,
    injectTemplateExamsIntoState,
    persistInjectedExams
  };

  global.injectArabyaTemplateExamsIfMissing = function (options) {
    const state = global.systemState;
    if (!state) return { added: 0, skipped: 0 };
    if (!Array.isArray(state.exams)) state.exams = [];
    return injectTemplateExamsIntoState(state, options);
  };

  /** يُعاد استدعاؤه بعد المزامنة أو إعادة التحميل لضمان بقاء امتحانات القوالب. */
  global.ensureArabyaTemplateExamsInjected = function (options) {
    return global.injectArabyaTemplateExamsIfMissing(options);
  };
})(typeof window !== "undefined" ? window : global);
