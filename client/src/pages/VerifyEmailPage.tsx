import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get token from URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (!token) {
          setStatus('error');
          setMessage('Link de verificação inválido ou expirado.');
          return;
        }

        // Verify email
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage('Email verificado com sucesso! Bem-vindo ao Grindfy.');

          // Check if auto-login data is provided
          if (data.autoLogin && data.accessToken) {
            // Store tokens for auto-login
            localStorage.setItem('grindfy_access_token', data.accessToken);
            localStorage.setItem('grindfy_refresh_token', data.refreshToken);
            localStorage.setItem('grindfy_user_data', JSON.stringify(data.user));

            // Redirect to home after a short delay
            setTimeout(() => {
              setLocation('/home');
            }, 2000);
          }
        } else {
          setStatus('error');
          if (data.message?.includes('já foi verificado') || data.message?.includes('already verified')) {
            setMessage('Email já foi verificado. Você será redirecionado.');
          } else {
            setMessage('Link de verificação inválido ou expirado.');
          }
        }
      } catch (error) {
        setStatus('error');
        setMessage('Erro de conexão. Tente novamente.');
      }
    };

    verifyEmail();
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            Verificação de Email
          </CardTitle>
          <CardDescription className="text-gray-400">
            Verificando seu email...
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto" style={{ color: '#00ff88' }} />
              <p className="text-gray-300">Verificando seu email...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <Alert className="bg-green-900/20 border-green-600 text-green-100">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {message}
                </AlertDescription>
              </Alert>
              <p className="text-gray-300 text-sm">
                Redirecionando para a página inicial...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <Alert className="bg-red-900/20 border-red-600 text-red-100">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {message}
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Button 
                  onClick={() => setLocation('/login')}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  Ir para Login
                </Button>
                <Button 
                  onClick={() => setLocation('/register')}
                  variant="outline"
                  className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  Criar Nova Conta
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default VerifyEmailPage;