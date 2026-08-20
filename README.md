# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar**.

Depois da instalação, o próprio cabeçalho do userscript aponta `@updateURL` e `@downloadURL` para essa URL fixa. Quando uma nova beta é aprovada, o arquivo é substituído mantendo o mesmo endereço e com `@version` incrementado.

## Canais

- **Beta:** `control-suite-boosteroid-beta.user.js` — candidatas de laboratório aprovadas para teste.
- **Stable:** ainda não publicado. Será criado somente após promoção explícita adequada.

## Beta publicada atualmente

- runtime: `v0.8.1-rc5 — Image Telemetry + Long Session Telemetry Integrity`;
- status de engenharia: `STATIC PASS / LIVE SMOKE PENDING / NOT CANONICAL`;
- SHA-256 da build de engenharia: `ea8b9a54df46f9c1535ca842371098c5c92931c5e90dbf65e9ac388ea8a80e80`;
- SHA-256 do arquivo público de distribuição: `bf67829de2b96789a4d19648fca8d152f92d685dff4198c8435f22326e4cf903`;
- Git blob público: `ab05710a8fbfdae7366576e5a37552748d56119d`;
- o SHA público difere da build de engenharia apenas pelos metadados públicos `@homepageURL`, `@updateURL` e `@downloadURL`.

### O que muda na RC5

A RC5 é uma correção de **integridade de telemetria**. Ela não adiciona novos controles de stream.

Principais mudanças:

- `receiverTrackSettings.frameRate` continua observável, mas deixa de participar do fingerprint de `CLIENT_STATE_CHANGE`, porque o Chromium/Android pode expor valores implausíveis e altamente instáveis;
- mudanças de estado redundantes passam a ser suprimidas e contabilizadas;
- eventos importantes ganham um ledger protegido e limitado, reduzindo o risco de anomalias serem expulsas por eventos de baixa prioridade;
- bitrate passa a somar `bytesReceived` dos relatórios `inbound-rtp` de vídeo do mesmo `getStats()`;
- quando o contador de vídeo estaciona apesar do stream continuar progredindo, existe fallback para `candidate-pair.bytesReceived`, explicitamente marcado como escopo de transporte e evidência aproximada;
- quando não há contador válido, a telemetria prefere indisponível a reportar falso `0 Mbps` durante stream ativo;
- mantém um único `getStats()` por sample, zero hook global de `RTCPeerConnection` e Stream Control fora do escopo da alteração.

A persistência crash-safe da RC4 permanece presente e já passou por validação LIVE de recovery. O próximo gate da RC5 é apenas um smoke curto durante uso normal.

## Como a publicação funciona

A transição RC4 → RC5 é aplicada pelo GitHub Actions sobre a beta pública anterior. O workflow verifica o SHA da base, aplica o patch aprovado, verifica o SHA final e executa `node --check` antes de publicar a URL fixa.

## Canal de desenvolvimento

O desenvolvimento completo, documentação de engenharia, Evidence Database e logs de laboratório permanecem no repositório privado e **não são publicados aqui**.

## Privacidade

Este repositório público não deve receber JSONs de sessões LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna não aprovada.
