# Sprint UX-QW-3 — Follow-ups UX-QW-2 + bug upload 500

**Data:** 2026-05-21
**Tipo:** Sprint cleanup (follow-ups + bug fix)
**Predecessor:** UX-QW-2 (commit 38e3184d, 2026-05-20)
**Branch:** main (commits diretos)

---

## Contexto

UX-QW-2 deixou 4 follow-ups documentados (memory/session_2026-05-20-ux-qw-2.md "Pendencias UX-QW-3"). Founder pediu sprint dedicado: dead code, helpers misplaced, telemetria faltando, calendar daysSince DST-aware. Adicionado bug upload 500 (RF-01 — verificado ja resolvido em commit 47c6aab0) + 2 NITs (RF-06 audit tokens, RF-07 exhaustive-deps).

**Escopo:** SOMENTE frontend + util shared + uma rota delete server. NAO toca IA layer (territorio Sprint A AI-3.1 paralelo).

---

## RF-01 — Bug upload CSV 500 pos-persist (P0)

**Status: JA RESOLVIDO em 47c6aab0 (2026-05-20).**

Verificacao:
- `server/routes/upload.ts` linhas 800-812: `storage.createUploadHistory` em `try/catch` separado + payload alinhado a schema.
- `client/src/components/AutoUpload.tsx` linha 129: `setError(msg)` direto, sem mask.
- `memory/followup_upload_500_pos_persist.md` atualizada `STATUS 2026-05-21: RESOLVIDO + VERIFICADO`.

**Acceptance:** memory marcada resolvida, sem regressao em testes upload existentes.

---

## RF-02 — Dead code `handleListWallets`

**Arquivo:** `server/routes/wallets.ts` linhas 153-177.

Handler exportado em UX-QW-2 RF-06 mas NUNCA registrado em rota. Comment explicito: "Nao registra rota nova". Unica referencia: `tests/integration/bankroll/listWallets-last-tx.test.ts` (testa handler que nao serve producao).

**Acao:**
- Deletar `handleListWallets` (linhas 153-177).
- Deletar `tests/integration/bankroll/listWallets-last-tx.test.ts`.

**Acceptance:**
- Grep `handleListWallets` retorna 0 hits.
- `npm run check` exit 0.
- `npx vitest --run tests/integration/bankroll` zero regressao.

---

## RF-03 — `calendarDaysSince` util (DST-aware)

**Problema:** 4+ implementacoes locais de `daysSince` (WalletStalenessBadge, dailyInsight, Dashboard inline, mentalPrepUtils) usam `Math.floor(diff_ms / 86_400_000)`. Off-by-one em transicoes DST quando fuso do user observa horario de verao.

Exemplo: user em `America/Sao_Paulo` (sem DST hoje, mas legado tem); ou US `America/New_York`. Em transicao DST, `diff_ms / 86_400_000` pode dar 1.96 ou 2.04 entre dois dias civis consecutivos.

**Acao:**
1. Criar `shared/calendarDaysSince.ts`:
   ```ts
   export function calendarDaysSince(
     from: Date | string,
     to: Date,
     timeZone: string,
   ): number;
   ```
   - Extrai `YYYY-MM-DD` de `from` e `to` no `timeZone` via `Intl.DateTimeFormat('en-CA', { timeZone, year, month, day })`.
   - Calcula diff em dias usando `Date.UTC(y,m-1,d)` dos dois strings.
   - Retorna inteiro (negativo se from > to). Retorna `NaN` se input invalido.

2. Migrar callsites (4):
   - `client/src/components/bankroll/WalletStalenessBadge.tsx:40-45`
   - `client/src/lib/home/dailyInsight.ts:82-94`
   - `client/src/pages/Dashboard.tsx:244-245`
   - `client/src/lib/mentalPrepUtils.ts:60`

   Cada callsite passa timeZone do user (vem de `useUserTimezone()` hook OU `Intl.DateTimeFormat().resolvedOptions().timeZone` como fallback).

3. **NAO migrar server** (`homeHeader.ts`/`immediateAction.ts`) nesta sprint — server ja tem fuso via storage (escopo separado).

**Acceptance:**
- Util `shared/calendarDaysSince.ts` com testes edge: DST forward (spring), DST backward (fall), cross-timezone (`America/Los_Angeles` user em `America/New_York`).
- 4 callsites client migrados.
- Comportamento default (UTC) mantem retro-compat para callers que nao passam timezone.

**ADR:** 175 (criado nesta sprint).

---

## RF-04 — Helpers `/pages` -> `/components`

**Acao:**
1. Grep `export function|export const` em `client/src/pages/**.tsx`.
2. Para cada export utilitario (nao um component default da pagina):
   - Se tem 2+ importers fora da propria pagina -> mover pra `client/src/components/<area>/utils.ts` ou `client/src/lib/<area>/`.
   - Se 0-1 importer -> deixar.
3. Atualizar imports.

**Acceptance:**
- Util movidos compilam (`npm run check` exit 0).
- Imports atualizados.
- Lista dos movimentos documentada no commit body.

---

## RF-05 — Telemetria `secondaryLink` (EmptyState.secondaryCTA)

**Problema:** UX-QW-2 RF-04 adicionou `EmptyState.secondaryCTA` mas cliques no botao secundario NAO sao tracked.

**Acao:**
1. Localizar telemetria existente. Candidatos: `client/src/lib/telemetry.ts` ou `client/src/lib/analytics.ts`.
2. Em `client/src/components/ui/EmptyState.tsx`, wrap `onClick` do secondaryCTA com `trackEvent('empty_state.secondary_cta_click', { context })`.
3. `context` = prop nova `telemetryContext?: string` (opcional, sem breaking change).
4. Plugar `telemetryContext` em 4 callsites principais: WeekGrid, GrindLiveEmptyState, Bankroll empty, Coach empty.

**Acceptance:**
- Clique no secondaryCTA dispara `trackEvent` com `context` quando passado.
- Teste unit garante invocacao (spy em mock).

---

## RF-06 — Auditoria `tokens.color.warn`

**Status:** `tokens.color.warn` JA EXISTE (`@/lib/ui-tokens.ts` linhas 85-89).

**Acao:** auditar callsites com `text-amber-/bg-amber-/border-amber-` direto e migrar para `tokens.color.warn.text/bg/border` quando o uso for semanticamente "aviso" (nao decorativo).

Grep mostra ~178 hits — escopo ainda viavel. **Filtrar SOMENTE os que usam combinacao text+bg+border de amber** (sinal forte de "warn semantico"); ignorar usos isolados (badges decorativas, gradients).

**Acceptance:**
- Lista de callsites migrados no commit body.
- Visual sem regressao (eye-test em paginas principais).

---

## RF-07 — TransferDialog `exhaustive-deps` warning

**Arquivo:** `client/src/components/bankroll/TransferDialog.tsx` linhas 67-85.

**Problema:** `useEffect` depende de `wallets` (array com identity instavel) mas ESLint `react-hooks/exhaustive-deps` reclamou. Workaround atual: `// eslint-disable-next-line` (linha 84).

**Acao:**
- Derivar chave estavel: `const walletsKey = useMemo(() => wallets.map(w => w.id).join('|'), [wallets])`.
- Mudar deps array para `[open, defaultFromWalletId, defaultToWalletId, walletsKey]`.
- Remover `eslint-disable-next-line` + comment "wallets ref muda...".
- Dentro do effect, ler `wallets` snapshot — sem mudanca de logica.

**Acceptance:**
- Sem `eslint-disable` para `exhaustive-deps` no arquivo.
- Comportamento identico (testes TransferDialog existentes verdes).

---

## Pipeline TDD

1. **pm-spec** (este doc).
2. **system-architect:** ADR-175 `calendar-days-since-dst-aware.md` + diagrama opcional.
3. **test-writer:** red phase — testes RF-03 (util + 4 callsites), RF-05 (spy telemetry), RF-07 (deps).
4. **implementer:** green phase — codigo RFs 02-07.
5. **/simplify:** revisar reuse.
6. **reviewer:** APPROVE.
7. **commit + push.**

**Commit message:**
```
feat(ux-qw-3): upload bug verify + 6 follow-ups UX-QW-2

RF-01 P0 upload 500: verificado resolvido em 47c6aab0.
RF-02: drop dead code handleListWallets + test orfao.
RF-03: shared/calendarDaysSince DST-aware + 4 callsites migrados.
RF-04: helpers /pages -> /components (lista).
RF-05: telemetria secondaryCTA wired em 4 EmptyStates.
RF-06: audit tokens.color.warn (lista de migracoes).
RF-07: TransferDialog exhaustive-deps sem eslint-disable.

ADR-175 calendar-days-since-dst-aware.
```
