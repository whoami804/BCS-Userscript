# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois, recarregue completamente a página do Boosteroid.

## Beta publicada

- runtime: `v0.8.1-rc15 — Direct Compatibility Guard Bypass + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED DIRECT-GUARD-BYPASS + NATIVE DUAL-TRANSPORT SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `621205bb9a355ee1db873dd83a1c111d8c0525a9fc31eef763dde553934089d7`;
- public distribution SHA-256: `5b0026ead25671d4c95e0b3ec02b5c7b9fdd39347d539254029d6981495a820b`.

## Por que a RC14 foi descartada

O snapshot completo do cliente confirmou que `handlePointerMouseButtonEvent()` chama `suppressMouseCompatibilityEvents()` e renova a janela de supressão de 500 ms. A RC14 reroteava o segundo botão por esse handler e, no LIVE, isso alterou o próprio estado de compatibilidade: o tiro não funcionava enquanto RMB estava fisicamente segurado e o estado de mira podia permanecer preso até a atividade cessar.

## O que muda na RC15

A RC15 remove completamente o reroute para o pointer handler. Em vez disso, envolve apenas `EventHandler.shouldIgnoreMouseCompatibilityEvent` no page context.

O guard original continua sendo executado normalmente. Somente quando ele retornaria `true` para uma das quatro transições chorded reais, a RC15 retorna `false` e permite que o caminho nativo já existente continue:

`getMouseButtonEvent → sendMouseButtonEvent → sendRttEvent → SessionHandler.sendEvents`.

Casos liberados:
- `mousedown btn=0 buttons=3`;
- `mouseup btn=0 buttons=2`;
- `mousedown btn=2 buttons=3`;
- `mouseup btn=2 buttons=1`.

A RC15:
- não chama `handlePointerMouseButtonEvent` para corrigir chord;
- não renova a janela de 500 ms pelo fix;
- não fabrica `id_cmd`;
- não cria payload manual;
- não injeta send extra;
- não despacha eventos DOM sintéticos;
- mantém compatibility events comuns bloqueados normalmente;
- observa apenas os pares nativos WebSocket + ClientDataChannel para confirmar o mesmo `id_cmd`.

## Gate LIVE RC15

`ATIVAR FIX LMB+RMB → ENTRAR IMERSIVO → segurar RMB + clicar LMB normalmente → soltar RMB enquanto continua alguns cliques LMB → confirmar que a mira solta imediatamente → SAIR → BAIXAR LOG`.

PASS exige comportamento remoto confiável/sincronizado, liberação imediata do botão fisicamente solto e `NATIVE_DUAL_TRANSPORT_CONFIRMED` sem mismatch.

Até o Gate LIVE: **RC15 não é canônica e H-014C ainda não está marcado como corrigido.**

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
