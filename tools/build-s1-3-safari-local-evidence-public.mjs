import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const basePath='control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js';
const outPath='control-suite-boosteroid-s1-3-safari-local-evidence-rc1.user.js';
const validationPath='validations/control-suite-v0.9.2-s1-3-safari-local-evidence-public-static.json';
const expectedBaseSha256='12074924a0a74ea9381d65d89b315ffab91422bb0586f143792b752ae906d9a5';
const sha256=t=>crypto.createHash('sha256').update(t).digest('hex');
const base=fs.readFileSync(basePath,'utf8');
const baseSha=sha256(base);
if(baseSha!==expectedBaseSha256)throw new Error(`BASE_SHA_MISMATCH expected=${expectedBaseSha256} actual=${baseSha}`);
let source=base;const changes=[];
function replaceExact(label,from,to,countExpected=1){const count=source.split(from).length-1;if(count!==countExpected)throw new Error(`${label}: expected ${countExpected}, found ${count}`);source=source.split(from).join(to);changes.push(label);}
function replaceBetween(label,start,end,replacement){const a=source.indexOf(start);if(a<0)throw new Error(`${label}: start not found`);const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`${label}: end not found`);source=source.slice(0,a)+replacement+source.slice(b);changes.push(label);}

replaceExact('metadata-version','// @version      0.9.1-s1-2-safari-lifecycle-rc1','// @version      0.9.2-s1-3-safari-local-evidence-rc1');
replaceExact('metadata-description','// @description  S1.2 Safari lifecycle-safe clean surface: protected active snapshot, UI restoration and offline-gated evidence.','// @description  S1.3 Safari clean surface with origin-local evidence; no session JSON in request cookies.');
replaceExact('metadata-update-url','https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-2-safari-lifecycle-harness/control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js','https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-3-safari-local-evidence/control-suite-boosteroid-s1-3-safari-local-evidence-rc1.user.js',2);
replaceExact('runtime-version',"const VERSION = '0.9.1-s1-2-safari-lifecycle-rc1';","const VERSION = '0.9.2-s1-3-safari-local-evidence-rc1';");
replaceExact('runtime-build',"const BUILD = 'Safari Lifecycle Safe Clean Surface - S1.2 RC1 on S1.1';","const BUILD = 'Safari Local Evidence - S1.3 RC1 on S1.2 Lifecycle';");
replaceExact('evidence-storage-constants',"const DEFERRED_EVIDENCE_COOKIE = 'bcs_s12_ev';\nconst DEFERRED_EVIDENCE_MAX_AGE = 24 * 60 * 60;","const DEFERRED_EVIDENCE_STORAGE_KEY = 'bcs.s13.evidence';\nconst LEGACY_EVIDENCE_COOKIES = Object.freeze(['bcs_s11_ev','bcs_s12_ev']);");
replaceExact('policy-marker-start','// S1.2 LIFECYCLE POLICY START','// S1.3 LIFECYCLE POLICY START');
replaceExact('policy-marker-end','// S1.2 LIFECYCLE POLICY END','// S1.3 LIFECYCLE POLICY END');

const localEvidenceStorage=`function cleanupLegacyEvidenceCookies() {
  try {
    for (const name of LEGACY_EVIDENCE_COOKIES) {
      const base=\`${'${name}'}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure\`;
      document.cookie=base;
      document.cookie=\`${'${base}'}; Domain=.boosteroid.com\`;
      document.cookie=\`${'${base}'}; Domain=${'${location.hostname}'}\`;
    }
  } catch {}
}

function readDeferredEvidence() {
  try {
    const raw=localStorage.getItem(DEFERRED_EVIDENCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed=JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeDeferredEvidence(payload) {
  try {
    const existing=readDeferredEvidence();
    if (!shouldReplaceDeferredEvidence(existing,payload)) return false;
    localStorage.setItem(DEFERRED_EVIDENCE_STORAGE_KEY,JSON.stringify(payload));
    return true;
  } catch { return false; }
}

cleanupLegacyEvidenceCookies();

`;
replaceBetween('origin-local-evidence-storage','function readDeferredEvidence()','function deferredEvidenceSnapshot',localEvidenceStorage);
replaceExact('evidence-schema-experiment',"    schemaVersion:2,experiment:'S1_2_SAFARI_LIFECYCLE_SAFE_CLEAN_SURFACE',version:VERSION,build:BUILD,updatedAt:new Date().toISOString(),reason,","    schemaVersion:3,experiment:'S1_3_SAFARI_LOCAL_EVIDENCE_CLEAN_SURFACE',evidenceStorage:'LOCAL_STORAGE_ORIGIN',version:VERSION,build:BUILD,updatedAt:new Date().toISOString(),reason,");
replaceExact('download-filename','a.href=url;a.download=`bcs-s1-2-deferred-evidence-${t}.json`;a.style.display=\'none\';','a.href=url;a.download=`bcs-s1-3-local-evidence-${t}.json`;a.style.display=\'none\';');
replaceExact('ui-status-label',"deferred.activeStreamConfirmed?'RUNTIME CONFIRMADO':'S1.2 CARREGOU · STREAM NÃO CONFIRMADO'","deferred.activeStreamConfirmed?'RUNTIME CONFIRMADO':'S1.3 CARREGOU · STREAM NÃO CONFIRMADO'");
replaceExact('ui-last-session-label','Última sessão S1.2','Última sessão S1.3');

if(source.includes('DEFERRED_EVIDENCE_COOKIE'))throw new Error('DEFERRED_EVIDENCE_COOKIE_STILL_PRESENT');
if(source.includes('bcs_s13_ev'))throw new Error('S1_3_COOKIE_STORAGE_FORBIDDEN');
if(!source.includes("localStorage.setItem(DEFERRED_EVIDENCE_STORAGE_KEY"))throw new Error('LOCAL_EVIDENCE_WRITE_MISSING');
if(!source.includes("localStorage.getItem(DEFERRED_EVIDENCE_STORAGE_KEY"))throw new Error('LOCAL_EVIDENCE_READ_MISSING');
const expectedURL='https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-3-safari-local-evidence/control-suite-boosteroid-s1-3-safari-local-evidence-rc1.user.js';
if(!source.includes(`// @updateURL    ${expectedURL}`)||!source.includes(`// @downloadURL  ${expectedURL}`))throw new Error('PUBLIC_METADATA_URL_MISMATCH');

const h014cStart='// H-014C PRODUCTION FIX - MINIMAL COMPATIBILITY GUARD BYPASS';
const h014dStart='// H-014D PRODUCTION FIX - MINIMAL MOUSE SCHEDULING REROUTE';
const immersiveStart='// IMMERSIVE GAME MODE - V2 NATIVE-FIRST / PLAY-FIRST';
const bridgeStart='function installPageBridge()';
const bridgeEnd='// -----------------------------------------------------------------------------\n// VIDEO LIFECYCLE - PLAY-FIRST';
const sliceBetween=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);if(a<0||b<0)throw new Error(`missing block ${start}`);return text.slice(a,b);};
const frozen={h014c:{base:sha256(sliceBetween(base,h014cStart,h014dStart)),candidate:sha256(sliceBetween(source,h014cStart,h014dStart))},h014d:{base:sha256(sliceBetween(base,h014dStart,immersiveStart)),candidate:sha256(sliceBetween(source,h014dStart,immersiveStart))},pageBridge:{base:sha256(sliceBetween(base,bridgeStart,bridgeEnd)),candidate:sha256(sliceBetween(source,bridgeStart,bridgeEnd))}};
for(const [name,v] of Object.entries(frozen))if(v.base!==v.candidate)throw new Error(`${name.toUpperCase()}_BLOCK_CHANGED`);
const baseGetStats=(base.match(/\.getStats\(/g)||[]).length,candidateGetStats=(source.match(/\.getStats\(/g)||[]).length;
if(baseGetStats!==candidateGetStats)throw new Error(`GETSTATS_CALL_COUNT_CHANGED base=${baseGetStats} candidate=${candidateGetStats}`);
fs.writeFileSync(outPath,source);
const check=spawnSync(process.execPath,['--check',outPath],{encoding:'utf8'});if(check.status!==0)throw new Error(`NODE_CHECK_FAILED\n${check.stderr}`);
const validation={artifact:outPath,version:'0.9.2-s1-3-safari-local-evidence-rc1',status:'STATIC_BUILT_AWAITING_PUBLIC_STORAGE_LIFECYCLE_HARNESS',base:{artifact:basePath,sha256:baseSha,requiredSha256:expectedBaseSha256},candidate:{sha256:sha256(source),bytes:Buffer.byteLength(source),lines:source.split('\n').length},nodeCheck:'PASS',exactChanges:changes,metadataGate:{updateURL:expectedURL,downloadURL:expectedURL,staleS12URL:false},storagePolicy:{sessionEvidence:'LOCAL_STORAGE_ORIGIN',requestCookieEvidence:'FORBIDDEN',legacyEvidenceCookiesCleaned:['bcs_s11_ev','bcs_s12_ev'],sharedProfileCookie:'PRESERVED_SMALL_CONFIG_ONLY'},frozenBlocks:{h014c:{status:'BYTE_IDENTICAL_TO_PUBLIC_S1_2',sha256:frozen.h014c.candidate},h014d:{status:'BYTE_IDENTICAL_TO_PUBLIC_S1_2',sha256:frozen.h014d.candidate},pageBridge:{status:'BYTE_IDENTICAL_TO_PUBLIC_S1_2',sha256:frozen.pageBridge.candidate},getStatsCallCount:{base:baseGetStats,candidate:candidateGetStats},transportAndPayload:'NOT_EDITED'}};
fs.writeFileSync(validationPath,JSON.stringify(validation,null,2)+'\n');console.log(JSON.stringify(validation,null,2));
