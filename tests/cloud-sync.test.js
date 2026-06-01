const assert = require("assert");
const fs = require("fs");
const path = require("path");

function parseRecordRevisionTime(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const asDate = Date.parse(String(value));
  return Number.isFinite(asDate) ? asDate : null;
}

function getRecordRevisionTime(record, fields) {
  if (!record || typeof record !== "object") return null;
  for (const field of fields) {
    const parsed = parseRecordRevisionTime(record[field]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function shouldUseIncomingResultRecord(localRecord, incomingRecord) {
  if (!localRecord) return true;
  const revisionFields = ["updatedAt", "lastEditedAt", "modifiedAt"];
  const localRevision = getRecordRevisionTime(localRecord, revisionFields);
  const incomingRevision = getRecordRevisionTime(incomingRecord, revisionFields);

  if (localRevision !== null || incomingRevision !== null) {
    const localTime = localRevision ?? getRecordRevisionTime(localRecord, ["savedAt"]) ?? 0;
    const incomingTime = incomingRevision ?? getRecordRevisionTime(incomingRecord, ["savedAt"]) ?? 0;
    return incomingTime >= localTime;
  }

  return true;
}

function mergeRemoteResultsCollection(current, incoming, keyFn) {
  const map = {};
  (current || []).forEach(item => { map[keyFn(item)] = item; });
  (incoming || []).forEach(item => {
    if (!item) return;
    const key = keyFn(item);
    if (!shouldUseIncomingResultRecord(map[key], item)) return;
    map[key] = { ...(map[key] || {}), ...item };
  });
  return Object.keys(map).map(key => map[key]);
}

const resultKey = item => String(item.recordId || [item.id, item.examId || item.examTitle, item.timestamp, item.score].join(":"));

const localEdited = [{ recordId: "result_1", score: "95/100", savedAt: 1000, updatedAt: 5000 }];
const staleRemote = [{ recordId: "result_1", score: "70/100", savedAt: 1000 }];
assert.strictEqual(
  mergeRemoteResultsCollection(localEdited, staleRemote, resultKey)[0].score,
  "95/100",
  "stale cloud result must not overwrite a newer local teacher edit"
);

const newerRemote = [{ recordId: "result_1", score: "98/100", savedAt: 1000, updatedAt: 6000 }];
assert.strictEqual(
  mergeRemoteResultsCollection(localEdited, newerRemote, resultKey)[0].score,
  "98/100",
  "newer cloud result revisions should still update local data"
);

const legacyLocal = [{ recordId: "result_2", score: "80/100" }];
const legacyRemote = [{ recordId: "result_2", score: "82/100" }];
assert.strictEqual(
  mergeRemoteResultsCollection(legacyLocal, legacyRemote, resultKey)[0].score,
  "82/100",
  "legacy records without revision metadata keep incoming-merge behavior"
);

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(
  indexHtml.includes('id="teacher-login-sync-url"'),
  "teacher login must expose the sync URL input used by login restore"
);

console.log("All cloud sync regression tests passed.");
