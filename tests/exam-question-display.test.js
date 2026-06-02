/**
 * Exam bank vs displayed question count behavior
 */
const assert = require("assert");

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getConfiguredQuestionCount(exam) {
  if (!exam) return null;
  const parsed = parseInt(exam.questionCount, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const bankSize = Array.isArray(exam.questions) ? exam.questions.length : 0;
  if (!bankSize) return null;
  return Math.min(parsed, bankSize);
}

function buildRuntimeQuestionsForExam(exam) {
  const sourceQuestions = Array.isArray(exam?.questions) ? [...exam.questions] : [];
  if (!sourceQuestions.length) return [];
  const shouldShuffle = exam.shuffleQuestions !== false;
  const questionCount = getConfiguredQuestionCount(exam);
  const runtime = shouldShuffle ? shuffle(sourceQuestions) : sourceQuestions;
  if (questionCount) return runtime.slice(0, questionCount);
  return runtime;
}

const bank = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, question: `Q${i + 1}` }));
const exam = { questions: bank, questionCount: "20", shuffleQuestions: true };

const runA = buildRuntimeQuestionsForExam(exam);
const runB = buildRuntimeQuestionsForExam(exam);

assert.strictEqual(runA.length, 20);
assert.strictEqual(runB.length, 20);
assert.notDeepStrictEqual(runA.map(q => q.id).sort(), runB.map(q => q.id).sort(), "random runs should usually differ");

const allExam = { questions: bank, questionCount: "", shuffleQuestions: false };
assert.strictEqual(buildRuntimeQuestionsForExam(allExam).length, 100);

const orderedExam = { questions: bank.slice(0, 30), questionCount: "10", shuffleQuestions: false };
const ordered = buildRuntimeQuestionsForExam(orderedExam);
assert.deepStrictEqual(ordered.map(q => q.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

console.log("Exam question display tests passed.");
