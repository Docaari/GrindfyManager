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
  evaluateSpot,
  enumerateCombos,
  parseNotation,
  expandRangeToken,
  heroEquityAtMultiplier,
  DuplicateCardError,
  RANGE_PRESETS,
  saveDraft,
  loadDraft,
  deserializeState,
  loadSavedSpots,
  persistSavedSpots,
  type SavedSpot,
} from "@/lib/combo-calc";
import type { Card as PCard, RangeEntry, Spot, Verdict } from "@/lib/combo-calc";

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
  return v.toFixed(dec);
}

const RANKS_DESC = [...RANKS].sort((a, b) => b - a); // 14..2
const SUIT_GLYPH = SUIT_SYM;

function suitColor(suit: string): string {
  return suit === "h" || suit === "d" ? "text-red-400" : "text-gray-200";
}

/** Notacao da celula da matriz 13x13. */
function cellNotation(r: number, c: number): string {
  const a = RANKS_DESC[r];
  const b = RANKS_DESC[c];
  if (r === c) return rankChar(a) + rankChar(a); // par
  if (r < c) return rankChar(a) + rankChar(b) + "s"; // suited (acima da diagonal)
  return rankChar(b) + rankChar(a) + "o"; // offsuit (abaixo)
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

  // entries: Map notation -> frequency (classes da matriz + specific via texto).
  const [entries, setEntries] = useState<RangeEntry[]>([]);
  const [defaultFreq, setDefaultFreq] = useState(1);
  const [importText, setImportText] = useState("");
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
  const drag = useRef<{ active: boolean; mode: "add" | "remove" } | null>(null);

  // ── hidratacao: carrega rascunho + spots salvos uma vez ──
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (draft.board) setBoard(draft.board);
      if (draft.hero) setHero(draft.hero);
      if (draft.entries) setEntries(draft.entries);
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

  // ── encerra drag da matriz em mouseup/saida-da-janela/blur ──
  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener("mouseup", stop);
    window.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("mouseleave", stop); // mouse sai da viewport
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("mouseleave", stop);
    };
  }, []);

  const dead = useMemo(() => {
    const s = new Set<string>();
    for (const c of [...board, ...hero]) s.add(cardKey(c));
    return s;
  }, [board, hero]);

  // ── card picker ──
  function toggleCard(card: PCard) {
    const key = cardKey(card);
    // ja alocada? remove de onde estiver.
    if (board.some((c) => cardKey(c) === key)) {
      setBoard((b) => b.filter((c) => cardKey(c) !== key));
      return;
    }
    if (hero.some((c) => cardKey(c) === key)) {
      setHero((h) => h.filter((c) => cardKey(c) !== key));
      return;
    }
    if (target === "board") {
      if (board.length >= 5) return;
      setBoard((b) => {
        const next = [...b, card];
        if (next.length >= 5 && hero.length < 2) setTarget("hero"); // auto-avanca
        return next;
      });
    } else {
      if (hero.length >= 2) return;
      setHero((h) => {
        const next = [...h, card];
        if (next.length >= 2 && board.length < 5) setTarget("board");
        return next;
      });
    }
  }

  // ── range matrix ──
  const entryMap = useMemo(() => {
    const m = new Map<string, RangeEntry>();
    for (const e of entries) m.set(e.notation, e);
    return m;
  }, [entries]);

  function addCell(notation: string) {
    setEntries((prev) => {
      if (prev.some((e) => e.notation === notation)) return prev;
      const parsed = parseNotation(notation);
      if (!parsed) return prev;
      return [...prev, { notation, kind: parsed.kind, frequency: defaultFreq }];
    });
  }
  function toggleCell(notation: string) {
    if (entryMap.has(notation)) removeEntry(notation);
    else addCell(notation);
  }

  // ── drag-select da matriz ──
  function onCellDown(notation: string) {
    const present = entryMap.has(notation);
    drag.current = { active: true, mode: present ? "remove" : "add" };
    if (present) removeEntry(notation);
    else addCell(notation);
  }
  function onCellEnter(notation: string) {
    const d = drag.current;
    if (!d?.active) return;
    if (d.mode === "add") addCell(notation);
    else removeEntry(notation);
  }

  function setEntryFreq(notation: string, freq: number) {
    setEntries((prev) =>
      prev.map((e) => (e.notation === notation ? { ...e, frequency: freq } : e)),
    );
  }
  function removeEntry(notation: string) {
    setEntries((prev) => prev.filter((e) => e.notation !== notation));
  }

  // aplica uma string de range (solver: "99+, ATs+:0.5, A5s-A2s, QhJh") nas entries
  function applyRangeString(text: string, replace = false) {
    const tokens = text
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    setEntries((prev) => {
      const next = replace ? [] : [...prev];
      for (const tok of tokens) {
        // separa "<notacao> : <freq>"
        const m = tok.match(/^(.+?)\s*[:=]\s*([\d.]+)$/) ?? tok.match(/^(\S+)$/);
        if (!m) continue;
        const freq = m[2] != null ? parseNum(m[2]) : 1;
        for (const base of expandRangeToken(m[1].trim())) {
          const parsed = parseNotation(base);
          if (!parsed) continue;
          const idx = next.findIndex((e) => e.notation === base);
          if (idx >= 0) next[idx] = { ...next[idx], frequency: freq };
          else next.push({ notation: base, kind: parsed.kind, frequency: freq });
        }
      }
      return next;
    });
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
    const r = deserializeState(s);
    if (!r) return;
    setBoard(r.board ?? []);
    setHero(r.hero ?? []);
    setEntries(r.entries ?? []);
    setPotInput(s.potInput);
    setCallInput(s.callInput);
    setBbInput(s.bbInput);
    setTarget((r.board?.length ?? 0) >= 5 ? "hero" : "board");
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

  const spot: Spot | null = useMemo(() => {
    if (board.length < 3 || hero.length !== 2 || entries.length === 0) return null;
    // call/pote ausentes -> spot incompleto (evita alpha=0 -> "CALL +EV" falso)
    if (callAmount <= 0 || potCurrent <= 0) return null;
    return {
      board,
      hero: [hero[0], hero[1]],
      villainRange: entries,
      potCurrent,
      callAmount,
    };
  }, [board, hero, entries, potCurrent, callAmount]);

  const verdict: Verdict | null = useMemo(() => {
    if (!spot) return null;
    try {
      return evaluateSpot(spot);
    } catch (e) {
      if (e instanceof DuplicateCardError) return null;
      throw e;
    }
  }, [spot]);

  const sliderEquity = useMemo(() => {
    if (!spot) return null;
    return heroEquityAtMultiplier(spot, k);
  }, [spot, k]);

  // combos concretos disponiveis de uma entry (card removal aplicado)
  function availableCombos(notation: string): PCard[][] {
    const parsed = parseNotation(notation);
    if (!parsed) return [];
    return enumerateCombos(parsed, dead);
  }

  // contagem de combos efetivos da entry (respeita filtro de naipe)
  function comboCount(e: RangeEntry): number {
    const avail = availableCombos(e.notation);
    if (!e.suits || e.suits.length === 0) return avail.length;
    const sel = new Set(e.suits);
    return avail.filter((c) => sel.has(comboKey(c[0], c[1]))).length;
  }

  // alterna um combo concreto dentro da entry (filtro de naipe)
  function toggleSuit(notation: string, key: string) {
    setEntries((prev) =>
      prev.map((en) => {
        if (en.notation !== notation) return en;
        const allKeys = availableCombos(notation).map((c) => comboKey(c[0], c[1]));
        const cur =
          en.suits && en.suits.length > 0
            ? new Set(en.suits)
            : new Set(allKeys);
        if (cur.has(key)) {
          if (cur.size <= 1) return en; // nao deixa zerar a classe
          cur.delete(key);
        } else {
          cur.add(key);
        }
        const arr = allKeys.filter((k) => cur.has(k));
        return { ...en, suits: arr.length === allKeys.length ? undefined : arr };
      }),
    );
  }

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

        {/* Sticky verdict summary */}
        {verdict && (
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

            <p className="text-[10px] text-gray-500">Clique ou arraste para pintar o range.</p>
            <div className="overflow-x-auto select-none">
              <div className="inline-grid" style={{ gridTemplateColumns: `repeat(13, minmax(0, 1fr))` }}
                onMouseLeave={() => { /* drag continua ate mouseup global */ }}>
                {RANKS_DESC.map((_, r) =>
                  RANKS_DESC.map((__, c) => {
                    const notation = cellNotation(r, c);
                    const e = entryMap.get(notation);
                    const active = !!e;
                    const partial = active && !!e.suits && e.suits.length > 0;
                    const isPair = r === c;
                    const isSuited = r < c;
                    return (
                      <button key={`${r}-${c}`}
                        onMouseDown={() => onCellDown(notation)}
                        onMouseEnter={() => onCellEnter(notation)}
                        title={notation}
                        className={`w-[26px] h-[26px] text-[9px] font-mono border ${partial ? "border-amber-400" : "border-gray-800"} ${
                          active
                            ? "bg-emerald-600 text-white"
                            : isPair
                              ? "bg-gray-700/60 text-gray-300"
                              : isSuited
                                ? "bg-gray-800/60 text-gray-400"
                                : "bg-gray-800/30 text-gray-500"
                        } hover:outline hover:outline-1 hover:outline-emerald-400`}
                        style={active && e.frequency < 1 ? { opacity: 0.4 + e.frequency * 0.6 } : undefined}
                      >
                        {notation.replace(/[so]$/, "")}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>

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
            </div>

            {/* active entries list */}
            {entries.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {entries.map((e) => {
                  const parsed = parseNotation(e.notation);
                  const avail = availableCombos(e.notation);
                  // Picker de naipe so faz sentido p/ classes com >1 combo possivel.
                  const canPickSuits =
                    parsed != null &&
                    parsed.kind !== "specific" &&
                    avail.length > 1;
                  const total = avail.length;
                  const selKeys =
                    e.suits && e.suits.length > 0
                      ? new Set(e.suits)
                      : null; // null = todos
                  const open = suitPickerFor === e.notation;
                  return (
                    <div key={e.notation} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-gray-200 w-14 shrink-0">{e.notation}</span>
                        {canPickSuits ? (
                          <button
                            onClick={() => setSuitPickerFor(open ? null : e.notation)}
                            className={`w-12 shrink-0 text-left ${selKeys ? "text-emerald-400" : "text-gray-500"} hover:text-emerald-300`}
                            title="Escolher naipes"
                          >
                            {comboCount(e)}/{total}c
                          </button>
                        ) : (
                          <span className="text-gray-500 w-12 shrink-0">{comboCount(e)}c</span>
                        )}
                        <div className="flex-1 min-w-[80px]">
                          <Slider value={[e.frequency]} min={0} max={1} step={0.01}
                            onValueChange={([v]) => setEntryFreq(e.notation, v)} />
                        </div>
                        <span className="font-mono text-gray-400 w-10 text-right">{fmtPct(e.frequency, 0)}</span>
                        <button onClick={() => removeEntry(e.notation)} className="text-gray-600 hover:text-red-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {open && canPickSuits && (
                        <div className="flex flex-wrap gap-1 pl-16 pb-1">
                          {avail.map((combo) => {
                            const key = comboKey(combo[0], combo[1]);
                            const on = selKeys ? selKeys.has(key) : true;
                            return (
                              <button key={key} onClick={() => toggleSuit(e.notation, key)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                  on
                                    ? "bg-emerald-600/80 border-emerald-500 text-white"
                                    : "bg-gray-800/60 border-gray-700 text-gray-500"
                                }`}>
                                <span className={on ? "" : suitColor(combo[0].suit)}>{rankChar(combo[0].rank)}{SUIT_GLYPH[combo[0].suit]}</span>
                                <span className={on ? "" : suitColor(combo[1].suit)}>{rankChar(combo[1].rank)}{SUIT_GLYPH[combo[1].suit]}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
        {verdict && spot && (
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
                Bordo de {verdict.street} — equity por enumeracao de runouts (nao showdown fixo).
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
                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Contagem de Combos (ponderada)
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
            {verdict.decision !== "call" && (
              <Card className="bg-gray-900 border-gray-800 text-gray-200">
                <CardContent className="p-4 space-y-2">
                  <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Quanto Falta
                  </Label>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 flex items-center">Gap de equity<InfoTip text="alpha - E. Pontos percentuais que faltam." /></span>
                    <span className="font-mono text-red-400">{fmtPct(verdict.equityGap, 2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 flex items-center">Deficit de EV<InfoTip text="Fichas perdidas no call (negativo)." /></span>
                    <span className="font-mono text-red-400">{fmtChips(verdict.evDeficit)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 flex items-center">Combos vencedores necessarios<InfoTip text="W* = [alpha*L + C*(alpha-0.5)]/(1-alpha). Quantos combos de vitoria voce precisaria." /></span>
                    <span className="font-mono text-gray-200">{fmtChips(verdict.winningCombosNeeded)} (tem {fmtChips(verdict.W)})</span>
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
                {verdict.breakevenFrequency != null && (
                  <div className="text-xs text-center text-amber-400">
                    Break-even: vilao precisa estar blefando ~<span className="font-mono font-bold">{fmtPct(verdict.breakevenFrequency, 0)}</span> da frequencia atual para o call ficar marginal.
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

        {!verdict && (
          <p className="text-xs text-gray-500 text-center py-4">
            Monte o bordo (3+ cartas), a mao do heroi (2 cartas) e o range do vilao para ver o veredito.
          </p>
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
