# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois, recarregue completamente a página do Boosteroid.

## Beta publicada

- runtime: `v0.8.1-rc14 — Chorded Mouse Compatibility Fix + Immersive Game Mode + Telemetry Integrity`;
- status: `STATIC PASS / TARGETED CHORDED-REROUTE + DUAL-TRANSPORT SMOKE PASS / LAB-B LIVE PENDING / NOT CANONICAL`;
- engineering SHA-256: `b10096ce24a4a18e70f383cdb79d4f1679bb4bc5c56a7eb10eec04d20311332e`;
- public distribution SHA-256: `3d58116015c211242d9962be95ac9610a43c197cb239537f73deedaae06d9410`.

## O que muda na RC14

O snapshot completo do cliente web confirmou a causa de H-014C: no caminho mobile, o cliente Boosteroid suprime compatibility `mousedown/mouseup` por 500 ms após Pointer mouse activity. Em uma interação chorded, o segundo botão pode existir somente como `mousedown/up`, sem um novo `pointerdown/up`, fazendo o cliente descartar o único edge do segundo botão.

A RC14 corrige somente quatro transições reais LMB/RMB simultâneas e as reroteia para o **handler de botão nativo do próprio Boosteroid** antes da serialização. O cliente continua responsável por `sendMouseButtonEvent`, geração de `id_cmd`, ordenação e transporte duplo WebSocket + WebRTC.

A RC14:
- não fabrica `id_cmd`;
- não cria payload de mouse manualmente;
- não substitui `mouse/move`;
- não injeta `send()` independente;
- não despacha `MouseEvent`/`PointerEvent` sintético;
- mantém o fix desligado por padrão e com gate manual;
- observa apenas metadata `mouse/button` enquanto o gate está ativo para confirmar WebSocket + ClientDataChannel com o mesmo `id_cmd`.

## Gate LIVE RC14

`ATIVAR FIX LMB+RMB → ENTRAR IMERSIVO → segurar RMB + clicar LMB normalmente por 20–30 s → testar sentido inverso se útil → SAIR → BAIXAR LOG`.

PASS exige comportamento remoto confiável e sincronizado, junto com `NATIVE_DUAL_TRANSPORT_CONFIRMED` e pares WebSocket/RTC usando o mesmo `id_cmd`.

Até o Gate LIVE: **RC14 não é canônica e H-014C ainda não está marcado como corrigido.**

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
