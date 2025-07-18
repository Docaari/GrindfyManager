import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Clock, DollarSign, Trophy, Target, Coffee, SkipForward, X, ChevronDown, ChevronUp, UserPlus, Award, Coins, Edit, XCircle, Undo2, PlayCircle, FileText, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BreakFeedbackPopup } from "@/components/BreakFeedbackPopup";

interface GrindSession {
  id: string;
  userId: string;
  date: string;
  status: string;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  skipBreaksToday: boolean;
  objectiveCompleted?: boolean;
  finalNotes?: string;
  screenCap?: number;
}

interface SessionTournament {
  id: string;
  sessionId: string;
  site: string;
  name?: string;
  buyIn: string;
  rebuys: number;
  result: string;
  position?: number;
  fieldSize?: number;
  status: string;
  fromPlannedTournament: boolean;
}

interface BreakFeedback {
  id: string;
  sessionId: string;
  breakTime: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes?: string;
}

// Helper functions for tournament categorization and colors
const getSiteColor = (site: string): string => {
  const colors: { [key: string]: string } = {
    'PokerStars': 'bg-red-600',
    'GGPoker': 'bg-orange-600',
    'GGNetwork': 'bg-orange-600',
    'PartyPoker': 'bg-pink-600',
    '888poker': 'bg-blue-600',
    'WPN': 'bg-purple-600',
    'Chico': 'bg-yellow-600',
    'iPoker': 'bg-green-600',
    'Bodog': 'bg-indigo-600',
    'CoinPoker': 'bg-amber-600',
    'Revolution': 'bg-teal-600'
  };
  return colors[site] || 'bg-gray-600';
};

// Helper function to get screen cap colors based on percentage
const getScreenCapColor = (current: number, cap: number): { bgColor: string; textColor: string; borderColor: string } => {
  // Validação para evitar divisão por zero ou valores inválidos
  if (!cap || cap <= 0 || current < 0) {
    return {
      bgColor: 'bg-gray-600/20',
      textColor: 'text-gray-400',
      borderColor: 'border-gray-500/50'
    };
  }

  const percentage = (current / cap) * 100;
  
  if (percentage <= 70) {
    return {
      bgColor: 'bg-green-600/20',
      textColor: 'text-green-400',
      borderColor: 'border-green-500/50'
    };
  } else if (percentage <= 90) {
    return {
      bgColor: 'bg-yellow-600/20',
      textColor: 'text-yellow-400',
      borderColor: 'border-yellow-500/50'
    };
  } else {
    return {
      bgColor: 'bg-red-600/20',
      textColor: 'text-red-400',
      borderColor: 'border-red-500/50'
    };
  }
};

const getCategoryColor = (category: string): string => {
  const colors: { [key: string]: string } = {
    'Vanilla': 'bg-blue-600',
    'PKO': 'bg-red-600',
    'Mystery': 'bg-purple-600'
  };
  return colors[category] || 'bg-gray-600';
};

const getSpeedColor = (speed: string): string => {
  const colors: { [key: string]: string } = {
    'Normal': 'bg-green-600',
    'Turbo': 'bg-yellow-600',
    'Hyper': 'bg-red-600'
  };
  return colors[speed] || 'bg-gray-600';
};

// Priority helper functions with new CSS classes
const getPrioridadeColor = (prioridade: number): string => {
  const colors: { [key: number]: string } = {
    1: 'priority-high', // Alta
    2: 'priority-medium', // Média
    3: 'priority-low' // Baixa
  };
  return colors[prioridade] || 'priority-medium';
};

const getPrioridadeLabel = (prioridade: number): string => {
  const labels: { [key: number]: string } = {
    1: 'Alta',
    2: 'Média',
    3: 'Baixa'
  };
  return labels[prioridade] || 'Média';
};

// ===== SISTEMA DE PRIORIDADES CLICÁVEIS (ETAPA 5) =====
const handlePriorityClickCycle = (tournamentId: string, currentPriority: number) => {
  // Ciclo: Alta (1) -> Média (2) -> Baixa (3) -> Alta (1)
  let nextPriority = currentPriority + 1;
  if (nextPriority > 3) nextPriority = 1;
  
  // Usar a função existente de atualização de prioridade
  handleUpdatePriority(tournamentId, nextPriority);
};

// ===== SISTEMA DE REBUYS COM CORES DE ALERTA =====
const handleAddRebuyClick = (tournamentId: string, currentRebuys: number) => {
  const newRebuys = currentRebuys + 1;
  
  // Usar a função existente de atualização de rebuy
  handleUpdateTournament({ id: tournamentId, rebuys: currentRebuys }, 'rebuys', newRebuys);
};

const getRebuyCounterClass = (rebuys: number): string => {
  if (rebuys >= 4) return 'bg-red-600 border-red-400 shadow-red-500/50';
  if (rebuys >= 2) return 'bg-yellow-600 border-yellow-400 shadow-yellow-500/50';
  return 'bg-green-600 border-green-400 shadow-green-500/50';
};

const getRebuyText = (rebuys: number): string => {
  if (rebuys === 0) return '';
  if (rebuys === 1) return '1 Rebuy';
  return `${rebuys} Rebuys`;
};

// ===== UTILITY FUNCTIONS (MOVED TO COMPONENT) =====

const formatNumberWithDots = (num: string | number): string => {
  const numStr = String(num);
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// AJUSTE 3: Função para normalizar entradas decimais (aceita vírgula e ponto)
const normalizeDecimalInput = (value: string): string => {
  if (!value || value.trim() === '') return '';
  
  // Remove espaços
  let normalized = value.trim();
  
  // Detecta se é formato brasileiro (vírgula como decimal) ou internacional (ponto como decimal)
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  
  if (hasComma && hasDot) {
    // Formato: 1.250,75 (brasileiro) ou 1,250.75 (internacional)
    const lastCommaIndex = normalized.lastIndexOf(',');
    const lastDotIndex = normalized.lastIndexOf('.');
    
    if (lastCommaIndex > lastDotIndex) {
      // Formato brasileiro: 1.250,75
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato internacional: 1,250.75
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Só vírgula: pode ser decimal (10,50) ou separador de milhares (1,250)
    const commaIndex = normalized.indexOf(',');
    const afterComma = normalized.substring(commaIndex + 1);
    
    // Se após a vírgula tem 1 ou 2 dígitos, é decimal
    if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
      normalized = normalized.replace(',', '.');
    } else {
      // Separador de milhares, remove vírgulas
      normalized = normalized.replace(/,/g, '');
    }
  }
  
  // Validação final: deve ser um número válido
  const finalNumber = parseFloat(normalized);
  if (isNaN(finalNumber)) {
    return '';
  }
  
  return normalized;
};

const generateTournamentName = (tournament: any): string => {
  if (tournament.name && tournament.name.trim()) {
    // Format guaranteed values in existing titles
    return tournament.name.replace(/\b(\d{4,})\b/g, (match: string) => formatNumberWithDots(match));
  }

  const guaranteed = tournament.guaranteed ? ` $${formatNumberWithDots(tournament.guaranteed)}` : '';
  return `${tournament.type || tournament.category || 'Vanilla'} $${formatNumberWithDots(tournament.buyIn)}${guaranteed} ${tournament.site}`;
};

export default function GrindSessionLive() {
  const [, setLocation] = useLocation();
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  
  // Debug log para showBreakDialog
  useEffect(() => {
    console.log('showBreakDialog state changed to:', showBreakDialog);
  }, [showBreakDialog]);
  
  // Debug para verificar mudanças no estado
  useEffect(() => {
    console.log('showBreakDialog state changed to:', showBreakDialog);
  }, [showBreakDialog]);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  

  const [sessionObjectiveCompleted, setSessionObjectiveCompleted] = useState(false);
  const [sessionFinalNotes, setSessionFinalNotes] = useState("");
  const [showCompletedTournaments, setShowCompletedTournaments] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState(50);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  const [screenCap, setScreenCap] = useState<number>(10);
  const [skipBreaksToday, setSkipBreaksToday] = useState(false);
  
  // ===== ETAPA 6: ESTADOS PARA CAMPOS DE RESULTADO INLINE =====
  const [showResultFields, setShowResultFields] = useState<{ [key: string]: boolean }>({});
  const [resultData, setResultData] = useState<{ [key: string]: { bounty: string; prize: string; position: string; } }>({});
  const [savingResult, setSavingResult] = useState<{ [key: string]: boolean }>({});
  
  // ===== ETAPA 8: ESTADOS PARA NOTAS RÁPIDAS =====
  const [showQuickNoteModal, setShowQuickNoteModal] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteTimestamp, setQuickNoteTimestamp] = useState('');
  const [savingQuickNote, setSavingQuickNote] = useState(false);
  
  // Dashboard ocultável - ETAPA 2 (removido - usando a versão com localStorage abaixo)
  
  // ===== ETAPA 6: FUNÇÕES PARA CAMPOS DE RESULTADO INLINE =====
  const handleFinishTournamentDirect = (tournamentId: string) => {
    // Verificar se há valores nos campos de entrada
    const entryData = registrationData[tournamentId];
    const hasBounty = entryData?.bounty && entryData.bounty.trim() !== '';
    const hasPrize = entryData?.prize && entryData.prize.trim() !== '';
    const hasPosition = entryData?.position && entryData.position.trim() !== '';
    
    let updateData: any = {
      status: 'finished',
      endTime: new Date().toISOString()
    };
    
    // Se há valores preenchidos, usar esses valores
    if (hasBounty || hasPrize || hasPosition) {
      updateData.bounty = normalizeDecimalInput(entryData?.bounty || '0');
      updateData.result = normalizeDecimalInput(entryData?.prize || '0');
      updateData.position = hasPosition ? parseInt(entryData.position) : null;
      
      updateTournamentMutation.mutate({
        id: tournamentId,
        data: updateData
      });
      
      // Limpar dados de entrada após finalizar
      setRegistrationData(prev => {
        const updated = { ...prev };
        delete updated[tournamentId];
        return updated;
      });
      
      const totalResult = parseFloat(updateData.result) + parseFloat(updateData.bounty);
      toast({
        title: "Torneio Finalizado",
        description: `Resultado salvo: $${totalResult.toFixed(2)}`,
      });
    } else {
      // Finalização direta sem valores - apenas GG!
      updateData.result = '0';
      updateData.bounty = '0';
      updateData.position = null;
      
      updateTournamentMutation.mutate({
        id: tournamentId,
        data: updateData
      });
      
      toast({
        title: "Torneio Finalizado",
        description: "Torneio marcado como GG!",
      });
    }
  };

  const handleShowResultFields = (tournamentId: string) => {
    setShowResultFields(prev => ({
      ...prev,
      [tournamentId]: true
    }));
    
    // Inicializar dados se não existirem
    if (!resultData[tournamentId]) {
      setResultData(prev => ({
        ...prev,
        [tournamentId]: { bounty: '', prize: '', position: '' }
      }));
    }
  };

  const handleHideResultFields = (tournamentId: string) => {
    setShowResultFields(prev => ({
      ...prev,
      [tournamentId]: false
    }));
    
    // Limpar dados
    setResultData(prev => {
      const newData = { ...prev };
      delete newData[tournamentId];
      return newData;
    });
  };

  const handleUpdateResultData = (tournamentId: string, field: string, value: string) => {
    setResultData(prev => ({
      ...prev,
      [tournamentId]: {
        ...prev[tournamentId],
        [field]: value
      }
    }));
  };

  const calculateTotalProfit = (tournamentId: string, tournament: any) => {
    const data = resultData[tournamentId];
    if (!data) return { total: 0, profit: 0 };
    
    const bounty = parseFloat(data.bounty) || 0;
    const prize = parseFloat(data.prize) || 0;
    const total = bounty + prize;
    
    const buyIn = parseFloat(tournament.buyIn) || 0;
    const rebuys = tournament.rebuys || 0;
    const invested = buyIn * (1 + rebuys);
    const profit = total - invested;
    
    return { total, profit, invested };
  };

  const handleSaveResult = (tournamentId: string, tournament: any) => {
    const data = resultData[tournamentId];
    if (!data) return;
    
    const { total, profit } = calculateTotalProfit(tournamentId, tournament);
    
    setSavingResult(prev => ({ ...prev, [tournamentId]: true }));
    
    const updateData = {
      bounty: data.bounty || '0',
      result: data.prize || '0',
      position: data.position ? parseInt(data.position) : null,
      status: 'finished',
      endTime: new Date().toISOString()
    };
    
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: updateData
    }, {
      onSuccess: () => {
        setSavingResult(prev => ({ ...prev, [tournamentId]: false }));
        handleHideResultFields(tournamentId);
        
        toast({
          title: "Resultado Salvo",
          description: `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
        });
      },
      onError: (error) => {
        setSavingResult(prev => ({ ...prev, [tournamentId]: false }));
        toast({
          title: "Erro ao Salvar",
          description: "Não foi possível salvar o resultado.",
          variant: "destructive",
        });
      }
    });
  };

  // Sistema de Anotações Rápidas (removido - usando estados da ETAPA 8 acima)
  const [showQuickNotesDialog, setShowQuickNotesDialog] = useState(false);
  const [quickNotes, setQuickNotes] = useState<{id: string, text: string, timestamp: string}[]>([]);

  // ===== ETAPA 10: ESTADOS PARA FINALIZAÇÃO DE SESSÃO =====
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionSummaryData, setSessionSummaryData] = useState<any>(null);
  const [finalNotes, setFinalNotes] = useState('');
  const [pendingTournaments, setPendingTournaments] = useState<any[]>([]);
  
  // ===== ETAPA 8: FUNÇÕES PARA NOTAS RÁPIDAS =====
  const handleOpenQuickNoteModal = () => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setQuickNoteTimestamp(timestamp);
    setQuickNoteText('');
    setShowQuickNoteModal(true);
  };

  const handleCloseQuickNoteModal = () => {
    setShowQuickNoteModal(false);
    setQuickNoteText('');
    setQuickNoteTimestamp('');
  };

  const handleSaveQuickNote = async () => {
    if (!quickNoteText.trim()) return;
    
    setSavingQuickNote(true);
    try {
      const newNote = {
        id: Date.now().toString(),
        text: quickNoteText.trim(),
        timestamp: quickNoteTimestamp
      };
      
      setQuickNotes(prev => [...prev, newNote]);
      
      toast({
        title: "Nota Salva",
        description: `Nota adicionada às ${quickNoteTimestamp}`,
      });
      
      handleCloseQuickNoteModal();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível salvar a nota.",
        variant: "destructive",
      });
    } finally {
      setSavingQuickNote(false);
    }
  };

  // Tournament states and dialogs
  const [registrationDialogs, setRegistrationDialogs] = useState<{[key: string]: boolean}>({});
  const [editDialogs, setEditDialogs] = useState<{[key: string]: boolean}>({});
  const [registrationData, setRegistrationData] = useState<{[key: string]: {prize: string, bounty: string, position: string}}>({});
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [showPendingTournamentsDialog, setShowPendingTournamentsDialog] = useState(false);
  const [newTournament, setNewTournament] = useState({
    site: "",
    name: "",
    buyIn: "",
    type: "Vanilla",
    speed: "Normal",
    scheduledTime: "",
    fieldSize: "",
    rebuys: 0,
    result: "0",
    position: null,
    status: "upcoming"
  });



  // Break feedback form
  const [breakFeedback, setBreakFeedback] = useState({
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: ""
  });



  const [showBreakManagementDialog, setShowBreakManagementDialog] = useState(false);
  const [sessionElapsedTime, setSessionElapsedTime] = useState("");
  const [showEditTournamentDialog, setShowEditTournamentDialog] = useState(false);
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [editingTimeDialog, setEditingTimeDialog] = useState<{[key: string]: boolean}>({});
  const [timeEditValue, setTimeEditValue] = useState<{[key: string]: string}>({});
  
  const [showDashboard, setShowDashboard] = useState(() => {
    const saved = localStorage.getItem('grindSessionDashboardVisible');
    return saved ? JSON.parse(saved) : true;
  });
  const [syncWithGrade, setSyncWithGrade] = useState(true); // Default opt-in

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ===== ETAPA 10: FUNÇÕES PARA FINALIZAÇÃO DE SESSÃO =====
  const handleSessionFinalization = () => {
    // Combinar todos os torneios (planned e session) para verificar estado
    const allTournaments = [
      ...(plannedTournaments || []).map(t => ({ ...t, id: `planned-${t.id}` })),
      ...(sessionTournaments || [])
    ];
    
    // Organizar torneios para verificar estado
    const organized = organizeTournaments(allTournaments);
    const registered = organized.registered || [];
    const tournamentsPending = registered.filter(t => t.status === 'registered');
    
    console.log('handleSessionFinalization - Registered tournaments:', registered.length);
    console.log('handleSessionFinalization - Pending tournaments:', tournamentsPending.length);
    
    if (tournamentsPending.length > 0) {
      setPendingTournaments(tournamentsPending);
      setShowConfirmationModal(true);
    } else {
      // Prosseguir direto para o resumo
      generateSessionSummary();
    }
  };

  const generateSessionSummary = async () => {
    try {
      // Usar dados do dashboard ativo (stats) conforme solicitado
      const summaryData = {
        volume: stats.registros, // Inclui todos os torneios registrados (finalizados + em andamento)
        invested: stats.totalInvestido,
        profit: stats.profit, // Usar profit do dashboard
        roi: stats.roi, // Usar ROI do dashboard
        fts: stats.fts,
        wins: stats.cravadas,
        bestResult: null, // Manter como null por enquanto
        mentalAverages: {
          focus: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.foco, 0) / breakFeedbacks.length : 0,
          energy: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.energia, 0) / breakFeedbacks.length : 0,
          confidence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.confianca, 0) / breakFeedbacks.length : 0,
          emotionalIntelligence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.inteligenciaEmocional, 0) / breakFeedbacks.length : 0,
          interference: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.interferencias, 0) / breakFeedbacks.length : 0,
        },
        objectiveStatus: stats.profit > 0 ? 'completed' : (stats.profit > -stats.totalInvestido * 0.5 ? 'partial' : 'missed'),
        sessionTime: sessionElapsedTime,
        objectives: activeSession?.dailyGoals || '',
        quickNotes: quickNotes, // Incluir notas rápidas da sessão
        endTime: new Date().toISOString()
      };
      
      console.log('generateSessionSummary - Summary data:', summaryData);
      setSessionSummaryData(summaryData);
      setShowSessionSummary(true);
      
    } catch (error) {
      console.error('Erro ao gerar resumo:', error);
      toast({
        title: "Erro ao Gerar Resumo",
        description: "Não foi possível gerar o resumo da sessão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleForceEndSession = async () => {
    try {
      // Finalizar todos os torneios pendentes automaticamente
      const allTournaments = [
        ...(plannedTournaments || []).map(t => ({ ...t, id: `planned-${t.id}` })),
        ...(sessionTournaments || [])
      ];
      
      const organized = organizeTournaments(allTournaments);
      const pendingTournamentList = organized.registered?.filter(t => t.status === 'registered') || [];
      
      console.log('handleForceEndSession - Finalizing tournaments:', pendingTournamentList.length);
      
      for (const tournament of pendingTournamentList) {
        await updateTournamentMutation.mutateAsync({
          id: tournament.id,
          data: {
            status: 'finished',
            endTime: new Date().toISOString(),
            result: '0',
            bounty: '0',
            position: null
          }
        });
      }
      
      setShowConfirmationModal(false);
      
      // Aguardar atualização dos dados e gerar resumo
      setTimeout(() => {
        generateSessionSummary();
      }, 1000);
      
    } catch (error) {
      console.error('Erro ao finalizar torneios:', error);
      toast({
        title: "Erro ao Finalizar Torneios",
        description: "Não foi possível finalizar os torneios pendentes. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleEndSession = async () => {
    try {
      // Usar os dados do resumo da sessão que foram gerados
      const sessionData = sessionSummaryData || {
        volume: dashboardStats.registros,
        invested: dashboardStats.totalInvestido,
        profit: dashboardStats.profit,
        roi: dashboardStats.roi,
        fts: dashboardStats.fts,
        wins: dashboardStats.cravadas,
        mentalAverages: {
          focus: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.foco, 0) / breakFeedbacks.length : 0,
          energy: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.energia, 0) / breakFeedbacks.length : 0,
          confidence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.confianca, 0) / breakFeedbacks.length : 0,
          emotionalIntelligence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.inteligenciaEmocional, 0) / breakFeedbacks.length : 0,
          interference: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum, b) => sum + b.interferencias, 0) / breakFeedbacks.length : 0,
        }
      };

      console.log('Final session data being sent:', sessionData);
      
      // Finalizar a sessão no servidor com os dados corretos
      await apiRequest('PUT', `/api/grind-sessions/${activeSession.id}`, {
        status: 'completed',
        endTime: new Date().toISOString(),
        finalNotes: finalNotes || '',
        objectiveCompleted: sessionData.objectiveStatus === 'completed',
        // Salvar estatísticas corretas
        volume: sessionData.volume,
        profit: sessionData.profit.toString(),
        abiMed: sessionData.invested > 0 ? (sessionData.invested / sessionData.volume).toString() : '0',
        roi: sessionData.roi.toString(),
        fts: sessionData.fts,
        cravadas: sessionData.wins,
        // Salvar médias mentais
        energiaMedia: sessionData.mentalAverages.energy.toString(),
        focoMedio: sessionData.mentalAverages.focus.toString(),
        confiancaMedia: sessionData.mentalAverages.confidence.toString(),
        inteligenciaEmocionalMedia: sessionData.mentalAverages.emotionalIntelligence.toString(),
        interferenciasMedia: sessionData.mentalAverages.interference.toString(),
      });
      
      console.log('Ending session with data:', sessionData);
      
      // Limpar notas rápidas da sessão finalizada
      setQuickNotes([]);
      sessionStorage.removeItem('grind-quick-notes');
      sessionStorage.removeItem('grind-session-quick-notes');
      sessionStorage.removeItem('grindSessionQuickNotes');
      
      // Redirecionar para histórico
      window.location.href = '/grind-session';
      
    } catch (error) {
      console.error('Erro ao finalizar sessão:', error);
    }
  };

  const handleContinueSession = () => {
    setShowSessionSummary(false);
    setSessionSummaryData(null);
    setFinalNotes('');
    setShowConfirmationModal(false);
    setPendingTournaments([]);
  };

  const handleCloseConfirmationModal = () => {
    setShowConfirmationModal(false);
    setPendingTournaments([]);
  };

  // Save dashboard visibility to localStorage
  useEffect(() => {
    localStorage.setItem('grindSessionDashboardVisible', JSON.stringify(showDashboard));
  }, [showDashboard]);

  // Load quick notes from sessionStorage on component mount
  useEffect(() => {
    const savedNotes = sessionStorage.getItem('grindSessionQuickNotes');
    if (savedNotes) {
      try {
        const parsedNotes = JSON.parse(savedNotes);
        setQuickNotes(parsedNotes);
      } catch (error) {
        console.error('Error parsing saved quick notes:', error);
      }
    }
  }, []);

  // Save quick notes to sessionStorage
  useEffect(() => {
    if (quickNotes.length > 0) {
      sessionStorage.setItem('grindSessionQuickNotes', JSON.stringify(quickNotes));
    } else {
      // Remove do sessionStorage se não há notas
      sessionStorage.removeItem('grindSessionQuickNotes');
    }
  }, [quickNotes]);

  // Timer for session elapsed time
  useEffect(() => {
    if (activeSession) {
      const updateElapsedTime = () => {
        const sessionStart = new Date(activeSession.date);
        const now = new Date();
        const diffMs = now.getTime() - sessionStart.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setSessionElapsedTime(`${hours}h ${minutes}m`);
      };

      updateElapsedTime();
      const interval = setInterval(updateElapsedTime, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [activeSession]);

  // Get session color and message based on elapsed time
  const getSessionTimeInfo = () => {
    if (!activeSession) return { color: 'text-gray-400', bgColor: 'bg-gray-700', message: '' };
    
    const sessionStart = new Date(activeSession.date);
    const now = new Date();
    const diffMs = now.getTime() - sessionStart.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    
    if (hours < 2) {
      return {
        color: 'text-green-300',
        bgColor: 'bg-green-600/20 border-green-500/50',
        message: '🚀 O dia tá só começando, pra cima!'
      };
    } else if (hours < 4) {
      return {
        color: 'text-green-400',
        bgColor: 'bg-green-700/20 border-green-600/50',
        message: '💪 Se mantenha inabalável, ainda estamos no começo!'
      };
    } else if (hours < 6) {
      return {
        color: 'text-yellow-300',
        bgColor: 'bg-yellow-600/20 border-yellow-500/50',
        message: '🔄 Reboot mental recomendado!'
      };
    } else if (hours < 8) {
      return {
        color: 'text-red-300',
        bgColor: 'bg-red-500/20 border-red-400/50',
        message: '🔥 Aqui separa os homens dos meninos!'
      };
    } else {
      return {
        color: 'text-red-400',
        bgColor: 'bg-red-600/20 border-red-500/50',
        message: '⚡ É aqui que muitos regs viram fish! Mantenha o foco!'
      };
    }
  };

  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const currentDayOfWeek = new Date().getDay();

  // Fetch active session
  const { data: sessions } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      return await apiRequest('GET', "/api/grind-sessions");
    },
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache at all
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // Fetch planned tournaments for today
  const { data: plannedTournaments, refetch: refetchTournaments } = useQuery({
    queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek],
    queryFn: async () => {
      console.log('🔍 FRONTEND - Fetching tournaments for dayOfWeek:', currentDayOfWeek);
      const data = await apiRequest('GET', `/api/session-tournaments/by-day/${currentDayOfWeek}`);
      console.log('🔍 FRONTEND - Raw tournament data from API:', data);
      console.log('🔍 FRONTEND - Tournament count:', data?.length || 0);
      console.log('🔍 FRONTEND - First tournament sample:', data?.[0] || 'none');
      return data;
    },
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache at all
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // Fetch session tournaments
  const { data: sessionTournaments, refetch: refetchSessionTournaments } = useQuery({
    queryKey: ["/api/session-tournaments", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      
      console.log('🔍 DEBUG - Fetching session tournaments for sessionId:', activeSession.id);
      console.log('🔍 DEBUG - Active session object:', activeSession);
      
      const data = await apiRequest('GET', `/api/session-tournaments?sessionId=${activeSession.id}`);
      
      console.log('🔍 DEBUG - Session tournaments data:', data);
      console.log('🔍 DEBUG - Session tournaments count:', data.length);
      
      return data;
    },
    enabled: !!activeSession?.id,
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache at all
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // ===== ETAPA 2: BUSCAR TORNEIOS DA GRADE SEMANAL PARA SUGESTÕES =====
  const { data: weeklySuggestions = [] } = useQuery({
    queryKey: ["/api/session-tournaments/weekly-suggestions"],
    queryFn: async () => {
      const data = await apiRequest('GET', "/api/session-tournaments/weekly-suggestions");
      return data;
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // ===== ETAPA 2/3: LÓGICA DE FILTRAGEM INTELIGENTE EM TEMPO REAL =====
  const getFilteredSuggestions = () => {
    if (!weeklySuggestions || weeklySuggestions.length === 0) return [];
    
    // Aplicar filtros baseados nos campos do formulário
    let filtered = weeklySuggestions.filter(suggestion => {
      // Filtro por Site
      if (newTournament.site && newTournament.site !== suggestion.site) {
        return false;
      }
      
      // Filtro por Tipo
      if (newTournament.type && newTournament.type !== suggestion.type) {
        return false;
      }
      
      // Filtro por Velocidade
      if (newTournament.speed && newTournament.speed !== suggestion.speed) {
        return false;
      }
      
      // Filtro por Buy-in (range de ±20%)
      if (newTournament.buyIn && newTournament.buyIn !== '') {
        const formBuyIn = parseFloat(newTournament.buyIn);
        const suggestionBuyIn = parseFloat(suggestion.buyIn);
        
        if (!isNaN(formBuyIn) && !isNaN(suggestionBuyIn)) {
          const tolerance = formBuyIn * 0.2; // 20% tolerance
          if (Math.abs(formBuyIn - suggestionBuyIn) > tolerance) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    // Ordenar por frequência (mais usado primeiro)
    filtered.sort((a, b) => b.frequency - a.frequency);
    
    // Limitar a 6 sugestões
    return filtered.slice(0, 6);
  };

  // ===== ETAPA 3: FUNÇÃO PARA RESET DE FILTROS =====
  const resetFilters = () => {
    setNewTournament({
      site: "",
      name: "",
      buyIn: "",
      type: "Vanilla",
      speed: "Normal",
      scheduledTime: "",
      fieldSize: "",
      rebuys: 0,
      result: "0",
      position: null,
      status: "upcoming"
    });
    
    toast({
      title: "Filtros Limpos",
      description: "Todos os campos foram resetados",
    });
  };

  // ===== ETAPA 3: FUNÇÃO PARA VERIFICAR SE HÁ FILTROS ATIVOS =====
  const hasActiveFilters = () => {
    return !!(newTournament.site || 
              newTournament.type !== "Vanilla" || 
              newTournament.speed !== "Normal" || 
              newTournament.buyIn);
  };

  // ===== ETAPA 4: FUNÇÃO PARA APLICAR FILTRO RÁPIDO =====
  const applyQuickFilter = (filterType: string, value: string) => {
    setNewTournament(prev => ({
      ...prev,
      [filterType]: value
    }));
    
    toast({
      title: "Filtro Aplicado",
      description: `Filtrado por ${filterType}: ${value}`,
    });
  };

  // ===== ETAPA 4: FUNÇÃO PARA OBTER ESTATÍSTICAS DAS SUGESTÕES =====
  const getSuggestionStats = () => {
    const total = weeklySuggestions.length;
    const filtered = getFilteredSuggestions().length;
    const sites = new Set(weeklySuggestions.map(s => s.site)).size;
    const types = new Set(weeklySuggestions.map(s => s.type)).size;
    
    return { total, filtered, sites, types };
  };

  // ===== ETAPA 5: FUNÇÃO PARA PREVER POPULARIDADE =====
  const getPredictedPopularity = (suggestion: any) => {
    const maxFrequency = Math.max(...weeklySuggestions.map(s => s.frequency));
    const percentage = (suggestion.frequency / maxFrequency) * 100;
    
    if (percentage >= 80) return { level: 'Muito Popular', color: 'text-emerald-400', icon: '🔥' };
    if (percentage >= 60) return { level: 'Popular', color: 'text-yellow-400', icon: '⭐' };
    if (percentage >= 40) return { level: 'Comum', color: 'text-blue-400', icon: '📊' };
    return { level: 'Pouco Usado', color: 'text-gray-400', icon: '📉' };
  };

  // ===== ETAPA 5: FUNÇÃO PARA SIMILARIDADE COM FORMULÁRIO =====
  const getSimilarityScore = (suggestion: any) => {
    let score = 0;
    if (newTournament.site === suggestion.site) score += 25;
    if (newTournament.type === suggestion.type) score += 25;
    if (newTournament.speed === suggestion.speed) score += 25;
    if (newTournament.buyIn && Math.abs(parseFloat(newTournament.buyIn) - parseFloat(suggestion.buyIn)) <= 5) score += 25;
    
    return score;
  };

  // ===== ETAPA 2: FUNÇÃO PARA APLICAR SUGESTÃO =====
  const applySuggestion = (suggestion: any) => {
    setNewTournament(prev => ({
      ...prev,
      site: suggestion.site,
      type: suggestion.type,
      speed: suggestion.speed,
      buyIn: suggestion.buyIn,
      fieldSize: suggestion.guaranteed || prev.fieldSize,
      scheduledTime: suggestion.time || prev.scheduledTime,
      name: '' // Deixar vazio para gerar automaticamente
    }));
    
    toast({
      title: "Sugestão Aplicada",
      description: `${suggestion.site} ${suggestion.type} $${suggestion.buyIn} ${suggestion.speed}`,
    });
  };

  // Query for break feedbacks during the active session
  const { data: breakFeedbacks = [] } = useQuery({
    queryKey: [`/api/break-feedbacks`, activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const response = await fetch(`/api/break-feedbacks?sessionId=${activeSession.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch break feedbacks");
      return response.json();
    },
    enabled: !!activeSession?.id,
  });

  // Check for active session on load
  useEffect(() => {
    if (sessions) {
      const todaySession = sessions.find((s: GrindSession) => 
        s.status === "active" && 
        new Date(s.date).toDateString() === new Date().toDateString()
      );
      setActiveSession(todaySession || null);
    }
  }, [sessions]);

  // Break timer simulation - show dialog every hour (for demo: every 5 seconds)
  useEffect(() => {
    if (activeSession && !activeSession.skipBreaksToday) {
      const timer = setInterval(() => {
        // Check if it's 14:55 or 15:55 (or every hour for demo)
        const now = new Date();
        const minutes = now.getMinutes();
        const hours = now.getHours();

        // Show break dialog at xx:54 (6 minutes before the hour)
        if (minutes === 54) {
          setShowBreakDialog(true);
        }
      }, 60000); // Check every minute

      return () => clearInterval(timer);
    }
  }, [activeSession]);

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: { preparationNotes: string; preparationPercentage: number; dailyGoals: string; screenCap: number; skipBreaksToday: boolean }) => {
      const sessionData = {
        date: new Date().toISOString(),
        status: "active",
        preparationNotes: data.preparationNotes,
        preparationPercentage: data.preparationPercentage,
        dailyGoals: data.dailyGoals,
        screenCap: data.screenCap,
        skipBreaksToday: data.skipBreaksToday,
        // 🎯 ETAPA 2: Integração com Grade Planner
        resetTournaments: true,
        replaceExisting: true,
        dayOfWeek: new Date().getDay(),
        loadFromGradePlanner: true, // Enable Grade Planner integration
      };
      const response = await apiRequest("POST", "/api/grind-sessions", sessionData);
      return response;
    },
    onSuccess: (session) => {
      setActiveSession(session);
      setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão Iniciada",
        description: "Sua sessão de grind foi iniciada com sucesso!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add tournament mutation with grade sync
  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      console.log('🔥 MUTATION DEBUG - Received tournament data:', tournamentData);
      console.log('🔥 MUTATION DEBUG - syncWithGrade:', tournamentData.syncWithGrade);
      
      if (tournamentData.syncWithGrade) {
        // If sync is enabled, create only in planned tournaments (grade)
        // The system will automatically add it to the session through the existing sync mechanism
        const today = new Date();
        const currentDayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        
        const gradeData = {
          site: tournamentData.site,
          name: tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`,
          buyIn: String(tournamentData.buyIn), // Convert to string as expected by schema
          type: tournamentData.type || 'Vanilla',
          speed: tournamentData.speed || 'Normal',
          time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          guaranteed: tournamentData.guaranteed ? String(tournamentData.guaranteed) : null, // Convert to string
          prioridade: 2, // Default to medium priority
          dayOfWeek: currentDayOfWeek // Add the current day of the week
        };
        
        console.log('Creating tournament in grade with data:', gradeData);
        
        const createdPlannedTournament = await apiRequest("POST", "/api/planned-tournaments", gradeData);
        console.log('Tournament successfully created in grade:', createdPlannedTournament);
        
        return createdPlannedTournament;
      } else {
        // If sync is disabled, create only in session tournaments
        const data = {
          userId: activeSession?.userId,
          sessionId: activeSession?.id,
          site: tournamentData.site,
          name: tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`,
          buyIn: tournamentData.buyIn,
          rebuys: 0,
          result: "0",
          bounty: "0",
          status: "upcoming",
          fromPlannedTournament: false,
          fieldSize: tournamentData.fieldSize ? parseInt(tournamentData.fieldSize) : null,
          position: null,
          startTime: null,
          endTime: null,
          time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: tournamentData.type || 'Vanilla',
          speed: tournamentData.speed || 'Normal',
          guaranteed: tournamentData.guaranteed || null
        };
        
        console.log('Creating session-only tournament with data:', data);
        const createdTournament = await apiRequest("POST", "/api/session-tournaments", data);
        console.log('Tournament successfully created in session:', createdTournament);
        
        return createdTournament;
      }
    },
    onSuccess: () => {
      // Force immediate UI update with aggressive cache invalidation
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      
      // Force refresh the current day data
      const currentDayOfWeek = new Date().getDay();
      queryClient.removeQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      
      // If sync with grade is enabled, also invalidate grade queries
      if (syncWithGrade) {
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments/by-day"] });
      }
      
      // Force immediate refetch with multiple attempts
      refetchTournaments();
      setTimeout(() => {
        refetchTournaments();
      }, 50);
      setTimeout(() => {
        refetchTournaments();
      }, 150);
      
      setShowAddTournamentDialog(false);
      setNewTournament({
        site: "",
        name: "",
        buyIn: "",
        type: "Vanilla",
        speed: "Normal",
        scheduledTime: "",
        fieldSize: "",
        rebuys: 0,
        result: "0",
        position: null,
        status: "upcoming"
      });
      
      const successMessage = syncWithGrade 
        ? "Torneio adicionado à sessão e sincronizado com a Grade!" 
        : "Torneio adicionado à sessão com sucesso!";
      
      toast({
        title: "Torneio Adicionado",
        description: successMessage,
      });
    },
    onError: (error: any) => {
      console.error('Failed to create tournament:', error);
      toast({
        title: "Erro ao Adicionar Torneio",
        description: error.message || "Falha ao adicionar torneio à sessão",
        variant: "destructive",
      });
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      console.log('Update mutation called with:', { id, data });
      
      // Determine endpoint based on ID prefix
      let endpoint;
      let apiId;
      
      if (id.startsWith('planned-')) {
        // For planned tournaments, use the actual ID without prefix
        apiId = id.substring(8); // Remove 'planned-' prefix
        endpoint = `/api/planned-tournaments/${apiId}`;
      } else {
        // For session tournaments, use the ID as-is
        apiId = id;
        endpoint = `/api/session-tournaments/${apiId}`;
      }

      console.log('Making API call to:', endpoint, 'with data:', data);
      const result = await apiRequest("PUT", endpoint, data);
      console.log('API response:', result);
      return result;
    },
    onSuccess: (result, variables) => {
      console.log('Update successful:', result);
      
      // Force immediate UI update with aggressive cache invalidation
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      
      // CRITICAL: Invalidate the specific session tournaments query that stats depends on
      if (activeSession?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments", activeSession.id] });
        queryClient.removeQueries({ queryKey: ["/api/session-tournaments", activeSession.id] });
        // Force immediate refetch of session tournaments
        refetchSessionTournaments();
      }
      
      // Force refresh the current day data immediately
      const currentDayOfWeek = new Date().getDay();
      queryClient.removeQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      
      // Force immediate refetch with multiple attempts
      refetchTournaments();
      setTimeout(() => {
        refetchTournaments();
        if (activeSession?.id) {
          refetchSessionTournaments();
        }
      }, 50);
      setTimeout(() => {
        refetchTournaments();
        if (activeSession?.id) {
          refetchSessionTournaments();
        }
      }, 150);
      
      // Force re-calculation of stats by invalidating all dependent data
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      
      toast({
        title: "Torneio Atualizado",
        description: "Status do torneio atualizado com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error('Update failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });
      
      let errorMessage = "Falha ao atualizar torneio";
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      toast({
        title: "Erro ao Atualizar Torneio",
        description: errorMessage,
        variant: "destructive"
      });
    },
  });

  // Break feedback mutation
  const breakFeedbackMutation = useMutation({
    mutationFn: async (feedback: any) => {
      const data = {
        ...feedback,
        sessionId: activeSession?.id,
        breakTime: new Date().toISOString(),
      };
      const response = await fetch("/api/break-feedbacks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to save break feedback");
      }
      return response.json();
    },
    onSuccess: () => {
      setShowBreakDialog(false);
      setBreakFeedback({
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: ""
      });
      // Invalidate break feedbacks query to refresh the data
      queryClient.invalidateQueries({ queryKey: [`/api/break-feedbacks`, activeSession?.id] });
      toast({
        title: "Feedback Registrado",
        description: "Seu feedback do break foi registrado!",
      });
    },
  });

  // Function to check for pending tournaments
  const checkPendingTournaments = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];
    
    console.log('checkPendingTournaments - All tournaments:', allTournaments.map(t => ({
      id: t.id,
      status: t.status,
      result: t.result,
      name: t.name
    })));
    
    // Find tournaments with status "registered" that don't have results (or result is 0)
    // Only consider tournaments that are truly in progress and need completion
    const pending = allTournaments.filter(t => {
      const isRegistered = t.status === 'registered';
      const hasNoResult = !t.result || t.result === '0' || t.result === '';
      const hasNoPosition = !t.position || t.position === null;
      const isActuallyPending = isRegistered && hasNoResult && hasNoPosition;
      
      console.log(`Tournament ${t.id}: status=${t.status}, result="${t.result}", position=${t.position}, isPending=${isActuallyPending}`);
      return isActuallyPending;
    });
    
    console.log('checkPendingTournaments - Pending tournaments found:', pending.length);
    
    return pending;
  };

  // Function to finalize pending tournaments automatically
  const finalizePendingTournamentsMutation = useMutation({
    mutationFn: async (pendingTournaments: any[]) => {
      const promises = pendingTournaments.map(tournament => {
        const endpoint = tournament.id.startsWith('planned-') 
          ? `/api/planned-tournaments/${tournament.id.substring(8)}`
          : `/api/session-tournaments/${tournament.id}`;
        
        return apiRequest(endpoint, {
          method: "PUT",
          body: JSON.stringify({
            status: "completed",
            result: "0", // No prize
            bounty: "0", // No bounty
            endTime: new Date().toISOString(),
            position: null // Can remain empty
          }),
        });
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      // Refresh tournament data
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      
      toast({
        title: "Torneios Finalizados",
        description: "Torneios pendentes foram marcados como GG! automaticamente.",
      });
      
      // Now actually end the session
      endSessionMutation.mutate();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Finalizar Torneios",
        description: "Não foi possível finalizar os torneios pendentes. Tente novamente.",
        variant: "destructive",
      });
    }
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const finalStats = calculateFinalSessionStats();
      const breakAverages = calculateBreakAverages();
      
      const response = await apiRequest("PUT", `/api/grind-sessions/${activeSession?.id}`, {
        status: "completed",
        endTime: new Date().toISOString(),
        objectiveCompleted: sessionObjectiveCompleted,
        finalNotes: sessionFinalNotes,
        // Include final statistics (convert numbers to strings for schema compatibility)
        volume: finalStats.volume,
        profit: finalStats.profit.toString(),
        abiMed: finalStats.abiMed.toString(),
        roi: finalStats.roi.toString(),
        fts: finalStats.fts,
        cravadas: finalStats.cravadas,
        // Include break averages (convert numbers to strings for schema compatibility)
        energiaMedia: breakAverages.energia.toString(),
        focoMedio: breakAverages.foco.toString(),
        confiancaMedia: breakAverages.confianca.toString(),
        inteligenciaEmocionalMedia: breakAverages.inteligenciaEmocional.toString(),
        interferenciasMedia: breakAverages.interferencias.toString(),
        // Include tournament type and speed percentages (as strings for decimal fields)
        vanillaPercentage: finalStats.percentages.types.vanilla.toString(),
        pkoPercentage: finalStats.percentages.types.pko.toString(),
        mysteryPercentage: finalStats.percentages.types.mystery.toString(),
        normalSpeedPercentage: finalStats.percentages.speeds.normal.toString(),
        turboSpeedPercentage: finalStats.percentages.speeds.turbo.toString(),
        hyperSpeedPercentage: finalStats.percentages.speeds.hyper.toString(),
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Sessão Finalizada!",
        description: "Sua sessão foi concluída com sucesso. Redirecionando para o histórico...",
      });
      
      // Invalidate queries to refresh data and clear cache
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.removeQueries({ queryKey: ["/api/grind-sessions"] }); // Force cache removal
      
      // Clear session summary state
      setShowSessionSummary(false);
      
      // Redirect to grind history page
      setTimeout(() => {
        setLocation("/grind");
      }, 1000);
    },
  });

  // Function to handle session finalization with validation (using ETAPA 10 implementation)

  // Quick Notes functions
  const handleAddQuickNote = () => {
    if (!quickNoteText.trim()) return;
    
    const newNote = {
      id: Date.now().toString(),
      text: quickNoteText.trim(),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    
    const updatedNotes = [...quickNotes, newNote];
    setQuickNotes(updatedNotes);
    
    // Save to sessionStorage
    sessionStorage.setItem('grind-quick-notes', JSON.stringify(updatedNotes));
    
    // Clear form and close dialog
    setQuickNoteText("");
    setShowQuickNotesDialog(false);
    
    toast({
      title: "Nota Salva!",
      description: "Sua anotação foi capturada com sucesso.",
    });
  };

  const handleCopyAllNotes = () => {
    if (quickNotes.length === 0) return;
    
    const notesText = quickNotes.map(note => `${note.timestamp} - ${note.text}`).join('\n\n');
    navigator.clipboard.writeText(notesText);
    
    toast({
      title: "Notas Copiadas!",
      description: `${quickNotes.length} anotação${quickNotes.length > 1 ? 'ões' : ''} copiada${quickNotes.length > 1 ? 's' : ''} para a área de transferência.`,
    });
  };

  // Load notes from sessionStorage on component mount
  useEffect(() => {
    const savedNotes = sessionStorage.getItem('grind-quick-notes');
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes);
        setQuickNotes(parsed);
      } catch (error) {
        console.error('Error loading saved notes:', error);
      }
    }
  }, []);

  const handleStartSession = async () => {
    console.log('Starting new session - resetting all tournaments...');
    
    try {
      // Reset all tournaments using dedicated API
      const response = await fetch('/api/grind-sessions/reset-tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.error('Failed to reset tournaments');
      } else {
        console.log('Successfully reset all tournaments to upcoming status');
        
        // Force refresh data after reset
        queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      }
    } catch (error) {
      console.error('Error resetting tournaments:', error);
    }
    
    // Clear previous session's quick notes from both state and sessionStorage
    setQuickNotes([]);
    sessionStorage.removeItem('grind-quick-notes');
    sessionStorage.removeItem('grind-session-quick-notes');
    sessionStorage.removeItem('grindSessionQuickNotes');
    
    startSessionMutation.mutate({
      preparationNotes: preparationObservations,
      preparationPercentage,
      dailyGoals,
      screenCap,
      skipBreaksToday,
    });
  };

  const handleUpdateTournament = (tournament: any, field: string, value: any) => {
    console.log('handleUpdateTournament called with:', { id: tournament.id, field, value, currentRebuys: tournament.rebuys });
    
    // Handle rebuys increment correctly
    if (field === 'rebuys') {
      value = (tournament.rebuys || 0) + 1;
      console.log('Incrementing rebuys to:', value);
    }
    
    // Ensure proper data format
    const updateData = { [field]: value };
    
    // Handle special cases for data transformation
    if (field === 'position' && value !== null) {
      updateData[field] = parseInt(String(value)) || null;
    } else if (field === 'result' || field === 'bounty') {
      updateData[field] = String(value || '0');
    }
    
    console.log('Final update data:', updateData);
    
    updateTournamentMutation.mutate({
      id: tournament.id,
      data: updateData,
    });
  };

  // Sistema de cores para feedback visual de rebuys:
  // 0 rebuys: Green (verde) - Estado inicial
  // 1 rebuy: Yellow (amarelo) - Atenção
  // 2+ rebuys: Red (vermelho) - Alerta
  const handleRebuyTournament = (tournament: any) => {
    console.log('Rebuy tournament called for:', tournament.id, 'Current rebuys:', tournament.rebuys);
    handleUpdateTournament(tournament, 'rebuys', (tournament.rebuys || 0) + 1);
  };

  const handleUpdatePriority = (tournamentId: string, newPriority: number) => {
    console.log('Updating priority for tournament:', tournamentId, 'New priority:', newPriority);
    
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { prioridade: newPriority }
    }, {
      onSuccess: () => {
        console.log('Priority update successful for tournament:', tournamentId);
        setEditingPriority(null);
        toast({
          title: "Prioridade Atualizada",
          description: `Prioridade alterada para ${getPrioridadeLabel(newPriority)}`,
        });
      },
      onError: (error: any) => {
        console.error('Priority update failed:', error);
        setEditingPriority(null);
        toast({
          title: "Erro ao Atualizar Prioridade",
          description: "Não foi possível alterar a prioridade do torneio",
          variant: "destructive",
        });
      }
    });
  };

  const handlePriorityClick = (tournamentId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Priority badge clicked for tournament:', tournamentId);
    setEditingPriority(tournamentId);
  };

  // AJUSTE 1: Função para editar horário do torneio
  const handleEditTime = (tournamentId: string) => {
    console.log('DEBUG: handleEditTime called with tournamentId:', tournamentId);
    
    // Buscar o torneio tanto em sessionTournaments quanto na lista combinada
    let tournament = sessionTournaments?.find(t => t.id === tournamentId);
    
    // Se não encontrou nos sessionTournaments, buscar nos plannedTournaments
    if (!tournament && tournamentId.startsWith('planned-')) {
      const actualId = tournamentId.substring(8); // Remove prefixo planned-
      tournament = plannedTournaments?.find(t => t.id === actualId);
      if (tournament) {
        // Usar os dados do planned tournament mas manter o ID com prefixo
        tournament = { ...tournament, id: tournamentId };
      }
    }
    
    console.log('DEBUG: Tournament found:', tournament);
    if (tournament) {
      console.log('DEBUG: Setting time edit value and opening dialog');
      setTimeEditValue({
        ...timeEditValue,
        [tournamentId]: tournament.time || '20:00'
      });
      setEditingTimeDialog({
        ...editingTimeDialog,
        [tournamentId]: true
      });
      console.log('DEBUG: Dialog state updated');
    } else {
      console.log('DEBUG: Tournament not found in both arrays');
      console.log('Available sessionTournaments:', sessionTournaments?.map(t => t.id));
      console.log('Available plannedTournaments:', plannedTournaments?.map(t => t.id));
    }
  };

  const handleSaveTime = (tournamentId: string) => {
    const newTime = timeEditValue[tournamentId];
    if (newTime && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) {
      updateTournamentMutation.mutate({
        id: tournamentId,
        data: { time: newTime }
      });
      setEditingTimeDialog({
        ...editingTimeDialog,
        [tournamentId]: false
      });
      toast({
        title: "Horário atualizado",
        description: `Horário alterado para ${newTime}`,
      });
    } else {
      toast({
        title: "Erro",
        description: "Formato inválido. Use HH:MM (ex: 20:30)",
        variant: "destructive"
      });
    }
  };

  // Função auxiliar para adicionar/remover minutos
  const adjustTournamentTime = (tournamentId: string, minutesToAdd: number, autoClose: boolean = false) => {
    let tournament = sessionTournaments?.find(t => t.id === tournamentId);
    
    if (!tournament && tournamentId.startsWith('planned-')) {
      const actualId = tournamentId.substring(8);
      tournament = plannedTournaments?.find(t => t.id === actualId);
    }
    
    if (tournament) {
      const currentTime = tournament.time || '20:00';
      if (!currentTime || typeof currentTime !== 'string') {
        console.warn('Invalid time format for tournament:', tournament);
        return;
      }
      const [hours, minutes] = currentTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + minutesToAdd;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMinutes = totalMinutes % 60;
      
      const newTime = `${newHours.toString().padStart(2, '0')}:${Math.abs(newMinutes).toString().padStart(2, '0')}`;
      
      updateTournamentMutation.mutate({
        id: tournamentId,
        data: { time: newTime }
      });
      
      // Atualizar o estado local também
      setTimeEditValue({
        ...timeEditValue,
        [tournamentId]: newTime
      });
      
      if (autoClose) {
        setEditingTimeDialog({
          ...editingTimeDialog,
          [tournamentId]: false
        });
      }
      
      const action = minutesToAdd > 0 ? `+${minutesToAdd}` : `${minutesToAdd}`;
      toast({
        title: `${action} minutos aplicados`,
        description: `Horário alterado para ${newTime}`,
      });
    } else {
      toast({
        title: "Erro",
        description: "Torneio não encontrado",
        variant: "destructive"
      });
    }
  };

  // Função para definir horários fixos
  const setFixedTime = (tournamentId: string, timeType: 'now' | 'next-hour' | 'plus-30') => {
    const now = new Date();
    let targetTime: string;
    
    switch (timeType) {
      case 'now':
        targetTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        break;
      case 'next-hour':
        targetTime = `${(now.getHours() + 1).toString().padStart(2, '0')}:00`;
        break;
      case 'plus-30':
        const plus30 = new Date(now.getTime() + 30 * 60000);
        targetTime = `${plus30.getHours().toString().padStart(2, '0')}:${plus30.getMinutes().toString().padStart(2, '0')}`;
        break;
      default:
        return;
    }
    
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { time: targetTime }
    });
    
    setTimeEditValue({
      ...timeEditValue,
      [tournamentId]: targetTime
    });
    
    setEditingTimeDialog({
      ...editingTimeDialog,
      [tournamentId]: false
    });
    
    const labels = {
      'now': 'Agora',
      'next-hour': 'Próxima hora',
      'plus-30': 'Em 30 minutos'
    };
    
    toast({
      title: `Horário definido: ${labels[timeType]}`,
      description: `Horário alterado para ${targetTime}`,
    });
  };

  const handleAdd15Minutes = (tournamentId: string) => {
    adjustTournamentTime(tournamentId, 15, true);
  };

  // Função para calcular diferença de tempo
  const getTimeDifference = (targetTime: string) => {
    const now = new Date();
    const [hours, minutes] = targetTime.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    
    const diffMs = target.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 0) {
      return `${Math.abs(diffMinutes)} minutos atrás`;
    } else if (diffMinutes === 0) {
      return 'Agora';
    } else {
      return `Em ${diffMinutes} minutos`;
    }
  };

  // Close priority editing when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingPriority && !(event.target as Element).closest('.priority-select')) {
        console.log('Clicking outside priority selector, closing edit mode');
        setEditingPriority(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingPriority]);

  // Functions to organize tournaments by status
  const organizeTournaments = (tournaments: any[] = []) => {
    console.log('🔍 ORGANIZE DEBUG - Input tournaments:', tournaments);
    console.log('🔍 ORGANIZE DEBUG - Tournament count:', tournaments.length);
    
    // Filter out deleted tournaments and prevent duplicates by ID
    const uniqueTournaments = new Map();
    
    tournaments.forEach(tournament => {
      if (tournament.status !== 'deleted') {
        // Use tournament ID as key to prevent duplicates
        const key = tournament.id;
        if (!uniqueTournaments.has(key)) {
          uniqueTournaments.set(key, tournament);
        }
      }
    });
    
    const activeTournaments = Array.from(uniqueTournaments.values());
    console.log('🔍 ORGANIZE DEBUG - Active tournaments:', activeTournaments);
    
    const upcoming = activeTournaments.filter(t => 
      t.status === 'upcoming' || (!t.status && t.time)
    ).sort((a, b) => {
      // Sort by priority first (1-Alta, 2-Média, 3-Baixa)
      const priorityA = a.prioridade || 2;
      const priorityB = b.prioridade || 2;
      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Lower number = higher priority
      }
      // Then sort by time
      return parseTime(a.time) - parseTime(b.time);
    });

    const registered = activeTournaments.filter(t => 
      t.status === 'registered'
    ).sort((a, b) => {
      // Sort registered tournaments by priority as well
      const priorityA = a.prioridade || 2;
      const priorityB = b.prioridade || 2;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return parseTime(a.time) - parseTime(b.time);
    });

    const completed = activeTournaments.filter(t => 
      t.status === 'completed' || t.status === 'finished'
    );

    console.log('🔍 ORGANIZE DEBUG - Results:', {
      upcoming: upcoming.length,
      registered: registered.length,
      completed: completed.length
    });

    return { registered, upcoming, completed };
  };

  // Function to organize tournaments by break times
  const organizeTournamentsByBreaks = (tournaments: any[]) => {
    if (!tournaments || tournaments.length === 0) return [];
    
    const breakMap = new Map<string, any[]>();
    
    tournaments.forEach(tournament => {
      if (!tournament.time) return;
      
      const [hour, minute] = tournament.time.split(':').map(Number);
      const breakHour = hour;
      const breakTime = `${breakHour.toString().padStart(2, '0')}:55`;
      
      if (!breakMap.has(breakTime)) {
        breakMap.set(breakTime, []);
      }
      breakMap.get(breakTime)?.push(tournament);
    });
    
    // Convert to array and sort by break time
    const breakBlocks = Array.from(breakMap.entries())
      .map(([breakTime, tournaments]) => ({
        breakTime,
        tournaments: tournaments.sort((a, b) => {
          const timeA = a.time || '00:00';
          const timeB = b.time || '00:00';
          return timeA.localeCompare(timeB);
        })
      }))
      .sort((a, b) => a.breakTime.localeCompare(b.breakTime));
    
    return breakBlocks;
  };

  const parseTime = (timeStr: string): number => {
    if (!timeStr || typeof timeStr !== 'string') {
      return 0; // Default to 00:00 if no time provided
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (timeStr: string): string => {
    return timeStr;
  };

  // Function to group tournaments by break blocks
  const groupTournamentsByBreakBlocks = (tournaments: any[]) => {
    if (!tournaments || tournaments.length === 0) return [];
    
    // Sort tournaments by time
    const sortedTournaments = tournaments.sort((a, b) => {
      const timeA = parseTime(a.time || '20:00');
      const timeB = parseTime(b.time || '20:00');
      return timeA - timeB;
    });
    
    const blocks: { breakTime: string; tournaments: any[] }[] = [];
    let currentBlock: { breakTime: string; tournaments: any[] } | null = null;
    
    sortedTournaments.forEach(tournament => {
      const tournamentTime = parseTime(tournament.time || '20:00');
      
      // Calculate which break block this tournament belongs to
      // Break every 60 minutes, starting at :54
      const breakHour = Math.floor(tournamentTime / 60);
      const breakTime = `${breakHour.toString().padStart(2, '0')}:54`;
      
      // Check if we need to start a new block
      if (!currentBlock || currentBlock.breakTime !== breakTime) {
        currentBlock = { breakTime, tournaments: [] };
        blocks.push(currentBlock);
      }
      
      currentBlock.tournaments.push(tournament);
    });
    
    return blocks;
  };

  const postponeTournament = (tournamentId: string, minutes: number) => {
    const tournament = plannedTournaments?.find((t: any) => t.id === tournamentId);
    if (tournament) {
      const timeStr = tournament.time || '20:00'; // Default time if not provided
      if (!timeStr || typeof timeStr !== 'string') {
        console.warn('Invalid time format for tournament:', tournament);
        return;
      }
      
      const [hours, mins] = timeStr.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + minutes;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMins = totalMinutes % 60;
      const newTime = `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;

      updateTournamentMutation.mutate({
        id: tournamentId,
        data: { time: newTime }
      });
    }
  };

  const handleRegisterTournament = (tournamentId: string) => {
    console.log('Registering tournament:', tournamentId);
    
    // If it's a planned tournament (with planned- prefix), we need to create a session tournament
    if (tournamentId.startsWith('planned-')) {
      const actualId = tournamentId.substring(8); // Remove 'planned-' prefix
      
      // Find the planned tournament data
      const plannedTournament = plannedTournaments?.find(t => t.id === actualId);
      
      if (plannedTournament) {
        console.log('🔄 Creating session tournament from planned tournament:', plannedTournament);
        
        // Create session tournament from planned tournament data
        const sessionTournamentData = {
          sessionId: activeSession?.id || '',
          site: plannedTournament.site,
          name: plannedTournament.name,
          buyIn: plannedTournament.buyIn,
          type: plannedTournament.type,
          speed: plannedTournament.speed,
          time: plannedTournament.time, // PRESERVE TIME FIELD
          guaranteed: plannedTournament.guaranteed,
          status: 'registered',
          startTime: new Date().toISOString(),
          rebuys: 0,
          result: '0',
          bounty: '0',
          position: null,
          fromPlannedTournament: true,
          plannedTournamentId: actualId
        };
        
        console.log('🔄 Session tournament data being created:', sessionTournamentData);
        
        // Create session tournament
        addTournamentMutation.mutate({
          ...sessionTournamentData,
          syncWithGrade: false // Don't sync back to grade since it's already there
        });
        
        return;
      }
    }
    
    // For existing session tournaments, just update the status
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { 
        status: 'registered',
        startTime: new Date().toISOString()
      }
    });
  };

  const handleUnregisterTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { 
        status: 'upcoming',
        result: '0',
        bounty: '0',
        position: null,
        startTime: null,
        endTime: null
      }
    });
    
    // Limpar também os dados de entrada do frontend se existirem
    setRegistrationData(prev => {
      const updated = { ...prev };
      delete updated[tournamentId];
      return updated;
    });
  };

  const handleCompleteTournament = (tournamentId: string, data: any) => {
    const updateData = {
      status: 'finished',
      result: data.prize || '0',  // Prize ITM
      bounty: data.bounty || '0',    // Bounty field
      position: data.position ? parseInt(data.position) : null,
      endTime: new Date().toISOString()
    };

    updateTournamentMutation.mutate({
      id: tournamentId,
      data: updateData
    });

    // Clear registration data for this tournament
    setRegistrationData(prev => {
      const updated = { ...prev };
      delete updated[tournamentId];
      return updated;
    });
  };

  const handleFoldTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { status: 'folded' }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registered":
        return <Badge className="bg-blue-600">Registrado</Badge>;
      case "active":
        return <Badge className="bg-green-600">Ativo</Badge>;
      case "finished":
        return <Badge className="bg-gray-600">Finalizado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSiteColor = (site: string): string => {
    switch (site.toLowerCase()) {
      case 'pokerstars':
        return 'bg-red-600';
      case 'partypoker':
        return 'bg-orange-500';
      case '888poker':
        return 'bg-blue-600';
      case 'ggnetwork':
      case 'ggpoker':
        return 'bg-red-800';
      case 'wpn':
        return 'bg-green-800';
      case 'ipoker':
        return 'bg-orange-600';
      case 'coinpoker':
        return 'bg-pink-500';
      case 'chico':
        return 'bg-white text-black';
      case 'revolution':
        return 'bg-pink-800';
      case 'bodog':
        return 'bg-red-400';
      default:
        return 'bg-gray-600';
    }
  };

  const calculateSessionStats = () => {
    // Use the same deduplication logic as the tournament display
    const combinedTournaments = new Map();
    
    // First, add all session tournaments
    (sessionTournaments || []).forEach(tournament => {
      combinedTournaments.set(tournament.id, tournament);
    });
    
    // Then, add planned tournaments only if they don't have a corresponding session tournament
    (plannedTournaments || []).forEach(tournament => {
      const plannedKey = `planned-${tournament.id}`;
      
      // Check if there's already a session tournament that was created from this planned tournament
      const hasSessionTournament = Array.from(combinedTournaments.values()).some(sessionTournament => 
        sessionTournament.plannedTournamentId === tournament.id ||
        (sessionTournament.fromPlannedTournament && 
         sessionTournament.name === tournament.name && 
         sessionTournament.site === tournament.site && 
         sessionTournament.buyIn === tournament.buyIn &&
         sessionTournament.time === tournament.time)
      );
      
      // Only add if no corresponding session tournament exists
      if (!hasSessionTournament && !combinedTournaments.has(plannedKey)) {
        combinedTournaments.set(plannedKey, {
          ...tournament,
          id: plannedKey,
          status: tournament.status || 'upcoming'
        });
      }
    });
    
    const allTournaments = Array.from(combinedTournaments.values());

    // Log para debug
    console.log('🔍 CALCULAR STATS - plannedTournaments:', plannedTournaments?.length || 0);
    console.log('🔍 CALCULAR STATS - sessionTournaments:', sessionTournaments?.length || 0);
    console.log('🔍 CALCULAR STATS - allTournaments (deduplicated):', allTournaments.length);
    
    if (!allTournaments || allTournaments.length === 0) return { 
      emAndamento: 0,
      registros: 0, 
      reentradas: 0, 
      proximos: 0, 
      concluidos: 0,
      totalInvestido: 0, 
      profit: 0, 
      itm: 0, 
      itmPercent: 0, 
      roi: 0, 
      fts: 0, 
      cravadas: 0, 
      progressao: 0,
      // Tournament type percentages
      vanillaPercentage: 0,
      pkoPercentage: 0,
      mysteryPercentage: 0,
      // Tournament speed percentages
      normalSpeedPercentage: 0,
      turboSpeedPercentage: 0,
      hyperSpeedPercentage: 0,
      // Screen cap information
      screenCap: 10,
      screenCapColors: { bgColor: 'bg-gray-600/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/50' }
    };
    const finishedTournaments = allTournaments.filter((t: any) => t.status === "finished");
    const registeredTournaments = allTournaments.filter((t: any) => t.status === "registered");
    const upcomingTournaments = allTournaments.filter((t: any) => t.status === "upcoming");
    
    const emAndamento = registeredTournaments.length;
    const registros = registeredTournaments.length + finishedTournaments.length;
    const reentradas = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const rebuys = parseInt(t.rebuys) || 0;
      console.log('Tournament', t.id, 'rebuys:', rebuys);
      return sum + rebuys;
    }, 0);
    const proximos = upcomingTournaments.length;
    const concluidos = finishedTournaments.length;
    
    // Todos os torneios da sessão (registrados + finalizados)
    const allSessionTournaments = [...registeredTournaments, ...finishedTournaments];
    
    // Calcular total investido: Buy-in + Rebuys para todos os torneios
    const totalInvestido = allSessionTournaments.reduce((sum: number, t: any) => {
      const buyIn = parseFloat(t.buyIn || '0');
      const rebuys = parseInt(t.rebuys) || 0;
      const invested = buyIn * (1 + rebuys); // Buy-in + (Buy-in * rebuys)
      console.log('Tournament', t.id, 'buyIn:', buyIn, 'rebuys:', rebuys, 'invested:', invested);
      return sum + invested;
    }, 0);
    
    // Calcular total de bounties incluindo registrationData
    const totalBounties = allSessionTournaments.reduce((sum: number, t: any) => {
      // Primeiro verifica se há bounty no registrationData (valores inseridos durante a sessão)
      const tournamentId = t.id;
      const sessionBounty = registrationData[tournamentId]?.bounty;
      
      let bounty = 0;
      if (sessionBounty !== undefined && sessionBounty !== null && sessionBounty !== '') {
        const parsedSessionBounty = parseFloat(sessionBounty);
        if (!isNaN(parsedSessionBounty)) {
          bounty = parsedSessionBounty;
        }
      } else {
        const storedBounty = parseFloat(t.bounty || '0');
        if (!isNaN(storedBounty)) {
          bounty = storedBounty;
        }
      }
      
      console.log('SESSÃO ATIVA - Tournament', t.id, 'bounty (session):', sessionBounty, 'bounty (stored):', t.bounty, 'final bounty:', bounty);
      return sum + bounty;
    }, 0);
    
    // Calcular total de prizes incluindo registrationData
    const totalPrizes = allSessionTournaments.reduce((sum: number, t: any) => {
      // Primeiro verifica se há prize no registrationData (valores inseridos durante a sessão)
      const tournamentId = t.id;
      const sessionPrize = registrationData[tournamentId]?.prize;
      
      let result = 0;
      if (sessionPrize !== undefined && sessionPrize !== null && sessionPrize !== '') {
        const parsedSessionPrize = parseFloat(sessionPrize);
        if (!isNaN(parsedSessionPrize)) {
          result = parsedSessionPrize;
        }
      } else {
        const storedResult = parseFloat(t.result || '0');
        if (!isNaN(storedResult)) {
          result = storedResult;
        }
      }
      
      console.log('SESSÃO ATIVA - Tournament', t.id, 'prize (session):', sessionPrize, 'result (stored):', t.result, 'final result:', result);
      return sum + result;
    }, 0);
    
    // Fórmula correta: (Bounties + Prizes) - (Total Buy-in + Total Rebuys)
    const profit = (totalPrizes + totalBounties) - totalInvestido;
    console.log('SESSÃO ATIVA - Final calculation: prizes=', totalPrizes, 'bounties=', totalBounties, 'invested=', totalInvestido, 'profit=', profit);
    
    // ITM deve considerar torneios com campo "Prize" (result) registrado > 0
    const itm = allSessionTournaments.filter((t: any) => {
      const tournamentId = t.id;
      const sessionPrize = registrationData[tournamentId]?.prize;
      
      let result = 0;
      if (sessionPrize !== undefined && sessionPrize !== null && sessionPrize !== '') {
        const parsedSessionPrize = parseFloat(sessionPrize);
        if (!isNaN(parsedSessionPrize)) {
          result = parsedSessionPrize;
        }
      } else {
        const storedResult = parseFloat(t.result || '0');
        if (!isNaN(storedResult)) {
          result = storedResult;
        }
      }
      
      return result > 0;
    }).length;
    const itmPercent = registros > 0 ? (itm / registros) * 100 : 0;
    const roi = totalInvestido > 0 ? (profit / totalInvestido) * 100 : 0;
    const fts = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
      const pos = parseInt(String(t.position)) || 0;
      return pos <= 9 && pos > 0;
    }).length;
    const cravadas = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
      const pos = parseInt(String(t.position)) || 0;
      return pos === 1;
    }).length;
    const progressao = allTournaments.length > 0 ? ((registros / allTournaments.length) * 100) : 0;

    // Calculate tournament type and speed percentages
    const tournamentsForPercentages = [...registeredTournaments, ...finishedTournaments, ...upcomingTournaments];
    const totalTournaments = tournamentsForPercentages.length;
    
    // Tournament type percentages
    const vanillaCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "Vanilla").length;
    const pkoCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "PKO").length;
    const mysteryCount = tournamentsForPercentages.filter(t => (t.type || t.category) === "Mystery").length;
    
    const vanillaPercentage = totalTournaments > 0 ? Math.round((vanillaCount / totalTournaments) * 100) : 0;
    const pkoPercentage = totalTournaments > 0 ? Math.round((pkoCount / totalTournaments) * 100) : 0;
    const mysteryPercentage = totalTournaments > 0 ? Math.round((mysteryCount / totalTournaments) * 100) : 0;
    
    // Tournament speed percentages
    const normalCount = tournamentsForPercentages.filter(t => (t.speed || 'Normal') === "Normal").length;
    const turboCount = tournamentsForPercentages.filter(t => (t.speed || 'Normal') === "Turbo").length;
    const hyperCount = tournamentsForPercentages.filter(t => (t.speed || 'Normal') === "Hyper").length;
    
    const normalSpeedPercentage = totalTournaments > 0 ? Math.round((normalCount / totalTournaments) * 100) : 0;
    const turboSpeedPercentage = totalTournaments > 0 ? Math.round((turboCount / totalTournaments) * 100) : 0;
    const hyperSpeedPercentage = totalTournaments > 0 ? Math.round((hyperCount / totalTournaments) * 100) : 0;

    return { 
      emAndamento,
      registros, 
      reentradas, 
      proximos, 
      concluidos,
      totalInvestido, 
      profit, 
      itm, 
      itmPercent, 
      roi, 
      fts, 
      cravadas, 
      progressao,
      // Tournament type percentages
      vanillaPercentage,
      pkoPercentage,
      mysteryPercentage,
      // Tournament speed percentages
      normalSpeedPercentage,
      turboSpeedPercentage,
      hyperSpeedPercentage,
      // Screen cap information
      screenCap: activeSession?.screenCap || 10,
      screenCapColors: activeSession ? getScreenCapColor(emAndamento, activeSession.screenCap || 10) : { bgColor: 'bg-gray-600/20', textColor: 'text-gray-400', borderColor: 'border-gray-500/50' }
    };
  }

  // Calculate percentages for tournament types and speeds
  const calculateTournamentPercentages = (tournaments: any[]) => {
    if (!tournaments || tournaments.length === 0) {
      return {
        types: { vanilla: 0, pko: 0, mystery: 0 },
        speeds: { normal: 0, turbo: 0, hyper: 0 }
      };
    }

    const total = tournaments.length;
    
    // Count tournament types
    const vanillaCount = tournaments.filter(t => (t.type || t.category) === "Vanilla").length;
    const pkoCount = tournaments.filter(t => (t.type || t.category) === "PKO").length;
    const mysteryCount = tournaments.filter(t => (t.type || t.category) === "Mystery").length;
    
    // Count tournament speeds
    const normalCount = tournaments.filter(t => t.speed === "Normal").length;
    const turboCount = tournaments.filter(t => t.speed === "Turbo").length;
    const hyperCount = tournaments.filter(t => t.speed === "Hyper").length;
    
    return {
      types: {
        vanilla: total > 0 ? Math.round((vanillaCount / total) * 100 * 10) / 10 : 0,
        pko: total > 0 ? Math.round((pkoCount / total) * 100 * 10) / 10 : 0,
        mystery: total > 0 ? Math.round((mysteryCount / total) * 100 * 10) / 10 : 0
      },
      speeds: {
        normal: total > 0 ? Math.round((normalCount / total) * 100 * 10) / 10 : 0,
        turbo: total > 0 ? Math.round((turboCount / total) * 100 * 10) / 10 : 0,
        hyper: total > 0 ? Math.round((hyperCount / total) * 100 * 10) / 10 : 0
      }
    };
  };

  // Calculate final session statistics for session summary
  const calculateFinalSessionStats = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];
    const completedTournaments = allTournaments.filter(t => t.status === "finished" || t.status === "completed");
    
    console.log('calculateFinalSessionStats - Completed tournaments:', completedTournaments.map(t => ({
      id: t.id,
      status: t.status,
      buyIn: t.buyIn,
      rebuys: t.rebuys,
      result: t.result,
      bounty: t.bounty,
      name: t.name
    })));
    
    const volume = completedTournaments.length;
    const totalInvested = completedTournaments.reduce((sum, t) => {
      const buyIn = parseFloat(t.buyIn) || 0;
      const rebuys = t.rebuys || 0;
      const invested = buyIn * (1 + rebuys);
      console.log(`Tournament ${t.id}: buyIn=${buyIn}, rebuys=${rebuys}, invested=${invested}`);
      return sum + invested;
    }, 0);
    
    const totalResult = completedTournaments.reduce((sum, t) => {
      const result = parseFloat(t.result) || 0;
      console.log(`Tournament ${t.id}: result=${result}`);
      return sum + result;
    }, 0);
    
    const totalBounties = completedTournaments.reduce((sum, t) => {
      const bounty = parseFloat(t.bounty) || 0;
      console.log(`Tournament ${t.id}: bounty=${bounty}`);
      return sum + bounty;
    }, 0);
    
    // CONSISTENT FORMULA: Profit = Prize + Bounties - Buy-in - Rebuys (same as active session dashboard)
    const profit = (totalResult + totalBounties) - totalInvested;
    console.log(`Final profit calculation: result=${totalResult}, bounties=${totalBounties}, invested=${totalInvested}, profit=${profit}`);
    
    const abiMed = volume > 0 ? totalInvested / volume : 0;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
    
    const fts = completedTournaments.filter(t => {
      const position = parseInt(t.position) || 999;
      const fieldSize = parseInt(t.fieldSize) || 0;
      return position <= 9 || (fieldSize > 0 && position <= fieldSize * 0.1);
    }).length;
    
    const cravadas = completedTournaments.filter(t => {
      const result = parseFloat(t.result) || 0;
      const buyIn = parseFloat(t.buyIn) || 0;
      return result > buyIn * 10;
    }).length;
    
    // Find best tournament (include bounties in calculation)
    const bestTournament = completedTournaments.reduce((best, current) => {
      const currentResult = parseFloat(current.result) || 0;
      const currentBounty = parseFloat(current.bounty) || 0;
      const currentInvested = (parseFloat(current.buyIn) || 0) * (1 + (current.rebuys || 0));
      const currentProfit = (currentResult + currentBounty) - currentInvested;
      
      if (!best) return current;
      
      const bestResult = parseFloat(best.result) || 0;
      const bestBounty = parseFloat(best.bounty) || 0;
      const bestInvested = (parseFloat(best.buyIn) || 0) * (1 + (best.rebuys || 0));
      const bestProfit = (bestResult + bestBounty) - bestInvested;
      
      return currentProfit > bestProfit ? current : best;
    }, null);
    
    // Calculate percentages for types and speeds
    const percentages = calculateTournamentPercentages(completedTournaments);
    
    return {
      volume,
      profit,
      abiMed,
      roi,
      fts,
      cravadas,
      bestTournament,
      percentages
    };
  };



  // Calculate break feedback averages
  const calculateBreakAverages = () => {
    if (!breakFeedbacks || breakFeedbacks.length === 0) {
      return { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 };
    }
    
    const totals = breakFeedbacks.reduce((acc, feedback) => {
      return {
        energia: acc.energia + feedback.energia,
        foco: acc.foco + feedback.foco,
        confianca: acc.confianca + feedback.confianca,
        inteligenciaEmocional: acc.inteligenciaEmocional + feedback.inteligenciaEmocional,
        interferencias: acc.interferencias + feedback.interferencias
      };
    }, { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });
    
    const count = breakFeedbacks.length;
    return {
      energia: totals.energia / count,
      foco: totals.foco / count,
      confianca: totals.confianca / count,
      inteligenciaEmocional: totals.inteligenciaEmocional / count,
      interferencias: totals.interferencias / count
    };
  };

  // Helper functions for tournament management
  // parseTime function already defined above

  // formatTime function already defined above

  const isBreakTime = (currentMinutes: number) => {
    // Break times: 14:55, 15:55, etc. (every hour at :55)
    return currentMinutes % 60 === 55 && (currentMinutes >= 14 * 60 + 55);
  };

  const getNextBreakTime = (currentMinutes: number) => {
    const nextBreakMinutes = Math.ceil(currentMinutes / 60) * 60 + 55;
    const hours = Math.floor(nextBreakMinutes / 60);
    const minutes = nextBreakMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // postponeTournament function already defined above

  const sortTournamentsByTime = (tournaments: any[]) => {
    return tournaments.sort((a, b) => {
      const timeA = parseTime(a.time || '00:00');
      const timeB = parseTime(b.time || '00:00');
      return timeA - timeB;
    });
  };

  const groupTournamentsByBreaks = (tournaments: any[]) => {
    const sortedTournaments = sortTournamentsByTime(tournaments);
    const groups: any[] = [];
    let currentGroup: any[] = [];
    let lastBreakTime = 0;

    sortedTournaments.forEach((tournament, index) => {
      const tournamentTime = parseTime(tournament.time || '00:00');
      const nextBreakTime = Math.ceil(tournamentTime / 60) * 60 + 55;

      if (index === 0 || nextBreakTime === lastBreakTime) {
        currentGroup.push(tournament);
      } else {
        if (currentGroup.length > 0) {
          groups.push({
            tournaments: [...currentGroup],
            breakTime: lastBreakTime
          });
        }
        currentGroup = [tournament];
      }
      lastBreakTime = nextBreakTime;
    });

    if (currentGroup.length > 0) {
      groups.push({
        tournaments: currentGroup,
        breakTime: lastBreakTime
      });
    }

    return groups;
  };

  // Calculate stats with proper dependency tracking
  const stats = useMemo(() => {
    const calculatedStats = calculateSessionStats();
    console.log('🔍 STATS RESULTADO - Valores calculados:', calculatedStats);
    console.log('🔍 STATS COMPONENTS - emAndamento:', calculatedStats.emAndamento);
    console.log('🔍 STATS COMPONENTS - registros:', calculatedStats.registros);
    console.log('🔍 STATS COMPONENTS - proximos:', calculatedStats.proximos);
    console.log('🔍 STATS COMPONENTS - concluidos:', calculatedStats.concluidos);
    console.log('🔍 STATS COMPONENTS - totalInvestido:', calculatedStats.totalInvestido);
    console.log('🔍 STATS COMPONENTS - profit:', calculatedStats.profit);
    return calculatedStats;
  }, [plannedTournaments, sessionTournaments, registrationData, activeSession]);

  // Timer de sessão com mensagens motivacionais - ETAPA 1
  useEffect(() => {
    if (!activeSession) return;

    let sessionStartTime = new Date(activeSession.date).getTime();
    const savedStartTime = sessionStorage.getItem('sessionStartTime');
    
    if (savedStartTime) {
      sessionStartTime = parseInt(savedStartTime);
    } else {
      sessionStorage.setItem('sessionStartTime', sessionStartTime.toString());
    }

    const updateSessionTimer = () => {
      const elapsed = Date.now() - sessionStartTime;
      const hours = Math.floor(elapsed / (1000 * 60 * 60));
      const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
      
      const timerElement = document.getElementById('sessionTimer');
      const statusElement = document.getElementById('statusMessage');
      
      if (timerElement) {
        timerElement.textContent = `${hours}h ${minutes}m`;
      }
      
      if (statusElement) {
        // Mensagens motivacionais baseadas no tempo
        if (hours === 0 && minutes < 30) {
          statusElement.textContent = "🔥 Começando com tudo!";
        } else if (hours < 2) {
          statusElement.textContent = "💪 Mantendo o foco!";
        } else if (hours < 4) {
          statusElement.textContent = "🎯 No ritmo certo!";
        } else if (hours < 6) {
          statusElement.textContent = "🏆 Maratona épica!";
        } else {
          statusElement.textContent = "🚀 Sessão lendária!";
        }
      }
    };

    // Atualizar imediatamente
    updateSessionTimer();
    
    // Atualizar a cada minuto
    const interval = setInterval(updateSessionTimer, 60000);

    return () => clearInterval(interval);
  }, [activeSession]);

  // Função para toggle do dashboard - ETAPA 2
  const toggleDashboard = () => {
    setShowDashboard(!showDashboard);
  };

  // Sistema de Screen Cap com Alertas - ETAPA 3
  const showNotification = (message: string, type: 'info' | 'warning' | 'danger' = 'info') => {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  };

  const getScreenCapColors = (emAndamento: number, screenCap: number) => {
    const percentage = (emAndamento / screenCap) * 100;
    
    if (percentage >= 100) {
      return {
        borderColor: 'border-red-500/50',
        bgColor: 'bg-red-600/20',
        textColor: 'text-red-400',
        alertClass: 'danger'
      };
    } else if (percentage >= 80) {
      return {
        borderColor: 'border-red-500/50',
        bgColor: 'bg-red-600/20',
        textColor: 'text-red-400',
        alertClass: 'danger'
      };
    } else if (percentage >= 60) {
      return {
        borderColor: 'border-yellow-500/50',
        bgColor: 'bg-yellow-600/20',
        textColor: 'text-yellow-400',
        alertClass: 'warning'
      };
    }
    
    return {
      borderColor: 'border-green-500/50',
      bgColor: 'bg-green-600/20',
      textColor: 'text-green-400',
      alertClass: 'normal'
    };
  };

  // Monitorar mudanças no screen cap e mostrar alertas
  useEffect(() => {
    const percentage = (stats.emAndamento / stats.screenCap) * 100;
    
    if (percentage >= 100) {
      showNotification('⚠️ Limite de telas atingido!', 'danger');
    } else if (percentage >= 80) {
      showNotification('🟨 Atenção: Próximo do limite de telas (80%)', 'warning');
    }
  }, [stats.emAndamento, stats.screenCap]);

  // Botões de teste para screen cap (apenas para desenvolvimento)
  const testScreenCapAlerts = () => {
    const currentPercentage = (stats.emAndamento / stats.screenCap) * 100;
    
    if (currentPercentage < 60) {
      showNotification('✅ Status normal: Menos de 60% do cap', 'info');
    } else if (currentPercentage < 80) {
      showNotification('🟨 Atenção: Entre 60-80% do cap', 'warning');
    } else {
      showNotification('⚠️ Alerta: Mais de 80% do cap', 'danger');
    }
  };

  if (!activeSession) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
          <p className="text-gray-400">Inicie uma nova sessão de grind para rastrear seu desempenho em tempo real</p>
        </div>

        <Card className="bg-poker-surface border-gray-700 max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-white text-xl">Nenhuma Sessão Ativa</CardTitle>
            <CardDescription className="text-gray-400">
              Comece uma nova sessão para rastrear seus torneios e receber insights em tempo real
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3">
                  <Play className="w-4 h-4 mr-2" />
                  Iniciar Sessão
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-poker-surface border-gray-700 text-white">
                <DialogHeader>
                  <DialogTitle>Iniciar Nova Sessão</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Prepare-se para sua sessão de grind com notas e objetivos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="preparation-percentage">Preparação (%)</Label>
                    <div className="flex items-center space-x-4">
                      <Input
                        id="preparation-percentage"
                        type="number"
                        min="0"
                        max="100"
                        value={preparationPercentage}
                        onChange={(e) => setPreparationPercentage(Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white w-20"
                      />
                      <span className="text-white">%</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="preparation-observations">Observações de Preparação</Label>
                    <Textarea
                      id="preparation-observations"
                      placeholder="Como você está se sentindo?"
                      value={preparationObservations}
                      onChange={(e) => setPreparationObservations(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="goals">Objetivos do Dia</Label>
                    <Textarea
                      id="goals"
                      placeholder="Quais são seus objetivos para hoje?"
                      value={dailyGoals}
                      onChange={(e) => setDailyGoals(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="screen-cap">Cap de Telas</Label>
                    <div className="flex items-center space-x-4">
                      <Input
                        id="screen-cap"
                        type="number"
                        min="1"
                        max="50"
                        value={screenCap}
                        onChange={(e) => setScreenCap(Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white w-20"
                        placeholder="10"
                      />
                      <span className="text-white">telas simultâneas</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Quantas telas você pretende jogar simultaneamente (1-50)
                    </p>
                  </div>
                  <Button 
                    onClick={handleStartSession} 
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
                    disabled={startSessionMutation.isPending}
                  >
                    {startSessionMutation.isPending ? "Iniciando..." : "Iniciar Sessão"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container p-6 text-white">
      {/* Session Objectives - Enhanced Design */}
      {activeSession?.dailyGoals && (
        <Card className="bg-gradient-to-r from-yellow-600/20 to-amber-600/20 border-2 border-yellow-500/60 shadow-lg shadow-yellow-500/20 mb-6">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="p-2 bg-yellow-500/20 rounded-full border border-yellow-500/40">
                <Target className="w-6 h-6 text-yellow-400" />
              </div>
              <span className="text-xl font-bold text-yellow-400 tracking-wide">🎯 OBJETIVOS DA SESSÃO</span>
            </div>
            <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-white text-lg font-medium leading-relaxed text-center">
                {activeSession.dailyGoals}
              </p>
            </div>
            <div className="mt-4 text-center">
              <div className="inline-flex items-center px-4 py-2 bg-yellow-500/20 rounded-full border border-yellow-500/40">
                <span className="text-yellow-300 text-sm font-medium">Mantenha o foco nos seus objetivos! 🚀</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header Sticky - ETAPA 1 */}
      <div className="live-header">
        <div className="header-content">
          <div className="session-info">
            <div className="session-title">🔥 Sessão Ativa</div>
            <div className="session-timer" id="sessionTimer">
              {sessionElapsedTime || "0h 0m"}
            </div>
            <div className="session-status">
              <div className="status-dot"></div>
              <span id="statusMessage">
                {getSessionTimeInfo().message}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <button 
              className="btn btn-note"
              onClick={handleOpenQuickNoteModal}
            >
              📝 Nota Rápida
            </button>
            <button 
              className="btn btn-break"
              onClick={() => {
                console.log('Break dialog button clicked, setting showBreakDialog to true');
                setShowBreakDialog(true);
              }}
            >
              ☕ Feedback Break
            </button>
            <button 
              className="btn btn-end"
              onClick={handleSessionFinalization}
            >
              ⏹ Finalizar Sessão
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Ocultável - ETAPA 2 */}
      <div className="dashboard-section">
        <button 
          className={`dashboard-toggle ${!showDashboard ? 'collapsed' : ''}`}
          onClick={toggleDashboard}
        >
          <span>📊 Dashboard</span>
          <span className="toggle-icon">▼</span>
        </button>

        <div className={`dashboard-content ${!showDashboard ? 'collapsed' : ''}`}>
          {/* Métricas de Status */}
          <div className="metrics-row metrics-status">
            <div className={`metric-card screen-cap ${getScreenCapColors(stats.emAndamento, stats.screenCap).alertClass}`}>
              <div className="metric-icon">🖥️</div>
              <div className="metric-value">
                {stats.emAndamento}/{stats.screenCap}
              </div>
              <div className="metric-label">Em Andamento</div>
              <div className="metric-sub">
                {Math.round((stats.emAndamento / (stats.screenCap || 10)) * 100)}% do cap
              </div>
            </div>
            
            <div className="metric-card metric-registered">
              <div className="metric-icon">🎯</div>
              <div className="metric-value">{(() => {
                console.log('🔍 RENDERIZANDO REGISTROS:', stats.registros);
                return stats.registros;
              })()}</div>
              <div className="metric-label">Registrados</div>
            </div>
            
            <div className="metric-card metric-reentries">
              <div className="metric-icon">🔄</div>
              <div className="metric-value">{stats.reentradas}</div>
              <div className="metric-label">Reentradas</div>
            </div>
            
            <div className="metric-card metric-upcoming">
              <div className="metric-icon">⏰</div>
              <div className="metric-value">{stats.proximos}</div>
              <div className="metric-label">Próximos</div>
            </div>
            
            <div className="metric-card metric-finished">
              <div className="metric-icon">✅</div>
              <div className="metric-value">{stats.concluidos}</div>
              <div className="metric-label">Concluídos</div>
            </div>
          </div>

          {/* Métricas Financeiras */}
          <div className="metrics-row metrics-financial">
            <div className="metric-card metric-invested">
              <div className="metric-icon">💸</div>
              <div className="metric-value">${(() => {
                console.log('🔍 RENDERIZANDO TOTAL INVESTIDO:', stats.totalInvestido);
                return formatNumberWithDots(stats.totalInvestido);
              })()}</div>
              <div className="metric-label">Total Investido</div>
            </div>
            
            <div className="metric-card metric-profit">
              <div className="metric-icon">💰</div>
              <div className="metric-value" style={{'--value-color': stats.profit >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}>
                ${formatNumberWithDots(stats.profit)}
              </div>
              <div className="metric-label">Profit</div>
            </div>
          </div>

          {/* Métricas de Performance */}
          <div className="metrics-row metrics-performance">
            <div className="metric-card metric-itm">
              <div className="metric-icon">🎯</div>
              <div className="metric-value">{stats.itmPercent.toFixed(1)}%</div>
              <div className="metric-label">ITM%</div>
            </div>
            
            <div className="metric-card metric-roi">
              <div className="metric-icon">📈</div>
              <div className="metric-value" style={{'--value-color': stats.roi >= 0 ? '#00ff88' : '#ff4444'} as React.CSSProperties}>
                {stats.roi.toFixed(1)}%
              </div>
              <div className="metric-label">ROI%</div>
            </div>
            
            <div className="metric-card metric-fts">
              <div className="metric-icon">🏆</div>
              <div className="metric-value">{stats.fts}</div>
              <div className="metric-label">FTs</div>
            </div>
            
            <div className="metric-card metric-wins">
              <div className="metric-icon">💎</div>
              <div className="metric-value">{stats.cravadas}</div>
              <div className="metric-label">Cravadas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tournament List - ETAPA 4 */}
      <div className="tournaments-section">
        <div className="tournaments-header">
          <div className="tournaments-title">🎮 Torneios de Hoje</div>
          <Dialog open={showAddTournamentDialog} onOpenChange={setShowAddTournamentDialog}>
            <DialogTrigger asChild>
              <button className="add-tournament-btn">
                <span>➕</span>
                Adicionar Torneio
              </button>
            </DialogTrigger>
              <DialogContent className="bg-[#0a0a0a] border-[#333333] text-white max-w-7xl max-h-[95vh] overflow-y-auto shadow-2xl">
                <DialogHeader className="border-b border-[#333333] pb-4">
                  <DialogTitle className="text-2xl font-bold text-[#00ff88] flex items-center gap-2">
                    🎯 Adicionar Novo Torneio
                  </DialogTitle>
                  <DialogDescription className="text-gray-400 mt-1">
                    Preencha os dados ou selecione uma sugestão baseada no seu planejamento semanal
                  </DialogDescription>
                </DialogHeader>
                
                {/* Layout Principal: 50% esquerda + 50% direita */}
                <div className="flex gap-8 mt-6">
                  {/* SEÇÃO ESQUERDA: Formulário Atual (50%) */}
                  <div className="flex-1 w-[50%]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-[#00ff88] font-medium">Nome do Torneio (opcional)</Label>
                        <Input
                          value={newTournament.name}
                          onChange={(e) => setNewTournament({...newTournament, name: e.target.value})}
                          className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                          placeholder="Deixe vazio para gerar automaticamente"
                        />
                      </div>
                      <div>
                        <Label className="text-[#00ff88] font-medium">Site</Label>
                        <select
                          value={newTournament.site}
                          onChange={(e) => setNewTournament({...newTournament, site: e.target.value})}
                          className="w-full p-2 bg-[#1a1a1a] border border-[#333333] rounded-md text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                        >
                          <option value="">Selecione o site</option>
                          <option value="PokerStars">PokerStars</option>
                          <option value="GGPoker">GGPoker</option>
                          <option value="PartyPoker">PartyPoker</option>
                          <option value="888poker">888poker</option>
                          <option value="WPN">WPN</option>
                          <option value="Chico">Chico</option>
                          <option value="iPoker">iPoker</option>
                          <option value="CoinPoker">CoinPoker</option>
                          <option value="Revolution">Revolution</option>
                          <option value="Bodog">Bodog</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[#00ff88] font-medium">Buy-in ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newTournament.buyIn}
                          onChange={(e) => setNewTournament({...newTournament, buyIn: e.target.value})}
                          className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label className="text-[#00ff88] font-medium">Tipo</Label>
                        <select
                          value={newTournament.type}
                          onChange={(e) => setNewTournament({...newTournament, type: e.target.value})}
                          className="w-full p-2 bg-[#1a1a1a] border border-[#333333] rounded-md text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                        >
                          <option value="Vanilla">Vanilla</option>
                          <option value="PKO">PKO</option>
                          <option value="Mystery">Mystery</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[#00ff88] font-medium">Velocidade</Label>
                        <select
                          value={newTournament.speed}
                          onChange={(e) => setNewTournament({...newTournament, speed: e.target.value})}
                          className="w-full p-2 bg-blue-800 border border-blue-600 rounded-md text-white"
                        >
                          <option value="Normal">Normal</option>
                          <option value="Turbo">Turbo</option>
                          <option value="Hyper">Hyper</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[#00ff88] font-medium">Horário (opcional)</Label>
                        <Input
                          type="time"
                          value={newTournament.scheduledTime}
                          onChange={(e) => setNewTournament({...newTournament, scheduledTime: e.target.value})}
                          className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                        />
                      </div>
                      <div>
                        <Label className="text-[#00ff88] font-medium">Guaranteed (opcional)</Label>
                        <Input
                          type="number"
                          value={newTournament.fieldSize}
                          onChange={(e) => setNewTournament({...newTournament, fieldSize: e.target.value})}
                          className="bg-[#1a1a1a] border-[#333333] text-white focus:border-[#00ff88] focus:ring-2 focus:ring-[#00ff88]/20 transition-all"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    
                    {/* Checkbox para sincronização com Grade */}
                    <div className="mt-4 p-3 bg-[#1a1a1a]/50 rounded-lg border border-[#333333]/50">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="sync-with-grade"
                          checked={syncWithGrade}
                          onChange={(e) => setSyncWithGrade(e.target.checked)}
                          className="w-4 h-4 text-[#00ff88] bg-[#1a1a1a] border-[#333333] rounded focus:ring-[#00ff88]/50 focus:border-[#00ff88]"
                        />
                        <Label htmlFor="sync-with-grade" className="text-gray-300 cursor-pointer">
                          Adicionar na Grade do {new Date().toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase())}
                        </Label>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">
                        Sincronizar este torneio com o planejamento semanal automaticamente
                      </p>
                    </div>
                    
                    <div className="flex space-x-2 mt-6">
                      <Button 
                        onClick={() => setShowAddTournamentDialog(false)}
                        variant="outline"
                        className="flex-1 border-[#333333] text-gray-300 hover:bg-[#1a1a1a] hover:border-[#00ff88] transition-all"
                      >
                        Cancelar
                      </Button>
                      <Button 
                        onClick={() => {
                          console.log('🚀 ADD TOURNAMENT DEBUG - newTournament state:', newTournament);
                          console.log('🚀 ADD TOURNAMENT DEBUG - syncWithGrade:', syncWithGrade);
                          
                          if (!newTournament.site || !newTournament.buyIn) {
                            toast({
                              title: "Campos Obrigatórios",
                              description: "Site e Buy-in são obrigatórios",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          const mutationData = {
                            ...newTournament,
                            syncWithGrade
                          };
                          
                          console.log('🚀 ADD TOURNAMENT DEBUG - mutation data:', mutationData);
                          addTournamentMutation.mutate(mutationData);
                        }}
                        className="flex-1 bg-[#00ff88] hover:bg-[#00dd77] text-black font-medium transition-all"
                        disabled={addTournamentMutation.isPending || !newTournament.site || !newTournament.buyIn}
                      >
                        {addTournamentMutation.isPending ? "Adicionando..." : "Adicionar Torneio"}
                      </Button>
                    </div>
                  </div>
                  
                  {/* SEÇÃO DIREITA: Painel de Sugestões (50%) */}
                  <div className="w-[50%] border-l border-[#333333]/50 pl-8">
                    <div className="h-full flex flex-col">
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-semibold text-[#00ff88]">💡 Torneios Sugeridos</h3>
                          <button
                            onClick={resetFilters}
                            className={`text-xs transition-colors px-3 py-1.5 rounded border ${
                              hasActiveFilters() 
                                ? 'text-[#00ff88] border-[#00ff88]/70 bg-[#00ff88]/10 hover:bg-[#00ff88]/20' 
                                : 'text-gray-400 border-[#333333]/50 hover:text-[#00ff88] hover:border-[#00ff88]/70'
                            }`}
                            disabled={!hasActiveFilters()}
                          >
                            {hasActiveFilters() ? 'Limpar Filtros' : 'Sem Filtros'}
                          </button>
                        </div>
                        <p className="text-sm text-blue-300">
                          Baseado no seu planejamento semanal
                          {hasActiveFilters() && (
                            <span className="inline-block ml-2 px-2 py-0.5 text-xs bg-blue-600/40 text-blue-200 rounded">
                              Filtros ativos
                            </span>
                          )}
                        </p>
                        
                        {/* ETAPA 4: Estatísticas e Filtros Rápidos */}
                        <div className="mt-3 p-3 bg-blue-900/30 rounded-lg border border-blue-700/50 suggestion-stats">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <div className="flex items-center gap-4">
                              <span className="text-blue-300">
                                {(() => {
                                  const stats = getSuggestionStats();
                                  return `${stats.filtered}/${stats.total} sugestões`;
                                })()}
                              </span>
                              <span className="text-blue-400">
                                {(() => {
                                  const stats = getSuggestionStats();
                                  return `${stats.sites} sites`;
                                })()}
                              </span>
                              <span className="text-blue-400">
                                {(() => {
                                  const stats = getSuggestionStats();
                                  return `${stats.types} tipos`;
                                })()}
                              </span>
                            </div>
                            <div className="text-blue-400 real-time-indicator">
                              ⚡ Em tempo real
                            </div>
                          </div>
                          
                          {/* ETAPA 5: Tags de Filtros Rápidos */}
                          <div className="flex flex-wrap gap-1 smart-filter-tags">
                            {Array.from(new Set(weeklySuggestions.map(s => s.site))).slice(0, 3).map(site => (
                              <button
                                key={site}
                                onClick={() => applyQuickFilter('site', site)}
                                className="text-xs px-2 py-1 bg-blue-700/40 text-blue-200 rounded hover:bg-blue-600/50 transition-colors"
                              >
                                {site}
                              </button>
                            ))}
                            {Array.from(new Set(weeklySuggestions.map(s => s.type))).slice(0, 3).map(type => (
                              <button
                                key={type}
                                onClick={() => applyQuickFilter('type', type)}
                                className="text-xs px-2 py-1 bg-blue-700/40 text-blue-200 rounded hover:bg-blue-600/50 transition-colors"
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto max-h-[600px]">
                        <div className="space-y-1">
                          {(() => {
                            const filteredSuggestions = getFilteredSuggestions();
                            
                            if (filteredSuggestions.length === 0) {
                              return (
                                <div className="p-4 bg-[#1a1a1a]/50 rounded-lg border border-[#333333]/50 text-center">
                                  <p className="text-gray-400 text-sm">
                                    {weeklySuggestions.length === 0 ? (
                                      <>🎯 Nenhuma sugestão disponível<br/>
                                      Adicione torneios na sua Grade semanal</>
                                    ) : (
                                      <>🔍 Nenhuma sugestão encontrada<br/>
                                      para os filtros atuais</>
                                    )}
                                  </p>
                                </div>
                              );
                            }
                            
                            return filteredSuggestions.map((suggestion, index) => {
                              const popularity = getPredictedPopularity(suggestion);
                              const similarityScore = getSimilarityScore(suggestion);
                              
                              return (
                                <div
                                  key={index}
                                  className={`p-2 bg-[#1a1a1a]/50 rounded border transition-all duration-200 cursor-pointer group hover:shadow-md hover:shadow-[#00ff88]/20 hover:scale-[1.01] transform suggestion-card ${
                                    similarityScore >= 75 ? 'high-match' :
                                    similarityScore >= 50 ? 'medium-match' :
                                    'border-[#333333]/40 hover:border-[#00ff88]/60 hover:bg-[#1a1a1a]/80'
                                  }`}
                                  onClick={() => applySuggestion(suggestion)}
                                >
                                  {/* Layout Horizontal Compacto: [Site] [Tipo][Velocidade] $Buy-in • Gtd */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-1">
                                      {/* Site - Principal identificador */}
                                      <span className="font-medium text-white text-sm min-w-[80px]">
                                        {suggestion.site}
                                      </span>
                                      
                                      {/* Badges de Tipo e Velocidade */}
                                      <div className="flex items-center gap-1">
                                        <span className={`px-2 py-0.5 rounded text-xs text-white ${getCategoryColor(suggestion.type)}`}>
                                          {suggestion.type}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${getSpeedColor(suggestion.speed)}`}>
                                          {suggestion.speed}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* Buy-in e Guaranteed */}
                                    <div className="flex items-center gap-2 text-sm">
                                      <span className="font-medium text-[#00ff88]">
                                        ${suggestion.buyIn}
                                      </span>
                                      {suggestion.guaranteed && (
                                        <span className="text-gray-400">
                                          • ${suggestion.guaranteed}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        
        <div className="tournaments-content">
          {/* Organize tournaments by status */}
          {(() => {
            // Combine tournaments avoiding duplicates more efficiently
            const combinedTournaments = new Map();
            
            // First, add all session tournaments
            (sessionTournaments || []).forEach(tournament => {
              combinedTournaments.set(tournament.id, tournament);
            });
            
            // Then, add planned tournaments only if they don't have a corresponding session tournament
            (plannedTournaments || []).forEach(tournament => {
              const plannedKey = `planned-${tournament.id}`;
              
              // Check if there's already a session tournament that was created from this planned tournament
              const hasSessionTournament = Array.from(combinedTournaments.values()).some(sessionTournament => 
                sessionTournament.plannedTournamentId === tournament.id ||
                (sessionTournament.fromPlannedTournament && 
                 sessionTournament.name === tournament.name && 
                 sessionTournament.site === tournament.site && 
                 sessionTournament.buyIn === tournament.buyIn &&
                 sessionTournament.time === tournament.time)
              );
              
              // Only add if no corresponding session tournament exists
              if (!hasSessionTournament && !combinedTournaments.has(plannedKey)) {
                combinedTournaments.set(plannedKey, {
                  ...tournament,
                  id: plannedKey,
                  status: tournament.status || 'upcoming'
                });
              }
            });
            
            const allTournaments = Array.from(combinedTournaments.values());
            console.log('🔍 DUPLICATES DEBUG - Final combined tournaments:', allTournaments.map(t => ({ id: t.id, name: t.name, time: t.time, status: t.status })));
            
            const { registered, upcoming, completed } = organizeTournaments(allTournaments);
              
              console.log('Tournament organization:', {
                upcoming: upcoming.map(t => ({ id: t.id, status: t.status, name: t.name, time: t.time })),
                registered: registered.map(t => ({ id: t.id, status: t.status, name: t.name, time: t.time })),
                completed: completed.map(t => ({ id: t.id, status: t.status, name: t.name, time: t.time }))
              });
              
              // Debug log for tournaments with missing time
              console.log('🕐 TIME DEBUG - Checking tournament times:', {
                total: allTournaments.length,
                withTime: allTournaments.filter(t => t.time).length,
                withoutTime: allTournaments.filter(t => !t.time).length,
                missingTimes: allTournaments.filter(t => !t.time).map(t => ({
                  id: t.id,
                  name: t.name,
                  time: t.time,
                  status: t.status
                }))
              });

              return (
                <>
                  {/* EM ANDAMENTO */}
                  <div className="tournament-category" id="activeCategory">
                    <div className="category-header category-registered">
                      <div className="category-icon"></div>
                      <div className="category-title">🎯 Em Andamento</div>
                      <div className="category-count">{registered.length}</div>
                    </div>
                    <div className="tournaments-list">
                      {registered.length > 0 ? (
                        registered.map((tournament: any, index: number) => (
                          <div key={tournament.id} className="tournament-card tournament-registered">
                            {/* Botão desfazer no canto superior direito */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUnregisterTournament(tournament.id)}
                              className="absolute top-1 right-1 p-1 h-5 w-5 text-gray-400 hover:text-gray-200 hover:bg-blue-800/50"
                            >
                              <Undo2 className="w-3 h-3" />
                            </Button>

                            <div className="flex items-center justify-between gap-3">
                              {/* Informações do torneio - compacta */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <PlayCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                  <span className="font-bold text-blue-400 text-sm">
                                    {tournament.time || '—'}
                                  </span>
                                  {!tournament.time && (
                                    <span className="text-red-400 text-xs ml-1">(sem horário)</span>
                                  )}
                                  <span className="font-medium text-white text-sm truncate">{generateTournamentName(tournament)}</span>
                                </div>
                                <div className="flex gap-1 text-xs">
                                  <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
                                    {tournament.site}
                                  </Badge>
                                  <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
                                    {tournament.type || tournament.category || 'Vanilla'}
                                  </Badge>
                                  <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
                                    {tournament.speed || 'Normal'}
                                  </Badge>
                                  {editingPriority === tournament.id ? (
                                    <div className="priority-select" onClick={(e) => e.stopPropagation()}>
                                      <Select
                                        value={String(tournament.prioridade || 2)}
                                        onValueChange={(value) => {
                                          console.log('Priority value changed to:', value, 'for tournament:', tournament.id);
                                          console.log('Current tournament prioridade:', tournament.prioridade);
                                          handleUpdatePriority(tournament.id, parseInt(value));
                                        }}
                                        open={true}
                                        onOpenChange={(open) => {
                                          console.log('Priority select open state changed:', open);
                                          if (!open) {
                                            setEditingPriority(null);
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="w-20 h-6 text-xs bg-gray-700 border-gray-600">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-600">
                                          <SelectItem value="1" className="text-white hover:bg-gray-700 cursor-pointer">Alta</SelectItem>
                                          <SelectItem value="2" className="text-white hover:bg-gray-700 cursor-pointer">Média</SelectItem>
                                          <SelectItem value="3" className="text-white hover:bg-gray-700 cursor-pointer">Baixa</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ) : (
                                    <Badge 
                                      className={`px-1.5 py-0.5 text-white cursor-pointer hover:opacity-80 transition-opacity ${getPrioridadeColor(tournament.prioridade || 2)}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handlePriorityClickCycle(tournament.id, tournament.prioridade || 2);
                                      }}
                                    >
                                      {getPrioridadeLabel(tournament.prioridade || 2)}
                                    </Badge>
                                  )}
                                  {(tournament.rebuys || 0) > 0 && (
                                    <Badge className={`px-1.5 py-0.5 text-white transition-all duration-200 ${getRebuyCounterClass(tournament.rebuys || 0)}`}>
                                      {getRebuyText(tournament.rebuys || 0)}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  Buy-in: <span className="text-poker-green font-medium">${formatNumberWithDots(tournament.buyIn)}</span>
                                  {tournament.guaranteed && (
                                    <span className="ml-3">GTD: <span className="text-blue-400 font-medium">${formatNumberWithDots(tournament.guaranteed)}</span></span>
                                  )}
                                </div>
                              </div>

                              {/* Campos de entrada melhorados */}
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col gap-2">
                                  <label className="text-sm font-semibold text-blue-200 text-center">💰 Bounty</label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    className="bg-gradient-to-r from-blue-800/60 to-blue-700/60 border-2 border-blue-500/60 text-white h-10 w-20 text-sm p-2 text-center font-bold shadow-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={registrationData[tournament.id]?.bounty || ''}
                                    onChange={(e) => {
                                      const normalizedValue = normalizeDecimalInput(e.target.value);
                                      setRegistrationData({
                                        ...registrationData,
                                        [tournament.id]: {
                                          ...registrationData[tournament.id],
                                          bounty: normalizedValue,
                                          prize: registrationData[tournament.id]?.prize || '',
                                          position: registrationData[tournament.id]?.position || ''
                                        }
                                      });
                                    }}
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="text-sm font-semibold text-green-200 text-center">🏆 Prize</label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    className="bg-gradient-to-r from-green-800/60 to-green-700/60 border-2 border-green-500/60 text-white h-10 w-24 text-sm p-2 text-center font-bold shadow-lg focus:border-green-400 focus:ring-2 focus:ring-green-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={registrationData[tournament.id]?.prize || ''}
                                    onChange={(e) => {
                                      const normalizedValue = normalizeDecimalInput(e.target.value);
                                      setRegistrationData({
                                        ...registrationData,
                                        [tournament.id]: {
                                          ...registrationData[tournament.id],
                                          prize: normalizedValue,
                                          bounty: registrationData[tournament.id]?.bounty || '',
                                          position: registrationData[tournament.id]?.position || ''
                                        }
                                      });
                                    }}
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="text-sm font-semibold text-yellow-200 text-center">📊 Pos</label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="bg-gradient-to-r from-yellow-800/60 to-yellow-700/60 border-2 border-yellow-500/60 text-white h-10 w-16 text-sm p-2 text-center font-bold shadow-lg focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={registrationData[tournament.id]?.position || ''}
                                    onChange={(e) => setRegistrationData({
                                      ...registrationData,
                                      [tournament.id]: {
                                        ...registrationData[tournament.id],
                                        position: e.target.value,
                                        bounty: registrationData[tournament.id]?.bounty || '',
                                        prize: registrationData[tournament.id]?.prize || ''
                                      }
                                    })}
                                  />
                                </div>
                              </div>

                              {/* Botões de ação melhorados */}
                              <div className="flex items-center gap-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditTime(tournament.id)}
                                  className="border-2 border-orange-500 bg-gradient-to-r from-orange-600/60 to-orange-700/60 text-orange-100 hover:from-orange-500/80 hover:to-orange-600/80 hover:text-white h-10 px-4 text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
                                >
                                  <Clock className="w-4 h-4 mr-2" />
                                  ⏰ Horário
                                </Button>
                                <Button
                                  size="lg"
                                  variant="outline"
                                  onClick={() => handleRebuyTournament(tournament)}
                                  className={`border-2 h-12 px-6 text-sm font-bold shadow-xl transform hover:scale-105 transition-all duration-200 ${
                                    !tournament.rebuys || tournament.rebuys === 0
                                      ? "border-green-500 bg-gradient-to-r from-green-600/80 to-green-700/80 text-white hover:from-green-500 hover:to-green-600"
                                      : tournament.rebuys === 1
                                      ? "border-yellow-500 bg-gradient-to-r from-yellow-600/80 to-yellow-700/80 text-white hover:from-yellow-500 hover:to-yellow-600"
                                      : "border-red-500 bg-gradient-to-r from-red-600/80 to-red-700/80 text-white hover:from-red-500 hover:to-red-600"
                                  }`}
                                  disabled={updateTournamentMutation.isPending}
                                  title={`Rebuys: ${tournament.rebuys || 0}`}
                                >
                                  <Coins className="w-5 h-5 mr-2" />
                                  💸 REBUY
                                  {tournament.rebuys && tournament.rebuys > 0 ? ` (${tournament.rebuys})` : ''}
                                </Button>
                                {/* ETAPA 6: Botões GG! e Campos de Resultado */}
                                {!showResultFields[tournament.id] ? (
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => handleFinishTournamentDirect(tournament.id)}
                                      className="btn-gg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white h-12 px-6 font-black text-lg shadow-xl transform hover:scale-110 transition-all duration-200 border-2 border-red-400/50"
                                      size="lg"
                                    >
                                      💀 GG!
                                    </Button>
                                    
                                  </div>
                                ) : (
                                  <div className="w-full">
                                    {/* Campos de resultado inline */}
                                    <div className={`tournament-result show ${
                                      calculateTotalProfit(tournament.id, tournament).profit >= 0 ? 'profit' : 'loss'
                                    }`}>
                                      <div className="result-fields">
                                        <div className="result-field">
                                          <div className="result-label">🏆 Bounty (opcional)</div>
                                          <input
                                            type="number"
                                            className="result-input"
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            value={resultData[tournament.id]?.bounty || ''}
                                            onChange={(e) => handleUpdateResultData(tournament.id, 'bounty', e.target.value)}
                                          />
                                        </div>
                                        <div className="result-field">
                                          <div className="result-label">💰 Prize (opcional)</div>
                                          <input
                                            type="number"
                                            className="result-input"
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            value={resultData[tournament.id]?.prize || ''}
                                            onChange={(e) => handleUpdateResultData(tournament.id, 'prize', e.target.value)}
                                          />
                                        </div>
                                        <div className="result-field">
                                          <div className="result-label">📍 Posição (opcional)</div>
                                          <input
                                            type="number"
                                            className="result-input"
                                            placeholder="0"
                                            min="1"
                                            value={resultData[tournament.id]?.position || ''}
                                            onChange={(e) => handleUpdateResultData(tournament.id, 'position', e.target.value)}
                                          />
                                        </div>
                                      </div>
                                      
                                      <div className="result-summary">
                                        <div className={`result-total ${
                                          calculateTotalProfit(tournament.id, tournament).profit >= 0 ? '' : 'negative'
                                        }`}>
                                          Total: ${calculateTotalProfit(tournament.id, tournament).total.toFixed(2)} | 
                                          Profit: ${calculateTotalProfit(tournament.id, tournament).profit >= 0 ? '+' : ''}${calculateTotalProfit(tournament.id, tournament).profit.toFixed(2)}
                                        </div>
                                      </div>
                                      
                                      <div className="result-actions">
                                        <button
                                          className="result-save-btn"
                                          onClick={() => handleSaveResult(tournament.id, tournament)}
                                          disabled={savingResult[tournament.id]}
                                        >
                                          {savingResult[tournament.id] ? '⏳ Salvando...' : '💾 Salvar Resultado'}
                                        </button>
                                        <button
                                          className="result-cancel-btn"
                                          onClick={() => handleHideResultFields(tournament.id)}
                                        >
                                          ❌ Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {index < registered.length - 1 && <div className="h-px bg-blue-600/30 my-1" />}
                          </div>
                        ))
                      ) : (
                        <div className="category-empty">
                          Nenhum torneio em andamento
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PRÓXIMOS */}
                  <div className="tournament-category" id="upcomingCategory">
                    <div className="category-header category-upcoming">
                      <div className="category-icon"></div>
                      <div className="category-title">⏰ Próximos</div>
                      <div className="category-count">{upcoming.length}</div>
                    </div>
                    <div className="tournaments-list">
                      {upcoming.length > 0 ? (
                        <div className="space-y-4">
                          {organizeTournamentsByBreaks(upcoming).map((breakBlock, breakIndex) => (
                            <div key={breakBlock.breakTime} className="break-block">
                              {/* Break Header */}
                              <div className="break-header">
                                <div className="break-line"></div>
                                <div className="break-title">
                                  Break {breakBlock.breakTime} ({breakBlock.tournaments.length})
                                </div>
                                <div className="break-line"></div>
                              </div>
                              
                              {/* Tournaments in this break */}
                              <div className="space-y-2">
                                {breakBlock.tournaments.map((tournament: any, index: number) => (
                                  <div key={tournament.id} className="tournament-card tournament-upcoming">
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                          <span className="font-semibold text-gray-400">
                                            {tournament.time || '—'}
                                          </span>
                                          {!tournament.time && (
                                            <span className="text-red-400 text-xs ml-1">(sem horário)</span>
                                          )}
                                          <span className="font-semibold text-white">{generateTournamentName(tournament)}</span>
                                        </div>
                                        <div className="flex gap-1 text-xs mb-2 ml-7">
                                          <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
                                            {tournament.site}
                                          </Badge>
                                          <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
                                            {tournament.type || tournament.category || 'Vanilla'}
                                          </Badge>
                                          <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
                                            {tournament.speed || 'Normal'}
                                          </Badge>
                                        </div>
                                        <div className="text-sm text-gray-300 ml-7">
                                          Buy-in: <span className="text-poker-green font-semibold">${formatNumberWithDots(tournament.buyIn)}</span>
                                          {(() => {
                                            const guaranteedValue = tournament.guaranteed || 
                                              (tournament.fieldSize && tournament.buyIn ? 
                                                Math.floor(tournament.fieldSize * parseFloat(tournament.buyIn) * 0.85) : 
                                                null);
                                            return guaranteedValue ? (
                                              <span className="ml-3 text-blue-400">| <span className="font-semibold">${formatNumberWithDots(guaranteedValue)} GTD</span></span>
                                            ) : null;
                                          })()}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleEditTime(tournament.id)}
                                          className="border-2 border-orange-500 bg-gradient-to-r from-orange-600/60 to-orange-700/60 text-orange-100 hover:from-orange-500/80 hover:to-orange-600/80 hover:text-white h-10 px-4 text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
                                        >
                                          <Clock className="w-4 h-4 mr-2" />
                                          ⏰ Horário
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setEditingTournament(tournament);
                                            setShowEditTournamentDialog(true);
                                          }}
                                          className="border-2 border-blue-500 bg-gradient-to-r from-blue-600/60 to-blue-700/60 text-blue-100 hover:from-blue-500/80 hover:to-blue-600/80 hover:text-white h-10 px-4 text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
                                        >
                                          <Edit className="w-4 h-4 mr-2" />
                                          ✏️ Editar
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            if (window.confirm('Tem certeza que deseja excluir este torneio da lista?')) {
                                              updateTournamentMutation.mutate({
                                                id: tournament.id,
                                                data: { status: 'deleted' }
                                              });
                                            }
                                          }}
                                          className="border-2 border-red-500 bg-gradient-to-r from-red-600/60 to-red-700/60 text-red-100 hover:from-red-500/80 hover:to-red-600/80 hover:text-white h-10 px-4 text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
                                        >
                                          <X className="w-4 h-4 mr-2" />
                                          🗑️ Excluir
                                        </Button>
                                        <Button
                                          size="lg"
                                          onClick={() => handleRegisterTournament(tournament.id)}
                                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white h-10 px-6 text-sm font-bold shadow-xl transform hover:scale-110 transition-all duration-200 border-2 border-blue-400/50"
                                        >
                                          <UserPlus className="w-5 h-5 mr-2" />
                                          🎯 REGISTRAR
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="category-empty">
                          Nenhum torneio próximo
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CONCLUÍDOS */}
                  <div className="tournament-category" id="finishedCategory">
                    <div className="category-header category-finished">
                      <div className="category-icon"></div>
                      <div className="category-title">✅ Concluídos</div>
                      <div className="category-count">{completed.length}</div>
                    </div>
                    <div className="tournaments-list">
                      {completed.length > 0 ? (
                        <Collapsible open={showCompletedTournaments} onOpenChange={setShowCompletedTournaments}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                              <div className="flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-poker-gold" />
                                <span className="font-semibold text-white">Ver Torneios Concluídos</span>
                              </div>
                              {showCompletedTournaments ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-3 mt-3">
                            {completed.map((tournament: any, index: number) => (
                              <div key={tournament.id} className="tournament-card tournament-finished">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <Trophy className="w-4 h-4 text-poker-accent flex-shrink-0" />
                                      <span className="font-semibold text-poker-accent">
                                        {tournament.time || '—'}
                                      </span>
                                      {!tournament.time && (
                                        <span className="text-red-400 text-xs ml-1">(sem horário)</span>
                                      )}
                                      <span className="font-semibold text-white">{generateTournamentName(tournament)}</span>
                                    </div>
                                    <div className="flex gap-1 text-xs mb-2 ml-7">
                                      <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
                                        {tournament.site}
                                      </Badge>
                                      <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
                                        {tournament.type || tournament.category || 'Vanilla'}
                                      </Badge>
                                      <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
                                        {tournament.speed || 'Normal'}
                                      </Badge>
                                      {(tournament.rebuys || 0) > 0 && (
                                        <Badge className="bg-yellow-600 px-1.5 py-0.5 text-white">
                                          {(tournament.rebuys || 0) + 1}x
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-300 ml-7">
                                      Buy-in: <span className="text-poker-green font-semibold">${formatNumberWithDots(tournament.buyIn)}</span>
                                      {tournament.guaranteed && (
                                        <span className="ml-3">GTD: <span className="text-blue-400 font-semibold">${formatNumberWithDots(tournament.guaranteed)}</span></span>
                                      )}
                                      {tournament.rebuys > 0 && (
                                        <span className="ml-4">Rebuys: <span className="text-yellow-400 font-semibold">{tournament.rebuys}</span></span>
                                      )}
                                      {tournament.result && parseFloat(tournament.result) > 0 && (
                                        <span className="ml-4">Prize: <span className="text-green-400 font-semibold">${formatNumberWithDots(tournament.result)}</span></span>
                                      )}
                                      {tournament.position && (
                                        <span className="ml-4">Posição: <span className="text-orange-400 font-semibold">{tournament.position}º</span></span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingTournament(tournament);
                                        setShowEditTournamentDialog(true);
                                      }}
                                      className="border-2 border-blue-500 bg-gradient-to-r from-blue-600/60 to-blue-700/60 text-blue-100 hover:from-blue-500/80 hover:to-blue-600/80 hover:text-white h-9 px-4 text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
                                    >
                                      <Edit className="w-4 h-4 mr-2" />
                                      ✏️ Editar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleUnregisterTournament(tournament.id)}
                                      className="border-2 border-yellow-500 bg-gradient-to-r from-yellow-600/60 to-yellow-700/60 text-yellow-100 hover:from-yellow-500/80 hover:to-yellow-600/80 hover:text-white h-9 px-4 text-sm font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
                                    >
                                      <Undo2 className="w-4 h-4 mr-2" />
                                      ↩️ Desfazer
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <div className="category-empty">
                          Nenhum torneio concluído
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
        </div>
      </div>
      
      {/* Break Feedback Dialog - Debug version */}
      {console.log('Rendering BreakFeedbackPopup with isOpen:', showBreakDialog)}
      <BreakFeedbackPopup
        isOpen={showBreakDialog}
        onClose={() => {
          console.log('BreakFeedbackPopup onClose called');
          setShowBreakDialog(false);
        }}
        onSubmit={(feedback) => {
          console.log('BreakFeedbackPopup onSubmit called with:', feedback);
          breakFeedbackMutation.mutate(feedback);
        }}
        onSkip={() => {
          console.log('BreakFeedbackPopup onSkip called');
          setShowBreakDialog(false);
        }}
        onSkipAll={() => {
          console.log('BreakFeedbackPopup onSkipAll called');
          setShowBreakDialog(false);
          toast({
            title: "Breaks Desabilitados",
            description: "Não mostraremos mais feedbacks de break hoje",
          });
        }}
        breakNumber={breakFeedbacks?.length ? breakFeedbacks.length + 1 : 1}
        totalBreaks={8}
        sessionProgress={breakFeedbacks?.length ? (breakFeedbacks.length / 8) * 100 : 0}
        timeRemaining={360}
        isPending={breakFeedbackMutation.isPending}
        sessionId={activeSession?.id}
      />

      

      {/* Break Management Dialog */}
      <Dialog open={showBreakManagementDialog} onOpenChange={setShowBreakManagementDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center">
              <Coffee className="w-6 h-6 mr-3 text-poker-accent" />
              Gerenciamento de Breaks
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Visualize seus break feedbacks registrados durante a sessão
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Breaks Registrados */}
            <div>
              <h3 className="text-lg font-semibold text-poker-gold mb-4">Breaks Registrados Hoje</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {breakFeedbacks && breakFeedbacks.length > 0 ? (
                  breakFeedbacks.map((feedback: any) => (
                    <div key={feedback.id} className="p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Coffee className="w-4 h-4 text-green-400" />
                          <span className="text-white font-medium">
                            Break às {new Date(feedback.breakTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Badge variant="outline" className="border-green-600 text-green-400">
                            Registrado
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Foco:</span>
                          <span className="text-white font-medium">{feedback.foco}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Energia:</span>
                          <span className="text-white font-medium">{feedback.energia}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Confiança:</span>
                          <span className="text-white font-medium">{feedback.confianca}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Int. Emocional:</span>
                          <span className="text-white font-medium">{feedback.inteligenciaEmocional}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Interferências:</span>
                          <span className="text-white font-medium">{feedback.interferencias}/10</span>
                        </div>
                      </div>
                      {feedback.notes && (
                        <div className="mt-3 p-2 bg-gray-800/50 rounded text-sm">
                          <span className="text-gray-400">Notas:</span>
                          <p className="text-gray-300 mt-1">{feedback.notes}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 bg-gray-800/30 rounded-lg text-center">
                    <Coffee className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">
                      Nenhum break registrado ainda nesta sessão
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Os breaks aparecem automaticamente no minuto 54 de cada hora
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Gerar Novo Report */}
            <div className="border-t border-gray-700 pt-6">
              <Button
                onClick={() => {
                  setShowBreakManagementDialog(false);
                  setShowBreakDialog(true);
                }}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 h-12 shadow-lg"
              >
                <Plus className="w-5 h-5 mr-3" />
                Gerar Novo Report
              </Button>
              <p className="text-gray-500 text-xs text-center mt-2">
                Registre seu estado mental atual independente do horário
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button 
              onClick={() => setShowBreakManagementDialog(false)}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Tournament Dialog */}
      <Dialog open={showEditTournamentDialog} onOpenChange={setShowEditTournamentDialog}>
        <DialogContent className="max-w-md mx-auto bg-blue-900 border-blue-600">
          <DialogHeader>
            <DialogTitle className="text-blue-100">Editar Torneio</DialogTitle>
          </DialogHeader>
          {editingTournament && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-site" className="text-blue-200">Site</Label>
                <Select value={editingTournament.site || ""} onValueChange={(value) => setEditingTournament({...editingTournament, site: value})}>
                  <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                    <SelectValue placeholder="Selecione o site" />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-800 border-blue-600">
                    <SelectItem value="PokerStars">PokerStars</SelectItem>
                    <SelectItem value="GGNetwork">GGNetwork</SelectItem>
                    <SelectItem value="PartyPoker">PartyPoker</SelectItem>
                    <SelectItem value="888Poker">888Poker</SelectItem>
                    <SelectItem value="WPN">WPN</SelectItem>
                    <SelectItem value="iPoker">iPoker</SelectItem>
                    <SelectItem value="Chico">Chico</SelectItem>
                    <SelectItem value="CoinPoker">CoinPoker</SelectItem>
                    <SelectItem value="Revolution">Revolution</SelectItem>
                    <SelectItem value="Bodog">Bodog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-type" className="text-blue-200">Tipo</Label>
                <Select value={editingTournament.type || editingTournament.category || ""} onValueChange={(value) => setEditingTournament({...editingTournament, type: value, category: value})}>
                  <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-800 border-blue-600">
                    <SelectItem value="Vanilla">Vanilla</SelectItem>
                    <SelectItem value="PKO">PKO</SelectItem>
                    <SelectItem value="Mystery">Mystery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-speed" className="text-blue-200">Velocidade</Label>
                <Select value={editingTournament.speed || ""} onValueChange={(value) => setEditingTournament({...editingTournament, speed: value})}>
                  <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                    <SelectValue placeholder="Selecione a velocidade" />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-800 border-blue-600">
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Turbo">Turbo</SelectItem>
                    <SelectItem value="Hyper">Hyper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-buyIn" className="text-blue-200">Buy-in ($)</Label>
                <Input
                  id="edit-buyIn"
                  type="number"
                  value={editingTournament.buyIn || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, buyIn: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-guaranteed" className="text-blue-200">Garantido ($)</Label>
                <Input
                  id="edit-guaranteed"
                  type="number"
                  value={editingTournament.guaranteed || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, guaranteed: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-time" className="text-blue-200">Horário</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editingTournament.time || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, time: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-result" className="text-blue-200">Resultado/Prize ($)</Label>
                <Input
                  id="edit-result"
                  type="number"
                  value={editingTournament.result || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, result: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                  placeholder="Valor ganho"
                />
              </div>
              <div>
                <Label htmlFor="edit-bounty" className="text-blue-200">Bounty ($)</Label>
                <Input
                  id="edit-bounty"
                  type="number"
                  value={editingTournament.bounty || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, bounty: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                  placeholder="Valor de bounty"
                />
              </div>
              <div>
                <Label htmlFor="edit-position" className="text-blue-200">Posição</Label>
                <Input
                  id="edit-position"
                  type="number"
                  value={editingTournament.position || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, position: e.target.value ? parseInt(e.target.value) : null})}
                  className="bg-blue-800 border-blue-600 text-white"
                  placeholder="Posição final"
                />
              </div>
              <div className="flex space-x-2 mt-6">
                <Button 
                  onClick={() => setShowEditTournamentDialog(false)}
                  variant="outline"
                  className="flex-1 border-blue-600 text-blue-200 hover:bg-blue-800"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    console.log('Edit tournament mutation called with:', editingTournament);
                    updateTournamentMutation.mutate({
                      id: editingTournament.id,
                      data: {
                        site: editingTournament.site,
                        type: editingTournament.type,
                        category: editingTournament.category || editingTournament.type,
                        speed: editingTournament.speed,
                        buyIn: editingTournament.buyIn,
                        guaranteed: editingTournament.guaranteed,
                        time: editingTournament.time,
                        result: editingTournament.result || '0',
                        bounty: editingTournament.bounty || '0',
                        position: editingTournament.position || null
                      }
                    });
                    setShowEditTournamentDialog(false);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>



      {/* Pending Tournaments Warning Dialog */}
      <Dialog open={showPendingTournamentsDialog} onOpenChange={setShowPendingTournamentsDialog}>
        <DialogContent className="bg-red-900 border-red-600 text-white max-w-2xl">
          <DialogHeader className="pb-6 border-b border-red-500/30">
            <DialogTitle className="text-2xl font-bold text-red-400 flex items-center gap-3">
              <AlertTriangle className="w-7 h-7" />
              Torneios Pendentes Detectados
            </DialogTitle>
            <DialogDescription className="text-red-200 text-base mt-2">
              Você possui torneios registrados sem resultados. Para finalizar a sessão, todos os torneios devem ser contabilizados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 p-6">
            {/* Pending Tournaments List */}
            <Card className="bg-red-800/30 border-red-600/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-300 text-lg">
                  <Trophy className="w-5 h-5" />
                  Torneios Registrados Sem Resultados ({pendingTournaments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTournaments.map((tournament: any) => (
                  <div key={tournament.id} className="flex items-center justify-between p-3 bg-red-900/40 rounded-lg border border-red-600/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getSiteColor(tournament.site)}`}></div>
                      <div>
                        <div className="font-medium text-white">{tournament.name || `${tournament.site} Tournament`}</div>
                        <div className="text-sm text-red-300">
                          {tournament.site} • Buy-in: ${tournament.buyIn}
                          {tournament.rebuys > 0 && ` • Rebuys: ${tournament.rebuys}`}
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-red-600 text-white">Registrado</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Warning Message */}
            <div className="bg-red-800/50 border border-red-600/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-300 mb-2">Política de Integridade de Dados</h4>
                  <p className="text-red-200 text-sm leading-relaxed">
                    Para manter a precisão dos seus dados, todos os torneios registrados devem ter seus resultados informados antes da finalização. 
                    Os torneios sem resultados serão automaticamente marcados como <strong>GG!</strong> com prize = $0.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-red-600/30">
              <Button
                variant="outline"
                onClick={() => setShowPendingTournamentsDialog(false)}
                className="flex-1 py-3 border-red-500 text-red-300 hover:bg-red-800 hover:text-white font-medium"
              >
                Voltar e Preencher Resultados
              </Button>
              <Button
                onClick={() => {
                  finalizePendingTournamentsMutation.mutate(pendingTournaments);
                  setShowPendingTournamentsDialog(false);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold"
                disabled={finalizePendingTournamentsMutation.isPending}
              >
                {finalizePendingTournamentsMutation.isPending ? "Finalizando..." : "Finalizar Automaticamente (GG!)"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OTIMIZADO: Diálogo para editar horário dos torneios */}
      {Object.keys(editingTimeDialog).map(tournamentId => (
        editingTimeDialog[tournamentId] && (
          <Dialog key={tournamentId} open={true} onOpenChange={() => setEditingTimeDialog({...editingTimeDialog, [tournamentId]: false})}>
            <DialogContent className="sm:max-w-[500px] bg-gray-800 border-gray-700 text-white p-6 rounded-lg">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-emerald-400" />
                  Editar Horário do Torneio
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-sm">
                  Ajuste o horário do torneio usando os controles abaixo ou teclas de atalho
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Novo Horário com Input Aprimorado */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-300">Novo Horário</label>
                  <div className="flex gap-3">
                    <Input
                      type="time"
                      value={timeEditValue[tournamentId] || '20:00'}
                      onChange={(e) => setTimeEditValue({
                        ...timeEditValue,
                        [tournamentId]: e.target.value
                      })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveTime(tournamentId);
                        } else if (e.key === 'Escape') {
                          setEditingTimeDialog({...editingTimeDialog, [tournamentId]: false});
                        }
                      }}
                      className="flex-1 bg-gray-700 border-gray-600 text-white py-2.5 px-3 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ex: 14:30"
                    />
                    
                    {/* Botões de Horário Fixo */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFixedTime(tournamentId, 'now')}
                      className="border-emerald-500 text-emerald-400 hover:bg-emerald-600/20 px-3"
                    >
                      Agora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFixedTime(tournamentId, 'plus-30')}
                      className="border-emerald-500 text-emerald-400 hover:bg-emerald-600/20 px-3"
                    >
                      +30min
                    </Button>
                  </div>
                  
                  {/* Feedback Visual */}
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>Horário atual: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-emerald-400">
                      {getTimeDifference(timeEditValue[tournamentId] || '20:00')}
                    </span>
                  </div>
                </div>

                {/* Ajustes Rápidos */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-300">Ajustes Rápidos</label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => adjustTournamentTime(tournamentId, -15, true)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm"
                    >
                      -15min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => adjustTournamentTime(tournamentId, -5, true)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm"
                    >
                      -5min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => adjustTournamentTime(tournamentId, 5, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +5min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => adjustTournamentTime(tournamentId, 15, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +15min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => adjustTournamentTime(tournamentId, 30, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +30min
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => adjustTournamentTime(tournamentId, 60, true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm"
                    >
                      +60min
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500">
                    Aplicação automática: os ajustes são salvos imediatamente
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-3 pt-6 border-t border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setEditingTimeDialog({...editingTimeDialog, [tournamentId]: false})}
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleSaveTime(tournamentId)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      ))}

      {/* Modal de Anotações Rápidas */}
      <Dialog open={showQuickNotesDialog} onOpenChange={setShowQuickNotesDialog}>
        <DialogContent className="sm:max-w-[425px] bg-gradient-to-br from-blue-900 to-blue-800 border-blue-500/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-blue-100">
              📝 Anotação Rápida
            </DialogTitle>
            <DialogDescription className="text-center text-blue-200">
              Capture um insight ou observação durante sua sessão
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-blue-200">
                Sua anotação (máx. 280 caracteres)
              </Label>
              <Textarea
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder="Ex: Vilão à esquerda muito agressivo no button, ajustar ranges..."
                className="min-h-[100px] bg-blue-800/50 border-blue-500/50 text-white placeholder-blue-300/70 focus:border-blue-400"
                maxLength={280}
              />
              <div className="flex justify-between text-xs text-blue-300">
                <span>Horário atual: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>{quickNoteText.length}/280</span>
              </div>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowQuickNotesDialog(false);
                  setQuickNoteText("");
                }}
                className="flex-1 border-blue-500 text-blue-200 hover:bg-blue-600/20"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddQuickNote}
                disabled={!quickNoteText.trim() || quickNoteText.length > 280}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                Salvar Nota
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ETAPA 8: Modal de Notas Rápidas */}
      <div className={`quick-note-modal ${showQuickNoteModal ? 'show' : ''}`}>
        <div className="quick-note-content">
          <div className="quick-note-header">
            <h3 className="quick-note-title">Nota Rápida</h3>
            <p className="quick-note-time">{quickNoteTimestamp}</p>
          </div>
          
          <textarea
            className="quick-note-textarea"
            placeholder="Digite sua nota aqui..."
            value={quickNoteText}
            onChange={(e) => setQuickNoteText(e.target.value)}
            maxLength={280}
          />
          
          <div className={`char-counter ${quickNoteText.length > 240 ? 'warning' : ''} ${quickNoteText.length > 270 ? 'danger' : ''}`}>
            {quickNoteText.length}/280
          </div>
          
          <div className="quick-note-actions">
            <button
              className="quick-note-save"
              onClick={handleSaveQuickNote}
              disabled={!quickNoteText.trim() || savingQuickNote}
            >
              {savingQuickNote ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              className="quick-note-cancel"
              onClick={handleCloseQuickNoteModal}
              disabled={savingQuickNote}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {/* Seção de Teste - Screen Cap Alerts (apenas para desenvolvimento) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">🧪 Teste de Screen Cap Alerts</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={testScreenCapAlerts}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Testar Alert Atual
            </button>
            <button
              onClick={() => showNotification('✅ Teste: Status normal', 'info')}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Alert Info
            </button>
            <button
              onClick={() => showNotification('🟨 Teste: Atenção', 'warning')}
              className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
            >
              Alert Warning
            </button>
            <button
              onClick={() => showNotification('⚠️ Teste: Perigo', 'danger')}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Alert Danger
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Atual: {stats.emAndamento}/{stats.screenCap} ({Math.round((stats.emAndamento / stats.screenCap) * 100)}%)
          </p>
        </div>
      )}

      {/* ===== ETAPA 10: MODAL DE FINALIZAÇÃO DE SESSÃO ===== */}
      {showSessionSummary && sessionSummaryData && (
        <div className="session-end-modal show">
          <div className="session-end-content">
            <div className="session-end-header">
              <div className="session-end-title">🏁 Resumo da Sessão</div>
              <div className="session-end-subtitle">Sua sessão de grind foi concluída</div>
            </div>

            {/* Estatísticas Principais */}
            <div className="summary-section">
              <h4>📊 Estatísticas da Sessão</h4>
              <div className="summary-grid">
                <div className="summary-item">
                  <div className="summary-value">{sessionSummaryData.volume}</div>
                  <div className="summary-label">Torneios</div>
                </div>
                <div className="summary-item">
                  <div className="summary-value">${sessionSummaryData.invested.toFixed(2)}</div>
                  <div className="summary-label">Investido</div>
                </div>
                <div className="summary-item">
                  <div className={`summary-value ${sessionSummaryData.profit >= 0 ? 'positive' : 'negative'}`}>
                    {sessionSummaryData.profit >= 0 ? '+' : ''}${sessionSummaryData.profit.toFixed(2)}
                  </div>
                  <div className="summary-label">Profit</div>
                </div>
                <div className="summary-item">
                  <div className={`summary-value ${sessionSummaryData.roi >= 0 ? 'positive' : 'negative'}`}>
                    {sessionSummaryData.roi >= 0 ? '+' : ''}{sessionSummaryData.roi.toFixed(1)}%
                  </div>
                  <div className="summary-label">ROI</div>
                </div>
                <div className="summary-item">
                  <div className="summary-value">{sessionSummaryData.fts}</div>
                  <div className="summary-label">FTs</div>
                </div>
                <div className="summary-item">
                  <div className="summary-value">{sessionSummaryData.wins}</div>
                  <div className="summary-label">Cravadas</div>
                </div>
              </div>
            </div>

            {/* Melhor Resultado */}
            {sessionSummaryData.bestResult && (
              <div className="summary-section">
                <h4>🏆 Melhor Resultado</h4>
                <div className="best-result">
                  <div className="best-result-value">
                    {sessionSummaryData.bestResult.profit >= 0 ? '+' : ''}${sessionSummaryData.bestResult.profit.toFixed(2)}
                  </div>
                  <div className="best-result-tournament">
                    {sessionSummaryData.bestResult.name} - {sessionSummaryData.bestResult.details}
                  </div>
                </div>
              </div>
            )}

            {/* Performance Mental */}
            <div className="summary-section">
              <h4>🧠 Performance Mental Média</h4>
              <div className="mental-averages">
                <div className="mental-average">
                  <div className="mental-average-value">{sessionSummaryData.mentalAverages.focus.toFixed(1)}</div>
                  <div className="mental-average-label">Foco</div>
                </div>
                <div className="mental-average">
                  <div className="mental-average-value">{sessionSummaryData.mentalAverages.energy.toFixed(1)}</div>
                  <div className="mental-average-label">Energia</div>
                </div>
                <div className="mental-average">
                  <div className="mental-average-value">{sessionSummaryData.mentalAverages.confidence.toFixed(1)}</div>
                  <div className="mental-average-label">Confiança</div>
                </div>
                <div className="mental-average">
                  <div className="mental-average-value">{sessionSummaryData.mentalAverages.emotionalIntelligence.toFixed(1)}</div>
                  <div className="mental-average-label">Int. Emocional</div>
                </div>
                <div className="mental-average">
                  <div className="mental-average-value">{sessionSummaryData.mentalAverages.interference.toFixed(1)}</div>
                  <div className="mental-average-label">Interferências</div>
                </div>
              </div>
            </div>

            {/* Objetivos */}
            {sessionSummaryData.objectives && (
              <div className="summary-section">
                <h4>🎯 Objetivos da Sessão</h4>
                <div className="objectives-review">
                  <div className={`objective-status objective-${sessionSummaryData.objectiveStatus}`}>
                    {sessionSummaryData.objectiveStatus === 'completed' && '✅ Objetivo Cumprido'}
                    {sessionSummaryData.objectiveStatus === 'partial' && '🟨 Objetivo Parcial'}
                    {sessionSummaryData.objectiveStatus === 'missed' && '❌ Objetivo Perdido'}
                  </div>
                  <div>"{sessionSummaryData.objectives}"</div>
                </div>
              </div>
            )}

            {/* Notas Rápidas */}
            {sessionSummaryData.quickNotes && sessionSummaryData.quickNotes.length > 0 && (
              <div className="summary-section">
                <h4>📝 Notas Rápidas da Sessão</h4>
                <div className="quick-notes-summary">
                  {sessionSummaryData.quickNotes.map((note, index) => (
                    <div key={note.id || index} className="quick-note-item">
                      <div className="quick-note-time">{note.timestamp}</div>
                      <div className="quick-note-text">{note.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notas Finais */}
            <div className="summary-section">
              <h4>📝 Notas Finais</h4>
              <div className="final-notes">
                <textarea
                  value={finalNotes}
                  onChange={(e) => setFinalNotes(e.target.value)}
                  placeholder="Como foi a sessão? Principais aprendizados, ajustes para próxima vez..."
                />
              </div>
            </div>

            <div className="session-end-actions">
              <button className="continue-session-btn" onClick={handleContinueSession}>
                ↩️ Continuar Sessão
              </button>
              <button className="end-session-btn" onClick={handleEndSession}>
                🏁 Finalizar Sessão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação */}
      {showConfirmationModal && (
        <div className="confirmation-modal show">
          <div className="confirmation-content">
            <div className="confirmation-title">⚠️ Atenção!</div>
            <div className="confirmation-message">
              Você tem torneios registrados em andamento. Deseja finalizar mesmo assim?
            </div>
            {pendingTournaments.length > 0 && (
              <div className="pending-tournaments">
                <div className="pending-list">
                  Torneios pendentes:
                  <ul>
                    {pendingTournaments.map(tournament => (
                      <li key={tournament.id}>
                        {tournament.name} ({tournament.site})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="confirmation-actions">
              <button className="cancel-btn" onClick={handleCloseConfirmationModal}>
                ❌ Cancelar
              </button>
              <button className="force-end-btn" onClick={handleForceEndSession}>
                🏁 Finalizar Mesmo Assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}