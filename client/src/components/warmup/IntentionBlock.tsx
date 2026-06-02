/**
 * IntentionBlock — Sprint W-1 (RF-09) — Reform 2026-05-05.
 *
 * 3 textareas OPCIONAIS. Botao Proximo sempre habilitado. Campos vazios viram null.
 *
 * Fase D #5 (ADR-235 D-6): controle de cold-commit do stop-loss (bloco 4).
 *   - Sugestão BI (3/4/5 × abiUsd) quando abiUsd > 0 (DEC-4 degrade caso contrário).
 *   - Campo USD livre comitável (basis 'manual' ao sobrescrever).
 *   - Texto conceitual desperation (RF-05).
 *   - abiUsd já vem em USD (FX resolvido no caller — lesson #6).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { suggestColdStopLossUsd } from "@shared/stops/suggestColdStopLossUsd";

export interface SessionIntentionPayload {
  focus: string;
  tiltPlan: string;
  stopCriteria: string;
}

export interface ColdStopCommitPayload {
  committedUsd: number;
  basis: "bi" | "manual";
  nBI?: 3 | 4 | 5;
  abiUsdAtCommit?: number;
}

export interface IntentionBlockProps {
  onSubmit: (intention: SessionIntentionPayload | null) => void;
  ctaLabel?: string;
  /** ABI já resolvido p/ USD pelo caller (lesson #6); null/<=0/ausente -> esconde sugestão BI. */
  abiUsd?: number | null;
  /** Chamado ao comitar o stop a frio. */
  onCommitColdStop?: (payload: ColdStopCommitPayload) => void;
}

const BI_OPTIONS: Array<3 | 4 | 5> = [3, 4, 5];

export function IntentionBlock({
  onSubmit,
  ctaLabel = "Proximo",
  abiUsd,
  onCommitColdStop,
}: IntentionBlockProps) {
  const [focus, setFocus] = useState<string>("");
  const [tiltPlan, setTiltPlan] = useState<string>("");
  const [stopCriteria, setStopCriteria] = useState<string>("");

  // Cold-commit state.
  const [nBI, setNBI] = useState<3 | 4 | 5>(3);
  // basis 'manual' quando o jogador sobrescreve o campo USD livre.
  const [manualEdited, setManualEdited] = useState<boolean>(false);

  const hasAbi = typeof abiUsd === "number" && Number.isFinite(abiUsd) && abiUsd > 0;
  const suggestion = hasAbi ? suggestColdStopLossUsd(nBI, abiUsd as number) : null;

  // Valor exibido no input: manual (digitado) tem precedência; senão a sugestão BI.
  const [manualValue, setManualValue] = useState<string>("");
  const inputValue = manualEdited
    ? manualValue
    : suggestion
    ? String(suggestion.suggestedUsd)
    : "";

  const handleSubmit = () => {
    const f = focus.trim();
    const t = tiltPlan.trim();
    const s = stopCriteria.trim();
    if (!f && !t && !s) {
      onSubmit(null);
      return;
    }
    onSubmit({ focus: f, tiltPlan: t, stopCriteria: s });
  };

  const handleSelectBI = (value: 3 | 4 | 5) => {
    setNBI(value);
    setManualEdited(false);
  };

  const handleInputChange = (raw: string) => {
    setManualValue(raw);
    setManualEdited(true);
  };

  const handleCommit = () => {
    if (!onCommitColdStop) return;
    const usd = Number(inputValue);
    if (!Number.isFinite(usd) || usd <= 0) return;
    if (manualEdited || !suggestion) {
      onCommitColdStop({ committedUsd: usd, basis: "manual" });
    } else {
      onCommitColdStop({
        committedUsd: suggestion.suggestedUsd,
        basis: "bi",
        nBI,
        abiUsdAtCommit: abiUsd as number,
      });
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Intencao da sessao</h2>
        <p className="text-sm text-muted-foreground">
          Opcional. Fixa intencao, prepara resposta a tilt, define criterio de encerramento.
        </p>
      </header>

      <div className="space-y-2">
        <label htmlFor="intention-focus" className="block text-sm font-medium">
          Foco desta sessao
        </label>
        <textarea
          id="intention-focus"
          data-testid="intention-focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ex: 'Defender BB vs BTN open 25bb seguindo a range estudada'"
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="intention-tilt-plan" className="block text-sm font-medium">
          Se sentir tilt, vou
        </label>
        <textarea
          id="intention-tilt-plan"
          data-testid="intention-tilt-plan"
          value={tiltPlan}
          onChange={(e) => setTiltPlan(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ex: '5 respiracoes 4-4-4-4 + reler a intencao'"
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="intention-stop-criteria"
          className="block text-sm font-medium"
        >
          Vou encerrar quando
        </label>
        <textarea
          id="intention-stop-criteria"
          data-testid="intention-stop-criteria"
          value={stopCriteria}
          onChange={(e) => setStopCriteria(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ex: 'Stop-loss: -3 buy-ins do dia OU 4h de sessao'"
          className="w-full rounded-md border px-3 py-2 text-sm bg-background"
        />
      </div>

      {/* Fase D #5 — Cold-commit do stop-loss */}
      <div className="space-y-3 rounded-md border border-dashed p-4">
        <div>
          <h3 className="text-sm font-semibold">Stop-loss do dia (a frio)</h3>
          <p data-testid="cold-stop-concept" className="text-xs text-muted-foreground">
            Stop a frio é o seu antídoto ao desespero de recuperar o dia. Decida agora, em
            estado racional, e respeite enquanto joga.
          </p>
        </div>

        {hasAbi && (
          <div data-testid="cold-stop-suggest-bi" className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sugestão:</span>
            {BI_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                data-testid={`cold-stop-bi-${opt}`}
                onClick={() => handleSelectBI(opt)}
                className={
                  "rounded-md border px-2 py-1 text-xs " +
                  (nBI === opt && !manualEdited
                    ? "bg-primary text-primary-foreground"
                    : "bg-background")
                }
              >
                {opt} BI
              </button>
            ))}
            {suggestion && (
              <span className="text-xs text-muted-foreground">
                ≈ ${suggestion.suggestedUsd}
              </span>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="cold-stop-input" className="block text-xs font-medium">
            Stop-loss (USD)
          </label>
          <input
            id="cold-stop-input"
            data-testid="cold-stop-input"
            type="number"
            min={0}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
        </div>

        <Button
          type="button"
          data-testid="cold-stop-commit"
          variant="secondary"
          onClick={handleCommit}
          className="w-full"
        >
          Comitar stop a frio
        </Button>
      </div>

      <div className="flex justify-center pt-2">
        <Button
          type="button"
          data-testid="intention-submit"
          onClick={handleSubmit}
          className="min-w-[220px]"
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
