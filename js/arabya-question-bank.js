/**
 * بنك أسئلة خاص بكل معلم — محفوظ محلياً في متصفحه فقط (لا يشاركه طلاب أو معلمون آخرون).
 */
(function (global) {
  const LEGACY_STORAGE_KEY = "arabya_shared_question_banks";
  const QB_PREFIX = "arabya_question_banks_teacher_";

  function canonicalBankOwnerKey(username) {
    return String(username || "local").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "local";
  }

  function storageKeyForTeacher(username) {
    return `${QB_PREFIX}${canonicalBankOwnerKey(username)}`;
  }

  function resolveBankUsername(canonOrRaw) {
    const canon = canonicalBankOwnerKey(canonOrRaw);
    const session = resolveTeacherSession();
    const active = session.username;
    if (active && canonicalBankOwnerKey(active) === canon) return active;
    const teachers = session.state?.teachers || [];
    const hit = teachers.find(t => canonicalBankOwnerKey(t.username) === canon);
    return hit ? hit.username : String(canonOrRaw || canon);
  }

  /** جلسة المعلم/سوبر أدمن — يعتمد على window.systemState (يُعرَّض من app.js) */
  function resolveTeacherSession() {
    const state = global.systemState || null;
    if (state?.activeTeacher?.username) {
      return { state, username: state.activeTeacher.username, teacher: state.activeTeacher };
    }
    let storedUsername = "";
    try {
      storedUsername = localStorage.getItem("arabya_active_teacher_username") || "";
    } catch (e) {}
    if (storedUsername && state?.teachers?.length) {
      const matched = state.teachers.find(t => t.username === storedUsername);
      if (matched) {
        state.activeTeacher = matched;
        return { state, username: matched.username, teacher: matched };
      }
    }
    if (storedUsername && !state) {
      return { state: null, username: storedUsername, teacher: { username: storedUsername } };
    }
    return { state, username: null, teacher: null };
  }

  function requireTeacherSession(actionLabel) {
    const session = resolveTeacherSession();
    if (!session.username) {
      const onDashboard = stateActiveViewIsTeacherDashboard();
      alert(
        onDashboard
          ? "تعذّر تحديد حسابك. حدّث الصفحة (Ctrl+Shift+R) ثم سجّل الدخول مرة أخرى."
          : `يجب تسجيل الدخول إلى لوحة المعلم أو سوبر أدمن أولاً${actionLabel ? " (" + actionLabel + ")" : ""}.`
      );
      return null;
    }
    if (!session.state) {
      alert("تعذّر تحميل حالة المنصة. حدّث الصفحة بقوة (Ctrl+Shift+R) ثم أعد المحاولة.");
      return null;
    }
    return session;
  }

  function stateActiveViewIsTeacherDashboard() {
    try {
      return global.systemState?.activeView === "teacher-dashboard-view";
    } catch (e) {
      return false;
    }
  }

  /** دمج مفاتيح بنك مكررة (TEACHER2026 vs teacher2026) في مفتاح واحد */
  function consolidateQuestionBankStorage() {
    const merged = {};
    const staleKeys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(QB_PREFIX)) continue;
        const owner = key.slice(QB_PREFIX.length);
        const canon = canonicalBankOwnerKey(owner);
        let parsed = [];
        try {
          parsed = JSON.parse(localStorage.getItem(key) || "[]");
        } catch (e) {
          parsed = [];
        }
        if (!Array.isArray(parsed)) parsed = [];
        if (!merged[canon]) merged[canon] = [];
        if (parsed.length) {
          const sig = new Set(merged[canon].map(b => b.id));
          parsed.forEach(b => {
            if (b && b.id && sig.has(b.id)) return;
            if (b && b.id) sig.add(b.id);
            merged[canon].push(b);
          });
        }
        if (key !== `${QB_PREFIX}${canon}`) staleKeys.push(key);
      }
      Object.keys(merged).forEach(canon => {
        localStorage.setItem(`${QB_PREFIX}${canon}`, JSON.stringify(merged[canon]));
      });
      staleKeys.forEach(k => {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
      });
    } catch (e) {}
  }

  function loadSharedBanks(username) {
    consolidateQuestionBankStorage();
    const key = storageKeyForTeacher(username);
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) {}

    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
      if (!Array.isArray(legacy) || !legacy.length) return [];
      const teacher = String(username || "").trim();
      const owned = legacy.filter(b => !b.teacher || b.teacher === teacher);
      if (owned.length) {
        localStorage.setItem(key, JSON.stringify(owned));
      }
      return owned;
    } catch (e) {
      return [];
    }
  }

  function queueQuestionBankCloudSync(reason) {
    if (typeof global.scheduleCloudBackupPush === "function") {
      global.scheduleCloudBackupPush(reason || "question-bank", { immediate: true });
    } else if (global.ArabyaCloudSync && typeof global.ArabyaCloudSync.pushNow === "function") {
      global.ArabyaCloudSync.pushNow(reason || "question-bank").catch(() => {});
    }
    const hasUrl = typeof global.getArabyaWebAppUrls === "function" && global.getArabyaWebAppUrls().length > 0;
    if (!hasUrl && typeof global.isSuperAdminTeacher === "function" && global.isSuperAdminTeacher()) {
      console.warn("[ARABYA] بنك الأسئلة محفوظ محلياً — أضف رابط Web App في تبويب الربط للمزامنة السحابية.");
    }
  }

  function saveSharedBanks(banks, username, options) {
    localStorage.setItem(storageKeyForTeacher(username), JSON.stringify(banks || []));
    if (!options || !options.skipCloudPush) {
      queueQuestionBankCloudSync("question-bank");
    }
  }

  function normalizeQuestions(questions) {
    if (!Array.isArray(questions)) return [];
    return questions.map((q, idx) => ({
      id: q.id != null ? q.id : idx + 1,
      type: q.type || "mcq",
      question: String(q.question || "").trim(),
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: q.correctAnswer,
      points: q.points != null ? q.points : 10,
      timeSeconds: q.timeSeconds != null ? q.timeSeconds : 60
    })).filter(q => q.question);
  }

  function renumberQuestions(questions) {
    return questions.map((q, i) => ({ ...q, id: i + 1 }));
  }

  function listBanksForTeacher(username) {
    if (!username) return [];
    return loadSharedBanks(username).filter(b => String(b.teacher || username) === String(username));
  }

  function getBankById(bankId, username) {
    return listBanksForTeacher(username).find(b => b.id === bankId) || null;
  }

  function refreshSharedBankSelect(username) {
    const select = document.getElementById("shared-question-bank-select");
    if (!select) return;
    if (!username) {
      select.innerHTML = `<option value="">— سجّل دخول المعلم لعرض بنوكك —</option>`;
      return;
    }
    const banks = listBanksForTeacher(username);
    select.innerHTML = `<option value="">— اختر بنك أسئلة محفوظ —</option>` +
      banks.map(b => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)} (${(b.questions || []).length} سؤال)</option>`).join("");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/'/g, "&#39;");
  }

  function saveBankFromExam(exam, bankName, teacherUsername) {
    if (!teacherUsername) {
      alert("يجب تسجيل الدخول إلى لوحة المعلم أو سوبر أدمن لحفظ بنك الأسئلة.");
      return false;
    }
    if (!exam || !Array.isArray(exam.questions) || !exam.questions.length) {
      alert("لا توجد أسئلة في هذا الامتحان لحفظها كبنك.");
      return false;
    }
    const name = String(bankName || "").trim() || `${exam.title || "بنك"} — ${new Date().toLocaleDateString("ar-EG")}`;
    const banks = loadSharedBanks(teacherUsername);
    const id = `bank_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    banks.push({
      id,
      name,
      subject: exam.subject || "",
      teacher: teacherUsername,
      questions: JSON.parse(JSON.stringify(exam.questions)),
      updatedAt: new Date().toISOString()
    });
    saveSharedBanks(banks, teacherUsername);
    refreshSharedBankSelect(teacherUsername);
    alert(`تم حفظ بنك «${name}» (${exam.questions.length} سؤال) — محلياً وستُزامَن إلى السحابة خلال ثانية إذا كان الربط مفعّلاً.`);
    return true;
  }

  function mergeBankIntoExam(exam, bank, mode) {
    if (!exam || !bank) return 0;
    const incoming = normalizeQuestions(bank.questions);
    if (!incoming.length) return 0;
    if (mode === "replace") {
      exam.questions = renumberQuestions(incoming);
      return exam.questions.length;
    }
    const existing = normalizeQuestions(exam.questions || []);
    const sig = new Set(existing.map(q => `${q.type}|${q.question}`));
    let added = 0;
    incoming.forEach(q => {
      const key = `${q.type}|${q.question}`;
      if (sig.has(key)) return;
      sig.add(key);
      existing.push(q);
      added++;
    });
    exam.questions = renumberQuestions(existing);
    return added;
  }

  function exportBankJson(bank) {
    const payload = {
      exportedAt: new Date().toISOString(),
      type: "arabya_question_bank",
      ownerTeacher: bank.teacher || "",
      bank
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `بنك_أسئلة_${(bank.name || "arabya").replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportBankCsv(bank) {
    const rows = [["type", "question", "options", "correctAnswer", "points", "timeSeconds"]];
    (bank.questions || []).forEach(q => {
      rows.push([
        q.type || "mcq",
        q.question || "",
        (q.options || []).join(" | "),
        q.correctAnswer != null ? String(q.correctAnswer) : "",
        q.points != null ? String(q.points) : "10",
        q.timeSeconds != null ? String(q.timeSeconds) : "60"
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `بنك_أسئلة_${(bank.name || "arabya").replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  global.ArabyaQuestionBank = {
    QB_PREFIX,
    canonicalBankOwnerKey,
    resolveBankUsername,
    resolveTeacherSession,
    requireTeacherSession,
    consolidateQuestionBankStorage,
    storageKeyForTeacher,
    loadSharedBanks,
    saveSharedBanks,
    listBanksForTeacher,
    getBankById,
    refreshSharedBankSelect,
    saveBankFromExam,
    mergeBankIntoExam,
    normalizeQuestions,
    exportBankJson,
    exportBankCsv
  };

  global.saveSharedBankFromCurrentExam = function () {
    const session = requireTeacherSession("حفظ بنك الأسئلة");
    if (!session) return;
    const examId = global.currentEditingExamId;
    const state = session.state;
    const username = session.username;
    if (!examId || !state) return;
    const exam = state.exams.find(e => e.id === examId);
    const name = prompt("اسم بنك الأسئلة (خاص بك فقط):", exam?.title || "");
    if (name === null) return;
    global.ArabyaQuestionBank.saveBankFromExam(exam, name, username);
  };

  global.importSharedBankIntoCurrentExam = function () {
    const session = requireTeacherSession("دمج بنك الأسئلة");
    if (!session) return;
    const examId = global.currentEditingExamId;
    const state = session.state;
    const username = session.username;
    const select = document.getElementById("shared-question-bank-select");
    const modeEl = document.getElementById("shared-bank-import-mode");
    if (!examId || !state || !select) return;
    const bankId = select.value;
    if (!bankId) {
      alert("اختر بنك أسئلة من قائمتك أولاً.");
      return;
    }
    const bank = getBankById(bankId, username);
    if (!bank) {
      alert("البنك غير متاح لحسابك.");
      return;
    }
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) return;
    const mode = (modeEl && modeEl.value) || "append";
    const count = mergeBankIntoExam(exam, bank, mode);
    if (typeof global.sanitizeQuestionConfig === "function") global.sanitizeQuestionConfig(exam);
    if (typeof global.saveSystemState === "function") global.saveSystemState(true);
    if (typeof global.renderQuestionsForEdit === "function") global.renderQuestionsForEdit(exam);
    alert(mode === "replace" ? `تم استبدال بنك الامتحان (${count} سؤال).` : `تم دمج ${count} سؤال جديد.`);
  };

  global.exportSelectedSharedBankJson = function () {
    const session = requireTeacherSession("تصدير بنك");
    if (!session) return;
    const username = session.username;
    const select = document.getElementById("shared-question-bank-select");
    if (!username || !select || !select.value) {
      alert("اختر بنكاً من بنوكك أولاً.");
      return;
    }
    const bank = getBankById(select.value, username);
    if (bank) exportBankJson(bank);
  };

  global.exportSelectedSharedBankCsv = function () {
    const session = requireTeacherSession("تصدير بنك");
    if (!session) return;
    const username = session.username;
    const select = document.getElementById("shared-question-bank-select");
    if (!username || !select || !select.value) {
      alert("اختر بنكاً من بنوكك أولاً.");
      return;
    }
    const bank = getBankById(select.value, username);
    if (bank) exportBankCsv(bank);
  };

  global.importQuestionBankFile = function (event) {
    const session = requireTeacherSession("استيراد بنك");
    if (!session) return;
    const username = session.username;
    if (!username) {
      alert("يجب تسجيل الدخول إلى لوحة المعلم أو سوبر أدمن لاستيراد بنك أسئلة.");
      event.target.value = "";
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        const questions = parsed.questions || parsed.bank?.questions || (Array.isArray(parsed) ? parsed : null);
        if (!questions) {
          alert("تنسيق غير صالح. يجب أن يحتوي الملف على questions أو bank.questions");
          return;
        }
        const banks = loadSharedBanks(username);
        const id = `bank_${Date.now()}`;
        banks.push({
          id,
          name: parsed.name || parsed.bank?.name || file.name.replace(/\.json$/i, ""),
          subject: parsed.subject || parsed.bank?.subject || "",
          teacher: username,
          questions: normalizeQuestions(questions),
          updatedAt: new Date().toISOString()
        });
        saveSharedBanks(banks, username);
        refreshSharedBankSelect(username);
        alert("تم استيراد بنك الأسئلة — سيُرفع تلقائياً إلى السحابة مع النسخة الاحتياطية.");
      } catch (err) {
        alert("تعذّر قراءة ملف بنك الأسئلة.");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  };
})(window);
