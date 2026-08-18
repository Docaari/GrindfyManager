import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, BellRing, Clock, Plus, X, ChevronDown, ChevronUp, RotateCcw, Volume2, Trophy } from "lucide-react";
import type { SessionAlert } from "@shared/generic-alerts";
import { speakUtterance } from "@/lib/ttsVoices";

interface AlertsPanelProps {
  activeAlerts: SessionAlert[];
  firedAlerts: SessionAlert[];
  activeCount: number;
  onCreateAlert: (label: string, mode: 'absolute' | 'relative', time?: string, minutesAhead?: number) => void;
  onDismissAlert: (id: string) => void;
  onRemoveAlert: (id: string) => void;
  onRefireAlert: (id: string) => void;
  onClearAll: () => void;
  // Sprint Alarmes 2.0 (RF-03) — TTS preview support.
  voice?: SpeechSynthesisVoice | null;
  volume?: number;
  ttsAvailable?: boolean;
  soundMode?: 'tts' | 'beep' | 'mute';
  // RF-03 wiring fix — abre TournamentAlertDialog no parent. tournamentId opcional
  // permite que TournamentCard pre-selecione torneio especifico (Sprint Alarmes 2.0).
  onOpenTournamentAlert?: (tournamentId?: string) => void;
  hasUpcomingTournaments?: boolean;
}

export default function AlertsPanel({
  activeAlerts,
  firedAlerts,
  activeCount,
  onCreateAlert,
  onDismissAlert,
  onRemoveAlert,
  onRefireAlert,
  onClearAll,
  voice = null,
  volume = 0.8,
  ttsAvailable = false,
  soundMode = 'tts',
  onOpenTournamentAlert,
  hasUpcomingTournaments = false,
}: AlertsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showFired, setShowFired] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formMode, setFormMode] = useState<'absolute' | 'relative'>('relative');
  const [formTime, setFormTime] = useState("");
  const [formMinutes, setFormMinutes] = useState("10");
  const [formError, setFormError] = useState("");
  // RF-03 / P1-10 — preview do form custom debounced 500ms.
  const [debouncedLabel, setDebouncedLabel] = useState("");

  // Debounce do label do form para habilitar preview.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLabel(formLabel.trim()), 500);
    return () => clearTimeout(t);
  }, [formLabel]);

  // P1-9 / P1-10 — flag para mostrar/esconder botoes de preview.
  const showPreviewButtons = soundMode !== 'mute' && ttsAvailable;

  // Helper: dispara preview de uma narracao.
  const handlePreview = (text: string) => {
    speakUtterance(text, voice, volume);
  };

  const handleCreateAlert = () => {
    setFormError("");

    if (!formLabel.trim()) {
      setFormError("Informe uma mensagem para o alerta");
      return;
    }
    if (formLabel.length > 80) {
      setFormError("Mensagem muito longa (max 80 caracteres)");
      return;
    }

    if (formMode === 'absolute') {
      if (!formTime) {
        setFormError("Informe o horario");
        return;
      }
      // Sem checagem de "ja passou": o grind atravessa a meia-noite e as 23h um
      // alerta para "01:00" e legitimo. O handler aplica rollover para o dia
      // seguinte, mesma regra do TournamentAlertDialog.
      onCreateAlert(formLabel.trim(), 'absolute', formTime);
    } else {
      const mins = parseInt(formMinutes);
      if (isNaN(mins) || mins < 1) {
        setFormError("Minimo de 1 minuto");
        return;
      }
      if (mins > 480) {
        setFormError("Maximo de 480 minutos (8 horas)");
        return;
      }
      onCreateAlert(formLabel.trim(), 'relative', undefined, mins);
    }

    // Reset form
    setFormLabel("");
    setFormTime("");
    setFormMinutes("10");
    setShowForm(false);
  };

  const formatCountdown = (triggerAt: Date) => {
    const now = new Date();
    const diff = triggerAt.getTime() - now.getTime();
    const minutes = Math.ceil(diff / 60000);

    if (minutes <= 0) return "agora";
    if (minutes < 60) return `em ${minutes}min`;
    const hh = String(triggerAt.getHours()).padStart(2, '0');
    const mm = String(triggerAt.getMinutes()).padStart(2, '0');
    return `as ${hh}:${mm}`;
  };

  const formatFiredTime = (triggerAt: Date) => {
    const hh = String(triggerAt.getHours()).padStart(2, '0');
    const mm = String(triggerAt.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  return (
    <Card className="bg-card border-gray-700 mb-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-800/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <CardTitle className="text-base text-white">Alertas</CardTitle>
                {activeCount > 0 && (
                  <Badge className="bg-amber-600 text-white text-xs px-2 py-0.5">
                    {activeCount}
                  </Badge>
                )}
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            {/* Action buttons */}
            <div className="flex items-center gap-2 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowForm(!showForm)}
                className="border-amber-600 text-amber-300 hover:bg-amber-600/20 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Novo Alerta
              </Button>
              {hasUpcomingTournaments && onOpenTournamentAlert && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="open-tournament-alert-btn"
                  onClick={() => onOpenTournamentAlert()}
                  className="border-amber-600 text-amber-300 hover:bg-amber-600/20 text-xs"
                >
                  <Trophy className="w-3 h-3 mr-1" />
                  Novo alerta de torneio
                </Button>
              )}
              {(activeAlerts.length > 0 || firedAlerts.length > 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Sprint D / RF-04.1 — confirm proporcional ao dano:
                    // >=3 alertas pede confirmacao; <=2 chama direto.
                    const totalAlerts = activeAlerts.length + firedAlerts.length;
                    if (totalAlerts >= 3) {
                      const ok = typeof window !== 'undefined' && window.confirm
                        ? window.confirm(`Descartar ${totalAlerts} alertas?`)
                        : true;
                      if (!ok) return;
                    }
                    onClearAll();
                  }}
                  className="text-gray-400 hover:text-red-400 text-xs"
                >
                  Limpar todos
                </Button>
              )}
            </div>

            {/* Create form */}
            {showForm && (
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 mb-3 space-y-3">
                <div>
                  <Label className="text-xs text-gray-300 mb-1 block">Mensagem</Label>
                  <Input
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="Lembrete..."
                    maxLength={80}
                    className="bg-gray-900 border-gray-600 text-white text-sm h-8"
                  />
                  <div className="text-right text-xs text-gray-500 mt-0.5">{formLabel.length}/80</div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setFormMode('relative')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                      formMode === 'relative' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Em X minutos
                  </button>
                  <button
                    onClick={() => setFormMode('absolute')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                      formMode === 'absolute' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Horario fixo
                  </button>
                </div>

                {formMode === 'relative' ? (
                  <div>
                    <Label className="text-xs text-gray-300 mb-1 block">Minutos a frente</Label>
                    <Select value={formMinutes} onValueChange={setFormMinutes}>
                      <SelectTrigger className="bg-gray-900 border-gray-600 text-white text-sm h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                          <SelectItem key={m} value={String(m)} className="text-white hover:bg-gray-700 cursor-pointer">
                            {m} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs text-gray-300 mb-1 block">Horario (HH:MM)</Label>
                    <Input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="bg-gray-900 border-gray-600 text-white text-sm h-8 w-32"
                    />
                  </div>
                )}

                {formError && (
                  <p className="text-red-400 text-xs">{formError}</p>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={handleCreateAlert}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  >
                    Criar Alerta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowForm(false); setFormError(""); }}
                    className="text-gray-400 text-xs"
                  >
                    Cancelar
                  </Button>
                  {showPreviewButtons && (
                    <button
                      type="button"
                      data-testid="preview-form-custom-btn"
                      disabled={debouncedLabel.length === 0}
                      onClick={() => handlePreview(formLabel.trim())}
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-gray-600 text-gray-200 hover:bg-gray-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Ouvir como vai soar"
                    >
                      <Volume2 className="w-3 h-3" />
                      Ouvir como vai soar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Active alerts */}
            {activeAlerts.length > 0 ? (
              <div className="space-y-1.5">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between bg-gray-800/40 border border-gray-700/50 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {alert.type === 'late-reg' ? (
                        <BellRing className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      )}
                      <span className="text-sm text-white truncate">{alert.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs text-amber-400 font-mono">
                        {formatCountdown(alert.triggerAt)}
                      </span>
                      {showPreviewButtons && (
                        <button
                          data-testid={`preview-btn-${alert.id}`}
                          onClick={() => handlePreview((alert as any).narrationText || alert.label)}
                          className="text-gray-500 hover:text-amber-400 transition-colors p-0.5"
                          aria-label="Ouvir narracao"
                          title="Ouvir como vai soar"
                          type="button"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveAlert(alert.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors p-0.5"
                        aria-label="Remover alerta"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !showForm ? (
              <p className="text-gray-500 text-sm text-center py-2">Nenhum alerta configurado</p>
            ) : null}

            {/* Fired alerts */}
            {firedAlerts.length > 0 && (
              <Collapsible open={showFired} onOpenChange={setShowFired}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1.5 mt-3 text-xs text-gray-400 hover:text-gray-300 transition-colors">
                    {showFired ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Disparados ({firedAlerts.length})
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1 mt-1.5">
                    {firedAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between bg-gray-900/40 border border-gray-800/50 rounded-lg px-3 py-2 opacity-60"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {alert.type === 'late-reg' ? (
                            <BellRing className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          )}
                          <span className="text-sm text-gray-400 truncate line-through">{alert.label}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-xs text-gray-500 font-mono">
                            Disparou as {formatFiredTime(alert.triggerAt)}
                          </span>
                          <button
                            onClick={() => onRefireAlert(alert.id)}
                            className="text-gray-500 hover:text-amber-400 transition-colors p-0.5"
                            title="Re-disparar"
                            aria-label="Re-disparar alerta"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDismissAlert(alert.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors p-0.5"
                            aria-label="Dispensar alerta"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Summary */}
            {(activeAlerts.length > 0 || firedAlerts.length > 0) && (
              <p className="text-xs text-gray-500 mt-2">
                {activeAlerts.length} pendente{activeAlerts.length !== 1 ? 's' : ''}, {firedAlerts.length} disparado{firedAlerts.length !== 1 ? 's' : ''}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
