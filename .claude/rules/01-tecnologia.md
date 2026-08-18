---
description: A pilha do Grindfy e as regras sobre dependencia, dinheiro, concorrencia e env
---

# Tecnologia

**Front:** React 18 + TypeScript 5.6 + Vite + Wouter + TanStack Query + Tailwind +
Radix/shadcn + Recharts + React Hook Form + Zod.
**Back:** Node 20 + Express + Drizzle ORM + pg/Neon + JWT + Multer + Nodemailer +
helmet + express-rate-limit.
**DB:** PostgreSQL 16 local (porta 5433) / Neon em producao.
**Testes:** Vitest 4 com `test.projects` (node + jsdom). Build: Vite + esbuild.

Dev: `npm run dev` (porta 3000). Typecheck: `npm run check`.

## Dependencia nova

Nao adicione nada em `package.json` sem pedir. Antes de propor, responda:

1. Quantas linhas nossas isso substitui?
2. Da para fazer com o que ja esta instalado?
3. Quem mantem e quando foi a ultima release?

Artigo VII: usar a plataforma direto.

## Dinheiro

- `numeric` do Postgres chega como **string** no pg. Converta na fronteira do
  storage, explicitamente, e cheque `Number.isFinite`.
- Converta para USD antes de comparar com qualquer threshold (Artigo VI).
- Sem cotacao: degrade com razao nomeada. `?? 1` numa taxa e proibido.
- Drift conhecido e vigiado: usamos `Number` em bankroll/wallet, com a limitacao
  de IEEE 754 aceita conscientemente (Dev LLM Hub,
  `catalog/financial-precision/decimal-end-to-end.md`).

## Concorrencia e efeitos

- Duas escritas relacionadas -> `db.transaction`, com fallback gentil quando `db`
  nao esta inicializado (lesson #32: teste mocka `storage`, nao `db`).
- Nunca abrir transacao dentro de service que ja roda dentro de outra.
- Cron e job (`cronRunner`, `reportJobRunner`) sao best-effort, gated por
  `COACH_NUDGES_ENABLED`. Falha de job nao propaga para a requisicao do usuario.
- Chamada a LLM tem cap de wall-clock (`COACH_LLM_TIMEOUT_MS`) e passa por
  `server/coach/anthropicClient.ts`. Nunca instancie o SDK direto.
- Cache com TTL exige invalidador publico chamado pelas mutations (lesson #21).

## Variaveis de ambiente

`.env` na raiz, fora do git. Env nova exige, na mesma sprint: entrada em
`.env.example`, entrada na secao 4 do `CLAUDE.md` e default seguro no codigo
(ausente = comportamento conservador, nao crash em runtime tardio).

Segredo nunca entra em codigo, teste ou log.

## Anthropic

Modelos em runtime: Sonnet para narrativa de relatorio, Haiku para sumarizacao
(`COACH_MODEL`, `COACH_REPORT_SUMMARIZER_MODEL`). Bloco de prompt duplicado
quebra o cache — prompt e conhecimento unico, mora num arquivo so.
Ao mexer em SDK/Coach, carregue a skill `claude-api`.
