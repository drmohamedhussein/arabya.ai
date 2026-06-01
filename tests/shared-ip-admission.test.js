/**
 * Shared IP admission policy (mirrors app.js rules)
 */
const assert = require("assert");

function normalizeDeviceIp(value) {
  return String(value || "").trim().toLowerCase();
}

function countDistinctStudentsOnExamIp(results, bindings, examId, clientIp, excludeLookupKey) {
  const ip = normalizeDeviceIp(clientIp);
  if (!ip || !examId) return 0;
  const keys = new Set();
  (results || []).forEach(r => {
    if (!r || r.examId !== examId) return;
    if (normalizeDeviceIp(r.clientIp) !== ip) return;
    const key = r.studentLookupKey || r.id;
    if (!key || key === excludeLookupKey) return;
    keys.add(key);
  });
  (bindings || []).forEach(b => {
    if (!b || b.examId !== examId) return;
    if (normalizeDeviceIp(b.clientIp) !== ip) return;
    if (b.studentLookupKey && b.studentLookupKey !== excludeLookupKey) keys.add(b.studentLookupKey);
  });
  return keys.size;
}

function checkAdmission(max, others) {
  return others < max;
}

const results = [
  { examId: "e1", clientIp: "1.2.3.4", studentLookupKey: "a" },
  { examId: "e1", clientIp: "1.2.3.4", studentLookupKey: "b" }
];

assert.strictEqual(countDistinctStudentsOnExamIp(results, [], "e1", "1.2.3.4", "c"), 2);
assert.strictEqual(checkAdmission(5, 2), true);
assert.strictEqual(checkAdmission(2, 2), false);

console.log("Shared IP admission tests passed.");
