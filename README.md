# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc8 — Mouse Transport Discovery + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED TRANSPORT OBSERVER SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `e7f084cb9a176a85b79422ec0f5cf78c756d15766839e6a1aaa1feec80158966`;
- public distribution SHA-256: `c1c42dc58fa9f0a70b7c098df67d715d534243fe0af561050ce173335e04d720`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC8

A RC8 preserva o Immersive Game Mode da RC7 e acrescenta um teste **diagnóstico e on-demand** para H-014C, o problema de LMB/RMB simultâneos.

Durante o teste, a RC8 correlaciona transições DOM de botão com sends observáveis em `RTCDataChannel.prototype.send` e `WebSocket.prototype.send`. Os hooks são pass-through e a captura detalhada só ocorre perto dos cliques marcados.

A RC8:

- não captura payload bruto;
- não altera ou bloqueia `send()`;
- não cria `MouseEvent`, `PointerEvent` ou `KeyboardEvent` sintético;
- não reenvia botão;
- não substitui movimento do mouse;
- não altera Stream Control, Page Bridge, RTC Processing ou Long Session.

## Gate LIVE RC8

Com o mouse parado durante cada sequência:

`LMB x3 → RMB x3 → segurar RMB + LMB x3 → segurar LMB + RMB x3 → PARAR MOUSE TESTE → BAIXAR LOG`.

O teste encerra automaticamente após 60 segundos.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge permanece byte-identical à RC7;
- continua um único `getStats()` por sample;
- zero hook de `RTCPeerConnection.prototype`;
- zero construtor sintético `KeyboardEvent` / `MouseEvent` / `PointerEvent`;
- RC8 é beta e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
