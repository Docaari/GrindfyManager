# Spec: home-reform-4 Item 7 — 3 Stats Foco do Mes + Temas Estudo Linkados

> **Sub-spec dedicada do Item 7** da spec mae `Docs/specs/home-reform-4.md` (linhas 240-269).
> Pipeline TDD obrigatorio. Aguardar aprovacao founder antes de avancar para system-architect.

## Status
**Proposta** | Aprovada | Em Desenvolvimento | Concluida

## Resumo Executivo

Permitir ao jogador marcar **3 stats HUD como "foco do mes"** dentro do Stats Analyzer (`/estudos/stats`), cada uma vinculada a um **tema de estudo** existente. Substituir o card de Estudos generico no Home por um **`FocusStatsCard`** que mostra para cada uma das 3 stats foco:

1. Nome + valor atual + delta vs mes anterior;
2. Nome do tema linkado + tempo dedicado no mes (somatorio `study_sessions.duration` filtrado por `studyCardId` do tema);
3. Botao "Estudar agora" -> navega para a tela de detalhe do tema (`/estudos/temas/:id`).

Mes corrente eh recalculado por request (UTC midnight rollover); marcacoes sao **escopadas por mes** via coluna `month` (formato `YYYY-MM`), de forma que ao virar o mes o card volta para empty state ate o user marcar 3 novas (que podem ser as mesmas — sem reset automatico das marcacoes anteriores: cada mes eh independente).

---

## Contexto

- **Spec mae:** `Docs/specs/home-reform-4.md` Item 7 ja cobre a intencao em alto nivel mas pede sub-spec dedicada por causa do volume (schema novo + endpoint novo + UI em duas telas).
- **Estado atual da Home (zona Performance / Estudos):** Hoje nao existe "card Estudos" dedicado no `Home.tsx` — o que existe na zona Acao Imediata eh `<LibraryResume />` (biblioteca de aulas) e na zona Performance ha `StatsTopDeltas`/`VarianceCard`/`HeuristicsCard`. **NAO ha card de tempo de estudo por tema na Home hoje.** Este Item 7 introduz um card novo (nao substitui nenhum existente), a ser posicionado dentro de uma **nova zona "Estudos"** ou no fim da zona Performance — decisao em §6.
- **Integracoes existentes que reusamos:**
  - Catalogo HUD em `shared/hud-stat-catalog.ts` (200+ entries, fonte de truth para nome/label/group/unit/direction).
  - Snapshots HUD em `hud_stat_snapshots` (jsonb `values: Record<statId, number | null>`) — fonte do "valor atual" e "valor mes anterior" (§RF-04).
  - Tabela `study_themes` (themeId varchar, nome, color, emoji, progress).
  - Tabela `study_sessions` (`userId`, `studyCardId`, `date`, `duration` em minutos) — fonte do "tempo dedicado no mes".
  - Endpoint composto `/api/home/overview` ja serve `topDeltas`/`variance`/`heuristics`; padrao consolidado de `Promise.allSettled + timeout 800ms` (ADR-102).
- **Restricoes:**
  - CLAUDE.md §6.1 (regra fonte historico) — irrelevante aqui (HUD snapshots nao sao `tournaments`/`session_tournaments`).
  - CLAUDE.md §8 — IDs via `nanoid`, schemas em `shared/schema.ts`, queries via `storage.ts`, validacao Zod antes de write.
  - Lessons §9: #1 hooks first, #2 data-testid estaveis, #11 sem actions decorativas default, #13 apiRequest retorna JSON, #17 evitar `const profile` colidindo (ja vimos em home.ts).

---

## Objetivos

1. Permitir ao jogador definir 3 stats foco para o mes corrente, cada uma associada a um tema de estudo do mesmo user.
2. Mostrar essas 3 stats no Home com: valor atual (snapshot mais recente do mes), delta vs mes anterior (snapshot mais recente do mes -1), tempo de estudo dedicado ao tema linkado no mes corrente, e atalho para a tela do tema.
3. Permitir gerenciar (adicionar/remover/trocar) marcacoes diretamente da tela `/estudos/stats` em qualquer ponto do mes.
4. Empty states claros e acionaveis em cada cenario faltante (sem stats marcadas / sem snapshots / sem study_sessions).

## Nao-Objetivos

- **NAO** vamos criar tela dedicada de "gerenciamento de focus stats" — o gerenciamento vive embutido dentro de `StatsAnalyzerTab` (badge + menu por stat row).
- **NAO** vamos suportar mais de 3 stats foco por mes (limite hard).
- **NAO** vamos suportar "stats foco da semana" ou "do quarter" — apenas mensal.
- **NAO** vamos criar modal de estudo novo. O botao "Estudar agora" navega para `/estudos/temas/:id` (tela existente, ainda que basica).
- **NAO** vamos automatizar conversao de "leak detectado" em "stat foco" — fica para feature futura (existe `studyRecommendationsService` que pode alimentar isso, fora de escopo).
- **NAO** vamos persistir historico de focus stats apos virar o mes alem do que ja fica naturalmente armazenado (rows com `month` antigo continuam la, apenas nao sao mais "ativas"). NAO vamos ter UI para "ver stats foco de meses anteriores" no MVP.
- **NAO** vamos invalidar/migrar dados quando o catalogo HUD adicionar/remover stats — `stat_id` eh string livre referenciando o catalog, sem FK.

---

## Usuarios

- **Jogador profissional MTT (logado, role default):**
  - Em `/estudos/stats`: marca/desmarca/troca stats foco.
  - Em `/` (Home): consome o card e usa o atalho "Estudar agora".
- **Sem distincao por role** — todo user autenticado tem acesso. Se permission system rejeitar acesso a `/estudos`, o card no Home continua renderizando empty state com CTA, mas o CTA leva ao 403 (comportamento aceitavel; nao precisa gating extra no Home).

---

## Requisitos Funcionais

### RF-01 — Schema `user_focus_stats`

**Descricao:** Persistir as marcacoes mensais de stats foco do user.

**Tabela:** `user_focus_stats`

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `varchar(21)` | PK NOT NULL | nanoid, mesmo padrao das tabelas recentes (`study_theme_spot_links`). |
| `user_id` | `varchar(21)` | NOT NULL, FK `users(user_platform_id)` ON DELETE CASCADE | Padrao do projeto. |
| `stat_id` | `varchar(64)` | NOT NULL | Identificador do `StatField.id` em `shared/hud-stat-catalog.ts` (ex: `cbet_flop_ip`). NAO eh FK — catalog eh estatico em codigo. |
| `study_theme_id` | `varchar` | NOT NULL, FK `study_themes(id)` ON DELETE CASCADE | Cascata: deletar tema remove a marcacao. |
| `month` | `varchar(7)` | NOT NULL | Formato `YYYY-MM` (UTC). Validado via regex `^\d{4}-(0[1-9]|1[0-2])$`. |
| `created_at` | `timestamp` | NOT NULL DEFAULT NOW() | |
| `updated_at` | `timestamp` | NOT NULL DEFAULT NOW() | Trigger `set_updated_at()` (ja existe a function no projeto desde migration 0036). |

**Indices/constraints:**
- `UNIQUE (user_id, stat_id, month)` — uma stat so pode estar marcada uma vez por user no mesmo mes.
- `INDEX (user_id, month)` — query principal do home filtra por (user, month).
- `INDEX (study_theme_id)` — para deletar tema em cascata sem fullscan.

**Constraint logica (enforced em servico, nao no schema):** maximo 3 rows por `(user_id, month)`. Validacao no `POST /api/focus-stats` (RF-03).

**Regras de negocio:**
- Marcacao para mes futuro: **rejeitada** (`400 INVALID_MONTH_FUTURE`). User so marca para mes corrente.
- Marcacao para mes passado: **rejeitada** (`400 INVALID_MONTH_PAST`). Nao reescrevemos historia.
- Stat invalida (id nao existe no catalog atual): **rejeitada** (`400 INVALID_STAT_ID`).
- Tema inexistente ou de outro user: **rejeitada** (`404 THEME_NOT_FOUND`).

**Criterio de aceitacao:**
- [ ] Migration `0042_user_focus_stats.sql` cria tabela + indices + trigger updated_at.
- [ ] Drizzle schema `userFocusStats` exportado em `shared/schema.ts` com types `UserFocusStat` + `InsertUserFocusStat`.
- [ ] `insertUserFocusStatSchema` Zod valida formato `month`, presenca de campos, types.
- [ ] FK cascade testada: deletar tema remove rows; deletar user remove rows.
- [ ] Unique constraint impede duplicar `(user, stat, month)` — segunda insert retorna PG error 23505.

---

### RF-02 — `GET /api/home/focus-stats`

**Descricao:** Retorna as 3 (ou menos) stats foco do user para o mes solicitado, com valor atual, valor mes anterior, delta, dados do tema linkado e tempo de estudo dedicado.

**Endpoint:** `GET /api/home/focus-stats?month=YYYY-MM`
**Auth:** `requireAuth` (JWT padrao).
**Query params:**
- `month` (opcional, default = mes corrente UTC `YYYY-MM`). Formato invalido -> `400`.

**Response 200:**
```json
{
  "month": "2026-05",
  "previousMonth": "2026-04",
  "items": [
    {
      "id": "ufs_xxxxxxxxxxxxxxxxxxxxx",
      "stat": {
        "id": "cbet_flop_ip",
        "label": "C-Bet Flop IP",
        "group": "pos_flop_pfr_ip",
        "unit": "pct",
        "direction": "context",
        "targetMin": 55,
        "targetMax": 70
      },
      "currentValue": 62.4,
      "currentSampleSize": 142,
      "currentCapturedAt": "2026-05-15T20:13:00.000Z",
      "previousValue": 58.1,
      "previousSampleSize": 320,
      "delta": 4.3,
      "deltaDirection": "improving",
      "theme": {
        "id": "th_xxxxxxxxxxxxxxxxxxxxx",
        "name": "C-Bet em Heads-Up",
        "color": "#16a34a",
        "emoji": "♣",
        "progress": 35
      },
      "studyMinutesMonth": 78
    }
  ],
  "meta": {
    "limitReached": false,
    "generatedAt": "2026-05-21T03:14:01.000Z"
  }
}
```

**Regras de negocio para construir cada item:**

1. **Buscar marcacoes:** `SELECT * FROM user_focus_stats WHERE user_id=? AND month=? ORDER BY created_at ASC` (max 3 por contrato).
2. **Stat metadata:** lookup em `HUD_STAT_CATALOG`. Se `stat_id` nao existir mais no catalog (rara, ex: catalog deprecou), `stat = null` no payload e a row aparece em estado degradado com label `"(stat removida do catalogo)"`. Front renderiza warning.
3. **`currentValue`:** snapshot mais recente do mes corrente (`MAX(captured_at) WHERE captured_at >= monthStart AND captured_at < nextMonthStart`) que tenha `values[stat_id] != null`. Considerar TODOS os layouts do user (nao filtra por layout) — tomamos o snapshot global mais recente. Se nenhum snapshot do mes contem a stat, `currentValue = null`.
4. **`previousValue`:** mesma logica para mes anterior. Se nao houver, `null`.
5. **`delta`:** `currentValue - previousValue` (numerico, mesma unit). Se algum lado for `null`, `delta = null`.
6. **`deltaDirection`:** `improving | degrading | neutral`. Calculado considerando `stat.direction`:
   - `higher_better`: delta > 0 -> improving; delta < 0 -> degrading.
   - `lower_better`: delta < 0 -> improving; delta > 0 -> degrading.
   - `context` ou `neutral`: sempre `neutral` (nao classifica subjetivo).
   - Empate exato (`delta === 0`): `neutral`.
7. **`theme`:** `SELECT id, name, color, emoji, progress FROM study_themes WHERE id=? AND user_id=?`. Se tema foi deletado entre marcacao e leitura (caso raro: cascade tirou a row, entao nao chegamos aqui), pular row.
8. **`studyMinutesMonth`:** somatorio de `study_sessions.duration` para esse user no mes corrente, FILTRADO pelo tema. Como `study_sessions.studyCardId` referencia `study_cards.id` (nao `study_themes.id` diretamente), aplicar a regra de **derivacao** abaixo.

**Decisao tecnica — derivacao de "tempo de estudo por tema":**

`study_sessions` tem coluna `study_card_id` (cards = unidades de estudo individuais), nao `theme_id`. Hoje nao existe relacao formal `study_cards.theme_id`. Para o MVP do Item 7 vamos:

- **Opcao A (escolhida):** Considerar `studyMinutesMonth = SUM(duration) WHERE user_id=? AND date >= monthStart AND date < nextMonthStart AND study_card_id IS NULL` (sessoes "soltas" do tema) **+** somar duration de sessoes cujo `study_card_id` aponta para card do tema. Como nao existe FK card->tema hoje, **na primeira entrega** usamos heuristica: somar TODAS as `study_sessions` do mes do user e particionar igualmente entre os themes ativos das focus stats. **Isto eh placeholder.**
- **Opcao B (preferida, requer decisao de arquitetura):** Adicionar coluna `study_sessions.theme_id` (nullable, FK `study_themes.id`) + back-fill via `study_card.theme_id` quando relacao existir. Migration adicional.
- **Opcao C (mais limpa):** Reusar `study_theme_spot_links` (que ja liga tema a spots) e exigir que sessoes futuras informem `theme_id` na criacao via UI. Schema: adicionar `theme_id` em `study_sessions`, deixar nullable, sem back-fill.

**Recomendacao da spec:** **Opcao C** (adicionar `theme_id` nullable em `study_sessions`). System-architect deve confirmar e produzir ADR-117. Se o founder rejeitar mexer em `study_sessions`, fallback eh **Opcao A** (heuristica de divisao igual com badge "estimado") — degradado mas funcional.

**Status `null` permitido em campos:**
- `currentValue`, `currentSampleSize`, `currentCapturedAt`, `previousValue`, `previousSampleSize`, `delta`, `deltaDirection` podem ser `null` se nao ha snapshot.
- `theme` nunca `null` (cascata garante).
- `studyMinutesMonth` eh `0` (nunca `null`).

**Cache:** Reutilizar pattern do `/api/home/overview` (TTL 30s, in-memory por user). **NAO** incluir esse endpoint dentro de `/api/home/overview` no MVP — eh endpoint independente e o card faz request proprio (`useQuery` separado). Isto facilita invalidar so esse cache em mutations sem invalidar o overview inteiro.

**Response 401:** sem JWT.
**Response 400:** month invalido.
**Response 500:** erro interno (logged).

**Criterio de aceitacao:**
- [ ] Endpoint registrado em `server/routes/home.ts` (ou novo `focusStats.ts` se preferido pelo system-architect).
- [ ] Sem marcacoes -> retorna `items: [], meta.limitReached: false`.
- [ ] Com 1, 2 ou 3 marcacoes -> retorna na ordem de `created_at ASC`.
- [ ] `currentValue` reflete snapshot mais recente do mes que contem a stat.
- [ ] `previousValue` reflete snapshot mais recente do mes anterior.
- [ ] `delta` e `deltaDirection` calculados corretamente para cada `stat.direction`.
- [ ] `studyMinutesMonth` retorna soma correta (Opcao C aplicada).
- [ ] Stat removida do catalog -> `stat: null`, item ainda renderiza com aviso.
- [ ] Cache 30s funciona; mutation no `/api/focus-stats` invalida.
- [ ] Tempo de resposta p95 < 250ms (medido em log estruturado igual ao `home.ts`).

---

### RF-03 — `POST /api/focus-stats`

**Descricao:** Cria uma marcacao de stat foco para o mes corrente.

**Endpoint:** `POST /api/focus-stats`
**Auth:** `requireAuth`.
**Body (JSON, validado por Zod):**
```json
{ "statId": "cbet_flop_ip", "studyThemeId": "th_xxxxxxxxxxxxxxxxxxxxx" }
```

**Regras de negocio:**
1. Computa `month` = mes corrente UTC `YYYY-MM` (server-side; client NAO envia).
2. Valida `statId` esta em `HUD_STAT_CATALOG`. Caso contrario -> `400 INVALID_STAT_ID`.
3. Valida `studyThemeId` pertence ao user (`SELECT 1 FROM study_themes WHERE id=? AND user_id=?`). Caso contrario -> `404 THEME_NOT_FOUND`.
4. Conta marcacoes existentes do user no mes:
   - Se ja existem 3: -> `409 LIMIT_REACHED` (mensagem: "Voce ja tem 3 stats foco neste mes. Remova uma antes de adicionar outra.").
   - Se ja existe `(user, statId, month)`: -> `409 STAT_ALREADY_FOCUSED` (UNIQUE constraint catch).
5. Insert via `storage.createUserFocusStat(...)`.
6. Invalida cache do `GET /api/home/focus-stats` para esse user.

**Response 201:**
```json
{
  "id": "ufs_xxxxxxxxxxxxxxxxxxxxx",
  "userId": "USER-0001",
  "statId": "cbet_flop_ip",
  "studyThemeId": "th_xxxxxxxxxxxxxxxxxxxxx",
  "month": "2026-05",
  "createdAt": "2026-05-21T03:00:00.000Z",
  "updatedAt": "2026-05-21T03:00:00.000Z"
}
```

**Errors:**
- `400 INVALID_BODY` — Zod parse fail.
- `400 INVALID_STAT_ID`.
- `404 THEME_NOT_FOUND`.
- `409 LIMIT_REACHED`.
- `409 STAT_ALREADY_FOCUSED`.
- `401 / 500` padroes.

**Criterio de aceitacao:**
- [ ] Insert ok com 0/1/2 marcacoes existentes -> 201.
- [ ] 4a tentativa -> 409 LIMIT_REACHED.
- [ ] Mesma stat 2x no mesmo mes -> 409 STAT_ALREADY_FOCUSED.
- [ ] Stat invalida -> 400.
- [ ] Tema de outro user -> 404 (nao 403, para nao vazar existencia).
- [ ] Race condition: 2 inserts concorrentes da 4a marcacao — apenas 1 sobrevive (validar via teste com `Promise.all`).

---

### RF-04 — `DELETE /api/focus-stats/:id`

**Descricao:** Remove uma marcacao especifica.

**Endpoint:** `DELETE /api/focus-stats/:id`
**Auth:** `requireAuth`.

**Regras de negocio:**
1. Valida ownership: `SELECT 1 FROM user_focus_stats WHERE id=? AND user_id=?`. Se nao encontrar -> `404 NOT_FOUND`.
2. Delete.
3. Invalida cache do `GET /api/home/focus-stats`.

**Response 200:** `{ "ok": true }`.
**Errors:** `401`, `404`, `500`.

**Criterio de aceitacao:**
- [ ] Delete ok -> 200.
- [ ] ID inexistente -> 404.
- [ ] ID de outro user -> 404 (nao 403).
- [ ] Permite re-marcar a mesma stat no mesmo mes apos delete (UNIQUE so se aplica em rows existentes).

---

### RF-05 — UI em `StatsAnalyzerTab` (`/estudos/stats`)

**Descricao:** Adicionar capacidade de marcar/desmarcar stats foco diretamente na visualizacao "Hand2Note view" (`HudGroupedView`) e na "list view" (`StatsSnapshotList`).

**Componentes afetados:**
- `client/src/components/studies/stats/HudGroupedView.tsx` — adiciona botao/badge "Foco" em cada stat row.
- `client/src/components/studies/StatsSnapshotList.tsx` — mesma adicao para list view.
- Novo `client/src/components/studies/stats/FocusStatToggle.tsx` — encapsula botao + dialog de selecao de tema.
- Novo `client/src/components/studies/stats/FocusStatThemePickerDialog.tsx` — dialog shadcn que lista temas do user e solicita selecao.

**Comportamento do `FocusStatToggle`:**
- Recebe `statId`, `statLabel` como props.
- Faz `useQuery(['/api/home/focus-stats'])` para descobrir marcacoes do mes corrente.
- Renderiza um botao com 3 estados visuais:
  1. **Nao marcada + slot disponivel** (`< 3` marcacoes): icone outline `<Star />` + tooltip "Marcar como foco do mes".
  2. **Nao marcada + slot lotado** (`3` marcacoes): icone outline disabled + tooltip "Voce ja tem 3 stats foco. Remova uma para adicionar.".
  3. **Marcada:** icone solid `<Star fill="currentColor" />` + cor accent + tooltip "Foco do mes - tema: {nome}". Click abre menu com "Trocar tema" e "Remover foco".
- Click em (1) abre `FocusStatThemePickerDialog`.

**Comportamento do `FocusStatThemePickerDialog`:**
- Carrega temas via `useQuery(['/api/study-themes'])` (endpoint ja existe).
- Lista todos os temas com emoji + name + color, padrao igual ao `LinkSpotToThemeDropdown` (role=listbox + role=option, acessibilidade).
- CTA "Confirmar" -> `useMutation(POST /api/focus-stats)`.
- Empty state: "Voce ainda nao tem temas. [Criar tema] (-> /estudos/temas/novo)".
- Error states: 409 LIMIT_REACHED -> toast "Limite atingido", refetch query e atualiza UI; 404 THEME_NOT_FOUND -> toast erro generico.
- On success: toast "Stat marcada como foco do mes", invalidate `['/api/home/focus-stats']`.

**Posicionamento na UI:**
- Em `HudGroupedView`: botao a direita do label da stat, mesma linha. Se a stat ja tem marcacao, badge "Foco" (cor accent) abaixo do label.
- Em `StatsSnapshotList`: botao na coluna de actions de cada row.

**Criterio de aceitacao:**
- [ ] Botao aparece em cada stat row em ambas as views.
- [ ] Click abre dialog de selecao de tema com lista correta.
- [ ] Submit cria marcacao, fecha dialog, mostra toast, atualiza UI sem refresh.
- [ ] Botao em stat ja marcada mostra estado solid + tooltip com nome do tema.
- [ ] Quando 3 marcacoes ja existem, botoes das demais stats ficam disabled com tooltip explicativo.
- [ ] "Trocar tema" abre dialog re-populado com tema atual selecionado; submit faz DELETE + POST sequencial (ou PATCH — system-architect decide; PATCH simplifica mas POST+DELETE eh aceitavel).
- [ ] "Remover foco" chama DELETE, mostra toast, libera o slot.
- [ ] data-testids estaveis: `focus-stat-toggle-{statId}`, `focus-stat-dialog`, `focus-stat-theme-option-{themeId}`, `focus-stat-confirm`, `focus-stat-remove-{statId}`.
- [ ] Lesson #1 hooks first; Lesson #11 sem actions decorativas (botao so aparece quando layout/snapshot existe).
- [ ] Lesson #13 mutations usam `apiRequest` e ja recebem JSON (nao chamar `.json()`).

---

### RF-06 — Componente `FocusStatsCard` no Home

**Descricao:** Card novo na Home que renderiza as 3 stats foco com tema linkado.

**Arquivo:** `client/src/components/home/FocusStatsCard.tsx`.
**Imports em:** `client/src/pages/Home.tsx`.

**Comportamento:**
- `useQuery(['/api/home/focus-stats'])` — request proprio, NAO consumir do `data` do `/api/home/overview`. Fica desacoplado e cache independente.
- Loading state: skeleton de 3 rows.
- Empty state (`items.length === 0`): mensagem "Defina suas 3 stats foco do mes" + botao CTA "Ir para Stats Analyzer" (-> `/estudos/stats`).
- Estado parcial (`items.length` entre 1 e 2): renderiza items existentes + um "slot vazio" CTA "Adicionar stat" (-> `/estudos/stats`) por slot faltante. Visualmente menor (opacity 50%).
- Estado completo (`items.length === 3`): renderiza 3 cards, sem slot extra.

**Layout vertical de cada item (3 sub-blocos):**

```
┌─────────────────────────────────────────────────┐
│ [statLabel]                          [Foco·1]   │ <- header
│ 62.4%   ▲ +4.3%       (vs 58.1% mes anterior)   │ <- value/delta line
│ ─────────────────────────────────────────────── │
│ ♣ C-Bet em Heads-Up      78min este mes         │ <- theme line
│                              [Estudar agora →]  │ <- cta
└─────────────────────────────────────────────────┘
```

Notas visuais:
- Numero em fonte grande (`text-2xl font-bold`), delta em verde (`improving`), vermelho (`degrading`), cinza (`neutral`).
- Quando `delta == null` (sem dado anterior): mostra "—" + tooltip "Sem snapshot no mes anterior".
- Quando `currentValue == null`: mostra "Sem dado este mes" + CTA pequena "Registrar snapshot agora" -> `/estudos/stats`.
- Quando `studyMinutesMonth == 0`: mostra "0min - comece agora" em italico cinza.
- Quando `stat == null` (catalog removeu): mostra warning amarelo + botao "Remover marcacao" (chama DELETE).
- Botao "Estudar agora" usa `<Link href={`/estudos/temas/${theme.id}`}>` (Wouter).

**Posicionamento na Home:**

Decisao recomendada (a ser confirmada com founder no sign-off):

> **Inserir no fim da Zona "Acao Imediata"** (apos `GradeTodayCard`/`HeuristicsCard`), porque o card eh acionavel ("estudar agora") e nao apenas informativo. Alternativa: criar **nova zona "Estudos"** entre Performance e Sinal Externo. A nova zona faz sentido conforme features adjacentes (LibraryResume ja vive em Acao Imediata; podemos juntar tudo de "estudo" numa zona dedicada). **Recomendacao final: criar zona "Estudos"** com `<FocusStatsCard />` e (no futuro) mover `<LibraryResume />` para la.

System-architect decide layout final + diagrama. MVP pode entregar ambos os cards na zona "Acao Imediata" se simplificar.

**Telemetria (RNF-09):**
- Emit `home_focus_stats_view` quando data carrega (1x por mount, igual ao pattern `home_view`).
- Emit `focus_stats_cta_studynow_click` quando botao "Estudar agora" clicado (com `themeId`, `statId`).
- Emit `focus_stats_cta_define_click` quando empty state CTA clicado.

**Criterio de aceitacao:**
- [ ] Componente renderiza 0/1/2/3 items corretamente.
- [ ] Empty state e CTA funcionam.
- [ ] Slots vazios em estado parcial.
- [ ] Cores do delta corretas conforme `deltaDirection`.
- [ ] Botao "Estudar agora" navega via Wouter sem reload.
- [ ] Stat removida do catalog -> warning + botao remover.
- [ ] data-testids: `focus-stats-card`, `focus-stat-item-{statId}`, `focus-stat-cta-studynow-{themeId}`, `focus-stat-cta-define`, `focus-stat-empty`, `focus-stat-slot-empty-{idx}`.
- [ ] Lessons aplicadas (#1 hooks first, #11 sem default actions, #13 apiRequest JSON).
- [ ] Skeleton durante loading.
- [ ] Erro de fetch: card mostra mensagem fallback "Falha ao carregar stats foco. [Tentar novamente]".

---

### RF-07 — Storage layer (Drizzle queries em `server/storage.ts`)

**Descricao:** Adicionar metodos de acesso a dados.

**Metodos novos:**

```ts
// Pseudocodigo — system-architect refina
storage.getUserFocusStats(userId: string, month: string): Promise<UserFocusStat[]>
storage.createUserFocusStat(input: InsertUserFocusStat): Promise<UserFocusStat>
storage.deleteUserFocusStat(id: string, userId: string): Promise<boolean>
storage.countUserFocusStats(userId: string, month: string): Promise<number>
storage.getStudyMinutesByThemeMonth(userId: string, themeId: string, monthStart: Date, monthEnd: Date): Promise<number>
storage.getLatestSnapshotValueForStat(userId: string, statId: string, monthStart: Date, monthEnd: Date): Promise<{ value: number | null; sampleSize: number | null; capturedAt: Date | null } | null>
```

**Criterio de aceitacao:**
- [ ] Cada metodo tem unit test cobrindo: caso feliz, caso vazio, caso de erro.
- [ ] `getLatestSnapshotValueForStat` itera todos os layouts do user (nao filtra por layoutId) e pega `MAX(captured_at)` que tenha `values[statId] != null`.
- [ ] `getStudyMinutesByThemeMonth` aplica Opcao C (filtro `theme_id` em `study_sessions`) — depende de RF-08.

---

### RF-08 — Migracao adicional em `study_sessions` (Opcao C)

**Descricao:** Adicionar coluna `theme_id` em `study_sessions` para suportar agregacao por tema (ver decisao em RF-02 §8).

**Migration:** `0043_study_sessions_theme_id.sql`

```sql
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS theme_id varchar
    REFERENCES study_themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_theme_date
  ON study_sessions (user_id, theme_id, date);
```

**Schema Drizzle:** atualizar `studySessions` em `shared/schema.ts` adicionando `themeId: varchar("theme_id").references(() => studyThemes.id, { onDelete: "set null" })`.

**Back-fill:** **NAO ha back-fill** — sessoes antigas ficam com `theme_id NULL`. Card `FocusStatsCard` consequentemente mostra `0min` para temas que ainda nao tem sessoes nesse formato.

**Impacto em UI existente:**
- Endpoints/UIs que criam `study_sessions` (StudySessionTimer, etc) devem aceitar `themeId` opcional. Inicialmente passar `null` mantem comportamento. **Apenas o fluxo de "iniciar estudo a partir do FocusStatsCard" garantira `themeId` setado** (passa themeId via query param ou state ao navegar para `/estudos/temas/:id`, e a tela ja loga sessao com esse themeId quando timer for parado).
- **Decisao opcional para MVP:** se mexer em `StudySessionTimer.tsx` for muito grande, pode-se entregar Item 7 com `studyMinutesMonth = 0` sempre, e abrir issue de follow-up "wire StudySessionTimer ao themeId". Founder decide trade-off.

**Criterio de aceitacao:**
- [ ] Migration aplica idempotente.
- [ ] Schema Drizzle exporta `themeId` opcional.
- [ ] FK ON DELETE SET NULL funciona (deletar tema nao apaga sessao, so zera theme_id).
- [ ] Indice criado.

---

### RF-09 — Empty states e edge cases consolidados

| Cenario | Onde | Mensagem | CTA |
|---|---|---|---|
| User nunca marcou foco | `FocusStatsCard` Home | "Defina suas 3 stats foco do mes" | "Ir para Stats Analyzer" -> `/estudos/stats` |
| User marcou 1 ou 2 | `FocusStatsCard` Home | (renderiza items + slots vazios) | "Adicionar stat" por slot |
| Stat marcada mas sem snapshot no mes corrente | item do card | "Sem dado este mes" no lugar do valor | "Registrar snapshot" -> `/estudos/stats` |
| Stat marcada mas sem snapshot no mes anterior | item do card | "—" no delta + tooltip explicativo | nenhum |
| Tema linkado sem nenhuma study_session no mes | item do card | "0min - comece agora" italic | "Estudar agora" continua funcionando |
| User nao tem nenhum tema | dialog de selecao em `/estudos/stats` | "Voce ainda nao tem temas" | "Criar tema" -> `/estudos/temas/novo` |
| User tenta marcar 4a stat | dialog de selecao | botoes disabled + msg "Limite 3" | nenhum |
| Stat marcada mas removida do catalog | item do card | warning amarelo "Stat removida do catalogo" | "Remover marcacao" -> DELETE |
| Falha 5xx no GET | `FocusStatsCard` | "Falha ao carregar stats foco" | "Tentar novamente" |

**Criterio de aceitacao:**
- [ ] Todos os 9 cenarios cobertos por testes RTL ou integration.
- [ ] Strings em PT-BR.

---

## Requisitos Nao-Funcionais

- **Performance:** `GET /api/home/focus-stats` p95 < 250ms. Cache TTL 30s in-memory por user.
- **Seguranca:** todos endpoints requerem JWT. Ownership validada por user_id em queries (NUNCA confiar no client).
- **Acessibilidade:** botoes com aria-label, dialog com role=dialog + focus trap (Radix Dialog ja entrega).
- **i18n:** strings em PT-BR (codigo em ingles).
- **Compatibilidade DB:** PostgreSQL 16 / Neon Serverless.
- **Telemetria:** eventos `home_focus_stats_view`, `focus_stats_cta_studynow_click`, `focus_stats_cta_define_click`, `focus_stat_marked` (`statId`, `themeId`), `focus_stat_unmarked` (`statId`).
- **Resiliencia:** Falha do `GET /api/home/focus-stats` NAO derruba a Home (card mostra fallback).

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/home/focus-stats?month=YYYY-MM | Lista 3 stats foco do mes com valores e tema | JWT |
| POST | /api/focus-stats | Cria nova marcacao no mes corrente | JWT |
| DELETE | /api/focus-stats/:id | Remove marcacao | JWT |

---

## Modelos de Dados Afetados

### `user_focus_stats` (NOVO)
Schema completo em RF-01.

### `study_sessions` (ALTERADO via migration 0043)
Adiciona coluna `theme_id varchar NULL REFERENCES study_themes(id) ON DELETE SET NULL`. Ver RF-08.

### `study_themes` (NAO ALTERADO)
Apenas referencia FK.

### `hud_stat_snapshots` (NAO ALTERADO)
Apenas leitura — usado para extrair `currentValue`/`previousValue`.

---

## Integracoes Externas

Nenhuma. Toda logica eh interna (DB + catalog estatico em codigo).

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] User marca 3 stats com 3 temas, abre Home, ve 3 cards com valores e tempo de estudo.

### Validacao de Input
- [ ] POST sem `statId` -> 400.
- [ ] POST com `statId` invalido -> 400.
- [ ] POST com `studyThemeId` invalido -> 404.
- [ ] GET com `month=invalid` -> 400.

### Regras de Negocio
- [ ] POST 4a marcacao -> 409 LIMIT_REACHED.
- [ ] POST mesma stat 2x mes -> 409 STAT_ALREADY_FOCUSED.
- [ ] DELETE -> permite remarcar mesma stat.
- [ ] Mes futuro -> 400.
- [ ] Tema de outro user -> 404.
- [ ] Mudanca de mes (UTC midnight): nova request retorna empty se nao remarcou.

### Edge Cases
- [ ] Stat removida do catalog -> item renderiza com warning + DELETE funciona.
- [ ] Tema deletado entre marcacao e leitura -> row some via cascade (validar com teste de integration).
- [ ] User sem nenhum snapshot -> 3 items com `currentValue: null`.
- [ ] User sem snapshot do mes anterior -> `delta: null` + UI mostra "—".
- [ ] User sem nenhuma `study_session` -> `studyMinutesMonth: 0` + UI mostra "0min".
- [ ] Race condition: 2 POSTs concorrentes de 4a marcacao -> apenas 1 cria, outro 409.
- [ ] Race condition: 2 POSTs identicos `(stat, month)` -> UNIQUE catch -> 409 STAT_ALREADY_FOCUSED.
- [ ] Cache: mutation invalida cache; novo GET retorna data fresca.
- [ ] Card no Home com fetch falhando -> fallback render + botao retry.
- [ ] User com 0 temas tenta marcar -> dialog mostra empty + CTA "Criar tema".

### Regressao
- [ ] `/api/home/overview` continua funcionando (NAO mexido).
- [ ] `StatsAnalyzerTab` continua funcionando para users sem foco marcado.
- [ ] Snapshots existentes continuam aparecendo normais.

---

## Fora de Escopo

- Tela de "historico de stats foco de meses anteriores".
- Auto-sugestao de stat foco baseada em leak detection.
- Stats foco de equipe / coach assignment.
- Notificacoes push quando user esta abaixo do target em stat foco.
- Dashboard analitico de evolucao de stats foco ao longo de meses.
- Internacionalizacao (so PT-BR no MVP).
- Tela mobile-first dedicada (responsividade basica via Tailwind, mas otimizacoes especificas ficam para depois).
- Modal de estudo dedicado (continuamos navegando para `/estudos/temas/:id`).
- Webhook/integracao Coach AI usando focus stats (futuro).

---

## Dependencias

**Pre-requisitos no codigo:**
- `shared/hud-stat-catalog.ts` (existe).
- `study_themes` table (existe).
- `study_sessions` table (existe; precisa migration 0043 para Opcao C).
- `hud_stat_snapshots` table (existe).
- `apiRequest` helper (existe).
- TanStack Query setup (existe).
- Wouter routing (existe).
- shadcn Dialog (existe).
- Radix Tooltip (existe).
- nanoid (existe).
- `set_updated_at()` plpgsql function (existe desde migration 0036).

**Sprints/specs precedentes que entregaram base:**
- Stats-V2 / V3 / V3.5 — catalog HUD + snapshots.
- Studies-Reform — `/estudos/*` shell + `study_themes` table + `ThemesView`.
- home-reform-1/2/3/4 itens 1,2,5,6,8,9,10 — pattern de cards na Home + `/api/home/overview`.

---

## Riscos / Decisoes Pendentes

| Risco / Decisao | Impacto | Mitigacao / Quem decide |
|---|---|---|
| **Como derivar `studyMinutesMonth`?** Opcao A (heuristica), B (back-fill), C (nova coluna `study_sessions.theme_id` sem back-fill). | Define quao preciso eh o tempo. Opcao C eh limpa mas exige tocar em StudySessionTimer. | **System-architect + founder.** Recomendacao: Opcao C. Fallback: Opcao A com badge "estimado". |
| **Nova zona "Estudos" no Home?** Ou inserir em "Acao Imediata"? | Define IA da Home (continua a evoluir desde home-reform-1). | **System-architect** decide; founder valida via screenshot. |
| **"Valor atual" da stat = ultimo snapshot do mes?** Ou media do mes? | Trade-off precisao vs intuitividade. Spec adota "ultimo snapshot" (consistente com Stats Analyzer). | Decidido: ultimo snapshot. Pode-se adicionar toggle no futuro. |
| **POST+DELETE vs PATCH para "trocar tema"?** | Codigo simpler com PATCH; conceito mais simples com POST+DELETE. | **System-architect** decide. Spec aceita ambos. |
| **Catalog HUD muda com tempo (stats podem ser deprecadas).** | Marcacoes podem ficar orfas. | Spec ja cobre: item renderiza warning + DELETE manual. NAO fazemos auto-cleanup. |
| **User muda timezone — `month` pode mudar de dia?** | Border case raro. | Sempre usar UTC para `month`. Documentado. |
| **`hud_stat_snapshots` pode ter milhares de rows por user.** | Query "ultimo snapshot do mes que contem statId" pode ser lenta sem indice. | Indice `(user_id, captured_at DESC)` ja existe. Validar EXPLAIN p95 < 50ms. Se lento, considerar materialized view. |
| **Sub-spec aprovacao founder pendente** antes de seguir para system-architect. | Pipeline TDD bloqueado. | Esta spec (sign-off requerido). |

---

## Estimativa em Pipeline TDD (red/green/review por RF)

| Fase | RF | Esforco TDD | Notas |
|---|---|---|---|
| **system-architect** | todos | 1 sessao | 2 ADRs (116 + 117) + diagrama de sequencia + diagrama de dados. |
| **test-writer** RF-01 schema | RF-01 | 30min | Tests em `tests/storage/userFocusStats.test.ts` + Drizzle schema test. |
| **test-writer** RF-02 GET endpoint | RF-02 | 1h | Coverage de happy path + 9 edge cases. Mock storage. |
| **test-writer** RF-03 POST | RF-03 | 45min | Inclusive race condition. |
| **test-writer** RF-04 DELETE | RF-04 | 20min | |
| **test-writer** RF-05 UI dialog | RF-05 | 1h | RTL com mock apiRequest. |
| **test-writer** RF-06 FocusStatsCard | RF-06 | 1h | RTL com 9 cenarios + lesson #14 (await import em tsx). |
| **test-writer** RF-07 storage | RF-07 | 30min | Unit tests por metodo. |
| **test-writer** RF-08 migration | RF-08 | 15min | Smoke test schema + drizzle inferSelect. |
| **test-writer** RF-09 e2e | RF-09 | 30min | Smoke test full flow (mark + render). |
| **implementer** | todos | 1.5 sessoes | Schema + migration + storage + endpoints + 2 dialogs + card Home + wiring. |
| **simplify** | todos | 30min | Verificar reuso (LinkSpotToThemeDropdown pode virar generico). |
| **reviewer** R1 | todos | 1h | Bugs/seguranca/perf. Esperado 1-2 NITs. |
| **all-issues-fixed** | todos | 30min | Resolver NITs. |
| **reviewer** R2 | todos | 30min | Sign-off. |

**Total estimado:** 7-9 horas de pipeline (com auto mode), distribuido em 1-2 sessoes founder.

---

## ADRs sugeridos

- **ADR-116** — `user_focus_stats` schema + escopo mensal + UNIQUE constraint estrategia.
- **ADR-117** — Decisao Opcao C (`study_sessions.theme_id` nullable) para derivar tempo de estudo por tema.

(Faixa 116-120 reservada para Item 7 conforme escopo. Item 4 da spec mae reservou 111-115.)

---

## Notas de Implementacao (sugestoes nao-bloqueantes para Implementer)

- Reusar pattern de `study_theme_spot_links` (migration 0034) como template para `0042_user_focus_stats.sql`.
- Reusar `LinkSpotToThemeDropdown` extraindo para componente generico `<ThemePickerListbox />` em `client/src/components/studies/workflow/`.
- Em `home.ts`, NAO inflar `/api/home/overview` com focus-stats. Endpoint dedicado mantem responsabilidades separadas e cache invalidation simples.
- Lesson #17 (variavel `profile`): NAO declarar `const profile` em `home.ts`. Usar `playerProfile` ou outro nome se precisar tocar em `home.ts`.
- Lesson #14 (`vi.mock` hoisting): ao mockar `apiRequest`, usar `vi.hoisted` pattern.
- Lesson #15 (`vi.unmock`): nunca usar dentro de `it()`.
- Lesson #18: nao usar `git stash` durante TDD desta sub-spec.
- Telemetria: ja existe `emit()` em `@/lib/tracker`. Padrao: nome em snake_case, payload com IDs.

---

## Aprovacao

- [ ] Founder revisou esta spec.
- [ ] Founder aprovou Opcao C para tempo de estudo por tema (ou escolheu fallback A/B).
- [ ] Founder confirmou posicionamento (zona "Estudos" nova ou Acao Imediata).
- [ ] Founder autorizou avancar para system-architect.

> **Apos aprovacao:** invocar `system-architect` com escopo deste arquivo. Sistema arquiteto produz ADRs 116 + 117 + diagramas, depois invoca `test-writer`.
