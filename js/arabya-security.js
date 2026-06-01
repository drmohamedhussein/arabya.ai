/**
 * أمان الحسابات: تشفير كلمات مرور المعلمين (SHA-256 + salt) وجلسة خمول.
 */
(function (global) {
  const IDLE_MS = 2 * 60 * 60 * 1000;
  const LAST_ACTIVITY_KEY = "arabya_teacher_last_activity";

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(String(value || ""));
    const hash = await global.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function generateSalt() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  async function hashTeacherPassword(password, salt) {
    return sha256Hex(`arabya.v1|${salt}|${password}`);
  }

  async function ensureTeacherPasswordHashed(teacher, plainCredential) {
    if (!teacher || !plainCredential) return teacher;
    if (teacher.passwordHash && teacher.passwordSalt) return teacher;
    const salt = generateSalt();
    teacher.passwordSalt = salt;
    teacher.passwordHash = await hashTeacherPassword(String(plainCredential).trim(), salt);
    return teacher;
  }

  async function teacherCredentialMatches(teacher, credential) {
    if (!teacher || credential === undefined || credential === null) return false;
    const val = String(credential).trim();
    if (!val) return false;
    if (teacher.passwordHash && teacher.passwordSalt) {
      const hashed = await hashTeacherPassword(val, teacher.passwordSalt);
      if (hashed === teacher.passwordHash) return true;
    }
    return teacher.password === val || teacher.autoEntryCode === val;
  }

  function touchTeacherActivity() {
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch (e) {}
  }

  function setupTeacherIdleSessionGuard(logoutFn) {
    touchTeacherActivity();
    ["click", "keydown", "touchstart"].forEach(ev => {
      document.addEventListener(
        ev,
        () => {
          if (global.systemState?.activeView === "teacher-dashboard-view") touchTeacherActivity();
        },
        { passive: true }
      );
    });
    setInterval(() => {
      if (global.systemState?.activeView !== "teacher-dashboard-view" || !global.systemState?.activeTeacher) return;
      const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || "0", 10);
      if (last && Date.now() - last > IDLE_MS) {
        alert("انتهت جلسة لوحة التحكم بسبب الخمول (ساعتان). يرجى تسجيل الدخول مجدداً.");
        if (typeof logoutFn === "function") logoutFn();
      }
    }, 60000);
  }

  function sanitizeTeacherForExport(teacher) {
    if (!teacher) return teacher;
    const copy = { ...teacher };
    delete copy.password;
    return copy;
  }

  global.ArabyaSecurity = {
    hashTeacherPassword,
    ensureTeacherPasswordHashed,
    teacherCredentialMatches,
    touchTeacherActivity,
    setupTeacherIdleSessionGuard,
    sanitizeTeacherForExport,
    IDLE_MS
  };
})(window);
