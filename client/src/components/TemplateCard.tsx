import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, TrendingUp, Trophy, Target, Calendar } from "lucide-react";

interface Template {
  id: string;
  name: string;
  site: string;
  format: string;
  category: string;
  speed: string;
  avgBuyIn: string;
  avgRoi: string;
  totalPlayed: number;
  totalProfit: string;
  finalTables: number;
  bigHits: number;
  lastPlayed?: string;
}

interface TemplateCardProps {
  template: Template;
  onEdit?: (template: Template) => void;
  onAddToPlan?: (template: Template) => void;
}

export default function TemplateCard({ template, onEdit, onAddToPlan }: TemplateCardProps) {
  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const formatPercentage = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return `${num.toFixed(1)}%`;
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
        return "bg-poker-green";
    }
  };

  const getROIColor = (roi: string | number) => {
    const num = typeof roi === "string" ? parseFloat(roi) : roi;
    if (num > 0) return "text-green-400";
    if (num < 0) return "text-red-400";
    return "text-gray-400";
  };

  const getProfitColor = (profit: string | number) => {
    const num = typeof profit === "string" ? parseFloat(profit) : profit;
    if (num > 0) return "text-green-400";
    if (num < 0) return "text-red-400";
    return "text-gray-400";
  };

  const formatLastPlayed = (dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
    });
  };

  const roi = parseFloat(template.avgRoi);
  const profit = parseFloat(template.totalProfit);

  return (
    <Card className="bg-poker-surface border-gray-700 hover:border-gray-600 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-white text-lg">{template.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge className={`${getSiteColor(template.site)} text-white text-xs`}>
                {template.site}
              </Badge>
              <Badge variant="outline" className="text-xs text-gray-400 border-gray-600">
                {template.format}
              </Badge>
              <Badge variant="outline" className="text-xs text-gray-400 border-gray-600">
                {template.category}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button
                onClick={() => onEdit(template)}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-400">ROI</span>
            </div>
            <div className={`text-lg font-bold font-mono ${getROIColor(roi)}`}>
              {roi > 0 ? "+" : ""}{formatPercentage(template.avgRoi)}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Trophy className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-400">Played</span>
            </div>
            <div className="text-lg font-bold font-mono text-white">
              {template.totalPlayed.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Profit:</span>
            <span className={`font-mono ${getProfitColor(profit)}`}>
              {profit > 0 ? "+" : ""}{formatCurrency(template.totalProfit)}
            </span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Avg Buy-in:</span>
            <span className="font-mono text-white">{formatCurrency(template.avgBuyIn)}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Final Tables:</span>
            <span className="font-mono text-white">{template.finalTables}</span>
          </div>

          {template.bigHits > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Big Hits:</span>
              <span className="font-mono text-poker-gold">{template.bigHits}</span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Last Played:</span>
            <span className="text-white">{formatLastPlayed(template.lastPlayed)}</span>
          </div>
        </div>

        {/* Performance Indicator */}
        <div className="pt-3 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Performance</span>
            <div className="flex items-center gap-1">
              {roi > 10 ? (
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
              ) : roi > 0 ? (
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
              ) : (
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
              )}
              <span className="text-xs text-gray-400">
                {roi > 10 ? "Excellent" : roi > 0 ? "Good" : "Poor"}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {onAddToPlan ? (
            <Button
              onClick={() => onAddToPlan(template)}
              className="flex-1 bg-poker-green hover:bg-poker-green-light text-white text-sm"
              size="sm"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add to Plan
            </Button>
          ) : (
            <Button
              className="flex-1 bg-poker-green hover:bg-poker-green-light text-white text-sm"
              size="sm"
            >
              <Calendar className="h-3 w-3 mr-1" />
              Schedule
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <Target className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
