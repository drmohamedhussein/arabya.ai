/**
 * جسر مزامنة لحظية (اختياري) — Firebase / Supabase / SSE.
 * بدون إعداد: يعتمد على جلب ArabyaCloudSync (محاكاة push عبر cloudRevision).
 */
(function (global) {
  const CONFIG_KEY = "arabya_realtime_config";

  const DEFAULT_CONFIG = {
    provider: "polling",
    firebase: { apiKey: "", authDomain: "", projectId: "", databaseURL: "" },
    supabase: { url: "", anonKey: "" },
    sseUrl: ""
  };

  function loadConfig() {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") };
    } catch (e) {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...loadConfig(), ...cfg }));
    } catch (e) {}
  }

  function startRealtimeSync() {
    const cfg = loadConfig();
    if (cfg.provider === "firebase" && cfg.firebase?.projectId) {
      console.warn("[ARABYA] Firebase configured — أضف SDK في index.html لتفعيل الاستماع اللحظي.");
      return { mode: "firebase-pending" };
    }
    if (cfg.provider === "supabase" && cfg.supabase?.url) {
      console.warn("[ARABYA] Supabase configured — أضف @supabase/supabase-js لتفعيل Realtime.");
      return { mode: "supabase-pending" };
    }
    if (global.ArabyaCloudSync && typeof global.ArabyaCloudSync.startPullLoop === "function") {
      global.ArabyaCloudSync.startPullLoop();
      return { mode: "polling", note: "WebSocket/SSE غير متاح على GitHub Pages + GAS — استخدام مراقبة cloudRevision" };
    }
    return { mode: "none" };
  }

  global.ArabyaRealtimeBridge = {
    loadConfig,
    saveConfig,
    startRealtimeSync,
    DEFAULT_CONFIG
  };
})(window);
