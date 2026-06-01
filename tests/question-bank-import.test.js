const assert = require("assert");

function parseQuestionBankFilePayload(parsed, fileName) {
  if (!parsed || typeof parsed !== "object") return { questions: null, name: "" };
  const questions =
    parsed.questions ||
    parsed.bank?.questions ||
    (Array.isArray(parsed) ? parsed : null);
  const name =
    parsed.name ||
    parsed.bank?.name ||
    String(fileName || "").replace(/\.json$/i, "") ||
    "بنك أسئلة مستورد";
  return { questions, name };
}

const bankExport = {
  type: "arabya_question_bank",
  bank: {
    name: "اختبار النحو والصرف (2)",
    questions: Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      type: "multiple",
      question: `سؤال مخصص ${i + 1}`,
      options: ["أ", "ب"],
      correctAnswer: 0,
      points: 5
    }))
  }
};

const parsed = parseQuestionBankFilePayload(bankExport, "بنك_أسئلة.json");
assert.strictEqual(parsed.questions.length, 120);
assert.ok(parsed.name.includes("النحو"));

console.log("Question bank import parse OK:", parsed.questions.length, "questions");
