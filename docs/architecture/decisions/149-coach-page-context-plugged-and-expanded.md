# ADR-149: Page context plugado de fato no `/api/coach/chat` + expandido a 10 rotas (5 novas: bankroll, estudos, stats, biblioteca, upload)

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-0B (`Docs/specs/sprint-ai-0b.md`, RF-04, RF-05)

## Decision owner
system-architect

## Related
- Estende: ADR-025 (page context Zod discriminated union — whitelist por route), ADR-043 (variante cooldown-log).
- Preserva: ADR-019 (page context entra no bloco DYNAMIC — não afeta cache do STATIC).
- Depende de: ADR-148 (consolidação — o `coachType` `'coach-ai'` page-context variant referencia a "lente").
- Diagramas: `Docs/architecture/diagrams/coach-ai-0b/page-context-flow.mermaid`.

---

## 1. Contexto

O page context do Coach é a "inspeção leve da tela" — qual rota o usuário está, qual filtro/aba ativa, IDs de contexto — injetada no bloco DYNAMIC do system prompt para o agente saber "onde o usuário está e o que está olhando". Foi desenhado no Sprint Coach-2A (ADR-025) com:
- `server/coachPageContext.ts`: schema Zod (`pageContextSchema` — discriminated union por `route`, 5 variantes: `grade-planner`, `grind-live`, `dashboard`, `coach-ai`, `cooldown-log`), `sanitizePageContext`, `scrubInjectionTokens`, `buildPageContextSection` (formatter com `switch` exhaustivo).
- `coachSystemBuilder.buildDynamicSystemBlock` chama `buildPageContextSection(inputs.pageContext)` se `inputs.pageContext` existir.

**O problema: a infra existe mas o circuito nunca foi fechado.** O `assembleContext` (`coachContext.ts`) só recebe `pageContext` via um loader opcional `getPageContext(userId, sessionId)` que o route handler de `/api/coach/chat` (`handleCoachChat`) **nunca fornece**, e o frontend (`useCoachChat.ts`) **nunca manda `pageContext` no body**. Resultado: o page context **não funciona hoje na prática** — `Docs/api/coach.md` e ADR-025 descrevem como se funcionasse.

Além disso, só 4 rotas "úteis" estão no schema (`grade-planner`, `grind-live`, `dashboard`, `coach-ai` — `cooldown-log` é específica do cool-down). O agente único (ADR-148) "vê tudo" no contexto carregado, mas se o usuário abre o chat em `/bankroll` / `/estudos` / `/stats` / `/biblioteca` / `/upload`, o agente não sabe — não há variante de page context para essas rotas.

A **pergunta central:** como o frontend envia o page context, como o backend o lê de fato, e como adicionar as 5 rotas novas sem estourar o bloco dinâmico nem abrir vetor de injection.

### Restrições
- **Vetor de prompt injection (ADR-025, OWASP LLM01).** O page context vai direto pro system prompt. O frontend é código nosso mas pode ser comprometido (XSS, extension hostil) e qualquer um pode hitar `/api/coach/chat` via curl. Mitigação obrigatória: schema strict por route + max-length em strings + enums fechados + ranges plausíveis + scrubbing de tokens de injection (já em `sanitizePageContext`).
- **Não estourar o bloco dinâmico.** O page context é **inspeção leve**, não dump de dados. Counts, IDs, abas, filtros, datas — nunca valores monetários, notas de texto livre, conteúdo de lesson.
- **Os números vêm das tools.** O agente, ao ver "usuário está em /bankroll com a wallet X", **chama** `read_user_bankroll_history` / `simulate_bankroll_scenario` (já religadas no AI-0A) para o detalhe — o page context só dá a dica.
- **Aditivo.** Body sem `pageContext` se comporta exatamente como hoje (page context é opcional). Não regredir.
- **Type-safe.** O `switch` exhaustivo de `buildPageContextSection` força implementar o formatter de cada variante nova (`tsc` reclama).
- **Cache.** Page context entra no bloco DYNAMIC (ADR-019) — não toca o cache key do STATIC.

---

## 2. Decisão

### 2.1 Plugar o circuito — backend

**`server/routes/coach.ts` `handleCoachChat`:**
1. Ler `req.body.pageContext` (campo opcional, novo).
2. Se presente: validar via `sanitizePageContext(req.body.pageContext)` (de `coachPageContext.ts` — já faz scrub + `safeParse`). Se retorna `null` (rota desconhecida, campo extra via `.strict()`, tipo errado, string acima do max-length) → `400 { error: 'validation_failed', field: 'pageContext' }` (conforme ADR-025 e `Docs/api/coach.md`). Se ausente (`undefined`) → segue sem page context (não erro).
3. Passar o page context sanitizado para `assembleContext` via o loader `getPageContext: async () => sanitizedPageContext` (a assinatura do loader é `(userId, sessionId) => Promise<any>`; aqui ele ignora os args e retorna o valor já sanitizado). `assembleContext` repassa para `buildSystemArray` → `buildDynamicSystemBlock` recebe `inputs.pageContext` → `buildPageContextSection` formata.
4. O scrubbing de injection já está embutido em `sanitizePageContext` — nada a fazer no route além de chamar a função.

**Nota de implementação:** não mandar `pageContext: undefined` explícito de lugar nenhum (alguns validadores reclamam) — só incluir a chave quando há valor, ou garantir que o handler trate `undefined` como ausente (já trata: `if (req.body.pageContext !== undefined)`).

### 2.2 Plugar o circuito — frontend

**Hook leve `client/src/hooks/useCoachPageContext.ts` (NOVO):**
- Lê o estado da página (rota atual via Wouter `useLocation`/`useRoute`, query params, props passadas pelo caller) e monta o objeto `{ route, ...fields }` conforme o schema da rota — ou retorna `undefined` se a rota não é instrumentada.
- Cada página instrumentada chama `useCoachPageContext('bankroll', { walletsCount, selectedWalletId, activeTab, dateRange })` (ou equivalente) e passa o resultado adiante.
- O `MiniChat.tsx` (montado em várias páginas) lê a rota atual via `useLocation` e monta o page context da rota onde está — mas **só** para rotas no schema; rota não-instrumentada → não manda `pageContext`.

**`client/src/hooks/useCoachChat.ts`:**
- Aceitar um parâmetro opcional `pageContext` (ou um getter `getPageContext()`) no hook ou no `sendMessage`. Quando fornecido (não-`undefined`), incluí-lo no `body` do POST `/api/coach/chat`. Quando ausente, o body **não** tem a chave `pageContext` (não mandar `null`/`undefined` explícito).

**Padrão de extensão (adicionar uma rota nova):** (1) variante no `pageContextSchema`; (2) `case` no `buildPageContextSection`; (3) chamada do `useCoachPageContext` na página; (4) `tsc` passa. 4 passos, todos type-checked.

### 2.3 As 5 variantes novas do `pageContextSchema`

Todas `.strict()` (rejeitam campos extras — anti-injection); todos os campos opcionais (uma página pode mandar só `{ route: 'X' }`); max-length em strings; enums fechados; ranges plausíveis. **Os enums de `activeTab`/`view`/`selectedStatGroup` devem ser alinhados aos nomes reais no frontend** — o implementer verifica os tabs reais de `WalletActivityPanel` / página Estudos / página Stats / `BibliotecaPanel` e os nomes de grupos do catálogo Stats-V2; os valores abaixo são a primeira aproximação da spec.

```ts
// /bankroll
const bankrollSchema = z.object({
  route: z.literal('bankroll'),
  walletsCount: z.number().int().min(0).max(50).optional(),
  selectedWalletId: z.string().max(50).optional(),
  activeTab: z.enum(['resultados', 'movimentacoes', 'wallets', 'snapshots', 'relatorios']).optional(),
  dateRange: z.enum(['7d', '30d', '60d', '90d', 'all']).optional(),
}).strict();

// /estudos
const estudosSchema = z.object({
  route: z.literal('estudos'),
  activeTab: z.enum(['habito', 'temas', 'spots', 'sessoes']).optional(), // alinhar aos tabs reais
  activeThemesCount: z.number().int().min(0).max(100).optional(),
  spotsDueCount: z.number().int().min(0).max(500).optional(),
  studyStreakDays: z.number().int().min(0).max(3650).optional(),
  focusedThemeId: z.string().max(50).optional(),
}).strict();

// /stats
const statsSchema = z.object({
  route: z.literal('stats'),
  hasSnapshot: z.boolean().optional(),
  latestSnapshotId: z.string().max(50).optional(),
  latestSnapshotStatsCount: z.number().int().min(0).max(500).optional(),
  compareMode: z.boolean().optional(),
  selectedStatGroup: z.string().max(50).optional(), // alinhar ao catálogo Stats-V2
}).strict();

// /biblioteca
const bibliotecaSchema = z.object({
  route: z.literal('biblioteca'),
  view: z.enum(['catalogo', 'curso', 'lesson']).optional(),
  courseSlug: z.string().max(100).optional(),
  lessonSlug: z.string().max(100).optional(),
  filterSites: z.array(z.string().max(50)).max(20).optional(),
  filterDaysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).strict();

// /upload
const uploadSchema = z.object({
  route: z.literal('upload'),
  lastImportAt: z.union([z.string().max(40), z.null()]).optional(), // ISO date string curta, ou null
  lastImportNetwork: z.string().max(50).optional(),
  lastImportTournamentsCount: z.number().int().min(0).max(100000).optional(),
  daysSinceLastImport: z.number().int().min(0).max(3650).optional(),
  pendingFile: z.boolean().optional(),
}).strict();

export const pageContextSchema = z.discriminatedUnion('route', [
  gradePlannerSchema, grindLiveSchema, dashboardSchema, coachAiSchema, cooldownLogSchema, // 5 originais
  bankrollSchema, estudosSchema, statsSchema, bibliotecaSchema, uploadSchema,             // 5 novas
]);
// total: 10 variantes.
```

**Fonte de cada campo (frontend) + dado real (server, via tools):**

| Rota | Campos (inspeção) | Fonte no frontend | Onde o agente busca o detalhe |
|---|---|---|---|
| `bankroll` | `walletsCount`, `selectedWalletId`, `activeTab`, `dateRange` | estado do `WalletActivityPanel` / página Bankroll | `read_user_bankroll_history`, `simulate_bankroll_scenario`; ou o stats snapshot já no STATIC. **NÃO** colocar saldo consolidado no page context (vetor: número via canal que o cliente comprometido controla; o agente já tem as tools). |
| `estudos` | `activeTab`, `activeThemesCount`, `spotsDueCount`, `studyStreakDays`, `focusedThemeId` | estado da página Estudos | `studyProgress` já no contexto dinâmico (ADR-148), `read_theme_with_linked_stats_and_spots` |
| `stats` | `hasSnapshot`, `latestSnapshotId`, `latestSnapshotStatsCount`, `compareMode`, `selectedStatGroup` | estado da página Stats / 3-way compare | stats snapshot resumido no STATIC, `read_user_hud_stats` (v2) |
| `biblioteca` | `view`, `courseSlug`, `lessonSlug`, `filterSites[]`, `filterDaysOfWeek[]` | rota interna da biblioteca + chips do `BibliotecaPanel` (reusa `filterSites[]` do coach-page-reform-1.5) | `recommend_lesson` |
| `upload` | `lastImportAt` (ou `null`), `lastImportNetwork`, `lastImportTournamentsCount`, `daysSinceLastImport`, `pendingFile` | estado da página Upload + `storage.getUploadHistory(userId)` (server) — `daysSinceLastImport` pré-computado no frontend ou derivado de `lastImportAt` | — (o agente comenta no chat se vir o contexto; a "cobrança de import" como nudge é Fase 1) |

### 2.4 `buildPageContextSection` — 5 `case`s novos

O `switch (ctx.route)` ganha 5 `case`s; continua exhaustivo (`tsc` força). Formato (cabeçalho fixo `## Contexto da pagina atual` + `Rota: <route>` + linhas dos campos presentes):

```
## Contexto da pagina atual
Rota: bankroll
Wallets: 3
Wallet em foco: WALLET-abc
Aba: movimentacoes
Período: 30d
```

```
## Contexto da pagina atual
Rota: estudos
Aba: spots
Temas ativos: 4
Spots due: 12
Streak: 4 dias
Tema em foco: THEME-xyz
```

```
## Contexto da pagina atual
Rota: stats
Snapshot: sim
Snapshot recente: SNAP-123 (217 stats)
Modo comparação: sim
Grupo: Preflop
```

```
## Contexto da pagina atual
Rota: biblioteca
View: lesson
Curso: antes-das-cartas
Lesson: o-que-e-icm
Filtros plataforma: GGPoker, PokerStars
Filtros dia: 1, 5
```

```
## Contexto da pagina atual
Rota: upload
Último import: WPN em 2026-05-03 (142 torneios)
Dias desde o último import: 8
Arquivo pendente: sim
```

Cada `case` só emite as linhas dos campos presentes (todos opcionais). Strings passam pelo scrub de injection (já em `sanitizePageContext`, antes do `safeParse`).

### 2.5 Princípios invioláveis

- **Page context é inspeção leve, não dump de dados.** Counts, IDs, abas, filtros, datas. **Nenhum** valor monetário (saldo consolidado, valores de transação), nota de texto livre, conteúdo de lesson, ou outro dado sensível.
- **Os números vêm das tools.** O agente vê "onde o usuário está"; para os números, chama as tools (ADR-145/146/147). Mantém o page context pequeno (não estoura token budget) e seguro (não expõe número via canal controlável pelo cliente).
- **Schema strict + scrub.** Toda variante `.strict()`; scrubbing de tokens de injection antes do `safeParse`; max-length, enums fechados, ranges plausíveis.
- **Aditivo.** Body sem `pageContext` = comportamento de hoje.
- **Lesson #19 (CTA targets):** este sprint **não** cria CTAs a partir do page context — só informa o agente. Se um sprint futuro fizer o agente sugerir "continue a lesson X", o link deve ser `/biblioteca/curso/${courseSlug}/${lessonSlug}/play?...` (rota Wouter real, não `/biblioteca/aulas/...`). Documentado como nota, não implementado.

### 2.6 Não-objetivo

Instrumentar **toda** rota do app. Só as 5 novas (`/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload`) + as 5 que já estavam no schema (`grade-planner`, `grind-live`, `dashboard`, `coach-ai`, `cooldown-log`). Outras rotas (`/grind`, `/calendar`, `/admin/*`, etc.) ficam para sprints futuros se houver demanda.

---

## 3. Alternativas consideradas

### A. Schema strict por route + plugar de fato + 5 variantes novas (ESCOLHIDA)

Estende o padrão ADR-025. Já argumentado em §2.

### B. Não plugar o frontend — gerar o page context no backend a partir do estado de sessão

O backend deriva "onde o usuário está" de `chat_sessions` / última atividade.

- **Prós:** zero mudança no frontend; sem vetor de injection (o cliente não controla o input).
- **Contras:** o backend **não sabe** em que rota o browser está — `chat_sessions` não guarda isso, e derivar de "última atividade" é frágil e atrasado. O ponto do page context é ser **a tela atual**, não "a última coisa que o usuário fez". **Descartada** — só o frontend sabe a rota atual; o vetor de injection é mitigado por schema strict + scrub (ADR-025 já decidiu isso).

### C. Schema genérico `{ route: string, params: Record<string, string|number> }`

- **Prós:** adicionar rota sem mudar o schema.
- **Contras:** sem whitelist real (rota arbitrária aceita); sem tipagem (`tsc` não força o formatter); bug silencioso (typo no nome do campo aceito, vira `undefined` no prompt); strings longas esticam o prompt. **Descartada** — ADR-025 já rejeitou isso por segurança + DX; mesmo argumento.

### D. Page context maior — incluir os números (saldos, ROI, counts de stats) direto

"Já que estamos mandando o contexto da tela, mandar os dados também."

- **Prós:** o agente não precisa chamar tools.
- **Contras:** (1) **vetor de injection grave** — estaríamos enviando números/dados via canal que um cliente comprometido controla, e o agente confiaria neles; (2) **estoura o token budget** do bloco dinâmico; (3) **redundante** — o agente já tem as tools (ADR-145/146/147) que buscam os dados do **backend** (fonte confiável). **Descartada** — page context = inspeção leve; dados = tools (fonte server).

---

## 4. Consequências

### 4.1 Positivas
- **O page context passa a funcionar de fato** — o agente sabe onde o usuário está e o que está olhando. Respostas mais contextuais sem o usuário precisar explicar.
- **5 rotas novas instrumentadas** — `/bankroll`, `/estudos`, `/stats`, `/biblioteca`, `/upload` — cobrindo as áreas que o agente único agora atende.
- **Padrão de extensão claro** (`useCoachPageContext` + variante no schema + `case` no formatter + chamada na página) — adicionar rota nova é trivial e type-checked.
- **Segurança preservada** — schema strict + scrub + max-length + enums fechados; nenhum dado sensível no page context.
- **Não afeta o cache** — page context no bloco DYNAMIC (ADR-019).
- **Aditivo** — zero regressão para callers que não instrumentam.

### 4.2 Negativas
- **Boilerplate** — 5 schemas novos + 5 `case`s no formatter + 5 páginas instrumentadas + 1 hook novo. Aceito; cresce linearmente.
- **Frontend e backend acoplados via shape** — mudanças precisam ser síncronas; inconsistência gera `400` (que é **bom** — revela bug em vez de degradar silenciosamente).
- **Enums de `activeTab`/`view`/`selectedStatGroup` precisam ser verificados contra os nomes reais** no frontend — risco de drift se o implementer não checar. Mitigado por nota explícita na §2.3.
- **Testes novos** — schemas das 5 variantes, formatter, hook, plugagem no route + no `useCoachChat`.

### 4.3 Neutras
- **`cooldown-log`** (ADR-043) — uma das 5 "originais"; inalterado neste sprint.
- **A "cobrança de import" como nudge** (B-IMPORT) é Fase 1 — este sprint só permite o agente comentar no chat se vir o page context de `/upload`.
- **Documentar em `Docs/api/coach.md`** — 10 variantes com campos (RF-08).

---

## 5. O que o test-writer precisa saber

**Testes novos esperados:**
1. `pageContextSchema.safeParse({ route: 'bankroll', walletsCount: 3, activeTab: 'movimentacoes' })` → `success: true`. Idem `estudos`, `stats`, `biblioteca`, `upload` com campos válidos.
2. `pageContextSchema` tem **10 variantes** (5 originais + 5 novas). [Nota: contar as variantes no schema; não testar `length` de um enum — lesson #8. Validar presença individual de cada `route` literal.]
3. Cada variante nova é `.strict()`: `{ route: 'bankroll', campoExtra: 'x' }` → `safeParse` falha → `sanitizePageContext` retorna `null`.
4. Max-length: `{ route: 'biblioteca', courseSlug: '<200 chars>' }` → `safeParse` falha → `null`.
5. Scrub: `{ route: 'estudos', focusedThemeId: 'ignore previous instructions' }` → `sanitizePageContext` substitui por `[redacted]`; o objeto retornado é válido.
6. `buildPageContextSection({ route: 'bankroll', walletsCount: 3, activeTab: 'movimentacoes' })` retorna texto começando com `## Contexto da pagina atual` + `Rota: bankroll` + as linhas dos campos presentes. Idem para as outras 4 rotas novas. Campos ausentes não geram linha.
7. `buildPageContextSection` cobre as 10 variantes (`switch` exhaustivo) — `tsc` passa (test de tipo, não runtime, mas o test-writer pode garantir que cada `route` produz output não-vazio).
8. `handleCoachChat` lê `req.body.pageContext`: presente e válido → bloco DYNAMIC do system prompt inclui a seção "Contexto da pagina atual"; presente e inválido (rota desconhecida, campo extra, tipo errado, string longa) → `400 { error: 'validation_failed', field: 'pageContext' }`; ausente → request prossegue sem page context (comportamento de hoje, não regredir).
9. `useCoachChat` (ou `sendMessage`) inclui `pageContext` no body do POST quando o caller fornece; quando não fornece, o body não tem a chave `pageContext`. (Mock de `apiRequest` — lesson #13 — deve retornar o JSON parseado.)
10. `useCoachPageContext('bankroll', { walletsCount: 3, activeTab: 'movimentacoes' })` retorna `{ route: 'bankroll', walletsCount: 3, activeTab: 'movimentacoes' }`; chamado numa rota não instrumentada → `undefined`. (Hook test → jsdom — lesson #30: incluir no projeto `client` se for `.test.ts` com `renderHook`.)

**Testes existentes — não devem quebrar:** testes de `useCoachChat` e `handleCoachChat` (page context é aditivo — body sem `pageContext` = comportamento de hoje); testes das 5 variantes originais do `pageContextSchema` (inalteradas); testes de `buildPageContextSection` para `grade-planner`/`grind-live`/`dashboard`/`coach-ai`/`cooldown-log` (inalterados).

**Lessons aplicáveis:** #13 (`apiRequest` retorna JSON), #19 (CTA targets — não criar CTA do page context neste sprint; se criar, rota Wouter real), #30 (hook test jsdom), #14/#26 (`await import` em vez de `require` em testes `.tsx`).

---

## 6. Confiança

**Alta.** É uma extensão do padrão já decidido (ADR-025) — schema strict por route, scrub, formatter exhaustivo. A plugagem (route handler lê `req.body.pageContext` + passa via `getPageContext` loader; frontend manda no body via `useCoachPageContext`) é mecânica e aditiva. O risco principal — enums de `activeTab`/`view` divergindo dos nomes reais — está sinalizado para o implementer verificar. O vetor de injection é mitigado pela defesa em camadas já estabelecida (schema strict + scrub + max-length + enums fechados + injeção no bloco dinâmico).

## Referências
- Spec: `Docs/specs/sprint-ai-0b.md` (RF-04, RF-05, RF-08)
- ADR-025 (page context Zod whitelist — estendido), ADR-043 (variante cooldown-log), ADR-019 (page context no bloco DYNAMIC), ADR-148 (consolidação — `coach-ai` variant referencia a lente), ADR-145/146/147 (tools — fonte do detalhe)
- `server/coachPageContext.ts`, `server/coachSystemBuilder.ts`, `server/coachContext.ts`, `server/routes/coach.ts`, `client/src/hooks/useCoachChat.ts`, `client/src/hooks/useCoachPageContext.ts` (novo), `client/src/components/MiniChat.tsx`
- Diagrama: `Docs/architecture/diagrams/coach-ai-0b/page-context-flow.mermaid`
- OWASP LLM01:2025 — Prompt Injection
- Lessons #13, #19, #26, #30 (`Docs/architecture/lessons-learned.md` / CLAUDE.md §9)
