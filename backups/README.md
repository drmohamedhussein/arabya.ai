# نسخ احتياطية ARABYA.NET

## backup-2026-06-03-pre-refactor

| العنصر | القيمة |
|--------|--------|
| **التاريخ** | 2026-06-03 |
| **Commit** | `2e934fb` — Enforce exam endsAt deadline during active student sessions |
| **الفرع** | `backup/pre-refactor-2026-06-03-5c00` |
| **Tag** | `backup-2026-06-03-pre-refactor` |

### محتويات هذا المجلد

- `cloud-live-snapshot-2026-06-03.json` — لقطة حية من Google Sheets / Apps Script (`action=get_backup`)
- `repo-db-snapshot-2026-06-03.json` — نسخة من `database/arabya-db.json` وقت النسخ
- `BACKUP-MANIFEST.json` — بيانات التحقق

### السحابة

- تم `save_backup` بنجاح إلى Web App (counts: teachers=1, students=3, exams=3, results=7)
- التسمية: `2026-06-03-pre-refactor`

### الاستعادة

```bash
git checkout backup-2026-06-03-pre-refactor
# أو
git checkout backup/pre-refactor-2026-06-03-5c00
```
