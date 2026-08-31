# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar/Atualizar**. Depois, recarregue completamente a página do Boosteroid.

## Beta publicada

- runtime: `v0.8.1-rc17 — Image Lab Feature Layer 0.1 + Immersive v2 Native-First + Integrated H-014C Fix`;
- status: `STATIC PASS / EXPORT-ONLY FEATURE-LAYER SMOKE PASS / RC16 IMMERSIVE V2 LIVE PASS INHERITED / LAB LIVE PERFORMANCE CONFIRMATION PENDING / NOT CANONICAL`;
- engineering SHA-256: `eab2c9920ad9458a2a97a1bb0e5af088efe24bacee0eeb5fa0399112afd9d65b`;
- public distribution SHA-256: `e077fb5f43a923eef8aca4668386805e941e4521e08e7aa302edfc5c56f26233`;
- public Git blob: `888a34ad3bf833458b0e7844b8b08bbf384d457f`;
- workflow `Publish beta userscript` run #29 / id `33357128700`: SUCCESS.

## Immersive v2 / H-014

RC16 passou no LAB-B: fullscreen native-first ficou correto, o ponteiro não desaparece ao ativar o modo e o fluxo nativo do Boosteroid permanece dono da captura de mouse.

H-014C também permanece validado. O único defeito encontrado na RC16 foi de integração: o fix já aprovado ainda estava OFF por padrão. Ao habilitá-lo manualmente, o comportamento voltou ao normal imediatamente, confirmando que não houve regressão do algoritmo RC15.

Na RC17 o fix passa a ser **ativado automaticamente no LAB-B + Chromium**. O botão permanece como kill-switch de diagnóstico. A lógica do guard RC15 não foi alterada.

## Image Lab Feature Layer 0.1

RC17 inicia a camada de features do Diagnostic Model seguindo:

`Raw Telemetry → Derived Features → Observations → Deductions`

Nesta etapa só existem **Derived Features**. Não há diagnóstico causal automático nem threshold universal.

Para proteger performance, a derivação é **EXPORT-ONLY**:
- zero passe de feature model durante gameplay;
- zero `getStats()` adicional;
- zero captura/leitura de pixels;
- zero Canvas analysis;
- zero ML no runtime.

O sampler apenas preserva alguns contadores opcionais já presentes no mesmo relatório WebRTC. Quando o usuário exporta o log, a Suite deriva sinais como coding density (bits/pixel/frame), retransmission ratio, drop ratio, decode/processing budget, jitter-buffer excess, surface scaling e corruption probability quando exposta pelo caminho negociado.

## Gate LIVE RC17

`ATUALIZAR/RELOAD → confirmar FIX LMB+RMB já ativo → ENTRAR IMERSIVO → jogar normalmente por ~2–3 min com DEEP OFF → observar fluidez/latência → BAIXAR LOG`.

PASS exige experiência normal e export contendo `imageFeatureLayer.computation = EXPORT_ONLY` e `extraGetStatsCallsPerSample = 0`.

## Privacidade

Este repositório público não deve receber JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna privada.
