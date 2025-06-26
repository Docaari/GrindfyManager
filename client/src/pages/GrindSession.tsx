import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SessionTracker from "@/components/SessionTracker";
import { Play, Square, Plus, Clock, TrendingUp, Target } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function GrindSession() {
  const [activeSession, setActiveSession] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  const { data: tournaments } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      const response = await fetch("/api/tournaments?limit=20", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournaments");
      return response.json();
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/grind-sessions", {
        date: new Date().toISOString(),
        status: "active",
        startTime: new Date().toISOString(),
        plannedBuyins: "0",
        actualBuyins: "0",
        profitLoss: "0",
      });
      return response.json();
    },
    onSuccess: (newSession) => {
      setActiveSession(newSession);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Session Started",
        description: "Your grind session has been activated",
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

  const endSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("PUT", `/api/grind-sessions/${sessionId}`, {
        status: "completed",
        endTime: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      setActiveSession(null);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Session Ended",
        description: "Your grind session has been completed",
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

  const currentSession = activeSession || sessions?.find((s: any) => s.status === "active");

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const formatDuration = (start: string) => {
    const startTime = new Date(start);
    const now = new Date();
    const diff = now.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
          <p className="text-gray-400">Loading your session data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
        <p className="text-gray-400">Track your live tournament session</p>
      </div>

      {!currentSession ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-6">
              <Play className="h-16 w-16 mx-auto mb-4 text-poker-green" />
              <h3 className="text-lg font-semibold mb-2">No Active Session</h3>
              <p>Start a new grind session to track your tournaments in real-time.</p>
            </div>
            <Button 
              onClick={() => startSessionMutation.mutate()}
              disabled={startSessionMutation.isPending}
              className="bg-poker-green hover:bg-poker-green-light text-white"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Session Status */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Badge className="bg-green-600">Active</Badge>
                    Session Status
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Started {currentSession.startTime ? formatDuration(currentSession.startTime) : "0:00"} ago
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-right">
                    <div className="text-lg font-mono text-white">
                      {currentSession.startTime ? formatDuration(currentSession.startTime) : "0:00:00"}
                    </div>
                    <div className="text-sm text-gray-400">Duration</div>
                  </div>
                  <Button
                    onClick={() => endSessionMutation.mutate(currentSession.id)}
                    disabled={endSessionMutation.isPending}
                    variant="destructive"
                    size="sm"
                  >
                    <Square className="h-4 w-4 mr-1" />
                    End Session
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-poker-gold font-mono">
                    {formatCurrency(currentSession.plannedBuyins || 0)}
                  </div>
                  <div className="text-sm text-gray-400">Planned Buy-ins</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-white">
                    {formatCurrency(currentSession.actualBuyins || 0)}
                  </div>
                  <div className="text-sm text-gray-400">Actual Buy-ins</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold font-mono ${
                    parseFloat(currentSession.profitLoss || "0") >= 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {parseFloat(currentSession.profitLoss || "0") >= 0 ? "+" : ""}
                    {formatCurrency(currentSession.profitLoss || 0)}
                  </div>
                  <div className="text-sm text-gray-400">Current P&L</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-white">
                    {currentSession.tournamentsPlayed || 0}
                  </div>
                  <div className="text-sm text-gray-400">Tournaments</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Session Tracker */}
          <SessionTracker 
            session={currentSession}
            tournaments={tournaments || []}
          />

          {/* Session Actions */}
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Button className="bg-poker-green hover:bg-poker-green-light text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tournament
                </Button>
                <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  View Stats
                </Button>
                <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                  <Target className="h-4 w-4 mr-2" />
                  Set Goals
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Sessions */}
      {sessions && sessions.length > 0 && (
        <Card className="bg-poker-surface border-gray-700 mt-6">
          <CardHeader>
            <CardTitle className="text-white">Recent Sessions</CardTitle>
            <CardDescription className="text-gray-400">
              Your previous grind sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sessions.slice(0, 5).map((session: any) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={session.status === "active" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                      <span className="text-white font-medium">
                        {new Date(session.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {session.tournamentsPlayed || 0} tournaments • {session.duration || 0} minutes
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono ${
                      parseFloat(session.profitLoss || "0") >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {parseFloat(session.profitLoss || "0") >= 0 ? "+" : ""}
                      {formatCurrency(session.profitLoss || 0)}
                    </div>
                    <div className="text-sm text-gray-400">P&L</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
