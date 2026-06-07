/**
 * Exam question merges must not drop newer local edits when cloud lacks timestamps.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function examContentTs(item) {
  const edited = Date.parse(item?.questionsUpdatedAt || "") || Number(item?.localRevision) || 0;
  if (edited) return edited;
  const t = item?.updatedAt || item?.syncedAt || item?.timestamp || "";
  return Date.parse(t) || 0;
}

function shouldKeepLocalExamQuestions(local, remote) {
  const localTs = examContentTs(local);
  const remoteTs = examContentTs(remote);
  if (localTs > remoteTs) return true;
  const localCount = Array.isArray(local?.questions) ? local.questions.length : 0;
  const remoteCount = Array.isArray(remote?.questions) ? remote.questions.length : 0;
  if (localCount !== remoteCount && localTs >= remoteTs) return localCount > remoteCount;
  return false;
}

const local = {
  id: "exam1",
  title: "نحو",
  questions: [{ id: 1 }, { id: 2 }, { id: 3 }],
  questionsUpdatedAt: "2026-06-02T12:00:00.000Z"
};
const remote = {
  id: "exam1",
  title: "نحو",
  questions: [{ id: 1 }]
};

assert.ok(shouldKeepLocalExamQuestions(local, remote));

const staleLocal = { id: "exam1", questions: [{ id: 1 }] };
const freshRemote = {
  id: "exam1",
  questions: [{ id: 1 }, { id: 2 }],
  questionsUpdatedAt: "2026-06-03T12:00:00.000Z"
};
assert.ok(!shouldKeepLocalExamQuestions(staleLocal, freshRemote));

const mergeBlock = appSource.slice(
  appSource.indexOf("function getConfiguredQuestionCount"),
  appSource.indexOf("function mergeRemoteExamsForStudentGate_")
);
assert.ok(mergeBlock.includes("function mergeRemoteExamsPreservingAnswerKeys_"));

const sandbox = {
  console,
  systemState: { _examAnswerKeyVault: {} },
  localStorage: { getItem: () => "{}" },
  loadExamAnswerKeyVaultFromStorage: () => {},
  ARABYA_TEACHER_EXAM_KEYS_STORE: "arabya_teacher_exam_grading_keys",
  ARABYA_EXAM_ANSWER_VAULT_KEY: "arabya_exam_answer_vault_db"
};
vm.createContext(sandbox);
vm.runInContext(mergeBlock, sandbox);

const mergedExams = sandbox.mergeRemoteExamsPreservingAnswerKeys_(
  [{
    id: "exam1",
    title: "نحو",
    questions: [
      { id: 1, question: "local q1", correctAnswer: 0 },
      { id: 2, question: "local q2", correctAnswer: 1 }
    ],
    questionsUpdatedAt: "2026-06-02T12:00:00.000Z"
  }],
  [{
    id: "exam1",
    title: "نحو",
    questions: [{ id: 1, question: "remote q1" }],
    updatedAt: "2026-06-01T12:00:00.000Z"
  }],
  item => String(item.id || item.title || ""),
  "امتحان"
);
assert.deepStrictEqual(
  mergedExams[0].questions.map(q => q.id),
  [1, 2],
  "stale cloud exam must not truncate locally-added questions"
);
assert.strictEqual(mergedExams[0].questions[0].correctAnswer, 0);
assert.strictEqual(mergedExams[0].questionsUpdatedAt, "2026-06-02T12:00:00.000Z");

console.log("Exam cloud merge tests passed.");
