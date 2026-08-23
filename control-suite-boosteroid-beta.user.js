// ==UserScript==
// @name         Control Suite - Boosteroid
// @namespace    whoami.boosteroid.control-suite
// @version      0.8.1-rc6
// @description  Input Compatibility Probe: on-demand keyboard/mouse/fullscreen evidence plus reversible Keyboard Lock test; no mouse/keyboard transport override.
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

const VERSION = '0.8.1-rc6';
const BUILD = 'Input Compatibility Probe + Telemetry Integrity - RC6';
const SAMPLE_MS = 1000;
const CONTEXT_MS = 5000;
const STARTUP_STABLE_SAMPLES = 5;
const COMPOSITOR_REGIME_CONFIRM_SAMPLES = 3;
const RESOLUTION_PROOF_CONFIRM_SAMPLES = 3;
const RESOLUTION_PROOF_TIMEOUT_SEC = 8;
const MAX_SAMPLES = 3600;
const MAX_EVENTS = 2400;
const MAX_IMPORTANT_EVENTS = 640;
const MAX_INPUT_PROBE_EVENTS = 512;
const INPUT_PROBE_AUTO_STOP_MS = 2 * 60 * 1000;
const LONG_SESSION_CHECKPOINT_MS = 60 * 1000;
const LONG_SESSION_MEMORY_MS = 5 * 60 * 1000;
const LONG_SESSION_STORAGE_MS = 5 * 60 * 1000;
const MAX_LONG_SESSION_CHECKPOINTS = 720; // 12h at 1 checkpoint/minute
const LONG_SESSION_DB_NAME = 'bcs_long_session_v1';
const LONG_SESSION_DB_VERSION = 1;
const LONG_SESSION_SESSION_STORE = 'sessions';
const LONG_SESSION_CHECKPOINT_STORE = 'checkpoints';
const LONG_SESSION_ACTIVE_KEY = 'bcs.longSession.activeSessionId';
const LONG_SESSION_RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;
const LONG_SESSION_MAX_PERSISTED_SESSIONS = 4;
const FRAME_BIN_MS = 0.5;
const FRAME_HIST_MAX_MS = 100;
const FRAME_HIST_BINS = Math.ceil(FRAME_HIST_MAX_MS / FRAME_BIN_MS) + 1;
const DEEP_WORK_BIN_MS = 0.05;
const DEEP_WORK_MAX_MS = 5;
const DEEP_WORK_BINS = Math.ceil(DEEP_WORK_MAX_MS / DEEP_WORK_BIN_MS) + 1;
const BRIDGE_REQ = '__BCS_V06_REQ__';
const BRIDGE_RES = '__BCS_V06_RES__';
const DEBUG = false;

const K = {
  lab: 'bcs.lab',
  network: 'bcs.network',
  panelOpen: 'bcs.panelOpen',
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
    bitrateMbps
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
  'STREAM_ANOMALY','FREEZE_CHANGE','CODEC_CHANGE','INBOUND_RESOLUTION_CHANGE',
  'PEER_CONNECTION_STATE','BITRATE_SOURCE_CHANGE','COMPOSITOR_REGIME_CHANGE',
  'SURFACE_CHANGE','VIEWPORT_CHANGE','ORIENTATION_CHANGE','PHASE_CHANGE',
  'RESOLUTION_PROOF_STATUS','EXPERIMENT_CONFOUND','MEASUREMENT_REANCHOR',
  'VISIBILITY_CHANGE','SAMPLER_ERROR','BRIDGE_INSTALL_ERROR',
  'LONG_SESSION_CHECKPOINT_ERROR','LONG_SESSION_PERSISTENCE_ERROR','LONG_SESSION_PERSISTENCE_PRUNE_ERROR',
  'LONG_SESSION_PERSISTENCE_RECOVERED','LONG_SESSION_PERSISTENCE_UNAVAILABLE',
  'INPUT_PROBE_START','INPUT_PROBE_STOP','INPUT_KEYBOARD_LOCK_CHANGE','INPUT_KEYBOARD_LOCK_ERROR'
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
  const mq = q => { try { return matchMedia(q).matches; } catch { return null; } };
  let webgl2 = false;
  try { webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch {}
  let rtcVideoCodecs = [];
  try {
    rtcVideoCodecs = (RTCRtpReceiver?.getCapabilities?.('video')?.codecs || []).map(c => ({
      mimeType: c.mimeType || null,
      clockRate: c.clockRate || null,
      sdpFmtpLine: c.sdpFmtpLine || ''
    }));
  } catch {}

  return {
    video: {
      htmlVideoElement: typeof HTMLVideoElement !== 'undefined',
      requestVideoFrameCallback: typeof HTMLVideoElement !== 'undefined' &&
        typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function',
      getVideoPlaybackQuality: typeof HTMLVideoElement !== 'undefined' &&
        typeof HTMLVideoElement.prototype.getVideoPlaybackQuality === 'function',
      mediaCapabilities: !!navigator.mediaCapabilities?.decodingInfo,
      webCodecs: typeof VideoDecoder !== 'undefined'
    },
    webrtc: {
      rtcPeerConnection: typeof RTCPeerConnection !== 'undefined',
      rtcStatsReport: typeof RTCStatsReport !== 'undefined',
      setCodecPreferences: typeof RTCRtpTransceiver !== 'undefined' &&
        'setCodecPreferences' in RTCRtpTransceiver.prototype,
      jitterBufferTarget: typeof RTCRtpReceiver !== 'undefined' &&
        'jitterBufferTarget' in RTCRtpReceiver.prototype,
      playoutDelayHint: typeof RTCRtpReceiver !== 'undefined' &&
        'playoutDelayHint' in RTCRtpReceiver.prototype,
      videoCodecs: rtcVideoCodecs
    },
    input: {
      gamepad: typeof navigator.getGamepads === 'function',
      vibration: typeof navigator.vibrate === 'function',
      pointer: typeof PointerEvent !== 'undefined',
      pointerLock: 'pointerLockElement' in document,
      keyboard: true,
      keyboardLock: !!navigator.keyboard && typeof navigator.keyboard.lock === 'function' && typeof navigator.keyboard.unlock === 'function',
      touch: navigator.maxTouchPoints > 0 || 'ontouchstart' in window
    },
    display: {
      fullscreen: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
      p3: mq('(color-gamut: p3)'),
      rec2020: mq('(color-gamut: rec2020)'),
      dynamicRangeHigh: mq('(dynamic-range: high)'),
      videoDynamicRangeHigh: mq('(video-dynamic-range: high)'),
      visualViewport: typeof visualViewport !== 'undefined'
    },
    experimental: {
      webGPU: !!navigator.gpu,
      webGL2: webgl2,
      performanceObserver: typeof PerformanceObserver !== 'undefined',
      longTask: typeof PerformanceObserver !== 'undefined' &&
        Array.isArray(PerformanceObserver.supportedEntryTypes) &&
        PerformanceObserver.supportedEntryTypes.includes('longtask'),
      memory: !!performance.memory,
      measureUserAgentSpecificMemory: typeof performance.measureUserAgentSpecificMemory === 'function',
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      storageEstimate: typeof navigator.storage?.estimate === 'function',
      computePressure: typeof globalThis.PressureObserver === 'function'
    }
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
  bootPerf: now(),
  bootDate: new Date(),
  recording: true,
  sessionStartPerf: now(),
  sessionStartDate: new Date(),
  samples: new Ring(MAX_SAMPLES),
  events: new Ring(MAX_EVENTS),
  importantEvents: new Ring(MAX_IMPORTANT_EVENTS),
  inputProbe: {
    enabled: false,
    bound: false,
    startedAtSec: null,
    stoppedAtSec: null,
    events: new Ring(MAX_INPUT_PROBE_EVENTS),
    lastEvent: null,
    handlers: null,
    autoStopTimer: null,
    keyDownCodes: Object.create(null),
    counters: {
      keydown:0,keyup:0,pointerdown:0,pointerup:0,mousedown:0,mouseup:0,contextmenu:0,
      mouseDownWhileOtherHeld:0,multiButtonStateEvents:0,fullscreenchange:0,pointerlockchange:0,
      visibilitychange:0,windowBlur:0,windowFocus:0
    },
    keyboardLock: {
      supported: !!navigator.keyboard && typeof navigator.keyboard.lock === 'function' && typeof navigator.keyboard.unlock === 'function',
      active: false,
      requestedCodes: [],
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      lastError: null,
      lastChangeAtSec: null
    }
  },
  latestSample: null,
  longSession: {
    checkpoints: new Ring(MAX_LONG_SESSION_CHECKPOINTS),
    timer: null,
    running: false,
    lastMemoryProbeAtMs: -Infinity,
    lastStorageProbeAtMs: -Infinity,
    memoryProbeInFlight: false,
    latestMemory: null,
    latestStorage: null,
    longTaskObserver: null,
    longTasks: { count:0, totalMs:0, maxMs:0, lastAtSec:null, prevCount:0, prevTotalMs:0 },
    pressureObserver: null,
    pressure: { supported: typeof globalThis.PressureObserver === 'function', state:null, lastAtSec:null, transitions:0, error:null },
    videoBindCount: 0,
    videoRemovedCount: 0,
    surfaceObserverBindCount: 0,
    checkpointErrors: 0,
    persistence: {
      supported: typeof indexedDB !== 'undefined',
      eligible: IS_STREAM_DOCUMENT,
      mode: 'UNINITIALIZED',
      db: null,
      ready: false,
      initInFlight: null,
      sessionId: null,
      pageInstanceId: null,
      startedAtMs: null,
      resumed: false,
      recoveredCheckpointCount: 0,
      persistedCheckpointCount: 0,
      nextSeq: 0,
      lastPersistAtMs: null,
      lastPersistReason: null,
      writeErrors: 0,
      readErrors: 0,
      pruneErrors: 0,
      lifecycleBound: false
    }
  },
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
  firstFrameAt: null,
  lastFrameAt: null,
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
  surface: {
    resizeObserver: null,
    globalBound: false,
    pending: false,
    pendingTimer: null,
    pendingReason: null,
    renderedKey: '',
    rendered: null,
    viewportKey: '',
    viewport: null,
    orientation: null,
    styleKey: '',
    objectFit: null,
    objectPosition: null
  },
  frame: {
    lastNow: 0,
    lastPresentedFrames: null,
    lastCallbackPresentedFrames: null,
    prevSamplePresentedFrames: null,
    prevSampleCallbacks: 0,
    prevSampleTime: null,
    callbacks: 0,
    intervalCount: 0,
    intervalSum: 0,
    intervalSumSq: 0,
    intervalMin: Infinity,
    intervalMax: 0,
    processingCount: 0,
    processingSumMs: 0,
    latenessCount: 0,
    latenessSumMs: 0,
    multiFrameCallbacks: 0,
    histogram: new Uint32Array(FRAME_HIST_BINS),
    histCount: 0,
    histSum: 0,
    histSumSq: 0,
    histMin: Infinity,
    histMax: 0,
    regime: null,
    regimeCandidate: null,
    regimeCandidateCount: 0
  },
  deep: {
    enabled: false,
    token: 0,
    callbackScheduled: false,
    enableCount: 0,
    disableCount: 0,
    enabledAtSec: null,
    lastDisabledAtSec: null,
    totalEnabledMs: 0,
    callbacksProcessed: 0,
    callbacksDiscarded: 0,
    callbackWorkCount: 0,
    callbackWorkTotalMs: 0,
    callbackWorkMaxMs: 0,
    callbackWorkHistogram: new Uint32Array(DEEP_WORK_BINS),
    prevSampleCallbacksProcessed: 0,
    prevSampleWorkTotalMs: 0
  },
  rtcPrev: null,
  playbackPrev: null,
  rtcLatest: null,
  rtcSource: null,
  contextLatest: null,
  contextFingerprint: '',
  contextRawFingerprint: '',
  contextTelemetry: { changes:0, suppressedFrameRateOnly:0, frameRateSamples:0, implausibleFrameRateSamples:0, lastObservedFrameRate:null },
  lastContextAt: 0,
  lastCodec: null,
  lastInboundResolution: null,
  lastPcState: null,
  lastBitrateSource: null,
  lastAnomalySignature: '',
  lastAnomalyAt: -Infinity,
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
    confoundSignature: ''
  },
  experimentManager: {
    seq: 0,
    currentPhaseId: 'E0',
    phases: [PENDING_RESOLUTION_ONE_SHOT ? { id:'E0', label:`RES_${PENDING_RESOLUTION_ONE_SHOT.target.width}x${PENDING_RESOLUTION_ONE_SHOT.target.height}_AUTO`, kind:'VIRTUAL_MONITOR', startAtSec:0, endAtSec:null, requestedResolution:PENDING_RESOLUTION_ONE_SHOT.target, application:{source:'PERSISTENT_AUTO_PROFILE'}, proofFinal:null } : { id: 'E0', label: 'BASELINE', kind: 'BASELINE', startAtSec: 0, endAtSec: null, requestedResolution: null, application: null, proofFinal: null }]
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
  exportPerf: {
    analysisBuildWallMs: null,
    firstStringifyWallMs: null,
    finalStringifyWallMs: null,
    jsonBytes: null
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
  if (!S.recording && !['RECORDING_START', 'EXPORT'].includes(type)) return;
  const event={
    t: round(elapsed(), 3),
    type,
    ...data
  };
  S.events.push(event);
  if (IMPORTANT_EVENT_TYPES.has(type)) S.importantEvents.push(event);
}


// -----------------------------------------------------------------------------
// INPUT COMPATIBILITY PROBE - ON DEMAND, OBSERVATIONAL BY DEFAULT
// Captures DOM evidence for reserved keyboard keys, fullscreen/focus transitions
// and simultaneous mouse-button behavior. It does not synthesize remote input.
// Keyboard Lock is a separate reversible user-triggered experiment.
// -----------------------------------------------------------------------------
function fullscreenElementCompat() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function inputProbeTargetView(target) {
  if (!target || typeof target !== 'object') return null;
  let tag=null, isBcsUi=false;
  try {
    tag=target.tagName || target.nodeName || null;
    isBcsUi=!!target.closest?.('#bcs-panel,#bcs-open');
  } catch {}
  return { tag, isBcsUi };
}

function pushInputProbeEvent(type, data = {}, force = false) {
  const P=S.inputProbe;
  if (!force && !P.enabled) return null;
  const event={
    t:round(elapsed(),3),
    wallAt:new Date().toISOString(),
    type,
    fullscreen:!!fullscreenElementCompat(),
    pointerLocked:!!document.pointerLockElement,
    visibilityState:document.visibilityState || null,
    documentHasFocus:typeof document.hasFocus === 'function' ? document.hasFocus() : null,
    ...data
  };
  P.events.push(event);
  P.lastEvent=event;
  return event;
}

function inputKeyboardEventView(e) {
  return {
    code:e.code || null,
    key:e.key && e.key.length > 1 ? e.key : null,
    repeat:!!e.repeat,
    location:Number.isFinite(e.location) ? e.location : null,
    altKey:!!e.altKey,
    ctrlKey:!!e.ctrlKey,
    shiftKey:!!e.shiftKey,
    metaKey:!!e.metaKey,
    isTrusted:e.isTrusted === true,
    defaultPreventedAtCapture:!!e.defaultPrevented,
    defaultPreventedAfterDispatch:null,
    target:inputProbeTargetView(e.target)
  };
}

function inputPointerEventView(e) {
  const buttons=Number.isFinite(e.buttons) ? e.buttons : null;
  return {
    button:Number.isFinite(e.button) ? e.button : null,
    buttons,
    multiButtonState:Number.isFinite(buttons) ? (buttons !== 0 && (buttons & (buttons - 1)) !== 0) : null,
    pointerType:e.pointerType || null,
    pointerId:Number.isFinite(e.pointerId) ? e.pointerId : null,
    isPrimary:typeof e.isPrimary === 'boolean' ? e.isPrimary : null,
    isTrusted:e.isTrusted === true,
    defaultPreventedAtCapture:!!e.defaultPrevented,
    defaultPreventedAfterDispatch:null,
    target:inputProbeTargetView(e.target)
  };
}

function noteDefaultPreventedAfterDispatch(record, e) {
  if (!record) return;
  const apply=() => { try { record.defaultPreventedAfterDispatch=!!e.defaultPrevented; } catch {} };
  if (typeof queueMicrotask === 'function') queueMicrotask(apply);
  else Promise.resolve().then(apply);
}

function inputProbeEventSummaryLabel(event) {
  if (!event) return '--';
  if (event.code) return `${event.type}: ${event.code}${event.altKey ? ' +ALT' : ''}${event.ctrlKey ? ' +CTRL' : ''}${event.shiftKey ? ' +SHIFT' : ''}`;
  if (Number.isFinite(event.button) || Number.isFinite(event.buttons)) return `${event.type}: b=${event.button ?? '-'} buttons=${event.buttons ?? '-'}`;
  return event.type || '--';
}

function resetInputProbeTelemetry(keepEnabled = true) {
  const P=S.inputProbe;
  P.events.clear();
  P.lastEvent=null;
  P.keyDownCodes=Object.create(null);
  P.counters={
    keydown:0,keyup:0,pointerdown:0,pointerup:0,mousedown:0,mouseup:0,contextmenu:0,
    mouseDownWhileOtherHeld:0,multiButtonStateEvents:0,fullscreenchange:0,pointerlockchange:0,
    visibilitychange:0,windowBlur:0,windowFocus:0
  };
  if (!keepEnabled) {
    P.startedAtSec=null;
    P.stoppedAtSec=null;
  }
}

function bindInputProbeEvents() {
  const P=S.inputProbe;
  if (P.bound) return;

  const onKeyDown=e => {
    if (!P.enabled) return;
    P.counters.keydown++;
    const code=e.code || e.key || 'UNKNOWN';
    P.keyDownCodes[code]=(P.keyDownCodes[code]||0)+1;
    const rec=pushInputProbeEvent('KEYDOWN',inputKeyboardEventView(e));
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onKeyUp=e => {
    if (!P.enabled) return;
    P.counters.keyup++;
    const rec=pushInputProbeEvent('KEYUP',inputKeyboardEventView(e));
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onPointerDown=e => {
    if (!P.enabled) return;
    P.counters.pointerdown++;
    const view=inputPointerEventView(e);
    if (view.multiButtonState) P.counters.multiButtonStateEvents++;
    const rec=pushInputProbeEvent('POINTERDOWN',view);
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onPointerUp=e => {
    if (!P.enabled) return;
    P.counters.pointerup++;
    const view=inputPointerEventView(e);
    if (view.multiButtonState) P.counters.multiButtonStateEvents++;
    const rec=pushInputProbeEvent('POINTERUP',view);
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onMouseDown=e => {
    if (!P.enabled) return;
    P.counters.mousedown++;
    const view=inputPointerEventView(e);
    const pressedMask=Number.isFinite(view.buttons) ? view.buttons : 0;
    // MouseEvent.button mapping differs from buttons bitmask. Explicit masks avoid relying on array math below.
    const buttonMask=view.button===0?1:view.button===1?4:view.button===2?2:view.button===3?8:view.button===4?16:0;
    const otherHeld=buttonMask ? (pressedMask & ~buttonMask) !== 0 : (view.multiButtonState === true);
    if (otherHeld) P.counters.mouseDownWhileOtherHeld++;
    if (view.multiButtonState) P.counters.multiButtonStateEvents++;
    const rec=pushInputProbeEvent('MOUSEDOWN',{...view,otherButtonAlreadyHeld:otherHeld});
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onMouseUp=e => {
    if (!P.enabled) return;
    P.counters.mouseup++;
    const view=inputPointerEventView(e);
    if (view.multiButtonState) P.counters.multiButtonStateEvents++;
    const rec=pushInputProbeEvent('MOUSEUP',view);
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onContextMenu=e => {
    if (!P.enabled) return;
    P.counters.contextmenu++;
    const rec=pushInputProbeEvent('CONTEXTMENU',inputPointerEventView(e));
    noteDefaultPreventedAfterDispatch(rec,e);
  };
  const onFullscreen=() => {
    if (!P.enabled && !P.keyboardLock.active) return;
    P.counters.fullscreenchange++;
    const active=!!fullscreenElementCompat();
    pushInputProbeEvent('FULLSCREEN_CHANGE',{active},P.keyboardLock.active);
    if (!active && P.keyboardLock.active) {
      P.keyboardLock.active=false;
      P.keyboardLock.requestedCodes=[];
      P.keyboardLock.lastChangeAtSec=round(elapsed(),3);
      addEvent('INPUT_KEYBOARD_LOCK_CHANGE',{active:false,reason:'FULLSCREEN_EXIT'});
    }
    updateUI();
  };
  const onPointerLock=() => {
    if (!P.enabled) return;
    P.counters.pointerlockchange++;
    pushInputProbeEvent('POINTER_LOCK_CHANGE',{active:!!document.pointerLockElement});
    updateUI();
  };
  const onVisibility=() => {
    if (!P.enabled) return;
    P.counters.visibilitychange++;
    pushInputProbeEvent('VISIBILITY_CHANGE',{hidden:!!document.hidden,state:document.visibilityState || null});
  };
  const onBlur=() => {
    if (!P.enabled) return;
    P.counters.windowBlur++;
    pushInputProbeEvent('WINDOW_BLUR');
  };
  const onFocus=() => {
    if (!P.enabled) return;
    P.counters.windowFocus++;
    pushInputProbeEvent('WINDOW_FOCUS');
  };

  P.handlers={onKeyDown,onKeyUp,onPointerDown,onPointerUp,onMouseDown,onMouseUp,onContextMenu,onFullscreen,onPointerLock,onVisibility,onBlur,onFocus};
  window.addEventListener('keydown',onKeyDown,true);
  window.addEventListener('keyup',onKeyUp,true);
  window.addEventListener('pointerdown',onPointerDown,true);
  window.addEventListener('pointerup',onPointerUp,true);
  window.addEventListener('mousedown',onMouseDown,true);
  window.addEventListener('mouseup',onMouseUp,true);
  window.addEventListener('contextmenu',onContextMenu,true);
  document.addEventListener('fullscreenchange',onFullscreen,true);
  document.addEventListener('webkitfullscreenchange',onFullscreen,true);
  document.addEventListener('pointerlockchange',onPointerLock,true);
  document.addEventListener('visibilitychange',onVisibility,true);
  window.addEventListener('blur',onBlur,true);
  window.addEventListener('focus',onFocus,true);
  P.bound=true;
}

function unbindInputProbeEvents() {
  const P=S.inputProbe;
  if (!P.bound || !P.handlers) return;
  const h=P.handlers;
  window.removeEventListener('keydown',h.onKeyDown,true);
  window.removeEventListener('keyup',h.onKeyUp,true);
  window.removeEventListener('pointerdown',h.onPointerDown,true);
  window.removeEventListener('pointerup',h.onPointerUp,true);
  window.removeEventListener('mousedown',h.onMouseDown,true);
  window.removeEventListener('mouseup',h.onMouseUp,true);
  window.removeEventListener('contextmenu',h.onContextMenu,true);
  document.removeEventListener('fullscreenchange',h.onFullscreen,true);
  document.removeEventListener('webkitfullscreenchange',h.onFullscreen,true);
  document.removeEventListener('pointerlockchange',h.onPointerLock,true);
  document.removeEventListener('visibilitychange',h.onVisibility,true);
  window.removeEventListener('blur',h.onBlur,true);
  window.removeEventListener('focus',h.onFocus,true);
  P.handlers=null;
  P.bound=false;
}

function setInputProbeEnabled(enabled, reason='UI') {
  const P=S.inputProbe;
  enabled=!!enabled;
  if (enabled === P.enabled) return;
  if (enabled) {
    resetInputProbeTelemetry(true);
    bindInputProbeEvents();
    P.enabled=true;
    P.startedAtSec=round(elapsed(),3);
    P.stoppedAtSec=null;
    if (P.autoStopTimer) clearTimeout(P.autoStopTimer);
    P.autoStopTimer=setTimeout(() => setInputProbeEnabled(false,'AUTO_TIMEOUT'), INPUT_PROBE_AUTO_STOP_MS);
    pushInputProbeEvent('PROBE_START',{reason,autoStopMs:INPUT_PROBE_AUTO_STOP_MS},true);
    addEvent('INPUT_PROBE_START',{reason,maxEvents:MAX_INPUT_PROBE_EVENTS,autoStopMs:INPUT_PROBE_AUTO_STOP_MS});
  } else {
    pushInputProbeEvent('PROBE_STOP',{reason},true);
    P.enabled=false;
    P.stoppedAtSec=round(elapsed(),3);
    if (P.autoStopTimer) { clearTimeout(P.autoStopTimer); P.autoStopTimer=null; }
    void releaseKeyboardLock(`PROBE_STOP_${reason}`);
    unbindInputProbeEvents();
    addEvent('INPUT_PROBE_STOP',{reason,eventCount:P.events.count});
  }
  updateUI();
}

async function requestKeyboardLockForGameKeys() {
  const P=S.inputProbe;
  const Kb=P.keyboardLock;
  Kb.requestCount++;
  if (!Kb.supported) {
    Kb.failureCount++;
    Kb.lastError='KEYBOARD_LOCK_UNSUPPORTED';
    pushInputProbeEvent('KEYBOARD_LOCK_ERROR',{error:Kb.lastError},true);
    addEvent('INPUT_KEYBOARD_LOCK_ERROR',{error:Kb.lastError});
    updateUI();
    return false;
  }
  if (!fullscreenElementCompat()) {
    Kb.failureCount++;
    Kb.lastError='FULLSCREEN_REQUIRED_FOR_LOCK_TEST';
    pushInputProbeEvent('KEYBOARD_LOCK_ERROR',{error:Kb.lastError},true);
    addEvent('INPUT_KEYBOARD_LOCK_ERROR',{error:Kb.lastError});
    updateUI();
    return false;
  }
  try {
    const codes=['Escape','Tab'];
    await navigator.keyboard.lock(codes);
    Kb.active=true;
    Kb.requestedCodes=codes;
    Kb.successCount++;
    Kb.lastError=null;
    Kb.lastChangeAtSec=round(elapsed(),3);
    pushInputProbeEvent('KEYBOARD_LOCK_CHANGE',{active:true,codes,reason:'USER_TEST'},true);
    addEvent('INPUT_KEYBOARD_LOCK_CHANGE',{active:true,codes,reason:'USER_TEST'});
    updateUI();
    return true;
  } catch (e) {
    Kb.active=false;
    Kb.requestedCodes=[];
    Kb.failureCount++;
    Kb.lastError=String(e?.name || e?.message || e).slice(0,180);
    pushInputProbeEvent('KEYBOARD_LOCK_ERROR',{error:Kb.lastError},true);
    addEvent('INPUT_KEYBOARD_LOCK_ERROR',{error:Kb.lastError});
    updateUI();
    return false;
  }
}

async function releaseKeyboardLock(reason='USER') {
  const P=S.inputProbe;
  const Kb=P.keyboardLock;
  if (!Kb.supported) return false;
  try { navigator.keyboard.unlock(); } catch {}
  const wasActive=Kb.active;
  Kb.active=false;
  Kb.requestedCodes=[];
  Kb.lastChangeAtSec=round(elapsed(),3);
  if (wasActive) {
    pushInputProbeEvent('KEYBOARD_LOCK_CHANGE',{active:false,reason},true);
    addEvent('INPUT_KEYBOARD_LOCK_CHANGE',{active:false,reason});
  }
  updateUI();
  return true;
}

function inputProbeSnapshot() {
  const P=S.inputProbe;
  return {
    schemaVersion:1,
    enabled:P.enabled,
    observationalByDefault:true,
    syntheticKeyboardEvents:false,
    remoteInputTransportOverride:false,
    maxEvents:MAX_INPUT_PROBE_EVENTS,
    autoStopMs:INPUT_PROBE_AUTO_STOP_MS,
    retainedEvents:P.events.count,
    overwrittenEvents:Math.max(0,P.events.total-P.events.count),
    startedAtSec:P.startedAtSec,
    stoppedAtSec:P.stoppedAtSec,
    counters:{...P.counters},
    keyDownCodes:{...P.keyDownCodes},
    keyboardLock:{...P.keyboardLock},
    latestEvent:P.lastEvent,
    currentState:{
      fullscreen:!!fullscreenElementCompat(),
      pointerLocked:!!document.pointerLockElement,
      visibilityState:document.visibilityState || null,
      documentHasFocus:typeof document.hasFocus === 'function' ? document.hasFocus() : null
    },
    diagnosticSemantics:{
      escape:'Compare KEYDOWN/KEYUP Escape with FULLSCREEN_CHANGE. If Escape is delivered and fullscreen exits, browser default action is implicated; Keyboard Lock test can distinguish capture behavior.',
      altTab:'Compare AltLeft/AltRight + Tab KEYDOWN against WINDOW_BLUR/VISIBILITY_CHANGE. Missing Tab before blur suggests interception above page JS.',
      simultaneousMouse:'Compare MOUSEDOWN and POINTERDOWN while buttons bitmask contains multiple buttons. Physical mouse can emit MOUSEDOWN for the second button without a second POINTERDOWN.'
    },
    events:P.events.toArray()
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

  const codecsFromSdp = sdp => {
    if (!sdp || typeof sdp !== 'string') return [];
    const part = sdp.replace(/\r/g,'').split('m=video')[1]?.split('\nm=')[0] || '';
    const out=[];
    const re=/a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)\/(\d+)/g;
    let m;
    while ((m=re.exec(part)) !== null) out.push({payload:m[1],codec:m[2],clockRate:Number(m[3])});
    return out;
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
        signalingState:primitive(pc.signalingState),
        localVideoCodecs:codecsFromSdp(pc.localDescription?.sdp || ''),
        remoteVideoCodecs:codecsFromSdp(pc.remoteDescription?.sdp || '')
      };
      try {
        const receivers=pc.getReceivers?.() || [];
        const senders=pc.getSenders?.() || [];
        const transceivers=pc.getTransceivers?.() || [];
        out.peerConnection.resources={
          receivers:receivers.length,
          videoReceivers:receivers.filter(r=>r?.track?.kind==='video').length,
          senders:senders.length,
          videoSenders:senders.filter(s=>s?.track?.kind==='video').length,
          transceivers:transceivers.length
        };
      } catch {}
      try {
        const receiver=(pc.getReceivers?.() || []).find(r => r?.track?.kind === 'video') || null;
        if (receiver) {
          out.receiverHints={
            jitterBufferTarget:primitive(receiver.jitterBufferTarget),
            playoutDelayHint:primitive(receiver.playoutDelayHint)
          };
          try {
            const settings=receiver.track?.getSettings?.() || null;
            if (settings) {
              out.receiverTrackSettings={
                width:primitive(settings.width),
                height:primitive(settings.height),
                frameRate:primitive(settings.frameRate),
                aspectRatio:primitive(settings.aspectRatio),
                resizeMode:primitive(settings.resizeMode)
              };
            }
          } catch {}
        }
      } catch {}
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
        packetsDiscarded:n(inbound.packetsDiscarded),
        jitter:n(inbound.jitter),
        jitterBufferDelay:n(inbound.jitterBufferDelay),
        jitterBufferTargetDelay:n(inbound.jitterBufferTargetDelay),
        jitterBufferMinimumDelay:n(inbound.jitterBufferMinimumDelay),
        jitterBufferEmittedCount:n(inbound.jitterBufferEmittedCount),
        framesReceived:n(inbound.framesReceived),
        framesDecoded:n(inbound.framesDecoded),
        framesDropped:n(inbound.framesDropped),
        framesRendered:n(inbound.framesRendered),
        keyFramesDecoded:n(inbound.keyFramesDecoded),
        totalDecodeTime:n(inbound.totalDecodeTime),
        totalProcessingDelay:n(inbound.totalProcessingDelay),
        totalInterFrameDelay:n(inbound.totalInterFrameDelay),
        totalSquaredInterFrameDelay:n(inbound.totalSquaredInterFrameDelay),
        qpSum:n(inbound.qpSum),
        nackCount:n(inbound.nackCount),
        pliCount:n(inbound.pliCount),
        firCount:n(inbound.firCount),
        retransmittedPacketsReceived:n(inbound.retransmittedPacketsReceived),
        retransmittedBytesReceived:n(inbound.retransmittedBytesReceived),
        framesAssembledFromMultiplePackets:n(inbound.framesAssembledFromMultiplePackets),
        totalAssemblyTime:n(inbound.totalAssemblyTime),
        pauseCount:n(inbound.pauseCount),
        totalPausesDuration:n(inbound.totalPausesDuration),
        freezeCount:n(inbound.freezeCount),
        totalFreezesDuration:n(inbound.totalFreezesDuration),
        decoderImplementation:primitive(inbound.decoderImplementation),
        powerEfficientDecoder:primitive(inbound.powerEfficientDecoder)
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
// VIDEO + COMPOSITOR HOT PATH
// requestVideoFrameCallback is treated as a compositor callback source, not as
// a direct per-decoded-frame clock. Per-frame work is numeric only.
// -----------------------------------------------------------------------------
function resObj(width, height) {
  width = Math.round(Number(width) || 0);
  height = Math.round(Number(height) || 0);
  return width > 0 && height > 0 ? { width, height } : null;
}

function resKey(r) {
  return r?.width > 0 && r?.height > 0 ? `${r.width}x${r.height}` : '';
}

function sameRes(a, b) {
  return !!a === !!b && (!a || (a.width === b.width && a.height === b.height));
}

function findMainVideo() {
  const preferred = document.getElementById('remotevideo');
  if (preferred instanceof HTMLVideoElement) return preferred;
  const videos = document.querySelectorAll('video');
  if (videos.length === 1) return videos[0];
  let best = null, bestArea = -1;
  for (const v of videos) {
    const area = (v.clientWidth || 0) * (v.clientHeight || 0);
    if (area > bestArea) { best = v; bestArea = area; }
  }
  return best;
}

function snapshotVideo() {
  const v = S.video;
  if (!v) return;
  const w = v.videoWidth || 0, h = v.videoHeight || 0;
  S.videoState.resolution = resObj(w, h);
  if (S.surface.rendered) S.videoState.rendered = S.surface.rendered;
  S.videoState.readyState = v.readyState;
  S.videoState.paused = v.paused;
  S.videoState.currentTime = Number.isFinite(v.currentTime) ? round(v.currentTime, 3) : null;
}

function surfaceSnapshot(reason = 'CHECK', emit = true) {
  const v = S.video;
  const rect = v?.getBoundingClientRect?.();
  const rendered = rect ? resObj(rect.width || v.clientWidth, rect.height || v.clientHeight) : null;
  const viewport = {
    width: Math.round(innerWidth || 0),
    height: Math.round(innerHeight || 0),
    visualWidth: round(window.visualViewport?.width, 2),
    visualHeight: round(window.visualViewport?.height, 2),
    scale: round(window.visualViewport?.scale, 4)
  };
  const orientation = screen.orientation?.type || `${Math.max(innerWidth, innerHeight) >= Math.min(innerWidth, innerHeight) ? (innerWidth >= innerHeight ? 'landscape' : 'portrait') : 'unknown'}`;
  let objectFit=null, objectPosition=null;
  try {
    const style=v ? getComputedStyle(v) : null;
    objectFit=style?.objectFit || null;
    objectPosition=style?.objectPosition || null;
  } catch {}
  const renderedKey = resKey(rendered);
  const viewportKey = `${viewport.width}x${viewport.height}|${viewport.visualWidth}x${viewport.visualHeight}|${viewport.scale}`;
  const styleKey = `${objectFit || ''}|${objectPosition || ''}`;

  if (emit && renderedKey && S.surface.renderedKey && renderedKey !== S.surface.renderedKey) {
    addEvent('SURFACE_CHANGE', {
      reason,
      from: S.surface.rendered,
      to: rendered,
      streamResolution: S.videoState.resolution
    });
  }
  if (emit && S.surface.viewportKey && viewportKey !== S.surface.viewportKey) {
    addEvent('VIEWPORT_CHANGE', { reason, viewport });
  }
  if (emit && S.surface.orientation && orientation !== S.surface.orientation) {
    addEvent('ORIENTATION_CHANGE', { reason, from: S.surface.orientation, to: orientation });
  }
  if (emit && S.surface.styleKey && styleKey !== S.surface.styleKey) {
    addEvent('SURFACE_STYLE_CHANGE', {
      reason,
      from:{objectFit:S.surface.objectFit,objectPosition:S.surface.objectPosition},
      to:{objectFit,objectPosition}
    });
  }

  S.surface.renderedKey = renderedKey || S.surface.renderedKey;
  if (rendered) S.surface.rendered = rendered;
  S.surface.viewportKey = viewportKey;
  S.surface.viewport = viewport;
  S.surface.orientation = orientation;
  S.surface.styleKey = styleKey;
  S.surface.objectFit = objectFit;
  S.surface.objectPosition = objectPosition;
  if (rendered) S.videoState.rendered = rendered;

  return { rendered, viewport, orientation, objectFit, objectPosition };
}

function scheduleSurfaceCheck(reason) {
  // Coalesce resize animation bursts (especially Safari VisualViewport) into
  // one final state without adding polling.
  S.surface.pending = true;
  S.surface.pendingReason = reason;
  if (S.surface.pendingTimer) clearTimeout(S.surface.pendingTimer);
  S.surface.pendingTimer = setTimeout(() => {
    S.surface.pending = false;
    S.surface.pendingTimer = null;
    const finalReason = S.surface.pendingReason || reason;
    S.surface.pendingReason = null;
    surfaceSnapshot(finalReason, true);
  }, 90);
}

function readPlaybackQuality() {
  const v=S.video;
  if (!v || !CAP.video.getVideoPlaybackQuality || typeof v.getVideoPlaybackQuality !== 'function') return null;
  try {
    const q=v.getVideoPlaybackQuality();
    if (!q) return null;
    return {
      creationTime:Number.isFinite(q.creationTime) ? q.creationTime : null,
      totalVideoFrames:Number.isFinite(q.totalVideoFrames) ? q.totalVideoFrames : null,
      droppedVideoFrames:Number.isFinite(q.droppedVideoFrames) ? q.droppedVideoFrames : null
    };
  } catch {
    return null;
  }
}

function processPlaybackQuality(raw) {
  if (!raw) return {
    available:false,
    totalVideoFramesRaw:null,droppedVideoFramesRaw:null,
    totalVideoFramesDelta:null,droppedVideoFramesDelta:null,dropPercent:null
  };
  const out={
    available:true,
    totalVideoFramesRaw:raw.totalVideoFrames,
    droppedVideoFramesRaw:raw.droppedVideoFrames,
    totalVideoFramesDelta:null,
    droppedVideoFramesDelta:null,
    dropPercent:null
  };
  const prev=S.playbackPrev;
  if (prev) {
    const totalDelta=Number.isFinite(raw.totalVideoFrames) && Number.isFinite(prev.totalVideoFrames)
      ? raw.totalVideoFrames-prev.totalVideoFrames : null;
    const droppedDelta=Number.isFinite(raw.droppedVideoFrames) && Number.isFinite(prev.droppedVideoFrames)
      ? raw.droppedVideoFrames-prev.droppedVideoFrames : null;
    out.totalVideoFramesDelta=Number.isFinite(totalDelta) && totalDelta>=0 ? totalDelta : null;
    out.droppedVideoFramesDelta=Number.isFinite(droppedDelta) && droppedDelta>=0 ? droppedDelta : null;
    if ((out.totalVideoFramesDelta || 0)>0 && Number.isFinite(out.droppedVideoFramesDelta)) {
      out.dropPercent=out.droppedVideoFramesDelta/out.totalVideoFramesDelta*100;
    }
  }
  S.playbackPrev=raw;
  return out;
}

function resetCompositorWindowAnchors() {
  const f=S.frame;
  f.lastNow=0;
  f.prevSamplePresentedFrames=Number.isFinite(f.lastPresentedFrames) ? f.lastPresentedFrames : null;
  f.prevSampleCallbacks=f.callbacks;
  f.prevSampleTime=now();
  f.intervalCount=0;
  f.intervalSum=0;
  f.intervalSumSq=0;
  f.intervalMin=Infinity;
  f.intervalMax=0;
  f.processingCount=0;
  f.processingSumMs=0;
  f.latenessCount=0;
  f.latenessSumMs=0;
  f.multiFrameCallbacks=0;
}

function reanchorMeasurement(reason, graceSamples=0) {
  resetCompositorWindowAnchors();
  S.rtcPrev=null;
  S.playbackPrev=null;
  S.measurement.resumeGraceSamples=Math.max(S.measurement.resumeGraceSamples,graceSamples);
  S.measurement.lastReanchorReason=reason;
  S.measurement.lastReanchorAtSec=round(elapsed(),3);
  addEvent('MEASUREMENT_REANCHOR',{reason,graceSamples:S.measurement.resumeGraceSamples,hidden:!!document.hidden,videoPaused:!!S.video?.paused});
}

function measurementEligibility() {
  if (document.hidden || S.measurement.hidden) return {eligible:false,reason:'DOCUMENT_HIDDEN'};
  if (!S.video) return {eligible:false,reason:'NO_VIDEO'};
  if (S.video.paused || S.measurement.videoPaused) return {eligible:false,reason:'VIDEO_PAUSED'};
  if ((S.video.readyState || 0) < 2) return {eligible:false,reason:'VIDEO_NOT_READY'};
  if (S.measurement.resumeGraceSamples > 0) return {eligible:false,reason:'RESUME_GRACE'};
  return {eligible:true,reason:null};
}

function bindGlobalSurfaceEvents() {
  if (S.surface.globalBound) return;
  S.surface.globalBound = true;
  surfaceSnapshot('GLOBAL_BIND', false);
  window.addEventListener('resize', () => scheduleSurfaceCheck('WINDOW_RESIZE'), { passive: true });
  window.addEventListener('orientationchange', () => scheduleSurfaceCheck('ORIENTATION_EVENT'), { passive: true });
  document.addEventListener('visibilitychange', () => {
    S.measurement.hidden=!!document.hidden;
    if (document.hidden) reanchorMeasurement('DOCUMENT_HIDDEN',0);
    else reanchorMeasurement('DOCUMENT_VISIBLE',2);
    addEvent('VISIBILITY_CHANGE',{hidden:!!document.hidden});
  }, { passive:true });
  try {
    window.visualViewport?.addEventListener('resize', () => scheduleSurfaceCheck('VISUAL_VIEWPORT_RESIZE'), { passive: true });
  } catch {}
}

function bindSurfaceObserver(v) {
  try { S.surface.resizeObserver?.disconnect(); } catch {}
  if (typeof ResizeObserver === 'function') {
    try {
      S.surface.resizeObserver = new ResizeObserver(() => scheduleSurfaceCheck('RESIZE_OBSERVER'));
      S.surface.resizeObserver.observe(v);
      S.longSession.surfaceObserverBindCount++;
    } catch {}
  }
  surfaceSnapshot('VIDEO_BIND', false);
}

function recordCallbackInterval(dt) {
  const f = S.frame;
  f.intervalCount++;
  f.intervalSum += dt;
  f.intervalSumSq += dt * dt;
  if (dt < f.intervalMin) f.intervalMin = dt;
  if (dt > f.intervalMax) f.intervalMax = dt;

  f.histCount++;
  f.histSum += dt;
  f.histSumSq += dt * dt;
  if (dt < f.histMin) f.histMin = dt;
  if (dt > f.histMax) f.histMax = dt;
  const bin = clamp(Math.floor(dt / FRAME_BIN_MS), 0, FRAME_HIST_BINS - 1);
  f.histogram[bin]++;
}

function recordDeepCallbackWork(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  const d=S.deep;
  d.callbackWorkCount++;
  d.callbackWorkTotalMs+=ms;
  if (ms>d.callbackWorkMaxMs) d.callbackWorkMaxMs=ms;
  const bin=clamp(Math.floor(ms/DEEP_WORK_BIN_MS),0,DEEP_WORK_BINS-1);
  d.callbackWorkHistogram[bin]++;
}

function deepHistogramPercentile(q) {
  const d=S.deep;
  if (!d.callbackWorkCount) return null;
  const target=Math.ceil(d.callbackWorkCount*q);
  let acc=0;
  for (let i=0;i<d.callbackWorkHistogram.length;i++) {
    acc+=d.callbackWorkHistogram[i];
    if (acc>=target) {
      if (i===d.callbackWorkHistogram.length-1) return DEEP_WORK_MAX_MS;
      return i*DEEP_WORK_BIN_MS+DEEP_WORK_BIN_MS/2;
    }
  }
  return null;
}

function deepEnabledDurationMs() {
  const d=S.deep;
  const current=d.enabled && Number.isFinite(d.enabledAtSec)
    ? Math.max(0, elapsed()*1000-d.enabledAtSec*1000)
    : 0;
  return d.totalEnabledMs+current;
}

function deepPerformanceSnapshot() {
  const d=S.deep;
  return {
    enabled:d.enabled,
    enableCount:d.enableCount,
    disableCount:d.disableCount,
    enabledAtSec:d.enabledAtSec,
    lastDisabledAtSec:d.lastDisabledAtSec,
    totalEnabledMs:round(deepEnabledDurationMs(),3),
    callbacksProcessed:d.callbacksProcessed,
    callbacksDiscarded:d.callbacksDiscarded,
    callbackWork:{
      count:d.callbackWorkCount,
      totalMs:round(d.callbackWorkTotalMs,3),
      avgMs:d.callbackWorkCount ? round(d.callbackWorkTotalMs/d.callbackWorkCount,4) : null,
      maxMs:round(d.callbackWorkMaxMs,4),
      p50Ms:round(deepHistogramPercentile(0.50),4),
      p95Ms:round(deepHistogramPercentile(0.95),4),
      p99Ms:round(deepHistogramPercentile(0.99),4),
      histogramBinMs:DEEP_WORK_BIN_MS,
      histogramOverflowAtMs:DEEP_WORK_MAX_MS
    }
  };
}

function resetDeepPerformanceStats() {
  const d=S.deep;
  d.totalEnabledMs=0;
  d.callbacksProcessed=0;
  d.callbacksDiscarded=0;
  d.callbackWorkCount=0;
  d.callbackWorkTotalMs=0;
  d.callbackWorkMaxMs=0;
  d.callbackWorkHistogram.fill(0);
  d.prevSampleCallbacksProcessed=0;
  d.prevSampleWorkTotalMs=0;
  d.enableCount=0;
  d.disableCount=0;
  d.enabledAtSec=d.enabled ? round(elapsed(),3) : null;
  d.lastDisabledAtSec=null;
}

function scheduleDeepFrameLoop(v=S.video) {
  if (!S.deep.enabled || !v || S.video!==v || typeof v.requestVideoFrameCallback!=='function') return false;
  if (S.deep.callbackScheduled) return true;
  const token=S.deep.token;
  S.deep.callbackScheduled=true;

  const cb=(t,meta)=>{
    S.deep.callbackScheduled=false;
    if (!S.deep.enabled || S.video!==v || token!==S.deep.token) {
      S.deep.callbacksDiscarded++;
      return;
    }

    const workStart=now();
    const f=S.frame;
    f.callbacks++;

    if (f.lastNow>0) {
      const dt=t-f.lastNow;
      if (dt>0 && dt<1000) recordCallbackInterval(dt);
    }
    f.lastNow=t;
    S.lastFrameAt=round(elapsed(),3);
    if (S.firstFrameAt==null) S.firstFrameAt=S.lastFrameAt;

    if (Number.isFinite(meta.presentedFrames)) {
      if (Number.isFinite(f.lastCallbackPresentedFrames)) {
        const dpf=meta.presentedFrames-f.lastCallbackPresentedFrames;
        if (dpf>1) f.multiFrameCallbacks++;
      }
      f.lastCallbackPresentedFrames=meta.presentedFrames;
      f.lastPresentedFrames=meta.presentedFrames;
    }

    if (Number.isFinite(meta.processingDuration)) {
      f.processingCount++;
      f.processingSumMs+=meta.processingDuration*1000;
    }
    if (Number.isFinite(meta.expectedDisplayTime)) {
      const late=Math.max(0,t-meta.expectedDisplayTime);
      f.latenessCount++;
      f.latenessSumMs+=late;
    }

    const w=meta.width||v.videoWidth||0;
    const h=meta.height||v.videoHeight||0;
    const nextRes=resObj(w,h);
    if (nextRes) S.videoState.rvfcMediaFrame=nextRes;
    if (nextRes && !sameRes(nextRes,S.videoState.resolution)) {
      const prev=S.videoState.resolution;
      S.videoState.resolution=nextRes;
      addEvent('VIDEO_RESOLUTION_CHANGE',{from:prev,to:nextRes,source:'DEEP_RVFC'});
    }

    S.deep.callbacksProcessed++;
    recordDeepCallbackWork(now()-workStart);

    if (S.deep.enabled && S.video===v && token===S.deep.token) {
      S.deep.callbackScheduled=true;
      v.requestVideoFrameCallback(cb);
    }
  };

  v.requestVideoFrameCallback(cb);
  return true;
}

function setDeepAnalyzerEnabled(enabled, reason='USER') {
  enabled=!!enabled;
  const d=S.deep;
  if (enabled===d.enabled) return false;
  if (enabled && !CAP.video.requestVideoFrameCallback) {
    addEvent('DEEP_ANALYZER_UNAVAILABLE',{reason:'REQUEST_VIDEO_FRAME_CALLBACK_UNSUPPORTED'});
    updateUI();
    return false;
  }

  if (enabled) {
    d.enabled=true;
    d.token++;
    d.enableCount++;
    d.enabledAtSec=round(elapsed(),3);
    resetCompositorWindowAnchors();
    addEvent('DEEP_ANALYZER_ENABLED',{reason,atSec:d.enabledAtSec,capability:CAP.video.requestVideoFrameCallback});
    scheduleDeepFrameLoop(S.video);
  } else {
    const at=round(elapsed(),3);
    if (Number.isFinite(d.enabledAtSec)) d.totalEnabledMs+=Math.max(0,(at-d.enabledAtSec)*1000);
    d.enabled=false;
    d.token++;
    d.callbackScheduled=false;
    d.disableCount++;
    d.lastDisabledAtSec=at;
    d.enabledAtSec=null;
    resetCompositorWindowAnchors();
    addEvent('DEEP_ANALYZER_DISABLED',{reason,atSec:at,performance:deepPerformanceSnapshot()});
  }
  updateUI();
  return true;
}

function bindVideo(v) {
  if (!v || (S.video === v && S.videoBound)) return;
  S.longSession.videoBindCount++;
  S.video = v;
  S.videoBound = true;
  S.videoState.rvfcMediaFrame=null;
  S.playbackPrev=null;
  S.measurement.videoPaused=!!v.paused;
  if (S.firstVideoAt == null) S.firstVideoAt = round(elapsed(), 3);
  addEvent('VIDEO_FOUND', { id: v.id || null });

  const on = (name, fn = null) => v.addEventListener(name, () => {
    if (fn) fn();
    snapshotVideo();
    addEvent('VIDEO_EVENT', { event: name, readyState: v.readyState });
  }, { passive: true });

  on('loadedmetadata', () => { if (S.firstMetadataAt == null) S.firstMetadataAt = round(elapsed(), 3); });
  on('playing', () => {
    if (S.firstPlayingAt == null) S.firstPlayingAt = round(elapsed(), 3);
    S.measurement.videoPaused=false;
    reanchorMeasurement('VIDEO_PLAYING',2);
    if (S.deep.enabled) scheduleDeepFrameLoop(v);
  });
  on('pause', () => {
    S.measurement.videoPaused=true;
    reanchorMeasurement('VIDEO_PAUSE',0);
  });
  on('waiting');
  on('stalled');
  on('emptied');
  on('resize', () => scheduleSurfaceCheck('VIDEO_RESIZE'));

  snapshotVideo();
  bindSurfaceObserver(v);
  if (S.deep.enabled) scheduleDeepFrameLoop(v);
}

function videoScanner() {
  const v = findMainVideo();
  if (v && v !== S.video) bindVideo(v);
  if (!S.video || !document.contains(S.video)) {
    if (S.video && !document.contains(S.video)) {
      S.longSession.videoRemovedCount++;
      addEvent('VIDEO_REMOVED');
      try { S.surface.resizeObserver?.disconnect(); } catch {}
      S.video = null;
      S.videoBound = false;
    }
    setTimeout(videoScanner, 1500);
  } else {
    setTimeout(videoScanner, 4000);
  }
}

function normalizeCompositorRegime(hz) {
  if (!Number.isFinite(hz) || hz < 5) return null;
  const common = [15, 20, 24, 25, 30, 40, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  let best = common[0], dist = Infinity;
  for (const c of common) {
    const d = Math.abs(hz - c);
    if (d < dist) { dist = d; best = c; }
  }
  return dist <= Math.max(2, best * 0.08) ? best : Math.round(hz);
}

function updateCompositorRegime(callbackHz) {
  const f = S.frame;
  const candidate = normalizeCompositorRegime(callbackHz);
  if (!candidate) return f.regime;
  if (candidate === f.regime) {
    f.regimeCandidate = null;
    f.regimeCandidateCount = 0;
    return f.regime;
  }
  if (candidate === f.regimeCandidate) f.regimeCandidateCount++;
  else {
    f.regimeCandidate = candidate;
    f.regimeCandidateCount = 1;
  }
  if (f.regimeCandidateCount >= COMPOSITOR_REGIME_CONFIRM_SAMPLES) {
    const from = f.regime;
    f.regime = candidate;
    f.regimeCandidate = null;
    f.regimeCandidateCount = 0;
    addEvent('COMPOSITOR_REGIME_CHANGE', { fromHz: from, toHz: candidate });
  }
  return f.regime || candidate;
}

function consumeCompositorSample(sampleNow) {
  const f = S.frame;
  const d = S.deep;
  if (!d.enabled) {
    return {
      deepEnabled:false,presentedFPS:null,presentedFramesDelta:null,callbackHz:null,callbackCountDelta:null,
      callbackIntervalMeanMs:null,callbackJitterMs:null,callbackIntervalMinMs:null,callbackIntervalMaxMs:null,
      framesPerCallback:null,multiFrameCallbacks:null,processingDurationMs:null,callbackLatenessMs:null,compositorRegimeHz:null,
      deepCallbackWorkCountDelta:0,deepCallbackWorkTotalMs:0,deepCallbackWorkAvgMs:null
    };
  }
  let presentedFPS = null;
  let presentedFramesDelta = null;
  let callbackHz = null;
  let callbackCountDelta = null;
  let framesPerCallback = null;

  if (Number.isFinite(f.prevSampleTime)) {
    const dt = (sampleNow - f.prevSampleTime) / 1000;
    callbackCountDelta = Math.max(0, f.callbacks - f.prevSampleCallbacks);
    if (dt > 0) callbackHz = callbackCountDelta / dt;
    if (Number.isFinite(f.lastPresentedFrames) && Number.isFinite(f.prevSamplePresentedFrames)) {
      presentedFramesDelta = f.lastPresentedFrames - f.prevSamplePresentedFrames;
      if (dt > 0 && presentedFramesDelta >= 0) presentedFPS = presentedFramesDelta / dt;
    }
    if (callbackCountDelta > 0 && Number.isFinite(presentedFramesDelta) && presentedFramesDelta >= 0) {
      framesPerCallback = presentedFramesDelta / callbackCountDelta;
    }
  }

  f.prevSamplePresentedFrames = Number.isFinite(f.lastPresentedFrames) ? f.lastPresentedFrames : f.prevSamplePresentedFrames;
  f.prevSampleCallbacks = f.callbacks;
  f.prevSampleTime = sampleNow;

  const count = f.intervalCount;
  let callbackIntervalMeanMs = null, callbackJitterMs = null, callbackIntervalMinMs = null, callbackIntervalMaxMs = null;
  if (count > 0) {
    callbackIntervalMeanMs = f.intervalSum / count;
    const variance = Math.max(0, f.intervalSumSq / count - callbackIntervalMeanMs * callbackIntervalMeanMs);
    callbackJitterMs = Math.sqrt(variance);
    callbackIntervalMinMs = f.intervalMin;
    callbackIntervalMaxMs = f.intervalMax;
  }

  const processingDurationMs = f.processingCount > 0 ? f.processingSumMs / f.processingCount : null;
  const callbackLatenessMs = f.latenessCount > 0 ? f.latenessSumMs / f.latenessCount : null;
  const multiFrameCallbacks = f.multiFrameCallbacks;
  const deepCallbackWorkCountDelta=Math.max(0,d.callbacksProcessed-d.prevSampleCallbacksProcessed);
  const deepCallbackWorkTotalMs=Math.max(0,d.callbackWorkTotalMs-d.prevSampleWorkTotalMs);
  const deepCallbackWorkAvgMs=deepCallbackWorkCountDelta>0 ? deepCallbackWorkTotalMs/deepCallbackWorkCountDelta : null;
  d.prevSampleCallbacksProcessed=d.callbacksProcessed;
  d.prevSampleWorkTotalMs=d.callbackWorkTotalMs;

  f.intervalCount = 0;
  f.intervalSum = 0;
  f.intervalSumSq = 0;
  f.intervalMin = Infinity;
  f.intervalMax = 0;
  f.processingCount = 0;
  f.processingSumMs = 0;
  f.latenessCount = 0;
  f.latenessSumMs = 0;
  f.multiFrameCallbacks = 0;

  return {
    presentedFPS: round(presentedFPS, 3),
    presentedFramesDelta,
    callbackHz: round(callbackHz, 3),
    callbackCountDelta,
    callbackIntervalMeanMs: round(callbackIntervalMeanMs, 3),
    callbackJitterMs: round(callbackJitterMs, 3),
    callbackIntervalMinMs: round(callbackIntervalMinMs, 3),
    callbackIntervalMaxMs: round(callbackIntervalMaxMs, 3),
    framesPerCallback: round(framesPerCallback, 4),
    multiFrameCallbacks,
    processingDurationMs: round(processingDurationMs, 3),
    callbackLatenessMs: round(callbackLatenessMs, 3),
    compositorRegimeHz: updateCompositorRegime(callbackHz),
    deepEnabled:true,
    deepCallbackWorkCountDelta,
    deepCallbackWorkTotalMs:round(deepCallbackWorkTotalMs,4),
    deepCallbackWorkAvgMs:round(deepCallbackWorkAvgMs,4)
  };
}

function callbackHistogramPercentile(q) {
  const f = S.frame;
  if (!f.histCount) return null;
  const target = Math.ceil(f.histCount * q);
  let acc = 0;
  for (let i = 0; i < f.histogram.length; i++) {
    acc += f.histogram[i];
    if (acc >= target) {
      if (i === f.histogram.length - 1) return FRAME_HIST_MAX_MS;
      return i * FRAME_BIN_MS + FRAME_BIN_MS / 2;
    }
  }
  return null;
}

function compositorSessionStats() {
  const f = S.frame;
  if (!f.histCount) return { count: 0, avgMs: null, minMs: null, maxMs: null, p50Ms: null, p95Ms: null, p99Ms: null, stddevMs: null };
  const avg = f.histSum / f.histCount;
  const variance = Math.max(0, f.histSumSq / f.histCount - avg * avg);
  return {
    count: f.histCount,
    avgMs: round(avg, 4),
    minMs: round(f.histMin, 4),
    maxMs: round(f.histMax, 4),
    p50Ms: round(callbackHistogramPercentile(0.50), 4),
    p95Ms: round(callbackHistogramPercentile(0.95), 4),
    p99Ms: round(callbackHistogramPercentile(0.99), 4),
    stddevMs: round(Math.sqrt(variance), 4),
    histogramBinMs: FRAME_BIN_MS,
    histogramOverflowAtMs: FRAME_HIST_MAX_MS,
    semantics: 'requestVideoFrameCallback callback intervals; not decoded-frame intervals'
  };
}

// -----------------------------------------------------------------------------
// RTC PROCESSING
// -----------------------------------------------------------------------------
function processRtc(raw, localNow) {
  if (!raw?.ok || !raw.inbound) return null;
  const r = raw.inbound;
  const cur = {
    localNow,
    timestamp: r.timestamp,
    bytesReceived: r.bytesReceived ?? null,
    videoBytesReceivedTotal: Number.isFinite(raw.videoAggregate?.bytesReceivedTotal) ? raw.videoAggregate.bytesReceivedTotal : null,
    transportBytesReceived: Number.isFinite(raw.candidatePair?.bytesReceived) ? raw.candidatePair.bytesReceived : null,
    packetsReceived: r.packetsReceived ?? 0,
    packetsLost: r.packetsLost ?? 0,
    packetsDiscarded: r.packetsDiscarded ?? null,
    framesReceived: r.framesReceived ?? 0,
    framesDecoded: r.framesDecoded ?? 0,
    framesDropped: r.framesDropped ?? 0,
    framesRendered: r.framesRendered ?? null,
    totalDecodeTime: r.totalDecodeTime ?? null,
    totalProcessingDelay: r.totalProcessingDelay ?? null,
    totalInterFrameDelay: r.totalInterFrameDelay ?? null,
    totalSquaredInterFrameDelay: r.totalSquaredInterFrameDelay ?? null,
    qpSum: r.qpSum ?? null,
    nackCount: r.nackCount ?? null,
    pliCount: r.pliCount ?? null,
    firCount: r.firCount ?? null,
    retransmittedPacketsReceived: r.retransmittedPacketsReceived ?? null,
    retransmittedBytesReceived: r.retransmittedBytesReceived ?? null,
    framesAssembledFromMultiplePackets: r.framesAssembledFromMultiplePackets ?? null,
    totalAssemblyTime: r.totalAssemblyTime ?? null,
    pauseCount: r.pauseCount ?? null,
    totalPausesDuration: r.totalPausesDuration ?? null,
    freezeCount: r.freezeCount ?? 0,
    totalFreezesDuration: r.totalFreezesDuration ?? null,
    jbDelay: r.jitterBufferDelay ?? null,
    jbTargetDelay: r.jitterBufferTargetDelay ?? null,
    jbMinDelay: r.jitterBufferMinimumDelay ?? null,
    jbCount: r.jitterBufferEmittedCount ?? null
  };

  const out = {
    pcSource: raw.pcSource || null,
    pcState: raw.pcState || null,
    iceState: raw.iceState || null,
    codec: r.mimeType || null,
    inboundResolution: resObj(r.frameWidth, r.frameHeight),
    rtcFPS: r.framesPerSecond ?? null,
    bitrateMbps: null,
    bitrateSource: null,
    bitrateScope: null,
    bitrateConfidence: null,
    receivedFPS: null,
    decodedFPS: null,
    packetsLostRaw: cur.packetsLost,
    packetsLostDelta: null,
    packetsReceivedDelta: null,
    packetLossPercent: null,
    packetsDiscardedRaw: cur.packetsDiscarded,
    networkJitterMs: Number.isFinite(r.jitter) ? r.jitter * 1000 : null,
    jitterBufferMs: null,
    jitterBufferTargetMs: null,
    jitterBufferMinimumMs: null,
    framesReceivedRaw: cur.framesReceived,
    framesDecodedRaw: cur.framesDecoded,
    framesDroppedRaw: cur.framesDropped,
    framesDroppedDelta: null,
    framesRenderedRaw: cur.framesRendered,
    framesRenderedDelta: null,
    renderedFPSFromStats: null,
    decodeTimePerFrameMs: null,
    processingDelayPerFrameMs: null,
    renderInterFrameMeanMs: null,
    renderInterFrameStdDevMs: null,
    qpSumRaw: cur.qpSum,
    qpSumDelta: null,
    qpPerDecodedFrame: null,
    nackCountRaw: cur.nackCount,
    nackCountDelta: null,
    pliCountRaw: cur.pliCount,
    pliCountDelta: null,
    firCountRaw: cur.firCount,
    firCountDelta: null,
    retransmittedPacketsReceivedRaw: cur.retransmittedPacketsReceived,
    retransmittedPacketsReceivedDelta: null,
    retransmittedBytesReceivedRaw: cur.retransmittedBytesReceived,
    retransmittedBytesReceivedDelta: null,
    framesAssembledFromMultiplePacketsRaw: cur.framesAssembledFromMultiplePackets,
    framesAssembledFromMultiplePacketsDelta: null,
    assemblyTimePerMultiPacketFrameMs: null,
    pauseCountRaw: cur.pauseCount,
    pauseCountDelta: null,
    totalPausesDuration: cur.totalPausesDuration,
    freezeCount: cur.freezeCount,
    freezeDelta: null,
    totalFreezesDuration: cur.totalFreezesDuration,
    rttMs: Number.isFinite(raw.candidatePair?.currentRoundTripTime) ? raw.candidatePair.currentRoundTripTime * 1000 : null,
    availableIncomingMbps: Number.isFinite(raw.candidatePair?.availableIncomingBitrate) ? raw.candidatePair.availableIncomingBitrate / 1e6 : null,
    decoderImplementation: r.decoderImplementation ?? null,
    powerEfficientDecoder: r.powerEfficientDecoder ?? null
  };

  const prev = S.rtcPrev;
  if (prev) {
    let dt = null;
    if (Number.isFinite(cur.timestamp) && Number.isFinite(prev.timestamp)) dt = (cur.timestamp - prev.timestamp) / 1000;
    if (!(dt > 0 && dt < 10)) dt = (localNow - prev.localNow) / 1000;

    if (dt > 0) {
      const recvFramesDelta = cur.framesReceived - prev.framesReceived;
      const decFramesDelta = cur.framesDecoded - prev.framesDecoded;
      const recvPacketsDelta = cur.packetsReceived - prev.packetsReceived;
      const lostDelta = cur.packetsLost - prev.packetsLost;
      if (recvFramesDelta >= 0) out.receivedFPS = recvFramesDelta / dt;
      if (decFramesDelta >= 0) out.decodedFPS = decFramesDelta / dt;
      out.packetsReceivedDelta = recvPacketsDelta >= 0 ? recvPacketsDelta : null;
      out.packetsLostDelta = lostDelta >= 0 ? lostDelta : null;
      const packetTotal = Math.max(0, recvPacketsDelta) + Math.max(0, lostDelta);
      if (packetTotal > 0) out.packetLossPercent = Math.max(0, lostDelta) / packetTotal * 100;

      const aggregateBytesDelta = Number.isFinite(cur.videoBytesReceivedTotal) && Number.isFinite(prev.videoBytesReceivedTotal)
        ? cur.videoBytesReceivedTotal - prev.videoBytesReceivedTotal : null;
      const selectedBytesDelta = Number.isFinite(cur.bytesReceived) && Number.isFinite(prev.bytesReceived)
        ? cur.bytesReceived - prev.bytesReceived : null;
      const transportBytesDelta = Number.isFinite(cur.transportBytesReceived) && Number.isFinite(prev.transportBytesReceived)
        ? cur.transportBytesReceived - prev.transportBytesReceived : null;
      const streamProgressed = recvFramesDelta > 0 || recvPacketsDelta > 0;
      if (Number.isFinite(aggregateBytesDelta) && aggregateBytesDelta > 0) {
        out.bitrateMbps = aggregateBytesDelta * 8 / dt / 1e6;
        out.bitrateSource = 'INBOUND_VIDEO_BYTES_SUM';
        out.bitrateScope = 'VIDEO';
        out.bitrateConfidence = 'DIRECT_COUNTER';
      } else if (Number.isFinite(selectedBytesDelta) && selectedBytesDelta > 0) {
        out.bitrateMbps = selectedBytesDelta * 8 / dt / 1e6;
        out.bitrateSource = 'SELECTED_INBOUND_VIDEO_BYTES';
        out.bitrateScope = 'VIDEO';
        out.bitrateConfidence = 'DIRECT_COUNTER';
      } else if (streamProgressed && Number.isFinite(transportBytesDelta) && transportBytesDelta > 0) {
        out.bitrateMbps = transportBytesDelta * 8 / dt / 1e6;
        out.bitrateSource = 'CANDIDATE_PAIR_BYTES_FALLBACK';
        out.bitrateScope = 'TRANSPORT';
        out.bitrateConfidence = 'APPROXIMATE';
      } else if (!streamProgressed && aggregateBytesDelta === 0) {
        out.bitrateMbps = 0;
        out.bitrateSource = 'INBOUND_VIDEO_BYTES_SUM';
        out.bitrateScope = 'VIDEO';
        out.bitrateConfidence = 'DIRECT_COUNTER';
      } else if (streamProgressed) {
        out.bitrateSource = 'UNAVAILABLE_STALLED_COUNTER';
        out.bitrateScope = null;
        out.bitrateConfidence = 'UNAVAILABLE';
      }

      const droppedDelta = cur.framesDropped - prev.framesDropped;
      out.framesDroppedDelta = droppedDelta >= 0 ? droppedDelta : null;

      const freezeDelta = cur.freezeCount - prev.freezeCount;
      out.freezeDelta = freezeDelta >= 0 ? freezeDelta : null;

      const decodeDelta = Number.isFinite(cur.totalDecodeTime) && Number.isFinite(prev.totalDecodeTime)
        ? cur.totalDecodeTime - prev.totalDecodeTime : null;
      if (Number.isFinite(decodeDelta) && decodeDelta >= 0 && decFramesDelta > 0) {
        out.decodeTimePerFrameMs = decodeDelta / decFramesDelta * 1000;
      }

      const renderedDelta = Number.isFinite(cur.framesRendered) && Number.isFinite(prev.framesRendered)
        ? cur.framesRendered-prev.framesRendered : null;
      if (Number.isFinite(renderedDelta) && renderedDelta>=0) {
        out.framesRenderedDelta=renderedDelta;
        if (dt>0) out.renderedFPSFromStats=renderedDelta/dt;
      }

      const processingDelta = Number.isFinite(cur.totalProcessingDelay) && Number.isFinite(prev.totalProcessingDelay)
        ? cur.totalProcessingDelay-prev.totalProcessingDelay : null;
      if (Number.isFinite(processingDelta) && processingDelta>=0 && decFramesDelta>0) {
        out.processingDelayPerFrameMs=processingDelta/decFramesDelta*1000;
      }

      if (Number.isFinite(renderedDelta) && renderedDelta>0) {
        const interDelta=Number.isFinite(cur.totalInterFrameDelay) && Number.isFinite(prev.totalInterFrameDelay)
          ? cur.totalInterFrameDelay-prev.totalInterFrameDelay : null;
        const interSqDelta=Number.isFinite(cur.totalSquaredInterFrameDelay) && Number.isFinite(prev.totalSquaredInterFrameDelay)
          ? cur.totalSquaredInterFrameDelay-prev.totalSquaredInterFrameDelay : null;
        if (Number.isFinite(interDelta) && interDelta>=0) {
          const meanSec=interDelta/renderedDelta;
          out.renderInterFrameMeanMs=meanSec*1000;
          if (Number.isFinite(interSqDelta) && interSqDelta>=0) {
            const varianceSec2=Math.max(0,interSqDelta/renderedDelta-meanSec*meanSec);
            out.renderInterFrameStdDevMs=Math.sqrt(varianceSec2)*1000;
          }
        }
      }

      const qpDelta=Number.isFinite(cur.qpSum) && Number.isFinite(prev.qpSum) ? cur.qpSum-prev.qpSum : null;
      if (Number.isFinite(qpDelta) && qpDelta>=0) {
        out.qpSumDelta=qpDelta;
        if (decFramesDelta>0) out.qpPerDecodedFrame=qpDelta/decFramesDelta;
      }

      const counterDelta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=b ? a-b : null;
      out.nackCountDelta=counterDelta(cur.nackCount,prev.nackCount);
      out.pliCountDelta=counterDelta(cur.pliCount,prev.pliCount);
      out.firCountDelta=counterDelta(cur.firCount,prev.firCount);
      out.retransmittedPacketsReceivedDelta=counterDelta(cur.retransmittedPacketsReceived,prev.retransmittedPacketsReceived);
      out.retransmittedBytesReceivedDelta=counterDelta(cur.retransmittedBytesReceived,prev.retransmittedBytesReceived);
      out.pauseCountDelta=counterDelta(cur.pauseCount,prev.pauseCount);

      const assembledDelta=counterDelta(cur.framesAssembledFromMultiplePackets,prev.framesAssembledFromMultiplePackets);
      out.framesAssembledFromMultiplePacketsDelta=assembledDelta;
      const assemblyTimeDelta=Number.isFinite(cur.totalAssemblyTime) && Number.isFinite(prev.totalAssemblyTime)
        ? cur.totalAssemblyTime-prev.totalAssemblyTime : null;
      if (Number.isFinite(assemblyTimeDelta) && assemblyTimeDelta>=0 && assembledDelta>0) {
        out.assemblyTimePerMultiPacketFrameMs=assemblyTimeDelta/assembledDelta*1000;
      }

      const countDelta = Number.isFinite(cur.jbCount) && Number.isFinite(prev.jbCount)
        ? cur.jbCount - prev.jbCount : 0;
      if (countDelta > 0) {
        const perFrame = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a >= b
          ? (a - b) / countDelta * 1000 : null;
        out.jitterBufferMs = perFrame(cur.jbDelay, prev.jbDelay);
        out.jitterBufferTargetMs = perFrame(cur.jbTargetDelay, prev.jbTargetDelay);
        out.jitterBufferMinimumMs = perFrame(cur.jbMinDelay, prev.jbMinDelay);
      }
    }
  }

  S.rtcPrev = cur;
  S.rtcLatest = out;
  S.rtcSource = raw.pcSource || S.rtcSource;

  if (out.codec && out.codec !== S.lastCodec) {
    addEvent('CODEC_CHANGE', { from: S.lastCodec, to: out.codec });
    S.lastCodec = out.codec;
  }
  if (out.inboundResolution && !sameRes(out.inboundResolution, S.lastInboundResolution)) {
    addEvent('INBOUND_RESOLUTION_CHANGE', { from: S.lastInboundResolution, to: out.inboundResolution });
    S.lastInboundResolution = out.inboundResolution;
  }
  if (out.pcState && out.pcState !== S.lastPcState) {
    addEvent('PEER_CONNECTION_STATE', { from: S.lastPcState, to: out.pcState, source: out.pcSource });
    S.lastPcState = out.pcState;
  }
  if ((out.freezeDelta || 0) > 0) addEvent('FREEZE_CHANGE', { delta: out.freezeDelta, total: out.freezeCount });
  if (out.bitrateSource && out.bitrateSource !== S.lastBitrateSource) {
    addEvent('BITRATE_SOURCE_CHANGE', { from:S.lastBitrateSource, to:out.bitrateSource, scope:out.bitrateScope, confidence:out.bitrateConfidence });
    S.lastBitrateSource=out.bitrateSource;
  }

  return out;
}

function stableReceiverTrackSettings(settings) {
  if (!settings) return null;
  return {
    width:settings.width ?? null,
    height:settings.height ?? null,
    aspectRatio:settings.aspectRatio ?? null,
    resizeMode:settings.resizeMode ?? null
  };
}

function stableContextView(snapshot) {
  return {
    sh:snapshot?.sessionHandler || null,
    pc:snapshot?.peerConnection || null,
    st:snapshot?.storage || null,
    receiverHints:snapshot?.receiverHints || null,
    receiverTrackSettings:stableReceiverTrackSettings(snapshot?.receiverTrackSettings)
  };
}

function clientStateEventView(snapshot) {
  const stable=stableContextView(snapshot);
  const observedFrameRate=snapshot?.receiverTrackSettings?.frameRate ?? null;
  return {
    sessionHandler:stable.sh,
    peerConnection:stable.pc,
    storage:stable.st,
    receiverHints:stable.receiverHints,
    receiverTrackSettings:stable.receiverTrackSettings,
    receiverTrackFrameRateObserved:observedFrameRate,
    receiverTrackFrameRateCadenceTrusted:false
  };
}

async function refreshContext(force = false) {
  if (!S.bridgeReady) return 0;
  if (!force && now() - S.lastContextAt < CONTEXT_MS) return 0;
  S.lastContextAt = now();
  const wallStart = now();
  const r = await bridgeAsk('context', null, 600);
  if (!r?.ok || !r.snapshot) return now() - wallStart;
  S.contextLatest = r.snapshot;

  const observedFrameRate=Number(r.snapshot.receiverTrackSettings?.frameRate);
  if (Number.isFinite(observedFrameRate)) {
    S.contextTelemetry.frameRateSamples++;
    S.contextTelemetry.lastObservedFrameRate=observedFrameRate;
    if (observedFrameRate < 1 || observedFrameRate > 240) S.contextTelemetry.implausibleFrameRateSamples++;
  }

  const stableView=stableContextView(r.snapshot);
  const fingerprint=JSON.stringify(stableView);
  const rawFingerprint=JSON.stringify({stableView,frameRate:r.snapshot.receiverTrackSettings?.frameRate ?? null});
  if (S.contextRawFingerprint && rawFingerprint !== S.contextRawFingerprint && fingerprint === S.contextFingerprint) {
    S.contextTelemetry.suppressedFrameRateOnly++;
  }
  S.contextRawFingerprint=rawFingerprint;

  if (fingerprint !== S.contextFingerprint) {
    addEvent('CLIENT_STATE_CHANGE', clientStateEventView(r.snapshot));
    S.contextTelemetry.changes++;
    S.contextFingerprint = fingerprint;
  }
  return now() - wallStart;
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

function currentExperimentPhase() {
  return S.experimentManager.phases.find(p => p.id === S.experimentManager.currentPhaseId) || null;
}

function closeExperimentPhase(reason = 'NEXT_PHASE') {
  const p = currentExperimentPhase();
  if (p && p.endAtSec == null) {
    p.endAtSec = round(elapsed(), 3);
    p.endReason = reason;
    if (S.control.proof && p.kind === 'VIRTUAL_MONITOR') p.proofFinal = { ...S.control.proof };
    addEvent('EXPERIMENT_PHASE_END', { id:p.id, label:p.label, reason, proofFinal:p.proofFinal || null });
  }
}

function beginExperimentPhase(label, kind, requestedResolution = null, meta = {}) {
  closeExperimentPhase('NEXT_PHASE');
  const id = `E${++S.experimentManager.seq}`;
  const p = {
    id, label, kind,
    startAtSec: round(elapsed(), 3),
    endAtSec: null,
    requestedResolution,
    application: meta.application || null,
    frozen: meta.frozen || S.control.frozen || null,
    proofFinal: null
  };
  S.experimentManager.phases.push(p);
  S.experimentManager.currentPhaseId = id;
  addEvent('EXPERIMENT_PHASE_START', { ...p });
  return p;
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
    inboundResolution: latest.inboundResolution || S.lastInboundResolution || null,
    renderedResolution: latest.renderedResolution || S.videoState.rendered || null
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
    addEvent('CONTROL_IDEMPOTENT_NOOP',{action:'APPLY',mode,target,reason:'IDENTICAL_TARGET_ALREADY_ACTIVE',phaseId:S.experimentManager.currentPhaseId});
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
    const label=target ? `RES_${target.width}x${target.height}` : 'RES_NATIVE';
    const phase=beginExperimentPhase(label,'VIRTUAL_MONITOR',target,{application:result,frozen:S.control.frozen});
    addEvent('CONTROL_APPLIED', { scope:'STREAM_CONFIG', mode, target, result, phaseId:phase.id, fpsRequested:Number(lsGet(K.fps,'120')) === 60 ? 60 : 120, bitrateRequestedMbps:lsGet(K.bitrateAuto,'true') !== 'false' ? null : (Number(lsGet(K.bitrateManual,'0')) || null) });
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
  closeExperimentPhase('DISARM_TO_SAFE');
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
  const p=beginExperimentPhase(`BASELINE_RETURN_${S.experimentManager.seq+1}`,'BASELINE_RETURN',null,{frozen:S.control.frozen});
  addEvent('CONTROL_DISARMED', { previous, result, phaseId:p.id, preferencesPreserved:true });
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

function validateExperimentIsolation(sample) {
  if (S.control.state !== 'ACTIVE' || !S.control.frozen) return;
  const F=S.control.frozen;
  const issues=[];
  if (!S.control.fpsApplication && Number.isFinite(F.targetFps) && Number.isFinite(sample.targetFps) && Math.abs(F.targetFps-sample.targetFps) > 0.5) {
    issues.push({type:'FPS_TARGET_DRIFT',from:F.targetFps,to:sample.targetFps});
  }
  if (typeof F.bitrateAuto === 'boolean' && F.bitrateAuto !== sample.bitrateAuto) {
    issues.push({type:'BITRATE_MODE_DRIFT',from:F.bitrateAuto,to:sample.bitrateAuto});
  }
  if (!F.bitrateAuto && Number.isFinite(F.bitratePreferenceMbps) && Number.isFinite(sample.targetBitrateMbps) && F.bitratePreferenceMbps !== sample.targetBitrateMbps) {
    issues.push({type:'BITRATE_PREFERENCE_DRIFT',from:F.bitratePreferenceMbps,to:sample.targetBitrateMbps});
  }
  if (F.codec && sample.codec && String(F.codec).toLowerCase() !== String(sample.codec).toLowerCase()) {
    issues.push({type:'CODEC_DRIFT',from:F.codec,to:sample.codec});
  }
  if (!issues.length) { S.control.confoundSignature=''; return; }
  const sig=JSON.stringify(issues);
  if (sig === S.control.confoundSignature) return;
  S.control.confoundSignature=sig;
  addEvent('EXPERIMENT_CONFOUND',{phaseId:S.experimentManager.currentPhaseId,issues,telemetry:compactTelemetry(sample)});
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

function compactTelemetry(s) {
  if (!s) return null;
  return {
    t: s.t,
    phase: s.phase,
    experimentPhaseId: s.experimentPhaseId,
    experimentPhaseLabel: s.experimentPhaseLabel,
    controlState: s.controlState,
    measurementEligible: s.measurementEligible,
    measurementIneligibleReason: s.measurementIneligibleReason,
    resolutionRequested: s.resolutionRequested,
    resolutionProofStatus: s.resolutionProofStatus,
    codec: s.codec,
    inboundResolution: s.inboundResolution,
    renderedResolution: s.renderedResolution,
    controlRequestedFps: s.controlRequestedFps,
    targetFps: s.targetFps,
    targetFpsSource: s.targetFpsSource,
    presentedFPS: s.presentedFPS,
    rtcFPS: s.rtcFPS,
    receivedFPS: s.receivedFPS,
    decodedFPS: s.decodedFPS,
    targetBitrateMbps: s.targetBitrateMbps,
    deepAnalyzerEnabled: s.deepAnalyzerEnabled,
    callbackHz: s.callbackHz,
    framesPerCallback: s.framesPerCallback,
    bitrateMbps: s.bitrateMbps,
    bitrateSource:s.bitrateSource,
    bitrateScope:s.bitrateScope,
    bitrateConfidence:s.bitrateConfidence,
    networkJitterMs: s.networkJitterMs,
    rttMs: s.rttMs,
    packetLossPercent: s.packetLossPercent,
    packetsLostDelta: s.packetsLostDelta,
    jitterBufferMs: s.jitterBufferMs,
    jitterBufferTargetMs: s.jitterBufferTargetMs,
    decodeTimePerFrameMs: s.decodeTimePerFrameMs,
    processingDelayPerFrameMs:s.processingDelayPerFrameMs,
    framesDroppedDelta: s.framesDroppedDelta,
    framesRenderedDelta:s.framesRenderedDelta,
    playbackDroppedVideoFramesDelta:s.playbackDroppedVideoFramesDelta,
    qpPerDecodedFrame:s.qpPerDecodedFrame,
    nackCountDelta:s.nackCountDelta,
    pliCountDelta:s.pliCountDelta,
    firCountDelta:s.firCountDelta,
    freezeDelta: s.freezeDelta
  };
}

function correlateAnomalies(sample) {
  if (sample.phase !== 'STEADY_STATE' || sample.measurementEligible === false) return;
  const triggers = [];
  if ((sample.freezeDelta || 0) > 0) triggers.push('FREEZE');
  if ((sample.framesDroppedDelta || 0) > 0) triggers.push('FRAME_DROP');
  if ((sample.packetsLostDelta || 0) > 0) triggers.push('PACKET_LOSS');

  const target = sample.targetFps;
  if (Number.isFinite(target) && target > 0) {
    if (Number.isFinite(sample.decodedFPS) && sample.decodedFPS < target * 0.75) triggers.push('DECODE_FPS_DROP');
    if (Number.isFinite(sample.presentedFPS) && sample.presentedFPS < target * 0.75) triggers.push('PRESENTED_FPS_DROP');
  }
  if (!triggers.length) return;

  const signature = triggers.join('|');
  if (signature === S.lastAnomalySignature && sample.t - S.lastAnomalyAt < 2) return;
  S.lastAnomalySignature = signature;
  S.lastAnomalyAt = sample.t;
  addEvent('STREAM_ANOMALY', { triggers, telemetry: compactTelemetry(sample) });
}


// -----------------------------------------------------------------------------
// LONG SESSION STABILITY TELEMETRY
// Bounded, low-frequency observability for multi-hour sessions. This is not a
// memory-leak detector by itself: every signal remains capability-aware.
// -----------------------------------------------------------------------------
function longSessionId(prefix='ls') {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch {}
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

function longSessionCheckpointKey(sessionId, seq) {
  return `${sessionId}:${String(seq).padStart(8,'0')}`;
}

function idbRequest(req) {
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error || new Error('IDB_REQUEST_FAILED'));
  });
}

function idbTransactionDone(tx) {
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error || new Error('IDB_TRANSACTION_FAILED'));
    tx.onabort=()=>reject(tx.error || new Error('IDB_TRANSACTION_ABORTED'));
  });
}

function openLongSessionDb() {
  return new Promise((resolve,reject)=>{
    if (typeof indexedDB === 'undefined') return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    const req=indexedDB.open(LONG_SESSION_DB_NAME,LONG_SESSION_DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if (!db.objectStoreNames.contains(LONG_SESSION_SESSION_STORE)) {
        db.createObjectStore(LONG_SESSION_SESSION_STORE,{keyPath:'id'});
      }
      if (!db.objectStoreNames.contains(LONG_SESSION_CHECKPOINT_STORE)) {
        const store=db.createObjectStore(LONG_SESSION_CHECKPOINT_STORE,{keyPath:'key'});
        store.createIndex('sessionId','sessionId',{unique:false});
        store.createIndex('capturedAtMs','capturedAtMs',{unique:false});
      } else {
        const store=req.transaction.objectStore(LONG_SESSION_CHECKPOINT_STORE);
        if (!store.indexNames.contains('sessionId')) store.createIndex('sessionId','sessionId',{unique:false});
        if (!store.indexNames.contains('capturedAtMs')) store.createIndex('capturedAtMs','capturedAtMs',{unique:false});
      }
    };
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>{ try { db.close(); } catch {} };
      resolve(db);
    };
    req.onerror=()=>reject(req.error || new Error('INDEXEDDB_OPEN_FAILED'));
    req.onblocked=()=>reject(new Error('INDEXEDDB_OPEN_BLOCKED'));
  });
}

async function idbGetSession(db,id) {
  const tx=db.transaction(LONG_SESSION_SESSION_STORE,'readonly');
  return idbRequest(tx.objectStore(LONG_SESSION_SESSION_STORE).get(id));
}

async function idbGetAllSessions(db) {
  const tx=db.transaction(LONG_SESSION_SESSION_STORE,'readonly');
  return idbRequest(tx.objectStore(LONG_SESSION_SESSION_STORE).getAll());
}

async function idbGetSessionCheckpoints(db,sessionId) {
  const tx=db.transaction(LONG_SESSION_CHECKPOINT_STORE,'readonly');
  const store=tx.objectStore(LONG_SESSION_CHECKPOINT_STORE);
  const index=store.index('sessionId');
  const rows=await idbRequest(index.getAll(IDBKeyRange.only(sessionId)));
  return (rows||[]).sort((a,b)=>(a.seq||0)-(b.seq||0));
}

async function idbDeleteSession(db,sessionId) {
  const tx=db.transaction([LONG_SESSION_SESSION_STORE,LONG_SESSION_CHECKPOINT_STORE],'readwrite');
  const done=idbTransactionDone(tx);
  tx.objectStore(LONG_SESSION_SESSION_STORE).delete(sessionId);
  const store=tx.objectStore(LONG_SESSION_CHECKPOINT_STORE);
  const index=store.index('sessionId');
  await new Promise((resolve,reject)=>{
    const req=index.openKeyCursor(IDBKeyRange.only(sessionId));
    req.onsuccess=()=>{
      const cursor=req.result;
      if (!cursor) return resolve();
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    req.onerror=()=>reject(req.error || new Error('IDB_DELETE_CURSOR_FAILED'));
  });
  await done;
}

async function pruneLongSessionPersistence(db,currentSessionId) {
  const p=S.longSession.persistence;
  try {
    const sessions=(await idbGetAllSessions(db) || [])
      .filter(x=>x?.id && x.id!==currentSessionId)
      .sort((a,b)=>(b.lastSeenAtMs||0)-(a.lastSeenAtMs||0));
    const remove=sessions.slice(Math.max(0,LONG_SESSION_MAX_PERSISTED_SESSIONS-1));
    for (const meta of remove) await idbDeleteSession(db,meta.id);
  } catch (e) {
    p.pruneErrors++;
    addEvent('LONG_SESSION_PERSISTENCE_PRUNE_ERROR',{message:String(e?.message||e).slice(0,160)});
  }
}

async function putLongSessionMeta(meta) {
  const db=S.longSession.persistence.db;
  if (!db) return false;
  const tx=db.transaction(LONG_SESSION_SESSION_STORE,'readwrite');
  const done=idbTransactionDone(tx);
  tx.objectStore(LONG_SESSION_SESSION_STORE).put(meta);
  await done;
  return true;
}

async function createLongSessionPersistenceSession(reason='NEW_SESSION') {
  const p=S.longSession.persistence;
  const nowWall=Date.now();
  const id=longSessionId('bcsls');
  const pageInstanceId=longSessionId('page');
  const meta={
    id,
    schemaVersion:1,
    version:VERSION,
    build:BUILD,
    origin:location.origin,
    startedAtMs:nowWall,
    startedAt:new Date(nowWall).toISOString(),
    lastSeenAtMs:nowWall,
    lastSeenAt:new Date(nowWall).toISOString(),
    lastCheckpointAtMs:null,
    lastCheckpointAt:null,
    nextSeq:0,
    pageInstanceCount:1,
    lastPageInstanceId:pageInstanceId,
    lab:S.lab,
    status:'ACTIVE',
    createReason:reason
  };
  await putLongSessionMeta(meta);
  lsSet(LONG_SESSION_ACTIVE_KEY,id);
  p.sessionId=id;
  p.pageInstanceId=pageInstanceId;
  p.startedAtMs=nowWall;
  p.nextSeq=0;
  p.resumed=false;
  p.recoveredCheckpointCount=0;
  p.persistedCheckpointCount=0;
  p.lastPersistAtMs=null;
  p.lastPersistReason=null;
  p.mode='INDEXEDDB_NEW';
  return meta;
}

async function initLongSessionPersistence() {
  const p=S.longSession.persistence;
  if (p.ready) return true;
  if (p.initInFlight) return p.initInFlight;
  p.initInFlight=(async()=>{
    if (!p.eligible) {
      p.mode='NOT_STREAM_DOCUMENT';
      p.ready=true;
      return false;
    }
    if (!p.supported) {
      p.mode='RAM_ONLY_INDEXEDDB_UNAVAILABLE';
      p.ready=true;
      addEvent('LONG_SESSION_PERSISTENCE_UNAVAILABLE',{reason:'INDEXEDDB_UNAVAILABLE'});
      return false;
    }
    try {
      const db=await openLongSessionDb();
      p.db=db;
      const activeId=lsGet(LONG_SESSION_ACTIVE_KEY,null);
      let meta=activeId ? await idbGetSession(db,activeId) : null;
      const nowWall=Date.now();
      const resumable=!!meta &&
        meta.version===VERSION &&
        meta.origin===location.origin &&
        Number.isFinite(meta.lastSeenAtMs) &&
        nowWall-meta.lastSeenAtMs>=0 &&
        nowWall-meta.lastSeenAtMs<=LONG_SESSION_RESUME_WINDOW_MS;

      if (resumable) {
        const rows=await idbGetSessionCheckpoints(db,meta.id);
        const retained=rows.slice(-MAX_LONG_SESSION_CHECKPOINTS);
        S.longSession.checkpoints.clear();
        for (const row of retained) if (row?.checkpoint) S.longSession.checkpoints.push(row.checkpoint);
        const pageInstanceId=longSessionId('page');
        meta.lastSeenAtMs=nowWall;
        meta.lastSeenAt=new Date(nowWall).toISOString();
        meta.pageInstanceCount=(meta.pageInstanceCount||0)+1;
        meta.lastPageInstanceId=pageInstanceId;
        meta.status='ACTIVE';
        await putLongSessionMeta(meta);
        p.sessionId=meta.id;
        p.pageInstanceId=pageInstanceId;
        p.startedAtMs=meta.startedAtMs;
        p.nextSeq=Math.max(Number(meta.nextSeq)||0,rows.length ? (rows[rows.length-1].seq||0)+1 : 0);
        p.resumed=true;
        p.recoveredCheckpointCount=retained.length;
        p.persistedCheckpointCount=retained.length;
        p.mode='INDEXEDDB_RESUMED';
        addEvent('LONG_SESSION_PERSISTENCE_RECOVERED',{
          sessionId:meta.id,
          recoveredCheckpointCount:retained.length,
          pageInstanceCount:meta.pageInstanceCount,
          gapMs:nowWall-(meta.lastCheckpointAtMs||meta.lastSeenAtMs||nowWall)
        });
      } else {
        if (meta?.id) {
          try {
            meta.status='STALE_NOT_RESUMED';
            meta.lastSeenAtMs=nowWall;
            meta.lastSeenAt=new Date(nowWall).toISOString();
            await putLongSessionMeta(meta);
          } catch {}
        }
        meta=await createLongSessionPersistenceSession(activeId ? 'ACTIVE_SESSION_NOT_RESUMABLE' : 'NO_ACTIVE_SESSION');
        addEvent('LONG_SESSION_PERSISTENCE_STARTED',{sessionId:meta.id,mode:p.mode});
      }
      await pruneLongSessionPersistence(db,p.sessionId);
      p.ready=true;
      return true;
    } catch (e) {
      p.readErrors++;
      p.mode='RAM_ONLY_INDEXEDDB_ERROR';
      p.ready=true;
      addEvent('LONG_SESSION_PERSISTENCE_ERROR',{stage:'INIT',message:String(e?.message||e).slice(0,180)});
      return false;
    } finally {
      p.initInFlight=null;
    }
  })();
  return p.initInFlight;
}

async function persistLongSessionCheckpoint(checkpoint,reason='TIMER') {
  const p=S.longSession.persistence;
  if (!p.ready) await initLongSessionPersistence();
  if (!p.db || !p.sessionId || !checkpoint) return false;
  const capturedAtMs=Number.isFinite(checkpoint.capturedAtMs) ? checkpoint.capturedAtMs : Date.now();
  const seq=p.nextSeq++;
  checkpoint.persistence={
    schemaVersion:1,
    sessionId:p.sessionId,
    pageInstanceId:p.pageInstanceId,
    seq,
    capturedAtMs,
    capturedAt:new Date(capturedAtMs).toISOString(),
    logicalElapsedSec:Number.isFinite(p.startedAtMs) ? round((capturedAtMs-p.startedAtMs)/1000,3) : null,
    pageElapsedSec:checkpoint.t,
    resumedSession:p.resumed,
    reason
  };
  const row={
    key:longSessionCheckpointKey(p.sessionId,seq),
    sessionId:p.sessionId,
    seq,
    capturedAtMs,
    checkpoint
  };
  try {
    // Read metadata before opening the write transaction. Awaiting inside a live
    // IndexedDB transaction can let the browser auto-commit it between tasks.
    const meta=await idbGetSession(p.db,p.sessionId);
    const nextMeta={
      ...(meta||{}),
      id:p.sessionId,
      schemaVersion:1,
      version:VERSION,
      build:BUILD,
      origin:location.origin,
      startedAtMs:p.startedAtMs,
      startedAt:Number.isFinite(p.startedAtMs) ? new Date(p.startedAtMs).toISOString() : null,
      lastSeenAtMs:capturedAtMs,
      lastSeenAt:new Date(capturedAtMs).toISOString(),
      lastCheckpointAtMs:capturedAtMs,
      lastCheckpointAt:new Date(capturedAtMs).toISOString(),
      nextSeq:p.nextSeq,
      lastPageInstanceId:p.pageInstanceId,
      pageInstanceCount:Math.max(1,meta?.pageInstanceCount||1),
      lab:S.lab,
      status:'ACTIVE'
    };
    const tx=p.db.transaction([LONG_SESSION_SESSION_STORE,LONG_SESSION_CHECKPOINT_STORE],'readwrite');
    const done=idbTransactionDone(tx);
    const cpStore=tx.objectStore(LONG_SESSION_CHECKPOINT_STORE);
    const sessionStore=tx.objectStore(LONG_SESSION_SESSION_STORE);
    cpStore.put(row);
    const expiredSeq=seq-MAX_LONG_SESSION_CHECKPOINTS;
    if (expiredSeq>=0) cpStore.delete(longSessionCheckpointKey(p.sessionId,expiredSeq));
    sessionStore.put(nextMeta);
    await done;
    p.persistedCheckpointCount=Math.min(MAX_LONG_SESSION_CHECKPOINTS,p.persistedCheckpointCount+1);
    p.lastPersistAtMs=capturedAtMs;
    p.lastPersistReason=reason;
    return true;
  } catch (e) {
    p.writeErrors++;
    addEvent('LONG_SESSION_PERSISTENCE_ERROR',{stage:'WRITE',reason,message:String(e?.message||e).slice(0,180)});
    return false;
  }
}

function longSessionPersistenceSnapshot() {
  const p=S.longSession.persistence;
  return {
    supported:p.supported,
    eligible:p.eligible,
    ready:p.ready,
    mode:p.mode,
    database:LONG_SESSION_DB_NAME,
    schemaVersion:1,
    sessionId:p.sessionId,
    pageInstanceId:p.pageInstanceId,
    startedAtMs:p.startedAtMs,
    startedAt:Number.isFinite(p.startedAtMs) ? new Date(p.startedAtMs).toISOString() : null,
    resumed:p.resumed,
    recoveredCheckpointCount:p.recoveredCheckpointCount,
    persistedCheckpointCount:p.persistedCheckpointCount,
    nextSeq:p.nextSeq,
    lastPersistAtMs:p.lastPersistAtMs,
    lastPersistAt:Number.isFinite(p.lastPersistAtMs) ? new Date(p.lastPersistAtMs).toISOString() : null,
    lastPersistReason:p.lastPersistReason,
    resumeWindowMs:LONG_SESSION_RESUME_WINDOW_MS,
    writeErrors:p.writeErrors,
    readErrors:p.readErrors,
    pruneErrors:p.pruneErrors,
    originScoped:true,
    note:'IndexedDB persistence is origin-scoped. A resumed session preserves prior page checkpoints when reload/crash returns to the same Boosteroid origin.'
  };
}

async function rotateLongSessionPersistence(reason='MANUAL_RESET') {
  const p=S.longSession.persistence;
  if (!p.ready) await initLongSessionPersistence();
  if (!p.db) return false;
  try {
    if (p.sessionId) {
      const meta=await idbGetSession(p.db,p.sessionId);
      if (meta) {
        meta.status='CLOSED';
        meta.closedAtMs=Date.now();
        meta.closedAt=new Date(meta.closedAtMs).toISOString();
        meta.closeReason=reason;
        await putLongSessionMeta(meta);
      }
    }
    lsRemove(LONG_SESSION_ACTIVE_KEY);
    await createLongSessionPersistenceSession(reason);
    await pruneLongSessionPersistence(p.db,p.sessionId);
    return true;
  } catch (e) {
    p.writeErrors++;
    addEvent('LONG_SESSION_PERSISTENCE_ERROR',{stage:'ROTATE',reason,message:String(e?.message||e).slice(0,180)});
    return false;
  }
}

function setupLongTaskObserver() {
  if (!CAP.experimental.longTask || S.longSession.longTaskObserver) return false;
  try {
    const obs=new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const d=Number(entry.duration);
        if (!Number.isFinite(d)) continue;
        S.longSession.longTasks.count++;
        S.longSession.longTasks.totalMs+=d;
        S.longSession.longTasks.maxMs=Math.max(S.longSession.longTasks.maxMs,d);
        S.longSession.longTasks.lastAtSec=round(elapsed(),3);
      }
    });
    obs.observe({type:'longtask',buffered:true});
    S.longSession.longTaskObserver=obs;
    return true;
  } catch (e) {
    addEvent('LONG_TASK_OBSERVER_UNAVAILABLE',{message:String(e?.message||e).slice(0,160)});
    return false;
  }
}

function setupComputePressureObserver() {
  if (!CAP.experimental.computePressure || S.longSession.pressureObserver) return false;
  try {
    const obs=new PressureObserver(records => {
      const r=records?.[records.length-1];
      if (!r) return;
      const state=typeof r.state==='string' ? r.state : null;
      if (state && state!==S.longSession.pressure.state) S.longSession.pressure.transitions++;
      S.longSession.pressure.state=state;
      S.longSession.pressure.lastAtSec=round(elapsed(),3);
    });
    Promise.resolve(obs.observe('cpu',{sampleInterval:10000})).catch(e=>{
      S.longSession.pressure.error=String(e?.message||e).slice(0,160);
    });
    S.longSession.pressureObserver=obs;
    return true;
  } catch (e) {
    S.longSession.pressure.error=String(e?.message||e).slice(0,160);
    return false;
  }
}

function readLegacyJsHeapMemory() {
  const m=performance.memory;
  if (!m) return null;
  const n=v=>Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    source:'performance.memory',
    usedJSHeapSize:n(m.usedJSHeapSize),
    totalJSHeapSize:n(m.totalJSHeapSize),
    jsHeapSizeLimit:n(m.jsHeapSizeLimit)
  };
}

async function refreshLongSessionMemory(nowMs) {
  const ls=S.longSession;
  const legacy=readLegacyJsHeapMemory();
  if (legacy) ls.latestMemory={...(ls.latestMemory||{}),legacy};

  if (!CAP.experimental.measureUserAgentSpecificMemory ||
      !CAP.experimental.crossOriginIsolated ||
      ls.memoryProbeInFlight ||
      nowMs-ls.lastMemoryProbeAtMs < LONG_SESSION_MEMORY_MS) return;

  ls.lastMemoryProbeAtMs=nowMs;
  ls.memoryProbeInFlight=true;
  try {
    const r=await performance.measureUserAgentSpecificMemory();
    ls.latestMemory={
      ...(ls.latestMemory||{}),
      userAgentSpecific:{
        source:'measureUserAgentSpecificMemory',
        bytes:Number.isFinite(r?.bytes) ? r.bytes : null,
        breakdownCount:Array.isArray(r?.breakdown) ? r.breakdown.length : null
      }
    };
  } catch (e) {
    ls.latestMemory={...(ls.latestMemory||{}),userAgentSpecific:{error:String(e?.message||e).slice(0,160)}};
  } finally {
    ls.memoryProbeInFlight=false;
  }
}

async function refreshLongSessionStorage(nowMs) {
  const ls=S.longSession;
  if (!CAP.experimental.storageEstimate ||
      nowMs-ls.lastStorageProbeAtMs < LONG_SESSION_STORAGE_MS) return;
  ls.lastStorageProbeAtMs=nowMs;
  try {
    const r=await navigator.storage.estimate();
    ls.latestStorage={
      usageBytes:Number.isFinite(r?.usage) ? r.usage : null,
      quotaBytes:Number.isFinite(r?.quota) ? r.quota : null
    };
  } catch (e) {
    ls.latestStorage={error:String(e?.message||e).slice(0,160)};
  }
}

function longSessionResourceSnapshot() {
  const pc=S.contextLatest?.peerConnection || null;
  return {
    bridgePending:bridgePending.size,
    retainedSamples:S.samples.count,
    overwrittenSamples:Math.max(0,S.samples.total-S.samples.count),
    retainedEvents:S.events.count,
    overwrittenEvents:Math.max(0,S.events.total-S.events.count),
    retainedImportantEvents:S.importantEvents.count,
    overwrittenImportantEvents:Math.max(0,S.importantEvents.total-S.importantEvents.count),
    clientStateChanges:S.contextTelemetry.changes,
    suppressedFrameRateOnlyStateChanges:S.contextTelemetry.suppressedFrameRateOnly,
    experimentPhases:S.experimentManager.phases.length,
    videoBindCount:S.longSession.videoBindCount,
    videoRemovedCount:S.longSession.videoRemovedCount,
    surfaceObserverBindCount:S.longSession.surfaceObserverBindCount,
    videoElements:document.querySelectorAll('video').length,
    iframeElements:document.querySelectorAll('iframe').length,
    canvasElements:document.querySelectorAll('canvas').length,
    peerConnectionResources:pc?.resources || null
  };
}

function buildLongSessionCheckpoint() {
  const s=S.latestSample;
  const lt=S.longSession.longTasks;
  const capturedAtMs=Date.now();
  const checkpoint={
    t:round(elapsed(),3),
    capturedAtMs,
    capturedAt:new Date(capturedAtMs).toISOString(),
    logicalElapsedSec:Number.isFinite(S.longSession.persistence.startedAtMs)
      ? round((capturedAtMs-S.longSession.persistence.startedAtMs)/1000,3)
      : null,
    streamActive:!!s?.streamActive,
    measurementEligible:s?.measurementEligible ?? null,
    phase:s?.phase ?? null,
    codec:s?.codec ?? S.lastCodec ?? null,
    inboundResolution:s?.inboundResolution ?? S.lastInboundResolution ?? null,
    rtcFPS:s?.rtcFPS ?? null,
    receivedFPS:s?.receivedFPS ?? null,
    decodedFPS:s?.decodedFPS ?? null,
    bitrateMbps:s?.bitrateMbps ?? null,
    bitrateSource:s?.bitrateSource ?? null,
    bitrateScope:s?.bitrateScope ?? null,
    bitrateConfidence:s?.bitrateConfidence ?? null,
    rttMs:s?.rttMs ?? null,
    networkJitterMs:s?.networkJitterMs ?? null,
    packetLossPercent:s?.packetLossPercent ?? null,
    jitterBufferMs:s?.jitterBufferMs ?? null,
    decodeTimePerFrameMs:s?.decodeTimePerFrameMs ?? null,
    processingDelayPerFrameMs:s?.processingDelayPerFrameMs ?? null,
    framesDroppedDelta:s?.framesDroppedDelta ?? null,
    freezeDelta:s?.freezeDelta ?? null,
    playbackDropPercent:s?.playbackDropPercent ?? null,
    decoderImplementation:s?.decoderImplementation ?? null,
    powerEfficientDecoder:s?.powerEfficientDecoder ?? null,
    suiteLocalWorkMs:s?.suiteLocalWorkMs ?? null,
    suiteCycleWallMs:s?.suiteCycleWallMs ?? null,
    memory:S.longSession.latestMemory,
    storage:S.longSession.latestStorage,
    computePressure:{...S.longSession.pressure},
    longTasks:{
      countTotal:lt.count,
      durationTotalMs:round(lt.totalMs,3),
      maxMs:round(lt.maxMs,3),
      countDelta:lt.count-lt.prevCount,
      durationDeltaMs:round(lt.totalMs-lt.prevTotalMs,3),
      lastAtSec:lt.lastAtSec
    },
    resources:longSessionResourceSnapshot()
  };
  lt.prevCount=lt.count;
  lt.prevTotalMs=lt.totalMs;
  return checkpoint;
}

async function collectLongSessionCheckpoint(reason='TIMER') {
  try {
    const nowMs=now();
    await Promise.all([
      refreshLongSessionMemory(nowMs),
      refreshLongSessionStorage(nowMs)
    ]);
    const checkpoint=buildLongSessionCheckpoint();
    checkpoint.reason=reason;
    S.longSession.checkpoints.push(checkpoint);
    await persistLongSessionCheckpoint(checkpoint,reason);
  } catch (e) {
    S.longSession.checkpointErrors++;
    addEvent('LONG_SESSION_CHECKPOINT_ERROR',{message:String(e?.message||e).slice(0,160)});
  }
}

function scheduleLongSessionCheckpoint(delay=LONG_SESSION_CHECKPOINT_MS) {
  if (!S.longSession.running) return;
  clearTimeout(S.longSession.timer);
  S.longSession.timer=setTimeout(async()=>{
    await collectLongSessionCheckpoint('TIMER');
    scheduleLongSessionCheckpoint(LONG_SESSION_CHECKPOINT_MS);
  },delay);
}

function bindLongSessionLifecyclePersistence() {
  const p=S.longSession.persistence;
  if (p.lifecycleBound) return;
  p.lifecycleBound=true;
  window.addEventListener('pagehide',()=>{ void collectLongSessionCheckpoint('PAGEHIDE'); },{capture:true});
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) void collectLongSessionCheckpoint('DOCUMENT_HIDDEN');
  },{passive:true});
}

async function startLongSessionMonitor() {
  if (S.longSession.running) return;
  S.longSession.running=true;
  setupLongTaskObserver();
  setupComputePressureObserver();
  bindLongSessionLifecyclePersistence();
  await initLongSessionPersistence();
  scheduleLongSessionCheckpoint(5000);
}

async function resetLongSessionTelemetry(newPersistentSession=false) {
  S.longSession.checkpoints.clear();
  S.longSession.lastMemoryProbeAtMs=-Infinity;
  S.longSession.lastStorageProbeAtMs=-Infinity;
  S.longSession.latestMemory=null;
  S.longSession.latestStorage=null;
  S.longSession.checkpointErrors=0;
  const lt=S.longSession.longTasks;
  lt.count=0; lt.totalMs=0; lt.maxMs=0; lt.lastAtSec=null; lt.prevCount=0; lt.prevTotalMs=0;
  S.longSession.videoBindCount=S.video ? 1 : 0;
  S.longSession.videoRemovedCount=0;
  S.longSession.surfaceObserverBindCount=S.surface.resizeObserver ? 1 : 0;
  if (newPersistentSession) await rotateLongSessionPersistence('RECORDING_RESET');
}

// -----------------------------------------------------------------------------
// SAMPLER / PERFORMANCE GUARD
// -----------------------------------------------------------------------------
async function sampleOnce() {
  const cycleStart = now();
  S.sampler.samplesAttempted++;

  let localWorkMs = 0;
  let syncStart = now();
  snapshotVideo();
  const playback=processPlaybackQuality(readPlaybackQuality());
  const surface = {
    rendered: S.surface.rendered,
    viewport: S.surface.viewport,
    orientation: S.surface.orientation,
    objectFit:S.surface.objectFit,
    objectPosition:S.surface.objectPosition
  };
  const sampleNow = now();
  const eligibility=measurementEligibility();
  const compositor = consumeCompositorSample(sampleNow);
  localWorkMs += now() - syncStart;

  const bridgeStart = now();
  const rawRtc = S.bridgeReady
    ? await bridgeAsk('stats', null, 850)
    : { ok: false, error: 'BRIDGE_NOT_READY' };
  const bridgeStatsWallMs = S.bridgeReady ? now() - bridgeStart : 0;

  syncStart = now();
  const rtc = processRtc(rawRtc, sampleNow);
  localWorkMs += now() - syncStart;

  const contextWallMs = await refreshContext(false) || 0;

  syncStart = now();
  const control = controlSnapshot();
  const target = resolveTargetFps(control);
  const sample = {
    t: round(elapsed(), 3),
    phase: S.phase.current,
    streamActive: !!S.video && (S.video.readyState || 0) >= 2,
    lab: S.lab,
    network: S.network,
    networkAuto: detectNetworkAuto(),
    mode: S.mode,
    controlState: S.control.state,
    measurementEligible: eligibility.eligible,
    measurementIneligibleReason: eligibility.reason,
    experimentPhaseId: S.experimentManager.currentPhaseId,
    experimentPhaseLabel: currentExperimentPhase()?.label || null,
    resolutionPreferenceMode: lsGet(K.resolutionMode,'native'),
    resolutionRequested: S.control.activeTarget,
    resolutionProofStatus: S.control.proof?.status || 'IDLE',

    videoResolution: S.videoState.resolution,
    renderedResolution: S.videoState.rendered,
    intrinsicVideoCssPx: S.videoState.resolution,
    elementBoxCssPx: S.videoState.rendered,
    rvfcMediaFramePx: S.deep.enabled && Number.isFinite(S.deep.enabledAtSec) && Number.isFinite(S.lastFrameAt) && S.lastFrameAt>=S.deep.enabledAtSec ? S.videoState.rvfcMediaFrame : null,
    objectFit: surface.objectFit,
    objectPosition: surface.objectPosition,
    elementBoxToIntrinsicScaleX: S.videoState.resolution?.width>0 && S.videoState.rendered?.width>0 ? round(S.videoState.rendered.width/S.videoState.resolution.width,6) : null,
    elementBoxToIntrinsicScaleY: S.videoState.resolution?.height>0 && S.videoState.rendered?.height>0 ? round(S.videoState.rendered.height/S.videoState.resolution.height,6) : null,
    viewport: surface.viewport,
    orientation: surface.orientation,
    videoReadyState: S.videoState.readyState,
    playbackQualityAvailable: playback.available,
    playbackTotalVideoFramesRaw: playback.totalVideoFramesRaw,
    playbackDroppedVideoFramesRaw: playback.droppedVideoFramesRaw,
    playbackTotalVideoFramesDelta: playback.totalVideoFramesDelta,
    playbackDroppedVideoFramesDelta: playback.droppedVideoFramesDelta,
    playbackDropPercent: round(playback.dropPercent,5),

    presentedFPS: compositor.presentedFPS,
    presentedFramesDelta: compositor.presentedFramesDelta,
    callbackHz: compositor.callbackHz,
    callbackCountDelta: compositor.callbackCountDelta,
    callbackIntervalMeanMs: compositor.callbackIntervalMeanMs,
    callbackJitterMs: compositor.callbackJitterMs,
    callbackIntervalMinMs: compositor.callbackIntervalMinMs,
    callbackIntervalMaxMs: compositor.callbackIntervalMaxMs,
    framesPerCallback: compositor.framesPerCallback,
    multiFrameCallbacks: compositor.multiFrameCallbacks,
    processingDurationMs: compositor.processingDurationMs,
    callbackLatenessMs: compositor.callbackLatenessMs,
    compositorRegimeHz: compositor.compositorRegimeHz,
    deepAnalyzerEnabled: S.deep.enabled,
    deepCallbackWorkCountDelta: compositor.deepCallbackWorkCountDelta,
    deepCallbackWorkTotalMs: compositor.deepCallbackWorkTotalMs,
    deepCallbackWorkAvgMs: compositor.deepCallbackWorkAvgMs,

    pcSource: rtc?.pcSource ?? null,
    pcState: rtc?.pcState ?? null,
    codec: rtc?.codec ?? S.lastCodec,
    inboundResolution: rtc?.inboundResolution ?? S.lastInboundResolution,
    inboundFramePx: rtc?.inboundResolution ?? S.lastInboundResolution,
    receiverTrackSettings: S.contextLatest?.receiverTrackSettings || null,
    rtcFPS: round(rtc?.rtcFPS, 3),
    receivedFPS: round(rtc?.receivedFPS, 3),
    decodedFPS: round(rtc?.decodedFPS, 3),
    bitrateMbps: round(rtc?.bitrateMbps, 3),
    bitrateSource:rtc?.bitrateSource ?? null,
    bitrateScope:rtc?.bitrateScope ?? null,
    bitrateConfidence:rtc?.bitrateConfidence ?? null,
    networkJitterMs: round(rtc?.networkJitterMs, 3),
    rttMs: round(rtc?.rttMs, 3),
    availableIncomingMbps: round(rtc?.availableIncomingMbps, 3),
    packetsReceivedDelta: rtc?.packetsReceivedDelta ?? null,
    packetsLostDelta: rtc?.packetsLostDelta ?? null,
    packetsLostRaw: rtc?.packetsLostRaw ?? null,
    packetLossPercent: round(rtc?.packetLossPercent, 5),
    packetsDiscardedRaw: rtc?.packetsDiscardedRaw ?? null,
    jitterBufferMs: round(rtc?.jitterBufferMs, 3),
    jitterBufferTargetMs: round(rtc?.jitterBufferTargetMs, 3),
    jitterBufferMinimumMs: round(rtc?.jitterBufferMinimumMs, 3),
    framesReceivedRaw: rtc?.framesReceivedRaw ?? null,
    framesDecodedRaw: rtc?.framesDecodedRaw ?? null,
    framesDroppedRaw: rtc?.framesDroppedRaw ?? null,
    framesDroppedDelta: rtc?.framesDroppedDelta ?? null,
    framesRenderedRaw: rtc?.framesRenderedRaw ?? null,
    framesRenderedDelta: rtc?.framesRenderedDelta ?? null,
    renderedFPSFromStats: round(rtc?.renderedFPSFromStats,3),
    decodeTimePerFrameMs: round(rtc?.decodeTimePerFrameMs, 3),
    processingDelayPerFrameMs: round(rtc?.processingDelayPerFrameMs,3),
    renderInterFrameMeanMs: round(rtc?.renderInterFrameMeanMs,3),
    renderInterFrameStdDevMs: round(rtc?.renderInterFrameStdDevMs,3),
    qpSumRaw: rtc?.qpSumRaw ?? null,
    qpSumDelta: rtc?.qpSumDelta ?? null,
    qpPerDecodedFrame: round(rtc?.qpPerDecodedFrame,4),
    nackCountRaw: rtc?.nackCountRaw ?? null,
    nackCountDelta: rtc?.nackCountDelta ?? null,
    pliCountRaw: rtc?.pliCountRaw ?? null,
    pliCountDelta: rtc?.pliCountDelta ?? null,
    firCountRaw: rtc?.firCountRaw ?? null,
    firCountDelta: rtc?.firCountDelta ?? null,
    retransmittedPacketsReceivedRaw: rtc?.retransmittedPacketsReceivedRaw ?? null,
    retransmittedPacketsReceivedDelta: rtc?.retransmittedPacketsReceivedDelta ?? null,
    retransmittedBytesReceivedRaw: rtc?.retransmittedBytesReceivedRaw ?? null,
    retransmittedBytesReceivedDelta: rtc?.retransmittedBytesReceivedDelta ?? null,
    framesAssembledFromMultiplePacketsRaw: rtc?.framesAssembledFromMultiplePacketsRaw ?? null,
    framesAssembledFromMultiplePacketsDelta: rtc?.framesAssembledFromMultiplePacketsDelta ?? null,
    assemblyTimePerMultiPacketFrameMs: round(rtc?.assemblyTimePerMultiPacketFrameMs,3),
    pauseCountRaw: rtc?.pauseCountRaw ?? null,
    pauseCountDelta: rtc?.pauseCountDelta ?? null,
    totalPausesDuration: rtc?.totalPausesDuration ?? null,
    freezeCount: rtc?.freezeCount ?? null,
    freezeDelta: rtc?.freezeDelta ?? null,
    decoderImplementation: rtc?.decoderImplementation ?? null,
    powerEfficientDecoder: rtc?.powerEfficientDecoder ?? null,

    targetFps: target.value,
    targetFpsSource: target.source,
    controlRequestedFps: control.fpsRequested,
    targetBitrateMbps: control.bitrateRequestedMbps,
    bitrateAuto: control.bitrateAuto,
    resolutionMode: control.preferenceMode,
    receiverHints: S.contextLatest?.receiverHints || null
  };

  classifyPhase(sample);
  evaluateResolutionProof(sample);
  validateExperimentIsolation(sample);
  sample.resolutionProofStatus = S.control.proof?.status || sample.resolutionProofStatus;
  correlateAnomalies(sample);
  localWorkMs += now() - syncStart;

  const beforeUi = now();
  if (S.ui.open) updateUI(sample);
  const uiCostMs = S.ui.open ? now() - beforeUi : 0;
  const cycleWallMs = now() - cycleStart;

  S.sampler.lastCycleWallMs = cycleWallMs;
  S.sampler.lastLocalWorkMs = localWorkMs;
  S.sampler.lastBridgeStatsWallMs = bridgeStatsWallMs;
  S.sampler.lastContextWallMs = contextWallMs;
  S.sampler.lastUiCostMs = uiCostMs;

  sample.suiteCycleWallMs = round(cycleWallMs, 3);
  sample.suiteLocalWorkMs = round(localWorkMs, 3);
  sample.suiteBridgeStatsWallMs = round(bridgeStatsWallMs, 3);
  sample.suiteContextWallMs = round(contextWallMs, 3);
  sample.suiteUiCostMs = round(uiCostMs, 3);

  S.latestSample=sample;
  if (S.recording) S.samples.push(sample);
  if (S.measurement.resumeGraceSamples > 0) S.measurement.resumeGraceSamples--;
  if (cycleWallMs >= SAMPLE_MS) S.sampler.skipped++;
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

function resetFrameSessionStats() {
  const f = S.frame;
  f.histogram.fill(0);
  f.histCount = 0;
  f.histSum = 0;
  f.histSumSq = 0;
  f.histMin = Infinity;
  f.histMax = 0;
  f.prevSamplePresentedFrames = f.lastPresentedFrames;
  f.prevSampleCallbacks = f.callbacks;
  f.prevSampleTime = now();
  f.regime = null;
  f.regimeCandidate = null;
  f.regimeCandidateCount = 0;
  S.deep.prevSampleCallbacksProcessed=S.deep.callbacksProcessed;
  S.deep.prevSampleWorkTotalMs=S.deep.callbackWorkTotalMs;
}

async function startRecording() {
  // v0.8: recording/Analyzer lifecycle must never disarm or rewrite Stream Control.
  S.samples.clear();
  S.events.clear();
  S.importantEvents.clear();
  resetInputProbeTelemetry(true);
  S.contextFingerprint='';
  S.contextRawFingerprint='';
  S.contextTelemetry={changes:0,suppressedFrameRateOnly:0,frameRateSamples:0,implausibleFrameRateSamples:0,lastObservedFrameRate:null};
  S.lastBitrateSource=null;
  S.latestSample=null;
  await resetLongSessionTelemetry(true);
  S.sessionStartPerf = now();
  S.sessionStartDate = new Date();
  S.recording = true;
  S.firstVideoAt = S.video ? 0 : null;
  S.firstMetadataAt = S.video && S.video.readyState >= 1 ? 0 : null;
  S.firstPlayingAt = S.video && !S.video.paused && S.video.readyState >= 2 ? 0 : null;
  S.firstFrameAt = null;
  S.lastFrameAt = null;
  S.rtcPrev = null;
  S.measurement.hidden=!!document.hidden;
  S.measurement.videoPaused=!!S.video?.paused;
  S.measurement.resumeGraceSamples=0;
  S.measurement.lastReanchorReason=null;
  S.measurement.lastReanchorAtSec=null;
  S.phase.current = 'PRE_STREAM';
  S.phase.startupAtSec = null;
  S.phase.steadyAtSec = null;
  S.phase.stableCount = 0;
  S.lastAnomalySignature = '';
  S.lastAnomalyAt = -Infinity;
  S.experimentManager={seq:0,currentPhaseId:'E0',phases:[{id:'E0',label:'BASELINE',kind:'BASELINE',startAtSec:0,endAtSec:null,requestedResolution:null,application:null,proofFinal:null}]};
  resetFrameSessionStats();
  resetDeepPerformanceStats();
  if (S.deep.enabled) scheduleDeepFrameLoop(S.video);
  surfaceSnapshot('RECORDING_START', false);
  addEvent('RECORDING_START', { version: VERSION, build: BUILD, lab: S.lab, network: S.network, mode: S.mode, controlPreserved:true, deepAnalyzer:S.deep.enabled });
  updateUI();
}

function stopRecording(reason = 'USER') {
  if (!S.recording) return;
  if (S.deep.enabled) setDeepAnalyzerEnabled(false, `RECORDING_STOP_${reason}`);
  addEvent('RECORDING_STOP', { reason, controlPreserved:true });
  S.recording = false;
  updateUI();
}

// -----------------------------------------------------------------------------
// ANALYZER / EXPORT (v0.8: DEEP collection is on-demand; export analysis remains out of hot path)
// -----------------------------------------------------------------------------
function buildMetricStatistics(samples) {
  const eligible = samples.filter(s => s.measurementEligible !== false);
  const active = eligible.filter(s => s.streamActive || Number.isFinite(s.bitrateMbps));
  const col = key => active.map(s => s[key]).filter(Number.isFinite);
  return {
    sampleCount: samples.length,
    eligibleSamples: eligible.length,
    ineligibleSamples: samples.length-eligible.length,
    activeSamples: active.length,
    approxActiveSeconds: active.length * SAMPLE_MS / 1000,

    streamPipeline: {
      presentedFPS: stats(col('presentedFPS')),
      rtcFPS: stats(col('rtcFPS')),
      receivedFPS: stats(col('receivedFPS')),
      decodedFPS: stats(col('decodedFPS'))
    },
    compositor: {
      callbackHz: stats(col('callbackHz')),
      callbackIntervalMeanMs: stats(col('callbackIntervalMeanMs')),
      callbackJitterMs: stats(col('callbackJitterMs')),
      framesPerCallback: stats(col('framesPerCallback')),
      processingDurationMs: stats(col('processingDurationMs')),
      callbackLatenessMs: stats(col('callbackLatenessMs'))
    },
    network: {
      bitrateMbps: stats(col('bitrateMbps').filter(v => v >= 0)),
      networkJitterMs: stats(col('networkJitterMs')),
      rttMs: stats(col('rttMs')),
      packetLossPercent: stats(col('packetLossPercent')),
      packetsLostDeltaTotal: active.reduce((a, s) => a + (Number.isFinite(s.packetsLostDelta) ? s.packetsLostDelta : 0), 0)
    },
    buffer: {
      jitterBufferMs: stats(col('jitterBufferMs')),
      jitterBufferTargetMs: stats(col('jitterBufferTargetMs')),
      jitterBufferMinimumMs: stats(col('jitterBufferMinimumMs'))
    },
    decoder: {
      decodeTimePerFrameMs: stats(col('decodeTimePerFrameMs')),
      framesDroppedDeltaTotal: active.reduce((a, s) => a + (Number.isFinite(s.framesDroppedDelta) ? s.framesDroppedDelta : 0), 0),
      freezeDeltaTotal: active.reduce((a, s) => a + (Number.isFinite(s.freezeDelta) ? s.freezeDelta : 0), 0)
    }
  };
}

function buildStatistics(samples) {
  const preStream = samples.filter(s => s.phase === 'PRE_STREAM');
  const startup = samples.filter(s => s.phase === 'STARTUP');
  const steady = samples.filter(s => s.phase === 'STEADY_STATE');
  return {
    phasePolicy: {
      startupDetection: 'ACTIVE_STREAM_DETECTED',
      steadyStateDetection: `PC_CONNECTED + RECEIVE/DECODE + CODEC/RESOLUTION for ${STARTUP_STABLE_SAMPLES} consecutive samples`,
      fixedTimeStartupCutoff: false,
      measurementEligibility: 'EXCLUDES VIDEO_PAUSED + DOCUMENT_HIDDEN + 2 SAMPLE RESUME GRACE; DELTAS REANCHORED ON RESUME'
    },
    preStream: buildMetricStatistics(preStream),
    startup: buildMetricStatistics(startup),
    steadyState: buildMetricStatistics(steady),
    allRecorded: buildMetricStatistics(samples)
  };
}

function observerHealth(samples) {
  const metric = key => stats(samples.map(s => s[key]).filter(Number.isFinite));
  return {
    architecture: S.control.state === 'ACTIVE' ? 'LEAN_SAFE_BRIDGE__VIRTUAL_MONITOR_ACTIVE' : 'LEAN_SAFE_BRIDGE',
    measurementEngine: 'PHASE_AWARE_STREAM_PIPELINE_COMPOSITOR_RESOLUTION_EXPERIMENTS_AND_PAUSE_RESUME_ELIGIBILITY',
    sampleIntervalMs: SAMPLE_MS,
    uiPolicy: 'DOM_UPDATES_ONLY_WHEN_PANEL_OPEN_AND_ONLY_CHANGED_TEXT',
    performanceGuardVersion: 2,
    frameHotPath: S.deep.enabled ? 'DEEP_RVFC_ON_DEMAND' : 'DEEP_RVFC_OFF',
    deepAnalyzerEnabled: S.deep.enabled,
    heavyAnalysisDuringGameplay: S.deep.enabled,
    attemptedSamples: S.sampler.samplesAttempted,
    retainedSamples: samples.length,
    overwrittenSamples: Math.max(0, S.samples.total - S.samples.count),
    skippedSamples: S.sampler.skipped,
    bridgeTimeouts: S.sampler.bridgeTimeouts,
    bridgeErrors: S.bridgeErrors,
    cycleWallMs: metric('suiteCycleWallMs'),
    localWorkMs: metric('suiteLocalWorkMs'),
    bridgeStatsWallMs: metric('suiteBridgeStatsWallMs'),
    contextWallMs: metric('suiteContextWallMs'),
    uiCostMs: metric('suiteUiCostMs'),
    deepCallbackWorkTotalMs: metric('deepCallbackWorkTotalMs'),
    deepCallbackWorkAvgMs: metric('deepCallbackWorkAvgMs'),
    deep: deepPerformanceSnapshot(),
    exportPerformance: { ...S.exportPerf },
    note: 'Wall times include asynchronous waiting and are not CPU time. localWorkMs is synchronous userscript work outside bridge waits.'
  };
}

function nearestSample(samples, t, mode = 'nearest') {
  if (!samples.length || !Number.isFinite(t)) return null;
  let best = null, bestD = Infinity;
  for (const s of samples) {
    const d = s.t - t;
    if (mode === 'before' && d > 0) continue;
    if (mode === 'after' && d < 0) continue;
    const ad = Math.abs(d);
    if (ad < bestD) { best = s; bestD = ad; }
  }
  return best;
}

function buildCorrelations(samples, events) {
  const interesting = new Set([
    'STREAM_ANOMALY','FREEZE_CHANGE',
    'CODEC_CHANGE','INBOUND_RESOLUTION_CHANGE','COMPOSITOR_REGIME_CHANGE','SURFACE_CHANGE',
    'CONTROL_ARMED','CONTROL_APPLIED','CONTROL_DISARMED','FPS_APPLIED','FPS_APPLY_FAILED','FPS_PREFERENCE_CHANGE','BITRATE_APPLIED','BITRATE_APPLY_FAILED','BITRATE_PREFERENCE_CHANGE','RESOLUTION_PROOF_STATUS','EXPERIMENT_PHASE_START','EXPERIMENT_PHASE_END','EXPERIMENT_CONFOUND','AUTO_PROFILE_INBOUND_CONFIRMED','CONTROL_NEXT_ATTACH_PREPARED','CONTROL_NEXT_ATTACH_FOUND','EARLY_RESOLUTION_OVERRIDE','CLIENT_RESOLUTION_CONFIRMED','MEASUREMENT_REANCHOR','VISIBILITY_CHANGE'
  ]);
  return events.filter(e => interesting.has(e.type)).map(e => ({
    event: e,
    before: compactTelemetry(nearestSample(samples, e.t - 1, 'before')),
    at: compactTelemetry(nearestSample(samples, e.t, 'nearest')),
    after: compactTelemetry(nearestSample(samples, e.t + 1, 'after'))
  }));
}

function resolutionCounts(samples, key='inboundResolution') {
  const m=new Map();
  for (const s of samples) {
    const r=s[key];
    if (!r?.width || !r?.height) continue;
    const k=`${r.width}x${r.height}`;
    m.set(k,(m.get(k)||0)+1);
  }
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).map(([resolution,count])=>({resolution,count}));
}

function buildExperimentStatistics(samples) {
  const baselinePhase=S.experimentManager.phases.find(p=>p.kind==='BASELINE');
  const baselineSamples=baselinePhase ? samples.filter(s=>s.experimentPhaseId===baselinePhase.id && s.phase==='STEADY_STATE' && s.measurementEligible !== false) : [];
  const baselineStats=buildMetricStatistics(baselineSamples);
  const avg=(obj,path)=>path.reduce((x,k)=>x?.[k],obj);
  return S.experimentManager.phases.map(p=>{
    const phaseSamplesRecorded=samples.filter(s=>s.experimentPhaseId===p.id && s.phase==='STEADY_STATE');
    const phaseSamples=phaseSamplesRecorded.filter(s=>s.measurementEligible !== false);
    const st=buildMetricStatistics(phaseSamplesRecorded);
    const delta = p.kind==='BASELINE' ? null : {
      presentedFpsAvg: round((avg(st,['streamPipeline','presentedFPS','avg']) ?? 0) - (avg(baselineStats,['streamPipeline','presentedFPS','avg']) ?? 0),3),
      decodedFpsAvg: round((avg(st,['streamPipeline','decodedFPS','avg']) ?? 0) - (avg(baselineStats,['streamPipeline','decodedFPS','avg']) ?? 0),3),
      bitrateMbpsAvg: round((avg(st,['network','bitrateMbps','avg']) ?? 0) - (avg(baselineStats,['network','bitrateMbps','avg']) ?? 0),3),
      networkJitterMsAvg: round((avg(st,['network','networkJitterMs','avg']) ?? 0) - (avg(baselineStats,['network','networkJitterMs','avg']) ?? 0),3),
      jitterBufferMsAvg: round((avg(st,['buffer','jitterBufferMs','avg']) ?? 0) - (avg(baselineStats,['buffer','jitterBufferMs','avg']) ?? 0),3),
      decodeTimePerFrameMsAvg: round((avg(st,['decoder','decodeTimePerFrameMs','avg']) ?? 0) - (avg(baselineStats,['decoder','decodeTimePerFrameMs','avg']) ?? 0),3)
    };
    return {
      ...p,
      endAtSec:p.endAtSec ?? round(elapsed(),3),
      steadySamples:phaseSamples.length,
      steadySamplesRecorded:phaseSamplesRecorded.length,
      steadySamplesEligible:phaseSamples.length,
      observedInboundResolutions:resolutionCounts(phaseSamples,'inboundResolution'),
      observedRenderedResolutions:resolutionCounts(phaseSamples,'renderedResolution'),
      proofChain:{
        requested:p.requestedResolution || null,
        client:p.application?.client || null,
        inbound:resolutionCounts(phaseSamples,'inboundResolution'),
        rendered:resolutionCounts(phaseSamples,'renderedResolution')
      },
      statistics:st,
      deltaVsFirstBaseline:delta,
      proofFinal:p.proofFinal || (p.id===S.experimentManager.currentPhaseId && p.kind==='VIRTUAL_MONITOR' ? {...S.control.proof} : null)
    };
  });
}

function coreSampleView(s) {
  return {
    t:s.t,phase:s.phase,streamActive:s.streamActive,lab:s.lab,network:s.network,networkAuto:s.networkAuto,
    mode:s.mode,controlState:s.controlState,measurementEligible:s.measurementEligible,measurementIneligibleReason:s.measurementIneligibleReason,
    experimentPhaseId:s.experimentPhaseId,experimentPhaseLabel:s.experimentPhaseLabel,
    resolutionPreferenceMode:s.resolutionPreferenceMode,resolutionRequested:s.resolutionRequested,resolutionProofStatus:s.resolutionProofStatus,
    videoResolution:s.videoResolution,renderedResolution:s.renderedResolution,
    intrinsicVideoCssPx:s.intrinsicVideoCssPx,elementBoxCssPx:s.elementBoxCssPx,rvfcMediaFramePx:s.rvfcMediaFramePx,
    objectFit:s.objectFit,objectPosition:s.objectPosition,elementBoxToIntrinsicScaleX:s.elementBoxToIntrinsicScaleX,elementBoxToIntrinsicScaleY:s.elementBoxToIntrinsicScaleY,
    viewport:s.viewport,orientation:s.orientation,videoReadyState:s.videoReadyState,
    playbackQualityAvailable:s.playbackQualityAvailable,playbackTotalVideoFramesRaw:s.playbackTotalVideoFramesRaw,playbackDroppedVideoFramesRaw:s.playbackDroppedVideoFramesRaw,
    playbackTotalVideoFramesDelta:s.playbackTotalVideoFramesDelta,playbackDroppedVideoFramesDelta:s.playbackDroppedVideoFramesDelta,playbackDropPercent:s.playbackDropPercent,
    pcSource:s.pcSource,pcState:s.pcState,codec:s.codec,inboundResolution:s.inboundResolution,inboundFramePx:s.inboundFramePx,receiverTrackSettings:s.receiverTrackSettings,
    rtcFPS:s.rtcFPS,receivedFPS:s.receivedFPS,decodedFPS:s.decodedFPS,bitrateMbps:s.bitrateMbps,
    bitrateSource:s.bitrateSource,bitrateScope:s.bitrateScope,bitrateConfidence:s.bitrateConfidence,
    networkJitterMs:s.networkJitterMs,rttMs:s.rttMs,availableIncomingMbps:s.availableIncomingMbps,
    packetsReceivedDelta:s.packetsReceivedDelta,packetsLostDelta:s.packetsLostDelta,packetsLostRaw:s.packetsLostRaw,packetLossPercent:s.packetLossPercent,
    packetsDiscardedRaw:s.packetsDiscardedRaw,jitterBufferMs:s.jitterBufferMs,jitterBufferTargetMs:s.jitterBufferTargetMs,jitterBufferMinimumMs:s.jitterBufferMinimumMs,
    framesReceivedRaw:s.framesReceivedRaw,framesDecodedRaw:s.framesDecodedRaw,framesDroppedRaw:s.framesDroppedRaw,framesDroppedDelta:s.framesDroppedDelta,
    framesRenderedRaw:s.framesRenderedRaw,framesRenderedDelta:s.framesRenderedDelta,renderedFPSFromStats:s.renderedFPSFromStats,
    decodeTimePerFrameMs:s.decodeTimePerFrameMs,processingDelayPerFrameMs:s.processingDelayPerFrameMs,
    renderInterFrameMeanMs:s.renderInterFrameMeanMs,renderInterFrameStdDevMs:s.renderInterFrameStdDevMs,
    qpSumRaw:s.qpSumRaw,qpSumDelta:s.qpSumDelta,qpPerDecodedFrame:s.qpPerDecodedFrame,
    nackCountRaw:s.nackCountRaw,nackCountDelta:s.nackCountDelta,pliCountRaw:s.pliCountRaw,pliCountDelta:s.pliCountDelta,firCountRaw:s.firCountRaw,firCountDelta:s.firCountDelta,
    retransmittedPacketsReceivedRaw:s.retransmittedPacketsReceivedRaw,retransmittedPacketsReceivedDelta:s.retransmittedPacketsReceivedDelta,
    retransmittedBytesReceivedRaw:s.retransmittedBytesReceivedRaw,retransmittedBytesReceivedDelta:s.retransmittedBytesReceivedDelta,
    framesAssembledFromMultiplePacketsRaw:s.framesAssembledFromMultiplePacketsRaw,framesAssembledFromMultiplePacketsDelta:s.framesAssembledFromMultiplePacketsDelta,
    assemblyTimePerMultiPacketFrameMs:s.assemblyTimePerMultiPacketFrameMs,pauseCountRaw:s.pauseCountRaw,pauseCountDelta:s.pauseCountDelta,totalPausesDuration:s.totalPausesDuration,
    freezeCount:s.freezeCount,freezeDelta:s.freezeDelta,
    controlRequestedFps:s.controlRequestedFps,clientTargetFps:s.targetFps,clientTargetFpsSource:s.targetFpsSource,
    requestedBitrateMbps:s.targetBitrateMbps,bitrateAuto:s.bitrateAuto,resolutionMode:s.resolutionMode,receiverHints:s.receiverHints,
    suiteCycleWallMs:s.suiteCycleWallMs,suiteLocalWorkMs:s.suiteLocalWorkMs,suiteBridgeStatsWallMs:s.suiteBridgeStatsWallMs,
    suiteContextWallMs:s.suiteContextWallMs,suiteUiCostMs:s.suiteUiCostMs
  };
}

function deepSampleView(s) {
  return {
    t:s.t,phase:s.phase,experimentPhaseId:s.experimentPhaseId,measurementEligible:s.measurementEligible,
    presentedFPS:s.presentedFPS,presentedFramesDelta:s.presentedFramesDelta,callbackHz:s.callbackHz,callbackCountDelta:s.callbackCountDelta,
    callbackIntervalMeanMs:s.callbackIntervalMeanMs,callbackJitterMs:s.callbackJitterMs,callbackIntervalMinMs:s.callbackIntervalMinMs,
    callbackIntervalMaxMs:s.callbackIntervalMaxMs,framesPerCallback:s.framesPerCallback,multiFrameCallbacks:s.multiFrameCallbacks,
    processingDurationMs:s.processingDurationMs,callbackLatenessMs:s.callbackLatenessMs,compositorRegimeHz:s.compositorRegimeHz,
    callbackWorkCountDelta:s.deepCallbackWorkCountDelta,callbackWorkTotalMs:s.deepCallbackWorkTotalMs,callbackWorkAvgMs:s.deepCallbackWorkAvgMs
  };
}

function buildCoreStatistics(samples) {
  const eligible=samples.filter(s=>s.measurementEligible!==false);
  const active=eligible.filter(s=>s.streamActive||Number.isFinite(s.bitrateMbps));
  const col=key=>active.map(s=>s[key]).filter(Number.isFinite);
  const bitrateSources={};
  for (const s of active) if (s.bitrateSource) bitrateSources[s.bitrateSource]=(bitrateSources[s.bitrateSource]||0)+1;
  return {
    sampleCount:samples.length,eligibleSamples:eligible.length,activeSamples:active.length,approxActiveSeconds:active.length*SAMPLE_MS/1000,
    stream:{rtcFPS:stats(col('rtcFPS')),receivedFPS:stats(col('receivedFPS')),decodedFPS:stats(col('decodedFPS'))},
    network:{bitrateMbps:stats(col('bitrateMbps')),bitrateSources,jitterMs:stats(col('networkJitterMs')),rttMs:stats(col('rttMs')),packetLossPercent:stats(col('packetLossPercent'))},
    decoder:{decodeTimePerFrameMs:stats(col('decodeTimePerFrameMs')),framesDroppedDeltaTotal:active.reduce((a,x)=>a+(Number.isFinite(x.framesDroppedDelta)?x.framesDroppedDelta:0),0),freezeDeltaTotal:active.reduce((a,x)=>a+(Number.isFinite(x.freezeDelta)?x.freezeDelta:0),0)},
    suite:{cycleWallMs:stats(col('suiteCycleWallMs')),localWorkMs:stats(col('suiteLocalWorkMs')),bridgeStatsWallMs:stats(col('suiteBridgeStatsWallMs')),contextWallMs:stats(col('suiteContextWallMs')),uiCostMs:stats(col('suiteUiCostMs'))}
  };
}

function buildDeepStatistics(samples) {
  const deep=samples.filter(s=>s.deepAnalyzerEnabled===true && s.measurementEligible!==false);
  const col=key=>deep.map(s=>s[key]).filter(Number.isFinite);
  return {
    sampleCount:deep.length,
    presentedFPS:stats(col('presentedFPS')),callbackHz:stats(col('callbackHz')),framesPerCallback:stats(col('framesPerCallback')),
    callbackIntervalMeanMs:stats(col('callbackIntervalMeanMs')),callbackJitterMs:stats(col('callbackJitterMs')),
    processingDurationMs:stats(col('processingDurationMs')),callbackLatenessMs:stats(col('callbackLatenessMs')),
    callbackWorkTotalMs:stats(col('deepCallbackWorkTotalMs')),callbackWorkAvgMs:stats(col('deepCallbackWorkAvgMs'))
  };
}

function buildImageTelemetryStatistics(samples) {
  const eligible=samples.filter(s=>s.measurementEligible!==false);
  const active=eligible.filter(s=>s.streamActive||Number.isFinite(s.bitrateMbps));
  const col=key=>active.map(s=>s[key]).filter(Number.isFinite);
  const sum=key=>active.reduce((a,s)=>a+(Number.isFinite(s[key])?s[key]:0),0);
  const observed=key=>active.reduce((n,s)=>n+(s[key]!==null&&s[key]!==undefined?1:0),0);
  return {
    playback:{
      apiAvailable:CAP.video.getVideoPlaybackQuality,
      samplesWithSignal:observed('playbackTotalVideoFramesRaw'),
      totalFramesDelta:sum('playbackTotalVideoFramesDelta'),
      droppedFramesDelta:sum('playbackDroppedVideoFramesDelta'),
      dropPercent:stats(col('playbackDropPercent'))
    },
    render:{
      samplesWithFramesRendered:observed('framesRenderedRaw'),
      renderedFPSFromStats:stats(col('renderedFPSFromStats')),
      interFrameMeanMs:stats(col('renderInterFrameMeanMs')),
      interFrameStdDevMs:stats(col('renderInterFrameStdDevMs'))
    },
    compression:{
      samplesWithQpSum:observed('qpSumRaw'),
      qpPerDecodedFrame:stats(col('qpPerDecodedFrame')),
      note:'Codec/context-relative trend only; not a universal visual-quality score.'
    },
    recovery:{
      samplesWithNack:observed('nackCountRaw'),
      nackDeltaTotal:sum('nackCountDelta'),
      pliDeltaTotal:sum('pliCountDelta'),
      firDeltaTotal:sum('firCountDelta'),
      retransmittedPacketsDeltaTotal:sum('retransmittedPacketsReceivedDelta'),
      retransmittedBytesDeltaTotal:sum('retransmittedBytesReceivedDelta')
    },
    receiverPipeline:{
      processingDelayPerFrameMs:stats(col('processingDelayPerFrameMs')),
      assemblyTimePerMultiPacketFrameMs:stats(col('assemblyTimePerMultiPacketFrameMs')),
      pauseDeltaTotal:sum('pauseCountDelta')
    },
    surface:{
      elementBoxToIntrinsicScaleX:stats(col('elementBoxToIntrinsicScaleX')),
      elementBoxToIntrinsicScaleY:stats(col('elementBoxToIntrinsicScaleY')),
      latestObjectFit:active.length ? active[active.length-1].objectFit ?? null : null,
      latestObjectPosition:active.length ? active[active.length-1].objectPosition ?? null : null
    }
  };
}

function imageTelemetryAvailability(samples) {
  const keys=[
    'playbackTotalVideoFramesRaw','framesRenderedRaw','renderInterFrameMeanMs','qpSumRaw','nackCountRaw','pliCountRaw','firCountRaw',
    'processingDelayPerFrameMs','retransmittedPacketsReceivedRaw','framesAssembledFromMultiplePacketsRaw'
  ];
  const out={};
  for (const key of keys) out[key]=samples.some(s=>s[key]!==null&&s[key]!==undefined);
  out.receiverTrackSettings=!!S.contextLatest?.receiverTrackSettings;
  out.objectFit=samples.some(s=>typeof s.objectFit==='string'&&s.objectFit.length>0);
  return out;
}

function buildLongSessionStatistics() {
  const cps=S.longSession.checkpoints.toArray();
  const nums=key=>cps.map(c=>c[key]).filter(Number.isFinite);
  const memUsed=cps.map(c=>c.memory?.legacy?.usedJSHeapSize).filter(Number.isFinite);
  const uaMem=cps.map(c=>c.memory?.userAgentSpecific?.bytes).filter(Number.isFinite);
  const storageUsage=cps.map(c=>c.storage?.usageBytes).filter(Number.isFinite);
  const pressureCounts={};
  for (const c of cps) {
    const state=c.computePressure?.state;
    if (state) pressureCounts[state]=(pressureCounts[state]||0)+1;
  }
  const first=cps[0]||null,last=cps[cps.length-1]||null;
  const firstLogical=first?.logicalElapsedSec ?? first?.persistence?.logicalElapsedSec ?? null;
  const lastLogical=last?.logicalElapsedSec ?? last?.persistence?.logicalElapsedSec ?? null;
  const retainedHours=Number.isFinite(firstLogical) && Number.isFinite(lastLogical) && lastLogical>=firstLogical
    ? (lastLogical-firstLogical)/3600
    : cps.length*LONG_SESSION_CHECKPOINT_MS/3600000;
  return {
    checkpointCount:cps.length,
    retainedHours:round(retainedHours,3),
    firstAtSec:first?.t ?? null,
    lastAtSec:last?.t ?? null,
    firstLogicalElapsedSec:firstLogical,
    lastLogicalElapsedSec:lastLogical,
    recoveredCheckpointCount:S.longSession.persistence.recoveredCheckpointCount,
    decodedFPS:stats(nums('decodedFPS')),
    rttMs:stats(nums('rttMs')),
    decodeTimePerFrameMs:stats(nums('decodeTimePerFrameMs')),
    processingDelayPerFrameMs:stats(nums('processingDelayPerFrameMs')),
    suiteLocalWorkMs:stats(nums('suiteLocalWorkMs')),
    jsHeapUsedBytes:stats(memUsed),
    userAgentSpecificMemoryBytes:stats(uaMem),
    storageUsageBytes:stats(storageUsage),
    pressureStateCounts:pressureCounts,
    checkpointErrors:S.longSession.checkpointErrors,
    persistenceWriteErrors:S.longSession.persistence.writeErrors,
    persistenceReadErrors:S.longSession.persistence.readErrors
  };
}

function buildExport() {
  const samples=S.samples.toArray();
  const events=S.events.toArray();
  const importantEvents=S.importantEvents.toArray();
  const control=controlSnapshot();
  const latest=samples.length ? samples[samples.length-1] : null;
  const experimentStatistics=buildExperimentStatistics(samples);
  const networkAuto=detectNetworkAuto();
  const coreSamples=samples.map(coreSampleView);
  const deepSamples=samples.filter(s=>s.deepAnalyzerEnabled===true).map(deepSampleView);
  const coreStats=buildCoreStatistics(samples);
  const deepStats=buildDeepStatistics(samples);
  const imageStats=buildImageTelemetryStatistics(samples);
  const imageAvailability=imageTelemetryAvailability(samples);
  const guard=observerHealth(samples);
  const longSessionCheckpoints=S.longSession.checkpoints.toArray();
  const longSessionStats=buildLongSessionStatistics();

  return {
    controlSuite:{
      name:'Control Suite - Boosteroid',version:VERSION,build:BUILD,
      pipeline:'Gate -1 -> Gate 0 -> Observe -> Prove -> Modify -> Measure -> Compare -> Integrate',
      schemaVersion:2,
      status:'V0.8.1_RC6__INPUT_COMPATIBILITY_PROBE__NOT_CANONICAL'
    },
    exportedAt:new Date().toISOString(),
    environment:ENV,
    capabilities:CAP,
    inputCompatibility:inputProbeSnapshot(),
    profile:currentPreferenceSnapshot(),
    control:{
      requested:{
        resolutionMode:control.preferenceMode,
        resolution:control.preferenceTarget,
        fps:control.fpsRequested,
        bitrateAuto:control.bitrateAuto,
        bitrateMbps:control.bitrateRequestedMbps
      },
      nativeClientEvidence:{
        resolution:control.application?.client || null,
        fpsApplication:control.fpsApplication,
        bitrateApplication:control.bitrateApplication,
        nativeBitrateEvidence:control.nativeBitrateEvidence,
        clientContext:S.contextLatest || null
      },
      achieved:{
        resolutionProof:control.proof,
        latestInboundResolution:latest?.inboundResolution || null,
        latestRenderedResolution:latest?.renderedResolution || null,
        latestRtcFPS:latest?.rtcFPS ?? null,
        latestDecodedFPS:latest?.decodedFPS ?? null,
        latestBitrateMbps:latest?.bitrateMbps ?? null,
        codec:latest?.codec || S.lastCodec || null
      },
      state:control
    },
    coreTelemetry:{
      enabled:true,
      sampleIntervalMs:SAMPLE_MS,
      semantics:{
        rtcFPS:'RTCInboundRtpStreamStats.framesPerSecond',
        receivedFPS:'delta framesReceived / RTC stats time',
        decodedFPS:'delta framesDecoded / RTC stats time',
        bitrateMbps:'direct sum of inbound-video bytes when valid; transport candidate-pair bytes only as explicitly labeled fallback when the Chromium/AV1 video counter stalls',
        requestedVsClientVsAchieved:'kept as separate fields; requested is never proof of achieved'
      },
      statistics:coreStats,
      samples:coreSamples
    },
    deepAnalyzer:{
      enabled:S.deep.enabled,
      onDemand:true,
      rvfcContinuousWhenOff:false,
      semantics:{
        presentedFPS:'available only while DEEP is enabled; derived from requestVideoFrameCallback metadata.presentedFrames',
        callbackHz:'requestVideoFrameCallback callbacks per sample time',
        callbackIntervalMeanMs:'callback interval; NOT decoded-frame interval',
        callbackWorkMs:'synchronous userscript work measured inside each DEEP rVFC callback'
      },
      performance:deepPerformanceSnapshot(),
      compositorSessionStats:compositorSessionStats(),
      statistics:deepStats,
      samples:deepSamples
    },
    imageTelemetry:{
      schemaVersion:1,
      observationalOnly:true,
      pixelCapture:false,
      canvasLoop:false,
      extraGetStatsCallsPerSample:0,
      playbackQualityAPI:CAP.video.getVideoPlaybackQuality,
      availability:imageAvailability,
      receiverTrackSettings:S.contextLatest?.receiverTrackSettings || null,
      surfaceSemantics:{
        legacyRenderedResolutionMeaning:'CSS element box from getBoundingClientRect; preserved for compatibility',
        explicitFields:['inboundFramePx','intrinsicVideoCssPx','elementBoxCssPx','rvfcMediaFramePx','objectFit','objectPosition']
      },
      semantics:{
        receiverTrackSettingsFrameRate:'observational only; excluded from cadence and CLIENT_STATE_CHANGE fingerprint because Chromium/Android can report implausible values',
        qpPerDecodedFrame:'delta qpSum / delta framesDecoded; codec/context-relative trend only',
        renderedFPSFromStats:'delta RTCInboundRtpStreamStats.framesRendered / stats time when exposed',
        playbackDropPercent:'delta droppedVideoFrames / delta totalVideoFrames; corroborating signal pending live WebRTC validation',
        processingDelayPerFrameMs:'delta totalProcessingDelay / delta framesDecoded when exposed'
      },
      statistics:imageStats
    },
    longSessionTelemetry:{
      schemaVersion:2,
      observationalOnly:true,
      crashSafePersistence:true,
      checkpointIntervalMs:LONG_SESSION_CHECKPOINT_MS,
      maxCheckpoints:MAX_LONG_SESSION_CHECKPOINTS,
      maxRetentionHoursAtPeriodicCadence:round(MAX_LONG_SESSION_CHECKPOINTS*LONG_SESSION_CHECKPOINT_MS/3600000,3),
      retentionSemantics:'720 rows equals ~12 h at the periodic 1-minute cadence; extra lifecycle checkpoints can reduce wall-clock coverage if the page is repeatedly hidden/reloaded.',
      rationale:'Preserve a bounded low-frequency history across multi-hour sessions and recover the timeline after same-origin reload/crash while the 1 Hz CORE ring remains capped at ~1 hour.',
      memorySemantics:{
        performanceMemory:'Chromium-specific JS heap signal when exposed; not total process/device RAM.',
        userAgentSpecificMemory:'used only when API exists and crossOriginIsolated is true; capability-aware.',
        storageEstimate:'origin storage quota/usage estimate; NOT RAM and not a complete browser-cache measurement.'
      },
      pressureSemantics:'Compute Pressure is a high-level CPU pressure state when exposed; it is not a direct temperature sensor.',
      longTaskSemantics:'Performance Long Tasks >=50 ms when supported; cumulative counters are checkpointed, not every entry.',
      persistence:longSessionPersistenceSnapshot(),
      recoverySemantics:'Checkpoint rows are asynchronously committed to origin-scoped IndexedDB. Periodic checkpoints are supplemented by pagehide/document-hidden snapshots; a hard crash can still lose at most the interval since the most recent successful write.',
      statistics:longSessionStats,
      checkpoints:longSessionCheckpoints
    },
    latencyLab:{
      capabilityAware:true,
      enabled:false,
      jitterBufferTargetAPI:CAP.webrtc.jitterBufferTarget,
      playoutDelayHintAPI:CAP.webrtc.playoutDelayHint,
      receiverHints:S.contextLatest?.receiverHints || null,
      activeModification:false
    },
    performanceGuard:{
      version:2,
      core:{
        attemptedSamples:S.sampler.samplesAttempted,
        retainedSamples:samples.length,
        skippedSamples:S.sampler.skipped,
        bridgeTimeouts:S.sampler.bridgeTimeouts,
        bridgeErrors:S.bridgeErrors,
        cycleWallMs:guard.cycleWallMs,
        localWorkMs:guard.localWorkMs,
        bridgeStatsWallMs:guard.bridgeStatsWallMs,
        contextWallMs:guard.contextWallMs,
        uiCostMs:guard.uiCostMs
      },
      deep:deepPerformanceSnapshot(),
      export:{...S.exportPerf},
      note:'CORE localWorkMs excludes asynchronous waits. DEEP callback cost is measured separately inside the on-demand rVFC callback.'
    },
    experiments:{
      lab:S.lab,
      network:{label:S.network,auto:networkAuto},
      mode:S.mode,
      recording:S.recording,
      measurementEligibility:{
        documentHidden:!!document.hidden,videoPaused:!!S.video?.paused,resumeGraceSamples:S.measurement.resumeGraceSamples,
        lastReanchorReason:S.measurement.lastReanchorReason,lastReanchorAtSec:S.measurement.lastReanchorAtSec
      },
      lifecycle:{
        sessionStartedAt:S.sessionStartDate?.toISOString()||null,durationSeconds:round(elapsed(),3),
        firstVideoAtSec:S.firstVideoAt,firstMetadataAtSec:S.firstMetadataAt,firstPlayingAtSec:S.firstPlayingAt,
        firstFrameAtSec:S.firstFrameAt,lastFrameAtSec:S.lastFrameAt
      },
      phases:experimentStatistics,
      correlations:buildCorrelations(samples,importantEvents.length ? importantEvents : events)
    },
    instrumentation:{
      rtcNativeHooks:[],
      pageMethodOverrides:S.control.state==='ACTIVE' && (S.control.application?.patch?.patched||S.control.application?.patched) ? ['StreamDeviceContext.getSafeResolution','SessionHandler.getWindowResolution'] : [],
      exposedStateMutations:S.control.state==='ACTIVE' && S.control.activeTarget ? ['SYSTEM_STATS.USER_DEVICE_RESOLUTION'] : [],
      controlModel:'PERSISTENT_AUTO_APPLY',
      telemetryIntegrityModel:'RC6_RC5_INTEGRITY_PLUS_ON_DEMAND_INPUT_PROBE',
      legacyNamingNote:'oneShot/PENDING_RESOLUTION_ONE_SHOT names are active persistent-profile boot context compatibility, not removable dead code',
      longSessionTelemetry:'bounded 1-minute checkpoints + origin-scoped IndexedDB crash recovery; no extra RTC getStats calls',
      telemetryIntegrity:{
        clientStateFingerprintExcludesReceiverTrackFrameRate:true,
        clientStateChanges:S.contextTelemetry.changes,
        suppressedFrameRateOnlyStateChanges:S.contextTelemetry.suppressedFrameRateOnly,
        receiverTrackFrameRateSamples:S.contextTelemetry.frameRateSamples,
        implausibleReceiverTrackFrameRateSamples:S.contextTelemetry.implausibleFrameRateSamples,
        lastObservedReceiverTrackFrameRate:S.contextTelemetry.lastObservedFrameRate,
        protectedImportantEventLedger:true,
        maxImportantEvents:MAX_IMPORTANT_EVENTS
      },
      inputCompatibility:{
        probeOnDemand:true,
        probeOffByDefault:true,
        maxInputProbeEvents:MAX_INPUT_PROBE_EVENTS,
        inputProbeAutoStopMs:INPUT_PROBE_AUTO_STOP_MS,
        keyboardLockUserTriggeredOnly:true,
        keyboardLockCodes:['Escape','Tab'],
        syntheticRemoteInput:false,
        mouseTransportOverride:false
      }
    },
    importantEvents:S.importantEvents.toArray(),
    events
  };
}

async function downloadJSON() {
  if (S.recording) stopRecording('EXPORT');
  addEvent('EXPORT');
  await collectLongSessionCheckpoint('EXPORT');

  const analysisStart=now();
  const data=buildExport();
  S.exportPerf.analysisBuildWallMs=round(now()-analysisStart,3);

  // First stringify measures export cost. A second/final stringify includes that metric.
  const stringifyStart=now();
  const draft=JSON.stringify(data,null,2);
  S.exportPerf.firstStringifyWallMs=round(now()-stringifyStart,3);
  S.exportPerf.finalStringifyWallMs=null;
  S.exportPerf.jsonBytes=typeof TextEncoder!=='undefined'
    ? new TextEncoder().encode(draft).length
    : draft.length;

  data.performanceGuard.export={...S.exportPerf};
  const text=JSON.stringify(data,null,2);

  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const t=new Date().toISOString().replace(/[:.]/g,'-');
  const lab=String(S.lab||'lab').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const browser=String(ENV.browser||'browser').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const versionTag=`v${VERSION.replace(/\./g,'')}`;
  const a=document.createElement('a');
  a.href=url;
  a.download=`control-suite-${versionTag}-${lab}-${browser}-${t}.json`;
  a.style.display='none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

// -----------------------------------------------------------------------------
// UI - CREATED ONCE, NEVER REBUILT. NO LIVE DOM WORK WHILE CLOSED.
// -----------------------------------------------------------------------------
function setText(id, value) {
  const el = $(id);
  if (!el) return;
  const s = value == null ? '--' : String(value);
  if (el.textContent !== s) el.textContent = s;
}

function fmt(v, digits = 1, suffix = '') {
  return Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : '--';
}

function setPanel(open) {
  S.ui.open = !!open;
  lsSet(K.panelOpen, open ? 'true' : 'false');
  const panel = $('bcs-panel');
  const button = $('bcs-open');
  if (panel) panel.style.display = open ? 'block' : 'none';
  if (button) button.style.display = open ? 'none' : 'block';
  if (open) updateUI();
}

function formatRes(r) {
  return r?.width > 0 && r?.height > 0 ? `${r.width}×${r.height}` : '--';
}

function updateUI(sample = null) {
  if (!S.ui.built || !S.ui.open) return;
  const s = sample || S.samples.toArray().at(-1) || {};

  const autoEnabled=isAutoEnabled();
  setText('bcs-auto-state', autoEnabled ? 'ATIVO' : 'DESLIGADO');
  setText('bcs-control-state', autoEnabled ? (S.control.state === 'ACTIVE' ? 'AUTO + ACTIVE' : 'AUTO') : 'SAFE');

  setText('bcs-codec', (s.codec || '--').replace('video/', ''));
  setText('bcs-dfps', fmt(s.decodedFPS, 1));
  setText('bcs-br', fmt(s.bitrateMbps, 2, ' Mbps'));
  setText('bcs-deep-state', CAP.video.requestVideoFrameCallback ? (S.deep.enabled ? 'ON' : 'OFF') : 'N/A');
  setText('bcs-callback-hz', S.deep.enabled ? fmt(s.callbackHz,1,' Hz') : '--');
  setText('bcs-frames-callback', S.deep.enabled ? fmt(s.framesPerCallback,2) : '--');
  setText('bcs-pacing-jitter', S.deep.enabled ? fmt(s.callbackJitterMs,2,' ms') : '--');
  const deepPerf=deepPerformanceSnapshot();
  setText('bcs-deep-work', S.deep.enabled ? fmt(deepPerf.callbackWork.avgMs,3,' ms') : '--');
  const deepBtn=$('bcs-deep-toggle');
  if (deepBtn) {
    deepBtn.disabled=!CAP.video.requestVideoFrameCallback;
    deepBtn.textContent=!CAP.video.requestVideoFrameCallback ? 'ANALYZER INDISPONÍVEL' : (S.deep.enabled ? 'PARAR ANALYZER' : 'INICIAR ANALYZER');
  }

  const selectedFps=Number(lsGet(K.fps,'120')) === 60 ? 60 : 120;
  const fpsSelect=$('bcs-fps-mode');
  if (fpsSelect && fpsSelect.value !== String(selectedFps)) fpsSelect.value=String(selectedFps);

  const brAuto=lsGet(K.bitrateAuto,'true') !== 'false';
  const brMode=$('bcs-bitrate-mode');
  if (brMode && brMode.value !== (brAuto ? 'auto' : 'manual')) brMode.value=brAuto ? 'auto' : 'manual';

  const brValue=clamp(Number(lsGet(K.bitrateManual,'40')) || 40,5,80);
  const brRange=$('bcs-bitrate-range');
  if (brRange && brRange.value !== String(brValue)) brRange.value=String(brValue);
  setText('bcs-bitrate-value',`${brValue} Mbps`);
  const brRow=$('bcs-bitrate-row');
  if (brRow) brRow.style.display=brAuto ? 'none' : 'flex';

  const prefMode=lsGet(K.resolutionMode,'native');
  const prefTarget=resolutionTarget();
  setText('bcs-pref-res', prefMode==='native' ? 'NATIVO' : formatRes(prefTarget));

  const clientRes=S.control.application?.client?.sessionWindowResolution ||
                  S.control.application?.client?.safeResolution ||
                  null;
  setText('bcs-client-res', clientRes ? formatRes(clientRes) : '--');

  const inbound=s.inboundResolution || s.videoResolution;
  setText('bcs-achieved-res', formatRes(inbound));

  let simpleStatus='AGUARDANDO';
  if (!autoEnabled && S.control.state !== 'ACTIVE') simpleStatus='SAFE';
  else if (inbound && prefTarget && inbound.width===prefTarget.width && inbound.height===prefTarget.height) simpleStatus='ALCANÇADA';
  else if (inbound && prefTarget) simpleStatus='LIMITADA / ALTERNATIVA';
  else if (inbound && prefMode==='native') simpleStatus='NATIVA';
  setText('bcs-simple-status',simpleStatus);

  const P=S.inputProbe;
  setText('bcs-input-probe-state',P.enabled ? 'ON' : 'OFF');
  setText('bcs-input-keyboard-lock-cap',P.keyboardLock.supported ? 'SIM' : 'NÃO');
  setText('bcs-input-keyboard-lock-state',P.keyboardLock.active ? 'ATIVO' : 'OFF');
  setText('bcs-input-fullscreen',fullscreenElementCompat() ? 'SIM' : 'NÃO');
  setText('bcs-input-pointerlock',document.pointerLockElement ? 'SIM' : 'NÃO');
  setText('bcs-input-last',inputProbeEventSummaryLabel(P.lastEvent));
  setText('bcs-input-counts',`${P.counters.keydown}/${P.counters.mousedown}/${P.counters.pointerdown}`);
  const probeBtn=$('bcs-input-probe-toggle');
  if (probeBtn) probeBtn.textContent=P.enabled ? 'PARAR PROBE' : 'INICIAR PROBE';
  const lockBtn=$('bcs-input-lock-toggle');
  if (lockBtn) {
    lockBtn.disabled=!P.keyboardLock.supported;
    lockBtn.textContent=!P.keyboardLock.supported ? 'KEY LOCK N/A' : (P.keyboardLock.active ? 'LIBERAR ESC+TAB' : 'LOCK ESC+TAB');
  }

  const autoBtn=$('bcs-start-session');
  if (autoBtn) autoBtn.textContent=autoEnabled ? 'AUTO ATIVO' : 'ATIVAR AUTO';
}

function createUI() {
  if ($('bcs-panel')) return;

  const style = document.createElement('style');
  style.id = 'bcs-style';
  style.textContent = `
#bcs-open,#bcs-panel{position:fixed;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f5f5f7}
#bcs-open{right:10px;top:max(10px,env(safe-area-inset-top));border:1px solid #3a3a3d;border-radius:12px;background:#171719;color:#fff;padding:9px 11px;font-size:12px;font-weight:850}
#bcs-panel{right:10px;top:max(10px,env(safe-area-inset-top));width:min(330px,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow:auto;background:#111113;border:1px solid #343438;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:11px;line-height:1.35}
#bcs-panel *{box-sizing:border-box}.bcs-head{padding:10px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2a2d}.bcs-title{font-size:13px;font-weight:900}.bcs-muted{opacity:.6;font-size:9px}.bcs-x{border:0;border-radius:8px;background:#262629;color:#fff;width:30px;height:30px;font-size:18px}.bcs-body{padding:9px}.bcs-card{border:1px solid #29292c;border-radius:10px;margin-bottom:8px;overflow:hidden}.bcs-st{padding:7px 8px;background:#1a1a1d;font-weight:850}.bcs-row{display:flex;justify-content:space-between;gap:10px;padding:6px 8px;border-top:1px solid #232326}.bcs-row b{text-align:right}.bcs-select,.bcs-btn{font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.bcs-select{background:#202023;color:#fff;border:1px solid #3a3a3e;border-radius:7px;padding:5px}.bcs-btn{width:100%;border:1px solid #3a3a3e;border-radius:8px;background:#222225;color:#fff;padding:9px 6px;font-weight:800}.bcs-btn:active{background:#343439}.bcs-primary{background:#2b2b31}.bcs-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:7px}.bcs-note{padding:6px 8px;opacity:.62;font-size:9px}.bcs-status{font-weight:900}.bcs-achieved{font-size:16px}.bcs-danger{border-color:#804040}`;
  (document.head || document.documentElement).appendChild(style);

  const open = document.createElement('button');
  open.id = 'bcs-open';
  open.textContent = 'BCS';
  open.addEventListener('click', () => setPanel(true));

  const panel = document.createElement('div');
  panel.id = 'bcs-panel';
  panel.innerHTML = `
<div class="bcs-head"><div><div class="bcs-title">BOOSTEROID CONTROL v${VERSION}</div><div class="bcs-muted">${IS_STREAM_DOCUMENT ? "STREAM • controle + resultado" : "PRÉ-PLAY • configure antes da fila"}</div></div><button id="bcs-close" class="bcs-x">×</button></div>
<div class="bcs-body">
  <div class="bcs-card">
    <div class="bcs-st">VIRTUAL MONITOR</div>
    <div class="bcs-row"><span>Monitor</span><select id="bcs-res-mode" class="bcs-select"><option value="native">NATIVO</option><option value="1920x1080">1920×1080</option><option value="2400x1080">2400×1080</option><option value="2532x1170">2532×1170</option><option value="2560x1080">2560×1080</option><option value="custom">CUSTOM</option></select></div>
    <div class="bcs-row" id="bcs-custom-row"><span>Custom</span><span><input id="bcs-res-w" class="bcs-select" style="width:72px" inputmode="numeric" value="1920"> × <input id="bcs-res-h" class="bcs-select" style="width:72px" inputmode="numeric" value="1080"></span></div>
    <div class="bcs-row"><span>FPS</span><select id="bcs-fps-mode" class="bcs-select"><option value="60">60 FPS</option><option value="120">120 FPS</option></select></div>
    <div class="bcs-row"><span>Bitrate</span><select id="bcs-bitrate-mode" class="bcs-select"><option value="auto">AUTO</option><option value="manual">MANUAL</option></select></div>
    <div class="bcs-row" id="bcs-bitrate-row"><span>Limite</span><span><input id="bcs-bitrate-range" type="range" min="5" max="80" step="1" value="40" style="width:120px"> <b id="bcs-bitrate-value">40 Mbps</b></span></div>
    <div class="bcs-row"><span>Configurado</span><b id="bcs-pref-res">--</b></div>
    <div class="bcs-row"><span>Cliente</span><b id="bcs-client-res">--</b></div>
    <div class="bcs-row"><span>Resolução alcançada</span><b id="bcs-achieved-res" class="bcs-achieved">--</b></div>
    <div class="bcs-row"><span>AUTO</span><b id="bcs-auto-state" class="bcs-status">DESLIGADO</b></div>
    <div class="bcs-row"><span>Status</span><b id="bcs-simple-status" class="bcs-status">AGUARDANDO</b></div>
    <div class="bcs-grid"><button id="bcs-apply-monitor" class="bcs-btn bcs-primary">APLICAR CONFIG.</button><button id="bcs-start-session" class="bcs-btn bcs-primary">ATIVAR AUTO</button></div>
    <div class="bcs-note" id="bcs-action-status">Configure Monitor + FPS + Bitrate. ATIVAR AUTO mantém este perfil nas próximas sessões até você voltar para SAFE.</div>
  </div>

  <div class="bcs-card">
    <div class="bcs-st">STREAM / CORE</div>
    <div class="bcs-row"><span>Codec</span><b id="bcs-codec">--</b></div>
    <div class="bcs-row"><span>FPS real</span><b id="bcs-dfps">--</b></div>
    <div class="bcs-row"><span>Bitrate</span><b id="bcs-br">--</b></div>
    <div class="bcs-row"><span>Estado</span><b id="bcs-control-state">SAFE</b></div>
  </div>

  <div class="bcs-card" id="bcs-input-card">
    <div class="bcs-st">INPUT COMPATIBILITY • EXPERIMENTAL</div>
    <div class="bcs-row"><span>Probe</span><b id="bcs-input-probe-state">OFF</b></div>
    <div class="bcs-row"><span>Keyboard Lock API</span><b id="bcs-input-keyboard-lock-cap">--</b></div>
    <div class="bcs-row"><span>Key Lock</span><b id="bcs-input-keyboard-lock-state">OFF</b></div>
    <div class="bcs-row"><span>Fullscreen / Pointer Lock</span><b><span id="bcs-input-fullscreen">--</span> / <span id="bcs-input-pointerlock">--</span></b></div>
    <div class="bcs-row"><span>Key↓ / Mouse↓ / Pointer↓</span><b id="bcs-input-counts">0/0/0</b></div>
    <div class="bcs-row"><span>Último evento</span><b id="bcs-input-last">--</b></div>
    <div class="bcs-grid"><button id="bcs-input-probe-toggle" class="bcs-btn bcs-primary">INICIAR PROBE</button><button id="bcs-input-lock-toggle" class="bcs-btn">LOCK ESC+TAB</button></div>
    <div class="bcs-note">Probe é observacional, OFF por padrão e para sozinho após 2 min. LOCK ESC+TAB é teste reversível via Keyboard Lock; exige fullscreen e interação do usuário. Nenhum input sintético é enviado ao PC remoto.</div>
  </div>

  <div class="bcs-card" id="bcs-analyzer-card">
    <div class="bcs-st">DEEP ANALYZER</div>
    <div class="bcs-row"><span>Estado</span><b id="bcs-deep-state">OFF</b></div>
    <div class="bcs-row"><span>Callback</span><b id="bcs-callback-hz">--</b></div>
    <div class="bcs-row"><span>Frames/callback</span><b id="bcs-frames-callback">--</b></div>
    <div class="bcs-row"><span>Pacing jitter</span><b id="bcs-pacing-jitter">--</b></div>
    <div class="bcs-row"><span>Custo callback</span><b id="bcs-deep-work">--</b></div>
    <div class="bcs-grid"><button id="bcs-deep-toggle" class="bcs-btn bcs-primary">INICIAR ANALYZER</button><button id="bcs-download" class="bcs-btn">BAIXAR LOG</button></div>
  </div>

  <button id="bcs-safe" class="bcs-btn bcs-danger">VOLTAR PARA SAFE</button>
</div>`;

  document.body.append(open, panel);
  $('bcs-close').addEventListener('click', () => setPanel(false));
  if (!IS_STREAM_DOCUMENT) {
    const streamCard = [...panel.querySelectorAll('.bcs-card')][1];
    if (streamCard) streamCard.style.display='none';
    if ($('bcs-safe')) $('bcs-safe').style.display='none';
    if ($('bcs-analyzer-card')) $('bcs-analyzer-card').style.display='none';
    if ($('bcs-input-card')) $('bcs-input-card').style.display='none';
    if ($('bcs-apply-monitor')) $('bcs-apply-monitor').textContent='SALVAR CONFIG.';
    if ($('bcs-start-session')) $('bcs-start-session').textContent='ATIVAR AUTO';
  } else {
    if ($('bcs-apply-monitor')) $('bcs-apply-monitor').textContent='APLICAR AO STREAM';
    if ($('bcs-start-session')) $('bcs-start-session').textContent='ATIVAR AUTO';
  }
  $('bcs-res-mode').value = lsGet(K.resolutionMode, 'native');
  $('bcs-res-w').value = lsGet(K.resolutionW, '1920');
  $('bcs-res-h').value = lsGet(K.resolutionH, '1080');
  $('bcs-fps-mode').value = Number(lsGet(K.fps,'120')) === 60 ? '60' : '120';
  $('bcs-bitrate-mode').value = lsGet(K.bitrateAuto,'true') !== 'false' ? 'auto' : 'manual';
  $('bcs-bitrate-range').value = String(clamp(Number(lsGet(K.bitrateManual,'40')) || 40,5,80));
  $('bcs-bitrate-value').textContent = `${$('bcs-bitrate-range').value} Mbps`;

  const refreshCustomVisibility = () => {
    const row = $('bcs-custom-row');
    if (row) row.style.display = lsGet(K.resolutionMode, 'native') === 'custom' ? 'flex' : 'none';
  };
  $('bcs-fps-mode').addEventListener('change', e => {
    const fps=Number(e.target.value) === 60 ? 60 : 120;
    lsSet(K.fps,fps);
    addEvent('FPS_PREFERENCE_CHANGE',{fps,source:'fpsRateValue'});
    saveProfilePreferences();
    updateUI();
  });
  const refreshBitrateVisibility = () => {
    const auto=lsGet(K.bitrateAuto,'true') !== 'false';
    const row=$('bcs-bitrate-row');
    if (row) row.style.display=auto ? 'none' : 'flex';
  };
  $('bcs-bitrate-mode').addEventListener('change', e => {
    const auto=e.target.value === 'auto';
    lsSet(K.bitrateAuto,auto ? 'true' : 'false');
    addEvent('BITRATE_PREFERENCE_CHANGE',{auto,mbps:auto?null:Number($('bcs-bitrate-range').value)});
    refreshBitrateVisibility();
    saveProfilePreferences();
    updateUI();
  });
  $('bcs-bitrate-range').addEventListener('input', e => {
    const mbps=clamp(Math.round(Number(e.target.value)||40),5,80);
    lsSet(K.bitrateManual,mbps);
    $('bcs-bitrate-value').textContent=`${mbps} Mbps`;
  });
  $('bcs-bitrate-range').addEventListener('change', e => {
    const mbps=clamp(Math.round(Number(e.target.value)||40),5,80);
    lsSet(K.bitrateManual,mbps);
    addEvent('BITRATE_PREFERENCE_CHANGE',{auto:false,mbps});
    saveProfilePreferences();
    updateUI();
  });
  $('bcs-res-mode').addEventListener('change', e => {
    lsSet(K.resolutionMode, e.target.value);
    S.control.preferenceMode = e.target.value;
    addEvent('VIRTUAL_MONITOR_PREFERENCE_CHANGE', { mode: e.target.value, target: resolutionTargetForMode(e.target.value) });
    saveProfilePreferences();
    refreshCustomVisibility();
    updateUI();
  });
  const saveCustom = () => {
    lsSet(K.resolutionW, $('bcs-res-w').value);
    lsSet(K.resolutionH, $('bcs-res-h').value);
    saveProfilePreferences();
    updateUI();
  };
  $('bcs-res-w').addEventListener('change', saveCustom);
  $('bcs-res-h').addEventListener('change', saveCustom);
  $('bcs-apply-monitor').addEventListener('click', applyVirtualMonitorFromUI);
  $('bcs-start-session').addEventListener('click', prepareNextSessionFromUI);
  $('bcs-safe').addEventListener('click', disarmResolutionControl);
  $('bcs-deep-toggle')?.addEventListener('click', () => setDeepAnalyzerEnabled(!S.deep.enabled,'UI'));
  $('bcs-input-probe-toggle')?.addEventListener('click', () => setInputProbeEnabled(!S.inputProbe.enabled,'UI'));
  $('bcs-input-lock-toggle')?.addEventListener('click', async () => {
    if (S.inputProbe.keyboardLock.active) await releaseKeyboardLock('USER_UI');
    else await requestKeyboardLockForGameKeys();
  });
  $('bcs-download')?.addEventListener('click', downloadJSON);

  refreshCustomVisibility();
  refreshBitrateVisibility();
  S.ui.built = true;
  setPanel(lsGet(K.panelOpen, 'false') === 'true');
  updateUI();
}

function waitForBody() {
  if (document.body) {
    createUI();
    bindGlobalSurfaceEvents();
    videoScanner();
    return;
  }
  setTimeout(waitForBody, 50);
}

function boot() {
  installPageBridge();
  addEvent('SUITE_BOOT',{
    version:VERSION,
    build:BUILD,
    architecture:'LEAN_PAGE_BRIDGE__PERSISTENT_AUTO_PROFILE__VIRTUAL_MONITOR_PLUS_NATIVE_FPS_AND_BITRATE__ON_DEMAND_INPUT_PROBE',
    controlModel:'PERSISTENT_AUTO_APPLY',
    profileEnabled:isAutoEnabled(),
    bootBehavior:isAutoEnabled() ? 'AUTO_APPLY_ENABLED' : 'SAFE',
    environment:{browser:ENV.browser,likelyPlatform:ENV.likelyPlatform},
    inputCompatibility:{probeEnabled:false,keyboardLock:CAP.input.keyboardLock,pointerEvents:CAP.input.pointer,pointerLock:CAP.input.pointerLock}
  });
  if (isAutoEnabled()) {
    addEvent('AUTO_PROFILE_BOOT',{
      resolutionMode:lsGet(K.resolutionMode,'native'),
      resolutionTarget:resolutionTarget(),
      fps:Number(lsGet(K.fps,'120'))===60?60:120,
      bitrateAuto:lsGet(K.bitrateAuto,'true')!=='false',
      bitrateMbps:lsGet(K.bitrateAuto,'true')!=='false' ? null : (Number(lsGet(K.bitrateManual,'0'))||null),
      streamDocument:IS_STREAM_DOCUMENT
    });
  }
  waitForBody();
  startSampler();
  void startLongSessionMonitor();
  setTimeout(()=>refreshContext(true),1200);
  debug(`Control Suite v${VERSION} ready`);
}

boot();

})();
