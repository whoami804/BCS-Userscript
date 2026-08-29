# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc7 — Immersive Game Mode + Input Compatibility + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED LIFECYCLE SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `a5276db5504f4e67d1abcf8c2686e529001a68ca2daf70df415a65a035279742`;
- public distribution SHA-256: `cd73fbb5c3c35e272bbf420b8b908702c247977fb0e3533be9014d1ec94dd17e`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC7

A RC7 preserva o Input Probe/Telemetry Integrity da RC6 e acrescenta **Immersive Game Mode**:

- fullscreen com lifecycle controlado;
- Keyboard Lock para `Escape` + `Tab` quando suportado;
- Pointer Lock integrado em best-effort;
- recaptura de locks por user gesture;
- saída limpa e reversível;
- ownership de fullscreen/pointer lock para não desmontar estado preexistente do Boosteroid;
- sem input sintético e sem mouse transport override.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge não foi alterada;
- continua um único `getStats()` por sample;
- zero hook global de `RTCPeerConnection`;
- RC7 é beta e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
