import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Plus, Video, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type StudyCard, PRIORITIES } from "./types";
import { getPriorityColor, formatTime } from "./utils";
import { StudyPlanningTab } from "./StudyPlanningTab";
import { StudyProgressTab } from "./StudyProgressTab";
import { AddMaterialForm } from "./AddMaterialForm";
import { MaterialCard } from "./MaterialCard";
import { AddNoteForm } from "./AddNoteForm";
import { NoteCard } from "./NoteCard";

interface StudyCardDetailProps {
  card: StudyCard;
  onClose: () => void;
}

export function StudyCardDetail({ card, onClose }: StudyCardDetailProps) {
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => apiRequest('DELETE', `/api/study-notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-notes', card.id] });
      toast({ title: "Anotação excluída" });
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (materialId: string) => apiRequest('DELETE', `/api/study-materials/${materialId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-materials', card.id] });
      toast({ title: "Material excluído" });
    },
  });

  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ['/api/study-materials', card.id],
  });

  const { data: notes = [] } = useQuery<any[]>({
    queryKey: ['/api/study-notes', card.id],
  });

  return (
    <div className="space-y-6">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle className="text-white flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-poker-accent" />
            {card.title}
          </DialogTitle>
          <Badge className={`${getPriorityColor(card.priority)} text-white`}>
            {PRIORITIES.find(p => p.value === card.priority)?.label}
          </Badge>
        </div>
        <DialogDescription className="text-gray-400">
          {card.description}
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-gray-800">
          <TabsTrigger value="overview" className="text-white">Visão Geral</TabsTrigger>
          <TabsTrigger value="materials" className="text-white">Materiais</TabsTrigger>
          <TabsTrigger value="notes" className="text-white">Anotações</TabsTrigger>
          <TabsTrigger value="planning" className="text-white">Planejamento</TabsTrigger>
          <TabsTrigger value="progress" className="text-white">Progresso</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Progresso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-poker-accent mb-2">
                  {card.knowledgeScore || 0}%
                </div>
                <Progress value={card.knowledgeScore || 0} className="h-2" />
              </CardContent>
            </Card>

            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Tempo Investido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {formatTime(card.timeInvested || 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {card.objectives && (
            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Objetivos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 whitespace-pre-wrap">{card.objectives}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Materiais de Estudo</h3>
            <Dialog open={showAddMaterial} onOpenChange={setShowAddMaterial}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Material
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Adicionar Material de Estudo</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Adicione links, arquivos ou aulas para organizar seus materiais de estudo
                  </DialogDescription>
                </DialogHeader>
                <AddMaterialForm studyCardId={card.id} onClose={() => setShowAddMaterial(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {materials.length > 0 ? (
            <div className="space-y-3">
              {materials.map((material: any) => (
                <MaterialCard key={material.id} material={material} onDelete={() => deleteMaterialMutation.mutate(material.id)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Video className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhum material adicionado ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Adicione aulas, artigos, vídeos ou arquivos para organizar seus estudos
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Anotações</h3>
            <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Anotação
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Nova Anotação</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Crie anotações para registrar insights e descobertas importantes
                  </DialogDescription>
                </DialogHeader>
                <AddNoteForm studyCardId={card.id} onClose={() => setShowAddNote(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {notes.length > 0 ? (
            <div className="space-y-3">
              {notes.map((note: any) => (
                <NoteCard key={note.id} note={note} onDelete={() => deleteNoteMutation.mutate(note.id)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhuma anotação criada ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Registre insights, descobertas e pontos importantes dos seus estudos
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="planning" className="space-y-4">
          <StudyPlanningTab card={card} />
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <StudyProgressTab card={card} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
