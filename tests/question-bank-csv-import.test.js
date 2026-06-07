/**
 * اختبارات استيراد/تصدير بنك الأسئلة بصيغة CSV
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "js", "arabya-question-bank.js"), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const QB = sandbox.window.ArabyaQuestionBank;
if (!QB || typeof QB.parseBankCsv !== "function") {
  console.error("FAIL: ArabyaQuestionBank.parseBankCsv not exported");
  process.exit(1);
}

const exportedCsv = [
  '"type","question","options","correctAnswer","points","timeSeconds"',
  '"multiple","ما هو الفاعل؟","الخيار أ | الخيار ب | الخيار ج","1","10","60"',
  '"boolean","الجملة صحيحة؟","صواب | خطأ","0","5","30"',
  '"essay","اشرح دور الفاعل","","","15","120"'
].join("\n");

const questions = QB.parseBankCsv("\uFEFF" + exportedCsv);
if (questions.length !== 3) {
  console.error("FAIL: expected 3 questions, got", questions.length);
  process.exit(1);
}
if (questions[0].type !== "multiple" || questions[0].correctAnswer !== 1) {
  console.error("FAIL: multiple question parse", questions[0]);
  process.exit(1);
}
if (questions[1].type !== "boolean" || questions[1].options.join("|") !== "صواب|خطأ") {
  console.error("FAIL: boolean question parse", questions[1]);
  process.exit(1);
}
if (questions[2].type !== "essay" || questions[2].options.length !== 0) {
  console.error("FAIL: essay question parse", questions[2]);
  process.exit(1);
}

const mcqAlias = QB.parseBankCsv('"mcq","سؤال","أ | ب","0","10","60"\n');
if (mcqAlias[0].type !== "multiple") {
  console.error("FAIL: mcq alias should map to multiple");
  process.exit(1);
}

const quoted = QB.parseCsvText('"نص فيه ""اقتباس""","قيمة ثانية"\n');
if (quoted[0][0] !== 'نص فيه "اقتباس"') {
  console.error("FAIL: CSV quote escaping", quoted);
  process.exit(1);
}

console.log("question-bank-csv-import.test.js: all assertions passed");
