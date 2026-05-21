# ADR-179: Dashboard admin "Score vs ROI realizado" — query JOIN, admin gate, `insufficientData` flag, a11y exception

## Status

Aceito

## Data

2026-05-21

## Sprint

Tournament Selector 3 (`Docs/specs/sprint-tournament-selector-3.md` — RF-05; Q-B + Q-D + Q-N locked 2026-05-21).

## Decision owner

system-architect (Q-B locked: implementar com `insufficientData` flag desde já — UI pronta vale ouro, fallback quando `totalAdds<50`; Q-D locked: NÃO rodar Q1-Q5 SQL antes do pipeline — `insufficientData` flag absorve; Q-N locked: a11y básico apenas — semantic table + sr-only labels, documentar exception aqui).

## Related

- **Depende de:** Sprint 1 RF-07 (`tournament_selector_logs` em prod com `eventType='add_to_grid'`), `tournamentScorer.ts` (Sprint 1 — grade derivation), CLAUDE.md §6.1 (regra `tournaments.grind_session_id IS NULL` para histórico).
- **Reusa:** `requirePermission('admin')` (auth.ts), padrão `withAdvisoryLock` para cache server-side (não obrigatório aqui — TTL Map basta), padrão `injectedStorage?` (lesson #34).
- **Não exige migration** — query lê tabelas existentes.
- **Diagrama:** `Docs/architecture/diagrams/ts-3/ts-3-calibration-query-flow.mermaid`.

---

## 1. Contexto

ADR-015 (scoring linear + Bayesian shrinkage) deixou explícito que os pesos default (`site 0.20 / buyIn 0.20 / category 0.20 / speed 0.10 / dayOfWeek 0.10 / timeOfDay 0.15 / field 0.05`) são "palpite informado" e exigem validação via telemetria coletada (linha 165 — "Gatilho de migração ML").

Strategist (2026-05-21) propôs dashboard admin agregando "score vs ROI realizado" — surface mínima para o founder decidir trimestralmente se calibração precisa ajuste. Sem essa surface, ADR-015 §165 não consegue acionar gatilho de migração ML nem ajuste de pesos.

**O problema do volume:** Sprint 1 shippou 2026-04-23. Volume real de `add_to_grid` em produção é desconhecido (founder AFK pediu para não rodar SQL pré-pipeline — Q-D). Estratégia: implementar dashboard **com flag `insufficientData`** que serve UI esclarecida quando `totalAdds < 50` no lookback. Quando volume crescer, UI já está pronta.

**Causalidade vs preditividade:** dashboard mostra ROI realizado de torneios que o jogador **adicionou** (viés de seleção — jogador só adiciona o que já confia). NÃO é prova causal. Warning explícito na UI (`<Alert>` no topo).

---

## 2. Query design

### 2.1 Matching tournaments_log ↔ tournaments

`tournament_selector_logs` registra adds com `tournamentExternalId` + `source` + `timestamp` + `score` + `grade`. Para correlacionar com ROI realizado, precisa fazer JOIN com `tournaments` (histórico canônico). Dois caminhos de matching:

**Caminho 1 — por `externalId` (forte):**

```sql
SELECT t.*
FROM tournaments t
JOIN tournament_selector_logs l
  ON l.tournament_external_id = t.external_id
WHERE t.grind_session_id IS NULL  -- §6.1 da CLAUDE.md
  AND l.event_type = 'add_to_grid'
```

`externalId` está em logs (Suprema sempre tem; library pode ter ou não). Quando presente, match é determinístico.

**Caminho 2 — heurística datetime (fraco, fallback):**

Quando `tournament_external_id IS NULL` no log (library sem externalId), tenta matching por:

- `t.user_id = l.user_id`
- `t.played_at BETWEEN l.created_at AND l.created_at + INTERVAL '14 days'` (janela 14d — torneio adicionado à grade é jogado em até 2 semanas tipicamente)
- `ABS(EXTRACT(EPOCH FROM (t.played_at - l.scheduled_at)) / 3600) < 48` (hora marcada vs jogada dentro de 48h)

Heurística introduz ruído. Documentar limitação na nota de cautela da UI.

### 2.2 Query final (esboço SQL)

```sql
WITH adds_realized AS (
  SELECT
    l.grade,
    l.score,
    l.user_id,
    l.created_at AS added_at,
    t.profit_usd,
    t.buy_in_usd,
    CASE WHEN t.buy_in_usd > 0 THEN (t.profit_usd / t.buy_in_usd) * 100 ELSE NULL END AS roi_pct
  FROM tournament_selector_logs l
  LEFT JOIN tournaments t ON (
    (t.external_id = l.tournament_external_id AND t.external_id IS NOT NULL)
    OR (
      t.user_id = l.user_id
      AND t.played_at BETWEEN l.created_at AND l.created_at + INTERVAL '14 days'
      AND ABS(EXTRACT(EPOCH FROM (t.played_at - l.scheduled_at)) / 3600) < 48
    )
  )
  WHERE l.event_type = 'add_to_grid'
    AND l.created_at >= NOW() - INTERVAL '90 days'  -- lookbackDays param
    AND t.grind_session_id IS NULL  -- §6.1
)
SELECT
  grade,
  COUNT(*) AS adds,
  COUNT(roi_pct) AS realized,
  AVG(roi_pct) AS realized_roi_pct
FROM adds_realized
GROUP BY grade
ORDER BY grade;
```

`lookbackDays` parametrizável (30/90/180).

### 2.3 `expectedRoiPct` heurístico

Tabela fixa derivada de mid-point das grade bands em ADR-015:

| Grade | Score range | Mid-point | expectedRoiPct |
|-------|-------------|-----------|----------------|
| S | 85-100 | 92.5 | +21.25% |
| A | 70-84 | 77 | +13.5% |
| B | 55-69 | 62 | +6% |
| C | 40-54 | 47 | -1.5% |
| D | 0-39 | 20 | -15% |

Fórmula: `expectedRoiPct = (mid_point - 50) * 0.5` (linear, derivado de `bucketScore = 50 + roi*2` em ADR-015 invertido).

`discrepancyPct = realizedRoiPct - expectedRoiPct`.

**Warnings:**
- `|discrepancy| > 5pp` E `adds >= 20` → `bucket_off_calibration_<grade>`.
- `realized_count < 5` em qualquer grade → `sample_low_in_grade_<grade>`.

### 2.4 `insufficientData` flag

Antes de devolver `buckets`, valida volume agregado:

```
if totalAdds < 50:
  return { insufficientData: true, currentVolume: totalAdds, requiredVolume: 50, lookbackDays }
else:
  return { lookbackDays, totalAdds, realizedAdds, buckets, generatedAt, warnings }
```

UI mostra: "Aguardando volume telemetria — atual N de 50 mínimo. Calibração estatística não é confiável abaixo deste limite."

### 2.5 Cache

`Map<lookbackDays, { data, expiresAt }>` em memória do endpoint, TTL 1h. Query agrega ~30-180d de logs + JOIN — peso ~50-200ms estimado em prod. Cache 1h é seguro porque calibração não muda intra-dia; founder abre 1x/semana no máximo.

Invalidação: implícita (TTL); explícita via `POST /api/admin/tournament-selector/calibration/invalidate` (admin only — defer Sprint 4 se necessário).

---

## 3. Admin gate

### 3.1 Endpoint

`GET /api/admin/tournament-selector/calibration?lookbackDays=90` protegido por:

```
requireAuth, requirePermission('admin_full')
```

**Sprint TS-3 fix HIGH-3:** gate primario eh `requirePermission('admin_full')` — o literal `'admin'` NAO esta em `auth.ts adminOnly[]`, entao cai em `hasFullAccess` e libera qualquer trial/active (bug). `'admin_full'` esta em `adminOnly[]` e bloqueia corretamente. Gate secundario (defense-in-depth) eh `isAdminUser` dentro do handler — preserva mesmo se permission middleware mudar futuramente.

### 3.2 Frontend gate

Rota `/admin/tournament-selector-calibration` montada apenas se `useUserRole().isAdmin === true`. Não-admin → redirect `/inicio` (padrão atual de outras rotas admin).

### 3.3 Telemetria de acesso

Cada acesso loga em `admin_access_log` **se a tabela existir** (introduzida no AI-1B opcionalmente). Skip silencioso se não existir (try/catch + console.warn, lesson #9). Não é blocker.

---

## 4. A11y — exception documentada

### 4.1 Escopo

Página admin uso restrito (1-3 users — founder + admins). Não está sujeita ao mesmo SLA WCAG AA detalhado das páginas públicas (`/coach-ai`, `/grade-planner`, `/grind-live`).

### 4.2 O que mantemos

- **Semantic table** (`<table>` + `<thead>`/`<tbody>` + `<th scope="col">`).
- **`sr-only` labels** em ícones de status (verde/vermelho discrepancy).
- **Keyboard navigation** via Tab default do browser (sem traps complexos — sem combobox/datepicker custom).
- **aria-label no toggle de lookback** (30/90/180 — `<button aria-pressed="...">`).

### 4.3 O que NÃO fazemos (exception)

- **NÃO** rodamos audit axe-core CI obrigatório nesta rota.
- **NÃO** suportamos screen reader edge cases (NVDA + JAWS + VoiceOver) — testado apenas no Chrome desktop.
- **NÃO** garantimos contraste WCAG AAA — usamos paleta `tokens.color.delta` (verde/vermelho/neutro do design system) sem ajuste extra.

### 4.4 Justificativa

Esforço de a11y completo para página admin de 1-3 usuários é desproporcional. Trade-off: acessibilidade básica suficiente para uso interno; SLA público aplicado apenas a rotas públicas. Documentar a exception evita "vibe debt" — desenvolvedor futuro sabe que essa rota tem standard reduzido **por decisão consciente**.

---

## 5. LGPD

**Agregação por grade NÃO expõe `userId`.** Query retorna `buckets[]` com counts e médias — nenhum row individual. Risco baixo.

**Exceção:** se warning `sample_low_in_grade_D` aparece com `adds=3`, technically inferible quem são os usuários (3 adds = ~1-3 users distintos). Mitigação: warning NÃO inclui userIds; só sinaliza low sample. Founder pode rodar query manual se quiser drill-down — autorizado fora do produto (DBA-light).

---

## 6. Alternativas Consideradas

### Alt A — Implementar só backend, UI later

Endpoint admin com response JSON, sem página frontend. Founder usa Postman/curl para auditar.

- **Pró:** menor superfície de UI, sem custo de a11y.
- **Contra:** fricção real do founder cresce — semanal/mensal não vai abrir Postman. Surface esquecida = decisão de calibração nunca acontece. **Rejeitado.**

### Alt B — Esperar volume antes de buildar

Adiar RF-05 para Sprint 4. Rodar Q1-Q5 manual quando volume crescer, decidir Sprint 4 com dados.

- **Pró:** evita "dashboard vazio" frustrating.
- **Contra:** UI pronta com `insufficientData` flag (Q-B) entrega valor zero hoje + valor total quando volume chegar — sem ciclo de espera. UI shippada sinaliza "estamos coletando, decisão vem". **Rejeitado em favor de Q-B locked.**

### Alt C — Persistir tabela agregada `tournament_selector_calibration_snapshots`

Cron diário pré-computa buckets e persiste. Endpoint só lê.

- **Pró:** zero custo de query em request.
- **Contra:** complexidade extra (cron + tabela nova + migration). Volume agregado é baixo; query bruta + cache 1h é suficiente. **Defer Sprint 4 se p95 estourar.** **Rejeitado para Sprint 3.**

### Alt D — Query bruta + cache TTL 1h + UI gated ✅ ESCOLHIDA

Implementação direta. Query JOIN com matching dual (externalId + heurística), cache em memória 1h, UI tabela simples com warnings.

- **Pró:** simples, sem migration, surface pronta para volume futuro, `insufficientData` flag absorve baixa amostra hoje.
- **Contra:** matching heurístico introduz ruído (documentado), cache fragmentado por replica multi-instance (aceitável — admin uso restrito, 1-3 users, 1 replica suficiente).

---

## 7. Consequências

### Positivas

- **Calibração estatística habilitada** para founder decidir trimestral.
- **Surface pronta hoje** com `insufficientData` flag — quando volume chegar, valor total destrancado sem refactor.
- **ADR-015 §165 (gatilho ML) habilitado** — métrica concreta (discrepancy por grade) substitui "achismo".
- **Zero migration** — feature shipa sem mexer em schema.
- **A11y exception documentada** — debt explícito, não silencioso.

### Negativas

- **Matching heurístico tem ruído** — torneios de library sem externalId entram via window 14d + 48h. False positives possíveis (mesmo nome + mesmo dia diferente jogador? — `user_id` no JOIN protege). Documentar na nota de cautela da UI.
- **Causalidade vs preditividade** — ROI realizado de adds tem viés de seleção. Founder lê com olho crítico (alert na UI explica).
- **Cache 1h não é write-through** — mudança de pesos de `scoringConstants.ts` requer invalidação manual ou reboot. Documentar em runbook.

### Neutras

- **Sem persistência de snapshots** — query roda fresh a cada acesso (1x/dia tipicamente). Aceitável para volume admin.
- **A11y reduzida (exception)** — explicit trade-off; rotas públicas mantêm SLA AA.

---

## 8. Verificação

- `tests/unit/admin/tournamentSelectorCalibration.test.ts` (server) — 3 cenários: (a) zero adds → `insufficientData=true`, (b) S sub-performando C → `warnings` populado, (c) calibração boa (discrepancy < 5pp em todas as grades).
- `tests/unit/admin/CalibrationDashboard.test.tsx` (client) — render + admin gate + `insufficientData` empty state + toggle lookback.
- `tests/integration/admin/calibrationCacheTtl.test.ts` — cache hit/miss + TTL expiry.
- Smoke manual: founder acessa `/admin/tournament-selector-calibration`, vê tabela ou "Aguardando volume", toggle 30/90/180 funciona.

## Confiança

**Média.** Query design + cache + admin gate + UI tabela são bem entendidos. Risco principal é **matching heurístico** introduzir ruído em correlações de library sem externalId — mitigação documentada. Risco secundário: volume insuficiente pode adiar valor real por 2-3 meses (Sprint 4-5 cycle). Aceitável dado custo cirúrgico.
