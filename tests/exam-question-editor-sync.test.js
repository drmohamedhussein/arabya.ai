/**
 * Question editor DOM sync must ignore summary cards and preserve bank size.
 */
const assert = require("assert");

function legacySaveQuestions(exam, domCards) {
  const updatedQuestions = [];
  domCards.forEach((card, index) => {
    const textInput = card.querySelector(".edit-q-text");
    const questionText = textInput ? textInput.value.trim() : "";
    const typeInput = exam.questions[index]?.type;
    if (!typeInput) return;
    updatedQuestions.push({ id: updatedQuestions.length + 1, type: typeInput, question: questionText });
  });
  return updatedQuestions;
}

function fixedSaveQuestions(exam, domCards) {
  const updatedQuestions = [];
  domCards.forEach((card, index) => {
    const textInput = card.querySelector(".edit-q-text");
    if (!textInput) return;
    const typeInput = card.dataset.questionType || exam.questions[index]?.type || "multiple";
    updatedQuestions.push({
      id: updatedQuestions.length + 1,
      type: typeInput,
      question: textInput.value.trim()
    });
  });
  updatedQuestions.forEach((q, idx) => { q.id = idx + 1; });
  return updatedQuestions;
}

function makeCard(type, question, index, isSummary = false) {
  return {
    className: isSummary ? "question-bank-editor-summary exam-builder-card" : "exam-builder-card exam-question-edit-card",
    dataset: isSummary ? {} : { questionType: type, questionIndex: String(index) },
    querySelector(sel) {
      if (isSummary) return null;
      if (sel === ".edit-q-text") return { value: question };
      return null;
    }
  };
}

const exam = {
  questions: [
    { id: 1, type: "multiple", question: "Q1" },
    { id: 2, type: "multiple", question: "Q2" },
    { id: 3, type: "boolean", question: "Q3" }
  ]
};

const domWithSummary = [
  makeCard("", "", 0, true),
  makeCard("multiple", "Q1", 0),
  makeCard("multiple", "Q2", 1),
  makeCard("boolean", "Q3", 2)
];

const legacyAllCards = domWithSummary.filter(c => c.className.includes("exam-builder-card"));
const fixedCards = domWithSummary.filter(c => c.className.includes("exam-question-edit-card"));

const legacySaved = legacySaveQuestions(exam, legacyAllCards);
const fixedSaved = fixedSaveQuestions(exam, fixedCards);

assert.strictEqual(legacySaved.length, 3, "legacy save keeps count but shifts types and adds ghost row");
assert.strictEqual(legacySaved[0].question, "", "legacy save treats summary card as first question");
assert.strictEqual(legacySaved[0].type, "multiple");
assert.strictEqual(legacySaved[1].question, "Q1");
assert.strictEqual(legacySaved[2].question, "Q2", "legacy save drops the last real question (Q3)");

assert.strictEqual(fixedSaved.length, 3);
assert.deepStrictEqual(fixedSaved.map(q => q.question), ["Q1", "Q2", "Q3"]);
assert.deepStrictEqual(fixedSaved.map(q => q.type), ["multiple", "multiple", "boolean"]);

const afterAdd = [...fixedSaved, { id: 4, type: "essay", question: "Q4" }];
assert.strictEqual(afterAdd.length, 4, "adding a question after fixed sync keeps existing ones");

console.log("Exam question editor sync tests passed.");
