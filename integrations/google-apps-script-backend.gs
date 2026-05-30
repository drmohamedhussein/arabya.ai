/**
 * ARABYA.NET - Google Apps Script Backend (Final)
 *
 * يدعم:
 * - add_result   : تسجيل/تحديث نتيجة طالب في ورقة "نتائج الطلاب"
 * - save_backup  : حفظ نسخة JSON كاملة في ورقة "ARABYA_BACKUP"
 * - get_backup   : استرجاع النسخة الاحتياطية (GET ?action=get_backup)
 *
 * خطوات النشر:
 * 1) Extensions → Apps Script → الصق هذا الكود بالكامل
 * 2) Deploy → New deployment → Web app
 * 3) Execute as: Me | Who has access: Anyone
 * 4) انسخ رابط /exec إلى تبويب "الربط بـ Google Sheets" في ARABYA.NET
 */

var ARABYA_RESULTS_HEADERS = [
  "معرف السجل",
  "التاريخ والوقت",
  "اسم الطالب",
  "رقم ID",
  "كود الاشتراك",
  "مفتاح الطالب",
  "البريد",
  "الموبايل",
  "الامتحان",
  "معرف الامتحان",
  "الجامعة",
  "الكلية",
  "الفرقة",
  "النوع",
  "الحالة",
  "النتيجة",
  "التفاصيل"
];

function doPost(e) {
  try {
    var payload = parseArabyaPayload_(e);
    var action = payload.action || "add_result";

    if (action === "add_result") {
      upsertArabyaResult_(payload);
      return jsonArabya_({ status: "success", action: action, message: "تم تسجيل/تحديث النتيجة بنجاح" });
    }

    if (action === "save_backup") {
      saveArabyaBackup_(payload.data || {});
      return jsonArabya_({ status: "success", action: action, message: "تم حفظ النسخة الاحتياطية بنجاح" });
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
      var data = readArabyaBackup_();
      if (!data) {
        return jsonArabya_({ status: "error", message: "لا توجد نسخة احتياطية سحابية بعد." });
      }
      return jsonArabya_({ status: "success", data: data });
    }
    return jsonArabya_({ status: "active", service: "ARABYA.NET backend", version: 3 });
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

function getResultsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("نتائج الطلاب");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("نتائج الطلاب");
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ARABYA_RESULTS_HEADERS);
    sheet.getRange(1, 1, 1, ARABYA_RESULTS_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#1e293b")
      .setFontColor("#ffffff");
  }
  return sheet;
}

function buildResultRow_(payload) {
  return [
    payload.recordId || "",
    payload.timestamp || new Date().toLocaleString("ar-EG"),
    payload.name || "",
    payload.id || "",
    payload.subscriptionCode || payload.accessCode || "",
    payload.studentLookupKey || "",
    payload.email || "",
    payload.mobile || "",
    payload.examTitle || "",
    payload.examId || "",
    payload.university || "",
    payload.faculty || "",
    payload.level || "",
    payload.examType || "",
    payload.status || (payload.isManualGradeUpdate ? "updated" : "completed"),
    payload.score || "",
    payload.details || ""
  ];
}

function upsertArabyaResult_(payload) {
  var sheet = getResultsSheet_();
  var rowValues = buildResultRow_(payload);
  var recordId = String(payload.recordId || "").trim();

  if (recordId) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === recordId) {
          sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
          return;
        }
      }
    }
  }

  sheet.appendRow(rowValues);
}

function saveArabyaBackup_(data) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("ARABYA_BACKUP");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("ARABYA_BACKUP");
  }
  sheet.clear();
  sheet.appendRow(["Timestamp", "Database Backup JSON"]);
  sheet.appendRow([new Date().toLocaleString("ar-EG"), JSON.stringify(data)]);
}

function readArabyaBackup_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("ARABYA_BACKUP");
  if (!sheet || sheet.getLastRow() < 2) return null;
  var raw = sheet.getRange(2, 2).getValue();
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function jsonArabya_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
