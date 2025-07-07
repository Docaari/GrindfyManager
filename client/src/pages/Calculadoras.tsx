
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Calculadoras() {
  return (
    <div className="min-h-screen bg-poker-dark text-white">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-poker-gold mb-2">Calculadoras</h1>
          <p className="text-gray-400">Ferramentas de cálculo para poker</p>
        </div>

        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-poker-gold">Em Desenvolvimento</CardTitle>
            <CardDescription className="text-gray-400">
              Esta seção está sendo desenvolvida e estará disponível em breve.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🧮</div>
              <p className="text-lg text-gray-300 mb-4">
                Aqui você encontrará calculadoras para odds, pot odds, ICM, EV e outras ferramentas matemáticas essenciais.
              </p>
              <p className="text-sm text-gray-500">
                Funcionalidade em construção...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
