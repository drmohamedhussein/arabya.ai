# وحدات ARABYA.NET (تقسيم تدريجي لـ app.js)

| الملف | المسؤولية |
|--------|-----------|
| `arabya-security.js` | تشفير كلمات مرور المعلمين (SHA-256 + salt)، جلسة خمول (ساعتان) |
| `arabya-question-bank.js` | بنوك أسئلة مشتركة: حفظ، دمج، استيراد/تصدير JSON و CSV (استيراد CSV إلى بنك أو مباشرة في الامتحان) |
| `arabya-template-exams-data.js` | بيانات امتحانات قوالب جاهزة (مثل امتحان النحو الشامل) |
| `arabya-template-exams.js` | حقن امتحانات القوالب دون المساس بالامتحانات المحفوظة |
| `arabya-toast.js` | إشعارات نجاح/فشل المزامنة |
| `arabya-offline-queue.js` | طابور رفع عند انقطاع الشبكة |
| `arabya-platform-sync.js` | صحة المزامنة، تعارضات، قاعة امتحان، قائمة IP |
| `arabya-realtime-bridge.js` | جسر Firebase/Supabase (اختياري — افتراضي polling) |
| `arabya-analytics.js` | تحليلات: متوسط الدرجات، أصعب الأسئلة، معدل الغش، تصدير CSV |

يُحمَّل الترتيب في `index.html` قبل `app.js`. المنطق الأساسي ما زال في `app.js`؛ يمكن نقل المزيد تدريجياً (auth، sync، anti-cheat) دون كسر النشر على GitHub Pages.
