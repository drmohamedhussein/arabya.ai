#!/usr/bin/env python3
"""Patch app.js: sync cheat/device fields to Google Sheets on all cloud payloads."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.js"
text = APP.read_text(encoding="utf-8")
original_len = len(text.splitlines())

HELPER = """
function buildCheatTrackingFieldsFromResult(res) {
  if (!res) return buildCheatTrackingFields();
  const log = Array.isArray(res.cheatAttemptLog) ? res.cheatAttemptLog : [];
  const violations = Number(res.cheatViolations);
  let maxAllowed = res.maxCheatAttemptsAllowed;
  if (maxAllowed === undefined || maxAllowed === null || maxAllowed === "") {
    const exam = Array.isArray(systemState.exams)
      ? systemState.exams.find(e => e && e.id === res.examId)
      : null;
    maxAllowed = getExamMaxCheatAttempts(exam || systemState.currentExam);
  }
  return {
    cheatViolations: Number.isFinite(violations) ? violations : log.length,
    cheatAttemptLog: log,
    maxCheatAttemptsAllowed: maxAllowed
  };
}

"""

if "function buildCheatTrackingFieldsFromResult" not in text:
    needle = "function buildCheatTrackingFields() {"
    if needle not in text:
        raise SystemExit("buildCheatTrackingFields not found")
    text = text.replace(needle, HELPER + needle, 1)

OLD_SEND_PAYLOAD = """    maxScore: resultObj?.maxScore || getCurrentExamTotalScore(),
    ...buildResultCloudRetakeFields(resultObj),
    ...buildResultDeviceFields(resultObj || systemState.examDeviceProfile)
  };
  const slimPayload = buildSlimResultCloudPayload(payload);"""

NEW_SEND_PAYLOAD = """    maxScore: resultObj?.maxScore || getCurrentExamTotalScore(),
    attemptNumber: resultObj?.attemptNumber ?? "",
    ...buildResultCloudRetakeFields(resultObj),
    ...buildResultDeviceFields(resultObj || systemState.examDeviceProfile),
    ...(resultObj ? buildCheatTrackingFieldsFromResult(resultObj) : buildCheatTrackingFields())
  };
  const slimPayload = buildSlimResultCloudPayload(payload);"""

if OLD_SEND_PAYLOAD not in text:
    raise SystemExit("sendResultToGoogleSheets payload block not found")
text = text.replace(OLD_SEND_PAYLOAD, NEW_SEND_PAYLOAD, 1)

OLD_UPDATE = """    isManualGradeUpdate: true,
    ...buildResultCloudRetakeFields(res)
  };

  let done = 0;
  const total = urls.size;
  urls.forEach(url => {
    postToArabyaWebApp(url, payload).then(() => {"""

NEW_UPDATE = """    isManualGradeUpdate: true,
    attemptNumber: res.attemptNumber ?? "",
    ...buildResultCloudRetakeFields(res),
    ...buildResultDeviceFields(res),
    ...buildCheatTrackingFieldsFromResult(res)
  };
  const slimPayload = buildSlimResultCloudPayload(payload);

  let done = 0;
  const total = urls.size;
  urls.forEach(url => {
    postToArabyaWebApp(url, slimPayload).then(() => {"""

if OLD_UPDATE not in text:
    raise SystemExit("sendUpdatedResultToCloud payload block not found")
text = text.replace(OLD_UPDATE, NEW_UPDATE, 1)

APP.write_text(text, encoding="utf-8")
new_len = len(text.splitlines())
print(f"Patched {APP} ({original_len} -> {new_len} lines)")
