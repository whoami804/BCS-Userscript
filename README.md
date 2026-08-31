# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois, recarregue completamente a página do Boosteroid.

## Beta publicada

- runtime: `v0.8.1-rc16 — Immersive v2 Native-First + Input State Guardian + RC15 Chord Fix`;
- status: `STATIC PASS / TARGETED IMMERSIVE V2 NATIVE-FIRST + GUARDIAN SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `70fb770495c3a35afa1fec2b01d2ba942b830832d549b86e060fe65b8d113686`;
- public distribution SHA-256: `d079b13b6301e60ae7c22cc9e9ddbc30e8ea7fa26ade9c9a29c300880c51057c`;
- public Git blob: `bd106803dfd97c83ef82360271416b23710200e2`;
- workflow `Publish beta userscript` run #27 / id `33351738015`: SUCCESS.

## H-014C — simultaneous LMB/RMB

**RC15 LIVE PASS.** O caso real `RMB segurado + LMB disparando` funcionou normalmente no LAB-B. O log registrou 32 chord edges corrigidos, 32/32 pares WebSocket + ClientDataChannel com o mesmo `id_cmd`, zero mismatch, zero par incompleto e classificação `NATIVE_DUAL_TRANSPORT_CONFIRMED`.

A correção preservada na RC16 atua somente em `EventHandler.shouldIgnoreMouseCompatibilityEvent` para os quatro edges chorded reais. Não fabrica `id_cmd`, não altera payload, não injeta send extra, não sintetiza DOM input e não renova a janela de supressão de 500 ms pelo fix.

## Immersive v2 — Native-First

A RC16 refatora o Immersive sem reabrir o Stream Control nem o fix RC15:

- fullscreen mobile usa `document.documentElement` como alvo primário;
- Keyboard Lock de `Escape`/`Tab` continua orquestrado pelo BCS;
- o BCS não chama mais `requestPointerLock()` diretamente;
- a captura do mouse fica a cargo do fluxo nativo do Boosteroid / `CursorModeManager` após ação física do usuário;
- ownership e cleanup continuam preservando estados preexistentes;
- `Input State Guardian` mantém shadow state local e observa blur/visibility/pagehide;
- possível input preso é somente diagnosticado; não existe release sintético nem resend periódico.

## Gate LIVE RC16

`ATUALIZAR → RELOAD COMPLETO → ENTRAR IMERSIVO V2 → clicar fisicamente no jogo para o Boosteroid capturar o mouse → jogar normalmente → testar Esc/Tab → perder/recuperar foco uma vez se conveniente → SAIR → BAIXAR LOG`.

PASS exige fullscreen/Keyboard Lock normais, captura nativa de mouse funcional, nenhuma regressão do RC15 e saída limpa. Até esse gate, **RC16 é beta e não canônica**.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
