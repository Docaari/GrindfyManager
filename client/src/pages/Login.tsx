import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { loginSchema, type LoginData } from '@shared/schema';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginData) => {
    setIsLoading(true);
    setNeedsVerification(false);
    
    try {
      const response = await apiRequest('POST', '/api/auth/login', data);
      
      if (response.ok) {
        const result = await response.json();
        
        // Store tokens in localStorage
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('refreshToken', result.refreshToken);
        
        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo de volta, ${result.user.name || result.user.email}!`,
        });
        
        // Redirect to dashboard
        setLocation('/dashboard');
      } else {
        const error = await response.json();
        
        if (error.requiresVerification) {
          setNeedsVerification(true);
          setVerificationEmail(error.email);
        } else {
          toast({
            title: "Erro no login",
            description: error.message || "Credenciais inválidas",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      const response = await apiRequest('POST', '/api/auth/resend-verification', {
        email: verificationEmail
      });
      
      if (response.ok) {
        toast({
          title: "Email reenviado!",
          description: "Verifique sua caixa de entrada para o novo email de verificação.",
        });
      } else {
        toast({
          title: "Erro ao reenviar email",
          description: "Tente novamente mais tarde.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro de conexão",
        description: "Não foi possível reenviar o email. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            Entrar no Grindfy
          </CardTitle>
          <CardDescription className="text-gray-300">
            Acesse sua conta e continue otimizando sua performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {needsVerification && (
            <Alert className="mb-6 bg-yellow-900/20 border-yellow-500/30">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-200">
                <div className="space-y-2">
                  <p>Sua conta precisa ser verificada antes do login.</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleResendVerification}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500"
                  >
                    Reenviar Email de Verificação
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="seu@email.com"
                          className="pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Sua senha"
                          className="pl-10 pr-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between">
                <div></div>
                <Link href="/forgot-password" className="text-sm text-red-400 hover:text-red-300">
                  Esqueceu a senha?
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Entrando...
                  </div>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Não tem uma conta?{' '}
              <Link href="/register" className="text-red-400 hover:text-red-300 font-medium">
                Criar conta
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}