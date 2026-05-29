# بوابة arabya.ai | منصة تعليم اللغة العربية والامتحانات الأكاديمية والمواءمة

منصة ويب تفاعلية متكاملة باللغة العربية، مصممة خصيصاً لموقع **arabya.ai** لدعم المعلمين والطلاب في دراسة فروع اللغة الشريفة (النحو، البلاغة، الأدب) وإجراء تقييمات أكاديمية تفاعلية مقالية وموضوعية مؤمنة بالكامل ومزامنتها تلقائياً مع **Google Sheets** و **Google Forms**.

المنصة مهيأة ومتوافقة بالكامل مع متطلبات **إمكانية الوصول العالمية (Accessibility)** لتمكين الطلاب المكفوفين من أداء امتحاناتهم بيسر وسهولة.

---

## ♿ إتاحة الوصول وتسهيل الحركة للمكفوفين (Accessibility)
تمت مواءمة مشغل الامتحانات وتصميمه بناء على معايير W3C WAI-ARIA ليتوافق تماماً مع قارئات الشاشة (مثل NVDA و JAWS و VoiceOver):
1. **التنقل الكامل بلوحة المفاتيح (Keyboard Friendly):**
   - يستطيع الطالب التنقل بمرونة بين عناصر الصفحة باستخدام زر `Tab`.
   - كروت الخيارات مصممة لتقبل التركيز وتدعم الاختيار عبر الضغط على مفتاح `Enter` أو مفتاح `المسافة (Space)`.
2. **إدارة التركيز التلقائي (Focus Management):**
   - عند انتقال الطالب للسؤال التالي، يتم نقل تركيز المتصفح تلقائياً إلى نص السؤال الجديد لتقوم قارئة الشاشة بنطقه فوراً دون الحاجة للبحث بالصفحة.
3. **تنبيهات صوتية ذكية للوقت (Aria-Live Announcements):**
   - لتفادي التشويش الناتج عن قراءة العداد التنازلي ثانية بثانية، تم حظر قراءة الثواني للمكفوفين برمجياً.
   - تم تفعيل حقل تنبيه ذكي بنوع `aria-live="assertive"` يعلن منطوقاً عن الوقت المتبقي فقط عند بلوغ العداد (30 ثانية، 10 ثوانٍ، و 5 ثوانٍ).
4. **دعم المسميات والصفات بدقة:**
   - الحقول والخيارات مجهزة بأوسمة `role="button"` و `role="radiogroup"` و `aria-label` و `aria-pressed` لتعريف قارئ الشاشة بوضوح تام بالحالة الحالية لتحديد الطالب.

---

## 🛠️ إدارة وحساب الدرجات المطور (Proportional Grading System)
1. **تعديل بيانات الامتحان لاحقاً:** 
   - يتيح التطبيق للمعلم مراجعة وتحديث وتعديل أي بيانات أكاديمية للامتحانات التي سبق وأنشأها (الاسم، المادة، الفرقة، الكلية، الجامعة، ونوع الامتحان) بالإضافة لتعديل المجموع النهائي.
2. **درجة كل سؤال (Question Weight):**
   - يستطيع المعلم من خلال محرر الأسئلة تحديد "درجة / وزن" مخصص لكل نقطة على حدة (مثال: سؤال مقالي بـ 20 درجة، وسؤال اختيار بـ 10 درجات).
3. **معادلة حساب النتيجة النسبية:**
   - يقوم النظام بحساب الدرجة النسبية المحققة للطالب بناءً على مجموع النقاط المحققة مقسومة على مجموع نقاط الأسئلة الموضوعية مضروباً في المجموع النهائي للاختبار:
     $$\text{الدرجة المحققة} = \left( \frac{\text{مجموع نقاط الأسئلة الصحيحة}}{\text{مجموع النقاط القصوى للأسئلة الموضوعية}} \right) \times \text{المجموع النهائي للاختبار}$$
   - **مثال:** اختبار مجموعه النهائي 100 درجة، يحتوي على أسئلة موضوعية مجموع أوزانها 50 نقطة. إذا حصل الطالب على 40 نقطة، ستكون درجته المحققة هي 80 من 100.
   - **الأسئلة المقالية:** يتم حفظ الإجابات النصية وتصنيفها في ملفات النتائج بـ "بانتظار تصحيح المعلم" لتقييمها يدوياً وإضافتها للمجموع.

---

## 🔄 المزامنة والتكامل مع Google
- **تصدير الامتحان إلى Google Form:** يقوم النظام بإنتاج كود **Google Apps Script** لإنشاء النموذج بالأسئلة والأوزان تلقائياً بضغطة زر.
- **استيراد الامتحان من Google Form:** نسخ كود مصدر صفحة معاينة النموذج ولصقها ليعاد بناؤه بالمنصة.
- **مزامنة وتصدير واستيراد النتائج:** تصدير سجل درجات الطلاب كملف CSV أو JSON، واستيراد ملف JSON لدمجه في قاعدة البيانات المحلية.
- **المزامنة التلقائية المباشرة مع Google Sheets:** 
  يمكنك ربط نتائج الامتحانات بجوجل شيت مباشرة عبر إنشاء Web App في جوجل درايف. انسخ الكود التالي وضعه في محرر البرمجة الملحق بملف Google Sheet الخاص بك:

```javascript
// كود Google Apps Script للمزامنة التلقائية والنسخ الاحتياطي - ARABYA.NET
function doPost(e) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents || "{}");
    
    if (!data.action || data.action === "add_result") {
      var resultsSheet = spreadsheet.getSheetByName("نتائج الطلاب") || spreadsheet.insertSheet("نتائج الطلاب");
      if (resultsSheet.getLastRow() === 0) {
        resultsSheet.appendRow(["معرف السجل", "التاريخ", "اسم الطالب", "ID", "كود الاشتراك", "الامتحان", "الجامعة", "الكلية", "الفرقة", "النوع", "النتيجة", "التفاصيل"]);
      }
      resultsSheet.appendRow([
        data.recordId || "",
        data.timestamp || new Date(),
        data.name || "",
        data.id || "",
        data.subscriptionCode || "",
        data.examTitle || "",
        data.university || "",
        data.faculty || "",
        data.level || "",
        data.examType || "",
        data.score || "",
        data.details || ""
      ]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_backup") {
      var backupSheet = spreadsheet.getSheetByName("ARABYA_BACKUP") || spreadsheet.insertSheet("ARABYA_BACKUP");
      backupSheet.clear();
      backupSheet.appendRow(["Timestamp", "Database Backup JSON"]);
      backupSheet.appendRow([new Date(), JSON.stringify(data.data || {})]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "ignored" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    if (e.parameter.action === "get_backup") {
      var backupSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ARABYA_BACKUP");
      if (!backupSheet || backupSheet.getLastRow() < 2) {
        throw new Error("لا توجد نسخة احتياطية محفوظة بعد.");
      }
      var backupData = backupSheet.getRange(2, 2).getValue();
      return ContentService.createTextOutput(JSON.stringify({ status: "success", data: JSON.parse(backupData) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("ARABYA.NET sync endpoint is active");
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```
*قم بنشر الكود كـ **Web App** مع إتاحة الوصول لـ "Anyone" (الجميع)، ثم الصق رابط الويب الناتج في خانة "رابط المزامنة" داخل لوحة المعلم.*

---

## 🔐 نظام الحسابات وأكواد الاشتراك المطور
1. **بوابة المعلم الجديدة:**
   - إمكانية تسجيل معلمين متعددين بحسابات مستقلة لكل معلم (الاسم، اسم المستخدم، التخصص، كلمة المرور).
   - توليد **رابط الدخول التلقائي** للمعلم؛ بمجرد نسخه وحفظه في المفضلة، سيتم فتح لوحة التحكم للمعلم تلقائياً دون كتابة كلمة المرور.
2. **بوابة الطلاب وأكواد الاشتراك:**
   - إمكانية تسجيل الطلاب الجدد محلياً وتعيين أكواد اشتراكاتهم.
   - إمكانية إدخال الطلاب لأكواد الاشتراك أثناء الاختبار، لكي يتمكنوا لاحقاً من الاستعلام عن نتائجهم باستخدام (الاسم بالكامل، أو رقم الـ ID، أو كود الاشتراك).
   - لوحة تحكم متكاملة للمعلم لإضافة، حذف، تصدير، واستيراد أكواد الطلاب بصيغة JSON.

---

## 👨‍💻 التطوير والدعم الفني (EgyWebDev)
* تم تطوير هذه المنصة وتجهيزها بالكامل للرفع على جيت هب من خلال **EGYWEBDEV**.
* الدعم الفني والتواصل المباشر (واتساب): [**+20 10 37890525**](https://wa.me/201037890525)

---

## 📦 تشغيل ورفع الموقع
* لتجربة المنصة محلياً، افتح ملف `index.html` مباشرة على متصفحك.
* لرفع المنصة للطلاب على الإنترنت مجاناً، ننصح بـ:
  * رفع الملفات إلى مستودع GitHub وتفعيل **GitHub Pages** (مجاني تماماً لروابط ثابتة).
  * أو الرفع على منصة **Vercel** أو **Netlify** بضغطة زر واحدة.
* يرجى التوصية بضبط مجلد المشروع `online_exam_portal` كساحة العمل النشطة (Active Workspace) عند فتحه في محرر الأكواد.

### إعداد GitHub Pages مع نطاق ARABYA.NET
* يحتوي المشروع على ملف `CNAME` بالقيمة `arabya.net` حتى يحافظ GitHub Pages على ربط النطاق المخصص بعد كل رفع.
* روابط الامتحانات المباشرة تُنشأ بصيغة آمنة للنطاق الجذري مثل: `https://arabya.net/?exam=EXAM_ID&teacher=USERNAME`.
* ملف `404.html` يحافظ على الروابط القديمة أو الروابط ذات المسار المباشر مثل `https://arabya.net/EXAM_ID` بتحويلها إلى مسار hash يمكن للتطبيق قراءته.
* `_redirects` مفيد عند النشر على Netlify، أما GitHub Pages فيعتمد على `404.html`.
* بيانات `localStorage` منفصلة حسب النطاق؛ أي بيانات أُنشئت على `github.io` لن تظهر تلقائياً على `arabya.net` إلا بعد تصدير النسخة الاحتياطية واستيرادها أو تفعيل مزامنة Google Sheets.
