# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação / atualização beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador com Tampermonkey, confirme **Instalar/Atualizar** e recarregue completamente o Boosteroid.

## Beta publicada

- runtime: `v0.9.0-rc1 — Product UI Integration`;
- status: `STATIC PASS / LAB-B LIVE PRODUCT REGRESSION PASS`;
- engineering SHA-256: `413af8945e5653a72ceac9f0083efb1b51cb525953e2ba6c39fc64723ea2c675`;
- public distribution SHA-256: `42d7cbe4749994f35505e37a3304901f668d9bdf2a4c10374e94b926c2c08a7f`;
- public Git blob: `96357dc8cba92e8944749076c58816529ed7cb10`.

## Product Experience

A v0.9 reduz a fricção de configuração:
- launcher BCS móvel e discreto;
- painel móvel;
- `Controle de Stream` ON/OFF;
- SAFE oculta as configurações de stream e preserva as escolhas;
- sem botão `ATIVAR AUTO`;
- sem botão `APLICAR`;
- mudanças são salvas automaticamente;
- Resolução real + CUSTOM;
- FPS 60/120;
- Bitrate AUTO/MANUAL + slider 5–80 Mbps;
- Mouse Smoothness;
- Immersive em tela cheia;
- Recapturar contextual;
- leitura da sessão e export de log.

## Fundação preservada

A base v0.8.1/RC19 continua intacta nos mecanismos de gameplay:
- Monitor Virtual;
- FPS/bitrate nativos;
- H-014C LMB+RMB;
- H-014D Mouse Smoothness;
- Immersive v2;
- Page Bridge;
- monitor CORE leve.

H-014D permanece restrito ao mecanismo mínimo validado, preservando sender/payload/id_cmd/transportes nativos do Boosteroid.

## LIVE validation

A Product UI passou um run LAB-B/Edge-Chromium de aproximadamente 78 minutos com:
- 0 skipped samples;
- 0 bridge timeouts;
- 0 bridge errors;
- ~120 FPS;
- Mouse Smoothness OFF→ON exercitado pela UI e final saudável;
- Immersive usado repetidamente sem erro final;
- gameplay reportado como normal.

## Privacidade

Este repositório público não recebe JSONs LIVE, Evidence DB, cookies/tokens/credenciais, dumps nem documentação interna privada.
