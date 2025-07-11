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
  Sidebar
} from "lucide-react";
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
  const [exchangeRates, setExchangeRates] = useState({ CNY: 0.14, EUR: 0.92 });
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

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
                CNY para USD
              </Label>
              <Input
                id="cny-rate"
                type="number"
                step="0.001"
                value={exchangeRates.CNY}
                onChange={(e) => handleExchangeRateChange('CNY', e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="0.140"
              />
              <p className="text-xs text-gray-500">
                1 CNY = {exchangeRates.CNY} USD
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eur-rate" className="text-white">
                EUR para USD
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
                1 EUR = {exchangeRates.EUR} USD
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