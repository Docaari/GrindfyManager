# Sprint F3 — Stats Analyzer

- Status: Spec aprovado (autonomo founder AFK)
- Data: 2026-04-29
- Branch: `feature/stats-analyzer`
- Modulo: Studies (`/studies`)
- Tier: pro+ (consistente com Coach tools)

## Visao geral

Aba "Stats Analyzer" em `/studies`. Usuario registra snapshots de stats HUD
(VPIP, PFR, 3Bet, etc.) extraidos do tracker (PokerTracker 4, Hold'em
Manager 3, ou outro). Permite layout customizavel + comparator entre
snapshots + Coach AI integration.

V1 (este sprint) = manual + 3 templates pre-built + Coach tool.
V2 (futuro) = OCR Claude Vision (popup print).
V3 (futuro) = OCR feedback loop + corrections.
V7 (futuro) = handhistory parser direto.

## Objetivos

1. Usuario ve aba "Stats Analyzer" em `/studies`.
2. Primeiro acesso: wizard escolhe template (PT4 / HM3 / Generic MTT).
3. Layout default seedado, snapshot exemplo opcional.
4. Editor manual: select layout → tabela editavel → save snapshot.
5. Lista historica de snapshots (filtravel por layout).
6. Layout customizer (CRUD secoes + stats com drag/drop).
7. Comparator: select 2 snapshots → diff lado-a-lado com setas verde/vermelho.
8. Coach AI: tool `read_user_hud_stats` retorna ultimo snapshot + delta vs
   media + benchmark populacional.

## Requisitos funcionais

### RF-01 — Tabs em /studies (mudanca minimal)

- Studies.tsx atual NAO tem `<Tabs>` — tem theme grid direto.
- W2 introduz `<Tabs>` wrapper. Tab default "Temas" preserva UI atual.
  Tab nova "Stats Analyzer" renderiza `StatsAnalyzerTab`.
- Path (`/studies?tab=stats`) opcional V1 — V2 wires URL state.

### RF-02 — Layouts

- 3 templates pre-built (D2):
  - **PokerTracker 4 Default**: VPIP, PFR, 3Bet, Fold to 3Bet, CBet Flop,
    Fold to CBet Flop, AF, WTSD, W$SD.
  - **Hold'em Manager 3 Default**: mesmo set + AGG%, BB/100, Steal%,
    Fold to Steal.
  - **Generic MTT**: VPIP, PFR, 3Bet, 4Bet, CBet F/T/R, Fold to CBet F/T/R,
    Donk%, Steal% (12 stats).
- Seeded uma vez por user no primeiro acesso a `/studies` (Stats Analyzer
  tab) via `seedDefaultLayouts(userId)`.
- Customizer permite criar layouts adicionais (CRUD).
- 1 layout default por user (constraint server-side).

### RF-03 — Snapshots

- Source enum: `manual` (V1) | `ocr-v2` (futuro) | `handhistory` (futuro).
- Editor: dropdown layout → tabela editavel (1 row por stat) → save.
- Validacao: numbers only, range 0-100 default (override por StatField).
- Decimal places enforced no input mask (default 1).
- `sampleSize`, `sessionId`, `notes` opcionais.

### RF-04 — Lista historica

- Lista descendente por `capturedAt`.
- Filtro por `layoutId` (dropdown).
- Cada item mostra: capturedAt + layoutName + sampleSize (se houver) +
  preview de 3-4 stats principais (do layout).
- Click → abre comparator pre-selecionando snapshot.

### RF-05 — Layout customizer

- CRUD: criar layout, renomear, deletar (confirm), set default.
- Editor: add section, drag stats entre sections, edit StatField
  (label, decimals, suffix, min/max, group), remover stat.
- Slug `key` snake_case auto-gerado a partir do label, editavel manualmente
  com validacao (nao colidir, snake_case enforced).

### RF-06 — Comparator

- Modal/page select 2 snapshots (mesmo layout obrigatorio V1).
- Render lado-a-lado: 3 colunas (stat | snapshot A | snapshot B + delta).
- Setas: verde (delta favoravel — depende de stat: VPIP delta < 0 = melhor
  estilo TAG; AF delta > 0 = mais agressivo, neutro). V1 simplifica:
  delta verde se aumentou, vermelho se diminuiu, cinza neutro. Coach pode
  interpretar nuances.
- Sem grafico (Recharts nao usado V1).

### RF-07 — Coach tool

- Vide ADR-052.

### RF-08 — Wizard primeiro uso

- Modal welcome quando usuario abre Stats Analyzer pela primeira vez (zero
  layouts no DB).
- Step 1: select template (3 cards).
- Step 2: opcional preencher 1 snapshot exemplo.
- Trigger: `seedDefaultLayouts` no backend; client detecta `layouts.length
  === 0` e abre wizard.

## Requisitos nao-funcionais

### RNF-01 — Mobile

- Snapshot editor scroll vertical 1-coluna em <640px.
- Comparator vira accordion stacked em <640px.

### RNF-02 — i18n

- UI PT-BR (CLAUDE.md).
- Stat labels em ingles (padrao industria — VPIP, PFR sao siglas universais).
- Layout names em PT-BR ("Padrao PT4", "Padrao HM3", "MTT Generico").

### RNF-03 — Tier

- pro+ apenas (free vê paywall ou redirect — pattern consistente com
  AccessDenied do Studies).

### RNF-04 — Telemetry

- NAO instrumentar metricas custom F3 (R10).
- Reusar pattern existente em Studies se houver `track()` chamadas.

## Endpoints

| Method | Path | Descricao |
|--------|------|-----------|
| POST | /api/hud-layouts | Cria layout |
| GET | /api/hud-layouts | Lista layouts do user |
| PUT | /api/hud-layouts/:id | Atualiza (nome, sections, isDefault) |
| DELETE | /api/hud-layouts/:id | Remove |
| POST | /api/hud-stat-snapshots | Cria snapshot |
| GET | /api/hud-stat-snapshots?layoutId= | Lista (filtro opcional) |
| GET | /api/hud-stat-snapshots/:id | Detail |
| DELETE | /api/hud-stat-snapshots/:id | Remove |
| POST | /api/hud-stat-snapshots/compare | Body `{ ids: [a, b] }` retorna diff |

## Schema (resumo — detalhe ADR-051)

```sql
CREATE TABLE hud_layouts (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  name varchar NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sections jsonb NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX idx_hud_layouts_user ON hud_layouts(user_id);
CREATE UNIQUE INDEX uq_hud_layouts_default
  ON hud_layouts(user_id) WHERE is_default = true;

CREATE TABLE hud_stat_snapshots (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  layout_id varchar NOT NULL REFERENCES hud_layouts(id) ON DELETE CASCADE,
  captured_at timestamp NOT NULL DEFAULT now(),
  source varchar(16) NOT NULL DEFAULT 'manual',
  values jsonb NOT NULL,
  sample_size integer,
  session_id varchar REFERENCES grind_sessions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX idx_hud_snapshots_user_layout
  ON hud_stat_snapshots(user_id, layout_id, captured_at DESC);
```

## Wave plan

| Wave | Output | Commit |
|------|--------|--------|
| W0 | ADRs 051+052, spec, diagrama | `docs(studies): F3 stats analyzer ADR + spec + diagrama` |
| W1 | schema + endpoints + storage + tests | `feat(studies): F3 W1 — schema + endpoints stats analyzer` |
| W2 | UI manual snapshot editor + tabs wrapper | `feat(studies): F3 W2 — UI manual snapshot editor` |
| W3 | layout customizer + comparator | `feat(studies): F3 W3 — layout customizer + comparator` |
| W4 | templates + wizard + Coach tool | `feat(studies): F3 W4 — templates + wizard + Coach tool integration` |
| W5 | simplify + reviewer + E2E + memory | `refactor(studies): F3 W5 — simplify + review + E2E test + memory` |

## Decisoes autonomas registradas (founder AFK)

| ID | Decisao | Razao |
|----|---------|-------|
| DA-1 | Studies.tsx ganha `<Tabs>` wrapper (NAO existia) | Spec mencionou "tabs atuais — NAO quebrar" mas elas nao existem; minimo viavel preservando UI atual |
| DA-2 | Migration = 0013 mesmo sem F2 (0012) merged | Founder reservou 0013 explicitamente; F2 reserva 0012 |
| DA-3 | benchmark populacional estatico V1 | Sem amostra Grindfy ainda; ranges publicos PT4 default |
| DA-4 | Comparator delta verde=up red=down cinza=neutro V1 | Spec nao define quais stats "favoravel up"; simplificacao defensavel; Coach pode interpretar |
| DA-5 | `sessions` FK ON DELETE SET NULL | sessao apagada nao deve apagar snapshot HUD historico |

## Riscos / debt

- DEBT-1: stat semantics (VPIP up = bad pra TAG; AF up = neutro) nao
  modelada V1. Comparator usa delta cru. V2 introduz `StatField.direction`
  ('higher_better' | 'lower_better' | 'neutral').
- DEBT-2: benchmark estatico nao varia por buyin/format. V2 melhora.
- DEBT-3: layout customizer nao versiona snapshots historicos quando stats
  removidas. V1 mostra "—" no comparator. V2 considera version pinning.
