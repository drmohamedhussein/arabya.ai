/**
 * إشعارات Toast للمزامنة والعمليات.
 */
(function (global) {
  let container = null;

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.getElementById("arabya-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "arabya-toast-container";
      container.className = "arabya-toast-container";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type, durationMs) {
    const root = ensureContainer();
    const kind = type || "info";
    const ms = durationMs != null ? durationMs : 4200;
    const el = document.createElement("div");
    el.className = `arabya-toast arabya-toast--${kind}`;
    el.innerHTML = `<span class="arabya-toast__text"></span>`;
    el.querySelector(".arabya-toast__text").textContent = String(message || "");
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  global.ArabyaToast = { showToast };
  global.showArabyaToast = showToast;
})(window);
