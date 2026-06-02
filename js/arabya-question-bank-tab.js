(function (global) {
  function normalizeImportedQuestionType(rawType) {
    const value = String(rawType || "").trim().toLowerCase();
    if (!value) return "multiple";
    if (["true_false", "truefalse", "boolean", "true/false", "tf", "صواب", "صواب وخطأ", "صح"].includes(value)) return "boolean";
    if (["essay", "article", "writing", "مقالي", "مقال", "كتابي"].includes(value)) return "essay";
    return "multiple";
  }

  function parseQuestionBankCsv(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(line => line.trim());
    if (!lines.length) return [];
    const split = line => {
      const out = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === "\"") {
          if (quoted && line[i + 1] === "\"") {
            current += "\"";
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (ch === "," && !quoted) {
          out.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      out.push(current.trim());
      return out.map(cell => cell.replace(/^"|"$/g, "").trim());
    };
    const headers = split(lines[0]).map(h => h.toLowerCase());
    return lines.slice(1).map(line => {
      const cols = split(line);
      return headers.reduce((row, header, idx) => {
        row[header] = cols[idx] != null ? cols[idx] : "";
        return row;
      }, {});
    }).filter(row => Object.values(row).some(Boolean));
  }

  function buildQuestionListFromRows(rows) {
    return (rows || []).map((row, idx) => {
      const options = [row.option1, row.option2, row.option3, row.option4, row.option5, row.option6]
        .map(v => String(v || "").trim())
        .filter(Boolean);
      if (!options.length && row.options) {
        options.push(...String(row.options).split(/\||,|؛|;/).map(v => v.trim()).filter(Boolean));
      }
      return {
        id: idx + 1,
        type: normalizeImportedQuestionType(row.type || row.questiontype || row.kind),
        question: String(row.question || row.text || "").trim(),
        options,
        correctAnswer: String(row.correctanswer || "").trim(),
        points: Number.isFinite(parseFloat(row.points)) ? Math.max(1, parseFloat(row.points)) : 10,
        timeSeconds: Number.isFinite(parseFloat(row.timeseconds)) ? Math.max(5, parseFloat(row.timeseconds)) : 60
      };
    }).filter(q => q.question);
  }

  function setQuestionBankImportStatus(message, tone) {
    const el = document.getElementById("question-bank-import-status");
    if (!el) return;
    const colors = { muted: "var(--text-muted)", loading: "var(--secondary)", success: "var(--success)", error: "var(--error)", warning: "var(--warning)" };
    el.style.color = colors[tone || "muted"] || colors.muted;
    el.innerHTML = message || "";
  }

  function createQuestionBankFromImportedRows(rows, sourceLabel) {
    if (!global.ArabyaQuestionBank) return false;
    const session = global.ArabyaQuestionBank.requireTeacherSession("استيراد بنك");
    if (!session) return false;
    const questions = buildQuestionListFromRows(rows);
    if (!questions.length) {
      setQuestionBankImportStatus("لم يتم العثور على أسئلة صالحة.", "warning");
      return false;
    }
    const username = session.username;
    const name = String(document.getElementById("question-bank-name")?.value || "").trim() || `بنك مستورد (${sourceLabel})`;
    const subject = String(document.getElementById("question-bank-subject")?.value || "").trim();
    const banks = global.ArabyaQuestionBank.loadSharedBanks(username);
    banks.push({
      id: `bank_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      subject,
      teacher: username,
      questions: global.ArabyaQuestionBank.normalizeQuestions(questions),
      updatedAt: new Date().toISOString()
    });
    global.ArabyaQuestionBank.saveSharedBanks(banks, username);
    global.ArabyaQuestionBank.refreshSharedBankSelect(username);
    renderQuestionBankTab();
    setQuestionBankImportStatus(`تم استيراد بنك «${escapeHtml(name)}» (${questions.length} سؤال).`, "success");
    return true;
  }

  function parseGoogleSheetCsvUrl(rawUrl) {
    const url = String(rawUrl || "").trim();
    if (!url) return "";
    if (/output=csv|format=csv/i.test(url)) return url;
    const sheetId = (url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || [])[1];
    const gid = (url.match(/[#&?]gid=([0-9]+)/i) || [])[1];
    if (!sheetId) return url;
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ""}`;
  }

  async function importQuestionBankFromGoogleSheet() {
    const sourceUrl = String(document.getElementById("question-bank-google-sheet-url")?.value || "").trim();
    const btn = document.getElementById("question-bank-google-import-btn");
    if (!sourceUrl) {
      setQuestionBankImportStatus("أدخل رابط Google Sheet أولاً.", "warning");
      return;
    }
    if (btn) btn.disabled = true;
    setQuestionBankImportStatus("جارٍ تحميل بيانات Google Sheet...", "loading");
    try {
      const response = await fetch(parseGoogleSheetCsvUrl(sourceUrl));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = parseQuestionBankCsv(await response.text());
      createQuestionBankFromImportedRows(rows, "Google Sheet");
    } catch (error) {
      console.error("importQuestionBankFromGoogleSheet:", error);
      setQuestionBankImportStatus("تعذّر قراءة Google Sheet. تأكد من نشره أو مشاركة الرابط الصحيح.", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function importQuestionBankFromExcelFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    setQuestionBankImportStatus("جارٍ تحليل ملف الاستيراد...", "loading");
    reader.onload = e => {
      try {
        let rows = [];
        if (/\.csv|\.txt$/i.test(file.name)) {
          rows = parseQuestionBankCsv(String(e.target?.result || ""));
        } else if (global.XLSX) {
          const workbook = global.XLSX.read(e.target?.result, { type: "array" });
          const firstSheet = workbook.SheetNames[0];
          rows = firstSheet ? global.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" }) : [];
        }
        createQuestionBankFromImportedRows(rows, file.name);
      } catch (error) {
        console.error("importQuestionBankFromExcelFile:", error);
        setQuestionBankImportStatus("فشل تحليل الملف. تأكد من تنسيق CSV/Excel.", "error");
      } finally {
        event.target.value = "";
      }
    };
    if (/\.csv|\.txt$/i.test(file.name)) reader.readAsText(file, "utf-8");
    else reader.readAsArrayBuffer(file);
  }

  function renderQuestionBankTab() {
    if (!global.ArabyaQuestionBank) return;
    const sections = [
      { type: "boolean", summaryId: "question-bank-boolean-summary", listId: "question-bank-boolean-list", label: "صواب/خطأ" },
      { type: "multiple", summaryId: "question-bank-multiple-summary", listId: "question-bank-multiple-list", label: "اختيار من متعدد" },
      { type: "essay", summaryId: "question-bank-essay-summary", listId: "question-bank-essay-list", label: "مقالية" }
    ];
    const username = global.systemState?.activeTeacher?.username;
    sections.forEach(section => {
      const summaryEl = document.getElementById(section.summaryId);
      const listEl = document.getElementById(section.listId);
      if (!summaryEl || !listEl) return;
      if (!username) {
        summaryEl.textContent = "يرجى تسجيل الدخول.";
        listEl.innerHTML = "";
        return;
      }
      const banks = global.ArabyaQuestionBank.listBanksForTeacher(username);
      const typed = banks.map(bank => {
        const questions = (bank.questions || []).filter(q => normalizeImportedQuestionType(q.type) === section.type);
        return { bank, questions };
      }).filter(item => item.questions.length > 0);
      const total = typed.reduce((sum, item) => sum + item.questions.length, 0);
      summaryEl.textContent = `${typed.length} بنك · إجمالي ${total} سؤال ${section.label}`;
      if (!typed.length) {
        listEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">لا توجد أسئلة ${section.label} حالياً.</div>`;
        return;
      }
      listEl.innerHTML = typed.map(item => {
        const preview = item.questions.slice(0, 3).map(q => `<li>${escapeHtml(String(q.question || ""))}</li>`).join("");
        const more = item.questions.length > 3 ? `<div style="color:var(--text-muted); font-size:0.78rem;">+ ${item.questions.length - 3} سؤال إضافي</div>` : "";
        return `<div class="question-bank-list-item"><div class="question-bank-list-title">${escapeHtml(item.bank.name || "بنك")} <span style="color:var(--text-muted); font-size:0.78rem;">(${item.questions.length})</span></div><ul>${preview}</ul>${more}</div>`;
      }).join("");
    });
  }

  function bindQuestionBankTabEvents() {
    const refreshBtn = document.getElementById("question-bank-refresh-btn");
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", renderQuestionBankTab);
    }
    const excelInput = document.getElementById("question-bank-excel-input");
    if (excelInput && !excelInput.dataset.bound) {
      excelInput.dataset.bound = "1";
      excelInput.addEventListener("change", importQuestionBankFromExcelFile);
    }
    const googleBtn = document.getElementById("question-bank-google-import-btn");
    if (googleBtn && !googleBtn.dataset.bound) {
      googleBtn.dataset.bound = "1";
      googleBtn.addEventListener("click", importQuestionBankFromGoogleSheet);
    }
  }

  global.renderQuestionBankTab = renderQuestionBankTab;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindQuestionBankTabEvents);
  } else {
    bindQuestionBankTabEvents();
  }
})(window);
