/**
 * Legacy sheet result IDs must not depend on row numbers.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const gasSource = fs.readFileSync(
  path.join(__dirname, "..", "integrations", "google-apps-script-backend.gs"),
  "utf8"
);

const context = { console };
vm.createContext(context);
vm.runInContext(gasSource, context);

const legacyRow = [];
legacyRow[1] = "2026-06-08T10:00:00.000Z";
legacyRow[2] = "Student One";
legacyRow[3] = "S-001";
legacyRow[4] = "ABC123";
legacyRow[5] = "code:ABC123";
legacyRow[8] = "Final Exam";
legacyRow[9] = "exam-final";
legacyRow[16] = "18/20";

const sameRowAfterSheetShift = legacyRow.slice();
assert.strictEqual(
  context.buildArabyaLegacySheetResultRecordId_(legacyRow),
  context.buildArabyaLegacySheetResultRecordId_(sameRowAfterSheetShift),
  "generated legacy IDs must remain stable when a row shifts"
);

const sameRowAfterManualGradeEdit = legacyRow.slice();
sameRowAfterManualGradeEdit[16] = "19/20";
assert.strictEqual(
  context.buildArabyaLegacySheetResultRecordId_(legacyRow),
  context.buildArabyaLegacySheetResultRecordId_(sameRowAfterManualGradeEdit),
  "generated legacy IDs must remain stable when a sheet grade is edited"
);

const shiftedRowResult = {
  recordId: context.buildArabyaLegacySheetResultRecordId_(sameRowAfterSheetShift),
  id: "S-001",
  examId: "exam-final",
  timestamp: "2026-06-08T10:00:00.000Z"
};
assert.strictEqual(
  context.isArabyaResultDeleted_(shiftedRowResult, ["sheet_row_2"]),
  false,
  "old row-number tombstones must not hide a different shifted sheet row"
);

console.log("sheet-result-record-id.test.js: all assertions passed");
