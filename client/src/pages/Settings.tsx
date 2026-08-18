import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/contexts/SidebarContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Settings as SettingsIcon,
  DollarSign,
  Trash2,
  AlertTriangle,
  Save,
  Sidebar,
  Bell,
  Wallet,
  Volume2,
  Mic
} from "lucide-react";
import { useTTSVoices, speakUtterance } from "@/lib/ttsVoices";
import { useBankroll } from "@/hooks/useBankroll";
import { BankrollMovementDialog } from "@/components/bankroll/BankrollMovementDialog";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Settings() {
  const { toast } = useToast();
  const { autoCollapseForGrind, setAutoCollapseForGrind } = useSidebar();
  // ADR-033: convencao "unidades nativas por 1 USD" (1 USD = 7.20 CNY = 0.92 EUR).
  const [exchangeRates, setExchangeRates] = useState({ BRL: 5.00, CNY: 7.20, EUR: 0.92 });
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Alert settings
  const [lateRegAlertMinutes, setLateRegAlertMinutes] = useState(10);
  const [lateRegAlertEnabled, setLateRegAlertEnabled] = useState(true);
  const [lateRegAlertSound, setLateRegAlertSound] = useState(true);

  // RF-07/RF-08 — TTS / Voz settings (Sprint Alarmes 2.0).
  const [soundMode, setSoundMode] = useState<'tts' | 'beep' | 'mute'>('tts');
  const [preferredVoiceURI, setPreferredVoiceURI] = useState<string | null>(null);
  const [alertVolume, setAlertVolume] = useState<number>(0.8);
  const [alertRepeatCount, setAlertRepeatCount] = useState<number>(3);
  const [alertRepeatGapMs, setAlertRepeatGapMs] = useState<number>(3000);
  const [ttsRedactBuyIn, setTtsRedactBuyIn] = useState<boolean>(true);
  // Sprint B2 (M2): toggle gestao multi-wallet. Estado derivado do server +
  // optimistic update via mutation. Evita race condition de useState default.
  const [optimisticBankrollManagement, setOptimisticBankrollManagement] = useState<
    boolean | null
  >(null);
  // ADR-244 (RF-01): toggle do ajuste manual do resultado final da sessao.
  // Mesmo padrao do bankrollManagementEnabled (estado otimista + PUT parcial).
  const [optimisticManualSessionResult, setOptimisticManualSessionResult] = useState<
    boolean | null
  >(null);

  // Hook de vozes pt-BR (Chrome async via voiceschanged).
  const { voices, available: ttsAvailable, preferredVoice } = useTTSVoices(preferredVoiceURI);

  // Bankroll (RF-06) — estado local do form
  const { data: bankroll } = useBankroll();
  const [bankrollAmount, setBankrollAmount] = useState<string>("");
  const [bankrollRulePreset, setBankrollRulePreset] = useState<string>("1pct");
  const [bankrollCustomPct, setBankrollCustomPct] = useState<string>("");
  const [bankrollCustomError, setBankrollCustomError] = useState<string | null>(null);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<"deposit" | "withdrawal" | "manual_adjustment">("manual_adjustment");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [showMovementDialog, setShowMovementDialog] = useState(false);

  // Popular form com valores do server quando banca e carregada
  useEffect(() => {
    if (bankroll?.configured) {
      if (bankroll.amount != null) setBankrollAmount(String(bankroll.amount));
      const rule = bankroll.rule ?? "1pct";
      if (rule === "1pct" || rule === "2pct" || rule === "5pct") {
        setBankrollRulePreset(rule);
        setBankrollCustomPct("");
      } else if (rule.startsWith("custom:")) {
        setBankrollRulePreset("custom");
        setBankrollCustomPct(rule.slice("custom:".length));
      }
    }
  }, [bankroll?.configured, bankroll?.amount, bankroll?.rule]);

  // Regra efetiva (string enviada ao backend)
  const effectiveRule = bankrollRulePreset === "custom"
    ? `custom:${bankrollCustomPct}`
    : bankrollRulePreset;

  // pct numerico para calculo de display
  const effectivePct = (() => {
    if (bankrollRulePreset === "1pct") return 1.0;
    if (bankrollRulePreset === "2pct") return 2.0;
    if (bankrollRulePreset === "5pct") return 5.0;
    const n = parseFloat(bankrollCustomPct);
    if (!Number.isFinite(n)) return null;
    // valida formato (1 casa decimal max, range 0.1..20)
    if (!/^-?\d+(?:\.\d)?$/.test(bankrollCustomPct)) return null;
    if (n < 0.1 || n > 20) return null;
    return n;
  })();

  // Valida custom em tempo real
  useEffect(() => {
    if (bankrollRulePreset !== "custom") {
      setBankrollCustomError(null);
      return;
    }
    if (bankrollCustomPct === "") {
      setBankrollCustomError(null);
      return;
    }
    if (!/^-?\d+(?:\.\d)?$/.test(bankrollCustomPct)) {
      setBankrollCustomError("Use no maximo 1 casa decimal (ex: 3.5)");
      return;
    }
    const n = parseFloat(bankrollCustomPct);
    if (!Number.isFinite(n)) {
      setBankrollCustomError("Valor invalido");
      return;
    }
    if (n < 0.1 || n > 20) {
      setBankrollCustomError("Entre 0.1 e 20");
      return;
    }
    setBankrollCustomError(null);
  }, [bankrollRulePreset, bankrollCustomPct]);

  // Valores derivados em tempo real (sem API)
  const amountNum = parseFloat(bankrollAmount);
  const amountValid = Number.isFinite(amountNum) && amountNum >= 0;
  const softLimitUSD = amountValid && effectivePct != null ? amountNum * (effectivePct / 100) : null;
  const hardLimitUSD = softLimitUSD != null ? softLimitUSD * 1.5 : null;
  // BRL rate: extraido do maxBuyInDisplay.BRL / maxBuyInUSD quando disponivel.
  // O backend calcula via user_settings.exchangeRates.BRL (se existir).
  const brlRate: number | undefined = (() => {
    const usd = bankroll?.maxBuyInUSD;
    const brl = bankroll?.maxBuyInDisplay?.BRL;
    if (usd != null && brl != null && usd > 0) return brl / usd;
    return undefined;
  })();
  const amountBRL = amountValid && brlRate ? amountNum * brlRate : null;
  const hardLimitBRL = hardLimitUSD != null && brlRate ? hardLimitUSD * brlRate : null;

  const isFirstConfig = !bankroll?.configured;
  const amountChanged = bankroll?.configured
    ? Math.abs(amountNum - (bankroll.amount ?? 0)) > 1e-9
    : amountValid;

  // Fetch exchange rates
  const { data: rates } = useQuery({
    queryKey: ["/api/settings/exchange-rates"],
    retry: false,
  });

  useEffect(() => {
    if (rates && typeof rates === 'object') {
      const r = rates as Partial<{ BRL: number; CNY: number; EUR: number }>;
      setExchangeRates((prev) => ({
        BRL: typeof r.BRL === 'number' ? r.BRL : prev.BRL,
        CNY: typeof r.CNY === 'number' ? r.CNY : prev.CNY,
        EUR: typeof r.EUR === 'number' ? r.EUR : prev.EUR,
      }));
    }
  }, [rates]);

  // Fetch user settings (alert preferences)
  const { data: userSettings } = useQuery({
    queryKey: ["/api/user-settings"],
    // Sprint B2 (M2): queryFn explicito para garantir compat com tests que
    // criam um QueryClient local sem defaultQueryFn registrado.
    queryFn: () => apiRequest('GET', '/api/user-settings'),
    retry: false,
  });

  useEffect(() => {
    if (userSettings && typeof userSettings === 'object') {
      const s = userSettings as any;
      if (s.lateRegAlertMinutes != null) setLateRegAlertMinutes(s.lateRegAlertMinutes);
      if (s.lateRegAlertEnabled != null) setLateRegAlertEnabled(s.lateRegAlertEnabled);
      if (s.lateRegAlertSound != null) setLateRegAlertSound(s.lateRegAlertSound);
      if (s.soundMode === 'tts' || s.soundMode === 'beep' || s.soundMode === 'mute') {
        setSoundMode(s.soundMode);
      }
      if (s.preferredVoiceURI != null) setPreferredVoiceURI(s.preferredVoiceURI);
      if (typeof s.alertVolume === 'number') setAlertVolume(s.alertVolume);
      if (typeof s.alertRepeatCount === 'number') setAlertRepeatCount(s.alertRepeatCount);
      if (typeof s.alertRepeatGapMs === 'number') setAlertRepeatGapMs(s.alertRepeatGapMs);
      if (typeof s.ttsRedactBuyIn === 'boolean') setTtsRedactBuyIn(s.ttsRedactBuyIn);
    }
  }, [userSettings]);

  // Sprint B2 (M2): valor exibido derivado de userSettings (back-fill default true).
  // Optimistic override durante mutation evita flicker.
  const enabledFromServer =
    userSettings && typeof (userSettings as any).bankrollManagementEnabled === 'boolean'
      ? ((userSettings as any).bankrollManagementEnabled as boolean)
      : null;
  const bankrollManagementEnabled =
    optimisticBankrollManagement ??
    (enabledFromServer === null ? true : enabledFromServer);
  const bankrollSettingsLoaded = userSettings !== undefined;

  // Sprint B2 (M2): toggle handler — PUT /api/user-settings com bankrollManagementEnabled.
  // Optimistic clear acontece em onSuccess apos invalidate — evita flicker entre
  // valor otimista limpo e refetch ainda in-flight.
  const saveBankrollManagementToggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/user-settings", { bankrollManagementEnabled: enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
      setOptimisticBankrollManagement(null);
    },
    onError: (error: Error) => {
      setOptimisticBankrollManagement(null);
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleBankrollManagement = (checked: boolean) => {
    setOptimisticBankrollManagement(checked);
    saveBankrollManagementToggle.mutate(checked);
  };

  // ADR-244 (RF-01): ajuste manual do resultado final da sessao. Fail-open —
  // valor ausente no server resolve para true (ligado por padrao, D3).
  const manualSessionResultFromServer =
    userSettings && typeof (userSettings as any).manualSessionResultEnabled === 'boolean'
      ? ((userSettings as any).manualSessionResultEnabled as boolean)
      : null;
  const manualSessionResultEnabled =
    optimisticManualSessionResult ??
    (manualSessionResultFromServer === null ? true : manualSessionResultFromServer);

  const saveManualSessionResultToggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/user-settings", { manualSessionResultEnabled: enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
      setOptimisticManualSessionResult(null);
    },
    onError: (error: Error) => {
      setOptimisticManualSessionResult(null);
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleManualSessionResult = (checked: boolean) => {
    setOptimisticManualSessionResult(checked);
    saveManualSessionResultToggle.mutate(checked);
  };

  // Save exchange rates mutation
  const saveExchangeRates = useMutation({
    mutationFn: (rates: { BRL: number; CNY: number; EUR: number }) =>
      apiRequest("POST", "/api/settings/exchange-rates", rates),
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Taxas de câmbio atualizadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/exchange-rates"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Save alert settings mutation
  const saveAlertSettings = useMutation({
    mutationFn: (settings: { lateRegAlertMinutes: number; lateRegAlertEnabled: boolean; lateRegAlertSound: boolean }) =>
      apiRequest("PUT", "/api/user-settings", settings),
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Configuracoes de alertas atualizadas.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // RF-07/RF-08 — Save TTS settings mutation (POST eh o endpoint real, ver server/routes/misc.ts).
  const saveTTSSettings = useMutation({
    mutationFn: (settings: {
      soundMode: 'tts' | 'beep' | 'mute';
      preferredVoiceURI: string | null;
      alertVolume: number;
      alertRepeatCount: number;
      alertRepeatGapMs: number;
      ttsRedactBuyIn: boolean;
    }) => apiRequest("POST", "/api/user-settings", settings),
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Configuracoes de voz atualizadas.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTestVoice = () => {
    if (!ttsAvailable) return;
    speakUtterance("Teste de voz Grindfy", preferredVoice, alertVolume);
  };

  const handleSaveTTSSettings = () => {
    saveTTSSettings.mutate({
      soundMode,
      preferredVoiceURI,
      alertVolume,
      alertRepeatCount,
      alertRepeatGapMs,
      ttsRedactBuyIn,
    });
  };

  // Bankroll save mutation (RF-06)
  const saveBankroll = useMutation({
    mutationFn: (body: { amount?: number | null; rule?: string; reason?: string; note?: string | null }) =>
      apiRequest("PUT", "/api/bankroll", body),
    onSuccess: () => {
      toast({
        title: isFirstConfig ? "Banca configurada" : "Banca atualizada",
        description: isFirstConfig
          ? "Sua banca foi configurada com sucesso."
          : "As configuracoes de banca foram atualizadas.",
      });
      setShowReasonDialog(false);
      setReasonNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/bankroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bankroll/history"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleSaveBankroll() {
    if (!amountValid) {
      toast({ title: "Erro", description: "Informe um valor de banca valido", variant: "destructive" });
      return;
    }
    if (bankrollRulePreset === "custom" && bankrollCustomError) {
      toast({ title: "Regra invalida", description: bankrollCustomError, variant: "destructive" });
      return;
    }

    // Primeira vez: reason=initial direto
    if (isFirstConfig) {
      saveBankroll.mutate({
        amount: amountNum,
        rule: effectiveRule,
        reason: "initial",
      });
      return;
    }

    // Rule-only change: sem dialog de reason
    if (!amountChanged) {
      saveBankroll.mutate({
        rule: effectiveRule,
      });
      return;
    }

    // Amount mudou: abre dialog
    setShowReasonDialog(true);
  }

  function handleConfirmReason() {
    saveBankroll.mutate({
      amount: amountNum,
      rule: effectiveRule,
      reason: reasonChoice,
      note: reasonNote.trim() || undefined,
    });
  }

  // Clear tournaments mutation
  const clearTournaments = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/tournaments/clear"),
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Histórico de torneios limpo com sucesso.",
      });
      setShowClearConfirmation(false);
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
      setShowClearConfirmation(false);
    },
  });

  const handleExchangeRateChange = (currency: 'BRL' | 'CNY' | 'EUR', value: string) => {
    const rate = parseFloat(value);
    if (!isNaN(rate) && rate > 0) {
      setExchangeRates(prev => ({
        ...prev,
        [currency]: rate
      }));
    }
  };

  const handleSaveRates = () => {
    saveExchangeRates.mutate(exchangeRates);
  };

  const handleClearHistory = () => {
    clearTournaments.mutate();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-3xl font-bold text-white">Configurações</h1>
          <p className="text-gray-400">Gerencie suas preferências e dados do sistema</p>
        </div>
      </div>

      {/* Interface Settings Section */}
      <Card className="bg-card border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Sidebar className="h-5 w-5 text-blue-400" />
            Configurações da Interface
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-white font-medium">
                  Auto-colapso da Barra Lateral
                </Label>
                <p className="text-gray-400 text-sm">
                  Colapsa automaticamente a barra lateral durante sessões de grind para maximizar o espaço da tela
                </p>
              </div>
              <Switch
                checked={autoCollapseForGrind}
                onCheckedChange={setAutoCollapseForGrind}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessao de Grind — ADR-244 (RF-01): ajuste manual do resultado final */}
      <Card className="bg-card border-gray-700" data-testid="settings-grind-session-section">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Sessao de Grind
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="manual-session-result-toggle"
                className="text-white font-medium"
              >
                Ajustar resultado final da sessao manualmente
              </Label>
              <p className="text-gray-400 text-sm">
                Permite digitar o lucro/prejuizo da sessao ao finalizar. O
                investido nao muda e o ROI e recalculado.
              </p>
            </div>
            <Switch
              id="manual-session-result-toggle"
              data-testid="settings-toggle-manual-session-result"
              checked={manualSessionResultEnabled}
              onCheckedChange={handleToggleManualSessionResult}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </CardContent>
      </Card>

      {/* Alert Settings Section (RF-09) */}
      <Card className="bg-card border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-yellow-400" />
            Alertas de Sessao de Grind
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-400 text-sm">
            Configure os alertas de late registration para sessoes de grind ao vivo.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-white font-medium">
                  Alertas de Late Reg
                </Label>
                <p className="text-gray-400 text-sm">
                  Receba notificacoes quando o late registration estiver prestes a encerrar
                </p>
              </div>
              <Switch
                checked={lateRegAlertEnabled}
                onCheckedChange={setLateRegAlertEnabled}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-white font-medium">
                  Som dos Alertas
                </Label>
                <p className="text-gray-400 text-sm">
                  Reproduzir som ao disparar alertas (late reg e customizados)
                </p>
              </div>
              <Switch
                checked={lateRegAlertSound}
                onCheckedChange={setLateRegAlertSound}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white font-medium">
                Tempo de Alerta (minutos antes do encerramento)
              </Label>
              <Select
                value={String(lateRegAlertMinutes)}
                onValueChange={(value) => setLateRegAlertMinutes(parseInt(value))}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="5">5 minutos</SelectItem>
                  <SelectItem value="10">10 minutos (padrao)</SelectItem>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="20">20 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveAlertSettings.mutate({ lateRegAlertMinutes, lateRegAlertEnabled, lateRegAlertSound })}
              disabled={saveAlertSettings.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saveAlertSettings.isPending ? "Salvando..." : "Salvar Alertas"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* RF-07/RF-08 — Alertas e Voz (Sprint Alarmes 2.0) */}
      <Card className="bg-card border-gray-700" data-testid="settings-tts-section">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Mic className="h-5 w-5 text-amber-400" />
            Alertas e Voz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-400 text-sm">
            Configure como os alertas soam durante a sessao de grind.
          </p>

          {/* 1. Modo de som */}
          <div className="space-y-2">
            <Label className="text-white font-medium">Modo de som</Label>
            <RadioGroup
              value={soundMode}
              onValueChange={(v) => setSoundMode(v as 'tts' | 'beep' | 'mute')}
              className="flex gap-6"
              data-testid="tts-sound-mode"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="tts"
                  id="sound-mode-tts"
                  disabled={!ttsAvailable}
                  data-testid="tts-mode-tts"
                />
                <Label htmlFor="sound-mode-tts" className="text-gray-200 text-sm cursor-pointer">
                  Voz (TTS)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="beep" id="sound-mode-beep" data-testid="tts-mode-beep" />
                <Label htmlFor="sound-mode-beep" className="text-gray-200 text-sm cursor-pointer">
                  Beep
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="mute" id="sound-mode-mute" data-testid="tts-mode-mute" />
                <Label htmlFor="sound-mode-mute" className="text-gray-200 text-sm cursor-pointer">
                  Mudo
                </Label>
              </div>
            </RadioGroup>
            {!ttsAvailable && (
              <p className="text-amber-400 text-xs">
                Nenhuma voz pt-BR disponivel neste navegador. Modo TTS desabilitado.
              </p>
            )}
          </div>

          {/* 2. Voz */}
          <div className="space-y-2">
            <Label className="text-white font-medium">Voz</Label>
            <div className="flex gap-2 items-center">
              <Select
                value={preferredVoiceURI ?? '__default__'}
                onValueChange={(v) => setPreferredVoiceURI(v === '__default__' ? null : v)}
                disabled={!ttsAvailable}
              >
                <SelectTrigger
                  className="bg-gray-800 border-gray-600 text-white w-72"
                  data-testid="tts-voice-select"
                >
                  <SelectValue placeholder="Primeira voz pt-BR disponivel" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="__default__">Primeira voz pt-BR disponivel</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleTestVoice}
                disabled={!ttsAvailable}
                data-testid="tts-test-voice-btn"
                aria-label="Testar voz"
                className="border-amber-600 text-amber-300 hover:bg-amber-600/20"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 3. Volume */}
          <div className="space-y-2">
            <Label className="text-white font-medium">
              Volume: {Math.round(alertVolume * 100)}%
            </Label>
            <Slider
              data-testid="tts-volume-slider"
              value={[alertVolume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => setAlertVolume(v)}
              className="max-w-md"
            />
          </div>

          {/* 4. Repetição */}
          <div className="space-y-2">
            <Label className="text-white font-medium">Repeticao</Label>
            <Select
              value={String(alertRepeatCount)}
              onValueChange={(v) => setAlertRepeatCount(parseInt(v, 10))}
            >
              <SelectTrigger
                className="bg-gray-800 border-gray-600 text-white w-48"
                data-testid="tts-repeat-count"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="1">1 vez</SelectItem>
                <SelectItem value="2">2 vezes</SelectItem>
                <SelectItem value="3">3 vezes</SelectItem>
                <SelectItem value="5">5 vezes</SelectItem>
                <SelectItem value="99">Loop (ate dispensar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5. Intervalo entre repetições */}
          <div className="space-y-2">
            <Label className="text-white font-medium">
              Intervalo entre repeticoes (segundos)
            </Label>
            <Input
              type="number"
              min={2}
              max={30}
              step={1}
              value={Math.round(alertRepeatGapMs / 1000)}
              onChange={(e) => {
                const seconds = parseInt(e.target.value, 10);
                if (!Number.isNaN(seconds) && seconds >= 2 && seconds <= 30) {
                  setAlertRepeatGapMs(seconds * 1000);
                }
              }}
              data-testid="tts-repeat-gap"
              className="bg-gray-800 border-gray-600 text-white w-32"
            />
          </div>

          {/* 6. Redatar buy-in alto */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-white font-medium">Redatar buy-in alto</Label>
              <p className="text-gray-400 text-sm">
                Narra "buy-in alto" em vez do valor quando &gt; $100. Util em ambientes
                compartilhados.
              </p>
            </div>
            <Switch
              data-testid="tts-redact-buyin"
              checked={ttsRedactBuyIn}
              onCheckedChange={setTtsRedactBuyIn}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveTTSSettings}
              disabled={saveTTSSettings.isPending}
              data-testid="tts-save-btn"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saveTTSSettings.isPending ? "Salvando..." : "Salvar Voz"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exchange Rates Section */}
      <Card className="bg-card border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-400" />
            Taxas de Câmbio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-400 text-sm">
            Configure as taxas de conversão para moedas não-USD nos seus torneios.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brl-rate" className="text-white">
                Taxa BRL (reais por dolar)
              </Label>
              <Input
                id="brl-rate"
                type="number"
                step="0.01"
                value={exchangeRates.BRL}
                onChange={(e) => handleExchangeRateChange('BRL', e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="5.00"
                data-testid="settings-rate-brl"
              />
              <p className="text-xs text-gray-500">
                1 USD = {exchangeRates.BRL} BRL
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cny-rate" className="text-white">
                Taxa CNY (yuans por dolar)
              </Label>
              <Input
                id="cny-rate"
                type="number"
                step="0.01"
                value={exchangeRates.CNY}
                onChange={(e) => handleExchangeRateChange('CNY', e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="7.20"
              />
              <p className="text-xs text-gray-500">
                1 USD = {exchangeRates.CNY} CNY
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eur-rate" className="text-white">
                Taxa EUR (euros por dolar)
              </Label>
              <Input
                id="eur-rate"
                type="number"
                step="0.001"
                value={exchangeRates.EUR}
                onChange={(e) => handleExchangeRateChange('EUR', e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="0.920"
              />
              <p className="text-xs text-gray-500">
                1 USD = {exchangeRates.EUR} EUR
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveRates}
              disabled={saveExchangeRates.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saveExchangeRates.isPending ? "Salvando..." : "Salvar Taxas"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bankroll Section (RF-06) */}
      <Card className="bg-card border-gray-700" data-testid="bankroll-settings-section">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-400" />
              Banca (Bankroll)
            </CardTitle>
            {/* Sprint B2 (M2): toggle gestao multi-wallet + reconcile pos-sessao */}
            {bankrollSettingsLoaded && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="bankroll-management-toggle"
                  className="text-xs text-gray-300"
                >
                  Gestao multi-wallet
                </Label>
                <Switch
                  id="bankroll-management-toggle"
                  data-testid="setting-bankroll-management-toggle"
                  checked={bankrollManagementEnabled}
                  onCheckedChange={handleToggleBankrollManagement}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Quando desativado, a sessao finaliza sem pedir reconciliacao de saldos.
            Banca legada (campo unico) continua funcionando.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!bankroll?.configured && (
            <div
              data-testid="bankroll-setup-cta"
              className="rounded-md border border-emerald-600/40 bg-emerald-900/10 p-4"
            >
              <p className="text-emerald-200 text-sm font-medium">
                Configure sua banca para ativar recomendacoes personalizadas
              </p>
              <p className="text-emerald-300/70 text-xs mt-1">
                O Tournament Selector passa a filtrar torneios fora da sua regra e o Grind Live avisa antes de voce comprar um shot acima do permitido.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankroll-amount" className="text-white">
                Sua banca atual (USD)
              </Label>
              <Input
                id="bankroll-amount"
                type="number"
                step="0.01"
                min="0"
                data-testid="bankroll-amount-input"
                value={bankrollAmount}
                onChange={(e) => setBankrollAmount(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="1000.00"
              />
              {amountBRL != null && (
                <p className="text-xs text-gray-400" data-testid="bankroll-amount-brl">
                  Equivalente em BRL: R$ {amountBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankroll-rule" className="text-white">
                Regra de gestao
              </Label>
              <Select
                value={bankrollRulePreset}
                onValueChange={(v) => setBankrollRulePreset(v)}
              >
                <SelectTrigger
                  id="bankroll-rule"
                  data-testid="bankroll-rule-select"
                  className="bg-gray-800 border-gray-600 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="1pct">1% da banca</SelectItem>
                  <SelectItem value="2pct">2% da banca</SelectItem>
                  <SelectItem value="5pct">5% da banca</SelectItem>
                  <SelectItem value="custom">Customizada</SelectItem>
                </SelectContent>
              </Select>

              {bankrollRulePreset === "custom" && (
                <div className="space-y-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="20"
                    data-testid="bankroll-custom-pct-input"
                    value={bankrollCustomPct}
                    onChange={(e) => setBankrollCustomPct(e.target.value)}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: 3.5"
                  />
                  {bankrollCustomError && (
                    <p className="text-xs text-red-400" data-testid="bankroll-custom-error">
                      {bankrollCustomError}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">Entre 0.1 e 20, uma casa decimal</p>
                </div>
              )}
            </div>
          </div>

          {/* Display derivado */}
          <div className="rounded-md bg-gray-800/50 border border-gray-700 p-3 space-y-1">
            <p className="text-sm text-white font-medium" data-testid="bankroll-max-buyin-display">
              Buy-in maximo recomendado:{" "}
              {hardLimitUSD != null ? (
                <>
                  $
                  {hardLimitUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {hardLimitBRL != null && (
                    <>
                      {" "}
                      (R$ {hardLimitBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </>
                  )}
                </>
              ) : (
                "-"
              )}
            </p>
            <p className="text-xs text-gray-500" data-testid="bankroll-tolerance-fineprint">
              Inclui tolerancia de 50% para shots pontuais
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {bankroll?.configured && (
              <Button
                variant="outline"
                data-testid="bankroll-open-movement-dialog"
                onClick={() => setShowMovementDialog(true)}
                className="border-gray-600 text-gray-200"
              >
                Registrar aporte/saque
              </Button>
            )}
            {bankroll?.configured && (
              <Link href="/bankroll">
                <Button
                  variant="ghost"
                  data-testid="bankroll-history-link"
                  className="text-emerald-300 hover:text-emerald-200"
                >
                  Ver historico completo
                </Button>
              </Link>
            )}
            <Button
              onClick={handleSaveBankroll}
              data-testid="bankroll-save-button"
              disabled={
                !amountValid ||
                saveBankroll.isPending ||
                (bankrollRulePreset === "custom" && !!bankrollCustomError)
              }
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saveBankroll.isPending ? "Salvando..." : "Salvar banca"}
            </Button>
          </div>

          {/* Sprint B2 (M2): wallets-list-section so renderiza com toggle ON */}
          {bankrollManagementEnabled && (
            <div
              data-testid="wallets-list-section"
              className="rounded-md border border-gray-700 bg-gray-800/30 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white font-medium">Wallets multi-plataforma</p>
                  <p className="text-xs text-gray-400">
                    Gerencie wallets por plataforma (Suprema, GG, Stars, etc) na pagina de banca.
                  </p>
                </div>
                <Link href="/bankroll">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="wallets-list-link"
                    className="border-gray-600 text-gray-200"
                  >
                    Abrir wallets
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reason dialog (RF-06) — aparece quando usuario configurado muda amount */}
      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent className="bg-gray-800 border-gray-600" data-testid="bankroll-reason-dialog">
          <DialogHeader>
            <DialogTitle className="text-white">Registrar motivo da mudanca</DialogTitle>
            <DialogDescription className="text-gray-300">
              Voce esta alterando o valor da sua banca. Selecione o motivo para registrar no historico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-white">Motivo</Label>
              <Select
                value={reasonChoice}
                onValueChange={(v) => setReasonChoice(v as any)}
              >
                <SelectTrigger data-testid="bankroll-reason-select" className="bg-gray-900 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="deposit">Aporte</SelectItem>
                  <SelectItem value="withdrawal">Saque</SelectItem>
                  <SelectItem value="manual_adjustment">Ajuste manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white">Nota (opcional)</Label>
              <Input
                data-testid="bankroll-reason-note"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                maxLength={500}
                className="bg-gray-900 border-gray-600 text-white"
                placeholder="Ex: PIX recebido"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReasonDialog(false)}
              className="border-gray-600 text-gray-300"
            >
              Cancelar
            </Button>
            <Button
              data-testid="bankroll-reason-confirm"
              onClick={handleConfirmReason}
              disabled={saveBankroll.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saveBankroll.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog (RF-06) */}
      <BankrollMovementDialog open={showMovementDialog} onOpenChange={setShowMovementDialog} />

      {/* Data Management Section */}
      <Card className="bg-card border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-400" />
            Gerenciamento de Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-white font-medium mb-2">Limpar Histórico de Torneios</h3>
              <p className="text-gray-400 text-sm mb-4">
                Remove todos os torneios importados e redefine as estatísticas. Esta ação não pode ser desfeita.
              </p>
              
              <Dialog open={showClearConfirmation} onOpenChange={setShowClearConfirmation}>
                <DialogTrigger asChild>
                  <Button 
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Limpar Histórico
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-800 border-gray-600">
                  <DialogHeader>
                    <DialogTitle className="text-white flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-400" />
                      Confirmar Limpeza do Histórico
                    </DialogTitle>
                    <DialogDescription className="text-gray-300">
                      Tem certeza de que deseja remover todos os torneios do seu histórico? 
                      Esta ação irá:
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-2 text-gray-300">
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Deletar todos os torneios importados</li>
                      <li>Resetar todas as estatísticas e análises</li>
                      <li>Limpar os gráficos do dashboard</li>
                      <li>Remover o histórico de performance</li>
                    </ul>
                    <p className="text-red-400 font-medium text-sm mt-3">
                      ⚠️ Esta ação não pode ser desfeita!
                    </p>
                  </div>

                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowClearConfirmation(false)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={handleClearHistory}
                      disabled={clearTournaments.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {clearTournaments.isPending ? "Limpando..." : "Confirmar Limpeza"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Future Settings Sections */}
      <Card className="bg-card border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Outras Configurações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-sm">
            Configurações adicionais serão adicionadas em futuras atualizações.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}