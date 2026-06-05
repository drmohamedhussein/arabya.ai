# دليل النسخة الاحتياطية — ARABYA.NET
## `backup-2026-06-05-pre-security-fixes`

**تاريخ الإنشاء:** 2026-06-05  
**Git commit:** `6472aa8f124f02aea08079f313a6a3004f48d1a0`  
**الفرع الاحتياطي:** `backup/pre-security-fixes-2026-06-05-e0f2`  
**الوسم (Tag):** `backup-2026-06-05-pre-security-fixes`

---

## ماذا تحتوي هذه النسخة؟

| المكوّن | الموقع | مُضمَّن؟ |
|---------|--------|---------|
| كل ملفات الكود (app.js, index.html, js/, tests/, scripts/, integrations/) | المستودع + `FULL_REPO_SNAPSHOT.tar.gz` | ✅ نعم |
| قاعدة البيانات المركزية على GitHub | `database/arabya-db.json` | ✅ نعم (نسخة المستودع) |
| الصور والتنسيقات | logo.png, style.css, ... | ✅ نعم |
| بيانات المتصفح (localStorage) | على جهازك فقط | ⚠️ **يجب حفظها يدوياً** |
| Google Sheets | السحابة | ⚠️ **يجب التحقق يدوياً** |
| Google Apps Script (الكود المنشور) | Google Drive | ⚠️ **نسخة منفصلة** |
| GitHub Token | Script Properties في GAS | 🔒 **لا يُحفظ أبداً في المستودع** |

---

## ⚠️ بيانات يجب أن تحفظها أنت بنفسك (لا تُوجد في Git)

### 1. بيانات localStorage في المتصفح (الأهم)

هذه هي النسخة **الحية** التي يعمل بها الموقع فعلياً على جهازك. قد تكون أحدث من `database/arabya-db.json`.

**الطريقة أ — من لوحة المعلم (الأسهل):**
1. افتح الموقع وسجّل دخول المعلم.
2. اذهب إلى تبويب **النسخ الاحتياطي**.
3. اضغط **تصدير قاعدة البيانات كاملة (JSON)**.
4. احفظ الملف باسم واضح، مثلاً:  
   `arabya_full_export_2026-06-05.json`

**الطريقة ب — تصدير كل localStorage (أشمل):**
1. افتح الموقع في المتصفح الذي تستخدمه يومياً.
2. F12 → Console.
3. الصق محتوى الملف `LOCALSTORAGE_EXPORT.js` واضغط Enter.
4. احفظ الملف المُنزّل: `arabya_localStorage_backup_YYYY-MM-DD.json`

**مفاتيح localStorage المهمة:**

```
arabya_teachers_db          ← المعلمون + السوبر أدمن + كلمات المرور
arabya_students_db          ← الطلاب وأكواد الاشتراك
arabya_exams_db             ← الامتحانات والأسئلة والإجابات الصحيحة
arabya_results_db           ← نتائج الطلاب
arabya_teacher_config       ← إعدادات المزامنة + رابط Google Sheets
arabya_teacher_profile      ← ملف المعلم
arabya_exam_device_registry ← سجل أجهزة الامتحان
arabya_deleted_student_keys ← طلاب محذوفون (tombstones)
arabya_deleted_result_keys  ← نتائج محذوفة (tombstones)
arabya_question_banks_teacher_* ← بنوك الأسئلة لكل معلم
arabya_offline_post_queue   ← طابور رفع معلّق
arabya_cloud_revision       ← رقم مراجعة السحابة
```

> **تنبيه:** بيانات `github.io` و `arabya.net` منفصلة — صدّر من كل نطاق تستخدمه.

### 2. Google Sheets — ملف `ARABYA.NET Database`

- افتح ملف Google Sheets المرتبط بالمنصة.
- **File → Download → Microsoft Excel (.xlsx)** أو انسخ الورقة يدوياً.
- احفظ باسم: `ARABYA_Sheets_backup_2026-06-05.xlsx`

### 3. Google Apps Script المنشور

- افتح مشروع Apps Script في Google Drive.
- **File → Make a copy** (أو انسخ الكود من `integrations/google-apps-script-backend.gs`).
- من **Project Settings → Script Properties** سجّل أسماء الخصائص (لا تنسخ القيم الحساسة في ملف عام):
  - `GITHUB_TOKEN` ← **احتفظ به في مدير كلمات مرور — لا تشاركه**
  - `GITHUB_REPO`
  - `GITHUB_BRANCH`
  - `GITHUB_DB_PATH`
- من **Deploy → Manage deployments** انسخ رابط Web App `/exec`.

### 4. نسخة من رابط المزامنة

احفظ رابط Web App الحالي (ينتهي بـ `/exec`) في مكان آمن — موجود في:
- لوحة المعلم → تبويب الربط بـ Google Sheets
- أو داخل `integrationConfig.googleFormUrl` في قاعدة البيانات

---

## كيف تستعيد نسخة المستودع (الكود)

### الطريقة 1 — من Git Tag (موصى بها)

```bash
git fetch origin --tags
git checkout backup-2026-06-05-pre-security-fixes
# أو إنشاء فرع من الوسم:
git checkout -b restore-from-backup backup-2026-06-05-pre-security-fixes
```

### الطريقة 2 — من الفرع الاحتياطي

```bash
git fetch origin backup/pre-security-fixes-2026-06-05-e0f2
git checkout backup/pre-security-fixes-2026-06-05-e0f2
```

### الطريقة 3 — من الأرشيف المضغوط

```bash
tar -xzf backups/2026-06-05-pre-security-fixes/FULL_REPO_SNAPSHOT.tar.gz -C /مسار/الاستعادة
```

### الطريقة 4 — استعادة commit محدد

```bash
git checkout 6472aa8f124f02aea08079f313a6a3004f48d1a0
```

---

## كيف تستعيد البيانات (المعلمون / الطلاب / الامتحانات / النتائج)

### من تصدير لوحة المعلم (JSON كامل)

1. افتح الموقع بعد استعادة الكود.
2. سجّل دخول المعلم.
3. تبويب **النسخ الاحتياطي** → **استيراد قاعدة البيانات**.
4. اختر الملف `arabya_full_export_2026-06-05.json`.
5. اختر **استبدال كامل** أو **دمج آمن** حسب الحاجة.

### من ملف localStorage

1. افتح F12 → Console على الموقع المستعاد.
2. الصق:

```javascript
// استبدل BACKUP_DATA بمحتوى ملف arabya_localStorage_backup_*.json
var BACKUP_DATA = { /* الصق هنا كائن keys من الملف */ };
Object.keys(BACKUP_DATA.keys || BACKUP_DATA).forEach(function(key) {
  var val = (BACKUP_DATA.keys || BACKUP_DATA)[key];
  localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
});
location.reload();
```

### من Google Sheets / السحابة

1. بعد استعادة الكود، الصق رابط Web App في تبويب الربط.
2. اضغط **استعادة من السحابة** أو **اختبار المزامنة**.
3. البيانات تُسحب من `get_backup` في Apps Script.

### استعادة `database/arabya-db.json` على GitHub

```bash
cp backups/2026-06-05-pre-security-fixes/database/arabya-db.json database/arabya-db.json
git add database/arabya-db.json
git commit -m "Restore database from backup-2026-06-05-pre-security-fixes"
git push origin main
```

---

## التحقق بعد الاستعادة

```bash
node --check app.js
node --test tests/*.test.js
```

من المتصفح (Console):

```javascript
arabya_diagnose && arabya_diagnose();
```

أو من لوحة المعلم تحقق من:
- عدد المعلمين والطلاب والامتحانات والنتائج
- رابط المزامنة يعمل
- امتحان تجريبي يفتح ويُسلّم

---

## قائمة التحقق السريعة قبل بدء الإصلاحات

- [ ] نسخة Git: tag `backup-2026-06-05-pre-security-fixes` موجودة على GitHub
- [ ] أرشيف `FULL_REPO_SNAPSHOT.tar.gz` محفوظ محلياً
- [ ] تصدير JSON كامل من لوحة المعلم
- [ ] تصدير localStorage عبر `LOCALSTORAGE_EXPORT.js`
- [ ] نسخة Google Sheets (.xlsx)
- [ ] نسخة Apps Script + رابط `/exec`
- [ ] `GITHUB_TOKEN` محفوظ في مدير كلمات مرور (ليس في ملف نصي)

---

## محتويات هذا المجلد

```
backups/2026-06-05-pre-security-fixes/
├── RESTORE.md                  ← هذا الملف
├── MANIFEST.json               ← قائمة الملفات + SHA256
├── FILE_LIST.txt               ← قائمة مسارات الملفات
├── GIT_COMMIT.txt              ← hash الـ commit
├── GIT_LOG.txt                 ← تفاصيل آخر commit
├── FULL_REPO_SNAPSHOT.tar.gz   ← أرشيف كامل للمشروع
├── LOCALSTORAGE_EXPORT.js      ← سكربت تصدير المتصفح
└── database/
    └── arabya-db.json          ← نسخة قاعدة البيانات من المستودع
```
