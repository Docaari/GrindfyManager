# Spec — Grind Cards Reform (16 KPIs, 4 linhas + Breakdowns Tipos/Velocidade/Plataformas)

**Status:** Draft v2 (aguardando arquitetura + testes)
**Página alvo:** `/grind` (`client/src/pages/GrindSession.tsx` → `DashboardMetricsCards.tsx`)
**Data:** 2026-05-05 (v1) → 2026-05-07 (v2 — breakdowns)
**Autor:** founder + Claude

## Histórico de revisões
- **v1 (2026-05-05):** 16 KPIs em 4 linhas + auditoria fórmulas + R7 (datasource = sessões registradas).
- **v2 (2026-05-07):** Adiciona breakdowns colapsaveis com **Lucro + ROI** por bucket: **Torneios** (5 tipos primários), **Velocidade** (Normal/Turbo/Hyper, novo card próprio), **Plataformas** (network agregado, novo card).
- **v2.1 (2026-05-07, pos-QA founder):** Fixes pos primeira QA: (a) cards colapsados por default (`useState(false)`); (b) chave legada `tournaments` IGNORADA (nao migra) para garantir que founder com toggle antigo desativado veja blocos novos; (c) 4 bugs latentes nos KPIs antigos corrigidos — Reentradas (usar SUM(tournaments.reentries) em vez de session.cravadas), ITM% (criterio prize > 0 em vez de fts/totalVol), Maior Resultado (MAX(prize) entre torneios, FX-aware, em vez de MAX(session.profit)), avgParticipants (filtro outlier > 200_000 contra parsing CSV bizarro).
- **v2.2 (2026-05-07, founder pediu v1 completo):** Implementacao COMPLETA dos 16 KPIs de §3 em 4 linhas: L1 Registros/Reentradas/ABI/ITM, L2 Sessoes/Tempo Medio Sessao/Jogos por Dia/Lucro Medio Dia, L3 Media Participantes/Lucro Medio Torneio/Lucro Medio Hora/Maior Resultado, L4 Lucro/ROI/Mesas Finais/Cravadas. Auditoria avgABI/avgROI corrigida — agora SUM(buyin*(1+reentries+rebuys)+addOnCost) FX-aware no denominador (vs media de session.abiMed/roi anterior). 6 KPIs novos no DTO. Visibility key nova `kpisSession` (default true). Personalizar dialog estendido. 10 testes novos cobrindo formatDurationMin, KPIs novos, divisor zero "—", visibility off.
- **v2.3 (2026-05-07, founder pos-QA round 3):** 5 fixes adicionais: (a) **Reentradas** = SUM(reentries + rebuys) — antes so reentries, perdia rebuys. (b) **Media Participantes** via MEDIANA (robusto a outliers; threshold reduzido pra 100k). (c) **Maior Resultado** ganhou metadata: `maiorResultadoMeta = { name, site, position, prizeUsd }` exibido no card como 2 linhas extras (nome do torneio + plataforma · posicaoº). (d) **Tempo Medio Sessao** com fallback heuristico `volume * 90 min` quando session.duration ausente — antes ficava zero pra sessoes antigas pre-feature. (e) **Add-on count** ganhou regra `addOnTaken === true vence type primario` — torneios com add-on real classificam em bucket Add-on mesmo quando type='Vanilla'/'PKO' por backfill incompleto. Mutex preservada (1 tournament em 1 bucket). 2 testes novos cobrem regra Add-on.
- **v2.4 (2026-05-07, founder pos-QA round 4 + audit DB):** Auditoria card-a-card via SQL local (`scripts/audit-grind-cards-fields.ts`) revelou: (a) USER-0005 tem 321/324 session_tournaments com `field_size = NULL` — CSV parser nao popula. Mediana de 2 datapoints gerava 62500 (Sharkscope mostrava 625 real). **Fix:** quality gate `N >= 5 datapoints validos` — abaixo disso, avgParticipants=0 e UI mostra "—". Mais honesto que valor mediano de outliers. (b) `getNetworkForSite` aliases faltantes: `championpoker`, `wptglobal`, `yapoker` — adicionados ao map. Antes esses sites caiam em "Outras" inflando bucket catch-all. (c) **Position null em 191/192 finished** — bug parser CSV separado (out of scope deste sprint); FT/Cravadas mostrarao numeros baixos ate parser ser corrigido.

**Bugs latentes identificados pelo audit (defer):**
- CSV parser nao popula `field_size` em 99% dos session_tournaments importados.
- CSV parser nao popula `position` em 99% dos session_tournaments importados.
- Fix futuro: backfill via Sharkscope sync OR re-import com parser corrigido.

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

## 3.1 Breakdowns (cards colapsaveis abaixo dos KPIs)

A pagina `/grind` ja tem 1 toggle "🏆 Torneios" hoje (5 cards: Vanilla/PKO/Mystery/Normal/Turbo+Hyper, apenas count + %). v2 substitui esse toggle e adiciona dois novos: **Velocidade** e **Plataformas**.

Os 3 toggles ficam abaixo das 4 linhas de KPI (e do toggle "🧠 Performance Mental"), na ordem:

```
[KPIs L1-L4]
[🏆 Torneios     — colapsavel — 5 cards]
[⚡ Velocidade   — colapsavel — 3 cards]
[🎰 Plataformas  — colapsavel — N cards (N = networks com >=1 registro)]
[🧠 Performance Mental — colapsavel (existente)]
```

### Regra comum aos 3 breakdowns

Cada bucket exibe **3 metricas em 1 card** (compacto):

| Linha | Conteudo | Formato |
|-------|----------|---------|
| Header | Nome do bucket + ` (XX.X%)` | string |
| Valor principal | Contagem absoluta | inteiro |
| Sub-valor 1 | `Lucro: $XX.XX` (FX toggle) | moeda |
| Sub-valor 2 | `ROI: XX.X%` | percentual 1 dec |

**Formulas:**
- `count` = `COUNT(tournaments WHERE bucket = X)`
- `percentage` = `count / totalCompletedTournaments * 100`
- `totalProfit` = `SUM(profit_usd)` no bucket — ja em USD via FX-1.
- `totalInvested` = `SUM(buyin_usd × (1 + reentries))` no bucket — usado como denominador do ROI.
- `roi` = `totalProfit / totalInvested * 100` (se `totalInvested = 0` → mostra `—`).

**Ordenacao:**
- Torneios: ordem fixa Vanilla → PKO → Mystery → Satellite → Add-on (mesma ordem do `TOURNAMENT_PRIMARY_TYPES`).
- Velocidade: ordem fixa Normal → Turbo → Hyper.
- Plataformas: descending por `count`. Empate: ordem alfabetica do network.

**Buckets vazios:**
- Torneios: SEMPRE mostra os 5 cards (mesmo com count=0). Mantem estabilidade visual durante filtros.
- Velocidade: SEMPRE mostra os 3 cards.
- Plataformas: APENAS networks com `count >= 1`. Sem registros no periodo → header colapsavel mostra "Nenhuma plataforma com registros no periodo" e nao expande.

### 3.1.1 Card "🏆 Torneios" (5 tipos primarios)

Buckets = `TOURNAMENT_PRIMARY_TYPES` (`shared/tournamentTypes.ts`):

| # | Bucket | Match | Cor (hex) |
|---|--------|-------|-----------|
| 1 | Vanilla | `tournament.type === 'Vanilla'` | `#71717a` |
| 2 | PKO (Bounty) | `type === 'PKO'` | `#a78bfa` |
| 3 | Mystery Bounty | `type === 'Mystery'` | `#e879f9` |
| 4 | Satélite | `type === 'Satellite'` | `#fbbf24` |
| 5 | Add-on | `type === 'Add-on'` | `#fb923c` |

**Labels PT-BR:** vir de `TYPE_LABELS_PT_BR` (ja existente).
**Cores:** vir de `TYPE_COLORS[t].hex` (ja existente).

### 3.1.2 Card "⚡ Velocidade" (3 speeds)

Buckets = `tournament.speed`:

| # | Bucket | Match |
|---|--------|-------|
| 1 | Normal | `speed === 'Normal'` ou `speed IS NULL` (default) |
| 2 | Turbo | `speed === 'Turbo'` |
| 3 | Hyper | `speed === 'Hyper'` |

**Nota:** `speed = NULL` conta como Normal para nao perder torneios sem categoria explicita (mesma convencao da L1 atual).

### 3.1.3 Card "🎰 Plataformas" (network agregado)

Buckets = `getNetworkForSite(tournament.site)` (helper novo, item §4.6).

**Exemplos de mapeamento:**
- `ACR`, `BlackChip`, `Americas Cardroom` → `WPN`
- `GGPoker`, `Natural8`, `ClubGG`, `GG` → `GGNetwork`
- `PS.ES`, `PS.FR`, `PokerStars` → `PokerStars`
- `Suprema`, `SupremaPoker`, `Liga Suprema` → `Suprema`
- `Bodog`, `Ignition` → `Bodog`

**Sites desconhecidos** (sem alias resolvido) → bucket `Outras` (agrega todos).

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

5. **v2 — Breakdowns:** ao iterar sobre os torneios da pagina (mesmo dataset que ja alimenta os 16 KPIs), construir 3 maps:
   - `byType: Map<TournamentPrimaryType, { count, profitUsd, investedUsd }>` — chaves fixas (5).
   - `bySpeed: Map<'Normal'|'Turbo'|'Hyper', ...>` — chaves fixas (3). `speed = NULL` cai em Normal.
   - `byPlatform: Map<networkKey, ...>` — chaves dinamicas via `getNetworkForSite(t.site)`.

   Apos a iteracao, transformar em arrays `BreakdownBucket[]` com `percentage` calculado contra `totalCompletedTournaments`. ROI = `profitUsd / investedUsd * 100` ou `null` se invested = 0.

   **Performance:** 1 unico loop sobre `tournaments[]` (ja em memoria); custo O(N). Sem query SQL nova.

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
7. **Manter** o toggle "🧠 Performance Mental" abaixo dos toggles novos (Torneios → Velocidade → Plataformas → Mental).
8. **Persistência de visibilidade (`GrindPageVisibility`):** chaves novas:
   - `kpisVolume` (L1) — existente
   - `kpisSession` (L2) — v1
   - `kpisItm` (L3) — existente
   - `kpisProfit` (L4) — existente
   - `kpisTypes` — bloco "Torneios" (substitui chave antiga `tournaments`, com migracao silenciosa)
   - `kpisSpeeds` — bloco "Velocidade" (NOVO, default true)
   - `kpisPlatforms` — bloco "Plataformas" (NOVO, default true)
   - `mentalEnabled` — bloco "Performance Mental" (existente)
9. **Substituir cards atuais do toggle Torneios** (Vanilla/PKO/Mystery/Normal/Turbo+Hyper apenas com count) pelos 5 cards novos com count + Lucro + ROI conforme §3.1.1.
10. **Renderizar cards novos** seguindo padrao `weekly-summary-card`: header com label + percentual, valor principal = count, 2 sub-linhas com Lucro e ROI. Cor do icone = `colorHex` quando disponivel (Torneios). Velocidade reusa cores existentes; Plataformas usa cor neutra.
11. **Acessibilidade:** cada card colapsavel deve ter `aria-expanded` + `data-testid="grind-breakdown-{types|speeds|platforms}"` para testes (lesson #2).

### 4.4 Tipos (`types.ts` + `grindPagePreferences.ts`)

**Adicionar ao `DashboardMetrics`:**
```ts
totalRegistros: number;
avgSessionDurationMin: number;
gamesPerActiveDay: number;
profitPerActiveDay: number;
profitPerHour: number;
profitPerTournament: number;

// v2 (2026-05-07): breakdowns com Lucro + ROI
typesBreakdown: BreakdownBucket[];      // 5 buckets fixos (TOURNAMENT_PRIMARY_TYPES)
speedsBreakdown: BreakdownBucket[];     // 3 buckets fixos (Normal | Turbo | Hyper)
platformsBreakdown: BreakdownBucket[];  // N buckets (networks com count >= 1)
```

**Tipo novo `BreakdownBucket`** (em `client/src/components/grind-session/types.ts`):
```ts
export interface BreakdownBucket {
  key: string;            // 'Vanilla' | 'WPN' | 'Normal' | ...
  label: string;          // PT-BR label (ja resolvido pelo backend)
  count: number;
  percentage: number;     // 0-100 (1 dec na UI)
  totalProfitUsd: number; // FX-normalizado em USD
  totalInvestedUsd: number;
  roi: number | null;     // null quando totalInvestedUsd = 0
  colorHex?: string;      // opcional (so para Torneios — TYPE_COLORS hex)
}
```

**Adicionar ao `GrindPageVisibility`** (`client/src/lib/grindPagePreferences.ts`):
```ts
kpisTypes: boolean;       // toggle do bloco "Torneios"  — substitui chave antiga 'tournaments'
kpisSpeeds: boolean;      // toggle do bloco "Velocidade" — NOVO
kpisPlatforms: boolean;   // toggle do bloco "Plataformas" — NOVO
```

Migracao localStorage: ler chave antiga `tournaments` (se existir) e mapear pra `kpisTypes`. Apos primeiro save, chave antiga removida. Default = true para os 3 toggles novos.

### 4.5 Modal "Personalizar..." (`GrindPersonalizationDialog`)

Adicionar **3 toggles novos** no grupo "Visibilidade dos cards":
- "Torneios (tipos)" → `kpisTypes`
- "Velocidade" → `kpisSpeeds`
- "Plataformas" → `kpisPlatforms`

Mais a Linha 2 (`kpisSession`) ja prevista na v1.

Toggle de moeda (USD ↔ BRL) ja existe — confirmar que afeta `Lucro` dos 3 breakdowns (sub-valor 1 de cada card).

### 4.6 Helper `getNetworkForSite` (`shared/platform-currency.ts`)

Adicionar funcao colateral ao arquivo existente:

```ts
const SITE_NETWORK: Record<string, string> = {
  // WPN
  'wpn': 'WPN', 'acr': 'WPN', 'americascardroom': 'WPN',
  'blackchip': 'WPN', 'blackchippoker': 'WPN',
  // GGNetwork
  'ggpoker': 'GGNetwork', 'ggnetwork': 'GGNetwork',
  'natural8': 'GGNetwork', 'clubgg': 'GGNetwork', 'gg': 'GGNetwork',
  // PokerStars (engloba regionais EUR)
  'pokerstars': 'PokerStars', 'stars': 'PokerStars',
  'ps.es': 'PokerStars', 'ps.fr': 'PokerStars', 'ps.pt': 'PokerStars',
  // Outros
  'partypoker': 'PartyPoker', 'party': 'PartyPoker',
  '888poker': '888poker', '888': '888poker',
  'bodog': 'Bodog', 'ignition': 'Bodog',
  'chico': 'Chico',
  'ipoker': 'iPoker', 'ipoker network': 'iPoker',
  'coinpoker': 'CoinPoker', 'coin': 'CoinPoker',
  'revolution': 'Revolution',
  'wpt': 'WPT', 'wpt global': 'WPT',
  'champion': 'Champion', 'championspoker': 'Champion', 'champions poker': 'Champion',
  'suprema': 'Suprema', 'supremapoker': 'Suprema', 'liga suprema': 'Suprema',
  'ppoker': 'PPoker',
};

export function getNetworkForSite(site: string | null | undefined): string {
  if (!site) return 'Outras';
  const key = site.toString().toLowerCase().trim();
  return SITE_NETWORK[key] ?? 'Outras';
}
```

**Tests:** cobrir casos exatos (`ACR` → `WPN`), aliases (`ACR ` com trailing space → `WPN`), unknowns (`SuperPoker` → `Outras`), null/undefined (`null` → `Outras`).

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

### CA-13 Breakdown Torneios (v2)
- Os 5 buckets sempre presentes (Vanilla/PKO/Mystery/Satellite/Add-on), mesmo com count=0.
- Soma das 5 contagens = `COUNT(tournaments)` no periodo. Soma das 5 percentages = 100% (aceitar arredondamento ate 0.5%).
- ROI = `null` em bucket sem invested → exibe `—`.
- Toggle USD: lucro do PKO = soma profits dos torneios PKO em USD; toggle BRL: convertido via `system_fx_rates`.
- Bucket `Add-on` reflete `tournaments.type === 'Add-on'` (nao `allowsAddOn === true`).

### CA-14 Breakdown Velocidade (v2)
- Os 3 buckets sempre presentes.
- Torneios com `speed = NULL` caem em Normal (default).
- Soma das contagens = total. Sem regressao de count vs L1 (`totalVolume`).

### CA-15 Breakdown Plataformas (v2)
- 1 card por network com `count >= 1`.
- Sem registros no periodo → header colapsavel mostra "Nenhuma plataforma com registros no periodo".
- Sites desconhecidos agregados em `Outras` (nao 1 card por site).
- Filtro `tournamentTypes` = `[PKO]` → cada plataforma mostra count APENAS de PKO; ROI/Lucro coerente.
- Ordem: descending por count; tie-break alfabetico.

### CA-16 Persistencia de visibilidade (v2)
- Toggles `kpisTypes`, `kpisSpeeds`, `kpisPlatforms` persistem em localStorage via `useGrindPreferences`.
- Migracao silenciosa: chave antiga `tournaments` (se presente) lida no boot e copiada pra `kpisTypes`; depois removida.
- Recarregar pagina mantem estado.

### CA-17 Helper getNetworkForSite (v2)
- `getNetworkForSite('ACR')` → `'WPN'`.
- `getNetworkForSite('GGPoker')` → `'GGNetwork'`.
- `getNetworkForSite('PS.ES')` → `'PokerStars'`.
- `getNetworkForSite('SuperPoker')` → `'Outras'`.
- `getNetworkForSite(null)` → `'Outras'`.
- Case-insensitive + trim aplicado.

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
- v2: nao adicionar drilldown por bucket (clicar em "PKO" e ir pra biblioteca filtrada). Defer.
- v2: nao adicionar grafico de pizza/barras dentro dos toggles. So cards.
- v2: nao expor sub-modificadores (`isFlight`/`isLive`) como buckets adicionais. Manter foco em tipos primarios.

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
| **v2:** Migracao silenciosa da chave `tournaments` → `kpisTypes` pode pular casos onde user editou manualmente | test-writer cobre 3 cenarios: chave antiga true, chave antiga false, chave antiga ausente. |
| **v2:** `getNetworkForSite` divergir do `getCurrencyForSite` (alias proprio) | Ambos compartilham mesmo `SITE_ALIASES` quando possivel; `SITE_NETWORK` adiciona apenas onde difere (ex: `gg` → `GGNetwork`, mas `getCurrencyForSite('gg')` ja resolve via alias). |
| **v2:** Lucro/ROI de Plataforma `Outras` esconde anomalias (ex: site digitado errado) | Aceitavel — founder valida sites comuns no map; `Outras` serve como catch-all visual. Telemetria opcional defer. |
| **v2:** Filtro `tournamentTypes` aplicado fora dos breakdowns produz double-filter | UI passa torneios ja filtrados por `applyFiltersToSessions`; backend nao aplica filtro de tipo nos breakdowns (so exibe o que sobrou). |

---

## 8. Plano de execução (próximas etapas)

Pipeline TDD padrão (ver CLAUDE.md §11). **v2 escopo amplia o sprint v1**, mas o pipeline executa em uma unica passagem (tudo na main, founder autorizou — `memory/autonomy_db_and_push_2026-05-03.md`):

### Fase 1 — Foundation (helper)
1. **`getNetworkForSite`** + 8 testes em `tests/unit/platform-currency.test.ts` (red).
2. **Implementer:** adiciona helper em `shared/platform-currency.ts` (green).

### Fase 2 — Backend / DTO
3. **`getDashboardMetrics`** auditado: §4.1 v1 (recalibrar fórmulas) + v2 (3 maps de breakdown).
4. **DTO** estendido com `typesBreakdown`, `speedsBreakdown`, `platformsBreakdown` (campos opcionais; sem breaking change).
5. **Tests integration** cobrindo CA-13/14/15 + cenarios FX (USD/BRL).

### Fase 3 — Frontend / componente
6. **`DashboardMetricsCards.tsx`** rewrite parcial:
   - 16 cards KPI (v1 ja parcialmente entregue).
   - 3 toggles novos (Torneios v2 substitui antigo + Velocidade + Plataformas).
7. **`GrindPersonalizationDialog`** com 3 toggles novos.
8. **`grindPagePreferences.ts`** com migracao silenciosa da chave `tournaments` → `kpisTypes`.
9. **Tests componente** (RTL + Vitest 4) cobrindo CA-13 a CA-17.

### Fase 4 — Validação manual
10. Founder roda `/grind` localmente em desktop:
    - Filtra por periodo 30d → confirma counts coerentes com dashboard /dashboard? (Nao — R7 da v1 diz que sao datasets diferentes.)
    - Toggle USD/BRL → confirma FX em todos os cards monetarios.
    - Filtro `tournamentTypes = [PKO]` → todos os 3 breakdowns se reduzem (somente PKO em Torneios; Velocidade so com PKO; Plataformas so com counts de PKO).

### Fase 5 — Commit + push
11. **Commit unico** na main com mensagem: `feat(grind-cards): v2 breakdowns Torneios+Velocidade+Plataformas com Lucro+ROI`.
12. **Push origin/main**.
13. **Sem migrations DB** — implementacao inteiramente em camada de leitura/agregacao.

### Pré-requisitos
- v1 ja parcialmente implementado? **Verificar** se cards `Sessões`, `Tempo Médio Sessão`, `Jogos por Dia`, `Lucro Médio Hora` estão presentes — se não, executar v1 + v2 juntos.
- Helper `system_fx_rates` (FX-1, sprint anterior) operacional.
- `TOURNAMENT_PRIMARY_TYPES` SSoT atualizado pos commit `f18b3f8` (5 tipos OK).

### Decisões já alinhadas com founder (2026-05-07)
- Tipos: 5 primarios completos (Vanilla/PKO/Mystery/Satellite/Add-on).
- Plataformas: agregadas por **network** (WPN engloba ACR+BlackChip; GGNetwork engloba GGPoker+Natural8).
- Velocidade: card colapsavel **proprio** separado de Torneios (3 toggles total).
- Trabalhar direto na main; commits + push permitidos sem perguntar.

---

## 9. Glossário

- **Sessão registrada** = entrada na tabela `grind_sessions` (criada via `/grind-live` ou botão "Registrar Sessão" pós-fato).
- **Dia ativo** = `DATE(tournament.date)` único no qual há ≥ 1 torneio com `grind_session_id IS NOT NULL`.
- **Investimento total** = `buyin × (1 + reentries)` por torneio.
- **ITM** = In The Money = ficou na zona de premiação (`prize > 0`, ignorando bounty).
- **Cravada** = vitória (1º lugar).
- **Mesa Final** = top 8 finalistas.
