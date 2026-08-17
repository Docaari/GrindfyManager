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
import BetInputs, { parseAmount } from "@/components/range-lab/BetInputs";
import ModeSelector from "@/components/range-lab/ModeSelector";
import VerdictPanel from "@/components/range-lab/VerdictPanel";
import ComboTable from "@/components/range-lab/ComboTable";
import SpotLibrary from "@/components/range-lab/SpotLibrary";
import { useRangeEngine } from "@/hooks/useRangeEngine";
import { cardKey, parseCard } from "@/lib/combo-calc/cards";
import { estimateCost, suggestMode } from "@/lib/combo-calc/engine/cost";
import type { EngineMode, SpotV2 } from "@/lib/combo-calc/engine/types";
import {
  loadDraftV2,
  loadSavedSpotsV2,
  saveDraftV2,
  type SavedSpotV2,
} from "@/lib/combo-calc/persistence";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import { tokens } from "@/lib/ui-tokens";

type HeroMode = "hand" | "range";

const RESET_TITLE =
  "Limpa tudo: o range do heroi, o range do oponente, o bordo, as cartas mortas e os filtros.";

export default function RangeLab() {
  const [board, setBoard] = useState<Card[]>([]);
  const [heroMode, setHeroMode] = useState<HeroMode>("hand");
  const [heroRange, setHeroRange] = useState<RangeEntry[]>([]);
  const [villainRange, setVillainRange] = useState<RangeEntry[]>([]);
  const [potInput, setPotInput] = useState("36.1");
  const [callInput, setCallInput] = useState("13.8");
  const [bbInput, setBbInput] = useState("");
  const [mode, setMode] = useState<EngineMode>("exact");
  const [savedSpots, setSavedSpots] = useState<SavedSpotV2[]>([]);

  const hydrated = useRef(false);

  // Hidratacao unica. `loadDraftV2` le a v2 e, na ausencia dela, converte a v1 —
  // rascunho de antes da F1 abre sem perda (criterio de aceite 5).
  useEffect(() => {
    const draft = loadDraftV2();
    if (draft) {
      setBoard(draft.board);
      setHeroRange(draft.heroRange);
      setVillainRange(draft.entries);
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
    setHeroRange([]);
    setVillainRange([]);
    setMode("exact");
  }

  function loadSpot(saved: SavedSpotV2): void {
    setBoard(saved.board.map(parseCard).filter((c): c is Card => c != null));
    setHeroRange(saved.heroRange);
    setVillainRange(saved.entries);
    setPotInput(saved.potInput || "36.1");
    setCallInput(saved.callInput || "13.8");
    setBbInput(saved.bbInput);
    setHeroMode(saved.heroRange.length > 1 ? "range" : "hand");
  }

  const showCallThreshold =
    heroMode === "range" && result != null && result.status === "ok";

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
              <RangeMatrix
                entries={heroRange}
                onChange={setHeroRange}
                testId="range-lab-hero-matrix"
              />
              <RangeEntryList
                entries={heroRange}
                onChange={setHeroRange}
                testId="range-lab-hero-entries"
              />
              {showCallThreshold && result.status === "ok" && (
                <p
                  data-testid="range-lab-call-threshold"
                  className={`text-sm ${tokens.color.action.text}`}
                >
                  <span className="font-mono font-bold">{result.callThresholdIndex}</span>{" "}
                  de {result.perHeroCombo.length} maos suas pagam.
                </p>
              )}
            </div>

            <div className="space-y-2 border-t border-gray-800 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Range do oponente
              </h2>
              <RangeMatrix
                entries={villainRange}
                onChange={setVillainRange}
                testId="range-lab-villain-matrix"
              />
              <RangeEntryList
                entries={villainRange}
                onChange={setVillainRange}
                testId="range-lab-villain-entries"
              />
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
            {result && result.status === "ok" ? (
              <ComboTable rows={result.perHeroCombo} />
            ) : (
              <p className={`text-xs ${tokens.color.neutral.text}`}>
                Categorias de mao, cascata de equity, bloqueadores e MDF chegam na
                proxima frente. Por enquanto, esta coluna mostra a tabela por mao
                assim que houver resultado.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
