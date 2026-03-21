import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";
import { type StudyCard } from "./types";

interface StudySmartRecommendationsProps {
  studyCards: StudyCard[];
  onSelectCard: (card: StudyCard) => void;
}

export function StudySmartRecommendations({ studyCards, onSelectCard }: StudySmartRecommendationsProps) {
  const activeCards = studyCards
    .filter((card: StudyCard) => card.status === 'active')
    .sort((a: StudyCard, b: StudyCard) => {
      const priorityScore = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
      const aScore = (priorityScore[a.priority as keyof typeof priorityScore] || 0) * 100 - (a.knowledgeScore || 0) - (a.timeInvested || 0) / 60;
      const bScore = (priorityScore[b.priority as keyof typeof priorityScore] || 0) * 100 - (b.knowledgeScore || 0) - (b.timeInvested || 0) / 60;
      return bScore - aScore;
    })
    .slice(0, 3);

  if (activeCards.length === 0) return null;

  return (
    <Card className="bg-poker-surface border-gray-700 mb-6">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Brain className="w-5 h-5 text-poker-accent" />
          Recomendações Inteligentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activeCards.map((card: StudyCard, index: number) => (
            <div key={card.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-poker-accent/10 rounded-full flex items-center justify-center">
                  <span className="text-poker-accent text-sm font-bold">{index + 1}</span>
                </div>
                <div>
                  <p className="text-white font-medium">{card.title}</p>
                  <p className="text-gray-400 text-sm">
                    {card.category} • {card.knowledgeScore || 0}% progresso
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectCard(card)}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                Estudar
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
