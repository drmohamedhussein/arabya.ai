/**
 * Students list should use earliest sheet result timestamp as registration date.
 */
const assert = require("assert");

function parseResultTimestamp(value) {
  if (!value) return null;
  const dt = new Date(String(value).trim());
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function pickEarlierStudentTimestamp(currentTs, candidateTs) {
  const current = String(currentTs || "").trim();
  const candidate = String(candidateTs || "").trim();
  if (!current) return candidate;
  if (!candidate) return current;
  const currentDt = parseResultTimestamp(current);
  const candidateDt = parseResultTimestamp(candidate);
  if (currentDt && candidateDt) {
    return candidateDt.getTime() < currentDt.getTime() ? candidate : current;
  }
  return current;
}

const results = [
  { name: "Ali", id: "A1", accessCode: "X1", studentLookupKey: "id:A1", timestamp: "2026-05-10 10:00" },
  { name: "Ali", id: "A1", accessCode: "X1", studentLookupKey: "id:A1", timestamp: "2026-05-01 09:00" }
];

let earliest = "";
results.forEach(res => {
  earliest = pickEarlierStudentTimestamp(earliest, res.timestamp);
});

assert.strictEqual(earliest, "2026-05-01 09:00");

console.log("Students from sheet timestamp tests passed.");
