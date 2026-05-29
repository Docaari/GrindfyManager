---
name: session_2026-05-29-library-evolution-fases-1-4
description: Sprint library-evolution Fases 1-4 implementadas (agrupamento 2 níveis, insights, schema/parser/upload-enriquecido, $/hora-mesa). Plano keen-jumping-petal com Fases 5-6 (Overview) documentadas.
metadata:
  type: project
---

# Library Evolution — Fases 1-4 SHIPPED (working tree, NÃO commitado ainda)

Plano: `C:\Users\ricar\.claude\plans\keen-jumping-petal.md`. Founder pediu evolução do /library ("Torneios") — quase nada aparecia + zero insight. Em plan mode aprovou escopo completo; ideias novas (Overview, baixa-variância) surgiram mid-sessão.

## Fase 1 — agrupamento determinístico 2 níveis (sem migração)
- `server/services/libraryGrouping.ts` NOVO: `canonicalBuyIn` (snap ±3%/floor $0.15), `buyInTier` (delega `bucketBuyIn`), `stripNameNoise`+`nameSignature` (camadas), `groupTournaments` O(n) família(`site|buyInTier|type`)→específico(`+nameSignature|speed`). Determinístico (sem fuzzy — droppado no /simplify).
- `shared/library-grades.ts` NOVO: grades recalibradas A≥500/B≥200/C≥100/D≥50/F≥30, `MIN_GROUP_VISIBLE=30`, `FAMILY_GROUP_FLOOR=10`. SSoT server+client.
- `storage.ts getTournamentLibrary` reescrito: `groupTournaments` + `computeGroupMetrics` extraído (família E específicos). Removidos os 6 helpers antigos O(n²).
- UI `TournamentLibraryNew.tsx`: badges variações/amostra-baixa + seção "Variações" no Dialog.
- Reviewer APPROVED-WITH-NITS → nits aplicados (coachContext lean projection, labels de volume, empty-state, canonicalBuyIn no display name).

## Fase 2 — insights "Destaques e Vazamentos" (sem migração)
- `server/insights/libraryInsights.ts` NOVO: `computeLibraryInsights` puro — shrinkage K=30 toward baseline + CI95 (sdProfit/√n/avgBuyin) + MIN_DELTA 8pp + floor 30/composite 50. `reason: 'roi'|'low_variance'`.
- `storage.getTournamentLibraryInsights` + `getInsightDimension` (query uniforme STDDEV_SAMP). 8 dimensões Promise.all (site/buyIn/type/speed/fieldSize/dayOfWeek/deepStack/composite).
- Endpoint `GET /api/tournament-library-insights`. Seção UI acima do grid.

## Fase 3 — schema + parser + upload enriquecido (MIGRAÇÃO 0081 PENDENTE psql founder)
- Migração `0081_tournaments_duration_deepstack.sql` (+rollback): duration_seconds, players_per_table, structure, game_type, starting_stack_bb, deep_stack. Tudo nullable/default. **Aplicar via psql.**
- `csvParser.ts`: `parseDurationToSeconds`/`normalizeStructure`/`normalizeGame` + captura no `parseSharkScopeFormat` (campos antes descartados).
- `tournament-type-detector.ts`: `detectStackDepthFromName` (regex bb + deep keyword, threshold 50bb) + `DetectedTypeFields` estendido.
- `upload.ts`: insert map +6 campos; branch `duplicates_found` chama `enrichExistingTournaments` (UPDATE COALESCE só onde duration NULL, match TOLERANTE igual dedup, chunks paralelos cc=20) + `enrichedCount` no response. **Re-import enriquece linhas existentes com duração (não duplica).**
- Backfill `scripts/backfill-stack-depth-2026-05-29.ts` (deepstack do nome, sem re-import).

## Fase 4 — $/hora-mesa + deepstack (sem migração)
- `computeGroupMetrics`: `profitPerTableHour` (= profitWithDuration/Σduration·3600 — numerador/denominador no MESMO subconjunto, HIGH-1 fix), `durationCoverage`, `deepStackRate`.
- Dimensão `deepStack` nos insights + chip "$/hora-mesa" no Dialog (gate coverage≥60% + tooltip caveat multi-tabling).
- Reviewer R1 CHANGES-REQUESTED 2 HIGH → fixados: HIGH-1 ($/h numerador), HIGH-2 (enrich match exato→tolerante, evita enrichedCount=0 silencioso com buyIn "5.50" vs 5.5), MEDIUM perf (chunks paralelos).

## Baixa variância (founder)
Field pequeno(<100)/médio(100-500) destaque → `reason='low_variance'` + dica acionável "priorizar na grade". Embasamento: Docs/strategy/mtt-variance-study-guide + research_variance.

## Status
tsc 0. ~189 testes adjacentes + 52 novos verde. Zero regressão. **NÃO commitado** (working tree tinha trabalho paralelo do founder VR-3 — AggregationWizard/GradePlanner/WeekGrid; usar `git add` EXPLÍCITO só dos meus arquivos, nunca -A).

## Fase 5 — Overview (SHIPPED main 9268d2b9) + fixes pós-merge
Tudo em **main** (não mais feature). Sequência de commits em main: `5cf9eb2b` (Fases 1-4) → `30caa7bd` (fix limpeza granular cap 5000→100k + erro real) → `e7d599af` (fix parser: header Sharkscope com sufixo TZ "Data de Início (America/Sao_Paulo)" → 0 torneios; normalizePortugueseHeaders agora match exato senão tira "(...)") → `9268d2b9` (Fase 5 Overview). Integração via worktree isolado B:/grindfy-integrate + junction node_modules + cherry-pick (NÃO merge da feature — feature carrega 4 commits paralelos grind-live/coach do founder que conflitam com main).
- **Overview** (`server/services/overviewAnalysis.ts` puro, 6 testes): upload CSV grande multi-jogador EFÊMERO (não persiste) → analyzeOverview agrupa (reusa groupTournaments) + métricas pool-level + reasons (ROI médio do field / baixa variância field<500 / $/hora-mesa) + recentResults (nome+nick+pos+prize). Rank top N por plataforma, minVolume 20.
- Parser: captura `playerNick` (coluna Jogador). Schema + Migration 0082 `saved_tournament_highlights` (UNIQUE user+familyKey, upsert onConflictDoUpdate). storage list/save/delete. Endpoints POST /api/library/overview/analyze (multipart efêmero) + GET/POST/DELETE /api/library/highlights.
- UI: OverviewPanel (dialog) + SavedHighlightsStrip (cards fixados topo /library, badge motivo, remover). Botão Overview no header.
- **Migrations 0081 + 0082 aplicadas no DB LOCAL** (psql localhost:5433). Re-import do CSV (4) feito programaticamente (USER-0001): 3461 enriquecidos duração + 496 novos = 19110 total, 3893 com duração, 1097 deepstack.
- Reviewer Fases 2-4 fixes aplicados: HIGH-1 ($/h numerador=denominador subset), HIGH-2 (enrich match tolerante = dedup), MEDIUM perf (chunks paralelos cc=20).

## Pendências
- **Deploy prod:** aplicar migrations 0081 + 0082 no Neon (só rodadas no local).
- **Fase 6 polish (task #6):** drill-down de card salvo (re-derivar recentResults+nick do histórico — não é persistido), reconciliação família salva↔atual, coach awareness.
- **Migração 0081 via psql** (founder) + re-upload CSV pra duração popular + rodar backfill deepstack.
- Fases 5 (Overview: CSV efêmero pool multi-jogador, tabela `saved_tournament_highlights`, captura nick) + 6 (adaptar engine: famílias fixadas no topo, salvar/abrir card com drill-down de resultados+nick) — sprints próprios, documentados no plano.
- Test follow-up: regressão de cobertura parcial do $/h + match tolerante do enrich (computeGroupMetrics é private; via integração).
