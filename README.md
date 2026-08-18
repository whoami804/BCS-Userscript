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

- runtime: `v0.8.1-rc4 — Image Telemetry + Long Session Crash-Safe Integrity`;
- status de engenharia: `STATIC PASS / LIVE CRASH-RECOVERY PENDING / NOT CANONICAL`;
- SHA-256 da build de engenharia: `13502346f7c8507dce3e1363557264b9f0cb646b60e9d5ec0611a499965c28d0`;
- SHA-256 esperado do arquivo público de distribuição: `2ee126e6ec94bb7a66ac08d525838b926c9ac57eeecce31c7def7f1e82861727`;
- o SHA público difere apenas porque o arquivo distribuído adiciona `@homepageURL`, `@updateURL` e `@downloadURL` ao cabeçalho.

### O que muda na RC4

A RC4 mantém o desenho crash-safe introduzido na RC3 e fecha um risco encontrado na revisão estática antes do LIVE: a vida útil de transações IndexedDB não deve depender de `await` entre leitura e novas escritas na mesma transação.

Ela mantém:

- checkpoints limitados e de baixa frequência;
- persistência assíncrona em IndexedDB quando disponível;
- `sessionId` lógico recuperável após reload/crash no mesmo origin Boosteroid;
- checkpoints adicionais em `pagehide`/ocultação e antes do Export;
- recuperação origin-scoped e retenção limitada;
- zero novo `getStats()`;
- Stream Control fora do escopo da alteração.

A RC4 move a leitura do metadata para antes da transação de escrita e registra o `transaction done` antes de emitir as operações, reduzindo risco de `TransactionInactiveError`/auto-commit durante persistência.

**Limite importante:** um crash abrupto ainda pode perder o intervalo entre o último checkpoint persistido com sucesso e a falha. O objetivo é não perder horas inteiras, não gravar cada frame de forma síncrona.

## Como a publicação funciona

A transição RC3 → RC4 é aplicada no GitHub Actions sobre a beta pública anterior. O workflow verifica o SHA da base, aplica o patch aprovado, verifica o SHA final e executa `node --check` antes de publicar a URL fixa.

## Canal de desenvolvimento

O desenvolvimento completo, documentação de engenharia, Evidence Database e logs de laboratório permanecem no repositório privado e **não são publicados aqui**.

Este repositório contém somente artefatos explicitamente aprovados para distribuição/teste.

## Privacidade

Este repositório público não deve receber JSONs de sessões LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna não aprovada.
