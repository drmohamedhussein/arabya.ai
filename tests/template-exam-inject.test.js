/**
 * اختبارات حقن امتحانات القوالب دون المساس بالامتحانات الحالية
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function loadModule(relativePath, sandbox) {
  const code = fs.readFileSync(path.join(root, relativePath), "utf8");
  vm.runInContext(code, sandbox);
}

const sandbox = {
  window: {},
  global: {},
  console,
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); }
  }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

loadModule("js/arabya-template-exams-data.js", sandbox);
loadModule("js/arabya-template-exams.js", sandbox);

const templates = sandbox.window.ArabyaTemplateExams.getTemplateExams();
assert.strictEqual(templates.length, 3, "expected three template exams");

const nahw = templates.find(t => t.id === "nahw_comprehensive_year1");
const nahwFinal = templates.find(t => t.id === "nahw_final_year1");
const arabic = templates.find(t => t.id === "arabic_comprehensive_year1");
assert.ok(nahw, "nahw comprehensive template required");
assert.ok(nahwFinal, "nahw final template required");
assert.ok(arabic, "arabic template required");

assert.strictEqual(nahw.title, "امتحان النحو والصرف الشامل للفرقة الأولى");
assert.strictEqual(nahw.templateRevision, 2);
assert.strictEqual(nahw.questions.length, 251);

assert.strictEqual(nahwFinal.title, "امتحان النحو والصرف النهائي للفرقة الأولى");
assert.strictEqual(nahwFinal.templateRevision, 1);
assert.strictEqual(nahwFinal.questions.length, 251);
assert.strictEqual(nahwFinal.totalScore, 251);

const nahwMcq = nahw.questions.filter(q => q.type === "multiple");
const nahwTf = nahw.questions.filter(q => q.type === "boolean");
assert.strictEqual(nahwMcq.length, 126);
assert.strictEqual(nahwTf.length, 125);

const finalMcq = nahwFinal.questions.filter(q => q.type === "multiple");
const finalTf = nahwFinal.questions.filter(q => q.type === "boolean");
assert.strictEqual(finalMcq.length, 126);
assert.strictEqual(finalTf.length, 125);

const arabicMcq = arabic.questions.filter(q => q.type === "multiple");
const arabicTf = arabic.questions.filter(q => q.type === "boolean");
assert.strictEqual(arabicMcq.length, 82);
assert.strictEqual(arabicTf.length, 100);

function assertQuestionShape(questions) {
  questions.forEach(q => {
    assert.ok(q.question, "question text required");
    if (q.type === "multiple") {
      assert.ok(q.options.length >= 2, "mcq needs options");
      assert.ok(q.correctAnswer >= 0 && q.correctAnswer < q.options.length, "mcq correct index");
    } else {
      assert.ok(q.correctAnswer === 0 || q.correctAnswer === 1, "tf correctAnswer");
    }
  });
}
assertQuestionShape(nahw.questions);
assertQuestionShape(nahwFinal.questions);
assertQuestionShape(arabic.questions);

// النهائي نسخة مطابقة للشامل في النص والإجابات
nahw.questions.forEach((q, i) => {
  const clone = nahwFinal.questions[i];
  assert.strictEqual(clone.question, q.question);
  assert.strictEqual(clone.correctAnswer, q.correctAnswer);
  assert.strictEqual(clone.type, q.type);
});

const arabicKeys = new Set();
arabic.questions.forEach(q => {
  const key = q.question.replace(/\s+/g, " ").trim().toLowerCase();
  assert.ok(!arabicKeys.has(key), "duplicate question in arabic exam: " + q.question.slice(0, 40));
  arabicKeys.add(key);
});

sandbox.window.systemState = {
  activeTeacher: { username: "superadmin" },
  exams: [
    { id: "existing_exam_1", title: "امتحان قديم", questions: [] }
  ]
};
sandbox.window.sanitizeQuestionConfig = function () {};

const first = sandbox.window.injectArabyaTemplateExamsIfMissing();
assert.strictEqual(first.added, 3);
assert.strictEqual(sandbox.window.systemState.exams.length, 4);
assert.strictEqual(sandbox.window.systemState.exams[0].id, "existing_exam_1");
assert.strictEqual(sandbox.window.systemState.exams[1].id, "nahw_comprehensive_year1");
assert.strictEqual(sandbox.window.systemState.exams[2].id, "arabic_comprehensive_year1");
assert.strictEqual(sandbox.window.systemState.exams[3].id, "nahw_final_year1");
assert.strictEqual(sandbox.window.systemState.exams[1].questions.length, 251);
assert.strictEqual(sandbox.window.systemState.exams[2].questions.length, 182);
assert.strictEqual(sandbox.window.systemState.exams[3].questions.length, 251);

const second = sandbox.window.injectArabyaTemplateExamsIfMissing();
assert.strictEqual(second.added, 0);
assert.strictEqual(second.skipped, 3);
assert.strictEqual(sandbox.window.systemState.exams.length, 4, "must not duplicate templates");

const legacyQuestions = nahw.questions.slice(0, 196).map((q, i) => ({ ...q, id: i + 1 }));
sandbox.window.systemState = {
  activeTeacher: { username: "superadmin" },
  exams: [
    { id: "existing_exam_1", title: "امتحان قديم", questions: [] },
    {
      id: "nahw_comprehensive_year1",
      title: "امتحان النحو الشامل للفرقة الأولى",
      teacher: "teacher1",
      endsAt: "2099-12-31",
      maxCheatAttempts: 3,
      templateRevision: 1,
      questions: legacyQuestions
    },
    {
      id: "arabic_comprehensive_year1",
      title: "امتحان اللغة العربية الشامل",
      teacher: "teacher2",
      endsAt: "2099-06-01",
      maxCheatAttempts: 2,
      templateRevision: 1,
      questions: arabic.questions
    },
    {
      id: "nahw_final_year1",
      title: "امتحان النحو النهائي",
      teacher: "teacher3",
      endsAt: "2099-03-01",
      maxCheatAttempts: 4,
      templateRevision: 1,
      questions: nahwFinal.questions
    }
  ]
};
sandbox.localStorage._data = {};

const upgrade = sandbox.window.injectArabyaTemplateExamsIfMissing();
assert.strictEqual(upgrade.upgraded, 1);
assert.strictEqual(upgrade.added, 0);
assert.strictEqual(upgrade.skipped, 2);
assert.strictEqual(sandbox.window.systemState.exams.length, 4);
assert.strictEqual(sandbox.window.systemState.exams[1].questions.length, 251);
assert.strictEqual(sandbox.window.systemState.exams[3].questions.length, 251);
assert.strictEqual(sandbox.window.systemState.exams[3].teacher, "teacher3");

assert.ok(
  fs.readFileSync(path.join(root, "app.js"), "utf8").includes("runTemplateExamInjection"),
  "app.js should re-run template injection after cloud/reload"
);

console.log("template-exam-inject.test.js: all assertions passed");
