# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**.

## Beta publicada

- runtime esperado: `v0.8.1-rc6 — Input Compatibility Probe + Telemetry Integrity`;
- status de engenharia: `STATIC PASS / HEADLESS PROBE SMOKE PASS / LAB-B LIVE INPUT PROBE PENDING / NOT CANONICAL`;
- engineering SHA-256: `c6c78ebcffa51de8d20d08ff9738a8746ce6857c9586ffc8a560427186b93394`;
- public distribution SHA-256 esperado: `347452b473adf799c38c136a42eb8306bfcb9f5276a4e93eb727b2d2bb42b605`;
- public Git blob esperado: `de5140a730143595e7a45a927ede804143731881`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC6

A RC6 preserva a Telemetry Integrity da RC5 e adiciona um **Input Compatibility Probe** temporário para investigar problemas de mouse/teclado no LAB-B:

- `Escape` saindo do fullscreen;
- `Alt+Tab` mudando o aplicativo Android;
- falha de LMB+RMB simultâneos.

O probe:
- fica OFF por padrão;
- é iniciado manualmente;
- grava no máximo 512 eventos;
- para sozinho após 2 minutos;
- observa keyboard, pointer/mouse, fullscreen, pointer-lock, visibility e focus;
- não armazena caracteres imprimíveis digitados;
- não cria input sintético para o host remoto;
- não altera o transporte de mouse/teclado do Boosteroid.

Quando disponível, a UI expõe um teste reversível `LOCK ESC+TAB` usando Keyboard Lock. O efeito real no Android/Edge ainda precisa ser provado em LIVE.

## Invariantes

- Stream Control não foi alterado;
- Page Bridge não foi alterada;
- continua um único `getStats()` por sample;
- zero hook global de `RTCPeerConnection`;
- RC6 ainda é beta e **não canônica**.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
