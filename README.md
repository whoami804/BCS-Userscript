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

- runtime: `v0.8.1-rc3 — Image Telemetry + Long Session Crash-Safe`;
- status de engenharia: `STATIC PASS / LIVE CRASH-RECOVERY PENDING / NOT CANONICAL`;
- SHA-256 da build de engenharia: `bd7a38db42e42d0bc99b50d31caf40c106c9a7514150fb5f9240dca8f20065ea`;
- SHA-256 esperado do arquivo público de distribuição: `d4241c8ee48d88cb795072d0108c66e58980c0c7e378220fded9b8cbe912129d`;
- o SHA público difere apenas porque o arquivo distribuído adiciona `@homepageURL`, `@updateURL` e `@downloadURL` ao cabeçalho.

### O que muda na RC3

A RC3 mantém o CORE e o Stream Control existentes e adiciona persistência crash-safe ao **Long Session Telemetry**:

- checkpoints continuam limitados e de baixa frequência;
- cada checkpoint é persistido de forma assíncrona em IndexedDB quando disponível;
- um `sessionId` lógico pode ser recuperado após reload/crash no mesmo origin Boosteroid;
- `pagehide` e ocultação da página tentam registrar um checkpoint adicional;
- o Export registra um checkpoint final antes de serializar o JSON;
- a recuperação é origin-scoped e limitada; não duplica o ring CORE de 1 Hz;
- nenhum novo `getStats()` foi adicionado.

**Limite importante:** um crash abrupto ainda pode perder o intervalo entre o último checkpoint persistido com sucesso e a falha. A RC3 reduz o risco de perder horas inteiras, mas não transforma persistência assíncrona em gravação síncrona por frame.

## Como a publicação funciona

A transição RC2 → RC3 é aplicada no GitHub Actions sobre a beta pública anterior. O workflow verifica o SHA da base, aplica o patch aprovado, verifica o SHA final e executa `node --check` antes de publicar a URL fixa.

## Canal de desenvolvimento

O desenvolvimento completo, documentação de engenharia, Evidence Database e logs de laboratório permanecem no repositório privado e **não são publicados aqui**.

Este repositório contém somente artefatos explicitamente aprovados para distribuição/teste.

## Privacidade

Este repositório público não deve receber JSONs de sessões LIVE, Evidence DB, cookies/tokens/credenciais, dumps ou documentação interna não aprovada.
