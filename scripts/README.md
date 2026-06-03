# سكربتات التطوير

## التشغيل اليومي

من جذر المشروع:

```bash
npm run verify
```

يشمل:

- `node --check` على `app.js` و `questions.js` والوحدات الجديدة
- `node --test tests/*.test.js`

## النسخ الاحتياطي السحابي

```bash
node scripts/run-cloud-backup.js
```

يجلب لقطة من Google Apps Script ويرفع `save_backup` مع تسمية تاريخية.

## الأرشيف (`archive/`)

ملفات `patch_*.py` هي **أدوات تطوير تاريخية** استُخدمت لتطبيق تعديلات على `app.js` قبل اعتماد الوحدات في `js/`.

- **ليست جزءاً من تشغيل الموقع** (GitHub Pages لا ينفّذ Python).
- **لا تحذف** إلا بعد التأكد أن المنطق موجود في `app.js` أو `js/`.
- للمراجعة أو إعادة تطبيق patch قديم: `python3 scripts/archive/patch_*.py`

## إضافة وحدة JS جديدة

1. أنشئ الملف في `js/`.
2. صدّر الدوال على `window` (أو `window.ArabyaX`) للتوافق مع `app.js`.
3. أضف `<script>` في `index.html` **قبل** `app.js`.
4. حدّث `js/README.md`.
5. شغّل `npm run verify`.
