import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Star, TrendingUp, ShieldCheck, Clock } from "lucide-react";

interface OverviewReason { kind: "roi" | "low_variance" | "profit_per_hour"; label: string }
interface OverviewFamily {
  familyKey: string; site: string; groupName: string; buyInTier: string; type: string;
  volume: number; roi: number; avgBuyin: number; totalProfit: number; avgFieldSize: number;
  profitPerTableHour: number | null; durationCoverage: number; deepStackRate: number;
  uniquePlayers: number; reasons: OverviewReason[];
  recentResults: Array<{ name: string; playerNick: string | null; datePlayed: string | null; position: number | null; fieldSize: number | null; prize: number }>;
}
interface OverviewResult {
  byPlatform: Array<{ site: string; families: OverviewFamily[] }>;
  totalParsed: number; uniquePlayers: number;
}

const reasonIcon = (k: OverviewReason["kind"]) =>
  k === "roi" ? <TrendingUp className="w-3 h-3" /> : k === "low_variance" ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />;

export function OverviewPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<OverviewResult | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const analyze = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return (await apiRequest("POST", "/api/library/overview/analyze", fd)) as OverviewResult;
    },
    onSuccess: (data) => setResult(data),
    onError: (e: any) => toast({ title: "Falha na análise", description: e?.message || "Erro", variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async (fam: OverviewFamily) =>
      apiRequest("POST", "/api/library/highlights", {
        site: fam.site, familyKey: fam.familyKey, groupName: fam.groupName,
        buyInTier: fam.buyInTier, type: fam.type,
        metrics: { roi: fam.roi, volume: fam.volume, avgBuyin: fam.avgBuyin, profitPerTableHour: fam.profitPerTableHour, avgFieldSize: fam.avgFieldSize },
        reasons: fam.reasons, source: "overview",
      }),
    onSuccess: (_d, fam) => {
      setSaved((s) => new Set(s).add(fam.familyKey));
      queryClient.invalidateQueries({ queryKey: ["/api/library/highlights"] });
      toast({ title: "Salvo", description: "Card fixado na página Torneios." });
    },
    onError: (e: any) => toast({ title: "Falha ao salvar", description: e?.message || "Erro", variant: "destructive" }),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" /> Overview (CSV grande)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto bg-card border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Overview — melhores torneios por plataforma</DialogTitle>
          <DialogDescription className="text-gray-400">
            Suba um CSV grande (vários jogadores). O arquivo NÃO é salvo — só analisado para achar
            os melhores torneios de cada plataforma. Salve os que interessarem.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 mb-4">
          <input
            ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze.mutate(f); }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={analyze.isPending} className="gap-2">
            {analyze.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Escolher CSV
          </Button>
          {result && (
            <span className="text-sm text-gray-400">
              {result.totalParsed.toLocaleString()} torneios · {result.uniquePlayers} jogadores
            </span>
          )}
        </div>

        {result && result.byPlatform.length === 0 && (
          <p className="text-gray-400 text-sm">Nenhuma família com volume suficiente (mín. 20) encontrada.</p>
        )}

        <div className="space-y-5">
          {result?.byPlatform.map((plat) => (
            <div key={plat.site}>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">{plat.site}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {plat.families.map((fam) => (
                  <div key={fam.familyKey} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-white font-medium text-sm truncate">{fam.groupName}</div>
                        <div className="text-xs text-gray-400">
                          {fam.volume} torneios · ABI ${fam.avgBuyin.toFixed(0)} · field méd. {fam.avgFieldSize}
                        </div>
                      </div>
                      <Button
                        size="sm" variant={saved.has(fam.familyKey) ? "secondary" : "default"}
                        disabled={saved.has(fam.familyKey) || save.isPending}
                        onClick={() => save.mutate(fam)} className="gap-1 shrink-0"
                      >
                        <Star className="w-3 h-3" /> {saved.has(fam.familyKey) ? "Salvo" : "Salvar"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {fam.reasons.map((r, i) => (
                        <Badge key={i} className="text-[10px] bg-gray-700 text-gray-200 gap-1">
                          {reasonIcon(r.kind)} {r.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
