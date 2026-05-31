/**
 * arabya.ai - ملف المنطق البرمجي الموحد المطور (app.js)
 * يتحكم في التوجيه، وإدارة الامتحانات، وتصميم الأسئلة اللانهائية والمقالية والموضوعية ذات الأوزان المخصصة،
 * والتكامل السحابي الثنائي، مع تطبيق معايير إتاحة الوصول (WAI-ARIA) الكاملة للطلاب المكفوفين.
 */

// كائن الحالة العامة للنظام
const ARABYA_APP_VERSION = "2026.05.31.12";
window.ARABYA_APP_VERSION = ARABYA_APP_VERSION;

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
  stripEmptyHashFromUrl();
  setupNavigation();
  setupUIEventListeners();
  setupAntiCheatHandlers();
  setupStudentAutofill();
  setupArabyaLiveDataRefresh();
  hydrateGoogleSheetsScriptBox();

  // ===== تشخيص ما تم تحميله =====
  console.log(`[ARABYA] إصدار المنصة: ${ARABYA_APP_VERSION}`);
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
            if (isExamPastDeadline(matchedExam)) {
              alert(getExamDeadlineBlockMessage(matchedExam));
              localStorage.removeItem("arabya_active_student_session");
            } else {
              systemState.currentExam = matchedExam;
              systemState.shuffledQuestions = session.shuffledQuestions || buildRuntimeQuestionsForExam(matchedExam);
              systemState.currentExamRuntime = session.currentExamRuntime || calculateRuntimeExamMeta(systemState.shuffledQuestions);
              systemState.currentQuestionIndex = session.currentQuestionIndex || 0;
              systemState.studentAnswers = session.studentAnswers || {};
              systemState.cheatViolations = session.cheatViolations || 0;
              systemState.isExamActive = true;
              systemState.isCheatingSuspended = false;
              markExamAntiCheatStarted();
              navigateToView("exam-runner-view");
              renderRunnerQuestion();
              showMobileExamHintIfNeeded();
              const resumeQuestion = systemState.shuffledQuestions[systemState.currentQuestionIndex];
              startRunnerTimerWithTime(session.timeRemaining || getQuestionTimeSeconds(resumeQuestion, matchedExam));
              return;
            }
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
      const configCode = parsedConfig.teacherCode || parsedConfig.autoEntryCode;
      if (configCode) {
        syncActiveTeacherCredentials(String(configCode).trim());
      }
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    } catch(e){}
  }

  const savedProfile = localStorage.getItem("arabya_teacher_profile");
  if (savedProfile && systemState.activeTeacher) {
    try {
      const parsedProfile = JSON.parse(savedProfile);
      systemState.teacherProfile = parsedProfile;
      if (parsedProfile.name) systemState.activeTeacher.name = parsedProfile.name;
      if (parsedProfile.subject) systemState.activeTeacher.subject = parsedProfile.subject;
      const storedCode = systemState.activeTeacher.autoEntryCode || systemState.activeTeacher.password || systemState.config?.teacherCode || systemState.config?.autoEntryCode;
      if (storedCode) {
        systemState.teacherProfile.autoEntryCode = storedCode;
      } else if (parsedProfile.autoEntryCode) {
        syncActiveTeacherCredentials(parsedProfile.autoEntryCode);
      }
      localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
      localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    } catch(e){}
  }

  if (systemState.activeTeacher) {
    syncActiveTeacherCredentials();
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
  hydratePresentedQuestionsForResults();

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

function syncActiveTeacherCredentials(preferredCode = "") {
  if (!systemState.activeTeacher) return;
  const code = String(
    preferredCode ||
    systemState.activeTeacher.autoEntryCode ||
    systemState.activeTeacher.password ||
    systemState.config?.autoEntryCode ||
    systemState.config?.teacherCode ||
    ""
  ).trim();
  if (!code) return;
  systemState.activeTeacher.autoEntryCode = code;
  systemState.activeTeacher.password = code;
  systemState.config = {
    ...(systemState.config || {}),
    autoEntryCode: code,
    teacherCode: code
  };
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx].autoEntryCode = code;
    systemState.teachers[idx].password = code;
  }
  try {
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  } catch (e) {}
}

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
    if (!Number.isFinite(res.savedAt)) {
      const match = String(res.recordId || "").match(/(?:result|incomplete|record)_(\d{10,})_/i);
      if (match) {
        res.savedAt = parseInt(match[1], 10);
        changed = true;
      }
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
  const digits = (code || "").toString().replace(/\D/g, "").slice(0, 5);
  if (digits && /^0+$/.test(digits)) {
    return "00000";
  }
  return digits;
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

function findStudentByCode(code, options = {}) {
  const clean = sanitizeStudentCodeInput(code);
  if (!isFiveDigitStudentCode(clean)) return null;
  if (isSharedStudentCode(clean)) {
    const normalizedId = normalizeStudentId(options.studentId);
    const normalizedName = normalizeStudentName(options.name);
    if (normalizedId) {
      const byId = systemState.students.find(
        s => sanitizeStudentCodeInput(s.code) === clean && normalizeStudentId(s.id) === normalizedId
      );
      if (byId) return byId;
    }
    if (normalizedName) {
      return systemState.students.find(
        s => sanitizeStudentCodeInput(s.code) === clean && normalizeStudentName(s.name) === normalizedName
      ) || null;
    }
    return null;
  }
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

function findStudentByKey(studentKey) {
  if (!studentKey) return null;
  return systemState.students.find(student => student.studentKey === studentKey) || null;
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
    if (!Number.isFinite(normalizedStudent.savedAt)) {
      const match = String(normalizedStudent.studentKey || "").match(/(?:student|record)_(\d{10,})_/i);
      if (match) normalizedStudent.savedAt = parseInt(match[1], 10);
    }
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
  if (exam.endsAt) {
    const parsedEnd = new Date(exam.endsAt);
    if (Number.isNaN(parsedEnd.getTime())) {
      exam.endsAt = "";
    } else {
      exam.endsAt = parsedEnd.toISOString();
    }
  }
  exam.questions.forEach((question) => {
    const parsedTime = parseInt(question.timeSeconds, 10);
    if (!Number.isFinite(parsedTime) || parsedTime <= 0) {
      question.timeSeconds = 60;
    } else {
      question.timeSeconds = Math.max(5, parsedTime);
    }
  });
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


function isSupersededResult(res) {
  return !!(res && res.superseded);
}

function getActiveResultsList(results) {
  return (Array.isArray(results) ? results : []).filter(res => !isSupersededResult(res));
}

function getRetakeGrantButtonLabel(res) {
  if (!res) return "السماح بإعادة الامتحان";
  if (res.status === "canceled") return "السماح بإعادة الامتحان بعد الإلغاء";
  return "السماح بإعادة الامتحان";
}

function getRetakeGrantConfirmMessage(res) {
  const examTitle = res?.examTitle || "الامتحان";
  if (res?.status === "canceled") {
    return `هل تريد السماح للطالب "${res.name}" بإعادة أداء "${examTitle}" بعد الإلغاء؟\n\nلن تُحذف المحاولة الأولى — تبقى محفوظة في السجل حتى ينهي الطالب المحاولة الجديدة.`;
  }
  return `هل تريد السماح للطالب "${res.name}" بإعادة أداء "${examTitle}"؟\n\nلن تُحذف المحاولة الأولى (الدرجة: ${res.score || "—"}) — ستُؤرشف كـ «محاولة سابقة» فقط بعد إكمال الطالب للمحاولة الجديدة.`;
}

function getNextAttemptNumber(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return 1;
  const attempts = (systemState.results || []).filter(res =>
    res.studentLookupKey === studentLookupKey && res.examId === examId
  );
  return attempts.length + 1;
}

function syncRetakeAffectedResultsToCloud(results, syncStatusEl) {
  const rows = Array.isArray(results) ? results.filter(Boolean) : [];
  if (!rows.length) return;
  rows.forEach(res => sendUpdatedResultToCloud(res, syncStatusEl));
  pushCloudBackupNow().catch(() => {});
}


function findActiveRetakeGrant(studentLookupKey, examId) {
  if (!studentLookupKey || !examId) return null;
  return systemState.results.find(r =>
    r.studentLookupKey === studentLookupKey &&
    r.examId === examId &&
    r.allowRetake === true &&
    !r.superseded &&
    r.status !== "incomplete"
  ) || null;
}

function resultCanGrantRetake(res) {
  if (!res || isSupersededResult(res) || res.status === "incomplete") return false;
  return res.allowRetake !== true;
}

function resultHasActiveRetakeGrant(res) {
  return !!(res && res.allowRetake === true && !isSupersededResult(res) && res.status !== "incomplete");
}

function getResultRetakeStatusText(res) {
  if (!res) return "—";
  if (isSupersededResult(res)) {
    const scoreHint = res.archivedScoreSnapshot || res.score || "—";
    return `محاولة سابقة محفوظة (الدرجة: ${scoreHint})`;
  }
  if (resultHasActiveRetakeGrant(res)) return "مسموح بإعادة الامتحان — المحاولة الأولى محفوظة";
  if (res.status === "canceled") return "ملغى — بانتظار السماح بإعادة الامتحان";
  if (res.status === "completed") return "مكتمل — المحاولة محفوظة";
  return "—";
}

function markPriorResultsSuperseded(studentLookupKey, examId, newRecordId) {
  if (!studentLookupKey || !examId || !newRecordId) return [];
  const now = new Date().toISOString();
  const archived = [];
  systemState.results.forEach(res => {
    if (!res || res.recordId === newRecordId || isSupersededResult(res)) return;
    if (res.studentLookupKey !== studentLookupKey || res.examId !== examId) return;
    if (res.status === "incomplete") return;
    res.superseded = true;
    res.supersededAt = now;
    res.supersededByRecordId = newRecordId;
    res.allowRetake = false;
    res.archivedScoreSnapshot = res.score || "";
    res.archivedStatusSnapshot = res.status || "completed";
    archived.push(res);
  });
  return archived;
}

function appendResultRetakeActions(res, actionsCell) {
  if (!actionsCell || !res || isSupersededResult(res)) return;

  if (resultCanGrantRetake(res)) {
    const allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.className = "btn btn-outline btn-sm";
    allowBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary);";
    allowBtn.textContent = getRetakeGrantButtonLabel(res);
    allowBtn.title = "المحاولة الأولى تبقى محفوظة — تُؤرشف فقط بعد إكمال محاولة جديدة";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));
    actionsCell.appendChild(allowBtn);
  }

  if (resultHasActiveRetakeGrant(res)) {
    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn btn-outline btn-sm";
    revokeBtn.style.cssText = "border-color:var(--warning); color:var(--warning);";
    revokeBtn.textContent = "إلغاء السماح";
    revokeBtn.addEventListener("click", () => revokeStudentExamRetake(res.recordId || ""));
    actionsCell.appendChild(revokeBtn);
  }
}

function getStudentExamAttempts(res) {
  if (!res) return [];
  const lookupKey = res.studentLookupKey || getStudentLookupKey({ id: res.id, code: res.accessCode, name: res.name });
  const examId = res.examId || "";
  if (!lookupKey || !examId) return [res];
  const keys = getStudentLookupKeysForMatch({ studentKey: lookupKey, id: res.id, code: res.accessCode, name: res.name });
  return (systemState.results || [])
    .filter(r => r.examId === examId && keys.some(key => key && (r.studentLookupKey === key || getStudentLookupKeysForMatch({ id: r.id, code: r.accessCode, name: r.name }).includes(key))))
    .sort((a, b) => {
      const na = Number(a.attemptNumber) || 0;
      const nb = Number(b.attemptNumber) || 0;
      if (na && nb && na !== nb) return nb - na;
      return compareResultsByRecency(a, b, buildResultIndexMap(systemState.results));
    });
}

function renderStudentAttemptsPanel(currentRes) {
  const panel = document.getElementById("detail-attempts-panel");
  const listEl = document.getElementById("detail-attempts-list");
  if (!panel || !listEl) return;

  const attempts = getStudentExamAttempts(currentRes);
  if (attempts.length <= 1) {
    panel.classList.add("hidden");
    listEl.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  listEl.innerHTML = attempts.map(attempt => {
    const isCurrent = attempt.recordId === currentRes.recordId;
    const status = isSupersededResult(attempt) ? "محاولة سابقة" : getResultDisplayStatus(attempt) === "canceled" ? "ملغاة" : resultHasActiveRetakeGrant(attempt) ? "مسموح بإعادة الامتحان" : "المحاولة الحالية";
    const scoreText = attempt.archivedScoreSnapshot || attempt.score || "—";
    const tone = isSupersededResult(attempt) ? "var(--text-muted)" : attempt.status === "canceled" ? "var(--error)" : "var(--secondary)";
    return `<button type="button" class="detail-attempt-item${isCurrent ? " is-current" : ""}" data-record-id="${escapeHtml(attempt.recordId || "")}" data-student-id="${escapeHtml(attempt.id || "")}" data-exam-id="${escapeHtml(attempt.examId || "")}" style="width:100%; text-align:right; border:1px solid var(--border-color); border-radius:10px; padding:0.85rem 1rem; margin-bottom:0.5rem; background:${isCurrent ? "rgba(20,184,166,0.08)" : "rgba(255,255,255,0.02)"}; color:inherit; cursor:pointer;">` +
      `<div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start; flex-wrap:wrap;">` +
      `<div><div style="font-weight:700; color:${tone};">${escapeHtml(status)}${attempt.attemptNumber ? ` • محاولة ${attempt.attemptNumber}` : ""}</div>` +
      `<div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(attempt.timestamp || "—")}</div></div>` +
      `<div style="font-weight:800; color:var(--secondary);">${escapeHtml(scoreText)}</div>` +
      `</div></button>`;
  }).join("");

  listEl.querySelectorAll(".detail-attempt-item").forEach(btn => {
    btn.addEventListener("click", () => {
      viewTeacherResultDetail(btn.dataset.recordId || "", btn.dataset.studentId || "", btn.dataset.examId || "");
    });
  });
}

function renderResultRetakeManagementPanel(res) {
  const statusEl = document.getElementById("detail-retake-status");
  const actionsEl = document.getElementById("detail-retake-actions");
  if (!statusEl || !actionsEl) return;

  const statusText = getResultRetakeStatusText(res);
  const tone = isSupersededResult(res)
    ? "var(--text-muted)"
    : resultHasActiveRetakeGrant(res)
      ? "var(--secondary)"
      : res.status === "canceled"
        ? "var(--error)"
        : "var(--text-muted)";

  statusEl.innerHTML = `<strong style="color:${tone};">${escapeHtml(statusText)}</strong>` +
    (res.retakeGrantedAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">تاريخ السماح: ${escapeHtml(formatRetakeTimestamp(res.retakeGrantedAt))}</div>` : "") +
    (res.supersededAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">استُبدلت بتاريخ: ${escapeHtml(formatRetakeTimestamp(res.supersededAt))}</div>` : "");

  actionsEl.innerHTML = "";
  if (isSupersededResult(res)) {
    actionsEl.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">هذه محاولة سابقة محفوظة للأرشفة فقط.</span>`;
    return;
  }

  if (resultCanGrantRetake(res)) {
    const allowBtn = document.createElement("button");
    allowBtn.type = "button";
    allowBtn.className = "btn btn-outline btn-sm";
    allowBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary);";
    allowBtn.textContent = getRetakeGrantButtonLabel(res);
    allowBtn.title = "المحاولة الأولى تبقى محفوظة — تُؤرشف فقط بعد إكمال محاولة جديدة";
    allowBtn.addEventListener("click", () => allowStudentExamRetake(res.recordId || ""));
    actionsEl.appendChild(allowBtn);
  }

  if (resultHasActiveRetakeGrant(res)) {
    const revokeBtn = document.createElement("button");
    revokeBtn.type = "button";
    revokeBtn.className = "btn btn-outline btn-sm";
    revokeBtn.style.cssText = "border-color:var(--warning); color:var(--warning);";
    revokeBtn.textContent = "إلغاء السماح بإعادة التقديم";
    revokeBtn.addEventListener("click", () => revokeStudentExamRetake(res.recordId || ""));
    actionsEl.appendChild(revokeBtn);
  }
}

function formatRetakeTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  }
  return String(value);
}

function buildResultCloudRetakeFields(res) {
  return {
    allowRetake: !!res?.allowRetake,
    superseded: !!res?.superseded,
    retakeGrantedAt: res?.retakeGrantedAt || "",
    retakeRevokedAt: res?.retakeRevokedAt || "",
    supersededAt: res?.supersededAt || "",
    supersededByRecordId: res?.supersededByRecordId || ""
  };
}

window.allowStudentExamRetake = function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (!resultCanGrantRetake(res)) {
    alert("لا يمكن منح إعادة التقديم لهذا السجل حالياً.");
    return;
  }
  if (!confirm(getRetakeGrantConfirmMessage(res))) return;

  res.allowRetake = true;
  res.retakeGrantedAt = new Date().toISOString();
  res.retakeGrantedBy = systemState.activeTeacher?.username || "teacher";
  delete res.retakeRevokedAt;
  saveSystemState(true);
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
    renderResultRetakeManagementPanel(res);
  }
  const syncEl = document.getElementById("grading-sync-status");
  sendUpdatedResultToCloud(res, syncEl);
  alert(`تم السماح للطالب "${res.name}" بإعادة أداء الامتحان.\n\nالمحاولة الأولى ما زالت محفوظة — لن تُؤرشف إلا بعد إكمال الطالب لمحاولة جديدة.`);
};

window.revokeStudentExamRetake = function(recordId) {
  const res = systemState.results.find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  if (!resultHasActiveRetakeGrant(res)) {
    alert("لا يوجد سماح نشط بإعادة التقديم على هذا السجل.");
    return;
  }
  if (!confirm(`هل تريد إلغاء السماح بإعادة التقديم للطالب "${res.name}"؟`)) return;

  res.allowRetake = false;
  res.retakeRevokedAt = new Date().toISOString();
  saveSystemState(true);
  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === res.recordId) {
    renderResultRetakeManagementPanel(res);
  }
  const syncEl = document.getElementById("grading-sync-status");
  sendUpdatedResultToCloud(res, syncEl);
  alert("تم إلغاء السماح بإعادة التقديم.");
};

function findBlockingExamResult(studentLookupKey, examId, studentContext) {
  if (!examId) return null;
  const keys = studentContext
    ? getStudentLookupKeysForMatch(studentContext)
    : (studentLookupKey ? [studentLookupKey] : []);
  if (!keys.length) return null;
  if (keys.some(key => findActiveRetakeGrant(key, examId))) return null;
  return systemState.results.find(r =>
    keys.includes(r.studentLookupKey) &&
    r.examId === examId &&
    !isSupersededResult(r) &&
    r.status !== "incomplete" &&
    r.allowRetake !== true &&
    (r.status === "completed" || r.status === "canceled")
  ) || null;
}

function getStudentCanceledExamIds(studentLookupKey) {
  if (!studentLookupKey) return [];
  const ids = new Set();
  systemState.results.forEach(r => {
    if (isSupersededResult(r)) return;
    if (r.studentLookupKey === studentLookupKey && r.status === "canceled" && r.allowRetake !== true && r.examId) {
      ids.add(r.examId);
    }
  });
  return [...ids];
}

function formatResultStatusBadge(res) {
  if (isSupersededResult(res)) {
    return '<span style="color:var(--text-muted); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[محاولة سابقة]</span>';
  }
  if (resultHasActiveRetakeGrant(res)) {
    return '<span style="color:var(--secondary); font-weight:700; font-size:0.8rem; margin-right:0.35rem;">[مسموح بإعادة التقديم]</span>';
  }
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



function normalizeQuestionMatchText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractQuestionTextsFromResultDetails(details) {
  if (!details || typeof details !== "string") return [];
  const texts = [];
  const chunks = details.split(/\n-{3,}\n?/);
  chunks.forEach(chunk => {
    const lines = chunk.split("\n").map(line => line.trim()).filter(Boolean);
    lines.forEach(line => {
      const objectiveMatch = line.match(/^س\s*\(وزنها\s*\d+\s*نق(?:طة|اط)?\)\s*:\s*(.+?)\s*\|\s*إجابة/i);
      if (objectiveMatch) {
        texts.push(objectiveMatch[1].trim());
        return;
      }
      const essayMatch = line.match(/^س\s*مقالي\s*\(وزنها\s*\d+\s*نق(?:طة|اط)?\)\s*:\s*(.+)$/i);
      if (essayMatch) {
        texts.push(essayMatch[1].trim());
      }
    });
  });
  return texts;
}

function matchPresentedQuestionsFromDetails(res, exam) {
  if (!exam || !Array.isArray(exam.questions) || !res?.details) return [];
  const texts = extractQuestionTextsFromResultDetails(res.details);
  if (!texts.length) return [];

  const usedIds = new Set();
  const matched = [];
  texts.forEach(text => {
    const normalizedText = normalizeQuestionMatchText(text);
    if (!normalizedText) return;
    const question = exam.questions.find(item => {
      if (usedIds.has(item.id)) return false;
      const normalizedQuestion = normalizeQuestionMatchText(item.question);
      return normalizedQuestion === normalizedText
        || normalizedQuestion.includes(normalizedText)
        || normalizedText.includes(normalizedQuestion);
    });
    if (question) {
      usedIds.add(question.id);
      matched.push(question);
    }
  });
  return matched;
}

/** الأسئلة التي ظهرت للطالب فعلاً (وليس بنك الأسئلة كاملاً) */
function getPresentedQuestionsForResult(res, exam) {
  if (Array.isArray(res?.presentedQuestions) && res.presentedQuestions.length > 0) {
    return res.presentedQuestions;
  }

  const answerKeys = new Set([
    ...Object.keys(res?.studentAnswers || {}),
    ...Object.keys(res?.questionScores || {})
  ].filter(key => key !== "undefined" && key !== "null"));

  if (exam && Array.isArray(exam.questions) && answerKeys.size > 0) {
    const filtered = exam.questions.filter(q => answerKeys.has(String(q.id)));
    if (filtered.length > 0) {
      return filtered;
    }
  }

  if (answerKeys.size > 0) {
    return [...answerKeys]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((qId, idx) => ({
        id: parseInt(qId, 10),
        type: "multiple",
        question: `سؤال ${idx + 1}`,
        options: ["لا يوجد"],
        correctAnswer: 0,
        points: (res.questionScores || {})[qId] ?? 10
      }));
  }

  if (exam && res?.details) {
    const fromDetails = matchPresentedQuestionsFromDetails(res, exam);
    if (fromDetails.length > 0) {
      return fromDetails;
    }
  }

  const configuredCount = getConfiguredQuestionCount(exam);
  if (exam && Array.isArray(exam.questions)) {
    if (configuredCount && configuredCount < exam.questions.length) {
      return [];
    }
    return exam.questions;
  }

  return [];
}


function hydratePresentedQuestionsForResults() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return false;
  let changed = false;
  systemState.results.forEach(res => {
    if (Array.isArray(res.presentedQuestions) && res.presentedQuestions.length > 0) return;
    const exam = systemState.exams.find(item => item.id === res.examId);
    const resolved = getPresentedQuestionsForResult(res, exam);
    const bankSize = Array.isArray(exam?.questions) ? exam.questions.length : 0;
    const configuredCount = getConfiguredQuestionCount(exam);
    const shouldPersist = resolved.length > 0 && (
      (configuredCount && resolved.length <= configuredCount)
      || (bankSize && resolved.length < bankSize)
    );
    if (shouldPersist) {
      res.presentedQuestions = JSON.parse(JSON.stringify(resolved));
      changed = true;
    }
  });
  if (changed) {
    try {
      localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));
    } catch (e) {
      console.error("hydratePresentedQuestionsForResults:", e);
    }
  }
  return changed;
}


function calculateRuntimeExamMeta(questions) {
  const questionList = Array.isArray(questions) ? questions : [];
  const maxScore = questionList.reduce((sum, question) => {
    const points = parseFloat(question?.points);
    return sum + (Number.isFinite(points) ? points : 10);
  }, 0);
  return { maxScore };
}

function teacherCredentialMatches(teacher, credential) {
  if (!teacher || credential === undefined || credential === null) return false;
  const val = String(credential).trim();
  if (!val) return false;
  return teacher.password === val || teacher.autoEntryCode === val;
}

function parseExamEndsAtInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function formatExamEndsAtForInput(isoValue) {
  if (!isoValue) return "";
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function isExamPastDeadline(exam) {
  if (!exam || !exam.endsAt) return false;
  const end = new Date(exam.endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return Date.now() > end.getTime();
}

function getExamDeadlineBlockMessage(exam) {
  if (!exam || !exam.endsAt) return "";
  const end = new Date(exam.endsAt);
  const when = Number.isNaN(end.getTime())
    ? exam.endsAt
    : end.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  return `انتهى موعد هذا الامتحان في ${when}. لا يمكن الدخول أو أداء الأسئلة. يمكن للمعلم تمديد الموعد من إعدادات الامتحان.`;
}

function getQuestionTimeSeconds(question, exam) {
  if (question && question.timeSeconds !== undefined && question.timeSeconds !== null) {
    const perQ = parseInt(question.timeSeconds, 10);
    if (Number.isFinite(perQ) && perQ > 0) {
      return Math.max(5, perQ);
    }
  }
  const examTimeLimitMinutes = (exam && exam.timeLimit) || 60;
  const questionsCount = (exam && exam.questions && exam.questions.length) || 1;
  return Math.max(30, Math.floor((examTimeLimitMinutes * 60) / questionsCount));
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
  } else if (isSharedStudentCode(normalizedStudent.code)) {
    existingStudent = findStudentByCode(normalizedStudent.code, {
      studentId: normalizedStudent.id,
      name: normalizedStudent.name
    });
  }
  if (!existingStudent && normalizedStudent.id) {
    existingStudent = findStudentById(normalizedStudent.id);
  }
  if (!existingStudent && normalizedStudent.name && !isSharedStudentCode(normalizedStudent.code)) {
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


function getStudentLookupKeysForMatch(student) {
  const keys = new Set();
  if (!student) return [];
  const primary = student.studentKey || getStudentLookupKey(student);
  if (primary) keys.add(primary);
  const code = sanitizeStudentCodeInput(student.code || student.accessCode || "");
  if (isPrivateStudentCode(code)) keys.add(`code:${code}`);
  const id = normalizeStudentId(student.id || "");
  if (id) keys.add(`id:${id}`);
  return [...keys];
}

function validateStudentIdentityInput(id, code, options = {}) {
  const normalizedId = normalizeStudentId(id);
  const inputCode = sanitizeStudentCodeInput(code);
  const editingStudentKey = options.editingStudentKey || "";

  if (!inputCode) return { ok: true };

  if (!isFiveDigitStudentCode(inputCode)) {
    return { ok: false, message: "كود الاشتراك يجب أن يكون مكوّناً من 5 أرقام." };
  }

  if (isPrivateStudentCode(inputCode)) {
    const owners = systemState.students.filter(student => sanitizeStudentCodeInput(student.code) === inputCode);
    if (owners.length > 1) {
      return {
        ok: false,
        message: "هذا الكود مكرر داخل قاعدة الطلاب، ولا يمكن استخدامه حتى يقوم المعلم بتخصيص كود مختلف لكل طالب."
      };
    }
    if (owners.length === 1) {
      const owner = owners[0];
      if (editingStudentKey && owner.studentKey === editingStudentKey) {
        return { ok: true };
      }
      const ownerId = normalizeStudentId(owner.id);
      if (normalizedId && ownerId && ownerId !== normalizedId) {
        return {
          ok: false,
          message: "كود الاشتراك الذي أدخلته مخصص لطالب آخر. اكتب الكود الصحيح الخاص بك أو اترك حقل ID فارغاً."
        };
      }
      return { ok: true };
    }
    if (normalizedId) {
      const idOwner = findStudentById(normalizedId);
      if (idOwner && sanitizeStudentCodeInput(idOwner.code) && sanitizeStudentCodeInput(idOwner.code) !== inputCode) {
        return {
          ok: false,
          message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. استخدم الكود الأصلي لهذا ID أو اترك ID فارغاً واكتب كودك فقط."
        };
      }
    }
    return { ok: true };
  }

  if (isSharedStudentCode(inputCode)) {
    if (!normalizedId) {
      return {
        ok: false,
        message: "مع كود 00000 المشترك يجب إدخال رقم ID المطابق لسجلك في النظام."
      };
    }
    const idOwner = findStudentById(normalizedId);
    if (idOwner && sanitizeStudentCodeInput(idOwner.code) && sanitizeStudentCodeInput(idOwner.code) !== inputCode) {
      return {
        ok: false,
        message: "رقم المعرف ID مسجل بالفعل بكود اشتراك مختلف. استخدم الكود الأصلي الخاص بهذا الطالب."
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

window.arabyaValidateStudentIdentity = validateStudentIdentityInput;
window.normalizeStudentId = normalizeStudentId;
window.sanitizeStudentCodeInput = sanitizeStudentCodeInput;
window.isPrivateStudentCode = isPrivateStudentCode;
window.isSharedStudentCode = isSharedStudentCode;
window.isFiveDigitStudentCode = isFiveDigitStudentCode;

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



function normalizeTimestampText(value) {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
  return String(value || "")
    .replace(/[٠-٩]/g, ch => String(arabicIndic.indexOf(ch)))
    .replace(/[۰-۹]/g, ch => String(easternArabic.indexOf(ch)))
    .trim();
}

function getResultSortTime(res, fallbackIndex = 0) {
  const parsed = parseResultTimestamp(res?.timestamp);
  if (parsed) return parsed.getTime();
  const recordId = String(res?.recordId || "");
  const match = recordId.match(/(?:result|incomplete|record)_(\d{10,})_/i);
  if (match) return parseInt(match[1], 10);
  if (Number.isFinite(res?.savedAt)) return res.savedAt;
  return fallbackIndex;
}

function compareResultsByRecency(a, b, indexMap) {
  const ta = getResultSortTime(a, indexMap.get(a) ?? 0);
  const tb = getResultSortTime(b, indexMap.get(b) ?? 0);
  if (tb !== ta) return tb - ta;
  return (indexMap.get(b) ?? 0) - (indexMap.get(a) ?? 0);
}


function buildResultIndexMap(sourceList) {
  const indexMap = new Map();
  (sourceList || []).forEach((res, index) => indexMap.set(res, index));
  return indexMap;
}


const TABLE_SORT_OPTIONS = [
  { value: "newest", label: "الأحدث أولاً" },
  { value: "oldest", label: "الأقدم أولاً" },
  { value: "name_asc", label: "الاسم (أ → ي)" },
  { value: "name_desc", label: "الاسم (ي → أ)" }
];

function normalizeTableSortOrder(value, fallback = "newest") {
  const allowed = TABLE_SORT_OPTIONS.map(option => option.value);
  return allowed.includes(value) ? value : fallback;
}

function getStudentSortTime(student, fallbackIndex = 0) {
  const parsed = parseResultTimestamp(student?.timestamp);
  if (parsed) return parsed.getTime();
  const studentKey = String(student?.studentKey || "");
  const match = studentKey.match(/(?:student|record)_(\d{10,})_/i);
  if (match) return parseInt(match[1], 10);
  if (Number.isFinite(student?.savedAt)) return student.savedAt;
  return fallbackIndex;
}

function compareStudentsByRecency(a, b, indexMap) {
  const ta = getStudentSortTime(a, indexMap.get(a) ?? 0);
  const tb = getStudentSortTime(b, indexMap.get(b) ?? 0);
  if (tb !== ta) return tb - ta;
  return (indexMap.get(b) ?? 0) - (indexMap.get(a) ?? 0);
}

function sortStudentsForDisplay(students, sortOrder, sourceList) {
  const list = Array.isArray(students) ? [...students] : [];
  const order = normalizeTableSortOrder(sortOrder);
  const base = Array.isArray(sourceList) ? sourceList : (systemState.students || []);
  const indexMap = buildResultIndexMap(base);

  if (order === "name_asc") {
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }
  if (order === "name_desc") {
    return list.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), "ar"));
  }
  if (order === "oldest") {
    return list.sort((a, b) => compareStudentsByRecency(a, b, indexMap) * -1);
  }
  return list.sort((a, b) => compareStudentsByRecency(a, b, indexMap));
}

const RESULTS_TABLE_SORTABLE_COLUMNS = [
  { key: "name", label: "اسم الطالب" },
  { key: "id", label: "رقم ID" },
  { key: "accessCode", label: "كود الاشتراك" },
  { key: "examTitle", label: "الامتحان" },
  { key: "score", label: "النتيجة" },
  { key: "timestamp", label: "التاريخ والوقت" }
];

const STUDENTS_TABLE_SORTABLE_COLUMNS = [
  { key: "name", label: "اسم الطالب" },
  { key: "id", label: "رقم ID" },
  { key: "code", label: "كود الاشتراك" },
  { key: "email", label: "البريد" },
  { key: "mobile", label: "الموبايل" },
  { key: "timestamp", label: "تاريخ التسجيل" }
];

function normalizeColumnSortDirection(value) {
  return value === "asc" ? "asc" : "desc";
}

function getColumnSortValue(item, key, indexMap) {
  if (key === "timestamp") {
    return getResultSortTime(item, indexMap?.get?.(item) ?? 0);
  }
  if (key === "score") {
    const match = String(item.score || "").match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : -1;
  }
  return String(item[key] || "").toLocaleLowerCase("ar");
}

function compareResultsByColumn(a, b, key, dir, indexMap) {
  const av = getColumnSortValue(a, key, indexMap);
  const bv = getColumnSortValue(b, key, indexMap);
  let cmp = 0;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), "ar", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareStudentsByColumn(a, b, key, dir, indexMap) {
  if (key === "timestamp") {
    const ta = getStudentSortTime(a, indexMap.get(a) ?? 0);
    const tb = getStudentSortTime(b, indexMap.get(b) ?? 0);
    const cmp = ta - tb;
    return dir === "asc" ? cmp : -cmp;
  }
  const av = String(a[key] || "");
  const bv = String(b[key] || "");
  const cmp = av.localeCompare(bv, "ar", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function applyResultsColumnSort(list, columnSort, sourceList) {
  if (!columnSort || !columnSort.key) return list;
  const indexMap = buildResultIndexMap(sourceList || list);
  return [...list].sort((a, b) => compareResultsByColumn(a, b, columnSort.key, normalizeColumnSortDirection(columnSort.dir), indexMap));
}

function applyStudentsColumnSort(list, columnSort, sourceList) {
  if (!columnSort || !columnSort.key) return list;
  const base = Array.isArray(sourceList) ? sourceList : list;
  const indexMap = buildResultIndexMap(base);
  return [...list].sort((a, b) => compareStudentsByColumn(a, b, columnSort.key, normalizeColumnSortDirection(columnSort.dir), indexMap));
}

function persistResultsColumnSort(columnSort) {
  try {
    localStorage.setItem("arabya_results_column_sort", JSON.stringify(columnSort || null));
  } catch (e) {}
}

function persistStudentsColumnSort(columnSort) {
  try {
    localStorage.setItem("arabya_students_column_sort", JSON.stringify(columnSort || null));
  } catch (e) {}
}

function toggleResultsColumnSort(columnKey) {
  const view = getResultsTableViewSettings();
  const current = view.columnSort || {};
  if (current.key === columnKey) {
    view.columnSort = { key: columnKey, dir: current.dir === "asc" ? "desc" : "asc" };
  } else {
    view.columnSort = { key: columnKey, dir: columnKey === "timestamp" ? "desc" : "asc" };
  }
  view.page = 1;
  persistResultsColumnSort(view.columnSort);
  renderStudentResultsTable();
}

function toggleStudentsColumnSort(columnKey) {
  const view = getStudentsTableViewSettings();
  const current = view.columnSort || {};
  if (current.key === columnKey) {
    view.columnSort = { key: columnKey, dir: current.dir === "asc" ? "desc" : "asc" };
  } else {
    view.columnSort = { key: columnKey, dir: columnKey === "timestamp" ? "desc" : "asc" };
  }
  view.page = 1;
  persistStudentsColumnSort(view.columnSort);
  renderTeacherStudentsTable();
}

function renderSortableTableHeaders(tableSelector, columns, columnSort, toggleFn) {
  const table = document.querySelector(tableSelector);
  if (!table) return;
  const theadRow = table.querySelector("thead tr");
  if (!theadRow) return;
  theadRow.innerHTML = columns.map(col => {
    const active = columnSort && columnSort.key === col.key;
    const dir = active ? normalizeColumnSortDirection(columnSort.dir) : "";
    const indicator = active ? (dir === "asc" ? " ▲" : " ▼") : "";
    return `<th scope="col" class="teacher-sortable-th${active ? " is-sorted" : ""}" data-column-sort="${col.key}" tabindex="0" role="columnheader" aria-sort="${active ? (dir === "asc" ? "ascending" : "descending") : "none"}">${col.label}${indicator}</th>`;
  }).join("") + `<th scope="col">الإجراء</th>`;
  theadRow.querySelectorAll("[data-column-sort]").forEach(th => {
    const activate = () => toggleFn(th.dataset.columnSort);
    th.addEventListener("click", activate);
    th.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

function sortResultsForDisplay(results, sortOrder, sourceList) {
  const list = Array.isArray(results) ? [...results] : [];
  const order = normalizeTableSortOrder(sortOrder);
  const base = Array.isArray(sourceList) ? sourceList : (systemState.results || []);
  const indexMap = buildResultIndexMap(base);

  if (order === "name_asc") {
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }
  if (order === "name_desc") {
    return list.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), "ar"));
  }
  if (order === "oldest") {
    return list.sort((a, b) => compareResultsByRecency(a, b, indexMap) * -1);
  }
  return list.sort((a, b) => compareResultsByRecency(a, b, indexMap));
}

function sortResultsByRecency(results, sourceList) {
  return sortResultsForDisplay(results, "newest", sourceList);
}


const TEACHER_ACTIVE_TAB_KEY = "arabya_teacher_active_tab";
const TEACHER_TAB_IDS = ["stats", "exams", "results", "students", "integration", "profile"];

function normalizeTeacherTabId(tabId) {
  const id = String(tabId || "").trim();
  return TEACHER_TAB_IDS.includes(id) ? id : "stats";
}

function getSavedTeacherActiveTab() {
  try {
    return normalizeTeacherTabId(localStorage.getItem(TEACHER_ACTIVE_TAB_KEY));
  } catch (e) {
    return "stats";
  }
}

function saveTeacherActiveTab(tabId) {
  try {
    localStorage.setItem(TEACHER_ACTIVE_TAB_KEY, normalizeTeacherTabId(tabId));
  } catch (e) {}
}

function activateTeacherTab(tabId, options = {}) {
  const normalizedTab = normalizeTeacherTabId(tabId);
  if (systemState.activeView !== "teacher-dashboard-view" && !options.force) return normalizedTab;

  document.querySelectorAll(".teacher-menu-item[data-tab]").forEach(item => {
    const isActive = item.dataset.tab === normalizedTab;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.querySelectorAll(".teacher-tab-panel").forEach(panel => {
    panel.classList.add("hidden");
  });
  const targetPanel = document.getElementById(`teacher-tab-${normalizedTab}`);
  if (targetPanel) targetPanel.classList.remove("hidden");

  if (!options.skipSave) saveTeacherActiveTab(normalizedTab);
  if (options.skipRefresh) return normalizedTab;

  reloadSystemStateFromLocalStorage();
  if (normalizedTab === "stats") {
    renderTeacherStatsDashboard();
  } else if (normalizedTab === "results") {
    if (typeof pullTeacherResultsFromCloud === "function") {
      pullTeacherResultsFromCloud();
    } else {
      syncDatabaseFromCloud({ silent: true }).finally(() => renderStudentResultsTable());
    }
  } else if (normalizedTab === "students") {
    syncDatabaseFromCloud({ silent: true }).finally(() => refreshTeacherDashboardViews({ all: true }));
  } else if (normalizedTab === "exams") {
    renderExamsList();
  }
  return normalizedTab;
}

function restoreTeacherActiveTab() {
  activateTeacherTab(getSavedTeacherActiveTab(), { skipSave: true, skipRefresh: true });
}

window.activateTeacherTab = activateTeacherTab;

function refreshTeacherDashboardViews(options = {}) {
  const refreshAll = !!options.all;
  if (typeof reloadSystemStateFromLocalStorage === "function") {
    reloadSystemStateFromLocalStorage();
  }
  const statsTab = document.getElementById("teacher-tab-stats");
  const resultsTab = document.getElementById("teacher-tab-results");
  const studentsTab = document.getElementById("teacher-tab-students");
  const examsTab = document.getElementById("teacher-tab-exams");

  if (refreshAll || (statsTab && !statsTab.classList.contains("hidden"))) {
    if (typeof renderTeacherStatsDashboard === "function") renderTeacherStatsDashboard();
  }
  if (refreshAll || (resultsTab && !resultsTab.classList.contains("hidden"))) {
    if (typeof renderStudentResultsTable === "function") renderStudentResultsTable();
  }
  if (refreshAll || (studentsTab && !studentsTab.classList.contains("hidden"))) {
    if (typeof renderTeacherStudentsTable === "function") renderTeacherStudentsTable();
  }
  if (refreshAll || (examsTab && !examsTab.classList.contains("hidden"))) {
    if (typeof renderExamsList === "function") renderExamsList();
  }
}

window.refreshTeacherDashboardViews = refreshTeacherDashboardViews;

function reloadSystemStateFromLocalStorage() {
  try {
    const teachers = localStorage.getItem("arabya_teachers_db");
    if (teachers) systemState.teachers = JSON.parse(teachers);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: teachers", e); }
  try {
    const exams = localStorage.getItem("arabya_exams_db");
    if (exams) systemState.exams = JSON.parse(exams);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: exams", e); }
  try {
    const students = localStorage.getItem("arabya_students_db");
    if (students) systemState.students = JSON.parse(students);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: students", e); }
  try {
    const results = localStorage.getItem("arabya_results_db");
    if (results) systemState.results = JSON.parse(results);
  } catch (e) { console.error("reloadSystemStateFromLocalStorage: results", e); }
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
}

function getArabyaWebAppUrls() {
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
  if (Array.isArray(systemState.teachers)) {
    systemState.teachers.forEach(t => {
      const u = t && t.integrationConfig && t.integrationConfig.googleFormUrl ? String(t.integrationConfig.googleFormUrl).trim() : "";
      if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) urls.add(u);
    });
  }
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    const u = cfg.googleFormUrl ? String(cfg.googleFormUrl).trim() : "";
    if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) urls.add(u);
  } catch (e) {}
  return Array.from(urls).map(normalizeArabyaWebAppUrl).filter(Boolean);
}

function mergeRemoteCollection_(current, incoming, keyFn) {
  const map = {};
  (current || []).forEach(item => { map[keyFn(item)] = item; });
  (incoming || []).forEach(item => {
    if (!item) return;
    const key = keyFn(item);
    map[key] = { ...(map[key] || {}), ...item };
  });
  return Object.keys(map).map(key => map[key]);
}



function mergeTeachersPreservingLocalAuth_(localTeachers, remoteTeachers) {
  const keyFn = item => String(item.username || item.name || "");
  const map = {};
  (remoteTeachers || []).forEach(item => {
    if (!item) return;
    map[keyFn(item)] = { ...item };
  });
  (localTeachers || []).forEach(local => {
    if (!local) return;
    const key = keyFn(local);
    const remote = map[key] || {};
    map[key] = {
      ...remote,
      ...local,
      password: local.password || remote.password,
      autoEntryCode: local.autoEntryCode || local.password || remote.autoEntryCode || remote.password,
      integrationConfig: {
        ...(remote.integrationConfig || {}),
        ...(local.integrationConfig || {})
      }
    };
  });
  return Object.keys(map).map(key => map[key]);
}

function hydrateStudentsFromResults(results) {
  if (!Array.isArray(results)) return;
  results.forEach(res => {
    if (!res || (!res.name && !res.id && !res.accessCode && !res.code)) return;
    upsertStudentRecord({
      name: res.name,
      id: res.id,
      code: res.accessCode || res.code,
      email: res.email,
      mobile: res.mobile
    }, res.studentLookupKey || "");
  });
  ensureStudentsDataShape();
}

function mergeRemoteDatabaseIntoLocal(remoteData) {
  if (!remoteData || typeof remoteData !== "object") return false;
  if (Array.isArray(remoteData.teachers)) {
    systemState.teachers = mergeTeachersPreservingLocalAuth_(systemState.teachers, remoteData.teachers);
    if (systemState.activeTeacher) {
      const refreshedTeacher = systemState.teachers.find(t => t.username === systemState.activeTeacher.username);
      if (refreshedTeacher) {
        systemState.activeTeacher = refreshedTeacher;
        syncActiveTeacherCredentials();
      }
    }
  }
  if (Array.isArray(remoteData.students)) {
    systemState.students = mergeRemoteCollection_(systemState.students, remoteData.students, item => String(item.studentKey || item.id || item.code || item.name || ""));
  }
  if (Array.isArray(remoteData.exams)) {
    systemState.exams = mergeRemoteCollection_(systemState.exams, remoteData.exams, item => String(item.id || item.title || ""));
  }
  if (Array.isArray(remoteData.results)) {
    systemState.results = mergeRemoteCollection_(systemState.results, remoteData.results, item => {
      if (item.recordId) return String(item.recordId);
      return String([item.id, item.examId || item.examTitle, item.timestamp, item.score].join(":"));
    });
  }
  hydrateStudentsFromResults(systemState.results);
  ensureResultRecordIds();
  hydratePresentedQuestionsForResults();
  ensureStudentsDataShape();
  ensureExamsDataShape();
  return true;
}


function normalizeArabyaWebAppUrl(rawUrl) {
  let url = String(rawUrl || "").trim();
  if (!url) return "";
  if (url.includes("/macros/s/") || url.endsWith("/exec")) {
    if (url.includes("/dev")) {
      url = url.replace(/\/dev(\?|$)/, "/exec$1");
    }
    return url;
  }
  return url;
}

function buildSlimResultCloudPayload(payload) {
  const slim = { ...payload };
  if (slim.details && String(slim.details).length > 12000) {
    slim.details = String(slim.details).slice(0, 12000) + "\n...[مختصر للمزامنة السحابية]";
  }
  delete slim.studentAnswers;
  delete slim.questionScores;
  delete slim.presentedQuestions;
  return slim;
}

async function postToArabyaWebAppNoCors(url, payload) {
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (e) {
    return false;
  }
}

function postToArabyaWebApp(url, payload) {
  const targetUrl = normalizeArabyaWebAppUrl(url);
  if (!targetUrl) return Promise.reject(new Error("رابط Web App غير صالح"));

  const attempt = () => fetch(targetUrl, {
    method: "POST",
    mode: "cors",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).then(async res => {
    const text = (await res.text()) || "";
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { parsed = null; }
      }
    }
    if (!res.ok) {
      throw new Error((parsed && parsed.message) || text.slice(0, 200) || ("HTTP " + res.status));
    }
    if (parsed && parsed.status === "error") {
      throw new Error(parsed.message || "Cloud sync error");
    }
    if (!parsed && text && !/success|تم/i.test(text)) {
      throw new Error("استجابة غير متوقعة من الخادم. تأكد من نشر Apps Script كـ Web App للجميع (Anyone) واستخدام رابط /exec");
    }
    return parsed || { status: "success" };
  });

  return attempt().catch(err => {
    console.warn("postToArabyaWebApp retry:", targetUrl, err);
    return attempt();
  });
}

async function pushCloudBackupNow() {
  const urlList = getArabyaWebAppUrls().map(normalizeArabyaWebAppUrl).filter(Boolean);
  if (urlList.length === 0) return false;
  const payload = {
    action: "save_backup",
    data: {
      teachers: systemState.teachers,
      students: systemState.students,
      exams: systemState.exams,
      results: systemState.results
    }
  };
  let ok = false;
  for (const url of urlList) {
    try {
      await postToArabyaWebApp(url, payload);
      ok = true;
    } catch (e) {
      const sent = await postToArabyaWebAppNoCors(url, payload);
      if (sent) ok = true;
      console.warn("pushCloudBackupNow:", url, e);
    }
  }
  return ok;
}

function propagateStudentEditsToResults(student, previousKey = "") {
  if (!student) return;
  const keys = new Set([previousKey, student.studentKey, getStudentLookupKey(student)].filter(Boolean));
  systemState.results.forEach(res => {
    const matches = keys.has(res.studentLookupKey) ||
      (student.id && normalizeStudentId(res.id) === normalizeStudentId(student.id)) ||
      (
        student.name &&
        normalizeStudentName(res.name) === normalizeStudentName(student.name) &&
        sanitizeStudentCodeInput(res.accessCode || res.code) === sanitizeStudentCodeInput(student.code)
      );
    if (!matches) return;
    res.name = student.name;
    res.id = student.id;
    res.accessCode = student.code;
    res.studentLookupKey = student.studentKey;
  });
}


async function syncTeacherCredentialsToCloud(teacher = systemState.activeTeacher) {
  if (!teacher) return { ok: false, reason: "no_teacher" };
  const urlList = getArabyaWebAppUrls().map(normalizeArabyaWebAppUrl).filter(Boolean);
  if (urlList.length === 0) return { ok: false, reason: "no_url" };

  const record = {
    username: teacher.username || teacher.name || "",
    name: teacher.name || "",
    subject: teacher.subject || "",
    password: teacher.password || "",
    autoEntryCode: teacher.autoEntryCode || teacher.password || "",
    integrationConfig: teacher.integrationConfig || {}
  };

  const payload = {
    action: "save_entity",
    collection: "teachers",
    record
  };

  let entityOk = false;
  for (const url of urlList) {
    try {
      await postToArabyaWebApp(url, payload);
      entityOk = true;
    } catch (e) {
      try {
        if (await postToArabyaWebAppNoCors(url, payload)) entityOk = true;
      } catch (e2) {}
    }
  }

  let backupOk = false;
  try {
    backupOk = await pushCloudBackupNow();
  } catch (e) {}

  return {
    ok: entityOk || backupOk,
    entityOk,
    backupOk,
    reason: (entityOk || backupOk) ? "synced" : "failed"
  };
}

function formatTeacherCredentialSyncMessage(syncResult) {
  if (!syncResult) return "تم الحفظ محلياً.";
  if (syncResult.ok) return "تم حفظ الرمز ومزامنته مع Google Sheets بنجاح!";
  if (syncResult.reason === "no_url") return "تم الحفظ محلياً. اربط Google Sheets من تبويب الربط لمزامنة الرمز على جميع الأجهزة.";
  return "تم الحفظ محلياً، لكن فشلت المزامنة السحابية. تحقق من الرابط ونشر Apps Script ثم أعد الحفظ.";
}

function updateTeacherCredentialSyncIndicator(syncResult, syncing = false) {
  const indicator = document.getElementById("cloud-sync-status-indicator");
  if (!indicator) return;
  if (syncing) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--secondary); font-size:1.1rem; vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة رمز الدخول مع Google Sheets...`;
    return;
  }
  if (syncResult && syncResult.ok) {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--success); font-size:1.1rem; vertical-align:middle;">cloud_done</span> تم تحديث رمز الدخول في Google Sheets`;
    return;
  }
  if (syncResult && syncResult.reason === "no_url") {
    indicator.innerHTML = `<span class="material-icons" style="color:var(--warning); font-size:1.1rem; vertical-align:middle;">cloud_queue</span> الرمز محفوظ محلياً — أضف رابط Web App للمزامنة`;
    return;
  }
  indicator.innerHTML = `<span class="material-icons" style="color:var(--error); font-size:1.1rem; vertical-align:middle;">cloud_off</span> فشلت مزامنة الرمز — تم الحفظ محلياً فقط`;
}

async function syncStudentRecordToCloud(student) {
  if (!student) return false;
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) return false;

  const payload = {
    action: "save_entity",
    collection: "students",
    record: {
      name: student.name || "",
      id: student.id || "",
      code: student.code || "",
      email: student.email || "",
      mobile: student.mobile || "",
      studentKey: student.studentKey || getStudentLookupKey(student),
      timestamp: student.timestamp || new Date().toLocaleDateString("ar-EG")
    }
  };

  let ok = false;
  for (const url of urlList) {
    try {
      await postToArabyaWebApp(url, payload);
      ok = true;
    } catch (e) {
      const sent = await postToArabyaWebAppNoCors(url, payload);
      if (sent) ok = true;
    }
  }
  if (ok) {
    try { await pushCloudBackupNow(); } catch (e) {}
  }
  return ok;
}

async function syncLocalDatabaseToCloud() {
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) return false;
  return pushCloudBackupNow();
}


function formatSheetSyncNote(syncResult) {
  if (!syncResult || syncResult.sheetResultRows == null) return "";
  const imported = syncResult.sheetResultRows;
  const total = syncResult.sheetTotalRows != null ? syncResult.sheetTotalRows : imported;
  if (total > imported) {
    const skipped = syncResult.sheetSkippedRows != null ? syncResult.sheetSkippedRows : (total - imported);
    const skippedNote = skipped === 1 ? "صف فارغ واحد متروك" : `${skipped} صفوف فارغة متروكة`;
    return ` — ${total} صفاً في ورقة «نتائج الطلاب» (${imported} مستورد، ${skippedNote})`;
  }
  return ` — ${imported} صفاً في ورقة «نتائج الطلاب»`;
}

window.pullTeacherResultsFromCloud = async function() {
  const el = document.getElementById("teacher-results-sync-status");
  if (el) {
    el.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري جلب النتائج من Google Sheets...`;
  }
  const syncResult = await syncDatabaseFromCloud({ silent: false });
  if (syncResult.ok) {
    getResultsTableViewSettings().page = 1;
    getStudentsTableViewSettings().page = 1;
  }
  refreshTeacherDashboardViews({ all: true });
  if (el) {
    if (syncResult.ok) {
      const sheetNote = formatSheetSyncNote(syncResult);
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تمت المزامنة: ${systemState.results.length} سجلاً نتائج · ${systemState.students.length} طالب${sheetNote}`;
    } else {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> تعذّر الجلب. تأكد من رابط /exec ونشر Web App للجميع (Anyone)، ثم انسخ الكود الذي يحتوي readArabyaSheetResults_ من تبويب الربط وأعد النشر كإصدار جديد.`;
    }
  }
  return syncResult.ok;
};

async function syncDatabaseFromCloud(options = {}) {
  const silent = !!options.silent;
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) return { ok: false };

  for (const rawUrl of urlList) {
    const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_backup";
    try {
      const res = await fetch(fetchUrl, { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const response = await res.json();
      if (response && response.status === "success" && response.data) {
        mergeRemoteDatabaseIntoLocal(response.data);
        saveSystemState(false);
        if (!silent) {
          refreshTeacherDashboardViews({ all: true });
        }
        return {
          ok: true,
          sheetResultRows: response.sheetResultRows ?? null,
          sheetTotalRows: response.sheetTotalRows ?? null,
          sheetSkippedRows: response.sheetSkippedRows ?? null,
          backupResultRows: response.backupResultRows ?? null,
          totalResults: systemState.results.length
        };
      }
    } catch (err) {
      console.warn("syncDatabaseFromCloud failed for", fetchUrl, err);
    }
  }
  return { ok: false };
}

function setupArabyaLiveDataRefresh() {
  const refreshTeacherViews = () => {
    if (systemState.activeView !== "teacher-dashboard-view") return;
    reloadSystemStateFromLocalStorage();
    refreshTeacherDashboardViews();
  };
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("arabya_")) refreshTeacherViews();
  });
  window.addEventListener("arabya-data-changed", refreshTeacherViews);
}

function hydrateGoogleSheetsScriptBox() {
  fetch("integrations/google-apps-script-backend.gs", { cache: "no-store" })
    .then(res => (res.ok ? res.text() : null))
    .then(text => {
      if (!text) return;
      const box = document.getElementById("google-sheets-sync-script-code");
      if (box) box.value = text;
    })
    .catch(() => {});
}

function getEffectiveExamSyncUrl(exam) {
  const candidates = [];
  if (exam && exam.googleFormUrl) candidates.push(String(exam.googleFormUrl).trim());
  if (systemState.config && systemState.config.googleFormUrl) candidates.push(String(systemState.config.googleFormUrl).trim());
  if (systemState.activeTeacher && systemState.activeTeacher.integrationConfig && systemState.activeTeacher.integrationConfig.googleFormUrl) {
    candidates.push(String(systemState.activeTeacher.integrationConfig.googleFormUrl).trim());
  }
  if (exam && exam.teacher && Array.isArray(systemState.teachers)) {
    const t = systemState.teachers.find(x => x.username === exam.teacher);
    if (t && t.integrationConfig && t.integrationConfig.googleFormUrl) candidates.push(String(t.integrationConfig.googleFormUrl).trim());
  }
  if (Array.isArray(systemState.teachers)) {
    systemState.teachers.forEach(t => {
      if (t && t.integrationConfig && t.integrationConfig.googleFormUrl) candidates.push(String(t.integrationConfig.googleFormUrl).trim());
    });
  }
  try {
    const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
    if (cfg.googleFormUrl) candidates.push(String(cfg.googleFormUrl).trim());
  } catch (e) {}
  try {
    const teacherUrlInput = document.getElementById("teacher-config-url");
    if (teacherUrlInput && teacherUrlInput.value) candidates.push(String(teacherUrlInput.value).trim());
    const examUrlInput = document.getElementById("edit-meta-google-url");
    if (examUrlInput && examUrlInput.value) candidates.push(String(examUrlInput.value).trim());
  } catch (e) {}
  try {
    const s = getUrlParameter("s");
    if (s) candidates.push(String(s).trim());
  } catch (e) {}
  for (const u of candidates) {
    if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) return u;
  }
  return "";
}

window.testExamSync = function(examId) {
  const exam = systemState.exams.find(e => e.id === examId);
  if (!exam) return;
  const badge = document.getElementById("sync-badge-" + examId);
  const url = getEffectiveExamSyncUrl(exam);
  if (!url) {
    if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">cloud_off</span> <span style="color:var(--error); font-weight:700;">لا يوجد رابط مزامنة. أضف رابط الويب اب في تعديل الامتحان أو في تبويب الربط.</span>`;
    return;
  }
  if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--secondary); animation:spin 1s infinite linear;">sync</span> <span style="color:var(--secondary); font-weight:700;">جاري اختبار الاتصال بجوجل شيت...</span>`;
  const testUrl = url + (url.includes("?") ? "&" : "?") + "action=get_backup";
  fetch(testUrl, { method: "GET", headers: { Accept: "application/json" } })
    .then(res => res.json())
    .then(data => {
      if (data && (data.status === "success" || data.status === "active")) {
        if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--success);">cloud_done</span> <span style="color:var(--success); font-weight:700;">المزامنة تعمل بنجاح ✓</span>`;
      } else if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">error</span> <span style="color:var(--error); font-weight:700;">استجابة غير متوقعة. تأكد من نشر Apps Script كـ Web App للجميع (Anyone).</span>`;
    })
    .catch(() => {
      if (badge) badge.innerHTML = `<span class="material-icons" style="font-size:1rem; color:var(--error);">cloud_off</span> <span style="color:var(--error); font-weight:700;">فشل الاتصال. تحقق من الرابط ومن نشر Apps Script للجميع (Anyone).</span>`;
    });
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
    postToArabyaWebApp(url, payload).then(() => {
      successCount++;
      updateIndicator();
    }).catch(err => {
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

function isValidCloudSyncUrl(url) {
  const clean = (url || "").trim();
  return !!(clean && (clean.includes("/macros/s/") || clean.endsWith("/exec")));
}

function collectCloudSyncUrls(extraUrl) {
  const urls = new Set();
  [extraUrl, systemState.config?.googleFormUrl, systemState.activeTeacher?.integrationConfig?.googleFormUrl].forEach(url => {
    if (isValidCloudSyncUrl(url)) urls.add(url.trim());
  });
  if (Array.isArray(systemState.exams)) {
    systemState.exams.forEach(exam => {
      if (isValidCloudSyncUrl(exam.googleFormUrl)) urls.add(exam.googleFormUrl.trim());
    });
  }
  return Array.from(urls);
}

function countLocalTeacherData() {
  return {
    exams: Array.isArray(systemState.exams) ? systemState.exams.length : 0,
    results: Array.isArray(systemState.results) ? systemState.results.length : 0,
    students: Array.isArray(systemState.students) ? systemState.students.length : 0
  };
}

function countCloudBackupData(data) {
  return {
    exams: Array.isArray(data?.exams) ? data.exams.length : 0,
    results: Array.isArray(data?.results) ? data.results.length : 0,
    students: Array.isArray(data?.students) ? data.students.length : 0
  };
}

function isLikelyFreshLocalDatabase() {
  if (localStorage.getItem("arabya_teacher_has_custom_data") === "yes") return false;
  const activeUsername = systemState.activeTeacher?.username || "";
  const teacherExams = (systemState.exams || []).filter(exam => !exam.teacher || exam.teacher === activeUsername);
  const hasResults = (systemState.results || []).length > 0;
  const hasStudents = (systemState.students || []).length > 1;
  const defaultExamIds = new Set(["arabic_grammar", "arabic_rhetoric", "arabic_literature"]);
  const hasCustomExams = teacherExams.some(exam => !defaultExamIds.has(exam.id));
  return !hasResults && !hasStudents && !hasCustomExams;
}

function markTeacherHasCustomData() {
  try {
    localStorage.setItem("arabya_teacher_has_custom_data", "yes");
  } catch (e) {}
}

function persistCloudSyncUrlForTeacher(url) {
  if (!isValidCloudSyncUrl(url) || !systemState.activeTeacher) return;
  const clean = url.trim();
  systemState.activeTeacher.integrationConfig = systemState.activeTeacher.integrationConfig || {};
  systemState.activeTeacher.integrationConfig.googleFormUrl = clean;
  systemState.config = systemState.config || {};
  systemState.config.googleFormUrl = clean;
  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }
  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  localStorage.setItem("arabya_pending_cloud_sync_url", clean);
}

function applyCloudBackupData(data) {
  if (data.teachers && Array.isArray(data.teachers)) {
    const localTeachers = systemState.teachers || [];
    systemState.teachers = mergeTeachersPreservingLocalAuth_(localTeachers, data.teachers);
    localStorage.setItem("arabya_teachers_db", JSON.stringify(systemState.teachers));
    if (systemState.activeTeacher) {
      const restoredTeacher = systemState.teachers.find(t => t.username === systemState.activeTeacher.username)
        || systemState.teachers[0];
      if (restoredTeacher) loginTeacherObject(restoredTeacher);
    }
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
    ensureResultRecordIds();
  }
  markTeacherHasCustomData();
}

function fetchCloudBackupFromUrls(urlList) {
  return new Promise((resolve, reject) => {
    let index = 0;
    function tryFetchNext() {
      if (index >= urlList.length) {
        reject(new Error("No cloud backup found"));
        return;
      }
      const rawUrl = urlList[index++];
      const fetchUrl = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "action=get_backup";
      fetch(fetchUrl, { method: "GET", headers: { "Accept": "application/json" } })
        .then(res => (res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status))))
        .then(response => {
          if (response && response.status === "success" && response.data) resolve(response.data);
          else tryFetchNext();
        })
        .catch(() => tryFetchNext());
    }
    tryFetchNext();
  });
}

function finishTeacherLoginNavigation(options = {}) {
  navigateToView("teacher-dashboard-view");
  renderExamsList();
  renderTeacherStudentsTable();
  if (options.message) alert(options.message);
}

function syncTeacherDataOnLogin(options = {}) {
  const extraSyncUrl = (options.extraSyncUrl || "").trim();
  if (extraSyncUrl) persistCloudSyncUrlForTeacher(extraSyncUrl);

  const urls = collectCloudSyncUrls(extraSyncUrl);
  if (!urls.length) {
    finishTeacherLoginNavigation(options);
    return Promise.resolve({ synced: false, reason: "no_url" });
  }

  return fetchCloudBackupFromUrls(urls)
    .then(data => {
      const local = countLocalTeacherData();
      const cloud = countCloudBackupData(data);
      const fresh = isLikelyFreshLocalDatabase();
      const cloudHasMore = cloud.exams > local.exams || cloud.results > local.results || cloud.students > local.students;

      if (!fresh && !cloudHasMore) {
        finishTeacherLoginNavigation(options);
        return { synced: false, reason: "local_current" };
      }

      if (!fresh && cloudHasMore && !options.skipConfirm) {
        if (!confirm("وُجدت نسخة أحدث في السحابة. هل تريد استبدال البيانات المحلية على هذا المتصفح بالنسخة السحابية؟")) {
          finishTeacherLoginNavigation(options);
          return { synced: false, reason: "declined" };
        }
      }

      applyCloudBackupData(data);
      finishTeacherLoginNavigation({
        message: options.message || "تم جلب بياناتك من السحابة بنجاح! ستجد امتحاناتك ونتائجك كما على جهازك الآخر."
      });
      return { synced: true };
    })
    .catch(err => {
      console.error("syncTeacherDataOnLogin failed:", err);
      finishTeacherLoginNavigation(options);
      if (isLikelyFreshLocalDatabase()) {
        alert("تعذر جلب البيانات من السحابة.\n\nتأكد من:\n- إدخال رابط Web App الصحيح (ينتهي بـ /exec)\n- رفع نسخة احتياطية سحابية من المتصفح الأصلي\n- نشر Apps Script للوصول Anyone");
      }
      return { synced: false, reason: "fetch_failed" };
    });
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
    postToArabyaWebApp(url, payload).then(() => {
      successCount++;
      checkCompletion();
    }).catch(err => {
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
window.restoreDatabaseFromCloud = async function() {
  const urlList = getArabyaWebAppUrls();
  if (urlList.length === 0) {
    alert("يرجى إدخال رابط ويب اب (Web App URL) أولاً لتمكين استعادة النسخة الاحتياطية!");
    return;
  }
  if (!confirm("تحذير: سيقوم هذا باستبدال قاعدة البيانات الحالية بالكامل بالبيانات المستعادة من جوجل شيت. هل ترغب في الاستمرار؟")) return;
  const btnRestore = document.getElementById("btn-cloud-restore");
  const originalText = btnRestore ? btnRestore.innerHTML : "";
  if (btnRestore) { btnRestore.disabled = true; btnRestore.innerHTML = `<span class="material-icons" style="animation:spin 1s infinite linear; vertical-align:middle;">sync</span> جاري جلب البيانات...`; }
  const syncResult = await syncDatabaseFromCloud({ silent: false });
  if (btnRestore) { btnRestore.disabled = false; btnRestore.innerHTML = originalText; }
  if (syncResult && syncResult.ok) {
    finalizeDatabaseImportMessage();
    alert(`تم استعادة قاعدة البيانات: ${systemState.students.length} طالب · ${systemState.results.length} نتيجة · ${systemState.exams.length} امتحان. سيتم إعادة تحميل الصفحة.`);
    location.reload();
  } else {
    alert("فشل استعادة قاعدة البيانات. تأكد من رفع نسخة احتياطية أولاً ونشر Apps Script للجميع (Anyone).");
  }
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

function getCleanSiteUrl() {
  return (window.location.pathname || "/") + (window.location.search || "");
}

function stripEmptyHashFromUrl() {
  const hash = window.location.hash || "";
  if (!hash || hash === "#") {
    const cleanUrl = getCleanSiteUrl();
    if (window.location.href !== window.location.origin + cleanUrl && window.location.href !== cleanUrl) {
      history.replaceState(null, "", cleanUrl);
    }
  }
}

function cleanBrowserUrlForView(viewId) {
  if (viewId === "welcome-view") {
    history.replaceState(null, "", getCleanSiteUrl());
  }
}

window.goToHomePage = function(event) {
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  navigateToView("welcome-view");
  history.replaceState(null, "", getCleanSiteUrl());
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
  } else if (viewId === "teacher-login-view") {
    const pendingSyncUrl = localStorage.getItem("arabya_pending_cloud_sync_url") || "";
    const syncInput = document.getElementById("teacher-login-sync-url");
    if (syncInput && pendingSyncUrl && !syncInput.value.trim()) {
      syncInput.value = pendingSyncUrl;
    }
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
  const syncUrl = getEffectiveExamSyncUrl(exam);
  if (syncUrl) params.set("s", syncUrl);
  return `${getAppBaseUrl()}?${params.toString()}`;
}

// فحص معاملات الرابط لفتح امتحان مخصص أو الدخول التلقائي للمعلم
function checkUrlParameters() {
  let redirected = false;

  // 1. الدخول التلقائي للمعلم عبر رمز الدخول التلقائي
  const autoCode = getUrlParameter("teacher_autocode");
  if (autoCode) {
    const matched = systemState.teachers.find(t => teacherCredentialMatches(t, autoCode));
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
    const matched = systemState.teachers.find(t =>
      t.username.toLowerCase() === user.toLowerCase() && teacherCredentialMatches(t, pass)
    );
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

  // 3.b رابط المزامنة المضمّن في الرابط المباشر (يعمل عبر الأجهزة المختلفة)
  const syncParam = getUrlParameter("s");
  if (syncParam && (syncParam.includes("/macros/s/") || syncParam.endsWith("/exec"))) {
    systemState.config = systemState.config || {};
    systemState.config.googleFormUrl = syncParam;
    try { localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config)); } catch (e) {}
    setTimeout(function() {
      if (typeof syncDatabaseFromCloud === "function") {
        syncDatabaseFromCloud({ silent: true }).then(function(ok) {
          if (ok) {
            try { populateExamSelectionList(); } catch (e) {}
            if (systemState.lockedExamId) {
              const sel = document.getElementById("student-exam-select");
              if (sel) { sel.value = systemState.lockedExamId; sel.disabled = true; }
            }
          }
        });
      }
    }, 50);
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
      if (isExamPastDeadline(targetExam)) {
        alert(getExamDeadlineBlockMessage(targetExam));
        return redirected;
      }
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

  const menuItems = document.querySelectorAll(".teacher-menu-item[data-tab]");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      activateTeacherTab(item.dataset.tab);
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

  setupTeacherStatsControls();

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
    teacherCredentialMatches(t, passwordInput)
  );

  if (matched) {
    loginTeacherObject(matched);
    const extraSyncUrl = document.getElementById("teacher-login-sync-url")?.value.trim() || "";
    syncTeacherDataOnLogin({ extraSyncUrl });
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
  const matched = systemState.teachers.find(t => teacherCredentialMatches(t, codeVal));

  if (matched) {
    loginTeacherObject(matched);
    const extraSyncUrl = document.getElementById("teacher-login-sync-url")?.value.trim() || "";
    syncTeacherDataOnLogin({
      extraSyncUrl,
      message: `مرحباً بك يا أستاذ ${matched.name}! تم تسجيل الدخول بنجاح عبر رمز الدخول السريع.`
    });
    if (codeInput) codeInput.value = "";
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


function getTeacherScopedExams() {
  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  return (systemState.exams || []).filter(exam => !exam.teacher || exam.teacher === activeUsername);
}

function getTeacherScopedResults() {
  const examIds = new Set(getTeacherScopedExams().map(exam => String(exam.id)));
  return (systemState.results || []).filter(res => {
    if (!res.examId) return true;
    if (!examIds.size) return true;
    return examIds.has(String(res.examId));
  });
}

function getStatsDateRangeSettings() {
  if (!systemState.statsDateRange) {
    let dateFrom = "";
    let dateTo = "";
    try {
      const saved = JSON.parse(localStorage.getItem("arabya_stats_date_range") || "{}");
      dateFrom = saved.dateFrom || "";
      dateTo = saved.dateTo || "";
    } catch (e) {}
    systemState.statsDateRange = { dateFrom, dateTo };
  }
  return systemState.statsDateRange;
}

function persistStatsDateRangeSettings() {
  const range = getStatsDateRangeSettings();
  try {
    localStorage.setItem("arabya_stats_date_range", JSON.stringify(range));
  } catch (e) {}
}

function syncStatsDateRangeControlsUI() {
  const range = getStatsDateRangeSettings();
  const fromInput = document.getElementById("teacher-stats-date-from");
  const toInput = document.getElementById("teacher-stats-date-to");
  if (fromInput) fromInput.value = range.dateFrom || "";
  if (toInput) toInput.value = range.dateTo || "";
}

function setupStatsDateRangeControls() {
  syncStatsDateRangeControlsUI();
  const applyBtn = document.getElementById("teacher-stats-apply-date-range");
  const clearBtn = document.getElementById("teacher-stats-clear-date-range");
  if (applyBtn && !applyBtn.dataset.bound) {
    applyBtn.dataset.bound = "1";
    applyBtn.addEventListener("click", () => {
      const range = getStatsDateRangeSettings();
      const fromInput = document.getElementById("teacher-stats-date-from");
      const toInput = document.getElementById("teacher-stats-date-to");
      range.dateFrom = fromInput ? fromInput.value : "";
      range.dateTo = toInput ? toInput.value : "";
      persistStatsDateRangeSettings();
      renderTeacherStatsDashboard();
    });
  }
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      const range = getStatsDateRangeSettings();
      range.dateFrom = "";
      range.dateTo = "";
      persistStatsDateRangeSettings();
      syncStatsDateRangeControlsUI();
      renderTeacherStatsDashboard();
    });
  }
}

function computeTeacherStatsSnapshot() {
  const exams = getTeacherScopedExams();
  const students = systemState.students || [];
  const allResults = getTeacherScopedResults();
  const statsRange = getStatsDateRangeSettings();
  let results = getActiveResultsList(allResults);
  if (statsRange.dateFrom || statsRange.dateTo) {
    results = results.filter(res => resultMatchesCustomDateRange(res, statsRange.dateFrom, statsRange.dateTo));
  }
  const statusCounts = { completed: 0, incomplete: 0, canceled: 0, superseded: 0 };
  const periodCounts = { today: 0, week: 0, month: 0 };
  const examCounts = new Map();

  allResults.forEach(res => {
    if (isSupersededResult(res)) statusCounts.superseded += 1;
  });

  results.forEach(res => {
    const status = getResultDisplayStatus(res);
    if (statusCounts[status] !== undefined) statusCounts[status] += 1;
    if (resultMatchesDateFilter(res, "today")) periodCounts.today += 1;
    if (resultMatchesDateFilter(res, "week")) periodCounts.week += 1;
    if (resultMatchesDateFilter(res, "month")) periodCounts.month += 1;
    const examKey = String(res.examId || res.examTitle || "unknown");
    examCounts.set(examKey, (examCounts.get(examKey) || 0) + 1);
  });

  let studentsWithResults = 0;
  let studentsWithoutResults = 0;
  let studentsMultiExams = 0;
  let studentsCanceled = 0;
  students.forEach(student => {
    const count = countStudentResults(student);
    if (count > 0) studentsWithResults += 1;
    else studentsWithoutResults += 1;
    if (count > 1) studentsMultiExams += 1;
    const studentKey = student.studentKey || getStudentLookupKey(student);
    if (getStudentCanceledExamIds(studentKey).length > 0) studentsCanceled += 1;
  });

  const topExams = [...examCounts.entries()]
    .map(([key, count]) => {
      const exam = exams.find(item => String(item.id) === key);
      return {
        key,
        label: exam?.title || results.find(r => String(r.examId || r.examTitle) === key)?.examTitle || key,
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recentResults = sortResultsByRecency(results, systemState.results).slice(0, 8);

  const urls = typeof getArabyaWebAppUrls === "function" ? getArabyaWebAppUrls() : [];
  return {
    examsCount: exams.length,
    studentsCount: students.length,
    resultsCount: results.length,
    archivedResultsCount: allResults.length - results.length,
    statusCounts,
    periodCounts,
    studentsWithResults,
    studentsWithoutResults,
    studentsMultiExams,
    studentsCanceled,
    topExams,
    recentResults,
    cloudConnected: urls.length > 0
  };
}

function openTeacherDashboardTab(tabId, afterOpen) {
  activateTeacherTab(tabId, { skipRefresh: true });
  if (typeof afterOpen === "function") {
    setTimeout(afterOpen, 40);
  }
}

function applyTeacherResultsQuickView(options = {}) {
  const view = getResultsTableViewSettings();
  view.statusFilter = options.statusFilter || "all";
  view.examFilter = options.examFilter || "";
  view.dateFilter = options.dateFilter || "all";
  view.dateFrom = options.dateFrom || "";
  view.dateTo = options.dateTo || "";
  view.page = 1;
  persistResultsTableFilters();
  syncResultsFilterControlsUI();
  renderStudentResultsTable();
}

function applyTeacherStudentsQuickView(quickFilter = "all") {
  const view = getStudentsTableViewSettings();
  view.quickFilter = quickFilter || "all";
  view.page = 1;
  persistStudentsTableFilters();
  syncStudentsFilterControlsUI();
  renderTeacherStudentsTable();
}

window.openTeacherStatsResultsView = function(options) {
  openTeacherDashboardTab("results", () => applyTeacherResultsQuickView(options || {}));
};

window.openTeacherStatsStudentsView = function(quickFilter) {
  openTeacherDashboardTab("students", () => applyTeacherStudentsQuickView(quickFilter || "all"));
};

function renderTeacherStatsStatCard(label, value, options = {}) {
  const clickable = options.onClick ? " teacher-stats-clickable" : "";
  const tone = options.tone ? ` style="border-color:${options.tone};"` : "";
  const valueStyle = options.valueColor ? ` style="color:${options.valueColor};"` : "";
  return `<div class="profile-stat-card${clickable}" data-stat-action="${escapeHtml(options.action || "")}"${tone}>` +
    `<div class="profile-stat-label">${escapeHtml(label)}</div>` +
    `<div class="profile-stat-value"${valueStyle}>${escapeHtml(String(value))}</div>` +
    (options.hint ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem;">${escapeHtml(options.hint)}</div>` : "") +
    `</div>`;
}

function renderTeacherStatsBar(label, value, maxValue) {
  const safeMax = Math.max(maxValue, 1);
  const width = Math.max(4, Math.round((value / safeMax) * 100));
  return `<div class="teacher-stats-bar-row">` +
    `<div class="teacher-stats-bar-label"><span>${escapeHtml(label)}</span><span>${value}</span></div>` +
    `<div class="teacher-stats-bar-track"><div class="teacher-stats-bar-fill" style="width:${width}%;"></div></div>` +
    `</div>`;
}

function bindTeacherStatsCardActions(container, actions) {
  if (!container) return;
  container.querySelectorAll("[data-stat-action]").forEach(card => {
    const action = card.dataset.statAction;
    if (!action || !actions[action]) return;
    card.addEventListener("click", actions[action]);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        actions[action]();
      }
    });
  });
}


function updateTeacherStatsSyncStatus(message, tone = "muted") {
  const el = document.getElementById("teacher-stats-sync-status");
  if (!el) return;
  const colors = {
    muted: "var(--text-muted)",
    loading: "var(--secondary)",
    success: "var(--success)",
    error: "var(--error)",
    warning: "var(--warning)"
  };
  el.style.color = colors[tone] || colors.muted;
  el.innerHTML = message || "";
}

async function refreshTeacherStatsDashboard(options = {}) {
  const refreshBtn = document.getElementById("teacher-stats-refresh-btn");
  if (refreshBtn) refreshBtn.disabled = true;
  updateTeacherStatsSyncStatus(
    `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">refresh</span> جاري تحديث الإحصائيات...`,
    "loading"
  );
  try {
    if (typeof reloadSystemStateFromLocalStorage === "function") {
      reloadSystemStateFromLocalStorage();
    }
    refreshTeacherDashboardViews({ all: true });
    if (options.silent) return true;
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--success);">check_circle</span> تم تحديث الإحصائيات من البيانات المحلية (${systemState.results.length} نتيجة · ${systemState.students.length} طالب)`,
      "success"
    );
    return true;
  } catch (err) {
    console.error("refreshTeacherStatsDashboard:", err);
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--error);">error</span> تعذّر تحديث الإحصائيات. راجع Console للتفاصيل.`,
      "error"
    );
    return false;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function syncTeacherStatsFromCloud() {
  const syncBtn = document.getElementById("teacher-stats-sync-btn");
  const urls = typeof getArabyaWebAppUrls === "function" ? getArabyaWebAppUrls() : [];
  if (!urls.length) {
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--warning);">link_off</span> لم يتم ربط Google Sheets بعد. اذهب إلى تبويب «الربط بـ Google Sheets» وأدخل رابط /exec.`,
      "warning"
    );
    return false;
  }
  if (syncBtn) syncBtn.disabled = true;
  updateTeacherStatsSyncStatus(
    `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">cloud_sync</span> جاري المزامنة من Google Sheets...`,
    "loading"
  );
  try {
    let ok = false;
    if (typeof pullTeacherResultsFromCloud === "function") {
      ok = await pullTeacherResultsFromCloud();
    } else if (typeof syncDatabaseFromCloud === "function") {
      const result = await syncDatabaseFromCloud({ silent: false });
      ok = !!(result && result.ok);
    }
    if (typeof reloadSystemStateFromLocalStorage === "function") {
      reloadSystemStateFromLocalStorage();
    }
    refreshTeacherDashboardViews({ all: true });
    if (ok) {
      updateTeacherStatsSyncStatus(
        `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تمت المزامنة: ${systemState.results.length} نتيجة · ${systemState.students.length} طالب`,
        "success"
      );
    } else {
      updateTeacherStatsSyncStatus(
        `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> تعذّرت المزامنة. تأكد من رابط /exec ونشر Apps Script كإصدار جديد (Anyone).`,
        "error"
      );
    }
    return ok;
  } catch (err) {
    console.error("syncTeacherStatsFromCloud:", err);
    updateTeacherStatsSyncStatus(
      `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> خطأ أثناء المزامنة: ${escapeHtml(err.message || "خطأ غير معروف")}`,
      "error"
    );
    return false;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

function setupTeacherStatsControls() {
  const refreshBtn = document.getElementById("teacher-stats-refresh-btn");
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", () => refreshTeacherStatsDashboard());
  }
  const syncBtn = document.getElementById("teacher-stats-sync-btn");
  if (syncBtn && !syncBtn.dataset.bound) {
    syncBtn.dataset.bound = "1";
    syncBtn.addEventListener("click", () => syncTeacherStatsFromCloud());
  }
}

function renderTeacherStatsDashboard() {
  setupStatsDateRangeControls();
  const overview = document.getElementById("teacher-stats-overview");
  if (!overview) return;

  const stats = computeTeacherStatsSnapshot();
  const updatedEl = document.getElementById("teacher-stats-updated-at");
  if (updatedEl) {
    updatedEl.textContent = `آخر تحديث: ${new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}`;
  }

  const cardActions = {
    "results-all": () => openTeacherStatsResultsView({}),
    "results-today": () => openTeacherStatsResultsView({ dateFilter: "today" }),
    "results-week": () => openTeacherStatsResultsView({ dateFilter: "week" }),
    "results-month": () => openTeacherStatsResultsView({ dateFilter: "month" }),
    "results-completed": () => openTeacherStatsResultsView({ statusFilter: "completed" }),
    "results-incomplete": () => openTeacherStatsResultsView({ statusFilter: "incomplete" }),
    "results-canceled": () => openTeacherStatsResultsView({ statusFilter: "canceled" }),
    "students-all": () => openTeacherStatsStudentsView("all"),
    "students-has-results": () => openTeacherStatsStudentsView("has_results"),
    "students-no-results": () => openTeacherStatsStudentsView("no_results"),
    "students-multi": () => openTeacherStatsStudentsView("multi_exams"),
    "students-canceled": () => openTeacherStatsStudentsView("canceled"),
    "tab-exams": () => openTeacherDashboardTab("exams"),
    "tab-integration": () => openTeacherDashboardTab("integration")
  };

  overview.innerHTML =
    renderTeacherStatsStatCard("الامتحانات", stats.examsCount, { action: "tab-exams", onClick: true, hint: "عرض قائمة الامتحانات" }) +
    renderTeacherStatsStatCard("الطلاب المسجلون", stats.studentsCount, { action: "students-all", onClick: true, hint: "فتح تبويب الطلاب" }) +
    renderTeacherStatsStatCard("إجمالي النتائج", stats.resultsCount, { action: "results-all", onClick: true, hint: "فتح سجل النتائج" }) +
    renderTeacherStatsStatCard("نتائج اليوم", stats.periodCounts.today, { action: "results-today", onClick: true, valueColor: "var(--secondary)" }) +
    renderTeacherStatsStatCard("Google Sheets", stats.cloudConnected ? "متصل" : "غير متصل", {
      action: "tab-integration",
      onClick: true,
      valueColor: stats.cloudConnected ? "var(--secondary)" : "var(--warning)",
      hint: stats.cloudConnected ? "المزامنة السحابية مهيأة" : "اربط Google Sheets"
    });
  bindTeacherStatsCardActions(overview, cardActions);

  const statusGrid = document.getElementById("teacher-stats-status-grid");
  if (statusGrid) {
    const maxStatus = Math.max(stats.statusCounts.completed, stats.statusCounts.incomplete, stats.statusCounts.canceled, 1);
    statusGrid.innerHTML =
      renderTeacherStatsStatCard("مكتمل", stats.statusCounts.completed, { action: "results-completed", onClick: true, valueColor: "var(--secondary)" }) +
      renderTeacherStatsStatCard("جاري", stats.statusCounts.incomplete, { action: "results-incomplete", onClick: true, valueColor: "var(--warning)" }) +
      renderTeacherStatsStatCard("ملغى", stats.statusCounts.canceled, { action: "results-canceled", onClick: true, valueColor: "var(--error)" }) +
      `<div class="profile-stat-card"><div class="profile-stat-label">النشاط الزمني</div>` +
      renderTeacherStatsBar("آخر 7 أيام", stats.periodCounts.week, stats.resultsCount) +
      renderTeacherStatsBar("آخر 30 يوماً", stats.periodCounts.month, stats.resultsCount) +
      `</div>`;
    bindTeacherStatsCardActions(statusGrid, cardActions);
  }

  const topExamsEl = document.getElementById("teacher-stats-top-exams");
  if (topExamsEl) {
    if (!stats.topExams.length) {
      topExamsEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">لا توجد نتائج مسجلة بعد.</div>`;
    } else {
      topExamsEl.innerHTML = stats.topExams.map(item => {
        const pct = stats.resultsCount ? Math.round((item.count / stats.resultsCount) * 100) : 0;
        return `<button type="button" class="teacher-stats-list-item" style="width:100%; background:none; border:none; color:inherit; text-align:right; cursor:pointer;" data-exam-key="${escapeHtml(item.key)}">` +
          `<span>${escapeHtml(item.label)}</span>` +
          `<span style="color:var(--secondary); font-weight:700;">${item.count} <small style="color:var(--text-muted);">(${pct}%)</small></span>` +
          `</button>`;
      }).join("");
      topExamsEl.querySelectorAll("[data-exam-key]").forEach(btn => {
        btn.addEventListener("click", () => {
          openTeacherStatsResultsView({ examFilter: btn.dataset.examKey || "" });
        });
      });
    }
  }

  const recentEl = document.getElementById("teacher-stats-recent-results");
  if (recentEl) {
    if (!stats.recentResults.length) {
      recentEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">لا توجد نتائج حديثة.</div>`;
    } else {
      recentEl.innerHTML = stats.recentResults.map(res => {
        const status = getResultDisplayStatus(res);
        const statusColor = status === "canceled" ? "var(--error)" : status === "incomplete" ? "var(--warning)" : "var(--secondary)";
        return `<div class="teacher-stats-list-item">` +
          `<div><div style="font-weight:700;">${escapeHtml(res.name || "طالب")}</div>` +
          `<div style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(res.examTitle || "امتحان")} • ${escapeHtml(res.timestamp || "")}</div></div>` +
          `<span style="color:${statusColor}; font-weight:800;">${escapeHtml(res.score || "--")}</span>` +
          `</div>`;
      }).join("");
    }
  }

  const studentsSummary = document.getElementById("teacher-stats-students-summary");
  if (studentsSummary) {
    studentsSummary.innerHTML =
      renderTeacherStatsStatCard("لديهم نتائج", stats.studentsWithResults, { action: "students-has-results", onClick: true, valueColor: "var(--secondary)" }) +
      renderTeacherStatsStatCard("بدون نتائج", stats.studentsWithoutResults, { action: "students-no-results", onClick: true, valueColor: "var(--warning)" }) +
      renderTeacherStatsStatCard("أكثر من امتحان", stats.studentsMultiExams, { action: "students-multi", onClick: true }) +
      renderTeacherStatsStatCard("امتحان ملغى", stats.studentsCanceled, { action: "students-canceled", onClick: true, valueColor: "var(--error)" });
    bindTeacherStatsCardActions(studentsSummary, cardActions);
  }
}

window.renderTeacherStatsDashboard = renderTeacherStatsDashboard;

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

  renderTeacherStatsDashboard();
  renderExamsList();
  renderStudentResultsTable();
  renderTeacherStudentsTable();

  restoreTeacherActiveTab();

  syncDatabaseFromCloud({ silent: true }).then(synced => {
    if (synced && synced.ok) {
      refreshTeacherDashboardViews({ all: true });
    }
  });
}

async function saveTeacherProfile() {
  if (!systemState.activeTeacher) return;

  const name = document.getElementById("teacher-profile-name").value.trim();
  const subject = document.getElementById("teacher-profile-subject").value.trim();
  const autoCode = document.getElementById("teacher-profile-autocode").value.trim();

  if (!name || !subject || !autoCode) {
    alert("يرجى ملء جميع الحقول المطلوبة وحقل رمز الدخول التلقائي!");
    return;
  }

  const isCodeDuplicate = systemState.teachers.some(t => t.username !== systemState.activeTeacher.username && t.autoEntryCode === autoCode);
  if (isCodeDuplicate) {
    alert("رمز الدخول التلقائي هذا مستخدم بالفعل من قبل معلم آخر! اختر رمزاً فريداً.");
    return;
  }

  systemState.activeTeacher.name = name;
  systemState.activeTeacher.subject = subject;
  systemState.activeTeacher.autoEntryCode = autoCode;
  systemState.activeTeacher.password = autoCode;
  if (systemState.config) {
    systemState.config.autoEntryCode = autoCode;
    systemState.config.teacherCode = autoCode;
  }

  systemState.teacherProfile = { name, subject, autoEntryCode: autoCode };

  const idx = systemState.teachers.findIndex(t => t.username === systemState.activeTeacher.username);
  if (idx !== -1) {
    systemState.teachers[idx] = systemState.activeTeacher;
  }

  syncActiveTeacherCredentials(autoCode);
  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  saveSystemState(false);
  loadTeacherDashboardData();

  updateTeacherCredentialSyncIndicator(null, true);
  const syncResult = await syncTeacherCredentialsToCloud();
  updateTeacherCredentialSyncIndicator(syncResult, false);
  alert(formatTeacherCredentialSyncMessage(syncResult));
}

async function saveTeacherIntegrationConfig() {
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
  systemState.activeTeacher.autoEntryCode = code;
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

  systemState.teacherProfile = {
    name: systemState.activeTeacher.name,
    subject: systemState.activeTeacher.subject,
    autoEntryCode: code
  };
  syncActiveTeacherCredentials(code);
  saveTeachersToLocalStorage();
  localStorage.setItem("arabya_teacher_profile", JSON.stringify(systemState.teacherProfile));
  localStorage.setItem("arabya_teacher_config", JSON.stringify(systemState.config));
  saveSystemState(false);

  updateTeacherCredentialSyncIndicator(null, true);
  const syncResult = await syncTeacherCredentialsToCloud();
  updateTeacherCredentialSyncIndicator(syncResult, false);
  alert(formatTeacherCredentialSyncMessage(syncResult));
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
    const syncUrl = getEffectiveExamSyncUrl(exam);
    const badge = syncUrl
      ? `<span id="sync-badge-${exam.id}" style="display:inline-flex; align-items:center; gap:0.25rem; color:var(--secondary); font-weight:700;"><span class="material-icons" style="font-size:1rem;">cloud_queue</span> رابط المزامنة مهيأ — اضغط (اختبار المزامنة) للتأكد</span>`
      : `<span id="sync-badge-${exam.id}" style="display:inline-flex; align-items:center; gap:0.25rem; color:var(--error); font-weight:700;"><span class="material-icons" style="font-size:1rem;">cloud_off</span> لا يوجد رابط مزامنة لهذا الامتحان (يُحفظ محلياً فقط)</span>`;

    card.innerHTML = `
      <div>
        <div class="exam-info-title">${exam.title}</div>
        <div style="font-size:0.8rem; color:var(--secondary); font-weight:600; margin-bottom:0.5rem;">
          المادة: ${exam.subject} | الفرقة: ${exam.level || 'غير محددة'}
        </div>
        <div class="exam-info-details">
          <span>الكلية: ${exam.faculty || 'عام'} | الجامعة: ${exam.university || 'عام'}</span>
          <span>المجموع النهائي الكلي: <code style="color:var(--accent); font-weight:700;">${totalExamScore} درجة</code></span>
          <span>النوع: ${exam.examType || 'أعمال فصلية'} | بنك الأسئلة: ${bankCount}</span>
          <span>المعروض للطالب: ${displayedCount} | النمط: ${questionMode}</span>
          <span style="margin-top:0.35rem; font-size:0.82rem;">${badge}</span>
        </div>
      </div>
      <div>
        <div class="exam-actions-row">
          <button class="btn btn-primary btn-sm" onclick="editExamQuestions('${exam.id}')">تعديل الامتحان والأسئلة</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--secondary); color:var(--secondary);" onclick="testExamSync('${exam.id}')">اختبار المزامنة</button>
          <button class="btn btn-outline btn-sm" style="border-color:var(--accent); color:var(--accent);" onclick="setTeacherResultsExamFilter('${exam.id}')">عرض النتائج</button>
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
  const endsAtEl = document.getElementById("edit-meta-ends-at");
  if (endsAtEl) endsAtEl.value = formatExamEndsAtForInput(exam.endsAt || "");
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
      
      <div style="display: grid; grid-template-columns: minmax(0, 2fr) minmax(90px, 1fr) minmax(110px, 1fr); gap: 1rem; margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">نص السؤال:</label>
          <textarea class="form-control edit-q-text" data-index="${index}" rows="3" dir="auto" style="resize:vertical; min-height:3.5rem;"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">درجة السؤال:</label>
          <input type="number" class="form-control edit-q-points" value="${q.points !== undefined ? q.points : 10}" min="1" data-index="${index}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">مدة الإجابة (ثانية):</label>
          <input type="number" class="form-control edit-q-time" value="${q.timeSeconds !== undefined ? q.timeSeconds : 60}" min="5" data-index="${index}">
        </div>
      </div>
    `;

    const questionTextInput = card.querySelector(".edit-q-text");
    if (questionTextInput) {
      questionTextInput.value = q.question == null ? "" : String(q.question);
    }

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

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `edit-correct-${index}`;
        radio.value = String(optIdx);
        if (isCorrect) radio.checked = true;
        const optInput = document.createElement("input");
        optInput.type = "text";
        optInput.className = "form-control edit-q-option";
        optInput.style.padding = "0.5rem 1rem";
        optInput.dataset.questionIndex = String(index);
        optInput.dataset.optionIndex = String(optIdx);
        optInput.readOnly = true;
        optInput.value = opt == null ? "" : String(opt);
        optGroup.appendChild(radio);
        optGroup.appendChild(optInput);
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

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `edit-correct-${index}`;
        radio.value = String(optIdx);
        if (isCorrect) radio.checked = true;
        const optInput = document.createElement("input");
        optInput.type = "text";
        optInput.className = "form-control edit-q-option";
        optInput.style.padding = "0.5rem 1rem";
        optInput.dataset.questionIndex = String(index);
        optInput.dataset.optionIndex = String(optIdx);
        optInput.value = opt == null ? "" : String(opt);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-outline btn-sm";
        removeBtn.style.borderColor = "var(--error)";
        removeBtn.style.color = "var(--error)";
        removeBtn.style.padding = "0.4rem";
        removeBtn.title = "حذف البديل";
        removeBtn.innerHTML = "&times;";
        removeBtn.addEventListener("click", () => removeOptionFromQuestion(index, optIdx));
        optGroup.appendChild(radio);
        optGroup.appendChild(optInput);
        optGroup.appendChild(removeBtn);
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
  exam.endsAt = parseExamEndsAtInput(document.getElementById("edit-meta-ends-at")?.value || "");
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

    const timeInput = card.querySelector(".edit-q-time");
    const questionTimeSeconds = timeInput ? parseInt(timeInput.value, 10) || 60 : 60;

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
      points: questionPoints,
      timeSeconds: Math.max(5, questionTimeSeconds)
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
      points: 10,
      timeSeconds: 60
    };
  } else if (type === 'boolean') {
    newQ = {
      id: exam.questions.length + 1,
      type: "boolean",
      question: "اكتب سؤال الصواب والخطأ هنا...",
      options: ["صواب", "خطأ"],
      correctAnswer: 0,
      points: 10,
      timeSeconds: 60
    };
  } else {
    newQ = {
      id: exam.questions.length + 1,
      type: "essay",
      question: "اكتب نص السؤال المقالي الجديد هنا...",
      options: [],
      correctAnswer: "",
      points: 10,
      timeSeconds: 60
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


/** تهريب نصوص HTML (محتوى أو سمات) لعرض آمن دون حذف علامات الاقتباس أو الرموز */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  activateTeacherTab("integration", { force: true, skipRefresh: true });

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

function escapeCsvField(value) {
  return String(value == null ? "" : value).replace(/"/g, '""');
}

function buildCsvLine(fields) {
  return fields.map(field => `"${escapeCsvField(field)}"`).join(",") + "\n";
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getExportDateStamp() {
  return new Date().toLocaleDateString("ar-EG").replace(/\//g, "-");
}

function getResultsForExport() {
  if (!Array.isArray(systemState.results) || !systemState.results.length) return [];
  const sortOrder = getResultsTableViewSettings().sortOrder || "newest";
  return filterResultsForTeacherTable(sortResultsForDisplay(systemState.results, sortOrder));
}

function getStudentsForExport() {
  if (!Array.isArray(systemState.students) || !systemState.students.length) return [];
  const sortOrder = getStudentsTableViewSettings().sortOrder || "newest";
  return filterStudentsForTeacherTable(sortStudentsForDisplay(systemState.students, sortOrder));
}

function resultExistsInDatabase(res) {
  if (!res) return true;
  if (res.recordId) {
    return systemState.results.some(r => r.recordId === res.recordId);
  }
  return systemState.results.some(r =>
    r.id === res.id &&
    r.examId === res.examId &&
    String(r.timestamp || "") === String(res.timestamp || "")
  );
}

function normalizeImportedResult(res) {
  if (!res || typeof res !== "object") return null;
  if (!res.id && !res.name) return null;
  const normalized = { ...res };
  if (!normalized.recordId) normalized.recordId = createRecordId("result");
  if (!Number.isFinite(normalized.savedAt)) {
    const match = String(normalized.recordId).match(/(?:result|incomplete|record)_(\d{10,})_/i);
    if (match) normalized.savedAt = parseInt(match[1], 10);
  }
  return normalized;
}

function finalizeDatabaseImportMessage(counts) {
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
  hydratePresentedQuestionsForResults();
  saveSystemState(false);
}

// 6. استيراد وتصدير نتائج الطلاب (JSON/CSV)
// ==========================================

function exportResultsToJSON() {
  if (systemState.results.length === 0) {
    alert("لا توجد نتائج لتصديرها!");
    return;
  }
  const exportRows = getResultsForExport();
  if (!exportRows.length) {
    alert("لا توجد نتائج مطابقة للفلاتر الحالية للتصدير!");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: ARABYA_APP_VERSION,
    filtered: isResultsTableFiltersActive(),
    count: exportRows.length,
    results: exportRows
  };
  downloadBlobFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `نتائج_الطلاب_arabya_${getExportDateStamp()}.json`
  );
}

function importResultsFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.results) ? parsed.results : null);
      if (!rows) {
        alert("تنسيق الملف غير صحيح! يجب أن يكون مصفوفة نتائج أو كائن يحتوي results.");
        return;
      }
      let addedCount = 0;
      rows.forEach(raw => {
        const res = normalizeImportedResult(raw);
        if (!res || resultExistsInDatabase(res)) return;
        systemState.results.push(res);
        addedCount++;
      });
      finalizeDatabaseImportMessage();
      refreshTeacherDashboardViews({ all: true });
      alert(`تم استيراد ${addedCount} سجل نتائج جديد من ${rows.length} صف في الملف.`);
    } catch (err) {
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
    const expired = isExamPastDeadline(exam);
    opt.innerText = expired
      ? `${exam.title} (${exam.subject}) — منتهي الموعد`
      : `${exam.title} (${exam.subject})`;
    if (expired) {
      opt.disabled = true;
    }
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

  if (isExamPastDeadline(selectedExam)) {
    alert(getExamDeadlineBlockMessage(selectedExam));
    return;
  }

  let matchedStudent = null;
  if (isFiveDigitStudentCode(inputCode)) {
    matchedStudent = findStudentByCode(inputCode, { studentId: normalizedId, name });
  }
  if (!matchedStudent && normalizedId) {
    matchedStudent = findStudentById(normalizedId);
  }
  if (!matchedStudent && !isSharedStudentCode(inputCode)) {
    matchedStudent = findStudentByName(name);
  }

  const identityCheck = validateStudentIdentityInput(id, rawCode);
  if (!identityCheck.ok) {
    alert(identityCheck.message);
    return;
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
  const blockingResult = findBlockingExamResult(studentLookupKey, examId, systemState.currentStudent);
  if (blockingResult) {
    alert(getExamBlockingMessage(blockingResult));
    return;
  }

  const activeRetakeGrant = findActiveRetakeGrant(studentLookupKey, examId);
  if (activeRetakeGrant) {
    const retakeConfirm = confirm(`المعلم سمح لك بإعادة أداء امتحان "${selectedExam.title}". هل تريد البدء الآن؟`);
    if (!retakeConfirm) return;
  }

  systemState.currentExam = selectedExam;

  systemState.shuffledQuestions = buildRuntimeQuestionsForExam(selectedExam);
  systemState.currentExamRuntime = calculateRuntimeExamMeta(systemState.shuffledQuestions);

  systemState.currentQuestionIndex = 0;
  systemState.studentAnswers = {};
  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;
  markExamAntiCheatStarted();

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));
  saveActiveStudentSession();
  updateLiveIncompleteResult();

  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
  showMobileExamHintIfNeeded();
}

function showMobileExamHintIfNeeded() {
  if (!isMobileExamDevice()) return;
  const hint = document.getElementById("runner-mobile-exam-hint");
  if (!hint) return;
  hint.classList.remove("hidden");
  hint.innerHTML = `<span class="material-icons" style="vertical-align:middle; font-size:1rem;">smartphone</span> على الهاتف: ابقَ داخل صفحة الامتحان. التبديل لتطبيق آخر أو إخفاء الصفحة قد يُسجَّل كمخالفة بعد ${Math.round(getExamAntiCheatGraceMs() / 1000)} ثوانٍ من البدء.`;
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

  systemState.timer.timeLimit = getQuestionTimeSeconds(question, exam);
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
    savedAt: Date.now(),
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

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);
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
  const statusEl = document.getElementById("runner-res-sync-status");
  const urlList = Array.from(getArabyaWebAppUrls());

  if (urlList.length === 0) {
    const traditionalUrl = (exam && exam.googleFormUrl) ? exam.googleFormUrl : (systemState.config ? systemState.config.googleFormUrl || "" : "");
    const isTraditional = traditionalUrl && traditionalUrl.includes("docs.google.com");
    if (isTraditional) {
      if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري الإرسال إلى Google Form...`;
      const entryName = (exam && exam.entryName) || systemState.config.entryName || "";
      const entryId   = (exam && exam.entryId) || systemState.config.entryId || "";
      const entryCode = (exam && exam.entryCode) || systemState.config.entryCode || "";
      const entryScore = (exam && exam.entryScore) || systemState.config.entryScore || "";
      const entryDetails = (exam && exam.entryDetails) || systemState.config.entryDetails || "";
      const formData = new URLSearchParams();
      if (entryName) formData.append(entryName, systemState.currentStudent.name);
      if (entryId)   formData.append(entryId, systemState.currentStudent.id);
      if (entryCode) formData.append(entryCode, `${exam ? exam.title : ""} | كود: ${systemState.currentStudent.accessCode}`);
      if (entryScore) formData.append(entryScore, scoreString);
      if (entryDetails) formData.append(entryDetails, details);
      fetch(traditionalUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formData.toString() })
        .then(() => { if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تم إرسال النتيجة إلى Google Form بنجاح!`; })
        .catch(() => { if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> فشل الإرسال. تم حفظ النتيجة محلياً.`; });
    } else if (statusEl) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> تم حفظ النتيجة محلياً ✓ (لم يتم ربط Google Sheets بعد)`;
    }
    return;
  }

  if (statusEl) statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة نتيجتك مع Google Sheets...`;

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
    ...buildResultCloudRetakeFields(resultObj)
  };
  const slimPayload = buildSlimResultCloudPayload(payload);

  let successCount = 0, failCount = 0;
  const total = urlList.length;

  const finishSyncUi = (backupOk) => {
    if (!statusEl) return;
    if (successCount > 0 || backupOk) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تمت مزامنة النتيجة مع Google Sheets بنجاح ✓`;
    } else if (failCount === total) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> فشلت المزامنة. تأكد من: (1) نشر Apps Script كـ Web App لـ <b>Anyone</b> (2) استخدام رابط ينتهي بـ <b>/exec</b> (3) لصق الكود النهائي من تبويب الربط. تم حفظ نتيجتك محلياً على هذا الجهاز.`;
    } else {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> مزامنة جزئية (${successCount}/${total}).`;
    }
  };

  const backupPromise = pushCloudBackupNow();

  urlList.forEach(url => {
    postToArabyaWebApp(url, slimPayload).then(() => {
      successCount++;
      if (successCount + failCount === total) {
        backupPromise.then(finishSyncUi);
      }
    }).catch(async err => {
      console.error("Google Sheets sync error:", url, err);
      const sent = await postToArabyaWebAppNoCors(url, slimPayload);
      if (sent) successCount++; else failCount++;
      if (successCount + failCount === total) {
        backupPromise.then(finishSyncUi);
      }
    });
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
    isManualGradeUpdate: true,
    ...buildResultCloudRetakeFields(res)
  };

  let done = 0;
  const total = urls.size;
  urls.forEach(url => {
    postToArabyaWebApp(url, payload).then(() => {
      done++;
      if (done === total) {
        pushCloudBackupNow().catch(() => {});
        if (syncStatusEl) {
          syncStatusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle; font-size:1rem;">cloud_done</span> تمت مزامنة التصحيح مع Google Sheets بنجاح!`;
        }
      }
    }).catch(() => {
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




function getResultsTableFilters() {
  const view = getResultsTableViewSettings();
  return {
    searchQuery: getResultsSearchQuery(),
    statusFilter: view.statusFilter || "all",
    examFilter: view.examFilter || "",
    dateFilter: view.dateFilter || "all",
    dateFrom: view.dateFrom || "",
    dateTo: view.dateTo || ""
  };
}

function getResultDisplayStatus(res) {
  if (isSupersededResult(res)) return "superseded";
  if (res?.status === "canceled") return "canceled";
  if (res?.status === "incomplete") return "incomplete";
  const scoreText = String(res?.score || "");
  if (/جاري|غير مكتمل|incomplete/i.test(scoreText)) return "incomplete";
  return "completed";
}

function parseDateInputValue(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const dt = new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return parseResultTimestamp(raw);
}

function resultMatchesCustomDateRange(res, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const dt = parseResultTimestamp(res.timestamp);
  if (!dt) return false;
  const fromDt = parseDateInputValue(dateFrom, false);
  const toDt = parseDateInputValue(dateTo, true);
  if (fromDt && dt < fromDt) return false;
  if (toDt && dt > toDt) return false;
  return true;
}

function parseResultTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = normalizeTimestampText(raw);
  let parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const dateMatch = normalized.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    let year = parseInt(dateMatch[3], 10);
    if (year < 100) year += 2000;
    const dt = new Date(year, month, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function resultMatchesStatusFilter(res, statusFilter) {
  if (!statusFilter || statusFilter === "all") return true;
  if (statusFilter === "retake_allowed") return resultHasActiveRetakeGrant(res);
  if (statusFilter === "superseded") return isSupersededResult(res);
  return getResultDisplayStatus(res) === statusFilter;
}

function resultMatchesExamFilter(res, examFilter) {
  if (!examFilter) return true;
  return String(res.examId || "") === examFilter || String(res.examTitle || "") === examFilter;
}

function resultMatchesDateFilter(res, dateFilter) {
  if (!dateFilter || dateFilter === "all") return true;
  const dt = parseResultTimestamp(res.timestamp);
  if (!dt) return true;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dateFilter === "today") return dt >= startOfToday;
  if (dateFilter === "week") {
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return dt >= weekAgo;
  }
  if (dateFilter === "month") {
    const monthAgo = new Date(startOfToday);
    monthAgo.setDate(monthAgo.getDate() - 30);
    return dt >= monthAgo;
  }
  return true;
}

function getResultsExamFilterOptions() {
  const map = new Map();
  (systemState.results || []).forEach(res => {
    const key = res.examId || res.examTitle;
    if (!key) return;
    map.set(String(key), res.examTitle || res.examId || String(key));
  });
  const activeUsername = systemState.activeTeacher ? systemState.activeTeacher.username : "";
  (systemState.exams || []).forEach(exam => {
    if (activeUsername && exam.teacher && exam.teacher !== activeUsername) return;
    if (exam.id) map.set(String(exam.id), exam.title || exam.id);
  });
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

function filterResultsForTeacherTable(results) {
  const filters = getResultsTableFilters();
  let list = Array.isArray(results) ? [...results] : [];
  list = filterResultsForSearch(list, filters.searchQuery);
  if (filters.statusFilter !== "all") {
    list = list.filter(res => resultMatchesStatusFilter(res, filters.statusFilter));
  }
  if (filters.examFilter) {
    list = list.filter(res => resultMatchesExamFilter(res, filters.examFilter));
  }
  if (filters.dateFrom || filters.dateTo) {
    list = list.filter(res => resultMatchesCustomDateRange(res, filters.dateFrom, filters.dateTo));
  } else if (filters.dateFilter !== "all") {
    list = list.filter(res => resultMatchesDateFilter(res, filters.dateFilter));
  }
  return list;
}

function isResultsTableFiltersActive(filters) {
  const active = filters || getResultsTableFilters();
  return !!(
    active.searchQuery ||
    (active.statusFilter && active.statusFilter !== "all") ||
    active.examFilter ||
    (active.dateFilter && active.dateFilter !== "all") ||
    active.dateFrom ||
    active.dateTo
  );
}

function persistResultsTableFilters() {
  const view = getResultsTableViewSettings();
  try {
    localStorage.setItem("arabya_results_filters", JSON.stringify({
      statusFilter: view.statusFilter || "all",
      examFilter: view.examFilter || "",
      dateFilter: view.dateFilter || "all",
      dateFrom: view.dateFrom || "",
      dateTo: view.dateTo || ""
    }));
  } catch (e) {}
}

function populateResultsExamFilterSelect() {
  const select = document.getElementById("teacher-results-exam-filter");
  if (!select) return;
  const current = getResultsTableViewSettings().examFilter || "";
  const options = getResultsExamFilterOptions();
  select.innerHTML = '<option value="">كل الامتحانات</option>' +
    options.map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join("");
  if ([...select.options].some(opt => opt.value === current)) {
    select.value = current;
  }
}

function syncResultsFilterControlsUI() {
  const view = getResultsTableViewSettings();
  document.querySelectorAll("[data-results-status-filter]").forEach(btn => {
    const isActive = (btn.dataset.resultsStatusFilter || "all") === (view.statusFilter || "all");
    btn.className = isActive ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
  });
  const examSelect = document.getElementById("teacher-results-exam-filter");
  if (examSelect) examSelect.value = view.examFilter || "";
  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) dateSelect.value = view.dateFilter || "all";
  const dateFromInput = document.getElementById("teacher-results-date-from");
  const dateToInput = document.getElementById("teacher-results-date-to");
  if (dateFromInput) dateFromInput.value = view.dateFrom || "";
  if (dateToInput) dateToInput.value = view.dateTo || "";
}


function syncResultsSortControlUI() {
  const select = document.getElementById("teacher-results-sort-order");
  if (!select) return;
  select.value = normalizeTableSortOrder(getResultsTableViewSettings().sortOrder || "newest");
}

function setupResultsTableSortControl() {
  const select = document.getElementById("teacher-results-sort-order");
  if (!select) return;
  syncResultsSortControlUI();
  if (select.dataset.bound) return;
  select.dataset.bound = "1";
  select.addEventListener("change", () => {
    const view = getResultsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.columnSort = null;
    view.page = 1;
    try { localStorage.setItem("arabya_results_sort", view.sortOrder); } catch (e) {}
    persistResultsColumnSort(null);
    renderStudentResultsTable();
  });
}

function resetResultsTableFilters() {
  const view = getResultsTableViewSettings();
  view.statusFilter = "all";
  view.examFilter = "";
  view.dateFilter = "all";
  view.dateFrom = "";
  view.dateTo = "";
  view.page = 1;
  const searchInput = document.getElementById("teacher-results-search-input");
  if (searchInput) searchInput.value = "";
  persistResultsTableFilters();
  syncResultsFilterControlsUI();
  renderStudentResultsTable();
}

function setupResultsTableFilterControls() {
  const container = document.getElementById("teacher-results-quick-filters");
  if (!container) return;
  populateResultsExamFilterSelect();
  syncResultsFilterControlsUI();
  setupResultsTableSortControl();
  if (container.dataset.bound) return;
  container.dataset.bound = "1";

  container.querySelectorAll("[data-results-status-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      getResultsTableViewSettings().statusFilter = btn.dataset.resultsStatusFilter || "all";
      getResultsTableViewSettings().page = 1;
      persistResultsTableFilters();
      syncResultsFilterControlsUI();
      renderStudentResultsTable();
    });
  });

  const examSelect = document.getElementById("teacher-results-exam-filter");
  if (examSelect) {
    examSelect.addEventListener("change", () => {
      getResultsTableViewSettings().examFilter = examSelect.value;
      getResultsTableViewSettings().page = 1;
      persistResultsTableFilters();
      renderStudentResultsTable();
    });
  }

  const dateSelect = document.getElementById("teacher-results-date-filter");
  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      const view = getResultsTableViewSettings();
      view.dateFilter = dateSelect.value || "all";
      if (view.dateFilter !== "custom") {
        view.dateFrom = "";
        view.dateTo = "";
      }
      view.page = 1;
      persistResultsTableFilters();
      syncResultsFilterControlsUI();
      renderStudentResultsTable();
    });
  }

  const applyCustomDateRange = () => {
    const view = getResultsTableViewSettings();
    const fromInput = document.getElementById("teacher-results-date-from");
    const toInput = document.getElementById("teacher-results-date-to");
    view.dateFrom = fromInput ? fromInput.value : "";
    view.dateTo = toInput ? toInput.value : "";
    view.dateFilter = (view.dateFrom || view.dateTo) ? "custom" : (view.dateFilter === "custom" ? "all" : view.dateFilter);
    view.page = 1;
    persistResultsTableFilters();
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  };

  ["teacher-results-date-from", "teacher-results-date-to"].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.dataset.bound) {
      input.dataset.bound = "1";
      input.addEventListener("change", applyCustomDateRange);
    }
  });

  const clearBtn = document.getElementById("teacher-results-clear-filters");
  if (clearBtn) {
    clearBtn.addEventListener("click", resetResultsTableFilters);
  }
}

window.setTeacherResultsExamFilter = function(examIdOrTitle) {
  if (!examIdOrTitle) return;
  getResultsTableViewSettings().examFilter = String(examIdOrTitle);
  getResultsTableViewSettings().page = 1;
  persistResultsTableFilters();
  navigateToView("teacher-dashboard-view");
  activateTeacherTab("results", { force: true, skipRefresh: true });
  setTimeout(() => {
    syncResultsFilterControlsUI();
    renderStudentResultsTable();
  }, 50);
};

function countStudentResults(student) {
  const studentKey = student.studentKey || getStudentLookupKey(student);
  return (systemState.results || []).filter(res => {
    if (isSupersededResult(res)) return false;
    const resultKey = res.studentLookupKey || getStudentLookupKey({
      id: res.id,
      code: res.accessCode,
      name: res.name
    });
    if (studentKey && resultKey && studentKey === resultKey) return true;
    return normalizeStudentId(student.id) && normalizeStudentId(res.id) === normalizeStudentId(student.id);
  }).length;
}

function studentMatchesQuickFilter(student, quickFilter) {
  if (!quickFilter || quickFilter === "all") return true;
  const studentKey = student.studentKey || getStudentLookupKey(student);
  const resultCount = countStudentResults(student);
  const canceled = getStudentCanceledExamIds(studentKey).length > 0;
  if (quickFilter === "has_results") return resultCount > 0;
  if (quickFilter === "no_results") return resultCount === 0;
  if (quickFilter === "multi_exams") return resultCount > 1;
  if (quickFilter === "canceled") return canceled;
  return true;
}

function getStudentsTableFilters() {
  const view = getStudentsTableViewSettings();
  return {
    searchQuery: getStudentsSearchQuery(),
    quickFilter: view.quickFilter || "all"
  };
}

function filterStudentsForTeacherTable(students) {
  const filters = getStudentsTableFilters();
  let list = Array.isArray(students) ? [...students] : [];
  list = filterStudentsForSearch(list, filters.searchQuery);
  if (filters.quickFilter !== "all") {
    list = list.filter(student => studentMatchesQuickFilter(student, filters.quickFilter));
  }
  return list;
}

function isStudentsTableFiltersActive(filters) {
  const active = filters || getStudentsTableFilters();
  return !!(active.searchQuery || (active.quickFilter && active.quickFilter !== "all"));
}

function persistStudentsTableFilters() {
  const view = getStudentsTableViewSettings();
  try {
    localStorage.setItem("arabya_students_filters", JSON.stringify({
      quickFilter: view.quickFilter || "all"
    }));
  } catch (e) {}
}

function syncStudentsFilterControlsUI() {
  const view = getStudentsTableViewSettings();
  document.querySelectorAll("[data-students-quick-filter]").forEach(btn => {
    const isActive = (btn.dataset.studentsQuickFilter || "all") === (view.quickFilter || "all");
    btn.className = isActive ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
  });
}


function syncStudentsSortControlUI() {
  const select = document.getElementById("teacher-students-sort-order");
  if (!select) return;
  select.value = normalizeTableSortOrder(getStudentsTableViewSettings().sortOrder || "newest");
}

function setupStudentsTableSortControl() {
  const select = document.getElementById("teacher-students-sort-order");
  if (!select) return;
  syncStudentsSortControlUI();
  if (select.dataset.bound) return;
  select.dataset.bound = "1";
  select.addEventListener("change", () => {
    const view = getStudentsTableViewSettings();
    view.sortOrder = normalizeTableSortOrder(select.value);
    view.columnSort = null;
    view.page = 1;
    try { localStorage.setItem("arabya_students_sort", view.sortOrder); } catch (e) {}
    persistStudentsColumnSort(null);
    renderTeacherStudentsTable();
  });
}

function resetStudentsTableFilters() {
  const view = getStudentsTableViewSettings();
  view.quickFilter = "all";
  view.page = 1;
  const searchInput = document.getElementById("teacher-students-search-input");
  if (searchInput) searchInput.value = "";
  persistStudentsTableFilters();
  syncStudentsFilterControlsUI();
  renderTeacherStudentsTable();
}

function setupStudentsTableFilterControls() {
  const container = document.getElementById("teacher-students-quick-filters");
  if (!container) return;
  syncStudentsFilterControlsUI();
  setupStudentsTableSortControl();
  if (container.dataset.bound) return;
  container.dataset.bound = "1";

  container.querySelectorAll("[data-students-quick-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      getStudentsTableViewSettings().quickFilter = btn.dataset.studentsQuickFilter || "all";
      getStudentsTableViewSettings().page = 1;
      persistStudentsTableFilters();
      syncStudentsFilterControlsUI();
      renderTeacherStudentsTable();
    });
  });

  const clearBtn = document.getElementById("teacher-students-clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", resetStudentsTableFilters);
}

function normalizeResultsSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getResultsSearchQuery() {
  const input = document.getElementById("teacher-results-search-input");
  return input ? input.value.trim() : "";
}

function resultMatchesSearchQuery(res, query) {
  const normalizedQuery = normalizeResultsSearchText(query);
  if (!normalizedQuery) return true;
  const fields = [
    res.name,
    res.id,
    res.accessCode,
    res.examTitle,
    res.score,
    res.level,
    res.examType,
    res.status,
    res.timestamp
  ];
  if (fields.some(field => normalizeResultsSearchText(field).includes(normalizedQuery))) {
    return true;
  }
  const queryId = normalizeStudentId(query);
  if (queryId && normalizeStudentId(res.id).includes(queryId)) return true;
  const queryCode = sanitizeStudentCodeInput(query);
  if (queryCode && sanitizeStudentCodeInput(res.accessCode || "") === queryCode) return true;
  return false;
}

function filterResultsForSearch(results, query) {
  const list = Array.isArray(results) ? results : [];
  if (!getResultsSearchQuery() && !query) return list;
  const activeQuery = query != null ? String(query).trim() : getResultsSearchQuery();
  if (!activeQuery) return list;
  return list.filter(res => resultMatchesSearchQuery(res, activeQuery));
}

function setupResultsTableSearchControl() {
  const input = document.getElementById("teacher-results-search-input");
  const clearBtn = document.getElementById("teacher-results-search-clear");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      getResultsTableViewSettings().page = 1;
      renderStudentResultsTable();
    }, 180);
  });
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      getResultsTableViewSettings().page = 1;
      renderStudentResultsTable();
      input.focus();
    });
  }
}

function getResultsTableViewSettings() {
  if (!systemState.resultsTableView) {
    let pageSize = 50;
    let statusFilter = "all";
    let examFilter = "";
    let dateFilter = "all";
    try {
      const saved = parseInt(localStorage.getItem("arabya_results_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    let sortOrder = "newest";
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.statusFilter) statusFilter = savedFilters.statusFilter;
      if (savedFilters.examFilter) examFilter = savedFilters.examFilter;
      if (savedFilters.dateFilter) dateFilter = savedFilters.dateFilter;
    } catch (e) {}
    let dateFrom = "";
    let dateTo = "";
    let columnSort = null;
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_results_filters") || "{}");
      if (savedFilters.dateFrom) dateFrom = savedFilters.dateFrom;
      if (savedFilters.dateTo) dateTo = savedFilters.dateTo;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_results_sort") || "newest");
    } catch (e) {}
    try {
      columnSort = JSON.parse(localStorage.getItem("arabya_results_column_sort") || "null");
    } catch (e) {}
    systemState.resultsTableView = { page: 1, pageSize, statusFilter, examFilter, dateFilter, dateFrom, dateTo, sortOrder, columnSort };
  }
  return systemState.resultsTableView;
}

function setResultsTablePageSize(size) {
  const view = getResultsTableViewSettings();
  view.pageSize = [25, 50, 100, 200, 500, 0].includes(size) ? size : 50;
  view.page = 1;
  try { localStorage.setItem("arabya_results_page_size", String(view.pageSize)); } catch (e) {}
}

function clampResultsTablePage(totalItems, pageSize, page) {
  if (!pageSize || pageSize <= 0) return 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function updateResultsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, filtersActive = false) {
  const info = document.getElementById("teacher-results-page-info");
  const pageNum = document.getElementById("teacher-results-page-number");
  const prevBtn = document.getElementById("teacher-results-prev-page");
  const nextBtn = document.getElementById("teacher-results-next-page");
  const sizeSelect = document.getElementById("teacher-results-page-size");
  const isFiltered = filtersActive || totalAll !== totalItems;

  if (sizeSelect && String(sizeSelect.value) !== String(pageSize)) {
    sizeSelect.value = String(pageSize);
  }

  if (totalItems === 0) {
    if (info) {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} سجلاً`
        : "";
    }
    if (pageNum) pageNum.textContent = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const countPrefix = isFiltered ? `وُجد ${totalItems} من ${totalAll} سجل — ` : "";

  if (!pageSize || pageSize <= 0) {
    if (info) {
      info.textContent = isFiltered
        ? `${countPrefix}عرض الكل`
        : `إجمالي ${totalItems} سجلاً — عرض الكل`;
    }
    if (pageNum) pageNum.textContent = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  if (info) info.textContent = `${countPrefix}عرض ${start}–${end} من ${totalItems} سجلاً`;
  if (pageNum) pageNum.textContent = `${page} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
}

function setupResultsTablePaginationControls() {
  const sizeSelect = document.getElementById("teacher-results-page-size");
  const prevBtn = document.getElementById("teacher-results-prev-page");
  const nextBtn = document.getElementById("teacher-results-next-page");

  if (sizeSelect && !sizeSelect.dataset.bound) {
    sizeSelect.dataset.bound = "1";
    sizeSelect.value = String(getResultsTableViewSettings().pageSize);
    sizeSelect.addEventListener("change", () => {
      setResultsTablePageSize(parseInt(sizeSelect.value, 10));
      renderStudentResultsTable();
    });
  }
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => {
      const view = getResultsTableViewSettings();
      if (view.page > 1) {
        view.page -= 1;
        renderStudentResultsTable();
      }
    });
  }
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = "1";
    nextBtn.addEventListener("click", () => {
      const view = getResultsTableViewSettings();
      view.page += 1;
      renderStudentResultsTable();
    });
  }
}

function renderStudentResultsTable() {
  const tbody = document.getElementById("teacher-results-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  setupResultsTablePaginationControls();
  setupResultsTableSearchControl();
  setupResultsTableFilterControls();
  setupResultsTableSortControl();

  const filters = getResultsTableFilters();
  const filtersActive = isResultsTableFiltersActive(filters);
  const totalAll = systemState.results.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد سجلات محلية.${hasCloud ? " اضغط «مزامنة من السحابة» أعلاه لجلب نتائج الطلاب من Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateResultsPaginationUI(0, 1, getResultsTableViewSettings().pageSize, 0, filtersActive);
    return;
  }

  const view = getResultsTableViewSettings();
  renderSortableTableHeaders("#teacher-tab-results .table-container table", RESULTS_TABLE_SORTABLE_COLUMNS, view.columnSort, toggleResultsColumnSort);
  let sorted = sortResultsForDisplay(systemState.results, view.sortOrder);
  sorted = applyResultsColumnSort(sorted, view.columnSort, systemState.results);
  const filtered = filterResultsForTeacherTable(sorted);
  const totalItems = filtered.length;
  view.page = clampResultsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    const emptyMsg = filters.searchQuery
      ? `لا توجد نتائج تطابق «${escapeHtml(filters.searchQuery)}»`
      : "لا توجد نتائج تطابق الفلاتر المحددة";
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} سجل.</td></tr>`;
    updateResultsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }

  let pageItems = filtered;
  if (view.pageSize > 0) {
    const start = (view.page - 1) * view.pageSize;
    pageItems = filtered.slice(start, start + view.pageSize);
  }

  pageItems.forEach(res => {
    const row = document.createElement("tr");
    const displayStatus = getResultDisplayStatus(res);
    if (displayStatus === "canceled") row.style.borderRight = "3px solid var(--error)";
    else if (displayStatus === "incomplete") row.style.borderRight = "3px solid var(--warning)";
    const statusBadge = formatResultStatusBadge(res);
    row.innerHTML = `
      <td>${statusBadge}${escapeHtml(res.name || "")}</td>
      <td><code>${escapeHtml(res.id || "--")}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${escapeHtml(res.accessCode || "لا يوجد")}</span></td>
      <td>${escapeHtml(res.examTitle || "")} (${escapeHtml(res.level || "عام")})</td>
      <td style="font-weight:700; color:var(--secondary);">${escapeHtml(res.score || "")}</td>
      <td>${escapeHtml(res.timestamp || "")}</td>
      <td class="teacher-results-actions" style="display:flex; gap:0.25rem; flex-wrap:wrap;"></td>
    `;

    const actionsCell = row.querySelector(".teacher-results-actions");
    appendResultRetakeActions(res, actionsCell);

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-outline btn-sm";
    viewBtn.textContent = "عرض / تعديل";
    viewBtn.addEventListener("click", () => viewTeacherResultDetail(res.recordId || "", res.id || "", res.examId || ""));
    actionsCell.appendChild(viewBtn);

    tbody.appendChild(row);
  });

  updateResultsPaginationUI(totalItems, view.page, view.pageSize, totalAll, filtersActive);
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
  const presentedQuestions = getPresentedQuestionsForResult(res, exam);
  const presentedMeta = calculateRuntimeExamMeta(presentedQuestions);
  const examForDisplay = {
    ...(exam || {
      title: res.examTitle || "امتحان محذوف",
      totalScore: res.maxScore || 100
    }),
    questions: presentedQuestions,
    totalScore: presentedMeta.maxScore || res.maxScore || exam?.totalScore || 100
  };

  systemState.currentGradingResult = res;
  systemState.currentGradingExam = examForDisplay

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
  renderResultRetakeManagementPanel(res);
  renderStudentAttemptsPanel(res);

  if (!res.studentAnswers) res.studentAnswers = {};
  if (!res.questionScores) res.questionScores = {};

  const container = document.getElementById("detail-questions-container");
  if (!container) return;
  container.innerHTML = "";

  const questionsToRender = examForDisplay.questions || [];
  if (!questionsToRender.length) {
    container.innerHTML = `<div style="padding:1rem; color:var(--warning); border:1px solid var(--warning); border-radius:8px;">تعذّر تحديد الأسئلة التي ظهرت لهذا الطالب من البيانات المحفوظة. إذا كانت النتيجة قديماً، جرّب مزامنة سحابية أو افتح النتيجة من نفس الجهاز الذي أُجري عليه الامتحان.</div>`;
    return;
  }

  questionsToRender.forEach((q, index) => {
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
      <div style="font-size:1.1rem; color:white; margin-bottom:1rem; font-weight:600; line-height:1.6;">${escapeHtml(q.question)}</div>
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
        indicator.innerHTML = `<span style="color:var(--error); font-weight:700;"><span class="material-icons" style="font-size:1.1rem; vertical-align:middle;">cancel</span> إجابة الطالب خاطئة</span> (الإجابة النموذجية: ${escapeHtml(correctText)})`;
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

  if (!Array.isArray(res.presentedQuestions) || !res.presentedQuestions.length) {
    res.presentedQuestions = JSON.parse(JSON.stringify(exam.questions));
  }
  res.maxScore = calculateRuntimeExamMeta(exam.questions).maxScore;

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

  const exportRows = getResultsForExport();
  if (!exportRows.length) {
    alert("لا توجد نتائج مطابقة للفلاتر الحالية للتصدير!");
    return;
  }

  let csvContent = "\ufeffsep=,\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,النتيجة,التاريخ والوقت\n";

  exportRows.forEach(res => {
    csvContent += buildCsvLine([
      res.name || "",
      res.id || "",
      res.accessCode || "لا يوجد",
      res.university || "عام",
      res.faculty || "عام",
      res.level || "عام",
      res.examTitle || "",
      res.examType || "أعمال سنة",
      getResultDisplayStatus(res),
      getResultRetakeStatusText(res),
      res.score || "",
      res.timestamp || ""
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `نتائج_arabya_${getExportDateStamp()}.csv`
  );
}

async function clearTeacherResults() {
  if (!confirm("هل أنت متأكد من رغبتك في حذف جميع نتائج وسجلات الطلاب نهائياً؟ (لا يمكن التراجع عن ذلك)")) {
    return;
  }
  systemState.results = [];
  localStorage.setItem("arabya_results_db", "[]");
  renderStudentResultsTable();
  const synced = await syncLocalDatabaseToCloud();
  alert(synced ? "تم مسح السجلات ومزامنة التغيير مع Google Sheets." : "تم مسح السجلات محلياً.");
}

// ==========================================
// 9. آليات منع الغش وتأمين النوافذ
// ==========================================

function isMobileExamDevice() {
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  return (coarse && touch) || (narrow && touch);
}

function getExamAntiCheatGraceMs() {
  return isMobileExamDevice() ? 12000 : 4000;
}

function markExamAntiCheatStarted() {
  systemState.examAntiCheatStartedAt = Date.now();
}

function shouldTriggerFocusAntiCheat(reason) {
  if (!systemState.isExamActive || systemState.isCheatingSuspended) return false;
  const startedAt = systemState.examAntiCheatStartedAt || 0;
  if (Date.now() - startedAt < getExamAntiCheatGraceMs()) return false;
  if (isMobileExamDevice() && reason === "blur") return false;
  return true;
}

function getExamBlockingMessage(blockingResult) {
  if (!blockingResult) return "";
  if (blockingResult.status === "canceled") {
    return "تم إلغاء امتحانك سابقاً بسبب مخالفة قواعد الامتحان.\n\nاطلب من المعلم «السماح بإعادة الامتحان» من تبويب النتائج، ثم حاول الدخول مرة أخرى.";
  }
  return "لقد أنهيت هذا الامتحان وتسليم إجاباتك مسبقاً.\n\nإذا احتجت محاولة جديدة، اطلب من المعلم «السماح بإعادة الامتحان».";
}

function getCheatPenaltyMessage(reason, violationNumber, maxViolations) {
  const actionMap = {
    blur: "الخروج من نافذة الامتحان",
    visibility: "إخفاء تبويب الامتحان أو التبديل لتطبيق آخر",
    screenshot: "محاولة التقاط لقطة شاشة",
    copy: "محاولة النسخ",
    cut: "محاولة القص",
    paste: "محاولة اللصق",
    "keyboard-shortcut": "استخدام اختصار لوحة مفاتيح محظور"
  };
  const actionText = actionMap[reason] || "مخالفة قواعد الامتحان";
  const remaining = Math.max(0, maxViolations - violationNumber);
  const mobileHint = isMobileExamDevice()
    ? "<br><span style=\"font-size:0.9rem; color:var(--text-muted);\">على الهاتف: ابقَ داخل صفحة الامتحان ولا تفتح تطبيقات أخرى أثناء الحل.</span>"
    : "";
  if (violationNumber >= maxViolations) {
    return `<span style="color:var(--error); font-size:1.8rem; font-weight:800; display:block; margin-bottom:1rem;">تم إلغاء الامتحان</span>` +
      `تم رصد ${actionText}. تم إنهاء الاختبار وتسجيل حالة الإلغاء.${mobileHint}`;
  }
  return `<span style="color:var(--warning); font-size:1.5rem; font-weight:700; display:block; margin-bottom:0.5rem;">تحذير (${violationNumber} من ${maxViolations})</span>` +
    `تم رصد ${actionText}. تم إلغاء السؤال الحالي وتصفير درجته.${mobileHint}` +
    `<span style="color:var(--error); font-weight:bold; font-size:0.95rem; display:block; margin-top:0.5rem;">متبقي ${remaining} تحذير${remaining === 1 ? "" : "ات"} قبل إلغاء الامتحان.</span>`;
}

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
    if (shouldTriggerFocusAntiCheat("blur")) {
      triggerRunnerCheatPenalty("blur");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && shouldTriggerFocusAntiCheat("visibility")) {
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
  // ملء الشاشة معطّل — غير متناسق على الهواتف.
}

function releaseSecureExamMode() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function getMaxCheatAttemptsForExam(exam) {
  const parsed = parseInt(exam?.maxCheatAttempts, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 5;
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
  const maxViolations = getMaxCheatAttemptsForExam(exam);
  const shouldCancel = shouldCancelExamForCheating(exam, systemState.cheatViolations);

  mainWrapper.classList.add("blurred-content");
  overlay.classList.remove("hidden");

  if (shouldCancel) {
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);

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
    msg.innerHTML = getCheatPenaltyMessage(reason, systemState.cheatViolations, maxViolations);

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
    savedAt: Date.now(),
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

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  systemState.currentExamRuntime = null;
  saveSystemState(true);
  syncRetakeAffectedResultsToCloud(archivedAttempts);

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
    if (isFiveDigitStudentCode(codeVal) && !isSharedStudentCode(codeVal)) {
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
  allowStudentExamRetake(recordId);
};



function getStudentsSearchQuery() {
  const input = document.getElementById("teacher-students-search-input");
  return input ? input.value.trim() : "";
}

function studentMatchesSearchQuery(student, query) {
  const normalizedQuery = normalizeResultsSearchText(query);
  if (!normalizedQuery) return true;
  const fields = [
    student.name,
    student.id,
    student.code,
    student.email,
    student.mobile,
    student.timestamp,
    student.studentKey
  ];
  if (fields.some(field => normalizeResultsSearchText(field).includes(normalizedQuery))) {
    return true;
  }
  const queryId = normalizeStudentId(query);
  if (queryId && normalizeStudentId(student.id).includes(queryId)) return true;
  const queryCode = sanitizeStudentCodeInput(query);
  if (queryCode && sanitizeStudentCodeInput(student.code || "") === queryCode) return true;
  return false;
}

function filterStudentsForSearch(students, query) {
  const list = Array.isArray(students) ? students : [];
  const activeQuery = query != null ? String(query).trim() : getStudentsSearchQuery();
  if (!activeQuery) return list;
  return list.filter(student => studentMatchesSearchQuery(student, activeQuery));
}

function setupStudentsTableSearchControl() {
  const input = document.getElementById("teacher-students-search-input");
  const clearBtn = document.getElementById("teacher-students-search-clear");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      getStudentsTableViewSettings().page = 1;
      renderTeacherStudentsTable();
    }, 180);
  });
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      getStudentsTableViewSettings().page = 1;
      renderTeacherStudentsTable();
      input.focus();
    });
  }
}

function getStudentsTableViewSettings() {
  if (!systemState.studentsTableView) {
    let pageSize = 50;
    let quickFilter = "all";
    try {
      const saved = parseInt(localStorage.getItem("arabya_students_page_size") || "50", 10);
      if ([25, 50, 100, 200, 500, 0].includes(saved)) pageSize = saved;
    } catch (e) {}
    let sortOrder = "newest";
    try {
      const savedFilters = JSON.parse(localStorage.getItem("arabya_students_filters") || "{}");
      if (savedFilters.quickFilter) quickFilter = savedFilters.quickFilter;
    } catch (e) {}
    try {
      sortOrder = normalizeTableSortOrder(localStorage.getItem("arabya_students_sort") || "newest");
    } catch (e) {}
    systemState.studentsTableView = { page: 1, pageSize, quickFilter, sortOrder };
  }
  return systemState.studentsTableView;
}

function setStudentsTablePageSize(size) {
  const view = getStudentsTableViewSettings();
  view.pageSize = [25, 50, 100, 200, 500, 0].includes(size) ? size : 50;
  view.page = 1;
  try { localStorage.setItem("arabya_students_page_size", String(view.pageSize)); } catch (e) {}
}

function clampStudentsTablePage(totalItems, pageSize, page) {
  if (!pageSize || pageSize <= 0) return 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function updateStudentsPaginationUI(totalItems, page, pageSize, totalAll = totalItems, filtersActive = false) {
  const info = document.getElementById("teacher-students-page-info");
  const pageNum = document.getElementById("teacher-students-page-number");
  const prevBtn = document.getElementById("teacher-students-prev-page");
  const nextBtn = document.getElementById("teacher-students-next-page");
  const sizeSelect = document.getElementById("teacher-students-page-size");
  const isFiltered = filtersActive || totalAll !== totalItems;

  if (sizeSelect && String(sizeSelect.value) !== String(pageSize)) {
    sizeSelect.value = String(pageSize);
  }

  if (totalItems === 0) {
    if (info) {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} طالب`
        : "";
    }
    if (pageNum) pageNum.textContent = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const countPrefix = isFiltered ? `وُجد ${totalItems} من ${totalAll} طالب — ` : "";

  if (!pageSize || pageSize <= 0) {
    if (info) {
      info.textContent = isFiltered
        ? `${countPrefix}عرض الكل`
        : `إجمالي ${totalItems} طالب — عرض الكل`;
    }
    if (pageNum) pageNum.textContent = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  if (info) info.textContent = `${countPrefix}عرض ${start}–${end} من ${totalItems} طالب`;
  if (pageNum) pageNum.textContent = `${page} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
}

function setupStudentsTablePaginationControls() {
  const sizeSelect = document.getElementById("teacher-students-page-size");
  const prevBtn = document.getElementById("teacher-students-prev-page");
  const nextBtn = document.getElementById("teacher-students-next-page");

  if (sizeSelect && !sizeSelect.dataset.bound) {
    sizeSelect.dataset.bound = "1";
    sizeSelect.value = String(getStudentsTableViewSettings().pageSize);
    sizeSelect.addEventListener("change", () => {
      setStudentsTablePageSize(parseInt(sizeSelect.value, 10));
      renderTeacherStudentsTable();
    });
  }
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => {
      const view = getStudentsTableViewSettings();
      if (view.page > 1) {
        view.page -= 1;
        renderTeacherStudentsTable();
      }
    });
  }
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = "1";
    nextBtn.addEventListener("click", () => {
      const view = getStudentsTableViewSettings();
      view.page += 1;
      renderTeacherStudentsTable();
    });
  }
}

window.pullTeacherStudentsFromCloud = async function() {
  const el = document.getElementById("teacher-students-sync-status");
  if (el) {
    el.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري جلب الطلاب والنتائج من Google Sheets...`;
  }
  const ok = await pullTeacherResultsFromCloud();
  if (el) {
    if (ok) {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تمت المزامنة: ${systemState.students.length} طالب و ${systemState.results.length} نتيجة`;
    } else if (!document.getElementById("teacher-results-sync-status")?.textContent?.includes("cloud_done")) {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--error);">cloud_off</span> تعذّر الجلب. تأكد من رابط /exec ونشر Apps Script كإصدار جديد.`;
    } else {
      el.innerHTML = `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> ${systemState.students.length} طالب`;
    }
  }
  refreshTeacherDashboardViews({ all: true });
  return ok;
};

function renderTeacherStudentsTable() {
  const tbody = document.getElementById("teacher-students-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  setupStudentsTablePaginationControls();
  setupStudentsTableSearchControl();
  setupStudentsTableFilterControls();
  setupStudentsTableSortControl();

  const filters = getStudentsTableFilters();
  const filtersActive = isStudentsTableFiltersActive(filters);
  const totalAll = systemState.students.length;

  if (totalAll === 0) {
    const hasCloud = getArabyaWebAppUrls().length > 0;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">لا يوجد طلاب محلياً.${hasCloud ? " اضغط «مزامنة من السحابة» لجلب الطلاب من نتائج Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
    updateStudentsPaginationUI(0, 1, getStudentsTableViewSettings().pageSize, 0, filtersActive);
    return;
  }

  const view = getStudentsTableViewSettings();
  renderSortableTableHeaders("#teacher-tab-students .table-container table", STUDENTS_TABLE_SORTABLE_COLUMNS, view.columnSort, toggleStudentsColumnSort);
  let sorted = sortStudentsForDisplay(systemState.students, view.sortOrder);
  sorted = applyStudentsColumnSort(sorted, view.columnSort, systemState.students);
  const filtered = filterStudentsForTeacherTable(sorted);
  const totalItems = filtered.length;
  view.page = clampStudentsTablePage(totalItems, view.pageSize, view.page);

  if (totalItems === 0) {
    const emptyMsg = filters.searchQuery
      ? `لا يوجد طلاب يطابقون «${escapeHtml(filters.searchQuery)}»`
      : "لا يوجد طلاب يطابقون الفلاتر المحددة";
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} طالب.</td></tr>`;
    updateStudentsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }

  let pageItems = filtered;
  if (view.pageSize > 0) {
    const start = (view.page - 1) * view.pageSize;
    pageItems = filtered.slice(start, start + view.pageSize);
  }

  pageItems.forEach(s => {
    const studentKey = s.studentKey || getStudentLookupKey(s);
    const canceledExamIds = getStudentCanceledExamIds(studentKey);
    const canceledBadge = canceledExamIds.length
      ? `<span style="color:var(--error); font-weight:700; font-size:0.75rem; display:block; margin-top:0.15rem;">تم إلغاء الامتحان</span>`
      : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(s.name || "")}${canceledBadge}</td>
      <td><code>${escapeHtml(s.id || "--")}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${escapeHtml(s.code || "لا يوجد")}</span></td>
      <td>${escapeHtml(s.email || "--")}</td>
      <td>${escapeHtml(s.mobile || "--")}</td>
      <td>${escapeHtml(s.timestamp || "غير معروف")}</td>
      <td class="teacher-students-actions" style="display:flex; gap:0.25rem; flex-wrap:wrap;"></td>
    `;

    const actionsCell = row.querySelector(".teacher-students-actions");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-outline btn-sm";
    editBtn.style.cssText = "border-color:var(--secondary); color:var(--secondary); padding:0.25rem 0.5rem;";
    editBtn.textContent = "تعديل";
    editBtn.addEventListener("click", () => editStudentByTeacher(studentKey));
    actionsCell.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-outline btn-sm";
    deleteBtn.style.cssText = "border-color:var(--error); color:var(--error); padding:0.25rem 0.5rem;";
    deleteBtn.textContent = "حذف";
    deleteBtn.addEventListener("click", () => deleteStudentByTeacher(studentKey));
    actionsCell.appendChild(deleteBtn);

    tbody.appendChild(row);
  });

  updateStudentsPaginationUI(totalItems, view.page, view.pageSize, totalAll, filtersActive);
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
window.saveNewStudentByTeacher = async function() {
  const name = document.getElementById("new-student-name").value.trim();
  const id = normalizeStudentId(document.getElementById("new-student-id").value.trim());
  const rawCode = document.getElementById("new-student-code").value.trim();
  const code = sanitizeStudentCodeInput(rawCode);

  if (!name) {
    alert("يرجى إدخال اسم الطالب!");
    return;
  }
  if (rawCode && !isFiveDigitStudentCode(code)) {
    alert("كود الاشتراك يجب أن يكون 5 أرقام (أو اتركه فارغاً).");
    return;
  }

  if (systemState.editingStudentKey) {
    const previousKey = systemState.editingStudentKey;
    const existing = findStudentByKey(previousKey);
    if (!existing) {
      alert("لم يتم العثور على الطالب للتعديل!");
      return;
    }
    if (isPrivateStudentCode(code)) {
      const duplicateCode = systemState.students.find(s => sanitizeStudentCodeInput(s.code) === code && s.studentKey !== existing.studentKey);
      if (duplicateCode) {
        alert("كود الاشتراك الخاص مستخدم بالفعل لطالب آخر!");
        return;
      }
    }
    if (id) {
      const duplicateId = systemState.students.find(s => normalizeStudentId(s.id) === id && s.studentKey !== existing.studentKey);
      if (duplicateId) {
        alert("رقم المعرف ID مسجل بالفعل لطالب آخر!");
        return;
      }
    }
    existing.name = name;
    existing.id = id;
    existing.code = code;
    existing.studentKey = getStudentLookupKey(existing) || existing.studentKey;
    propagateStudentEditsToResults(existing, previousKey);
    saveSystemState(false);
    renderTeacherStudentsTable();
    renderStudentResultsTable();
    hideAddStudentModal();
    const synced = await syncStudentRecordToCloud(existing);
    systemState.results
      .filter(r => r.studentLookupKey === existing.studentKey)
      .forEach(res => sendUpdatedResultToCloud(res));
    alert(`تم تعديل بيانات الطالب "${name}" بنجاح!${synced ? " وتمت المزامنة مع Google Sheets." : " (محفوظ محلياً — تحقق من رابط المزامنة)"}`);
    return;
  }

  if (isPrivateStudentCode(code)) {
    const duplicateCode = findStudentByCode(code);
    if (duplicateCode) {
      alert("كود الاشتراك الخاص مستخدم بالفعل لطالب آخر!");
      return;
    }
  }
  if (id) {
    const duplicateId = findStudentById(id);
    if (duplicateId) {
      alert("رقم المعرف ID مسجل بالفعل لطالب آخر!");
      return;
    }
  }

  const created = upsertStudentRecord({ name, id, code });
  saveSystemState(false);
  renderTeacherStudentsTable();
  hideAddStudentModal();
  const synced = await syncStudentRecordToCloud(created);
  alert(`تم تسجيل الطالب "${name}" بنجاح!${synced ? " وتمت المزامنة مع Google Sheets." : " (محفوظ محلياً — تحقق من رابط المزامنة)"}`);
};

window.editStudentByTeacher = function(studentKey) {
  const student = findStudentByKey(studentKey);
  if (!student) {
    alert("لم يتم العثور على الطالب!");
    return;
  }

  systemState.editingStudentKey = student.studentKey;

  const card = document.getElementById("add-student-form-card");
  if (card) {
    card.classList.remove("hidden");
    const heading = card.querySelector("h4");
    if (heading) heading.innerText = "تعديل بيانات حساب الطالب في النظام";
    const saveBtn = card.querySelector("button[onclick='saveNewStudentByTeacher()']");
    if (saveBtn) saveBtn.innerText = "حفظ التعديلات";
  }

  document.getElementById("new-student-name").value = student.name || "";
  document.getElementById("new-student-id").value = student.id || "";
  document.getElementById("new-student-code").value = student.code || "";
};

window.deleteStudentByTeacher = async function(studentKey) {
  const student = findStudentByKey(studentKey);
  if (!student) {
    alert("لم يتم العثور على الطالب!");
    return;
  }
  if (!confirm(`هل أنت متأكد من حذف الطالب "${student.name}"؟`)) return;
  systemState.students = systemState.students.filter(s => s.studentKey !== studentKey);
  saveSystemState(false);
  renderTeacherStudentsTable();
  const synced = await syncLocalDatabaseToCloud();
  alert(synced ? `تم حذف الطالب "${student.name}" ومزامنة التغيير مع Google Sheets.` : `تم حذف الطالب "${student.name}" محلياً.`);
};

// تصدير الطلاب كملف JSON (الصفوف المفلترة)
window.exportStudentsToJSON = function() {
  if (systemState.students.length === 0) {
    alert("لا يوجد طلاب لتصديرهم!");
    return;
  }
  const exportRows = getStudentsForExport();
  if (!exportRows.length) {
    alert("لا يوجد طلاب يطابقون الفلاتر الحالية للتصدير!");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: ARABYA_APP_VERSION,
    filtered: isStudentsTableFiltersActive(),
    count: exportRows.length,
    students: exportRows
  };
  downloadBlobFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `طلاب_arabya_${getExportDateStamp()}.json`
  );
};

window.exportStudentsToCSV = function() {
  if (systemState.students.length === 0) {
    alert("لا يوجد طلاب لتصديرهم!");
    return;
  }
  const exportRows = getStudentsForExport();
  if (!exportRows.length) {
    alert("لا يوجد طلاب يطابقون الفلاتر الحالية للتصدير!");
    return;
  }

  let csvContent = "\ufeffsep=,\n";
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,البريد,الموبايل,تاريخ التسجيل,عدد النتائج\n";

  exportRows.forEach(stu => {
    csvContent += buildCsvLine([
      stu.name || "",
      stu.id || "",
      stu.code || "",
      stu.email || "",
      stu.mobile || "",
      stu.timestamp || "",
      countStudentResults(stu)
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `طلاب_arabya_${getExportDateStamp()}.csv`
  );
};

// استيراد الطلاب من ملف JSON
window.importStudentsFromJSON = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.students) ? parsed.students : null);
      if (!rows) {
        alert("تنسيق ملف الطلاب غير صحيح! يجب أن يكون مصفوفة طلاب أو كائن يحتوي students.");
        return;
      }
      let addedCount = 0;
      let updatedCount = 0;
      rows.forEach(stu => {
        if (!stu || !stu.id || !stu.name) return;
        const existing = findStudentById(stu.id) || (stu.studentKey ? findStudentByKey(stu.studentKey) : null);
        upsertStudentRecord({
          name: stu.name,
          id: stu.id,
          code: stu.code || stu.accessCode || "",
          email: stu.email || "",
          mobile: stu.mobile || ""
        }, stu.studentKey || "");
        if (existing) updatedCount++;
        else addedCount++;
      });
      finalizeDatabaseImportMessage();
      refreshTeacherDashboardViews({ all: true });
      alert(`تم استيراد ${addedCount} طالب جديد وتحديث ${updatedCount} سجل من ${rows.length} صف.`);
    } catch (err) {
      alert("خطأ في قراءة ملف الطلاب المرفوع!");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

// ==========================================
// 10. وظيفة نسخ رابط الامتحان بنجاح وتوافقية
// ==========================================
function buildExamShareLink(rawUrl) {
  try {
    const url = new URL(rawUrl, getAppBaseUrl());
    let examId = url.searchParams.get("exam") || "";

    if (!examId) {
      const segs = url.pathname.split('/').filter(Boolean);
      const last = segs.length ? segs[segs.length - 1] : "";
      const ex = (systemState.exams || []).find(e => String(e.id).toLowerCase() === String(last).toLowerCase());
      if (ex) examId = ex.id;
    }

    let exam = null;
    if (examId) {
      exam = (systemState.exams || []).find(e => String(e.id).toLowerCase() === String(examId).toLowerCase()) || null;
      url.searchParams.set("exam", examId);
    }

    if (!url.searchParams.get("teacher") && systemState.activeTeacher && systemState.activeTeacher.username) {
      url.searchParams.set("teacher", systemState.activeTeacher.username);
    }

    let syncUrl = getEffectiveExamSyncUrl(exam || {});

    if (!syncUrl) {
      const teacherUser = url.searchParams.get("teacher") || "";
      if (teacherUser && Array.isArray(systemState.teachers)) {
        const t = systemState.teachers.find(x => x.username === teacherUser || x.name === teacherUser);
        if (t && t.integrationConfig && t.integrationConfig.googleFormUrl) {
          const u = String(t.integrationConfig.googleFormUrl).trim();
          if (u.includes("/macros/s/") || u.endsWith("/exec")) syncUrl = u;
        }
      }
    }

    if (!syncUrl) {
      try {
        const cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
        const u = cfg.googleFormUrl ? String(cfg.googleFormUrl).trim() : "";
        if (u && (u.includes("/macros/s/") || u.endsWith("/exec"))) syncUrl = u;
      } catch (e) {}
    }

    if (syncUrl) {
      url.searchParams.set("s", syncUrl);
    }

    return url.toString();
  } catch (e) {
    return rawUrl;
  }
}

window.copyExamLink = function(url) {
  if (!url) {
    alert("رابط الامتحان غير صالح!");
    return;
  }
  const normalizedUrl = buildExamShareLink(url);
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(normalizedUrl)
      .then(() => {
        alert("تم نسخ رابط الامتحان بنجاح!");
      })
      .catch(err => {
        fallbackCopyTextToClipboard(normalizedUrl);
      });
  } else {
    fallbackCopyTextToClipboard(normalizedUrl);
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
  ensureResultRecordIds();
  ensureStudentsDataShape();
  ensureExamsDataShape();
  const dbBackup = {
    exportedAt: new Date().toISOString(),
    appVersion: ARABYA_APP_VERSION,
    teachers: systemState.teachers,
    students: systemState.students,
    exams: systemState.exams,
    results: systemState.results
  };

  downloadBlobFile(
    new Blob([JSON.stringify(dbBackup, null, 2)], { type: "application/json" }),
    `نسخة_احتياطية_كاملة_arabya_${getExportDateStamp()}.json`
  );
  alert(`تم تصدير نسخة احتياطية كاملة: ${systemState.students.length} طالب · ${systemState.results.length} نتيجة · ${systemState.exams.length} امتحان.`);
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

          finalizeDatabaseImportMessage();
          alert(`تم استعادة قاعدة البيانات: ${systemState.students.length} طالب · ${systemState.results.length} نتيجة · ${systemState.exams.length} امتحان. سيتم إعادة تحميل الصفحة.`);
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
      savedAt: Date.now(),
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
