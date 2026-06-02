/**
 * useWarmupRitual — Sprint W-1 (T-11)
 *
 * State machine do warm-up:
 *   status: 'idle' | 'running' | 'paused' | 'completed' | 'aborted'
 *   currentBlock: 1..5
 *
 * APIs:
 *   start()                          — inicia ritual no Bloco 1
 *   submitEmotionalCheck(score)      — Bloco 1; <6 abre gate
 *   confirmOverride()                — confirma override e avanca
 *   advanceBlock(blockData)          — avanca para o proximo bloco
 *   pause() / resume()
 *   abort(reason)                    — POST com version=aborted
 *   completeRitual(intention)        — POST com version=full
 *   restoreDraft()                   — recupera draft de localStorage
 *
 * Persistencia: localStorage 'warmup-ritual-draft' a cada transicao + clear
 * ao final ou abort.
 */

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  SessionIntentionPayload,
  ColdStopCommitPayload,
} from "@/components/warmup/IntentionBlock";
import type { WarmupMode } from "@/components/warmup/durations";

/** Sub-objeto persistido em sessionIntention.coldStopCommit (ADR-235 D-3). */
export interface ColdStopCommit extends ColdStopCommitPayload {
  /** Timestamp ISO do momento em que o jogador comitou o stop a frio. */
  committedAt: string;
}

const DRAFT_KEY = "warmup-ritual-draft";
const DRAFT_TTL_MS = 30 * 60 * 1000; // 30min

export type WarmupStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "aborted";

export type AbortReason = "user_cancel" | "gate_no_go" | "timeout";

interface BlockData {
  blockId?: number;
  durationSeconds?: number;
  [key: string]: any;
}

interface DraftShape {
  ritualStartedAt: string;
  currentBlock: number;
  emotionalCheckScore: number | null;
  overrideUsed: boolean;
  blocksData: Record<number, BlockData>;
  status?: WarmupStatus;
  mode?: WarmupMode;
}

function readDraft(): DraftShape | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraftShape;
  } catch {
    return null;
  }
}

function writeDraft(d: DraftShape) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignore quota */
  }
}

function clearDraft() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function isDraftFresh(d: DraftShape | null): boolean {
  if (!d?.ritualStartedAt) return false;
  const started = new Date(d.ritualStartedAt).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started < DRAFT_TTL_MS;
}

export function useWarmupRitual() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<WarmupStatus>("idle");
  const [currentBlock, setCurrentBlock] = useState<number>(1);
  const [emotionalCheckScore, setEmotionalCheckScore] = useState<number | null>(
    null,
  );
  const [overrideUsed, setOverrideUsed] = useState<boolean>(false);
  const [gateOpen, setGateOpen] = useState<boolean>(false);
  const [blocksData, setBlocksData] = useState<Record<number, BlockData>>({});
  const [mode, setMode] = useState<WarmupMode | null>(null);
  const ritualStartedAtRef = useRef<string | null>(null);
  // Cold-stop commit (Fase D #5 / ADR-235 D-3). Guardado em ref para ser injetado
  // em sessionIntention no POST final sem disparar re-render.
  const coldStopCommitRef = useRef<ColdStopCommit | null>(null);

  const invalidateWarmupQueries = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/warmup-rituals/latest"] });
    qc.invalidateQueries({ queryKey: ["/api/warmup-rituals"] });
  }, [qc]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const persistDraft = useCallback(
    (override?: Partial<DraftShape>) => {
      if (!ritualStartedAtRef.current) return;
      const draft: DraftShape = {
        ritualStartedAt: ritualStartedAtRef.current,
        currentBlock,
        emotionalCheckScore,
        overrideUsed,
        blocksData,
        status,
        ...override,
      };
      writeDraft(draft);
    },
    [currentBlock, emotionalCheckScore, overrideUsed, blocksData, status],
  );

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const start = useCallback((modeArg?: WarmupMode) => {
    const startedAt = new Date().toISOString();
    ritualStartedAtRef.current = startedAt;
    coldStopCommitRef.current = null;
    setStatus("running");
    setCurrentBlock(1);
    setEmotionalCheckScore(null);
    setOverrideUsed(false);
    setGateOpen(false);
    setBlocksData({});
    if (modeArg) setMode(modeArg);
    writeDraft({
      ritualStartedAt: startedAt,
      currentBlock: 1,
      emotionalCheckScore: null,
      overrideUsed: false,
      blocksData: {},
      status: "running",
      mode: modeArg,
    });
  }, []);

  const submitEmotionalCheck = useCallback((score: number) => {
    setEmotionalCheckScore(score);
    if (score < 6) {
      setGateOpen(true);
    } else {
      setGateOpen(false);
    }
  }, []);

  const confirmOverride = useCallback(() => {
    setOverrideUsed(true);
    setGateOpen(false);
    const next = Math.min(currentBlock + 1, 5);
    // Persiste snapshot do bloco atual (gate disparado em bloco 2 = Respiracao+check)
    // com score + overrideUsed=true. Sem isso, blocksData[currentBlock] fica vazio
    // e analytics historico perde o registro do override.
    const nextBlocksData = {
      ...blocksData,
      [currentBlock]: {
        ...(blocksData[currentBlock] ?? {}),
        blockId: currentBlock,
        emotionalCheckScore,
        overrideUsed: true,
      },
    };
    setBlocksData(nextBlocksData);
    setCurrentBlock(next);
    if (ritualStartedAtRef.current) {
      writeDraft({
        ritualStartedAt: ritualStartedAtRef.current,
        currentBlock: next,
        emotionalCheckScore,
        overrideUsed: true,
        blocksData: nextBlocksData,
        status: "running",
      });
    }
  }, [currentBlock, emotionalCheckScore, blocksData]);

  const advanceBlock = useCallback(
    (blockData?: BlockData) => {
      const blockId = blockData?.blockId ?? currentBlock;
      const nextBlock = Math.min(currentBlock + 1, 5);
      const nextBlocksData = { ...blocksData, [blockId]: blockData ?? {} };
      setBlocksData(nextBlocksData);
      setCurrentBlock(nextBlock);
      if (ritualStartedAtRef.current) {
        writeDraft({
          ritualStartedAt: ritualStartedAtRef.current,
          currentBlock: nextBlock,
          emotionalCheckScore,
          overrideUsed,
          blocksData: nextBlocksData,
          status: "running",
        });
      }
    },
    [currentBlock, blocksData, emotionalCheckScore, overrideUsed],
  );

  const pause = useCallback(() => {
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    setStatus("running");
  }, []);

  const abort = useCallback(
    async (
      reason: AbortReason = "user_cancel",
      opts: { emotionalCheckScore?: number | null } = {},
    ): Promise<void> => {
      const startedAt = ritualStartedAtRef.current ?? new Date().toISOString();
      const completedAt = new Date().toISOString();
      const decisionToPlay =
        reason === "gate_no_go" ? false : null;
      // Permite chamar com score explicito (caso o setState ainda nao tenha
      // flushado via submitEmotionalCheck — ex: gate_no_go).
      const finalScore = opts.emotionalCheckScore ?? emotionalCheckScore;
      const blocks = Object.values(blocksData).map((b) => ({
        blockId: (b as any).blockId ?? 0,
        startedAt,
        completedAt,
        durationSeconds: (b as any).durationSeconds ?? 0,
        ...b,
      }));
      try {
        await apiRequest("POST", "/api/warmup-rituals", {
          startedAt,
          completedAt,
          durationMinutes: 0,
          version: "aborted",
          emotionalCheckScore: finalScore,
          decisionToPlay,
          overrideUsed,
          blocksCompleted: blocks,
          sessionIntention: null,
        });
      } catch (e) {
        // Loga mas nao bloqueia transicao de UI; ritual abortado eh terminal.
        // eslint-disable-next-line no-console
        console.error("[warmup] abort POST falhou:", e);
      } finally {
        clearDraft();
        ritualStartedAtRef.current = null;
        setStatus("aborted");
        invalidateWarmupQueries();
      }
    },
    [emotionalCheckScore, overrideUsed, blocksData, invalidateWarmupQueries],
  );

  // Registra o cold-stop commit (chamado pelo IntentionBlock via onCommitColdStop).
  // Carimba committedAt (ISO) no momento do commit (D-3).
  const setColdStopCommit = useCallback((payload: ColdStopCommitPayload) => {
    coldStopCommitRef.current = {
      ...payload,
      committedAt: new Date().toISOString(),
    };
  }, []);

  const completeRitual = useCallback(
    async (intention: SessionIntentionPayload | null): Promise<void> => {
      const startedAt = ritualStartedAtRef.current ?? new Date().toISOString();
      const completedAt = new Date().toISOString();
      const startedAtMs = new Date(startedAt).getTime();
      const completedAtMs = new Date(completedAt).getTime();
      const durationMinutes = Math.max(
        Math.round((completedAtMs - startedAtMs) / 60000),
        1,
      );
      const blocks = Object.entries(blocksData).map(([key, b]) => ({
        blockId: parseInt(key, 10),
        startedAt,
        completedAt,
        durationSeconds: (b as any).durationSeconds ?? 0,
        ...(b as any),
      }));
      // Injeta coldStopCommit no sessionIntention quando o jogador comitou (D-3).
      // Sem commit -> mantém o intention original (back-compat: null permanece null).
      const commit = coldStopCommitRef.current;
      const sessionIntention = commit
        ? { ...(intention ?? {}), coldStopCommit: commit }
        : intention;
      try {
        await apiRequest("POST", "/api/warmup-rituals", {
          startedAt,
          completedAt,
          durationMinutes,
          version: "full",
          emotionalCheckScore,
          decisionToPlay: true,
          overrideUsed,
          blocksCompleted: blocks,
          sessionIntention,
        });
        clearDraft();
        ritualStartedAtRef.current = null;
        coldStopCommitRef.current = null;
        setStatus("completed");
        invalidateWarmupQueries();
      } catch {
        // mantem status atual; UI deve reportar erro
        throw new Error("Falha ao salvar ritual. Tente novamente.");
      }
    },
    [emotionalCheckScore, overrideUsed, blocksData, invalidateWarmupQueries],
  );

  const restoreDraft = useCallback((): WarmupMode | null => {
    const d = readDraft();
    if (!d || !isDraftFresh(d)) {
      clearDraft();
      return null;
    }
    ritualStartedAtRef.current = d.ritualStartedAt;
    setStatus(d.status ?? "running");
    setCurrentBlock(d.currentBlock ?? 1);
    setEmotionalCheckScore(d.emotionalCheckScore ?? null);
    setOverrideUsed(d.overrideUsed ?? false);
    setBlocksData(d.blocksData ?? {});
    if (d.mode) setMode(d.mode);
    return d.mode ?? null;
  }, []);

  // Helper estatico — le mode salvo SEM montar componente / disparar render.
  // Util para MentalPrep saber qual mode usar antes de montar Runner.
  // (chamada fora do hook eh OK porque nao usa useState)

  return {
    status,
    currentBlock,
    emotionalCheckScore,
    overrideUsed,
    gateOpen,
    blocksData,
    mode,
    start,
    submitEmotionalCheck,
    confirmOverride,
    advanceBlock,
    pause,
    resume,
    abort,
    completeRitual,
    setColdStopCommit,
    restoreDraft,
  };
}

/**
 * Le mode salvo no draft de localStorage SEM disparar render React.
 * Util para containers que precisam decidir parametros antes de montar Runner.
 */
export function readDraftMode(): WarmupMode | null {
  const d = readDraft();
  if (!d || !isDraftFresh(d)) return null;
  return d.mode ?? null;
}
