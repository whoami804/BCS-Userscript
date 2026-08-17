# Boosteroid Control Suite — Userscript

Canal público de distribuição do **Boosteroid Control Suite (BCS)** para instalação via Tampermonkey.

## Instalação

O arquivo instalável usa uma URL fixa:

`control-suite-boosteroid.user.js`

Quando publicado, abra o arquivo no GitHub e use **Raw**. O Tampermonkey deverá abrir a tela de instalação.

## Canal de desenvolvimento

O desenvolvimento completo, documentação de engenharia, Evidence Database e logs de laboratório permanecem em repositório privado e **não são publicados aqui**.

Este repositório contém somente artefatos explicitamente aprovados para distribuição/teste.

## Estado atual

- Baseline canônica do projeto: `v0.8.0`.
- Última candidata produzida: `v0.8.1-rc2 — Image Telemetry + Long Session Stability`.
- A RC2 está `STATIC PASS / LIVE LONG-SESSION PENDING / NOT CANONICAL`.
- Um teste multi-hora revelou que a telemetria de longo prazo ainda precisa de persistência crash-safe antes da próxima repetição extensa.

Por isso, a próxima candidata de Long Session deve adicionar recuperação/persistência antes de novo teste multi-hora.

## Privacidade

Este repositório público não deve receber:

- JSONs de sessões LIVE;
- Evidence DB;
- cookies/tokens/credenciais;
- dumps ou dados privados de laboratório;
- documentação interna não aprovada.
