import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Brain, Plus } from "lucide-react";
import { type StudyCard, PRIORITIES } from "./types";
import { getScoreColor, getPriorityColor, formatTime } from "./utils";

interface StudyCardGridProps {
  filteredCards: StudyCard[];
  searchQuery: string;
  selectedCategory: string;
  onSelectCard: (card: StudyCard) => void;
  onCreateNew: () => void;
}

export function StudyCardGrid({ filteredCards, searchQuery, selectedCategory, onSelectCard, onCreateNew }: StudyCardGridProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCards.map((card: StudyCard) => (
          <Card
            key={card.id}
            className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => onSelectCard(card)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-2">
                <Badge className={`${getPriorityColor(card.priority)} text-white`}>
                  {PRIORITIES.find(p => p.value === card.priority)?.label}
                </Badge>
                <Badge variant="outline" className="text-foreground border-gray-400">
                  {card.category}
                </Badge>
              </div>
              <CardTitle className="text-foreground text-lg">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className={`font-semibold ${getScoreColor(card.knowledgeScore || 0)}`}>
                    {card.knowledgeScore || 0}%
                  </span>
                </div>
                <Progress value={card.knowledgeScore || 0} className="h-2" />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tempo investido</span>
                  <span className="text-foreground">{formatTime(card.timeInvested || 0)}</span>
                </div>

                {card.currentStat && card.targetStat && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Stat atual</span>
                    <span className="text-foreground">
                      {card.currentStat}% → {card.targetStat}%
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredCards.length === 0 && (
        <div className="text-center py-12">
          <Brain className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-muted-foreground mb-2">
            {searchQuery || selectedCategory ? "Nenhum estudo encontrado" : "Nenhum estudo criado"}
          </h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery || selectedCategory ?
              "Tente ajustar os filtros ou criar um novo estudo" :
              "Comece criando seu primeiro cartão de estudo"
            }
          </p>
          <Button
            onClick={onCreateNew}
            className="hover:bg-primary/90 text-primary-foreground font-semibold bg-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Criar Primeiro Estudo
          </Button>
        </div>
      )}
    </>
  );
}
