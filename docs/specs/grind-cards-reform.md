# Spec — Grind Cards Reform (16 KPIs, 4 linhas)

**Status:** Draft (aguardando arquitetura + testes)
**Página alvo:** `/grind` (`client/src/pages/GrindSession.tsx` → `DashboardMetricsCards.tsx`)
**Data:** 2026-05-05
**Autor:** founder + Claude

---

## 1. Contexto

A página `/grind` hoje mostra 12 cards em 3 linhas (Contagem, Reentradas, Média Participantes, ABI / Lucro, ROI, Lucro Médio Dia, Lucro Médio Torneio / ITM, Mesas Finais, Cravadas, Maior Resultado). O founder pediu reorganização + 4 cards novos + revisão das definições, totalizando **16 cards em 4 linhas**.

A reforma é puramente **agregadora** sobre dados já existentes (`tournaments` + `grind_sessions`); não há schema novo nem endpoint novo. O foco é:

1. Adicionar 4 cards novos (`Sessões`, `Tempo Médio Sessão`, `Jogos por Dia`, `Lucro Médio Hora`).
2. Reorganizar layout para 4 linhas (ordem fixa por linha).
3. Auditar definições dos 12 cards existentes (alguns precisam recalibrar denominador / fonte).
4. Garantir consistência ponta-a-ponta: storage → endpoint → DTO → componente.

---

## 2. Decisões do founder (consolidadas)

| # | Decisão |
|---|---------|
| **R1** | Todos os 16 cards respeitam os filtros vigentes da página (`FilterDropdown` / `FilterState`: `period`, `abiRange`, `tournamentTypes`, `tournamentSpeeds`, etc). Não há cards "fixos" em all-time. |
| **R2** | Definição de "sessão" híbrida: `Sessões` e `Tempo Médio Sessão` usam `grind_sessions` (sessão registrada). `Jogos por Dia` e `Lucro Médio Dia` agrupam por dia calendário (`DATE(tournament.date)`). |
| **R3** | ITM: critério = torneio com `prize > 0` (independente de `bounty`). Bounty puro não conta. |
| **R4** | Maior Resultado = `MAX(prize)` (prêmio bruto), não lucro líquido. |
| **R5** | ABI = `SUM(buyin × (1 + reentries)) / COUNT(torneios únicos)` — investimento médio por torneio único, incluindo reentradas no numerador. |
| **R6** | Lucro Médio Hora = `totalProfit / SUM(grind_sessions.duration em horas)` no período filtrado. Sem horas registradas → card mostra `—`. |
| **R7** | **Fonte do dataset:** APENAS torneios provenientes de sessões registradas (via `/grind-live` ou botão "Registrar Sessão"). Esta é uma exceção à regra §6.1 do CLAUDE.md (que filtra `grind_session_id IS NULL` para dashboards). Aqui é o oposto: filtramos `grind_session_id IS NOT NULL`. |
| **R8** | FX: cards somam em USD por padrão. Modal "Personalizar..." permite toggle USD ↔ BRL. Conversão via `system_fx_rates` (FX-1). |
| **R9** | Cards novos somam aos existentes; durante implementação auditar se os 12 existentes estão funcionando corretamente (renomear, ajustar denominador, corrigir bugs). |
| **R10** | Mobile fora de escopo. Foco navegador desktop + futuro PWA. Manter classes `lg:grid-cols-4`. |

### Pontos de atenção (R7)

A regra §6.1 do CLAUDE.md diz que dashboards filtram `WHERE grind_session_id IS NULL`. **Esta página é a exceção:** aqui queremos justamente o oposto — só dados de sessões registradas. Documentar isso no system-architect (ADR) antes de escrever testes.

Implicação: jogadores que importam CSV mas nunca registram sessão verão **todos os cards zerados** em `/grind`. É comportamento esperado segundo o founder.

### Reconciliação R2 + R7

`Sessões` (card) = `COUNT(DISTINCT grind_sessions.id)` no período.
`Tempo Médio Sessão` = `AVG(grind_sessions.duration)` em minutos.
`Jogos por Dia` = `COUNT(tournaments) / COUNT(DISTINCT DATE(tournaments.date))` — torneios por dia calendário em que houve atividade.
`Lucro Médio Dia` = `SUM(profit) / COUNT(DISTINCT DATE(tournaments.date))`.

Note: o numerador de `Jogos por Dia` é o **número de torneios** (registros), e o denominador é **dias com pelo menos 1 torneio** no período filtrado.

---

## 3. Especificação dos 16 cards

### Layout final

```
Linha 1: Registros          | Reentradas         | ABI               | ITM
Linha 2: Sessões            | Tempo Médio Sessão | Jogos por Dia     | Lucro Médio Dia
Linha 3: Média Participantes| Lucro Médio Torneio| Lucro Médio Hora  | Maior Resultado
Linha 4: Lucro              | ROI                | Mesas Finais      | Cravadas
```

### Tabela de cards

| # | Card | Definição | Fórmula SQL/agregação | Field DTO | Formato | Existe hoje? |
|---|------|-----------|----------------------|-----------|---------|--------------|
| 1 | **Registros** | Contagem de torneios únicos (não conta reentradas) | `COUNT(DISTINCT tournaments.id)` | `totalRegistros` | inteiro | Renomear (era `Contagem`); revisar fórmula |
| 2 | **Reentradas** | Total de reentradas (sem incluir registro inicial) | `SUM(tournaments.reentries)` | `totalReentradas` | inteiro | Sim |
| 3 | **ABI** | Buy-in médio por torneio (incluindo reentradas no investimento) | `SUM(buyin * (1 + reentries)) / COUNT(DISTINCT id)` | `avgABI` | moeda | Revisar fórmula |
| 4 | **ITM** | % torneios com `prize > 0` | `COUNT(WHERE prize > 0) / COUNT(*) * 100` | `itmPercentage` | `XX.X%` | Sim |
| 5 | **Sessões** | Sessões registradas no período | `COUNT(DISTINCT grind_sessions.id)` | `totalSessions` | inteiro | Existe (mas usado como denominador, não exibido) |
| 6 | **Tempo Médio Sessão** | Duração média das sessões | `AVG(grind_sessions.duration)` (minutos) | `avgSessionDurationMin` | `Xh YYm` | **NOVO** |
| 7 | **Jogos por Dia** | Torneios médios por dia ativo | `COUNT(*) / COUNT(DISTINCT DATE(date))` | `gamesPerActiveDay` | inteiro com 1 decimal (`12.5`) | **NOVO** |
| 8 | **Lucro Médio Dia** | Lucro médio por dia ativo | `SUM(profit) / COUNT(DISTINCT DATE(date))` | `profitPerActiveDay` | moeda | Revisar (hoje = `totalProfit / totalSessions`) |
| 9 | **Média Participantes** | Field size médio | `AVG(field_size)` | `avgParticipants` | inteiro | Sim |
| 10 | **Lucro Médio Torneio** | Lucro médio por torneio (excluindo reentradas no denominador) | `SUM(profit) / COUNT(DISTINCT id)` | `profitPerTournament` | moeda | Existe inline; mover para DTO |
| 11 | **Lucro Médio Hora** | Lucro médio por hora de sessão registrada | `SUM(profit) / (SUM(grind_sessions.duration_min) / 60)` | `profitPerHour` | moeda | **NOVO** |
| 12 | **Maior Resultado** | Maior prêmio bruto recebido | `MAX(prize)` | `maiorResultado` | moeda | Sim |
| 13 | **Lucro** | Lucro líquido total | `SUM(profit)` | `totalProfit` | moeda | Sim |
| 14 | **ROI** | `Lucro / Total Investido * 100` | `SUM(profit) / SUM(buyin * (1+reentries)) * 100` | `avgROI` | `XX.X%` | Sim (auditar fórmula) |
| 15 | **Mesas Finais** | Torneios terminados em top-8 | `COUNT(WHERE position <= 8 AND position > 0)` | `totalFTs` | inteiro | Sim |
| 16 | **Cravadas** | Torneios terminados em 1º | `COUNT(WHERE position = 1)` | `totalCravadas` | inteiro | Sim |

### Regras de exibição de zeros

- Cards inteiros com 0 → mostram `0` (não `—`).
- Cards moeda com 0 → mostram `$0.00` (não `—`).
- Cards percentuais com 0% → mostram `0.0%`.
- Cards com **divisor zero** (ex: `Lucro Médio Hora` sem horas registradas, `Jogos por Dia` sem nenhum dia ativo) → mostram `—`.

---

## 4. Mudanças de código (ponta-a-ponta)

### 4.1 Storage layer (`server/storage.ts`)

**Auditar** método existente que alimenta `/grind` dashboard metrics. Provavelmente `getDashboardMetrics(userId, filters)` ou similar (system-architect deve mapear).

**Mudanças necessárias:**

1. **Filtro fundamental:** trocar `WHERE grind_session_id IS NULL` por `WHERE grind_session_id IS NOT NULL` para todas as queries desta página (atenção à regra §6.1 invertida).
2. Adicionar campos no shape de retorno:
   - `totalRegistros` (= `COUNT(DISTINCT id)`)
   - `avgSessionDurationMin` (de `grind_sessions.duration`)
   - `gamesPerActiveDay` (count torneios / dias distintos)
   - `profitPerActiveDay` (substitui ou coexiste com Lucro/Sessão)
   - `profitPerHour` (lucro / soma horas grind_sessions)
   - `profitPerTournament` (mover de cálculo inline no componente)
3. **Recalibrar fórmulas existentes** (após audit):
   - `avgABI` deve usar `(buyin * (1 + reentries))` no numerador.
   - `avgROI` deve usar `SUM(buyin * (1 + reentries))` no denominador.
   - `itmPercentage` deve usar `prize > 0`, não `position <= X` ou outra heurística.
4. **FX-aware:** todos os campos monetários (totalProfit, avgABI, maiorResultado, profitPerHour, etc) já devem chegar normalizados em USD via `convertToNativeCurrency`/FX-1. Manter padrão.

### 4.2 Endpoint

Identificar endpoint que `GrindSession.tsx` consome (`/api/grind-sessions/dashboard-metrics?period=...` ou similar). Adicionar campos novos no DTO de resposta. **Sem breaking change** — campos adicionais são opcionais para clientes antigos (não há clientes além do front).

### 4.3 Frontend (`DashboardMetricsCards.tsx`)

1. **Reordenar grid:** 4 linhas de 4 cards em vez de 3 linhas de 4.
2. **Adicionar 4 cards novos:**
   - `Sessões` — usa `totalSessions`, ícone `Calendar`.
   - `Tempo Médio Sessão` — usa `avgSessionDurationMin`, formatador `Xh YYm`, ícone `Clock`.
   - `Jogos por Dia` — usa `gamesPerActiveDay`, 1 decimal, ícone `Target` ou `BarChart3`.
   - `Lucro Médio Hora` — usa `profitPerHour`, moeda, ícone `TrendingUp` ou `DollarSign`.
3. **Renomear:** `Contagem` → `Registros`.
4. **Renomear:** `Lucro Médio por Dia` → `Lucro Médio Dia` (encurtar).
5. **Renomear:** `Lucro Médio por Torneio` → `Lucro Médio Torneio`.
6. **Remover** cálculos inline (`dashboardMetrics.totalProfit / dashboardMetrics.totalVolume`); todos os valores derivados vêm prontos do DTO.
7. **Manter** as toggles existentes (Torneios + Performance Mental) abaixo das 4 linhas de KPI.
8. **Persistência de visibilidade (`GrindPageVisibility`):** adicionar 4ª chave `kpisSession` para controlar a Linha 2 (Sessões/Tempo/Jogos/Lucro Dia). Linhas existentes: `kpisVolume` (L1), `kpisItm` (L3 nova), `kpisProfit` (L4 nova). Mapear corretamente.

### 4.4 Tipos (`types.ts`)

Adicionar ao `DashboardMetrics`:
```ts
totalRegistros: number;
avgSessionDurationMin: number;
gamesPerActiveDay: number;
profitPerActiveDay: number;
profitPerHour: number;
profitPerTournament: number;
```

### 4.5 Modal "Personalizar..." (`GrindPersonalizationDialog`)

Adicionar toggle de visibilidade para a Linha 2 (Sessões). As outras 3 linhas já têm toggles existentes (`kpisVolume`, `kpisProfit`, `kpisItm`).

Toggle de moeda (USD ↔ BRL) já existe — confirmar que afeta os 4 novos cards monetários.

---

## 5. Critérios de aceitação

### CA-01 Layout
- Página `/grind` renderiza exatamente 4 linhas de 4 cards na ordem especificada.
- Em desktop ≥ `lg`, cada linha tem 4 colunas; em `sm`/`md`, 2 colunas.

### CA-02 Cards novos visíveis e funcionais
- `Sessões` mostra `COUNT(grind_sessions)` no período filtrado.
- `Tempo Médio Sessão` mostra média formatada `Xh YYm` (ex: `2h 30m`).
- `Jogos por Dia` mostra média 1 decimal (ex: `12.5`).
- `Lucro Médio Hora` mostra moeda na unidade do toggle USD/BRL.

### CA-03 Filtros propagam
- Mudar `period` (7d/30d/90d/all-time) atualiza os 16 cards.
- Mudar `tournamentTypes` (vanilla/PKO/mystery) recalcula todos.
- Mudar `abiRange` recalcula todos.

### CA-04 ITM correto
- Torneio com `prize=0, bounty=50, position=10` → NÃO conta como ITM.
- Torneio com `prize=100, bounty=0, position=5` → conta como ITM.
- Torneio com `prize=200, bounty=50, position=3` → conta como ITM.

### CA-05 Maior Resultado correto
- Comparar `MAX(prize)` no período. Não `MAX(prize - buyin)`. Não `MAX(profit)`.

### CA-06 ABI correto
- Torneio buy-in $50, 2 reentradas → contribui $50 × 3 = $150 ao numerador, conta como 1 torneio no denominador.

### CA-07 Fonte do dataset (R7)
- Torneios importados via CSV sem `grind_session_id` (importação avulsa) → NÃO aparecem em nenhum card.
- Apenas torneios com `grind_session_id IS NOT NULL` são considerados.
- Verificar com fixture: importar 5 torneios via CSV (sem sessão) + criar 1 sessão `/grind-live` com 3 torneios → cards mostram apenas os 3 torneios da sessão.

### CA-08 FX
- Toggle USD: todos os 5 cards monetários (Lucro, ABI, Lucro Médio Dia, Lucro Médio Torneio, Lucro Médio Hora, Maior Resultado) em USD.
- Toggle BRL: idem, convertidos via `system_fx_rates`.

### CA-09 Persistência de visibilidade
- Toggle de cada linha (4 toggles agora) persiste em `localStorage` via `useGrindPreferences`.
- Recarregar página mantém estado das toggles.

### CA-10 Empty states
- Período sem nenhuma sessão registrada → todos os 16 cards mostram `0` ou `—` conforme regra §3.
- Sem regressão visual (cards continuam exibidos, não somem).

### CA-11 Sem regressão
- Toggles existentes (`Torneios`, `Performance Mental`) continuam funcionando.
- Lista de sessões (`SessionHistoryList`) inalterada.
- Botões de ação (`Registrar Sessão`, `Iniciar Grind`) inalterados.

### CA-12 Auditoria de bugs nos cards existentes
Durante o sprint, validar/corrigir:
- `totalReentradas`: confirmar que soma corretamente `tournaments.reentries`, não conta o registro inicial.
- `avgROI`: denominador deve ser `SUM(buyin × (1+reentries))`, não `SUM(buyin)`.
- `totalFTs`: filtro `position <= 8 AND position > 0` (excluir `position=null`).
- `totalCravadas`: filtro `position = 1` (não `position <= 1`).

---

## 6. Não-objetivos (out of scope)

- Não criar tabela nova nem migration.
- Não criar endpoint novo (apenas estender DTO existente).
- Não tocar em `/grind-live` (página separada).
- Não otimizar performance de query (se latência ≤ 500ms hoje, fica como está).
- Não adicionar tooltip/help nos cards (futuro).
- Não suportar mobile.
- Não criar dashboard separado por sessão (cards são agregados do período).
- Não tocar em `SessionHistoryList`.

---

## 7. Riscos & dependências

| Risco | Mitigação |
|-------|-----------|
| `getDashboardMetrics` no storage hoje filtra `grind_session_id IS NULL` (regra §6.1) | system-architect deve confirmar e ADR-novo registrar a exceção desta página. |
| Auditoria revela bug em `avgROI` ou `itmPercentage` que afeta dashboards de outras páginas | Limitar correção ao endpoint específico de `/grind`; não tocar em endpoints de `/dashboard` ou `/library` no mesmo PR. |
| FX conversion já em USD pode estar inconsistente em `maiorResultado` (atualmente moeda nativa do site?) | test-writer deve cobrir cenário multi-moeda. |
| `grind_sessions.duration` pode ser `null` para sessões em andamento | Filtrar `WHERE duration IS NOT NULL` em `Tempo Médio Sessão` e `Lucro Médio Hora`. |
| `tournaments.position` pode ser `null` (torneio em andamento ou não preenchido) | `Mesas Finais` e `Cravadas` filtram `position IS NOT NULL`. |
| Lessons #17 (`profile` redeclaração) e #14 (`require()` em testes) — atenção em rotas/testes |

---

## 8. Plano de execução (próximas etapas)

Pipeline TDD padrão (ver CLAUDE.md §11):

1. **system-architect** — diagrama de fluxo, ADR sobre exceção §6.1, mapear endpoint/storage afetados.
2. **test-writer** — testes unitários (storage agregação) + integração (endpoint DTO) + componente (renderização 16 cards + filtros + toggles + empty states + FX). Cobertura mínima: 1 teste por card crítico (16+).
3. **implementer** — green phase storage + endpoint + componente + tipos.
4. **simplify** — pos-implementer.
5. **reviewer** — antes de merge.
6. **deploy** — manual (founder pede).

---

## 9. Glossário

- **Sessão registrada** = entrada na tabela `grind_sessions` (criada via `/grind-live` ou botão "Registrar Sessão" pós-fato).
- **Dia ativo** = `DATE(tournament.date)` único no qual há ≥ 1 torneio com `grind_session_id IS NOT NULL`.
- **Investimento total** = `buyin × (1 + reentries)` por torneio.
- **ITM** = In The Money = ficou na zona de premiação (`prize > 0`, ignorando bounty).
- **Cravada** = vitória (1º lugar).
- **Mesa Final** = top 8 finalistas.
