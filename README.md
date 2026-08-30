# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc11 — Native Mouse Sender Discovery + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED NATIVE-SENDER STACK SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `f3b43da9830c762c5aea7b38f3c827af1d54184e21b1a78376563c53f18773e6`;
- public distribution SHA-256: `20efaa31ed98faac3e748a641675beea90b7ebe3b4e8ab5f491175ec082c7017`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC11

A RC10 foi reprovada como correção funcional: o log mostrou 86/86 reconciliações aplicadas, mas o comportamento remoto permaneceu raro e dessincronizado. A RC11 abandona o replacement de `mouse/move` e volta a ser **100% observacional**.

Durante `SENDER TESTE`, a RC11 observa somente o `ClientDataChannel`. Quando um `mouse/button` nativo que já funciona é enviado, registra uma call stack JavaScript sanitizada para descobrir qual função/bundle do Boosteroid construiu esse comando antes de `RTCDataChannel.send()`.

A captura preserva apenas função, origem+pathname, linha e coluna. Query/hash de URL, payload bruto, cookies e tokens não são armazenados. Uma pequena amostra de stacks de `mouse/move` é registrada apenas para comparação de caller.

A RC11 não altera payload, não bloqueia `send()`, não cria outro envio, não sintetiza input e não toca em Stream Control, Page Bridge, RTC Processing ou Long Session.

## Gate LIVE RC11

Com Pointer Lock ativo:

`INICIAR SENDER TESTE → LMB normal x3 → RMB normal x3 → PARAR SENDER TESTE → BAIXAR LOG`.

**Não testar LMB+RMB simultâneo nesta build.** O objetivo é mapear o caminho nativo que já funciona.

O teste encerra automaticamente após 30 segundos.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge/Stream Control, RTC Processing, Long Session e Immersive RC7 permanecem byte-identical à RC10;
- continua um único `getStats()` por sample;
- zero hook de `RTCPeerConnection.prototype`;
- zero input DOM sintético;
- zero payload replacement;
- zero `send()` adicional;
- RC11 é beta diagnóstica e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
