import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RegistrationConfirmationPageProps {
  email?: string;
}

export function RegistrationConfirmationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState<string>('');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    
    // Get email from URL params or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    const storedEmail = localStorage.getItem('grindfy_registration_email');
    
    
    if (emailParam) {
      setEmail(emailParam);
      localStorage.setItem('grindfy_registration_email', emailParam);
    } else if (storedEmail) {
      setEmail(storedEmail);
    } else {
      // If no email found, redirect to register
      setLocation('/register');
    }
  }, [setLocation]);

  const handleResendEmail = async () => {
    if (!email) return;
    
    setIsResending(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Email reenviado com sucesso",
          description: "Verifique sua caixa de entrada em alguns minutos.",
        });
      } else {
        toast({
          title: "Erro ao reenviar email",
          description: data.message || "Tente novamente em alguns minutos.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro de conexão",
        description: "Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    localStorage.removeItem('grindfy_registration_email');
    setLocation('/login');
  };

  if (!email) {
    return null; // Loading state while checking email
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            Registro Realizado com Sucesso!
          </CardTitle>
          <CardDescription className="text-gray-400">
            Sua conta foi criada, agora precisa ser verificada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email verification info */}
          <Alert className="bg-blue-900/20 border-blue-600 text-blue-100">
            <Mail className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">📧 Email de verificação enviado para:</p>
                <p className="text-blue-300 font-mono text-sm break-all">{email}</p>
              </div>
            </AlertDescription>
          </Alert>

          {/* Instructions */}
          <div className="space-y-4 text-gray-300">
            <p>
              Por favor, verifique sua caixa de entrada e clique no link de verificação 
              para ativar sua conta e fazer login automaticamente.
            </p>
            
            <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center space-x-2 text-yellow-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">Informações importantes:</span>
              </div>
              <ul className="text-sm text-gray-400 space-y-1 ml-6">
                <li>• O link de verificação expira em 24 horas</li>
                <li>• Verifique também a pasta de spam/lixo eletrônico</li>
                <li>• Após verificar, você será automaticamente logado</li>
                <li>• Novos usuários começam com plano "Básico"</li>
              </ul>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <Button 
              onClick={handleResendEmail}
              disabled={isResending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Reenviando...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Reenviar Email de Verificação
                </>
              )}
            </Button>
            
            <Button 
              onClick={handleBackToLogin}
              variant="outline"
              className="w-full border-gray-600 hover:bg-gray-800 bg-[#22c55e] text-[#ffffff]"
            >
              Voltar para Login
            </Button>
          </div>

          {/* Help text */}
          <div className="text-center text-xs text-gray-500">
            <p>
              Não recebeu o email? Verifique se o endereço está correto e 
              aguarde alguns minutos antes de tentar reenviar.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RegistrationConfirmationPage;