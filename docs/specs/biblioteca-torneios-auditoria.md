# Biblioteca de Torneios — auditoria antes da Calculadora

**Decisao do founder, 2026-08-19:** a Calculadora MTT (sprint T2) **para** ate a
Biblioteca de Torneios estar confiavel. A calculadora consome a Biblioteca como
fonte de ROI; um numero errado la vira grade e stake errados aqui.

**Formato escolhido:** varredura **read-only primeiro**. Auditar a Biblioteca
inteira com probes no dado real, **sem tocar em codigo**, e so depois abrir
sprint de correcao com spec + ADR + TDD. O motivo da ordem: o bug abaixo tem
irmaos, e decidir o piso de exibicao (D-1 do ADR-252) antes de medir o tamanho
real do problema seria chutar de novo.

**Modelo e esforco:** Opus 5, `xhigh` (diagnostico de bug desconhecido +
auditoria, sobre query de analytics — zona critica).

**Status:** varredura **NAO iniciada**. O que existe aqui e o achado que
disparou a decisao, ja provado no dado real.

---

## 1. O bug que disparou tudo

Relato do founder: "filtro de Ultimos 6 meses so mostra torneios da GG e da
Coin; cade WPN, Chico e os outros?".

Nao e percepcao — a tela mostra 2 sites de 7 que existem na janela. Sao **dois
bugs empilhados**.

### Camada 1 — a tela pede 6 meses e o storage entrega 30 dias

`getTournamentLibrary` tem um `switch` de periodo proprio que conhece
`7d | 30d | 90d | 365d | month | year`. A Biblioteca manda **`180d`**
(`client/src/pages/TournamentLibraryNew.tsx`, opcao "Ultimos 6M"), que nao
existe nesse switch e cai no `default` — **30 dias**
(`server/storage.ts`, dentro de `getTournamentLibrary`).

A rota `handleTournamentLibraryGrouped` (`server/routes/tournaments.ts`) **nao
valida `period`**: aceita qualquer string e repassa. Falha silenciosa — a tela
promete uma janela e recebe outra, sem erro, sem aviso, com numero plausivel.

### Camada 2 — o piso de exibicao apaga o que sobrou

Com a janela encolhida para 30 dias, as familias de 6 dimensoes (site, tipo,
velocidade, faixa de ABI, janela de horario, faixa de field) ficam minusculas e
quase nenhuma atinge `FAMILY_GROUP_FLOOR = 10`. Sobram exatamente os dois sites
de maior volume recente.

### Prova no dado real (USER-0005, banco local)

Reproduzir com `npx tsx --env-file=.env scripts/audit-library-period.ts`.

| Consulta | Familias | Sites | Torneios |
|---|---|---|---|
| O que a tela entrega hoje em "Ultimos 6M" | **4** | **2** (CoinPoker, GGNetwork) | 44 |
| O que "Ultimos 6M" deveria entregar | 33 | 5 | 603 |
| Mesma janela de 180d, sem o piso | 447 | 7 | 1563 |
| Janela de 30d (a real de hoje), sem o piso | 160 | 5 | 400 |

Contagem crua em SQL, 180 dias, `grind_session_id IS NULL`: **1566 torneios em
7 sites** — GGNetwork 848, CoinPoker 382, WPN 141, PokerStars 121, Chico 49,
PartyPoker 22, 888Poker 3. (A diferenca de 3 para o probe e a exclusao de
PLO/freeroll/buy-in 0, que e correta.)

Nada disso e historico velho: o WPN tem torneio de anteontem. O historico
completo do founder tem **9 sites e ~20 mil torneios**.

**O piso continua mentindo mesmo depois de corrigir a janela.** Nos 180 dias
reais o WPN tem 141 torneios e so **13** aparecem; PartyPoker (22) e 888Poker
(3) somem inteiros. Essa e a decisao D-1 do ADR-252, e ela e maior do que a
calculadora.

---

## 2. O estrago passa da Biblioteca

Existem **dois switches de periodo** no storage, com vocabularios divergentes e
**o mesmo `default` silencioso de 30 dias**:

| Funcao | Conhece | Nao conhece |
|---|---|---|
| `getTournamentLibrary` (switch proprio) | `7d, 30d, 90d, 365d, month, year` | **`180d`**, `last_*` |
| `buildPeriodCondition` (dashboard/analytics) | `7d, 30d, 90d, 365d, month, year, current_month, last_3_months, **last_6_months**, current_year, last_12_months, last_24_months, last_36_months, custom` | **`180d`** |

Consequencias ja identificadas, ainda **nao** provadas em tela:

1. `client/src/components/dashboard/RoiByPlatformCard.tsx` oferece
   `PERIOD_OPTIONS = ["7d","30d","90d","180d","all"]` -> o `180d` dele tambem
   vira 30 dias.
2. `server/routes/dashboard.ts` declara `VALID_PERIODS` **incluindo `180d`** —
   valida como legitimo e entrega outra janela.
3. `client/src/components/dashboard/DashboardFilters.tsx` usa a chave
   `last_6_months`, que **funciona**. Ou seja: duas telas dizem "6 meses", uma
   entrega e a outra nao.

Isso e o "fallback silencioso" que `.claude/rules/03-padrao-codigo.md` proibe, e
e o mesmo padrao do buraco **B-05** que o pm-spec ja tinha registrado na spec da
Calculadora (`period` sem validacao caindo em 30 dias).

---

## 3. O que a varredura precisa cobrir

Cada item sai com **numero provado no dado real**, nao com leitura de codigo.
Nenhum arquivo de producao muda nesta fase.

**Entrada e contrato**
- [ ] `period`: as 6 opcoes da tela (`all, month, 90d, 180d, year, 365d`) contra
      o que o storage aplica de fato. Qual entrega a janela prometida.
- [ ] Vocabulario duplo de periodo: mapear todo chamador de `period` no app e
      dizer quais estao mentindo (Biblioteca, RoiByPlatformCard, dashboard,
      insights, `/api/variance/grade-roi`).
- [ ] Validacao: o que acontece com `period` desconhecido. Hoje: 30 dias em
      silencio.

**Filtros**
- [ ] `sites`, `categories`, `speeds` — aplicam? casam com o vocabulario real
      das colunas (ver aliases de rede em `shared/poker-sites.ts`)?
- [ ] `buyinRange` e `fieldSizeRange`: o backend filtra **torneios** e o cliente
      filtra **grupos** pelo mesmo campo (`TournamentLibraryNew.tsx`). Semantica
      dupla — medir se uma familia sai com metricas calculadas sobre uma fatia.
- [ ] `daysOfWeek` — filtro em memoria antes do agrupamento; conferir o fuso de
      `dayOfWeek` (a Biblioteca deriva horario em UTC).
- [ ] `roiFilter`, `profitFilter`, `volumeFilter`, `minimumVolume` — client-side
      sobre grupos ja truncados pelo piso.

**Agrupamento e piso**
- [ ] `FAMILY_GROUP_FLOOR = 10` x `MIN_GROUP_VISIBLE = 30` x `LOW_SAMPLE_VOLUME
      = 20` (este ultimo vive na calculadora): quem governa uso, quem governa
      exibicao. Quantos torneios cada janela esconde, por site.
- [ ] Relaxamento adaptativo ("se nenhuma familia atinge o piso, mostra todas"):
      quando dispara, e se ele torna o conjunto de uma linha funcao do tamanho
      do historico inteiro.
- [ ] `groupBy` (receita de dimensoes) — cada receita salva ainda agrupa o que
      promete depois do ADR-251.
- [ ] Drill-down `specifics` / `nameSignature`: colisao de assinatura e o
      inverso (mesmo torneio partido em dois).

**Metricas**
- [ ] `computeGroupMetrics`: ROI, volume, ITM, field medio, lucro — conferir
      denominador contra SQL cru numa familia escolhida a dedo. (O pm-spec ja
      achou que o ROI tem como denominador o investimento **total**, e que a
      calculadora usava a base errada — buraco B-01.)
- [ ] `volume` = torneios ou entradas? Reentrada e rebuy entram como o que?
- [ ] Exclusoes `isExcludedFromLibrary` (PLO, freeroll, buy-in 0): quantas linhas
      somem e se a regra ainda esta certa.
- [ ] Efeito do ADR-251 nas familias: as que voltaram de `Add-on` para `Vanilla`
      estao com ROI coerente.
- [ ] `getTournamentLibraryInsights` ("Destaques e Vazamentos") — mesma janela,
      mesmos filtros, mesmos numeros da tabela? Ou divergem?

**Cruzamento**
- [ ] Biblioteca x dashboard para a MESMA janela e o MESMO site: o ROI bate? Se
      nao bate, qual dos dois esta certo.

---

## 4. Metodo

- Somente `SELECT`. Nenhum `INSERT`/`UPDATE`/`db:push`, nenhuma edicao de
  arquivo de producao.
- Banco local `postgresql://grindfy@localhost:5433/grindfy`, usuario
  **USER-0005**.
- Probes em `scripts/audit-*.ts`, rodados com
  `npx tsx --env-file=.env scripts/<nome>.ts`. O primeiro ja existe:
  `scripts/audit-library-period.ts`.
- Armadilha ja paga: `buildFilters` (usado por `getTournamentLibrary`) le
  `filters.dateRange.from/to`. `buildPeriodCondition` (dashboard) le
  `filters.dateFrom/dateTo` e so quando `period === 'custom'`. Chaves diferentes,
  funcoes diferentes — passar a chave errada devolve o historico inteiro sem
  reclamar.
- Saida da varredura: relatorio com uma linha por divergencia, cada uma com o
  numero que a prova e o arquivo/linha que a causa.

---

## 5. Depois da varredura

Sprint de correcao pelo pipeline completo (pm-spec -> system-architect ->
test-writer -> implementer -> reviewer). A decisao do piso de exibicao provavel
que vire ADR proprio, e ele **precede** o ADR-252 da calculadora: D-1 daquele
ADR depende do que a Biblioteca decidir aqui.

Ordem de dependencia registrada:

```
Biblioteca (varredura -> correcao)  ->  Calculadora T2 (ADR-252 -> testes -> impl)
```
