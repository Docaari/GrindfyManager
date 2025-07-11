import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GrideCoach() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Gride Coach</CardTitle>
          <CardDescription className="text-gray-400">
            Sistema de coaching para otimização de performance
          </CardDescription>
        </CardHeader>
        <CardContent className="text-white">
          <p>Esta página está em desenvolvimento. Em breve teremos o sistema de coaching completo.</p>
        </CardContent>
      </Card>
    </div>
  );
}