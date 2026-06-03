/**
 * أدوات عامة: إصدارات، معرفات، تأخير، تهريب HTML، عنوان التطبيق.
 */
(function (global) {
  function compareAppVersionStrings(a, b) {
    const partsA = String(a || "").trim().split(".").map(part => parseInt(part, 10) || 0);
    const partsB = String(b || "").trim().split(".").map(part => parseInt(part, 10) || 0);
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
      const diff = (partsA[i] || 0) - (partsB[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function pickLatestAppVersion(...candidates) {
    const list = candidates.map(v => String(v || "").trim()).filter(Boolean);
    if (!list.length) return "";
    return list.reduce((best, current) => (compareAppVersionStrings(current, best) > 0 ? current : best), list[0]);
  }

  function createRecordId(prefix = "record") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function delayMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAppsScriptString(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function getAppBaseUrl() {
    const cleanHref = window.location.href.split("?")[0].split("#")[0];
    if (window.location.protocol === "file:") {
      return cleanHref;
    }

    let origin = window.location.origin;
    let pathname = window.location.pathname;

    if (pathname.endsWith("index.html")) {
      pathname = pathname.replace("index.html", "");
    }

    const pathParts = pathname.split("/").filter(Boolean);
    const state = global.systemState;
    const knownExamIds = new Set((state && state.exams ? state.exams : []).map(exam => String(exam.id).toLowerCase()));
    while (pathParts.length && knownExamIds.has(pathParts[pathParts.length - 1].toLowerCase())) {
      pathParts.pop();
    }

    const basePath = pathParts.length ? `/${pathParts.join("/")}/` : "/";
    return `${origin}${basePath}`;
  }

  const api = {
    compareAppVersionStrings,
    pickLatestAppVersion,
    createRecordId,
    delayMs,
    escapeHtml,
    escapeAppsScriptString,
    getAppBaseUrl
  };

  global.ArabyaUtils = api;
  global.compareAppVersionStrings = compareAppVersionStrings;
  global.pickLatestAppVersion = pickLatestAppVersion;
  global.createRecordId = createRecordId;
  global.delayMs = delayMs;
  global.escapeHtml = escapeHtml;
  global.escapeAppsScriptString = escapeAppsScriptString;
  global.getAppBaseUrl = getAppBaseUrl;
})(window);
