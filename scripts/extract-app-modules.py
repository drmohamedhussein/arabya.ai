#!/usr/bin/env python3
"""Extract large sections from app.js into standalone JS modules."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"

MODULES = [
    {
        "file": "js/arabya-cloud-api.js",
        "title": "مزامنة سحابية: Google Apps Script، نسخ احتياطي، دمج البيانات",
        "ranges": [(2679, 2772), (2897, 4474), (7554, 7618)],
        "constants": """
const MAX_CLOUD_BACKUP_JSON_BYTES = 4500000;
const ARABYA_CLOUD_BACKUP_SCOPE_GENERAL = "general";
const ARABYA_CLOUD_BACKUP_SCOPE_ALL = "all";
const ARABYA_UNIFIED_CLOUD_SYNC_FLAG = "arabya_unified_cloud_sync_v1";
""".strip(),
    },
    {
        "file": "js/arabya-exam-device.js",
        "title": "بصمة الجهاز، سجل الأجهزة، IP مشترك، قفل الجهاز",
        "ranges": [(1529, 1594), (9133, 9595)],
        "extra_from_backup": (2647, 2774),
    },
    {
        "file": "js/arabya-exam-anticheat.js",
        "title": "منع الغش، تأمين النافذة، عقوبات المشغل",
        "ranges": [(9597, 10179)],
    },
    {
        "file": "js/arabya-exam-runner.js",
        "title": "بوابة الطالب ومشغل الامتحان",
        "ranges": [(6729, 9130)],
    },
]


def read_lines() -> list[str]:
    return APP.read_text(encoding="utf-8").splitlines(keepends=True)


def extract_ranges(lines: list[str], ranges: list[tuple[int, int]]) -> str:
    chunks: list[str] = []
    for start, end in ranges:
        chunks.append("".join(lines[start - 1 : end]))
    return "".join(chunks)


def globalize_system_state(code: str) -> str:
    return re.sub(r"(?<![.\w])systemState(?![.\w])", "window.systemState", code)


def build_module(meta: dict, body: str) -> str:
    header = f"/**\n * {meta['title']}\n * مستخرج من app.js — يعتمد على window.systemState بعد تحميل app.js.\n */\n"
    parts = [header]
    if meta.get("constants"):
        parts.append(meta["constants"] + "\n\n")
    parts.append(globalize_system_state(body))
    if not parts[-1].endswith("\n"):
        parts.append("\n")
    return "".join(parts)


def remove_ranges(lines: list[str], all_ranges: list[tuple[int, int]]) -> list[str]:
    remove = set()
    for start, end in all_ranges:
        for i in range(start, end + 1):
            remove.add(i)
    return [line for i, line in enumerate(lines, start=1) if i not in remove]


def main() -> None:
    lines = read_lines()
    backup_lines = None
    all_remove: list[tuple[int, int]] = []

    for meta in MODULES:
        body = extract_ranges(lines, meta["ranges"])
        if meta.get("extra_from_backup"):
            if backup_lines is None:
                import subprocess

                raw = subprocess.check_output(
                    ["git", "show", "backup-2026-06-03-pre-refactor:app.js"],
                    cwd=ROOT,
                    text=True,
                )
                backup_lines = raw.splitlines(keepends=True)
            bs, be = meta["extra_from_backup"]
            body = extract_ranges(backup_lines, [(bs, be)]) + "\n" + body
        path = ROOT / meta["file"]
        path.write_text(build_module(meta, body), encoding="utf-8")
        all_remove.extend(meta["ranges"])
        print(f"wrote {path} ({path.stat().st_size} bytes)")

    new_lines = remove_ranges(lines, all_remove)
    text = "".join(new_lines)
    note = " * الوحدات المستخرجة: js/arabya-cloud-api.js, js/arabya-exam-device.js, js/arabya-exam-anticheat.js, js/arabya-exam-runner.js\n"
    if note not in text:
        text = text.replace(
            " * الوحدات المستخرجة: js/arabya-utils.js, js/arabya-students.js, js/arabya-exam-config.js\n",
            " * الوحدات المستخرجة: js/arabya-utils.js, js/arabya-students.js, js/arabya-exam-config.js,\n"
            " *   js/arabya-cloud-api.js, js/arabya-exam-device.js, js/arabya-exam-anticheat.js, js/arabya-exam-runner.js\n",
            1,
        )
    APP.write_text(text, encoding="utf-8")
    print(f"app.js lines: {len(lines)} -> {len(new_lines)}")


if __name__ == "__main__":
    main()
