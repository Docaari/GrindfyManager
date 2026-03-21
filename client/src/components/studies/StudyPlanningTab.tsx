import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CalendarDays, Clock, RotateCcw, FileText } from "lucide-react";
import { type StudyCard } from "./types";
import { formatTime } from "./utils";

interface StudyPlanningTabProps {
  card: StudyCard;
}

export function StudyPlanningTab({ card }: StudyPlanningTabProps) {
  const getDayLabel = (dayKey: string) => {
    const dayLabels: { [key: string]: string } = {
      'monday': 'Segunda-feira',
      'tuesday': 'Terça-feira',
      'wednesday': 'Quarta-feira',
      'thursday': 'Quinta-feira',
      'friday': 'Sexta-feira',
      'saturday': 'Sábado',
      'sunday': 'Domingo'
    };
    return dayLabels[dayKey] || dayKey;
  };

  const hasPlanning = card.studyDays && card.studyDays.length > 0;

  if (!hasPlanning) {
    return (
      <div className="text-center py-8">
        <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">Nenhum planejamento semanal configurado</p>
        <p className="text-sm text-gray-500 mt-2">
          Configure um planejamento ao editar este cartão de estudo
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {/* Dias da Semana */}
        <Card className="bg-gray-800 border-gray-600">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Dias de Estudo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(card.studyDays ?? []).map((day) => (
                <Badge key={day} variant="secondary" className="text-poker-accent">
                  {getDayLabel(day)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Horário e Duração */}
        {(card.studyStartTime || card.studyDuration) && (
          <div className="grid grid-cols-2 gap-4">
            {card.studyStartTime && (
              <Card className="bg-gray-800 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Horário
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300">{card.studyStartTime}</p>
                </CardContent>
              </Card>
            )}

            {card.studyDuration && (
              <Card className="bg-gray-800 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Duração
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300">{formatTime(card.studyDuration)}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Recorrência */}
        {card.isRecurring && (
          <Card className="bg-gray-800 border-gray-600">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Estudo Recorrente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300">
                {card.weeklyFrequency ? `${card.weeklyFrequency}x por semana` : 'Sim'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Descrição */}
        {card.studyDescription && (
          <Card className="bg-gray-800 border-gray-600">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Descrição
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300">{card.studyDescription}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Informação para o futuro */}
      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          <h4 className="text-blue-400 font-medium">Calendário Inteligente</h4>
        </div>
        <p className="text-sm text-blue-300">
          Estas configurações serão utilizadas pelo futuro Calendário Inteligente para:
        </p>
        <ul className="text-sm text-blue-300 mt-2 space-y-1">
          <li>• Criar blocos automáticos de estudo</li>
          <li>• Respeitar seus horários preferidos</li>
          <li>• Evitar conflitos com torneios planejados</li>
        </ul>
      </div>
    </div>
  );
}
