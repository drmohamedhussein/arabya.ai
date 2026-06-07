/**
 * Teacher results table live search must filter rows and bind via toolbar delegation.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.ok(
  !appSource.includes("if (!getResultsSearchQuery() && !query) return list"),
  "results search must not short-circuit on DOM-only empty checks"
);
assert.ok(
  appSource.includes("toolbar.dataset.searchBound"),
  "results search must bind through teacher-results-toolbar delegation"
);
assert.ok(
  appSource.includes("ensureStudentsQuickFiltersMarkup();\n  setupResultsTableSearchControl();"),
  "results search must initialize on DOMContentLoaded"
);

function normalizeResultsSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeIpSearchToken(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStudentId(studentId) {
  return (studentId || "").toString().trim();
}

function sanitizeStudentCodeInput(code) {
  const raw = (code || "").toString().trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const clean = compact.replace(/[-_]/g, "");
  if (/^0{5,}$/.test(clean)) {
    return "00000";
  }
  return compact;
}

function resultMatchesSearchQuery(res, query) {
  const normalizedQuery = normalizeResultsSearchText(query);
  if (!normalizedQuery) return true;
  const fields = [
    res.name,
    res.id,
    res.accessCode,
    res.examTitle,
    res.score,
    res.level,
    res.examType,
    res.status,
    res.timestamp,
    res.clientIp
  ];
  if (fields.some(field => normalizeResultsSearchText(field).includes(normalizedQuery))) {
    return true;
  }
  const queryId = normalizeStudentId(query);
  if (queryId && normalizeStudentId(res.id).includes(queryId)) return true;
  const queryCode = sanitizeStudentCodeInput(query);
  if (queryCode && sanitizeStudentCodeInput(res.accessCode || "") === queryCode) return true;
  return false;
}

function filterResultsForSearch(results, query, domQuery) {
  const list = Array.isArray(results) ? results : [];
  const passedQuery = query != null ? String(query).trim() : "";
  const activeQuery = passedQuery || String(domQuery || "").trim();
  if (!activeQuery) return list;
  return list.filter(res => resultMatchesSearchQuery(res, activeQuery));
}

const sampleResults = [
  { name: "أحمد علي", id: "STU100", accessCode: "12345", examTitle: "البلاغة", score: "18/20" },
  { name: "مريم حسن", id: "STU200", accessCode: "67890", examTitle: "النحو", score: "15/20" }
];

let filtered = filterResultsForSearch(sampleResults, "", "أحمد");
assert.strictEqual(filtered.length, 1, "empty passed query should fall back to live input value");
assert.strictEqual(filtered[0].name, "أحمد علي");

filtered = filterResultsForSearch(sampleResults, "STU200", "");
assert.strictEqual(filtered.length, 1, "explicit query parameter must filter results");
assert.strictEqual(filtered[0].id, "STU200");

filtered = filterResultsForSearch(sampleResults, "", "");
assert.strictEqual(filtered.length, 2, "empty search should return all rows");

console.log("Results table search tests passed.");
