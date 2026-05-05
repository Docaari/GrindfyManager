# ADR-120: Warm-up Reform — Block reshuffle, modos 6/15/30m, Setup editavel

**Data:** 2026-05-05
**Status:** Accepted
**Supersedes:** parcial ADR-027 (gate emocional bloco 1 -> bloco 2)

## Contexto

Founder pediu refatoracao da pagina /mental:

1. Botoes duplicados de Ferramentas de Apoio (Meditacao+Timer, Visualizacao+Guia, 2x Biblioteca audios) — 1 botao por ferramenta sempre visivel.
2. Selecao de duracao 6m / 15m / 30m antes do warm-up (em vez de 10m fixo).
3. Setup Fisico vira PRIMEIRA etapa (era ultima); editavel (add/edit/remove items); min 3 marcados (era 4/6); inclui "Bancas das plataformas verificadas".
4. Timer global so inicia na etapa Respiracao (Setup nao consome tempo).
5. Heuristicas editaveis a qualquer momento (nao apenas vazias).
6. Intencao opcional (3 textareas).
7. Drills GTO/Estudo vira ultima etapa (era 3a).

## Decisao

### Nova ordem de blocos

| Bloco | Antes (Sprint W-1) | Reform 2026-05-05 |
|-------|--------------------|--------------------|
| 1 | Check-in emocional | Setup fisico |
| 2 | Foco semana (heuristicas) | Respiracao + check emocional |
| 3 | Drills PFC | Foco semana (heuristicas) |
| 4 | Setup fisico | Intencao (opcional) |
| 5 | Intencao | Drills GTO/Estudo (PFC) |

### Tempos por modo (segundos)

```ts
"6m":  { breathing: 60,  heuristics: 60,  intention: 120, pfc: 180 }   // total 7m (rotulado 6m)
"15m": { breathing: 360, heuristics: 120, intention: 120, pfc: 360 }   // total 16m (rotulado 15m)
"30m": { breathing: 720, heuristics: 180, intention: 180, pfc: 720 }   // total 30m exato
```

Setup nao tem timer cronometrado. Total real do "6m" sao 7m e do "15m" sao 16m por design (founder priorizou tempos de drills/respiracao bem definidos sobre rotulo exato).

### Setup Fisico — items custom

- Persistencia: `localStorage` com chave `warmup-setup-items-v1::${userPlatformId}` (segregada por user).
- Defaults (7 items): os 6 originais + "Bancas das plataformas verificadas".
- Min 3 marcados para avancar (era 4 de 6 fixos).
- Payload em `WarmupBlockSnapshot`: `setupItems: Record<string, boolean>` + `setupItemsList: string[]` (lista atual no momento da gravacao).
- TODO: migrar para `user_settings.warmupSetupItems jsonb` (ainda nao prioritario).

### Intencao opcional

- Cliente: botao "Proximo" sempre habilitado. Se 3 textareas vazias, payload = `null`.
- Servidor (`server/routes/warmup-rituals.ts`): validation `version=full` NAO mais exige `sessionIntention != null` (regra removida).

### Resume mode + mode persistence

- `useWarmupRitual.start(mode)` aceita modo e persiste em `warmup-ritual-draft.mode`.
- `restoreDraft()` retorna o mode salvo.
- Helper exportado `readDraftMode()` permite ao container `MentalPrep` saber qual mode usar antes de montar o Runner.

### Override path

- `useWarmupRitual.confirmOverride()` agora persiste `blocksData[currentBlock]` com `{blockId, emotionalCheckScore, overrideUsed: true}` em vez de so incrementar bloco. Garante audit completo no payload final.

### `abort(reason, opts)`

- Aceita `opts.emotionalCheckScore` para evitar race com setState async em `gate_no_go`.

## Compatibilidade — dados pre-reform

Snapshots em `warmup_rituals.blocks_completed` gravados ANTES de 2026-05-05 usam ordem antiga e `setupItems` com shape fixed. Snapshots POS-reform usam nova ordem + `Record<string, boolean>` + `setupItemsList`.

**Estrategia adotada (deferred):** Sem migration UPDATE no DB. Comentarios em `shared/schema.ts:WarmupBlockSnapshot` documentam ambas as semanticas. Consumers que indexam por blockId DEVEM usar `created_at >= 2026-05-05` como cutoff. Como nenhum dashboard / Coach AI tool atual consulta `blocks_completed` por blockId fixo (auditado em `git grep blocksCompleted` — uso eh apenas append-only), o break e tolerado.

Caso futuro consumer precise da semantica antiga, criar `migrations/00XX_warmup_blockid_reshuffle.sql` aplicando UPDATE com mapping documentado nesta ADR.

## Consequencias

- Code: `~12 arquivos modificados, 3 novos (durations.ts, DurationSelector.tsx, setupItemsStore.ts, lib/timeFormat.ts)`.
- Testes: 258/258 verde (8 arquivos atualizados para nova spec).
- ADR-027 cross-field validation atualizada (sessionIntention nao mais obrigatorio em version=full).
- Pre-reform `blocks_completed` continua valido em DB; consumers futuros precisam ser dual-aware.

## Alternativas consideradas

1. **Migration UPDATE renumerando blockId** — descartado: pre-reform data nao tem consumer ativo, migration desnecessaria.
2. **Mudar `blockId` para `blockType: 'setup'|'breathing'|...`** — preferivel longo prazo, mas requer migration grande e nao ha consumer ativo justificando agora.
3. **Manter `setupItems` fixed shape e ignorar customizacao** — descartado: bloqueia o pedido do founder (add "Bancas das plataformas verificadas").
4. **Persistencia `warmupSetupItems` em `user_settings`** — descartado MVP: requer migration + endpoint. localStorage segregado por userId resolve no contexto local-dev atual.

## Referencias

- Pedido founder: sessao `warm-up` 2026-05-05 (3 sessoes paralelas em /home, /grind, /bankroll).
- Reviewer findings: BLOCKER-1 (override), HIGH-1 (setupItems shape), HIGH-2 (blockId reshuffle), HIGH-3 (mode loss em resume), HIGH-4 (flushSync), MEDIUM-2 (pause), MEDIUM-3 (multi-user), MEDIUM-4 (cancel score), LOW-1 (intention server), LOW-2 (BreathingBox ceil), NIT-1 (formatMmSs DRY), NIT-2 (aria-live).
