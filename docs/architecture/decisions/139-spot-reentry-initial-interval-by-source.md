# ADR-139 — Initial interval por source (decisao_correct + confidence-based)

- Status: Aprovado
- Data: 2026-05-08
- Sprint: spot-anki-reentry-3 (RF-2.2)
- Decision owner: system-architect
- Related: spec `Docs/specs/spot-anki-reentry-3.md` §RF-2.2, ADR-136 (`spot_reentry_cards` + SM-2 simplified)

---

## 1. Contexto

ADR-136 estabelece SM-2 simplified com 4 grades. Algoritmo opera apos primeira revisao. **Pergunta deste ADR:** qual `interval_days` inicial quando card e CRIADO (antes de qualquer revisao)?

Anki classic SM-2 usa "graduating steps" (1d novo → 6d apos graduating bom). Spec Sprint 3 simplifica:

- **manual_add** (user clica "Adicionar a reentry" em spot existente): user escolheu intencionalmente → 1d (revisao breve confirma compromisso).
- **drill_gto_difficult_spot** (cron auto-cria): spot vem de erro recente em estudo → 1d (priorizar revisao logo).
- **coach_session_insight** (bulk-add via Coach panel): heuristica sobre subspecie:
  - `decision_correct=false` → erro confirmado pelo proprio user → 1d.
  - `confidence_level<=2` → user inseguro → 2d (deixar consolidar antes de revisar).
  - default (sem info) → 1d.

### Opcoes consideradas

#### Opcao 1: Interval fixo 1d para todos (simples)

- **Pros:** zero matriz, easier mental model.
- **Contras:** desperdica sinal semantico do `decision_correct` + `confidence_level`. Spot user disse "tinha certeza moderada" tratado igual a "errei feio".

#### Opcao 2: Tabela completa por (source × decision × confidence) — overkill

Matriz 3 sources × 3 decisions × 5 confidence = 45 combinacoes.

- **Pros:** maxima granularidade.
- **Contras:** premature optimization. Telemetria nao existe para validar diferencas. Cognitive overload doc + tests.

#### Opcao 3: Hierarquia simples (3 reglas) (ESCOLHIDO)

```
SE source='coach_session_insight' AND decision_correct=false → 1d
SE source='coach_session_insight' AND confidence_level<=2     → 2d
SENAO                                                          → 1d
```

- **Pros:** simples, testavel (3 testes cobrem matriz). Decisao explicita: erro = revisar amanha. Inseguranca = revisar depois de amanha (deixa consolidar).
- **Contras:** insuficiente granularidade futura (defer).

---

## 2. Decisao

**Opcao 3.** Tabela final:

| source | decision_correct | confidence_level | initial_interval_days | initial_ease_factor |
|---|---|---|---|---|
| `manual_add` | * | * | 1 | 2.5 |
| `drill_gto_difficult_spot` | * | * | 1 | 2.5 |
| `coach_session_insight` | `false` | * | 1 | 2.5 |
| `coach_session_insight` | * | `<= 2` | 2 | 2.5 |
| `coach_session_insight` | `true` ou `null` | `>= 3` ou `null` | 1 | 2.5 |

Ease factor inicial **sempre 2.5** (Anki neutral). Ajuste vem nas revisoes via ADR-136 algoritmo.

### 2.1 Implementacao

```ts
function computeInitialState(input: {
  source: 'manual_add' | 'drill_gto_difficult_spot' | 'coach_session_insight';
  decisionCorrect?: boolean | null;
  confidenceLevel?: number | null;
}): { intervalDays: number; easeFactor: number; nextReviewAt: Date } {
  let intervalDays = 1;

  if (input.source === 'coach_session_insight') {
    if (input.decisionCorrect === false) {
      intervalDays = 1; // erro confirmado: revisar amanha
    } else if (input.confidenceLevel !== null && input.confidenceLevel !== undefined && input.confidenceLevel <= 2) {
      intervalDays = 2; // inseguranca: deixar consolidar
    } else {
      intervalDays = 1; // default
    }
  }
  // manual_add e drill_gto_difficult_spot: sempre 1d.

  const easeFactor = 2.5;
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86_400_000);

  return { intervalDays, easeFactor, nextReviewAt };
}
```

### 2.2 Decisao "decision_correct=false" tem prioridade sobre "confidence_level<=2"

Logica: se user marcou erro, e mais informativo do que "tive duvida". Erro = treinar de novo logo. Duvida com decisao certa = consolidar antes de testar memoria.

### 2.3 Drill spots nao tem decision_correct/confidence

Cron cria starred_hand orfao SEM `decision_correct` ou `confidence_level` populados (apenas `notes` com hash + context). Drill spots sempre 1d ate user revisitar e marcar campos via `SpotInsightDialog` em /estudos/spots.

### 2.4 Pos-MVP: tunable

Defer telemetria coletar acuracidade primeira revisao por subgrupo. Se "confidence<=2 com 2d" tem accuracy < 70%: aumentar para 3d. Se "decision_correct=false com 1d" tem accuracy > 90%: aumentar para 2d.

---

## 3. Consequencias

### Positivas

- **3 testes matematicos** cobrem matriz inteira (1 por branch).
- **Sinal semantico aproveitado** — Coach insights data fica util.
- **Simples de explicar** — UI tooltip "Sera revisto amanha (erro)" ou "Sera revisto em 2 dias (inseguro)".

### Negativas

- **Sub-granularidade**: `confidence_level=1` (chutei) tratado igual a `confidence_level=2` (quase chutei). **Aceitavel:** dif marginal.
- **Hardcoded** no algoritmo, nao em config. Mudar exige deploy.

### Neutras

- Aplicado APENAS na criacao. Apos primeira revisao, todos cards convergem para algoritmo SM-2 standard (ADR-136). 2d de "confidence<=2" e blip inicial — nao afeta longo prazo.

---

## 4. Confianca

**Media.** Heuristica razoavel mas sem dados para tunar. Aceitavel MVP. Tunable pos-deploy via constants em `server/services/spotReentry/initialState.ts`.
