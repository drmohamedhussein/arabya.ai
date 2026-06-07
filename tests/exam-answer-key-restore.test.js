/**
 * استعادة مفاتيح الإجابة بعد دمج السحابة
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(appSource.includes('const ARABYA_TEACHER_EXAM_KEYS_STORE = "arabya_teacher_exam_grading_keys"'));
assert.ok(appSource.includes("function mergeExamQuestionsPreservingAnswerKeys_"));
assert.ok(appSource.includes("function hydrateTeacherExamAnswerKeysFromStores"));
assert.ok(appSource.includes("mergeRemoteExamsPreservingAnswerKeys_(systemState.exams, remoteData.exams"));

// وحدة دمج الأسئلة — نفس منطق GAS
const mergeFn = new Function(`
  ${appSource.match(/function mergeExamQuestionsPreservingAnswerKeys_\([\s\S]*?\n\}/)[0]}
  return mergeExamQuestionsPreservingAnswerKeys_;
`)();

let merged = mergeFn(
  [{ id: 1, question: "س1", options: ["أ", "ب"], correctAnswer: 1, type: "multiple" }],
  [{ id: 1, question: "س1", options: ["أ", "ب"], type: "multiple" }]
);
assert.strictEqual(merged[0].correctAnswer, 1, "must preserve local correctAnswer when cloud omits it");

merged = mergeFn(
  [{ id: 1, question: "س1", options: ["أ", "ب"], correctAnswer: 1, type: "multiple" }],
  [{ id: 1, question: "س1", options: ["أ", "ب"], correctAnswer: 0, type: "multiple" }]
);
assert.strictEqual(merged[0].correctAnswer, 1, "local correctAnswer must win over stale cloud value");

assert.ok(appSource.includes("fillOnlyMissing"));
assert.ok(appSource.includes("isExamLocalRevisionNewer_"));

console.log("exam-answer-key-restore.test.js: all assertions passed");
