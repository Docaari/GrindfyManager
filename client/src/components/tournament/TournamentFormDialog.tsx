// =============================================================================
// Sprint tournament-dialog-unification — Modal UNICO de torneio.
//
// Este e o unico dialog de criacao/edicao de torneio do app. O visual e o
// mesmo que ja rodava no /coach (DayCreateTournamentDialog): header com titulo
// + X, corpo com Nome / Plataforma (combobox) / Buy-in / Horario / Tipo /
// Velocidade / Registro (Alerta/Max Late) / Garantido, rodape Cancelar + Salvar.
//
// Edicao mostra o MESMO corpo da criacao, so que ja preenchido. Os grupos
// opcionais abaixo existem para contextos especificos e ficam desligados por
// default; o valor de um campo escondido continua hidratado no state e volta
// intacto no submit (esconder nao apaga).
//
// Tudo que precisa de modal de torneio consome ESTE componente:
//   - grade (planned_tournaments): DayCreateTournamentDialog / DayEditTournamentDialog
//   - grind ao vivo (session_tournaments): AddTournamentDialog
//   - biblioteca (tournament_library): BibliotecaPanel
//
// Os pontos onde os contextos divergem entram por prop, nao por fork:
//   - `advanced`   -> secao "Mais opcoes" (add-on / re-entry, ADR-014)
//   - `extraSlot`  -> render-prop para conteudo especifico (sugestoes do
//                     grind-live, checkbox "sincronizar com a Grade", etc.)
//   - `testIdPrefix` -> mantem os testids historicos (day-zoom-create-*,
//                     day-zoom-edit-*) sem duplicar markup.
// =============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { TOURNAMENT_PRIMARY_TYPES, getTypeLabel } from "@shared/tournamentTypes";
import { detectAddonReaFromName } from "@shared/addon-rea-detector";
import { getCurrencyForSite } from "@shared/platform-currency";
import {
  useTournamentDialogForm,
  type TournamentFormState,
} from "./useTournamentDialogForm";

/** Plataformas sugeridas quando o contexto nao informa `knownSites`. */
export const COMMON_SITES = [
  "PokerStars",
  "GGPoker",
  "WPN",
  "PartyPoker",
  "888poker",
  "Bodog",
  "CoinPoker",
  "Chico",
  "iPoker",
  "WPT Global",
];

/** SSoT dos tipos primarios (ADR-031) — nao manter lista paralela aqui. */
const TYPE_OPTIONS = [...TOURNAMENT_PRIMARY_TYPES];
const SPEED_OPTIONS = ["Normal", "Turbo", "Hyper"];

export interface TournamentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titulo do header. Ex: "Criar torneio — Quinta (Perfil B)". */
  title: string;
  mode?: "create" | "edit";
  /** Valores iniciais aplicados na (re)abertura — ou quando `hydrateKey` muda. */
  initial?: Partial<TournamentFormState>;
  /**
   * Modo controlado: o caller e dono do state do form (grind-live filtra as
   * sugestoes pelos valores digitados). Passar `values` + `onValuesChange`
   * desliga o state interno e o reset automatico.
   */
  values?: TournamentFormState;
  onValuesChange?: (next: TournamentFormState) => void;
  /**
   * Identidade do registro sendo editado. Quando muda com o dialog aberto,
   * o form re-hidrata com `initial`. Em modo create fica undefined (o reset
   * acontece a cada abertura).
   */
  hydrateKey?: string | null;
  /** Plataformas ja vistas no contexto — sobem no topo da lista. */
  knownSites?: string[];
  /** Mostra a secao colapsavel "Mais opcoes" (add-on / re-entry). */
  advanced?: boolean;
  /** Select de prioridade da grade (1 alta / 2 media / 3 baixa). */
  showPriority?: boolean;
  /** Switches dos modificadores ortogonais isFlight / isLive (ADR-031). */
  showModifiers?: boolean;
  /** Bloco Satellite — so aparece quando `type === "Satellite"`. */
  showSatellite?: boolean;
  /** Campos enriquecidos: late reg (min) + alerta (min antes). */
  showEnriched?: boolean;
  /** Conteudo read-only exibido junto dos enriquecidos (stack, mesa, etc). */
  enrichedInfo?: React.ReactNode;
  /** Erros por campo (ex: issues Zod do backend) exibidos inline. */
  fieldErrors?: Partial<Record<keyof TournamentFormState, string>>;
  /**
   * Validacao adicional do caller, somada ao `canSubmit` interno (ADR-245 §D2).
   * Default `true` — quem nao passa a prop tem o `disabled` de hoje, byte-a-byte.
   * Existe porque o state do `extraSlot` vive fora do dialog (ex.: os dias
   * marcados do lote da grade) e o dialog nao tem como enxerga-lo.
   */
  extraCanSubmit?: boolean;
  /** Nome obrigatorio para submeter (default true). */
  requireName?: boolean;
  /** Buy-in obrigatorio e > 0 para submeter (default false). */
  requireBuyIn?: boolean;
  /** Mantem o dialog aberto pos-save (grind-live adiciona varios seguidos). */
  keepOpenOnSubmit?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  /** Prefixo dos data-testid. Default "tournament-form". */
  testIdPrefix?: string;
  /** Estado de pendencia controlado por fora (mutation do caller). */
  submitting?: boolean;
  /** Mensagem de erro controlada por fora. */
  errorMessage?: string | null;
  /** Chamado quando o dialog abre (telemetria do caller). */
  onOpened?: () => void;
  /** Conteudo extra renderizado antes do rodape. Recebe o form vivo. */
  extraSlot?: (ctx: {
    values: TournamentFormState;
    patch: (diff: Partial<TournamentFormState>) => void;
  }) => React.ReactNode;
  /**
   * Persistencia. Recebe o snapshot do form; lancar erro mantem o dialog
   * aberto e mostra a mensagem padrao de falha.
   */
  onSubmit: (values: TournamentFormState) => void | Promise<void>;
}

export function TournamentFormDialog(
  props: TournamentFormDialogProps,
): React.ReactElement | null {
  const {
    open,
    onOpenChange,
    title,
    mode = "create",
    initial,
    values: valuesProp,
    onValuesChange,
    hydrateKey,
    knownSites = [],
    advanced = false,
    showPriority = false,
    showModifiers = false,
    showSatellite = false,
    showEnriched = false,
    enrichedInfo,
    fieldErrors,
    extraCanSubmit = true,
    requireName = true,
    requireBuyIn = false,
    keepOpenOnSubmit = false,
    submitLabel = "Salvar",
    submittingLabel = "Salvando...",
    testIdPrefix = "tournament-form",
    submitting: submittingProp,
    errorMessage,
    onOpened,
    extraSlot,
    onSubmit,
  } = props;

  const {
    state: internalValues,
    patch: internalPatch,
    reset,
  } = useTournamentDialogForm(initial);

  const controlled = valuesProp != null && onValuesChange != null;
  const values = controlled ? (valuesProp as TournamentFormState) : internalValues;
  const patch = React.useCallback(
    (diff: Partial<TournamentFormState>) => {
      if (controlled) {
        onValuesChange?.({ ...(valuesProp as TournamentFormState), ...diff });
      } else {
        internalPatch(diff);
      }
    },
    [controlled, onValuesChange, valuesProp, internalPatch],
  );

  const {
    name,
    site,
    buyIn,
    time,
    maxLate,
    guaranteed,
    type,
    speed,
    allowsAddOn,
    allowsReentry,
  } = values;

  const [submittingLocal, setSubmittingLocal] = React.useState(false);
  const [errorLocal, setErrorLocal] = React.useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const openedRef = React.useRef(false);
  const hydratedKeyRef = React.useRef<string | null>(null);

  const submittingFlag = submittingProp ?? submittingLocal;
  const error = errorMessage ?? errorLocal;

  // `initial` costuma ser um objeto literal inline; guardar em ref evita
  // re-hidratar o form a cada render do caller.
  const initialRef = React.useRef(initial);
  initialRef.current = initial;

  // (Re)hidratacao: no create, a cada abertura; no edit, tambem quando o
  // registro alvo (hydrateKey) muda com o dialog aberto.
  React.useEffect(() => {
    if (!open) {
      openedRef.current = false;
      hydratedKeyRef.current = null;
      return;
    }
    const keyChanged =
      hydrateKey !== undefined && hydratedKeyRef.current !== (hydrateKey ?? null);
    if (!openedRef.current || keyChanged) {
      openedRef.current = true;
      hydratedKeyRef.current = hydrateKey ?? null;
      // No modo controlado quem reseta e o caller (o state vive fora).
      if (!controlled) reset(initialRef.current);
      setErrorLocal(null);
      setShowAdvanced(false);
      onOpened?.();
    }
    // onOpened intencionalmente fora das deps — callers passam closure inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hydrateKey, reset, controlled]);

  // ---------------------------------------------------------------------
  // Combobox de plataforma (texto livre + lista). O <datalist> nativo nao
  // mostrava as opcoes de forma confiavel.
  // ---------------------------------------------------------------------
  const sitesForList = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...knownSites, ...COMMON_SITES]) {
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }, [knownSites]);

  const [siteOpen, setSiteOpen] = React.useState(false);
  const siteBoxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!siteOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (siteBoxRef.current && !siteBoxRef.current.contains(e.target as Node)) {
        setSiteOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [siteOpen]);

  const siteSuggestions = React.useMemo(() => {
    const q = site.trim().toLowerCase();
    if (!q) return sitesForList;
    return sitesForList.filter((s) => s.toLowerCase().includes(q));
  }, [site, sitesForList]);

  // ---------------------------------------------------------------------
  // Validacao + submit
  // ---------------------------------------------------------------------
  const buyInNumber = parseFloat((buyIn || "").replace(",", "."));
  const canSubmit =
    (!requireName || name.trim().length > 0) &&
    site.trim().length > 0 &&
    /^\d{2}:\d{2}$/.test(time) &&
    (!requireBuyIn || (!isNaN(buyInNumber) && buyInNumber > 0)) &&
    extraCanSubmit;

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit || submittingFlag) return;
    setSubmittingLocal(true);
    setErrorLocal(null);
    try {
      await onSubmit(values);
      if (keepOpenOnSubmit) {
        if (!controlled) reset(initialRef.current);
      } else {
        onOpenChange(false);
      }
    } catch {
      setErrorLocal("Falha ao salvar — tente novamente");
    } finally {
      setSubmittingLocal(false);
    }
  }, [
    canSubmit,
    submittingFlag,
    onSubmit,
    values,
    keepOpenOnSubmit,
    controlled,
    reset,
    onOpenChange,
  ]);

  // Add-on / ReA detectados pelo nome (mesma heuristica do parser).
  const autoDetect = React.useMemo(() => {
    if (!advanced) return { addOn: false, reentry: false };
    const src = name.trim() || `${site} ${type}`.trim();
    const d = detectAddonReaFromName(src);
    return {
      addOn: d.allowsAddOn && !allowsAddOn,
      reentry: d.allowsReentry && !allowsReentry,
    };
  }, [advanced, name, site, type, allowsAddOn, allowsReentry]);

  if (!open) return null;

  // Moeda da plataforma escolhida — o buy-in digitado esta na moeda do site
  // (o server normaliza pra USD). Rotular errado induz erro de digitacao.
  const currencyCode = site.trim()
    ? getCurrencyForSite(site).code
    : "USD";

  const errFor = (k: keyof TournamentFormState) => fieldErrors?.[k];
  const renderErr = (k: keyof TournamentFormState) => {
    const msg = errFor(k);
    if (!msg) return null;
    return (
      <p
        data-testid={`${testIdPrefix}-error-${String(k)}`}
        className="mt-1 text-[11px] text-red-400"
      >
        {msg}
      </p>
    );
  };

  const inputCls =
    "w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none";
  const labelCls = "block text-xs text-gray-400 mb-1";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70" />
        <DialogPrimitive.Content
          data-testid={`${testIdPrefix}-dialog`}
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] w-[90vw] max-w-md max-h-[92vh] overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 shadow-xl p-0"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/60 sticky top-0 z-10">
            <DialogPrimitive.Title asChild>
              <h2 className="text-base font-semibold text-white">{title}</h2>
            </DialogPrimitive.Title>
            <button
              type="button"
              data-testid={`${testIdPrefix}-dialog-close`}
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <label className={labelCls}>
                Nome {requireName ? "*" : "(opcional)"}
              </label>
              <input
                type="text"
                data-testid={`${testIdPrefix}-input-name`}
                value={name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Ex: Sunday Million"
                className={inputCls}
                autoFocus
              />
              {renderErr("name")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Plataforma *</label>
                <div ref={siteBoxRef} className="relative">
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={siteOpen}
                    aria-controls={`${testIdPrefix}-site-list`}
                    autoComplete="off"
                    data-testid={`${testIdPrefix}-input-site`}
                    value={site}
                    onChange={(e) => {
                      patch({ site: e.target.value });
                      setSiteOpen(true);
                    }}
                    onFocus={() => setSiteOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSiteOpen(false);
                    }}
                    placeholder="PokerStars"
                    className={`${inputCls} pr-7`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    data-testid={`${testIdPrefix}-site-toggle`}
                    onClick={() => setSiteOpen((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-white"
                    aria-label="Abrir lista de plataformas"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {siteOpen && siteSuggestions.length > 0 && (
                    <ul
                      id={`${testIdPrefix}-site-list`}
                      role="listbox"
                      className="absolute z-[70] mt-1 max-h-44 w-full overflow-auto rounded border border-gray-700 bg-gray-900 shadow-xl py-1"
                    >
                      {siteSuggestions.map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={s === site}
                            data-testid={`${testIdPrefix}-site-option-${s}`}
                            onMouseDown={(e) => {
                              // antes do blur do input — registra o clique.
                              e.preventDefault();
                              patch({ site: s });
                              setSiteOpen(false);
                            }}
                            className={
                              "block w-full text-left px-2 py-1.5 text-sm hover:bg-emerald-600/20 " +
                              (s === site ? "text-emerald-400" : "text-gray-200")
                            }
                          >
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {renderErr("site")}
              </div>
              <div>
                <label className={labelCls}>
                  Buy-in {currencyCode} {requireBuyIn ? "*" : ""}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid={`${testIdPrefix}-input-buyin`}
                  value={buyIn}
                  onChange={(e) => patch({ buyIn: e.target.value })}
                  placeholder="11.00"
                  className={inputCls}
                />
                {renderErr("buyIn")}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Horario *</label>
                <input
                  type="time"
                  data-testid={`${testIdPrefix}-input-time`}
                  value={time}
                  onChange={(e) => patch({ time: e.target.value })}
                  className={inputCls}
                />
                {renderErr("time")}
              </div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select
                  data-testid={`${testIdPrefix}-input-type`}
                  value={type}
                  onChange={(e) => patch({ type: e.target.value })}
                  className={inputCls}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {getTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Velocidade</label>
                <select
                  data-testid={`${testIdPrefix}-input-speed`}
                  value={speed}
                  onChange={(e) => patch({ speed: e.target.value })}
                  className={inputCls}
                >
                  {SPEED_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Registro (Alerta/Max Late)</label>
                <input
                  type="time"
                  data-testid={`${testIdPrefix}-input-maxlate`}
                  value={maxLate}
                  onChange={(e) => patch({ maxLate: e.target.value })}
                  placeholder="opcional"
                  className={`${inputCls} focus:border-amber-500`}
                />
              </div>
              <div>
                <label className={labelCls}>Garantido {currencyCode}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid={`${testIdPrefix}-input-guaranteed`}
                  value={guaranteed}
                  onChange={(e) => patch({ guaranteed: e.target.value })}
                  placeholder="0"
                  className={inputCls}
                />
                {renderErr("guaranteed")}
              </div>
            </div>

            {showPriority && (
              <div>
                <label className={labelCls}>Prioridade</label>
                <select
                  data-testid={`${testIdPrefix}-input-prioridade`}
                  value={String(values.prioridade)}
                  onChange={(e) =>
                    patch({ prioridade: Number(e.target.value) || 2 })
                  }
                  className={inputCls}
                >
                  <option value="1">Alta</option>
                  <option value="2">Media</option>
                  <option value="3">Baixa</option>
                </select>
              </div>
            )}

            {showModifiers && (
              <div className="grid grid-cols-2 gap-3 rounded border border-gray-800 p-2">
                <label className="flex items-center gap-2 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    data-testid={`${testIdPrefix}-checkbox-is-flight`}
                    checked={values.isFlight}
                    onChange={(e) => patch({ isFlight: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                  />
                  Multi-flight (Day 1A/1B...)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    data-testid={`${testIdPrefix}-checkbox-is-live`}
                    checked={values.isLive}
                    onChange={(e) => patch({ isLive: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                  />
                  Live (presencial)
                </label>
              </div>
            )}

            {showSatellite && type === "Satellite" && (
              <div className="space-y-2 rounded border border-amber-700/40 bg-amber-950/10 p-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-amber-400">
                  Satellite
                </div>
                <div>
                  <label className={labelCls}>Tipo de premio</label>
                  <select
                    data-testid={`${testIdPrefix}-input-satellite-reward`}
                    value={values.satelliteRewardType}
                    onChange={(e) =>
                      patch({ satelliteRewardType: e.target.value })
                    }
                    className={inputCls}
                  >
                    <option value="">Selecione</option>
                    <option value="ticket">Ticket</option>
                    <option value="package">Package (live)</option>
                    <option value="cash">Cash</option>
                    <option value="mixed">Mixed (ticket + cash)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>
                      Valor do ticket {currencyCode}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      data-testid={`${testIdPrefix}-input-satellite-ticket`}
                      value={values.satelliteTicketValue}
                      onChange={(e) =>
                        patch({ satelliteTicketValue: e.target.value })
                      }
                      placeholder="0.00"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Torneio alvo</label>
                    <input
                      type="text"
                      data-testid={`${testIdPrefix}-input-satellite-target`}
                      value={values.satelliteTargetName}
                      onChange={(e) =>
                        patch({ satelliteTargetName: e.target.value })
                      }
                      placeholder="Ex: Sunday Million $109"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            )}

            {showEnriched && (
              <div className="space-y-2 rounded border border-gray-800 p-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Dados enriquecidos
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Late reg (min)</label>
                    <input
                      type="number"
                      min="0"
                      max="2880"
                      data-testid={`${testIdPrefix}-input-latereg`}
                      value={values.lateRegMinutes}
                      onChange={(e) =>
                        patch({ lateRegMinutes: e.target.value })
                      }
                      placeholder="Ex: 60"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Alerta (min antes)</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      data-testid={`${testIdPrefix}-input-alert`}
                      value={values.alertMinutesBefore}
                      onChange={(e) =>
                        patch({ alertMinutesBefore: e.target.value })
                      }
                      placeholder="Default: 10min"
                      className={inputCls}
                    />
                  </div>
                </div>
                {enrichedInfo}
              </div>
            )}

            {/* Sugestao automatica de Add-on / ReA a partir do nome. */}
            {advanced && (autoDetect.addOn || autoDetect.reentry) && (
              <div
                data-testid={`${testIdPrefix}-autodetect-hint`}
                className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"
              >
                <div className="font-semibold mb-1">Detectado pelo nome:</div>
                <div className="flex flex-wrap gap-2">
                  {autoDetect.addOn && (
                    <button
                      type="button"
                      data-testid={`${testIdPrefix}-autodetect-apply-addon`}
                      onClick={() => {
                        setShowAdvanced(true);
                        patch({
                          allowsAddOn: true,
                          addOnCost:
                            values.addOnCost.trim() !== ""
                              ? values.addOnCost
                              : buyIn,
                        });
                      }}
                      className="px-2 py-0.5 rounded bg-amber-600/40 hover:bg-amber-600/60 text-amber-100"
                    >
                      Marcar Permite Add-on
                    </button>
                  )}
                  {autoDetect.reentry && (
                    <button
                      type="button"
                      data-testid={`${testIdPrefix}-autodetect-apply-reentry`}
                      onClick={() => {
                        setShowAdvanced(true);
                        patch({ allowsReentry: true });
                      }}
                      className="px-2 py-0.5 rounded bg-purple-600/40 hover:bg-purple-600/60 text-purple-100"
                    >
                      Marcar Permite Re-entry
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mais opcoes — add-on / re-entry (ADR-014). */}
            {advanced && (
              <div className="rounded border border-gray-800">
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-advanced-toggle`}
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-gray-400 hover:text-emerald-400"
                >
                  {showAdvanced ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Mais opcoes
                </button>
                {showAdvanced && (
                  <div className="space-y-2 border-t border-gray-800 p-2">
                    <label className="flex items-center gap-2 text-xs text-gray-200">
                      <input
                        type="checkbox"
                        data-testid={`${testIdPrefix}-checkbox-allows-addon`}
                        checked={allowsAddOn}
                        onChange={(e) =>
                          patch({
                            allowsAddOn: e.target.checked,
                            addOnCost:
                              e.target.checked && values.addOnCost.trim() === ""
                                ? buyIn
                                : values.addOnCost,
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                      />
                      Permite Add-on (Plus)
                    </label>
                    {allowsAddOn && (
                      <div className="pl-5">
                        <label className={labelCls}>Custo do Add-on USD</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          data-testid={`${testIdPrefix}-input-addon-cost`}
                          value={values.addOnCost}
                          onChange={(e) => patch({ addOnCost: e.target.value })}
                          placeholder={buyIn || "0"}
                          className={`${inputCls} focus:border-amber-500`}
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs text-gray-200">
                      <input
                        type="checkbox"
                        data-testid={`${testIdPrefix}-checkbox-allows-reentry`}
                        checked={allowsReentry}
                        onChange={(e) =>
                          patch({
                            allowsReentry: e.target.checked,
                            maxReentries: e.target.checked
                              ? values.maxReentries
                              : null,
                          })
                        }
                        className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                      />
                      Permite Re-entry (ReA)
                    </label>
                    {allowsReentry && (
                      <div className="pl-5">
                        <label className={labelCls}>
                          Max. re-entradas (vazio = ilimitado)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          data-testid={`${testIdPrefix}-input-max-reentries`}
                          value={values.maxReentries ?? ""}
                          onChange={(e) =>
                            patch({
                              maxReentries:
                                e.target.value === ""
                                  ? null
                                  : parseInt(e.target.value, 10),
                            })
                          }
                          placeholder="Ilimitado"
                          className={`${inputCls} focus:border-purple-500`}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {extraSlot?.({ values, patch })}

            {error && (
              <div
                data-testid={`${testIdPrefix}-error`}
                className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded px-2 py-1.5"
              >
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-800 bg-gray-900/40 sticky bottom-0">
            <button
              type="button"
              data-testid={`${testIdPrefix}-cancel`}
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid={`${testIdPrefix}-submit`}
              onClick={handleSubmit}
              disabled={!canSubmit || submittingFlag}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submittingFlag ? submittingLabel : submitLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default TournamentFormDialog;
