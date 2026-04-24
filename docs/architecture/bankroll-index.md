# Bankroll Management — Indice de Arquitetura

## Status
Arquitetura em finalizacao — 2 ADRs e data-model aprovados; flows + index (este arquivo) criados em 2026-04-24 para destravar Test-Writer.

## Posicao no Pipeline
```
PM-Spec (docs/specs/bankroll-management.md)  -> APROVADO (Q1-Q10 respondidas 2026-04-24)
   |
System-Architect (este indice)               -> APROVADO
   |
Test-Writer                                  -> PROXIMO
   |
Implementer
   |
Reviewer
   |
Deployer (deferido — manter local)
```

## Sumario da Feature
Modulo de gestao de banca em USD para jogadores MTT, ativando o filtro latente do Tournament Selector (Sprint 1) e adicionando: configuracao em Settings, regras parametricas (1%/2%/5%/custom), historico de evolucao via snapshots explicitos em tabela dedicada, alertas durante Grind Live e widget no Dashboard.

**Sprint:** 2 do roadmap aprovado em 2026-04-23.
**ICE:** 7.7.
**Spec:** [`docs/specs/bankroll-management.md`](../specs/bankroll-management.md) — 11 RFs.

---

## Decisoes do Founder Incorporadas (Q1-Q10)

| # | Decisao | Onde foi tratada |
|---|---------|------------------|
| Q1 | Tolerancia 1.5x hardcoded (nao configuravel) | ADR-018 + c4-component |
| Q2 | Regra `custom:X` aceita fracionario com 1 casa decimal | feature-flow + sequence-configure |
| Q3 | Auto-snapshot de sessao de Grind Live **fora do MVP** | ADR-017 (desacoplamento) + data-model (FK opcional) |
| Q4 | DELETE futuro: hard delete com recompute | ADR-017 (viabilidade via snapshots) |
| Q5 | Warning 10% banca acumula por sessao (estado em memoria) | sequence-grind-alert |
| Q6 | Banca negativa permitida com warning | sequence-configure + spec RF-03 |
| Q7 | DELETE fora do MVP | data-model (sem coluna deletedAt) |
| Q8 | Tolerancia exibida como letra miuda | feature-flow (UI Settings) |
| Q9 | Widget Dashboard com CTA quando banca nao configurada | feature-flow (Empty States) |
| Q10 | Rate limit 10/min em POST /api/bankroll/snapshot | c4-component + spec RF-03 |

---

## Artefatos

### Diagramas

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| [`flows/bankroll/c4-component.mermaid`](flows/bankroll/c4-component.mermaid) | C4 Component | `bankrollService` (novo), reuso de `currencyNormalizer` e `selectorCache`, handlers HTTP, UI |
| [`flows/bankroll/sequence-configure.md`](flows/bankroll/sequence-configure.md) | Sequence | Fluxo `PUT /api/bankroll` — transacao atomica UPDATE user_settings + INSERT bankroll_snapshots + invalidacao do cache do Selector |
| [`flows/bankroll/sequence-grind-alert.md`](flows/bankroll/sequence-grind-alert.md) | Sequence | Fluxo de adicionar torneio em Grind Live — normalizacao de moeda, checagem de regra, modal de shot, warning 10% da sessao |
| [`flows/bankroll/feature-flow.md`](flows/bankroll/feature-flow.md) | User journey + cenarios | Perspectiva do jogador: onboarding (empty state no Dashboard), configuracao em Settings, registrar aporte, consultar historico, interacao com Selector e Grind Live |

### Decisoes (ADRs)

| ADR | Titulo | Status |
|-----|--------|--------|
| [ADR-017](decisions/017-bankroll-snapshot-vs-derived.md) | Tabela dedicada `bankroll_snapshots` (snapshots explicitos) em vez de derivar em tempo real | Aceito |
| [ADR-018](decisions/018-bankroll-tolerance-hardcoded.md) | Tolerancia 1.5x hardcoded no MVP (nao configuravel por usuario) | Aceito |

### Modelo de Dados

| Arquivo | Mudanca |
|---------|---------|
| [`data-model.mermaid`](data-model.mermaid) | **+1 tabela:** `bankroll_snapshots` com indices `(user_id, occurred_at DESC)` e `(user_id, reason)`. FK cascade em `users`. FK opcional em `grind_sessions` (reservada para auto_session fora do MVP). |

### Spec de Origem

- [`docs/specs/bankroll-management.md`](../specs/bankroll-management.md) — 11 RFs + 10 Qs respondidas.
- [`docs/strategy/2026-04-23-product-roadmap.md`](../strategy/2026-04-23-product-roadmap.md) — roadmap que justifica priorizacao do Sprint 2.
- [memory `roadmap_pivot_2026-04-24.md`] — confirma que Sprints 3 e 4 foram cancelados, foco em Bankroll + Tournament Selector.

---

## Resumo Tecnico para Test-Writer

### Modulos backend a serem criados

| Caminho | Tipo | Funcao |
|---------|------|--------|
| `server/scoring/bankrollRules.ts` | Modulo puro + constantes | Constante `BANKROLL_TOLERANCE=1.5`; `parseRule(rule) -> { pct, valid }` suportando `1pct`/`2pct`/`5pct`/`custom:X` (1 casa decimal, range 0.1-20.0); `computeThresholds({amount, rule}) -> { softLimitUSD, hardLimitUSD, maxBuyInUSD }` |
| `server/services/bankrollService.ts` | Servico de dominio | `getBankrollState(userId)`, `updateBankroll(userId, { amount, rule, reason, note })`, `recordSnapshot(userId, { delta, reason, note, occurredAt })`, `getBankrollHistory(userId, filters)` — todos com transacao para operacoes que mudam `amount` + inserem snapshot |
| `server/routes/bankroll.ts` | Modulo de rotas | `GET /api/bankroll`, `PUT /api/bankroll`, `POST /api/bankroll/snapshot`, `GET /api/bankroll/history` + rate limit 10/min dedicado |
| `server/routes/tournament-selector.ts` (modificar) | Modulo existente | Remover workaround `bankrollConfigured: false`; adicionar warning `out_of_bankroll_soft` entre softLimit e hardLimit (RF-10) |
| `server/storage.ts` (modificar) | Camada de dados | `insertBankrollSnapshot`, `getBankrollSnapshots(userId, filters)`, `updateUserBankroll(userId, { amount, rule })` — tudo com check de ownership |
| `server/services/selectorCache.ts` (modificar) | Cache existente | Expor `invalidateUserSelectorCache(userId)` se ainda nao existe; bankrollService chama apos cada mutacao |
| `shared/schema.ts` (modificar) | Drizzle | Tabela `bankroll_snapshots` + Zod `insertBankrollSnapshotSchema` com enum `reason` e `note` max 500 chars |

### Modulos frontend a serem criados

| Caminho | Funcao |
|---------|--------|
| `client/src/pages/Bankroll.tsx` | Pagina `/bankroll` com header de banca, grafico de evolucao (Recharts), tabela de movimentos, cards de resumo, botao "Registrar movimento" |
| `client/src/pages/Settings.tsx` (modificar) | Adicionar secao "Banca (Bankroll)" abaixo de "Taxas de Cambio" com input USD + select de regra + display derivado + dialog de movimento |
| `client/src/pages/Dashboard.tsx` (modificar) | Adicionar widget de banca (valor atual + sparkline 30d + ROI + projecao; CTA se nao configurada) |
| `client/src/pages/GrindSessionLive.tsx` (modificar) | Hook no submit de "Adicionar torneio": chamar `validateBankroll()`, mostrar modal de shot se exceder, warning persistente se >10% da sessao |
| `client/src/components/bankroll/BankrollWidget.tsx` | Widget reutilizavel para Dashboard (banca atual + sparkline + ROI + projecao) |
| `client/src/components/bankroll/BankrollMovementDialog.tsx` | Dialog reutilizavel para aporte/saque/ajuste (usa `POST /api/bankroll/snapshot`) |
| `client/src/components/bankroll/BankrollHistoryTable.tsx` | Tabela paginada de snapshots com colunas: data, tipo, delta, saldo, nota |
| `client/src/hooks/useBankroll.ts` | TanStack Query hook para `GET /api/bankroll` (cache 30s, invalida em mutations) |
| `client/src/hooks/useBankrollHistory.ts` | TanStack Query hook para `GET /api/bankroll/history` (cache 5min, invalidates cascata) |
| `client/src/lib/bankrollHelpers.ts` | Formatadores de moeda dual (USD+BRL), colors para delta positivo/negativo, parse de `rule` |

### Endpoints

| Metodo | Rota | Auth | Rate | Descricao |
|--------|------|------|------|-----------|
| GET | `/api/bankroll` | JWT | — | Estado atual + regra + maxBuyIn |
| PUT | `/api/bankroll` | JWT | 10/min | Atualiza amount e/ou rule, cria snapshot se amount mudou |
| POST | `/api/bankroll/snapshot` | JWT | 10/min | Registra aporte/saque/ajuste (nao idempotente) |
| GET | `/api/bankroll/history` | JWT | — | Historico + serie temporal + summary, cache 5min por (userId, filters) |

### Performance Targets

| Operacao | Alvo p95 |
|----------|----------|
| `GET /api/bankroll` | < 50ms |
| `PUT /api/bankroll` (com transacao) | < 150ms |
| `POST /api/bankroll/snapshot` | < 150ms |
| `GET /api/bankroll/history` (500 snapshots) | < 200ms |
| Cache hit de `/api/bankroll/history` | < 20ms |

### Invariantes a serem testadas (do ADR-017)

1. `user_settings.bankroll_amount == ultimo snapshot.new_amount` (cache autoritativo).
2. `snapshot[n+1].previous_amount == snapshot[n].new_amount` (detectar drift por clock skew).
3. `delta != 0` em todo snapshot (Zod valida).
4. `occurred_at <= now()` em todo snapshot (Zod valida).
5. UPDATE `user_settings.bankroll_amount` + INSERT `bankroll_snapshots` sao **atomicos** (transacao). Falha em uma aborta a outra.
6. Cascade: DELETE user remove todos seus snapshots.

---

## Questoes Tecnicas em Aberto

### Q-Arch-1. Cache invalidacao do Selector apos mutacao de banca
Sprint 1 criou `invalidateUserSelectorCache(userId)` em `server/services/selectorCache.ts`. Confirmar que a funcao:
- Limpa todas as chaves do usuario (multiple `(userId, date, sources, ...)` keys).
- Eh idempotente (chamar 2x nao falha).
- Nao invalida cache de outros usuarios.

Se nao atender, Test-Writer criar test suite nova. Senao, reusar.

### Q-Arch-2. Historical exchange rate
`currencyNormalizer` usa `user_settings.exchange_rates` (taxa atual). Quando usuario registra aporte de R$ 1000 hoje (USD/BRL = 5.20), o snapshot vira `delta = 192.31 USD` usando taxa atual. Mas se usuario editar o snapshot (depois que DELETE for implementado) ou se taxa mudar depois, como lidar?

**Decisao para MVP:** conversao acontece no momento da criacao do snapshot. Depois disso, `delta` eh fixo em USD. Se usuario quiser registrar retroativo com taxa historica diferente, deve fornecer valor ja em USD (opcao em future UI: campo "valor original + moeda + data" que faz conversao). Fora do MVP.

### Q-Arch-3. Concorrencia em atualizacao de banca
Dois requests simultaneos de `PUT /api/bankroll` ou `POST /snapshot` do mesmo usuario: a transacao previne snapshot zumbi, mas pode criar race na leitura de `previousAmount`. Usar `SELECT ... FOR UPDATE` dentro da transacao para serializar.

Test-Writer: escrever teste de concorrencia com 2 requests paralelos e assertar que `snapshot[1].previous_amount == snapshot[0].new_amount`.

### Q-Arch-4. Granularidade do cache de `GET /api/bankroll/history`
Chave `(userId, from, to, granularity, reason)` — o que acontece se jogador adiciona snapshot e depois chama history com o mesmo filtro? Cache stale.

**Decisao:** Cache de history invalidado junto com cache do Selector em toda mutacao (apenas para o userId).

### Q-Arch-5. Integracao com Tournament Selector (RF-10)
Sprint 1 retornava `bankrollConfigured: false` sempre. Sprint 2 ativa o filtro real. Ressalva: teste de regressao `tests/integration/api/tournament-selector.test.ts:337` ("bankroll nao cadastrado") precisa continuar verde — para usuario sem banca, comportamento permanece igual.

O teste atualmente valida que `bankrollConfigured: false` aparece quando `bankrollAmount IS NULL`. Manter esse assert e adicionar novos para o caminho `bankrollConfigured: true`.

---

## Proximo Passo Recomendado

```
Arquitetura aprovada (este indice + 2 ADRs + data-model + 3 flows)
   -> Test-Writer escreve testes baseados em:
      - feature-flow.md (cenarios de teste derivados, empty states, happy paths)
      - sequence-configure.md (cenarios de orquestracao de PUT + snapshot)
      - sequence-grind-alert.md (cenarios de alerta em Grind Live)
      - ADR-017 (invariantes de snapshot, queries de history)
      - ADR-018 (aplicacao da tolerancia 1.5x em 3 lugares)
      - data-model.mermaid (testes de schema, FK cascade, indices)
      - Q-Arch-1 a Q-Arch-5 acima (infra de cache e concorrencia)
```

**Foco do Test-Writer:**
1. Testes da funcao pura `parseRule` e `computeThresholds` (sem mocks, tabela de casos).
2. Testes do service `bankrollService` (unit, com mock de storage).
3. Testes de integracao dos 4 endpoints (com DB real, transacoes).
4. Testes de regressao do Tournament Selector (RF-10: remocao do workaround).
5. Testes de UI (hooks, Settings secao, widget Dashboard, Grind Live modal).
6. Testes de concorrencia (Q-Arch-3).
7. Testes de cache invalidation (Q-Arch-1 + Q-Arch-4).
