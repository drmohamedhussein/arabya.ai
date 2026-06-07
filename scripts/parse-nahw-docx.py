#!/usr/bin/env python3
"""استخراج أسئلة امتحان النحو من ملفات Word ودمجها."""
import json
import re
import sys
import xml.etree.ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
RED = {"FF0000", "EE0000"}


def run_color(run):
    rpr = run.find("w:rPr", NS)
    if rpr is None:
        return None
    col = rpr.find("w:color", NS)
    if col is None:
        return None
    return (col.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val") or "").upper()


def cell_runs(tc):
    runs = []
    for p in tc.findall(".//w:p", NS):
        for r in p.findall(".//w:r", NS):
            txt = "".join((t.text or "") for t in r.findall("w:t", NS))
            if txt:
                runs.append({"text": txt, "color": run_color(r)})
    return runs


def runs_text(runs):
    return "".join(r["text"] for r in runs).strip()


def is_red(r):
    return r["color"] in RED


def parse_tf_row(runs):
    full = runs_text(runs)
    if not full or len(full) < 8:
        return None
    for r in runs:
        t = r["text"].strip()
        if t in ("T", "F") and is_red(r):
            statement = re.sub(r"\s*[TF]\s*$", "", full).strip()
            return {"question": statement, "correctAnswer": 0 if t == "T" else 1}
    m = re.search(r"\s*([TF])\s*$", full)
    statement = full
    trailing = None
    if m:
        trailing = m.group(1)
        statement = full[: m.start()].strip()
    substantive = [r for r in runs if len(r["text"].strip()) > 1 or re.search(r"\w", r["text"])]
    red_chars = sum(len(r["text"]) for r in substantive if is_red(r))
    total_chars = sum(len(r["text"]) for r in substantive)
    red_ratio = red_chars / total_chars if total_chars else 0
    if trailing:
        return {"question": statement, "correctAnswer": 0 if trailing == "T" else 1}
    stmt = re.sub(r"\s*[TF]\s*$", "", full).strip()
    if red_ratio >= 0.35:
        return {"question": stmt, "correctAnswer": 1}
    return {"question": stmt, "correctAnswer": 0}


def parse_tf_copy_cells(cells):
    if len(cells) < 2:
        return None
    runs = cell_runs(cells[1])
    full = runs_text(runs)
    if not full or len(full) < 5:
        return None
    substantive = [r for r in runs if len(r["text"].strip()) > 0]
    red_chars = sum(len(r["text"]) for r in substantive if is_red(r))
    total_chars = sum(len(r["text"]) for r in substantive)
    red_ratio = red_chars / total_chars if total_chars else 0
    return {"question": full, "correctAnswer": 1 if red_ratio >= 0.35 else 0}


def parse_mcq_cells(cells, question_idx, option_indices):
    if len(cells) <= max(option_indices):
        return None
    question = runs_text(cell_runs(cells[question_idx]))
    if not question:
        return None
    opts = []
    correct = 0
    for ci in option_indices:
        runs = cell_runs(cells[ci])
        opt = runs_text(runs)
        if not opt:
            continue
        opts.append(opt)
        if any(is_red(r) for r in runs):
            correct = len(opts) - 1
    if len(opts) < 2:
        return None
    return {
        "type": "multiple",
        "question": question,
        "options": opts,
        "correctAnswer": correct,
        "points": 1,
        "timeSeconds": 90,
    }


def parse_docx(xml_path, fmt):
    tree = ET.parse(xml_path)
    root = tree.getroot()
    tables = root.findall(".//w:tbl", NS)
    mcq = []
    tf = []
    if fmt == "original":
        for tr in tables[0].findall("w:tr", NS)[1:]:
            cells = tr.findall("w:tc", NS)
            q = parse_mcq_cells(cells, 0, [3, 2, 1])
            if q:
                mcq.append(q)
        for tr in tables[1].findall("w:tr", NS):
            cells = tr.findall("w:tc", NS)
            if not cells:
                continue
            parsed = parse_tf_row(cell_runs(cells[0]))
            if not parsed or not parsed["question"]:
                continue
            tf.append(
                {
                    "type": "boolean",
                    "question": parsed["question"],
                    "options": ["صواب", "خطأ"],
                    "correctAnswer": parsed["correctAnswer"],
                    "points": 1,
                    "timeSeconds": 45,
                }
            )
    elif fmt == "semester2_copy":
        for tr in tables[0].findall("w:tr", NS)[1:]:
            cells = tr.findall("w:tc", NS)
            q = parse_mcq_cells(cells, 1, [4, 3, 2])
            if q:
                mcq.append(q)
        for tr in tables[1].findall("w:tr", NS):
            cells = tr.findall("w:tc", NS)
            parsed = parse_tf_copy_cells(cells)
            if not parsed or not parsed["question"]:
                continue
            tf.append(
                {
                    "type": "boolean",
                    "question": parsed["question"],
                    "options": ["صواب", "خطأ"],
                    "correctAnswer": parsed["correctAnswer"],
                    "points": 1,
                    "timeSeconds": 45,
                }
            )
    return mcq, tf


def main():
    inputs = json.loads(sys.argv[1])
    out_path = sys.argv[2]
    all_mcq = []
    all_tf = []
    parts = []
    for xml_path, fmt in inputs:
        mcq, tf = parse_docx(xml_path, fmt)
        parts.append({"format": fmt, "mcq": len(mcq), "tf": len(tf), "total": len(mcq) + len(tf)})
        all_mcq.extend(mcq)
        all_tf.extend(tf)

    questions = []
    for i, q in enumerate(all_mcq + all_tf, 1):
        questions.append({**q, "id": i})

    exam = {
        "id": "nahw_comprehensive_year1",
        "title": "امتحان النحو والصرف الشامل للفرقة الأولى",
        "subject": "النحو والصرف",
        "university": "جامعة أسيوط",
        "faculty": "الفرقة الأولى — نحو عام",
        "level": "الفرقة الأولى",
        "examType": "نهائي",
        "totalScore": len(questions),
        "timeLimit": 180,
        "shuffleQuestions": True,
        "questionCount": "",
        "maxCheatAttempts": 5,
        "endsAt": "",
        "teacher": "",
        "templateRevision": 2,
        "questions": questions,
    }

    summary = {"parts": parts, "mcq": len(all_mcq), "tf": len(all_tf), "total": len(questions)}
    print(json.dumps(summary, ensure_ascii=False))
    js = (
        "// Generated from imports/تمبلت-الامتحان.docx + "
        "imports/امتحان-اولى-الفصل-الدراسي-الثاني-Copy.docx — "
        "regenerate: node scripts/build-nahw-template-exam.js\n"
    )
    js += "(function (global) {\n  global.arabyaTemplateExams = global.arabyaTemplateExams || [];\n"
    js += "  global.arabyaTemplateExams.push(" + json.dumps(exam, ensure_ascii=False, separators=(",", ":")) + ");\n"
    js += '})(typeof window !== "undefined" ? window : global);\n'
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(js)


if __name__ == "__main__":
    main()
