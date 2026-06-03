#!/usr/bin/env node
/**
 * نسخة احتياطية سحابية: جلب get_backup ثم save_backup مع تسمية.
 * الاستخدام: node scripts/run-cloud-backup.js [label]
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_URL =
  "https://script.google.com/macros/s/AKfycbys8gg5jrscGI4C7AJjg7Zl4p7U06dR2lxQIs1-CJjTLo_ZTQqzxeyPKykS_ZdhSqn1/exec";

const syncUrl = process.env.ARABYA_SYNC_URL || DEFAULT_URL;
const label = process.argv[2] || `manual-${new Date().toISOString().slice(0, 10)}`;

async function main() {
  const backupsDir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const getRes = await fetch(`${syncUrl}?action=get_backup`);
  const snap = await getRes.json();
  if (snap.status !== "success") {
    throw new Error(`get_backup failed: ${JSON.stringify(snap)}`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const snapPath = path.join(backupsDir, `cloud-live-snapshot-${stamp}.json`);
  fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2));

  const data = snap.data || {};
  data.backupLabel = label;
  data.updatedAt = new Date().toISOString();

  const saveRes = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "save_backup",
      data,
      actor: { username: "TEACHER2026", role: "super_admin", reason: label }
    })
  });
  const saveBody = await saveRes.json();
  console.log("snapshot:", snapPath);
  console.log("save_backup:", JSON.stringify(saveBody));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
