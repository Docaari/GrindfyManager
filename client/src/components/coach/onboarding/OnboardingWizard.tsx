// =============================================================================
// OnboardingWizard — Sprint AI-1A / RF-07 (ADR-153)
//
// Wizard guiado (toque conversacional) com 2 modos:
//   - full  (6 steps): perfil de jogador / status do import / deteccao de nivel /
//                       metas / foco do mes / tom + nudges.
//   - light (3 steps): tom / 1 meta / foco do mes.
//
// Persistencia incremental: avancar -> PATCH /api/coach/onboarding (campos do step).
// Ultimo step -> POST /api/coach/onboarding/complete.
// Retoma do draft.step.
//
// Lessons: #1 (hooks antes de qualquer return), #2 (data-testid estaveis),
//          #13 (apiRequest retorna JSON parseado).
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type Mode = 'full' | 'light';

interface OnboardingDraft {
  step: number;
  mode: Mode;
  startedAt: string;
}

interface OnboardingWizardProps {
  mode?: Mode;
  initialStep?: number;
  draft?: OnboardingDraft | null;
  onCompleted?: () => void;
}

const TOM_OPTIONS: Array<{ value: 'gentle' | 'balanced' | 'direct'; label: string }> = [
  { value: 'gentle', label: 'Gentil' },
  { value: 'balanced', label: 'Equilibrado' },
  { value: 'direct', label: 'Direto' },
];

const PERFIL_OPTIONS: Array<{ value: 'recreativo_serio' | 'semi_pro' | 'pro'; label: string }> = [
  { value: 'recreativo_serio', label: 'Recreativo serio' },
  { value: 'semi_pro', label: 'Semi-pro' },
  { value: 'pro', label: 'Pro' },
];

const REDES_OPTIONS = [
  'WPN/ACR', 'GGPoker', 'Suprema/PokerStars', 'PartyPoker', '888poker', 'CoinPoker', 'Outra',
];

const NUDGE_OPTIONS: Array<{ key: string; label: string; def: boolean }> = [
  { key: 'bSnapshot', label: 'Lembrete de snapshot', def: true },
  { key: 'bLeak', label: 'Avisos de leak', def: true },
  { key: 'bStudy', label: 'Lembrete de estudo', def: true },
  { key: 'bVolume', label: 'Acompanhamento de volume', def: true },
  { key: 'bGrade', label: 'Sugestoes de grade', def: true },
  { key: 'bDownswing', label: 'Alerta de downswing', def: true },
  { key: 'bLife', label: 'Vida fora do poker', def: false },
  { key: 'bMental', label: 'Cuidado mental', def: false },
];

const FULL_HEADERS = [
  'Pra te ajudar de verdade preciso te conhecer — bora?',
  'Vamos olhar pro seu historico.',
  'Pelos seus dados, qual o seu nivel?',
  'O que voce quer dos proximos 3 meses?',
  'Tem algum leak que voce ja sabe que precisa trabalhar?',
  'Como voce quer que eu te cobre?',
];

const LIGHT_HEADERS = [
  'Vi que ja temos historico aqui — deixa eu me apresentar direito. Rapidinho.',
  'Tem 1 meta pra esse mes?',
  'Qual o foco do mes?',
];

function clampStr(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** Texto livre de ate 3 metas -> payload `metas` (descarta vazias, clampa a 200). */
function metasPayloadFromTexts(metasTexto: string[]): Array<{ texto: string }> {
  return metasTexto
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((t) => ({ texto: clampStr(t, 200) }));
}

export function OnboardingWizard(props: OnboardingWizardProps): JSX.Element {
  const { toast } = useToast();
  const mode: Mode = props.mode ?? props.draft?.mode ?? 'full';
  const totalSteps = mode === 'light' ? 3 : 6;
  const startStep = props.initialStep ?? props.draft?.step ?? 1;

  const [step, setStep] = useState<number>(Math.min(Math.max(1, startStep), totalSteps));
  const [submitting, setSubmitting] = useState(false);

  // form state
  const [perfilDeclarado, setPerfilDeclarado] = useState<string | null>(null);
  const [stakesTipico, setStakesTipico] = useState('');
  const [volumeTipicoMes, setVolumeTipicoMes] = useState<string>('');
  const [redesPrincipais, setRedesPrincipais] = useState<string[]>([]);
  const [nivelConfirmado, setNivelConfirmado] = useState<boolean>(false);
  const [nivel, setNivel] = useState<string | null>(null);
  const [metasTexto, setMetasTexto] = useState<string[]>(['', '', '']);
  const [focoDoMes, setFocoDoMes] = useState('');
  const [tomPreferido, setTomPreferido] = useState<'gentle' | 'balanced' | 'direct'>('balanced');
  const [nudges, setNudges] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NUDGE_OPTIONS.map((n) => [n.key, n.def])),
  );
  const [quietStart, setQuietStart] = useState<number>(21);
  const [quietEnd, setQuietEnd] = useState<number>(9);

  useEffect(() => {
    // se o draft mudar (carregamento tardio), retoma.
    if (props.draft && typeof props.draft.step === 'number' && props.initialStep === undefined) {
      setStep(Math.min(Math.max(1, props.draft.step), totalSteps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.draft]);

  const patchStep = useCallback(
    async (extra: Record<string, any>, nextStep: number) => {
      const body: Record<string, any> = { ...extra, step: nextStep, mode };
      try {
        await apiRequest('PATCH', '/api/coach/onboarding', body);
      } catch (err: any) {
        toast({ title: 'Nao consegui salvar o progresso', variant: 'destructive' });
      }
    },
    [mode, toast],
  );

  const collectStepData = useCallback(
    (currentStep: number): Record<string, any> => {
      if (mode === 'light') {
        if (currentStep === 1) return { tomPreferido };
        if (currentStep === 2) {
          const m = metasTexto[0]?.trim();
          return m ? { metas: [{ texto: clampStr(m, 200) }] } : {};
        }
        if (currentStep === 3) {
          return focoDoMes.trim() ? { focoDoMes: clampStr(focoDoMes.trim(), 200) } : {};
        }
        return {};
      }
      // full
      if (currentStep === 1) {
        const out: Record<string, any> = {};
        if (perfilDeclarado) out.perfilDeclarado = perfilDeclarado;
        if (stakesTipico.trim()) out.stakesTipico = stakesTipico.trim();
        const v = Number(volumeTipicoMes);
        if (Number.isFinite(v) && v > 0) out.volumeTipicoMes = Math.floor(v);
        if (redesPrincipais.length > 0) out.redesPrincipais = redesPrincipais;
        return out;
      }
      if (currentStep === 2) return {};
      if (currentStep === 3) {
        const out: Record<string, any> = { nivelConfirmado };
        if (nivel) out.nivel = nivel;
        return out;
      }
      if (currentStep === 4) {
        const metas = metasPayloadFromTexts(metasTexto);
        return metas.length > 0 ? { metas } : {};
      }
      if (currentStep === 5) {
        return focoDoMes.trim() ? { focoDoMes: clampStr(focoDoMes.trim(), 200) } : {};
      }
      if (currentStep === 6) return { tomPreferido };
      return {};
    },
    [mode, tomPreferido, metasTexto, focoDoMes, perfilDeclarado, stakesTipico, volumeTipicoMes, redesPrincipais, nivel, nivelConfirmado],
  );

  const handleNext = useCallback(async () => {
    const next = Math.min(step + 1, totalSteps);
    const data = collectStepData(step);
    await patchStep(data, next);
    setStep(next);
  }, [step, totalSteps, collectStepData, patchStep]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const handleComplete = useCallback(async () => {
    setSubmitting(true);
    const metas = metasPayloadFromTexts(metasTexto);
    const body: Record<string, any> = {
      tomPreferido,
    };
    if (metas.length > 0) body.metas = metas;
    if (focoDoMes.trim()) body.focoDoMes = clampStr(focoDoMes.trim(), 200);
    if (mode === 'full') {
      if (perfilDeclarado) body.perfilDeclarado = perfilDeclarado;
      if (stakesTipico.trim()) body.stakesTipico = stakesTipico.trim();
      const v = Number(volumeTipicoMes);
      if (Number.isFinite(v) && v > 0) body.volumeTipicoMes = Math.floor(v);
      if (redesPrincipais.length > 0) body.redesPrincipais = redesPrincipais;
      if (nivel) body.nivel = nivel;
      body.nivelConfirmado = nivelConfirmado;
      body.nudges = { ...nudges };
      body.quietHours = { startHour: quietStart, endHour: quietEnd };
    }
    try {
      await apiRequest('POST', '/api/coach/onboarding/complete', body);
      toast({ title: 'Perfil configurado!' });
      props.onCompleted?.();
    } catch (err: any) {
      toast({ title: 'Nao consegui finalizar', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [mode, tomPreferido, metasTexto, focoDoMes, perfilDeclarado, stakesTipico, volumeTipicoMes, redesPrincipais, nivel, nivelConfirmado, nudges, quietStart, quietEnd, toast, props]);

  const headers = mode === 'light' ? LIGHT_HEADERS : FULL_HEADERS;
  const isLast = step === totalSteps;

  const toggleRede = (r: string) => {
    setRedesPrincipais((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const renderTomField = () => (
    <div data-testid="onboarding-field-tomPreferido" className="flex flex-wrap gap-2">
      {TOM_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          data-testid={`onboarding-tom-${o.value}`}
          onClick={() => setTomPreferido(o.value)}
          className={`px-3 py-1 rounded border text-sm ${tomPreferido === o.value ? 'bg-green-600/20 border-green-500 text-green-300' : 'border-gray-700 text-gray-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const renderFocoField = () => (
    <input
      data-testid="onboarding-field-focoDoMes"
      type="text"
      value={focoDoMes}
      onChange={(e) => setFocoDoMes(e.target.value)}
      maxLength={200}
      placeholder="ex: defesa de 3bet"
      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
    />
  );

  const renderMetaField = (idx: number) => (
    <textarea
      data-testid={`onboarding-field-meta-${idx}`}
      value={metasTexto[idx]}
      onChange={(e) => setMetasTexto((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
      maxLength={200}
      rows={2}
      placeholder="meta SMART (opcional)"
      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
    />
  );

  const renderStepBody = () => {
    if (mode === 'light') {
      if (step === 1) return renderTomField();
      if (step === 2) return renderMetaField(0);
      if (step === 3) return renderFocoField();
      return null;
    }
    // full
    if (step === 1) {
      return (
        <div className="space-y-3">
          <div data-testid="onboarding-field-perfilDeclarado" className="flex flex-wrap gap-2">
            {PERFIL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`onboarding-perfil-${o.value}`}
                onClick={() => setPerfilDeclarado(o.value)}
                className={`px-3 py-1 rounded border text-sm ${perfilDeclarado === o.value ? 'bg-green-600/20 border-green-500 text-green-300' : 'border-gray-700 text-gray-400'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <input
            data-testid="onboarding-field-stakesTipico"
            type="text"
            value={stakesTipico}
            onChange={(e) => setStakesTipico(e.target.value)}
            maxLength={50}
            placeholder="stakes tipico (ex: $5-$22 ABI)"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
          />
          <input
            data-testid="onboarding-field-volumeTipicoMes"
            type="number"
            min={0}
            value={volumeTipicoMes}
            onChange={(e) => setVolumeTipicoMes(e.target.value)}
            placeholder="torneios/mes"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
          />
          <div data-testid="onboarding-field-redesPrincipais" className="flex flex-wrap gap-2">
            {REDES_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`onboarding-rede-${r}`}
                onClick={() => toggleRede(r)}
                className={`px-2 py-1 rounded border text-xs ${redesPrincipais.includes(r) ? 'bg-green-600/20 border-green-500 text-green-300' : 'border-gray-700 text-gray-400'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (step === 2) {
      return <p className="text-sm text-gray-400">Se voce ja importou seu historico, posso usar isso. Se nao, voce pode importar depois — nao bloqueia nada.</p>;
    }
    if (step === 3) {
      return (
        <div data-testid="onboarding-field-nivel" className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              data-testid="onboarding-nivel-confirmar"
              checked={nivelConfirmado}
              onChange={(e) => setNivelConfirmado(e.target.checked)}
            />
            Confere
          </label>
          <select
            data-testid="onboarding-nivel-select"
            value={nivel ?? ''}
            onChange={(e) => setNivel(e.target.value || null)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
          >
            <option value="">prefiro nao dizer</option>
            <option value="iniciando">comecando a jornada</option>
            <option value="micro_ascensao">micro grinder em ascensao</option>
            <option value="mid_consistente">mid-stakes consistente</option>
            <option value="high_stakes">high-stakes</option>
            <option value="recreativo_serio">recreativo serio</option>
          </select>
        </div>
      );
    }
    if (step === 4) {
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>{renderMetaField(i)}</React.Fragment>
          ))}
        </div>
      );
    }
    if (step === 5) return renderFocoField();
    if (step === 6) {
      return (
        <div className="space-y-4">
          {renderTomField()}
          <div data-testid="onboarding-field-nudges" className="space-y-1">
            {NUDGE_OPTIONS.map((n) => (
              <label key={n.key} className="flex items-center justify-between text-sm text-gray-300">
                <span>{n.label}</span>
                <input
                  type="checkbox"
                  data-testid={`onboarding-nudge-${n.key}`}
                  checked={nudges[n.key]}
                  onChange={(e) => setNudges((prev) => ({ ...prev, [n.key]: e.target.checked }))}
                />
              </label>
            ))}
          </div>
          <div data-testid="onboarding-field-quietHours" className="flex items-center gap-2 text-sm text-gray-300">
            <span>Horario silencioso:</span>
            <input type="number" min={0} max={23} value={quietStart} onChange={(e) => setQuietStart(Number(e.target.value))} className="w-14 bg-gray-800 border border-gray-700 rounded px-1 text-gray-100" />
            <span>ate</span>
            <input type="number" min={0} max={23} value={quietEnd} onChange={(e) => setQuietEnd(Number(e.target.value))} className="w-14 bg-gray-800 border border-gray-700 rounded px-1 text-gray-100" />
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div data-testid="onboarding-wizard" className="max-w-xl mx-auto p-4 space-y-4">
      <div data-testid="onboarding-step-indicator" className="text-xs text-gray-500">
        passo {step} de {totalSteps}
      </div>
      <h2 className="text-lg font-medium text-gray-100">{headers[step - 1] ?? ''}</h2>
      <div data-testid={`onboarding-step-${step}`} className="space-y-3">
        {renderStepBody()}
      </div>
      <div className="flex items-center gap-2 pt-2">
        {step > 1 && (
          <button
            type="button"
            data-testid="onboarding-back"
            onClick={handleBack}
            className="px-3 py-1 rounded border border-gray-700 text-gray-400 text-sm"
          >
            Voltar
          </button>
        )}
        {!isLast && (
          <button
            type="button"
            data-testid="onboarding-next"
            onClick={handleNext}
            className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
          >
            Avancar
          </button>
        )}
        {isLast && (
          <button
            type="button"
            data-testid="onboarding-complete"
            onClick={handleComplete}
            disabled={submitting}
            className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
          >
            {submitting ? 'Salvando...' : 'Concluir'}
          </button>
        )}
      </div>
    </div>
  );
}

export default OnboardingWizard;
