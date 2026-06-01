# Spec: Fase B — Lead Measures Baratos (Compliance de Warm-up + Distribuição A/B/C-game)

## Status
Proposta

## Resumo
Expor, na aba **Mental** do perfil (`MentalAnalyticsTab`), os dois *lead measures* 4DX mais puros que a plataforma **já captura e não mostra**: (1) **compliance de warm-up** (`warmup_rituals`) e (2) **distribuição A/B/C-game** (`cooldown_logs.abGameAnswers`). Sprint de leitura/agregação pura sobre dados existentes — provável zero migration, zero novo fluxo de captura. É a prova-de-conceito barata do 4DX e prepara o `sourceMetric` do placar da futura ferramenta de Metas.

> **Marcação:** este sprint tem **dois RFs grandes independentes** — **#1 (RF-01 Warm-up compliance)** e **#2 (RF-02 A/B/C-game distribution)**. Cada um é métrica-de-storage + rota + widget. Podem ser implementados/testados isoladamente.

## Contexto
- **Board ICE** (`Docs/strategy/estrategia-sprints-finais-2026-06-01.md` §3): itens **#1** e **#2**, ambos **ICE 8.3** (os 2 maiores quick-wins). Fase **B** = "Lead measures baratos: Compliance de processo + A/B/C-game".
- **Leitura estratégica #1 do board:** "os 2 maiores quick-wins são DADO PARADO — a plataforma já captura os dois lead measures 4DX mais puros (`warmup_rituals`/`cooldown_logs` + `cooldown_logs.abGameAnswers`) e NÃO MOSTRA NENHUM. São a prova-de-conceito barata do 4DX e alimentam o placar da Metas de graça."
- **Doutrina 4DX-D2** (`curso-antes-das-cartas-learnings-2026-06-01.md` §2): medida de direção = **preditiva** (mover ela move a WIG) **+ influenciável** (o jogador controla). Warm-up compliance e A/B/C-game são meta de processo (C7) dentro da dicotomia do controle (A2) — exatamente lead measures legítimos.
- **Âncoras do curso:**
  - **C8** — warm-up/cool-down tem efeito MAIOR sob pressão (g=0.70). Rastrear "fez warm-up sim/não" é processo binário/contagem.
  - **C7** — meta de **processo** (warm-up, ~100% controlável, semanal) e de **performance** (A-game vs próprio histórico, mensal). NUNCA mostrar resultado de curto prazo aqui.
  - **C2** — distribuição A/B/C-game por sessão; o **C-game** é o ponto de atenção.
  - **A2** — dicotomia do controle: a métrica mira só o controlável.
  - **A4** — Coach cobra comportamento, não culpa. O widget é informativo, não punição (governa a linguagem).
  - **A7** — dashboard que mostra progresso satisfaz **competência** (SDT) e sustenta motivação. O widget é combustível, não gatilho.
  - **A9** — sistema acima de força de vontade; rastrear hábito cumprido (binário/%) é o mecanismo.
- **Recon (já feito, não re-descobrir):**
  - **#1:** COOLDOWN compliance já existe end-to-end (`storage.getCooldownComplianceMetrics` → `GET /api/analytics/cooldown-compliance` → `ComplianceWidget`). **O GAP é WARM-UP**: `warmup_rituals` é capturado (`schema.ts:842`), `listWarmupRituals` existe, mas **não há métrica de compliance nem UI**.
  - **#2:** captura existe (`cooldown_logs.abGameAnswers` jsonb, input via `BlockTwoABCJournal.tsx`); `getTopLessons` já tokeniza `abGameAnswers.lesson`. **GAP:** zero agregação de distribuição A vs B vs C.
  - **Surface alvo (ambos):** `client/src/components/profile/MentalAnalyticsTab.tsx` (4 widgets, period selector 7d/30d/90d, padrão `useQuery` + `apiRequest`, `Skeleton`, error state, `data-testid`).

## Usuários
- **Jogador profissional/semi-profissional de MTT** (único ator): abre a aba Mental do perfil, escolhe o período (7d/30d/90d), e lê (a) quanto do seu processo de warm-up cumpriu e (b) como sua autoavaliação A/B/C-game se distribui. Leitura passiva — nenhuma escrita nova.

---

## Requisitos Funcionais

### RF-01 — #1 Warm-up Compliance (métrica + rota + widget)

**Descrição:** espelhar a infra de cooldown compliance para o warm-up. Quanto das sessões de grind concluídas no período tiveram um ritual de warm-up **completo**.

**Regras de negócio:**
- **Denominador (`total`)** = `grind_sessions` com `status='completed'` no período (mesma regra do cooldown; §6.1 — usar `grind_sessions`, NUNCA `session_tournaments`).
- **Numerador (`completed`)** = `warmup_rituals` que contam como **processo cumprido** no período, definido como:
  - **REGRA (travada):** `completedAt != null` **E** `version = 'full'`. Janela do período pela coluna `startedAt` (espelha cooldown que usa `startedAt >= cutoff`).
  - `version = 'aborted'` **não** conta como compliance.
  - Nota de design (C8/A4/A2): warm-up que rodou completo e **decidiu NÃO jogar** (`decisionToPlay = false`) **conta como compliance positivo** — é processo executado corretamente, não falha. A regra acima (`completedAt != null AND version='full'`) já captura isso por construção (não filtra `decisionToPlay`). NÃO penalizar `decisionToPlay=false`.
- **`complianceRate`** = `total > 0 ? min(1, completed / total) : 0` (idêntico ao cooldown — clamp em 1 porque numerador e denominador vêm de tabelas distintas e podem divergir).
- **Campos auxiliares (expor — baratos, vêm do mesmo SELECT):**
  - `fullCount` (= `completed`, alias semântico opcional; ver decisão DEC-B3),
  - `abortedCount` = warm-ups com `version='aborted'` no período (sinal de quanto o jogador começa e larga),
  - `decisionNotToPlayCount` = warm-ups `version='full'` com `decisionToPlay=false` no período (processo positivo de "decidiu não jogar" — A4/C8). **Subconjunto de `completed`, não somar fora.**
  - `overrideUsedCount` = warm-ups `version='full'` com `overrideUsed=true` (jogou com score emocional < 6 — sinal de risco, exibição opcional). Ver DEC-B2 sobre incluir ou não.
- **Período:** `'7d' | '30d' | '90d'`, default `'30d'`, via `periodCutoff` (analytics retrospectivo — NÃO janela de semana UTC).

**Critério de aceitação:**
- [ ] `storage.getWarmupComplianceMetrics(userId, period)` retorna `{ total, completed, complianceRate, abortedCount, decisionNotToPlayCount }` (+ campos de DEC-B2/B3 se aceitos).
- [ ] `total` conta apenas `grind_sessions.status='completed'` no período (não `session_tournaments`).
- [ ] `completed` conta apenas `warmup_rituals` com `completedAt != null AND version='full'` no período.
- [ ] `version='aborted'` é excluído de `completed` e contado em `abortedCount`.
- [ ] Warm-up `version='full'` com `decisionToPlay=false` **continua dentro de `completed`** (não é descontado).
- [ ] `complianceRate = 0` quando `total=0` (sem divisão por zero); clamp em `1` quando `completed > total`.
- [ ] `GET /api/analytics/warmup-compliance?period=30d` retorna 200 com o shape acima; `requireAuth` aplicado; ownership por `userId` do token.
- [ ] `period` inválido → 400 `{ message }`; `period` ausente/vazio → default `30d` (espelha `resolvePeriod`).
- [ ] Erro de storage → 500 `{ message }` com `console.error` antes (lesson #9).
- [ ] Cache header `private, max-age=300` setado (espelha cooldown analytics).
- [ ] Widget `WarmupComplianceWidget` no `MentalAnalyticsTab` com `data-testid="mental-analytics-warmup-compliance"`, exibe `pct%` + "{completed} de {total} sessões com warm-up completo", estados loading (`Skeleton`) e error.
- [ ] Linguagem do widget: processo/competência (ex: "X% das suas sessões tiveram warm-up completo"), **sem** P&L, **sem** comparação social, **sem** tom punitivo.

---

### RF-02 — #2 Distribuição A/B/C-game (métrica + rota + widget)

**Descrição:** agregar a autoavaliação A/B/C-game (`cooldown_logs.abGameAnswers`) ao longo do período — distribuição A vs B (volume de itens), cobertura (quantas sessões preencheram o journal), média por sessão, e temas recorrentes de C-game/lição (tokenizados).

**Regras de negócio:**
- **Fonte:** `cooldown_logs` com `completedAt != null` e `startedAt >= cutoff` (mesmo recorte do `getTopLessons`), lendo `abGameAnswers` (`{ aGame: string[], bGame: string[], cGame: string, lesson: string }`).
- **`journaledSessions`** = nº de cooldown_logs no recorte que têm `abGameAnswers` com pelo menos um campo preenchido não-vazio (A, B, C ou lesson). Cobertura do journal.
- **`aGameItemCount`** = soma de itens não-vazios em `aGame` em todas as linhas; idem `bGameItemCount` para `bGame`.
- **`cGameEntryCount`** = nº de linhas com `cGame` string não-vazia (C-game costuma ser texto livre único, não array — daí contagem de entradas, não de itens).
- **`avgAGamePerSession` / `avgBGamePerSession`** = `aGameItemCount / journaledSessions` e `bGameItemCount / journaledSessions` (0 quando `journaledSessions=0`). Arredondar a 2 casas no storage ou deixar pro widget (DEC-B4).
- **`abShare`** = distribuição relativa A vs B para o donut/barra: `{ aGamePct, bGamePct }` onde `aGamePct = aGameItemCount / (aGameItemCount + bGameItemCount)` (e `bGamePct` complementar); ambos `0` quando soma = 0. (O C-game é texto livre, não entra no share A/B — entra como contagem + temas; ver DEC-B5.)
- **`cGameThemes`** = tokens agregados de **`cGame` + `lesson`** combinados (o C-game é o ponto de atenção; reusar o `tokenizeLessons` existente passando o array `[...cGames, ...lessons]`). Retorna `Array<{ token, count }>` top-N (reusa `TOP_N=30` do tokenizer). PII: o tokenizer já garante tokens > 3 chars, sem frases cruas (lesson — não vazar texto livre, espelha §RF-08 do EST-2 / cool-down word cloud).
- **NÃO copiar texto livre cru** (`cGame`/`lesson` inteiros) para a resposta da API — só a forma tokenizada agregada.
- **Período:** `'7d' | '30d' | '90d'`, default `'30d'`.

**Critério de aceitação:**
- [ ] `storage.getAbGameDistribution(userId, period)` retorna o shape definido em "Shapes TS" abaixo.
- [ ] Lê apenas `cooldown_logs` com `completedAt != null` no período (espelha `getTopLessons`).
- [ ] `journaledSessions` conta só linhas com ao menos um campo de `abGameAnswers` preenchido.
- [ ] `aGameItemCount`/`bGameItemCount` ignoram strings vazias/whitespace nos arrays.
- [ ] `avgAGamePerSession` / `avgBGamePerSession` = `0` quando `journaledSessions = 0` (sem NaN/Infinity).
- [ ] `abShare.aGamePct + abShare.bGamePct === 1` quando há itens; ambos `0` quando não há.
- [ ] `cGameThemes` reusa `tokenizeLessons` sobre `cGame + lesson`; nenhuma frase crua na resposta.
- [ ] Período sem dados → shape "vazio" coerente (todos 0/`[]`), 200 (não 404).
- [ ] `GET /api/analytics/abgame-distribution?period=30d` retorna 200; `requireAuth`; ownership por token; `period` inválido → 400; default `30d`; erro → 500 + `console.error`; cache `private, max-age=300`.
- [ ] Widget `AbGameDistributionWidget` no `MentalAnalyticsTab` com `data-testid="mental-analytics-abgame"`: mostra share A/B (barra/proporção), `journaledSessions`, médias por sessão, e os `cGameThemes` como chips (reusa o padrão de chips do `LessonsWidget`). C-game destacado como ponto de atenção (linguagem C2/A9: "onde seu jogo cai sob pressão"), **sem** punição.
- [ ] Estados loading (`Skeleton`) e error; empty-state com `data-testid="mental-analytics-abgame-empty"` ("Sem registros A/B/C-game nesse período. Preencha o journal no cool-down.").

---

### RF-03 — Enquadramento de produto (linguagem dos 2 widgets)

**Descrição:** ambos os widgets seguem o tom do curso. Não é RF de código isolado — é critério transversal de aceitação dos textos.

**Regras de negócio:**
- Processo > resultado (C7/A9): falar em "warm-up completo", "A-game vs B-game", não em lucro.
- A-game vs **própria referência** (C2/C7), nunca comparação social ("a média dos jogadores…" é proibida).
- Warm-up sob pressão (C8) pode aparecer como microcopy ("warm-up rende mais sob pressão").
- Competência/SDT (A7): o widget mostra progresso, não cobra com culpa (A4 — sem "você deveria", sem "você nunca/sempre").
- **NÃO mostrar P&L/ROI** nesses widgets (já há `/stats`).

**Critério de aceitação:**
- [ ] Nenhum dos 2 widgets renderiza valor monetário ou ROI.
- [ ] Nenhum texto compara o jogador a outros jogadores.
- [ ] Microcopy revisado contra A4 (sem culpa) — verificável por inspeção do JSX/strings.

---

### RF-04 — Vínculo com a ferramenta de Metas (sinalização, NÃO implementar)

**Descrição:** documentar (no código/spec, não wirar) que estas 2 métricas viram `sourceMetric` do placar 4DX futuro.

**Regras de negócio:**
- O motor de aderência (ADR-227) já tem **`warmup_compliance`** no union `SourceMetric` (deferido — DEC-MA8 da `metas-tool`); a `metas-tool-2026-06-01.md` lista `warmup_compliance` (processo) e `a_game_pct` (performance) como `sourceMetric` (linhas 97-98).
- **Fase B NÃO pluga no motor de aderência** (deferido — a Metas/futuro faz). Só **expõe** o dado via métrica/rota/UI.
- Comentário de cabeçalho nos arquivos novos referenciando esta spec + a `metas-tool` (sourceMetric futuro), para o consumidor futuro achar.

**Critério de aceitação:**
- [ ] Nenhum acoplamento ao motor de aderência neste sprint (sem import de `getPlannedVsActual`/ADR-227).
- [ ] Cabeçalho dos arquivos novos cita `metas-tool-2026-06-01.md` como consumidor futuro do shape.

---

## Requisitos Não-Funcionais
- **Performance:** cada endpoint = 1-3 SELECTs `COUNT`/scan leve sobre tabelas já indexadas (`warmup_rituals` tem `idx_warmup_rituals_user_completed` + `idx_warmup_rituals_user_started`; `cooldown_logs` por user+startedAt). Alvo p95 < 200ms; cache `private, max-age=300`.
- **Segurança:** `requireAuth` em ambas; ownership estrito por `userId` do token (nunca aceitar userId do query/body). Sem PII de texto livre na resposta de A/B/C (só tokens).
- **Disponibilidade:** falha de storage não derruba a aba — cada widget tem error state isolado (`isError`); o `anyError` banner já existe.
- **Sem dado financeiro:** FX→USD N/A (sprint sem componente monetário).
- **Idempotência/leitura pura:** zero escrita; zero mudança no fluxo de captura.

---

## Shapes TS das 2 métricas

```ts
// RF-01 — server/storage.ts (espelha getCooldownComplianceMetrics)
export interface WarmupComplianceMetrics {
  total: number;                  // grind_sessions status='completed' no período
  completed: number;              // warmup_rituals completedAt!=null AND version='full'
  complianceRate: number;         // total>0 ? min(1, completed/total) : 0
  abortedCount: number;           // warmup_rituals version='aborted' no período
  decisionNotToPlayCount: number; // subconjunto de completed: version='full' AND decisionToPlay=false
  // opcionais (DEC-B2/B3 — architect decide):
  overrideUsedCount?: number;     // version='full' AND overrideUsed=true
}
async getWarmupComplianceMetrics(
  userId: string,
  period: "7d" | "30d" | "90d",
): Promise<WarmupComplianceMetrics>;

// RF-02 — server/storage.ts
export interface AbGameDistribution {
  journaledSessions: number;      // cooldown_logs com abGameAnswers preenchido no período
  aGameItemCount: number;
  bGameItemCount: number;
  cGameEntryCount: number;        // linhas com cGame não-vazio
  avgAGamePerSession: number;     // 0 se journaledSessions=0
  avgBGamePerSession: number;     // 0 se journaledSessions=0
  abShare: { aGamePct: number; bGamePct: number }; // soma 1 quando há itens; 0/0 senão
  cGameThemes: Array<{ token: string; count: number }>; // tokenizeLessons(cGame + lesson), top-30
}
async getAbGameDistribution(
  userId: string,
  period: "7d" | "30d" | "90d",
): Promise<AbGameDistribution>;
```

> Handlers novos recebem `injectedStorage` como 3º arg opcional (lesson #34/#36): `handleWarmupCompliance(req, res, injectedStorage?)` / `handleAbGameDistribution(req, res, injectedStorage?)`; em produção fallback `await import("../storage")` ou usar o `storage` importado no módulo (espelhar o módulo `cooldownAnalytics.ts` que usa `storage` direto — o architect decide se mantém o padrão do arquivo ou introduz injeção; ver DEC-B6).

---

## Endpoints Previstos
| Método | Rota | Descrição | Auth | Cache |
|---|---|---|---|---|
| GET | `/api/analytics/warmup-compliance?period=` | Compliance de warm-up (RF-01) | requireAuth | `private, max-age=300` |
| GET | `/api/analytics/abgame-distribution?period=` | Distribuição A/B/C-game (RF-02) | requireAuth | `private, max-age=300` |

Registrar em `server/routes/cooldownAnalytics.ts` (mesmo módulo de analytics mental) **ou** novo módulo `mentalAnalytics.ts` — DEC-B7. Atenção a **colisão de rota**: ambas começam com `/api/analytics/` e são paths completos (sem `:param` que possa shadowar) — baixo risco, mas confirmar ordem de registro + guard test (padrão EST-3/EST-6).

---

## Modelos de Dados Afetados
**Nenhum modelo novo. Provável ZERO migration** — ambas as métricas leem tabelas existentes:
- `warmup_rituals` (`schema.ts:842`) — colunas usadas: `userId`, `startedAt`, `completedAt`, `version`, `decisionToPlay`, `overrideUsed`. Índices já existentes cobrem os filtros.
- `cooldown_logs.abGameAnswers` (`schema.ts:3500`, type `AbGameAnswers`) + `completedAt` + `startedAt`.
- `grind_sessions` (`status`, `date`/`userId`) para o denominador de RF-01.

**Confirmar na fase do architect:** que nenhum índice novo é necessário (os existentes em `warmup_rituals` e `cooldown_logs` cobrem `user + startedAt`). Se confirmado, marcar explicitamente "sem migration" no ADR.

---

## Cenários de Teste Derivados

### Happy Path
- [ ] RF-01: 10 grind_sessions completed + 7 warmup_rituals full no período → `total=10, completed=7, complianceRate=0.7`.
- [ ] RF-02: 5 cooldown_logs com journal preenchido, somando 12 itens A e 6 itens B → `journaledSessions=5, aGameItemCount=12, bGameItemCount=6, abShare={aGamePct:0.667, bGamePct:0.333}`.
- [ ] Widgets renderizam `pct%` e a barra A/B com `data-testid` estáveis (lesson #2).

### Validação de Input
- [ ] `period` ausente → default `30d` (ambos endpoints).
- [ ] `period=banana` → 400 `{ message }` (ambos).
- [ ] Sem `requireAuth` / token inválido → 401.

### Regras de Negócio
- [ ] RF-01: warmup `version='aborted'` NÃO entra em `completed`, entra em `abortedCount`.
- [ ] RF-01: warmup `version='full'` com `decisionToPlay=false` PERMANECE em `completed` (não punir "decidiu não jogar").
- [ ] RF-01: `completed > total` → `complianceRate` clampa em `1`.
- [ ] RF-02: array `aGame` com strings vazias/`"   "` → não contadas em `aGameItemCount`.
- [ ] RF-02: `cGameThemes` tokeniza `cGame + lesson`, descarta tokens ≤ 3 chars e stopwords (reusa `tokenizeLessons`); nenhuma frase crua na resposta (lesson — privacidade do texto livre).

### Edge Cases
- [ ] `total=0` (sem sessões completed) → `complianceRate=0`, sem divisão por zero.
- [ ] `journaledSessions=0` → todas as médias `0`, `abShare={0,0}`, `cGameThemes=[]`, 200.
- [ ] `abGameAnswers=null`/malformado em alguma linha → ignorado sem crash (defensive parse, lesson #9).
- [ ] Falha do storage → 500 com `console.error` antes (não engolir silenciosamente).
- [ ] (RTL) widget com `isError=true` mostra mensagem de erro isolada sem quebrar os outros widgets.

### Convenções de teste (lessons)
- [ ] Storage tests espelham os mocks reais de `getCooldownComplianceMetrics`/`getTopLessons` (lesson #3 — validar shape real, não mock idealizado).
- [ ] Testes RTL do widget usam `await import(...)` do componente (lessons #14/#26), `data-testid` estáveis (#2/E2).
- [ ] Mock de `apiRequest` retorna o JSON **parseado direto** (lesson #13), não `{ ok, json }`.
- [ ] `.test.ts` (storage/handler) roda no projeto `server` (node); `.test.tsx` (widget) no projeto `client` (jsdom) — lesson #30.

---

## Fora de Escopo
- Tilt tipado 7 tipos (#4, Fase C), insight mental↔resultado (#10, Fase C), detecção real de leak (#3, Fase C).
- A ferramenta de Metas em si (`metas-tool`).
- **Plugar `warmup_compliance` no motor de aderência (ADR-227)** — deferido (DEC-MA8); Fase B só expõe a métrica/UI.
- Mudar o fluxo de **captura** (`BlockTwoABCJournal.tsx`, warm-up ritual UI) — só LEITURA/agregação.
- P&L/ROI nesses widgets (já em `/stats`).
- Janela de semana UTC / chaves BRT — esta superfície é analytics retrospectivo `7d/30d/90d`.
- Versão `'minimal'` do warm-up (mencionada no schema como futura Sprint W-3) — não existe ainda; a regra `version='full'` não a contempla. Se `'minimal'` surgir, revisitar (DEC-B1).

## Dependências
- **Nenhuma de feature.** Lê tabelas já populadas em produção. (Por isso o board marca "depende de — (dado já existe)".)
- Reusa: `MentalAnalyticsTab.tsx`, `lessonTokenizer.ts` (`tokenizeLessons`), padrão de `cooldownAnalytics.ts`, `periodCutoff`.

## Decisões Abertas (para o System-Architect)
- **DEC-B1:** se/quando `warmup_rituals.version='minimal'` (Sprint W-3 futura) existir, conta como compliance? Spec atual trava só `'full'`. Recomendação: incluir `'minimal'` no compliance quando existir (warm-up de 3min ainda é processo cumprido — C8 "o que importa é fazer, não o tamanho"). Decidir agora se a query usa `version IN ('full','minimal')` defensivamente (minimal hoje retorna 0 rows) ou só `'full'`.
- **DEC-B2:** expor `overrideUsedCount` na resposta de RF-01? É sinal de risco (jogou com check emocional baixo), mas pode confundir o placar de "compliance". Recomendação: incluir no shape mas o widget só mostra discretamente (ou nem mostra na v1).
- **DEC-B3:** `fullCount` é redundante com `completed`. Manter só `completed` (alinhado ao cooldown) — recomendação: dropar `fullCount`.
- **DEC-B4:** arredondamento de médias (`avgAGamePerSession`) no storage (2 casas) vs no widget. Recomendação: cru no storage, formatação no widget (consistente com o resto).
- **DEC-B5:** C-game entra no `abShare` (virando A/B/C 3-way) ou fica só como `cGameEntryCount` + `cGameThemes`? Recomendação: share só A/B (são arrays comparáveis); C como contagem + temas (é texto livre/ponto de atenção). Confirmar com founder se o widget quer um "tri-share" visual.
- **DEC-B6:** handlers usam `injectedStorage` 3º arg (lesson #34/#36) ou seguem o padrão do `cooldownAnalytics.ts` que importa `storage` direto e mocka via `vi.mock`? Recomendação: seguir o padrão existente do módulo para consistência, salvo se o test-writer preferir injeção.
- **DEC-B7:** registrar as 2 rotas em `cooldownAnalytics.ts` (renomear conceitualmente para "mental analytics") ou criar `mentalAnalytics.ts` novo. Recomendação: mesmo módulo (já é o módulo de analytics da aba Mental) + atualizar o cabeçalho do arquivo.
- **DEC-B8:** guard test de colisão de rota necessário? As rotas são paths estáticos sob `/api/analytics/` — risco baixo. Recomendação: 1 smoke test de registro (rota responde 200 com auth) basta; sem guard de shadowing complexo (diferente de EST-3 onde havia `:id`).

## Riscos
- **R1 — divergência de denominador (RF-01):** `warmup_rituals` e `grind_sessions` são tabelas independentes; um jogador pode ter mais warm-ups full que sessões completed (warm-up que decidiu não jogar não vira grind_session completed). O clamp em `1` mitiga, mas o número pode parecer ">100% antes do clamp". Mitigação: documentar a semântica no microcopy ("warm-ups completos vs sessões jogadas") + clamp. Mesmo trade-off já aceito no cooldown.
- **R2 — `abGameAnswers` malformado/legado:** linhas antigas podem ter shape parcial (`cGame` ausente, arrays como `null`). Parse defensivo obrigatório (lesson #9) — testar linha malformada.
- **R3 — baixa adoção do journal A/B/C:** se poucos cooldowns têm `abGameAnswers`, o widget fica quase sempre vazio. Empty-state forte + (futuro, Fase E #9) boost de adoção. Fora de escopo aqui, mas sinalizar no empty-state.
- **R4 — working tree compartilhada (#24/#45):** `MentalAnalyticsTab.tsx` e `cooldownAnalytics.ts`/`storage.ts` podem ser tocados por outra sessão. Mitigação: `git add` EXPLÍCITO por arquivo, nunca `git add -A`; considerar `git worktree` por sprint (nota de execução §4 do doc de estratégia).
- **R5 — privacidade do texto livre:** `cGame`/`lesson` são notas pessoais. NUNCA retornar cru pela API — só tokens (já garantido por `tokenizeLessons`). Testar que nenhuma frase aparece na resposta.

---

## Notas de Implementação (opcional)
- Espelhar **byte-a-byte** `getCooldownComplianceMetrics` para `getWarmupComplianceMetrics` (mesma forma de SELECT count, `periodCutoff`, clamp). Trocar `cooldownLogs`→`warmupRituals` e adicionar o filtro `version='full'`.
- Espelhar `getTopLessons` para a parte de tokens de `getAbGameDistribution`, mas alimentar `tokenizeLessons` com `[...cGames, ...lessons]` em vez de só `lessons`.
- Widgets: copiar a estrutura de `ComplianceWidget`/`LessonsWidget` (mesmo `Skeleton`, mesma família de `data-testid`). Adicionar as 2 novas `useQuery` ao `MentalAnalyticsTab` e ao cálculo de `anyError`.
- Cabeçalho dos arquivos novos: citar `Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md` + `Docs/specs/metas-tool-2026-06-01.md` (sourceMetric futuro: `warmup_compliance`, `a_game_pct`).
