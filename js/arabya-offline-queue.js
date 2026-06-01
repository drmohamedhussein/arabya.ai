/**
 * طابور رفع عند انقطاع الاتصال — يُفرَغ تلقائياً عند عودة الشبكة.
 */
(function (global) {
  const QUEUE_KEY = "arabya_offline_post_queue";

  function readQueue() {
    try {
      const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function writeQueue(items) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items || []));
    } catch (e) {}
  }

  function enqueue(url, payload) {
    const q = readQueue();
    q.push({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url: String(url || ""),
      payload: payload || {},
      at: new Date().toISOString()
    });
    if (q.length > 80) q.splice(0, q.length - 80);
    writeQueue(q);
    if (global.ArabyaToast) {
      global.ArabyaToast.showToast("لا يوجد اتصال — تمت جدولة الرفع عند عودة الشبكة", "warning", 5000);
    }
    return q.length;
  }

  async function flush() {
    if (!navigator.onLine) return { flushed: 0, remaining: readQueue().length };
    const poster = global.postToArabyaWebApp;
    if (typeof poster !== "function") return { flushed: 0, remaining: readQueue().length };
    const q = readQueue();
    if (!q.length) return { flushed: 0, remaining: 0 };
    const remaining = [];
    let flushed = 0;
    for (const item of q) {
      try {
        await poster(item.url, item.payload);
        flushed++;
      } catch (e) {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    if (flushed && global.ArabyaToast) {
      global.ArabyaToast.showToast(`تم رفع ${flushed} عملية من الطابور المحلي`, "success");
    }
    return { flushed, remaining: remaining.length };
  }

  function installListeners() {
    global.addEventListener("online", () => {
      flush().catch(() => {});
    });
    if (navigator.onLine) {
      setTimeout(() => flush().catch(() => {}), 2000);
    }
  }

  global.ArabyaOfflineQueue = { enqueue, flush, readQueue, installListeners };
})(window);
