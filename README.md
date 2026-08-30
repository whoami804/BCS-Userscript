# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois da instalação, o próprio userscript usa esta mesma URL em `@updateURL` e `@downloadURL`.

## Beta publicada

- runtime: `v0.8.1-rc12 — Native Sender Reference & Arguments Discovery + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED REFERENCE+ARGUMENTS SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `35acf2447bfa15efc597efd11a6d4b6a08a2c5bcabc25d0edb8f5cb5010419df`;
- public distribution SHA-256: `8dcda429cbfd632d59e555ee94a0d68c3842da4aac741f49d84d7921ece946a9`.

O SHA público difere da build de engenharia somente pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

## O que muda na RC12

A RC11 LIVE identificou o pipeline de clique normal do Boosteroid, incluindo `handlePointerMouseButtonEvent` e `sendMouseButtonEvent` em `catch-events.js`. A RC12 continua **observacional** e tenta fechar a última pergunta antes de um novo fix: qual é a assinatura/entrada reutilizável e quais argumentos o handler passa ao sender.

A RC12:
- observa registros de `pointerdown/pointerup/mousedown/mouseup` em `EventTarget.addEventListener`, mantendo os callbacks originais intactos;
- guarda referências candidatas somente na memória da página, sem invocá-las ou exportá-las;
- mantém o observador pass-through de `ClientDataChannel` para confirmar o stack nativo;
- durante `REF TESTE`, tenta ler `/static/streaming/catch-events.js` pelo próprio domínio e exporta apenas hash/tamanho, nomes/linhas, parâmetros e call-shape sanitizado;
- não exporta fonte bruta;
- não altera payload, não cria envio adicional e não sintetiza input.

## Gate LIVE RC12

`INICIAR REF TESTE → ENTRAR IMERSIVO → LMB normal x2 → RMB normal x2 → aguardar ~2 s → SAIR → PARAR REF TESTE → BAIXAR LOG`.

**Não testar LMB+RMB simultâneo nesta build.** O objetivo é descobrir referência/assinatura/argumentos do caminho nativo que já funciona.

O teste encerra automaticamente após 30 segundos.

## Invariantes

- Stream Control permanece congelado;
- Page Bridge/Stream Control, RTC Processing, Long Session e Immersive RC7 permanecem byte-identical à RC11;
- continua um único `getStats()` por sample;
- zero hook de `RTCPeerConnection.prototype`;
- zero `MouseEvent`/`PointerEvent`/`KeyboardEvent` sintético;
- zero payload replacement;
- zero `send()` adicional;
- callbacks de listener não são wrapped;
- RC12 é beta diagnóstica e **não canônica** até Gate LIVE.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
