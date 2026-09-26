import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const basePath = 'control-suite-boosteroid-s1-safari-clean-rc1.user.js';
const outPath = 'control-suite-boosteroid-s1-1-safari-deferred-rc1.user.js';
const validationPath = 'validations/control-suite-v0.9.0-s1-1-safari-deferred-evidence-rc1-public-static.json';
const expectedPublicBaseSha256 = '28841e826307944ee77d36751eb8168b0cdb717658a584628935f27840767988';
const expectedEngineeringBaseSha256 = '9eb68882d76eddb31ba55b0baa5e96fbdb11f28fb215719c75aee203e114b631';
const expectedEngineeringCandidateSha256 = '609812d28c700af3ab2a5b81ca5d2b8ffebb0c0f11264bb969144b5fd8727232';
const branch = 'feat/s1-1-safari-deferred-evidence';
const candidateRaw = `https://raw.githubusercontent.com/whoami804/BCS-Userscript/${branch}/${outPath}`;

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const stripDistributionMetadata = text => text
  .split('\n')
  .filter(line => !/^\/\/ @(homepageURL|updateURL|downloadURL)\s/.test(line))
  .join('\n');

const base = fs.readFileSync(basePath, 'utf8');
const baseSha = sha256(base);
if (baseSha !== expectedPublicBaseSha256) throw new Error(`PUBLIC_BASE_SHA_MISMATCH expected=${expectedPublicBaseSha256} actual=${baseSha}`);
const normalizedBaseSha = sha256(stripDistributionMetadata(base));
if (normalizedBaseSha !== expectedEngineeringBaseSha256) throw new Error(`NORMALIZED_BASE_SHA_MISMATCH expected=${expectedEngineeringBaseSha256} actual=${normalizedBaseSha}`);

let source = base;
const changes = [];
function replaceExact(label, from, to, expectedCount = 1) {
  const count = source.split(from).length - 1;
  if (count !== expectedCount) throw new Error(`${label}: expected ${expectedCount} occurrence(s), found ${count}`);
  source = source.replace(from, to);
  changes.push(label);
}

replaceExact('metadata-version', '// @version      0.9.0-s1-safari-clean-rc1', '// @version      0.9.0-s1-1-safari-deferred-rc1');
replaceExact(
  'metadata-description',
  '// @description  S1 Safari clean-video-surface candidate: no BCS visual surface inside LAB-A stream documents.',
  '// @description  S1.1 Safari clean surface + deferred evidence: zero stream UI, cross-subdomain runtime proof after play.'
);
replaceExact(
  'metadata-update-url',
  '// @updateURL    https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-safari-clean-video-surface/control-suite-boosteroid-s1-safari-clean-rc1.user.js',
  `// @updateURL    ${candidateRaw}`
);
replaceExact(
  'metadata-download-url',
  '// @downloadURL  https://raw.githubusercontent.com/whoami804/BCS-Userscript/feat/s1-safari-clean-video-surface/control-suite-boosteroid-s1-safari-clean-rc1.user.js',
  `// @downloadURL  ${candidateRaw}`
);
replaceExact('runtime-version', "const VERSION = '0.9.0-s1-safari-clean-rc1';", "const VERSION = '0.9.0-s1-1-safari-deferred-rc1';");
replaceExact(
  'runtime-build',
  "const BUILD = 'Safari Clean Video Surface - S1 RC1 on S0 Runtime Isolation';",
  "const BUILD = 'Safari Clean Surface + Deferred Evidence - S1.1 RC1 on S1';"
);

replaceExact(
  'deferred-evidence-constants',
  `const SHARED_COOKIE = 'bcs_v07_cfg';\nconst SHARED_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;`,
  `const SHARED_COOKIE = 'bcs_v07_cfg';\nconst SHARED_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;\nconst DEFERRED_EVIDENCE_COOKIE = 'bcs_s11_ev';\nconst DEFERRED_EVIDENCE_MAX_AGE = 24 * 60 * 60;\nconst DEFERRED_EVIDENCE_INTERVAL_SEC = 15;\nlet deferredEvidenceLastWriteSec = -Infinity;`
);

const afterWriteShared = `function writeSharedConfig(cfg) {\n  try {\n    const value = encodeURIComponent(JSON.stringify(cfg));\n    document.cookie = \`${'${SHARED_COOKIE}'}=\${value}; Path=/; Domain=.boosteroid.com; Max-Age=${'${SHARED_COOKIE_MAX_AGE}'}; SameSite=Lax; Secure\`;\n    return true;\n  } catch { return false; }\n}\n`;
const deferredFunctions = `${afterWriteShared}\nfunction readDeferredEvidence() {\n  try {\n    const prefix = \`${'${DEFERRED_EVIDENCE_COOKIE}'}=\`;\n    const raw = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));\n    if (!raw) return null;\n    const parsed = JSON.parse(decodeURIComponent(raw.slice(prefix.length)));\n    return parsed && typeof parsed === 'object' ? parsed : null;\n  } catch { return null; }\n}\n\nfunction writeDeferredEvidence(payload) {\n  try {\n    const value = encodeURIComponent(JSON.stringify(payload));\n    document.cookie = \`${'${DEFERRED_EVIDENCE_COOKIE}'}=\${value}; Path=/; Domain=.boosteroid.com; Max-Age=${'${DEFERRED_EVIDENCE_MAX_AGE}'}; SameSite=Lax; Secure\`;\n    return true;\n  } catch { return false; }\n}\n\nfunction deferredEvidenceSnapshot(sample=null, reason='PERIODIC') {\n  const s=sample||S.latestSample||null;\n  const activeStreamConfirmed=!!(s && (s.pcState==='connected'||s.streamActive) && (Number.isFinite(s.decodedFPS)||Number.isFinite(s.rtcFPS)));\n  return {\n    schemaVersion:1,experiment:'S1_1_SAFARI_CLEAN_SURFACE_DEFERRED_EVIDENCE',version:VERSION,build:BUILD,updatedAt:new Date().toISOString(),reason,\n    cleanSurfaceBootConfirmed:true,activeStreamConfirmed,cleanSurface:true,\n    environment:{browser:ENV.browser,engine:ENV.engine,lab:S.lab,likelyPlatform:ENV.likelyPlatform},\n    requested:{profileEnabled:isAutoEnabled(),resolutionMode:lsGet(K.resolutionMode,'native'),resolutionTarget:resolutionTarget(),fps:Number(lsGet(K.fps,'120'))===60?60:120,bitrateAuto:lsGet(K.bitrateAuto,'true')!=='false',bitrateMbps:lsGet(K.bitrateAuto,'true')!=='false'?null:(Number(lsGet(K.bitrateManual,'0'))||null)},\n    achieved:{phase:s?.phase??S.phase.current,pcState:s?.pcState??S.lastPcState,inboundResolution:s?.inboundResolution??S.lastInboundResolution,rtcFPS:s?.rtcFPS??null,decodedFPS:s?.decodedFPS??null,bitrateMbps:s?.bitrateMbps??null,codec:s?.codec??S.lastCodec,rttMs:s?.rttMs??null,networkJitterMs:s?.networkJitterMs??null,packetLossPercent:s?.packetLossPercent??null,resolutionProofStatus:s?.resolutionProofStatus??S.control.proof?.status??null},\n    runtimeIsolation:{h014c:mouseChordFixSnapshot(),h014d:mouseMotionSchedulingFixSnapshot()},\n    runtime:{sampleCount:S.samples.count,samplesAttempted:S.sampler.samplesAttempted,bridgeReady:S.bridgeReady,bridgeErrors:S.bridgeErrors,skippedSamples:S.sampler.skipped}\n  };\n}\n\nfunction persistDeferredEvidence(sample=null, reason='PERIODIC') {\n  if (!shouldUseSafariCleanVideoSurface()) return false;\n  return writeDeferredEvidence(deferredEvidenceSnapshot(sample,reason));\n}\n\nfunction downloadDeferredEvidence() {\n  const evidence=readDeferredEvidence();\n  if (!evidence) return;\n  const text=JSON.stringify(evidence,null,2);\n  const blob=new Blob([text],{type:'application/json;charset=utf-8'});\n  const url=URL.createObjectURL(blob);\n  const t=new Date().toISOString().replace(/[:.]/g,'-');\n  const a=document.createElement('a');a.href=url;a.download=\`bcs-s1-1-deferred-evidence-\${t}.json\`;a.style.display='none';\n  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);\n}\n`;
replaceExact('deferred-evidence-functions', afterWriteShared, deferredFunctions);

replaceExact(
  'periodic-deferred-evidence',
  `  S.latestSample=sample; S.samples.push(sample);\n  if (S.measurement.resumeGraceSamples>0) S.measurement.resumeGraceSamples--;\n  if (cycleWallMs>=SAMPLE_MS) S.sampler.skipped++;\n  return cycleWallMs;`,
  `  S.latestSample=sample; S.samples.push(sample);\n  if (shouldUseSafariCleanVideoSurface() && sample.t - deferredEvidenceLastWriteSec >= DEFERRED_EVIDENCE_INTERVAL_SEC) {\n    const evidenceStart=now();\n    persistDeferredEvidence(sample,'PERIODIC_ACTIVE_STREAM');\n    deferredEvidenceLastWriteSec=sample.t;\n    localWorkMs+=now()-evidenceStart;\n    sample.suiteLocalWorkMs=round(localWorkMs,3);\n  }\n  if (S.measurement.resumeGraceSamples>0) S.measurement.resumeGraceSamples--;\n  if (cycleWallMs>=SAMPLE_MS) S.sampler.skipped++;\n  return cycleWallMs;`
);

replaceExact(
  'deferred-evidence-ui-state',
  `  const session=$('bcs-session-card');if(session)session.style.display=IS_STREAM_DOCUMENT?'block':'none';\n}`,
  `  const session=$('bcs-session-card');if(session)session.style.display=IS_STREAM_DOCUMENT?'block':'none';\n  const deferred=readDeferredEvidence();\n  const deferredCard=$('bcs-last-session-card');\n  if(deferredCard)deferredCard.style.display=deferred?'block':'none';\n  if(deferred){\n    setText('bcs-last-session-status',deferred.activeStreamConfirmed?'RUNTIME CONFIRMADO':'S1.1 CARREGOU · STREAM NÃO CONFIRMADO');\n    const a=deferred.achieved||{};\n    setText('bcs-last-session-summary',\`${'${formatRes(a.inboundResolution)}'} · ${'${Number.isFinite(a.decodedFPS)?a.decodedFPS.toFixed(1)+\' FPS\':\'--\'}'} · ${'${String(a.codec||\'--\').replace(\'video/\',\'\')}'} · ${'${Number.isFinite(a.rttMs)?Math.round(a.rttMs)+\' ms\':\'--\'}'}\`);\n  }\n}`
);

replaceExact(
  'deferred-evidence-support-card',
  `  <div class=\"bcs-section\"><div class=\"bcs-section-title\">Suporte</div></div>\n  <div class=\"bcs-card\"><div class=\"bcs-card-top\"><div class=\"bcs-card-main\"><div class=\"bcs-label\">Log</div><div class=\"bcs-desc\">Baixa o relatório JSON da sessão.</div></div></div><div class=\"bcs-control\"><button id=\"bcs-download\" class=\"bcs-btn\" type=\"button\">BAIXAR LOG</button></div></div>`,
  `  <div class=\"bcs-section\"><div class=\"bcs-section-title\">Suporte</div></div>\n  <div class=\"bcs-card\" id=\"bcs-last-session-card\" style=\"display:none\"><div class=\"bcs-card-top\"><div class=\"bcs-card-main\"><div class=\"bcs-label\">Última sessão S1.1</div><div id=\"bcs-last-session-status\" class=\"bcs-desc\">--</div></div><span class=\"bcs-badge bcs-session\">DEFERRED</span></div><div id=\"bcs-last-session-summary\" class=\"bcs-desc\" style=\"margin-top:8px\">--</div><div class=\"bcs-control\"><button id=\"bcs-download-last-session\" class=\"bcs-btn\" type=\"button\">BAIXAR LOG DA ÚLTIMA SESSÃO</button></div></div>\n  <div class=\"bcs-card\"><div class=\"bcs-card-top\"><div class=\"bcs-card-main\"><div class=\"bcs-label\">Log</div><div class=\"bcs-desc\">Baixa o relatório JSON da sessão atual.</div></div></div><div class=\"bcs-control\"><button id=\"bcs-download\" class=\"bcs-btn\" type=\"button\">BAIXAR LOG</button></div></div>`
);
replaceExact('deferred-evidence-download-handler', `  $('bcs-download').addEventListener('click',downloadJSON);`, `  $('bcs-download').addEventListener('click',downloadJSON);\n  $('bcs-download-last-session').addEventListener('click',downloadDeferredEvidence);`);
replaceExact(
  'clean-surface-boot-evidence',
  `      S.ui.open=false;\n      S.ui.built=false;\n      addEvent('SAFARI_CLEAN_VIDEO_SURFACE_ACTIVE',{`,
  `      S.ui.open=false;\n      S.ui.built=false;\n      persistDeferredEvidence(null,'CLEAN_SURFACE_BOOT');\n      window.addEventListener('pagehide',()=>persistDeferredEvidence(S.latestSample,'PAGEHIDE'),{passive:true});\n      addEvent('SAFARI_CLEAN_VIDEO_SURFACE_ACTIVE',{`
);

const normalizedCandidateSha = sha256(stripDistributionMetadata(source));
if (normalizedCandidateSha !== expectedEngineeringCandidateSha256) throw new Error(`NORMALIZED_CANDIDATE_SHA_MISMATCH expected=${expectedEngineeringCandidateSha256} actual=${normalizedCandidateSha}`);

fs.mkdirSync('validations',{recursive:true});
fs.writeFileSync(outPath,source);
const check=spawnSync(process.execPath,['--check',outPath],{encoding:'utf8'});
if(check.status!==0)throw new Error(`NODE_CHECK_FAILED\n${check.stderr}`);

const validation={
  artifact:outPath,version:'0.9.0-s1-1-safari-deferred-rc1',status:'STATIC_PASS_PUBLIC_LAB_A_DEFERRED_EVIDENCE_LIVE_READY',
  base:{publicSha256:baseSha,requiredPublicSha256:expectedPublicBaseSha256,normalizedEngineeringSha256:normalizedBaseSha,requiredEngineeringSha256:expectedEngineeringBaseSha256},
  candidate:{publicSha256:sha256(source),normalizedEngineeringSha256:normalizedCandidateSha,requiredEngineeringCandidateSha256:expectedEngineeringCandidateSha256,bytes:Buffer.byteLength(source),lines:source.split('\n').length,updateURL:candidateRaw,downloadURL:candidateRaw},
  nodeCheck:'PASS',exactChanges:changes,distributionOnlyDifferenceFromEngineeringCandidate:true,
  experiment:{cleanSurfacePreserved:true,streamUiCreation:false,deferredEvidenceTransport:'Domain=.boosteroid.com cookie',persistenceIntervalSec:15,normalPageDownload:true}
};
fs.writeFileSync(validationPath,JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify(validation,null,2));
