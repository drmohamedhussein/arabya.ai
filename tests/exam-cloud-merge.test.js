/**
 * Exam question merges must not drop newer local edits when cloud lacks timestamps.
 */
const assert = require("assert");

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

console.log("Exam cloud merge tests passed.");
