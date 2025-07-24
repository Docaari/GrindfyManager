import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Loader2, Mail, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import logoPath from '@assets/Imagem do WhatsApp de 2025-07-24 à(s) 14.09.18_16ebb75d_1753385463919.jpg';

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

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#1a1a1a] relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[#2a2a2a] opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 80% 20%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)`
          }} />
        </div>

        <div className="relative min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            {/* Header with Logo */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-6">
                <img 
                  src={logoPath} 
                  alt="Grindfy Logo" 
                  className="w-12 h-12 object-contain"
                />
                <div className="text-3xl font-bold">
                  <span className="text-white">Grind</span>
                  <span className="text-[#00ff88]">fy</span>
                </div>
              </div>
              <div className="h-0.5 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
            </div>

            {/* Loading Card */}
            <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-[#00ff88]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-[#00ff88]" />
                </div>
                <CardTitle className="text-2xl font-bold text-white mb-2">
                  Verificação de Email
                </CardTitle>
                <p className="text-gray-300">
                  Verificando seu email...
                </p>
              </CardHeader>

              <CardContent className="text-center space-y-6">
                <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-gray-300">Processando verificação...</p>

                {/* Footer Info */}
                <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/50">
                  <p>© 2025 Grindfy - Poker Tournament Tracker</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-[#1a1a1a] relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[#2a2a2a] opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 80% 20%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)`
          }} />
        </div>

        <div className="relative min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            {/* Header with Logo */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-6">
                <img 
                  src={logoPath} 
                  alt="Grindfy Logo" 
                  className="w-12 h-12 object-contain"
                />
                <div className="text-3xl font-bold">
                  <span className="text-white">Grind</span>
                  <span className="text-[#00ff88]">fy</span>
                </div>
              </div>
              <div className="h-0.5 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
            </div>

            {/* Success Card */}
            <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-[#00ff88]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-[#00ff88]" />
                </div>
                <CardTitle className="text-2xl font-bold text-white mb-2">
                  Email Verificado!
                </CardTitle>
                <p className="text-gray-300">
                  {message}
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="p-3 bg-[#00ff88]/10 border border-[#00ff88]/20 rounded-lg">
                  <p className="text-sm text-[#00ff88] text-center">
                    Redirecionando para a página inicial...
                  </p>
                </div>

                {/* Footer Info */}
                <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/50">
                  <p>© 2025 Grindfy - Poker Tournament Tracker</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-[#1a1a1a] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[#2a2a2a] opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 80% 20%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)`
        }} />
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Header with Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <img 
                src={logoPath} 
                alt="Grindfy Logo" 
                className="w-12 h-12 object-contain"
              />
              <div className="text-3xl font-bold">
                <span className="text-white">Grind</span>
                <span className="text-[#00ff88]">fy</span>
              </div>
            </div>
            <div className="h-0.5 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
          </div>

          {/* Error Card */}
          <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-2">
                Verificação Falhou
              </CardTitle>
              <p className="text-gray-300">
                {message}
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-300 text-center">
                  {message.includes('já foi verificado') 
                    ? 'Sua conta já está ativa. Faça login para continuar.'
                    : 'Link de verificação expirado. Crie uma nova conta ou entre em contato conosco.'
                  }
                </p>
              </div>

              <Link href="/login">
                <Button className="w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-semibold h-12 
                                   transition-all duration-200 shadow-lg hover:shadow-[#00ff88]/25">
                  <Mail className="w-4 h-4 mr-2" />
                  Ir para Login
                </Button>
              </Link>
              
              <Link href="/register">
                <Button 
                  variant="outline" 
                  className="w-full bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700/50 hover:border-[#00ff88] transition-all duration-200"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Criar Nova Conta
                </Button>
              </Link>

              {/* Additional Help */}
              <div className="text-center">
                <p className="text-gray-400 text-sm">
                  Problemas com verificação?{' '}
                  <Link href="/forgot-password" className="hover:text-[#00ff88] text-[#00ff88] transition-colors underline-offset-4 hover:underline">
                    Recuperar conta
                  </Link>
                </p>
              </div>

              {/* Footer Info */}
              <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/50">
                <p>© 2025 Grindfy - Poker Tournament Tracker</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmailPage;