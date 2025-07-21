import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
}

interface TournamentTableProps {
  tournaments: Tournament[];
  onEdit?: (tournament: Tournament) => void;
  onDelete?: (tournamentId: string) => void;
}

export default function TournamentTable({ tournaments, onEdit, onDelete }: TournamentTableProps) {
  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const calculateROI = (buyin: string, prize: string) => {
    const buyinNum = parseFloat(buyin);
    const prizeNum = parseFloat(prize);
    if (buyinNum === 0) return 0;
    return ((prizeNum - buyinNum) / buyinNum) * 100;
  };

  const getSiteColor = (site: string) => {
    switch (site.toLowerCase()) {
      case "pokerstars":
        return "bg-red-600";
      case "partypoker":
        return "bg-blue-600";
      case "888poker":
        return "bg-orange-600";
      case "ggpoker":
        return "bg-green-600";
      default:
        return "bg-gray-600";
    }
  };

  // Validação defensiva - garantir que tournaments é array
  if (!tournaments || !Array.isArray(tournaments) || tournaments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="mb-2">No tournaments found</p>
        <p className="text-sm">Upload your tournament history to see results here</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700">
            <TableHead className="text-gray-400">Data</TableHead>
            <TableHead className="text-gray-400">Site</TableHead>
            <TableHead className="text-gray-400">Nome</TableHead>
            <TableHead className="text-gray-400 text-right">Buy-in</TableHead>
            <TableHead className="text-gray-400 text-right">Posição</TableHead>
            <TableHead className="text-gray-400 text-right">Profit</TableHead>
            <TableHead className="text-gray-400 text-center">Status</TableHead>
            <TableHead className="text-gray-400 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tournaments.map((tournament) => {
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
                
                {/* Status */}
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
  );
}
