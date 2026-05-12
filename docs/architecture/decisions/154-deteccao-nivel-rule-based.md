# ADR-154: Deteccao de nivel do jogador — heuristica rule-based (sem ML), 6 niveis, thresholds em USD, confirmacao obrigatoria

## Status
Aceito

## Data
2026-05-12

## Contexto

O Sprint AI-1A (`Docs/specs/sprint-ai-1a.md`, RF-08) introduz a **deteccao de nivel automatica**: a partir dos dados que o jogador ja importou (ABI, volume, ROI, numero de redes, idade da conta), estimar o nivel — `iniciando` / `micro_ascensao` (micro grinder em ascensao) / `mid_consistente` (mid-stakes consistente) / `high_stakes` / `recreativo_serio` (recreativo serio) / `sem_dados` — e **sempre confirmar com o usuario** ("Pelos seus dados parece que voce e X — confere?"). O nivel calibra o tom dos relatorios futuros (AI-1B+) e vai pro perfil estruturado (`users.ai_structured_profile.nivel` + `nivelConfirmado` + `nivelEstimadoEm` — ADR-151).

Hoje nao existe deteccao de nivel. Os dados de que a heuristica precisa ja estao acessiveis: `getDashboardStats(userId, period, filters)` (count, totalBuyins, totalProfit, ROI/ABI derivados — ja filtra `grind_session_id IS NULL`, §6.1), `getAnalyticsBySite(userId, period, filters)` (contar redes), `users.createdAt` (idade da conta), `users.subscriptionPlan` (sinal fraco).

A pergunta central: **rule-based ou ML? Quais thresholds (em USD)? Como resolver empates entre regras? O que fazer com amostra insuficiente? Como garantir que o agente nao trate a estimativa como verdade absoluta?**

### Restricoes

- **Rule-based, sem ML** — mesma logica do ADR-015 (`scoring-linear-vs-ml`): o dataset e pequeno, os thresholds sao interpretaveis e calibraveis, ML seria over-engineering.
- **Pura e testavel** — `estimatePlayerLevel(input)` nao le DB/env/`new Date()`; recebe tudo no `LevelEstimateInput` (incluindo `accountAgeMonths` ja calculado). O route handler carrega os dados.
- **Lesson #6 (conversao de moeda):** ABI/buy-ins comparados com thresholds em USD — sempre normalizar pra USD antes (`getDashboardStats` retorna em USD na maioria dos casos; confirmar e converter se necessario).
- **§6.1 (fonte do historico):** usa **so** `tournaments` com `grind_session_id IS NULL` — nunca `session_tournaments`. Os `getDashboardStats`/`getAnalyticsBySite` ja filtram.
- **Nunca assumida como verdade** — `nivelConfirmado: false` ate o usuario confirmar; o prompt (ADR-151 §7) instrui o agente a confirmar antes de assumir. A deteccao e sugestao, nao veredito.
- **On-demand only** — roda no onboarding (step 3) ou via `GET /api/coach/level-estimate`; **nao** re-estima em background.
- **Nao usar variancia/std-dev** — isso e uma tool (`analyze_variance`, AI-2A).

## Opcoes Consideradas

### Rule-based vs ML

**Opcao A: heuristica rule-based com thresholds em USD + tie-break por prioridade (ESCOLHIDA)** — uma funcao pura que aplica regras na ordem de especificidade, com tie-break declarado.
- **Pros:** interpretavel ("voce e mid-stakes porque ABI ≥ $33 e volume 90d ≥ 80 e nao esta sangrando"); calibravel (mudar um threshold e 1 linha); trivialmente testavel (input → output deterministico); zero infra; zero custo. Consistente com o ADR-015 (Tournament Selector scoring tambem e rule-based, nao ML).
- **Contras:** os thresholds sao palpites informados — podem precisar de calibracao com dados reais (documentado como "ponto de partida"). Aceito.

**Opcao B: classificador ML (logistic regression / decision tree treinado)**
- **Pros:** "aprenderia" os limites; potencialmente mais preciso.
- **Contras:** **dataset minusculo** (centenas de users); zero ground-truth (ninguem rotulou "nivel" de cada jogador); infra de treino/serving; nao-interpretavel ("o modelo disse high-stakes" sem explicar); **over-engineering** — o ADR-015 ja recusou ML para o scoring de torneio pela mesma razao. **Rejeitada.**

**Opcao C: o proprio LLM estima o nivel** (passa as metricas no prompt, o agente classifica)
- **Pros:** "inteligente"; usa o Coach.
- **Contras:** caro (tokens); não-determinístico (o LLM pode classificar diferente a cada chamada — pessimo para um campo que vai pro perfil estruturado); dificil de testar; o prompt ja e grande. **Rejeitada** — uma funcao pura e melhor para isso.

### Empates entre regras

**Opcao A: tie-break por prioridade declarada (ESCOLHIDA)** — `high_stakes > mid_consistente > micro_ascensao > recreativo_serio > iniciando`. Se duas regras batem (ex: volume alto em micro = `micro_ascensao` vs conta antiga ROI+ = `recreativo_serio`), a de maior prioridade vence.
- **Pros:** deterministico; explicavel; testavel.
- **Contras:** a ordem e uma decisao arbitraria — mas e uma decisao consciente e documentada. Aceito.

**Opcao B: pontuacao composta (cada regra da pontos; o maior ganha)**
- **Contras:** mais complexo; menos explicavel; precisa calibrar pesos. **Rejeitada** — prioridade declarada e suficiente.

## Decisao

**Adotar Opcao A: `estimatePlayerLevel(input: LevelEstimateInput): LevelEstimate` — funcao pura em `server/coach/playerLevel.ts`, rule-based, thresholds em USD, tie-break por prioridade, `confidence` (`low`/`medium`/`high`), sempre confirmada pelo usuario (`nivelConfirmado`).** On-demand only. Os thresholds sao ponto de partida calibravel.

### Input/Output

```ts
interface LevelEstimateInput {
  abiUSD: number | null;          // ABI all-time em USD (totalBuyins/count, period='all', normalizado USD — lesson #6)
  volumeAllTime: number;          // count de torneios all-time (period='all')
  volumeLast90d: number;          // count ultimos 90d
  roiAllTime: number | null;      // ROI % all-time (totalProfit/totalBuyins*100)
  roiLast90d: number | null;      // ROI % ultimos 90d
  distinctNetworks: number;       // redes distintas no historico (getAnalyticsBySite)
  accountAgeMonths: number;       // (now - users.createdAt) em meses — calculado pelo handler, passado pronto
  subscriptionPlan: string;       // 'free'|'pro'|'premium'|'admin' — sinal fraco, so desempate
}

type PlayerLevel = 'sem_dados' | 'iniciando' | 'micro_ascensao' | 'mid_consistente' | 'high_stakes' | 'recreativo_serio';

interface LevelEstimate {
  nivel: PlayerLevel;
  confidence: 'low' | 'medium' | 'high';
  humanLabel: string;            // pt-BR
  evidence: { abiUSD: number | null; volumeAllTime: number; volumeLast90d: number;
              roiAllTime: number | null; distinctNetworks: number; accountAgeMonths: number };
  note?: string;                 // ex: 'amostra insuficiente — joga mais que importou os dados pra eu ter certeza' quando sem_dados
}
```

### Heuristica (thresholds — ponto de partida calibravel; em USD)

1. **`sem_dados`** — `volumeAllTime < 30` **OU** `abiUSD == null`. (Amostra insuficiente.) `confidence: 'low'`, `note` preenchido. Curto-circuito: se `sem_dados`, retorna ja (nao avalia o resto).
2. Senao, com `abi = abiUSD`, `vol90 = volumeLast90d`, avalia na ordem (a primeira que bate, considerando o tie-break, vence):
   - **`high_stakes`** — `abi >= 215` **E** `volumeAllTime >= 200`. `confidence: 'high'` se `vol90 >= 100`, senao `'medium'`.
   - **`mid_consistente`** — `abi >= 33` **E** `abi < 215` **E** `vol90 >= 80` **E** (`roiLast90d != null && roiLast90d >= -5` — nao esta sangrando) **E** `accountAgeMonths >= 6`. `confidence: 'high'` se `vol90 >= 150 && roiAllTime != null`, senao `'medium'`.
   - **`micro_ascensao`** — `abi < 33` **E** `vol90 >= 80` (volume alto em micro — grindando pra subir). `confidence: 'medium'`. (Sobrepoe `recreativo_serio` quando o volume e alto — ver tie-break.)
   - **`recreativo_serio`** — (nao bateu `mid_consistente` nem `micro_ascensao` por volume) **E** `accountAgeMonths >= 12` **E** `volumeAllTime >= 100` **E** (`roiAllTime != null && roiAllTime > 0` — recreativo mas com edge). `confidence: 'medium'`.
   - **`iniciando`** — fallback — `accountAgeMonths < 6` **OU** `volumeAllTime < 100` (mas `>= 30`, senao seria `sem_dados`). `confidence: 'low'`.
3. **Tie-break (prioridade):** `high_stakes` > `mid_consistente` > `micro_ascensao` > `recreativo_serio` > `iniciando`. Implementacao: avaliar todas as regras que batem, escolher a de maior prioridade. Ex: input que bate `micro_ascensao` E `recreativo_serio` → retorna `micro_ascensao`.
4. **`subscriptionPlan`** — sinal fraco, so para desempate residual (ex: dois niveis empatados na prioridade — situacao que o tie-break ja resolve; na pratica raramente usado). Documentado como "ultimo recurso".

### `humanLabel` por nivel (pt-BR)

| nivel | humanLabel |
|---|---|
| `sem_dados` | "ainda sem dados suficientes" |
| `iniciando` | "comecando a jornada" |
| `micro_ascensao` | "micro grinder em ascensao" |
| `mid_consistente` | "mid-stakes consistente" |
| `high_stakes` | "high-stakes" |
| `recreativo_serio` | "recreativo serio" |

### Uso

- **`GET /api/coach/level-estimate`** (ADR-153) — o handler carrega `getDashboardStats(userId, 'all')` + `getDashboardStats(userId, '90d')` + `getAnalyticsBySite(userId, 'all')` + `users.createdAt` (→ `accountAgeMonths`) + `users.subscriptionPlan`, monta o `LevelEstimateInput` (conversao USD aplicada antes — lesson #6), chama `estimatePlayerLevel`, retorna o `LevelEstimate`. **Nao persiste** (chamar 2x nao muda nada no DB).
- **Wizard step 3 (`full`)** — mostra a estimativa; o usuario confirma → `PATCH /api/coach/onboarding` com `{ nivel: <confirmado>, nivelConfirmado: true }` (ou `{ nivel: <estimado>, nivelConfirmado: false }` se "prefiro nao dizer" e aceita o estimado, ou mantem o estimado com `nivelConfirmado: false` se recusou sem dizer outro).
- **Perfil estruturado** guarda `nivel` + `nivelConfirmado` + `nivelEstimadoEm` (ISO da estimativa).
- **System prompt (ADR-151 §7):** renderiza `Nivel estimado: <humanLabel>` + `(confirmado pelo jogador)` se `nivelConfirmado`, senao `(estimativa — confirme com o jogador antes de assumir)`. **O agente nunca assume o nivel como verdade absoluta se `nivelConfirmado` for false.**

### Restricoes de implementacao

- **Pura:** `estimatePlayerLevel` nao le DB/env/`new Date()` — `accountAgeMonths` vem no input (calculado pelo handler). Mesmo input → mesmo output.
- **Lesson #6:** conversao USD aplicada **no handler** (antes de montar o input), nao na funcao pura — a funcao recebe `abiUSD` ja normalizado.
- **§6.1:** `getDashboardStats`/`getAnalyticsBySite` ja filtram `grind_session_id IS NULL` — nunca agrega `session_tournaments`.
- **`injectedStorage?`** (lesson #34) no handler.
- **Usuario sem nenhum torneio** → `getDashboardStats` retorna count 0 / ABI null → `estimatePlayerLevel` → `sem_dados`, `note` preenchido, sem throw.

## Consequencias

### Positivas
- **Interpretavel e calibravel** — cada nivel tem uma explicacao em linguagem natural; mudar um threshold e trivial; consistente com o ADR-015.
- **Deterministico e testavel** — funcao pura; os 6 niveis + tie-break + `sem_dados` + `confidence` cobertos por testes de input/output.
- **Zero custo/infra** — sem LLM, sem ML, sem treino/serving.
- **Calibra o tom dos relatorios** (AI-1B+) sem ser intrusivo — o usuario confirma; a estimativa e sugestao.
- **Honra §6.1 e lesson #6** — fonte correta do historico; conversao USD antes dos thresholds.

### Negativas
- **Thresholds sao palpites informados** — podem precisar de ajuste com dados reais. Documentado como "ponto de partida"; calibracao futura sem mudar o ADR (so as constantes).
- **6 niveis podem nao capturar todo mundo** — mas `sem_dados` + `iniciando` (fallback) garantem que todo input recebe *algum* nivel.
- **`subscriptionPlan` como sinal de desempate** — fraco e raramente usado; documentado.

### Neutras
- **On-demand only** — re-estimativa em background fica fora (so se o usuario pedir ou re-fizer o onboarding).
- **`nivelEstimadoEm`** guarda quando foi estimado — util para um futuro "sua estimativa esta desatualizada, quer re-checar?" (AI-1B nota, nao obrigatorio).
- **Tie-break por prioridade** — a ordem e arbitraria mas consciente; revisitavel.

## Confianca

**Media-Alta.** A abordagem rule-based e a certa (ADR-015 ja validou para o scoring). O risco e calibracao — os thresholds podem estar imprecisos no comeco; mitigado por (a) sao constantes faceis de ajustar, (b) o usuario sempre confirma, (c) `confidence` sinaliza incerteza, (d) `sem_dados`/`iniciando` cobrem os casos de baixa amostra. Confianca seria "Alta" com dados reais para calibrar.

## Code references

- `server/coach/playerLevel.ts` (NOVO) — `estimatePlayerLevel(input): LevelEstimate`; constantes de threshold (`MIN_VOLUME_SAMPLE = 30`, `HIGH_STAKES_ABI = 215`, `MID_STAKES_ABI = 33`, `HIGH_VOLUME_90D = 80`, ...); `humanLabel` map; `PlayerLevel` type (reexportado de `shared/schema.ts` ou definido aqui — implementer decide; preferir co-localizar com `AiStructuredProfile` em `shared/schema.ts`).
- `server/routes/coach.ts` — `handleGetLevelEstimate` (carrega `getDashboardStats` ×2 + `getAnalyticsBySite` + `users.createdAt`/`subscriptionPlan`, conversao USD, chama `estimatePlayerLevel`, retorna; `injectedStorage?`).
- `server/storage/aiStructuredProfile.ts` — `updateAiStructuredProfile({ nivel, nivelConfirmado, nivelEstimadoEm })` (do `PATCH /api/coach/onboarding`).
- `server/coachSystemBuilder.ts` — `formatStructuredProfile` renderiza `Nivel estimado: ...` com o `humanLabel` + flag de confirmacao (ADR-151 §7).

## Related ADRs

- [ADR-015](015-scoring-linear-vs-ml.md) (`scoring-linear-vs-ml`) — **referencia direta** do "rule-based, sem ML" — a deteccao de nivel segue a mesma logica que o scoring do Tournament Selector.
- [ADR-151](151-ai-structured-profile-jsonb.md) — Perfil estruturado — guarda `nivel`/`nivelConfirmado`/`nivelEstimadoEm`; o system prompt renderiza com a flag de confirmacao.
- [ADR-153](153-onboarding-conversacional-wizard-guiado.md) — Onboarding — o step 3 mostra a estimativa e pede confirmacao; `GET /api/coach/level-estimate`.
- [ADR-148](148-grindfy-ai-consolidation-single-agent-with-lens.md) — Agente unico — o nivel e do agente unico (a "lente" `coachType` nao gateia).

## Lessons learned aplicadas
- **#6** (conversao de moeda) — `abiUSD` normalizado pra USD **no handler** antes de montar o input; a funcao pura recebe ja em USD.
- **#9** (try/catch logado) — o handler loga + retorna `sem_dados` em erro de DB; nao throw.
- **#34** (storage injetavel) — `handleGetLevelEstimate` recebe `injectedStorage?`.
- **§6.1** (fonte do historico) — `getDashboardStats`/`getAnalyticsBySite` ja filtram `grind_session_id IS NULL`; nunca agrega `session_tournaments`.
