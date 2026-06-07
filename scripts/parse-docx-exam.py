#!/usr/bin/env python3
"""استخراج أسئلة امتحان من ملفات Word (اختيار من متعدد + صواب/خطأ)."""
import json
import re
import sys
import unicodedata
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


def normalize_question_key(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\u200e\u200f\u202a-\u202e\ufeff]", "", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def question_key(q):
    return normalize_question_key(q.get("question", ""))


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
    substantive = [r for r in runs if len(r["text"].strip()) > 0]
    red_chars = sum(len(r["text"]) for r in substantive if is_red(r))
    total_chars = sum(len(r["text"]) for r in substantive)
    red_ratio = red_chars / total_chars if total_chars else 0
    if trailing:
        return {"question": statement, "correctAnswer": 0 if trailing == "T" else 1}
    stmt = re.sub(r"\s*[TF]\s*$", "", full).strip()
    return {"question": stmt, "correctAnswer": 1 if red_ratio >= 0.35 else 0}


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


def merge_with_dedupe(file_results, dedupe_between_files):
    all_mcq = []
    all_tf = []
    seen = set()
    parts = []
    duplicates = 0

    for item in file_results:
        mcq, tf = item["mcq"], item["tf"]
        part_mcq = 0
        part_tf = 0
        part_dup = 0

        for q in mcq + tf:
            key = question_key(q)
            if not key:
                continue
            if dedupe_between_files and key in seen:
                duplicates += 1
                part_dup += 1
                continue
            seen.add(key)
            if q["type"] == "multiple":
                all_mcq.append(q)
                part_mcq += 1
            else:
                all_tf.append(q)
                part_tf += 1

        parts.append(
            {
                "source": item.get("source", ""),
                "format": item.get("format", ""),
                "parsed_mcq": len(mcq),
                "parsed_tf": len(tf),
                "added_mcq": part_mcq,
                "added_tf": part_tf,
                "skipped_duplicates": part_dup,
                "added_total": part_mcq + part_tf,
            }
        )

    return all_mcq, all_tf, parts, duplicates


def build_exam(config, all_mcq, all_tf):
    questions = []
    for i, q in enumerate(all_mcq + all_tf, 1):
        questions.append({**q, "id": i})

    exam = dict(config["exam"])
    exam["totalScore"] = len(questions)
    exam["questions"] = questions
    return exam


def write_template_js(exams, out_path, header_comment):
    js = header_comment + "\n"
    js += "(function (global) {\n  global.arabyaTemplateExams = global.arabyaTemplateExams || [];\n"
    for exam in exams:
        js += "  global.arabyaTemplateExams.push(" + json.dumps(exam, ensure_ascii=False, separators=(",", ":")) + ");\n"
    js += '})(typeof window !== "undefined" ? window : global);\n'
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(js)


def main():
    config = json.loads(sys.argv[1])
    out_path = sys.argv[2]
    dedupe = bool(config.get("dedupeBetweenFiles", False))
    file_results = []

    for src in config["sources"]:
        mcq, tf = parse_docx(src["xml"], src["format"])
        file_results.append(
            {
                "source": src.get("label", src["xml"]),
                "format": src["format"],
                "mcq": mcq,
                "tf": tf,
            }
        )

    all_mcq, all_tf, parts, duplicates = merge_with_dedupe(file_results, dedupe)
    exam = build_exam(config, all_mcq, all_tf)

    if config.get("outputMode") == "exam_only":
        print(json.dumps({"exam": exam, "parts": parts, "duplicates": duplicates, "mcq": len(all_mcq), "tf": len(all_tf), "total": len(exam["questions"])}, ensure_ascii=False))
        return

    write_template_js([exam], out_path, config.get("headerComment", "// Generated template exam data\n"))
    print(json.dumps({"parts": parts, "duplicates": duplicates, "mcq": len(all_mcq), "tf": len(all_tf), "total": len(exam["questions"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
