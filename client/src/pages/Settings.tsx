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
import {
  Settings as SettingsIcon,
  DollarSign,
  Trash2,
  AlertTriangle,
  Save,
  Sidebar,
  Bell,
  Wallet
} from "lucide-react";
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
  const [exchangeRates, setExchangeRates] = useState({ CNY: 7.20, EUR: 0.92 });
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Alert settings
  const [lateRegAlertMinutes, setLateRegAlertMinutes] = useState(10);
  const [lateRegAlertEnabled, setLateRegAlertEnabled] = useState(true);
  const [lateRegAlertSound, setLateRegAlertSound] = useState(true);

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
      setExchangeRates(rates as { CNY: number; EUR: number });
    }
  }, [rates]);

  // Fetch user settings (alert preferences)
  const { data: userSettings } = useQuery({
    queryKey: ["/api/user-settings"],
    retry: false,
  });

  useEffect(() => {
    if (userSettings && typeof userSettings === 'object') {
      const s = userSettings as any;
      if (s.lateRegAlertMinutes != null) setLateRegAlertMinutes(s.lateRegAlertMinutes);
      if (s.lateRegAlertEnabled != null) setLateRegAlertEnabled(s.lateRegAlertEnabled);
      if (s.lateRegAlertSound != null) setLateRegAlertSound(s.lateRegAlertSound);
    }
  }, [userSettings]);

  // Save exchange rates mutation
  const saveExchangeRates = useMutation({
    mutationFn: (rates: { CNY: number; EUR: number }) => 
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

  const handleExchangeRateChange = (currency: 'CNY' | 'EUR', value: string) => {
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
      <Card className="bg-poker-surface border-gray-700">
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
                className="data-[state=checked]:bg-poker-green"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Settings Section (RF-09) */}
      <Card className="bg-poker-surface border-gray-700">
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
                className="data-[state=checked]:bg-poker-green"
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
                className="data-[state=checked]:bg-poker-green"
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

      {/* Exchange Rates Section */}
      <Card className="bg-poker-surface border-gray-700">
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <Card className="bg-poker-surface border-gray-700" data-testid="bankroll-settings-section">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-400" />
            Banca (Bankroll)
          </CardTitle>
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
      <Card className="bg-poker-surface border-gray-700">
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
      <Card className="bg-poker-surface border-gray-700">
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