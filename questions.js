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
      var nav = document.querySelector(".nav-links");
      if (nav && !document.querySelector("[data-target='student-profile-view']")) {
        var li = document.createElement("li");
        li.setAttribute("role", "none");
        li.innerHTML = '<a href="#" data-target="student-profile-view" role="menuitem">ملف الطالب</a>';
        var resultLink = nav.querySelector("[data-target='result-search-view']");
        if (resultLink && resultLink.parentElement) nav.insertBefore(li, resultLink.parentElement);
        else nav.appendChild(li);
        li.querySelector("a").addEventListener("click", function(e) {
          e.preventDefault();
          if (window.navigateToView) window.navigateToView("student-profile-view");
          renderArabyaStudentProfile();
        });
      }

      var studentLogin = document.getElementById("student-login-view");
      if (studentLogin && !document.getElementById("student-profile-login-btn")) {
        var startBtn = document.getElementById("student-start-exam-btn");
        var profileBtn = document.createElement("button");
        profileBtn.id = "student-profile-login-btn";
        profileBtn.className = "btn btn-outline";
        profileBtn.style.cssText = "width:100%; margin-top:0.75rem; border-color:var(--secondary); color:var(--secondary);";
        profileBtn.innerHTML = 'دخول ملفي الأكاديمي بكود الاشتراك <span class="material-icons" aria-hidden="true">account_circle</span>';
        profileBtn.addEventListener("click", function() {
          var code = (document.getElementById("student-access-code") || {}).value || "";
          showArabyaStudentProfile(code.trim());
        });
        if (startBtn && startBtn.parentNode) startBtn.parentNode.insertBefore(profileBtn, startBtn.nextSibling);
      }

      ensureArabyaStudentProfileView();
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
  return String(code || "").trim().toLowerCase();
}

function arabyaFindStudentsByCode(code) {
  var normalized = normalizeArabyaStudentCode(code);
  if (!normalized) return [];
  return arabyaGetStudents().filter(function(student) {
    return normalizeArabyaStudentCode(student.code) === normalized;
  });
}

function validateArabyaStudentIdentity(id, code, currentId) {
  var cleanCode = String(code || "").trim();
  if (!cleanCode) return { ok: true };

  var codeOwners = arabyaFindStudentsByCode(cleanCode);
  if (codeOwners.length > 1) {
    return { ok: false, message: "هذا الكود مكرر داخل قاعدة الطلاب، ولا يمكن استخدامه حتى يقوم المعلم بتخصيص كود مختلف لكل طالب." };
  }

  var effectiveId = String(currentId || id || "");
  var otherOwner = codeOwners.find(function(student) {
    return String(student.id || "") !== effectiveId;
  });
  if (otherOwner) {
    return { ok: false, message: "كود الاشتراك الذي أدخلته مخصص لطالب آخر. اكتب الكود الصحيح الخاص بك وحدك أو تواصل مع المعلم." };
  }

  var sameIdStudent = arabyaGetStudents().find(function(student) {
    return String(student.id || "") === String(id || "");
  });
  if (sameIdStudent && normalizeArabyaStudentCode(sameIdStudent.code) && normalizeArabyaStudentCode(sameIdStudent.code) !== normalizeArabyaStudentCode(cleanCode)) {
    return { ok: false, message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. لا يمكن الدخول إلا بالكود الأصلي الخاص بهذا الطالب." };
  }

  return { ok: true };
}

function enforceArabyaUniqueStudentCodes() {
  var resultsPanel = document.getElementById("student-profile-results");
  if (resultsPanel) {
    var panelHeader = resultsPanel.previousElementSibling;
    var title = panelHeader ? panelHeader.querySelector(".panel-title") : null;
    var hint = panelHeader ? panelHeader.querySelector("div[style*='font-size']") : null;
    if (title) title.textContent = "نتائج الامتحانات";
    if (hint) hint.textContent = "درجاتك محفوظة للعرض فقط ولا يمكن تعديلها من حساب الطالب";
  }

  document.addEventListener("click", function(event) {
    var startBtn = event.target.closest && event.target.closest("#student-start-exam-btn");
    var registerBtn = event.target.closest && event.target.closest("#student-register-submit-btn");
    var profileBtn = event.target.closest && event.target.closest("#student-profile-submit-btn, #student-profile-login-btn");
    var teacherSaveBtn = event.target.closest && event.target.closest("button[onclick='saveNewStudentByTeacher()']");
    var validation = null;

    if (startBtn) {
      validation = validateArabyaStudentIdentity(
        (document.getElementById("student-id-input") || {}).value,
        (document.getElementById("student-access-code") || {}).value
      );
    } else if (registerBtn) {
      validation = validateArabyaStudentIdentity(
        (document.getElementById("student-reg-id") || {}).value,
        (document.getElementById("student-reg-code") || {}).value
      );
    } else if (profileBtn) {
      var profileCode = ((document.getElementById("student-profile-code-input") || {}).value || (document.getElementById("student-access-code") || {}).value || "").trim();
      var matches = arabyaFindStudentsByCode(profileCode);
      if (!profileCode) validation = { ok: false, message: "اكتب كود الاشتراك أولاً للدخول إلى ملفك الأكاديمي." };
      else if (matches.length > 1) validation = { ok: false, message: "هذا الكود مكرر ولا يمكن استخدامه للدخول حتى يتم تصحيح قاعدة الطلاب بواسطة المعلم." };
    } else if (teacherSaveBtn) {
      validation = validateArabyaStudentIdentity(
        (document.getElementById("new-student-id") || {}).value,
        (document.getElementById("new-student-code") || {}).value,
        window.systemState ? window.systemState.editingStudentId : ""
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
  if (autoUrlInput && !autoUrlInput.value && (teacher.autoEntryCode || teacher.password)) {
    autoUrlInput.value = getArabyaBaseUrl() + "?teacher_autocode=" + encodeURIComponent(teacher.autoEntryCode || teacher.password);
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

function ensureArabyaStudentProfileView() {
  if (document.getElementById("student-profile-view")) return;
  var main = document.getElementById("app-main-wrapper");
  if (!main) return;
  var section = document.createElement("section");
  section.id = "student-profile-view";
  section.className = "view-section hidden";
  section.setAttribute("aria-label", "الملف الأكاديمي للطالب");
  section.innerHTML = [
    '<div class="card" style="max-width:980px;">',
    '<div class="card-header">',
    '<img src="logo.jpg" alt="Logo" class="logo-img-tag" style="margin:0 auto 1rem; width:60px; height:60px;">',
    '<h2 class="card-title">الملف الأكاديمي للطالب</h2>',
    '<p class="subtitle">ادخل بكود الاشتراك لعرض بياناتك وامتحاناتك ونتائجك</p>',
    '</div>',
    '<div id="student-profile-login-panel">',
    '<div class="form-group"><label class="form-label" for="student-profile-code-input">كود الاشتراك</label>',
    '<div class="input-wrapper"><input type="text" id="student-profile-code-input" class="form-control" placeholder="اكتب كود الاشتراك الخاص بك..." autocomplete="off"><span class="material-icons input-icon" aria-hidden="true">vpn_key</span></div></div>',
    '<button id="student-profile-submit-btn" class="btn btn-primary" style="width:100%;">دخول الملف الأكاديمي <span class="material-icons" aria-hidden="true">login</span></button>',
    '</div>',
    '<div id="student-profile-content" class="hidden">',
    '<div id="student-profile-summary" class="profile-summary-grid" aria-live="polite"></div>',
    '<div class="panel-header" style="margin-top:2rem;"><div><div class="panel-title">الامتحانات المتاحة</div><div style="font-size:0.85rem; color:var(--text-muted);">يمكنك بدء أي امتحان من هنا</div></div></div>',
    '<div id="student-profile-exams" class="exams-list-container"></div>',
    '<div class="panel-header" style="margin-top:2rem;"><div><div class="panel-title">نتائج الامتحانات</div><div style="font-size:0.85rem; color:var(--text-muted);">درجاتك محفوظة للعرض فقط ولا يمكن تعديلها من حساب الطالب</div></div></div>',
    '<div id="student-profile-results" class="result-query-list"></div>',
    '</div></div>'
  ].join("");
  var runner = document.getElementById("exam-runner-view");
  if (runner) main.insertBefore(section, runner);
  else main.appendChild(section);

  var submit = document.getElementById("student-profile-submit-btn");
  if (submit) {
    submit.addEventListener("click", function() {
      var code = (document.getElementById("student-profile-code-input") || {}).value || "";
      showArabyaStudentProfile(code.trim());
    });
  }
}

function showArabyaStudentProfile(code) {
  ensureArabyaStudentProfileView();
  if (!code) {
    if (window.navigateToView) window.navigateToView("student-profile-view");
    var input = document.getElementById("student-profile-code-input");
    if (input) input.focus();
    alert("اكتب كود الاشتراك أولاً للدخول إلى ملفك الأكاديمي.");
    return;
  }
  var student = arabyaGetStudents().find(function(s) {
    return String(s.code || "").toLowerCase() === code.toLowerCase();
  });
  if (!student) {
    if (window.navigateToView) window.navigateToView("student-profile-view");
    alert("لم يتم العثور على طالب بهذا الكود. تأكد من الكود أو تواصل مع المعلم.");
    return;
  }
  localStorage.setItem("arabya_active_student_code", student.code);
  if (window.navigateToView) window.navigateToView("student-profile-view");
  renderArabyaStudentProfile(student);
}

function renderArabyaStudentProfile(student) {
  ensureArabyaStudentProfileView();
  if (!student) {
    var savedCode = localStorage.getItem("arabya_active_student_code") || "";
    student = arabyaGetStudents().find(function(s) { return s.code === savedCode; });
  }
  var loginPanel = document.getElementById("student-profile-login-panel");
  var content = document.getElementById("student-profile-content");
  if (!student) {
    if (loginPanel) loginPanel.classList.remove("hidden");
    if (content) content.classList.add("hidden");
    return;
  }
  if (loginPanel) loginPanel.classList.add("hidden");
  if (content) content.classList.remove("hidden");

  var results = arabyaGetResults().filter(function(r) {
    return r.id === student.id || String(r.accessCode || "").toLowerCase() === String(student.code || "").toLowerCase();
  });
  var exams = arabyaGetExams();
  var summary = document.getElementById("student-profile-summary");
  if (summary) {
    summary.innerHTML =
      '<div class="profile-stat-card"><div class="profile-stat-label">اسم الطالب</div><div class="profile-stat-value">' + arabyaEscape(student.name) + '</div></div>' +
      '<div class="profile-stat-card"><div class="profile-stat-label">رقم ID</div><div class="profile-stat-value">' + arabyaEscape(student.id) + '</div></div>' +
      '<div class="profile-stat-card"><div class="profile-stat-label">كود الاشتراك</div><div class="profile-stat-value">' + arabyaEscape(student.code) + '</div></div>' +
      '<div class="profile-stat-card"><div class="profile-stat-label">تاريخ التسجيل</div><div class="profile-stat-value">' + arabyaEscape(student.timestamp || "غير محدد") + '</div></div>' +
      '<div class="profile-stat-card"><div class="profile-stat-label">عدد النتائج</div><div class="profile-stat-value">' + results.length + '</div></div>';
  }

  var examsBox = document.getElementById("student-profile-exams");
  if (examsBox) {
    examsBox.innerHTML = "";
    if (!exams.length) {
      examsBox.innerHTML = '<div style="grid-column:1/-1; color:var(--text-muted); text-align:center; padding:1.5rem;">لا توجد امتحانات متاحة حالياً.</div>';
    } else {
      exams.forEach(function(exam) {
        var card = document.createElement("div");
        card.className = "exam-info-card";
        card.innerHTML = '<div><div class="exam-info-title">' + arabyaEscape(exam.title) + '</div><div class="exam-info-details"><span>' + arabyaEscape(exam.subject || "مادة غير محددة") + ' | ' + arabyaEscape(exam.level || "عام") + '</span><span>' + arabyaEscape(exam.examType || "اختبار") + ' | ' + ((exam.questions || []).length) + ' سؤال</span></div></div><button class="btn btn-primary btn-sm">بدء الامتحان</button>';
        card.querySelector("button").addEventListener("click", function() {
          document.getElementById("student-fullname-input").value = student.name || "";
          document.getElementById("student-id-input").value = student.id || "";
          document.getElementById("student-access-code").value = student.code || "";
          if (window.navigateToView) window.navigateToView("student-login-view");
          var select = document.getElementById("student-exam-select");
          if (select) select.value = exam.id;
        });
        examsBox.appendChild(card);
      });
    }
  }

  var resultsBox = document.getElementById("student-profile-results");
  if (resultsBox) {
    resultsBox.innerHTML = "";
    if (!results.length) {
      resultsBox.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">لا توجد نتائج محفوظة بعد.</div>';
    } else {
      results.slice().reverse().forEach(function(res) {
        var card = document.createElement("div");
        card.className = "result-query-card";
        card.innerHTML = '<div><div class="result-query-title">' + arabyaEscape(res.examTitle) + ' (' + arabyaEscape(res.examType || "اختبار") + ')</div><div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">' + arabyaEscape(res.timestamp || "") + '</div></div><div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;"><span style="font-size:1.05rem; font-weight:800; color:var(--secondary);">' + arabyaEscape(res.score) + '</span><button class="btn btn-outline btn-sm">عرض</button></div>';
        card.querySelector("button").addEventListener("click", function() {
          alert("تفاصيل اختبارك [" + (res.examTitle || "") + "]:\n\n" + (res.details || "لا توجد تفاصيل محفوظة."));
        });
        resultsBox.appendChild(card);
      });
    }
  }
}

function enhanceArabyaTeacherDashboard() {
  var menu = document.querySelector(".teacher-menu");
  var panelHost = document.querySelector(".teacher-main-panel");
  if (!menu || !panelHost || document.getElementById("teacher-tab-dashboard")) return;

  var item = document.createElement("li");
  item.className = "teacher-menu-item";
  item.dataset.tab = "dashboard";
  item.setAttribute("role", "tab");
  item.setAttribute("aria-selected", "false");
  item.innerHTML = '<span class="material-icons" aria-hidden="true">dashboard</span> الرئيسية';
  menu.insertBefore(item, menu.firstElementChild);

  var panel = document.createElement("div");
  panel.id = "teacher-tab-dashboard";
  panel.className = "teacher-tab-panel hidden";
  panel.setAttribute("role", "tabpanel");
  panel.innerHTML = '<div class="panel-header"><div><div class="panel-title">الرئيسية والملف الأكاديمي للمعلم</div><div style="font-size:0.85rem; color:var(--text-muted);">ملخص سريع للحساب والامتحانات والطلاب والنتائج</div></div></div><div id="teacher-dashboard-summary" class="profile-summary-grid"></div>';
  panelHost.insertBefore(panel, panelHost.firstElementChild);

  item.addEventListener("click", function() {
    document.querySelectorAll(".teacher-menu-item").forEach(function(i) { i.classList.remove("active"); });
    item.classList.add("active");
    document.querySelectorAll(".teacher-tab-panel").forEach(function(p) { p.classList.add("hidden"); });
    panel.classList.remove("hidden");
    renderArabyaTeacherDashboardSummary();
  });
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
