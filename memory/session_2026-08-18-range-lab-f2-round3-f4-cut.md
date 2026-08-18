---
name: session_2026-08-18-range-lab-f2-round3-f4-cut
description: F2 (Range Builder) concluída rodada 3 — gerador real de handRanking.json, TopPercentSlider/RangeLibrary/BrushWeightControl, D13 pago. Founder cancelou F4 e aparou F5b; ordem ativa F3->F5a->F5b.
metadata:
  type: project
---

# Range Lab — F2 concluída, F4 cancelada, roadmap reordenado

## F2 rodada 3 (fechamento)
- `scripts/generate-hand-ranking.ts` novo: Monte Carlo 60.000 amostras/mão, 169
  mãos canônicas, semente fixa (`DEFAULT_SEED`), avaliador rápido
  (`evalWithBoard`). Substituiu o `handRanking.json` placeholder heurístico das
  rodadas 1-2 por dado medido de verdade (AA 85,4%, AKs 66,97%, 72o 34,8% —
  bate com benchmarks conhecidos).
- `TopPercentSlider.tsx`, `RangeLibrary.tsx`, `BrushWeightControl.tsx` novos —
  wired nos dois lados (herói/vilão) de `RangeLab.tsx`.
- **D13 pago** (dívida que a F1 nomeou e não pagou): `CombosCalculator.tsx`
  (popup) trocou a matriz inline + lista linear de naipes pelos componentes
  compartilhados `RangeMatrix`/`RangeEntryList`/`SuitPickerPopover`. Ganhou
  Ctrl+Z/Ctrl+Y de graça (histórico local via `history.ts`, `resetHistory` no
  `loadSpot`, não `push` — D-F2-2).
- 579/579 testes verdes (`tests/unit/combo-calc` + `tests/client/range-lab`),
  `tsc` 0. Verificação visual feita pelo founder (a IA não tem credencial de
  login nesta sessão pra abrir `:3000`).

**Achado:** `TopPercentSlider` mostrando 1 casa decimal ("20.0%") continha a
substring "0.0%" e derrubava o teste que cata veredito fantasma. Fix: percentual
sempre inteiro (mesma convenção que `RangeEntryList` já documentava).

## F4 cancelada (founder, 2026-08-18)
Motivo, nas palavras do founder: "achei o F4 meio desnecessário, não precisamos
de todas essas integrações, nem com RP, nem com biblioteca, nada disso." F4
inteira saiu — ICM/risk premium, persistência server-side (migration 0101),
ponte com Estudos/MDA, tool do Coach, export. `Docs/specs/range-lab/F4-contexto.md`
fica no repo só como referência (banner CANCELADA no topo) — não abrir sessão a
partir dele sem reconfirmar com o founder.

F5b foi aparado na mesma conversa: RF-05.7 (cenário em arquivo `.json`) saiu —
o propósito dele era complementar a persistência server-side da F4, que deixou
de existir. RF-05.5 (Range Finder) e RF-05.6 (cartas mortas) ficaram — founder
confirmou explicitamente que o Range Finder fica.

## Ordem ativa do roadmap
**F3 -> F5a -> F5b.** F5a foi endossada explicitamente pelo founder ("F5a é sim
interessante"). Documentos atualizados: `Docs/specs/range-lab/00-INDICE.md`
(placar + nota), `F3-leitura.md` (prompt da próxima sessão aponta pra F5a, não
mais F4), `F4-contexto.md` (banner cancelada), `F5-mindriver.md` (RF-05.7
cortado, emenda A13 sem destino, prompts atualizados).
