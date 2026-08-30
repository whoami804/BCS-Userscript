# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc13 — Native Handler Call Shape Discovery + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED HANDLER-SHAPE OBSERVER SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `db3f20e4a2670fcde301482fbb99565fd13252ae327b078b0751be61575eead2`;
- public distribution SHA-256: `81ad091122482aa9f3622d5d6a0a4ca0eb3171033bca5fc5b27dbcafd5f26605`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC13

A RC12 LIVE confirmou `sendMouseButtonEvent(event, pressedStatus)` e os handlers do VIDEO (`getMouseButtonEvent` para mouse clássico e `handlePointerMouseButtonEvent` para Pointer Events), mas não fechou receiver, call-shape e guards.

A RC13 continua **observacional** e:
- analisa os handlers já registrados via `Function.prototype.toString()` somente em memória;
- exporta apenas call-shapes sanitizados, receiver, arg count, guard token-shapes e hashes;
- procura uma referência de `sendMouseButtonEvent` no VIDEO e na cadeia de protótipos sem invocá-la;
- mantém o observador pass-through do `ClientDataChannel` para confirmar o pipeline nativo;
- não exporta source bruto;
- não altera payload, não cria envio adicional e não sintetiza input.

## Gate LIVE RC13

`INICIAR SHAPE TESTE → ENTRAR IMERSIVO → LMB normal x2 → RMB normal x2 → aguardar ~2 s → SAIR → PARAR SHAPE TESTE → BAIXAR LOG`.

**Não testar LMB+RMB simultâneo intencionalmente nesta build.** O objetivo é descobrir receiver/args/guards/ref do caminho nativo que já funciona.

O teste encerra automaticamente após 30 segundos.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge/Stream Control, RTC Processing, Long Session e Immersive RC7 permanecem byte-identical à RC12;
- continua um único `getStats()` por sample;
- zero hook de `RTCPeerConnection.prototype`;
- zero `MouseEvent`/`PointerEvent`/`KeyboardEvent` sintético;
- zero payload replacement;
- zero `send()` adicional;
- callbacks de listener não são wrapped;
- RC13 é beta diagnóstica e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
