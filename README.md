# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc10 — Minimal Multi-Button Reconciliation + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED RECONCILIATION SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `c2e981e54e7d58985ec2ff82593b26a2309e713a3fb43ebf60c5c6e77a0080b0`;
- public distribution SHA-256: `8dc3efa444592403db886fb999c6ee983361c5f961604ee76c121c8befd4863e`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC10

A RC9 LIVE mapeou o protocolo nativo de botão do `ClientDataChannel` (`type:"mouse"`, `action:"button"`, `isPressed`, `btn`, `id_cmd`, `from_udp`) e mostrou que as transições do segundo botão simultâneo chegam ao DOM, mas o cliente envia `mouse/move` em vez do `mouse/button` esperado.

A RC10 adiciona um **fix experimental manual** e estreito. Durante `FIX TESTE`:

- aprende em memória o formato de um pacote nativo `mouse/button` usando cliques individuais;
- marca somente as quatro transições simultâneas LMB/RMB de DOWN/UP;
- se o Boosteroid já enviar o botão correto, não interfere;
- caso contrário, substitui o primeiro `mouse/move` correlacionado pelo `mouse/button` faltante;
- reutiliza o `id_cmd` e `from_udp` do próprio pacote nativo substituído;
- não cria um segundo `send()` e não inventa contador de comando.

A RC10 não cria `MouseEvent`, `PointerEvent` ou `KeyboardEvent` sintético, não exporta payload bruto e não altera Stream Control, Page Bridge, RTC Processing ou Long Session.

## Gate LIVE RC10

Com Pointer Lock ativo:

`INICIAR FIX TESTE → LMB x3 → RMB x3 → segurar RMB + LMB x3 → soltar tudo → segurar LMB + RMB x3 → soltar tudo → PARAR FIX TESTE → BAIXAR LOG`.

Durante as duas sequências simultâneas, confirme no jogo se **os dois botões passaram a atuar juntos**. Também verifique se nenhum botão fica preso após soltar.

O teste encerra automaticamente após 60 segundos, mas a RC10 impede o stop enquanto o último estado físico observado ainda indicar botão pressionado.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge/Stream Control, RTC Processing, Long Session e Immersive RC7 permanecem byte-identical à RC9;
- continua um único `getStats()` por sample;
- zero hook de `RTCPeerConnection.prototype`;
- zero input DOM sintético;
- nenhuma injeção de `send()` extra;
- RC10 é beta experimental e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
