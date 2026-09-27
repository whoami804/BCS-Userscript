import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const basePath='control-suite-boosteroid-s1-1-safari-deferred-rc1.user.js';
const outPath='control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js';
const validationPath='validations/control-suite-v0.9.1-s1-2-safari-lifecycle-public-static.json';
const expectedBaseSha256='1c8b85d5b764d57b7c0f2f8ea06201bd1e73928c2b01324cd4ee81a24467af73';
const sha256=t=>crypto.createHash('sha256').update(t).digest('hex');
const base=fs.readFileSync(basePath,'utf8');
const baseSha=sha256(base);
if(baseSha!==expectedBaseSha256)throw new Error(`BASE_SHA_MISMATCH expected=${expectedBaseSha256} actual=${baseSha}`);
let source=base;const changes=[];
function replaceExact(label,from,to,countExpected=1){const count=source.split(from).length-1;if(count!==countExpected)throw new Error(`${label}: expected ${countExpected}, found ${count}`);source=source.replace(from,to);changes.push(label);}
function replaceBetween(label,start,end,replacement){const a=source.indexOf(start);if(a<0)throw new Error(`${label}: start not found`);const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`${label}: end not found`);source=source.slice(0,a)+replacement+source.slice(b);changes.push(label);}

replaceExact('metadata-version','// @version      0.9.0-s1-1-safari-deferred-rc1','// @version      0.9.1-s1-2-safari-lifecycle-rc1');
replaceExact('metadata-description','// @description  S1.1 Safari clean surface + deferred evidence: zero stream UI, cross-subdomain runtime proof after play.','// @description  S1.2 Safari lifecycle-safe clean surface: protected active snapshot, UI restoration and offline-gated evidence.');
replaceExact('metadata-update-url','https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-1-safari-deferred-evidence/control-suite-boosteroid-s1-1-safari-deferred-rc1.user.js','https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-2-safari-lifecycle-harness/control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js',2);
replaceExact('runtime-version',"const VERSION = '0.9.0-s1-1-safari-deferred-rc1';","const VERSION = '0.9.1-s1-2-safari-lifecycle-rc1';");
replaceExact('runtime-build',"const BUILD = 'Safari Clean Surface + Deferred Evidence - S1.1 RC1 on S1';","const BUILD = 'Safari Lifecycle Safe Clean Surface - S1.2 RC1 on S1.1';");
replaceExact('evidence-cookie',"const DEFERRED_EVIDENCE_COOKIE = 'bcs_s11_ev';","const DEFERRED_EVIDENCE_COOKIE = 'bcs_s12_ev';");
replaceExact('lifecycle-state-var','let deferredEvidenceLastWriteSec = -Infinity;',"let deferredEvidenceLastWriteSec = -Infinity;\nlet safariCleanSurfaceSessionActive = false;");

const deferredBlock=`// S1.2 LIFECYCLE POLICY START
function isConfirmedDeferredEvidence(evidence) {
  return evidence?.activeStreamConfirmed === true;
}

function sampleConfirmsActiveStream(sample) {
  return !!(sample && (sample.pcState === 'connected' || sample.streamActive === true) && (Number.isFinite(sample.decodedFPS) || Number.isFinite(sample.rtcFPS)));
}

function classifySafariStreamLifecycle(sample) {
  if (sampleConfirmsActiveStream(sample)) return 'ACTIVE';
  if (sample && sample.phase === 'PRE_STREAM' && sample.pcState == null && sample.streamActive !== true) return 'INACTIVE';
  return 'UNKNOWN';
}

function shouldReplaceDeferredEvidence(existing, next) {
  if (!next) return false;
  if (!existing) return true;
  if (isConfirmedDeferredEvidence(existing) && !isConfirmedDeferredEvidence(next)) return false;
  return true;
}
// S1.2 LIFECYCLE POLICY END

function readDeferredEvidence() {
  try {
    const prefix = \`${'${DEFERRED_EVIDENCE_COOKIE}'}=\`;
    const raw = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw.slice(prefix.length)));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeDeferredEvidence(payload) {
  try {
    const existing=readDeferredEvidence();
    if (!shouldReplaceDeferredEvidence(existing,payload)) return false;
    const value = encodeURIComponent(JSON.stringify(payload));
    document.cookie = \`${'${DEFERRED_EVIDENCE_COOKIE}'}=\${value}; Path=/; Domain=.boosteroid.com; Max-Age=${'${DEFERRED_EVIDENCE_MAX_AGE}'}; SameSite=Lax; Secure\`;
    return true;
  } catch { return false; }
}

function deferredEvidenceSnapshot(sample=null, reason='PERIODIC') {
  const s=sample||S.latestSample||null;
  const activeStreamConfirmed=sampleConfirmsActiveStream(s);
  return {
    schemaVersion:2,experiment:'S1_2_SAFARI_LIFECYCLE_SAFE_CLEAN_SURFACE',version:VERSION,build:BUILD,updatedAt:new Date().toISOString(),reason,
    cleanSurfaceBootConfirmed:true,activeStreamConfirmed,cleanSurface:true,lifecycleState:classifySafariStreamLifecycle(s),
    environment:{browser:ENV.browser,engine:ENV.engine,lab:S.lab,likelyPlatform:ENV.likelyPlatform},
    requested:{profileEnabled:isAutoEnabled(),resolutionMode:lsGet(K.resolutionMode,'native'),resolutionTarget:resolutionTarget(),fps:Number(lsGet(K.fps,'120'))===60?60:120,bitrateAuto:lsGet(K.bitrateAuto,'true')!=='false',bitrateMbps:lsGet(K.bitrateAuto,'true')!=='false'?null:(Number(lsGet(K.bitrateManual,'0'))||null)},
    achieved:{phase:s?.phase??S.phase.current,pcState:s?.pcState??S.lastPcState,inboundResolution:s?.inboundResolution??S.lastInboundResolution,rtcFPS:s?.rtcFPS??null,decodedFPS:s?.decodedFPS??null,bitrateMbps:s?.bitrateMbps??null,codec:s?.codec??S.lastCodec,rttMs:s?.rttMs??null,networkJitterMs:s?.networkJitterMs??null,packetLossPercent:s?.packetLossPercent??null,resolutionProofStatus:s?.resolutionProofStatus??S.control.proof?.status??null},
    runtimeIsolation:{h014c:mouseChordFixSnapshot(),h014d:mouseMotionSchedulingFixSnapshot()},
    runtime:{sampleCount:S.samples.count,samplesAttempted:S.sampler.samplesAttempted,bridgeReady:S.bridgeReady,bridgeErrors:S.bridgeErrors,skippedSamples:S.sampler.skipped}
  };
}

function shouldUseSafariDeferredEvidence() {
  return inferLab() === 'LAB-A' && ENV.browser === 'Safari' && ENV.engine === 'WebKit';
}

function persistDeferredEvidence(sample=null, reason='PERIODIC') {
  if (!shouldUseSafariDeferredEvidence()) return false;
  return writeDeferredEvidence(deferredEvidenceSnapshot(sample,reason));
}

function downloadDeferredEvidence() {
  const evidence=readDeferredEvidence();
  if (!evidence) return;
  const text=JSON.stringify(evidence,null,2);
  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const t=new Date().toISOString().replace(/[:.]/g,'-');
  const a=document.createElement('a');a.href=url;a.download=\`bcs-s1-2-deferred-evidence-\${t}.json\`;a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

`;
replaceBetween('deferred-evidence-policy-and-storage','function readDeferredEvidence()','function isAutoEnabled()',deferredBlock);

const sampleStart='  S.latestSample=sample; S.samples.push(sample);';
const sampleEnd='  if (S.measurement.resumeGraceSamples>0) S.measurement.resumeGraceSamples--;';
const sampleReplacement=`  S.latestSample=sample; S.samples.push(sample);
  syncSafariCleanSurfaceLifecycle(sample);
  if (shouldUseSafariDeferredEvidence() && sample.t - deferredEvidenceLastWriteSec >= DEFERRED_EVIDENCE_INTERVAL_SEC) {
    const evidenceStart=now();
    persistDeferredEvidence(sample,'PERIODIC_SAMPLE');
    deferredEvidenceLastWriteSec=sample.t;
    localWorkMs+=now()-evidenceStart;
    sample.suiteLocalWorkMs=round(localWorkMs,3);
  }
`;
replaceBetween('sample-lifecycle-and-evidence',sampleStart,sampleEnd,sampleReplacement);
replaceExact('ui-status-label',"deferred.activeStreamConfirmed?'RUNTIME CONFIRMADO':'S1.1 CARREGOU · STREAM NÃO CONFIRMADO'","deferred.activeStreamConfirmed?'RUNTIME CONFIRMADO':'S1.2 CARREGOU · STREAM NÃO CONFIRMADO'");
replaceExact('ui-last-session-label','Última sessão S1.1','Última sessão S1.2');

const lifecycleBlock=`function destroyProductUIForSafariCleanSurface() {
  try { $('bcs-ui-root')?.remove(); } catch {}
  try { $('bcs-style')?.remove(); } catch {}
  S.ui.open=false;
  S.ui.built=false;
}

function syncSafariCleanSurfaceLifecycle(sample=null) {
  if (!shouldUseSafariDeferredEvidence()) return;
  const state=classifySafariStreamLifecycle(sample);
  if (state === 'ACTIVE') {
    safariCleanSurfaceSessionActive=true;
    if (S.ui.built || $('bcs-ui-root')) destroyProductUIForSafariCleanSurface();
    return;
  }
  if (state === 'INACTIVE' && safariCleanSurfaceSessionActive) {
    safariCleanSurfaceSessionActive=false;
    if (document.body && !S.ui.built && !$('bcs-ui-root')) createUI();
  }
}

function waitForBody() {
  if(document.body){
    createUI();
    if (shouldUseSafariDeferredEvidence()) {
      persistDeferredEvidence(null,'BOOT_OR_PRE_STREAM');
      window.addEventListener('pagehide',()=>persistDeferredEvidence(S.latestSample,'PAGEHIDE'),{passive:true});
    }
    bindGlobalSurfaceEvents();
    videoScanner();
    return;
  }
  setTimeout(waitForBody,50);
}

`;
replaceBetween('dynamic-clean-surface-lifecycle','function shouldUseSafariCleanVideoSurface()','function boot()',lifecycleBlock);
if(source.includes('shouldUseSafariCleanVideoSurface'))throw new Error('STALE_HOSTNAME_BASED_CLEAN_SURFACE_GATE_REMAINS');

const h014cStart='// H-014C PRODUCTION FIX - MINIMAL COMPATIBILITY GUARD BYPASS';
const h014dStart='// H-014D PRODUCTION FIX - MINIMAL MOUSE SCHEDULING REROUTE';
const immersiveStart='// IMMERSIVE GAME MODE - V2 NATIVE-FIRST / PLAY-FIRST';
const bridgeStart='function installPageBridge()';
const bridgeEnd='// -----------------------------------------------------------------------------\n// VIDEO LIFECYCLE - PLAY-FIRST';
const sliceBetween=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);if(a<0||b<0)throw new Error(`missing block ${start}`);return text.slice(a,b);};
const frozen={h014c:{base:sha256(sliceBetween(base,h014cStart,h014dStart)),candidate:sha256(sliceBetween(source,h014cStart,h014dStart))},h014d:{base:sha256(sliceBetween(base,h014dStart,immersiveStart)),candidate:sha256(sliceBetween(source,h014dStart,immersiveStart))},pageBridge:{base:sha256(sliceBetween(base,bridgeStart,bridgeEnd)),candidate:sha256(sliceBetween(source,bridgeStart,bridgeEnd))}};
for(const [name,v] of Object.entries(frozen))if(v.base!==v.candidate)throw new Error(`${name.toUpperCase()}_BLOCK_CHANGED`);
const baseGetStats=(base.match(/\.getStats\(/g)||[]).length,candidateGetStats=(source.match(/\.getStats\(/g)||[]).length;if(baseGetStats!==candidateGetStats)throw new Error(`GETSTATS_CALL_COUNT_CHANGED base=${baseGetStats} candidate=${candidateGetStats}`);
fs.writeFileSync(outPath,source);
const check=spawnSync(process.execPath,['--check',outPath],{encoding:'utf8'});if(check.status!==0)throw new Error(`NODE_CHECK_FAILED\n${check.stderr}`);
const validation={artifact:outPath,version:'0.9.1-s1-2-safari-lifecycle-rc1',status:'STATIC_BUILT_AWAITING_PUBLIC_LIFECYCLE_HARNESS',base:{artifact:basePath,sha256:baseSha,requiredSha256:expectedBaseSha256},candidate:{sha256:sha256(source),bytes:Buffer.byteLength(source),lines:source.split('\n').length},nodeCheck:'PASS',exactChanges:changes,frozenBlocks:{h014c:{status:'BYTE_IDENTICAL_TO_PUBLIC_S1_1',sha256:frozen.h014c.candidate},h014d:{status:'BYTE_IDENTICAL_TO_PUBLIC_S1_1',sha256:frozen.h014d.candidate},pageBridge:{status:'BYTE_IDENTICAL_TO_PUBLIC_S1_1',sha256:frozen.pageBridge.candidate},getStatsCallCount:{base:baseGetStats,candidate:candidateGetStats},transportAndPayload:'NOT_EDITED'}};
fs.writeFileSync(validationPath,JSON.stringify(validation,null,2)+'\n');console.log(JSON.stringify(validation,null,2));
