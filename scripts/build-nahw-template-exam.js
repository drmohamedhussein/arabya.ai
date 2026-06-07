#!/usr/bin/env node
/**
 * يعيد توليد js/arabya-template-exams-data.js من imports/تمبلت-الامتحان.docx
 * الاستخدام: node scripts/build-nahw-template-exam.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const docxPath = path.join(root, "imports", "تمبلت-الامتحان.docx");
const extractDir = path.join(root, "imports", "docx_extracted");
const outPath = path.join(root, "js", "arabya-template-exams-data.js");

if (!fs.existsSync(docxPath)) {
  console.error("Missing:", docxPath);
  process.exit(1);
}

fs.mkdirSync(extractDir, { recursive: true });
execSync(`unzip -q -o "${docxPath}" -d "${extractDir}"`);

const py = String.raw`
import xml.etree.ElementTree as ET
import re, json, sys
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
tree = ET.parse(sys.argv[1])
root = tree.getroot()
RED = {'FF0000', 'EE0000'}

def run_color(run):
    rpr = run.find('w:rPr', NS)
    if rpr is None: return None
    col = rpr.find('w:color', NS)
    if col is None: return None
    return (col.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') or '').upper()

def cell_runs(tc):
    runs = []
    for p in tc.findall('.//w:p', NS):
        for r in p.findall('.//w:r', NS):
            txt = ''.join((t.text or '') for t in r.findall('w:t', NS))
            if txt:
                runs.append({'text': txt, 'color': run_color(r)})
    return runs

def runs_text(runs):
    return ''.join(r['text'] for r in runs).strip()

def is_red(r):
    return r['color'] in RED

def parse_tf_row(runs):
    full = runs_text(runs)
    if not full or len(full) < 8:
        return None
    for r in runs:
        t = r['text'].strip()
        if t in ('T', 'F') and is_red(r):
            statement = re.sub(r'\s*[TF]\s*$', '', full).strip()
            return {'question': statement, 'correctAnswer': 0 if t == 'T' else 1}
    m = re.search(r'\s*([TF])\s*$', full)
    statement = full
    trailing = None
    if m:
        trailing = m.group(1)
        statement = full[:m.start()].strip()
    substantive = [r for r in runs if len(r['text'].strip()) > 1 or re.search(r'\w', r['text'])]
    red_chars = sum(len(r['text']) for r in substantive if is_red(r))
    total_chars = sum(len(r['text']) for r in substantive)
    red_ratio = red_chars / total_chars if total_chars else 0
    if trailing:
        return {'question': statement, 'correctAnswer': 0 if trailing == 'T' else 1}
    stmt = re.sub(r'\s*[TF]\s*$', '', full).strip()
    if red_ratio >= 0.35:
        return {'question': stmt, 'correctAnswer': 1}
    return {'question': stmt, 'correctAnswer': 0}

mcq = []
for tr in root.findall('.//w:tbl', NS)[0].findall('w:tr', NS)[1:]:
    cells = tr.findall('w:tc', NS)
    if len(cells) < 4:
        continue
    question = runs_text(cell_runs(cells[0]))
    if not question:
        continue
    opts = []
    correct = 0
    for ci in [3, 2, 1]:
        runs = cell_runs(cells[ci])
        opt = runs_text(runs)
        if not opt:
            continue
        opts.append(opt)
        if any(is_red(r) for r in runs):
            correct = len(opts) - 1
    mcq.append({'type': 'multiple', 'question': question, 'options': opts, 'correctAnswer': correct, 'points': 1, 'timeSeconds': 90})

tf = []
for tr in root.findall('.//w:tbl', NS)[1].findall('w:tr', NS):
    cells = tr.findall('w:tc', NS)
    if not cells:
        continue
    q = parse_tf_row(cell_runs(cells[0]))
    if not q or not q['question']:
        continue
    tf.append({'type': 'boolean', 'question': q['question'], 'options': ['صواب', 'خطأ'], 'correctAnswer': q['correctAnswer'], 'points': 1, 'timeSeconds': 45})

questions = []
for i, q in enumerate(mcq + tf, 1):
    questions.append({**q, 'id': i})

exam = {
    'id': 'nahw_comprehensive_year1',
    'title': 'امتحان النحو الشامل للفرقة الأولى',
    'subject': 'النحو',
    'university': 'جامعة أسيوط',
    'faculty': 'الفرقة الأولى — نحو عام',
    'level': 'الفرقة الأولى',
    'examType': 'نهائي',
    'totalScore': len(questions),
    'timeLimit': 180,
    'shuffleQuestions': True,
    'questionCount': '',
    'maxCheatAttempts': 5,
    'endsAt': '',
    'teacher': '',
    'questions': questions
}

print(json.dumps({'mcq': len(mcq), 'tf': len(tf), 'total': len(questions)}, ensure_ascii=False))
js = '// Generated from imports/تمبلت-الامتحان.docx — regenerate: node scripts/build-nahw-template-exam.js\n'
js += '(function (global) {\n  global.arabyaTemplateExams = global.arabyaTemplateExams || [];\n'
js += '  global.arabyaTemplateExams.push(' + json.dumps(exam, ensure_ascii=False, separators=(',', ':')) + ');\n})(typeof window !== "undefined" ? window : global);\n'
open(sys.argv[2], 'w', encoding='utf-8').write(js)
`;

const xmlPath = path.join(extractDir, "word", "document.xml");
const summary = execSync(`python3 -c ${JSON.stringify(py)} "${xmlPath}" "${outPath}"`, {
  encoding: "utf8",
  cwd: root
});
console.log("Generated", outPath);
console.log(summary.trim());
