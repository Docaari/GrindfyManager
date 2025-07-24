import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, AlertCircle, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import logoPath from '@assets/Imagem do WhatsApp de 2025-07-24 à(s) 14.09.18_16ebb75d_1753385463919.jpg';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

type LoginData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [accountLocked, setAccountLocked] = useState(false);
  const [lockRemainingTime, setLockRemainingTime] = useState<number>(0);
  const [resendTimer, setResendTimer] = useState<number>(0);
  const [isResending, setIsResending] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginData>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginData) => {
    setIsSubmitting(true);
    setRequiresVerification(false);
    setAccountLocked(false);
    
    try {
      const result = await login(data.email, data.password);
      
      if (result.success) {
        toast({
          title: "Sucesso!",
          description: "Login realizado com sucesso!",
        });
        setLocation('/home');
      } else {
        if (result.requiresVerification) {
          setRequiresVerification(true);
          setUserEmail(result.email || data.email);
          toast({
            title: "Email não verificado",
            description: result.error || "Sua conta ainda não foi confirmada. Verifique seu email (incluindo a pasta de spam) e clique no link de confirmação para ativar sua conta.",
            variant: "destructive",
          });
        } else if (result.locked) {
          setAccountLocked(true);
          setLockRemainingTime(result.remainingTime || 0);
          setUserEmail(data.email);
          toast({
            title: "Conta bloqueada",
            description: result.error || `Conta temporariamente bloqueada. Tente novamente em ${result.remainingTime} minutos.`,
            variant: "destructive",
          });
        } else {
          // Mensagens específicas baseadas no conteúdo do erro
          if (result.error?.includes('Credenciais inválidas') || result.error?.includes('incorret') || result.error?.includes('Senha incorreta')) {
            toast({
              title: "Credenciais incorretas",
              description: "Email ou senha incorretos. Verifique e tente novamente.",
              variant: "destructive",
            });
          } else if (result.error?.includes('bloqueada') || result.error?.includes('blocked')) {
            toast({
              title: "Conta bloqueada",
              description: result.error,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Erro no login",
              description: result.error || "Email ou senha incorretos. Verifique e tente novamente.",
              variant: "destructive",
            });
          }
        }
      }
    } catch (error) {
      toast({
        title: "Erro de conexão",
        description: "Erro de conexão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendTimer > 0 || isResending) return;
    
    setIsResending(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      
      if (response.ok) {
        toast({
          title: "Email enviado!",
          description: "Novo email de verificação enviado.",
        });
        // Iniciar timer de 60 segundos
        setResendTimer(60);
      } else {
        toast({
          title: "Erro",
          description: "Erro ao enviar email de verificação.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro de conexão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  // Timer countdown para reenvio de email
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [resendTimer]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] flex items-center justify-center p-4">
      {/* Background Pattern - similar to Dashboard */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00ff88]/5 to-transparent"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-[#00ff88]/3 to-transparent"></div>
      
      <div className="relative z-10 w-full max-w-md">
        {/* Logo Section - Large and Prominent */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img 
              src={logoPath} 
              alt="Grindfy Logo" 
              className="w-16 h-16 mr-4"
            />
            <h1 className="text-4xl font-bold">
              <span className="text-white">Grind</span>
              <span className="text-[#00ff88]">fy</span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg">Poker Tournament Tracker</p>
        </div>

        <Card className="bg-gray-800/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold text-white">
              Entrar na Plataforma
            </CardTitle>
            <CardDescription className="text-gray-300">
              Acesse sua conta para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
          {requiresVerification && (
            <Alert className="mb-6 bg-yellow-900/20 border-yellow-500">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-200">
                <div className="space-y-2">
                  <p>Sua conta ainda não foi verificada.</p>
                  <p className="text-sm">
                    Verifique seu email <strong>{userEmail}</strong> e clique no link de ativação.
                  </p>
                  <Button
                    onClick={handleResendVerification}
                    variant="outline"
                    size="sm"
                    disabled={resendTimer > 0 || isResending}
                    className="mt-2 bg-yellow-800 border-yellow-600 text-yellow-100 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Enviando...
                      </>
                    ) : resendTimer > 0 ? (
                      `Aguarde ${resendTimer}s`
                    ) : (
                      'Reenviar Email de Verificação'
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {accountLocked && (
            <Alert className="mb-6 bg-red-900/20 border-red-500">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-red-200">
                <div className="space-y-2">
                  <p className="font-medium">Conta temporariamente bloqueada</p>
                  <p className="text-sm">
                    Muitas tentativas de login incorretas foram detectadas para <strong>{userEmail}</strong>.
                  </p>
                  <p className="text-sm">
                    Tente novamente em <strong>{lockRemainingTime} minutos</strong>.
                  </p>
                  <p className="text-xs text-red-300 mt-2">
                    Esta medida de segurança protege sua conta contra acessos não autorizados.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 transition-colors"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white font-medium">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 pr-10 transition-colors"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-gray-700/50 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400 hover:text-white" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400 hover:text-white" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {/* Space for future features like "Remember me" */}
              </div>
              <Link 
                href="/forgot-password" 
                className="text-sm hover:text-[#00ff88] text-[#00ff88] transition-colors underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar na Plataforma'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Não tem uma conta?{' '}
              <Link href="/register" className="hover:text-[#00ff88] text-[#00ff88] transition-colors">
                Criar conta
              </Link>
            </p>
          </div>
          
          {/* Footer Info */}
          <div className="mt-4 text-center text-xs text-gray-500">
            <p>© 2025 Grindfy - Poker Tournament Tracker</p>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}