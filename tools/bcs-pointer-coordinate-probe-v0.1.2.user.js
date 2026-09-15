// ==UserScript==
// @name         BCS Pointer Coordinate Probe
// @namespace    whoami.boosteroid.control-suite.probe
// @version      0.1.2
// @description  UI bootstrap fix for the frozen v0.1.1 pointer-coordinate diagnostic core.
// @author       Whoami
// @match        https://example.com/*
// @match        https://boosteroid.com/*
// @match        https://cloud.boosteroid.com/*
// @match        https://*.boosteroid.com/*
// @require      https://raw.githubusercontent.com/whoami804/BCS-Userscript/32141ba288efb8217a68a8c8fc261626d34db2c0/tools/bcs-pointer-coordinate-probe-v0.1.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const UI_VERSION = '0.1.2';
  const CORE_VERSION = '0.1.1';
  const PANEL_ID = 'bcs-pointer-probe-panel';
  const TITLE_SELECTOR = '.bcs-ptr-header strong';
  const BADGE_ID = 'bcs-ptr-ui-bootstrap-badge';
  const MAX_BOOT_MS = 8000;
  const POLL_MS = 100;

  let observer = null;
  let pollTimer = null;
  let stopTimer = null;

  function popoverOpen(panel) {
    try { return panel.matches(':popover-open'); }
    catch { return false; }
  }

  function markUiIdentity(panel) {
    const title = panel.querySelector(TITLE_SELECTOR);
    if (title) title.textContent = `PTR PROBE v${UI_VERSION}`;

    if (!panel.querySelector(`#${BADGE_ID}`)) {
      const badge = document.createElement('div');
      badge.id = BADGE_ID;
      badge.textContent = `core ${CORE_VERSION} · UI bootstrap ${UI_VERSION}`;
      badge.style.cssText = 'padding:5px 12px 0;font-size:10px;opacity:.62;pointer-events:none;';
      const body = panel.querySelector('.bcs-ptr-body');
      if (body) body.prepend(badge);
    }
  }

  function forceVisibleFallback(panel) {
    if (popoverOpen(panel)) return 'TOP_LAYER_OK';

    // v0.1.1 can create the panel successfully but leave it hidden when
    // showPopover() is unavailable/rejected. Remove only the presentation
    // dependency; the diagnostic core and event capture remain untouched.
    panel.removeAttribute('popover');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    panel.style.setProperty('pointer-events', 'auto', 'important');
    panel.style.setProperty('position', 'fixed', 'important');
    panel.style.setProperty('z-index', '2147483647', 'important');
    return 'FIXED_FALLBACK';
  }

  function ensurePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return false;
    forceVisibleFallback(panel);
    markUiIdentity(panel);
    return true;
  }

  function stopBootstrapWatch() {
    if (observer) observer.disconnect();
    observer = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
  }

  function startBootstrapWatch() {
    if (ensurePanel()) return;

    const root = document.documentElement;
    if (root && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (ensurePanel()) stopBootstrapWatch();
      });
      observer.observe(root, {childList: true, subtree: true});
    }

    pollTimer = setInterval(() => {
      if (ensurePanel()) stopBootstrapWatch();
    }, POLL_MS);

    stopTimer = setTimeout(stopBootstrapWatch, MAX_BOOT_MS);
  }

  function reassertAfterLayerChange() {
    setTimeout(() => { ensurePanel(); }, 0);
    setTimeout(() => { ensurePanel(); }, 120);
  }

  // The pinned v0.1.1 @require executes before this wrapper. It registers its
  // own DOMContentLoaded bootstrap while the document is still loading.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBootstrapWatch, {once: true});
  } else {
    startBootstrapWatch();
  }

  document.addEventListener('fullscreenchange', reassertAfterLayerChange, true);
  document.addEventListener('pointerlockchange', reassertAfterLayerChange, true);
})();
