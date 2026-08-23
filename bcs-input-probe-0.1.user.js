// ==UserScript==
// @name         BCS Input Probe 0.1
// @namespace    whoami.boosteroid.control-suite.input-probe
// @version      0.1.0
// @description  Diagnostic companion for LAB-B keyboard/mouse/fullscreen input issues. Observational; no input override.
// @author       Whoami
// @homepageURL  https://github.com/whoami804/BCS-Userscript
// @updateURL    https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/bcs-input-probe-0.1.user.js
// @downloadURL  https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/bcs-input-probe-0.1.user.js
// @match        https://boosteroid.com/*
// @match        https://cloud.boosteroid.com/*
// @match        https://*.boosteroid.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';
const VERSION='0.1.0', MAX=512, AUTO_STOP_MS=120000;
const S={on:false,start:0,events:[],timer:null,lock:false,c:{keydown:0,keyup:0,pointerdown:0,pointerup:0,mousedown:0,mouseup:0,contextmenu:0,fullscreenchange:0,pointerlockchange:0,visibilitychange:0,blur:0,focus:0,mouseDownWhileOtherHeld:0,multiButtonState:0}};
const now=()=>performance.now();
const printable=e=>typeof e.key==='string'&&e.key.length===1;
const target=e=>e?.target?.tagName||null;
function push(type,e={},extra={}){if(!S.on)return;const rec={t:+((now()-S.start)/1000).toFixed(3),type,...extra};if(e&&e.type){rec.eventType=e.type;rec.code=e.code||null;rec.key=printable(e)?'[PRINTABLE_REDACTED]':(e.key||null);rec.button=Number.isFinite(e.button)?e.button:null;rec.buttons=Number.isFinite(e.buttons)?e.buttons:null;rec.altKey=!!e.altKey;rec.ctrlKey=!!e.ctrlKey;rec.shiftKey=!!e.shiftKey;rec.metaKey=!!e.metaKey;rec.repeat=!!e.repeat;rec.defaultPrevented=!!e.defaultPrevented;rec.isTrusted=e.isTrusted===true;rec.target=target(e);}S.events.push(rec);if(S.events.length>MAX)S.events.shift();render();}
function h(e){const t=e.type;if(t in S.c)S.c[t]++;if(t==='mousedown'&&e.buttons&&((e.buttons&(e.buttons-1))!==0)){S.c.mouseDownWhileOtherHeld++;S.c.multiButtonState++;}push(t,e,{fullscreen:!!document.fullscreenElement,pointerLock:!!document.pointerLockElement,hidden:!!document.hidden});}
const events=['keydown','keyup','pointerdown','pointerup','mousedown','mouseup','contextmenu','fullscreenchange','pointerlockchange','visibilitychange'];
function start(){if(S.on)return;S.on=true;S.start=now();S.events=[];Object.keys(S.c).forEach(k=>S.c[k]=0);events.forEach(x=>document.addEventListener(x,h,true));window.addEventListener('blur',h,true);window.addEventListener('focus',h,true);clearTimeout(S.timer);S.timer=setTimeout(stop,AUTO_STOP_MS);push('PROBE_START',null,{keyboardLockSupported:!!navigator.keyboard&&typeof navigator.keyboard.lock==='function'});render();}
async function unlock(){try{navigator.keyboard?.unlock?.();}catch{}S.lock=false;render();}
function stop(){if(!S.on)return;push('PROBE_STOP',null,{});S.on=false;events.forEach(x=>document.removeEventListener(x,h,true));window.removeEventListener('blur',h,true);window.removeEventListener('focus',h,true);clearTimeout(S.timer);S.timer=null;unlock();render();}
async function lock(){if(!S.on)start();if(!navigator.keyboard||typeof navigator.keyboard.lock!=='function'){push('KEYBOARD_LOCK_UNAVAILABLE');alert('Keyboard Lock não está disponível neste navegador.');return;}try{await navigator.keyboard.lock(['Escape','Tab']);S.lock=true;push('KEYBOARD_LOCK_OK',null,{codes:['Escape','Tab']});}catch(err){S.lock=false;push('KEYBOARD_LOCK_ERROR',null,{error:String(err?.name||err)});}render();}
function download(){const out={schema:'bcs-input-probe-v1',version:VERSION,exportedAt:new Date().toISOString(),url:location.origin+location.pathname,ua:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,keyboardLockSupported:!!navigator.keyboard&&typeof navigator.keyboard.lock==='function',keyboardLockActive:S.lock,counters:S.c,eventCount:S.events.length,events:S.events};const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bcs-input-probe-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
function render(){const b=document.getElementById('bcs-ip');if(!b)return;b.querySelector('#st').textContent=S.on?`ON ${S.events.length}/${MAX}`:'OFF';b.querySelector('#lk').textContent=S.lock?'UNLOCK ESC+TAB':'LOCK ESC+TAB';b.querySelector('#go').textContent=S.on?'PARAR PROBE':'INICIAR PROBE';b.querySelector('#mouse').textContent=`multi-mouse: ${S.c.mouseDownWhileOtherHeld}`;}
function ui(){if(document.getElementById('bcs-ip'))return;const b=document.createElement('div');b.id='bcs-ip';b.style='position:fixed;z-index:2147483647;right:8px;top:8px;background:#111e;color:#fff;padding:8px;border:1px solid #777;border-radius:8px;font:12px system-ui;max-width:180px';b.innerHTML='<b>BCS INPUT PROBE</b> <span id="st">OFF</span><br><span id="mouse">multi-mouse: 0</span><br><button id="go">INICIAR PROBE</button> <button id="lk">LOCK ESC+TAB</button><br><button id="dl">BAIXAR LOG</button>';b.querySelectorAll('button').forEach(x=>x.style='margin:4px 2px 0 0;font-size:11px');b.querySelector('#go').onclick=()=>S.on?stop():start();b.querySelector('#lk').onclick=()=>S.lock?unlock():lock();b.querySelector('#dl').onclick=download;(document.documentElement||document.body).appendChild(b);render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui,{once:true});else ui();
})();
