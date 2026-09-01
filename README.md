# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador com Tampermonkey, confirme **Instalar/Atualizar** e recarregue completamente o Boosteroid.

## Beta publicada

- runtime: `v0.8.1-rc19 — Play-First Runtime Pruning + Immersive v2 + H-014C + H-014D Scheduling Fix`;
- status: `STATIC/BENCH PASS / PUBLIC BETA PUBLISHED / SHORT LAB-B INTEGRATION REGRESSION PENDING / NOT CANONICAL`;
- engineering SHA-256: `e68755db6fde532082f5ff8d813a0d43c6255da6bcf300202956fbf6f66f959e`;
- public distribution SHA-256: `b4a27b7484da91fb4c4878906fb75a798fed368658d9db7dbd927e469dc8d7ad`;
- public Git blob: `c2487fb6c088e31288ede8d9b9321d231580ba94`;
- workflow `Publish beta userscript` run #32 / id `33461035083`: **SUCCESS**;
- publish commit: `c238d895e1f05c6e3e2a01c8c0c52e304fc9ca3b`.

## Direção PLAY-FIRST

O BCS é feito para **jogar melhor no Boosteroid Web mobile**. Instrumentação de laboratório é temporária por padrão e não permanece no runtime só porque foi útil durante uma investigação.

RC18 fez a grande poda de runtime; RC19 mantém essa base e integra somente o mecanismo mínimo de gameplay provado para H-014D.

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
- correção LMB+RMB H-014C mínima;
- H-014D Scheduling Fix no LAB-B/Chromium validado.

**Monitor / suporte**
- resolução inbound;
- FPS;
- bitrate;
- codec;
- RTT/jitter/loss básicos;
- estado compacto H-014C/H-014D;
- export JSON enxuto.

## H-014D mouse smoothness

A investigação encontrou um problema no scheduling do flush de movimento do cliente web: o Boosteroid solicitava `_sendBatchedMouseMove` em 8 ms, mas no LAB-B o callback chegava tipicamente muito depois e acumulava vários movimentos antes do envio.

O fix validado altera **somente o scheduling desse callback exato** para `requestAnimationFrame`. O callback nativo, sender, payload, `id_cmd` e transportes continuam pertencendo ao Boosteroid.

Em dois testes LIVE, a correção reduziu a mediana do atraso de scheduling de 27,9 ms para 0,5 ms e o usuário relatou ganho claro de fluidez na câmera.

RC19 não inclui a UI nem a instrumentação detalhada usada durante a prova; somente o mecanismo necessário para gameplay e um estado compacto de suporte permanecem.

## Segurança arquitetural

H-014D em RC19:
- não cria pacote de mouse;
- não fabrica `id_cmd`;
- não faz send direto;
- não altera payload;
- não instala hook de WebSocket/RTC;
- não gera input sintético;
- não modifica timers comuns fora do fingerprint auditado.

## Gate RC19

A beta está publicada, mas ainda é candidata.

Teste curto de integração:
`desativar standalone H-014D → atualizar/reload RC19 → AUTO/resolução/FPS/bitrate → Immersive → confirmar fluidez da câmera → RMB+LMB natural → jogar 2–3 min → abrir/fechar painel → BAIXAR LOG uma vez`.

O objetivo é confirmar que o ganho já provado sobreviveu à integração no script principal sem regressão das funções congeladas. Não é necessário repetir os probes H-014D de 15 segundos.

## Privacidade

Este repositório público não recebe JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps nem documentação interna privada.
