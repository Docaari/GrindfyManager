import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InputField } from "@/components/InputField";
import { MentalSlider } from "@/components/MentalSlider";
import { TextareaField } from "@/components/TextareaField";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useGrindCurrency } from "@/hooks/useGrindCurrency";
import { formatCurrency } from "@/lib/format";

interface RegisterSessionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  registerSessionForm: any;
  onRegisterSession: (formData: any) => void;
}

interface WalletItem {
  id: string;
  name: string;
  platform?: string | null;
  nativeCurrency: string;
  balanceNative: number;
  status: string;
}

interface WalletEntryState {
  finalBalanceText: string;
  didNotPlay: boolean;
}

function asNumber(v: string): number | null {
  if (v === '' || v === '-' || v === '.') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function RegisterSessionDialog({
  isOpen,
  onOpenChange,
  registerSessionForm,
  onRegisterSession,
}: RegisterSessionDialogProps) {
  const grindFx = useGrindCurrency();

  const { data: walletsResp } = useQuery<{ wallets: any[] } | undefined>({
    queryKey: ['/api/wallets'],
    queryFn: async () => {
      try {
        return await apiRequest('GET', '/api/wallets');
      } catch {
        return undefined;
      }
    },
    enabled: isOpen,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const wallets: WalletItem[] = useMemo(() => {
    const list = Array.isArray(walletsResp?.wallets) ? walletsResp!.wallets : [];
    return list
      .filter((w: any) => w.status === 'active')
      .map((w: any) => ({
        id: String(w.id),
        name: String(w.name ?? w.platform ?? w.id),
        platform: w.platform ?? null,
        nativeCurrency: String(w.nativeCurrency ?? w.currency ?? 'USD'),
        balanceNative: Number(w.balanceNative ?? w.balance ?? 0),
        status: String(w.status ?? 'active'),
      }));
  }, [walletsResp]);

  const [walletEntries, setWalletEntries] = useState<Record<string, WalletEntryState>>({});

  // Dep `walletIdsKey` (lista de IDs) em vez de `wallets.length` para detectar
  // troca de wallets sem mudanca de tamanho (wallet renomeada/substituida).
  const walletIdsKey = useMemo(() => wallets.map((w) => w.id).sort().join(','), [wallets]);
  useEffect(() => {
    if (!isOpen) return;
    setWalletEntries((prev) => {
      const next: Record<string, WalletEntryState> = {};
      wallets.forEach((w) => {
        next[w.id] = prev[w.id] ?? { finalBalanceText: '', didNotPlay: false };
      });
      return next;
    });
  }, [isOpen, walletIdsKey]);

  const computedProfitUsd = useMemo(() => {
    let total = 0;
    for (const w of wallets) {
      const entry = walletEntries[w.id];
      if (!entry || entry.didNotPlay) continue;
      const finalNative = asNumber(entry.finalBalanceText);
      if (finalNative === null) continue;
      const deltaNative = finalNative - w.balanceNative;
      const rate = grindFx.ratesUsdToOther[w.nativeCurrency];
      const deltaUsd =
        w.nativeCurrency === 'USD'
          ? deltaNative
          : Number.isFinite(rate) && (rate as number) > 0
            ? deltaNative / (rate as number)
            : deltaNative;
      total += deltaUsd;
    }
    return total;
  }, [walletEntries, wallets, grindFx.ratesUsdToOther]);

  // Ref para evitar stale closure (parent recria registerSessionForm a cada
  // render). Sem ref, useEffect vai usar formData.profit congelado da primeira
  // execucao.
  const formRef = useRef(registerSessionForm);
  useEffect(() => { formRef.current = registerSessionForm; });

  useEffect(() => {
    const rounded = Math.round(computedProfitUsd * 100) / 100;
    if (rounded !== formRef.current.formData.profit) {
      formRef.current.handleFieldChange('profit', rounded);
    }
  }, [computedProfitUsd]);

  // Reset wallet entries quando dialog fecha (lesson #11 — stale state).
  useEffect(() => {
    if (!isOpen) {
      setWalletEntries({});
    }
  }, [isOpen]);

  const setEntry = (walletId: string, patch: Partial<WalletEntryState>) => {
    setWalletEntries((prev) => ({
      ...prev,
      [walletId]: { ...(prev[walletId] ?? { finalBalanceText: '', didNotPlay: false }), ...patch },
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="register-session-popup bg-gray-900 border-gray-700 text-white max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-gray-700">
          <DialogTitle className="text-xl font-bold text-white">
            Registrar Sessão Passada
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Informe duração, saldos finais por carteira e métricas. O lucro é calculado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 py-4">

          <div className="register-card bg-gray-800 border border-gray-700 p-4 rounded-xl">
            <h3 className="text-base font-semibold text-white mb-3">Informações Básicas</h3>
            <div className="space-y-3">
              <InputField
                label="Data da Sessão"
                type="date"
                value={registerSessionForm.formData.date}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('date', value);
                  registerSessionForm.touchField('date');
                }}
                required
                tabIndex={1}
                hasError={registerSessionForm.hasFieldError('date')}
                isValid={registerSessionForm.isFieldValid('date')}
                isTouched={registerSessionForm.validationState.touchedFields.has('date')}
                errorMessage={registerSessionForm.getFieldError('date')}
              />
              <InputField
                label="Duração"
                type="text"
                placeholder="Ex: 4h 30min"
                value={registerSessionForm.formData.duration}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('duration', value);
                  registerSessionForm.touchField('duration');
                }}
                required
                tabIndex={2}
                hasError={registerSessionForm.hasFieldError('duration')}
                isValid={registerSessionForm.isFieldValid('duration')}
                isTouched={registerSessionForm.validationState.touchedFields.has('duration')}
                errorMessage={registerSessionForm.getFieldError('duration')}
              />
            </div>
          </div>

          <div className="register-card bg-gray-800 border border-gray-700 p-4 rounded-xl">
            <h3 className="text-base font-semibold text-white mb-3">Carteiras</h3>
            <p className="text-xs text-gray-400 mb-3">
              Saldo inicial é travado. Reporte o saldo final nas plataformas que jogou. As demais marque "Não joguei".
            </p>
            {wallets.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Nenhuma carteira ativa cadastrada.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {wallets.map((w) => {
                  const entry = walletEntries[w.id] ?? { finalBalanceText: '', didNotPlay: false };
                  return (
                    <div
                      key={w.id}
                      className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg border ${
                        entry.didNotPlay ? 'border-gray-800 bg-gray-900/50 opacity-60' : 'border-gray-700 bg-gray-900/30'
                      }`}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="text-sm font-medium text-gray-100 truncate">{w.name}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {[w.platform, w.nativeCurrency].filter(Boolean).join(' ')}
                        </div>
                      </div>
                      <div className="col-span-3 text-xs text-gray-400">
                        <div className="text-[10px] text-gray-500">Inicial</div>
                        <div className="font-mono text-gray-300">
                          {formatCurrency(w.balanceNative, w.nativeCurrency)}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="text-[10px] text-gray-500 mb-0.5">Final</div>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={entry.finalBalanceText}
                          onChange={(e) => setEntry(w.id, { finalBalanceText: e.target.value })}
                          disabled={entry.didNotPlay}
                          className="bg-gray-800 border-gray-600 text-white text-sm h-8"
                          placeholder={String(w.balanceNative.toFixed(2))}
                        />
                      </div>
                      <div className="col-span-2">
                        <button
                          type="button"
                          onClick={() => setEntry(w.id, { didNotPlay: !entry.didNotPlay, finalBalanceText: entry.didNotPlay ? entry.finalBalanceText : '' })}
                          className={`w-full text-[11px] px-2 py-1.5 rounded border transition flex items-center justify-center gap-1 ${
                            entry.didNotPlay
                              ? 'bg-gray-700 border-gray-600 text-gray-300'
                              : 'bg-transparent border-gray-600 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {entry.didNotPlay && <Check className="w-3 h-3" />}
                          Não joguei
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-400">Lucro calculado:</span>
              <span className={`text-base font-semibold ${computedProfitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {grindFx.format(computedProfitUsd)}
              </span>
            </div>
          </div>

          <div className="register-card bg-gray-800 border border-gray-700 p-4 rounded-xl">
            <h3 className="text-base font-semibold text-white mb-3">Métricas</h3>
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Volume"
                type="number"
                value={registerSessionForm.formData.volume}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('volume', Number(value) || 0);
                  registerSessionForm.touchField('volume');
                }}
                required
                tabIndex={3}
                hasError={registerSessionForm.hasFieldError('volume')}
                isValid={registerSessionForm.isFieldValid('volume')}
                isTouched={registerSessionForm.validationState.touchedFields.has('volume')}
                errorMessage={registerSessionForm.getFieldError('volume')}
              />
              <InputField
                label="ABI Médio (USD)"
                type="number"
                step="0.01"
                value={registerSessionForm.formData.abiMed}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('abiMed', Number(value) || 0);
                  registerSessionForm.touchField('abiMed');
                }}
                required
                tabIndex={4}
                hasError={registerSessionForm.hasFieldError('abiMed')}
                isValid={registerSessionForm.isFieldValid('abiMed')}
                isTouched={registerSessionForm.validationState.touchedFields.has('abiMed')}
                errorMessage={registerSessionForm.getFieldError('abiMed')}
              />
              <InputField
                label="Final Tables"
                type="number"
                value={registerSessionForm.formData.fts}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('fts', Number(value) || 0);
                  registerSessionForm.touchField('fts');
                }}
                tabIndex={5}
                hasError={registerSessionForm.hasFieldError('fts')}
                isValid={registerSessionForm.isFieldValid('fts')}
                isTouched={registerSessionForm.validationState.touchedFields.has('fts')}
                errorMessage={registerSessionForm.getFieldError('fts')}
              />
              <InputField
                label="Cravadas"
                type="number"
                value={registerSessionForm.formData.cravadas}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('cravadas', Number(value) || 0);
                  registerSessionForm.touchField('cravadas');
                }}
                tabIndex={6}
                hasError={registerSessionForm.hasFieldError('cravadas')}
                isValid={registerSessionForm.isFieldValid('cravadas')}
                isTouched={registerSessionForm.validationState.touchedFields.has('cravadas')}
                errorMessage={registerSessionForm.getFieldError('cravadas')}
              />
              <div className="relative">
                <InputField
                  label="Lucro (USD) — auto"
                  type="number"
                  step="0.01"
                  value={registerSessionForm.formData.profit}
                  onChange={() => {}}
                  tabIndex={7}
                  hasError={false}
                  isValid={true}
                  isTouched={true}
                  errorMessage=""
                />
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-bl-md font-medium">
                  AUTO
                </div>
              </div>
              <div className="relative">
                <InputField
                  label="ROI (%) — auto"
                  type="number"
                  step="0.01"
                  value={registerSessionForm.formData.roi}
                  onChange={() => {}}
                  tabIndex={8}
                  hasError={false}
                  isValid={true}
                  isTouched={true}
                  errorMessage=""
                />
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-bl-md font-medium">
                  AUTO
                </div>
              </div>
            </div>
          </div>

          <div className="register-card bg-gray-800 border border-gray-700 p-4 rounded-xl">
            <h3 className="text-base font-semibold text-white mb-3">Estado Mental</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <MentalSlider
                label="Energia"
                value={registerSessionForm.formData.energiaMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('energiaMedia', value);
                  registerSessionForm.touchField('energiaMedia');
                }}
                tabIndex={9}
              />
              <MentalSlider
                label="Foco"
                value={registerSessionForm.formData.focoMedio}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('focoMedio', value);
                  registerSessionForm.touchField('focoMedio');
                }}
                tabIndex={10}
              />
              <MentalSlider
                label="Confiança"
                value={registerSessionForm.formData.confiancaMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('confiancaMedia', value);
                  registerSessionForm.touchField('confiancaMedia');
                }}
                tabIndex={11}
              />
              <MentalSlider
                label="Int. Emocional"
                value={registerSessionForm.formData.inteligenciaEmocionalMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('inteligenciaEmocionalMedia', value);
                  registerSessionForm.touchField('inteligenciaEmocionalMedia');
                }}
                tabIndex={12}
              />
              <MentalSlider
                label="Interferências"
                value={registerSessionForm.formData.interferenciasMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('interferenciasMedia', value);
                  registerSessionForm.touchField('interferenciasMedia');
                }}
                tabIndex={13}
              />
            </div>
          </div>

          <div className="register-card bg-gray-800 border border-gray-700 p-4 rounded-xl lg:col-span-2">
            <h3 className="text-base font-semibold text-white mb-3">Notas e Objetivos</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TextareaField
                label="Notas de Preparação"
                value={registerSessionForm.formData.preparationNotes}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('preparationNotes', value);
                  registerSessionForm.touchField('preparationNotes');
                }}
                placeholder="Como você se preparou para esta sessão?"
                rows={2}
                tabIndex={14}
                maxLength={300}
                hasError={registerSessionForm.hasFieldError('preparationNotes')}
                isValid={registerSessionForm.isFieldValid('preparationNotes')}
                isTouched={registerSessionForm.validationState.touchedFields.has('preparationNotes')}
                errorMessage={registerSessionForm.getFieldError('preparationNotes')}
              />
              <TextareaField
                label="Notas Finais"
                value={registerSessionForm.formData.finalNotes}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('finalNotes', value);
                  registerSessionForm.touchField('finalNotes');
                }}
                placeholder="Reflexões sobre a sessão, aprendizados, etc."
                rows={2}
                tabIndex={15}
                maxLength={500}
                hasError={registerSessionForm.hasFieldError('finalNotes')}
                isValid={registerSessionForm.isFieldValid('finalNotes')}
                isTouched={registerSessionForm.validationState.touchedFields.has('finalNotes')}
                errorMessage={registerSessionForm.getFieldError('finalNotes')}
              />
              <InputField
                label="Objetivos do Dia"
                type="text"
                value={registerSessionForm.formData.dailyGoals}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('dailyGoals', value);
                  registerSessionForm.touchField('dailyGoals');
                }}
                placeholder="Quais eram seus objetivos?"
                required
                tabIndex={16}
                hasError={registerSessionForm.hasFieldError('dailyGoals')}
                isValid={registerSessionForm.isFieldValid('dailyGoals')}
                isTouched={registerSessionForm.validationState.touchedFields.has('dailyGoals')}
                errorMessage={registerSessionForm.getFieldError('dailyGoals')}
              />
              <div className="flex items-center space-x-3 self-end pb-2">
                <input
                  type="checkbox"
                  id="objective-completed"
                  checked={registerSessionForm.formData.objectiveCompleted}
                  onChange={(e) => {
                    registerSessionForm.handleFieldChange('objectiveCompleted', e.target.checked);
                    registerSessionForm.touchField('objectiveCompleted');
                  }}
                  className="w-4 h-4 text-emerald-500 bg-gray-700 border-gray-600 rounded focus:ring-emerald-500 focus:ring-2"
                  tabIndex={17}
                />
                <Label htmlFor="objective-completed" className="text-gray-300 font-medium cursor-pointer">
                  Objetivo do dia foi cumprido
                </Label>
              </div>
            </div>
          </div>
        </div>

        <div className="register-footer flex justify-between items-center pt-4 border-t border-gray-700">
          <Button
            variant="outline"
            onClick={() => registerSessionForm.resetMentalValues()}
            className="border-yellow-600 hover:bg-yellow-700/20 text-yellow-400 px-3 py-1.5 text-sm"
          >
            Resetar Mental
          </Button>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                registerSessionForm.resetForm();
                onOpenChange(false);
              }}
              className="border-gray-600 hover:bg-gray-700 text-white px-5"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => registerSessionForm.handleSubmit(onRegisterSession)}
              disabled={registerSessionForm.isSubmitting || !registerSessionForm.isValid}
              className={`px-5 font-medium transition ${
                registerSessionForm.isValid
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-gray-600 cursor-not-allowed text-gray-300'
              }`}
            >
              {registerSessionForm.isSubmitting ? 'Registrando...' : 'Registrar Sessão'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
