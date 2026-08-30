// ==UserScript==
// @name         Boosteroid Client Snapshot Collector
// @namespace    whoami.boosteroid.control-suite.tools
// @version      0.1.0
// @description  One-shot same-origin client source snapshot for BCS engineering: JS bundles, discovered JS refs, source maps, hashes and resource inventory. No input mutation and no raw transport capture.
// @author       Whoami
// @match        https://boosteroid.com/*
// @match        https://cloud.boosteroid.com/*
// @match        https://*.boosteroid.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

const VERSION = '0.1.0';
const MAX_FILES = 180;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_CRAWL_ROUNDS = 4;
const FETCH_CONCURRENCY = 4;
const state = {
  resources: new Map(),
  collecting: false,
  status: 'IDLE',
  lastResult: null,
};

function nowIso(){ return new Date().toISOString(); }
function cleanUrl(raw){
  try { const u = new URL(raw, location.href); u.hash=''; return u.href; }
  catch { return String(raw || ''); }
}
function sameOrigin(raw){ try { return new URL(raw, location.href).origin === location.origin; } catch { return false; } }
function isJsLike(url){ return /\.(?:m?js)(?:[?#]|$)/i.test(url) || /\/static\/streaming\//i.test(url); }
function addResource(raw, source='unknown'){
  const url = cleanUrl(raw); if (!url) return;
  const prev = state.resources.get(url);
  if (prev) { if (!prev.sources.includes(source)) prev.sources.push(source); return; }
  state.resources.set(url, {url, sources:[source]});
}

try {
  const po = new PerformanceObserver(list => {
    for (const e of list.getEntries()) addResource(e.name, `performance:${e.initiatorType || 'resource'}`);
  });
  po.observe({type:'resource', buffered:true});
} catch {}

function scanDomScripts(){
  for (const s of document.scripts || []) if (s.src) addResource(s.src, 'document.script');
}

async function sha256(text){
  try {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  } catch { return null; }
}

function extractSourceMapUrls(text, baseUrl){
  const out=[];
  const re=/[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/g;
  let m;
  while((m=re.exec(text))){
    const ref=(m[1]||'').trim().replace(/["']/g,'');
    if(!ref || ref.startsWith('data:')) continue;
    try { out.push(new URL(ref, baseUrl).href); } catch {}
  }
  return [...new Set(out)];
}

function extractJsRefs(text, baseUrl){
  const out=new Set();
  const patterns=[
    /["'`](\/[^"'`\s]+?\.m?js(?:\?[^"'`\s]*)?)["'`]/g,
    /["'`]([^"'`\s]{1,180}?\.m?js(?:\?[^"'`\s]*)?)["'`]/g,
    /(?:import\s*\(|from\s*)["'`]([^"'`]+\.m?js(?:\?[^"'`]*)?)["'`]/g
  ];
  for(const re of patterns){
    let m;
    while((m=re.exec(text))){
      const ref=(m[1]||'').trim();
      if(!ref || ref.startsWith('data:') || ref.startsWith('blob:')) continue;
      try {
        const u=new URL(ref, baseUrl);
        if(u.origin===location.origin) out.add(cleanUrl(u.href));
      } catch {}
      if(out.size>500) break;
    }
  }
  return [...out];
}

async function fetchText(url){
  const started=performance.now();
  try {
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'follow'});
    const ct=r.headers.get('content-type')||'';
    const lenHeader=Number(r.headers.get('content-length'))||null;
    if(!r.ok) return {ok:false,status:r.status,statusText:r.statusText,contentType:ct,contentLength:lenHeader,error:`HTTP_${r.status}`,durationMs:Math.round(performance.now()-started)};
    const text=await r.text();
    const bytes=new TextEncoder().encode(text).byteLength;
    if(bytes>MAX_FILE_BYTES) return {ok:false,status:r.status,contentType:ct,contentLength:bytes,error:'FILE_TOO_LARGE',durationMs:Math.round(performance.now()-started)};
    return {ok:true,status:r.status,contentType:ct,contentLength:bytes,text,durationMs:Math.round(performance.now()-started)};
  } catch(e){ return {ok:false,status:null,contentType:null,contentLength:null,error:String(e?.message||e).slice(0,240),durationMs:Math.round(performance.now()-started)}; }
}

async function mapLimit(items, limit, fn){
  const out=new Array(items.length); let idx=0;
  async function worker(){ while(true){ const i=idx++; if(i>=items.length) break; out[i]=await fn(items[i],i); } }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));
  return out;
}

function statusText(){ return state.status; }
function updateUi(){
  const st=document.getElementById('bcs-snapshot-status'); if(st) st.textContent=statusText();
  const btn=document.getElementById('bcs-snapshot-go'); if(btn) btn.disabled=state.collecting;
}

async function collect(){
  if(state.collecting) return;
  state.collecting=true; state.status='Preparando inventário…'; updateUi();
  scanDomScripts();
  try { for(const e of performance.getEntriesByType('resource')) addResource(e.name, `performance:${e.initiatorType||'resource'}`); } catch {}
  const known=[
    '/static/streaming/catch-events.js',
    '/static/streaming/streaming.js',
    '/static/streaming/adapter.js',
    '/static/streaming/webrtcstreamear/webrtcstreamer.js'
  ];
  for(const k of known) addResource(new URL(k,location.origin).href,'known-bcs');

  const files=[]; const fetched=new Set(); let totalBytes=0;
  let queue=[...state.resources.keys()].filter(u=>sameOrigin(u)&&isJsLike(u));

  let htmlRecord=null;
  state.status='Lendo HTML e entrypoints…'; updateUi();
  try {
    const hr=await fetchText(location.origin+location.pathname);
    if(hr.ok){
      htmlRecord={url:cleanUrl(location.origin+location.pathname),bytes:hr.contentLength,sha256:await sha256(hr.text),text:hr.text};
      for(const ref of extractJsRefs(hr.text, location.href)) if(!queue.includes(ref)) queue.push(ref);
    } else htmlRecord={url:cleanUrl(location.origin+location.pathname),error:hr.error,status:hr.status};
  } catch(e){ htmlRecord={url:cleanUrl(location.origin+location.pathname),error:String(e)}; }

  for(let round=0; round<MAX_CRAWL_ROUNDS && queue.length && files.length<MAX_FILES && totalBytes<MAX_TOTAL_BYTES; round++){
    const batch=[...new Set(queue)].filter(u=>!fetched.has(u)&&sameOrigin(u)&&isJsLike(u)).slice(0,MAX_FILES-files.length);
    queue=[]; if(!batch.length) break;
    state.status=`Coletando bundles… rodada ${round+1}/${MAX_CRAWL_ROUNDS} (${batch.length})`; updateUi();
    const records=await mapLimit(batch,FETCH_CONCURRENCY,async url=>{
      fetched.add(url);
      const r=await fetchText(url);
      if(!r.ok) return {url,ok:false,status:r.status,error:r.error,contentType:r.contentType,bytes:r.contentLength,durationMs:r.durationMs};
      totalBytes+=r.contentLength||0;
      const rec={url,ok:true,status:r.status,contentType:r.contentType,bytes:r.contentLength,sha256:await sha256(r.text),lineCount:r.text.split('\n').length,text:r.text,sourceMaps:[],discoveredJs:[]};
      rec.sourceMaps=extractSourceMapUrls(r.text,url).filter(sameOrigin);
      rec.discoveredJs=extractJsRefs(r.text,url).filter(sameOrigin);
      return rec;
    });
    files.push(...records);
    for(const rec of records){ if(!rec?.ok) continue; for(const u of rec.discoveredJs) if(!fetched.has(u)) queue.push(u); }
  }

  const mapUrls=[...new Set(files.flatMap(f=>f?.sourceMaps||[]))].filter(sameOrigin).slice(0,MAX_FILES);
  state.status=`Coletando source maps… (${mapUrls.length})`; updateUi();
  const sourceMaps=await mapLimit(mapUrls,FETCH_CONCURRENCY,async url=>{
    const r=await fetchText(url);
    if(!r.ok) return {url,ok:false,status:r.status,error:r.error,contentType:r.contentType,bytes:r.contentLength};
    return {url,ok:true,status:r.status,contentType:r.contentType,bytes:r.contentLength,sha256:await sha256(r.text),text:r.text};
  });

  const resourceInventory=[...state.resources.values()].map(x=>({url:x.url,sameOrigin:sameOrigin(x.url),isJsLike:isJsLike(x.url),sources:x.sources}));
  const snapshot={
    tool:{name:'Boosteroid Client Snapshot Collector',version:VERSION},
    capturedAt:nowIso(),
    page:{origin:location.origin,pathname:location.pathname,hrefSanitized:location.origin+location.pathname},
    policy:{sameOriginOnly:true,rawTransportCapture:false,inputMutation:false,maxFiles:MAX_FILES,maxFileBytes:MAX_FILE_BYTES,maxTotalBytes:MAX_TOTAL_BYTES,maxCrawlRounds:MAX_CRAWL_ROUNDS},
    summary:{resourceInventoryCount:resourceInventory.length,jsFetchedOk:files.filter(f=>f.ok).length,jsFetchFailed:files.filter(f=>!f.ok).length,sourceMapsOk:sourceMaps.filter(f=>f.ok).length,sourceMapsFailed:sourceMaps.filter(f=>!f.ok).length,totalSourceBytes:files.filter(f=>f.ok).reduce((a,b)=>a+(b.bytes||0),0)+sourceMaps.filter(f=>f.ok).reduce((a,b)=>a+(b.bytes||0),0)},
    resourceInventory,
    html:htmlRecord,
    files,
    sourceMaps
  };
  const json=JSON.stringify(snapshot);
  state.lastResult=snapshot;
  state.status=`Pronto: ${snapshot.summary.jsFetchedOk} JS + ${snapshot.summary.sourceMapsOk} maps • compactando…`; updateUi();

  let blob,ext;
  if(typeof CompressionStream==='function'){
    try {
      const cs=new CompressionStream('gzip');
      const compressed=await new Response(new Blob([json],{type:'application/json'}).stream().pipeThrough(cs)).blob();
      blob=new Blob([compressed],{type:'application/gzip'}); ext='json.gz';
    } catch { blob=new Blob([json],{type:'application/json'}); ext='json'; }
  } else { blob=new Blob([json],{type:'application/json'}); ext='json'; }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`boosteroid-client-snapshot-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
  document.documentElement.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),30000);
  state.status=`CONCLUÍDO • ${snapshot.summary.jsFetchedOk} JS • ${snapshot.summary.sourceMapsOk} maps • ${(blob.size/1024/1024).toFixed(2)} MB`; state.collecting=false; updateUi();
}

function makeUi(){
  if(document.getElementById('bcs-snapshot-box')) return;
  const box=document.createElement('div'); box.id='bcs-snapshot-box';
  box.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(360px,calc(100vw - 24px));background:#111;color:#eee;border:1px solid #555;border-radius:10px;padding:10px;font:13px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px #0008';
  box.innerHTML=`<div style="font-weight:700;margin-bottom:6px">BCS • Client Snapshot Collector ${VERSION}</div><div style="font-size:12px;opacity:.86;margin-bottom:8px">Coleta somente código/recursos <b>same-origin</b> do cliente carregado. Não captura payload de sessão, não altera input e não mexe no BCS.</div><button id="bcs-snapshot-go" style="width:100%;padding:9px;border:0;border-radius:7px;font-weight:700">COLETAR CLIENTE</button><div id="bcs-snapshot-status" style="margin-top:7px;font-size:11px;word-break:break-word">IDLE</div><button id="bcs-snapshot-hide" style="margin-top:7px;width:100%;padding:5px;border:1px solid #555;background:#222;color:#ddd;border-radius:6px">OCULTAR</button>`;
  document.documentElement.appendChild(box);
  box.querySelector('#bcs-snapshot-go').addEventListener('click',collect);
  box.querySelector('#bcs-snapshot-hide').addEventListener('click',()=>box.remove());
}

function boot(){ scanDomScripts(); makeUi(); }
if(document.documentElement) boot(); else new MutationObserver((_,o)=>{ if(document.documentElement){o.disconnect();boot();} }).observe(document,{childList:true,subtree:true});
window.addEventListener('load',scanDomScripts,{once:true});
})();
