// /range-lab — bancada de estudo de spot pos-flop (F1 / RF-01.5, ADR-246 D-F1-10).
//
// Tres paineis: range (esquerda) | bordo + veredito (centro) | leitura (direita,
// que a F3 preenche). Abaixo de `lg` vira coluna unica.
//
// A calculadora compacta (`CombosCalculator`) continua servindo o popup, ao lado
// da mesa. Esta pagina e a bancada: heroi como range, worker, exato ou
// aproximado declarado.
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import BoardPicker from "@/components/range-lab/BoardPicker";
import RangeMatrix from "@/components/range-lab/RangeMatrix";
import RangeEntryList from "@/components/range-lab/RangeEntryList";
import SuitPickerPopover from "@/components/range-lab/SuitPickerPopover";
import BetInputs, { parseAmount } from "@/components/range-lab/BetInputs";
import ModeSelector from "@/components/range-lab/ModeSelector";
import VerdictPanel from "@/components/range-lab/VerdictPanel";
import ComboTable from "@/components/range-lab/ComboTable";
import CategoryPanel from "@/components/range-lab/CategoryPanel";
import type { ReadSide } from "@/components/range-lab/CategoryPanel";
import MdfPanel from "@/components/range-lab/MdfPanel";
import CascadeBar from "@/components/range-lab/CascadeBar";
import BlockerPanel from "@/components/range-lab/BlockerPanel";
import { buildHighlight } from "@/lib/combo-calc/read";
import type { ReadCombo, ReadFilter } from "@/lib/combo-calc/read";
import { buildCascade } from "@/lib/combo-calc/cascade";
import {
  decisionBasis,
  partitionVillainRows,
  splitByConfrontation,
  villainRowsOf,
} from "@/lib/combo-calc/confront";
import { computeBluffBalance, computeMdf, rankBluffcatchers } from "@/lib/combo-calc/mdf";
import type { BluffBalance } from "@/lib/combo-calc/mdf";
import { analyzeBlockers, blockerAvailability } from "@/lib/combo-calc/blockers";
import type { BlockerReport } from "@/lib/combo-calc/blockers";
import SpotLibrary from "@/components/range-lab/SpotLibrary";
import BrushWeightControl from "@/components/range-lab/BrushWeightControl";
import TopPercentSlider from "@/components/range-lab/TopPercentSlider";
import RangeLibrary from "@/components/range-lab/RangeLibrary";
import { useRangeEngine } from "@/hooks/useRangeEngine";
import { cardKey, parseCard } from "@/lib/combo-calc/cards";
import { enumerateCombos, parseNotation } from "@/lib/combo-calc/combos";
import { estimateCost, suggestMode } from "@/lib/combo-calc/engine/cost";
import type { EngineMode, SpotV2 } from "@/lib/combo-calc/engine/types";
import {
  createHistory,
  push as pushHistory,
  undo as undoHistory,
  redo as redoHistory,
  resetHistory,
  type HistoryState,
} from "@/lib/combo-calc/history";
import {
  loadDraftV2,
  loadSavedSpotsV2,
  saveDraftV2,
  type SavedSpotV2,
} from "@/lib/combo-calc/persistence";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

type RangeSide = "hero" | "villain";

type HeroMode = "hand" | "range";

const RESET_TITLE =
  "Limpa tudo: o range do heroi, o range do oponente, o bordo, as cartas mortas e os filtros.";

/**
 * Avisa UMA vez por sessao que o motor devolveu resultado sem `perVillainCombo`.
 * Repetir a cada render afogaria o console a cada tecla no pote.
 */
let missingVillainRowsWarned = false;
function warnMissingVillainRows(): void {
  if (missingVillainRowsWarned) return;
  missingVillainRowsWarned = true;
  console.warn(
    "[range-lab] resultado do motor sem `perVillainCombo` (bundle antigo?): " +
      "a leitura do lado do oponente fica vazia nesta corrida.",
  );
}

export default function RangeLab() {
  const [board, setBoard] = useState<Card[]>([]);
  const [heroMode, setHeroMode] = useState<HeroMode>("hand");
  // F2 D-F2-2 (ADR-247): dois historicos INDEPENDENTES, um por matriz — Ctrl+Z
  // no heroi nunca desfaz o vilao. heroRange/villainRange sao derivados do
  // `.present` de cada historico, nao um useState paralelo (fonte unica).
  const [heroHistory, setHeroHistory] = useState<HistoryState<RangeEntry[]>>(() =>
    createHistory<RangeEntry[]>([]),
  );
  const [villainHistory, setVillainHistory] = useState<HistoryState<RangeEntry[]>>(() =>
    createHistory<RangeEntry[]>([]),
  );
  const heroRange = heroHistory.present;
  const villainRange = villainHistory.present;
  const [potInput, setPotInput] = useState("36.1");
  const [callInput, setCallInput] = useState("13.8");
  const [bbInput, setBbInput] = useState("");
  const [mode, setMode] = useState<EngineMode>("exact");
  const [savedSpots, setSavedSpots] = useState<SavedSpotV2[]>([]);
  // RF-02.2 (D): { side, notation } da celula ATIVA cujo popover de naipes
  // esta aberto. null quando fechado.
  const [suitPicker, setSuitPicker] = useState<{ side: RangeSide; notation: string } | null>(null);
  // Peso rapido do pincel (emenda A9, D-F2-1): um por lado, alimenta o
  // `defaultFrequency` que `RangeMatrix` ja aceita — zero mudanca de contrato.
  // Lado ativo do painel de leitura (D-F3-22): ele decide QUAL range e agrupado e
  // qual das duas matrizes o filtro pinta. Acender as duas ao mesmo tempo torna o
  // filtro ilegivel.
  const [readSide, setReadSide] = useState<ReadSide>("villain");
  const [readFilter, setReadFilter] = useState<ReadFilter>(() => ({
    made: new Set(),
    draws: new Set(),
  }));
  const [heroBrush, setHeroBrush] = useState(1);
  const [villainBrush, setVillainBrush] = useState(1);
  // F3b / D-F3-13: fora do river o contrafactual do bloqueador e trabalho sincrono
  // na thread principal, entao ele so roda sob pedido. No river a conta e analitica
  // (um runout) e sai sozinha.
  const [deltaRequested, setDeltaRequested] = useState(false);

  const hydrated = useRef(false);

  function setHeroRange(next: RangeEntry[]): void {
    setHeroHistory((h) => pushHistory(h, next));
  }
  function setVillainRange(next: RangeEntry[]): void {
    setVillainHistory((h) => pushHistory(h, next));
  }
  function undoHero(): void {
    setHeroHistory((h) => undoHistory(h));
  }
  function redoHero(): void {
    setHeroHistory((h) => redoHistory(h));
  }
  function undoVillain(): void {
    setVillainHistory((h) => undoHistory(h));
  }
  function redoVillain(): void {
    setVillainHistory((h) => redoHistory(h));
  }

  function toggleSuitPicker(side: RangeSide, notation: string): void {
    setSuitPicker((cur) =>
      cur && cur.side === side && cur.notation === notation ? null : { side, notation },
    );
  }

  function handleSuitPickerChange(next: RangeEntry): void {
    if (!suitPicker) return;
    if (suitPicker.side === "hero") {
      setHeroRange(heroRange.map((e) => (e.notation === next.notation ? next : e)));
    } else {
      setVillainRange(villainRange.map((e) => (e.notation === next.notation ? next : e)));
    }
  }

  // Hidratacao unica. `loadDraftV2` le a v2 e, na ausencia dela, converte a v1 —
  // rascunho de antes da F1 abre sem perda (criterio de aceite 5).
  useEffect(() => {
    const draft = loadDraftV2();
    if (draft) {
      setBoard(draft.board);
      setHeroHistory(createHistory<RangeEntry[]>(draft.heroRange));
      setVillainHistory(createHistory<RangeEntry[]>(draft.entries));
      if (draft.potInput) setPotInput(draft.potInput);
      if (draft.callInput) setCallInput(draft.callInput);
      setBbInput(draft.bbInput);
      if (draft.heroRange.length > 1) setHeroMode("range");
    }
    setSavedSpots(loadSavedSpotsV2());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      saveDraftV2({
        board,
        heroRange,
        entries: villainRange,
        potInput,
        callInput,
        bbInput,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [board, heroRange, villainRange, potInput, callInput, bbInput]);

  // Cartas mortas do bordo — mesma convencao ja usada pelo SuitPickerPopover
  // (nao inclui o range do outro lado: card removal contra um RANGE, nao mao
  // concreta, e responsabilidade do motor).
  const dead = useMemo(() => new Set(board.map(cardKey)), [board]);

  const spot: SpotV2 = useMemo(
    () => ({
      board,
      heroRange,
      villainRange,
      potCurrent: parseAmount(potInput),
      callAmount: parseAmount(callInput),
    }),
    [board, heroRange, villainRange, potInput, callInput],
  );

  const { result, progress, running } = useRangeEngine(spot, { mode });

  // Estimativa de custo para o seletor de modo. So faz sentido com o spot montado.
  const cost = useMemo(() => {
    if (board.length < 3 || heroRange.length === 0 || villainRange.length === 0) {
      return null;
    }
    try {
      return estimateCost({ spot, mode });
    } catch (error) {
      // Bordo com carta repetida chega aqui antes do motor. Nao ha custo a
      // mostrar, mas a tela nao pode cair por causa de um rotulo (licao #9).
      console.warn("[range-lab] nao foi possivel estimar o custo do spot:", error);
      return null;
    }
  }, [spot, mode, board.length, heroRange.length, villainRange.length]);

  function reset(): void {
    setBoard([]);
    // resetHistory (nao push): reset() troca o range por fora do fluxo de
    // pintura — um Ctrl+Z depois nao pode revelar o range anterior (D-F2-2).
    setHeroHistory((h) => resetHistory(h, []));
    setVillainHistory((h) => resetHistory(h, []));
    setMode("exact");
    setSuitPicker(null);
    setReadFilter({ made: new Set(), draws: new Set() });
    setReadSide("villain");
    setDeltaRequested(false);
  }

  function loadSpot(saved: SavedSpotV2): void {
    setBoard(saved.board.map(parseCard).filter((c): c is Card => c != null));
    setHeroHistory((h) => resetHistory(h, saved.heroRange));
    setVillainHistory((h) => resetHistory(h, saved.entries));
    setSuitPicker(null);
    setPotInput(saved.potInput || "36.1");
    setCallInput(saved.callInput || "13.8");
    setBbInput(saved.bbInput);
    setHeroMode(saved.heroRange.length > 1 ? "range" : "hand");
  }

  const showCallThreshold =
    heroMode === "range" && result != null && result.status === "ok";

  // A classificacao e LOCAL (D-F3-1): ela nao espera a corrida. A equity vem da
  // corrida e entra como `null` enquanto nao chegou — categoria com contagem e
  // massa e coluna de equity em branco e estado legitimo, nao erro.
  const readOk = result != null && result.status === "ok";
  const heroReadCombos: ReadCombo[] = readOk
    ? result.perHeroCombo.map((row) => ({
        combo: row.combo,
        weight: row.weight,
        equity: row.equity,
      }))
    : [];
  // `perVillainCombo` nasceu na F3a. Um resultado sem ele so pode vir de um worker
  // de bundle antigo ainda vivo no navegador do jogador: a lista sai vazia (que e a
  // verdade — nao ha dado), e o log vem ANTES do fallback para o caso nao passar
  // despercebido (licao #9).
  const villainRows = readOk ? (result.perVillainCombo ?? null) : null;
  if (readOk && villainRows === null) {
    warnMissingVillainRows();
  }
  const villainReadCombos: ReadCombo[] = (villainRows ?? []).map((row) => ({
    combo: row.combo,
    weight: row.weight,
    equity: row.equity,
  }));
  const showRead = board.length >= 3 && readOk;
  const activeReadCombos = readSide === "hero" ? heroReadCombos : villainReadCombos;
  const readHighlight = showRead
    ? buildHighlight(activeReadCombos, board, readFilter)
    : null;

  // ── F3b: MDF, cascata e bloqueador (ADR-249 D-F3-34) ──
  //
  // O portao dos tres e o mesmo do painel de leitura: sem range declarado nao ha
  // o que explicar. O que muda por painel e quanto de cada um sobrevive a ausencia
  // da corrida — e o cartao de MDF sobrevive INTEIRO, porque as tres porcentagens
  // saem so do pote e da aposta.
  const hasAnyRange = heroRange.length > 0 || villainRange.length > 0;
  const potCurrent = parseAmount(potInput);
  const callAmount = parseAmount(callInput);

  const bluffBalance: BluffBalance | null = useMemo(() => {
    const mdf = computeMdf(potCurrent, callAmount);
    if (mdf.status !== "ok") return null;
    // Sem bordo nao ha confronto a medir: o showdown precisa de 5 cartas no total.
    if (board.length < 3 || result == null || result.status !== "ok") return null;

    const rows = villainRowsOf(result);
    if (rows === null) return null;

    const { basis } = decisionBasis(result, board);
    // A conta usa apenas os combos VIVOS: o range de aposta dele nao contem as
    // suas cartas, e os bloqueados sao materia do outro painel (D-F3-24).
    const { alive } = partitionVillainRows(rows);
    const split = splitByConfrontation({
      hero: result.perHeroCombo.length === 1 ? result.perHeroCombo[0].combo : null,
      rows: alive.map((row) => ({ combo: row.combo, weight: row.weight, equity: row.equity })),
      board,
      basis,
    });
    return computeBluffBalance(mdf, {
      value: split.value.mass,
      bluff: split.bluff.mass,
      chop: split.chop.mass,
      unknown: split.unknown.mass,
    });
  }, [potCurrent, callAmount, board, result]);

  const cascade = useMemo(
    () => buildCascade({ villainRange, board, result: result ?? null }),
    [villainRange, board, result],
  );

  // Sai do JSX: ordenar o range inteiro a cada render so para ler `.total` era
  // trabalho jogado fora em toda tecla digitada no pote.
  const heroRanking = useMemo(
    () => (result != null && result.status === "ok" ? rankBluffcatchers(result.perHeroCombo) : null),
    [result],
  );

  const blockerAvail = blockerAvailability(result ?? null);
  // No river a conta e um runout so; fora dele espera o botao.
  const computeDelta = board.length === 5 || deltaRequested;
  const blockerReport: BlockerReport | null = useMemo(() => {
    if (board.length < 3 || result == null || result.status !== "ok") return null;
    const out = analyzeBlockers({ result, board, computeDelta });
    // `BlockerReport` nao tem `status`: a presenca da chave JA discrimina a uniao,
    // e sem o cast o compilador continua cobrando o ramo.
    if ("status" in out) return null;
    return out;
  }, [board, result, computeDelta]);

  // O pedido e por BORDO: trocar a rua muda a enumeracao inteira, e herdar o "sim"
  // da rua anterior faria o laco rodar sem o jogador ter pedido de novo.
  useEffect(() => {
    setDeltaRequested(false);
  }, [board]);

  return (
    <div data-testid="range-lab-page" className="min-h-screen bg-background text-white">
      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Range Lab</h1>
            <p className={`text-sm ${tokens.color.neutral.text}`}>
              Monte o spot, veja de onde vem a equity e quantas das suas maos pagam.
            </p>
          </div>
          <button
            type="button"
            data-testid="range-lab-reset"
            onClick={reset}
            title={RESET_TITLE}
            className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs border ${tokens.color.neutral.border} ${tokens.color.neutral.text} hover:text-primary`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar tudo
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* ── painel de range ── */}
          <section
            data-testid="range-lab-panel-range"
            className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  A sua mao
                </h2>
                <div className="flex gap-1">
                  <button
                    type="button"
                    data-testid="range-lab-hero-mode-hand"
                    onClick={() => setHeroMode("hand")}
                    aria-pressed={heroMode === "hand"}
                    className={`rounded px-2 py-1 text-[10px] border ${
                      heroMode === "hand"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
                    }`}
                  >
                    Minha mao
                  </button>
                  <button
                    type="button"
                    data-testid="range-lab-hero-mode-range"
                    onClick={() => setHeroMode("range")}
                    aria-pressed={heroMode === "range"}
                    className={`rounded px-2 py-1 text-[10px] border ${
                      heroMode === "range"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
                    }`}
                  >
                    Meu range
                  </button>
                </div>
              </div>
              {/*
                Os dois modos produzem `heroRange`, sem caminho de codigo separado
                (RF-01.2). O que muda e so a superficie: no modo mao a expectativa
                e uma entrada so.
              */}
              <BrushWeightControl
                value={heroBrush}
                onChange={setHeroBrush}
                testId="range-lab-hero-brush"
              />
              <RangeMatrix
                entries={heroRange}
                onChange={setHeroRange}
                defaultFrequency={heroBrush}
                onUndo={undoHero}
                onRedo={redoHero}
                onOpenSuitPicker={(notation) => toggleSuitPicker("hero", notation)}
                testId="range-lab-hero-matrix"
                highlight={readHighlight && readSide === "hero" ? readHighlight.cells : undefined}
                highlightCounts={
                  readHighlight && readSide === "hero" ? readHighlight.perCell : undefined
                }
              />
              <RangeEntryList
                entries={heroRange}
                onChange={setHeroRange}
                testId="range-lab-hero-entries"
              />
              <TopPercentSlider dead={dead} onApply={setHeroRange} testId="range-lab-hero-top-percent" />
              <RangeLibrary entries={heroRange} onApply={setHeroRange} testId="range-lab-hero-library" />
              {suitPicker?.side === "hero" &&
                (() => {
                  const activeEntry = heroRange.find((e) => e.notation === suitPicker.notation);
                  const parsed = parseNotation(suitPicker.notation);
                  if (!activeEntry || !parsed) return null;
                  return (
                    <SuitPickerPopover
                      notation={suitPicker.notation}
                      combos={enumerateCombos(parsed, new Set(board.map(cardKey)))}
                      entry={activeEntry}
                      onChange={handleSuitPickerChange}
                    />
                  );
                })()}
              {showCallThreshold && result.status === "ok" && (
                <p
                  data-testid="range-lab-call-threshold"
                  className={`text-sm ${tokens.color.action.text}`}
                >
                  {/*
                    O denominador e "combos COM numero", nao `perHeroCombo.length`
                    (D-F3-31 + ponto aberto 1 do ADR-249, respondido pelo founder).
                    O numerador ja exclui os combos degradados; com card removal
                    pesado, o denominador cheio dizia "12 de 16 pagam" quando 4 das
                    16 nem existem no spot.
                  */}
                  <span className="font-mono font-bold">{result.callThresholdIndex}</span>{" "}
                  de {heroRanking?.total ?? 0} maos suas pagam.
                </p>
              )}
            </div>

            <div className="space-y-2 border-t border-gray-800 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Range do oponente
              </h2>
              <BrushWeightControl
                value={villainBrush}
                onChange={setVillainBrush}
                testId="range-lab-villain-brush"
              />
              <RangeMatrix
                entries={villainRange}
                onChange={setVillainRange}
                defaultFrequency={villainBrush}
                onUndo={undoVillain}
                onRedo={redoVillain}
                onOpenSuitPicker={(notation) => toggleSuitPicker("villain", notation)}
                testId="range-lab-villain-matrix"
                highlight={
                  readHighlight && readSide === "villain" ? readHighlight.cells : undefined
                }
                highlightCounts={
                  readHighlight && readSide === "villain" ? readHighlight.perCell : undefined
                }
              />
              <RangeEntryList
                entries={villainRange}
                onChange={setVillainRange}
                testId="range-lab-villain-entries"
              />
              <TopPercentSlider dead={dead} onApply={setVillainRange} testId="range-lab-villain-top-percent" />
              <RangeLibrary entries={villainRange} onApply={setVillainRange} testId="range-lab-villain-library" />
              {suitPicker?.side === "villain" &&
                (() => {
                  const activeEntry = villainRange.find((e) => e.notation === suitPicker.notation);
                  const parsed = parseNotation(suitPicker.notation);
                  if (!activeEntry || !parsed) return null;
                  return (
                    <SuitPickerPopover
                      notation={suitPicker.notation}
                      combos={enumerateCombos(parsed, new Set(board.map(cardKey)))}
                      entry={activeEntry}
                      onChange={handleSuitPickerChange}
                    />
                  );
                })()}
            </div>
          </section>

          {/* ── painel de bordo + veredito ── */}
          <section
            data-testid="range-lab-panel-board"
            className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4"
          >
            <BoardPicker board={board} onChange={setBoard} />
            <BetInputs
              potInput={potInput}
              callInput={callInput}
              bbInput={bbInput}
              onChange={(next) => {
                setPotInput(next.potInput);
                setCallInput(next.callInput);
                setBbInput(next.bbInput);
              }}
            />
            <ModeSelector
              mode={mode}
              onChange={setMode}
              cost={cost}
              suggested={cost ? suggestMode(cost.showdowns) : null}
            />
            <VerdictPanel result={result} progress={progress} running={running} />
            {/*
              D-F3-34: o MDF le pote e call, que sao os campos deste mesmo painel, e
              responde a continuacao direta do veredito ("quanto ele precisa
              blefar"). A cascata explica o numero que esta logo acima.
            */}
            {hasAnyRange && (
              <>
                <MdfPanel
                  potCurrent={potCurrent}
                  callAmount={callAmount}
                  balance={bluffBalance}
                />
                <CascadeBar cascade={cascade} />
              </>
            )}
            <SpotLibrary
              spots={savedSpots}
              onSpotsChange={setSavedSpots}
              current={{
                board: board.map(cardKey),
                heroRange,
                entries: villainRange,
                potInput,
                callInput,
                bbInput,
              }}
              onLoad={loadSpot}
              canSave={board.length >= 3 && heroRange.length > 0}
            />
          </section>

          {/* ── painel de leitura (a F3 preenche) ── */}
          <section
            data-testid="range-lab-panel-read"
            className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Leitura
            </h2>
            {/*
              D-F3-34: o bloqueador fala do range dele carta a carta, e o painel de
              categorias detalha em seguida. A queda do degrau 3 para o 4 da cascata
              e este mesmo fato, visto do outro lado.
            */}
            {hasAnyRange && board.length >= 3 && (
              <BlockerPanel
                availability={blockerAvail}
                report={blockerReport}
                onComputeDelta={() => setDeltaRequested(true)}
              />
            )}
            {showRead && result && result.status === "ok" ? (
              <>
                <CategoryPanel
                  board={board}
                  heroCombos={heroReadCombos}
                  villainCombos={villainReadCombos}
                  side={readSide}
                  onSideChange={setReadSide}
                  filter={readFilter}
                  onFilterChange={setReadFilter}
                />
                <ComboTable
                  heroRows={result.perHeroCombo}
                  villainRows={villainRows ?? []}
                  board={board}
                  heroMode={heroMode}
                />
              </>
            ) : (
              <p className={`text-xs ${tokens.color.neutral.text}`}>
                Monte o bordo e os dois ranges: a leitura por categoria, a textura e
                a tabela por mao aparecem assim que houver resultado.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
