import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const artifact=process.argv[2]||'control-suite-boosteroid-s1-2-safari-lifecycle-rc1.user.js';
const output=process.argv[3]||'validations/control-suite-v0.9.1-s1-2-safari-lifecycle-public-harness.json';
const src=fs.readFileSync(artifact,'utf8');
const sha256=t=>crypto.createHash('sha256').update(t).digest('hex');
const checks=[];
const pass=(name,details={})=>checks.push({name,status:'PASS',...details});
const assert=(cond,name,details={})=>{if(!cond)throw new Error(`HARNESS_FAIL ${name} ${JSON.stringify(details)}`);pass(name,details);};

const policyStart='// S1.2 LIFECYCLE POLICY START';
const policyEnd='// S1.2 LIFECYCLE POLICY END';
const a=src.indexOf(policyStart),b=src.indexOf(policyEnd);
assert(a>=0&&b>a,'POLICY_MARKERS_PRESENT');
const policyCode=src.slice(a+policyStart.length,b);
const policyCtx={Number};vm.createContext(policyCtx);
vm.runInContext(`${policyCode}\nthis.policy={isConfirmedDeferredEvidence,sampleConfirmsActiveStream,classifySafariStreamLifecycle,shouldReplaceDeferredEvidence};`,policyCtx);
const P=policyCtx.policy;

const pre={phase:'PRE_STREAM',pcState:null,streamActive:false,decodedFPS:null,rtcFPS:null};
const active={phase:'STEADY',pcState:'connected',streamActive:true,decodedFPS:119.94,rtcFPS:120,inboundResolution:{width:2400,height:1080},codec:'video/H264',rttMs:14,bitrateMbps:72.4};
const active2={...active,decodedFPS:119.88,rttMs:13,bitrateMbps:75.1};
const exit={...pre};
assert(P.classifySafariStreamLifecycle(pre)==='INACTIVE','PRE_STREAM_CLASSIFIES_INACTIVE');
assert(P.classifySafariStreamLifecycle(active)==='ACTIVE','ACTIVE_CLASSIFIES_ACTIVE');
assert(P.classifySafariStreamLifecycle(exit)==='INACTIVE','EXIT_CLASSIFIES_INACTIVE');

let stored=null;
const write=next=>{if(P.shouldReplaceDeferredEvidence(stored,next)){stored=structuredClone(next);return true;}return false;};
const bootEvidence={activeStreamConfirmed:false,achieved:{phase:'PRE_STREAM'}};
const activeEvidence={activeStreamConfirmed:true,achieved:{phase:'STEADY',pcState:'connected',inboundResolution:{width:2400,height:1080},decodedFPS:119.94,rtcFPS:120,codec:'video/H264',rttMs:14,bitrateMbps:72.4}};
const refreshEvidence={activeStreamConfirmed:true,achieved:{...activeEvidence.achieved,decodedFPS:119.88,rttMs:13,bitrateMbps:75.1}};
const exitEvidence={activeStreamConfirmed:false,achieved:{phase:'PRE_STREAM',pcState:null,inboundResolution:null,decodedFPS:null,codec:null,rttMs:null}};
assert(write(bootEvidence)===true,'BOOT_EVIDENCE_WRITES');
assert(write(activeEvidence)===true,'ACTIVE_EVIDENCE_REPLACES_BOOT');
assert(write(refreshEvidence)===true,'ACTIVE_EVIDENCE_CAN_REFRESH');
const protectedBefore=JSON.stringify(stored);
assert(write(exitEvidence)===false,'PRE_STREAM_CANNOT_OVERWRITE_CONFIRMED');
assert(JSON.stringify(stored)===protectedBefore,'CONFIRMED_SNAPSHOT_PRESERVED_AFTER_EXIT');
assert(stored.achieved.inboundResolution.width===2400&&stored.achieved.inboundResolution.height===1080,'PRESERVED_RESOLUTION_2400X1080');
assert(stored.achieved.decodedFPS===119.88&&stored.achieved.codec==='video/H264'&&stored.achieved.rttMs===13,'PRESERVED_ACTIVE_METRICS');

function extractBetween(start,end){const x=src.indexOf(start),y=src.indexOf(end,x+start.length);if(x<0||y<0)throw new Error(`missing source block ${start}`);return src.slice(x,y);}
const syncCode=extractBetween('function syncSafariCleanSurfaceLifecycle(sample=null)','function waitForBody()');
const syncFn='function syncSafariCleanSurfaceLifecycle(sample=null)'+syncCode.split('function syncSafariCleanSurfaceLifecycle(sample=null)')[1];
const uiCtx={Number,document:{body:{}},S:{ui:{built:true,open:true}},hideCount:0,showCount:0};
uiCtx.shouldUseSafariDeferredEvidence=()=>true;
uiCtx.classifySafariStreamLifecycle=P.classifySafariStreamLifecycle;
uiCtx.$=id=>id==='bcs-ui-root'&&uiCtx.S.ui.built?{}:null;
uiCtx.destroyProductUIForSafariCleanSurface=()=>{uiCtx.hideCount++;uiCtx.S.ui.built=false;uiCtx.S.ui.open=false;};
uiCtx.createUI=()=>{uiCtx.showCount++;uiCtx.S.ui.built=true;};
vm.createContext(uiCtx);
vm.runInContext(`let safariCleanSurfaceSessionActive=false;\n${syncFn}\nthis.sync=syncSafariCleanSurfaceLifecycle;`,uiCtx);
uiCtx.sync(pre);
assert(uiCtx.hideCount===0&&uiCtx.showCount===0&&uiCtx.S.ui.built===true,'UI_PRESENT_DURING_PRE_STREAM');
uiCtx.sync(active);
assert(uiCtx.hideCount===1&&uiCtx.S.ui.built===false,'UI_HIDDEN_ON_CONFIRMED_ACTIVE');
uiCtx.sync(active2);
assert(uiCtx.hideCount===1&&uiCtx.showCount===0,'UI_STAYS_HIDDEN_DURING_ACTIVE_REFRESH');
uiCtx.sync(exit);
assert(uiCtx.showCount===1&&uiCtx.S.ui.built===true,'UI_RESTORED_AFTER_EXIT');

const waitBlock=extractBetween('function waitForBody()','function boot()');
assert(waitBlock.includes('createUI();'),'WAIT_FOR_BODY_CREATES_UI');
assert(!waitBlock.includes('IS_STREAM_DOCUMENT')&&!waitBlock.includes('location.hostname'),'NO_HOSTNAME_ONLY_UI_GATE');
assert(!src.includes('shouldUseSafariCleanVideoSurface'),'S1_1_STATIC_CLEAN_GATE_REMOVED');
assert(src.includes('id="bcs-download-last-session"'),'LAST_SESSION_DOWNLOAD_CONTROL_PRESENT');
assert(src.includes("$('bcs-download-last-session').addEventListener('click',downloadDeferredEvidence)"),'LAST_SESSION_DOWNLOAD_HANDLER_BOUND');
assert(src.includes("const DEFERRED_EVIDENCE_COOKIE = 'bcs_s12_ev';"),'S1_2_EVIDENCE_COOKIE_ISOLATED');
assert((src.match(/\.getStats\(/g)||[]).length===1,'SINGLE_GETSTATS_CALL_PRESERVED',{count:(src.match(/\.getStats\(/g)||[]).length});

const result={artifact,sha256:sha256(src),status:'OFFLINE_LIFECYCLE_HARNESS_PASS',scenario:'PRE_STREAM -> ACTIVE -> ACTIVE_REFRESH -> EXIT/PRE_STREAM',checks,liveReadyPrerequisite:true,queueRequired:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
