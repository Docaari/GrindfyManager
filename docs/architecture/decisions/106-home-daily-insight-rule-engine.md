# ADR-106 — Insight do Dia: Rule Engine Client-Side Puro (Onda 1.5)

- Status: Proposto
- Data: 2026-05-03
- Sprint: home-reform-1-5 (Onda 1.5 da reforma da Home)
- Decision owner: system-architect (formaliza D-FOUNDER-6 + D1.5-1 + D1.5-2 da Spec home-reform-1-5)
- Related: ADR-099 (cockpit pattern), ADR-102 (home overview cache), ADR-019 (coach prompt cache strategy — Onda 2 referencia)
- Spec: `Docs/specs/home-reform-1-5.md` §2 D-FOUNDER-6, §3 D1.5-1/D1.5-2/D1.5-10, RF-22

---

## 1. Contexto

### 1.1. Diagnostico

Home Onda 1 (ADR-099) entregou cockpit retrospectivo (Lifetime + Sessions + Performance + PendingHands olham passado). Strategist apontou gap **forward-looking**: zero bloco propositivo "o que faco hoje?". Founder pediu Insight do Dia **agora** (Onda 1.5), nao Onda 2.

Strategist apresentou tres caminhos (§10.1 da audit):

1. **Backend cron + Anthropic prompt** — qualidade alta, custo recurring, 5-7 dias dev (cron, prompt cache ADR-019, tabela `daily_insights_log`, fallback offline).
2. **Rule engine client-side puro** — qualidade media, zero custo, ~2 dias dev, instantaneo.
3. **ML prediction (LSTM/regressao)** — overengineered Onda 1.5, sem dataset etiquetado, zero ROI imediato.

Founder respondeu Q2 com `ACCEPT` (Opcao 2 = client-side rule-based).

### 1.2. Forcas em jogo

- **Time-to-value:** Onda 1.5 e sprint compacto (~7d total para 6 blocos). Insight nao pode consumir mais que ~25% do esforco.
- **Custo Anthropic:** Coach AI ja consome budget recurring (ADR-019/020/021). Adicionar `daily_insights` recorrente para 100% dos usuarios ativos = custo desproporcional para feature em fase de validacao.
- **Determinismo:** founder valoriza previsibilidade ("mesmo dia, mesmo input → mesma sugestao"). Rule engine garante. LLM com `temperature > 0` introduz drift.
- **Reversibilidade:** Onda 2 pode substituir engine por endpoint server-side sem remover regras (rules viram fallback offline).
- **Dados ja agregados:** `/api/home/overview` (ADR-102) ja retorna 8 sub-blocos no payload. Funcao pura sobre `data` nao requer fetch adicional.

---

## 2. Decisao

**Insight do Dia em Onda 1.5 e implementado como rule engine client-side puro**, em modulo dedicado:

```
client/src/lib/home/dailyInsight.ts
```

### 2.1. Contrato

```ts
export type InsightSeverity = 'positive' | 'neutral' | 'caution';

export interface DailyInsight {
  id: string;                  // identificador estavel da regra (ex: 'cooldown-active')
  type: 'rule';                // futuro: 'rule' | 'llm' (Onda 2)
  severity: InsightSeverity;
  message: string;             // PT-BR, 1-2 frases
  ctaHref?: string;            // wouter route relativo (ex: '/grind-live')
  ctaLabel?: string;           // PT-BR, ex: 'Revisar maos'
  metadata?: Record<string, unknown>; // dados que dispararam a regra (debugging)
}

export function computeDailyInsight(data: HomeOverviewResponse): DailyInsight;
//   ↑ funcao pura, sem efeito colateral, sem fetch, sem cache em arquivo.
//   Sempre retorna 1 insight (fallback garante nunca-vazio).
```

### 2.2. Conjunto de regras (ordem fixa, primeira que matchea vence)

Detalhamento operacional em RF-22.7 da spec. Ordem reforcada aqui para nao haver ambiguidade:

| # | Regra | Trigger | Severity | CTA |
|---|---|---|---|---|
| 1 | `cooldown-active` | `data.banners.cooldown.active === true` | caution | `/grind-live` "Ver cool-down" |
| 2 | `pending-hands-critical` | `data.pendingHands.criticalCount >= 3` | caution | `/sessions/recent` "Revisar maos" |
| 3 | `roi-30d-decline` | ROI 30d caiu >5pp ultimos 7d vs 7d anteriores (calc client-side via `data.performance.last30d.roi` + `data.performance.last30d.previousRoi`) | caution | `/dashboard` "Ver detalhes" |
| 4 | `re-engagement` | `data.lifetime.daysSinceLastSession >= 7` | neutral | `/grind-live` "Comecar sessao" |
| 5 | `streak-celebration` | `data.lifetime.currentStreak >= 7` | positive | (sem CTA — celebration neutra) |
| 6 | `roi-strong` | ROI 30d > 10% AND `data.performance.last30d.sessionCount >= 10` | positive | `/dashboard` "Ver detalhes" |
| 7 | `day2-incoming` | `data.banners.flight.hasDay2Tomorrow === true` | neutral | `/grade` "Ver agenda" |
| 8 | `wallets-no-csv` | `data.lifetime.walletsCount > 0 AND data.lifetime.csvImports === 0` | neutral | `/upload` "Importar primeiro CSV" |
| 9 | `fallback` | sempre matcheia (default) | neutral | `Coach FAB` "Pergunte ao Coach" |

Ordem reflete prioridade de **acao requerida**: cooldown (saude > tudo) > erro a corrigir > sinal de queda > nudge de re-engajamento > celebracao > celebracao secundaria > planning > onboarding > fallback.

### 2.3. Memoizacao

Hook `useMemo` em `Home.tsx`:

```tsx
const insight = useMemo(
  () => computeDailyInsight(data),
  [data?.meta.generatedAt]
);
```

Dependencia `data.meta.generatedAt` garante recomputo quando cache TTL 30s expira (ADR-102) e payload e refrescado, sem recomputar a cada re-render do React.

### 2.4. Determinismo

Mesmo `data` → mesmo insight (regras puras, sem `Math.random()`, sem `Date.now()` salvo quando comparado a campos do payload). Util para snapshot tests.

### 2.5. Coach FAB hint badge (B6 RF-27)

Reusa o `insight.id` para chave `localStorage:home:coach:insightSeen:{YYYY-MM-DD}` (D1.5-10). Badge "1" so aparece se `insight.id !== 'fallback'` AND user nao abriu MiniChat hoje. Limpa ao primeiro open. Sem persistencia server-side em Onda 1.5.

---

## 3. Alternativas consideradas

### 3.1. Backend cron + Anthropic prompt (Opcao 1)

Pros:
- Qualidade textual maior (LLM gera frases naturais variadas)
- Pode usar contexto multi-day (tendencia 30d, padroes)
- Reusa prompt cache ADR-019 (custo amortizado)

Contras:
- 5-7 dias dev (cron infra + tabela `daily_insights_log` + prompt cache config + fallback offline + retry/circuit breaker)
- Custo Anthropic recurring per-user-active-day (Opus/Sonnet)
- Quebra determinismo (LLM com temp > 0)
- Adiciona dependency externa no caminho critico da Home (degrada se Anthropic estiver fora)
- Onda 1.5 e sprint compacto — nao cabe

**Defer Onda 2 quando:** (a) base de usuarios ativos justificar custo Anthropic, (b) regras client-side mostrarem diminishing returns em telemetria de cliques no CTA.

### 3.2. ML prediction (Opcao 3)

Pros:
- Personalizacao real (cada user tem modelo proprio)
- Aprende padroes nao-obvios (correlacoes ROI vs hora vs site)

Contras:
- Sem dataset etiquetado (`y` = "insight clicado" inexistente — coldstart)
- Infra ML pesada (training pipeline, model serving, versionamento)
- Overengineered para sprint compacto
- Zero ROI ate ter telemetria suficiente (3-6 meses)

**Defer indefinidamente.** Reavaliar so se Onda 2 LLM tambem mostrar diminishing returns.

### 3.3. Server-side rules (compromisso intermediario)

Pros:
- Centraliza regras (multiplos clients — web + mobile futuro — compartilham)
- Permite logging server-side de quais regras acionam (telemetria centralizada)

Contras:
- Adiciona endpoint sem necessidade real (Home unica surface em Onda 1.5)
- Round-trip extra ou novo campo no `/api/home/overview` (mais payload)
- Mesma logica deterministica, sem ganho real vs client-side
- Requer migrar pro client de qualquer forma para feature offline-resiliente

**Rejeitado** — Onda 2 LLM substitui direto sem passar por essa fase intermediaria.

---

## 4. Consequencias

### 4.1. Positivas

- **Zero custo recurring** Anthropic (Onda 1.5).
- **Time-to-value:** ~2 dias dev. Cabe no sprint compacto.
- **Determinismo:** snapshot tests triviais. Mesmas regras, mesmo input, mesmo output.
- **Resiliencia:** funciona offline (depende so do `data` ja em cache TanStack Query).
- **Reversivel:** Onda 2 substitui sem remover. Regras viram fallback quando Anthropic indisponivel.

### 4.2. Negativas

- **Hard-coded:** regras nao melhoram sozinhas. Adicionar nova heuristica = code change + deploy.
- **Cobertura limitada:** ~9 regras nao cobrem todos os perfis de player. Fallback "Pergunte ao Coach" e sempre acionavel mas pouco especifico.
- **Linguagem rigida:** mensagens sao strings hard-coded. Nao adaptam tom ao player.

Mitigacao Onda 2: substituir engine por LLM mantendo as 9 regras como fallback offline + system prompt para LLM "voce gera 1 insight curto baseado nestes dados, no estilo das regras X/Y/Z".

### 4.3. Neutras

- Spec home-reform-1-5 D1.5-3 fixa posicao do `<DailyInsight>` (logo abaixo de `<StatusStrip>`, acima de `<TodayCard>`). Nao impacta esta ADR.
- Telemetria de cliques no CTA fica para Onda 2 (sem `analytics_events` em Onda 1.5 — ADR-055 stub via console.log mantem padrao).

---

## 5. Pontos de extensao para Onda 2

Codigo desenhado para nao-quebrar quando Onda 2 chegar:

1. **Tipo `DailyInsight` exporta `type: 'rule' | 'llm'`** (so `'rule'` em Onda 1.5). Onda 2 introduz `'llm'` sem mudar shape.
2. **Endpoint futuro `GET /api/home/insight`** poderia fornecer override server-side. Frontend prioriza `data.insight` (server-side) → fallback `computeDailyInsight(data)` (client-side rules).
3. **Tabela `daily_insights_log`** opcional Onda 2 para tracking. Schema sugerido: `(id, userId, date, insightId, severity, source: 'rule'|'llm', clickedCta: boolean, createdAt)`. Nao criada Onda 1.5 (zero migration).
4. **Prompt cache ADR-019** ja documenta padrao 2-blocos (estatico + dinamico). Onda 2 do Insight reusa.

---

## 6. Confianca

**Alta.** Padrao client-side rule-based bem-estabelecido em produtos LMS/fitness/finance. Risco principal (regras engessadas) e mitigavel via Onda 2 sem dirty rewrite.

---

## 7. Referencias

- `Docs/specs/home-reform-1-5.md` §2 D-FOUNDER-6, §3 D1.5-1, D1.5-2, D1.5-10, RF-22
- `Docs/strategy/home-reform-1-ux-audit-and-onda-1-5.md` §10.1 Q2 (caminhos avaliados)
- ADR-019 (Coach prompt cache) — referencia para Onda 2
- ADR-102 (`/api/home/overview` cache 30s) — fonte de dados do `computeDailyInsight`
- ADR-099 (Operations Cockpit pattern) — contexto da Home Onda 1
