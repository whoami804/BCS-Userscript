# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador com Tampermonkey, confirme **Instalar/Atualizar** e recarregue completamente o Boosteroid.

## Beta publicada

- runtime: `v0.9.0-rc1 — Product UI Integration`;
- status: `STATIC PASS / PUBLIC BETA PUBLISHED / SHORT LAB-B PRODUCT REGRESSION PENDING / NOT CANONICAL`;
- engineering SHA-256: `413af8945e5653a72ceac9f0083efb1b51cb525953e2ba6c39fc64723ea2c675`;
- public distribution SHA-256: `42d7cbe4749994f35505e37a3304901f668d9bdf2a4c10374e94b926c2c08a7f`;
- public Git blob: `96357dc8cba92e8944749076c58816529ed7cb10`.

## Direção PLAY-FIRST

O BCS é feito para **jogar melhor no Boosteroid Web mobile**. A v0.9 inicia a fase Product Experience: menos passos, linguagem mais simples e controles voltados para a sessão real.

A fundação de gameplay v0.8.1/RC19 permanece preservada: Monitor Virtual, FPS/bitrate nativos, H-014C, H-014D Mouse Smoothness, Immersive v2, Page Bridge e monitor CORE leve.

## Nova UI v0.9

**Controle de Stream**
- chave ON/OFF;
- OFF = SAFE;
- SAFE oculta Resolução/FPS/Bitrate;
- preferências permanecem salvas;
- não existe mais botão `ATIVAR AUTO`;
- não existe mais botão `APLICAR`;
- mudar uma preferência salva automaticamente o perfil e usa os mecanismos nativos já existentes quando a sessão permite aplicação ao vivo.

**Stream**
- Resolução: NATIVO, 1920×1080, 2400×1080, 2532×1170, 2560×1080 e CUSTOM;
- FPS: 60/120;
- Bitrate: AUTO/MANUAL;
- Manual: slider 5–80 Mbps.

**Jogo**
- Mouse Smoothness: chave real do H-014D validado;
- Immersive: botão de tela cheia;
- Recapturar: aparece apenas com Immersive ativo.

**UI**
- launcher BCS móvel;
- launcher discreto/transparente quando ocioso;
- painel móvel;
- posição persistida;
- cards/toggles mobile-first;
- descrições curtas;
- apenas `X` para fechar.

**Sessão / suporte**
- resolução real;
- FPS real;
- bitrate observado;
- codec;
- RTT;
- export JSON.

## H-014D Mouse Smoothness

H-014D já passou pela cadeia de discovery e integração LIVE no LAB-B/Chromium. A correção altera somente o scheduling do callback nativo auditado `_sendBatchedMouseMove` para native rAF; callback, sender, payload, `id_cmd` e transportes continuam nativos.

A v0.9 apenas fornece uma chave de usuário para habilitar/desabilitar esse mecanismo. Não reintroduz o antigo tooling de laboratório.

## Segurança arquitetural

A Product UI não adiciona:
- pacote de mouse fabricado;
- `id_cmd` fabricado;
- send direto;
- payload mutation;
- WebSocket/RTC hooks;
- input sintético.

## Gate v0.9.0-rc1

Teste curto:
`remover UI Experiment standalone → atualizar/reload v0.9.0-rc1 → mover launcher/painel → SAFE↔ON → mudar uma preferência sem confirmação → iniciar sessão → Mouse Smoothness OFF↔ON → Immersive/Recapturar → LMB+RMB → jogar 2–3 min → BAIXAR LOG uma vez`.

Não é necessário repetir probes H-014D de 15 segundos.

## Privacidade

Este repositório público não recebe JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps nem documentação interna privada.
