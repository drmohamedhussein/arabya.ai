/**
 * ARABYA.NET backend bridge
 *
 * يحفظ بيانات المنصة في Google Sheets:
 * 1) ورقة "نتائج الطلاب" — صف لكل نتيجة (12 أو 13 عموداً)
 * 2) ورقة "ARABYA_BACKUP" — نسخة JSON للمزامنة مع لوحة المعلم
 *
 * عند get_backup تُدمَج كل صفوف "نتائج الطلاب" مع النسخة الاحتياطية
 * حتى لا تُفقد النتائج التي سُجّلت عبر add_result دون save_backup.
 *
 * GitHub اختياري (Script Properties): GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, GITHUB_DB_PATH
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
      var merged = mergeArabyaDatabase_({ results: [normaliseArabyaResult_(data)] }, "add_result");
      writeArabyaBackupSheet_(merged);
      return jsonArabya_({ status: "success", action: action, counts: countArabya_(merged) });
    }

    if (action === "save_backup") {
      var db = mergeArabyaDatabase_(data.data || {}, "save_backup");
      writeArabyaBackupSheet_(db);
      return jsonArabya_({ status: "success", action: action, counts: countArabya_(db) });
    }

    if (action === "save_entity") {
      var patch = {};
      patch[data.collection] = [data.record];
      var entityDb = mergeArabyaDatabase_(patch, "save_entity:" + data.collection);
      writeArabyaBackupSheet_(entityDb);
      return jsonArabya_({ status: "success", action: action, counts: countArabya_(entityDb) });
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
      var sheetResults = readArabyaSheetResults_();
      var db = readArabyaDatabase_();
      if (sheetResults.length) {
        db.results = mergeArabyaCollection_(db.results || [], sheetResults, "results");
      }
      db.updatedAt = new Date().toISOString();
      return jsonArabya_({
        status: "success",
        data: db,
        counts: countArabya_(db),
        sheetResultRows: sheetResults.length,
        backupResultRows: (readArabyaBackupSheet_() && readArabyaBackupSheet_().results)
          ? readArabyaBackupSheet_().results.length
          : 0
      });
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

function readArabyaSheetResults_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("نتائج الطلاب");
  if (!sheet || sheet.getLastRow() < 2) return [];

  var numCols = Math.max(sheet.getLastColumn(), 12);
  var numRows = sheet.getLastRow() - 1;
  var values = sheet.getRange(2, 1, numRows, numCols).getValues();
  var layout = detectArabyaResultLayout_(sheet, numCols);
  var results = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row || !row.length) continue;
    var hasContent = false;
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) continue;

    var item = rowToArabyaResultObject_(row, layout, i + 2);
    if (item && (item.name || item.id || item.recordId)) {
      results.push(item);
    }
  }
  return results;
}

function detectArabyaResultLayout_(sheet, numCols) {
  if (numCols >= 13) return "v2";
  var header = sheet.getRange(1, 1, 1, Math.max(numCols, 1)).getValues()[0];
  var headerText = header.join("|");
  if (/معرف الامتحان|examId/i.test(headerText)) return "v2";
  return "v1";
}

function rowToArabyaResultObject_(row, layout, sheetRow) {
  var recordId = String(row[0] || "").trim();
  var timestamp = formatArabyaTimestamp_(row[1]);
  var name = String(row[2] || "").trim();
  var id = String(row[3] || "").trim();
  var accessCode = String(row[4] || "").trim();
  var examTitle = String(row[5] || "").trim();
  var examId = "";
  var university = "";
  var faculty = "";
  var level = "";
  var examType = "";
  var score = "";
  var details = "";

  if (layout === "v2") {
    examId = String(row[6] || "").trim();
    university = String(row[7] || "").trim();
    faculty = String(row[8] || "").trim();
    level = String(row[9] || "").trim();
    examType = String(row[10] || "").trim();
    score = String(row[11] || "").trim();
    details = String(row[12] || "").trim();
  } else {
    university = String(row[6] || "").trim();
    faculty = String(row[7] || "").trim();
    level = String(row[8] || "").trim();
    examType = String(row[9] || "").trim();
    score = String(row[10] || "").trim();
    details = String(row[11] || "").trim();
  }

  if (!recordId) {
    recordId = "sheet_row_" + sheetRow;
  }

  return {
    recordId: recordId,
    timestamp: timestamp,
    name: name,
    id: id,
    accessCode: accessCode,
    examTitle: examTitle,
    examId: examId,
    university: university,
    faculty: faculty,
    level: level,
    examType: examType,
    score: score,
    details: details
  };
}

function formatArabyaTimestamp_(val) {
  if (val instanceof Date) return val.toLocaleString("ar-EG");
  return String(val || "");
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
  db.auditLog.push({ at: db.updatedAt, reason: reason, counts: countArabya_(db) });
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
  if (collection === "results") {
    if (item.recordId) return String(item.recordId);
    return String([item.id, item.examId || item.examTitle, item.timestamp, item.score].join(":"));
  }
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
    details: data.details || ""
  };
}

function readArabyaDatabase_() {
  var sheetDb = readArabyaBackupSheet_();
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty("GITHUB_REPO");
  var token = props.getProperty("GITHUB_TOKEN");
  if (!repo || !token) return sheetDb || cloneArabyaDefaultDb_();

  try {
    var path = props.getProperty("GITHUB_DB_PATH") || "database/arabya-db.json";
    var branch = props.getProperty("GITHUB_BRANCH") || "main";
    var url = "https://api.github.com/repos/" + repo + "/contents/" + encodeURIComponent(path).replace(/%2F/g, "/") + "?ref=" + encodeURIComponent(branch);
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" }
    });
    if (response.getResponseCode() === 404) return sheetDb || cloneArabyaDefaultDb_();
    if (response.getResponseCode() >= 300) throw new Error("GitHub read failed");

    var body = JSON.parse(response.getContentText());
    var decoded = Utilities.newBlob(Utilities.base64Decode(body.content)).getDataAsString("UTF-8");
    var db = JSON.parse(decoded || "{}");
    db._sha = body.sha;
    var merged = Object.assign(cloneArabyaDefaultDb_(), db);
    if (sheetDb) {
      ["teachers", "students", "exams", "results"].forEach(function(collection) {
        if (Array.isArray(sheetDb[collection]) && sheetDb[collection].length) {
          merged[collection] = mergeArabyaCollection_(merged[collection] || [], sheetDb[collection], collection);
        }
      });
    }
    return merged;
  } catch (err) {
    return sheetDb || cloneArabyaDefaultDb_();
  }
}

function tryWriteArabyaGithub_(db) {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("GITHUB_REPO") || !props.getProperty("GITHUB_TOKEN")) return;
  try { writeArabyaDatabase_(db); } catch (err) {}
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
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    payload: JSON.stringify(payload)
  });
  if (response.getResponseCode() >= 300) throw new Error("GitHub write failed");
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
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
