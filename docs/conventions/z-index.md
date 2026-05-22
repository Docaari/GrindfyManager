# Z-Index — Convencao Canonica

**Status:** Canonico — 2026-05-22. Extraido de ADR-188 + Sprint MP1.1 Q-C/Q-D.

**Owner:** quem mexer em qualquer surface fixed/sticky/modal deve consultar e atualizar essa tabela.

---

## Tabela Canonica

Ordem do topo (mais acima) para o fundo (atras):

| Camada | z-index | Componente exemplo | Notas |
|---|---|---|---|
| Sonner / Toast | `z-[9999]` | `<Toaster />` default | Notificacoes flutuantes acima de tudo. |
| WarmUpRunner | `z-[60]` | `WarmUpRunner.tsx`, `OverrideConfirmDialog.tsx` | Fullscreen overlay durante warmup. |
| Radix Dialog (override) | `z-[100]` ou `z-[110]` | `Toast` (`ui/toast.tsx`), `AccessRequestDialog` | Casos especiais que sobem acima de modais padrao. |
| MiniChat (FAB + painel) | `z-50` | `MiniChat.tsx:172,196` | Mantem-se acima de MiniPlayerExpanded. |
| Modais legacy (Bankroll, Flight, ~30 dialogs) | `z-50` | `BankrollWidget`, `TransferDialog`, `WalletEditDialog`, etc | Mesma camada — DOM-order decide quando 2+ abertos. |
| Radix Dialog overlay (shadcn default) | `z-50` | `client/src/components/ui/dialog.tsx`, `ui/alert-dialog.tsx` | Default shadcn. Preferir `Dialog` Radix em features novas. |
| **MiniPlayerExpanded** | `z-[45]` | `MiniPlayerExpanded.tsx:30` | Acima da bar, abaixo de MiniChat (intencional). |
| MiniPlayerExpanded backdrop | `z-40` | `MiniPlayerExpanded.tsx:22` | Cobre bar mas nao MiniChat. |
| MiniPlayerBar | `z-40` | `MiniPlayerBar.tsx:172` | Persistente bottom durante navegacao. |
| StudiesBottomNav | `z-40` | `StudiesBottomNav.tsx:19` | Mesma camada da bar — convivem (telas diferentes). |
| Sticky headers de pagina | `z-50` (top) | `Landing.tsx:48`, `GrindSessionLive.tsx:2403` | Top-anchored, separado de fixed bottom. |
| Conteudo de paginas | auto / 0 | — | — |

---

## Invariantes

1. **MiniChat (`z-50`) sempre acima de MiniPlayerExpanded (`z-[45]`).** Intencional — chat e nivel-app, player e nivel-feature.
2. **MiniPlayerBar (`z-40`) abaixo de MiniPlayerExpanded (`z-[45]`).** Expanded e drilldown da bar; precisa estar acima visualmente.
3. **Radix Dialog `<DialogOverlay>` (`z-50` default shadcn) acima de MiniChat na pratica.** Quando ambos ativos, dialog ganha pelo DOM-order (renderizado depois via Portal). Para garantir, usar override `z-[100]` em dialogs criticos (ex.: `AccessRequestDialog`).
4. **Toasts (`z-[9999]`) sempre no topo.** Sonner default — nao alterar.
5. **Warmup (`z-[60]`) acima de modais comuns.** Fullscreen-like overlay durante ritual — usuario nao deve ser distraido por dialogs paralelos.

---

## Padroes a evitar

- **Nao use `z-45` direto** (Tailwind nao expoe — vira `z-[45]` arbitrary em JIT. Grep falha em encontrar). Use `z-[45]` explicito.
- **Nao customize `tailwind.config.ts` com `zIndex: { 45: '45' }`** se ja existe arbitrary. Custom config so quando 3+ componentes precisam do mesmo valor literal.
- **Nao empilhe 3+ overlays na mesma z-index esperando DOM-order resolver.** Use camadas explicitas (z-40 → z-[45] → z-50 → z-[60]).
- **Nao use `z-index` inline style** (`style={{ zIndex: 50 }}`). Sempre via classe Tailwind (rastreavel via grep).

---

## Gap reservado

Entre `z-40` e `z-50` existe a faixa `z-[41]..z-[49]` reservada para casos futuros:

- `z-[45]` ocupado por MiniPlayerExpanded.
- `z-[41]..z-[44]` reservado para floating icons / mini-overlays (Sprint Mini Player 3 — floating mode).
- `z-[46]..z-[49]` reservado para player drill-downs (queue picker, etc — Sprint Mini Player 2).

Antes de ocupar nova camada, **atualizar esta tabela**.

---

## Referencias

- ADR-188 — `Docs/architecture/decisions/188-mini-player-displaymode-fsm.md` (origem da hierarquia)
- Sprint MP1.1 spec — `Docs/specs/sprint-mini-player-1.1.md` RF-06 + Q-C/Q-D
- Verificado via grep em `client/src/**/*.{ts,tsx}` em 2026-05-22

---

## Como atualizar

1. Mexeu em z-index? Atualize a tabela acima ANTES do PR.
2. Adicionou nova surface fixed/sticky? Defina camada (consulte gap reservado).
3. Mudou invariante? Atualize ADR-188 + esta tabela na mesma sprint.
