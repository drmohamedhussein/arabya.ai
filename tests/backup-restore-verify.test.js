/**
 * Verify bundled backup contains النحو والصرف (2) with questions
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const backupPath = path.join(__dirname, "..", "database", "arabya-db.json");
const db = JSON.parse(fs.readFileSync(backupPath, "utf8"));

const grammar = (db.exams || []).find(
  e => /النحو والصرف \(2\)/.test(String(e.title || "")) || String(e.id) === "arabic_grammar"
);
assert.ok(grammar, "grammar exam must exist in bundled backup");
assert.strictEqual(grammar.id, "arabic_grammar");
assert.ok(Array.isArray(grammar.questions) && grammar.questions.length >= 10, "expected at least 10 questions");

function mergeRemoteExamsPreferRicherQuestions_(localExams, remoteExams) {
  const map = new Map();
  (localExams || []).forEach(exam => {
    if (exam && exam.id) map.set(String(exam.id), exam);
  });
  (remoteExams || []).forEach(incoming => {
    if (!incoming || !incoming.id) return;
    const key = String(incoming.id);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, incoming);
      return;
    }
    const localQ = (existing.questions || []).length;
    const remoteQ = (incoming.questions || []).length;
    if (remoteQ >= localQ) {
      map.set(key, { ...existing, ...incoming, questions: incoming.questions || existing.questions });
    }
  });
  return [...map.values()];
}

const emptyLocal = [{ id: "arabic_grammar", title: "اختبار النحو والصرف (2)", questions: [] }];
const merged = mergeRemoteExamsPreferRicherQuestions_(emptyLocal, db.exams);
const restored = merged.find(e => e.id === "arabic_grammar");
assert.strictEqual(restored.questions.length, grammar.questions.length);

console.log("Backup restore verify OK:", grammar.title, "→", restored.questions.length, "questions");
