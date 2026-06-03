/**
 * إعدادات الامتحان: تهيئة الأسئلة، حدود الغش، إلغاء الامتحان.
 */
(function (global) {
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

  const api = {
    sanitizeQuestionConfig,
    getExamMaxCheatAttempts,
    shouldCancelExamForCheating
  };

  global.ArabyaExamConfig = api;
  global.sanitizeQuestionConfig = sanitizeQuestionConfig;
  global.getExamMaxCheatAttempts = getExamMaxCheatAttempts;
  global.shouldCancelExamForCheating = shouldCancelExamForCheating;
})(window);
