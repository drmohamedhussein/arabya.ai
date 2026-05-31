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
  "معرف السجل", "التاريخ والوقت", "اسم الطالب", "رقم ID", "كود الاشتراك",
  "مفتاح الطالب", "البريد", "الموبايل", "الامتحان", "معرف الامتحان",
  "الجامعة", "الكلية", "الفرقة", "النوع", "الحالة", "النتيجة", "التفاصيل"
];

function doPost(e) {
  try {
    var data = parseArabyaPayload_(e);
    var action = data.action || "save_backup";

    if (action === "add_result") {
      upsertArabyaResult_(data);
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
      if (data.collection === "results" && data.record) {
        upsertArabyaResult_(data.record);
      }
      var patch = {};
      patch[data.collection] = [data.record];
      var entityDb = mergeArabyaDatabase_(patch, "save_entity:" + data.collection);
      if (data.collection === "results") {
        var derivedStudents = hydrateStudentsFromResults_(entityDb.results || []);
        if (derivedStudents.length) {
          entityDb.students = mergeArabyaCollection_(entityDb.students || [], derivedStudents, "students");
        }
      }
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
      var backupSheet = readArabyaBackupSheet_();
      var backupResultRows = backupSheet && Array.isArray(backupSheet.results) ? backupSheet.results.length : 0;
      var db = readArabyaDatabase_();
      if (sheetResults.length) {
        db.results = mergeArabyaCollection_(db.results || [], sheetResults, "results");
      }
      var derivedStudents = hydrateStudentsFromResults_(db.results || []);
      if (derivedStudents.length) {
        db.students = mergeArabyaCollection_(db.students || [], derivedStudents, "students");
      }
      db.updatedAt = new Date().toISOString();
      return jsonArabya_({
        status: "success",
        data: db,
        counts: countArabya_(db),
        sheetResultRows: sheetResults.length,
        backupResultRows: backupResultRows,
        derivedStudentCount: derivedStudents.length
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


function upsertArabyaResult_(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("نتائج الطلاب") || SpreadsheetApp.getActiveSpreadsheet().insertSheet("نتائج الطلاب");
  ensureArabyaResultHeaders_(sheet);
  var rowValues = [
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
    data.status || (data.isManualGradeUpdate ? "updated" : "completed"),
    data.score || "",
    data.details || ""
  ];
  var recordId = String(data.recordId || "").trim();
  if (recordId && sheet.getLastRow() > 1) {
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === recordId) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }
  sheet.appendRow(rowValues);
}

function appendArabyaResult_(data) {
  upsertArabyaResult_(data);
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

  var allValues = sheet.getDataRange().getValues();
  if (!allValues || allValues.length < 2) return [];

  var numCols = Math.max(allValues[0].length, sheet.getLastColumn(), 12);
  var layout = detectArabyaResultLayout_(sheet, numCols);
  var results = [];

  for (var i = 1; i < allValues.length; i++) {
    var row = allValues[i];
    if (!row || !row.length) continue;
    var hasContent = false;
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) continue;

    var item = rowToArabyaResultObject_(row, layout, i + 1);
    if (item && (item.name || item.id || item.recordId)) {
      results.push(item);
    }
  }
  return results;
}

function detectArabyaResultLayout_(sheet, numCols) {
  var header = sheet.getRange(1, 1, 1, Math.max(numCols, 1)).getValues()[0];
  var headerText = header.join("|");
  if (/مفتاح الطالب|studentLookupKey/i.test(headerText) || numCols >= 16) return "v3";
  if (numCols >= 13 || /معرف الامتحان|examId/i.test(headerText)) return "v2";
  return "v1";
}

function rowToArabyaResultObject_(row, layout, sheetRow) {
  var recordId = String(row[0] || "").trim();
  var timestamp = formatArabyaTimestamp_(row[1]);
  var name = String(row[2] || "").trim();
  var id = String(row[3] || "").trim();
  var accessCode = String(row[4] || "").trim();
  var studentLookupKey = "";
  var email = "";
  var mobile = "";
  var examTitle = "";
  var examId = "";
  var university = "";
  var faculty = "";
  var level = "";
  var examType = "";
  var status = "";
  var score = "";
  var details = "";

  if (layout === "v3") {
    studentLookupKey = String(row[5] || "").trim();
    email = String(row[6] || "").trim();
    mobile = String(row[7] || "").trim();
    examTitle = String(row[8] || "").trim();
    examId = String(row[9] || "").trim();
    university = String(row[10] || "").trim();
    faculty = String(row[11] || "").trim();
    level = String(row[12] || "").trim();
    examType = String(row[13] || "").trim();
    status = String(row[14] || "").trim();
    score = String(row[15] || "").trim();
    details = String(row[16] || "").trim();
  } else if (layout === "v2") {
    examTitle = String(row[5] || "").trim();
    examId = String(row[6] || "").trim();
    university = String(row[7] || "").trim();
    faculty = String(row[8] || "").trim();
    level = String(row[9] || "").trim();
    examType = String(row[10] || "").trim();
    score = String(row[11] || "").trim();
    details = String(row[12] || "").trim();
  } else {
    examTitle = String(row[5] || "").trim();
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
    studentLookupKey: studentLookupKey,
    email: email,
    mobile: mobile,
    examTitle: examTitle,
    examId: examId,
    university: university,
    faculty: faculty,
    level: level,
    examType: examType,
    status: status,
    score: score,
    details: details
  };
}

function hydrateStudentsFromResults_(results) {
  var map = {};
  (results || []).forEach(function(res) {
    if (!res || (!res.name && !res.id && !res.accessCode)) return;
    var key = res.studentLookupKey || [res.id || "", res.accessCode || "", res.name || ""].join(":");
    if (!key) return;
    var existing = map[key] || {};
    map[key] = {
      name: res.name || existing.name || "",
      id: res.id || existing.id || "",
      code: res.accessCode || existing.code || "",
      email: res.email || existing.email || "",
      mobile: res.mobile || existing.mobile || "",
      studentKey: res.studentLookupKey || key,
      timestamp: existing.timestamp || res.timestamp || ""
    };
  });
  return Object.keys(map).map(function(k) { return map[k]; });
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
  if (collection === "students") return String(item.studentKey || item.id || item.code || item.name || Utilities.getUuid());
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
    studentLookupKey: data.studentLookupKey || "",
    email: data.email || "",
    mobile: data.mobile || "",
    examTitle: data.examTitle || "",
    examId: data.examId || "",
    university: data.university || "",
    faculty: data.faculty || "",
    level: data.level || "",
    examType: data.examType || "",
    status: data.status || "",
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
