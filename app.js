/**
 * arabya.ai - ملف المنطق البرمجي الموحد المطور (app.js)
 * يتحكم في التوجيه، وإدارة الامتحانات، وتصميم الأسئلة اللانهائية والمقالية والموضوعية ذات الأوزان المخصصة،
 * والتكامل السحابي الثنائي، مع تطبيق معايير إتاحة الوصول (WAI-ARIA) الكاملة للطلاب المكفوفين.
 */

// كائن الحالة العامة للنظام
let systemState = {
  activeView: "welcome-view",
  
  // المعلم النشط حالياً وقائمة المعلمين
  activeTeacher: null,
  teachers: [],
  
  // بيانات المعلم والملف الشخصي الافتراضية
  teacherProfile: {
    name: "معلم اللغة العربية",
    subject: "اللغة العربية وآدابها"
  },
  
  // قاعدة بيانات الامتحانات (محملة من LocalStorage أو الافتراضية)
  exams: [],
  
  // قاعدة بيانات نتائج الطلاب المخزنة
  results: [],
  
  // قاعدة بيانات الطلاب وأكواد اشتراكاتهم
  students: [],
  
  // حالة الطالب والاختبار الحالي
  currentStudent: {
    name: "",
    id: "",
    accessCode: ""
  },
  currentExam: null,
  shuffledQuestions: [],
  currentQuestionIndex: 0,
  studentAnswers: {}, // { questionId: selectedIndex_or_essayText }
  
  // المؤقت
  timer: {
    intervalId: null,
    timeLimit: 60,
    timeRemaining: 60
  },
  
  isExamActive: false,
  isCheatingSuspended: false,
  cheatViolations: 0,
  
  // إعدادات التكامل مع جوجل شيت
  config: {
    teacherCode: "TEACHER2026",
    googleFormUrl: "",
    entryName: "",
    entryId: "",
    entryCode: "",
    entryScore: "",
    entryDetails: "",
    autoEntryCode: "TEACHER2026"
  }
};

// ==========================================
// 1. تهيئة النظام عند التحميل
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initDatabase();
  setupNavigation();
  setupUIEventListeners();
  setupAntiCheatHandlers();
  setupStudentAutofill();
  
  const wasRedirected = checkUrlParameters();
  if (!wasRedirected) {
    const savedView = localStorage.getItem("arabya_active_view");
    if (savedView && savedView !== "exam-runner-view") {
      if (savedView === "teacher-dashboard-view") {
        const activeTeacherUsername = localStorage.getItem("arabya_active_teacher_username");
        if (activeTeacherUsername) {
          const matched = systemState.teachers.find(t => t.username === activeTeacherUsername);
          if (matched) {
            loginTeacherObject(matched);
            navigateToView("teacher-dashboard-view");
          } else {
            navigateToView("teacher-login-view");
          }
        } else {
          navigateToView("teacher-login-view");
        }
      } else {
        navigateToView(savedView);
      }
    } else {
      navigateToView("welcome-view");
    }
  }
});

// تهيئة قواعد البيانات المحلية
function initDatabase() {
  // 1. تهيئة قاعدة بيانات المعلمين
  let savedTeachers = localStorage.getItem("arabya_teachers_db");
  if (savedTeachers) {
    try {
      systemState.teachers = JSON.parse(savedTeachers);
    } catch(e) {
      systemState.teachers = [];
    }
  }
  
  // إذا لم يكن هناك معلمون، نقوم بإنشاء المعلم الافتراضي
  if (systemState.teachers.length === 0) {
    const defaultTeacher = {
      name: "معلم اللغة العربية",
      username: "معلم اللغة العربية",
      subject: "اللغة العربية وآدابها",
      password: "TEACHER2026",
      autoEntryCode: "TEACHER2026",
      integrationConfig: {
        googleFormUrl: "",
        entryName: "",
        entryId: "",
        entryCode: "",
        entryScore: "",
        entryDetails: ""
      }
    };
    systemState.teachers.push(defaultTeacher);
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
  }

  // محاولة تحميل المعلم النشط من الجلسة السابقة
  const activeTeacherUsername = localStorage.getItem("arabya_active_teacher_username");
  if (activeTeacherUsername) {
    const matched = systemState.teachers.find(t => t.username === activeTeacherUsername);
    if (matched) {
      systemState.activeTeacher = matched;
      systemState.teacherProfile = { name: matched.name, subject: matched.subject };
      systemState.config = {
        teacherCode: matched.password,
        googleFormUrl: matched.integrationConfig?.googleFormUrl || "",
        entryName: matched.integrationConfig?.entryName || "",
        entryId: matched.integrationConfig?.entryId || "",
        entryCode: matched.integrationConfig?.entryCode || "",
        entryScore: matched.integrationConfig?.entryScore || "",
        entryDetails: matched.integrationConfig?.entryDetails || "",
        autoEntryCode: matched.autoEntryCode || matched.password
      };
    }
  } else {
    // كباك وورد للمحافظة على التوافق
    systemState.activeTeacher = systemState.teachers[0];
  }
  
  // تحميل إعدادات التكامل القديمة كحالة توافقية
  const savedConfig = localStorage.getItem("arabya_teacher_config");
  if (savedConfig && systemState.activeTeacher) {
    try { 
      const parsedConfig = JSON.parse(savedConfig);
      systemState.config = { ...systemState.config, ...parsedConfig }; 
      systemState.activeTeacher.integrationConfig = {
        googleFormUrl: systemState.config.googleFormUrl,
        entryName: systemState.config.entryName,
        entryId: systemState.config.entryId,
        entryCode: systemState.config.entryCode,
        entryScore: systemState.config.entryScore,
        entryDetails: systemState.config.entryDetails
      };
      saveTeachersToLocalStorage();
    } catch(e){}
  }
  
  const savedProfile = localStorage.getItem("arabya_teacher_profile");
  if (savedProfile && systemState.activeTeacher) {
    try { 
      const parsedProfile = JSON.parse(savedProfile);
      systemState.teacherProfile = parsedProfile;
      systemState.activeTeacher.name = parsedProfile.name;
      systemState.activeTeacher.subject = parsedProfile.subject;
      saveTeachersToLocalStorage();
    } catch(e){}
  }
  
  // 2. تهيئة قاعدة بيانات الامتحانات
  const savedExams = localStorage.getItem("arabya_exams_db");
  if (savedExams) {
    try {
      systemState.exams = JSON.parse(savedExams);
    } catch (e) {
      systemState.exams = [...defaultExams];
    }
  } else {
    systemState.exams = [...defaultExams];
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  }
  
  // 3. تهيئة نتائج الطلاب
  const savedResults = localStorage.getItem("arabya_results_db");
  if (savedResults) {
    try { systemState.results = JSON.parse(savedResults); } catch(e){}
  }

  // 4. تهيئة قاعدة بيانات الطلاب وأكوادهم
  const savedStudents = localStorage.getItem("arabya_students_db");
  if (savedStudents) {
    try {
      systemState.students = JSON.parse(savedStudents);
    } catch(e) {
      systemState.students = [];
    }
  } else {
    // إنشاء كود اشتراك افتراضي تجريبي
    systemState.students = [
      { name: "طالب تجريبي", id: "STU100", code: "ARABYA_FREE", timestamp: new Date().toLocaleDateString("ar-EG") }
    ];
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  }
}

// حفظ قاعدة بيانات المعلمين
function saveTeachersToLocalStorage() {
  localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
}

// حفظ قاعدة بيانات الطلاب
function saveStudentsToLocalStorage() {
  localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
}

// إعداد نظام التوجيه والتنقل بين الصفحات
function setupNavigation() {
  const navLinks = document.querySelectorAll("[data-target]");
  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.dataset.target;
      navigateToView(targetView);
    });
  });
}

function navigateToView(viewId) {
  document.querySelectorAll(".view-section").forEach(v => {
    v.classList.add("hidden");
  });
  
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove("hidden");
    systemState.activeView = viewId;
    localStorage.setItem("arabya_active_view", viewId);
  }
  
  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.dataset.target === viewId) {
      link.classList.add("active-link");
    } else {
      link.classList.remove("active-link");
    }
  });

  if (viewId === "student-login-view") {
    populateExamSelectionList();
  } else if (viewId === "teacher-dashboard-view") {
    loadTeacherDashboardData();
  }
}

// دالة مساعدة للحصول على المعاملات من الرابط (تدعم معاملات البحث بعد ? ومعاملات الهاش بعد #)
// دالة مساعدة للحصول على المعاملات من الرابط (تدعم معاملات البحث بعد ? ومعاملات الهاش بعد #)
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has(name)) {
    return urlParams.get(name);
  }
  
  // فحص معاملات الرابط بعد علامة # إذا تم كتابة الرابط بصيغة hash
  const hash = window.location.hash;
  if (hash.includes('?')) {
    const hashParams = new URLSearchParams(hash.split('?')[1]);
    if (hashParams.has(name)) {
      return hashParams.get(name);
    }
  }
  return null;
}

// دالة موحدة لتوليد الرابط المباشر للامتحان (تدعم المسارات الحقيقية بدون هاش على خوادم الويب)
function getExamDirectLink(exam) {
  const teacherParam = systemState.activeTeacher ? `?teacher=${encodeURIComponent(systemState.activeTeacher.username)}` : '';
  
  if (window.location.protocol === "file:") {
    // تشغيل محلي من الملفات
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    return `${baseUrl}?exam=${exam.id}${teacherParam}`;
  }
  
  // تشغيل من خادم ويب (مثل arabya.net)
  let origin = window.location.origin;
  let pathname = window.location.pathname;
  
  // تنظيف اسم الملف index.html إن وجد في نهاية المسار
  if (pathname.endsWith("index.html")) {
    pathname = pathname.replace("index.html", "");
  }
  if (!pathname.endsWith("/")) {
    pathname += "/";
  }
  
  return `${origin}${pathname}${exam.id}${teacherParam}`;
}

// فحص معاملات الرابط لفتح امتحان مخصص أو الدخول التلقائي للمعلم
// فحص معاملات الرابط لفتح امتحان مخصص أو الدخول التلقائي للمعلم
function checkUrlParameters() {
  let redirected = false;

  // 1. الدخول التلقائي للمعلم عبر رمز الدخول التلقائي
  const autoCode = getUrlParameter("teacher_autocode");
  if (autoCode) {
    const matched = systemState.teachers.find(t => t.autoEntryCode === autoCode);
    if (matched) {
      loginTeacherObject(matched);
      navigateToView("teacher-dashboard-view");
      alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول تلقائياً عبر رمز الدخول السريع.`);
      return true;
    }
  }
  
  // 2. الدخول التلقائي للمعلم عبر اسم المستخدم وكلمة المرور
  const user = getUrlParameter("teacher_username");
  const pass = getUrlParameter("teacher_pass");
  if (user && pass) {
    const matched = systemState.teachers.find(t => t.username.toLowerCase() === user.toLowerCase() && t.password === pass);
    if (matched) {
      loginTeacherObject(matched);
      navigateToView("teacher-dashboard-view");
      alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول تلقائياً.`);
      return true;
    }
  }

  // 3. التحقق من وجود المعلم وتجهيز الإعدادات لتصفية الامتحانات ومزامنة الدرجات
  const teacherUser = getUrlParameter("teacher");
  if (teacherUser) {
    const teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
    const matchedTeacher = teachers.find(t => t.username === teacherUser || t.name === teacherUser);
    if (matchedTeacher) {
      systemState.config = {
        teacherCode: matchedTeacher.password,
        googleFormUrl: matchedTeacher.integrationConfig?.googleFormUrl || "",
        entryName: matchedTeacher.integrationConfig?.entryName || "",
        entryId: matchedTeacher.integrationConfig?.entryId || "",
        entryCode: matchedTeacher.integrationConfig?.entryCode || "",
        entryScore: matchedTeacher.integrationConfig?.entryScore || "",
        entryDetails: matchedTeacher.integrationConfig?.entryDetails || "",
        autoEntryCode: matchedTeacher.autoEntryCode || matchedTeacher.password
      };
      systemState.targetTeacherUsername = matchedTeacher.username;
    }
  }

  // 4. فتح امتحان مخصص للطالب (عبر البارامتر ?exam=... أو عبر المسار الفرعي الحقيقي في pathname)
  let examId = getUrlParameter("exam");
  
  // التحقق من المسار الحقيقي في pathname (مثال: /876KHK أو /online_exam_portal/876KHK)
  if (!examId) {
    const pathName = window.location.pathname;
    const pathSegments = pathName.split('/').filter(s => s.length > 0 && s !== "index.html" && s !== "online_exam_portal");
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      const matchedExam = systemState.exams.find(e => e.id.toLowerCase() === lastSegment.toLowerCase());
      if (matchedExam) {
        examId = matchedExam.id;
      }
    }
  }
  
  // 5. التحقق من وجود مسار هاش مخصص للامتحان (مثال: #/876KHK)
  const hash = window.location.hash;
  if (!examId && hash && hash.startsWith("#/")) {
    const route = hash.substring(2); // ما بعد "#/"
    let cleanRoute = route;
    let queryInHash = "";
    if (route.includes("?")) {
      const parts = route.split("?");
      cleanRoute = parts[0];
      queryInHash = parts[1];
    }
    
    // البحث عن الامتحان المطابق للرمز العشوائي المولد
    const targetExam = systemState.exams.find(e => e.id.toLowerCase() === cleanRoute.toLowerCase());
    if (targetExam) {
      examId = targetExam.id;
      
      // تحليل معامل المعلم من داخل الهاش إن وجد
      if (queryInHash) {
        const hashParams = new URLSearchParams(queryInHash);
        const teacherVal = hashParams.get("teacher");
        if (teacherVal) {
          const teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
          const matchedTeacher = teachers.find(t => t.username === teacherVal || t.name === teacherVal);
          if (matchedTeacher) {
            systemState.config = {
              teacherCode: matchedTeacher.password,
              googleFormUrl: matchedTeacher.integrationConfig?.googleFormUrl || "",
              entryName: matchedTeacher.integrationConfig?.entryName || "",
              entryId: matchedTeacher.integrationConfig?.entryId || "",
              entryCode: matchedTeacher.integrationConfig?.entryCode || "",
              entryScore: matchedTeacher.integrationConfig?.entryScore || "",
              entryDetails: matchedTeacher.integrationConfig?.entryDetails || "",
              autoEntryCode: matchedTeacher.autoEntryCode || matchedTeacher.password
            };
            systemState.targetTeacherUsername = matchedTeacher.username;
          }
        }
      }
    }
  }

  if (examId) {
    const targetExam = systemState.exams.find(e => e.id === examId);
    if (targetExam) {
      navigateToView("student-login-view");
      setTimeout(() => {
        const select = document.getElementById("student-exam-select");
        if (select) {
          select.value = examId;
          select.disabled = true;
        }
      }, 100);
      redirected = true;
    }
  }

  return redirected;
}

// تسجيل دخول كائن معلم محدد وتطبيق إعداداته
function loginTeacherObject(teacher) {
  systemState.activeTeacher = teacher;
  localStorage.setItem("arabya_active_teacher_username", teacher.username);
  
  systemState.teacherProfile = { name: teacher.name, subject: teacher.subject };
  systemState.config = {
    teacherCode: teacher.password,
    googleFormUrl: teacher.integrationConfig?.googleFormUrl || "",
    entryName: teacher.integrationConfig?.entryName || "",
    entryId: teacher.integrationConfig?.entryId || "",
    entryCode: teacher.integrationConfig?.entryCode || "",
    entryScore: teacher.integrationConfig?.entryScore || "",
    entryDetails: teacher.integrationConfig?.entryDetails || "",
    autoEntryCode: teacher.autoEntryCode || teacher.password
  };
}

// ==========================================
// 2. إدارة أحداث واجهة المستخدم
// ==========================================
function setupUIEventListeners() {
  const startExamBtn = document.getElementById("student-start-exam-btn");
  if (startExamBtn) {
    startExamBtn.addEventListener("click", validateStudentAndStart);
  }

  const studentRegisterBtn = document.getElementById("student-register-submit-btn");
  if (studentRegisterBtn) {
    studentRegisterBtn.addEventListener("click", handleStudentRegister);
  }

  const teacherRegisterBtn = document.getElementById("teacher-register-submit-btn");
  if (teacherRegisterBtn) {
    teacherRegisterBtn.addEventListener("click", handleTeacherRegister);
  }

  const teacherLoginBtn = document.getElementById("teacher-submit-login");
  if (teacherLoginBtn) {
    teacherLoginBtn.addEventListener("click", handleTeacherLogin);
  }

  const teacherQuickLoginBtn = document.getElementById("teacher-submit-quick-login");
  if (teacherQuickLoginBtn) {
    teacherQuickLoginBtn.addEventListener("click", handleTeacherQuickLogin);
  }

  const menuItems = document.querySelectorAll(".teacher-menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      menuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      const tabId = item.dataset.tab;
      document.querySelectorAll(".teacher-tab-panel").forEach(panel => {
        panel.classList.add("hidden");
      });
      document.getElementById(`teacher-tab-${tabId}`).classList.remove("hidden");
    });
  });

  const saveProfileBtn = document.getElementById("save-teacher-profile-btn");
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", saveTeacherProfile);
  }

  const saveIntegrationBtn = document.getElementById("save-teacher-integration-btn");
  if (saveIntegrationBtn) {
    saveIntegrationBtn.addEventListener("click", saveTeacherIntegrationConfig);
  }

  const createExamBtn = document.getElementById("create-new-exam-btn");
  if (createExamBtn) {
    createExamBtn.addEventListener("click", createNewExam);
  }

  const exportResultsBtn = document.getElementById("teacher-export-results-btn");
  if (exportResultsBtn) {
    exportResultsBtn.addEventListener("click", exportTeacherResultsToCSV);
  }
  
  const exportResultsJsonBtn = document.getElementById("teacher-export-results-json");
  if (exportResultsJsonBtn) {
    exportResultsJsonBtn.addEventListener("click", exportResultsToJSON);
  }
  
  const importResultsBtn = document.getElementById("teacher-import-results-btn");
  if (importResultsBtn) {
    importResultsBtn.addEventListener("click", () => document.getElementById("teacher-results-file-input").click());
  }
  
  const resultsFileInput = document.getElementById("teacher-results-file-input");
  if (resultsFileInput) {
    resultsFileInput.addEventListener("change", importResultsFromJSON);
  }

  const clearResultsBtn = document.getElementById("teacher-clear-results-btn");
  if (clearResultsBtn) {
    clearResultsBtn.addEventListener("click", clearTeacherResults);
  }

  const importExamBtn = document.getElementById("teacher-import-exam-btn");
  if (importExamBtn) {
    importExamBtn.addEventListener("click", importExamFromGoogleForm);
  }

  const nextQBtn = document.getElementById("runner-next-btn");
  if (nextQBtn) {
    nextQBtn.addEventListener("click", () => runnerNextQuestion(false));
  }

  const restartBtn = document.getElementById("runner-restart-btn");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => navigateToView("welcome-view"));
  }

  const searchResultBtn = document.getElementById("student-search-submit");
  if (searchResultBtn) {
    searchResultBtn.addEventListener("click", searchStudentResults);
  }
}

// ==========================================
// 3. بوابة وبناء الامتحانات الأكاديمية (Teacher)
// ==========================================

function handleTeacherLogin() {
  const usernameInput = document.getElementById("teacher-login-username").value.trim();
  const passwordInput = document.getElementById("teacher-password").value;

  if (!usernameInput || !passwordInput) {
    alert("يرجى إدخال اسم المعلم والرقم السري!");
    return;
  }

  const matched = systemState.teachers.find(t => 
    (t.username.toLowerCase() === usernameInput.toLowerCase() || t.name === usernameInput) && 
    t.password === passwordInput
  );

  if (matched) {
    loginTeacherObject(matched);
    navigateToView("teacher-dashboard-view");
    document.getElementById("teacher-password").value = "";
  } else {
    alert("بيانات المعلم غير صحيحة أو الحساب غير موجود!");
  }
}

function handleTeacherQuickLogin() {
  const codeInput = document.getElementById("teacher-quick-code");
  const codeVal = codeInput ? codeInput.value.trim() : "";

  if (!codeVal) {
    alert("يرجى إدخال رمز الدخول السريع!");
    return;
  }

  // البحث عن المعلم المطابق للرمز السريع أو الرقم السري
  const matched = systemState.teachers.find(t => 
    t.autoEntryCode === codeVal || 
    t.password === codeVal
  );

  if (matched) {
    loginTeacherObject(matched);
    navigateToView("teacher-dashboard-view");
    if (codeInput) codeInput.value = "";
    alert(`مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول بنجاح عبر رمز الدخول السريع.`);
  } else {
    alert("رمز الدخول السريع غير صحيح أو الحساب غير موجود!");
  }
}

function handleTeacherRegister() {
  const name = document.getElementById("teacher-reg-name").value.trim();
  const username = document.getElementById("teacher-reg-username").value.trim();
  const subject = document.getElementById("teacher-reg-subject").value.trim();
  const password = document.getElementById("teacher-reg-password").value.trim();
  const autoCode = document.getElementById("teacher-reg-autocode").value.trim();

  if (!name || !username || !subject || !password || !autoCode) {
    alert("يرجى ملء جميع الحقول الإلزامية لتسجيل الحساب!");
    return;
  }

  // فحص عدم تكرار اسم المستخدم
  const isDuplicate = systemState.teachers.some(t => t.username.toLowerCase() === username.toLowerCase());
  if (isDuplicate) {
    alert("اسم المستخدم هذا مسجل بالفعل كمعلم! يرجى اختيار اسم مستخدم آخر.");
    return;
  }

  const newTeacher = {
    name,
    username,
    subject,
    password,
    autoEntryCode: autoCode,
    integrationConfig: {
      googleFormUrl: "",
      entryName: "",
      entryId: "",
      entryCode: "",
      entryScore: "",
      entryDetails: ""
    }
  };

  systemState.teachers.push(newTeacher);
  saveTeachersToLocalStorage();

  alert(`تم تسجيل حسابك كمعلم بنجاح يا أستاذ ${name}! يمكنك الدخول الآن.`);
  navigateToView("teacher-login-view");
  
  // تعبئة البيانات تلقائياً
  document.getElementById("teacher-login-username").value = username;
  document.getElementById("teacher-password").value = "";
}

function loadTeacherDashboardData() {
  if (!systemState.activeTeacher) return;
  
  // تحديث عنوان التسمية الجانبية
  document.getElementById("teacher-sidebar-subtitle").innerText = `المعلم: ${systemState.activeTeacher.name}`;

  document.getElementById("teacher-profile-name").value = systemState.activeTeacher.name;
  document.getElementById("teacher-profile-subject").value = systemState.activeTeacher.subject;
  document.getElementById("teacher-profile-autocode").value = systemState.activeTeacher.autoEntryCode || "";

  document.getElementById("teacher-config-code").value = systemState.activeTeacher.password;
  document.getElementById("teacher-config-url").value = systemState.activeTeacher.integrationConfig?.googleFormUrl || "";
  document.getElementById("teacher-config-name").value = systemState.activeTeacher.integrationConfig?.entryName || "";
  document.getElementById("teacher-config-id").value = systemState.activeTeacher.integrationConfig?.entryId || "";
  document.getElementById("teacher-config-code-id").value = systemState.activeTeacher.integrationConfig?.entryCode || "";
  document.getElementById("teacher-config-score").value = systemState.activeTeacher.integrationConfig?.entryScore || "";
  document.getElementById("teacher-config-details").value = systemState.activeTeacher.integrationConfig?.entryDetails || "";

  // توليد وعرض رابط الدخول التلقائي للمعلم
  const baseUrl = window.location.href.split('?')[0].split('#')[0];
  const autoUrl = `${baseUrl}?teacher_autocode=${systemState.activeTeacher.autoEntryCode}`;
  document.getElementById("teacher-auto-login-url").value = autoUrl;

  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();
}

function saveTeacherProfile() {
  if (!systemState.activeTeacher) return;

  const name = document.getElementById("teacher-profile-name").value.trim();
  const subject = document.getElementById("teacher-profile-subject").value.trim();
  const autoCode = document.getElementById("teacher-profile-autocode").value.trim();

  if (!name || !subject || !autoCode) {
    alert("يرجى ملء جميع الحقول المطلوبة وحقل رمز الدخول التلقائي!");
    return;
  }

  // فحص عدم تكرار رمز الدخول التلقائي مع معلمين آخرين
  const isCodeDuplicate = systemState.teachers.some(t => t.username !== systemState.activeTeacher.username && t.autoEntryCode === autoCode);
  if (isCodeDuplicate) {
    alert("رمز الدخول التلقائي هذا مستخدم بالفعل من قبل معلم آخر! اختر رمزاً فريداً.");
    return;
  }

  systemState.activeTeacher.name = name;
  systemState.activeTeacher.subject = subject;
  systemState.activeTeacher.autoEntryCode = autoCode;
  
  systemState.teacherProfile = { name, subject };

  // تحديث القائمة العامة
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }

  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
  
  // إعادة التحميل لتحديث الرابط
  loadTeacherDashboardData();
  alert("تم حفظ بيانات الملف الشخصي وتحديث رمز الدخول بنجاح!");
}

function saveTeacherIntegrationConfig() {
  if (!systemState.activeTeacher) return;

  const code = document.getElementById("teacher-config-code").value.trim();
  const url = document.getElementById("teacher-config-url").value.trim();
  const entryName = document.getElementById("teacher-config-name").value.trim();
  const entryId = document.getElementById("teacher-config-id").value.trim();
  const entryCode = document.getElementById("teacher-config-code-id").value.trim();
  const entryScore = document.getElementById("teacher-config-score").value.trim();
  const entryDetails = document.getElementById("teacher-config-details").value.trim();

  if (!code) {
    alert("الرقم السري لا يمكن أن يكون فارغاً!");
    return;
  }

  systemState.activeTeacher.password = code;
  systemState.activeTeacher.integrationConfig = {
    googleFormUrl: url,
    entryName,
    entryId,
    entryCode,
    entryScore,
    entryDetails
  };

  systemState.config = {
    teacherCode: code,
    googleFormUrl: url,
    entryName,
    entryId,
    entryCode,
    entryScore,
    entryDetails,
    autoEntryCode: systemState.activeTeacher.autoEntryCode || code
  };

  // تحديث القائمة العامة والـ local storage
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }

  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  
  alert("تم حفظ إعدادات التكامل ومزامنة شيتات جوجل بنجاح!");
}

// عرض الامتحانات
function renderExamsList() {
  const container = document.getElementById("teacher-exams-list");
  container.innerHTML = "";

  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية";
  const teacherExams = systemState.exams.filter(exam => !exam.teacher || exam.teacher === activeUsername);

  if (teacherExams.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 2rem;">لا توجد امتحانات مضافة بعد. أنشئ امتحاناً بالأسفل!</div>`;
    return;
  }

  teacherExams.forEach(exam => {
    const card = document.createElement("div");
    card.className = "exam-info-card";
    
    // ربط المعلم النشط بالرابط تلقائياً
    const examUrl = getExamDirectLink(exam);
    const totalExamScore = exam.totalScore || 100;

    card.innerHTML = `
      <div>
        <div class="exam-info-title">${exam.title}</div>
        <div style="font-size:0.8rem; color:var(--secondary); font-weight:600; margin-bottom:0.5rem;">
          المادة: ${exam.subject} | الفرقة: ${exam.level || 'غير محددة'}
        </div>
        <div class="exam-info-details">
          <span>الكلية: ${exam.faculty || 'عام'} | الجامعة: ${exam.university || 'عام'}</span>
          <span>المجموع النهائي الكلي: <code style="color:var(--accent); font-weight:700;">${totalExamScore} درجة</code></span>
          <span>النوع: ${exam.examType || 'أعمال فصلية'} | عدد الأسئلة: ${exam.questions.length}</span>
        </div>
      </div>
      <div>
        <div class="exam-actions-row">
          <button class="btn btn-primary btn-sm" onclick="editExamQuestions('${exam.id}')">تعديل الامتحان والأسئلة</button>
          <button class="btn btn-outline btn-sm" onclick="copyExamLink('${examUrl}')">نسخ الرابط</button>
          <button class="btn btn-outline btn-sm" onclick="generateGoogleFormScript('${exam.id}')">تصدير لجوجل فورم</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error);" onclick="deleteExam('${exam.id}')">حذف</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// إنشاء امتحان جديد
function createNewExam() {
  const title = document.getElementById("new-exam-title").value.trim();
  const subject = document.getElementById("new-exam-subject").value.trim();
  const level = document.getElementById("new-exam-level").value.trim();
  const faculty = document.getElementById("new-exam-faculty").value.trim();
  const university = document.getElementById("new-exam-university").value.trim();
  const examType = document.getElementById("new-exam-type").value;

  if (!title || !subject || !level || !faculty || !university) {
    alert("يرجى ملء كافة تفاصيل بيانات الامتحان الأكاديمية الجديدة!");
    return;
  }

  const examId = Math.random().toString(36).substr(2, 6).toUpperCase();

  const newExam = {
    id: examId,
    teacher: systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية",
    title,
    subject,
    level,
    faculty,
    university,
    examType,
    totalScore: 100, // افتراضياً المجموع 100
    questions: []
  };

  systemState.exams.push(newExam);
  localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  
  document.getElementById("new-exam-title").value = "";
  document.getElementById("new-exam-subject").value = "";
  document.getElementById("new-exam-level").value = "";
  document.getElementById("new-exam-faculty").value = "";
  document.getElementById("new-exam-university").value = "";
  
  renderExamsList();

  const examUrl = getExamDirectLink(newExam);
  
  const directLinkBox = document.getElementById("new-exam-direct-link-box");
  const directLinkInput = document.getElementById("new-exam-direct-link-input");
  
  directLinkInput.value = examUrl;
  directLinkBox.classList.remove("hidden");

  alert(`تم إنشاء الامتحان "${title}" بنجاح! يمكنك الآن نسخ رابط الدخول للطلاب بالأسفل أو البدء في تعديل وإضافة الأسئلة.`);
}

window.deleteExam = function(examId) {
  if (confirm("هل أنت متأكد من حذف هذا الامتحان بالكامل؟ ستفقد جميع الأسئلة المرتبطة به.")) {
    systemState.exams = systemState.exams.filter(e => e.id !== examId);
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
    renderExamsList();
  }
};

// ==========================================
// 4. محرر الأسئلة والبيانات المطور
// ==========================================
let currentEditingExamId = null;

window.editExamQuestions = function(examId) {
  currentEditingExamId = examId;
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;

  document.getElementById("teacher-exams-list-view").classList.add("hidden");
  
  const editorPanel = document.getElementById("teacher-questions-editor-panel");
  editorPanel.classList.remove("hidden");
  
  document.getElementById("editor-exam-title").innerText = exam.title;

  // تعبئة حقول تعديل الميتا داتا للأمتحان
  document.getElementById("edit-meta-title").value = exam.title;
  document.getElementById("edit-meta-subject").value = exam.subject;
  document.getElementById("edit-meta-level").value = exam.level || "";
  document.getElementById("edit-meta-faculty").value = exam.faculty || "";
  document.getElementById("edit-meta-university").value = exam.university || "";
  document.getElementById("edit-meta-type").value = exam.examType || "أعمال فصلية";
  document.getElementById("edit-meta-totalscore").value = exam.totalScore || 100;

  // توليد وعرض الرابط المباشر للاختبار المرتبط بالمعلم
  const examUrl = getExamDirectLink(exam);
  const linkInput = document.getElementById("edit-exam-direct-link");
  if (linkInput) {
    linkInput.value = examUrl;
  }

  renderQuestionsForEdit(exam);
};

window.closeQuestionsEditor = function() {
  document.getElementById("teacher-questions-editor-panel").classList.add("hidden");
  document.getElementById("teacher-exams-list-view").classList.remove("hidden");
  currentEditingExamId = null;
  renderExamsList();
};

function renderQuestionsForEdit(exam) {
  const container = document.getElementById("editor-questions-list");
  container.innerHTML = "";

  if (exam.questions.length === 0) {
    container.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">لا توجد أسئلة مضافة في هذا الامتحان بعد. أضف سؤالاً بالأسفل!</div>`;
    return;
  }

  exam.questions.forEach((q, index) => {
    const card = document.createElement("div");
    card.className = "exam-builder-card";
    
    let typeName = "اختيار من متعدد";
    if (q.type === "boolean") typeName = "صواب وخطأ";
    if (q.type === "essay") typeName = "سؤال مقالي كتابي";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
        <span style="font-weight:700; color:white;">سؤال ${index + 1} (${typeName})</span>
        <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error);" onclick="deleteQuestion(${index})">حذف السؤال</button>
      </div>
      
      <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 1rem; margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">نص السؤال:</label>
          <input type="text" class="form-control edit-q-text" value="${q.question}" data-index="${index}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">درجة السؤال:</label>
          <input type="number" class="form-control edit-q-points" value="${q.points !== undefined ? q.points : 10}" min="1" data-index="${index}">
        </div>
      </div>
    `;

    const optionsWrapper = document.createElement("div");
    optionsWrapper.style.marginTop = "0.75rem";
    optionsWrapper.className = "edit-options-wrapper";
    optionsWrapper.dataset.qIndex = index;

    if (q.type === "essay") {
      optionsWrapper.innerHTML = `
        <div style="background:rgba(255,255,255,0.01); border:1px dashed var(--border-color); padding:1rem; border-radius:8px; color:var(--accent); font-size:0.85rem;">
          <span class="material-icons" style="vertical-align:middle; font-size:1.1rem;">article</span> سؤال مقالي: سيظهر للطالب مساحة نصية حرة للإجابة والكتابة بالتفصيل. يتم تقييم النتيجة يدوياً.
        </div>
      `;
    } else if (q.type === "boolean") {
      q.options.forEach((opt, optIdx) => {
        const isCorrect = optIdx === q.correctAnswer;
        const optGroup = document.createElement("div");
        optGroup.className = "form-group";
        optGroup.style.display = "flex";
        optGroup.style.alignItems = "center";
        optGroup.style.gap = "0.5rem";
        optGroup.style.marginBottom = "0.5rem";

        optGroup.innerHTML = `
          <input type="radio" name="edit-correct-${index}" value="${optIdx}" ${isCorrect ? 'checked' : ''}>
          <input type="text" class="form-control edit-q-option" value="${opt}" style="padding: 0.5rem 1rem;" data-question-index="${index}" data-option-index="${optIdx}" readonly>
        `;
        optionsWrapper.appendChild(optGroup);
      });
    } else {
      q.options.forEach((opt, optIdx) => {
        const isCorrect = optIdx === q.correctAnswer;
        const optGroup = document.createElement("div");
        optGroup.className = "form-group";
        optGroup.style.display = "flex";
        optGroup.style.alignItems = "center";
        optGroup.style.gap = "0.5rem";
        optGroup.style.marginBottom = "0.5rem";

        optGroup.innerHTML = `
          <input type="radio" name="edit-correct-${index}" value="${optIdx}" ${isCorrect ? 'checked' : ''}>
          <input type="text" class="form-control edit-q-option" value="${opt}" style="padding: 0.5rem 1rem;" data-question-index="${index}" data-option-index="${optIdx}">
          <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error); padding: 0.4rem;" onclick="removeOptionFromQuestion(${index}, ${optIdx})" title="حذف البديل">&times;</button>
        `;
        optionsWrapper.appendChild(optGroup);
      });

      const actionRow = document.createElement("div");
      actionRow.style.marginTop = "0.5rem";
      actionRow.style.display = "flex";
      actionRow.style.gap = "0.5rem";
      
      actionRow.innerHTML = `
        <button class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary);" onclick="addOptionToQuestion(${index})">+ إضافة خيار إضافي</button>
      `;
      optionsWrapper.appendChild(actionRow);
    }

    card.appendChild(optionsWrapper);
    container.appendChild(card);
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary";
  saveBtn.style.marginTop = "1rem";
  saveBtn.innerHTML = `<span class="material-icons">save</span> حفظ جميع التعديلات الحالية`;
  saveBtn.addEventListener("click", saveAllEditedQuestions);
  container.appendChild(saveBtn);
}

// حفظ الأسئلة والبيانات الأكاديمية لاحقاً (تعديل كامل)
function saveAllEditedQuestions() {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  // 1. تحديث وحفظ الميتا داتا الأكاديمية المكتوبة
  const editTitle = document.getElementById("edit-meta-title").value.trim();
  const editSubject = document.getElementById("edit-meta-subject").value.trim();
  const editLevel = document.getElementById("edit-meta-level").value.trim();
  const editFaculty = document.getElementById("edit-meta-faculty").value.trim();
  const editUniversity = document.getElementById("edit-meta-university").value.trim();
  const editType = document.getElementById("edit-meta-type").value;
  const editTotalScore = parseFloat(document.getElementById("edit-meta-totalscore").value) || 100;

  if (!editTitle || !editSubject || !editLevel || !editFaculty || !editUniversity) {
    alert("يرجى ملء جميع حقول بيانات الامتحان الأكاديمية المطلوبة!");
    return;
  }

  exam.title = editTitle;
  exam.subject = editSubject;
  exam.level = editLevel;
  exam.faculty = editFaculty;
  exam.university = editUniversity;
  exam.examType = editType;
  exam.totalScore = editTotalScore;

  // 2. تحديث وحفظ الأسئلة وأوزان درجاتها
  const cards = document.querySelectorAll("#editor-questions-list .exam-builder-card");
  const updatedQuestions = [];

  cards.forEach((card, index) => {
    const textInput = card.querySelector(".edit-q-text");
    const questionText = textInput ? textInput.value.trim() : "";

    const pointsInput = card.querySelector(".edit-q-points");
    const questionPoints = pointsInput ? parseFloat(pointsInput.value) || 10 : 10;

    const typeInput = exam.questions[index].type;

    let options = [];
    let correctAnswer = 0;

    if (typeInput === "essay") {
      options = [];
      correctAnswer = "";
    } else {
      const optionInputs = card.querySelectorAll(".edit-q-option");
      optionInputs.forEach(input => {
        options.push(input.value.trim());
      });

      const checkedRadio = card.querySelector(`input[name="edit-correct-${index}"]:checked`);
      correctAnswer = checkedRadio ? parseInt(checkedRadio.value) : 0;
    }

    updatedQuestions.push({
      id: index + 1,
      type: typeInput,
      question: questionText,
      options,
      correctAnswer,
      points: questionPoints // حفظ الوزن
    });
  });

  exam.questions = updatedQuestions;
  localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  alert("تم تعديل وحفظ بيانات الامتحان وكافة الأسئلة بنجاح!");
  
  // إعادة عرض
  document.getElementById("editor-exam-title").innerText = exam.title;
  renderQuestionsForEdit(exam);
}

window.addOptionToQuestion = function(qIndex) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  exam.questions[qIndex].options.push(`خيار جديد ${exam.questions[qIndex].options.length + 1}`);
  renderQuestionsForEdit(exam);
};

window.removeOptionFromQuestion = function(qIndex, optIndex) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  if (exam.questions[qIndex].options.length <= 2) {
    alert("لا يمكن أن يحتوي سؤال الاختيار على أقل من بديلين!");
    return;
  }

  exam.questions[qIndex].options.splice(optIndex, 1);
  if (exam.questions[qIndex].correctAnswer >= exam.questions[qIndex].options.length) {
    exam.questions[qIndex].correctAnswer = 0;
  }
  
  renderQuestionsForEdit(exam);
};

window.addNewQuestionToExam = function(type) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  let newQ = null;
  if (type === 'multiple') {
    newQ = {
      id: exam.questions.length + 1,
      type: "multiple",
      question: "اكتب سؤال الاختيار من متعدد الجديد هنا...",
      options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث"],
      correctAnswer: 0,
      points: 10
    };
  } else if (type === 'boolean') {
    newQ = {
      id: exam.questions.length + 1,
      type: "boolean",
      question: "اكتب سؤال الصواب والخطأ هنا...",
      options: ["صواب", "خطأ"],
      correctAnswer: 0,
      points: 10
    };
  } else {
    newQ = {
      id: exam.questions.length + 1,
      type: "essay",
      question: "اكتب نص السؤال المقالي الجديد هنا...",
      options: [],
      correctAnswer: "",
      points: 10
    };
  }

  exam.questions.push(newQ);
  localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  renderQuestionsForEdit(exam);
};

window.deleteQuestion = function(index) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  if (confirm("هل أنت متأكد من حذف هذا السؤال؟")) {
    exam.questions.splice(index, 1);
    exam.questions.forEach((q, idx) => { q.id = idx + 1; });
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
    renderQuestionsForEdit(exam);
  }
};

// ==========================================
// 5. التصدير والاستيراد لـ Google Forms
// ==========================================

window.generateGoogleFormScript = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;

  let script = `/**
 * Google Apps Script لتوليد امتحان "${exam.title}" تلقائياً
 * تم إنشاؤه بواسطة منصة arabya.ai
 */
function createArabyaExamForm() {
  var form = FormApp.create('${exam.title}');
  form.setDescription('المادة: ${exam.subject} | الكلية: ${exam.faculty} | الجامعة: ${exam.university} \\n تم إنشاء النموذج تلقائياً عبر arabya.ai');
  form.setIsQuiz(true);
  
  var studentName = form.addTextItem();
  studentName.setTitle('اسم الطالب بالكامل').setRequired(true);
  
  var studentId = form.addTextItem();
  studentId.setTitle('رقم المعرف (ID)').setRequired(true);
  
  var accessCode = form.addTextItem();
  accessCode.setTitle('كود الاشتراك بموقع الامتحان (اختياري)').setRequired(false);
  
  var scorePlaceholder = form.addTextItem();
  scorePlaceholder.setTitle('النتيجة (حقل مزامنة للـ API)').setRequired(false);
  
  var detailsPlaceholder = form.addParagraphTextItem();
  detailsPlaceholder.setTitle('تقرير الإجابات التفصيلي (حقل مزامنة للـ API)').setRequired(false);
`;

  exam.questions.forEach((q, idx) => {
    const points = q.points !== undefined ? q.points : 10;
    if (q.type === 'essay') {
      script += `
  var item${idx} = form.addParagraphTextItem();
  item${idx}.setTitle('${q.question}');
  item${idx}.setRequired(true);
`;
    } else {
      script += `
  var item${idx} = form.addMultipleChoiceItem();
  item${idx}.setTitle('${q.question}');
  item${idx}.setChoices([
    ${q.options.map((opt, oIdx) => `item${idx}.createChoice('${opt}', ${oIdx === q.correctAnswer})`).join(",\n    ")}
  ]);
  item${idx}.setPoints(${points});
  item${idx}.setRequired(true);
`;
    }
  });

  script += `
  Logger.log('تم إنشاء النموذج بنجاح: ' + form.getEditUrl());
  Browser.msgBox('تم إنشاء الامتحان بنجاح في Google Drive الخاص بك! رابط التعديل هو: ' + form.getEditUrl());
}
`;

  navigateToView("teacher-dashboard-view");
  const tabIntegration = document.getElementById("teacher-tab-integration");
  document.querySelectorAll(".teacher-menu-item").forEach(i => i.classList.remove("active"));
  document.querySelectorAll(".teacher-menu-item").forEach(i => {
    if (i.dataset.tab === "integration") i.classList.add("active");
  });
  document.querySelectorAll(".teacher-tab-panel").forEach(p => p.classList.add("hidden"));
  tabIntegration.classList.remove("hidden");

  const oldTextarea = document.getElementById("google-apps-script-code");
  if (oldTextarea) {
    oldTextarea.value = script;
  } else {
    const box = document.createElement("div");
    box.className = "config-card-box";
    box.id = "apps-script-output-container";
    box.innerHTML = `
      <h4 style="color:var(--secondary); margin-bottom:0.5rem; font-weight:700;">كود Google Apps Script للامتحان الحالي:</h4>
      <textarea id="google-apps-script-code" class="essay-textarea" style="font-family:monospace; font-size:0.8rem;" readonly>${script}</textarea>
      <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="copyAppsScriptCode()">نسخ الكود البرمجي</button>
    `;
    tabIntegration.appendChild(box);
  }
  
  alert("تم توليد كود Google Apps Script بنجاح بالأسفل! يرجى الذهاب لتبويب (الربط بـ Google Sheets) لنسخ الكود.");
};

window.copyAppsScriptCode = function() {
  const code = document.getElementById("google-apps-script-code");
  if (code) {
    navigator.clipboard.writeText(code.value).then(() => {
      alert("تم نسخ الكود البرمجي بنجاح! افتح script.google.com لإنشاء الامتحان.");
    });
  }
};

function importExamFromGoogleForm() {
  const sourceText = document.getElementById("teacher-import-exam-source").value.trim();
  if (!sourceText) {
    alert("يرجى لصق الكود المصدري للنموذج أو كود الـ JSON للاستيراد!");
    return;
  }

  let importedExam = null;

  try {
    const parsed = JSON.parse(sourceText);
    if (parsed && parsed.title && parsed.questions) {
      importedExam = parsed;
    }
  } catch (e) {
    importedExam = parseGoogleFormHTML(sourceText);
  }

  if (importedExam) {
    importedExam.id = "EXAM_" + Math.random().toString(36).substr(2, 6).toUpperCase();
    importedExam.teacher = systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية";
    if (!importedExam.subject) importedExam.subject = "لغة عربية (مستورد)";
    if (!importedExam.level) importedExam.level = "الفرقة الأولى";
    if (!importedExam.faculty) importedExam.faculty = "كلية اللغة العربية";
    if (!importedExam.university) importedExam.university = "جامعة ARABYA.NET";
    if (!importedExam.examType) importedExam.examType = "أعمال فصلية";
    if (!importedExam.totalScore) importedExam.totalScore = 100;

    systemState.exams.push(importedExam);
    localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
    
    document.getElementById("teacher-import-exam-source").value = "";
    renderExamsList();
    alert(`تم استيراد امتحان "${importedExam.title}" بنجاح مع عدد ${importedExam.questions.length} أسئلة!`);
  } else {
    alert("فشل استيراد الامتحان! تأكد من أنك قمت بلصق كود JSON صحيح، أو كود مصدر HTML كامل لصفحة معاينة النموذج.");
  }
}

function parseGoogleFormHTML(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    let title = "امتحان مستورد من جوجل";
    const titleEl = doc.querySelector("[role='heading']") || doc.querySelector("title");
    if (titleEl) title = titleEl.innerText.trim();

    const questions = [];
    let qId = 1;

    const scripts = doc.querySelectorAll("script");
    let loadDataFound = false;

    scripts.forEach(script => {
      const text = script.innerText;
      if (text.includes("FB_PUBLIC_LOAD_DATA_")) {
        const match = text.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);/);
        if (match && match[1]) {
          try {
            const rawData = eval(match[1]);
            const items = rawData[1][1];
            
            items.forEach(item => {
              const qText = item[1];
              const qTypeNum = item[3];
              
              if (qText && qTypeNum !== undefined) {
                let type = "essay";
                let options = [];
                let correctAnswer = 0;

                if (qTypeNum === 2 || qTypeNum === 3 || qTypeNum === 4) {
                  const rawOpts = item[4][0][1];
                  options = rawOpts.map(o => o[0]);
                  type = options.length === 2 && (options.includes("صواب") || options.includes("صح") || options.includes("نعم")) ? "boolean" : "multiple";
                } else {
                  type = "essay";
                }

                questions.push({
                  id: qId++,
                  type,
                  question: qText,
                  options,
                  correctAnswer,
                  points: 10 // الوزن التلقائي المستورد
                });
              }
            });
            loadDataFound = true;
          } catch (e) {
            console.error("خطأ تفكيك FB_PUBLIC_LOAD_DATA_:", e);
          }
        }
      }
    });

    if (loadDataFound && questions.length > 0) {
      return { title, questions };
    }

    const listItems = doc.querySelectorAll("[role='listitem']");
    if (listItems.length > 0) {
      listItems.forEach(card => {
        const qTitleEl = card.querySelector("[role='heading']") || card.querySelector("div[class*='M26nFb']");
        if (!qTitleEl) return;
        const qText = qTitleEl.innerText.trim();

        const optionsEl = card.querySelectorAll("[role='radio']");
        let type = "essay";
        let options = [];

        if (optionsEl.length > 0) {
          optionsEl.forEach(opt => {
            options.push(opt.innerText.trim() || opt.nextSibling?.textContent?.trim() || "بديل");
          });
          type = options.length === 2 ? "boolean" : "multiple";
        }

        questions.push({
          id: qId++,
          type,
          question: qText,
          options,
          correctAnswer: 0,
          points: 10
        });
      });
    }

    if (questions.length > 0) {
      return { title, questions };
    }
  } catch (err) {
    console.error("خطأ تحليل HTML جوجل فورم:", err);
  }
  return null;
}

// ==========================================
// 6. استيراد وتصدير نتائج الطلاب (JSON/CSV)
// ==========================================

function exportResultsToJSON() {
  if (systemState.results.length === 0) {
    alert("لا توجد نتائج لتصديرها!");
    return;
  }
  const blob = new Blob([JSON.stringify(systemState.results, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `نتائج_الطلاب_arabya_${new Date().toLocaleDateString()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function importResultsFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        let addedCount = 0;
        parsed.forEach(res => {
          const isDuplicate = systemState.results.some(r => r.id === res.id && r.examId === res.examId && r.timestamp === res.timestamp);
          if (!isDuplicate) {
            systemState.results.push(res);
            addedCount++;
          }
        });

        localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
        renderStudentResultsTable();
        alert(`تم استيراد عدد ${addedCount} سجلات نتائج جديدة بنجاح!`);
      } else {
        alert("تنسيق الملف غير صحيح!");
      }
    } catch(err) {
      alert("خطأ في قراءة ملف النتائج!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

// ==========================================
// 7. بوابة الطالب والامتحان الفعلي مع إتاحة الوصول (Accessibility)
// ==========================================

function populateExamSelectionList() {
  const select = document.getElementById("student-exam-select");
  if (!select) return;

  select.disabled = false;
  select.innerHTML = `<option value="" disabled selected>-- اختر الامتحان الذي ترغب في أدائه --</option>`;
  
  // تصفية الامتحانات لتظهر فقط امتحانات المعلم المرتبط بالرابط إن وجد
  let filteredExams = systemState.exams;
  if (systemState.targetTeacherUsername) {
    filteredExams = systemState.exams.filter(exam => exam.teacher === systemState.targetTeacherUsername || !exam.teacher);
  }

  filteredExams.forEach(exam => {
    const opt = document.createElement("option");
    opt.value = exam.id;
    opt.innerText = `${exam.title} (${exam.subject})`;
    select.appendChild(opt);
  });
}

function validateStudentAndStart() {
  const name = document.getElementById("student-fullname-input").value.trim();
  const id = document.getElementById("student-id-input").value.trim();
  const code = document.getElementById("student-access-code").value.trim();
  const examId = document.getElementById("student-exam-select").value;

  if (!name) {
    alert("يرجى إدخال اسمك بالكامل للبدء!");
    return;
  }
  if (!id) {
    alert("يرجى إدخال رقم المعرف (ID) الخاص بك!");
    return;
  }
  if (!examId) {
    alert("يرجى اختيار الامتحان المستهدف!");
    return;
  }

  const selectedExam = systemState.exams.find(e => e.id === examId);
  if (!selectedExam) {
    alert("الامتحان المختار غير متوفر!");
    return;
  }

  if (selectedExam.questions.length === 0) {
    alert("عذراً، هذا الامتحان لا يحتوي على أي أسئلة مضافة بعد!");
    return;
  }

  systemState.currentStudent = { name, id, accessCode: code || "لا يوجد" };
  systemState.currentExam = selectedExam;
  
  // خلط الأسئلة
  systemState.shuffledQuestions = shuffle([...selectedExam.questions]);
  
  systemState.currentQuestionIndex = 0;
  systemState.studentAnswers = {};
  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;

  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
}

function renderRunnerQuestion() {
  const question = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  
  document.getElementById("runner-current-num").innerText = systemState.currentQuestionIndex + 1;
  document.getElementById("runner-total-num").innerText = systemState.shuffledQuestions.length;
  
  const progress = ((systemState.currentQuestionIndex + 1) / systemState.shuffledQuestions.length) * 100;
  document.getElementById("runner-progress-fill").style.width = `${progress}%`;

  const exam = systemState.currentExam;
  const examTotalScore = exam.totalScore || 100;
  const qPoints = question.points !== undefined ? question.points : 10;

  document.getElementById("runner-exam-title").innerHTML = `
    ${exam.title} 
    <div style="font-size:0.75rem; color:var(--accent); font-weight:normal; margin-top:0.25rem;">
      الجامعة: ${exam.university} | الكلية: ${exam.faculty} | الفرقة: ${exam.level} | النوع: ${exam.examType || 'أعمال سنة'} | المجموع: ${examTotalScore} درجة
    </div>
  `;

  // عرض نص السؤال مع نقاط السؤال الفردي وتفعيل التركيز من أجل قارئ الشاشة (Blind Students Focus Management)
  const qTextEl = document.getElementById("runner-question-text");
  qTextEl.innerText = `${question.question} (${qPoints} درجات)`;
  qTextEl.setAttribute("tabindex", "-1");
  qTextEl.focus(); // نقل التركيز فوراً ليقرأه قارئ الشاشة كفيف الحركة تلقائياً!

  const optionsWrapper = document.getElementById("runner-options-list");
  optionsWrapper.innerHTML = "";

  if (question.type === "essay") {
    const container = document.createElement("div");
    container.style.width = "100%";

    const textarea = document.createElement("textarea");
    textarea.className = "essay-textarea";
    textarea.placeholder = "اكتب إجابتك النصية الكاملة والتفصيلية هنا...";
    textarea.setAttribute("aria-label", `إجابة السؤال المقالي: ${question.question}`);
    
    if (systemState.studentAnswers[question.id] !== undefined) {
      textarea.value = systemState.studentAnswers[question.id];
    }

    const counter = document.createElement("div");
    counter.className = "char-counter";
    counter.innerText = "عدد الحروف المكتوبة: 0";

    textarea.addEventListener("input", (e) => {
      systemState.studentAnswers[question.id] = e.target.value;
      counter.innerText = `عدد الحروف المكتوبة: ${e.target.value.length}`;
    });

    textarea.addEventListener("paste", e => e.preventDefault());
    textarea.addEventListener("copy", e => e.preventDefault());

    container.appendChild(textarea);
    container.appendChild(counter);
    optionsWrapper.appendChild(container);
  } else {
    // أسئلة الاختيارات المتعددة (تدعم التنقل باللوحة وقارئ الشاشة بـ WAI-ARIA)
    question.options.forEach((optText, idx) => {
      const card = document.createElement("div");
      card.className = "option-card";
      card.dataset.index = idx;
      
      // تهيئة للإتاحة للطلاب المكفوفين
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `خيار ${idx+1}: ${optText}`);

      const marker = document.createElement("div");
      marker.className = "option-marker";
      const letterMarkers = ["أ", "ب", "ج", "د", "هـ", "و", "ز"];
      marker.innerText = letterMarkers[idx] || (idx + 1);

      const text = document.createElement("div");
      text.className = "option-text";
      text.innerText = optText;

      card.appendChild(marker);
      card.appendChild(text);

      if (systemState.studentAnswers[question.id] === idx) {
        card.classList.add("selected");
        card.setAttribute("aria-pressed", "true");
      } else {
        card.setAttribute("aria-pressed", "false");
      }

      // اختيار عبر الضغط بالفأرة
      card.addEventListener("click", () => selectRunnerOption(idx));
      
      // اختيار عبر لوحة المفاتيح (Enter أو المسافة) للطلاب المكفوفين
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectRunnerOption(idx);
          card.focus(); // إعادة تركيز الكارت لتنطق قارئة الشاشة التحديد
        }
      });

      optionsWrapper.appendChild(card);
    });
  }

  const nextBtn = document.getElementById("runner-next-btn");
  if (systemState.currentQuestionIndex === systemState.shuffledQuestions.length - 1) {
    nextBtn.innerHTML = `إنهاء الامتحان وتسليم النتيجة <span class="material-icons">send</span>`;
    nextBtn.setAttribute("aria-label", "إنهاء الامتحان وتسليم النتيجة");
  } else {
    nextBtn.innerHTML = `السؤال التالي <span class="material-icons">arrow_back</span>`;
    nextBtn.setAttribute("aria-label", "الانتقال للسؤال التالي");
  }
}

function selectRunnerOption(index) {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  systemState.studentAnswers[currentQ.id] = index;

  const cards = document.querySelectorAll("#runner-options-list .option-card");
  cards.forEach(card => {
    if (parseInt(card.dataset.index) === index) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    } else {
      card.classList.remove("selected");
      card.setAttribute("aria-pressed", "false");
    }
  });
}

function startRunnerTimer() {
  systemState.timer.timeRemaining = systemState.timer.timeLimit;
  updateRunnerTimerUI();

  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const fillCircle = document.getElementById("runner-timer-circle");
  const container = document.getElementById("runner-timer-container");
  
  fillCircle.style.strokeDashoffset = 0;
  container.classList.remove("timer-warning");

  systemState.timer.intervalId = setInterval(() => {
    systemState.timer.timeRemaining--;
    updateRunnerTimerUI();

    if (systemState.timer.timeRemaining <= 10) {
      container.classList.add("timer-warning");
    }

    if (systemState.timer.timeRemaining <= 0) {
      clearInterval(systemState.timer.intervalId);
      const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
      if (systemState.studentAnswers[currentQ.id] === undefined) {
        if (currentQ.type === "essay") {
          systemState.studentAnswers[currentQ.id] = "(لم يتم كتابة إجابة - انتهى الوقت)";
        } else {
          systemState.studentAnswers[currentQ.id] = -1;
        }
      }
      runnerNextQuestion(true);
    }
  }, 1000);
}

function updateRunnerTimerUI() {
  document.getElementById("runner-timer-text").innerText = systemState.timer.timeRemaining;
  const fillCircle = document.getElementById("runner-timer-circle");
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = systemState.timer.timeRemaining / systemState.timer.timeLimit;
  fillCircle.style.strokeDashoffset = circumference - (progress * circumference);

  // إعلانات صوتية للمكفوفين عبر Aria-Live Assertive لتفادي التحديث المتكرر
  const announcementEl = document.getElementById("runner-voice-announcement");
  if (announcementEl) {
    if (systemState.timer.timeRemaining === 30) {
      announcementEl.innerText = "انتبه، متبقي ثلاثون ثانية فقط للإجابة.";
    } else if (systemState.timer.timeRemaining === 10) {
      announcementEl.innerText = "تحذير، متبقي عشر ثوانٍ وينتقل الامتحان تلقائياً.";
    } else if (systemState.timer.timeRemaining === 5) {
      announcementEl.innerText = "خمس ثوانٍ متبقية.";
    }
  }
}

function runnerNextQuestion(isAuto = false) {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  
  if (!isAuto && systemState.studentAnswers[currentQ.id] === undefined) {
    alert("يرجى اختيار إجابة أو كتابة النص المطلوب قبل الانتقال!");
    return;
  }

  clearInterval(systemState.timer.intervalId);

  if (systemState.currentQuestionIndex < systemState.shuffledQuestions.length - 1) {
    systemState.currentQuestionIndex++;
    renderRunnerQuestion();
    startRunnerTimer();
  } else {
    submitFinishedExam();
  }
}

// حساب وتوثيق النتيجة مع هيكل الدرجات النسبية المطور
function submitFinishedExam() {
  systemState.isExamActive = false;
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  let totalEarnedPoints = 0;   // مجموع النقاط التي حصل عليها الطالب
  let totalObjectivePoints = 0; // مجموع النقاط القصوى للأسئلة الموضوعية
  let totalEssayPoints = 0;     // مجموع النقاط القصوى للأسئلة المقالية
  
  let objectiveQuestionsCount = 0;
  let correctObjectiveCount = 0;

  let hasEssay = false;
  let detailsLog = [];
  
  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};

  systemState.shuffledQuestions.forEach(q => {
    const studentAns = studentAnswersMap[q.id];
    const qPoints = q.points !== undefined ? q.points : 10; // الوزن الفردي
    
    if (q.type === "essay") {
      hasEssay = true;
      totalEssayPoints += qPoints;
      const ansText = studentAns || "(لم يكتب الطالب إجابة)";
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} \n إجابة الطالب: ${ansText}\n-----------------`);
      questionScoresMap[q.id] = 0; // يبدأ بـ 0 حتى يصححه المعلم يدوياً
    } else {
      objectiveQuestionsCount++;
      totalObjectivePoints += qPoints;
      
      const isCorrect = studentAns === q.correctAnswer;
      if (isCorrect) {
        correctObjectiveCount++;
        totalEarnedPoints += qPoints; // إضافة الوزن
        questionScoresMap[q.id] = qPoints;
      } else {
        questionScoresMap[q.id] = 0;
      }
      let studentAnsText = "لم تتم الإجابة";
      if (studentAns === -1) studentAnsText = "انتهى الوقت";
      else if (studentAns === -2) studentAnsText = "ملغي (غش)";
      else if (studentAns !== undefined) studentAnsText = q.options[studentAns];

      detailsLog.push(`س (وزنها ${qPoints} نقاط): ${q.question} | إجابة الطالب: ${studentAnsText} | الصحيحة: ${q.options[q.correctAnswer]} [${isCorrect ? '✓' : '✗'}]`);
    }
  });

  const exam = systemState.currentExam;
  const examTotalScore = exam.totalScore || 100; // المجموع النهائي

  // معادلة حساب الدرجات المحدثة:
  // الدرجة النسبية المحققة = (مجموع نقاط الطالب المحرزة / مجموع نقاط الأسئلة الموضوعية الإجمالي) * المجموع النهائي الكلي
  let scaledScore = 0;
  if (totalObjectivePoints > 0) {
    scaledScore = (totalEarnedPoints / totalObjectivePoints) * examTotalScore;
    // تقريب الناتج لكسر عشري خفيف
    scaledScore = Math.round(scaledScore * 100) / 100;
  }

  // صياغة درجة الطالب
  let scoreString = `${correctObjectiveCount}/${objectiveQuestionsCount} أسئلة موضوعية (تعادل ${scaledScore} من ${examTotalScore} كحد أقصى)`;
  if (hasEssay) {
    scoreString += ` + أسئلة مقالية بقيمة ${totalEssayPoints} نقاط بانتظار تصحيح المعلم`;
  }

  const detailsFormatted = detailsLog.join("\n");

  const resultObj = {
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode,
    examTitle: systemState.currentExam.title,
    examId: systemState.currentExam.id,
    university: systemState.currentExam.university,
    faculty: systemState.currentExam.faculty,
    level: systemState.currentExam.level,
    examType: systemState.currentExam.examType,
    score: scoreString,
    details: detailsFormatted,
    timestamp: new Date().toLocaleString("ar-EG"),
    studentAnswers: studentAnswersMap,
    questionScores: questionScoresMap
  };

  systemState.results.push(resultObj);
  localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));

  sendResultToGoogleSheets(scoreString, detailsFormatted);
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
}

function showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore) {
  navigateToView("student-result-view");
  
  const scoreNumEl = document.getElementById("runner-res-score");
  const totalEl = document.getElementById("runner-res-total");
  
  scoreNumEl.innerText = scaledScore;
  totalEl.innerText = examTotalScore;

  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id;
  document.getElementById("runner-res-title").innerText = `${systemState.currentExam.title} [${systemState.currentExam.examType}]`;

  const statusEl = document.getElementById("runner-res-status");
  if (hasEssay) {
    statusEl.innerText = `تم حفظ إجابتك بنجاح! نتيجتك في الأسئلة الموضوعية هي: ${scaledScore} من ${examTotalScore}. بانتظار مراجعة وتصحيح المعلم للأسئلة المقالية المتبقية.`;
    statusEl.style.color = "var(--accent)";
  } else {
    if (scaledScore >= (examTotalScore / 2)) {
      statusEl.innerText = `تهانينا، لقد اجتزت الامتحان بنجاح وحققت: ${scaledScore} من المجموع النهائي البالغ ${examTotalScore} درجات.`;
      statusEl.style.color = "var(--secondary)";
    } else {
      statusEl.innerText = `للأسف، لم تجتز النسبة المطلوبة. درجتك هي: ${scaledScore} من ${examTotalScore} درجات. حاول مجدداً!`;
      statusEl.style.color = "var(--error)";
    }
  }
}

// المزامنة مع جوجل شيتس (تدعم Web Apps ونماذج جوجل)
function sendResultToGoogleSheets(scoreString, details) {
  const config = systemState.config;
  const statusEl = document.getElementById("runner-res-sync-status");
  
  if (!config.googleFormUrl) {
    if (statusEl) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> تم حفظ النتيجة على المنصة محلياً (المزامنة مع جوجل غير مفعلة)`;
    }
    return;
  }

  if (statusEl) {
    statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري ترحيل نتيجتك ومزامنتها مع Google Sheets...`;
  }

  // التحقق إن كان الرابط هو Google Web App (ينتهي بـ /exec أو يحتوي على macros/s)
  const isWebApp = config.googleFormUrl.includes("/macros/s/") || config.googleFormUrl.endsWith("/exec");

  if (isWebApp) {
    // ترحيل مباشر عبر Google Apps Script Web App (JSON POST)
    const payload = {
      timestamp: new Date().toLocaleString("ar-EG"),
      name: systemState.currentStudent.name,
      id: systemState.currentStudent.id,
      subscriptionCode: systemState.currentStudent.accessCode,
      examTitle: systemState.currentExam.title,
      score: scoreString,
      details: details
    };

    fetch(config.googleFormUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(() => {
      if (statusEl) {
        statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تم إرسال ومزامنة النتيجة مع Google Sheets بنجاح!`;
      }
    })
    .catch(err => {
      console.error("خطأ مزامنة Apps Script:", err);
      if (statusEl) {
        statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> فشل المزامنة السحابية. تم الاكتفاء بالحفظ المحلي للنتائج.`;
      }
    });
  } else {
    // ترحيل تقليدي عبر نموذج جوجل فورم
    const formData = new URLSearchParams();
    formData.append(config.entryName, systemState.currentStudent.name);
    formData.append(config.entryId, systemState.currentStudent.id);
    
    const fullMeta = `${systemState.currentExam.title} | ${systemState.currentExam.university} | ${systemState.currentExam.faculty} | ${systemState.currentExam.level} | ${systemState.currentExam.examType} [كود: ${systemState.currentStudent.accessCode}]`;
    
    formData.append(config.entryCode, fullMeta);
    formData.append(config.entryScore, scoreString);
    formData.append(config.entryDetails, details);

    fetch(config.googleFormUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    })
    .then(() => {
      if (statusEl) {
        statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تم إرسال ومزامنة النتيجة مع Google Sheets بنجاح!`;
      }
    })
    .catch(err => {
      console.error("خطأ ربط جوجل شيتس:", err);
      if (statusEl) {
        statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> فشل الإرسال السحابي. تم الاكتفاء بالحفظ المحلي للنتائج.`;
      }
    });
  }
}

// الاستعلام عن نتائج الطلاب بالاسم، المعرف، أو كود الاشتراك الموزع
function searchStudentResults() {
  const query = document.getElementById("search-student-query").value.trim().toLowerCase();

  if (!query) {
    alert("يرجى إدخال اسمك بالكامل، رقم هويتك ID، أو كود اشتراكك للبحث!");
    return;
  }

  const matched = systemState.results.filter(res => {
    const nameMatch = res.name && res.name.toLowerCase().includes(query);
    const idMatch = res.id && res.id.toLowerCase() === query;
    const codeMatch = res.accessCode && res.accessCode.toLowerCase() === query;
    return nameMatch || idMatch || codeMatch;
  });

  const listContainer = document.getElementById("student-search-results-list");
  listContainer.innerHTML = "";

  if (matched.length === 0) {
    listContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);">لم يتم العثور على أي نتائج مسجلة تطابق بيانات البحث المدخلة.</div>`;
    return;
  }

  matched.forEach(res => {
    const card = document.createElement("div");
    card.className = "result-query-card";
    
    // إتاحة للطلاب المكفوفين
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "article");
    card.setAttribute("aria-label", `امتحان ${res.examTitle} بنتيجة ${res.score}`);

    card.innerHTML = `
      <div>
        <div class="result-query-title">${res.examTitle} (${res.examType})</div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
          الكلية/الجامعة: ${res.faculty} | ${res.university} \\ تاريخ التقديم: ${res.timestamp} \\ كود الاشتراك: ${res.accessCode || 'لا يوجد'}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap: 1rem;">
        <span style="font-size:1.1rem; font-weight:800; color:var(--secondary);">${res.score}</span>
        <button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="viewResultDetailQuery('${res.id}', '${res.examId}')">عرض الإجابات</button>
      </div>
    `;
    listContainer.appendChild(card);
  });
}

window.viewResultDetailQuery = function(studentId, examId) {
  const result = systemState.results.find(r => r.id === studentId && r.examId === examId);
  if (result) {
    alert(`تفاصيل اختبارك الأكاديمي [${result.examTitle}]:\n\n${result.details}`);
  }
};

function renderStudentResultsTable() {
  const tbody = document.getElementById("teacher-results-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (systemState.results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">لا توجد سجلات مسجلة للطلاب حتى الآن.</td></tr>`;
    return;
  }

  const sorted = [...systemState.results].reverse();

  sorted.forEach(res => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${res.name}</td>
      <td><code>${res.id}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${res.accessCode || "لا يوجد"}</span></td>
      <td>${res.examTitle} (${res.level || 'عام'})</td>
      <td style="font-weight:700; color:var(--secondary);">${res.score}</td>
      <td>${res.timestamp}</td>
      <td><button class="btn btn-outline btn-sm" onclick="viewTeacherResultDetail('${res.id}', '${res.examId}')">عرض</button></td>
    `;
    tbody.appendChild(row);
  });
}

window.viewTeacherResultDetail = function(id, examId) {
  const res = systemState.results.find(r => r.id === id && r.examId === examId);
  if (!res) return;

  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) {
    alert("عذراً، لم يتم العثور على الامتحان المرتبط بهذه النتيجة في قاعدة البيانات حالياً (قد يكون تم حذفه).");
    return;
  }

  systemState.currentGradingResult = res;
  systemState.currentGradingExam = exam;

  const panel = document.getElementById("teacher-result-detail-panel");
  if (panel) {
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById("detail-student-name").innerText = res.name;
  document.getElementById("detail-stu-name").innerText = res.name;
  document.getElementById("detail-stu-id").innerText = res.id;
  document.getElementById("detail-stu-code").innerText = res.accessCode || "لا يوجد";
  document.getElementById("detail-exam-title").innerText = res.examTitle;
  document.getElementById("detail-exam-date").innerText = res.timestamp;
  document.getElementById("detail-total-score-input").value = res.score;

  if (!res.studentAnswers) res.studentAnswers = {};
  if (!res.questionScores) res.questionScores = {};

  const container = document.getElementById("detail-questions-container");
  if (!container) return;
  container.innerHTML = "";

  exam.questions.forEach((q, index) => {
    const studentAns = res.studentAnswers[q.id];
    
    // تهيئة الدرجة إذا كانت فارغة للموضوعي
    if (q.type !== "essay" && res.questionScores[q.id] === undefined) {
      res.questionScores[q.id] = (studentAns === q.correctAnswer) ? (q.points || 10) : 0;
    }

    const qPoints = q.points !== undefined ? q.points : 10;
    const currentScore = res.questionScores[q.id] !== undefined ? res.questionScores[q.id] : 0;

    const qCard = document.createElement("div");
    qCard.className = "exam-builder-card";
    qCard.style.background = "rgba(255,255,255,0.01)";
    qCard.style.border = "1px solid var(--border-color)";
    qCard.style.padding = "1.25rem";
    qCard.style.borderRadius = "8px";

    let questionTypeName = "اختيار من متعدد";
    if (q.type === "boolean") questionTypeName = "صواب وخطأ";
    if (q.type === "essay") questionTypeName = "سؤال مقالي";

    qCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:0.5rem;">
        <span style="font-weight:700; color:var(--secondary);">سؤال ${index + 1} (${questionTypeName})</span>
        <span style="font-size:0.85rem; color:var(--text-muted);">وزن السؤال: ${qPoints} درجة</span>
      </div>
      <div style="font-size:1.1rem; color:white; margin-bottom:1rem; font-weight:600; line-height:1.6;">${q.question}</div>
    `;

    const body = document.createElement("div");

    if (q.type === "essay") {
      const textarea = document.createElement("textarea");
      textarea.className = "essay-textarea edit-student-ans";
      textarea.style.minHeight = "80px";
      textarea.style.marginBottom = "0.75rem";
      textarea.value = studentAns || "";
      textarea.dataset.qId = q.id;

      const scoreRow = document.createElement("div");
      scoreRow.style.display = "flex";
      scoreRow.style.alignItems = "center";
      scoreRow.style.gap = "0.5rem";
      scoreRow.innerHTML = `
        <label style="color:var(--text-muted); font-size:0.9rem;">الدرجة المستحقة للطالب:</label>
        <input type="number" class="form-control edit-student-q-score" data-q-id="${q.id}" value="${currentScore}" max="${qPoints}" min="0" style="width:100px; padding:0.4rem 0.8rem;">
        <span style="font-size:0.85rem; color:var(--text-muted);">من ${qPoints} درجات كحد أقصى</span>
      `;

      body.appendChild(textarea);
      body.appendChild(scoreRow);
    } else {
      const select = document.createElement("select");
      select.className = "form-control edit-student-ans";
      select.style.marginBottom = "0.75rem";
      select.style.appearance = "none";
      select.dataset.qId = q.id;

      const optUnanswered = document.createElement("option");
      optUnanswered.value = "-1";
      optUnanswered.innerText = "لم يتم الإجابة (انتهى الوقت)";
      if (studentAns === -1 || studentAns === undefined) optUnanswered.selected = true;
      select.appendChild(optUnanswered);

      const optCheated = document.createElement("option");
      optCheated.value = "-2";
      optCheated.innerText = "ملغي (محاولة غش)";
      if (studentAns === -2) optCheated.selected = true;
      select.appendChild(optCheated);

      q.options.forEach((optText, oIdx) => {
        const option = document.createElement("option");
        option.value = oIdx;
        option.innerText = optText;
        if (studentAns === oIdx) option.selected = true;
        select.appendChild(option);
      });

      const indicator = document.createElement("div");
      indicator.style.fontSize = "0.9rem";
      indicator.style.marginBottom = "0.75rem";
      
      const isCorrect = (studentAns === q.correctAnswer);
      if (isCorrect) {
        indicator.innerHTML = `<span style="color:var(--secondary); font-weight:700;"><span class="material-icons" style="font-size:1.1rem; vertical-align:middle;">check_circle</span> إجابة الطالب صحيحة</span>`;
      } else {
        const correctText = q.options[q.correctAnswer] || "";
        indicator.innerHTML = `<span style="color:var(--error); font-weight:700;"><span class="material-icons" style="font-size:1.1rem; vertical-align:middle;">cancel</span> إجابة الطالب خاطئة</span> (الإجابة النموذجية: ${correctText})`;
      }

      const scoreRow = document.createElement("div");
      scoreRow.style.display = "flex";
      scoreRow.style.alignItems = "center";
      scoreRow.style.gap = "0.5rem";
      scoreRow.innerHTML = `
        <label style="color:var(--text-muted); font-size:0.9rem;">الدرجة المستحقة للطالب:</label>
        <input type="number" class="form-control edit-student-q-score" data-q-id="${q.id}" value="${currentScore}" max="${qPoints}" min="0" style="width:100px; padding:0.4rem 0.8rem;">
        <span style="font-size:0.85rem; color:var(--text-muted);">من ${qPoints} درجات</span>
      `;

      select.addEventListener("change", (e) => {
        const val = parseInt(e.target.value);
        const scoreInput = scoreRow.querySelector(".edit-student-q-score");
        if (scoreInput) {
          if (val === q.correctAnswer) {
            scoreInput.value = qPoints;
          } else {
            scoreInput.value = 0;
          }
        }
      });

      body.appendChild(select);
      body.appendChild(indicator);
      body.appendChild(scoreRow);
    }

    qCard.appendChild(body);
    container.appendChild(qCard);
  });
};

window.closeResultDetailPanel = function() {
  const panel = document.getElementById("teacher-result-detail-panel");
  if (panel) panel.classList.add("hidden");
  systemState.currentGradingResult = null;
  systemState.currentGradingExam = null;
};

window.saveTotalScoreManual = function() {
  const res = systemState.currentGradingResult;
  if (!res) return;

  const inputVal = document.getElementById("detail-total-score-input").value.trim();
  if (!inputVal) {
    alert("يرجى إدخال قيمة النتيجة أولاً!");
    return;
  }

  res.score = inputVal;
  localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
  renderStudentResultsTable();
  alert("تم تعديل النتيجة الإجمالية بنجاح!");
};

window.saveResultDetailsManual = function() {
  const res = systemState.currentGradingResult;
  const exam = systemState.currentGradingExam;
  if (!res || !exam) return;

  const ansInputs = document.querySelectorAll("#detail-questions-container .edit-student-ans");
  const scoreInputs = document.querySelectorAll("#detail-questions-container .edit-student-q-score");

  const newAnswers = {};
  const newScores = {};
  let totalEarnedPoints = 0;
  let detailsLog = [];

  ansInputs.forEach(input => {
    const qId = parseInt(input.dataset.qId);
    const q = exam.questions.find(quest => quest.id === qId);
    if (q.type === "essay") {
      newAnswers[qId] = input.value;
    } else {
      newAnswers[qId] = parseInt(input.value);
    }
  });

  scoreInputs.forEach(input => {
    const qId = parseInt(input.dataset.qId);
    const val = parseFloat(input.value) || 0;
    newScores[qId] = val;
    totalEarnedPoints += val;
  });

  res.studentAnswers = newAnswers;
  res.questionScores = newScores;

  exam.questions.forEach(q => {
    const ans = newAnswers[q.id];
    const score = newScores[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;

    if (q.type === "essay") {
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} \n إجابة الطالب: ${ans || "(لم يكتب الطالب إجابة)"}\n [درجة السؤال المعدلة: ${score} من ${qPoints}]\n-----------------`);
    } else {
      let studentAnsText = "لم تتم الإجابة";
      if (ans === -1) studentAnsText = "انتهى الوقت";
      else if (ans === -2) studentAnsText = "ملغي (غش)";
      else if (ans !== undefined && q.options[ans]) studentAnsText = q.options[ans];

      const isCorrect = (ans === q.correctAnswer);
      detailsLog.push(`س (وزنها ${qPoints} نقاط): ${q.question} | إجابة الطالب: ${studentAnsText} | الصحيحة: ${q.options[q.correctAnswer]} [درجة السؤال المعدلة: ${score} من ${qPoints}]`);
    }
  });

  res.details = detailsLog.join("\n");

  const manualTotalInput = document.getElementById("detail-total-score-input").value.trim();
  res.score = manualTotalInput || `${totalEarnedPoints}/${exam.totalScore || 100} (درجة كلية)`;

  localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
  
  renderStudentResultsTable();
  closeResultDetailPanel();
  alert("تم حفظ كافة التعديلات، إجابات الطالب، والدرجات يدوياً بنجاح!");
};

function exportTeacherResultsToCSV() {
  if (systemState.results.length === 0) {
    alert("لا توجد سجلات لتصديرها!");
    return;
  }

  let csvContent = "\ufeff";
  csvContent += "اسم الطالب,رقم ID,الجامعة,الكلية,الفرقة,الامتحان,النوع,النتيجة,التاريخ والوقت\n";

  systemState.results.forEach(res => {
    csvContent += `"${res.name}","${res.id}","${res.university || 'عام'}","${res.faculty || 'عام'}","${res.level || 'عام'}","${res.examTitle}","${res.examType || 'أعمال سنة'}","${res.score}","${res.timestamp}"\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `نتائج_arabya_الأكاديمية_${new Date().toLocaleDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function clearTeacherResults() {
  if (confirm("هل أنت متأكد من رغبتك في حذف جميع نتائج وسجلات الطلاب نهائياً؟ (لا يمكن التراجع عن ذلك)")) {
    systemState.results = [];
    localStorage.removeItem("arabya_results_db");
    renderStudentResultsTable();
    alert("تم مسح كافة سجلات الطلاب بنجاح!");
  }
}

// ==========================================
// 9. آليات منع الغش وتأمين النوافذ
// ==========================================

function setupAntiCheatHandlers() {
  window.addEventListener("blur", () => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      triggerRunnerCheatPenalty("blur");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && systemState.isExamActive && !systemState.isCheatingSuspended) {
      triggerRunnerCheatPenalty("visibility");
    }
  });

  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("copy", e => e.preventDefault());
  document.addEventListener("cut", e => e.preventDefault());
  document.addEventListener("paste", e => e.preventDefault());

  document.addEventListener("keydown", e => {
    if (
      e.key === "F12" || 
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c" || e.key === "K" || e.key === "k" || e.key === "E" || e.key === "e")) ||
      (e.ctrlKey && (e.key === "U" || e.key === "u" || e.key === "S" || e.key === "s"))
    ) {
      e.preventDefault();
      alert("حظر: غير مصرح بفتح أدوات المطور أو حفظ الصفحة أثناء الامتحان!");
      return false;
    }

    if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      alert("حظر: غير مسموح بالطباعة لحماية سرية الأسئلة!");
      return false;
    }

    if (e.key === "PrintScreen" || e.keyCode === 44) {
      e.preventDefault();
      if (systemState.isExamActive && !systemState.isCheatingSuspended) {
        triggerRunnerCheatPenalty("screenshot");
      }
      return false;
    }
  });
}

function triggerRunnerCheatPenalty(reason) {
  systemState.isCheatingSuspended = true;
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  // زيادة عدد الانتهاكات
  systemState.cheatViolations++;

  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  if (currentQ.type === "essay") {
    systemState.studentAnswers[currentQ.id] = "(ملغي - تم كشف محاولة غش/تصوير)";
  } else {
    systemState.studentAnswers[currentQ.id] = -2;
  }

  const overlay = document.getElementById("runner-cheat-overlay");
  const mainWrapper = document.getElementById("app-main-wrapper");

  mainWrapper.classList.add("blurred-content");
  overlay.classList.remove("hidden");

  const msg = document.getElementById("runner-cheat-msg");
  
  if (systemState.cheatViolations >= 2) {
    // الانتهاك الثاني -> إلغاء الامتحان بالكامل فوراً وتصفير الدرجة
    msg.innerHTML = `
      <span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان وتصفير النتيجة!</span>
      لقد قمت بمحاولة الغش أو الخروج من صفحة الامتحان للمرة الثانية متجاوزاً الحد المسموح به. تم إنهاء اختبارك نهائياً وحرمانك من التقديم.
    `;
    
    // تصفير جميع درجات الأسئلة وتعيينها كغش
    systemState.shuffledQuestions.forEach(q => {
      if (systemState.studentAnswers[q.id] === undefined) {
        if (q.type === "essay") {
          systemState.studentAnswers[q.id] = "(ملغي - غش متكرر)";
        } else {
          systemState.studentAnswers[q.id] = -2;
        }
      }
    });

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      systemState.isExamActive = false;
      
      // توثيق وحفظ النتيجة كـ "راسب/ملغي بسبب الغش"
      submitCheatedExam();
    }, 4500);
    
  } else {
    // الانتهاك الأول -> تحذير وإلغاء السؤال الحالي فقط
    if (reason === "screenshot") {
      msg.innerHTML = `
        <span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير أول (تصوير شاشة)</span>
        لقد حاولت التقاط لقطة شاشة للامتحان! تم إلغاء السؤال الحالي وتصفير درجته. انتبه: أي محاولة أخرى ستؤدي لإلغاء الامتحان بالكامل تلقائياً!
      `;
    } else {
      msg.innerHTML = `
        <span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير أول (خروج من الصفحة)</span>
        لقد حاولت الخروج من صفحة أو تبويب الامتحان! تم إلغاء السؤال الحالي وتصفير درجته. انتبه: أي محاولة أخرى ستؤدي لإلغاء الامتحان بالكامل تلقائياً!
      `;
    }

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      runnerNextQuestion(true);
    }, 4000);
  }
}

function submitCheatedExam() {
  const exam = systemState.currentExam;
  const examTotalScore = exam.totalScore || 100;
  const scoreString = `0 / ${examTotalScore} (ملغي - غش متكرر)`;
  const detailsFormatted = "تم إلغاء الامتحان وتصفير النتيجة نهائياً لمخالفة تعليمات الاختبار وتكرار محاولة الغش أو الخروج من الصفحة.";

  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};
  exam.questions.forEach(q => {
    questionScoresMap[q.id] = 0;
  });

  const resultObj = {
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode,
    examTitle: systemState.currentExam.title,
    examId: systemState.currentExam.id,
    university: systemState.currentExam.university,
    faculty: systemState.currentExam.faculty,
    level: systemState.currentExam.level,
    examType: systemState.currentExam.examType,
    score: scoreString,
    details: detailsFormatted,
    timestamp: new Date().toLocaleString("ar-EG"),
    studentAnswers: studentAnswersMap,
    questionScores: questionScoresMap
  };

  systemState.results.push(resultObj);
  localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));

  sendResultToGoogleSheets(scoreString, detailsFormatted);
  
  // الانتقال لصفحة النتيجة مع تخصيص المظهر للغش
  navigateToView("student-result-view");
  document.getElementById("runner-res-score").innerText = "0";
  document.getElementById("runner-res-total").innerText = examTotalScore;
  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id;
  document.getElementById("runner-res-title").innerText = `${systemState.currentExam.title} [${systemState.currentExam.examType}]`;
  
  const statusEl = document.getElementById("runner-res-status");
  statusEl.innerText = "للأسف، تم إلغاء اختبارك وتصفير النتيجة نهائياً بسبب رصد محاولات غش متكررة أو الخروج من صفحة الاختبار.";
  statusEl.style.color = "var(--error)";
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// تسجيل حساب طالب جديد من قبل الطالب
function handleStudentRegister() {
  const fullname = document.getElementById("student-reg-fullname").value.trim();
  const id = document.getElementById("student-reg-id").value.trim();
  const code = document.getElementById("student-reg-code").value.trim();

  if (!fullname || !id || !code) {
    alert("يرجى ملء جميع الحقول الإلزامية للتسجيل!");
    return;
  }

  // فحص عدم تكرار الـ ID في قاعدة البيانات
  const isDuplicate = systemState.students.some(s => s.id === id);
  if (isDuplicate) {
    alert("رقم المعرف (ID) هذا مسجل بالفعل لطالب آخر! يرجى التواصل مع المعلم إذا واجهتك مشكلة.");
    return;
  }

  const newStudent = {
    name: fullname,
    id: id,
    code: code,
    timestamp: new Date().toLocaleDateString("ar-EG")
  };

  systemState.students.push(newStudent);
  saveStudentsToLocalStorage();

  alert(`تم تسجيل حسابك بنجاح يا ${fullname}! يمكنك الآن تسجيل الدخول مباشرة للبدء.`);
  navigateToView("student-login-view");

  // تعبئة البيانات تلقائياً
  document.getElementById("student-fullname-input").value = fullname;
  document.getElementById("student-id-input").value = id;
  document.getElementById("student-access-code").value = code;
}

// إعداد الإكمال والتعبئة التلقائية لبيانات الطالب
function setupStudentAutofill() {
  const codeInput = document.getElementById("student-access-code");
  const idInput = document.getElementById("student-id-input");
  const nameInput = document.getElementById("student-fullname-input");

  if (!idInput || !codeInput || !nameInput) return;

  function autofillIfMatched() {
    const idVal = idInput.value.trim();
    const codeVal = codeInput.value.trim();

    if (idVal || codeVal) {
      const matched = systemState.students.find(s => 
        (idVal && s.id === idVal) || 
        (codeVal && s.code === codeVal)
      );

      if (matched) {
        if (!idInput.value) idInput.value = matched.id;
        if (!codeInput.value) codeInput.value = matched.code;
        if (!nameInput.value) nameInput.value = matched.name;
      }
    }
  }

  idInput.addEventListener("blur", autofillIfMatched);
  codeInput.addEventListener("blur", autofillIfMatched);
}

// عرض قائمة الطلاب وأكوادهم في لوحة المعلم
function renderTeacherStudentsTable() {
  const tbody = document.getElementById("teacher-students-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (systemState.students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem;">لا يوجد طلاب مسجلين حالياً.</td></tr>`;
    return;
  }

  // عرض أحدث الطلاب المسجلين في الأعلى
  const reversed = [...systemState.students].reverse();

  reversed.forEach(s => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.name}</td>
      <td><code>${s.id}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${s.code}</span></td>
      <td>${s.timestamp || 'غير معروف'}</td>
      <td>
        <button class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary); padding: 0.25rem 0.5rem; margin-left:0.25rem;" onclick="editStudentByTeacher('${s.id}')">تعديل</button>
        <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error); padding: 0.25rem 0.5rem;" onclick="deleteStudentByTeacher('${s.id}')">حذف</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// إظهار بطاقة إضافة طالب جديد
window.showAddStudentModal = function() {
  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.remove("hidden");
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تسجيل حساب طالب جديد في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ الطالب والرمز";
  }
  systemState.editingStudentId = null;
};

// إخفاء بطاقة إضافة طالب جديد
window.hideAddStudentModal = function() {
  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.add("hidden");
    document.getElementById("new-student-name").value = "";
    document.getElementById("new-student-id").value = "";
    document.getElementById("new-student-code").value = "";
    
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تسجيل حساب طالب جديد في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ الطالب والرمز";
  }
  systemState.editingStudentId = null;
};

// حفظ طالب جديد أو تعديل بياناته من قبل المعلم
window.saveNewStudentByTeacher = function() {
  const name = document.getElementById("new-student-name").value.trim();
  const id = document.getElementById("new-student-id").value.trim();
  const code = document.getElementById("new-student-code").value.trim();

  if (!name || !id || !code) {
    alert("يرجى ملء جميع الحقول المطلوبة!");
    return;
  }

  // التحقق من أن الكود يتكون من 5 أرقام بالضبط
  const isFiveDigits = /^\d{5}$/.test(code);
  if (!isFiveDigits) {
    alert("عذراً، يجب أن يتكون كود الاشتراك من 5 أرقام فقط (أرقام فقط وبطول 5 خانات)!");
    return;
  }

  if (systemState.editingStudentId) {
    // تعديل بيانات طالب موجود
    const student = systemState.students.find(s => s.id === systemState.editingStudentId);
    if (student) {
      // التأكد من عدم تكرار الـ ID الجديد مع طالب آخر
      const isDuplicate = systemState.students.some(s => s.id === id && s.id !== systemState.editingStudentId);
      if (isDuplicate) {
        alert("رقم المعرف ID الجديد مسجل بالفعل لطالب آخر!");
        return;
      }
      student.name = name;
      student.id = id;
      student.code = code;
      saveStudentsToLocalStorage();
      renderTeacherStudentsTable();
      hideAddStudentModal();
      alert(`تم تعديل بيانات الطالب "${name}" بنجاح!`);
    }
  } else {
    // إضافة طالب جديد
    const isDuplicate = systemState.students.some(s => s.id === id);
    if (isDuplicate) {
      alert("رقم المعرف ID هذا مسجل بالفعل لطالب آخر!");
      return;
    }

    const studentObj = {
      name,
      id,
      code,
      timestamp: new Date().toLocaleDateString("ar-EG")
    };

    systemState.students.push(studentObj);
    saveStudentsToLocalStorage();
    renderTeacherStudentsTable();
    hideAddStudentModal();
    alert(`تم تسجيل الطالب "${name}" وكود اشتراكه بنجاح!`);
  }
};

// تعديل طالب من قبل المعلم
window.editStudentByTeacher = function(studentId) {
  const student = systemState.students.find(s => s.id === studentId);
  if (!student) return;

  systemState.editingStudentId = studentId;

  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.remove("hidden");
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تعديل بيانات حساب الطالب في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ التعديلات";
  }

  document.getElementById("new-student-name").value = student.name;
  document.getElementById("new-student-id").value = student.id;
  document.getElementById("new-student-code").value = student.code;
};

// حذف طالب بواسطة المعلم
window.deleteStudentByTeacher = function(id) {
  if (confirm("هل أنت متأكد من حذف هذا الطالب وإلغاء كود اشتراكه؟")) {
    systemState.students = systemState.students.filter(s => s.id !== id);
    saveStudentsToLocalStorage();
    renderTeacherStudentsTable();
  }
};

// تصدير الطلاب كملف JSON
window.exportStudentsToJSON = function() {
  if (systemState.students.length === 0) {
    alert("لا يوجد طلاب لتصديرهم!");
    return;
  }
  const blob = new Blob([JSON.stringify(systemState.students, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `طلاب_منصة_arabya_${new Date().toLocaleDateString()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// استيراد الطلاب من ملف JSON
window.importStudentsFromJSON = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        let addedCount = 0;
        parsed.forEach(stu => {
          if (stu.id && stu.name && stu.code) {
            const isDuplicate = systemState.students.some(s => s.id === stu.id);
            if (!isDuplicate) {
              systemState.students.push({
                name: stu.name,
                id: stu.id,
                code: stu.code,
                timestamp: stu.timestamp || new Date().toLocaleDateString("ar-EG")
              });
              addedCount++;
            }
          }
        });

        saveStudentsToLocalStorage();
        renderTeacherStudentsTable();
        alert(`تم استيراد عدد ${addedCount} حسابات طلاب بنجاح!`);
      } else {
        alert("تنسيق ملف الطلاب غير صحيح!");
      }
    } catch(err) {
      alert("خطأ في قراءة ملف الطلاب المرفوع!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

// ==========================================
// 10. وظيفة نسخ رابط الامتحان بنجاح وتوافقية
// ==========================================
window.copyExamLink = function(url) {
  if (!url) {
    alert("رابط الامتحان غير صالح!");
    return;
  }
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => {
        alert("تم نسخ رابط الامتحان بنجاح!");
      })
      .catch(err => {
        fallbackCopyTextToClipboard(url);
      });
  } else {
    fallbackCopyTextToClipboard(url);
  }
};

function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      alert("تم نسخ رابط الامتحان بنجاح!");
    } else {
      alert("فشل نسخ الرابط تلقائياً، يرجى نسخه يدوياً.");
    }
  } catch (err) {
    alert("حدث خطأ أثناء نسخ الرابط، يرجى نسخه يدوياً.");
  }

  document.body.removeChild(textArea);
}

// تصدير قاعدة البيانات كاملة كملف JSON
window.exportCompleteDatabase = function() {
  const dbBackup = {
    teachers: systemState.teachers,
    students: systemState.students,
    exams: systemState.exams,
    results: systemState.results
  };

  const blob = new Blob([JSON.stringify(dbBackup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `نسخة_احتياطية_كاملة_arabya_${new Date().toLocaleDateString("ar-EG")}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  alert("تم تصدير نسخة احتياطية كاملة من قاعدة البيانات بنجاح!");
};

// استعادة قاعدة البيانات بالكامل من ملف JSON
window.importCompleteDatabase = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data && (data.teachers || data.students || data.exams || data.results)) {
        if (confirm("تحذير: سيقوم هذا باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستوردة. هل ترغب في الاستمرار؟")) {
          if (data.teachers && Array.isArray(data.teachers)) {
            systemState.teachers = data.teachers;
            localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
          }
          if (data.students && Array.isArray(data.students)) {
            systemState.students = data.students;
            localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
          }
          if (data.exams && Array.isArray(data.exams)) {
            systemState.exams = data.exams;
            localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
          }
          if (data.results && Array.isArray(data.results)) {
            systemState.results = data.results;
            localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
          }
          
          alert("تم استعادة قاعدة البيانات بنجاح! سيتم إعادة تحميل الصفحة لتطبيق التغييرات.");
          location.reload();
        }
      } else {
        alert("تنسيق الملف الاحتياطي غير صحيح!");
      }
    } catch (err) {
      alert("خطأ في قراءة ملف النسخة الاحتياطية!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

// تسجيل خروج المعلم نهائياً وتنظيف الجلسة
window.logoutTeacher = function() {
  localStorage.removeItem("arabya_active_teacher_username");
  localStorage.removeItem("arabya_active_view");
  systemState.activeTeacher = null;
  location.reload();
};
