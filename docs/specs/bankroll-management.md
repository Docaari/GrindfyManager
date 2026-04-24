# Spec: Bankroll Management (Sprint 2)

## Status
Aprovada (2026-04-24) — pronta para arquitetura

## Decisoes do Founder (Q1-Q10 respondidas em 2026-04-24)
- **Q1** Tolerancia: **hardcoded 1.5x** (sem novo campo em user_settings)
- **Q2** Regra custom:X: aceita **fracionario com 1 casa decimal** (ex: 3.5)
- **Q3** Snapshot automatico ao finalizar sessao de Grind: **NAO no MVP**
- **Q4** (backlog) Quando DELETE for implementado: **hard delete com recompute** (nao soft)
- **Q5** Warning 10% da banca: **por sessao** (estado em memoria; reseta ao fim da sessao)
- **Q6** Banca negativa: **permite com warning** (nao bloqueia)
- **Q7** DELETE de snapshot: **fora do MVP** (so visualiza e edita nota)
- **Q8** Tolerancia na UI: **letra miuda** ("shot permitido ate $X (1.5x)")
- **Q9** Widget Dashboard sem banca: **mostra com CTA** para Settings
- **Q10** Rate limit POST /api/bankroll/snapshot: **10/min**

## Resumo
Modulo de gestao de banca (bankroll) em USD para jogadores MTT, ativando o filtro latente do Tournament Selector (Sprint 1) e adicionando: configuracao em Settings, regras parametricas (1%/2%/5%/custom), historico de evolucao com snapshots, alertas durante Grind Live e widget no Dashboard. Bankroll e sempre armazenado e comparado em USD; buy-ins em BRL/EUR/outras sao normalizados via `currencyNormalizer` ja existente.

## Contexto
**Posicao no roadmap:** Sprint 2 (ICE 7.7) aprovado em 2026-04-23 e confirmado no pivot de 2026-04-24 (Sprints 3 e 4 cancelados; founder prefere aprofundar Selector + Bankroll).

**Por que agora:**
1. Schema ja existe (`user_settings.bankroll_amount` DECIMAL nullable, `user_settings.bankroll_rule` VARCHAR DEFAULT '1pct') e aplicado na migracao `0001_sprint1_tournament_selector.sql`.
2. Tournament Selector ja tem logica `bankrollThreshold()` e filtro funcional (`bankrollFilter=true`), mas com `bankrollConfigured: false` em 100% dos usuarios porque a UI nunca foi criada.
3. Gap competitivo: Lobbyze e SharkScope tem bankroll parcial; HM3/PT4 tem dedicado. Posicionamento "Grindfy gerencia, nao so trackeia" depende desta feature.
4. Pain point #1 em comunidade BR de MTT (bankroll management = motivo #1 de abandono de profissionalizacao).

**Premissas herdadas do Sprint 1 (NAO renegociaveis):**
- Bankroll SEMPRE em USD. Conversao de buy-ins acontece no ponto de comparacao.
- Regra atual `bankrollThreshold = amount * pct * 1.5` (tolerancia 1.5x ja aplicada no selector).
- Exchange rates vem de `user_settings.exchangeRates` (JSONB) com fallback para `DEFAULT_EXCHANGE_RATES`.
- UI em PT-BR. Terminologia: "banca" para bankroll, "regra de BR" para rule, "entrada (buy-in)" para buy-in.

## Usuarios

- **Jogador iniciante (<50 torneios, banca pequena):** Abre Settings, define banca (ex: $500), escolhe regra `1pct`. Sistema passa a filtrar Tournament Selector automaticamente e avisar em Grind Live se ele tentar jogar torneio acima de $7.50 ($500 x 1% x 1.5).
- **Jogador intermediario (shots calculados):** Define banca com regra `2pct` ou `custom:3` para permitir shots. Usa widget do Dashboard para ver evolucao mensal e decidir quando subir de limite.
- **Jogador profissional (BR grande, disciplinado):** Usa `1pct` estrito, registra aportes/saques manualmente, consulta historico mensal para separar resultados de sessao vs movimentos externos.
- **AI Coach (consumidor secundario):** A persona "Bankroll Coach" (futura) pode ler `bankrollSnapshot` atual + historico para responder "estou jogando acima da minha banca?".

## Requisitos Funcionais

### RF-01: Endpoint `GET /api/bankroll`

**Descricao:** Retorna o estado atual da banca do usuario + regra configurada + metadados derivados (maxBuyIn, status de configuracao).

**Auth:** JWT (`requireAuth`).

**Response (200):**
```json
{
  "configured": true,
  "amount": 1000.00,
  "currency": "USD",
  "rule": "1pct",
  "rulePct": 1.0,
  "tolerance": 1.5,
  "maxBuyInUSD": 15.00,
  "maxBuyInDisplay": { "USD": 15.00, "BRL": 75.00 },
  "lastUpdatedAt": "2026-04-24T18:00:00-03:00",
  "snapshotCount": 37
}
```

Quando nao configurado:
```json
{
  "configured": false,
  "amount": null,
  "rule": "1pct",
  "maxBuyInUSD": null,
  "lastUpdatedAt": null,
  "snapshotCount": 0
}
```

**Regras de negocio:**
- `configured = true` se `bankrollAmount != null && bankrollAmount > 0`.
- `rulePct` derivado de `rule`:
  - `"1pct"` → 1.0, `"2pct"` → 2.0, `"5pct"` → 5.0
  - `"custom:X"` → X (float, validado 0.1-20.0)
- `maxBuyInUSD = amount * (rulePct / 100) * tolerance`. Tolerancia hardcoded em 1.5 no MVP (mesmo valor usado pelo selector). Exposto no response para o frontend exibir "voce pode jogar ate 1.5x do limite base".
- `maxBuyInDisplay` inclui conversao para BRL (usando `exchangeRates.BRL` ou DEFAULT). Extensivel para outras moedas presentes em `preferredCurrency`.
- `snapshotCount` e o numero de entradas em `bankroll_snapshots` do usuario (RF-04).
- `lastUpdatedAt` vem de `user_settings.updated_at`.

**Criterios de aceitacao:**
- [ ] Sem auth → 401.
- [ ] Usuario sem bankroll configurado → `configured: false` e campos derivados null.
- [ ] Usuario com bankroll e rule `1pct` → `maxBuyInUSD = amount * 0.015`.
- [ ] Usuario com rule `custom:3` → `rulePct: 3.0` e `maxBuyInUSD = amount * 0.045`.
- [ ] Usuario com rule `invalid` → fallback para `1pct` e warning log (nao erro 500).

---

### RF-02: Endpoint `PUT /api/bankroll`

**Descricao:** Atualiza banca e/ou regra. Cria entrada em `bankroll_snapshots` (RF-04) automaticamente se `amount` mudou.

**Auth:** JWT.

**Rate limit:** 10 req/min (evitar spam; usuario normal altera raramente).

**Body:**
```json
{
  "amount": 1500.00,
  "rule": "2pct",
  "reason": "deposit",
  "note": "PIX R$ 2500 transferido"
}
```

**Regras de negocio:**
- `amount`: numero >= 0 em USD. `null` permitido (desconfigura banca).
- `rule`: string validada contra regex `^(1pct|2pct|5pct|custom:\d+(\.\d+)?)$`. Invalidos → 400.
- Para `custom:X`, `X` deve estar em [0.1, 20.0]. Fora do range → 400 com mensagem "Custom rule deve estar entre 0.1% e 20%".
- `reason`: enum `deposit | withdrawal | session_result | manual_adjustment | initial`. Obrigatorio quando `amount` muda e ja existe banca configurada. Se primeira configuracao, forca `initial`.
- `note`: string opcional, max 500 chars.
- Se `amount` nao mudou mas `rule` sim, NAO cria snapshot — apenas atualiza `user_settings`.
- Se `amount` mudou (incluindo de null para valor), cria snapshot com `delta = newAmount - previousAmount` (primeira vez: `delta = amount`, `previousAmount = 0`).
- Invalidacao de cache do Tournament Selector do usuario (chave `userId`) — proxima chamada recomputa filtro.

**Response (200):** Mesmo shape do RF-01 apos atualizacao.

**Criterios de aceitacao:**
- [ ] `PUT` com `amount: 1000, rule: "1pct"` em usuario novo → cria snapshot `initial` com delta +1000.
- [ ] `PUT` com `rule: "2pct"` sem mudar amount → atualiza settings, NAO cria snapshot.
- [ ] `PUT` com `amount: null` em usuario configurado → desconfigura (settings.bankrollAmount = null), cria snapshot `manual_adjustment` com delta negativo total.
- [ ] `PUT` com `rule: "custom:0.05"` → 400 (fora do range).
- [ ] `PUT` com `rule: "custom:25"` → 400.
- [ ] `PUT` sem `reason` em usuario ja configurado que muda amount → 400 "reason obrigatorio".
- [ ] `PUT` sem auth → 401.
- [ ] 11a chamada em 60s → 429.

---

### RF-03: Endpoint `POST /api/bankroll/snapshot`

**Descricao:** Cria snapshot manual (aporte, saque, ajuste). Endpoint separado do `PUT` porque conceitualmente e um "movimento financeiro" e nao "atualizar configuracao". Permite registrar snapshot SEM alterar a configuracao de `rule`.

**Auth:** JWT.

**Body:**
```json
{
  "delta": 500.00,
  "reason": "deposit",
  "note": "Aporte de sessao ao vivo",
  "occurredAt": "2026-04-24T15:30:00-03:00"
}
```

**Regras de negocio:**
- `delta` em USD, pode ser negativo (saque). Nao pode ser 0.
- `reason`: enum `deposit | withdrawal | session_result | manual_adjustment`. NAO permite `initial` aqui (so RF-02).
- `occurredAt`: ISO string, default `now()`. Permite registrar retroativamente mas NAO no futuro (>now → 400).
- Calcula `newAmount = currentAmount + delta`. Se `newAmount < 0`, aceita (banca zerada ou negativa = bust), mas loga warning.
- Atualiza `user_settings.bankrollAmount = newAmount`.
- Cria entrada em `bankroll_snapshots`.
- Invalida cache do selector.

**Response (201):**
```json
{
  "snapshot": { /* ver RF-04 shape */ },
  "bankroll": { /* shape do RF-01 atualizado */ }
}
```

**Criterios de aceitacao:**
- [ ] `POST` com `delta: 500, reason: "deposit"` em banca de 1000 → nova banca 1500, snapshot criado.
- [ ] `POST` com `delta: -300, reason: "withdrawal"` em banca de 1000 → nova banca 700.
- [ ] `POST` com `delta: 0` → 400.
- [ ] `POST` com `occurredAt` no futuro → 400.
- [ ] `POST` sem banca configurada → 409 "Configure a banca antes de registrar movimentos".
- [ ] `POST` que leva banca a negativo → aceita, mas inclui `warning: "bankroll_negative"` no response.

---

### RF-04: Endpoint `GET /api/bankroll/history`

**Descricao:** Retorna historico de snapshots com paginacao e agregacoes para grafico de evolucao.

**Query params:**
| Param | Tipo | Default | Descricao |
|---|---|---|---|
| `from` | ISO date | 90 dias atras | Inicio da janela |
| `to` | ISO date | hoje | Fim da janela |
| `granularity` | enum `day\|week\|month` | `day` | Agrupamento para serie temporal |
| `reason` | csv de enums | todos | Filtra por tipo de movimento |
| `limit` | int | 100 | Max 500 |
| `offset` | int | 0 | Paginacao |

**Auth:** JWT.

**Response (200):**
```json
{
  "snapshots": [
    {
      "id": "nano_id",
      "occurredAt": "2026-04-24T15:30:00-03:00",
      "delta": 500.00,
      "previousAmount": 1000.00,
      "newAmount": 1500.00,
      "reason": "deposit",
      "note": "Aporte de sessao ao vivo",
      "source": "manual"
    }
  ],
  "series": [
    { "bucket": "2026-04-24", "balance": 1500.00, "movements": 1, "delta": 500.00 }
  ],
  "summary": {
    "totalDeposits": 2500.00,
    "totalWithdrawals": 300.00,
    "totalSessionPnL": 127.50,
    "totalManualAdjustments": 0,
    "netChange": 2327.50,
    "startBalance": 500.00,
    "endBalance": 2827.50
  },
  "pagination": { "total": 37, "limit": 100, "offset": 0 }
}
```

**Regras de negocio:**
- `series[].balance` = saldo ao FINAL do bucket (last snapshot value).
- `series` preenchida para TODOS os buckets do range mesmo sem movimento (forward-fill do ultimo balance).
- `summary.totalSessionPnL` soma deltas com `reason="session_result"`.
- Cache em memoria por `(userId, from, to, granularity, reason)` TTL 5min.

**Criterios de aceitacao:**
- [ ] Sem banca configurada → retorna estrutura vazia (`snapshots: []`, `series: []`, `summary` com zeros).
- [ ] `granularity=week` agrupa por semana ISO.
- [ ] `reason=deposit,withdrawal` filtra apenas esses dois tipos.
- [ ] `from` > `to` → 400.
- [ ] `limit > 500` → capa em 500.
- [ ] Serie tem bucket para cada dia mesmo sem movimento (forward-fill).

---

### RF-05: Tabela `bankroll_snapshots`

**Descricao:** Nova tabela Drizzle para historico de movimentos de banca.

**Schema (shared/schema.ts):**
```typescript
export const bankrollSnapshots = pgTable("bankroll_snapshots", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  delta: decimal("delta").notNull(),           // pode ser negativo; sempre em USD
  previousAmount: decimal("previous_amount").notNull(),
  newAmount: decimal("new_amount").notNull(),
  reason: varchar("reason").notNull(),         // enum string, validado no app
  note: text("note"),
  source: varchar("source").notNull().default("manual"), // manual | auto_session | auto_import
  sessionId: varchar("session_id"),             // FK opcional para grind_sessions
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Indices:** `(userId, occurredAt DESC)` para queries de historico.

**Regras:**
- Source `auto_session` reservado para integracao com Grind Live (RF-08, opcional no MVP — decidir em Q3).
- Source `auto_import` reservado para futura derivacao a partir de uploads de torneios (nao no MVP).

**Criterios:**
- [ ] Tabela criada via `db:push` com FK cascade em user.
- [ ] Indice `idx_bankroll_snapshots_user_occurred` criado.
- [ ] `insertBankrollSnapshotSchema` (Zod) exportado validando enum de `reason`.

---

### RF-06: UI Settings — Secao "Banca (Bankroll)"

**Descricao:** Nova secao em `client/src/pages/Settings.tsx` abaixo de "Taxas de Cambio". Primeiro ponto de entrada do jogador para configurar banca.

**Componentes:**
- Input numerico "Sua banca atual (USD)" com formatter de moeda.
- Display derivado "Equivalente em BRL: R$ X,XX" (read-only, usa `exchangeRates.BRL`).
- Select "Regra de gestao":
  - `1% (conservador - 150 buy-ins)` → value `1pct`
  - `2% (moderado - 75 buy-ins)` → value `2pct`
  - `5% (agressivo - 30 buy-ins)` → value `5pct`
  - `Personalizado` → abre input numerico 0.1-20.0
- Display derivado "Buy-in maximo recomendado: $XX.XX (R$ YYY,YY)" atualiza em tempo real.
- Botao "Salvar banca" (desabilitado sem mudanca). Ao salvar, se e primeira configuracao, chama `PUT /api/bankroll` com `reason: "initial"`. Se ja configurado e amount mudou, abre dialog pedindo `reason` e `note`.
- Botao "Registrar aporte/saque" abre dialog separado (usa `POST /api/bankroll/snapshot`).
- Link "Ver historico completo" leva para `/bankroll-history` (RF-07).

**Regras de UX:**
- Explicacao contextual: "Sua banca deve estar sempre em USD. Buy-ins em outras moedas sao convertidos usando as taxas configuradas acima."
- Se `preferredCurrency === "BRL"`, input principal ainda e USD mas display secundario BRL e destaque visual.
- Tolerancia 1.5x nao e exposta na UI do MVP (complexidade) — appears como letra miuda "Inclui tolerancia de 50% para shots pontuais".

**Criterios:**
- [ ] Secao aparece abaixo de "Taxas de Cambio" em Settings.
- [ ] Input aceita somente numero positivo (validacao frontend + backend).
- [ ] Mudar regra atualiza "Buy-in maximo" em tempo real sem chamar API.
- [ ] Salvar com amount mudado sem reason abre dialog.
- [ ] Toast de sucesso apos salvar.
- [ ] Toast de erro se validacao backend falhar.
- [ ] Estado inicial (null) mostra CTA em destaque "Configure sua banca para ativar recomendacoes personalizadas".

---

### RF-07: Pagina `/bankroll` (Historico + Widget Principal)

**Descricao:** Nova pagina em `client/src/pages/Bankroll.tsx` com:
1. Header com banca atual (grande, USD + equivalente BRL), regra, maxBuyIn.
2. Grafico de evolucao (line chart Recharts) com serie de `series[].balance`. Filtros: 30d / 90d / 1ano / tudo.
3. Tabela de movimentos (paginada) com colunas: data, tipo, delta, saldo, nota, acoes (editar nota, deletar — so manual/deposit/withdrawal).
4. Cards de resumo: total aportado, total sacado, P&L de sessoes, variacao liquida.
5. Botao flutuante "Registrar movimento" (abre mesmo dialog do Settings).

**Rota:** Adicionar em `client/src/App.tsx` protegida por auth. Item no Sidebar na secao "Ferramentas" com icone `Wallet` (lucide-react).

**Criterios:**
- [ ] Rota `/bankroll` renderiza sem erro mesmo sem banca configurada (mostra empty state com CTA para Settings).
- [ ] Grafico renderiza com dados reais de `/api/bankroll/history`.
- [ ] Mudar filtro de periodo refetch com `from` ajustado.
- [ ] Deletar movimento abre confirmacao. `DELETE /api/bankroll/snapshot/:id` (RF ausente no escopo MVP — Q7).

---

### RF-08: Alerta em Grind Live ao adicionar torneio acima da regra

**Descricao:** Em `GrindSessionLive.tsx`, quando usuario adiciona um torneio na sessao (Suprema, biblioteca, ou manual), sistema compara `tournament.buyIn` (normalizado para USD) com `bankroll.maxBuyInUSD` e dispara alerta se exceder.

**Trigger:** Form de "Adicionar torneio" (existente) — hook no submit.

**Comportamento:**
- Se `buyInUSD > maxBuyInUSD` E `bankroll.configured`:
  - Mostra modal de confirmacao com:
    - Titulo: "Torneio acima da sua regra de banca"
    - Body: "Este torneio custa $X (R$ Y), mas sua regra atual (Z% de $AMOUNT) limita a $MAXBUYIN. Quer registrar mesmo assim?"
    - Botoes: "Cancelar" (default) / "Registrar como shot" (confirma)
- Se confirmar, registra torneio normalmente E cria snapshot com reason `session_result` + note automatica "Shot acima da regra de banca" (FLAG no metadata — nao e movimento de banca, apenas historico).
- Se `bankroll.configured === false`, nao dispara (feature transparente).

**Regra adicional — acumulado de sessao:**
- Durante a sessao, mantem contador de `totalBuyInsToday` (soma de todos os torneios registrados na sessao em andamento, em USD).
- Se `totalBuyInsToday + novoBuyIn > bankroll.amount * 0.10` (10% da banca em uma sessao — constante `SESSION_BANKROLL_WARNING_PCT`), dispara alerta SEPARADO (warning amarelo, nao bloqueante): "Voce ja exposto 12% da banca hoje".
- Constante 10% e derivada da pratica comum; deixar exportada para ajuste futuro.

**Criterios:**
- [ ] Adicionar torneio dentro da regra → sem modal, registra direto.
- [ ] Adicionar torneio acima da regra com banca configurada → modal aparece.
- [ ] Cancelar no modal → torneio NAO e registrado.
- [ ] Confirmar "shot" → torneio registrado com flag `aboveBankrollRule: true`.
- [ ] Banca nao configurada → modal nunca aparece.
- [ ] Torneio em BRL (Suprema) com banca USD → comparacao feita apos normalizacao.
- [ ] Acumulado >10% da banca → warning amarelo (toast persistente, nao bloqueante).

---

### RF-09: Widget Bankroll no Dashboard

**Descricao:** Novo card no topo de `client/src/pages/Dashboard.tsx` (ou em grid de metricas) exibindo:
- Banca atual (USD + BRL equivalente)
- Variacao no periodo selecionado do Dashboard (delta e %)
- Mini-sparkline dos ultimos 30d (ou periodo do filtro)
- ROI sobre a banca: `(lucroAcumulado / bancaInicial) * 100` no periodo
- Projecao mensal: `bancaAtual * (1 + roiMedio30d / 100)^1` exibida como "Se mantiver ROI de X%, banca projetada em 30d: $Y".

**Data source:** `/api/bankroll/history?from=<dashboardFrom>&to=<dashboardTo>&granularity=day`.

**Comportamento:**
- Se banca nao configurada, card mostra CTA "Configure sua banca para acompanhar evolucao" linkando para Settings.
- Filtros do Dashboard (periodo) sincronizam com o widget.

**Criterios:**
- [ ] Card aparece no topo do Dashboard.
- [ ] Valores atualizam ao mudar filtro de periodo do Dashboard.
- [ ] Sparkline renderiza com series reais.
- [ ] Projecao calculada apenas se ROI30d > 0 (senao exibe "Foco em estabilizar a variacao").
- [ ] Empty state para banca nao configurada.

---

### RF-10: Integracao com Tournament Selector

**Descricao:** Remover o workaround `bankrollConfigured: false` em 100% dos casos e fazer o Selector respeitar de fato a configuracao do usuario. Adicionar novo warning `out_of_bankroll_soft` quando torneio esta entre `maxBuyIn` (1x rule) e `maxBuyIn * tolerance` (1.5x).

**Mudancas no endpoint existente `/api/tournament-selector`:**
- Quando `bankrollFilter=true` E banca configurada: filtra conforme regra atual (ja implementado).
- **NOVO:** Quando `bankrollFilter=false` mas banca configurada: adiciona warning `out_of_bankroll` em torneios acima de `maxBuyIn * tolerance` (hard) e `out_of_bankroll_soft` entre `maxBuyIn` e `maxBuyIn * tolerance` (soft/shot).
- Response inclui `bankrollConfigured: true` e novo campo `bankrollThresholdUSD` (para UI exibir linha de corte no grafico).

**Regra:**
- `hardLimit = amount * rulePct * 1.5` (ja existente como `bankrollThreshold()`).
- `softLimit = amount * rulePct * 1.0` (novo; sem tolerancia).
- Torneio com `buyInUSD > hardLimit` → warning `out_of_bankroll` + filtrado se `bankrollFilter=true`.
- Torneio com `softLimit < buyInUSD <= hardLimit` → warning `out_of_bankroll_soft` (sempre passa pelo filtro, e "shot permitido").
- Torneio com `buyInUSD <= softLimit` → sem warning.

**Criterios:**
- [ ] Banca configurada USD $500, rule 1pct: torneio de $7 sem warning; torneio de $9 warning soft; torneio de $20 warning hard e filtrado se filter ativo.
- [ ] Response inclui `bankrollThresholdUSD: 7.50` e `bankrollHardLimitUSD: 11.25` quando configurado.
- [ ] Todos os testes existentes do selector continuam passando (regressao).

---

### RF-11: Migracao `0002_sprint2_bankroll_snapshots.sql`

**Descricao:** Criar tabela `bankroll_snapshots` + indices.

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS bankroll_snapshots (
  id VARCHAR PRIMARY KEY NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  delta DECIMAL NOT NULL,
  previous_amount DECIMAL NOT NULL,
  new_amount DECIMAL NOT NULL,
  reason VARCHAR NOT NULL,
  note TEXT,
  source VARCHAR NOT NULL DEFAULT 'manual',
  session_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_user_occurred
  ON bankroll_snapshots (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_user_reason
  ON bankroll_snapshots (user_id, reason);
```

**Criterios:**
- [ ] `npm run db:push` aplica sem erro.
- [ ] Script `scripts/verify-sprint2-schema.mjs` valida existencia da tabela e indices.

---

## Requisitos Nao-Funcionais

- **Performance:** `GET /api/bankroll` < 50ms p95; `GET /api/bankroll/history` com 500 snapshots < 200ms p95.
- **Consistencia:** Operacoes que mudam `amount` + criam snapshot DEVEM ser transacionais (`db.transaction`). Snapshot sem amount atualizado viola invariante.
- **Auditoria:** Todo snapshot mantem `previousAmount` e `newAmount` redundantemente para permitir auditoria sem depender de ordem temporal (robustez contra clock skew).
- **Seguranca:** Usuario so consegue ler/escrever proprios snapshots (check de `userId` em toda query).
- **Cache:** Mudanca de banca invalida cache do Tournament Selector do usuario. Cache de `/api/bankroll/history` TTL 5min.
- **Idempotencia:** `POST /api/bankroll/snapshot` NAO e idempotente (intencionalmente — deposit duplicado cria 2 snapshots). Cliente deve evitar double-submit.

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | `/api/bankroll` | Estado atual da banca + regra + maxBuyIn | JWT |
| PUT | `/api/bankroll` | Atualiza amount e/ou rule | JWT |
| POST | `/api/bankroll/snapshot` | Registra movimento (aporte/saque/ajuste) | JWT |
| GET | `/api/bankroll/history` | Historico de snapshots + serie + resumo | JWT |
| DELETE | `/api/bankroll/snapshot/:id` | Deleta snapshot (so manual; Q7 decide se entra no MVP) | JWT |

Rate limit: 10 req/min por endpoint nao-GET (bankrollLimiter dedicado).

---

## Modelos de Dados Afetados

### `user_settings` (ja existente, sem alteracao de schema)
Campos ja existentes e usados: `bankrollAmount` (decimal nullable USD), `bankrollRule` (varchar default '1pct'), `exchangeRates` (jsonb).

### `bankroll_snapshots` (NOVA)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK | nanoid |
| userId | varchar | FK users.userPlatformId ON DELETE CASCADE | Indexado |
| occurredAt | timestamp | not null, default now | Timestamp do movimento |
| delta | decimal | not null | USD, pode ser negativo |
| previousAmount | decimal | not null | Snapshot do saldo antes |
| newAmount | decimal | not null | Snapshot do saldo depois |
| reason | varchar | not null | enum: initial/deposit/withdrawal/session_result/manual_adjustment |
| note | text | nullable | Max 500 chars (validacao app) |
| source | varchar | not null, default 'manual' | manual/auto_session/auto_import |
| sessionId | varchar | nullable | FK opcional para grind_sessions |
| createdAt | timestamp | default now | Auditoria |

---

## Integracoes Externas
Nenhuma. Toda a feature opera sobre dados proprios. Sem Stripe, sem Nodemailer, sem APIs de terceiros.

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] Configurar banca pela primeira vez → snapshot `initial` criado.
- [ ] Atualizar rule sem mudar amount → sem snapshot.
- [ ] Registrar aporte → banca sobe, snapshot criado.
- [ ] Registrar saque → banca desce, snapshot criado.
- [ ] Consultar historico 30d → retorna snapshots + serie diaria + summary.
- [ ] Adicionar torneio dentro da regra em Grind Live → sem alerta.
- [ ] Dashboard mostra widget com banca atualizada.
- [ ] Tournament Selector filtra torneios acima da regra.

### Validacao de Input
- [ ] `PUT /api/bankroll` com amount negativo → 400.
- [ ] `PUT /api/bankroll` com rule invalida → 400.
- [ ] `PUT /api/bankroll` com `custom:0.05` (abaixo do min) → 400.
- [ ] `PUT /api/bankroll` com `custom:25` (acima do max) → 400.
- [ ] `POST /api/bankroll/snapshot` com delta=0 → 400.
- [ ] `POST /api/bankroll/snapshot` com occurredAt futuro → 400.
- [ ] `PUT` sem reason em banca ja configurada que muda amount → 400.

### Regras de Negocio
- [ ] Mudar amount em transacao: se falha em criar snapshot, NAO persiste mudanca em user_settings (atomic).
- [ ] Deletar usuario remove todos os snapshots (cascade).
- [ ] Banca em USD com buy-in BRL em Grind Live normaliza corretamente via exchangeRates.
- [ ] Rule `custom:3.5` calcula maxBuyIn = amount * 0.035 * 1.5.
- [ ] Tournament Selector respeita banca configurada (remove workaround).

### Edge Cases
- [ ] Usuario sem `exchangeRates.BRL` definido → fallback para `DEFAULT_EXCHANGE_RATES.BRL`.
- [ ] Banca chega a 0 (bust) → aceita, widget exibe "Banca zerada".
- [ ] Banca chega a negativo (overdraft conceitual) → aceita com warning.
- [ ] 1000+ snapshots no historico → paginacao funciona, query usa indice.
- [ ] Request simultaneo para `POST /snapshot` com mesmo delta → cria DOIS snapshots (intencional, nao-idempotente).
- [ ] Usuario com bankroll null chama `GET /api/bankroll/history` → retorna estrutura vazia sem erro.
- [ ] Torneio com currency nula em Grind Live → trata como USD (comportamento existente do normalizer).
- [ ] Alterar `preferredCurrency` nao afeta `bankrollAmount` (sempre USD).

### Regressao
- [ ] Todos os testes de Tournament Selector continuam passando apos remocao do workaround `bankrollConfigured: false`.
- [ ] Teste `tests/integration/api/tournament-selector.test.ts:337` "bankroll nao cadastrado" continua passando para usuario sem banca.
- [ ] Upload de CSV nao deve gerar snapshots automaticos (source `auto_import` reservado para futuro, NAO implementar no MVP).

---

## Fora de Escopo

- **Deducao automatica de P&L por sessao:** Criar snapshot automatico ao finalizar sessao de Grind. FICA FORA do MVP (Q3 abaixo). Se implementar, usar `source: auto_session` + flag de feature.
- **Multi-bankroll:** Usuario com bankrolls separadas por rede/moeda. NAO. MVP suporta 1 banca em USD por usuario.
- **Suporte a outras moedas como base:** Banca SEMPRE em USD. Permitir BRL como base adicionaria 2x complexidade de conversao.
- **Metas de crescimento (goal setting):** Ja cancelado no pivot de 2026-04-24. Fora.
- **Sharing de evolucao da banca (stories):** Ja cancelado. Fora.
- **ICM/Risk-of-ruin calculator:** Backlog, nao no Sprint 2.
- **AI Coach Bankroll persona:** Estrutura de dados desta spec deve suportar integracao futura, mas o coach NAO e implementado no Sprint 2.
- **Suporte a moedas cripto:** Fora.
- **Historico antes da data de ativacao da feature:** Nao recalcula retroativamente baseado em torneios ja importados. Usuario comeca com snapshot `initial` a partir da configuracao.

---

## Dependencias

- **Sprint 1 mergeado:** Schema `user_settings.bankroll_amount` e `bankroll_rule` ja aplicados.
- **`currencyNormalizer.ts` funcional:** Ja existente em `server/scoring/`.
- **`/api/user-settings` operacional:** Rota em `misc.ts` continua responsavel por todas as outras configuracoes; NOVA rota `/api/bankroll` e dedicada.
- **Tournament Selector review fechado:** 6 ressalvas do Sprint 1 devem estar resolvidas antes de mexer em RF-10 (remover workaround).

---

## Notas de Implementacao (sugestoes, nao mandatorias)

- Reutilizar `bankrollThreshold()` que ja existe em `server/routes/tournament-selector.ts:137`, mas extrair para `server/scoring/bankrollRules.ts` (ou novo `server/services/bankrollService.ts`) e adicionar parseamento de `custom:X`.
- Criar service `server/services/bankrollService.ts` centralizando:
  - `getBankrollState(userId)`
  - `updateBankroll(userId, { amount, rule, reason, note })`
  - `recordSnapshot(userId, { delta, reason, note, occurredAt })`
  - `getBankrollHistory(userId, filters)`
- Invalidacao de cache: expor metodo `invalidateUserSelectorCache(userId)` em `server/services/selectorCache.ts` (ja existente) e chamar apos cada mutacao.
- Reutilizar layout de cards de `MetricsCard.tsx` para widget do Dashboard.
- Grafico de evolucao pode usar componente `DynamicCharts.tsx` com config customizada.
- Sidebar: adicionar item "Banca" na secao "Ferramentas" com icone `Wallet` (lucide-react).
- Testes: seguir padrao Vitest ja estabelecido (`tests/unit/bankroll/`, `tests/integration/api/bankroll/`).

---

## Ambiguidades / Perguntas ao Founder (Q1-Q10)

As perguntas abaixo devem ser respondidas antes da fase de arquitetura. Cada uma trava uma decisao que afeta scope ou contratos.

- **Q1 — Tolerancia 1.5x deve ser configuravel?** Spec atual assume hardcoded em 1.5 (alinhado com Sprint 1). Alternativa: adicionar campo `bankroll_tolerance` em user_settings (default 1.5, range 1.0-3.0). Impacto: +1 campo no schema, +1 input na UI. Decisao: **hardcoded no MVP** (proposta) ou configuravel.

- **Q2 — Regra `custom:X` deve aceitar frac0cionario?** Ex: `custom:3.5`. Proposta: sim, 1 casa decimal. Alternativa: so inteiros (mais simples). Decisao direta.

- **Q3 — Snapshot automatico ao finalizar sessao de Grind Live?** Se sim, toda sessao completada com `profitLoss != 0` cria snapshot com `reason: session_result` e `source: auto_session`. Pros: historico completo, sem trabalho manual. Contras: complica undo (deletar sessao = deletar snapshot?), pode duplicar contabilidade se usuario ja ajustou manualmente. Proposta: **NAO no MVP** (fora de escopo), reavaliar no Sprint 2.5.

- **Q4 — Deletar snapshot reverte a banca?** Se usuario deleta snapshot de aporte de $500, banca volta ao valor anterior? Proposta: **sim, com recalculo**. Alternativa: delete soft (flag `deletedAt`) e mantem banca atual. Decisao trava RF-07 (botao deletar na tabela) e RF-04 (SQL).

- **Q5 — Alerta de 10% da banca por sessao (RF-08, soft warning) e "acumulado do dia" ou "acumulado da sessao"?** Proposta: sessao (reseta quando finaliza sessao). Alternativa: dia calendario (soma todas as sessoes de hoje). Afeta estado persistido vs em memoria.

- **Q6 — Banca negativa e permitida ou bloqueia?** Proposta: permite com warning (jogador pode estar devendo em carteira digital, etc). Alternativa: bloquear com 422 "banca nao pode ficar negativa". Decisao UX.

- **Q7 — DELETE de snapshot entra no MVP?** Se Q4 for "sim, recalcula", implementacao e mais complexa (transacao + recalculo de todos snapshots posteriores). Proposta: **fora do MVP**, so exibir no historico. Usuario edita nota mas nao deleta no Sprint 2.

- **Q8 — Tolerancia de 1.5x deve aparecer na UI ou so na letra miuda?** Se jogador ve "rule 1% = maxBuyIn $7.50" mas sistema permite ate $11.25, pode confundir. Proposta atual: letra miuda. Alternativa: mostrar 2 numeros ("regra: $7.50 / shot ate: $11.25").

- **Q9 — Widget do Dashboard deve aparecer mesmo se banca nao configurada?** Proposta: sim, com CTA. Alternativa: esconder completamente ate configurar. Decisao de visibilidade do onboarding.

- **Q10 — Rate limit de `POST /api/bankroll/snapshot`:** 10/min e suficiente? Jogador pode querer registrar historico retroativo (bulk) de aportes antigos. Alternativa: 30/min. Decisao de UX de bulk import (que nao esta no escopo mas pode surgir).

---

## Riscos / Ambiguidades Prioritarias (TOP 10 para o founder decidir antes da arquitetura)

1. **Snapshot automatico de sessao (Q3)** — trava se RF-08 precisa gravar no historico ou so warn; define se `grind_sessions.profitLoss` acopla a `bankroll_snapshots`. Proposta atual: NAO no MVP.
2. **Delete de snapshot com recalculo (Q4 + Q7)** — escolhe entre hard delete com recomputo (complexo, mas consistente) vs soft delete (simples, inconsistente). Proposta: fora do MVP.
3. **Tolerancia 1.5x hardcoded vs configuravel (Q1)** — se configuravel, precisa nova coluna e input; impacta timeline. Proposta: hardcoded.
4. **Regra `custom:X` fracionaria (Q2)** — trava validacao de schema e UI do input. Proposta: 1 casa decimal.
5. **Banca negativa (Q6)** — impacta UX de bust e contratos de API. Proposta: permite com warning.
6. **Tolerancia visivel na UI (Q8)** — impacta como jogador percebe a regra. Sem definicao causa re-work de UI.
7. **Acumulado de sessao vs dia para warning 10% (Q5)** — impacta estado persistido e complica Grind Live se for "dia".
8. **Widget Dashboard para banca nao configurada (Q9)** — trava onboarding visual.
9. **Currency base alternativa (ex: permitir BRL como base)** — fora do MVP na proposta, mas founder pode querer. Mudar depois custa 2x.
10. **Auto-derivar snapshot de uploads de CSV** — fora do escopo, mas pode virar requisito. Confirmar que fica no backlog.
