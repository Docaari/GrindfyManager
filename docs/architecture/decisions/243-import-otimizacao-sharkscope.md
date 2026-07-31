# ADR-243 — Otimização do sistema de importação (SharkScope) + câmbio por data

- Status: Accepted
- Data: 2026-07-31
- Contexto sprint: `import-otimizacao`. Auditoria e reforma do pipeline de import de CSV, do manejo do que foi importado e das métricas derivadas.
- Migrations: **0074** (nunca aplicada no local — reparo), **0097** (colunas novas), **0098** (back-fill `converted_to_usd`), **0099** (correção de FK `upload_history`).

## Contexto

Auditoria do pipeline de import contra um export **real** do SharkScope (formato "Player Group": 22 colunas, 1.183 torneios, 6 contas, 6 redes, moedas USD+CNY) e contra o DB do founder (126.108 torneios). Método: rodar o parser de produção sobre o arquivo, comparar coluna a coluna com o CSV cru e conferir o resultado agregado com a tela do próprio SharkScope.

Achados que motivaram a decisão (todos medidos, não estimados):

| # | Achado | Evidência |
|---|---|---|
| A1 | **Três mapeamentos divergentes** `ParsedTournament -> INSERT` (28 / 22 / 22 campos). O fluxo usado pela UI (`check-duplicates` → `upload-with-duplicates`) era o mais pobre | `rake` e `duration_seconds` **100% nulos** em 126.108 linhas, apesar de o parser extraí-los |
| A2 | Coluna `Prêmio` (prêmio bruto do jogador) gravada em `prize_pool` | `Prêmio == Resultado + investimento` em **364/364** linhas — é ganho do jogador, não premiação total |
| A3 | ITM definido como `prize > 0`, mas `prize` é lucro **líquido** | **134 das 364** premiações (37%) tinham líquido ≤ 0 → ITM exibido 19,3% vs 30,8% real (**−11,5 p.p.**) |
| A4 | Coluna `Bandeiras` só alimentava heurística de nome | `Satellite` em 104 linhas, detecção pegava **6**; `Rebuy` (256) e `Multi-Entry` (815) davam `allowsAddOn/Reentry` false em **1179/1179** |
| A5 | Fuso declarado no cabeçalho (`Data de Início (America/Sao_Paulo)`) lido como UTC | erro fixo de 3h; torneio 21h+ caía no dia UTC seguinte |
| A6 | Linhas rejeitadas descartadas em silêncio (`rowErrors` montado e jogado fora; `else` vazio na validação) | 4 linhas WPT sem `Nome` sumiam — deslocavam lucro em $46,58 e investimento em $128 |
| A7 | `converted_to_usd` nunca gravado, mas o guard de leitura confia nele | **dupla conversão**: ¥388 (~US$54) aparecia como **US$7,48** na Biblioteca (191 linhas expostas) |
| A8 | Câmbio flat das settings (defaults chumbados BRL 5,0 / CNY 7,20 / EUR 0,92) | única divergência de valor vs SharkScope na conta GGNetwork |
| A9 | FK de `upload_history.user_id` apontava para `users.id` (nanoid), mas o código grava `USER-XXXX` | **todo** insert violava a FK; silenciado por try/catch → tabela com 0 linhas desde sempre |
| A10 | XLSX: `parseBodogXLSX(fileContent /* string */)` no fluxo da UI (assinatura exige `Buffer`) | todo upload de planilha dava 400 nesse caminho |
| A11 | `tournaments` sem vínculo com o upload; histórico com `.limit(5)` e prune destrutivo a 5 | impossível desfazer import ou auditar origem |

## Decisão

### D1 — Um único mapeamento de INSERT
`server/services/tournamentInsertMapper.ts` (`buildTournamentInsertRow` / `mapParsedToInsertRows`) passa a ser o **único** ponto que converte `ParsedTournament` em row. Os 3 endpoints (`/api/upload-history`, `/api/upload-with-duplicates`, `/api/upload`) o consomem. Contrato: todo campo de `ParsedTournament` tem destino explícito ou está em `INTENTIONALLY_NOT_PERSISTED`.

**Multi-rede (restrição do founder):** o mapper **não interpreta CSV**. Cada rede mantém seu parser e sua semântica; campo que a rede não traz fica `null` (não 0, não false) — lesson #7. Nenhum parser de rede nativa foi alterado neste sprint.

### D2 — Colunas novas (Migration 0097)
`gross_prize`, `bounty_prize`, `player_nick`, `end_date`, `field_total_entries`, `flags jsonb`, `upload_id`, `buy_in_native`, `prize_native`, `fx_rate_used`, `fx_source`, `fx_rate_date`, `source_timezone` em `tournaments`; `rows_in_file`, `rejected_count`, `import_summary jsonb` em `upload_history`. Additive-only, tudo nullable sem default.

### D3 — Semântica correta do prêmio + ITM
`Prêmio`/`Prize` → `gross_prize`. `prize_pool` só recebe uma coluna de premiação **total** de verdade (export inglês) — a checagem usa a presença do header PT original, já que `normalizePortugueseHeaders` espelha `Prêmio` → `Prize Pool`.

ITM canônico = `gross_prize > 0`, com fallback `prize > 0` para linhas anteriores à 0097. Corrigido em 4 pontos de `storage.ts` (dashboard stats, quick-stats, por-site, cálculo JS).

### D4 — Bandeiras como fonte declarada
`shared/sharkscope-flags.ts` (puro) interpreta a coluna e devolve sinais estruturados. `enrichTournamentTypeFields` ganha `flagSignals?` **opcional e aditivo**: quem não passa mantém exatamente o comportamento antigo. Quando presente, a bandeira **vence** o nome (dado declarado pela rede > heurística de string). Precedência do tipo primário (mutex, ADR-031): `Satellite > Mystery > PKO > Add-on`. Token desconhecido é preservado em `tournaments.flags` — bandeira nova do SharkScope nunca vira perda silenciosa.

O `parseCSV` passou a fazer **OR** (antes sobrescrevia) entre `detectAddonReaFromName` e o que o parser da rede já detectou.

### D5 — Fuso declarado no cabeçalho
`shared/wallclock-timezone.ts` (puro, usa `Intl` da runtime → respeita DST histórico sem tabela própria). `wallClockToUtc` + `timezoneFromHeader`. Sem fuso no cabeçalho, cai no `parseDate` legado (zero regressão para as outras redes). Persistido em `source_timezone`.

### D6 — Câmbio por data do torneio
`server/services/fx/historicalFxResolver.ts`. Núcleo **puro** (`pickHistoricalRate`, `applyHistoricalFx`, `summarizeFxNeeds`) + `buildHistoricalFxTable` (I/O). Cascata registrada em `fx_source`:

1. `historical_exact` — cotação do próprio dia
2. `historical_prev` — último dia útil anterior (janela `MAX_PREV_DAYS = 7`)
3. `historical_nearest` — cotação mais próxima em qualquer direção
4. `import_rates` — taxa flat das settings (comportamento antigo, fallback)

Fonte: `system_fx_rates` (BCB PTAX para BRL, Frankfurter/ECB para o resto); datas ausentes são buscadas no provider **best-effort** (uma requisição por lote, timeout 20s) e persistidas para o próximo import. Qualquer falha de rede/DB degrada para a taxa flat e loga antes do fallback (lesson #9) — o import nunca é derrubado por câmbio.

A re-valorização é **exata e reversível**: guardando `fx_rate_used` e os valores nativos, converter de volta é `valor * fxRateUsed`. Por isso dá para re-valorizar um histórico já importado **sem reimportar** (foi assim que as 171 linhas CNY do teste foram corrigidas).

### D7 — Import observável e reversível
- `parseCSVDetailed` devolve `{ tournaments, report }` com `rowsInFile`, `parsedCount` e `rejected[{rowNum, reason, rowData}]`. `parseCSV` mantém a assinatura antiga (12 arquivos de teste + 3 endpoints dependem dela).
- `server/services/importReconciliation.ts` (puro) monta o resumo: lidas / parseadas / duplicadas / inseridas / rejeitadas + `rejectedByReason` + avisos de qualidade (ex.: "349 de 1183 sem posição final"). Vai na resposta HTTP **e** em `upload_history.import_summary`.
- Linha com `Nome` vazio deixa de ser descartada: nome sintetizado (`[sem nome] {site} {buy-in} #{id}`) + `nameSynthesized` para auditoria.
- `POST /api/upload-history/:id/undo` remove os torneios daquele `upload_id` (escopo do usuário) e invalida caches.
- `GET /api/upload-history` paginado (default 20, teto 100); prune destrutivo subiu de 5 para `UPLOAD_HISTORY_MAX_ROWS = 200`.
- A prévia (`check-duplicates`) aplica a **mesma** re-valorização do import, senão os números mostrados antes de confirmar não bateriam com os gravados.

### D8 — Correções de dados e de infra
- **0098** back-fill `converted_to_usd = true` nas 191 linhas não-USD já convertidas (mata a dupla conversão). Marcadas com `fx_source = 'backfill_0098'` para o rollback ser cirúrgico.
- **0099** FK de `upload_history.user_id` → `users(user_platform_id)`, alinhando DB ao schema drizzle.
- **0074** aplicada (estava pendente no local): `processed_count` + `idx_upload_history_status`.
- `/api/upload-stats` passa a respeitar a regra de histórico (CLAUDE.md §6.1, `grind_session_id IS NULL`).
- XLSX no fluxo da UI recebe `file.buffer` (era `string`).

## Alternativas consideradas

- **Converter no read em vez do import**: arquitetonicamente mais limpo (guardar só nativo), mas o raio de impacto atinge todos os agregadores de dashboard/analytics/library. Escolhido o meio-termo: converter no import **e** guardar nativo + taxa + data + origem, o que já torna a valorização auditável e refazível.
- **Fixar CNY em 6,86** (taxa implícita do SharkScope no período): rejeitado — resolve um arquivo, não o problema. Com câmbio por data o GGNetwork bateu exato usando cotação real do ECB.
- **Generalizar um parser único multi-rede**: rejeitado explicitamente pelo founder — cada rede publica o CSV de um jeito e foi conferida uma a uma. Toda mudança de semântica ficou restrita ao parser do SharkScope.

## Consequências

**Positivas**
- Import fiel ao arquivo: 1.183/1.183 linhas, zero descarte silencioso.
- Aderência ao SharkScope: GGNetwork **630 / −$3.611 / −13,4%** = idêntico. Demais redes divergem apenas pelas 15 linhas que o próprio export não trouxe.
- Métricas novas destravadas no mesmo lote: rake real ($4.393 = 8,2% do investido), 8.143h de mesa, ITM correto, ROI por bandeira (Satélite **−76,3%** em 104 torneios, antes classificados como Vanilla), ROI por tamanho de mesa e por conta.
- Import reversível e auditável (`upload_id` + reconciliação persistida).

**Negativas / dívida**
- Convivência de duas gerações de linhas: as anteriores à 0097 não têm `gross_prize`/`rake`/`duration` (só voltam com re-import dos CSVs). O fallback de ITM cobre a leitura, mas relatórios por rake/duração ficam parciais nesse histórico.
- `applyHistoricalFx` roda **depois** do parse (re-valoriza) em vez de o parser já receber o resolver — escolha deliberada para não alterar a assinatura dos 13 parsers de rede. Matematicamente exato, porém é uma etapa a mais no fluxo.
- `system_fx_rates` não cobre todo o histórico (só fev/2026 + o que o import busca sob demanda); datas antigas caem em `historical_nearest`. Popular a série completa é follow-up.
- `describeRejection`/`rejectedSample` têm cap de 50 linhas no jsonb — arquivo com milhares de rejeições mostra amostra, não tudo.

## Notas de implementação

- Módulos puros (testáveis sem DB): `shared/sharkscope-flags.ts`, `shared/wallclock-timezone.ts`, `server/services/importReconciliation.ts`, núcleo de `historicalFxResolver.ts`.
- `buildHistoricalFxTable` usa query builder do drizzle: `currency = ANY(${array})` via template `sql` interpolava o array como um único bound param e quebrava a query.
- Cobertura: 55 testes novos em `tests/unit/import-otimizacao/` + 294 de parser/upload preservados (nenhum parser de rede alterado).
