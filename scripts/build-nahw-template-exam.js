#!/usr/bin/env node
/**
 * يعيد توليد js/arabya-template-exams-data.js من:
 *   - imports/تمبلت-الامتحان.docx (196 سؤالاً)
 *   - imports/امتحان-اولى-الفصل-الدراسي-الثاني-Copy.docx (25 اختيار + 30 صواب/خطأ)
 * الاستخدام: node scripts/build-nahw-template-exam.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const sources = [
  {
    docx: path.join(root, "imports", "تمبلت-الامتحان.docx"),
    extract: path.join(root, "imports", "docx_extracted"),
    format: "original"
  },
  {
    docx: path.join(root, "imports", "امتحان-اولى-الفصل-الدراسي-الثاني-Copy.docx"),
    extract: path.join(root, "imports", "docx_copy_extracted"),
    format: "semester2_copy"
  }
];
const outPath = path.join(root, "js", "arabya-template-exams-data.js");
const pyScript = path.join(__dirname, "parse-nahw-docx.py");

for (const src of sources) {
  if (!fs.existsSync(src.docx)) {
    console.error("Missing:", src.docx);
    process.exit(1);
  }
  fs.mkdirSync(src.extract, { recursive: true });
  execSync(`unzip -q -o "${src.docx}" -d "${src.extract}"`);
}

const inputs = sources.map(src => [
  path.join(src.extract, "word", "document.xml"),
  src.format
]);

const summary = execSync(
  `python3 "${pyScript}" ${JSON.stringify(JSON.stringify(inputs))} "${outPath}"`,
  { encoding: "utf8", cwd: root }
);
console.log("Generated", outPath);
console.log(summary.trim());
