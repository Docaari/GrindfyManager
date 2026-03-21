import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video, FileText, Download, ExternalLink, CheckCircle, Clock, Circle, Trash2 } from "lucide-react";

interface MaterialCardProps {
  material: any;
  onDelete: () => void;
}

export function MaterialCard({ material, onDelete }: MaterialCardProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="w-5 h-5 text-red-500" />;
      case "article": return <FileText className="w-5 h-5 text-blue-500" />;
      case "file": return <Download className="w-5 h-5 text-green-500" />;
      case "link": return <ExternalLink className="w-5 h-5 text-purple-500" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "in_progress": return <Clock className="w-5 h-5 text-yellow-500" />;
      default: return <Circle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Concluído";
      case "in_progress": return "Em andamento";
      default: return "Não iniciado";
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getTypeIcon(material.type)}
            <div>
              <h4 className="font-semibold text-white">{material.title}</h4>
              {material.description && (
                <p className="text-sm text-gray-400 mt-1">{material.description}</p>
              )}
              {material.url && (
                <a
                  href={material.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-poker-accent hover:text-poker-accent/80 mt-1 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir link
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {getStatusIcon(material.status)}
              <span className="ml-1">{getStatusLabel(material.status)}</span>
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
