---
description: Ordem de registro, autorizacao, validacao e upload nas rotas Express do Grindfy
paths:
  - "server/routes/**"
  - "server/index.ts"
  - "server/auth.ts"
---

# Rotas Express

Indice: `Docs/api/endpoints-index.md`. Detalhe: `Docs/api/endpoints.md`.

## Ordem de registro e semantica

Express 4 e ordem-pura: **`/:id` registrado antes engole qualquer sub-path de um
segmento**. Isso ja quebrou EST-3 (`/api/study-sessions/:id` legado comendo os
sub-paths v2) e apareceu de novo no MDA-1.

Regra: sub-paths estaticos e de multiplos segmentos **antes** de `/:id`. Rota nova
em namespace que ja tem `:id` legado registrado antes ganha sub-path dedicado
(`/:id/detail`, `/by-theme`) e um teste de colisao em
`tests/integration/routes/`.

Registro de modulo novo em `server/index.ts` vem **antes** de qualquer modulo que
ja capture o mesmo prefixo.

## Autorizacao

`requireAuth` -> gate de permissao/tier -> Zod -> storage.

Use `requireGranularPermission`. O `requirePermission` legado era **fail-OPEN**
(ADR-240): na duvida liberava. Rota nova sem gate nao e "aberta por enquanto", e
furo.

Ownership vai no `where` da query. Checar so no `if` do handler ja produziu IDOR
em grind-sessions. Recurso de outro usuario responde 404, nao 403 — nao vaze
existencia.

Tier gate em write de dominio pago e defense-in-depth: mesmo com a UI escondendo
o botao, a rota nega.

## Validacao

`schema.parse(req.body)` antes de qualquer operacao. `.strict()` em PATCH para
recusar campo desconhecido. Erro de Zod vira 400 com mensagem util, nao 500.

Numero que vem do cliente: cheque tipo (int vs float ja invalidou payload inteiro
na calculadora de variancia).

## Upload

Multer em memoria com cap de tamanho, **magic bytes** (nao `Content-Type`), nome
gerado por `nanoid` (nunca o nome do cliente), e diretorio privado quando o
conteudo for de terceiros (copyright). Rollback do arquivo quando a escrita no
banco falha.

## Resposta

JSON direto, sem wrapper. Erro: `console.error` com contexto +
`res.status(N).json({ message })`. Nunca devolva stack para o cliente.

Handler testavel aceita `injectedStorage?` como 3o argumento, com lazy import em
producao (lesson #34).

## Documentacao

Endpoint novo entra em `Docs/api/endpoints-index.md` na mesma sprint. Sem isso, a
proxima sessao registra rota colidindo com a sua.
