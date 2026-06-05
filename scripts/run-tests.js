#!/usr/bin/env node
/**
 * تشغيل كل اختبارات المشروع + فحص صياغة app.js
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

console.log("==> node --check app.js");
execSync("node --check app.js", { cwd: root, stdio: "inherit" });

const testsDir = path.join(root, "tests");
const files = fs.readdirSync(testsDir)
  .filter(f => f.endsWith(".test.js"))
  .sort();

let failed = 0;
for (const file of files) {
  const full = path.join(testsDir, file);
  console.log(`==> ${file}`);
  try {
    execSync(`node "${full}"`, { cwd: root, stdio: "inherit" });
  } catch (e) {
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} test file(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${files.length} test files passed.`);
