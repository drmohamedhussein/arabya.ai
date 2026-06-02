/**
 * Result answer hydration from details text (legacy/cloud-synced results).
 */
const assert = require("assert");

function normalizeQuestionMatchText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchExamQuestionsByTexts(exam, texts) {
  if (!exam || !Array.isArray(exam.questions) || !Array.isArray(texts)) return [];
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

function resolveStudentOptionIndexFromText(question, answerText) {
  const text = String(answerText || "").trim();
  if (!text || /لم\s*تتم\s*الإجابة/i.test(text)) return -1;
  if (/انته(?:ى|ي)\s*الوقت/i.test(text)) return -1;
  if (/ملغي|غش/i.test(text)) return -2;
  const options = Array.isArray(question?.options) ? question.options : [];
  const exactIdx = options.findIndex(opt => String(opt).trim() === text);
  if (exactIdx >= 0) return exactIdx;
  const letterMatch = text.match(/^([A-Da-d])$/);
  if (letterMatch) {
    const letterIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (letterIdx >= 0 && letterIdx < options.length) return letterIdx;
  }
  return undefined;
}

function parseManualQuestionScoreFromBracket(bracketText, fallbackPoints, isCorrect) {
  const manual = String(bracketText || "").match(/درجة\s*السؤال\s*المعدلة\s*:\s*([\d.]+)/i);
  if (manual) return parseFloat(manual[1]) || 0;
  if (/✓|صح/i.test(bracketText || "")) return fallbackPoints;
  if (/✗|خط/i.test(bracketText || "")) return 0;
  if (isCorrect) return fallbackPoints;
  return 0;
}

function parseResultDetailsIntoAnswerMaps(res, exam) {
  if (!res?.details || typeof res.details !== "string") {
    return { studentAnswers: {}, questionScores: {}, presentedQuestions: [] };
  }
  const studentAnswers = {};
  const questionScores = {};
  const presentedQuestions = [];
  const details = res.details;

  const essayRegex = /س\s*مقالي\s*\(وزنها\s*([\d.]+)\s*نق(?:طة|اط)?\)\s*:\s*([\s\S]+?)\n\s*إجابة\s*الطالب:\s*([\s\S]*?)(?:\n\s*\[(.+?)\])?(?=\n-{3,}|\nس\s*\(|\n*$)/gi;
  let essayMatch;
  while ((essayMatch = essayRegex.exec(details)) !== null) {
    const qPoints = parseFloat(essayMatch[1]) || 10;
    const questionText = essayMatch[2].trim();
    let answerText = essayMatch[3].trim();
    const bracket = essayMatch[4] || "";
    const matched = exam ? matchExamQuestionsByTexts(exam, [questionText]) : [];
    const question = matched[0] || {
      id: presentedQuestions.length + 1,
      type: "essay",
      question: questionText,
      options: [],
      correctAnswer: "",
      points: qPoints
    };
    studentAnswers[question.id] = answerText;
    questionScores[question.id] = parseManualQuestionScoreFromBracket(bracket, qPoints, false);
    presentedQuestions.push(question);
  }

  details.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || /^س\s*مقالي/i.test(trimmed)) return;
    const objectiveMatch = trimmed.match(/^س\s*\(وزنها\s*([\d.]+)\s*نق(?:طة|اط)?\)\s*:\s*(.+?)\s*\|\s*إجابة\s*الطالب:\s*(.+?)\s*\|\s*الصحيحة:\s*(.+?)(?:\s*\[(.+?)\])?\s*$/i);
    if (!objectiveMatch) return;
    const qPoints = parseFloat(objectiveMatch[1]) || 10;
    const questionText = objectiveMatch[2].trim();
    const studentAnsText = objectiveMatch[3].trim();
    const correctText = objectiveMatch[4].trim();
    const bracket = objectiveMatch[5] || "";
    const matched = exam ? matchExamQuestionsByTexts(exam, [questionText]) : [];
    const question = matched[0] || {
      id: presentedQuestions.length + 1000,
      type: "multiple",
      question: questionText,
      options: [correctText, studentAnsText].filter((v, i, arr) => v && arr.indexOf(v) === i),
      correctAnswer: 0,
      points: qPoints
    };
    const studentIdx = resolveStudentOptionIndexFromText(question, studentAnsText);
    const correctIdx = resolveStudentOptionIndexFromText(question, correctText);
    if (correctIdx !== undefined && correctIdx >= 0) question.correctAnswer = correctIdx;
    studentAnswers[question.id] = studentIdx !== undefined ? studentIdx : studentAnsText;
    const isCorrect = studentIdx !== undefined && studentIdx === question.correctAnswer;
    questionScores[question.id] = parseManualQuestionScoreFromBracket(bracket, qPoints, isCorrect);
    if (!presentedQuestions.some(q => q.id === question.id)) presentedQuestions.push(question);
  });

  return { studentAnswers, questionScores, presentedQuestions };
}

const exam = {
  id: "EX1",
  questions: [
    { id: 1, type: "multiple", question: "س1", options: ["أ", "ب", "ج"], correctAnswer: 0, points: 15 },
    { id: 2, type: "essay", question: "س2 مقالي", options: [], correctAnswer: "", points: 5 }
  ]
};

const res = {
  details:
    "س (وزنها 15 نقاط): س1 | إجابة الطالب: ب | الصحيحة: أ [درجة السؤال المعدلة: 0 من 15]\n" +
    "س مقالي (وزنها 5 نقاط): س2 مقالي \n إجابة الطالب: إجابة مقالية\n [درجة السؤال المعدلة: 5 من 5]\n-----------------"
};

const parsed = parseResultDetailsIntoAnswerMaps(res, exam);
assert.strictEqual(parsed.studentAnswers[1], 1);
assert.strictEqual(parsed.questionScores[1], 0);
assert.strictEqual(parsed.studentAnswers[2], "إجابة مقالية");
assert.strictEqual(parsed.questionScores[2], 5);
assert.strictEqual(parsed.presentedQuestions.length, 2);

const submitRes = {
  details: "س (وزنها 10 نقاط): ما هو الجمع؟ | إجابة الطالب: كتابان | الصحيحة: كتابان [✓]"
};
const submitExam = {
  questions: [{ id: 5, type: "multiple", question: "ما هو الجمع؟", options: ["كتاب", "كتابان", "كتب"], correctAnswer: 1, points: 10 }]
};
const submitParsed = parseResultDetailsIntoAnswerMaps(submitRes, submitExam);
assert.strictEqual(submitParsed.studentAnswers[5], 1);
assert.strictEqual(submitParsed.questionScores[5], 10);

console.log("Result answer hydration tests passed.");
