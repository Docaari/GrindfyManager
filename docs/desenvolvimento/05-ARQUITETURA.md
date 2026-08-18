# Arquitetura do Grindfy

## O formato: camadas finas com um nucleo compartilhado

O Grindfy nao e pipeline nem hexagonal. E um monolito TypeScript com **tres
territorios e um contrato no meio**:

```
client/src/          React 18 + Wouter + TanStack Query
     |  HTTP JSON (sem wrapper)
server/routes/       17 modulos Express, um por dominio
     |
server/storage*.ts   TODA query Drizzle mora aqui
     |
PostgreSQL 16 (local) / Neon (prod)

shared/              schema Drizzle + Zod + helpers puros
                     lido pelos dois lados; nao importa nada de server/ nem client/
```

Regra estrutural unica: **`shared/` nao conhece ninguem. `client/` nao conhece
`server/`. `server/routes/` nao escreve SQL.**

Quebrar a terceira e o caminho mais rapido para tornar o dominio intestavel — e o
dominio (scoring, variancia, pace de metas, FX) e justamente o que mais precisa
de teste.

## As fronteiras

| Territorio | Responsabilidade | O que NAO faz |
|---|---|---|
| `client/src/pages` | rota, composicao, estado de tela | nao faz regra de negocio financeira |
| `client/src/components` | apresentacao + interacao | nao chama `fetch` cru (usa `apiRequest`) |
| `server/routes/**` | HTTP: validar, autorizar, orquestrar | nao escreve query Drizzle |
| `server/storage*.ts` | acesso a dados | nao decide regra de produto |
| `server/services/**` | orquestracao com efeito (wallet, email, FX, storage de imagem) | nao conhece `req`/`res` |
| `server/coach/**` | prompts, tools, geradores, elegibilidade | nao chama o SDK direto (usa `anthropicClient`) |
| `server/scoring/**` | scoring do Tournament Selector, normalizador de moeda | nao le `req`, nao faz IO |
| `shared/**` | schema, tipos, Zod, helpers puros | nao importa `server/` nem `client/` |

## As invariantes que os bugs nos obrigaram a ter

Repare que quase toda regra abaixo existe por causa de um bug com nome. Isso nao
e coincidencia: **arquitetura, neste projeto, e o conjunto de decisoes que os
bugs nos obrigaram a tomar.**

**Uma fonte de verdade para o historico.** `tournaments` com
`grind_session_id IS NULL` e historico; `session_tournaments` e detalhe de sessao
ao vivo. Toda query de dashboard/analytics/library filtra. Misturar os dois faz o
dashboard mentir sem erro nenhum na tela (CLAUDE.md secao 6.1).

**Dinheiro so se compara na mesma moeda.** Converta para USD antes de qualquer
comparacao com threshold. O bug do grind-live passou porque
`calculateSessionStats` ignorava o 5o argumento `usdConversionRates`.

**Permissao e fail-closed.** `requirePermission` legado era fail-OPEN; a versao
correta e `requireGranularPermission` (ADR-240). Rota nova sem gate nao e "aberta
por enquanto", e furo.

**Ordem de rota e semantica em Express 4.** `/:id` registrado antes engole
qualquer sub-path de um segmento. Sub-paths estaticos vem primeiro, sempre — e
com teste de colisao (EST-3, MDA-1).

**Estado que existe em dois lugares diverge.** Preferencia do Coach que vive na
tabela e tambem em `COACH_PREFS_DEFAULTS` no codigo ja divergiu (EST-1.1); chave
de semana em UTC e BRT convivem **de proposito**, documentadas, porque unificar
quebraria back-compat (EST-6).

**Job assincrono e a fronteira do "melhor esforco".** `report_jobs` enfileira,
o processor gera. Enfileirar nunca derruba a requisicao do usuario; gerar nunca
fica preso (`COACH_LLM_TIMEOUT_MS`).

## O elefante: `CLAUDE.md` tem 77 KB e `storage.ts` e gigante

Todo mundo sabe. A decisao consciente e **nao quebrar agora**, e vale registrar o
porque:

- `storage.ts` e quase todo query com forma parecida e responsabilidade unica por
  metodo. Quebrar em cinco arquivos nao desacopla nada — o acoplamento e com o
  schema, nao entre os metodos. A extracao por dominio ja comecou onde havia
  ganho real (`storage/mdaStorage.ts`, `goalsStorage.ts`, `aiStructuredProfile.ts`)
  usando o attach pattern.
- O risco e assimetrico: quebrar errado quebra o produto; deixar como esta custa
  conforto de leitura.

Quando quebrar, quebra **com spec, com teste e por dominio de negocio** — nunca
por tipo de codigo ("todos os selects aqui, todos os inserts ali", que e a
separacao que menos ajuda).

## Concorrencia e efeitos

Node single-thread + async. Regras:

- Operacao que toca duas tabelas relacionadas roda em `db.transaction`, com
  fallback gentil quando `db` nao esta inicializado (lesson #32 — testes mockam
  `storage` mas nao `db`).
- Nunca abrir transacao dentro de service que ja esta dentro de outra.
- Cron e job (`cronRunner`, `reportJobRunner`) sao best-effort e gated por
  `COACH_NUDGES_ENABLED`. Falha de job nunca propaga para a requisicao do usuario.
- Cache server-side com TTL precisa de invalidador publico chamado pelas mutations
  (lesson #21), senao a UI ve dado velho ate o TTL expirar.

## Onde colocar codigo novo

1. E regra pura (calculo, formato, validacao)? -> `shared/` ou `server/coach/**`
   como helper puro, com teste unitario.
2. E query? -> `server/storage*.ts` (ou um `storage/<dominio>Storage.ts` novo se o
   dominio for grande, via attach pattern).
3. E efeito externo (email, FX, arquivo, Anthropic, Spotify)? -> `server/services/**`.
4. E HTTP? -> `server/routes/<dominio>.ts`, com Zod antes de tudo e o gate de auth.
5. E tela? -> `client/src/pages/**` + componentes em `client/src/components/<dominio>/`.
6. E token visual, espacamento, cor? -> `@/lib/ui-tokens`, nunca valor solto.

Nao encaixou? Isso e sinal de conceito novo — decisao de spec e de ADR, nao de
improviso. **Modulo novo exige decisao explicita.**

## O que a arquitetura protege

A capacidade de mudar uma parte sem reler o resto. Concretamente: dar para
testar scoring, pace de meta, variancia e parser sem subir Express nem abrir
navegador. Toda vez que alguem colocou regra de negocio dentro do handler HTTP, o
teste virou teste de integracao lento e a regra deixou de ser coberta.
