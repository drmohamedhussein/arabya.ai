/**
 * بنك أسئلة مشترك — حفظ، استيراد، تصدير، وربط بامتحانات متعددة.
 */
(function (global) {
  const STORAGE_KEY = "arabya_shared_question_banks";

  function loadSharedBanks() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveSharedBanks(banks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(banks));
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
    return loadSharedBanks().filter(b => !b.teacher || b.teacher === username);
  }

  function refreshSharedBankSelect(username) {
    const select = document.getElementById("shared-question-bank-select");
    if (!select) return;
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
    if (!exam || !Array.isArray(exam.questions) || !exam.questions.length) {
      alert("لا توجد أسئلة في هذا الامتحان لحفظها كبنك.");
      return false;
    }
    const name = String(bankName || "").trim() || `${exam.title || "بنك"} — ${new Date().toLocaleDateString("ar-EG")}`;
    const banks = loadSharedBanks();
    const id = `bank_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    banks.push({
      id,
      name,
      subject: exam.subject || "",
      teacher: teacherUsername || exam.teacher || "",
      questions: JSON.parse(JSON.stringify(exam.questions)),
      updatedAt: new Date().toISOString()
    });
    saveSharedBanks(banks);
    refreshSharedBankSelect(teacherUsername);
    alert(`تم حفظ بنك «${name}» (${exam.questions.length} سؤال).`);
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
    loadSharedBanks,
    saveSharedBanks,
    listBanksForTeacher,
    refreshSharedBankSelect,
    saveBankFromExam,
    mergeBankIntoExam,
    normalizeQuestions,
    exportBankJson,
    exportBankCsv
  };

  global.saveSharedBankFromCurrentExam = function () {
    const examId = global.currentEditingExamId;
    const state = global.systemState;
    if (!examId || !state) return;
    const exam = state.exams.find(e => e.id === examId);
    const name = prompt("اسم بنك الأسئلة المشترك:", exam?.title || "");
    if (name === null) return;
    global.ArabyaQuestionBank.saveBankFromExam(exam, name, state.activeTeacher?.username);
  };

  global.importSharedBankIntoCurrentExam = function () {
    const examId = global.currentEditingExamId;
    const state = global.systemState;
    const select = document.getElementById("shared-question-bank-select");
    const modeEl = document.getElementById("shared-bank-import-mode");
    if (!examId || !state || !select) return;
    const bankId = select.value;
    if (!bankId) {
      alert("اختر بنك أسئلة من القائمة أولاً.");
      return;
    }
    const bank = loadSharedBanks().find(b => b.id === bankId);
    const exam = state.exams.find(e => e.id === examId);
    if (!bank || !exam) return;
    const mode = (modeEl && modeEl.value) || "append";
    const count = mergeBankIntoExam(exam, bank, mode);
    if (typeof global.sanitizeQuestionConfig === "function") global.sanitizeQuestionConfig(exam);
    if (typeof global.saveSystemState === "function") global.saveSystemState(true);
    if (typeof global.renderQuestionsForEdit === "function") global.renderQuestionsForEdit(exam);
    alert(mode === "replace" ? `تم استبدال بنك الامتحان (${count} سؤال).` : `تم دمج ${count} سؤال جديد.`);
  };

  global.exportSelectedSharedBankJson = function () {
    const select = document.getElementById("shared-question-bank-select");
    if (!select || !select.value) {
      alert("اختر بنكاً أولاً.");
      return;
    }
    const bank = loadSharedBanks().find(b => b.id === select.value);
    if (bank) exportBankJson(bank);
  };

  global.exportSelectedSharedBankCsv = function () {
    const select = document.getElementById("shared-question-bank-select");
    if (!select || !select.value) {
      alert("اختر بنكاً أولاً.");
      return;
    }
    const bank = loadSharedBanks().find(b => b.id === select.value);
    if (bank) exportBankCsv(bank);
  };

  global.importQuestionBankFile = function (event) {
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
        const banks = loadSharedBanks();
        const id = `bank_${Date.now()}`;
        banks.push({
          id,
          name: parsed.name || parsed.bank?.name || file.name.replace(/\.json$/i, ""),
          subject: parsed.subject || parsed.bank?.subject || "",
          teacher: global.systemState?.activeTeacher?.username || "",
          questions: normalizeQuestions(questions),
          updatedAt: new Date().toISOString()
        });
        saveSharedBanks(banks);
        refreshSharedBankSelect(global.systemState?.activeTeacher?.username);
        alert("تم استيراد بنك الأسئلة بنجاح.");
      } catch (err) {
        alert("تعذّر قراءة ملف بنك الأسئلة.");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  };
})(window);
