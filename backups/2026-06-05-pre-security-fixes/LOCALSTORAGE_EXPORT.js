/**
 * ARABYA.NET — تصدير كل بيانات localStorage من المتصفح
 *
 * الاستخدام:
 * 1. افتح https://arabya.net (أو نسختك المحلية) في المتصفح الذي تستخدمه فعلياً.
 * 2. سجّل دخول المعلم إن لزم (لتضمين الجلسة النشطة).
 * 3. افتح أدوات المطور (F12) → Console.
 * 4. الصق هذا الملف بالكامل واضغط Enter.
 * 5. سيُنزّل ملف JSON باسم: arabya_localStorage_backup_YYYY-MM-DD.json
 *
 * احفظ هذا الملف مع أرشيف المستودع — لا يمكن استخراجه من GitHub وحده.
 */
(function exportArabyaLocalStorage() {
  var PREFIXES = [
    "arabya_"
  ];
  var snapshot = {
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    hostname: location.hostname,
    userAgent: navigator.userAgent,
    keys: {},
    keyList: []
  };

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (!key) continue;
    var isArabya = PREFIXES.some(function (p) { return key.indexOf(p) === 0; });
    if (!isArabya) continue;
    try {
      var raw = localStorage.getItem(key);
      try {
        snapshot.keys[key] = JSON.parse(raw);
      } catch (e) {
        snapshot.keys[key] = raw;
      }
      snapshot.keyList.push(key);
    } catch (err) {
      snapshot.keys[key] = "[unreadable: " + String(err.message || err) + "]";
    }
  }

  snapshot.keyList.sort();
  snapshot.keyCount = snapshot.keyList.length;

  var counts = {};
  ["arabya_teachers_db", "arabya_students_db", "arabya_exams_db", "arabya_results_db"].forEach(function (k) {
    var v = snapshot.keys[k];
    counts[k] = Array.isArray(v) ? v.length : (v ? "object" : 0);
  });
  snapshot.counts = counts;

  var stamp = new Date().toISOString().slice(0, 10);
  var blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "arabya_localStorage_backup_" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  console.log("ARABYA localStorage backup exported:", snapshot.keyCount, "keys", counts);
  alert(
    "تم تصدير " + snapshot.keyCount + " مفتاحاً من localStorage.\n\n" +
    "المعلمون: " + (counts.arabya_teachers_db || 0) + "\n" +
    "الطلاب: " + (counts.arabya_students_db || 0) + "\n" +
    "الامتحانات: " + (counts.arabya_exams_db || 0) + "\n" +
    "النتائج: " + (counts.arabya_results_db || 0) + "\n\n" +
    "احفظ الملف المُنزّل مع نسخة المستودع الاحتياطية."
  );
})();
