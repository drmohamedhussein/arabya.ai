/**
 * ARABYA.NET backend bridge
 *
 * يحفظ بيانات المنصة في Google Sheets (صفوف منفصلة + نسخة JSON احتياطية)،
 * ويمكنه مزامنة نسخة JSON مركزية إلى GitHub اختيارياً.
 *
 * Script Properties (اختياري للـ GitHub):
 * GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, GITHUB_DB_PATH
 */

var ARABYA_DEFAULT_DB = {
  schemaVersion: 1,
  updatedAt: "",
  source: "arabya.net",
  teachers: [],
  students: [],
  exams: [],
  results: [],
  auditLog: []
};

var ARABYA_RESULT_HEADERS = [
  "معرف السجل", "التاريخ", "اسم الطالب", "ID", "كود الاشتراك",
  "الامتحان", "معرف الامتحان", "الجامعة", "الكلية", "الفرقة", "النوع", "النتيجة", "التفاصيل"
];

function doPost(e) {
  try {
    var data = parseArabyaPayload_(e);
    var action = data.action || "save_backup";

    if (action === "add_result") {
      appendArabyaResult_(data);
      var mergedResult = mergeArabyaDatabase_({ results: [normaliseArabyaResult_(data)] }, "add_result");
      writeArabyaBackupSheet_(mergedResult);
      return jsonArabya_({ status: "success", action: action, counts: countArabya_(mergedResult) });
    }

    if (action === "save_backup") {
      var merged = mergeArabyaDatabase_(data.data || {}, "save_backup");
      writeArabyaBackupSheet_(merged);
      return jsonArabya_({ status: "success", action: action, counts: countArabya_(merged) });
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
      return jsonArabya_({ status: "success", data: db, counts: countArabya_(db) });
    }
    return jsonArabya_({ status: "active", service: "ARABYA.NET backend bridge" });
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

function appendArabyaResult_(data) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("نتائج الطلاب") || spreadsheet.insertSheet("نتائج الطلاب");
  ensureArabyaResultHeaders_(sheet);
  sheet.appendRow([
    data.recordId || "",
    data.timestamp || new Date(),
    data.name || "",
    data.id || "",
    data.subscriptionCode || data.accessCode || "",
    data.examTitle || "",
    data.examId || "",
    data.university || "",
    data.faculty || "",
    data.level || "",
    data.examType || "",
    data.score || "",
    data.details || ""
  ]);
}

function ensureArabyaResultHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow(ARABYA_RESULT_HEADERS);
  sheet.getRange(1, 1, 1, ARABYA_RESULT_HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#1e293b")
    .setFontColor("#ffffff");
}

function writeArabyaBackupSheet_(db) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_BACKUP") ||
    SpreadsheetApp.getActiveSpreadsheet().insertSheet("ARABYA_BACKUP");
  sheet.clear();
  sheet.appendRow(["Timestamp", "Database Backup JSON"]);
  sheet.appendRow([new Date(), JSON.stringify(db)]);
}

function readArabyaBackupSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_BACKUP");
  if (!sheet || sheet.getLastRow() < 2) return null;
  var raw = sheet.getRange(2, 2).getValue();
  if (!raw) return null;
  try {
    return Object.assign(cloneArabyaDefaultDb_(), JSON.parse(String(raw)));
  } catch (err) {
    return null;
  }
}

function mergeArabyaDatabase_(patch, reason) {
  var db = readArabyaDatabase_();
  ["teachers", "students", "exams", "results"].forEach(function(collection) {
    if (Array.isArray(patch[collection])) {
      db[collection] = mergeArabyaCollection_(db[collection] || [], patch[collection], collection);
    }
  });
  db.updatedAt = new Date().toISOString();
  db.auditLog = db.auditLog || [];
  db.auditLog.push({
    at: db.updatedAt,
    reason: reason,
    counts: countArabya_(db)
  });
  if (db.auditLog.length > 200) db.auditLog = db.auditLog.slice(db.auditLog.length - 200);
  tryWriteArabyaGithub_(db);
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
    map[key] = Object.assign({}, map[key] || {}, item);
  });
  return Object.keys(map).map(function(key) { return map[key]; });
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
    examTitle: data.examTitle || "",
    examId: data.examId || "",
    university: data.university || "",
    faculty: data.faculty || "",
    level: data.level || "",
    examType: data.examType || "",
    score: data.score || "",
    details: data.details || "",
    studentAnswers: data.studentAnswers || {},
    questionScores: data.questionScores || {}
  };
}

function readArabyaDatabase_() {
  var sheetDb = readArabyaBackupSheet_();
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty("GITHUB_REPO");
  var path = props.getProperty("GITHUB_DB_PATH") || "database/arabya-db.json";
  var branch = props.getProperty("GITHUB_BRANCH") || "main";
  var token = props.getProperty("GITHUB_TOKEN");

  if (!repo || !token) {
    return sheetDb || cloneArabyaDefaultDb_();
  }

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
    if (response.getResponseCode() === 404) return sheetDb || cloneArabyaDefaultDb_();
    if (response.getResponseCode() >= 300) throw new Error("GitHub read failed: " + response.getContentText());

    var body = JSON.parse(response.getContentText());
    var decoded = Utilities.newBlob(Utilities.base64Decode(body.content)).getDataAsString("UTF-8");
    var db = JSON.parse(decoded || "{}");
    db._sha = body.sha;
    return Object.assign(cloneArabyaDefaultDb_(), db);
  } catch (err) {
    return sheetDb || cloneArabyaDefaultDb_();
  }
}

function tryWriteArabyaGithub_(db) {
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty("GITHUB_REPO");
  var token = props.getProperty("GITHUB_TOKEN");
  if (!repo || !token) return;

  try {
    writeArabyaDatabase_(db);
  } catch (err) {
    // GitHub اختياري — لا نوقف حفظ Google Sheets
  }
}

function writeArabyaDatabase_(db) {
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty("GITHUB_REPO");
  var path = props.getProperty("GITHUB_DB_PATH") || "database/arabya-db.json";
  var branch = props.getProperty("GITHUB_BRANCH") || "main";
  var token = props.getProperty("GITHUB_TOKEN");
  if (!repo || !token) return;

  var sha = db._sha;
  var payloadDb = JSON.parse(JSON.stringify(db));
  delete payloadDb._sha;
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
