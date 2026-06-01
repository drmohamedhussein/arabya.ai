/**
 * ARABYA.NET backend bridge
 *
 * يحفظ بيانات المنصة في Google Sheets، ويزامن نسخة JSON مركزية إلى GitHub.
 *
 * قبل النشر، افتح Project Settings في Apps Script ثم Script Properties وأضف:
 * GITHUB_TOKEN   = Fine-grained GitHub token بصلاحية Contents: Read and Write
 * GITHUB_REPO    = drmohamedhussein/arabya.ai
 * GITHUB_BRANCH  = main
 * GITHUB_DB_PATH = database/arabya-db.json
 */

var ARABYA_DEFAULT_DB = {
  schemaVersion: 2,
  updatedAt: "",
  source: "arabya.net",
  teachers: [],
  students: [],
  exams: [],
  results: [],
  examDeviceRegistry: { bindings: [] },
  questionBanks: {},
  auditLog: []
};

/** أعمدة ورقة «نتائج الطلاب» — يجب أن يطابق ترتيب buildArabyaResultRow_ */
var ARABYA_RESULTS_HEADERS = [
  "معرف السجل",
  "التاريخ",
  "اسم الطالب",
  "ID",
  "كود الاشتراك",
  "مفتاح الطالب",
  "البريد",
  "الجوال",
  "الامتحان",
  "معرف الامتحان",
  "الجامعة",
  "الكلية",
  "الفرقة",
  "النوع",
  "الحالة",
  "رقم المحاولة",
  "النتيجة",
  "المجموع الأقصى",
  "التفاصيل",
  "محاولات الغش",
  "حد محاولات الغش",
  "سجل محاولات الغش",
  "معرف الجهاز",
  "بصمة الجهاز",
  "عنوان IP",
  "بيانات الجهاز",
  "إعادة التقديم",
  "مؤرشف",
  "تاريخ منح إعادة التقديم",
  "تاريخ إلغاء إعادة التقديم",
  "تاريخ الأرشفة",
  "محل بسجل",
  "تحرير IP بواسطة المعلم",
  "تاريخ تحرير IP",
  "محرر IP"
];

function doPost(e) {
  try {
    var data = parseArabyaPayload_(e);
    var action = data.action || "save_backup";

    if (action === "add_result") {
      upsertArabyaResult_(data);
      mergeArabyaDatabase_({ results: [normaliseArabyaResult_(data)] }, "add_result");
      return jsonArabya_({ status: "success", action: action, recordId: data.recordId || "" });
    }

    if (action === "save_backup") {
      var merged = mergeArabyaDatabase_(data.data || {}, "save_backup");
      return jsonArabya_({
        status: "success",
        action: action,
        counts: countArabya_(merged),
        githubSynced: !merged._githubSyncSkipped
      });
    }

    if (action === "save_entity") {
      var patch = {};
      patch[data.collection] = [data.record];
      var db = mergeArabyaDatabase_(patch, "save_entity:" + data.collection);
      writeArabyaBackupSheet_(db);
      return jsonArabya_({ status: "success", action: action, counts: countArabya_(db) });
    }

    return jsonArabya_({ status: "ignored", action: action });
  } catch (err) {
    return jsonArabya_({ status: "error", message: err.message });
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : "";
    if (action === "get_backup") {
      var db = readArabyaDatabase_();
      var sheetResults = readArabyaResultsFromSheet_();
      if (sheetResults.length) {
        db.results = mergeArabyaCollection_(db.results || [], sheetResults, "results");
      }
      var resultCount = (db.results || []).length;
      return jsonArabya_({
        status: "success",
        data: db,
        counts: countArabya_(db),
        sheetResultRows: sheetResults.length,
        sheetTotalRows: sheetResults.length,
        backupResultRows: resultCount
      });
    }
    return jsonArabya_({ status: "active", service: "ARABYA.NET backend bridge", schemaVersion: ARABYA_DEFAULT_DB.schemaVersion });
  } catch (err) {
    return jsonArabya_({ status: "error", message: err.message });
  }
}

function parseArabyaPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error("Invalid JSON payload: " + err.message);
  }
}

function getArabyaResultsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("نتائج الطلاب");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("نتائج الطلاب");
  }
  ensureArabyaResultsHeaders_(sheet);
  return sheet;
}

function ensureArabyaResultsHeaders_(sheet) {
  var headers = ARABYA_RESULTS_HEADERS;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var firstCell = sheet.getRange(1, 1).getValue();
  var looksLikeOldSchema = firstCell === "معرف السجل" && lastCol > 0 && lastCol < headers.length;
  var missingHeader = firstCell !== headers[0];

  if (missingHeader && !looksLikeOldSchema) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  if (looksLikeOldSchema) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var rows = Math.max(0, lastRow - 1);
    if (rows > 0 && lastCol < headers.length) {
      sheet.getRange(2, lastCol + 1, rows + 1, headers.length).setValue("");
    }
  }
}

function upsertArabyaResult_(data) {
  var sheet = getArabyaResultsSheet_();
  var rowValues = buildArabyaResultRow_(data);
  var recordId = String(data.recordId || "").trim();
  var lastRow = sheet.getLastRow();

  if (recordId && lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || "").trim() === recordId) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }

  sheet.appendRow(rowValues);
}

function buildArabyaResultRow_(data) {
  var cheatLog = stringifyArabyaJsonField_(data.cheatAttemptLog);
  var deviceMeta = stringifyArabyaJsonField_(data.deviceMeta);
  return [
    data.recordId || "",
    data.timestamp || new Date(),
    data.name || "",
    data.id || "",
    data.subscriptionCode || data.accessCode || "",
    data.studentLookupKey || "",
    data.email || "",
    data.mobile || "",
    data.examTitle || "",
    data.examId || "",
    data.university || "",
    data.faculty || "",
    data.level || "",
    data.examType || "",
    data.status || "completed",
    data.attemptNumber !== undefined && data.attemptNumber !== null ? data.attemptNumber : "",
    data.score || "",
    data.maxScore !== undefined && data.maxScore !== null ? data.maxScore : "",
    truncateArabyaSheetText_(data.details || "", 45000),
    data.cheatViolations !== undefined && data.cheatViolations !== null ? data.cheatViolations : "",
    data.maxCheatAttemptsAllowed !== undefined && data.maxCheatAttemptsAllowed !== null ? data.maxCheatAttemptsAllowed : "",
    cheatLog,
    data.deviceId || "",
    data.deviceFingerprint || "",
    data.clientIp || "",
    deviceMeta,
    data.allowRetake ? "نعم" : "لا",
    data.superseded ? "نعم" : "لا",
    data.retakeGrantedAt || "",
    data.retakeRevokedAt || "",
    data.supersededAt || "",
    data.supersededByRecordId || "",
    data.ipReleasedByTeacher ? "نعم" : "لا",
    data.ipReleasedAt || "",
    data.ipReleasedBy || ""
  ];
}

function stringifyArabyaJsonField_(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function truncateArabyaSheetText_(text, maxLen) {
  var str = String(text || "");
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\n...[مختصر لحد الخلية في الشيت]";
}

function writeArabyaBackupSheet_(db) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_BACKUP") ||
    SpreadsheetApp.getActiveSpreadsheet().insertSheet("ARABYA_BACKUP");
  sheet.clear();
  sheet.appendRow(["Timestamp", "Database Backup JSON"]);
  sheet.appendRow([new Date(), JSON.stringify(db)]);
}

function mergeArabyaExamDeviceRegistry_(localRegistry, incomingRegistry) {
  var local = localRegistry && Array.isArray(localRegistry.bindings) ? localRegistry : { bindings: [] };
  var incoming = incomingRegistry && Array.isArray(incomingRegistry.bindings) ? incomingRegistry : { bindings: [] };
  var map = {};
  (local.bindings || []).concat(incoming.bindings || []).forEach(function(entry) {
    if (!entry || !entry.examId || !entry.studentLookupKey) return;
    var key = [
      entry.examId,
      entry.studentLookupKey,
      entry.deviceId || "",
      entry.deviceFingerprint || ""
    ].join("::");
    map[key] = entry;
  });
  return { bindings: Object.keys(map).map(function(key) { return map[key]; }) };
}

function mergeArabyaDatabase_(patch, reason) {
  var db = readArabyaDatabase_();
  ["teachers", "students", "exams", "results"].forEach(function(collection) {
    if (Array.isArray(patch[collection])) {
      db[collection] = mergeArabyaCollection_(db[collection] || [], patch[collection], collection);
    }
  });
  if (patch.examDeviceRegistry) {
    db.examDeviceRegistry = mergeArabyaExamDeviceRegistry_(db.examDeviceRegistry, patch.examDeviceRegistry);
  }
  if (patch.questionBanks && typeof patch.questionBanks === "object") {
    db.questionBanks = deepMergeArabyaObjects_(db.questionBanks || {}, patch.questionBanks);
  }
  db.schemaVersion = ARABYA_DEFAULT_DB.schemaVersion;
  db.updatedAt = new Date().toISOString();
  db.auditLog = db.auditLog || [];
  db.auditLog.push({
    at: db.updatedAt,
    reason: reason,
    counts: countArabya_(db)
  });
  if (db.auditLog.length > 200) db.auditLog = db.auditLog.slice(db.auditLog.length - 200);
  writeArabyaBackupSheet_(db);
  try {
    writeArabyaDatabaseToGitHub_(db);
  } catch (githubErr) {
    db._githubSyncSkipped = String(githubErr.message || githubErr);
  }
  return db;
}

function mergeArabyaCollection_(current, incoming, collection) {
  var map = {};
  current.forEach(function(item) {
    map[getArabyaRecordKey_(item, collection)] = item;
  });
  incoming.forEach(function(item) {
    if (!item) return;
    var key = getArabyaRecordKey_(item, collection);
    map[key] = deepMergeArabyaObjects_(map[key] || {}, item);
  });
  return Object.keys(map).map(function(key) { return map[key]; });
}

function deepMergeArabyaObjects_(base, patch) {
  var out = Object.assign({}, base || {});
  Object.keys(patch || {}).forEach(function(key) {
    var val = patch[key];
    if (val === undefined) return;
    if (Array.isArray(val)) {
      out[key] = val.slice();
    } else if (val && typeof val === "object" && !Array.isArray(val) && typeof val.getTime !== "function") {
      out[key] = deepMergeArabyaObjects_(out[key] || {}, val);
    } else {
      out[key] = val;
    }
  });
  return out;
}

function getArabyaRecordKey_(item, collection) {
  if (collection === "teachers") return String(item.username || item.quickCode || item.name || Utilities.getUuid());
  if (collection === "students") return String(item.id || item.code || item.name || Utilities.getUuid());
  if (collection === "exams") return String(item.id || item.title || Utilities.getUuid());
  if (collection === "results") return String(item.recordId || [item.id, item.examId, item.timestamp].join(":") || Utilities.getUuid());
  return String(item.id || Utilities.getUuid());
}

function normaliseArabyaResult_(data) {
  return {
    recordId: data.recordId || "",
    timestamp: data.timestamp || new Date().toISOString(),
    name: data.name || "",
    id: data.id || "",
    accessCode: data.subscriptionCode || data.accessCode || "",
    studentLookupKey: data.studentLookupKey || "",
    email: data.email || "",
    mobile: data.mobile || "",
    examTitle: data.examTitle || "",
    examId: data.examId || "",
    university: data.university || "",
    faculty: data.faculty || "",
    level: data.level || "",
    examType: data.examType || "",
    status: data.status || "completed",
    attemptNumber: data.attemptNumber !== undefined && data.attemptNumber !== null ? data.attemptNumber : "",
    score: data.score || "",
    maxScore: data.maxScore !== undefined && data.maxScore !== null ? data.maxScore : "",
    details: data.details || "",
    cheatViolations: data.cheatViolations !== undefined && data.cheatViolations !== null ? data.cheatViolations : 0,
    maxCheatAttemptsAllowed: data.maxCheatAttemptsAllowed !== undefined && data.maxCheatAttemptsAllowed !== null ? data.maxCheatAttemptsAllowed : "",
    cheatAttemptLog: parseArabyaJsonField_(data.cheatAttemptLog, []),
    deviceId: data.deviceId || "",
    deviceFingerprint: data.deviceFingerprint || "",
    clientIp: data.clientIp || "",
    deviceMeta: parseArabyaJsonField_(data.deviceMeta, {}),
    allowRetake: !!data.allowRetake,
    superseded: !!data.superseded,
    retakeGrantedAt: data.retakeGrantedAt || "",
    retakeGrantedBy: data.retakeGrantedBy || "",
    retakeRevokedAt: data.retakeRevokedAt || "",
    supersededAt: data.supersededAt || "",
    supersededByRecordId: data.supersededByRecordId || "",
    isManualGradeUpdate: !!data.isManualGradeUpdate,
    ipReleasedByTeacher: !!data.ipReleasedByTeacher,
    ipReleasedAt: data.ipReleasedAt || "",
    ipReleasedBy: data.ipReleasedBy || ""
  };
}

function parseArabyaJsonField_(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function readArabyaDatabase_() {
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty("GITHUB_REPO");
  var path = props.getProperty("GITHUB_DB_PATH") || "database/arabya-db.json";
  var branch = props.getProperty("GITHUB_BRANCH") || "main";
  var token = props.getProperty("GITHUB_TOKEN");
  if (repo && token) {
    try {
      var url = "https://api.github.com/repos/" + repo + "/contents/" + encodeURIComponent(path).replace(/%2F/g, "/") + "?ref=" + encodeURIComponent(branch);
      var response = UrlFetchApp.fetch(url, {
        method: "get",
        muteHttpExceptions: true,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json"
        }
      });
      if (response.getResponseCode() === 200) {
        var body = JSON.parse(response.getContentText());
        var decoded = Utilities.newBlob(Utilities.base64Decode(body.content)).getDataAsString("UTF-8");
        var db = JSON.parse(decoded || "{}");
        db._sha = body.sha;
        return Object.assign(cloneArabyaDefaultDb_(), db);
      }
    } catch (githubReadErr) {
      // fallback to sheet backup below
    }
  }
  return readArabyaDatabaseFromSheet_();
}

/** قراءة آخر نسخة احتياطية من ورقة ARABYA_BACKUP (وضع الشيت فقط بدون GitHub) */
function readArabyaDatabaseFromSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_BACKUP");
  if (!sheet || sheet.getLastRow() < 2) return cloneArabyaDefaultDb_();
  var lastRow = sheet.getLastRow();
  var backupDataStr = sheet.getRange(lastRow, 2).getValue();
  if (!backupDataStr) return cloneArabyaDefaultDb_();
  try {
    var parsed = JSON.parse(String(backupDataStr));
    return Object.assign(cloneArabyaDefaultDb_(), parsed);
  } catch (err) {
    return cloneArabyaDefaultDb_();
  }
}

function writeArabyaDatabaseToGitHub_(db) {
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty("GITHUB_REPO");
  var path = props.getProperty("GITHUB_DB_PATH") || "database/arabya-db.json";
  var branch = props.getProperty("GITHUB_BRANCH") || "main";
  var token = props.getProperty("GITHUB_TOKEN");
  if (!repo || !token) return;

  var payloadDb = JSON.parse(JSON.stringify(db));
  var sha = payloadDb._sha;
  delete payloadDb._sha;
  delete payloadDb._githubSyncSkipped;
  var url = "https://api.github.com/repos/" + repo + "/contents/" + encodeURIComponent(path).replace(/%2F/g, "/");
  var payload = {
    message: "Sync ARABYA.NET database",
    branch: branch,
    content: Utilities.base64Encode(JSON.stringify(payloadDb, null, 2), Utilities.Charset.UTF_8)
  };
  if (sha) payload.sha = sha;

  var response = UrlFetchApp.fetch(url, {
    method: "put",
    muteHttpExceptions: true,
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json"
    },
    payload: JSON.stringify(payload)
  });
  if (response.getResponseCode() >= 300) {
    throw new Error("GitHub write failed: " + response.getContentText());
  }
}

function readArabyaResultsFromSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("نتائج الطلاب");
  if (!sheet || sheet.getLastRow() < 2) return [];
  ensureArabyaResultsHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), ARABYA_RESULTS_HEADERS.length);
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  values.forEach(function(row) {
    if (!row || !String(row[0] || "").trim()) return;
    var cheatLog = parseArabyaJsonField_(row[21], []);
    var deviceMeta = parseArabyaJsonField_(row[25], {});
    out.push({
      recordId: String(row[0] || ""),
      timestamp: row[1] ? String(row[1]) : "",
      name: String(row[2] || ""),
      id: String(row[3] || ""),
      accessCode: String(row[4] || ""),
      studentLookupKey: String(row[5] || ""),
      email: String(row[6] || ""),
      mobile: String(row[7] || ""),
      examTitle: String(row[8] || ""),
      examId: String(row[9] || ""),
      university: String(row[10] || ""),
      faculty: String(row[11] || ""),
      level: String(row[12] || ""),
      examType: String(row[13] || ""),
      status: String(row[14] || "completed"),
      attemptNumber: row[15],
      score: String(row[16] || ""),
      maxScore: row[17],
      details: String(row[18] || ""),
      cheatViolations: row[19] !== "" && row[19] !== null ? row[19] : 0,
      maxCheatAttemptsAllowed: row[20],
      cheatAttemptLog: cheatLog,
      deviceId: String(row[22] || ""),
      deviceFingerprint: String(row[23] || ""),
      clientIp: String(row[24] || ""),
      deviceMeta: deviceMeta,
      allowRetake: String(row[26] || "") === "نعم",
      superseded: String(row[27] || "") === "نعم",
      retakeGrantedAt: String(row[28] || ""),
      retakeRevokedAt: String(row[29] || ""),
      supersededAt: String(row[30] || ""),
      supersededByRecordId: String(row[31] || ""),
      ipReleasedByTeacher: String(row[32] || "") === "نعم",
      ipReleasedAt: String(row[33] || ""),
      ipReleasedBy: String(row[34] || "")
    });
  });
  return out.map(normaliseArabyaResult_);
}

function cloneArabyaDefaultDb_() {
  return JSON.parse(JSON.stringify(ARABYA_DEFAULT_DB));
}

function countArabya_(db) {
  return {
    teachers: (db.teachers || []).length,
    students: (db.students || []).length,
    exams: (db.exams || []).length,
    results: (db.results || []).length
  };
}

function jsonArabya_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
