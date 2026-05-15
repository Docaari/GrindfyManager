# Spec: Mediana de Participantes no Grade Planner

## Status
Proposta

## Resumo
Substituir o calculo de **media** de participantes (estimate via `guaranteed / buyIn`) por **mediana** no Grade Planner, e ampliar a exibicao da metrica de **1 ponto** (card da semana) para **3 pontos** (card da semana, card do dia, modal de detalhes). Label deve ser explicitamente **"Mediana"** para diferenciar de "Media".

## Contexto
Hoje a pagina /coach (aba Grade Planner) exibe a metrica de participantes em apenas um lugar: o card "Media Participantes" em `WeeklySummaryDashboard.tsx`. O calculo e uma media aritmetica simples do proxy `Math.round(guaranteed / buyIn)` por torneio.

**Problema:** torneios outliers com garantido muito alto (ex: Sunday Million, US$ 1M garantido) distorcem a media — um unico evento desses inflaciona o numero exibido, tornando-o irrelevante para a tomada de decisao do jogador. Exemplo concreto: 6 torneios com ~300 participantes esperados + 1 Sunday Million com ~10.000 → media ~1.700 (inutil); mediana → 300 (representa o "dia tipico").

**Decisao tomada pelo founder:** usar **mediana** (resistente a outliers) em vez de media. Mediana e a metrica padrao recomendada quando ha cauda longa na distribuicao.

**Decisao tomada:** label sera **"Mediana de Participantes"** (nao "Media") em todos os lugares, para que o jogador entenda que o valor representa o "torneio mediano" e nao a media inflacionada.

**Fonte de dados:** manter proxy atual `Math.round(guaranteed / buyIn)` por torneio. Buscar `tournaments.fieldSize` real do historico esta fora de escopo desta spec.

## Usuarios
- **Jogador profissional/semi-profissional MTT:** consulta o Grade Planner diariamente para planejar a semana. Precisa de uma estimativa realista de quantos jogadores enfrenta tipicamente em cada dia/perfil para calibrar expectativas de ROI/variancia.

## Requisitos Funcionais

### RF-01: Helper de mediana
**Descricao:** Criar funcao utilitaria pura para calculo de mediana.
**Localizacao:** `client/src/lib/median.ts`
**Assinatura:** `export function median(values: number[]): number | null`
**Regras de negocio:**
- Sort ascendente do array de entrada (nao mutar o original).
- Se `length === 0` → retorna `null`.
- Se `length` impar → retorna o valor do meio.
- Se `length` par → retorna a media aritmetica dos dois valores centrais.
- Retorna `float` (sem arredondamento interno) — arredondamento e responsabilidade do caller.
**Criterio de aceitacao:**
- [ ] Array vazio retorna `null`.
- [ ] Array com 1 elemento retorna o proprio elemento.
- [ ] `[1, 2, 3]` retorna `2`.
- [ ] `[1, 2, 3, 100]` retorna `2.5`.
- [ ] `[150, 200, 250, 300, 400, 500, 10000]` retorna `300` (caso outlier do founder).
- [ ] Nao muta o array de entrada.

### RF-02: Helper de estimativa de field size por torneio
**Descricao:** Criar funcao utilitaria para calcular o proxy `Math.round(guaranteed / buyIn)` com validacao de entrada.
**Localizacao:** `client/src/lib/median.ts` (mesmo arquivo)
**Assinatura:** `export function estimatedFieldSize(t: { guaranteed?: string | number; buyIn?: string | number }): number | null`
**Regras de negocio:**
- Parse `guaranteed` e `buyIn` para `float` (aceitar string ou number).
- Se `guaranteed <= 0` OU `buyIn <= 0` OU qualquer um for invalido/NaN/undefined → retorna `null`.
- Caso valido, retorna `Math.round(guaranteed / buyIn)`.
**Criterio de aceitacao:**
- [ ] `{ guaranteed: 10000, buyIn: 100 }` retorna `100`.
- [ ] `{ guaranteed: "10000", buyIn: "100" }` retorna `100` (string aceita).
- [ ] `{ guaranteed: 0, buyIn: 100 }` retorna `null`.
- [ ] `{ guaranteed: 10000, buyIn: 0 }` retorna `null`.
- [ ] `{ guaranteed: undefined, buyIn: 100 }` retorna `null`.
- [ ] `{ guaranteed: "abc", buyIn: "100" }` retorna `null`.

### RF-03: Atualizar `DayStats` schema
**Descricao:** Migrar campo `avgFieldSize` (morto, nao lido) para `medianFieldSize` na interface `DayStats`.
**Localizacao:** `client/src/components/grade-planner/types.ts`
**Regras de negocio:**
- **Remover:** campo `avgFieldSize: number` da interface `DayStats` (linha ~77) e do objeto `emptyDayStats` (linha ~93). Grep confirma 0 leituras fora da declaracao.
- **Adicionar:** campo `medianFieldSize: number | null` na interface `DayStats`.
- Atualizar `emptyDayStats` com `medianFieldSize: null`.
**Criterio de aceitacao:**
- [ ] `DayStats` nao tem mais `avgFieldSize`.
- [ ] `DayStats` tem `medianFieldSize: number | null`.
- [ ] `emptyDayStats.medianFieldSize === null`.
- [ ] `tsc` exit 0 (nenhum consumer quebra — campo era morto).

### RF-04: Populacao de `medianFieldSize` em `getProfileStats`
**Descricao:** A funcao `getProfileStats(dayId, profile)` em `GradePlanner.tsx` (linha ~340) deve calcular e popular `medianFieldSize` no `DayStats` retornado.
**Localizacao:** `client/src/pages/GradePlanner.tsx`
**Regras de negocio:**
- Para cada torneio do `dayId`+`profile`, calcular `estimatedFieldSize(t)` (RF-02).
- Filtrar resultados `null` (torneios sem garantido valido).
- Aplicar `median(...)` (RF-01) sobre o array filtrado.
- Se mediana retornar `null` (array vazio apos filtro), `medianFieldSize = null`.
- Caso contrario, `medianFieldSize = Math.round(mediana)` (inteiro, sem casas decimais).
**Criterio de aceitacao:**
- [ ] 3 torneios com fields [200, 500, 10000] → `medianFieldSize === 500`.
- [ ] Nenhum torneio com garantido valido → `medianFieldSize === null`.
- [ ] Mix de torneios (alguns sem garantido, alguns com [300, 400, 500]) → mediana apenas dos validos (400).
- [ ] Lista vazia de torneios → `medianFieldSize === null`.

### RF-05: Card geral da semana (WeeklySummaryDashboard)
**Descricao:** Trocar o calculo de **media** por **mediana** no card "Media Participantes" e renomear labels.
**Localizacao:** `client/src/components/grade-planner/WeeklySummaryDashboard.tsx` (linhas 36-46 e 139-144)
**Regras de negocio:**
- Substituir calculo de media (atual: somatorio dividido por count) por `median(...)` aplicado sobre `estimatedFieldSize(t)` de cada torneio da semana.
- Filtrar torneios com `estimatedFieldSize === null` (sem garantido valido).
- Se mediana retornar `null` (array vazio) → exibir `'N/A'`.
- Caso valido, exibir `Math.round(mediana).toLocaleString('pt-BR')`.
- **Label principal:** "Media Participantes" → **"Mediana Participantes"**.
- **Sublabel:** "Estimativa" → **"Estimativa (mediana)"**.
**Criterio de aceitacao:**
- [ ] Label exibido e "Mediana Participantes".
- [ ] Sublabel exibido e "Estimativa (mediana)".
- [ ] Conjunto de 7 torneios `[150, 200, 250, 300, 400, 500, 10000]` exibe `300`, NAO `~1.686`.
- [ ] Nenhum torneio com garantido valido na semana → exibe `N/A`.

### RF-06: Linha de mediana no card do dia (DayCard)
**Descricao:** Adicionar linha nova exibindo a mediana de participantes do dia/perfil.
**Localizacao:** `client/src/components/grade-planner/DayCard.tsx`
**Regras de negocio:**
- Adicionar linha dentro do bloco `metrics-line` (em `day-main-info`), apos a linha que mostra tipo/velocidade predominante.
- Formato do texto: `Mediana: ~{X} participantes` (X = `dayStats.medianFieldSize`).
- O `~` (tilde) e literal e deve aparecer antes do numero, sinalizando estimativa.
- O numero deve ser formatado com `toLocaleString('pt-BR')` para localizacao.
- Se `dayStats.medianFieldSize === null` → **nao renderizar** a linha (esconder, nao mostrar "N/A" para nao poluir o card compacto).
**Criterio de aceitacao:**
- [ ] `DayStats` com `medianFieldSize: 500` renderiza linha com texto `Mediana: ~500 participantes`.
- [ ] `DayStats` com `medianFieldSize: 1234` renderiza linha com texto `Mediana: ~1.234 participantes` (formatacao pt-BR).
- [ ] `DayStats` com `medianFieldSize: null` NAO renderiza a linha (elemento ausente do DOM).
- [ ] Linha aparece apos a linha de tipo/velocidade.

### RF-07: Mediana agregada no header do PlanningDialog
**Descricao:** Adicionar card/secao agregada no header do modal mostrando mediana do conjunto de torneios atualmente exibido (dia + perfil selecionado).
**Localizacao:** `client/src/components/grade-planner/PlanningDialog.tsx`
**Regras de negocio:**
- Adicionar bloco proximo ao header onde ja se exibem count + ABI + total de investimento do dia.
- **Label:** "Mediana de Participantes".
- **Valor:** mediana calculada via `median(...)` aplicado sobre `estimatedFieldSize(t)` de cada torneio exibido no modal, filtrando `null`.
- Se nenhum torneio tiver garantido valido → exibir `N/A`.
- Se valor presente, formatar com `toLocaleString('pt-BR')`.
- **Tooltip:** "Resistente a outliers — nao distorcida por torneios isolados muito grandes."
- O tooltip deve estar acessivel via hover (componente Tooltip do design system shadcn ja em uso).
- **Preservar** as linhas existentes "Field Medio: +/- X" **por torneio individual** (linhas 431-435 e 660-664) — essas mostram a estimativa de cada torneio em si, nao a agregacao.
**Criterio de aceitacao:**
- [ ] Header do modal exibe "Mediana de Participantes: {X}".
- [ ] Tooltip presente, acessivel via hover, com o texto especificado.
- [ ] Linhas "Field Medio" por torneio individual (linhas 431-435, 660-664) permanecem intactas.
- [ ] Modal com nenhum torneio (ou todos sem garantido) exibe `N/A`.
- [ ] Conjunto com outlier produz resultado da mediana, nao da media.

## Requisitos Nao-Funcionais
- **Performance:** Helpers `median` e `estimatedFieldSize` sao puros e O(n log n) (sort). Sem impacto perceptivel para conjuntos < 1000 torneios.
- **Compatibilidade:** Mudancas no `DayStats` (RF-03) sao type-only — `tsc` deve detectar qualquer consumer quebrado em compile-time. Grep confirma 0 leituras de `avgFieldSize` fora da declaracao.
- **Localizacao:** Numeros formatados com `toLocaleString('pt-BR')` para consistencia com convencao do projeto.
- **i18n:** Strings em portugues, alinhadas com o resto da UI (CLAUDE.md §1: "UI em PT-BR").

## Endpoints Previstos
Nenhum. Esta spec e 100% client-side (agregacao em React).

## Modelos de Dados Afetados

### `DayStats` (alteracao type-only — sem migration)
Localizacao: `client/src/components/grade-planner/types.ts`

| Campo | Tipo | Acao | Notas |
|---|---|---|---|
| `avgFieldSize` | `number` | **Removido** | Campo morto, 0 leituras fora da declaracao |
| `medianFieldSize` | `number \| null` | **Adicionado** | Mediana arredondada de `estimatedFieldSize(t)` dos torneios |

Nenhuma tabela do banco e afetada.

## Integracoes Externas
Nenhuma.

## Cenarios de Teste Derivados

### Helper `median` (`tests/unit/lib/median.test.ts`)
- [ ] Array vazio `[]` → `null`.
- [ ] Array com 1 elemento `[42]` → `42`.
- [ ] Array impar `[1, 2, 3]` → `2`.
- [ ] Array par `[1, 2, 3, 100]` → `2.5`.
- [ ] Array com outlier `[150, 200, 250, 300, 400, 500, 10000]` → `300` (caso do founder).
- [ ] Nao muta o array de entrada (verificar referencia + conteudo apos chamada).

### Helper `estimatedFieldSize` (`tests/unit/grade-planner/estimated-field-size.test.ts`)
- [ ] `{ guaranteed: 10000, buyIn: 100 }` → `100`.
- [ ] `{ guaranteed: "10000", buyIn: "100" }` → `100` (string aceita).
- [ ] `{ guaranteed: 0, buyIn: 100 }` → `null`.
- [ ] `{ guaranteed: 10000, buyIn: 0 }` → `null`.
- [ ] `{ guaranteed: undefined, buyIn: 100 }` → `null`.
- [ ] `{ guaranteed: 10000, buyIn: undefined }` → `null`.
- [ ] `{ guaranteed: "abc", buyIn: "100" }` → `null` (string invalida).
- [ ] `{ guaranteed: -100, buyIn: 100 }` → `null` (negativo).

### `getProfileStats` populates `medianFieldSize` (`tests/unit/grade-planner/getProfileStats-median.test.tsx`)
- [ ] 3 torneios com fields `[200, 500, 10000]` (todos com garantido valido) → `medianFieldSize === 500`.
- [ ] Nenhum torneio com garantido valido → `medianFieldSize === null`.
- [ ] Mix: 5 torneios, 2 sem garantido + 3 com `[300, 400, 500]` → mediana apenas dos validos = `400`.
- [ ] Lista vazia de torneios → `medianFieldSize === null`.

### `DayCard` renderiza linha de mediana (`tests/unit/grade-planner/DayCard-median.test.tsx`)
- [ ] `dayStats.medianFieldSize === 500` → DOM contem texto `Mediana: ~500 participantes`.
- [ ] `dayStats.medianFieldSize === 1234` → DOM contem texto `Mediana: ~1.234 participantes` (formato pt-BR).
- [ ] `dayStats.medianFieldSize === null` → linha NAO aparece no DOM (`queryByText(/Mediana:/)` retorna null).
- [ ] Linha posicionada apos a linha de tipo/velocidade (ordem DOM).

### `WeeklySummaryDashboard` (`tests/unit/grade-planner/WeeklySummaryDashboard-median.test.tsx`)
- [ ] Card exibe label **"Mediana Participantes"** (NAO "Media Participantes").
- [ ] Sublabel exibe **"Estimativa (mediana)"**.
- [ ] Conjunto `[150, 200, 250, 300, 400, 500, 10000]` (proxy fields) → valor exibido `300`, NAO `~1.686`.
- [ ] Nenhum torneio com garantido valido na semana → exibe `N/A`.

### `PlanningDialog` (`tests/unit/grade-planner/PlanningDialog-median.test.tsx`)
- [ ] Header do modal exibe "Mediana de Participantes: {X}" para conjunto com mediana valida.
- [ ] Tooltip presente — texto "Resistente a outliers — nao distorcida por torneios isolados muito grandes" acessivel via hover.
- [ ] Linhas existentes "Field Medio: +/- X" por torneio individual preservadas (regression check).
- [ ] Modal com 0 torneios validos → header exibe `N/A`.
- [ ] Outlier no conjunto → mediana exibida, nao media.

### Edge cases gerais
- [ ] `buyIn` em string com virgula (ex: `"100,50"`) — comportamento documentado: helper trata como invalido (parseFloat de `"100,50"` em JS retorna `100`, nao `100.50`). Aceitavel pois CSV parser ja normaliza para ponto.
- [ ] Torneios freeroll (`buyIn === 0`) → ignorados (retorna `null` em `estimatedFieldSize`).

### Regressao
- [ ] Suite existente de `tests/unit/grade-planner/**` passa sem alteracao.
- [ ] `npm run check` (tsc) exit 0.
- [ ] Nenhum consumer de `DayStats.avgFieldSize` quebra (grep confirma que nao havia consumer).

## Fora de Escopo
- **Buscar `tournaments.fieldSize` real do historico.** Esta spec atua apenas na agregacao (media→mediana) + ampliacao dos pontos de exibicao. Substituicao do proxy `guaranteed/buyIn` por dados reais e responsabilidade de uma spec futura (provavelmente "tournament-library-field-size-real").
- **Tocar em `ProfileComparison.tsx`.** Founder nao pediu. Se o componente exibir media de participantes em comparacao A vs B, fica como follow-up.
- **Tocar em `WeeklySummaryBar.tsx`.** Grep confirma que o componente nao exibe metrica de participantes — nada a fazer aqui.
- **Trimmed mean ou outras metricas robustas.** Mediana resolve o problema do outlier; complexidade adicional nao justificada.
- **Mudar fonte de dados.** Continua sendo o proxy `Math.round(guaranteed / buyIn)`.
- **Adicionar a metrica no `WeekGrid.tsx`, `TournamentChip.tsx` ou qualquer outro componente alem dos 3 listados.** Escopo estrito.
- **Internacionalizacao para outros idiomas.** Strings em pt-BR alinhadas com o resto do projeto.

## Dependencias
Nenhuma dependencia externa. Feature e self-contained — apenas codigo client-side existente.

Pre-requisitos confirmados:
- `tsconfig.json` ja resolve `@/lib/*` para `client/src/lib/*` (helper sera importavel via `@/lib/median`).
- shadcn `Tooltip` ja em uso no projeto (PlanningDialog provavelmente ja importa de `@/components/ui/tooltip`).
- vitest 4 + RTL ja configurados via `test.projects` (jsdom para .tsx).

## Notas de Implementacao (opcional)
- **Helpers em arquivo unico (`client/src/lib/median.ts`):** mantem coesao — ambos lidam com agregacao de field size. Se em alguma sprint futura `estimatedFieldSize` precisar ser reutilizado fora do contexto de Grade Planner, considerar separar em `client/src/lib/tournamentMath.ts`.
- **Reuso nos 3 pontos:** `WeeklySummaryDashboard`, `DayCard` (via `getProfileStats` em `GradePlanner.tsx`), e `PlanningDialog` devem todos importar de `@/lib/median` — nao reimplementar logica inline.
- **Arredondamento:** helper `median` retorna float; arredondamento (`Math.round`) e responsabilidade do caller. Isso evita perda de precisao em chains de calculo futuros (se algum consumer precisar do valor exato).
- **Test-writer:** atentar para lesson #14 (CLAUDE.md §9) — testes `.test.tsx` que carregam componentes React devem usar `await import(...)`, nao `require()`. Aplicavel a `DayCard-median.test.tsx`, `WeeklySummaryDashboard-median.test.tsx`, `PlanningDialog-median.test.tsx`, `getProfileStats-median.test.tsx`.
- **Test-writer:** para `getProfileStats-median.test.tsx`, considerar mockar `useQuery` do TanStack (ou importar a funcao `getProfileStats` standalone se ela for exportada de `GradePlanner.tsx` — caso contrario, sugerir ao implementer extrair `getProfileStats` para um helper `client/src/pages/grade-planner-helpers.ts` para facilitar teste).

## Arquivos Tocados (resumo)

**NEW:**
- `client/src/lib/median.ts` — helpers `median` + `estimatedFieldSize`.
- `tests/unit/lib/median.test.ts` — RF-01 + RF-02.
- `tests/unit/grade-planner/estimated-field-size.test.ts` — RF-02 (poderia coexistir no median.test.ts; separado para clareza).
- `tests/unit/grade-planner/getProfileStats-median.test.tsx` — RF-04.
- `tests/unit/grade-planner/DayCard-median.test.tsx` — RF-06.
- `tests/unit/grade-planner/WeeklySummaryDashboard-median.test.tsx` — RF-05.
- `tests/unit/grade-planner/PlanningDialog-median.test.tsx` — RF-07.

**MODIFY:**
- `client/src/components/grade-planner/types.ts` — RF-03 (`DayStats`: -`avgFieldSize`, +`medianFieldSize`).
- `client/src/components/grade-planner/WeeklySummaryDashboard.tsx` — RF-05 (calculo + labels).
- `client/src/components/grade-planner/DayCard.tsx` — RF-06 (linha nova).
- `client/src/components/grade-planner/PlanningDialog.tsx` — RF-07 (header agregado + tooltip).
- `client/src/pages/GradePlanner.tsx` — RF-04 (`getProfileStats` popula `medianFieldSize`).

## Verificacao Final
- [ ] Label "Mediana" presente nos 3 lugares (card semana, card dia, modal).
- [ ] Outlier de 10.000 em conjunto de 7 torneios medios ~300 produz output `300` (nao `~1.700`).
- [ ] `N/A` quando nenhum torneio tem garantido valido.
- [ ] Tooltip explicativo no modal acessivel via hover.
- [ ] Campo morto `avgFieldSize` removido de `DayStats` (e `emptyDayStats`).
- [ ] Zero regressao em testes existentes do grade-planner.
- [ ] `npm run check` exit 0.
- [ ] `npm run build` exit 0.
