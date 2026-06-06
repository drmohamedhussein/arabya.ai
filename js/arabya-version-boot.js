/**
 * يضبط إصدار المنصة من meta/index.html قبل وبعد تحميل app.js
 * حتى لا يبقى العرض عالقاً على نسخة قديمة من app.js أو localStorage.
 */
(function enforceArabyaBuildVersion(global) {
  function parseVersionParts(value) {
    return String(value || "").trim().split(".").map(function (part) {
      return parseInt(part, 10) || 0;
    });
  }

  function compareVersions(a, b) {
    var partsA = parseVersionParts(a);
    var partsB = parseVersionParts(b);
    var len = Math.max(partsA.length, partsB.length);
    for (var i = 0; i < len; i++) {
      var diff = (partsA[i] || 0) - (partsB[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function pickLatestVersion() {
    var candidates = [];
    var meta = document.querySelector('meta[name="arabya-app-version"]');
    if (meta && meta.content) candidates.push(String(meta.content).trim());
    var htmlBuild = document.documentElement && document.documentElement.getAttribute("data-arabya-build");
    if (htmlBuild) candidates.push(String(htmlBuild).trim());
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf("app.js") === -1) continue;
      var match = src.match(/[?&]v=([^&]+)/);
      if (match && match[1]) {
        candidates.push(decodeURIComponent(match[1]).trim());
        break;
      }
    }
    if (global.ARABYA_APP_BUILD_VERSION) candidates.push(String(global.ARABYA_APP_BUILD_VERSION).trim());
    candidates = candidates.filter(Boolean);
    if (!candidates.length) return "";
    return candidates.reduce(function (best, current) {
      return compareVersions(current, best) > 0 ? current : best;
    }, candidates[0]);
  }

  function paintVersionLabel(version) {
    if (!version) return;
    var el = document.getElementById("teacher-app-version-label");
    if (el) el.textContent = "إصدار التطبيق: " + version;
    try {
      document.documentElement.setAttribute("data-arabya-build", version);
    } catch (e) {}
  }

  function applyBuildVersion() {
    var version = pickLatestVersion();
    if (!version) return version;
    global.ARABYA_APP_BUILD_VERSION = version;
    global.ARABYA_APP_VERSION = version;
    paintVersionLabel(version);
    if (global.systemState && global.systemState.config) {
      var stored = String(global.systemState.config.appVersion || "");
      if (!stored || compareVersions(version, stored) > 0) {
        global.systemState.config.appVersion = version;
      }
    }
    try {
      var cfg = JSON.parse(localStorage.getItem("arabya_teacher_config") || "{}");
      var cfgVersion = String(cfg.appVersion || "");
      if (!cfgVersion || compareVersions(version, cfgVersion) > 0) {
        cfg.appVersion = version;
        localStorage.setItem("arabya_teacher_config", JSON.stringify(cfg));
      }
    } catch (err) {}
    if (typeof global.applyPlatformAppVersion === "function") {
      try {
        global.applyPlatformAppVersion(version, { persistState: false });
      } catch (applyErr) {}
    }
    return version;
  }

  global.enforceArabyaBuildVersion = applyBuildVersion;
  applyBuildVersion();
  document.addEventListener("DOMContentLoaded", applyBuildVersion);
  global.addEventListener("load", applyBuildVersion);
  setTimeout(applyBuildVersion, 0);
  setTimeout(applyBuildVersion, 800);
  setTimeout(applyBuildVersion, 2500);
})(window);
