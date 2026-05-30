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
    accessCode: "",
    studentKey: "",
    email: "",
    mobile: ""
  },
  currentExam: null,
  currentExamRuntime: null,
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
  // ===== فحص localStorage قبل أي شيء =====
  try {
    localStorage.setItem("arabya_test", "ok");
    const t = localStorage.getItem("arabya_test");
    localStorage.removeItem("arabya_test");
    if (t !== "ok") throw new Error("localStorage read/write mismatch");
  } catch(lsErr) {
    alert("⚠️ تحذير: لا يمكن الوصول إلى ذاكرة التخزين المحلي (localStorage). قد يكون المتصفح في وضع التصفح الخاص أو تم تعطيل التخزين. لن يتم حفظ أي بيانات!");
    console.error("localStorage unavailable:", lsErr);
  }

  initDatabase();
  setupNavigation();
  setupUIEventListeners();
  setupAntiCheatHandlers();
  setupStudentAutofill();

  // ===== تشخيص ما تم تحميله =====
  console.log(`[ARABYA] تم تحميل قاعدة البيانات:`,
    `معلمون=${systemState.teachers.length}`,
    `امتحانات=${systemState.exams.length}`,
    `طلاب=${systemState.students.length}`,
    `نتائج=${systemState.results.length}`
  );

  // استعادة جلسة الطالب النشطة إن وجدت ومنع ضياع الإجابات
  const savedSession = localStorage.getItem("arabya_active_student_session");
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session && session.student && session.examId) {
        const resume = confirm(`وجدنا اختباراً غير مكتمل باسم "${session.student.name}". هل ترغب في استكماله من حيث توقفت؟`);
        if (resume) {
          systemState.currentStudent = session.student;
          const matchedExam = systemState.exams.find(e => e.id === session.examId);
          const resumeKey = session.student?.studentKey || getStudentLookupKey(session.student || {});
          const blocking = findBlockingExamResult(resumeKey, session.examId);
          if (blocking) {
            localStorage.removeItem("arabya_active_student_session");
            alert(blocking.status === "canceled"
              ? "لا يمكن استكمال هذا الامتحان لأنه مُلغى. تواصل مع المعلم."
              : "لا يمكن استكمال هذا الامتحان لأنه مُسلَّم مسبقاً.");
          } else if (matchedExam) {
            systemState.currentExam = matchedExam;
            systemState.shuffledQuestions = session.shuffledQuestions || buildRuntimeQuestionsForExam(matchedExam);
            systemState.currentExamRuntime = session.currentExamRuntime || calculateRuntimeExamMeta(systemState.shuffledQuestions);
            systemState.currentQuestionIndex = session.currentQuestionIndex || 0;
            systemState.studentAnswers = session.studentAnswers || {};
            systemState.cheatViolations = session.cheatViolations || 0;
            systemState.isExamActive = true;
            systemState.isCheatingSuspended = false;
            requestSecureExamMode();
            navigateToView("exam-runner-view");
            renderRunnerQuestion();
            startRunnerTimerWithTime(session.timeRemaining || 60);
            return;
          }
        } else {
          localStorage.removeItem("arabya_active_student_session");
        }
      }
    } catch(e) {
      localStorage.removeItem("arabya_active_student_session");
    }
  }
  
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
      // حفظ محلي فقط دون مزامنة سحابية أثناء التهيئة
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    } catch(e){}
  }
  
  const savedProfile = localStorage.getItem("arabya_teacher_profile");
  if (savedProfile && systemState.activeTeacher) {
    try { 
      const parsedProfile = JSON.parse(savedProfile);
      systemState.teacherProfile = parsedProfile;
      systemState.activeTeacher.name = parsedProfile.name;
      systemState.activeTeacher.subject = parsedProfile.subject;
      // حفظ محلي فقط دون مزامنة سحابية أثناء التهيئة
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    } catch(e){}
  }
  
  // 2. تهيئة قاعدة بيانات الامتحانات
  const savedExams = localStorage.getItem("arabya_exams_db");
  if (savedExams) {
    try {
      systemState.exams = JSON.parse(savedExams);
    } catch (e) {
      systemState.exams = []; // نبدأ بقائمة فارغة عند تلف البيانات
    }
  } else {
    systemState.exams = [];
  }

  // تحميل بنك الأسئلة الافتراضي مرة واحدة فقط حتى لا تظهر بوابة الطالب فارغة في أول تشغيل.
  const defaultsSeeded = localStorage.getItem("arabya_default_exams_seeded") === "yes";
  const sourceDefaults = typeof defaultExams !== "undefined" ? defaultExams : window.defaultExams;
  if (systemState.exams.length === 0 && !defaultsSeeded && Array.isArray(sourceDefaults)) {
    systemState.exams = sourceDefaults.map(exam => ({
      ...JSON.parse(JSON.stringify(exam)),
      teacher: exam.teacher || (systemState.activeTeacher ? systemState.activeTeacher.username : "معلم اللغة العربية"),
      timeLimit: exam.timeLimit || 60,
      shuffleQuestions: exam.shuffleQuestions !== false,
      questionCount: exam.questionCount || ""
    }));
    localStorage.setItem("arabya_default_exams_seeded", "yes");
  }
  ensureExamsDataShape();

  localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
  
  // 3. تهيئة نتائج الطلاب
  const savedResults = localStorage.getItem("arabya_results_db");
  if (savedResults) {
    try { systemState.results = JSON.parse(savedResults); } catch(e){}
  }
  ensureResultRecordIds();

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
      { name: "طالب تجريبي", id: "STU100", code: "00000", email: "", mobile: "", timestamp: new Date().toLocaleDateString("ar-EG") }
    ];
    localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
  }
}

// حفظ قاعدة بيانات المعلمين محلياً (دون مزامنة سحابية)
function saveTeachersToLocalStorage() {
  localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
}

// حفظ قاعدة بيانات الطلاب محلياً (دون مزامنة سحابية)
function saveStudentsToLocalStorage() {
  localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
}

// دالة موحدة لحفظ حالة النظام بالكامل ومزامنتها سحابياً
function saveSystemState(syncToCloud = true) {
  try {
    if (Array.isArray(systemState.teachers)) {
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    }
    if (Array.isArray(systemState.exams)) {
      localStorage.setItem("arabya_exams_db", JSON.stringify(systemState.exams));
    }
    if (Array.isArray(systemState.students)) {
      localStorage.setItem("arabya_students_db", JSON.stringify(systemState.students));
    }
    if (Array.isArray(systemState.results)) {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    }
  } catch(e) {
    console.error("saveSystemState: خطأ في حفظ البيانات محلياً:", e);
  }
  
  if (syncToCloud) {
    autoSyncToCloud();
  }
}

function createRecordId(prefix = "record") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureResultRecordIds() {
  let changed = false;
  systemState.results.forEach(res => {
    if (!res.recordId) {
      res.recordId = createRecordId("result");
      changed = true;
    }
  });
  if (changed) {
    try {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    } catch(e) {
      console.error("تعذر تحديث معرفات النتائج:", e);
    }
  }
}


function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim().toUpperCase();
}

function normalizeStudentName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeContactField(value) {
  return (value || "").toString().trim();
}

function sanitizeStudentCodeInput(code) {
  return (code || "").toString().replace(/\D/g, "").slice(0, 5);
}

function isFiveDigitStudentCode(code) {
  return /^\d{5}$/.test((code || "").toString());
}

function isSharedStudentCode(code) {
  return sanitizeStudentCodeInput(code) === "00000";
}

function isPrivateStudentCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  return isFiveDigitStudentCode(clean) && clean !== "00000";
}

function getStudentLookupKey(student) {
  const code = sanitizeStudentCodeInput(student?.code || student?.accessCode || "");
  if (isPrivateStudentCode(code)) {
    return `code:${code}`;
  }
  const normalizedId = normalizeStudentId(student?.id);
  if (normalizedId) {
    return `id:${normalizedId}`;
  }
  const normalizedName = normalizeStudentName(student?.name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function findStudentByCode(code) {
  const clean = sanitizeStudentCodeInput(code);
  if (!isFiveDigitStudentCode(clean)) return null;
  return systemState.students.find(student => sanitizeStudentCodeInput(student.code) === clean) || null;
}

function findStudentById(studentId) {
  const normalized = normalizeStudentId(studentId);
  if (!normalized) return null;
  return systemState.students.find(student => normalizeStudentId(student.id) === normalized) || null;
}

function findStudentByName(name) {
  const normalized = normalizeStudentName(name);
  if (!normalized) return null;
  return systemState.students.find(student => normalizeStudentName(student.name) === normalized) || null;
}

function ensureStudentsDataShape() {
  if (!Array.isArray(systemState.students)) {
    systemState.students = [];
    return;
  }
  systemState.students = systemState.students.map((student, index) => {
    const normalizedId = normalizeStudentId(student.id || "");
    const sanitizedCode = sanitizeStudentCodeInput(student.code || "");
    const normalizedCode = isFiveDigitStudentCode(sanitizedCode) ? sanitizedCode : "";
    const normalizedName = (student.name || "").toString().trim() || `طالب ${index + 1}`;
    const normalizedStudent = {
      ...student,
      name: normalizedName,
      id: normalizedId,
      code: normalizedCode,
      email: normalizeContactField(student.email),
      mobile: normalizeContactField(student.mobile),
      timestamp: student.timestamp || new Date().toLocaleDateString("ar-EG")
    };
    normalizedStudent.studentKey = normalizedStudent.studentKey || getStudentLookupKey(normalizedStudent) || createRecordId("student");
    return normalizedStudent;
  });
}

function sanitizeQuestionConfig(exam) {
  if (!exam || typeof exam !== "object") return;
  if (!Array.isArray(exam.questions)) {
    exam.questions = [];
  }
  if (typeof exam.shuffleQuestions !== "boolean") {
    exam.shuffleQuestions = true;
  }
  const parsedMaxCheat = parseInt(exam.maxCheatAttempts, 10);
  if (!Number.isFinite(parsedMaxCheat) || parsedMaxCheat < 0) {
    exam.maxCheatAttempts = 5;
  } else {
    exam.maxCheatAttempts = parsedMaxCheat;
  }
  const parsedCount = parseInt(exam.questionCount, 10);
  if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
    exam.questionCount = "";
  } else {
    exam.questionCount = parsedCount;
  }
}


function getExamMaxCheatAttempts(exam) {
  if (!exam) return 5;
  const parsed = parseInt(exam.maxCheatAttempts, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 5;
  return parsed;
}

function shouldCancelExamForCheating(exam, violations) {
  const maxAttempts = getExamMaxCheatAttempts(exam);
  if (maxAttempts === 0) return false;
  return violations >= maxAttempts;
}

function findBlockingExamResult(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  return systemState.results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}

function getStudentCanceledExamIds(studentLookupKey) {
  if (!studentLookupKey) return [];
  const ids = new Set();
  systemState.results.forEach(r => {
    if (r.studentLookupKey === studentLookupKey && r.status === "canceled" && r.allowRetake !== true && r.examId) {
      ids.add(r.examId);
    }
  });
  return [...ids];
}

function formatResultStatusBadge(res) {
  if (res.status === "canceled" && res.allowRetake !== true) {
    return '<span style="color:var(--error); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[تم إلغاء الامتحان]</span>';
  }
  if (res.status === "incomplete") {
    return '<span style="color:var(--warning); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[جاري]</span>';
  }
  return "";
}

function ensureExamsDataShape() {
  if (!Array.isArray(systemState.exams)) {
    systemState.exams = [];
    return;
  }
  systemState.exams.forEach(exam => sanitizeQuestionConfig(exam));
}

function getConfiguredQuestionCount(exam) {
  if (!exam) return null;
  const parsed = parseInt(exam.questionCount, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, Array.isArray(exam.questions) ? exam.questions.length : 0);
}

function buildRuntimeQuestionsForExam(exam) {
  const sourceQuestions = Array.isArray(exam?.questions) ? [...exam.questions] : [];
  if (!sourceQuestions.length) return [];
  const shouldShuffle = exam.shuffleQuestions !== false;
  const questionCount = getConfiguredQuestionCount(exam);
  const runtime = shouldShuffle ? shuffle([...sourceQuestions]) : sourceQuestions;
  if (questionCount) {
    return runtime.slice(0, questionCount);
  }
  return runtime;
}

function calculateRuntimeExamMeta(questions) {
  const questionList = Array.isArray(questions) ? questions : [];
  const maxScore = questionList.reduce((sum, question) => {
    const points = parseFloat(question?.points);
    return sum + (Number.isFinite(points) ? points : 10);
  }, 0);
  return { maxScore };
}

function getCurrentExamTotalScore() {
  if (systemState.currentExamRuntime && Number.isFinite(systemState.currentExamRuntime.maxScore)) {
    return systemState.currentExamRuntime.maxScore;
  }
  return systemState.currentExam?.totalScore || 100;
}

function upsertStudentRecord(source, fallbackKey = "") {
  const normalizedId = normalizeStudentId(source.id || "");
  const normalizedCode = sanitizeStudentCodeInput(source.code || source.accessCode || "");
  const normalizedStudent = {
    name: (source.name || "").toString().trim(),
    id: normalizedId,
    code: isFiveDigitStudentCode(normalizedCode) ? normalizedCode : "",
    email: normalizeContactField(source.email),
    mobile: normalizeContactField(source.mobile)
  };

  let existingStudent = null;
  if (isPrivateStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByCode(normalizedStudent.code);
  }
  if (!existingStudent && normalizedStudent.id) {
    existingStudent = findStudentById(normalizedStudent.id);
  }
  if (!existingStudent && normalizedStudent.name) {
    existingStudent = findStudentByName(normalizedStudent.name);
  }

  if (existingStudent) {
    existingStudent.name = normalizedStudent.name || existingStudent.name;
    existingStudent.id = normalizedStudent.id || existingStudent.id || "";
    existingStudent.code = normalizedStudent.code || existingStudent.code || "";
    existingStudent.email = normalizedStudent.email;
    existingStudent.mobile = normalizedStudent.mobile;
    existingStudent.timestamp = existingStudent.timestamp || new Date().toLocaleDateString("ar-EG");
    existingStudent.studentKey = existingStudent.studentKey || getStudentLookupKey(existingStudent) || fallbackKey || createRecordId("student");
    return existingStudent;
  }

  const newStudent = {
    name: normalizedStudent.name,
    id: normalizedStudent.id,
    code: normalizedStudent.code,
    email: normalizedStudent.email,
    mobile: normalizedStudent.mobile,
    timestamp: new Date().toLocaleDateString("ar-EG"),
    studentKey: fallbackKey || getStudentLookupKey(normalizedStudent) || createRecordId("student")
  };
  systemState.students.push(newStudent);
  return newStudent;
}

// ===== أداة التشخيص السريع - اكتب arabya_diagnose() في الكونسول =====
window.arabya_diagnose = function() {
  const teachers = JSON.parse(localStorage.getItem("arabya_teachers_db") || "[]");
  const exams    = JSON.parse(localStorage.getItem("arabya_exams_db") || "[]");
  const students = JSON.parse(localStorage.getItem("arabya_students_db") || "[]");
  const results  = JSON.parse(localStorage.getItem("arabya_results_db") || "[]");
  const report = {
    "💾 localStorage": {
      "معلمون (arabya_teachers_db)": teachers.length,
      "امتحانات (arabya_exams_db)": exams.length,
      "طلاب (arabya_students_db)": students.length,
      "نتائج (arabya_results_db)": results.length,
    },
    "🧠 systemState (RAM)": {
      "معلمون": systemState.teachers.length,
      "امتحانات": systemState.exams.length,
      "طلاب": systemState.students.length,
      "نتائج": systemState.results.length,
    },
    "🔗 رابط المزامنة": systemState.config?.googleFormUrl || "(غير مُعيَّن)",
    "📦 بيانات المعلم النشط": systemState.activeTeacher?.username || "(لا يوجد)"
  };
  console.table(report["💾 localStorage"]);
  console.table(report["🧠 systemState (RAM)"]);
  console.log("🔗 رابط المزامنة:", report["🔗 رابط المزامنة"]);
  console.log("👤 المعلم النشط:", report["📦 بيانات المعلم النشط"]);
  alert(`✅ التشخيص:\n\nمحلي: معلمون=${teachers.length} | امتحانات=${exams.length} | طلاب=${students.length} | نتائج=${results.length}\n\nذاكرة: معلمون=${systemState.teachers.length} | امتحانات=${systemState.exams.length} | طلاب=${systemState.students.length} | نتائج=${systemState.results.length}\n\nالمزامنة: ${systemState.config?.googleFormUrl || "(غير مُعيَّنة)"}`);
  return report;
};

// المزامنة التلقائية مع جوجل شيت
function autoSyncToCloud() {
  const urls = new Set();
  
  if (systemState.config && systemState.config.googleFormUrl) {
    const url = systemState.config.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    const url = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam.googleFormUrl) {
        const url = exam.googleFormUrl.trim();
        if (url.includes("/macros/s/") || url.endsWith("/exec")) {
          urls.add(url);
        }
      }
    });
  }

  const urlList = Array.from(urls);
  const indicator = document.getElementById("cloud-sync-status-indicator");

  if (urlList.length === 0) {
    if (indicator) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مع جوجل شيت غير نشطة (أدخل رابط الويب اب لتمكين المزامنة)`;
    }
    return;
  }

  const dbBackup = {
    teachers: systemState.teachers,
    students: systemState.students,
    exams: systemState.exams,
    results: systemState.results
  };

  const payload = {
    action: "save_backup",
    data: dbBackup
  };

  let successCount = 0;
  let failCount = 0;
  const total = urlList.length;

  if (indicator) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري المزامنة التلقائية مع (${total}) من شيتات جوجل...`;
  }

  urlList.forEach(url => {
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(() => {
      successCount++;
      updateIndicator();
    })
    .catch(err => {
      console.error("Auto-sync to cloud failed for url:", url, err);
      failCount++;
      updateIndicator();
    });
  });

  function updateIndicator() {
    if (successCount + failCount === total) {
      if (indicator) {
        if (failCount === 0) {
          indicator.innerHTML = `<span class="material-icons" style="color:var(--success); font-size:1.1rem; vertical-align:middle;">cloud_done</span> المزامنة التلقائية نشطة ومحدثة بنجاح (${successCount}/${total})`;
        } else if (successCount > 0) {
          indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> تم مزامنة بعض الشيتات (${successCount}/${total}) وفشل البعض الآخر`;
        } else {
          indicator.innerHTML = `<span class="material-icons" style="color:var(--error); font-size:1.1rem; vertical-align:middle;">cloud_off</span> فشل المزامنة التلقائية لجميع الشيتات (تحقق من اتصال الإنترنت أو النشر)`;
        }
      }
    }
  }
}

// حفظ نسخة احتياطية سحابية يدوياً
window.backupDatabaseToCloud = function() {
  const urls = new Set();
  
  if (systemState.config && systemState.config.googleFormUrl) {
    const url = systemState.config.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    const url = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam.googleFormUrl) {
        const url = exam.googleFormUrl.trim();
        if (url.includes("/macros/s/") || url.endsWith("/exec")) {
          urls.add(url);
        }
      }
    });
  }

  const urlList = Array.from(urls);
  if (urlList.length === 0) {
    alert("يرجى إدخال رابط ويب اب (Web App URL) في إعدادات التكامل أو في إعدادات الامتحان أولاً لتمكين النسخ الاحتياطي السحابي!");
    return;
  }

  const dbBackup = {
    teachers: systemState.teachers,
    students: systemState.students,
    exams: systemState.exams,
    results: systemState.results
  };

  const payload = {
    action: "save_backup",
    data: dbBackup
  };

  let successCount = 0;
  let failCount = 0;
  const total = urlList.length;

  const btnBackup = document.getElementById("btn-cloud-backup");
  const originalText = btnBackup ? btnBackup.innerHTML : "";
  if (btnBackup) {
    btnBackup.disabled = true;
    btnBackup.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري الرفع السحابي...`;
  }

  let completed = 0;
  urlList.forEach(url => {
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(() => {
      successCount++;
      checkCompletion();
    })
    .catch(err => {
      console.error("Manual backup failed for URL:", url, err);
      failCount++;
      checkCompletion();
    });
  });

  function checkCompletion() {
    completed++;
    if (completed === total) {
      if (btnBackup) {
        btnBackup.disabled = false;
        btnBackup.innerHTML = originalText;
      }
      
      autoSyncToCloud();

      if (failCount === 0) {
        alert(`تم حفظ النسخة الاحتياطية سحابياً بنجاح على جميع جداول جوجل شيتس (${successCount}/${total})!`);
      } else if (successCount > 0) {
        alert(`تم حفظ النسخة الاحتياطية على (${successCount}/${total}) من الجداول وفشل الرفع على البعض الآخر.`);
      } else {
        alert("فشل حفظ النسخة الاحتياطية سحابياً. يرجى التحقق من اتصالك بالإنترنت وصلاحيات تطبيق الويب (نشر لـ Anyone).");
      }
    }
  }
};

// استعادة النسخة الاحتياطية سحابياً يدوياً
window.restoreDatabaseFromCloud = function() {
  const urls = new Set();
  
  if (systemState.config && systemState.config.googleFormUrl) {
    const url = systemState.config.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    const url = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
    if (url.includes("/macros/s/") || url.endsWith("/exec")) {
      urls.add(url);
    }
  }
  
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam.googleFormUrl) {
        const url = exam.googleFormUrl.trim();
        if (url.includes("/macros/s/") || url.endsWith("/exec")) {
          urls.add(url);
        }
      }
    });
  }

  const urlList = Array.from(urls);
  if (urlList.length === 0) {
    alert("يرجى إدخال رابط ويب اب (Web App URL) أولاً لتمكين استعادة النسخة الاحتياطية!");
    return;
  }

  if (!confirm("تحذير: سيقوم هذا باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستعادة من جوجل شيت. هل ترغب في الاستمرار؟")) {
    return;
  }

  const btnRestore = document.getElementById("btn-cloud-restore");
  const originalText = btnRestore ? btnRestore.innerHTML : "";
  if (btnRestore) {
    btnRestore.disabled = true;
    btnRestore.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري جلب البيانات...`;
  }

  let index = 0;
  
  function tryFetchNext() {
    if (index >= urlList.length) {
      if (btnRestore) {
        btnRestore.disabled = false;
        btnRestore.innerHTML = originalText;
      }
      alert("فشل استعادة قاعدة البيانات من جميع الروابط المتاحة. تأكد من قيامك برفع نسخة احتياطية أولاً، وصحة إعدادات النشر (Anyone).");
      return;
    }

    const rawUrl = urlList[index];
    const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_backup";

    console.log("Restoring from URL:", fetchUrl);

    fetch(fetchUrl, {
      method: "GET",
      headers: { "Accept": "application/json" }
    })
    .then(res => {
      if (!res.ok) {
        throw new Error("HTTP error " + res.status);
      }
      return res.json();
    })
    .then(response => {
      if (response && response.status === "success" && response.data) {
        const data = response.data;
        
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

        if (btnRestore) {
          btnRestore.disabled = false;
          btnRestore.innerHTML = originalText;
        }

        alert("تم استعادة قاعدة البيانات بنجاح من جوجل شيت! سيتم إعادة تحميل الصفحة لتطبيق التغييرات.");
        location.reload();
      } else {
        throw new Error(response ? response.message : "Invalid response format");
      }
    })
    .catch(err => {
      console.error(`Failed to restore from URL: ${rawUrl}`, err);
      index++;
      tryFetchNext();
    });
  }

  tryFetchNext();
};

// نسخ كود الربط السحابي (Apps Script)
window.copyGoogleSheetsSyncScript = function() {
  const code = document.getElementById("google-sheets-sync-script-code");
  if (code) {
    navigator.clipboard.writeText(code.value).then(() => {
      alert("تم نسخ كود الربط السحابي بنجاح! اتبع الخطوات الموضحة بالصفحة للصقه في Apps Script ونشره.");
    }).catch(err => {
      code.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          alert("تم نسخ كود الربط السحابي بنجاح!");
        } else {
          alert("فشل نسخ الكود تلقائياً، يرجى نسخه يدوياً.");
        }
      } catch (e) {
        alert("فشل نسخ الكود تلقائياً، يرجى نسخه يدوياً.");
      }
    });
  }
};

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

function getAppBaseUrl() {
  const cleanHref = window.location.href.split('?')[0].split('#')[0];
  if (window.location.protocol === "file:") {
    return cleanHref;
  }

  let origin = window.location.origin;
  let pathname = window.location.pathname;

  if (pathname.endsWith("index.html")) {
    pathname = pathname.replace("index.html", "");
  }

  const pathParts = pathname.split('/').filter(Boolean);
  const knownExamIds = new Set((systemState.exams || []).map(exam => String(exam.id).toLowerCase()));
  while (pathParts.length && knownExamIds.has(pathParts[pathParts.length - 1].toLowerCase())) {
    pathParts.pop();
  }

  const basePath = pathParts.length ? `/${pathParts.join('/')}/` : "/";
  return `${origin}${basePath}`;
}

// دالة موحدة لتوليد الرابط المباشر للامتحان (تدعم المسارات الحقيقية بدون هاش على خوادم الويب)
function getExamDirectLink(exam) {
  const params = new URLSearchParams();
  params.set("exam", exam.id);
  if (systemState.activeTeacher) {
    params.set("teacher", systemState.activeTeacher.username);
  }
  return `${getAppBaseUrl()}?${params.toString()}`;
}

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
    const targetExam = systemState.exams.find(e => String(e.id).toLowerCase() === String(examId).toLowerCase());
    if (targetExam) {
      systemState.lockedExamId = targetExam.id;
      navigateToView("student-login-view");
      setTimeout(() => {
        const select = document.getElementById("student-exam-select");
        if (select) {
          select.value = targetExam.id;
          select.disabled = true;
          select.setAttribute("aria-describedby", "direct-exam-lock-note");
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
  const baseUrl = getAppBaseUrl();
  const autoUrl = `${baseUrl}?teacher_autocode=${systemState.activeTeacher.autoEntryCode}`;
  document.getElementById("teacher-auto-login-url").value = autoUrl;

  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (indicator) {
    const urls = new Set();
    if (systemState.config && systemState.config.googleFormUrl) {
      const url = systemState.config.googleFormUrl.trim();
      if (url.includes("/macros/s/") || url.endsWith("/exec")) urls.add(url);
    }
    if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
      const url = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
      if (url.includes("/macros/s/") || url.endsWith("/exec")) urls.add(url);
    }
    if (Array.isArray(systemState.exams)) {
      systemState.exams.forEach(exam => {
        if (exam.googleFormUrl) {
          const url = exam.googleFormUrl.trim();
          if (url.includes("/macros/s/") || url.endsWith("/exec")) urls.add(url);
        }
      });
    }
    
    if (urls.size > 0) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مهيأة وجاهزة للاتصال (${urls.size} من الجداول)`;
    } else {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مع جوجل شيت غير نشطة (أدخل رابط الويب اب لتمكين المزامنة)`;
    }
  }

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
  
  // تحديث مؤشر المزامنة فوراً بعد الحفظ
  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (indicator) {
    if (url && (url.includes("/macros/s/") || url.endsWith("/exec"))) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مهيأة وجاهزة للاتصال`;
      // محاولة مزامنة أولى فورية
      autoSyncToCloud();
    } else {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مع جوجل شيت غير نشطة (أدخل رابط الويب اب لتمكين المزامنة)`;
    }
  }

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
    sanitizeQuestionConfig(exam);
    const card = document.createElement("div");
    card.className = "exam-info-card";
    
    // ربط المعلم النشط بالرابط تلقائياً
    const examUrl = getExamDirectLink(exam);
    const totalExamScore = exam.totalScore || 100;
    const bankCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
    const configuredCount = getConfiguredQuestionCount(exam);
    const displayedCount = configuredCount || bankCount;
    const questionMode = exam.shuffleQuestions === false ? "ترتيبي" : "عشوائي";

    card.innerHTML = `
      <div>
        <div class="exam-info-title">${exam.title}</div>
        <div style="font-size:0.8rem; color:var(--secondary); font-weight:600; margin-bottom:0.5rem;">
          المادة: ${exam.subject} | الفرقة: ${exam.level || 'غير محددة'}
        </div>
        <div class="exam-info-details">
          <span>الكلية: ${exam.faculty || 'عام'} | الجامعة: ${exam.university || 'عام'}</span>
          <span>المجموع النهائي الكلي: <code style="color:var(--accent); font-weight:700;">${totalExamScore} درجة</code></span>
          <span>النوع: ${exam.examType || 'أعمال فصلية'} | بنك الأسئلة: ${bankCount}</span>\n          <span>المعروض للطالب: ${displayedCount} | النمط: ${questionMode}</span>
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
    shuffleQuestions: true,
    questionCount: "",
    maxCheatAttempts: 5,
    questions: []
  };

  systemState.exams.push(newExam);
  saveSystemState(true);
  
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
    saveSystemState(true);
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
  sanitizeQuestionConfig(exam);

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
  const timeLimitEl = document.getElementById("edit-meta-timelimit");
  if (timeLimitEl) timeLimitEl.value = exam.timeLimit || 60;
  const randomizeEl = document.getElementById("edit-meta-randomize");
  if (randomizeEl) randomizeEl.checked = exam.shuffleQuestions !== false;
  const questionCountEl = document.getElementById("edit-meta-question-count");
  if (questionCountEl) questionCountEl.value = exam.questionCount || "";
  const maxCheatEl = document.getElementById("edit-meta-max-cheat-attempts");
  if (maxCheatEl) maxCheatEl.value = exam.maxCheatAttempts ?? 5;
  document.getElementById("edit-meta-google-url").value = exam.googleFormUrl || "";
  document.getElementById("edit-meta-entry-name").value = exam.entryName || "";
  document.getElementById("edit-meta-entry-id").value = exam.entryId || "";
  document.getElementById("edit-meta-entry-code").value = exam.entryCode || "";
  document.getElementById("edit-meta-entry-score").value = exam.entryScore || "";
  document.getElementById("edit-meta-entry-details").value = exam.entryDetails || "";

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
  const editRandomizeQuestions = document.getElementById("edit-meta-randomize")?.checked !== false;
  const rawQuestionCount = document.getElementById("edit-meta-question-count")?.value.trim() || "";
  const rawMaxCheatAttempts = document.getElementById("edit-meta-max-cheat-attempts")?.value.trim() ?? "5";
  const editGoogleUrl = document.getElementById("edit-meta-google-url").value.trim();
  const editEntryName = document.getElementById("edit-meta-entry-name").value.trim();
  const editEntryId = document.getElementById("edit-meta-entry-id").value.trim();
  const editEntryCode = document.getElementById("edit-meta-entry-code").value.trim();
  const editEntryScore = document.getElementById("edit-meta-entry-score").value.trim();
  const editEntryDetails = document.getElementById("edit-meta-entry-details").value.trim();

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
  exam.timeLimit = parseFloat(document.getElementById("edit-meta-timelimit")?.value) || 60;
  exam.shuffleQuestions = editRandomizeQuestions;
  exam.questionCount = rawQuestionCount;
  const maxCheatAttemptsNumber = parseInt(rawMaxCheatAttempts, 10);
  if (!Number.isFinite(maxCheatAttemptsNumber) || maxCheatAttemptsNumber < 0) {
    alert("عدد محاولات الغش المسموحة يجب أن يكون 0 أو أكبر.");
    return;
  }
  exam.maxCheatAttempts = maxCheatAttemptsNumber;
  exam.googleFormUrl = editGoogleUrl;
  exam.entryName = editEntryName;
  exam.entryId = editEntryId;
  exam.entryCode = editEntryCode;
  exam.entryScore = editEntryScore;
  exam.entryDetails = editEntryDetails;

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
  if (rawQuestionCount) {
    const questionCountNumber = parseInt(rawQuestionCount, 10);
    if (!Number.isFinite(questionCountNumber) || questionCountNumber <= 0) {
      alert("عدد الأسئلة المعروضة يجب أن يكون رقماً صحيحاً أكبر من صفر.");
      return;
    }
    if (questionCountNumber > updatedQuestions.length) {
      alert(`عدد الأسئلة المعروضة (${questionCountNumber}) لا يمكن أن يتجاوز حجم بنك الأسئلة الحالي (${updatedQuestions.length}).`);
      return;
    }
  }
  sanitizeQuestionConfig(exam);
  saveSystemState(true);
  
  // تحديث مؤشر حالة المزامنة بعد حفظ رابط الامتحان المخصص
  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (indicator) {
    const urls = new Set();
    if (systemState.config && systemState.config.googleFormUrl) {
      const u = systemState.config.googleFormUrl.trim();
      if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
    }
    if (Array.isArray(systemState.exams)) {
      systemState.exams.forEach(ex => {
        if (ex.googleFormUrl) {
          const u = ex.googleFormUrl.trim();
          if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
        }
      });
    }
    if (urls.size > 0) {
      indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> المزامنة التلقائية مهيأة وجاهزة للاتصال (${urls.size} من الجداول)`;
    }
  }
  
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
  saveSystemState(true);
  renderQuestionsForEdit(exam);
};

window.deleteQuestion = function(index) {
  if (!currentEditingExamId) return;
  const exam = systemState.exams.find(e => e.id === currentEditingExamId);
  if (!exam) return;

  if (confirm("هل أنت متأكد من حذف هذا السؤال؟")) {
    exam.questions.splice(index, 1);
    exam.questions.forEach((q, idx) => { q.id = idx + 1; });
    saveSystemState(true);
    renderQuestionsForEdit(exam);
  }
};

// ==========================================
// 5. التصدير والاستيراد لـ Google Forms
// ==========================================

function escapeAppsScriptString(str) {
  if (!str) return "";
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

window.generateGoogleFormScript = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;

  let script = `/**
 * Google Apps Script لتوليد امتحان "${escapeAppsScriptString(exam.title)}" تلقائياً
 * تم إنشاؤه بواسطة منصة arabya.ai
 */
function createArabyaExamForm() {
  var form = FormApp.create('${escapeAppsScriptString(exam.title)}');
  form.setDescription('المادة: ${escapeAppsScriptString(exam.subject)} | الكلية: ${escapeAppsScriptString(exam.faculty)} | الجامعة: ${escapeAppsScriptString(exam.university)} \\n تم إنشاء النموذج تلقائياً عبر arabya.ai');
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
  item${idx}.setTitle('${escapeAppsScriptString(q.question)}');
  item${idx}.setRequired(true);
`;
    } else {
      script += `
  var item${idx} = form.addMultipleChoiceItem();
  item${idx}.setTitle('${escapeAppsScriptString(q.question)}');
  item${idx}.setChoices([
    ${q.options.map((opt, oIdx) => `item${idx}.createChoice('${escapeAppsScriptString(opt)}', ${oIdx === q.correctAnswer})`).join(",\n    ")}
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
    saveSystemState(true);
    
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

                if ((qTypeNum === 2 || qTypeNum === 3 || qTypeNum === 4) && item[4] && item[4][0] && item[4][0][1]) {
                  const rawOpts = item[4][0][1];
                  options = rawOpts.map(o => o && o[0] ? o[0] : "").filter(o => o !== "");
                  type = options.length === 2 && (options.includes("صواب") || options.includes("صح") || options.includes("نعم")) ? "boolean" : "multiple";
                } else {
                  type = "essay";
                  options = [];
                }

                questions.push({
                  id: qId++,
                  type,
                  question: qText,
                  options,
                  correctAnswer: correctAnswer,
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

        saveSystemState(true);
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
  if (systemState.lockedExamId) {
    filteredExams = filteredExams.filter(exam => exam.id === systemState.lockedExamId);
  }

  if (filteredExams.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    opt.innerText = "لا توجد امتحانات متاحة حالياً. يرجى الرجوع للمعلم.";
    select.appendChild(opt);
    select.disabled = true;
    select.removeAttribute("aria-describedby");
    return;
  }

  filteredExams.forEach(exam => {
    const opt = document.createElement("option");
    opt.value = exam.id;
    opt.innerText = `${exam.title} (${exam.subject})`;
    select.appendChild(opt);
  });

  if (systemState.lockedExamId) {
    select.value = systemState.lockedExamId;
    select.disabled = true;
    select.setAttribute("aria-describedby", "direct-exam-lock-note");
  }
}

function validateStudentAndStart() {
  const name = document.getElementById("student-fullname-input").value.trim();
  const id = document.getElementById("student-id-input").value.trim();
  const rawCode = document.getElementById("student-access-code").value.trim();
  const email = document.getElementById("student-email-input")?.value.trim() || "";
  const mobile = document.getElementById("student-mobile-input")?.value.trim() || "";
  const examId = document.getElementById("student-exam-select").value;
  const normalizedId = normalizeStudentId(id);
  const inputCode = sanitizeStudentCodeInput(rawCode);
  const hasCodeInput = rawCode !== "";

  if (!name) {
    alert("يرجى إدخال اسمك بالكامل للبدء!");
    return;
  }
  if (hasCodeInput && !isFiveDigitStudentCode(inputCode)) {
    alert("إذا أدخلت كود اشتراك، يجب أن يكون مكوناً من 5 أرقام.");
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
  sanitizeQuestionConfig(selectedExam);

  if (selectedExam.questions.length === 0) {
    alert("عذراً، هذا الامتحان لا يحتوي على أي أسئلة مضافة بعد!");
    return;
  }

  let matchedStudent = null;
  if (isFiveDigitStudentCode(inputCode)) {
    matchedStudent = findStudentByCode(inputCode);
  }
  if (!matchedStudent && normalizedId) {
    matchedStudent = findStudentById(normalizedId);
  }
  if (!matchedStudent) {
    matchedStudent = findStudentByName(name);
  }

  if (isPrivateStudentCode(inputCode)) {
    const duplicateCode = systemState.students.find(student => sanitizeStudentCodeInput(student.code) === inputCode && student !== matchedStudent);
    if (duplicateCode) {
      alert("كود الاشتراك الخاص مستخدم بالفعل لطالب آخر. اختر كوداً مختلفاً.");
      return;
    }
  }

  if (normalizedId) {
    const duplicateId = systemState.students.find(student => normalizeStudentId(student.id) === normalizedId && student !== matchedStudent);
    if (duplicateId) {
      if (isPrivateStudentCode(inputCode) && sanitizeStudentCodeInput(duplicateId.code) === inputCode) {
        matchedStudent = duplicateId;
      } else {
        alert("رقم ID مسجل بالفعل لطالب آخر. استخدم رقم معرف مختلف أو سجل بالكود الصحيح.");
        return;
      }
    }
  }

  const studentRecord = upsertStudentRecord({
    name,
    id: normalizedId,
    code: inputCode,
    email,
    mobile
  });

  systemState.currentStudent = {
    name: studentRecord.name,
    id: studentRecord.id || "",
    accessCode: studentRecord.code || "",
    studentKey: studentRecord.studentKey || getStudentLookupKey(studentRecord),
    email: studentRecord.email || "",
    mobile: studentRecord.mobile || ""
  };

  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  const blockingResult = findBlockingExamResult(studentLookupKey, examId);
  if (blockingResult) {
    if (blockingResult.status === "canceled") {
      alert("تم إلغاء امتحانك سابقاً بسبب تجاوز محاولات الغش المسموحة. تواصل مع المعلم لإعادة السماح بالتقديم.");
    } else {
      alert("لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً. لا يمكن الدخول إليه مرة أخرى.");
    }
    return;
  }

  systemState.currentExam = selectedExam;

  systemState.shuffledQuestions = buildRuntimeQuestionsForExam(selectedExam);
  systemState.currentExamRuntime = calculateRuntimeExamMeta(systemState.shuffledQuestions);

  systemState.currentQuestionIndex = 0;
  systemState.studentAnswers = {};
  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));
  saveActiveStudentSession();
  updateLiveIncompleteResult();
  requestSecureExamMode();

  const examTimeLimitMinutes = selectedExam.timeLimit || 60;
  const questionsCount = systemState.shuffledQuestions.length || 1;
  const perQuestionSeconds = Math.max(30, Math.floor((examTimeLimitMinutes * 60) / questionsCount));
  systemState.timer.timeLimit = perQuestionSeconds;

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
  const examTotalScore = getCurrentExamTotalScore();
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
      saveActiveStudentSession();
      updateLiveIncompleteResult();
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

  saveActiveStudentSession();
  updateLiveIncompleteResult();
}

function startRunnerTimer() {
  startRunnerTimerWithTime(systemState.timer.timeLimit);
}

function startRunnerTimerWithTime(seconds) {
  systemState.timer.timeRemaining = seconds;
  updateRunnerTimerUI();

  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const fillCircle = document.getElementById("runner-timer-circle");
  const container = document.getElementById("runner-timer-container");
  
  if (fillCircle) fillCircle.style.strokeDashoffset = 0;
  if (container) container.classList.remove("timer-warning");

  systemState.timer.intervalId = setInterval(() => {
    systemState.timer.timeRemaining--;
    updateRunnerTimerUI();
    saveActiveStudentSession(); // حفظ التقدم مع التوقيت المتبقي

    if (systemState.timer.timeRemaining <= 10) {
      if (container) container.classList.add("timer-warning");
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
  
  // ترحيل البيانات الحية غير المكتملة إلى قاعدة البيانات وجداول جوجل شيتس
  saveActiveStudentSession();
  updateLiveIncompleteResult();

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
  releaseSecureExamMode();
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === systemState.currentExam.id && r.status === "incomplete"));
  localStorage.removeItem("arabya_active_student_session");

  let totalEarnedPoints = 0;
  let totalObjectivePoints = 0;
  let totalEssayPoints = 0;
  let objectiveQuestionsCount = 0;
  let correctObjectiveCount = 0;
  let hasEssay = false;
  let detailsLog = [];

  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};

  systemState.shuffledQuestions.forEach(q => {
    const studentAns = studentAnswersMap[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;

    if (q.type === "essay") {
      hasEssay = true;
      totalEssayPoints += qPoints;
      const ansText = studentAns || "(لم يكتب الطالب إجابة)";
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} \n إجابة الطالب: ${ansText}\n-----------------`);
      questionScoresMap[q.id] = 0;
    } else {
      objectiveQuestionsCount++;
      totalObjectivePoints += qPoints;
      const isCorrect = studentAns === q.correctAnswer;
      if (isCorrect) {
        correctObjectiveCount++;
        totalEarnedPoints += qPoints;
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

  const examTotalScore = getCurrentExamTotalScore();
  let scaledScore = 0;
  if (totalObjectivePoints > 0) {
    scaledScore = (totalEarnedPoints / totalObjectivePoints) * examTotalScore;
    scaledScore = Math.round(scaledScore * 100) / 100;
  }

  let scoreString = `${correctObjectiveCount}/${objectiveQuestionsCount} أسئلة موضوعية (تعادل ${scaledScore} من ${examTotalScore} كحد أقصى)`;
  if (hasEssay) {
    scoreString += ` + أسئلة مقالية بقيمة ${totalEssayPoints} نقاط بانتظار تصحيح المعلم`;
  }

  const detailsFormatted = detailsLog.join("\n");
  const resultObj = {
    recordId: createRecordId("result"),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode || "",
    studentLookupKey,
    email: systemState.currentStudent.email || "",
    mobile: systemState.currentStudent.mobile || "",
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
    questionScores: questionScoresMap,
    maxScore: examTotalScore,
    presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions)),
    status: "completed",
    allowRetake: false
  };

  systemState.results.push(resultObj);
  saveSystemState(true);
  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
}

function showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore) {
  navigateToView("student-result-view");
  
  const scoreNumEl = document.getElementById("runner-res-score");
  const totalEl = document.getElementById("runner-res-total");
  
  scoreNumEl.innerText = scaledScore;
  totalEl.innerText = examTotalScore;

  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id || "--";
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
      statusEl.innerText = `للأسف، لم تجتز النسبة المطلوبة. درجتك هي: ${scaledScore} من ${examTotalScore} درجات.`;
      statusEl.style.color = "var(--error)";
    }
  }
}

// المزامنة مع جوجل شيتس - ترسل نتيجة الطالب فور الانتهاء من الامتحان
function sendResultToGoogleSheets(scoreString, details, resultRecordId = "", resultObj = null) {
  const exam = systemState.currentExam;
  const urlsToSync = new Set();
  if (exam && exam.googleFormUrl && exam.googleFormUrl.trim()) {
    const u = exam.googleFormUrl.trim();
    if (u.includes("/macros/s/") || u.endsWith("/exec")) urlsToSync.add(u);
  }
  if (systemState.config && systemState.config.googleFormUrl && systemState.config.googleFormUrl.trim()) {
    const u = systemState.config.googleFormUrl.trim();
    if (u.includes("/macros/s/") || u.endsWith("/exec")) urlsToSync.add(u);
  }

  if (urlsToSync.size === 0) return;

  const payload = {
    action: "add_result",
    recordId: resultRecordId,
    timestamp: resultObj?.timestamp || new Date().toLocaleString("ar-EG"),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    subscriptionCode: systemState.currentStudent.accessCode,
    studentLookupKey: resultObj?.studentLookupKey || getStudentLookupKey(systemState.currentStudent),
    email: resultObj?.email || systemState.currentStudent.email || "",
    mobile: resultObj?.mobile || systemState.currentStudent.mobile || "",
    examTitle: exam ? exam.title : "امتحان",
    examId: exam ? exam.id : "",
    university: exam ? (exam.university || "") : (resultObj?.university || ""),
    faculty: exam ? (exam.faculty || "") : (resultObj?.faculty || ""),
    level: exam ? (exam.level || "") : (resultObj?.level || ""),
    examType: exam ? (exam.examType || "") : (resultObj?.examType || ""),
    status: resultObj?.status || "completed",
    score: scoreString,
    details: details,
    maxScore: resultObj?.maxScore || getCurrentExamTotalScore(),
    presentedQuestions: resultObj?.presentedQuestions || []
  };

  urlsToSync.forEach(url => {
    fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  });
}


// مزامنة نتيجة معدّلة يدوياً (من قبل المعلم) مع Google Sheets
function sendUpdatedResultToCloud(res, syncStatusEl = null) {
  const urls = new Set();
  if (systemState.config && systemState.config.googleFormUrl) {
    const u = systemState.config.googleFormUrl.trim();
    if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
  }
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    const u = systemState.activeTeacher.integrationConfig.googleFormUrl.trim();
    if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
  }
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (exam.googleFormUrl) {
        const u = exam.googleFormUrl.trim();
        if (u.includes("/macros/s/") || u.endsWith("/exec")) urls.add(u);
      }
    });
  }

  if (urls.size === 0) {
    if (syncStatusEl) syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle; font-size:1rem;">cloud_queue</span> لم يتم ربط Google Sheets بعد — تم الحفظ محلياً فقط.`;
    return;
  }

  if (syncStatusEl) syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; font-size:1rem; animation:spin 1s infinite linear;">sync</span> جاري مزامنة الدرجات مع Google Sheets...`;

  const payload = {
    action: "add_result",
    recordId: res.recordId || createRecordId("result"),
    timestamp: res.timestamp || new Date().toLocaleString("ar-EG"),
    name: res.name,
    id: res.id,
    subscriptionCode: res.accessCode || "",
    studentLookupKey: res.studentLookupKey || "",
    email: res.email || "",
    mobile: res.mobile || "",
    examTitle: res.examTitle || "",
    examId: res.examId || "",
    university: res.university || "",
    faculty: res.faculty || "",
    level: res.level || "",
    examType: res.examType || "",
    status: res.status || "updated",
    score: res.score || "",
    details: res.details || "",
    maxScore: res.maxScore || "",
    isManualGradeUpdate: true
  };

  let done = 0;
  const total = urls.size;
  urls.forEach(url => {
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle; font-size:1rem;">cloud_done</span> تمت مزامنة التصحيح مع Google Sheets بنجاح!`;
      }
    })
    .catch(() => {
      done++;
      if (done === total && syncStatusEl) {
        syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle; font-size:1rem;">cloud_off</span> فشلت المزامنة — تم الحفظ محلياً.`;
      }
    });
  });
}

// الاستعلام عن نتائج الطلاب بالاسم، المعرف، أو كود الاشتراك الموزع
function searchStudentResults() {
  const rawQuery = document.getElementById("search-student-query").value.trim();
  const sanitizedQueryCode = sanitizeStudentCodeInput(rawQuery);
  const normalizedQueryId = normalizeStudentId(rawQuery);
  const normalizedQueryName = normalizeStudentName(rawQuery);

  if (!rawQuery) {
    alert("يرجى إدخال اسمك بالكامل، رقم هويتك ID، أو كود اشتراكك للبحث!");
    return;
  }

  const matched = systemState.results.filter(res => {
    const resultCode = sanitizeStudentCodeInput(res.accessCode || "");
    if (isPrivateStudentCode(resultCode)) {
      return sanitizedQueryCode === resultCode;
    }
    const nameMatch = normalizeStudentName(res.name) === normalizedQueryName;
    const idMatch = normalizeStudentId(res.id) && normalizeStudentId(res.id) === normalizedQueryId;
    const sharedCodeMatch = isSharedStudentCode(resultCode) && sanitizedQueryCode === resultCode;
    const noCodeMatch = !resultCode && (nameMatch || idMatch);
    return nameMatch || idMatch || sharedCodeMatch || noCodeMatch;
  });

  const listContainer = document.getElementById("student-search-results-list");
  listContainer.innerHTML = "";
  if (!matched.length) {
    listContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);">لم يتم العثور على أي نتائج مسجلة تطابق بيانات البحث المدخلة.</div>`;
    return;
  }

  matched.forEach(res => {
    const card = document.createElement("div");
    card.className = "result-query-card";
    card.innerHTML = `
      <div><div class="result-query-title">${res.examTitle} (${res.examType})</div></div>
      <div style="display:flex; align-items:center; gap: 1rem;"><span style="font-size:1.1rem; font-weight:800; color:var(--secondary);">${res.score}</span></div>
    `;
    listContainer.appendChild(card);
  });
}

window.viewResultDetailQuery = function(recordId, studentId, examId) {
  if (examId === undefined) {
    examId = studentId;
    studentId = recordId;
    recordId = "";
  }
  const result = systemState.results.find(r => r.recordId === recordId) ||
    systemState.results.find(r => r.id === studentId && r.examId === examId);
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
    const statusBadge = formatResultStatusBadge(res);
    const uncancelBtn = (res.status === "canceled" && res.allowRetake !== true)
      ? `<button class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning); margin-right:0.25rem;" onclick="uncancelStudentExam('${res.recordId || ""}')">إلغاء علامة الإلغاء</button>`
      : "";
    row.innerHTML = `
      <td>${statusBadge}${res.name}</td>
      <td><code>${res.id || "--"}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${res.accessCode || "لا يوجد"}</span></td>
      <td>${res.examTitle} (${res.level || 'عام'})</td>
      <td style="font-weight:700; color:var(--secondary);">${res.score}</td>
      <td>${res.timestamp}</td>
      <td style="display:flex; gap:0.25rem; flex-wrap:wrap;">${uncancelBtn}<button class="btn btn-outline btn-sm" onclick="viewTeacherResultDetail('${res.recordId || ""}', '${res.id}', '${res.examId}')">عرض</button></td>
    `;
    tbody.appendChild(row);
  });
}

window.viewTeacherResultDetail = function(recordId, studentId, examId) {
  if (examId === undefined) {
    examId = studentId;
    studentId = recordId;
    recordId = "";
  }
  // البحث بمعيار id + examId (أو id فقط كحالة بديلة)
  const res = systemState.results.find(r => r.recordId === recordId) ||
  systemState.results.find(r =>
    (r.id === studentId && r.examId === examId) ||
    (r.id === studentId && !r.examId && examId === "")
  );
  if (!res) {
    alert("لم يتم العثور على سجل هذا الطالب!");
    return;
  }

  const exam = systemState.exams.find(e => e.id === (res.examId || examId));
  // إذا حُذف الامتحان، نبني بيانات سؤال وهمية من التفاصيل المحفوظة
  const examForDisplay = exam || {
    title: res.examTitle || "امتحان محذوف",
    totalScore: 100,
    questions: Object.keys(res.questionScores || {}).map((qId, idx) => ({
      id: parseInt(qId),
      type: "multiple",
      question: `سؤال ${idx + 1}`,
      options: ["لا يوجد"],
      correctAnswer: 0,
      points: res.questionScores[qId] || 10
    }))
  };

  systemState.currentGradingResult = res;
  systemState.currentGradingExam = examForDisplay; // نستخدم examForDisplay دائماً

  const panel = document.getElementById("teacher-result-detail-panel");
  if (panel) {
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById("detail-student-name").innerText = res.name;
  document.getElementById("detail-stu-name").innerText = res.name;
  document.getElementById("detail-stu-id").innerText = res.id;
  document.getElementById("detail-stu-code").innerText = res.accessCode || "لا يوجد";
  document.getElementById("detail-exam-title").innerText = res.examTitle || examForDisplay.title;
  document.getElementById("detail-exam-date").innerText = res.timestamp;
  document.getElementById("detail-total-score-input").value = res.score;

  if (!res.studentAnswers) res.studentAnswers = {};
  if (!res.questionScores) res.questionScores = {};

  const container = document.getElementById("detail-questions-container");
  if (!container) return;
  container.innerHTML = "";

  (examForDisplay.questions || []).forEach((q, index) => {
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
  saveSystemState(true);
  renderStudentResultsTable();
  // Sync to cloud
  const syncEl = document.getElementById("grading-sync-status");
  sendUpdatedResultToCloud(res, syncEl);
  alert("تم تعديل النتيجة الإجمالية بنجاح! تجري المزامنة في الخلفية.");
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

  saveSystemState(true);
  renderStudentResultsTable();
  // Sync to cloud immediately
  const syncEl = document.getElementById("grading-sync-status");
  if (syncEl) syncEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; font-size:1rem; animation:spin 1s infinite linear;">sync</span> جاري مزامنة الدرجات المعدّلة...`;
  sendUpdatedResultToCloud(res, syncEl);
  // Close after 3s so user sees sync status
  setTimeout(() => { closeResultDetailPanel(); }, 3000);
  alert("تم حفظ كافة التعديلات، إجابات الطالب، والدرجات يدوياً بنجاح! جارٍ المزامنة مع Google Sheets.");
};

function exportTeacherResultsToCSV() {
  if (systemState.results.length === 0) {
    alert("لا توجد سجلات لتصديرها!");
    return;
  }

  let csvContent = "\ufeffsep=,\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,النتيجة,التاريخ والوقت\n";

  systemState.results.forEach(res => {
    csvContent += `"${res.name}","${res.id}","${res.accessCode || 'لا يوجد'}","${res.university || 'عام'}","${res.faculty || 'عام'}","${res.level || 'عام'}","${res.examTitle}","${res.examType || 'أعمال سنة'}","${res.score}","${res.timestamp}"\n`;
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
    localStorage.setItem("arabya_results_db", "[]"); // حفظ مصفوفة فارغة بدلاً من حذف المفتاح
    renderStudentResultsTable();
    alert("تم مسح كافة سجلات الطلاب بنجاح!");
  }
}

// ==========================================
// 9. آليات منع الغش وتأمين النوافذ
// ==========================================

function setupAntiCheatHandlers() {
  window.addEventListener("beforeunload", e => {
    if (systemState.isExamActive) {
      saveActiveStudentSession();
      updateLiveIncompleteResult();
      e.preventDefault();
      e.returnValue = "امتحانك نشط الآن. الخروج قد يؤدي إلى تسجيل محاولة غش أو فقدان التقدم.";
      return e.returnValue;
    }
  });

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

  document.addEventListener("contextmenu", e => {
    if (systemState.isExamActive) {
      e.preventDefault();
    }
  });
  document.addEventListener("copy", e => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      e.preventDefault();
      triggerRunnerCheatPenalty("copy");
    } else if (systemState.isExamActive) {
      e.preventDefault();
    }
  });
  document.addEventListener("cut", e => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      e.preventDefault();
      triggerRunnerCheatPenalty("cut");
    } else if (systemState.isExamActive) {
      e.preventDefault();
    }
  });
  document.addEventListener("paste", e => {
    if (systemState.isExamActive && !systemState.isCheatingSuspended) {
      e.preventDefault();
      triggerRunnerCheatPenalty("paste");
    } else if (systemState.isExamActive) {
      e.preventDefault();
    }
  });
  document.addEventListener("selectstart", e => {
    if (systemState.isExamActive) {
      e.preventDefault();
    }
  });
  document.addEventListener("dragstart", e => {
    if (systemState.isExamActive) {
      e.preventDefault();
    }
  });

  document.addEventListener("keydown", e => {
    const commandKey = e.ctrlKey || e.metaKey;
    if (
      e.key === "F12" || 
      (commandKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c" || e.key === "K" || e.key === "k" || e.key === "E" || e.key === "e")) ||
      (commandKey && (e.key === "U" || e.key === "u" || e.key === "S" || e.key === "s"))
    ) {
      e.preventDefault();
      alert("حظر: غير مصرح بفتح أدوات المطور أو حفظ الصفحة أثناء الامتحان!");
      return false;
    }

    if (systemState.isExamActive && !systemState.isCheatingSuspended && commandKey && (e.key === "C" || e.key === "c" || e.key === "V" || e.key === "v" || e.key === "X" || e.key === "x" || e.key === "A" || e.key === "a")) {
      e.preventDefault();
      triggerRunnerCheatPenalty("keyboard-shortcut");
      return false;
    }

    if (commandKey && (e.key === "p" || e.key === "P")) {
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

function requestSecureExamMode() {
  const root = document.documentElement;
  if (root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().catch(() => {
      console.warn("Fullscreen mode was not granted by the browser.");
    });
  }
}

function releaseSecureExamMode() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function triggerRunnerCheatPenalty(reason) {
  systemState.isCheatingSuspended = true;
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  systemState.cheatViolations++;

  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  if (currentQ && currentQ.type === "essay") {
    systemState.studentAnswers[currentQ.id] = "(ملغي - تم كشف محاولة غش/تصوير)";
  } else if (currentQ) {
    systemState.studentAnswers[currentQ.id] = -2;
  }

  const overlay = document.getElementById("runner-cheat-overlay");
  const mainWrapper = document.getElementById("app-main-wrapper");
  const msg = document.getElementById("runner-cheat-msg");
  const exam = systemState.currentExam;
  const shouldCancel = shouldCancelExamForCheating(exam, systemState.cheatViolations);

  mainWrapper.classList.add("blurred-content");
  overlay.classList.remove("hidden");

  if (shouldCancel) {
    msg.innerHTML = `
      <span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان!</span>
      تم اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تم إنهاء اختبارك وتسجيل حالة الإلغاء.
    `;

    systemState.shuffledQuestions.forEach(q => {
      if (systemState.studentAnswers[q.id] === undefined) {
        if (q.type === "essay") {
          systemState.studentAnswers[q.id] = "(ملغي - غش)";
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
      submitCheatedExam();
    }, 4500);
  } else {
    msg.innerHTML = `
      <span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير أمني</span>
      تم اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تم إلغاء السؤال الحالي وتصفير درجته والانتقال للسؤال التالي.
    `;

    setTimeout(() => {
      overlay.classList.add("hidden");
      mainWrapper.classList.remove("blurred-content");
      systemState.isCheatingSuspended = false;
      runnerNextQuestion(true);
    }, 4000);
  }
}

function submitCheatedExam() {
  // تنظيف الجلسة الحية وحذف السجل غير المكتمل
  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === systemState.currentExam.id && r.status === "incomplete"));
  localStorage.removeItem("arabya_active_student_session");
  releaseSecureExamMode();

  const exam = systemState.currentExam;
  const examTotalScore = getCurrentExamTotalScore();
  const scoreString = `0 / ${examTotalScore} (ملغي - غش متكرر)`;
  const detailsFormatted = "تم إلغاء الامتحان وتصفير النتيجة نهائياً لمخالفة تعليمات الاختبار وتكرار محاولة الغش أو الخروج من الصفحة.";

  const studentAnswersMap = { ...systemState.studentAnswers };
  const questionScoresMap = {};
  exam.questions.forEach(q => {
    questionScoresMap[q.id] = 0;
  });

  const resultObj = {
    recordId: createRecordId("result"),
    name: systemState.currentStudent.name,
    id: systemState.currentStudent.id,
    accessCode: systemState.currentStudent.accessCode || "",
    studentLookupKey,
    email: systemState.currentStudent.email || "",
    mobile: systemState.currentStudent.mobile || "",
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
    questionScores: questionScoresMap,
    maxScore: examTotalScore,
    presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions || [])),
    status: "canceled",
    allowRetake: false,
    cheatViolations: systemState.cheatViolations
  };

  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);

  sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);

  navigateToView("student-result-view");
  document.getElementById("runner-res-score").innerText = "0";
  document.getElementById("runner-res-total").innerText = examTotalScore;
  document.getElementById("runner-res-name").innerText = systemState.currentStudent.name;
  document.getElementById("runner-res-id").innerText = systemState.currentStudent.id || "--";
  document.getElementById("runner-res-title").innerText = `${systemState.currentExam.title} [${systemState.currentExam.examType}]`;

  const statusEl = document.getElementById("runner-res-status");
  statusEl.innerText = "تم إلغاء امتحانك بسبب اكتشاف محاولة للغش والخروج عن قواعد الامتحان. تواصل مع المعلم إذا لزم الأمر.";
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
  const id = normalizeStudentId(document.getElementById("student-reg-id").value.trim());
  const rawCode = document.getElementById("student-reg-code").value.trim();
  const code = sanitizeStudentCodeInput(rawCode);

  if (!fullname || !rawCode) {
    alert("يرجى إدخال الاسم وكود الاشتراك للتسجيل!");
    return;
  }
  if (!isFiveDigitStudentCode(code)) {
    alert("كود الاشتراك يجب أن يكون مكوّناً من 5 أرقام.");
    return;
  }

  // فحص عدم تكرار الـ ID في قاعدة البيانات
  const isDuplicate = id && systemState.students.some(s => normalizeStudentId(s.id) === id);
  if (isDuplicate) {
    alert("رقم المعرف (ID) هذا مسجل بالفعل لطالب آخر! يرجى التواصل مع المعلم إذا واجهتك مشكلة.");
    return;
  }

  const newStudent = upsertStudentRecord({ name: fullname, id, code });
  saveSystemState(true);

  alert(`تم تسجيل حسابك بنجاح يا ${fullname}! يمكنك الآن تسجيل الدخول مباشرة للبدء.`);
  navigateToView("student-login-view");

  // تعبئة البيانات تلقائياً
  document.getElementById("student-fullname-input").value = newStudent.name;
  document.getElementById("student-id-input").value = newStudent.id || "";
  document.getElementById("student-access-code").value = newStudent.code || "";
}

// إعداد الإكمال والتعبئة التلقائية لبيانات الطالب
function setupStudentAutofill() {
  const codeInput = document.getElementById("student-access-code");
  const idInput = document.getElementById("student-id-input");
  const nameInput = document.getElementById("student-fullname-input");
  const emailInput = document.getElementById("student-email-input");
  const mobileInput = document.getElementById("student-mobile-input");

  if (!idInput || !codeInput || !nameInput) return;

  function autofillIfMatched() {
    const idVal = normalizeStudentId(idInput.value.trim());
    const codeVal = sanitizeStudentCodeInput(codeInput.value.trim());

    let matched = null;
    if (isFiveDigitStudentCode(codeVal)) {
      matched = findStudentByCode(codeVal);
    }
    if (!matched && idVal) {
      matched = findStudentById(idVal);
    }
    if (!matched) return;

    if (!idInput.value) idInput.value = matched.id || "";
    if (!codeInput.value) codeInput.value = matched.code || "";
    if (!nameInput.value) nameInput.value = matched.name || "";
    if (emailInput && !emailInput.value) emailInput.value = matched.email || "";
    if (mobileInput && !mobileInput.value) mobileInput.value = matched.mobile || "";
  }

  idInput.addEventListener("blur", autofillIfMatched);
  codeInput.addEventListener("blur", autofillIfMatched);
}

// عرض قائمة الطلاب وأكوادهم في لوحة المعلم

window.uncancelStudentExam = function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (res.status !== "canceled") {
    alert("هذا السجل ليس بحالة إلغاء.");
    return;
  }
  if (!confirm(`هل تريد إلغاء علامة "تم إلغاء الامتحان" للطالب ${res.name} والسماح له بإعادة التقديم؟`)) {
    return;
  }
  res.allowRetake = true;
  res.uncanceledAt = new Date().toLocaleString("ar-EG");
  saveSystemState(true);
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  alert("تم السماح للطالب بإعادة أداء الامتحان.");
};

function renderTeacherStudentsTable() {
  const tbody = document.getElementById("teacher-students-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (systemState.students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">لا يوجد طلاب مسجلين حالياً.</td></tr>`;
    return;
  }

  // عرض أحدث الطلاب المسجلين في الأعلى
  const reversed = [...systemState.students].reverse();

  reversed.forEach(s => {
    const studentKey = s.studentKey || getStudentLookupKey(s);
    const canceledExamIds = getStudentCanceledExamIds(studentKey);
    const canceledBadge = canceledExamIds.length
      ? `<span style="color:var(--error); font-weight:700; font-size:0.75rem; display:block; margin-top:0.15rem;">تم إلغاء الامتحان</span>`
      : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.name}${canceledBadge}</td>
      <td><code>${s.id || "--"}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${s.code || "لا يوجد"}</span></td>
      <td>${s.email || "--"}</td>
      <td>${s.mobile || "--"}</td>
      <td>${s.timestamp || 'غير معروف'}</td>
      <td>
        <button class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary); padding: 0.25rem 0.5rem; margin-left:0.25rem;" onclick="editStudentByTeacher('${s.studentKey}')">تعديل</button>
        <button class="btn btn-outline btn-sm" style="border-color:var(--error); color:var(--error); padding: 0.25rem 0.5rem;" onclick="deleteStudentByTeacher('${s.studentKey}')">حذف</button>
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
  systemState.editingStudentKey = null;
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
  systemState.editingStudentKey = null;
};

// حفظ طالب جديد أو تعديل بياناته من قبل المعلم
window.saveNewStudentByTeacher = function() {
  const name = document.getElementById("new-student-name").value.trim();
  const id = document.getElementById("new-student-id").value.trim();
  const code = document.getElementById("new-student-code").value.trim();

  if (!name || !id || !code) {
    alert("يرجى ملء جميع الحقول المطلوبة (الاسم، ID، كود الاشتراك)!");
    return;
  }

  if (systemState.editingStudentKey) {
    // تعديل بيانات طالب موجود
    const student = systemState.students.find(s => s.id === systemState.editingStudentKey);
    if (student) {
      // التأكد من عدم تكرار الـ ID الجديد مع طالب آخر
      const isDuplicate = systemState.students.some(s => s.id === id && s.id !== systemState.editingStudentKey);
      if (isDuplicate) {
        alert("رقم المعرف ID الجديد مسجل بالفعل لطالب آخر!");
        return;
      }
      student.name = name;
      student.id = id;
      student.code = code;
      saveSystemState(true);
      renderTeacherStudentsTable();
      hideAddStudentModal();
      alert(`تم تعديل بيانات الطالب "${name}" بنجاح!`);
    }
  } else {
    // إضافة طالب جديد
    const isDuplicate = id && systemState.students.some(s => normalizeStudentId(s.id) === id);
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
    saveSystemState(true);
    renderTeacherStudentsTable();
    hideAddStudentModal();
    alert(`تم تسجيل الطالب "${name}" وكود اشتراكه بنجاح!`);
  }
};

// تعديل طالب من قبل المعلم
window.editStudentByTeacher = function(studentId) {
  const student = systemState.students.find(s => s.id === studentId);
  if (!student) return;

  systemState.editingStudentKey = studentId;

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
    saveSystemState(true);
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

// حفظ الجلسة الجارية للطالب لمنع فقدان البيانات عند التحديث
function saveActiveStudentSession() {
  if (!systemState.isExamActive || !systemState.currentStudent || !systemState.currentExam) return;
  const session = {
    student: systemState.currentStudent,
    examId: systemState.currentExam.id,
    shuffledQuestions: systemState.shuffledQuestions,
    currentExamRuntime: systemState.currentExamRuntime,
    currentQuestionIndex: systemState.currentQuestionIndex,
    studentAnswers: systemState.studentAnswers,
    cheatViolations: systemState.cheatViolations,
    currentExamRuntime: systemState.currentExamRuntime,
    timeRemaining: systemState.timer.timeRemaining
  };
  localStorage.setItem("arabya_active_student_session", JSON.stringify(session));
}

// تحديث نتيجة غير مكتملة سحابياً ومحلياً أثناء تقدم الطالب
function updateLiveIncompleteResult() {
  if (!systemState.currentExam || !systemState.currentStudent) return;
  const id = systemState.currentStudent.id || "";
  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  const examId = systemState.currentExam.id;
  let res = systemState.results.find(r => r.studentLookupKey === studentLookupKey && r.examId === examId && r.status === "incomplete");

  if (!res) {
    res = {
      recordId: createRecordId("incomplete"),
      name: systemState.currentStudent.name,
      id,
      accessCode: systemState.currentStudent.accessCode || "",
      studentLookupKey,
      email: systemState.currentStudent.email || "",
      mobile: systemState.currentStudent.mobile || "",
      examTitle: systemState.currentExam.title,
      examId,
      university: systemState.currentExam.university,
      faculty: systemState.currentExam.faculty,
      level: systemState.currentExam.level,
      examType: systemState.currentExam.examType,
      score: "جاري أداء الامتحان (غير مكتمل)",
      details: "بدأ الطالب الامتحان ولم يسلم بعد.",
      timestamp: new Date().toLocaleString("ar-EG"),
      studentAnswers: {},
      questionScores: {},
      maxScore: getCurrentExamTotalScore(),
      presentedQuestions: JSON.parse(JSON.stringify(systemState.shuffledQuestions)),
      status: "incomplete"
    };
    systemState.results.push(res);
  }

  let correctObjectiveCount = 0;
  let objectiveQuestionsCount = 0;
  let detailsLog = [];
  const questionScoresMap = {};

  systemState.shuffledQuestions.forEach(q => {
    const studentAns = systemState.studentAnswers[q.id];
    const qPoints = q.points !== undefined ? q.points : 10;

    if (q.type === "essay") {
      const ansText = studentAns || "(لم يكتب إجابة بعد)";
      detailsLog.push(`س مقالي (وزنها ${qPoints} نقاط): ${q.question} 
 إجابة الطالب: ${ansText}
-----------------`);
      questionScoresMap[q.id] = 0;
    } else {
      objectiveQuestionsCount++;
      const isCorrect = studentAns === q.correctAnswer;
      if (studentAns !== undefined && studentAns !== -1 && studentAns !== -2 && isCorrect) {
        correctObjectiveCount++;
        questionScoresMap[q.id] = qPoints;
      } else {
        questionScoresMap[q.id] = 0;
      }

      let studentAnsText = "لم تتم الإجابة بعد";
      if (studentAns === -1) studentAnsText = "انتهى الوقت";
      else if (studentAns === -2) studentAnsText = "ملغي (غش)";
      else if (studentAns !== undefined) studentAnsText = q.options[studentAns];
      detailsLog.push(`س (وزنها ${qPoints} نقاط): ${q.question} | إجابة الطالب: ${studentAnsText}`);
    }
  });

  const currentProgress = systemState.currentQuestionIndex + 1;
  res.score = `جاري الأداء (${correctObjectiveCount}/${objectiveQuestionsCount} موضوعي، تقدم: ${currentProgress}/${systemState.shuffledQuestions.length})`;
  res.details = detailsLog.join("\n");
  res.studentAnswers = { ...systemState.studentAnswers };
  res.questionScores = questionScoresMap;
  res.maxScore = getCurrentExamTotalScore();
  res.presentedQuestions = JSON.parse(JSON.stringify(systemState.shuffledQuestions));
  res.timestamp = new Date().toLocaleString("ar-EG");

  saveSystemState(false);
}
