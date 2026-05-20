# ADR-170: C-game/Inchworm — heurística determinística (zero LLM, zero prompt invasivo) derivando A/B/C de `warmup_rituals` (`emotionalCheckScore` + `overrideUsed` + `decisionToPlay` já existentes em prod desde W-3) + agregador puro `server/services/cgameAggregator.ts` (`classifyWarmupGame` ramos A/B/C + `aggregateCgameForPeriod` + `getInchwormSeries(months)` + `getCgameMovement(current,previous)`) + endpoint `GET /api/coach/cgame/snapshot` não-tier-gated (free vê seus próprios dados) + tab "Mental" no `/coach-ai` com `InchwormChart` Recharts + `CgameSummaryCard` + empty-state quando `sampleSize=0` + thresholds default A/B/C validáveis em piloto (founder valida implementer/reviewer round)

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2B (`Docs/specs/sprint-ai-2b.md` — RF-05; Q-D + founder Q6 locked 2026-05-20)

## Decision owner
system-architect (founder locked Q-D em 2026-05-20: heurística determinística sem LLM; Q6 founder anterior: "só dados de warm-up, sem prompt invasivo"; thresholds default a validar)

## Related
- Depende de: `warmup_rituals` schema (Sprint W-3, em prod há semanas — `emotionalCheckScore int 0-10`, `decisionToPlay bool`, `overrideUsed bool default false`, `blocksCompleted jsonb`, `sessionIntention jsonb`, `version varchar(16)`, `linkedGrindSessionId fk`); ADR-167 (`isToolEligibleTier` — Inchworm é leitura **não-gated**, free vê).
- Reusa: índices `warmup_rituals (user_id, completed_at)` e `(user_id, started_at)` em prod para queries por período.
- Sucessor de: nada — primeiro consumo agregado de `warmup_rituals` além do dashboard de warm-up em si.
- Diagramas: `Docs/architecture/diagrams/coach-ai-2b/cgame-inchworm-derivation.mermaid`.

---

## 1. Contexto

`warmup_rituals` coleta há semanas dados de cada warm-up (pré-sessão de grind). 4 campos chave:
- `emotionalCheckScore`: int 0-10 (auto-report).
- `decisionToPlay`: bool ("vou jogar" vs "abortei").
- `overrideUsed`: bool ("score < 6 mas decidi jogar mesmo assim" — sinal de risco).
- `blocksCompleted`: jsonb (quais blocos da rotina concluiu).

O framework C-game (Tendler/Inchworm) classifica cada sessão em A-game (top), B-game (médio), C-game (bottom) e visualiza o "movimento" (proporção que sobe/desce ao longo do tempo). A pergunta central: como derivar A/B/C dos campos existentes **sem LLM** (Q-D lock) e **sem prompt invasivo** (Q6 founder anterior — "não pergunte mais nada ao user no warm-up").

### Restrições

- **Zero LLM.** Determinístico, testável com fixtures puras.
- **Zero coluna nova em `warmup_rituals`.** Read-only puro do schema atual.
- **Zero prompt invasivo.** Não adicionar campo "qual foi seu C-game hoje?" — Q6 founder explícito.
- **Free vê.** Dados próprios do user; sem custo LLM; engajamento (RF-05.2 — endpoint não-tier-gated).
- **Lesson #2 (`data-testid`):** `InchwormChart` + `CgameSummaryCard` usam testid estáveis.
- **Lesson #9 (logar antes de fallback):** safe-deny — erro em uma row de warm-up loga e pula, não trava o agregado.
- **Lesson #11 (default mínimo):** empty state quando `sampleSize=0` → não inventar "% médio do pool".

### O que está fora de escopo

- Calibração com dados reais — heurística fixa Q-D (consistente com AI-2A `confidence` heurístico ADR-166).
- Tools D5 (`log_mental_state` / `log_cgame_split`) — Q-D lock decide via warm-up, não via tool LLM.
- Wellbeing prompts / schedule pattern detection (H3 plano canônico) — Q6 lock veta.
- Inchworm com sub-classificações dentro de A/B/C (ex: "A+/A/A-") — flat 3 níveis.
- Histograma de `emotionalCheckScore` raw — só agregação A/B/C.

---

## 2. Decisão

Adotada: **heurística determinística Q-D + agregador puro + endpoint `/api/coach/cgame/snapshot` (free incluso) + UI tab "Mental"**.

### 2.1. Heurística `classifyWarmupGame` — defaults Q-D

```ts
function classifyWarmupGame(ritual: WarmupRitual): 'A' | 'B' | 'C' {
  const { emotionalCheckScore, overrideUsed, decisionToPlay } = ritual;

  // A-game: score alto + sem override + decidiu jogar (sinal "estou bem, vou jogar")
  if (emotionalCheckScore >= A_GAME_SCORE_THRESHOLD &&
      !overrideUsed &&
      decisionToPlay === true) {
    return 'A';
  }

  // C-game: score baixo + override usado + decidiu jogar (sinal de risco — "score baixo mas joguei")
  if (emotionalCheckScore <= C_GAME_SCORE_THRESHOLD &&
      overrideUsed === true &&
      decisionToPlay === true) {
    return 'C';
  }

  // B-game: resto (incluindo decisionToPlay=false — "decidi não jogar" é B, não C)
  return 'B';
}
```

**Thresholds default (env-configurável, founder valida em piloto):**
- `A_GAME_SCORE_THRESHOLD` = `process.env.CGAME_A_THRESHOLD ?? 8` (score >= 8)
- `C_GAME_SCORE_THRESHOLD` = `process.env.CGAME_C_THRESHOLD ?? 4` (score <= 4)
- Faixa intermediária `[5, 7]` ou `[8+ com override]` ou `[<=4 sem override]` ou `decisionToPlay=false` → tudo B.

**Justificativa dos defaults:**
- `>= 8` em escala 0-10 captura "estou bem mental e emocionalmente" (top 30% empírico de questionários auto-report).
- `<= 4` captura "estou mal" claramente.
- `overrideUsed` é o sinal forte de risco — joga apesar de estar mal. Sem ele, mesmo com score baixo, B (não chegou a entrar em situação de risco).
- `decisionToPlay=false` é uma decisão consciente boa → B (não C — não jogou em mau estado).

### 2.2. Agregador `cgameAggregator.ts`

Localização: `server/services/cgameAggregator.ts`. Read-only puro, zero LLM, zero side-effect.

```ts
export function classifyWarmupGame(ritual: WarmupRitual): 'A' | 'B' | 'C' { /* §2.1 */ }

export type CgameSnapshot = {
  aPct: number;
  bPct: number;
  cPct: number;
  sampleSize: number;
  confidence: 'high' | 'medium' | 'low';
};

export async function aggregateCgameForPeriod(
  userId: string,
  range: { start: Date | string; end: Date | string },
  storage?: Storage,
): Promise<CgameSnapshot> {
  const s = resolveStorage(storage);
  let rituals: WarmupRitual[] = [];
  try {
    rituals = await s.listWarmupRitualsForRange(userId, range.start, range.end);
  } catch (err) {
    console.error('[cgame] listWarmupRitualsForRange failed', err); // lesson #9
    return { aPct: 0, bPct: 0, cPct: 0, sampleSize: 0, confidence: 'low' };
  }
  const sampleSize = rituals.length;
  if (sampleSize === 0) {
    return { aPct: 0, bPct: 0, cPct: 0, sampleSize: 0, confidence: 'low' };
  }
  const counts = { A: 0, B: 0, C: 0 };
  for (const r of rituals) {
    counts[classifyWarmupGame(r)]++;
  }
  const aPct = round1((counts.A / sampleSize) * 100);
  const bPct = round1((counts.B / sampleSize) * 100);
  const cPct = round1(100 - aPct - bPct); // garante soma 100 com arredondamento
  const confidence: 'high' | 'medium' | 'low' =
    sampleSize >= 20 ? 'high' : sampleSize >= 8 ? 'medium' : 'low';
  return { aPct, bPct, cPct, sampleSize, confidence };
}

export async function getInchwormSeries(
  userId: string,
  months: number,
  storage?: Storage,
): Promise<Array<{ month: string; aPct: number; bPct: number; cPct: number }>> {
  // Itera N meses (incluindo o atual), agrega cada um, preenche zeros para meses sem warm-ups.
  // Retorna [{ month: '2025-12', aPct, bPct, cPct }, ...] ordenado cronologicamente.
}

export async function getCgameMovement(
  userId: string,
  currentRange: { start: Date; end: Date },
  comparisonRange: { start: Date; end: Date },
  storage?: Storage,
): Promise<{
  aPctDelta: number;
  cPctDelta: number;
  narrative: string; // determinístico (template), sem LLM
}> {
  const cur = await aggregateCgameForPeriod(userId, currentRange, storage);
  const prev = await aggregateCgameForPeriod(userId, comparisonRange, storage);
  const aPctDelta = round1(cur.aPct - prev.aPct);
  const cPctDelta = round1(cur.cPct - prev.cPct);
  let narrative = '';
  if (aPctDelta >= 5) narrative = `A-game subiu ${aPctDelta}pp vs período anterior.`;
  else if (cPctDelta <= -5) narrative = `C-game encolheu ${Math.abs(cPctDelta)}pp vs período anterior.`;
  else if (cPctDelta >= 5) narrative = `C-game cresceu ${cPctDelta}pp vs período anterior — atenção.`;
  else if (aPctDelta <= -5) narrative = `A-game caiu ${Math.abs(aPctDelta)}pp vs período anterior — atenção.`;
  else narrative = `Movimento estável vs período anterior.`;
  return { aPctDelta, cPctDelta, narrative };
}
```

- `confidence`: `< 8` → `'low'`; `< 20` → `'medium'`; senão `'high'`. Igual ao padrão de outros agregadores.
- `aPct + bPct + cPct === 100` (round1 + ajuste cPct = 100 - aPct - bPct para evitar drift de arredondamento).

### 2.3. Endpoint HTTP

`GET /api/coach/cgame/snapshot?period=30d|90d|trimestre|ano` — `requireAuth`. **NÃO tier-gated** (free vê seus dados próprios).

Response:
```json
{
  "current": { "aPct": 42.5, "bPct": 38.0, "cPct": 19.5, "sampleSize": 24, "confidence": "high" },
  "inchwormSeries": [
    { "month": "2025-12", "aPct": 30, "bPct": 50, "cPct": 20 },
    { "month": "2026-01", "aPct": 35, "bPct": 50, "cPct": 15 },
    ...
  ],
  "movement": { "aPctDelta": 12.5, "cPctDelta": -10, "narrative": "A-game subiu 12.5pp..." }
}
```

### 2.4. UI

- Hub `/coach-ai` ganha **aba "Mental"** (nova). Layout:
  - Topo: `CgameSummaryCard` — cards grandes %A / %B / %C atuais + comparação vs período anterior.
  - Meio: `InchwormChart` — Recharts area chart com 3 séries (A%/B%/C%) ao longo de 6 meses.
  - Abaixo: section "Mental Hand History" (RF-06 — ADR-171).
- `data-testid` (lesson #2): `cgame-summary-card`, `cgame-pct-a`, `cgame-pct-b`, `cgame-pct-c`, `inchworm-chart`, `cgame-movement-narrative`.
- Empty state quando `sampleSize=0`: "Faça mais warm-ups pra ver seu Inchworm. [Link → `/grind-live`]" (rota Wouter registrada, lesson #19).

### 2.5. Integração com Quarterly Report

- `quarterlyReportGenerator.ts` (ADR-169) chama `aggregateCgameForPeriod(userId, {start:periodStart, end:periodEnd})` + `getInchwormSeries(userId, 6)` + `getCgameMovement(currentRange, previousQuarterRange)`.
- Resultado vai em `ReportContent.cgameSnapshot` (campo opcional, schemaVersion 3).
- `markdown` renderiza seção 12: "Sua mente neste trimestre — Inchworm + Movement narrative".

---

## 3. Opções consideradas

### Opção A — Heurística determinística Q-D (defaults `>= 8` A / `<= 4 + override` C / resto B) — ESCOLHIDA
**Prós:**
- Zero LLM → zero custo, zero risco de "alucinar" interpretação de score.
- Testável com fixtures puras cobrindo todos os ramos.
- Free vê (dados próprios) → engajamento + insight gratuito.
- Q6 founder respeitado (zero prompt novo no warm-up).
- Thresholds env-configurável — founder ajusta sem deploy.
**Contras:**
- Heurística fixa pode não calibrar bem para todos os perfis. Mitigado: env + validação founder em piloto pré-alpha.
- Não captura nuance de auto-report viesado (user que sempre dá score 7 nunca chega em A). Aceito: trade-off explícito (sem prompt invasivo).

### Opção B — Tool D5 `log_cgame_split` (user reporta A/B/C diretamente após sessão)
**Prós:**
- Captura percepção subjetiva real do user.
**Contras:**
- Q6 founder veta — prompt invasivo (precisaria perguntar após cada sessão).
- Friction UX alta.
- Sample baixo (só sessões em que user responde).

### Opção C — LLM classifica A/B/C lendo notas e contexto da sessão
**Prós:**
- Captura contexto rico.
**Contras:**
- Custo recorrente (1 chamada por warm-up * milhares de users).
- "Alucinação" — risco de classificação inconsistente.
- Latência — não pode ser síncrono no warm-up.
- Q-D explicitamente "sem LLM".

---

## 4. Consequências

### Positivas
- Zero custo recorrente.
- Free vê → engajamento extra (sem precisar pagar para ter insight mental).
- Quarterly Report (ADR-169) ganha seção 12 com dados ricos sem custo extra.
- Testes determinísticos — alta cobertura sem mocks LLM.
- Thresholds tunáveis via env — iteração rápida.

### Negativas
- Heurística não-validada empiricamente — pode precisar calibração no piloto.
- Inchworm pode "tremer" muito em users com pouco warm-up por mês (lows aceitáveis com `confidence: 'low'` flag).

### Neutras
- `aggregateCgameForPeriod` é O(n) sobre warm-ups do período — cache em memória opcional (5min TTL) se virar hot path. Hoje (50 warm-ups/mês max) é trivial.
- Movement narrative determinística pode soar repetitiva — aceito; LLM em chat compõe variações livremente quando user pergunta.

## Confiança
**Média-alta** — heurística simples e auditável; defaults baseados em sample de uso interno; thresholds env-config-driven permitem ajuste fino sem deploy. Founder valida em piloto antes de alpha.
