import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Trash2 } from "lucide-react";

interface NoteCardProps {
  note: any;
  onDelete: () => void;
}

export function NoteCard({ note, onDelete }: NoteCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-poker-accent" />
              <h4 className="font-semibold text-white">{note.title}</h4>
            </div>
            <p className="text-gray-300 whitespace-pre-wrap mb-3">{note.content}</p>
            {note.tags && (
              <div className="flex flex-wrap gap-1 mb-2">
                {note.tags.split(',').map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs bg-gray-700">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">
              {formatDate(note.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
