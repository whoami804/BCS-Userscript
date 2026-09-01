// ==UserScript==
// @name         Control Suite - Boosteroid
// @namespace    whoami.boosteroid.control-suite
// @version      0.9.0-rc1
// @description  Product Experience candidate: movable native-style UI + automatic persistent stream profile on the RC19 gameplay foundation.
// @author       Whoami
// @homepageURL  https://github.com/whoami804/BCS-Userscript
// @updateURL    https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js
// @downloadURL  https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js
// @match        https://boosteroid.com/*
// @match        https://cloud.boosteroid.com/*
// @match        https://*.boosteroid.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

const VERSION = '0.9.0-rc1';
const BUILD = 'Product Experience UI + Auto-Persist Stream Profile + RC19 Gameplay Foundation - RC1';
const SAMPLE_MS = 1000;
const CONTEXT_MS = 15000;
const STARTUP_STABLE_SAMPLES = 5;
const COMPOSITOR_REGIME_CONFIRM_SAMPLES = 3;
const RESOLUTION_PROOF_CONFIRM_SAMPLES = 3;
const RESOLUTION_PROOF_TIMEOUT_SEC = 8;
const MAX_SAMPLES = 900;
const MAX_IMPORTANT_EVENTS = 180;
const CHORD_FIX_CONTROL_EVENT = '__BCS_RC15_CHORDED_MOUSE_FIX_CONTROL__';
const CHORD_FIX_OBS_EVENT = '__BCS_RC15_CHORDED_MOUSE_FIX_OBS__';
const MOTION_FIX_CONTROL_EVENT = '__BCS_RC19_MOUSE_SCHED_FIX_CONTROL__';
const MOTION_FIX_OBS_EVENT = '__BCS_RC19_MOUSE_SCHED_FIX_OBS__';
const IMMERSIVE_KEY_CODES = Object.freeze(['Escape','Tab']);
const IMMERSIVE_EXIT_CHORD = Object.freeze({ code:'Escape', ctrlKey:true, altKey:true, shiftKey:true });
const IMMERSIVE_EXIT_CHORD_LABEL = 'Ctrl+Alt+Shift+Esc';
const BRIDGE_REQ = '__BCS_V06_REQ__';
const BRIDGE_RES = '__BCS_V06_RES__';
const DEBUG = false;

const K = {
  lab: 'bcs.lab',
  network: 'bcs.network',
  panelOpen: 'bcs.panelOpen',
  uiPanelX: 'bcs.ui.panel.x',
  uiPanelY: 'bcs.ui.panel.y',
  uiFabX: 'bcs.ui.fab.x',
  uiFabY: 'bcs.ui.fab.y',
  mouseSmoothness: 'bcs.input.mouseSmoothness',
  controlEnabled: 'bcs.control.enabled',
  resolutionOneShot: 'bcs.resolution.oneShot',
  resolutionMode: 'bcs.control.resolution.mode',
  resolutionW: 'bcs.control.resolution.w',
  resolutionH: 'bcs.control.resolution.h',
  bitrateAuto: 'bcs.control.bitrate.auto',
  bitrateManual: 'bcs.control.bitrate.mbps',
  fps: 'fpsRateValue',
  bitrateH264: 'bitrateValue',
  bitrateAV1: 'bitrateValueForAV1',
  displayScale: 'use-display-scale-preferences',
  monitorResolution: 'use-monitor-resolution'
};

const RES_PRESETS = {
  native: null,
  '1920x1080': { width: 1920, height: 1080 },
  '2400x1080': { width: 2400, height: 1080 },
  '2532x1170': { width: 2532, height: 1170 },
  '2560x1080': { width: 2560, height: 1080 }
};

const $ = id => document.getElementById(id);
const now = () => performance.now();
const round = (v, n = 3) => Number.isFinite(v) ? +v.toFixed(n) : null;
const lsGet = (k, f = null) => { try { return localStorage.getItem(k) ?? f; } catch { return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };
const lsRemove = k => { try { localStorage.removeItem(k); } catch {} };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;

const SHARED_COOKIE = 'bcs_v07_cfg';
const SHARED_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function readSharedConfig() {
  try {
    const prefix = `${SHARED_COOKIE}=`;
    const raw = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw.slice(prefix.length)));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeSharedConfig(cfg) {
  try {
    const value = encodeURIComponent(JSON.stringify(cfg));
    document.cookie = `${SHARED_COOKIE}=${value}; Path=/; Domain=.boosteroid.com; Max-Age=${SHARED_COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
    return true;
  } catch { return false; }
}

function isAutoEnabled() {
  return lsGet(K.controlEnabled, 'false') === 'true';
}

function mouseSmoothnessPreference() {
  return lsGet(K.mouseSmoothness, 'true') !== 'false';
}

function currentPreferenceSnapshot() {
  const mode = lsGet(K.resolutionMode, 'native');
  const target = mode === 'custom'
    ? {
        width: Number(lsGet(K.resolutionW, '1920')) || 1920,
        height: Number(lsGet(K.resolutionH, '1080')) || 1080
      }
    : (RES_PRESETS[mode] || null);

  const fps = Number(lsGet(K.fps, '120')) === 60 ? 60 : 120;
  const bitrateAuto = lsGet(K.bitrateAuto, 'true') !== 'false';
  const bitrateMbps = clamp(Number(lsGet(K.bitrateManual, '40')) || 40, 5, 80);

  return {
    version: VERSION,
    updatedAt: Date.now(),
    enabled: isAutoEnabled(),
    resolutionMode: mode,
    resolutionTarget: target,
    fps,
    bitrateAuto,
    bitrateMbps,
    mouseSmoothness: mouseSmoothnessPreference()
  };
}

function saveProfilePreferences() {
  // IMPORTANT: saving Monitor/FPS/Bitrate never changes enabled/SAFE state.
  return writeSharedConfig(currentPreferenceSnapshot());
}

function setAutoEnabled(enabled) {
  const value = !!enabled;
  lsSet(K.controlEnabled, value ? 'true' : 'false');
  const cfg = currentPreferenceSnapshot();
  cfg.enabled = value;
  cfg.updatedAt = Date.now();
  const sharedOk = writeSharedConfig(cfg);
  addEvent(value ? 'AUTO_PROFILE_ENABLED' : 'AUTO_PROFILE_DISABLED', {
    enabled: value,
    sharedCookie: sharedOk,
    resolutionMode: cfg.resolutionMode,
    resolutionTarget: cfg.resolutionTarget,
    fps: cfg.fps,
    bitrateAuto: cfg.bitrateAuto,
    bitrateMbps: cfg.bitrateAuto ? null : cfg.bitrateMbps
  });
  return sharedOk;
}

function importSharedPreferencesEarly() {
  const cfg = readSharedConfig();
  if (!cfg) return null;

  if (cfg.resolutionMode) lsSet(K.resolutionMode, cfg.resolutionMode);
  if (cfg.resolutionTarget?.width > 0 && cfg.resolutionTarget?.height > 0) {
    lsSet(K.resolutionW, cfg.resolutionTarget.width);
    lsSet(K.resolutionH, cfg.resolutionTarget.height);
  }

  const fps = Number(cfg.fps) === 60 ? 60 : 120;
  lsSet(K.fps, fps);

  const auto = cfg.bitrateAuto !== false;
  lsSet(K.bitrateAuto, auto ? 'true' : 'false');
  if (auto) {
    lsRemove(K.bitrateH264);
    lsRemove(K.bitrateAV1);
  } else {
    const mbps = clamp(Number(cfg.bitrateMbps) || 40, 5, 80);
    lsSet(K.bitrateManual, mbps);
    // Before codec selection, prime both native Boosteroid keys.
    // Once menu exists, getBitrateStorageKey()/persistBitrateValue() is authoritative.
    lsSet(K.bitrateH264, mbps);
    lsSet(K.bitrateAV1, mbps);
  }

  if (typeof cfg.mouseSmoothness === 'boolean') lsSet(K.mouseSmoothness, cfg.mouseSmoothness ? 'true' : 'false');

  const enabled = cfg.enabled === true;
  lsSet(K.controlEnabled, enabled ? 'true' : 'false');
  // Legacy storage key is retired; active oneShot-named runtime fields below are persistent-profile boot context compatibility.
  lsRemove(K.resolutionOneShot);
  return { ...cfg, enabled };
}

const SHARED_BOOT_CONFIG = importSharedPreferencesEarly();

// v0.7.1: the saved profile auto-applies on every new stream while enabled.
const AUTO_PROFILE_ENABLED_AT_BOOT = lsGet(K.controlEnabled, 'false') === 'true';


// v0.7.2 persistent profile: detect whether this document can host the streaming client.
const IS_STREAM_DOCUMENT =
  /\/static\/streaming\/streaming\.html(?:$|\/)/i.test(location.pathname) ||
  /stream/i.test(location.pathname) ||
  location.hostname === 'cloud.boosteroid.com';

const PENDING_RESOLUTION_ONE_SHOT = (() => {
  if (!IS_STREAM_DOCUMENT) return null;
  const enabled = lsGet(K.controlEnabled, 'false') === 'true' || SHARED_BOOT_CONFIG?.enabled === true;
  if (!enabled) return null;
  const mode = lsGet(K.resolutionMode, SHARED_BOOT_CONFIG?.resolutionMode || 'native');
  const target = mode === 'custom'
    ? { width:Number(lsGet(K.resolutionW, SHARED_BOOT_CONFIG?.resolutionTarget?.width || '1920')),
        height:Number(lsGet(K.resolutionH, SHARED_BOOT_CONFIG?.resolutionTarget?.height || '1080')) }
    : (RES_PRESETS[mode] || SHARED_BOOT_CONFIG?.resolutionTarget || null);
  if (!target?.width || !target?.height) return null;
  return {
    id:`auto-${Date.now()}`,
    mode,
    target:{width:+target.width,height:+target.height},
    createdAt:Date.now(),
    expiresAt:null,
    sourceVersion:VERSION,
    sourceOrigin:'persistent-profile',
    sourcePath:'AUTO_APPLY'
  };
})();

function debug(...args) {
  if (DEBUG) console.log('[BCS]', ...args);
}

function percentile(values, p) {
  if (!values.length) return null;
  const a = values.slice().sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

function stats(values) {
  const a = values.filter(Number.isFinite);
  if (!a.length) return { count: 0, avg: null, min: null, max: null, p50: null, p95: null, p99: null };
  return {
    count: a.length,
    avg: round(mean(a), 4),
    min: round(Math.min(...a), 4),
    max: round(Math.max(...a), 4),
    p50: round(percentile(a, 0.50), 4),
    p95: round(percentile(a, 0.95), 4),
    p99: round(percentile(a, 0.99), 4)
  };
}

class Ring {
  constructor(size) {
    this.data = new Array(size);
    this.size = size;
    this.cursor = 0;
    this.count = 0;
    this.total = 0;
  }
  push(value) {
    this.data[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
    this.total++;
  }
  clear() {
    this.data.fill(undefined);
    this.cursor = 0;
    this.count = 0;
    this.total = 0;
  }
  toArray() {
    if (!this.count) return [];
    if (this.count < this.size) return this.data.slice(0, this.count);
    return this.data.slice(this.cursor).concat(this.data.slice(0, this.cursor));
  }
}

const IMPORTANT_EVENT_TYPES = new Set([
  'SUITE_BOOT','AUTO_PROFILE_BOOT','AUTO_PROFILE_ENABLED','AUTO_PROFILE_DISABLED',
  'CONTROL_APPLIED','CONTROL_APPLY_FAILED','CONTROL_DISARMED','FPS_APPLIED','FPS_APPLY_FAILED','BITRATE_APPLIED','BITRATE_APPLY_FAILED',
  'FREEZE_CHANGE','CODEC_CHANGE','INBOUND_RESOLUTION_CHANGE','PEER_CONNECTION_STATE','BITRATE_SOURCE_CHANGE','RESOLUTION_PROOF_STATUS',
  'MEASUREMENT_REANCHOR','VISIBILITY_CHANGE','SAMPLER_ERROR','BRIDGE_INSTALL_ERROR',
  'IMMERSIVE_ENTER','IMMERSIVE_EXIT','IMMERSIVE_FULLSCREEN_CHANGE','IMMERSIVE_POINTER_LOCK_CHANGE','IMMERSIVE_LOCK_ERROR','IMMERSIVE_NATIVE_POINTER_ARMED','IMMERSIVE_NATIVE_POINTER_ACQUIRED',
  'H014C_FIX_ENABLED','H014C_FIX_DISABLED','H014C_FIX_ERROR','H014C_FIX_PATCHED',
  'H014D_FIX_ENABLED','H014D_FIX_ERROR','H014D_TARGET_SEEN','EXPORT'
]);

function detectEnvironment() {
  const ua = navigator.userAgent || '';
  const reportedPlatform = navigator.platform || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const touch = touchPoints > 0 || 'ontouchstart' in window;
  const desktopUA = /Macintosh|Windows NT|X11|Linux x86_64/i.test(ua) &&
                    !/Android|iPhone|iPad|iPod/i.test(ua);

  let browser = 'Unknown';
  if (/EdgiOS|Edg\//i.test(ua)) browser = 'Edge';
  else if (/CriOS|Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let engine = 'Unknown';
  if (/AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|EdgiOS/i.test(ua)) engine = 'WebKit';
  else if (/Chrome|Chromium|CriOS|Edg|EdgiOS/i.test(ua)) engine = 'Chromium';

  let likelyPlatform = reportedPlatform || 'Unknown';
  if (/iPhone|iPad|iPod/i.test(ua)) likelyPlatform = 'iOS/iPadOS';
  else if (/Android/i.test(ua)) likelyPlatform = 'Android';
  else if (/Macintosh/i.test(ua) && touchPoints > 1) likelyPlatform = 'iOS/iPadOS (Desktop UA)';
  else if (/X11|Linux x86_64/i.test(ua) && touchPoints > 1 && Math.min(screen.width, screen.height) <= 700) {
    likelyPlatform = 'Android (Desktop UA)';
  }

  const deviceClass = touch && Math.min(screen.width, screen.height) <= 700
    ? 'Mobile/Touch'
    : touch ? 'Touch device' : 'Desktop';

  let uad = null;
  try {
    if (navigator.userAgentData) {
      uad = {
        mobile: navigator.userAgentData.mobile ?? null,
        platform: navigator.userAgentData.platform ?? null
      };
    }
  } catch {}

  return {
    browser,
    engine,
    reportedPlatform,
    likelyPlatform,
    deviceClass,
    desktopUA,
    userAgent: ua,
    userAgentData: uad,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    maxTouchPoints: touchPoints,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      dpr: devicePixelRatio,
      colorDepth: screen.colorDepth,
      orientation: screen.orientation?.type ?? null
    },
    viewport: {
      width: innerWidth,
      height: innerHeight,
      visualWidth: window.visualViewport?.width ?? null,
      visualHeight: window.visualViewport?.height ?? null
    }
  };
}

function capabilitySnapshot() {
  const mq=q=>{try{return matchMedia(q).matches;}catch{return null;}};
  return {
    webrtc:{rtcPeerConnection:typeof RTCPeerConnection!=='undefined',rtcStatsReport:typeof RTCStatsReport!=='undefined'},
    input:{pointerLock:'pointerLockElement' in document,keyboardLock:!!navigator.keyboard&&typeof navigator.keyboard.lock==='function'&&typeof navigator.keyboard.unlock==='function',touch:navigator.maxTouchPoints>0||'ontouchstart' in window},
    display:{fullscreen:!!(document.fullscreenEnabled||document.webkitFullscreenEnabled),dynamicRangeHigh:mq('(dynamic-range: high)')}
  };
}

const ENV = detectEnvironment();
const CAP = capabilitySnapshot();

function inferLab() {
  if (/iOS|iPadOS/.test(ENV.likelyPlatform)) return 'LAB-A';
  if (/Android/.test(ENV.likelyPlatform)) return 'LAB-B';
  return 'OTHER';
}

const S = {
  sessionStartPerf: now(),
  samples: new Ring(MAX_SAMPLES),
  importantEvents: new Ring(MAX_IMPORTANT_EVENTS),
  mouseChordFix: {
    enabled:false,
    installed:false,
    eventHandlerResolved:false,
    guardPatched:false,
    patchAttempts:0,
    patchErrors:0,
    lastError:null,
    startedAtSec:null
  },
  mouseMotionSchedulingFix: {
    enabled:false,
    installed:false,
    schedulerHooked:false,
    targetSeen:false,
    errors:0,
    lastError:null,
    startedAtSec:null
  },
  immersive: {
    phase:'OFF', active:false, entering:false, exiting:false, bound:false, handlers:null,
    target:null, targetLabel:null, fullscreenOwned:false,
    pointerLockOwned:false, pointerLockPreexistingAtEnter:false,
    nativePointerLockArmed:false, nativePointerLockArmCount:0, nativePointerLockAcquisitionCount:0,
    directPointerLockRequestCount:0,
    keyboardLockOwned:false, keyboardLockRequestCount:0, keyboardLockSuccessCount:0, keyboardLockFailureCount:0,
    panelWasOpen:false, enteredAtSec:null, exitedAtSec:null, enterCount:0, exitCount:0,
    pointerLockSuccessCount:0, pointerLockFailureCount:0,
    lastError:null, lastReason:null, overlay:null
  },
  latestSample: null,
  lab: lsGet(K.lab, inferLab()),
  network: lsGet(K.network, 'OTHER'),
  mode: AUTO_PROFILE_ENABLED_AT_BOOT ? 'AUTO' : 'SAFE',
  bridgeReady: false,
  bridgeErrors: 0,
  video: null,
  videoBound: false,
  firstVideoAt: null,
  firstMetadataAt: null,
  firstPlayingAt: null,
  videoState: {
    resolution: null,
    rendered: null,
    rvfcMediaFrame: null,
    readyState: null,
    paused: null,
    currentTime: null
  },
  measurement: {
    hidden: !!document.hidden,
    videoPaused: false,
    resumeGraceSamples: 0,
    lastReanchorReason: null,
    lastReanchorAtSec: null
  },
  phase: {
    current: 'PRE_STREAM',
    startupAtSec: null,
    steadyAtSec: null,
    stableCount: 0,
    requiredStableSamples: STARTUP_STABLE_SAMPLES
  },
  surface: { globalBound:false },
  rtcPrev: null,
  contextLatest: null,
  lastContextAt: 0,
  lastCodec: null,
  lastInboundResolution: null,
  lastPcState: null,
  lastBitrateSource: null,
  control: {
    state: PENDING_RESOLUTION_ONE_SHOT ? 'ACTIVE' : 'SAFE',
    armedAtSec: null,
    activeAtSec: PENDING_RESOLUTION_ONE_SHOT ? 0 : null,
    disarmedAtSec: null,
    preferenceMode: lsGet(K.resolutionMode, 'native'),
    activeTarget: PENDING_RESOLUTION_ONE_SHOT?.target || null,
    activeMode: PENDING_RESOLUTION_ONE_SHOT?.mode || null,
    frozen: null,
    application: null,
    fpsApplication: null,
    bitrateApplication: null,
    proof: {
      status: PENDING_RESOLUTION_ONE_SHOT ? 'BOOT_APPLY_PENDING' : 'IDLE',
      requested: PENDING_RESOLUTION_ONE_SHOT?.target || null,
      inboundBefore: null,
      inboundObserved: null,
      matchCount: 0,
      alternateCount: 0,
      startedAtSec: PENDING_RESOLUTION_ONE_SHOT ? 0 : null,
      updatedAtSec: 0
    },
    profileEnabledAtBoot: AUTO_PROFILE_ENABLED_AT_BOOT,
    oneShot: PENDING_RESOLUTION_ONE_SHOT,
    oneShotConsumed: false,
    applyBusy: false,
  },
  sampler: {
    running: false,
    timer: null,
    samplesAttempted: 0,
    skipped: 0,
    bridgeTimeouts: 0,
    lastCycleWallMs: null,
    lastLocalWorkMs: null,
    lastBridgeStatsWallMs: null,
    lastContextWallMs: null,
    lastUiCostMs: null
  },
  ui: {
    open: false,
    built: false
  }
};

function elapsed() {
  return (now() - S.sessionStartPerf) / 1000;
}

function addEvent(type, data = {}) {
  const event={
    t: round(elapsed(), 3),
    type,
    ...data
  };
  if (IMPORTANT_EVENT_TYPES.has(type)) S.importantEvents.push(event);
}


// -----------------------------------------------------------------------------
// PRODUCTION DOM HELPERS
// -----------------------------------------------------------------------------
function fullscreenElementCompat() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

// -----------------------------------------------------------------------------
// H-014C PRODUCTION FIX - MINIMAL COMPATIBILITY GUARD BYPASS
// Proven by RC15 LIVE. Production path deliberately excludes transport capture,
// packet parsing, id_cmd pairing, correlation timers and per-click telemetry.
// -----------------------------------------------------------------------------
function syncChordFixState(detail={}) {
  const F=S.mouseChordFix;
  if ('installed' in detail) F.installed=!!detail.installed;
  if ('eventHandlerResolved' in detail) F.eventHandlerResolved=!!detail.eventHandlerResolved;
  if ('guardPatched' in detail) F.guardPatched=!!detail.guardPatched;
  if (Number.isFinite(detail.patchAttempts)) F.patchAttempts=detail.patchAttempts;
  if (Number.isFinite(detail.patchErrors)) F.patchErrors=detail.patchErrors;
  if (detail.error) F.lastError=String(detail.error).slice(0,180);
}

function onChordFixObservation(e) {
  const d=e?.detail || {};
  syncChordFixState(d);
  if (d.kind==='PATCHED') addEvent('H014C_FIX_PATCHED',{guardPatched:!!d.guardPatched});
  if (d.kind==='ERROR') addEvent('H014C_FIX_ERROR',{error:d.error||'UNKNOWN'});
}

function dispatchChordFixControl(detail) {
  try { document.dispatchEvent(new CustomEvent(CHORD_FIX_CONTROL_EVENT,{detail})); return true; }
  catch (e) { S.mouseChordFix.lastError=String(e?.message||e).slice(0,180); return false; }
}

function installMouseChordFixPage(){
  document.addEventListener(CHORD_FIX_OBS_EVENT,onChordFixObservation,true);
  const source=`(() => {
'use strict';
if(window.__BCS_H014C_MINIMAL_GUARD_FIX__) return;
window.__BCS_H014C_MINIMAL_GUARD_FIX__=true;
const CONTROL=${JSON.stringify(CHORD_FIX_CONTROL_EVENT)};
const OBS=${JSON.stringify(CHORD_FIX_OBS_EVENT)};
const state={enabled:false,installed:true,eventHandlerResolved:false,guardPatched:false,patchAttempts:0,patchErrors:0,error:null};
function emit(kind){try{document.dispatchEvent(new CustomEvent(OBS,{detail:{kind,...state}}));}catch(_){}}
function chord(e){const t=String(e?.type||''),b=Number(e?.button),bs=Number(e?.buttons);return (t==='mousedown'&&b===0&&bs===3)||(t==='mouseup'&&b===0&&bs===2)||(t==='mousedown'&&b===2&&bs===3)||(t==='mouseup'&&b===2&&bs===1);}
function resolve(){try{return Function('return typeof EventHandler !== "undefined" ? EventHandler : null')();}catch(_){return null;}}
function patch(){
  state.patchAttempts++;
  if(state.guardPatched)return true;
  const EH=resolve();
  if(!EH||typeof EH.shouldIgnoreMouseCompatibilityEvent!=='function')return false;
  state.eventHandlerResolved=true;
  const nativeIgnore=EH.shouldIgnoreMouseCompatibilityEvent;
  if(nativeIgnore?.__bcsH014cMinimal===true){state.guardPatched=true;emit('PATCHED');return true;}
  function wrapped(event){
    let ignored=false;
    try{ignored=!!nativeIgnore.call(this,event);}catch(err){state.patchErrors++;state.error='NATIVE_GUARD:'+String(err?.message||err).slice(0,120);emit('ERROR');throw err;}
    if(!state.enabled||!ignored||!chord(event))return ignored;
    return false;
  }
  try{Object.defineProperty(wrapped,'__bcsH014cMinimal',{value:true});}catch(_){}
  EH.shouldIgnoreMouseCompatibilityEvent=wrapped;
  state.guardPatched=EH.shouldIgnoreMouseCompatibilityEvent===wrapped;
  if(!state.guardPatched){state.patchErrors++;state.error='GUARD_ASSIGN_FAILED';emit('ERROR');return false;}
  emit('PATCHED');
  return true;
}
let tries=0;
const timer=setInterval(()=>{tries++;if(patch()||tries>=600){clearInterval(timer);if(!state.guardPatched){state.patchErrors++;state.error='EVENT_HANDLER_GUARD_NOT_FOUND';emit('ERROR');}}},20);
patch();
document.addEventListener(CONTROL,e=>{const d=e?.detail||{};if(d.action==='ENABLE'){state.enabled=true;patch();emit('STATE');}else if(d.action==='DISABLE'){state.enabled=false;emit('STATE');}else if(d.action==='STATE'){patch();emit('STATE');}},true);
emit('READY');
})();
//# sourceURL=bcs-h014c-minimal-guard-fix.js`;
  try{const sc=document.createElement('script');sc.textContent=source;(document.documentElement||document.head||document).appendChild(sc);sc.remove();S.mouseChordFix.installed=true;}
  catch(e){S.mouseChordFix.patchErrors++;S.mouseChordFix.lastError=String(e?.message||e).slice(0,180);addEvent('H014C_FIX_ERROR',{error:S.mouseChordFix.lastError});}
}

function shouldAutoEnableMouseChordFix(){
  return S.lab==='LAB-B' && ENV.engine==='Chromium';
}

function setMouseChordFixEnabled(enabled,reason='UI'){
  const F=S.mouseChordFix;
  enabled=!!enabled;
  if(enabled===F.enabled) return;
  F.enabled=enabled;
  if(enabled && !Number.isFinite(F.startedAtSec)) F.startedAtSec=round(elapsed(),3);
  dispatchChordFixControl({action:enabled?'ENABLE':'DISABLE'});
  addEvent(enabled?'H014C_FIX_ENABLED':'H014C_FIX_DISABLED',{reason});
  updateUI();
}

function mouseChordFixSnapshot(){
  const F=S.mouseChordFix;
  return {
    schemaVersion:4,
    mode:'H014C_MINIMAL_GUARD_FIX',
    enabled:F.enabled,
    autoIntegratedOnValidatedLabB:shouldAutoEnableMouseChordFix(),
    installed:F.installed,
    eventHandlerResolved:F.eventHandlerResolved,
    guardPatched:F.guardPatched,
    patchAttempts:F.patchAttempts,
    patchErrors:F.patchErrors,
    lastError:F.lastError,
    transportObservation:false,
    payloadMutation:false,
    idCmdFabrication:false,
    additionalTransportSend:false,
    syntheticDomEventDispatch:false
  };
}

// -----------------------------------------------------------------------------
// H-014D PRODUCTION FIX - MINIMAL MOUSE SCHEDULING REROUTE
// LAB-B LIVE proved Boosteroid's requested 8 ms _sendBatchedMouseMove timer
// executing around p50 27.9 ms and accumulating p50 3 later pointer inputs.
// Production path changes only that exact scheduling edge to native rAF.
// The native _sendBatchedMouseMove callback, sender, payload, id_cmd and
// transports remain entirely owned by Boosteroid.
// -----------------------------------------------------------------------------
function syncMouseMotionSchedulingFixState(detail={}) {
  const F=S.mouseMotionSchedulingFix;
  if ('enabled' in detail) F.enabled=!!detail.enabled;
  if ('installed' in detail) F.installed=!!detail.installed;
  if ('schedulerHooked' in detail) F.schedulerHooked=!!detail.schedulerHooked;
  if ('targetSeen' in detail) F.targetSeen=!!detail.targetSeen;
  if (Number.isFinite(detail.errors)) F.errors=detail.errors;
  if (detail.error) F.lastError=String(detail.error).slice(0,180);
}

function onMouseMotionSchedulingFixObservation(e) {
  const d=e?.detail || {};
  syncMouseMotionSchedulingFixState(d);
  if (d.kind==='TARGET_SEEN') addEvent('H014D_TARGET_SEEN',{schedulerHooked:!!d.schedulerHooked});
  if (d.kind==='ERROR') addEvent('H014D_FIX_ERROR',{error:d.error||'UNKNOWN'});
}

function dispatchMouseMotionSchedulingFixControl(detail) {
  try { document.dispatchEvent(new CustomEvent(MOTION_FIX_CONTROL_EVENT,{detail})); return true; }
  catch (e) { S.mouseMotionSchedulingFix.lastError=String(e?.message||e).slice(0,180); return false; }
}

function installMouseMotionSchedulingFixPage(){
  document.addEventListener(MOTION_FIX_OBS_EVENT,onMouseMotionSchedulingFixObservation,true);
  const source=`(() => {
'use strict';
if(window.__BCS_H014D_SCHEDULING_FIX_RC19__) return;
window.__BCS_H014D_SCHEDULING_FIX_RC19__=true;
const CONTROL=${JSON.stringify(MOTION_FIX_CONTROL_EVENT)};
const OBS=${JSON.stringify(MOTION_FIX_OBS_EVENT)};
const state={enabled:false,installed:true,schedulerHooked:false,targetSeen:false,errors:0,error:null};
const originalSetTimeout=window.setTimeout;
const originalClearTimeout=window.clearTimeout;
const nativeRAF=window.requestAnimationFrame.bind(window);
const nativeCancelRAF=window.cancelAnimationFrame.bind(window);
const pending=new Map();
const callbackCache=new WeakMap();
let fakeHandle=-2000000;
function emit(kind){try{document.dispatchEvent(new CustomEvent(OBS,{detail:{kind,...state}}));}catch(_){}}
function isTarget(callback,delay){
  if(typeof callback!=='function')return false;
  const d=Number(delay);
  if(!Number.isFinite(d)||d<6||d>10)return false;
  if(callbackCache.has(callback))return callbackCache.get(callback);
  let src='';
  try{src=Function.prototype.toString.call(callback);}catch(_){}
  const match=callback.name==='_sendBatchedMouseMove'&&src.includes('EventHandler._mouseMoveTimer = null')&&src.includes('EventHandler._pendingMouseMove');
  callbackCache.set(callback,match);
  return match;
}
function wrappedSetTimeout(callback,delay,...args){
  if(!isTarget(callback,delay))return Reflect.apply(originalSetTimeout,this,[callback,delay,...args]);
  if(!state.targetSeen){state.targetSeen=true;emit('TARGET_SEEN');}
  if(!state.enabled)return Reflect.apply(originalSetTimeout,this,[callback,delay,...args]);
  const handle=--fakeHandle;
  try{
    const rafId=nativeRAF(()=>{
      const entry=pending.get(handle);
      if(!entry)return;
      pending.delete(handle);
      try{Reflect.apply(callback,window,args);}catch(err){state.errors++;state.error='CALLBACK:'+String(err?.message||err).slice(0,120);emit('ERROR');throw err;}
    });
    pending.set(handle,{rafId});
    return handle;
  }catch(err){
    state.errors++;state.error='RAF_SCHEDULE:'+String(err?.message||err).slice(0,120);emit('ERROR');
    return Reflect.apply(originalSetTimeout,this,[callback,delay,...args]);
  }
}
function wrappedClearTimeout(handle){
  const entry=pending.get(handle);
  if(entry){pending.delete(handle);try{nativeCancelRAF(entry.rafId);}catch(_){}return;}
  return Reflect.apply(originalClearTimeout,this,[handle]);
}
try{
  window.setTimeout=wrappedSetTimeout;
  window.clearTimeout=wrappedClearTimeout;
  state.schedulerHooked=window.setTimeout===wrappedSetTimeout&&window.clearTimeout===wrappedClearTimeout;
  if(!state.schedulerHooked){state.errors++;state.error='SCHEDULER_ASSIGN_FAILED';emit('ERROR');}
}catch(err){state.errors++;state.error='INSTALL:'+String(err?.message||err).slice(0,120);emit('ERROR');}
document.addEventListener(CONTROL,e=>{
  const d=e?.detail||{};
  if(d.action==='ENABLE'){state.enabled=true;emit('STATE');}
  else if(d.action==='DISABLE'){state.enabled=false;emit('STATE');}
  else if(d.action==='STATE'){emit('STATE');}
},true);
emit('READY');
})();
//# sourceURL=bcs-h014d-scheduling-fix-rc19.js`;
  try{const sc=document.createElement('script');sc.textContent=source;(document.documentElement||document.head||document).appendChild(sc);sc.remove();S.mouseMotionSchedulingFix.installed=true;}
  catch(e){S.mouseMotionSchedulingFix.errors++;S.mouseMotionSchedulingFix.lastError=String(e?.message||e).slice(0,180);addEvent('H014D_FIX_ERROR',{error:S.mouseMotionSchedulingFix.lastError});}
}

function shouldAutoEnableMouseMotionSchedulingFix(){
  return S.lab==='LAB-B' && ENV.engine==='Chromium';
}

function setMouseMotionSchedulingFixEnabled(enabled,reason='BOOT'){
  const F=S.mouseMotionSchedulingFix;
  enabled=!!enabled;
  if(enabled===F.enabled) return;
  F.enabled=enabled;
  if(enabled && !Number.isFinite(F.startedAtSec)) F.startedAtSec=round(elapsed(),3);
  dispatchMouseMotionSchedulingFixControl({action:enabled?'ENABLE':'DISABLE'});
  addEvent('H014D_FIX_ENABLED',{enabled,reason});
}

function mouseMotionSchedulingFixSnapshot(){
  const F=S.mouseMotionSchedulingFix;
  return {
    schemaVersion:1,
    mode:'H014D_NATIVE_RAF_SCHEDULING_FIX',
    enabled:F.enabled,
    autoIntegratedOnValidatedLabB:shouldAutoEnableMouseMotionSchedulingFix(),
    installed:F.installed,
    schedulerHooked:F.schedulerHooked,
    targetSeen:F.targetSeen,
    errors:F.errors,
    lastError:F.lastError,
    nativeSenderPreserved:true,
    websocketHooks:false,
    rtcHooks:false,
    directSend:false,
    payloadMutation:false,
    idCmdFabrication:false,
    syntheticInput:false
  };
}

// -----------------------------------------------------------------------------
// IMMERSIVE GAME MODE - V2 NATIVE-FIRST / PLAY-FIRST
// Fullscreen + Keyboard Lock are orchestrated by BCS. Mouse capture remains on
// Boosteroid's native path. No input-shadow Guardian or synthetic recovery.
// -----------------------------------------------------------------------------
function immersiveElementLabel(el) {
  if (!el) return null;
  try { return `${el.tagName || el.nodeName || 'ELEMENT'}${el.id ? `#${el.id}` : ''}`; }
  catch { return 'ELEMENT'; }
}

function findImmersiveFullscreenTarget() {
  if (/Android/i.test(ENV.likelyPlatform || '') && document.documentElement) return document.documentElement;
  return document.documentElement || S.video || document.body;
}

function waitForDomState(predicate, timeoutMs=400) {
  return new Promise(resolve => {
    const started=now();
    const check=() => {
      let ok=false; try { ok=!!predicate(); } catch {}
      if (ok) return resolve(true);
      if (now()-started >= timeoutMs) return resolve(false);
      setTimeout(check,16);
    };
    check();
  });
}

async function requestFullscreenCompat(target) {
  if (!target) throw new Error('IMMERSIVE_NO_FULLSCREEN_TARGET');
  if (fullscreenElementCompat()) return true;
  const standard=target.requestFullscreen;
  const webkit=target.webkitRequestFullscreen;
  if (typeof standard==='function') {
    try { const out=standard.call(target,{navigationUI:'hide'}); if (out?.then) await out; }
    catch { const out=standard.call(target); if (out?.then) await out; }
  } else if (typeof webkit==='function') {
    const out=webkit.call(target); if (out?.then) await out;
  } else throw new Error('FULLSCREEN_API_UNAVAILABLE');
  return !!fullscreenElementCompat() || waitForDomState(()=>!!fullscreenElementCompat(),450);
}

async function exitFullscreenCompat() {
  const fn=document.exitFullscreen || document.webkitExitFullscreen;
  if (typeof fn!=='function') return false;
  const out=fn.call(document); if (out?.then) await out; return true;
}

function releasePointerLockCompat() {
  if (typeof document.exitPointerLock!=='function') return false;
  try { document.exitPointerLock(); return true; } catch { return false; }
}

function setImmersiveError(error,stage='UNKNOWN') {
  const value=String(error?.name || error?.message || error || 'UNKNOWN').slice(0,220);
  S.immersive.lastError={stage,error:value,atSec:round(elapsed(),3)};
  addEvent('IMMERSIVE_LOCK_ERROR',{stage,error:value});
  return value;
}

function immersiveOverlayHost() {
  const fs=fullscreenElementCompat();
  if (fs && !(fs instanceof HTMLVideoElement)) return fs;
  return document.body || document.documentElement;
}

function updateImmersiveOverlay() {
  const I=S.immersive, root=I.overlay;
  if (!root) return;
  const status=root.querySelector('[data-bcs-immersive-status]');
  const capture=root.querySelector('[data-bcs-immersive-capture]');
  const pointer=!!document.pointerLockElement;
  if (status) status.textContent=`KEY ${I.keyboardLockOwned?'ON':(CAP.input.keyboardLock?'OFF':'N/A')} • MOUSE ${pointer?'ON':(CAP.input.pointerLock?'ARMADO':'N/A')}`;
  if (capture) capture.style.display=pointer?'none':'inline-flex';
}

function mountImmersiveOverlay() {
  const I=S.immersive;
  if (I.overlay?.isConnected) return updateImmersiveOverlay();
  const host=immersiveOverlayHost(); if (!host?.appendChild) return;
  const root=document.createElement('div');
  root.id='bcs-immersive-overlay';
  root.innerHTML=`<span data-bcs-immersive-status>KEY -- • MOUSE --</span><span data-bcs-immersive-capture>MOUSE: CLIQUE NO JOGO</span><button type="button" data-bcs-immersive-exit>SAIR</button>`;
  root.querySelector('[data-bcs-immersive-exit]')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void exitImmersiveMode('OVERLAY_EXIT');});
  host.appendChild(root); I.overlay=root; updateImmersiveOverlay();
}

function unmountImmersiveOverlay() { try { S.immersive.overlay?.remove(); } catch {} S.immersive.overlay=null; }

async function requestImmersiveKeyboardLock(reason='ENTER') {
  const I=S.immersive; I.keyboardLockRequestCount++;
  if (!CAP.input.keyboardLock) { I.keyboardLockFailureCount++; setImmersiveError('KEYBOARD_LOCK_UNSUPPORTED','KEYBOARD_LOCK'); return false; }
  if (!fullscreenElementCompat()) { I.keyboardLockFailureCount++; setImmersiveError('FULLSCREEN_REQUIRED_FOR_KEYBOARD_LOCK','KEYBOARD_LOCK'); return false; }
  try {
    await navigator.keyboard.lock([...IMMERSIVE_KEY_CODES]);
    I.keyboardLockOwned=true; I.keyboardLockSuccessCount++; I.lastError=null;
    addEvent('IMMERSIVE_KEYBOARD_LOCK_CHANGE',{active:true,reason});
    updateImmersiveOverlay(); return true;
  } catch (e) {
    I.keyboardLockOwned=false; I.keyboardLockFailureCount++; setImmersiveError(e,'KEYBOARD_LOCK'); updateImmersiveOverlay(); return false;
  }
}

function releaseImmersiveKeyboardLock(reason='EXIT') {
  const I=S.immersive;
  if (!I.keyboardLockOwned) return;
  try { navigator.keyboard?.unlock?.(); } catch {}
  I.keyboardLockOwned=false;
  addEvent('IMMERSIVE_KEYBOARD_LOCK_CHANGE',{active:false,reason});
}

function armNativeImmersivePointerLock(reason='ENTER') {
  const I=S.immersive;
  if (document.pointerLockElement) { I.nativePointerLockArmed=false; updateImmersiveOverlay(); return true; }
  if (!CAP.input.pointerLock) { setImmersiveError('POINTER_LOCK_UNSUPPORTED','POINTER_LOCK'); return false; }
  I.nativePointerLockArmed=true; I.nativePointerLockArmCount++;
  addEvent('IMMERSIVE_NATIVE_POINTER_ARMED',{reason,strategy:'BOOSTEROID_CURSOR_MODE_MANAGER',directRequest:false});
  updateImmersiveOverlay(); return false;
}

async function reacquireImmersiveLocks(reason='USER_RETRY') {
  const I=S.immersive; if (!I.active) return false;
  I.lastError=null;
  let keyOk=I.keyboardLockOwned; if (!keyOk) keyOk=await requestImmersiveKeyboardLock(reason);
  const pointerOk=!!document.pointerLockElement; if (!pointerOk) armNativeImmersivePointerLock(reason);
  updateUI(); updateImmersiveOverlay(); return keyOk || pointerOk;
}

function immersiveExitChordMatches(e) {
  return !!e && e.code===IMMERSIVE_EXIT_CHORD.code && !!e.ctrlKey===IMMERSIVE_EXIT_CHORD.ctrlKey && !!e.altKey===IMMERSIVE_EXIT_CHORD.altKey && !!e.shiftKey===IMMERSIVE_EXIT_CHORD.shiftKey;
}

function bindImmersiveLifecycleEvents() {
  const I=S.immersive; if (I.bound) return;
  const onFullscreen=()=>{
    const active=!!fullscreenElementCompat();
    addEvent('IMMERSIVE_FULLSCREEN_CHANGE',{active,owned:I.fullscreenOwned,phase:I.phase});
    if (!active && (I.active||I.entering||I.exiting)) void exitImmersiveMode('FULLSCREEN_LOST',{skipFullscreenExit:true,restorePanel:true});
    else { updateImmersiveOverlay(); updateUI(); }
  };
  const onPointerLock=()=>{
    const active=!!document.pointerLockElement;
    if (active && I.active && !I.pointerLockPreexistingAtEnter && !I.pointerLockOwned) {
      I.pointerLockOwned=true; I.nativePointerLockArmed=false; I.nativePointerLockAcquisitionCount++; I.pointerLockSuccessCount++;
      addEvent('IMMERSIVE_NATIVE_POINTER_ACQUIRED',{element:immersiveElementLabel(document.pointerLockElement),strategy:'BOOSTEROID_CURSOR_MODE_MANAGER'});
    } else if (!active) {
      I.pointerLockOwned=false;
      if (I.active && I.phase==='ACTIVE' && !document.hidden && (typeof document.hasFocus!=='function'||document.hasFocus())) armNativeImmersivePointerLock('POINTER_LOCK_LOST');
    }
    addEvent('IMMERSIVE_POINTER_LOCK_CHANGE',{active,owned:I.pointerLockOwned,phase:I.phase,nativeFirst:true});
    updateImmersiveOverlay(); updateUI();
  };
  const onKeyDown=e=>{ if (!I.active || !immersiveExitChordMatches(e)) return; e.preventDefault(); e.stopImmediatePropagation(); void exitImmersiveMode('EMERGENCY_EXIT_CHORD'); };
  const onVisibility=()=>{ if (I.active && !document.hidden && !document.pointerLockElement) armNativeImmersivePointerLock('VISIBILITY_RESUME'); };
  const onFocus=()=>{ if (I.active && !document.pointerLockElement) armNativeImmersivePointerLock('FOCUS_RESUME'); };
  const onPageHide=()=>{ try { releaseImmersiveKeyboardLock('PAGEHIDE'); if (I.pointerLockOwned) document.exitPointerLock?.(); } catch {} };
  I.handlers={onFullscreen,onPointerLock,onKeyDown,onVisibility,onFocus,onPageHide};
  document.addEventListener('fullscreenchange',onFullscreen,true);
  document.addEventListener('webkitfullscreenchange',onFullscreen,true);
  document.addEventListener('pointerlockchange',onPointerLock,true);
  document.addEventListener('visibilitychange',onVisibility,true);
  window.addEventListener('keydown',onKeyDown,true);
  window.addEventListener('focus',onFocus,true);
  window.addEventListener('pagehide',onPageHide,true);
  I.bound=true;
}

function unbindImmersiveLifecycleEvents() {
  const I=S.immersive; if (!I.bound || !I.handlers) return;
  const h=I.handlers;
  document.removeEventListener('fullscreenchange',h.onFullscreen,true);
  document.removeEventListener('webkitfullscreenchange',h.onFullscreen,true);
  document.removeEventListener('pointerlockchange',h.onPointerLock,true);
  document.removeEventListener('visibilitychange',h.onVisibility,true);
  window.removeEventListener('keydown',h.onKeyDown,true);
  window.removeEventListener('focus',h.onFocus,true);
  window.removeEventListener('pagehide',h.onPageHide,true);
  I.handlers=null; I.bound=false;
}

function finalizeImmersiveExit(reason='EXIT',restorePanel=true) {
  const I=S.immersive, wasActive=I.active||I.entering||I.exiting, shouldRestore=restorePanel&&I.panelWasOpen;
  I.active=false; I.entering=false; I.exiting=false; I.phase='OFF'; I.fullscreenOwned=false; I.pointerLockOwned=false;
  I.pointerLockPreexistingAtEnter=false; I.nativePointerLockArmed=false; I.keyboardLockOwned=false; I.target=null; I.targetLabel=null;
  I.exitedAtSec=round(elapsed(),3); I.lastReason=reason; if (wasActive) I.exitCount++;
  document.documentElement?.classList?.remove('bcs-immersive-active'); unmountImmersiveOverlay(); unbindImmersiveLifecycleEvents();
  addEvent('IMMERSIVE_EXIT',{reason,atSec:I.exitedAtSec});
  if (shouldRestore && S.ui.built) setPanel(true); else updateUI();
}

async function enterImmersiveMode(reason='USER_UI') {
  const I=S.immersive; if (I.active||I.entering) return true;
  if (!IS_STREAM_DOCUMENT) { setImmersiveError('STREAM_DOCUMENT_REQUIRED','ENTER'); updateUI(); return false; }
  if (!(S.video||findMainVideo())) { setImmersiveError('STREAM_VIDEO_NOT_FOUND','ENTER'); updateUI(); return false; }
  I.entering=true; I.exiting=false; I.phase='ENTERING'; I.lastError=null; I.lastReason=reason; I.panelWasOpen=!!S.ui.open; I.enterCount++;
  I.pointerLockPreexistingAtEnter=!!document.pointerLockElement; I.pointerLockOwned=false; I.nativePointerLockArmed=false;
  bindImmersiveLifecycleEvents(); setPanel(false);
  const preexistingFullscreen=fullscreenElementCompat(); I.fullscreenOwned=false;
  try {
    if (preexistingFullscreen) { I.target=preexistingFullscreen; I.targetLabel=immersiveElementLabel(preexistingFullscreen); }
    else { I.target=findImmersiveFullscreenTarget(); I.targetLabel=immersiveElementLabel(I.target); const ok=await requestFullscreenCompat(I.target); if (!ok||!fullscreenElementCompat()) throw new Error('FULLSCREEN_NOT_ACQUIRED'); I.fullscreenOwned=true; }
  } catch (e) {
    setImmersiveError(e,'FULLSCREEN'); I.entering=false; I.phase='ERROR'; unbindImmersiveLifecycleEvents(); if (I.panelWasOpen&&S.ui.built) setPanel(true); updateUI(); return false;
  }
  I.active=true; I.entering=false; I.phase='ACTIVE'; I.enteredAtSec=round(elapsed(),3);
  document.documentElement?.classList?.add('bcs-immersive-active'); mountImmersiveOverlay();
  const keyboardOk=await requestImmersiveKeyboardLock('ENTER');
  const pointerAlready=!!document.pointerLockElement; if (!pointerAlready) armNativeImmersivePointerLock('ENTER');
  addEvent('IMMERSIVE_ENTER',{reason,atSec:I.enteredAtSec,target:I.targetLabel,fullscreenOwned:I.fullscreenOwned,keyboardLock:keyboardOk,pointerLock:pointerAlready,pointerLockStrategy:'BOOSTEROID_CURSOR_MODE_MANAGER',directPointerLockRequest:false,exitChord:IMMERSIVE_EXIT_CHORD_LABEL});
  updateImmersiveOverlay(); updateUI(); return true;
}

async function exitImmersiveMode(reason='USER_UI',options={}) {
  const I=S.immersive; if ((!I.active&&!I.entering&&!I.exiting)||I.exiting) return true;
  I.exiting=true; I.phase='EXITING'; I.lastReason=reason;
  releaseImmersiveKeyboardLock(`IMMERSIVE_${reason}`);
  if (I.pointerLockOwned && !I.pointerLockPreexistingAtEnter && document.pointerLockElement) releasePointerLockCompat();
  if (I.fullscreenOwned && !options.skipFullscreenExit && fullscreenElementCompat()) { try { await exitFullscreenCompat(); } catch (e) { setImmersiveError(e,'FULLSCREEN_EXIT'); } }
  finalizeImmersiveExit(reason,options.restorePanel!==false); return true;
}

function immersiveSnapshot() {
  const I=S.immersive;
  return {
    schemaVersion:3,mode:'IMMERSIVE_GAME_MODE_V2_NATIVE_FIRST_PLAY_FIRST',phase:I.phase,active:I.active,nativeFirst:true,
    fullscreen:{supported:CAP.display.fullscreen,active:!!fullscreenElementCompat(),ownedByBCS:I.fullscreenOwned,target:I.targetLabel},
    keyboardLock:{supported:CAP.input.keyboardLock,active:I.keyboardLockOwned,requestCount:I.keyboardLockRequestCount,successCount:I.keyboardLockSuccessCount,failureCount:I.keyboardLockFailureCount},
    pointerLock:{supported:CAP.input.pointerLock,active:!!document.pointerLockElement,sessionAcquired:I.pointerLockOwned,preexistingAtEnter:I.pointerLockPreexistingAtEnter,strategy:'BOOSTEROID_CURSOR_MODE_MANAGER',directRequestCount:0,nativeArmCount:I.nativePointerLockArmCount,nativeAcquisitionCount:I.nativePointerLockAcquisitionCount},
    exit:{emergencyChord:IMMERSIVE_EXIT_CHORD_LABEL,cleanUnlockOnExit:true},
    enterCount:I.enterCount,exitCount:I.exitCount,enteredAtSec:I.enteredAtSec,exitedAtSec:I.exitedAtSec,lastReason:I.lastReason,lastError:I.lastError,
    syntheticRemoteInput:false,mouseTransportOverride:false,streamControlMutation:false,inputShadowGuardian:false
  };
}

// -----------------------------------------------------------------------------
// PAGE-CONTEXT SAFE BRIDGE
// No RTCPeerConnection constructor/method replacement. It reads known Boosteroid
// globals and calls getStats only once per recorder sample.
// -----------------------------------------------------------------------------
function installPageBridge() {
  const source = String.raw`
(() => {
  'use strict';
  if (window.__BCS_V06_BRIDGE__) return;
  window.__BCS_V06_BRIDGE__ = true;
  const REQ='${BRIDGE_REQ}', RES='${BRIDGE_RES}';

  const primitive = v => {
    if (v == null) return v;
    if (['string','number','boolean'].includes(typeof v)) return v;
    return String(v);
  };

  const findPC = () => {
    try {
      if (typeof WebRtcTransport !== 'undefined' && WebRtcTransport?.pc) {
        return {source:'WebRtcTransport', pc:WebRtcTransport.pc};
      }
    } catch {}
    try {
      if (typeof JANUS_HELPER !== 'undefined') {
        const pc=JANUS_HELPER?.streamingVideo?.webrtcStuff?.pc;
        if (pc) return {source:'JANUS_HELPER',pc};
      }
    } catch {}
    try {
      if (typeof StreamHandler !== 'undefined') {
        const candidates=[
          StreamHandler?.pc,
          StreamHandler?.peerConnection,
          StreamHandler?.webRtcStreamer?.pc,
          StreamHandler?.webRtc?.pc
        ];
        for (const pc of candidates) if (pc) return {source:'StreamHandler',pc};
      }
    } catch {}
    return null;
  };

  const storage = () => {
    const keys=['fpsRateValue','bitrateValue','bitrateValueForAV1','disableTryToCheckAV1','disableTryToCheckHDR','use-display-scale-preferences','use-monitor-resolution'];
    const out={};
    for (const k of keys) {
      try { const v=localStorage.getItem(k); if (v !== null) out[k]=v; } catch {}
    }
    return out;
  };

  const contextSnapshot = () => {
    const out={storage:storage(),bindings:{}};
    try {
      out.bindings.SessionHandler=typeof SessionHandler !== 'undefined';
      if (out.bindings.SessionHandler) {
        let av1=null;
        try { av1=typeof SessionHandler.av1Results?.av1SupportedStatus === 'function' ? SessionHandler.av1Results.av1SupportedStatus() : null; } catch {}
        out.sessionHandler={
          videoCodec:primitive(SessionHandler.videoCodec),
          av1SupportedStatus:primitive(av1),
          isHDRSupported:primitive(SessionHandler.isHDRSupported),
          isHDRSupportedByServer:primitive(SessionHandler.isHDRSupportedByServer)
        };
      }
    } catch {}
    try {
      out.bindings.menu=typeof menu !== 'undefined';
      if (out.bindings.menu) {
        out.menu={};
        for (const k of ['fpsMaxRate','fpsRate','fpsRateValue','maxBitrateValue','bitrateValue','bitrateValueForAV1']) {
          try { if (k in menu) out.menu[k]=primitive(menu[k]); } catch {}
        }
      }
    } catch {}
    try { out.bindings.WebRtcTransport=typeof WebRtcTransport !== 'undefined'; } catch {}
    try { out.bindings.JANUS_HELPER=typeof JANUS_HELPER !== 'undefined'; } catch {}
    try { out.bindings.StreamHandler=typeof StreamHandler !== 'undefined'; } catch {}

    const peer=findPC();
    if (peer?.pc) {
      const pc=peer.pc;
      out.peerConnection={
        source:peer.source,
        connectionState:primitive(pc.connectionState),
        iceConnectionState:primitive(pc.iceConnectionState),
        signalingState:primitive(pc.signalingState)
      };
    }
    return out;
  };

  const statsSnapshot = async () => {
    const peer=findPC();
    if (!peer?.pc || typeof peer.pc.getStats !== 'function') {
      return {ok:false,error:'NO_PEER_CONNECTION'};
    }
    const pc=peer.pc;
    const report=await pc.getStats();
    let inbound=null;
    let videoInboundCount=0;
    let videoBytesCounterCount=0;
    let videoBytesReceivedTotal=0;
    const codecs=new Map();
    let selectedPair=null;
    let transport=null;

    report.forEach(r => {
      if (r.type === 'codec') codecs.set(r.id,r);
      if (r.type === 'transport') transport=r;
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) selectedPair=r;
      if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
        videoInboundCount++;
        if (Number.isFinite(r.bytesReceived)) {
          videoBytesReceivedTotal += r.bytesReceived;
          videoBytesCounterCount++;
        }
        if (!inbound || (r.bytesReceived || 0) > (inbound.bytesReceived || 0)) inbound=r;
      }
    });

    if (transport?.selectedCandidatePairId && report.get) {
      selectedPair=report.get(transport.selectedCandidatePairId) || selectedPair;
    }
    if (!inbound) return {ok:false,error:'NO_INBOUND_VIDEO',pcSource:peer.source};
    const codec=inbound.codecId ? codecs.get(inbound.codecId) : null;

    const n = (v) => Number.isFinite(v) ? v : null;
    return {
      ok:true,
      pcSource:peer.source,
      pcState:primitive(pc.connectionState),
      iceState:primitive(pc.iceConnectionState),
      videoAggregate:{
        inboundCount:videoInboundCount,
        bytesCounterCount:videoBytesCounterCount,
        bytesReceivedTotal:videoBytesCounterCount ? videoBytesReceivedTotal : null
      },
      inbound:{
        timestamp:n(inbound.timestamp),
        id:inbound.id || null,
        ssrc:n(inbound.ssrc),
        codecId:inbound.codecId || null,
        mimeType:codec?.mimeType || null,
        payloadType:n(codec?.payloadType),
        frameWidth:n(inbound.frameWidth),
        frameHeight:n(inbound.frameHeight),
        framesPerSecond:n(inbound.framesPerSecond),
        bytesReceived:n(inbound.bytesReceived),
        packetsReceived:n(inbound.packetsReceived),
        packetsLost:n(inbound.packetsLost),
        jitter:n(inbound.jitter),
        framesReceived:n(inbound.framesReceived),
        framesDecoded:n(inbound.framesDecoded),
        framesDropped:n(inbound.framesDropped),
        totalDecodeTime:n(inbound.totalDecodeTime),
        freezeCount:n(inbound.freezeCount),
        totalFreezesDuration:n(inbound.totalFreezesDuration)
      },
      candidatePair:selectedPair ? {
        currentRoundTripTime:n(selectedPair.currentRoundTripTime),
        availableIncomingBitrate:n(selectedPair.availableIncomingBitrate),
        bytesReceived:n(selectedPair.bytesReceived)
      } : null
    };
  };

  let resolutionState = {
    patched:false,
    streamDevicePatched:false,
    sessionHandlerPatched:false,
    target:null,
    originalGetSafeResolution:null,
    originalSessionGetWindowResolution:null,
    originalSystemStats:null
  };

  const resolutionObj = v => {
    const width=Math.round(Number(v?.width)||0), height=Math.round(Number(v?.height)||0);
    return width>0 && height>0 ? {width,height} : null;
  };

  const clientResolutionSnapshot = async () => {
    const out={safeResolution:null,systemStatsResolution:null,sessionWindowResolution:null};
    try { out.safeResolution=resolutionObj(StreamDeviceContext?.getSafeResolution?.()); } catch {}
    try { out.systemStatsResolution=resolutionObj(SYSTEM_STATS?.USER_DEVICE_RESOLUTION); } catch {}
    try {
      if (typeof SessionHandler !== 'undefined' && typeof SessionHandler.getWindowResolution === 'function') {
        out.sessionWindowResolution=resolutionObj(await SessionHandler.getWindowResolution());
      }
    } catch {}
    return out;
  };

  const ensureResolutionPatch = target => {
    const t=resolutionObj(target);
    if (!t) return {patched:false,error:'INVALID_TARGET'};
    try {
      resolutionState.target=t;
      window.__BCS_V07_RESOLUTION_TARGET__=t;

      if (typeof StreamDeviceContext !== 'undefined' && typeof StreamDeviceContext.getSafeResolution === 'function') {
        if (!resolutionState.streamDevicePatched) {
          resolutionState.originalGetSafeResolution=StreamDeviceContext.getSafeResolution;
          resolutionState.originalSystemStats=resolutionObj(typeof SYSTEM_STATS !== 'undefined' ? SYSTEM_STATS.USER_DEVICE_RESOLUTION : null);
          const original=StreamDeviceContext.getSafeResolution.bind(StreamDeviceContext);
          StreamDeviceContext.__BCS_V07_ORIGINAL_GET_SAFE_RESOLUTION__=original;
          StreamDeviceContext.getSafeResolution=function(options){
            const active=resolutionObj(resolutionState.target);
            return active || original(options);
          };
          StreamDeviceContext.__BCS_V07_RES__=true;
          resolutionState.streamDevicePatched=true;
        }
      }

      // Decisive attach path from recovered Boosteroid source: wssHandler awaits
      // SessionHandler.getWindowResolution(), then serializes that value into x/y.
      if (typeof SessionHandler !== 'undefined' && typeof SessionHandler.getWindowResolution === 'function') {
        if (!resolutionState.sessionHandlerPatched) {
          resolutionState.originalSessionGetWindowResolution=SessionHandler.getWindowResolution;
          const originalWindowResolution=SessionHandler.getWindowResolution.bind(SessionHandler);
          SessionHandler.__BCS_V07_ORIGINAL_GET_WINDOW_RESOLUTION__=originalWindowResolution;
          SessionHandler.getWindowResolution=async function(...args){
            const active=resolutionObj(resolutionState.target);
            if (active) return {width:active.width,height:active.height};
            return originalWindowResolution(...args);
          };
          SessionHandler.__BCS_V07_RES__=true;
          resolutionState.sessionHandlerPatched=true;
        }
      }

      try {
        if (typeof SYSTEM_STATS !== 'undefined' && SYSTEM_STATS.USER_DEVICE_RESOLUTION) {
          SYSTEM_STATS.USER_DEVICE_RESOLUTION.width=t.width;
          SYSTEM_STATS.USER_DEVICE_RESOLUTION.height=t.height;
        }
      } catch {}

      resolutionState.patched=resolutionState.streamDevicePatched && resolutionState.sessionHandlerPatched;
      return {
        patched:resolutionState.patched,
        streamDevicePatched:resolutionState.streamDevicePatched,
        sessionHandlerPatched:resolutionState.sessionHandlerPatched,
        target:t,
        error:resolutionState.patched ? null : 'WAITING_FOR_RESOLUTION_BINDINGS'
      };
    } catch (e) { return {patched:false,error:e?.message||String(e)}; }
  };

  const removeResolutionPatch = () => {
    try {
      if (resolutionState.streamDevicePatched && typeof StreamDeviceContext !== 'undefined') {
        const original=resolutionState.originalGetSafeResolution;
        if (original) StreamDeviceContext.getSafeResolution=original;
        try { delete StreamDeviceContext.__BCS_V07_RES__; } catch {}
      }
      if (resolutionState.sessionHandlerPatched && typeof SessionHandler !== 'undefined') {
        const original=resolutionState.originalSessionGetWindowResolution;
        if (original) SessionHandler.getWindowResolution=original;
        try { delete SessionHandler.__BCS_V07_RES__; } catch {}
      }
      try {
        const o=resolutionState.originalSystemStats;
        if (o && typeof SYSTEM_STATS !== 'undefined' && SYSTEM_STATS.USER_DEVICE_RESOLUTION) {
          SYSTEM_STATS.USER_DEVICE_RESOLUTION.width=o.width;
          SYSTEM_STATS.USER_DEVICE_RESOLUTION.height=o.height;
        }
      } catch {}
      resolutionState={patched:false,streamDevicePatched:false,sessionHandlerPatched:false,target:null,originalGetSafeResolution:null,originalSessionGetWindowResolution:null,originalSystemStats:null};
      window.__BCS_V07_RESOLUTION_TARGET__=null;
      return {ok:true,restored:true};
    } catch (e) { return {ok:false,error:e?.message||String(e)}; }
  };

  const applyResolution = async payload => {
    const t=resolutionObj(payload?.target);
    if (!t) {
      const restored=removeResolutionPatch();
      return {ok:true,kind:'resolution',mode:'native',target:null,restored,client:await clientResolutionSnapshot()};
    }
    const patch=ensureResolutionPatch(t);
    const client=await clientResolutionSnapshot();
    let peerConnectionPresent=false;
    try {
      peerConnectionPresent=!!(
        (typeof WebRtcTransport !== 'undefined' && WebRtcTransport?.pc) ||
        (typeof JANUS_HELPER !== 'undefined' && JANUS_HELPER?.streamingVideo?.webrtcStuff?.pc) ||
        (typeof StreamHandler !== 'undefined' && (StreamHandler?.pc || StreamHandler?.peerConnection))
      );
    } catch {}
    return {ok:!!patch.patched,kind:'resolution',mode:payload?.mode||'custom',target:t,patch,client,timing:{pageMs:performance.now(),peerConnectionPresent}};
  };

  const applyFps = async payload => {
    const fps=Number(payload?.fps) === 60 ? 60 : 120;
    const live=payload?.live !== false;
    let menuFound=false, nativeHandlerUsed=false, error=null;
    try { localStorage.setItem('fpsRateValue', String(fps)); } catch {}
    try {
      if (typeof menu !== 'undefined' && menu) {
        menuFound=true;
        menu.fpsMaxRate=120;
        menu.previousFpsRate=fps === 120 ? 60 : 120;
        if (live && typeof menu.onChangeFpsRate === 'function') {
          menu.onChangeFpsRate(fps);
          nativeHandlerUsed=true;
        } else {
          menu.fpsRate=fps;
        }
      }
    } catch (e) { error=e?.message || String(e); }
    let current=null;
    try {
      current={
        storage:localStorage.getItem('fpsRateValue'),
        menuFpsRate:typeof menu !== 'undefined' ? primitive(menu?.fpsRate) : null,
        menuFpsMaxRate:typeof menu !== 'undefined' ? primitive(menu?.fpsMaxRate) : null
      };
    } catch {}
    return {ok:!error,kind:'fps',fps,live,menuFound,nativeHandlerUsed,current,error};
  };

  const applyBitrate = async payload => {
    const auto=payload?.auto !== false;
    const live=payload?.live !== false;
    let mbps=Math.round(Number(payload?.mbps));
    if (!Number.isFinite(mbps)) mbps=40;
    mbps=Math.max(5,Math.min(80,mbps));
    let menuFound=false,nativePersistUsed=false,nativeSendUsed=false,error=null,storageKey=null;
    try {
      if (typeof menu !== 'undefined' && menu) {
        menuFound=true;
        try {
          if (typeof menu.getBitrateStorageKey === 'function') storageKey=menu.getBitrateStorageKey();
        } catch {}
      }
      if (!storageKey) {
        let codec='';
        try { codec=String(typeof SessionHandler !== 'undefined' ? SessionHandler?.videoCodec || '' : '').toLowerCase(); } catch {}
        storageKey=codec.includes('av1') ? 'bitrateValueForAV1' : 'bitrateValue';
      }
      if (auto) {
        try { localStorage.removeItem('bitrateValue'); } catch {}
        try { localStorage.removeItem('bitrateValueForAV1'); } catch {}
        if (live && menuFound && typeof menu.sendBitrateMax === 'function') {
          menu.sendBitrateMax(null);
          nativeSendUsed=true;
        }
      } else {
        if (menuFound && typeof menu.persistBitrateValue === 'function') {
          menu.persistBitrateValue(mbps);
          nativePersistUsed=true;
        } else {
          try { localStorage.setItem(storageKey,String(mbps)); } catch {}
        }
        if (live && menuFound && typeof menu.sendBitrateMax === 'function') {
          menu.sendBitrateMax(mbps);
          nativeSendUsed=true;
        }
      }
    } catch (e) { error=e?.message || String(e); }
    let current=null;
    try {
      current={
        auto,
        storageKey,
        bitrateValue:localStorage.getItem('bitrateValue'),
        bitrateValueForAV1:localStorage.getItem('bitrateValueForAV1'),
        menuBitrate:typeof menu !== 'undefined' ? primitive(menu?.bitrateValue) : null
      };
    } catch {}
    return {ok:!error,kind:'bitrate',auto,mbps:auto?null:mbps,live,menuFound,nativePersistUsed,nativeSendUsed,storageKey,current,error};
  };

  // Persistent AUTO profile target captured at document-start.
  const BOOT_TARGET=${JSON.stringify(PENDING_RESOLUTION_ONE_SHOT?.target || null)};

  const control = async payload => {
    const kind=payload?.kind;
    if (kind === 'resolution') return applyResolution(payload);
    if (kind === 'resolutionDisarm') return removeResolutionPatch();
    if (kind === 'resolutionStatus') return {ok:true,patched:resolutionState.patched,target:resolutionState.target,client:await clientResolutionSnapshot()};
    if (kind === 'fps') return applyFps(payload);
    if (kind === 'bitrate') return applyBitrate(payload);
    return {ok:false,error:'CONTROL_DISABLED_IN_V07',kind};
  };

  window.addEventListener(REQ, async ev => {
    const d=ev.detail || {};
    const id=d.id;
    let result;
    try {
      if (d.action === 'stats') result=await statsSnapshot();
      else if (d.action === 'context') result={ok:true,snapshot:contextSnapshot()};
      else if (d.action === 'control') result=await control(d.payload || {});
      else result={ok:false,error:'UNKNOWN_ACTION'};
    } catch (e) {
      result={ok:false,error:e?.message || String(e)};
    }
    window.dispatchEvent(new CustomEvent(RES,{detail:{id,result,at:performance.now()}}));
  });

  if (BOOT_TARGET) {
    let tries=0;
    const bootPatch=async () => {
      tries++;
      const r=await applyResolution({target:BOOT_TARGET,mode:'auto-profile'});
      if (!r.ok && tries < 500) return setTimeout(bootPatch, 20);
      window.dispatchEvent(new CustomEvent(RES,{detail:{bootResolutionResult:r,bootResolutionTries:tries,at:performance.now()}}));
    };
    bootPatch();
  }

  window.dispatchEvent(new CustomEvent(RES,{detail:{bridgeReady:true,at:performance.now()}}));
})();
`;

  const inject = () => {
    try {
      const el = document.createElement('script');
      el.textContent = source;
      (document.documentElement || document.head || document.body).appendChild(el);
      el.remove();
    } catch (e) {
      S.bridgeErrors++;
      addEvent('BRIDGE_INSTALL_ERROR', { message: String(e?.message || e).slice(0, 200) });
    }
  };

  if (document.documentElement) inject();
  else {
    const mo = new MutationObserver(() => {
      if (document.documentElement) {
        mo.disconnect();
        inject();
      }
    });
    mo.observe(document, { childList: true, subtree: true });
  }
}

let bridgeSeq = 0;
const bridgePending = new Map();

window.addEventListener(BRIDGE_RES, ev => {
  const d = ev.detail;
  if (!d || typeof d !== 'object') return;
  if (d.bridgeReady) {
    S.bridgeReady = true;
    addEvent('BRIDGE_READY');
    return;
  }
  if (d.bootResolutionResult) {
    const r=d.bootResolutionResult;
    S.control.application = r;
    S.control.proof.client = r?.client || null;
    S.control.proof.status = r?.ok ? 'WAITING_INBOUND' : 'BOOT_APPLY_FAILED';
    const p=currentExperimentPhase();
    if (p?.kind === 'VIRTUAL_MONITOR') p.application=r;
    const target=S.control.activeTarget;
    const safe=r?.client?.safeResolution;
    const session=r?.client?.sessionWindowResolution;
    const confirmed=!!r?.ok && sameRes(safe,target) && sameRes(session,target);
    addEvent('EARLY_RESOLUTION_OVERRIDE', { target, result:r, tries:d.bootResolutionTries ?? null, streamDocument:IS_STREAM_DOCUMENT });
    if (confirmed) {
      addEvent('CLIENT_RESOLUTION_CONFIRMED',{target,client:r.client,timing:r.timing||null});
      S.control.oneShotConsumed=true;
      addEvent('AUTO_PROFILE_APPLIED', { target, profileEnabled:true, result:r });
    } else {
      addEvent('AUTO_PROFILE_BOOT_PATCH_RETRY', { target, tokenId:S.control.oneShot?.id || null, reason:r?.error || 'CLIENT_PATH_NOT_CONFIRMED', result:r });
    }
    return;
  }
  if (d.id && bridgePending.has(d.id)) {
    const pending = bridgePending.get(d.id);
    bridgePending.delete(d.id);
    pending.resolve(d.result);
  }
});

function bridgeAsk(action, payload = null, timeoutMs = 850) {
  return new Promise(resolve => {
    const id = `bcs-${++bridgeSeq}`;
    const timer = setTimeout(() => {
      if (!bridgePending.has(id)) return;
      bridgePending.delete(id);
      S.sampler.bridgeTimeouts++;
      resolve({ ok: false, error: 'BRIDGE_TIMEOUT' });
    }, timeoutMs);
    bridgePending.set(id, {
      resolve: value => {
        clearTimeout(timer);
        resolve(value);
      }
    });
    window.dispatchEvent(new CustomEvent(BRIDGE_REQ, { detail: { id, action, payload } }));
  });
}

// -----------------------------------------------------------------------------
// VIDEO LIFECYCLE - PLAY-FIRST
// No surface/image lab observer and no per-frame analyzer in the default product.
// -----------------------------------------------------------------------------
function resObj(width,height) {
  width=Math.round(Number(width)||0); height=Math.round(Number(height)||0);
  return width>0&&height>0 ? {width,height} : null;
}

function sameRes(a,b) { return !!a===!!b && (!a || (a.width===b.width && a.height===b.height)); }

function findMainVideo() {
  const preferred=document.getElementById('remotevideo');
  if (preferred instanceof HTMLVideoElement) return preferred;
  const videos=document.querySelectorAll('video');
  if (videos.length===1) return videos[0];
  let best=null,bestArea=-1;
  for (const v of videos) { const area=(v.clientWidth||0)*(v.clientHeight||0); if (area>bestArea) {best=v;bestArea=area;} }
  return best;
}

function snapshotVideo() {
  const v=S.video; if (!v) return;
  S.videoState.resolution=resObj(v.videoWidth||0,v.videoHeight||0);
  S.videoState.readyState=v.readyState;
  S.videoState.paused=v.paused;
  S.videoState.currentTime=Number.isFinite(v.currentTime)?round(v.currentTime,3):null;
}

function reanchorMeasurement(reason,graceSamples=0) {
  S.rtcPrev=null;
  S.measurement.resumeGraceSamples=Math.max(S.measurement.resumeGraceSamples,graceSamples);
  S.measurement.lastReanchorReason=reason;
  S.measurement.lastReanchorAtSec=round(elapsed(),3);
  addEvent('MEASUREMENT_REANCHOR',{reason,graceSamples:S.measurement.resumeGraceSamples,hidden:!!document.hidden,videoPaused:!!S.video?.paused});
}

function measurementEligibility() {
  if (document.hidden||S.measurement.hidden) return {eligible:false,reason:'DOCUMENT_HIDDEN'};
  if (!S.video) return {eligible:false,reason:'NO_VIDEO'};
  if (S.video.paused||S.measurement.videoPaused) return {eligible:false,reason:'VIDEO_PAUSED'};
  if ((S.video.readyState||0)<2) return {eligible:false,reason:'VIDEO_NOT_READY'};
  if (S.measurement.resumeGraceSamples>0) return {eligible:false,reason:'RESUME_GRACE'};
  return {eligible:true,reason:null};
}

function bindGlobalSurfaceEvents() {
  if (S.surface.globalBound) return;
  S.surface.globalBound=true;
  document.addEventListener('visibilitychange',()=>{
    S.measurement.hidden=!!document.hidden;
    reanchorMeasurement(document.hidden?'DOCUMENT_HIDDEN':'DOCUMENT_VISIBLE',document.hidden?0:2);
    addEvent('VISIBILITY_CHANGE',{hidden:!!document.hidden});
  },{passive:true});
}

function bindVideo(v) {
  if (!v || (S.video===v && S.videoBound)) return;
  S.video=v; S.videoBound=true; S.measurement.videoPaused=!!v.paused;
  if (S.firstVideoAt==null) S.firstVideoAt=round(elapsed(),3);
  addEvent('VIDEO_FOUND',{id:v.id||null});
  const on=(name,fn=null)=>v.addEventListener(name,()=>{ if(fn)fn(); snapshotVideo(); addEvent('VIDEO_EVENT',{event:name,readyState:v.readyState}); },{passive:true});
  on('loadedmetadata',()=>{if(S.firstMetadataAt==null)S.firstMetadataAt=round(elapsed(),3);});
  on('playing',()=>{if(S.firstPlayingAt==null)S.firstPlayingAt=round(elapsed(),3);S.measurement.videoPaused=false;reanchorMeasurement('VIDEO_PLAYING',2);});
  on('pause',()=>{S.measurement.videoPaused=true;reanchorMeasurement('VIDEO_PAUSE',0);});
  on('waiting'); on('stalled'); on('emptied'); on('resize');
  snapshotVideo();
}

function videoScanner() {
  const v=findMainVideo();
  if (v && v!==S.video) bindVideo(v);
  if (!S.video || !document.contains(S.video)) {
    if (S.video && !document.contains(S.video)) { addEvent('VIDEO_REMOVED'); S.video=null; S.videoBound=false; }
    setTimeout(videoScanner,1500);
  } else setTimeout(videoScanner,4000);
}

// -----------------------------------------------------------------------------
// RTC PROCESSING
// -----------------------------------------------------------------------------
function processRtc(raw,localNow) {
  if (!raw?.ok || !raw.inbound) return null;
  const r=raw.inbound;
  const cur={
    localNow,timestamp:r.timestamp,
    bytesReceived:r.bytesReceived??null,
    videoBytesReceivedTotal:Number.isFinite(raw.videoAggregate?.bytesReceivedTotal)?raw.videoAggregate.bytesReceivedTotal:null,
    transportBytesReceived:Number.isFinite(raw.candidatePair?.bytesReceived)?raw.candidatePair.bytesReceived:null,
    packetsReceived:r.packetsReceived??0,packetsLost:r.packetsLost??0,
    framesReceived:r.framesReceived??0,framesDecoded:r.framesDecoded??0,framesDropped:r.framesDropped??0,
    totalDecodeTime:r.totalDecodeTime??null,freezeCount:r.freezeCount??0,totalFreezesDuration:r.totalFreezesDuration??null
  };
  const out={
    pcSource:raw.pcSource||null,pcState:raw.pcState||null,iceState:raw.iceState||null,
    codec:r.mimeType||null,inboundResolution:resObj(r.frameWidth,r.frameHeight),rtcFPS:r.framesPerSecond??null,
    bitrateMbps:null,bitrateSource:null,bitrateScope:null,bitrateConfidence:null,
    receivedFPS:null,decodedFPS:null,packetsLostRaw:cur.packetsLost,packetsLostDelta:null,packetsReceivedDelta:null,packetLossPercent:null,
    networkJitterMs:Number.isFinite(r.jitter)?r.jitter*1000:null,
    framesDroppedDelta:null,freezeCount:cur.freezeCount,freezeDelta:null,freezeDurationDeltaMs:null,decodeTimePerFrameMs:null,
    rttMs:Number.isFinite(raw.candidatePair?.currentRoundTripTime)?raw.candidatePair.currentRoundTripTime*1000:null,
    availableIncomingMbps:Number.isFinite(raw.candidatePair?.availableIncomingBitrate)?raw.candidatePair.availableIncomingBitrate/1e6:null
  };
  const prev=S.rtcPrev;
  if (prev) {
    let dt=Number.isFinite(cur.timestamp)&&Number.isFinite(prev.timestamp)?(cur.timestamp-prev.timestamp)/1000:null;
    if (!(dt>0&&dt<10)) dt=(localNow-prev.localNow)/1000;
    if (dt>0) {
      const recvFrames=cur.framesReceived-prev.framesReceived, decFrames=cur.framesDecoded-prev.framesDecoded;
      const recvPackets=cur.packetsReceived-prev.packetsReceived, lost=cur.packetsLost-prev.packetsLost;
      if (recvFrames>=0) out.receivedFPS=recvFrames/dt;
      if (decFrames>=0) out.decodedFPS=decFrames/dt;
      out.packetsReceivedDelta=recvPackets>=0?recvPackets:null; out.packetsLostDelta=lost>=0?lost:null;
      const total=Math.max(0,recvPackets)+Math.max(0,lost); if(total>0) out.packetLossPercent=Math.max(0,lost)/total*100;
      const aggregateDelta=Number.isFinite(cur.videoBytesReceivedTotal)&&Number.isFinite(prev.videoBytesReceivedTotal)?cur.videoBytesReceivedTotal-prev.videoBytesReceivedTotal:null;
      const selectedDelta=Number.isFinite(cur.bytesReceived)&&Number.isFinite(prev.bytesReceived)?cur.bytesReceived-prev.bytesReceived:null;
      const transportDelta=Number.isFinite(cur.transportBytesReceived)&&Number.isFinite(prev.transportBytesReceived)?cur.transportBytesReceived-prev.transportBytesReceived:null;
      const progressed=recvFrames>0||recvPackets>0;
      if (Number.isFinite(aggregateDelta)&&aggregateDelta>0) {out.bitrateMbps=aggregateDelta*8/dt/1e6;out.bitrateSource='INBOUND_VIDEO_BYTES_SUM';out.bitrateScope='VIDEO';out.bitrateConfidence='DIRECT_COUNTER';}
      else if (Number.isFinite(selectedDelta)&&selectedDelta>0) {out.bitrateMbps=selectedDelta*8/dt/1e6;out.bitrateSource='SELECTED_INBOUND_VIDEO_BYTES';out.bitrateScope='VIDEO';out.bitrateConfidence='DIRECT_COUNTER';}
      else if (progressed&&Number.isFinite(transportDelta)&&transportDelta>0) {out.bitrateMbps=transportDelta*8/dt/1e6;out.bitrateSource='CANDIDATE_PAIR_BYTES_FALLBACK';out.bitrateScope='TRANSPORT';out.bitrateConfidence='APPROXIMATE';}
      else if (!progressed&&aggregateDelta===0) {out.bitrateMbps=0;out.bitrateSource='INBOUND_VIDEO_BYTES_SUM';out.bitrateScope='VIDEO';out.bitrateConfidence='DIRECT_COUNTER';}
      const dropped=cur.framesDropped-prev.framesDropped; out.framesDroppedDelta=dropped>=0?dropped:null;
      const freeze=cur.freezeCount-prev.freezeCount; out.freezeDelta=freeze>=0?freeze:null;
      if (Number.isFinite(cur.totalFreezesDuration)&&Number.isFinite(prev.totalFreezesDuration)&&cur.totalFreezesDuration>=prev.totalFreezesDuration) out.freezeDurationDeltaMs=(cur.totalFreezesDuration-prev.totalFreezesDuration)*1000;
      const decode=Number.isFinite(cur.totalDecodeTime)&&Number.isFinite(prev.totalDecodeTime)?cur.totalDecodeTime-prev.totalDecodeTime:null;
      if (Number.isFinite(decode)&&decode>=0&&decFrames>0) out.decodeTimePerFrameMs=decode/decFrames*1000;
    }
  }
  S.rtcPrev=cur;
  if (out.codec&&out.codec!==S.lastCodec) {addEvent('CODEC_CHANGE',{from:S.lastCodec,to:out.codec});S.lastCodec=out.codec;}
  if (out.inboundResolution&&!sameRes(out.inboundResolution,S.lastInboundResolution)) {addEvent('INBOUND_RESOLUTION_CHANGE',{from:S.lastInboundResolution,to:out.inboundResolution});S.lastInboundResolution=out.inboundResolution;}
  if (out.pcState&&out.pcState!==S.lastPcState) {addEvent('PEER_CONNECTION_STATE',{from:S.lastPcState,to:out.pcState,source:out.pcSource});S.lastPcState=out.pcState;}
  if ((out.freezeDelta||0)>0) addEvent('FREEZE_CHANGE',{delta:out.freezeDelta,total:out.freezeCount});
  if (out.bitrateSource&&out.bitrateSource!==S.lastBitrateSource) {addEvent('BITRATE_SOURCE_CHANGE',{from:S.lastBitrateSource,to:out.bitrateSource,scope:out.bitrateScope,confidence:out.bitrateConfidence});S.lastBitrateSource=out.bitrateSource;}
  return out;
}

async function refreshContext(force=false) {
  if (!S.bridgeReady) return 0;
  if (!force && now()-S.lastContextAt<CONTEXT_MS) return 0;
  S.lastContextAt=now();
  const wallStart=now();
  const r=await bridgeAsk('context',null,600);
  if (r?.ok && r.snapshot) S.contextLatest=r.snapshot;
  return now()-wallStart;
}

function resolutionTargetForMode(mode = lsGet(K.resolutionMode, 'native')) {
  if (mode === 'custom') {
    const width = Number(lsGet(K.resolutionW, '0'));
    const height = Number(lsGet(K.resolutionH, '0'));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return Object.prototype.hasOwnProperty.call(RES_PRESETS, mode) ? RES_PRESETS[mode] : null;
}

function resolutionTarget() { return resolutionTargetForMode(lsGet(K.resolutionMode, 'native')); }

function controlSnapshot() {
  const auto = lsGet(K.bitrateAuto, 'true') !== 'false';
  const requestedBitrate = auto ? null : (Number(lsGet(K.bitrateManual, '0')) || null);
  const nativeH264 = Number(lsGet(K.bitrateH264, '0')) || null;
  const nativeAV1 = Number(lsGet(K.bitrateAV1, '0')) || null;
  const nativeStorageKey =
    S.control.bitrateApplication?.storageKey ||
    S.control.bitrateApplication?.current?.storageKey ||
    null;

  return {
    profileEnabled: isAutoEnabled(),
    state: S.control.state,
    mode: S.mode,
    armed: S.control.state === 'ARMED' || S.control.state === 'ACTIVE',
    active: S.control.state === 'ACTIVE',
    preferenceMode: lsGet(K.resolutionMode, 'native'),
    preferenceTarget: resolutionTarget(),
    activeMode: S.control.activeMode,
    activeTarget: S.control.activeTarget,
    frozen: S.control.frozen,
    fpsRequested: Number(lsGet(K.fps, '0')) || null,
    bitrateAuto: auto,
    bitrateRequestedMbps: requestedBitrate,
    nativeBitrateEvidence: {
      storageKey: nativeStorageKey,
      h264Mbps: nativeH264,
      av1Mbps: nativeAV1,
      persistUsed: !!S.control.bitrateApplication?.nativePersistUsed,
      sendUsed: !!S.control.bitrateApplication?.nativeSendUsed
    },
    bootProfileEnabled: !!S.control.profileEnabledAtBoot,
    legacyOneShot: {
      internalCompatibilityOnly: true,
      bootContextPresent: !!S.control.oneShot,
      bootContextConsumed: !!S.control.oneShotConsumed
    },
    application: S.control.application,
    fpsApplication: S.control.fpsApplication,
    bitrateApplication: S.control.bitrateApplication,
    proof: { ...S.control.proof }
  };
}

function baselineFreezeSnapshot() {
  const latest=S.samples.toArray().at(-1) || {};
  const ctx=S.contextLatest || {};
  const auto=lsGet(K.bitrateAuto,'true') !== 'false';
  return {
    capturedAtSec: round(elapsed(),3),
    codec: latest.codec || ctx.sessionHandler?.videoCodec || null,
    targetFps: latest.targetFps ?? numberCandidate(ctx.menu?.fpsRate) ?? numberCandidate(lsGet(K.fps,null)),
    targetFpsSource: latest.targetFpsSource || (numberCandidate(ctx.menu?.fpsRate) ? 'client.menu.fpsRate' : null),
    bitrateAuto: auto,
    bitratePreferenceMbps: auto ? null : (Number(lsGet(K.bitrateManual,'0')) || null),
    observedBitrateMbps: latest.bitrateMbps ?? null,
    inboundResolution: latest.inboundResolution || S.lastInboundResolution || null
  };
}

function armResolutionControl() {
  if (S.control.state !== 'SAFE') {
    addEvent('CONTROL_IDEMPOTENT_NOOP',{action:'ARM',state:S.control.state,reason:'ALREADY_ARMED_OR_ACTIVE'});
    updateUI();
    return false;
  }
  S.control.frozen = baselineFreezeSnapshot();
  S.control.state = 'ARMED';
  S.control.armedAtSec = round(elapsed(),3);
  S.control.disarmedAtSec = null;
  S.mode = 'ARMED';
  addEvent('CONTROL_ARMED', {
    scope:'STREAM_CONFIG',
    frozen:S.control.frozen,
    preference:{mode:lsGet(K.resolutionMode,'native'),target:resolutionTarget()}
  });
  updateUI();
}

async function applyResolutionControl(mode = lsGet(K.resolutionMode, 'native')) {
  if (S.control.state === 'SAFE') {
    addEvent('CONTROL_REJECTED', { reason:'NOT_ARMED', control:'resolution', mode });
    return {ok:false,error:'NOT_ARMED'};
  }
  if (S.control.applyBusy) {
    addEvent('CONTROL_IDEMPOTENT_NOOP',{action:'APPLY',mode,reason:'APPLY_IN_FLIGHT'});
    return S.control.application || {ok:false,error:'APPLY_IN_FLIGHT'};
  }
  lsSet(K.resolutionMode, mode);
  const target = resolutionTargetForMode(mode);
  if (mode !== 'native' && !target) return {ok:false,error:'INVALID_RESOLUTION'};

  const sameActive = S.control.state === 'ACTIVE' && S.control.activeMode === mode && sameRes(S.control.activeTarget,target) && S.control.application?.ok;
  if (sameActive) {
    addEvent('CONTROL_IDEMPOTENT_NOOP',{action:'APPLY',mode,target,reason:'IDENTICAL_TARGET_ALREADY_ACTIVE'});
    updateUI();
    return S.control.application;
  }

  S.control.applyBusy=true;
  try {
    const latest=S.samples.toArray().at(-1) || {};
    const result=await bridgeAsk('control',{kind:'resolution',mode,target});
    if (!result?.ok) {
      addEvent('CONTROL_APPLY_FAILED',{scope:'STREAM_CONFIG',mode,target,result});
      updateUI();
      return result;
    }
    S.control.state='ACTIVE';
    S.mode='ACTIVE';
    S.control.activeAtSec=round(elapsed(),3);
    S.control.activeMode=mode;
    S.control.activeTarget=target;
    S.control.application=result;
    S.control.proof={
      status: target ? 'WAITING_INBOUND' : 'NATIVE_RELEASED',
      requested: target,
      inboundBefore: latest.inboundResolution || S.lastInboundResolution || null,
      inboundObserved: latest.inboundResolution || S.lastInboundResolution || null,
      client: result?.client || null,
      matchCount:0,
      alternateCount:0,
      startedAtSec:round(elapsed(),3),
      updatedAtSec:round(elapsed(),3)
    };
    addEvent('CONTROL_APPLIED', { scope:'STREAM_CONFIG', mode, target, result, fpsRequested:Number(lsGet(K.fps,'120')) === 60 ? 60 : 120, bitrateRequestedMbps:lsGet(K.bitrateAuto,'true') !== 'false' ? null : (Number(lsGet(K.bitrateManual,'0')) || null) });
    await refreshContext(true);
    updateUI();
    return result;
  } finally {
    S.control.applyBusy=false;
  }
}

async function disarmResolutionControl() {
  setAutoEnabled(false);
  lsRemove(K.resolutionOneShot);

  const previous={state:S.control.state,mode:S.control.activeMode,target:S.control.activeTarget,proof:{...S.control.proof}};
  let result=null;
  if (S.control.state === 'ACTIVE') result=await bridgeAsk('control',{kind:'resolutionDisarm'});
  S.control.state='SAFE';
  S.mode='SAFE';
  S.control.disarmedAtSec=round(elapsed(),3);
  S.control.activeAtSec=null;
  S.control.activeMode=null;
  S.control.activeTarget=null;
  S.control.application=null;
  lsRemove(K.resolutionOneShot);
  S.control.oneShot=null;
  S.control.oneShotConsumed=false;
  S.control.proof={status:'IDLE',requested:null,inboundBefore:null,inboundObserved:null,matchCount:0,alternateCount:0,startedAtSec:null,updatedAtSec:round(elapsed(),3)};
  addEvent('CONTROL_DISARMED', { previous, result, preferencesPreserved:true });
  updateUI();
}

async function applyFpsControl(value = lsGet(K.fps, '120'), live = true) {
  const fps=Number(value) === 60 ? 60 : 120;
  lsSet(K.fps, fps);
  const result=await bridgeAsk('control',{kind:'fps',fps,live});
  S.control.fpsApplication=result || {ok:false,error:'NO_RESULT',fps};
  addEvent(result?.ok ? 'FPS_APPLIED' : 'FPS_APPLY_FAILED', {
    fps,
    live,
    result,
    source:'NATIVE_FPS_PATH'
  });
  await refreshContext(true);
  updateUI();
  return result;
}

async function applyBitrateControl(auto = lsGet(K.bitrateAuto,'true') !== 'false', value = 40, live = true) {
  const isAuto=!!auto;
  let mbps=Math.round(Number(value));
  if (!Number.isFinite(mbps)) mbps=40;
  mbps=clamp(mbps,5,80);
  lsSet(K.bitrateAuto,isAuto ? 'true' : 'false');
  if (!isAuto) lsSet(K.bitrateManual,mbps);
  const result=await bridgeAsk('control',{kind:'bitrate',auto:isAuto,mbps,live});
  S.control.bitrateApplication=result || {ok:false,error:'NO_RESULT',auto:isAuto,mbps:isAuto?null:mbps};
  addEvent(result?.ok ? 'BITRATE_APPLIED' : 'BITRATE_APPLY_FAILED',{
    auto:isAuto,mbps:isAuto?null:mbps,live,result,source:'NATIVE_BITRATE_PATH'
  });
  await refreshContext(true);
  updateUI();
  return result;
}

async function applyVirtualMonitorFromUI() {
  const mode=lsGet(K.resolutionMode,'native');
  const target=resolutionTargetForMode(mode);
  const fps=Number(lsGet(K.fps,'120')) === 60 ? 60 : 120;
  const brAuto=lsGet(K.bitrateAuto,'true') !== 'false';
  const brValue=clamp(Number(lsGet(K.bitrateManual,'40')) || 40,5,80);

  // Outside streaming this is deliberately configuration-only: no queue, no
  // fake live apply, no bridge timeout. The user can then press PLAY once.
  if (!IS_STREAM_DOCUMENT) {
    lsSet(K.fps,fps);
    lsSet(K.bitrateAuto,brAuto ? 'true' : 'false');
    if (brAuto) {
      lsRemove(K.bitrateH264);
      lsRemove(K.bitrateAV1);
    } else {
      lsSet(K.bitrateManual,brValue);
      lsSet(K.bitrateH264,brValue);
      lsSet(K.bitrateAV1,brValue);
    }
    saveProfilePreferences();
    setText('bcs-action-status',`CONFIGURAÇÃO SALVA • ${target ? formatRes(target) : 'NATIVO'} • ${fps} FPS • ${brAuto ? 'AUTO' : brValue+' Mbps'}`);
    addEvent('STREAM_CONFIGURATION_SAVED_PREPLAY',{resolutionMode:mode,resolutionTarget:target,fps,bitrateAuto:brAuto,bitrateMbps:brAuto?null:brValue});
    updateUI();
    return;
  }

  setText('bcs-action-status','APLICANDO AO STREAM...');
  if (S.control.state === 'SAFE') armResolutionControl();
  const fpsResult=await applyFpsControl(fps,true);
  const bitrateResult=await applyBitrateControl(brAuto,brValue,true);
  const resResult=await applyResolutionControl(mode);
  saveProfilePreferences();
  if (resResult?.ok && fpsResult?.ok && bitrateResult?.ok) {
    setText('bcs-action-status',`APLICADO • ${target ? formatRes(target) : 'NATIVO'} • ${fps} FPS • ${brAuto ? 'AUTO' : brValue+' Mbps'}`);
  } else {
    setText('bcs-action-status',`FALHA • RES:${resResult?.error || 'OK'} • FPS:${fpsResult?.error || 'OK'} • BR:${bitrateResult?.error || 'OK'}`);
  }
  updateUI();
}

async function prepareNextSessionFromUI() {
  setText('bcs-action-status','ATIVANDO PERFIL AUTOMÁTICO...');
  const mode=lsGet(K.resolutionMode,'native');
  const target=resolutionTargetForMode(mode);
  const fps=Number(lsGet(K.fps,'120')) === 60 ? 60 : 120;
  const brAuto=lsGet(K.bitrateAuto,'true') !== 'false';
  const brValue=clamp(Number(lsGet(K.bitrateManual,'40')) || 40,5,80);

  // Persist native preferences early. Resolution is applied at next stream boot.
  lsSet(K.fps,fps);
  lsSet(K.bitrateAuto,brAuto ? 'true' : 'false');
  if (brAuto) {
    lsRemove(K.bitrateH264);
    lsRemove(K.bitrateAV1);
  } else {
    lsSet(K.bitrateManual,brValue);
    lsSet(K.bitrateH264,brValue);
    lsSet(K.bitrateAV1,brValue);
  }

  const sharedOk=setAutoEnabled(true);
  addEvent('AUTO_PROFILE_SAVED',{
    resolutionMode:mode,
    resolutionTarget:target,
    fps,
    bitrateAuto:brAuto,
    bitrateMbps:brAuto ? null : brValue,
    sharedCookie:sharedOk,
    origin:location.origin,
    streamDocument:IS_STREAM_DOCUMENT,
    appliesToCurrentSession:false,
    appliesToNextSession:true
  });

  setText(
    'bcs-action-status',
    IS_STREAM_DOCUMENT
      ? `AUTO ATIVO • PRÓXIMAS SESSÕES • use APLICAR AO STREAM para alterar esta sessão`
      : `AUTO ATIVO • APERTE PLAY NORMALMENTE`
  );
  updateUI();
}

function evaluateResolutionProof(sample) {
  const P=S.control.proof;
  if (S.control.state !== 'ACTIVE' || !P || !Number.isFinite(P.startedAtSec)) return;
  const inbound=sample.inboundResolution;
  if (!inbound) return;
  P.inboundObserved=inbound;
  const old=P.status;
  const req=P.requested;
  const same=(a,b)=>!!a&&!!b&&a.width===b.width&&a.height===b.height;
  if (!req) {
    P.status='NATIVE_RELEASED';
  } else if (same(inbound,req)) {
    P.matchCount++;
    P.alternateCount=0;
    if (P.matchCount >= RESOLUTION_PROOF_CONFIRM_SAMPLES) P.status='PROVEN_INBOUND';
  } else {
    P.matchCount=0;
    const changedFromBefore=P.inboundBefore && !same(inbound,P.inboundBefore);
    const bootProfileWithoutBaseline=!P.inboundBefore && !!S.control.oneShot;
    if (changedFromBefore || bootProfileWithoutBaseline) {
      P.alternateCount++;
      if (P.alternateCount >= RESOLUTION_PROOF_CONFIRM_SAMPLES) P.status='SERVER_CLAMPED_OR_ALTERNATE';
    } else if (sample.t - P.startedAtSec >= RESOLUTION_PROOF_TIMEOUT_SEC) {
      P.status='CLIENT_OVERRIDE_ONLY_REATTACH_REQUIRED';
    }
  }
  P.updatedAtSec=sample.t;
  if (P.status !== old) {
    addEvent('RESOLUTION_PROOF_STATUS',{from:old,to:P.status,requested:req,inbound,client:P.client||null});
    if ((P.status === 'PROVEN_INBOUND' || P.status === 'SERVER_CLAMPED_OR_ALTERNATE') && S.control.oneShot && !S.control.oneShotConsumed) {
      lsRemove(K.resolutionOneShot);
      S.control.oneShotConsumed=true;
      addEvent('AUTO_PROFILE_INBOUND_CONFIRMED',{target:req,tokenId:S.control.oneShot?.id||null,source:'INBOUND_PROOF_SAME_DOCUMENT',proofStatus:P.status,inbound});
    }
  }
}

function numberCandidate(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveTargetFps(control = controlSnapshot()) {
  const ctx = S.contextLatest || {};
  const candidates = [
    ['client.menu.fpsRate', ctx.menu?.fpsRate],
    ['client.menu.fpsRateValue', ctx.menu?.fpsRateValue],
    ['client.storage.fpsRateValue', ctx.storage?.fpsRateValue],
    ['page.localStorage.fpsRateValue', lsGet(K.fps, null)]
  ];
  for (const [source, value] of candidates) {
    const n = numberCandidate(value);
    if (n) return {
      value: n,
      source,
      controlRequested: null
    };
  }
  return { value: null, source: null, controlRequested: null };
}

function detectNetworkAuto() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return null;
  return {
    type: c.type || null,
    effectiveType: c.effectiveType || null,
    downlinkMbps: Number.isFinite(c.downlink) ? c.downlink : null,
    rttHintMs: Number.isFinite(c.rtt) ? c.rtt : null,
    saveData: typeof c.saveData === 'boolean' ? c.saveData : null
  };
}

function classifyPhase(sample) {
  const P = S.phase;
  const active = sample.streamActive && sample.pcState === 'connected';
  const stable = active && sample.measurementEligible !== false &&
    Number.isFinite(sample.receivedFPS) && sample.receivedFPS > 0 &&
    Number.isFinite(sample.decodedFPS) && sample.decodedFPS > 0 &&
    !!sample.codec && !!sample.inboundResolution;

  if (P.current === 'PRE_STREAM' && active) {
    P.current = 'STARTUP';
    P.startupAtSec = sample.t;
    P.stableCount = 0;
    addEvent('PHASE_CHANGE', { from: 'PRE_STREAM', to: 'STARTUP', reason: 'ACTIVE_STREAM_DETECTED' });
  }

  if (P.current === 'STARTUP') {
    P.stableCount = stable ? P.stableCount + 1 : 0;
    if (P.stableCount >= P.requiredStableSamples) {
      P.current = 'STEADY_STATE';
      P.steadyAtSec = sample.t;
      addEvent('PHASE_CHANGE', {
        from: 'STARTUP',
        to: 'STEADY_STATE',
        reason: 'CONSECUTIVE_STABLE_SAMPLES',
        stableSamples: P.requiredStableSamples
      });
    }
  }

  sample.phase = P.current;
  sample.stabilityEvidence = {
    stableNow: stable,
    consecutiveStableSamples: P.stableCount,
    requiredStableSamples: P.requiredStableSamples
  };
  return sample.phase;
}

// Long-session diagnostics were removed from the default runtime by PLAY-FIRST pruning.
// Reintroduce only as temporary/on-demand tooling if a real long-session issue returns.

// -----------------------------------------------------------------------------
// SAMPLER / PERFORMANCE GUARD
// -----------------------------------------------------------------------------
async function sampleOnce() {
  const cycleStart=now(); S.sampler.samplesAttempted++;
  let localWorkMs=0, syncStart=now();
  snapshotVideo();
  const sampleNow=now();
  const eligibility=measurementEligibility();
  localWorkMs+=now()-syncStart;

  const bridgeStart=now();
  const rawRtc=S.bridgeReady ? await bridgeAsk('stats',null,850) : {ok:false,error:'BRIDGE_NOT_READY'};
  const bridgeStatsWallMs=S.bridgeReady?now()-bridgeStart:0;

  syncStart=now(); const rtc=processRtc(rawRtc,sampleNow); localWorkMs+=now()-syncStart;
  const contextWallMs=await refreshContext(false)||0;

  syncStart=now();
  const control=controlSnapshot();
  const target=resolveTargetFps(control);
  const sample={
    t:round(elapsed(),3),phase:S.phase.current,streamActive:!!S.video&&(S.video.readyState||0)>=2,
    lab:S.lab,network:S.network,networkAuto:detectNetworkAuto(),mode:S.mode,controlState:S.control.state,
    measurementEligible:eligibility.eligible,measurementIneligibleReason:eligibility.reason,
    resolutionPreferenceMode:lsGet(K.resolutionMode,'native'),resolutionRequested:S.control.activeTarget,resolutionProofStatus:S.control.proof?.status||'IDLE',
    videoResolution:S.videoState.resolution,videoReadyState:S.videoState.readyState,
    pcSource:rtc?.pcSource??null,pcState:rtc?.pcState??null,codec:rtc?.codec??S.lastCodec,inboundResolution:rtc?.inboundResolution??S.lastInboundResolution,
    rtcFPS:round(rtc?.rtcFPS,3),receivedFPS:round(rtc?.receivedFPS,3),decodedFPS:round(rtc?.decodedFPS,3),
    bitrateMbps:round(rtc?.bitrateMbps,3),bitrateSource:rtc?.bitrateSource??null,bitrateScope:rtc?.bitrateScope??null,bitrateConfidence:rtc?.bitrateConfidence??null,
    networkJitterMs:round(rtc?.networkJitterMs,3),rttMs:round(rtc?.rttMs,3),availableIncomingMbps:round(rtc?.availableIncomingMbps,3),packetLossPercent:round(rtc?.packetLossPercent,5),
    framesDroppedDelta:rtc?.framesDroppedDelta??null,freezeDelta:rtc?.freezeDelta??null,freezeDurationDeltaMs:round(rtc?.freezeDurationDeltaMs,3),decodeTimePerFrameMs:round(rtc?.decodeTimePerFrameMs,3),
    targetFps:target.value,targetFpsSource:target.source,controlRequestedFps:control.fpsRequested,targetBitrateMbps:control.bitrateRequestedMbps,bitrateAuto:control.bitrateAuto,resolutionMode:control.preferenceMode
  };
  classifyPhase(sample); evaluateResolutionProof(sample); sample.resolutionProofStatus=S.control.proof?.status||sample.resolutionProofStatus;
  localWorkMs+=now()-syncStart;

  const beforeUi=now(); if (S.ui.open) updateUI(sample); const uiCostMs=S.ui.open?now()-beforeUi:0;
  const cycleWallMs=now()-cycleStart;
  S.sampler.lastCycleWallMs=cycleWallMs; S.sampler.lastLocalWorkMs=localWorkMs; S.sampler.lastBridgeStatsWallMs=bridgeStatsWallMs; S.sampler.lastContextWallMs=contextWallMs; S.sampler.lastUiCostMs=uiCostMs;
  sample.suiteCycleWallMs=round(cycleWallMs,3); sample.suiteLocalWorkMs=round(localWorkMs,3); sample.suiteBridgeStatsWallMs=round(bridgeStatsWallMs,3); sample.suiteContextWallMs=round(contextWallMs,3); sample.suiteUiCostMs=round(uiCostMs,3);
  S.latestSample=sample; S.samples.push(sample);
  if (S.measurement.resumeGraceSamples>0) S.measurement.resumeGraceSamples--;
  if (cycleWallMs>=SAMPLE_MS) S.sampler.skipped++;
  return cycleWallMs;
}

async function samplerLoop() {
  if (!S.sampler.running) return;
  let cost = 0;
  try { cost = await sampleOnce(); }
  catch (e) {
    S.bridgeErrors++;
    addEvent('SAMPLER_ERROR', { message: String(e?.message || e).slice(0, 200) });
  }
  if (!S.sampler.running) return;
  const delay = Math.max(50, SAMPLE_MS - (Number.isFinite(cost) ? cost : 0));
  S.sampler.timer = setTimeout(samplerLoop, delay);
}

function startSampler() {
  if (S.sampler.running) return;
  S.sampler.running = true;
  setTimeout(samplerLoop, 100);
}


// -----------------------------------------------------------------------------
// PRODUCT EXPERIENCE - AUTOMATIC PROFILE ORCHESTRATION
// UI intent is immediate: changing a visible stream preference persists it
// automatically and applies the existing native control path when a stream is
// already active. No new resolution/FPS/bitrate mechanism is introduced here.
// -----------------------------------------------------------------------------
function persistEnabledStreamProfile() {
  if (!isAutoEnabled()) return saveProfilePreferences();
  return setAutoEnabled(true);
}

async function enableStreamProfileFromUI() {
  setAutoEnabled(true);
  if (!IS_STREAM_DOCUMENT) {
    saveProfilePreferences();
    addEvent('PRODUCT_PROFILE_ENABLED',{streamDocument:false,appliedNow:false});
    updateUI();
    return;
  }
  if (S.control.state === 'SAFE') armResolutionControl();
  const fps=Number(lsGet(K.fps,'120'))===60?60:120;
  const brAuto=lsGet(K.bitrateAuto,'true')!=='false';
  const brValue=clamp(Number(lsGet(K.bitrateManual,'40'))||40,5,80);
  const fpsResult=await applyFpsControl(fps,true);
  const bitrateResult=await applyBitrateControl(brAuto,brValue,true);
  const resolutionResult=await applyResolutionControl(lsGet(K.resolutionMode,'native'));
  persistEnabledStreamProfile();
  addEvent('PRODUCT_PROFILE_ENABLED',{streamDocument:true,appliedNow:true,fpsOk:!!fpsResult?.ok,bitrateOk:!!bitrateResult?.ok,resolutionOk:!!resolutionResult?.ok});
  updateUI();
}

async function saveResolutionPreferenceFromUI(mode) {
  lsSet(K.resolutionMode,mode);
  S.control.preferenceMode=mode;
  persistEnabledStreamProfile();
  if (isAutoEnabled() && IS_STREAM_DOCUMENT) {
    if (S.control.state === 'SAFE') armResolutionControl();
    await applyResolutionControl(mode);
  }
  addEvent('PRODUCT_PREFERENCE_CHANGE',{control:'resolution',mode,autoPersisted:isAutoEnabled(),liveAttempted:isAutoEnabled()&&IS_STREAM_DOCUMENT});
  updateUI();
}

async function saveCustomResolutionFromUI(width,height) {
  const w=Math.max(320,Math.round(Number(width)||1920));
  const h=Math.max(240,Math.round(Number(height)||1080));
  lsSet(K.resolutionW,w); lsSet(K.resolutionH,h); lsSet(K.resolutionMode,'custom');
  S.control.preferenceMode='custom';
  persistEnabledStreamProfile();
  if (isAutoEnabled() && IS_STREAM_DOCUMENT) {
    if (S.control.state === 'SAFE') armResolutionControl();
    await applyResolutionControl('custom');
  }
  addEvent('PRODUCT_PREFERENCE_CHANGE',{control:'resolution',mode:'custom',width:w,height:h,autoPersisted:isAutoEnabled(),liveAttempted:isAutoEnabled()&&IS_STREAM_DOCUMENT});
  updateUI();
}

async function saveFpsPreferenceFromUI(value) {
  const fps=Number(value)===60?60:120;
  lsSet(K.fps,fps);
  persistEnabledStreamProfile();
  if (isAutoEnabled() && IS_STREAM_DOCUMENT) await applyFpsControl(fps,true);
  addEvent('PRODUCT_PREFERENCE_CHANGE',{control:'fps',fps,autoPersisted:isAutoEnabled(),liveAttempted:isAutoEnabled()&&IS_STREAM_DOCUMENT});
  updateUI();
}

async function saveBitratePreferenceFromUI(auto,value) {
  const isAuto=!!auto;
  const mbps=clamp(Math.round(Number(value)||40),5,80);
  lsSet(K.bitrateAuto,isAuto?'true':'false');
  if (!isAuto) lsSet(K.bitrateManual,mbps);
  persistEnabledStreamProfile();
  if (isAuto) { lsRemove(K.bitrateH264); lsRemove(K.bitrateAV1); }
  else { lsSet(K.bitrateH264,mbps); lsSet(K.bitrateAV1,mbps); }
  if (isAutoEnabled() && IS_STREAM_DOCUMENT) await applyBitrateControl(isAuto,mbps,true);
  addEvent('PRODUCT_PREFERENCE_CHANGE',{control:'bitrate',auto:isAuto,mbps:isAuto?null:mbps,autoPersisted:isAutoEnabled(),liveAttempted:isAutoEnabled()&&IS_STREAM_DOCUMENT});
  updateUI();
}

function setMouseSmoothnessPreferenceFromUI(enabled) {
  const value=!!enabled;
  lsSet(K.mouseSmoothness,value?'true':'false');
  saveProfilePreferences();
  if (shouldAutoEnableMouseMotionSchedulingFix()) setMouseMotionSchedulingFixEnabled(value,'PRODUCT_UI');
  addEvent('PRODUCT_PREFERENCE_CHANGE',{control:'mouseSmoothness',enabled:value,supported:shouldAutoEnableMouseMotionSchedulingFix()});
  updateUI();
}

// -----------------------------------------------------------------------------
// SUPPORT EXPORT - PLAY-FIRST
// Compact rolling snapshot; one stringify; exporting does not stop gameplay.
// -----------------------------------------------------------------------------
function supportSampleView(s) {
  return {
    t:s.t,phase:s.phase,streamActive:s.streamActive,measurementEligible:s.measurementEligible,measurementIneligibleReason:s.measurementIneligibleReason,
    mode:s.mode,controlState:s.controlState,resolutionRequested:s.resolutionRequested,resolutionProofStatus:s.resolutionProofStatus,
    videoResolution:s.videoResolution,inboundResolution:s.inboundResolution,codec:s.codec,pcState:s.pcState,
    rtcFPS:s.rtcFPS,receivedFPS:s.receivedFPS,decodedFPS:s.decodedFPS,bitrateMbps:s.bitrateMbps,bitrateSource:s.bitrateSource,bitrateConfidence:s.bitrateConfidence,
    rttMs:s.rttMs,networkJitterMs:s.networkJitterMs,packetLossPercent:s.packetLossPercent,availableIncomingMbps:s.availableIncomingMbps,
    framesDroppedDelta:s.framesDroppedDelta,freezeDelta:s.freezeDelta,freezeDurationDeltaMs:s.freezeDurationDeltaMs,decodeTimePerFrameMs:s.decodeTimePerFrameMs,
    controlRequestedFps:s.controlRequestedFps,targetFps:s.targetFps,requestedBitrateMbps:s.targetBitrateMbps,bitrateAuto:s.bitrateAuto,
    suiteLocalWorkMs:s.suiteLocalWorkMs,suiteCycleWallMs:s.suiteCycleWallMs,suiteBridgeStatsWallMs:s.suiteBridgeStatsWallMs,suiteContextWallMs:s.suiteContextWallMs,suiteUiCostMs:s.suiteUiCostMs
  };
}

function buildCoreStatistics(samples) {
  const active=samples.filter(s=>s.measurementEligible!==false&&(s.streamActive||Number.isFinite(s.bitrateMbps)));
  const col=k=>active.map(s=>s[k]).filter(Number.isFinite);
  return {
    sampleCount:samples.length,activeSamples:active.length,
    stream:{rtcFPS:stats(col('rtcFPS')),decodedFPS:stats(col('decodedFPS'))},
    network:{bitrateMbps:stats(col('bitrateMbps')),jitterMs:stats(col('networkJitterMs')),rttMs:stats(col('rttMs')),packetLossPercent:stats(col('packetLossPercent'))},
    decoder:{decodeTimePerFrameMs:stats(col('decodeTimePerFrameMs')),framesDroppedDeltaTotal:active.reduce((a,x)=>a+(Number.isFinite(x.framesDroppedDelta)?x.framesDroppedDelta:0),0),freezeDeltaTotal:active.reduce((a,x)=>a+(Number.isFinite(x.freezeDelta)?x.freezeDelta:0),0)},
    suite:{localWorkMs:stats(col('suiteLocalWorkMs')),cycleWallMs:stats(col('suiteCycleWallMs')),bridgeStatsWallMs:stats(col('suiteBridgeStatsWallMs')),contextWallMs:stats(col('suiteContextWallMs')),uiCostMs:stats(col('suiteUiCostMs'))}
  };
}

function minimalCapabilityView() {
  return {
    webrtc:{rtcPeerConnection:CAP.webrtc.rtcPeerConnection,rtcStatsReport:CAP.webrtc.rtcStatsReport},
    input:{pointerLock:CAP.input.pointerLock,keyboardLock:CAP.input.keyboardLock,touch:CAP.input.touch},
    display:{fullscreen:CAP.display.fullscreen,dynamicRangeHigh:CAP.display.dynamicRangeHigh}
  };
}

function minimalClientContext() {
  const c=S.contextLatest || {};
  return {
    sessionHandler:c.sessionHandler ? {videoCodec:c.sessionHandler.videoCodec??null,av1SupportedStatus:c.sessionHandler.av1SupportedStatus??null,isHDRSupported:c.sessionHandler.isHDRSupported??null,isHDRSupportedByServer:c.sessionHandler.isHDRSupportedByServer??null} : null,
    menu:c.menu ? {fpsMaxRate:c.menu.fpsMaxRate??null,fpsRate:c.menu.fpsRate??null} : null,
    peerConnection:c.peerConnection ? {source:c.peerConnection.source??null,connectionState:c.peerConnection.connectionState??null,iceConnectionState:c.peerConnection.iceConnectionState??null,signalingState:c.peerConnection.signalingState??null} : null,
    storage:c.storage ? {fpsRateValue:c.storage.fpsRateValue??null,bitrateValue:c.storage.bitrateValue??null,bitrateValueForAV1:c.storage.bitrateValueForAV1??null} : null
  };
}

function buildExport() {
  const samples=S.samples.toArray();
  const control=controlSnapshot();
  return {
    controlSuite:{name:'Control Suite - Boosteroid',version:VERSION,build:BUILD,schemaVersion:3,status:'V0.9.0_RC1__PRODUCT_UI_INTEGRATION_CANDIDATE__NOT_CANONICAL'},
    exportedAt:new Date().toISOString(),
    environment:{browser:ENV.browser,engine:ENV.engine,likelyPlatform:ENV.likelyPlatform,deviceClass:ENV.deviceClass,hardwareConcurrency:ENV.hardwareConcurrency,deviceMemory:ENV.deviceMemory,maxTouchPoints:ENV.maxTouchPoints},
    capabilities:minimalCapabilityView(),
    profile:currentPreferenceSnapshot(),
    control:{requested:{resolutionMode:control.preferenceMode,resolution:control.preferenceTarget,fps:control.fpsRequested,bitrateAuto:control.bitrateAuto,bitrateMbps:control.bitrateRequestedMbps},achieved:{inboundResolution:S.lastInboundResolution,rtcFPS:S.latestSample?.rtcFPS??null,decodedFPS:S.latestSample?.decodedFPS??null,bitrateMbps:S.latestSample?.bitrateMbps??null,codec:S.lastCodec},state:control},
    clientContext:minimalClientContext(),
    mouseChordCompatibilityFix:mouseChordFixSnapshot(),
    mouseMotionSchedulingFix:mouseMotionSchedulingFixSnapshot(),
    immersiveGameMode:immersiveSnapshot(),
    coreTelemetry:{sampleIntervalMs:SAMPLE_MS,rollingWindowMaxSamples:MAX_SAMPLES,retainedSamples:S.samples.count,overwrittenSamples:Math.max(0,S.samples.total-S.samples.count),statistics:buildCoreStatistics(samples),samples:samples.map(supportSampleView)},
    performanceGuard:{attemptedSamples:S.sampler.samplesAttempted,retainedSamples:S.samples.count,skippedSamples:S.sampler.skipped,bridgeTimeouts:S.sampler.bridgeTimeouts,bridgeErrors:S.bridgeErrors,last:{cycleWallMs:round(S.sampler.lastCycleWallMs,3),localWorkMs:round(S.sampler.lastLocalWorkMs,3),bridgeStatsWallMs:round(S.sampler.lastBridgeStatsWallMs,3),contextWallMs:round(S.sampler.lastContextWallMs,3),uiCostMs:round(S.sampler.lastUiCostMs,3)}},
    supportEvents:{retained:S.importantEvents.count,overwritten:Math.max(0,S.importantEvents.total-S.importantEvents.count),events:S.importantEvents.toArray()},
    runtimePolicy:{playFirst:true,imageLabRuntime:false,longSessionMonitor:false,inputLabRuntime:false,mouseTransportProofWrappers:false,inputShadowGuardian:false,extraGetStatsCallsPerSample:0}
  };
}

function downloadJSON() {
  addEvent('EXPORT');
  const text=JSON.stringify(buildExport(),null,2);
  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const t=new Date().toISOString().replace(/[:.]/g,'-');
  const lab=String(S.lab||'lab').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const browser=String(ENV.browser||'browser').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const a=document.createElement('a'); a.href=url; a.download=`control-suite-v090-rc1-${lab}-${browser}-${t}.json`; a.style.display='none';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
}

// -----------------------------------------------------------------------------
// UI - v0.9 PRODUCT EXPERIENCE RC1
// Mobile-first settings surface. The user changes a preference once; the BCS
// persists it automatically. The floating launcher and panel are movable.
// -----------------------------------------------------------------------------
function setText(id,value) { const el=$(id); if(!el)return; const v=value==null?'--':String(value); if(el.textContent!==v)el.textContent=v; }
function fmt(v,digits=1,suffix='') { return Number.isFinite(v)?`${v.toFixed(digits)}${suffix}`:'--'; }
function formatRes(r) { return r?.width>0&&r?.height>0?`${r.width}×${r.height}`:'--'; }
function uiNumber(key,fallback=null) {
  const raw=lsGet(key,null);
  if(raw==null||raw==='')return fallback;
  const n=Number(raw);
  return Number.isFinite(n)?n:fallback;
}

function setPanel(open) {
  S.ui.open=!!open; lsSet(K.panelOpen,open?'true':'false');
  const panel=$('bcs-panel'),button=$('bcs-open');
  if(panel)panel.style.display=open?'flex':'none';
  if(button)button.classList.toggle('bcs-open-active',!!open);
  if(open)updateUI();
}

function setSwitchState(id,on,disabled=false) {
  const b=$(id); if(!b)return;
  b.classList.toggle('on',!!on); b.setAttribute('aria-pressed',on?'true':'false'); b.disabled=!!disabled;
}

function setProductUiPositions() {
  const panel=$('bcs-panel'),button=$('bcs-open');
  if(panel){
    const x=uiNumber(K.uiPanelX,null), y=uiNumber(K.uiPanelY,null);
    if(Number.isFinite(x)&&Number.isFinite(y)){panel.style.left=`${x}px`;panel.style.top=`${y}px`;panel.style.right='auto';}
  }
  if(button){
    const x=uiNumber(K.uiFabX,null), y=uiNumber(K.uiFabY,null);
    if(Number.isFinite(x)&&Number.isFinite(y)){button.style.left=`${x}px`;button.style.top=`${y}px`;button.style.right='auto';button.style.bottom='auto';}
  }
}

function bindMovableElement(handle,target,xKey,yKey,{allowButtonHandle=false,suppressClickTarget=null}={}) {
  let active=false,moved=false,sx=0,sy=0,ox=0,oy=0;
  handle.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    if(!allowButtonHandle && e.target?.closest?.('button,input,select,textarea,a,[role="button"]'))return;
    const r=target.getBoundingClientRect(); active=true;moved=false;sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;
    try{handle.setPointerCapture(e.pointerId);}catch{}
  });
  handle.addEventListener('pointermove',e=>{
    if(!active)return;
    const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)>4)moved=true;
    if(!moved)return;
    const w=target.offsetWidth||50,h=target.offsetHeight||50;
    const x=clamp(ox+dx,4,Math.max(4,innerWidth-w-4)),y=clamp(oy+dy,4,Math.max(4,innerHeight-h-4));
    target.style.left=`${Math.round(x)}px`;target.style.top=`${Math.round(y)}px`;target.style.right='auto';target.style.bottom='auto';
    lsSet(xKey,Math.round(x));lsSet(yKey,Math.round(y));
  });
  const end=e=>{
    if(!active)return;active=false;
    if(moved&&suppressClickTarget){suppressClickTarget.dataset.suppressClick='1';setTimeout(()=>{if(suppressClickTarget)suppressClickTarget.dataset.suppressClick='0';},260);}
    try{handle.releasePointerCapture(e.pointerId);}catch{}
  };
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}

function keepProductUiOnScreen() {
  const button=$('bcs-open'),panel=$('bcs-panel');
  if(button){
    const r=button.getBoundingClientRect();
    if(r.right<8||r.bottom<8||r.left>innerWidth-8||r.top>innerHeight-8){
      lsRemove(K.uiFabX);lsRemove(K.uiFabY);button.style.left='auto';button.style.top='auto';button.style.right='12px';button.style.bottom='18px';
    }
  }
  if(panel&&S.ui.open){
    const r=panel.getBoundingClientRect();
    const x=clamp(r.left,4,Math.max(4,innerWidth-Math.min(panel.offsetWidth||340,innerWidth-8)-4));
    const y=clamp(r.top,4,Math.max(4,innerHeight-Math.min(panel.offsetHeight||420,innerHeight-8)-4));
    panel.style.left=`${Math.round(x)}px`;panel.style.top=`${Math.round(y)}px`;panel.style.right='auto';
    lsSet(K.uiPanelX,Math.round(x));lsSet(K.uiPanelY,Math.round(y));
  }
}

function updateUI(sample=null) {
  if(!S.ui.built)return;
  const s=sample||S.latestSample||{};
  const profileEnabled=isAutoEnabled();
  const smoothSupported=shouldAutoEnableMouseMotionSchedulingFix();
  setSwitchState('bcs-profile-toggle',profileEnabled,false);
  setSwitchState('bcs-smooth-toggle',mouseSmoothnessPreference(),!smoothSupported);
  const stream=$('bcs-stream-settings');if(stream)stream.style.display=profileEnabled?'block':'none';
  const safe=$('bcs-safe-message');if(safe)safe.style.display=profileEnabled?'none':'block';
  setText('bcs-profile-chip',profileEnabled?'ATIVO':'SAFE');
  setText('bcs-smooth-desc',smoothSupported?'Melhora a fluidez do movimento do mouse.':'Não disponível neste navegador.');
  setText('bcs-codec',(s.codec||'--').replace('video/',''));
  setText('bcs-fps-real',fmt(s.decodedFPS??s.rtcFPS,1));
  setText('bcs-br-real',fmt(s.bitrateMbps,2,' Mbps'));
  setText('bcs-rtt',fmt(s.rttMs,0,' ms'));
  setText('bcs-res-real',formatRes(s.inboundResolution||S.lastInboundResolution));

  const fpsSelect=$('bcs-fps-mode');const fps=Number(lsGet(K.fps,'120'))===60?60:120;if(fpsSelect&&fpsSelect.value!==String(fps))fpsSelect.value=String(fps);
  const brAuto=lsGet(K.bitrateAuto,'true')!=='false';const brMode=$('bcs-bitrate-mode');if(brMode&&brMode.value!==(brAuto?'auto':'manual'))brMode.value=brAuto?'auto':'manual';
  const brValue=clamp(Number(lsGet(K.bitrateManual,'40'))||40,5,80);const brRange=$('bcs-bitrate-range');if(brRange&&brRange.value!==String(brValue))brRange.value=String(brValue);setText('bcs-bitrate-value',`${brValue} Mbps`);
  const brRow=$('bcs-bitrate-row');if(brRow)brRow.style.display=brAuto?'none':'grid';
  const resMode=$('bcs-res-mode');if(resMode&&resMode.value!==lsGet(K.resolutionMode,'native'))resMode.value=lsGet(K.resolutionMode,'native');
  const custom=$('bcs-custom-row');if(custom)custom.style.display=lsGet(K.resolutionMode,'native')==='custom'?'grid':'none';
  const rw=$('bcs-res-w'),rh=$('bcs-res-h');if(rw)rw.value=lsGet(K.resolutionW,'1920');if(rh)rh.value=lsGet(K.resolutionH,'1080');

  const imm=$('bcs-immersive-toggle');if(imm){imm.disabled=S.immersive.entering||S.immersive.exiting||!IS_STREAM_DOCUMENT;imm.textContent=S.immersive.active?'SAIR DO IMERSIVO':'ATIVAR IMERSIVO';}
  const retry=$('bcs-immersive-retry');if(retry)retry.style.display=S.immersive.active?'block':'none';
  const session=$('bcs-session-card');if(session)session.style.display=IS_STREAM_DOCUMENT?'block':'none';
}

function createUI() {
  if($('bcs-panel'))return;
  const style=document.createElement('style');style.id='bcs-style';style.textContent=`
#bcs-ui-root,#bcs-ui-root *{box-sizing:border-box}
#bcs-open,#bcs-panel{position:fixed;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f7f8}
#bcs-open{right:12px;bottom:18px;width:52px;height:52px;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(14,14,18,.84);color:#fff;font-size:12px;font-weight:900;opacity:.22;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 24px rgba(0,0,0,.36);touch-action:none;user-select:none;transition:opacity .16s ease,transform .16s ease}
#bcs-open:hover,#bcs-open:focus,#bcs-open.bcs-open-active{opacity:.96;transform:scale(1.02)}
#bcs-panel{right:10px;top:max(68px,env(safe-area-inset-top));width:min(365px,calc(100vw - 18px));max-height:min(82dvh,720px);display:none;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,rgba(23,23,28,.97),rgba(12,12,15,.97));border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 14px 48px rgba(0,0,0,.44);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-size:11px;line-height:1.35}
.bcs-head{padding:12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.08);cursor:move;touch-action:none}.bcs-head-main{min-width:0;flex:1}.bcs-title{font-size:15px;font-weight:900}.bcs-sub{font-size:10px;opacity:.55;margin-top:2px}.bcs-chip{display:inline-flex;align-items:center;padding:4px 7px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.08);font-size:10px;font-weight:800}.bcs-x{width:30px;height:30px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:16px;font-weight:800}.bcs-body{padding:12px;overflow:auto}.bcs-section{margin:2px 0 8px}.bcs-section-title{font-size:13px;font-weight:900}.bcs-section-sub{font-size:10px;opacity:.54;margin-top:2px}.bcs-card{padding:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.04)}.bcs-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.bcs-card-main{min-width:0;flex:1}.bcs-label{font-size:13px;font-weight:900}.bcs-desc{font-size:10px;line-height:1.35;opacity:.58;margin-top:3px}.bcs-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:850;white-space:nowrap}.bcs-live{color:#c4f2cf;background:rgba(86,194,120,.14);border:1px solid rgba(86,194,120,.40)}.bcs-session{color:#c9ddff;background:rgba(92,160,255,.14);border:1px solid rgba(92,160,255,.40)}.bcs-switch{position:relative;width:46px;min-width:46px;height:28px;padding:0;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.16)}.bcs-switch span{position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);transition:transform .16s ease}.bcs-switch.on{background:rgba(42,181,83,.88)}.bcs-switch.on span{transform:translateX(18px)}.bcs-switch:disabled{opacity:.38}.bcs-control{margin-top:8px}.bcs-select,.bcs-input,.bcs-btn{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(18,18,22,.96);color:#fff;padding:10px 11px;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.bcs-btn{background:rgba(255,255,255,.08);font-weight:800}.bcs-btn:disabled{opacity:.38}.bcs-custom{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-top:8px}.bcs-bitrate-slider{display:grid;grid-template-columns:1fr 72px;gap:10px;align-items:center;margin-top:9px}.bcs-bitrate-slider input{width:100%}.bcs-bitrate-slider b{text-align:right}.bcs-safe-message{padding:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.04)}.bcs-readout{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bcs-readout-item{padding:9px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.035)}.bcs-readout-k{font-size:9px;opacity:.52}.bcs-readout-v{font-size:12px;font-weight:850;margin-top:3px}.bcs-footer{padding:9px 12px 11px;border-top:1px solid rgba(255,255,255,.08);font-size:9px;opacity:.52}
html.bcs-immersive-active,html.bcs-immersive-active body{overflow:hidden!important}html.bcs-immersive-active #bcs-open,html.bcs-immersive-active #bcs-panel{display:none!important}
#bcs-immersive-overlay{position:fixed;z-index:2147483647;right:max(8px,env(safe-area-inset-right));top:max(8px,env(safe-area-inset-top));display:flex;gap:6px;align-items:center;padding:5px 6px;border-radius:9px;background:rgba(8,8,10,.44);border:1px solid rgba(255,255,255,.16);font:9px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;opacity:.38}#bcs-immersive-overlay button{border:1px solid rgba(255,255,255,.22);border-radius:7px;background:rgba(28,28,32,.82);color:#fff;padding:5px 7px;font:800 9px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}`;
  (document.head||document.documentElement).appendChild(style);

  const root=document.createElement('div');root.id='bcs-ui-root';
  const open=document.createElement('button');open.id='bcs-open';open.type='button';open.textContent='BCS';open.setAttribute('aria-label','Abrir BCS');
  const panel=document.createElement('div');panel.id='bcs-panel';panel.innerHTML=`
<div class="bcs-head" id="bcs-drag-head"><div class="bcs-head-main"><div class="bcs-title">BOOSTEROID CONTROL</div><div class="bcs-sub">v${VERSION} • configure uma vez e jogue</div></div><span id="bcs-profile-chip" class="bcs-chip">--</span><button id="bcs-close" class="bcs-x" type="button">×</button></div>
<div class="bcs-body">
  <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Controle de Stream</div><div class="bcs-desc">Liga o perfil de resolução, FPS e bitrate. Desligado = SAFE.</div></div><div><span class="bcs-badge bcs-session">PERFIL</span><div style="height:6px"></div><button id="bcs-profile-toggle" class="bcs-switch" type="button"><span></span></button></div></div></div>
  <div id="bcs-safe-message" class="bcs-safe-message"><div class="bcs-label">SAFE</div><div class="bcs-desc">O perfil de stream está desligado. Suas escolhas continuam salvas.</div></div>
  <div id="bcs-stream-settings">
    <div class="bcs-section"><div class="bcs-section-title">Stream</div><div class="bcs-section-sub">Mude uma vez. O perfil fica salvo automaticamente.</div></div>
    <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Resolução</div><div class="bcs-desc">Define a resolução usada pelo perfil salvo.</div></div><span class="bcs-badge bcs-session">SESSÃO</span></div><div class="bcs-control"><select id="bcs-res-mode" class="bcs-select"><option value="native">NATIVO</option><option value="1920x1080">1920×1080</option><option value="2400x1080">2400×1080</option><option value="2532x1170">2532×1170</option><option value="2560x1080">2560×1080</option><option value="custom">CUSTOM</option></select><div id="bcs-custom-row" class="bcs-custom"><input id="bcs-res-w" class="bcs-input" inputmode="numeric"><span>×</span><input id="bcs-res-h" class="bcs-input" inputmode="numeric"></div></div></div>
    <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">FPS</div><div class="bcs-desc">Define a taxa de quadros: 60 ou 120 FPS.</div></div><span class="bcs-badge bcs-live">AO VIVO</span></div><div class="bcs-control"><select id="bcs-fps-mode" class="bcs-select"><option value="60">60</option><option value="120">120</option></select></div></div>
    <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Bitrate</div><div class="bcs-desc">Use AUTO ou ajuste manualmente entre 5 e 80 Mbps.</div></div><span class="bcs-badge bcs-live">AO VIVO</span></div><div class="bcs-control"><select id="bcs-bitrate-mode" class="bcs-select"><option value="auto">AUTO</option><option value="manual">MANUAL</option></select><div id="bcs-bitrate-row" class="bcs-bitrate-slider"><input id="bcs-bitrate-range" type="range" min="5" max="80" step="1"><b id="bcs-bitrate-value">--</b></div></div></div>
  </div>
  <div class="bcs-section"><div class="bcs-section-title">Jogo</div><div class="bcs-section-sub">Controles usados durante a jogatina.</div></div>
  <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Mouse Smoothness</div><div id="bcs-smooth-desc" class="bcs-desc">Melhora a fluidez do movimento do mouse.</div></div><div><span class="bcs-badge bcs-live">AO VIVO</span><div style="height:6px"></div><button id="bcs-smooth-toggle" class="bcs-switch" type="button"><span></span></button></div></div></div>
  <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Immersive</div><div class="bcs-desc">Abre o jogo em tela cheia.</div></div><span class="bcs-badge bcs-live">AO VIVO</span></div><div class="bcs-control"><button id="bcs-immersive-toggle" class="bcs-btn" type="button">ATIVAR IMERSIVO</button><button id="bcs-immersive-retry" class="bcs-btn" type="button" style="display:none;margin-top:7px">RECAPTURAR</button></div></div>
  <div class="bcs-card" id="bcs-session-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Sessão</div><div class="bcs-desc">Leitura rápida do stream atual.</div></div></div><div class="bcs-control bcs-readout"><div class="bcs-readout-item"><div class="bcs-readout-k">Resolução real</div><div id="bcs-res-real" class="bcs-readout-v">--</div></div><div class="bcs-readout-item"><div class="bcs-readout-k">FPS real</div><div id="bcs-fps-real" class="bcs-readout-v">--</div></div><div class="bcs-readout-item"><div class="bcs-readout-k">Bitrate</div><div id="bcs-br-real" class="bcs-readout-v">--</div></div><div class="bcs-readout-item"><div class="bcs-readout-k">Codec</div><div id="bcs-codec" class="bcs-readout-v">--</div></div><div class="bcs-readout-item"><div class="bcs-readout-k">RTT</div><div id="bcs-rtt" class="bcs-readout-v">--</div></div></div></div>
  <div class="bcs-section"><div class="bcs-section-title">Suporte</div></div>
  <div class="bcs-card"><div class="bcs-card-top"><div class="bcs-card-main"><div class="bcs-label">Log</div><div class="bcs-desc">Baixa o relatório JSON da sessão.</div></div></div><div class="bcs-control"><button id="bcs-download" class="bcs-btn" type="button">BAIXAR LOG</button></div></div>
</div><div class="bcs-footer">As alterações do perfil são salvas automaticamente.</div>`;

  root.append(open,panel);(document.documentElement||document.body).appendChild(root);
  setProductUiPositions();
  bindMovableElement($('bcs-drag-head'),panel,K.uiPanelX,K.uiPanelY);
  bindMovableElement(open,open,K.uiFabX,K.uiFabY,{allowButtonHandle:true,suppressClickTarget:open});
  window.addEventListener('resize',keepProductUiOnScreen,{passive:true});

  open.addEventListener('pointerdown',()=>open.classList.add('bcs-open-active'));
  open.addEventListener('pointerup',()=>{if(!S.ui.open)setTimeout(()=>{if(!S.ui.open)open.classList.remove('bcs-open-active');},220);});
  open.addEventListener('pointercancel',()=>{if(!S.ui.open)open.classList.remove('bcs-open-active');});
  open.addEventListener('click',()=>{if(open.dataset.suppressClick==='1')return;setPanel(!S.ui.open);});
  $('bcs-close').addEventListener('pointerdown',e=>e.stopPropagation());
  $('bcs-close').addEventListener('click',e=>{e.stopPropagation();setPanel(false);});

  $('bcs-profile-toggle').addEventListener('click',async()=>{if(isAutoEnabled())await disarmResolutionControl();else await enableStreamProfileFromUI();updateUI();});
  $('bcs-res-mode').addEventListener('change',e=>{void saveResolutionPreferenceFromUI(e.target.value);});
  const saveCustom=()=>{void saveCustomResolutionFromUI($('bcs-res-w').value,$('bcs-res-h').value);};
  $('bcs-res-w').addEventListener('change',saveCustom);$('bcs-res-h').addEventListener('change',saveCustom);
  $('bcs-fps-mode').addEventListener('change',e=>{void saveFpsPreferenceFromUI(e.target.value);});
  $('bcs-bitrate-mode').addEventListener('change',e=>{void saveBitratePreferenceFromUI(e.target.value==='auto',$('bcs-bitrate-range').value);});
  $('bcs-bitrate-range').addEventListener('input',e=>{const mb=clamp(Math.round(Number(e.target.value)||40),5,80);lsSet(K.bitrateManual,mb);setText('bcs-bitrate-value',`${mb} Mbps`);});
  $('bcs-bitrate-range').addEventListener('change',e=>{void saveBitratePreferenceFromUI(false,e.target.value);});
  $('bcs-smooth-toggle').addEventListener('click',()=>{if(!shouldAutoEnableMouseMotionSchedulingFix())return;setMouseSmoothnessPreferenceFromUI(!mouseSmoothnessPreference());});
  $('bcs-immersive-toggle').addEventListener('click',async()=>{if(S.immersive.active||S.immersive.entering)await exitImmersiveMode('USER_UI');else await enterImmersiveMode('USER_UI');updateUI();});
  $('bcs-immersive-retry').addEventListener('click',()=>reacquireImmersiveLocks('PANEL_USER_GESTURE'));
  $('bcs-download').addEventListener('click',downloadJSON);

  S.ui.built=true;setPanel(lsGet(K.panelOpen,'false')==='true');updateUI();keepProductUiOnScreen();
}

function waitForBody() {
  if(document.body){createUI();bindGlobalSurfaceEvents();videoScanner();return;}
  setTimeout(waitForBody,50);
}

function boot() {
  installMouseMotionSchedulingFixPage();
  if (shouldAutoEnableMouseMotionSchedulingFix() && mouseSmoothnessPreference()) setMouseMotionSchedulingFixEnabled(true,'AUTO_INTEGRATED_LAB_B');
  installMouseChordFixPage();
  if (shouldAutoEnableMouseChordFix()) setMouseChordFixEnabled(true,'AUTO_INTEGRATED_LAB_B');
  installPageBridge();
  addEvent('SUITE_BOOT',{
    version:VERSION,build:BUILD,
    architecture:'PLAY_FIRST__RC19_GAMEPLAY_FOUNDATION__PRODUCT_UI_NATIVE_STYLE__AUTO_PERSIST_PROFILE__LEAN_CORE_1HZ__IMMERSIVE_V2__H014C__H014D',
    controlModel:'PERSISTENT_AUTO_APPLY',profileEnabled:isAutoEnabled(),bootBehavior:isAutoEnabled()?'AUTO_APPLY_ENABLED':'SAFE',
    environment:{browser:ENV.browser,likelyPlatform:ENV.likelyPlatform},
    runtimePruning:{inputLab:false,mouseTransportProof:false,longSessionMonitor:false,imageLab:false,surfaceImageLab:false,inputShadowGuardian:false},
    mouseChordCompatibilityFix:{autoIntegrated:shouldAutoEnableMouseChordFix(),mode:'H014C_MINIMAL_GUARD_FIX',transportObservation:false},
    mouseMotionSchedulingFix:{autoIntegrated:shouldAutoEnableMouseMotionSchedulingFix(),preferenceEnabled:mouseSmoothnessPreference(),mode:'H014D_NATIVE_RAF_SCHEDULING_FIX',nativeSenderPreserved:true},
    immersiveGameMode:{nativeFirst:true,fullscreen:CAP.display.fullscreen,keyboardLock:CAP.input.keyboardLock,pointerLock:CAP.input.pointerLock,pointerLockStrategy:'BOOSTEROID_CURSOR_MODE_MANAGER',exitChord:IMMERSIVE_EXIT_CHORD_LABEL}
  });
  if (isAutoEnabled()) addEvent('AUTO_PROFILE_BOOT',{resolutionMode:lsGet(K.resolutionMode,'native'),resolutionTarget:resolutionTarget(),fps:Number(lsGet(K.fps,'120'))===60?60:120,bitrateAuto:lsGet(K.bitrateAuto,'true')!=='false',bitrateMbps:lsGet(K.bitrateAuto,'true')!=='false'?null:(Number(lsGet(K.bitrateManual,'0'))||null),streamDocument:IS_STREAM_DOCUMENT});
  waitForBody(); startSampler(); setTimeout(()=>refreshContext(true),1200); debug(`Control Suite v${VERSION} ready`);
}
boot();

})();
