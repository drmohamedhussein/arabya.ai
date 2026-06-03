/**
 * بوابة الطالب ومشغل الامتحان
 * مستخرج من app.js — يعتمد على window.systemState بعد تحميل app.js.
 */
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

async function validateStudentAndStart() {
  reloadSystemStateFromLocalStorage();
  const startBtn = document.getElementById("student-start-exam-btn");
  const prevBtnText = startBtn ? startBtn.innerHTML : "";

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
  if (hasCodeInput && !isValidStudentCodeFormat(rawCode)) {
    alert("كود الاشتراك غير صالح. استخدم حروفاً أو أرقاماً أو كليهما.");
    return;
  }
  if (id && !isValidStudentIdFormat(id)) {
    alert("معرف الهوية غير صالح. استخدم حروفاً أو أرقاماً أو كليهما.");
    return;
  }
  if (!examId) {
    alert("يرجى اختيار الامتحان المستهدف!");
    return;
  }

  let selectedExam = systemState.exams.find(e => e.id === examId);
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
  if (hasStudentCode(inputCode)) {
    matchedStudent = findStudentByCode(inputCode, { studentId: normalizedId, name });
  }
  if (!matchedStudent && normalizedId) {
    matchedStudent = findStudentById(normalizedId);
  }
  if (!matchedStudent && !hasStudentCode(inputCode) && !normalizedId) {
    const byName = findStudentsByName(name);
    if (byName.length === 1) {
      matchedStudent = byName[0];
    } else if (byName.length > 1) {
      alert("يوجد أكثر من طالب بنفس الاسم. يرجى إدخال معرف الهوية أو كود الاشتراك للتمييز.");
      return;
    }
  }

  const identityCheck = validateStudentIdentityInput(id, rawCode, { name });
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
  const studentMatchContext = buildStudentMatchContext(systemState.currentStudent);
  const blockingResult = findBlockingExamResult(studentLookupKey, examId, studentMatchContext);
  if (blockingResult) {
    alert(getExamBlockingMessage(blockingResult));
    return;
  }

  const activeRetakeGrant = findActiveRetakeGrant(studentLookupKey, examId, studentMatchContext);
  if (activeRetakeGrant) {
    const retakeConfirm = confirm(`المعلم سمح لك بإعادة أداء امتحان "${selectedExam.title}". هل تريد البدء الآن؟`);
    if (!retakeConfirm) return;
  }

  if (getArabyaWebAppUrls().length > 0) {
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري التجهيز...`;
    }
    const estimateMs = getPreExamSyncEstimateMs();
    const overlay = showStudentExamPrepareOverlay(estimateMs);
    const syncStarted = performance.now();
    const syncPromise = studentExamGatePrefetchPromise || syncDatabaseFromCloud({
      silent: true,
      scope: "exam_start",
      timeoutMs: 8000
    });
    try {
      await waitPreExamCountdownAndSync(overlay, syncPromise, estimateMs);
    } catch (prepErr) {
      console.warn("[ARABYA] pre-exam prepare failed:", prepErr);
      overlay.close();
    }
    recordPreExamSyncDuration(performance.now() - syncStarted);
    studentExamGatePrefetchPromise = null;
    reloadSystemStateFromLocalStorage();

    selectedExam = systemState.exams.find(e => e.id === examId);
    if (!selectedExam) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert("الامتحان المختار غير متوفر بعد المزامنة!");
      return;
    }
    sanitizeQuestionConfig(selectedExam);
    if (selectedExam.questions.length === 0) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert("عذراً، هذا الامتحان لا يحتوي على أي أسئلة مضافة بعد!");
      return;
    }
    if (isExamPastDeadline(selectedExam)) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert(getExamDeadlineBlockMessage(selectedExam));
      return;
    }
    const blockingAfterSync = findBlockingExamResult(studentLookupKey, examId, studentMatchContext);
    if (blockingAfterSync) {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = prevBtnText;
      }
      alert(getExamBlockingMessage(blockingAfterSync));
      return;
    }
  }

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear;">hourglass_top</span> جاري التحقق من الجهاز...`;
  }

  let deviceProfile = null;
  try {
    const deviceCheck = await enforceExamDeviceBinding(studentLookupKey, systemState.currentStudent.name, examId, studentMatchContext);
    if (!deviceCheck.ok) {
      alert(deviceCheck.message);
      return;
    }
    deviceProfile = deviceCheck.profile;
    mergeDeviceProfileIntoStudent(studentRecord, deviceProfile);
    systemState.currentStudent.deviceId = deviceProfile.deviceId;
    systemState.currentStudent.lastKnownIp = deviceProfile.clientIp || "";
    systemState.examDeviceProfile = deviceProfile;
    saveStudentsToLocalStorage();
    saveSystemState(false);
  } catch (deviceErr) {
    console.error("[ARABYA] device binding failed:", deviceErr);
    alert("تعذر التحقق من بصمة الجهاز. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.");
    return;
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = prevBtnText || `الانتقال لبدء الامتحان`;
    }
  }

  systemState.currentExam = selectedExam;

  systemState.shuffledQuestions = buildRuntimeQuestionsForExam(selectedExam);
  systemState.currentExamRuntime = calculateRuntimeExamMeta(systemState.shuffledQuestions);

  systemState.currentQuestionIndex = 0;
  systemState.studentAnswers = {};
  systemState.isExamActive = true;
  systemState.isCheatingSuspended = false;
  systemState.cheatViolations = 0;
  systemState.cheatAttemptLog = [];
  systemState.examMaxCheatAttemptsAllowed = getExamMaxCheatAttempts(selectedExam);
  markExamAntiCheatStarted();

  systemState.results = systemState.results.filter(r => !(r.studentLookupKey === studentLookupKey && r.examId === selectedExam.id && r.status === "incomplete"));
  saveActiveStudentSession();
  updateLiveIncompleteResult();

  navigateToView("exam-runner-view");
  renderRunnerQuestion();
  startRunnerTimer();
  startExamDeadlineWatcher();
  requestSecureExamMode();
  showExamSecurityNotice();
}

function showExamSecurityNotice() {
  const hint = document.getElementById("runner-mobile-exam-hint");
  if (!hint) return;
  hint.classList.remove("hidden");
  const cat = getExamDeviceCategory();
  const graceSec = Math.round(getExamAntiCheatGraceMs() / 1000);
  const deviceLabel = cat === "mobile" ? "الهاتف" : cat === "tablet" ? "التابلت" : "الكمبيوتر";
  hint.innerHTML =
    `<span class="material-icons" style="vertical-align:middle; font-size:1rem;">security</span> ` +
    `وضع تأمين الامتحان مفعّل على ${deviceLabel}: لا تغادر التبويب ولا تفتح ChatGPT أو تطبيقات أخرى. ` +
    `أي تبديل تبويب أو مغادرة الصفحة يُسجَّل كمحاولة غش (حسب حد المعلم) بعد ${graceSec} ثانية. ` +
    `لن يظهر لك عدد المحاولات — تظهر للمعلم فقط في سجل النتائج. ` +
    `يُمنع استخدام نفس الجهاز لطالبين مختلفين.`;
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
  if (getExamDeviceCategory() === "desktop") {
    qTextEl.focus();
  }

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
      card.addEventListener("pointerdown", () => markExamClickGrace());
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

  systemState.timer.timeLimit = getEffectiveQuestionTimeSeconds(question, exam);
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
  const question = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  startRunnerTimerWithTime(getEffectiveQuestionTimeSeconds(question, systemState.currentExam));
}

function startRunnerTimerWithTime(seconds) {
  if (checkExamDeadlineDuringSession()) return;
  const msLeft = getMsUntilExamDeadline();
  let effectiveSeconds = Number(seconds) || 0;
  if (msLeft !== null) {
    if (msLeft <= 0) {
      checkExamDeadlineDuringSession();
      return;
    }
    effectiveSeconds = Math.min(effectiveSeconds, Math.max(1, Math.ceil(msLeft / 1000)));
  }
  if (effectiveSeconds <= 0) {
    checkExamDeadlineDuringSession();
    return;
  }

  systemState.timer.timeLimit = effectiveSeconds;
  systemState.timer.timeRemaining = effectiveSeconds;
  updateRunnerTimerUI();

  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const fillCircle = document.getElementById("runner-timer-circle");
  const container = document.getElementById("runner-timer-container");
  
  if (fillCircle) fillCircle.style.strokeDashoffset = 0;
  if (container) container.classList.remove("timer-warning");

  systemState.timer.intervalId = setInterval(() => {
    if (checkExamDeadlineDuringSession()) return;
    systemState.timer.timeRemaining--;
    updateRunnerTimerUI();
    saveActiveStudentSession(); // حفظ التقدم مع التوقيت المتبقي

    if (systemState.timer.timeRemaining <= 10) {
      if (container) container.classList.add("timer-warning");
    }

    if (systemState.timer.timeRemaining <= 0) {
      clearInterval(systemState.timer.intervalId);
      systemState.timer.intervalId = null;
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

function announceExamAccessibility(message) {
  const live = document.getElementById("runner-voice-announcement");
  if (live) {
    live.textContent = "";
    setTimeout(() => { live.textContent = message; }, 30);
  }
}

function runnerNextQuestion(isAuto = false) {
  const currentQ = systemState.shuffledQuestions[systemState.currentQuestionIndex];
  
  if (!isAuto && systemState.studentAnswers[currentQ.id] === undefined) {
    alert("يرجى اختيار إجابة أو كتابة النص المطلوب قبل الانتقال!");
    announceExamAccessibility("يرجى اختيار إجابة قبل الانتقال للسؤال التالي.");
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
    announceExamAccessibility(`السؤال ${systemState.currentQuestionIndex + 1} من ${systemState.shuffledQuestions.length}`);
  } else {
    announceExamAccessibility("جاري تسليم الامتحان وحساب النتيجة.");
    submitFinishedExam();
  }
}

// حساب وتوثيق النتيجة مع هيكل الدرجات النسبية المطور
function submitFinishedExam() {
  systemState.isExamActive = false;
  stopExamDeadlineWatcher();
  releaseSecureExamMode();
  if (systemState.timer.intervalId) {
    clearInterval(systemState.timer.intervalId);
  }

  const studentLookupKey = systemState.currentStudent.studentKey || getStudentLookupKey(systemState.currentStudent);
  const submitContext = buildStudentMatchContext(systemState.currentStudent);
  const blockingOnSubmit = findBlockingExamResult(studentLookupKey, systemState.currentExam.id, submitContext);
  if (blockingOnSubmit) {
    localStorage.removeItem("arabya_active_student_session");
    alert(getExamBlockingMessage(blockingOnSubmit));
    navigateToView("student-login-view");
    return;
  }
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
    ...buildResultDeviceFields(systemState.examDeviceProfile),
    ...buildCheatTrackingFields(),
    allowRetake: false
  };

  resultObj.attemptNumber = getNextAttemptNumber(studentLookupKey, systemState.currentExam.id);
  const archivedAttempts = markPriorResultsSuperseded(studentLookupKey, systemState.currentExam.id, resultObj.recordId);
  systemState.results.push(resultObj);
  if (systemState.examDeviceProfile && studentLookupKey && systemState.currentExam?.id) {
    registerExamDeviceBinding(
      systemState.examDeviceProfile,
      studentLookupKey,
      systemState.currentStudent.name,
      systemState.currentExam.id
    );
  }
  saveSystemState(false);
  systemState.currentExamRuntime = null;
  showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore);
  if (archivedAttempts && archivedAttempts.length) {
    syncRetakeAffectedResultsToCloud(archivedAttempts);
  }
  void sendResultToGoogleSheets(scoreString, detailsFormatted, resultObj.recordId, resultObj);
  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("exam_submit");
  }
}

function showStudentResultView(scoreString, hasEssay, scaledScore, examTotalScore) {
  navigateToView("student-result-view");

  const syncEl = document.getElementById("runner-res-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري حفظ ومزامنة نتيجتك مع Google Sheets...`;
  }
  
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

function buildAddResultCloudPayload(scoreString, details, resultRecordId = "", resultObj = null) {
  const exam = systemState.currentExam;
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
    attemptNumber: resultObj?.attemptNumber ?? "",
    studentAnswers: resultObj?.studentAnswers || { ...systemState.studentAnswers },
    questionScores: resultObj?.questionScores || {},
    presentedQuestions: compactPresentedQuestionsForCloud(
      resultObj?.presentedQuestions || systemState.shuffledQuestions || []
    ),
    ...buildResultCloudRetakeFields(resultObj),
    ...buildResultDeviceFields(resultObj || systemState.examDeviceProfile),
    ...(resultObj ? buildResultCloudIpReleaseFields(resultObj) : {}),
    ...(resultObj ? buildCheatTrackingFieldsFromResult(resultObj) : buildCheatTrackingFields())
  };
  return buildSlimResultCloudPayload(payload);
}

async function postAddResultToCloudUrls(urlList, slimPayload) {
  const targets = [...new Set((urlList || []).map(normalizeArabyaWebAppUrl).filter(Boolean))];
  if (!targets.length) return { ok: false, successCount: 0, total: 0 };
  const outcomes = await Promise.all(targets.map(async url => {
    try {
      await postToArabyaWebApp(url, slimPayload);
      return true;
    } catch (err) {
      console.warn("[ARABYA] add_result failed, retry no-cors:", url, err);
      try {
        return await postToArabyaWebAppNoCors(url, slimPayload);
      } catch (e2) {
        return false;
      }
    }
  }));
  const successCount = outcomes.filter(Boolean).length;
  return { ok: successCount > 0, successCount, total: targets.length };
}

// المزامنة مع جوجل شيتس - ترسل نتيجة الطالب فور الانتهاء من الامتحان
async function sendResultToGoogleSheets(scoreString, details, resultRecordId = "", resultObj = null) {
  const exam = systemState.currentExam;
  const statusEl = document.getElementById("runner-res-sync-status");
  const syncUrl = getExamResultSyncUrl(exam);
  const urlList = syncUrl ? [syncUrl] : [];

  if (urlList.length === 0) {
    const traditionalUrl = getUnifiedTeacherSyncUrl(exam) || (systemState.config ? systemState.config.googleFormUrl || "" : "");
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

  if (statusEl) {
    statusEl.innerHTML = `<span class="material-icons" style="color:var(--secondary); vertical-align:middle; animation:spin 1s infinite linear;">sync</span> جاري مزامنة نتيجتك مع Google Sheets...`;
  }

  const slimPayload = buildAddResultCloudPayload(scoreString, details, resultRecordId, resultObj);

  try {
    const [postResult, backupOk] = await Promise.all([
      postAddResultToCloudUrls(urlList, slimPayload),
      pushCloudBackupNow("exam_submit")
    ]);
    if (!statusEl) return;
    if (postResult.ok || backupOk) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--success); vertical-align:middle;">check_circle</span> تم حفظ نتيجتك ومزامنتها مع Google Sheets بنجاح ✓`;
    } else if (postResult.successCount > 0) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">warning</span> مزامنة جزئية (${postResult.successCount}/${postResult.total}). تم الحفظ محلياً.`;
    } else {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--error); vertical-align:middle;">error</span> تعذّرت المزامنة السحابية. نتيجتك محفوظة على هذا الجهاز — سيتم إعادة المحاولة عند عودة الاتصال.`;
      if (window.ArabyaOfflineQueue) {
        urlList.forEach(url => window.ArabyaOfflineQueue.enqueue(normalizeArabyaWebAppUrl(url), slimPayload));
      }
    }
  } catch (syncErr) {
    console.error("[ARABYA] sendResultToGoogleSheets:", syncErr);
    if (statusEl) {
      statusEl.innerHTML = `<span class="material-icons" style="color:var(--warning); vertical-align:middle;">cloud_off</span> تم حفظ النتيجة محلياً. جاري إعادة محاولة المزامنة...`;
    }
    if (window.ArabyaOfflineQueue) {
      urlList.forEach(url => window.ArabyaOfflineQueue.enqueue(normalizeArabyaWebAppUrl(url), slimPayload));
    }
    if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
      scheduleCloudBackupPush.immediate("exam_submit_retry");
    }
  }
}

// مزامنة نتيجة معدّلة يدوياً (من قبل المعلم) مع Google Sheets
function sendUpdatedResultToCloud(res, syncStatusEl = null) {
  const linkedExam = res && res.examId
    ? systemState.exams.find(e => e.id === res.examId)
    : systemState.exams.find(e => e.title === res.examTitle);
  const syncUrl = getUnifiedTeacherSyncUrl(linkedExam || null);
  const urlList = syncUrl ? [syncUrl] : [];

  if (urlList.length === 0) {
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
    attemptNumber: res.attemptNumber ?? "",
    studentAnswers: res.studentAnswers || {},
    questionScores: res.questionScores || {},
    presentedQuestions: compactPresentedQuestionsForCloud(res.presentedQuestions || []),
    ...buildResultCloudRetakeFields(res),
    ...buildResultDeviceFieldsFromResult(res),
    ...buildResultCloudIpReleaseFields(res),
    ...buildCheatTrackingFieldsFromResult(res)
  };
  const slimPayload = buildSlimResultCloudPayload(payload);

  let done = 0;
  const total = urlList.length;
  urlList.forEach(url => {
    postToArabyaWebApp(url, slimPayload).then(() => {
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

function classifyResultSearchQuery(rawQuery) {
  const trimmed = (rawQuery || "").trim();
  if (!trimmed) return { mode: "none" };
  const codeNorm = normalizeStudentCodeForCompare(trimmed);
  const idNorm = normalizeStudentIdForCompare(trimmed);
  const nameNorm = normalizeStudentName(trimmed);
  const results = systemState.results || [];

  const codeHits = results.filter(res => {
    const rc = normalizeStudentCodeForCompare(res.accessCode || res.code || "");
    return rc && isPrivateStudentCode(rc) && rc === codeNorm;
  });
  if (codeHits.length) return { mode: "code", code: codeNorm };

  const idHits = results.filter(res => idNorm && normalizeStudentIdForCompare(res.id) === idNorm);
  if (idHits.length) return { mode: "id", id: idNorm };

  return { mode: "name", name: nameNorm };
}

function filterResultsForStudentSearch(queryInfo) {
  const results = systemState.results || [];
  if (queryInfo.mode === "code") {
    return results.filter(res =>
      normalizeStudentCodeForCompare(res.accessCode || res.code || "") === queryInfo.code
    );
  }
  if (queryInfo.mode === "id") {
    return results.filter(res => normalizeStudentIdForCompare(res.id) === queryInfo.id);
  }
  if (queryInfo.mode === "name") {
    return results.filter(res => normalizeStudentName(res.name) === queryInfo.name);
  }
  return [];
}

function hideStudentSearchDetailPanel() {
  const panel = document.getElementById("student-search-detail-panel");
  if (panel) panel.classList.add("hidden");
}

function renderStudentSearchDetailReadOnly(res) {
  const panel = document.getElementById("student-search-detail-panel");
  const titleEl = document.getElementById("student-search-detail-title");
  const metaEl = document.getElementById("student-search-detail-meta");
  const questionsEl = document.getElementById("student-search-detail-questions");
  if (!panel || !questionsEl) return;

  const exam = (systemState.exams || []).find(e => e.id === res.examId || e.title === res.examTitle);
  const presentedQuestions = getPresentedQuestionsForResult(res, exam);
  if (titleEl) titleEl.textContent = res.examTitle || "تفاصيل الامتحان";
  if (metaEl) {
    metaEl.innerHTML =
      `<div><strong>الطالب:</strong> ${escapeHtml(res.name || "")}</div>` +
      `<div><strong>المعرف:</strong> <code>${escapeHtml(res.id || "—")}</code></div>` +
      `<div><strong>النتيجة النهائية:</strong> <span style="color:var(--secondary); font-weight:800;">${escapeHtml(res.score || "")}</span></div>` +
      `<div><strong>التاريخ:</strong> ${escapeHtml(res.timestamp || "")}</div>`;
  }

  questionsEl.innerHTML = "";
  if (!presentedQuestions.length) {
    questionsEl.innerHTML =
      `<div style="padding:1rem; color:var(--text-muted); border:1px solid var(--border-color); border-radius:8px;">` +
      `${escapeHtml(res.details || "لا تتوفر تفاصيل الأسئلة لهذا السجل.")}` +
      `</div>`;
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  if (!res.studentAnswers) res.studentAnswers = {};
  presentedQuestions.forEach((q, index) => {
    const studentAns = getResultAnswerForQuestion(res, q.id);
    const earnedScore = getResultQuestionScore(res, q.id);
    const qPoints = q.points !== undefined ? q.points : 10;
    let typeName = "اختيار من متعدد";
    if (q.type === "boolean") typeName = "صواب وخطأ";
    if (q.type === "essay") typeName = "سؤال مقالي";

    const card = document.createElement("div");
    card.className = "exam-builder-card";
    card.style.cssText = "margin-bottom:1rem; padding:1rem; border:1px solid var(--border-color); border-radius:8px;";

    let bodyHtml = "";
    if (q.type === "essay") {
      bodyHtml =
        `<div style="margin:0.5rem 0;"><strong>إجابتك:</strong><div style="margin-top:0.35rem; padding:0.75rem; background:rgba(255,255,255,0.03); border-radius:6px;">${escapeHtml(studentAns || "—")}</div></div>`;
    } else {
      const options = Array.isArray(q.options) ? q.options : [];
      bodyHtml = options.map((opt, optIdx) => {
        const letter = String.fromCharCode(65 + optIdx);
        const chosen = studentAns === opt || studentAns === letter || studentAns === optIdx;
        const correct = q.correctAnswer === opt || q.correctAnswer === letter || q.correctAnswer === optIdx;
        let mark = "";
        if (chosen && correct) mark = ' <span style="color:var(--secondary);">✓ صحيح</span>';
        else if (chosen && !correct) mark = ' <span style="color:var(--error);">✗ خطأ</span>';
        else if (!chosen && correct) mark = ' <span style="color:var(--text-muted);">(الإجابة الصحيحة)</span>';
        return `<div style="margin:0.35rem 0; padding:0.35rem 0.5rem; ${chosen ? "background:rgba(56,189,248,0.08);" : ""} border-radius:4px;">${letter}) ${escapeHtml(String(opt))}${mark}</div>`;
      }).join("");
    }

    card.innerHTML =
      `<div style="font-weight:700; color:var(--secondary); margin-bottom:0.5rem;">سؤال ${index + 1} (${typeName}) · ${qPoints} درجة${earnedScore !== undefined ? ` — حصلت على ${earnedScore}` : ""}</div>` +
      `<div style="font-weight:600; margin-bottom:0.75rem; line-height:1.6;">${escapeHtml(q.question || "")}</div>` +
      bodyHtml;
    questionsEl.appendChild(card);
  });

  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

window.openStudentSearchResultDetail = function(recordId) {
  const res = (systemState.results || []).find(r => r.recordId === recordId);
  if (!res) {
    alert("لم يتم العثور على تفاصيل هذه النتيجة.");
    return;
  }
  renderStudentSearchDetailReadOnly(res);
};

// الاستعلام عن نتائج الطلاب بالاسم، المعرف، أو كود الاشتراك
function searchStudentResults() {
  reloadSystemStateFromLocalStorage();
  const rawQuery = document.getElementById("search-student-query").value.trim();
  hideStudentSearchDetailPanel();

  if (!rawQuery) {
    alert("يرجى إدخال الاسم أو معرف الهوية أو كود الاشتراك للبحث!");
    return;
  }

  const queryInfo = classifyResultSearchQuery(rawQuery);
  const matched = filterResultsForStudentSearch(queryInfo);
  const listContainer = document.getElementById("student-search-results-list");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  if (!matched.length) {
    listContainer.innerHTML =
      `<div style="text-align:center; padding:2rem; color:var(--text-muted);">لم يتم العثور على نتائج تطابق بيانات البحث.</div>`;
    return;
  }

  const summaryOnly = queryInfo.mode === "name" || queryInfo.mode === "id";
  const modeHint = summaryOnly
    ? `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">عرض الملخص النهائي فقط — للتفاصيل الكاملة استخدم كود الاشتراك.</div>`
    : `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">يمكنك فتح تفاصيل كل امتحان (أسئلة وإجابات) للقراءة فقط.</div>`;
  listContainer.insertAdjacentHTML("afterbegin", modeHint);

  matched.forEach(res => {
    const card = document.createElement("div");
    card.className = "result-query-card";
    const scoreHtml = `<span style="font-size:1.1rem; font-weight:800; color:var(--secondary);">${escapeHtml(res.score || "")}</span>`;
    const metaHtml =
      `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${escapeHtml(res.timestamp || "")}</div>`;
    let actionsHtml = "";
    if (!summaryOnly && res.recordId) {
      actionsHtml =
        `<button type="button" class="btn btn-outline btn-sm" data-result-id="${escapeHtml(res.recordId)}">عرض التفاصيل</button>`;
    }
    card.innerHTML =
      `<div><div class="result-query-title">${escapeHtml(res.examTitle || "")} (${escapeHtml(res.examType || "")})</div>${metaHtml}</div>` +
      `<div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">${scoreHtml}${actionsHtml}</div>`;
    const btn = card.querySelector("button[data-result-id]");
    if (btn) {
      btn.addEventListener("click", () => openStudentSearchResultDetail(btn.getAttribute("data-result-id")));
    }
    listContainer.appendChild(card);
  });
}

window.viewResultDetailQuery = function(recordId, studentId, examId) {
  if (recordId && systemState.results.some(r => r.recordId === recordId)) {
    openStudentSearchResultDetail(recordId);
    return;
  }
  if (examId === undefined) {
    examId = studentId;
    studentId = recordId;
    recordId = "";
  }
  const result = systemState.results.find(r => r.recordId === recordId) ||
    systemState.results.find(r => r.id === studentId && r.examId === examId);
  if (result && result.recordId) {
    openStudentSearchResultDetail(result.recordId);
  } else if (result) {
    alert(`النتيجة النهائية [${result.examTitle}]: ${result.score}`);
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
  getTeacherScopedExams().forEach(exam => {
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


function ensureResultsQuickFiltersMarkup() {
  const container = document.getElementById("teacher-results-quick-filters");
  if (!container) return;
  if (container.querySelector("#teacher-results-exam-filter")) return;
  container.classList.remove("hidden");
  container.classList.add("teacher-filter-toolbar");
  container.removeAttribute("aria-hidden");
  container.removeAttribute("style");
  delete container.dataset.bound;
  container.innerHTML = `
    <div>
      <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.4rem;">فلتر الحالة</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
        <button type="button" class="btn btn-primary btn-sm" data-results-status-filter="all">الكل</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="completed">مكتمل</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="incomplete">جاري</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="canceled">ملغى</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="retake_allowed">مسموح بإعادة الامتحان</button>
        <button type="button" class="btn btn-outline btn-sm" data-results-status-filter="superseded">محاولات سابقة</button>
      </div>
    </div>
    <div class="form-group" style="margin:0; min-width:190px; flex:1;">
      <label class="form-label" for="teacher-results-exam-filter" style="font-size:0.8rem;">الامتحان</label>
      <select id="teacher-results-exam-filter" class="form-control" style="padding:0.45rem 0.75rem;"><option value="">كل الامتحانات</option></select>
    </div>
    <div class="form-group" style="margin:0; min-width:150px;">
      <label class="form-label" for="teacher-results-date-filter" style="font-size:0.8rem;">التاريخ</label>
      <select id="teacher-results-date-filter" class="form-control" style="padding:0.45rem 0.75rem;">
        <option value="all">كل الأوقات</option>
        <option value="today">اليوم</option>
        <option value="week">آخر 7 أيام</option>
        <option value="month">آخر 30 يوماً</option>
        <option value="custom">نطاق مخصص</option>
      </select>
    </div>
    <div class="form-group" style="margin:0; min-width:140px;">
      <label class="form-label" for="teacher-results-date-from" style="font-size:0.8rem;">من تاريخ</label>
      <input type="date" id="teacher-results-date-from" class="form-control" style="padding:0.4rem 0.65rem;">
    </div>
    <div class="form-group" style="margin:0; min-width:140px;">
      <label class="form-label" for="teacher-results-date-to" style="font-size:0.8rem;">إلى تاريخ</label>
      <input type="date" id="teacher-results-date-to" class="form-control" style="padding:0.4rem 0.65rem;">
    </div>
    <div class="form-group" style="margin:0; min-width:165px;">
      <label class="form-label" for="teacher-results-sort-order" style="font-size:0.8rem;">طريقة العرض</label>
      <select id="teacher-results-sort-order" class="form-control" style="padding:0.45rem 0.75rem;" aria-label="طريقة عرض الجدول">
        <option value="newest">الأحدث أولاً</option>
        <option value="oldest">الأقدم أولاً</option>
        <option value="name_asc">الاسم (أ → ي)</option>
        <option value="name_desc">الاسم (ي → أ)</option>
      </select>
    </div>
    <button type="button" id="teacher-results-clear-filters" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح الفلاتر</button>
  `;
  const legacySort = document.querySelector("#teacher-results-toolbar .teacher-pagination-controls > #teacher-results-sort-order");
  if (legacySort) legacySort.remove();
}

function ensureStudentsQuickFiltersMarkup() {
  const container = document.getElementById("teacher-students-quick-filters");
  if (!container) return;
  if (container.querySelector("#teacher-students-sort-order")) return;
  container.classList.remove("hidden");
  container.classList.add("teacher-filter-toolbar");
  container.removeAttribute("aria-hidden");
  container.removeAttribute("style");
  delete container.dataset.bound;
  container.innerHTML = `
    <div>
      <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.4rem;">فلتر سريع</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
        <button type="button" class="btn btn-primary btn-sm" data-students-quick-filter="all">الكل</button>
        <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="has_results">لديهم نتائج</button>
        <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="no_results">بدون نتائج</button>
        <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="multi_exams">أكثر من امتحان</button>
        <button type="button" class="btn btn-outline btn-sm" data-students-quick-filter="canceled">امتحان ملغى</button>
      </div>
    </div>
    <div class="form-group" style="margin:0; min-width:165px;">
      <label class="form-label" for="teacher-students-sort-order" style="font-size:0.8rem;">طريقة العرض</label>
      <select id="teacher-students-sort-order" class="form-control" style="padding:0.45rem 0.75rem;" aria-label="طريقة عرض الجدول">
        <option value="newest">الأحدث أولاً</option>
        <option value="oldest">الأقدم أولاً</option>
        <option value="name_asc">الاسم (أ → ي)</option>
        <option value="name_desc">الاسم (ي → أ)</option>
      </select>
    </div>
    <button type="button" id="teacher-students-clear-filters" class="btn btn-outline btn-sm" style="border-color:var(--warning); color:var(--warning);">مسح الفلاتر</button>
  `;
  const legacySort = document.querySelector("#teacher-students-toolbar .teacher-pagination-controls > #teacher-students-sort-order");
  if (legacySort) legacySort.remove();
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
  ensureResultsQuickFiltersMarkup();
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
  ensureStudentsQuickFiltersMarkup();
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

function normalizeIpSearchToken(value) {
  return String(value || "").trim().toLowerCase();
}

function ipMatchesSearchQuery(ipValue, query) {
  const token = normalizeIpSearchToken(query);
  const ip = normalizeIpSearchToken(ipValue);
  if (!token || !ip) return false;
  return ip.includes(token);
}

function getStudentDisplayIp(student) {
  const ips = collectStudentIpAddresses(student);
  if (!ips.length) return "—";
  const preferred = String(student?.lastKnownIp || student?.clientIp || "").trim();
  if (preferred) return preferred;
  return ips[0];
}

function collectStudentIpAddresses(student) {
  const ips = new Set();
  const addIp = (value) => {
    const ip = String(value || "").trim();
    if (ip) ips.add(ip.toLowerCase());
  };
  if (!student) return [];
  addIp(student.lastKnownIp);
  addIp(student.clientIp);
  const ctx = buildStudentMatchContext(student);
  (systemState.results || []).forEach(res => {
    if (resultMatchesStudentIdentity(res, ctx)) addIp(res.clientIp);
  });
  return [...ips];
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
  const ipToken = normalizeIpSearchToken(query);
  const fields = [
    res.name,
    res.id,
    res.accessCode,
    res.examTitle,
    res.score,
    res.level,
    res.examType,
    res.status,
    res.timestamp,
    res.clientIp,
    res.deviceId,
    res.deviceFingerprint
  ];
  if (fields.some(field => normalizeResultsSearchText(field).includes(normalizedQuery))) {
    return true;
  }
  if (ipToken && ipMatchesSearchQuery(res.clientIp, ipToken)) return true;
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
  const infoEls = ["teacher-results-page-info", "teacher-results-page-info-bottom"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const pageNumEls = ["teacher-results-page-number", "teacher-results-page-number-bottom"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const prevBtns = document.querySelectorAll("[data-results-prev-page]");
  const nextBtns = document.querySelectorAll("[data-results-next-page]");
  const sizeSelects = document.querySelectorAll("[data-results-page-size]");
  const isFiltered = filtersActive || totalAll !== totalItems;

  sizeSelects.forEach(sizeSelect => {
    if (String(sizeSelect.value) !== String(pageSize)) {
      sizeSelect.value = String(pageSize);
    }
  });

  if (totalItems === 0) {
    infoEls.forEach(info => {
      info.textContent = isFiltered
        ? `وُجد 0 من ${totalAll} سجلاً`
        : "";
    });
    pageNumEls.forEach(pageNum => { pageNum.textContent = ""; });
    prevBtns.forEach(prevBtn => { prevBtn.disabled = true; });
    nextBtns.forEach(nextBtn => { nextBtn.disabled = true; });
    return;
  }

  const countPrefix = isFiltered ? `وُجد ${totalItems} من ${totalAll} سجل — ` : "";

  if (!pageSize || pageSize <= 0) {
    infoEls.forEach(info => {
      info.textContent = isFiltered
        ? `${countPrefix}عرض الكل`
        : `إجمالي ${totalItems} سجلاً — عرض الكل`;
    });
    pageNumEls.forEach(pageNum => { pageNum.textContent = ""; });
    prevBtns.forEach(prevBtn => { prevBtn.disabled = true; });
    nextBtns.forEach(nextBtn => { nextBtn.disabled = true; });
    return;
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  infoEls.forEach(info => { info.textContent = `${countPrefix}عرض ${start}–${end} من ${totalItems} سجلاً`; });
  pageNumEls.forEach(pageNum => { pageNum.textContent = `${page} / ${totalPages}`; });
  prevBtns.forEach(prevBtn => { prevBtn.disabled = page <= 1; });
  nextBtns.forEach(nextBtn => { nextBtn.disabled = page >= totalPages; });
}

function setupResultsTablePaginationControls() {
  document.querySelectorAll("[data-results-page-size]").forEach(sizeSelect => {
    if (sizeSelect.dataset.bound) return;
    sizeSelect.dataset.bound = "1";
    sizeSelect.value = String(getResultsTableViewSettings().pageSize);
    sizeSelect.addEventListener("change", () => {
      setResultsTablePageSize(parseInt(sizeSelect.value, 10));
      renderStudentResultsTable();
    });
  });
  document.querySelectorAll("[data-results-prev-page]").forEach(prevBtn => {
    if (prevBtn.dataset.bound) return;
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => {
      const view = getResultsTableViewSettings();
      if (view.page > 1) {
        view.page -= 1;
        renderStudentResultsTable();
      }
    });
  });
  document.querySelectorAll("[data-results-next-page]").forEach(nextBtn => {
    if (nextBtn.dataset.bound) return;
    nextBtn.dataset.bound = "1";
    nextBtn.addEventListener("click", () => {
      const view = getResultsTableViewSettings();
      view.page += 1;
      renderStudentResultsTable();
    });
  });
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">لا توجد سجلات محلية.${hasCloud ? " اضغط «مزامنة من السحابة» أعلاه لجلب نتائج الطلاب من Google Sheets." : " اربط Google Sheets من تبويب الربط أولاً."}</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">${emptyMsg} من ${totalAll} سجل.</td></tr>`;
    updateResultsPaginationUI(0, 1, view.pageSize, totalAll, filtersActive);
    return;
  }

  let pageItems = filtered;
  if (view.pageSize > 0) {
    const start = (view.page - 1) * view.pageSize;
    pageItems = filtered.slice(start, start + view.pageSize);
  }

  const sharedIpMap = buildExamSharedIpStudentMap();

  pageItems.forEach(res => {
    const row = document.createElement("tr");
    const displayStatus = getResultDisplayStatus(res);
    if (displayStatus === "canceled") row.style.borderRight = "3px solid var(--error)";
    else if (displayStatus === "incomplete") row.style.borderRight = "3px solid var(--warning)";
    const statusBadge = formatResultStatusBadge(res);
    const sharedIpBadge = formatResultSharedIpBadgeHtml(res, sharedIpMap);
    row.innerHTML = `
      <td>${statusBadge}${escapeHtml(res.name || "")}${sharedIpBadge}</td>
      <td><code>${escapeHtml(res.id || "--")}</code></td>
      <td><span style="color:var(--accent); font-weight:700;">${escapeHtml(res.accessCode || "لا يوجد")}</span></td>
      <td>${escapeHtml(res.examTitle || "")} (${escapeHtml(res.level || "عام")})</td>
      <td style="font-weight:700; color:var(--secondary);">${escapeHtml(formatResultGradeCell(res))}</td>
      <td><code style="font-size:0.78rem;">${escapeHtml(formatResultDeviceSummary(res))}</code></td>
      <td>${escapeHtml(res.timestamp || "")}</td>
      <td class="teacher-results-actions teacher-table-actions"></td>
    `;

    const actionsCell = row.querySelector(".teacher-results-actions");
    appendResultRetakeActions(res, actionsCell);

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-outline btn-sm";
    viewBtn.textContent = "عرض / تعديل";
    viewBtn.addEventListener("click", () => viewTeacherResultDetail(res.recordId || "", res.id || "", res.examId || ""));
    actionsCell.appendChild(viewBtn);

    if (canDeleteResults() && res.recordId) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-outline btn-sm";
      deleteBtn.style.borderColor = "var(--error)";
      deleteBtn.style.color = "var(--error)";
      deleteBtn.textContent = "حذف";
      deleteBtn.setAttribute("aria-label", `حذف نتيجة ${res.name || ""}`);
      deleteBtn.addEventListener("click", () => deleteTeacherResultByRecordId(res.recordId));
      actionsCell.appendChild(deleteBtn);
    }

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
  renderTeacherResultDeviceIpPanel(res);
  document.getElementById("detail-total-score-input").value = res.score;
  renderResultRetakeManagementPanel(res);
  renderStudentAttemptsPanel(res);
  renderTeacherCheatAttemptsPanel(res);

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
    const studentAns = getResultAnswerForQuestion(res, q.id);
    
    // تهيئة الدرجة إذا كانت فارغة للموضوعي
    if (q.type !== "essay" && getResultQuestionScore(res, q.id) === undefined) {
      res.questionScores[q.id] = (studentAns === q.correctAnswer) ? (q.points || 10) : 0;
    }

    const qPoints = q.points !== undefined ? q.points : 10;
    const currentScore = getResultQuestionScore(res, q.id) !== undefined ? getResultQuestionScore(res, q.id) : 0;

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
  csvContent += "اسم الطالب,رقم ID,كود الاشتراك,الجامعة,الكلية,الفرقة,الامتحان,النوع,الحالة,إعادة التقديم,محاولات غش,حد الغش,تفاصيل محاولات الغش,معرف الجهاز,بصمة الجهاز,IP,النتيجة,التاريخ والوقت\n";

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
      formatCheatAttemptsTeacherSummary(res),
      res.maxCheatAttemptsAllowed ?? "",
      formatCheatAttemptsExportText(res),
      res.deviceId || "",
      res.deviceFingerprint || "",
      res.clientIp || "",
      res.score || "",
      res.timestamp || ""
    ]);
  });

  downloadBlobFile(
    new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    `نتائج_arabya_${getExportDateStamp()}.csv`
  );
}

function findTeacherResultByRecordId(recordId) {
  const rid = String(recordId || "").trim();
  if (!rid) return null;
  return systemState.results.find(r => String(r.recordId || "") === rid) || null;
}

async function postDeleteResultToCloud(res) {
  if (!res) return { ok: false, successCount: 0, total: 0 };
  const linkedExam = res.examId
    ? systemState.exams.find(e => e.id === res.examId)
    : systemState.exams.find(e => e.title === res.examTitle);
  const syncUrl = getUnifiedTeacherSyncUrl(linkedExam || null);
  const urlList = syncUrl ? [syncUrl] : [];
  if (!urlList.length) return { ok: false, successCount: 0, total: 0 };
  const actor = window.ArabyaPlatformSync && window.ArabyaPlatformSync.getCloudSyncActor
    ? window.ArabyaPlatformSync.getCloudSyncActor()
    : { username: systemState.activeTeacher?.username || "", name: systemState.activeTeacher?.name || "" };
  const payload = {
    action: "delete_result",
    recordId: res.recordId || "",
    id: res.id || "",
    examId: res.examId || "",
    examTitle: res.examTitle || "",
    timestamp: res.timestamp || "",
    studentLookupKey: res.studentLookupKey || "",
    actor
  };
  const outcomes = await Promise.all(urlList.map(async url => {
    try {
      await postToArabyaWebApp(url, payload);
      return true;
    } catch (err) {
      console.warn("[ARABYA] delete_result failed:", url, err);
      try {
        return await postToArabyaWebAppNoCors(url, payload);
      } catch (e2) {
        return false;
      }
    }
  }));
  const successCount = outcomes.filter(Boolean).length;
  return { ok: successCount > 0, successCount, total: urlList.length };
}

window.deleteTeacherResultByRecordId = async function(recordId) {
  if (!canDeleteResults()) {
    alert("حذف سجلات النتائج متاح للمعلم ومدير المنصة (سوبر أدمن) فقط.");
    return;
  }
  const res = findTeacherResultByRecordId(recordId);
  if (!res) {
    alert("لم يتم العثور على سجل النتيجة.");
    return;
  }
  const label = `${res.name || "طالب"} — ${res.examTitle || "امتحان"} (${res.timestamp || ""})`;
  if (!confirm(`هل تريد حذف نتيجة:\n${label}\n\nسيُحذف السجل من الجهاز ومن ورقة Google Sheets فوراً.`)) {
    return;
  }

  const syncEl = document.getElementById("teacher-results-sync-status");
  if (syncEl) {
    syncEl.innerHTML = `<span class="material-icons" style="vertical-align:middle; animation:spin 1s infinite linear; color:var(--secondary);">sync</span> جاري حذف السجل ومزامنته مع Google Sheets...`;
  }

  addDeletedResultKey(res);
  systemState.results = filterOutDeletedResults(
    systemState.results.filter(r => String(r.recordId || "") !== String(recordId))
  );
  persistDeletedResultKeys();
  localStorage.setItem("arabya_results_db", JSON.stringify(systemState.results));

  if (systemState.currentGradingResult && systemState.currentGradingResult.recordId === recordId) {
    systemState.currentGradingResult = null;
    systemState.currentGradingExam = null;
    const panel = document.getElementById("teacher-result-detail-panel");
    if (panel) panel.classList.add("hidden");
  }

  let cloudOk = false;
  try {
    const [deleteOutcome, backupOk] = await Promise.all([
      postDeleteResultToCloud(res),
      pushCloudBackupNow("delete_result")
    ]);
    cloudOk = deleteOutcome.ok || backupOk;
  } catch (syncErr) {
    console.error("[ARABYA] deleteTeacherResultByRecordId:", syncErr);
  }

  if (typeof scheduleCloudBackupPush === "function" && scheduleCloudBackupPush.immediate) {
    scheduleCloudBackupPush.immediate("delete_result");
  }

  if (cloudOk && typeof syncDatabaseFromCloud === "function") {
    try {
      await syncDatabaseFromCloud({ silent: true });
    } catch (pullErr) {
      console.warn("[ARABYA] post-delete pull:", pullErr);
    }
  }

  renderStudentResultsTable();
  renderTeacherStudentsTable();
  if (typeof renderTeacherStatsDashboard === "function") {
    try { renderTeacherStatsDashboard(); } catch (e) {}
  }

  if (syncEl) {
    syncEl.innerHTML = cloudOk
      ? `<span class="material-icons" style="vertical-align:middle; color:var(--success);">cloud_done</span> تم حذف السجل من Google Sheets والنسخة الاحتياطية`
      : `<span class="material-icons" style="vertical-align:middle; color:var(--warning);">cloud_off</span> تم الحذف محلياً — تحقق من رابط /exec ونشر Apps Script`;
  }
  if (window.ArabyaToast) {
    window.ArabyaToast.showToast(
      cloudOk ? "تم حذف النتيجة ومزامنتها مع السحابة" : "تم الحذف محلياً — راجع إعدادات المزامنة",
      cloudOk ? "success" : "warning"
    );
  }
};

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
