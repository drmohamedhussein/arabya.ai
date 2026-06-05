/**
 * بنك الامتحانات والأسئلة الافتراضي لمنصة arabya.ai
 * يحتوي على اختبارات مسبقة في فروع النحو والبلاغة والأدب مع بيانات أكاديمية كاملة،
 * مضافاً إليها المجموع النهائي للاختبار ونظام درجات مخصصة لكل سؤال (أوزان الأسئلة).
 */
const defaultExams = [
  {
    id: "arabic_grammar",
    title: "اختبار النحو والصرف الشامل",
    subject: "النحو والصرف",
    university: "جامعة القاهرة",
    faculty: "كلية دار العلوم",
    level: "الفرقة الأولى",
    examType: "أعمال فصلية",
    totalScore: 100, // المجموع النهائي للاختبار
    questions: [
      // 9 اختيار من متعدد وصواب/خطأ، مع تعيين 10 نقاط لكل سؤال
      {
        id: 1,
        type: "multiple",
        question: "ما هو الفعل المرفوع دائماً إذا لم يسبقه ناصب ولا جازم؟",
        options: ["الفعل الماضي", "فعل الأمر", "الفعل المضارع"],
        correctAnswer: 2,
        points: 10 // درجة هذا السؤال الفردي
      },
      {
        id: 2,
        type: "multiple",
        question: "ما حكم الفاعل الإعرابي في اللغة العربية؟",
        options: ["الرفع دائماً", "النصب دائماً", "الجر دائماً"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 3,
        type: "multiple",
        question: "أي من الحروف التالية يعتبر من حروف الجر؟",
        options: ["أنْ", "في", "لولا"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 4,
        type: "multiple",
        question: "ما هو تعريف المبتدأ في الجملة الاسمية؟",
        options: ["اسم مرفوع تبدأ به الجملة غالباً", "فعل ماضٍ يدل على الحدث", "اسم منصوب يبين الهيئة"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 5,
        type: "multiple",
        question: "تدخل 'كان وأخواتها' على الجملة الاسمية فماذا تفعل؟",
        options: ["ترفع المبتدأ وتنصب الخبر", "تنصب المبتدأ وترفع الخبر", "تنصب المبتدأ والخبر معاً"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 6,
        type: "boolean",
        question: "الحروف كلها مبنية في اللغة العربية ولا محل لها من الإعراب.",
        options: ["صواب", "خطأ"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 7,
        type: "boolean",
        question: "تعمل 'إن وأخواتها' على ترفع المبتدأ وتنصب الخبر.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 8,
        type: "boolean",
        question: "يكون المفعول به دائماً مجروراً بالكسرة.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 9,
        type: "boolean",
        question: "الفعل الماضي يكون مبنياً دائماً في جميع حالاته.",
        options: ["صواب", "خطأ"],
        correctAnswer: 0,
        points: 10
      },
      // سؤال مقالي
      {
        id: 10,
        type: "essay",
        question: "اشرح بالتفصيل أحكام مطابقة الفعل للفاعل تأنيثاً وتذكيراً مع التمثيل بمثال مناسب لكل حالة.",
        options: [],
        correctAnswer: "",
        points: 10
      }
    ]
  },
  {
    id: "arabic_rhetoric",
    title: "اختبار البلاغة والأدب العربي",
    subject: "البلاغة والأدب",
    university: "جامعة الأزهر",
    faculty: "كلية اللغة العربية",
    level: "الفرقة الثانية",
    examType: "نهائي",
    totalScore: 100, // المجموع النهائي للاختبار
    questions: [
      // 9 أسئلة موضوعية، مع تعيين 10 نقاط لكل سؤال
      {
        id: 1,
        type: "multiple",
        question: "ما العلم البلاغي الذي يهتم بجمال صياغة المعاني ووضوحها وتنوع التعبير عنها؟",
        options: ["علم البديع", "علم البيان", "علم المعاني"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 2,
        type: "multiple",
        question: "ما نوع التشبيه الذي حُذِف منه وجه الشبه وأداة التشبيه معاً؟",
        options: ["التشبيه البليغ", "التشبيه المجمل", "التشبيه المرسل"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 3,
        type: "multiple",
        question: "أي من الخيارات التالية يمثل محسنًا بديعيًا من نوع (طباق)؟",
        options: ["العلم والجهل", "العلم والعمل", "الليل والظلام"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 4,
        type: "multiple",
        question: "من هو الشاعر العربي الحديث الملقب بـ 'أمير الشعراء'؟",
        options: ["حافظ إبراهيم", "أحمد شوقي", "أبو الطيب المتنبي"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 5,
        type: "multiple",
        question: "ما الغرض البلاغي لأسلوب الاستفهام في الآية الكريمة: 'أليس الله بكافٍ عبده؟'",
        options: ["الإنكار", "التقرير والتوكيد", "التعجب والدهشة"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 6,
        type: "boolean",
        question: "الطباق هو الجمع بين كلمة وضدها في المعنى لتوضيحه.",
        options: ["صواب", "خطأ"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 7,
        type: "boolean",
        question: "الكناية هي لفظ أطلق وأريد به لازم معناه مع امتناع إرادة المعنى الأصلي.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 8,
        type: "boolean",
        question: "يعتبر العصر الأموي هو العصر الذهبي للأدب العربي وحركة التدوين الواسعة.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 9,
        type: "boolean",
        question: "الاستعارة التصريحية هي ما حُذِف فيها المشبه به وصُرّح بالمشبه.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      // سؤال مقالي
      {
        id: 10,
        type: "essay",
        question: "قارن بالتفصيل بين الاستعارة المكنية والاستعارة التصريحية موضحاً الفروق الجوهرية مع التمثيل ببيت شعر لكل منهما.",
        options: [],
        correctAnswer: "",
        points: 10
      }
    ]
  }
];

// تصدير أو إتاحته للمتصفح
if (typeof window !== 'undefined') {
  window.defaultExams = defaultExams;
}

// تحسينات واجهة ARABYA.NET التي تعمل فوق التطبيق الثابت بدون خادم خلفي.
if (typeof window !== 'undefined') {
  document.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() {
      removeLegacyArabyaStudentProfileUi();
      enhanceArabyaTeacherDashboard();
      ensureArabyaDefaultExamsSeeded();
      patchArabyaDirectLinks();
      enforceArabyaUniqueStudentCodes();
      applyArabyaTeacherSafeMode();
      repairArabyaTeacherPanels();
    }, 0);
  });
}

function arabyaGetStudents() {
  try { return JSON.parse(localStorage.getItem("arabya_students_db") || "[]"); } catch(e) { return []; }
}

function arabyaGetResults() {
  try { return JSON.parse(localStorage.getItem("arabya_results_db") || "[]"); } catch(e) { return []; }
}

function arabyaGetExams() {
  try { return JSON.parse(localStorage.getItem("arabya_exams_db") || "[]"); } catch(e) { return window.defaultExams || []; }
}

function normalizeArabyaStudentCode(code) {
  if (typeof window.sanitizeStudentCodeInput === "function") {
    return window.sanitizeStudentCodeInput(code);
  }
  var raw = String(code || "").trim();
  if (!raw) return "";
  var compact = raw.replace(/\s+/g, "");
  var digitsOnly = compact.replace(/\D/g, "");
  if (digitsOnly && /^0+$/.test(digitsOnly) && digitsOnly.length >= 5) {
    return "00000";
  }
  return compact;
}

function arabyaFindStudentsByCode(code) {
  var normalized = normalizeArabyaStudentCode(code);
  if (!normalized) return [];
  return arabyaGetStudents().filter(function(student) {
    return normalizeArabyaStudentCode(student.code) === normalized;
  });
}

function validateArabyaStudentIdentity(id, code, options) {
  var opts = typeof options === "string" ? { editingStudentKey: options } : (options || {});
  if (typeof window.arabyaValidateStudentIdentity === "function") {
    return window.arabyaValidateStudentIdentity(id, code, {
      editingStudentKey: opts.editingStudentKey || (window.systemState && window.systemState.editingStudentKey) || "",
      name: opts.name || "",
      purpose: opts.purpose || ""
    });
  }

  var cleanCode = normalizeArabyaStudentCode(code);
  if (!cleanCode) return { ok: true };

  var normalizedId = typeof window.normalizeStudentId === "function"
    ? window.normalizeStudentId(id)
    : String(id || "").trim().toUpperCase();

  var codeOwners = arabyaFindStudentsByCode(cleanCode);
  if (codeOwners.length > 1) {
    return { ok: false, message: "هذا الكود مكرر داخل قاعدة الطلاب، ولا يمكن استخدامه حتى يقوم المعلم بتخصيص كود مختلف لكل طالب." };
  }

  if (codeOwners.length === 1) {
    var owner = codeOwners[0];
    var ownerId = typeof window.normalizeStudentId === "function"
      ? window.normalizeStudentId(owner.id)
      : String(owner.id || "").trim().toUpperCase();
    if (opts.purpose === "exam_start") {
      if (normalizedId && ownerId && ownerId !== normalizedId) {
        return { ok: false, message: "كود الاشتراك لا يطابق معرف الهوية المُدخل. اترك المعرف فارغاً أو استخدم المعرف الصحيح لهذا الكود." };
      }
      return { ok: true };
    }
    if (normalizedId && ownerId && ownerId !== normalizedId) {
      return { ok: false, message: "كود الاشتراك الذي أدخلته مخصص لطالب آخر. اكتب الكود الصحيح الخاص بك أو اترك حقل ID فارغاً." };
    }
    return { ok: true };
  }

  if (normalizedId) {
    var sameIdStudent = arabyaGetStudents().find(function(student) {
      var studentId = typeof window.normalizeStudentId === "function"
        ? window.normalizeStudentId(student.id)
        : String(student.id || "").trim().toUpperCase();
      return studentId && studentId === normalizedId;
    });
    if (sameIdStudent && normalizeArabyaStudentCode(sameIdStudent.code) && normalizeArabyaStudentCode(sameIdStudent.code) !== cleanCode) {
      return { ok: false, message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. استخدم الكود الأصلي لهذا ID أو اترك ID فارغاً واكتب كودك فقط." };
    }
  }

  return { ok: true };
}

function removeLegacyArabyaStudentProfileUi() {
  var legacyView = document.getElementById("student-profile-view");
  if (legacyView) legacyView.remove();
  var legacyNav = document.querySelector(".nav-links [data-target='student-profile-view']");
  if (legacyNav && legacyNav.parentElement) legacyNav.parentElement.remove();
  var legacyLoginBtn = document.getElementById("student-profile-login-btn");
  if (legacyLoginBtn) legacyLoginBtn.remove();
}

function enforceArabyaUniqueStudentCodes() {
  document.addEventListener("click", function(event) {
    var startBtn = event.target.closest && event.target.closest("#student-start-exam-btn");
    var registerBtn = event.target.closest && event.target.closest("#student-register-submit-btn");
    var teacherSaveBtn = event.target.closest && event.target.closest("button[onclick='saveNewStudentByTeacher()']");
    var validation = null;

    if (startBtn) {
      validation = validateArabyaStudentIdentity(
        (document.getElementById("student-id-input") || {}).value,
        (document.getElementById("student-access-code") || {}).value,
        {
          name: (document.getElementById("student-fullname-input") || {}).value,
          purpose: "exam_start"
        }
      );
    } else if (registerBtn) {
      validation = validateArabyaStudentIdentity(
        (document.getElementById("student-reg-id") || {}).value,
        (document.getElementById("student-reg-code") || {}).value
      );
    } else if (teacherSaveBtn) {
      validation = validateArabyaStudentIdentity(
        (document.getElementById("new-student-id") || {}).value,
        (document.getElementById("new-student-code") || {}).value,
        {
          editingStudentKey: window.systemState ? (window.systemState.editingStudentKey || window.systemState.editingStudentId || "") : "",
          name: (document.getElementById("new-student-name") || {}).value
        }
      );
    }

    if (validation && !validation.ok) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(validation.message);
    }
  }, true);
}

function applyArabyaTeacherSafeMode() {
  window.shouldApplyStudentExamRestrictions = function() {
    try {
      if (localStorage.getItem("arabya_active_teacher_username")) return false;
    } catch (e) {}
    var state = window.systemState || {};
    return !!(state.isExamActive && state.activeView === "exam-runner-view" && !state.activeTeacher);
  };
}

function repairArabyaTeacherPanels() {
  var host = document.querySelector(".teacher-main-panel");
  if (!host) return;

  ["teacher-tab-students", "teacher-tab-profile"].forEach(function(id) {
    var panel = document.getElementById(id);
    if (panel && panel.parentElement !== host) {
      host.appendChild(panel);
    }
  });

  document.querySelectorAll(".teacher-menu-item[data-tab='students'], .teacher-menu-item[data-tab='profile']").forEach(function(item) {
    if (item.dataset.arabyaRepaired === "yes") return;
    item.dataset.arabyaRepaired = "yes";
    item.addEventListener("click", function() {
      setTimeout(function() {
        showArabyaTeacherPanel(item.dataset.tab);
        hydrateArabyaTeacherPanels();
      }, 0);
    });
  });

  hydrateArabyaTeacherPanels();
}

function showArabyaTeacherPanel(tabId) {
  if (!tabId) return;
  repairArabyaTeacherPanelPlacementOnly();
  if (typeof window.activateTeacherTab === "function") {
    window.activateTeacherTab(tabId, { force: true, skipRefresh: true });
    return;
  }
  document.querySelectorAll(".teacher-tab-panel").forEach(function(panel) {
    panel.classList.add("hidden");
  });
  document.querySelectorAll(".teacher-menu-item").forEach(function(item) {
    item.classList.toggle("active", item.dataset.tab === tabId);
    if (item.dataset.tab) item.setAttribute("aria-selected", item.dataset.tab === tabId ? "true" : "false");
  });
  var panel = document.getElementById("teacher-tab-" + tabId);
  if (panel) panel.classList.remove("hidden");
}

function repairArabyaTeacherPanelPlacementOnly() {
  var host = document.querySelector(".teacher-main-panel");
  if (!host) return;
  ["teacher-tab-students", "teacher-tab-profile"].forEach(function(id) {
    var panel = document.getElementById(id);
    if (panel && panel.parentElement !== host) host.appendChild(panel);
  });
}

function hydrateArabyaTeacherPanels() {
  if (typeof window.renderTeacherStatsDashboard === "function") {
    try { window.renderTeacherStatsDashboard(); } catch (e) {}
  }
  if (typeof window.loadTeacherDashboardData === "function") {
    try { window.loadTeacherDashboardData(); } catch (e) {}
  }
  if (typeof window.renderTeacherStudentsTable === "function") {
    try { window.renderTeacherStudentsTable(); } catch (e) {}
  } else {
    renderArabyaTeacherStudentsFallback();
  }
  hydrateArabyaTeacherProfileFallback();
}

function renderArabyaTeacherStudentsFallback() {
  var tbody = document.getElementById("teacher-students-table-body");
  if (!tbody) return;
  var students = arabyaGetStudents();
  tbody.innerHTML = "";
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem;">لا يوجد طلاب مسجلين حالياً.</td></tr>';
    return;
  }
  students.slice().reverse().forEach(function(student) {
    var row = document.createElement("tr");
    var editId = arabyaEscape(JSON.stringify(String(student.id || "")));
    row.innerHTML =
      "<td>" + arabyaEscape(student.name || "") + "</td>" +
      "<td><code>" + arabyaEscape(student.id || "") + "</code></td>" +
      '<td><span style="color:var(--accent); font-weight:700;">' + arabyaEscape(student.code || "لا يوجد") + "</span></td>" +
      "<td>" + arabyaEscape(student.timestamp || "غير معروف") + "</td>" +
      '<td><button class="btn btn-outline btn-sm" style="padding:0.25rem 0.5rem;" onclick="editStudentByTeacher && editStudentByTeacher(' + editId + ')">تعديل</button></td>';
    tbody.appendChild(row);
  });
}

function hydrateArabyaTeacherProfileFallback() {
  var teachers = [];
  try { teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]"); } catch (e) {}
  var username = "";
  try { username = localStorage.getItem("arabya_active_teacher_username") || ""; } catch (e) {}
  var teacher = teachers.find(function(item) { return item.username === username; }) || teachers[0] || {};

  var nameInput = document.getElementById("teacher-profile-name");
  var subjectInput = document.getElementById("teacher-profile-subject");
  var autoCodeInput = document.getElementById("teacher-profile-autocode");
  var autoUrlInput = document.getElementById("teacher-auto-login-url");

  if (nameInput && !nameInput.value) nameInput.value = teacher.name || "";
  if (subjectInput && !subjectInput.value) subjectInput.value = teacher.subject || "";
  if (autoCodeInput && !autoCodeInput.value) autoCodeInput.value = teacher.autoEntryCode || teacher.password || "";
  if (autoUrlInput && !autoUrlInput.value) {
    autoUrlInput.placeholder = "اضغط «إنشاء رابط دخول» لإنشاء رابط لمرة واحدة (24 ساعة)";
  }
}

function ensureArabyaDefaultExamsSeeded() {
  var exams = arabyaGetExams();
  if (!exams.length && Array.isArray(window.defaultExams) && !sessionStorage.getItem("arabya_seed_reload_done")) {
    localStorage.setItem("arabya_exams_db", JSON.stringify(window.defaultExams.map(function(exam) {
      var copy = JSON.parse(JSON.stringify(exam));
      copy.teacher = copy.teacher || "معلم اللغة العربية";
      copy.timeLimit = copy.timeLimit || 60;
      return copy;
    })));
    localStorage.setItem("arabya_default_exams_seeded", "yes");
    sessionStorage.setItem("arabya_seed_reload_done", "yes");
    window.location.reload();
  }
}

function getArabyaBaseUrl() {
  if (window.location.protocol === "file:") {
    return window.location.href.split("?")[0].split("#")[0];
  }
  return window.location.origin + "/";
}

function patchArabyaDirectLinks() {
  window.getExamDirectLink = function(exam) {
    var params = new URLSearchParams();
    params.set("exam", exam.id);
    try {
      var teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
      var activeUsername = localStorage.getItem("arabya_active_teacher_username");
      var teacher = teachers.find(function(t) { return t.username === activeUsername; });
      if (teacher && teacher.username) params.set("teacher", teacher.username);
    } catch(e) {}
    return getArabyaBaseUrl() + "?" + params.toString();
  };
}

function arabyaEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function enhanceArabyaTeacherDashboard() {
  if (
    (document.getElementById("teacher-tab-home") || document.getElementById("teacher-tab-stats")) &&
    typeof window.activateTeacherTab === "function"
  ) {
    return;
  }
  var menu = document.querySelector(".teacher-menu");
  var panelHost = document.querySelector(".teacher-main-panel");
  if (!menu || !panelHost || document.getElementById("teacher-tab-dashboard")) return;

  var item = document.createElement("li");
  item.className = "teacher-menu-item";
  item.dataset.tab = "stats";
  item.setAttribute("role", "tab");
  item.setAttribute("aria-selected", "false");
  item.innerHTML = '<span class="material-icons" aria-hidden="true">insights</span> الإحصائيات';
  menu.insertBefore(item, menu.firstElementChild);
}

function renderArabyaTeacherDashboardSummary() {
  var container = document.getElementById("teacher-dashboard-summary");
  if (!container) return;
  var teachers = [];
  try { teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]"); } catch(e) {}
  var username = localStorage.getItem("arabya_active_teacher_username") || "";
  var teacher = teachers.find(function(t) { return t.username === username; }) || teachers[0] || {};
  var exams = arabyaGetExams();
  var students = arabyaGetStudents();
  var results = arabyaGetResults();
  var syncUrl = (teacher.integrationConfig && teacher.integrationConfig.googleFormUrl) || "";
  container.innerHTML =
    '<div class="profile-stat-card"><div class="profile-stat-label">اسم المعلم</div><div class="profile-stat-value">' + arabyaEscape(teacher.name || "معلم اللغة العربية") + '</div></div>' +
    '<div class="profile-stat-card"><div class="profile-stat-label">اسم المستخدم</div><div class="profile-stat-value">' + arabyaEscape(teacher.username || "غير محدد") + '</div></div>' +
    '<div class="profile-stat-card"><div class="profile-stat-label">التخصص</div><div class="profile-stat-value">' + arabyaEscape(teacher.subject || "اللغة العربية والدراسات الإسلامية") + '</div></div>' +
    '<div class="profile-stat-card"><div class="profile-stat-label">الامتحانات</div><div class="profile-stat-value">' + exams.length + '</div></div>' +
    '<div class="profile-stat-card"><div class="profile-stat-label">الطلاب</div><div class="profile-stat-value">' + students.length + '</div></div>' +
    '<div class="profile-stat-card"><div class="profile-stat-label">النتائج</div><div class="profile-stat-value">' + results.length + '</div></div>' +
    '<div class="profile-stat-card"><div class="profile-stat-label">Google Sheets</div><div class="profile-stat-value">' + (syncUrl ? "مفعل" : "غير مفعل") + '</div></div>';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = defaultExams;
}
