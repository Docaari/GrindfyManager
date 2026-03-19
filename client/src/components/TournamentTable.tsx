import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MoreHorizontal, Edit, Trash2, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getTableSiteColor, getTableTypeColor, getTableSpeedColor } from "@/lib/poker-colors";

interface Tournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  position?: number;
  prize: string;
  datePlayed: string;
  fieldSize?: number;
  finalTable: boolean;
  bigHit: boolean;
  category?: string; // Tipo: Vanilla, PKO, Mystery
  speed?: string;    // Velocidade: Normal, Turbo, Hyper
}

interface TournamentTableProps {
  tournaments: Tournament[];
  filters?: any;
  period?: string;
  onEdit?: (tournament: Tournament) => void;
  onDelete?: (tournamentId: string) => void;
}

type SortType = 'date' | 'profit-high' | 'profit-low';

export default function TournamentTable({ tournaments, filters, period, onEdit, onDelete }: TournamentTableProps) {
  const [sortType, setSortType] = useState<SortType>('date');
  const [isLoadingSort, setIsLoadingSort] = useState(false);
  
  // Query para buscar todos os torneios quando necessário para ordenação
  const { data: allTournaments, refetch: refetchAllTournaments } = useQuery({
    queryKey: ['/api/tournaments', 'sort', sortType, period, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      // Para ordenação, não aplicar filtros de período - buscar TODA a base de dados
      
      // Adicionar ordenação específica - usar parâmetro sortBy diretamente
      if (sortType === 'profit-high') {
        params.append('sortBy', 'profit-high');
        params.append('limit', '100'); // Buscar mais registros para maiores lucros
      } else if (sortType === 'profit-low') {
        params.append('sortBy', 'profit-low');
        params.append('limit', '100'); // Buscar mais registros para maiores perdas
      } else {
        params.append('sortBy', 'date');
        params.append('limit', '100'); // Últimos 100 por data
      }
      
      const response = await apiRequest('GET', `/api/tournaments?${params}`);
      return response;
    },
    enabled: false, // Só busca quando necessário
  });

  // Função para lidar com ordenação
  const handleSort = async (newSortType: SortType) => {
    setSortType(newSortType);
    setIsLoadingSort(true);
    try {
      await refetchAllTournaments();
    } finally {
      setIsLoadingSort(false);
    }
  };
  
  // Determinar quais torneios mostrar (local ou da busca completa)
  const displayTournaments = allTournaments || tournaments;

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  const calculateROI = (buyin: string, prize: string) => {
    const buyinNum = parseFloat(buyin);
    const prizeNum = parseFloat(prize);
    if (buyinNum === 0) return 0;
    return ((prizeNum - buyinNum) / buyinNum) * 100;
  };

  // Color functions imported from @/lib/poker-colors
  const getSiteColor = getTableSiteColor;
  const getTypeColor = getTableTypeColor;
  const getSpeedColor = getTableSpeedColor;

  // Detectar categoria baseada no nome (fallback se não vier do backend)
  const detectCategory = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('mystery')) return 'Mystery';
    if (lowerName.includes('pko') || lowerName.includes('knockout') || lowerName.includes('bounty')) return 'PKO';
    return 'Vanilla';
  };

  // Detectar velocidade baseada no nome (fallback se não vier do backend)
  const detectSpeed = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('hyper') || lowerName.includes('super turbo')) return 'Hyper';
    if (lowerName.includes('turbo')) return 'Turbo';
    return 'Normal';
  };

  // Função de ordenação para torneios locais quando não há busca específica
  const sortedTournaments = useMemo(() => {
    const tournamentsToSort = displayTournaments;
    if (!tournamentsToSort || tournamentsToSort.length === 0) return [];
    
    // Se temos dados da busca completa, usá-los diretamente pois já vêm ordenados do backend
    if (allTournaments && allTournaments.length > 0) {
      return allTournaments;
    }
    
    const sorted = [...tournamentsToSort].sort((a, b) => {
      switch (sortType) {
        case 'date':
          return new Date(b.datePlayed).getTime() - new Date(a.datePlayed).getTime();
        case 'profit-high':
          // Calcular profit real: prize - buyIn
          const profitA = parseFloat(a.prize || '0') - parseFloat(a.buyIn || '0');
          const profitB = parseFloat(b.prize || '0') - parseFloat(b.buyIn || '0');
          return profitB - profitA; // DESC: maior primeiro
        case 'profit-low':
          // Calcular profit real: prize - buyIn (valores mais negativos primeiro)
          const lossA = parseFloat(a.prize || '0') - parseFloat(a.buyIn || '0');
          const lossB = parseFloat(b.prize || '0') - parseFloat(b.buyIn || '0');
          return lossA - lossB; // ASC: menor primeiro (mais negativo primeiro)
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [displayTournaments, allTournaments, sortType]);

  // Validação defensiva - garantir que tournaments é array
  if (!tournaments || !Array.isArray(tournaments) || tournaments.length === 0) {
    return (
      <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-700/50">
        <div className="text-center text-gray-400">
          <p className="mb-2 text-lg">Nenhum torneio encontrado</p>
          <p className="text-sm">Importe seu histórico de torneios para ver os resultados aqui</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden">
      {/* Header moderno com gradientes e botões de ordenação */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-8 py-6 border-b border-gray-600/50">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Título e descrição */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
              🏆 Todos os Torneios
            </h3>
            <p className="text-gray-300 text-sm">
              Histórico detalhado de torneios do período selecionado
            </p>
          </div>
          
          {/* Botões de ordenação */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant={sortType === 'date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSort('date')}
              disabled={isLoadingSort}
              className={`flex items-center gap-2 transition-all duration-300 ${
                sortType === 'date' 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg transform scale-105' 
                  : 'border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <Calendar className="h-4 w-4" />
              {isLoadingSort && sortType === 'date' ? 'Carregando...' : 'Data'}
            </Button>
            
            <Button
              variant={sortType === 'profit-high' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSort('profit-high')}
              disabled={isLoadingSort}
              className="justify-center whitespace-nowrap text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border bg-background h-9 rounded-md px-3 flex items-center gap-2 transition-all duration-300 border-gray-500 hover:bg-gray-700 hover:text-white text-[#000000]"
            >
              <TrendingUp className="h-4 w-4" />
              {isLoadingSort && sortType === 'profit-high' ? 'Carregando...' : 'Maiores Lucros'}
            </Button>
            
            <Button
              variant={sortType === 'profit-low' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSort('profit-low')}
              disabled={isLoadingSort}
              className={`flex items-center gap-2 transition-all duration-300 ${
                sortType === 'profit-low' 
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg transform scale-105' 
                  : 'border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              {isLoadingSort && sortType === 'profit-low' ? 'Carregando...' : 'Maiores Perdas'}
            </Button>
          </div>
        </div>
      </div>
      {/* Tabela com scroll otimizado */}
      <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow className="border-gray-700">
            <TableHead className="text-gray-400">Data</TableHead>
            <TableHead className="text-gray-400">Site</TableHead>
            <TableHead className="text-gray-400">Nome</TableHead>
            <TableHead className="text-gray-400 text-right">Buy-in</TableHead>
            <TableHead className="text-gray-400 text-center">Tipo</TableHead>
            <TableHead className="text-gray-400 text-center">Velocidade</TableHead>
            <TableHead className="text-gray-400 text-right">Posição</TableHead>
            <TableHead className="text-gray-400 text-right">Profit</TableHead>
            <TableHead className="text-gray-400 text-center"></TableHead>
            <TableHead className="text-gray-400 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTournaments.map((tournament: any) => {
            const profit = parseFloat(tournament.prize);
            const isProfit = profit > 0;
            
            return (
              <TableRow key={tournament.id} className="border-gray-800">
                {/* Data */}
                <TableCell className="text-white">
                  {formatDate(tournament.datePlayed)}
                </TableCell>
                
                {/* Site */}
                <TableCell>
                  <Badge className={`${getSiteColor(tournament.site)} text-white`}>
                    {tournament.site}
                  </Badge>
                </TableCell>
                
                {/* Nome */}
                <TableCell className="text-white">
                  <div className="max-w-xs truncate">
                    {tournament.name}
                  </div>
                </TableCell>
                
                {/* Buy-in */}
                <TableCell className="text-right font-mono text-white">
                  {formatCurrency(tournament.buyIn)}
                </TableCell>
                
                {/* Tipo */}
                <TableCell className="text-center">
                  <Badge 
                    className={`text-xs ${getTypeColor(tournament.category || detectCategory(tournament.name))}`}
                  >
                    {tournament.category || detectCategory(tournament.name)}
                  </Badge>
                </TableCell>
                
                {/* Velocidade */}
                <TableCell className="text-center">
                  <Badge 
                    className={`text-xs ${getSpeedColor(tournament.speed || detectSpeed(tournament.name))}`}
                  >
                    {tournament.speed || detectSpeed(tournament.name)}
                  </Badge>
                </TableCell>
                
                {/* Posição */}
                <TableCell className="text-right text-white">
                  {tournament.position && tournament.fieldSize 
                    ? `${tournament.position}/${tournament.fieldSize.toLocaleString()}`
                    : tournament.position || "-"
                  }
                </TableCell>
                
                {/* Profit */}
                <TableCell className={`text-right font-mono ${
                  isProfit ? "text-green-400" : profit < 0 ? "text-red-400" : "text-white"
                }`}>
                  {formatCurrency(tournament.prize)}
                </TableCell>
                
                {/* Status sem título */}
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {tournament.finalTable && (
                      <Badge variant="outline" className="text-xs text-poker-gold border-poker-gold">
                        FT
                      </Badge>
                    )}
                    {tournament.bigHit && (
                      <Badge variant="outline" className="text-xs text-green-400 border-green-400">
                        Big Hit
                      </Badge>
                    )}
                  </div>
                </TableCell>
                
                {/* Actions */}
                <TableCell>
                  {(onEdit || onDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-poker-surface border-gray-700">
                        {onEdit && (
                          <DropdownMenuItem
                            onClick={() => onEdit(tournament)}
                            className="text-white hover:bg-gray-700"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem
                            onClick={() => onDelete(tournament.id)}
                            className="text-red-400 hover:bg-gray-700"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        </Table>
      </div>
    </div>
  );
}
