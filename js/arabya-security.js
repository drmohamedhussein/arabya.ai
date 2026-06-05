/**
 * أمان الحسابات: PBKDF2-SHA256 (v2) مع ترحيل من SHA-256 (v1) وجلسة خمول.
 */
(function (global) {
  const IDLE_MS = 2 * 60 * 60 * 1000;
  const LAST_ACTIVITY_KEY = "arabya_teacher_last_activity";
  const PASSWORD_HASH_VERSION = 2;
  const PBKDF2_ITERATIONS = 210000;

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(String(value || ""));
    const hash = await global.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function generateSalt() {
    const buf = new Uint8Array(16);
    global.crypto.getRandomValues(buf);
    return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashTeacherPasswordV1(password, salt) {
    return sha256Hex(`arabya.v1|${salt}|${password}`);
  }

  async function hashTeacherPasswordV2(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await global.crypto.subtle.importKey(
      "raw",
      enc.encode(String(password || "")),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await global.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc.encode(`arabya.v2|${salt}`),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashTeacherPassword(password, salt, version) {
    const ver = Number(version) || PASSWORD_HASH_VERSION;
    if (ver >= PASSWORD_HASH_VERSION) {
      return hashTeacherPasswordV2(password, salt);
    }
    return hashTeacherPasswordV1(password, salt);
  }

  function getTeacherPasswordHashVersion(teacher) {
    const parsed = parseInt(teacher?.passwordHashVersion, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return teacher?.passwordHash && teacher?.passwordSalt ? 1 : 0;
  }

  function stripTeacherPlainPassword(teacher) {
    if (!teacher) return teacher;
    if (teacher.passwordHash && teacher.passwordSalt) {
      delete teacher.password;
    }
    return teacher;
  }

  function sanitizeTeacherForLocalStorage(teacher) {
    if (!teacher) return teacher;
    const copy = { ...teacher };
    stripTeacherPlainPassword(copy);
    return copy;
  }

  async function ensureTeacherPasswordHashed(teacher, plainCredential) {
    if (!teacher || !plainCredential) return teacher;
    if (teacher.passwordHash && teacher.passwordSalt) {
      return stripTeacherPlainPassword(teacher);
    }
    const salt = generateSalt();
    teacher.passwordSalt = salt;
    teacher.passwordHash = await hashTeacherPasswordV2(String(plainCredential).trim(), salt);
    teacher.passwordHashVersion = PASSWORD_HASH_VERSION;
    return stripTeacherPlainPassword(teacher);
  }

  async function upgradeTeacherPasswordHashIfNeeded(teacher, plainCredential) {
    if (!teacher || !plainCredential) return teacher;
    const matches = await teacherPasswordMatches(teacher, plainCredential);
    if (!matches) return teacher;
    if (getTeacherPasswordHashVersion(teacher) >= PASSWORD_HASH_VERSION) {
      return stripTeacherPlainPassword(teacher);
    }
    const salt = generateSalt();
    teacher.passwordSalt = salt;
    teacher.passwordHash = await hashTeacherPasswordV2(String(plainCredential).trim(), salt);
    teacher.passwordHashVersion = PASSWORD_HASH_VERSION;
    return stripTeacherPlainPassword(teacher);
  }

  async function teacherPasswordMatches(teacher, credential) {
    if (!teacher || credential === undefined || credential === null) return false;
    const val = String(credential).trim();
    if (!val) return false;
    if (teacher.passwordHash && teacher.passwordSalt) {
      const version = getTeacherPasswordHashVersion(teacher);
      const hashed = await hashTeacherPassword(val, teacher.passwordSalt, version);
      if (hashed === teacher.passwordHash) return true;
      if (version !== 1) {
        const legacy = await hashTeacherPasswordV1(val, teacher.passwordSalt);
        return legacy === teacher.passwordHash;
      }
      return false;
    }
    return String(teacher.password || "").trim() === val;
  }

  async function teacherAutoEntryCodeMatches(teacher, credential) {
    if (!teacher || credential === undefined || credential === null) return false;
    const val = String(credential).trim();
    if (!val) return false;
    return String(teacher.autoEntryCode || "").trim() === val;
  }

  async function teacherCredentialMatches(teacher, credential) {
    return teacherPasswordMatches(teacher, credential) || teacherAutoEntryCodeMatches(teacher, credential);
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
    delete copy.passwordHash;
    delete copy.passwordSalt;
    delete copy.passwordHashVersion;
    delete copy.loginTokens;
    if (copy.integrationConfig) {
      delete copy.integrationConfig.apiSecret;
    }
    return copy;
  }

  function sanitizeTeacherForCloud(teacher) {
    if (!teacher) return teacher;
    const copy = JSON.parse(JSON.stringify(teacher));
    delete copy.password;
    delete copy.passwordHash;
    delete copy.passwordSalt;
    delete copy.passwordHashVersion;
    delete copy.autoEntryCode;
    delete copy.loginTokens;
    if (copy.integrationConfig) {
      delete copy.integrationConfig.teacherCode;
      delete copy.integrationConfig.apiSecret;
    }
    return copy;
  }

  global.ArabyaSecurity = {
    hashTeacherPassword,
    hashTeacherPasswordV1,
    hashTeacherPasswordV2,
    ensureTeacherPasswordHashed,
    upgradeTeacherPasswordHashIfNeeded,
    stripTeacherPlainPassword,
    sanitizeTeacherForLocalStorage,
    teacherPasswordMatches,
    teacherAutoEntryCodeMatches,
    teacherCredentialMatches,
    touchTeacherActivity,
    setupTeacherIdleSessionGuard,
    sanitizeTeacherForExport,
    sanitizeTeacherForCloud,
    PASSWORD_HASH_VERSION,
    PBKDF2_ITERATIONS,
    IDLE_MS
  };
})(window);
