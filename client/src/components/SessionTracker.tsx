import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Square, DollarSign, Trophy, Clock } from "lucide-react";

interface SessionTrackerProps {
  session: any;
  tournaments: any[];
}

export default function SessionTracker({ session, tournaments }: SessionTrackerProps) {
  const [newTournament, setNewTournament] = useState({
    name: "",
    buyIn: "",
    site: "",
    format: "MTT",
    category: "Vanilla",
    speed: "Regular"
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [sessionTime, setSessionTime] = useState("00:00:00");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Update session timer
  useEffect(() => {
    if (session?.startTime && session?.status === "active") {
      const interval = setInterval(() => {
        const start = new Date(session.startTime);
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setSessionTime(
          `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [session]);

  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      const response = await apiRequest("POST", "/api/tournaments", {
        ...tournamentData,
        datePlayed: new Date().toISOString(),
        grindSessionId: session.id,
        position: 0,
        prize: "0",
        fieldSize: 0,
        currency: "BRL"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      setNewTournament({
        name: "",
        buyIn: "",
        site: "",
        format: "MTT",
        category: "Vanilla",
        speed: "Regular"
      });
      setShowAddForm(false);
      toast({
        title: "Tournament Added",
        description: "Tournament has been added to your session",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/tournaments/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Tournament Updated",
        description: "Tournament result has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddTournament = () => {
    if (!newTournament.name || !newTournament.buyIn || !newTournament.site) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    addTournamentMutation.mutate(newTournament);
  };

  const handleUpdateResult = (tournamentId: string, position: number, prize: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { position, prize }
    });
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const getStatusBadge = (tournament: any) => {
    if (tournament.position === 0) {
      return <Badge className="bg-blue-600">Running</Badge>;
    } else if (parseFloat(tournament.prize) > parseFloat(tournament.buyIn)) {
      return <Badge className="bg-green-600">ITM</Badge>;
    } else {
      return <Badge className="bg-red-600">Busted</Badge>;
    }
  };

  const sessionTournaments = tournaments.filter(t => t.grindSessionId === session.id);

  return (
    <div className="space-y-6">
      {/* Active Tournaments */}
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Active Tournaments</CardTitle>
            <Button
              onClick={() => setShowAddForm(!showAddForm)}
              size="sm"
              className="bg-poker-green hover:bg-poker-green-light text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Tournament
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddForm && (
            <Card className="bg-gray-800 border-gray-700 mb-4">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Tournament name"
                    value={newTournament.name}
                    onChange={(e) => setNewTournament(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                  <Input
                    type="number"
                    placeholder="Buy-in (R$)"
                    value={newTournament.buyIn}
                    onChange={(e) => setNewTournament(prev => ({ ...prev, buyIn: e.target.value }))}
                    className="bg-gray-700 border-gray-600 text-white"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Select
                    value={newTournament.site}
                    onValueChange={(value) => setNewTournament(prev => ({ ...prev, site: value }))}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue placeholder="Site" />
                    </SelectTrigger>
                    <SelectContent className="bg-poker-surface border-gray-700">
                      <SelectItem value="PokerStars">PokerStars</SelectItem>
                      <SelectItem value="PartyPoker">PartyPoker</SelectItem>
                      <SelectItem value="888poker">888poker</SelectItem>
                      <SelectItem value="GGPoker">GGPoker</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={newTournament.format}
                    onValueChange={(value) => setNewTournament(prev => ({ ...prev, format: value }))}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-poker-surface border-gray-700">
                      <SelectItem value="MTT">MTT</SelectItem>
                      <SelectItem value="SNG">SNG</SelectItem>
                      <SelectItem value="Spin & Go">Spin & Go</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={newTournament.category}
                    onValueChange={(value) => setNewTournament(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-poker-surface border-gray-700">
                      <SelectItem value="Vanilla">Vanilla</SelectItem>
                      <SelectItem value="PKO">PKO</SelectItem>
                      <SelectItem value="Mystery">Mystery</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={newTournament.speed}
                    onValueChange={(value) => setNewTournament(prev => ({ ...prev, speed: value }))}
                  >
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-poker-surface border-gray-700">
                      <SelectItem value="Regular">Regular</SelectItem>
                      <SelectItem value="Turbo">Turbo</SelectItem>
                      <SelectItem value="Hyper">Hyper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleAddTournament}
                    disabled={addTournamentMutation.isPending}
                    className="bg-poker-green hover:bg-poker-green-light text-white"
                  >
                    Add Tournament
                  </Button>
                  <Button
                    onClick={() => setShowAddForm(false)}
                    variant="outline"
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {sessionTournaments.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No tournaments in this session yet</p>
                <p className="text-sm">Add your first tournament above</p>
              </div>
            ) : (
              sessionTournaments.map((tournament) => (
                <div key={tournament.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-white">{tournament.name}</p>
                        <p className="text-sm text-gray-400">
                          {tournament.site} • {formatCurrency(tournament.buyIn)}
                        </p>
                      </div>
                      {getStatusBadge(tournament)}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className={`font-mono ${
                        parseFloat(tournament.prize) > parseFloat(tournament.buyIn) 
                          ? "text-green-400" 
                          : parseFloat(tournament.prize) === 0 
                          ? "text-gray-400" 
                          : "text-red-400"
                      }`}>
                        {formatCurrency(tournament.prize)}
                      </div>
                      <div className="text-sm text-gray-400">
                        {tournament.position > 0 ? `Position: ${tournament.position}` : "Running"}
                      </div>
                    </div>
                    
                    {tournament.position === 0 && (
                      <div className="flex space-x-1">
                        <Button
                          onClick={() => handleUpdateResult(tournament.id, 1, (parseFloat(tournament.buyIn) * 5).toString())}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Win
                        </Button>
                        <Button
                          onClick={() => handleUpdateResult(tournament.id, 999, "0")}
                          size="sm"
                          variant="destructive"
                        >
                          Bust
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Session Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <Clock className="h-8 w-8 mx-auto mb-2 text-poker-gold" />
            <div className="text-2xl font-mono text-white mb-1">{sessionTime}</div>
            <div className="text-sm text-gray-400">Session Time</div>
          </CardContent>
        </Card>

        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-8 w-8 mx-auto mb-2 text-poker-gold" />
            <div className="text-2xl font-mono text-white mb-1">
              {formatCurrency(sessionTournaments.reduce((sum, t) => sum + parseFloat(t.buyIn), 0))}
            </div>
            <div className="text-sm text-gray-400">Total Buy-ins</div>
          </CardContent>
        </Card>

        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-poker-gold" />
            <div className="text-2xl font-mono text-white mb-1">{sessionTournaments.length}</div>
            <div className="text-sm text-gray-400">Tournaments</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
