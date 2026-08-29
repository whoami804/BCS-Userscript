# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc9 — Mouse Payload Mapping + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED PAYLOAD OBSERVER SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `89baa6fbcd641e2848e7aedd65966ecb0d28f4f6257e36187ea284c3553e5ca2`;
- public distribution SHA-256: `943961555fcdb03bb51fc944c707ea8cc1b959729d4cb7d3f913c6df2db6d2ee`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC9

A RC9 continua o H-014C a partir da evidência LIVE da RC8. O problema de LMB/RMB simultâneos permaneceu igual, enquanto a RC8 mostrou que existe tráfego no `ClientDataChannel` próximo às transições multi-button.

A RC9 reduz o diagnóstico ao `RTCDataChannel` com label `ClientDataChannel` e mapeia uma representação **sanitizada** do payload para comparar:

`LMB DOWN/UP → RMB DOWN/UP → LMB enquanto RMB está segurado → RMB enquanto LMB está segurado`.

A RC9:

- não guarda payload bruto;
- quando o payload é JSON, preserva estrutura/caminhos e apenas valores seguros para diagnóstico de input;
- strings não relacionadas a input viram somente hash + tamanho;
- números grandes são reduzidos a classe/sinal/hash;
- não altera, bloqueia ou reenvia `send()`;
- não cria `MouseEvent`, `PointerEvent` ou `KeyboardEvent` sintético;
- não substitui o mouse;
- não altera Stream Control, Page Bridge, RTC Processing ou Long Session.

## Gate LIVE RC9

Com Pointer Lock ativo e o mouse parado durante cada sequência:

`INICIAR PAYLOAD TESTE → LMB x3 → RMB x3 → segurar RMB + LMB x3 → segurar LMB + RMB x3 → PARAR PAYLOAD TESTE → BAIXAR LOG`.

O teste encerra automaticamente após 60 segundos.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge/Stream Control, RTC Processing, Long Session e Immersive RC7 permanecem byte-identical à RC8;
- continua um único `getStats()` por sample;
- zero hook de `RTCPeerConnection.prototype`;
- WebSocket não faz parte do mapping RC9;
- zero input sintético;
- RC9 é beta e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
