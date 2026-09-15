// ==UserScript==
// @name         BCS Pointer Coordinate Probe
// @namespace    whoami.boosteroid.control-suite.probe
// @version      0.1.3
// @description  Local-run start fix over frozen v0.1.1 core; Boosteroid passive path remains untouched.
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

  const UI_VERSION = '0.1.3';
  const CORE_VERSION = '0.1.1';
  const TEST_MS = 12000;
  const LOCK_TIMEOUT_MS = 2500;
  const MAX_EVENTS = 6000;
  const PANEL_ID = 'bcs-pointer-probe-panel';
  const SURFACE_ID = 'bcs-pointer-probe-surface-v013';
  const IS_BOOSTEROID = /(^|\.)boosteroid\.com$/i.test(location.hostname);
  const now = () => performance.now();
  const round = (v, n = 3) => Number.isFinite(v) ? +v.toFixed(n) : null;
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;

  const L = {
    panel: null,
    running: null,
    runs: [],
    surface: null,
    lockTimer: null,
    testTimer: null,
    finalizeAfterUnlock: false,
    bootTimer: null
  };

  function popoverOpen(panel) {
    try { return panel.matches(':popover-open'); } catch { return false; }
  }

  function forceVisible(panel) {
    if (popoverOpen(panel)) return;
    panel.removeAttribute('popover');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    panel.style.setProperty('pointer-events', 'auto', 'important');
    panel.style.setProperty('position', 'fixed', 'important');
    panel.style.setProperty('z-index', '2147483647', 'important');
  }

  function status(text) {
    const el = L.panel?.querySelector('.bcs-ptr-status');
    if (el) el.textContent = text;
  }

  function percentile(values, p) {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const i = (a.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
  }

  function summarize(values) {
    const a = values.filter(Number.isFinite);
    if (!a.length) return {count:0,min:null,max:null,avg:null,p50:null,p95:null,p99:null};
    return {
      count:a.length,
      min:round(Math.min(...a)), max:round(Math.max(...a)),
      avg:round(a.reduce((s,v)=>s+v,0)/a.length),
      p50:round(percentile(a,.50)), p95:round(percentile(a,.95)), p99:round(percentile(a,.99))
    };
  }

  function environment() {
    return {
      href: location.href,
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      maxTouchPoints: navigator.maxTouchPoints || 0,
      viewport: {width: innerWidth, height: innerHeight},
      screen: {width: screen.width, height: screen.height},
      devicePixelRatio: devicePixelRatio || 1,
      pointerRawUpdate: 'onpointerrawupdate' in window,
      getCoalescedEvents: typeof PointerEvent !== 'undefined' && typeof PointerEvent.prototype?.getCoalescedEvents === 'function',
      edgeDetected: /Edg\//i.test(navigator.userAgent || ''),
      chromiumDetected: /Chrome|Chromium|Edg\//i.test(navigator.userAgent || '')
    };
  }

  function makeRun(mode) {
    return {
      id: `MOUSE_FISICO-${mode}-${Date.now()}`,
      deviceLabel: 'MOUSE_FISICO', mode,
      startedAtEpoch: Date.now(), startedAtPerf: null, endedAtPerf: null,
      stopReason: null,
      lockRequest: {attempted:false, returnedPromise:null, resolved:null, errorName:null, errorMessage:null},
      acquired:false, everPointerLocked:false,
      events:[], droppedEvents:0, transitions:[],
      environmentStart: environment(), environmentEnd:null,
      summary:null, classification:[]
    };
  }

  function transition(kind, extra={}) {
    const r = L.running;
    if (!r) return;
    r.transitions.push({
      tMs: r.startedAtPerf == null ? null : round(now() - r.startedAtPerf),
      kind,
      pointerLocked: !!document.pointerLockElement,
      pointerLockElement: document.pointerLockElement?.id || null,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      ...extra
    });
  }

  function record(type, e) {
    const r = L.running;
    if (!r || r.startedAtPerf == null) return;
    const sample = {
      tMs: round(now() - r.startedAtPerf), type,
      movementX:num(e.movementX), movementY:num(e.movementY),
      clientX:num(e.clientX), clientY:num(e.clientY),
      screenX:num(e.screenX), screenY:num(e.screenY),
      buttons:num(e.buttons), pointerType:e.pointerType || null,
      isTrusted:typeof e.isTrusted === 'boolean' ? e.isTrusted : null,
      pointerLocked:!!document.pointerLockElement
    };
    if (r.events.length < MAX_EVENTS) r.events.push(sample); else r.droppedEvents++;
  }

  function summarizeRun(r) {
    const motion = r.events.filter(e => e.type === 'mousemove');
    const locked = motion.filter(e => e.pointerLocked);
    const nonZero = locked.filter(e => (e.movementX||0)!==0 || (e.movementY||0)!==0);
    const dx = locked.map(e=>e.movementX).filter(Number.isFinite);
    const dy = locked.map(e=>e.movementY).filter(Number.isFinite);
    const cx = locked.map(e=>e.clientX).filter(Number.isFinite);
    const cy = locked.map(e=>e.clientY).filter(Number.isFinite);
    const rangeX = cx.length ? Math.max(...cx)-Math.min(...cx) : null;
    const rangeY = cy.length ? Math.max(...cy)-Math.min(...cy) : null;
    const maxVector = locked.length ? Math.max(...locked.map(e=>Math.hypot(e.movementX||0,e.movementY||0))) : null;

    r.summary = {
      durationMs: r.startedAtPerf == null ? null : round(r.endedAtPerf - r.startedAtPerf),
      eventCounts: {
        totalStored:r.events.length, dropped:r.droppedEvents,
        mousemove:motion.length,
        pointermove:r.events.filter(e=>e.type==='pointermove').length,
        pointerrawupdate:r.events.filter(e=>e.type==='pointerrawupdate').length,
        lockedMousemove:locked.length, lockedNonZeroMousemove:nonZero.length
      },
      relative: {movementX:summarize(dx), movementY:summarize(dy), maxVectorPx:round(maxVector)},
      absolute: {clientX:summarize(cx), clientY:summarize(cy), clientRangeX:round(rangeX), clientRangeY:round(rangeY)}
    };

    const cls=[];
    if (!r.acquired) cls.push('POINTER_LOCK_NOT_ACQUIRED');
    if (r.acquired && locked.length > 0 && nonZero.length === 0) cls.push('RELATIVE_DELTA_ZERO_OR_MISSING_WHILE_LOCKED');
    if (locked.length > 20 && nonZero.length > 20 && (rangeX||0) <= 4 && (rangeY||0) <= 4) cls.push('RELATIVE_CHANNEL_HEALTHY_WHILE_LOCKED');
    if (locked.length > 20 && ((rangeX||0) > 4 || (rangeY||0) > 4)) cls.push('LOCKED_ABSOLUTE_COORDINATES_NOT_STABLE');
    if (!cls.length) cls.push('INCONCLUSIVE');
    r.classification=cls;
  }

  function clearTimers() {
    clearTimeout(L.lockTimer); clearTimeout(L.testTimer);
    L.lockTimer = L.testTimer = null;
  }

  function cleanupSurface() {
    L.surface?.remove();
    L.surface = null;
  }

  function renderRuns() {
    const box = L.panel?.querySelector('.bcs-ptr-runs');
    if (!box) return;
    box.innerHTML = '';
    for (const [i,r] of L.runs.entries()) {
      const row=document.createElement('div');
      row.className='bcs-ptr-run';
      row.textContent=`${i+1}. MOUSE / ${r.mode}: ${r.classification.join(' + ')}`;
      box.appendChild(row);
    }
    const exp=L.panel.querySelector('[data-v013-export]');
    if (exp) exp.disabled = L.runs.length === 0;
  }

  function finalize(reason) {
    const r=L.running;
    if (!r) return;
    clearTimers();
    r.endedAtPerf=now(); r.stopReason=reason;
    transition('FINALIZE',{reason});
    r.environmentEnd=environment();
    summarizeRun(r);
    L.runs.push(r);
    L.running=null; L.finalizeAfterUnlock=false;
    cleanupSurface();
    status(`Concluído: ${r.mode} · ${r.classification[0]}`);
    renderRuns();
    setButtons(false);
  }

  function stop(reason='timer_complete') {
    if (!L.running) return;
    clearTimers();
    if (document.pointerLockElement === L.surface) {
      L.finalizeAfterUnlock=true;
      transition('EXIT_LOCAL_POINTER_LOCK_REQUESTED',{reason});
      try { document.exitPointerLock(); } catch { finalize(`${reason}_exit_lock_error`); }
      setTimeout(()=>{ if (L.running && L.finalizeAfterUnlock) finalize(`${reason}_unlock_timeout`); },800);
    } else finalize(reason);
  }

  function buildSurface(mode) {
    const s=document.createElement('div');
    s.id=SURFACE_ID; s.tabIndex=0;
    s.style.cssText='position:fixed;inset:0;z-index:2147483645;background:rgba(8,10,14,.94);color:white;cursor:crosshair;';
    s.innerHTML=`<div style="position:absolute;left:50%;top:20px;transform:translateX(-50%);padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.6);font:13px sans-serif;text-align:center;pointer-events:none"><strong>${mode}</strong><br>Mova direita → esquerda → cima → baixo por 12 segundos.</div>`;
    document.body.appendChild(s); L.surface=s; return s;
  }

  async function requestLock(surface, mode) {
    const r=L.running; if (!r) return;
    r.lockRequest.attempted=true; transition('POINTER_LOCK_REQUEST',{mode});
    try {
      const ret = mode === 'LOCAL_UNADJUSTED' ? surface.requestPointerLock({unadjustedMovement:true}) : surface.requestPointerLock();
      r.lockRequest.returnedPromise=!!ret && typeof ret.then==='function';
      if (r.lockRequest.returnedPromise) await ret;
      r.lockRequest.resolved=true;
    } catch(err) {
      r.lockRequest.resolved=false; r.lockRequest.errorName=err?.name||'Error'; r.lockRequest.errorMessage=String(err?.message||err);
      transition('POINTER_LOCK_REQUEST_ERROR',{name:r.lockRequest.errorName,message:r.lockRequest.errorMessage});
      finalize('lock_request_error');
    }
  }

  function start(mode) {
    if (IS_BOOSTEROID || L.running) return;
    const r=makeRun(mode); L.running=r; setButtons(true);
    status(`Preparando ${mode}…`);
    const surface=buildSurface(mode); surface.focus({preventScroll:true});
    L.lockTimer=setTimeout(()=>{ if (L.running && !L.running.acquired) finalize('lock_acquisition_timeout'); },LOCK_TIMEOUT_MS);
    requestLock(surface,mode);
  }

  function onLockChange() {
    const r=L.running; if (!r) return;
    // v0.1.3 fix: start timing is keyed by startedAtPerf, not by acquired.
    // Transition recording may mark acquired in other implementations; timing must remain independent.
    if (document.pointerLockElement === L.surface && r.startedAtPerf == null) {
      r.acquired=true; r.everPointerLocked=true;
      r.startedAtPerf=now();
      clearTimeout(L.lockTimer); L.lockTimer=null;
      transition('pointerlockchange');
      status(`${r.mode}: LOCK ATIVO — mova agora (12s)`);
      L.testTimer=setTimeout(()=>stop('timer_complete'),TEST_MS);
      return;
    }
    transition('pointerlockchange');
    if (!document.pointerLockElement && L.finalizeAfterUnlock) { finalize('timer_complete'); return; }
    if (!document.pointerLockElement && r.acquired && !L.finalizeAfterUnlock) finalize('unexpected_lock_loss');
  }

  function setButtons(running) {
    if (!L.panel) return;
    L.panel.querySelectorAll('[data-v013-run]').forEach(b=>b.disabled=running);
    const stopBtn=L.panel.querySelector('[data-v013-stop]'); if (stopBtn) stopBtn.disabled=!running;
  }

  function exportPackage() {
    if (!L.runs.length) return;
    const data={
      probe:{name:'BCS Pointer Coordinate Probe',version:UI_VERSION,coreVersion:CORE_VERSION,purpose:'P0 pure Edge physical-mouse NORMAL vs UNADJUSTED comparison',policy:'TEMPORARY_PRE_PLAY_LOCAL_DIAGNOSTIC'},
      exportedAt:new Date().toISOString(), testHost:location.href, hostMode:'PURE_EDGE_LOCAL_LOCK_V013', runs:L.runs,
      safety:{transportHooks:false,websocketHooks:false,rtcHooks:false,networkSends:0,syntheticGameplayEvents:false,storageMutation:false,boosteroidRuntimeMutation:false,boosteroidPointerLockRequests:0}
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`bcs-pointer-coordinate-probe-v013-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    a.style.display='none'; document.documentElement.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function installLocalControls(panel) {
    if (IS_BOOSTEROID || panel.dataset.v013LocalInstalled === '1') return;
    panel.dataset.v013LocalInstalled='1';
    panel.querySelectorAll('[data-run="mouse"],[data-run="dualsense"],[data-run="unadjusted"],[data-stop],[data-export]').forEach(el=>el.style.display='none');
    const body=panel.querySelector('.bcs-ptr-body');
    const runs=panel.querySelector('.bcs-ptr-runs');
    if (!body || !runs) return;
    const block=document.createElement('div');
    block.innerHTML=`<div class="bcs-ptr-help"><strong>v0.1.3 · LOCAL START FIX</strong><br>Teste somente o mouse físico.</div><div class="bcs-ptr-grid"><button data-v013-run="normal">MOUSE FÍSICO<br>LOCK NORMAL</button><button data-v013-run="unadjusted">MOUSE<br>UNADJUSTED</button></div><button class="bcs-ptr-secondary" data-v013-stop disabled>PARAR TESTE</button><button class="bcs-ptr-secondary" data-v013-export disabled>BAIXAR PACOTE JSON v0.1.3</button>`;
    runs.before(block);
    block.querySelector('[data-v013-run="normal"]').addEventListener('click',()=>start('LOCAL_NORMAL'));
    block.querySelector('[data-v013-run="unadjusted"]').addEventListener('click',()=>start('LOCAL_UNADJUSTED'));
    block.querySelector('[data-v013-stop]').addEventListener('click',()=>stop('manual_stop'));
    block.querySelector('[data-v013-export]').addEventListener('click',exportPackage);
    const newExport=block.querySelector('[data-v013-export]');
    if (newExport) newExport.disabled=true;
  }

  function ensurePanel() {
    const panel=document.getElementById(PANEL_ID); if (!panel) return false;
    L.panel=panel; forceVisible(panel);
    const title=panel.querySelector('.bcs-ptr-header strong'); if (title) title.textContent=`PTR PROBE v${UI_VERSION}`;
    let badge=panel.querySelector('#bcs-ptr-v013-badge');
    if (!badge) {
      badge=document.createElement('div'); badge.id='bcs-ptr-v013-badge';
      badge.style.cssText='padding:5px 12px 0;font-size:10px;opacity:.65;pointer-events:none;';
      badge.textContent=IS_BOOSTEROID?`core ${CORE_VERSION} congelado · UI ${UI_VERSION}`:`core ${CORE_VERSION} congelado · local runner ${UI_VERSION}`;
      panel.querySelector('.bcs-ptr-body')?.prepend(badge);
    }
    installLocalControls(panel);
    return true;
  }

  window.addEventListener('mousemove',e=>record('mousemove',e),{capture:true,passive:true});
  window.addEventListener('pointermove',e=>record('pointermove',e),{capture:true,passive:true});
  window.addEventListener('pointerrawupdate',e=>record('pointerrawupdate',e),{capture:true,passive:true});
  document.addEventListener('pointerlockchange',onLockChange,true);
  document.addEventListener('pointerlockerror',()=>{ if (L.running) finalize('pointerlockerror'); },true);

  function boot() {
    if (ensurePanel()) return;
    const obs=new MutationObserver(()=>{ if (ensurePanel()) obs.disconnect(); });
    if (document.documentElement) obs.observe(document.documentElement,{childList:true,subtree:true});
    L.bootTimer=setInterval(()=>{ if (ensurePanel()) { clearInterval(L.bootTimer); L.bootTimer=null; obs.disconnect(); } },100);
    setTimeout(()=>{ clearInterval(L.bootTimer); L.bootTimer=null; obs.disconnect(); },8000);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  document.addEventListener('fullscreenchange',()=>setTimeout(ensurePanel,0),true);
})();
