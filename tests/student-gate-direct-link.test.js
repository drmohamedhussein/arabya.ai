/**
 * اختبارات بوابة الطالب — الرابط المباشر والعزل بين الامتحانات
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function loadModule(relativePath, sandbox) {
  vm.runInContext(fs.readFileSync(path.join(root, relativePath), "utf8"), sandbox);
}

const sandbox = {
  window: {},
  document: {
    getElementById() { return null; }
  },
  console,
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); }
  },
  performance: { now() { return 0; } },
  AbortController: class {
    constructor() { this.signal = {}; }
    abort() {}
  },
  fetch() { return Promise.reject(new Error("fetch disabled in test")); },
  URLSearchParams,
  location: { search: "?exam=exam_a&teacher=t1&s=https://script.google.com/macros/s/TEST/exec", pathname: "/", hash: "" },
  history: { replaceState() {} }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

loadModule("js/arabya-template-exams-data.js", sandbox);
loadModule("js/arabya-template-exams.js", sandbox);

const appChunks = fs.readFileSync(path.join(root, "app.js"), "utf8");
const gateHelpersEnd = appChunks.indexOf("async function fetchCloudBackupJson_");
const gateHelpersStart = appChunks.indexOf("function normalizeGateExamId_");
assert.ok(gateHelpersStart > 0 && gateHelpersEnd > gateHelpersStart, "gate helper block should exist");
vm.runInContext(appChunks.slice(gateHelpersStart, gateHelpersEnd), sandbox);

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert.ok(appSource.includes("const STUDENT_GATE_SYNC_TIMEOUT_MS = 12000"));
assert.ok(appSource.includes("function requestStudentGateExamSync"));
assert.ok(appSource.includes("function tryActivateLocalLockedExamGate"));
assert.ok(appSource.includes("function gateExamIdsMatch_"));
assert.ok(appSource.includes("retryStudentGateExamSync"));
assert.ok(appSource.includes("student-gate-sync-retry"));

sandbox.systemState = {
  exams: [
    { id: "exam_a", title: "امتحان أ", subject: "نحو", teacher: "t1", questions: [{ id: 1, type: "multiple", options: ["أ", "ب"], correctAnswer: 0 }] },
    { id: "exam_b", title: "امتحان ب", subject: "صرف", teacher: "t1", questions: [{ id: 1, type: "multiple", options: ["أ", "ب"], correctAnswer: 1 }] }
  ],
  _teacherExamsVault: null,
  lockedExamId: "exam_a",
  targetTeacherUsername: "t1",
  studentGateExamReady: false,
  config: { googleFormUrl: "https://script.google.com/macros/s/TEST/exec" }
};

sandbox.sanitizeQuestionConfig = function () {};
sandbox.stripAnswerKeysFromExam = function (exam) {
  const copy = JSON.parse(JSON.stringify(exam));
  (copy.questions || []).forEach(q => { delete q.correctAnswer; });
  return copy;
};
sandbox.persistStudentGateExamsToLocalStorage = function () {};
sandbox.persistExamAnswerKeyVaultToStorage = function () {};
sandbox.captureExamAnswerKeyVault = function () {};
sandbox.isTeacherSessionActive = function () { return false; };
sandbox.getFullExamById = function (examId) {
  return sandbox.systemState.exams.find(e => sandbox.gateExamIdsMatch_(e.id, examId)) || null;
};

assert.strictEqual(sandbox.tryActivateLocalLockedExamGate("exam_a"), true);
assert.strictEqual(sandbox.systemState.studentGateExamReady, true);
assert.strictEqual(sandbox.systemState.studentGateSyncedExamId, "exam_a");

const vaultIds = (sandbox.systemState._teacherExamsVault || []).map(e => e.id);
assert.ok(vaultIds.includes("exam_a"));
assert.ok(!vaultIds.includes("exam_b") || vaultIds.length === 1);

sandbox.systemState.studentGateExamReady = false;
assert.strictEqual(sandbox.tryActivateLocalLockedExamGate("nahw_comprehensive_year1"), true);
assert.strictEqual(sandbox.systemState.studentGateSyncedExamId, "nahw_comprehensive_year1");
const nahw = sandbox.systemState.exams.find(e => e.id === "nahw_comprehensive_year1");
assert.ok(nahw);
assert.strictEqual(nahw.questions.length, 251);

console.log("student-gate-direct-link.test.js: all assertions passed");
