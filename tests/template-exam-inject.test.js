/**
 * اختبارات حقن امتحان القالب دون المساس بالامتحانات الحالية
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
assert.strictEqual(templates.length, 1, "expected one template exam");
const template = templates[0];
assert.strictEqual(template.id, "nahw_comprehensive_year1");
assert.strictEqual(template.title, "امتحان النحو الشامل للفرقة الأولى");
assert.strictEqual(template.questions.length, 196);

const mcq = template.questions.filter(q => q.type === "multiple");
const tf = template.questions.filter(q => q.type === "boolean");
assert.strictEqual(mcq.length, 101);
assert.strictEqual(tf.length, 95);

mcq.forEach(q => {
  assert.ok(q.question, "mcq question text required");
  assert.ok(q.options.length >= 2, "mcq needs options");
  assert.ok(q.correctAnswer >= 0 && q.correctAnswer < q.options.length, "mcq correct index");
});
tf.forEach(q => {
  assert.ok(q.question, "tf question text required");
  assert.ok(q.correctAnswer === 0 || q.correctAnswer === 1, "tf correctAnswer");
});

sandbox.window.systemState = {
  activeTeacher: { username: "superadmin" },
  exams: [
    { id: "existing_exam_1", title: "امتحان قديم", questions: [] }
  ]
};
sandbox.window.sanitizeQuestionConfig = function () {};

const first = sandbox.window.injectArabyaTemplateExamsIfMissing();
assert.strictEqual(first.added, 1);
assert.strictEqual(sandbox.window.systemState.exams.length, 2);
assert.strictEqual(sandbox.window.systemState.exams[0].id, "existing_exam_1");
assert.strictEqual(sandbox.window.systemState.exams[1].id, "nahw_comprehensive_year1");
assert.strictEqual(sandbox.window.systemState.exams[1].questions.length, 196);

const second = sandbox.window.injectArabyaTemplateExamsIfMissing();
assert.strictEqual(second.added, 0);
assert.strictEqual(second.skipped, 1);
assert.strictEqual(sandbox.window.systemState.exams.length, 2, "must not duplicate template");

console.log("template-exam-inject.test.js: all assertions passed");
