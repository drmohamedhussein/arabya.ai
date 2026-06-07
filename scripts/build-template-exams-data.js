#!/usr/bin/env node
/**
 * يعيد توليد js/arabya-template-exams-data.js من جميع امتحانات القوالب:
 *   - امتحان النحو (تمبلت + Copy)
 *   - امتحان اللغة العربية (آداب Copy + مذكرة) مع إزالة التكرار بين الملفين
 * الاستخدام: node scripts/build-template-exams-data.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "js", "arabya-template-exams-data.js");
const pyScript = path.join(__dirname, "parse-docx-exam.js".replace(".js", ".py"));

const sourceSets = [
  {
    key: "nahw",
    sources: [
      {
        docx: path.join(root, "imports", "تمبلت-الامتحان.docx"),
        extract: path.join(root, "imports", "docx_extracted"),
        format: "original",
        label: "تمبلت-الامتحان.docx"
      },
      {
        docx: path.join(root, "imports", "امتحان-اولى-الفصل-الدراسي-الثاني-Copy.docx"),
        extract: path.join(root, "imports", "docx_copy_extracted"),
        format: "semester2_copy",
        label: "امتحان-اولى-الفصل-الدراسي-الثاني-Copy.docx"
      }
    ],
    dedupeBetweenFiles: false,
    exam: {
      id: "nahw_comprehensive_year1",
      title: "امتحان النحو والصرف الشامل للفرقة الأولى",
      subject: "النحو والصرف",
      university: "جامعة أسيوط",
      faculty: "الفرقة الأولى — نحو عام",
      level: "الفرقة الأولى",
      examType: "نهائي",
      timeLimit: 180,
      shuffleQuestions: true,
      questionCount: "",
      maxCheatAttempts: 5,
      endsAt: "",
      teacher: "",
      templateRevision: 2
    }
  },
  {
    key: "arabic",
    sources: [
      {
        docx: path.join(root, "imports", "adab-semester2-copy.docx"),
        extract: path.join(root, "imports", "adab_semester2_extracted"),
        format: "semester2_copy",
        label: "آداب جميع الشعب الفصل الدراسي الثاني- Copy.docx"
      },
      {
        docx: path.join(root, "imports", "mudhakara.docx"),
        extract: path.join(root, "imports", "mudhakara_extracted"),
        format: "semester2_copy",
        label: "مذكرة.docx"
      }
    ],
    dedupeBetweenFiles: true,
    exam: {
      id: "arabic_comprehensive_year1",
      title: "امتحان اللغة العربية الشامل لجميع الأقسام للفرقة الأولى",
      subject: "اللغة العربية",
      university: "جامعة أسيوط",
      faculty: "الفرقة الأولى — جميع الأقسام",
      level: "الفرقة الأولى",
      examType: "نهائي",
      timeLimit: 180,
      shuffleQuestions: true,
      questionCount: "",
      maxCheatAttempts: 5,
      endsAt: "",
      teacher: "",
      templateRevision: 1
    }
  }
];

function extractDocxSources(sources) {
  for (const src of sources) {
    if (!fs.existsSync(src.docx)) {
      console.error("Missing:", src.docx);
      process.exit(1);
    }
    fs.mkdirSync(src.extract, { recursive: true });
    execSync(`unzip -q -o "${src.docx}" -d "${src.extract}"`);
  }
}

function buildExam(set) {
  extractDocxSources(set.sources);
  const config = {
    dedupeBetweenFiles: set.dedupeBetweenFiles,
    outputMode: "exam_only",
    exam: set.exam,
    sources: set.sources.map(src => ({
      xml: path.join(src.extract, "word", "document.xml"),
      format: src.format,
      label: src.label
    }))
  };
  const raw = execSync(`python3 "${pyScript}" ${JSON.stringify(JSON.stringify(config))} "${outPath}"`, {
    encoding: "utf8",
    cwd: root
  });
  const summary = JSON.parse(raw.trim());
  return { exam: summary.exam, summary };
}

const exams = [];
const summaries = {};

for (const set of sourceSets) {
  const built = buildExam(set);
  exams.push(built.exam);
  summaries[set.key] = built.summary;
}

function cloneExamWithMeta(sourceExam, meta) {
  const copy = JSON.parse(JSON.stringify(sourceExam));
  Object.assign(copy, meta);
  copy.totalScore = Array.isArray(copy.questions) ? copy.questions.length : 0;
  return copy;
}

function verifyExamIntegrity(exam, label) {
  const questions = exam.questions || [];
  const issues = [];
  if (!questions.length) issues.push(`${label}: no questions`);
  questions.forEach((q, idx) => {
    if (!q.question) issues.push(`${label}: empty question at #${idx + 1}`);
    if (q.correctAnswer === undefined || q.correctAnswer === null) {
      issues.push(`${label}: missing correctAnswer at #${idx + 1}`);
    }
    if (q.type === "multiple" && (!Array.isArray(q.options) || q.options.length < 2)) {
      issues.push(`${label}: invalid mcq options at #${idx + 1}`);
    }
    if (q.type === "boolean" && q.correctAnswer !== 0 && q.correctAnswer !== 1) {
      issues.push(`${label}: invalid tf answer at #${idx + 1}`);
    }
  });
  if (issues.length) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  return {
    total: questions.length,
    mcq: questions.filter(q => q.type === "multiple").length,
    tf: questions.filter(q => q.type === "boolean").length
  };
}

const nahwComprehensive = exams.find(e => e.id === "nahw_comprehensive_year1");
if (!nahwComprehensive) {
  console.error("Missing nahw_comprehensive_year1 source exam");
  process.exit(1);
}

const nahwFinal = cloneExamWithMeta(nahwComprehensive, {
  id: "nahw_final_year1",
  title: "امتحان النحو والصرف النهائي للفرقة الأولى",
  faculty: "الفرقة الأولى — امتحان نهائي",
  examType: "نهائي",
  templateRevision: 1
});
exams.push(nahwFinal);

summaries.nahw_final = {
  clonedFrom: "nahw_comprehensive_year1",
  integrity: verifyExamIntegrity(nahwFinal, "nahw_final_year1"),
  matchesSourceCount: nahwFinal.questions.length === nahwComprehensive.questions.length
};

const header =
  "// Generated from imports — regenerate: node scripts/build-template-exams-data.js\n" +
  "// Nahw comprehensive: تمبلت-الامتحان.docx + امتحان-اولى-الفصل-الدراسي-الثاني-Copy.docx\n" +
  "// Nahw final: clone of nahw_comprehensive_year1 (251 questions)\n" +
  "// Arabic: adab-semester2-copy.docx + mudhakara.docx (deduped)\n";

let js = header;
js += "(function (global) {\n  global.arabyaTemplateExams = global.arabyaTemplateExams || [];\n";
for (const exam of exams) {
  js += "  global.arabyaTemplateExams.push(" + JSON.stringify(exam) + ");\n";
}
js += '})(typeof window !== "undefined" ? window : global);\n';
fs.writeFileSync(outPath, js, "utf8");

console.log("Generated", outPath);
console.log(JSON.stringify(summaries, null, 2));
