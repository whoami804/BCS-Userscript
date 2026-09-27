// ==UserScript==
// @name         BCS Emergency Evidence Cookie Cleaner
// @namespace    whoami.boosteroid.control-suite
// @version      1.0.0
// @description  Removes only BCS evidence cookies that can overflow Boosteroid request headers. Does not touch Boosteroid auth cookies.
// @author       Whoami
// @match        https://boosteroid.com/*
// @match        https://cloud.boosteroid.com/*
// @match        https://*.boosteroid.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const TARGETS = ['bcs_s11_ev', 'bcs_s12_ev'];

  function expire(name, domainPart = '') {
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure${domainPart}`;
  }

  function clean() {
    for (const name of TARGETS) {
      // Remove host-only and shared-domain variants.
      expire(name);
      expire(name, '; Domain=.boosteroid.com');
      expire(name, `; Domain=${location.hostname}`);
    }
  }

  clean();

  function mount() {
    if (!document.body || document.getElementById('bcs-cookie-cleaner-status')) return;
    const box = document.createElement('div');
    box.id = 'bcs-cookie-cleaner-status';
    box.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;bottom:18px;padding:12px;border-radius:12px;background:#111;color:#fff;border:1px solid #444;font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.35';
    box.innerHTML = '<b>BCS Cookie Cleaner executado.</b><br>Foram removidos apenas os cookies de evidência BCS: <code>bcs_s11_ev</code> e <code>bcs_s12_ev</code>.<br><br><button id="bcs-cleaner-reload" style="padding:10px 12px;border-radius:9px;border:0;font-weight:700">RECARREGAR BOOSTEROID</button>';
    document.body.appendChild(box);
    document.getElementById('bcs-cleaner-reload')?.addEventListener('click', () => location.reload());
  }

  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount, { once: true });
})();
