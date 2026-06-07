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

const {
  getConfiguredQuestionCount,
  mergeGateExamSnapshot_,
  resolveGateExamQuestionCount_,
  applyGateExamTeacherSettings_
} = sandbox;

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

const staleStudentVault = mergeGateExamSnapshot_(
  { id: "nahw_comprehensive_year1", questionCount: "", questions: Array(251).fill({ id: 1 }) },
  { id: "nahw_comprehensive_year1", questionCount: 20, questions: Array(251).fill({ id: 1 }) }
);
assert.strictEqual(
  staleStudentVault.questionCount,
  20,
  "teacher arabya_exams_db must override stale student vault questionCount"
);

// محاكاة دمج السحابة عندما يكون النسخ المحلي أحدث لكن questionCount فارغاً في القالب
const newerLocalWipe = { ...merged };
Object.assign(newerLocalWipe, {
  questionCount: "",
  questionsUpdatedAt: "2099-01-01T00:00:00.000Z"
});
applyGateExamTeacherSettings_(newerLocalWipe,
  { id: "nahw_comprehensive_year1", questionCount: "", questionsUpdatedAt: "2099-01-01T00:00:00.000Z" },
  { id: "nahw_comprehensive_year1", questionCount: 5, questionsUpdatedAt: "2020-01-01T00:00:00.000Z" }
);
assert.strictEqual(newerLocalWipe.questionCount, 5, "must not wipe teacher questionCount after local revision merge");

assert.ok(appSource.includes("const runtimeQuestions = buildRuntimeQuestionsForExam(selectedExam)"));
assert.ok(appSource.includes("getFullExamById(examId) || systemState.exams.find(e => gateExamIdsMatch_(e.id, examId))"));
assert.ok(appSource.includes("applyGateExamTeacherSettings_(combined, local, remote)"));
assert.ok(appSource.includes("shouldForceTeacherSettingsCloudSync_"));
assert.ok(appSource.includes("studentGateCloudSynced"));
assert.ok(appSource.includes("refreshStudentExamVaultFromTeacherExams_"));
assert.ok(appSource.includes("reconcileStudentGateVaultAfterTemplateInjection_"));
assert.ok(appSource.includes("ARABYA_GATE_EXAM_SETTINGS_KEY"));
assert.ok(appSource.includes("applyPersistedGateExamSettings_"));
assert.ok(appSource.includes("persistGateExamSettingsFromExam_"));
assert.ok(
  appSource.includes("mergeRemoteExamsForStudentGate_(studentVaultExams, teacherExams)"),
  "student load must merge teacher arabya_exams_db over stale student vault"
);
assert.ok(
  appSource.includes("gateExamIdsMatch_(e?.id, target)"),
  "getFullExamById must resolve exams case-insensitively"
);

// buildRuntimeQuestionsForExam يقتصر على questionCount
const buildStart = appSource.indexOf("function buildRuntimeQuestionsForExam");
const buildEnd = appSource.indexOf("function gradeStudentExamAnswers");
const buildBlock = appSource.slice(buildStart, buildEnd);
const gateSettingsStart = appSource.indexOf("function readGateExamSettingsCache_");
const gateSettingsEnd = appSource.indexOf("function applyGateExamTeacherSettings_");
const gateIdStart = appSource.indexOf("function normalizeGateExamId_");
const gateIdEnd = appSource.indexOf("function tryActivateLocalLockedExamGate");
const gateSettingsBlock = appSource.slice(gateSettingsStart, gateSettingsEnd);
const gateIdBlock = appSource.slice(gateIdStart, gateIdEnd);

const buildSandbox = {
  console,
  parseInt,
  Math,
  Array,
  Number,
  localStorage: { getItem: () => null, setItem: () => {} },
  isTeacherSessionActive: () => false,
  shuffle: arr => arr,
  stripAnswerKeysFromQuestion: q => q,
  ARABYA_GATE_EXAM_SETTINGS_KEY: "arabya_gate_exam_settings_db"
};
vm.createContext(buildSandbox);
vm.runInContext(block + gateIdBlock + gateSettingsBlock + buildBlock, buildSandbox);
const runtime = buildSandbox.buildRuntimeQuestionsForExam({
  id: "arabic_comprehensive_year1",
  questionCount: 5,
  shuffleQuestions: false,
  questions: Array.from({ length: 182 }, (_, i) => ({ id: i + 1, type: "multiple", correctAnswer: 0 }))
});
assert.strictEqual(runtime.length, 5, "student runtime must honor questionCount limit");

console.log("exam-question-count.test.js: all assertions passed");
