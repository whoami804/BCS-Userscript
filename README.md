# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador com Tampermonkey, confirme **Instalar/Atualizar** e recarregue completamente o Boosteroid.

## Beta publicada

- runtime: `v0.8.1-rc18 — Play-First Runtime Pruning + Immersive v2 + Minimal H-014C Fix`;
- status: `STATIC/SMOKE PASS / PUBLIC BETA PUBLISHED / LIVE REGRESSION PENDING / NOT CANONICAL`;
- engineering SHA-256: `2467b42bb2c61b3dd8f632b70940e759de3ebbb264b6aa9cbc55cc015efd7da1`;
- public distribution SHA-256: `030081a953990a1c66276fee272be3dd35f1b4d45f21dfd4682be5905f355b9a`;
- public Git blob: `c33c6cf65809331f61273901893848973a715755`;
- workflow `Publish beta userscript` run #30 / id `33387320213`: **SUCCESS**;
- publish commit: `d3c01fc8280cb0acf027b9f91f209d2c5a95a13f`.

## Direção PLAY-FIRST

O BCS é feito para **jogar melhor no Boosteroid Web mobile**. Instrumentação de laboratório é temporária por padrão e não permanece no runtime só porque foi útil durante uma investigação.

RC18 executa uma grande poda de runtime sem minificação:
- RC17: 6.351 linhas / 294.558 bytes;
- RC18: 2.142 linhas / 105.291 bytes;
- redução: 64,25%.

## O que permanece

**Controle**
- resolução / Monitor Virtual;
- FPS 60/120;
- bitrate AUTO/manual;
- AUTO/SAFE persistente.

**Game Mode**
- Immersive v2 native-first;
- Keyboard Lock Escape/Tab;
- captura de mouse pelo fluxo nativo do Boosteroid;
- correção LMB+RMB H-014C em forma mínima de produção.

**Monitor / suporte**
- resolução inbound;
- FPS;
- bitrate;
- codec;
- RTT/jitter/loss básicos;
- export JSON enxuto.

## O que saiu do runtime padrão

RC6 Input Probe, RC13 transport discovery, wrappers WS/RTC usados para provar H-014C, Long Session/IndexedDB/resource probes, Guardian shadow-state sem recovery, Experiment Manager, Image Feature Layer/surface telemetry, DEEP/rVFC padrão e double stringify do export.

O conhecimento dessas investigações continua preservado no repositório privado de engenharia; apenas deixou de pesar no userscript de jogo.

## H-014C

A correção final não fabrica eventos, não cria `id_cmd`, não envia pacote extra e não altera o transporte. Ela somente contorna o compatibility guard nos quatro chord edges já validados e deixa o pipeline nativo do Boosteroid continuar normalmente.

## Gate LIVE RC18

A beta está publicada, mas ainda é candidata.

Teste atual:
`ATUALIZAR/RELOAD → confirmar RC18 → AUTO/resolução/FPS/bitrate → Immersive → RMB+LMB natural → jogar 3–5 min → abrir/fechar painel → BAIXAR LOG e confirmar que a sessão continua normal`.

## Privacidade

Este repositório público não recebe JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps nem documentação interna privada.
