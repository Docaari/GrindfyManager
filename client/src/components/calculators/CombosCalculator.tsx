import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Layers,
  Info,
  ChevronDown,
  AlertTriangle,
  BookOpen,
  Trash2,
  Spade,
  X,
  Save,
  FolderOpen,
} from "lucide-react";
import {
  RANKS,
  SUITS,
  cardKey,
  rankChar,
  comboKey,
  tryEvaluateSpot,
  verdictCalcBasis,
  enumerateCombos,
  parseNotation,
  heroEquityAtMultiplier,
  describeSpotReadiness,
  resolveCardClick,
  RANGE_PRESETS,
  saveDraft,
  loadDraft,
  hydrateSpot,
  loadSavedSpots,
  persistSavedSpots,
  type SavedSpot,
  type SpotReadinessReason,
} from "@/lib/combo-calc";
import type { Card as PCard, RangeEntry, Spot } from "@/lib/combo-calc";
import { solveBreakevenMultiplier } from "@/lib/combo-calc/breakeven";
import { parseRangeText } from "@/lib/combo-calc/rangeImport";
import {
  createHistory,
  push as pushHistory,
  undo as undoHistory,
  redo as redoHistory,
  resetHistory,
  type HistoryState,
} from "@/lib/combo-calc/history";
import RangeMatrix from "@/components/range-lab/RangeMatrix";
import RangeEntryList from "@/components/range-lab/RangeEntryList";
import SuitPickerPopover from "@/components/range-lab/SuitPickerPopover";

/** Mensagem do portao de "spot pronto" (RF-00.2): a tela diz o que falta. */
const READINESS_MESSAGE: Record<SpotReadinessReason, string> = {
  board_incomplete: "Monte o bordo com 3 a 5 cartas.",
  hero_incomplete: "Escolha as 2 cartas da mao do heroi.",
  pot_missing: "Informe o pote atual (ja com a aposta do vilao).",
  call_missing: "Informe o valor do call.",
  range_empty: "Pinte ao menos uma classe no range do vilao.",
  range_weightless: "Range sem combos com peso — ajuste as frequencias.",
};

// Simbolos de naipe via codePoint (hook bloqueia glyph cru no fonte).
const SUIT_SYM: Record<string, string> = {
  c: String.fromCodePoint(0x2663), // clubs
  d: String.fromCodePoint(0x2666), // diamonds
  h: String.fromCodePoint(0x2665), // hearts
  s: String.fromCodePoint(0x2660), // spades
};

// ─── helpers ─────────────────────────────────────────────────
function parseNum(v: string): number {
  if (typeof v !== "string") return 0; // defesa: dado corrompido vindo do storage
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function fmtPct(fraction: number, dec = 1): string {
  return (fraction * 100).toFixed(dec) + "%";
}
function fmtChips(v: number, dec = 1): string {
  // Infinity/NaN chegam a tela como texto ("Infinity") se passarem direto.
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(dec);
}

const RANKS_DESC = [...RANKS].sort((a, b) => b - a); // 14..2
const SUIT_GLYPH = SUIT_SYM;

function suitColor(suit: string): string {
  return suit === "h" || suit === "d" ? "text-red-400" : "text-gray-200";
}

const inputCls =
  "bg-gray-800/50 border-gray-700 text-gray-100 font-mono placeholder:text-gray-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 h-9";

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center ml-1">
          <Info className="h-3.5 w-3.5 text-gray-500 hover:text-emerald-400 transition-colors cursor-help" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[260px] text-xs bg-gray-800 border-gray-700 text-gray-200"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── component ───────────────────────────────────────────────
export default function CombosCalculator() {
  const [board, setBoard] = useState<PCard[]>([]);
  const [hero, setHero] = useState<PCard[]>([]);
  const [target, setTarget] = useState<"board" | "hero">("board");

  // entries: range do vilao. Historico local (D-F2-2/D-F2-6): Ctrl+Z/Ctrl+Y
  // escopados a esta matriz, igual as duas de `RangeLab.tsx` — o popup ganha o
  // atalho "de graca" por consumir o mesmo `RangeMatrix`.
  const [entryHistory, setEntryHistory] = useState<HistoryState<RangeEntry[]>>(() =>
    createHistory<RangeEntry[]>([]),
  );
  const entries = entryHistory.present;
  function setEntries(next: RangeEntry[]): void {
    setEntryHistory((h) => pushHistory(h, next));
  }
  function undoEntries(): void {
    setEntryHistory((h) => undoHistory(h));
  }
  function redoEntries(): void {
    setEntryHistory((h) => redoHistory(h));
  }
  const [defaultFreq, setDefaultFreq] = useState(1);
  const [importText, setImportText] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [cardNotice, setCardNotice] = useState<string | null>(null);
  const [suitPickerFor, setSuitPickerFor] = useState<string | null>(null);

  const [potInput, setPotInput] = useState("36.1");
  const [callInput, setCallInput] = useState("13.8");
  const [bbInput, setBbInput] = useState("");

  const [k, setK] = useState(1); // multiplicador de sensibilidade
  const [tableOpen, setTableOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(true);

  // saved spots (localStorage)
  const [savedSpots, setSavedSpots] = useState<SavedSpot[]>([]);
  const [spotName, setSpotName] = useState("");
  const [spotsOpen, setSpotsOpen] = useState(false);

  const hydrated = useRef(false);

  // ── hidratacao: carrega rascunho + spots salvos uma vez ──
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (draft.board) setBoard(draft.board);
      if (draft.hero) setHero(draft.hero);
      // Init direto do historico (nao push): hidratacao nao e um gesto de
      // pintura, e o ponto de partida — nao ha "antes" para Ctrl+Z revelar.
      if (draft.entries) setEntryHistory(createHistory<RangeEntry[]>(draft.entries));
      if (draft.potInput != null && draft.potInput !== "") setPotInput(draft.potInput);
      if (draft.callInput != null && draft.callInput !== "") setCallInput(draft.callInput);
      if (draft.bbInput != null) setBbInput(draft.bbInput);
    }
    setSavedSpots(loadSavedSpots());
    hydrated.current = true;
  }, []);

  // ── auto-save (debounced) do rascunho ──
  useEffect(() => {
    if (!hydrated.current) return;
    const id = setTimeout(() => {
      saveDraft({ board, hero, entries, potInput, callInput, bbInput });
    }, 400);
    return () => clearTimeout(id);
  }, [board, hero, entries, potInput, callInput, bbInput]);

  const dead = useMemo(() => {
    const s = new Set<string>();
    for (const c of [...board, ...hero]) s.add(cardKey(c));
    return s;
  }, [board, hero]);

  // ── card picker ──
  // A decisao do clique mora em resolveCardClick (lib, testavel fora do React).
  // Antes, clique com o bordo cheio simplesmente nao fazia nada — silencio total.
  function toggleCard(card: PCard) {
    const key = cardKey(card);
    const action = resolveCardClick({ card, board, hero, target });

    if (action.type === "reject") {
      setCardNotice("Bordo e mao completos — remova uma carta antes de trocar.");
      return;
    }
    setCardNotice(null);

    if (action.type === "remove") {
      // Remover NAO mexe no alvo — o RF-00.7 so pediu voz para o clique mudo.
      if (action.from === "board") setBoard((b) => b.filter((c) => cardKey(c) !== key));
      else setHero((h) => h.filter((c) => cardKey(c) !== key));
      return;
    }

    if (action.to === "board") {
      setBoard((b) => [...b, card]);
      if (board.length + 1 >= 5 && hero.length < 2) setTarget("hero"); // auto-avanca
    } else {
      setHero((h) => [...h, card]);
      if (hero.length + 1 >= 2 && board.length < 5) setTarget("board");
    }
    if (action.retargeted) {
      setCardNotice(
        action.to === "hero"
          ? "Bordo completo — a carta foi para a mao do heroi."
          : "Mao completa — a carta foi para o bordo.",
      );
    }
  }

  // Aplica uma string de range (solver: "99+, ATs+:0.5, A5s-A2s, QhJh") nas
  // entries. `parseRangeText` (RF-02.5) e a MESMA gramatica que a biblioteca de
  // ranges usa — sem parser paralelo (D9 do indice do Range Lab).
  function applyRangeString(text: string, replace = false) {
    const { entries: parsed, warnings } = parseRangeText(text);
    const next = replace ? [] : [...entries];
    for (const t of parsed) {
      const idx = next.findIndex((e) => e.notation === t.notation);
      if (idx >= 0) next[idx] = t;
      else next.push(t);
    }
    setEntries(next);
    setImportWarnings(warnings);
  }
  function doImport() {
    applyRangeString(importText);
    setImportText("");
  }

  // ── spots salvos ──
  function saveCurrentSpot() {
    const name = (spotName.trim() || `Spot ${savedSpots.length + 1}`).slice(0, 60);
    // id unico via timestamp (Date.now ok no componente; persistence.ts e quem nao usa Date)
    const id = `${board.map(cardKey).join("")}-${entries.length}-${Date.now()}`;
    const spot: SavedSpot = {
      id,
      name,
      savedAt: Date.now(),
      board: board.map(cardKey),
      hero: hero.map(cardKey),
      entries,
      potInput,
      callInput,
      bbInput,
    };
    const next = [spot, ...savedSpots].slice(0, 50);
    setSavedSpots(next);
    persistSavedSpots(next);
    setSpotName("");
  }
  function loadSpot(s: SavedSpot) {
    // hydrateSpot devolve os campos SANEADOS — os crus de `s` nao entram no estado.
    const r = hydrateSpot(s);
    if (!r) return;
    setBoard(r.board);
    setHero(r.hero);
    // resetHistory (nao push): carregar um spot salvo e reset por fora do
    // fluxo de pintura — um Ctrl+Z depois nao pode revelar o range anterior
    // (D-F2-2, o proprio exemplo citado no ADR).
    setEntryHistory((h) => resetHistory(h, r.entries));
    setPotInput(r.potInput);
    setCallInput(r.callInput);
    setBbInput(r.bbInput);
    setTarget(r.board.length >= 5 ? "hero" : "board");
  }
  function deleteSpot(id: string) {
    const next = savedSpots.filter((s) => s.id !== id);
    setSavedSpots(next);
    persistSavedSpots(next);
  }

  // ── spot + verdict ──
  const potCurrent = parseNum(potInput);
  const callAmount = parseNum(callInput);
  const bb = parseNum(bbInput);

  // Portao de "spot pronto": range inteiro em frequencia 0 nao passa mais
  // (antes virava FOLD -EV com 0.0% de equity — RF-00.2).
  const readiness = useMemo(
    () => describeSpotReadiness({ board, hero, entries, potCurrent, callAmount }),
    [board, hero, entries, potCurrent, callAmount],
  );

  const spot: Spot | null = useMemo(() => {
    if (!readiness.ready) return null;
    return {
      board,
      hero: [hero[0], hero[1]],
      villainRange: entries,
      potCurrent,
      callAmount,
    };
  }, [readiness, board, hero, entries, potCurrent, callAmount]);

  const evaluation = useMemo(() => {
    if (!spot) return { verdict: null, error: null };
    return tryEvaluateSpot(spot);
  }, [spot]);

  const verdict = evaluation.verdict;
  // Card removal pode matar o range inteiro mesmo com frequencias > 0.
  const rangeIsEmpty = verdict?.degradedReason === "empty_range";
  // A guarda e `decision != null`, NAO `!rangeIsEmpty`: `degradedReason` e uma
  // uniao feita para crescer (a F1 traz Monte Carlo e card removal mutuo). Se a
  // guarda olhasse so a razao de hoje, a razao de amanha renderizaria o banner
  // vermelho escrito "BREAK-EVEN" com 0,0% — o bug que esta frente veio matar.
  const showVerdict = verdict != null && verdict.decision != null;
  const basis = useMemo(
    () => (showVerdict && verdict ? verdictCalcBasis(verdict) : null),
    [showVerdict, verdict],
  );

  // Reusa o Verdict ja calculado: sem isto cada tick do slider reexecutava a
  // enumeracao de runouts do turn/flop inteira.
  const sliderEquity = useMemo(() => {
    if (!showVerdict || !verdict) return null;
    return heroEquityAtMultiplier(verdict, k);
  }, [showVerdict, verdict, k]);

  // Ponto de virada fora do river (RF-02.6, D-F2-4): forma fechada sobre o
  // Verdict ja calculado, sem reenumerar runout. `ev.ts` nao muda — este e um
  // numero NOVO ao lado do `breakevenFrequency` fechado (que so vale no river).
  const breakeven = useMemo(() => {
    if (!showVerdict || !verdict) return null;
    return solveBreakevenMultiplier(verdict);
  }, [showVerdict, verdict]);

  const alpha = potCurrent + callAmount > 0 ? callAmount / (potCurrent + callAmount) : 0;

  const decisionColor =
    verdict?.decision === "call"
      ? "from-emerald-600 to-emerald-700"
      : verdict?.decision === "breakeven"
        ? "from-amber-500 to-amber-600"
        : "from-red-600 to-red-700";

  // ── render ──
  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-3xl">
        {/* Header */}
        <div className="text-center space-y-1 pb-1">
          <div className="flex items-center justify-center gap-2">
            <Layers className="h-5 w-5 text-emerald-500" />
            <h1 className="text-lg font-bold tracking-tight text-gray-100">
              Calculadora de Combos
            </h1>
          </div>
          <p className="text-xs text-gray-500">
            River call EV — card removal, equity vs pot odds, break-even
          </p>
        </div>

        {showWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-800/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Ferramenta de estudo. Card removal exato; turn/flop por enumeracao.</span>
            <button onClick={() => setShowWarning(false)} className="text-yellow-500/70 hover:text-yellow-300" title="Dispensar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Estados que antes eram mudos: carta duplicada, range sem peso, o que falta */}
        {evaluation.error?.kind === "duplicate_card" && (
          <div
            data-testid="combos-duplicate-card"
            className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            A carta <span className="font-mono font-bold">{evaluation.error.card}</span> aparece
            duas vezes entre o bordo e a mao do heroi. Remova a repetida.
          </div>
        )}

        {cardNotice && (
          <div
            data-testid="combos-card-notice"
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2 text-xs text-gray-300"
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{cardNotice}</span>
            <button onClick={() => setCardNotice(null)} className="text-gray-500 hover:text-gray-200" title="Dispensar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Sticky verdict summary */}
        {showVerdict && verdict && (
          <div className="sticky top-0 z-20 -mx-1">
            <div className={`flex items-center justify-center gap-3 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-lg ${
              verdict.decision === "call"
                ? "bg-emerald-600 text-white"
                : verdict.decision === "breakeven"
                  ? "bg-amber-600 text-white"
                  : "bg-red-600 text-white"
            }`}>
              <span className="uppercase tracking-wide">
                {verdict.decision === "call" ? "CALL" : verdict.decision === "fold" ? "FOLD" : "BREAK-EVEN"}
              </span>
              <span className="font-mono opacity-90">E {fmtPct(verdict.heroEquity)} / a {fmtPct(verdict.requiredEquity)}</span>
              <span className="font-mono">{verdict.evCall >= 0 ? "+" : ""}{fmtChips(verdict.evCall)} fichas</span>
            </div>
          </div>
        )}

        {/* ── Card picker ── */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Bordo &amp; Mao do Heroi
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm" variant={target === "board" ? "default" : "outline"}
                  className={`h-7 text-xs ${target === "board" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "bg-transparent border-gray-700 text-gray-400"}`}
                  onClick={() => setTarget("board")}
                >
                  Bordo {board.length}/5
                </Button>
                <Button
                  size="sm" variant={target === "hero" ? "default" : "outline"}
                  className={`h-7 text-xs ${target === "hero" ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600" : "bg-transparent border-gray-700 text-gray-400"}`}
                  onClick={() => setTarget("hero")}
                >
                  Heroi {hero.length}/2
                </Button>
              </div>
            </div>

            {/* slots */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[10px] text-gray-500 w-12">Bordo:</span>
              {board.length === 0 && <span className="text-xs text-gray-600">—</span>}
              {board.map((c) => (
                <button key={cardKey(c)} onClick={() => toggleCard(c)}
                  className={`px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono ${suitColor(c.suit)}`}>
                  {rankChar(c.rank)}{SUIT_GLYPH[c.suit]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[10px] text-gray-500 w-12">Heroi:</span>
              {hero.length === 0 && <span className="text-xs text-gray-600">—</span>}
              {hero.map((c) => (
                <button key={cardKey(c)} onClick={() => toggleCard(c)}
                  className={`px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono ${suitColor(c.suit)}`}>
                  {rankChar(c.rank)}{SUIT_GLYPH[c.suit]}
                </button>
              ))}
            </div>

            {/* 52-card grid */}
            <div className="space-y-1">
              {SUITS.map((su) => (
                <div key={su} className="flex gap-1 flex-wrap">
                  {RANKS_DESC.map((r) => {
                    const card = { rank: r, suit: su } as PCard;
                    const key = cardKey(card);
                    const used = dead.has(key);
                    return (
                      <button key={key} onClick={() => toggleCard(card)}
                        className={`w-7 h-8 rounded text-xs font-mono border transition-colors ${
                          used
                            ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-200"
                            : `bg-gray-800/40 border-gray-700 hover:border-emerald-500/50 ${suitColor(su)}`
                        }`}>
                        {rankChar(r)}{SUIT_GLYPH[su]}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Range matrix ── */}
        {/* D13 (F2, ADR-247 D-F2-6): matriz e naipes vem de range-lab/ — o
            mesmo componente que /range-lab usa nos dois lados. So o range do
            VILAO troca aqui; o heroi de CombosCalculator continua sendo
            [Card, Card] unico, fora deste escopo. */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Range do Vilao
            </Label>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-gray-500">Freq. p/ novas celulas: {fmtPct(defaultFreq, 0)}</span>
              <div className="w-32">
                <Slider value={[defaultFreq]} min={0} max={1} step={0.05}
                  onValueChange={([v]) => setDefaultFreq(v)} />
              </div>
              {entries.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400 hover:text-red-400"
                  onClick={() => setEntries([])}>
                  <Trash2 className="h-3 w-3 mr-1" /> Limpar
                </Button>
              )}
            </div>

            <RangeMatrix
              entries={entries}
              onChange={setEntries}
              defaultFrequency={defaultFreq}
              onUndo={undoEntries}
              onRedo={redoEntries}
              onOpenSuitPicker={(notation) => setSuitPickerFor(suitPickerFor === notation ? null : notation)}
              testId="combos-villain-matrix"
            />

            {suitPickerFor &&
              (() => {
                const activeEntry = entries.find((e) => e.notation === suitPickerFor);
                const parsed = parseNotation(suitPickerFor);
                if (!activeEntry || !parsed) return null;
                return (
                  <SuitPickerPopover
                    notation={suitPickerFor}
                    combos={enumerateCombos(parsed, dead)}
                    entry={activeEntry}
                    onChange={(next) =>
                      setEntries(entries.map((e) => (e.notation === next.notation ? next : e)))
                    }
                  />
                );
              })()}

            {/* presets */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-gray-500 self-center mr-1">Presets:</span>
              {RANGE_PRESETS.map((p) => (
                <button key={p.id} onClick={() => applyRangeString(p.range, true)}
                  title={p.range}
                  className="px-2 py-0.5 rounded text-[10px] bg-gray-800/60 border border-gray-700 text-gray-300 hover:border-emerald-500/50 hover:text-emerald-300">
                  {p.label}
                </button>
              ))}
            </div>

            {/* text import (formato solver) */}
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500 flex items-center">
                Importar range (formato solver / GTO Wizard)
                <InfoTip text="Separe por virgula ou linha. Suporta 99+, ATs+, A5s-A2s, freq via ':' (AKo:0.5), suit-specific (QhJh, K7hh). Ex.: 99+, ATs+, KQs, A5s-A2s:0.5, QhJh" />
              </Label>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
                placeholder="99+, ATs+, KQs, A5s-A2s:0.5, QhJh"
                className="w-full h-16 rounded bg-gray-800/50 border border-gray-700 text-gray-100 font-mono text-xs p-2 placeholder:text-gray-600" />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={doImport}>
                  Adicionar ao range
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent border-gray-700 text-gray-400"
                  onClick={() => { applyRangeString(importText, true); setImportText(""); }}>
                  Substituir range
                </Button>
              </div>
              {importWarnings.length > 0 && (
                <div
                  data-testid="combos-import-warnings"
                  className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-0.5">
                      {/* key por indice: dois tokens ruins iguais colidiriam por texto. */}
                      {importWarnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setImportWarnings([])}
                      className="text-amber-500/70 hover:text-amber-200"
                      title="Dispensar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* active entries list */}
            <RangeEntryList entries={entries} onChange={setEntries} testId="combos-villain-entries" />
          </CardContent>
        </Card>

        {/* ── Bet inputs ── */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Aposta
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Pote atual</Label>
                  <InfoTip text="Pote ja incluindo a aposta do vilao." />
                </div>
                <Input type="text" inputMode="decimal" value={potInput}
                  onChange={(e) => setPotInput(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">Call</Label>
                  <InfoTip text="Valor que voce precisa pagar." />
                </div>
                <Input type="text" inputMode="decimal" value={callInput}
                  onChange={(e) => setCallInput(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center">
                  <Label className="text-xs text-gray-400">BB (opc.)</Label>
                  <InfoTip text="Tamanho do big blind para mostrar EV em bb." />
                </div>
                <Input type="text" inputMode="decimal" value={bbInput}
                  onChange={(e) => setBbInput(e.target.value)} placeholder="—" className={inputCls} />
              </div>
            </div>
            <div className="text-xs text-gray-400">
              Equity necessaria (alpha): <span className="font-mono text-emerald-400">{fmtPct(alpha, 2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── Saved spots ── */}
        <Card className="bg-gray-900 border-gray-800 text-gray-200">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Input value={spotName} onChange={(e) => setSpotName(e.target.value)}
                placeholder="Nome do spot (opcional)" className={`${inputCls} flex-1`} />
              <Button size="sm" className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700"
                disabled={board.length < 3 || hero.length !== 2}
                onClick={saveCurrentSpot}>
                <Save className="h-3.5 w-3.5 mr-1" /> Salvar spot
              </Button>
            </div>
            {savedSpots.length > 0 && (
              <Collapsible open={spotsOpen} onOpenChange={setSpotsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full py-2 px-3 rounded-lg bg-gray-800/40 border border-gray-800 text-xs text-gray-400 hover:text-gray-200">
                    <span className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5" /> Spots salvos ({savedSpots.length})</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${spotsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-1 max-h-48 overflow-y-auto">
                  {savedSpots.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs px-1">
                      <button onClick={() => loadSpot(s)} className="flex-1 text-left text-gray-300 hover:text-emerald-400 truncate">
                        {s.name}
                        <span className="text-gray-600 ml-2 font-mono">{s.board.join(" ")}</span>
                      </button>
                      <button onClick={() => deleteSpot(s.id)} className="text-gray-600 hover:text-red-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>

        {/* ── RESULTS ── */}
        {showVerdict && verdict && spot && (
          <>
            <div className="pt-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Veredito</span>
                <div className="h-px flex-1 bg-gray-800" />
              </div>
            </div>

            {verdict.emptyEntries.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Classes sem combos (zeradas por bloqueadores ou notacao invalida): {verdict.emptyEntries.join(", ")}
              </div>
            )}

            {verdict.street !== "river" && (
              <div className="text-[10px] text-gray-500 text-center">
                Bordo de {verdict.street} — equity por enumeracao de runouts; ganha/perde/chop
                e a categoria dominante do combo, nao o resultado final.
              </div>
            )}

            {/* Decision banner */}
            <div className={`p-5 rounded-xl bg-gradient-to-br ${decisionColor} text-white shadow-lg`}>
              <div className="text-center space-y-2">
                <div className="text-xs font-bold uppercase tracking-widest opacity-90">
                  {verdict.decision === "call" ? "CALL (+EV)" : verdict.decision === "fold" ? "FOLD (-EV)" : "BREAK-EVEN"}
                </div>
                <div className="text-4xl font-black font-mono">
                  {fmtPct(verdict.heroEquity)}
                </div>
                <div className="text-xs opacity-90">
                  equity do heroi vs alpha {fmtPct(verdict.requiredEquity)}
                </div>
                {/* barra */}
                <div className="relative h-3 bg-black/30 rounded-full overflow-hidden mt-2 max-w-sm mx-auto">
                  <div className="absolute inset-y-0 left-0 bg-white/80" style={{ width: fmtPct(Math.min(1, verdict.heroEquity)) }} />
                  <div className="absolute inset-y-0 w-0.5 bg-yellow-300" style={{ left: fmtPct(Math.min(1, verdict.requiredEquity)) }} title="alpha" />
                </div>
                <p className="text-sm opacity-90 mt-2">
                  EV do call: <span className="font-mono font-bold">{verdict.evCall >= 0 ? "+" : ""}{fmtChips(verdict.evCall)}</span> fichas
                  {bb > 0 && <span className="opacity-80"> ({(verdict.evCall / bb).toFixed(2)} bb)</span>}
                </p>
              </div>
            </div>

            {/* Combo counts */}
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                  Contagem de Combos (ponderada)
                  <InfoTip
                    text={
                      verdict.street === "river"
                        ? "Combos ponderados por categoria. No river a categoria e o resultado final, entao esta contagem tambem e a base do calculo."
                        : "Contagem por categoria dominante. Fora do river ela NAO e a base do calculo — o veredito roda sobre a massa efetiva, mostrada no bloco 'Quanto Falta'."
                    }
                  />
                </Label>
                <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                  <div>
                    <div className="text-[10px] text-gray-500">Heroi ganha</div>
                    <div className="font-mono text-lg text-emerald-400">{fmtChips(verdict.W)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Heroi perde</div>
                    <div className="font-mono text-lg text-red-400">{fmtChips(verdict.L)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Chop</div>
                    <div className="font-mono text-lg text-amber-400">{fmtChips(verdict.C)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Total</div>
                    <div className="font-mono text-lg text-gray-200">{fmtChips(verdict.totalCombos)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quanto falta */}
            {verdict.decision !== "call" && basis && (
              <Card className="bg-gray-900 border-gray-800 text-gray-200">
                <CardContent className="p-4 space-y-2">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Quanto Falta
                  </Label>
                  {basis.basis === "effective" && (
                    <p className="text-[10px] text-gray-500">
                      Base: massa efetiva do range (soma de peso x equity) — a mesma do
                      veredito. A contagem por categoria acima e outra base.
                    </p>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 flex items-center">Gap de equity<InfoTip text="alpha - E. Pontos percentuais que faltam." /></span>
                    <span className="font-mono text-red-400">{fmtPct(verdict.equityGap, 2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 flex items-center">Deficit de EV<InfoTip text="Fichas perdidas no call (negativo)." /></span>
                    <span className="font-mono text-red-400">{fmtChips(verdict.evDeficit)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 flex items-center">
                      {basis.basis === "effective" ? "Massa vencedora necessaria" : "Combos vencedores necessarios"}
                      <InfoTip text="W* = [alpha*L + C*(alpha-0.5)]/(1-alpha), na base declarada acima. Quanta massa de vitoria voce precisaria." />
                    </span>
                    <span className="font-mono text-gray-200">{fmtChips(verdict.winningCombosNeeded)} (tem {fmtChips(basis.W)})</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sensitivity slider */}
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4 space-y-3">
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                  Sensibilidade
                  <InfoTip text="Escala a frequencia dos combos que o heroi GANHA (blefes/maos piores do vilao). Veja o spot virar de call para fold conforme o vilao fica mais value-heavy." />
                </Label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500 w-20">Mult. blefes: {fmtPct(k, 0)}</span>
                  <div className="flex-1">
                    <Slider value={[k]} min={0} max={1.5} step={0.01} onValueChange={([v]) => setK(v)} />
                  </div>
                </div>
                {sliderEquity != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Equity em {fmtPct(k, 0)}:</span>
                    <span className={`font-mono ${sliderEquity >= verdict.requiredEquity ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtPct(sliderEquity)} {sliderEquity >= verdict.requiredEquity ? "(call)" : "(fold)"}
                    </span>
                  </div>
                )}
                {/*
                  O valor fechado de breakevenFrequency (W-estrela sobre W) supoe que escalar um
                  combo vencedor move so a massa vencedora. Isso e verdade no river
                  (equity 0/0.5/1); no turn/flop o combo vencedor carrega a propria
                  fracao perdedora junto, e o numero erra feio — medido no flop:
                  0,42 anunciado contra 0,20 real, 63% de equity onde alpha e 53%.
                  Numero errado perde para numero ausente: fora do river a tela
                  manda o jogador no slider, que agora e exato. Solver numerico do
                  ponto de virada foi passado para a F2 (ver F0-verdade.md).
                */}
                {verdict.street === "river" ? (
                  verdict.breakevenFrequency != null ? (
                    verdict.breakevenFrequency > 1.5 ? (
                      <div
                        data-testid="combos-breakeven-river"
                        className="text-[10px] text-center text-gray-500"
                      >
                        Ponto de virada acima de 150% — fora da faixa que o slider demonstra.
                      </div>
                    ) : (
                      <div
                        data-testid="combos-breakeven-river"
                        className="text-xs text-center text-amber-400"
                      >
                        Break-even: vilao precisa estar blefando ~<span className="font-mono font-bold">{fmtPct(verdict.breakevenFrequency, 0)}</span> da frequencia atual para o call ficar marginal.
                      </div>
                    )
                  ) : (
                    <div
                      data-testid="combos-breakeven-river"
                      className="text-[10px] text-center text-gray-500"
                    >
                      Ponto de virada indisponivel para este spot.
                    </div>
                  )
                ) : breakeven?.k != null ? (
                  <div
                    data-testid="combos-breakeven-turnflop"
                    className="text-xs text-center text-amber-400"
                  >
                    Ponto de virada: vilao precisa estar blefando ~<span className="font-mono font-bold">{fmtPct(breakeven.k, 2)}</span> da frequencia atual para o call ficar marginal.
                  </div>
                ) : (
                  <div
                    data-testid="combos-breakeven-turnflop"
                    className="text-[10px] text-center text-gray-500"
                  >
                    {breakeven?.degradedReason === "no_flip"
                      ? "Este spot nao vira dentro da faixa — nao ha ponto de virada a mostrar."
                      : "Ponto de virada indisponivel para este spot."}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed combo table */}
            <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700">
                  <span className="text-xs flex items-center gap-2"><Spade className="h-3.5 w-3.5" /> Tabela de combos ({verdict.perCombo.length})</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${tableOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-800">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-800 text-gray-400">
                      <tr>
                        <th className="text-left p-2">Combo</th>
                        <th className="text-right p-2">Peso</th>
                        <th className="text-right p-2">Resultado</th>
                        <th className="text-right p-2">Equity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verdict.perCombo.map((r) => {
                        const key = comboKey(r.combo[0], r.combo[1]);
                        return (
                          <tr key={key} className="border-t border-gray-800">
                            <td className="p-2 font-mono">
                              <span className={suitColor(r.combo[0].suit)}>{rankChar(r.combo[0].rank)}{SUIT_GLYPH[r.combo[0].suit]}</span>
                              <span className={suitColor(r.combo[1].suit)}>{rankChar(r.combo[1].rank)}{SUIT_GLYPH[r.combo[1].suit]}</span>
                            </td>
                            <td className="p-2 text-right font-mono text-gray-400">{r.weight.toFixed(2)}</td>
                            <td className={`p-2 text-right ${r.outcome === "win" ? "text-emerald-400" : r.outcome === "lose" ? "text-red-400" : "text-amber-400"}`}>
                              {r.outcome === "win" ? "ganha" : r.outcome === "lose" ? "perde" : "chop"}
                            </td>
                            <td className="p-2 text-right font-mono text-gray-300">{fmtPct(r.equity, 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {!showVerdict && !evaluation.error && (
          <div
            data-testid={rangeIsEmpty ? "combos-empty-range" : "combos-empty-state"}
            className="text-center py-4 space-y-1"
          >
            <p className="text-xs text-gray-400">
              {rangeIsEmpty
                ? "Range sem combos com peso — ajuste as frequencias."
                : readiness.reason
                  ? READINESS_MESSAGE[readiness.reason]
                  : "Monte o spot para ver o veredito."}
            </p>
            {rangeIsEmpty && verdict!.emptyEntries.length > 0 && (
              <p className="text-[10px] text-amber-400">
                Card removal zerou estas classes: {verdict!.emptyEntries.join(", ")}
              </p>
            )}
            <p className="text-[10px] text-gray-600">
              Bordo (3 a 5 cartas), mao do heroi (2 cartas), range do vilao com peso, pote e call.
            </p>
          </div>
        )}

        {/* How it works */}
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full py-2.5 px-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-700">
              <span className="text-xs flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" /> Como Funciona</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${helpOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Card className="bg-gray-900 border-gray-800 text-gray-200">
              <CardContent className="p-4 space-y-3 text-xs text-gray-400 leading-relaxed">
                <p><strong className="text-emerald-400">Card removal:</strong> cada combo do range so conta se suas cartas nao estao no bordo nem na sua mao. Suited com os dois ranks no bordo despencam de 4 para 2-3 combos.</p>
                <p><strong className="text-emerald-400">Pot odds:</strong> alpha = call / (pote + call). Voce precisa de equity {">"}= alpha para pagar.</p>
                <p><strong className="text-emerald-400">Equity (E):</strong> (combos que voce ganha + 0.5 * chops) / total. No river e deterministico; chop = meia vitoria.</p>
                <p><strong className="text-emerald-400">EV do call:</strong> E * (pote + call) - call. Positivo = lucro vs foldar.</p>
                <p><strong className="text-emerald-400">Sensibilidade:</strong> escale os blefes do vilao e veja o ponto exato onde o spot vira de call para fold.</p>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </TooltipProvider>
  );
}
