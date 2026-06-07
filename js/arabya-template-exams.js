/**
 * حقن امتحانات قوالب جاهزة دون المساس بالامتحانات المحفوظة.
 * يُضاف الامتحان فقط إذا لم يكن معرّفه (id) موجوداً مسبقاً.
 * عند ترقية قالب (templateRevision) يُحدَّث الامتحان المطابق فقط دون المساس ببقية الامتحانات.
 */
(function (global) {
  const INJECT_FLAG = "arabya_template_exams_injected_v1";
  const REVISION_FLAG = "arabya_template_exams_revision";

  function getTemplateExams() {
    const list = global.arabyaTemplateExams;
    return Array.isArray(list) ? list : [];
  }

  function getStoredTemplateRevisions() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(REVISION_FLAG);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function setStoredTemplateRevision(examId, revision) {
    if (!global.localStorage || !examId) return;
    try {
      const map = getStoredTemplateRevisions();
      map[String(examId)] = revision;
      global.localStorage.setItem(REVISION_FLAG, JSON.stringify(map));
    } catch (err) {
      console.warn("[ARABYA] template revision persist:", err);
    }
  }

  function getExamTemplateRevision(exam) {
    const stored = getStoredTemplateRevisions();
    const fromExam = exam && Number.isFinite(parseInt(exam.templateRevision, 10))
      ? parseInt(exam.templateRevision, 10)
      : 0;
    const fromStore = stored[String(exam && exam.id || "")] || 0;
    return Math.max(fromExam, fromStore);
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

  function preserveTeacherExamFields(existing, upgraded) {
    if (!existing || !upgraded) return upgraded;
    if (existing.teacher) upgraded.teacher = existing.teacher;
    if (existing.endsAt) upgraded.endsAt = existing.endsAt;
    if (Number.isFinite(parseInt(existing.maxCheatAttempts, 10))) {
      upgraded.maxCheatAttempts = parseInt(existing.maxCheatAttempts, 10);
    }
    if (existing.shuffleQuestions === false) upgraded.shuffleQuestions = false;
    if (existing.questionCount) upgraded.questionCount = existing.questionCount;
    return upgraded;
  }

  function needsTemplateUpgrade(existing, template) {
    if (!existing || !template || !template.id) return false;
    const targetRev = Number.isFinite(parseInt(template.templateRevision, 10))
      ? parseInt(template.templateRevision, 10)
      : 1;
    const localRev = getExamTemplateRevision(existing);
    const templateQCount = Array.isArray(template.questions) ? template.questions.length : 0;
    const localQCount = Array.isArray(existing.questions) ? existing.questions.length : 0;
    return targetRev > localRev || templateQCount > localQCount;
  }

  function upgradeTemplateExamInState(state, template, activeTeacherUsername) {
    if (!state || !Array.isArray(state.exams) || !template || !template.id) return false;
    const id = String(template.id);
    const idx = state.exams.findIndex(exam => String(exam && exam.id || "") === id);
    if (idx < 0) return false;
    const existing = state.exams[idx];
    if (!needsTemplateUpgrade(existing, template)) return false;

    const upgraded = preserveTeacherExamFields(
      existing,
      normalizeInjectedExam(template, activeTeacherUsername)
    );
    state.exams[idx] = upgraded;
    const targetRev = Number.isFinite(parseInt(template.templateRevision, 10))
      ? parseInt(template.templateRevision, 10)
      : 1;
    setStoredTemplateRevision(id, targetRev);
    return true;
  }

  function injectTemplateExamsIntoState(state, options) {
    if (!state || !Array.isArray(state.exams)) return { added: 0, skipped: 0, upgraded: 0 };
    const templates = getTemplateExams();
    if (!templates.length) return { added: 0, skipped: 0, upgraded: 0 };

    const existingIds = new Set(state.exams.map(exam => String(exam && exam.id || "")));
    const activeTeacherUsername = state.activeTeacher && state.activeTeacher.username
      ? state.activeTeacher.username
      : "";
    let added = 0;
    let skipped = 0;
    let upgraded = 0;

    templates.forEach(template => {
      if (!template || !template.id) return;
      const id = String(template.id);
      if (existingIds.has(id)) {
        if (upgradeTemplateExamInState(state, template, activeTeacherUsername)) {
          upgraded++;
        } else {
          skipped++;
        }
        return;
      }
      state.exams.push(normalizeInjectedExam(template, activeTeacherUsername));
      existingIds.add(id);
      const targetRev = Number.isFinite(parseInt(template.templateRevision, 10))
        ? parseInt(template.templateRevision, 10)
        : 1;
      setStoredTemplateRevision(id, targetRev);
      added++;
    });

    if ((added > 0 || upgraded > 0) && (!options || !options.deferPersist)) {
      persistInjectedExams(state, added, upgraded);
    }

    return { added, skipped, upgraded };
  }

  function persistInjectedExams(state, addedCount, upgradedCount) {
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
      const parts = [];
      if (addedCount > 0) parts.push(`إضافة ${addedCount}`);
      if (upgradedCount > 0) parts.push(`ترقية ${upgradedCount}`);
      console.info(`[ARABYA] تم حقن امتحانات القوالب (${parts.join("، ")}) دون المساس بالامتحانات الأخرى.`);
    } catch (err) {
      console.warn("[ARABYA] template exam persist:", err);
    }
  }

  global.ArabyaTemplateExams = {
    INJECT_FLAG,
    REVISION_FLAG,
    getTemplateExams,
    getStoredTemplateRevisions,
    needsTemplateUpgrade,
    upgradeTemplateExamInState,
    injectTemplateExamsIntoState,
    persistInjectedExams
  };

  global.injectArabyaTemplateExamsIfMissing = function (options) {
    const state = global.systemState;
    if (!state) return { added: 0, skipped: 0, upgraded: 0 };
    if (!Array.isArray(state.exams)) state.exams = [];
    return injectTemplateExamsIntoState(state, options);
  };

  /** يُعاد استدعاؤه بعد المزامنة أو إعادة التحميل لضمان بقاء امتحانات القوالب. */
  global.ensureArabyaTemplateExamsInjected = function (options) {
    return global.injectArabyaTemplateExamsIfMissing(options);
  };
})(typeof window !== "undefined" ? window : global);
