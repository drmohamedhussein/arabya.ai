/**
 * اختبارات عدد الأسئلة المعروضة للطالب (questionCount)
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

const start = appSource.indexOf("function getConfiguredQuestionCount");
const end = appSource.indexOf("function stripAnswerKeysFromQuestion");
assert.ok(start > 0 && end > start);
const block = appSource.slice(start, end);

const sandbox = {
  console,
  parseInt,
  Math,
  Array,
  Number,
  JSON
};
vm.createContext(sandbox);
vm.runInContext(block, sandbox);

const { getConfiguredQuestionCount, mergeGateExamSnapshot_, resolveGateExamQuestionCount_ } = sandbox;

const bankExam = {
  id: "exam_a",
  questionCount: 5,
  questions: Array.from({ length: 251 }, (_, i) => ({ id: i + 1, points: 1 }))
};

assert.strictEqual(getConfiguredQuestionCount(bankExam), 5);

const merged = mergeGateExamSnapshot_(
  { id: "nahw_comprehensive_year1", questionCount: 5, questions: Array(251).fill({ id: 1 }) },
  { id: "nahw_comprehensive_year1", questionCount: "", questions: Array(251).fill({ id: 1 }) }
);
assert.strictEqual(merged.questionCount, 5);

const mergedRemote = mergeGateExamSnapshot_(
  { id: "x", questionCount: "", questions: [] },
  { id: "x", questionCount: 7, questions: Array(10).fill({ id: 1 }) }
);
assert.strictEqual(mergedRemote.questionCount, 7);

assert.ok(appSource.includes("const runtimeQuestions = buildRuntimeQuestionsForExam(selectedExam)"));
assert.ok(appSource.includes("getFullExamById(examId)"));

console.log("exam-question-count.test.js: all assertions passed");
