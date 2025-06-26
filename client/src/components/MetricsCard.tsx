import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: "positive" | "negative" | "neutral";
  trendValue?: string;
  className?: string;
}

export default function MetricsCard({
  title,
  value,
  icon: Icon,
  trend = "neutral",
  trendValue,
  className
}: MetricsCardProps) {
  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "positive":
        return "text-green-400";
      case "negative":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getTrendIndicator = (trend: string) => {
    switch (trend) {
      case "positive":
        return "+";
      case "negative":
        return "";
      default:
        return "";
    }
  };

  return (
    <Card className={cn("bg-poker-surface border-gray-700", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
          <Icon className="h-5 w-5 text-poker-gold" />
        </div>
        
        <div className="space-y-1">
          <p className="text-2xl font-bold text-white font-mono">
            {value}
          </p>
          {trendValue && (
            <p className={cn("text-sm", getTrendColor(trend))}>
              {getTrendIndicator(trend)}{trendValue}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
