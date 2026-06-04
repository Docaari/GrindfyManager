# ADR-242: Editar evolucao mental da sessao via bulk-replace atomico com medias derivadas

## Status
Aceito

## Data
2026-06-04

## Contexto

A feature "Evolucao Mental Editavel na Sessao" (spec `Docs/specs/evolucao-mental-editavel-sessao.md`)
expoe e torna editavel, no modal de editar sessao historica (`EditSessionDialog`), a serie
granular de break feedbacks (`break_feedbacks`, 1 row/break, 5 metricas int 0-10 + `breakTime` +
`notes`) ao inves de apenas as 5 medias agregadas (`grind_sessions.energiaMedia` / `focoMedio` /
`confiancaMedia` / `inteligenciaEmocionalMedia` / `interferenciasMedia`).

O founder fechou as questoes abertas da spec, e duas das decisoes mudam a arquitetura proposta no
texto original da spec:

- **Q-01 (medias): DERIVAR dos breaks.** As 5 medias da sessao passam a ser RECALCULADAS a partir
  dos reports de break ao salvar. Os 5 sliders de media editaveis saem do modal e viram visao
  derivada read-only a partir da serie. Isso e a **Opcao B** da spec, nao a Opcao A (default da spec).
- **Q-03 (persistencia): SALVAR JUNTO.** O modal mantem estado draft da serie de breaks; um unico
  clique em "Salvar Alteracoes" persiste sessao + breaks atomicamente. Isso contradiz o default da
  spec (persistencia imediata por operacao POST/PUT/DELETE).
- **Sessao sem break: PERMITIR criar do zero** (sessoes antigas importadas sem break ganham reports
  novos no modal).
- Q-02 (limite de `notes`): 500 chars (paridade com convencao do projeto).
- Q-04 (ordenacao da lista): ASC por `breakTime`, casa com o grafico.

Essas decisoes geram duas perguntas arquiteturais que este ADR resolve:

1. **Bulk-replace atomico vs. orquestracao client-side de N chamadas CRUD individuais**
   (PUT/POST/DELETE por break, como a spec original propunha em RF-01/RF-02).
2. **Como derivar e onde persistir as medias** dado que `grind_sessions.*Media` sao colunas
   `decimal()` (string no Drizzle) e que **nao existe coluna `breakCount` em `grind_sessions`**
   (o `breakCount` so existe como campo computado em tipos de bundle de relatorio — `schema.ts:5790`),
   e a restricao do projeto e **zero migration**.

### Estado atual relevante (codigo de referencia)

- `break_feedbacks` (`shared/schema.ts:727`): `id` PK nanoid, `userId` FK cascade, `sessionId`
  nullable, `breakTime` timestamp NOT NULL, 5 metricas int NOT NULL, `notes` text nullable,
  `createdAt`.
- `clampBreakFeedback` (`shared/utils.ts:5`): clampa 5 metricas 0-10, default 5 em NaN. Reuso obrigatorio.
- Storage: `getBreakFeedbacks` (`storage.ts:4188`, ORDER BY breakTime DESC), `createBreakFeedback`
  (`:4218`, gera nanoid), `deleteBreakFeedback` (`:4227`, hard delete sem ownership). **Nao existe
  `updateBreakFeedback`.**
- `grind_sessions.*Media` (`shared/schema.ts:701-705`): colunas `decimal()` (Drizzle le/escreve como
  `string`). **Nao ha coluna `break_count`/`breakCount`.**
- PUT `/api/grind-sessions/:id` (`routes/grind-sessions.ts:1210`): ownership pre-check no padrao
  audit (`:1219-1222`, 404 para nao-dono), depois `storage.updateGrindSession(id, data)`.
- Endpoints de break existentes: GET `/api/break-feedbacks?sessionId=` (`:1369`), POST
  `/api/break-feedbacks` (`:1381`, clampa antes de `insertBreakFeedbackSchema.parse`). **Nao existe
  PUT nem DELETE por id.**
- Convencoes vinculantes: lesson #32 (`db.transaction` com fallback gentil quando `db` indisponivel
  em teste), lesson #34 (handlers aceitam `injectedStorage?` como 3o arg, fallback lazy
  `await import('../storage')`).

## Decisao 1 — Bulk-replace atomico (substitui o CRUD individual da spec)

Adotar um unico endpoint **`PUT /api/grind-sessions/:id/break-feedbacks`** que substitui o conjunto
inteiro de breaks da sessao numa transacao, recalcula e persiste as medias + `breakCount` (derivado)
na MESMA transacao, e retorna a serie nova + as medias novas. Os endpoints PUT/DELETE por id
individuais da spec original (RF-01/RF-02) **NAO sao implementados**.

### Contrato

```
PUT /api/grind-sessions/:id/break-feedbacks      (JWT)
```

Request body (`.strict()`):

```json
{
  "breaks": [
    {
      "id": "abc123",            // opcional: ausente => novo break (nanoid no server)
      "breakTime": "2026-06-04T14:30:00.000Z",
      "foco": 7, "energia": 6, "confianca": 8,
      "inteligenciaEmocional": 5, "interferencias": 9,
      "notes": "perdi foco apos bad beat"   // string | null, max 500
    }
  ]
}
```

Semantica do conjunto (a fonte de verdade e o payload):

- `id` presente e pertencente a sessao -> UPDATE daquele break.
- `id` ausente -> INSERT novo break (`nanoid()` no server, `userId` da sessao, `sessionId = :id`).
- `id` presente no DB para a sessao mas AUSENTE no payload -> DELETE.
- `breaks: []` -> remove todos os breaks da sessao (volta ao empty state; medias viram null).
- Cada break: 5 metricas clampadas via `clampBreakFeedback` ANTES do Zod parse (paridade com POST);
  `breakTime` ISO->Date, fallback para o break existente (id conhecido) ou `now` (break novo) se
  invalido; `notes` string|null max 500.

Response 200:

```json
{
  "breaks": [ /* serie persistida, ORDER BY breakTime ASC */ ],
  "medias": {
    "focoMedio": "7.0", "energiaMedia": "6.0", "confiancaMedia": "8.0",
    "inteligenciaEmocionalMedia": "5.0", "interferenciasMedia": "9.0"
  },
  "breakCount": 1
}
```

- 404: `{ "message": "Sessao nao encontrada" }` — sessao inexistente ou de outro usuario.
- 400: `{ "message": "Failed to update break feedbacks" }` — payload invalido (`.strict()`, tipos).

### Regras

- **Ownership ANTES de mutar** (padrao audit `grind-sessions.ts:1219`): `storage.getGrindSession(:id)`;
  se `!session || session.userId !== userId` -> 404 sem tocar nada. Os breaks herdam `userId` e
  `sessionId` da sessao validada — o payload NUNCA carrega `userId`/`sessionId` (imutaveis; ignora-se
  qualquer campo desses via `.strict()` rejeitando-os).
- **Validacao Zod antes de operar**: `bulkReplaceBreakFeedbacksSchema` em `shared/schema.ts`
  (`.strict()`, `breaks` = array; cada item com 5 metricas `z.number().int().min(0).max(10)`,
  `breakTime` coerce, `notes` `z.string().max(500).nullable().optional()`, `id` `z.string().optional()`).
  `clampBreakFeedback` aplicado por item ANTES do parse (defense-in-depth, paridade com POST).
- **Transacao** (lesson #32): `db.transaction` com fallback gentil. Detection runtime
  `const txAvailable = db && typeof db.transaction === "function"`; quando indisponivel (testes sem
  DATABASE_URL), roda o runner com `tx` undefined e os helpers de storage operam sem tx. Os helpers
  de storage aceitam `tx?` como ultimo arg e NAO o passam quando undefined (preserva aridade que
  testes inspecionam).
- **Handler com `injectedStorage?`** (lesson #34): `handlePutSessionBreakFeedbacks(req, res, injectedStorage?)`,
  fallback lazy `await import('../storage')` em producao.
- **Registro de rota** em `routes/grind-sessions.ts` proximo aos endpoints de break
  (`:1369`-`:1404`). O sub-path de 2 segmentos (`/:id/break-feedbacks`) nao colide com
  `PUT /api/grind-sessions/:id` (1 segmento) — Express casa pelo path completo.
- GET/POST de break existentes **permanecem** (o grafico do modal le via GET; outras superficies
  podem continuar criando 1 break via POST). O bulk e o caminho do "salvar junto" do modal.
- Invalidacao de cache pos-save: a UI invalida por prefixo de queryKey (lesson #21)
  `['break-feedbacks', sessionId]` + as queries de historico/sessoes que exibem medias/`breakCount`.
  O handler tambem chama `invalidateHomeOverviewCache(userId)` + `invalidateDashboardQuickStatsCache(userId)`
  (paridade com PUT/DELETE de sessao — medias e contagem mudam o overview).

### Opcoes consideradas (Decisao 1)

#### Opcao 1: CRUD individual (PUT/POST/DELETE por break) + orquestracao client-side
- **Pros:** break e entidade propria com endpoints proprios; menos codigo de servidor novo (so
  adiciona PUT+DELETE+`updateBreakFeedback`); era o default da spec.
- **Contras:** com "salvar junto" + "medias derivadas", o client teria que orquestrar N chamadas
  (M POSTs + K PUTs + J DELETEs) e DEPOIS um PUT de sessao com as medias recalculadas no client.
  **Quebra de atomicidade**: se uma das N chamadas falhar no meio, a sessao fica com breaks
  parcialmente salvos e medias inconsistentes (recalculadas no client a partir de um estado que o
  DB nunca chegou a ter). A regra de "media derivada" depende do DB ter o conjunto COMPLETO de
  breaks antes de calcular — impossivel garantir com N round-trips independentes. Recalculo no
  client tambem duplica a logica de media (divergencia silenciosa, lesson #10 generalizada).

#### Opcao 2 (ESCOLHIDA): bulk-replace atomico num unico endpoint transacional
- **Pros:** 1 round-trip; atomicidade real (tudo-ou-nada via `db.transaction`); o recalculo das
  medias acontece no SERVER dentro da mesma tx, sobre o conjunto final de breaks — nunca ha estado
  intermediario observavel onde medias e serie divergem. Casa exatamente com o modelo "draft no modal
  + 1 clique salva". Logica de media vive num so lugar (server), sem duplicacao no client.
- **Contras:** endpoint novo com semantica de set-replace (mais codigo de servidor que so o CRUD);
  precisa de helpers de storage que aceitam `tx`. Payload carrega a serie inteira a cada save
  (aceitavel: series de break sao pequenas, < dezenas de pontos por sessao).

A atomicidade exigida pela combinacao "salvar junto" + "medias derivadas" torna a Opcao 1
incorreta por construcao. A Opcao 2 e a unica que garante que a media persistida sempre corresponde
ao conjunto de breaks persistido.

## Decisao 2 — Medias derivadas (recalculo no server, zero migration)

Apos o bulk-replace, dentro da mesma transacao, recalcular as 5 medias como **media aritmetica
simples dos breaks resultantes** e persistir nas colunas `grind_sessions.*Media` (que ja existem).

- Mapeamento metrica -> coluna: `foco->focoMedio`, `energia->energiaMedia`,
  `confianca->confiancaMedia`, `inteligenciaEmocional->inteligenciaEmocionalMedia`,
  `interferencias->interferenciasMedia`.
- As colunas sao `decimal()` (Drizzle le/escreve `string`). A media e calculada como numero e
  serializada para string (ex.: `"7.0"`, 1 casa decimal) ao gravar — consistente com como o PUT de
  sessao ja grava `*Media` como string hoje (`GrindSession.tsx:1147`).
- **Sessao com 0 breaks** (payload `breaks: []` ou todos deletados): as 5 medias sao gravadas como
  `null` (paridade com sessao legada sem breaks; o modal mostra empty state, sem media derivada).
  NAO se mantem o ultimo valor — isso evita media "fantasma" sem serie de origem.

### `breakCount` — derivado, NAO persistido (sem migration)

A decisao de produto Q-01 menciona "`breakCount` = numero de breaks". Como **nao existe coluna
`break_count` em `grind_sessions`** e a restricao e zero migration, `breakCount` e tratado como
**valor derivado**, nao persistido:

- A response do bulk endpoint inclui `breakCount = breaks.length` (computado da serie persistida).
- Qualquer superficie que exiba `breakCount` por sessao ja o deriva de `getBreakFeedbacks` /
  `getBreakFeedbacksBySessionIds` (e o que o bundle de relatorio faz em `schema.ts:5790`). Nenhuma
  coluna nova; o numero vem sempre da contagem de rows de `break_feedbacks` da sessao.
- Se no futuro o founder quiser materializar `breakCount` por performance, isso vira migration
  dedicada (fora do escopo desta fatia).

### Sliders de media saem do modal (viram read-only)

Os 5 sliders de media editaveis do `EditSessionDialog` saem. As medias passam a ser visao derivada
read-only renderizada a partir da serie editada (calculadas no client em tempo real para preview;
a fonte de verdade persistida e o recalculo do server). O PUT `/api/grind-sessions/:id` legado
**deixa de receber `*Media` no body** vindo do modal — as medias agora so mudam via o bulk endpoint.
(Outros caminhos que gravam `*Media`, se existirem, ficam intocados; o modal e o unico afetado.)

### Opcoes consideradas (Decisao 2)

#### Opcao A: medias independentes (default da spec) — DESCARTADA
- **Pros:** modelo atual simples e desacoplado; nao acopla as duas entidades.
- **Contras:** o founder rejeitou — gera divergencia confusa entre a serie editada e a media exibida.

#### Opcao B (ESCOLHIDA): medias derivadas, recalculadas no server na mesma tx
- **Pros:** coerencia garantida (media sempre reflete a serie); um so lugar de calculo (server);
  zero migration (reusa colunas `*Media`); atomico com o bulk-replace.
- **Contras:** acopla medias a serie (intencional aqui); precisa decidir o caso 0-breaks (resolvido:
  null). Perde a possibilidade de media "de cabeca" divergente — aceito pelo founder.

#### Opcao C: derivada-como-sugestao (client preview + botao "aplicar") — adiada
- **Pros:** flexibilidade.
- **Contras:** founder pediu derivacao automatica no save, nao sugestao manual. Fica como follow-up
  se a conveniencia for desejada.

## Consequencias

**Positivas:**
- Atomicidade real: nunca ha sessao com media recalculada mas breaks parcialmente salvos.
- Logica de media e clamp vivem num so lugar (server), sem duplicacao client (anti lesson #10).
- Zero migration: reusa `break_feedbacks` + colunas `*Media`; `breakCount` derivado.
- Modelo de save simples para o modal: 1 draft, 1 clique, 1 round-trip.
- Reuso de `clampBreakFeedback` + padrao de ownership audit + lesson #32/#34.

**Negativas / trade-offs:**
- Endpoint com semantica de set-replace (diff INSERT/UPDATE/DELETE no server) e mais complexo que
  CRUD simples — exige cuidado para o diff de ids ser idempotente (espelha o padrao de diff de tags
  do MDA, lesson #33 generalizada para rows).
- O payload carrega a serie inteira a cada save (aceitavel pelo volume baixo de breaks/sessao).
- Os endpoints PUT/DELETE por-id da spec original nao existem — se outra superficie precisar editar
  1 break isolado no futuro, sera preciso adicionar o CRUD individual (ou reusar o bulk com a serie
  inteira).
- Recalculo grava medias com 1 casa decimal como string; consumidores que faziam `parseFloat` das
  medias continuam funcionando (paridade com o formato atual).

**Neutras:**
- GET/POST de break feedbacks permanecem inalterados.
- `breakCount` continua derivado em todas as superficies (nenhuma passa a depender de coluna nova).
- Ordenacao: serie retornada ASC por `breakTime` (Q-04); o GET legado continua DESC, o client
  reordena (paridade com a regra atual do grafico).

## Confianca
Alta — decisao ancorada em decisoes de produto explicitas do founder, em codigo de referencia real
(ownership audit, `clampBreakFeedback`, colunas `*Media` decimal, ausencia de `break_count`) e em
lessons consolidadas (#32 tx-fallback, #34 injectedStorage, #21 cache-prefix, #33 diff idempotente).
