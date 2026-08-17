// Ponte entre a tela e o motor de equity (F1 / RF-01.4, ADR-246 D-F1-7).
//
// A main thread NUNCA calcula: o cliente do motor fala com o Worker, e o
// descarte de resultado velho por `runId` mora dentro dele. Aqui so ha o ciclo
// de vida do React — criar o cliente uma vez, redisparar quando a entrada muda,
// e cancelar ao desmontar.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRangeEngineClient,
  type RangeEngineClient,
  type RangeEngineClientOptions,
} from "@/lib/combo-calc/engine/client";
import type {
  EngineMode,
  EngineResult,
  SpotV2,
} from "@/lib/combo-calc/engine/types";

/** Debounce do painel principal (emenda A3): cada superficie paga o seu preco. */
const DEFAULT_DEBOUNCE_MS = 400;

export interface UseRangeEngineOptions {
  mode?: EngineMode;
  seed?: number;
  samples?: number;
  debounceMs?: number;
  /**
   * Recalculo preguicoso (emenda A4): painel que nao esta visivel nao roda. Ao
   * voltar a ser habilitado, a corrida dispara com a entrada corrente.
   */
  enabled?: boolean;
  /** Injetavel para teste; producao resolve o Worker sozinha. */
  clientOptions?: RangeEngineClientOptions;
}

export interface UseRangeEngineState {
  result: EngineResult | null;
  progress: number;
  running: boolean;
  cancel: () => void;
}

/** Um spot so vira corrida quando tem bordo e os dois lados com alguma entrada. */
function isRunnable(spot: SpotV2): boolean {
  return (
    spot.board.length >= 3 &&
    spot.board.length <= 5 &&
    spot.heroRange.length > 0 &&
    spot.villainRange.length > 0
  );
}

export function useRangeEngine(
  spot: SpotV2,
  options: UseRangeEngineOptions = {},
): UseRangeEngineState {
  const {
    mode = "exact",
    seed,
    samples,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enabled = true,
    clientOptions,
  } = options;

  const clientRef = useRef<RangeEngineClient | null>(null);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);

  // O cliente vive o componente inteiro: recria-lo por render mataria o worker a
  // cada tecla digitada.
  if (clientRef.current === null) {
    clientRef.current = createRangeEngineClient(clientOptions);
  }

  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  // A chave serializa a ENTRADA, nao a identidade do objeto: a pagina monta um
  // `spot` novo a cada render e comparar por referencia redispararia sempre.
  const spotKey = useMemo(
    () => JSON.stringify({ spot, mode, seed, samples }),
    [spot, mode, seed, samples],
  );

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (!enabled || !isRunnable(spot)) {
      setRunning(false);
      setProgress(0);
      return;
    }

    const timer = setTimeout(() => {
      setRunning(true);
      setProgress(0);
      client.run(
        { spot, mode, seed, samples },
        {
          onProgress: (percent) => setProgress(percent / 100),
          onResult: (next) => {
            setResult(next);
            setProgress(1);
            setRunning(false);
          },
          onError: (message) => {
            // Licao #9: dizer o que houve antes de degradar. Sem isto, a tela so
            // para de atualizar e ninguem sabe por que.
            console.error("[range-lab] motor falhou:", message);
            setRunning(false);
          },
        },
      );
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      client.cancel();
    };
    // `spotKey` cobre `spot`/`mode`/`seed`/`samples`; incluir o objeto `spot` aqui
    // faria o efeito rodar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotKey, enabled, debounceMs]);

  return {
    result,
    progress,
    running,
    cancel: () => {
      clientRef.current?.cancel();
      setRunning(false);
    },
  };
}
