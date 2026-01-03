(() => {
  const OVERLAY_ROOT_ID = "env-switcher-overlay-root";
  const OVERLAY_IFRAME_ID = "env-switcher-overlay-iframe";
  const OVERLAY_BACKDROP_ID = "env-switcher-overlay-backdrop";
  const OVERLAY_STYLE_ID = "env-switcher-overlay-style";

  const IFRAME_WIDTH = 340;
  const IFRAME_HEIGHT = 192;
  const IFRAME_MAX_HEIGHT_VH = 70;
  const IFRAME_MIN_HEIGHT = 124;
  const IFRAME_MARGIN = 12;

  let currentTabId = null;
  let currentUrl = "";

  function isInjected() {
    return Boolean(document.getElementById(OVERLAY_ROOT_ID));
  }

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ROOT_ID);
    if (existing) existing.remove();

    const style = document.getElementById(OVERLAY_STYLE_ID);
    if (style) style.remove();
  }

  function buildStyles() {
    const style = document.createElement("style");
    style.id = OVERLAY_STYLE_ID;
    style.textContent = `
      #${OVERLAY_ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      }

      /* No full-page dimming; backdrop only captures outside-clicks */
      #${OVERLAY_BACKDROP_ID} {
        position: absolute;
        inset: 0;
        background: transparent;
        pointer-events: auto;
      }

      #${OVERLAY_IFRAME_ID} {
        position: absolute;
        top: ${IFRAME_MARGIN}px;
        right: ${IFRAME_MARGIN}px;
        width: ${IFRAME_WIDTH}px;
        height: ${IFRAME_HEIGHT}px;
        max-height: ${IFRAME_MAX_HEIGHT_VH}vh;
        min-height: ${IFRAME_MIN_HEIGHT}px;
        border: 0;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.22);
        background: transparent;
        pointer-events: auto;
        overflow: hidden;
        transition: height 140ms ease;
      }

      @media (max-width: 420px) {
        #${OVERLAY_IFRAME_ID} {
          left: ${IFRAME_MARGIN}px;
          right: ${IFRAME_MARGIN}px;
          width: auto;
        }
      }
    `;
    return style;
  }

  function buildOverlayUrl() {
    const base = chrome.runtime.getURL("overlay/overlay.html");
    const tabId = currentTabId != null ? String(currentTabId) : "";
    const url = currentUrl || "";
    const qs = `tabId=${encodeURIComponent(tabId)}&url=${encodeURIComponent(url)}`;
    return `${base}?${qs}`;
  }

  function clampHeight(px) {
    const maxPx =
      Math.floor((window.innerHeight * IFRAME_MAX_HEIGHT_VH) / 100) -
      IFRAME_MARGIN * 2;
    const bounded = Math.min(Math.max(px, IFRAME_MIN_HEIGHT), maxPx);
    return bounded;
  }

  function applyIframeHeight(heightPx) {
    const iframe = document.getElementById(OVERLAY_IFRAME_ID);
    if (!iframe) return;
    const next = clampHeight(heightPx);
    iframe.style.height = `${next}px`;
  }

  function createOverlay() {
    removeOverlay();

    const root = document.createElement("div");
    root.id = OVERLAY_ROOT_ID;

    const backdrop = document.createElement("div");
    backdrop.id = OVERLAY_BACKDROP_ID;
    backdrop.addEventListener("click", () => close());

    const iframe = document.createElement("iframe");
    iframe.id = OVERLAY_IFRAME_ID;
    iframe.allow = "clipboard-read; clipboard-write";
    iframe.scrolling = "no";
    iframe.src = buildOverlayUrl();

    root.appendChild(backdrop);
    root.appendChild(iframe);

    document.documentElement.appendChild(buildStyles());
    document.documentElement.appendChild(root);
  }

  function close() {
    removeOverlay();
  }

  function ensureOverlay() {
    if (!isInjected()) createOverlay();
  }

  function setContext({ tabId, url }) {
    currentTabId = tabId ?? currentTabId;
    currentUrl = url ?? currentUrl;
  }

  window.addEventListener("message", (event) => {
    const iframe = document.getElementById(OVERLAY_IFRAME_ID);
    const expectedOrigin = iframe ? new URL(iframe.src).origin : null;
    if (!expectedOrigin || event.origin !== expectedOrigin) return;

    const message = event.data;
    if (!message || typeof message !== "object") return;

    if (message.type === "ENV_SWITCHER_OVERLAY_CLOSE") {
      close();
      return;
    }

    if (message.type === "ENV_SWITCHER_OVERLAY_RESIZE") {
      const height = Number(message.height);
      if (Number.isFinite(height) && height > 0) {
        applyIframeHeight(height);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;

    if (message.type === "ENV_SWITCHER_OVERLAY_OPEN") {
      setContext({ tabId: message.tabId, url: message.url });

      if (!currentTabId || !currentUrl) {
        return;
      }

      if (isInjected()) {
        const iframe = document.getElementById(OVERLAY_IFRAME_ID);
        if (iframe) iframe.src = buildOverlayUrl();
        return;
      }

      ensureOverlay();
      return;
    }

    if (message.type === "ENV_SWITCHER_OVERLAY_CLOSE") {
      close();
      return;
    }
  });

  // Do not implicitly open/close on injection. This script should be message-driven.
  // Background will send ENV_SWITCHER_OVERLAY_OPEN with the correct tabId/url.
  setContext({ url: window.location.href });
})();
