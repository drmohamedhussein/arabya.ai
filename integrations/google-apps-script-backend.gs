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
 * ARABYA_API_SECRET = سر طويل عشوائي (يُضبط أيضاً في تبويب الربط بالموقع)
 */

var ARABYA_DEFAULT_DB = {
  schemaVersion: 2,
  appVersion: "",
  updatedAt: "",
  source: "arabya.net",
  teachers: [],
  students: [],
  exams: [],
  results: [],
  examDeviceRegistry: { bindings: [] },
  questionBanks: {},
  deletedStudentKeys: [],
  deletedResultKeys: [],
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
  "إجابات الطالب",
  "درجات الأسئلة",
  "الأسئلة المعروضة"
];

function doPost(e) {
  try {
    var data = parseArabyaPayload_(e);
    var action = data.action || "save_backup";
    if (!isArabyaApiAuthorized_(e, data)) {
      return unauthorizedArabya_();
    }
    if (!checkArabyaRateLimit_(e, data, action, "")) {
      return rateLimitedArabya_();
    }

    if (action === "add_result") {
      upsertArabyaResult_(data);
      mergeArabyaDatabase_({ results: [normaliseArabyaResult_(data)] }, "add_result");
      return jsonArabya_({ status: "success", action: action, recordId: data.recordId || "" });
    }

    if (action === "delete_result") {
      var sheetRemoved = deleteArabyaResultFromSheet_(data);
      var dbAfterDelete = applyDeleteResultToDatabase_(data);
      appendArabyaAuditSheet_("delete_result", data.actor || {}, String(data.recordId || data.id || ""));
      return jsonArabya_({
        status: "success",
        action: action,
        recordId: data.recordId || "",
        sheetRowRemoved: sheetRemoved,
        counts: countArabya_(dbAfterDelete)
      });
    }

    if (action === "save_backup") {
      var actor = data.actor || (data.data && data.data._actor) || {};
      var clientReason = data && data.data && data.data._clientReason
        ? String(data.data._clientReason)
        : "";
      var merged = mergeArabyaDatabase_(data.data || {}, "save_backup", actor, clientReason);
      return jsonArabya_({
        status: "success",
        action: action,
        counts: countArabya_(merged),
        cloudRevision: getArabyaCloudRevision_(),
        githubSynced: !merged._githubSyncSkipped
      });
    }

    if (action === "log_device_reject") {
      appendDeviceRejectSheet_(data);
      appendArabyaAuditSheet_("device_reject", data.actor || {}, stringifyArabyaJsonField_(data.message || data.reason || ""));
      return jsonArabya_({ status: "success", action: action });
    }

    if (action === "run_daily_drive_backup") {
      var fileName = dailyArabyaDriveBackup_();
      return jsonArabya_({ status: "success", action: action, fileName: fileName });
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
    if (action === "get_sync_meta" || action === "get_backup") {
      if (!isArabyaApiAuthorized_(e, null)) {
        return unauthorizedArabya_();
      }
    }
    if (action === "get_sync_meta") {
      if (!checkArabyaRateLimit_(e, null, "get_sync_meta", "")) {
        return rateLimitedArabya_();
      }
      var stats = getArabyaSyncStats_();
      return jsonArabya_(Object.assign({ status: "success", service: "ARABYA.NET backend bridge" }, stats));
    }

    if (action === "get_backup") {
      var scope = e && e.parameter ? String(e.parameter.scope || "").trim() : "";
      var examId = e && e.parameter ? String(e.parameter.exam || e.parameter.examId || "").trim() : "";
      if (!checkArabyaRateLimit_(e, null, "get_backup", scope)) {
        return rateLimitedArabya_();
      }
      var db = readArabyaDatabase_();
      var sheetRowCount = readArabyaResultsFromSheet_().length;
      db.results = buildArabyaResultsForClient_(db);
      db.students = buildArabyaStudentsForClient_(db, db.results);
      if (db.deletedStudentKeys && db.deletedStudentKeys.length) {
        db.students = filterArabyaStudentsByDeletedKeys_(db.students || [], db.deletedStudentKeys);
      }
      var payloadDb = scope === "exam_start" ? buildArabyaExamStartBackup_(db, examId) : db;
      var resultCount = (payloadDb.results || []).length;
      var cloudRevision = getArabyaCloudRevision_();
      return jsonArabya_({
        status: "success",
        scope: scope || "full",
        data: sanitizeArabyaDbForClient_(payloadDb),
        cloudRevision: cloudRevision,
        counts: countArabya_(payloadDb),
        sheetResultRows: resultCount,
        sheetTotalRows: sheetRowCount,
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

function getArabyaApiSecret_() {
  return String(PropertiesService.getScriptProperties().getProperty("ARABYA_API_SECRET") || "").trim();
}

function extractClientApiSecret_(e, data) {
  var fromQuery = e && e.parameter
    ? String(e.parameter.apiSecret || e.parameter.api_secret || "").trim()
    : "";
  var fromBody = data
    ? String(data.apiSecret || data.api_secret || "").trim()
    : "";
  return fromBody || fromQuery;
}

function isArabyaApiAuthorized_(e, data) {
  var expected = getArabyaApiSecret_();
  if (!expected) return true;
  return extractClientApiSecret_(e, data) === expected;
}

function unauthorizedArabya_(message) {
  return jsonArabya_({
    status: "error",
    code: "unauthorized",
    message: message || "Unauthorized API secret"
  });
}

function sanitizeArabyaDbForClient_(db) {
  if (!db) return db;
  var copy = JSON.parse(JSON.stringify(db));
  delete copy._sha;
  delete copy._githubSyncSkipped;
  delete copy._clientReason;
  if (Array.isArray(copy.teachers)) {
    copy.teachers = copy.teachers.map(function(teacher) {
      if (!teacher) return teacher;
      var safe = Object.assign({}, teacher);
      delete safe.password;
      delete safe.passwordHash;
      delete safe.passwordSalt;
      delete safe.autoEntryCode;
      delete safe.loginTokens;
      if (safe.integrationConfig) {
        safe.integrationConfig = Object.assign({}, safe.integrationConfig);
        delete safe.integrationConfig.teacherCode;
        delete safe.integrationConfig.apiSecret;
      }
      return safe;
    });
  }
  return copy;
}

function slimArabyaResultForExamStart_(result) {
  if (!result) return result;
  return {
    recordId: result.recordId || "",
    examId: result.examId || "",
    examTitle: result.examTitle || "",
    studentLookupKey: result.studentLookupKey || "",
    id: result.id || "",
    name: result.name || "",
    accessCode: result.accessCode || result.code || "",
    status: result.status || "",
    allowRetake: result.allowRetake,
    retakeGrantedAt: result.retakeGrantedAt,
    superseded: result.superseded,
    supersededAt: result.supersededAt,
    clientIp: result.clientIp || "",
    staffIpReleased: result.staffIpReleased,
    staffIpReleasedAt: result.staffIpReleasedAt,
    timestamp: result.timestamp || "",
    score: result.score || ""
  };
}

function buildArabyaExamStartBackup_(db, examId) {
  var targetExamId = String(examId || "").trim();
  var exams = Array.isArray(db.exams) ? db.exams : [];
  if (targetExamId) {
    exams = exams.filter(function(ex) {
      return ex && String(ex.id || "") === targetExamId;
    });
  }
  var results = Array.isArray(db.results) ? db.results : [];
  if (targetExamId) {
    results = results.filter(function(row) {
      return row && String(row.examId || "") === targetExamId;
    });
  }
  results = results.map(slimArabyaResultForExamStart_);
  var bindings = db.examDeviceRegistry && Array.isArray(db.examDeviceRegistry.bindings)
    ? db.examDeviceRegistry.bindings
    : [];
  if (targetExamId) {
    bindings = bindings.filter(function(binding) {
      return binding && String(binding.examId || "") === targetExamId;
    });
  }
  return {
    schemaVersion: db.schemaVersion || ARABYA_DEFAULT_DB.schemaVersion,
    appVersion: db.appVersion || "",
    updatedAt: db.updatedAt || "",
    source: db.source || "arabya.net",
    exams: exams,
    results: results,
    examDeviceRegistry: { bindings: bindings },
    deletedStudentKeys: Array.isArray(db.deletedStudentKeys) ? db.deletedStudentKeys : [],
    deletedResultKeys: Array.isArray(db.deletedResultKeys) ? db.deletedResultKeys : [],
    teachers: [],
    students: [],
    questionBanks: {},
    auditLog: []
  };
}

function checkArabyaRateLimit_(e, data, action, scope) {
  try {
    var cache = CacheService.getScriptCache();
    var bucket = String(Math.floor(Date.now() / 60000));
    var identity = extractClientApiSecret_(e, data) || "open";
    var key = "rl_" + String(action || "x") + "_" + identity.substring(0, 16) + "_" + bucket;
    var count = parseInt(cache.get(key) || "0", 10) + 1;
    cache.put(key, String(count), 120);
    var limit = 45;
    if (action === "get_backup") {
      limit = scope === "exam_start" ? 60 : 35;
    } else if (action === "get_sync_meta") {
      limit = 90;
    }
    return count <= limit;
  } catch (err) {
    return true;
  }
}

function rateLimitedArabya_() {
  return jsonArabya_({
    status: "error",
    code: "rate_limited",
    message: "Too many requests. Please retry shortly."
  });
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

function rowMatchesDeleteResultTarget_(row, data) {
  if (!row || !data) return false;
  var recordId = String(data.recordId || "").trim();
  if (recordId && String(row[0] || "").trim() === recordId) return true;
  var targetId = String(data.id || "").trim().toUpperCase();
  var targetExamId = String(data.examId || "").trim();
  if (!targetId || !targetExamId) return false;
  var rowId = String(row[3] || "").trim().toUpperCase();
  var rowExamId = String(row[9] || "").trim();
  if (rowId !== targetId || rowExamId !== targetExamId) return false;
  var targetTs = String(data.timestamp || "").trim();
  if (!targetTs) return true;
  return String(row[1] || "").trim() === targetTs;
}

function deleteArabyaResultFromSheet_(data) {
  var sheet = getArabyaResultsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  ensureArabyaResultsHeaders_(sheet);
  var lastCol = Math.max(sheet.getLastColumn(), ARABYA_RESULTS_HEADERS.length);
  var removed = false;
  for (var r = lastRow; r >= 2; r--) {
    var row = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
    if (!rowMatchesDeleteResultTarget_(row, data)) continue;
    sheet.deleteRow(r);
    removed = true;
    break;
  }
  if (removed) touchArabyaSyncRevision_("delete_result");
  return removed;
}

function applyDeleteResultToDatabase_(data) {
  var db = readArabyaDatabase_();
  if (!Array.isArray(db.deletedResultKeys)) db.deletedResultKeys = [];
  var tombstones = [data.recordId || ""];
  if (data.id && data.examId) {
    tombstones.push("legacy:" + [data.id, data.examId, data.timestamp || ""].join(":"));
  }
  db.deletedResultKeys = unionArabyaDeletedResultKeys_(db.deletedResultKeys, tombstones);
  var recordId = String(data.recordId || "").trim();
  var targetId = String(data.id || "").trim().toUpperCase();
  var targetExamId = String(data.examId || "").trim();
  var targetTs = String(data.timestamp || "").trim();
  db.results = (db.results || []).filter(function(item) {
    if (!item) return false;
    if (recordId && String(item.recordId || "").trim() === recordId) return false;
    if (!recordId && targetId && targetExamId) {
      var sameId = String(item.id || "").trim().toUpperCase() === targetId;
      var sameExam = String(item.examId || "").trim() === targetExamId;
      if (sameId && sameExam) {
        if (!targetTs || String(item.timestamp || "").trim() === targetTs) return false;
      }
    }
    return true;
  });
  db.results = filterArabyaResultsByDeletedKeys_(db.results, db.deletedResultKeys);
  db.updatedAt = new Date().toISOString();
  writeArabyaBackupSheet_(db);
  touchArabyaSyncRevision_("delete_result_db");
  try {
    writeArabyaDatabaseToGitHub_(db);
  } catch (githubErr) {
    db._githubSyncSkipped = String(githubErr.message || githubErr);
  }
  return db;
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
        touchArabyaSyncRevision_("upsert_result");
        return;
      }
    }
  }

  sheet.appendRow(rowValues);
  touchArabyaSyncRevision_("append_result");
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
    data.ipReleasedBy || "",
    stringifyArabyaJsonField_(data.studentAnswers),
    stringifyArabyaJsonField_(data.questionScores),
    stringifyArabyaJsonField_(data.presentedQuestions)
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

function compareArabyaAppVersionStrings_(a, b) {
  var partsA = String(a || "").trim().split(".").map(function(part) { return parseInt(part, 10) || 0; });
  var partsB = String(b || "").trim().split(".").map(function(part) { return parseInt(part, 10) || 0; });
  var len = Math.max(partsA.length, partsB.length);
  for (var i = 0; i < len; i++) {
    var diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestArabyaAppVersion_() {
  var best = "";
  for (var i = 0; i < arguments.length; i++) {
    var current = String(arguments[i] || "").trim();
    if (!current) continue;
    if (!best || compareArabyaAppVersionStrings_(current, best) > 0) best = current;
  }
  return best;
}

function shouldSkipExamMetaMerge_(clientReason) {
  return /exam_submit/i.test(String(clientReason || ""));
}

function mergeArabyaDatabase_(patch, reason, actor, clientReason) {
  if (patch && patch._clientReason) delete patch._clientReason;
  var db = readArabyaDatabase_();
  if (!Array.isArray(db.deletedStudentKeys)) db.deletedStudentKeys = [];
  if (!Array.isArray(db.deletedResultKeys)) db.deletedResultKeys = [];
  if (Array.isArray(patch.deletedStudentKeys)) {
    db.deletedStudentKeys = unionArabyaDeletedStudentKeys_(db.deletedStudentKeys, patch.deletedStudentKeys);
  }
  if (Array.isArray(patch.deletedResultKeys)) {
    db.deletedResultKeys = unionArabyaDeletedResultKeys_(db.deletedResultKeys, patch.deletedResultKeys);
  }
  ["teachers", "students", "exams", "results"].forEach(function(collection) {
    if (!Array.isArray(patch[collection])) return;
    if (collection === "exams" && shouldSkipExamMetaMerge_(clientReason)) return;
    if (reason === "save_backup" && collection === "students") {
      db.students = patch.students.map(function(item) {
        return JSON.parse(JSON.stringify(item || {}));
      });
    } else if (reason === "save_backup" && collection === "results") {
      db.results = patch.results.map(function(item) {
        return JSON.parse(JSON.stringify(item || {}));
      });
    } else {
      db[collection] = mergeArabyaCollection_(db[collection] || [], patch[collection], collection);
    }
  });
  if (db.deletedStudentKeys.length) {
    db.students = filterArabyaStudentsByDeletedKeys_(db.students || [], db.deletedStudentKeys);
  }
  if (db.deletedResultKeys.length) {
    db.results = filterArabyaResultsByDeletedKeys_(db.results || [], db.deletedResultKeys);
  }
  if (patch.examDeviceRegistry) {
    db.examDeviceRegistry = mergeArabyaExamDeviceRegistry_(db.examDeviceRegistry, patch.examDeviceRegistry);
  }
  if (patch.questionBanks && typeof patch.questionBanks === "object") {
    db.questionBanks = deepMergeArabyaObjects_(db.questionBanks || {}, patch.questionBanks);
  }
  if (patch.config && typeof patch.config === "object" && patch.config.appVersion) {
    db.appVersion = pickLatestArabyaAppVersion_(db.appVersion, patch.config.appVersion);
  }
  if (patch.appVersion) {
    db.appVersion = pickLatestArabyaAppVersion_(db.appVersion, patch.appVersion);
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
  touchArabyaSyncRevision_(reason || "merge_db");
  appendArabyaAuditSheet_(reason || "merge_db", actor || {}, stringifyArabyaJsonField_(countArabya_(db)));
  try {
    writeArabyaDatabaseToGitHub_(db);
  } catch (githubErr) {
    db._githubSyncSkipped = String(githubErr.message || githubErr);
  }
  return db;
}

function unionArabyaDeletedStudentKeys_(current, incoming) {
  var set = {};
  (current || []).forEach(function(key) {
    if (key) set[String(key)] = true;
  });
  (incoming || []).forEach(function(key) {
    if (key) set[String(key)] = true;
  });
  return Object.keys(set);
}

function unionArabyaDeletedResultKeys_(current, incoming) {
  return unionArabyaDeletedStudentKeys_(current, incoming);
}

function buildArabyaResultTombstoneSet_(deletedKeys) {
  var set = {};
  (deletedKeys || []).forEach(function(key) {
    if (key) set[String(key)] = true;
  });
  return set;
}

function getArabyaResultTombstoneKey_(result) {
  if (!result) return "";
  var recordId = String(result.recordId || "").trim();
  if (recordId) return recordId;
  return "legacy:" + [result.id || "", result.examId || result.examTitle || "", result.timestamp || ""].join(":");
}

function isArabyaResultDeleted_(result, deletedKeys) {
  if (!result || !deletedKeys || !deletedKeys.length) return false;
  var set = buildArabyaResultTombstoneSet_(deletedKeys);
  if (set[getArabyaResultTombstoneKey_(result)]) return true;
  var recordId = String(result.recordId || "").trim();
  return !!(recordId && set[recordId]);
}

function filterArabyaResultsByDeletedKeys_(results, deletedKeys) {
  return (results || []).filter(function(result) {
    return !isArabyaResultDeleted_(result, deletedKeys);
  });
}

/** نتائج للعميل: ورقة الشيت مصدر الحقيقة — لا تُعاد صفوف محذوفة من JSON القديم */
function buildArabyaResultsForClient_(db) {
  var deletedResultKeys = db.deletedResultKeys || [];
  var deletedStudentKeys = db.deletedStudentKeys || [];
  var sheetResults = readArabyaResultsFromSheet_();
  if (sheetResults.length > 0) {
    var map = {};
    sheetResults.forEach(function(result) {
      if (isArabyaResultDeleted_(result, deletedResultKeys)) return;
      if (isArabyaResultFromDeletedStudent_(result, deletedStudentKeys)) return;
      var key = getArabyaRecordKey_(result, "results");
      map[key] = result;
    });
    return Object.keys(map).map(function(key) { return map[key]; });
  }
  return filterArabyaResultsByDeletedKeys_(db.results || [], deletedResultKeys).filter(function(result) {
    return !isArabyaResultFromDeletedStudent_(result, deletedStudentKeys);
  });
}

function normalizeArabyaStudentId_(studentId) {
  return String(studentId || "").trim().toUpperCase();
}

function sanitizeArabyaStudentCode_(code) {
  var raw = String(code || "").trim();
  if (!raw) return "";
  var compact = raw.replace(/\s+/g, "");
  var digitsOnly = compact.replace(/\D/g, "");
  if (digitsOnly && /^0+$/.test(digitsOnly) && digitsOnly.length >= 5) return "00000";
  return compact;
}

function normalizeArabyaStudentCodeForCompare_(code) {
  return String(sanitizeArabyaStudentCode_(code) || "").toUpperCase();
}

function getArabyaStudentLookupKey_(student) {
  if (!student) return "";
  var code = sanitizeArabyaStudentCode_(student.code || student.accessCode || "");
  var codeKey = normalizeArabyaStudentCodeForCompare_(code);
  if (codeKey && codeKey !== "00000") return "code:" + codeKey;
  var id = normalizeArabyaStudentId_(student.id);
  if (id) return "id:" + id;
  var name = String(student.name || "").trim().replace(/\s+/g, " ").toLowerCase();
  return name ? "name:" + name : String(student.studentKey || "");
}

function isArabyaStudentDeleted_(student, deletedKeys) {
  if (!student || !deletedKeys || !deletedKeys.length) return false;
  var set = {};
  deletedKeys.forEach(function(key) {
    if (key) set[String(key)] = true;
  });
  var lookup = getArabyaStudentLookupKey_(student);
  if (lookup && set[lookup]) return true;
  if (student.studentKey && set[String(student.studentKey)]) return true;
  var id = normalizeArabyaStudentId_(student.id);
  if (id && set["id:" + id]) return true;
  var code = sanitizeArabyaStudentCode_(student.code || student.accessCode);
  if (code && set["code:" + code]) return true;
  var name = String(student.name || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (name && set["name:" + name]) return true;
  return false;
}

function isArabyaResultFromDeletedStudent_(result, deletedStudentKeys) {
  if (!result || !deletedStudentKeys || !deletedStudentKeys.length) return false;
  return isArabyaStudentDeleted_({
    studentKey: result.studentLookupKey || "",
    id: result.id || "",
    name: result.name || "",
    code: result.accessCode || result.code || ""
  }, deletedStudentKeys);
}

function filterArabyaStudentsByDeletedKeys_(students, deletedKeys) {
  return (students || []).filter(function(student) {
    return !isArabyaStudentDeleted_(student, deletedKeys);
  });
}

function parseArabyaSheetTimestamp_(value) {
  if (!value) return null;
  var raw = String(value).trim();
  if (!raw) return null;
  var dt = new Date(raw);
  if (!isNaN(dt.getTime())) return dt.getTime();
  return null;
}

function pickEarlierArabyaTimestamp_(currentTs, candidateTs) {
  var current = String(currentTs || "").trim();
  var candidate = String(candidateTs || "").trim();
  if (!current) return candidate;
  if (!candidate) return current;
  var currentMs = parseArabyaSheetTimestamp_(current);
  var candidateMs = parseArabyaSheetTimestamp_(candidate);
  if (currentMs !== null && candidateMs !== null) {
    return candidateMs < currentMs ? candidate : current;
  }
  return current;
}

function getArabyaStudentKeyFromResult_(result) {
  if (!result) return "";
  if (result.studentLookupKey) return String(result.studentLookupKey);
  return getArabyaStudentLookupKey_({
    id: result.id || "",
    name: result.name || "",
    code: result.accessCode || result.code || ""
  });
}

function findArabyaBackupStudentForDraft_(draft, backupStudents) {
  var i;
  var primaryKey = draft.studentLookupKey || getArabyaStudentLookupKey_(draft);
  if (primaryKey) {
    for (i = 0; i < backupStudents.length; i++) {
      var row = backupStudents[i];
      if ((row.studentKey || getArabyaStudentLookupKey_(row)) === primaryKey) return row;
    }
  }
  var id = normalizeArabyaStudentId_(draft.id);
  var name = String(draft.name || "").trim().replace(/\s+/g, " ").toLowerCase();
  var code = normalizeArabyaStudentCodeForCompare_(sanitizeArabyaStudentCode_(draft.code || ""));
  for (i = 0; i < backupStudents.length; i++) {
    row = backupStudents[i];
    if (id && normalizeArabyaStudentId_(row.id) === id) return row;
    var rowCode = normalizeArabyaStudentCodeForCompare_(sanitizeArabyaStudentCode_(row.code || row.accessCode || ""));
    if (code && rowCode === code && code !== "00000") return row;
    var rowName = String(row.name || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (name && rowName === name && !id && !rowCode) return row;
  }
  return null;
}

/** طلاب للعميل: من نتائج الشيت + دمج النسخة الاحتياطية (تاريخ التسجيل = أقدم تاريخ نتيجة على الشيت) */
function buildArabyaStudentsForClient_(db, sheetResults) {
  var backupStudents = db.students || [];
  var map = {};
  var usedBackupKeys = {};
  var out = [];
  var key;
  var res;
  var draft;
  var existing;
  var backupRow;
  var i;

  (sheetResults || []).forEach(function(result) {
    if (!result || isArabyaResultFromDeletedStudent_(result, db.deletedStudentKeys || [])) return;
    if (!result.name && !result.id && !result.accessCode && !result.code) return;
    key = getArabyaStudentKeyFromResult_(result);
    if (!key) return;
    draft = {
      studentLookupKey: result.studentLookupKey || key,
      name: String(result.name || "").trim(),
      id: normalizeArabyaStudentId_(result.id || ""),
      code: sanitizeArabyaStudentCode_(result.accessCode || result.code || ""),
      email: String(result.email || "").trim(),
      mobile: String(result.mobile || "").trim(),
      timestamp: result.timestamp ? String(result.timestamp) : "",
      clientIp: result.clientIp || "",
      lastKnownIp: result.clientIp || "",
      deviceFingerprint: result.deviceFingerprint || "",
      deviceId: result.deviceId || ""
    };
    if (isArabyaStudentDeleted_(draft, db.deletedStudentKeys || [])) return;
    existing = map[key];
    if (!existing) {
      map[key] = draft;
      return;
    }
    existing.timestamp = pickEarlierArabyaTimestamp_(existing.timestamp, draft.timestamp);
    if (draft.email) existing.email = draft.email;
    if (draft.mobile) existing.mobile = draft.mobile;
    if (draft.lastKnownIp) {
      existing.lastKnownIp = draft.lastKnownIp;
      existing.clientIp = draft.clientIp;
    }
    if (draft.deviceFingerprint) existing.deviceFingerprint = draft.deviceFingerprint;
    if (draft.deviceId) existing.deviceId = draft.deviceId;
  });

  Object.keys(map).forEach(function(mapKey) {
    draft = map[mapKey];
    backupRow = findArabyaBackupStudentForDraft_(draft, backupStudents);
    if (backupRow && backupRow.studentKey) usedBackupKeys[backupRow.studentKey] = true;
    var sheetTs = draft.timestamp || "";
    var backupTs = backupRow && backupRow.timestamp ? String(backupRow.timestamp) : "";
    var mergedTs = sheetTs ? pickEarlierArabyaTimestamp_(sheetTs, backupTs) : backupTs;
    out.push(Object.assign({}, backupRow || {}, draft, {
      studentKey: (backupRow && backupRow.studentKey) || draft.studentLookupKey || getArabyaStudentLookupKey_(draft) || Utilities.getUuid(),
      timestamp: mergedTs || sheetTs || backupTs || ""
    }));
  });

  for (i = 0; i < backupStudents.length; i++) {
    backupRow = backupStudents[i];
    if (!backupRow || isArabyaStudentDeleted_(backupRow, db.deletedStudentKeys || [])) continue;
    if (backupRow.studentKey && usedBackupKeys[backupRow.studentKey]) continue;
    key = backupRow.studentKey || getArabyaStudentLookupKey_(backupRow);
    if (key && map[key]) continue;
    var duplicate = false;
    for (var j = 0; j < out.length; j++) {
      if (findArabyaBackupStudentForDraft_(out[j], [backupRow]) === backupRow) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) out.push(JSON.parse(JSON.stringify(backupRow)));
  }
  return out;
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
    ipReleasedBy: data.ipReleasedBy || "",
    studentAnswers: parseArabyaJsonField_(data.studentAnswers, {}),
    questionScores: parseArabyaJsonField_(data.questionScores, {}),
    presentedQuestions: parseArabyaJsonField_(data.presentedQuestions, [])
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
      ipReleasedBy: String(row[34] || ""),
      studentAnswers: parseArabyaJsonField_(row[35], {}),
      questionScores: parseArabyaJsonField_(row[36], {}),
      presentedQuestions: parseArabyaJsonField_(row[37], [])
    });
  });
  return out.map(normaliseArabyaResult_);
}

/**
 * يُستدعى تلقائياً عند تعديل خلايا الشيت (مشغّل بسيط مرتبط بالجدول).
 * يحدّث مؤشر التغيير ليجلب الموقع التحديث فوراً عبر get_sync_meta.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheetName = e.range.getSheet().getName();
    if (sheetName === "نتائج الطلاب" || sheetName === "ARABYA_BACKUP" || sheetName === "ARABYA_SYNC") {
      touchArabyaSyncRevision_("onEdit:" + sheetName);
    }
  } catch (err) {}
}

function touchArabyaSyncRevision_(reason) {
  var ts = new Date().toISOString();
  try {
    PropertiesService.getScriptProperties().setProperty("ARABYA_CLOUD_REVISION", ts);
  } catch (err) {}
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("ARABYA_SYNC");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("ARABYA_SYNC");
      try {
        sheet.hideSheet();
      } catch (hideErr) {}
    }
    sheet.getRange(1, 1, 1, 2).setValues([[ts, String(reason || "")]]);
  } catch (err2) {}
  return ts;
}

function getArabyaCloudRevision_() {
  try {
    var prop = PropertiesService.getScriptProperties().getProperty("ARABYA_CLOUD_REVISION");
    if (prop) return prop;
  } catch (err) {}
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_SYNC");
    if (sheet) {
      var cell = sheet.getRange(1, 1).getValue();
      if (cell) return String(cell);
    }
  } catch (err2) {}
  try {
    var db = readArabyaDatabase_();
    if (db && db.updatedAt) return String(db.updatedAt);
  } catch (err3) {}
  return "";
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

function getArabyaSyncStats_() {
  var db = readArabyaDatabase_();
  var backupJsonChars = 0;
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_BACKUP");
    if (sheet && sheet.getLastRow() >= 2) {
      backupJsonChars = String(sheet.getRange(sheet.getLastRow(), 2).getValue() || "").length;
    }
  } catch (err) {}
  var qb = db.questionBanks || {};
  var qbTeachers = Object.keys(qb).length;
  var qbItems = 0;
  Object.keys(qb).forEach(function(k) {
    if (Array.isArray(qb[k])) qbItems += qb[k].length;
  });
  return {
    cloudRevision: getArabyaCloudRevision_(),
    appVersion: db.appVersion || "",
    questionBankTeachers: qbTeachers,
    questionBankItems: qbItems,
    backupJsonChars: backupJsonChars,
    teachers: (db.teachers || []).length,
    students: (db.students || []).length,
    exams: (db.exams || []).length,
    results: (db.results || []).length
  };
}

function ensureArabyaAuditSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("ARABYA_AUDIT");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("ARABYA_AUDIT");
    sheet.appendRow(["الوقت", "المستخدم", "الدور", "الإجراء", "التفاصيل"]);
  }
  return sheet;
}

function appendArabyaAuditSheet_(action, actor, detail) {
  try {
    var sheet = ensureArabyaAuditSheet_();
    var user = (actor && (actor.username || actor.name)) || "system";
    var role = (actor && actor.role) || "";
    sheet.appendRow([new Date(), user, role, String(action || ""), String(detail || "").slice(0, 45000)]);
  } catch (err) {}
}

function ensureDeviceRejectSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("رفض دخول الأجهزة");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("رفض دخول الأجهزة");
    sheet.appendRow(["الوقت", "الطالب", "مفتاح الطالب", "الامتحان", "IP", "بصمة الجهاز", "السبب"]);
  }
  return sheet;
}

function appendDeviceRejectSheet_(data) {
  try {
    var sheet = ensureDeviceRejectSheet_();
    sheet.appendRow([
      data.at || new Date(),
      data.studentName || "",
      data.studentLookupKey || "",
      data.examId || "",
      data.clientIp || "",
      data.deviceFingerprint || "",
      data.message || data.reason || ""
    ]);
  } catch (err) {}
}

/** تشغيل يدوي مرة من محرر Apps Script: installArabyaDailyBackupTrigger */
function installArabyaDailyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "dailyArabyaDriveBackup") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyArabyaDriveBackup").timeBased().everyDays(1).atHour(3).create();
}

function dailyArabyaDriveBackup() {
  return dailyArabyaDriveBackup_();
}

function dailyArabyaDriveBackup_() {
  var db = readArabyaDatabase_();
  var folderName = "ARABYA_BACKUPS";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  var tz = Session.getScriptTimeZone() || "Africa/Cairo";
  var stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var fileName = "arabya-backup-" + stamp + ".json";
  var existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);
  folder.createFile(fileName, JSON.stringify(db, null, 2), MimeType.PLAIN_TEXT);
  appendArabyaAuditSheet_("daily_drive_backup", { username: "system", role: "cron" }, fileName);
  return fileName;
}

function jsonArabya_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
