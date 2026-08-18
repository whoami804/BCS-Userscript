# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação e atualização via Tampermonkey.

## Instalação beta

**URL fixa:**

`https://raw.githubusercontent.com/whoami804/BCS-Userscript/main/control-suite-boosteroid-beta.user.js`

Abra essa URL no navegador em que o Tampermonkey está instalado e confirme **Instalar**.

Depois da instalação, o próprio cabeçalho do userscript aponta `@updateURL` e `@downloadURL` para essa URL fixa. Quando uma nova beta for aprovada para teste, o arquivo é substituído mantendo o mesmo endereço e com `@version` incrementado.

## Canais

- **Beta:** `control-suite-boosteroid-beta.user.js` — candidatas de laboratório aprovadas para teste.
- **Stable:** ainda não publicado. Será criado somente quando houver uma build explicitamente promovida para distribuição estável.

## Beta publicada atualmente

- runtime: `v0.8.1-rc2 — Image Telemetry + Long Session Stability`;
- status de engenharia: `STATIC PASS / LIVE LONG-SESSION PENDING / NOT CANONICAL`;
- SHA-256 do arquivo público de distribuição: `655d6b9b933ce899df223459bac20d71f4fdcf760511a231090758dfcdf13e11`;
- o SHA difere da RC2 de engenharia porque o arquivo público adiciona somente metadados `@homepageURL`, `@updateURL` e `@downloadURL`; o runtime permanece o mesmo.

**Importante:** a RC2 revelou que a telemetria multi-hora ainda não é crash-safe. Não iniciar outro teste longo destinado a preservar histórico até que a próxima candidata incorpore persistência/recovery.

## Como a publicação funciona

O payload aprovado é reconstruído pelo GitHub Actions. Antes de publicar a URL fixa, o workflow valida o SHA-256 esperado e executa `node --check`. Isso evita publicar silenciosamente um arquivo truncado ou diferente do artefato aprovado.

## Canal de desenvolvimento

O desenvolvimento completo, documentação de engenharia, Evidence Database e logs de laboratório permanecem no repositório privado e **não são publicados aqui**.

Este repositório contém somente artefatos explicitamente aprovados para distribuição/teste.

## Privacidade

Este repositório público não deve receber JSONs de sessões LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna não aprovada.
