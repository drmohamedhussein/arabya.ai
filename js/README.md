# وحدات ARABYA.NET (تقسيم تدريجي لـ app.js)

| الملف | المسؤولية |
|--------|-----------|
| `arabya-utils.js` | إصدارات، `createRecordId`، `delayMs`، `escapeHtml`، `getAppBaseUrl` |
| `arabya-students.js` | تطبيع هوية الطلاب، البحث، مطابقة النتائج، التحقق من الإدخال |
| `arabya-exam-config.js` | تهيئة إعدادات الامتحان، حدود الغش، إلغاء الامتحان |
| `arabya-security.js` | تشفير كلمات مرور المعلمين (SHA-256 + salt)، جلسة خمول (ساعتان) |
| `arabya-question-bank.js` | بنوك أسئلة مشتركة: حفظ، دمج، استيراد/تصدير JSON و CSV |
| `arabya-toast.js` | إشعارات نجاح/فشل المزامنة |
| `arabya-offline-queue.js` | طابور رفع عند انقطاع الشبكة |
| `arabya-platform-sync.js` | صحة المزامنة، تعارضات، قاعة امتحان، قائمة IP |
| `arabya-realtime-bridge.js` | جسر Firebase/Supabase (اختياري — افتراضي polling) |
| `arabya-analytics.js` | تحليلات: متوسط الدرجات، أصعب الأسئلة، معدل الغش، تصدير CSV |
| `arabya-cloud-api.js` | Google Apps Script: نسخ احتياطي، دمج السحابة، رفع النتائج |
| `arabya-cloud-sync.js` | مزامنة دورية موحّدة (polling + debounced push) |
| `arabya-exam-device.js` | بصمة الجهاز، سجل الأجهزة، سياسة IP المشترك |
| `arabya-exam-anticheat.js` | منع الغش، عقوبات المشغل، `setupAntiCheatHandlers` |
| `arabya-exam-runner.js` | بوابة الطالب، مشغل الامتحان، استعلام النتائج |

## ترتيب التحميل

يُحمَّل كل ما سبق في `index.html` **قبل** `app.js`. `app.js` (~6K سطر) يبقى للوحة المعلم، التوجيه، والتهيئة.

## إعادة الاستخراج

```bash
python3 scripts/extract-app-modules.py
npm run verify
```
