// ==UserScript==
// @name         BCS Pointer Coordinate Probe
// @namespace    whoami.boosteroid.control-suite.probe
// @version      0.1.0
// @description  P0 diagnostic probe for Edge/Android pointer lock, relative deltas, absolute coordinates and gesture-resume resets. No gameplay input injection.
// @author       Whoami
// @match        https://example.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const TEST_MS = 12000;
  const LOCK_TIMEOUT_MS = 2500;
  const MAX_EVENTS = 5000;
  const RESUME_GAP_MS = 250;
  const EDGE_PX = 20;

  const now = () => performance.now();
  const round = (v, n = 3) => Number.isFinite(v) ? +v.toFixed(n) : null;
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;

  function labelElement(el) {
    if (!el || !el.tagName) return null;
    let s = el.tagName;
    if (el.id) s += `#${el.id}`;
    if (el.classList?.length) s += `.${[...el.classList].slice(0, 2).join('.')}`;
    return s;
  }

  function percentile(values, p) {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  }

  function summarize(values) {
    const a = values.filter(Number.isFinite);
    if (!a.length) return {count: 0, min: null, max: null, avg: null, p50: null, p95: null, p99: null};
    const sum = a.reduce((s, v) => s + v, 0);
    return {
      count: a.length,
      min: round(Math.min(...a)),
      max: round(Math.max(...a)),
      avg: round(sum / a.length),
      p50: round(percentile(a, .50)),
      p95: round(percentile(a, .95)),
      p99: round(percentile(a, .99))
    };
  }

  const S = {
    root: null,
    panel: null,
    header: null,
    status: null,
    runsBox: null,
    exportBtn: null,
    surface: null,
    dot: null,
    running: null,
    runs: [],
    drag: null,
    position: {x: 12, y: 12},
    lockTimer: null,
    testTimer: null,
    finalizeAfterUnlock: false,
    repromoteTimer: null
  };

  function environmentSnapshot() {
    let coalesced = false;
    try { coalesced = typeof PointerEvent !== 'undefined' && typeof PointerEvent.prototype?.getCoalescedEvents === 'function'; } catch {}
    return {
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      maxTouchPoints: navigator.maxTouchPoints || 0,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null,
      devicePixelRatio: window.devicePixelRatio || 1,
      viewport: {width: innerWidth, height: innerHeight},
      visualViewport: window.visualViewport ? {
        width: round(window.visualViewport.width),
        height: round(window.visualViewport.height),
        scale: round(window.visualViewport.scale),
        offsetLeft: round(window.visualViewport.offsetLeft),
        offsetTop: round(window.visualViewport.offsetTop)
      } : null,
      screen: {width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight},
      pointerEvent: typeof PointerEvent !== 'undefined',
      pointerRawUpdate: 'onpointerrawupdate' in window,
      getCoalescedEvents: coalesced,
      pointerLock: 'pointerLockElement' in document,
      requestPointerLock: typeof Element.prototype.requestPointerLock === 'function',
      fullscreen: 'fullscreenElement' in document,
      edgeDetected: /Edg\//i.test(navigator.userAgent || ''),
      chromiumDetected: /Chrome|Chromium|Edg\//i.test(navigator.userAgent || ''),
      androidDetected: /Android/i.test(navigator.userAgent || '')
    };
  }

  function createRun(deviceLabel, lockMode) {
    return {
      id: `${deviceLabel}-${lockMode}-${Date.now()}`,
      deviceLabel,
      lockMode,
      startedAtEpoch: Date.now(),
      startedAtPerf: null,
      endedAtPerf: null,
      stopReason: null,
      lockRequest: {attempted: false, returnedPromise: null, resolved: null, errorName: null, errorMessage: null},
      acquired: false,
      events: [],
      droppedEvents: 0,
      transitions: [],
      resumes: [],
      coalesced: {hostEvents: 0, samples: 0, movementX: 0, movementY: 0, maxSamplesPerHost: 0},
      virtual: {x: innerWidth / 2, y: innerHeight / 2},
      lastMotionPerf: null,
      lastMotion: null,
      environment: environmentSnapshot(),
      summary: null,
      classification: []
    };
  }

  function eventSample(type, e, t) {
    const cx = num(e.clientX), cy = num(e.clientY);
    const sx = num(e.screenX), sy = num(e.screenY);
    const dx = num(e.movementX), dy = num(e.movementY);
    const edgeDistance = (cx != null && cy != null)
      ? Math.min(cx, cy, Math.max(0, innerWidth - cx), Math.max(0, innerHeight - cy))
      : null;
    return {
      tMs: round(t - S.running.startedAtPerf),
      type,
      timeStamp: round(num(e.timeStamp)),
      movementX: dx,
      movementY: dy,
      clientX: cx,
      clientY: cy,
      screenX: sx,
      screenY: sy,
      pageX: num(e.pageX),
      pageY: num(e.pageY),
      button: num(e.button),
      buttons: num(e.buttons),
      pointerType: e.pointerType || null,
      pointerId: num(e.pointerId),
      pressure: num(e.pressure),
      isPrimary: typeof e.isPrimary === 'boolean' ? e.isPrimary : null,
      isTrusted: typeof e.isTrusted === 'boolean' ? e.isTrusted : null,
      firesTouchEvents: e.sourceCapabilities ? !!e.sourceCapabilities.firesTouchEvents : null,
      target: labelElement(e.target),
      pointerLocked: !!document.pointerLockElement,
      pointerLockElement: labelElement(document.pointerLockElement),
      nearViewportEdge: edgeDistance != null ? edgeDistance <= EDGE_PX : null,
      edgeDistancePx: round(edgeDistance)
    };
  }

  function recordTransition(kind, extra = {}) {
    const r = S.running;
    if (!r) return;
    r.transitions.push({
      tMs: r.startedAtPerf == null ? null : round(now() - r.startedAtPerf),
      kind,
      pointerLocked: !!document.pointerLockElement,
      pointerLockElement: labelElement(document.pointerLockElement),
      fullscreen: !!document.fullscreenElement,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      ...extra
    });
  }

  function recordEvent(type, e) {
    const r = S.running;
    if (!r || r.startedAtPerf == null) return;
    const t = now();
    const motionType = type === 'mousemove' || type === 'pointermove' || type === 'pointerrawupdate';

    if (motionType && r.lastMotionPerf != null && t - r.lastMotionPerf >= RESUME_GAP_MS) {
      const current = eventSample(type, e, t);
      const prev = r.lastMotion;
      r.resumes.push({
        tMs: current.tMs,
        gapMs: round(t - r.lastMotionPerf),
        previous: prev ? {
          clientX: prev.clientX, clientY: prev.clientY,
          screenX: prev.screenX, screenY: prev.screenY
        } : null,
        current: {
          clientX: current.clientX, clientY: current.clientY,
          screenX: current.screenX, screenY: current.screenY,
          movementX: current.movementX, movementY: current.movementY
        },
        clientJumpPx: (prev?.clientX != null && current.clientX != null)
          ? round(Math.hypot(current.clientX - prev.clientX, current.clientY - prev.clientY)) : null,
        screenJumpPx: (prev?.screenX != null && current.screenX != null)
          ? round(Math.hypot(current.screenX - prev.screenX, current.screenY - prev.screenY)) : null
      });
    }

    if (r.events.length < MAX_EVENTS) r.events.push(eventSample(type, e, t));
    else r.droppedEvents++;

    if (motionType) {
      r.lastMotionPerf = t;
      r.lastMotion = r.events[r.events.length - 1] || r.lastMotion;
    }

    if (type === 'pointermove' && typeof e.getCoalescedEvents === 'function') {
      try {
        const c = e.getCoalescedEvents() || [];
        r.coalesced.hostEvents++;
        r.coalesced.samples += c.length;
        r.coalesced.maxSamplesPerHost = Math.max(r.coalesced.maxSamplesPerHost, c.length);
        for (const s of c.slice(0, 64)) {
          const dx = num(s.movementX), dy = num(s.movementY);
          if (dx != null) r.coalesced.movementX += dx;
          if (dy != null) r.coalesced.movementY += dy;
        }
      } catch {}
    }

    if (type === 'mousemove') updateVirtualCursor(e);
  }

  function updateVirtualCursor(e) {
    const r = S.running;
    if (!r || !S.dot) return;
    const dx = num(e.movementX) || 0;
    const dy = num(e.movementY) || 0;
    r.virtual.x = Math.max(6, Math.min(innerWidth - 6, r.virtual.x + dx));
    r.virtual.y = Math.max(6, Math.min(innerHeight - 6, r.virtual.y + dy));
    S.dot.style.transform = `translate3d(${Math.round(r.virtual.x - 6)}px,${Math.round(r.virtual.y - 6)}px,0)`;
  }

  function summarizeRun(r) {
    const motion = r.events.filter(e => e.type === 'mousemove');
    const pointer = r.events.filter(e => e.type === 'pointermove');
    const raw = r.events.filter(e => e.type === 'pointerrawupdate');
    const dx = motion.map(e => e.movementX).filter(Number.isFinite);
    const dy = motion.map(e => e.movementY).filter(Number.isFinite);
    const cx = motion.map(e => e.clientX).filter(Number.isFinite);
    const cy = motion.map(e => e.clientY).filter(Number.isFinite);
    const nonZero = motion.filter(e => (e.movementX || 0) !== 0 || (e.movementY || 0) !== 0);
    const nearEdge = motion.filter(e => e.nearViewportEdge === true);

    let maxClientJump = 0;
    let suspiciousJumpCount = 0;
    const topJumps = [];
    for (let i = 1; i < motion.length; i++) {
      const a = motion[i - 1], b = motion[i];
      if (a.clientX == null || b.clientX == null) continue;
      const jump = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const rel = Math.hypot(b.movementX || 0, b.movementY || 0);
      maxClientJump = Math.max(maxClientJump, jump);
      if (jump >= 24 && rel <= Math.max(6, jump * .35)) suspiciousJumpCount++;
      if (jump >= 12) topJumps.push({tMs: b.tMs, jumpPx: round(jump), relativePx: round(rel), from: [a.clientX, a.clientY], to: [b.clientX, b.clientY]});
    }
    topJumps.sort((a, b) => b.jumpPx - a.jumpPx);

    const resumeJumps = r.resumes.map(x => x.clientJumpPx).filter(Number.isFinite);
    const clientRangeX = cx.length ? Math.max(...cx) - Math.min(...cx) : null;
    const clientRangeY = cy.length ? Math.max(...cy) - Math.min(...cy) : null;

    const summary = {
      durationMs: round((r.endedAtPerf ?? now()) - (r.startedAtPerf ?? now())),
      eventCounts: {
        totalStored: r.events.length,
        dropped: r.droppedEvents,
        mousemove: motion.length,
        pointermove: pointer.length,
        pointerrawupdate: raw.length,
        pointerdown: r.events.filter(e => e.type === 'pointerdown').length,
        pointerup: r.events.filter(e => e.type === 'pointerup').length,
        mousedown: r.events.filter(e => e.type === 'mousedown').length,
        mouseup: r.events.filter(e => e.type === 'mouseup').length
      },
      relative: {
        nonZeroMousemove: nonZero.length,
        zeroMousemove: motion.length - nonZero.length,
        movementX: summarize(dx),
        movementY: summarize(dy),
        maxVectorPx: motion.length ? round(Math.max(...motion.map(e => Math.hypot(e.movementX || 0, e.movementY || 0)))) : null
      },
      absolute: {
        clientX: summarize(cx),
        clientY: summarize(cy),
        clientRangeX: round(clientRangeX),
        clientRangeY: round(clientRangeY),
        nearEdgeEvents: nearEdge.length,
        maxConsecutiveClientJumpPx: round(maxClientJump),
        suspiciousJumpCount,
        topClientJumps: topJumps.slice(0, 20)
      },
      gestureResume: {
        gapThresholdMs: RESUME_GAP_MS,
        count: r.resumes.length,
        clientJumpPx: summarize(resumeJumps),
        samples: r.resumes.slice(0, 40)
      },
      coalesced: r.coalesced
    };

    const cls = [];
    if (!r.acquired) cls.push('POINTER_LOCK_NOT_ACQUIRED');
    if (r.acquired && nonZero.length === 0) cls.push('RELATIVE_DELTA_ZERO_OR_MISSING');
    if (r.acquired && motion.length > 20 && ((clientRangeX || 0) > 4 || (clientRangeY || 0) > 4)) cls.push('LOCKED_ABSOLUTE_COORDINATES_NOT_STABLE');
    if (nearEdge.length >= 5 && nonZero.length > 0) cls.push('ABSOLUTE_EDGE_ACTIVITY_DURING_RELATIVE_MOTION');
    if (resumeJumps.some(v => v >= 24)) cls.push('ABSOLUTE_RESUME_JUMP_CANDIDATE');
    if (suspiciousJumpCount > 0) cls.push('ABSOLUTE_RELATIVE_MISMATCH_CANDIDATE');
    if (r.acquired && nonZero.length > 20 && (clientRangeX || 0) <= 4 && (clientRangeY || 0) <= 4) cls.push('RELATIVE_CHANNEL_HEALTHY_IN_PROBE');
    if (!cls.length) cls.push('INCONCLUSIVE');

    r.summary = summary;
    r.classification = cls;
  }

  function packageExport() {
    return {
      probe: {
        name: 'BCS Pointer Coordinate Probe',
        version: VERSION,
        purpose: 'P0 Edge Android relative-pointer / absolute-coordinate mismatch diagnosis',
        policy: 'TEMPORARY_PRE_PLAY_DIAGNOSTIC'
      },
      exportedAt: new Date().toISOString(),
      testHost: location.href,
      instructions: {
        mouse: 'Move center -> horizontal edges -> vertical edges during lock.',
        dualSense: 'Drag touchpad, lift finger, touch again and drag repeatedly during lock.'
      },
      runs: S.runs,
      safety: {
        transportHooks: false,
        websocketHooks: false,
        rtcHooks: false,
        networkSends: 0,
        syntheticGameplayEvents: false,
        dispatchEventCalls: 0,
        storageMutation: false,
        boosteroidRuntimeTouched: false,
        pointerLockRequestedOnlyOnLocalProbeSurface: true
      },
      interpretation: {
        relativeBrokenInPureEdge: 'movementX/Y zero, malformed, huge spikes, or unstable alongside local virtual cursor failure',
        absoluteRelativeMismatch: 'relative deltas remain plausible while client/screen coordinates jump, clamp or reset',
        boosteroidNeededNext: 'pure Edge relative channel is healthy and stable; only then instrument Boosteroid passively',
        note: 'Classifications are diagnostic signals, not an upstream browser root-cause proof by themselves.'
      }
    };
  }

  function downloadPackage() {
    if (!S.runs.length) return;
    const text = JSON.stringify(packageExport(), null, 2);
    const blob = new Blob([text], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bcs-pointer-coordinate-probe-v010-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderRunList() {
    if (!S.runsBox) return;
    S.runsBox.innerHTML = '';
    if (!S.runs.length) {
      S.runsBox.textContent = 'Nenhum teste concluído.';
      return;
    }
    S.runs.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'bcs-ptr-run';
      row.textContent = `${i + 1}. ${r.deviceLabel} / ${r.lockMode}: ${r.classification.join(' + ')}`;
      S.runsBox.appendChild(row);
    });
    S.exportBtn.disabled = false;
  }

  function clearTimers() {
    if (S.lockTimer) clearTimeout(S.lockTimer);
    if (S.testTimer) clearTimeout(S.testTimer);
    S.lockTimer = null;
    S.testTimer = null;
  }

  function cleanupSurface() {
    if (S.surface) S.surface.remove();
    S.surface = null;
    S.dot = null;
  }

  function finalizeRun(reason) {
    const r = S.running;
    if (!r) return;
    clearTimers();
    r.endedAtPerf = now();
    r.stopReason = reason;
    recordTransition('FINALIZE', {reason});
    summarizeRun(r);
    S.runs.push(r);
    S.running = null;
    S.finalizeAfterUnlock = false;
    cleanupSurface();
    setStatus(`Concluído: ${r.deviceLabel}. ${r.classification[0]}`);
    renderRunList();
    setButtonsDisabled(false);
  }

  function stopRun(reason = 'timer_complete') {
    const r = S.running;
    if (!r) return;
    clearTimers();
    if (document.pointerLockElement) {
      S.finalizeAfterUnlock = true;
      recordTransition('EXIT_POINTER_LOCK_REQUESTED', {reason});
      try { document.exitPointerLock(); }
      catch { finalizeRun(`${reason}_exit_lock_error`); }
      setTimeout(() => {
        if (S.running && S.finalizeAfterUnlock) finalizeRun(`${reason}_unlock_timeout`);
      }, 800);
    } else {
      finalizeRun(reason);
    }
  }

  function buildSurface(deviceLabel) {
    const surface = document.createElement('div');
    surface.id = 'bcs-pointer-probe-surface';
    surface.tabIndex = 0;
    surface.innerHTML = `
      <div class="bcs-ptr-instruction">
        <strong>${deviceLabel}</strong><br>
        ${deviceLabel === 'DUALSENSE' ? 'Arraste no touchpad → solte → toque novamente → arraste.' : 'Mova centro → bordas horizontais → bordas verticais.'}<br>
        <span>12 segundos · ponto amarelo = integração local de movementX/Y</span>
      </div>
      <div class="bcs-ptr-dot" aria-hidden="true"></div>
    `;
    document.body.appendChild(surface);
    S.surface = surface;
    S.dot = surface.querySelector('.bcs-ptr-dot');
    const r = S.running;
    if (r && S.dot) S.dot.style.transform = `translate3d(${Math.round(r.virtual.x - 6)}px,${Math.round(r.virtual.y - 6)}px,0)`;
    return surface;
  }

  async function requestLock(surface, mode) {
    const r = S.running;
    if (!r) return;
    r.lockRequest.attempted = true;
    recordTransition('POINTER_LOCK_REQUEST', {mode});
    try {
      let ret;
      if (mode === 'UNADJUSTED') ret = surface.requestPointerLock({unadjustedMovement: true});
      else ret = surface.requestPointerLock();
      r.lockRequest.returnedPromise = !!ret && typeof ret.then === 'function';
      if (r.lockRequest.returnedPromise) {
        await ret;
        r.lockRequest.resolved = true;
      }
    } catch (err) {
      r.lockRequest.resolved = false;
      r.lockRequest.errorName = err?.name || 'Error';
      r.lockRequest.errorMessage = String(err?.message || err);
      recordTransition('POINTER_LOCK_REQUEST_ERROR', {name: r.lockRequest.errorName, message: r.lockRequest.errorMessage});
      finalizeRun('lock_request_error');
    }
  }

  function startRun(deviceLabel, lockMode = 'NORMAL') {
    if (S.running) return;
    const r = createRun(deviceLabel, lockMode);
    S.running = r;
    setButtonsDisabled(true);
    setStatus(`Preparando ${deviceLabel} / ${lockMode}…`);
    const surface = buildSurface(deviceLabel);
    surface.focus({preventScroll: true});
    S.lockTimer = setTimeout(() => {
      if (S.running && !S.running.acquired) finalizeRun('lock_acquisition_timeout');
    }, LOCK_TIMEOUT_MS);
    requestLock(surface, lockMode);
  }

  function onPointerLockChange() {
    const r = S.running;
    if (!r) return;
    recordTransition('pointerlockchange');
    if (document.pointerLockElement === S.surface && !r.acquired) {
      r.acquired = true;
      r.startedAtPerf = now();
      r.lastMotionPerf = null;
      r.lastMotion = null;
      if (S.lockTimer) clearTimeout(S.lockTimer);
      S.lockTimer = null;
      setStatus(`${r.deviceLabel}: LOCK ATIVO — mova agora (12s)`);
      S.testTimer = setTimeout(() => stopRun('timer_complete'), TEST_MS);
      return;
    }
    if (!document.pointerLockElement && S.finalizeAfterUnlock) {
      finalizeRun('timer_complete');
      return;
    }
    if (!document.pointerLockElement && r.acquired && !S.finalizeAfterUnlock) {
      finalizeRun('unexpected_lock_loss');
    }
  }

  function onPointerLockError() {
    if (!S.running) return;
    recordTransition('pointerlockerror');
    finalizeRun('pointerlockerror');
  }

  function setStatus(text) {
    if (S.status) S.status.textContent = text;
  }

  function setButtonsDisabled(disabled) {
    if (!S.panel) return;
    S.panel.querySelectorAll('button[data-run]').forEach(b => b.disabled = disabled);
    const stop = S.panel.querySelector('[data-stop]');
    if (stop) stop.disabled = !disabled;
  }

  function clampPosition() {
    if (!S.panel) return;
    const rect = S.panel.getBoundingClientRect();
    const margin = 6;
    const maxX = Math.max(margin, innerWidth - Math.min(rect.width, innerWidth - margin) - margin);
    const maxY = Math.max(margin, innerHeight - Math.min(44, rect.height) - margin);
    S.position.x = Math.max(margin, Math.min(maxX, S.position.x));
    S.position.y = Math.max(margin, Math.min(maxY, S.position.y));
    S.panel.style.left = `${Math.round(S.position.x)}px`;
    S.panel.style.top = `${Math.round(S.position.y)}px`;
  }

  function setupDrag() {
    const h = S.header;
    if (!h) return;
    h.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest('button')) return;
      const rect = S.panel.getBoundingClientRect();
      S.drag = {id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false};
      try { h.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    h.addEventListener('pointermove', e => {
      if (!S.drag || S.drag.id !== e.pointerId) return;
      const nx = e.clientX - S.drag.dx;
      const ny = e.clientY - S.drag.dy;
      if (Math.abs(nx - S.position.x) + Math.abs(ny - S.position.y) > 4) S.drag.moved = true;
      S.position.x = nx;
      S.position.y = ny;
      clampPosition();
    });
    const end = e => {
      if (!S.drag || S.drag.id !== e.pointerId) return;
      try { h.releasePointerCapture(e.pointerId); } catch {}
      S.drag = null;
      clampPosition();
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  }

  function repromoteTopLayer() {
    if (!S.panel || typeof S.panel.showPopover !== 'function') return;
    clearTimeout(S.repromoteTimer);
    S.repromoteTimer = setTimeout(() => {
      try {
        if (S.panel.matches(':popover-open')) S.panel.hidePopover();
        S.panel.showPopover();
      } catch {}
      clampPosition();
    }, 0);
  }

  function installStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #bcs-pointer-probe-panel {
        position: fixed; inset: auto; margin: 0; width: min(360px, calc(100vw - 12px));
        max-height: calc(100dvh - 12px); overflow: auto; overscroll-behavior: contain;
        background: rgba(15,17,22,.97); color: #f5f7fb; border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px; box-shadow: 0 12px 36px rgba(0,0,0,.45); padding: 0;
        font: 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
        z-index: 2147483647; user-select: none;
      }
      #bcs-pointer-probe-panel::backdrop { background: transparent; pointer-events: none; }
      .bcs-ptr-header { position: sticky; top: 0; z-index: 2; display:flex; align-items:center; justify-content:space-between;
        padding:10px 12px; background:#151923; border-bottom:1px solid rgba(255,255,255,.10); cursor:grab; touch-action:none; }
      .bcs-ptr-header strong { font-size:12px; letter-spacing:.2px; }
      .bcs-ptr-body { padding:10px 12px 12px; }
      .bcs-ptr-status { margin:0 0 8px; padding:7px 8px; border-radius:8px; background:rgba(255,255,255,.07); }
      .bcs-ptr-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
      #bcs-pointer-probe-panel button { min-height:40px; border:0; border-radius:8px; padding:8px; font-weight:700; }
      #bcs-pointer-probe-panel button:disabled { opacity:.45; }
      .bcs-ptr-secondary { margin-top:7px; width:100%; }
      .bcs-ptr-help { margin:8px 0; opacity:.78; font-size:11px; }
      .bcs-ptr-runs { display:grid; gap:5px; margin-top:8px; }
      .bcs-ptr-run { padding:6px 7px; background:rgba(255,255,255,.055); border-radius:7px; overflow-wrap:anywhere; }
      #bcs-pointer-probe-surface { position:fixed; inset:0; z-index:2147483645; background:rgba(8,10,14,.92); color:white; cursor:crosshair; overflow:hidden; }
      .bcs-ptr-instruction { position:absolute; left:50%; top:18px; transform:translateX(-50%); width:min(560px,calc(100vw - 24px));
        text-align:center; padding:9px 10px; border-radius:10px; background:rgba(0,0,0,.55); font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; pointer-events:none; }
      .bcs-ptr-instruction span { opacity:.72; font-size:11px; }
      .bcs-ptr-dot { position:absolute; left:0; top:0; width:12px; height:12px; border-radius:50%; background:#ffd43b; box-shadow:0 0 0 2px rgba(0,0,0,.7); pointer-events:none; will-change:transform; }
    `;
    document.documentElement.appendChild(style);
  }

  function buildUi() {
    installStyles();
    const panel = document.createElement('div');
    panel.id = 'bcs-pointer-probe-panel';
    panel.setAttribute('popover', 'manual');
    panel.innerHTML = `
      <div class="bcs-ptr-header"><strong>PTR PROBE v${VERSION}</strong><span>arraste aqui</span></div>
      <div class="bcs-ptr-body">
        <div class="bcs-ptr-status">Pronto. Rode primeiro fora do Boosteroid.</div>
        <div class="bcs-ptr-help">Cada teste dura 12s. O ponto amarelo é um cursor virtual calculado somente com <code>movementX/Y</code>.</div>
        <div class="bcs-ptr-grid">
          <button data-run="mouse">MOUSE FÍSICO<br>LOCK NORMAL</button>
          <button data-run="dualsense">DUALSENSE<br>LOCK NORMAL</button>
        </div>
        <button class="bcs-ptr-secondary" data-run="unadjusted">MOUSE · UNADJUSTED (opcional)</button>
        <button class="bcs-ptr-secondary" data-stop disabled>PARAR TESTE</button>
        <div class="bcs-ptr-runs">Nenhum teste concluído.</div>
        <button class="bcs-ptr-secondary" data-export disabled>BAIXAR PACOTE JSON</button>
      </div>
    `;
    document.documentElement.appendChild(panel);
    S.panel = panel;
    S.header = panel.querySelector('.bcs-ptr-header');
    S.status = panel.querySelector('.bcs-ptr-status');
    S.runsBox = panel.querySelector('.bcs-ptr-runs');
    S.exportBtn = panel.querySelector('[data-export]');

    panel.querySelector('[data-run="mouse"]').addEventListener('click', () => startRun('MOUSE_FISICO', 'NORMAL'));
    panel.querySelector('[data-run="dualsense"]').addEventListener('click', () => startRun('DUALSENSE', 'NORMAL'));
    panel.querySelector('[data-run="unadjusted"]').addEventListener('click', () => startRun('MOUSE_FISICO', 'UNADJUSTED'));
    panel.querySelector('[data-stop]').addEventListener('click', () => stopRun('manual_stop'));
    S.exportBtn.addEventListener('click', downloadPackage);

    try { panel.showPopover(); } catch {}
    setupDrag();
    clampPosition();
  }

  const passiveCapture = {capture: true, passive: true};
  window.addEventListener('mousemove', e => recordEvent('mousemove', e), passiveCapture);
  window.addEventListener('pointermove', e => recordEvent('pointermove', e), passiveCapture);
  window.addEventListener('pointerrawupdate', e => recordEvent('pointerrawupdate', e), passiveCapture);
  window.addEventListener('pointerdown', e => recordEvent('pointerdown', e), passiveCapture);
  window.addEventListener('pointerup', e => recordEvent('pointerup', e), passiveCapture);
  window.addEventListener('pointercancel', e => recordEvent('pointercancel', e), passiveCapture);
  window.addEventListener('mousedown', e => recordEvent('mousedown', e), passiveCapture);
  window.addEventListener('mouseup', e => recordEvent('mouseup', e), passiveCapture);
  document.addEventListener('pointerlockchange', onPointerLockChange, true);
  document.addEventListener('pointerlockerror', onPointerLockError, true);
  document.addEventListener('fullscreenchange', () => {
    if (S.running) recordTransition('fullscreenchange');
    repromoteTopLayer();
  }, true);
  window.addEventListener('resize', () => clampPosition(), {passive: true});
  window.visualViewport?.addEventListener('resize', () => clampPosition(), {passive: true});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi, {once: true});
  else buildUi();
})();
