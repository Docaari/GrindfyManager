# Monitor Report — 3 AFK Sessions 2026-05-01

**Generated:** 2026-05-01 (post-session)
**Branches inspected:** `feature/bankroll-3`, `feature/spot-screenshots`, `feature/stats-analyzer-v2`
**Base:** `main`

---

## TL;DR

| Branch | Pushed? | B-area tests | Pre-existing fails | Blockers | Merge rank | Risk |
|--------|---------|-------------|-------------------|----------|------------|------|
| `feature/bankroll-3` | ✅ YES | 400/400 ✅ | 124 (pre-existing) | 0 | 1st | LOW |
| `feature/spot-screenshots` | ❌ NO | unknown | unknown | UNKNOWN | Hold | HIGH |
| `feature/stats-analyzer-v2` | ✅ YES | 143/143 ✅ | 125 (pre-existing) | 0 CRITICAL | 2nd* | MED |

\* Stats-V2 merge requires manual conflict resolution vs bankroll-3 (see §5).
Typecheck: not runnable — no `node_modules` installed in this environment; both worktrees returned TS2688 (missing `@types/node`) as an environment artifact only.

---

## §1 — Branches Found vs Missing

```
Remote branches fetched:
  origin/feature/bankroll-3         ✅ PUSHED
  origin/feature/stats-analyzer-v2  ✅ PUSHED
  origin/feature/spot-screenshots   ❌ MISSING
  (also found unrelated: f4-primedope, stats-analyzer, wpn-csv-parser-fixes,
   fix/csv-import-logic-and-error-handling)

Local search for feature/spot-screenshots: not found
git fetch origin '+refs/heads/feature/*:refs/remotes/origin/feature/*': no spot branch returned
```

**Conclusion on spot-screenshots:** The session either did not complete, or the reviewer flagged CRITICAL/HIGH blockers and withheld the push per instructions. No status report file, no local worktree remains. Founder must check `memory/session_2026-05-01-spot-screenshots.md` on local machine for session logs.

---

## §2 — Per-Branch Detail

### 2A — feature/bankroll-3

**Commits (10 total, relative to main):**
```
90e5875 docs(bankroll-3): status report ponta-a-ponta complete (Sprint Bankroll-3)
30e3c77 feat(bankroll-3): UX round — wire orphan components + reframe + delta
f265df0 fix(bankroll-3): round 3 — fee audit + RF-10 cleanup + test oracle
7040e13 fix(bankroll-3): round 2 — 8 CRITICAL + 6 HIGH from reviewer
46ea013 refactor(bankroll-3): simplify pass — DRY + remove anti-patterns
80df43f feat(bankroll-3): green phase — RF-2/3/4/5/6/7/8/11 complete + RF-9 standalone
151c7f3 test(bankroll-3): red phase 230 testes para 12 RFs
557d5c2 docs(bankroll-3): spec + ADRs 058-061 + diagrams
e7da28e fix(migrations): rename 0006_bankroll_management_enabled to 0012 (collision fix)
1dca493 feat(grind-live): summary inline reconcile + bankroll management toggle + cooldown bug fixes
```

**Diff stat:** 86 files changed, +16,749 / −151

**RFs:**
| RF | Description | Status |
|----|-------------|--------|
| RF-1 | Rename 0006→0012 migration | ✅ DONE |
| RF-2 | Auto-snapshot post-cooldown (idempotent) | ✅ DONE |
| RF-3 | Auto-bind tournament→wallet | ✅ DONE |
| RF-4 | Cross-wallet transfer (FX, FK RESTRICT, fee audit) | ✅ DONE |
| RF-5 | Pending transactions (cap 10/wallet) | ✅ DONE |
| RF-6 | Stop-loss/win lock (USD, TZ, 12h default) | ✅ DONE |
| RF-7 | ROI dashboard by platform (top10, 30d, delta) | ✅ DONE |
| RF-8 | Migration 0018 origin column | ✅ DONE |
| RF-9 | `BankrollReconcileSection` standalone | ⚠️ PARTIAL (wiring to SessionSummaryModal pending — DEBT-1) |
| RF-10 | Cleanup CTAs `summary-modal-cta-*` | ✅ DONE |
| RF-11 | `fxResolver` unified (cascade + 5min cache) | ✅ DONE |
| RF-12 | QueryKey userId hooks F4 | ➖ SKIP (F4 not on main; documented ADR-061) |

**Suite:** 6,966 total · 6,711 passing · 124 failing (all pre-existing, zero bankroll-3) · 17 skipped
**B3 area:** 400/400 ✅

**R9_FALLBACK markers:** 0

**Reviewer verdict:** READY_TO_MERGE (3 reviewer rounds completed)

**Debts registered:**
- DEBT-1: RF-9 wiring to `SessionSummaryModal` incomplete; `BankrollReconcileSection` exists but not wired
- CRIT-6 (ADR-058 addendum): auto-snapshot atomicity weak — fail logged but does not block cooldown finish; accepted as intentional

**New files (key):**
- `server/services/fxResolver.ts`, `stopService.ts`, `dashboardService.ts`
- `client/src/components/bankroll/{StopBanner,TransferDialog}.tsx`
- `client/src/components/dashboard/RoiByPlatformCard.tsx`
- `client/src/components/grind-session-live/BankrollReconcileSection.tsx`
- `migrations/0017_wallet_transfers.sql`, `migrations/0018_auto_snapshot_meta.sql`

---

### 2B — feature/spot-screenshots

**Status:** NOT PUSHED — no remote branch, no local branch, no worktree remnants.

**Status report file:** `docs/sprints/sprint-spot-screenshots-status.md` → NOT FOUND (branch missing).

**What to check:** `memory/session_2026-05-01-spot-screenshots.md` on founder's local machine. Session may have been abandoned mid-pipeline or reviewer withheld push due to CRITICAL blockers. Migration 0019 (reserved) was not created.

**Action required:** Founder must triage manually before scheduling a retry.

---

### 2C — feature/stats-analyzer-v2

**Commits (19 total, includes F3 cherry-pick base):**
```
0ca4d2d docs(stats-v2): status report sprint-stats-v2
8121c86 feat(stats-v2): UX polish (HIGH-1..3 + MEDIUM-1..2 + LOW-1)
4b7c70f fix(stats-v2): apply reviewer round 1 majors+minors
0e7ac04 refactor(stats-v2): simplify pass
b7cc457 feat(stats-v2): comparator V2 + customizer V2 + wizard + editor
95d38f6 feat(stats-v2): coach tool grouped + import preview endpoint
4b281c1 feat(stats-v2): catalogo HUD shared + direction logic
78bded4 test(stats-v2): red phase 132 testes
ee93a13 docs(stats-v2): ADRs 062/063 + mermaid flows
1b38a8e docs(stats-v2): spec sprint-stats-v2
db1f4db merge: F3 stats-analyzer into V2 base
3577cd0 refactor(studies): F3 W5 — simplify + review + E2E + memory
c1cc009 feat(studies): F3 W4 — templates + wizard + Coach tool integration
f7dff88 feat(studies): F3 W3 — layout customizer + comparator
44ec404 feat(studies): F3 W2 — UI manual snapshot editor
732308b docs(studies): F3 stats analyzer ADR + spec
(+ 3 more F3 commits sharing base with main)
```

**Diff stat (vs main):** 87 files changed, +15,017 / −54

**RFs:**
| RF | Description | Status |
|----|-------------|--------|
| RF-01 | HUD catalog `hud-stat-catalog.ts` (217 stats, 16 groups) | ✅ DONE |
| RF-02 | 16 groups all IDs per spec | ✅ DONE |
| RF-03 | 4 new templates | ✅ DONE |
| RF-04 | Customizer 200 stats (search, filter, pills) | ✅ DONE (drag-drop DEFER) |
| RF-05 | Snapshot editor refactor (auto-save 1s, paste PT4, CSV) | ✅ DONE |
| RF-06 | Comparator direction semantics (4 colors, ColorLegend) | ✅ DONE |
| RF-07 | Coach tool grouped (ADR-062, biggest_leak weighted) | ✅ DONE |
| RF-08 | Post-import wizard (no auto-submit, forceOpen, skip tooltip) | ✅ DONE |
| RF-09 | Backfill F3 layouts | ➖ DEFER (no red tests; no migration needed) |
| RF-10 | Zod runtime validation (direction + unit enum) | ✅ DONE |
| RF-11 | Heatmap visual | ➖ DEFER (no red tests; dedicated sprint) |
| RF-12 | Trend chart | ➖ DEFER (align with retention sprint) |
| RF-13 | Export PDF comparator | ➖ DEFER (authorized D8) |
| RF-14 | is_custom flag preserve | ➖ DEFER (no red tests) |
| RF-15 | Catalog static in code (no DB persistence) | ✅ DONE |
| RF-16 | Perf criteria (<500ms/200ms via content-visibility) | ✅ DONE |

**Suite:** ~6,654 passes · 125 failing (pre-existing baseline coach broken) · 143 V2-directed all green
**R9_FALLBACK markers:** 0

**Reviewer verdict:** APPROVED-CLEAN (round 3). Push was pending (zero blockers) — session confirmed pushed.

**Debts registered (V3+):**
- Drag-drop real (`@dnd-kit/sortable`)
- Population benchmark static (V3 dynamic)
- Export PDF
- StatCell `React.memo`
- A11y accordion keyboard
- Wizard banner reopen banner in /studies
- Dead code: `server/coach/tools/readUserHudStats.ts`

**Note on F3 dependency:** Stats-V2 incorporated `feature/stats-analyzer` (F3) as its base via merge commit `db1f4db`. F3 adds migration `0013_stats_analyzer.sql`. If F3 was not previously merged to main, this migration file and the underlying schema changes come in via stats-v2. F3 branch (`origin/feature/stats-analyzer`) is present on remote — founder must decide whether to merge F3 standalone first or let V2 carry it (current branch already includes it).

---

## §3 — Migration Sequence

**Current state on `main`:**
```
0000_mature_gladiator
0001_sprint1_tournament_selector
0002_sprint2_bankroll_snapshots
0003_sprint1_tournament_types
0006_bankroll_snapshots_wallet_columns   ← only 1 file with prefix 0006 on main
0007_addon_reentry_cols_pending
0008_tickets_foundation
0009_cooldown_foundation
0010_cooldown_sprint2
0011_session_wallet_snapshots
```
Gaps on main: 0004, 0005, 0012–0016 (not present).

**After merging bankroll-3 + stats-v2 (proposed order):**
```
0000–0003  (main)
0006_bankroll_snapshots_wallet_columns  (main — unchanged)
0007–0011  (main)
0012_bankroll_management_enabled        (bankroll-3, renamed from orphan 0006_bankroll_management_enabled)
0013_stats_analyzer                     (stats-v2 / F3)
0017_wallet_transfers                   (bankroll-3)
0018_auto_snapshot_meta                 (bankroll-3)
```

**Gaps remaining:** 0014-0016 (orphan range; no SQL files exist). This is harmless for `db:push` but may confuse `drizzle-kit migrate` if ever adopted. Recommend documenting as intentional gap in `docs/architecture/decisions/`.

**Collision risk:** stats-v2 still carries `migrations/0006_bankroll_management_enabled.sql` (the old duplicated file). After bankroll-3 merges and deletes that file, the merge of stats-v2 will produce a git "deleted by us, modified/kept by them" conflict on that path. **Resolution: delete the file in the merge commit** (bankroll-3's rename to 0012 is the authoritative version).

**0019:** Reserved for spot-screenshots — not created. Slot remains free.

---

## §4 — Cross-Branch Conflict Matrix

### bankroll-3 ✗ stats-v2

| File | Conflict type | Severity | Resolution |
|------|--------------|----------|------------|
| `migrations/0006_bankroll_management_enabled.sql` | Deleted by B3, kept by V2 | 🔴 HIGH | Delete in merge commit (0012 is canonical) |
| `server/storage.ts` — `setGrindSessionStatus` | Added by both (identical impl) | 🟡 MED | Keep one copy — implementations are byte-for-byte identical; git may auto-merge depending on position |
| `shared/schema.ts` | Both append new exports (B3: wallet_transfers/stops/pending; V2: hudLayouts/hudStatSnapshots) | 🟡 MED | Additive — different sections. Manual merge needed at end-of-file; combine both additions |
| `tests/setup.ts` | B3 adds fxResolver cache reset + ALLOW_STOP_LOCK_RELEASE; V2 adds jest→vi shim | 🟡 MED | Additive — append both blocks |
| `client/src/pages/GrindSessionLive.tsx` | Both modify | 🟡 MED | Manual review required |
| `client/src/components/cooldown/CoolDownRunner.tsx` | Both modify (B3: +92 lines; V2: +92 lines — likely same commit 1dca493) | 🟡 MED | Check if changes overlap; 1dca493 is shared base commit |
| `client/src/components/grind-session-live/SessionSummaryModal.tsx` | Both modify | 🟡 MED | Manual merge; B3 adds reconcile section wiring, V2 adds snapshot editor hooks |
| `server/routes/cooldown.ts` | Both modify | 🟡 MED | Review for stop-lock route vs F3 snapshot endpoint overlap |
| `server/routes/grind-sessions.ts` | Both modify | 🟡 MED | Additive routes expected; verify no duplicate paths |
| `docs/architecture/data-model-index.md` | Both add entries | 🟢 LOW | Append both sections |
| `shared/wallet-reconciliation.ts` | B3 modifies; V2 likely inherits via F3 | 🟢 LOW | Verify V2 changes are additive |

**bankroll-3 ✗ spot-screenshots:** Cannot assess — spot-screenshots branch missing.
**stats-v2 ✗ spot-screenshots:** Cannot assess — spot-screenshots branch missing.

---

## §5 — Recommended Merge Order

```
1. feature/bankroll-3   (merge first — no dependencies, owns migration rename)
2. feature/stats-analyzer-v2  (merge second — after resolving conflicts listed in §4)
3. feature/spot-screenshots   (HOLD — branch missing; retry session or manual build)
```

**Rationale:**
- **Bankroll-3 first:** Owns the 0006→0012 migration rename. Merging it first establishes the canonical migration state before stats-v2 is resolved. Also has zero cross-branch dependencies.
- **Stats-V2 second:** Depends on F3 (already incorporated in branch). The schema conflicts with bankroll-3 are resolvable manually (all additive, no semantic overlap). The `setGrindSessionStatus` duplicate is trivial.
- **Spot-Screenshots hold:** Unknown state. Do not merge any other branch into its reserved slot. Migration 0019 remains open.

**Pre-merge checklist for stats-v2:**
1. Resolve `migrations/0006_bankroll_management_enabled.sql` conflict (delete it).
2. Merge `shared/schema.ts` — append both sets of exports (walletTransfers + hud tables).
3. Merge `server/storage.ts` — keep one copy of `setGrindSessionStatus`, append all new methods.
4. Merge `tests/setup.ts` — append both blocks.
5. Verify `server/routes/cooldown.ts` and `grind-sessions.ts` for route path conflicts.
6. Run `npx vitest run` and confirm no new failures beyond the 125-baseline.
7. Run `npm run check` once node_modules installed.

---

## §6 — Open Blockers (Founder Must Resolve)

| # | Branch | Severity | Description |
|---|--------|----------|-------------|
| B-1 | spot-screenshots | 🔴 CRITICAL | Branch not pushed — session outcome unknown. Check `memory/session_2026-05-01-spot-screenshots.md` on local machine. |
| B-2 | bankroll-3 | 🟡 MEDIUM | RF-9 DEBT: `BankrollReconcileSection` not wired into `SessionSummaryModal` — standalone component exists but integration incomplete. |
| B-3 | stats-v2 | 🟡 MEDIUM | F3 merge strategy: decide if `feature/stats-analyzer` should be merged to main independently before V2, or if V2's embedded copy is the canonical path. The latter is cleaner (no double-merge), but means F3's own branch becomes a dead reference. |
| B-4 | stats-v2 | 🟡 MEDIUM | 5 DEFERs (RF-09, 11, 12, 13, 14) tracked as V3+ debts — ensure they are logged in the issue tracker before closing this sprint. |
| B-5 | all | 🟡 MEDIUM | `db:push` pending for migrations 0012, 0013, 0017, 0018 — run in order after merges are complete; **never in production without backup**. |
| B-6 | all | 🟢 LOW | Migration gap 0014-0016 will remain permanently. Document as intentional in `docs/architecture/decisions/` if adopting drizzle-kit migrate in future. |
| B-7 | all | 🟢 LOW | 124–125 pre-existing test failures across global suite. These pre-date all 3 sessions; should be triaged separately. |

---

## §7 — Risk Score Summary

| Branch | Risk | Rationale |
|--------|------|-----------|
| `feature/bankroll-3` | 🟢 LOW | 3 reviewer rounds, 400/400 area tests green, READY_TO_MERGE. One PARTIAL RF with documented debt. |
| `feature/stats-analyzer-v2` | 🟡 MED | 3 reviewer rounds, APPROVED-CLEAN, but requires manual conflict resolution against bankroll-3 (5 files, all resolvable). F3 embedded merge adds complexity. |
| `feature/spot-screenshots` | 🔴 HIGH | Unknown state. No branch, no status report. Entire sprint outcome must be re-assessed. |

---

*Memory files for each session are expected at `memory/session_2026-05-01-{bankroll-3,spot-screenshots,stats-v2}.md` on founder's local machine — not in repo. Confirm they exist and cross-reference with this report.*
