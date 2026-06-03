/**
 * Cloud backup safety regressions (extracted logic).
 */
const assert = require("assert");

function compactPresentedQuestionsForCloud(questions) {
  return (Array.isArray(questions) ? questions : []).map(q => ({
    id: q.id,
    type: q.type,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    points: q.points
  }));
}

function slimCloudBackupDataForSize(data) {
  const slim = {
    ...data,
    questionBanks: {},
    auditLog: []
  };
  if (Array.isArray(slim.results)) {
    slim.results = slim.results.map(res => {
      const copy = { ...res };
      if (Array.isArray(copy.presentedQuestions) && copy.presentedQuestions.length) {
        copy.presentedQuestions = compactPresentedQuestionsForCloud(copy.presentedQuestions);
      }
      return copy;
    });
  }
  return slim;
}

function isNoCorsCloudWriteVerified(revisionBefore, revisionAfter) {
  return Boolean(revisionAfter && revisionAfter !== revisionBefore);
}

const longDetails = "essay answer ".repeat(300);
const backup = slimCloudBackupDataForSize({
  questionBanks: { teacher: [{ id: 1 }] },
  auditLog: [{ at: "2026-06-03T00:00:00.000Z" }],
  results: [{
    recordId: "result-1",
    details: longDetails,
    presentedQuestions: [{
      id: 7,
      type: "essay",
      question: "Explain",
      options: [],
      correctAnswer: "",
      points: 10,
      teacherOnly: "not synced"
    }]
  }]
});

assert.deepStrictEqual(backup.questionBanks, {});
assert.deepStrictEqual(backup.auditLog, []);
assert.strictEqual(backup.results[0].details, longDetails, "result details must not be truncated in canonical backups");
assert.strictEqual(backup.results[0].presentedQuestions[0].teacherOnly, undefined);

assert.strictEqual(isNoCorsCloudWriteVerified("rev-1", "rev-2"), true);
assert.strictEqual(isNoCorsCloudWriteVerified("rev-1", "rev-1"), false);
assert.strictEqual(isNoCorsCloudWriteVerified("rev-1", ""), false);

console.log("Cloud backup safety tests passed.");
