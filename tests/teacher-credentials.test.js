/**
 * Regression tests for teacher credential persistence.
 */
const assert = require("assert");

function syncActiveTeacherCredentials(state, preferredCode = "") {
  if (!state.activeTeacher) return;
  const code = String(
    preferredCode ||
    state.activeTeacher.autoEntryCode ||
    state.activeTeacher.password ||
    state.config?.autoEntryCode ||
    state.config?.teacherCode ||
    ""
  ).trim();
  if (!code) return;
  state.activeTeacher.autoEntryCode = code;
  state.activeTeacher.password = code;
  state.config = {
    ...(state.config || {}),
    autoEntryCode: code,
    teacherCode: code
  };
  if (state.teacherProfile && typeof state.teacherProfile === "object") {
    state.teacherProfile.autoEntryCode = code;
  }
  const idx = state.teachers.findIndex(t => t.username === state.activeTeacher.username);
  if (idx !== -1) {
    state.teachers[idx].autoEntryCode = code;
    state.teachers[idx].password = code;
  }
}

function applySavedTeacherProfile(state, parsedProfile) {
  state.teacherProfile = parsedProfile;
  if (parsedProfile.name) state.activeTeacher.name = parsedProfile.name;
  if (parsedProfile.subject) state.activeTeacher.subject = parsedProfile.subject;
}

const state = {
  activeTeacher: {
    username: "mhm",
    name: "Teacher",
    subject: "Arabic",
    password: "NEWCODE",
    autoEntryCode: "NEWCODE"
  },
  teachers: [{
    username: "mhm",
    name: "Teacher",
    subject: "Arabic",
    password: "NEWCODE",
    autoEntryCode: "NEWCODE"
  }],
  config: {
    teacherCode: "NEWCODE",
    autoEntryCode: "NEWCODE"
  },
  teacherProfile: {
    name: "Teacher",
    subject: "Arabic",
    autoEntryCode: "NEWCODE"
  }
};

applySavedTeacherProfile(state, {
  name: "Teacher",
  subject: "Arabic",
  autoEntryCode: "OLDCODE"
});
syncActiveTeacherCredentials(state);

assert.strictEqual(state.activeTeacher.password, "NEWCODE");
assert.strictEqual(state.activeTeacher.autoEntryCode, "NEWCODE");
assert.strictEqual(state.teachers[0].password, "NEWCODE");
assert.strictEqual(state.config.teacherCode, "NEWCODE");
assert.strictEqual(state.teacherProfile.autoEntryCode, "NEWCODE");

console.log("All teacher credential tests passed.");
