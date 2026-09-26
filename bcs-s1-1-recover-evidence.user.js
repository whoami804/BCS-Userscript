// ==UserScript==
// @name         BCS S1.1 - Recover Evidence
// @namespace    whoami.boosteroid.control-suite
// @version      1.0.0
// @description  Recovers the already-recorded S1.1 deferred evidence without entering a Boosteroid queue.
// @author       Whoami
// @match        https://boosteroid.com/*
// @match        https://cloud.boosteroid.com/*
// @match        https://*.boosteroid.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';

  const COOKIE = 'bcs_s11_ev';

  function readEvidence() {
    try {
      const prefix = `${COOKIE}=`;
      const raw = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
      if (!raw) return null;
      const parsed = JSON.parse(decodeURIComponent(raw.slice(prefix.length)));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function downloadEvidence(evidence) {
    const text = JSON.stringify(evidence, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const t = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `bcs-s1-1-recovered-${t}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function mount() {
    if (!document.body || document.getElementById('bcs-s11-recover')) return;

    const evidence = readEvidence();
    const wrap = document.createElement('div');
    wrap.id = 'bcs-s11-recover';
    wrap.style.cssText = 'position:fixed;left:12px;bottom:18px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:6px;max-width:min(340px,calc(100vw - 24px));';

    const status = document.createElement('div');
    status.style.cssText = 'padding:8px 10px;border-radius:10px;background:rgba(10,10,14,.94);color:#fff;border:1px solid rgba(255,255,255,.18);font-size:11px;line-height:1.35;';
    status.textContent = evidence
      ? `S1.1 encontrado • ${evidence.activeStreamConfirmed ? 'RUNTIME CONFIRMADO' : 'STREAM NÃO CONFIRMADO'} • ${evidence.updatedAt || 'sem horário'}`
      : 'S1.1: nenhuma evidência encontrada neste navegador.';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = evidence ? 'BAIXAR LOG S1.1 RECUPERADO' : 'SEM LOG S1.1 PARA BAIXAR';
    button.disabled = !evidence;
    button.style.cssText = 'padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(24,24,30,.97);color:#fff;font-weight:800;font-size:12px;';
    if (!evidence) button.style.opacity = '.45';
    button.addEventListener('click', () => {
      const current = readEvidence();
      if (!current) {
        alert('Nenhuma evidência S1.1 foi encontrada. Não entre na fila novamente.');
        return;
      }
      downloadEvidence(current);
    });

    wrap.append(status, button);
    document.body.appendChild(wrap);
  }

  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount, { once: true });
})();
